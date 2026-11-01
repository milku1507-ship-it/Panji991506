import { Product, Ingredient, Dompet } from '../types';

export interface AIParseOptions {
  products?: Product[];
  ingredients?: Ingredient[];
  categories?: { name: string; type: 'Pemasukan' | 'Pengeluaran' }[];
  dompets?: Dompet[];
  user?: any;
}

export async function runAIParse(input: string | any, options?: AIParseOptions): Promise<any> {
  const userMessage = typeof input === 'string' ? input : (input?.userMessage || input?.input || '');
  if (!userMessage || !userMessage.trim()) {
    return { success: false, items: [], error: 'Input kosong' };
  }

  const payloadOptions = typeof input === 'object' ? { ...input, ...options } : options;

  try {
    const res = await fetch('/api/parse-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: userMessage, ...payloadOptions })
    });
    if (res.ok) {
      const data = await res.json();
      if (data) return data;
    }
  } catch (err) {
    console.warn('Backend AI parse proxy unavailable, using fallback:', err);
  }

  // Basic Rule-based fallback parser
  const text = userMessage.trim();
  const isIncome = /jual|terjual|pemasukan|masuk|laku|omset|omzet|income|dapat/i.test(text);
  const jenis = isIncome ? 'Pemasukan' : 'Pengeluaran';
  
  // Extract numbers
  let nominal = 0;
  const numMatch = text.match(/(?:rp\.?\s*)?([\d]+(?:[,.][\d]+)?)\s*(rb|ribu|k|jt|juta|m|miliar)?/i);
  if (numMatch) {
    let num = parseFloat(numMatch[1].replace(',', '.'));
    const suffix = (numMatch[2] || '').toLowerCase();
    if (suffix === 'rb' || suffix === 'ribu' || suffix === 'k') num *= 1000;
    else if (suffix === 'jt' || suffix === 'juta') num *= 1_000_000;
    else if (suffix === 'm' || suffix === 'miliar') num *= 1_000_000_000;
    nominal = Math.round(num);
  }

  return {
    success: true,
    rawText: text,
    items: [
      {
        tanggal: new Date().toISOString().split('T')[0],
        jenis,
        kategori: isIncome ? 'Penjualan' : 'Operasional',
        keterangan: text,
        nominal,
        qty_beli: 1,
        qty_total: 1
      }
    ]
  };
}
