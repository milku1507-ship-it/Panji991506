import re

with open('src/components/Kasir.tsx', 'r') as f:
    text = f.read()

# Fix addToCart
old_add = """  const addToCart = (product: Product, variant: { id: string; nama: string; harga_jual: number }) => {
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
  };"""

new_add = """  const addToCart = (product: Product, variant: { id: string; nama: string; harga_jual: number }) => {
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
  };"""
text = text.replace(old_add, new_add)

# Fix updateQty
old_update = """  const updateQty = (variantId: string, delta: number) => {
    setCart(prev => prev.map(i => i.variantId === variantId ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));
  };"""

new_update = """  const updateQty = (variantId: string, delta: number) => {
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
  };"""
text = text.replace(old_update, new_update)

# Add Min Order badge in Kasir's ProductCard
# The Kasir ProductCard price element:
#         <div className="flex-1 min-w-0 flex flex-col justify-between">
#           <div>
#             <p className="text-xs font-bold text-gray-800 line-clamp-2 leading-tight">{product.nama}</p>
#             {isMulti && <p className="text-[10px] text-gray-400 mt-0.5">{sellable.length} Varian</p>}
#           </div>
#           <p className="text-sm font-black text-brand-600 mt-1 truncate">
#             Rp{formatRp(minPrice)}{isMulti && '+'}
#           </p>
#         </div>

old_card_price = """          <p className="text-sm font-black text-brand-600 mt-1 truncate">
            Rp{formatRp(minPrice)}{isMulti && '+'}
          </p>"""
new_card_price = """          <div className="mt-1 flex flex-col gap-0.5">
            <p className="text-sm font-black text-brand-600 truncate">
              Rp{formatRp(minPrice)}{isMulti && '+'}
            </p>
            {(() => {
              const minOrder = Math.min(...sellable.map(v => Number(v.min_order) || 1));
              if (minOrder > 1) {
                return (
                  <span className="text-[9px] font-bold bg-amber-50 text-amber-600 px-1 py-0.5 rounded uppercase border border-amber-200 w-fit">
                    Min. {minOrder}
                  </span>
                );
              }
              return null;
            })()}
          </div>"""
if old_card_price in text:
    text = text.replace(old_card_price, new_card_price)

with open('src/components/Kasir.tsx', 'w') as f:
    f.write(text)
