import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '../lib/formatUtils';
import {
  AspHspAsmLsmResult,
  SkuEconomics,
} from '../lib/unitEconomics';
import {
  Calculator,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  TrendingUp,
  Activity,
  Sliders,
  DollarSign,
  Package,
  Layers,
  HelpCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface AspHspAsmLsmCardProps {
  result: AspHspAsmLsmResult;
  budgetIklan: number;
  setBudgetIklan: (val: number) => void;
  customRoas?: number;
  setCustomRoas?: (val: number) => void;
  title?: string;
}

export function AspHspAsmLsmCard({
  result,
  budgetIklan,
  setBudgetIklan,
  customRoas = 0,
  setCustomRoas,
  title = 'Analisis & Rekomendasi ROAS (Berdasarkan ASP & ASM)',
}: AspHspAsmLsmCardProps) {
  const [showSkuTable, setShowSkuTable] = React.useState<boolean>(false);
  const [localCustomRoas, setLocalCustomRoas] = React.useState<number>(
    customRoas > 0 ? customRoas : Number(result.roasIdeal.toFixed(2))
  );

  React.useEffect(() => {
    if (customRoas > 0) {
      setLocalCustomRoas(customRoas);
    } else if (result.roasIdeal > 0 && localCustomRoas === 0) {
      setLocalCustomRoas(Number(result.roasIdeal.toFixed(2)));
    }
  }, [customRoas, result.roasIdeal]);

  const activePriceMethod = 'ASP';
  const activeMarginMethod = 'ASM';

  // Custom simulation calculation with FLOOR unit rule
  const customSim = React.useMemo(() => {
    const roas = localCustomRoas > 0 ? localCustomRoas : 1;
    const omzet = budgetIklan * roas;
    const pRef = result.referencePrice > 0 ? result.referencePrice : 1;
    const unit = Math.floor(omzet / pRef);
    const margin = unit * result.referenceMargin;
    const profit = margin - budgetIklan;
    const profitPct = omzet > 0 ? (profit / omzet) * 100 : 0;

    return {
      roas,
      budget: budgetIklan,
      estimasiOmzet: omzet,
      estimasiUnit: unit,
      estimasiMargin: margin,
      estimasiProfitSetelahIklan: profit,
      profitMarginPct: profitPct,
    };
  }, [budgetIklan, localCustomRoas, result.referencePrice, result.referenceMargin]);

  return (
    <Card className="rounded-3xl border-2 border-indigo-200/80 bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/40 shadow-lg overflow-hidden">
      <CardHeader className="p-4 md:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-b border-indigo-900">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 rounded-md">
                METODE ASP & ASM
              </span>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 text-[10px] font-bold">
                Faktor Keamanan 1.5x & 2.0x
              </Badge>
            </div>
            <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
              <Calculator className="w-4 h-4 text-indigo-400" />
              <span>{title}</span>
            </h3>
            <p className="text-[11px] text-slate-300">
              ROAS ditentukan berdasarkan Harga Jual Aktual & Margin setelah biaya marketplace / non-iklan.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 md:p-6 space-y-5">
        {/* WARNING ALERT IF LSM <= 0 */}
        {result.isLsmZeroOrNegative && (
          <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex items-start gap-3 text-rose-900">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <p className="font-black text-sm">⚠ Margin Varian Terlalu Tipis atau Negatif (LSM ≤ 0)</p>
              <p className="leading-relaxed">
                Terdapat varian yang marginnya tidak cukup menutupi biaya non-iklan (HPP + Marketplace Fee + Biaya Pesanan).
                Iklan pada varian ini berisiko rugi karena tidak ada sisa margin untuk biaya iklan.
              </p>
              <p className="text-[11px] text-rose-700 font-bold">
                Saran: Naikkan harga jual varian tersebut, kurangi HPP, atau matikan iklan untuk varian dengan margin minus.
              </p>
            </div>
          </div>
        )}

        {/* 1. INFORMASI METRIK: ASP, HSP, ASM, LSM */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200">
            <span className="text-[10px] font-black uppercase text-gray-500 block mb-1">ASP (Rata-rata Penjualan)</span>
            <span className="text-lg font-black text-indigo-700">{formatCurrency(result.asp)}</span>
          </div>
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200">
            <span className="text-[10px] font-black uppercase text-gray-500 block mb-1">HSP (Harga Tertinggi)</span>
            <span className="text-lg font-black text-gray-700">{formatCurrency(result.hsp)}</span>
          </div>
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200">
            <span className="text-[10px] font-black uppercase text-gray-500 block mb-1">ASM (Margin Rata-rata)</span>
            <span className="text-lg font-black text-purple-700">{formatCurrency(result.asm)}</span>
          </div>
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200">
            <span className="text-[10px] font-black uppercase text-gray-500 block mb-1">LSM (Margin Terendah)</span>
            <span className="text-lg font-black text-gray-700">{formatCurrency(result.lsm)}</span>
          </div>
        </div>

        {/* 2. CORE ROAS METRICS (ROAS MINIMUM 1.5x & ROAS IDEAL 2.0x) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              HASIL REKOMENDASI ROAS (FAKTOR KEAMANAN)
            </span>
            <span className="text-[11px] text-gray-400">
              Rumus: (Harga Ref / Margin Ref) × Faktor
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* ROAS BEP (1.0x) */}
            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-1.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-blue-900">ROAS BEP</span>
                  <Badge variant="outline" className="bg-white text-blue-800 border-blue-300 font-black text-[10px]">
                    1.0x (Impas)
                  </Badge>
                </div>
                <p className="text-3xl font-black text-blue-950 mt-1">
                  {Number.isFinite(result.roasBep) ? `${result.roasBep.toFixed(2)}x` : '-'}
                </p>
              </div>
              <div className="pt-2 border-t border-blue-200/60 text-[10px] text-blue-800 leading-tight">
                Batas impas tanpa kerugian (profit = Rp 0). Jangan jalankan iklan di bawah angka ini.
              </div>
            </div>

            {/* ROAS MINIMUM (1.5x) */}
            <div className="p-4 rounded-2xl bg-amber-50/80 border-2 border-amber-300 space-y-1.5 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-950">ROAS MINIMUM</span>
                  <Badge className="bg-amber-600 text-white border-none font-black text-[10px]">
                    1.5x Faktor Aman
                  </Badge>
                </div>
                <p className="text-3xl font-black text-amber-950 mt-1">
                  {Number.isFinite(result.roasMinimum) ? `${result.roasMinimum.toFixed(2)}x` : '-'}
                </p>
              </div>
              <div className="pt-2 border-t border-amber-200 text-[10px] text-amber-900 font-medium leading-tight">
                Target minimum aman agar iklan menghasilkan profit bersih dasar setelah biaya non-iklan.
              </div>
            </div>

            {/* ROAS IDEAL (2.0x) */}
            <div className="p-4 rounded-2xl bg-emerald-50/80 border-2 border-emerald-300 space-y-1.5 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-950">ROAS IDEAL</span>
                  <Badge className="bg-emerald-600 text-white border-none font-black text-[10px]">
                    2.0x Rekomendasi
                  </Badge>
                </div>
                <p className="text-3xl font-black text-emerald-950 mt-1">
                  {Number.isFinite(result.roasIdeal) ? `${result.roasIdeal.toFixed(2)}x` : '-'}
                </p>
              </div>
              <div className="pt-2 border-t border-emerald-200 text-[10px] text-emerald-900 font-medium leading-tight">
                Target optimal untuk skala iklan sehat dengan margin profit bersih maksimal dan aman fluktuasi.
              </div>
            </div>
          </div>
        </div>

        {/* 3. SIMULASI BIAYA IKLAN & SCENARIO PROJECTIONS */}
        <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-4 shadow-md">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                  SIMULASI BIAYA IKLAN (INPUT BUDGET → PROYEKSI LABA)
                </h4>
                <p className="text-[10px] text-slate-400">
                  Estimasi unit dihitung dengan pembulatan ke bawah (FLOOR) dari Omzet / Harga Referensi.
                </p>
              </div>
            </div>

            {/* Input Budget */}
            <div className="flex items-center gap-2">
              <Label className="text-xs font-bold text-slate-300">Budget Iklan:</Label>
              <div className="w-36">
                <Input
                  type="number"
                  min={0}
                  step={10000}
                  value={budgetIklan}
                  onChange={(e) => setBudgetIklan(Math.max(0, Number(e.target.value) || 0))}
                  className="h-8 font-black text-xs text-right bg-slate-800 text-emerald-400 border-slate-700"
                />
              </div>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400 font-bold">Preset Budget:</span>
            {[50000, 100000, 250000, 500000, 1000000].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setBudgetIklan(preset)}
                className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-all ${
                  budgetIklan === preset
                    ? 'bg-emerald-500 text-slate-950 font-black'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {formatCurrency(preset)}
              </button>
            ))}
          </div>

          {/* Simulation Comparison Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {/* Skenario 1: ROAS Minimum (1.5x) */}
            <div className="p-3.5 rounded-xl bg-slate-800/90 border border-amber-500/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-amber-400 uppercase">SKENARIO ROAS MINIMUM</span>
                <span className="text-xs font-black text-white bg-amber-500/20 px-2 py-0.5 rounded border border-amber-400/30">
                  {result.simulationMinimum.roas.toFixed(2)}x
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Estimasi Omzet:</span>
                  <span className="font-bold text-white">{formatCurrency(result.simulationMinimum.estimasiOmzet)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Estimasi Unit (FLOOR):</span>
                  <span className="font-bold text-amber-300">{result.simulationMinimum.estimasiUnit} pcs</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Estimasi Margin Non-Iklan:</span>
                  <span className="font-bold text-white">{formatCurrency(result.simulationMinimum.estimasiMargin)}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-slate-700 font-bold">
                  <span className="text-amber-400">Profit Setelah Iklan:</span>
                  <span className="text-amber-300 font-black">
                    {formatCurrency(result.simulationMinimum.estimasiProfitSetelahIklan)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Margin Profit Bersih:</span>
                  <span className="text-amber-300 font-bold">{result.simulationMinimum.profitMarginPct.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* Skenario 2: ROAS Ideal (2.0x) */}
            <div className="p-3.5 rounded-xl bg-slate-800/90 border border-emerald-500/50 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-emerald-400 uppercase">SKENARIO ROAS IDEAL</span>
                <span className="text-xs font-black text-white bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-400/30">
                  {result.simulationIdeal.roas.toFixed(2)}x
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Estimasi Omzet:</span>
                  <span className="font-bold text-white">{formatCurrency(result.simulationIdeal.estimasiOmzet)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Estimasi Unit (FLOOR):</span>
                  <span className="font-bold text-emerald-300">{result.simulationIdeal.estimasiUnit} pcs</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Estimasi Margin Non-Iklan:</span>
                  <span className="font-bold text-white">{formatCurrency(result.simulationIdeal.estimasiMargin)}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-slate-700 font-bold">
                  <span className="text-emerald-400">Profit Setelah Iklan:</span>
                  <span className="text-emerald-300 font-black">
                    {formatCurrency(result.simulationIdeal.estimasiProfitSetelahIklan)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Margin Profit Bersih:</span>
                  <span className="text-emerald-300 font-bold">{result.simulationIdeal.profitMarginPct.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* Skenario 3: Uji ROAS Kustom (Slider) */}
            <div className="p-3.5 rounded-xl bg-slate-800/90 border border-indigo-500/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-indigo-300 uppercase">UJI ROAS KUSTOM</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={25}
                    step={0.1}
                    value={localCustomRoas}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 1;
                      setLocalCustomRoas(val);
                      if (setCustomRoas) setCustomRoas(val);
                    }}
                    className="w-16 h-6 text-xs font-black text-center bg-slate-900 border border-slate-700 rounded text-indigo-300"
                  />
                  <span className="text-xs font-black text-indigo-400">x</span>
                </div>
              </div>

              <input
                type="range"
                min={1}
                max={20}
                step={0.1}
                value={localCustomRoas}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setLocalCustomRoas(val);
                  if (setCustomRoas) setCustomRoas(val);
                }}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-400"
              />

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Estimasi Omzet:</span>
                  <span className="font-bold text-white">{formatCurrency(customSim.estimasiOmzet)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Estimasi Unit (FLOOR):</span>
                  <span className="font-bold text-indigo-300">{customSim.estimasiUnit} pcs</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-slate-700 font-bold">
                  <span className="text-indigo-300">Profit Setelah Iklan:</span>
                  <span className={`font-black ${customSim.estimasiProfitSetelahIklan >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                    {formatCurrency(customSim.estimasiProfitSetelahIklan)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Margin Profit Bersih:</span>
                  <span className={`font-bold ${customSim.profitMarginPct >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                    {customSim.profitMarginPct.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. ACCORDION: RINCIAN TABEL EKONOMI SETIAP SKU / VARIAN */}
        <div className="space-y-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowSkuTable(!showSkuTable)}
            className="w-full text-xs font-black text-indigo-800 bg-indigo-50/70 hover:bg-indigo-100 border border-indigo-200/60 rounded-xl h-9 flex items-center justify-center gap-1.5"
          >
            <span>{showSkuTable ? 'Sembunyikan Rincian SKU Economics' : `Lihat Tabel Rincian ${result.skus.length} SKU / Varian`}</span>
            {showSkuTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>

          {showSkuTable && (
            <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-gray-800 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-indigo-600" />
                  DATA UNIT EKONOMI INDIVIDUAL SKU (SINGLE SOURCE OF TRUTH)
                </span>
                <span className="text-[10px] text-gray-400">
                  *Margin = Harga Jual − Total Biaya Non-Iklan
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 border-b text-[10px] uppercase font-bold">
                      <th className="p-2">SKU / Varian</th>
                      <th className="p-2 text-right">Harga Jual (P)</th>
                      <th className="p-2 text-right">HPP</th>
                      <th className="p-2 text-right">Biaya Marketplace</th>
                      <th className="p-2 text-right">Total Non-Iklan</th>
                      <th className="p-2 text-right">Margin (M)</th>
                      <th className="p-2 text-right">Margin %</th>
                      <th className="p-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.skus.map((sku) => (
                      <tr key={sku.id} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="p-2 font-bold text-gray-900">{sku.name}</td>
                        <td className="p-2 text-right font-black text-gray-900">{formatCurrency(sku.price)}</td>
                        <td className="p-2 text-right text-rose-600 font-semibold">{formatCurrency(sku.hpp)}</td>
                        <td className="p-2 text-right text-gray-600">{formatCurrency(sku.marketplaceFee)}</td>
                        <td className="p-2 text-right text-gray-700 font-bold">{formatCurrency(sku.totalNonAdCost)}</td>
                        <td className="p-2 text-right font-black text-indigo-700">{formatCurrency(sku.margin)}</td>
                        <td className="p-2 text-right font-bold text-gray-900">{sku.marginPct.toFixed(1)}%</td>
                        <td className="p-2 text-center">
                          {sku.margin > 0 ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-none text-[9px] font-bold">
                              Sehat
                            </Badge>
                          ) : (
                            <Badge className="bg-rose-100 text-rose-800 border-none text-[9px] font-bold">
                              Kritis
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
