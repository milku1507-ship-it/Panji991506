import { getTxNominal } from './formatUtils';

/**
 * SINGLE SOURCE OF TRUTH untuk semua perhitungan transaksi.
 *
 * Halaman Transaksi DAN halaman Laporan WAJIB pakai modul ini supaya
 * angka pemasukan, pengeluaran, dan saldo selalu identik 100%.
 *
 * Aturan:
 *  - Filter periode pakai parameter sama: startDate (ISO) + endDate (ISO)
 *  - Default periode: bulan berjalan (Bulan Ini)
 *  - Validasi transaksi: wajib punya tanggal valid + jenis Pemasukan/Pengeluaran + nominal > 0
 *  - Rumus: total_pemasukan = SUM(nominal jenis=Pemasukan dalam range)
 *           total_pengeluaran = SUM(nominal jenis=Pengeluaran dalam range)
 *           saldo = total_pemasukan - total_pengeluaran
 */

export type RangePreset = 'Hari Ini' | 'Minggu Ini' | 'Bulan Ini' | 'Custom';

export const DEFAULT_PRESET: RangePreset = 'Bulan Ini';

const pad2 = (n: number) => String(n).padStart(2, '0');

export const toISO = (d: Date): string => {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/**
 * Parse tanggal transaksi dari berbagai format umum:
 *  - ISO: "2026-04-28"
 *  - DD/MM/YYYY: "28/04/2026"
 *  - Date object string apapun yg dimengerti new Date()
 */
export const parseTxDate = (raw: any): Date | null => {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  const parts = s.split('/');
  if (parts.length === 3) {
    const nd = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
    if (!isNaN(nd.getTime())) return nd;
  }
  return null;
};

/**
 * Hitung rentang tanggal preset.
 * Bulan Ini = tanggal 1 bulan ini sampai hari ini.
 */
export const getPresetRange = (preset: RangePreset): { start: string; end: string } => {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = new Date(todayMidnight);
  if (preset === 'Hari Ini') {
    // start = today
  } else if (preset === 'Minggu Ini') {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1; // Senin sebagai awal minggu
    start = new Date(todayMidnight);
    start.setDate(todayMidnight.getDate() - diff);
  } else if (preset === 'Bulan Ini') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { start: toISO(start), end: toISO(todayMidnight) };
};

export const formatRangeLabel = (start: string, end: string): string => {
  if (!start || !end) return 'Pilih Tanggal';
  const fmt = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  return `${fmt(start)} – ${fmt(end)}`;
};

/**
 * Validasi: transaksi dianggap valid kalau punya tanggal valid,
 * jenis Pemasukan/Pengeluaran, dan nominal > 0.
 * Data corrupt / null otomatis di-skip.
 */
export const isValidTransaction = (t: any): boolean => {
  if (!t) return false;
  const d = parseTxDate(t.tanggal);
  if (!d) return false;
  const jenis = String(t.jenis || t.type || '').toLowerCase();
  if (jenis !== 'pemasukan' && jenis !== 'pengeluaran') return false;
  const nominal = getTxNominal(t);
  if (!Number.isFinite(nominal) || nominal <= 0) return false;
  return true;
};

/**
 * Filter transaksi berdasarkan rentang tanggal [start, end] inklusif.
 * Otomatis skip transaksi tidak valid (data corrupt / null).
 */
export const filterByDateRange = <T extends { tanggal?: any }>(
  transactions: T[],
  startDate: string,
  endDate: string
): T[] => {
  if (!Array.isArray(transactions)) return [];
  if (!startDate || !endDate) return transactions.filter(isValidTransaction);
  const s = new Date(startDate); s.setHours(0, 0, 0, 0);
  const e = new Date(endDate); e.setHours(23, 59, 59, 999);
  return transactions.filter(t => {
    if (!isValidTransaction(t)) return false;
    const d = parseTxDate((t as any).tanggal);
    if (!d) return false;
    const time = d.getTime();
    return time >= s.getTime() && time <= e.getTime();
  });
};

const isIncome = (t: any) => String(t.jenis || t.type || '').toLowerCase() === 'pemasukan';
const isExpense = (t: any) => String(t.jenis || t.type || '').toLowerCase() === 'pengeluaran';

export interface TransactionStats {
  count: number;
  totalPemasukan: number;
  totalPengeluaran: number;
  saldo: number;
  range: { start: string; end: string };
}

/**
 * Hitung statistik dari transaksi yang sudah terfilter.
 * Wajib dipanggil setelah filterByDateRange supaya angka konsisten.
 *
 * @param transactions Daftar transaksi (sebaiknya sudah terfilter range).
 * @param range Rentang tanggal yang dipakai (untuk debug log).
 * @param source Label sumber pemanggil ('Transaksi' / 'Laporan') untuk log.
 */
export const computeStats = (
  transactions: any[],
  range: { start: string; end: string },
  source: string = 'unknown'
): TransactionStats => {
  const valid = transactions.filter(isValidTransaction);
  const totalPemasukan = valid
    .filter(isIncome)
    .reduce((acc, t) => acc + getTxNominal(t), 0);
  const totalPengeluaran = valid
    .filter(isExpense)
    .reduce((acc, t) => acc + getTxNominal(t), 0);
  const saldo = totalPemasukan - totalPengeluaran;

  const stats: TransactionStats = {
    count: valid.length,
    totalPemasukan,
    totalPengeluaran,
    saldo,
    range,
  };

  // Debug log konsisten lintas halaman — gampang dibandingkan di console
  if (typeof window !== 'undefined' && window.console) {
    console.log(`[STATS:${source}]`, {
      filter: `${range.start} → ${range.end}`,
      jumlah: stats.count,
      pemasukan: stats.totalPemasukan,
      pengeluaran: stats.totalPengeluaran,
      saldo: stats.saldo,
    });
  }

  // Daftarkan stats supaya bisa di-cross-check antar halaman.
  registerStats(source, stats);

  return stats;
};

/**
 * Sanity check antar halaman: daftar stats per "source" lalu emit event
 * 'stats:mismatch' kalau total Transaksi !== Laporan dalam satu range
 * yang sama. App.tsx menampilkan warning toast saat event ini muncul.
 */
const _statsRegistry: Record<string, TransactionStats> = {};

const sameRange = (a: TransactionStats['range'], b: TransactionStats['range']) =>
  a.start === b.start && a.end === b.end;

export const areStatsEqual = (a: TransactionStats, b: TransactionStats): boolean => {
  return (
    a.count === b.count &&
    a.totalPemasukan === b.totalPemasukan &&
    a.totalPengeluaran === b.totalPengeluaran &&
    a.saldo === b.saldo
  );
};

const TRACKED_SOURCES = ['Transaksi', 'Laporan'];

const registerStats = (source: string, stats: TransactionStats) => {
  if (!TRACKED_SOURCES.includes(source)) return;
  _statsRegistry[source] = stats;

  // Bandingkan dengan source lain yang sudah tercatat.
  for (const other of TRACKED_SOURCES) {
    if (other === source) continue;
    const otherStats = _statsRegistry[other];
    if (!otherStats) continue;
    if (!sameRange(otherStats.range, stats.range)) continue; // filter beda — wajar, jangan warning
    if (areStatsEqual(otherStats, stats)) continue;

    if (typeof window !== 'undefined') {
      console.warn('[STATS:mismatch]', { [source]: stats, [other]: otherStats });
      window.dispatchEvent(
        new CustomEvent('stats:mismatch', {
          detail: { sources: { [source]: stats, [other]: otherStats } },
        })
      );
    }
  }
};
