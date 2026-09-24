import React, { useState, useMemo } from 'react';
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
  X,
  Search,
  Receipt,
  CheckSquare,
  Square,
  Layers,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  ExternalLink,
  FileText,
  FileDown,
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
  parseIdAmount,
  parseShopeeDate,
  OrderCompleteItem,
  UnmappedSku,
} from '../lib/shopeeAuditEngine';
import * as XLSX from 'xlsx';

export interface ProposedTransaction {
  id: string;
  orderId: string;
  tanggal: string;
  jenis: 'Pemasukan' | 'Pengeluaran';
  kategori: string;
  keterangan: string;
  nominal: number;
  total_penjualan: number;
  penjualan_detail?: Array<{
    produk_id: string;
    produk_nama: string;
    varian: Array<{
      varian_id: string;
      varian_nama: string;
      qty: number;
      harga: number;
      sku?: string;
    }>;
  }>;
  qty_total: number;
  unmatchedItemsCount: number;
  selected: boolean;
  itemSummary: string;
  rawItems: any[];
}

export interface ShopeeAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  ingredients: Ingredient[];
  onCommitAudit: (
    audit: ShopeeAuditResult,
    mappedNewSkus?: { productId: string; variantId: string; sku: string }[]
  ) => Promise<void>;
  onCommitTransactions?: (
    transactions: any[],
    mappedNewSkus?: { productId: string; variantId: string; sku: string }[]
  ) => Promise<void>;
}

export const ShopeeAuditModal: React.FC<ShopeeAuditModalProps> = ({
  isOpen,
  onClose,
  products,
  ingredients,
  onCommitAudit,
  onCommitTransactions,
}) => {
  // Workflow Mode
  const [workflowMode, setWorkflowMode] = useState<'slot1_orders' | 'multi_slot_audit' | 'general_cash'>('slot1_orders');
  // View Step: 'upload' = Slot selection; 'preview' = Review & Approval screen
  const [viewStep, setViewStep] = useState<'upload' | 'preview'>('upload');

  // Uploaded Files State
  const [orderFiles, setOrderFiles] = useState<File[]>([]);
  const [incomeFiles, setIncomeFiles] = useState<File[]>([]);
  const [rtsArchiveFile, setRtsArchiveFile] = useState<File | null>(null);
  const [generalCashFile, setGeneralCashFile] = useState<File | null>(null);

  // Manual Inputs (for Shopee Multi-Slot Audit)
  const [biayaIklanManual, setBiayaIklanManual] = useState<string>('');
  const [biayaOperasionalManual, setBiayaOperasionalManual] = useState<string>('');

  // Processing & State
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);

  // Multi-Slot Audit Result
  const [auditResult, setAuditResult] = useState<ShopeeAuditResult | null>(null);
  const [auditActiveTab, setAuditActiveTab] = useState<'variants' | 'discrepancies' | 'rts'>('variants');

  // Single-Slot Orders or General Cash Proposed Transactions
  const [proposedTransactions, setProposedTransactions] = useState<ProposedTransaction[]>([]);
  const [rawOrderCompleteItems, setRawOrderCompleteItems] = useState<OrderCompleteItem[]>([]);
  const [unmappedSkusList, setUnmappedSkusList] = useState<UnmappedSku[]>([]);

  // Raw parsed cache for re-runs
  const [rawOrders, setRawOrders] = useState<any[]>([]);
  const [rawIncome, setRawIncome] = useState<any[]>([]);
  const [rawRts, setRawRts] = useState<any[]>([]);

  // SKU Quick-Mapping State
  const [skuMapping, setSkuMapping] = useState<Record<string, { productId: string; variantId: string }>>({});
  const [saveSkuToDb, setSaveSkuToDb] = useState<boolean>(true);

  // Search & Filter in Preview
  const [previewSearch, setPreviewSearch] = useState<string>('');

  // Expandable Shopee Seller Center Step-by-Step Guide
  const [showShopeeGuide, setShowShopeeGuide] = useState<boolean>(false);

  // Template download for Buku Kas Umum (.xlsx)
  const downloadCashbookTemplate = () => {
    try {
      const wb = XLSX.utils.book_new();
      const sampleData = [
        ['Tanggal', 'Jenis', 'Kategori', 'Nominal', 'Keterangan'],
        ['2026-09-01', 'Pemasukan', 'Penjualan', 500000, 'Penjualan produk offline toko'],
        ['2026-09-02', 'Pengeluaran', 'Bahan Baku', 150000, 'Beli ayam filet 4.5kg & bumbu'],
        ['2026-09-02', 'Pengeluaran', 'Packing', 35000, 'Beli standing pouch & kardus'],
        ['2026-09-03', 'Pengeluaran', 'Operasional', 20000, 'Beli gas elpiji 3kg'],
        ['2026-09-04', 'Pengeluaran', 'Gaji', 250000, 'Upah harian tim produksi'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(sampleData);
      ws['!cols'] = [{ wch: 14 }, { wch: 15 }, { wch: 18 }, { wch: 14 }, { wch: 34 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Template Buku Kas');
      XLSX.writeFile(wb, 'Template_Buku_Kas_Ceumilan.xlsx');
      toast.success('Template Buku Kas berhasil diunduh!');
    } catch (err) {
      console.error(err);
      toast.error('Gagal mengunduh template Excel');
    }
  };

  // Reset or Close
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

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Helper to group parsed OrderComplete items into ProposedTransaction[]
  const buildTransactionsFromOrders = (
    orderItems: OrderCompleteItem[],
    currentProducts: Product[],
    mapping: Record<string, { productId: string; variantId: string }>
  ) => {
    // 1. Build lookup tables
    const dbProducts = currentProducts.map(p => ({ ...p, normSku: normalizeSKU(p.sku) }));
    const productBySku = new Map<string, typeof dbProducts[number]>();
    for (const p of dbProducts) {
      if (p.normSku) productBySku.set(p.normSku, p);
    }

    const variantBySku = new Map<string, { product: typeof dbProducts[number]; variant: typeof dbProducts[number]['varian'][number] }>();
    for (const p of dbProducts) {
      for (const v of p.varian) {
        const vs = normalizeSKU(v.sku || '');
        if (vs) variantBySku.set(vs, { product: p, variant: v });
      }
    }

    const unmappedMap = new Map<string, UnmappedSku>();
    const orderGroups = new Map<string, {
      orderId: string;
      tanggal: string;
      items: Array<{
        produk_id: string;
        produk_nama: string;
        varian_id: string;
        varian_nama: string;
        qty: number;
        harga: number;
        sku: string;
        isMatched: boolean;
      }>;
      totalPayment: number;
    }>();

    for (const item of orderItems) {
      // Abaikan status pesanan dibatalkan
      const statusLower = (item.status || '').toLowerCase();
      if (statusLower.includes('batal') || statusLower.includes('cancel')) {
        continue;
      }

      const rawSku = item.sku || '';
      const normSku = normalizeSKU(rawSku);

      let matchedProduct: Product | undefined;
      let matchedVariant: any | undefined;
      let isMatched = false;

      // 1) Manual mapping override
      if (mapping[rawSku]) {
        const m = mapping[rawSku];
        matchedProduct = currentProducts.find(p => p.id === m.productId);
        matchedVariant = matchedProduct?.varian.find(v => v.id === m.variantId);
        if (matchedProduct && matchedVariant) isMatched = true;
      }

      // 2) Exact variant SKU
      if (!isMatched && normSku && variantBySku.has(normSku)) {
        const mv = variantBySku.get(normSku)!;
        matchedProduct = mv.product;
        matchedVariant = mv.variant;
        isMatched = true;
      }

      // 3) Parent product SKU
      if (!isMatched && normSku && productBySku.has(normSku)) {
        matchedProduct = productBySku.get(normSku);
        if (matchedProduct) {
          // match variant by name or first variant
          const rawVarNorm = normalizeSKU(item.rawVariantName);
          matchedVariant = matchedProduct.varian.find(v => normalizeSKU(v.nama) === rawVarNorm)
            || matchedProduct.varian[0];
          isMatched = true;
        }
      }

      if (!isMatched && rawSku) {
        const existing = unmappedMap.get(rawSku) || {
          sku: rawSku,
          rawProductName: item.rawProductName || 'Produk Tanpa Nama',
          rawVariantName: item.rawVariantName || '-',
          totalQty: 0,
          totalOmzet: 0,
        };
        existing.totalQty += item.qty;
        existing.totalOmzet += item.totalPrice;
        unmappedMap.set(rawSku, existing);
      }

      const prodId = matchedProduct ? matchedProduct.id : `unmapped-${rawSku || 'item'}`;
      const prodNama = matchedProduct ? matchedProduct.nama : (item.rawProductName || 'Produk Belum Terdaftar');
      const varId = matchedVariant ? matchedVariant.id : `var-${rawSku || 'default'}`;
      const varNama = matchedVariant ? matchedVariant.nama : (item.rawVariantName || 'Standar');
      const itemHarga = item.price > 0 ? item.price : (item.qty > 0 ? Math.round(item.totalPrice / item.qty) : 0);

      if (!orderGroups.has(item.orderId)) {
        orderGroups.set(item.orderId, {
          orderId: item.orderId,
          tanggal: item.orderDate || new Date().toISOString().split('T')[0],
          items: [],
          totalPayment: 0,
        });
      }

      const grp = orderGroups.get(item.orderId)!;
      grp.items.push({
        produk_id: prodId,
        produk_nama: prodNama,
        varian_id: varId,
        varian_nama: varNama,
        qty: item.qty,
        harga: itemHarga,
        sku: rawSku,
        isMatched,
      });
      grp.totalPayment += item.totalPrice;
    }

    const txs: ProposedTransaction[] = [];
    for (const [orderId, grp] of orderGroups.entries()) {
      const shortId = orderId.length > 12 ? orderId.slice(-8) : orderId;
      const itemSummary = grp.items
        .map(it => `${it.produk_nama}${it.varian_nama && it.varian_nama !== it.produk_nama ? ` (${it.varian_nama})` : ''} x${it.qty}`)
        .join(', ');
      const totalQty = grp.items.reduce((s, it) => s + it.qty, 0);
      const unmatchedCount = grp.items.filter(it => !it.isMatched).length;

      // Group per produk_id
      const prodMap = new Map<string, { produk_id: string; produk_nama: string; varian: any[] }>();
      for (const it of grp.items) {
        if (!prodMap.has(it.produk_id)) {
          prodMap.set(it.produk_id, {
            produk_id: it.produk_id,
            produk_nama: it.produk_nama,
            varian: [],
          });
        }
        prodMap.get(it.produk_id)!.varian.push({
          varian_id: it.varian_id,
          varian_nama: it.varian_nama,
          qty: it.qty,
          harga: it.harga,
          sku: it.sku,
        });
      }

      txs.push({
        id: `tx-order-${orderId}`,
        orderId,
        tanggal: grp.tanggal,
        jenis: 'Pemasukan',
        kategori: 'Penjualan',
        keterangan: `Pesanan #${shortId}: ${itemSummary}`,
        nominal: grp.totalPayment,
        total_penjualan: grp.totalPayment,
        penjualan_detail: Array.from(prodMap.values()),
        qty_total: totalQty,
        unmatchedItemsCount: unmatchedCount,
        selected: true,
        itemSummary,
        rawItems: grp.items,
      });
    }

    return {
      transactions: txs,
      unmappedSkus: Array.from(unmappedMap.values()),
    };
  };

  // Helper for General Cash Spreadsheet (.xlsx)
  const parseGeneralCashSpreadsheet = async (file: File): Promise<ProposedTransaction[]> => {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
    if (!rawRows || rawRows.length === 0) return [];

    const dateKeywords = ['TANGGAL', 'DATE', 'WAKTU', 'TGL'];
    const typeKeywords = ['JENIS', 'TIPE', 'ARUSKAS', 'TYPE'];
    const catKeywords = ['KATEGORI', 'CATEGORY', 'POS'];
    const descKeywords = ['KETERANGAN', 'DESKRIPSI', 'URAIAN', 'CATATAN', 'NOTE', 'MEMO', 'NAMA'];
    const amountKeywords = ['NOMINAL', 'JUMLAH', 'TOTAL', 'BIAYA', 'AMOUNT', 'DEBET', 'KREDIT', 'NILAI'];

    let headerIdx = -1;
    for (let i = 0; i < Math.min(rawRows.length, 25); i++) {
      const row = rawRows[i];
      if (!Array.isArray(row)) continue;
      const rowNorm = row.map(c => normalizeSKU(c));
      const hasDate = dateKeywords.some(k => rowNorm.some(c => c.includes(k)));
      const hasAmount = amountKeywords.some(k => rowNorm.some(c => c.includes(k)));
      if (hasDate && hasAmount) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) {
      throw new Error('Kolom Tanggal atau Nominal tidak ditemukan dalam berkas kas.');
    }

    const headerRow = rawRows[headerIdx].map(c => normalizeSKU(c));
    const findCol = (kw: string[]) => headerRow.findIndex(h => kw.some(k => h.includes(k)));

    const dateCol = findCol(dateKeywords);
    const typeCol = findCol(typeKeywords);
    const catCol = findCol(catKeywords);
    const descCol = findCol(descKeywords);
    const amountCol = findCol(amountKeywords);

    const rows = rawRows.slice(headerIdx + 1);
    const txs: ProposedTransaction[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!Array.isArray(r) || r.length === 0) continue;

      const rawAmount = amountCol !== -1 ? r[amountCol] : 0;
      const nominal = parseIdAmount(rawAmount);
      if (nominal <= 0) continue;

      const rawDate = dateCol !== -1 ? r[dateCol] : '';
      const tanggal = parseShopeeDate(rawDate);

      const rawType = typeCol !== -1 ? String(r[typeCol] ?? '').toLowerCase() : '';
      const jenis: 'Pemasukan' | 'Pengeluaran' = rawType.includes('masuk') || rawType.includes('in') || rawType.includes('income')
        ? 'Pemasukan'
        : 'Pengeluaran';

      const rawCat = catCol !== -1 ? String(r[catCol] ?? '').trim() : '';
      const kategori = rawCat || (jenis === 'Pemasukan' ? 'Penjualan' : 'Operasional');

      const rawDesc = descCol !== -1 ? String(r[descCol] ?? '').trim() : '';
      const keterangan = rawDesc || `Transaksi ${kategori}`;

      txs.push({
        id: `tx-kas-${i + 1}`,
        orderId: `KAS-${String(i + 1).padStart(4, '0')}`,
        tanggal,
        jenis,
        kategori,
        keterangan,
        nominal,
        total_penjualan: jenis === 'Pemasukan' ? nominal : 0,
        qty_total: 0,
        unmatchedItemsCount: 0,
        selected: true,
        itemSummary: keterangan,
        rawItems: [r],
      });
    }

    return txs;
  };

  // Execution: Process Files based on Mode
  const handleProcessFiles = async () => {
    setIsProcessing(true);
    try {
      if (workflowMode === 'slot1_orders') {
        // MODE 1: Slot 1 Orders Only
        if (orderFiles.length === 0) {
          toast.error('Berkas Slot 1 belum dipilih', {
            description: 'Silakan pilih berkas Pesanan Selesai / Order Complete (.xlsx/.xls).',
          });
          setIsProcessing(false);
          return;
        }

        toast.info('Mengekstrak data pesanan & mencocokkan SKU...', { duration: 2500 });
        const parsedOrders = await parseOrderCompleteFiles(orderFiles);
        if (parsedOrders.length === 0) {
          toast.error('Tidak ada pesanan valid yang terbaca dari berkas yang diunggah.');
          setIsProcessing(false);
          return;
        }

        setRawOrderCompleteItems(parsedOrders);
        const { transactions, unmappedSkus } = buildTransactionsFromOrders(parsedOrders, products, skuMapping);
        setProposedTransactions(transactions);
        setUnmappedSkusList(unmappedSkus);
        setViewStep('preview');

        if (unmappedSkus.length > 0) {
          toast.warning(`Ditemukan ${unmappedSkus.length} SKU baru belum terdaftar`, {
            description: 'Anda dapat memetakan SKU ke produk toko di layar tinjauan.',
          });
        } else {
          toast.success(`Berhasil memuat ${transactions.length} pesanan siap ditinjau!`);
        }
      } else if (workflowMode === 'multi_slot_audit') {
        // MODE 2: Full Shopee Multi-Slot Audit
        if (orderFiles.length === 0) {
          toast.error('Slot 1 belum dipilih', {
            description: 'Lampirkan file Order Complete (.xlsx).',
          });
          setIsProcessing(false);
          return;
        }

        // Jika hanya ada Slot 1 dan user lupa Slot 2, tawarkan opsi beralih ke Mode 1
        if (incomeFiles.length === 0) {
          toast.info('File Income Released (Slot 2) tidak ditemukan.', {
            description: 'Beralih memproses berkas sebagai Impor Pesanan Selesai...',
          });
          const parsedOrders = await parseOrderCompleteFiles(orderFiles);
          setRawOrderCompleteItems(parsedOrders);
          const { transactions, unmappedSkus } = buildTransactionsFromOrders(parsedOrders, products, skuMapping);
          setProposedTransactions(transactions);
          setUnmappedSkusList(unmappedSkus);
          setWorkflowMode('slot1_orders');
          setViewStep('preview');
          setIsProcessing(false);
          return;
        }

        toast.info('Memproses & Mengaudit Berkas Multi-Slot Shopee...', { duration: 3000 });
        const parsedOrders = await parseOrderCompleteFiles(orderFiles);
        setRawOrders(parsedOrders);

        const parsedIncome = await parseIncomeReleasedFiles(incomeFiles);
        setRawIncome(parsedIncome);

        let parsedRts: any[] = [];
        if (rtsArchiveFile) {
          parsedRts = await parseRtsRrArchive(rtsArchiveFile, ingredients, products);
          setRawRts(parsedRts);
        }

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
        setViewStep('preview');

        if (result.unmappedSkus.length > 0) {
          toast.warning(`Ditemukan ${result.unmappedSkus.length} SKU belum terdaftar`, {
            description: 'Petakan SKU agar nilai HPP & Laba Konsolidasi akurat.',
          });
        } else {
          toast.success('Audit Keuangan & Deteksi Kerugian Selesai!');
        }
      } else if (workflowMode === 'general_cash') {
        // MODE 3: General Cash Spreadsheet
        if (!generalCashFile) {
          toast.error('Berkas Buku Kas belum dipilih', {
            description: 'Silakan pilih berkas Excel rekap transaksi keuangan (.xlsx/.xls).',
          });
          setIsProcessing(false);
          return;
        }

        toast.info('Membaca berkas buku kas...');
        const txs = await parseGeneralCashSpreadsheet(generalCashFile);
        if (txs.length === 0) {
          toast.error('Tidak ada baris transaksi yang dapat dibaca dari berkas ini.');
          setIsProcessing(false);
          return;
        }
        setProposedTransactions(txs);
        setUnmappedSkusList([]);
        setViewStep('preview');
        toast.success(`Berhasil memuat ${txs.length} baris transaksi kas!`);
      }
    } catch (err: any) {
      console.error('Import Processing Error:', err);
      toast.error('Gagal memproses berkas Excel', {
        description: err?.message || 'Pastikan format kolom berkas sesuai panduan.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Re-run mapping for Slot 1 Orders
  const handleApplyOrderSkuMapping = () => {
    if (!rawOrderCompleteItems.length) return;
    setIsProcessing(true);
    try {
      const { transactions, unmappedSkus } = buildTransactionsFromOrders(rawOrderCompleteItems, products, skuMapping);
      setProposedTransactions(transactions);
      setUnmappedSkusList(unmappedSkus);
      toast.success('Pemetaan SKU diterapkan & data pratinjau diperbarui!');
    } catch (err) {
      console.error(err);
      toast.error('Gagal memperbarui pemetaan SKU');
    } finally {
      setIsProcessing(false);
    }
  };

  // Re-run mapping for Multi-Slot Shopee Audit
  const handleApplyShopeeAuditSkuMapping = () => {
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

  // Toggle selection of proposed transactions
  const toggleSelectTransaction = (id: string) => {
    setProposedTransactions(prev =>
      prev.map(t => (t.id === id ? { ...t, selected: !t.selected } : t))
    );
  };

  const toggleSelectAll = (select: boolean) => {
    setProposedTransactions(prev => prev.map(t => ({ ...t, selected: select })));
  };

  // Filtered transactions in preview table
  const filteredProposedTxs = useMemo(() => {
    const q = previewSearch.toLowerCase().trim();
    if (!q) return proposedTransactions;
    return proposedTransactions.filter(
      t =>
        t.orderId.toLowerCase().includes(q) ||
        t.keterangan.toLowerCase().includes(q) ||
        t.tanggal.includes(q) ||
        t.kategori.toLowerCase().includes(q)
    );
  }, [proposedTransactions, previewSearch]);

  const selectedTransactionsCount = useMemo(() => {
    return proposedTransactions.filter(t => t.selected).length;
  }, [proposedTransactions]);

  const selectedTotalNominal = useMemo(() => {
    return proposedTransactions.filter(t => t.selected).reduce((s, t) => s + t.nominal, 0);
  }, [proposedTransactions]);

  const selectedTotalQty = useMemo(() => {
    return proposedTransactions.filter(t => t.selected).reduce((s, t) => s + t.qty_total, 0);
  }, [proposedTransactions]);

  // Mandatory User Approval & Commit to Database
  const handleUserApprovalCommit = async () => {
    setIsCommitting(true);
    try {
      // 1. Compile mapped SKUs list for permanent storage in HPP catalog if requested
      const mappedList: { productId: string; variantId: string; sku: string }[] = [];
      if (saveSkuToDb) {
        for (const [sku, mapping] of Object.entries(skuMapping) as [string, { productId: string; variantId: string }][]) {
          if (mapping?.productId && mapping?.variantId) {
            mappedList.push({
              productId: mapping.productId,
              variantId: mapping.variantId,
              sku,
            });
          }
        }
      }

      if (workflowMode === 'multi_slot_audit' && auditResult) {
        // Commit Shopee Full Audit
        await onCommitAudit(auditResult, mappedList);
        toast.success('Audit Shopee berhasil disetujui & disimpan ke database!', {
          description: 'Data omzet, biaya, dan stok produk telah diperbarui.',
        });
        onClose();
      } else {
        // Commit Selected Proposed Transactions
        const txsToSave = proposedTransactions.filter(t => t.selected);
        if (txsToSave.length === 0) {
          toast.error('Tidak ada transaksi yang dipilih untuk disimpan.');
          setIsCommitting(false);
          return;
        }

        if (onCommitTransactions) {
          await onCommitTransactions(txsToSave, mappedList);
        } else {
          toast.warning('Handler penyimpanan transaksi belum dikonfigurasi.');
        }
        onClose();
      }
    } catch (err: any) {
      console.error('Commit Error:', err);
      toast.error('Gagal menyimpan transaksi ke database', {
        description: err?.message || 'Periksa koneksi atau hak akses akun Anda.',
      });
    } finally {
      setIsCommitting(false);
    }
  };

  // Copy helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} disalin ke clipboard!`);
  };

  // Export Audit / Proposed Transactions to Excel
  const exportPreviewToExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      if (workflowMode === 'multi_slot_audit' && auditResult) {
        // Full Audit Export
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
      } else {
        // Orders or General Cash Preview Export
        const rows = [
          ['No. Pesanan / ID', 'Tanggal', 'Jenis', 'Kategori', 'Keterangan Item', 'Total Qty', 'Nominal (Rp)', 'Status Persetujuan'],
          ...proposedTransactions.map(t => [
            t.orderId,
            t.tanggal,
            t.jenis,
            t.kategori,
            t.itemSummary,
            t.qty_total,
            t.nominal,
            t.selected ? 'Disetujui' : 'Dilewati',
          ]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Pratinjau Impor');
        XLSX.writeFile(wb, `Pratinjau_Import_Excel_${Date.now()}.xlsx`);
      }
      toast.success('Berkas Excel berhasil diunduh!');
    } catch (err) {
      console.error(err);
      toast.error('Gagal mengekspor file Excel');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-3xl bg-white border-none shadow-2xl">
        {/* Modern Modal Header */}
        <DialogHeader className="p-6 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 text-white shrink-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black text-white flex items-center gap-2">
                  Modal Import Excel (XLS / XLSX) & Rekonsiliasi
                  <Sparkles className="w-4 h-4 text-emerald-200 fill-emerald-200" />
                </DialogTitle>
                <DialogDescription className="text-xs text-emerald-100 font-medium">
                  {viewStep === 'upload'
                    ? 'Pilih slot berkas atau perintah impor, ekstrak data otomatis, dan tinjau sebelum disetujui.'
                    : 'Tinjau ringkasan pesanan & status SKU di bawah. Tekan tombol setujui untuk menyimpan ke database.'}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge className="bg-white/20 text-white border-none font-bold text-xs px-3 py-1">
                {viewStep === 'upload' ? 'Tahap 1: Pilih Slot Berkas' : 'Tahap 2: Tinjau & Setujui User'}
              </Badge>
              {auditResult && (
                <Badge className="bg-white text-emerald-800 font-black text-xs px-3 py-1">
                  {auditResult.periode}
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {viewStep === 'upload' ? (
            /* STEP 1: WORKFLOW COMMAND SELECTION & UPLOAD SLOTS */
            <div className="space-y-6">
              {/* Workflow / Command Tabs */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  PILIH PERINTAH / FORMAT IMPOR BERKAS:
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Option 1: Slot 1 Pesanan */}
                  <button
                    type="button"
                    onClick={() => setWorkflowMode('slot1_orders')}
                    className={`p-4 rounded-2xl text-left border-2 transition-all flex flex-col justify-between ${
                      workflowMode === 'slot1_orders'
                        ? 'border-emerald-600 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-500/20'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 font-black text-xs">
                          <Package className="w-4 h-4" />
                        </div>
                        <Badge className="bg-emerald-600 text-white text-[9px] font-black uppercase">
                          Rekomendasi
                        </Badge>
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-gray-900">Pesanan Selesai (Slot 1)</h4>
                        <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded mt-0.5">
                          File: Order.all...xlsx
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 leading-snug">
                        Impor pesanan Shopee/Tokopedia. Otomatis cocokkan SKU varian produk & potong stok bahan baku resep.
                      </p>
                    </div>
                  </button>

                  {/* Option 2: Multi-Slot Audit Shopee */}
                  <button
                    type="button"
                    onClick={() => setWorkflowMode('multi_slot_audit')}
                    className={`p-4 rounded-2xl text-left border-2 transition-all flex flex-col justify-between ${
                      workflowMode === 'multi_slot_audit'
                        ? 'border-orange-500 bg-orange-50/70 shadow-sm ring-2 ring-orange-500/20'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center text-orange-700 font-black text-xs">
                          <TrendingUp className="w-4 h-4" />
                        </div>
                        <Badge className="bg-orange-500 text-white text-[9px] font-black uppercase">
                          Lengkap
                        </Badge>
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-gray-900">Audit Shopee (Multi-Slot)</h4>
                        <span className="inline-block text-[10px] font-bold text-orange-700 bg-orange-100/80 px-2 py-0.5 rounded mt-0.5">
                          Pesanan + Penghasilan + Retur
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 leading-snug">
                        Rekonsiliasi omzet bersih riil, potongan biaya admin, selisih ongkir, dan paket retur/RTS.
                      </p>
                    </div>
                  </button>

                  {/* Option 3: Buku Kas Umum */}
                  <button
                    type="button"
                    onClick={() => setWorkflowMode('general_cash')}
                    className={`p-4 rounded-2xl text-left border-2 transition-all flex flex-col justify-between ${
                      workflowMode === 'general_cash'
                        ? 'border-blue-600 bg-blue-50/70 shadow-sm ring-2 ring-blue-500/20'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 font-black text-xs">
                          <Receipt className="w-4 h-4" />
                        </div>
                        <Badge className="bg-blue-600 text-white text-[9px] font-black uppercase">
                          Kas Toko
                        </Badge>
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-gray-900">Buku Kas Toko (.xlsx)</h4>
                        <span className="inline-block text-[10px] font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded mt-0.5">
                          Format Kas Bebas / Internal
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 leading-snug">
                        Impor tabel kas umum (Tanggal, Jenis, Kategori, Nominal, Keterangan). Tersedia template Excel siap pakai.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* COLLAPSIBLE SHOPEE SELLER CENTER GUIDE */}
              <div className="border border-emerald-200 bg-emerald-50/70 rounded-2xl overflow-hidden transition-all shadow-xs">
                <button
                  type="button"
                  onClick={() => setShowShopeeGuide(prev => !prev)}
                  className="w-full p-3.5 flex items-center justify-between text-left font-bold text-xs text-emerald-950 hover:bg-emerald-100/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>Panduan Lengkap: Di mana cara download file-file ini dari Shopee Seller Center?</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-black text-emerald-800 bg-white border border-emerald-300 px-3 py-1 rounded-xl shadow-2xs shrink-0">
                    <span>{showShopeeGuide ? 'Tutup Panduan' : 'Lihat Cara Download'}</span>
                    {showShopeeGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </div>
                </button>

                {showShopeeGuide && (
                  <div className="p-4 pt-2 border-t border-emerald-200/80 bg-white space-y-4">
                    <p className="text-xs text-gray-600">
                      Semua file ini bisa diunduh langsung dari komputer Anda melalui dashboard resmi Shopee Seller Center:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Step 1 Guide */}
                      <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-200 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-[10px]">
                            1
                          </span>
                          <span className="font-black text-xs text-emerald-950">File Pesanan Selesai (Slot 1)</span>
                        </div>
                        <p className="text-[11px] text-gray-700 leading-relaxed">
                          1. Buka <strong>seller.shopee.co.id</strong>.<br />
                          2. Pilih menu <strong>Pesanan Saya</strong>.<br />
                          3. Klik tab <strong>Selesai</strong>.<br />
                          4. Pilih rentang tanggal ➔ klik <strong>Ekspor</strong>.
                        </p>
                        <div className="p-2 bg-white rounded-xl border border-emerald-200 text-[10px] font-mono text-emerald-900 break-all">
                          📄 <strong>Contoh Nama File:</strong><br />
                          Order.all.20260901_20260930.xlsx
                        </div>
                      </div>

                      {/* Step 2 Guide */}
                      <div className="bg-blue-50/60 p-3.5 rounded-2xl border border-blue-200 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-[10px]">
                            2
                          </span>
                          <span className="font-black text-xs text-blue-950">File Penghasilan Dilepas (Slot 2)</span>
                        </div>
                        <p className="text-[11px] text-gray-700 leading-relaxed">
                          1. Buka menu <strong>Keuangan</strong> ➔ <strong>Penghasilan Saya</strong>.<br />
                          2. Klik tab <strong>Rincian Penghasilan</strong>.<br />
                          3. Filter status: pilih <strong>Sudah Dilepas</strong>.<br />
                          4. Pilih bulan ➔ klik tombol <strong>Ekspor</strong>.
                        </p>
                        <div className="p-2 bg-white rounded-xl border border-blue-200 text-[10px] font-mono text-blue-900 break-all">
                          📄 <strong>Contoh Nama File:</strong><br />
                          Income.released.20260901_20260930.xlsx
                        </div>
                      </div>

                      {/* Step 3 Guide */}
                      <div className="bg-purple-50/60 p-3.5 rounded-2xl border border-purple-200 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center font-black text-[10px]">
                            3
                          </span>
                          <span className="font-black text-xs text-purple-950">File Retur & RTS (Slot 3)</span>
                        </div>
                        <p className="text-[11px] text-gray-700 leading-relaxed">
                          1. Buka menu <strong>Pesanan Saya</strong>.<br />
                          2. Pilih sub-menu <strong>Pengembalian / Pembatalan</strong>.<br />
                          3. Klik tombol <strong>Ekspor</strong> (otomatis mengunduh berkas .zip atau .xlsx).
                        </p>
                        <div className="p-2 bg-white rounded-xl border border-purple-200 text-[10px] font-mono text-purple-900 break-all">
                          📄 <strong>Contoh Nama File:</strong><br />
                          Return_Refund_Archive.zip
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Informational Guidance */}
              <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-900 space-y-1.5">
                <p className="font-bold flex items-center gap-1.5 text-emerald-950">
                  <Info className="w-4 h-4 text-emerald-700 shrink-0" />
                  {workflowMode === 'slot1_orders' && 'Petunjuk Unggah Pesanan Selesai (Slot 1):'}
                  {workflowMode === 'multi_slot_audit' && 'Petunjuk Unggah Audit Finansial Shopee (Multi-Slot):'}
                  {workflowMode === 'general_cash' && 'Petunjuk Unggah Buku Kas Toko Excel:'}
                </p>
                <div className="text-[11px] leading-relaxed text-emerald-800 space-y-1">
                  {workflowMode === 'slot1_orders' && (
                    <>
                      <p>
                        • <strong>File yang diunggah:</strong> File Excel pesanan selesai (ekspor dari Shopee Seller Center: <em>Pesanan Saya ➔ Selesai ➔ Ekspor</em>).
                      </p>
                      <p>
                        • <strong>Keunggulan:</strong> Sistem membaca kolom <em>Nomor Referensi SKU</em> / <em>Kode Variasi</em>, <em>Jumlah Qty</em>, dan <em>Harga</em>. Stok bahan baku dan kemasan akan otomatis terpotong saat disetujui.
                      </p>
                      <p className="font-semibold text-emerald-900">
                        • <strong>Aman:</strong> Berkas TIDAK langsung masuk ke database. Anda dapat meninjau semua baris data di tahap pratinjau sebelum menyetujui.
                      </p>
                    </>
                  )}
                  {workflowMode === 'multi_slot_audit' && (
                    <>
                      <p>
                        • <strong>File yang diunggah:</strong> Minimal Slot 1 (Pesanan Selesai) &amp; Slot 2 (Penghasilan Dilepas). Slot 3 (Retur/RTS) bersifat opsional.
                      </p>
                      <p>
                        • <strong>Keunggulan:</strong> Mengkalkulasi laba bersih riil toko setelah biaya admin Shopee &amp; biaya iklan (inc. PPN 11%), margin per varian produk, audit selisih ongkir, dan melacak paket tertahan &gt; 7 hari.
                      </p>
                    </>
                  )}
                  {workflowMode === 'general_cash' && (
                    <>
                      <p>
                        • <strong>File yang diunggah:</strong> File Excel rekap kas toko internal Anda dengan baris judul seperti <em>Tanggal</em>, <em>Jenis</em> (Pemasukan/Pengeluaran), <em>Kategori</em>, <em>Nominal</em>, dan <em>Keterangan</em>.
                      </p>
                      <p>
                        • Jika Anda belum memiliki formatnya, silakan klik tombol <strong>"Unduh Template Excel (.xlsx)"</strong> di bawah untuk langsung menggunakan contoh tabel yang siap pakai.
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* UPLOAD SLOTS GRID */}
              {workflowMode === 'slot1_orders' && (
                /* SINGLE-SLOT: ORDER COMPLETE ONLY */
                <Card className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 transition-colors bg-white rounded-3xl overflow-hidden shadow-sm">
                  <CardContent className="p-6 space-y-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700 shadow-inner">
                          <Package className="w-6 h-6" />
                        </div>
                        <div>
                          <Label className="font-black text-sm text-gray-900 block">
                            Slot 1: Berkas Pesanan Selesai / Order Complete (.xlsx, .xls)
                          </Label>
                          <p className="text-xs text-gray-500 font-medium">
                            Laporan pesanan penjualan selesai dari Shopee Seller Center.
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-800 font-bold border-none text-[10px]">
                        Slot Utama
                      </Badge>
                    </div>

                    {/* Quick Guidance Tag Box */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100 text-[11px]">
                      <div>
                        <span className="font-bold text-emerald-950 block">📍 Menu di Shopee:</span>
                        <span className="text-gray-600">Pesanan Saya ➔ Selesai ➔ Ekspor</span>
                      </div>
                      <div>
                        <span className="font-bold text-emerald-950 block">📄 Contoh Nama File:</span>
                        <span className="font-mono text-emerald-800 font-bold text-[10px]">Order.all.2026xxxx.xlsx</span>
                      </div>
                      <div>
                        <span className="font-bold text-emerald-950 block">🔍 Kolom Kunci yang Dibaca:</span>
                        <span className="text-gray-600">No. Pesanan, SKU, Qty, Harga</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <input
                        type="file"
                        multiple
                        accept=".xlsx, .xls"
                        id="slot1-standalone-upload"
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
                        onClick={() => document.getElementById('slot1-standalone-upload')?.click()}
                        className="w-full h-13 rounded-2xl border-emerald-300 text-emerald-800 hover:bg-emerald-50 font-bold text-xs gap-2"
                      >
                        <Upload className="w-4 h-4 text-emerald-600" />
                        {orderFiles.length > 0
                          ? `Ganti / Tambah Berkas (${orderFiles.length} file dipilih)`
                          : 'Pilih Berkas Pesanan Excel (.xlsx / .xls)'}
                      </Button>

                      <p className="text-[10px] text-gray-400 text-center">
                        💡 Anda dapat memilih lebih dari 1 file sekaligus (misal Part 1 &amp; Part 2, atau file bulan lalu + bulan ini). Sistem akan menggabungkannya otomatis.
                      </p>

                      {orderFiles.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-[11px] font-bold text-gray-400 uppercase">
                            Berkas Terpilih ({orderFiles.length}):
                          </Label>
                          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                            {orderFiles.map((f, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs"
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                                  <span className="font-bold text-emerald-950 truncate">{f.name}</span>
                                  <span className="text-[10px] text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md shrink-0">
                                    {formatFileSize(f.size)}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setOrderFiles(prev => prev.filter((_, idx) => idx !== i))}
                                  className="text-gray-400 hover:text-red-600 p-1 rounded-lg"
                                  title="Hapus berkas"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {workflowMode === 'multi_slot_audit' && (
                /* MULTI-SLOT SHOPEE AUDIT: 3 SLOTS */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Slot 1: Order Complete */}
                    <Card className="border-2 border-dashed border-orange-200 hover:border-orange-400 transition-colors bg-white rounded-2xl overflow-hidden shadow-sm">
                      <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
                        <div className="space-y-2">
                          <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
                            <FileSpreadsheet className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center justify-between">
                              <Label className="font-black text-xs text-gray-900 block">
                                Slot 1: Order Complete (.xlsx)
                              </Label>
                              <Badge className="bg-orange-100 text-orange-800 text-[9px] font-black border-none">
                                Wajib
                              </Badge>
                            </div>
                            <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                              Laporan Pesanan Selesai (Bulan H-1 &amp; H, atau Part 1 &amp; 2).
                            </p>
                          </div>
                          <div className="text-[10px] bg-orange-50/70 p-2 rounded-xl text-orange-950 space-y-0.5">
                            <span className="font-bold block">📍 Menu di Shopee:</span>
                            <span>Pesanan Saya ➔ Selesai ➔ Ekspor</span>
                            <span className="font-mono text-[9px] block text-orange-800 mt-0.5">Order.all.xxxx.xlsx</span>
                          </div>
                        </div>

                        <div className="space-y-2 pt-1">
                          <input
                            type="file"
                            multiple
                            accept=".xlsx, .xls"
                            id="slot1-multi-upload"
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
                            onClick={() => document.getElementById('slot1-multi-upload')?.click()}
                            className="w-full h-9 rounded-xl border-orange-200 text-orange-700 hover:bg-orange-50 font-bold text-xs gap-1.5"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            Pilih Berkas ({orderFiles.length})
                          </Button>
                          {orderFiles.length > 0 && (
                            <div className="max-h-24 overflow-y-auto space-y-1">
                              {orderFiles.map((f, i) => (
                                <div key={i} className="flex items-center justify-between text-[10px] bg-orange-50/80 p-1.5 rounded-lg font-bold text-orange-900">
                                  <span className="truncate">✓ {f.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => setOrderFiles(prev => prev.filter((_, idx) => idx !== i))}
                                    className="text-orange-500 hover:text-red-600 ml-1"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
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
                            <div className="flex items-center justify-between">
                              <Label className="font-black text-xs text-gray-900 block">
                                Slot 2: Income Released (.xlsx)
                              </Label>
                              <Badge className="bg-blue-100 text-blue-800 text-[9px] font-black border-none">
                                Wajib
                              </Badge>
                            </div>
                            <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                              Penghasilan Saya status 'Sudah Dilepas' Bulan H.
                            </p>
                          </div>
                          <div className="text-[10px] bg-blue-50/70 p-2 rounded-xl text-blue-950 space-y-0.5">
                            <span className="font-bold block">📍 Menu di Shopee:</span>
                            <span>Keuangan ➔ Penghasilan Saya ➔ Rincian</span>
                            <span className="font-mono text-[9px] block text-blue-800 mt-0.5">Income.released.xxxx.xlsx</span>
                          </div>
                        </div>

                        <div className="space-y-2 pt-1">
                          <input
                            type="file"
                            multiple
                            accept=".xlsx, .xls"
                            id="slot2-multi-upload"
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
                            onClick={() => document.getElementById('slot2-multi-upload')?.click()}
                            className="w-full h-9 rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50 font-bold text-xs gap-1.5"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            Pilih Berkas ({incomeFiles.length})
                          </Button>
                          {incomeFiles.length > 0 && (
                            <div className="max-h-24 overflow-y-auto space-y-1">
                              {incomeFiles.map((f, i) => (
                                <div key={i} className="flex items-center justify-between text-[10px] bg-blue-50/80 p-1.5 rounded-lg font-bold text-blue-900">
                                  <span className="truncate">✓ {f.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => setIncomeFiles(prev => prev.filter((_, idx) => idx !== i))}
                                    className="text-blue-500 hover:text-red-600 ml-1"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
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
                            <div className="flex items-center justify-between">
                              <Label className="font-black text-xs text-gray-900 block">
                                Slot 3: RTS &amp; Retur (.zip/.xlsx)
                              </Label>
                              <Badge className="bg-gray-100 text-gray-600 text-[9px] font-bold border-none">
                                Opsional
                              </Badge>
                            </div>
                            <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                              Arsip Gagal Kirim (RTS) &amp; Pengembalian Barang (RR).
                            </p>
                          </div>
                          <div className="text-[10px] bg-purple-50/70 p-2 rounded-xl text-purple-950 space-y-0.5">
                            <span className="font-bold block">📍 Menu di Shopee:</span>
                            <span>Pesanan Saya ➔ Pengembalian/Pembatalan</span>
                            <span className="font-mono text-[9px] block text-purple-800 mt-0.5">Return_Refund_Archive.zip</span>
                          </div>
                        </div>

                        <div className="space-y-2 pt-1">
                          <input
                            type="file"
                            accept=".zip, .rar, .xlsx, .xls"
                            id="slot3-multi-upload"
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
                            onClick={() => document.getElementById('slot3-multi-upload')?.click()}
                            className="w-full h-9 rounded-xl border-purple-200 text-purple-700 hover:bg-purple-50 font-bold text-xs gap-1.5"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            {rtsArchiveFile ? 'Ganti Berkas (.zip)' : 'Pilih Berkas (.zip)'}
                          </Button>
                          {rtsArchiveFile && (
                            <div className="flex items-center justify-between text-[10px] bg-purple-50/80 p-1.5 rounded-lg font-bold text-purple-900">
                              <span className="truncate">✓ {rtsArchiveFile.name}</span>
                              <button
                                type="button"
                                onClick={() => setRtsArchiveFile(null)}
                                className="text-purple-500 hover:text-red-600 ml-1"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Optional Additional Cost Inputs for Shopee Audit */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-dashed border-gray-200">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-gray-700">
                        Biaya Iklan Shopee Manual (Opsional)
                      </Label>
                      <Input
                        type="number"
                        placeholder="Contoh: 1500000"
                        value={biayaIklanManual}
                        onChange={(e) => setBiayaIklanManual(e.target.value)}
                        className="rounded-xl h-10 font-bold"
                      />
                      <p className="text-[10px] text-gray-400">
                        Otomatis menghitung PPN 11% jika tidak ditarik dari potongan invoice penghasilan.
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
                        Biaya ekstra seperti packing khusus atau operasional admin.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {workflowMode === 'general_cash' && (
                /* GENERAL CASH SPREADSHEET */
                <Card className="border-2 border-dashed border-blue-300 hover:border-blue-500 transition-colors bg-white rounded-3xl overflow-hidden shadow-sm">
                  <CardContent className="p-6 space-y-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-700 shadow-inner">
                          <Receipt className="w-6 h-6" />
                        </div>
                        <div>
                          <Label className="font-black text-sm text-gray-900 block">
                            Slot Berkas Buku Kas / Arus Kas (.xlsx, .xls)
                          </Label>
                          <p className="text-xs text-gray-500 font-medium">
                            Berkas rekap transaksi umum dengan kolom Tanggal, Jenis, Kategori, Nominal, dan Keterangan.
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-blue-100 text-blue-800 font-bold border-none text-[10px]">
                        Kas Toko
                      </Badge>
                    </div>

                    {/* Format Guide and Download Template button */}
                    <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <span className="font-black text-xs text-blue-950 block">
                            📋 Struktur Kolom Wajib pada Excel Buku Kas:
                          </span>
                          <span className="text-[11px] text-blue-800">
                            Pastikan baris judul pada baris pertama memiliki 5 kolom berikut:
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={downloadCashbookTemplate}
                          className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold gap-1.5 shrink-0 shadow-sm"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          Unduh Template Excel (.xlsx)
                        </Button>
                      </div>

                      {/* Sample visual table */}
                      <div className="overflow-x-auto rounded-xl border border-blue-200 bg-white">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-blue-100/70 text-blue-950 font-bold">
                            <tr>
                              <th className="p-2 border-r border-blue-200">Tanggal</th>
                              <th className="p-2 border-r border-blue-200">Jenis</th>
                              <th className="p-2 border-r border-blue-200">Kategori</th>
                              <th className="p-2 border-r border-blue-200">Nominal</th>
                              <th className="p-2">Keterangan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-gray-600">
                            <tr>
                              <td className="p-2 border-r border-gray-100 font-mono">2026-09-01</td>
                              <td className="p-2 border-r border-gray-100 text-emerald-700 font-bold">Pemasukan</td>
                              <td className="p-2 border-r border-gray-100">Penjualan</td>
                              <td className="p-2 border-r border-gray-100 font-mono">500000</td>
                              <td className="p-2">Penjualan offline toko</td>
                            </tr>
                            <tr>
                              <td className="p-2 border-r border-gray-100 font-mono">2026-09-02</td>
                              <td className="p-2 border-r border-gray-100 text-red-600 font-bold">Pengeluaran</td>
                              <td className="p-2 border-r border-gray-100">Bahan Baku</td>
                              <td className="p-2 border-r border-gray-100 font-mono">150000</td>
                              <td className="p-2">Beli ayam &amp; cabai</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <input
                        type="file"
                        accept=".xlsx, .xls"
                        id="general-cash-upload"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setGeneralCashFile(e.target.files[0]);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById('general-cash-upload')?.click()}
                        className="w-full h-13 rounded-2xl border-blue-300 text-blue-800 hover:bg-blue-50 font-bold text-xs gap-2"
                      >
                        <Upload className="w-4 h-4 text-blue-600" />
                        {generalCashFile
                          ? `Ganti Berkas: ${generalCashFile.name}`
                          : 'Pilih Berkas Buku Kas (.xlsx / .xls)'}
                      </Button>

                      {generalCashFile && (
                        <div className="flex items-center justify-between p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
                            <span className="font-bold text-blue-950 truncate">{generalCashFile.name}</span>
                            <span className="text-[10px] text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md shrink-0">
                              {formatFileSize(generalCashFile.size)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setGeneralCashFile(null)}
                            className="text-gray-400 hover:text-red-600 p-1 rounded-lg"
                            title="Hapus berkas"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ACTION: PROCESS & PREVIEW (DOES NOT TOUCH DB) */}
              <Button
                type="button"
                disabled={
                  isProcessing ||
                  (workflowMode === 'slot1_orders' && orderFiles.length === 0) ||
                  (workflowMode === 'multi_slot_audit' && orderFiles.length === 0) ||
                  (workflowMode === 'general_cash' && !generalCashFile)
                }
                onClick={handleProcessFiles}
                className="w-full h-13 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm gap-2 shadow-lg shadow-emerald-200 transition-all"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sedang Mengekstrak Berkas & Menganalisis...
                  </>
                ) : (
                  <>
                    Proses & Buka Pratinjau Data (Preview)
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          ) : (
            /* STEP 2: REVIEW & APPROVAL SCREEN (USER MUST APPROVE TO SAVE TO DB) */
            <div className="space-y-6">
              {/* Review Mode Banner */}
              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3 text-amber-900">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 text-xs">
                  <p className="font-black text-amber-950">
                    Mode Pratinjau: Data BELUM Disimpan ke Database
                  </p>
                  <p className="text-amber-800">
                    Periksa ringkasan transaksi, pencocokan SKU produk, dan pastikan data sudah sesuai.
                    Tekan tombol <strong>"Setujui & Simpan ke Database"</strong> di bagian bawah untuk menyimpan.
                  </p>
                </div>
              </div>

              {/* KPI Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="border border-emerald-100 bg-emerald-50/50 rounded-2xl">
                  <CardContent className="p-3.5 space-y-1">
                    <p className="text-[10px] font-bold uppercase text-emerald-700">Total Transaksi / Pesanan</p>
                    <p className="text-lg md:text-xl font-black text-emerald-950">
                      {workflowMode === 'multi_slot_audit' && auditResult
                        ? `${auditResult.orderCount} Pesanan`
                        : `${proposedTransactions.length} Baris`}
                    </p>
                    <p className="text-[10px] text-emerald-600 font-medium">
                      {selectedTransactionsCount} disetujui untuk disimpan
                    </p>
                  </CardContent>
                </Card>

                <Card className="border border-blue-100 bg-blue-50/50 rounded-2xl">
                  <CardContent className="p-3.5 space-y-1">
                    <p className="text-[10px] font-bold uppercase text-blue-700">Total Nilai / Omzet</p>
                    <p className="text-lg md:text-xl font-black text-blue-950 truncate">
                      {workflowMode === 'multi_slot_audit' && auditResult
                        ? formatCurrency(auditResult.totalOmzetToko)
                        : formatCurrency(selectedTotalNominal)}
                    </p>
                    <p className="text-[10px] text-blue-600 font-medium truncate">
                      {workflowMode === 'multi_slot_audit' && auditResult
                        ? `Dana Dilepas: ${formatCurrency(auditResult.totalPendapatanDilepas)}`
                        : 'Nilai dari transaksi terpilih'}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border border-purple-100 bg-purple-50/50 rounded-2xl">
                  <CardContent className="p-3.5 space-y-1">
                    <p className="text-[10px] font-bold uppercase text-purple-700">Total Kuantitas Produk</p>
                    <p className="text-lg md:text-xl font-black text-purple-950">
                      {workflowMode === 'multi_slot_audit' && auditResult
                        ? `${auditResult.totalQtySold} pcs`
                        : `${selectedTotalQty} pcs`}
                    </p>
                    <p className="text-[10px] text-purple-600 font-medium">
                      Item terjual terakumulasi
                    </p>
                  </CardContent>
                </Card>

                <Card className="border border-orange-100 bg-orange-50/50 rounded-2xl">
                  <CardContent className="p-3.5 space-y-1">
                    <p className="text-[10px] font-bold uppercase text-orange-700">Status Pencocokan SKU</p>
                    <p className="text-lg md:text-xl font-black text-orange-950">
                      {(workflowMode === 'multi_slot_audit' ? auditResult?.unmappedSkus.length : unmappedSkusList.length) === 0
                        ? '100% Cocok ✓'
                        : `${workflowMode === 'multi_slot_audit' ? auditResult?.unmappedSkus.length : unmappedSkusList.length} Perlu Pemetaan`}
                    </p>
                    <p className="text-[10px] text-orange-600 font-medium">
                      Pencocokan ke katalog HPP
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* UNMAPPED SKU QUICK-MAPPING (IF ANY) */}
              {(workflowMode === 'multi_slot_audit' ? (auditResult?.unmappedSkus.length || 0) : unmappedSkusList.length) > 0 && (
                <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="font-black text-xs text-amber-900">
                          Ditemukan {(workflowMode === 'multi_slot_audit' ? auditResult?.unmappedSkus.length : unmappedSkusList.length)} SKU Belum Terdaftar di Katalog HPP
                        </p>
                        <p className="text-[11px] text-amber-700">
                          Pilih varian produk aplikasi di bawah agar nilai modal HPP dan pemotongan stok otomatis akurat.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-bold text-amber-900 flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saveSkuToDb}
                          onChange={(e) => setSaveSkuToDb(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                        />
                        Simpan SKU Permanen ke HPP
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        onClick={workflowMode === 'multi_slot_audit' ? handleApplyShopeeAuditSkuMapping : handleApplyOrderSkuMapping}
                        disabled={isProcessing}
                        className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-8 gap-1.5"
                      >
                        {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Terapkan & Hitung Ulang'}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                    {(workflowMode === 'multi_slot_audit' ? (auditResult?.unmappedSkus || []) : unmappedSkusList).map((u) => (
                      <div
                        key={u.sku}
                        className="bg-white border border-amber-200 p-2.5 rounded-xl flex flex-col justify-between space-y-1.5 text-xs shadow-xs"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-black text-amber-900 font-mono text-[11px] bg-amber-100/70 px-1.5 py-0.5 rounded">
                            {u.sku}
                          </span>
                          <span className="text-[10px] font-bold text-gray-500">
                            {u.totalQty} pcs · {formatCurrency(u.totalOmzet)}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-600 truncate font-medium">
                          {u.rawProductName} {u.rawVariantName ? `(${u.rawVariantName})` : ''}
                        </p>
                        <select
                          value={skuMapping[u.sku]?.variantId || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) {
                              const copy = { ...skuMapping };
                              delete copy[u.sku];
                              setSkuMapping(copy);
                              return;
                            }
                            const [pId, vId] = val.split(':::');
                            setSkuMapping(prev => ({
                              ...prev,
                              [u.sku]: { productId: pId, variantId: vId },
                            }));
                          }}
                          className="h-8 rounded-lg border-gray-200 text-[11px] font-bold w-full bg-gray-50 focus:bg-white"
                        >
                          <option value="">-- Pilih Varian Produk Toko --</option>
                          {products.map(p => (
                            <optgroup key={p.id} label={p.nama}>
                              {p.varian.map(v => (
                                <option key={v.id} value={`${p.id}:::${v.id}`}>
                                  {p.nama} - {v.nama} ({formatCurrency(v.harga)})
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TABLE VIEW / AUDIT TABS */}
              {workflowMode === 'multi_slot_audit' && auditResult ? (
                /* MULTI-SLOT SHOPEE DETAILED TABS */
                <Tabs value={auditActiveTab} onValueChange={(v: any) => setAuditActiveTab(v)} className="w-full">
                  <TabsList className="bg-gray-100 p-1 rounded-2xl w-full grid grid-cols-3 max-w-md">
                    <TabsTrigger value="variants" className="rounded-xl font-bold text-xs">
                      Performa Varian ({auditResult.variantBreakdown.length})
                    </TabsTrigger>
                    <TabsTrigger value="discrepancies" className="rounded-xl font-bold text-xs">
                      Selisih Ongkir ({auditResult.discrepancies.length})
                    </TabsTrigger>
                    <TabsTrigger value="rts" className="rounded-xl font-bold text-xs">
                      Paket RTS ({auditResult.rtsPackages.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="variants" className="mt-4">
                    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
                      <div className="max-h-80 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-50 text-gray-500 font-bold sticky top-0 border-b border-gray-200">
                            <tr>
                              <th className="p-3">Produk & Varian</th>
                              <th className="p-3 text-right">Terjual</th>
                              <th className="p-3 text-right">Omzet</th>
                              <th className="p-3 text-right">HPP Modal</th>
                              <th className="p-3 text-right">Laba Bersih</th>
                              <th className="p-3 text-right">Margin</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 font-medium">
                            {auditResult.variantBreakdown.map((vb, i) => (
                              <tr key={i} className="hover:bg-gray-50/50">
                                <td className="p-3">
                                  <p className="font-bold text-gray-900">{vb.productName}</p>
                                  <p className="text-[10px] text-gray-400 font-mono">{vb.variantName} · SKU: {vb.sku || '-'}</p>
                                </td>
                                <td className="p-3 text-right font-black text-gray-800">{vb.qtyTerjual} pcs</td>
                                <td className="p-3 text-right font-black text-gray-900">{formatCurrency(vb.omzetVarian)}</td>
                                <td className="p-3 text-right text-gray-600">{formatCurrency(vb.totalHppVarian)}</td>
                                <td className={`p-3 text-right font-black ${vb.labaBersihVarian >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {formatCurrency(vb.labaBersihVarian)}
                                </td>
                                <td className="p-3 text-right font-black text-gray-700">{vb.marginVarian.toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="discrepancies" className="mt-4">
                    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
                      <div className="max-h-80 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-50 text-gray-500 font-bold sticky top-0 border-b border-gray-200">
                            <tr>
                              <th className="p-3">No. Pesanan</th>
                              <th className="p-3">Tanggal</th>
                              <th className="p-3 text-right">Ongkir Pembeli</th>
                              <th className="p-3 text-right">Ditagih Ekspedisi</th>
                              <th className="p-3 text-right">Selisih Kerugian</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 font-medium">
                            {auditResult.discrepancies.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="p-6 text-center text-gray-400 font-medium">
                                  Tidak ditemukan selisih ongkir abnormal pada berkas ini.
                                </td>
                              </tr>
                            ) : (
                              auditResult.discrepancies.map((d, i) => (
                                <tr key={i} className="hover:bg-gray-50/50">
                                  <td className="p-3 font-mono font-bold text-gray-800">{d.orderId}</td>
                                  <td className="p-3 text-gray-500">{d.date}</td>
                                  <td className="p-3 text-right text-gray-600">{formatCurrency(d.shippingBuyer)}</td>
                                  <td className="p-3 text-right text-gray-600">{formatCurrency(d.shippingCourier)}</td>
                                  <td className="p-3 text-right font-black text-red-600">{formatCurrency(d.discrepancy)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="rts" className="mt-4">
                    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
                      <div className="max-h-80 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-50 text-gray-500 font-bold sticky top-0 border-b border-gray-200">
                            <tr>
                              <th className="p-3">No. Resi & Pesanan</th>
                              <th className="p-3">Produk</th>
                              <th className="p-3">Status</th>
                              <th className="p-3 text-right">Hari Tertahan</th>
                              <th className="p-3 text-right">Estimasi Kerugian</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 font-medium">
                            {auditResult.rtsPackages.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="p-6 text-center text-gray-400 font-medium">
                                  Tidak ada rekaman paket RTS / retur bermasalah.
                                </td>
                              </tr>
                            ) : (
                              auditResult.rtsPackages.map((r, i) => (
                                <tr key={i} className="hover:bg-gray-50/50">
                                  <td className="p-3">
                                    <p className="font-mono font-bold text-gray-900">{r.trackingNumber}</p>
                                    <p className="text-[10px] text-gray-400 font-mono">{r.orderId}</p>
                                  </td>
                                  <td className="p-3">
                                    <p className="font-bold text-gray-800">{r.productName}</p>
                                    <p className="text-[10px] text-gray-400 font-mono">Qty: {r.qty} pcs</p>
                                  </td>
                                  <td className="p-3 text-gray-600">{r.status}</td>
                                  <td className="p-3 text-right font-bold text-gray-800">{r.daysStuck} hari</td>
                                  <td className="p-3 text-right font-black text-amber-600">{formatCurrency(r.lossValueHpp)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              ) : (
                /* INTERACTIVE PROPOSED TRANSACTIONS TABLE (FOR ORDERS & CASH) */
                <div className="space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleSelectAll(selectedTransactionsCount !== proposedTransactions.length)}
                        className="h-8 rounded-xl text-xs font-bold border-gray-200 gap-1.5"
                      >
                        {selectedTransactionsCount === proposedTransactions.length ? (
                          <>
                            <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                            Batalkan Semua
                          </>
                        ) : (
                          <>
                            <Square className="w-3.5 h-3.5 text-gray-400" />
                            Pilih Semua ({proposedTransactions.length})
                          </>
                        )}
                      </Button>
                      <span className="text-xs font-bold text-gray-500">
                        {selectedTransactionsCount} dari {proposedTransactions.length} disetujui
                      </span>
                    </div>

                    <div className="relative w-full md:w-64">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                      <Input
                        placeholder="Cari no. pesanan / produk..."
                        value={previewSearch}
                        onChange={(e) => setPreviewSearch(e.target.value)}
                        className="h-8 pl-8 text-xs rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
                    <div className="max-h-80 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 text-gray-500 font-bold sticky top-0 border-b border-gray-200">
                          <tr>
                            <th className="p-3 w-10 text-center">✓</th>
                            <th className="p-3">No. Pesanan / Ref</th>
                            <th className="p-3">Tanggal</th>
                            <th className="p-3">Rincian Item</th>
                            <th className="p-3 text-right">Nominal (Rp)</th>
                            <th className="p-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                          {filteredProposedTxs.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-8 text-center text-gray-400">
                                Tidak ada data yang sesuai dengan pencarian.
                              </td>
                            </tr>
                          ) : (
                            filteredProposedTxs.map((t) => (
                              <tr
                                key={t.id}
                                className={`transition-colors ${t.selected ? 'bg-white hover:bg-emerald-50/30' : 'bg-gray-50/60 opacity-60'}`}
                              >
                                <td className="p-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={t.selected}
                                    onChange={() => toggleSelectTransaction(t.id)}
                                    className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                  />
                                </td>
                                <td className="p-3 font-mono font-bold text-gray-900 truncate max-w-[140px]">
                                  {t.orderId}
                                </td>
                                <td className="p-3 text-gray-500 whitespace-nowrap">
                                  {t.tanggal}
                                </td>
                                <td className="p-3 max-w-[280px]">
                                  <p className="font-bold text-gray-900 truncate" title={t.itemSummary}>
                                    {t.itemSummary}
                                  </p>
                                  {t.qty_total > 0 && (
                                    <span className="text-[10px] text-gray-400 font-semibold">
                                      Total: {t.qty_total} pcs
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-right font-black text-gray-900 whitespace-nowrap">
                                  {formatCurrency(t.nominal)}
                                </td>
                                <td className="p-3 text-center">
                                  {t.unmatchedItemsCount > 0 ? (
                                    <Badge className="bg-amber-100 text-amber-800 border-none text-[9px] font-bold">
                                      SKU Belum Dipetakan
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-emerald-100 text-emerald-800 border-none text-[9px] font-bold">
                                      Siap Simpan ✓
                                    </Badge>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* FOOTER ACTIONS: CANCEL, EXPORT, & MANDATORY APPROVAL BUTTON */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setViewStep('upload');
                      setAuditResult(null);
                      setProposedTransactions([]);
                    }}
                    className="rounded-2xl h-11 text-xs font-bold border-gray-200 text-gray-600 hover:bg-gray-100"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Unggah Ulang / Batal
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={exportPreviewToExcel}
                    className="rounded-2xl h-11 text-xs font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Unduh Excel (.xlsx)
                  </Button>
                </div>

                {/* THE MANDATORY USER APPROVAL / SAVE BUTTON */}
                <Button
                  type="button"
                  disabled={isCommitting || (workflowMode !== 'multi_slot_audit' && selectedTransactionsCount === 0)}
                  onClick={handleUserApprovalCommit}
                  className="w-full md:w-auto h-12 px-7 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm gap-2 shadow-lg shadow-emerald-200 transition-all active:scale-95"
                >
                  {isCommitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Menyimpan ke Database & Stok...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Setujui & Simpan ke Database
                      {workflowMode === 'multi_slot_audit'
                        ? ' (Konsolidasi Audit)'
                        : ` (${selectedTransactionsCount} Transaksi)`}
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
