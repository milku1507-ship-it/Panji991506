import re

with open('src/components/StoreCatalog.tsx', 'r') as f:
    text = f.read()

# The price element is:
#         {/* Price */}
#         <p className="text-sm font-black text-gray-900">
#           {minPrice === maxPrice ? `Rp${formatRp(minPrice)}` : `Rp${formatRp(minPrice)} – Rp${formatRp(maxPrice)}`}
#         </p>

old_price = """        {/* Price */}
        <p className="text-sm font-black text-gray-900">
          {minPrice === maxPrice ? `Rp${formatRp(minPrice)}` : `Rp${formatRp(minPrice)} – Rp${formatRp(maxPrice)}`}
        </p>"""

new_price = """        {/* Price */}
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          <p className="text-sm font-black text-gray-900">
            {minPrice === maxPrice ? `Rp${formatRp(minPrice)}` : `Rp${formatRp(minPrice)} – Rp${formatRp(maxPrice)}`}
          </p>
          {(() => {
            const minOrder = Math.min(...sellable.map(v => Number(v.min_order) || 1));
            if (minOrder > 1) {
              return (
                <span className="text-[9px] font-bold bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded uppercase border border-amber-200 shadow-sm">
                  Min. Order {minOrder}
                </span>
              );
            }
            return null;
          })()}
        </div>"""

if old_price in text:
    text = text.replace(old_price, new_price)
else:
    print("Price block not found in StoreCatalog")

with open('src/components/StoreCatalog.tsx', 'w') as f:
    f.write(text)
