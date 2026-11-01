import React, { useState } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  FileJson, 
  ShieldCheck, 
  RefreshCw, 
  HardDrive, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  Package, 
  Calculator, 
  History, 
  Wallet, 
  Store, 
  Layers,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, db, doc, setDoc, writeBatch, sanitizeData, OperationType, handleFirestoreError, getDoc } from '../lib/firebase';
import { Ingredient, Product, Transaction, Dompet, StoreSettings, KategoriSettings } from '../types';
import { toast } from 'sonner';
import { DEFAULT_KATEGORI } from '../SettingsContext';

interface BackupDataPayload {
  version: string;
  exportDate: string;
  appName: string;
  userEmail?: string | null;
  storeSettings?: StoreSettings;
  kategoriSettings?: KategoriSettings;
  ingredients: Ingredient[];
  products: Product[];
  transactions: Transaction[];
  dompets: Dompet[];
}

interface BackupRestoreManagerProps {
  user: User;
  ingredients: Ingredient[];
  setIngredients: (ingredients: Ingredient[]) => void;
  products: Product[];
  setProducts: (products: Product[]) => void;
  transactions: Transaction[];
  setTransactions: (transactions: Transaction[]) => void;
  dompets: Dompet[];
  setDompets: (dompets: Dompet[]) => void;
  storeSettings: StoreSettings;
  setStoreSettings: (settings: StoreSettings) => Promise<void> | void;
  onBack?: () => void;
}

export default function BackupRestoreManager({
  user,
  ingredients,
  setIngredients,
  products,
  setProducts,
  transactions,
  setTransactions,
  dompets,
  setDompets,
  storeSettings,
  setStoreSettings,
  onBack
}: BackupRestoreManagerProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [parsedBackup, setParsedBackup] = useState<BackupDataPayload | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);

  // Calculate total variant count across products
  const totalVariantsCount = products.reduce((acc, p) => acc + (p.varian?.length || 0), 0);
  const totalBahanCount = products.reduce(
    (acc, p) => acc + (p.varian || []).reduce((vAcc, v) => vAcc + (v.bahan?.length || 0), 0),
    0
  );

  // Export JSON file to local device
  const handleExportBackup = async () => {
    try {
      setIsExporting(true);

      // Fetch kategori settings from Firestore if available
      let currentKategori: KategoriSettings = DEFAULT_KATEGORI;
      try {
        const katSnap = await getDoc(doc(db, `users/${user.uid}/settings/kategori`));
        if (katSnap.exists()) {
          currentKategori = katSnap.data() as KategoriSettings;
        }
      } catch (err) {
        console.warn('Could not fetch kategori settings for backup, using default:', err);
      }

      const backupData: BackupDataPayload = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        appName: 'CeuMilan Financial & HPP Engine',
        userEmail: user.email,
        storeSettings: storeSettings,
        kategoriSettings: currentKategori,
        ingredients: ingredients || [],
        products: products || [],
        transactions: transactions || [],
        dompets: dompets || []
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const dateStr = new Date().toISOString().slice(0, 10);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = `ceumilan-backup-${user.email ? user.email.split('@')[0] : 'data'}-${dateStr}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);

      toast.success('File backup berhasil diunduh ke perangkat Anda! 📦');
    } catch (err: any) {
      console.error('Export backup error:', err);
      toast.error('Gagal membuat file backup: ' + (err?.message || 'Terjadi kesalahan'));
    } finally {
      setIsExporting(false);
    }
  };

  // Handle JSON file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);

        // Validation of backup format
        if (!data || typeof data !== 'object') {
          throw new Error('Format file tidak valid.');
        }

        if (!Array.isArray(data.ingredients) && !Array.isArray(data.products) && !Array.isArray(data.transactions)) {
          throw new Error('File JSON tidak berisi struktur data CeuMilan yang valid.');
        }

        const validPayload: BackupDataPayload = {
          version: data.version || '1.0',
          exportDate: data.exportDate || new Date().toISOString(),
          appName: data.appName || 'CeuMilan',
          userEmail: data.userEmail || null,
          storeSettings: data.storeSettings || undefined,
          kategoriSettings: data.kategoriSettings || undefined,
          ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
          products: Array.isArray(data.products) ? data.products : [],
          transactions: Array.isArray(data.transactions) ? data.transactions : [],
          dompets: Array.isArray(data.dompets) ? data.dompets : []
        };

        setParsedBackup(validPayload);
        toast.info('File backup berhasil dibaca. Silakan periksa rincian sebelum memulihkan.');
      } catch (err: any) {
        console.error('Parse backup file error:', err);
        setImportError(err?.message || 'Gagal membaca file JSON');
        setParsedBackup(null);
        toast.error('File backup tidak valid');
      }
    };
    reader.readAsText(file);
  };

  // Perform Restore to Cloud Firestore & Local React State
  const handleRestoreBackup = async () => {
    if (!parsedBackup || !user) return;

    try {
      setIsImporting(true);
      const uid = user.uid;

      // 1. If 'replace' mode selected, wipe existing documents first
      if (importMode === 'replace') {
        const docsToDelete: Array<{ path: string }> = [
          ...ingredients.map(ing => ({ path: `users/${uid}/stok/${ing.id}` })),
          ...products.map(p => ({ path: `users/${uid}/hpp/${p.id}` })),
          ...transactions.map(t => ({ path: `users/${uid}/transaksi/${t.id}` })),
          ...dompets.map(d => ({ path: `users/${uid}/dompet/${d.id}` }))
        ];

        for (let i = 0; i < docsToDelete.length; i += 450) {
          const chunk = docsToDelete.slice(i, i + 450);
          const batch = writeBatch(db);
          chunk.forEach(item => batch.delete(doc(db, item.path)));
          await batch.commit();
        }
      }

      // 2. Prepare items to write
      const newIngredients = parsedBackup.ingredients || [];
      const newProducts = parsedBackup.products || [];
      const newTransactions = parsedBackup.transactions || [];
      const newDompets = parsedBackup.dompets || [];

      // Combine merged list if 'merge' mode
      let finalIngredients = newIngredients;
      let finalProducts = newProducts;
      let finalTransactions = newTransactions;
      let finalDompets = newDompets;

      if (importMode === 'merge') {
        // Merge without duplicating IDs
        const existingIngIds = new Set(ingredients.map(i => i.id));
        const ingToUpload = newIngredients.filter(i => !existingIngIds.has(i.id));
        finalIngredients = [...ingredients, ...ingToUpload];

        const existingProdIds = new Set(products.map(p => p.id));
        const prodToUpload = newProducts.filter(p => !existingProdIds.has(p.id));
        finalProducts = [...products, ...prodToUpload];

        const existingTxIds = new Set(transactions.map(t => t.id));
        const txToUpload = newTransactions.filter(t => !existingTxIds.has(t.id));
        finalTransactions = [...transactions, ...txToUpload];

        const existingDompetIds = new Set(dompets.map(d => d.id));
        const dompetToUpload = newDompets.filter(d => !existingDompetIds.has(d.id));
        finalDompets = [...dompets, ...dompetToUpload];
      }

      // 3. Batch Write to Firestore (Chunks of 450)
      const operations: Array<{ path: string; data: any }> = [];

      finalIngredients.forEach(ing => {
        operations.push({ path: `users/${uid}/stok/${ing.id}`, data: ing });
      });

      finalProducts.forEach(prod => {
        operations.push({ path: `users/${uid}/hpp/${prod.id}`, data: prod });
      });

      finalTransactions.forEach(tx => {
        operations.push({ path: `users/${uid}/transaksi/${tx.id}`, data: tx });
      });

      finalDompets.forEach(d => {
        operations.push({ path: `users/${uid}/dompet/${d.id}`, data: d });
      });

      for (let i = 0; i < operations.length; i += 450) {
        const chunk = operations.slice(i, i + 450);
        const batch = writeBatch(db);
        chunk.forEach(op => {
          batch.set(doc(db, op.path), sanitizeData(op.data));
        });
        await batch.commit();
      }

      // 4. Restore Store Settings & Kategori Settings
      if (parsedBackup.storeSettings) {
        const updatedSettings = {
          ...parsedBackup.storeSettings,
          onboardingCompleted: true
        };
        await setDoc(doc(db, `users/${uid}/profil_toko/settings`), sanitizeData(updatedSettings));
        await setStoreSettings(updatedSettings);
      }

      if (parsedBackup.kategoriSettings) {
        await setDoc(doc(db, `users/${uid}/settings/kategori`), sanitizeData(parsedBackup.kategoriSettings));
      }

      // 5. Update local React states
      setIngredients(finalIngredients);
      setProducts(finalProducts);
      setTransactions(finalTransactions);
      setDompets(finalDompets);

      toast.success(`🎉 Pemulihan Data Berhasil! ${finalProducts.length} Produk, ${finalIngredients.length} Stok, ${finalTransactions.length} Transaksi telah diunggah ke akun Anda.`);
      setParsedBackup(null);
      setFileName('');
    } catch (err: any) {
      console.error('Restore backup error:', err);
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/backup_restore`);
      toast.error('Gagal mengunggah data backup ke cloud.');
    } finally {
      setIsImporting(false);
    }
  };

  const backupVariantTotal = parsedBackup?.products.reduce((acc, p) => acc + (p.varian?.length || 0), 0) || 0;
  const backupBahanTotal = parsedBackup?.products.reduce(
    (acc, p) => acc + (p.varian || []).reduce((vAcc, v) => vAcc + (v.bahan?.length || 0), 0),
    0
  ) || 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-gray-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 skew-x-12 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5" /> Safe &amp; Encrypted Local File Backup
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              Backup &amp; Restore Data Toko
            </h2>
            <p className="text-sm text-slate-300 max-w-xl">
              Simpan seluruh database toko Anda (HPP lengkap, varian, rincian bahan, transaksi, stok, dompet &amp; profil toko) ke perangkat, lalu unggah kembali kapan saja saat login dengan akun baru.
            </p>
          </div>
          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-xs">
            <Database className="w-8 h-8 text-emerald-400 shrink-0" />
            <div>
              <span className="block text-slate-300 font-medium">Akun Saat Ini:</span>
              <span className="font-bold text-white truncate max-w-[180px] block">{user.email || 'Pengguna Google'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Section: Export & Import */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CARD 1: EXPORT / SIMPAN DATA KE PERANGKAT */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
                <Download className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-lg text-gray-900">1. Unduh Backup ke Perangkat</h3>
                <p className="text-xs text-gray-500">Simpan berkas .json lengkap ke HP/Laptop</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3 text-xs">
              <span className="font-bold text-gray-900 block">Rincian Data yang Akan Terbackup:</span>
              <div className="grid grid-cols-2 gap-2 text-gray-600 font-medium">
                <div className="flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{products.length} Produk ({totalVariantsCount} Varian)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span>{totalBahanCount} Rincian Bahan HPP</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-amber-600" />
                  <span>{ingredients.length} Item Stok Bahan/Kemasan</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-purple-600" />
                  <span>{transactions.length} Riwayat Transaksi</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-teal-600" />
                  <span>{dompets.length} Akun Dompet/Rekening</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Pengaturan Toko &amp; Kategori</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              Berkas JSON ini aman disimpan offline. Semua struktur varian, harga jual, margin, biaya platform Shopee, hingga potongan stok otomatis ikut tersimpan.
            </p>
          </div>

          <Button
            onClick={handleExportBackup}
            disabled={isExporting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl h-12 font-bold shadow-md shadow-emerald-200 transition-all flex items-center justify-center gap-2"
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Mengunduh Berkas...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Unduh File Backup (.json)
              </>
            )}
          </Button>
        </div>

        {/* CARD 2: IMPORT / RESTORE UNTUK AKUN BARU */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-lg text-gray-900">2. Unggah Backup ke Akun</h3>
                <p className="text-xs text-gray-500">Pulihkan data dari file .json yang tersimpan</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-700">
                Pilih Berkas Backup (.json) dari Perangkat:
              </label>
              <div className="relative border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/50 rounded-2xl p-4 text-center cursor-pointer transition-colors">
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="flex flex-col items-center justify-center gap-1.5 pointer-events-none">
                  <FileJson className="w-8 h-8 text-blue-500" />
                  <span className="text-xs font-bold text-blue-900">
                    {fileName ? fileName : 'Klik di sini untuk memilih file .json'}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    Format: ceumilan-backup-*.json
                  </span>
                </div>
              </div>
            </div>

            {importError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700 font-medium">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{importError}</span>
              </div>
            )}
          </div>

          <div className="text-xs text-gray-400 font-medium text-center">
            Gunakan fitur ini setelah login dengan akun Google baru untuk memindahkan seluruh database usaha Anda secara utuh.
          </div>
        </div>
      </div>

      {/* PREVIEW & CONFIRMATION PANEL BEFORE RESTORING */}
      {parsedBackup && (
        <div className="bg-gradient-to-br from-blue-50/80 via-indigo-50/50 to-white border border-blue-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-md animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-blue-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-base text-gray-900">Rincian File Backup Siap Dipulihkan</h4>
                <p className="text-xs text-gray-500">
                  Dibuat pada: {new Date(parsedBackup.exportDate).toLocaleString('id-ID')} {parsedBackup.userEmail && `· Asal Akun: ${parsedBackup.userEmail}`}
                </p>
              </div>
            </div>
            <Badge className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 border-none self-start sm:self-auto">
              Versi {parsedBackup.version}
            </Badge>
          </div>

          {/* Backup Content Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white p-3.5 rounded-2xl border border-blue-100 shadow-2xs">
              <span className="text-gray-500 block text-[10px] font-bold uppercase">Produk &amp; Varian</span>
              <span className="text-lg font-black text-gray-900 mt-0.5 block">
                {parsedBackup.products.length} <span className="text-xs font-normal text-gray-500">({backupVariantTotal} varian)</span>
              </span>
              <span className="text-[10px] text-blue-600 mt-1 block">{backupBahanTotal} rincian bahan HPP</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-blue-100 shadow-2xs">
              <span className="text-gray-500 block text-[10px] font-bold uppercase">Stok Bahan/Kemasan</span>
              <span className="text-lg font-black text-gray-900 mt-0.5 block">
                {parsedBackup.ingredients.length} <span className="text-xs font-normal text-gray-500">item</span>
              </span>
              <span className="text-[10px] text-emerald-600 mt-1 block">Harga &amp; kuantitas utuh</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-blue-100 shadow-2xs">
              <span className="text-gray-500 block text-[10px] font-bold uppercase">Riwayat Transaksi</span>
              <span className="text-lg font-black text-gray-900 mt-0.5 block">
                {parsedBackup.transactions.length} <span className="text-xs font-normal text-gray-500">transaksi</span>
              </span>
              <span className="text-[10px] text-purple-600 mt-1 block">Rincian item &amp;Shopee audit</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-blue-100 shadow-2xs">
              <span className="text-gray-500 block text-[10px] font-bold uppercase">Dompet &amp; Rekening</span>
              <span className="text-lg font-black text-gray-900 mt-0.5 block">
                {parsedBackup.dompets.length} <span className="text-xs font-normal text-gray-500">dompet</span>
              </span>
              <span className="text-[10px] text-teal-600 mt-1 block">Saldo &amp; tipe akun</span>
            </div>
          </div>

          {/* Restore Mode Option Selector */}
          <div className="space-y-3 bg-white p-4 rounded-2xl border border-blue-100">
            <span className="text-xs font-bold text-gray-900 block">Metode Pemulihan Data ke Cloud:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div
                onClick={() => setImportMode('replace')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  importMode === 'replace'
                    ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-300'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-gray-900">
                  <span>🔄 Timpa Semua Data (Rekomendasi Akun Baru)</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Menghapus data di akun ini terlebih dahulu, lalu memasukkan seluruh data dari file backup. Data dipastikan 100% identik dengan backup.
                </p>
              </div>

              <div
                onClick={() => setImportMode('merge')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  importMode === 'merge'
                    ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-300'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-gray-900">
                  <span>➕ Gabungkan dengan Data Saat Ini</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Menambahkan item baru dari backup tanpa menghapus produk/transaksi yang sudah ada di akun ini.
                </p>
              </div>
            </div>
          </div>

          {/* Restore Confirmation Button */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setParsedBackup(null);
                setFileName('');
              }}
              className="w-full sm:w-auto rounded-2xl h-11 text-xs font-bold"
            >
              Batal
            </Button>
            <Button
              type="button"
              disabled={isImporting}
              onClick={handleRestoreBackup}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-11 px-8 text-xs font-bold shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
            >
              {isImporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Mengunggah ke Cloud Firestore...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Setujui &amp; Unggah Data ke Akun Ini
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
