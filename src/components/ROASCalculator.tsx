import React from 'react';
import { Product, Variant, Ingredient, HppMaterial, Transaction, AdditionalFee } from '../types';
import { formatCurrency, calculateDiscountFromCoret } from '../lib/formatUtils';
import { getBaseUnit, getConversionRate, toBaseValue } from '../lib/unitUtils';
import {
  calculateUnitEconomics,
  calculateReversePrice,
  roundPrice,
  runUnitEconomicsSelfTests,
  UnitEconomicsResult,
  ReverseCalcResult,
  ProductFeeDetail,
} from '../lib/unitEconomics';
import { doc, setDoc } from 'firebase/firestore';
import { db, sanitizeData } from '../lib/firebase';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Calculator,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  Info,
  Layers,
  Package,
  Sliders,
  ShieldAlert,
  Percent,
  CheckCircle2,
  CheckCircle,
  DollarSign,
  PieChart,
  Activity,
  Plus,
  Trash2,
  HelpCircle,
  BarChart3,
  ArrowRight,
  RefreshCw,
  ShoppingBag,
  Scale,
  CheckSquare,
  Square,
  Tag,
  Flame,
  ArrowUpRight,
  FileSpreadsheet,
  ShieldCheck,
} from 'lucide-react';

interface Props {
  products: Product[];
  ingredients: Ingredient[];
  transactions?: Transaction[];
  user: { uid: string };
}

// Storage Key
const STORAGE_KEY = 'ceumilan_roas_engine_v5';

/* ==========================================================================
   HELPER FUNCTIONS: HPP & BIAYA UNIT (SINGLE SOURCE OF TRUTH)
   ========================================================================== */
function getMaterialCost(b: HppMaterial, ingredients: Ingredient[] = []): number {
  const ingredient = (ingredients || []).find((i) => i.id === b.ingredientId);
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
  if (!variant) return 0;
  const totalMaterials = (Array.isArray(variant.bahan) ? variant.bahan : []).reduce(
    (acc, b) => acc + getMaterialCost(b, ingredients),
    0
  );
  const qBatch = Math.max(1, Number(variant.qty_batch) || 1);
  return (totalMaterials + (Number(variant.harga_packing) || 0)) / qBatch;
}

/**
 * Ekstraksi konfigurasi fee dari produk dan varian (Single Source of Truth)
 */
function extractFeeRates(product?: Product, variant?: Variant) {
  const pFees = Array.isArray(product?.biaya_lain) ? product.biaya_lain : [];
  const vFees = Array.isArray(variant?.biaya_lain) ? variant.biaya_lain : [];
  const allFees: AdditionalFee[] = [...pFees, ...vFees];

  let percentRate = 0;
  let nominalPerOrder = 0;
  let nominalPerUnit = 0;

  for (const fee of allFees) {
    if (fee.tipe === 'persen') {
      percentRate += Number(fee.nilai) || 0;
    } else if (fee.tipe === 'nominal') {
      const val = Number(fee.nilai) || 0;
      const name = (fee.nama || '').toLowerCase();
      if (name.includes('unit') || name.includes('pcs') || name.includes('pack')) {
        nominalPerUnit += val;
      } else {
        nominalPerOrder += val;
      }
    }
  }

  // Default biaya proses order marketplace jika belum terdaftar
  if (nominalPerOrder === 0) {
    nominalPerOrder = 1600;
  }

  return { percentRate, nominalPerOrder, nominalPerUnit, allFees };
}

/* ==========================================================================
   HELPER FUNCTIONS: HISTORICAL SALES DATA
   ========================================================================== */
function getHistoricalVariantSales(productId: string, transactions?: Transaction[]) {
  if (!transactions || !Array.isArray(transactions) || transactions.length === 0) return { weights: {}, totalUnitsSold: 0 };
  const qtyMap: Record<string, number> = {};
  let totalQty = 0;

  transactions.forEach((tx) => {
    if (Array.isArray(tx.penjualan_detail)) {
      tx.penjualan_detail.forEach((pd) => {
        if (pd?.produk_id === productId) {
          const varList = Array.isArray(pd.varian) ? pd.varian : [];
          varList.forEach((v) => {
            const q = Number(v?.qty) || 0;
            if (v?.varian_id) {
              qtyMap[v.varian_id] = (qtyMap[v.varian_id] || 0) + q;
              totalQty += q;
            }
          });
        }
      });
    }
  });

  const weights: Record<string, number> = {};
  if (totalQty > 0) {
    Object.keys(qtyMap).forEach((vId) => {
      weights[vId] = (qtyMap[vId] / totalQty) * 100;
    });
  }

  return { weights, totalUnitsSold: totalQty };
}

function getHistoricalProductSales(productIds: string[], transactions?: Transaction[]) {
  if (!transactions || !Array.isArray(transactions) || transactions.length === 0) return { weights: {}, totalUnitsSold: 0 };
  const qtyMap: Record<string, number> = {};
  let totalQty = 0;

  transactions.forEach((tx) => {
    if (Array.isArray(tx.penjualan_detail)) {
      tx.penjualan_detail.forEach((pd) => {
        if (pd?.produk_id && productIds.includes(pd.produk_id)) {
          let itemQty = 0;
          const varList = Array.isArray(pd.varian) ? pd.varian : [];
          varList.forEach((v) => {
            itemQty += Number(v?.qty) || 0;
          });
          qtyMap[pd.produk_id] = (qtyMap[pd.produk_id] || 0) + itemQty;
          totalQty += itemQty;
        }
      });
    }
  });

  const weights: Record<string, number> = {};
  if (totalQty > 0) {
    productIds.forEach((pId) => {
      weights[pId] = ((qtyMap[pId] || 0) / totalQty) * 100;
    });
  }

  return { weights, totalUnitsSold: totalQty };
}

/* ==========================================================================
   REUSABLE RESULT DISPLAY COMPONENT (SECTION 15 & 16 & 17 COMPLIANT)
   ========================================================================== */
interface ROASResultDisplayProps {
  modeTitle: string;
  name: string;
  minOrder: number;
  hargaJualPcs: number;
  hppPcs: number;
  biayaProsesOrder: number;
  hargaJualOrder: number;
  hppProdukOrder: number;
  totalHppRealOrder: number;
  voucherPerPcs: number;
  omzetRealOrder: number;
  profitSebelumIklanOrder: number;
  marginSebelumIklanPct: number;
  targetProfitPct: number;
  targetProfitNominalOrder: number;
  maxAdSpendOrder: number;
  roasBep: number;
  roasTarget: number;
  roasSetting: number;
  bufferPct?: number;
  roasWorst?: number;
  worstName?: string;
  isTargetFeasible: boolean;
  simRoas: number;
  setSimRoas: (val: number) => void;
  includePpn: boolean;
  ppnRate: number;
  numOrders: number;
  setNumOrders?: (val: number) => void;
  hargaCoretPcs?: number;
  diskonPersen?: number;
  targetProduct?: Product;
  targetVariant?: Variant;
  onApplyPrice?: (product: Product, variant: Variant, newPrice: number) => void;
  isPriceFromCariHarga?: boolean;
  masterPrice?: number;
  onResetPrice?: () => void;
  feeBreakdown?: ProductFeeDetail[];
}

function ROASResultDisplay({
  modeTitle,
  name,
  minOrder,
  hargaJualPcs,
  hppPcs,
  biayaProsesOrder,
  hargaJualOrder,
  hppProdukOrder,
  totalHppRealOrder,
  voucherPerPcs,
  omzetRealOrder,
  profitSebelumIklanOrder,
  marginSebelumIklanPct,
  targetProfitPct,
  targetProfitNominalOrder,
  maxAdSpendOrder,
  roasBep,
  roasTarget,
  roasSetting,
  bufferPct = 15,
  roasWorst,
  worstName,
  isTargetFeasible,
  simRoas,
  setSimRoas,
  includePpn,
  ppnRate,
  numOrders,
  setNumOrders,
  hargaCoretPcs,
  diskonPersen,
  targetProduct,
  targetVariant,
  onApplyPrice,
  isPriceFromCariHarga,
  masterPrice,
  onResetPrice,
  feeBreakdown,
}: ROASResultDisplayProps) {
  const t_ppn = includePpn ? ppnRate / 100 : 0;
  
  // Simulation for 1 Order vs N Orders
  const simAdSpendSellerCenterOrder = simRoas > 0 ? hargaJualOrder / simRoas : 0;
  const simAdSpendTotalBurdenOrder = simAdSpendSellerCenterOrder * (1 + t_ppn);
  const simProfitAfterAdsOrder = profitSebelumIklanOrder - simAdSpendTotalBurdenOrder;
  const simMarginAfterAdsPct = hargaJualOrder > 0 ? (simProfitAfterAdsOrder / hargaJualOrder) * 100 : 0;

  // N Order Totals
  const nOrders = Math.max(1, numOrders || 1);
  const totalSimPcs = nOrders * minOrder;
  const totalSimRevenue = nOrders * hargaJualOrder;
  const totalSimHppProduk = nOrders * hppProdukOrder;
  const totalSimBiayaProses = nOrders * biayaProsesOrder;
  const totalSimHppReal = nOrders * totalHppRealOrder;
  const totalSimOmzetReal = nOrders * omzetRealOrder;
  const totalSimProfitBeforeAds = nOrders * profitSebelumIklanOrder;
  const totalSimTargetProfit = nOrders * targetProfitNominalOrder;
  const totalSimMaxAdSpend = nOrders * maxAdSpendOrder;
  const totalSimAdSpendBurden = simAdSpendTotalBurdenOrder * nOrders;
  const totalSimProfitAfterAds = simProfitAfterAdsOrder * nOrders;

  // Determine automatic status based on strict intent rules:
  // Target Profit = Target Minimum (%)
  // Profit Aktual = Calculated actual net profit (%)
  const selisihPct = simMarginAfterAdsPct - targetProfitPct;

  let statusBadge = '✓ DI ATAS TARGET';
  let statusColor = 'bg-emerald-50 border-emerald-200 text-emerald-900';
  let statusDesc = `Profit bersih aktual (${simMarginAfterAdsPct.toFixed(1)}%) berada di atas target minimum (${targetProfitPct}%). Performa iklan sangat baik dengan selisih +${selisihPct.toFixed(1)}%.`;

  if (!isTargetFeasible) {
    statusBadge = '✕ STRUKTUR BIAYA MELEBIHI TARGET';
    statusColor = 'bg-rose-50 border-rose-200 text-rose-900';
    statusDesc = 'Tidak memungkinkan mencapai target profit dengan struktur biaya saat ini.';
  } else if (simMarginAfterAdsPct < 0) {
    statusBadge = '✕ RUGI';
    statusColor = 'bg-rose-50 border-rose-200 text-rose-900';
    statusDesc = `Biaya total iklan & operasional melebihi omzet. Transaksi mengalami kerugian (${simMarginAfterAdsPct.toFixed(1)}%).`;
  } else if (Math.abs(selisihPct) < 0.01) {
    statusBadge = '✓ SESUAI TARGET';
    statusColor = 'bg-emerald-50 border-emerald-200 text-emerald-900';
    statusDesc = `Profit bersih aktual (${simMarginAfterAdsPct.toFixed(1)}%) tepat sesuai target minimum (${targetProfitPct}%).`;
  } else if (simMarginAfterAdsPct < targetProfitPct) {
    statusBadge = '⚠ DI BAWAH TARGET';
    statusColor = 'bg-amber-50 border-amber-200 text-amber-900';
    statusDesc = `Profit bersih aktual (${simMarginAfterAdsPct.toFixed(1)}%) berada di bawah target minimum (${targetProfitPct}%). Selisih: ${selisihPct.toFixed(1)}%.`;
  }

  return (
    <Card className="rounded-3xl border border-violet-100 shadow-md bg-white overflow-hidden">
      <CardHeader className="p-5 md:p-6 bg-gradient-to-r from-violet-50/90 via-purple-50/50 to-white border-b border-violet-100">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-100 px-2.5 py-1 rounded-lg">
              {modeTitle}
            </span>
            <h3 className="text-base sm:text-lg font-black text-gray-900 mt-1">{name}</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {onApplyPrice && targetProduct && targetVariant && (
              <Button
                type="button"
                onClick={() => onApplyPrice(targetProduct, targetVariant, hargaJualPcs)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm h-9 px-3.5 flex items-center gap-1.5"
              >
                <Tag className="w-3.5 h-3.5" />
                <span>TERAPKAN HARGA</span>
              </Button>
            )}
            <Badge className={`text-xs font-black px-3 py-1.5 border rounded-xl ${statusColor}`}>
              {statusBadge}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 md:p-6 space-y-6">
        {/* INDICATOR FOR PRICE FROM CARI HARGA */}
        {isPriceFromCariHarga && (
          <div className="p-4 bg-emerald-50/90 border-2 border-emerald-300 rounded-2xl flex items-center justify-between gap-3 flex-wrap shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-black text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  ✓ Harga dari Cari Harga: {formatCurrency(hargaJualPcs)}
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 font-medium">
                Harga ini berasal dari rekomendasi Cari Harga dan belum mengubah harga produk {masterPrice !== undefined && masterPrice > 0 ? `(Harga Master: ${formatCurrency(masterPrice)})` : ''}.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {onApplyPrice && targetProduct && targetVariant && (
                <Button
                  type="button"
                  onClick={() => onApplyPrice(targetProduct, targetVariant, hargaJualPcs)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl h-8 px-3.5 shadow-xs flex items-center gap-1.5"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>TERAPKAN HARGA</span>
                </Button>
              )}
              {onResetPrice && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onResetPrice}
                  className="text-xs font-bold rounded-xl h-8 px-3 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                >
                  Reset ke Harga Master
                </Button>
              )}
            </div>
          </div>
        )}

        {/* 1. INFORMASI MINIMAL ORDER & TRANSPARANSI DEBUG (ATURAN UTAMA 1, 2, 4, 9) */}
        <div className="p-4 rounded-2xl bg-violet-50/70 border border-violet-100 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2 border-b border-violet-200/60 pb-2.5">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-violet-600" />
              <h4 className="text-xs font-black uppercase tracking-wider text-violet-900">
                RINCIAN UNIT EKONOMI PER ORDER (TRANSPARANSI DATA)
              </h4>
            </div>
            <div className="text-right">
              <span className="text-xs font-black text-violet-800 bg-violet-200/80 px-2.5 py-0.5 rounded-lg">
                MINIMAL ORDER: {minOrder} pcs / order
              </span>
              <p className="text-[10px] text-violet-600 italic font-medium mt-0.5">
                Data otomatis dari varian produk
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
            <div className="p-2.5 bg-white rounded-xl border border-violet-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase">Harga / pcs</p>
              <p className="font-black text-gray-900 mt-0.5">{formatCurrency(hargaJualPcs)}</p>
            </div>
            <div className="p-2.5 bg-white rounded-xl border border-violet-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase">HPP / pcs</p>
              <p className="font-bold text-rose-600 mt-0.5">{formatCurrency(hppPcs)}</p>
            </div>
            <div className="p-2.5 bg-white rounded-xl border border-violet-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase">Minimal Order</p>
              <p className="font-black text-violet-700 mt-0.5">{minOrder} pcs / order</p>
            </div>
            <div className="p-2.5 bg-white rounded-xl border border-violet-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase">Harga Jual / Order</p>
              <p className="font-black text-gray-900 mt-0.5">{formatCurrency(hargaJualOrder)}</p>
            </div>
            <div className="p-2.5 bg-white rounded-xl border border-violet-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase">HPP Produk / Order</p>
              <p className="font-bold text-rose-600 mt-0.5">{formatCurrency(hppProdukOrder)}</p>
            </div>
            <div className="p-2.5 bg-white rounded-xl border border-violet-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase">Biaya Proses / Order</p>
              <p className="font-bold text-amber-600 mt-0.5">{formatCurrency(biayaProsesOrder)}</p>
            </div>
            <div className="p-2.5 bg-violet-100/60 rounded-xl border border-violet-200 col-span-2 sm:col-span-1">
              <p className="text-[10px] font-bold text-violet-800 uppercase">Total HPP Real / Order</p>
              <p className="font-black text-violet-950 mt-0.5">{formatCurrency(totalHppRealOrder)}</p>
            </div>
          </div>

          {onApplyPrice && targetProduct && targetVariant && (
            <div className="flex items-center justify-between p-3 bg-emerald-50/90 rounded-xl border border-emerald-200 text-xs gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="font-bold text-emerald-900">💡 Terapkan Harga Jual ini ({formatCurrency(hargaJualPcs)}) ke Varian:</span>
                <Badge variant="outline" className="bg-white text-emerald-800 border-emerald-300 font-bold">
                  {targetProduct.nama} - {targetVariant.nama}
                </Badge>
              </div>
              <Button
                type="button"
                onClick={() => onApplyPrice(targetProduct, targetVariant, hargaJualPcs)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-lg h-8 px-3.5 shadow-xs flex items-center gap-1.5"
              >
                <Tag className="w-3.5 h-3.5" />
                <span>TERAPKAN HARGA</span>
              </Button>
            </div>
          )}

          {hargaCoretPcs && hargaCoretPcs > hargaJualPcs ? (
            <div className="flex flex-wrap items-center justify-between p-3 bg-amber-50/90 rounded-xl border border-amber-200 text-xs gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-amber-900">🏷️ Harga Coret:</span>
                <span className="line-through text-gray-500 font-bold">{formatCurrency(hargaCoretPcs)}</span>
                <Badge className="bg-rose-500 text-white font-black text-[10px] px-1.5 py-0 border-none">
                  Diskon {diskonPersen || calculateDiscountFromCoret(hargaJualPcs, hargaCoretPcs).diskonPersen}%
                </Badge>
              </div>
              <span className="text-[10px] text-amber-800 font-medium italic">
                *Harga Coret hanya referensi promo/diskon. Seluruh kalkulasi ROAS & Omzet menggunakan Harga Jual Transaksi ({formatCurrency(hargaJualPcs)}).
              </span>
            </div>
          ) : null}
        </div>

        {/* DIAGNOSTIK & STRUKTUR BIAYA TERPADU (SINGLE SOURCE OF TRUTH) */}
        {feeBreakdown && feeBreakdown.length > 0 && (
          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-amber-200/70 pb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-700" />
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-950">
                  DIAGNOSTIK BIAYA TAMBAHAN VARIAN (SINGLE SOURCE OF TRUTH)
                </h4>
              </div>
              <Badge variant="outline" className="bg-white text-emerald-800 border-emerald-300 font-bold text-[10px]">
                ✓ Tersinkronisasi Otomatis dari Varian
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {feeBreakdown.map((fee, idx) => (
                <div key={idx} className="p-2.5 bg-white rounded-xl border border-amber-100/90 flex flex-col justify-between gap-1 shadow-2xs">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[11px] font-bold text-gray-800 truncate" title={fee.nama}>
                      {fee.nama}
                    </span>
                    <Badge variant="secondary" className="text-[9px] font-black px-1.5 py-0 shrink-0">
                      {fee.tipe === 'persen' ? `${fee.nilai}%` : fee.isOrderLevel ? 'Per Order' : 'Per Unit'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-50">
                    <span className="text-[10px] text-gray-400 font-medium">Beban / Unit:</span>
                    <span className="font-black text-amber-700">{formatCurrency(fee.nominalPerUnit)}</span>
                  </div>
                  {minOrder > 1 && (
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span>Beban / Order ({minOrder} pcs):</span>
                      <span className="font-bold text-gray-700">{formatCurrency(fee.nominalPerOrder)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1 text-xs text-amber-900 font-bold flex-wrap gap-2">
              <span>
                Total Biaya Tambahan: <strong>{formatCurrency(feeBreakdown.reduce((acc, f) => acc + f.nominalPerUnit, 0))} / pcs</strong> ({formatCurrency(feeBreakdown.reduce((acc, f) => acc + f.nominalPerOrder, 0))} / order)
              </span>
              <span className="text-[10px] text-gray-500 font-normal italic">
                *Revenue − HPP − Packaging − Seluruh Biaya Tambahan = Profit Sebelum Iklan
              </span>
            </div>
          </div>
        )}

        {/* 2. HASIL KALKULASI UNIT ECONOMICS (PER ORDER) */}
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
            <PieChart className="w-4 h-4 text-violet-600" />
            HASIL KALKULASI RINGKAS (PER 1 ORDER)
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-gray-50/80 rounded-2xl border border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase">Harga Jual / Order</p>
              <p className="text-sm font-black text-gray-900 mt-0.5">{formatCurrency(hargaJualOrder)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{minOrder} pcs × {formatCurrency(hargaJualPcs)}</p>
            </div>
            <div className="p-3 bg-gray-50/80 rounded-2xl border border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase">Omzet Real / Order</p>
              <p className="text-sm font-black text-gray-900 mt-0.5">{formatCurrency(omzetRealOrder)}</p>
              {voucherPerPcs > 0 && (
                <p className="text-[10px] text-gray-400 mt-0.5">Voucher: -{formatCurrency(voucherPerPcs * minOrder)}</p>
              )}
            </div>
            <div className="p-3 bg-gray-50/80 rounded-2xl border border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase">Total HPP Real / Order</p>
              <p className="text-sm font-bold text-rose-600 mt-0.5">{formatCurrency(totalHppRealOrder)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">HPP Produk + Biaya Proses</p>
            </div>
            <div className="p-3 bg-violet-50/60 rounded-2xl border border-violet-100">
              <p className="text-[10px] font-bold text-violet-700 uppercase">Profit Sebelum Iklan / Order</p>
              <p className="text-sm font-black text-violet-900 mt-0.5">{formatCurrency(profitSebelumIklanOrder)}</p>
            </div>
            <div className="p-3 bg-violet-50/60 rounded-2xl border border-violet-100">
              <p className="text-[10px] font-bold text-violet-700 uppercase">Margin Sebelum Iklan</p>
              <p className="text-sm font-black text-violet-900 mt-0.5">{marginSebelumIklanPct.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        {/* BANNER CLARIFICATION: TARGET VS PROFIT AKTUAL */}
        <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/80 flex items-start gap-2.5 text-xs text-blue-900">
          <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Target Profit Bersih ({targetProfitPct}%)</strong> adalah profit minimum yang ingin Anda pertahankan. 
            <strong> Profit Bersih Aktual ({simMarginAfterAdsPct.toFixed(1)}%)</strong> dihitung murni berdasarkan biaya iklan aktual. jika biaya iklan lebih hemat, profit aktual akan lebih tinggi dari target minimum.
          </p>
        </div>

        {/* 3. TERAPKAN 3 KONSEP UTAMA & BIAYA IKLAN MAKSIMAL */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* KONSEP A: TARGET PROFIT BERSIH */}
          <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase text-emerald-800 tracking-wider">TARGET PROFIT BERSIH</p>
              <Badge className="bg-emerald-600 text-white border-none font-bold text-xs">{targetProfitPct}%</Badge>
            </div>
            <p className="text-2xl font-black text-emerald-700">{formatCurrency(totalSimTargetProfit)}</p>
            <p className="text-[11px] text-emerald-600 leading-tight">
              Profit minimum yang wajib tersisa setelah biaya iklan & operasional ({nOrders} order).
            </p>
          </div>

          {/* KONSEP B: BIAYA IKLAN MAKSIMAL */}
          <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase text-indigo-800 tracking-wider">BIAYA IKLAN MAKSIMAL</p>
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md">
                {includePpn ? `Beban PPN ${ppnRate}%` : 'Tanpa PPN'}
              </span>
            </div>
            <p className="text-2xl font-black text-indigo-700">{formatCurrency(totalSimMaxAdSpend)}</p>
            <p className="text-[11px] text-indigo-600 leading-tight">
              Maksimal biaya iklan agar profit bersih tetap minimum {targetProfitPct}%.
            </p>
          </div>

          {/* KONSEP C: PROFIT BERSIH AKTUAL & SELISIH */}
          <div className={`p-4 rounded-2xl border space-y-2 ${simMarginAfterAdsPct >= targetProfitPct ? 'bg-teal-50/60 border-teal-200' : simMarginAfterAdsPct >= 0 ? 'bg-amber-50/60 border-amber-200' : 'bg-rose-50/60 border-rose-200'}`}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-wider text-gray-800">PROFIT BERSIH AKTUAL</p>
              <Badge className={`border-none font-bold text-xs text-white ${simMarginAfterAdsPct >= targetProfitPct ? 'bg-teal-600' : simMarginAfterAdsPct >= 0 ? 'bg-amber-600' : 'bg-rose-600'}`}>
                {simMarginAfterAdsPct.toFixed(1)}%
              </Badge>
            </div>
            <p className={`text-2xl font-black ${simMarginAfterAdsPct >= targetProfitPct ? 'text-teal-700' : simMarginAfterAdsPct >= 0 ? 'text-amber-700' : 'text-rose-700'}`}>
              {formatCurrency(totalSimProfitAfterAds)}
            </p>
            <div className="flex items-center justify-between text-[11px] pt-0.5">
              <span className="font-bold text-gray-600">Selisih dari Target:</span>
              <span className={`font-black ${selisihPct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {selisihPct >= 0 ? '+' : ''}{selisihPct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* 4. METRIK ROAS (TARGET VS AKTUAL TERPISAH) */}
        {!isTargetFeasible ? (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-black text-rose-700">Target Profit Tidak Dapat Dicapai</p>
              <p className="text-xs text-rose-600 leading-relaxed">
                Tidak memungkinkan mencapai target profit dengan struktur biaya saat ini. Margin Sebelum Iklan ({marginSebelumIklanPct.toFixed(1)}%) lebih kecil dari Target Profit Bersih ({targetProfitPct}%).
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-violet-600" />
              PERBANDINGAN METRIK ROAS (TARGET, SETTING & SIMULASI TERPISAH)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-violet-50/80 border border-violet-200 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-violet-800">TARGET ROAS</p>
                  <span className="text-[10px] bg-violet-200 text-violet-900 font-bold px-1.5 py-0.5 rounded">Target User</span>
                </div>
                <p className="text-2xl font-black text-violet-900">{roasTarget.toFixed(2)}x</p>
                <p className="text-[10px] text-violet-700 leading-tight">Target ROAS asli yang diminta user ({targetProfitPct}% net profit).</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-emerald-800">ROAS SIMULASI</p>
                  <span className="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-1.5 py-0.5 rounded">Diuji</span>
                </div>
                <p className="text-2xl font-black text-emerald-900">{simRoas.toFixed(2)}x</p>
                <p className="text-[10px] text-emerald-700 leading-tight">Nilai ROAS yang sedang diuji untuk simulasi performa.</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-purple-50/80 border border-purple-200 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-purple-800">ROAS SETTING</p>
                  <span className="text-[10px] bg-purple-200 text-purple-900 font-bold px-1.5 py-0.5 rounded">Buffer +{bufferPct}%</span>
                </div>
                <p className="text-2xl font-black text-purple-900">{roasSetting.toFixed(2)}x</p>
                <p className="text-[10px] text-purple-700 leading-tight">Rekomendasi setting Seller Center: Target ROAS × (1 + {bufferPct}%).</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-blue-800">ROAS BEP</p>
                  <span className="text-[10px] bg-blue-100 text-blue-900 font-bold px-1.5 py-0.5 rounded">Impas</span>
                </div>
                <p className="text-2xl font-black text-blue-900">{roasBep.toFixed(2)}x</p>
                <p className="text-[10px] text-blue-700 leading-tight">Batas minimal agar tidak rugi (0 profit).</p>
              </div>
            </div>

            {roasWorst !== undefined && worstName && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between text-xs text-amber-900">
                <span className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  ROAS BEP Terburuk: <strong>{roasWorst.toFixed(2)}x</strong>
                </span>
                <span className="text-[11px] text-amber-700">Varian/Produk Kritis: <strong>{worstName}</strong></span>
              </div>
            )}
          </div>
        )}

        {/* 5. SIMULASI TRANSAKSI JUMLAH ORDER & ROAS SIMULASI */}
        {isTargetFeasible && (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-gray-200/80">
              <div className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-violet-600" />
                <span className="text-xs font-black text-gray-900 uppercase">
                  SIMULASI INTERAKTIF ROAS & JUMLAH ORDER
                </span>
              </div>
              
              {setNumOrders && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-bold text-gray-600">Simulasi Order:</Label>
                  <div className="flex items-center gap-1 w-28">
                    <Input
                      type="number"
                      min={1}
                      value={numOrders}
                      onChange={(e) => setNumOrders(Math.max(1, Number(e.target.value) || 1))}
                      className="h-8 font-black text-xs text-center rounded-lg bg-white border-gray-300"
                    />
                    <span className="text-xs font-bold text-gray-500">order</span>
                  </div>
                </div>
              )}
            </div>

            {/* Simulasi breakdown transaksi */}
            <div className="p-3.5 bg-white rounded-xl border border-gray-200 text-xs space-y-2">
              <div className="flex justify-between items-center font-bold text-gray-700">
                <span>Total Pesanan Ditransaksikan ({nOrders} Order):</span>
                <span className="text-violet-700 font-black">{totalSimPcs} pcs ({nOrders} order × {minOrder} pcs)</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                <div className="p-2 bg-gray-50 rounded-lg">
                  <p className="text-gray-400 font-medium">Total Omzet Kotor</p>
                  <p className="font-black text-gray-900">{formatCurrency(totalSimRevenue)}</p>
                </div>
                <div className="p-2 bg-gray-50 rounded-lg">
                  <p className="text-gray-400 font-medium">Total HPP Produk</p>
                  <p className="font-bold text-rose-600">{formatCurrency(totalSimHppProduk)}</p>
                </div>
                <div className="p-2 bg-gray-50 rounded-lg">
                  <p className="text-gray-400 font-medium">Total Biaya Proses ({nOrders} order)</p>
                  <p className="font-bold text-amber-600">{formatCurrency(totalSimBiayaProses)}</p>
                </div>
                <div className="p-2 bg-violet-50 rounded-lg">
                  <p className="text-violet-700 font-medium">Total HPP Real</p>
                  <p className="font-black text-violet-900">{formatCurrency(totalSimHppReal)}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-gray-800">Uji ROAS Simulasi di Dashboard Iklan:</span>
                <span className="text-xs font-black text-violet-700 bg-violet-100 px-2.5 py-1 rounded-lg">
                  ROAS Simulasi: {simRoas.toFixed(2)}x
                </span>
              </div>

              <input
                type="range"
                min={1}
                max={25}
                step={0.1}
                value={simRoas}
                onChange={(e) => setSimRoas(Number(e.target.value))}
                className="w-full h-2 rounded-lg bg-violet-200 appearance-none cursor-pointer accent-violet-600"
              />

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-center text-xs">
                <div className="p-3 bg-white rounded-xl border border-gray-200">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Biaya Iklan Total ({nOrders} Order)</p>
                  <p className="font-black text-gray-900 mt-0.5">{formatCurrency(totalSimAdSpendBurden)}</p>
                </div>
                <div className="p-3 bg-white rounded-xl border border-gray-200">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Target Profit ({targetProfitPct}%)</p>
                  <p className="font-black text-emerald-700 mt-0.5">{formatCurrency(totalSimTargetProfit)}</p>
                </div>
                <div className="p-3 bg-white rounded-xl border border-gray-200">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Profit Bersih Aktual</p>
                  <p className={`font-black mt-0.5 ${totalSimProfitAfterAds >= totalSimTargetProfit ? 'text-emerald-600' : totalSimProfitAfterAds >= 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                    {formatCurrency(totalSimProfitAfterAds)}
                  </p>
                </div>
                <div className="p-3 bg-white rounded-xl border border-gray-200">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Margin Profit Aktual</p>
                  <p className={`font-black mt-0.5 ${simMarginAfterAdsPct >= targetProfitPct ? 'text-emerald-600' : simMarginAfterAdsPct >= 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                    {simMarginAfterAdsPct.toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* STATUS ANNOUNCEMENT */}
              <div className={`p-3 rounded-xl border text-xs leading-relaxed font-medium ${statusColor}`}>
                <span className="font-black mr-1">STATUS: {statusBadge}:</span>
                {statusDesc}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ==========================================================================
   MAIN COMPONENT: ROAS CALCULATOR
   (Trigger update for GitHub Sync)
   ========================================================================== */
export function ROASCalculator({ products: rawProducts = [], ingredients: rawIngredients = [], transactions: rawTransactions = [], user }: Props) {
  // --- DEFENSIVE SANITIZATION ---
  // Ensure products is always a valid array and its nested properties (varian, biaya_lain, bahan) are also valid arrays.
  const products = React.useMemo(() => {
    const arr = Array.isArray(rawProducts) ? rawProducts : [];
    return arr.map((p) => ({
      ...p,
      biaya_lain: Array.isArray(p?.biaya_lain) ? p.biaya_lain : [],
      varian: Array.isArray(p?.varian)
        ? p.varian.map((v) => ({
            ...v,
            bahan: Array.isArray(v?.bahan) ? v.bahan : [],
            biaya_lain: Array.isArray(v?.biaya_lain) ? v.biaya_lain : [],
          }))
        : [],
    }));
  }, [rawProducts]);
  
  const ingredients = Array.isArray(rawIngredients) ? rawIngredients : [];
  const transactions = Array.isArray(rawTransactions) ? rawTransactions : [];
  // ------------------------------

  // Mode Iklan: Varian, Produk, atau Grup
  const [adMode, setAdMode] = React.useState<'variant' | 'product' | 'group'>('variant');
  // Mode Perhitungan: CARI ROAS vs CARI HARGA
  const [calcMode, setCalcMode] = React.useState<'find_roas' | 'find_price'>('find_roas');

  // Shared Strategy Parameters
  const [targetProfitPct, setTargetProfitPct] = React.useState<number>(10);
  const [bufferPct, setBufferPct] = React.useState<number>(15);
  const [voucherNominalInput, setVoucherNominalInput] = React.useState<number>(0);
  const [includePpn, setIncludePpn] = React.useState<boolean>(false);
  const [ppnRate, setPpnRate] = React.useState<number>(11);

  // CARI HARGA specific states
  const [targetRoasInput, setTargetRoasInput] = React.useState<number>(6.5);
  const [voucherPctInput, setVoucherPctInput] = React.useState<number>(0);
  const [roundingOption, setRoundingOption] = React.useState<0 | 100 | 500 | 1000>(100);
  const [simulatedPriceOverride, setSimulatedPriceOverride] = React.useState<number | null>(null);

  // Explicit Data Handoff State (CARI HARGA -> CARI ROAS)
  const [priceHandoff, setPriceHandoff] = React.useState<{
    source: 'cari-harga';
    priceSource: 'recommended-price';
    productId: string;
    variantId?: string;
    recommendedPrice?: number;
    prices?: Record<string, number>;
    productConservativePrices?: Record<string, number>;
    timestamp: number;
  } | null>(null);

  // Mode 1: Varian States
  const [v1SelectedProductId, setV1SelectedProductId] = React.useState<string>(() => products[0]?.id || '');
  const [v1SelectedVariantId, setV1SelectedVariantId] = React.useState<string>(() => products[0]?.varian?.[0]?.id || '');
  const [v1OrderSim, setV1OrderSim] = React.useState<number>(10);
  const [v1SimRoas, setV1SimRoas] = React.useState<number>(0);

  // Mode 2: Produk States
  const [v2SelectedProductId, setV2SelectedProductId] = React.useState<string>(() => products[0]?.id || '');
  const [v2SelectedVariantIds, setV2SelectedVariantIds] = React.useState<string[]>([]);
  const [v2VariantWeights, setV2VariantWeights] = React.useState<Record<string, number>>({});
  const [v2OrderSim, setV2OrderSim] = React.useState<number>(10);
  const [v2SimRoas, setV2SimRoas] = React.useState<number>(0);

  // Mode 3: Grup States
  const [v3GroupName, setV3GroupName] = React.useState<string>('Grup Iklan CeuMilan');
  const [v3SelectedProductIds, setV3SelectedProductIds] = React.useState<string[]>(() =>
    products.slice(0, Math.min(3, products.length)).map((p) => p.id)
  );
  const [v3GroupProductVariants, setV3GroupProductVariants] = React.useState<Record<string, string[]>>({});
  const [v3ProductWeights, setV3ProductWeights] = React.useState<Record<string, number>>({});
  const [v3OrderSim, setV3OrderSim] = React.useState<number>(20);
  const [v3SimRoas, setV3SimRoas] = React.useState<number>(0);

  // Terapkan Harga State & Handlers
  const [confirmModalData, setConfirmModalData] = React.useState<{
    product: Product;
    variant: Variant;
    newPrice: number;
  } | null>(null);
  const [isApplyingPrice, setIsApplyingPrice] = React.useState(false);

  const handleApplyPriceRequest = React.useCallback(
    (product: Product, variant: Variant, newPrice: number) => {
      if (!product || !variant) {
        toast.error('Produk atau varian tidak valid.');
        return;
      }

      const roundedNewPrice = Math.round(Number(newPrice));
      if (isNaN(roundedNewPrice) || roundedNewPrice <= 0) {
        toast.error('Harga Baru tidak valid.');
        return;
      }

      const currentPrice = variant.harga_jual;
      if (roundedNewPrice === currentPrice) {
        toast.info('Harga sudah sesuai. Tidak ada perubahan.');
        return;
      }

      setConfirmModalData({
        product,
        variant,
        newPrice: roundedNewPrice,
      });
    },
    []
  );

  const executeApplyPrice = React.useCallback(async () => {
    if (!confirmModalData || !user?.uid) {
      toast.error('User tidak terotentikasi.');
      return;
    }

    const { product, variant, newPrice } = confirmModalData;
    setIsApplyingPrice(true);

    try {
      const updatedVariants = (product.varian || []).map((v) => {
        if (v.id === variant.id) {
          return {
            ...v,
            harga_jual: newPrice,
          };
        }
        return v;
      });

      const updatedProduct: Product = {
        ...product,
        varian: updatedVariants,
      };

      const productRef = doc(db, `users/${user.uid}/hpp/${product.id}`);
      await setDoc(productRef, sanitizeData(updatedProduct));

      toast.success(`Harga master produk ${product.nama} (${variant.nama}) berhasil diperbarui menjadi ${formatCurrency(newPrice)}`);
      setConfirmModalData(null);

      // Cleanly clear price handoff for this variant since it is now master
      setPriceHandoff((prev) => {
        if (!prev) return null;
        if (prev.productId === product.id) {
          const nextPrices = { ...prev.prices };
          delete nextPrices[variant.id];
          if (Object.keys(nextPrices).length === 0 && (!prev.variantId || prev.variantId === variant.id)) {
            return null;
          }
          return { ...prev, prices: nextPrices };
        }
        return prev;
      });
    } catch (error) {
      console.error('Gagal menerapkan harga:', error);
      toast.error('Gagal menerapkan harga.');
    } finally {
      setIsApplyingPrice(false);
    }
  }, [confirmModalData, user?.uid]);

  // Robust Price Resolution: Priority: 1. incomingRecommendedPrice, 2. manualOverride, 3. productMasterPrice
  const getEffectiveVariantPrice = React.useCallback(
    (productId: string, variant: Variant | null | undefined) => {
      const masterPrice = Number(variant?.harga_jual) || 0;
      if (!variant) {
        return {
          price: masterPrice,
          source: 'master' as const,
          isFromCariHarga: false,
          masterPrice,
        };
      }

      // Priority 1: Check Price Handoff from CARI HARGA
      if (priceHandoff && priceHandoff.source === 'cari-harga') {
        // A. Direct variantId match
        if (
          priceHandoff.variantId &&
          priceHandoff.variantId === variant.id &&
          typeof priceHandoff.recommendedPrice === 'number' &&
          priceHandoff.recommendedPrice > 0
        ) {
          const receivedPrice = priceHandoff.recommendedPrice;
          console.log({
            receivedPrice,
            priceSource: 'recommended-price',
            productMasterPrice: masterPrice,
            variant: variant.nama,
          });
          return {
            price: receivedPrice,
            source: 'recommended-price' as const,
            isFromCariHarga: true,
            masterPrice,
          };
        }

        // B. Check variantId in handoff.prices map
        if (
          priceHandoff.prices &&
          typeof priceHandoff.prices[variant.id] === 'number' &&
          priceHandoff.prices[variant.id] > 0
        ) {
          const receivedPrice = priceHandoff.prices[variant.id];
          console.log({
            receivedPrice,
            priceSource: 'recommended-price',
            productMasterPrice: masterPrice,
            variant: variant.nama,
          });
          return {
            price: receivedPrice,
            source: 'recommended-price' as const,
            isFromCariHarga: true,
            masterPrice,
          };
        }

        // C. If handoff is for this product with general recommendedPrice
        if (
          priceHandoff.productId === productId &&
          typeof priceHandoff.recommendedPrice === 'number' &&
          priceHandoff.recommendedPrice > 0 &&
          (!priceHandoff.variantId || priceHandoff.variantId === variant.id)
        ) {
          const receivedPrice = priceHandoff.recommendedPrice;
          console.log({
            receivedPrice,
            priceSource: 'recommended-price',
            productMasterPrice: masterPrice,
            variant: variant.nama,
          });
          return {
            price: receivedPrice,
            source: 'recommended-price' as const,
            isFromCariHarga: true,
            masterPrice,
          };
        }
      }

      // Priority 2: Check manual simulated override
      if (simulatedPriceOverride !== null && typeof simulatedPriceOverride === 'number' && simulatedPriceOverride > 0) {
        console.log({
          receivedPrice: simulatedPriceOverride,
          priceSource: 'recommended-price',
          productMasterPrice: masterPrice,
          variant: variant.nama,
        });
        return {
          price: simulatedPriceOverride,
          source: 'recommended-price' as const,
          isFromCariHarga: true,
          masterPrice,
        };
      }

      // Priority 3: Fallback to Product Master Price
      return {
        price: masterPrice,
        source: 'master' as const,
        isFromCariHarga: false,
        masterPrice,
      };
    },
    [priceHandoff, simulatedPriceOverride]
  );

  // Reset Handlers for price simulation
  const handleResetVariantPrice = React.useCallback((productId?: string, variantId?: string) => {
    setSimulatedPriceOverride(null);
    setPriceHandoff((prev) => {
      if (!prev) return null;
      if (variantId && prev.prices && Object.keys(prev.prices).length > 1) {
        const nextPrices = { ...prev.prices };
        delete nextPrices[variantId];
        return { ...prev, prices: nextPrices };
      }
      return null;
    });
    toast.info('Harga dikembalikan ke harga master produk');
  }, []);

  const handleResetProductPrices = React.useCallback((productId?: string) => {
    setSimulatedPriceOverride(null);
    setPriceHandoff(null);
    toast.info('Harga seluruh varian produk dikembalikan ke harga master');
  }, []);

  const handleResetGroupPrices = React.useCallback((productIds?: string[]) => {
    setSimulatedPriceOverride(null);
    setPriceHandoff(null);
    toast.info('Harga seluruh produk dalam grup dikembalikan ke harga master');
  }, []);

  // Transfer Handlers for each mode with explicit data handoff
  const handleTransferVariantToFindRoas = React.useCallback(
    (product: Product, variant: Variant, recommendedPrice: number) => {
      console.log({
        source: 'cari-harga',
        productId: product.id,
        variantId: variant.id,
        recommendedPrice,
        productMasterPrice: variant.harga_jual,
      });

      setPriceHandoff({
        source: 'cari-harga',
        priceSource: 'recommended-price',
        productId: product.id,
        variantId: variant.id,
        recommendedPrice,
        prices: { [variant.id]: recommendedPrice },
        timestamp: Date.now(),
      });

      setV1SelectedProductId(product.id);
      setV1SelectedVariantId(variant.id);
      setV1SimRoas(targetRoasInput);
      setAdMode('variant');
      setCalcMode('find_roas');

      const settingRoas = (targetRoasInput * (1 + bufferPct / 100)).toFixed(2);
      toast.success(
        `Harga rekomendasi ${formatCurrency(recommendedPrice)} berhasil diuji ke CARI ROAS (Target ROAS: ${targetRoasInput}x, ROAS Setting: ${settingRoas}x)`
      );
    },
    [targetRoasInput, bufferPct]
  );

  const handleTransferProductToFindRoas = React.useCallback(
    (
      product: Product,
      variantDetails: Array<{ variant: Variant; recommendedPrice: number }>
    ) => {
      const pricesMap: Record<string, number> = {};
      variantDetails.forEach((vd) => {
        pricesMap[vd.variant.id] = vd.recommendedPrice;
      });

      console.log({
        source: 'cari-harga',
        productId: product.id,
        prices: pricesMap,
        productMasterPrice: product.varian?.map((v) => ({ [v.nama]: v.harga_jual })),
      });

      setPriceHandoff({
        source: 'cari-harga',
        priceSource: 'recommended-price',
        productId: product.id,
        prices: pricesMap,
        timestamp: Date.now(),
      });

      setV2SelectedProductId(product.id);
      setV2SimRoas(targetRoasInput);
      setAdMode('product');
      setCalcMode('find_roas');

      toast.success(`Harga rekomendasi seluruh varian berhasil diteruskan ke mode CARI ROAS`);
    },
    [targetRoasInput]
  );

  const handleTransferSingleVariantFromProduct = React.useCallback(
    (product: Product, variant: Variant, recommendedPrice: number) => {
      console.log({
        source: 'cari-harga',
        productId: product.id,
        variantId: variant.id,
        recommendedPrice,
        productMasterPrice: variant.harga_jual,
      });

      setPriceHandoff({
        source: 'cari-harga',
        priceSource: 'recommended-price',
        productId: product.id,
        variantId: variant.id,
        recommendedPrice,
        prices: { [variant.id]: recommendedPrice },
        timestamp: Date.now(),
      });

      setV1SelectedProductId(product.id);
      setV1SelectedVariantId(variant.id);
      setV1SimRoas(targetRoasInput);
      setAdMode('variant');
      setCalcMode('find_roas');

      toast.success(
        `Harga varian ${variant.nama} (${formatCurrency(recommendedPrice)}) diteruskan ke CARI ROAS`
      );
    },
    [targetRoasInput]
  );

  const handleTransferGroupToFindRoas = React.useCallback(
    (
      productReverseDetails: Array<{
        product: Product;
        pConservativePrice: number;
        variantRevList: Array<{ variant: Variant; rev: { priceRecommended: number } }>;
      }>
    ) => {
      const allPricesMap: Record<string, number> = {};
      const prodConservativeMap: Record<string, number> = {};

      productReverseDetails.forEach((pd) => {
        prodConservativeMap[pd.product.id] = pd.pConservativePrice;
        pd.variantRevList.forEach((vr) => {
          allPricesMap[vr.variant.id] = vr.rev.priceRecommended;
        });
      });

      console.log({
        source: 'cari-harga',
        productId: 'group',
        prices: allPricesMap,
        productConservativePrices: prodConservativeMap,
      });

      setPriceHandoff({
        source: 'cari-harga',
        priceSource: 'recommended-price',
        productId: 'group',
        prices: allPricesMap,
        productConservativePrices: prodConservativeMap,
        timestamp: Date.now(),
      });

      setAdMode('group');
      setCalcMode('find_roas');
      setV3SimRoas(targetRoasInput);

      toast.success(`Harga rekomendasi seluruh grup produk diteruskan ke mode CARI ROAS`);
    },
    [targetRoasInput]
  );

  // Load Preferences
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_${user?.uid || 'guest'}`);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.adMode) setAdMode(data.adMode);
        if (data.targetRoasInput !== undefined) setTargetRoasInput(data.targetRoasInput);
        if (data.targetProfitPct !== undefined) setTargetProfitPct(data.targetProfitPct);
        if (data.bufferPct !== undefined) setBufferPct(data.bufferPct);
        if (data.voucherNominalInput !== undefined) setVoucherNominalInput(data.voucherNominalInput);
        if (data.includePpn !== undefined) setIncludePpn(data.includePpn);
        if (data.ppnRate !== undefined) setPpnRate(data.ppnRate);
        if (data.roundingOption !== undefined) setRoundingOption(data.roundingOption);
        if (data.v1OrderSim !== undefined) setV1OrderSim(data.v1OrderSim);
        if (data.v2OrderSim !== undefined) setV2OrderSim(data.v2OrderSim);
        if (data.v3OrderSim !== undefined) setV3OrderSim(data.v3OrderSim);
        if (data.v3GroupName) setV3GroupName(data.v3GroupName);
      }
    } catch {}
  }, [user?.uid]);

  const savePreferences = React.useCallback(
    (key: string, val: any) => {
      try {
        const saved = localStorage.getItem(`${STORAGE_KEY}_${user?.uid || 'guest'}`);
        const data = saved ? JSON.parse(saved) : {};
        data[key] = val;
        localStorage.setItem(`${STORAGE_KEY}_${user?.uid || 'guest'}`, JSON.stringify(data));
      } catch {}
    },
    [user?.uid]
  );

  // Sync Products & Variants
  React.useEffect(() => {
    if (Array.isArray(products) && products.length > 0) {
      if (!products.some((p) => p?.id === v1SelectedProductId)) {
        setV1SelectedProductId(products[0]?.id || '');
      }
      if (!products.some((p) => p?.id === v2SelectedProductId)) {
        setV2SelectedProductId(products[0]?.id || '');
      }
      if (v3SelectedProductIds.length === 0) {
        setV3SelectedProductIds(products.slice(0, Math.min(3, products.length)).map((p) => p?.id).filter(Boolean));
      }
    }
  }, [products, v1SelectedProductId, v2SelectedProductId, v3SelectedProductIds.length]);

  const v1ActiveProduct = React.useMemo(() => {
    if (!Array.isArray(products) || products.length === 0) return null;
    return products.find((p) => p?.id === v1SelectedProductId) || products[0];
  }, [products, v1SelectedProductId]);

  React.useEffect(() => {
    if (v1ActiveProduct && Array.isArray(v1ActiveProduct.varian) && v1ActiveProduct.varian.length > 0) {
      if (!v1ActiveProduct.varian.some((v) => v?.id === v1SelectedVariantId)) {
        setV1SelectedVariantId(v1ActiveProduct.varian[0]?.id || '');
      }
    }
  }, [v1ActiveProduct, v1SelectedVariantId]);

  const v1ActiveVariant = React.useMemo(() => {
    if (!v1ActiveProduct || !Array.isArray(v1ActiveProduct.varian) || v1ActiveProduct.varian.length === 0) return null;
    return v1ActiveProduct.varian.find((v) => v?.id === v1SelectedVariantId) || v1ActiveProduct.varian[0];
  }, [v1ActiveProduct, v1SelectedVariantId]);

  const v2ActiveProduct = React.useMemo(() => {
    if (!Array.isArray(products) || products.length === 0) return null;
    return products.find((p) => p?.id === v2SelectedProductId) || products[0];
  }, [products, v2SelectedProductId]);

  React.useEffect(() => {
    if (v2ActiveProduct && Array.isArray(v2ActiveProduct.varian)) {
      const allIds = v2ActiveProduct.varian.map((v) => v?.id).filter(Boolean);
      setV2SelectedVariantIds((prev) => {
        const validPrev = Array.isArray(prev) ? prev.filter((id) => allIds.includes(id)) : [];
        return validPrev.length > 0 ? validPrev : allIds;
      });
    }
  }, [v2ActiveProduct]);

  const { weights: v2HistWeights } = React.useMemo(() => {
    if (!v2ActiveProduct) return { weights: {} };
    return getHistoricalVariantSales(v2ActiveProduct.id, transactions);
  }, [v2ActiveProduct, transactions]);

  React.useEffect(() => {
    if (!v2ActiveProduct || !v2ActiveProduct.varian || v2SelectedVariantIds.length === 0) {
      setV2VariantWeights({});
      return;
    }

    const selectedVariants = v2ActiveProduct.varian.filter((v) => v2SelectedVariantIds.includes(v.id));
    const newWeights: Record<string, number> = {};

    let totalHistWeight = 0;
    selectedVariants.forEach((v) => {
      totalHistWeight += v2HistWeights[v.id] || 0;
    });

    if (totalHistWeight > 0) {
      selectedVariants.forEach((v) => {
        newWeights[v.id] = Math.round(((v2HistWeights[v.id] || 0) / totalHistWeight) * 100);
      });
      const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
      if (sum !== 100 && sum > 0) {
        const diff = 100 - sum;
        if (selectedVariants[0]) {
          newWeights[selectedVariants[0].id] = (newWeights[selectedVariants[0].id] || 0) + diff;
        }
      }
    } else {
      const equal = Math.floor(100 / selectedVariants.length);
      const rem = 100 - equal * selectedVariants.length;
      selectedVariants.forEach((v, idx) => {
        newWeights[v.id] = equal + (idx === 0 ? rem : 0);
      });
    }

    setV2VariantWeights(newWeights);
  }, [v2ActiveProduct, v2SelectedVariantIds, v2HistWeights]);

  const { weights: v3HistProductWeights } = React.useMemo(() => {
    return getHistoricalProductSales(v3SelectedProductIds, transactions);
  }, [v3SelectedProductIds, transactions]);

  React.useEffect(() => {
    if (v3SelectedProductIds.length === 0) {
      setV3ProductWeights({});
      return;
    }
    const newWeights: Record<string, number> = {};
    let totalHist = 0;
    v3SelectedProductIds.forEach((pId) => {
      totalHist += v3HistProductWeights[pId] || 0;
    });

    if (totalHist > 0) {
      v3SelectedProductIds.forEach((pId) => {
        newWeights[pId] = Math.round(((v3HistProductWeights[pId] || 0) / totalHist) * 100);
      });
      const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
      if (sum !== 100 && sum > 0) {
        const diff = 100 - sum;
        if (v3SelectedProductIds[0]) {
          newWeights[v3SelectedProductIds[0]] = (newWeights[v3SelectedProductIds[0]] || 0) + diff;
        }
      }
    } else {
      const equal = Math.floor(100 / v3SelectedProductIds.length);
      const rem = 100 - equal * v3SelectedProductIds.length;
      v3SelectedProductIds.forEach((pId, idx) => {
        newWeights[pId] = equal + (idx === 0 ? rem : 0);
      });
    }
    setV3ProductWeights(newWeights);
  }, [v3SelectedProductIds, v3HistProductWeights]);

  // Run engine self-tests on mount
  React.useEffect(() => {
    const testResults = runUnitEconomicsSelfTests();
    if (!testResults.success) {
      console.warn('Unit Economics Self-Test WARNING:', testResults.results);
    }
  }, []);

  /* ========================================================================
     MATHEMATICAL ENGINE: MODE 1 (IKLAN VARIAN)
     ======================================================================== */
  const v1Calculation = React.useMemo(() => {
    if (!v1ActiveProduct || !v1ActiveVariant) return null;

    const { price, source, isFromCariHarga, masterPrice } = getEffectiveVariantPrice(
      v1ActiveProduct.id,
      v1ActiveVariant
    );
    const hppPcs = calcHppPerPcs(v1ActiveVariant, ingredients);
    const minOrder = Math.max(1, Number(v1ActiveVariant.min_order) || 1);
    const numOrders = Math.max(1, v1OrderSim);

    const feeConfig = extractFeeRates(v1ActiveProduct, v1ActiveVariant);

    const unitEcon = calculateUnitEconomics({
      sellingPrice: price,
      hppPcs,
      minOrder,
      nominalPerOrder: feeConfig.nominalPerOrder,
      nominalPerUnit: feeConfig.nominalPerUnit,
      percentRate: feeConfig.percentRate,
      additionalCosts: feeConfig.allFees,
      voucherNominal: voucherNominalInput,
      voucherPct: voucherPctInput,
      includePpn,
      ppnRate,
      targetProfitPct,
      actualRoas: v1SimRoas > 0 ? v1SimRoas : targetRoasInput,
      targetRoas: targetRoasInput,
      bufferPct,
      numOrders,
    });

    return {
      product: v1ActiveProduct,
      variant: v1ActiveVariant,
      unitEcon,
      price,
      basePrice: masterPrice,
      hppPcs,
      minOrder,
      feeConfig,
      numOrders,
      totalUnits: unitEcon.totalUnits,
      grossRevenue: unitEcon.totalGrossRevenue,
      totalOmzetReal: unitEcon.totalOmzetReal,
      totalHppReal: unitEcon.totalHppReal,
      profitBeforeAdsTotal: unitEcon.totalProfitBeforeAds,
      targetProfitTotal: unitEcon.totalTargetProfit,
      maxAdSpendTotal: unitEcon.totalMaxAdSpend,
      isPriceOverridden: isFromCariHarga,
      priceSource: source,
    };
  }, [
    v1ActiveProduct,
    v1ActiveVariant,
    getEffectiveVariantPrice,
    ingredients,
    v1OrderSim,
    v1SimRoas,
    targetRoasInput,
    targetProfitPct,
    bufferPct,
    voucherNominalInput,
    voucherPctInput,
    includePpn,
    ppnRate,
  ]);

  // CARI HARGA Engine: Mode 1
  const v1ReverseCalc = React.useMemo(() => {
    if (!v1ActiveProduct || !v1ActiveVariant) return null;
    const hppPcs = calcHppPerPcs(v1ActiveVariant, ingredients);
    const minOrder = Math.max(1, Number(v1ActiveVariant.min_order) || 1);
    const feeConfig = extractFeeRates(v1ActiveProduct, v1ActiveVariant);

    const rev = calculateReversePrice({
      hppPcs,
      minOrder,
      nominalPerOrder: feeConfig.nominalPerOrder,
      nominalPerUnit: feeConfig.nominalPerUnit,
      percentRate: feeConfig.percentRate,
      additionalCosts: feeConfig.allFees,
      voucherNominal: voucherNominalInput,
      voucherPct: voucherPctInput,
      targetRoas: targetRoasInput,
      targetProfitPct,
      includePpn,
      ppnRate,
      roundingStep: roundingOption,
    });

    // Run verification pass using calculateUnitEconomics
    const val = calculateUnitEconomics({
      sellingPrice: rev.priceRecommended,
      hppPcs,
      minOrder,
      nominalPerOrder: feeConfig.nominalPerOrder,
      nominalPerUnit: feeConfig.nominalPerUnit,
      percentRate: feeConfig.percentRate,
      additionalCosts: feeConfig.allFees,
      voucherNominal: voucherNominalInput,
      voucherPct: voucherPctInput,
      includePpn,
      ppnRate,
      targetProfitPct,
      actualRoas: targetRoasInput,
      targetRoas: targetRoasInput,
      bufferPct,
    });

    return {
      rev,
      priceRecommended: rev.priceRecommended,
      priceExact: rev.priceExact,
      realHppPerUnit: rev.realHppPerUnit,
      isFeasible: rev.isFeasible,
      errorMessage: rev.errorMessage,
      validation: val,
      hppPcs,
      minOrder,
      feeConfig,
    };
  }, [
    v1ActiveProduct,
    v1ActiveVariant,
    ingredients,
    voucherNominalInput,
    voucherPctInput,
    targetRoasInput,
    targetProfitPct,
    bufferPct,
    includePpn,
    ppnRate,
    roundingOption,
  ]);

  React.useEffect(() => {
    if (v1Calculation && v1Calculation.unitEcon.roasTarget > 0) {
      setV1SimRoas((prev) => (prev === 0 ? targetRoasInput : prev));
    }
  }, [v1Calculation, targetRoasInput]);

  /* ========================================================================
     MATHEMATICAL ENGINE: MODE 2 (IKLAN PRODUK — CONSERVATIVE MULTI-VARIANT)
     ======================================================================== */
  const v2Calculation = React.useMemo(() => {
    if (!v2ActiveProduct || !v2ActiveProduct.varian || v2SelectedVariantIds.length === 0) {
      return null;
    }

    const selectedVariants = v2ActiveProduct.varian.filter((v) => v2SelectedVariantIds.includes(v.id));
    if (selectedVariants.length === 0) return null;

    const totalWeightSum = selectedVariants.reduce((sum, v) => sum + (v2VariantWeights[v.id] || 0), 0) || 100;
    const normWeights: Record<string, number> = {};
    selectedVariants.forEach((v) => {
      normWeights[v.id] = (v2VariantWeights[v.id] || 0) / totalWeightSum;
    });

    let weightedPrice = 0;
    let weightedBasePrice = 0;
    let weightedHppPcs = 0;
    let weightedMinOrder = 0;
    let anyPriceOverridden = false;

    const feeConfig = extractFeeRates(v2ActiveProduct);
    const numOrders = Math.max(1, v2OrderSim);

    const variantDetails = selectedVariants.map((v) => {
      const { price, source, isFromCariHarga, masterPrice } = getEffectiveVariantPrice(
        v2ActiveProduct.id,
        v
      );
      if (isFromCariHarga) {
        anyPriceOverridden = true;
      }
      const hppPcs = calcHppPerPcs(v, ingredients);
      const minOrder = Math.max(1, Number(v.min_order) || 1);
      const w = normWeights[v.id] || 0;
      const vFeeConfig = extractFeeRates(v2ActiveProduct, v);

      weightedPrice += price * w;
      weightedBasePrice += masterPrice * w;
      weightedHppPcs += hppPcs * w;
      weightedMinOrder += minOrder * w;

      const vEcon = calculateUnitEconomics({
        sellingPrice: price,
        hppPcs,
        minOrder,
        nominalPerOrder: vFeeConfig.nominalPerOrder,
        nominalPerUnit: vFeeConfig.nominalPerUnit,
        percentRate: vFeeConfig.percentRate,
        additionalCosts: vFeeConfig.allFees,
        voucherNominal: voucherNominalInput,
        voucherPct: voucherPctInput,
        includePpn,
        ppnRate,
        targetProfitPct,
        actualRoas: v2SimRoas > 0 ? v2SimRoas : targetRoasInput,
        targetRoas: targetRoasInput,
        bufferPct,
        numOrders,
      });

      return {
        variant: v,
        price,
        basePrice: masterPrice,
        hppPcs,
        minOrder,
        weightPct: Math.round(w * 100),
        vEcon,
        vFeeConfig,
        isPriceOverridden: isFromCariHarga,
        priceSource: source,
      };
    });

    const effectiveMinOrder = Math.max(1, Math.round(weightedMinOrder));

    const productEcon = calculateUnitEconomics({
      sellingPrice: weightedPrice,
      hppPcs: weightedHppPcs,
      minOrder: effectiveMinOrder,
      nominalPerOrder: feeConfig.nominalPerOrder,
      nominalPerUnit: feeConfig.nominalPerUnit,
      percentRate: feeConfig.percentRate,
      additionalCosts: feeConfig.allFees,
      voucherNominal: voucherNominalInput,
      voucherPct: voucherPctInput,
      includePpn,
      ppnRate,
      targetProfitPct,
      actualRoas: v2SimRoas > 0 ? v2SimRoas : targetRoasInput,
      targetRoas: targetRoasInput,
      bufferPct,
      numOrders,
    });

    let worstDetail = variantDetails[0];
    variantDetails.forEach((vd) => {
      if (vd.vEcon.roasBep > (worstDetail?.vEcon.roasBep || 0)) {
        worstDetail = vd;
      }
    });

    return {
      product: v2ActiveProduct,
      selectedVariantsCount: selectedVariants.length,
      variantDetails,
      effectiveMinOrder,
      numOrders,
      weightedPrice,
      weightedBasePrice,
      weightedHppPcs,
      productEcon,
      isPriceOverridden: anyPriceOverridden,
      roasWorst: worstDetail ? worstDetail.vEcon.roasBep : 0,
      worstVariantName: worstDetail?.variant?.nama || '-',
    };
  }, [
    v2ActiveProduct,
    v2SelectedVariantIds,
    getEffectiveVariantPrice,
    ingredients,
    v2VariantWeights,
    v2OrderSim,
    v2SimRoas,
    targetRoasInput,
    targetProfitPct,
    bufferPct,
    voucherNominalInput,
    voucherPctInput,
    includePpn,
    ppnRate,
  ]);

  // CARI HARGA Engine: Mode 2 (CONSERVATIVE PRICING)
  const v2ReverseCalc = React.useMemo(() => {
    if (!v2ActiveProduct || !v2ActiveProduct.varian || v2SelectedVariantIds.length === 0) return null;
    const selectedVariants = v2ActiveProduct.varian.filter((v) => v2SelectedVariantIds.includes(v.id));
    if (selectedVariants.length === 0) return null;

    const totalWeightSum = selectedVariants.reduce((sum, v) => sum + (v2VariantWeights[v.id] || 0), 0) || 100;
    const normWeights: Record<string, number> = {};
    selectedVariants.forEach((v) => {
      normWeights[v.id] = (v2VariantWeights[v.id] || 0) / totalWeightSum;
    });

    const feeConfig = extractFeeRates(v2ActiveProduct);

    // 1. Calculate individual reverse price per variant
    const variantReverseDetails = selectedVariants.map((v) => {
      const hppPcs = calcHppPerPcs(v, ingredients);
      const minOrder = Math.max(1, Number(v.min_order) || 1);
      const w = normWeights[v.id] || 0;
      const vFeeConfig = extractFeeRates(v2ActiveProduct, v);

      const singleRev = calculateReversePrice({
        hppPcs,
        minOrder,
        nominalPerOrder: vFeeConfig.nominalPerOrder,
        nominalPerUnit: vFeeConfig.nominalPerUnit,
        percentRate: vFeeConfig.percentRate,
        additionalCosts: vFeeConfig.allFees,
        voucherNominal: voucherNominalInput,
        voucherPct: voucherPctInput,
        targetRoas: targetRoasInput,
        targetProfitPct,
        includePpn,
        ppnRate,
        roundingStep: roundingOption,
      });

      return {
        variant: v,
        weightPct: Math.round(w * 100),
        hppPcs,
        minOrder,
        vFeeConfig,
        rev: singleRev,
      };
    });

    // 2. CONSERVATIVE PRICING: Find heaviest variant (highest required exact price)
    let maxRequiredPriceExact = 0;
    let heaviestDetail = variantReverseDetails[0];

    variantReverseDetails.forEach((vd) => {
      if (vd.rev.priceExact > maxRequiredPriceExact) {
        maxRequiredPriceExact = vd.rev.priceExact;
        heaviestDetail = vd;
      }
    });

    const conservativePriceRecommended = roundPrice(maxRequiredPriceExact, roundingOption);

    // 3. VALIDATION PASS FOR EVERY VARIANT AT THE CONSERVATIVE PRICE
    let allVariantsPassed = true;
    const conservativeValidationDetails = variantReverseDetails.map((vd) => {
      const val = calculateUnitEconomics({
        sellingPrice: conservativePriceRecommended,
        hppPcs: vd.hppPcs,
        minOrder: vd.minOrder,
        nominalPerOrder: vd.vFeeConfig.nominalPerOrder,
        nominalPerUnit: vd.vFeeConfig.nominalPerUnit,
        percentRate: vd.vFeeConfig.percentRate,
        additionalCosts: vd.vFeeConfig.allFees,
        voucherNominal: voucherNominalInput,
        voucherPct: voucherPctInput,
        includePpn,
        ppnRate,
        targetProfitPct,
        actualRoas: targetRoasInput,
        targetRoas: targetRoasInput,
      });

      if (!val.isTargetFeasible || val.actualProfitPercent < (targetProfitPct - 0.05)) {
        allVariantsPassed = false;
      }

      return {
        variant: vd.variant,
        weightPct: vd.weightPct,
        hppPcs: vd.hppPcs,
        validation: val,
      };
    });

    return {
      conservativePriceRecommended,
      maxRequiredPriceExact,
      heaviestVariantName: heaviestDetail?.variant?.nama || '-',
      heaviestHpp: heaviestDetail?.hppPcs || 0,
      isConservativeFeasible: allVariantsPassed && conservativePriceRecommended > 0,
      variantReverseDetails,
      conservativeValidationDetails,
    };
  }, [
    v2ActiveProduct,
    v2SelectedVariantIds,
    ingredients,
    v2VariantWeights,
    voucherNominalInput,
    voucherPctInput,
    targetRoasInput,
    targetProfitPct,
    includePpn,
    ppnRate,
    roundingOption,
  ]);

  React.useEffect(() => {
    if (v2Calculation && v2Calculation.productEcon.roasTarget > 0) {
      setV2SimRoas((prev) => (prev === 0 ? Number(v2Calculation.productEcon.roasTarget.toFixed(2)) : prev));
    }
  }, [v2Calculation]);

  /* ========================================================================
     MATHEMATICAL ENGINE: MODE 3 (IKLAN GRUP — CONSOLIDATED ECONOMICS)
     ======================================================================== */
  const v3Calculation = React.useMemo(() => {
    if (v3SelectedProductIds.length === 0) return null;

    const groupProds = products.filter((p) => v3SelectedProductIds.includes(p.id));
    if (groupProds.length === 0) return null;

    const totalProductWeightSum =
      groupProds.reduce((sum, p) => sum + (v3ProductWeights[p.id] || 0), 0) || 100;
    const numOrders = Math.max(1, v3OrderSim);

    let groupWeightedPrice = 0;
    let groupWeightedBasePrice = 0;
    let groupWeightedHppPcs = 0;
    let groupWeightedMinOrder = 0;
    let anyPriceOverridden = false;

    const productBreakdown = groupProds.map((prod) => {
      const prodWeight = (v3ProductWeights[prod.id] || 0) / totalProductWeightSum;
      const allVariants = prod.varian || [];
      const activeVarIds = v3GroupProductVariants[prod.id] || allVariants.map((v) => v.id);
      const activeVariants = allVariants.filter((v) => activeVarIds.includes(v.id));
      const vCount = Math.max(1, activeVariants.length);

      let pWeightedPrice = 0;
      let pWeightedBasePrice = 0;
      let pWeightedHppPcs = 0;
      let pWeightedMinOrder = 0;

      activeVariants.forEach((v) => {
        const { price, isFromCariHarga, masterPrice } = getEffectiveVariantPrice(prod.id, v);
        if (isFromCariHarga) {
          anyPriceOverridden = true;
        }
        const vHpp = calcHppPerPcs(v, ingredients);
        const vMin = Math.max(1, Number(v.min_order) || 1);
        const vShare = 1 / vCount;

        pWeightedPrice += price * vShare;
        pWeightedBasePrice += masterPrice * vShare;
        pWeightedHppPcs += vHpp * vShare;
        pWeightedMinOrder += vMin * vShare;
      });

      const pMinOrder = Math.max(1, Math.round(pWeightedMinOrder));
      const pFeeConfig = extractFeeRates(prod);

      groupWeightedPrice += pWeightedPrice * prodWeight;
      groupWeightedBasePrice += pWeightedBasePrice * prodWeight;
      groupWeightedHppPcs += pWeightedHppPcs * prodWeight;
      groupWeightedMinOrder += pMinOrder * prodWeight;

      const pEcon = calculateUnitEconomics({
        sellingPrice: pWeightedPrice,
        hppPcs: pWeightedHppPcs,
        minOrder: pMinOrder,
        nominalPerOrder: pFeeConfig.nominalPerOrder,
        nominalPerUnit: pFeeConfig.nominalPerUnit,
        percentRate: pFeeConfig.percentRate,
        voucherNominal: voucherNominalInput,
        voucherPct: voucherPctInput,
        includePpn,
        ppnRate,
        targetProfitPct,
        actualRoas: v3SimRoas > 0 ? v3SimRoas : targetRoasInput,
        targetRoas: targetRoasInput,
        bufferPct,
        numOrders,
      });

      return {
        product: prod,
        weightPct: Math.round(prodWeight * 100),
        activeVariantsCount: activeVariants.length,
        minOrder: pMinOrder,
        weightedPrice: pWeightedPrice,
        weightedBasePrice: pWeightedBasePrice,
        weightedHppPcs: pWeightedHppPcs,
        pEcon,
      };
    });

    const effectiveMinOrder = Math.max(1, Math.round(groupWeightedMinOrder));
    const defaultFeeConfig = extractFeeRates(groupProds[0]);

    const groupEcon = calculateUnitEconomics({
      sellingPrice: groupWeightedPrice,
      hppPcs: groupWeightedHppPcs,
      minOrder: effectiveMinOrder,
      nominalPerOrder: defaultFeeConfig.nominalPerOrder,
      nominalPerUnit: defaultFeeConfig.nominalPerUnit,
      percentRate: defaultFeeConfig.percentRate,
      voucherNominal: voucherNominalInput,
      voucherPct: voucherPctInput,
      includePpn,
      ppnRate,
      targetProfitPct,
      actualRoas: v3SimRoas > 0 ? v3SimRoas : targetRoasInput,
      targetRoas: targetRoasInput,
      bufferPct,
      numOrders,
    });

    let worstProduct = productBreakdown[0];
    productBreakdown.forEach((pb) => {
      if (pb.pEcon.roasBep > (worstProduct?.pEcon.roasBep || 0)) {
        worstProduct = pb;
      }
    });

    return {
      groupName: v3GroupName,
      productsCount: groupProds.length,
      groupWeightedPrice,
      groupWeightedBasePrice,
      groupWeightedHppPcs,
      groupEcon,
      isPriceOverridden: anyPriceOverridden,
      roasWorstGroup: worstProduct ? worstProduct.pEcon.roasBep : 0,
      worstProductName: worstProduct?.product?.nama || '-',
      productBreakdown,
    };
  }, [
    v3SelectedProductIds,
    products,
    v3ProductWeights,
    v3GroupProductVariants,
    getEffectiveVariantPrice,
    ingredients,
    v3OrderSim,
    v3SimRoas,
    targetRoasInput,
    targetProfitPct,
    bufferPct,
    voucherNominalInput,
    voucherPctInput,
    includePpn,
    ppnRate,
    v3GroupName,
  ]);

  // CARI HARGA Engine: Mode 3
  const v3ReverseCalc = React.useMemo(() => {
    if (v3SelectedProductIds.length === 0) return null;
    const groupProds = products.filter((p) => v3SelectedProductIds.includes(p.id));
    if (groupProds.length === 0) return null;

    const totalProductWeightSum =
      groupProds.reduce((sum, p) => sum + (v3ProductWeights[p.id] || 0), 0) || 100;

    const productReverseDetails = groupProds.map((prod) => {
      const prodWeight = (v3ProductWeights[prod.id] || 0) / totalProductWeightSum;
      const allVariants = prod.varian || [];
      const activeVarIds = v3GroupProductVariants[prod.id] || allVariants.map((v) => v.id);
      const activeVariants = allVariants.filter((v) => activeVarIds.includes(v.id));
      const pFeeConfig = extractFeeRates(prod);

      // Find conservative price across variants in this product
      let pMaxExact = 0;
      let pHeaviestVar = activeVariants[0];

      const variantRevList = activeVariants.map((v) => {
        const vHpp = calcHppPerPcs(v, ingredients);
        const vMin = Math.max(1, Number(v.min_order) || 1);
        const singleRev = calculateReversePrice({
          hppPcs: vHpp,
          minOrder: vMin,
          nominalPerOrder: pFeeConfig.nominalPerOrder,
          nominalPerUnit: pFeeConfig.nominalPerUnit,
          percentRate: pFeeConfig.percentRate,
          voucherNominal: voucherNominalInput,
          voucherPct: voucherPctInput,
          targetRoas: targetRoasInput,
          targetProfitPct,
          includePpn,
          ppnRate,
          roundingStep: roundingOption,
        });

        if (singleRev.priceExact > pMaxExact) {
          pMaxExact = singleRev.priceExact;
          pHeaviestVar = v;
        }

        return {
          variant: v,
          vHpp,
          vMin,
          rev: singleRev,
        };
      });

      const pConservativePrice = roundPrice(pMaxExact, roundingOption);

      // Validation pass for this product
      let pAllPassed = true;
      const pValidationList = variantRevList.map((vr) => {
        const val = calculateUnitEconomics({
          sellingPrice: pConservativePrice,
          hppPcs: vr.vHpp,
          minOrder: vr.vMin,
          nominalPerOrder: pFeeConfig.nominalPerOrder,
          nominalPerUnit: pFeeConfig.nominalPerUnit,
          percentRate: pFeeConfig.percentRate,
          voucherNominal: voucherNominalInput,
          voucherPct: voucherPctInput,
          includePpn,
          ppnRate,
          targetProfitPct,
          actualRoas: targetRoasInput,
          targetRoas: targetRoasInput,
        });

        if (!val.isTargetFeasible || val.actualProfitPercent < (targetProfitPct - 0.05)) {
          pAllPassed = false;
        }

        return {
          variant: vr.variant,
          validation: val,
        };
      });

      return {
        product: prod,
        weightPct: Math.round(prodWeight * 100),
        heaviestVarName: pHeaviestVar?.nama || '-',
        pConservativePrice,
        pMaxExact,
        pIsFeasible: pAllPassed && pConservativePrice > 0,
        feeConfig: pFeeConfig,
        variantRevList,
        pValidationList,
      };
    });

    return {
      productReverseDetails,
    };
  }, [
    v3SelectedProductIds,
    products,
    v3ProductWeights,
    v3GroupProductVariants,
    ingredients,
    voucherNominalInput,
    voucherPctInput,
    targetRoasInput,
    targetProfitPct,
    includePpn,
    ppnRate,
    roundingOption,
  ]);

  React.useEffect(() => {
    if (v3Calculation && v3Calculation.groupEcon.roasTarget > 0) {
      setV3SimRoas((prev) => (prev === 0 ? Number(v3Calculation.groupEcon.roasTarget.toFixed(2)) : prev));
    }
  }, [v3Calculation]);

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER NAVBAR ROAS ENGINE */}
      <div className="p-5 md:p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-violet-950 to-slate-900 text-white shadow-xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[10px] font-black tracking-widest uppercase">
                ROAS ENGINE V5
              </span>
              <Badge variant="outline" className="border-emerald-400/40 text-emerald-300 bg-emerald-500/10 text-xs font-bold">
                Target Profit Unit Economics
              </Badge>
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
              Kalkulator Target ROAS & Profit Bersih
            </h1>
          </div>

          {/* Selector Mode Perhitungan (CARI ROAS vs CARI HARGA) */}
          <div className="flex items-center gap-1 bg-white/10 p-1.5 rounded-2xl border border-white/15">
            <button
              type="button"
              onClick={() => setCalcMode('find_roas')}
              className={`py-2 px-4 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                calcMode === 'find_roas'
                  ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md'
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Calculator className="w-4 h-4" />
              <span>CARI ROAS</span>
            </button>

            <button
              type="button"
              onClick={() => setCalcMode('find_price')}
              className={`py-2 px-4 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                calcMode === 'find_price'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md'
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span>CARI HARGA</span>
            </button>
          </div>
        </div>

        {/* Tab Sub-Mode Iklan (Varian, Produk, Grup) */}
        <div className="grid grid-cols-3 gap-2 p-1.5 bg-black/30 rounded-2xl border border-white/10">
          <button
            type="button"
            onClick={() => {
              setAdMode('variant');
              savePreferences('adMode', 'variant');
            }}
            className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
              adMode === 'variant'
                ? 'bg-white text-slate-900 shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sliders className="w-4 h-4 shrink-0 text-violet-600" />
            <span>IKLAN VARIAN</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAdMode('product');
              savePreferences('adMode', 'product');
            }}
            className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
              adMode === 'product'
                ? 'bg-white text-slate-900 shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Package className="w-4 h-4 shrink-0 text-violet-600" />
            <span>IKLAN PRODUK</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAdMode('group');
              savePreferences('adMode', 'group');
            }}
            className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
              adMode === 'group'
                ? 'bg-white text-slate-900 shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0 text-violet-600" />
            <span>IKLAN GRUP</span>
          </button>
        </div>
      </div>

      {/* PARAMETER STRATEGI (TARGET ROAS, TARGET PROFIT BERSIH, BUFFER, VOUCHER, PPN) */}
      <Card className="rounded-3xl border border-violet-100 shadow-sm bg-white">
        <CardContent className="p-5 md:p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                Parameter Strategi Iklan
              </span>
              <h2 className="text-sm font-bold text-gray-900">Target ROAS, Target Profit Bersih & Pengaturan Iklan</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Target ROAS (Asli dari User) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                <span>Target ROAS (x)</span>
                <span className="text-violet-700 font-black">{targetRoasInput.toFixed(1)}x</span>
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={targetRoasInput}
                  onChange={(e) => {
                    const val = Math.max(0.1, Number(e.target.value) || 0.1);
                    setTargetRoasInput(val);
                    savePreferences('targetRoasInput', val);
                  }}
                  className="rounded-xl h-10 font-bold text-xs"
                />
                {[5, 6.5, 8, 10].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setTargetRoasInput(preset);
                      savePreferences('targetRoasInput', preset);
                    }}
                    className={`h-10 px-2 rounded-xl text-xs font-bold transition-all ${
                      targetRoasInput === preset
                        ? 'bg-violet-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {preset}x
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 leading-tight">
                Target ROAS asli minimum yang diinginkan seller.
              </p>
            </div>

            {/* Target Profit Bersih Setelah Iklan */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                <span>Target Profit Bersih (%)</span>
                <span className="text-violet-700 font-black">{targetProfitPct}%</span>
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={targetProfitPct}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    setTargetProfitPct(val);
                    savePreferences('targetProfitPct', val);
                  }}
                  className="rounded-xl h-10 font-bold text-xs"
                />
                {[5, 10, 15, 20].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setTargetProfitPct(preset);
                      savePreferences('targetProfitPct', preset);
                    }}
                    className={`h-10 px-2 rounded-xl text-xs font-bold transition-all ${
                      targetProfitPct === preset
                        ? 'bg-violet-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 leading-tight">
                Target profit minimum yang ingin dipertahankan setelah seluruh biaya.
              </p>
            </div>

            {/* Buffer ROAS */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                <span>Buffer ROAS Setting</span>
                <span className="text-violet-700 font-black">+{bufferPct}%</span>
              </Label>
              <div className="flex items-center gap-1">
                {[0, 5, 10, 15, 20].map((buf) => (
                  <button
                    key={buf}
                    type="button"
                    onClick={() => {
                      setBufferPct(buf);
                      savePreferences('bufferPct', buf);
                    }}
                    className={`flex-1 h-10 rounded-xl text-xs font-bold transition-all ${
                      bufferPct === buf
                        ? 'bg-violet-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {buf}%
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400">Ruang keamanan Seller Center tanpa mengubah Target ROAS.</p>
            </div>

            {/* Voucher Nominal */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                <span>Voucher Seller (Rp/unit)</span>
                <span className="text-violet-700 font-black">{formatCurrency(voucherNominalInput)}</span>
              </Label>
              <Input
                type="number"
                min={0}
                step={500}
                value={voucherNominalInput}
                onChange={(e) => {
                  const val = Math.max(0, Number(e.target.value) || 0);
                  setVoucherNominalInput(val);
                  savePreferences('voucherNominalInput', val);
                }}
                className="rounded-xl h-10 font-bold text-xs"
                placeholder="0"
              />
              <p className="text-[11px] text-gray-400">Nominal voucher maksimal per unit yang ditanggung seller.</p>
            </div>

            {/* PPN Biaya Iklan */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                <span>PPN Biaya Iklan</span>
                <span className="text-xs font-bold text-gray-500">{includePpn ? `Aktif (${ppnRate}%)` : 'Non-aktif'}</span>
              </Label>
              <button
                type="button"
                onClick={() => {
                  const next = !includePpn;
                  setIncludePpn(next);
                  savePreferences('includePpn', next);
                }}
                className={`w-full h-10 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  includePpn ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Percent className="w-3.5 h-3.5" />
                <span>{includePpn ? 'PPN Aktif (11%)' : 'Tanpa PPN (0%)'}</span>
              </button>
              <p className="text-[11px] text-gray-400">Centang jika tagihan iklan platform dipotong PPN 11%.</p>
            </div>
          </div>

          {/* Separation Formula Summary Bar */}
          <div className="p-3 bg-violet-50/60 rounded-2xl border border-violet-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-600">Rumus Pemisahan Parameter:</span>
              <span className="bg-white px-2 py-0.5 rounded-lg border border-violet-200 font-black text-violet-900">
                Target ROAS = {targetRoasInput.toFixed(2)}x
              </span>
              <span className="text-gray-400 font-bold">×</span>
              <span className="bg-white px-2 py-0.5 rounded-lg border border-purple-200 font-black text-purple-900">
                (1 + Buffer {bufferPct}%)
              </span>
              <span className="text-gray-400 font-bold">=</span>
              <span className="bg-purple-600 text-white px-2.5 py-0.5 rounded-lg font-black shadow-xs">
                ROAS Setting = {(targetRoasInput * (1 + bufferPct / 100)).toFixed(2)}x
              </span>
            </div>
            <p className="text-[11px] text-violet-700 font-medium">
              💡 Target ROAS adalah target profit {targetProfitPct}%. ROAS Setting adalah input rekomendasi ke Seller Center.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ====================================================================
          MODE: CARI ROAS
          ==================================================================== */}
      {calcMode === 'find_roas' && (
        <div className="space-y-6">
          {/* MODE 1: IKLAN VARIAN */}
          {adMode === 'variant' && (
            <div className="space-y-6">
              <Card className="rounded-3xl border-none shadow-sm bg-white">
                <CardContent className="p-5 md:p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                      Pilih Varian
                    </span>
                    <h2 className="text-sm font-bold text-gray-900">Pilih Produk & Varian Iklan</h2>
                  </div>

                  {products.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      Belum ada produk. Tambahkan produk di menu HPP terlebih dahulu.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-gray-600">Pilih Produk</Label>
                        <Select
                          value={v1SelectedProductId}
                          onValueChange={(val) => {
                            if (typeof val === 'string') {
                              setV1SelectedProductId(val);
                              setSimulatedPriceOverride(null);
                            }
                          }}
                        >
                          <SelectTrigger className="rounded-xl h-11 bg-gray-50/80 border-gray-200 font-bold text-xs">
                            <SelectValue placeholder="Pilih produk..." />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">
                                {p.nama} {p.sku ? `(${p.sku})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-gray-600">Pilih Varian yang Diiklankan</Label>
                        <Select
                          value={v1SelectedVariantId}
                          onValueChange={(val) => {
                            if (typeof val === 'string') {
                              setV1SelectedVariantId(val);
                              setSimulatedPriceOverride(null);
                            }
                          }}
                        >
                          <SelectTrigger className="rounded-xl h-11 bg-gray-50/80 border-gray-200 font-bold text-xs">
                            <SelectValue placeholder="Pilih varian..." />
                          </SelectTrigger>
                          <SelectContent>
                            {(v1ActiveProduct?.varian || []).map((v) => (
                              <SelectItem key={v.id} value={v.id} className="text-xs">
                                {v.nama} — {formatCurrency(v.harga_jual, true)}{v.harga_coret && v.harga_coret > v.harga_jual ? ` (Coret: ${formatCurrency(v.harga_coret, true)})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {v1Calculation && (
                <ROASResultDisplay
                  modeTitle="Iklan Varian"
                  name={`${v1Calculation.product.nama} - ${v1Calculation.variant.nama}`}
                  targetProduct={v1Calculation.product}
                  targetVariant={v1Calculation.variant}
                  onApplyPrice={handleApplyPriceRequest}
                  isPriceFromCariHarga={v1Calculation.isPriceOverridden}
                  masterPrice={v1Calculation.basePrice}
                  onResetPrice={() => handleResetVariantPrice(v1Calculation.product.id, v1Calculation.variant.id)}
                  minOrder={v1Calculation.minOrder}
                  hargaJualPcs={v1Calculation.unitEcon.sellingPrice}
                  hargaCoretPcs={v1Calculation.variant.harga_coret}
                  diskonPersen={v1Calculation.variant.diskon_persen}
                  hppPcs={v1Calculation.hppPcs}
                  biayaProsesOrder={v1Calculation.unitEcon.nominalPerOrder}
                  hargaJualOrder={v1Calculation.unitEcon.sellingPrice * v1Calculation.minOrder}
                  hppProdukOrder={v1Calculation.hppPcs * v1Calculation.minOrder}
                  totalHppRealOrder={v1Calculation.unitEcon.realHppPerUnit * v1Calculation.minOrder}
                  voucherPerPcs={v1Calculation.unitEcon.voucherPerUnit}
                  omzetRealOrder={v1Calculation.unitEcon.omzetRealPerUnit * v1Calculation.minOrder}
                  profitSebelumIklanOrder={v1Calculation.unitEcon.profitBeforeAdsPerUnit * v1Calculation.minOrder}
                  marginSebelumIklanPct={v1Calculation.unitEcon.marginBeforeAdsPct}
                  targetProfitPct={targetProfitPct}
                  targetProfitNominalOrder={v1Calculation.unitEcon.targetProfitNominalPerUnit * v1Calculation.minOrder}
                  maxAdSpendOrder={v1Calculation.unitEcon.maxAdSpendPerUnit * v1Calculation.minOrder}
                  roasBep={v1Calculation.unitEcon.roasBep}
                  roasTarget={v1Calculation.unitEcon.roasTarget}
                  roasSetting={v1Calculation.unitEcon.roasSetting}
                  bufferPct={bufferPct}
                  isTargetFeasible={v1Calculation.unitEcon.isTargetFeasible}
                  simRoas={v1SimRoas}
                  setSimRoas={setV1SimRoas}
                  includePpn={includePpn}
                  ppnRate={ppnRate}
                  numOrders={v1OrderSim}
                  setNumOrders={setV1OrderSim}
                />
              )}
            </div>
          )}

          {/* MODE 2: IKLAN PRODUK */}
          {adMode === 'product' && (
            <div className="space-y-6">
              <Card className="rounded-3xl border-none shadow-sm bg-white">
                <CardContent className="p-5 md:p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                      Checklist Varian & Bobot Sales
                    </span>
                    <h2 className="text-sm font-bold text-gray-900">Varian Terpilih dalam Produk</h2>
                  </div>

                  {products.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      Belum ada produk. Tambahkan produk di menu HPP terlebih dahulu.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-gray-600">Pilih Produk</Label>
                        <Select
                          value={v2SelectedProductId}
                          onValueChange={(val) => {
                            if (typeof val === 'string') setV2SelectedProductId(val);
                          }}
                        >
                          <SelectTrigger className="rounded-xl h-11 bg-gray-50/80 border-gray-200 font-bold text-xs">
                            <SelectValue placeholder="Pilih produk..." />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">
                                {p.nama} — {(p.varian || []).length} Varian
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {v2ActiveProduct && (
                        <div className="space-y-2 pt-2">
                          <Label className="text-xs font-bold text-gray-700">
                            Centang Varian yang Diiklankan & Atur Bobot (%):
                          </Label>

                          <div className="space-y-2.5">
                            {(v2ActiveProduct.varian || []).map((v) => {
                              const isChecked = v2SelectedVariantIds.includes(v.id);
                              const hppPcs = calcHppPerPcs(v, ingredients);

                              return (
                                <div
                                  key={v.id}
                                  className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                    isChecked ? 'bg-white border-violet-200' : 'bg-gray-50/60 border-gray-200/60 opacity-60'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isChecked && v2SelectedVariantIds.length > 1) {
                                          setV2SelectedVariantIds((prev) => prev.filter((id) => id !== v.id));
                                        } else if (!isChecked) {
                                          setV2SelectedVariantIds((prev) => [...prev, v.id]);
                                        }
                                      }}
                                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                                        isChecked ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-gray-300'
                                      }`}
                                    >
                                      {isChecked && <CheckCircle2 className="w-3.5 h-3.5" />}
                                    </button>
                                    <div className="space-y-0.5 min-w-0">
                                      <p className="text-xs font-bold text-gray-900 truncate">{v.nama}</p>
                                      <p className="text-[11px] text-gray-500">
                                        Harga: <strong>{formatCurrency(v.harga_jual, true)}</strong>{v.harga_coret && v.harga_coret > v.harga_jual ? <span className="text-gray-400 text-[10px] ml-1">(Coret: <span className="line-through">{formatCurrency(v.harga_coret, true)}</span>)</span> : null} • HPP: <strong>{formatCurrency(Math.round(hppPcs), true)}</strong> • Min: {v.min_order || 1} pack
                                      </p>
                                    </div>
                                  </div>

                                  {isChecked && (
                                    <div className="flex items-center gap-2.5 shrink-0 sm:pl-4">
                                      <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        value={v2VariantWeights[v.id] || 0}
                                        onChange={(e) => {
                                          const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                          setV2VariantWeights((prev) => ({ ...prev, [v.id]: val }));
                                        }}
                                        className="w-20 sm:w-28 h-2 rounded-lg bg-gray-200 appearance-none cursor-pointer accent-violet-600"
                                      />
                                      <div className="flex items-center gap-1 w-16">
                                        <Input
                                          type="number"
                                          min={0}
                                          max={100}
                                          value={v2VariantWeights[v.id] || 0}
                                          onChange={(e) => {
                                            const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                            setV2VariantWeights((prev) => ({ ...prev, [v.id]: val }));
                                          }}
                                          className="h-8 text-xs font-bold text-center px-1 rounded-lg"
                                        />
                                        <span className="text-xs font-bold text-gray-400">%</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {v2Calculation && (
                <ROASResultDisplay
                  modeTitle="Iklan Produk (Weighted Average)"
                  name={v2Calculation.product.nama}
                  isPriceFromCariHarga={v2Calculation.isPriceOverridden}
                  masterPrice={v2Calculation.weightedBasePrice}
                  onResetPrice={() => handleResetProductPrices(v2Calculation.product.id)}
                  minOrder={v2Calculation.effectiveMinOrder}
                  hargaJualPcs={v2Calculation.weightedPrice}
                  hppPcs={v2Calculation.weightedHppPcs}
                  biayaProsesOrder={v2Calculation.productEcon.nominalPerOrder}
                  hargaJualOrder={v2Calculation.weightedPrice * v2Calculation.effectiveMinOrder}
                  hppProdukOrder={v2Calculation.weightedHppPcs * v2Calculation.effectiveMinOrder}
                  totalHppRealOrder={v2Calculation.productEcon.realHppPerUnit * v2Calculation.effectiveMinOrder}
                  voucherPerPcs={v2Calculation.productEcon.voucherPerUnit}
                  omzetRealOrder={v2Calculation.productEcon.omzetRealPerUnit * v2Calculation.effectiveMinOrder}
                  profitSebelumIklanOrder={v2Calculation.productEcon.profitBeforeAdsPerUnit * v2Calculation.effectiveMinOrder}
                  marginSebelumIklanPct={v2Calculation.productEcon.marginBeforeAdsPct}
                  targetProfitPct={targetProfitPct}
                  targetProfitNominalOrder={v2Calculation.productEcon.targetProfitNominalPerUnit * v2Calculation.effectiveMinOrder}
                  maxAdSpendOrder={v2Calculation.productEcon.maxAdSpendPerUnit * v2Calculation.effectiveMinOrder}
                  roasBep={v2Calculation.productEcon.roasBep}
                  roasTarget={v2Calculation.productEcon.roasTarget}
                  roasSetting={v2Calculation.productEcon.roasSetting}
                  bufferPct={bufferPct}
                  roasWorst={v2Calculation.roasWorst}
                  worstName={v2Calculation.worstVariantName}
                  isTargetFeasible={v2Calculation.productEcon.isTargetFeasible}
                  simRoas={v2SimRoas}
                  setSimRoas={setV2SimRoas}
                  includePpn={includePpn}
                  ppnRate={ppnRate}
                  numOrders={v2OrderSim}
                  setNumOrders={setV2OrderSim}
                />
              )}
            </div>
          )}

          {/* MODE 3: IKLAN GRUP */}
          {adMode === 'group' && (
            <div className="space-y-6">
              <Card className="rounded-3xl border-none shadow-sm bg-white">
                <CardContent className="p-5 md:p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                      Pengaturan Grup Produk
                    </span>
                    <h2 className="text-sm font-bold text-gray-900">Portfolio Produk dalam Grup Iklan</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2 space-y-1.5">
                      <Label className="text-xs font-bold text-gray-600">Nama Grup Iklan</Label>
                      <Input
                        value={v3GroupName}
                        onChange={(e) => {
                          setV3GroupName(e.target.value);
                          savePreferences('v3GroupName', e.target.value);
                        }}
                        placeholder="Nama Grup Iklan"
                        className="rounded-xl h-11 font-bold text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-gray-600">Tambah Produk</Label>
                      <Select
                        onValueChange={(val) => {
                          if (typeof val === 'string' && val && !v3SelectedProductIds.includes(val)) {
                            setV3SelectedProductIds((prev) => [...prev, val]);
                          }
                        }}
                      >
                        <SelectTrigger className="rounded-xl h-11 bg-violet-50/50 border-violet-200 text-violet-700 font-bold text-xs">
                          <SelectValue placeholder="+ Tambah Produk..." />
                        </SelectTrigger>
                        <SelectContent>
                          {products
                            .filter((p) => !v3SelectedProductIds.includes(p.id))
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">
                                {p.nama}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Product Weight List */}
                  <div className="space-y-3 pt-2">
                    {v3SelectedProductIds.map((pId) => {
                      const prod = products.find((p) => p.id === pId);
                      if (!prod) return null;

                      return (
                        <div
                          key={pId}
                          className="p-3.5 rounded-2xl bg-white border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <p className="text-xs font-bold text-gray-900 truncate">{prod.nama}</p>
                            <p className="text-[11px] text-gray-500">{(prod.varian || []).length} varian terpilih</p>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={v3ProductWeights[pId] || 0}
                              onChange={(e) => {
                                const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                setV3ProductWeights((prev) => ({ ...prev, [pId]: val }));
                              }}
                              className="w-20 sm:w-28 h-2 rounded-lg bg-gray-200 appearance-none cursor-pointer accent-violet-600"
                            />
                            <div className="flex items-center gap-1 w-16">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={v3ProductWeights[pId] || 0}
                                onChange={(e) => {
                                  const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                  setV3ProductWeights((prev) => ({ ...prev, [pId]: val }));
                                }}
                                className="h-8 text-xs font-bold text-center px-1 rounded-lg"
                              />
                              <span className="text-xs font-bold text-gray-400">%</span>
                            </div>

                            {v3SelectedProductIds.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setV3SelectedProductIds((prev) => prev.filter((id) => id !== pId))}
                                className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {v3Calculation && (
                <ROASResultDisplay
                  modeTitle="Iklan Grup (Consolidated Portfolio)"
                  name={v3Calculation.groupName}
                  isPriceFromCariHarga={v3Calculation.isPriceOverridden}
                  masterPrice={v3Calculation.groupWeightedBasePrice}
                  onResetPrice={() => handleResetGroupPrices(v3SelectedProductIds)}
                  minOrder={1}
                  hargaJualPcs={v3Calculation.groupWeightedPrice}
                  hppPcs={v3Calculation.groupWeightedHppPcs}
                  biayaProsesOrder={v3Calculation.groupEcon.nominalPerOrder}
                  hargaJualOrder={v3Calculation.groupWeightedPrice}
                  hppProdukOrder={v3Calculation.groupWeightedHppPcs}
                  totalHppRealOrder={v3Calculation.groupEcon.realHppPerUnit}
                  voucherPerPcs={v3Calculation.groupEcon.voucherPerUnit}
                  omzetRealOrder={v3Calculation.groupEcon.omzetRealPerUnit}
                  profitSebelumIklanOrder={v3Calculation.groupEcon.profitBeforeAdsPerUnit}
                  marginSebelumIklanPct={v3Calculation.groupEcon.marginBeforeAdsPct}
                  targetProfitPct={targetProfitPct}
                  targetProfitNominalOrder={v3Calculation.groupEcon.targetProfitNominalPerUnit}
                  maxAdSpendOrder={v3Calculation.groupEcon.maxAdSpendPerUnit}
                  roasBep={v3Calculation.groupEcon.roasBep}
                  roasTarget={v3Calculation.groupEcon.roasTarget}
                  roasSetting={v3Calculation.groupEcon.roasSetting}
                  bufferPct={bufferPct}
                  roasWorst={v3Calculation.roasWorstGroup}
                  worstName={v3Calculation.worstProductName}
                  isTargetFeasible={v3Calculation.groupEcon.isTargetFeasible}
                  simRoas={v3SimRoas}
                  setSimRoas={setV3SimRoas}
                  includePpn={includePpn}
                  ppnRate={ppnRate}
                  numOrders={v3OrderSim}
                  setNumOrders={setV3OrderSim}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          MODE: CARI HARGA (REVERSE PRICE ENGINE)
          ==================================================================== */}
      {calcMode === 'find_price' && (
        <div className="space-y-6">
          <Card className="rounded-3xl border-none shadow-sm bg-white">
            <CardContent className="p-5 md:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                    Input Target CARI HARGA
                  </span>
                  <h2 className="text-sm font-bold text-gray-900">Hitung Harga Jual Minimum</h2>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-700">Target ROAS yang Diinginkan</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={targetRoasInput}
                    onChange={(e) => setTargetRoasInput(Math.max(0.1, Number(e.target.value) || 0.1))}
                    className="rounded-xl h-11 font-bold text-sm text-emerald-700"
                  />
                  <p className="text-[11px] text-emerald-700 font-semibold">Perhitungan menggunakan Target ROAS, bukan ROAS Setting Iklan.</p>
                </div>


                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-700">Opsi Pembulatan Harga</Label>
                  <select
                    value={roundingOption}
                    onChange={(e) => setRoundingOption(Number(e.target.value) as 0 | 100 | 500 | 1000)}
                    className="w-full h-11 px-3.5 rounded-xl border border-gray-200 font-bold text-xs bg-gray-50/80"
                  >
                    <option value={0}>Eksak (Tanpa Pembulatan)</option>
                    <option value={100}>Pembulatan ke Rp100</option>
                    <option value={500}>Pembulatan ke Rp500</option>
                    <option value={1000}>Pembulatan ke Rp1.000</option>
                  </select>
                  <p className="text-[11px] text-gray-400">Pembulatan ke atas untuk psikologi harga.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* MODE 1: CARI HARGA VARIAN */}
          {adMode === 'variant' && v1ReverseCalc && (
            <Card className="rounded-3xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-white shadow-md">
              <CardContent className="p-6 space-y-5">
                {!v1ReverseCalc.isFeasible ? (
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold space-y-2">
                    <p className="font-black text-sm">Target Tidak Dapat Dicapai</p>
                    <p>{v1ReverseCalc.errorMessage}</p>
                    <p className="text-[11px] text-rose-600 font-normal">
                      Saran: Turunkan Target Profit Bersih, naikkan Target ROAS, atau kurangi beban HPP / Biaya Marketplace.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider">
                          REKOMENDASI HARGA JUAL VARIAN
                        </span>
                        <h3 className="text-lg font-black text-gray-900">
                          {v1ActiveProduct?.nama} - {v1ActiveVariant?.nama}
                        </h3>
                      </div>
                      <Button
                        type="button"
                        onClick={() => {
                          if (v1ActiveProduct && v1ActiveVariant) {
                            handleTransferVariantToFindRoas(
                              v1ActiveProduct,
                              v1ActiveVariant,
                              v1ReverseCalc.priceRecommended
                            );
                          }
                        }}
                        className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold shadow-sm h-9 px-4 flex items-center gap-1.5"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Uji ke Mode CARI ROAS</span>
                      </Button>
                    </div>

                    <div className="p-5 bg-white rounded-2xl border border-emerald-200 shadow-xs flex flex-col sm:flex-row items-baseline justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase">HARGA JUAL REKOMENDASI (MINIMUM)</p>
                        <p className="text-3xl sm:text-4xl font-black text-emerald-600 tracking-tight">
                          {formatCurrency(v1ReverseCalc.priceRecommended)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Harga Eksak Matematis: <strong>{formatCurrency(v1ReverseCalc.priceExact)}</strong>
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 text-xs">
                        {v1ActiveProduct && v1ActiveVariant && (
                          <Button
                            type="button"
                            onClick={() => handleApplyPriceRequest(v1ActiveProduct, v1ActiveVariant, v1ReverseCalc.priceRecommended)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl h-10 px-4 shadow-md flex items-center gap-1.5"
                          >
                            <Tag className="w-4 h-4" />
                            <span>TERAPKAN HARGA</span>
                          </Button>
                        )}
                        <div className="text-right text-xs space-y-0.5">
                          <p className="text-gray-500">HPP Real: <strong>{formatCurrency(v1ReverseCalc.realHppPerUnit)}</strong></p>
                          <p className="text-gray-500">Target ROAS: <strong>{targetRoasInput}x</strong></p>
                          <p className="text-gray-500">Target Net Profit: <strong>{targetProfitPct}%</strong></p>
                        </div>
                      </div>
                    </div>

                    {/* TRANSPARENT VALIDATION BREAKDOWN (SECTION 14 & 15) */}
                    <div className="p-4 bg-white/90 rounded-2xl border border-emerald-200/80 space-y-3">
                      <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                        <span className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                          VERIFIKASI & TRANSPARANSI EKONOMI (100% KONSISTEN DENGAN CARI ROAS)
                        </span>
                        <Badge className="bg-emerald-100 text-emerald-800 border-none font-bold text-[10px]">
                          VALIDASI LOLOS
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                          <p className="text-[10px] font-bold text-gray-500 uppercase">Profit Bersih Terverifikasi</p>
                          <p className="text-base font-black text-emerald-700 mt-0.5">
                            {v1ReverseCalc.validation.actualProfitPercent.toFixed(2)}%
                          </p>
                          <p className="text-[10px] text-gray-400">Target min: {targetProfitPct}%</p>
                        </div>

                        <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                          <p className="text-[10px] font-bold text-gray-500 uppercase">ROAS Simulasi Terverifikasi</p>
                          <p className="text-base font-black text-emerald-700 mt-0.5">
                            {v1ReverseCalc.validation.roasTarget.toFixed(2)}x
                          </p>
                          <p className="text-[10px] text-gray-400">Sesuai Target ROAS</p>
                        </div>

                        <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100">
                          <p className="text-[10px] font-bold text-purple-800 uppercase">ROAS Setting (Seller Center)</p>
                          <p className="text-base font-black text-purple-900 mt-0.5">
                            {(targetRoasInput * (1 + bufferPct / 100)).toFixed(2)}x
                          </p>
                          <p className="text-[10px] text-purple-600">Buffer +{bufferPct}%</p>
                        </div>

                        <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                          <p className="text-[10px] font-bold text-blue-800 uppercase">ROAS BEP (Impas)</p>
                          <p className="text-base font-black text-blue-900 mt-0.5">
                            {v1ReverseCalc.validation.roasBep.toFixed(2)}x
                          </p>
                          <p className="text-[10px] text-blue-600">Batas 0 Profit</p>
                        </div>

                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <p className="text-[10px] font-bold text-gray-500 uppercase">Max Biaya Iklan / Unit</p>
                          <p className="text-sm font-black text-gray-900 mt-0.5">
                            {formatCurrency(v1ReverseCalc.validation.maxAdSpendPerUnit)}
                          </p>
                          <p className="text-[10px] text-gray-400">Beban Iklan Aman</p>
                        </div>

                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <p className="text-[10px] font-bold text-gray-500 uppercase">Profit Sebelum Iklan</p>
                          <p className="text-sm font-black text-gray-900 mt-0.5">
                            {formatCurrency(v1ReverseCalc.validation.profitBeforeAdsPerUnit)}
                          </p>
                          <p className="text-[10px] text-gray-400">{v1ReverseCalc.validation.marginBeforeAdsPct.toFixed(1)}% margin</p>
                        </div>

                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <p className="text-[10px] font-bold text-gray-500 uppercase">Fee Marketplace / Unit</p>
                          <p className="text-sm font-bold text-amber-600 mt-0.5">
                            {formatCurrency(v1ReverseCalc.validation.marketplaceFeePerUnit)}
                          </p>
                          <p className="text-[10px] text-gray-400">Termasuk Admin & Proses</p>
                        </div>

                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <p className="text-[10px] font-bold text-gray-500 uppercase">HPP Real / Unit</p>
                          <p className="text-sm font-bold text-rose-600 mt-0.5">
                            {formatCurrency(v1ReverseCalc.realHppPerUnit)}
                          </p>
                          <p className="text-[10px] text-gray-400">HPP Produk + Biaya / Unit</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* MODE 2: CARI HARGA PRODUK */}
          {adMode === 'product' && v2ReverseCalc && (
            <Card className="rounded-3xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-white shadow-md">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider">
                      HARGA REKOMENDASI RATA-RATA PRODUK
                    </span>
                    <h3 className="text-lg font-black text-gray-900">{v2ActiveProduct?.nama}</h3>
                  </div>
                  <Button
                    type="button"
                    onClick={() => {
                      if (v2ActiveProduct && v2ReverseCalc) {
                        handleTransferProductToFindRoas(
                          v2ActiveProduct,
                          v2ReverseCalc.variantReverseDetails.map((vd) => ({
                            variant: vd.variant,
                            recommendedPrice: vd.rev.priceRecommended,
                          }))
                        );
                      }
                    }}
                    className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold shadow-sm h-9 px-4 flex items-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Uji ke Mode CARI ROAS</span>
                  </Button>
                </div>

                <div className="p-5 bg-white rounded-2xl border border-emerald-200 shadow-xs flex flex-col sm:flex-row items-baseline justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase">HARGA JUAL PRODUK REKOMENDASI (KONSERVATIF)</p>
                    <p className="text-3xl sm:text-4xl font-black text-emerald-600 tracking-tight">
                      {formatCurrency(v2ReverseCalc.conservativePriceRecommended)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      HPP Varian Kritis ({v2ReverseCalc.heaviestVariantName}): <strong>{formatCurrency(v2ReverseCalc.heaviestHpp)}</strong>
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">Rincian per Varian:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {v2ReverseCalc.variantReverseDetails.map((vDetail) => (
                      <div key={vDetail.variant.id} className="p-3.5 bg-white rounded-2xl border border-emerald-200 space-y-2">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span>{vDetail.variant.nama}</span>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">{vDetail.weightPct}% Sales</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-black text-emerald-600">{formatCurrency(vDetail.rev.priceRecommended)}</p>
                          {v2ActiveProduct && (
                            <Button
                              type="button"
                              onClick={() => handleApplyPriceRequest(v2ActiveProduct, vDetail.variant, vDetail.rev.priceRecommended)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg h-7 px-2.5 flex items-center gap-1"
                            >
                              <Tag className="w-3 h-3" />
                              <span>TERAPKAN</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* MODE 3: CARI HARGA GRUP */}
          {adMode === 'group' && v3ReverseCalc && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {v3ReverseCalc.productReverseDetails.map((pDetail) => (
                  <Card key={pDetail.product.id} className="rounded-3xl border border-emerald-200 bg-white shadow-xs">
                    <CardHeader className="p-4 bg-emerald-50/60 border-b border-emerald-100">
                      <div className="flex justify-between items-center">
                        <h4 className="font-black text-sm text-gray-900">{pDetail.product.nama}</h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                          {pDetail.weightPct}% Bobot
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">HARGA JUAL DISARANKAN</p>
                      <p className="text-2xl font-black text-emerald-600">{formatCurrency(pDetail.pConservativePrice)}</p>
                      <p className="text-xs text-gray-500">Varian Kritis: {pDetail.heaviestVarName}</p>
                      {pDetail.variantRevList?.[0]?.variant && (
                        <Button
                          type="button"
                          onClick={() => handleApplyPriceRequest(pDetail.product, pDetail.variantRevList[0].variant, pDetail.pConservativePrice)}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl h-8 mt-2 flex items-center justify-center gap-1.5"
                        >
                          <Tag className="w-3.5 h-3.5" />
                          <span>TERAPKAN HARGA ({pDetail.variantRevList[0].variant.nama})</span>
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  onClick={() => {
                    if (v3ReverseCalc) {
                      handleTransferGroupToFindRoas(v3ReverseCalc.productReverseDetails);
                    }
                  }}
                  className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold px-5 shadow-sm h-10 flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Uji Seluruh Harga ke Mode CARI ROAS</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FOOTER GUIDE BOX */}
      <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
        <CardContent className="p-5 md:p-6 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <h3 className="text-xs font-black uppercase tracking-wider text-gray-700">
              Panduan Membaca Target & Parameter ROAS
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100 space-y-1">
              <p className="font-black text-blue-900">1. ROAS BEP</p>
              <p className="text-[11px] text-blue-700 leading-relaxed">
                Batas impas minimal. Jika ROAS aktual di bawah angka ini, transaksi berakhir rugi.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-violet-50/60 border border-violet-100 space-y-1">
              <p className="font-black text-violet-900">2. ROAS Target</p>
              <p className="text-[11px] text-violet-700 leading-relaxed">
                ROAS yang wajib dicapai agar target profit bersih {targetProfitPct}% tercapai secara eksak.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100 space-y-1">
              <p className="font-black text-purple-900">3. ROAS Setting Awal</p>
              <p className="text-[11px] text-purple-700 leading-relaxed">
                Rekomendasi input nilai target ROAS di Seller Center (+{bufferPct}% buffer pengaman).
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-100 space-y-1">
              <p className="font-black text-amber-900">4. ROAS BEP Terburuk</p>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                ROAS BEP varian/produk paling kritis dalam portfolio sebagai batas toleransi risiko.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MODAL KONFIRMASI TERAPKAN HARGA */}
      {confirmModalData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="space-y-1">
              <h3 className="text-lg font-black text-gray-900">
                Terapkan harga ini ke produk?
              </h3>
              <p className="text-xs text-gray-500">
                Harga Jual akan diperbarui langsung untuk produk dan varian yang dipilih.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200/80 space-y-3 text-xs">
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-gray-400 uppercase">Produk:</p>
                <p className="font-black text-gray-900 text-sm">{confirmModalData.product.nama}</p>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] font-bold text-gray-400 uppercase">Varian:</p>
                <p className="font-black text-gray-900 text-sm">{confirmModalData.variant.nama}</p>
              </div>

              <div className="h-px bg-gray-200/80 my-2" />

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-2.5 bg-white rounded-xl border border-gray-200">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Harga Saat Ini:</p>
                  <p className="font-bold text-gray-700 mt-0.5">{formatCurrency(confirmModalData.variant.harga_jual)}</p>
                </div>

                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase">Harga Baru:</p>
                  <p className="font-black text-emerald-700 mt-0.5">{formatCurrency(confirmModalData.newPrice)}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmModalData(null)}
                disabled={isApplyingPrice}
                className="flex-1 rounded-xl h-11 font-bold text-gray-700 border-gray-300 hover:bg-gray-100"
              >
                BATAL
              </Button>
              <Button
                type="button"
                onClick={executeApplyPrice}
                disabled={isApplyingPrice}
                className="flex-1 rounded-xl h-11 font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
              >
                {isApplyingPrice ? 'MENYIMPAN...' : 'TERAPKAN'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ROASCalculator;
// Trigger GitHub Sync Fri Aug 28 03:15:34 PM UTC 2026
