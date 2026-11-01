import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingBag, FileSpreadsheet, ShieldAlert, Sparkles, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { User, db, collection, onSnapshot, query, orderBy, limit } from '../lib/firebase';
import { ShopeeAuditModal } from './ShopeeAuditModal';
import { formatCurrency } from '../lib/formatUtils';
import { toast } from 'sonner';

interface ShopeeAuditReportWidgetProps {
  user?: User | null;
}

export default function ShopeeAuditReportWidget({ user }: ShopeeAuditReportWidgetProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [latestAudit, setLatestAudit] = useState<any | null>(null);

  React.useEffect(() => {
    if (!user) return;
    try {
      const q = query(
        collection(db, `users/${user.uid}/shopee_audits`),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          setLatestAudit(snap.docs[0].data());
        }
      }, (err) => {
        console.warn('Shopee audit fetch warning:', err);
      });
      return () => unsub();
    } catch (e) {
      console.warn('Failed to subscribe shopee audits:', e);
    }
  }, [user]);

  const handleCommitAudit = async (audit: any) => {
    toast.success('Audit berhasil disimpan!');
  };

  return (
    <>
      <Card className="border-none shadow-sm rounded-3xl bg-gradient-to-br from-orange-50/70 via-amber-50/40 to-white overflow-hidden border border-orange-100">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-orange-500 text-white shadow-md shadow-orange-200">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-lg font-black text-[#1A1A2E] flex items-center gap-2">
                  Audit Otomatis Shopee &amp; Deteksi Kerugian
                  <Badge className="bg-orange-500 text-white font-bold text-[10px]">Multi-Slot</Badge>
                </CardTitle>
                <CardDescription className="text-xs font-medium text-gray-500">
                  Rekonsiliasi omzet, biaya admin, selisih ongkir &amp; paket RTS hilang
                </CardDescription>
              </div>
            </div>

            <Button
              onClick={() => setIsModalOpen(true)}
              className="orange-gradient text-white font-bold rounded-2xl shadow-md shadow-orange-200 gap-2 shrink-0"
            >
              <Upload className="w-4 h-4" />
              Upload &amp; Audit Berkas Shopee
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-2">
          {latestAudit ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white p-3.5 rounded-2xl border border-orange-100 shadow-2xs">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Periode</span>
                  <p className="text-sm font-black text-[#1A1A2E] mt-0.5">{latestAudit.periode}</p>
                </div>
                <div className="bg-white p-3.5 rounded-2xl border border-orange-100 shadow-2xs">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Pendapatan Dilepas</span>
                  <p className="text-sm font-black text-green-600 mt-0.5">
                    {formatCurrency(latestAudit.totalPendapatanDilepas || 0, true)}
                  </p>
                </div>
                <div className="bg-white p-3.5 rounded-2xl border border-orange-100 shadow-2xs">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Rugi Selisih Ongkir</span>
                  <p className="text-sm font-black text-red-500 mt-0.5">
                    {formatCurrency(latestAudit.totalDiscrepancyLoss || 0, true)}
                  </p>
                </div>
                <div className="bg-white p-3.5 rounded-2xl border border-orange-100 shadow-2xs">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Laba Konsolidasi</span>
                  <p className="text-sm font-black text-primary mt-0.5">
                    {formatCurrency(latestAudit.labaBersihKonsolidasi || 0, true)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row items-center justify-between p-4 bg-white/80 backdrop-blur-sm rounded-2xl border border-orange-100 gap-4">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-8 h-8 text-orange-500 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-gray-900">Belum ada audit Shopee tersimpan</p>
                  <p className="text-[11px] text-gray-500">
                    Upload file Excel Shopee (Pesanan Selesai, Rincian Penghasilan, &amp; Retur RTS) untuk mengaudit kerugian toko.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(true)}
                className="rounded-xl border-orange-200 text-orange-600 hover:bg-orange-50 font-bold text-xs shrink-0"
              >
                Mulai Audit Sekarang
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isModalOpen && (
        <ShopeeAuditModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          products={[]}
          ingredients={[]}
          onCommitAudit={handleCommitAudit}
        />
      )}
    </>
  );
}
