import re

with open('src/components/ROASCalculator.tsx', 'r') as f:
    text = f.read()

# 1. Update CARI ROAS / CARI HARGA buttons layout
old_calc_mode = """        <div className="flex flex-wrap gap-2 p-1.5 bg-gray-50 border border-gray-100 rounded-2xl w-fit">
          <button 
            onClick={() => setCalcMode('find_roas')} 
            className={`px-6 py-3 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${calcMode === 'find_roas' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200'}`}
          >
            <Calculator className="w-4 h-4" /> CARI ROAS
          </button>
          <button 
            onClick={() => setCalcMode('find_price')} 
            className={`px-6 py-3 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${calcMode === 'find_price' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200'}`}
          >
            <DollarSign className="w-4 h-4" /> CARI HARGA
          </button>
        </div>"""

new_calc_mode = """        <div className="grid grid-cols-2 gap-2 p-1.5 bg-gray-50 border border-gray-100 rounded-2xl w-full">
          <button 
            onClick={() => setCalcMode('find_roas')} 
            className={`flex items-center justify-center py-3 rounded-xl text-sm font-black transition-all gap-2 ${calcMode === 'find_roas' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200'}`}
          >
            <Calculator className="w-4 h-4" /> CARI ROAS
          </button>
          <button 
            onClick={() => setCalcMode('find_price')} 
            className={`flex items-center justify-center py-3 rounded-xl text-sm font-black transition-all gap-2 ${calcMode === 'find_price' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200'}`}
          >
            <DollarSign className="w-4 h-4" /> CARI HARGA
          </button>
        </div>"""

if old_calc_mode in text:
    text = text.replace(old_calc_mode, new_calc_mode)

# 2. Update Tabs Tipe Iklan
old_ad_mode = """        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          {(['variant', 'product', 'group'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setAdMode(mode)}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${adMode === mode ? 'bg-gray-900 text-white border-transparent' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
            >
              {mode === 'variant' ? 'Single Varian' : mode === 'product' ? 'Produk Multi-Varian' : 'Grup Iklan / Toko'}
            </button>
          ))}
        </div>"""

new_ad_mode = """        <div className="grid grid-cols-3 gap-2 pt-4 border-t border-gray-100 w-full">
          {(['variant', 'product', 'group'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setAdMode(mode)}
              className={`flex items-center justify-center text-center px-1 sm:px-3 py-2.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all leading-tight ${adMode === mode ? 'bg-gray-900 text-white border-transparent shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
            >
              {mode === 'variant' ? 'Single Varian' : mode === 'product' ? 'Multi-Varian' : 'Grup Iklan'}
            </button>
          ))}
        </div>"""

if old_ad_mode in text:
    text = text.replace(old_ad_mode, new_ad_mode)

# 3. Update Single Variant Selects to be 2 columns always
old_sel_variant = """            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-600">Pilih Produk</Label>"""
new_sel_variant = """            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-600">Pilih Produk</Label>"""
text = text.replace(old_sel_variant, new_sel_variant)

# 4. Remove max-w-md from product select
old_sel_product = """            <div className="space-y-1.5 max-w-md">
              <Label className="text-xs font-bold text-gray-600">Pilih Produk Multi-Varian</Label>"""
new_sel_product = """            <div className="space-y-1.5 w-full">
              <Label className="text-xs font-bold text-gray-600">Pilih Produk Multi-Varian</Label>"""
text = text.replace(old_sel_product, new_sel_product)

with open('src/components/ROASCalculator.tsx', 'w') as f:
    f.write(text)

