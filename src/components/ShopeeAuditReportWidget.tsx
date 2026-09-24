import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ShoppingBag,
  Truck,
  RotateCcw,
  Copy,
  AlertTriangle,
  CheckCircle2,
  Package,
  TrendingUp,
  Download,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { ShopeeAuditResult } from '../lib/shopeeAuditEngine';
import { db, collection, onSnapshot, User } from '../lib/firebase';
import * as XLSX from 'xlsx';

interface ShopeeAuditReportWidgetProps {
  user?: User | null;
}

export const ShopeeAuditReportWidget: React.FC<ShopeeAuditReportWidgetProps> = ({ user }) => {
  const [audits, setAudits] = useState<ShopeeAuditResult[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'variants' | 'discrepancies' | 'rts'>('discrepancies');

  useEffect(() => {
    // 1. Try local storage cache first
    try {
      const cached = localStorage.getItem('ceumilan_shopee_audits');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAudits(parsed);
          setSelectedAuditId(parsed[0].id);
        }
      }
    } catch (_) {}

    // 2. Listen to Firestore
    if (!user) return;
    const unsub = onSnapshot(collection(db, `users/${user.uid}/shopee_audits`), (snapshot) => {
      const items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ShopeeAuditResult));
      // Sort by creation date desc
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (items.length > 0) {
        setAudits(items);
        setSelectedAuditId(prev => (prev && items.some(i => i.id === prev) ? prev : items[0].id));
        try {
          localStorage.setItem('ceumilan_shopee_audits', JSON.stringify(items));
        } catch (_) {}
      }
    }, (err) => {
      console.warn('Shopee audits sync notice:', err);
    });

    return () => unsub();
  }, [user]);

  const selectedAudit = audits.find(a => a.id === selectedAuditId) || audits[0];

  const formatCurrency = (val: number, isRp: boolean = true) => {
    const formatted = new Intl.NumberFormat('id-ID', {
      maximumFractionDigits: 0,
    }).format(Math.round(val || 0));
    return isRp ? `Rp ${formatted}` : formatted;
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} berhasil disalin ke clipboard!`);
  };

  if (!selectedAudit) {
    return (
      <Card className="border-none shadow-sm rounded-3xl bg-white overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50/50 p-6 border-b border-orange-100/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-600">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-black text-[#1A1A2E]">
                Audit Kerugian & Klaim Shopee (Loss Audit Engine)
              </CardTitle>
              <CardDescription className="text-xs text-gray-500">
                Lacak selisih ongkir ekspedisi dan paket RTS/Retur hilang secara otomatis.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8 text-center text-gray-400 font-bold text-xs space-y-2">
          <p>Belum ada rekaman audit Shopee yang dijalankan.</p>
          <p className="text-[11px] text-gray-400 font-normal">
            Buka menu <strong>Input Transaksi</strong> lalu tekan tombol <strong>Import Excel (XLS)</strong> untuk memulai audit berkas Shopee.
          </p>
        </CardContent>
      </Card>
    );
  }

  const stuckPackages = (selectedAudit.rtsPackages || []).filter(p => p.isStuck);

  return (
    <Card className="border-none shadow-sm rounded-3xl bg-white overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 p-6 text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-black text-white">
                  Audit Finansial & Kerugian Shopee (Loss Audit Engine)
                </CardTitle>
                <Badge className="bg-white/25 text-white font-black text-[10px] border-none">
                  Aktif
                </Badge>
              </div>
              <CardDescription className="text-xs text-orange-100 font-medium">
                Periode: <strong>{selectedAudit.periode}</strong> • Terakhir diaudit: {new Date(selectedAudit.createdAt).toLocaleDateString('id-ID')}
              </CardDescription>
            </div>
          </div>

          {audits.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-orange-100">Pilih Audit:</span>
              <select
                value={selectedAuditId}
                onChange={(e) => setSelectedAuditId(e.target.value)}
                className="bg-white/20 text-white rounded-xl text-xs font-bold px-3 py-1.5 border border-white/30 backdrop-blur-md focus:outline-none"
              >
                {audits.map(a => (
                  <option key={a.id} value={a.id} className="text-gray-900">
                    {a.periode} ({new Date(a.createdAt).toLocaleDateString('id-ID')})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* KPI Loss Discrepancy & RTS Header Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
              DANA DILEPAS (RIIL)
            </span>
            <span className="text-base font-black text-slate-900">
              {formatCurrency(selectedAudit.totalPendapatanDilepas)}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {selectedAudit.orderCount} pesanan selesai
            </span>
          </div>

          <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block mb-1">
              LABA BERSIH RIIL
            </span>
            <span className="text-base font-black text-emerald-700">
              {formatCurrency(selectedAudit.labaBersihKonsolidasi)}
            </span>
            <span className="text-[10px] text-emerald-600 block mt-0.5 font-bold">
              Margin: {selectedAudit.marginKonsolidasi.toFixed(1)}%
            </span>
          </div>

          <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 block mb-1">
              SELISIH ONGKIR (LOSS)
            </span>
            <span className="text-base font-black text-rose-700">
              {formatCurrency(selectedAudit.totalDiscrepancyLoss)}
            </span>
            <span className="text-[10px] text-rose-600 block mt-0.5 font-bold">
              {selectedAudit.discrepancies.length} pesanan merugikan
            </span>
          </div>

          <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 block mb-1">
              POTENSI HILANG RTS
            </span>
            <span className="text-base font-black text-purple-700">
              {formatCurrency(selectedAudit.totalRtsLoss)}
            </span>
            <span className="text-[10px] text-purple-600 block mt-0.5 font-bold">
              {stuckPackages.length} paket tertahan &gt; 7 hari
            </span>
          </div>
        </div>

        {/* Tabs for details */}
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-4">
          <TabsList className="bg-gray-100 p-1 rounded-2xl grid grid-cols-3">
            <TabsTrigger value="discrepancies" className="rounded-xl font-bold text-xs">
              <Truck className="w-3.5 h-3.5 mr-1.5" />
              Selisih Ongkir ({selectedAudit.discrepancies.length})
            </TabsTrigger>
            <TabsTrigger value="rts" className="rounded-xl font-bold text-xs">
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Paket RTS / Retur ({selectedAudit.rtsPackages.length})
            </TabsTrigger>
            <TabsTrigger value="variants" className="rounded-xl font-bold text-xs">
              <Package className="w-3.5 h-3.5 mr-1.5" />
              Performa Varian ({selectedAudit.variantBreakdown.length})
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Selisih Ongkir */}
          <TabsContent value="discrepancies" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 font-medium">
                Daftar pesanan dengan selisih tagihan ekspedisi melebihi biaya pembeli. Gunakan tombol untuk mengajukan klaim ke Shopee.
              </p>
              {selectedAudit.discrepancies.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const ids = selectedAudit.discrepancies.map(d => d.orderId).join('\n');
                    copyToClipboard(ids, `${selectedAudit.discrepancies.length} No. Pesanan`);
                  }}
                  className="rounded-xl text-xs font-bold text-orange-600 border-orange-200 h-8 gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy All Order IDs for Claim
                </Button>
              )}
            </div>

            {selectedAudit.discrepancies.length === 0 ? (
              <div className="p-8 text-center bg-emerald-50 rounded-2xl text-emerald-700 text-xs font-bold">
                ✓ Aman! Tidak ada selisih ongkir yang merugikan toko pada audit ini.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-gray-100 max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs font-medium">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-black sticky top-0 border-b border-gray-100">
                    <tr>
                      <th className="p-3">No. Pesanan</th>
                      <th className="p-3">Tanggal</th>
                      <th className="p-3 text-right">Ongkir Pembeli</th>
                      <th className="p-3 text-right">Ditagihkan Kurir</th>
                      <th className="p-3 text-right">Selisih Merugikan</th>
                      <th className="p-3 text-center">Klaim</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedAudit.discrepancies.map((d, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="p-3 font-mono font-bold text-gray-800">{d.orderId}</td>
                        <td className="p-3 text-gray-500">{d.date}</td>
                        <td className="p-3 text-right text-gray-600">{formatCurrency(d.shippingBuyer)}</td>
                        <td className="p-3 text-right text-red-600 font-bold">{formatCurrency(d.shippingCourier)}</td>
                        <td className="p-3 text-right font-black text-rose-600">{formatCurrency(d.discrepancy)}</td>
                        <td className="p-3 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(d.orderId, 'No. Pesanan')}
                            className="h-7 px-2 text-[10px] font-bold text-orange-600 hover:bg-orange-50 rounded-lg gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            Copy Order ID
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Tab 2: RTS / RR Tracking */}
          <TabsContent value="rts" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 font-medium">
                Pelacakan paket Gagal Kirim (RTS) dan Retur. Paket yang tertahan &gt; 7 hari ditandai sebagai peringatan paket berpotensi hilang.
              </p>
              {stuckPackages.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const text = stuckPackages
                      .map(p => `Resi: ${p.trackingNumber} | Order: ${p.orderId} | Status: ${p.status} | Tertahan: ${p.daysStuck} hari`)
                      .join('\n');
                    copyToClipboard(text, `${stuckPackages.length} Paket Hilang`);
                  }}
                  className="rounded-xl text-xs font-bold text-purple-600 border-purple-200 h-8 gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Stuck Packages for Claim
                </Button>
              )}
            </div>

            {selectedAudit.rtsPackages.length === 0 ? (
              <div className="p-8 text-center bg-gray-50 rounded-2xl text-gray-400 text-xs font-bold">
                Tidak ada data RTS/RR tercatat pada audit ini.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-gray-100 max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs font-medium">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-black sticky top-0 border-b border-gray-100">
                    <tr>
                      <th className="p-3">No. Resi & Pesanan</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Lama Tertahan</th>
                      <th className="p-3">Produk & SKU</th>
                      <th className="p-3 text-right">Potensi Rugi HPP</th>
                      <th className="p-3 text-center">Klaim</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedAudit.rtsPackages.map((r, idx) => (
                      <tr key={idx} className={r.isStuck ? 'bg-red-50/40 hover:bg-red-50/60' : 'hover:bg-gray-50/50'}>
                        <td className="p-3">
                          <span className="font-mono font-bold text-gray-900 block">{r.trackingNumber}</span>
                          <span className="text-[10px] text-gray-400 font-mono">Order: {r.orderId}</span>
                        </td>
                        <td className="p-3">
                          <Badge className={r.isStuck ? 'bg-red-500 text-white text-[10px]' : 'bg-gray-100 text-gray-700 text-[10px]'}>
                            {r.status}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <span className={`font-black ${r.isStuck ? 'text-red-600' : 'text-gray-700'}`}>
                            {r.daysStuck} hari
                          </span>
                          {r.isStuck && (
                            <span className="block text-[9px] font-black text-red-500 uppercase">
                              Potensi Hilang
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-gray-900 block truncate max-w-xs">{r.productName || r.sku}</span>
                          <span className="text-[10px] text-gray-500">Qty: {r.qty} pcs</span>
                        </td>
                        <td className="p-3 text-right font-black text-amber-700">
                          {formatCurrency(r.lossValueHpp)}
                        </td>
                        <td className="p-3 text-center space-x-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(r.trackingNumber, 'No. Resi')}
                            className="h-7 px-1.5 text-[10px] font-bold text-purple-600 hover:bg-purple-50 rounded-lg gap-0.5"
                          >
                            <Copy className="w-2.5 h-2.5" />
                            Resi
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(r.orderId, 'No. Pesanan')}
                            className="h-7 px-1.5 text-[10px] font-bold text-orange-600 hover:bg-orange-50 rounded-lg gap-0.5"
                          >
                            <Copy className="w-2.5 h-2.5" />
                            Order
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Tab 3: Performa Varian */}
          <TabsContent value="variants" className="space-y-3">
            <div className="overflow-x-auto rounded-2xl border border-gray-100 max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs font-medium">
                <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-black sticky top-0 border-b border-gray-100">
                  <tr>
                    <th className="p-3">SKU & Varian</th>
                    <th className="p-3 text-right">Terjual</th>
                    <th className="p-3 text-right">Omzet</th>
                    <th className="p-3 text-right">Total HPP</th>
                    <th className="p-3 text-right">Alokasi Admin</th>
                    <th className="p-3 text-right">Laba Bersih</th>
                    <th className="p-3 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedAudit.variantBreakdown.map((vb, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      <td className="p-3">
                        <span className="font-bold text-gray-900 block">{vb.productName} - {vb.variantName}</span>
                        <span className="text-[10px] text-gray-400 font-mono">SKU: {vb.sku || '-'}</span>
                      </td>
                      <td className="p-3 text-right font-black text-gray-800">{vb.qtyTerjual} pcs</td>
                      <td className="p-3 text-right font-bold text-gray-900">{formatCurrency(vb.omzetVarian)}</td>
                      <td className="p-3 text-right font-bold text-amber-700">{formatCurrency(vb.totalHppVarian)}</td>
                      <td className="p-3 text-right font-bold text-red-600">{formatCurrency(vb.alokasiAdminVarian)}</td>
                      <td className={`p-3 text-right font-black ${vb.labaBersihVarian >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {formatCurrency(vb.labaBersihVarian)}
                      </td>
                      <td className="p-3 text-right">
                        <Badge className={`text-[10px] font-black ${vb.marginVarian >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {vb.marginVarian.toFixed(1)}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
export default ShopeeAuditReportWidget;
