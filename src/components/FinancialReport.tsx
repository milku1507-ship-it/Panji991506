import React from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Download, TrendingUp, TrendingDown, PieChart as PieIcon, BarChart as BarIcon, Calendar, FileText, Package, Loader2, Inbox } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Transaction, Product, Variant, HppMaterial } from '../types';
import { CATEGORIES_LIST } from '../constants/data';
import { cn } from '@/lib/utils';
import { formatCompactNumber, formatCurrency, getTxNominal } from '../lib/formatUtils';
import {
  RangePreset,
  filterByDateRange,
  computeStats,
} from '../lib/transactionStats';
import { useDateFilter } from '../lib/dateFilterContext';

interface FinancialReportProps {
  transactions: Transaction[];
  products: Product[];
}

export default function FinancialReport({ transactions, products }: FinancialReportProps) {
  const { preset, startDate, endDate, applyPreset, setStartDate, setEndDate, rangeLabel } = useDateFilter();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);

  const periodLabel = rangeLabel;

  const isIncome = (t: any) => (t.jenis || t.type)?.toLowerCase() === 'pemasukan';
  const isExpense = (t: any) => (t.jenis || t.type)?.toLowerCase() === 'pengeluaran';

  // Single source of truth: pakai filter & rumus dari transactionStats.ts
  const filteredTransactions = React.useMemo(
    () => filterByDateRange(transactions, startDate, endDate),
    [transactions, startDate, endDate]
  );

  const stats = React.useMemo(
    () => computeStats(filteredTransactions, { start: startDate, end: endDate }, 'Laporan'),
    [filteredTransactions, startDate, endDate]
  );

  const handlePreset = (p: RangePreset) => {
    applyPreset(p);
    if (p !== 'Custom') setPickerOpen(false);
  };

  const onStartChange = (v: string) => setStartDate(v);
  const onEndChange = (v: string) => setEndDate(v);

  const totalIncome = stats.totalPemasukan;
  const totalExpense = stats.totalPengeluaran;
  const netProfit = stats.saldo;
  const margin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

  // Category breakdown for Pie Chart
  const categoryData = filteredTransactions.reduce((acc: any[], t) => {
    const amount = getTxNominal(t);
    if (amount <= 0) return acc;

    if (isIncome(t)) {
      const existing = acc.find(item => item.name === t.kategori);
      if (existing) existing.value += amount;
      else acc.push({ name: t.kategori, value: amount, jenis: 'Pemasukan' });
    }
    if (isExpense(t)) {
      const existing = acc.find(item => item.name === t.kategori);
      if (existing) existing.value += amount;
      else acc.push({ name: t.kategori, value: amount, jenis: 'Pengeluaran' });
    }
    return acc;
  }, []);

  const expenseCategories = categoryData.filter(c => c.jenis === 'Pengeluaran');

  // Grouped expenses for the table
  const expenseTableData = filteredTransactions
    .filter(isExpense)
    .reduce((acc: { name: string; total: number; count: number }[], t) => {
      const amount = getTxNominal(t);
      if (amount <= 0) return acc;
      const catName = t.kategori;
      const existing = acc.find(item => item.name === catName);
      if (existing) { existing.total += amount; existing.count += 1; }
      else acc.push({ name: catName, total: amount, count: 1 });
      return acc;
    }, [])
    .sort((a, b) => b.total - a.total);

  const COLORS = ['#E53935', '#4ADE80', '#60A5FA', '#F472B6', '#A78BFA', '#FBBF24', '#94A3B8'];

  const calculateHppPcs = (bahan: HppMaterial[], qtyBatch: number, packingCost: number = 0) => {
    // bahan.qty is total per BATCH
    const totalMaterials = bahan.reduce((acc, b) => acc + (Number(b.qty || 0) * (b.harga || 0)), 0);
    const qBatch = Math.max(1, Number(qtyBatch) || 1);
    return (totalMaterials + (Number(packingCost) || 0)) / qBatch;
  };

  // NEW: Grouped performance from transactions (NET)
  const productPerformance = React.useMemo(() => {
    const stats: Record<string, {
      productName: string;
      totalQty: number;
      totalGross: number;
      totalNet: number;
      totalHPP: number;
      variants: Record<string, {
        variantName: string;
        totalQty: number;
        totalGross: number;
        totalNet: number;
        totalHPP: number;
      }>
    }> = {};

    filteredTransactions
      .filter(t => (t.jenis || t.type)?.toLowerCase() === 'pemasukan' && t.kategori === 'Penjualan' && t.penjualan_detail)
      .forEach(t => {
        // 1. Calculate transaction gross value to apportion fees fairly
        let txGrossTotal = 0;
        t.penjualan_detail?.forEach(pd => {
          pd.varian.forEach(v => {
            let itemPrice = (v as any).harga; // Cast to any because of transition period
            if (itemPrice === undefined) {
              const product = products.find(p => p.id === pd.produk_id);
              const variant = product?.varian.find(varnt => varnt.id === v.varian_id);
              itemPrice = variant?.harga_jual || 0;
            }
            txGrossTotal += (Number(v.qty) * Number(itemPrice));
          });
        });

        // 2. Aggregate stats
        t.penjualan_detail?.forEach(pd => {
          if (!stats[pd.produk_id]) {
            stats[pd.produk_id] = { 
              productName: pd.produk_nama || 'Unknown', 
              totalQty: 0, totalGross: 0, totalNet: 0, totalHPP: 0,
              variants: {} 
            };
          }

          pd.varian.forEach(v => {
            if (!stats[pd.produk_id].variants[v.varian_id]) {
              stats[pd.produk_id].variants[v.varian_id] = {
                variantName: v.varian_nama || 'Unknown',
                totalQty: 0, totalGross: 0, totalNet: 0, totalHPP: 0
              };
            }

            // Fallbacks for legacy/current transaction data
            let itemPrice = (v as any).harga;
            let itemHpp = (v as any).hpp;
            
            if (itemPrice === undefined || itemHpp === undefined) {
              const product = products.find(p => p.id === pd.produk_id);
              const variant = product?.varian.find(varnt => varnt.id === v.varian_id);
              if (itemPrice === undefined) itemPrice = variant?.harga_jual || 0;
              if (itemHpp === undefined && variant) {
                itemHpp = calculateHppPcs(variant.bahan, variant.qty_batch, variant.harga_packing);
              }
            }

            const itemGross = Number(v.qty) * (Number(itemPrice) || 0);
            const feeShare = txGrossTotal > 0 ? (itemGross / txGrossTotal) * (t.total_biaya || 0) : 0;
            const itemNet = itemGross - feeShare;
            const itemTotalHPP = Number(v.qty) * (Number(itemHpp) || 0);

            // Update Variant Stats
            const vStats = stats[pd.produk_id].variants[v.varian_id];
            vStats.totalQty += v.qty;
            vStats.totalGross += itemGross;
            vStats.totalNet += itemNet;
            vStats.totalHPP += itemTotalHPP;

            // Update Product Stats
            const pStats = stats[pd.produk_id];
            pStats.totalQty += v.qty;
            pStats.totalGross += itemGross;
            pStats.totalNet += itemNet;
            pStats.totalHPP += itemTotalHPP;
          });
        });
      });

    return Object.values(stats);
  }, [filteredTransactions, products]);

  const exportXLS = async () => {
    if (filteredTransactions.length === 0) {
      toast.error('Tidak ada data untuk di-export');
      return;
    }
    setIsExporting(true);
    try {
      await new Promise(r => setTimeout(r, 50));
      const rows = filteredTransactions.map(t => {
        const jenis = (t.jenis || (t as any).type || '').toLowerCase();
        const tipe = jenis === 'pemasukan' ? 'Income' : jenis === 'pengeluaran' ? 'Expense' : (t.jenis || '');
        const total = getTxNominal(t);
        return {
          'Tanggal': t.tanggal || '',
          'Nama Produk / Transaksi': t.keterangan || '',
          'Kategori': t.kategori || '',
          'Jumlah': total,
          'Tipe': tipe,
          'Total': total,
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);

      // Bold header row
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c: C });
        if (ws[addr]) {
          ws[addr].s = { font: { bold: true } };
        }
      }
      ws['!cols'] = [
        { wch: 14 }, { wch: 32 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Laporan');

      const safeLabel = (preset === 'Custom' ? `${startDate}_${endDate}` : preset).replace(/\s+/g, '_');
      XLSX.writeFile(wb, `Laporan_Keuangan_${safeLabel}.xlsx`);
      toast.success('Berhasil export laporan');
    } catch (err) {
      console.error(err);
      toast.error('Gagal export laporan');
    } finally {
      setIsExporting(false);
    }
  };

  // DEPRECATED Helpers
  // const calculateHppPcs = ...
  // const getQtyTerjual = ...

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-[#1A1A2E]">Laporan Keuangan</h2>
          <p className="text-gray-500 font-medium">Analisis mendalam performa bisnis.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  className="rounded-2xl border-none shadow-sm bg-white font-bold gap-2 text-gray-700 hover:text-primary"
                >
                  <Calendar className="w-4 h-4 text-primary" />
                  {periodLabel}
                </Button>
              }
            />
            <PopoverContent align="end" className="w-[320px] p-4">
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Pilihan Cepat</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Hari Ini', 'Minggu Ini', 'Bulan Ini'] as RangePreset[]).map(p => (
                      <button
                        key={p}
                        onClick={() => handlePreset(p)}
                        className={cn(
                          'px-3 py-2 rounded-xl text-xs font-bold transition-colors',
                          preset === p
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Custom</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-gray-500">Mulai</label>
                      <Input
                        type="date"
                        value={startDate}
                        max={endDate || undefined}
                        onChange={(e) => onStartChange(e.target.value)}
                        className="rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500">Akhir</label>
                      <Input
                        type="date"
                        value={endDate}
                        min={startDate || undefined}
                        onChange={(e) => onEndChange(e.target.value)}
                        className="rounded-xl"
                      />
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => setPickerOpen(false)}
                  className="w-full rounded-xl font-bold"
                >
                  Terapkan
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            onClick={exportXLS}
            disabled={isExporting}
            variant="outline"
            className="rounded-2xl border-none shadow-sm bg-white font-bold gap-2 text-gray-600 hover:text-primary"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {isExporting ? 'Mengexport...' : 'Export XLS'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-sm rounded-3xl bg-white p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-2xl bg-green-100 text-green-600">
              <TrendingUp className="w-6 h-6" />
            </div>
            <Badge className="bg-green-50 text-green-700 border-none font-black">Income</Badge>
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Pemasukan</p>
          <h3 className="text-2xl font-black text-[#1A1A2E] mt-1">{formatCurrency(totalIncome, true)}</h3>
        </Card>

        <Card className="border-none shadow-sm rounded-3xl bg-white p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-2xl bg-red-100 text-red-500">
              <TrendingDown className="w-6 h-6" />
            </div>
            <Badge className="bg-red-50 text-red-600 border-none font-black">Expense</Badge>
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Pengeluaran</p>
          <h3 className="text-2xl font-black text-[#1A1A2E] mt-1">{formatCurrency(totalExpense, true)}</h3>
        </Card>

        <Card className={cn(
          "border-none shadow-xl rounded-[2rem] p-6 text-white",
          netProfit >= 0 ? "wallet-gradient shadow-blue-100" : "bg-red-500 shadow-red-100"
        )}>
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-2xl bg-white/20 text-white">
              <FileText className="w-6 h-6" />
            </div>
            <Badge className="bg-white/20 text-white border-none font-black">Profit</Badge>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Laba Bersih ({periodLabel})</p>
          <h3 className="text-2xl font-black mt-1">{formatCurrency(netProfit, true)}</h3>
          <p className="text-[10px] font-bold mt-2">Margin Keuntungan: {margin.toFixed(1)}%</p>
        </Card>
      </div>

      {filteredTransactions.length === 0 ? (
        <Card className="border-none shadow-sm rounded-3xl bg-white">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-3xl bg-gray-100 text-gray-400 mb-4">
              <Inbox className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-black text-[#1A1A2E] mb-1">Tidak ada data</h3>
            <p className="text-sm font-medium text-gray-500">
              Tidak ada transaksi pada periode {periodLabel.toLowerCase()}.
            </p>
          </CardContent>
        </Card>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expense Breakdown */}
        <div className="space-y-6">
          <Card className="border-none shadow-sm rounded-3xl bg-white">
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <PieIcon className="w-5 h-5 text-primary" />
                Alokasi Pengeluaran
              </CardTitle>
              <CardDescription>Distribusi biaya operasional</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseCategories}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {expenseCategories.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm rounded-3xl bg-white">
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-red-500" />
                Detail Pengeluaran
              </CardTitle>
              <CardDescription>Rekap biaya per kategori</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="grid grid-cols-3 px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <div>Kategori</div>
                  <div className="text-center">Transaksi</div>
                  <div className="text-right">Total</div>
                </div>
                {expenseTableData.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-3 items-center p-4 bg-gray-50 rounded-2xl">
                    <div className="font-bold text-[#1A1A2E] text-sm">{item.name}</div>
                    <div className="text-center text-xs font-bold text-gray-500">{item.count}x</div>
                    <div className="text-right font-black text-red-500 text-sm">{formatCurrency(item.total, true)}</div>
                  </div>
                ))}
                {expenseTableData.length === 0 && (
                  <p className="text-center py-8 text-gray-400 font-bold">Belum ada pengeluaran</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Product Performance Section */}
        <Card className="border-none shadow-sm rounded-3xl bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <BarIcon className="w-5 h-5 text-blue-500" />
              Performa Produk
            </CardTitle>
            <CardDescription>Profitabilitas berdasarkan transaksi (NET)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {productPerformance.length === 0 && (
              <p className="text-center py-8 text-gray-400 font-bold">Belum ada data penjualan</p>
            )}
            
            {productPerformance.map((p, pIdx) => {
              const pProfit = p.totalNet - p.totalHPP;
              const pMargin = p.totalNet > 0 ? (pProfit / p.totalNet) * 100 : 0;

              return (
                <div key={`${pIdx}`} className="space-y-3">
                  <div className="bg-brand-50/50 rounded-3xl p-4 border border-brand-100/50">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-xs font-black text-[#1A1A2E] flex items-center gap-2">
                        <Package className="w-4 h-4 text-primary" />
                        {p.productName.toUpperCase()}
                      </p>
                      <Badge className={cn(
                        "border-none font-black text-[10px]",
                        pMargin >= 0 ? "bg-primary text-white" : "bg-red-500 text-white"
                      )}>
                        {pMargin.toFixed(1)}% Total Margin
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px] font-bold">
                      <div>
                        <span className="text-gray-400 block mb-1">TOTAL TERJUAL</span>
                        <span className="text-primary text-sm font-black">{p.totalQty} pcs</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block mb-1">NET PENDAPATAN</span>
                        <span className="text-[#1A1A2E] text-sm font-black">{formatCurrency(p.totalNet, true)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block mb-1">TOTAL HPP</span>
                        <span className="text-gray-600 text-sm font-black">{formatCurrency(p.totalHPP, true)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-gray-400 block mb-1">TOTAL LABA</span>
                        <span className={cn("text-sm font-black", pProfit >= 0 ? "text-green-600" : "text-red-500")}>
                          {formatCurrency(pProfit, true)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2 pl-4 border-l-2 border-brand-100 ml-2">
                    {(Object.values(p.variants) as any[]).map((v, vIdx) => {
                      const vProfit = v.totalNet - v.totalHPP;
                      const vMargin = v.totalNet > 0 ? (vProfit / v.totalNet) * 100 : 0;
                      
                      return (
                        <div key={`${vIdx}`} className="p-4 bg-gray-50 rounded-2xl group hover:bg-brand-50 transition-colors">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-[#1A1A2E]">{v.variantName}</span>
                            <Badge className={cn(
                              "border-none font-black text-[10px]",
                              vMargin >= 0 ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                            )}>
                              {vMargin.toFixed(1)}% Margin
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-[10px] font-bold text-gray-400">
                            <div>
                              NET Pendapatan:
                              <p className="text-[#1A1A2E] text-xs font-black">{formatCurrency(v.totalNet, true)}</p>
                            </div>
                            <div>
                              Total HPP:
                              <p className="text-gray-600 text-xs font-black">{formatCurrency(v.totalHPP, true)}</p>
                            </div>
                            <div>
                              Laba:
                              <p className={cn("text-xs font-black", vProfit >= 0 ? "text-green-600" : "text-red-500")}>
                                {formatCurrency(vProfit, true)}
                              </p>
                            </div>
                            <div>
                              Terjual:
                              <p className="text-primary text-xs font-black">{v.totalQty} pcs</p>
                            </div>
                            <div className="hidden lg:block text-right">
                              Est Harga Net:
                              <p className="text-gray-500 text-xs font-black">{formatCurrency(Math.round(v.totalNet / v.totalQty), false)}/pcs</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
}
