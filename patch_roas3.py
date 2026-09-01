import re

with open('src/components/ROASCalculator.tsx', 'r') as f:
    text = f.read()

# 1. Update renderSimCard
old_sim = """  const renderSimCard = (title: string, roas: number, color: string) => {
    const estOmset = biayaIklan * roas;
    const estQty = H > 0 ? Math.floor(estOmset / H) : 0;
    const estMargin = estQty * M;
    const effectiveBiayaIklan = biayaIklan * ppnFactor;
    const estProfit = estMargin - effectiveBiayaIklan;
    
    let bgClass = '';
    let textColor = '';
    let profitLabel = '';
    let profitValueClass = '';
    
    if (color === 'red') {
      bgClass = 'bg-slate-50 border-slate-200';
      textColor = 'text-slate-800';
      profitLabel = 'Profit Rp0 (Impas)';
      profitValueClass = 'text-slate-500';
    } else if (color === 'yellow') {
      bgClass = 'bg-amber-50 border-amber-200';
      textColor = 'text-amber-900';
      profitLabel = 'Est. Profit Bersih:';
      profitValueClass = 'text-amber-700';
    } else {
      bgClass = 'bg-emerald-50 border-emerald-200';
      textColor = 'text-emerald-900';
      profitLabel = 'Est. Profit Bersih:';
      profitValueClass = 'text-emerald-700';
    }
    
    return (
      <div className={`p-5 rounded-2xl border ${bgClass} flex flex-col justify-between shadow-sm`}>
        <div>
          <div className={`font-black uppercase tracking-wider text-[11px] mb-1 ${textColor} opacity-80`}>{title}</div>
          <div className={`text-4xl font-black mb-6 ${textColor}`}>{roas > 0 ? roas.toFixed(2) : '0.00'}x</div>
        </div>
        <div className="text-sm space-y-2">
          <div className="flex justify-between items-center text-slate-600"><span>Est. Omset:</span><span className="font-bold text-slate-900">{formatCurrency(estOmset)}</span></div>
          <div className="flex justify-between items-center text-slate-600"><span>Est. Qty Terjual:</span><span className="font-bold text-slate-900">{estQty} pcs</span></div>
          <div className="flex justify-between items-center text-slate-600"><span>Est. Total Margin:</span><span className="font-bold text-slate-900">{formatCurrency(estMargin)}</span></div>
          
          <div className={`flex justify-between items-center mt-3 pt-3 border-t border-black/10`}>
            <span className={`font-bold ${textColor}`}>{profitLabel}</span>
            <span className={`font-black text-lg ${profitValueClass}`}>{color === 'red' ? 'Rp0' : formatCurrency(estProfit)}</span>
          </div>
        </div>
      </div>
    );
  };"""

new_sim = """  const renderSimCard = (title: string, roas: number, color: string) => {
    const estOmset = biayaIklan * roas;
    const estQty = H > 0 ? Math.floor(estOmset / H) : 0;
    const estMargin = estQty * M;
    const effectiveBiayaIklan = biayaIklan * ppnFactor;
    const estProfit = estMargin - effectiveBiayaIklan;
    const marginPct = estOmset > 0 ? ((estProfit / estOmset) * 100).toFixed(1) : '0.0';
    
    let bgClass = '';
    let textColor = '';
    let profitLabel = '';
    let profitValueClass = '';
    
    if (color === 'red') {
      bgClass = 'bg-slate-50 border-slate-200';
      textColor = 'text-slate-800';
      profitLabel = 'Profit Rp0 (Impas)';
      profitValueClass = 'text-slate-500';
    } else if (color === 'yellow') {
      bgClass = 'bg-amber-50 border-amber-200';
      textColor = 'text-amber-900';
      profitLabel = 'Est. Profit:';
      profitValueClass = 'text-amber-700';
    } else {
      bgClass = 'bg-emerald-50 border-emerald-200';
      textColor = 'text-emerald-900';
      profitLabel = 'Est. Profit:';
      profitValueClass = 'text-emerald-700';
    }
    
    return (
      <div className={`p-4 rounded-2xl border ${bgClass} flex flex-col justify-between shadow-sm`}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className={`font-black uppercase tracking-wider text-[11px] mb-1 ${textColor} opacity-80`}>{title}</div>
            <div className={`text-3xl font-black ${textColor}`}>{roas > 0 ? roas.toFixed(2) : '0.00'}x</div>
          </div>
          <div className="text-right">
            <div className={`font-bold text-[10px] uppercase ${textColor} opacity-80`}>{profitLabel}</div>
            <div className={`font-black text-lg ${profitValueClass}`}>{color === 'red' ? 'Rp0' : formatCurrency(estProfit)}</div>
            {color !== 'red' && <div className={`font-bold text-[10px] ${profitValueClass}`}>Margin Bersih: {marginPct}%</div>}
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2 text-xs border-t border-black/10 pt-3">
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-bold">Omset</span>
            <span className="font-bold text-slate-900">{formatCurrency(estOmset)}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-bold">Terjual</span>
            <span className="font-bold text-slate-900">{estQty} pcs</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-bold">Tot. Margin</span>
            <span className="font-bold text-slate-900">{formatCurrency(estMargin)}</span>
          </div>
        </div>
      </div>
    );
  };"""

text = text.replace(old_sim, new_sim)

# 2. Update Ringkasan Multi-Varian
old_v2_ringkasan = """              <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wide">Ringkasan Unit Economics Multi-Varian</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Total Varian</p>
                    <p className="font-black text-gray-900">{v2Product.varian?.length || 0} Varian</p>
                    <p className="text-[10px] text-gray-500 mt-1">Min. Order: {v2MinOrder} pcs</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">ASP (Harga Rata-rata)</p>
                    <p className="font-black text-gray-900">{formatCurrency(v2Asp)}</p>
                    <p className="text-[10px] text-gray-500 mt-1">HSP (Tertinggi): {formatCurrency(v2Hsp)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">ASM (Margin Rata-rata)</p>
                    <p className="font-black text-emerald-600">{formatCurrency(v2Asm)}</p>
                    <p className="text-[10px] text-gray-500 mt-1">LSM (Terendah): {formatCurrency(v2Lsm)}</p>
                  </div>
                </div>
              </div>"""

new_v2_ringkasan = """              <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wide">Ringkasan Unit Economics Multi-Varian</h3>
                </div>
                <div className="flex flex-wrap items-start gap-4 sm:gap-8">
                  <div className="min-w-[120px]">
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Total Varian</p>
                    <p className="font-black text-gray-900 text-sm">{v2Product.varian?.length || 0} Varian</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Min. Order: {v2MinOrder} pcs</p>
                  </div>
                  <div className="min-w-[120px]">
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">ASP (Harga)</p>
                    <p className="font-black text-gray-900 text-sm">{formatCurrency(v2Asp)}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">HSP: {formatCurrency(v2Hsp)}</p>
                  </div>
                  <div className="min-w-[120px]">
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">ASM (Margin)</p>
                    <p className="font-black text-emerald-600 text-sm">{formatCurrency(v2Asm)}</p>
                    <p className="text-[10px] text-emerald-600/80 font-bold mt-0.5">({v2Asp > 0 ? (v2Asm/v2Asp*100).toFixed(1) : 0}%)</p>
                  </div>
                  <div className="min-w-[120px]">
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">LSM (Margin Bawah)</p>
                    <p className="font-black text-amber-600 text-sm">{formatCurrency(v2Lsm)}</p>
                    <p className="text-[10px] text-amber-600/80 font-bold mt-0.5">({v2Hsp > 0 ? (v2Lsm/v2Hsp*100).toFixed(1) : 0}%)</p>
                  </div>
                </div>
              </div>"""

text = text.replace(old_v2_ringkasan, new_v2_ringkasan)

# 3. Update Ringkasan Grup
old_v3_ringkasan = """              <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wide">Ringkasan Unit Economics Grup</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Produk & Varian</p>
                    <p className="font-black text-gray-900">{v3SelectedProductIds.length} Produk</p>
                    <p className="text-[10px] text-gray-500 mt-1">Total {totalVariantsGroup} Varian Terhitung</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">ASP Grup</p>
                    <p className="font-black text-gray-900">{formatCurrency(v3Asp)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">ASM Grup</p>
                    <p className="font-black text-emerald-600">{formatCurrency(v3Asm)}</p>
                  </div>
                </div>
              </div>"""

new_v3_ringkasan = """              <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wide">Ringkasan Unit Economics Grup</h3>
                </div>
                <div className="flex flex-wrap items-start gap-4 sm:gap-8">
                  <div className="min-w-[120px]">
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Cakupan Grup</p>
                    <p className="font-black text-gray-900 text-sm">{v3SelectedProductIds.length} Produk</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{totalVariantsGroup} Varian Terhitung</p>
                  </div>
                  <div className="min-w-[120px]">
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">ASP Grup (Harga)</p>
                    <p className="font-black text-gray-900 text-sm">{formatCurrency(v3Asp)}</p>
                  </div>
                  <div className="min-w-[120px]">
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">ASM Grup (Margin)</p>
                    <p className="font-black text-emerald-600 text-sm">{formatCurrency(v3Asm)}</p>
                    <p className="text-[10px] text-emerald-600/80 font-bold mt-0.5">({v3Asp > 0 ? (v3Asm/v3Asp*100).toFixed(1) : 0}%)</p>
                  </div>
                </div>
              </div>"""

text = text.replace(old_v3_ringkasan, new_v3_ringkasan)

# 4. Update Variant Margin 
# The single variant doesn't have a ringkasan block, it just has the selector. But maybe we can add a small ringkasan below it to show margin % too.
old_v1_sel = """              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-bold text-gray-600 mb-2 block">Pilih Produk</Label>
                  <Select value={v1SelectedProductId} onValueChange={(v) => {
                    setV1SelectedProductId(v);
                    const prod = products.find(p => p.id === v);
                    if (prod && prod.varian?.length > 0) {
                      setV1SelectedVariantId(prod.varian[0].id);
                    }
                  }}>
                    <SelectTrigger className="w-full h-11 bg-white border-gray-200"><SelectValue placeholder="Pilih Produk..." /></SelectTrigger>
                    <SelectContent>
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.nama}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-bold text-gray-600 mb-2 block">Pilih Varian</Label>
                  <Select value={v1SelectedVariantId} onValueChange={setV1SelectedVariantId}>
                    <SelectTrigger className="w-full h-11 bg-white border-gray-200"><SelectValue placeholder="Pilih Varian..." /></SelectTrigger>
                    <SelectContent>
                      {v1Product?.varian?.map(v => <SelectItem key={v.id} value={v.id}>{v.nama}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>"""

new_v1_sel = """              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-bold text-gray-600 mb-2 block">Pilih Produk</Label>
                  <Select value={v1SelectedProductId} onValueChange={(v) => {
                    setV1SelectedProductId(v);
                    const prod = products.find(p => p.id === v);
                    if (prod && prod.varian?.length > 0) {
                      setV1SelectedVariantId(prod.varian[0].id);
                    }
                  }}>
                    <SelectTrigger className="w-full h-11 bg-white border-gray-200"><SelectValue placeholder="Pilih Produk..." /></SelectTrigger>
                    <SelectContent>
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.nama}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-bold text-gray-600 mb-2 block">Pilih Varian</Label>
                  <Select value={v1SelectedVariantId} onValueChange={setV1SelectedVariantId}>
                    <SelectTrigger className="w-full h-11 bg-white border-gray-200"><SelectValue placeholder="Pilih Varian..." /></SelectTrigger>
                    <SelectContent>
                      {v1Product?.varian?.map(v => <SelectItem key={v.id} value={v.id}>{v.nama}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {v1Product && v1Variant && (
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mt-2">
                  <div className="flex flex-wrap items-start gap-4 sm:gap-8">
                    <div className="min-w-[120px]">
                      <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Harga Jual</p>
                      <p className="font-black text-gray-900 text-sm">{formatCurrency(v1Harga)}</p>
                    </div>
                    <div className="min-w-[120px]">
                      <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Margin Produk</p>
                      <p className="font-black text-emerald-600 text-sm">{formatCurrency(v1Margin)}</p>
                      <p className="text-[10px] text-emerald-600/80 font-bold mt-0.5">({v1Harga > 0 ? (v1Margin/v1Harga*100).toFixed(1) : 0}%)</p>
                    </div>
                    <div className="min-w-[120px]">
                      <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Total Fee & HPP</p>
                      <p className="font-black text-amber-600 text-sm">{formatCurrency(v1Hpp + v1FeeAmount)}</p>
                    </div>
                  </div>
                </div>
              )}"""

if old_v1_sel in text:
    text = text.replace(old_v1_sel, new_v1_sel)

with open('src/components/ROASCalculator.tsx', 'w') as f:
    f.write(text)

