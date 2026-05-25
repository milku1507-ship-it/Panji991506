import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, CheckCircle2, RefreshCw, Zap, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Product, Ingredient } from '../types';
import { formatCurrency } from '../lib/formatUtils';

export type QuickEntryFields = {
  tanggal: string;
  jenis: 'Pemasukan' | 'Pengeluaran';
  kategori: string;
  keterangan: string;
  nominal: number;
  qty_beli: number;
  penjualan_detail?: {
    produk_id: string;
    produk_nama: string;
    varian: { varian_id: string; varian_nama: string; qty: number }[];
  }[];
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: Product[];
  ingredients: Ingredient[];
  categories: { name: string; type: 'Pemasukan' | 'Pengeluaran' }[];
  onSaveBatch: (list: QuickEntryFields[]) => Promise<{ saved: number; failed: number }>;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseNominal(token: string): number | null {
  const s = token.toLowerCase().replace(/[rp.\s]/g, '');
  const match = s.match(/^([\d]+(?:[,.][\d]+)?)(rb|ribu|k|jt|juta|m|miliar)?$/);
  if (!match) return null;
  const num = parseFloat(match[1].replace(',', '.'));
  const suffix = match[2] || '';
  if (suffix === 'rb' || suffix === 'ribu' || suffix === 'k') return Math.round(num * 1000);
  if (suffix === 'jt' || suffix === 'juta') return Math.round(num * 1000000);
  if (suffix === 'm' || suffix === 'miliar') return Math.round(num * 1000000000);
  return Math.round(num);
}

function parseQty(token: string): { qty: number; unit: string } | null {
  const match = token.match(/^([\d]+(?:[.,][\d]+)?)\s*(kg|gram|gr|g|ons|liter|lt|l|ml|pcs|biji|buah|paket|pak|lembar|unit|porsi|bungkus|botol|kaleng|sak|bal|lusin|kodi|roll|meter|m|cm)?$/i);
  if (!match) return null;
  const qty = parseFloat(match[1].replace(',', '.'));
  const unit = (match[2] || 'pcs').toLowerCase();
  return { qty, unit };
}

const JUAL_KEYWORDS = ['jual', 'jualin', 'jualan', 'penjualan', 'selling', 'sold'];
const BELI_KEYWORDS = ['beli', 'belin', 'beliin', 'beli-beli', 'pembelian', 'bayar', 'bayarin'];
const CATEGORY_KEYWORDS: Record<string, { jenis: 'Pengeluaran' | 'Pemasukan'; kategori: string }> = {
  gaji: { jenis: 'Pengeluaran', kategori: 'Gaji' },
  upah: { jenis: 'Pengeluaran', kategori: 'Gaji' },
  karyawan: { jenis: 'Pengeluaran', kategori: 'Gaji' },
  listrik: { jenis: 'Pengeluaran', kategori: 'Operasional' },
  air: { jenis: 'Pengeluaran', kategori: 'Operasional' },
  gas: { jenis: 'Pengeluaran', kategori: 'Operasional' },
  operasional: { jenis: 'Pengeluaran', kategori: 'Operasional' },
  transportasi: { jenis: 'Pengeluaran', kategori: 'Operasional' },
  bensin: { jenis: 'Pengeluaran', kategori: 'Operasional' },
  tabungan: { jenis: 'Pengeluaran', kategori: 'Tabungan' },
  nabung: { jenis: 'Pengeluaran', kategori: 'Tabungan' },
  iklan: { jenis: 'Pengeluaran', kategori: 'Biaya Iklan' },
  promosi: { jenis: 'Pengeluaran', kategori: 'Biaya Iklan' },
  ads: { jenis: 'Pengeluaran', kategori: 'Biaya Iklan' },
  saldo: { jenis: 'Pemasukan', kategori: 'Saldo sisa' },
  modal: { jenis: 'Pemasukan', kategori: 'Saldo sisa' },
  packing: { jenis: 'Pengeluaran', kategori: 'Packing' },
  kemasan: { jenis: 'Pengeluaran', kategori: 'Packing' },
};

function parseLine(
  raw: string,
  ingredients: Ingredient[],
  products: Product[],
  categories: { name: string; type: 'Pemasukan' | 'Pengeluaran' }[],
  today: string,
): QuickEntryFields | null {
  const line = raw.trim();
  if (!line) return null;

  const tokens = line.split(/\s+/);
  if (tokens.length === 0) return null;

  let jenis: 'Pemasukan' | 'Pengeluaran' = 'Pengeluaran';
  let kategori = 'Lainnya';
  let nominal = 0;
  let qty_beli = 0;
  const descTokens: string[] = [];
  let penjualan_detail: QuickEntryFields['penjualan_detail'] = undefined;

  // Check first token for action keyword
  const firstLower = tokens[0].toLowerCase();
  let startIdx = 0;

  if (JUAL_KEYWORDS.some(k => firstLower === k || firstLower.startsWith(k))) {
    jenis = 'Pemasukan';
    kategori = 'Penjualan';
    startIdx = 1;
  } else if (BELI_KEYWORDS.some(k => firstLower === k || firstLower.startsWith(k))) {
    jenis = 'Pengeluaran';
    startIdx = 1;
  }

  // Check category keywords in whole line
  const lineLower = line.toLowerCase();
  for (const [kw, meta] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lineLower.includes(kw)) {
      jenis = meta.jenis;
      kategori = meta.kategori;
      break;
    }
  }

  // Now scan remaining tokens for nominal and qty
  const remainingTokens = tokens.slice(startIdx);
  for (const token of remainingTokens) {
    const nom = parseNominal(token);
    if (nom !== null && nom > 0) {
      nominal = nom;
      continue;
    }
    const qtyParsed = parseQty(token);
    if (qtyParsed && qty_beli === 0) {
      qty_beli = qtyParsed.qty;
      continue;
    }
    // Otherwise it's part of the description
    descTokens.push(token);
  }

  // Keterangan from description tokens
  const keterangan = descTokens.join(' ').trim() || line;

  // Try to match ingredient → detect HPP category
  if (jenis === 'Pengeluaran' && kategori === 'Lainnya') {
    const normalizedDesc = keterangan.toLowerCase().trim();
    const matched = ingredients.find(i => {
      const iName = i.name.toLowerCase().trim();
      return normalizedDesc.includes(iName) || iName.includes(normalizedDesc.split(' ')[0]);
    });
    if (matched && matched.category) {
      kategori = matched.category;
      // Auto-fill nominal from price * qty if not provided
      if (nominal === 0 && qty_beli > 0) {
        nominal = matched.price * qty_beli;
      }
    } else {
      // Check if any category keyword from settings is in the description
      const matchedCat = categories.find(c =>
        c.type === 'Pengeluaran' && normalizedDesc.includes(c.name.toLowerCase())
      );
      if (matchedCat) kategori = matchedCat.name;
    }
  }

  // Try to match product → penjualan_detail
  if (jenis === 'Pemasukan' && kategori === 'Penjualan') {
    const normalizedDesc = keterangan.toLowerCase().trim();

    for (const prod of products) {
      const prodNama = prod.nama.toLowerCase();
      if (!normalizedDesc.includes(prodNama)) continue;

      // Try to find a variant match
      const varianMatches: { varian_id: string; varian_nama: string; qty: number }[] = [];
      for (const v of prod.varian) {
        const vNama = v.nama.toLowerCase();
        if (normalizedDesc.includes(vNama)) {
          varianMatches.push({ varian_id: v.id, varian_nama: v.nama, qty: qty_beli || 1 });
        }
      }

      if (varianMatches.length > 0) {
        penjualan_detail = [{ produk_id: prod.id, produk_nama: prod.nama, varian: varianMatches }];
        // Auto nominal from harga_jual if not set
        if (nominal === 0) {
          nominal = varianMatches.reduce((sum, v) => {
            const variant = prod.varian.find(pv => pv.id === v.varian_id);
            return sum + (variant?.harga_jual || 0) * v.qty;
          }, 0);
        }
      }
      break;
    }
  }

  return {
    tanggal: today,
    jenis,
    kategori,
    keterangan: keterangan.charAt(0).toUpperCase() + keterangan.slice(1),
    nominal,
    qty_beli,
    penjualan_detail,
  };
}

function parseAll(
  text: string,
  ingredients: Ingredient[],
  products: Product[],
  categories: { name: string; type: 'Pemasukan' | 'Pengeluaran' }[],
  today: string,
): { raw: string; parsed: QuickEntryFields | null }[] {
  // Split by newline or semicolon; preserve comma only inside non-numeric context
  const lines = text.split(/\n|;/).flatMap(l => {
    // If line has multiple comma-separated entries (heuristic: more than 1 amount)
    const parts = l.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length > 1 && parts.every(p => /\d/.test(p))) return parts;
    return [l.trim()];
  }).filter(Boolean);

  return lines.map(raw => ({ raw, parsed: parseLine(raw, ingredients, products, categories, today) }));
}

// ─── Preview Card ─────────────────────────────────────────────────────────────

function PreviewCard({ fields, raw, onRemove }: { fields: QuickEntryFields; raw: string; onRemove: () => void }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-3 space-y-1.5 relative">
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
      <div className="flex items-center gap-2 pr-6">
        <span className={cn(
          'text-[10px] font-black px-2 py-0.5 rounded-full',
          fields.jenis === 'Pemasukan' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        )}>{fields.jenis}</span>
        <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{fields.kategori}</span>
      </div>
      <div className="text-xs space-y-0.5 text-[#1A1A2E]">
        <div className="flex justify-between gap-2">
          <span className="text-gray-400 shrink-0">Keterangan</span>
          <span className="font-bold text-right">{fields.keterangan}</span>
        </div>
        {fields.qty_beli > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-400">Qty</span>
            <span className="font-bold">{fields.qty_beli}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-400">Nominal</span>
          <span className={cn('font-black', fields.nominal > 0 ? 'text-primary' : 'text-orange-500')}>
            {fields.nominal > 0 ? formatCurrency(fields.nominal, true) : '⚠ Belum diisi'}
          </span>
        </div>
        {fields.penjualan_detail && fields.penjualan_detail.length > 0 && (
          <div className="pt-1 border-t border-dashed border-gray-100">
            <p className="text-[10px] font-black uppercase text-gray-400 mb-0.5">Detail Penjualan</p>
            {fields.penjualan_detail.map((pd, i) => (
              <div key={i} className="text-[11px]">
                <span className="font-bold">{pd.produk_nama}</span>
                {pd.varian.map((v, j) => (
                  <span key={j} className="text-gray-500"> — {v.varian_nama} {v.qty}pcs</span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function QuickEntryDialog({ open, onOpenChange, products, ingredients, categories, onSaveBatch }: Props) {
  const [input, setInput] = React.useState('');
  const [entries, setEntries] = React.useState<{ raw: string; parsed: QuickEntryFields }[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [step, setStep] = React.useState<'input' | 'preview'>('input');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (open) {
      setInput('');
      setEntries([]);
      setStep('input');
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  const handleParse = () => {
    const today = new Date().toISOString().split('T')[0];
    const results = parseAll(input, ingredients, products, categories, today);
    const valid = results.filter(r => r.parsed !== null) as { raw: string; parsed: QuickEntryFields }[];
    if (valid.length === 0) return;
    setEntries(valid);
    setStep('preview');
  };

  const removeEntry = (idx: number) => {
    const next = entries.filter((_, i) => i !== idx);
    if (next.length === 0) setStep('input');
    else setEntries(next);
  };

  const handleSave = async () => {
    if (entries.length === 0) return;
    setSaving(true);
    try {
      await onSaveBatch(entries.map(e => e.parsed));
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleParse();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-[2rem] max-h-[90dvh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white shadow-md">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black">Input Cepat</DialogTitle>
              <DialogDescription className="text-xs font-medium">Ketik transaksi singkat, sistem otomatis parsing</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {step === 'input' && (
            <div className="space-y-3">
              <div className="bg-orange-50 border border-orange-100 rounded-2xl p-3 space-y-1.5 text-xs text-gray-600">
                <p className="font-black text-orange-700 text-[11px] uppercase tracking-widest">Contoh format</p>
                <div className="space-y-1 font-medium">
                  <p>• <span className="font-black text-gray-800">beli tapioka 25kg 210000</span> → Pengeluaran Bahan Baku</p>
                  <p>• <span className="font-black text-gray-800">jual cireng ori 50pcs 250000</span> → Pemasukan Penjualan</p>
                  <p>• <span className="font-black text-gray-800">gaji karyawan 500rb</span> → Pengeluaran Gaji</p>
                  <p>• <span className="font-black text-gray-800">listrik 150rb</span> → Pengeluaran Operasional</p>
                  <p>• <span className="font-black text-gray-800">tabungan 200rb</span> → Pengeluaran Tabungan</p>
                </div>
                <p className="text-[10px] text-gray-400 pt-1">Satu baris = satu transaksi. Pisahkan dengan Enter atau titik koma (;).</p>
              </div>

              <Textarea
                ref={textareaRef}
                placeholder={"beli tapioka 25kg 210000\njual cireng ori 50pcs\ngaji karyawan 500rb"}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={5}
                className="rounded-2xl border-gray-200 resize-none font-medium text-sm"
              />
              <p className="text-[10px] text-gray-400 text-center">Tekan <kbd className="px-1.5 py-0.5 bg-gray-100 rounded font-mono text-[9px]">Ctrl+Enter</kbd> atau klik tombol di bawah</p>

              <Button
                onClick={handleParse}
                disabled={!input.trim()}
                className="w-full rounded-2xl font-bold h-12 bg-gradient-to-br from-orange-400 to-red-500 text-white border-none gap-2"
              >
                <Zap className="w-4 h-4" />
                Parsing Otomatis
              </Button>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                  {entries.length} Transaksi Terdeteksi
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep('input')}
                  className="rounded-xl gap-1.5 text-xs font-bold text-gray-500 h-7"
                >
                  <RefreshCw className="w-3 h-3" /> Edit
                </Button>
              </div>

              <div className="space-y-2">
                {entries.map((e, i) => (
                  <PreviewCard
                    key={i}
                    fields={e.parsed}
                    raw={e.raw}
                    onRemove={() => removeEntry(i)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {step === 'preview' && entries.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 bg-white">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-2xl font-bold h-12 bg-gradient-to-br from-orange-400 to-red-500 text-white border-none gap-2"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                : <><CheckCircle2 className="w-4 h-4" /> Simpan {entries.length} Transaksi</>
              }
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
