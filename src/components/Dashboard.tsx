import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Package,
  Scan,
  Calculator,
  PieChart,
  History,
  AlertTriangle,
  Plus,
  ArrowRight,
  Database,
  Store,
  PiggyBank
} from 'lucide-react';
import { User } from '../lib/firebase';
import { Ingredient, Transaction, StoreSettings, Dompet } from '../types';
import { formatCurrency } from '../lib/formatUtils';
import { useDateFilter } from '../lib/dateFilterContext';
import { filterByDateRange, computeStats } from '../lib/transactionStats';

interface DashboardProps {
  user: User;
  ingredients: Ingredient[];
  transactions: Transaction[];
  storeSettings: StoreSettings;
  setActiveTab: (tab: string) => void;
  onSeedData?: () => void;
  onStartFresh?: () => void;
  dompets?: Dompet[];
}

export default function Dashboard({
  user,
  ingredients,
  transactions,
  storeSettings,
  setActiveTab,
  onSeedData,
  onStartFresh,
  dompets = []
}: DashboardProps) {
  const { startDate, endDate, rangeLabel } = useDateFilter();

  const filteredTransactions = React.useMemo(
    () => filterByDateRange(transactions, startDate, endDate),
    [transactions, startDate, endDate]
  );

  const stats = React.useMemo(
    () => computeStats(filteredTransactions, { start: startDate, end: endDate }, 'Dashboard'),
    [filteredTransactions, startDate, endDate]
  );

  const lowStockIngredients = React.useMemo(
    () => ingredients.filter(i => i.currentStock <= (i.minStock || 0)),
    [ingredients]
  );

  const totalTabungan = React.useMemo(
    () => dompets.reduce((acc, d) => acc + (d.saldo_terkumpul || 0), 0),
    [dompets]
  );

  const recentTransactions = React.useMemo(
    () => transactions.slice(0, 5),
    [transactions]
  );

  const showWelcomeCard = transactions.length === 0 && ingredients.length === 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-amber-600 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/10 skew-x-12 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold text-white mb-2">
              Halo, {user.displayName || 'Pengguna'} 👋
            </span>
            <h2 className="text-2xl sm:text-3xl font-black">{storeSettings.name || 'CeuMilan'} Dashboard</h2>
            <p className="text-xs sm:text-sm text-amber-100 font-medium mt-1">
              Ringkasan performa &amp; keuangan toko untuk periode <strong className="underline">{rangeLabel}</strong>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => setActiveTab('kasir')}
              className="bg-white text-orange-600 hover:bg-orange-50 font-black rounded-2xl shadow-md gap-2"
            >
              <Scan className="w-4 h-4" />
              Kasir POS
            </Button>
            <Button
              onClick={() => setActiveTab('transactions')}
              className="bg-orange-600 hover:bg-orange-700 text-white font-black rounded-2xl border border-white/20 gap-2"
            >
              <Plus className="w-4 h-4" />
              Catat Transaksi
            </Button>
          </div>
        </div>
      </div>

      {/* Welcome & Quick Seed Action for Clean Accounts */}
      {showWelcomeCard && (
        <Card className="border-2 border-dashed border-orange-200 bg-orange-50/50 rounded-3xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mx-auto">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-black text-lg text-[#1A1A2E]">Selamat Datang di {storeSettings.name}!</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
              Akun Anda belum memiliki data produk, transaksi, atau stok. Pilih cara memulai di bawah:
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {onSeedData && (
              <Button
                onClick={onSeedData}
                className="orange-gradient text-white font-bold rounded-2xl shadow-sm text-xs px-6"
              >
                Muat Data Contoh
              </Button>
            )}
            {onStartFresh && (
              <Button
                onClick={onStartFresh}
                variant="outline"
                className="rounded-2xl font-bold text-xs px-6 bg-white border-orange-200 text-orange-700"
              >
                Mulai dari Nol (Input HPP)
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Main Financial KPI Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Pemasukan */}
        <Card className="border-none shadow-sm rounded-3xl bg-white p-5">
          <div className="flex justify-between items-center mb-3">
            <div className="p-3 rounded-2xl bg-green-100 text-green-600">
              <TrendingUp className="w-5 h-5" />
            </div>
            <Badge className="bg-green-50 text-green-700 border-none font-black text-[10px]">Pemasukan</Badge>
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Income</p>
          <h3 className="text-xl font-black text-[#1A1A2E] mt-1">{formatCurrency(stats.totalPemasukan, true)}</h3>
          <p className="text-[10px] text-gray-400 mt-1 font-medium">{stats.countPemasukan} transaksi</p>
        </Card>

        {/* Pengeluaran */}
        <Card className="border-none shadow-sm rounded-3xl bg-white p-5">
          <div className="flex justify-between items-center mb-3">
            <div className="p-3 rounded-2xl bg-red-100 text-red-500">
              <TrendingDown className="w-5 h-5" />
            </div>
            <Badge className="bg-red-50 text-red-600 border-none font-black text-[10px]">Pengeluaran</Badge>
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Expense</p>
          <h3 className="text-xl font-black text-[#1A1A2E] mt-1">{formatCurrency(stats.totalPengeluaran, true)}</h3>
          <p className="text-[10px] text-gray-400 mt-1 font-medium">{stats.countPengeluaran} transaksi</p>
        </Card>

        {/* Saldo Bersih */}
        <Card className="border-none shadow-sm rounded-3xl bg-white p-5">
          <div className="flex justify-between items-center mb-3">
            <div className="p-3 rounded-2xl bg-blue-100 text-blue-600">
              <Wallet className="w-5 h-5" />
            </div>
            <Badge className="bg-blue-50 text-blue-700 border-none font-black text-[10px]">Net Saldo</Badge>
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Saldo Periode</p>
          <h3 className={`text-xl font-black mt-1 ${stats.saldo >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
            {formatCurrency(stats.saldo, true)}
          </h3>
          <p className="text-[10px] text-gray-400 mt-1 font-medium">{rangeLabel}</p>
        </Card>

        {/* Total Tabungan / Dompet */}
        <Card className="border-none shadow-sm rounded-3xl bg-white p-5">
          <div className="flex justify-between items-center mb-3">
            <div className="p-3 rounded-2xl bg-amber-100 text-amber-600">
              <PiggyBank className="w-5 h-5" />
            </div>
            <Badge className="bg-amber-50 text-amber-700 border-none font-black text-[10px]">Dompet</Badge>
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Tabungan</p>
          <h3 className="text-xl font-black text-[#1A1A2E] mt-1">{formatCurrency(totalTabungan, true)}</h3>
          <p className="text-[10px] text-gray-400 mt-1 font-medium">{dompets.length} dompet tersimpan</p>
        </Card>
      </div>

      {/* Quick Menu Shortcuts Grid */}
      <div>
        <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-3">Menu Pintas Utam</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
          {[
            { id: 'kasir', label: 'Kasir POS', icon: Scan, color: 'bg-orange-50 text-orange-600 border-orange-100' },
            { id: 'hpp', label: 'Hitung HPP', icon: Calculator, color: 'bg-blue-50 text-blue-600 border-blue-100' },
            { id: 'stock', label: 'Stok Bahan', icon: Package, color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
            { id: 'transactions', label: 'Transaksi', icon: History, color: 'bg-purple-50 text-purple-600 border-purple-100' },
            { id: 'reports', label: 'Laporan', icon: PieChart, color: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
            { id: 'roas', label: 'Iklan ROAS', icon: TrendingUp, color: 'bg-teal-50 text-teal-600 border-teal-100' },
            { id: 'dompet', label: 'Dompet', icon: PiggyBank, color: 'bg-amber-50 text-amber-600 border-amber-100' },
            { id: 'backup', label: 'Backup', icon: Database, color: 'bg-slate-50 text-slate-700 border-slate-200' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`p-4 rounded-3xl border flex flex-col items-center justify-center gap-2 hover:scale-105 transition-all bg-white shadow-2xs ${item.color}`}
            >
              <item.icon className="w-6 h-6" />
              <span className="text-[11px] font-bold text-gray-800 text-center">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Peringatan Stok Rendah */}
        <Card className="border-none shadow-sm rounded-3xl bg-white p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base text-[#1A1A2E]">Stok Perlu Diisi Ulang</h3>
                <p className="text-[11px] font-medium text-gray-400">{lowStockIngredients.length} item di bawah stok minimum</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab('stock')}
              className="text-xs font-bold text-primary hover:bg-orange-50 rounded-xl"
            >
              Kelola Stok <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>

          {lowStockIngredients.length === 0 ? (
            <div className="p-6 text-center bg-gray-50 rounded-2xl">
              <p className="text-xs font-bold text-gray-500">Semua stok bahan aman &amp; di atas ambang batas! ✨</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lowStockIngredients.slice(0, 5).map(ing => (
                <div key={ing.id} className="flex items-center justify-between p-3 bg-amber-50/60 border border-amber-100 rounded-2xl">
                  <div>
                    <span className="font-bold text-xs text-[#1A1A2E]">{ing.name}</span>
                    <span className="text-[10px] text-gray-500 block">Kategori: {ing.category}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-xs text-amber-700">{ing.currentStock} {ing.unit}</span>
                    <span className="text-[10px] text-gray-400 block">Min: {ing.minStock} {ing.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Transaksi Terbaru */}
        <Card className="border-none shadow-sm rounded-3xl bg-white p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2.5 rounded-2xl bg-purple-100 text-purple-600">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base text-[#1A1A2E]">Transaksi Terakhir</h3>
                <p className="text-[11px] font-medium text-gray-400">Catatan transaksi terbaru toko</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab('transactions')}
              className="text-xs font-bold text-primary hover:bg-orange-50 rounded-xl"
            >
              Lihat Semua <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="p-6 text-center bg-gray-50 rounded-2xl">
              <p className="text-xs font-bold text-gray-500">Belum ada transaksi tercatat.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTransactions.map(tx => {
                const isIncome = (tx.jenis || '').toLowerCase() === 'pemasukan';
                return (
                  <div key={tx.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
                    <div className="space-y-0.5 max-w-[200px] sm:max-w-xs">
                      <p className="font-bold text-xs text-[#1A1A2E] truncate">{tx.keterangan || tx.kategori}</p>
                      <span className="text-[10px] text-gray-400 block">{tx.tanggal} · {tx.kategori}</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-black text-xs ${isIncome ? 'text-green-600' : 'text-red-500'}`}>
                        {isIncome ? '+' : '-'}{formatCurrency(tx.nominal, true)}
                      </span>
                      <Badge className={`block text-[9px] font-bold border-none ${isIncome ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {tx.jenis}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
