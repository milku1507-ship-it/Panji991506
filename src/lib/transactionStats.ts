import { Transaction } from '../types';
import { getTxNominal } from './formatUtils';

export type RangePreset = 'Hari Ini' | 'Minggu Ini' | 'Bulan Ini' | 'Tahun Ini' | 'Semua Waktu' | 'Custom';

export const DEFAULT_PRESET: RangePreset = 'Bulan Ini';

export function getPresetRange(preset: RangePreset): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  const formatDate = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  switch (preset) {
    case 'Hari Ini': {
      const today = formatDate(now);
      return { start: today, end: today };
    }
    case 'Minggu Ini': {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
      const monday = new Date(now.setDate(diff));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { start: formatDate(monday), end: formatDate(sunday) };
    }
    case 'Bulan Ini': {
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      return { start: formatDate(firstDay), end: formatDate(lastDay) };
    }
    case 'Tahun Ini': {
      const firstDay = new Date(year, 0, 1);
      const lastDay = new Date(year, 11, 31);
      return { start: formatDate(firstDay), end: formatDate(lastDay) };
    }
    case 'Semua Waktu':
    default: {
      return { start: '2020-01-01', end: '2099-12-31' };
    }
  }
}

export function formatRangeLabel(start: string, end: string): string {
  if (!start && !end) return 'Semua Waktu';
  if (start === end) return start;
  return `${start} s/d ${end}`;
}

export function isOperational(t: Transaction): boolean {
  return (t as any).kategori_arus_kas !== 'mutasi_ke_dompet';
}

export function filterByDateRange(
  transactions: Transaction[],
  startDate: string,
  endDate: string
): Transaction[] {
  if (!startDate && !endDate) return transactions;
  
  return transactions.filter(t => {
    if (!t.tanggal) return false;
    const txDateStr = String(t.tanggal).slice(0, 10);
    if (startDate && txDateStr < startDate) return false;
    if (endDate && txDateStr > endDate) return false;
    return true;
  });
}

export interface StatsResult {
  totalPemasukan: number;
  totalPengeluaran: number;
  saldo: number;
  countPemasukan: number;
  countPengeluaran: number;
}

export function computeStats(
  transactions: Transaction[],
  range?: { start: string; end: string },
  contextName?: string
): StatsResult {
  let filtered = transactions;
  if (range && (range.start || range.end)) {
    filtered = filterByDateRange(transactions, range.start, range.end);
  }

  // Only operational transactions count towards stats
  const operational = filtered.filter(isOperational);

  let totalPemasukan = 0;
  let totalPengeluaran = 0;
  let countPemasukan = 0;
  let countPengeluaran = 0;

  for (const t of operational) {
    const amount = getTxNominal(t);
    const jenis = (t.jenis || (t as any).type || '').toLowerCase();
    if (jenis === 'pemasukan') {
      totalPemasukan += amount;
      countPemasukan++;
    } else if (jenis === 'pengeluaran') {
      totalPengeluaran += amount;
      countPengeluaran++;
    }
  }

  const saldo = totalPemasukan - totalPengeluaran;

  return {
    totalPemasukan,
    totalPengeluaran,
    saldo,
    countPemasukan,
    countPengeluaran,
  };
}
