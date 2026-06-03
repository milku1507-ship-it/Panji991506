import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, RefreshCw, Zap, X, Calendar } from 'lucide-react';
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

/**
 * Scan ALL tokens for a date pattern (not just the beginning).
 * Returns the parsed date and the indices of consumed tokens, or null if none found.
 */
function extractDateFromTokens(
  tokens: string[],
  defaultDate: string,
): { date: string; indices: number[] } | null {
  for (let i = 0; i < tokens.length; i++) {
    const t0 = tokens[i].toLowerCase();

    // Relative keywords
    if (t0 === 'kemarin') return { date: offsetDate(-1), indices: [i] };
    if (t0 === 'kemarin2' || t0 === 'kemarinnya') return { date: offsetDate(-2), indices: [i] };
    if (t0 === 'hariini') return { date: todayStr(), indices: [i] };
    if (t0 === 'hari' && tokens[i + 1]?.toLowerCase() === 'ini') {
      return { date: todayStr(), indices: [i, i + 1] };
    }

    // ISO date: 2025-06-01
    if (/^\d{4}-\d{2}-\d{2}$/.test(t0)) {
      return { date: t0, indices: [i] };
    }

    // DD-MM-YYYY or DD/MM/YYYY
    const dmy = t0.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      const d = dmy[1].padStart(2, '0'), m = dmy[2].padStart(2, '0'), y = dmy[3];
      return { date: `${y}-${m}-${d}`, indices: [i] };
    }

    // D/M → day/month current year
    const dm = t0.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (dm) {
      const year = new Date().getFullYear();
      const d = dm[1].padStart(2, '0'), m = dm[2].padStart(2, '0');
      return { date: `${year}-${m}-${d}`, indices: [i] };
    }

    // "tgl X" or "tanggal X"
    if ((t0 === 'tgl' || t0 === 'tanggal') && tokens[i + 1]) {
      const day = parseInt(tokens[i + 1]);
      if (!isNaN(day) && day >= 1 && day <= 31) {
        // Check if next token is a month name: tgl X Bulan [Tahun]
        if (tokens[i + 2]) {
          const monthNum = BULAN[tokens[i + 2].toLowerCase()];
          if (monthNum) {
            // Check for year too: tgl X Bulan YYYY
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
        // Just tgl X → day X of default date's month/year
        const base = new Date(defaultDate);
        base.setDate(day);
        return { date: base.toISOString().split('T')[0], indices: [i, i + 1] };
      }
    }

    // "X Bulan" e.g. "1 juni" or "10 juni 2026"
    if (/^\d{1,2}$/.test(t0) && tokens[i + 1]) {
      const day = parseInt(t0);
      const monthNum = BULAN[tokens[i + 1].toLowerCase()];
      if (!isNaN(day) && day >= 1 && day <= 31 && monthNum) {
        // Check for year: X Bulan YYYY
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

/** Maps a keyword to a {jenis, kategori} pair. The kategori MUST match a valid category name in the system. */
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

// ─── Validate category against the live category list ────────────────────────

function resolveCategory(
  kandidat: string,
  jenis: 'Pemasukan' | 'Pengeluaran',
  categories: { name: string; type: 'Pemasukan' | 'Pengeluaran' }[],
): string {
  const valid = categories.filter(c => c.type === jenis).map(c => c.name);
  if (valid.includes(kandidat)) return kandidat;
  // Fuzzy: case-insensitive match
  const ci = valid.find(v => v.toLowerCase() === kandidat.toLowerCase());
  if (ci) return ci;
  return 'Lainnya';
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

  // ── 1. Extract date from anywhere in the token list ───────────────────────
  let tanggal = defaultDate;
  const dateResult = extractDateFromTokens(tokens, defaultDate);
  if (dateResult) {
    tanggal = dateResult.date;
    // Remove date tokens (reverse order to keep indices valid)
    const idxSet = new Set(dateResult.indices);
    tokens = tokens.filter((_, idx) => !idxSet.has(idx));
    if (tokens.length === 0) return null;
  }

  // ── 2. Detect action verb (jual / beli) at any position ──────────────────
  let jenis: 'Pemasukan' | 'Pengeluaran' = 'Pengeluaran';
  let kategori = 'Lainnya';
  let actionIdx = -1;

  for (let i = 0; i < tokens.length; i++) {
    const tl = tokens[i].toLowerCase();
    if (JUAL_KEYWORDS.some(k => tl === k || tl.startsWith(k))) {
      jenis = 'Pemasukan';
      kategori = 'Penjualan';
      actionIdx = i;
      break;
    }
    if (BELI_KEYWORDS.some(k => tl === k || tl.startsWith(k))) {
      jenis = 'Pengeluaran';
      actionIdx = i;
      break;
    }
  }

  // Remove action verb token
  if (actionIdx >= 0) {
    tokens = tokens.filter((_, i) => i !== actionIdx);
  }

  // ── 3. Detect category keywords in remaining tokens ───────────────────────
  const lineLower = tokens.join(' ').toLowerCase();
  for (const [kw, meta] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lineLower.includes(kw)) {
      jenis = meta.jenis;
      kategori = meta.kategori;
      break;
    }
  }

  // Also check if any token matches a category name directly from the live list
  if (kategori === 'Lainnya') {
    for (const cat of categories) {
      if (lineLower.includes(cat.name.toLowerCase())) {
        jenis = cat.type;
        kategori = cat.name;
        break;
      }
    }
  }

  // ── 4. Scan tokens for nominal and qty; collect description tokens ─────────
  let nominal = 0;
  let qty_beli = 0;
  const usedIndices = new Set<number>();
  const descTokens: string[] = [];

  // First pass: find nominal (largest number) and qty (number with unit)
  for (let i = 0; i < tokens.length; i++) {
    const nom = parseNominal(tokens[i]);
    if (nom !== null && nom > 0) {
      // Prefer the largest plausible nominal (avoid picking qty as nominal)
      if (nom > nominal) nominal = nom;
      usedIndices.add(i);
      continue;
    }
    const qtyParsed = parseQty(tokens[i]);
    if (qtyParsed && qtyParsed.qty > 0 && qtyParsed.qty < 100_000) {
      // Only take first qty token; if already found, it could be nominal
      if (qty_beli === 0 && qtyParsed.unit !== 'pcs') {
        qty_beli = qtyParsed.qty;
        usedIndices.add(i);
        continue;
      } else if (qty_beli === 0) {
        // "pcs" unit: treat as qty only if there's already a different nominal token
        qty_beli = qtyParsed.qty;
        usedIndices.add(i);
        continue;
      }
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    if (!usedIndices.has(i)) descTokens.push(tokens[i]);
  }

  const keterangan = descTokens.join(' ').trim() || tokens.join(' ');

  // ── 5. Match ingredient → auto-assign HPP category ────────────────────────
  let penjualan_detail: QuickEntryFields['penjualan_detail'] = undefined;

  if (jenis === 'Pengeluaran' && kategori === 'Lainnya') {
    const normalizedDesc = keterangan.toLowerCase().trim();
    const matchedIng = ingredients.find(ing => {
      const n = ing.name.toLowerCase().trim();
      return normalizedDesc.includes(n) || n.includes(normalizedDesc.split(' ')[0]);
    });
    if (matchedIng && matchedIng.category) {
      kategori = matchedIng.category;
      if (nominal === 0 && qty_beli > 0) {
        nominal = matchedIng.price * qty_beli;
      }
    } else {
      // Try matching category name from the dynamic list
      const matchedCat = categories.find(c =>
        c.type === 'Pengeluaran' && normalizedDesc.includes(c.name.toLowerCase())
      );
      if (matchedCat) kategori = matchedCat.name;
    }
  }

  // ── 6. Match product → build penjualan_detail ─────────────────────────────
  let qty_total = 0;

  if (jenis === 'Pemasukan' && kategori === 'Penjualan') {
    const normalizedDesc = keterangan.toLowerCase().trim();
    for (const prod of products) {
      if (!normalizedDesc.includes(prod.nama.toLowerCase())) continue;
      const varianMatches: { varian_id: string; varian_nama: string; qty: number }[] = [];
      for (const v of prod.varian) {
        if (normalizedDesc.includes(v.nama.toLowerCase())) {
          const qty = qty_beli || 1;
          varianMatches.push({ varian_id: v.id, varian_nama: v.nama, qty });
        }
      }
      if (varianMatches.length > 0) {
        penjualan_detail = [{ produk_id: prod.id, produk_nama: prod.nama, varian: varianMatches }];
        qty_total = varianMatches.reduce((s, v) => s + v.qty, 0);
        if (nominal === 0) {
          nominal = varianMatches.reduce((sum, v) => {
            const variant = prod.varian.find(pv => pv.id === v.varian_id);
            return sum + (variant?.harga_jual || 0) * v.qty;
          }, 0);
        }
      }
      break;
    }
  }

  // ── 7. Validate category against the live list ────────────────────────────
  kategori = resolveCategory(kategori, jenis, categories);

  const rawKeterangan = keterangan.charAt(0).toUpperCase() + keterangan.slice(1);

  return {
    tanggal,
    tanggal_akhir: null,
    jenis,
    kategori,
    keterangan: rawKeterangan,
    nominal,
    qty_beli,
    qty_total,
    penjualan_detail,
  };
}

// ─── Parse All Lines ──────────────────────────────────────────────────────────

function parseAll(
  text: string,
  ingredients: Ingredient[],
  products: Product[],
  categories: { name: string; type: 'Pemasukan' | 'Pengeluaran' }[],
  today: string,
): { raw: string; parsed: QuickEntryFields | null }[] {
  // Strictly: 1 line = 1 transaction. Split ONLY on newline or semicolon.
  // No comma-splitting — that would fabricate transactions the user didn't type.
  const lines = text
    .split(/\n|;/)
    .map(l => l.trim())
    .filter(Boolean);

  return lines.map(raw => ({ raw, parsed: parseLine(raw, ingredients, products, categories, today) }));
}

// ─── Preview Card ─────────────────────────────────────────────────────────────

function PreviewCard({ fields, onRemove }: { fields: QuickEntryFields; raw: string; onRemove: () => void }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-3 space-y-1.5 relative">
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
      <div className="flex items-center gap-2 pr-6 flex-wrap">
        <span className={cn(
          'text-[10px] font-black px-2 py-0.5 rounded-full',
          fields.jenis === 'Pemasukan' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        )}>{fields.jenis}</span>
        <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{fields.kategori}</span>
        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1">
          <Calendar className="w-2.5 h-2.5" />{formatDateDisplay(fields.tanggal)}
        </span>
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
                <p className="text-[10px] text-gray-400 pt-1">Satu baris = satu transaksi. Tanggal dibaca otomatis dari mana saja dalam teks — jika tidak ada, pakai hari ini.</p>
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
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                  {entries.length} Transaksi Terdeteksi
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep('input')}
                  className="rounded-xl gap-1.5 text-xs font-bold text-gray-500 h-7"
                >
                  <RefreshCw className="w-3 h-3" /> Edit
                </Button>
              </div>

              <div className="space-y-2">
                {entries.map((e, i) => (
                  <PreviewCard
                    key={i}
                    fields={e.parsed}
                    raw={e.raw}
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
