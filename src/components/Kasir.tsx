import React from 'react';
import {
  Search, ShoppingCart, Plus, Minus, Trash2, X, Printer,
  Tag, CreditCard, Banknote, CheckCircle2, Package, ChevronRight,
  RotateCcw, Receipt, Share2, MessageCircle, QrCode, Zap,
  Smartphone, Wifi, AlertCircle, Filter, ScanLine, User,
  ExternalLink, Copy, Hash, FileText, ArrowRight, Store
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { Product, Ingredient, StoreSettings } from '../types';
import { User as FirebaseUser, db, doc, writeBatch, serverTimestamp, increment, sanitizeData } from '../lib/firebase';

// ─── Types ───────────────────────────────────────────────────────────────────
type CartItem = {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  hargaJual: number;
  qty: number;
};

type DiscountMode = 'flat' | 'persen';
type PaymentMethod = 'tunai' | 'nontunai' | 'qris' | 'transfer';
type Step = 'order' | 'checkout' | 'receipt';

type ReceiptData = {
  txId: string;
  queueNumber: number;
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
  customerName: string;
  customerPhone: string;
  catatan: string;
};

interface KasirProps {
  user: FirebaseUser;
  products: Product[];
  ingredients: Ingredient[];
  setIngredients: React.Dispatch<React.SetStateAction<Ingredient[]>>;
  storeSettings: StoreSettings;
  onNavigate?: (tab: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatRp(n: number) {
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'tunai', label: 'Tunai', icon: Banknote, color: 'text-green-600' },
  { value: 'qris', label: 'QRIS', icon: QrCode, color: 'text-purple-600' },
  { value: 'transfer', label: 'Transfer', icon: Smartphone, color: 'text-blue-600' },
  { value: 'nontunai', label: 'EDC/Kartu', icon: CreditCard, color: 'text-orange-600' },
];

// ─── Queue number session counter ─────────────────────────────────────────────
let sessionQueueCounter = 0;
function nextQueueNumber() {
  sessionQueueCounter += 1;
  return sessionQueueCounter;
}

// ─── Barcode scanner detector ─────────────────────────────────────────────────
function useBarcodeScanner(onScan: (code: string) => void) {
  const bufferRef = React.useRef<string>('');
  const lastKeyTimeRef = React.useRef<number>(0);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const now = Date.now();
      const delta = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // If gap > 80ms reset buffer (human typing is slow)
      if (delta > 80) bufferRef.current = '';

      if (e.key === 'Enter') {
        const code = bufferRef.current.trim();
        bufferRef.current = '';
        if (code.length >= 4) onScan(code);
      } else if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScan]);
}

// ─── Cash drawer trigger ──────────────────────────────────────────────────────
async function triggerCashDrawer() {
  try {
    // ESC/POS: DLE EOT 2 — works on most thermal printers with drawer
    const escPosDrawerCommand = new Uint8Array([0x10, 0x14, 0x00, 0x01, 0x00]);

    if ('usb' in navigator) {
      // Try Web USB first
      const devices = await (navigator as any).usb.getDevices();
      if (devices.length > 0) {
        const device = devices[0];
        await device.open();
        if (device.configuration === null) await device.selectConfiguration(1);
        await device.claimInterface(0);
        await device.transferOut(1, escPosDrawerCommand);
        await device.close();
        toast.success('Cash drawer dibuka');
        return;
      }
    }

    if ('bluetooth' in navigator) {
      // Bluetooth thermal printer attempt
      toast.info('Buka pengaturan printer Bluetooth untuk cash drawer');
      return;
    }

    toast.info('Cash drawer tidak terdeteksi. Buka manual.');
  } catch {
    toast.info('Tidak ada perangkat USB terdeteksi. Buka cash drawer manual.');
  }
}

// ─── Share store link ─────────────────────────────────────────────────────────
function getStoreCatalogUrl(userId: string) {
  const origin = window.location.origin + window.location.pathname;
  return `${origin}?store=${userId}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Kasir({ user, products, ingredients, setIngredients, storeSettings, onNavigate }: KasirProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeCategory, setActiveCategory] = React.useState<string>('Semua');
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [step, setStep] = React.useState<Step>('order');
  const [showCartMobile, setShowCartMobile] = React.useState(false);
  const [showStoreLink, setShowStoreLink] = React.useState(false);
  const [discountMode, setDiscountMode] = React.useState<DiscountMode>('flat');
  const [discountValue, setDiscountValue] = React.useState(0);
  const [taxPct, setTaxPct] = React.useState(0);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>('tunai');
  const [cashPaid, setCashPaid] = React.useState(0);
  const [customerName, setCustomerName] = React.useState('');
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [catatan, setCatatan] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [receipt, setReceipt] = React.useState<ReceiptData | null>(null);
  const cashInputRef = React.useRef<HTMLInputElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);


  // Category list derived from products
  const categories = React.useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => {
      if (p.varian?.some(v => v.harga_jual > 0)) {
        const cat = (p as any).kategori || 'Umum';
        cats.add(cat);
      }
    });
    return ['Semua', ...Array.from(cats).sort()];
  }, [products]);

  // Filtered product list
  const visibleProducts = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter(p => {
      if (!p.varian.some(v => v.harga_jual > 0)) return false;
      const matchCat = activeCategory === 'Semua' || (p as any).kategori === activeCategory || (!((p as any).kategori) && activeCategory === 'Umum');
      const matchSearch = q === '' || p.nama.toLowerCase().includes(q) || p.varian.some(v => v.nama.toLowerCase().includes(q) || (v.sku || '').toLowerCase().includes(q));
      return matchCat && matchSearch;
    });
  }, [products, searchQuery, activeCategory]);

  // Barcode scanner handler
  const handleBarcodeScan = React.useCallback((code: string) => {
    const matched = products.find(p => p.sku === code || p.varian.some(v => v.sku === code));
    if (!matched) {
      setSearchQuery(code);
      toast.info(`Barcode "${code}" — cari produk`);
      return;
    }
    const variant = matched.varian.find(v => v.sku === code) || matched.varian.find(v => v.harga_jual > 0);
    if (variant) {
      addToCart(matched, variant);
      toast.success(`${matched.nama} ditambahkan ke keranjang`);
    }
  }, [products]);

  useBarcodeScanner(handleBarcodeScan);

  // Cart calculations
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
      const vData = product.varian.find(v => v.id === variant.id);
      const minOrder = vData ? Math.max(1, Number(vData.min_order) || 1) : 1;
      if (existing) return prev.map(i => i.variantId === variant.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, {
        productId: product.id,
        productName: product.nama,
        variantId: variant.id,
        variantName: variant.nama,
        hargaJual: variant.harga_jual,
        qty: minOrder
      }];
    });
  };

  const updateQty = (variantId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.variantId === variantId) {
        const product = products.find(p => p.id === i.productId);
        const vData = product?.varian.find(v => v.id === variantId);
        const minOrder = vData ? Math.max(1, Number(vData.min_order) || 1) : 1;
        const newQty = i.qty + delta;
        if (delta < 0 && newQty < minOrder) return { ...i, qty: 0 };
        return { ...i, qty: newQty };
      }
      return i;
    }).filter(i => i.qty > 0));
  };

  const removeFromCart = (variantId: string) => setCart(prev => prev.filter(i => i.variantId !== variantId));

  const clearCart = () => {
    setCart([]);
    setDiscountValue(0);
    setTaxPct(0);
    setCashPaid(0);
    setCustomerName('');
    setCustomerPhone('');
    setCatatan('');
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
      const queueNumber = nextQueueNumber();
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
        keterangan: `Kasir: ${names}${customerName ? ` — ${customerName}` : ''}`,
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
        queue_number: queueNumber,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        catatan: catatan || null,
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
      setReceipt({ txId, queueNumber, tanggal: today, jam, items: [...cart], subtotal, discountAmount, discountMode, discountValue, taxAmount, taxPct, nominal: total, paymentMethod, cashPaid, kembalian, customerName, customerPhone, catatan });
      setCart([]);
      setDiscountValue(0);
      setTaxPct(0);
      setCashPaid(0);
      setCustomerName('');
      setCustomerPhone('');
      setCatatan('');
      setStep('receipt');
      toast.success('Transaksi berhasil disimpan!');

      // Auto-trigger cash drawer for cash payments
      if (paymentMethod === 'tunai') {
        triggerCashDrawer();
      }
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
      />
    );
  }

  return (
    <div className="flex h-[calc(100dvh-64px-80px)] md:h-[calc(100dvh-64px)] overflow-hidden bg-[#F5F7FA]">

      {/* ── Left: Product Panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar: search + store link */}
        <div className="px-3 pt-3 pb-2 bg-white border-b border-gray-100 shadow-sm flex-shrink-0 space-y-2">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                ref={searchRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cari produk / varian / SKU..."
                className="pl-9 pr-8 h-10 rounded-xl border-gray-200 bg-gray-50 text-sm font-medium focus-visible:ring-primary"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* Barcode scanner indicator */}
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center" title="Scanner barcode aktif">
              <ScanLine className="w-4 h-4 text-gray-400" />
            </div>
            {/* Store link */}
            <button
              onClick={() => setShowStoreLink(true)}
              className="flex-shrink-0 w-10 h-10 rounded-xl bg-brand-50 border border-primary/20 flex items-center justify-center text-primary"
              title="Bagikan toko online"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>

          {/* Category filter */}
          {categories.length > 2 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 hide-scrollbar">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                    activeCategory === cat
                      ? "orange-gradient text-white shadow-sm"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
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
      <div className="hidden md:flex flex-col w-[300px] lg:w-[340px] xl:w-[380px] bg-white border-l border-gray-100 overflow-hidden flex-shrink-0">
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
              className="fixed bottom-0 left-0 right-0 z-[201] bg-white rounded-t-3xl shadow-2xl max-h-[92dvh] flex flex-col md:left-auto md:right-0 md:top-0 md:bottom-0 md:rounded-none md:rounded-l-3xl md:w-[460px] md:max-h-full"
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
                customerName={customerName}
                customerPhone={customerPhone}
                catatan={catatan}
                isSaving={isSaving}
                cashInputRef={cashInputRef}
                onDiscountModeChange={setDiscountMode}
                onDiscountValueChange={setDiscountValue}
                onTaxPctChange={setTaxPct}
                onPaymentMethodChange={setPaymentMethod}
                onCashPaidChange={setCashPaid}
                onCustomerNameChange={setCustomerName}
                onCustomerPhoneChange={setCustomerPhone}
                onCatatanChange={setCatatan}
                onConfirm={saveKasirSale}
                onBack={() => setStep('order')}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Store Link Modal ── */}
      <AnimatePresence>
        {showStoreLink && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200]"
              onClick={() => setShowStoreLink(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[201] bg-white rounded-3xl shadow-2xl p-6 max-w-sm mx-auto"
            >
              <div className="text-center mb-5">
                <div className="w-14 h-14 rounded-2xl orange-gradient flex items-center justify-center mx-auto mb-3">
                  <Store className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-black text-[#1A1A2E]">Toko Online Kamu</h3>
                <p className="text-xs text-gray-400 font-medium mt-1">Bagikan link ini ke pelanggan untuk melihat katalog & pesan</p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-3 flex items-center gap-2 mb-4">
                <p className="flex-1 text-xs font-bold text-gray-600 break-all">{getStoreCatalogUrl(user.uid)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="rounded-2xl h-11 font-bold text-sm gap-2"
                  onClick={() => {
                    navigator.clipboard.writeText(getStoreCatalogUrl(user.uid));
                    toast.success('Link disalin!');
                  }}
                >
                  <Copy className="w-4 h-4" /> Salin Link
                </Button>
                <Button
                  className="orange-gradient text-white rounded-2xl h-11 font-bold text-sm gap-2"
                  onClick={() => {
                    const text = `Halo! Lihat katalog produk kami di: ${getStoreCatalogUrl(user.uid)}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                  }}
                >
                  <MessageCircle className="w-4 h-4" /> Share WA
                </Button>
              </div>
              <button onClick={() => setShowStoreLink(false)} className="w-full mt-3 text-xs text-gray-400 font-bold py-2">Tutup</button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── ProductCard ──────────────────────────────────────────────────────────────
function ProductCard({ product, cart, onAdd }: {
  key?: React.Key;
  product: Product;
  cart: CartItem[];
  onAdd: (product: Product, variant: { id: string; nama: string; harga_jual: number }) => void;
}) {
  const sellableVariants = product.varian.filter(v => v.harga_jual > 0);
  const totalInCart = cart.filter(i => i.productId === product.id).reduce((s, i) => s + i.qty, 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col group">
      {/* Product photo */}
      <div className="relative w-full aspect-square bg-gray-50 overflow-hidden flex-shrink-0">
        {product.foto ? (
          <img
            src={product.foto}
            alt={product.nama}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-8 h-8 text-gray-200" />
          </div>
        )}
        {/* Total in cart badge */}
        {totalInCart > 0 && (
          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow">
            <span className="text-[9px] font-black text-white">{totalInCart}</span>
          </div>
        )}
        {/* Kategori badge */}
        {product.kategori && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 pt-3 pb-1.5">
            <p className="text-[9px] font-black text-white uppercase tracking-wider truncate">{product.kategori}</p>
          </div>
        )}
      </div>

      {/* Name */}
      <div className="px-2.5 pt-2 pb-1">
        <p className="text-[11px] font-black text-[#1A1A2E] leading-tight line-clamp-1">{product.nama}</p>
      </div>

      {/* Variants */}
      <div className="flex-1 px-2 pb-2 space-y-1">
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
                <p className={cn("text-[10px] font-bold truncate leading-tight", inCart ? "text-primary" : "text-gray-600")}>
                  {sellableVariants.length === 1 && variant.nama === product.nama ? 'Standar' : variant.nama}
                </p>
                <p className={cn("text-[11px] font-black mt-0.5", inCart ? "text-primary" : "text-gray-800")}>
                  {formatRp(variant.harga_jual)}
                </p>
              </div>
              {inCart ? (
                <div className="flex items-center gap-1 ml-1 flex-shrink-0">
                  <span className="text-[10px] font-black text-primary bg-primary/10 rounded-lg px-1.5 py-0.5">×{cartItem.qty}</span>
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center ml-1 flex-shrink-0">
                  <Plus className="w-3 h-3 text-primary" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── CartPanel ────────────────────────────────────────────────────────────────
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

// ─── CheckoutPanel ────────────────────────────────────────────────────────────
function CheckoutPanel({
  cart, subtotal, discountMode, discountValue, discountAmount,
  taxPct, taxAmount, total, paymentMethod, cashPaid, kembalian,
  customerName, customerPhone, catatan,
  isSaving, cashInputRef,
  onDiscountModeChange, onDiscountValueChange, onTaxPctChange,
  onPaymentMethodChange, onCashPaidChange, onCustomerNameChange,
  onCustomerPhoneChange, onCatatanChange, onConfirm, onBack
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
  customerName: string;
  customerPhone: string;
  catatan: string;
  isSaving: boolean;
  cashInputRef: React.RefObject<HTMLInputElement>;
  onDiscountModeChange: (m: DiscountMode) => void;
  onDiscountValueChange: (v: number) => void;
  onTaxPctChange: (v: number) => void;
  onPaymentMethodChange: (m: PaymentMethod) => void;
  onCashPaidChange: (v: number) => void;
  onCustomerNameChange: (v: string) => void;
  onCustomerPhoneChange: (v: string) => void;
  onCatatanChange: (v: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const canPay = paymentMethod !== 'tunai' || cashPaid >= total;

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

        {/* Customer info */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" /> Pelanggan (Opsional)
          </label>
          <Input
            value={customerName}
            onChange={e => onCustomerNameChange(e.target.value)}
            placeholder="Nama pelanggan"
            className="h-9 rounded-xl border-gray-200 text-sm font-medium focus-visible:ring-primary"
          />
          <Input
            value={customerPhone}
            onChange={e => onCustomerPhoneChange(e.target.value)}
            placeholder="No. WhatsApp (628xxxxxxxx)"
            type="tel"
            className="h-9 rounded-xl border-gray-200 text-sm font-medium focus-visible:ring-primary"
          />
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
              placeholder="0"
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
              type="number" min={0} max={100}
              value={taxPct || ''}
              onChange={e => onTaxPctChange(Number(e.target.value) || 0)}
              placeholder="0"
              className="w-24 h-9 rounded-xl border-gray-200 text-sm font-bold focus-visible:ring-primary"
            />
            <span className="text-xs text-gray-400 font-medium">% dari subtotal setelah diskon</span>
          </div>
        </div>

        {/* Metode bayar */}
        <div>
          <label className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2 block">Metode Pembayaran</label>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_OPTIONS.map(({ value, label, icon: Icon, color }) => (
              <button
                key={value}
                onClick={() => onPaymentMethodChange(value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all font-bold text-xs",
                  paymentMethod === value
                    ? "border-primary bg-brand-50 text-primary"
                    : "border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200"
                )}
              >
                <Icon className={cn("w-5 h-5", paymentMethod === value ? "text-primary" : color)} />
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
              type="number" min={0}
              value={cashPaid || ''}
              onChange={e => onCashPaidChange(Number(e.target.value) || 0)}
              placeholder={String(Math.ceil(total / 1000) * 1000)}
              className="h-12 rounded-xl border-gray-200 text-base font-black focus-visible:ring-primary"
            />
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
            {cashPaid >= total && total > 0 && (
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

        {/* Catatan */}
        <div>
          <label className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2 block">Catatan (Opsional)</label>
          <Input
            value={catatan}
            onChange={e => onCatatanChange(e.target.value)}
            placeholder="Catatan pesanan..."
            className="h-9 rounded-xl border-gray-200 text-sm font-medium focus-visible:ring-primary"
          />
        </div>
      </div>

      {/* Total + Confirm */}
      <div className="flex-shrink-0 border-t border-gray-100 px-5 py-4 space-y-3 bg-white">
        <div className="flex justify-between items-center">
          <span className="text-base font-black text-[#1A1A2E]">Total Bayar</span>
          <span className="text-xl font-black text-primary">{formatRp(total)}</span>
        </div>
        <Button
          onClick={onConfirm}
          disabled={isSaving || !canPay}
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

// ─── Print helpers — open new window (works on all mobile browsers) ───────────
function openPrintWindow(html: string) {
  const win = window.open('', '_blank');
  if (!win) { toast.error('Izinkan popup di browser untuk mencetak'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Small delay so images/fonts can load
  setTimeout(() => { win.print(); win.close(); }, 350);
}

function buildReceiptHtml(receipt: ReceiptData, storeSettings: StoreSettings): string {
  const divider = '================================';
  const paymentLabel = PAYMENT_OPTIONS.find(p => p.value === receipt.paymentMethod)?.label || receipt.paymentMethod;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const rows: string[] = [];
  receipt.items.forEach(item => {
    const name = item.productName + (item.variantName !== item.productName ? ` (${item.variantName})` : '');
    rows.push(`
      <div style="margin-bottom:5px">
        <div style="font-weight:bold">${esc(name)}</div>
        <div style="display:flex;justify-content:space-between">
          <span>${item.qty} x ${formatRp(item.hargaJual)}</span>
          <span>${formatRp(item.hargaJual * item.qty)}</span>
        </div>
      </div>`);
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Struk ${esc(receipt.txId.toUpperCase())}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Courier New', monospace; font-size: 12px; background: #fff; color: #000; }
      .wrap { max-width: 300px; margin: 0 auto; padding: 12px 8px; }
      .center { text-align: center; }
      .row { display: flex; justify-content: space-between; margin: 2px 0; }
      .bold { font-weight: bold; }
      .big { font-size: 20px; font-weight: bold; }
      .divider { text-align: center; margin: 5px 0; letter-spacing: 0; }
      .footer { text-align: center; font-size: 10px; color: #666; margin-top: 10px; }
      @media print { @page { margin: 4mm; } }
    </style>
  </head><body><div class="wrap">
    ${storeSettings.showNameOnReceipt ? `<div class="center bold" style="font-size:15px;margin-bottom:2px">${esc(storeSettings.name)}</div>` : ''}
    ${storeSettings.showAddressOnReceipt && storeSettings.address ? `<div class="center" style="font-size:11px;margin-bottom:2px">${esc(storeSettings.address)}</div>` : ''}
    ${storeSettings.phone ? `<div class="center" style="font-size:11px;margin-bottom:4px">Telp: ${esc(storeSettings.phone)}</div>` : ''}
    <div class="divider">${divider}</div>
    <div class="center big" style="margin:5px 0">ANTRIAN #${receipt.queueNumber}</div>
    <div class="divider">${divider}</div>
    <div style="font-size:11px;margin:4px 0">
      <div>Tanggal : ${esc(formatDate(receipt.tanggal))}</div>
      <div>Jam     : ${esc(receipt.jam)}</div>
      <div>Struk   : #${esc(receipt.txId.toUpperCase())}</div>
      <div>Bayar   : ${esc(paymentLabel.toUpperCase())}</div>
      ${receipt.customerName ? `<div>Pelanggan: ${esc(receipt.customerName)}</div>` : ''}
    </div>
    <div class="divider">${divider}</div>
    ${rows.join('')}
    ${receipt.catatan ? `<div style="font-size:11px;font-style:italic;margin-bottom:4px">Catatan: ${esc(receipt.catatan)}</div>` : ''}
    <div class="divider">${divider}</div>
    <div class="row"><span>Subtotal</span><span>${formatRp(receipt.subtotal)}</span></div>
    ${receipt.discountAmount > 0 ? `<div class="row"><span>Diskon${receipt.discountMode === 'persen' ? ` ${receipt.discountValue}%` : ''}</span><span>-${formatRp(receipt.discountAmount)}</span></div>` : ''}
    ${receipt.taxAmount > 0 ? `<div class="row"><span>Pajak ${receipt.taxPct}%</span><span>+${formatRp(receipt.taxAmount)}</span></div>` : ''}
    <div class="divider">${divider}</div>
    <div class="row bold" style="font-size:14px"><span>TOTAL</span><span>${formatRp(receipt.nominal)}</span></div>
    ${receipt.paymentMethod === 'tunai' ? `
      <div class="row"><span>Dibayar</span><span>${formatRp(receipt.cashPaid)}</span></div>
      <div class="row bold"><span>Kembali</span><span>${formatRp(receipt.kembalian)}</span></div>` : ''}
    <div class="divider">${divider}</div>
    ${storeSettings.receiptFooter ? `<div class="footer">${esc(storeSettings.receiptFooter)}</div>` : ''}
    <div class="footer" style="margin-top:8px">Powered by CeuMilan POS</div>
  </div></body></html>`;
}

function buildBarcodeLabelsHtml(items: CartItem[], storeName: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const labels: { name: string; price: number; sku: string }[] = [];
  items.forEach(item => {
    const name = item.productName + (item.variantName !== item.productName ? ` - ${item.variantName}` : '');
    for (let i = 0; i < item.qty; i++) {
      labels.push({ name, price: item.hargaJual, sku: item.variantId.slice(-8).toUpperCase() });
    }
  });
  const labelHtml = labels.map(l => `
    <div style="display:inline-block;width:60mm;height:30mm;border:1px solid #ccc;padding:4px 6px;margin:2px;font-family:monospace;font-size:9px;vertical-align:top;box-sizing:border-box;page-break-inside:avoid;overflow:hidden">
      <div style="font-weight:bold;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.name)}</div>
      <div style="font-size:8px;color:#666">${esc(storeName)}</div>
      <div style="font-size:13px;font-weight:bold;margin:3px 0">${formatRp(l.price)}</div>
      <div style="font-size:8px;letter-spacing:2px;border-top:1px solid #eee;padding-top:2px">${esc(l.sku)}</div>
    </div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Label Barcode</title>
    <style>body{margin:4px;background:#fff}@media print{@page{margin:2mm}}</style>
  </head><body>${labelHtml}</body></html>`;
}

// ─── ReceiptView ──────────────────────────────────────────────────────────────
function ReceiptView({ receipt, storeSettings, onNewOrder }: {
  receipt: ReceiptData;
  storeSettings: StoreSettings;
  onNewOrder: () => void;
}) {
  const buildWhatsAppText = () => {
    const lines: string[] = [];
    lines.push(`*Struk Pembayaran — ${storeSettings.name}*`);
    lines.push(`No. Antrian: *#${receipt.queueNumber}*`);
    lines.push(`No. Struk: ${receipt.txId.toUpperCase()}`);
    lines.push(`Tanggal: ${formatDate(receipt.tanggal)}, ${receipt.jam}`);
    lines.push('');
    lines.push('*Rincian:*');
    receipt.items.forEach(item => {
      lines.push(`• ${item.productName}${item.variantName !== item.productName ? ` (${item.variantName})` : ''} ×${item.qty} = ${formatRp(item.hargaJual * item.qty)}`);
    });
    lines.push('');
    lines.push(`Subtotal: ${formatRp(receipt.subtotal)}`);
    if (receipt.discountAmount > 0) lines.push(`Diskon: -${formatRp(receipt.discountAmount)}`);
    if (receipt.taxAmount > 0) lines.push(`Pajak (${receipt.taxPct}%): +${formatRp(receipt.taxAmount)}`);
    lines.push(`*TOTAL: ${formatRp(receipt.nominal)}*`);
    lines.push(`Metode: ${PAYMENT_OPTIONS.find(p => p.value === receipt.paymentMethod)?.label || receipt.paymentMethod}`);
    if (receipt.paymentMethod === 'tunai') {
      lines.push(`Dibayar: ${formatRp(receipt.cashPaid)}`);
      lines.push(`Kembalian: ${formatRp(receipt.kembalian)}`);
    }
    if (storeSettings.receiptFooter) {
      lines.push('');
      lines.push(storeSettings.receiptFooter);
    }
    return lines.join('\n');
  };

  const sendToWhatsApp = () => {
    const phone = receipt.customerPhone.replace(/[^0-9]/g, '');
    const text = buildWhatsAppText();
    if (phone) {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const paymentLabel = PAYMENT_OPTIONS.find(p => p.value === receipt.paymentMethod)?.label || receipt.paymentMethod;

  return (
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
              <div className="flex items-center gap-2 justify-center mt-2">
                <span className="text-2xl font-black text-primary">#{receipt.queueNumber}</span>
                <span className="text-xs text-gray-400 font-bold">No. Antrian</span>
              </div>
              <p className="text-xs text-gray-400 font-medium mt-1">Struk #{receipt.txId.toUpperCase()}</p>
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
              {receipt.customerName && (
                <p className="text-[11px] text-white/90 mt-1 font-bold">Pelanggan: {receipt.customerName}</p>
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
              {receipt.catatan && (
                <p className="text-xs text-gray-400 italic pt-1">Catatan: {receipt.catatan}</p>
              )}
            </div>

            {/* Totals */}
            <div className="px-5 py-4 space-y-2 border-b border-dashed border-gray-200">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span>
                <span className="font-bold text-[#1A1A2E]">{formatRp(receipt.subtotal)}</span>
              </div>
              {receipt.discountAmount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Diskon {receipt.discountMode === 'persen' ? `(${receipt.discountValue}%)` : ''}</span>
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
                <span className="font-bold text-[#1A1A2E]">{paymentLabel}</span>
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
      <div className="flex-shrink-0 p-4 bg-white border-t border-gray-100 space-y-2">
        {/* Top row: Print + WhatsApp */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => openPrintWindow(buildReceiptHtml(receipt, storeSettings))}
            className="flex-1 h-11 rounded-2xl font-bold border-gray-200 text-gray-600 gap-2"
          >
            <Printer className="w-4 h-4" /> Cetak Struk
          </Button>
          <Button
            onClick={sendToWhatsApp}
            className="flex-1 h-11 rounded-2xl font-bold bg-green-500 hover:bg-green-600 text-white gap-2"
          >
            <MessageCircle className="w-4 h-4" /> Kirim WA
          </Button>
        </div>
        {/* Bottom row: Labels + New */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => openPrintWindow(buildBarcodeLabelsHtml(receipt.items, storeSettings.name))}
            className="flex-1 h-10 rounded-2xl font-bold border-gray-200 text-gray-500 gap-2 text-xs"
          >
            <Hash className="w-3.5 h-3.5" /> Label Barcode
          </Button>
          <Button
            onClick={onNewOrder}
            className="flex-1 h-10 orange-gradient text-white font-black rounded-2xl shadow-lg shadow-brand-200 gap-2 text-sm"
          >
            <Receipt className="w-4 h-4" /> Transaksi Baru
          </Button>
        </div>
      </div>
    </div>
  );
}

