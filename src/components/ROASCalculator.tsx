import React from 'react';
import { Product, Variant, Ingredient, HppMaterial, Transaction, AdditionalFee } from '../types';
import { formatCurrency, calculateDiscountFromCoret } from '../lib/formatUtils';
import { getBaseUnit, getConversionRate, toBaseValue } from '../lib/unitUtils';
import {
  calculateUnitEconomics,
  calculateReversePrice,
  calculatePromoTanggalCantik,
  calculatePriceSpread,
  calculateAspHspAsmLsm,
  roundPrice,
  runUnitEconomicsSelfTests,
  UnitEconomicsResult,
  ReverseCalcResult,
  PromoTanggalCantikResult,
  ProductFeeDetail,
  SkuEconomics,
  AspHspAsmLsmResult,
} from '../lib/unitEconomics';
import { AspHspAsmLsmCard } from './AspHspAsmLsmCard';
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
  AlertCircle,
  ChevronDown,
  FolderKanban,
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
  isAggregated?: boolean;
  priceSpread?: {
    minPrice: number;
    maxPrice: number;
    spreadNominal: number;
    spreadPct: number;
    warningLevel: 'none' | 'moderate' | 'high';
    warningMessage: string | null;
  };
  variantBreakdown?: Array<{
    variant: Variant;
    price: number;
    basePrice: number;
    hppPcs: number;
    minOrder: number;
    weightPct: number;
    vEcon: UnitEconomicsResult;
    isPriceOverridden: boolean;
    priceSource: string;
  }>;
  productBreakdown?: Array<{
    product: Product;
    weightPct: number;
    minOrder: number;
    weightedPrice: number;
    weightedBasePrice: number;
    weightedHppPcs: number;
    activeVariantsCount: number;
    pEcon: UnitEconomicsResult;
  }>;
  onApplyVariantPrice?: (product: Product, variant: Variant, newPrice: number) => void;
  onResetVariantPrice?: (productId: string, variantId: string) => void;
  aspHspResult?: AspHspAsmLsmResult;
  budgetIklan?: number;
  setBudgetIklan?: (b: number) => void;
  customRoasSim?: number;
  setCustomRoasSim?: (r: number) => void;
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
  isAggregated,
  priceSpread,
  variantBreakdown,
  productBreakdown,
  onApplyVariantPrice,
  onResetVariantPrice,
  aspHspResult,
  budgetIklan = 100000,
  setBudgetIklan,
  customRoasSim = 5,
  setCustomRoasSim,
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

  // ROAS Minimum (1.5x) & Ideal (2.0x) derived from ASP/HSP result or BEP safety factor
  const roasMinimumVal = aspHspResult?.roasMinimum ?? (roasBep > 0 ? roasBep * 1.5 : roasTarget);
  const roasIdealVal = aspHspResult?.roasIdeal ?? (roasBep > 0 ? roasBep * 2.0 : roasTarget * 1.33);

  // Determine automatic status based on strict intent rules:
  const selisihPct = simMarginAfterAdsPct - targetProfitPct;

  let statusBadge = '🟢 TARGET TERCAPAI';
  let statusColor = 'bg-emerald-50 border-emerald-300 text-emerald-900';
  let statusDesc = `Profit bersih aktual (${simMarginAfterAdsPct.toFixed(1)}%) memenuhi target minimum (${targetProfitPct}%).`;

  if (!isTargetFeasible) {
    statusBadge = '🔴 STRUKTUR BIAYA MELEBIHI TARGET';
    statusColor = 'bg-rose-50 border-rose-300 text-rose-900';
    statusDesc = 'Tidak memungkinkan mencapai target profit dengan struktur biaya saat ini.';
  } else if (simMarginAfterAdsPct < 0) {
    statusBadge = '🔴 RUGI';
    statusColor = 'bg-rose-50 border-rose-300 text-rose-900';
    statusDesc = `Biaya total iklan & operasional melebihi omzet. Transaksi mengalami kerugian (${simMarginAfterAdsPct.toFixed(1)}%).`;
  } else if (simMarginAfterAdsPct < targetProfitPct) {
    statusBadge = '🟡 DI BAWAH TARGET';
    statusColor = 'bg-amber-50 border-amber-300 text-amber-900';
    statusDesc = `Profit bersih aktual (${simMarginAfterAdsPct.toFixed(1)}%) berada di bawah target minimum (${targetProfitPct}%). Selisih: ${selisihPct.toFixed(1)}%.`;
  }

  const [showDetails, setShowDetails] = React.useState(false);

  return (
    <Card className="rounded-3xl border border-violet-200/80 shadow-md bg-white overflow-hidden">
      <CardHeader className="p-4 md:p-5 bg-gradient-to-r from-violet-50/90 via-purple-50/50 to-white border-b border-violet-100">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-100 px-2 py-0.5 rounded-md">
              {modeTitle}
            </span>
            <h3 className="text-sm sm:text-base font-black text-gray-900 mt-1 flex items-center gap-2">
              <span>{name}</span>
              {diskonPersen !== undefined && diskonPersen > 0 && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-black text-[10px] rounded-lg">
                  % PROMO {diskonPersen}% AKTIF
                </Badge>
              )}
              {isAggregated && (
                <Badge variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 text-[10px] font-bold">
                  Harga Rata-rata (ASP)
                </Badge>
              )}
            </h3>
            {isAggregated && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                Nilai gabungan dihitung proporsional dari estimasi bobot varian/produk untuk simulasi iklan portfolio.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {onApplyPrice && targetProduct && targetVariant && (
              <Button
                type="button"
                onClick={() => onApplyPrice(targetProduct, targetVariant, hargaJualPcs)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm h-8 px-3 flex items-center gap-1.5"
              >
                <Tag className="w-3.5 h-3.5" />
                <span>TERAPKAN HARGA</span>
              </Button>
            )}
            <Badge className={`text-xs font-black px-2.5 py-1 border rounded-xl ${statusColor}`}>
              {statusBadge}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 md:p-5 space-y-4">
        {/* PRICE SPREAD WARNING BANNER */}
        {priceSpread && priceSpread.warningLevel !== 'none' && (
          <div
            className={`p-3.5 rounded-2xl border flex items-start gap-2.5 text-xs ${
              priceSpread.warningLevel === 'high'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <AlertTriangle
              className={`w-4 h-4 shrink-0 mt-0.5 ${
                priceSpread.warningLevel === 'high' ? 'text-rose-600' : 'text-amber-600'
              }`}
            />
            <div className="space-y-0.5">
              <span className="font-black">
                {priceSpread.warningLevel === 'high' ? '⚠ Disparitas Harga Tinggi' : 'ℹ Disparitas Harga Moderat'} (Rentang: {formatCurrency(priceSpread.minPrice)} – {formatCurrency(priceSpread.maxPrice)} | Selisih: {priceSpread.spreadPct.toFixed(1)}%)
              </span>
              <p className="text-[11px] leading-relaxed opacity-90">
                {priceSpread.warningMessage}
              </p>
            </div>
          </div>
        )}

        {/* INDICATOR FOR PRICE FROM CARI HARGA */}
        {isPriceFromCariHarga && (
          <div className="p-3 bg-emerald-50/90 border border-emerald-300 rounded-xl flex items-center justify-between gap-3 flex-wrap shadow-2xs">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  ✓ Menggunakan Harga Rekomendasi dari Cari Harga
                </span>
              </div>
              <p className="text-[10px] text-emerald-800 font-medium">
                {isAggregated
                  ? `Setiap varian menerima harga rekomendasi masing-masing (Rata-rata simulasi: ${formatCurrency(hargaJualPcs)} vs Master: ${masterPrice ? formatCurrency(masterPrice) : '-'}).`
                  : `Harga ini berasal dari rekomendasi Cari Harga: ${formatCurrency(hargaJualPcs)} (Harga Master: ${masterPrice ? formatCurrency(masterPrice) : '-'}).`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {onApplyPrice && targetProduct && targetVariant && (
                <Button
                  type="button"
                  onClick={() => onApplyPrice(targetProduct, targetVariant, hargaJualPcs)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-lg h-7 px-3 shadow-2xs flex items-center gap-1"
                >
                  <Tag className="w-3 h-3" />
                  <span>TERAPKAN HARGA</span>
                </Button>
              )}
              {onResetPrice && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onResetPrice}
                  className="text-xs font-bold rounded-lg h-7 px-2.5 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                >
                  Reset ke Master
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ====================================================================
            B. HASIL UTAMA: LARGE PROMINENT SUMMARY CARD
            ==================================================================== */}
        <div className="p-5 bg-gradient-to-r from-violet-50/90 via-purple-50/50 to-white rounded-2xl border border-violet-200 shadow-2xs flex flex-col sm:flex-row items-baseline justify-between gap-4">
          <div>
            <p className="text-[11px] font-black text-gray-500 uppercase tracking-wider">
              {isAggregated ? 'HARGA RATA-RATA (ASP)' : 'HARGA JUAL SIMULASI / REKOMENDASI'}
            </p>
            <p className="text-3xl sm:text-4xl font-black text-violet-700 tracking-tight mt-0.5">
              {formatCurrency(hargaJualPcs)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {minOrder > 1 ? `Min. order ${minOrder} pcs (${formatCurrency(hargaJualOrder)} / order)` : 'Harga per 1 pcs'}
              {masterPrice && masterPrice !== hargaJualPcs ? ` • Harga Master: ${formatCurrency(masterPrice)}` : ''}
            </p>
          </div>
          <div className="flex flex-col sm:items-end gap-2">
            <div className="text-left sm:text-right text-xs space-y-0.5">
              <p className="text-gray-600">HPP Real: <strong className="text-rose-600">{formatCurrency(totalHppRealOrder / minOrder)}</strong></p>
              <p className="text-gray-600">Target Profit: <strong className="text-emerald-700">{targetProfitPct}%</strong></p>
              <p className="text-gray-600">
                Estimasi Profit: <strong className={simMarginAfterAdsPct >= targetProfitPct ? 'text-teal-700' : 'text-amber-700'}>
                  {formatCurrency(totalSimProfitAfterAds)} ({simMarginAfterAdsPct.toFixed(1)}%)
                </strong>
              </p>
            </div>
            {onApplyPrice && targetProduct && targetVariant && (
              <Button
                type="button"
                onClick={() => onApplyPrice(targetProduct, targetVariant, hargaJualPcs)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl h-9 px-4 shadow-sm flex items-center gap-1.5"
              >
                <Tag className="w-4 h-4" />
                <span>TERAPKAN HARGA</span>
              </Button>
            )}
          </div>
        </div>

        {/* COMPACT MAIN METRICS GRID (ALWAYS VISIBLE) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div className="p-3 rounded-xl bg-violet-50/80 border border-violet-100 space-y-0.5">
            <span className="text-[10px] font-bold text-violet-700 uppercase">TARGET ROAS</span>
            <p className="text-xl font-black text-violet-950">{roasTarget.toFixed(2)}x</p>
            <p className="text-[9px] text-violet-600">Target User</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-100 space-y-0.5">
            <span className="text-[10px] font-bold text-amber-800 uppercase">ROAS MINIMUM</span>
            <p className="text-xl font-black text-amber-950">{roasMinimumVal.toFixed(2)}x</p>
            <p className="text-[9px] text-amber-700">Faktor Aman 1.5x</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-100 space-y-0.5">
            <span className="text-[10px] font-bold text-emerald-800 uppercase">ROAS IDEAL</span>
            <p className="text-xl font-black text-emerald-950">{roasIdealVal.toFixed(2)}x</p>
            <p className="text-[9px] text-emerald-700">Faktor Aman 2.0x</p>
          </div>
          <div className="p-3 rounded-xl bg-purple-50/80 border border-purple-100 space-y-0.5">
            <span className="text-[10px] font-bold text-purple-700 uppercase">ROAS SETTING</span>
            <p className="text-xl font-black text-purple-950">{roasSetting.toFixed(2)}x</p>
            <p className="text-[9px] text-purple-600">Buffer: +{bufferPct}%</p>
          </div>
          <div className={`p-3 rounded-xl border space-y-0.5 ${simMarginAfterAdsPct >= targetProfitPct ? 'bg-teal-50/80 border-teal-200' : 'bg-rose-50/80 border-rose-200'}`}>
            <span className="text-[10px] font-bold text-gray-700 uppercase">PROFIT BERSIH</span>
            <p className={`text-xl font-black ${simMarginAfterAdsPct >= targetProfitPct ? 'text-teal-950' : 'text-rose-950'}`}>
              {formatCurrency(totalSimProfitAfterAds)}
            </p>
            <p className="text-[9px] text-gray-600">Margin: {simMarginAfterAdsPct.toFixed(1)}%</p>
          </div>
        </div>

        {/* DETAIL PERHITUNGAN ACCORDION TOGGLE */}
        <div className="flex items-center justify-between pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full text-xs font-bold text-violet-700 bg-violet-50/80 hover:bg-violet-100 border border-violet-200/60 rounded-xl h-10 flex items-center justify-center gap-2 shadow-2xs"
          >
            <Sliders className="w-4 h-4" />
            <span>{showDetails ? 'SEMBUNYIKAN RINCIAN DETAIL' : 'LIHAT RINCIAN & SIMULASI LENGKAP'}</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {/* COLLAPSIBLE DETAILS */}
        {showDetails && (
          <div className="space-y-6 pt-2 border-t border-gray-100">
            {/* ASP / HSP / ASM / LSM Matrix Card (if provided) */}
            {aspHspResult && (
              <AspHspAsmLsmCard
                result={aspHspResult}
                budgetIklan={budgetIklan}
                setBudgetIklan={(b) => {
                  if (setBudgetIklan) setBudgetIklan(b);
                }}
                customRoas={customRoasSim}
                setCustomRoas={(r) => {
                  if (setCustomRoasSim) setCustomRoasSim(r);
                }}
                title={`Analisis & Rekomendasi ROAS — ${name}`}
              />
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

        {/* RINCIAN SETIAP VARIAN / SKU (SINGLE SOURCE OF TRUTH) */}
        {variantBreakdown && variantBreakdown.length > 0 && (
          <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/70 via-purple-50/50 to-white border border-indigo-200/80 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-indigo-200/70 pb-2.5">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600" />
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950">
                    RINCIAN SETIAP VARIAN / SKU (SINGLE SOURCE OF TRUTH)
                  </h4>
                  <p className="text-[10px] text-indigo-700">
                    Setiap SKU memiliki unit economics dan harga jual aktual tersendiri.
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="bg-white text-indigo-900 border-indigo-300 font-bold text-[10px]">
                {variantBreakdown.length} Varian Aktif
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {variantBreakdown.map((vb) => (
                <div
                  key={vb.variant.id}
                  className="p-3.5 bg-white rounded-2xl border border-indigo-100/90 shadow-2xs space-y-2.5 flex flex-col justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-black text-xs text-gray-900 truncate" title={vb.variant.nama}>
                        {vb.variant.nama}
                      </span>
                      <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full shrink-0">
                        {vb.weightPct}% Bobot
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between pt-1">
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase block">Harga Jual Aktual</span>
                        <span className="text-base font-black text-emerald-600">
                          {formatCurrency(vb.price)}
                        </span>
                      </div>
                      {vb.isPriceOverridden ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-none text-[9px] font-bold">
                          ✓ Dari Cari Harga
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-gray-400">Master</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1.5 border-t border-gray-100">
                    <div className="p-1.5 bg-gray-50 rounded-lg">
                      <span className="text-gray-400 block text-[9px] uppercase">HPP / pcs</span>
                      <span className="font-bold text-rose-600">{formatCurrency(vb.hppPcs)}</span>
                    </div>
                    <div className="p-1.5 bg-gray-50 rounded-lg">
                      <span className="text-gray-400 block text-[9px] uppercase">Min Order</span>
                      <span className="font-bold text-gray-800">{vb.minOrder} pcs</span>
                    </div>
                    <div className="p-1.5 bg-gray-50 rounded-lg">
                      <span className="text-gray-400 block text-[9px] uppercase">ROAS BEP</span>
                      <span className="font-black text-blue-700">{vb.vEcon.roasBep.toFixed(2)}x</span>
                    </div>
                    <div className="p-1.5 bg-gray-50 rounded-lg">
                      <span className="text-gray-400 block text-[9px] uppercase">Target ROAS</span>
                      <span className="font-black text-violet-700">{vb.vEcon.roasTarget.toFixed(2)}x</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-gray-100">
                    <span className="text-gray-500">Profit Bersih:</span>
                    <span
                      className={`font-black ${
                        vb.vEcon.actualProfitPercent >= targetProfitPct
                          ? 'text-emerald-600'
                          : vb.vEcon.actualProfitPercent >= 0
                          ? 'text-amber-600'
                          : 'text-rose-600'
                      }`}
                    >
                      {vb.vEcon.actualProfitPercent.toFixed(1)}%
                    </span>
                  </div>

                  {onApplyVariantPrice && targetProduct && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <Button
                        type="button"
                        onClick={() => onApplyVariantPrice(targetProduct, vb.variant, vb.price)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg h-7 shadow-2xs flex items-center justify-center gap-1"
                      >
                        <Tag className="w-3 h-3" />
                        <span>Terapkan</span>
                      </Button>
                      {onResetVariantPrice && vb.isPriceOverridden && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => onResetVariantPrice(targetProduct.id, vb.variant.id)}
                          className="text-[10px] font-bold rounded-lg h-7 px-2 border-gray-200 text-gray-600 hover:bg-gray-100"
                        >
                          Reset
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RINCIAN PRODUK DALAM IKLAN GRUP */}
        {productBreakdown && productBreakdown.length > 0 && (
          <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50/70 via-indigo-50/50 to-white border border-purple-200/80 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-purple-200/70 pb-2.5">
              <div className="flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-purple-600" />
                <h4 className="text-xs font-black uppercase tracking-wider text-purple-950">
                  RINCIAN PRODUK DALAM IKLAN GRUP
                </h4>
              </div>
              <Badge variant="outline" className="bg-white text-purple-900 border-purple-300 font-bold text-[10px]">
                {productBreakdown.length} Produk
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {productBreakdown.map((pb) => (
                <div
                  key={pb.product.id}
                  className="p-3.5 bg-white rounded-2xl border border-purple-100/90 shadow-2xs space-y-2 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-black text-xs text-gray-900 truncate" title={pb.product.nama}>
                      {pb.product.nama}
                    </span>
                    <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full shrink-0">
                      {pb.weightPct}% Bobot
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-gray-100">
                    <div className="p-1.5 bg-gray-50 rounded-lg">
                      <span className="text-gray-400 block text-[9px] uppercase">Rata-rata Harga</span>
                      <span className="font-bold text-gray-900">{formatCurrency(pb.weightedPrice)}</span>
                    </div>
                    <div className="p-1.5 bg-gray-50 rounded-lg">
                      <span className="text-gray-400 block text-[9px] uppercase">Rata-rata HPP</span>
                      <span className="font-bold text-rose-600">{formatCurrency(pb.weightedHppPcs)}</span>
                    </div>
                    <div className="p-1.5 bg-gray-50 rounded-lg">
                      <span className="text-gray-400 block text-[9px] uppercase">ROAS BEP</span>
                      <span className="font-black text-blue-700">{pb.pEcon.roasBep.toFixed(2)}x</span>
                    </div>
                    <div className="p-1.5 bg-gray-50 rounded-lg">
                      <span className="text-gray-400 block text-[9px] uppercase">Target ROAS</span>
                      <span className="font-black text-violet-700">{pb.pEcon.roasTarget.toFixed(2)}x</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-gray-100">
                    <span className="text-gray-500">Profit Bersih:</span>
                    <span
                      className={`font-black ${
                        pb.pEcon.actualProfitPercent >= targetProfitPct
                          ? 'text-emerald-600'
                          : pb.pEcon.actualProfitPercent >= 0
                          ? 'text-amber-600'
                          : 'text-rose-600'
                      }`}
                    >
                      {pb.pEcon.actualProfitPercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ==========================================================================
   PROMO TANGGAL CANTIK DISPLAY CARD
   ========================================================================== */

interface PromoDisplayProps {
  promoResult: PromoTanggalCantikResult | null;
  product?: Product | null;
  variant?: Variant | null;
  onTestInFindRoas?: (recommendedPrice: number) => void;
}

function PromoTanggalCantikDisplayCard({ promoResult, product, variant, onTestInFindRoas }: PromoDisplayProps) {
  if (!promoResult) return null;

  if (!promoResult.isFeasible || promoResult.errorMessage === 'Data biaya varian belum lengkap.') {
    return (
      <Card className="rounded-3xl border-2 border-amber-300 bg-amber-50/50 shadow-sm overflow-hidden">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-amber-200/80 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-amber-950">
                  🎉 SIMULASI PROMO TANGGAL CANTIK
                </h3>
                {product && variant && (
                  <p className="text-xs font-bold text-amber-800">
                    {product.nama} ({variant.nama})
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="p-3 bg-amber-100/60 rounded-xl border border-amber-300 text-amber-900 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-700" />
            <span>{promoResult.errorMessage || 'Data biaya varian belum lengkap.'}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const {
    normalPrice,
    promoDiscountPct,
    recommendedPromoPrice,
    discountNominal,
    effectivePrice,
    hppPcs,
    totalAdditionalCostPerUnit,
    adSpendBurdenPerUnit,
    netProfitPerUnit,
    profitMarginPct,
    roasActual,
  } = promoResult;

  return (
    <Card className="rounded-3xl border-2 border-amber-400 bg-gradient-to-b from-amber-50/90 via-white to-amber-50/30 shadow-md overflow-hidden">
      <CardHeader className="p-5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white flex flex-row items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-white/20 rounded-2xl backdrop-blur-xs">
            <Sparkles className="w-5 h-5 text-amber-100" />
          </div>
          <div>
            <Badge className="bg-amber-900/40 text-amber-100 border-none text-[10px] uppercase tracking-wider font-bold">
              Simulasi Virtual
            </Badge>
            <h3 className="text-base font-black tracking-tight text-white">
              🎉 SIMULASI PROMO TANGGAL CANTIK
            </h3>
            {product && variant && (
              <p className="text-xs font-bold text-amber-100 mt-0.5">
                Produk: <strong className="text-white">{product.nama}</strong> • Varian: <strong className="text-amber-200">{variant.nama}</strong>
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-bold text-amber-100 uppercase block">Diskon Promo</span>
          <span className="text-lg font-black text-white">{promoDiscountPct}%</span>
        </div>
      </CardHeader>

      <CardContent className="p-5 md:p-6 space-y-5">
        {/* HARGA NORMAL VS HARGA YANG HARUS DIPASANG */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-1">
            <span className="text-xs font-bold text-gray-500 block uppercase tracking-wider">Harga Normal</span>
            <div className="text-xl font-black text-gray-800">{formatCurrency(normalPrice)}</div>
            <p className="text-[10px] text-gray-500 font-medium">
              Harga Master {product ? `(${product.nama}${variant ? ` - ${variant.nama}` : ''})` : 'Produk'} (Tidak Berubah)
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-400 shadow-xs space-y-1">
            <span className="text-xs font-black text-amber-900 block uppercase tracking-wider">
              HARGA YANG HARUS DIPASANG
            </span>
            <div className="text-2xl md:text-3xl font-black text-amber-700">
              {formatCurrency(recommendedPromoPrice)}
            </div>
            <p className="text-[10px] font-semibold text-amber-800">
              Harga sebelum diskon yang harus dipasang di Seller Center
            </p>
          </div>
        </div>

        {/* RINCIAN POTONGAN PROMO & HARGA SETELAH PROMO */}
        <div className="p-4 rounded-2xl bg-white border border-amber-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-gray-700">
            <span className="text-rose-600">Potongan Promo {promoDiscountPct}%</span>
            <span className="font-black text-rose-600">-{formatCurrency(discountNominal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm font-black text-gray-900 pt-2 border-t border-dashed border-gray-200">
            <span>Harga Setelah Promo</span>
            <span className="text-base font-black text-emerald-700">{formatCurrency(effectivePrice)}</span>
          </div>
        </div>

        {/* BREAKDOWN ELEMENT BIAYA */}
        <div className="space-y-2 text-xs font-medium text-gray-600 bg-gray-50/80 p-4 rounded-2xl border border-gray-200">
          <div className="flex justify-between items-center py-1">
            <span>Harga Setelah Promo (Revenue)</span>
            <span className="font-bold text-gray-900">{formatCurrency(effectivePrice)}</span>
          </div>
          <div className="flex justify-between items-center py-1 text-gray-500">
            <span>HPP</span>
            <span className="font-bold text-rose-600">-{formatCurrency(hppPcs)}</span>
          </div>
          <div className="flex justify-between items-center py-1 text-gray-500">
            <span>Total Biaya Tambahan</span>
            <span className="font-bold text-rose-600">-{formatCurrency(totalAdditionalCostPerUnit)}</span>
          </div>
          <div className="flex justify-between items-center py-1 text-gray-500">
            <span>Biaya Iklan</span>
            <span className="font-bold text-rose-600">-{formatCurrency(adSpendBurdenPerUnit)}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-gray-200 font-bold text-gray-900">
            <span>Profit Bersih</span>
            <span className="text-sm font-black text-emerald-600">{formatCurrency(netProfitPerUnit)}</span>
          </div>
          <div className="flex justify-between items-center py-0.5 font-bold text-gray-900">
            <span>Profit Margin</span>
            <span className="font-black text-emerald-700">{profitMarginPct.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between items-center py-0.5 font-bold text-gray-900">
            <span>ROAS</span>
            <span className="font-black text-violet-700">{roasActual.toFixed(2)}x</span>
          </div>
        </div>

        {/* FOOTER NOTE & UJI BUTTON */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
          <p className="text-[11px] text-amber-900 font-medium italic flex-1 min-w-[240px]">
            * Harga yang harus dipasang sebelum diskon agar target profit dan ROAS tetap tercapai setelah Promo Tanggal Cantik.
          </p>
          {onTestInFindRoas && (
            <Button
              type="button"
              onClick={() => onTestInFindRoas(recommendedPromoPrice)}
              className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-black text-xs rounded-xl shadow-sm"
            >
              <ArrowUpRight className="w-4 h-4 mr-1" />
              <span>UJI HARGA PROMO KE MODE CARI ROAS</span>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ==========================================================================
   MAIN COMPONENT: ROAS CALCULATOR
   (Trigger update for GitHub Sync)
   ========================================================================== */



export default function ROASCalculator({ products: rawProducts = [], ingredients: rawIngredients = [], transactions: rawTransactions = [], user }: Props) {
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

  // TABS
  const [calcMode, setCalcMode] = React.useState<'find_roas' | 'find_price'>('find_roas');
  const [adMode, setAdMode] = React.useState<'variant' | 'product' | 'group'>('variant');

  // FIND ROAS STATES
  const [useConservative, setUseConservative] = React.useState(false);
  const [biayaIklan, setBiayaIklan] = React.useState(100000);

  // FIND PRICE STATES
  const [targetRoasInput, setTargetRoasInput] = React.useState(8);

  // SELECTIONS
  const [v1SelectedProductId, setV1SelectedProductId] = React.useState<string>(() => products[0]?.id || '');
  const [v1SelectedVariantId, setV1SelectedVariantId] = React.useState<string>(() => products[0]?.varian?.[0]?.id || '');
  const [v2SelectedProductId, setV2SelectedProductId] = React.useState<string>(() => products[0]?.id || '');

  const [v3SelectedProductIds, setV3SelectedProductIds] = React.useState<string[]>(() => products.map(p => p.id));

  const toggleGroupProduct = (id: string) => {
    setV3SelectedProductIds(prev => prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]);
  };

  // APPLY PRICE MODAL
  const [confirmModalData, setConfirmModalData] = React.useState<{product: Product; variant: Variant; newPrice: number;} | null>(null);

  const executeApplyPrice = async () => {
    if (!confirmModalData || !user?.uid) return;
    const { product, variant, newPrice } = confirmModalData;
    try {
      const updatedVariants = (product.varian || []).map((v) => v.id === variant.id ? { ...v, harga_jual: newPrice } : v);
      const updatedProduct = { ...product, varian: updatedVariants };
      const productRef = doc(db, `users/${user.uid}/hpp/${product.id}`);
      await setDoc(productRef, sanitizeData(updatedProduct));
      toast.success(`Harga berhasil diperbarui menjadi ${formatCurrency(newPrice)}`);
      setConfirmModalData(null);
    } catch (e) {
      toast.error('Gagal menerapkan harga');
    }
  };

  // ---------------------------------------------------------
  // CORE LOGIC EXTRACTOR
  // ---------------------------------------------------------
  
  // V1: Variant Logic
  const v1Product = products.find(p => p.id === v1SelectedProductId);
  const v1Variant = v1Product?.varian?.find(v => v.id === v1SelectedVariantId);
  let v1Hpp = 0, v1FeePct = 0, v1Margin = 0, v1Harga = 0, v1FeeNominal = 0, v1MinOrder = 1;
  let v1FeeAmount = 0;
  if (v1Product && v1Variant) {
    v1MinOrder = Math.max(1, Number(v1Product.min_order) || 1);
    v1Hpp = calcHppPerPcs(v1Variant, ingredients);
    const feeConf = extractFeeRates(v1Product, v1Variant);
    v1FeePct = feeConf.percentRate; 
    v1FeeNominal = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / v1MinOrder);
    v1Harga = v1Variant.harga_jual;
    v1FeeAmount = (v1Harga * v1FeePct / 100) + v1FeeNominal;
    v1Margin = v1Harga - v1Hpp - v1FeeAmount;
  }

  // V2: Product Logic
  const v2Product = products.find(p => p.id === v2SelectedProductId);
  let v2Asp = 0, v2Asm = 0, v2Hsp = 0, v2Lsm = 0, v2MinOrder = 1;
  if (v2Product && v2Product.varian?.length) {
    v2MinOrder = Math.max(1, Number(v2Product.min_order) || 1);
    let sumPrice = 0, sumMargin = 0;
    v2Product.varian.forEach(v => {
      const hpp = calcHppPerPcs(v, ingredients);
      const feeConf = extractFeeRates(v2Product, v);
      const feeN = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / v2MinOrder);
      const margin = v.harga_jual - (hpp + (v.harga_jual * feeConf.percentRate / 100) + feeN);
      sumPrice += v.harga_jual;
      sumMargin += margin;
      if (v.harga_jual > v2Hsp) v2Hsp = v.harga_jual;
      if (v2Lsm === 0 || margin < v2Lsm) v2Lsm = margin;
    });
    v2Asp = sumPrice / v2Product.varian.length;
    v2Asm = sumMargin / v2Product.varian.length;
  }

  // V3: Group Logic
  let v3Asp = 0, v3Asm = 0, v3Hsp = 0, v3Lsm = 0;
  let totalVariantsGroup = 0;
  if (v3SelectedProductIds.length > 0) {
    let sumPrice = 0, sumMargin = 0;
    products.filter(p => v3SelectedProductIds.includes(p.id)).forEach(p => {
      const pMinOrder = Math.max(1, Number(p.min_order) || 1);
      p.varian?.forEach(v => {
        totalVariantsGroup++;
        const hpp = calcHppPerPcs(v, ingredients);
        const feeConf = extractFeeRates(p, v);
        const feeN = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / pMinOrder);
        const margin = v.harga_jual - (hpp + (v.harga_jual * feeConf.percentRate / 100) + feeN);
        sumPrice += v.harga_jual;
        sumMargin += margin;
        if (v.harga_jual > v3Hsp) v3Hsp = v.harga_jual;
        if (v3Lsm === 0 || margin < v3Lsm) v3Lsm = margin;
      });
    });
    if (totalVariantsGroup > 0) {
      v3Asp = sumPrice / totalVariantsGroup;
      v3Asm = sumMargin / totalVariantsGroup;
    }
  }

  // Final H and M Selection
  let H = 0;
  let M = 0;
  let displayTitle = '';
  
  if (adMode === 'variant') {
    H = v1Harga;
    M = v1Margin;
    displayTitle = `${v1Product?.nama || 'Produk'} - ${v1Variant?.nama || 'Varian'}`;
  } else if (adMode === 'product') {
    H = useConservative ? v2Hsp : v2Asp;
    M = useConservative ? v2Lsm : v2Asm;
    displayTitle = v2Product?.nama || 'Produk Multi-Varian';
  } else {
    H = useConservative ? v3Hsp : v3Asp;
    M = useConservative ? v3Lsm : v3Asm;
    displayTitle = `Grup Iklan (${v3SelectedProductIds.length} Produk)`;
  }

  // Target ROAS Math
  const roasBep = M > 0 ? H / M : 0;
  const roasMin = roasBep > 0 ? roasBep * 1.5 : 0;
  const roasIdeal = roasBep > 0 ? roasBep * 2.0 : 0;

  const renderSimCard = (title: string, roas: number, color: string) => {
    const estOmset = biayaIklan * roas;
    const estQty = H > 0 ? Math.floor(estOmset / H) : 0;
    const estMargin = estQty * M;
    const estProfit = estMargin - biayaIklan;
    
    let bgClass = '';
    let textColor = '';
    let profitLabel = '';
    let profitValueClass = '';
    
    if (color === 'red') {
      bgClass = 'bg-slate-50 border-slate-200';
      textColor = 'text-slate-800';
      profitLabel = 'Profit Rp0 (Impas)';
      profitValueClass = 'text-slate-500';
    } else if (color === 'yellow') {
      bgClass = 'bg-amber-50 border-amber-200';
      textColor = 'text-amber-900';
      profitLabel = 'Est. Profit Bersih:';
      profitValueClass = 'text-amber-700';
    } else {
      bgClass = 'bg-emerald-50 border-emerald-200';
      textColor = 'text-emerald-900';
      profitLabel = 'Est. Profit Bersih:';
      profitValueClass = 'text-emerald-700';
    }
    
    return (
      <div className={`p-5 rounded-2xl border ${bgClass} flex flex-col justify-between shadow-sm`}>
        <div>
          <div className={`font-black uppercase tracking-wider text-[11px] mb-1 ${textColor} opacity-80`}>{title}</div>
          <div className={`text-4xl font-black mb-6 ${textColor}`}>{roas > 0 ? roas.toFixed(2) : '0.00'}x</div>
        </div>
        <div className="text-sm space-y-2">
          <div className="flex justify-between items-center text-slate-600"><span>Est. Omset:</span><span className="font-bold text-slate-900">{formatCurrency(estOmset)}</span></div>
          <div className="flex justify-between items-center text-slate-600"><span>Est. Qty Terjual:</span><span className="font-bold text-slate-900">{estQty} pcs</span></div>
          <div className="flex justify-between items-center text-slate-600"><span>Est. Total Margin:</span><span className="font-bold text-slate-900">{formatCurrency(estMargin)}</span></div>
          
          <div className={`flex justify-between items-center mt-3 pt-3 border-t border-black/10`}>
            <span className={`font-bold ${textColor}`}>{profitLabel}</span>
            <span className={`font-black text-lg ${profitValueClass}`}>{color === 'red' ? 'Rp0' : formatCurrency(estProfit)}</span>
          </div>
        </div>
      </div>
    );
  };

  const calcReversePrice = (hpp: number, feePct: number, feeNominal: number, tRoas: number) => {
    const denomBep = (1 - (feePct/100)) - (1.0 / tRoas);
    const hargaBep = denomBep > 0 ? (hpp + feeNominal) / denomBep : 0;
    const denomMin = (1 - (feePct/100)) - (1.5 / tRoas);
    const hargaMin = denomMin > 0 ? (hpp + feeNominal) / denomMin : 0;
    const denomIdeal = (1 - (feePct/100)) - (2.0 / tRoas);
    const hargaIdeal = denomIdeal > 0 ? (hpp + feeNominal) / denomIdeal : 0;
    
    const marginIdeal = hargaIdeal - (hpp + (hargaIdeal * feePct / 100) + feeNominal);
    return { hargaBep, hargaMin, hargaIdeal, marginIdeal };
  };

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6 pb-36">
      {/* HEADER & TABS MODE */}
      <div className="flex flex-col gap-5 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Kalkulator ROAS & Harga</h1>
          <p className="text-gray-500 text-sm mt-1">Hitung target ROAS iklan dan rekomendasi harga jual berdasarkan unit economics.</p>
        </div>
        
        <div className="flex flex-wrap gap-2 p-1.5 bg-gray-50 border border-gray-100 rounded-2xl w-fit">
          <button 
            onClick={() => setCalcMode('find_roas')} 
            className={`px-6 py-3 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${calcMode === 'find_roas' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200'}`}
          >
            <Calculator className="w-4 h-4" /> CARI ROAS
          </button>
          <button 
            onClick={() => setCalcMode('find_price')} 
            className={`px-6 py-3 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${calcMode === 'find_price' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200'}`}
          >
            <DollarSign className="w-4 h-4" /> CARI HARGA
          </button>
        </div>

        {/* TABS TIPE IKLAN */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          {(['variant', 'product', 'group'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setAdMode(mode)}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${adMode === mode ? 'bg-gray-900 text-white border-transparent' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
            >
              {mode === 'variant' ? 'Single Varian' : mode === 'product' ? 'Produk Multi-Varian' : 'Grup Iklan / Toko'}
            </button>
          ))}
        </div>
      </div>

      {/* SELECTORS & TRANSPARENCY BOX */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-5">
        <h2 className="font-black text-gray-900 text-sm uppercase tracking-wider flex items-center gap-2">
          <Package className="w-4 h-4 text-indigo-600" />
          Pilih Produk / Varian Target
        </h2>
        
        {adMode === 'variant' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-600">Pilih Produk</Label>
                <Select value={v1SelectedProductId} onValueChange={setV1SelectedProductId}>
                  <SelectTrigger className="h-11 rounded-xl bg-gray-50 border-gray-200 font-bold"><SelectValue placeholder="Pilih Produk" /></SelectTrigger>
                  <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.nama}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-600">Pilih Varian</Label>
                <Select value={v1SelectedVariantId} onValueChange={setV1SelectedVariantId}>
                  <SelectTrigger className="h-11 rounded-xl bg-gray-50 border-gray-200 font-bold"><SelectValue placeholder="Pilih Varian" /></SelectTrigger>
                  <SelectContent>{v1Product?.varian?.map(v => <SelectItem key={v.id} value={v.id}>{v.nama}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Unit Economics Transparency Box */}
            {v1Variant && (
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wide">Detail Unit Economics Terpanggil</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Min. Order</p>
                    <p className="font-black text-gray-900">{v1MinOrder} pcs</p>
                    {v1MinOrder > 1 && <p className="text-[10px] text-indigo-600 font-bold mt-1">Skala Paket Aktif</p>}
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">HPP Terpanggil</p>
                    <p className="font-black text-gray-900">{formatCurrency(v1Hpp)} <span className="text-xs font-normal text-gray-500">/ pcs</span></p>
                    {v1MinOrder > 1 && <p className="text-[10px] text-gray-500 mt-1">HPP Paket: {formatCurrency(v1Hpp * v1MinOrder)}</p>}
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Total Fee Marketplace</p>
                    <p className="font-black text-gray-900">{v1FeePct}% + {formatCurrency(v1FeeNominal)}</p>
                    <p className="text-[10px] text-gray-500 mt-1">Estimasi: {formatCurrency(v1FeeAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Margin Bersih (M)</p>
                    <p className="font-black text-emerald-600">{formatCurrency(v1Margin)} <span className="text-xs font-normal text-gray-500">/ pcs</span></p>
                    {v1MinOrder > 1 && <p className="text-[10px] text-emerald-600 mt-1">Margin Paket: {formatCurrency(v1Margin * v1MinOrder)}</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        {adMode === 'product' && (
          <div className="space-y-4">
            <div className="space-y-1.5 max-w-md">
              <Label className="text-xs font-bold text-gray-600">Pilih Produk Multi-Varian</Label>
              <Select value={v2SelectedProductId} onValueChange={setV2SelectedProductId}>
                <SelectTrigger className="h-11 rounded-xl bg-gray-50 border-gray-200 font-bold"><SelectValue placeholder="Pilih Produk" /></SelectTrigger>
                <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.nama}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {v2Product && (
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wide">Ringkasan Unit Economics Multi-Varian</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Total Varian</p>
                    <p className="font-black text-gray-900">{v2Product.varian?.length || 0} Varian</p>
                    <p className="text-[10px] text-gray-500 mt-1">Min. Order: {v2MinOrder} pcs</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">ASP (Harga Rata-rata)</p>
                    <p className="font-black text-gray-900">{formatCurrency(v2Asp)}</p>
                    <p className="text-[10px] text-gray-500 mt-1">HSP (Tertinggi): {formatCurrency(v2Hsp)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">ASM (Margin Rata-rata)</p>
                    <p className="font-black text-emerald-600">{formatCurrency(v2Asm)}</p>
                    <p className="text-[10px] text-gray-500 mt-1">LSM (Terendah): {formatCurrency(v2Lsm)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        {adMode === 'group' && (
          <div className="space-y-4">
            <Label className="text-xs font-bold text-gray-600">Pilih Produk dalam Grup Iklan</Label>
            <div className="flex flex-wrap gap-2">
              {products.map(p => {
                const isSelected = v3SelectedProductIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleGroupProduct(p.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isSelected ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    {isSelected && "✓ "} {p.nama}
                  </button>
                )
              })}
            </div>

            {v3SelectedProductIds.length > 0 && (
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wide">Ringkasan Unit Economics Grup</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Produk & Varian</p>
                    <p className="font-black text-gray-900">{v3SelectedProductIds.length} Produk</p>
                    <p className="text-[10px] text-gray-500 mt-1">Total {totalVariantsGroup} Varian Terhitung</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">ASP Grup</p>
                    <p className="font-black text-gray-900">{formatCurrency(v3Asp)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">ASM Grup</p>
                    <p className="font-black text-emerald-600">{formatCurrency(v3Asm)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {calcMode === 'find_roas' ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-6">
            <div className="flex flex-col lg:flex-row justify-between items-start gap-6 border-b border-gray-100 pb-6">
              <div className="space-y-2">
                <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-600" /> Parameter Perhitungan ROAS
                </h3>
                <div className="flex flex-col gap-1 text-sm text-gray-600">
                  <div className="flex gap-2 items-center"><span className="w-32">Target Objek:</span><strong className="text-gray-900 bg-gray-100 px-2 py-0.5 rounded-md">{displayTitle}</strong></div>
                  <div className="flex gap-2 items-center"><span className="w-32">Harga Ref (H):</span><strong className="text-indigo-700 text-base">{formatCurrency(H)}</strong></div>
                  <div className="flex gap-2 items-center"><span className="w-32">Margin Ref (M):</span><strong className="text-emerald-700 text-base">{formatCurrency(M)}</strong></div>
                </div>
              </div>
              
              <div className="flex flex-col gap-4 w-full lg:w-[350px] bg-gray-50 p-4 rounded-2xl border border-gray-200">
                {(adMode === 'product' || adMode === 'group') && (
                  <div className="space-y-2 border-b border-gray-200 pb-4">
                    <Label className="text-xs font-bold text-gray-700">Metode Agregasi Data</Label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setUseConservative(false)} 
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${!useConservative ? 'bg-white border-indigo-200 text-indigo-700 shadow-sm' : 'bg-transparent border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                      >
                        Rata-Rata (ASP & ASM)
                      </button>
                      <button 
                        onClick={() => setUseConservative(true)} 
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${useConservative ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm' : 'bg-transparent border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                      >
                        Skenario Aman
                      </button>
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-700">Simulasi Biaya Iklan (B)</Label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 font-bold sm:text-sm">Rp</span>
                    </div>
                    <Input 
                      type="number" 
                      value={biayaIklan} 
                      onChange={e => setBiayaIklan(Math.max(0, Number(e.target.value) || 0))} 
                      className="pl-10 h-12 rounded-xl border-gray-300 font-black text-gray-900 bg-white" 
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-2">
              {renderSimCard('ROAS BEP', roasBep, 'red')}
              {renderSimCard('ROAS Minimum (1.5x)', roasMin, 'yellow')}
              {renderSimCard('ROAS Ideal (2.0x)', roasIdeal, 'green')}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-gray-100 pb-5">
              <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
                <Tag className="w-5 h-5 text-emerald-600" /> Hitung Rekomendasi Harga Jual
              </h3>
              <div className="flex items-center gap-3 bg-emerald-50 p-2 pl-4 rounded-2xl border border-emerald-100">
                <Label className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Target ROAS Iklan (x)</Label>
                <div className="flex items-center gap-1">
                  <Input 
                    type="number" 
                    step="0.1" 
                    min="1"
                    value={targetRoasInput} 
                    onChange={e => setTargetRoasInput(Math.max(1, Number(e.target.value) || 1))} 
                    className="w-24 h-10 rounded-xl font-black text-emerald-900 border-emerald-200 text-center text-lg bg-white" 
                  />
                </div>
              </div>
            </div>

            <div className="overflow-hidden border border-gray-200 rounded-2xl shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap md:whitespace-normal">
                  <thead className="bg-gray-50 text-gray-600 font-black border-b border-gray-200 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-4">SKU / Varian</th>
                      <th className="p-4 hidden md:table-cell">Struktur Biaya Dasar</th>
                      <th className="p-4">Harga BEP</th>
                      <th className="p-4 text-amber-700">Harga Min (1.5x)</th>
                      <th className="p-4 text-emerald-700">Harga Ideal (2.0x)</th>
                      <th className="p-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    
                    {adMode === 'variant' && v1Variant && (
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="p-4 font-bold text-gray-900 whitespace-normal min-w-[150px]">{v1Variant.nama}</td>
                        <td className="p-4 hidden md:table-cell">
                          <div className="text-xs">
                            <span className="text-gray-500">HPP:</span> <span className="font-bold">{formatCurrency(v1Hpp)}</span><br/>
                            <span className="text-gray-500">Fee:</span> <span className="font-bold">{v1FeePct}% + {formatCurrency(v1FeeNominal)}</span>
                          </div>
                        </td>
                        <td className="p-4 font-bold text-gray-500">{formatCurrency(calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).hargaBep)}</td>
                        <td className="p-4 font-black text-amber-600 text-base">{formatCurrency(calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).hargaMin)}</td>
                        <td className="p-4 font-black text-emerald-600 text-base">
                          {formatCurrency(calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).hargaIdeal)}
                          <div className="text-[10px] font-bold text-emerald-600/70 mt-1">Margin: {formatCurrency(calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).marginIdeal)}</div>
                        </td>
                        <td className="p-4 text-center">
                          <Button 
                            onClick={() => setConfirmModalData({product: v1Product!, variant: v1Variant, newPrice: calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).hargaIdeal})} 
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold px-5 h-10 w-full"
                          >
                            Terapkan Harga
                          </Button>
                        </td>
                      </tr>
                    )}

                    {adMode === 'product' && v2Product && v2Product.varian?.map(v => {
                      const hpp = calcHppPerPcs(v, ingredients);
                      const feeConf = extractFeeRates(v2Product, v);
                      const feeN = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / v2MinOrder);
                      const prices = calcReversePrice(hpp, feeConf.percentRate, feeN, targetRoasInput);
                      return (
                        <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                          <td className="p-4 font-bold text-gray-900 whitespace-normal min-w-[150px]">{v.nama}</td>
                          <td className="p-4 hidden md:table-cell">
                            <div className="text-xs">
                              <span className="text-gray-500">HPP:</span> <span className="font-bold">{formatCurrency(hpp)}</span><br/>
                              <span className="text-gray-500">Fee:</span> <span className="font-bold">{feeConf.percentRate}% + {formatCurrency(feeN)}</span>
                            </div>
                          </td>
                          <td className="p-4 font-bold text-gray-500">{formatCurrency(prices.hargaBep)}</td>
                          <td className="p-4 font-black text-amber-600 text-base">{formatCurrency(prices.hargaMin)}</td>
                          <td className="p-4 font-black text-emerald-600 text-base">
                            {formatCurrency(prices.hargaIdeal)}
                            <div className="text-[10px] font-bold text-emerald-600/70 mt-1">Margin: {formatCurrency(prices.marginIdeal)}</div>
                          </td>
                          <td className="p-4 text-center">
                            <Button 
                              onClick={() => setConfirmModalData({product: v2Product!, variant: v, newPrice: prices.hargaIdeal})} 
                              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold px-5 h-10 w-full"
                            >
                              Terapkan
                            </Button>
                          </td>
                        </tr>
                      );
                    })}

                    {adMode === 'group' && v3SelectedProductIds.length > 0 && products.filter(p => v3SelectedProductIds.includes(p.id)).map(p => {
                      const pMinOrder = Math.max(1, Number(p.min_order) || 1);
                      return p.varian?.map(v => {
                        const hpp = calcHppPerPcs(v, ingredients);
                        const feeConf = extractFeeRates(p, v);
                        const feeN = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / pMinOrder);
                        const prices = calcReversePrice(hpp, feeConf.percentRate, feeN, targetRoasInput);
                        return (
                          <tr key={`${p.id}-${v.id}`} className="hover:bg-gray-50 transition-colors">
                            <td className="p-4 font-bold text-gray-900 whitespace-normal min-w-[150px]">
                              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">{p.nama}</div>
                              {v.nama}
                            </td>
                            <td className="p-4 hidden md:table-cell">
                              <div className="text-xs">
                                <span className="text-gray-500">HPP:</span> <span className="font-bold">{formatCurrency(hpp)}</span><br/>
                                <span className="text-gray-500">Fee:</span> <span className="font-bold">{feeConf.percentRate}% + {formatCurrency(feeN)}</span>
                              </div>
                            </td>
                            <td className="p-4 font-bold text-gray-500">{formatCurrency(prices.hargaBep)}</td>
                            <td className="p-4 font-black text-amber-600 text-base">{formatCurrency(prices.hargaMin)}</td>
                            <td className="p-4 font-black text-emerald-600 text-base">
                              {formatCurrency(prices.hargaIdeal)}
                              <div className="text-[10px] font-bold text-emerald-600/70 mt-1">Margin: {formatCurrency(prices.marginIdeal)}</div>
                            </td>
                            <td className="p-4 text-center">
                              <Button 
                                onClick={() => setConfirmModalData({product: p, variant: v, newPrice: prices.hargaIdeal})} 
                                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold px-5 h-10 w-full"
                              >
                                Terapkan
                              </Button>
                            </td>
                          </tr>
                        );
                      });
                    })}

                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmModalData && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <h3 className="font-black text-xl text-gray-900">Konfirmasi Update Harga</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              Anda akan memperbarui harga <strong>{confirmModalData.product.nama} ({confirmModalData.variant.nama})</strong> secara permanen ke database menjadi:
            </p>
            <div className="text-3xl font-black text-emerald-600 text-center py-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
              {formatCurrency(confirmModalData.newPrice)}
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 h-12 rounded-xl font-bold text-gray-600" onClick={() => setConfirmModalData(null)}>Batal</Button>
              <Button className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={executeApplyPrice}>Terapkan</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
