import re

with open('src/components/ROASCalculator.tsx', 'r') as f:
    text = f.read()

# 1. Add States
state_insert = """  // OPTIONAL FEATURES STATES
  const [usePpnIklan, setUsePpnIklan] = React.useState(false);
  const [usePromoEvent, setUsePromoEvent] = React.useState(false);
  const [promoDiskonNominal, setPromoDiskonNominal] = React.useState(0);
  const [promoDiskonPersen, setPromoDiskonPersen] = React.useState(0);
  const [promoExtraFeePersen, setPromoExtraFeePersen] = React.useState(0);

"""

text = text.replace("  // FIND ROAS STATES", state_insert + "  // FIND ROAS STATES")

# 2. Update Core Logic Extractor for v1, v2, v3
old_v1 = """  // V1: Variant Logic
  const v1Product = products.find(p => p.id === v1SelectedProductId);
  const v1Variant = v1Product?.varian?.find(v => v.id === v1SelectedVariantId);
  let v1Hpp = 0, v1FeePct = 0, v1Margin = 0, v1Harga = 0, v1FeeNominal = 0, v1MinOrder = 1;
  let v1FeeAmount = 0;
  if (v1Product && v1Variant) {
    v1MinOrder = Math.max(1, Number(v1Variant.min_order) || 1);
    v1Hpp = calcHppPerPcs(v1Variant, ingredients);
    const feeConf = extractFeeRates(v1Product, v1Variant);
    v1FeePct = feeConf.percentRate; 
    v1FeeNominal = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / v1MinOrder);
    v1Harga = v1Variant.harga_jual;
    v1FeeAmount = (v1Harga * v1FeePct / 100) + v1FeeNominal;
    v1Margin = v1Harga - v1Hpp - v1FeeAmount;
  }"""

new_v1 = """  // V1: Variant Logic
  const v1Product = products.find(p => p.id === v1SelectedProductId);
  const v1Variant = v1Product?.varian?.find(v => v.id === v1SelectedVariantId);
  let v1Hpp = 0, v1FeePct = 0, v1Margin = 0, v1Harga = 0, v1FeeNominal = 0, v1MinOrder = 1;
  let v1FeeAmount = 0;
  if (v1Product && v1Variant) {
    v1MinOrder = Math.max(1, Number(v1Variant.min_order) || 1);
    v1Hpp = calcHppPerPcs(v1Variant, ingredients);
    const feeConf = extractFeeRates(v1Product, v1Variant);
    v1FeePct = feeConf.percentRate; 
    v1FeeNominal = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / v1MinOrder);
    v1Harga = v1Variant.harga_jual;
    v1FeeAmount = (v1Harga * v1FeePct / 100) + v1FeeNominal;
    
    let currentH = v1Harga;
    let diskonEvent = 0;
    let extraFeeEvent = 0;
    if (usePromoEvent) {
      diskonEvent = promoDiskonNominal + (currentH * promoDiskonPersen / 100);
      extraFeeEvent = currentH * promoExtraFeePersen / 100;
      currentH = currentH - diskonEvent;
    }
    
    v1Margin = currentH - v1Hpp - v1FeeAmount - extraFeeEvent;
  }"""

text = text.replace(old_v1, new_v1)

old_v2_loop = """      const hpp = calcHppPerPcs(v, ingredients);
      const feeConf = extractFeeRates(v2Product, v);
      const feeN = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / vMinOrder);
      const margin = v.harga_jual - (hpp + (v.harga_jual * feeConf.percentRate / 100) + feeN);
      sumPrice += v.harga_jual;
      sumMargin += margin;"""

new_v2_loop = """      const hpp = calcHppPerPcs(v, ingredients);
      const feeConf = extractFeeRates(v2Product, v);
      const feeN = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / vMinOrder);
      
      let currentH = v.harga_jual;
      let diskonEvent = 0;
      let extraFeeEvent = 0;
      if (usePromoEvent) {
        diskonEvent = promoDiskonNominal + (currentH * promoDiskonPersen / 100);
        extraFeeEvent = currentH * promoExtraFeePersen / 100;
        currentH = currentH - diskonEvent;
      }
      
      const margin = currentH - (hpp + (v.harga_jual * feeConf.percentRate / 100) + feeN) - extraFeeEvent;
      sumPrice += v.harga_jual;
      sumMargin += margin;"""

text = text.replace(old_v2_loop, new_v2_loop)

old_v3_loop = """        const hpp = calcHppPerPcs(v, ingredients);
        const feeConf = extractFeeRates(p, v);
        const feeN = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / pMinOrder);
        const margin = v.harga_jual - (hpp + (v.harga_jual * feeConf.percentRate / 100) + feeN);
        sumPrice += v.harga_jual;
        sumMargin += margin;"""

new_v3_loop = """        const hpp = calcHppPerPcs(v, ingredients);
        const feeConf = extractFeeRates(p, v);
        const feeN = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / pMinOrder);
        
        let currentH = v.harga_jual;
        let diskonEvent = 0;
        let extraFeeEvent = 0;
        if (usePromoEvent) {
          diskonEvent = promoDiskonNominal + (currentH * promoDiskonPersen / 100);
          extraFeeEvent = currentH * promoExtraFeePersen / 100;
          currentH = currentH - diskonEvent;
        }
        
        const margin = currentH - (hpp + (v.harga_jual * feeConf.percentRate / 100) + feeN) - extraFeeEvent;
        sumPrice += v.harga_jual;
        sumMargin += margin;"""

text = text.replace(old_v3_loop, new_v3_loop)

# 3. Update Target ROAS Math and renderSimCard
old_roas_math = """  // Target ROAS Math
  const roasBep = M > 0 ? H / M : 0;
  const roasMin = roasBep > 0 ? roasBep * 1.5 : 0;
  const roasIdeal = roasBep > 0 ? roasBep * 2.0 : 0;

  const renderSimCard = (title: string, roas: number, color: string) => {
    const estOmset = biayaIklan * roas;
    const estQty = H > 0 ? Math.floor(estOmset / H) : 0;
    const estMargin = estQty * M;
    const estProfit = estMargin - biayaIklan;"""

new_roas_math = """  // Target ROAS Math
  const ppnFactor = usePpnIklan ? 1.11 : 1.0;
  const roasBep = M > 0 ? (H / M) * ppnFactor : 0;
  const roasMin = roasBep > 0 ? roasBep * 1.5 : 0;
  const roasIdeal = roasBep > 0 ? roasBep * 2.0 : 0;

  const renderSimCard = (title: string, roas: number, color: string) => {
    const estOmset = biayaIklan * roas;
    const estQty = H > 0 ? Math.floor(estOmset / H) : 0;
    const estMargin = estQty * M;
    const effectiveBiayaIklan = biayaIklan * ppnFactor;
    const estProfit = estMargin - effectiveBiayaIklan;"""

text = text.replace(old_roas_math, new_roas_math)

# 4. Update calcReversePrice
old_reverse = """  const calcReversePrice = (hpp: number, feePct: number, feeNominal: number, tRoas: number) => {
    const denomBep = (1 - (feePct/100)) - (1.0 / tRoas);
    const hargaBep = denomBep > 0 ? (hpp + feeNominal) / denomBep : 0;
    const denomMin = (1 - (feePct/100)) - (1.5 / tRoas);
    const hargaMin = denomMin > 0 ? (hpp + feeNominal) / denomMin : 0;
    const denomIdeal = (1 - (feePct/100)) - (2.0 / tRoas);
    const hargaIdeal = denomIdeal > 0 ? (hpp + feeNominal) / denomIdeal : 0;
    
    const marginIdeal = hargaIdeal - (hpp + (hargaIdeal * feePct / 100) + feeNominal);
    return { hargaBep, hargaMin, hargaIdeal, marginIdeal };
  };"""

new_reverse = """  const calcReversePrice = (hpp: number, feePct: number, feeNominal: number, tRoas: number) => {
    const dNom = usePromoEvent ? promoDiskonNominal : 0;
    const dPct = usePromoEvent ? (promoDiskonPersen / 100) : 0;
    const ePct = usePromoEvent ? (promoExtraFeePersen / 100) : 0;
    const pFact = usePpnIklan ? 1.11 : 1.0;

    const baseDenom = (1 - (feePct/100) - dPct - ePct);
    const denomBep = baseDenom - (pFact * 1.0 / tRoas);
    const hargaBep = denomBep > 0 ? (hpp + feeNominal + dNom) / denomBep : 0;
    const denomMin = baseDenom - (pFact * 1.5 / tRoas);
    const hargaMin = denomMin > 0 ? (hpp + feeNominal + dNom) / denomMin : 0;
    const denomIdeal = baseDenom - (pFact * 2.0 / tRoas);
    const hargaIdeal = denomIdeal > 0 ? (hpp + feeNominal + dNom) / denomIdeal : 0;
    
    const currentH = hargaIdeal;
    const extraDiscount = dNom + (currentH * dPct);
    const extraFee = currentH * ePct;
    const effectiveH = currentH - extraDiscount;
    const marginIdeal = effectiveH - hpp - (currentH * (feePct / 100)) - feeNominal - extraFee;

    return { hargaBep, hargaMin, hargaIdeal, marginIdeal };
  };"""

text = text.replace(old_reverse, new_reverse)

# 5. Inject UI options
ui_block = """      </div>
      
      {/* PENYESUAIAN BIAYA & EVENT (OPSIONAL) */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4">
        <h3 className="font-black text-gray-900 text-sm uppercase tracking-wide flex items-center gap-2">
          <Sliders className="w-4 h-4 text-brand-600" />
          Penyesuaian Biaya & Event (Opsional)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* PPN IKLAN */}
          <div className="flex flex-col gap-3 p-4 rounded-2xl border border-gray-100 bg-gray-50/50">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="space-y-0.5">
                <span className="font-bold text-sm text-gray-900">Sertakan PPN Top Up Iklan (11%)</span>
                <p className="text-xs text-gray-500">Biaya iklan ditambah 11% pajak top up.</p>
              </div>
              <div className="relative inline-flex items-center">
                <input type="checkbox" className="sr-only peer" checked={usePpnIklan} onChange={(e) => setUsePpnIklan(e.target.checked)} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
              </div>
            </label>
          </div>

          {/* PROMO TANGGAL CANTIK */}
          <div className="flex flex-col gap-3 p-4 rounded-2xl border border-gray-100 bg-gray-50/50">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="space-y-0.5">
                <span className="font-bold text-sm text-gray-900">Promo / Campaign Marketplace</span>
                <p className="text-xs text-gray-500">Sesuaikan potongan extra fee & diskon event.</p>
              </div>
              <div className="relative inline-flex items-center">
                <input type="checkbox" className="sr-only peer" checked={usePromoEvent} onChange={(e) => setUsePromoEvent(e.target.checked)} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </div>
            </label>

            {usePromoEvent && (
              <div className="pt-3 border-t border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-3 animate-in slide-in-from-top-2">
                <div>
                  <Label className="text-xs font-bold text-gray-600 mb-1.5 block">Diskon Event</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-400 text-sm font-bold">Rp</span>
                    <Input type="number" min="0" value={promoDiskonNominal} onChange={(e) => setPromoDiskonNominal(Number(e.target.value))} className="pl-9 bg-white" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-bold text-gray-600 mb-1.5 block">Diskon %</Label>
                  <div className="relative">
                    <Input type="number" min="0" max="100" value={promoDiskonPersen} onChange={(e) => setPromoDiskonPersen(Number(e.target.value))} className="pr-8 bg-white" />
                    <span className="absolute right-3 top-2.5 text-gray-400 text-sm font-bold">%</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-bold text-gray-600 mb-1.5 block">Extra Fee</Label>
                  <div className="relative">
                    <Input type="number" min="0" max="100" value={promoExtraFeePersen} onChange={(e) => setPromoExtraFeePersen(Number(e.target.value))} className="pr-8 bg-white" />
                    <span className="absolute right-3 top-2.5 text-gray-400 text-sm font-bold">%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>"""

text = text.replace("      </div>\n      {calcMode === 'find_roas' ? (", ui_block + "\n      {calcMode === 'find_roas' ? (")

# 6. Add Badges to Cards
old_h1_roas = """              <div className="space-y-2">
                <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-indigo-600" />
                  Skenario Target ROAS (Cari ROAS)
                </h3>
                <p className="text-sm text-gray-500 font-medium">Berapa target omset dan ROAS yang harus dicapai berdasarkan budget iklan?</p>
              </div>"""

new_h1_roas = """              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-indigo-600" />
                    Skenario Target ROAS
                  </h3>
                  {usePpnIklan && <span className="bg-brand-50 text-brand-700 text-[10px] font-black px-2 py-0.5 rounded-md border border-brand-200">PPN IKLAN 11%</span>}
                  {usePromoEvent && <span className="bg-amber-50 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-md border border-amber-200">PROMO AKTIF</span>}
                </div>
                <p className="text-sm text-gray-500 font-medium">Berapa target omset dan ROAS yang harus dicapai berdasarkan budget iklan?</p>
              </div>"""

text = text.replace(old_h1_roas, new_h1_roas)

old_h1_price = """              <div className="space-y-2">
                <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  Skenario Rekomendasi Harga (Cari Harga)
                </h3>
                <p className="text-sm text-gray-500 font-medium">Berapa harga yang harus dipasang untuk mencapai target ROAS tertentu?</p>
              </div>"""

new_h1_price = """              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                    Skenario Rekomendasi Harga
                  </h3>
                  {usePpnIklan && <span className="bg-brand-50 text-brand-700 text-[10px] font-black px-2 py-0.5 rounded-md border border-brand-200">PPN IKLAN 11%</span>}
                  {usePromoEvent && <span className="bg-amber-50 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-md border border-amber-200">PROMO AKTIF</span>}
                </div>
                <p className="text-sm text-gray-500 font-medium">Berapa harga yang harus dipasang untuk mencapai target ROAS tertentu?</p>
              </div>"""

text = text.replace(old_h1_price, new_h1_price)

with open('src/components/ROASCalculator.tsx', 'w') as f:
    f.write(text)

