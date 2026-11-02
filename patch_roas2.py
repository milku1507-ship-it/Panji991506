import re

with open('src/components/ROASCalculator.tsx', 'r') as f:
    text = f.read()

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
      </div>
"""

text = re.sub(r"      </div>\s*\{calcMode === 'find_roas' \? \(", ui_block + r"\n      {calcMode === 'find_roas' ? (", text)

with open('src/components/ROASCalculator.tsx', 'w') as f:
    f.write(text)

