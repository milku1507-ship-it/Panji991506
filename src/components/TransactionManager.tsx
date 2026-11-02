import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { History, Plus, Search, Trash2, TrendingUp, TrendingDown, Calendar, FileSpreadsheet, Filter, CheckCircle2, Zap } from 'lucide-react';
import { User, db, doc, setDoc, deleteDoc, writeBatch, sanitizeData } from '../lib/firebase';
import { Transaction, Product, Ingredient, Dompet } from '../types';
import { formatCurrency, getTxNominal } from '../lib/formatUtils';
import { useDateFilter } from '../lib/dateFilterContext';
import { filterByDateRange, RangePreset } from '../lib/transactionStats';
import { ShopeeAuditModal } from './ShopeeAuditModal';
import QuickEntryDialog, { QuickEntryFields } from './QuickEntryDialog';
import { toast } from 'sonner';
import { CATEGORIES_LIST } from '../constants/data';

interface TransactionManagerProps {
  user: User;
  transactions: Transaction[];
  setTransactions: (transactions: Transaction[]) => void;
  products: Product[];
  setProducts: (products: Product[]) => void;
  ingredients: Ingredient[];
  setIngredients: (ingredients: Ingredient[]) => void;
  onSuccess?: () => void;
  dompets?: Dompet[];
  setDompets?: (dompets: Dompet[]) => void;
}

export default function TransactionManager({
  user,
  transactions,
  setTransactions,
  products,
  setProducts,
  ingredients,
  setIngredients,
  onSuccess,
  dompets = [],
  setDompets
}: TransactionManagerProps) {
  const { startDate, endDate, applyPreset, setStartDate, setEndDate, rangeLabel } = useDateFilter();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterJenis, setFilterJenis] = useState<'all' | 'Pemasukan' | 'Pengeluaran'>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isShopeeAuditModalOpen, setIsShopeeAuditModalOpen] = useState(false);
  const [isQuickEntryOpen, setIsQuickEntryOpen] = useState(false);

  // Form State
  const [formTanggal, setFormTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [formJenis, setFormJenis] = useState<'Pemasukan' | 'Pengeluaran'>('Pemasukan');
  const [formKategori, setFormKategori] = useState('Penjualan');
  const [formNominal, setFormNominal] = useState('');
  const [formKeterangan, setFormKeterangan] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSaveBatchFromQuickEntry = async (list: QuickEntryFields[]) => {
    const batch = writeBatch(db);
    const newTxs: Transaction[] = [];

    for (const item of list) {
      const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newTx: Transaction = {
        id: txId,
        tanggal: item.tanggal,
        keterangan: item.keterangan,
        kategori: item.kategori,
        jenis: item.jenis,
        nominal: item.nominal,
        qty_total: item.qty_total || item.qty_beli || 0,
        materialId: item.materialId,
        penjualan_detail: item.penjualan_detail,
        sumber_dana: item.sumber_dana || 'saldo_utama',
      };
      batch.set(doc(db, `users/${user.uid}/transaksi/${txId}`), sanitizeData(newTx));
      newTxs.push(newTx);
    }

    try {
      await batch.commit();
      setTransactions([...newTxs, ...transactions]);
      toast.success(`${newTxs.length} transaksi berhasil disimpan! 🚀`);
      return { saved: newTxs.length, failed: 0 };
    } catch (err) {
      console.error('Save batch quick entry error:', err);
      toast.error('Gagal menyimpan transaksi batch');
      return { saved: 0, failed: list.length };
    }
  };

  const filteredTransactions = useMemo(() => {
    let list = filterByDateRange(transactions, startDate, endDate);
    if (filterJenis !== 'all') {
      list = list.filter(t => (t.jenis || '').toLowerCase() === filterJenis.toLowerCase());
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t =>
        (t.keterangan || '').toLowerCase().includes(q) ||
        (t.kategori || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [transactions, startDate, endDate, filterJenis, searchQuery]);

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const nom = Number(formNominal.replace(/[^0-9]/g, '')) || 0;
    if (nom <= 0) {
      toast.error('Nominal transaksi harus lebih dari 0');
      return;
    }

    setIsSubmitting(true);
    try {
      const txId = `tx_${Date.now()}`;
      const newTx: Transaction = {
        id: txId,
        tanggal: formTanggal,
        keterangan: formKeterangan.trim() || `Transaksi ${formKategori}`,
        kategori: formKategori,
        jenis: formJenis,
        nominal: nom,
        qty_total: 0
      };

      await setDoc(doc(db, `users/${user.uid}/transaksi/${txId}`), sanitizeData(newTx));
      setTransactions([newTx, ...transactions]);
      toast.success('Transaksi berhasil ditambahkan! 📝');
      setIsAddDialogOpen(false);
      setFormNominal('');
      setFormKeterangan('');
      onSuccess?.();
    } catch (err) {
      console.error('Create transaction error:', err);
      toast.error('Gagal menambahkan transaksi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    try {
      await deleteDoc(doc(db, `users/${user.uid}/transaksi/${id}`));
      setTransactions(transactions.filter(t => t.id !== id));
      toast.success('Transaksi berhasil dihapus');
    } catch (err) {
      console.error(err);
      toast.error('Gagal menghapus transaksi');
    }
  };

  const handleCommitAuditTransactions = async (txs: any[]) => {
    const batch = writeBatch(db);
    txs.forEach(t => {
      const ref = doc(db, `users/${user.uid}/transaksi/${t.id}`);
      batch.set(ref, sanitizeData(t));
    });
    await batch.commit();
    setTransactions([...txs, ...transactions]);
    toast.success(`${txs.length} transaksi audit berhasil disetujui & disimpan!`);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-[#1A1A2E]">Riwayat Transaksi</h2>
          <p className="text-gray-500 font-medium">Catatan pemasukan &amp; pengeluaran toko ({rangeLabel})</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setIsQuickEntryOpen(true)}
            variant="outline"
            className="rounded-2xl border-amber-200 text-amber-700 hover:bg-amber-50 font-bold gap-2"
          >
            <Zap className="w-4 h-4 text-amber-500" /> Input Cepat (AI)
          </Button>
          <Button
            onClick={() => setIsShopeeAuditModalOpen(true)}
            variant="outline"
            className="rounded-2xl border-orange-200 text-orange-600 hover:bg-orange-50 font-bold gap-2"
          >
            <FileSpreadsheet className="w-4 h-4 text-orange-500" /> Impor Excel / Audit
          </Button>
          <Button
            onClick={() => setIsAddDialogOpen(true)}
            className="orange-gradient text-white font-bold rounded-2xl shadow-sm gap-2"
          >
            <Plus className="w-4 h-4" /> Tambah Transaksi
          </Button>
        </div>
      </div>

      {/* Filter Controls */}
      <Card className="border-none shadow-sm rounded-3xl bg-white p-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Cari keterangan / kategori..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 rounded-2xl bg-gray-50 border-none text-xs"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1">
            {(['all', 'Pemasukan', 'Pengeluaran'] as const).map(j => (
              <button
                key={j}
                onClick={() => setFilterJenis(j)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                  filterJenis === j ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {j === 'all' ? 'Semua Tipe' : j}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Transactions List Table */}
      <Card className="border-none shadow-sm rounded-3xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {filteredTransactions.length === 0 ? (
            <div className="p-12 text-center text-gray-400 space-y-2">
              <History className="w-10 h-10 mx-auto stroke-1" />
              <p className="font-bold text-sm">Tidak ada transaksi ditemukan</p>
              <p className="text-xs">Coba sesuaikan filter pencarian atau periode tanggal</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredTransactions.map(tx => {
                const isIncome = (tx.jenis || '').toLowerCase() === 'pemasukan';
                const nominal = getTxNominal(tx);

                return (
                  <div key={tx.id} className="p-4 sm:p-5 flex items-center justify-between hover:bg-gray-50/80 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-2xl ${isIncome ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                        {isIncome ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="font-black text-sm text-[#1A1A2E]">{tx.keterangan || tx.kategori}</p>
                        <div className="flex items-center gap-2 text-[11px] text-gray-400 font-medium mt-0.5">
                          <span>{tx.tanggal}</span>
                          <span>•</span>
                          <Badge variant="outline" className="text-[10px] rounded-md font-bold border-gray-200">
                            {tx.kategori}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className={`font-black text-sm ${isIncome ? 'text-green-600' : 'text-red-500'}`}>
                          {isIncome ? '+' : '-'}{formatCurrency(nominal, true)}
                        </p>
                        <span className="text-[10px] text-gray-400 font-bold uppercase">{tx.jenis}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteTransaction(tx.id)}
                        className="rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Add Transaction Modal */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="font-black text-lg">Catat Transaksi Manual</DialogTitle>
            <DialogDescription className="text-xs">Masukkan rincian pemasukan atau pengeluaran toko</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTransaction} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setFormJenis('Pemasukan'); setFormKategori('Penjualan'); }}
                className={`py-2 rounded-xl font-bold text-xs ${formJenis === 'Pemasukan' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                Pemasukan
              </button>
              <button
                type="button"
                onClick={() => { setFormJenis('Pengeluaran'); setFormKategori('Operasional'); }}
                className={`py-2 rounded-xl font-bold text-xs ${formJenis === 'Pengeluaran' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                Pengeluaran
              </button>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-gray-700">Tanggal Transaksi</Label>
              <Input
                type="date"
                value={formTanggal}
                onChange={e => setFormTanggal(e.target.value)}
                className="rounded-xl"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-gray-700">Kategori</Label>
              <select
                value={formKategori}
                onChange={e => setFormKategori(e.target.value)}
                className="w-full rounded-xl border border-gray-200 p-2 text-xs font-bold"
              >
                {CATEGORIES_LIST.filter(c => formJenis === 'Pemasukan' ? c.type === 'Pemasukan' : c.type === 'Pengeluaran').map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-gray-700">Nominal (Rp)</Label>
              <Input
                type="number"
                value={formNominal}
                onChange={e => setFormNominal(e.target.value)}
                placeholder="0"
                className="rounded-xl"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-gray-700">Keterangan / Catatan</Label>
              <Input
                value={formKeterangan}
                onChange={e => setFormKeterangan(e.target.value)}
                placeholder="Misal: Penjualan offline atau beli bahan baku"
                className="rounded-xl"
              />
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full orange-gradient text-white font-bold rounded-xl h-11 text-xs shadow-md"
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan Transaksi'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Shopee Audit / Import Modal */}
      {isShopeeAuditModalOpen && (
        <ShopeeAuditModal
          isOpen={isShopeeAuditModalOpen}
          onClose={() => setIsShopeeAuditModalOpen(false)}
          products={products}
          ingredients={ingredients}
          onCommitAudit={async () => {}}
          onCommitTransactions={handleCommitAuditTransactions}
        />
      )}

      {/* Quick Entry Dialog */}
      {isQuickEntryOpen && (
        <QuickEntryDialog
          open={isQuickEntryOpen}
          onOpenChange={setIsQuickEntryOpen}
          products={products}
          ingredients={ingredients}
          categories={CATEGORIES_LIST as { name: string; type: 'Pemasukan' | 'Pengeluaran' }[]}
          hppCategories={['Bahan baku', 'Bumbu', 'Packing', 'Overhead']}
          dompets={dompets}
          onSaveBatch={handleSaveBatchFromQuickEntry}
          user={user}
          setIngredients={setIngredients}
          setProducts={setProducts}
        />
      )}
    </div>
  );
}
