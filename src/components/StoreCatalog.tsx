import React from 'react';
import { motion } from 'motion/react';
import { ShoppingBag, MessageCircle, Search, X, ChevronDown, ChevronUp, Store, Phone, MapPin, ArrowLeft } from 'lucide-react';
import { db, collection, getDocs, doc, getDoc } from '../lib/firebase';
import { Product, StoreSettings } from '../types';

function formatRp(n: number) {
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

interface StoreCatalogProps {
  userId: string;
  onBack?: () => void;
}

export default function StoreCatalog({ userId, onBack }: StoreCatalogProps) {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [settings, setSettings] = React.useState<StoreSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [expandedProduct, setExpandedProduct] = React.useState<string | null>(null);
  const [orderItems, setOrderItems] = React.useState<{ productName: string; variantName: string; price: number; qty: number }[]>([]);
  const [showOrder, setShowOrder] = React.useState(false);
  const [buyerName, setBuyerName] = React.useState('');

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

  const visibleProducts = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return products;
    return products.filter(p =>
      p.nama.toLowerCase().includes(q) || p.varian.some(v => v.nama.toLowerCase().includes(q))
    );
  }, [products, searchQuery]);

  const addToOrder = (productName: string, variantName: string, price: number) => {
    setOrderItems(prev => {
      const key = `${productName}__${variantName}`;
      const existing = prev.find(i => `${i.productName}__${i.variantName}` === key);
      if (existing) return prev.map(i => `${i.productName}__${i.variantName}` === key ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { productName, variantName, price, qty: 1 }];
    });
  };

  const updateQty = (key: string, delta: number) => {
    setOrderItems(prev => prev.map(i =>
      `${i.productName}__${i.variantName}` === key ? { ...i, qty: i.qty + delta } : i
    ).filter(i => i.qty > 0));
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
        <h2 className="text-xl font-black text-[#1A1A2E]">Toko Tidak Ditemukan</h2>
        <p className="text-gray-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* Store Header */}
      <div className="bg-gradient-to-br from-orange-500 to-red-500 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8 text-center">
          {onBack && (
            <button onClick={onBack} className="absolute left-4 top-4 w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
          )}
          {settings?.logo && (
            <img src={settings.logo} alt={storeName} className="h-16 object-contain mx-auto mb-3 rounded-2xl" referrerPolicy="no-referrer" />
          )}
          <h1 className="text-2xl font-black">{storeName}</h1>
          {settings?.tagline && <p className="text-sm text-white/80 mt-1">{settings.tagline}</p>}
          <div className="flex flex-wrap justify-center gap-3 mt-3 text-xs text-white/70">
            {settings?.phone && (
              <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{settings.phone}</span>
            )}
            {settings?.address && (
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{settings.address}</span>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3">
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
        </div>
      </div>

      {/* Products */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-3 pb-36">
        {visibleProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <ShoppingBag className="w-12 h-12 text-gray-200" />
            <p className="font-bold text-gray-400">
              {products.length === 0 ? 'Belum ada produk tersedia' : 'Produk tidak ditemukan'}
            </p>
          </div>
        ) : (
          visibleProducts.map(product => {
            const sellable = product.varian.filter(v => v.harga_jual > 0);
            const isExpanded = expandedProduct === product.id;
            const minPrice = Math.min(...sellable.map(v => v.harga_jual));
            const maxPrice = Math.max(...sellable.map(v => v.harga_jual));
            const inOrderQty = orderItems.filter(i => i.productName === product.nama).reduce((s, i) => s + i.qty, 0);

            return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <button
                  className="w-full flex items-center gap-4 px-4 py-4 text-left"
                  onClick={() => setExpandedProduct(isExpanded ? null : product.id)}
                >
                  <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                    <ShoppingBag className="w-6 h-6 text-orange-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-[#1A1A2E] text-sm">{product.nama}</p>
                      {inOrderQty > 0 && (
                        <span className="text-[10px] font-black bg-orange-500 text-white px-1.5 py-0.5 rounded-full">×{inOrderQty}</span>
                      )}
                    </div>
                    {product.deskripsi && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{product.deskripsi}</p>
                    )}
                    <p className="text-sm font-black text-orange-500 mt-0.5">
                      {minPrice === maxPrice ? formatRp(minPrice) : `${formatRp(minPrice)} – ${formatRp(maxPrice)}`}
                    </p>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>

                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-gray-50 px-4 pb-4 space-y-2"
                  >
                    {product.deskripsi && (
                      <p className="text-xs text-gray-500 pt-3 italic">{product.deskripsi}</p>
                    )}
                    {sellable.map(variant => {
                      const key = `${product.nama}__${variant.nama}`;
                      const inOrder = orderItems.find(i => `${i.productName}__${i.variantName}` === key);
                      const showVariantName = sellable.length > 1 || variant.nama !== product.nama;
                      return (
                        <div
                          key={variant.id}
                          className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                        >
                          <div>
                            <p className="text-sm font-bold text-[#1A1A2E]">
                              {showVariantName ? variant.nama : 'Standar'}
                            </p>
                            <p className="text-sm font-black text-orange-500">{formatRp(variant.harga_jual)}</p>
                          </div>
                          {inOrder ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => updateQty(key, -1)}
                                className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center font-black text-gray-600 hover:bg-red-50"
                              >−</button>
                              <span className="text-sm font-black w-5 text-center">{inOrder.qty}</span>
                              <button
                                onClick={() => updateQty(key, 1)}
                                className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center font-black hover:bg-orange-600"
                              >+</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToOrder(product.nama, variant.nama, variant.harga_jual)}
                              className="px-4 py-2 rounded-xl bg-orange-50 text-orange-500 font-black text-xs hover:bg-orange-100 transition-colors"
                            >
                              + Pesan
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </motion.div>
            );
          })
        )}
      </div>

      {/* Floating order bar */}
      {orderCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 p-4">
          <div className="max-w-2xl mx-auto">
            <motion.button
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              onClick={() => setShowOrder(true)}
              className="w-full h-14 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl flex items-center justify-between px-5 shadow-xl shadow-orange-200 font-bold"
            >
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">{orderCount}</span>
                <span>Lihat Pesanan</span>
              </div>
              <span className="font-black">{formatRp(orderTotal)}</span>
            </motion.button>
          </div>
        </div>
      )}

      {/* Order sheet */}
      {showOrder && (
        <>
          <div className="fixed inset-0 bg-black/40 z-30" onClick={() => setShowOrder(false)} />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-3xl shadow-2xl max-h-[80dvh] flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="text-lg font-black text-[#1A1A2E]">Ringkasan Pesanan</span>
              <button onClick={() => setShowOrder(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {orderItems.map(item => {
                const key = `${item.productName}__${item.variantName}`;
                return (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-[#1A1A2E]">{item.productName}</p>
                      {item.variantName !== item.productName && (
                        <p className="text-xs text-gray-400">{item.variantName}</p>
                      )}
                      <p className="text-xs font-bold text-orange-500">{formatRp(item.price)} × {item.qty}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQty(key, -1)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center font-black text-gray-600">−</button>
                      <span className="text-sm font-black w-4 text-center">{item.qty}</span>
                      <button onClick={() => updateQty(key, 1)} className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center font-black">+</button>
                    </div>
                  </div>
                );
              })}

              <div className="border-t border-gray-100 pt-3">
                <input
                  value={buyerName}
                  onChange={e => setBuyerName(e.target.value)}
                  placeholder="Nama kamu (opsional)"
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 space-y-3">
              <div className="flex justify-between text-base font-black text-[#1A1A2E]">
                <span>Total Pesanan</span>
                <span className="text-orange-500">{formatRp(orderTotal)}</span>
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
