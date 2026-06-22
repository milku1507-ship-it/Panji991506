import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { StoreSettings } from '../types';
import { toast } from 'sonner';
import { Store, Upload, ArrowLeft, Settings2, Image } from 'lucide-react';
import imageCompression from 'browser-image-compression';

import { auth } from '../lib/firebase';

interface StoreSettingsManagerProps {
  settings: StoreSettings;
  setSettings: (newSettings: StoreSettings) => Promise<void>;
  onBack: () => void;
  onManageCategories: () => void;
}

export default function StoreSettingsManager({ settings, setSettings, onBack, onManageCategories }: StoreSettingsManagerProps) {
  const user = auth.currentUser;
  const [localSettings, setLocalSettings] = React.useState<StoreSettings>(settings);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isCompressingLogo, setIsCompressingLogo] = React.useState(false);
  const [isCompressingBanner, setIsCompressingBanner] = React.useState(false);
  const logoInputRef = React.useRef<HTMLInputElement>(null);
  const bannerInputRef = React.useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Ukuran file maksimal 10MB!'); return; }
    setIsCompressingLogo(true);
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 0.1, maxWidthOrHeight: 600, useWebWorker: true });
      const reader = new FileReader();
      reader.onloadend = () => {
        setLocalSettings(prev => ({ ...prev, logo: reader.result as string }));
        toast.success(`Logo siap — ${(compressed.size / 1024).toFixed(0)}KB ✓`);
      };
      reader.readAsDataURL(compressed);
    } catch { toast.error('Kompresi gagal, coba gambar lain.'); }
    finally { setIsCompressingLogo(false); }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Ukuran file maksimal 10MB!'); return; }
    setIsCompressingBanner(true);
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 0.3, maxWidthOrHeight: 1200, useWebWorker: true });
      const reader = new FileReader();
      reader.onloadend = () => {
        setLocalSettings(prev => ({ ...prev, banner: reader.result as string }));
        toast.success(`Banner siap — ${(compressed.size / 1024).toFixed(0)}KB ✓`);
      };
      reader.readAsDataURL(compressed);
    } catch { toast.error('Kompresi gagal, coba gambar lain.'); }
    finally { setIsCompressingBanner(false); }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setSettings(localSettings);
      toast.success('Pengaturan toko berhasil disimpan ✓');
      onBack();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Gagal menyimpan pengaturan toko.';
      toast.error(errMsg);
    } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-3xl font-black text-[#1A1A2E]">Profil & Pengaturan Toko</h2>
          <p className="text-gray-500 font-medium">Kelola identitas dan tampilan toko online Anda.</p>
        </div>
      </div>

      <div className="grid gap-6">

        {/* ── BANNER TOKO ONLINE ── */}
        <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
          <CardHeader className="bg-white border-b border-gray-50">
            <CardTitle className="text-xl font-black flex items-center gap-2">
              <Image className="w-5 h-5 text-primary" />
              Banner Toko Online
            </CardTitle>
            <CardDescription>Foto banner tampil penuh di atas halaman toko online Anda</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {/* Banner preview */}
            <div
              className="relative w-full h-36 rounded-2xl overflow-hidden bg-gradient-to-br from-[#EE2D2D] via-[#E85D1A] to-[#F2A93B] cursor-pointer group"
              onClick={() => bannerInputRef.current?.click()}
            >
              {localSettings.banner ? (
                <img src={localSettings.banner} alt="Banner" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/80">
                  <Image className="w-8 h-8" />
                  <span className="text-sm font-bold">Tap untuk upload banner</span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                <div className="bg-white/90 rounded-xl px-4 py-2 flex items-center gap-2 shadow">
                  <Upload className="w-4 h-4 text-gray-700" />
                  <span className="text-sm font-bold text-gray-700">Ganti Banner</span>
                </div>
              </div>
              {isCompressingBanner && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <p className="text-white font-bold text-sm animate-pulse">Mengkompres...</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => bannerInputRef.current?.click()}
                disabled={isCompressingBanner || isSaving}
                className="rounded-xl font-bold"
              >
                {isCompressingBanner ? 'Mengkompres...' : localSettings.banner ? 'Ganti Banner' : 'Upload Banner'}
              </Button>
              {localSettings.banner && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocalSettings(prev => ({ ...prev, banner: undefined }))}
                  className="rounded-xl font-bold text-red-500 hover:text-red-600 hover:bg-red-50"
                >
                  Hapus Banner
                </Button>
              )}
            </div>
            <p className="text-[10px] text-gray-400">Format: JPG, PNG (Max 10MB — dikompres otomatis). Rasio ideal: 3:1 (misal 1200×400px)</p>
            <input type="file" ref={bannerInputRef} className="hidden" accept="image/*" onChange={handleBannerUpload} />
          </CardContent>
        </Card>

        {/* ── IDENTITAS TOKO ── */}
        <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
          <CardHeader className="bg-white border-b border-gray-50">
            <CardTitle className="text-xl font-black flex items-center gap-2">
              <Store className="w-5 h-5 text-primary" />
              Identitas Toko
            </CardTitle>
            <CardDescription>Informasi dasar toko Anda</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Logo */}
            <div className="flex flex-col items-center justify-center gap-4 p-6 border-2 border-dashed border-gray-100 rounded-3xl bg-gray-50/50">
              <div className="relative w-24 h-24 rounded-3xl bg-white shadow-sm flex items-center justify-center overflow-hidden border border-gray-100">
                {localSettings.logo ? (
                  <img src={localSettings.logo} alt="Logo Preview" referrerPolicy="no-referrer" className="w-full h-full object-contain p-2" />
                ) : (
                  <Store className="w-10 h-10 text-gray-300" />
                )}
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isCompressingLogo || isSaving}
                  className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-white disabled:cursor-not-allowed"
                >
                  <Upload className="w-6 h-6" />
                </button>
              </div>
              <div className="text-center w-full">
                <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={isCompressingLogo || isSaving} className="rounded-xl font-bold">
                  {isCompressingLogo ? 'Mengkompres...' : 'Upload Logo'}
                </Button>
                <p className="text-[10px] text-gray-400 mt-2">Format: JPG, PNG, SVG (Max 10MB — dikompres otomatis ke ~100KB)</p>
              </div>
              {isCompressingLogo && <p className="text-xs text-primary font-medium animate-pulse">Mengkompres gambar...</p>}
              <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={handleLogoUpload} />
            </div>

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Nama Toko</Label>
                <Input value={localSettings.name} onChange={e => setLocalSettings(prev => ({ ...prev, name: e.target.value }))} placeholder="Masukkan nama toko" className="rounded-2xl h-12 border-gray-100 focus:ring-primary" />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Slogan/Tagline <span className="text-gray-400 font-normal">(opsional)</span></Label>
                <Input value={localSettings.tagline || ''} onChange={e => setLocalSettings(prev => ({ ...prev, tagline: e.target.value }))} placeholder="Contoh: Jajanan Enak Setiap Hari" className="rounded-2xl h-12 border-gray-100 focus:ring-primary" />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Nomor WhatsApp <span className="text-gray-400 font-normal">(opsional)</span></Label>
                <Input value={localSettings.phone || ''} onChange={e => setLocalSettings(prev => ({ ...prev, phone: e.target.value }))} placeholder="Contoh: 08123456789" className="rounded-2xl h-12 border-gray-100 focus:ring-primary" />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Alamat <span className="text-gray-400 font-normal">(opsional)</span></Label>
                <Input value={localSettings.address || ''} onChange={e => setLocalSettings(prev => ({ ...prev, address: e.target.value }))} placeholder="Contoh: Jl. Merdeka No. 1, Jakarta" className="rounded-2xl h-12 border-gray-100 focus:ring-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── TAMPILAN LOGO ── */}
        <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
          <CardHeader className="bg-white border-b border-gray-50">
            <CardTitle className="text-xl font-black flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              Tampilan Logo di Aplikasi
            </CardTitle>
            <CardDescription>Atur di mana logo akan ditampilkan di dalam aplikasi kasir</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
              <div className="space-y-0.5">
                <Label className="font-bold text-gray-700">Logo di Header</Label>
                <p className="text-xs text-gray-500">Tampilkan logo pada bagian atas aplikasi</p>
              </div>
              <Switch checked={localSettings.showLogoInHeader} onCheckedChange={checked => setLocalSettings(prev => ({ ...prev, showLogoInHeader: checked }))} />
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
              <div className="space-y-0.5">
                <Label className="font-bold text-gray-700">Logo di Sidebar</Label>
                <p className="text-xs text-gray-500">Tampilkan logo pada menu samping (tablet/desktop)</p>
              </div>
              <Switch checked={localSettings.showLogoInSidebar} onCheckedChange={checked => setLocalSettings(prev => ({ ...prev, showLogoInSidebar: checked }))} />
            </div>
          </CardContent>
        </Card>

        {/* ── KELOLA KATEGORI ── */}
        <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
          <CardHeader className="bg-white border-b border-gray-50">
            <CardTitle className="text-xl font-black flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              Kustomisasi Kategori
            </CardTitle>
            <CardDescription>Atur kategori HPP, Produk, dan Satuan Unit</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Button onClick={onManageCategories} variant="outline" className="w-full h-14 rounded-2xl font-bold border-brand-100 text-primary hover:bg-brand-50 flex items-center justify-between px-6">
              <div className="flex items-center gap-3">
                <Settings2 className="w-5 h-5" />
                <span>Kelola Kategori & Label</span>
              </div>
              <ArrowLeft className="w-5 h-5 rotate-180" />
            </Button>
          </CardContent>
        </Card>

        {/* ── Tombol Aksi ── */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <Button variant="outline" onClick={onBack} disabled={isSaving} className="flex-1 h-14 rounded-2xl font-bold text-gray-600 border-gray-200">
            Batal
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isCompressingLogo || isCompressingBanner} className="flex-1 h-14 rounded-2xl font-bold orange-gradient text-white shadow-lg shadow-brand-200">
            {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </div>
      </div>
    </div>
  );
}
