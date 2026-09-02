import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Key, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, ExternalLink, ShieldCheck, Trash2 } from 'lucide-react';
import { User } from 'firebase/auth';
import { doc, getDoc, setDoc, db } from '../lib/firebase';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: User | null;
}

export default function ApiKeyDialog({ open, onOpenChange, user }: Props) {
  const [apiKey, setApiKey] = React.useState('');
  const [showKey, setShowKey] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Load existing API Key on open
  React.useEffect(() => {
    if (!open) return;
    setTestResult(null);

    // First check localStorage
    const localKey = localStorage.getItem('gemini_api_key') || '';
    setApiKey(localKey);

    // If user is logged in, try fetching from Firestore as source of truth
    if (user) {
      getDoc(doc(db, `users/${user.uid}/settings/ai_settings`))
        .then(snap => {
          if (snap.exists() && snap.data().gemini_api_key) {
            const firestoreKey = snap.data().gemini_api_key;
            setApiKey(firestoreKey);
            localStorage.setItem('gemini_api_key', firestoreKey);
          }
        })
        .catch(err => console.error("Gagal load AI key dari Firestore:", err));
    }
  }, [open, user]);

  const handleTestKey = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: 'Masukkan API Key terlebih dahulu.' });
      return;
    }
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/test-gemini-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-api-key': apiKey.trim(),
        },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      
      let data: any = null;
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (res.ok && data?.success) {
        setTestResult({ success: true, message: 'Koneksi AI Gemini Berhasil! API Key valid dan siap digunakan.' });
        toast.success('API Key valid!');
      } else {
        setTestResult({ success: false, message: data?.message || `Gagal terhubung (${res.status}). Periksa kembali API Key Anda.` });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'Gagal menghubungi server.' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const trimmed = apiKey.trim();
    setSaving(true);
    try {
      if (trimmed) {
        localStorage.setItem('gemini_api_key', trimmed);
      } else {
        localStorage.removeItem('gemini_api_key');
      }

      if (user) {
        const ref = doc(db, `users/${user.uid}/settings/ai_settings`);
        await setDoc(ref, {
          gemini_api_key: trimmed,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      toast.success(trimmed ? 'Gemini API Key berhasil disimpan!' : 'Gunakan API Key bawaan sistem.');
      onOpenChange(false);
    } catch (err) {
      console.error("Gagal menyimpan API Key:", err);
      toast.error('Gagal menyimpan API Key');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setApiKey('');
    localStorage.removeItem('gemini_api_key');
    if (user) {
      try {
        const ref = doc(db, `users/${user.uid}/settings/ai_settings`);
        await setDoc(ref, { gemini_api_key: '', updatedAt: new Date().toISOString() }, { merge: true });
      } catch (_) {}
    }
    setTestResult(null);
    toast.info('API Key dihapus. Aplikasi menggunakan kunci bawaan jika ada.');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] rounded-[2rem]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shrink-0 shadow-lg shadow-amber-200">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-black text-gray-900">Pengaturan Gemini AI Key</DialogTitle>
              <DialogDescription className="text-xs">
                Hubungkan API Key Gemini agar AI memahami database produk & bahan baku toko Anda
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Fitur AI Card Explanation */}
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-amber-200/60 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Kemampuan AI Cerdas Database:</span>
            </div>
            <ul className="text-[11px] text-amber-900/90 space-y-1.5 pl-5 list-disc leading-relaxed font-medium">
              <li><strong>Paham Typo & Nama Sejenis:</strong> "baso" dikaitkan otomatis ke "Bakso Sapi" atau produk "Bakso Granat" di database.</li>
              <li><strong>Hitung Qty Otomatis dari Harga:</strong> Cukup ketik "cabe jablay 20rb", AI menghitung otomatis qty (misal 250 gram) mengacu pada harga DB!</li>
              <li><strong>Auto-Link Material ID:</strong> Item transaksi otomatis terhubung ke ID Bahan Baku asli di database.</li>
            </ul>
          </div>

          {/* API Key Input */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center justify-between">
              <span>Google Gemini API Key</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-orange-600 hover:underline flex items-center gap-1 font-bold lowercase text-[10px]"
              >
                dapatkan key gratis <ExternalLink className="w-3 h-3" />
              </a>
            </label>

            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full h-11 rounded-2xl border border-gray-200 pl-10 pr-24 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 bg-gray-50/50"
              />
              <Key className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
              <div className="absolute right-2 top-1.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-xl"
                  title={showKey ? "Sembunyikan" : "Tampilkan"}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 pl-1">
              {apiKey ? "Kunci terpasang. Tersimpan aman di aplikasi Anda." : "Kosongkan jika ingin menggunakan sistem bawaan."}
            </p>
          </div>

          {/* Test Status Banner */}
          {testResult && (
            <div className={`p-3 rounded-2xl text-xs flex items-start gap-2.5 border ${
              testResult.success 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span className="font-medium leading-relaxed">{testResult.message}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          {apiKey && (
            <Button
              type="button"
              variant="outline"
              onClick={handleClear}
              className="rounded-xl text-xs font-bold text-rose-600 border-rose-200 hover:bg-rose-50 gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Hapus Key
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handleTestKey}
            disabled={testing || !apiKey.trim()}
            className="rounded-xl text-xs font-bold border-gray-200 text-gray-700 gap-1.5"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-500" />}
            Tes Koneksi
          </Button>

          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl text-xs font-bold bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:opacity-90 gap-1.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Simpan Pengaturan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
