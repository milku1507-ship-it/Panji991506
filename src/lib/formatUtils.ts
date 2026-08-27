
/**
 * Formats a number into a shorter string representation for large values.
 * Examples: 
 * 1.000.000 -> 1jt
 * 1.500.000 -> 1,5jt
 * 1.000 -> 1rb
 * 500 -> 500
 */
export function formatCompactNumber(value: number): string {
  if (value >= 1000000) {
    const num = value / 1000000;
    const formatted = num.toLocaleString('id-ID', { maximumFractionDigits: 1 });
    return `${formatted}jt`;
  }
  if (value >= 1000) {
    const num = value / 1000;
    const formatted = num.toLocaleString('id-ID', { maximumFractionDigits: 1 });
    return `${formatted}rb`;
  }
  return value.toLocaleString('id-ID');
}

/**
 * Helper: Ambil nilai numerik dari transaksi secara aman.
 * Prioritas: nominal → total_penjualan → 0
 * Handles string dari Excel (misal "573.200" atau "573,200")
 */
export function parseTxAmount(value: any): number {
  if (!value && value !== 0) return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  return Number(
    String(value)
      .replace(/[Rp\s.]/g, '')
      .replace(',', '.')
  ) || 0;
}

/**
 * Dapatkan total nominal dari sebuah transaksi (income atau expense).
 * Prioritas untuk Pemasukan/Penjualan: finalIncome → nominal → total_penjualan
 * Prioritas untuk Pengeluaran: nominal → total_biaya
 */
export function getTxNominal(t: any): number {
  const isIncome = (t.jenis || t.type || '').toLowerCase() === 'pemasukan';
  if (isIncome) {
    // finalIncome = sudah dipotong pajak; nominal (baru) = finalIncome; nominal (lama) = total_penjualan
    const fi = parseTxAmount(t.finalIncome);
    if (fi > 0) return fi;
    return parseTxAmount(t.nominal) || parseTxAmount(t.total_penjualan) || 0;
  }
  return parseTxAmount(t.nominal) || parseTxAmount(t.total_biaya) || 0;
}

/**
 * Filter transaksi berdasarkan periode.
 */
export function filterByPeriod(transactions: any[], period: string): any[] {
  const now = new Date();
  return transactions.filter(t => {
    if (!t.tanggal) return period === 'Semua Waktu';
    const d = new Date(t.tanggal);
    const dateToCompare = isNaN(d.getTime()) ? (() => {
      const parts = String(t.tanggal).split('/');
      if (parts.length === 3) return new Date(`${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`);
      return new Date(NaN);
    })() : d;
    if (isNaN(dateToCompare.getTime())) return period === 'Semua Waktu';
    if (period === 'Bulan Ini') return dateToCompare.getMonth() === now.getMonth() && dateToCompare.getFullYear() === now.getFullYear();
    if (period === 'Tahun Ini') return dateToCompare.getFullYear() === now.getFullYear();
    return true; // Semua Waktu
  });
}

/**
 * Formats a number as IDR currency with compact support for large values.
 */
export function formatCurrency(value: number, compact: boolean = false): string {
  if (compact && value >= 1000) {
    return `Rp ${formatCompactNumber(value)}`;
  }
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Calculations and validations for Harga Coret and Diskon.
 */
export function calculateDiscountFromCoret(hargaJual: number, hargaCoret: number) {
  if (!hargaCoret || hargaCoret <= 0) {
    return { diskonNominal: 0, diskonPersen: 0, isValid: true, error: '' };
  }
  if (hargaCoret <= hargaJual) {
    return { 
      diskonNominal: 0, 
      diskonPersen: 0, 
      isValid: false, 
      error: 'Harga Coret harus lebih tinggi dari Harga Jual.' 
    };
  }
  const diskonNominal = hargaCoret - hargaJual;
  const diskonPersen = Number(((diskonNominal / hargaCoret) * 100).toFixed(2));
  return { diskonNominal, diskonPersen, isValid: true, error: '' };
}

export function calculateCoretFromDiscount(hargaJual: number, diskonPersen: number) {
  if (!diskonPersen || diskonPersen <= 0) {
    return { hargaCoret: 0, diskonNominal: 0, isValid: true, error: '' };
  }
  if (diskonPersen >= 100) {
    return { 
      hargaCoret: 0, 
      diskonNominal: 0, 
      isValid: false, 
      error: 'Persentase diskon harus kurang dari 100%.' 
    };
  }
  const hargaCoret = Math.round(hargaJual / (1 - diskonPersen / 100));
  const diskonNominal = hargaCoret - hargaJual;
  return { hargaCoret, diskonNominal, isValid: true, error: '' };
}
