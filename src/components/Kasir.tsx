import React from 'react';
import {
  Search, ShoppingCart, Plus, Minus, Trash2, X, Printer,
  Tag, CreditCard, Banknote, CheckCircle2, Package, ChevronRight,
  RotateCcw, Receipt
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { Product, Ingredient, StoreSettings } from '../types';
import { User, db, doc, writeBatch, serverTimestamp, increment, sanitizeData } from '../lib/firebase';

type CartItem = {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  hargaJual: number;
  qty: number;
};

type DiscountMode = 'flat' | 'persen';
type PaymentMethod = 'tunai' | 'nontunai';
type Step = 'order' | 'checkout' | 'receipt';

type ReceiptData = {
  txId: string;
  tanggal: string;
  jam: string;
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  discountMode: DiscountMode;
  discountValue: number;
  taxAmount: number;
  taxPct: number;
  nominal: number;
  paymentMethod: PaymentMethod;
  cashPaid: number;
  kembalian: number;
};

interface KasirProps {
  user: User;
  products: Product[];
  ingredients: Ingredient[];
  setIngredients: React.Dispatch<React.SetStateAction<Ingredient[]>>;
  storeSettings: StoreSettings;
  onNavigate?: (tab: string) => void;
}

function formatRp(n: number) {
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export default function Kasir({ user, products, ingredients, setIngredients, storeSettings, onNavigate }: KasirProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [step, setStep] = React.useState<Step>('order');
  const [showCartMobile, setShowCartMobile] = React.useState(false);
  const [discountMode, setDiscountMode] = React.useState<DiscountMode>('flat');
  const [discountValue, setDiscountValue] = React.useState(0);
  const [taxPct, setTaxPct] = React.useState(0);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>('tunai');
  const [cashPaid, setCashPaid] = React.useState(0);
  const [isSaving, setIsSaving] = React.useState(false);
  const [receipt, setReceipt] = React.useState<ReceiptData | null>(null);
  const cashInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const style = document.createElement('style');
    style.id = 'kasir-print-style';
    style.textContent = `
      @media print {
        body > * { display: none !important; }
        #kasir-receipt-print { display: block !important; position: fixed; top: 0; left: 0; width: 100%; background: white; z-index: 9999; padding: 16px; box-sizing: border-box; }
        #kasir-receipt-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById('kasir-print-style')?.remove(); };
  }, []);

  const visibleProducts = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter(p =>
      p.varian.some(v => v.harga_jual > 0) &&
      (q === '' || p.nama.toLowerCase().includes(q) || p.varian.some(v => v.nama.toLowerCase().includes(q)))
    );
  }, [products, searchQuery]);

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const subtotal = cart.reduce((s, i) => s + i.hargaJual * i.qty, 0);
  const discountAmount = discountMode === 'flat'
    ? Math.min(discountValue, subtotal)
    : subtotal * (Math.min(Math.max(0, discountValue), 100) / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * (Math.max(0, taxPct) / 100);
  const total = afterDiscount + taxAmount;
  const kembalian = Math.max(0, cashPaid - total);

  const addToCart = (product: Product, variant: { id: string; nama: string; harga_jual: number }) => {
    setCart(prev => {
      const existing = prev.find(i => i.variantId === variant.id);
      if (existing) return prev.map(i => i.variantId === variant.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, {
        productId: product.id,
        productName: product.nama,
        variantId: variant.id,
        variantName: variant.nama,
        hargaJual: variant.harga_jual,
        qty: 1
      }];
    });
  };

  const updateQty = (variantId: string, delta: number) => {
    setCart(prev => prev.map(i => i.variantId === variantId ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));
  };

  const removeFromCart = (variantId: string) => setCart(prev => prev.filter(i => i.variantId !== variantId));

  const clearCart = () => {
    setCart([]);
    setDiscountValue(0);
    setTaxPct(0);
    setCashPaid(0);
    setStep('order');
    setShowCartMobile(false);
  };

  const handleOpenCheckout = () => {
    if (cart.length === 0) { toast.error('Keranjang kosong'); return; }
    setShowCartMobile(false);
    setStep('checkout');
    setTimeout(() => cashInputRef.current?.focus(), 300);
  };

  const saveKasirSale = async () => {
    if (!user || cart.length === 0) return;
    if (paymentMethod === 'tunai' && cashPaid < total) {
      toast.error('Uang yang dibayar kurang dari total'); return;
    }
    setIsSaving(true);
    try {
      const ingredientIdMap = new Map(ingredients.map(i => [i.id, i]));
      const snapshotArr: { ingredientId: string; stockBefore: number; delta: number }[] = [];
      const stockUpdates: { id: string; delta: number }[] = [];
      let totalHpp = 0;

      const detailMap = new Map<string, { produk_id: string; produk_nama: string; varian: any[] }>();
      cart.forEach(item => {
        if (!detailMap.has(item.productId)) {
          detailMap.set(item.productId, { produk_id: item.productId, produk_nama: item.productName, varian: [] });
        }
        detailMap.get(item.productId)!.varian.push({
          varian_id: item.variantId,
          varian_nama: item.variantName,
          qty: item.qty,
          harga_jual: item.hargaJual,
          hpp_pcs: 0
        });
      });

      detailMap.forEach((pd, produkId) => {
        const product = products.find(p => p.id === produkId);
        if (!product) return;
        pd.varian.forEach((pv: any) => {
          const variant = product.varian.find(v => v.id === pv.varian_id);
          if (!variant) return;
          const batchSize = Number(variant.qty_batch) || 1;
          const packingPcs = (variant.harga_packing || 0) / batchSize;
          let materialsPcs = 0;
          variant.bahan?.forEach(bahan => {
            let ing = bahan.ingredientId ? ingredientIdMap.get(bahan.ingredientId) : null;
            if (!ing && bahan.nama) ing = ingredients.find(i => i.name.toLowerCase().trim() === bahan.nama!.toLowerCase().trim());
            if (!ing) return;
            let usageRaw = Number(bahan.qty) || 0;
            const iUnit = ing.unit.toLowerCase().trim();
            const bUnit = (bahan.satuan || '').toLowerCase().trim();
            if ((bUnit === 'gram' || bUnit === 'gr' || bUnit === 'g') && (iUnit === 'kg' || iUnit === 'kilogram')) usageRaw /= 1000;
            else if ((bUnit === 'ml' || bUnit === 'mili') && (iUnit === 'liter' || iUnit === 'lt' || iUnit === 'l')) usageRaw /= 1000;
            const usagePerPcs = usageRaw / batchSize;
            const totalUsage = usagePerPcs * pv.qty;
            materialsPcs += (usageRaw / batchSize) * (ing.price || 0);
            totalHpp += totalUsage * (ing.price || 0);
            const delta = -totalUsage;
            const es = snapshotArr.find(s => s.ingredientId === ing!.id);
            if (es) es.delta += delta; else snapshotArr.push({ ingredientId: ing!.id, stockBefore: ing!.currentStock || 0, delta });
            const eu = stockUpdates.find(u => u.id === ing!.id);
            if (eu) eu.delta += delta; else stockUpdates.push({ id: ing!.id, delta });
          });
          pv.hpp_pcs = packingPcs + materialsPcs;
          totalHpp += packingPcs * pv.qty;
        });
      });

      const txId = Math.random().toString(36).substr(2, 9);
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const qtyTotal = cart.reduce((s, i) => s + i.qty, 0);
      const names = cart.map(i =>
        `${i.productName}${i.variantName && i.variantName !== i.productName ? ` (${i.variantName})` : ''} ×${i.qty}`
      ).join(', ');

      const txToSave: any = {
        id: txId,
        userId: user.uid,
        tanggal: today,
        keterangan: `Kasir: ${names}`,
        kategori: 'Penjualan',
        jenis: 'Pemasukan',
        type: 'pemasukan',
        nominal: total,
        subtotal,
        total_penjualan: subtotal,
        total_biaya: taxAmount,
        diskon: discountAmount,
        diskon_tipe: discountMode,
        diskon_nilai: discountValue,
        pajak_pct: taxPct,
        laba: total - totalHpp,
        totalHpp,
        qty_total: qtyTotal,
        qty_beli: 0,
        payment_method: paymentMethod,
        ...(paymentMethod === 'tunai' ? { cash_paid: cashPaid, kembalian } : {}),
        createdAt: serverTimestamp(),
        stockSnapshot: snapshotArr.length > 0 ? snapshotArr : null,
        penjualan_detail: Array.from(detailMap.values())
      };

      if (stockUpdates.length > 0) {
        setIngredients(prev => prev.map(ing => {
          const upd = stockUpdates.find(u => u.id === ing.id);
          return upd ? { ...ing, currentStock: (ing.currentStock || 0) + upd.delta } : ing;
        }));
      }

      const batch = writeBatch(db);
      batch.set(doc(db, `users/${user.uid}/transaksi/${txId}`), sanitizeData(txToSave));
      stockUpdates.forEach(upd => {
        batch.update(doc(db, `users/${user.uid}/stok/${upd.id}`), { currentStock: increment(upd.delta) });
      });
      await batch.commit();

      const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      setReceipt({ txId, tanggal: today, jam, items: [...cart], subtotal, discountAmount, discountMode, discountValue, taxAmount, taxPct, nominal: total, paymentMethod, cashPaid, kembalian });
      setCart([]);
      setDiscountValue(0);
      setTaxPct(0);
      setCashPaid(0);
      setStep('receipt');
      toast.success('Transaksi berhasil disimpan!');
    } catch (err) {
      console.error('[Kasir] save error:', err);
      toast.error('Gagal menyimpan transaksi');
    } finally {
      setIsSaving(false);
    }
  };

  if (step === 'receipt' && receipt) {
    return (
      <ReceiptView
        receipt={receipt}
        storeSettings={storeSettings}
        onNewOrder={() => { setStep('order'); setReceipt(null); }}
        onPrint={() => window.print()}
      />
    );
  }

  return (
    <div className="flex h-[calc(100dvh-64px-80px)] md:h-[calc(100dvh-64px)] overflow-hidden bg-[#F5F7FA]">

      {/* ── Left: Product Panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search bar */}
        <div className="px-3 py-3 bg-white border-b border-gray-100 shadow-sm flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cari produk atau varian..."
              className="pl-9 pr-8 h-10 rounded-xl border-gray-200 bg-gray-50 text-sm font-medium focus-visible:ring-primary"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          {visibleProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-12">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                <Package className="w-8 h-8 text-gray-300" />
              </div>
              <p className="font-bold text-gray-400 text-sm">
                {products.length === 0 ? 'Belum ada produk HPP' : 'Produk tidak ditemukan'}
              </p>
              {products.length === 0 && onNavigate && (
                <Button onClick={() => onNavigate('hpp')} size="sm" className="orange-gradient text-white rounded-xl h-9 px-4">
                  Tambah Produk HPP
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {visibleProducts.map(product => (
                <ProductCard key={product.id} product={product} cart={cart} onAdd={addToCart} />
              ))}
            </div>
          )}
        </div>

        {/* Mobile bottom action bar */}
        {cartCount > 0 && (
          <div className="md:hidden flex-shrink-0 p-3 bg-white border-t border-gray-100 safe-area-bottom">
            <button
              onClick={() => setShowCartMobile(true)}
              className="w-full h-12 orange-gradient text-white rounded-2xl flex items-center justify-between px-4 font-bold shadow-lg shadow-brand-200"
            >
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                <span className="text-sm">{cartCount} item</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">{formatRp(total)}</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>
          </div>
        )}
      </div>

      {/* ── Right: Cart Panel (desktop) ── */}
      <div className="hidden md:flex flex-col w-[300px] lg:w-[340px] xl:w-[360px] bg-white border-l border-gray-100 overflow-hidden flex-shrink-0">
        <CartPanel
          cart={cart}
          subtotal={subtotal}
          discountAmount={discountAmount}
          taxAmount={taxAmount}
          total={total}
          onUpdateQty={updateQty}
          onRemove={removeFromCart}
          onClear={clearCart}
          onCheckout={handleOpenCheckout}
        />
      </div>

      {/* ── Mobile: Cart bottom sheet ── */}
      <AnimatePresence>
        {showCartMobile && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-[150]"
              onClick={() => setShowCartMobile(false)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[151] bg-white rounded-t-3xl shadow-2xl max-h-[85dvh] flex flex-col"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                <span className="text-lg font-black text-[#1A1A2E]">Keranjang</span>
                <button onClick={() => setShowCartMobile(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <CartPanel
                  cart={cart}
                  subtotal={subtotal}
                  discountAmount={discountAmount}
                  taxAmount={taxAmount}
                  total={total}
                  onUpdateQty={updateQty}
                  onRemove={removeFromCart}
                  onClear={clearCart}
                  onCheckout={handleOpenCheckout}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Checkout overlay ── */}
      <AnimatePresence>
        {step === 'checkout' && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200]"
              onClick={() => setStep('order')}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed bottom-0 left-0 right-0 z-[201] bg-white rounded-t-3xl shadow-2xl max-h-[92dvh] flex flex-col md:left-auto md:right-0 md:top-0 md:bottom-0 md:rounded-none md:rounded-l-3xl md:w-[420px] md:max-h-full"
            >
              <CheckoutPanel
                cart={cart}
                subtotal={subtotal}
                discountMode={discountMode}
                discountValue={discountValue}
                discountAmount={discountAmount}
                taxPct={taxPct}
                taxAmount={taxAmount}
                total={total}
                paymentMethod={paymentMethod}
                cashPaid={cashPaid}
                kembalian={kembalian}
                isSaving={isSaving}
                cashInputRef={cashInputRef}
                onDiscountModeChange={setDiscountMode}
                onDiscountValueChange={setDiscountValue}
                onTaxPctChange={setTaxPct}
                onPaymentMethodChange={setPaymentMethod}
                onCashPaidChange={setCashPaid}
                onConfirm={saveKasirSale}
                onBack={() => setStep('order')}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ───────── ProductCard ─────────
function ProductCard({ product, cart, onAdd }: {
  product: Product;
  cart: CartItem[];
  onAdd: (product: Product, variant: { id: string; nama: string; harga_jual: number }) => void;
}) {
  const sellableVariants = product.varian.filter(v => v.harga_jual > 0);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      <div className="px-3 pt-3 pb-2 border-b border-gray-50">
        <p className="text-[11px] font-black text-[#1A1A2E] leading-tight line-clamp-2">{product.nama}</p>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        {sellableVariants.map(variant => {
          const cartItem = cart.find(i => i.variantId === variant.id);
          const inCart = !!cartItem;
          return (
            <button
              key={variant.id}
              onClick={() => onAdd(product, variant)}
              className={cn(
                "w-full flex items-center justify-between rounded-xl px-2.5 py-2 transition-all active:scale-95",
                inCart
                  ? "bg-brand-50 border border-primary/20"
                  : "bg-gray-50 hover:bg-gray-100 border border-transparent"
              )}
            >
              <div className="text-left min-w-0 flex-1">
                <p className={cn(
                  "text-[10px] font-bold truncate leading-tight",
                  inCart ? "text-primary" : "text-gray-700"
                )}>
                  {sellableVariants.length === 1 && variant.nama === product.nama ? 'Standar' : variant.nama}
                </p>
                <p className={cn(
                  "text-[10px] font-bold mt-0.5",
                  inCart ? "text-primary/80" : "text-gray-400"
                )}>
                  {formatRp(variant.harga_jual)}
                </p>
              </div>
              {inCart ? (
                <Badge className="bg-primary text-white text-[9px] font-black px-1.5 py-0.5 rounded-lg ml-1 flex-shrink-0">
                  ×{cartItem.qty}
                </Badge>
              ) : (
                <div className="w-5 h-5 rounded-lg bg-gray-200 flex items-center justify-center ml-1 flex-shrink-0">
                  <Plus className="w-3 h-3 text-gray-500" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ───────── CartPanel ─────────
function CartPanel({ cart, subtotal, discountAmount, taxAmount, total, onUpdateQty, onRemove, onClear, onCheckout }: {
  cart: CartItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  onUpdateQty: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onCheckout: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-primary" />
          <span className="font-black text-sm text-[#1A1A2E]">Keranjang</span>
          {cart.length > 0 && (
            <Badge className="bg-primary text-white text-[9px] font-black px-1.5 h-4 rounded-full">
              {cart.reduce((s, i) => s + i.qty, 0)}
            </Badge>
          )}
        </div>
        {cart.length > 0 && (
          <button onClick={onClear} className="text-[10px] font-bold text-red-400 hover:text-red-600 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>

      {cart.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
          <ShoppingCart className="w-10 h-10 text-gray-200" />
          <p className="text-xs font-bold text-gray-300">Keranjang kosong</p>
          <p className="text-[10px] text-gray-300">Pilih produk untuk memulai</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 custom-scrollbar">
          <AnimatePresence initial={false}>
            {cart.map(item => (
              <motion.div
                key={item.variantId}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-[#1A1A2E] truncate">{item.productName}</p>
                    {item.variantName !== item.productName && (
                      <p className="text-[10px] text-gray-400 font-medium truncate">{item.variantName}</p>
                    )}
                    <p className="text-[10px] font-bold text-primary mt-0.5">{formatRp(item.hargaJual * item.qty)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => onUpdateQty(item.variantId, -1)}
                      className="w-6 h-6 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors"
                    >
                      <Minus className="w-3 h-3 text-gray-500" />
                    </button>
                    <span className="text-[11px] font-black text-[#1A1A2E] w-5 text-center">{item.qty}</span>
                    <button
                      onClick={() => onUpdateQty(item.variantId, 1)}
                      className="w-6 h-6 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-brand-50 hover:border-primary/20 transition-colors"
                    >
                      <Plus className="w-3 h-3 text-gray-500" />
                    </button>
                    <button
                      onClick={() => onRemove(item.variantId)}
                      className="w-6 h-6 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors ml-1"
                    >
                      <X className="w-3 h-3 text-gray-400" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <div className="flex-shrink-0 border-t border-gray-100 px-4 pt-3 pb-4 space-y-1.5 bg-white">
        <div className="flex justify-between text-xs text-gray-500 font-medium">
          <span>Subtotal</span>
          <span className="font-bold text-[#1A1A2E]">{formatRp(subtotal)}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between text-xs text-green-600 font-medium">
            <span>Diskon</span>
            <span className="font-bold">-{formatRp(discountAmount)}</span>
          </div>
        )}
        {taxAmount > 0 && (
          <div className="flex justify-between text-xs text-gray-500 font-medium">
            <span>Pajak</span>
            <span className="font-bold text-[#1A1A2E]">+{formatRp(taxAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-black text-[#1A1A2E] pt-1.5 border-t border-gray-100">
          <span>Total</span>
          <span className="text-primary">{formatRp(total)}</span>
        </div>
        <Button
          onClick={onCheckout}
          disabled={cart.length === 0}
          className="w-full h-11 orange-gradient text-white font-black rounded-2xl shadow-lg shadow-brand-200 mt-1 text-sm"
        >
          Bayar Sekarang →
        </Button>
      </div>
    </div>
  );
}

// ───────── CheckoutPanel ─────────
function CheckoutPanel({
  cart, subtotal, discountMode, discountValue, discountAmount,
  taxPct, taxAmount, total, paymentMethod, cashPaid, kembalian,
  isSaving, cashInputRef,
  onDiscountModeChange, onDiscountValueChange, onTaxPctChange,
  onPaymentMethodChange, onCashPaidChange, onConfirm, onBack
}: {
  cart: CartItem[];
  subtotal: number;
  discountMode: DiscountMode;
  discountValue: number;
  discountAmount: number;
  taxPct: number;
  taxAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  cashPaid: number;
  kembalian: number;
  isSaving: boolean;
  cashInputRef: React.RefObject<HTMLInputElement>;
  onDiscountModeChange: (m: DiscountMode) => void;
  onDiscountValueChange: (v: number) => void;
  onTaxPctChange: (v: number) => void;
  onPaymentMethodChange: (m: PaymentMethod) => void;
  onCashPaidChange: (v: number) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full max-h-[92dvh] md:max-h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <div>
          <h3 className="font-black text-lg text-[#1A1A2E]">Pembayaran</h3>
          <p className="text-xs text-gray-400 font-medium">{cart.reduce((s, i) => s + i.qty, 0)} item</p>
        </div>
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 custom-scrollbar">
        {/* Order summary */}
        <div className="bg-gray-50 rounded-2xl p-3 space-y-1.5">
          {cart.map(item => (
            <div key={item.variantId} className="flex justify-between text-xs">
              <span className="text-gray-600 font-medium">
                {item.productName}{item.variantName !== item.productName ? ` (${item.variantName})` : ''} ×{item.qty}
              </span>
              <span className="font-bold text-[#1A1A2E]">{formatRp(item.hargaJual * item.qty)}</span>
            </div>
          ))}
        </div>

        {/* Diskon */}
        <div>
          <label className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <Tag className="w-3.5 h-3.5" /> Diskon
          </label>
          <div className="flex gap-2">
            <div className="flex bg-gray-100 rounded-xl p-0.5 flex-shrink-0">
              {(['flat', 'persen'] as DiscountMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => { onDiscountModeChange(m); onDiscountValueChange(0); }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    discountMode === m ? "bg-white text-primary shadow-sm" : "text-gray-400"
                  )}
                >
                  {m === 'flat' ? 'Rp' : '%'}
                </button>
              ))}
            </div>
            <Input
              type="number"
              min={0}
              value={discountValue || ''}
              onChange={e => onDiscountValueChange(Number(e.target.value) || 0)}
              placeholder={discountMode === 'flat' ? '0' : '0'}
              className="flex-1 h-9 rounded-xl border-gray-200 text-sm font-bold focus-visible:ring-primary"
            />
          </div>
          {discountAmount > 0 && (
            <p className="text-xs text-green-600 font-bold mt-1">Hemat {formatRp(discountAmount)}</p>
          )}
        </div>

        {/* Pajak */}
        <div>
          <label className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2 block">Pajak (%)</label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              value={taxPct || ''}
              onChange={e => onTaxPctChange(Number(e.target.value) || 0)}
              placeholder="0"
              className="w-24 h-9 rounded-xl border-gray-200 text-sm font-bold focus-visible:ring-primary"
            />
            <span className="text-xs text-gray-400 font-medium">% dari subtotal setelah diskon</span>
          </div>
          {taxAmount > 0 && (
            <p className="text-xs text-gray-500 font-bold mt-1">+{formatRp(taxAmount)}</p>
          )}
        </div>

        {/* Metode bayar */}
        <div>
          <label className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2 block">Metode Pembayaran</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'tunai', label: 'Tunai', icon: Banknote },
              { value: 'nontunai', label: 'Non-Tunai', icon: CreditCard }
            ] as { value: PaymentMethod; label: string; icon: any }[]).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => onPaymentMethodChange(value)}
                className={cn(
                  "flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all font-bold text-sm",
                  paymentMethod === value
                    ? "border-primary bg-brand-50 text-primary"
                    : "border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200"
                )}
              >
                <Icon className="w-5 h-5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Cash input */}
        {paymentMethod === 'tunai' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <label className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2 block">Uang Diterima</label>
            <Input
              ref={cashInputRef}
              type="number"
              min={0}
              value={cashPaid || ''}
              onChange={e => onCashPaidChange(Number(e.target.value) || 0)}
              placeholder={String(Math.ceil(total / 1000) * 1000)}
              className="h-12 rounded-xl border-gray-200 text-base font-black focus-visible:ring-primary"
            />
            {/* Quick cash buttons */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[0, 1000, 2000, 5000, 10000].map(extra => {
                const rounded = Math.ceil(total / 1000) * 1000 + extra;
                return (
                  <button
                    key={extra}
                    onClick={() => onCashPaidChange(rounded)}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-brand-50 hover:text-primary transition-colors"
                  >
                    {formatRp(rounded)}
                  </button>
                );
              })}
            </div>
            {cashPaid >= total && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-xl px-3 py-2 flex justify-between items-center">
                <span className="text-xs font-bold text-green-700">Kembalian</span>
                <span className="text-sm font-black text-green-700">{formatRp(kembalian)}</span>
              </div>
            )}
            {cashPaid > 0 && cashPaid < total && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex justify-between items-center">
                <span className="text-xs font-bold text-red-600">Kurang</span>
                <span className="text-sm font-black text-red-600">{formatRp(total - cashPaid)}</span>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Total + Confirm */}
      <div className="flex-shrink-0 border-t border-gray-100 px-5 py-4 space-y-3 bg-white">
        <div className="flex justify-between items-center">
          <span className="text-base font-black text-[#1A1A2E]">Total Bayar</span>
          <span className="text-xl font-black text-primary">{formatRp(total)}</span>
        </div>
        <Button
          onClick={onConfirm}
          disabled={isSaving || (paymentMethod === 'tunai' && cashPaid < total)}
          className="w-full h-12 orange-gradient text-white font-black rounded-2xl shadow-lg shadow-brand-200 text-sm"
        >
          {isSaving ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Menyimpan...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Konfirmasi Pembayaran
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

// ───────── ReceiptView ─────────
function ReceiptView({ receipt, storeSettings, onNewOrder, onPrint }: {
  receipt: ReceiptData;
  storeSettings: StoreSettings;
  onNewOrder: () => void;
  onPrint: () => void;
}) {
  return (
    <>
      {/* Printable receipt — hidden on screen, shown on print */}
      <div id="kasir-receipt-print" style={{ display: 'none' }}>
        <PrintReceipt receipt={receipt} storeSettings={storeSettings} />
      </div>

      {/* Screen receipt */}
      <div className="flex flex-col h-[calc(100dvh-64px-80px)] md:h-[calc(100dvh-64px)] overflow-hidden bg-[#F5F7FA]">
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="max-w-sm mx-auto space-y-4">
            {/* Success header */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center text-center py-6 gap-3"
            >
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-green-500" />
              </div>
              <div>
                <h2 className="text-xl font-black text-[#1A1A2E]">Pembayaran Berhasil!</h2>
                <p className="text-xs text-gray-400 font-medium mt-1">#{receipt.txId.toUpperCase()}</p>
              </div>
            </motion.div>

            {/* Receipt card */}
            <motion.div
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
              className="bg-white rounded-3xl shadow-sm overflow-hidden"
            >
              {/* Store header */}
              <div className="bg-gradient-to-br from-primary to-orange-500 text-white px-5 py-4 text-center">
                {storeSettings.logo && storeSettings.showLogoOnReceipt && (
                  <img src={storeSettings.logo} alt="" className="h-10 object-contain mx-auto mb-2 rounded-xl" />
                )}
                {storeSettings.showNameOnReceipt && (
                  <p className="font-black text-base">{storeSettings.name}</p>
                )}
                {storeSettings.showAddressOnReceipt && storeSettings.address && (
                  <p className="text-[11px] text-white/80 mt-0.5">{storeSettings.address}</p>
                )}
                <p className="text-[10px] text-white/70 mt-1">{formatDate(receipt.tanggal)} · {receipt.jam}</p>
              </div>

              {/* Items */}
              <div className="px-5 py-4 space-y-2.5 border-b border-dashed border-gray-200">
                {receipt.items.map(item => (
                  <div key={item.variantId} className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-bold text-[#1A1A2E]">{item.productName}</p>
                      {item.variantName !== item.productName && (
                        <p className="text-xs text-gray-400">{item.variantName}</p>
                      )}
                      <p className="text-xs text-gray-400">{formatRp(item.hargaJual)} × {item.qty}</p>
                    </div>
                    <p className="text-sm font-black text-[#1A1A2E]">{formatRp(item.hargaJual * item.qty)}</p>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="px-5 py-4 space-y-2 border-b border-dashed border-gray-200">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal</span>
                  <span className="font-bold text-[#1A1A2E]">{formatRp(receipt.subtotal)}</span>
                </div>
                {receipt.discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>
                      Diskon {receipt.discountMode === 'persen' ? `(${receipt.discountValue}%)` : ''}
                    </span>
                    <span className="font-bold">-{formatRp(receipt.discountAmount)}</span>
                  </div>
                )}
                {receipt.taxAmount > 0 && (
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Pajak ({receipt.taxPct}%)</span>
                    <span className="font-bold text-[#1A1A2E]">+{formatRp(receipt.taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black text-[#1A1A2E] pt-2 border-t border-gray-100">
                  <span>TOTAL</span>
                  <span className="text-primary">{formatRp(receipt.nominal)}</span>
                </div>
              </div>

              {/* Payment info */}
              <div className="px-5 py-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Metode</span>
                  <span className="font-bold text-[#1A1A2E] flex items-center gap-1">
                    {receipt.paymentMethod === 'tunai' ? <><Banknote className="w-3.5 h-3.5" /> Tunai</> : <><CreditCard className="w-3.5 h-3.5" /> Non-Tunai</>}
                  </span>
                </div>
                {receipt.paymentMethod === 'tunai' && (
                  <>
                    <div className="flex justify-between text-sm mt-1.5">
                      <span className="text-gray-500">Dibayar</span>
                      <span className="font-bold text-[#1A1A2E]">{formatRp(receipt.cashPaid)}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1.5">
                      <span className="text-gray-500">Kembalian</span>
                      <span className="font-black text-green-600">{formatRp(receipt.kembalian)}</span>
                    </div>
                  </>
                )}
                {storeSettings.receiptFooter && (
                  <p className="text-center text-xs text-gray-400 font-medium mt-4 pt-3 border-t border-dashed border-gray-200">
                    {storeSettings.receiptFooter}
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex-shrink-0 p-4 bg-white border-t border-gray-100 flex gap-3">
          <Button
            variant="outline"
            onClick={onPrint}
            className="flex-1 h-11 rounded-2xl font-bold border-gray-200 text-gray-600 gap-2"
          >
            <Printer className="w-4 h-4" /> Cetak Struk
          </Button>
          <Button
            onClick={onNewOrder}
            className="flex-1 h-11 orange-gradient text-white font-black rounded-2xl shadow-lg shadow-brand-200 gap-2"
          >
            <Receipt className="w-4 h-4" /> Transaksi Baru
          </Button>
        </div>
      </div>
    </>
  );
}

// ───────── PrintReceipt (thermal format) ─────────
function PrintReceipt({ receipt, storeSettings }: { receipt: ReceiptData; storeSettings: StoreSettings }) {
  const style: React.CSSProperties = { fontFamily: 'monospace', fontSize: '12px', maxWidth: '300px', margin: '0 auto' };
  const divider = '--------------------------------';
  return (
    <div style={style}>
      {storeSettings.showNameOnReceipt && (
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', marginBottom: '2px' }}>
          {storeSettings.name}
        </div>
      )}
      {storeSettings.showAddressOnReceipt && storeSettings.address && (
        <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '2px' }}>{storeSettings.address}</div>
      )}
      {storeSettings.phone && (
        <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '4px' }}>Telp: {storeSettings.phone}</div>
      )}
      <div style={{ textAlign: 'center' }}>{divider}</div>
      <div style={{ fontSize: '11px', marginTop: '4px' }}>
        <div>Tanggal : {formatDate(receipt.tanggal)}</div>
        <div>Jam     : {receipt.jam}</div>
        <div>No      : #{receipt.txId.toUpperCase()}</div>
        <div>Bayar   : {receipt.paymentMethod === 'tunai' ? 'TUNAI' : 'NON-TUNAI'}</div>
      </div>
      <div style={{ textAlign: 'center', margin: '4px 0' }}>{divider}</div>
      {receipt.items.map(item => (
        <div key={item.variantId} style={{ marginBottom: '4px' }}>
          <div style={{ fontWeight: 'bold' }}>
            {item.productName}{item.variantName !== item.productName ? ` (${item.variantName})` : ''}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{item.qty} x {formatRp(item.hargaJual)}</span>
            <span>{formatRp(item.hargaJual * item.qty)}</span>
          </div>
        </div>
      ))}
      <div style={{ textAlign: 'center', margin: '4px 0' }}>{divider}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Subtotal</span><span>{formatRp(receipt.subtotal)}</span>
      </div>
      {receipt.discountAmount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Diskon{receipt.discountMode === 'persen' ? ` ${receipt.discountValue}%` : ''}</span>
          <span>-{formatRp(receipt.discountAmount)}</span>
        </div>
      )}
      {receipt.taxAmount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Pajak {receipt.taxPct}%</span><span>+{formatRp(receipt.taxAmount)}</span>
        </div>
      )}
      <div style={{ textAlign: 'center', margin: '4px 0' }}>{divider}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px' }}>
        <span>TOTAL</span><span>{formatRp(receipt.nominal)}</span>
      </div>
      {receipt.paymentMethod === 'tunai' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Dibayar</span><span>{formatRp(receipt.cashPaid)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>Kembali</span><span>{formatRp(receipt.kembalian)}</span>
          </div>
        </>
      )}
      <div style={{ textAlign: 'center', margin: '4px 0' }}>{divider}</div>
      {storeSettings.receiptFooter && (
        <div style={{ textAlign: 'center', fontSize: '11px', marginTop: '4px' }}>{storeSettings.receiptFooter}</div>
      )}
    </div>
  );
}
