import re

with open('src/components/StoreCatalog.tsx', 'r') as f:
    text = f.read()

# Let's find where the price is displayed in MenuListItem
# it usually looks like:
# `<p className="font-black text-gray-900 mt-1">Rp{formatRp(sellable[0].harga_jual)}</p>`
# Let's search for this exact block to inject a min order badge.

old_price = """          {sellable.length > 1 ? (
            <p className="font-black text-gray-900 mt-1 text-sm">
              Mulai Rp{formatRp(Math.min(...sellable.map(v => v.harga_jual)))}
            </p>
          ) : (
            <p className="font-black text-gray-900 mt-1 text-sm">
              Rp{formatRp(sellable[0].harga_jual)}
            </p>
          )}"""

new_price = """          {sellable.length > 1 ? (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <p className="font-black text-gray-900 text-sm">
                Mulai Rp{formatRp(Math.min(...sellable.map(v => v.harga_jual)))}
              </p>
              {Math.min(...sellable.map(v => Number(v.min_order) || 1)) > 1 && (
                <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded uppercase border border-amber-200">
                  Min. Order
                </span>
              )}
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <p className="font-black text-gray-900 text-sm">
                Rp{formatRp(sellable[0].harga_jual)}
              </p>
              {(Number(sellable[0].min_order) || 1) > 1 && (
                <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded uppercase border border-amber-200">
                  Min. Order {sellable[0].min_order}
                </span>
              )}
            </div>
          )}"""

if old_price in text:
    text = text.replace(old_price, new_price)
else:
    print("Price block not found in StoreCatalog")

with open('src/components/StoreCatalog.tsx', 'w') as f:
    f.write(text)
