import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Wallet, Plus, Trash2, ArrowDownLeft, ArrowUpRight, PiggyBank, ChevronDown, ChevronUp, Inbox } from 'lucide-react';
import { Dompet, Transaction } from '../types';
import { User } from 'firebase/auth';
import { db, doc, setDoc, deleteDoc, writeBatch, serverTimestamp, sanitizeData, collection } from '../lib/firebase';
import { toast } from 'sonner';
import { formatCurrency } from '../lib/formatUtils';
import { cn } from '@/lib/utils';

interface DompetManagerProps {
  user: User;
  dompets: Dompet[];
  setDompets: React.Dispatch<React.SetStateAction<Dompet[]>>;
  transactions: Transaction[];
}

export default function DompetManager({ user, dompets, setDompets, transactions }: DompetManagerProps) {
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [dompetToDelete, setDompetToDelete] = React.useState<Dompet | null>(null);
  const [newName, setNewName] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const totalTabungan = dompets.reduce((s, d) => s + (d.saldo_terkumpul || 0), 0);

  const getDompetHistory = (dompetId: string) =>
    transactions
      .filter(t => t.sumber_dana === dompetId)
      .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime())
      .slice(0, 15);

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('Nama dompet tidak boleh kosong');
      return;
    }
    if (dompets.some(d => d.nama.toLowerCase() === newName.trim().toLowerCase())) {
      toast.error('Nama dompet sudah digunakan');
      return;
    }
    setIsSaving(true);
    try {
      const id = `dompet_${Date.now()}`;
      const dompetData: Dompet = {
        id,
        nama: newName.trim(),
        saldo_terkumpul: 0,
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, `users/${user.uid}/dompet/${id}`), sanitizeData(dompetData));
      setDompets(prev => [...prev, { ...dompetData, createdAt: new Date().toISOString() }]);
      setNewName('');
      setIsAddOpen(false);
      toast.success(`Dompet "${dompetData.nama}" berhasil dibuat`);
    } catch (err) {
      console.error('Create dompet error:', err);
      toast.error('Gagal membuat dompet');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!dompetToDelete) return;
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, `users/${user.uid}/dompet/${dompetToDelete.id}`));
      setDompets(prev => prev.filter(d => d.id !== dompetToDelete.id));
      setIsDeleteOpen(false);
      setDompetToDelete(null);
      toast.success(`Dompet "${dompetToDelete.nama}" dihapus`);
    } catch (err) {
      console.error('Delete dompet error:', err);
      toast.error('Gagal menghapus dompet');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-[#1A1A2E]">Dompet Tabungan</h2>
          <p className="text-gray-500 font-medium">Kelola dana tabungan per tujuan</p>
        </div>
        <Button
          onClick={() => setIsAddOpen(true)}
          className="orange-gradient text-white font-bold rounded-2xl gap-2 shadow-lg shadow-brand-200"
        >
          <Plus className="w-4 h-4" />
          Buat Dompet
        </Button>
      </div>

      {/* Total Balance Card */}
      <div className="wallet-gradient rounded-[2rem] p-6 text-white shadow-2xl shadow-brand-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <PiggyBank className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Total Semua Tabungan</p>
            <p className="text-3xl font-black">{formatCurrency(totalTabungan, true)}</p>
          </div>
        </div>
        <p className="text-[11px] font-bold opacity-70">
          {dompets.length} dompet aktif · Dana ini terpisah dari saldo operasional
        </p>
      </div>

      {/* Empty state */}
      {dompets.length === 0 && (
        <Card className="border-none shadow-sm rounded-3xl bg-white">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-3xl bg-gray-100 text-gray-400 mb-4">
              <Wallet className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-black text-[#1A1A2E] mb-1">Belum ada dompet</h3>
            <p className="text-sm font-medium text-gray-500 mb-6 max-w-xs">
              Buat dompet tabungan untuk memisahkan dana per tujuan (modal, darurat, dll.)
            </p>
            <Button
              onClick={() => setIsAddOpen(true)}
              className="orange-gradient text-white font-bold rounded-2xl gap-2"
            >
              <Plus className="w-4 h-4" />
              Buat Dompet Pertama
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Dompet List */}
      <div className="space-y-4">
        {dompets.map(dompet => {
          const history = getDompetHistory(dompet.id);
          const isExpanded = expandedId === dompet.id;
          const masuk = history
            .filter(t => t.kategori_arus_kas === 'mutasi_ke_dompet')
            .reduce((s, t) => s + t.nominal, 0);
          const keluar = history
            .filter(t => t.kategori_arus_kas === 'pengeluaran_dompet')
            .reduce((s, t) => s + t.nominal, 0);

          return (
            <Card key={dompet.id} className="border-none shadow-sm rounded-3xl bg-white overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center text-primary shrink-0">
                      <Wallet className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-[#1A1A2E] text-base truncate">{dompet.nama}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
                        {history.length} transaksi
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-black text-[#1A1A2E]">
                      {formatCurrency(dompet.saldo_terkumpul, true)}
                    </p>
                    <p className="text-[10px] font-bold text-gray-400 mt-0.5">Saldo terkumpul</p>
                  </div>
                </div>

                {/* Mini stats */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="bg-green-50 rounded-2xl p-3">
                    <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1">Total Masuk</p>
                    <p className="text-sm font-black text-green-700">{formatCurrency(masuk, true)}</p>
                  </div>
                  <div className="bg-red-50 rounded-2xl p-3">
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">Total Keluar</p>
                    <p className="text-sm font-black text-red-600">{formatCurrency(keluar, true)}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : dompet.id)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-gray-50 text-gray-600 text-xs font-bold hover:bg-gray-100 transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {isExpanded ? 'Tutup Riwayat' : 'Lihat Riwayat'}
                  </button>
                  <button
                    onClick={() => {
                      setDompetToDelete(dompet);
                      setIsDeleteOpen(true);
                    }}
                    className="w-10 h-10 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* History Dropdown */}
              {isExpanded && (
                <div className="border-t border-gray-50 px-5 pb-5">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pt-4 pb-3">
                    Riwayat Transaksi
                  </p>
                  {history.length === 0 ? (
                    <div className="flex flex-col items-center py-8 text-center">
                      <Inbox className="w-8 h-8 text-gray-300 mb-2" />
                      <p className="text-sm font-bold text-gray-400">Belum ada transaksi</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {history.map(t => {
                        const isMasuk = t.kategori_arus_kas === 'mutasi_ke_dompet';
                        return (
                          <div key={t.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl">
                            <div className={cn(
                              'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
                              isMasuk ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
                            )}>
                              {isMasuk
                                ? <ArrowDownLeft className="w-4 h-4" />
                                : <ArrowUpRight className="w-4 h-4" />
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-[#1A1A2E] truncate">{t.keterangan}</p>
                              <p className="text-[10px] font-bold text-gray-400">{t.tanggal}</p>
                            </div>
                            <p className={cn(
                              'text-sm font-black shrink-0',
                              isMasuk ? 'text-green-600' : 'text-red-500'
                            )}>
                              {isMasuk ? '+' : '-'}{formatCurrency(t.nominal, true)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Add Dompet Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="rounded-3xl border-none shadow-2xl max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="font-black text-[#1A1A2E]">Buat Dompet Baru</DialogTitle>
            <DialogDescription>
              Berikan nama yang jelas agar mudah dikenali saat input transaksi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs font-bold text-gray-400 uppercase">Nama Dompet</Label>
            <Input
              placeholder="Contoh: Dana Darurat, Modal Bulan Depan"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="rounded-xl border-gray-100"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setIsAddOpen(false); setNewName(''); }} className="rounded-2xl font-bold">
              Batal
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isSaving || !newName.trim()}
              className="orange-gradient text-white font-bold rounded-2xl"
            >
              {isSaving ? 'Menyimpan...' : 'Buat Dompet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="rounded-3xl border-none shadow-2xl max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="font-black text-[#1A1A2E]">Hapus Dompet?</DialogTitle>
            <DialogDescription className="space-y-2">
              <span>Kamu akan menghapus dompet <strong>"{dompetToDelete?.nama}"</strong>.</span>
              {dompetToDelete && dompetToDelete.saldo_terkumpul > 0 && (
                <span className="block mt-2 p-3 bg-red-50 rounded-xl text-red-700 text-xs font-bold">
                  ⚠️ Saldo tersisa {formatCurrency(dompetToDelete.saldo_terkumpul, true)} akan hilang. Pastikan sudah dipindahkan sebelum menghapus.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setIsDeleteOpen(false); setDompetToDelete(null); }} className="rounded-2xl font-bold">
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isSaving}
              className="rounded-2xl font-bold"
            >
              {isSaving ? 'Menghapus...' : 'Hapus Dompet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
