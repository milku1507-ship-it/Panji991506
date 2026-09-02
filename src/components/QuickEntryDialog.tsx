import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, RefreshCw, Zap, X, Calendar, Check, Pencil, Package, Wallet, PiggyBank, AlertCircle, RefreshCw as UpdateIcon, Sparkles, PlusCircle, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Product, Ingredient, Dompet } from '../types';
import { formatCurrency } from '../lib/formatUtils';
import { User } from 'firebase/auth';
import { doc, updateDoc, setDoc, db } from '../lib/firebase';
import { toast } from 'sonner';

export type QuickEntryFields = {
  tanggal: string;
  tanggal_akhir: null;
  jenis: 'Pemasukan' | 'Pengeluaran';
  kategori: string;
  keterangan: string;
  nominal: number;
  qty_beli: number;
  qty_total: number;
  materialId?: string;
  sumber_dana?: string;
  penjualan_detail?: {
    produk_id: string;
    produk_nama: string;
    varian: { varian_id: string; varian_nama: string; qty: number }[];
  }[];
  ambiguousKeyword?: string;
  ambiguousCandidates?: {
    id: string;
    name: string;
    type: 'ingredient' | 'product';
    category?: string;
    price?: number;
    unit?: string;
    productRef?: Product;
    ingredientRef?: Ingredient;
  }[];
  userConfirmedMatch?: boolean;
  saveToDatabase?: boolean;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: Product[];
  ingredients: Ingredient[];
  categories: { name: string; type: 'Pemasukan' | 'Pengeluaran' }[];
  hppCategories: string[];
  dompets?: Dompet[];
  onSaveBatch: (list: QuickEntryFields[]) => Promise<{ saved: number; failed: number }>;
  user?: User | null;
  setIngredients?: React.Dispatch<React.SetStateAction<Ingredient[]>>;
}

// ─── Nominal Parser ───────────────────────────────────────────────────────────

function parseNominal(token: string): number | null {
  const s = token.toLowerCase().replace(/[rp.\s]/g, '');
  const match = s.match(/^([\d]+(?:[,.][\d]+)?)(rb|ribu|k|jt|juta|m|miliar)?$/);
  if (!match) return null;
  const num = parseFloat(match[1].replace(',', '.'));
  const suffix = match[2] || '';
  if (suffix === 'rb' || suffix === 'ribu' || suffix === 'k') return Math.round(num * 1000);
  if (suffix === 'jt' || suffix === 'juta') return Math.round(num * 1_000_000);
  if (suffix === 'm' || suffix === 'miliar') return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

const UNIT_WORDS = new Set([
  'kg','gram','gr','g','ons','liter','lt','l','ml','pcs','biji','buah',
  'paket','pak','lembar','unit','porsi','bungkus','botol','kaleng','sak',
  'bal','lusin','kodi','roll','meter','m','cm',
]);

function parseQty(token: string): { qty: number; unit: string } | null {
  const match = token.match(/^([\d]+(?:[.,][\d]+)?)\s*(kg|gram|gr|g|ons|liter|lt|l|ml|pcs|biji|buah|paket|pak|lembar|unit|porsi|bungkus|botol|kaleng|sak|bal|lusin|kodi|roll|meter|m|cm)?$/i);
  if (!match) return null;
  const qty = parseFloat(match[1].replace(',', '.'));
  const unit = (match[2] || 'pcs').toLowerCase();
  return { qty, unit };
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function offsetDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const BULAN: Record<string, number> = {
  jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, maret: 3,
  apr: 4, april: 4, mei: 5, jun: 6, juni: 6, jul: 7, juli: 7,
  agu: 8, agustus: 8, sep: 9, september: 9, okt: 10, oktober: 10,
  nov: 11, november: 11, des: 12, desember: 12,
};

function extractDateFromTokens(
  tokens: string[],
  defaultDate: string,
): { date: string; indices: number[] } | null {
  for (let i = 0; i < tokens.length; i++) {
    const t0 = tokens[i].toLowerCase();

    if (t0 === 'kemarin') return { date: offsetDate(-1), indices: [i] };
    if (t0 === 'kemarin2' || t0 === 'kemarinnya') return { date: offsetDate(-2), indices: [i] };
    if (t0 === 'hariini') return { date: todayStr(), indices: [i] };
    if (t0 === 'hari' && tokens[i + 1]?.toLowerCase() === 'ini') {
      return { date: todayStr(), indices: [i, i + 1] };
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(t0)) return { date: t0, indices: [i] };

    const dmy = t0.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      const d = dmy[1].padStart(2, '0'), m = dmy[2].padStart(2, '0'), y = dmy[3];
      return { date: `${y}-${m}-${d}`, indices: [i] };
    }

    const dm = t0.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (dm) {
      const year = new Date().getFullYear();
      const d = dm[1].padStart(2, '0'), m = dm[2].padStart(2, '0');
      return { date: `${year}-${m}-${d}`, indices: [i] };
    }

    if ((t0 === 'tgl' || t0 === 'tanggal') && tokens[i + 1]) {
      const day = parseInt(tokens[i + 1]);
      if (!isNaN(day) && day >= 1 && day <= 31) {
        if (tokens[i + 2]) {
          const monthNum = BULAN[tokens[i + 2].toLowerCase()];
          if (monthNum) {
            if (tokens[i + 3] && /^\d{4}$/.test(tokens[i + 3])) {
              const y = tokens[i + 3];
              const d = String(day).padStart(2, '0'), mo = String(monthNum).padStart(2, '0');
              return { date: `${y}-${mo}-${d}`, indices: [i, i + 1, i + 2, i + 3] };
            }
            const year = new Date().getFullYear();
            const d = String(day).padStart(2, '0'), mo = String(monthNum).padStart(2, '0');
            return { date: `${year}-${mo}-${d}`, indices: [i, i + 1, i + 2] };
          }
        }
        const base = new Date(defaultDate);
        base.setDate(day);
        return { date: base.toISOString().split('T')[0], indices: [i, i + 1] };
      }
    }

    if (/^\d{1,2}$/.test(t0) && tokens[i + 1]) {
      const day = parseInt(t0);
      const monthNum = BULAN[tokens[i + 1].toLowerCase()];
      if (!isNaN(day) && day >= 1 && day <= 31 && monthNum) {
        if (tokens[i + 2] && /^\d{4}$/.test(tokens[i + 2])) {
          const y = tokens[i + 2];
          const d = String(day).padStart(2, '0'), mo = String(monthNum).padStart(2, '0');
          return { date: `${y}-${mo}-${d}`, indices: [i, i + 1, i + 2] };
        }
        const year = new Date().getFullYear();
        const d = String(day).padStart(2, '0'), mo = String(monthNum).padStart(2, '0');
        return { date: `${year}-${mo}-${d}`, indices: [i, i + 1] };
      }
    }
  }
  return null;
}

function formatDateDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

// ─── Keyword Maps ─────────────────────────────────────────────────────────────

const JUAL_KEYWORDS = ['jual', 'jualin', 'jualan', 'penjualan', 'selling', 'sold', 'laku', 'omset', 'dapat', 'pesanan', 'catering', 'terjual', 'pendapatan', 'pemasukan'];
const BELI_KEYWORDS = ['beli', 'belin', 'beliin', 'pembelian', 'bayar', 'bayarin', 'kulak', 'kulakan', 'restock', 'belanja', 'nota', 'ongkir', 'transport', 'gaji', 'listrik', 'sewa', 'pengeluaran'];

const CATEGORY_KEYWORDS: Record<string, { jenis: 'Pengeluaran' | 'Pemasukan'; kategori: string }> = {
  gaji: { jenis: 'Pengeluaran', kategori: 'Gaji' },
  upah: { jenis: 'Pengeluaran', kategori: 'Gaji' },
  karyawan: { jenis: 'Pengeluaran', kategori: 'Gaji' },
  listrik: { jenis: 'Pengeluaran', kategori: 'Operasional' },
  air: { jenis: 'Pengeluaran', kategori: 'Operasional' },
  gas: { jenis: 'Pengeluaran', kategori: 'Operasional' },
  operasional: { jenis: 'Pengeluaran', kategori: 'Operasional' },
  transportasi: { jenis: 'Pengeluaran', kategori: 'Operasional' },
  bensin: { jenis: 'Pengeluaran', kategori: 'Operasional' },
  sewa: { jenis: 'Pengeluaran', kategori: 'Operasional' },
  tabungan: { jenis: 'Pengeluaran', kategori: 'Tabungan' },
  nabung: { jenis: 'Pengeluaran', kategori: 'Tabungan' },
  iklan: { jenis: 'Pengeluaran', kategori: 'Biaya Iklan' },
  promosi: { jenis: 'Pengeluaran', kategori: 'Biaya Iklan' },
  ads: { jenis: 'Pengeluaran', kategori: 'Biaya Iklan' },
  saldo: { jenis: 'Pemasukan', kategori: 'Saldo sisa' },
  modal: { jenis: 'Pemasukan', kategori: 'Saldo sisa' },
  packing: { jenis: 'Pengeluaran', kategori: 'Packing' },
  kemasan: { jenis: 'Pengeluaran', kategori: 'Packing' },
};

function resolveCategory(
  kandidat: string,
  jenis: 'Pemasukan' | 'Pengeluaran',
  categories: { name: string; type: 'Pemasukan' | 'Pengeluaran' }[],
): string {
  const valid = categories.filter(c => c.type === jenis).map(c => c.name);
  if (valid.length === 0) return kandidat || 'Lainnya';
  if (valid.includes(kandidat)) return kandidat;
  const ci = valid.find(v => v.toLowerCase() === kandidat.toLowerCase());
  if (ci) return ci;

  const partial = valid.find(v =>
    v.toLowerCase().includes(kandidat.toLowerCase()) ||
    kandidat.toLowerCase().includes(v.toLowerCase())
  );
  if (partial) return partial;

  if (jenis === 'Pemasukan') {
    const salesCat = valid.find(v =>
      v.toLowerCase().includes('jual') ||
      v.toLowerCase().includes('masuk') ||
      v.toLowerCase().includes('omset')
    );
    if (salesCat) return salesCat;
    return valid[0] || 'Penjualan';
  }

  if (valid.includes('Lainnya')) return 'Lainnya';
  return valid[0] || 'Lainnya';
}

// ─── Common UMKM Aliases ───────────────────────────────────────────────────────

const COMMON_ALIASES: Record<string, string> = {
  bamer: 'bawang merah',
  baput: 'bawang putih',
  baso: 'bakso',
  bso: 'bakso',
  terigu: 'tepung terigu',
  cabe: 'cabe',
  cabai: 'cabe',
  minyak: 'minyak goreng',
  telor: 'telur',
  telur: 'telur',
};

function expandAliases(str: string): string {
  let result = str.toLowerCase();
  for (const [alias, full] of Object.entries(COMMON_ALIASES)) {
    const regex = new RegExp(`\\b${alias}\\b`, 'gi');
    result = result.replace(regex, full);
  }
  return result;
}

const ACTION_WORDS_SET = new Set([
  'beli', 'belin', 'beliin', 'pembelian', 'bayar', 'bayarin', 'kulak', 'kulakan', 'restock', 'belanja',
  'nota', 'jual', 'jualin', 'jualan', 'penjualan', 'pesan', 'pesanan', 'laku', 'terjual', 'dapat',
  'pendapatan', 'pemasukan', 'pengeluaran', 'ongkir', 'transport', 'sewa', 'gaji', 'upah', 'karyawan', 'upahan',
  'order', 'orderan', 'pembayaran'
]);

function stripActionWords(text: string): string {
  const words = text.toLowerCase().trim().split(/\s+/);
  const cleanWords = words.filter(w => !ACTION_WORDS_SET.has(w));
  return cleanWords.join(' ').trim() || text.toLowerCase().trim();
}

// ─── Fuzzy Product Matching ───────────────────────────────────────────────────

function normWords(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
}

function wordOverlapScore(descWords: string[], refWords: string[]): number {
  let score = 0;
  for (const rw of refWords) {
    if (descWords.some(dw => dw === rw || dw.startsWith(rw) || rw.startsWith(dw))) score++;
  }
  return score;
}

function fuzzyMatchProduct(
  descWords: string[],
  products: Product[],
): { product: Product; score: number } | null {
  let best: { product: Product; score: number } | null = null;
  for (const prod of products) {
    const prodWords = normWords(prod.nama);
    const score = wordOverlapScore(descWords, prodWords);
    if (score > 0 && (!best || score > best.score)) best = { product: prod, score };
  }
  return best;
}

// ─── Core Line Parser ─────────────────────────────────────────────────────────

function parseLine(
  raw: string,
  ingredients: Ingredient[],
  products: Product[],
  categories: { name: string; type: 'Pemasukan' | 'Pengeluaran' }[],
  defaultDate: string,
  hppCategories: string[] = [],
): QuickEntryFields | null {
  const line = raw.trim();
  if (!line) return null;
  let tokens = line.split(/\s+/);
  if (tokens.length === 0) return null;

  let tanggal = defaultDate;
  const dateResult = extractDateFromTokens(tokens, defaultDate);
  if (dateResult) {
    tanggal = dateResult.date;
    const idxSet = new Set(dateResult.indices);
    tokens = tokens.filter((_, idx) => !idxSet.has(idx));
    if (tokens.length === 0) return null;
  }

  let jenis: 'Pemasukan' | 'Pengeluaran' = 'Pengeluaran';
  let kategori = 'Lainnya';
  let actionIdx = -1;

  for (let i = 0; i < tokens.length; i++) {
    const tl = tokens[i].toLowerCase();
    if (JUAL_KEYWORDS.some(k => tl === k || tl.startsWith(k))) {
      jenis = 'Pemasukan'; kategori = 'Penjualan'; actionIdx = i; break;
    }
    if (BELI_KEYWORDS.some(k => tl === k || tl.startsWith(k))) {
      jenis = 'Pengeluaran'; actionIdx = i; break;
    }
  }
  if (actionIdx >= 0) tokens = tokens.filter((_, i) => i !== actionIdx);

  const lineLower = tokens.join(' ').toLowerCase();
  for (const [kw, meta] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lineLower.includes(kw)) { jenis = meta.jenis; kategori = meta.kategori; break; }
  }
  if (kategori === 'Lainnya') {
    for (const cat of categories) {
      if (lineLower.includes(cat.name.toLowerCase())) { jenis = cat.type; kategori = cat.name; break; }
    }
  }

  let nominal = 0;
  let qty_beli = 0;
  const usedIndices = new Set<number>();
  const descTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    // ① Look-ahead: bare number immediately followed by a standalone unit word
    //    e.g. "1 liter", "25 kg" — consume BOTH tokens as qty.
    //    Must run before parseNominal so "1" isn't grabbed as Rp 1.
    if (qty_beli === 0 && i + 1 < tokens.length) {
      const bareNum = tokens[i].match(/^[\d]+(?:[.,][\d]+)?$/);
      const nextLower = tokens[i + 1].toLowerCase();
      if (bareNum && UNIT_WORDS.has(nextLower) && !usedIndices.has(i + 1)) {
        qty_beli = parseFloat(tokens[i].replace(',', '.'));
        usedIndices.add(i);
        usedIndices.add(i + 1);
        continue;
      }
    }
    // ② Nominal — runs before single-token qty so a bare "21000" (no unit) is
    //    treated as a price, not qty=21000 (parseQty allows a missing unit).
    const nom = parseNominal(tokens[i]);
    if (nom !== null && nom > 0) { if (nom > nominal) nominal = nom; usedIndices.add(i); continue; }
    // ③ Number+unit fused in one token (e.g. "1kg", "2liter").
    //    parseNominal returns null for these (suffix not in rb/k/jt/…), so they
    //    safely reach this branch.
    const qtyParsed = parseQty(tokens[i]);
    if (qtyParsed && qtyParsed.qty > 0 && qtyParsed.qty < 100_000 && qty_beli === 0) {
      qty_beli = qtyParsed.qty; usedIndices.add(i); continue;
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    if (!usedIndices.has(i)) descTokens.push(tokens[i]);
  }

  let keterangan = descTokens.join(' ').trim() || tokens.join(' ');
  let penjualan_detail: QuickEntryFields['penjualan_detail'] = undefined;

  // ── Ambiguity detection state ─────────────────────────────────────────────
  let ambiguousKeyword: string | undefined = undefined;
  let ambiguousCandidates: QuickEntryFields['ambiguousCandidates'] = undefined;
  let userConfirmedMatch = true;

  // ── Pengeluaran: ingredient / category matching ──────────────────────────
  let materialId: string | undefined = undefined;
  if (jenis === 'Pengeluaran') {
    const rawClean = stripActionWords(keterangan);
    const nd = rawClean.toLowerCase().trim();
    const ndExpanded = expandAliases(nd);
    const words = normWords(nd);

    // 1. PRIORITAS UTAMA: Exact match check
    // If input contains specific item name existing in DB (e.g. "Cabe Jablay"), pick directly with no ambiguity.
    const exactIng = ingredients.find(i => {
      const n = i.name.toLowerCase().trim();
      const nClean = stripActionWords(n);
      const nExpanded = expandAliases(n);
      return n === nd || nClean === nd || nExpanded === nd || n === ndExpanded || nClean === ndExpanded || nd === n;
    });

    if (exactIng) {
      materialId = exactIng.id;
      if (kategori === 'Lainnya' && exactIng.category) kategori = exactIng.category;
      if (nominal === 0 && qty_beli > 0) nominal = Math.round(exactIng.price * qty_beli);
      else if (nominal > 0 && qty_beli === 0 && exactIng.price > 0) qty_beli = Math.round((nominal / exactIng.price) * 100) / 100;
      keterangan = `Beli ${exactIng.name}`;
      userConfirmedMatch = true;
      ambiguousKeyword = undefined;
      ambiguousCandidates = undefined;
    } else {
      // 2. Candidate matching:
      // An ingredient `i` is a candidate ONLY IF every word in `words` (user input) is present in `i.name`.
      // If user input contains extra specific words not in `i.name` (e.g., "Cabe Kering" vs "Cabe"),
      // "Cabe Kering" is a specific NEW ITEM (Rule 4) and must NOT force match "Cabe" or show wrong options.
      const matchedIngs = ingredients.filter(i => {
        const ingWords = normWords(i.name);
        return words.length > 0 && words.every(w => ingWords.some(iw => iw === w || iw.startsWith(w) || w.startsWith(iw)));
      });

      if (matchedIngs.length === 1) {
        const singleIng = matchedIngs[0];
        materialId = singleIng.id;
        if (kategori === 'Lainnya' && singleIng.category) kategori = singleIng.category;
        if (nominal === 0 && qty_beli > 0) nominal = Math.round(singleIng.price * qty_beli);
        else if (nominal > 0 && qty_beli === 0 && singleIng.price > 0) qty_beli = Math.round((nominal / singleIng.price) * 100) / 100;
        keterangan = `Beli ${singleIng.name}`;
        userConfirmedMatch = true;
        ambiguousKeyword = undefined;
        ambiguousCandidates = undefined;
      } else if (matchedIngs.length > 1) {
        // Multiple matches & NO exact match -> Ambiguous generic keyword state (e.g. "Cabe" -> ["Cabe Jablay", "Cabe Keriting"])
        const primaryIng = matchedIngs[0];
        materialId = primaryIng.id;
        if (kategori === 'Lainnya' && primaryIng.category) kategori = primaryIng.category;
        if (nominal === 0 && qty_beli > 0) nominal = Math.round(primaryIng.price * qty_beli);
        else if (nominal > 0 && qty_beli === 0 && primaryIng.price > 0) qty_beli = Math.round((nominal / primaryIng.price) * 100) / 100;
        keterangan = `Beli ${primaryIng.name}`;

        const matchedKw = words.find(w => matchedIngs.filter(i => i.name.toLowerCase().includes(w)).length > 1) || words[0] || nd;
        ambiguousKeyword = matchedKw;
        ambiguousCandidates = matchedIngs.map(ing => ({
          id: ing.id,
          name: ing.name,
          type: 'ingredient' as const,
          category: ing.category,
          price: ing.price,
          unit: ing.unit,
          ingredientRef: ing,
        }));
        userConfirmedMatch = false;
      } else {
        // Rule 4: SPECIFIC NEW ITEM NOT IN DB ("Cabe Kering", "Bubble Wrap")
        // DILARANG mencocokkan secara paksa atau menampilkan opsi lain.
        materialId = undefined;
        ambiguousKeyword = undefined;
        ambiguousCandidates = undefined;
        userConfirmedMatch = true;
      }
    }

    if (!materialId && kategori === 'Lainnya') {
      const matchedCat = categories.find(c => c.type === 'Pengeluaran' && (nd.includes(c.name.toLowerCase()) || ndExpanded.includes(c.name.toLowerCase())));
      if (matchedCat) kategori = matchedCat.name;
    }
  }

  // ── Pemasukan: fuzzy product matching ───────────────────────────────────
  let qty_total = 0;
  if (jenis === 'Pemasukan' && kategori === 'Penjualan') {
    const rawClean = stripActionWords(keterangan);
    const descClean = rawClean.toLowerCase().trim();
    const descWords = normWords(rawClean);

    // 1. Check for EXACT MATCH in products first
    const exactProd = products.find(p => {
      const pName = p.nama.toLowerCase().trim();
      const pClean = stripActionWords(pName);
      return pName === descClean || pClean === descClean || pName === keterangan.toLowerCase().trim();
    });

    let matchedProduct: Product | undefined = undefined;

    if (exactProd) {
      matchedProduct = exactProd;
      userConfirmedMatch = true;
      ambiguousKeyword = undefined;
      ambiguousCandidates = undefined;
    } else {
      const matchedProds = products.filter(p => {
        const prodWords = normWords(p.nama);
        return descWords.length > 0 && descWords.every(w => prodWords.some(pw => pw === w || pw.startsWith(w) || w.startsWith(pw)));
      });

      if (matchedProds.length === 1) {
        matchedProduct = matchedProds[0];
        userConfirmedMatch = true;
        ambiguousKeyword = undefined;
        ambiguousCandidates = undefined;
      } else if (matchedProds.length > 1) {
        matchedProduct = matchedProds[0];
        const matchedKw = descWords.find(w => matchedProds.filter(p => p.nama.toLowerCase().includes(w)).length > 1) || descWords[0] || descClean;
        ambiguousKeyword = matchedKw;
        ambiguousCandidates = matchedProds.map(prod => ({
          id: prod.id,
          name: prod.nama,
          type: 'product' as const,
          category: prod.kategori,
          price: prod.varian[0]?.harga_jual || 0,
          unit: 'pcs',
          productRef: prod,
        }));
        userConfirmedMatch = false;
      } else {
        // Specific product not in DB -> New Item / Custom sale (Rule 4)
        matchedProduct = undefined;
        userConfirmedMatch = true;
        ambiguousKeyword = undefined;
        ambiguousCandidates = undefined;
      }
    }

    if (matchedProduct) {
      const prod = matchedProduct;

      // Match variants by word overlap; fall back to first variant if none identified
      const varianMatches: { varian_id: string; varian_nama: string; qty: number }[] = [];
      for (const v of prod.varian) {
        const vWords = normWords(v.nama);
        if (wordOverlapScore(descWords, vWords) > 0) {
          varianMatches.push({ varian_id: v.id, varian_nama: v.nama, qty: qty_beli || 1 });
        }
      }
      if (varianMatches.length === 0 && prod.varian.length > 0) {
        const v = prod.varian[0];
        varianMatches.push({ varian_id: v.id, varian_nama: v.nama, qty: qty_beli || 1 });
      }

      if (varianMatches.length > 0) {
        penjualan_detail = [{ produk_id: prod.id, produk_nama: prod.nama, varian: varianMatches }];
        qty_total = varianMatches.reduce((s, v) => s + v.qty, 0);
        if (nominal === 0) {
          nominal = varianMatches.reduce((sum, vm) => {
            const variant = prod.varian.find(pv => pv.id === vm.varian_id);
            return sum + (variant?.harga_jual || 0) * vm.qty;
          }, 0);
        }
        // Update keterangan to the official product name + variant (if specific)
        const varLabel = varianMatches.length === 1 && normWords(varianMatches[0].varian_nama).some(w => !normWords(prod.nama).includes(w))
          ? ` - ${varianMatches[0].varian_nama}`
          : '';
        keterangan = prod.nama + varLabel;
      }
    } else {
      // No matching product in DB → keep Pemasukan category resolved
      kategori = resolveCategory('Penjualan', 'Pemasukan', categories);
    }
  }

  kategori = resolveCategory(kategori, jenis, categories);
  // qty_beli = 0 untuk Penjualan (sama persis dengan form manual); qty digunakan di varian saja
  const finalQtyBeli = (jenis === 'Pemasukan' && penjualan_detail && penjualan_detail.length > 0) ? 0 : qty_beli;
  return {
    tanggal,
    tanggal_akhir: null,
    jenis,
    kategori,
    keterangan: keterangan.charAt(0).toUpperCase() + keterangan.slice(1),
    nominal,
    qty_beli: finalQtyBeli,
    qty_total,
    materialId,
    penjualan_detail,
    ambiguousKeyword,
    ambiguousCandidates,
    userConfirmedMatch,
  };
}

function parseAll(
  text: string,
  ingredients: Ingredient[],
  products: Product[],
  categories: { name: string; type: 'Pemasukan' | 'Pengeluaran' }[],
  today: string,
  hppCategories: string[] = [],
): { raw: string; parsed: QuickEntryFields | null }[] {
  const lines = text.split(/\n|;/).map(l => l.trim()).filter(Boolean);
  return lines.map(raw => ({ raw, parsed: parseLine(raw, ingredients, products, categories, today, hppCategories) }));
}

// ─── Inline Edit Card ─────────────────────────────────────────────────────────

type FocusField = 'tanggal' | 'jenis' | 'kategori' | 'keterangan' | 'nominal' | 'qty_beli' | null;

interface EditCardProps {
  key?: React.Key;
  fields: QuickEntryFields;
  raw: string;
  products: Product[];
  ingredients: Ingredient[];
  categories: { name: string; type: 'Pemasukan' | 'Pengeluaran' }[];
  hppCategories: string[];
  onUpdate: (updated: QuickEntryFields) => void;
  onRemove: () => void;
  onUpdateIngredientPrice?: (ingredientId: string, newPrice: number) => Promise<void> | void;
}

function EditCard({ fields, raw, products, ingredients, categories, hppCategories, onUpdate, onRemove, onUpdateIngredientPrice }: EditCardProps) {
  const [editing, setEditing] = React.useState(false);
  const [focusField, setFocusField] = React.useState<FocusField>(null);
  const [draft, setDraft] = React.useState<QuickEntryFields>(fields);
  const [materialSearch, setMaterialSearch] = React.useState('');
  const [lastEditedField, setLastEditedField] = React.useState<'qty' | 'nominal' | null>(null);
  const [isCustomCategory, setIsCustomCategory] = React.useState(false);

  const dateRef = React.useRef<HTMLInputElement>(null);
  const jenisRef = React.useRef<HTMLButtonElement>(null);
  const kategoriRef = React.useRef<HTMLSelectElement>(null);
  const keteranganRef = React.useRef<HTMLInputElement>(null);
  const nominalRef = React.useRef<HTMLInputElement>(null);
  const qtyRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { setDraft(fields); }, [fields]);

  const openEdit = (focus: FocusField = null) => {
    setDraft(fields);
    setMaterialSearch('');
    setFocusField(focus);
    setEditing(true);
  };

  const selectedMaterial = ingredients.find(i => i.id === draft.materialId);

  // Auto-fill calculation handlers (only active for preset DB materials; disabled in custom mode)
  const handleQtyChange = (newQty: number) => {
    setDraft(prev => {
      let nextNominal = prev.nominal;
      // Auto-compute nominal ONLY for non-custom items when a valid DB material with price is selected
      if (!isCustomCategory && selectedMaterial && selectedMaterial.price > 0) {
        nextNominal = Math.round(newQty * selectedMaterial.price);
      }
      return { ...prev, qty_beli: newQty, nominal: nextNominal };
    });
  };

  const handleNominalChange = (newNominal: number) => {
    setDraft(prev => {
      let nextQty = prev.qty_beli;
      // Auto-compute qty ONLY for non-custom items when a valid DB material with price is selected
      if (!isCustomCategory && selectedMaterial && selectedMaterial.price > 0 && prev.qty_beli === 0) {
        nextQty = Math.round((newNominal / selectedMaterial.price) * 100) / 100;
      }
      return { ...prev, nominal: newNominal, qty_beli: nextQty };
    });
  };

  React.useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(() => {
      if (focusField === 'tanggal') dateRef.current?.showPicker?.() || dateRef.current?.focus();
      else if (focusField === 'jenis') jenisRef.current?.focus();
      else if (focusField === 'kategori') kategoriRef.current?.focus();
      else if (focusField === 'keterangan') keteranganRef.current?.focus();
      else if (focusField === 'nominal') { nominalRef.current?.focus(); nominalRef.current?.select(); }
      else if (focusField === 'qty_beli') { qtyRef.current?.focus(); qtyRef.current?.select(); }
    }, 80);
    return () => clearTimeout(timer);
  }, [editing, focusField]);

  // Auto-compute nominal + qty_total from penjualan_detail (same as manual form useEffect)
  React.useEffect(() => {
    if (draft.kategori !== 'Penjualan') return;
    const detail = draft.penjualan_detail || [];
    if (detail.length === 0) return;

    let subtotal = 0;
    let totalQty = 0;
    const involvedProductIds = new Set<string>();

    detail.forEach(pd => {
      involvedProductIds.add(pd.produk_id);
      const product = products.find(p => p.id === pd.produk_id);
      pd.varian.forEach(v => {
        if (v.qty > 0) {
          totalQty += v.qty;
          const variant = product?.varian.find(pv => pv.id === v.varian_id);
          subtotal += (variant?.harga_jual || 0) * v.qty;
        }
      });
    });

    const feesByName = new Map<string, { tipe: string; nilai: number }>();
    involvedProductIds.forEach(pid => {
      const prod = products.find(p => p.id === pid);
      prod?.biaya_lain?.forEach(fee => {
        if (!feesByName.has(fee.nama)) feesByName.set(fee.nama, fee);
      });
    });
    let totalFees = 0;
    feesByName.forEach(fee => {
      totalFees += fee.tipe === 'persen' ? subtotal * (fee.nilai / 100) : fee.nilai;
    });

    const autoKet = detail.filter(pd => pd.varian.some(v => v.qty > 0)).map(pd => pd.produk_nama).join(', ')
      || detail.map(pd => pd.produk_nama).join(', ');

    setDraft(prev => ({
      ...prev,
      nominal: subtotal - totalFees,
      qty_total: totalQty,
      qty_beli: 0,
      keterangan: autoKet || prev.keterangan,
    }));
  }, [draft.penjualan_detail, draft.kategori, products]);

  const toggleDraftProduct = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    setDraft(prev => {
      const isSelected = prev.penjualan_detail?.some(pd => pd.produk_id === productId);
      if (isSelected) {
        return { ...prev, penjualan_detail: prev.penjualan_detail?.filter(pd => pd.produk_id !== productId) };
      }
      const newDetail = {
        produk_id: product.id,
        produk_nama: product.nama,
        varian: product.varian.map(v => ({ varian_id: v.id, varian_nama: v.nama, qty: 0 })),
      };
      return { ...prev, penjualan_detail: [...(prev.penjualan_detail || []), newDetail] };
    });
  };

  const changeVariantQty = (productId: string, variantId: string, qty: number) => {
    setDraft(prev => ({
      ...prev,
      penjualan_detail: prev.penjualan_detail?.map(pd =>
        pd.produk_id !== productId ? pd : {
          ...pd,
          varian: pd.varian.map(v => v.varian_id === variantId ? { ...v, qty } : v),
        }
      ),
    }));
  };

  const handleConfirm = () => { onUpdate(draft); setEditing(false); };
  const handleCancel = () => { setDraft(fields); setEditing(false); };

  const setJenis = (j: 'Pemasukan' | 'Pengeluaran') => {
    const validCats = categories.filter(c => c.type === j);
    const catStillValid = validCats.some(c => c.name === draft.kategori);
    setDraft(prev => ({
      ...prev,
      jenis: j,
      kategori: catStillValid ? prev.kategori : (validCats[0]?.name || 'Lainnya'),
      penjualan_detail: j === 'Pengeluaran' ? [] : prev.penjualan_detail,
      materialId: j === 'Pemasukan' ? undefined : prev.materialId,
    }));
  };

  const isHppCategory = hppCategories.includes(draft.kategori);
  const filteredIngredients = ingredients.filter(i =>
    i.category?.toLowerCase().trim() === draft.kategori.toLowerCase().trim()
  );
  const displayIngredients = materialSearch.trim()
    ? filteredIngredients.filter(i => i.name.toLowerCase().includes(materialSearch.toLowerCase()))
    : filteredIngredients;

  const validCategories = categories.filter(c => c.type === draft.jenis);
  const isPenjualan = draft.jenis === 'Pemasukan' || draft.kategori === 'Penjualan' || draft.kategori.toLowerCase().includes('penjualan') || draft.kategori.toLowerCase().includes('jual');

  const handleSelectCandidate = (candidate: NonNullable<QuickEntryFields['ambiguousCandidates']>[0]) => {
    if (candidate.type === 'ingredient') {
      const ing = candidate.ingredientRef || ingredients.find(i => i.id === candidate.id);
      const targetQty = (editing ? draft.qty_beli : fields.qty_beli) || 1;
      const price = ing?.price || candidate.price || 0;
      const computedNominal = price > 0 ? Math.round(targetQty * price) : (editing ? draft.nominal : fields.nominal);
      const newCat = ing?.category && ing.category !== 'Lainnya' ? ing.category : (editing ? draft.kategori : fields.kategori);

      const updated: QuickEntryFields = {
        ...(editing ? draft : fields),
        materialId: candidate.id,
        keterangan: `Beli ${candidate.name}`,
        kategori: newCat,
        nominal: computedNominal,
        qty_beli: targetQty,
        userConfirmedMatch: true,
      };

      if (editing) {
        setDraft(updated);
      } else {
        onUpdate(updated);
      }
      toast.success(`Dikonfirmasi item DB: ${candidate.name}`);
    } else if (candidate.type === 'product') {
      const prod = candidate.productRef || products.find(p => p.id === candidate.id);
      if (prod) {
        const targetQty = (editing ? draft.qty_beli : fields.qty_beli) || 1;
        const varianMatches = prod.varian.map((v, idx) => ({
          varian_id: v.id,
          varian_nama: v.nama,
          qty: idx === 0 ? targetQty : 0
        }));
        const penjualan_detail = [{ produk_id: prod.id, produk_nama: prod.nama, varian: varianMatches }];
        const price = prod.varian[0]?.harga_jual || candidate.price || 0;

        const updated: QuickEntryFields = {
          ...(editing ? draft : fields),
          jenis: 'Pemasukan',
          kategori: 'Penjualan',
          keterangan: prod.nama,
          penjualan_detail,
          nominal: price * targetQty,
          qty_total: targetQty,
          qty_beli: 0,
          userConfirmedMatch: true,
        };

        if (editing) {
          setDraft(updated);
        } else {
          onUpdate(updated);
        }
        toast.success(`Dikonfirmasi produk DB: ${prod.nama}`);
      }
    }
  };

  // ── View mode ──────────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-3 space-y-1.5 relative group">
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors z-10"
        >
          <X className="w-3 h-3" />
        </button>

        <div className="flex items-center gap-2 pr-6 flex-wrap">
          <button
            onClick={() => openEdit('jenis')}
            className={cn(
              'text-[10px] font-black px-2 py-0.5 rounded-full transition-all active:scale-95 cursor-pointer',
              fields.jenis === 'Pemasukan' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
            )}
          >{fields.jenis}</button>

          <button
            onClick={() => openEdit('kategori')}
            className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full hover:bg-gray-200 transition-all active:scale-95 cursor-pointer"
          >{fields.kategori}</button>

          <button
            onClick={() => openEdit('tanggal')}
            className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-all active:scale-95 cursor-pointer flex items-center gap-1"
          >
            <Calendar className="w-2.5 h-2.5" />
            {formatDateDisplay(fields.tanggal)}
          </button>

          <button
            onClick={() => openEdit('keterangan')}
            className="text-[10px] font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full hover:bg-orange-50 hover:text-orange-500 transition-all active:scale-95 cursor-pointer flex items-center gap-0.5 ml-auto"
          ><Pencil className="w-2.5 h-2.5" /></button>
        </div>

        <div className="text-xs space-y-0.5 text-[#1A1A2E]">
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Keterangan</span>
            <span className="font-bold text-right">{fields.keterangan}</span>
          </div>
          {fields.qty_beli > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-400">Qty Beli</span>
              <span className="font-bold">{fields.qty_beli}</span>
            </div>
          )}
          {fields.qty_total > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-400">Qty Jual</span>
              <span className="font-bold">{fields.qty_total}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-400">Nominal</span>
            <span className={cn('font-black', fields.nominal > 0 ? 'text-primary' : 'text-orange-500')}>
              {fields.nominal > 0 ? formatCurrency(fields.nominal, true) : '⚠ Belum diisi'}
            </span>
          </div>
          {fields.penjualan_detail && fields.penjualan_detail.length > 0 && (
            <div className="pt-1 border-t border-dashed border-gray-100">
              <p className="text-[10px] font-black uppercase text-gray-400 mb-0.5">Detail Penjualan</p>
              {fields.penjualan_detail.map((pd, i) => (
                <div key={i} className="text-[11px]">
                  <span className="font-bold">{pd.produk_nama}</span>
                  {pd.varian.filter(v => v.qty > 0).map((v, j) => (
                    <span key={j} className="text-gray-500"> — {v.varian_nama} {v.qty}pcs</span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ambiguous DB Keyword Candidates Selector */}
        {fields.ambiguousCandidates && fields.ambiguousCandidates.length > 1 && !fields.userConfirmedMatch && (
          <div className="mt-2 p-2.5 bg-amber-50/90 border border-amber-300 rounded-xl space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-amber-900 font-bold">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-pulse shrink-0" />
              <span>Pilih item "{fields.ambiguousKeyword || 'database'}" yang dimaksud:</span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {fields.ambiguousCandidates.map(candidate => {
                const isSelected = fields.materialId === candidate.id || fields.penjualan_detail?.some(pd => pd.produk_id === candidate.id);
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => handleSelectCandidate(candidate)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-xs",
                      isSelected
                        ? "bg-amber-600 text-white border-amber-700 ring-2 ring-amber-300"
                        : "bg-white text-gray-800 border-amber-300 hover:bg-orange-100 hover:border-orange-400"
                    )}
                  >
                    <span>{candidate.name}</span>
                    {candidate.price ? (
                      <span className={cn("text-[10px]", isSelected ? "text-amber-100" : "text-gray-500")}>
                        ({formatCurrency(candidate.price, true)})
                      </span>
                    ) : null}
                    {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

      </div>
    );
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────
  return (
    <div className="bg-white border-2 border-orange-200 rounded-2xl p-3 space-y-3 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-orange-500">Edit Transaksi</span>
        <div className="flex items-center gap-1.5">
          <button onClick={handleCancel} className="text-[10px] font-bold text-gray-400 hover:text-red-500 px-2 py-1 rounded-xl hover:bg-red-50 transition-colors">
            Batal
          </button>
          <button onClick={handleConfirm} className="text-[10px] font-black text-white bg-orange-500 hover:bg-orange-600 px-3 py-1 rounded-xl transition-colors flex items-center gap-1">
            <Check className="w-3 h-3" /> Selesai
          </button>
        </div>
      </div>

      {/* Ambiguous DB Keyword Candidates Selector in Edit Mode */}
      {draft.ambiguousCandidates && draft.ambiguousCandidates.length > 1 && !draft.userConfirmedMatch && (
        <div className="p-2.5 bg-amber-50/90 border border-amber-300 rounded-xl space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-1 text-amber-900 font-bold">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-pulse shrink-0" />
              <span>Cocokkan dengan item Database:</span>
            </div>
            {draft.userConfirmedMatch && (
              <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-black">✓ Dikonfirmasi</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {draft.ambiguousCandidates.map(candidate => {
              const isSelected = draft.materialId === candidate.id || draft.penjualan_detail?.some(pd => pd.produk_id === candidate.id);
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => handleSelectCandidate(candidate)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-xs",
                    isSelected
                      ? "bg-amber-600 text-white border-amber-700 ring-2 ring-amber-300"
                      : "bg-white text-gray-800 border-amber-300 hover:bg-orange-100 hover:border-orange-400"
                  )}
                >
                  <span>{candidate.name}</span>
                  {candidate.price ? (
                    <span className={cn("text-[10px]", isSelected ? "text-amber-100" : "text-gray-500")}>
                      ({formatCurrency(candidate.price, true)})
                    </span>
                  ) : null}
                  {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Ambiguous DB Keyword Candidates Selector in Edit Mode */}

      {/* Tanggal */}
      <div className="space-y-1">
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Tanggal</label>
        <input
          ref={dateRef}
          type="date"
          value={draft.tanggal}
          onChange={e => setDraft(prev => ({ ...prev, tanggal: e.target.value }))}
          className="w-full h-9 rounded-xl border border-gray-200 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50"
        />
      </div>

      {/* Jenis + Kategori */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Jenis</label>
          <div className="flex gap-1">
            <button
              ref={jenisRef}
              onClick={() => setJenis('Pemasukan')}
              className={cn('flex-1 h-8 rounded-xl text-[10px] font-black transition-all border',
                draft.jenis === 'Pemasukan' ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-400 border-gray-200 hover:border-green-300'
              )}
            >Masuk</button>
            <button
              onClick={() => setJenis('Pengeluaran')}
              className={cn('flex-1 h-8 rounded-xl text-[10px] font-black transition-all border',
                draft.jenis === 'Pengeluaran' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-400 border-gray-200 hover:border-red-300'
              )}
            >Keluar</button>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Kategori</label>
            <button
              type="button"
              onClick={() => setIsCustomCategory(!isCustomCategory)}
              className="text-[9px] font-bold text-orange-600 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
            >
              {isCustomCategory ? '← List Preset' : '+ Custom'}
            </button>
          </div>
          {isCustomCategory ? (
            <input
              type="text"
              value={draft.kategori}
              onChange={e => setDraft(prev => ({ ...prev, kategori: e.target.value }))}
              placeholder="Nama kategori custom..."
              className="w-full h-8 rounded-xl border border-orange-300 px-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-orange-300 bg-orange-50/60"
            />
          ) : (
            <select
              ref={kategoriRef}
              value={validCategories.some(c => c.name === draft.kategori) || draft.kategori === 'Lainnya' ? draft.kategori : '__custom__'}
              onChange={e => {
                if (e.target.value === '__custom__') {
                  setIsCustomCategory(true);
                } else {
                  setDraft(prev => ({
                    ...prev,
                    kategori: e.target.value,
                    penjualan_detail: e.target.value !== 'Penjualan' && !e.target.value.toLowerCase().includes('jual') ? [] : prev.penjualan_detail,
                    materialId: undefined,
                  }));
                }
              }}
              className="w-full h-8 rounded-xl border border-gray-200 px-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50 appearance-none cursor-pointer"
            >
              {validCategories.map(cat => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
              {!validCategories.some(c => c.name === 'Lainnya') && <option value="Lainnya">Lainnya</option>}
              <option value="__custom__">✏️ + Custom (Input Nama Kategori)...</option>
            </select>
          )}
        </div>
      </div>

      {isPenjualan ? (
        <>
          {/* Langkah 1: Pilih Produk */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Langkah 1: Pilih Produk</label>
            <div className="flex flex-wrap gap-1.5">
              {products.map(prod => {
                const isSelected = draft.penjualan_detail?.some(pd => pd.produk_id === prod.id);
                return (
                  <button
                    key={prod.id}
                    onClick={() => toggleDraftProduct(prod.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-bold border transition-all active:scale-95',
                      isSelected ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
                    )}
                  >{prod.nama}</button>
                );
              })}
            </div>
          </div>

          {/* Langkah 2: Qty per Varian */}
          {draft.penjualan_detail && draft.penjualan_detail.length > 0 && (
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Langkah 2: Isi Qty per Varian</label>
              <div className="space-y-2">
                {draft.penjualan_detail.map(pd => (
                  <div key={pd.produk_id} className="bg-gray-50 rounded-xl p-2.5 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-black text-gray-700">{pd.produk_nama}</span>
                    </div>
                    {pd.varian.map(v => (
                      <div key={v.varian_id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-500 flex-1 truncate">{v.varian_nama}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <input
                            type="number"
                            min="0"
                            value={v.qty || ''}
                            onChange={e => changeVariantQty(pd.produk_id, v.varian_id, Number(e.target.value) || 0)}
                            placeholder="0"
                            className="w-16 h-8 rounded-lg border border-gray-200 px-2 text-sm font-bold text-right focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                          />
                          <span className="text-[10px] text-gray-400 w-5">pcs</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Auto-computed nominal summary */}
          <div className={cn(
            'rounded-xl p-2.5 flex items-center justify-between',
            draft.nominal > 0 ? 'bg-green-50' : 'bg-orange-50'
          )}>
            <span className="text-xs font-bold text-gray-500">Total Pendapatan</span>
            <span className={cn('text-sm font-black', draft.nominal > 0 ? 'text-green-700' : 'text-orange-500')}>
              {draft.nominal > 0 ? formatCurrency(draft.nominal, true) : '—'}
            </span>
          </div>
        </>
      ) : (
        <>
          {/* Material Picker — same as manual form, shown for HPP categories (Bahan Baku, Packing, dll) */}
          {isHppCategory && (
            <div className="space-y-2 pt-1 border-t border-dashed border-gray-100">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Pilih Komponen / Material</label>
              {selectedMaterial ? (
                <div className="flex items-center justify-between bg-orange-50 rounded-xl px-3 py-2">
                  <div>
                    <p className="text-xs font-black text-gray-800">{selectedMaterial.name}</p>
                    <p className="text-[10px] text-gray-400">{selectedMaterial.unit} · Rp{selectedMaterial.price.toLocaleString('id-ID')}/{selectedMaterial.unit}</p>
                  </div>
                  <button
                    onClick={() => setDraft(prev => ({ ...prev, materialId: undefined }))}
                    className="text-[10px] text-gray-400 hover:text-red-500 font-bold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Ganti
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={materialSearch}
                    onChange={e => setMaterialSearch(e.target.value)}
                    placeholder="Cari bahan..."
                    className="w-full h-8 rounded-xl border border-gray-200 px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50"
                  />
                  {displayIngredients.length > 0 ? (
                    <div className="max-h-32 overflow-y-auto rounded-xl border border-gray-100 bg-white divide-y divide-gray-50">
                      {displayIngredients.map(ing => (
                        <button
                          key={ing.id}
                          onClick={() => {
                            setDraft(prev => ({
                              ...prev,
                              materialId: ing.id,
                              keterangan: `Beli ${ing.name}`,
                              nominal: (prev.qty_beli || 0) * ing.price,
                            }));
                            setIsCustomCategory(false);
                            setMaterialSearch('');
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-orange-50 transition-colors"
                        >
                          <span className="text-xs font-bold text-gray-700">{ing.name}</span>
                          <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{ing.unit}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-gray-400 px-1">
                      {materialSearch ? 'Bahan tidak ditemukan.' : `Belum ada bahan untuk kategori "${draft.kategori}".`}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Qty Beli (Pengeluaran) */}
          {draft.jenis === 'Pengeluaran' && (
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Jumlah Beli{selectedMaterial ? ` (${selectedMaterial.unit})` : ''}
              </label>
              <input
                ref={qtyRef}
                type="number" min="0" step="any"
                value={draft.qty_beli || ''}
                onChange={e => handleQtyChange(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-full h-9 rounded-xl border border-gray-200 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50"
              />
              {selectedMaterial && selectedMaterial.price > 0 && (
                <div className="flex items-center justify-between text-[10px] text-gray-500 pl-1 font-medium">
                  <span>Acuan DB: Rp{selectedMaterial.price.toLocaleString('id-ID')}/{selectedMaterial.unit}</span>
                  {draft.nominal > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const autoQty = Math.round((draft.nominal / selectedMaterial.price) * 100) / 100;
                        setDraft(prev => ({ ...prev, qty_beli: autoQty }));
                        toast.info(`Qty disesuaikan ke ${autoQty} ${selectedMaterial.unit}`);
                      }}
                      className="text-orange-600 hover:text-orange-800 font-bold underline cursor-pointer"
                    >
                      Hitung Qty dari DB
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Keterangan */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Keterangan</label>
            <input
              ref={keteranganRef}
              type="text"
              value={draft.keterangan}
              onChange={e => setDraft(prev => ({ ...prev, keterangan: e.target.value }))}
              placeholder="Keterangan transaksi..."
              className="w-full h-9 rounded-xl border border-gray-200 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50"
            />
          </div>

          {/* Nominal */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Nominal Total (Rp)</label>
            <input
              ref={nominalRef}
              type="number"
              min="0"
              value={draft.nominal || ''}
              onChange={e => handleNominalChange(Number(e.target.value) || 0)}
              placeholder="0"
              className="w-full h-9 rounded-xl border border-gray-200 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50"
            />
            {selectedMaterial && selectedMaterial.price > 0 ? (
              <div className="flex items-center justify-between text-[10px] text-gray-500 pl-1 font-medium">
                <span>
                  {draft.nominal > 0 ? formatCurrency(draft.nominal, true) : '—'}
                  {draft.qty_beli > 0 && draft.nominal > 0 && ` (${draft.qty_beli} ${selectedMaterial.unit} × Rp${Math.round(draft.nominal / draft.qty_beli).toLocaleString('id-ID')}/${selectedMaterial.unit})`}
                </span>
                {draft.qty_beli > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const autoNominal = Math.round(draft.qty_beli * selectedMaterial.price);
                      setDraft(prev => ({ ...prev, nominal: autoNominal }));
                      toast.info(`Nominal disesuaikan ke ${formatCurrency(autoNominal, true)}`);
                    }}
                    className="text-orange-600 hover:text-orange-800 font-bold underline cursor-pointer"
                  >
                    Hitung Nominal dari DB
                  </button>
                )}
              </div>
            ) : (
              draft.nominal > 0 && (
                <p className="text-[10px] text-gray-500 pl-1 font-medium">
                  {formatCurrency(draft.nominal, true)}
                </p>
              )
            )}
          </div>

          {/* ── Persetujuan Perbarui Harga Database jika ada perbedaan ── */}
          {(() => {
            const calcUnitPrice = (selectedMaterial && draft.qty_beli > 0 && draft.nominal > 0)
              ? Math.round(draft.nominal / draft.qty_beli)
              : 0;
            const hasDiscrepancy = selectedMaterial && draft.qty_beli > 0 && draft.nominal > 0 && selectedMaterial.price > 0
              ? Math.abs(calcUnitPrice - selectedMaterial.price) > 0.01
              : false;

            if (!hasDiscrepancy || !selectedMaterial) return null;

            const isUpdateDb = draft.saveToDatabase !== false; // Default true unless user chose "Jangan Update"

            return (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2 text-xs">
                <div className="flex items-start gap-2 text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Harga Kustom Dideteksi</p>
                    <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                      Harga transaksi kustom: <span className="font-bold text-amber-950">Rp {formatCurrency(calcUnitPrice, true)}/{selectedMaterial.unit}</span> ({formatCurrency(draft.nominal, true)} ÷ {draft.qty_beli} {selectedMaterial.unit})
                      <br />
                      Acuan DB saat ini: <span className="font-bold text-amber-950">Rp {formatCurrency(selectedMaterial.price, true)}/{selectedMaterial.unit}</span>
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1.5 border-t border-amber-200/80">
                  <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">Opsi Perubahan Database:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(prev => ({ ...prev, saveToDatabase: true }));
                        if (onUpdateIngredientPrice) {
                          onUpdateIngredientPrice(selectedMaterial.id, calcUnitPrice);
                        }
                        toast.success("Set ke: Update harga acuan di Database");
                      }}
                      className={cn(
                        "px-2.5 py-2 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between shadow-xs",
                        isUpdateDb
                          ? "bg-amber-600 text-white border-amber-700 ring-2 ring-amber-300 font-bold"
                          : "bg-white text-gray-700 border-amber-200 hover:bg-amber-100"
                      )}
                    >
                      <div className="text-[11px] font-black flex items-center gap-1">
                        {isUpdateDb && <Check className="w-3 h-3" />} 1. Update ke DB
                      </div>
                      <div className={cn("text-[9px]", isUpdateDb ? "text-amber-100" : "text-gray-400")}>
                        Perbarui acuan DB ke Rp {formatCurrency(calcUnitPrice, true)}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDraft(prev => ({ ...prev, saveToDatabase: false }));
                        toast.info("Set ke: Jangan update acuan Database");
                      }}
                      className={cn(
                        "px-2.5 py-2 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between shadow-xs",
                        !isUpdateDb
                          ? "bg-slate-800 text-white border-slate-900 ring-2 ring-slate-400 font-bold"
                          : "bg-white text-gray-700 border-amber-200 hover:bg-slate-100"
                      )}
                    >
                      <div className="text-[11px] font-black flex items-center gap-1">
                        {!isUpdateDb && <Check className="w-3 h-3" />} 2. Jangan Update
                      </div>
                      <div className={cn("text-[9px]", !isUpdateDb ? "text-slate-300" : "text-gray-400")}>
                        Hanya transaksi biasa (DB tak berubah)
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Opsi Simpan ke Database untuk Item Custom ── */}
          {(!draft.materialId && (!draft.penjualan_detail || draft.penjualan_detail.length === 0)) && (
            <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-3 space-y-2 text-xs">
              <div className="flex items-start gap-2 text-amber-900">
                <Database className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-amber-950">Status Penyimpanan Database (Item Custom)</p>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                    Pilih opsi penyimpanan untuk item: <span className="font-bold text-amber-950">"{draft.keterangan || 'Item Custom'}"</span>
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-amber-200/80">
                <button
                  type="button"
                  onClick={() => setDraft(prev => ({ ...prev, saveToDatabase: true }))}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between shadow-xs",
                    draft.saveToDatabase
                      ? "bg-amber-600 text-white border-amber-700 ring-2 ring-amber-300 font-bold"
                      : "bg-white text-gray-700 border-amber-200 hover:bg-amber-100"
                  )}
                >
                  <div className="text-[11px] font-black flex items-center gap-1">
                    {draft.saveToDatabase && <Check className="w-3 h-3" />} 1. Simpan ke Database
                  </div>
                  <div className={cn("text-[9px]", draft.saveToDatabase ? "text-amber-100" : "text-gray-400")}>
                    Buat item/bahan baru di DB
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(prev => ({ ...prev, saveToDatabase: false }))}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between shadow-xs",
                    !draft.saveToDatabase
                      ? "bg-slate-800 text-white border-slate-900 ring-2 ring-slate-400 font-bold"
                      : "bg-white text-gray-700 border-amber-200 hover:bg-slate-100"
                  )}
                >
                  <div className="text-[11px] font-black flex items-center gap-1">
                    {!draft.saveToDatabase && <Check className="w-3 h-3" />} 2. Jangan Simpan
                  </div>
                  <div className={cn("text-[9px]", !draft.saveToDatabase ? "text-slate-300" : "text-gray-400")}>
                    Hanya transaksi biasa (no DB)
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Qty Jual (Pemasukan non-Penjualan) */}
          {draft.jenis === 'Pemasukan' && draft.kategori !== 'Penjualan' && (
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Qty</label>
              <input
                ref={qtyRef}
                type="number" min="0"
                value={draft.qty_total || ''}
                onChange={e => setDraft(prev => ({ ...prev, qty_total: Number(e.target.value) || 0 }))}
                placeholder="0"
                className="w-full h-9 rounded-xl border border-gray-200 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function QuickEntryDialog({ open, onOpenChange, products, ingredients, categories, hppCategories, dompets = [], onSaveBatch, user, setIngredients }: Props) {
  const [input, setInput] = React.useState('');
  const [entries, setEntries] = React.useState<{ raw: string; parsed: QuickEntryFields }[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [step, setStep] = React.useState<'input' | 'preview'>('input');
  const [showSumberDana, setShowSumberDana] = React.useState(false);
  const [selectedSumberDana, setSelectedSumberDana] = React.useState('saldo_utama');
  const [discrepancies, setDiscrepancies] = React.useState<{ ingredient: Ingredient; calcPrice: number }[]>([]);
  const [showDiscrepancyModal, setShowDiscrepancyModal] = React.useState(false);
  const [isAiParsing, setIsAiParsing] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (open) {
      setInput('');
      setEntries([]);
      setStep('input');
      setShowSumberDana(false);
      setSelectedSumberDana('saldo_utama');
      setShowDiscrepancyModal(false);
      setDiscrepancies([]);
      setIsAiParsing(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  const handleUpdateIngredientPrice = async (ingredientId: string, newPrice: number) => {
    if (setIngredients) {
      setIngredients(prev => prev.map(ing => ing.id === ingredientId ? { ...ing, price: newPrice } : ing));
    }
    if (user) {
      try {
        const ingRef = doc(db, `users/${user.uid}/stok/${ingredientId}`);
        await setDoc(ingRef, { price: newPrice }, { merge: true });
        toast.success(`Harga acuan di database berhasil diperbarui menjadi Rp ${formatCurrency(newPrice, true)}`);
      } catch (err) {
        console.error("Gagal update harga ingredient:", err);
        toast.error("Gagal memperbarui harga di database");
      }
    } else {
      toast.success(`Harga acuan diperbarui menjadi Rp ${formatCurrency(newPrice, true)}`);
    }
  };

  const handleAiParse = async () => {
    if (!input.trim()) return;
    setIsAiParsing(true);
    try {
      const customApiKey = localStorage.getItem('gemini_api_key') || undefined;
      const res = await fetch('/api/ai-parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(customApiKey ? { 'x-gemini-api-key': customApiKey } : {}),
        },
        body: JSON.stringify({
          userMessage: input,
          products,
          ingredients,
          categories,
          hppCategories,
          today: todayStr(),
          customApiKey,
        }),
      });

      let data: any = null;
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (res.ok && data?.transactions && data.transactions.length > 0) {
        const parsedResults: { raw: string; parsed: QuickEntryFields }[] = [];

        for (const item of data.transactions) {
          const f = item.fields || {};
          const isPengeluaran = f.jenis === 'Pengeluaran';
          
          let cat = f.kategori || (isPengeluaran ? 'Lain-Lain' : 'Penjualan');
          let matId = f.materialId;

          // If f.materialId wasn't returned by AI, check ONLY if description is an exact match to an ingredient in DB
          if (!matId && isPengeluaran && ingredients.length > 0) {
            const rawClean = stripActionWords(f.keterangan || '');
            const ketLower = rawClean.toLowerCase().trim();
            const ketExpanded = expandAliases(ketLower);
            const matchedIng = ingredients.find(ing => {
              const ingName = ing.name.toLowerCase().trim();
              const ingClean = stripActionWords(ingName);
              return ingName === ketLower || ingClean === ketLower || ingName === ketExpanded;
            });
            if (matchedIng) matId = matchedIng.id;
          }

          let nominal = Number(f.nominal) || 0;
          let qtyBeli = Number(f.qty_beli) || 0;

          // Auto-calculate missing qty or nominal using Database ingredient price
          if (matId) {
            const ing = ingredients.find(i => i.id === matId);
            if (ing && ing.price > 0) {
              if (nominal > 0 && qtyBeli === 0) {
                qtyBeli = Math.round((nominal / ing.price) * 100) / 100;
              } else if (qtyBeli > 0 && nominal === 0) {
                nominal = Math.round(qtyBeli * ing.price);
              }
            }
          }

          const entryField: QuickEntryFields = {
            tanggal: f.tanggal || todayStr(),
            tanggal_akhir: null,
            jenis: isPengeluaran ? 'Pengeluaran' : 'Pemasukan',
            kategori: cat,
            keterangan: f.keterangan || 'Transaksi AI',
            nominal: nominal,
            qty_beli: qtyBeli,
            qty_total: qtyBeli,
            materialId: matId,
            penjualan_detail: f.penjualan_detail || undefined,
          };

          parsedResults.push({
            raw: item.summary || f.keterangan || input,
            parsed: entryField,
          });
        }

        if (parsedResults.length > 0) {
          setEntries(parsedResults);
          setStep('preview');
          toast.success(`${parsedResults.length} transaksi dipahami AI Gemini sesuai Database!`);
          return;
        }
      }
      toast.info("Pemrosesan AI beralih ke parser standar...");
      handleParse();
    } catch (err: any) {
      console.error("AI parse error:", err);
      toast.error(err?.message || "Gagal AI Parse, beralih ke parser lokal.");
      handleParse();
    } finally {
      setIsAiParsing(false);
    }
  };

  const handleParse = () => {
    const results = parseAll(input, ingredients, products, categories, todayStr(), hppCategories);
    const valid = results.filter(r => r.parsed !== null) as { raw: string; parsed: QuickEntryFields }[];
    if (valid.length === 0) {
      toast.error("Tidak dapat memahami format teks input.");
      return;
    }
    setEntries(valid);
    setStep('preview');
  };

  const handleAddCustomEntry = () => {
    const defaultCat = categories.find(c => c.type === 'Pengeluaran')?.name || 'Belanja Bahan Baku';
    const newEntry: QuickEntryFields = {
      tanggal: todayStr(),
      tanggal_akhir: null,
      jenis: 'Pengeluaran',
      kategori: defaultCat,
      keterangan: 'Transaksi Custom Baru',
      nominal: 0,
      qty_beli: 1,
      qty_total: 1,
      materialId: undefined,
    };
    setEntries(prev => [...prev, { raw: 'Input Custom Manual', parsed: newEntry }]);
    setStep('preview');
    toast.success('Draf transaksi custom ditambahkan! Anda dapat mengedit harga, qty, dan kategori langsung.');
  };

  const removeEntry = (idx: number) => {
    const next = entries.filter((_, i) => i !== idx);
    if (next.length === 0) setStep('input');
    else setEntries(next);
  };

  const updateEntry = (idx: number, updated: QuickEntryFields) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, parsed: updated } : e));
  };

  // Step 1 — intercept Simpan: auto-update DB for custom ingredient prices, then open sumber dana picker
  const handleSave = async () => {
    if (entries.length === 0) return;

    const list: { ingredient: Ingredient; calcPrice: number }[] = [];
    const seenIngIds = new Set<string>();

    entries.forEach(e => {
      if (e.parsed.jenis === 'Pengeluaran' && e.parsed.materialId && e.parsed.qty_beli > 0 && e.parsed.nominal > 0) {
        if (e.parsed.saveToDatabase === false) return; // User explicitly selected "Jangan Update"
        const ing = ingredients.find(i => i.id === e.parsed.materialId);
        if (ing) {
          const calcPrice = Math.round(e.parsed.nominal / e.parsed.qty_beli);
          if (calcPrice > 0 && Math.abs(calcPrice - (ing.price || 0)) > 0.01 && !seenIngIds.has(ing.id)) {
            seenIngIds.add(ing.id);
            list.push({ ingredient: ing, calcPrice });
          }
        }
      }
    });

    if (list.length > 0) {
      for (const d of list) {
        await handleUpdateIngredientPrice(d.ingredient.id, d.calcPrice);
      }
    }

    setSelectedSumberDana('saldo_utama');
    setShowSumberDana(true);
  };

  const handleConfirmDiscrepanciesAndUpdateDb = async () => {
    for (const d of discrepancies) {
      await handleUpdateIngredientPrice(d.ingredient.id, d.calcPrice);
    }
    setShowDiscrepancyModal(false);
    setSelectedSumberDana('saldo_utama');
    setShowSumberDana(true);
  };

  const handleSkipDiscrepanciesUpdateDb = () => {
    setShowDiscrepancyModal(false);
    setSelectedSumberDana('saldo_utama');
    setShowSumberDana(true);
  };

  // Step 2 — confirmed: enrich entries with chosen sumber_dana then persist
  const handleConfirmSave = async () => {
    setSaving(true);
    setShowSumberDana(false);
    try {
      // Process custom entries flagged to save to database
      for (const e of entries) {
        if (e.parsed.saveToDatabase && !e.parsed.materialId && e.parsed.jenis === 'Pengeluaran') {
          const rawClean = e.parsed.keterangan.replace(/^Beli\s+/i, '').trim() || 'Item Custom';
          const newId = 'ing_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
          const unitPrice = e.parsed.qty_beli > 0 ? Math.round(e.parsed.nominal / e.parsed.qty_beli) : e.parsed.nominal;
          
          const newIng: Ingredient = {
            id: newId,
            name: rawClean,
            category: e.parsed.kategori || 'Lainnya',
            unit: 'pcs',
            price: unitPrice,
            initialStock: 0,
            currentStock: e.parsed.qty_beli || 0,
            minStock: 0,
            fromHpp: false,
          };

          if (user) {
            try {
              await setDoc(doc(db, `users/${user.uid}/stok/${newId}`), newIng);
            } catch (err) {
              console.error("Gagal simpan ke DB stok:", err);
            }
          }
          if (setIngredients) {
            setIngredients(prev => [...prev, newIng]);
          }
          e.parsed.materialId = newId;
          toast.success(`Item "${rawClean}" berhasil ditambahkan ke Database Stok!`);
        }
      }

      await onSaveBatch(entries.map(e => ({ ...e.parsed, sumber_dana: selectedSumberDana })));
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleParse();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-[2rem] max-h-[90dvh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white shadow-md">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black">Input Cepat</DialogTitle>
              <DialogDescription className="text-xs font-medium">Ketik transaksi singkat, sistem otomatis parsing</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {step === 'input' && (
            <div className="space-y-3">
              <div className="bg-orange-50 border border-orange-100 rounded-2xl p-3 space-y-1.5 text-xs text-gray-600">
                <p className="font-black text-orange-700 text-[11px] uppercase tracking-widest">Contoh format</p>
                <div className="space-y-1 font-medium">
                  <p>• <span className="font-black text-gray-800">beli tapioka 25kg 210000</span> → Pengeluaran, hari ini</p>
                  <p>• <span className="font-black text-gray-800">jual cireng ori 50pcs kemarin</span> → Pemasukan, kemarin</p>
                  <p>• <span className="font-black text-gray-800">gaji karyawan 500rb tgl 1 juni</span> → Pengeluaran, 1 Juni</p>
                  <p>• <span className="font-black text-gray-800">listrik 150rb 10/6</span> → Pengeluaran, 10 Juni</p>
                  <p>• <span className="font-black text-gray-800">tabungan 200rb tgl 10 juni 2026</span> → tgl 10 Juni 2026</p>
                </div>
                <p className="text-[10px] text-gray-400 pt-1">Satu baris = satu transaksi. Tap badge untuk edit sebelum simpan.</p>
              </div>

              <Textarea
                ref={textareaRef}
                placeholder={"beli tapioka 25kg 210000\njual cireng ori 50pcs tgl 10 juni 2026\ngaji karyawan 500rb kemarin"}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={5}
                className="rounded-2xl border-gray-200 resize-none font-medium text-sm"
              />
              <p className="text-[10px] text-gray-400 text-center">Tekan <kbd className="px-1.5 py-0.5 bg-gray-100 rounded font-mono text-[9px]">Ctrl+Enter</kbd> atau klik tombol di bawah</p>

              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleAiParse}
                  disabled={!input.trim() || isAiParsing}
                  className="w-full rounded-2xl font-bold h-12 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-white border-none gap-2 shadow-lg shadow-amber-100 hover:opacity-95"
                >
                  {isAiParsing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Menganalisis Database Toko...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Parsing Cerdas AI Gemini (Paham DB)</>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleParse}
                  disabled={!input.trim() || isAiParsing}
                  className="w-full rounded-2xl font-bold h-10 border-gray-200 text-gray-600 gap-2 text-xs"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  Parsing Lokal Cepat
                </Button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                    {entries.length} Transaksi Terdeteksi
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Tap badge untuk mengedit sebelum simpan</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep('input')}
                  className="rounded-xl gap-1.5 text-xs font-bold text-gray-500 h-7"
                >
                  <RefreshCw className="w-3 h-3" /> Edit Teks
                </Button>
              </div>

              <div className="space-y-2">
                {entries.map((e, i) => (
                  <EditCard
                    key={i}
                    fields={e.parsed}
                    raw={e.raw}
                    products={products}
                    ingredients={ingredients}
                    categories={categories}
                    hppCategories={hppCategories}
                    onUpdate={(updated) => updateEntry(i, updated)}
                    onRemove={() => removeEntry(i)}
                    onUpdateIngredientPrice={handleUpdateIngredientPrice}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {step === 'preview' && entries.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 bg-white">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-2xl font-bold h-12 bg-gradient-to-br from-orange-400 to-red-500 text-white border-none gap-2"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                : <><CheckCircle2 className="w-4 h-4" /> Simpan {entries.length} Transaksi</>
              }
            </Button>
          </div>
        )}

        {/* ── Sumber Dana Bottom Sheet ── */}
        {showSumberDana && (
          <div className="absolute inset-0 z-50 flex flex-col justify-end rounded-[2rem] overflow-hidden">
            {/* backdrop */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowSumberDana(false)}
            />
            {/* sheet */}
            <div className="relative bg-white rounded-t-[2rem] px-6 pt-6 pb-8 space-y-5 shadow-2xl">
              {/* handle bar */}
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto -mt-1 mb-1" />

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-brand-50 flex items-center justify-center text-primary shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-black text-[#1A1A2E] text-sm">Pilih Sumber Dana</p>
                  <p className="text-[11px] text-gray-400">untuk {entries.length} transaksi ini</p>
                </div>
              </div>

              <div className="space-y-2">
                {/* Saldo Utama option */}
                <button
                  onClick={() => setSelectedSumberDana('saldo_utama')}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all text-left',
                    selectedSumberDana === 'saldo_utama'
                      ? 'border-primary bg-brand-50'
                      : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                  )}
                >
                  <Wallet className={cn('w-4 h-4 shrink-0', selectedSumberDana === 'saldo_utama' ? 'text-primary' : 'text-gray-400')} />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-black', selectedSumberDana === 'saldo_utama' ? 'text-primary' : 'text-gray-700')}>
                      💰 Saldo Utama
                    </p>
                    <p className="text-[10px] text-gray-400">Kas utama & Laba ikut berkurang</p>
                  </div>
                  {selectedSumberDana === 'saldo_utama' && (
                    <Check className="w-4 h-4 text-primary shrink-0" />
                  )}
                </button>

                {/* Dompet Tabungan options */}
                {dompets.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedSumberDana(d.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all text-left',
                      selectedSumberDana === d.id
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-gray-100 bg-gray-50 hover:border-amber-200'
                    )}
                  >
                    <PiggyBank className={cn('w-4 h-4 shrink-0', selectedSumberDana === d.id ? 'text-amber-500' : 'text-gray-400')} />
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-black', selectedSumberDana === d.id ? 'text-amber-700' : 'text-gray-700')}>
                        🏦 {d.nama}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        Saldo: {formatCurrency(d.saldo_terkumpul || 0, true)} · Kas utama tidak berkurang
                      </p>
                    </div>
                    {selectedSumberDana === d.id && (
                      <Check className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 pt-1">
                <Button
                  variant="outline"
                  onClick={() => setShowSumberDana(false)}
                  className="flex-1 rounded-2xl font-bold h-11 border-gray-200"
                >
                  Batal
                </Button>
                <Button
                  onClick={handleConfirmSave}
                  disabled={saving}
                  className="flex-[2] rounded-2xl font-bold h-11 bg-gradient-to-br from-orange-400 to-red-500 text-white border-none gap-2"
                >
                  {saving
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                    : <><CheckCircle2 className="w-4 h-4" /> Konfirmasi & Simpan</>
                  }
                </Button>
              </div>
            </div>
          </div>
        )}
        {/* ── Modal Konfirmasi Perbarui Harga Database ── */}
        <Dialog open={showDiscrepancyModal} onOpenChange={setShowDiscrepancyModal}>
          <DialogContent className="sm:max-w-[440px] rounded-[2rem]">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-black text-gray-900">Perbarui Harga Acuan Database?</DialogTitle>
                  <DialogDescription className="text-xs">Terdapat {discrepancies.length} bahan baku dengan harga unit transaksi berbeda dari database</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-2 py-2 max-h-48 overflow-y-auto">
              {discrepancies.map(d => (
                <div key={d.ingredient.id} className="bg-amber-50 border border-amber-200/70 rounded-2xl p-3 text-xs flex items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-gray-900">{d.ingredient.name}</p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Transaksi ini: <span className="font-bold text-amber-950">Rp {formatCurrency(d.calcPrice, true)}/{d.ingredient.unit}</span>
                      <br />
                      Acuan di DB: <span className="font-bold text-amber-950">Rp {formatCurrency(d.ingredient.price, true)}/{d.ingredient.unit}</span>
                    </p>
                  </div>
                  <span className="bg-amber-200 text-amber-900 font-bold text-[10px] px-2 py-1 rounded-lg shrink-0">
                    Berbeda
                  </span>
                </div>
              ))}
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSkipDiscrepanciesUpdateDb}
                className="w-full sm:w-auto rounded-xl text-xs font-bold border-gray-200"
              >
                Hanya Simpan Transaksi (Tetapkan DB)
              </Button>
              <Button
                type="button"
                onClick={handleConfirmDiscrepanciesAndUpdateDb}
                className="w-full sm:w-auto rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
              >
                <Check className="w-4 h-4" /> Perbarui DB & Simpan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
