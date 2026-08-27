import React from 'react';
import { Product, Variant, Ingredient, HppMaterial, Transaction, AdditionalFee } from '../types';
import { formatCurrency } from '../lib/formatUtils';
import { getBaseUnit, getConversionRate, toBaseValue } from '../lib/unitUtils';
import { Card, CardContent } from '@/components/ui/card';
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
} from 'lucide-react';

interface Props {
  products: Product[];
  ingredients: Ingredient[];
  transactions?: Transaction[];
  user: { uid: string };
}

// Key localStorage untuk preferensi
const STORAGE_KEY = 'ceumilan_roas_engine_v3';

/* ==========================================================================
   HELPER FUNCTIONS: HPP & BIAYA UNIT
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
        // Default fee nominal marketplace adalah per transaksi / per order
        nominalPerOrder += val;
      }
    }
  }

  // Jika produk belum dikonfigurasi biaya proses eksplisit, default standar marketplace adalah Rp1.600/order
  if (nominalPerOrder === 0) {
    nominalPerOrder = 1600;
  }

  return { percentRate, nominalPerOrder, nominalPerUnit };
}

/* ==========================================================================
   HELPER FUNCTIONS: HISTORICAL DATA & COMPOSITION
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
   MAIN ROAS CALCULATOR COMPONENT
   ========================================================================== */
export default function ROASCalculator({ products, ingredients, transactions, user }: Props) {
  // Mode Iklan: 'product' (Mode A) atau 'group' (Mode B)
  const [adMode, setAdMode] = React.useState<'product' | 'group'>('product');

  // MODE A: IKLAN PRODUK State
  const [selectedProductId, setSelectedProductId] = React.useState<string>(() => products[0]?.id || '');
  const [variantWeights, setVariantWeights] = React.useState<Record<string, number>>({});
  const [orderSimProduct, setOrderSimProduct] = React.useState<number>(10);
  const [productTargetProfitPct, setProductTargetProfitPct] = React.useState<number>(15);
  const [productBufferPct, setProductBufferPct] = React.useState<number>(10);
  const [productSimRoas, setProductSimRoas] = React.useState<number>(0);

  // MODE B: IKLAN GRUP State
  const [groupName, setGroupName] = React.useState<string>('Grup Iklan CeuMilan');
  const [selectedGroupProductIds, setSelectedGroupProductIds] = React.useState<string[]>(() =>
    products.slice(0, Math.min(3, products.length)).map((p) => p.id)
  );
  const [groupProductWeights, setGroupProductWeights] = React.useState<Record<string, number>>({});
  const [orderSimGroup, setOrderSimGroup] = React.useState<number>(20);
  const [groupTargetProfitPct, setGroupTargetProfitPct] = React.useState<number>(15);
  const [groupBufferPct, setGroupBufferPct] = React.useState<number>(10);
  const [groupSimRoas, setGroupSimRoas] = React.useState<number>(0);

  // Load Preferensi Tersimpan
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_${user.uid}`);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.adMode) setAdMode(data.adMode);
        if (data.productTargetProfitPct !== undefined) setProductTargetProfitPct(data.productTargetProfitPct);
        if (data.productBufferPct !== undefined) setProductBufferPct(data.productBufferPct);
        if (data.groupTargetProfitPct !== undefined) setGroupTargetProfitPct(data.groupTargetProfitPct);
        if (data.groupBufferPct !== undefined) setGroupBufferPct(data.groupBufferPct);
        if (data.orderSimProduct !== undefined) setOrderSimProduct(data.orderSimProduct);
        if (data.orderSimGroup !== undefined) setOrderSimGroup(data.orderSimGroup);
        if (data.groupName) setGroupName(data.groupName);
      }
    } catch {}
  }, [user.uid]);

  // Simpan Preferensi
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

  // Sinkronisasi produk terpilih jika berubah
  React.useEffect(() => {
    if (products.length > 0 && !products.some((p) => p.id === selectedProductId)) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  // Sinkronisasi produk grup jika kosong
  React.useEffect(() => {
    if (products.length > 0 && selectedGroupProductIds.length === 0) {
      setSelectedGroupProductIds(products.slice(0, Math.min(3, products.length)).map((p) => p.id));
    }
  }, [products, selectedGroupProductIds.length]);

  // Produk aktif untuk Mode A
  const activeProduct = React.useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || products[0];
  }, [products, selectedProductId]);

  // Inisialisasi Bobot Varian Mode A
  const { weights: histVariantWeights, totalUnitsSold: totalVariantUnitsSold } = React.useMemo(() => {
    if (!activeProduct) return { weights: {}, totalUnitsSold: 0 };
    return getHistoricalVariantSales(activeProduct.id, transactions);
  }, [activeProduct, transactions]);

  React.useEffect(() => {
    if (!activeProduct || !activeProduct.varian || activeProduct.varian.length === 0) {
      setVariantWeights({});
      return;
    }
    const variants = activeProduct.varian;
    const newWeights: Record<string, number> = {};

    const hasHist = Object.keys(histVariantWeights).length > 0;
    if (hasHist) {
      variants.forEach((v) => {
        newWeights[v.id] = Math.round(histVariantWeights[v.id] || 0);
      });
      const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
      if (sum !== 100 && sum > 0) {
        const factor = 100 / sum;
        variants.forEach((v) => {
          newWeights[v.id] = Math.round((newWeights[v.id] || 0) * factor);
        });
      }
    } else {
      const equalShare = Math.floor(100 / variants.length);
      const remainder = 100 - equalShare * variants.length;
      variants.forEach((v, idx) => {
        newWeights[v.id] = equalShare + (idx === 0 ? remainder : 0);
      });
    }
    setVariantWeights(newWeights);
  }, [activeProduct, histVariantWeights]);

  // Inisialisasi Bobot Produk Mode B
  const { weights: histProductWeights, totalUnitsSold: totalProductUnitsSold } = React.useMemo(() => {
    return getHistoricalProductSales(selectedGroupProductIds, transactions);
  }, [selectedGroupProductIds, transactions]);

  React.useEffect(() => {
    if (selectedGroupProductIds.length === 0) {
      setGroupProductWeights({});
      return;
    }
    const newWeights: Record<string, number> = {};
    const hasHist = Object.keys(histProductWeights).length > 0;

    if (hasHist) {
      selectedGroupProductIds.forEach((pId) => {
        newWeights[pId] = Math.round(histProductWeights[pId] || 0);
      });
      const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
      if (sum !== 100 && sum > 0) {
        const factor = 100 / sum;
        selectedGroupProductIds.forEach((pId) => {
          newWeights[pId] = Math.round((newWeights[pId] || 0) * factor);
        });
      }
    } else {
      const equalShare = Math.floor(100 / selectedGroupProductIds.length);
      const remainder = 100 - equalShare * selectedGroupProductIds.length;
      selectedGroupProductIds.forEach((pId, idx) => {
        newWeights[pId] = equalShare + (idx === 0 ? remainder : 0);
      });
    }
    setGroupProductWeights(newWeights);
  }, [selectedGroupProductIds, histProductWeights]);

  /* ========================================================================
     MATHEMATICAL CORE ENGINE: MODE A (IKLAN PRODUK)
     ======================================================================== */
  const productCalculation = React.useMemo(() => {
    if (!activeProduct || !activeProduct.varian || activeProduct.varian.length === 0) {
      return null;
    }

    const variants = activeProduct.varian;
    const totalWeights = variants.reduce((sum, v) => sum + (variantWeights[v.id] || 0), 0) || 100;

    // Normalisasi bobot desimal (0 - 1)
    const normalizedWeights: Record<string, number> = {};
    variants.forEach((v) => {
      normalizedWeights[v.id] = (variantWeights[v.id] || 0) / totalWeights;
    });

    // 1. Rata-rata Tertimbang Harga Jual, HPP, dan Minimal Order
    let weightedPrice = 0;
    let weightedHpp = 0;
    let weightedMinOrder = 0;

    const variantDetails = variants.map((v) => {
      const hppPcs = calcHppPerPcs(v, ingredients);
      const pricePcs = Number(v.harga_jual) || 0;
      const minOrderPcs = Math.max(1, Number(v.min_order) || 1);
      const weight = normalizedWeights[v.id] || 0;

      weightedPrice += pricePcs * weight;
      weightedHpp += hppPcs * weight;
      weightedMinOrder += minOrderPcs * weight;

      return {
        variant: v,
        pricePcs,
        hppPcs,
        minOrderPcs,
        weightPct: Math.round(weight * 100),
      };
    });

    // Minimal order produk (read-only dari data produk)
    const effectiveMinOrder = Math.max(1, Math.round(weightedMinOrder));

    // 2. Simulasi Order & Total Unit
    const numOrders = Math.max(1, orderSimProduct);
    const totalUnits = numOrders * effectiveMinOrder;

    // 3. Omzet & HPP Total
    const grossRevenue = totalUnits * weightedPrice;
    const totalHpp = totalUnits * weightedHpp;

    // 4. Biaya Marketplace & Biaya Proses per Order
    const feeConfig = extractFeeRates(activeProduct);
    const marketplaceFeeRp = grossRevenue * (feeConfig.percentRate / 100);
    const processFeeRp = numOrders * feeConfig.nominalPerOrder; // Jumlah Order × Biaya Proses/Order
    const otherFeesRp = totalUnits * feeConfig.nominalPerUnit;

    const totalCostBeforeAds = totalHpp + marketplaceFeeRp + processFeeRp + otherFeesRp;
    const profitBeforeAds = grossRevenue - totalCostBeforeAds;
    const marginBeforeAds = grossRevenue > 0 ? profitBeforeAds / grossRevenue : 0;
    const marginBeforeAdsPct = marginBeforeAds * 100;

    // 5. ROAS BEP & Target ROAS
    const roasBep = marginBeforeAds > 0 ? 1 / marginBeforeAds : 0;
    const marginForAds = marginBeforeAds - productTargetProfitPct / 100;
    const isTargetProfitFeasible = marginForAds > 0;
    const roasTarget = isTargetProfitFeasible ? 1 / marginForAds : 0;
    const roasInitialSetting = roasTarget > 0 ? roasTarget * (1 + productBufferPct / 100) : 0;

    return {
      product: activeProduct,
      variantsCount: variants.length,
      variantDetails,
      effectiveMinOrder,
      numOrders,
      totalUnits,
      weightedPrice,
      weightedHpp,
      grossRevenue,
      totalHpp,
      feeConfig,
      marketplaceFeeRp,
      processFeeRp,
      otherFeesRp,
      totalCostBeforeAds,
      profitBeforeAds,
      marginBeforeAdsPct,
      roasBep,
      isTargetProfitFeasible,
      marginForAdsPct: marginForAds * 100,
      roasTarget,
      roasInitialSetting,
    };
  }, [activeProduct, ingredients, variantWeights, orderSimProduct, productTargetProfitPct, productBufferPct]);

  // Set default simulator value for Mode A
  React.useEffect(() => {
    if (productCalculation && productCalculation.roasTarget > 0) {
      setProductSimRoas((prev) => (prev === 0 ? Number(productCalculation.roasTarget.toFixed(2)) : prev));
    }
  }, [productCalculation]);

  /* ========================================================================
     MATHEMATICAL CORE ENGINE: MODE B (IKLAN GRUP)
     ======================================================================== */
  const groupCalculation = React.useMemo(() => {
    if (selectedGroupProductIds.length === 0) return null;

    const groupProds = products.filter((p) => selectedGroupProductIds.includes(p.id));
    if (groupProds.length === 0) return null;

    const totalProductWeightSum =
      groupProds.reduce((sum, p) => sum + (groupProductWeights[p.id] || 0), 0) || 100;

    const totalOrdersGroup = Math.max(1, orderSimGroup);

    // Hitung unit economics masing-masing produk secara terpisah
    const productBreakdown = groupProds.map((prod) => {
      const prodWeight = (groupProductWeights[prod.id] || 0) / totalProductWeightSum;
      const variants = prod.varian || [];
      const vCount = Math.max(1, variants.length);

      // Hitung weighted price & HPP untuk produk ini
      let pWeightedPrice = 0;
      let pWeightedHpp = 0;
      let pWeightedMinOrder = 0;

      variants.forEach((v) => {
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

    // 1. Akumulasi Ekonomi Grup
    const totalGrossRevenue = productBreakdown.reduce((sum, pb) => sum + pb.grossRevenue, 0);
    const totalHpp = productBreakdown.reduce((sum, pb) => sum + pb.hpp, 0);
    const totalMarketplaceFee = productBreakdown.reduce((sum, pb) => sum + pb.marketplaceFee, 0);
    const totalOtherFee = productBreakdown.reduce((sum, pb) => sum + pb.otherFee, 0);

    // Biaya proses grup dihitung per total order grup
    const avgProcessFeePerOrder =
      productBreakdown.reduce((sum, pb) => sum + pb.processFee, 0) / (totalOrdersGroup || 1);
    const totalProcessFee = totalOrdersGroup * avgProcessFeePerOrder;

    const totalCostBeforeAds = totalHpp + totalMarketplaceFee + totalProcessFee + totalOtherFee;
    const profitBeforeAds = totalGrossRevenue - totalCostBeforeAds;
    const marginGrup = totalGrossRevenue > 0 ? profitBeforeAds / totalGrossRevenue : 0;
    const marginGrupPct = marginGrup * 100;

    // 2. Empat Angka Utama Grup
    // a. ROAS BEP GRUP (Ekonomi keseluruhan grup)
    const roasBepGroup = marginGrup > 0 ? 1 / marginGrup : 0;

    // b. ROAS BEP TERBURUK (MAX ROAS BEP seluruh produk dalam grup)
    let worstBepProduct = productBreakdown[0];
    productBreakdown.forEach((pb) => {
      if (pb.roasBep > (worstBepProduct?.roasBep || 0)) {
        worstBepProduct = pb;
      }
    });
    const roasBepWorst = worstBepProduct ? worstBepProduct.roasBep : 0;

    // c. ROAS TARGET GRUP
    const marginForAdsGroup = marginGrup - groupTargetProfitPct / 100;
    const isTargetProfitFeasible = marginForAdsGroup > 0;
    const roasTargetGroup = isTargetProfitFeasible ? 1 / marginForAdsGroup : 0;

    // d. ROAS SETTING AWAL (dengan Buffer)
    const roasInitialSettingGroup =
      roasTargetGroup > 0 ? roasTargetGroup * (1 + groupBufferPct / 100) : 0;

    const totalUnitsGroup = productBreakdown.reduce((sum, pb) => sum + pb.units, 0);
    const totalVariantsCount = groupProds.reduce((sum, p) => sum + (p.varian?.length || 0), 0);

    return {
      groupName,
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
      isTargetProfitFeasible,
      marginForAdsGroupPct: marginForAdsGroup * 100,
      roasTargetGroup,
      roasInitialSettingGroup,
      productBreakdown,
    };
  }, [
    selectedGroupProductIds,
    products,
    groupProductWeights,
    orderSimGroup,
    ingredients,
    groupTargetProfitPct,
    groupBufferPct,
    groupName,
  ]);

  // Set default simulator value for Mode B
  React.useEffect(() => {
    if (groupCalculation && groupCalculation.roasTargetGroup > 0) {
      setGroupSimRoas((prev) => (prev === 0 ? Number(groupCalculation.roasTargetGroup.toFixed(2)) : prev));
    }
  }, [groupCalculation]);

  /* ========================================================================
     HANDLERS FOR WEIGHT ADJUSTMENTS
     ======================================================================== */
  const handleVariantWeightChange = (variantId: string, value: number) => {
    const safeVal = Math.max(0, Math.min(100, value));
    setVariantWeights((prev) => ({
      ...prev,
      [variantId]: safeVal,
    }));
  };

  const handleGroupProductWeightChange = (productId: string, value: number) => {
    const safeVal = Math.max(0, Math.min(100, value));
    setGroupProductWeights((prev) => ({
      ...prev,
      [productId]: safeVal,
    }));
  };

  const handleAddProductToGroup = (productId: string) => {
    if (!selectedGroupProductIds.includes(productId)) {
      setSelectedGroupProductIds((prev) => [...prev, productId]);
    }
  };

  const handleRemoveProductFromGroup = (productId: string) => {
    if (selectedGroupProductIds.length <= 1) return;
    setSelectedGroupProductIds((prev) => prev.filter((id) => id !== productId));
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24 md:pb-12 text-[#1A1A2E]">
      {/* Header Halaman */}
      <div className="flex items-start justify-between flex-wrap gap-4">
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
                Pre-Campaign Mathematical Engine
              </Badge>
            </div>
            <p className="text-xs md:text-sm text-gray-500 font-medium mt-0.5 max-w-2xl">
              Hitung target ROAS matematis presisi sebelum beriklan berdasarkan struktur unit economics (HPP, Minimal Order, Fee Marketplace, Biaya Proses, & Target Profit).
            </p>
          </div>
        </div>
      </div>

      {/* Switcher Tab Mode Utama: [ IKLAN PRODUK ] [ IKLAN GRUP ] */}
      <div className="bg-white p-1.5 rounded-2xl border border-gray-200/80 shadow-xs flex items-center gap-1.5 max-w-md">
        <button
          type="button"
          onClick={() => {
            setAdMode('product');
            savePreferences('adMode', 'product');
          }}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
            adMode === 'product'
              ? 'bg-violet-600 text-white shadow-md shadow-violet-200'
              : 'text-gray-600 hover:text-violet-700 hover:bg-violet-50/60'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>IKLAN PRODUK</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setAdMode('group');
            savePreferences('adMode', 'group');
          }}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
            adMode === 'group'
              ? 'bg-violet-600 text-white shadow-md shadow-violet-200'
              : 'text-gray-600 hover:text-violet-700 hover:bg-violet-50/60'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>IKLAN GRUP</span>
        </button>
      </div>

      {/* ====================================================================
          MODE A: IKLAN PRODUK (1 Produk, Banyak Varian)
          ==================================================================== */}
      {adMode === 'product' && (
        <div className="space-y-6">
          {/* 1. Pilih Produk & Ringkasan */}
          <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
            <CardContent className="p-5 md:p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                    1. Pilih Produk
                  </span>
                  <h2 className="text-sm font-bold text-gray-900">Pilih Produk & Ringkasan Ekonomi</h2>
                </div>
                {activeProduct && (
                  <Badge variant="outline" className="text-xs font-bold text-gray-500">
                    {activeProduct.varian.length} Varian Terdaftar
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
                    <Label className="text-xs font-bold text-gray-600">Pilih Produk Iklan</Label>
                    <Select value={selectedProductId} onValueChange={(val) => { if (typeof val === 'string') setSelectedProductId(val); }}>
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

                  {productCalculation && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      <SummaryPill
                        label="Minimal Order"
                        value={`${productCalculation.effectiveMinOrder} pack/order`}
                        hint="Read-only (Data Produk)"
                      />
                      <SummaryPill
                        label="Harga Rata-rata"
                        value={formatCurrency(productCalculation.weightedPrice, true)}
                        hint="Weighted average"
                      />
                      <SummaryPill
                        label="HPP Rata-rata"
                        value={formatCurrency(productCalculation.weightedHpp, true)}
                        hint="Weighted average"
                      />
                      <SummaryPill
                        label="Biaya Proses"
                        value={`${formatCurrency(productCalculation.feeConfig.nominalPerOrder, true)}/order`}
                        hint="Per Transaksi Order"
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 2. Komposisi Varian */}
          {productCalculation && (
            <Card className="rounded-3xl border-none shadow-sm bg-white">
              <CardContent className="p-5 md:p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                      2. Komposisi Varian
                    </span>
                    <h2 className="text-sm font-bold text-gray-900">Distribusi Penjualan Antar Varian</h2>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 text-[11px] font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md cursor-help">
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>Bobot Varian (Total 100%)</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        Prioritas 1: Penjualan historis. Prioritas 2: Komposisi tersimpan/rata bagi. Prioritas 3: Input manual.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                <div className="space-y-3">
                  {productCalculation.variantDetails.map((vd) => (
                    <div
                      key={vd.variant.id}
                      className="p-3.5 rounded-2xl bg-gray-50/80 border border-gray-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-900 truncate">{vd.variant.nama}</p>
                        <p className="text-[11px] text-gray-500">
                          Harga: <strong>{formatCurrency(vd.pricePcs, true)}</strong> • HPP: <strong>{formatCurrency(Math.round(vd.hppPcs), true)}</strong> • Min: {vd.minOrderPcs} pack
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={variantWeights[vd.variant.id] || 0}
                          onChange={(e) => handleVariantWeightChange(vd.variant.id, Number(e.target.value))}
                          className="w-24 sm:w-32 h-2 rounded-lg bg-gray-200 appearance-none cursor-pointer accent-violet-600"
                        />
                        <div className="flex items-center gap-1 w-16">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={variantWeights[vd.variant.id] || 0}
                            onChange={(e) => handleVariantWeightChange(vd.variant.id, Number(e.target.value))}
                            className="h-8 text-xs font-bold text-center px-1 rounded-lg"
                          />
                          <span className="text-xs font-bold text-gray-400">%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 3. Simulasi Order, Biaya & Target Profit */}
          {productCalculation && (
            <Card className="rounded-3xl border-none shadow-sm bg-white">
              <CardContent className="p-5 md:p-6 space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                      3. Simulasi & Target
                    </span>
                    <h2 className="text-sm font-bold text-gray-900">Simulasi Order & Target Profit Iklan</h2>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Simulasi Order */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                      <span>Jumlah Order Simulasi</span>
                      <span className="text-violet-600">{productCalculation.totalUnits} unit total</span>
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={orderSimProduct}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value) || 1);
                        setOrderSimProduct(val);
                        savePreferences('orderSimProduct', val);
                      }}
                      className="rounded-xl h-11 font-bold text-sm"
                    />
                    <p className="text-[11px] text-gray-400">
                      {orderSimProduct} order × {productCalculation.effectiveMinOrder} pack/order = {productCalculation.totalUnits} pack
                    </p>
                  </div>

                  {/* Target Profit Setelah Iklan */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                      <span>Target Profit Setelah Iklan</span>
                      <span className="text-violet-600 font-black">{productTargetProfitPct}%</span>
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={productTargetProfitPct}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          setProductTargetProfitPct(val);
                          savePreferences('productTargetProfitPct', val);
                        }}
                        className="rounded-xl h-11 font-bold text-sm"
                      />
                      {[10, 15, 20].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setProductTargetProfitPct(preset);
                            savePreferences('productTargetProfitPct', preset);
                          }}
                          className={`h-11 px-2.5 rounded-xl text-xs font-bold transition-all ${
                            productTargetProfitPct === preset
                              ? 'bg-violet-600 text-white shadow-xs'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {preset}%
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-400">Sisa margin bersih yang diinginkan dari omzet.</p>
                  </div>

                  {/* Buffer ROAS */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                      <span>Buffer ROAS (Setting Awal)</span>
                      <span className="text-violet-600 font-black">+{productBufferPct}%</span>
                    </Label>
                    <div className="flex items-center gap-1.5">
                      {[0, 5, 10, 15].map((buf) => (
                        <button
                          key={buf}
                          type="button"
                          onClick={() => {
                            setProductBufferPct(buf);
                            savePreferences('productBufferPct', buf);
                          }}
                          className={`flex-1 h-11 rounded-xl text-xs font-bold transition-all ${
                            productBufferPct === buf
                              ? 'bg-violet-600 text-white shadow-xs'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {buf}%
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-400">Pengaman fluktuasi algoritma platform iklan.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 4. Dashboard Mode Produk & Hasil ROAS */}
          {productCalculation && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Kolom Kiri: Breakdown Dashboard Ekonomi Unit */}
              <div className="lg:col-span-5 space-y-4">
                <Card className="rounded-3xl border-none shadow-sm bg-white">
                  <CardContent className="p-5 space-y-3.5">
                    <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                      <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">
                        Dashboard Mode Produk
                      </h3>
                      <Badge className="bg-gray-100 text-gray-700 border-none font-bold text-[11px]">
                        {productCalculation.numOrders} Order Simulasi
                      </Badge>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Produk</span>
                        <span className="font-bold text-gray-900 truncate max-w-[180px]">{productCalculation.product.nama}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Jumlah Varian</span>
                        <span className="font-bold text-gray-900">{productCalculation.variantsCount} varian</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Minimal Order</span>
                        <span className="font-bold text-gray-900">{productCalculation.effectiveMinOrder} pack/order</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Total Unit Simulasi</span>
                        <span className="font-bold text-gray-900">{productCalculation.totalUnits} unit</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-gray-100">
                        <span className="text-gray-500 font-medium">Omzet</span>
                        <span className="font-black text-gray-900">{formatCurrency(productCalculation.grossRevenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">HPP</span>
                        <span className="font-bold text-rose-600">-{formatCurrency(productCalculation.totalHpp)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">
                          Fee Marketplace ({productCalculation.feeConfig.percentRate}%)
                        </span>
                        <span className="font-bold text-amber-600">-{formatCurrency(productCalculation.marketplaceFeeRp)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">
                          Biaya Proses ({productCalculation.numOrders} order)
                        </span>
                        <span className="font-bold text-amber-600">-{formatCurrency(productCalculation.processFeeRp)}</span>
                      </div>

                      <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-gray-900">Profit Sebelum Iklan</p>
                          <p className="text-[11px] text-gray-400">Margin: {productCalculation.marginBeforeAdsPct.toFixed(1)}%</p>
                        </div>
                        <p className="text-sm font-black text-emerald-600">
                          {formatCurrency(productCalculation.profitBeforeAds)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Kolom Kanan: 3 Kartu ROAS Utama & Simulator */}
              <div className="lg:col-span-7 space-y-4">
                <Card className="rounded-3xl border-none shadow-md bg-gradient-to-br from-violet-50 via-purple-50/50 to-fuchsia-50">
                  <CardContent className="p-5 md:p-6 space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-violet-100">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-200/60 px-2 py-0.5 rounded-md">
                          Hasil ROAS
                        </span>
                        <h3 className="text-sm md:text-base font-black text-gray-900">
                          Target ROAS: {productCalculation.product.nama}
                        </h3>
                      </div>
                    </div>

                    {!productCalculation.isTargetProfitFeasible ? (
                      <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-black text-rose-700">Target profit tidak dapat dicapai</p>
                          <p className="text-xs text-rose-600 leading-relaxed">
                            "Target profit tidak dapat dicapai dengan struktur biaya produk saat ini." (Margin sebelum iklan {productCalculation.marginBeforeAdsPct.toFixed(1)}% &lt; Target profit {productTargetProfitPct}%).
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* ROAS BEP */}
                        <MetricCard
                          label="ROAS BEP"
                          value={productCalculation.roasBep}
                          sub="Titik Impas (0 Profit)"
                          tooltip="ROAS minimum berdasarkan struktur biaya agar biaya iklan tidak menghabiskan seluruh margin."
                        />

                        {/* ROAS Target */}
                        <MetricCard
                          label="ROAS Target"
                          value={productCalculation.roasTarget}
                          sub={`Target Net: ${productTargetProfitPct}%`}
                          highlight
                          tooltip="ROAS yang diperlukan untuk mencapai target profit setelah iklan."
                        />

                        {/* ROAS Setting Awal */}
                        <MetricCard
                          label="ROAS Setting Awal"
                          value={productCalculation.roasInitialSetting}
                          sub={`Buffer +${productBufferPct}%`}
                          tooltip="Angka rekomendasi untuk dimasukkan ke platform iklan setelah mempertimbangkan buffer strategi."
                        />
                      </div>
                    )}

                    {/* Simulator Interaktif Mode Produk */}
                    {productCalculation.isTargetProfitFeasible && (
                      <div className="mt-4 p-4 rounded-2xl bg-white border border-violet-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Activity className="w-4 h-4 text-violet-600" />
                            <span className="text-xs font-bold text-gray-800">Simulator ROAS Produk</span>
                          </div>
                          <span className="text-xs font-black text-violet-600">Simulasi ROAS: {productSimRoas.toFixed(2)}x</span>
                        </div>

                        <input
                          type="range"
                          min={1}
                          max={20}
                          step={0.1}
                          value={productSimRoas}
                          onChange={(e) => setProductSimRoas(Number(e.target.value))}
                          className="w-full h-2 rounded-lg bg-violet-100 appearance-none cursor-pointer accent-violet-600"
                        />

                        {(() => {
                          const adSpend = productSimRoas > 0 ? productCalculation.grossRevenue / productSimRoas : 0;
                          const netProfit = productCalculation.profitBeforeAds - adSpend;
                          const netMargin = productCalculation.grossRevenue > 0 ? (netProfit / productCalculation.grossRevenue) * 100 : 0;

                          return (
                            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-center text-xs">
                              <div className="p-2 rounded-xl bg-gray-50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Biaya Iklan</p>
                                <p className="font-bold text-gray-900 mt-0.5">{formatCurrency(adSpend)}</p>
                              </div>
                              <div className="p-2 rounded-xl bg-gray-50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Profit Bersih</p>
                                <p className={`font-black mt-0.5 ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {formatCurrency(netProfit)}
                                </p>
                              </div>
                              <div className="p-2 rounded-xl bg-gray-50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Margin Bersih</p>
                                <p className={`font-black mt-0.5 ${netMargin >= productTargetProfitPct ? 'text-emerald-600' : 'text-amber-600'}`}>
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
          MODE B: IKLAN GRUP (1 Grup, Beberapa Produk)
          ==================================================================== */}
      {adMode === 'group' && (
        <div className="space-y-6">
          {/* 1. Pilih Grup & Daftar Produk */}
          <Card className="rounded-3xl border-none shadow-sm bg-white">
            <CardContent className="p-5 md:p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                    1. Konfigurasi Grup
                  </span>
                  <h2 className="text-sm font-bold text-gray-900">Daftar Produk & Komposisi Penjualan Grup</h2>
                </div>
                <Badge className="bg-violet-100 text-violet-800 border-none font-bold text-xs">
                  {selectedGroupProductIds.length} Produk Terpilih
                </Badge>
              </div>

              {/* Nama Grup */}
              <div className="space-y-1.5 max-w-md">
                <Label className="text-xs font-bold text-gray-600">Nama Grup Iklan</Label>
                <Input
                  type="text"
                  value={groupName}
                  onChange={(e) => {
                    setGroupName(e.target.value);
                    savePreferences('groupName', e.target.value);
                  }}
                  className="rounded-xl h-10 font-bold text-xs"
                  placeholder="Nama grup iklan..."
                />
              </div>

              {/* Daftar Produk Terpilih & Bobot */}
              <div className="space-y-3 pt-2">
                <Label className="text-xs font-bold text-gray-700">Daftar Produk & Komposisi Kontribusi:</Label>
                <div className="space-y-2.5">
                  {selectedGroupProductIds.map((pId) => {
                    const prod = products.find((p) => p.id === pId);
                    if (!prod) return null;

                    return (
                      <div
                        key={pId}
                        className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/90 flex items-center justify-between gap-3 flex-wrap"
                      >
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">{prod.nama}</p>
                          <p className="text-[11px] text-gray-500">
                            {prod.varian.length} varian • Minimal order: {prod.varian[0]?.min_order || 1} pack/order
                          </p>
                        </div>

                        {/* Bobot Kontribusi Produk */}
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="text-[11px] text-gray-400 font-semibold">Bobot:</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={groupProductWeights[pId] || 0}
                            onChange={(e) => handleGroupProductWeightChange(pId, Number(e.target.value))}
                            className="w-20 sm:w-28 h-2 rounded-lg bg-gray-200 appearance-none cursor-pointer accent-violet-600"
                          />
                          <div className="flex items-center gap-1 w-14">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={groupProductWeights[pId] || 0}
                              onChange={(e) => handleGroupProductWeightChange(pId, Number(e.target.value))}
                              className="h-8 text-xs font-bold text-center px-1 rounded-lg"
                            />
                            <span className="text-xs font-bold text-gray-400">%</span>
                          </div>

                          {selectedGroupProductIds.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveProductFromGroup(pId)}
                              className="w-8 h-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                              title="Hapus dari grup"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Tambah Produk Lain ke Grup */}
                {selectedGroupProductIds.length < products.length && (
                  <div className="pt-2">
                    <Select onValueChange={(val) => { if (typeof val === 'string' && val) handleAddProductToGroup(val); }}>
                      <SelectTrigger className="rounded-xl h-11 border-dashed border-2 border-violet-200 text-violet-700 font-bold text-xs bg-violet-50/40 hover:bg-violet-50">
                        <div className="flex items-center gap-1.5">
                          <Plus className="w-4 h-4" />
                          <span>+ Tambah Produk Lain ke Grup Iklan</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {products
                          .filter((p) => !selectedGroupProductIds.includes(p.id))
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                              {p.nama} ({p.varian.length} varian)
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 2. Simulasi Order Grup & Target Profit */}
          {groupCalculation && (
            <Card className="rounded-3xl border-none shadow-sm bg-white">
              <CardContent className="p-5 md:p-6 space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-2.5 py-1 rounded-lg">
                      2. Parameter Simulasi
                    </span>
                    <h2 className="text-sm font-bold text-gray-900">Simulasi Order Grup & Target Profit</h2>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Simulasi Order Grup */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                      <span>Total Order Simulasi Grup</span>
                      <span className="text-violet-600">{groupCalculation.totalUnitsGroup} unit total</span>
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={orderSimGroup}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value) || 1);
                        setOrderSimGroup(val);
                        savePreferences('orderSimGroup', val);
                      }}
                      className="rounded-xl h-11 font-bold text-sm"
                    />
                    <p className="text-[11px] text-gray-400">
                      Biaya proses dihitung per order ({orderSimGroup} transaksi order grup).
                    </p>
                  </div>

                  {/* Target Profit Grup */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                      <span>Target Profit Setelah Iklan</span>
                      <span className="text-violet-600 font-black">{groupTargetProfitPct}%</span>
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={groupTargetProfitPct}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          setGroupTargetProfitPct(val);
                          savePreferences('groupTargetProfitPct', val);
                        }}
                        className="rounded-xl h-11 font-bold text-sm"
                      />
                      {[10, 15, 20].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setGroupTargetProfitPct(preset);
                            savePreferences('groupTargetProfitPct', preset);
                          }}
                          className={`h-11 px-2.5 rounded-xl text-xs font-bold transition-all ${
                            groupTargetProfitPct === preset
                              ? 'bg-violet-600 text-white shadow-xs'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {preset}%
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-400">Sisa margin bersih keseluruhan grup.</p>
                  </div>

                  {/* Buffer ROAS Grup */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                      <span>Buffer ROAS (Setting Awal)</span>
                      <span className="text-violet-600 font-black">+{groupBufferPct}%</span>
                    </Label>
                    <div className="flex items-center gap-1.5">
                      {[0, 5, 10, 15].map((buf) => (
                        <button
                          key={buf}
                          type="button"
                          onClick={() => {
                            setGroupBufferPct(buf);
                            savePreferences('groupBufferPct', buf);
                          }}
                          className={`flex-1 h-11 rounded-xl text-xs font-bold transition-all ${
                            groupBufferPct === buf
                              ? 'bg-violet-600 text-white shadow-xs'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {buf}%
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-400">Pengaman buffer untuk setting iklan grup.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 3. Dashboard Mode Grup & 4 Kartu Hasil ROAS */}
          {groupCalculation && (
            <div className="space-y-6">
              {/* Hasil 4 Angka Utama Grup */}
              <Card className="rounded-3xl border-none shadow-md bg-gradient-to-br from-violet-50 via-purple-50/50 to-fuchsia-50">
                <CardContent className="p-5 md:p-6 space-y-5">
                  <div className="flex items-center justify-between pb-2 border-b border-violet-100 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-200/60 px-2 py-0.5 rounded-md">
                        Hasil ROAS Grup
                      </span>
                      <h3 className="text-sm md:text-base font-black text-gray-900">
                        {groupCalculation.groupName}
                      </h3>
                    </div>
                    <Badge className="bg-violet-600 text-white border-none font-bold text-xs">
                      {groupCalculation.productsCount} Produk • {groupCalculation.totalVariantsCount} Total Varian
                    </Badge>
                  </div>

                  {!groupCalculation.isTargetProfitFeasible ? (
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-black text-rose-700">Target profit grup tidak dapat dicapai</p>
                        <p className="text-xs text-rose-600 leading-relaxed">
                          "Target profit tidak dapat dicapai dengan struktur biaya produk saat ini." (Margin grup {groupCalculation.marginGrupPct.toFixed(1)}% &lt; Target profit {groupTargetProfitPct}%).
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Grid 4 Kartu ROAS Utama */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        <MetricCard
                          label="1. ROAS BEP GRUP"
                          value={groupCalculation.roasBepGroup}
                          sub="Ekonomi Keseluruhan"
                          tooltip="ROAS minimum berdasarkan struktur biaya agar biaya iklan tidak menghabiskan seluruh margin grup."
                        />

                        <MetricCard
                          label="2. ROAS BEP TERBURUK"
                          value={groupCalculation.roasBepWorst}
                          sub={groupCalculation.worstBepProduct ? groupCalculation.worstBepProduct.product.nama : '-'}
                          tone="amber"
                          tooltip="ROAS BEP tertinggi dari produk/varian yang dianalisis."
                        />

                        <MetricCard
                          label="3. ROAS TARGET GRUP"
                          value={groupCalculation.roasTargetGroup}
                          sub={`Target Net: ${groupTargetProfitPct}%`}
                          highlight
                          tooltip="ROAS yang diperlukan untuk mencapai target profit setelah iklan."
                        />

                        <MetricCard
                          label="4. ROAS SETTING AWAL"
                          value={groupCalculation.roasInitialSettingGroup}
                          sub={`Buffer +${groupBufferPct}%`}
                          tooltip="Angka rekomendasi untuk dimasukkan ke platform iklan setelah mempertimbangkan buffer strategi."
                        />
                      </div>

                      {/* Card Produk Paling Berisiko */}
                      {groupCalculation.worstBepProduct && (
                        <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200/90 flex items-start gap-3 shadow-xs">
                          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="space-y-0.5 text-xs">
                            <p className="font-black text-amber-900">
                              Produk Paling Berisiko: {groupCalculation.worstBepProduct.product.nama} — {groupCalculation.worstBepProduct.roasBep.toFixed(2)}x
                            </p>
                            <p className="text-amber-800 leading-relaxed font-medium">
                              "Produk ini membutuhkan ROAS paling tinggi untuk mencapai titik impas dibandingkan produk lain dalam grup." Ini adalah indikator keamanan berdasarkan model biaya, bukan jaminan setiap transaksi individual pasti untung.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Simulator Interaktif Mode Grup */}
                      <div className="mt-4 p-4 rounded-2xl bg-white border border-violet-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Activity className="w-4 h-4 text-violet-600" />
                            <span className="text-xs font-bold text-gray-800">Simulator ROAS Grup</span>
                          </div>
                          <span className="text-xs font-black text-violet-600">Simulasi ROAS Grup: {groupSimRoas.toFixed(2)}x</span>
                        </div>

                        <input
                          type="range"
                          min={1}
                          max={20}
                          step={0.1}
                          value={groupSimRoas}
                          onChange={(e) => setGroupSimRoas(Number(e.target.value))}
                          className="w-full h-2 rounded-lg bg-violet-100 appearance-none cursor-pointer accent-violet-600"
                        />

                        {(() => {
                          const adSpend = groupSimRoas > 0 ? groupCalculation.totalGrossRevenue / groupSimRoas : 0;
                          const netProfit = groupCalculation.profitBeforeAds - adSpend;
                          const netMargin = groupCalculation.totalGrossRevenue > 0 ? (netProfit / groupCalculation.totalGrossRevenue) * 100 : 0;

                          return (
                            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-center text-xs">
                              <div className="p-2 rounded-xl bg-gray-50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Biaya Iklan Grup</p>
                                <p className="font-bold text-gray-900 mt-0.5">{formatCurrency(adSpend)}</p>
                              </div>
                              <div className="p-2 rounded-xl bg-gray-50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Profit Bersih Grup</p>
                                <p className={`font-black mt-0.5 ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {formatCurrency(netProfit)}
                                </p>
                              </div>
                              <div className="p-2 rounded-xl bg-gray-50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Margin Bersih Grup</p>
                                <p className={`font-black mt-0.5 ${netMargin >= groupTargetProfitPct ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  {netMargin.toFixed(1)}%
                                </p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Dashboard Mode Grup: Ringkasan Nilai Finansial & Tabel Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Dashboard Ringkasan Finansial Grup */}
                <div className="lg:col-span-4 space-y-4">
                  <Card className="rounded-3xl border-none shadow-sm bg-white">
                    <CardContent className="p-5 space-y-3 text-xs">
                      <div className="pb-2 border-b border-gray-100">
                        <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">
                          Dashboard Mode Grup
                        </h3>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-medium">Nama Grup</span>
                          <span className="font-bold text-gray-900 truncate max-w-[140px]">{groupCalculation.groupName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-medium">Jumlah Produk</span>
                          <span className="font-bold text-gray-900">{groupCalculation.productsCount} produk</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-medium">Total Varian</span>
                          <span className="font-bold text-gray-900">{groupCalculation.totalVariantsCount} varian</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-medium">Order Simulasi</span>
                          <span className="font-bold text-gray-900">{groupCalculation.totalOrdersGroup} order</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-medium">Total Unit</span>
                          <span className="font-bold text-gray-900">{groupCalculation.totalUnitsGroup} pack</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-gray-100">
                          <span className="text-gray-500 font-medium">Total Omzet</span>
                          <span className="font-black text-gray-900">{formatCurrency(groupCalculation.totalGrossRevenue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-medium">Total HPP</span>
                          <span className="font-bold text-rose-600">-{formatCurrency(groupCalculation.totalHpp)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-medium">Total Fee</span>
                          <span className="font-bold text-amber-600">-{formatCurrency(groupCalculation.totalMarketplaceFee)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-medium">Total Biaya Proses</span>
                          <span className="font-bold text-amber-600">-{formatCurrency(groupCalculation.totalProcessFee)}</span>
                        </div>
                        <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                          <div>
                            <p className="font-bold text-gray-900">Profit Sebelum Iklan</p>
                            <p className="text-[11px] text-gray-400">Margin Grup: {groupCalculation.marginGrupPct.toFixed(1)}%</p>
                          </div>
                          <p className="text-sm font-black text-emerald-600">
                            {formatCurrency(groupCalculation.profitBeforeAds)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Tabel Rincian Kontribusi Produk */}
                <div className="lg:col-span-8 space-y-4">
                  <Card className="rounded-3xl border-none shadow-sm bg-white">
                    <CardContent className="p-5 md:p-6 space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                        <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">
                          Rincian Kontribusi per Produk dalam Grup
                        </h3>
                        <span className="text-xs font-bold text-gray-500">
                          Total Omzet: {formatCurrency(groupCalculation.totalGrossRevenue)}
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-200 text-gray-400 text-left">
                              <th className="pb-2 font-bold">Produk</th>
                              <th className="pb-2 font-bold text-center">Bobot</th>
                              <th className="pb-2 font-bold text-right">Omzet</th>
                              <th className="pb-2 font-bold text-right">HPP</th>
                              <th className="pb-2 font-bold text-right">Profit</th>
                              <th className="pb-2 font-bold text-right">ROAS BEP</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {groupCalculation.productBreakdown.map((pb) => (
                              <tr key={pb.product.id} className="hover:bg-gray-50/80">
                                <td className="py-2.5 font-bold text-gray-900">{pb.product.nama}</td>
                                <td className="py-2.5 text-center font-semibold text-gray-600">{pb.weightPct}%</td>
                                <td className="py-2.5 text-right font-bold text-gray-900">{formatCurrency(pb.grossRevenue)}</td>
                                <td className="py-2.5 text-right text-rose-600 font-semibold">{formatCurrency(pb.hpp)}</td>
                                <td className="py-2.5 text-right text-emerald-600 font-bold">{formatCurrency(pb.profitBeforeAds)}</td>
                                <td className="py-2.5 text-right font-black text-violet-700">{pb.roasBep.toFixed(2)}x</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   SUB-COMPONENTS
   ========================================================================== */
function SummaryPill({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="p-3 rounded-2xl bg-gray-50 border border-gray-100">
      <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-xs sm:text-sm font-black text-gray-900 mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-gray-400 font-medium mt-0.5">{hint}</p>}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  highlight,
  tone,
  tooltip,
}: {
  label: string;
  value: number;
  sub?: string;
  highlight?: boolean;
  tone?: 'amber';
  tooltip?: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`p-4 rounded-2xl transition-all cursor-help ${
              highlight
                ? 'bg-gradient-to-br from-violet-600 via-violet-700 to-fuchsia-600 text-white shadow-lg shadow-violet-200/80'
                : tone === 'amber'
                ? 'bg-white border-2 border-amber-300 text-amber-900 shadow-xs'
                : 'bg-white border border-violet-100 text-gray-900 shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <p
                className={`text-[10px] font-black uppercase tracking-wider ${
                  highlight ? 'text-white/80' : 'text-gray-400'
                }`}
              >
                {label}
              </p>
              <Info className={`w-3 h-3 ${highlight ? 'text-white/60' : 'text-gray-400'}`} />
            </div>

            <p
              className={`text-2xl sm:text-3xl font-black mt-1 ${
                highlight ? 'text-white' : tone === 'amber' ? 'text-amber-900' : 'text-gray-900'
              }`}
            >
              {isFinite(value) && value > 0 ? value.toFixed(2) : '0.00'}
              <span className="text-sm font-bold ml-0.5">x</span>
            </p>

            {sub && (
              <p
                className={`text-[11px] font-semibold mt-1 truncate ${
                  highlight ? 'text-white/80' : 'text-gray-500'
                }`}
              >
                {sub}
              </p>
            )}
          </div>
        </TooltipTrigger>
        {tooltip && <TooltipContent className="max-w-xs text-xs p-2.5">{tooltip}</TooltipContent>}
      </Tooltip>
    </TooltipProvider>
  );
}
