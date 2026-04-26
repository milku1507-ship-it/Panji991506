import React from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Trash2, ArrowLeft, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Ingredient } from '../types';
import { formatCurrency } from '../lib/formatUtils';
import { cn } from '@/lib/utils';

export type ParsedBahan = {
  nama: string;
  kelompok: string;
  qty: number;
  satuan: string;
  harga_per_satuan: number;
};

export type ParsedHppResult = {
  variant: {
    nama_varian: string;
    qty_batch?: number;
    harga_jual?: number;
    harga_packing?: number;
  };
  bahan: ParsedBahan[];
  notes?: string;
};

interface PasteHppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  kategoriHpp: string[];
  ingredients: Ingredient[];
  onConfirm: (data: ParsedHppResult) => Promise<void> | void;
}

const EXAMPLE_PLACEHOLDER = `Contoh:
Nama Varian: Ayam Suwir Pedas
Qty/Batch (pcs): 256
Harga Jual/pcs: 14998
Packing/pack: 86

1. Kulit Cireng
Tapioka: 2500 gram × Harga 10 = Rp 25.000
Terigu: 150 gram × Harga 10 = Rp 1.500
...

2. Isian
Ayam: 1000 gram × Harga 34 = Rp 34.000
...`;

export default function PasteHppDialog({
  open,
  onOpenChange,
  productName,
  kategoriHpp,
  ingredients,
  onConfirm,
}: PasteHppDialogProps) {
  const [step, setStep] = React.useState<'input' | 'preview'>('input');
  const [rawText, setRawText] = React.useState('');
  const [isParsing, setIsParsing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [parsed, setParsed] = React.useState<ParsedHppResult | null>(null);

  React.useEffect(() => {
    if (!open) {
      setStep('input');
      setRawText('');
      setParsed(null);
      setIsParsing(false);
      setIsSaving(false);
    }
  }, [open]);

  const handleParse = async () => {
    if (!rawText.trim()) {
      toast.error('Tempel teks HPP dulu ya');
      return;
    }
    setIsParsing(true);
    try {
      const res = await fetch('/api/parse-hpp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText,
          kategoriHpp,
          existingIngredients: ingredients.slice(0, 200).map(i => ({
            name: i.name,
            unit: i.unit,
            price: i.price,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ParsedHppResult;
      if (!data.variant || !Array.isArray(data.bahan)) {
        throw new Error('Format hasil AI tidak valid.');
      }
      setParsed(data);
      setStep('preview');
    } catch (e: any) {
      console.error('[PasteHppDialog] parse error:', e);
      toast.error(e?.message || 'Gagal mem-parse teks HPP');
    } finally {
      setIsParsing(false);
    }
  };

  const updateVariantField = (
    field: keyof ParsedHppResult['variant'],
    value: string | number
  ) => {
    if (!parsed) return;
    setParsed({
      ...parsed,
      variant: { ...parsed.variant, [field]: value },
    });
  };

  const updateBahanField = (
    idx: number,
    field: keyof ParsedBahan,
    value: string | number
  ) => {
    if (!parsed) return;
    const next = [...parsed.bahan];
    next[idx] = { ...next[idx], [field]: value } as ParsedBahan;
    setParsed({ ...parsed, bahan: next });
  };

  const removeBahan = (idx: number) => {
    if (!parsed) return;
    setParsed({ ...parsed, bahan: parsed.bahan.filter((_, i) => i !== idx) });
  };

  const handleConfirm = async () => {
    if (!parsed) return;
    if (!parsed.variant.nama_varian?.trim()) {
      toast.error('Nama varian belum diisi');
      return;
    }
    setIsSaving(true);
    try {
      await onConfirm(parsed);
      onOpenChange(false);
    } catch (e: any) {
      console.error('[PasteHppDialog] confirm error:', e);
      toast.error(e?.message || 'Gagal menyimpan');
    } finally {
      setIsSaving(false);
    }
  };

  const totalPerBatch = React.useMemo(() => {
    if (!parsed) return 0;
    return parsed.bahan.reduce(
      (acc, b) => acc + (Number(b.qty) || 0) * (Number(b.harga_per_satuan) || 0),
      0
    );
  }, [parsed]);

  const groupedBahan = React.useMemo(() => {
    if (!parsed) return new Map<string, { idx: number; b: ParsedBahan }[]>();
    const order = [...kategoriHpp, 'Lainnya'];
    const groups = new Map<string, { idx: number; b: ParsedBahan }[]>();
    parsed.bahan.forEach((b, idx) => {
      const key = order.includes(b.kelompok) ? b.kelompok : 'Lainnya';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ idx, b });
    });
    // Return in defined order
    const ordered = new Map<string, { idx: number; b: ParsedBahan }[]>();
    for (const k of order) {
      if (groups.has(k)) ordered.set(k, groups.get(k)!);
    }
    // Add any remaining (shouldn't happen, defensive)
    for (const [k, v] of groups) {
      if (!ordered.has(k)) ordered.set(k, v);
    }
    return ordered;
  }, [parsed, kategoriHpp]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[2rem] border-none max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Paste Otomatis HPP
          </DialogTitle>
          <DialogDescription>
            {step === 'input'
              ? `Tempel detail varian + bahan baku, AI akan mengisi semua untuk produk ${productName}.`
              : 'Periksa hasil parsing. Edit jika perlu, lalu konfirmasi untuk menyimpan.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'input' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="font-bold">Teks HPP</Label>
              <Textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={EXAMPLE_PLACEHOLDER}
                className="rounded-xl border-gray-200 min-h-[280px] font-mono text-xs leading-relaxed"
                disabled={isParsing}
              />
              <p className="text-[11px] text-gray-400 font-medium">
                Tip: Sertakan baris seperti <span className="font-bold">"Nama Varian:"</span>,{' '}
                <span className="font-bold">"Qty/Batch:"</span>,{' '}
                <span className="font-bold">"Harga Jual/pcs:"</span>, dan{' '}
                <span className="font-bold">"Packing/pack:"</span> di atas, lalu daftar bahan
                dipisah per kelompok bernomor.
              </p>
            </div>

            <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row gap-3">
              <DialogClose
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-xl font-bold w-full sm:w-auto h-12"
                    disabled={isParsing}
                  >
                    Batal
                  </Button>
                }
              />
              <Button
                type="button"
                onClick={handleParse}
                disabled={isParsing || !rawText.trim()}
                className="orange-gradient text-white rounded-xl font-bold w-full sm:w-auto h-12 px-8 shadow-lg shadow-brand-100 active:scale-95 transition-all gap-2"
              >
                {isParsing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Memproses…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Parse dengan AI
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'preview' && parsed && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-brand-50/40 rounded-2xl border border-brand-100">
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Nama Varian
                </Label>
                <Input
                  value={parsed.variant.nama_varian || ''}
                  onChange={(e) => updateVariantField('nama_varian', e.target.value)}
                  className="rounded-xl h-10 font-bold bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Qty / Batch
                </Label>
                <Input
                  type="number"
                  value={parsed.variant.qty_batch ?? 0}
                  onChange={(e) =>
                    updateVariantField('qty_batch', parseInt(e.target.value) || 0)
                  }
                  className="rounded-xl h-10 bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Harga Jual / pcs
                </Label>
                <Input
                  type="number"
                  value={parsed.variant.harga_jual ?? 0}
                  onChange={(e) =>
                    updateVariantField('harga_jual', parseInt(e.target.value) || 0)
                  }
                  className="rounded-xl h-10 bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Packing / pack
                </Label>
                <Input
                  type="number"
                  value={parsed.variant.harga_packing ?? 0}
                  onChange={(e) =>
                    updateVariantField('harga_packing', parseInt(e.target.value) || 0)
                  }
                  className="rounded-xl h-10 bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-sm font-bold text-gray-700">
                Bahan Baku ({parsed.bahan.length})
              </p>
              <p className="text-sm font-black text-primary">
                Total / batch: {formatCurrency(Math.round(totalPerBatch), true)}
              </p>
            </div>

            <div className="space-y-4 max-h-[40dvh] overflow-y-auto pr-1 no-scrollbar">
              {[...groupedBahan.entries()].map(([cat, items]) => (
                <div key={cat} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-brand-50 border-brand-200 text-primary font-black text-[10px] px-3 py-1 rounded-full uppercase tracking-widest border">
                      {cat}
                    </Badge>
                    <div className="h-px flex-1 bg-gray-100" />
                  </div>
                  <div className="space-y-2">
                    {items.map(({ idx, b }) => {
                      const subtotal =
                        (Number(b.qty) || 0) * (Number(b.harga_per_satuan) || 0);
                      return (
                        <div
                          key={idx}
                          className="bg-white border border-gray-100 rounded-2xl p-3 space-y-2"
                        >
                          <div className="flex items-start gap-2">
                            <Input
                              value={b.nama}
                              onChange={(e) => updateBahanField(idx, 'nama', e.target.value)}
                              className="rounded-lg h-9 font-bold flex-1 border-gray-200"
                              placeholder="Nama bahan"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 shrink-0"
                              onClick={() => removeBahan(idx)}
                              title="Hapus bahan"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <Input
                              type="number"
                              step="0.0001"
                              value={b.qty}
                              onChange={(e) =>
                                updateBahanField(idx, 'qty', parseFloat(e.target.value) || 0)
                              }
                              className="rounded-lg h-9 text-xs border-gray-200"
                              placeholder="Qty"
                            />
                            <select
                              value={b.satuan}
                              onChange={(e) => updateBahanField(idx, 'satuan', e.target.value)}
                              className="h-9 text-xs rounded-lg border border-gray-200 bg-white px-2 focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              {['gram', 'kg', 'ml', 'liter', 'pcs', 'paket', 'lembar', 'pack', 'box'].includes(
                                b.satuan?.toLowerCase()
                              ) ? null : (
                                <option value={b.satuan}>{b.satuan}</option>
                              )}
                              <option value="gram">gram</option>
                              <option value="kg">kg</option>
                              <option value="ml">ml</option>
                              <option value="liter">liter</option>
                              <option value="pcs">pcs</option>
                              <option value="paket">paket</option>
                              <option value="lembar">lembar</option>
                              <option value="pack">pack</option>
                              <option value="box">box</option>
                            </select>
                            <Input
                              type="number"
                              step="0.01"
                              value={b.harga_per_satuan}
                              onChange={(e) =>
                                updateBahanField(
                                  idx,
                                  'harga_per_satuan',
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="rounded-lg h-9 text-xs border-gray-200"
                              placeholder="Harga/sat"
                            />
                            <select
                              value={b.kelompok}
                              onChange={(e) =>
                                updateBahanField(idx, 'kelompok', e.target.value)
                              }
                              className="h-9 text-xs rounded-lg border border-gray-200 bg-white px-2 focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              {kategoriHpp.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                              {!kategoriHpp.includes(b.kelompok) && b.kelompok && (
                                <option value={b.kelompok}>{b.kelompok}</option>
                              )}
                              <option value="Lainnya">Lainnya</option>
                            </select>
                          </div>
                          <div className="text-right">
                            <span className="text-[11px] font-bold text-gray-400">
                              Subtotal:{' '}
                              <span className="text-primary">
                                {formatCurrency(Math.round(subtotal), true)}
                              </span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {parsed.bahan.length === 0 && (
                <div
                  className={cn(
                    'text-center py-8 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-100'
                  )}
                >
                  <p className="text-gray-400 font-bold text-sm">
                    Tidak ada bahan baku ter-parse.
                  </p>
                </div>
              )}
            </div>

            {parsed.notes && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3">
                <p className="text-[11px] font-bold text-amber-800 mb-0.5">Catatan AI</p>
                <p className="text-xs text-amber-700 leading-relaxed">{parsed.notes}</p>
              </div>
            )}

            <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep('input')}
                disabled={isSaving}
                className="rounded-xl font-bold w-full sm:w-auto h-12 gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Edit Teks
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={isSaving || parsed.bahan.length === 0}
                className="bg-primary hover:bg-primary/90 text-white rounded-xl font-bold w-full sm:w-auto h-12 px-8 shadow-lg shadow-brand-100 active:scale-95 transition-all gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan…
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Konfirmasi & Simpan
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
