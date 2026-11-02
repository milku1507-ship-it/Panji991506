import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Store, Save, ArrowLeft, Layers, Database, Image, Phone, MapPin, ReceiptText } from 'lucide-react';
import { StoreSettings } from '../types';
import { toast } from 'sonner';

interface StoreSettingsManagerProps {
  settings: StoreSettings;
  setSettings: (newSettings: StoreSettings) => Promise<void> | void;
  onBack?: () => void;
  onManageCategories?: () => void;
  onManageBackup?: () => void;
}

export default function StoreSettingsManager({
  settings,
  setSettings,
  onBack,
  onManageCategories,
  onManageBackup
}: StoreSettingsManagerProps) {
  const [formData, setFormData] = useState<StoreSettings>({
    name: settings.name || 'CeuMilan',
    logoUrl: settings.logoUrl || '',
    address: settings.address || '',
    phone: settings.phone || '',
    showLogoOnReceipt: settings.showLogoOnReceipt ?? true,
    showNameOnReceipt: settings.showNameOnReceipt ?? true,
    showAddressOnReceipt: settings.showAddressOnReceipt ?? true,
    showLogoInHeader: settings.showLogoInHeader ?? true,
    showLogoInSidebar: settings.showLogoInSidebar ?? true,
    receiptFooter: settings.receiptFooter || 'Terima kasih telah berbelanja!',
    onboardingCompleted: settings.onboardingCompleted ?? true
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await setSettings(formData);
      toast.success('Pengaturan profil toko berhasil disimpan! 🏪');
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyimpan pengaturan toko.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-[#1A1A2E]">Profil &amp; Pengaturan Toko</h2>
          <p className="text-xs text-gray-500 font-medium">Kelola identitas brand, nota cetak, dan pintasan sistem</p>
        </div>
        {onBack && (
          <Button variant="ghost" onClick={onBack} className="rounded-2xl font-bold text-xs gap-1">
            <ArrowLeft className="w-4 h-4" /> Kembali
          </Button>
        )}
      </div>

      {/* Quick Action Shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {onManageCategories && (
          <Card
            onClick={onManageCategories}
            className="border-none shadow-sm rounded-3xl bg-white p-5 cursor-pointer hover:shadow-md transition-shadow flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-sm text-[#1A1A2E]">Kelola Kategori &amp; Unit</h4>
                <p className="text-[11px] text-gray-400">Atur kelompok bahan HPP &amp; kategori produk</p>
              </div>
            </div>
          </Card>
        )}

        {onManageBackup && (
          <Card
            onClick={onManageBackup}
            className="border-none shadow-sm rounded-3xl bg-white p-5 cursor-pointer hover:shadow-md transition-shadow flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-sm text-[#1A1A2E]">Backup &amp; Restore Data</h4>
                <p className="text-[11px] text-gray-400">Simpan database .json ke HP/Laptop</p>
              </div>
            </div>
          </Card>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-none shadow-sm rounded-3xl bg-white">
          <CardHeader>
            <CardTitle className="text-base font-black flex items-center gap-2">
              <Store className="w-5 h-5 text-primary" /> Identitas Toko
            </CardTitle>
            <CardDescription className="text-xs">Informasi utama toko Anda</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-700">Nama Toko / Usaha</Label>
              <Input
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Misal: CeuMilan Culinary"
                className="rounded-2xl"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-gray-700">URL Logo Toko (Gambar)</Label>
              <Input
                value={formData.logoUrl || ''}
                onChange={e => setFormData({ ...formData, logoUrl: e.target.value })}
                placeholder="https://example.com/logo.png"
                className="rounded-2xl"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-700">Nomor Telepon / WA Toko</Label>
                <Input
                  value={formData.phone || ''}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="08123456789"
                  className="rounded-2xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-gray-700">Alamat Singkat Toko</Label>
                <Input
                  value={formData.address || ''}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Bandung, Jawa Barat"
                  className="rounded-2xl"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-3xl bg-white">
          <CardHeader>
            <CardTitle className="text-base font-black flex items-center gap-2">
              <ReceiptText className="w-5 h-5 text-primary" /> Tampilan Nota &amp; Header
            </CardTitle>
            <CardDescription className="text-xs">Sesuaikan informasi yang muncul di cetakan nota kasir &amp; UI</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
              <div>
                <p className="font-bold text-xs text-gray-900">Tampilkan Nama di Nota</p>
                <p className="text-[10px] text-gray-500">Cetak nama toko di bagian atas struk</p>
              </div>
              <Switch
                checked={formData.showNameOnReceipt}
                onCheckedChange={checked => setFormData({ ...formData, showNameOnReceipt: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
              <div>
                <p className="font-bold text-xs text-gray-900">Tampilkan Alamat di Nota</p>
                <p className="text-[10px] text-gray-500">Cetak alamat toko di bawah nama toko</p>
              </div>
              <Switch
                checked={formData.showAddressOnReceipt}
                onCheckedChange={checked => setFormData({ ...formData, showAddressOnReceipt: checked })}
              />
            </div>

            <div className="space-y-1.5 pt-2">
              <Label className="text-xs font-bold text-gray-700">Pesan Catatan Kaki Nota (Footer)</Label>
              <Input
                value={formData.receiptFooter || ''}
                onChange={e => setFormData({ ...formData, receiptFooter: e.target.value })}
                placeholder="Terima kasih telah berbelanja!"
                className="rounded-2xl"
              />
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
          disabled={isSaving}
          className="w-full orange-gradient text-white font-black rounded-2xl h-12 text-sm shadow-md shadow-orange-200 gap-2"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Menyimpan...' : 'Simpan Perubahan Pengaturan'}
        </Button>
      </form>
    </div>
  );
}
