import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, RefreshCw, Zap, X, Calendar, Check, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Product, Ingredient } from '../types';
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
    const nom = parseNominal(tokens[i]);
    if (nom !== null && nom > 0) { if (nom > nominal) nominal = nom; usedIndices.add(i); continue; }
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
  if (jenis === 'Pengeluaran' && kategori === 'Lainnya') {
    const nd = keterangan.toLowerCase().trim();
    const matchedIng = ingredients.find(i => { const n = i.name.toLowerCase().trim(); return nd.includes(n) || n.includes(nd.split(' ')[0]); });
    if (matchedIng?.category) {
      kategori = matchedIng.category;
      if (nominal === 0 && qty_beli > 0) nominal = matchedIng.price * qty_beli;
    } else {
      const matchedCat = categories.find(c => c.type === 'Pengeluaran' && nd.includes(c.name.toLowerCase()));
      if (matchedCat) kategori = matchedCat.name;
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
  return { tanggal, tanggal_akhir: null, jenis, kategori, keterangan: keterangan.charAt(0).toUpperCase() + keterangan.slice(1), nominal, qty_beli: finalQtyBeli, qty_total, penjualan_detail };
}

function parseAll(
  text: string,
  ingredients: Ingredient[],
  products: Product[],
  categories: { name: string; type: 'Pemasukan' | 'Pengeluaran' }[],
  today: string,
): { raw: string; parsed: QuickEntryFields | null }[] {
  const lines = text.split(/\n|;/).map(l => l.trim()).filter(Boolean);
  return lines.map(raw => ({ raw, parsed: parseLine(raw, ingredients, products, categories, today) }));
}

// ─── Inline Edit Card ─────────────────────────────────────────────────────────

type FocusField = 'tanggal' | 'jenis' | 'kategori' | 'keterangan' | 'nominal' | 'qty_beli' | null;

interface EditCardProps {
  fields: QuickEntryFields;
  raw: string;
  categories: { name: string; type: 'Pemasukan' | 'Pengeluaran' }[];
  onUpdate: (updated: QuickEntryFields) => void;
  onRemove: () => void;
}

function EditCard({ fields, raw, categories, onUpdate, onRemove }: EditCardProps) {
  const [editing, setEditing] = React.useState(false);
  const [focusField, setFocusField] = React.useState<FocusField>(null);
  const [draft, setDraft] = React.useState<QuickEntryFields>(fields);

  const dateRef = React.useRef<HTMLInputElement>(null);
  const jenisRef = React.useRef<HTMLButtonElement>(null);
  const kategoriRef = React.useRef<HTMLSelectElement>(null);
  const keteranganRef = React.useRef<HTMLInputElement>(null);
  const nominalRef = React.useRef<HTMLInputElement>(null);
  const qtyRef = React.useRef<HTMLInputElement>(null);

  // Sync draft when fields change from outside
  React.useEffect(() => { setDraft(fields); }, [fields]);

  const openEdit = (focus: FocusField = null) => {
    setDraft(fields);
    setFocusField(focus);
    setEditing(true);
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

  const handleConfirm = () => {
    onUpdate(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(fields);
    setEditing(false);
  };

  const setJenis = (j: 'Pemasukan' | 'Pengeluaran') => {
    const validCats = categories.filter(c => c.type === j);
    const catStillValid = validCats.some(c => c.name === draft.kategori);
    setDraft(prev => ({
      ...prev,
      jenis: j,
      kategori: catStillValid ? prev.kategori : (validCats[0]?.name || 'Lainnya'),
    }));
  };

  const validCategories = categories.filter(c => c.type === draft.jenis);

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
          {/* Jenis badge — click to edit */}
          <button
            onClick={() => openEdit('jenis')}
            className={cn(
              'text-[10px] font-black px-2 py-0.5 rounded-full transition-all active:scale-95 cursor-pointer ring-offset-0',
              fields.jenis === 'Pemasukan'
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-red-100 text-red-700 hover:bg-red-200'
            )}
          >
            {fields.jenis}
          </button>

          {/* Kategori badge — click to edit */}
          <button
            onClick={() => openEdit('kategori')}
            className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full hover:bg-gray-200 transition-all active:scale-95 cursor-pointer"
          >
            {fields.kategori}
          </button>

          {/* Tanggal badge — click to edit */}
          <button
            onClick={() => openEdit('tanggal')}
            className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-all active:scale-95 cursor-pointer flex items-center gap-1"
          >
            <Calendar className="w-2.5 h-2.5" />
            {formatDateDisplay(fields.tanggal)}
          </button>

          {/* Edit pencil — opens generic edit */}
          <button
            onClick={() => openEdit('keterangan')}
            className="text-[10px] font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full hover:bg-orange-50 hover:text-orange-500 transition-all active:scale-95 cursor-pointer flex items-center gap-0.5 ml-auto"
          >
            <Pencil className="w-2.5 h-2.5" />
          </button>
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
                  {pd.varian.map((v, j) => (
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
          <button
            onClick={handleCancel}
            className="text-[10px] font-bold text-gray-400 hover:text-red-500 px-2 py-1 rounded-xl hover:bg-red-50 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleConfirm}
            className="text-[10px] font-black text-white bg-orange-500 hover:bg-orange-600 px-3 py-1 rounded-xl transition-colors flex items-center gap-1"
          >
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

      {/* Jenis */}
      <div className="space-y-1">
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Jenis</label>
        <div className="flex gap-2">
          <button
            ref={jenisRef}
            onClick={() => setJenis('Pemasukan')}
            className={cn(
              'flex-1 h-8 rounded-xl text-xs font-black transition-all border',
              draft.jenis === 'Pemasukan'
                ? 'bg-green-500 text-white border-green-500'
                : 'bg-white text-gray-400 border-gray-200 hover:border-green-300'
            )}
          >
            Pemasukan
          </button>
          <button
            onClick={() => setJenis('Pengeluaran')}
            className={cn(
              'flex-1 h-8 rounded-xl text-xs font-black transition-all border',
              draft.jenis === 'Pengeluaran'
                ? 'bg-red-500 text-white border-red-500'
                : 'bg-white text-gray-400 border-gray-200 hover:border-red-300'
            )}
          >
            Pengeluaran
          </button>
        </div>
      </div>

      {/* Kategori */}
      <div className="space-y-1">
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Kategori</label>
        <select
          ref={kategoriRef}
          value={draft.kategori}
          onChange={e => setDraft(prev => ({ ...prev, kategori: e.target.value }))}
          className="w-full h-9 rounded-xl border border-gray-200 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50 appearance-none cursor-pointer"
        >
          {validCategories.map(cat => (
            <option key={cat.name} value={cat.name}>{cat.name}</option>
          ))}
          {!validCategories.some(c => c.name === 'Lainnya') && (
            <option value="Lainnya">Lainnya</option>
          )}
        </select>
      </div>

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
          <p className="text-[10px] text-gray-400 pl-1">{formatCurrency(draft.nominal, true)}</p>
        )}
      </div>

      {/* Qty Beli — show for Pengeluaran */}
      {draft.jenis === 'Pengeluaran' && (
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Qty Beli</label>
          <input
            ref={qtyRef}
            type="number"
            min="0"
            step="any"
            value={draft.qty_beli || ''}
            onChange={e => setDraft(prev => ({ ...prev, qty_beli: Number(e.target.value) || 0 }))}
            placeholder="0"
            className="w-full h-9 rounded-xl border border-gray-200 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50"
          />
        </div>
      )}

      {/* Qty Jual — show for Pemasukan */}
      {draft.jenis === 'Pemasukan' && draft.kategori === 'Penjualan' && (
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Qty Jual</label>
          <input
            ref={qtyRef}
            type="number"
            min="0"
            value={draft.qty_total || ''}
            onChange={e => setDraft(prev => ({ ...prev, qty_total: Number(e.target.value) || 0 }))}
            placeholder="0"
            className="w-full h-9 rounded-xl border border-gray-200 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50"
          />
        </div>
      )}

      {/* Penjualan detail summary */}
      {draft.penjualan_detail && draft.penjualan_detail.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-2 space-y-0.5">
          <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Detail Produk</p>
          {draft.penjualan_detail.map((pd, i) => (
            <div key={i} className="text-[11px]">
              <span className="font-bold">{pd.produk_nama}</span>
              {pd.varian.map((v, j) => (
                <span key={j} className="text-gray-500"> — {v.varian_nama} {v.qty}pcs</span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function QuickEntryDialog({ open, onOpenChange, products, ingredients, categories, onSaveBatch }: Props) {
  const [input, setInput] = React.useState('');
  const [entries, setEntries] = React.useState<{ raw: string; parsed: QuickEntryFields }[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [step, setStep] = React.useState<'input' | 'preview'>('input');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (open) {
      setInput('');
      setEntries([]);
      setStep('input');
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  const handleParse = () => {
    const results = parseAll(input, ingredients, products, categories, todayStr());
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

  const handleSave = async () => {
    if (entries.length === 0) return;
    setSaving(true);
    try {
      await onSaveBatch(entries.map(e => e.parsed));
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
                    categories={categories}
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
      </DialogContent>
    </Dialog>
  );
}
