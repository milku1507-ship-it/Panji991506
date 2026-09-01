import re

with open('src/components/StoreCatalog.tsx', 'r') as f:
    text = f.read()

# 1. Update `openDetail`
old_open_detail = """  const openDetail = (product: Product) => {
    const sellable = product.varian.filter(v => v.harga_jual > 0);
    setSelectedProduct(product);
    setSelectedVariantId(sellable[0]?.id || '');
    setDetailQty(1);
    setDetailNote('');
  };"""

new_open_detail = """  const openDetail = (product: Product) => {
    const sellable = product.varian.filter(v => v.harga_jual > 0);
    const initialVariant = sellable[0];
    setSelectedProduct(product);
    setSelectedVariantId(initialVariant?.id || '');
    setDetailQty(initialVariant ? Math.max(1, Number(initialVariant.min_order) || 1) : 1);
    setDetailNote('');
  };"""

text = text.replace(old_open_detail, new_open_detail)

# 2. Add an effect to change `detailQty` when `selectedVariantId` changes inside the detail view (if necessary, but just fixing the stepper is easier)
# Let's find where they change variant:
old_set_variant = """onClick={() => setSelectedVariantId(v.id)}"""
new_set_variant = """onClick={() => { setSelectedVariantId(v.id); setDetailQty(Math.max(1, Number(v.min_order) || 1)); }}"""
text = text.replace(old_set_variant, new_set_variant)

# 3. Fix the stepper in Detail view
old_stepper = """<button onClick={() => setDetailQty(q => Math.max(1, q - 1))}"""
new_stepper = """<button onClick={() => setDetailQty(q => {
                      const minOrder = Math.max(1, Number(selectedProduct.varian.find(v => v.id === selectedVariantId)?.min_order) || 1);
                      return Math.max(minOrder, q - 1);
                    })}"""
text = text.replace(old_stepper, new_stepper)

# 4. Fix Quick Add (upsertCart)
# When upsertCart is called, if the item is not in cart, the delta should be min_order. But wait, `upsertCart` currently receives `delta: number` (which is hardcoded to 1 in `onQuickAdd={(vId) => upsertCart(product, vId, 1)}`).
# Instead of hardcoding 1, let's change `onQuickAdd={(vId) => upsertCart(product, vId, 1)}` 
# Wait, `upsertCart` handles both adding and updating.
old_upsert = """const upsertCart = (product: Product, variantId: string, delta: number) => {"""
new_upsert = """const upsertCart = (product: Product, variantId: string, delta: number) => {
    const variant = product.varian.find(v => v.id === variantId);
    const minOrder = variant ? Math.max(1, Number(variant.min_order) || 1) : 1;
"""
# If the item doesn't exist, we add `delta * minOrder` or just `Math.max(minOrder, delta)`
# Let's see how `upsertCart` is written. It uses `prev.find`.
old_upsert_body = """    setCart(prev => {
      const existing = prev.find(i => i.variantId === variantId);
      if (existing) {
        const newQty = existing.qty + delta;
        return newQty <= 0 ? prev.filter(i => i.variantId !== variantId)
          : prev.map(i => i.variantId === variantId ? { ...i, qty: newQty } : i);
      }
      return [...prev, { productId: product.id, productName: product.nama, variantId, variantName: variant.nama, price: variant.harga_jual, qty: delta, foto: product.foto }];
    });"""

new_upsert_body = """    setCart(prev => {
      const existing = prev.find(i => i.variantId === variantId);
      if (existing) {
        const newQty = existing.qty + delta;
        // if decreasing below min order, remove it
        if (delta < 0 && newQty < minOrder) return prev.filter(i => i.variantId !== variantId);
        return newQty <= 0 ? prev.filter(i => i.variantId !== variantId)
          : prev.map(i => i.variantId === variantId ? { ...i, qty: newQty } : i);
      }
      // if not in cart, start at minOrder (or max(minOrder, delta))
      const startingQty = Math.max(minOrder, delta);
      return [...prev, { productId: product.id, productName: product.nama, variantId, variantName: variant?.nama || product.nama, price: variant?.harga_jual || 0, qty: startingQty, foto: product.foto }];
    });"""
text = text.replace(old_upsert + old_upsert_body, new_upsert + new_upsert_body)

# 5. Fix `updateCartQty` (from inside the cart)
old_update_qty = """  const updateCartQty = (variantId: string, delta: number) => {
    setCart(prev => prev.map(i => i.variantId === variantId ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));
  };"""

# We need to find the variant's minOrder, but we don't have `products` array readily? Yes we do, `products` is in scope!
new_update_qty = """  const updateCartQty = (variantId: string, delta: number) => {
    setCart(prev => {
      return prev.map(i => {
        if (i.variantId === variantId) {
          const product = products.find(p => p.id === i.productId);
          const variant = product?.varian.find(v => v.id === variantId);
          const minOrder = variant ? Math.max(1, Number(variant.min_order) || 1) : 1;
          const newQty = i.qty + delta;
          if (delta < 0 && newQty < minOrder) return { ...i, qty: 0 }; // Will be filtered out
          return { ...i, qty: newQty };
        }
        return i;
      }).filter(i => i.qty > 0);
    });
  };"""
text = text.replace(old_update_qty, new_update_qty)

with open('src/components/StoreCatalog.tsx', 'w') as f:
    f.write(text)
