import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Send, Loader2, CheckCircle2, RefreshCw, Bot, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Product, Transaction } from '../types';
import { formatCurrency } from '../lib/formatUtils';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ParsedFields = {
  tanggal?: string;
  jenis?: 'Pemasukan' | 'Pengeluaran';
  kategori?: string;
  keterangan?: string;
  nominal?: number;
  qty_beli?: number;
  penjualan_detail?: {
    produk_id: string;
    produk_nama: string;
    varian: { varian_id: string; varian_nama: string; qty: number }[];
  }[];
};

type ParsedTx = { summary?: string; fields: ParsedFields };

type ParseResult = {
  needs_clarification?: boolean;
  clarification_question?: string;
  summary?: string;
  transactions: ParsedTx[];
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: Product[];
  categories: { name: string; type: 'Pemasukan' | 'Pengeluaran' }[];
  currentForm: Partial<Transaction>;
  onApply: (fields: ParsedFields) => void;
  onSaveBatch: (list: ParsedFields[]) => Promise<{ saved: number; failed: number }>;
}

function PreviewCard(props: { tx: ParsedTx; idx: number }) {
  const { tx, idx } = props;
  const f = tx.fields;
  return (
    <div className="bg-white border border-violet-100 rounded-2xl p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">Transaksi #{idx + 1}</p>
        {f.jenis && (
          <span className={cn(
            'text-[10px] font-black px-2 py-0.5 rounded-full',
            f.jenis === 'Pemasukan' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          )}>{f.jenis}</span>
        )}
      </div>
      <div className="text-xs space-y-1 font-medium text-[#1A1A2E]">
        {f.tanggal && <div className="flex justify-between"><span className="text-gray-500">Tanggal</span><span className="font-bold">{f.tanggal}</span></div>}
        {f.kategori && <div className="flex justify-between"><span className="text-gray-500">Kategori</span><span className="font-bold">{f.kategori}</span></div>}
        {f.keterangan && <div className="flex justify-between gap-2"><span className="text-gray-500">Keterangan</span><span className="font-bold text-right">{f.keterangan}</span></div>}
        {f.qty_beli !== undefined && f.qty_beli > 0 && <div className="flex justify-between"><span className="text-gray-500">Qty Beli</span><span className="font-bold">{f.qty_beli}</span></div>}
        {f.nominal !== undefined && (
          <div className="flex justify-between"><span className="text-gray-500">Nominal</span><span className="font-black text-primary">{formatCurrency(f.nominal, true)}</span></div>
        )}
        {f.penjualan_detail && f.penjualan_detail.length > 0 && (
          <div className="pt-1 border-t border-dashed border-gray-100 mt-1">
            <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Detail Penjualan</p>
            {f.penjualan_detail.map((pd, i) => (
              <div key={i}>
                <p className="font-bold text-xs">{pd.produk_nama}</p>
                <ul className="pl-3 text-gray-600 text-xs">
                  {pd.varian.map((v, j) => <li key={j}>• {v.varian_nama} — {v.qty} pcs</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TransactionAIChat({ open, onOpenChange, products, categories, currentForm, onApply, onSaveBatch }: Props) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Halo! Saya bisa bantu mengisi form transaksi. Bisa juga banyak sekaligus, contoh:\n• "tapioka 25kg 210000, terigu setengah ons 3000"\n• "jual cireng ayam ori 50 pcs, keju 30 pcs"\n• "beli gas 25rb dan bayar listrik 150rb hari ini"',
    },
  ]);
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [pending, setPending] = React.useState<ParseResult | null>(null);
  const [saving, setSaving] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending, loading, saving]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setLoading(true);
    setPending(null);

    try {
      const res = await fetch('/api/ai-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: messages,
          userMessage: text,
          products,
          categories,
          currentForm,
          today: new Date().toISOString().split('T')[0],
        }),
      });
      const data: ParseResult & { error?: string } = await res.json();

      if (!res.ok || data.error) {
        setMessages((m) => [...m, { role: 'assistant', content: `Maaf, terjadi kendala: ${data.error || 'gagal memproses'}.` }]);
      } else if (data.needs_clarification && (!data.transactions || data.transactions.length === 0)) {
        setMessages((m) => [...m, { role: 'assistant', content: data.clarification_question || 'Bisa berikan detail lebih lanjut?' }]);
      } else if (!data.transactions || data.transactions.length === 0) {
        setMessages((m) => [...m, { role: 'assistant', content: 'Maaf, saya belum bisa menemukan transaksi dari input itu. Coba tulis lebih jelas.' }]);
      } else {
        const count = data.transactions.length;
        const summary = data.summary || (count === 1 ? 'Saya sudah siapkan datanya.' : `Saya menemukan ${count} transaksi.`);
        const ask = count === 1
          ? 'Mohon konfirmasi sebelum saya isi ke form.'
          : 'Mohon konfirmasi untuk menyimpan semuanya sekaligus.';
        setMessages((m) => [...m, { role: 'assistant', content: `${summary} ${ask}` }]);
        setPending(data);
        if (data.clarification_question) {
          setMessages((m) => [...m, { role: 'assistant', content: data.clarification_question! }]);
        }
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Maaf, koneksi gagal: ${e?.message || e}` }]);
    } finally {
      setLoading(false);
    }
  };

  const confirmApply = async () => {
    if (!pending || !pending.transactions || pending.transactions.length === 0) return;
    const list = pending.transactions.map((t) => t.fields);

    if (list.length === 1) {
      onApply(list[0]);
      setMessages((m) => [...m, { role: 'assistant', content: 'Sudah saya isi ke form. Cek dulu, lalu klik "Simpan Transaksi".' }]);
      setPending(null);
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      const result = await onSaveBatch(list);
      const okMsg = result.failed === 0
        ? `Berhasil menyimpan ${result.saved} transaksi ✓`
        : `Tersimpan ${result.saved}, gagal ${result.failed}.`;
      setMessages((m) => [...m, { role: 'assistant', content: okMsg }]);
      setPending(null);
      if (result.failed === 0) onOpenChange(false);
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Gagal menyimpan: ${e?.message || e}` }]);
    } finally {
      setSaving(false);
    }
  };

  const cancelPending = () => {
    setPending(null);
    setMessages((m) => [...m, { role: 'assistant', content: 'Baik, dibatalkan. Silakan ketik ulang.' }]);
  };

  const reset = () => {
    setMessages([{ role: 'assistant', content: 'Form percakapan dibersihkan. Silakan mulai lagi.' }]);
    setPending(null);
    setInput('');
  };

  const txCount = pending?.transactions?.length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] rounded-[2rem] max-h-[90dvh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shadow-md">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black">Asisten AI</DialogTitle>
                <DialogDescription className="text-xs font-medium">Bantu isi form transaksi otomatis</DialogDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={reset} className="rounded-xl gap-1.5 text-xs font-bold text-gray-500">
              <RefreshCw className="w-3.5 h-3.5" /> Reset
            </Button>
          </div>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-gray-50/50">
          {messages.map((m, i) => (
            <div key={i} className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[80%] px-4 py-2.5 rounded-2xl text-sm font-medium whitespace-pre-wrap',
                  m.role === 'user'
                    ? 'bg-primary text-white rounded-br-md'
                    : 'bg-white border border-gray-100 text-[#1A1A2E] rounded-bl-md shadow-sm'
                )}
              >
                {m.content}
              </div>
              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-2 items-center text-xs text-gray-400 font-medium">
              <div className="w-7 h-7 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              Sedang memproses...
            </div>
          )}

          {pending && txCount > 0 && (
            <div className="bg-violet-50/50 border border-violet-200 rounded-2xl p-3 space-y-2">
              <p className="text-xs font-black uppercase tracking-widest text-violet-700">
                Pratinjau ({txCount} transaksi)
              </p>
              <div className="space-y-2">
                {pending.transactions.map((tx, i) => (
                  <div key={i}><PreviewCard tx={tx} idx={i} /></div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={cancelPending} variant="outline" disabled={saving} className="flex-1 rounded-xl font-bold">Batal</Button>
                <Button
                  onClick={confirmApply}
                  disabled={saving}
                  className="flex-1 rounded-xl font-bold gap-1.5 bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white border-none"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {txCount === 1 ? 'Isi Form' : `Simpan Semua (${txCount})`}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-white">
          <div className="flex gap-2">
            <Input
              placeholder='Contoh: "tapioka 25kg 210rb, terigu 0.5 ons 3rb"'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              disabled={loading || saving}
              className="rounded-2xl border-gray-200"
            />
            <Button onClick={send} disabled={loading || saving || !input.trim()} className="rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white border-none gap-1.5 px-4">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-gray-400 font-medium mt-2 text-center">
            AI hanya mengisi/menyimpan setelah konfirmasi Anda.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
