import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ShoppingBag, Search, Plus, Minus, Trash2, CheckCircle2, Receipt, ArrowLeft, Store, CreditCard, Wallet } from 'lucide-react';
import { User, db, collection, doc, setDoc, writeBatch, sanitizeData } from '../lib/firebase';
import { Product, Variant, Ingredient, StoreSettings, Transaction } from '../types';
import { formatCurrency } from '../lib/formatUtils';
import { toast } from 'sonner';

interface KasirProps {
  user: User;
  products: Product[];
  ingredients: Ingredient[];
  setIngredients: (ingredients: Ingredient[]) => void;
  storeSettings: StoreSettings;
  onNavigate: (tab: string) => void;
}

interface CartItem {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  price: number;
  qty: number;
  bahan: any[];
}

export default function Kasir({
  user,
  products,
  ingredients,
  setIngredients,
  storeSettings,
  onNavigate
}: KasirProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>('Tunai');
  const [isProcessing, setIsProcessing] = useState(false);
  const [completedTx, setCompletedTx] = useState<Transaction | null>(null);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.varian.some(v => v.nama.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchCat = selectedCategory === 'all' || (p.category || 'Lainnya') === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [products, searchQuery, selectedCategory]);

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || 'Lainnya'));
    return ['all', ...Array.from(cats)];
  }, [products]);

  const addToCart = (product: Product, variant: Variant) => {
    setCart(prev => {
      const existingIdx = prev.findIndex(item => item.productId === product.id && item.variantId === variant.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx].qty += 1;
        return updated;
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.nama,
          variantId: variant.id,
          variantName: variant.nama,
          price: variant.harga_jual || 0,
          qty: 1,
          bahan: variant.bahan || []
        }
      ];
    });
  };

  const updateCartQty = (productId: string, variantId: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.productId === productId && item.variantId === variantId) {
          const newQty = item.qty + delta;
          return newQty > 0 ? { ...item, qty: newQty } : null;
        }
        return item;
      }).filter(Boolean) as CartItem[];
    });
  };

  const clearCart = () => setCart([]);

  const totalAmount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }, [cart]);

  const totalQty = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.qty, 0);
  }, [cart]);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error('Keranjang kasir masih kosong');
      return;
    }

    setIsProcessing(true);
    try {
      const txId = `tx_kasir_${Date.now()}`;
      const dateStr = new Date().toISOString().split('T')[0];

      // Group detail for Transaction
      const penjualan_detail = products.map(p => {
        const cartItemsForProduct = cart.filter(c => c.productId === p.id);
        if (cartItemsForProduct.length === 0) return null;
        return {
          produk_id: p.id,
          produk_nama: p.nama,
          varian: cartItemsForProduct.map(c => ({
            varian_id: c.variantId,
            varian_nama: c.variantName,
            qty: c.qty,
            harga: c.price
          }))
        };
      }).filter(Boolean) as any[];

      const newTx: Transaction = {
        id: txId,
        tanggal: dateStr,
        keterangan: `Penjualan Kasir POS (${totalQty} pcs) via ${paymentMethod}`,
        kategori: 'Penjualan',
        jenis: 'Pemasukan',
        nominal: totalAmount,
        qty_total: totalQty,
        penjualan_detail
      };

      const batch = writeBatch(db);

      // Save Transaction
      batch.set(doc(db, `users/${user.uid}/transaksi/${txId}`), sanitizeData(newTx));

      // Deduct ingredients stock based on recipe
      const updatedIngredients = [...ingredients];
      cart.forEach(item => {
        item.bahan.forEach((b: any) => {
          if (!b || !b.nama) return;
          const ingredient = updatedIngredients.find(
            i => (b.ingredientId && i.id === b.ingredientId) ||
                 i.name.toLowerCase().trim() === b.nama.toLowerCase().trim()
          );
          if (ingredient) {
            const usagePerPcs = Number(b.qty) || 0;
            const totalUsage = usagePerPcs * item.qty;
            ingredient.currentStock = Math.max(0, ingredient.currentStock - totalUsage);
            batch.update(doc(db, `users/${user.uid}/stok/${ingredient.id}`), {
              currentStock: ingredient.currentStock
            });
          }
        });
      });

      await batch.commit();

      setIngredients(updatedIngredients);
      setCompletedTx(newTx);
      setCart([]);
      toast.success('Transaksi kasir berhasil disimpan & stok diperbarui! 🧾');
    } catch (err: any) {
      console.error('Checkout error:', err);
      toast.error('Gagal memproses pembayaran kasir');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col md:flex-row gap-4 overflow-hidden">
      {/* Left Catalog View */}
      <div className="flex-1 flex flex-col space-y-4 overflow-hidden bg-white rounded-3xl p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Cari produk / varian..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 rounded-2xl bg-gray-50 border-none text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 custom-scrollbar">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-colors shrink-0 ${
                  selectedCategory === cat ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat === 'all' ? 'Semua Produk' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-1 custom-scrollbar">
          {filteredProducts.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center p-12 text-center text-gray-400">
              <ShoppingBag className="w-12 h-12 mb-2 stroke-1" />
              <p className="font-bold text-sm">Produk tidak ditemukan</p>
              <p className="text-xs">Pastikan produk sudah ditambahkan di menu HPP</p>
            </div>
          ) : (
            filteredProducts.map(product => (
              <Card key={product.id} className="border border-gray-100 rounded-2xl shadow-2xs hover:shadow-md transition-shadow overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-black text-sm text-[#1A1A2E]">{product.nama}</h4>
                      {product.deskripsi && (
                        <p className="text-[10px] text-gray-400 line-clamp-1">{product.deskripsi}</p>
                      )}
                    </div>
                    <Badge className="bg-orange-50 text-orange-600 border-none font-black text-[9px]">
                      {product.varian.length} varian
                    </Badge>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-gray-50">
                    {product.varian.map(v => (
                      <div key={v.id} className="flex items-center justify-between bg-gray-50 p-2 rounded-xl text-xs">
                        <div>
                          <span className="font-bold text-gray-800">{v.nama}</span>
                          <span className="text-primary font-black block">{formatCurrency(v.harga_jual || 0, true)}</span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => addToCart(product, v)}
                          className="orange-gradient text-white font-bold rounded-lg h-7 px-3 text-[11px]"
                        >
                          + Tambah
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Right Cart & Checkout View */}
      <div className="w-full md:w-96 bg-white rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col justify-between space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            <h3 className="font-black text-base text-[#1A1A2E]">Keranjang Kasir</h3>
          </div>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-500 font-bold text-xs h-8">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Kosongkan
            </Button>
          )}
        </div>

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-gray-400">
              <ShoppingBag className="w-10 h-10 mb-2 stroke-1" />
              <p className="font-bold text-xs">Keranjang Kosong</p>
              <p className="text-[10px]">Klik item produk di sebelah kiri untuk memasukkan ke keranjang</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={`${item.productId}_${item.variantId}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl text-xs">
                <div className="max-w-[150px]">
                  <p className="font-bold text-gray-900 truncate">{item.productName}</p>
                  <p className="text-[10px] text-gray-500 truncate">{item.variantName}</p>
                  <p className="font-black text-primary">{formatCurrency(item.price * item.qty, true)}</p>
                </div>
                <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-xl border border-gray-200">
                  <button
                    onClick={() => updateCartQty(item.productId, item.variantId, -1)}
                    className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-red-500 font-bold"
                  >
                    -
                  </button>
                  <span className="font-black text-xs min-w-[16px] text-center">{item.qty}</span>
                  <button
                    onClick={() => updateCartQty(item.productId, item.variantId, 1)}
                    className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-primary font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Total & Payment Method */}
        <div className="space-y-3 pt-3 border-t border-gray-100">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Metode Pembayaran</label>
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              {['Tunai', 'Transfer', 'QRIS'].map(m => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`py-2 rounded-xl font-bold transition-colors ${
                    paymentMethod === m ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-2xl space-y-1">
            <div className="flex justify-between text-xs text-gray-500 font-bold">
              <span>Total Item:</span>
              <span>{totalQty} pcs</span>
            </div>
            <div className="flex justify-between text-base font-black text-[#1A1A2E]">
              <span>Total Bayar:</span>
              <span className="text-primary">{formatCurrency(totalAmount, true)}</span>
            </div>
          </div>

          <Button
            onClick={handleCheckout}
            disabled={cart.length === 0 || isProcessing}
            className="w-full orange-gradient text-white font-black rounded-2xl h-12 text-sm shadow-md shadow-orange-200"
          >
            {isProcessing ? 'Memproses Bayar...' : `Bayar ${formatCurrency(totalAmount, true)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
