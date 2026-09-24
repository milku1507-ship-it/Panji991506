import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import {
  ShoppingBag,
  Upload,
  FileSpreadsheet,
  Archive,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ArrowRight,
  RefreshCw,
  TrendingUp,
  DollarSign,
  Package,
  Truck,
  RotateCcw,
  Sparkles,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { Product, Ingredient } from '../types';
import {
  parseOrderCompleteFiles,
  parseIncomeReleasedFiles,
  parseRtsRrArchive,
  runShopeeAuditEngine,
  ShopeeAuditResult,
  normalizeSKU,
} from '../lib/shopeeAuditEngine';
import * as XLSX from 'xlsx';

interface ShopeeAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  ingredients: Ingredient[];
  onCommitAudit: (
    audit: ShopeeAuditResult,
    mappedNewSkus?: { productId: string; variantId: string; sku: string }[]
  ) => Promise<void>;
}

export const ShopeeAuditModal: React.FC<ShopeeAuditModalProps> = ({
  isOpen,
  onClose,
  products,
  ingredients,
  onCommitAudit,
}) => {
  // Upload States
  const [orderFiles, setOrderFiles] = useState<File[]>([]);
  const [incomeFiles, setIncomeFiles] = useState<File[]>([]);
  const [rtsArchiveFile, setRtsArchiveFile] = useState<File | null>(null);

  // Manual Inputs
  const [biayaIklanManual, setBiayaIklanManual] = useState<string>('');
  const [biayaOperasionalManual, setBiayaOperasionalManual] = useState<string>('');

  // Processing & Results
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [auditResult, setAuditResult] = useState<ShopeeAuditResult | null>(null);
  const [activeTab, setActiveTab] = useState<'variants' | 'discrepancies' | 'rts'>('variants');
  const [isCommitting, setIsCommitting] = useState<boolean>(false);

  // Raw parsed datasets cached for re-running if user maps SKUs
  const [rawOrders, setRawOrders] = useState<any[]>([]);
  const [rawIncome, setRawIncome] = useState<any[]>([]);
  const [rawRts, setRawRts] = useState<any[]>([]);

  // SKU Quick-Mapping State
  const [skuMapping, setSkuMapping] = useState<Record<string, { productId: string; variantId: string }>>({});
  const [saveSkuToDb, setSaveSkuToDb] = useState<boolean>(true);

  // Reset state on close
  const handleDialogClose = () => {
    if (isProcessing || isCommitting) return;
    onClose();
  };

  const formatCurrency = (val: number, isRp: boolean = true) => {
    const formatted = new Intl.NumberFormat('id-ID', {
      maximumFractionDigits: 0,
    }).format(Math.round(val || 0));
    return isRp ? `Rp ${formatted}` : formatted;
  };

  // Handle parsing
  const handleStartAudit = async () => {
    if (orderFiles.length === 0) {
      toast.error('Slot 1 wajib diisi', {
        description: 'Lampirkan minimal file Order Complete (.xlsx).',
      });
      return;
    }
    if (incomeFiles.length === 0) {
      toast.error('Slot 2 wajib diisi', {
        description: 'Lampirkan file Income Released (Dana Dilepas) (.xlsx).',
      });
      return;
    }

    setIsProcessing(true);
    toast.info('Memproses & Mengaudit Berkas Shopee...', { duration: 3000 });

    try {
      // 1. Parse Order Complete Files
      const parsedOrders = await parseOrderCompleteFiles(orderFiles);
      setRawOrders(parsedOrders);

      // 2. Parse Income Released Files
      const parsedIncome = await parseIncomeReleasedFiles(incomeFiles);
      setRawIncome(parsedIncome);

      // 3. Parse RTS/RR Archive if uploaded
      let parsedRts: any[] = [];
      if (rtsArchiveFile) {
        parsedRts = await parseRtsRrArchive(rtsArchiveFile, ingredients, products);
        setRawRts(parsedRts);
      }

      // 4. Run calculation engine
      const adsManualNum = Number(biayaIklanManual) || 0;
      const opManualNum = Number(biayaOperasionalManual) || 0;

      const result = runShopeeAuditEngine({
        orders: parsedOrders,
        incomeItems: parsedIncome,
        rtsRrItems: parsedRts,
        products,
        ingredients,
        biayaIklanManual: adsManualNum,
        biayaOperasionalManual: opManualNum,
        manualSkuMap: skuMapping,
      });

      setAuditResult(result);

      if (result.unmappedSkus.length > 0) {
        toast.warning(
          `Ditemukan ${result.unmappedSkus.length} SKU yang belum terdaftar di aplikasi`,
          { description: 'Silakan petakan SKU ke produk/varian di bawah ini.' }
        );
      } else {
        toast.success('Audit Keuangan & Deteksi Kerugian Selesai!');
      }
    } catch (err) {
      console.error('Audit Engine Error:', err);
      toast.error('Gagal memproses berkas Shopee', {
        description: 'Pastikan file Excel yang diunggah adalah berkas resmi dari Shopee Seller Center.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Re-run audit with updated SKU mappings
  const handleApplySkuMapping = () => {
    if (!rawOrders.length) return;
    setIsProcessing(true);
    try {
      const adsManualNum = Number(biayaIklanManual) || 0;
      const opManualNum = Number(biayaOperasionalManual) || 0;

      const result = runShopeeAuditEngine({
        orders: rawOrders,
        incomeItems: rawIncome,
        rtsRrItems: rawRts,
        products,
        ingredients,
        biayaIklanManual: adsManualNum,
        biayaOperasionalManual: opManualNum,
        manualSkuMap: skuMapping,
      });

      setAuditResult(result);
      toast.success('Kalkulasi diperbarui dengan pemetaan SKU!');
    } catch (err) {
      console.error(err);
      toast.error('Gagal memperbarui pemetaan SKU');
    } finally {
      setIsProcessing(false);
    }
  };

  // Commit audit to main app state and database
  const handleConfirmAndCommit = async () => {
    if (!auditResult) return;
    setIsCommitting(true);
    try {
      const mappedList: { productId: string; variantId: string; sku: string }[] = [];
      if (saveSkuToDb) {
        for (const [sku, mapping] of Object.entries(skuMapping)) {
          const m = mapping as { productId: string; variantId: string };
          if (m?.productId && m?.variantId) {
            mappedList.push({
              productId: m.productId,
              variantId: m.variantId,
              sku,
            });
          }
        }
      }

      await onCommitAudit(auditResult, mappedList);
      toast.success('Data Shopee berhasil diterapkan ke Catat Transaksi, Stok & Laporan!');
      onClose();
    } catch (err) {
      console.error('Commit Audit Error:', err);
      toast.error('Gagal menerapkan transaksi ke database.');
    } finally {
      setIsCommitting(false);
    }
  };

  // Copy helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} disalin ke clipboard!`);
  };

  // Copy all discrepancy order IDs
  const copyAllDiscrepancyOrderIds = () => {
    if (!auditResult || auditResult.discrepancies.length === 0) return;
    const ids = auditResult.discrepancies.map(d => d.orderId).join('\n');
    navigator.clipboard.writeText(ids);
    toast.success(`${auditResult.discrepancies.length} No. Pesanan Selisih Ongkir disalin!`);
  };

  // Copy all stuck RTS package IDs
  const copyAllStuckRts = () => {
    if (!auditResult) return;
    const stuck = auditResult.rtsPackages.filter(p => p.isStuck);
    if (stuck.length === 0) return;
    const text = stuck
      .map(p => `No. Resi: ${p.trackingNumber} | No. Pesanan: ${p.orderId} | Tertahan: ${p.daysStuck} hari`)
      .join('\n');
    navigator.clipboard.writeText(text);
    toast.success(`${stuck.length} Paket RTS/RR Tertahan disalin untuk Klaim!`);
  };

  // Export Audit to XLSX
  const exportAuditToExcel = () => {
    if (!auditResult) return;
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Ringkasan
      const summaryData = [
        ['Laporan Audit Finansial & Kerugian Shopee'],
        ['Periode', auditResult.periode],
        ['Waktu Audit', new Date(auditResult.createdAt).toLocaleString('id-ID')],
        ['Total Pesanan Selesai', auditResult.orderCount],
        ['Total Qty Terjual', `${auditResult.totalQtySold} pcs`],
        ['Total Omzet Toko (Gross)', auditResult.totalOmzetToko],
        ['Total Pendapatan Bersih Dilepas', auditResult.totalPendapatanDilepas],
        ['Total Biaya Admin & Layanan', auditResult.totalAdminLayanan],
        ['Total HPP Modal Terjual', auditResult.totalHppTerjual],
        ['Total Biaya Iklan (Inc. PPN 11%)', auditResult.totalBiayaIklanIncPpn],
        ['Biaya Operasional Tambahan', auditResult.biayaOperasionalManual],
        ['LABA BERSIH RIIL KONSOLIDASI', auditResult.labaBersihKonsolidasi],
        ['Margin Bersih (%)', `${auditResult.marginKonsolidasi.toFixed(2)}%`],
        ['Total Kerugian Selisih Ongkir', auditResult.totalDiscrepancyLoss],
        ['Total Potensi Kerugian Paket RTS Hilang', auditResult.totalRtsLoss],
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan Konsolidasi');

      // Sheet 2: Performa Varian
      const variantData = [
        ['SKU', 'Nama Produk', 'Nama Varian', 'Qty Terjual', 'Omzet (Rp)', 'HPP Modal / pcs', 'Total HPP', 'Alokasi Admin', 'Laba Bersih', 'Margin (%)'],
        ...auditResult.variantBreakdown.map(v => [
          v.sku,
          v.productName,
          v.variantName,
          v.qtyTerjual,
          v.omzetVarian,
          v.hppModalPerUnit,
          v.totalHppVarian,
          v.alokasiAdminVarian,
          v.labaBersihVarian,
          `${v.marginVarian.toFixed(1)}%`,
        ]),
      ];
      const wsVariant = XLSX.utils.aoa_to_sheet(variantData);
      XLSX.utils.book_append_sheet(wb, wsVariant, 'Laba per Varian');

      // Sheet 3: Selisih Ongkir
      const discData = [
        ['No. Pesanan', 'Tanggal', 'Ongkir Dibayar Pembeli', 'Ongkir Ditagihkan Ekspedisi', 'Selisih Kerugian (Rp)'],
        ...auditResult.discrepancies.map(d => [
          d.orderId,
          d.date,
          d.shippingBuyer,
          d.shippingCourier,
          d.discrepancy,
        ]),
      ];
      const wsDisc = XLSX.utils.aoa_to_sheet(discData);
      XLSX.utils.book_append_sheet(wb, wsDisc, 'Selisih Ongkir (Loss)');

      // Sheet 4: RTS / Retur
      const rtsData = [
        ['No. Resi', 'No. Pesanan', 'Status', 'Hari Tertahan', 'Alasan', 'SKU', 'Nama Produk', 'Jumlah', 'Nilai Kerugian (HPP)', 'Status Hilang (> 7 hari)'],
        ...auditResult.rtsPackages.map(r => [
          r.trackingNumber,
          r.orderId,
          r.status,
          r.daysStuck,
          r.reason,
          r.sku,
          r.productName,
          r.qty,
          r.lossValueHpp,
          r.isStuck ? 'YA (POTENSI HILANG)' : 'NORMAL',
        ]),
      ];
      const wsRts = XLSX.utils.aoa_to_sheet(rtsData);
      XLSX.utils.book_append_sheet(wb, wsRts, 'Paket RTS & Retur');

      XLSX.writeFile(wb, `Shopee_Financial_Audit_${Date.now()}.xlsx`);
      toast.success('Laporan Excel berhasil diunduh!');
    } catch (err) {
      console.error(err);
      toast.error('Gagal mengekspor file Excel');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-3xl bg-white border-none shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-6 bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                <ShoppingBag className="w-6 h-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black text-white flex items-center gap-2">
                  Shopee Automated Financial & Loss Audit Engine
                  <Sparkles className="w-4 h-4 text-amber-200 fill-amber-200" />
                </DialogTitle>
                <DialogDescription className="text-xs text-orange-100 font-medium">
                  Audit laba bersih riil, pencocokan SKU HPP otomatis, selisih ongkir, dan pelacakan paket RTS/RR hilang.
                </DialogDescription>
              </div>
            </div>
            {auditResult && (
              <Badge className="bg-white text-orange-700 font-black text-xs px-3 py-1">
                {auditResult.periode}
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!auditResult ? (
            /* STEP 1: UPLOAD SLOTS FORM */
            <div className="space-y-6">
              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-xs text-orange-800 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-orange-600" />
                  Panduan Berkas Shopee Seller Center:
                </p>
                <p className="text-[11px] leading-relaxed">
                  Unggah berkas mentah langsung dari Seller Center. Sistem otomatis menggabungkan multi-part files, mengekstrak arsip ZIP, mencocokkan SKU ke Master HPP internal, dan mendeteksi anomali kerugian.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Slot 1: Order Complete */}
                <Card className="border-2 border-dashed border-orange-200 hover:border-orange-400 transition-colors bg-white rounded-2xl overflow-hidden shadow-sm">
                  <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
                    <div className="space-y-2">
                      <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div>
                        <Label className="font-black text-xs text-gray-900 block">
                          Slot 1: Order Complete (.xlsx)
                        </Label>
                        <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                          Lampirkan file Pesanan Selesai (Bulan H-1 & H, atau Multi-Part).
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <input
                        type="file"
                        multiple
                        accept=".xlsx, .xls"
                        id="slot1-upload"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) {
                            setOrderFiles(Array.from(e.target.files));
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('slot1-upload')?.click()}
                        className="w-full h-9 rounded-xl border-orange-200 text-orange-700 hover:bg-orange-50 font-bold text-xs gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Pilih Berkas ({orderFiles.length})
                      </Button>
                      {orderFiles.length > 0 && (
                        <div className="max-h-20 overflow-y-auto space-y-1">
                          {orderFiles.map((f, i) => (
                            <div key={i} className="text-[10px] bg-orange-50/80 p-1.5 rounded-lg font-bold text-orange-900 truncate">
                              ✓ {f.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Slot 2: Income Released */}
                <Card className="border-2 border-dashed border-blue-200 hover:border-blue-400 transition-colors bg-white rounded-2xl overflow-hidden shadow-sm">
                  <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
                    <div className="space-y-2">
                      <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                        <DollarSign className="w-4 h-4" />
                      </div>
                      <div>
                        <Label className="font-black text-xs text-gray-900 block">
                          Slot 2: Income Released (.xlsx)
                        </Label>
                        <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                          File Penghasilan Saya status 'Sudah Dilepas' Bulan H.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <input
                        type="file"
                        multiple
                        accept=".xlsx, .xls"
                        id="slot2-upload"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) {
                            setIncomeFiles(Array.from(e.target.files));
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('slot2-upload')?.click()}
                        className="w-full h-9 rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50 font-bold text-xs gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Pilih Berkas ({incomeFiles.length})
                      </Button>
                      {incomeFiles.length > 0 && (
                        <div className="max-h-20 overflow-y-auto space-y-1">
                          {incomeFiles.map((f, i) => (
                            <div key={i} className="text-[10px] bg-blue-50/80 p-1.5 rounded-lg font-bold text-blue-900 truncate">
                              ✓ {f.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Slot 3: RTS / RR Archive */}
                <Card className="border-2 border-dashed border-purple-200 hover:border-purple-400 transition-colors bg-white rounded-2xl overflow-hidden shadow-sm">
                  <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
                    <div className="space-y-2">
                      <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
                        <Archive className="w-4 h-4" />
                      </div>
                      <div>
                        <Label className="font-black text-xs text-gray-900 block">
                          Slot 3: RTS & Retur (.zip/.xlsx)
                        </Label>
                        <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                          Arsip Gagal Kirim (RTS) & Pengembalian Barang (RR).
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <input
                        type="file"
                        accept=".zip, .rar, .xlsx, .xls"
                        id="slot3-upload"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setRtsArchiveFile(e.target.files[0]);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('slot3-upload')?.click()}
                        className="w-full h-9 rounded-xl border-purple-200 text-purple-700 hover:bg-purple-50 font-bold text-xs gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {rtsArchiveFile ? 'Ganti Berkas' : 'Pilih Berkas (.zip)'}
                      </Button>
                      {rtsArchiveFile && (
                        <div className="text-[10px] bg-purple-50/80 p-1.5 rounded-lg font-bold text-purple-900 truncate">
                          ✓ {rtsArchiveFile.name}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Optional Additional Cost Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-dashed border-gray-100">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-700">
                    Biaya Iklan Manual (Opsional)
                  </Label>
                  <Input
                    type="number"
                    placeholder="Contoh: 1500000"
                    value={biayaIklanManual}
                    onChange={(e) => setBiayaIklanManual(e.target.value)}
                    className="rounded-xl h-10 font-bold"
                  />
                  <p className="text-[10px] text-gray-400">
                    Sistem otomatis menghitung PPN 11% jika tidak ditarik dari potongan invoice penghasilan.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-700">
                    Biaya Operasional Tambahan (Opsional)
                  </Label>
                  <Input
                    type="number"
                    placeholder="Contoh: 500000"
                    value={biayaOperasionalManual}
                    onChange={(e) => setBiayaOperasionalManual(e.target.value)}
                    className="rounded-xl h-10 font-bold"
                  />
                  <p className="text-[10px] text-gray-400">
                    Biaya tambahan (packing khusus, gaji admin shopee, dll).
                  </p>
                </div>
              </div>

              <Button
                type="button"
                disabled={isProcessing || orderFiles.length === 0 || incomeFiles.length === 0}
                onClick={handleStartAudit}
                className="w-full h-12 rounded-2xl bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white font-black text-sm gap-2 shadow-lg shadow-orange-200"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sedang Memproses & Mengaudit Data...
                  </>
                ) : (
                  <>
                    Mulai Audit Finansial & Loss Detection
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          ) : (
            /* STEP 2 & 3: AUDIT RESULTS, QUICK-MAPPING, & EXECUTIVE SUMMARY */
            <div className="space-y-6">
              {/* Unmapped SKU Alert & Quick-Mapping */}
              {auditResult.unmappedSkus.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="font-black text-xs text-amber-900">
                          Ditemukan {auditResult.unmappedSkus.length} SKU Shopee Belum Terdaftar
                        </p>
                        <p className="text-[11px] text-amber-700">
                          Petakan ke varian produk aplikasi di bawah agar nilai HPP & profit dapat dihitung presisi.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleApplySkuMapping}
                      disabled={isProcessing}
                      className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-8"
                    >
                      {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Terapkan & Hitung Ulang'}
                    </Button>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {auditResult.unmappedSkus.map((u, idx) => (
                      <div key={idx} className="bg-white p-3 rounded-xl border border-amber-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                        <div className="space-y-0.5">
                          <span className="font-black text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-[11px]">
                            SKU: {u.sku}
                          </span>
                          <p className="text-gray-500 font-medium text-[11px] truncate max-w-xs">
                            {u.rawProductName} {u.rawVariantName && `(${u.rawVariantName})`}
                          </p>
                          <p className="text-[10px] text-amber-800 font-bold">
                            Terjual: {u.totalQty} pcs | Omzet: {formatCurrency(u.totalOmzet)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <select
                            value={skuMapping[u.sku] ? `${skuMapping[u.sku].productId}::${skuMapping[u.sku].variantId}` : ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val) {
                                const [pId, vId] = val.split('::');
                                setSkuMapping(prev => ({
                                  ...prev,
                                  [u.sku]: { productId: pId, variantId: vId }
                                }));
                              } else {
                                const updated = { ...skuMapping };
                                delete updated[u.sku];
                                setSkuMapping(updated);
                              }
                            }}
                            className="text-xs h-9 rounded-xl border border-gray-200 bg-white px-2 font-medium w-full md:w-64"
                          >
                            <option value="">-- Pilih Produk & Varian --</option>
                            {products.flatMap(p =>
                              p.varian.map(v => (
                                <option key={`${p.id}::${v.id}`} value={`${p.id}::${v.id}`}>
                                  {p.nama} - {v.nama} {v.sku ? `[${v.sku}]` : ''}
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 pt-1 text-[11px] text-amber-900 font-bold">
                    <input
                      type="checkbox"
                      id="saveSkuDb"
                      checked={saveSkuToDb}
                      onChange={(e) => setSaveSkuToDb(e.target.checked)}
                      className="rounded text-amber-600"
                    />
                    <label htmlFor="saveSkuDb" className="cursor-pointer">
                      Simpan SKU ini secara permanen ke varian produk di database aplikasi untuk audit berikutnya.
                    </label>
                  </div>
                </div>
              )}

              {/* Executive Consolidated Financial Summary Card */}
              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-6 shadow-xl space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                      Ringkasan Konsolidasi Toko
                    </span>
                    <h3 className="text-2xl font-black mt-0.5">
                      Laba Bersih: {formatCurrency(auditResult.labaBersihKonsolidasi)}
                    </h3>
                  </div>
                  <Badge className={auditResult.labaBersihKonsolidasi >= 0 ? 'bg-emerald-500 text-white text-xs font-black' : 'bg-red-500 text-white text-xs font-black'}>
                    Margin: {auditResult.marginKonsolidasi.toFixed(1)}% ({auditResult.labaBersihKonsolidasi >= 0 ? 'PROFIT' : 'RUGI'})
                  </Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-700/60 text-xs font-medium">
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold block">TOTAL OMZET (GROSS)</span>
                    <span className="text-base font-black text-white">{formatCurrency(auditResult.totalOmzetToko)}</span>
                    <span className="text-[10px] text-slate-400 block">{auditResult.totalQtySold} pcs terjual</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold block">DANA DILEPAS (NET RELEASE)</span>
                    <span className="text-base font-black text-emerald-400">{formatCurrency(auditResult.totalPendapatanDilepas)}</span>
                    <span className="text-[10px] text-slate-400 block">{auditResult.orderCount} pesanan selesai</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold block">TOTAL HPP MODAL</span>
                    <span className="text-base font-black text-amber-400">{formatCurrency(auditResult.totalHppTerjual)}</span>
                    <span className="text-[10px] text-slate-400 block">Sesuai resep HPP</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold block">BIAYA ADMIN & LAYANAN</span>
                    <span className="text-base font-black text-red-400">{formatCurrency(auditResult.totalAdminLayanan)}</span>
                    <span className="text-[10px] text-slate-400 block">Potongan resmi Shopee</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-700/60 text-xs font-medium">
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold block">BIAYA IKLAN (INC. PPN)</span>
                    <span className="text-sm font-black text-purple-300">{formatCurrency(auditResult.totalBiayaIklanIncPpn)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold block">BIAYA OPERASIONAL</span>
                    <span className="text-sm font-black text-gray-300">{formatCurrency(auditResult.biayaOperasionalManual)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold block">SELISIH ONGKIR (LOSS)</span>
                    <span className="text-sm font-black text-rose-400">{formatCurrency(auditResult.totalDiscrepancyLoss)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold block">POTENSI KERUGIAN RTS</span>
                    <span className="text-sm font-black text-amber-300">{formatCurrency(auditResult.totalRtsLoss)}</span>
                  </div>
                </div>
              </div>

              {/* Tabs for Details */}
              <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-4">
                <TabsList className="bg-gray-100 p-1 rounded-2xl grid grid-cols-3">
                  <TabsTrigger value="variants" className="rounded-xl font-bold text-xs">
                    <Package className="w-3.5 h-3.5 mr-1.5" />
                    Laba per Varian ({auditResult.variantBreakdown.length})
                  </TabsTrigger>
                  <TabsTrigger value="discrepancies" className="rounded-xl font-bold text-xs">
                    <Truck className="w-3.5 h-3.5 mr-1.5" />
                    Selisih Ongkir ({auditResult.discrepancies.length})
                  </TabsTrigger>
                  <TabsTrigger value="rts" className="rounded-xl font-bold text-xs">
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Paket RTS/RR ({auditResult.rtsPackages.length})
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Breakdown Varian */}
                <TabsContent value="variants" className="space-y-3">
                  <div className="overflow-x-auto rounded-2xl border border-gray-100">
                    <table className="w-full text-left text-xs font-medium">
                      <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-black border-b border-gray-100">
                        <tr>
                          <th className="p-3">SKU & Varian</th>
                          <th className="p-3 text-right">Terjual</th>
                          <th className="p-3 text-right">Omzet</th>
                          <th className="p-3 text-right">Total HPP</th>
                          <th className="p-3 text-right">Alokasi Admin</th>
                          <th className="p-3 text-right">Laba Bersih</th>
                          <th className="p-3 text-right">Margin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {auditResult.variantBreakdown.map((vb, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            <td className="p-3">
                              <span className="font-bold text-gray-900 block">{vb.productName} - {vb.variantName}</span>
                              <span className="text-[10px] text-gray-400 font-mono">SKU: {vb.sku || '-'}</span>
                            </td>
                            <td className="p-3 text-right font-black text-gray-800">{vb.qtyTerjual} pcs</td>
                            <td className="p-3 text-right font-bold text-gray-900">{formatCurrency(vb.omzetVarian)}</td>
                            <td className="p-3 text-right font-bold text-amber-700">{formatCurrency(vb.totalHppVarian)}</td>
                            <td className="p-3 text-right font-bold text-red-600">{formatCurrency(vb.alokasiAdminVarian)}</td>
                            <td className={`p-3 text-right font-black ${vb.labaBersihVarian >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {formatCurrency(vb.labaBersihVarian)}
                            </td>
                            <td className="p-3 text-right">
                              <Badge className={`text-[10px] font-black ${vb.marginVarian >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                {vb.marginVarian.toFixed(1)}%
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* Tab 2: Selisih Ongkir */}
                <TabsContent value="discrepancies" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 font-medium">
                      Transaksi di mana ongkir ditagihkan kurir lebih besar daripada dibayar pembeli.
                    </p>
                    {auditResult.discrepancies.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={copyAllDiscrepancyOrderIds}
                        className="rounded-xl h-8 text-xs font-bold gap-1 text-orange-600 border-orange-200"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Salin Semua No. Pesanan
                      </Button>
                    )}
                  </div>

                  {auditResult.discrepancies.length === 0 ? (
                    <div className="p-8 text-center bg-emerald-50 rounded-2xl text-emerald-700 text-xs font-bold">
                      ✓ Tidak ada selisih ongkir yang merugikan toko pada periode ini!
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-gray-100 max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs font-medium">
                        <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-black sticky top-0 border-b border-gray-100">
                          <tr>
                            <th className="p-3">No. Pesanan</th>
                            <th className="p-3">Tanggal</th>
                            <th className="p-3 text-right">Ongkir Pembeli</th>
                            <th className="p-3 text-right">Ongkir Ekspedisi</th>
                            <th className="p-3 text-right">Selisih Rugi</th>
                            <th className="p-3 text-center">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {auditResult.discrepancies.map((d, idx) => (
                            <tr key={idx} className="hover:bg-gray-50/50">
                              <td className="p-3 font-mono font-bold text-gray-800">{d.orderId}</td>
                              <td className="p-3 text-gray-500">{d.date}</td>
                              <td className="p-3 text-right">{formatCurrency(d.shippingBuyer)}</td>
                              <td className="p-3 text-right text-red-600 font-bold">{formatCurrency(d.shippingCourier)}</td>
                              <td className="p-3 text-right font-black text-rose-600">{formatCurrency(d.discrepancy)}</td>
                              <td className="p-3 text-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(d.orderId, 'No. Pesanan')}
                                  className="h-7 px-2 text-[10px] font-bold text-orange-600 hover:bg-orange-50 rounded-lg gap-1"
                                >
                                  <Copy className="w-3 h-3" />
                                  Salin ID
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* Tab 3: RTS / RR */}
                <TabsContent value="rts" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 font-medium">
                      Pelacakan paket Gagal Kirim (RTS) dan Retur. Paket yang tertahan &gt; 7 hari ditandai berpotensi hilang.
                    </p>
                    {auditResult.rtsPackages.some(p => p.isStuck) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={copyAllStuckRts}
                        className="rounded-xl h-8 text-xs font-bold gap-1 text-purple-600 border-purple-200"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Salin Paket Tertahan untuk Klaim
                      </Button>
                    )}
                  </div>

                  {auditResult.rtsPackages.length === 0 ? (
                    <div className="p-8 text-center bg-gray-50 rounded-2xl text-gray-500 text-xs font-bold">
                      Tidak ada data RTS/RR atau berkas Slot 3 tidak dilampirkan.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-gray-100 max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs font-medium">
                        <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-black sticky top-0 border-b border-gray-100">
                          <tr>
                            <th className="p-3">No. Resi & Pesanan</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Tertahan</th>
                            <th className="p-3">Produk & SKU</th>
                            <th className="p-3 text-right">Nilai Rugi HPP</th>
                            <th className="p-3 text-center">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {auditResult.rtsPackages.map((r, idx) => (
                            <tr key={idx} className={r.isStuck ? 'bg-red-50/40 hover:bg-red-50/60' : 'hover:bg-gray-50/50'}>
                              <td className="p-3">
                                <span className="font-mono font-bold text-gray-900 block">{r.trackingNumber}</span>
                                <span className="text-[10px] text-gray-400 font-mono">Order: {r.orderId}</span>
                              </td>
                              <td className="p-3">
                                <Badge className={r.isStuck ? 'bg-red-500 text-white text-[10px]' : 'bg-gray-100 text-gray-700 text-[10px]'}>
                                  {r.status}
                                </Badge>
                              </td>
                              <td className="p-3">
                                <span className={`font-black ${r.isStuck ? 'text-red-600' : 'text-gray-700'}`}>
                                  {r.daysStuck} hari
                                </span>
                                {r.isStuck && (
                                  <span className="block text-[9px] font-black text-red-500 uppercase animate-pulse">
                                    Potensi Hilang
                                  </span>
                                )}
                              </td>
                              <td className="p-3">
                                <span className="font-bold text-gray-900 block truncate max-w-xs">{r.productName || r.sku}</span>
                                <span className="text-[10px] text-gray-500">Qty: {r.qty} pcs</span>
                              </td>
                              <td className="p-3 text-right font-black text-amber-700">
                                {formatCurrency(r.lossValueHpp)}
                              </td>
                              <td className="p-3 text-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(r.trackingNumber, 'No. Resi')}
                                  className="h-7 px-2 text-[10px] font-bold text-purple-600 hover:bg-purple-50 rounded-lg gap-1"
                                >
                                  <Copy className="w-3 h-3" />
                                  Salin Resi
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {/* Bottom Actions */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAuditResult(null)}
                    className="rounded-2xl h-11 text-xs font-bold border-gray-200"
                  >
                    Unggah Berkas Baru
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={exportAuditToExcel}
                    className="rounded-2xl h-11 text-xs font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    Unduh Excel (.xlsx)
                  </Button>
                </div>

                <Button
                  type="button"
                  disabled={isCommitting}
                  onClick={handleConfirmAndCommit}
                  className="w-full md:w-auto h-12 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm gap-2 shadow-lg shadow-emerald-200"
                >
                  {isCommitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Menerapkan ke Database & Stok...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Simpan & Terapkan ke Sistem (Transaksi & Stok)
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
export default ShopeeAuditModal;
