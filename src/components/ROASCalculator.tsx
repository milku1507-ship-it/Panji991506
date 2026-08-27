import React from 'react';
import { Product, Variant, Ingredient, HppMaterial, Transaction, AdditionalFee } from '../types';
import { formatCurrency } from '../lib/formatUtils';
import { getBaseUnit, getConversionRate, toBaseValue } from '../lib/unitUtils';
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
} from 'lucide-react';

interface Props {
  products: Product[];
  ingredients: Ingredient[];
  transactions?: Transaction[];
  user: { uid: string };
}

// Storage Key
const STORAGE_KEY = 'ceumilan_roas_engine_v4';

/* ==========================================================================
   HELPER FUNCTIONS: HPP & BIAYA UNIT (SINGLE SOURCE OF TRUTH)
   ========================================================================== */
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

/**
 * Ekstraksi konfigurasi fee dari produk dan varian
 */
function extractFeeRates(product?: Product, variant?: Variant) {
  const allFees: AdditionalFee[] = [
    ...(product?.biaya_lain || []),
    ...(variant?.biaya_lain || []),
  ];

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
        // Fee nominal marketplace adalah per transaksi / per order
        nominalPerOrder += val;
      }
    }
  }

  // Standar default fee proses marketplace jika belum ada
  if (nominalPerOrder === 0) {
    nominalPerOrder = 1600;
  }

  return { percentRate, nominalPerOrder, nominalPerUnit };
}

/* ==========================================================================
   HELPER FUNCTIONS: REVERSE PRICE CALCULATION (CARI HARGA)
   ========================================================================== */
function roundPrice(price: number, step: number): number {
  if (step <= 0) return Math.round(price);
  return Math.ceil(price / step) * step;
}

interface ReverseCalcInput {
  hppPcs: number;            // E: HPP per unit (bahan + packing)
  minOrder: number;          // M: Minimal order (unit per order)
  nominalPerOrder: number;   // F: Biaya proses per order (nominal)
  nominalPerUnit: number;    // V_unit: Biaya per unit
  percentRate: number;       // C: Fee marketplace % (0-100)
  voucherPct: number;        // B: Voucher / Diskon % (0-100)
  targetRoas: number;        // Target ROAS (e.g. 6.5)
  targetProfitPct: number;   // Target Profit Bersih % (0-100, optional)
  includePpn: boolean;       // Status PPN Iklan
  ppnRate: number;           // Rate PPN Iklan (11%)
  roundingStep: number;      // 0, 100, 500, 1000
}

function calculateReversePrice(input: ReverseCalcInput) {
  const {
    hppPcs,
    minOrder,
    nominalPerOrder,
    nominalPerUnit,
    percentRate,
    voucherPct,
    targetRoas,
    targetProfitPct,
    includePpn,
    ppnRate,
    roundingStep,
  } = input;

  const M = Math.max(1, minOrder);
  const E = Math.max(0, hppPcs);
  const F = Math.max(0, nominalPerOrder);
  const V_unit = Math.max(0, nominalPerUnit);

  // HPP Real per unit (mengalokasikan biaya proses 1 order ke M unit dalam order tersebut)
  const realHppPerUnit = E + (F / M) + V_unit;

  const B = Math.max(0, voucherPct) / 100;
  const C = Math.max(0, percentRate) / 100;
  const R_target = Math.max(0.01, targetRoas);
  const T_profit = Math.max(0, targetProfitPct) / 100;
  const t_ppn = includePpn ? Math.max(0, ppnRate) / 100 : 0;

  // Rasio Biaya Iklan terhadap Omzet Real D: (1 + PPN) / Target ROAS
  const adSpendRatio = (1 + t_ppn) / R_target;

  // Faktor sisa margin dari Omzet Real D yang dapat menanggung HPP Real:
  // Net Margin Factor = 1 - adSpendRatio - T_profit
  const netMarginFactor = 1 - adSpendRatio - T_profit;

  if (netMarginFactor <= 0) {
    return {
      isFeasible: false,
      errorMessage: 'Target ROAS dan Target Profit tidak dapat dicapai secara bersamaan dengan struktur biaya saat ini.',
      priceExact: 0,
      priceRecommended: 0,
      realHppPerUnit,
      omzetRealPerUnitNeeded: 0,
      adSpendRatio,
      netMarginFactor,
    };
  }

  // Omzet Real D per unit yang dibutuhkan: D = Real HPP / Net Margin Factor
  const omzetRealPerUnitNeeded = realHppPerUnit / netMarginFactor;

  // Faktor diskon dan fee marketplace: (1 - Voucher%) * (1 - Fee%)
  const discountAndFeeFactor = (1 - B) * (1 - C);
  if (discountAndFeeFactor <= 0) {
    return {
      isFeasible: false,
      errorMessage: 'Voucher dan fee marketplace melebihi 100% omzet.',
      priceExact: 0,
      priceRecommended: 0,
      realHppPerUnit,
      omzetRealPerUnitNeeded: 0,
      adSpendRatio,
      netMarginFactor,
    };
  }

  // Harga jual matematis persis P = D / ((1 - B) * (1 - C))
  const priceExact = omzetRealPerUnitNeeded / discountAndFeeFactor;
  // Harga jual rekomendasi setelah pembulatan
  const priceRecommended = roundPrice(priceExact, roundingStep);

  return {
    isFeasible: true,
    errorMessage: null,
    priceExact,
    priceRecommended,
    realHppPerUnit,
    omzetRealPerUnitNeeded,
    discountAndFeeFactor,
    adSpendRatio,
    netMarginFactor,
  };
}

/* ==========================================================================
   HELPER FUNCTIONS: HISTORICAL DATA
   ========================================================================== */
function getHistoricalVariantSales(productId: string, transactions?: Transaction[]) {
  if (!transactions || transactions.length === 0) return { weights: {}, totalUnitsSold: 0 };
  const qtyMap: Record<string, number> = {};
  let totalQty = 0;

  transactions.forEach((tx) => {
    if (tx.penjualan_detail) {
      tx.penjualan_detail.forEach((pd) => {
        if (pd.produk_id === productId) {
          pd.varian.forEach((v) => {
            const q = Number(v.qty) || 0;
            qtyMap[v.varian_id] = (qtyMap[v.varian_id] || 0) + q;
            totalQty += q;
          });
        }
      });
    }
  });

  if (totalQty === 0) return { weights: {}, totalUnitsSold: 0 };
  const weights: Record<string, number> = {};
  Object.keys(qtyMap).forEach((vId) => {
    weights[vId] = (qtyMap[vId] / totalQty) * 100;
  });
  return { weights, totalUnitsSold: totalQty };
}

function getHistoricalProductSales(productIds: string[], transactions?: Transaction[]) {
  if (!transactions || transactions.length === 0) return { weights: {}, totalUnitsSold: 0 };
  const qtyMap: Record<string, number> = {};
  let totalQty = 0;

  transactions.forEach((tx) => {
    if (tx.penjualan_detail) {
      tx.penjualan_detail.forEach((pd) => {
        if (productIds.includes(pd.produk_id)) {
          const pQty = pd.varian.reduce((sum, v) => sum + (Number(v.qty) || 0), 0);
          qtyMap[pd.produk_id] = (qtyMap[pd.produk_id] || 0) + pQty;
          totalQty += pQty;
        }
      });
    }
  });

  if (totalQty === 0) return { weights: {}, totalUnitsSold: 0 };
  const weights: Record<string, number> = {};
  productIds.forEach((pId) => {
    weights[pId] = ((qtyMap[pId] || 0) / totalQty) * 100;
  });
  return { weights, totalUnitsSold: totalQty };
}

/* ==========================================================================
   REUSABLE UI COMPONENTS
   ========================================================================== */
interface MetricCardProps {
  label: string;
  value: number;
  sub: string;
  tooltip?: string;
  variant?: 'bep' | 'target' | 'setting' | 'worst';
  badgeText?: string;
}

function MetricCard({ label, value, sub, tooltip, variant = 'bep', badgeText }: MetricCardProps) {
  const styles = {
    bep: {
      bg: 'bg-white border-blue-200/90 text-blue-900',
      tagBg: 'bg-blue-50 text-blue-700 border-blue-200',
      valColor: 'text-blue-600',
      accent: 'border-l-4 border-l-blue-500',
    },
    target: {
      bg: 'bg-white border-violet-200/90 text-violet-900 shadow-sm',
      tagBg: 'bg-violet-100 text-violet-800 border-violet-300 font-bold',
      valColor: 'text-violet-700',
      accent: 'border-l-4 border-l-violet-600',
    },
    setting: {
      bg: 'bg-white border-purple-200/90 text-purple-900',
      tagBg: 'bg-purple-50 text-purple-700 border-purple-200',
      valColor: 'text-purple-700',
      accent: 'border-l-4 border-l-purple-500',
    },
    worst: {
      bg: 'bg-white border-amber-200/90 text-amber-900',
      tagBg: 'bg-amber-50 text-amber-700 border-amber-200',
      valColor: 'text-amber-600',
      accent: 'border-l-4 border-l-amber-500',
    },
  }[variant];

  const formattedVal = value > 0 ? `${value.toFixed(2)}x` : '—';

  return (
    <div className={`p-4 rounded-2xl border ${styles.bg} ${styles.accent} relative transition-all duration-200`}>
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span className="text-xs font-black uppercase tracking-wider text-gray-600">
          {label}
        </span>
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-help text-gray-400 hover:text-gray-600">
                  <Info className="w-3.5 h-3.5" />
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs p-2.5 bg-gray-900 text-white rounded-xl shadow-xl">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <div className="flex items-baseline gap-1.5 mt-1">
        <span className={`text-2xl sm:text-3xl font-black tracking-tight ${styles.valColor}`}>
          {formattedVal}
        </span>
        {badgeText && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${styles.tagBg}`}>
            {badgeText}
          </span>
        )}
      </div>

      <p className="text-[11px] text-gray-500 font-medium mt-1 leading-tight">{sub}</p>
    </div>
  );
}

function SummaryPill({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="p-3 rounded-2xl bg-gray-50/90 border border-gray-200/70">
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-xs font-black text-gray-900 mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

/* ==========================================================================
   MAIN COMPONENT: ROAS CALCULATOR 3 MODES
   ========================================================================== */
export default function ROASCalculator({ products, ingredients, transactions, user }: Props) {
  // Mode Iklan: 'variant' (Mode 1), 'product' (Mode 2), 'group' (Mode 3)
  const [adMode, setAdMode] = React.useState<'variant' | 'product' | 'group'>('variant');
  // Mode Perhitungan: 'find_roas' (Harga -> ROAS) | 'find_price' (Target ROAS -> Harga)
  const [calcMode, setCalcMode] = React.useState<'find_roas' | 'find_price'>('find_roas');

  // Shared Configs: Target Profit, Buffer, PPN
  const [targetProfitPct, setTargetProfitPct] = React.useState<number>(15);
  const [bufferPct, setBufferPct] = React.useState<number>(10);
  const [includePpn, setIncludePpn] = React.useState<boolean>(false);
  const [ppnRate, setPpnRate] = React.useState<number>(11);

  // ----------------------------------------------------
  // CARI HARGA (Reverse Calculation) State
  // ----------------------------------------------------
  const [targetRoasInput, setTargetRoasInput] = React.useState<number>(6.5);
  const [voucherPctInput, setVoucherPctInput] = React.useState<number>(0);
  const [useTargetProfitInFindPrice, setUseTargetProfitInFindPrice] = React.useState<boolean>(false);
  const [findPriceTargetProfitPct, setFindPriceTargetProfitPct] = React.useState<number>(15);
  const [roundingOption, setRoundingOption] = React.useState<0 | 100 | 500 | 1000>(100);
  const [simulatedPriceOverride, setSimulatedPriceOverride] = React.useState<number | null>(null);

  // ----------------------------------------------------
  // MODE 1: IKLAN VARIAN State
  // ----------------------------------------------------
  const [v1SelectedProductId, setV1SelectedProductId] = React.useState<string>(() => products[0]?.id || '');
  const [v1SelectedVariantId, setV1SelectedVariantId] = React.useState<string>(() => products[0]?.varian[0]?.id || '');
  const [v1OrderSim, setV1OrderSim] = React.useState<number>(10);
  const [v1SimRoas, setV1SimRoas] = React.useState<number>(0);

  // ----------------------------------------------------
  // MODE 2: IKLAN PRODUK State
  // ----------------------------------------------------
  const [v2SelectedProductId, setV2SelectedProductId] = React.useState<string>(() => products[0]?.id || '');
  const [v2SelectedVariantIds, setV2SelectedVariantIds] = React.useState<string[]>([]);
  const [v2VariantWeights, setV2VariantWeights] = React.useState<Record<string, number>>({});
  const [v2OrderSim, setV2OrderSim] = React.useState<number>(10);
  const [v2SimRoas, setV2SimRoas] = React.useState<number>(0);

  // ----------------------------------------------------
  // MODE 3: IKLAN GRUP State
  // ----------------------------------------------------
  const [v3GroupName, setV3GroupName] = React.useState<string>('Grup Iklan CeuMilan');
  const [v3SelectedProductIds, setV3SelectedProductIds] = React.useState<string[]>(() =>
    products.slice(0, Math.min(3, products.length)).map((p) => p.id)
  );
  // Multi-variant checkbox per product in group: productId -> variantId[]
  const [v3GroupProductVariants, setV3GroupProductVariants] = React.useState<Record<string, string[]>>({});
  const [v3ProductWeights, setV3ProductWeights] = React.useState<Record<string, number>>({});
  const [v3OrderSim, setV3OrderSim] = React.useState<number>(20);
  const [v3SimRoas, setV3SimRoas] = React.useState<number>(0);

  // Load Saved Preferences
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_${user.uid}`);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.adMode) setAdMode(data.adMode);
        if (data.targetProfitPct !== undefined) setTargetProfitPct(data.targetProfitPct);
        if (data.bufferPct !== undefined) setBufferPct(data.bufferPct);
        if (data.includePpn !== undefined) setIncludePpn(data.includePpn);
        if (data.ppnRate !== undefined) setPpnRate(data.ppnRate);
        if (data.v1OrderSim !== undefined) setV1OrderSim(data.v1OrderSim);
        if (data.v2OrderSim !== undefined) setV2OrderSim(data.v2OrderSim);
        if (data.v3OrderSim !== undefined) setV3OrderSim(data.v3OrderSim);
        if (data.v3GroupName) setV3GroupName(data.v3GroupName);
      }
    } catch {}
  }, [user.uid]);

  // Save Preferences Helper
  const savePreferences = React.useCallback(
    (key: string, val: any) => {
      try {
        const saved = localStorage.getItem(`${STORAGE_KEY}_${user.uid}`);
        const data = saved ? JSON.parse(saved) : {};
        data[key] = val;
        localStorage.setItem(`${STORAGE_KEY}_${user.uid}`, JSON.stringify(data));
      } catch {}
    },
    [user.uid]
  );

  // Sinkronisasi ID produk jika daftar produk berubah
  React.useEffect(() => {
    if (products.length > 0) {
      if (!products.some((p) => p.id === v1SelectedProductId)) {
        setV1SelectedProductId(products[0].id);
      }
      if (!products.some((p) => p.id === v2SelectedProductId)) {
        setV2SelectedProductId(products[0].id);
      }
      if (v3SelectedProductIds.length === 0) {
        setV3SelectedProductIds(products.slice(0, Math.min(3, products.length)).map((p) => p.id));
      }
    }
  }, [products, v1SelectedProductId, v2SelectedProductId, v3SelectedProductIds.length]);

  // Sinkronisasi varian untuk Mode 1 saat produk berubah
  const v1ActiveProduct = React.useMemo(() => {
    return products.find((p) => p.id === v1SelectedProductId) || products[0];
  }, [products, v1SelectedProductId]);

  React.useEffect(() => {
    if (v1ActiveProduct && v1ActiveProduct.varian && v1ActiveProduct.varian.length > 0) {
      if (!v1ActiveProduct.varian.some((v) => v.id === v1SelectedVariantId)) {
        setV1SelectedVariantId(v1ActiveProduct.varian[0].id);
      }
    }
  }, [v1ActiveProduct, v1SelectedVariantId]);

  const v1ActiveVariant = React.useMemo(() => {
    if (!v1ActiveProduct || !v1ActiveProduct.varian) return null;
    return v1ActiveProduct.varian.find((v) => v.id === v1SelectedVariantId) || v1ActiveProduct.varian[0];
  }, [v1ActiveProduct, v1SelectedVariantId]);

  // Sinkronisasi varian untuk Mode 2 saat produk berubah
  const v2ActiveProduct = React.useMemo(() => {
    return products.find((p) => p.id === v2SelectedProductId) || products[0];
  }, [products, v2SelectedProductId]);

  React.useEffect(() => {
    if (v2ActiveProduct && v2ActiveProduct.varian) {
      // Default: centang semua varian produk ini
      const allIds = v2ActiveProduct.varian.map((v) => v.id);
      setV2SelectedVariantIds((prev) => {
        const validPrev = prev.filter((id) => allIds.includes(id));
        return validPrev.length > 0 ? validPrev : allIds;
      });
    }
  }, [v2ActiveProduct]);

  // Inisialisasi bobot varian Mode 2 berdasarkan data historis
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

  // Inisialisasi varian dan bobot produk Mode 3
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

  /* ========================================================================
     MATHEMATICAL CORE ENGINE: MODE 1 (IKLAN VARIAN)
     ======================================================================== */
  const v1Calculation = React.useMemo(() => {
    if (!v1ActiveProduct || !v1ActiveVariant) return null;

    const price = Number(v1ActiveVariant.harga_jual) || 0;
    const hppPcs = calcHppPerPcs(v1ActiveVariant, ingredients);
    const minOrder = Math.max(1, Number(v1ActiveVariant.min_order) || 1); // READ-ONLY
    const numOrders = Math.max(1, v1OrderSim);

    const feeConfig = extractFeeRates(v1ActiveProduct, v1ActiveVariant);
    const percentRate = feeConfig.percentRate;
    const nominalPerOrder = feeConfig.nominalPerOrder;
    const nominalPerUnit = feeConfig.nominalPerUnit;

    // Unit Economics
    const totalUnits = numOrders * minOrder;
    const grossRevenue = totalUnits * price;
    const totalHpp = totalUnits * hppPcs;
    const marketplaceFee = grossRevenue * (percentRate / 100);
    const processFee = numOrders * nominalPerOrder; // PENTING: Jumlah Order × Biaya Proses/order
    const otherFee = totalUnits * nominalPerUnit;

    const totalCostBeforeAds = totalHpp + marketplaceFee + processFee + otherFee;
    const profitBeforeAds = grossRevenue - totalCostBeforeAds;
    const marginBeforeAds = grossRevenue > 0 ? profitBeforeAds / grossRevenue : 0;
    const marginBeforeAdsPct = marginBeforeAds * 100;

    // ROAS BEP & Target
    const roasBep = marginBeforeAds > 0 ? 1 / marginBeforeAds : 0;
    const marginForAds = marginBeforeAds - targetProfitPct / 100;
    const isTargetFeasible = marginForAds > 0;
    const roasTarget = isTargetFeasible ? 1 / marginForAds : 0;
    const roasSettingAwal = roasTarget > 0 ? roasTarget * (1 + bufferPct / 100) : 0;

    // Validasi data
    const isDataComplete = price > 0 && hppPcs > 0;

    return {
      product: v1ActiveProduct,
      variant: v1ActiveVariant,
      price,
      hppPcs,
      minOrder,
      numOrders,
      totalUnits,
      grossRevenue,
      totalHpp,
      feeConfig,
      percentRate,
      nominalPerOrder,
      nominalPerUnit,
      marketplaceFee,
      processFee,
      otherFee,
      totalCostBeforeAds,
      profitBeforeAds,
      marginBeforeAdsPct,
      roasBep,
      isTargetFeasible,
      marginForAdsPct: marginForAds * 100,
      roasTarget,
      roasSettingAwal,
      isDataComplete,
    };
  }, [v1ActiveProduct, v1ActiveVariant, ingredients, v1OrderSim, targetProfitPct, bufferPct]);

  // CARI HARGA Engine: Mode 1 (Varian)
  const v1ReverseCalc = React.useMemo(() => {
    if (!v1ActiveProduct || !v1ActiveVariant) return null;
    const hppPcs = calcHppPerPcs(v1ActiveVariant, ingredients);
    const minOrder = Math.max(1, Number(v1ActiveVariant.min_order) || 1);
    const feeConfig = extractFeeRates(v1ActiveProduct, v1ActiveVariant);

    return calculateReversePrice({
      hppPcs,
      minOrder,
      nominalPerOrder: feeConfig.nominalPerOrder,
      nominalPerUnit: feeConfig.nominalPerUnit,
      percentRate: feeConfig.percentRate,
      voucherPct: voucherPctInput,
      targetRoas: targetRoasInput,
      targetProfitPct: useTargetProfitInFindPrice ? findPriceTargetProfitPct : 0,
      includePpn,
      ppnRate,
      roundingStep: roundingOption,
    });
  }, [
    v1ActiveProduct,
    v1ActiveVariant,
    ingredients,
    voucherPctInput,
    targetRoasInput,
    useTargetProfitInFindPrice,
    findPriceTargetProfitPct,
    includePpn,
    ppnRate,
    roundingOption,
  ]);

  React.useEffect(() => {
    if (v1Calculation && v1Calculation.roasTarget > 0) {
      setV1SimRoas((prev) => (prev === 0 ? Number(v1Calculation.roasTarget.toFixed(2)) : prev));
    }
  }, [v1Calculation]);

  /* ========================================================================
     MATHEMATICAL CORE ENGINE: MODE 2 (IKLAN PRODUK — BEBERAPA VARIAN TERPILIH)
     ======================================================================== */
  const v2Calculation = React.useMemo(() => {
    if (!v2ActiveProduct || !v2ActiveProduct.varian || v2SelectedVariantIds.length === 0) {
      return null;
    }

    const selectedVariants = v2ActiveProduct.varian.filter((v) => v2SelectedVariantIds.includes(v.id));
    if (selectedVariants.length === 0) return null;

    const totalWeightSum = selectedVariants.reduce((sum, v) => sum + (v2VariantWeights[v.id] || 0), 0) || 100;

    // Normalisasi bobot desimal
    const normWeights: Record<string, number> = {};
    selectedVariants.forEach((v) => {
      normWeights[v.id] = (v2VariantWeights[v.id] || 0) / totalWeightSum;
    });

    let weightedPrice = 0;
    let weightedHpp = 0;
    let weightedMinOrder = 0;

    const feeConfig = extractFeeRates(v2ActiveProduct);
    const percentRate = feeConfig.percentRate;
    const nominalPerOrder = feeConfig.nominalPerOrder;
    const nominalPerUnit = feeConfig.nominalPerUnit;

    const variantDetails = selectedVariants.map((v) => {
      const price = Number(v.harga_jual) || 0;
      const hppPcs = calcHppPerPcs(v, ingredients);
      const minOrder = Math.max(1, Number(v.min_order) || 1);
      const w = normWeights[v.id] || 0;

      weightedPrice += price * w;
      weightedHpp += hppPcs * w;
      weightedMinOrder += minOrder * w;

      // Hitung margin individual & ROAS BEP per varian
      // Estimasi per varian jika 1 order membeli minimal order varian tersebut
      const vUnits = minOrder;
      const vOmzet = vUnits * price;
      const vHpp = vUnits * hppPcs;
      const vFee = vOmzet * (percentRate / 100);
      const vProcFee = nominalPerOrder; // 1 order
      const vOtherFee = vUnits * nominalPerUnit;
      const vTotalCost = vHpp + vFee + vProcFee + vOtherFee;
      const vProfit = vOmzet - vTotalCost;
      const vMargin = vOmzet > 0 ? vProfit / vOmzet : 0;
      const vRoasBep = vMargin > 0 ? 1 / vMargin : 0;

      return {
        variant: v,
        price,
        hppPcs,
        minOrder,
        weightPct: Math.round(w * 100),
        vMarginPct: vMargin * 100,
        vRoasBep,
      };
    });

    const effectiveMinOrder = Math.max(1, Math.round(weightedMinOrder));
    const numOrders = Math.max(1, v2OrderSim);
    const totalUnits = numOrders * effectiveMinOrder;

    const grossRevenue = totalUnits * weightedPrice;
    const totalHpp = totalUnits * weightedHpp;
    const marketplaceFee = grossRevenue * (percentRate / 100);
    const processFee = numOrders * nominalPerOrder; // PENTING: Jumlah Order × Biaya Proses
    const otherFee = totalUnits * nominalPerUnit;

    const totalCostBeforeAds = totalHpp + marketplaceFee + processFee + otherFee;
    const profitBeforeAds = grossRevenue - totalCostBeforeAds;
    const marginBeforeAds = grossRevenue > 0 ? profitBeforeAds / grossRevenue : 0;
    const marginBeforeAdsPct = marginBeforeAds * 100;

    // ROAS BEP Produk (ekonomi gabungan seluruh varian terpilih)
    const roasBepProduct = marginBeforeAds > 0 ? 1 / marginBeforeAds : 0;

    // ROAS BEP TERBURUK: MAX(ROAS BEP dari seluruh varian terpilih)
    let worstVariant = variantDetails[0];
    variantDetails.forEach((vd) => {
      if (vd.vRoasBep > (worstVariant?.vRoasBep || 0)) {
        worstVariant = vd;
      }
    });
    const roasBepWorst = worstVariant ? worstVariant.vRoasBep : 0;

    // ROAS Target & Setting Awal
    const marginForAds = marginBeforeAds - targetProfitPct / 100;
    const isTargetFeasible = marginForAds > 0;
    const roasTarget = isTargetFeasible ? 1 / marginForAds : 0;
    const roasSettingAwal = roasTarget > 0 ? roasTarget * (1 + bufferPct / 100) : 0;

    const isDataComplete = weightedPrice > 0 && weightedHpp > 0;

    return {
      product: v2ActiveProduct,
      selectedVariantsCount: selectedVariants.length,
      variantDetails,
      effectiveMinOrder,
      numOrders,
      totalUnits,
      weightedPrice,
      weightedHpp,
      grossRevenue,
      totalHpp,
      feeConfig,
      percentRate,
      nominalPerOrder,
      marketplaceFee,
      processFee,
      otherFee,
      totalCostBeforeAds,
      profitBeforeAds,
      marginBeforeAdsPct,
      roasBepProduct,
      roasBepWorst,
      worstVariant,
      isTargetFeasible,
      marginForAdsPct: marginForAds * 100,
      roasTarget,
      roasSettingAwal,
      isDataComplete,
    };
  }, [v2ActiveProduct, v2SelectedVariantIds, ingredients, v2VariantWeights, v2OrderSim, targetProfitPct, bufferPct]);

  React.useEffect(() => {
    if (v2Calculation && v2Calculation.roasTarget > 0) {
      setV2SimRoas((prev) => (prev === 0 ? Number(v2Calculation.roasTarget.toFixed(2)) : prev));
    }
  }, [v2Calculation]);

  // CARI HARGA Engine: Mode 2 (Produk)
  const v2ReverseCalc = React.useMemo(() => {
    if (!v2ActiveProduct || !v2ActiveProduct.varian || v2SelectedVariantIds.length === 0) return null;
    const selectedVariants = v2ActiveProduct.varian.filter((v) => v2SelectedVariantIds.includes(v.id));
    if (selectedVariants.length === 0) return null;

    const totalWeightSum = selectedVariants.reduce((sum, v) => sum + (v2VariantWeights[v.id] || 0), 0) || 100;
    const normWeights: Record<string, number> = {};
    selectedVariants.forEach((v) => {
      normWeights[v.id] = (v2VariantWeights[v.id] || 0) / totalWeightSum;
    });

    let weightedHpp = 0;
    let weightedMinOrder = 0;
    const feeConfig = extractFeeRates(v2ActiveProduct);

    const variantReverseDetails = selectedVariants.map((v) => {
      const hppPcs = calcHppPerPcs(v, ingredients);
      const minOrder = Math.max(1, Number(v.min_order) || 1);
      const w = normWeights[v.id] || 0;

      weightedHpp += hppPcs * w;
      weightedMinOrder += minOrder * w;

      const singleRev = calculateReversePrice({
        hppPcs,
        minOrder,
        nominalPerOrder: feeConfig.nominalPerOrder,
        nominalPerUnit: feeConfig.nominalPerUnit,
        percentRate: feeConfig.percentRate,
        voucherPct: voucherPctInput,
        targetRoas: targetRoasInput,
        targetProfitPct: useTargetProfitInFindPrice ? findPriceTargetProfitPct : 0,
        includePpn,
        ppnRate,
        roundingStep: roundingOption,
      });

      return {
        variant: v,
        weightPct: Math.round(w * 100),
        hppPcs,
        minOrder,
        rev: singleRev,
      };
    });

    const effectiveMinOrder = Math.max(1, Math.round(weightedMinOrder));

    const weightedRev = calculateReversePrice({
      hppPcs: weightedHpp,
      minOrder: effectiveMinOrder,
      nominalPerOrder: feeConfig.nominalPerOrder,
      nominalPerUnit: feeConfig.nominalPerUnit,
      percentRate: feeConfig.percentRate,
      voucherPct: voucherPctInput,
      targetRoas: targetRoasInput,
      targetProfitPct: useTargetProfitInFindPrice ? findPriceTargetProfitPct : 0,
      includePpn,
      ppnRate,
      roundingStep: roundingOption,
    });

    return {
      weightedRev,
      effectiveMinOrder,
      weightedHpp,
      feeConfig,
      variantReverseDetails,
    };
  }, [
    v2ActiveProduct,
    v2SelectedVariantIds,
    ingredients,
    v2VariantWeights,
    voucherPctInput,
    targetRoasInput,
    useTargetProfitInFindPrice,
    findPriceTargetProfitPct,
    includePpn,
    ppnRate,
    roundingOption,
  ]);

  /* ========================================================================
     MATHEMATICAL CORE ENGINE: MODE 3 (IKLAN GRUP — BANYAK PRODUK & VARIAN)
     ======================================================================== */
  const v3Calculation = React.useMemo(() => {
    if (v3SelectedProductIds.length === 0) return null;

    const groupProds = products.filter((p) => v3SelectedProductIds.includes(p.id));
    if (groupProds.length === 0) return null;

    const totalProductWeightSum =
      groupProds.reduce((sum, p) => sum + (v3ProductWeights[p.id] || 0), 0) || 100;
    const totalOrdersGroup = Math.max(1, v3OrderSim);

    // Hitung setiap produk secara mandiri terlebih dahulu
    const productBreakdown = groupProds.map((prod) => {
      const prodWeight = (v3ProductWeights[prod.id] || 0) / totalProductWeightSum;
      const allVariants = prod.varian || [];
      // Varian aktif untuk produk ini di dalam grup (bisa diset atau default semua varian)
      const activeVarIds = v3GroupProductVariants[prod.id] || allVariants.map((v) => v.id);
      const activeVariants = allVariants.filter((v) => activeVarIds.includes(v.id));
      const vCount = Math.max(1, activeVariants.length);

      let pWeightedPrice = 0;
      let pWeightedHpp = 0;
      let pWeightedMinOrder = 0;

      activeVariants.forEach((v) => {
        const vHpp = calcHppPerPcs(v, ingredients);
        const vPrice = Number(v.harga_jual) || 0;
        const vMin = Math.max(1, Number(v.min_order) || 1);
        const vShare = 1 / vCount;

        pWeightedPrice += vPrice * vShare;
        pWeightedHpp += vHpp * vShare;
        pWeightedMinOrder += vMin * vShare;
      });

      const pMinOrder = Math.max(1, Math.round(pWeightedMinOrder));
      const pOrders = totalOrdersGroup * prodWeight;
      const pUnits = pOrders * pMinOrder;

      const pGrossRevenue = pUnits * pWeightedPrice;
      const pHpp = pUnits * pWeightedHpp;

      const pFeeConfig = extractFeeRates(prod);
      const pMarketplaceFee = pGrossRevenue * (pFeeConfig.percentRate / 100);
      const pProcessFee = pOrders * pFeeConfig.nominalPerOrder;
      const pOtherFee = pUnits * pFeeConfig.nominalPerUnit;

      const pTotalCost = pHpp + pMarketplaceFee + pProcessFee + pOtherFee;
      const pProfit = pGrossRevenue - pTotalCost;
      const pMargin = pGrossRevenue > 0 ? pProfit / pGrossRevenue : 0;
      const pRoasBep = pMargin > 0 ? 1 / pMargin : 0;

      return {
        product: prod,
        weightPct: Math.round(prodWeight * 100),
        activeVariantsCount: activeVariants.length,
        minOrder: pMinOrder,
        orders: pOrders,
        units: pUnits,
        weightedPrice: pWeightedPrice,
        weightedHpp: pWeightedHpp,
        grossRevenue: pGrossRevenue,
        hpp: pHpp,
        marketplaceFee: pMarketplaceFee,
        processFee: pProcessFee,
        otherFee: pOtherFee,
        totalCost: pTotalCost,
        profitBeforeAds: pProfit,
        marginBeforeAdsPct: pMargin * 100,
        roasBep: pRoasBep,
      };
    });

    // Konsolidasi Ekonomi Grup (Σ seluruh produk)
    const totalGrossRevenue = productBreakdown.reduce((sum, pb) => sum + pb.grossRevenue, 0);
    const totalHpp = productBreakdown.reduce((sum, pb) => sum + pb.hpp, 0);
    const totalMarketplaceFee = productBreakdown.reduce((sum, pb) => sum + pb.marketplaceFee, 0);
    const totalProcessFee = productBreakdown.reduce((sum, pb) => sum + pb.processFee, 0);
    const totalOtherFee = productBreakdown.reduce((sum, pb) => sum + pb.otherFee, 0);

    const totalCostBeforeAds = totalHpp + totalMarketplaceFee + totalProcessFee + totalOtherFee;
    const profitBeforeAds = totalGrossRevenue - totalCostBeforeAds;
    const marginGrup = totalGrossRevenue > 0 ? profitBeforeAds / totalGrossRevenue : 0;
    const marginGrupPct = marginGrup * 100;

    // 1. ROAS BEP Grup
    const roasBepGroup = marginGrup > 0 ? 1 / marginGrup : 0;

    // 2. ROAS BEP TERBURUK GRUP: MAX(ROAS BEP seluruh produk dalam grup)
    let worstBepProduct = productBreakdown[0];
    productBreakdown.forEach((pb) => {
      if (pb.roasBep > (worstBepProduct?.roasBep || 0)) {
        worstBepProduct = pb;
      }
    });
    const roasBepWorst = worstBepProduct ? worstBepProduct.roasBep : 0;

    // 3. ROAS Target Grup
    const marginForAdsGroup = marginGrup - targetProfitPct / 100;
    const isTargetFeasible = marginForAdsGroup > 0;
    const roasTargetGroup = isTargetFeasible ? 1 / marginForAdsGroup : 0;

    // 4. ROAS Setting Awal Grup
    const roasSettingAwalGroup = roasTargetGroup > 0 ? roasTargetGroup * (1 + bufferPct / 100) : 0;

    const totalUnitsGroup = productBreakdown.reduce((sum, pb) => sum + pb.units, 0);
    const totalVariantsCount = productBreakdown.reduce((sum, pb) => sum + pb.activeVariantsCount, 0);

    return {
      groupName: v3GroupName,
      productsCount: groupProds.length,
      totalVariantsCount,
      totalOrdersGroup,
      totalUnitsGroup,
      totalGrossRevenue,
      totalHpp,
      totalMarketplaceFee,
      totalProcessFee,
      totalOtherFee,
      totalCostBeforeAds,
      profitBeforeAds,
      marginGrupPct,
      roasBepGroup,
      roasBepWorst,
      worstBepProduct,
      isTargetFeasible,
      marginForAdsGroupPct: marginForAdsGroup * 100,
      roasTargetGroup,
      roasSettingAwalGroup,
      productBreakdown,
    };
  }, [
    v3SelectedProductIds,
    products,
    v3ProductWeights,
    v3GroupProductVariants,
    v3OrderSim,
    ingredients,
    targetProfitPct,
    bufferPct,
    v3GroupName,
  ]);

  // CARI HARGA Engine: Mode 3 (Grup)
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
      const vCount = Math.max(1, activeVariants.length);

      let pWeightedHpp = 0;
      let pWeightedMinOrder = 0;

      activeVariants.forEach((v) => {
        const vHpp = calcHppPerPcs(v, ingredients);
        const vMin = Math.max(1, Number(v.min_order) || 1);
        const vShare = 1 / vCount;

        pWeightedHpp += vHpp * vShare;
        pWeightedMinOrder += vMin * vShare;
      });

      const pMinOrder = Math.max(1, Math.round(pWeightedMinOrder));
      const pFeeConfig = extractFeeRates(prod);

      const rev = calculateReversePrice({
        hppPcs: pWeightedHpp,
        minOrder: pMinOrder,
        nominalPerOrder: pFeeConfig.nominalPerOrder,
        nominalPerUnit: pFeeConfig.nominalPerUnit,
        percentRate: pFeeConfig.percentRate,
        voucherPct: voucherPctInput,
        targetRoas: targetRoasInput,
        targetProfitPct: useTargetProfitInFindPrice ? findPriceTargetProfitPct : 0,
        includePpn,
        ppnRate,
        roundingStep: roundingOption,
      });

      return {
        product: prod,
        weightPct: Math.round(prodWeight * 100),
        activeVariantsCount: activeVariants.length,
        weightedHpp: pWeightedHpp,
        minOrder: pMinOrder,
        feeConfig: pFeeConfig,
        rev,
      };
    });

    return {
      groupName: v3GroupName,
      productReverseDetails,
    };
  }, [
    v3SelectedProductIds,
    products,
    v3ProductWeights,
    v3GroupProductVariants,
    ingredients,
    voucherPctInput,
    targetRoasInput,
    useTargetProfitInFindPrice,
    findPriceTargetProfitPct,
    includePpn,
    ppnRate,
    roundingOption,
    v3GroupName,
  ]);

  React.useEffect(() => {
    if (v3Calculation && v3Calculation.roasTargetGroup > 0) {
      setV3SimRoas((prev) => (prev === 0 ? Number(v3Calculation.roasTargetGroup.toFixed(2)) : prev));
    }
  }, [v3Calculation]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24 md:pb-12 text-[#1A1A2E]">
      {/* ====================================================================
          HEADER UTAMA & STRUKTUR 3 MODE IKLAN
          ==================================================================== */}
      <div className="space-y-3">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 flex items-center justify-center text-white shadow-lg shadow-violet-200 shrink-0">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-[#1A1A2E]">
                Kalkulator Target ROAS
              </h1>
              <Badge variant="outline" className="text-[11px] font-bold border-violet-200 bg-violet-50 text-violet-700">
                Pre-Campaign Decision Engine
              </Badge>
            </div>
            <p className="text-xs md:text-sm text-gray-500 font-medium mt-0.5 max-w-3xl">
              Hitung ROAS ideal sebelum iklan berdasarkan harga, HPP, fee marketplace, minimal order, biaya proses, target profit, dan struktur produk.
            </p>
          </div>
        </div>

        {/* Dual Tab Pilihan Mode Iklan & Mode Perhitungan */}
        <div className="pt-2 space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-2 rounded-2xl border border-gray-200/80 shadow-xs">
            {/* 1. Pilihan Jenis Iklan */}
            <div className="flex items-center gap-1 bg-gray-100/90 p-1 rounded-xl flex-1">
              <button
                type="button"
                onClick={() => {
                  setAdMode('variant');
                  savePreferences('adMode', 'variant');
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                  adMode === 'variant'
                    ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
                    : 'text-gray-600 hover:text-violet-700 hover:bg-violet-50/60'
                }`}
              >
                <Tag className="w-3.5 h-3.5 shrink-0" />
                <span>IKLAN VARIAN</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAdMode('product');
                  savePreferences('adMode', 'product');
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                  adMode === 'product'
                    ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
                    : 'text-gray-600 hover:text-violet-700 hover:bg-violet-50/60'
                }`}
              >
                <Package className="w-3.5 h-3.5 shrink-0" />
                <span>IKLAN PRODUK</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAdMode('group');
                  savePreferences('adMode', 'group');
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                  adMode === 'group'
                    ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
                    : 'text-gray-600 hover:text-violet-700 hover:bg-violet-50/60'
                }`}
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span>IKLAN GRUP</span>
              </button>
            </div>

            {/* 2. Pilihan Mode Perhitungan (CARI ROAS vs CARI HARGA) */}
            <div className="flex items-center gap-1 bg-gradient-to-r from-violet-100/80 to-purple-100/80 p-1 rounded-xl border border-violet-200/60 shrink-0">
              <button
                type="button"
                onClick={() => setCalcMode('find_roas')}
                className={`py-2 px-4 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  calcMode === 'find_roas'
                    ? 'bg-gradient-to-r from-violet-700 to-purple-700 text-white shadow-sm'
                    : 'text-violet-800 hover:bg-white/60'
                }`}
              >
                <Calculator className="w-3.5 h-3.5 shrink-0" />
                <span>CARI ROAS</span>
              </button>

              <button
                type="button"
                onClick={() => setCalcMode('find_price')}
                className={`py-2 px-4 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  calcMode === 'find_price'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm'
                    : 'text-emerald-800 hover:bg-white/60'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5 shrink-0" />
                <span>CARI HARGA</span>
              </button>
            </div>
          </div>

          {/* Penjelasan Singkat Mode Terpilih */}
          <div className="text-xs text-gray-500 font-medium bg-gray-50/90 border border-gray-200/70 p-2.5 rounded-xl flex items-center gap-2">
            <Info className="w-4 h-4 text-violet-600 shrink-0" />
            <span>
              {calcMode === 'find_roas' ? (
                adMode === 'variant' ? 'Mode CARI ROAS (Varian): Pengguna memasukkan harga jual → sistem menghitung ROAS BEP & ROAS Target.'
                : adMode === 'product' ? 'Mode CARI ROAS (Produk): Menghitung rata-rata tertimbang varian → sistem menghitung ROAS BEP Produk & BEP Terburuk.'
                : 'Mode CARI ROAS (Grup): Konsolidasi ekonomi beberapa produk → sistem menghitung ROAS BEP Grup & BEP Terburuk.'
              ) : (
                adMode === 'variant' ? 'Mode CARI HARGA (Varian): Pengguna memasukkan Target ROAS → sistem menghitung harga jual yang diperlukan.'
                : adMode === 'product' ? 'Mode CARI HARGA (Produk): Pengguna memasukkan Target ROAS → sistem menghitung harga jual rekomendasi produk & varian.'
                : 'Mode CARI HARGA (Grup): Pengguna memasukkan Target ROAS → sistem menghitung harga jual yang diperlukan untuk setiap produk dalam grup.'
              )}
            </span>
          </div>
        </div>
      </div>

      {/* ====================================================================
          PENGATURAN TARGET PROFIT, BUFFER ROAS & PPN BIAYA IKLAN (SHARED)
          ==================================================================== */}
      <Card className="rounded-3xl border-none shadow-sm bg-white">
        <CardContent className="p-5 md:p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                Parameter Strategi Iklan
              </span>
              <h2 className="text-sm font-bold text-gray-900">Target Profit, Buffer & PPN Iklan</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Target Profit */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                <span>Target Profit Bersih</span>
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
                {[10, 15, 20, 25].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setTargetProfitPct(preset);
                      savePreferences('targetProfitPct', preset);
                    }}
                    className={`h-10 px-2.5 rounded-xl text-xs font-bold transition-all ${
                      targetProfitPct === preset
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400">Default: 15% (Sisa keuntungan bersih dari omzet setelah seluruh biaya & iklan).</p>
            </div>

            {/* Buffer ROAS */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                <span>Buffer ROAS (Setting Awal)</span>
                <span className="text-violet-700 font-black">+{bufferPct}%</span>
              </Label>
              <div className="flex items-center gap-1.5">
                {[0, 5, 10, 15].map((buf) => (
                  <button
                    key={buf}
                    type="button"
                    onClick={() => {
                      setBufferPct(buf);
                      savePreferences('bufferPct', buf);
                    }}
                    className={`flex-1 h-10 rounded-xl text-xs font-bold transition-all ${
                      bufferPct === buf
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {buf}%
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400">Cadangan keamanan strategi untuk setting awal di dashboard iklan.</p>
            </div>

            {/* PPN Biaya Iklan */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                <span>PPN Biaya Iklan</span>
                <span className="text-xs font-bold text-gray-500">{includePpn ? `Aktif (${ppnRate}%)` : 'Non-aktif'}</span>
              </Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = !includePpn;
                    setIncludePpn(next);
                    savePreferences('includePpn', next);
                  }}
                  className={`flex-1 h-10 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    includePpn ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Percent className="w-3.5 h-3.5" />
                  <span>{includePpn ? 'PPN Aktif (11%)' : 'Tanpa PPN'}</span>
                </button>
              </div>
              <p className="text-[11px] text-gray-400">Pajak Pertambahan Nilai atas tagihan biaya iklan dari platform.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ====================================================================
          MODE CALCULATION: CARI ROAS
          ==================================================================== */}
      {calcMode === 'find_roas' && (
        <div className="space-y-6">
          {/* ====================================================================
              MODE 1: IKLAN VARIAN (1 Produk = 1 Varian)
              ==================================================================== */}
          {adMode === 'variant' && (
        <div className="space-y-6">
          {/* Langkah 1 & 2: Pilih Produk & Pilih Varian */}
          <Card className="rounded-3xl border-none shadow-sm bg-white">
            <CardContent className="p-5 md:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                    1. Pilih Varian Spesifik
                  </span>
                  <h2 className="text-sm font-bold text-gray-900">Pilih 1 Produk & 1 Varian Iklan</h2>
                </div>
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
                        if (typeof val === 'string') setV1SelectedProductId(val);
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
                        if (typeof val === 'string') setV1SelectedVariantId(val);
                      }}
                    >
                      <SelectTrigger className="rounded-xl h-11 bg-gray-50/80 border-gray-200 font-bold text-xs">
                        <SelectValue placeholder="Pilih varian..." />
                      </SelectTrigger>
                      <SelectContent>
                        {v1ActiveProduct?.varian.map((v) => (
                          <SelectItem key={v.id} value={v.id} className="text-xs">
                            {v.nama} — {formatCurrency(v.harga_jual, true)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Data Ekonomi Varian Terpilih */}
              {v1Calculation && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <SummaryPill
                    label="Harga Jual"
                    value={formatCurrency(v1Calculation.price, true)}
                    hint="Per pack/pcs"
                  />
                  <SummaryPill
                    label="HPP Bahan + Packing"
                    value={formatCurrency(Math.round(v1Calculation.hppPcs), true)}
                    hint="Per pack/pcs"
                  />
                  <SummaryPill
                    label="Minimal Order"
                    value={`${v1Calculation.minOrder} pack/order`}
                    hint="Read-only (Data Varian)"
                  />
                  <SummaryPill
                    label="Biaya Proses"
                    value={`${formatCurrency(v1Calculation.nominalPerOrder, true)}/order`}
                    hint="Per Transaksi Order"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Simulasi Order Mode 1 */}
          {v1Calculation && (
            <Card className="rounded-3xl border-none shadow-sm bg-white">
              <CardContent className="p-5 md:p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                      2. Simulasi Order
                    </span>
                    <h2 className="text-sm font-bold text-gray-900">Jumlah Order Simulasi Varian</h2>
                  </div>
                  <span className="text-xs font-bold text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                    Total Unit = {v1Calculation.totalUnits} pack
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-700">Jumlah Order Simulasi</Label>
                    <Input
                      type="number"
                      min={1}
                      value={v1OrderSim}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value) || 1);
                        setV1OrderSim(val);
                        savePreferences('v1OrderSim', val);
                      }}
                      className="rounded-xl h-11 font-bold text-sm"
                    />
                  </div>
                  <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/70 text-xs text-gray-600 space-y-1">
                    <p className="font-bold text-gray-800">Rumus Unit Economics Order:</p>
                    <p>
                      {v1OrderSim} order × {v1Calculation.minOrder} pack/order = <strong>{v1Calculation.totalUnits} unit</strong>
                    </p>
                    <p>
                      Biaya Proses = {v1OrderSim} order × {formatCurrency(v1Calculation.nominalPerOrder, true)} = <strong>{formatCurrency(v1Calculation.processFee, true)}</strong>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Hasil ROAS & Dashboard Mode 1 */}
          {v1Calculation && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Kolom Kiri: Dashboard Unit Economics */}
              <div className="lg:col-span-5 space-y-4">
                <Card className="rounded-3xl border-none shadow-sm bg-white">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                      <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">
                        Dashboard Mode Varian
                      </h3>
                      <Badge className="bg-gray-100 text-gray-700 border-none font-bold text-[11px]">
                        1 Varian Tunggal
                      </Badge>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Produk</span>
                        <span className="font-bold text-gray-900 truncate max-w-[180px]">{v1Calculation.product.nama}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Varian</span>
                        <span className="font-bold text-violet-700">{v1Calculation.variant.nama}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Minimal Order</span>
                        <span className="font-bold text-gray-900">{v1Calculation.minOrder} pack/order</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Total Unit ({v1Calculation.numOrders} order)</span>
                        <span className="font-bold text-gray-900">{v1Calculation.totalUnits} pack</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-gray-100">
                        <span className="text-gray-500 font-medium">Omzet</span>
                        <span className="font-black text-gray-900">{formatCurrency(v1Calculation.grossRevenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">HPP Total</span>
                        <span className="font-bold text-rose-600">-{formatCurrency(v1Calculation.totalHpp)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">
                          Fee Marketplace ({v1Calculation.percentRate}%)
                        </span>
                        <span className="font-bold text-amber-600">-{formatCurrency(v1Calculation.marketplaceFee)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">
                          Biaya Proses ({v1Calculation.numOrders} order)
                        </span>
                        <span className="font-bold text-amber-600">-{formatCurrency(v1Calculation.processFee)}</span>
                      </div>

                      <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-gray-900">Profit Sebelum Iklan</p>
                          <p className="text-[11px] text-gray-400">Margin: {v1Calculation.marginBeforeAdsPct.toFixed(1)}%</p>
                        </div>
                        <p className="text-sm font-black text-emerald-600">
                          {formatCurrency(v1Calculation.profitBeforeAds)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Kolom Kanan: Kartu ROAS & Simulator */}
              <div className="lg:col-span-7 space-y-4">
                <Card className="rounded-3xl border-none shadow-md bg-gradient-to-br from-violet-50/80 via-purple-50/40 to-fuchsia-50/60">
                  <CardContent className="p-5 md:p-6 space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-violet-100">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-200/60 px-2 py-0.5 rounded-md">
                          Hasil ROAS
                        </span>
                        <h3 className="text-sm md:text-base font-black text-gray-900">
                          Target ROAS: {v1Calculation.variant.nama}
                        </h3>
                      </div>
                    </div>

                    {!v1Calculation.isTargetFeasible ? (
                      <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-black text-rose-700">Target profit tidak dapat dicapai</p>
                          <p className="text-xs text-rose-600 leading-relaxed">
                            "Target profit tidak dapat dicapai dengan struktur biaya saat ini." (Margin sebelum iklan {v1Calculation.marginBeforeAdsPct.toFixed(1)}% &lt; Target profit {targetProfitPct}%).
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <MetricCard
                          label="ROAS BEP"
                          value={v1Calculation.roasBep}
                          sub="Titik Impas (0 Profit)"
                          variant="bep"
                          tooltip="Ini adalah titik impas berdasarkan struktur biaya. Di bawah angka ini, biaya iklan berpotensi membuat transaksi menjadi rugi."
                        />

                        <MetricCard
                          label="ROAS Target"
                          value={v1Calculation.roasTarget}
                          sub={`Target Net: ${targetProfitPct}%`}
                          variant="target"
                          badgeText="Utama"
                          tooltip="Ini adalah ROAS yang dibutuhkan agar setelah seluruh biaya dan iklan, profit bersih sesuai target Anda."
                        />

                        <MetricCard
                          label="ROAS Setting Awal"
                          value={v1Calculation.roasSettingAwal}
                          sub={`Buffer +${bufferPct}%`}
                          variant="setting"
                          tooltip="Ini adalah angka rekomendasi untuk setting awal iklan setelah ditambahkan buffer keamanan."
                        />
                      </div>
                    )}

                    {/* Simulator Interaktif Mode Varian */}
                    {v1Calculation.isTargetFeasible && (
                      <div className="mt-4 p-4 rounded-2xl bg-white border border-violet-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Activity className="w-4 h-4 text-violet-600" />
                            <span className="text-xs font-bold text-gray-800">Simulator ROAS Iklan</span>
                          </div>
                          <span className="text-xs font-black text-violet-600">Simulasi ROAS: {v1SimRoas.toFixed(2)}x</span>
                        </div>

                        <input
                          type="range"
                          min={1}
                          max={20}
                          step={0.1}
                          value={v1SimRoas}
                          onChange={(e) => setV1SimRoas(Number(e.target.value))}
                          className="w-full h-2 rounded-lg bg-violet-100 appearance-none cursor-pointer accent-violet-600"
                        />

                        {(() => {
                          const baseAdSpend = v1SimRoas > 0 ? v1Calculation.grossRevenue / v1SimRoas : 0;
                          const actualAdSpend = includePpn ? baseAdSpend * (1 + ppnRate / 100) : baseAdSpend;
                          const netProfit = v1Calculation.profitBeforeAds - actualAdSpend;
                          const netMargin = v1Calculation.grossRevenue > 0 ? (netProfit / v1Calculation.grossRevenue) * 100 : 0;

                          return (
                            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-center text-xs">
                              <div className="p-2 rounded-xl bg-gray-50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Biaya Iklan {includePpn ? '(+PPN)' : ''}</p>
                                <p className="font-bold text-gray-900 mt-0.5">{formatCurrency(actualAdSpend)}</p>
                              </div>
                              <div className="p-2 rounded-xl bg-gray-50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Profit Bersih</p>
                                <p className={`font-black mt-0.5 ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {formatCurrency(netProfit)}
                                </p>
                              </div>
                              <div className="p-2 rounded-xl bg-gray-50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Margin Bersih</p>
                                <p className={`font-black mt-0.5 ${netMargin >= targetProfitPct ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  {netMargin.toFixed(1)}%
                                </p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          MODE 2: IKLAN PRODUK (1 Produk = Beberapa Varian Dipilih)
          ==================================================================== */}
      {adMode === 'product' && (
        <div className="space-y-6">
          {/* Langkah 1 & 2: Pilih Produk & Checklist Varian */}
          <Card className="rounded-3xl border-none shadow-sm bg-white">
            <CardContent className="p-5 md:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                    1. Pilih Produk & Checklist Varian
                  </span>
                  <h2 className="text-sm font-bold text-gray-900">Varian yang Diikutsertakan dalam Iklan</h2>
                </div>
                {v2ActiveProduct && (
                  <Badge variant="outline" className="text-xs font-bold text-violet-700 bg-violet-50 border-violet-200">
                    {v2SelectedVariantIds.length} dari {v2ActiveProduct.varian.length} Varian Dipilih
                  </Badge>
                )}
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
                            {p.nama} {p.sku ? `(${p.sku})` : ''} — {p.varian.length} Varian
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Checklist Varian & Bobot Penjualan */}
                  {v2ActiveProduct && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-gray-700">
                          Centang Varian yang Diiklankan & Atur Bobot (%):
                        </Label>
                        <button
                          type="button"
                          onClick={() => {
                            // Toggle all
                            if (v2SelectedVariantIds.length === v2ActiveProduct.varian.length) {
                              if (v2ActiveProduct.varian[0]) setV2SelectedVariantIds([v2ActiveProduct.varian[0].id]);
                            } else {
                              setV2SelectedVariantIds(v2ActiveProduct.varian.map((v) => v.id));
                            }
                          }}
                          className="text-[11px] font-bold text-violet-600 hover:text-violet-700"
                        >
                          {v2SelectedVariantIds.length === v2ActiveProduct.varian.length ? 'Pilih 1 Saja' : 'Pilih Semua'}
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        {v2ActiveProduct.varian.map((v) => {
                          const isChecked = v2SelectedVariantIds.includes(v.id);
                          const hppPcs = calcHppPerPcs(v, ingredients);

                          return (
                            <div
                              key={v.id}
                              className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                isChecked
                                  ? 'bg-white border-violet-200 shadow-xs'
                                  : 'bg-gray-50/60 border-gray-200/60 opacity-60'
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
                                    isChecked
                                      ? 'bg-violet-600 border-violet-600 text-white'
                                      : 'bg-white border-gray-300'
                                  }`}
                                >
                                  {isChecked && <CheckCircle2 className="w-3.5 h-3.5" />}
                                </button>
                                <div className="space-y-0.5 min-w-0">
                                  <p className="text-xs font-bold text-gray-900 truncate">{v.nama}</p>
                                  <p className="text-[11px] text-gray-500">
                                    Harga: <strong>{formatCurrency(v.harga_jual, true)}</strong> • HPP: <strong>{formatCurrency(Math.round(hppPcs), true)}</strong> • Min: {v.min_order || 1} pack
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

                  {/* Summary Nilai Tertimbang */}
                  {v2Calculation && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      <SummaryPill
                        label="Minimal Order"
                        value={`${v2Calculation.effectiveMinOrder} pack/order`}
                        hint="Weighted Read-only"
                      />
                      <SummaryPill
                        label="Harga Rata-rata"
                        value={formatCurrency(v2Calculation.weightedPrice, true)}
                        hint="Weighted average"
                      />
                      <SummaryPill
                        label="HPP Rata-rata"
                        value={formatCurrency(v2Calculation.weightedHpp, true)}
                        hint="Weighted average"
                      />
                      <SummaryPill
                        label="Biaya Proses"
                        value={`${formatCurrency(v2Calculation.nominalPerOrder, true)}/order`}
                        hint="Per Transaksi Order"
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Simulasi Order Mode 2 */}
          {v2Calculation && (
            <Card className="rounded-3xl border-none shadow-sm bg-white">
              <CardContent className="p-5 md:p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                      2. Simulasi Order Produk
                    </span>
                    <h2 className="text-sm font-bold text-gray-900">Jumlah Order Simulasi Iklan Produk</h2>
                  </div>
                  <span className="text-xs font-bold text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                    Total Unit = {v2Calculation.totalUnits} pack
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-700">Jumlah Order Simulasi</Label>
                    <Input
                      type="number"
                      min={1}
                      value={v2OrderSim}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value) || 1);
                        setV2OrderSim(val);
                        savePreferences('v2OrderSim', val);
                      }}
                      className="rounded-xl h-11 font-bold text-sm"
                    />
                  </div>
                  <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/70 text-xs text-gray-600 space-y-1">
                    <p className="font-bold text-gray-800">Perhitungan Unit & Biaya:</p>
                    <p>
                      {v2OrderSim} order × {v2Calculation.effectiveMinOrder} pack/order = <strong>{v2Calculation.totalUnits} pack</strong>
                    </p>
                    <p>
                      Biaya Proses = {v2OrderSim} order × {formatCurrency(v2Calculation.nominalPerOrder, true)} = <strong>{formatCurrency(v2Calculation.processFee, true)}</strong>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Hasil ROAS & Dashboard Mode 2 */}
          {v2Calculation && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Kolom Kiri: Dashboard Produk */}
              <div className="lg:col-span-5 space-y-4">
                <Card className="rounded-3xl border-none shadow-sm bg-white">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                      <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">
                        Dashboard Mode Produk
                      </h3>
                      <Badge className="bg-gray-100 text-gray-700 border-none font-bold text-[11px]">
                        {v2Calculation.selectedVariantsCount} Varian Dipilih
                      </Badge>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Produk</span>
                        <span className="font-bold text-gray-900 truncate max-w-[180px]">{v2Calculation.product.nama}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Minimal Order</span>
                        <span className="font-bold text-gray-900">{v2Calculation.effectiveMinOrder} pack/order</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Total Unit ({v2Calculation.numOrders} order)</span>
                        <span className="font-bold text-gray-900">{v2Calculation.totalUnits} pack</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-gray-100">
                        <span className="text-gray-500 font-medium">Omzet</span>
                        <span className="font-black text-gray-900">{formatCurrency(v2Calculation.grossRevenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">HPP Total</span>
                        <span className="font-bold text-rose-600">-{formatCurrency(v2Calculation.totalHpp)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">
                          Fee Marketplace ({v2Calculation.percentRate}%)
                        </span>
                        <span className="font-bold text-amber-600">-{formatCurrency(v2Calculation.marketplaceFee)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">
                          Biaya Proses ({v2Calculation.numOrders} order)
                        </span>
                        <span className="font-bold text-amber-600">-{formatCurrency(v2Calculation.processFee)}</span>
                      </div>

                      <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-gray-900">Profit Sebelum Iklan</p>
                          <p className="text-[11px] text-gray-400">Margin: {v2Calculation.marginBeforeAdsPct.toFixed(1)}%</p>
                        </div>
                        <p className="text-sm font-black text-emerald-600">
                          {formatCurrency(v2Calculation.profitBeforeAds)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Kolom Kanan: 4 Kartu ROAS Utama & Simulator */}
              <div className="lg:col-span-7 space-y-4">
                <Card className="rounded-3xl border-none shadow-md bg-gradient-to-br from-violet-50/80 via-purple-50/40 to-fuchsia-50/60">
                  <CardContent className="p-5 md:p-6 space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-violet-100">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-200/60 px-2 py-0.5 rounded-md">
                          Hasil ROAS
                        </span>
                        <h3 className="text-sm md:text-base font-black text-gray-900">
                          Target ROAS: {v2Calculation.product.nama}
                        </h3>
                      </div>
                    </div>

                    {!v2Calculation.isTargetFeasible ? (
                      <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-black text-rose-700">Target profit tidak dapat dicapai</p>
                          <p className="text-xs text-rose-600 leading-relaxed">
                            "Target profit tidak dapat dicapai dengan struktur biaya saat ini." (Margin sebelum iklan {v2Calculation.marginBeforeAdsPct.toFixed(1)}% &lt; Target profit {targetProfitPct}%).
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <MetricCard
                          label="ROAS BEP Produk"
                          value={v2Calculation.roasBepProduct}
                          sub="Titik Impas Gabungan (0 Profit)"
                          variant="bep"
                          tooltip="Ini adalah titik impas berdasarkan struktur biaya. Di bawah angka ini, biaya iklan berpotensi membuat transaksi menjadi rugi."
                        />

                        <MetricCard
                          label="ROAS BEP Terburuk"
                          value={v2Calculation.roasBepWorst}
                          sub={`Varian: ${v2Calculation.worstVariant?.variant.nama || '-'}`}
                          variant="worst"
                          tooltip="ROAS BEP Terburuk menunjukkan varian yang membutuhkan ROAS paling tinggi untuk mencapai titik impas."
                        />

                        <MetricCard
                          label="ROAS Target"
                          value={v2Calculation.roasTarget}
                          sub={`Target Net: ${targetProfitPct}%`}
                          variant="target"
                          badgeText="Utama"
                          tooltip="Ini adalah ROAS yang dibutuhkan agar setelah seluruh biaya dan iklan, profit bersih sesuai target Anda."
                        />

                        <MetricCard
                          label="ROAS Setting Awal"
                          value={v2Calculation.roasSettingAwal}
                          sub={`Buffer +${bufferPct}%`}
                          variant="setting"
                          tooltip="Ini adalah angka rekomendasi untuk setting awal iklan setelah ditambahkan buffer keamanan."
                        />
                      </div>
                    )}

                    {/* Simulator Interaktif Mode Produk */}
                    {v2Calculation.isTargetFeasible && (
                      <div className="mt-4 p-4 rounded-2xl bg-white border border-violet-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Activity className="w-4 h-4 text-violet-600" />
                            <span className="text-xs font-bold text-gray-800">Simulator ROAS Iklan Produk</span>
                          </div>
                          <span className="text-xs font-black text-violet-600">Simulasi ROAS: {v2SimRoas.toFixed(2)}x</span>
                        </div>

                        <input
                          type="range"
                          min={1}
                          max={20}
                          step={0.1}
                          value={v2SimRoas}
                          onChange={(e) => setV2SimRoas(Number(e.target.value))}
                          className="w-full h-2 rounded-lg bg-violet-100 appearance-none cursor-pointer accent-violet-600"
                        />

                        {(() => {
                          const baseAdSpend = v2SimRoas > 0 ? v2Calculation.grossRevenue / v2SimRoas : 0;
                          const actualAdSpend = includePpn ? baseAdSpend * (1 + ppnRate / 100) : baseAdSpend;
                          const netProfit = v2Calculation.profitBeforeAds - actualAdSpend;
                          const netMargin = v2Calculation.grossRevenue > 0 ? (netProfit / v2Calculation.grossRevenue) * 100 : 0;

                          return (
                            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-center text-xs">
                              <div className="p-2 rounded-xl bg-gray-50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Biaya Iklan {includePpn ? '(+PPN)' : ''}</p>
                                <p className="font-bold text-gray-900 mt-0.5">{formatCurrency(actualAdSpend)}</p>
                              </div>
                              <div className="p-2 rounded-xl bg-gray-50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Profit Bersih</p>
                                <p className={`font-black mt-0.5 ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {formatCurrency(netProfit)}
                                </p>
                              </div>
                              <div className="p-2 rounded-xl bg-gray-50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Margin Bersih</p>
                                <p className={`font-black mt-0.5 ${netMargin >= targetProfitPct ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  {netMargin.toFixed(1)}%
                                </p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          MODE 3: IKLAN GRUP (1 Grup Iklan = Beberapa Produk)
          ==================================================================== */}
      {adMode === 'group' && (
        <div className="space-y-6">
          {/* Langkah 1: Atur Grup & Daftar Produk */}
          <Card className="rounded-3xl border-none shadow-sm bg-white">
            <CardContent className="p-5 md:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                    1. Pengaturan Grup Iklan
                  </span>
                  <h2 className="text-sm font-bold text-gray-900">Daftar Produk dalam Grup Iklan</h2>
                </div>
                <Badge variant="outline" className="text-xs font-bold text-violet-700 bg-violet-50 border-violet-200">
                  {v3SelectedProductIds.length} Produk dalam Grup
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs font-bold text-gray-600">Nama Grup Iklan</Label>
                  <Input
                    value={v3GroupName}
                    onChange={(e) => {
                      setV3GroupName(e.target.value);
                      savePreferences('v3GroupName', e.target.value);
                    }}
                    placeholder="Contoh: Grup Iklan Cireng & Siomay"
                    className="rounded-xl h-11 font-bold text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-600">Tambah Produk ke Grup</Label>
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

              {/* Daftar Produk & Bobot Kontribusi dalam Grup */}
              <div className="space-y-3 pt-2">
                <Label className="text-xs font-bold text-gray-700">
                  Daftar Produk & Distribusi Penjualan dalam Grup:
                </Label>

                {v3SelectedProductIds.map((pId) => {
                  const prod = products.find((p) => p.id === pId);
                  if (!prod) return null;

                  return (
                    <div
                      key={pId}
                      className="p-3.5 rounded-2xl bg-white border border-gray-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-gray-900 truncate">{prod.nama}</p>
                          <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                            {prod.varian.length} varian
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {prod.varian.map((v) => v.nama).slice(0, 3).join(', ')}
                          {prod.varian.length > 3 ? '...' : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
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
                            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
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

          {/* Simulasi Order Mode Grup */}
          {v3Calculation && (
            <Card className="rounded-3xl border-none shadow-sm bg-white">
              <CardContent className="p-5 md:p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                      2. Simulasi Order Grup
                    </span>
                    <h2 className="text-sm font-bold text-gray-900">Jumlah Order Simulasi Seluruh Grup</h2>
                  </div>
                  <span className="text-xs font-bold text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                    Total Unit = {v3Calculation.totalUnitsGroup} pack
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-700">Jumlah Order Simulasi Grup</Label>
                    <Input
                      type="number"
                      min={1}
                      value={v3OrderSim}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value) || 1);
                        setV3OrderSim(val);
                        savePreferences('v3OrderSim', val);
                      }}
                      className="rounded-xl h-11 font-bold text-sm"
                    />
                  </div>
                  <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/70 text-xs text-gray-600 space-y-1">
                    <p className="font-bold text-gray-800">Ringkasan Ekonomi Grup:</p>
                    <p>
                      Total {v3OrderSim} Order terdistribusi ke <strong>{v3Calculation.productsCount} Produk</strong>
                    </p>
                    <p>
                      Biaya Proses Total = <strong>{formatCurrency(v3Calculation.totalProcessFee, true)}</strong>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Hasil ROAS & Dashboard Mode Grup */}
          {v3Calculation && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Kolom Kiri: Dashboard Grup */}
              <div className="lg:col-span-5 space-y-4">
                <Card className="rounded-3xl border-none shadow-sm bg-white">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                      <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">
                        Dashboard Mode Grup
                      </h3>
                      <Badge className="bg-gray-100 text-gray-700 border-none font-bold text-[11px]">
                        {v3Calculation.productsCount} Produk • {v3Calculation.totalVariantsCount} Varian
                      </Badge>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Nama Grup</span>
                        <span className="font-bold text-gray-900 truncate max-w-[180px]">{v3Calculation.groupName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Jumlah Produk</span>
                        <span className="font-bold text-gray-900">{v3Calculation.productsCount} produk</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Total Unit ({v3Calculation.totalOrdersGroup} order)</span>
                        <span className="font-bold text-gray-900">{v3Calculation.totalUnitsGroup} pack</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-gray-100">
                        <span className="text-gray-500 font-medium">Omzet Grup</span>
                        <span className="font-black text-gray-900">{formatCurrency(v3Calculation.totalGrossRevenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">HPP Grup</span>
                        <span className="font-bold text-rose-600">-{formatCurrency(v3Calculation.totalHpp)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Fee Marketplace</span>
                        <span className="font-bold text-amber-600">-{formatCurrency(v3Calculation.totalMarketplaceFee)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Biaya Proses</span>
                        <span className="font-bold text-amber-600">-{formatCurrency(v3Calculation.totalProcessFee)}</span>
                      </div>

                      <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-gray-900">Profit Sebelum Iklan</p>
                          <p className="text-[11px] text-gray-400">Margin Grup: {v3Calculation.marginGrupPct.toFixed(1)}%</p>
                        </div>
                        <p className="text-sm font-black text-emerald-600">
                          {formatCurrency(v3Calculation.profitBeforeAds)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Tabel Rincian Per Produk dalam Grup */}
                <Card className="rounded-3xl border-none shadow-sm bg-white">
                  <CardContent className="p-4 space-y-2">
                    <p className="text-[11px] font-black uppercase text-gray-400 tracking-wider">
                      Rincian Ekonomi Per Produk
                    </p>
                    <div className="space-y-2">
                      {v3Calculation.productBreakdown.map((pb) => (
                        <div key={pb.product.id} className="p-2.5 rounded-xl bg-gray-50 text-xs flex justify-between items-center">
                          <div className="space-y-0.5">
                            <p className="font-bold text-gray-900">{pb.product.nama}</p>
                            <p className="text-[10px] text-gray-500">
                              Bobot: {pb.weightPct}% • Omzet: {formatCurrency(pb.grossRevenue)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-violet-700">BEP: {pb.roasBep.toFixed(2)}x</p>
                            <p className="text-[10px] text-gray-500">Margin: {pb.marginBeforeAdsPct.toFixed(1)}%</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Kolom Kanan: 4 Kartu ROAS Grup, Paling Berisiko & Simulator */}
              <div className="lg:col-span-7 space-y-4">
                <Card className="rounded-3xl border-none shadow-md bg-gradient-to-br from-violet-50/80 via-purple-50/40 to-fuchsia-50/60">
                  <CardContent className="p-5 md:p-6 space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-violet-100">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-200/60 px-2 py-0.5 rounded-md">
                          Hasil ROAS Grup
                        </span>
                        <h3 className="text-sm md:text-base font-black text-gray-900">
                          {v3Calculation.groupName}
                        </h3>
                      </div>
                    </div>

                    {!v3Calculation.isTargetFeasible ? (
                      <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-black text-rose-700">Target profit tidak dapat dicapai</p>
                          <p className="text-xs text-rose-600 leading-relaxed">
                            "Target profit tidak dapat dicapai dengan struktur biaya saat ini." (Margin grup {v3Calculation.marginGrupPct.toFixed(1)}% &lt; Target profit {targetProfitPct}%).
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <MetricCard
                          label="ROAS BEP Grup"
                          value={v3Calculation.roasBepGroup}
                          sub="Titik Impas Gabungan Seluruh Produk"
                          variant="bep"
                          tooltip="Ini adalah titik impas berdasarkan struktur biaya. Di bawah angka ini, biaya iklan berpotensi membuat transaksi menjadi rugi."
                        />

                        <MetricCard
                          label="ROAS BEP Terburuk"
                          value={v3Calculation.roasBepWorst}
                          sub={`Produk Berisiko: ${v3Calculation.worstBepProduct?.product.nama || '-'}`}
                          variant="worst"
                          tooltip="ROAS BEP Terburuk menunjukkan produk dalam grup yang membutuhkan ROAS paling tinggi untuk mencapai titik impas."
                        />

                        <MetricCard
                          label="ROAS Target Grup"
                          value={v3Calculation.roasTargetGroup}
                          sub={`Target Net: ${targetProfitPct}%`}
                          variant="target"
                          badgeText="Utama"
                          tooltip="Ini adalah ROAS yang dibutuhkan agar setelah seluruh biaya dan iklan, profit bersih sesuai target Anda."
                        />

                        <MetricCard
                          label="ROAS Setting Awal"
                          value={v3Calculation.roasSettingAwalGroup}
                          sub={`Buffer +${bufferPct}%`}
                          variant="setting"
                          tooltip="Ini adalah angka rekomendasi untuk setting awal iklan setelah ditambahkan buffer keamanan."
                        />
                      </div>
                    )}

                    {/* Simulator Interaktif Mode Grup */}
                    {v3Calculation.isTargetFeasible && (
                      <div className="mt-4 p-4 rounded-2xl bg-white border border-violet-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Activity className="w-4 h-4 text-violet-600" />
                            <span className="text-xs font-bold text-gray-800">Simulator ROAS Iklan Grup</span>
                          </div>
                          <span className="text-xs font-black text-violet-600">Simulasi ROAS: {v3SimRoas.toFixed(2)}x</span>
                        </div>

                        <input
                          type="range"
                          min={1}
                          max={20}
                          step={0.1}
                          value={v3SimRoas}
                          onChange={(e) => setV3SimRoas(Number(e.target.value))}
                          className="w-full h-2 rounded-lg bg-violet-100 appearance-none cursor-pointer accent-violet-600"
                        />

                        {(() => {
                          const baseAdSpend = v3SimRoas > 0 ? v3Calculation.totalGrossRevenue / v3SimRoas : 0;
                          const actualAdSpend = includePpn ? baseAdSpend * (1 + ppnRate / 100) : baseAdSpend;
                          const netProfit = v3Calculation.profitBeforeAds - actualAdSpend;
                          const netMargin = v3Calculation.totalGrossRevenue > 0 ? (netProfit / v3Calculation.totalGrossRevenue) * 100 : 0;

                          return (
                            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-center text-xs">
                              <div className="p-2 rounded-xl bg-gray-50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Biaya Iklan {includePpn ? '(+PPN)' : ''}</p>
                                <p className="font-bold text-gray-900 mt-0.5">{formatCurrency(actualAdSpend)}</p>
                              </div>
                              <div className="p-2 rounded-xl bg-gray-50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Profit Bersih</p>
                                <p className={`font-black mt-0.5 ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {formatCurrency(netProfit)}
                                </p>
                              </div>
                              <div className="p-2 rounded-xl bg-gray-50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Margin Bersih</p>
                                <p className={`font-black mt-0.5 ${netMargin >= targetProfitPct ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  {netMargin.toFixed(1)}%
                                </p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
        </div>
      )}

      {/* ====================================================================
          MODE CALCULATION: CARI HARGA (REVERSE CALCULATION)
          ==================================================================== */}
      {calcMode === 'find_price' && (
        <div className="space-y-6">
          {/* Header & Main Control Input Card for CARI HARGA */}
          <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="p-5 md:p-6 bg-gradient-to-r from-emerald-900 via-teal-900 to-emerald-950 text-white">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 rounded-full text-[11px] font-black tracking-wider uppercase">
                      REVERSE CALCULATION
                    </span>
                    <span className="text-xs text-emerald-300 font-bold">
                      {adMode === 'variant' ? 'Iklan Varian' : adMode === 'product' ? 'Iklan Produk' : 'Iklan Grup'}
                    </span>
                  </div>
                  <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                    CARI HARGA JUAL DARI TARGET ROAS
                  </h2>
                  <p className="text-xs text-emerald-200/90 leading-relaxed">
                    Masukkan Target ROAS dan biaya. Sistem akan menghitung harga jual minimal dan harga rekomendasi secara presisi.
                  </p>
                </div>

                {/* Preset Target ROAS Shortcuts */}
                <div className="flex flex-wrap items-center gap-1.5 bg-black/30 p-2 rounded-2xl border border-white/10 shrink-0">
                  <span className="text-[10px] uppercase font-bold text-emerald-300 tracking-wider mr-1">Preset:</span>
                  {[3, 4, 5, 6.5, 7, 8, 10].map((roasVal) => (
                    <button
                      key={roasVal}
                      type="button"
                      onClick={() => setTargetRoasInput(roasVal)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                        targetRoasInput === roasVal
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-white/10 text-emerald-100 hover:bg-white/20'
                      }`}
                    >
                      {roasVal}x
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-5 md:p-6 space-y-6">
              {/* Form Input Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Target ROAS */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                    <span>TARGET ROAS SELLER CENTER</span>
                    <span className="text-[10px] font-normal text-gray-400">(Wajib)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={targetRoasInput}
                      onChange={(e) => setTargetRoasInput(Math.max(0.01, Number(e.target.value) || 1))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 font-black text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                      x
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500">Target ROAS platform iklan yang diinginkan.</p>
                </div>

                {/* 2. Voucher / Diskon */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                    <span>VOUCHER / DISKON</span>
                    <span className="text-[10px] font-normal text-gray-400">(Opsional)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="90"
                      value={voucherPctInput}
                      onChange={(e) => setVoucherPctInput(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 font-bold text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                      %
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500">Diskon toko / voucher yang ditanggung penjual.</p>
                </div>

                {/* 3. Pembulatan Harga */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700">PEMBULATAN HARGA REKOMENDASI</label>
                  <select
                    value={roundingOption}
                    onChange={(e) => setRoundingOption(Number(e.target.value) as 0 | 100 | 500 | 1000)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 font-bold text-xs text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                  >
                    <option value={0}>Tidak Dibulatkan (Eksak)</option>
                    <option value={100}>Ke Pembulatan Rp100 (Default)</option>
                    <option value={500}>Ke Pembulatan Rp500</option>
                    <option value={1000}>Ke Pembulatan Rp1.000</option>
                  </select>
                  <p className="text-[11px] text-gray-500">Pembulatan ke atas untuk psikologi harga.</p>
                </div>

                {/* 4. Target Profit (Opsional) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={useTargetProfitInFindPrice}
                        onChange={(e) => setUseTargetProfitInFindPrice(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>TARGET PROFIT BERSIH</span>
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      disabled={!useTargetProfitInFindPrice}
                      value={findPriceTargetProfitPct}
                      onChange={(e) => setFindPriceTargetProfitPct(Math.max(0, Number(e.target.value) || 0))}
                      className={`w-full px-3.5 py-2.5 rounded-xl border border-gray-300 font-bold text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                        !useTargetProfitInFindPrice ? 'bg-gray-100 opacity-60' : ''
                      }`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                      %
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    {useTargetProfitInFindPrice
                      ? 'Harga harus memenuhi Target ROAS & Profit sekaligus.'
                      : 'Opsional: Centang jika ingin mengunci margin profit.'}
                  </p>
                </div>
              </div>

              {/* Status PPN Iklan Banner */}
              <div className="p-3 bg-emerald-50/70 rounded-2xl border border-emerald-100 flex items-center justify-between gap-3 text-xs text-emerald-900">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    PPN Iklan ({ppnRate}%): <strong>{includePpn ? 'Aktif (Biaya Iklan × 1.11)' : 'Non-Aktif'}</strong>.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIncludePpn(!includePpn)}
                  className="px-3 py-1 bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100 rounded-lg font-black text-xs transition-colors shrink-0"
                >
                  {includePpn ? 'Matikan PPN' : 'Aktifkan PPN'}
                </button>
              </div>
            </CardContent>
          </Card>

          {/* ====================================================================
              MODE 1: IKLAN VARIAN (CARI HARGA)
              ==================================================================== */}
          {adMode === 'variant' && (
            <div className="space-y-6">
              {/* Selector Produk & Varian */}
              <Card className="rounded-3xl border-none shadow-sm bg-white">
                <CardContent className="p-5 md:p-6 space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-emerald-600" />
                    Pilih Produk & Varian Yang Dianalisis
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-700 mb-1 block">Produk</label>
                      <select
                        value={v1SelectedProductId}
                        onChange={(e) => {
                          setV1SelectedProductId(e.target.value);
                          const p = products.find((pr) => pr.id === e.target.value);
                          if (p && p.varian && p.varian.length > 0) {
                            setV1SelectedVariantId(p.varian[0].id);
                          }
                          setSimulatedPriceOverride(null);
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 font-bold text-xs text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nama} ({p.varian?.length || 0} Varian)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-700 mb-1 block">Varian Spesifik</label>
                      <select
                        value={v1SelectedVariantId}
                        onChange={(e) => {
                          setV1SelectedVariantId(e.target.value);
                          setSimulatedPriceOverride(null);
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 font-bold text-xs text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500"
                      >
                        {(v1ActiveProduct?.varian || []).map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.nama} (HPP: {formatCurrency(calcHppPerPcs(v, ingredients))})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Reverse Calculation Result Card for Variant */}
              {v1ReverseCalc && (
                <div className="space-y-6">
                  {!v1ReverseCalc.isFeasible ? (
                    <Card className="rounded-3xl border border-red-200 bg-red-50/80">
                      <CardContent className="p-6 text-center space-y-2">
                        <AlertTriangle className="w-8 h-8 text-red-600 mx-auto" />
                        <h4 className="text-sm font-black text-red-900">Perhitungan Tidak Memungkinkan</h4>
                        <p className="text-xs text-red-700 max-w-lg mx-auto leading-relaxed">
                          {v1ReverseCalc.errorMessage}
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-6">
                      {/* Cards Displaying Suggested Selling Price */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Primary Recommendation Card */}
                        <Card className="lg:col-span-2 rounded-3xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-50 via-teal-50 to-white shadow-md overflow-hidden">
                          <CardContent className="p-6 space-y-5">
                            <div className="flex items-center justify-between border-b border-emerald-200/60 pb-3">
                              <div>
                                <span className="text-[10px] uppercase font-black tracking-widest text-emerald-700">
                                  REKOMENDASI HARGA JUAL VARIAN
                                </span>
                                <h3 className="text-base font-black text-gray-900">
                                  {v1ActiveProduct?.nama} - {v1ActiveVariant?.nama}
                                </h3>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] font-bold text-gray-500 block">Target ROAS</span>
                                <span className="text-base font-black text-emerald-700">
                                  {targetRoasInput.toFixed(2)}x
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-baseline justify-between gap-4 bg-white p-5 rounded-2xl border border-emerald-200/80 shadow-xs">
                              <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                  HARGA JUAL YANG DISARANKAN
                                </p>
                                <p className="text-3xl sm:text-4xl font-black text-emerald-600 tracking-tight">
                                  {formatCurrency(v1ReverseCalc.priceRecommended)}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  Harga Matematis Aksak: <strong>{formatCurrency(v1ReverseCalc.priceExact)}</strong>
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setCalcMode('find_roas');
                                }}
                                className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black text-xs transition-all shadow-md shadow-violet-200 flex items-center gap-1.5 self-stretch sm:self-auto justify-center"
                              >
                                <CheckCircle className="w-4 h-4" />
                                <span>Uji ke Mode CARI ROAS</span>
                              </button>
                            </div>

                            {/* Alert Warnings */}
                            {targetRoasInput > 8 && (
                              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                <span>Target ROAS sangat tinggi ({targetRoasInput}x). Harga yang diperlukan mungkin menjadi kurang kompetitif.</span>
                              </div>
                            )}

                            {v1ActiveVariant && v1ActiveVariant.harga_jual > 0 && v1ReverseCalc.priceRecommended > v1ActiveVariant.harga_jual && (
                              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2">
                                <Info className="w-4 h-4 text-blue-600 shrink-0" />
                                <span>
                                  Harga yang diperlukan ({formatCurrency(v1ReverseCalc.priceRecommended)}) lebih tinggi dari harga jual saat ini ({formatCurrency(v1ActiveVariant.harga_jual)}) untuk mencapai target ROAS {targetRoasInput}x.
                                </span>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* Parameter Breakdown Card */}
                        <Card className="rounded-3xl border-none shadow-sm bg-white">
                          <CardHeader className="p-5 pb-3 border-b border-gray-100">
                            <h4 className="text-xs font-black uppercase tracking-wider text-gray-700">
                              Struktur Biaya Varian
                            </h4>
                          </CardHeader>
                          <CardContent className="p-5 space-y-3 text-xs">
                            <div className="flex justify-between py-1 border-b border-gray-50">
                              <span className="text-gray-500">HPP Bahan & Packing</span>
                              <span className="font-bold text-gray-900">
                                {formatCurrency(calcHppPerPcs(v1ActiveVariant!, ingredients))}
                              </span>
                            </div>

                            <div className="flex justify-between py-1 border-b border-gray-50">
                              <span className="text-gray-500">Minimal Order</span>
                              <span className="font-bold text-gray-900">
                                {v1ActiveVariant?.min_order || 1} pack/order
                              </span>
                            </div>

                            <div className="flex justify-between py-1 border-b border-gray-50">
                              <span className="text-gray-500">Biaya Proses</span>
                              <span className="font-bold text-gray-900">
                                {formatCurrency(extractFeeRates(v1ActiveProduct!, v1ActiveVariant!).nominalPerOrder)}/order
                              </span>
                            </div>

                            <div className="flex justify-between py-1 border-b border-gray-50">
                              <span className="text-gray-500">HPP Real per Unit</span>
                              <span className="font-bold text-gray-900">
                                {formatCurrency(v1ReverseCalc.realHppPerUnit)}
                              </span>
                            </div>

                            <div className="flex justify-between py-1 border-b border-gray-50">
                              <span className="text-gray-500">Fee Marketplace</span>
                              <span className="font-bold text-gray-900">
                                {extractFeeRates(v1ActiveProduct!, v1ActiveVariant!).percentRate}%
                              </span>
                            </div>

                            <div className="flex justify-between py-1 border-b border-gray-50">
                              <span className="text-gray-500">Voucher Penjual</span>
                              <span className="font-bold text-gray-900">{voucherPctInput}%</span>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Interactive Price Simulation Slider / Control */}
                      <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
                        <CardHeader className="p-5 pb-3 border-b border-gray-100 bg-gray-50/70">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase tracking-wider text-gray-800 flex items-center gap-2">
                              <TrendingUp className="w-4 h-4 text-emerald-600" />
                              Simulasi Harga Real-Time (Harga ↔ ROAS ↔ Profit)
                            </h3>
                            {simulatedPriceOverride !== null && (
                              <button
                                type="button"
                                onClick={() => setSimulatedPriceOverride(null)}
                                className="text-xs font-bold text-emerald-600 hover:underline"
                              >
                                Reset ke Harga Rekomendasi
                              </button>
                            )}
                          </div>
                        </CardHeader>

                        <CardContent className="p-5 md:p-6 space-y-6">
                          {(() => {
                            const activePrice = simulatedPriceOverride ?? v1ReverseCalc.priceRecommended;
                            const feeConfig = extractFeeRates(v1ActiveProduct!, v1ActiveVariant!);
                            const B = voucherPctInput / 100;
                            const C = feeConfig.percentRate / 100;

                            const omzetReal = activePrice * (1 - B) * (1 - C);
                            const hppReal = v1ReverseCalc.realHppPerUnit;
                            const profitBeforeAd = omzetReal - hppReal;

                            const adSpendEst = (omzetReal / targetRoasInput) * (includePpn ? 1.11 : 1.0);
                            const netProfit = omzetReal - hppReal - adSpendEst;
                            const netMargin = activePrice > 0 ? (netProfit / activePrice) * 100 : 0;
                            const actualRoas = adSpendEst > 0 ? (omzetReal / (adSpendEst / (includePpn ? 1.11 : 1.0))) : 0;

                            return (
                              <div className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                                  <div className="md:col-span-1 space-y-1">
                                    <label className="text-xs font-bold text-gray-700">HARGA SIMULASI</label>
                                    <div className="relative">
                                      <input
                                        type="number"
                                        step="100"
                                        value={activePrice}
                                        onChange={(e) => setSimulatedPriceOverride(Math.max(0, Number(e.target.value) || 0))}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-emerald-300 font-black text-lg text-emerald-700 focus:ring-2 focus:ring-emerald-500 bg-white"
                                      />
                                    </div>
                                    <div className="flex items-center gap-1.5 pt-1">
                                      <button
                                        type="button"
                                        onClick={() => setSimulatedPriceOverride(Math.max(0, activePrice - 1000))}
                                        className="px-2 py-1 bg-white border border-gray-200 text-gray-700 text-[11px] font-bold rounded-md hover:bg-gray-100"
                                      >
                                        - Rp1.000
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setSimulatedPriceOverride(activePrice + 1000)}
                                        className="px-2 py-1 bg-white border border-gray-200 text-gray-700 text-[11px] font-bold rounded-md hover:bg-gray-100"
                                      >
                                        + Rp1.000
                                      </button>
                                    </div>
                                  </div>

                                  <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                                    <div className="p-3 bg-white rounded-xl border border-emerald-200/80 shadow-2xs">
                                      <p className="text-[10px] font-bold text-gray-500 uppercase">ROAS HASIL</p>
                                      <p className="text-lg font-black text-emerald-700">{actualRoas.toFixed(2)}x</p>
                                    </div>

                                    <div className="p-3 bg-white rounded-xl border border-emerald-200/80 shadow-2xs">
                                      <p className="text-[10px] font-bold text-gray-500 uppercase">OMZET REAL</p>
                                      <p className="text-sm font-black text-gray-900">{formatCurrency(omzetReal)}</p>
                                    </div>

                                    <div className="p-3 bg-white rounded-xl border border-emerald-200/80 shadow-2xs">
                                      <p className="text-[10px] font-bold text-gray-500 uppercase">PROFIT BERSIH</p>
                                      <p className={`text-sm font-black ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {formatCurrency(netProfit)}
                                      </p>
                                    </div>

                                    <div className="p-3 bg-white rounded-xl border border-emerald-200/80 shadow-2xs">
                                      <p className="text-[10px] font-bold text-gray-500 uppercase">MARGIN BERSIH</p>
                                      <p className={`text-sm font-black ${netMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {netMargin.toFixed(1)}%
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ====================================================================
              MODE 2: IKLAN PRODUK (CARI HARGA)
              ==================================================================== */}
          {adMode === 'product' && (
            <div className="space-y-6">
              <Card className="rounded-3xl border-none shadow-sm bg-white">
                <CardContent className="p-5 md:p-6 space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-600" />
                    Pilih Produk & Varian Yang Dianalisis (Weighted Average)
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-700 mb-1 block">Produk</label>
                      <select
                        value={v2SelectedProductId}
                        onChange={(e) => {
                          setV2SelectedProductId(e.target.value);
                          const p = products.find((pr) => pr.id === e.target.value);
                          if (p && p.varian) {
                            setV2SelectedVariantIds(p.varian.map((v) => v.id));
                          }
                          setSimulatedPriceOverride(null);
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 font-bold text-xs text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nama} ({p.varian?.length || 0} Varian)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-700 mb-1 block">Varian Aktif</label>
                      <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 rounded-xl border border-gray-200 max-h-32 overflow-y-auto">
                        {(v2ActiveProduct?.varian || []).map((v) => {
                          const isSelected = v2SelectedVariantIds.includes(v.id);
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  if (v2SelectedVariantIds.length > 1) {
                                    setV2SelectedVariantIds(v2SelectedVariantIds.filter((id) => id !== v.id));
                                  }
                                } else {
                                  setV2SelectedVariantIds([...v2SelectedVariantIds, v.id]);
                                }
                                setSimulatedPriceOverride(null);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                isSelected
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                              }`}
                            >
                              {v.nama}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {v2ReverseCalc && (
                <div className="space-y-6">
                  {/* Primary Recommendation Card */}
                  <Card className="rounded-3xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-50 via-teal-50 to-white shadow-md overflow-hidden">
                    <CardContent className="p-6 space-y-5">
                      <div className="flex items-center justify-between border-b border-emerald-200/60 pb-3">
                        <div>
                          <span className="text-[10px] uppercase font-black tracking-widest text-emerald-700">
                            HARGA REKOMENDASI RATA-RATA PRODUK
                          </span>
                          <h3 className="text-base font-black text-gray-900">{v2ActiveProduct?.nama}</h3>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold text-gray-500 block">Target ROAS</span>
                          <span className="text-base font-black text-emerald-700">{targetRoasInput.toFixed(2)}x</span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-baseline justify-between gap-4 bg-white p-5 rounded-2xl border border-emerald-200/80 shadow-xs">
                        <div>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                            HARGA JUAL PRODUK REKOMENDASI (AVERAGE)
                          </p>
                          <p className="text-3xl sm:text-4xl font-black text-emerald-600 tracking-tight">
                            {formatCurrency(v2ReverseCalc.weightedRev.priceRecommended)}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            HPP Rata-Rata Tertimbang: <strong>{formatCurrency(v2ReverseCalc.weightedHpp)}</strong>
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setCalcMode('find_roas');
                          }}
                          className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black text-xs transition-all shadow-md shadow-violet-200 flex items-center gap-1.5 self-stretch sm:self-auto justify-center"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>Uji ke Mode CARI ROAS</span>
                        </button>
                      </div>

                      {/* Detail per Varian */}
                      <div className="space-y-3 pt-2">
                        <h4 className="text-xs font-black uppercase tracking-wider text-gray-700">
                          Rincian Harga Yang Diperlukan Per Varian Spesifik:
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {v2ReverseCalc.variantReverseDetails.map((vDetail) => (
                            <div
                              key={vDetail.variant.id}
                              className="p-3.5 bg-white rounded-2xl border border-emerald-200/70 shadow-2xs space-y-1.5"
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-black text-xs text-gray-900">{vDetail.variant.nama}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                                  {vDetail.weightPct}% Sales
                                </span>
                              </div>
                              <p className="text-xs font-bold text-gray-500">
                                HPP: {formatCurrency(vDetail.hppPcs)} | Min: {vDetail.minOrder} pack
                              </p>
                              <div className="pt-1 flex justify-between items-baseline border-t border-gray-100">
                                <span className="text-[10px] font-bold text-gray-400">Harga Dianjurkan:</span>
                                <span className="font-black text-sm text-emerald-600">
                                  {formatCurrency(vDetail.rev.priceRecommended)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* ====================================================================
              MODE 3: IKLAN GRUP (CARI HARGA)
              ==================================================================== */}
          {adMode === 'group' && (
            <div className="space-y-6">
              <Card className="rounded-3xl border-none shadow-sm bg-white">
                <CardContent className="p-5 md:p-6 space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-600" />
                    Pilih Produk Untuk Grup Iklan
                  </h3>

                  <div className="flex flex-wrap gap-2">
                    {products.map((p) => {
                      const isSelected = v3SelectedProductIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              if (v3SelectedProductIds.length > 1) {
                                setV3SelectedProductIds(v3SelectedProductIds.filter((id) => id !== p.id));
                              }
                            } else {
                              setV3SelectedProductIds([...v3SelectedProductIds, p.id]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                          }`}
                        >
                          <Package className="w-3.5 h-3.5" />
                          <span>{p.nama}</span>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {v3ReverseCalc && (
                <div className="space-y-6">
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-900">
                    <p className="font-bold">
                      Pada Iklan Grup dengan banyak produk & struktur biaya berbeda, sistem menghitung HARGA JUAL YANG DIPERLUKAN UNTUK MASING-MASING PRODUK secara terpisah agar seluruh grup mencapai Target ROAS {targetRoasInput}x.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {v3ReverseCalc.productReverseDetails.map((pDetail) => (
                      <Card key={pDetail.product.id} className="rounded-3xl border border-emerald-200 bg-white shadow-xs overflow-hidden">
                        <CardHeader className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
                          <div className="flex justify-between items-center">
                            <h4 className="font-black text-sm text-gray-900">{pDetail.product.nama}</h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                              {pDetail.weightPct}% Bobot
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3">
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase">HARGA JUAL YANG DISARANKAN</p>
                            <p className="text-2xl font-black text-emerald-600">
                              {formatCurrency(pDetail.rev.priceRecommended)}
                            </p>
                            <p className="text-[11px] text-gray-500">
                              Matematis: {formatCurrency(pDetail.rev.priceExact)}
                            </p>
                          </div>

                          <div className="space-y-1 text-xs pt-2 border-t border-gray-100">
                            <div className="flex justify-between text-gray-600">
                              <span>HPP Rata-Rata</span>
                              <span className="font-bold">{formatCurrency(pDetail.weightedHpp)}</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                              <span>Fee Marketplace</span>
                              <span className="font-bold">{pDetail.feeConfig.percentRate}%</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                              <span>Biaya Proses</span>
                              <span className="font-bold">{formatCurrency(pDetail.feeConfig.nominalPerOrder)}/order</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setCalcMode('find_roas')}
                      className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black text-xs transition-all shadow-md shadow-violet-200 flex items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Uji Seluruh Harga ini ke Mode CARI ROAS</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
        <CardContent className="p-5 md:p-6 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <h3 className="text-xs font-black uppercase tracking-wider text-gray-700">
              Panduan Membaca & Menjalankan Target ROAS
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100 space-y-1">
              <p className="text-xs font-black text-blue-900">1. ROAS BEP</p>
              <p className="text-[11px] text-blue-700 leading-relaxed">
                Titik impas struktur biaya. Di bawah angka ini, biaya iklan membuat transaksi rugi.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-100 space-y-1">
              <p className="text-xs font-black text-amber-900">2. ROAS BEP Terburuk</p>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                ROAS BEP tertinggi dari varian/produk yang dianalisis sebagai batas toleransi risiko terberat.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-violet-50/60 border border-violet-100 space-y-1">
              <p className="text-xs font-black text-violet-900">3. ROAS Target</p>
              <p className="text-[11px] text-violet-700 leading-relaxed">
                ROAS yang dibutuhkan agar setelah seluruh biaya dan iklan, profit bersih sesuai target Anda ({targetProfitPct}%).
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100 space-y-1">
              <p className="text-xs font-black text-purple-900">4. ROAS Setting Awal</p>
              <p className="text-[11px] text-purple-700 leading-relaxed">
                Angka rekomendasi untuk diinput ke platform iklan setelah ditambahkan buffer keamanan ({bufferPct}%).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
