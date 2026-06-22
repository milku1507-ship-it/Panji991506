import React from 'react';
import { motion } from 'motion/react';
import { ShoppingBag, MessageCircle, Search, X, Store, Phone, MapPin, ShoppingCart, Plus, Minus } from 'lucide-react';
import { db, collection, getDocs, doc, getDoc } from '../lib/firebase';
import { Product, StoreSettings } from '../types';

function formatRp(n: number) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

interface StoreCatalogProps {
  userId: string;
  onBack?: () => void;
}

type OrderItem = { productName: string; variantName: string; price: number; qty: number; foto?: string };

export default function StoreCatalog({ userId, onBack }: StoreCatalogProps) {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [settings, setSettings] = React.useState<StoreSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeCategory, setActiveCategory] = React.useState('Semua');
  const [orderItems, setOrderItems] = React.useState<OrderItem[]>([]);
  const [showOrder, setShowOrder] = React.useState(false);
  const [buyerName, setBuyerName] = React.useState('');
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);

  React.useEffect(() => {
    if (!userId) { setError('Link toko tidak valid.'); setLoading(false); return; }
    Promise.all([
      getDocs(collection(db, `users/${userId}/hpp`)),
      getDoc(doc(db, `users/${userId}/profil_toko/settings`))
    ]).then(([prodSnap, settingsSnap]) => {
      const prods = prodSnap.docs.map(d => ({ ...d.data(), id: d.id } as Product))
        .filter(p => p.varian?.some(v => v.harga_jual > 0));
      setProducts(prods);
      if (settingsSnap.exists()) setSettings(settingsSnap.data() as StoreSettings);
      setLoading(false);
    }).catch(() => {
      setError('Gagal memuat katalog. Coba lagi nanti.');
      setLoading(false);
    });
  }, [userId]);

  // Categories
  const categories = React.useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => { if (p.kategori) cats.add(p.kategori); });
    return cats.size > 0 ? ['Semua', ...Array.from(cats).sort()] : [];
  }, [products]);

  const visibleProducts = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter(p => {
      const matchCat = activeCategory === 'Semua' || p.kategori === activeCategory;
      const matchSearch = !q || p.nama.toLowerCase().includes(q) || p.varian.some(v => v.nama.toLowerCase().includes(q));
      return matchCat && matchSearch;
    });
  }, [products, searchQuery, activeCategory]);

  const addToOrder = (productName: string, variantName: string, price: number, foto?: string) => {
    setOrderItems(prev => {
      const key = `${productName}__${variantName}`;
      const existing = prev.find(i => `${i.productName}__${i.variantName}` === key);
      if (existing) return prev.map(i => `${i.productName}__${i.variantName}` === key ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { productName, variantName, price, qty: 1, foto }];
    });
  };

  const updateQty = (key: string, delta: number) => {
    setOrderItems(prev => prev.map(i =>
      `${i.productName}__${i.variantName}` === key ? { ...i, qty: i.qty + delta } : i
    ).filter(i => i.qty > 0));
  };

  const getQty = (productName: string, variantName: string) => {
    const key = `${productName}__${variantName}`;
    return orderItems.find(i => `${i.productName}__${i.variantName}` === key)?.qty || 0;
  };

  const orderTotal = orderItems.reduce((s, i) => s + i.price * i.qty, 0);
  const orderCount = orderItems.reduce((s, i) => s + i.qty, 0);

  const sendWhatsApp = () => {
    const phone = (settings?.phone || '').replace(/[^0-9]/g, '');
    const lines = [`*Halo ${settings?.name || 'Toko'}, saya mau pesan:*`, ''];
    orderItems.forEach(item => {
      lines.push(`• ${item.productName}${item.variantName !== item.productName ? ` - ${item.variantName}` : ''} ×${item.qty} = ${formatRp(item.price * item.qty)}`);
    });
    lines.push('');
    lines.push(`*Total: ${formatRp(orderTotal)}*`);
    if (buyerName) lines.push(`Nama: ${buyerName}`);
    const text = lines.join('\n');
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const storeName = settings?.name || 'Katalog Toko';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
        <p className="text-gray-400 font-bold text-sm">Memuat katalog...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <Store className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-black text-gray-800">Toko Tidak Ditemukan</h2>
        <p className="text-gray-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] pb-28">
      {/* Store Header */}
      <div className="bg-gradient-to-br from-orange-500 to-red-500 text-white">
        <div className="max-w-2xl mx-auto px-4 pt-8 pb-6 text-center relative">
          {settings?.logo && (
            <img src={settings.logo} alt={storeName} className="h-16 w-16 object-cover mx-auto mb-3 rounded-2xl shadow-lg" referrerPolicy="no-referrer" />
          )}
          <h1 className="text-xl font-black">{storeName}</h1>
          {settings?.tagline && <p className="text-sm text-white/80 mt-1">{settings.tagline}</p>}
          <div className="flex flex-wrap justify-center gap-3 mt-2 text-xs text-white/70">
            {settings?.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{settings.phone}</span>}
            {settings?.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{settings.address}</span>}
          </div>
        </div>
      </div>

      {/* Search + category bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-3 pt-3 pb-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cari produk..."
              className="w-full pl-9 pr-8 h-10 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium outline-none focus:ring-2 focus:ring-orange-400"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {categories.length > 2 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    activeCategory === cat
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Product grid — 2 columns like reference */}
      <div className="max-w-2xl mx-auto px-3 py-4">
        {visibleProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <ShoppingBag className="w-12 h-12 text-gray-200" />
            <p className="font-bold text-gray-400">
              {products.length === 0 ? 'Belum ada produk tersedia' : 'Produk tidak ditemukan'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {visibleProducts.map(product => {
              const sellable = product.varian.filter(v => v.harga_jual > 0);
              const minPrice = Math.min(...sellable.map(v => v.harga_jual));
              const maxPrice = Math.max(...sellable.map(v => v.harga_jual));
              const totalInOrder = orderItems
                .filter(i => i.productName === product.nama)
                .reduce((s, i) => s + i.qty, 0);

              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col cursor-pointer"
                  onClick={() => setSelectedProduct(product)}
                >
                  {/* Photo */}
                  <div className="relative w-full aspect-square bg-gray-100 overflow-hidden flex-shrink-0">
                    {product.foto ? (
                      <img src={product.foto} alt={product.nama} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="w-10 h-10 text-gray-200" />
                      </div>
                    )}
                    {/* Kategori */}
                    {product.kategori && (
                      <div className="absolute top-2 left-2">
                        <span className="text-[9px] font-black bg-orange-500 text-white px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                          {product.kategori}
                        </span>
                      </div>
                    )}
                    {/* In order badge */}
                    {totalInOrder > 0 && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow">
                        <span className="text-[9px] font-black text-white">{totalInOrder}</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 flex flex-col p-3">
                    <p className="text-sm font-black text-gray-800 line-clamp-2 leading-tight flex-1">{product.nama}</p>
                    <p className="text-sm font-black text-orange-500 mt-1">
                      {minPrice === maxPrice ? formatRp(minPrice) : `${formatRp(minPrice)}+`}
                    </p>

                    {/* Quick add — single variant */}
                    {sellable.length === 1 ? (
                      <div className="mt-2">
                        {getQty(product.nama, sellable[0].nama) > 0 ? (
                          <div className="flex items-center justify-between bg-orange-50 rounded-xl px-2 py-1">
                            <button
                              onClick={e => { e.stopPropagation(); updateQty(`${product.nama}__${sellable[0].nama}`, -1); }}
                              className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center font-black text-lg leading-none"
                            >−</button>
                            <span className="text-sm font-black text-orange-500">{getQty(product.nama, sellable[0].nama)}</span>
                            <button
                              onClick={e => { e.stopPropagation(); updateQty(`${product.nama}__${sellable[0].nama}`, 1); }}
                              className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center font-black text-lg leading-none"
                            >+</button>
                          </div>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); addToOrder(product.nama, sellable[0].nama, sellable[0].harga_jual, product.foto); }}
                            className="w-full flex items-center justify-center gap-1 bg-orange-50 hover:bg-orange-100 text-orange-500 font-bold text-xs rounded-xl py-2 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" /> Pesan
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedProduct(product); }}
                        className="mt-2 w-full flex items-center justify-center gap-1 bg-orange-50 hover:bg-orange-100 text-orange-500 font-bold text-xs rounded-xl py-2 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Pilih Varian
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating order bar */}
      {orderCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 p-4 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <motion.button
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              onClick={() => setShowOrder(true)}
              className="w-full h-14 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl flex items-center justify-between px-5 shadow-xl shadow-orange-200 font-bold"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">{orderCount}</div>
                <span>Lihat Pesanan</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-black">{formatRp(orderTotal)}</span>
                <ShoppingCart className="w-4 h-4" />
              </div>
            </motion.button>
          </div>
        </div>
      )}

      {/* Variant picker modal */}
      {selectedProduct && (
        <>
          <div className="fixed inset-0 bg-black/40 z-30" onClick={() => setSelectedProduct(null)} />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-3xl shadow-2xl max-h-[80dvh] flex flex-col"
          >
            <div className="flex gap-4 p-4 border-b border-gray-100 flex-shrink-0">
              {selectedProduct.foto && (
                <img src={selectedProduct.foto} alt={selectedProduct.nama} className="w-20 h-20 object-cover rounded-2xl flex-shrink-0" referrerPolicy="no-referrer" />
              )}
              <div className="min-w-0">
                <h3 className="text-base font-black text-gray-800 leading-tight">{selectedProduct.nama}</h3>
                {selectedProduct.deskripsi && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{selectedProduct.deskripsi}</p>}
                <button onClick={() => setSelectedProduct(null)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {selectedProduct.varian.filter(v => v.harga_jual > 0).map(variant => {
                const key = `${selectedProduct.nama}__${variant.nama}`;
                const qty = getQty(selectedProduct.nama, variant.nama);
                const showName = selectedProduct.varian.filter(v => v.harga_jual > 0).length > 1 || variant.nama !== selectedProduct.nama;
                return (
                  <div key={variant.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
                    <div>
                      <p className="text-sm font-bold text-gray-800">{showName ? variant.nama : 'Standar'}</p>
                      <p className="text-sm font-black text-orange-500">{formatRp(variant.harga_jual)}</p>
                    </div>
                    {qty > 0 ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQty(key, -1)} className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center font-black">−</button>
                        <span className="text-sm font-black w-5 text-center">{qty}</span>
                        <button onClick={() => updateQty(key, 1)} className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center font-black">+</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToOrder(selectedProduct.nama, variant.nama, variant.harga_jual, selectedProduct.foto)}
                        className="px-4 py-2 rounded-xl bg-orange-500 text-white font-black text-xs hover:bg-orange-600 transition-colors"
                      >
                        + Pesan
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}

      {/* Order summary sheet */}
      {showOrder && (
        <>
          <div className="fixed inset-0 bg-black/40 z-30" onClick={() => setShowOrder(false)} />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-3xl shadow-2xl max-h-[80dvh] flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <span className="text-lg font-black text-gray-800">Ringkasan Pesanan</span>
              <button onClick={() => setShowOrder(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {orderItems.map(item => {
                const key = `${item.productName}__${item.variantName}`;
                return (
                  <div key={key} className="flex items-center gap-3">
                    {item.foto && (
                      <img src={item.foto} alt={item.productName} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" referrerPolicy="no-referrer" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{item.productName}</p>
                      {item.variantName !== item.productName && (
                        <p className="text-xs text-gray-400">{item.variantName}</p>
                      )}
                      <p className="text-xs font-black text-orange-500">{formatRp(item.price)} × {item.qty}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => updateQty(key, -1)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center font-black text-gray-600">−</button>
                      <span className="text-sm font-black w-4 text-center">{item.qty}</span>
                      <button onClick={() => updateQty(key, 1)} className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center font-black">+</button>
                    </div>
                  </div>
                );
              })}

              <div className="pt-2 border-t border-gray-100">
                <input
                  value={buyerName}
                  onChange={e => setBuyerName(e.target.value)}
                  placeholder="Nama kamu (opsional)"
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 space-y-3 flex-shrink-0">
              <div className="flex justify-between items-center">
                <span className="text-base font-black text-gray-800">Total Pesanan</span>
                <span className="text-lg font-black text-orange-500">{formatRp(orderTotal)}</span>
              </div>
              <button
                onClick={sendWhatsApp}
                className="w-full h-12 bg-green-500 hover:bg-green-600 text-white font-black rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-green-200"
              >
                <MessageCircle className="w-5 h-5" />
                Pesan via WhatsApp
              </button>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
