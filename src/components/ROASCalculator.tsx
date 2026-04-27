import React from 'react';
import { Product, Variant, Ingredient, HppMaterial } from '../types';
import { formatCurrency } from '../lib/formatUtils';
import { getBaseUnit, getConversionRate, toBaseValue } from '../lib/unitUtils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calculator, TrendingUp, AlertTriangle, Sparkles, Megaphone, Tag, PieChart, Lightbulb, Package } from 'lucide-react';

interface Props {
  products: Product[];
  ingredients: Ingredient[];
  user: { uid: string };
}

const STORAGE_KEY = 'ceumilan_roas_defaults';

function getMaterialCost(b: HppMaterial, ingredients: Ingredient[]): number {
  const ingredient = ingredients.find((i) => i.id === b.ingredientId);
  let price = b.harga;
  let usage = Number(b.qty) || 0;
  if (ingredient) {
    price = ingredient.price;
    const ingBase = getBaseUnit(ingredient.unit);
    const matBase = getBaseUnit(b.satuan);
    if (ingBase === matBase) {
      usage = toBaseValue(usage, b.satuan);
      const pricePerBase = price / getConversionRate(ingredient.unit);
      return usage * pricePerBase;
    }
  }
  return usage * (Number(price) || 0);
}

function calcHppPerPcs(variant: Variant, ingredients: Ingredient[]): number {
  const totalMaterials = (variant.bahan || []).reduce(
    (acc, b) => acc + getMaterialCost(b, ingredients),
    0
  );
  const qBatch = Math.max(1, Number(variant.qty_batch) || 1);
  return (totalMaterials + (Number(variant.harga_packing) || 0)) / qBatch;
}

type ResultBlock = {
  D: number;
  G: number;
  H: number;
  J: number;
  K: number;
  L: number;
  M: number;
  C: number;
  F: number;
  voucher: number;
  hpp: number;
};

export default function ROASCalculator({ products, ingredients, user }: Props) {
  const [productId, setProductId] = React.useState<string>('');
  const [variantId, setVariantId] = React.useState<string>('');
  const [profitPctRaw, setProfitPctRaw] = React.useState<string>('');
  const [voucher, setVoucher] = React.useState<string>('0');
  const [scaleMode, setScaleMode] = React.useState<'pcs' | 'order'>('order');

  // Load saved defaults per variant
  const loadDefaults = React.useCallback(() => {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}_${user.uid}`);
      return raw ? JSON.parse(raw) as Record<string, { profitPct?: number; voucher?: number }> : {};
    } catch { return {}; }
  }, [user.uid]);

  const saveDefaults = (key: string, data: { profitPct?: number; voucher?: number }) => {
    try {
      const all = loadDefaults();
      all[key] = { ...all[key], ...data };
      localStorage.setItem(`${STORAGE_KEY}_${user.uid}`, JSON.stringify(all));
    } catch {}
  };

  const product = products.find((p) => p.id === productId);
  const variant = product?.varian.find((v) => v.id === variantId) || product?.varian[0];
  const variantKey = product && variant ? `${product.id}::${variant.id}` : '';

  // Apply saved defaults when variant changes
  React.useEffect(() => {
    if (!variantKey) return;
    const all = loadDefaults();
    const saved = all[variantKey];
    if (saved) {
      if (saved.profitPct !== undefined) setProfitPctRaw(String(saved.profitPct));
      if (saved.voucher !== undefined) setVoucher(String(saved.voucher));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantKey]);

  // Auto-pick first variant when product changes
  React.useEffect(() => {
    if (product && product.varian.length > 0 && !product.varian.find(v => v.id === variantId)) {
      setVariantId(product.varian[0].id);
    }
  }, [productId]); // eslint-disable-line

  const profitPct = Number(profitPctRaw) || 0;
  const voucherNum = Number(voucher) || 0;
  const minOrder = Math.max(1, Number(variant?.min_order) || 1);
  const qty = scaleMode === 'order' ? minOrder : 1;

  const result: ResultBlock | null = React.useMemo(() => {
    if (!product || !variant) return null;
    const hargaJualPcs = Number(variant.harga_jual) || 0;
    const hppPcs = calcHppPerPcs(variant, ingredients);
    const voucherPcs = Math.max(0, voucherNum);

    // Scale per-pcs items by qty (min_order or 1).
    // Nominal fees (F) stay per-order (admin/ongkir tetap), % fees (C) stay %.
    const A = hargaJualPcs * qty;
    const B = voucherPcs * qty;
    const E = hppPcs * qty;

    let C = 0; // % fees
    let F = 0; // nominal fees (per order, NOT scaled)
    for (const fee of product.biaya_lain || []) {
      if (fee.tipe === 'persen') C += Number(fee.nilai) || 0;
      else if (fee.tipe === 'nominal') F += Number(fee.nilai) || 0;
    }

    const D = (A - B) * (1 - C / 100);
    const G = E + F;
    const H = D - G;
    const I = profitPct;

    let J = 0, K = 0, L = 0, M = 0;
    if (H > 0 && I > 0) {
      const denom1 = (H / (1 - 0.11)) * (I / 100);
      const denom2 = H * (I / 100);
      J = denom1 > 0 ? A / denom1 : 0;
      K = denom2 > 0 ? A / denom2 : 0;
      L = J / 0.8;
      M = K / 0.8;
    }

    // Keep hpp as per-pcs for the InfoBlock label clarity.
    return { D, G, H, J, K, L, M, C, F, voucher: B, hpp: hppPcs };
  }, [product, variant, voucherNum, profitPct, ingredients, qty]);

  const handleProfitChange = (v: string) => {
    setProfitPctRaw(v);
    if (variantKey) saveDefaults(variantKey, { profitPct: Number(v) || 0 });
  };

  const handleVoucherChange = (v: string) => {
    setVoucher(v);
    if (variantKey) saveDefaults(variantKey, { voucher: Number(v) || 0 });
  };

  const insights: { icon: React.ReactNode; text: string; tone: 'warn' | 'info' }[] = [];
  if (result) {
    const margin = result.D > 0 ? (result.H / result.D) * 100 : 0;
    if (result.H <= 0) {
      // handled in main panel
    } else {
      if (margin < 15) {
        insights.push({
          icon: <AlertTriangle className="w-4 h-4" />,
          text: `Margin tipis (${margin.toFixed(1)}%). Naikkan harga atau turunkan HPP sebelum scaling iklan.`,
          tone: 'warn',
        });
      }
      if (result.K > 15 && profitPct > 0) {
        insights.push({
          icon: <AlertTriangle className="w-4 h-4" />,
          text: `Target ROAS ${result.K.toFixed(2)}x sangat tinggi — sulit dicapai untuk skala besar. Pertimbangkan turunkan target % profit iklan.`,
          tone: 'warn',
        });
      }
      if (result.K >= 2.5 && result.K <= 8 && profitPct > 0) {
        insights.push({
          icon: <Sparkles className="w-4 h-4" />,
          text: 'Target ROAS realistis untuk dijalankan iklan.',
          tone: 'info',
        });
      }
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shadow-lg shadow-violet-200">
          <Calculator className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-black text-[#1A1A2E]">Kalkulator ROAS</h1>
          <p className="text-sm text-gray-500 font-medium">
            Pilih produk + isi % profit untuk iklan → langsung tahu ROAS aman.
          </p>
        </div>
      </div>

      {/* Bagian 1: Pilih Produk */}
      <Card className="rounded-3xl border-none shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-violet-600">Langkah 1</span>
            <span className="text-sm font-bold">Pilih Produk</span>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="font-bold text-xs">Produk</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="rounded-2xl h-12">
                  <SelectValue placeholder="Pilih produk..." />
                </SelectTrigger>
                <SelectContent>
                  {products.length === 0 && (
                    <div className="px-3 py-6 text-center text-sm text-gray-400">
                      Belum ada produk. Tambahkan dulu di menu HPP.
                    </div>
                  )}
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {product && product.varian.length > 0 && (
              <div className="space-y-2">
                <Label className="font-bold text-xs">Varian</Label>
                <Select value={variantId} onValueChange={setVariantId}>
                  <SelectTrigger className="rounded-2xl h-12">
                    <SelectValue placeholder="Pilih varian..." />
                  </SelectTrigger>
                  <SelectContent>
                    {product.varian.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nama} — {formatCurrency(v.harga_jual || 0)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bagian 2: Info Otomatis */}
      {product && variant && (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-violet-600">Langkah 2</span>
                <span className="text-sm font-bold">Data Otomatis dari Produk</span>
              </div>

              {minOrder > 1 && (
                <div className="flex items-center gap-1 p-1 bg-violet-50 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setScaleMode('pcs')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                      scaleMode === 'pcs' ? 'bg-white text-violet-700 shadow-sm' : 'text-violet-500'
                    }`}
                  >
                    Per pcs
                  </button>
                  <button
                    type="button"
                    onClick={() => setScaleMode('order')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                      scaleMode === 'order' ? 'bg-white text-violet-700 shadow-sm' : 'text-violet-500'
                    }`}
                  >
                    <Package className="w-3 h-3" />
                    Per Pesanan ({minOrder} pcs)
                  </button>
                </div>
              )}
            </div>

            {scaleMode === 'order' && minOrder > 1 && (
              <div className="flex items-start gap-2 p-3 rounded-2xl bg-violet-50/60 text-violet-800 text-[11px] font-medium">
                <Package className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Mode <strong>Per Pesanan</strong>: Harga Jual & HPP otomatis dikali {minOrder} pcs (sesuai minimal order varian).
                  Biaya tipe nominal (admin/ongkir tetap) tidak dikalikan karena memang per-pesanan.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InfoBlock
                icon={<Tag />}
                label={qty > 1 ? `Harga Jual × ${qty} (A)` : 'Harga Jual (A)'}
                value={formatCurrency((variant.harga_jual || 0) * qty)}
                tone="violet"
                hint={qty > 1 ? `${formatCurrency(variant.harga_jual || 0)} / pcs` : undefined}
              />
              <InfoBlock
                icon={<PieChart />}
                label={qty > 1 ? `HPP × ${qty} (E)` : 'HPP / pcs (E)'}
                value={formatCurrency((result?.hpp || 0) * qty)}
                tone="rose"
                hint={qty > 1 ? `${formatCurrency(result?.hpp || 0)} / pcs` : undefined}
              />
              <InfoBlock
                icon={<Megaphone />}
                label="Admin Fee % (C)"
                value={`${(result?.C || 0).toFixed(1)}%`}
                tone="amber"
                hint={(result?.C || 0) === 0 ? 'Belum ada biaya tipe persen' : undefined}
              />
              <InfoBlock
                icon={<TrendingUp />}
                label="Biaya Proses (F)"
                value={formatCurrency(result?.F || 0)}
                tone="emerald"
                hint={(result?.F || 0) === 0 ? 'Belum ada biaya tipe nominal' : 'per pesanan'}
              />
            </div>

            {(result?.C === 0 && result?.F === 0) && (
              <div className="flex items-start gap-2 p-3 rounded-2xl bg-amber-50 text-amber-800 text-xs font-medium">
                <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Produk ini belum punya pajak/biaya tambahan. Tambahkan di menu HPP → Biaya Lain agar perhitungan ROAS akurat.</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bagian 3: Input User */}
      {product && variant && (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="p-5 space-y-5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-violet-600">Langkah 3</span>
              <span className="text-sm font-bold">Setting Iklan</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <Label className="font-bold text-sm">% Profit untuk Iklan (I)</Label>
                <span className="text-2xl font-black text-violet-600">{profitPct.toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.min(100, Math.max(0, profitPct))}
                onChange={(e) => handleProfitChange(e.target.value)}
                className="w-full h-2 rounded-full bg-violet-100 appearance-none cursor-pointer accent-violet-500"
              />
              <Input
                type="number"
                value={profitPctRaw}
                onChange={(e) => handleProfitChange(e.target.value)}
                placeholder="Mis: 30"
                className="rounded-xl h-11"
              />
              <p className="text-[11px] text-gray-400 font-medium">
                Berapa persen dari profit kotor yang Anda alokasikan untuk biaya iklan. Disimpan otomatis per produk.
              </p>
            </div>

            <div className="space-y-2 pt-1 border-t border-gray-100">
              <Label className="font-bold text-xs">Voucher / Diskon (B) <span className="text-gray-400 font-medium">— per pcs, opsional</span></Label>
              <Input
                type="number"
                value={voucher}
                onChange={(e) => handleVoucherChange(e.target.value)}
                placeholder="0"
                className="rounded-xl h-11"
              />
              {qty > 1 && voucherNum > 0 && (
                <p className="text-[11px] text-gray-400 font-medium">
                  Total voucher per pesanan: {formatCurrency(voucherNum * qty)} ({qty} × {formatCurrency(voucherNum)})
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bagian 4: Hasil */}
      {product && variant && result && (
        <Card className="rounded-3xl border-none shadow-md bg-gradient-to-br from-violet-50 to-fuchsia-50">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-violet-700">Hasil</span>
              <span className="text-sm font-black text-[#1A1A2E]">
                Kalkulasi ROAS {qty > 1 ? `(per pesanan ${qty} pcs)` : '(per pcs)'}
              </span>
            </div>

            {result.H <= 0 ? (
              <div className="bg-white rounded-2xl p-5 border-2 border-rose-200 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-rose-600">Produk tidak menghasilkan profit</p>
                  <p className="text-sm text-gray-600 font-medium mt-1">
                    Profit kotor (H) = {formatCurrency(result.H)}. ROAS tidak bisa dihitung.
                    Naikkan harga jual, kurangi HPP, atau turunkan voucher/admin fee.
                  </p>
                </div>
              </div>
            ) : profitPct <= 0 ? (
              <div className="bg-white rounded-2xl p-5 border border-violet-100 text-sm text-gray-500 font-medium">
                Geser slider <strong>% Profit untuk Iklan</strong> di atas untuk melihat hasil ROAS.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ResultCard label="Omzet Real (D)" value={formatCurrency(result.D)} sub="Setelah voucher & admin fee" tone="violet" />
                  <ResultCard label="HPP Real (G)" value={formatCurrency(result.G)} sub="HPP + biaya proses" tone="rose" />
                  <ResultCard
                    label="Profit Kotor (H)"
                    value={formatCurrency(result.H)}
                    sub={`Margin ${((result.H / Math.max(1, result.D)) * 100).toFixed(1)}%`}
                    tone="emerald"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <RoasCard label="ROAS Ideal Minimal (J)" value={result.J} hint="Sudah perhitungkan PPN 11%" highlight />
                  <RoasCard label="NET ROAS (K)" value={result.K} hint="Tanpa PPN" />
                  <RoasCard label="ROAS Set Seller Center (L)" value={result.L} hint="Pengaman ÷ 0.8 untuk iklan marketplace" />
                  <RoasCard label="NET ROAS Set (M)" value={result.M} hint="Pengaman ÷ 0.8 NET" />
                </div>

                {insights.length > 0 && (
                  <div className="space-y-2 pt-2">
                    {insights.map((ins, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2 p-3 rounded-2xl text-xs font-medium ${
                          ins.tone === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        <span className="shrink-0 mt-0.5">{ins.icon}</span>
                        <span>{ins.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {!product && (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 text-violet-500 flex items-center justify-center mx-auto">
              <Calculator className="w-7 h-7" />
            </div>
            <p className="font-bold text-sm">Belum ada produk dipilih</p>
            <p className="text-xs text-gray-500 font-medium max-w-xs mx-auto">
              Pilih salah satu produk di atas untuk mulai menghitung ROAS yang aman untuk iklan.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoBlock({
  icon, label, value, tone, hint,
}: { icon: React.ReactNode; label: string; value: string; tone: 'violet' | 'rose' | 'amber' | 'emerald'; hint?: string }) {
  const tones: Record<string, string> = {
    violet: 'bg-violet-50 text-violet-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <div className="bg-white rounded-2xl p-3 border border-gray-50">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${tones[tone]}`}>
        <span className="[&>svg]:w-4 [&>svg]:h-4">{icon}</span>
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
      <p className="text-base font-black text-[#1A1A2E]">{value}</p>
      {hint && <p className="text-[10px] text-gray-400 font-medium mt-1">{hint}</p>}
    </div>
  );
}

function ResultCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'violet' | 'rose' | 'emerald' }) {
  const tones: Record<string, string> = {
    violet: 'border-violet-200 text-violet-700',
    rose: 'border-rose-200 text-rose-700',
    emerald: 'border-emerald-200 text-emerald-700',
  };
  return (
    <div className={`bg-white rounded-2xl p-4 border-2 ${tones[tone]}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
      <p className={`text-lg font-black ${tones[tone].split(' ').find(c => c.startsWith('text-'))}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 font-medium mt-1">{sub}</p>}
    </div>
  );
}

function RoasCard({ label, value, hint, highlight }: { label: string; value: number; hint?: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-2xl p-4 ${
        highlight
          ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-200'
          : 'bg-white border border-violet-100'
      }`}
    >
      <p className={`text-[10px] font-black uppercase tracking-widest ${highlight ? 'text-white/80' : 'text-gray-400'}`}>
        {label}
      </p>
      <p className={`text-2xl md:text-3xl font-black ${highlight ? 'text-white' : 'text-[#1A1A2E]'}`}>
        {isFinite(value) ? value.toFixed(2) : '0.00'}<span className="text-sm font-bold">x</span>
      </p>
      {hint && <p className={`text-[10px] font-medium mt-1 ${highlight ? 'text-white/70' : 'text-gray-400'}`}>{hint}</p>}
    </div>
  );
}
