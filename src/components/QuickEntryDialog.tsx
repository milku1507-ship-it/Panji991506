import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, RefreshCw, Zap, X, Calendar, Check, Pencil, Package, Wallet, PiggyBank } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Product, Ingredient, Dompet } from '../types';
import { formatCurrency } from '../lib/formatUtils';

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

const JUAL_KEYWORDS = ['jual', 'jualin', 'jualan', 'penjualan', 'selling', 'sold'];
const BELI_KEYWORDS = ['beli', 'belin', 'beliin', 'pembelian', 'bayar', 'bayarin'];

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
  if (valid.includes(kandidat)) return kandidat;
  const ci = valid.find(v => v.toLowerCase() === kandidat.toLowerCase());
  if (ci) return ci;
  return 'Lainnya';
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

  // ── Pengeluaran: ingredient / category matching ──────────────────────────
  let materialId: string | undefined = undefined;
  if (jenis === 'Pengeluaran') {
    const nd = keterangan.toLowerCase().trim();
    // Try matching an ingredient by name
    const matchedIng = ingredients.find(i => {
      const n = i.name.toLowerCase().trim();
      return nd.includes(n) || n.includes(nd.split(' ')[0]);
    });
    if (matchedIng) {
      materialId = matchedIng.id;
      // Resolve category from ingredient if still "Lainnya"
      if (kategori === 'Lainnya' && matchedIng.category) {
        kategori = matchedIng.category;
      }
      // Auto-compute nominal from qty_beli × ingredient price (same as manual form)
      if (nominal === 0 && qty_beli > 0) {
        nominal = matchedIng.price * qty_beli;
      }
      // Auto-set keterangan if not meaningful
      if (!keterangan || keterangan.toLowerCase() === matchedIng.name.toLowerCase()) {
        keterangan = `Beli ${matchedIng.name}`;
      }
    } else if (kategori === 'Lainnya') {
      const matchedCat = categories.find(c => c.type === 'Pengeluaran' && nd.includes(c.name.toLowerCase()));
      if (matchedCat) kategori = matchedCat.name;
    }
    // If category is an HPP category and still no materialId, try matching by category-filtered ingredients
    if (!materialId && hppCategories.includes(kategori)) {
      const ingInCat = ingredients.filter(i => i.category?.toLowerCase().trim() === kategori.toLowerCase().trim());
      const nd2 = keterangan.toLowerCase().trim();
      const fallback = ingInCat.find(i => {
        const n = i.name.toLowerCase().trim();
        return nd2.includes(n) || n.includes(nd2.split(' ')[0]);
      });
      if (fallback) {
        materialId = fallback.id;
        if (nominal === 0 && qty_beli > 0) nominal = fallback.price * qty_beli;
        keterangan = `Beli ${fallback.name}`;
      }
    }
  }

  // ── Pemasukan: fuzzy product matching ───────────────────────────────────
  let qty_total = 0;
  if (jenis === 'Pemasukan' && kategori === 'Penjualan') {
    const descWords = normWords(keterangan);
    const bestMatch = fuzzyMatchProduct(descWords, products);

    if (bestMatch) {
      const prod = bestMatch.product;

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
      // No matching product → fallback, keep keterangan as typed
      kategori = 'Lainnya';
    }
  }

  kategori = resolveCategory(kategori, jenis, categories);
  // qty_beli = 0 untuk Penjualan (sama persis dengan form manual); qty digunakan di varian saja
  const finalQtyBeli = (jenis === 'Pemasukan' && penjualan_detail && penjualan_detail.length > 0) ? 0 : qty_beli;
  return { tanggal, tanggal_akhir: null, jenis, kategori, keterangan: keterangan.charAt(0).toUpperCase() + keterangan.slice(1), nominal, qty_beli: finalQtyBeli, qty_total, materialId, penjualan_detail };
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
  fields: QuickEntryFields;
  raw: string;
  products: Product[];
  ingredients: Ingredient[];
  categories: { name: string; type: 'Pemasukan' | 'Pengeluaran' }[];
  hppCategories: string[];
  onUpdate: (updated: QuickEntryFields) => void;
  onRemove: () => void;
}

function EditCard({ fields, raw, products, ingredients, categories, hppCategories, onUpdate, onRemove }: EditCardProps) {
  const [editing, setEditing] = React.useState(false);
  const [focusField, setFocusField] = React.useState<FocusField>(null);
  const [draft, setDraft] = React.useState<QuickEntryFields>(fields);
  const [materialSearch, setMaterialSearch] = React.useState('');

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

  // ── Auto-nominal for HPP categories: qty_beli × material.price (same as manual form) ──
  React.useEffect(() => {
    const isHppCat = hppCategories.includes(draft.kategori);
    if (!isHppCat || !draft.materialId) return;
    const material = ingredients.find(i => i.id === draft.materialId);
    if (!material) return;
    setDraft(prev => ({
      ...prev,
      nominal: (prev.qty_beli || 0) * material.price,
      keterangan: prev.keterangan || `Beli ${material.name}`,
    }));
  }, [draft.materialId, draft.qty_beli, draft.kategori, ingredients, hppCategories]);

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

  const selectedMaterial = ingredients.find(i => i.id === draft.materialId);
  const isHppCategory = hppCategories.includes(draft.kategori);
  const filteredIngredients = ingredients.filter(i =>
    i.category?.toLowerCase().trim() === draft.kategori.toLowerCase().trim()
  );
  const displayIngredients = materialSearch.trim()
    ? filteredIngredients.filter(i => i.name.toLowerCase().includes(materialSearch.toLowerCase()))
    : filteredIngredients;

  const validCategories = categories.filter(c => c.type === draft.jenis);
  const isPenjualan = draft.kategori === 'Penjualan';

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
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Kategori</label>
          <select
            ref={kategoriRef}
            value={draft.kategori}
            onChange={e => setDraft(prev => ({
              ...prev,
              kategori: e.target.value,
              penjualan_detail: e.target.value !== 'Penjualan' ? [] : prev.penjualan_detail,
              materialId: undefined,
            }))}
            className="w-full h-8 rounded-xl border border-gray-200 px-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50 appearance-none cursor-pointer"
          >
            {validCategories.map(cat => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
            {!validCategories.some(c => c.name === 'Lainnya') && <option value="Lainnya">Lainnya</option>}
          </select>
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

          {/* Qty Beli (Pengeluaran) — placed BEFORE nominal so auto-compute useEffect can see it */}
          {draft.jenis === 'Pengeluaran' && (
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Jumlah Beli{selectedMaterial ? ` (${selectedMaterial.unit})` : ''}
              </label>
              <input
                ref={qtyRef}
                type="number" min="0" step="any"
                value={draft.qty_beli || ''}
                onChange={e => setDraft(prev => ({ ...prev, qty_beli: Number(e.target.value) || 0 }))}
                placeholder="0"
                className="w-full h-9 rounded-xl border border-gray-200 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50"
              />
              {selectedMaterial && draft.qty_beli > 0 && (
                <p className="text-[10px] text-gray-400 pl-1">
                  Auto: {draft.qty_beli} × Rp{selectedMaterial.price.toLocaleString('id-ID')} = {formatCurrency(draft.qty_beli * selectedMaterial.price, true)}
                </p>
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
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Nominal (Rp)</label>
            <input
              ref={nominalRef}
              type="number"
              min="0"
              value={draft.nominal || ''}
              onChange={e => setDraft(prev => ({ ...prev, nominal: Number(e.target.value) || 0 }))}
              placeholder="0"
              className="w-full h-9 rounded-xl border border-gray-200 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50"
            />
            {draft.nominal > 0 && (
              <p className="text-[10px] text-gray-400 pl-1">
                {formatCurrency(draft.nominal, true)}
                {isHppCategory && selectedMaterial && ' · terhitung otomatis, bisa diubah manual'}
              </p>
            )}
          </div>

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

export default function QuickEntryDialog({ open, onOpenChange, products, ingredients, categories, hppCategories, dompets = [], onSaveBatch }: Props) {
  const [input, setInput] = React.useState('');
  const [entries, setEntries] = React.useState<{ raw: string; parsed: QuickEntryFields }[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [step, setStep] = React.useState<'input' | 'preview'>('input');
  const [showSumberDana, setShowSumberDana] = React.useState(false);
  const [selectedSumberDana, setSelectedSumberDana] = React.useState('saldo_utama');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (open) {
      setInput('');
      setEntries([]);
      setStep('input');
      setShowSumberDana(false);
      setSelectedSumberDana('saldo_utama');
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  const handleParse = () => {
    const results = parseAll(input, ingredients, products, categories, todayStr(), hppCategories);
    const valid = results.filter(r => r.parsed !== null) as { raw: string; parsed: QuickEntryFields }[];
    if (valid.length === 0) return;
    setEntries(valid);
    setStep('preview');
  };

  const removeEntry = (idx: number) => {
    const next = entries.filter((_, i) => i !== idx);
    if (next.length === 0) setStep('input');
    else setEntries(next);
  };

  const updateEntry = (idx: number, updated: QuickEntryFields) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, parsed: updated } : e));
  };

  // Step 1 — intercept Simpan: show sumber dana picker, don't write yet
  const handleSave = () => {
    if (entries.length === 0) return;
    setSelectedSumberDana('saldo_utama');
    setShowSumberDana(true);
  };

  // Step 2 — confirmed: enrich entries with chosen sumber_dana then persist
  const handleConfirmSave = async () => {
    setSaving(true);
    setShowSumberDana(false);
    try {
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

              <Button
                onClick={handleParse}
                disabled={!input.trim()}
                className="w-full rounded-2xl font-bold h-12 bg-gradient-to-br from-orange-400 to-red-500 text-white border-none gap-2"
              >
                <Zap className="w-4 h-4" />
                Parsing Otomatis
              </Button>
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
      </DialogContent>
    </Dialog>
  );
}
