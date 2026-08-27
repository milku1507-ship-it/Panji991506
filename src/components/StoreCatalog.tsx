import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, X, MessageCircle, ShoppingCart, Plus, Minus,
  MapPin, Phone, Star, ChevronLeft, Store, Clock,
  Package, Check, Info, ArrowLeft, TrendingUp
} from 'lucide-react';
import { db, collection, getDocs, doc, getDoc } from '../lib/firebase';
import { Product, StoreSettings } from '../types';

function formatRp(n: number) {
  return Math.round(n).toLocaleString('id-ID');
}

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

// ─── GoFood green / red ───────────────────────────────────────────────────────
const GF_GREEN = '#179749';
const GF_RED   = '#EE1C25';

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function StoreCatalog({ userId, onBack }: StoreCatalogProps) {
  const [products, setProducts]   = React.useState<Product[]>([]);
  const [settings, setSettings]   = React.useState<StoreSettings | null>(null);
  const [loading, setLoading]     = React.useState(true);
  const [error, setError]         = React.useState('');

  const [searchQuery, setSearchQuery]   = React.useState('');
  const [showSearch, setShowSearch]     = React.useState(false);
  const [activeTab, setActiveTab]       = React.useState('Semua');
  const [cart, setCart]                 = React.useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = React.useState('');
  const [detailQty, setDetailQty]       = React.useState(1);
  const [detailNote, setDetailNote]     = React.useState('');
  const [showCart, setShowCart]         = React.useState(false);
  const [buyerName, setBuyerName]       = React.useState('');
  const [buyerNote, setBuyerNote]       = React.useState('');
  const [isScrolled, setIsScrolled]     = React.useState(false);

  const searchInputRef  = React.useRef<HTMLInputElement>(null);
  const tabBarRef       = React.useRef<HTMLDivElement>(null);
  const sectionRefs     = React.useRef<Record<string, HTMLDivElement | null>>({});

  // ── Load ──────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!userId) { setError('Link toko tidak valid.'); setLoading(false); return; }
    Promise.all([
      getDocs(collection(db, `users/${userId}/hpp`)),
      getDoc(doc(db, `users/${userId}/profil_toko/settings`)),
    ]).then(([prodSnap, settingsSnap]) => {
      const prods = prodSnap.docs
        .map(d => ({ ...d.data(), id: d.id } as Product))
        .filter(p => p.varian?.some(v => v.harga_jual > 0));
      setProducts(prods);
      if (settingsSnap.exists()) setSettings(settingsSnap.data() as StoreSettings);
      setLoading(false);
    }).catch(() => { setError('Gagal memuat katalog.'); setLoading(false); });
  }, [userId]);

  // ── Scroll detection ──────────────────────────────────────────────────────
  React.useEffect(() => {
    const fn = () => setIsScrolled(window.scrollY > 200);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  // ── Categories / tabs ─────────────────────────────────────────────────────
  const tabs = React.useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => { if (p.kategori) cats.add(p.kategori); });
    return cats.size > 0 ? ['Semua', ...Array.from(cats).sort()] : [];
  }, [products]);

  // Sections for rendering
  const sections = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = products.filter(p => {
      const matchTab = activeTab === 'Semua' || p.kategori === activeTab;
      const matchQ   = !q || p.nama.toLowerCase().includes(q) ||
        p.varian.some(v => v.nama.toLowerCase().includes(q)) ||
        (p.deskripsi || '').toLowerCase().includes(q);
      return matchTab && matchQ;
    });

    if (activeTab !== 'Semua' || q) {
      return [{ title: activeTab !== 'Semua' ? activeTab : 'Hasil Pencarian', items: filtered }];
    }
    // Group by category
    const grouped = new Map<string, Product[]>();
    const noCat: Product[] = [];
    products.forEach(p => {
      if (p.kategori) { if (!grouped.has(p.kategori)) grouped.set(p.kategori, []); grouped.get(p.kategori)!.push(p); }
      else noCat.push(p);
    });
    const result: { title: string; items: Product[] }[] = [];
    grouped.forEach((items, title) => result.push({ title, items }));
    if (noCat.length) result.push({ title: 'Menu Lainnya', items: noCat });
    return result;
  }, [products, activeTab, searchQuery]);

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const getVariantQty = (variantId: string) => cart.find(i => i.variantId === variantId)?.qty || 0;
  const getProductQty = (productId: string) => cart.filter(i => i.productId === productId).reduce((s, i) => s + i.qty, 0);

  const upsertCart = (product: Product, variantId: string, delta: number) => {
    const variant = product.varian.find(v => v.id === variantId);
    if (!variant) return;
    setCart(prev => {
      const existing = prev.find(i => i.variantId === variantId);
      if (existing) {
        const newQty = existing.qty + delta;
        return newQty <= 0 ? prev.filter(i => i.variantId !== variantId)
          : prev.map(i => i.variantId === variantId ? { ...i, qty: newQty } : i);
      }
      if (delta <= 0) return prev;
      return [...prev, { productId: product.id, productName: product.nama, variantId, variantName: variant.nama, price: variant.harga_jual, qty: delta, foto: product.foto }];
    });
  };

  const updateCartQty = (variantId: string, delta: number) => {
    setCart(prev => prev.map(i => i.variantId === variantId ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));
  };

  // ── Product detail ────────────────────────────────────────────────────────
  const openDetail = (product: Product) => {
    const sellable = product.varian.filter(v => v.harga_jual > 0);
    setSelectedProduct(product);
    setSelectedVariantId(sellable[0]?.id || '');
    setDetailQty(1);
    setDetailNote('');
  };

  const confirmDetail = () => {
    if (!selectedProduct || !selectedVariantId) return;
    const variant = selectedProduct.varian.find(v => v.id === selectedVariantId)!;
    setCart(prev => {
      const existing = prev.find(i => i.variantId === selectedVariantId);
      if (existing) return prev.map(i => i.variantId === selectedVariantId ? { ...i, qty: i.qty + detailQty } : i);
      return [...prev, { productId: selectedProduct.id, productName: selectedProduct.nama, variantId: selectedVariantId, variantName: variant.nama, price: variant.harga_jual, qty: detailQty, foto: selectedProduct.foto }];
    });
    setSelectedProduct(null);
  };

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  const sendWhatsApp = () => {
    const phone = (settings?.phone || '').replace(/\D/g, '');
    const lines = [`*Halo ${settings?.name || 'Kak'}!* Saya mau pesan:\n`];
    cart.forEach(item => {
      const label = item.variantName !== item.productName ? `${item.productName} - ${item.variantName}` : item.productName;
      lines.push(`• ${label} ×${item.qty} = Rp${formatRp(item.price * item.qty)}`);
    });
    lines.push(`\n*Total: Rp${formatRp(cartTotal)}*`);
    if (buyerName) lines.push(`Nama: ${buyerName}`);
    if (buyerNote) lines.push(`Catatan: ${buyerNote}`);
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`
      : `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url, '_blank');
  };

  const storeName = settings?.name || 'Katalog Toko';

  // ── Loading / Error ───────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-4 border-gray-100 border-t-red-500 rounded-full animate-spin" />
      <p className="text-gray-400 text-sm font-bold">Memuat menu...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 p-8 text-center">
      <Store className="w-12 h-12 text-gray-200" />
      <h2 className="text-xl font-black text-gray-800">Toko Tidak Ditemukan</h2>
      <p className="text-gray-400 text-sm">{error}</p>
    </div>
  );

  const selectedVariant = selectedProduct?.varian.find(v => v.id === selectedVariantId);

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ WebkitFontSmoothing: 'antialiased' }}>

      {/* ── Sticky compact header (appears after scroll) ─────────────────── */}
      <div className={`fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-100 transition-all duration-200 ${isScrolled ? 'translate-y-0 shadow-sm' : '-translate-y-full'}`}>
        <div className="max-w-xl mx-auto flex items-center gap-3 px-4 h-14">
          {onBack && (
            <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-600">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <span className="flex-1 text-base font-black text-gray-900 truncate">{storeName}</span>
          <button onClick={() => { setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 80); }}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <Search className="w-5 h-5 text-gray-600" />
          </button>
          {cartCount > 0 && (
            <button onClick={() => setShowCart(true)}
              className="relative w-9 h-9 flex items-center justify-center rounded-full"
              style={{ backgroundColor: GF_GREEN }}>
              <ShoppingCart className="w-4 h-4 text-white" />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">{cartCount}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Search overlay ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showSearch && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-white flex flex-col">
            <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-100">
              <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="text-gray-500 hover:text-gray-700">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <input ref={searchInputRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder={`Cari menu di ${storeName}...`}
                className="flex-1 text-sm font-medium outline-none text-gray-800 placeholder-gray-400" autoFocus />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-gray-400"><X className="w-4 h-4" /></button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto bg-white divide-y divide-gray-50">
              {searchQuery ? (
                sections.flatMap(s => s.items).length > 0 ? (
                  sections.flatMap(s => s.items).map(p => (
                    <MenuListItem key={p.id} product={p} cart={cart}
                      onOpen={() => { setShowSearch(false); openDetail(p); }}
                      onQtyChange={updateCartQty}
                      onQuickAdd={(vId) => upsertCart(p, vId, 1)} />
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                    <Search className="w-10 h-10 text-gray-200" />
                    <p className="font-bold text-gray-400 text-sm">Menu tidak ditemukan</p>
                  </div>
                )
              ) : (
                <div className="p-4">
                  <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Kategori</p>
                  {tabs.filter(t => t !== 'Semua').map(cat => (
                    <button key={cat} onClick={() => { setActiveTab(cat); setShowSearch(false); }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-left">
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                        <Package className="w-4 h-4 text-red-500" />
                      </div>
                      <span className="text-sm font-bold text-gray-700 flex-1">{cat}</span>
                      <span className="text-xs text-gray-400">{products.filter(p => p.kategori === cat).length} menu</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HERO BANNER ──────────────────────────────────────────────────── */}
      <div className="relative">
        {/* Banner image / gradient */}
        <div className="w-full h-52 relative overflow-hidden">
          {settings?.banner ? (
            <img src={settings.banner} alt="Banner toko" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#EE1C25] via-[#E8421A] to-[#F2A93B] flex items-center justify-center relative overflow-hidden">
              {/* decorative cutlery icon */}
              <div className="absolute top-6 right-8 text-white/20 text-8xl font-black select-none">🍴</div>
              <div className="text-center text-white px-6 relative z-10">
                <p className="text-2xl font-black leading-tight">{settings?.tagline || 'Makan enak?'}</p>
                <p className="text-lg font-bold opacity-80">{storeName}</p>
              </div>
            </div>
          )}
          {/* Top overlay buttons */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-10 pb-2">
            {onBack && (
              <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm shadow-sm text-gray-700 hover:bg-white transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="ml-auto">
              {cartCount > 0 && (
                <button onClick={() => setShowCart(true)}
                  className="relative w-9 h-9 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm shadow-sm text-gray-700">
                  <ShoppingCart className="w-4 h-4" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[9px] font-black flex items-center justify-center"
                    style={{ backgroundColor: GF_GREEN }}>{cartCount}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Store info card ──────────────────────────────────────────── */}
        <div className="max-w-xl mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-md -mt-4 relative z-10 p-4">
            <div className="flex items-start gap-3">
              {/* Logo */}
              <div className="w-16 h-16 rounded-2xl border-2 border-white shadow overflow-hidden bg-gray-100 flex-shrink-0 -mt-8">
                {settings?.logo ? (
                  <img src={settings.logo} alt={storeName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${GF_RED}, #E85D1A)` }}>
                    <Store className="w-7 h-7 text-white" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h1 className="text-base font-black text-gray-900 leading-tight">{storeName}</h1>
                  {/* Rating badge */}
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg flex-shrink-0"
                    style={{ backgroundColor: GF_GREEN }}>
                    <Star className="w-3 h-3 text-white fill-white" />
                    <span className="text-[11px] font-black text-white">4.9</span>
                  </div>
                </div>
                {settings?.tagline && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{settings.tagline}</p>}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1 text-green-600 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    Buka
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    15–30 menit
                  </span>
                  {settings?.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate max-w-[120px]">{settings.address}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Phone */}
            {settings?.phone && (
              <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-1.5 text-xs text-gray-400">
                <Phone className="w-3 h-3" />
                <span>{settings.phone}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Search bar ───────────────────────────────────────────────────── */}
      <div className="max-w-xl mx-auto px-4 pt-3 pb-1">
        <button
          onClick={() => { setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 80); }}
          className="w-full flex items-center gap-2.5 bg-white rounded-xl h-11 px-4 shadow-sm border border-gray-100 text-left"
        >
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-400 font-medium">Cari menu...</span>
        </button>
      </div>

      {/* ── Category tabs (GoFood underline style) ───────────────────────── */}
      {tabs.length > 2 && (
        <div className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
          <div ref={tabBarRef} className="max-w-xl mx-auto flex gap-0 overflow-x-auto hide-scrollbar">
            {tabs.map(tab => {
              const count = tab === 'Semua' ? products.length : products.filter(p => p.kategori === tab).length;
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    // scroll to section
                    const target = tab === 'Semua'
                      ? sections[0]?.title
                      : tab;
                    const el = sectionRefs.current[target];
                    if (el) { setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
                  }}
                  className={`flex-shrink-0 px-4 py-3 text-sm font-black transition-colors relative ${active ? 'text-red-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {tab} {tab !== 'Semua' && <span className={`text-xs font-bold ${active ? 'text-red-400' : 'text-gray-400'}`}>({count})</span>}
                  {active && <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ backgroundColor: GF_RED }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Menu sections ────────────────────────────────────────────────── */}
      <div className="max-w-xl mx-auto pb-32 pt-3 space-y-3 px-4">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Package className="w-12 h-12 text-gray-200" />
            <p className="font-black text-gray-400">Belum ada menu</p>
          </div>
        ) : sections.map(section => (
          <div
            key={section.title}
            ref={el => { sectionRefs.current[section.title] = el; }}
            className="bg-white rounded-2xl overflow-hidden shadow-sm"
          >
            {/* Section header */}
            <div className="px-4 pt-4 pb-3">
              <h2 className="text-base font-black text-gray-900">{section.title}</h2>
              <p className="text-xs text-gray-400">{section.items.length} menu</p>
            </div>
            <div className="divide-y divide-gray-50">
              {section.items.map(product => (
                <MenuListItem
                  key={product.id}
                  product={product}
                  cart={cart}
                  onOpen={openDetail}
                  onQtyChange={updateCartQty}
                  onQuickAdd={(vId) => upsertCart(product, vId, 1)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Bottom cart bar (GoFood green) ───────────────────────────────── */}
      <AnimatePresence>
        {cartCount > 0 && !showCart && !selectedProduct && (
          <motion.div
            initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-5 pt-2"
          >
            <div className="max-w-xl mx-auto">
              <button
                onClick={() => setShowCart(true)}
                className="w-full h-14 rounded-2xl flex items-center px-4 gap-3 shadow-xl text-white"
                style={{ backgroundColor: GF_GREEN }}
              >
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center font-black text-sm flex-shrink-0">
                  {cartCount}
                </div>
                <span className="flex-1 text-left text-sm font-black">Lihat Keranjang</span>
                <span className="text-sm font-black">Rp{formatRp(cartTotal)}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Product detail sheet ──────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedProduct && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50" onClick={() => setSelectedProduct(null)} />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 380 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[92dvh] flex flex-col"
              style={{ maxWidth: '576px', left: '50%', transform: 'translateX(-50%)', width: '100%' }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>
              <button onClick={() => setSelectedProduct(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center z-10">
                <X className="w-4 h-4 text-gray-600" />
              </button>

              <div className="flex-1 overflow-y-auto">
                {/* Product photo header */}
                <div className="w-full aspect-[16/9] bg-gray-100 overflow-hidden relative">
                  {selectedProduct.foto ? (
                    <img src={selectedProduct.foto} alt={selectedProduct.nama} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-16 h-16 text-gray-200" />
                    </div>
                  )}
                </div>

                <div className="p-4 space-y-5">
                  {/* Name + price */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h2 className="text-xl font-black text-gray-900 leading-tight">{selectedProduct.nama}</h2>
                      {selectedProduct.deskripsi && (
                        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{selectedProduct.deskripsi}</p>
                      )}
                    </div>
                  </div>

                  {/* Variant picker */}
                  {selectedProduct.varian.filter(v => v.harga_jual > 0).length > 1 && (
                    <div>
                      <p className="text-sm font-black text-gray-800 mb-2.5">Pilih Varian</p>
                      <div className="space-y-2">
                        {selectedProduct.varian.filter(v => v.harga_jual > 0).map(v => {
                          const active = selectedVariantId === v.id;
                          return (
                            <button key={v.id} onClick={() => setSelectedVariantId(v.id)}
                              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border-2 transition-all ${active ? 'border-red-500 bg-red-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? 'border-red-500 bg-red-500' : 'border-gray-300'}`}>
                                  {active && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                </div>
                                <span className={`text-sm font-bold ${active ? 'text-red-600' : 'text-gray-700'}`}>
                                  {v.nama !== selectedProduct.nama ? v.nama : 'Standar'}
                                </span>
                              </div>
                              <span className={`text-sm font-black ${active ? 'text-red-600' : 'text-gray-900'}`}>
                                Rp{formatRp(v.harga_jual)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Catatan */}
                  <div>
                    <p className="text-sm font-black text-gray-800 mb-2">
                      Catatan <span className="text-gray-400 font-medium text-xs">(opsional)</span>
                    </p>
                    <textarea value={detailNote} onChange={e => setDetailNote(e.target.value)}
                      placeholder="Contoh: tanpa pedas, ekstra sambel, tidak pakai bawang..."
                      className="w-full h-16 px-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 resize-none outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 text-gray-700 placeholder-gray-400" />
                  </div>

                  <div className="h-2" />
                </div>
              </div>

              {/* Add to cart footer */}
              <div className="px-4 pb-6 pt-3 border-t border-gray-100 flex-shrink-0 bg-white">
                <div className="flex items-center gap-4">
                  {/* Qty stepper */}
                  <div className="flex items-center gap-3">
                    <button onClick={() => setDetailQty(q => Math.max(1, q - 1))}
                      className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:border-gray-300 transition-colors">
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-xl font-black text-gray-900 w-6 text-center">{detailQty}</span>
                    <button onClick={() => setDetailQty(q => q + 1)}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors"
                      style={{ backgroundColor: GF_RED }}>
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Add button */}
                  <button onClick={confirmDetail}
                    className="flex-1 h-12 rounded-2xl flex items-center justify-between px-5 text-white font-black text-sm shadow-sm transition-all active:scale-[0.98]"
                    style={{ backgroundColor: GF_GREEN }}>
                    <span>Tambah ke Keranjang</span>
                    <span>{selectedVariant ? `Rp${formatRp(selectedVariant.harga_jual * detailQty)}` : ''}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Cart sheet ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowCart(false)} />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 380 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[88dvh] flex flex-col"
              style={{ maxWidth: '576px', left: '50%', transform: 'translateX(-50%)', width: '100%' }}
            >
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
                <h2 className="text-lg font-black text-gray-900">Keranjang</h2>
                <button onClick={() => setShowCart(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <X className="w-4 h-4 text-gray-600" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {/* Items */}
                <div className="divide-y divide-gray-50 bg-gray-50 rounded-2xl overflow-hidden">
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
                        {item.variantName !== item.productName && <p className="text-xs text-gray-400">{item.variantName}</p>}
                        <p className="text-sm font-black mt-0.5" style={{ color: GF_GREEN }}>Rp{formatRp(item.price * item.qty)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => updateCartQty(item.variantId, -1)}
                          className="w-7 h-7 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-600">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-black w-4 text-center">{item.qty}</span>
                        <button onClick={() => updateCartQty(item.variantId, 1)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white"
                          style={{ backgroundColor: GF_GREEN }}>
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Buyer info */}
                <div className="space-y-2">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Informasi Pembeli</p>
                  <input value={buyerName} onChange={e => setBuyerName(e.target.value)}
                    placeholder="Nama kamu (opsional)"
                    className="w-full h-11 px-3 text-sm rounded-xl border border-gray-200 bg-gray-50 outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400 font-medium text-gray-700 placeholder-gray-400" />
                  <textarea value={buyerNote} onChange={e => setBuyerNote(e.target.value)}
                    placeholder="Catatan pesanan (opsional)"
                    className="w-full h-16 px-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 resize-none outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400 font-medium text-gray-700 placeholder-gray-400" />
                </div>

                {/* Price summary */}
                <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3">Rincian Pesanan</p>
                  {cart.map(item => (
                    <div key={item.variantId} className="flex justify-between text-sm">
                      <span className="text-gray-600 font-medium flex-1 mr-2 truncate">
                        {item.productName}{item.variantName !== item.productName ? ` (${item.variantName})` : ''} ×{item.qty}
                      </span>
                      <span className="text-gray-800 font-bold flex-shrink-0">Rp{formatRp(item.price * item.qty)}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-gray-200 flex justify-between">
                    <span className="text-base font-black text-gray-900">Total</span>
                    <span className="text-base font-black" style={{ color: GF_GREEN }}>Rp{formatRp(cartTotal)}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2 bg-green-50 rounded-xl p-3">
                  <Info className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-green-700 font-medium leading-relaxed">
                    Pesanan dikirim via WhatsApp ke penjual. Penjual akan konfirmasi ketersediaan & total sebelum pembayaran.
                  </p>
                </div>
                <div className="h-2" />
              </div>

              {/* WA button */}
              <div className="px-4 pb-6 pt-3 border-t border-gray-100 flex-shrink-0 bg-white">
                <button onClick={sendWhatsApp}
                  className="w-full h-14 rounded-2xl flex items-center justify-center gap-2.5 text-white font-black text-base shadow-lg transition-all active:scale-[0.98]"
                  style={{ backgroundColor: '#25D366' }}>
                  <MessageCircle className="w-5 h-5" />
                  Pesan via WhatsApp
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── MenuListItem — GoFood restaurant menu card style ─────────────────────────
function MenuListItem({
  product, cart, onOpen, onQtyChange, onQuickAdd,
}: {
  key?: React.Key;
  product: Product;
  cart: CartItem[];
  onOpen: (p: Product) => void;
  onQtyChange: (variantId: string, delta: number) => void;
  onQuickAdd: (variantId: string) => void;
}) {
  const sellable       = product.varian.filter(v => v.harga_jual > 0);
  const isSingle       = sellable.length === 1;
  const singleV        = isSingle ? sellable[0] : null;
  const cartQty        = singleV ? (cart.find(i => i.variantId === singleV.id)?.qty || 0) : 0;
  const totalCart      = cart.filter(i => i.productId === product.id).reduce((s, i) => s + i.qty, 0);
  const minPrice       = Math.min(...sellable.map(v => v.harga_jual));
  const maxPrice       = Math.max(...sellable.map(v => v.harga_jual));

  return (
    <div
      className="flex items-start gap-3 px-4 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"
      onClick={() => onOpen(product)}
    >
      {/* Left: text */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Name */}
        <div className="flex items-center gap-2">
          {totalCart > 0 && (
            <span className="flex-shrink-0 w-5 h-5 rounded-full text-white text-[9px] font-black flex items-center justify-center"
              style={{ backgroundColor: GF_GREEN }}>{totalCart}</span>
          )}
          <p className="text-sm font-black text-gray-900 line-clamp-2 leading-snug">{product.nama}</p>
        </div>

        {/* Description */}
        {product.deskripsi && (
          <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{product.deskripsi}</p>
        )}

        {/* Price */}
        <p className="text-sm font-black text-gray-900">
          {minPrice === maxPrice ? `Rp${formatRp(minPrice)}` : `Rp${formatRp(minPrice)} – Rp${formatRp(maxPrice)}`}
        </p>

        {/* Qty controls or "Tambah" — single variant inline, multi opens modal */}
        <div onClick={e => e.stopPropagation()}>
          {isSingle ? (
            cartQty > 0 ? (
              <div className="inline-flex items-center gap-2 mt-1">
                <button onClick={() => onQtyChange(singleV!.id, -1)}
                  className="w-8 h-8 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-600">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-sm font-black text-gray-900 w-5 text-center">{cartQty}</span>
                <button onClick={() => onQtyChange(singleV!.id, 1)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                  style={{ backgroundColor: GF_RED }}>
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button onClick={() => onOpen(product)}
                className="inline-flex items-center gap-1 mt-1 text-xs font-black px-3 py-1.5 rounded-full border-2 transition-colors"
                style={{ borderColor: GF_RED, color: GF_RED }}>
                <Plus className="w-3 h-3" /> Tambah
              </button>
            )
          ) : (
            <button onClick={() => onOpen(product)}
              className="inline-flex items-center gap-1 mt-1 text-xs font-black px-3 py-1.5 rounded-full border-2 transition-colors"
              style={{ borderColor: GF_RED, color: GF_RED }}>
              <Plus className="w-3 h-3" /> Pilih Varian
            </button>
          )}
        </div>
      </div>

      {/* Right: photo */}
      <div className="relative flex-shrink-0 w-[90px] h-[90px] rounded-2xl overflow-hidden bg-gray-100">
        {product.foto ? (
          <img src={product.foto} alt={product.nama} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-8 h-8 text-gray-200" />
          </div>
        )}
        {/* "Populer" badge on photo — only if has kategori or sold count */}
        {totalCart > 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/50 py-0.5 flex items-center justify-center gap-1">
            <TrendingUp className="w-2.5 h-2.5 text-yellow-400" />
            <span className="text-[8px] font-black text-white">Dipilih</span>
          </div>
        )}
        {/* "+" badge on bottom-right for multi-variant */}
        {!isSingle && (
          <div className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center border-2 border-white shadow-sm"
            style={{ backgroundColor: GF_RED }}>
            <Plus className="w-3.5 h-3.5 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}
