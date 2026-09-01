const fs = require('fs');

let oldFile = fs.readFileSync('src/components/ROASCalculator.tsx', 'utf-8');
const imports = oldFile.substring(0, oldFile.indexOf('export default function ROASCalculator'));

let newComponent = `
export default function ROASCalculator({ products: rawProducts = [], ingredients: rawIngredients = [], transactions: rawTransactions = [], user }: Props) {
  const products = React.useMemo(() => {
    const arr = Array.isArray(rawProducts) ? rawProducts : [];
    return arr.map((p) => ({
      ...p,
      biaya_lain: Array.isArray(p?.biaya_lain) ? p.biaya_lain : [],
      varian: Array.isArray(p?.varian)
        ? p.varian.map((v) => ({
            ...v,
            bahan: Array.isArray(v?.bahan) ? v.bahan : [],
            biaya_lain: Array.isArray(v?.biaya_lain) ? v.biaya_lain : [],
          }))
        : [],
    }));
  }, [rawProducts]);
  const ingredients = Array.isArray(rawIngredients) ? rawIngredients : [];

  // TABS
  const [calcMode, setCalcMode] = React.useState<'find_roas' | 'find_price'>('find_roas');
  const [adMode, setAdMode] = React.useState<'variant' | 'product' | 'group'>('variant');

  // FIND ROAS STATES
  const [useConservative, setUseConservative] = React.useState(false);
  const [biayaIklan, setBiayaIklan] = React.useState(100000);

  // FIND PRICE STATES
  const [targetRoasInput, setTargetRoasInput] = React.useState(8);

  // SELECTIONS
  const [v1SelectedProductId, setV1SelectedProductId] = React.useState<string>(() => products[0]?.id || '');
  const [v1SelectedVariantId, setV1SelectedVariantId] = React.useState<string>(() => products[0]?.varian?.[0]?.id || '');
  const [v2SelectedProductId, setV2SelectedProductId] = React.useState<string>(() => products[0]?.id || '');

  const [v3SelectedProductIds, setV3SelectedProductIds] = React.useState<string[]>(() => products.map(p => p.id));

  const toggleGroupProduct = (id: string) => {
    setV3SelectedProductIds(prev => prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]);
  };

  // APPLY PRICE MODAL
  const [confirmModalData, setConfirmModalData] = React.useState<{product: Product; variant: Variant; newPrice: number;} | null>(null);

  const executeApplyPrice = async () => {
    if (!confirmModalData || !user?.uid) return;
    const { product, variant, newPrice } = confirmModalData;
    try {
      const updatedVariants = (product.varian || []).map((v) => v.id === variant.id ? { ...v, harga_jual: newPrice } : v);
      const updatedProduct = { ...product, varian: updatedVariants };
      const productRef = doc(db, \\\`users/\\\${user.uid}/hpp/\\\${product.id}\\\`);
      await setDoc(productRef, sanitizeData(updatedProduct));
      toast.success(\\\`Harga berhasil diperbarui menjadi \\\${formatCurrency(newPrice)}\\\`);
      setConfirmModalData(null);
    } catch (e) {
      toast.error('Gagal menerapkan harga');
    }
  };

  // ---------------------------------------------------------
  // CORE LOGIC EXTRACTOR
  // ---------------------------------------------------------
  
  // V1: Variant Logic
  const v1Product = products.find(p => p.id === v1SelectedProductId);
  const v1Variant = v1Product?.varian?.find(v => v.id === v1SelectedVariantId);
  let v1Hpp = 0, v1FeePct = 0, v1Margin = 0, v1Harga = 0, v1FeeNominal = 0, v1MinOrder = 1;
  let v1FeeAmount = 0;
  if (v1Product && v1Variant) {
    v1MinOrder = Math.max(1, Number(v1Product.min_order) || 1);
    v1Hpp = calcHppPerPcs(v1Variant, ingredients);
    const feeConf = extractFeeRates(v1Product, v1Variant);
    v1FeePct = feeConf.percentRate; 
    v1FeeNominal = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / v1MinOrder);
    v1Harga = v1Variant.harga_jual;
    v1FeeAmount = (v1Harga * v1FeePct / 100) + v1FeeNominal;
    v1Margin = v1Harga - v1Hpp - v1FeeAmount;
  }

  // V2: Product Logic
  const v2Product = products.find(p => p.id === v2SelectedProductId);
  let v2Asp = 0, v2Asm = 0, v2Hsp = 0, v2Lsm = 0, v2MinOrder = 1;
  if (v2Product && v2Product.varian?.length) {
    v2MinOrder = Math.max(1, Number(v2Product.min_order) || 1);
    let sumPrice = 0, sumMargin = 0;
    v2Product.varian.forEach(v => {
      const hpp = calcHppPerPcs(v, ingredients);
      const feeConf = extractFeeRates(v2Product, v);
      const feeN = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / v2MinOrder);
      const margin = v.harga_jual - (hpp + (v.harga_jual * feeConf.percentRate / 100) + feeN);
      sumPrice += v.harga_jual;
      sumMargin += margin;
      if (v.harga_jual > v2Hsp) v2Hsp = v.harga_jual;
      if (v2Lsm === 0 || margin < v2Lsm) v2Lsm = margin;
    });
    v2Asp = sumPrice / v2Product.varian.length;
    v2Asm = sumMargin / v2Product.varian.length;
  }

  // V3: Group Logic
  let v3Asp = 0, v3Asm = 0, v3Hsp = 0, v3Lsm = 0;
  let totalVariantsGroup = 0;
  if (v3SelectedProductIds.length > 0) {
    let sumPrice = 0, sumMargin = 0;
    products.filter(p => v3SelectedProductIds.includes(p.id)).forEach(p => {
      const pMinOrder = Math.max(1, Number(p.min_order) || 1);
      p.varian?.forEach(v => {
        totalVariantsGroup++;
        const hpp = calcHppPerPcs(v, ingredients);
        const feeConf = extractFeeRates(p, v);
        const feeN = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / pMinOrder);
        const margin = v.harga_jual - (hpp + (v.harga_jual * feeConf.percentRate / 100) + feeN);
        sumPrice += v.harga_jual;
        sumMargin += margin;
        if (v.harga_jual > v3Hsp) v3Hsp = v.harga_jual;
        if (v3Lsm === 0 || margin < v3Lsm) v3Lsm = margin;
      });
    });
    if (totalVariantsGroup > 0) {
      v3Asp = sumPrice / totalVariantsGroup;
      v3Asm = sumMargin / totalVariantsGroup;
    }
  }

  // Final H and M Selection
  let H = 0;
  let M = 0;
  let displayTitle = '';
  
  if (adMode === 'variant') {
    H = v1Harga;
    M = v1Margin;
    displayTitle = \\\`\\\${v1Product?.nama || 'Produk'} - \\\${v1Variant?.nama || 'Varian'}\\\`;
  } else if (adMode === 'product') {
    H = useConservative ? v2Hsp : v2Asp;
    M = useConservative ? v2Lsm : v2Asm;
    displayTitle = v2Product?.nama || 'Produk Multi-Varian';
  } else {
    H = useConservative ? v3Hsp : v3Asp;
    M = useConservative ? v3Lsm : v3Asm;
    displayTitle = \\\`Grup Iklan (\\\${v3SelectedProductIds.length} Produk)\\\`;
  }

  // Target ROAS Math
  const roasBep = M > 0 ? H / M : 0;
  const roasMin = roasBep > 0 ? roasBep * 1.5 : 0;
  const roasIdeal = roasBep > 0 ? roasBep * 2.0 : 0;

  const renderSimCard = (title: string, roas: number, color: string) => {
    const estOmset = biayaIklan * roas;
    const estQty = H > 0 ? Math.floor(estOmset / H) : 0;
    const estMargin = estQty * M;
    const estProfit = estMargin - biayaIklan;
    
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
      <div className={\\\`p-5 rounded-2xl border \\\${bgClass} flex flex-col justify-between shadow-sm\\\`}>
        <div>
          <div className={\\\`font-black uppercase tracking-wider text-[11px] mb-1 \\\${textColor} opacity-80\\\`}>{title}</div>
          <div className={\\\`text-4xl font-black mb-6 \\\${textColor}\\\`}>{roas > 0 ? roas.toFixed(2) : '0.00'}x</div>
        </div>
        <div className="text-sm space-y-2">
          <div className="flex justify-between items-center text-slate-600"><span>Est. Omset:</span><span className="font-bold text-slate-900">{formatCurrency(estOmset)}</span></div>
          <div className="flex justify-between items-center text-slate-600"><span>Est. Qty Terjual:</span><span className="font-bold text-slate-900">{estQty} pcs</span></div>
          <div className="flex justify-between items-center text-slate-600"><span>Est. Total Margin:</span><span className="font-bold text-slate-900">{formatCurrency(estMargin)}</span></div>
          
          <div className={\\\`flex justify-between items-center mt-3 pt-3 border-t border-black/10\\\`}>
            <span className={\\\`font-bold \\\${textColor}\\\`}>{profitLabel}</span>
            <span className={\\\`font-black text-lg \\\${profitValueClass}\\\`}>{color === 'red' ? 'Rp0' : formatCurrency(estProfit)}</span>
          </div>
        </div>
      </div>
    );
  };

  const calcReversePrice = (hpp: number, feePct: number, feeNominal: number, tRoas: number) => {
    const denomBep = (1 - (feePct/100)) - (1.0 / tRoas);
    const hargaBep = denomBep > 0 ? (hpp + feeNominal) / denomBep : 0;
    const denomMin = (1 - (feePct/100)) - (1.5 / tRoas);
    const hargaMin = denomMin > 0 ? (hpp + feeNominal) / denomMin : 0;
    const denomIdeal = (1 - (feePct/100)) - (2.0 / tRoas);
    const hargaIdeal = denomIdeal > 0 ? (hpp + feeNominal) / denomIdeal : 0;
    
    const marginIdeal = hargaIdeal - (hpp + (hargaIdeal * feePct / 100) + feeNominal);
    return { hargaBep, hargaMin, hargaIdeal, marginIdeal };
  };

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6 pb-36">
      {/* HEADER & TABS MODE */}
      <div className="flex flex-col gap-5 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Kalkulator ROAS & Harga</h1>
          <p className="text-gray-500 text-sm mt-1">Hitung target ROAS iklan dan rekomendasi harga jual berdasarkan unit economics.</p>
        </div>
        
        <div className="flex flex-wrap gap-2 p-1.5 bg-gray-50 border border-gray-100 rounded-2xl w-fit">
          <button 
            onClick={() => setCalcMode('find_roas')} 
            className={\\\`px-6 py-3 rounded-xl text-sm font-black transition-all flex items-center gap-2 \\\${calcMode === 'find_roas' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200'}\\\`}
          >
            <Calculator className="w-4 h-4" /> CARI ROAS
          </button>
          <button 
            onClick={() => setCalcMode('find_price')} 
            className={\\\`px-6 py-3 rounded-xl text-sm font-black transition-all flex items-center gap-2 \\\${calcMode === 'find_price' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200'}\\\`}
          >
            <DollarSign className="w-4 h-4" /> CARI HARGA
          </button>
        </div>

        {/* TABS TIPE IKLAN */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          {(['variant', 'product', 'group'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setAdMode(mode)}
              className={\\\`px-5 py-2.5 rounded-xl text-xs font-bold transition-all \\\${adMode === mode ? 'bg-gray-900 text-white border-transparent' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}\\\`}
            >
              {mode === 'variant' ? 'Single Varian' : mode === 'product' ? 'Produk Multi-Varian' : 'Grup Iklan / Toko'}
            </button>
          ))}
        </div>
      </div>

      {/* SELECTORS & TRANSPARENCY BOX */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-5">
        <h2 className="font-black text-gray-900 text-sm uppercase tracking-wider flex items-center gap-2">
          <Package className="w-4 h-4 text-indigo-600" />
          Pilih Produk / Varian Target
        </h2>
        
        {adMode === 'variant' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-600">Pilih Produk</Label>
                <Select value={v1SelectedProductId} onValueChange={setV1SelectedProductId}>
                  <SelectTrigger className="h-11 rounded-xl bg-gray-50 border-gray-200 font-bold"><SelectValue placeholder="Pilih Produk" /></SelectTrigger>
                  <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.nama}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-600">Pilih Varian</Label>
                <Select value={v1SelectedVariantId} onValueChange={setV1SelectedVariantId}>
                  <SelectTrigger className="h-11 rounded-xl bg-gray-50 border-gray-200 font-bold"><SelectValue placeholder="Pilih Varian" /></SelectTrigger>
                  <SelectContent>{v1Product?.varian?.map(v => <SelectItem key={v.id} value={v.id}>{v.nama}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Unit Economics Transparency Box */}
            {v1Variant && (
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wide">Detail Unit Economics Terpanggil</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Min. Order</p>
                    <p className="font-black text-gray-900">{v1MinOrder} pcs</p>
                    {v1MinOrder > 1 && <p className="text-[10px] text-indigo-600 font-bold mt-1">Skala Paket Aktif</p>}
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">HPP Terpanggil</p>
                    <p className="font-black text-gray-900">{formatCurrency(v1Hpp)} <span className="text-xs font-normal text-gray-500">/ pcs</span></p>
                    {v1MinOrder > 1 && <p className="text-[10px] text-gray-500 mt-1">HPP Paket: {formatCurrency(v1Hpp * v1MinOrder)}</p>}
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Total Fee Marketplace</p>
                    <p className="font-black text-gray-900">{v1FeePct}% + {formatCurrency(v1FeeNominal)}</p>
                    <p className="text-[10px] text-gray-500 mt-1">Estimasi: {formatCurrency(v1FeeAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Margin Bersih (M)</p>
                    <p className="font-black text-emerald-600">{formatCurrency(v1Margin)} <span className="text-xs font-normal text-gray-500">/ pcs</span></p>
                    {v1MinOrder > 1 && <p className="text-[10px] text-emerald-600 mt-1">Margin Paket: {formatCurrency(v1Margin * v1MinOrder)}</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        {adMode === 'product' && (
          <div className="space-y-4">
            <div className="space-y-1.5 max-w-md">
              <Label className="text-xs font-bold text-gray-600">Pilih Produk Multi-Varian</Label>
              <Select value={v2SelectedProductId} onValueChange={setV2SelectedProductId}>
                <SelectTrigger className="h-11 rounded-xl bg-gray-50 border-gray-200 font-bold"><SelectValue placeholder="Pilih Produk" /></SelectTrigger>
                <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.nama}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {v2Product && (
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mt-2">
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
              </div>
            )}
          </div>
        )}
        
        {adMode === 'group' && (
          <div className="space-y-4">
            <Label className="text-xs font-bold text-gray-600">Pilih Produk dalam Grup Iklan</Label>
            <div className="flex flex-wrap gap-2">
              {products.map(p => {
                const isSelected = v3SelectedProductIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleGroupProduct(p.id)}
                    className={\\\`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all \\\${isSelected ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}\\\`}
                  >
                    {isSelected && "✓ "} {p.nama}
                  </button>
                )
              })}
            </div>

            {v3SelectedProductIds.length > 0 && (
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mt-2">
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
              </div>
            )}
          </div>
        )}
      </div>

      {calcMode === 'find_roas' ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-6">
            <div className="flex flex-col lg:flex-row justify-between items-start gap-6 border-b border-gray-100 pb-6">
              <div className="space-y-2">
                <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-600" /> Parameter Perhitungan ROAS
                </h3>
                <div className="flex flex-col gap-1 text-sm text-gray-600">
                  <div className="flex gap-2 items-center"><span className="w-32">Target Objek:</span><strong className="text-gray-900 bg-gray-100 px-2 py-0.5 rounded-md">{displayTitle}</strong></div>
                  <div className="flex gap-2 items-center"><span className="w-32">Harga Ref (H):</span><strong className="text-indigo-700 text-base">{formatCurrency(H)}</strong></div>
                  <div className="flex gap-2 items-center"><span className="w-32">Margin Ref (M):</span><strong className="text-emerald-700 text-base">{formatCurrency(M)}</strong></div>
                </div>
              </div>
              
              <div className="flex flex-col gap-4 w-full lg:w-[350px] bg-gray-50 p-4 rounded-2xl border border-gray-200">
                {(adMode === 'product' || adMode === 'group') && (
                  <div className="space-y-2 border-b border-gray-200 pb-4">
                    <Label className="text-xs font-bold text-gray-700">Metode Agregasi Data</Label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setUseConservative(false)} 
                        className={\\\`flex-1 py-2 rounded-xl text-xs font-bold transition-all border \\\${!useConservative ? 'bg-white border-indigo-200 text-indigo-700 shadow-sm' : 'bg-transparent border-gray-200 text-gray-500 hover:bg-gray-100'}\\\`}
                      >
                        Rata-Rata (ASP & ASM)
                      </button>
                      <button 
                        onClick={() => setUseConservative(true)} 
                        className={\\\`flex-1 py-2 rounded-xl text-xs font-bold transition-all border \\\${useConservative ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm' : 'bg-transparent border-gray-200 text-gray-500 hover:bg-gray-100'}\\\`}
                      >
                        Skenario Aman
                      </button>
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-700">Simulasi Biaya Iklan (B)</Label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 font-bold sm:text-sm">Rp</span>
                    </div>
                    <Input 
                      type="number" 
                      value={biayaIklan} 
                      onChange={e => setBiayaIklan(Math.max(0, Number(e.target.value) || 0))} 
                      className="pl-10 h-12 rounded-xl border-gray-300 font-black text-gray-900 bg-white" 
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-2">
              {renderSimCard('ROAS BEP', roasBep, 'red')}
              {renderSimCard('ROAS Minimum (1.5x)', roasMin, 'yellow')}
              {renderSimCard('ROAS Ideal (2.0x)', roasIdeal, 'green')}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-gray-100 pb-5">
              <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
                <Tag className="w-5 h-5 text-emerald-600" /> Hitung Rekomendasi Harga Jual
              </h3>
              <div className="flex items-center gap-3 bg-emerald-50 p-2 pl-4 rounded-2xl border border-emerald-100">
                <Label className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Target ROAS Iklan (x)</Label>
                <div className="flex items-center gap-1">
                  <Input 
                    type="number" 
                    step="0.1" 
                    min="1"
                    value={targetRoasInput} 
                    onChange={e => setTargetRoasInput(Math.max(1, Number(e.target.value) || 1))} 
                    className="w-24 h-10 rounded-xl font-black text-emerald-900 border-emerald-200 text-center text-lg bg-white" 
                  />
                </div>
              </div>
            </div>

            <div className="overflow-hidden border border-gray-200 rounded-2xl shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap md:whitespace-normal">
                  <thead className="bg-gray-50 text-gray-600 font-black border-b border-gray-200 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-4">SKU / Varian</th>
                      <th className="p-4 hidden md:table-cell">Struktur Biaya Dasar</th>
                      <th className="p-4">Harga BEP</th>
                      <th className="p-4 text-amber-700">Harga Min (1.5x)</th>
                      <th className="p-4 text-emerald-700">Harga Ideal (2.0x)</th>
                      <th className="p-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    
                    {adMode === 'variant' && v1Variant && (
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="p-4 font-bold text-gray-900 whitespace-normal min-w-[150px]">{v1Variant.nama}</td>
                        <td className="p-4 hidden md:table-cell">
                          <div className="text-xs">
                            <span className="text-gray-500">HPP:</span> <span className="font-bold">{formatCurrency(v1Hpp)}</span><br/>
                            <span className="text-gray-500">Fee:</span> <span className="font-bold">{v1FeePct}% + {formatCurrency(v1FeeNominal)}</span>
                          </div>
                        </td>
                        <td className="p-4 font-bold text-gray-500">{formatCurrency(calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).hargaBep)}</td>
                        <td className="p-4 font-black text-amber-600 text-base">{formatCurrency(calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).hargaMin)}</td>
                        <td className="p-4 font-black text-emerald-600 text-base">
                          {formatCurrency(calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).hargaIdeal)}
                          <div className="text-[10px] font-bold text-emerald-600/70 mt-1">Margin: {formatCurrency(calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).marginIdeal)}</div>
                        </td>
                        <td className="p-4 text-center">
                          <Button 
                            onClick={() => setConfirmModalData({product: v1Product!, variant: v1Variant, newPrice: calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).hargaIdeal})} 
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold px-5 h-10 w-full"
                          >
                            Terapkan Harga
                          </Button>
                        </td>
                      </tr>
                    )}

                    {adMode === 'product' && v2Product && v2Product.varian?.map(v => {
                      const hpp = calcHppPerPcs(v, ingredients);
                      const feeConf = extractFeeRates(v2Product, v);
                      const feeN = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / v2MinOrder);
                      const prices = calcReversePrice(hpp, feeConf.percentRate, feeN, targetRoasInput);
                      return (
                        <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                          <td className="p-4 font-bold text-gray-900 whitespace-normal min-w-[150px]">{v.nama}</td>
                          <td className="p-4 hidden md:table-cell">
                            <div className="text-xs">
                              <span className="text-gray-500">HPP:</span> <span className="font-bold">{formatCurrency(hpp)}</span><br/>
                              <span className="text-gray-500">Fee:</span> <span className="font-bold">{feeConf.percentRate}% + {formatCurrency(feeN)}</span>
                            </div>
                          </td>
                          <td className="p-4 font-bold text-gray-500">{formatCurrency(prices.hargaBep)}</td>
                          <td className="p-4 font-black text-amber-600 text-base">{formatCurrency(prices.hargaMin)}</td>
                          <td className="p-4 font-black text-emerald-600 text-base">
                            {formatCurrency(prices.hargaIdeal)}
                            <div className="text-[10px] font-bold text-emerald-600/70 mt-1">Margin: {formatCurrency(prices.marginIdeal)}</div>
                          </td>
                          <td className="p-4 text-center">
                            <Button 
                              onClick={() => setConfirmModalData({product: v2Product!, variant: v, newPrice: prices.hargaIdeal})} 
                              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold px-5 h-10 w-full"
                            >
                              Terapkan
                            </Button>
                          </td>
                        </tr>
                      );
                    })}

                    {adMode === 'group' && v3SelectedProductIds.length > 0 && products.filter(p => v3SelectedProductIds.includes(p.id)).map(p => {
                      const pMinOrder = Math.max(1, Number(p.min_order) || 1);
                      return p.varian?.map(v => {
                        const hpp = calcHppPerPcs(v, ingredients);
                        const feeConf = extractFeeRates(p, v);
                        const feeN = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / pMinOrder);
                        const prices = calcReversePrice(hpp, feeConf.percentRate, feeN, targetRoasInput);
                        return (
                          <tr key={\`\${p.id}-\${v.id}\`} className="hover:bg-gray-50 transition-colors">
                            <td className="p-4 font-bold text-gray-900 whitespace-normal min-w-[150px]">
                              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">{p.nama}</div>
                              {v.nama}
                            </td>
                            <td className="p-4 hidden md:table-cell">
                              <div className="text-xs">
                                <span className="text-gray-500">HPP:</span> <span className="font-bold">{formatCurrency(hpp)}</span><br/>
                                <span className="text-gray-500">Fee:</span> <span className="font-bold">{feeConf.percentRate}% + {formatCurrency(feeN)}</span>
                              </div>
                            </td>
                            <td className="p-4 font-bold text-gray-500">{formatCurrency(prices.hargaBep)}</td>
                            <td className="p-4 font-black text-amber-600 text-base">{formatCurrency(prices.hargaMin)}</td>
                            <td className="p-4 font-black text-emerald-600 text-base">
                              {formatCurrency(prices.hargaIdeal)}
                              <div className="text-[10px] font-bold text-emerald-600/70 mt-1">Margin: {formatCurrency(prices.marginIdeal)}</div>
                            </td>
                            <td className="p-4 text-center">
                              <Button 
                                onClick={() => setConfirmModalData({product: p, variant: v, newPrice: prices.hargaIdeal})} 
                                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold px-5 h-10 w-full"
                              >
                                Terapkan
                              </Button>
                            </td>
                          </tr>
                        );
                      });
                    })}

                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmModalData && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <h3 className="font-black text-xl text-gray-900">Konfirmasi Update Harga</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              Anda akan memperbarui harga <strong>{confirmModalData.product.nama} ({confirmModalData.variant.nama})</strong> secara permanen ke database menjadi:
            </p>
            <div className="text-3xl font-black text-emerald-600 text-center py-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
              {formatCurrency(confirmModalData.newPrice)}
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 h-12 rounded-xl font-bold text-gray-600" onClick={() => setConfirmModalData(null)}>Batal</Button>
              <Button className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={executeApplyPrice}>Terapkan</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
`;

fs.writeFileSync('src/components/ROASCalculator.tsx', imports + newComponent);
