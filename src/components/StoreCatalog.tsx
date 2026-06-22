import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, X, MessageCircle, ShoppingCart, Plus, Minus,
  MapPin, Phone, Star, ChevronLeft, Store, Clock,
  ArrowLeft, Package, ChevronRight, Info, Check
} from 'lucide-react';
import { db, collection, getDocs, doc, getDoc } from '../lib/firebase';
import { Product, StoreSettings } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatRp(n: number) {
  return 'Rp\u00A0' + Math.round(n).toLocaleString('id-ID');
}

// ─── Types ────────────────────────────────────────────────────────────────────
type CartItem = {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  price: number;
  qty: number;
  foto?: string;
};

interface StoreCatalogProps {
  userId: string;
  onBack?: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StoreCatalog({ userId, onBack }: StoreCatalogProps) {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [settings, setSettings] = React.useState<StoreSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  // UI state
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showSearch, setShowSearch] = React.useState(false);
  const [activeCategory, setActiveCategory] = React.useState('Semua');
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = React.useState<string>('');
  const [detailQty, setDetailQty] = React.useState(1);
  const [showCart, setShowCart] = React.useState(false);
  const [buyerName, setBuyerName] = React.useState('');
  const [buyerNote, setBuyerNote] = React.useState('');
  const [isScrolled, setIsScrolled] = React.useState(false);

  const searchRef = React.useRef<HTMLInputElement>(null);
  const categoryBarRef = React.useRef<HTMLDivElement>(null);
  const sectionRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  // ─── Load data ──────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!userId) { setError('Link toko tidak valid.'); setLoading(false); return; }
    Promise.all([
      getDocs(collection(db, `users/${userId}/hpp`)),
      getDoc(doc(db, `users/${userId}/profil_toko/settings`))
    ]).then(([prodSnap, settingsSnap]) => {
      const prods = prodSnap.docs
        .map(d => ({ ...d.data(), id: d.id } as Product))
        .filter(p => p.varian?.some(v => v.harga_jual > 0));
      setProducts(prods);
      if (settingsSnap.exists()) setSettings(settingsSnap.data() as StoreSettings);
      setLoading(false);
    }).catch(() => {
      setError('Gagal memuat katalog. Coba lagi nanti.');
      setLoading(false);
    });
  }, [userId]);

  // ─── Scroll detection ───────────────────────────────────────────────────────
  React.useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 160);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ─── Categories ─────────────────────────────────────────────────────────────
  const categories = React.useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => { if (p.kategori) cats.add(p.kategori); });
    return cats.size > 0 ? ['Semua', ...Array.from(cats).sort()] : [];
  }, [products]);

  // ─── Filtered products ──────────────────────────────────────────────────────
  const filteredProducts = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter(p => {
      const matchCat = activeCategory === 'Semua' || p.kategori === activeCategory;
      const matchQ = !q || p.nama.toLowerCase().includes(q) ||
        p.varian.some(v => v.nama.toLowerCase().includes(q)) ||
        (p.deskripsi || '').toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [products, searchQuery, activeCategory]);

  // Group by category for section rendering
  const sections = React.useMemo(() => {
    if (activeCategory !== 'Semua' || searchQuery) {
      return [{ title: activeCategory === 'Semua' ? 'Hasil Pencarian' : activeCategory, items: filteredProducts }];
    }
    // Group by category
    const grouped = new Map<string, Product[]>();
    const noCat: Product[] = [];
    products.forEach(p => {
      if (p.kategori) {
        if (!grouped.has(p.kategori)) grouped.set(p.kategori, []);
        grouped.get(p.kategori)!.push(p);
      } else {
        noCat.push(p);
      }
    });
    const result: { title: string; items: Product[] }[] = [];
    grouped.forEach((items, title) => result.push({ title, items }));
    if (noCat.length) result.push({ title: 'Lainnya', items: noCat });
    return result;
  }, [products, activeCategory, filteredProducts, searchQuery]);

  // ─── Cart helpers ────────────────────────────────────────────────────────────
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const getCartQty = (variantId: string) =>
    cart.find(i => i.variantId === variantId)?.qty || 0;

  const getProductCartQty = (productId: string) =>
    cart.filter(i => i.productId === productId).reduce((s, i) => s + i.qty, 0);

  const addToCart = (product: Product, variantId: string, qty = 1) => {
    const variant = product.varian.find(v => v.id === variantId);
    if (!variant) return;
    setCart(prev => {
      const existing = prev.find(i => i.variantId === variantId);
      if (existing) return prev.map(i => i.variantId === variantId ? { ...i, qty: i.qty + qty } : i);
      return [...prev, {
        productId: product.id,
        productName: product.nama,
        variantId,
        variantName: variant.nama,
        price: variant.harga_jual,
        qty,
        foto: product.foto,
      }];
    });
  };

  const updateCartQty = (variantId: string, delta: number) => {
    setCart(prev => prev.map(i => i.variantId === variantId ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));
  };

  // ─── Product detail sheet ───────────────────────────────────────────────────
  const openDetail = (product: Product) => {
    const sellable = product.varian.filter(v => v.harga_jual > 0);
    setSelectedProduct(product);
    setSelectedVariantId(sellable[0]?.id || '');
    setDetailQty(1);
  };

  const handleAddFromDetail = () => {
    if (!selectedProduct || !selectedVariantId) return;
    addToCart(selectedProduct, selectedVariantId, detailQty);
    setSelectedProduct(null);
  };

  // ─── WhatsApp send ──────────────────────────────────────────────────────────
  const sendWhatsApp = () => {
    const phone = (settings?.phone || '').replace(/\D/g, '');
    const storeName = settings?.name || 'Toko';
    const lines: string[] = [`*Halo ${storeName}!*\n\nSaya mau pesan:\n`];
    cart.forEach(item => {
      const label = item.variantName !== item.productName
        ? `${item.productName} - ${item.variantName}`
        : item.productName;
      lines.push(`• ${label} ×${item.qty} = ${formatRp(item.price * item.qty)}`);
    });
    lines.push(`\n*Total: ${formatRp(cartTotal)}*`);
    if (buyerName) lines.push(`Nama: ${buyerName}`);
    if (buyerNote) lines.push(`Catatan: ${buyerNote}`);
    const text = lines.join('\n');
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const storeName = settings?.name || 'Katalog Toko';

  // ─── Loading / Error ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-[#EE2D2D]/20 border-t-[#EE2D2D] rounded-full animate-spin" />
        <p className="text-gray-400 font-bold text-sm">Memuat menu...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <Store className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-black text-gray-800">Toko Tidak Ditemukan</h2>
        <p className="text-gray-400 text-sm">{error}</p>
      </div>
    );
  }

  const selectedVariant = selectedProduct?.varian.find(v => v.id === selectedVariantId);

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Sticky top bar ─────────────────────────────────────────────────── */}
      <div className={`fixed top-0 left-0 right-0 z-30 transition-all duration-300 ${isScrolled ? 'bg-white shadow-md' : 'bg-transparent'}`}>
        <div className="max-w-xl mx-auto">
          {isScrolled ? (
            <div className="flex items-center gap-3 px-4 h-14">
              {onBack && (
                <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-600">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <span className="flex-1 text-base font-black text-gray-900 truncate">{storeName}</span>
              <button
                onClick={() => { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 100); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-600"
              >
                <Search className="w-4 h-4" />
              </button>
              {cartCount > 0 && (
                <button onClick={() => setShowCart(true)} className="relative w-8 h-8 flex items-center justify-center rounded-full bg-[#EE2D2D] text-white">
                  <ShoppingCart className="w-4 h-4" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-400 text-[9px] font-black flex items-center justify-center">{cartCount}</span>
                </button>
              )}
            </div>
          ) : (
            /* Transparent top bar over hero */
            <div className="flex items-center justify-between px-4 pt-10 pb-2">
              {onBack && (
                <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm text-gray-700 shadow-sm">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <div className="flex-1" />
              {cartCount > 0 && (
                <button onClick={() => setShowCart(true)} className="relative w-9 h-9 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm text-gray-700 shadow-sm">
                  <ShoppingCart className="w-4 h-4" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#EE2D2D] text-white text-[9px] font-black flex items-center justify-center">{cartCount}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Search overlay ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-white flex flex-col"
          >
            <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-100">
              <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="text-gray-500">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={`Cari di ${storeName}...`}
                className="flex-1 text-sm font-medium outline-none text-gray-800 placeholder-gray-400"
                autoFocus
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Search results */}
            <div className="flex-1 overflow-y-auto">
              {searchQuery ? (
                filteredProducts.length > 0 ? (
                  <div className="divide-y divide-gray-50">
                    {filteredProducts.map(p => (
                      <ProductListItem
                        key={p.id}
                        product={p}
                        cart={cart}
                        onOpen={prod => { setShowSearch(false); openDetail(prod); }}
                        onQtyChange={updateCartQty}
                        onQuickAdd={(prod, vId) => addToCart(prod, vId)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                    <Search className="w-10 h-10 text-gray-200" />
                    <p className="font-bold text-gray-400 text-sm">Menu tidak ditemukan</p>
                  </div>
                )
              ) : (
                <div className="p-4 space-y-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">Semua Kategori</p>
                  {categories.filter(c => c !== 'Semua').map(cat => (
                    <button
                      key={cat}
                      onClick={() => { setActiveCategory(cat); setShowSearch(false); }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-gray-50 text-left hover:bg-gray-100 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#EE2D2D]/10 flex items-center justify-center flex-shrink-0">
                        <Package className="w-4 h-4 text-[#EE2D2D]" />
                      </div>
                      <span className="text-sm font-bold text-gray-700">{cat}</span>
                      <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hero / Store header ─────────────────────────────────────────────── */}
      <div className="relative">
        {/* Banner */}
        <div className="h-44 bg-gradient-to-br from-[#EE2D2D] via-[#E85D1A] to-[#F2A93B] relative overflow-hidden">
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.3) 0%, transparent 50%)'
          }} />
        </div>

        {/* Store info card */}
        <div className="max-w-xl mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-md -mt-5 mx-0 p-4 relative z-10">
            <div className="flex items-start gap-3">
              {/* Logo */}
              <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0 border-2 border-white shadow-sm -mt-8">
                {settings?.logo ? (
                  <img src={settings.logo} alt={storeName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#EE2D2D] to-[#E85D1A]">
                    <Store className="w-7 h-7 text-white" />
                  </div>
                )}
              </div>

              {/* Name + Info */}
              <div className="flex-1 min-w-0 pt-1">
                <h1 className="text-base font-black text-gray-900 leading-tight">{storeName}</h1>
                {settings?.tagline && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{settings.tagline}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-[11px] font-bold text-green-600">Buka</span>
                  </div>
                  {settings?.address && (
                    <span className="flex items-center gap-1 text-[11px] text-gray-400">
                      <MapPin className="w-3 h-3" /> {settings.address}
                    </span>
                  )}
                  {settings?.phone && (
                    <span className="flex items-center gap-1 text-[11px] text-gray-400">
                      <Phone className="w-3 h-3" /> {settings.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
                <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                <span className="font-black text-gray-700">4.9</span>
                <span className="text-gray-400">(100+ rating)</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <span>Estimasi 15-30 menit</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sticky search bar ──────────────────────────────────────────────── */}
      <div className="sticky top-14 z-20 bg-[#F5F5F5] max-w-xl mx-auto px-4 py-3">
        <button
          onClick={() => { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 100); }}
          className="w-full flex items-center gap-2 bg-white rounded-xl h-10 px-3 shadow-sm border border-gray-100 text-left"
        >
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-400 font-medium flex-1">Cari menu...</span>
        </button>
      </div>

      {/* ── Category tabs ──────────────────────────────────────────────────── */}
      {categories.length > 2 && (
        <div className="sticky top-28 z-20 bg-[#F5F5F5]">
          <div
            ref={categoryBarRef}
            className="flex gap-2 overflow-x-auto hide-scrollbar px-4 pb-2"
          >
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => {
                  setActiveCategory(cat);
                  // Scroll to section
                  const el = sectionRefs.current[cat === 'Semua' ? (sections[0]?.title || '') : cat];
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-black transition-all border ${
                  activeCategory === cat
                    ? 'bg-[#EE2D2D] text-white border-[#EE2D2D] shadow-sm shadow-red-200'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Product sections ───────────────────────────────────────────────── */}
      <div className="max-w-xl mx-auto pb-36 space-y-3 px-4 pt-2">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <Package className="w-8 h-8 text-gray-300" />
            </div>
            <p className="font-black text-gray-400">Belum ada menu tersedia</p>
          </div>
        ) : sections.map(section => (
          <div
            key={section.title}
            ref={el => { sectionRefs.current[section.title] = el; }}
            className="bg-white rounded-2xl overflow-hidden shadow-sm"
          >
            {/* Section header */}
            <div className="px-4 pt-4 pb-3 border-b border-gray-50">
              <h2 className="text-base font-black text-gray-900">{section.title}</h2>
              <p className="text-xs text-gray-400 font-medium mt-0.5">{section.items.length} menu</p>
            </div>

            {/* Product list */}
            <div className="divide-y divide-gray-50">
              {section.items.map(product => (
                <ProductListItem
                  key={product.id}
                  product={product}
                  cart={cart}
                  onOpen={openDetail}
                  onQtyChange={updateCartQty}
                  onQuickAdd={(prod, vId) => addToCart(prod, vId)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Floating cart bar ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {cartCount > 0 && !showCart && !selectedProduct && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-6 pt-2 max-w-xl mx-auto"
            style={{ left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '576px' }}
          >
            <button
              onClick={() => setShowCart(true)}
              className="w-full h-14 bg-[#EE2D2D] text-white rounded-2xl flex items-center px-4 gap-3 shadow-xl shadow-red-200"
            >
              <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-black">{cartCount}</span>
              </div>
              <span className="flex-1 text-left text-sm font-black">Lihat Keranjang</span>
              <span className="text-sm font-black">{formatRp(cartTotal)}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Product detail bottom sheet ───────────────────────────────────── */}
      <AnimatePresence>
        {selectedProduct && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
              onClick={() => setSelectedProduct(null)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[90dvh] flex flex-col max-w-xl mx-auto"
              style={{ left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '576px' }}
            >
              {/* Close handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center z-10"
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>

              <div className="flex-1 overflow-y-auto">
                {/* Product photo */}
                <div className="w-full aspect-[4/3] bg-gray-100 overflow-hidden relative flex-shrink-0">
                  {selectedProduct.foto ? (
                    <img src={selectedProduct.foto} alt={selectedProduct.nama} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-16 h-16 text-gray-200" />
                    </div>
                  )}
                </div>

                <div className="p-4 space-y-4">
                  {/* Name + description */}
                  <div>
                    <h2 className="text-xl font-black text-gray-900 leading-tight">{selectedProduct.nama}</h2>
                    {selectedProduct.deskripsi && (
                      <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{selectedProduct.deskripsi}</p>
                    )}
                  </div>

                  {/* Variant picker */}
                  {selectedProduct.varian.filter(v => v.harga_jual > 0).length > 1 && (
                    <div>
                      <p className="text-sm font-black text-gray-800 mb-2">Pilih Varian</p>
                      <div className="space-y-2">
                        {selectedProduct.varian.filter(v => v.harga_jual > 0).map(v => (
                          <button
                            key={v.id}
                            onClick={() => setSelectedVariantId(v.id)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
                              selectedVariantId === v.id
                                ? 'border-[#EE2D2D] bg-red-50'
                                : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                selectedVariantId === v.id ? 'border-[#EE2D2D] bg-[#EE2D2D]' : 'border-gray-300'
                              }`}>
                                {selectedVariantId === v.id && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                              </div>
                              <span className={`text-sm font-bold ${selectedVariantId === v.id ? 'text-[#EE2D2D]' : 'text-gray-700'}`}>
                                {v.nama !== selectedProduct.nama ? v.nama : 'Standar'}
                              </span>
                            </div>
                            <span className={`text-sm font-black ${selectedVariantId === v.id ? 'text-[#EE2D2D]' : 'text-gray-800'}`}>
                              {formatRp(v.harga_jual)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Qty + note */}
                  <div>
                    <p className="text-sm font-black text-gray-800 mb-2">Jumlah</p>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setDetailQty(q => Math.max(1, q - 1))}
                        className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:border-gray-300 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="text-xl font-black text-gray-900 w-8 text-center">{detailQty}</span>
                      <button
                        onClick={() => setDetailQty(q => q + 1)}
                        className="w-10 h-10 rounded-full bg-[#EE2D2D] flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-black text-gray-800 mb-2">Catatan <span className="text-gray-400 font-medium">(opsional)</span></p>
                    <textarea
                      placeholder="Contoh: tanpa pedas, ekstra sambel..."
                      className="w-full h-16 px-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 resize-none outline-none focus:ring-2 focus:ring-[#EE2D2D]/30 focus:border-[#EE2D2D] text-gray-700 placeholder-gray-400"
                    />
                  </div>

                  {/* Spacer for bottom bar */}
                  <div className="h-4" />
                </div>
              </div>

              {/* Add to cart button */}
              <div className="px-4 pb-6 pt-3 border-t border-gray-100 flex-shrink-0 bg-white">
                <button
                  onClick={handleAddFromDetail}
                  className="w-full h-13 bg-[#EE2D2D] text-white rounded-2xl flex items-center justify-between px-5 shadow-lg shadow-red-100 hover:bg-red-600 active:scale-[0.98] transition-all"
                  style={{ height: '52px' }}
                >
                  <span className="text-sm font-black">Tambah ke Keranjang</span>
                  <span className="text-sm font-black">
                    {selectedVariant ? formatRp(selectedVariant.harga_jual * detailQty) : ''}
                  </span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Cart sheet ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
              onClick={() => setShowCart(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[88dvh] flex flex-col max-w-xl mx-auto"
              style={{ left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '576px' }}
            >
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
                <h2 className="text-lg font-black text-gray-900">Keranjang</h2>
                <button onClick={() => setShowCart(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {/* Cart items */}
                <div className="bg-gray-50 rounded-2xl overflow-hidden divide-y divide-gray-100">
                  {cart.map(item => (
                    <div key={item.variantId} className="flex items-center gap-3 p-3">
                      {item.foto ? (
                        <img src={item.foto} alt={item.productName} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gray-200 flex items-center justify-center flex-shrink-0">
                          <Package className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-gray-800 truncate">{item.productName}</p>
                        {item.variantName !== item.productName && (
                          <p className="text-xs text-gray-400 font-medium">{item.variantName}</p>
                        )}
                        <p className="text-sm font-black text-[#EE2D2D] mt-0.5">{formatRp(item.price * item.qty)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => updateCartQty(item.variantId, -1)}
                          className="w-7 h-7 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-600"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-black w-5 text-center">{item.qty}</span>
                        <button
                          onClick={() => updateCartQty(item.variantId, 1)}
                          className="w-7 h-7 rounded-full bg-[#EE2D2D] flex items-center justify-center text-white"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Buyer info */}
                <div className="space-y-2">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Informasi Pembeli</p>
                  <input
                    value={buyerName}
                    onChange={e => setBuyerName(e.target.value)}
                    placeholder="Nama kamu (opsional)"
                    className="w-full h-11 px-3 text-sm rounded-xl border border-gray-200 bg-gray-50 outline-none focus:ring-2 focus:ring-[#EE2D2D]/30 focus:border-[#EE2D2D] font-medium text-gray-700 placeholder-gray-400"
                  />
                  <textarea
                    value={buyerNote}
                    onChange={e => setBuyerNote(e.target.value)}
                    placeholder="Catatan tambahan untuk toko (opsional)"
                    className="w-full h-16 px-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 resize-none outline-none focus:ring-2 focus:ring-[#EE2D2D]/30 focus:border-[#EE2D2D] font-medium text-gray-700 placeholder-gray-400"
                  />
                </div>

                {/* Price breakdown */}
                <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3">Rincian Harga</p>
                  {cart.map(item => (
                    <div key={item.variantId} className="flex justify-between text-sm">
                      <span className="text-gray-600 font-medium truncate flex-1 mr-2">
                        {item.productName}{item.variantName !== item.productName ? ` (${item.variantName})` : ''} ×{item.qty}
                      </span>
                      <span className="text-gray-800 font-bold flex-shrink-0">{formatRp(item.price * item.qty)}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-gray-200 flex justify-between">
                    <span className="text-base font-black text-gray-900">Total</span>
                    <span className="text-base font-black text-[#EE2D2D]">{formatRp(cartTotal)}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2 bg-blue-50 rounded-xl p-3">
                  <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-600 font-medium leading-relaxed">
                    Pesanan akan dikirim via WhatsApp ke penjual. Penjual akan konfirmasi ketersediaan & total tagihan sebelum pembayaran.
                  </p>
                </div>

                <div className="h-2" />
              </div>

              {/* Send button */}
              <div className="px-4 pb-6 pt-3 border-t border-gray-100 flex-shrink-0 bg-white">
                <button
                  onClick={sendWhatsApp}
                  className="w-full h-14 bg-[#25D366] text-white rounded-2xl flex items-center justify-center gap-2.5 shadow-lg shadow-green-100 hover:bg-green-500 active:scale-[0.98] transition-all"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span className="text-base font-black">Pesan via WhatsApp</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── ProductListItem ──────────────────────────────────────────────────────────
function ProductListItem({
  product,
  cart,
  onOpen,
  onQtyChange,
  onQuickAdd,
}: {
  product: Product;
  cart: CartItem[];
  onOpen: (p: Product) => void;
  onQtyChange: (variantId: string, delta: number) => void;
  onQuickAdd: (product: Product, variantId: string) => void;
}) {
  const sellable = product.varian.filter(v => v.harga_jual > 0);
  const minPrice = Math.min(...sellable.map(v => v.harga_jual));
  const maxPrice = Math.max(...sellable.map(v => v.harga_jual));
  const isSingleVariant = sellable.length === 1;
  const singleVariant = isSingleVariant ? sellable[0] : null;
  const cartQty = singleVariant ? (cart.find(i => i.variantId === singleVariant.id)?.qty || 0) : 0;
  const totalInCart = cart.filter(i => i.productId === product.id).reduce((s, i) => s + i.qty, 0);

  return (
    <button
      onClick={() => onOpen(product)}
      className="w-full flex items-start gap-3 p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
    >
      {/* Left: text */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start gap-2">
          {totalInCart > 0 && (
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#EE2D2D] text-white text-[9px] font-black flex items-center justify-center mt-0.5">
              {totalInCart}
            </span>
          )}
          <p className="text-sm font-black text-gray-900 leading-tight line-clamp-2">{product.nama}</p>
        </div>
        {product.deskripsi && (
          <p className="text-xs text-gray-400 font-medium line-clamp-2 leading-relaxed">{product.deskripsi}</p>
        )}
        <p className="text-sm font-black text-gray-800 pt-0.5">
          {minPrice === maxPrice ? formatRp(minPrice) : `${formatRp(minPrice)} – ${formatRp(maxPrice)}`}
        </p>

        {/* Qty controls for single-variant products */}
        {isSingleVariant && (
          <div onClick={e => e.stopPropagation()} className="pt-1">
            {cartQty > 0 ? (
              <div className="inline-flex items-center gap-2 bg-red-50 rounded-full px-1 py-1">
                <button
                  onClick={() => onQtyChange(singleVariant!.id, -1)}
                  className="w-7 h-7 rounded-full bg-[#EE2D2D] text-white flex items-center justify-center shadow-sm"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-sm font-black text-[#EE2D2D] w-5 text-center">{cartQty}</span>
                <button
                  onClick={() => onQtyChange(singleVariant!.id, 1)}
                  className="w-7 h-7 rounded-full bg-[#EE2D2D] text-white flex items-center justify-center shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); onOpen(product); }}
                className="inline-flex items-center gap-1 text-xs font-black text-[#EE2D2D] bg-red-50 px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors"
              >
                <Plus className="w-3 h-3" /> Tambah
              </button>
            )}
          </div>
        )}

        {/* Multi-variant label */}
        {!isSingleVariant && (
          <p className="text-[11px] text-gray-400 font-medium">{sellable.length} pilihan</p>
        )}
      </div>

      {/* Right: photo */}
      <div className="relative flex-shrink-0">
        <div className="w-24 h-24 rounded-2xl overflow-hidden bg-gray-100">
          {product.foto ? (
            <img src={product.foto} alt={product.nama} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-8 h-8 text-gray-200" />
            </div>
          )}
        </div>
        {/* Multi-variant: "+" floating button on photo */}
        {!isSingleVariant && (
          <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-[#EE2D2D] text-white flex items-center justify-center shadow-md border-2 border-white">
            <Plus className="w-4 h-4" />
          </div>
        )}
      </div>
    </button>
  );
}
