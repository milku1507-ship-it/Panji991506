import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Calculator, Save, Plus, Edit2, Trash2, ChevronRight, ArrowLeft, 
  Package, Info, TrendingUp, DollarSign, MoreVertical, Copy, Search, Sparkles,
  GripVertical, ChevronDown, ChevronUp, Camera, ClipboardCopy, Check, Files
} from 'lucide-react';
import { Product, Variant, HppMaterial, Ingredient, AdditionalFee } from '../types';
import { calculateProductEconomics } from '../lib/unitEconomics';
import ProductPhotoUpload from './ProductPhotoUpload';
import { User } from 'firebase/auth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import PasteHppDialog, { ParsedHppResult } from './PasteHppDialog';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { auth, db, doc, setDoc, updateDoc, deleteDoc, writeBatch, OperationType, handleFirestoreError, sanitizeData } from '../lib/firebase';
import { useSettings } from '../SettingsContext';
import { formatSmartUnit, fromBaseValue, getBaseUnit, getConversionRate, toBaseValue } from '../lib/unitUtils';
import { formatCurrency } from '../lib/formatUtils';
import { useBackHandler } from '../lib/backStack';

interface HPPManagerProps {
  user: User | null;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  ingredients: Ingredient[];
  setIngredients: React.Dispatch<React.SetStateAction<Ingredient[]>>;
  onSetBack: React.Dispatch<React.SetStateAction<(() => void) | null>>;
  onDeleteFromStock: (materialName: string) => Promise<void>;
}

export function resolveCategoryName(rawCat: string | undefined | null, configuredCats: string[] = []): string {
  const clean = (rawCat || '').trim();
  if (!clean) return 'Lainnya';
  
  // 1. Direct case-insensitive & trimmed match against configured categories
  const matched = configuredCats.find(c => c.trim().toLowerCase() === clean.toLowerCase());
  if (matched) return matched;

  // 2. Standard aliases mapping
  const lower = clean.toLowerCase();
  if (['bahan baku', 'material utama', 'bahan utama'].includes(lower)) {
    const existing = configuredCats.find(c => ['bahan baku', 'material utama', 'bahan utama'].includes(c.trim().toLowerCase()));
    return existing || 'Bahan baku';
  }
  if (['bumbu', 'bahan bumbu'].includes(lower)) {
    const existing = configuredCats.find(c => ['bumbu', 'bahan bumbu'].includes(c.trim().toLowerCase()));
    return existing || 'Bumbu';
  }
  if (['packing', 'kemasan', 'packaging'].includes(lower)) {
    const existing = configuredCats.find(c => ['packing', 'kemasan', 'packaging'].includes(c.trim().toLowerCase()));
    return existing || 'Packing';
  }
  if (['overhead', 'operasional'].includes(lower)) {
    const existing = configuredCats.find(c => ['overhead', 'operasional'].includes(c.trim().toLowerCase()));
    return existing || 'Overhead';
  }

  return clean;
}

type ViewState = 'products' | 'variants' | 'detail' | 'category';

export default function HPPManager({ user, products, setProducts, ingredients, setIngredients, onSetBack, onDeleteFromStock }: HPPManagerProps) {
  const { settings } = useSettings();
  const [view, setView] = React.useState<ViewState>('products');
  const [selectedProductId, setSelectedProductId] = React.useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = React.useState<string | null>(null);
  
  // Modals state
  const [isProductModalOpen, setIsProductModalOpen] = React.useState(false);
  const [isVariantModalOpen, setIsVariantModalOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<Product | null>(null);
  const [productPhoto, setProductPhoto] = React.useState<string>('');
  const [editingVariant, setEditingVariant] = React.useState<Variant | null>(null);
  const [variantFees, setVariantFees] = React.useState<AdditionalFee[]>([]);
  const [copiedProductId, setCopiedProductId] = React.useState<string | null>(null);
  const [copiedVariantId, setCopiedVariantId] = React.useState<string | null>(null);
  
  // Detail HPP State
  const [activeHppVariant, setActiveHppVariant] = React.useState<Variant | null>(null);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleteMaterialConfirmOpen, setIsDeleteMaterialConfirmOpen] = React.useState(false);
  const [isDeleteCategoryConfirmOpen, setIsDeleteCategoryConfirmOpen] = React.useState(false);
  const [materialToDelete, setMaterialToDelete] = React.useState<{ index: number, material: HppMaterial } | null>(null);
  const [categoryToDelete, setCategoryToDelete] = React.useState<string | null>(null);
  const [editingMaterial, setEditingMaterial] = React.useState<{ material: HppMaterial, index: number } | null>(null);
  const [productFees, setProductFees] = React.useState<AdditionalFee[]>([]);
  const [isMaterialPopoverOpen, setIsMaterialPopoverOpen] = React.useState(false);
  const [isPasteHppOpen, setIsPasteHppOpen] = React.useState(false);
  const [selectedKelompok, setSelectedKelompok] = React.useState<string>('');
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);

  const handleViewCategory = (cat: string) => {
    setSelectedCategory(cat);
    setView('category');
  };

  const moveCategoryInSettings = async (cat: string, dir: 'up' | 'down') => {
    if (!settings || !auth.currentUser) return;
    const cats = [...settings.kategori_hpp];
    const idx = cats.indexOf(cat);
    if (idx < 0) return;
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= cats.length) return;
    [cats[idx], cats[swap]] = [cats[swap], cats[idx]];
    try {
      await updateDoc(doc(db, `users/${auth.currentUser.uid}/settings/kategori`), sanitizeData({ kategori_hpp: cats }));
    } catch (e) {
      toast.error('Gagal mengubah urutan kategori');
    }
  };

  React.useEffect(() => {
    if (editingMaterial) {
      const kel = editingMaterial.material.kelompok;
      const validKel = kel && kel.trim() ? kel : (settings?.kategori_hpp[0] || 'Lainnya');
      setSelectedKelompok(validKel);
    }
  }, [editingMaterial, settings?.kategori_hpp]);

  const selectedProduct = products.find(p => p.id === selectedProductId);
  const selectedVariant = selectedProduct?.varian.find(v => v.id === selectedVariantId);

  // Navigation handlers
  const handleViewVariants = (productId: string) => {
    setSelectedProductId(productId);
    setView('variants');
  };

  const handleViewDetail = (variantId: string) => {
    setSelectedVariantId(variantId);
    const variant = selectedProduct?.varian.find(v => v.id === variantId);
    if (variant) {
      setActiveHppVariant(JSON.parse(JSON.stringify(variant)));
      setView('detail');
    }
  };

  const handleBack = React.useCallback(() => {
    if (view === 'category') setView('detail');
    else if (view === 'detail') setView('variants');
    else if (view === 'variants') setView('products');
  }, [view]);

  // Wire device/browser back button to mirror the in-app back navigation
  // for the HPP drilldown: category → detail → variants → products.
  useBackHandler(view === 'category', () => setView('detail'));
  useBackHandler(view === 'detail', () => setView('variants'));
  useBackHandler(view === 'variants', () => setView('products'));

  React.useEffect(() => {
    if (view !== 'products' && onSetBack) {
      onSetBack(() => handleBack);
    } else if (onSetBack) {
      onSetBack(null);
    }
    return () => {
      if (onSetBack) onSetBack(null);
    };
  }, [view, handleBack, onSetBack]);

  React.useEffect(() => {
    if (editingProduct) {
      setProductFees(editingProduct.biaya_lain || []);
      setProductPhoto(editingProduct.foto || '');
    } else {
      setProductFees([]);
      setProductPhoto('');
    }
  }, [editingProduct]);

  React.useEffect(() => {
    if (editingVariant) {
      setVariantFees(editingVariant.biaya_lain || []);
    } else {
      setVariantFees([]);
    }
  }, [editingVariant]);

  // Product CRUD
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[HPPManager] Starting handleSaveProduct...");
    setIsSaving(true);
    
    try {
      const formData = new FormData(e.target as HTMLFormElement);
      const nama = (formData.get('nama') as string || '').trim();
      const sku = (formData.get('sku') as string || '').trim();
      const deskripsi = (formData.get('deskripsi') as string || '').trim();

      if (!nama) {
        toast.error('Nama produk wajib diisi');
        setIsSaving(false);
        return;
      }

      if (editingProduct) {
        const updatedProduct = { 
          ...editingProduct, 
          nama, 
          sku, 
          deskripsi, 
          foto: productPhoto,
          biaya_lain: productFees 
        };
        
        // Optimistic update
        setProducts(prev => prev.map(p => p.id === editingProduct.id ? updatedProduct : p));
        
        // Close modal immediately for responsiveness
        setIsProductModalOpen(false);
        setEditingProduct(null);
        toast.success('Produk diperbarui ✓');

        if (user) {
          (async () => {
            try {
              console.log("[HPPManager] Syncing updated product to Firestore...");
              await setDoc(doc(db, `users/${user.uid}/hpp/${editingProduct.id}`), sanitizeData(updatedProduct));
            } catch (err) {
              console.error("[HPPManager] Background sync product error:", err);
            }
          })();
        }
      } else {
        const id = 'prod_' + Math.random().toString(36).substr(2, 9);
        const newProduct: Product = {
          id,
          sku,
          nama,
          deskripsi,
          foto: productPhoto,
          varian: [],
          biaya_lain: productFees
        };
        
        // Optimistic update
        setProducts(prev => [...prev, newProduct]);
        
        // Close modal immediately for responsiveness
        setIsProductModalOpen(false);
        setEditingProduct(null);
        toast.success('Produk ditambahkan ✓');

        if (user) {
          (async () => {
            try {
              console.log("[HPPManager] Creating new product in Firestore...");
              await setDoc(doc(db, `users/${user.uid}/hpp/${id}`), sanitizeData(newProduct));
            } catch (err) {
              console.error("[HPPManager] Background create product error:", err);
            }
          })();
        }
      }
      console.log("[HPPManager] handleSaveProduct finished successfully.");
    } catch (error) {
      console.error("[HPPManager] Error in handleSaveProduct:", error);
      if (user) handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/hpp`);
      toast.error('Gagal menyimpan produk');
    } finally {
      setIsSaving(false);
      console.log("[HPPManager] setIsSaving(false) called in handleSaveProduct.");
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product && product.varian.length > 0) {
      toast.error('Gagal menghapus', { description: 'Hapus semua varian terlebih dahulu.' });
      return;
    }
    
    try {
      if (user) {
        await deleteDoc(doc(db, `users/${user.uid}/hpp/${productId}`));
      }
      setProducts(prev => prev.filter(p => p.id !== productId));
      toast.success('Produk dihapus');
    } catch (error) {
      if (user) handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/hpp/${productId}`);
    }
  };

  const handleDuplicateProduct = async (product: Product) => {
    const id = 'prod_' + Math.random().toString(36).substr(2, 9);
    const newSku = product.sku ? `${product.sku}-COPY` : '';
    const newProduct: Product = {
      ...JSON.parse(JSON.stringify(product)),
      id,
      sku: newSku,
      nama: `${product.nama} (Copy)`,
      foto: product.foto || '',
      biaya_lain: product.biaya_lain ? JSON.parse(JSON.stringify(product.biaya_lain)) : [],
      varian: (product.varian || []).map(v => ({
        ...JSON.parse(JSON.stringify(v)),
        id: 'var_' + Math.random().toString(36).substr(2, 9)
      }))
    };
    
    try {
      // Optimistic update
      setProducts(prev => [...prev, newProduct]);
      toast.success('Produk berhasil diduplikasi', {
        description: `Salinan '${newProduct.nama}' dibuat beserta ${newProduct.varian.length} varian.`
      });

      if (user) {
        await setDoc(doc(db, `users/${user.uid}/hpp/${id}`), sanitizeData(newProduct));
      }
    } catch (error) {
      console.error("[HPPManager] Error duplicating product:", error);
      if (user) handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/hpp/${id}`);
      toast.error('Gagal menduplikasi produk');
    }
  };

  const handleCopyProductToClipboard = async (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    try {
      const lines: string[] = [
        `📦 PRODUK: ${product.nama}`
      ];
      if (product.sku) {
        lines.push(`SKU: ${product.sku}`);
      }
      if ((product as any).kategori) {
        lines.push(`Kategori: ${(product as any).kategori}`);
      }
      if (product.deskripsi) {
        lines.push(`Deskripsi: ${product.deskripsi}`);
      }
      
      // Biaya Lain-Lain Global
      if (product.biaya_lain && product.biaya_lain.length > 0) {
        lines.push(`\n💰 Biaya Lain-Lain Global Produk:`);
        product.biaya_lain.forEach((fee) => {
          const valStr = fee.tipe === 'nominal' ? formatCurrency(fee.nilai, true) : `${fee.nilai}%`;
          lines.push(`  - ${fee.nama}: ${valStr}`);
        });
      }

      if (product.varian && product.varian.length > 0) {
        lines.push(`\n================================`);
        lines.push(`👥 VARIAN PRODUK (${product.varian.length}):`);
        lines.push(`================================`);
        
        product.varian.forEach((v, idx) => {
          lines.push(`\n${idx + 1}. 🔹 Varian: ${v.nama}`);
          if (v.sku) {
            lines.push(`   SKU Varian: ${v.sku}`);
          }
          lines.push(`   Harga Jual: ${formatCurrency(v.harga_jual, true)}`);
          if (v.harga_coret) {
            lines.push(`   Harga Coret: ${formatCurrency(v.harga_coret, true)}`);
          }
          if (v.diskon_persen) {
            lines.push(`   Diskon: ${v.diskon_persen}%`);
          }
          if (v.min_order) {
            lines.push(`   Minimal Order: ${v.min_order} pcs`);
          }
          lines.push(`   Batch Qty: ${v.qty_batch || 1} pcs`);
          lines.push(`   Gaji / pack: ${formatCurrency(v.harga_packing || 0, true)}`);

          // List of ingredients (Bahan Baku)
          if (v.bahan && v.bahan.length > 0) {
            lines.push(`\n   🍀 Bahan Baku (HPP):`);
            v.bahan.forEach((b) => {
              const cost = getMaterialCost(b);
              lines.push(`     • ${b.nama}: ${b.qty} ${b.satuan} @ ${formatCurrency(b.harga, true)} (Subtotal: ${formatCurrency(cost, true)})`);
            });
          }

          // List of variant-specific fees
          if (v.biaya_lain && v.biaya_lain.length > 0) {
            lines.push(`\n   💸 Biaya Tambahan Varian:`);
            v.biaya_lain.forEach((fee) => {
              const valStr = fee.tipe === 'nominal' ? formatCurrency(fee.nilai, true) : `${fee.nilai}%`;
              lines.push(`     - ${fee.nama}: ${valStr}`);
            });
          }

          const hppPcs = calculateHpp(v.bahan, v.harga_packing, v.qty_batch);
          const fees = calculateVariantFees(
            [...(product.biaya_lain || []), ...(v.biaya_lain || [])],
            v.harga_jual
          );
          const totalCost = hppPcs + fees;
          const profit = v.harga_jual - totalCost;
          const margin = v.harga_jual > 0 ? (profit / v.harga_jual) * 100 : 0;

          lines.push(`\n   📊 Ringkasan Keuangan Varian:`);
          lines.push(`     - HPP Bahan Baku/pcs : ${formatCurrency(Math.round(hppPcs), true)}`);
          lines.push(`     - Biaya Lain/Layanan : ${formatCurrency(Math.round(fees), true)}`);
          lines.push(`     - Total Pengeluaran  : ${formatCurrency(Math.round(totalCost), true)}`);
          lines.push(`     - Laba Bersih/pcs    : ${formatCurrency(Math.round(profit), true)}`);
          lines.push(`     - Margin Keuntungan  : ${margin.toFixed(1)}%`);
          lines.push(`   -----------------------------`);
        });
      }

      const textToCopy = lines.join('\n');
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedProductId(product.id);
      setTimeout(() => setCopiedProductId(null), 2000);
      toast.success('Ringkasan produk disalin!', {
        description: `Info '${product.nama}' berhasil disalin ke clipboard.`
      });
    } catch (err) {
      console.error('Failed to copy product summary:', err);
      toast.error('Gagal menyalin ringkasan produk');
    }
  };

function VariantPricingSection({ editingVariant }: { editingVariant: Variant | null }) {
  const [hargaJual, setHargaJual] = React.useState<number>(editingVariant?.harga_jual || 0);
  const [hargaCoret, setHargaCoret] = React.useState<string>(
    editingVariant?.harga_coret ? String(editingVariant.harga_coret) : ''
  );
  const [diskonPersen, setDiskonPersen] = React.useState<string>(
    editingVariant?.diskon_persen ? String(editingVariant.diskon_persen) : ''
  );
  const [lastMode, setLastMode] = React.useState<'coret' | 'diskon'>('coret');
  const [errorMsg, setErrorMsg] = React.useState<string>('');

  React.useEffect(() => {
    setHargaJual(editingVariant?.harga_jual || 0);
    setHargaCoret(editingVariant?.harga_coret ? String(editingVariant.harga_coret) : '');
    setDiskonPersen(editingVariant?.diskon_persen ? String(editingVariant.diskon_persen) : '');
    setErrorMsg('');
  }, [editingVariant]);

  const handleHargaJualChange = (newHj: number) => {
    setHargaJual(newHj);
    const hcNum = Number(hargaCoret) || 0;
    const diskonNum = Number(diskonPersen) || 0;

    if (lastMode === 'coret' && hcNum > 0) {
      if (hcNum <= newHj) {
        setErrorMsg('Harga Coret harus lebih tinggi dari Harga Jual.');
        setDiskonPersen('');
      } else {
        setErrorMsg('');
        const calcDiskon = Number((((hcNum - newHj) / hcNum) * 100).toFixed(2));
        setDiskonPersen(String(calcDiskon));
      }
    } else if (lastMode === 'diskon' && diskonNum > 0 && diskonNum < 100) {
      setErrorMsg('');
      const calcCoret = Math.round(newHj / (1 - diskonNum / 100));
      setHargaCoret(String(calcCoret));
    }
  };

  const handleHargaCoretChange = (valStr: string) => {
    setHargaCoret(valStr);
    setLastMode('coret');
    const valNum = Number(valStr) || 0;

    if (!valStr || valNum === 0) {
      setDiskonPersen('');
      setErrorMsg('');
      return;
    }

    if (valNum <= hargaJual) {
      setErrorMsg('Harga Coret harus lebih tinggi dari Harga Jual.');
      setDiskonPersen('');
    } else {
      setErrorMsg('');
      const calcDiskon = Number((((valNum - hargaJual) / valNum) * 100).toFixed(2));
      setDiskonPersen(String(calcDiskon));
    }
  };

  const handleDiskonPersenChange = (valStr: string) => {
    setDiskonPersen(valStr);
    setLastMode('diskon');
    const valNum = Number(valStr) || 0;

    if (!valStr || valNum === 0) {
      setHargaCoret('');
      setErrorMsg('');
      return;
    }

    if (valNum >= 100 || valNum < 0) {
      setErrorMsg('Persentase diskon harus antara 1% dan 99%.');
      setHargaCoret('');
    } else {
      setErrorMsg('');
      const calcCoret = Math.round(hargaJual / (1 - valNum / 100));
      setHargaCoret(String(calcCoret));
    }
  };

  const hcNum = Number(hargaCoret) || 0;
  const diskonNominal = hcNum > hargaJual ? hcNum - hargaJual : 0;

  return (
    <div className="space-y-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
            HARGA JUAL, HARGA CORET & DISKON
          </h4>
          <p className="text-[10px] text-slate-500 font-medium">Sinkronisasi 2 Arah (Nominal ↔ Persentase)</p>
        </div>
        <Badge variant="outline" className="text-[9px] bg-white border-slate-300 font-bold">
          Auto Calc
        </Badge>
      </div>

      <VariantPricingInputs 
        hargaJual={hargaJual}
        hargaCoret={hargaCoret}
        diskonPersen={diskonPersen}
        editingVariant={editingVariant}
        handleHargaJualChange={handleHargaJualChange}
        handleHargaCoretChange={handleHargaCoretChange}
        handleDiskonPersenChange={handleDiskonPersenChange}
      />

      {errorMsg ? (
        <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs font-bold text-rose-700 flex items-center gap-2">
          <span>⚠️</span> {errorMsg}
        </div>
      ) : hcNum > hargaJual && diskonNominal > 0 ? (
        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-1">
          <p className="font-bold">
            🏷️ Harga Coret: <span className="line-through">{formatCurrency(hcNum)}</span> → Harga Jual: <span className="font-black text-emerald-950">{formatCurrency(hargaJual)}</span>
          </p>
          <p className="text-[11px] text-emerald-700 font-medium">
            Hemat: <strong>{formatCurrency(diskonNominal)}</strong> ({Number(diskonPersen).toFixed(2)}% off)
          </p>
        </div>
      ) : null}
    </div>
  );
}

function VariantPricingInputs({
  hargaJual,
  hargaCoret,
  diskonPersen,
  editingVariant,
  handleHargaJualChange,
  handleHargaCoretChange,
  handleDiskonPersenChange,
}: any) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="harga_jual" className="font-bold text-xs text-gray-700">
            Harga Jual / pcs (Transaksi) *
          </Label>
          <Input 
            id="harga_jual" 
            name="harga_jual" 
            type="number" 
            value={hargaJual} 
            onChange={(e) => handleHargaJualChange(Number(e.target.value) || 0)}
            placeholder="27000" 
            required 
            className="rounded-xl bg-white font-black h-11" 
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="qty_batch" className="font-bold text-xs text-gray-700">Qty Produksi (Batch)</Label>
          <Input id="qty_batch" name="qty_batch" type="number" defaultValue={editingVariant?.qty_batch || 10} required className="rounded-xl bg-white h-11" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="harga_coret" className="font-bold text-xs text-gray-700">
            Harga Coret (Metode A)
          </Label>
          <Input 
            id="harga_coret" 
            name="harga_coret" 
            type="number" 
            value={hargaCoret} 
            onChange={(e) => handleHargaCoretChange(e.target.value)}
            placeholder="35000" 
            className="rounded-xl bg-white font-bold h-11" 
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="diskon_persen" className="font-bold text-xs text-gray-700">
            Diskon % (Metode B)
          </Label>
          <div className="relative">
            <Input 
              id="diskon_persen" 
              name="diskon_persen" 
              type="number" 
              step="0.01"
              value={diskonPersen} 
              onChange={(e) => handleDiskonPersenChange(e.target.value)}
              placeholder="20" 
              className="rounded-xl bg-white font-bold h-11 pr-8" 
            />
            <span className="absolute right-3 top-3 text-xs font-bold text-gray-400">%</span>
          </div>
        </div>
      </div>
    </>
  );
}

  // Variant CRUD
  const handleSaveVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[HPPManager] Starting handleSaveVariant...");
    setIsSaving(true);
    
    try {
      const formData = new FormData(e.target as HTMLFormElement);
      const nama = formData.get('nama') as string;
      const sku = ((formData.get('sku') as string) || '').trim();
      const harga_jual = parseInt(formData.get('harga_jual') as string) || 0;
      const harga_coret_raw = parseInt(formData.get('harga_coret') as string) || 0;
      const diskon_persen_raw = parseFloat(formData.get('diskon_persen') as string) || 0;
      const qty_batch = parseInt(formData.get('qty_batch') as string) || 145;
      const harga_packing = parseInt(formData.get('harga_packing') as string) || 12000;
      const min_order = Math.max(1, parseInt(formData.get('min_order') as string) || 1);

      let harga_coret: number | undefined = undefined;
      let diskon_persen: number | undefined = undefined;

      if (harga_coret_raw > 0) {
        if (harga_coret_raw <= harga_jual) {
          toast.error("Harga Coret harus lebih tinggi dari Harga Jual.");
          setIsSaving(false);
          return;
        }
        harga_coret = harga_coret_raw;
        diskon_persen = Number((((harga_coret_raw - harga_jual) / harga_coret_raw) * 100).toFixed(2));
      } else if (diskon_persen_raw > 0 && diskon_persen_raw < 100) {
        diskon_persen = diskon_persen_raw;
        harga_coret = Math.round(harga_jual / (1 - diskon_persen_raw / 100));
      }

      if (!selectedProductId) {
        throw new Error("Produk tidak dipilih");
      }

      const product = products.find(p => p.id === selectedProductId);
      if (!product) {
        throw new Error("Produk tidak ditemukan");
      }

      let updatedVarian;
      if (editingVariant) {
        updatedVarian = product.varian.map(v => v.id === editingVariant.id ? { 
          ...v, 
          nama, 
          sku, 
          harga_jual, 
          harga_coret, 
          diskon_persen, 
          qty_batch, 
          harga_packing, 
          min_order, 
          biaya_lain: variantFees 
        } : v);
      } else {
        const newVariant: Variant = {
          id: 'var_' + Math.random().toString(36).substr(2, 9),
          nama,
          sku,
          harga_jual,
          harga_coret,
          diskon_persen,
          qty_batch,
          harga_packing,
          min_order,
          biaya_lain: variantFees,
          bahan: []
        };
        updatedVarian = [...product.varian, newVariant];
      }

      const updatedProduct = { ...product, varian: updatedVarian };

      // Optimistic update
      setProducts(prev => prev.map(p => p.id === selectedProductId ? updatedProduct : p));
      
      // Close modal immediately for responsiveness
      setIsVariantModalOpen(false);
      setEditingVariant(null);
      toast.success(editingVariant ? 'Varian diperbarui ✓' : 'Varian ditambahkan ✓');

      if (user) {
        (async () => {
          try {
            console.log("[HPPManager] Syncing variant to Firestore...");
            await setDoc(doc(db, `users/${user.uid}/hpp/${selectedProductId}`), sanitizeData(updatedProduct));
          } catch (err) {
            console.error("[HPPManager] Background sync variant error:", err);
          }
        })();
      }
      console.log("[HPPManager] handleSaveVariant finished successfully.");
    } catch (error) {
      console.error("[HPPManager] Error in handleSaveVariant:", error);
      if (user) handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/hpp/${selectedProductId}`);
      toast.error('Gagal menyimpan varian');
    } finally {
      setIsSaving(false);
      console.log("[HPPManager] setIsSaving(false) called in handleSaveVariant.");
    }
  };

  const handleDeleteVariant = async (variantId: string) => {
    if (!selectedProductId) return;
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    const updatedProduct = { ...product, varian: product.varian.filter(v => v.id !== variantId) };

    try {
      if (user) {
        await setDoc(doc(db, `users/${user.uid}/hpp/${selectedProductId}`), sanitizeData(updatedProduct));
      }
      setProducts(prev => prev.map(p => p.id === selectedProductId ? updatedProduct : p));
      toast.success('Varian dihapus');
    } catch (error) {
      if (user) handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/hpp/${selectedProductId}`);
    }
  };

  const handleDuplicateVariant = async (variant: Variant) => {
    if (!selectedProductId) return;
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    const newVariant: Variant = {
      ...JSON.parse(JSON.stringify(variant)),
      id: 'var_' + Math.random().toString(36).substr(2, 9),
      nama: `${variant.nama} (Copy)`
    };
    
    const updatedProduct = { ...product, varian: [...product.varian, newVariant] };

    if (user) {
      try {
        await setDoc(doc(db, `users/${user.uid}/hpp/${selectedProductId}`), sanitizeData(updatedProduct));
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/hpp/${selectedProductId}`);
      }
    } else {
      setProducts(prev => prev.map(p => p.id === selectedProductId ? updatedProduct : p));
    }
    toast.success(`Varian '${variant.nama}' diduplikasi`);
  };

  const handleCopyVariantToClipboard = async (e: React.MouseEvent, variant: Variant, productName?: string) => {
    e.stopPropagation();
    try {
      const hppPcs = calculateHpp(variant.bahan, variant.harga_packing, variant.qty_batch);
      const fees = calculateVariantFees(
        [...(selectedProduct?.biaya_lain || []), ...(variant.biaya_lain || [])],
        variant.harga_jual
      );
      const totalCost = hppPcs + fees;
      const profit = variant.harga_jual - totalCost;
      const margin = variant.harga_jual > 0 ? (profit / variant.harga_jual) * 100 : 0;

      const lines: string[] = [
        `📦 VARIAN: ${productName ? `${productName} - ` : ''}${variant.nama}`,
      ];
      if (variant.sku) lines.push(`SKU: ${variant.sku}`);
      lines.push(`Harga Jual: ${formatCurrency(variant.harga_jual, true)}`);
      if (variant.harga_coret) {
        lines.push(`Harga Coret: ${formatCurrency(variant.harga_coret, true)}`);
      }
      if (variant.diskon_persen) {
        lines.push(`Diskon: ${variant.diskon_persen}%`);
      }
      if (variant.min_order) {
        lines.push(`Minimal Order: ${variant.min_order} pcs`);
      }
      lines.push(`Batch Qty: ${variant.qty_batch || 1} pcs`);
      lines.push(`Gaji / pack: ${formatCurrency(variant.harga_packing || 0, true)}`);

      // List of ingredients (Bahan Baku)
      if (variant.bahan && variant.bahan.length > 0) {
        lines.push(`\n🍀 Bahan Baku (HPP):`);
        variant.bahan.forEach((b) => {
          const cost = getMaterialCost(b);
          lines.push(`  • ${b.nama}: ${b.qty} ${b.satuan} @ ${formatCurrency(b.harga, true)} (Subtotal: ${formatCurrency(cost, true)})`);
        });
      }

      // List of fees
      const allFees = [...(selectedProduct?.biaya_lain || []), ...(variant.biaya_lain || [])];
      if (allFees.length > 0) {
        lines.push(`\n💸 Biaya Tambahan & Layanan:`);
        allFees.forEach((fee) => {
          const valStr = fee.tipe === 'nominal' ? formatCurrency(fee.nilai, true) : `${fee.nilai}%`;
          lines.push(`  - ${fee.nama}: ${valStr}`);
        });
      }

      lines.push(`\n📊 Ringkasan Keuangan:`);
      lines.push(`  - HPP Bahan Baku/pcs : ${formatCurrency(Math.round(hppPcs), true)}`);
      lines.push(`  - Biaya Lain/Layanan : ${formatCurrency(Math.round(fees), true)}`);
      lines.push(`  - Total Pengeluaran  : ${formatCurrency(Math.round(totalCost), true)}`);
      lines.push(`  - Laba Bersih/pcs    : ${formatCurrency(Math.round(profit), true)}`);
      lines.push(`  - Margin Keuntungan  : ${margin.toFixed(1)}%`);

      const textToCopy = lines.join('\n');
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedVariantId(variant.id);
      setTimeout(() => setCopiedVariantId(null), 2000);
      toast.success('Info varian disalin!', {
        description: `Ringkasan '${variant.nama}' berhasil disalin ke clipboard.`
      });
    } catch (err) {
      console.error('Failed to copy variant summary:', err);
      toast.error('Gagal menyalin info varian');
    }
  };

  // Fee Management (Product Level)
  const handleAddFee = () => {
    setProductFees([...productFees, { nama: '', tipe: 'persen', nilai: 0 }]);
  };

  const handleUpdateFee = (index: number, field: keyof AdditionalFee, value: any) => {
    const updated = [...productFees];
    updated[index] = { ...updated[index], [field]: value };
    setProductFees(updated);
  };

  const handleRemoveFee = (index: number) => {
    setProductFees(productFees.filter((_, i) => i !== index));
  };

  // Fee Management (Variant Level)
  const handleAddVariantFee = () => {
    setVariantFees([...variantFees, { nama: '', tipe: 'persen', nilai: 0 }]);
  };

  const handleUpdateVariantFee = (index: number, field: keyof AdditionalFee, value: any) => {
    const updated = [...variantFees];
    updated[index] = { ...updated[index], [field]: value };
    setVariantFees(updated);
  };

  const handleRemoveVariantFee = (index: number) => {
    setVariantFees(variantFees.filter((_, i) => i !== index));
  };

  const handleMaterialChange = (index: number, field: keyof HppMaterial, value: any) => {
    if (!activeHppVariant) return;
    const newBahan = [...activeHppVariant.bahan];
    newBahan[index] = { ...newBahan[index], [field]: value };
    setActiveHppVariant({ ...activeHppVariant, bahan: newBahan });
  };

  const handleAddMaterial = () => {
    if (!activeHppVariant) return;
    const defaultKelompok = settings?.kategori_hpp[0] || 'Lainnya';
    const newMaterial: HppMaterial = {
      id: 'mat_' + Math.random().toString(36).substr(2, 9),
      nama: '',
      satuan: 'gram',
      qty: 0,
      harga: 0,
      kelompok: defaultKelompok
    };
    const newIndex = activeHppVariant.bahan.length;
    setActiveHppVariant({ ...activeHppVariant, bahan: [...activeHppVariant.bahan, newMaterial] });
    setEditingMaterial({ material: newMaterial, index: newIndex });
    setIsMaterialModalOpen(true);
  };

  const handleRemoveMaterial = (index: number) => {
    if (!activeHppVariant) return;
    const material = activeHppVariant.bahan[index];
    setMaterialToDelete({ index, material });
    setIsDeleteMaterialConfirmOpen(true);
  };

  const confirmRemoveMaterial = async () => {
    if (!materialToDelete || !activeHppVariant || !selectedProductId) return;
    const { index, material } = materialToDelete;
    
    const newBahan = activeHppVariant.bahan.filter((_, i) => i !== index);
    const updatedVariant = { ...activeHppVariant, bahan: newBahan };
    setActiveHppVariant(updatedVariant);
    
    // Close modal & notify immediately
    setIsDeleteMaterialConfirmOpen(false);
    setMaterialToDelete(null);
    toast.success(`Bahan "${material.nama}" berhasil dihapus dari HPP dan Stok`);

    const product = products.find(p => p.id === selectedProductId);
    if (product) {
      const updatedProduct = {
        ...product,
        varian: product.varian.map(v => v.id === activeHppVariant.id ? updatedVariant : v)
      };
      
      setProducts(prev => prev.map(p => p.id === selectedProductId ? updatedProduct : p));

      if (user) {
        try {
          await setDoc(doc(db, `users/${user.uid}/hpp/${selectedProductId}`), sanitizeData(updatedProduct));
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/hpp/${selectedProductId}`);
        }
      }
    }
    
    if (material.nama) {
      await onDeleteFromStock(material.nama);
    }
  };

  const handleRemoveCategory = (catName: string) => {
    if (!activeHppVariant) return;
    setCategoryToDelete(catName);
    setIsDeleteCategoryConfirmOpen(true);
  };

  const handleCopyMaterials = async () => {
    if (!activeHppVariant) return;
    if (activeHppVariant.bahan.length === 0) {
      toast.info('Belum ada bahan untuk disalin.');
      return;
    }

    const lines: string[] = [];
    const judul = `${selectedProduct?.nama || ''} - ${activeHppVariant.nama}`.trim();
    lines.push(judul);
    lines.push('');

    // Dynamically retrieve all groups to avoid omissions
    const settingsCats = [...(settings?.kategori_hpp || []), 'Lainnya'];
    const legacyCats = activeHppVariant.bahan
      .map(m => m.kelompok)
      .filter((k): k is string => !!k && k.trim() !== '');
    const groups = [...new Set([...settingsCats, ...legacyCats])];

    let totalCost = 0;

    for (const cat of groups) {
      const catMaterials = activeHppVariant.bahan.filter(m => {
        const mCat = m.kelompok || 'Lainnya';
        return mCat === cat;
      });
      if (catMaterials.length === 0) continue;

      lines.push(cat.toUpperCase());
      for (const m of catMaterials) {
        const ing = ingredients.find(i => i.id === m.ingredientId);
        const name = ing ? ing.name : m.nama;
        const unit = ing ? ing.unit : m.satuan;
        const cost = getMaterialCost(m);
        totalCost += cost;
        lines.push(`- ${name} ${formatSmartUnit(m.qty, unit)} = ${formatCurrency(cost, false)}`);
      }
      lines.push('');
    }

    lines.push(`Total HPP Bahan: ${formatCurrency(totalCost, false)}`);

    const text = lines.join('\n');

    const fallbackCopy = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
      return ok;
    };

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        toast.success('Daftar bahan disalin', { description: 'Tempel ke WhatsApp, catatan, atau Paste Otomatis.' });
      } else if (fallbackCopy()) {
        toast.success('Daftar bahan disalin');
      } else {
        toast.error('Gagal menyalin', { description: 'Browser tidak mengizinkan akses clipboard.' });
      }
    } catch (err) {
      if (fallbackCopy()) {
        toast.success('Daftar bahan disalin');
      } else {
        toast.error('Gagal menyalin', { description: 'Browser tidak mengizinkan akses clipboard.' });
      }
    }
  };

  const confirmRemoveCategory = async () => {
    if (!categoryToDelete || !activeHppVariant || !selectedProductId) return;
    
    const catName = categoryToDelete;
    const materialsToDelete = activeHppVariant.bahan.filter(m => {
      const res = resolveCategoryName(m.kelompok, settings?.kategori_hpp);
      return res.toLowerCase() === catName.toLowerCase();
    });

    const newBahan = activeHppVariant.bahan.filter(m => {
      const res = resolveCategoryName(m.kelompok, settings?.kategori_hpp);
      return res.toLowerCase() !== catName.toLowerCase();
    });

    const updatedVariant = { ...activeHppVariant, bahan: newBahan };
    setActiveHppVariant(updatedVariant);

    // Close modal & notify immediately
    setIsDeleteCategoryConfirmOpen(false);
    setCategoryToDelete(null);
    toast.success(`Kelompok ${catName} dan semua bahannya berhasil dihapus dari HPP dan Stok`);

    const product = products.find(p => p.id === selectedProductId);
    if (product) {
      const updatedProduct = {
        ...product,
        varian: product.varian.map(v => v.id === activeHppVariant.id ? updatedVariant : v)
      };
      
      setProducts(prev => prev.map(p => p.id === selectedProductId ? updatedProduct : p));

      if (user) {
        try {
          await setDoc(doc(db, `users/${user.uid}/hpp/${selectedProductId}`), sanitizeData(updatedProduct));
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/hpp/${selectedProductId}`);
        }
      }
    }

    // Delete from stock
    for (const m of materialsToDelete) {
      if (m.nama) await onDeleteFromStock(m.nama);
    }
  };

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial || !activeHppVariant) return;
    
    console.log("[HPPManager] Starting handleSaveMaterial...");
    setIsSaving(true);
    
    try {
      const formData = new FormData(e.target as HTMLFormElement);
      const rawNama = formData.get('nama');
      const nama = typeof rawNama === 'string' ? rawNama.trim() : '';
      
      if (!nama) {
        toast.error('Silakan pilih atau isi nama bahan terlebih dahulu');
        setIsSaving(false);
        return;
      }

      let kelompok = (formData.get('kelompok') as string) || 'Lainnya';
      kelompok = resolveCategoryName(kelompok, settings?.kategori_hpp);

      if (user && settings && kelompok !== 'Lainnya') {
        const inSettings = (settings.kategori_hpp || []).some(c => c.trim().toLowerCase() === kelompok.toLowerCase());
        if (!inSettings) {
          const updatedCats = [...(settings.kategori_hpp || []), kelompok];
          updateDoc(doc(db, `users/${user.uid}/settings/kategori`), sanitizeData({ kategori_hpp: updatedCats })).catch(e => console.error("Auto add category error", e));
        }
      }
      const qtyInput = parseFloat(formData.get('qty') as string) || 0;
      const satuanInput = (formData.get('satuan') as string) || 'gram';
      const hargaInput = parseFloat(formData.get('harga') as string) || 0;

      // Map to base unit and base value for storage
      const satuan = getBaseUnit(satuanInput);
      const qty = toBaseValue(qtyInput, satuanInput);
      const harga = hargaInput / getConversionRate(satuanInput); // Price per base unit

      // FIND OR CREATE INGREDIENT IN GLOBAL LIST
      let ingredientId = editingMaterial.material.ingredientId;
      
      // Find by name if ID is missing (legacy)
      if (!ingredientId) {
         const existingByNama = ingredients.find(i => (i.name || '').toLowerCase().trim() === nama.toLowerCase());
         if (existingByNama) ingredientId = existingByNama.id;
      }

      if (!ingredientId) {
         // Truly new ingredient
         ingredientId = 'ing_' + Math.random().toString(36).substr(2, 9);
      }

      // Update global ingredients list (Single Source of Truth)
      const existingIng = ingredients.find(i => i.id === ingredientId);
      let updatedIngredientsLocal: Ingredient[];
      if (existingIng) {
        const updatedIng = {
          ...existingIng,
          name: nama,
          category: kelompok,
          price: harga,
          unit: satuan,
          fromHpp: true
        };
        
        // Find all ingredients with same name (case insensitive) and sync price
        updatedIngredientsLocal = ingredients.map(i => {
          if (i.id === ingredientId) return updatedIng;
          if ((i.name || '').toLowerCase().trim() === nama.toLowerCase()) {
            return { ...i, price: harga, unit: satuan };
          }
          return i;
        });
      } else {
        // Create new ingredient
        const newIng: Ingredient = {
          id: ingredientId,
          name: nama,
          category: kelompok,
          unit: satuan,
          price: harga,
          initialStock: 0,
          currentStock: 0,
          minStock: 0,
          fromHpp: true
        };
        updatedIngredientsLocal = [...ingredients, newIng];
      }

      const newBahan = [...activeHppVariant.bahan];
      newBahan[editingMaterial.index] = { 
        ...newBahan[editingMaterial.index], 
        ingredientId,
        nama, 
        kelompok, 
        qty, 
        harga,
        satuan
      };

      // Propagate changes to ALL other variants across ALL products that share the same bahan
      const updatedActiveVariant = { ...activeHppVariant, bahan: newBahan };
      const oldNama = (editingMaterial.material.nama || '').toLowerCase().trim();
      const modifiedProductIds = new Set<string>();

      const syncedProducts = products.map(p => {
        const updatedVarian = p.varian.map(v => {
          if (p.id === selectedProductId && v.id === activeHppVariant.id) {
            return { ...v, bahan: newBahan };
          }
          const hasSameIngredient = v.bahan.some(
            b => (oldNama && (b.nama || '').toLowerCase().trim() === oldNama) ||
                 (ingredientId && b.ingredientId === ingredientId)
          );
          if (!hasSameIngredient) return v;
          modifiedProductIds.add(p.id);
          return {
            ...v,
            bahan: v.bahan.map(b => {
              const matchByName = oldNama && (b.nama || '').toLowerCase().trim() === oldNama;
              const matchById = ingredientId && b.ingredientId === ingredientId;
              return (matchByName || matchById)
                ? { ...b, nama, kelompok, harga, satuan, ingredientId }
                : b;
            })
          };
        });
        return { ...p, varian: updatedVarian };
      });

      // Optimistic React state updates — responsive UI immediately!
      setIngredients(updatedIngredientsLocal);
      setProducts(syncedProducts);
      setActiveHppVariant(updatedActiveVariant);

      // Close modal immediately so UI doesn't hang on slow network connections
      setIsMaterialModalOpen(false);
      setEditingMaterial(null);
      setIsSaving(false);

      const syncCount = modifiedProductIds.size;
      toast.success(syncCount > 0
        ? `Bahan diperbarui & disinkronkan ke ${syncCount} produk lain ✓`
        : 'Bahan diperbarui & Stok disinkronkan ✓'
      );

      // Async Firestore persistence using a single write batch
      if (user) {
        (async () => {
          try {
            const batch = writeBatch(db);

            // Stock collection updates
            if (existingIng) {
              const updatedIng = { ...existingIng, name: nama, category: kelompok, price: harga, unit: satuan, fromHpp: true };
              batch.set(doc(db, `users/${user.uid}/stok/${ingredientId}`), sanitizeData(updatedIng));
              const sameNameIngredients = ingredients.filter(
                i => (i.name || '').toLowerCase().trim() === nama.toLowerCase() && i.id !== ingredientId
              );
              for (const ing of sameNameIngredients) {
                batch.set(
                  doc(db, `users/${user.uid}/stok/${ing.id}`),
                  sanitizeData({ ...ing, price: harga, unit: satuan })
                );
              }
            } else {
              const newIng: Ingredient = {
                id: ingredientId,
                name: nama,
                category: kelompok,
                unit: satuan,
                price: harga,
                initialStock: 0,
                currentStock: 0,
                minStock: 0,
                fromHpp: true
              };
              batch.set(doc(db, `users/${user.uid}/stok/${ingredientId}`), sanitizeData(newIng));
            }

            // HPP products collection updates
            const allAffectedIds = new Set([selectedProductId, ...modifiedProductIds]);
            for (const pid of allAffectedIds) {
              const updatedProd = syncedProducts.find(p => p.id === pid);
              if (updatedProd) {
                batch.set(doc(db, `users/${user.uid}/hpp/${pid}`), sanitizeData(updatedProd));
              }
            }

            await batch.commit();
            console.log(`[HPPManager] Saved HPP & Stock in single batch for ${allAffectedIds.size} product(s).`);
          } catch (err) {
            console.error('[HPPManager] Background batch write error:', err);
            handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/hpp`);
          }
        })();
      }
      console.log("[HPPManager] handleSaveMaterial finished successfully.");
    } catch (error) {
      console.error("[HPPManager] Error in handleSaveMaterial:", error);
      toast.error('Gagal menyimpan bahan');
    } finally {
      setIsSaving(false);
      console.log("[HPPManager] setIsSaving(false) called in handleSaveMaterial.");
    }
  };
  const handlePasteHppConfirm = async (parsed: ParsedHppResult) => {
    if (!selectedProductId) {
      toast.error('Pilih produk dulu');
      return;
    }
    const product = products.find(p => p.id === selectedProductId);
    if (!product) {
      toast.error('Produk tidak ditemukan');
      return;
    }

    const variantNama = (parsed.variant.nama_varian || '').trim() || 'Varian Baru';
    const qtyBatch = Math.max(1, Math.round(Number(parsed.variant.qty_batch) || 1));
    const hargaJual = Math.round(Number(parsed.variant.harga_jual) || 0);
    const hargaPacking = Math.round(Number(parsed.variant.harga_packing) || 0);

    const validKategori = new Set([...(settings?.kategori_hpp || []), 'Lainnya']);

    type IngredientPlan = {
      id: string;
      isNew: boolean;
      name: string;
      category: string;
      unit: string; // base unit
      price: number; // per base unit
    };

    const ingredientPlans: IngredientPlan[] = [];
    const newBahan: HppMaterial[] = [];

    for (const b of parsed.bahan) {
      const nama = (b.nama || '').trim();
      if (!nama) continue;

      const satuanInput = (b.satuan || 'pcs').trim();
      const qtyInput = Number(b.qty) || 0;
      const hargaInput = Number(b.harga_per_satuan) || 0;
      let kelompok = resolveCategoryName(b.kelompok, settings?.kategori_hpp);

      const baseUnit = getBaseUnit(satuanInput);
      const qtyBase = toBaseValue(qtyInput, satuanInput);
      const pricePerBase = hargaInput / getConversionRate(satuanInput);

      // Find or create matching ingredient (by case-insensitive name)
      const normalizedNama = nama.toLowerCase();
      const existing = ingredients.find(i => i.name.toLowerCase().trim() === normalizedNama);
      const planned = ingredientPlans.find(p => p.name.toLowerCase() === normalizedNama);

      let ingredientId: string;
      if (existing) {
        ingredientId = existing.id;
        if (!planned) {
          ingredientPlans.push({
            id: ingredientId,
            isNew: false,
            name: nama,
            category: kelompok,
            unit: baseUnit,
            price: pricePerBase,
          });
        }
      } else if (planned) {
        ingredientId = planned.id;
      } else {
        ingredientId = 'ing_' + Math.random().toString(36).substr(2, 9);
        ingredientPlans.push({
          id: ingredientId,
          isNew: true,
          name: nama,
          category: kelompok,
          unit: baseUnit,
          price: pricePerBase,
        });
      }

      newBahan.push({
        id: 'mat_' + Math.random().toString(36).substr(2, 9),
        ingredientId,
        nama,
        kelompok,
        qty: qtyBase,
        satuan: baseUnit,
        harga: pricePerBase,
      });
    }

    const newVariant: Variant = {
      id: 'var_' + Math.random().toString(36).substr(2, 9),
      nama: variantNama,
      sku: '',
      harga_jual: hargaJual,
      qty_batch: qtyBatch,
      harga_packing: hargaPacking,
      min_order: 1,
      bahan: newBahan,
    };

    const updatedProduct: Product = {
      ...product,
      varian: [...product.varian, newVariant],
    };

    // Update local ingredient list (create new + sync price/unit on existing)
    const updatedIngredientsLocal: Ingredient[] = ingredients.map(i => {
      const plan = ingredientPlans.find(p => p.id === i.id);
      if (!plan || plan.isNew) return i;
      return { ...i, name: plan.name, category: plan.category, unit: plan.unit, price: plan.price, fromHpp: true };
    });
    for (const plan of ingredientPlans) {
      if (plan.isNew) {
        updatedIngredientsLocal.push({
          id: plan.id,
          name: plan.name,
          category: plan.category,
          unit: plan.unit,
          price: plan.price,
          initialStock: 0,
          currentStock: 0,
          minStock: 0,
          fromHpp: true,
        });
      }
    }

    // Optimistic local updates
    setIngredients(updatedIngredientsLocal);
    setProducts(prev => prev.map(p => p.id === selectedProductId ? updatedProduct : p));

    // Persist to Firestore in a batch (non-blocking background)
    if (user) {
      (async () => {
        try {
          const batch = writeBatch(db);
          batch.set(
            doc(db, `users/${user.uid}/hpp/${selectedProductId}`),
            sanitizeData(updatedProduct)
          );
          for (const plan of ingredientPlans) {
            const ingDoc = updatedIngredientsLocal.find(i => i.id === plan.id);
            if (ingDoc) {
              batch.set(doc(db, `users/${user.uid}/stok/${plan.id}`), sanitizeData(ingDoc));
            }
          }
          await batch.commit();
          console.log('[HPPManager] paste-hpp saved successfully in background batch.');
        } catch (error) {
          console.error('[HPPManager] paste-hpp save error:', error);
          handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/hpp/${selectedProductId}`);
        }
      })();
    }

    toast.success(
      `Varian "${variantNama}" dibuat dengan ${newBahan.length} bahan ✓`,
      { description: ingredientPlans.filter(p => p.isNew).length > 0
          ? `${ingredientPlans.filter(p => p.isNew).length} bahan baru ditambahkan ke Stok`
          : undefined }
    );
  };

  const handleSaveHpp = async () => {
    if (!activeHppVariant || !selectedProductId) return;
    
    console.log("[HPPManager] Starting handleSaveHpp...");
    setIsSaving(true);
    
    try {
      const product = products.find(p => p.id === selectedProductId);
      if (!product) {
        throw new Error("Produk tidak ditemukan");
      }

      const updatedProduct = {
        ...product,
        varian: product.varian.map(v => v.id === activeHppVariant.id ? activeHppVariant : v)
      };

      // Optimistic update
      setProducts(prev => prev.map(p => p.id === selectedProductId ? updatedProduct : p));
      toast.success('Data HPP berhasil disimpan ✓');
      setView('variants');

      if (user) {
        (async () => {
          try {
            console.log("[HPPManager] Syncing HPP data to Firestore...");
            await setDoc(doc(db, `users/${user.uid}/hpp/${selectedProductId}`), sanitizeData(updatedProduct));
          } catch (err) {
            console.error("[HPPManager] Background sync HPP error:", err);
          }
        })();
      }
      console.log("[HPPManager] handleSaveHpp finished successfully.");
    } catch (error) {
      console.error("[HPPManager] Error in handleSaveHpp:", error);
      if (user) handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/hpp/${selectedProductId}`);
      toast.error('Gagal menyimpan total HPP');
    } finally {
      setIsSaving(false);
      console.log("[HPPManager] setIsSaving(false) called in handleSaveHpp.");
    }
  };

  const getMaterialCost = (b: HppMaterial) => {
    const ingredient = ingredients.find(i => i.id === b.ingredientId);
    let price = b.harga;
    let usage = Number(b.qty) || 0;
    
    if (ingredient) {
      price = ingredient.price;
      const ingUnit = ingredient.unit;
      const matUnit = b.satuan;
      
      const ingBase = getBaseUnit(ingUnit);
      const matBase = getBaseUnit(matUnit);

      if (ingBase === matBase) {
        // Both refer to the same base (e.g. gram and kg)
        // Convert usage to base, and multiply by price-per-base
        usage = toBaseValue(usage, matUnit);
        // We assume ingredient.price is per ingredient.unit
        const pricePerBase = price / getConversionRate(ingUnit);
        return usage * pricePerBase;
      }
    }
    return usage * price;
  };

  const calculateHpp = (bahan: HppMaterial[], packingCost: number = 0, qtyBatch: number = 1) => {
    const totalMaterials = bahan.reduce((acc, b) => acc + getMaterialCost(b), 0);
    const qBatch = Math.max(1, Number(qtyBatch) || 1);
    
    // HPP per Pcs = (Total Bahan per Batch + Total Packing per Batch) / Qty per Batch
    return (totalMaterials + (Number(packingCost) || 0)) / qBatch;
  };

  const calculateVariantFees = (fees: AdditionalFee[] = [], sellingPrice: number = 0, minOrder: number = 1) => {
    if (!fees || fees.length === 0) return 0;
    const econ = calculateProductEconomics({
      sellingPrice,
      hppPcs: 0,
      minOrder,
      additionalCosts: fees,
    });
    return econ.totalAdditionalCostPerUnit;
  };

  const calculateBatchHpp = (bahan: HppMaterial[], packingCost: number = 0) => {
    const totalMaterials = bahan.reduce((acc, b) => acc + getMaterialCost(b), 0);
    return totalMaterials + (Number(packingCost) || 0);
  };

  const calculateMaterialsPerPcs = (bahan: HppMaterial[], qtyBatch: number = 1) => {
    const totalMaterials = bahan.reduce((acc, b) => acc + getMaterialCost(b), 0);
    const qBatch = Math.max(1, Number(qtyBatch) || 1);
    return totalMaterials / qBatch;
  };

  // Render Helpers
  const renderBreadcrumbs = () => (
    <div className="flex items-center gap-1.5 text-[9px] md:text-[10px] font-black text-gray-400 mb-4 uppercase tracking-widest overflow-x-auto no-scrollbar whitespace-nowrap py-1">
      <button onClick={() => setView('products')} className="hover:text-primary transition-colors shrink-0">HPP</button>
      {view !== 'products' && (
        <>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <button onClick={() => setView('variants')} className="hover:text-primary transition-colors shrink-0 max-w-[100px] truncate">{selectedProduct?.nama}</button>
        </>
      )}
      {(view === 'detail' || view === 'category') && (
        <>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <button onClick={() => setView('detail')} className={view === 'detail' ? 'text-[#1A1A2E] shrink-0 max-w-[100px] truncate' : 'hover:text-primary transition-colors shrink-0 max-w-[100px] truncate'}>{activeHppVariant?.nama}</button>
        </>
      )}
      {view === 'category' && (
        <>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <span className="text-[#1A1A2E] shrink-0 max-w-[120px] truncate">{selectedCategory}</span>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-[#1A1A2E]">Manajemen HPP</h2>
          <p className="text-gray-500 font-medium">Kelola produk, varian, dan kalkulasi modal.</p>
        </div>
        {view === 'products' && (
          <Button 
            onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }}
            className="orange-gradient text-white font-bold rounded-2xl shadow-lg shadow-brand-200 gap-2 h-12 px-6"
          >
            <Plus className="w-4 h-4" />
            Produk Baru
          </Button>
        )}
        {view === 'variants' && (
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setIsPasteHppOpen(true)}
              className="border-primary text-primary hover:bg-brand-50 font-bold rounded-2xl gap-2 h-12 px-5"
            >
              <Sparkles className="w-4 h-4" />
              Paste Otomatis
            </Button>
            <Button 
              onClick={() => { setEditingVariant(null); setIsVariantModalOpen(true); }}
              className="orange-gradient text-white font-bold rounded-2xl shadow-lg shadow-brand-200 gap-2 h-12 px-6"
            >
              <Plus className="w-4 h-4" />
              Varian Baru
            </Button>
          </div>
        )}
        {view === 'detail' && (
          <Button 
            onClick={handleSaveHpp}
            className="orange-gradient text-white font-bold rounded-2xl shadow-lg shadow-brand-200 gap-2 h-12 px-6"
          >
            <Save className="w-4 h-4" />
            Simpan HPP
          </Button>
        )}
      </div>

      {renderBreadcrumbs()}

      {/* VIEW: PRODUCTS */}
      {view === 'products' && (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
          {products.map(p => (
            <Card key={p.id} className="border-none shadow-sm rounded-2xl bg-white overflow-hidden group hover:shadow-md transition-all duration-300 flex flex-col">
              {/* Product photo — full width at top */}
              <div className="relative w-full aspect-square bg-gray-50 overflow-hidden flex-shrink-0">
                {p.foto ? (
                  <img src={p.foto} alt={p.nama} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-10 h-10 text-gray-200" />
                  </div>
                )}
                {/* Camera button to change/upload photo */}
                {user && (
                  <div className="absolute inset-0 flex items-end justify-end p-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <ProductPhotoUpload
                      productId={p.id}
                      userId={user.uid}
                      currentFoto={p.foto}
                      size="sm"
                      className="shadow-md bg-white/90 backdrop-blur-sm border border-black/5"
                      onUploaded={url => setProducts(prev => prev.map(x => x.id === p.id ? { ...x, foto: url } : x))}
                    />
                  </div>
                )}
                {/* Direct tap to upload if no photo */}
                {!p.foto && user && (
                  <div 
                    className="absolute inset-0 flex items-center justify-center cursor-pointer"
                    onClick={(e) => {
                      // Trigger upload by finding the inner ProductPhotoUpload
                      const target = e.currentTarget.parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
                      if (target) target.click();
                    }}
                  >
                    <div className="flex flex-col items-center gap-1 text-gray-400 p-2">
                      <Camera className="w-6 h-6 text-gray-300" />
                      <span className="text-[10px] font-bold text-gray-400">+ Foto</span>
                    </div>
                  </div>
                )}
                {/* Kategori badge */}
                {(p as any).kategori && (
                  <div className="absolute top-2 left-2">
                    <span className="text-[9px] font-black bg-black/50 text-white px-1.5 py-0.5 rounded-md uppercase tracking-wider backdrop-blur-sm">
                      {(p as any).kategori}
                    </span>
                  </div>
                )}
              </div>

              <CardContent className="p-3 sm:p-3.5 flex flex-col flex-1 gap-2">
                {/* Baris 1: Nama Produk */}
                <div>
                  <h3 
                    className="text-xs sm:text-sm font-bold text-[#1A1A2E] line-clamp-2 leading-snug" 
                    title={p.nama}
                  >
                    {p.nama}
                  </h3>
                </div>

                {/* Baris 2: SKU & Harga Jual */}
                <div className="flex items-center justify-between gap-1.5 min-w-0">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider truncate">
                    {p.sku ? `SKU: ${p.sku}` : <span className="italic text-gray-300 font-normal">No SKU</span>}
                  </span>
                  {p.varian.some(v => v.harga_jual > 0) ? (
                    <p className="text-xs sm:text-sm font-black text-rose-600 shrink-0">
                      {p.varian.length === 1
                        ? `Rp${p.varian[0].harga_jual.toLocaleString('id-ID')}`
                        : `Rp${Math.min(...p.varian.map(v => v.harga_jual)).toLocaleString('id-ID')}+`}
                    </p>
                  ) : (
                    <span className="text-xs text-gray-300 font-medium">-</span>
                  )}
                </div>

                {/* Baris 3: Badge Varian & Tombol Link Detail */}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <Badge 
                    variant="outline" 
                    className="text-[10px] font-bold border-gray-200 bg-gray-50 text-gray-600 px-2 py-0.5 rounded-md cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleViewVariants(p.id)}
                  >
                    {p.varian.length} Varian
                  </Badge>

                  <button
                    type="button"
                    onClick={() => handleViewVariants(p.id)}
                    className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-0.5 group/btn transition-colors"
                  >
                    <span>Detail</span>
                    <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-0.5" />
                  </button>
                </div>

                {/* Baris 4 / Bottom Bar: Grup Ikon Aksi */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-auto">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    title="Edit Produk"
                    className="w-7 h-7 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" 
                    onClick={() => { setEditingProduct(p); setIsProductModalOpen(true); }}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    title="Salin Ringkasan ke Clipboard (Copy Text)"
                    className={cn(
                      "w-7 h-7 rounded-lg transition-colors",
                      copiedProductId === p.id 
                        ? "text-emerald-600 bg-emerald-50" 
                        : "text-gray-400 hover:text-purple-600 hover:bg-purple-50"
                    )}
                    onClick={(e) => handleCopyProductToClipboard(e, p)}
                  >
                    {copiedProductId === p.id ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <ClipboardCopy className="w-4 h-4" />
                    )}
                  </Button>

                  <Button 
                    variant="ghost" 
                    size="icon" 
                    title="Duplikasi Produk (Tambah Data Baru)"
                    className="w-7 h-7 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" 
                    onClick={() => handleDuplicateProduct(p)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>

                  <Button 
                    variant="ghost" 
                    size="icon" 
                    title="Hapus Produk"
                    className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" 
                    onClick={() => handleDeleteProduct(p.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* VIEW: VARIANTS */}
      {view === 'variants' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {selectedProduct?.varian.map(v => {
              const hppPcs = calculateHpp(v.bahan, v.harga_packing, v.qty_batch);
              const totalFees = calculateVariantFees(
                [...(selectedProduct?.biaya_lain || []), ...(v.biaya_lain || [])],
                v.harga_jual
              );
              const totalCost = hppPcs + totalFees;
              const margin = v.harga_jual > 0 ? ((v.harga_jual - totalCost) / v.harga_jual) * 100 : 0;
              const hasFees = (v.biaya_lain && v.biaya_lain.length > 0) || (selectedProduct?.biaya_lain && selectedProduct.biaya_lain.length > 0);
              
              return (
                <Card key={v.id} className="border-none shadow-sm rounded-3xl bg-white overflow-hidden group hover:shadow-md transition-all duration-300">
                  <CardContent className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center text-primary shrink-0">
                        <Calculator className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-black text-[#1A1A2E] truncate">{v.nama}</h3>
                          {hasFees && (
                            <Badge variant="outline" className="text-[9px] border-amber-200 text-amber-600 bg-amber-50 font-bold px-1.5 py-0">
                              +Biaya
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                          <span className="text-[10px] md:text-xs font-bold text-gray-400">HPP: <span className="text-primary">{v.bahan.length > 0 ? formatCurrency(Math.round(totalCost), true) : '—'}</span></span>
                          <span className="text-[10px] md:text-xs font-bold text-gray-400">Jual: <span className="text-green-600">{formatCurrency(v.harga_jual, true)}</span></span>
                          {v.bahan.length > 0 && (
                            <Badge className={cn(
                              "text-[9px] md:text-[10px] border-none font-black px-2 py-0",
                              margin >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            )}>
                              {margin.toFixed(1)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 justify-end sm:justify-start">
                      <Button 
                        className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl gap-2 flex-1 sm:flex-none"
                        onClick={() => handleViewDetail(v.id)}
                      >
                        Hitung HPP
                      </Button>
                      <div className="flex gap-1">
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className={cn(
                            "h-10 w-10 rounded-xl border-gray-100 transition-colors",
                            copiedVariantId === v.id ? "text-emerald-600 bg-emerald-50 border-emerald-200" : "text-gray-400 hover:text-purple-600 hover:bg-purple-50"
                          )} 
                          onClick={(e) => handleCopyVariantToClipboard(e, v, selectedProduct?.nama)} 
                          title="Salin Info Varian ke Clipboard"
                        >
                          {copiedVariantId === v.id ? <Check className="w-4 h-4 text-emerald-600" /> : <ClipboardCopy className="w-4 h-4" />}
                        </Button>
                        <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-gray-100 text-gray-400 hover:text-amber-600 hover:bg-amber-50" onClick={() => handleDuplicateVariant(v)} title="Duplikasi Varian (Copy Data)">
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-gray-100 text-gray-400 hover:text-blue-500 hover:bg-blue-50" onClick={() => { setEditingVariant(v); setIsVariantModalOpen(true); }} title="Edit Varian">
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-gray-100 text-gray-400 hover:text-red-500 hover:bg-red-50" onClick={() => handleDeleteVariant(v.id)} title="Hapus Varian">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW: DETAIL HPP */}
      {view === 'detail' && activeHppVariant && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 border-none shadow-sm rounded-3xl bg-white">
              <CardHeader className="flex flex-row items-start justify-between pb-2 gap-2">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-lg font-bold">Rincian Komponen</CardTitle>
                  <CardDescription className="truncate">{selectedProduct?.nama} › {activeHppVariant.nama}</CardDescription>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-brand-100 text-primary font-bold gap-1"
                    onClick={handleCopyMaterials}
                    title="Salin daftar bahan"
                  >
                    <Copy className="w-4 h-4" />
                    <span className="hidden sm:inline">Salin</span>
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-xl border-brand-100 text-primary font-bold gap-1" onClick={handleAddMaterial}>
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Tambah Komponen</span>
                    <span className="sm:hidden">Tambah</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="space-y-2">
                  {(() => {
                    const settingsCats = (settings?.kategori_hpp || []).map(c => c.trim()).filter(Boolean);
                    
                    const materialsWithResolvedCat = activeHppVariant.bahan.map((m, originalIdx) => {
                      const resolvedCat = resolveCategoryName(m.kelompok, settingsCats);
                      return { ...m, resolvedCat, originalIdx };
                    });

                    const presentCats: string[] = Array.from(new Set(materialsWithResolvedCat.map(m => m.resolvedCat)));

                    const orderedCats = [
                      ...settingsCats.filter(sc => presentCats.some(pc => pc.toLowerCase() === sc.toLowerCase())),
                      ...presentCats.filter(pc => !settingsCats.some(sc => sc.toLowerCase() === pc.toLowerCase()))
                    ];

                    const categoriesToDisplay = orderedCats.reduce<string[]>((acc, cat) => {
                      if (!acc.some(a => a.toLowerCase() === cat.toLowerCase())) {
                        acc.push(cat);
                      }
                      return acc;
                    }, []);

                    return categoriesToDisplay.map((cat) => {
                      const catMaterials = materialsWithResolvedCat.filter(
                        m => m.resolvedCat.toLowerCase() === cat.toLowerCase()
                      );
                      if (catMaterials.length === 0) return null;

                      const catTotal = catMaterials.reduce((acc, m) => acc + getMaterialCost(m), 0);

                      return (
                        <button
                          key={cat}
                          type="button"
                          className="w-full flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3.5 hover:border-brand-200 hover:shadow-sm active:scale-[0.99] transition-all text-left"
                          onClick={() => handleViewCategory(cat)}
                        >
                          <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-[#1A1A2E] uppercase text-sm tracking-wide truncate">{cat}</p>
                            <p className="text-[11px] font-bold text-gray-400 mt-0.5">{catMaterials.length} item · {formatCurrency(catTotal, true)}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                        </button>
                      );
                    });
                  })()}
                  {activeHppVariant.bahan.length === 0 && (
                    <div className="text-center py-12 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
                      <Calculator className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-400 font-bold">Belum ada bahan baku.</p>
                      <Button variant="link" className="text-primary font-bold" onClick={handleAddMaterial}>
                        Tambah bahan sekarang
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="border-none shadow-sm rounded-3xl bg-white overflow-hidden">
                <div className={cn(
                  "p-6 text-white transition-colors duration-500",
                  (activeHppVariant.harga_jual < calculateHpp(activeHppVariant.bahan, activeHppVariant.harga_packing, activeHppVariant.qty_batch)) 
                    ? "bg-red-500" 
                    : "orange-gradient"
                )}>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">HPP Produk / pcs</p>
                  <h3 className="text-3xl font-black mt-1">
                    {formatCurrency(calculateHpp(activeHppVariant.bahan, activeHppVariant.harga_packing, activeHppVariant.qty_batch), true)}
                  </h3>
                  <div className="mt-4 flex items-center gap-2">
                    <Badge className="bg-white/20 text-white border-none font-bold">
                      {activeHppVariant.qty_batch} pcs / produksi
                    </Badge>
                    {activeHppVariant.harga_jual < calculateHpp(activeHppVariant.bahan, activeHppVariant.harga_packing, activeHppVariant.qty_batch) && (
                      <Badge className="bg-white text-red-600 border-none font-black animate-pulse">
                        RUGI!
                      </Badge>
                    )}
                  </div>
                </div>
                <CardContent className="p-6 space-y-4 font-medium">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 font-bold">Total HPP per Produksi</span>
                    <span className="font-black text-gray-900">
                      {formatCurrency(calculateBatchHpp(activeHppVariant.bahan, activeHppVariant.harga_packing), true)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-dashed border-gray-100 mt-2 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 font-bold">Komponen / pcs</span>
                      <span className="font-black text-gray-900">
                        {formatCurrency(calculateMaterialsPerPcs(activeHppVariant.bahan, activeHppVariant.qty_batch), true)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 font-bold">Gaji / pcs</span>
                      <span className="font-black text-gray-900">
                        {formatCurrency((Number(activeHppVariant.harga_packing) || 0) / (Number(activeHppVariant.qty_batch) || 1), true)}
                      </span>
                    </div>
                    {(() => {
                      const allFees = [
                        ...(selectedProduct?.biaya_lain || []),
                        ...(activeHppVariant.biaya_lain || [])
                      ];
                      if (allFees.length === 0) return null;
                      const econ = calculateProductEconomics({
                        sellingPrice: activeHppVariant.harga_jual,
                        hppPcs: 0,
                        minOrder: Number(activeHppVariant.min_order) || 1,
                        additionalCosts: allFees,
                      });
                      return (
                        <div className="pt-2 border-t border-dashed border-gray-100 space-y-1.5">
                          <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Biaya Tambahan / pcs</p>
                          {econ.feeBreakdown.map((fee, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs">
                              <span className="text-gray-500 font-medium truncate max-w-[150px]">
                                {fee.nama} {fee.tipe === 'persen' && `(${fee.nilai}%)`}
                              </span>
                              <span className="font-bold text-amber-600">
                                {formatCurrency(fee.nominalPerUnit, true)}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="pt-3 border-t border-dashed border-gray-100 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-gray-700">Harga Jual (Transaksi)</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-gray-400">Rp</span>
                        <Input 
                          type="number"
                          value={activeHppVariant.harga_jual}
                          onChange={(e) => {
                            const newHj = parseInt(e.target.value) || 0;
                            let newHc = activeHppVariant.harga_coret;
                            let newDisc = activeHppVariant.diskon_persen;
                            if (newHc && newHc > newHj) {
                              newDisc = Number((((newHc - newHj) / newHc) * 100).toFixed(2));
                            } else if (newDisc && newDisc > 0 && newDisc < 100) {
                              newHc = Math.round(newHj / (1 - newDisc / 100));
                            }
                            setActiveHppVariant({
                              ...activeHppVariant,
                              harga_jual: newHj,
                              harga_coret: newHc,
                              diskon_persen: newDisc
                            });
                          }}
                          className="w-28 h-8 font-black text-right rounded-lg border-gray-200"
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-gray-500">Harga Coret</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-gray-400">Rp</span>
                        <Input 
                          type="number"
                          value={activeHppVariant.harga_coret || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const valNum = parseInt(e.target.value) || 0;
                            if (valNum <= 0) {
                              setActiveHppVariant({ ...activeHppVariant, harga_coret: undefined, diskon_persen: undefined });
                            } else if (valNum <= activeHppVariant.harga_jual) {
                              toast.error("Harga Coret harus lebih tinggi dari Harga Jual.");
                              setActiveHppVariant({ ...activeHppVariant, harga_coret: valNum, diskon_persen: undefined });
                            } else {
                              const newDisc = Number((((valNum - activeHppVariant.harga_jual) / valNum) * 100).toFixed(2));
                              setActiveHppVariant({ ...activeHppVariant, harga_coret: valNum, diskon_persen: newDisc });
                            }
                          }}
                          className="w-28 h-8 font-bold text-right rounded-lg border-gray-200"
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-gray-500">Diskon (%)</span>
                      <div className="flex items-center gap-1.5">
                        <Input 
                          type="number"
                          step="0.01"
                          value={activeHppVariant.diskon_persen || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const valNum = parseFloat(e.target.value) || 0;
                            if (valNum <= 0 || valNum >= 100) {
                              setActiveHppVariant({ ...activeHppVariant, diskon_persen: undefined, harga_coret: undefined });
                            } else {
                              const newHc = Math.round(activeHppVariant.harga_jual / (1 - valNum / 100));
                              setActiveHppVariant({ ...activeHppVariant, diskon_persen: valNum, harga_coret: newHc });
                            }
                          }}
                          className="w-20 h-8 font-bold text-right rounded-lg border-gray-200"
                        />
                        <span className="text-xs font-bold text-gray-400">%</span>
                      </div>
                    </div>

                    {activeHppVariant.harga_coret && activeHppVariant.harga_coret > activeHppVariant.harga_jual && (
                      <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-800 font-medium">
                        🏷️ Hemat {formatCurrency(activeHppVariant.harga_coret - activeHppVariant.harga_jual)} ({activeHppVariant.diskon_persen}% off)
                      </div>
                    )}
                  </div>
                  {(() => {
                    const hppBase = calculateHpp(activeHppVariant.bahan, activeHppVariant.harga_packing, activeHppVariant.qty_batch);
                    const allFees = [
                      ...(selectedProduct?.biaya_lain || []),
                      ...(activeHppVariant.biaya_lain || [])
                    ];
                    const econ = calculateProductEconomics({
                      sellingPrice: activeHppVariant.harga_jual,
                      hppPcs: hppBase,
                      minOrder: Number(activeHppVariant.min_order) || 1,
                      additionalCosts: allFees,
                    });
                    const labaBersih = econ.profitBeforeAdsPerUnit;
                    const marginProfit = econ.marginBeforeAdsPct;
                    return (
                      <div className="pt-4 border-t border-dashed border-gray-100">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-bold text-gray-500 uppercase">Laba Bersih / pcs</span>
                          <span className={cn(
                            "text-lg font-black",
                            labaBersih >= 0 ? "text-green-600" : "text-red-600"
                          )}>
                            {formatCurrency(labaBersih, true)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">Margin Profit</span>
                          <Badge className={cn(
                            "border-none font-black text-sm px-3",
                            marginProfit >= 0
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          )}>
                            {marginProfit.toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                    );
                  })()}
                  <Button 
                    onClick={handleSaveHpp}
                    disabled={isSaving}
                    className="w-full mt-4 orange-gradient text-white font-bold h-12 rounded-2xl shadow-lg shadow-brand-200 gap-2 active:scale-95 transition-all hover:shadow-xl"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Menyimpan...' : 'Simpan Data HPP'}
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm rounded-3xl bg-blue-50">
                <CardContent className="p-6 flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-blue-800">Tips Optimasi</p>
                    <p className="text-[10px] text-blue-600 leading-relaxed mt-1">
                      Gunakan bahan baku berkualitas dengan harga grosir untuk menekan HPP. Pastikan margin minimal 30-40% untuk keberlanjuan usaha.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: CATEGORY DETAIL */}
      {view === 'category' && activeHppVariant && selectedCategory && (() => {
        const catMaterials = activeHppVariant.bahan
          .map((m, originalIdx) => ({
            ...m,
            originalIdx,
            resolvedCat: resolveCategoryName(m.kelompok, settings?.kategori_hpp)
          }))
          .filter(m => m.resolvedCat.toLowerCase() === selectedCategory.toLowerCase());
        const catTotal = catMaterials.reduce((acc, m) => acc + getMaterialCost(m), 0);

        return (
          <div className="space-y-4">
            {/* Category summary card */}
            <Card className="border-none shadow-sm rounded-3xl bg-white overflow-hidden">
              <div className="orange-gradient p-5 text-white">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{selectedCategory}</p>
                <h3 className="text-2xl font-black mt-1">{formatCurrency(catTotal, true)}</h3>
                <p className="text-xs opacity-70 mt-1">{catMaterials.length} item dalam kategori ini</p>
              </div>
            </Card>

            {/* Item list */}
            <Card className="border-none shadow-sm rounded-3xl bg-white">
              <CardHeader className="flex flex-row items-start justify-between pb-2 gap-2">
                <div>
                  <CardTitle className="text-base font-bold">Daftar Item</CardTitle>
                  <CardDescription>{selectedProduct?.nama} › {activeHppVariant.nama} › {selectedCategory}</CardDescription>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50"
                    title={`Hapus semua item di ${selectedCategory}`}
                    onClick={() => { handleRemoveCategory(selectedCategory); }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    className="orange-gradient text-white font-bold rounded-xl gap-1 h-8 px-3"
                    onClick={handleAddMaterial}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="text-xs">Tambah</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="space-y-3">
                  {catMaterials.length === 0 && (
                    <div className="text-center py-10 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
                      <Package className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                      <p className="text-gray-400 font-bold text-sm">Belum ada item di kategori ini.</p>
                      <Button variant="link" className="text-primary font-bold text-sm" onClick={handleAddMaterial}>
                        Tambah sekarang
                      </Button>
                    </div>
                  )}
                  {catMaterials.map((m) => {
                    const ingredient = ingredients.find(i => i.id === m.ingredientId);
                    const displayName = ingredient ? ingredient.name : m.nama;
                    const displayCat = ingredient ? ingredient.category : m.kelompok;
                    const displayPrice = ingredient ? ingredient.price : m.harga;
                    const displayUnit = ingredient ? ingredient.unit : m.satuan;

                    return (
                      <div key={m.originalIdx} className="bg-gray-50 border border-gray-100 rounded-2xl p-4 hover:border-brand-200 transition-all">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-black text-[#1A1A2E] truncate pr-2">{displayName}</h4>
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge className="bg-white text-primary border border-brand-100 text-[9px] font-bold uppercase">
                                {displayCat}
                              </Badge>
                              <span className="text-[10px] font-bold text-gray-400">
                                {formatSmartUnit(m.qty, displayUnit)}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-black text-primary">
                              {formatCurrency(getMaterialCost(m), true)}
                            </p>
                            <div className="flex gap-1 mt-2 justify-end">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50"
                                onClick={() => {
                                  setEditingMaterial({
                                    variantId: activeHppVariant.id,
                                    index: m.originalIdx,
                                    material: {
                                      ...m,
                                      nama: displayName,
                                      kelompok: displayCat,
                                      harga: displayPrice,
                                      satuan: displayUnit,
                                    },
                                  });
                                  setIsMaterialModalOpen(true);
                                }}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
                                onClick={() => handleRemoveMaterial(m.originalIdx)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* MODALS */}
      <Dialog open={isProductModalOpen} onOpenChange={(open) => {
        setIsProductModalOpen(open);
        if (!open) setEditingProduct(null);
      }}>
        <DialogContent className="rounded-[2rem] border-none max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">{editingProduct ? 'Edit Produk' : 'Tambah Produk Baru'}</DialogTitle>
            <DialogDescription>Masukkan informasi produk utama di sini.</DialogDescription>
          </DialogHeader>
          <form key={editingProduct?.id || 'new-product'} onSubmit={handleSaveProduct} className="space-y-4 py-4">
            {/* Foto Produk */}
            <div className="space-y-2">
              <Label className="font-bold">Foto Produk</Label>
              {user && (
                <div className="flex items-start gap-4 p-3 bg-gray-50/80 rounded-2xl border border-gray-100">
                  <ProductPhotoUpload
                    productId={editingProduct?.id}
                    userId={user.uid}
                    currentFoto={productPhoto}
                    size="md"
                    showActions={true}
                    onUploaded={url => setProductPhoto(url)}
                    onRemove={() => setProductPhoto('')}
                  />
                  <div className="text-xs text-gray-500 space-y-1 self-center">
                    <p className="font-bold text-gray-700">Pilih atau Ambil Foto Produk</p>
                    <p className="text-[11px] text-gray-400">Format: JPG, PNG, WebP. Otomatis dikompres & disimpan.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sku" className="font-bold text-primary">SKU</Label>
                <Input id="sku" name="sku" defaultValue={editingProduct?.sku || ''} placeholder="Contoh: PRD-001" className="rounded-xl border-primary bg-primary/5 focus:ring-primary font-bold h-12" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nama" className="font-bold">Nama Produk</Label>
                <Input id="nama" name="nama" defaultValue={editingProduct?.nama || ''} placeholder="Contoh: Kaos Polos" required className="rounded-xl h-12" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deskripsi" className="font-bold">Deskripsi (Opsional)</Label>
              <Input id="deskripsi" name="deskripsi" defaultValue={editingProduct?.deskripsi || ''} placeholder="Contoh: Produk dengan berbagai pilihan varian" className="rounded-xl" />
            </div>

            <div className="space-y-3 pt-2 border-t border-dashed border-gray-100">
              <div className="flex items-center justify-between">
                <Label className="font-bold text-sm">Pajak / Biaya Tambahan</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddFee} className="rounded-xl h-8 gap-1 text-xs border-primary text-primary hover:bg-brand-50">
                  <Plus className="w-3 h-3" />
                  Tambah Biaya
                </Button>
              </div>
              
              <div className="space-y-3 max-h-[200px] overflow-y-auto px-1 custom-scrollbar">
                {productFees.length === 0 && (
                  <p className="text-xs text-gray-400 italic text-center py-2">Belum ada biaya tambahan</p>
                )}
                {productFees.map((fee, index) => (
                  <div key={index} className="flex items-center gap-2 bg-gray-50 p-3 rounded-2xl border border-gray-100 group relative">
                    <div className="flex-1 space-y-2">
                      <Input 
                        placeholder="Nama Biaya (Contoh: Biaya Admin)" 
                        value={fee.nama} 
                        onChange={(e) => handleUpdateFee(index, 'nama', e.target.value)}
                        className="h-8 text-xs rounded-lg border-gray-200"
                        required
                      />
                      <div className="flex gap-2">
                        <select 
                          value={fee.tipe} 
                          onChange={(e) => handleUpdateFee(index, 'tipe', e.target.value)}
                          className="h-8 text-xs rounded-lg border border-gray-200 bg-white px-2 focus:outline-none focus:ring-1 focus:ring-primary w-24"
                        >
                          <option value="persen">% Persen</option>
                          <option value="nominal">Rp Nominal</option>
                        </select>
                        <Input 
                          type="number" 
                          step="0.01"
                          placeholder="Nilai" 
                          value={fee.nilai} 
                          onChange={(e) => handleUpdateFee(index, 'nilai', parseFloat(e.target.value) || 0)}
                          className="h-8 text-xs rounded-lg border-gray-200"
                          required
                        />
                      </div>
                    </div>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleRemoveFee(index)}
                      className="h-8 w-8 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row gap-3">
              <DialogClose render={<Button type="button" variant="ghost" className="rounded-xl font-bold w-full sm:w-auto h-12">Batal</Button>} />
              <Button type="submit" disabled={isSaving} className="bg-primary hover:bg-primary/90 text-white rounded-xl font-bold w-full sm:w-auto h-12 px-8 shadow-lg shadow-brand-100">
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Menyimpan...
                  </span>
                ) : 'Simpan Produk'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isVariantModalOpen} onOpenChange={(open) => {
        setIsVariantModalOpen(open);
        if (!open) setEditingVariant(null);
      }}>
        <DialogContent className="rounded-[2rem] border-none max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">{editingVariant ? 'Edit Varian' : 'Tambah Varian Baru'}</DialogTitle>
            <DialogDescription>Masukkan detail varian untuk produk {selectedProduct?.nama}.</DialogDescription>
          </DialogHeader>
          <form key={editingVariant?.id || 'new-variant'} onSubmit={handleSaveVariant} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nama" className="font-bold">Nama Varian</Label>
              <Input id="nama" name="nama" defaultValue={editingVariant?.nama || ''} placeholder="Contoh: Ayam Ori" required className="rounded-xl h-12" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku" className="font-bold">SKU Varian <span className="text-gray-400 font-medium">(opsional)</span></Label>
              <Input id="sku" name="sku" defaultValue={editingVariant?.sku || ''} placeholder="Nomor Referensi SKU dari marketplace" className="rounded-xl h-12" />
              <p className="text-[11px] text-gray-400 font-medium">Untuk mencocokkan otomatis saat import XLS marketplace.</p>
            </div>
            <VariantPricingSection editingVariant={editingVariant} />
            <div className="space-y-2">
              <Label htmlFor="harga_packing" className="font-bold">Gaji / pack</Label>
              <Input id="harga_packing" name="harga_packing" type="number" defaultValue={editingVariant?.harga_packing || 12000} required className="rounded-xl" />
            </div>
            {(() => {
              const v = editingVariant;
              const materials = v ? v.bahan.reduce((a, b) => a + getMaterialCost(b), 0) : 0;
              const qb = Math.max(1, v?.qty_batch || 1);
              const matPerPcs = materials / qb;
              const hj = v?.harga_jual || 0;
              const hp = v?.harga_packing || 0;
              const margin = hj - matPerPcs;
              const suggested = margin > 0 ? Math.max(1, Math.ceil(hp / margin)) : null;
              const defaultMin = v?.min_order ?? (suggested || 1);
              return (
                <div className="space-y-2">
                  <Label htmlFor="min_order" className="font-bold">Minimal Order (pcs)</Label>
                  <Input id="min_order" name="min_order" type="number" min={1} defaultValue={defaultMin} required className="rounded-xl h-12" />
                  {suggested !== null ? (
                    <p className="text-[11px] text-gray-500 font-medium">
                      Saran logis: <span className="font-bold text-primary">{suggested} pcs</span> — agar biaya gaji 1 pack ({formatCurrency(hp, true)}) tertutup oleh margin per pcs ({formatCurrency(margin, true)}).
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-600 font-medium">
                      Margin per pcs masih rugi. Naikkan harga jual atau turunkan biaya bahan dulu.
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="space-y-3 pt-2 border-t border-dashed border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-bold text-sm">Pajak / Biaya Tambahan</Label>
                  <p className="text-[11px] text-gray-400 font-medium">Biaya per unit (cth: Fee marketplace, Pajak)</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleAddVariantFee} className="rounded-xl h-8 gap-1 text-xs border-primary text-primary hover:bg-brand-50">
                  <Plus className="w-3 h-3" />
                  Tambah Biaya
                </Button>
              </div>
              
              <div className="space-y-3 max-h-[200px] overflow-y-auto px-1 custom-scrollbar">
                {variantFees.length === 0 && (
                  <p className="text-xs text-gray-400 italic text-center py-2">Belum ada biaya tambahan untuk varian ini</p>
                )}
                {variantFees.map((fee, index) => (
                  <div key={index} className="flex items-center gap-2 bg-gray-50 p-3 rounded-2xl border border-gray-100 group relative">
                    <div className="flex-1 space-y-2">
                      <Input 
                        placeholder="Nama Biaya (Contoh: Admin Shopee)" 
                        value={fee.nama} 
                        onChange={(e) => handleUpdateVariantFee(index, 'nama', e.target.value)}
                        className="h-8 text-xs rounded-lg border-gray-200"
                        required
                      />
                      <div className="flex gap-2">
                        <select 
                          value={fee.tipe} 
                          onChange={(e) => handleUpdateVariantFee(index, 'tipe', e.target.value as 'persen' | 'nominal')}
                          className="h-8 text-xs rounded-lg border border-gray-200 bg-white px-2 focus:outline-none focus:ring-1 focus:ring-primary w-24 font-bold"
                        >
                          <option value="persen">% Persen</option>
                          <option value="nominal">Rp Nominal</option>
                        </select>
                        <Input 
                          type="number" 
                          step="any"
                          placeholder="Nilai" 
                          value={fee.nilai || ''} 
                          onChange={(e) => handleUpdateVariantFee(index, 'nilai', parseFloat(e.target.value) || 0)}
                          className="h-8 text-xs rounded-lg border-gray-200 font-bold"
                          required
                        />
                      </div>
                    </div>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleRemoveVariantFee(index)}
                      className="text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl h-8 w-8 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row gap-3">
              <DialogClose render={<Button type="button" variant="ghost" className="rounded-xl font-bold w-full sm:w-auto h-12">Batal</Button>} />
              <Button type="submit" disabled={isSaving} className="bg-primary hover:bg-primary/90 text-white rounded-xl font-bold w-full sm:w-auto h-12 px-8 shadow-lg shadow-brand-100 active:scale-95 transition-all">
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Menyimpan...
                  </span>
                ) : 'Simpan Varian'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={isMaterialModalOpen} onOpenChange={(open) => {
        if (!open) {
          // If closing without saving (cancel), remove the empty material that was just added
          if (editingMaterial && !editingMaterial.material.nama && activeHppVariant) {
            const cleaned = activeHppVariant.bahan.filter((_, i) => i !== editingMaterial.index);
            setActiveHppVariant({ ...activeHppVariant, bahan: cleaned });
          }
          setEditingMaterial(null);
        }
        setIsMaterialModalOpen(open);
      }}>
        <DialogContent className="rounded-[2rem] border-none max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Edit Komponen</DialogTitle>
            <DialogDescription>Sesuaikan rincian komponen untuk perhitungan HPP.</DialogDescription>
          </DialogHeader>
          <form key={editingMaterial ? `mat-${editingMaterial.variantId}-${editingMaterial.index}` : 'new-material'} onSubmit={handleSaveMaterial} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="font-bold">Nama Bahan</Label>
              <Popover open={isMaterialPopoverOpen} onOpenChange={setIsMaterialPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full justify-between rounded-xl h-12 font-medium border-gray-100",
                      !editingMaterial?.material.nama && "text-muted-foreground"
                    )}
                  >
                    {editingMaterial?.material.nama || "Pilih atau cari komponen..."}
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4 text-gray-400" />
                    </div>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 rounded-2xl border-none shadow-2xl" align="start">
                  <Command className="rounded-2xl border-none">
                    <CommandInput placeholder="Cari komponen..." className="h-12" />
                    <CommandList className="max-h-[300px] custom-scrollbar">
                      <CommandEmpty>
                        <div className="p-4 text-center">
                          <p className="text-sm text-gray-500 mb-2">Komponen tidak ditemukan.</p>
                          <Button 
                            variant="link" 
                            className="text-primary font-bold h-auto p-0"
                            onClick={() => {
                              const input = document.querySelector('[cmdk-input]') as HTMLInputElement;
                              const newName = input?.value || "Komponen Baru";
                              setEditingMaterial(prev => prev ? {
                                ...prev,
                                material: { ...prev.material, nama: newName }
                              } : null);
                              setIsMaterialPopoverOpen(false);
                            }}
                          >
                            + Tambah sebagai komponen baru
                          </Button>
                        </div>
                      </CommandEmpty>
                      <CommandGroup heading="Komponen Tersedia">
                        {ingredients.map((i) => (
                          <CommandItem
                            key={i.id}
                            value={i.name}
                            onSelect={() => {
                              setEditingMaterial(prev => prev ? {
                                ...prev,
                                material: {
                                  ...prev.material,
                                  nama: i.name,
                                  kelompok: i.category,
                                  satuan: i.unit,
                                  harga: i.price,
                                  ingredientId: i.id
                                }
                              } : null);
                              setIsMaterialPopoverOpen(false);
                            }}
                            className="font-medium p-3"
                          >
                            <div className="flex flex-col">
                              <span className="font-bold text-gray-900">{i.name}</span>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-[9px] border-none bg-brand-50 text-brand-600 px-1.5 font-bold uppercase tracking-wider">
                                  {i.category}
                                </Badge>
                                <span className="text-[10px] text-gray-400 font-bold">{formatCurrency(i.price)} / {i.unit}</span>
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <input type="hidden" name="nama" value={editingMaterial?.material.nama || ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mat-kelompok" className="font-bold">Kelompok</Label>
              <select 
                id="mat-kelompok" 
                name="kelompok" 
                value={selectedKelompok}
                onChange={(e) => setSelectedKelompok(e.target.value)}
                className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary font-medium"
              >
                {settings?.kategori_hpp.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
                {editingMaterial?.material.kelompok && !settings?.kategori_hpp.includes(editingMaterial.material.kelompok) && editingMaterial.material.kelompok !== 'Lainnya' && (
                  <option value={editingMaterial.material.kelompok}>{editingMaterial.material.kelompok}</option>
                )}
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mat-qty" className="font-bold text-primary">Jumlah per Batch</Label>
                <Input 
                  id="mat-qty" 
                  name="qty" 
                  type="number" 
                  step="0.0001" 
                  placeholder="Jumlah untuk 1 produksi"
                  value={editingMaterial ? fromBaseValue(editingMaterial.material.qty, editingMaterial.material.satuan) : 0}
                  onChange={(e) => {
                    const newVal = parseFloat(e.target.value) || 0;
                    setEditingMaterial(prev => {
                      if (!prev) return null;
                      const baseQty = toBaseValue(newVal, prev.material.satuan);
                      return {
                        ...prev,
                        material: { ...prev.material, qty: baseQty }
                      };
                    });
                  }}
                  required 
                  className="rounded-xl border-primary bg-primary/5 focus:ring-primary font-bold" 
                />
                <p className="text-[10px] text-gray-400 font-medium italic">Masukkan jumlah yang digunakan untuk {activeHppVariant?.qty_batch || 1} pcs (1 produksi).</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mat-satuan" className="font-bold">Satuan</Label>
                <select 
                  id="mat-satuan" 
                  name="satuan" 
                  value={editingMaterial?.material.satuan || 'gram'}
                  onChange={(e) => {
                    const newSatuan = e.target.value;
                    setEditingMaterial(prev => {
                      if (!prev) return null;
                      // When unit changes, we keep the semantic value if possible or just update the unit
                      return {
                        ...prev, 
                        material: { ...prev.material, satuan: newSatuan }
                      };
                    });
                  }}
                  className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary font-bold"
                >
                  {settings?.satuan_unit.map(u => (
                    <option key={u} value={u.toLowerCase()}>{u}</option>
                  ))}
                  {!settings?.satuan_unit.map(u => u.toLowerCase()).includes(editingMaterial?.material.satuan?.toLowerCase() || '') && editingMaterial?.material.satuan && (
                    <option value={editingMaterial.material.satuan}>{editingMaterial.material.satuan}</option>
                  )}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mat-harga" className="font-bold">Harga per Satuan (Rp)</Label>
              <Input 
                id="mat-harga" 
                name="harga" 
                type="number" 
                step="0.01" 
                value={editingMaterial ? fromBaseValue(editingMaterial.material.harga, editingMaterial.material.satuan) * getConversionRate(editingMaterial.material.satuan) : 0}
                onChange={(e) => {
                   const newVal = parseFloat(e.target.value) || 0;
                   setEditingMaterial(prev => {
                     if (!prev) return null;
                     const basePrice = newVal / getConversionRate(prev.material.satuan);
                     return {
                       ...prev,
                       material: { ...prev.material, harga: basePrice }
                     };
                   });
                }}
                required 
                className="rounded-xl font-bold" 
              />
            </div>
            <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row gap-3">
              <DialogClose render={<Button type="button" variant="ghost" className="rounded-xl font-bold w-full sm:w-auto h-12">Batal</Button>} />
              <Button type="submit" disabled={isSaving} className="bg-primary hover:bg-primary/90 text-white rounded-xl font-bold w-full sm:w-auto h-12 px-8 shadow-lg shadow-brand-100 active:scale-95 transition-all">
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Menyimpan...
                  </span>
                ) : 'Simpan Bahan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={isDeleteMaterialConfirmOpen} onOpenChange={setIsDeleteMaterialConfirmOpen}>
        <DialogContent className="rounded-3xl border-none">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Konfirmasi Hapus</DialogTitle>
            <DialogDescription className="font-medium">
              Bahan ini juga akan dihapus dari Stok. Lanjutkan?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row gap-3">
            <DialogClose render={<Button variant="outline" className="rounded-xl font-bold h-12 w-full sm:w-auto">Batal</Button>} />
            <Button onClick={confirmRemoveMaterial} className="bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl h-12 w-full sm:w-auto px-8">
              Hapus Bahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isDeleteCategoryConfirmOpen} onOpenChange={setIsDeleteCategoryConfirmOpen}>
        <DialogContent className="rounded-3xl border-none">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Konfirmasi Hapus Kelompok</DialogTitle>
            <DialogDescription className="font-medium">
              Semua bahan dalam kelompok "{categoryToDelete}" juga akan dihapus dari Stok. Lanjutkan?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 flex flex-col-reverse sm:flex-row gap-3">
            <DialogClose render={<Button variant="outline" className="rounded-xl font-bold h-12 w-full sm:w-auto">Batal</Button>} />
            <Button onClick={confirmRemoveCategory} className="bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl h-12 w-full sm:w-auto px-8">
              Hapus Kelompok
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PasteHppDialog
        open={isPasteHppOpen}
        onOpenChange={setIsPasteHppOpen}
        productName={selectedProduct?.nama || ''}
        kategoriHpp={settings?.kategori_hpp || []}
        ingredients={ingredients}
        onConfirm={handlePasteHppConfirm}
      />
    </div>
  );
}
