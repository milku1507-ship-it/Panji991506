import React from 'react';
import { Product, Variant, Ingredient, HppMaterial } from '../types';
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
  Calculator, TrendingUp, AlertTriangle, Sparkles, Megaphone, Tag, 
  PieChart, Plus, Trash2 
} from 'lucide-react';

interface Props {
  products: Product[];
  ingredients: Ingredient[];
  user: { uid: string };
}

export interface AdProductGroup {
  id: string;
  productId: string;
  variantIds: string[]; // List of selected variant IDs for this product
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
  A: number; // Total Gross Revenue
  B: number; // Total Voucher
  D: number; // Net Revenue (Omzet Real)
  E: number; // Total HPP
  G: number; // Real Cost (HPP + nominal fees)
  H: number; // Profit Kotor
  J: number; // ROAS Ideal Minimal (with 11% PPN)
  K: number; // NET ROAS (without PPN)
  L: number; // ROAS Set Seller Center (buffer 0.8)
  M: number; // NET ROAS Set
  C: number; // Effective % admin fee
  F: number; // Total nominal fees
  totalPercentFeeRp: number;
  totalQty: number;
  variantsCount: number;
  productsCount: number;
};

const createDefaultGroup = (products: Product[]): AdProductGroup => {
  const firstProd = products[0];
  const firstVar = firstProd?.varian?.[0];
  return {
    id: 'grp_' + Math.random().toString(36).substring(2, 9),
    productId: firstProd?.id || '',
    variantIds: firstVar ? [firstVar.id] : [],
  };
};

export default function ROASCalculator({ products, ingredients, user }: Props) {
  const [productGroups, setProductGroups] = React.useState<AdProductGroup[]>(() => [createDefaultGroup(products)]);
  const [profitPctRaw, setProfitPctRaw] = React.useState<string>('30');
  const [voucher, setVoucher] = React.useState<string>('0');

  // Load saved defaults
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

  // Sync initial product if groups were empty or products just loaded
  React.useEffect(() => {
    if (products.length > 0 && productGroups.length === 1 && !productGroups[0].productId) {
      setProductGroups([createDefaultGroup(products)]);
    }
  }, [products]); // eslint-disable-line

  // Handle single item preset storage key
  const totalVariantsCount = productGroups.reduce((acc, g) => acc + g.variantIds.length, 0);
  const isSingleItem = productGroups.length === 1 && totalVariantsCount === 1;
  const singleKey = isSingleItem && productGroups[0].productId && productGroups[0].variantIds[0]
    ? `${productGroups[0].productId}::${productGroups[0].variantIds[0]}`
    : 'group_roas_settings';

  // Apply saved defaults when single item changes
  React.useEffect(() => {
    if (!singleKey) return;
    const all = loadDefaults();
    const saved = all[singleKey];
    if (saved) {
      if (saved.profitPct !== undefined) setProfitPctRaw(String(saved.profitPct));
      if (saved.voucher !== undefined) setVoucher(String(saved.voucher));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleKey]);

  const profitPct = Number(profitPctRaw) || 0;
  const voucherNum = Number(voucher) || 0;

  // Group & Variant Management
  const handleAddProductGroup = () => {
    const newGroup = createDefaultGroup(products);
    // Prefer picking a product that isn't chosen yet, or fallback to first
    const chosenProductIds = productGroups.map(g => g.productId);
    const unchosenProd = products.find(p => !chosenProductIds.includes(p.id)) || products[0];
    if (unchosenProd) {
      newGroup.productId = unchosenProd.id;
      newGroup.variantIds = unchosenProd.varian?.[0] ? [unchosenProd.varian[0].id] : [];
    }
    setProductGroups(prev => [...prev, newGroup]);
  };

  const handleUpdateProduct = (groupId: string, newProductId: string) => {
    const selectedProd = products.find(p => p.id === newProductId);
    const firstVarId = selectedProd?.varian?.[0]?.id;
    setProductGroups(prev => prev.map(group => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        productId: newProductId,
        variantIds: firstVarId ? [firstVarId] : [],
      };
    }));
  };

  const handleRemoveProductGroup = (groupId: string) => {
    if (productGroups.length <= 1) return;
    setProductGroups(prev => prev.filter(group => group.id !== groupId));
  };

  const handleAddVariantToGroup = (groupId: string) => {
    setProductGroups(prev => prev.map(group => {
      if (group.id !== groupId) return group;
      const currentProd = products.find(p => p.id === group.productId);
      if (!currentProd || !currentProd.varian) return group;
      
      // Find a variant that isn't already selected in this group, or fallback to first
      const unselectedVar = currentProd.varian.find(v => !group.variantIds.includes(v.id)) || currentProd.varian[0];
      if (!unselectedVar) return group;

      return {
        ...group,
        variantIds: [...group.variantIds, unselectedVar.id],
      };
    }));
  };

  const handleUpdateVariantInGroup = (groupId: string, varIndex: number, newVariantId: string) => {
    setProductGroups(prev => prev.map(group => {
      if (group.id !== groupId) return group;
      const updatedVariantIds = [...group.variantIds];
      updatedVariantIds[varIndex] = newVariantId;
      return {
        ...group,
        variantIds: updatedVariantIds,
      };
    }));
  };

  const handleRemoveVariantFromGroup = (groupId: string, varIndex: number) => {
    setProductGroups(prev => prev.map(group => {
      if (group.id !== groupId) return group;
      if (group.variantIds.length <= 1) return group;
      const updatedVariantIds = group.variantIds.filter((_, idx) => idx !== varIndex);
      return {
        ...group,
        variantIds: updatedVariantIds,
      };
    }));
  };

  const handleProfitChange = (v: string) => {
    setProfitPctRaw(v);
    if (singleKey) saveDefaults(singleKey, { profitPct: Number(v) || 0 });
  };

  const handleVoucherChange = (v: string) => {
    setVoucher(v);
    if (singleKey) saveDefaults(singleKey, { voucher: Number(v) || 0 });
  };

  // Detailed accumulation calculation per variant in every product group
  const variantCalculations = React.useMemo(() => {
    const list: Array<{
      groupId: string;
      product: Product;
      variant: Variant;
      hargaJualPcs: number;
      hppPcs: number;
      qty: number;
      subtotalGross: number;
      subtotalHpp: number;
      percentFeeRp: number;
      nominalFeeRp: number;
    }> = [];

    productGroups.forEach(group => {
      const prod = products.find(p => p.id === group.productId);
      if (!prod) return;

      group.variantIds.forEach(vId => {
        const vari = prod.varian.find(v => v.id === vId) || prod.varian[0];
        if (!vari) return;

        const hargaJualPcs = Number(vari.harga_jual) || 0;
        const hppPcs = calcHppPerPcs(vari, ingredients);
        // Default calculation uses variant minimal order or 1 pcs (setelan awal)
        const qty = Math.max(1, Number(vari.min_order) || 1);

        const subtotalGross = hargaJualPcs * qty;
        const subtotalHpp = hppPcs * qty;

        const allFees = [
          ...(prod.biaya_lain || []),
          ...(vari.biaya_lain || [])
        ];

        let percentFeeRate = 0;
        let nominalFeePerUnit = 0;

        for (const fee of allFees) {
          if (fee.tipe === 'persen') {
            percentFeeRate += Number(fee.nilai) || 0;
          } else if (fee.tipe === 'nominal') {
            nominalFeePerUnit += Number(fee.nilai) || 0;
          }
        }

        const percentFeeRp = (percentFeeRate / 100) * subtotalGross;
        const nominalFeeRp = nominalFeePerUnit * qty;

        list.push({
          groupId: group.id,
          product: prod,
          variant: vari,
          hargaJualPcs,
          hppPcs,
          qty,
          subtotalGross,
          subtotalHpp,
          percentFeeRp,
          nominalFeeRp,
        });
      });
    });

    return list;
  }, [productGroups, products, ingredients]);

  // Overall Result Block
  const result: ResultBlock | null = React.useMemo(() => {
    if (variantCalculations.length === 0) return null;

    const A = variantCalculations.reduce((acc, c) => acc + c.subtotalGross, 0);
    const E = variantCalculations.reduce((acc, c) => acc + c.subtotalHpp, 0);
    const totalQty = variantCalculations.reduce((acc, c) => acc + c.qty, 0);
    const totalPercentFeeRp = variantCalculations.reduce((acc, c) => acc + c.percentFeeRp, 0);
    const F = variantCalculations.reduce((acc, c) => acc + c.nominalFeeRp, 0);
    
    // Total Voucher applied to group
    const B = Math.max(0, voucherNum);

    // Effective percentage fee rate
    const C = A > 0 ? (totalPercentFeeRp / A) * 100 : 0;

    // Net Revenue (D) = Gross (A) - Voucher (B) - Percent Fees
    const D = Math.max(0, (A - B) - totalPercentFeeRp);

    // Real Cost (G) = HPP (E) + Nominal Fees (F)
    const G = E + F;

    // Gross Profit (H)
    const H = D - G;
    const I = profitPct;

    let J = 0, K = 0, L = 0, M = 0;
    if (H > 0 && I > 0 && A > 0) {
      const denom1 = (H / (1 - 0.11)) * (I / 100);
      const denom2 = H * (I / 100);
      J = denom1 > 0 ? A / denom1 : 0;
      K = denom2 > 0 ? A / denom2 : 0;
      L = J / 0.8;
      M = K / 0.8;
    }

    return {
      A,
      B,
      D,
      E,
      G,
      H,
      J,
      K,
      L,
      M,
      C,
      F,
      totalPercentFeeRp,
      totalQty,
      variantsCount: variantCalculations.length,
      productsCount: productGroups.length,
    };
  }, [variantCalculations, voucherNum, profitPct, productGroups]);

  const insights: { icon: React.ReactNode; text: string; tone: 'warn' | 'info' }[] = [];
  if (result) {
    const margin = result.D > 0 ? (result.H / result.D) * 100 : 0;
    if (result.H <= 0) {
      // Handled in main panel
    } else {
      if (margin < 15) {
        insights.push({
          icon: <AlertTriangle className="w-4 h-4" />,
          text: `Margin profit gabungan tipis (${margin.toFixed(1)}%). Naikkan harga jual atau optimalkan HPP sebelum scaling iklan.`,
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
          text: 'Target ROAS ideal dan realistis untuk dijalankan pada kampanye iklan.',
          tone: 'info',
        });
      }
    }
  }

  // Dynamic Title for Result Card
  const resultCardTitle = React.useMemo(() => {
    if (!result) return 'Hasil Kalkulasi ROAS';
    if (result.variantsCount <= 1) {
      return 'Hasil Kalkulasi ROAS (1 Varian)';
    }
    return `Hasil Kalkulasi ROAS Grup Iklan (${result.variantsCount} Varian Terpilih)`;
  }, [result]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shadow-lg shadow-violet-200 shrink-0">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-black text-[#1A1A2E]">Kalkulator ROAS</h1>
              <Badge variant="outline" className="text-[11px] font-bold border-violet-200 bg-violet-50 text-violet-700">
                Single & Grup Iklan
              </Badge>
            </div>
            <p className="text-sm text-gray-500 font-medium mt-0.5">
              Hitung ROAS ideal untuk 1 varian produk maupun grup iklan (multi varian / multi produk) sekaligus.
            </p>
          </div>
        </div>
      </div>

      {/* Bagian 1: Daftar Item Iklan */}
      <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-violet-600 bg-violet-50 px-2 py-0.5 rounded-md">
                Langkah 1
              </span>
              <span className="text-sm font-bold text-gray-800">Pilih Produk & Varian Iklan</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-violet-100 text-violet-800 border-none font-bold text-xs">
                {totalVariantsCount <= 1 ? 'Mode Single Item' : `Mode Grup Iklan (${totalVariantsCount} Varian)`}
              </Badge>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              Belum ada produk. Tambahkan produk di menu HPP terlebih dahulu.
            </div>
          ) : (
            <div className="space-y-4">
              {productGroups.map((group, groupIndex) => {
                const currentProduct = products.find(p => p.id === group.productId);

                return (
                  <div 
                    key={group.id} 
                    className="p-4 sm:p-5 rounded-2xl bg-gray-50/90 border border-gray-200/80 hover:border-violet-300 transition-all space-y-4 shadow-sm"
                  >
                    {/* Header Produk Group */}
                    <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-gray-200/70">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-violet-600 text-white font-black text-xs flex items-center justify-center">
                          {groupIndex + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-gray-800">
                            Produk #{groupIndex + 1}
                          </span>
                          {currentProduct && (
                            <span className="text-xs font-bold text-violet-600">
                              ({group.variantIds.length} varian dipilih)
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {productGroups.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveProductGroup(group.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl h-7 px-2 text-xs font-bold gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Hapus Produk
                        </Button>
                      )}
                    </div>

                    {/* Pilih Produk */}
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold text-gray-500">Pilih Produk</Label>
                      <Select 
                        value={group.productId} 
                        onValueChange={(val) => handleUpdateProduct(group.id, val)}
                      >
                        <SelectTrigger className="rounded-xl h-11 bg-white border-gray-200 text-xs font-bold">
                          <SelectValue placeholder="Pilih produk..." />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                              {p.nama}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Daftar Varian di dalam Produk ini */}
                    {currentProduct && currentProduct.varian.length > 0 && (
                      <div className="space-y-2.5 pt-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] font-bold text-gray-600">
                            Varian yang Diiklankan:
                          </Label>
                          {group.variantIds.length < currentProduct.varian.length && (
                            <button
                              type="button"
                              onClick={() => handleAddVariantToGroup(group.id)}
                              className="text-[11px] font-bold text-violet-600 hover:text-violet-800 flex items-center gap-1 hover:underline"
                            >
                              <Plus className="w-3 h-3" />
                              + Tambah Varian
                            </button>
                          )}
                        </div>

                        <div className="space-y-2">
                          {group.variantIds.map((vId, vIndex) => {
                            const variantObj = currentProduct.varian.find(v => v.id === vId) || currentProduct.varian[0];
                            const hppPcs = variantObj ? calcHppPerPcs(variantObj, ingredients) : 0;
                            const minOrder = Number(variantObj?.min_order) || 1;

                            return (
                              <div 
                                key={`${group.id}_var_${vIndex}`}
                                className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-gray-200/90 shadow-xs"
                              >
                                <div className="flex-1 min-w-0">
                                  <Select
                                    value={vId}
                                    onValueChange={(val) => handleUpdateVariantInGroup(group.id, vIndex, val)}
                                  >
                                    <SelectTrigger className="rounded-lg h-9 border-none bg-transparent shadow-none px-2 text-xs font-bold text-gray-800 hover:bg-gray-50">
                                      <SelectValue placeholder="Pilih varian..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {currentProduct.varian.map((v) => (
                                        <SelectItem key={v.id} value={v.id} className="text-xs">
                                          {v.nama} — {formatCurrency(v.harga_jual || 0, true)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {variantObj && (
                                  <div className="hidden sm:flex items-center gap-3 text-[11px] text-gray-500 px-2 shrink-0">
                                    <span>Jual: <strong className="text-gray-900">{formatCurrency(variantObj.harga_jual || 0, true)}</strong></span>
                                    <span>•</span>
                                    <span>HPP: <strong className="text-rose-600">{formatCurrency(Math.round(hppPcs), true)}</strong></span>
                                    {minOrder > 1 && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-200 text-violet-600 bg-violet-50">
                                        min {minOrder} pcs
                                      </Badge>
                                    )}
                                  </div>
                                )}

                                {group.variantIds.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveVariantFromGroup(group.id, vIndex)}
                                    className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 shrink-0"
                                    title="Hapus varian ini"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {group.variantIds.length < currentProduct.varian.length && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAddVariantToGroup(group.id)}
                            className="w-full h-8 rounded-xl border border-dashed border-violet-200 text-violet-700 hover:bg-violet-50 font-bold text-xs gap-1.5 mt-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            + Tambah Varian ({currentProduct.nama})
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Tombol Tambah Produk Baru */}
              <Button
                type="button"
                variant="outline"
                onClick={handleAddProductGroup}
                className="w-full h-12 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/50 text-violet-700 hover:bg-violet-100/60 hover:border-violet-400 font-bold text-xs gap-2 transition-all shadow-xs"
              >
                <Plus className="w-4 h-4" />
                + Tambah Produk ke Iklan
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bagian 2: Data Akumulasi Otomatis */}
      {result && (
        <Card className="rounded-3xl border-none shadow-sm bg-white">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-violet-600 bg-violet-50 px-2 py-0.5 rounded-md">
                  Langkah 2
                </span>
                <span className="text-sm font-bold text-gray-800">
                  {result.variantsCount > 1 ? 'Data Akumulasi Gabungan' : 'Data Otomatis Produk'}
                </span>
              </div>
              <Badge variant="outline" className="text-xs font-bold text-gray-500">
                {result.variantsCount} Varian dari {result.productsCount} Produk
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InfoBlock
                icon={<Tag />}
                label={result.variantsCount > 1 ? 'Total Harga Jual (A)' : 'Harga Jual (A)'}
                value={formatCurrency(result.A)}
                tone="violet"
              />
              <InfoBlock
                icon={<PieChart />}
                label={result.variantsCount > 1 ? 'Total HPP (E)' : 'HPP (E)'}
                value={formatCurrency(result.E)}
                tone="rose"
              />
              <InfoBlock
                icon={<Megaphone />}
                label="Biaya Admin % (C)"
                value={`${result.C.toFixed(1)}%`}
                tone="amber"
                hint={result.C > 0 ? `Nominal: ${formatCurrency(result.totalPercentFeeRp, true)}` : 'Belum ada biaya %'}
              />
              <InfoBlock
                icon={<TrendingUp />}
                label="Biaya Proses (F)"
                value={formatCurrency(result.F)}
                tone="emerald"
                hint={result.F > 0 ? 'Total biaya tetap' : 'Belum ada biaya nominal'}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bagian 3: Setting Iklan */}
      {result && (
        <Card className="rounded-3xl border-none shadow-sm bg-white">
          <CardContent className="p-5 space-y-5">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
              <span className="text-[10px] font-black uppercase tracking-widest text-violet-600 bg-violet-50 px-2 py-0.5 rounded-md">
                Langkah 3
              </span>
              <span className="text-sm font-bold text-gray-800">Setting Target Iklan</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-bold text-sm text-gray-800">% Profit untuk Iklan (I)</Label>
                <span className="text-2xl font-black text-violet-600">{profitPct.toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.min(100, Math.max(0, profitPct))}
                onChange={(e) => handleProfitChange(e.target.value)}
                className="w-full h-2.5 rounded-full bg-violet-100 appearance-none cursor-pointer accent-violet-600"
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={profitPctRaw}
                  onChange={(e) => handleProfitChange(e.target.value)}
                  placeholder="Mis: 30"
                  className="rounded-xl h-11 font-bold text-sm max-w-[140px]"
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[20, 30, 40, 50].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleProfitChange(String(preset))}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        profitPct === preset
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-violet-50 hover:text-violet-700'
                      }`}
                    >
                      {preset}%
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-gray-400 font-medium">
                Persentase dari profit kotor yang siap dialokasikan untuk anggaran iklan (ad spend).
              </p>
            </div>

            <div className="space-y-2 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <Label className="font-bold text-xs text-gray-700">
                  Voucher / Diskon (B)
                </Label>
                <span className="text-[11px] text-gray-400 font-medium">Per bundle / grup iklan (opsional)</span>
              </div>
              <Input
                type="number"
                value={voucher}
                onChange={(e) => handleVoucherChange(e.target.value)}
                placeholder="0"
                className="rounded-xl h-11 font-bold text-sm"
              />
              {voucherNum > 0 && (
                <p className="text-[11px] text-violet-600 font-bold">
                  Diskon dipotong: {formatCurrency(voucherNum)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bagian 4: Hasil Kalkulasi */}
      {result && (
        <Card className="rounded-3xl border-none shadow-md bg-gradient-to-br from-violet-50 via-purple-50/60 to-fuchsia-50">
          <CardContent className="p-5 md:p-6 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-violet-100 border-b">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-200/60 px-2 py-0.5 rounded-md">
                  Hasil
                </span>
                <h2 className="text-base md:text-lg font-black text-[#1A1A2E]">
                  {resultCardTitle}
                </h2>
              </div>
              <Badge className="bg-violet-600 text-white border-none font-bold text-xs px-3 py-1">
                {result.variantsCount <= 1 ? '1 Varian' : `${result.variantsCount} Varian (${result.productsCount} Produk)`}
              </Badge>
            </div>

            {result.H <= 0 ? (
              <div className="bg-white rounded-2xl p-5 border-2 border-rose-200 flex items-start gap-3 shadow-sm">
                <AlertTriangle className="w-6 h-6 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-rose-600 text-base">Grup produk tidak menghasilkan profit</p>
                  <p className="text-sm text-gray-600 font-medium mt-1">
                    Profit kotor (H) = {formatCurrency(result.H)}. ROAS tidak bisa dihitung karena biaya lebih besar dari omzet real.
                    Silakan naikkan harga jual, kurangi HPP, atau sesuaikan diskon/voucher.
                  </p>
                </div>
              </div>
            ) : profitPct === 0 ? (
              <div className="bg-white rounded-2xl p-5 border border-violet-100 text-sm text-gray-500 font-medium">
                Tentukan nilai <strong>% Profit untuk Iklan</strong> di atas untuk melihat target ROAS.
              </div>
            ) : (
              <>
                {/* 3 Summary metric cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ResultCard 
                    label="Omzet Real (D)" 
                    value={formatCurrency(result.D)} 
                    sub="Setelah diskon & fee admin" 
                    tone="violet" 
                  />
                  <ResultCard 
                    label="HPP Real (G)" 
                    value={formatCurrency(result.G)} 
                    sub="Total HPP + biaya proses" 
                    tone="rose" 
                  />
                  <ResultCard
                    label="Profit Kotor (H)"
                    value={formatCurrency(result.H)}
                    sub={`Margin: ${((result.H / result.D) * 100).toFixed(1)}%`}
                    tone="emerald"
                  />
                </div>

                {/* 4 ROAS Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <RoasCard 
                    label="ROAS Ideal Minimal (J)" 
                    value={result.J} 
                    hint="Sudah memperhitungkan PPN Iklan 11%" 
                    highlight 
                  />
                  <RoasCard 
                    label="NET ROAS (K)" 
                    value={result.K} 
                    hint="Target ROAS murni tanpa PPN" 
                  />
                  <RoasCard 
                    label="ROAS Set Seller Center (L)" 
                    value={result.L} 
                    hint="Target setting iklan marketplace (buffer pengaman ÷ 0.8)" 
                  />
                  <RoasCard 
                    label="NET ROAS Set (M)" 
                    value={result.M} 
                    hint="Target setting iklan NET (buffer pengaman ÷ 0.8)" 
                  />
                </div>

                {insights.length > 0 && (
                  <div className="space-y-2 pt-2">
                    {insights.map((ins, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2.5 p-3.5 rounded-2xl text-xs font-medium border ${
                          ins.tone === 'warn' 
                            ? 'bg-amber-50/90 text-amber-900 border-amber-200/80' 
                            : 'bg-emerald-50/90 text-emerald-900 border-emerald-200/80'
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

      {products.length === 0 && (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 text-violet-500 flex items-center justify-center mx-auto">
              <Calculator className="w-7 h-7" />
            </div>
            <p className="font-bold text-sm">Belum ada produk</p>
            <p className="text-xs text-gray-500 font-medium max-w-xs mx-auto">
              Buat produk dan variasinya di menu HPP terlebih dahulu untuk mulai menghitung ROAS iklan.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoBlock({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'violet' | 'rose' | 'amber' | 'emerald';
  hint?: string;
}) {
  const tones: Record<string, string> = {
    violet: 'bg-violet-50 text-violet-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <div className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${tones[tone]}`}>
        <span className="[&>svg]:w-4 [&>svg]:h-4">{icon}</span>
      </div>
      <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-base font-black text-[#1A1A2E] mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-gray-400 font-medium mt-1">{hint}</p>}
    </div>
  );
}

function ResultCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'violet' | 'rose' | 'emerald' }) {
  const tones: Record<string, string> = {
    violet: 'border-violet-200 text-violet-700 bg-white',
    rose: 'border-rose-200 text-rose-700 bg-white',
    emerald: 'border-emerald-200 text-emerald-700 bg-white',
  };
  return (
    <div className={`rounded-2xl p-4 border-2 shadow-sm ${tones[tone]}`}>
      <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`text-xl font-black mt-0.5 ${tones[tone].split(' ').find(c => c.startsWith('text-'))}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 font-medium mt-1">{sub}</p>}
    </div>
  );
}

function RoasCard({ label, value, hint, highlight }: { label: string; value: number; hint?: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-2xl p-4.5 transition-all ${
        highlight
          ? 'bg-gradient-to-br from-violet-600 via-violet-700 to-fuchsia-600 text-white shadow-lg shadow-violet-200/80'
          : 'bg-white border border-violet-100/90 shadow-sm'
      }`}
    >
      <p className={`text-[10px] font-black uppercase tracking-wider ${highlight ? 'text-white/80' : 'text-gray-400'}`}>
        {label}
      </p>
      <p className={`text-2xl md:text-3xl font-black mt-1 ${highlight ? 'text-white' : 'text-[#1A1A2E]'}`}>
        {isFinite(value) ? value.toFixed(2) : '0.00'}<span className="text-base font-bold ml-0.5">x</span>
      </p>
      {hint && <p className={`text-[10px] font-medium mt-1.5 ${highlight ? 'text-white/80' : 'text-gray-400'}`}>{hint}</p>}
    </div>
  );
}
