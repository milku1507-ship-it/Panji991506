import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { Product, Variant, HppMaterial, Ingredient } from '../types';

export interface OrderCompleteItem {
  orderId: string;
  orderDate: string;
  completeDate: string;
  status: string;
  sku: string;
  rawProductName: string;
  rawVariantName: string;
  price: number;
  qty: number;
  totalPrice: number;
  shippingPaidByBuyer: number;
  shippingChargedByCourier: number;
}

export interface IncomeReleasedItem {
  orderId: string;
  releaseDate: string;
  netIncome: number;
  adminFee: number;
  serviceFee: number;
  orderFee: number;
  adsFee: number;
  shippingSeller: number;
}

export interface RtsRrItem {
  orderId: string;
  trackingNumber: string;
  returnId: string;
  status: string;
  reason: string;
  requestDate: string;
  sku: string;
  productName: string;
  qty: number;
  isStuck: boolean;
  daysStuck: number;
  lossValueHpp: number;
}

export interface UnmappedSku {
  sku: string;
  rawProductName: string;
  rawVariantName: string;
  totalQty: number;
  totalOmzet: number;
}

export interface VariantAuditBreakdown {
  sku: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  qtyTerjual: number;
  omzetVarian: number;
  hppModalPerUnit: number;
  totalHppVarian: number;
  alokasiAdminVarian: number;
  labaBersihVarian: number;
  marginVarian: number;
}

export interface ShippingDiscrepancy {
  orderId: string;
  date: string;
  shippingBuyer: number;
  shippingCourier: number;
  discrepancy: number; // courier - buyer (positive means loss to seller)
}

export interface ShopeeAuditResult {
  id: string;
  periode: string;
  createdAt: string;
  orderCount: number;
  totalQtySold: number;
  totalOmzetToko: number;
  totalPendapatanDilepas: number;
  totalAdminLayanan: number;
  totalHppTerjual: number;
  totalBiayaIklanIncPpn: number;
  biayaIklanManual: number;
  biayaOperasionalManual: number;
  labaBersihKonsolidasi: number;
  marginKonsolidasi: number;
  variantBreakdown: VariantAuditBreakdown[];
  discrepancies: ShippingDiscrepancy[];
  totalDiscrepancyLoss: number;
  rtsPackages: RtsRrItem[];
  totalRtsLoss: number;
  unmappedSkus: UnmappedSku[];
}

/**
 * Normalizes an SKU string: trims, converts to uppercase, removes all whitespace.
 */
export const normalizeSKU = (val: any): string => {
  return String(val ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
};

/**
 * Parses numeric currency strings supporting Indonesian formatting.
 */
export const parseIdAmount = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const s = String(val ?? '0').trim().replace(/[Rp\s]/gi, '');
  if (!s || s === '0' || s === '-') return 0;
  
  if (s.includes(',')) {
    return Number(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  const lastDot = s.lastIndexOf('.');
  if (lastDot >= 0 && s.length - lastDot - 1 === 3) {
    return Number(s.replace(/\./g, '')) || 0;
  }
  return Number(s.replace(/[^0-9.-]/g, '')) || 0;
};

/**
 * Parses various date formats from Shopee spreadsheets.
 */
export const parseShopeeDate = (val: any): string => {
  if (!val) return new Date().toISOString().split('T')[0];
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s.slice(0, 10) || new Date().toISOString().split('T')[0];
};

/**
 * Calculates raw HPP per piece for a variant using internal database materials.
 */
export const calculateVariantHppModal = (
  variant: Variant,
  ingredients: Ingredient[]
): number => {
  const bahan = variant.bahan || [];
  const qBatch = Math.max(1, Number(variant.qty_batch) || 1);
  const totalBahan = bahan.reduce((acc, m) => {
    let ing = ingredients.find(i => i.id === m.ingredientId);
    if (!ing && m.nama) {
      const norm = m.nama.toLowerCase().trim();
      ing = ingredients.find(i => i.name.toLowerCase().trim() === norm);
    }
    const price = ing ? ing.price : m.harga;
    let usage = Number(m.qty) || 0;
    const unit = (ing ? ing.unit : m.satuan || '').toLowerCase().trim();
    const mUnit = (m.satuan || '').toLowerCase().trim();
    if ((mUnit === 'gram' || mUnit === 'gr' || mUnit === 'g') && (unit === 'kg' || unit === 'kilogram')) {
      usage = usage / 1000;
    } else if ((mUnit === 'ml' || mUnit === 'mili') && (unit === 'liter' || unit === 'lt' || unit === 'l')) {
      usage = usage / 1000;
    }
    return acc + usage * (price || 0);
  }, 0);

  const packing = Number(variant.harga_packing) || 0;
  return (totalBahan + packing) / qBatch;
};

/**
 * Searches for a header row in raw sheet data.
 */
function findHeaderRow(rows: any[][], requiredKeywords: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const rowNorm = row.map(c => normalizeSKU(c));
    const allGroupsMatch = requiredKeywords.every(keywordGroup =>
      keywordGroup.some(k => rowNorm.some(cell => cell.includes(k)))
    );
    if (allGroupsMatch) return i;
  }
  return -1;
}

/**
 * Finds index of column by candidate keywords.
 */
function getColumnIndex(headers: string[], keywords: string[]): number {
  const normKeywords = keywords.map(k => normalizeSKU(k));
  // Exact match
  let idx = headers.findIndex(h => normKeywords.includes(h));
  if (idx !== -1) return idx;
  // Substring match
  return headers.findIndex(h => normKeywords.some(k => h.includes(k)));
}

/**
 * Extracts and parses Order Complete files (.xlsx/.xls).
 */
export async function parseOrderCompleteFiles(files: File[]): Promise<OrderCompleteItem[]> {
  const allItems: OrderCompleteItem[] = [];

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
    if (!rawRows || rawRows.length === 0) continue;

    const skuKeywords = ['NOMORREFERENSISKU', 'REFERENSISKU', 'SKUVARIAN', 'VARIANTSKU', 'SKUINDUK', 'SKU'];
    const qtyKeywords = ['JUMLAH', 'QTY', 'QUANTITY', 'KUANTITAS'];
    const orderIdKeywords = ['NOPESANAN', 'NOMORPESANAN', 'ORDERID', 'INVOICE'];

    const headerIdx = findHeaderRow(rawRows, [skuKeywords, qtyKeywords]);
    if (headerIdx === -1) continue;

    const headerRow = rawRows[headerIdx].map(c => normalizeSKU(c));
    const skuCol = getColumnIndex(headerRow, ['NOMORREFERENSISKU', 'REFERENSISKU', 'SKUVARIAN', 'SKUINDUK', 'SKU']);
    const qtyCol = getColumnIndex(headerRow, ['JUMLAH', 'QTY', 'KUANTITAS']);
    const orderIdCol = getColumnIndex(headerRow, ['NOPESANAN', 'NOMORPESANAN', 'ORDERID']);
    const statusCol = getColumnIndex(headerRow, ['STATUSPESANAN', 'STATUS']);
    const dateCol = getColumnIndex(headerRow, ['WAKTUPESANANSELESAI', 'WAKTUPESANANDIBUAT', 'TANGGAL']);
    const prodNameCol = getColumnIndex(headerRow, ['NAMAPRODUK', 'PRODUK']);
    const varNameCol = getColumnIndex(headerRow, ['NAMAVARIASI', 'VARIASI', 'VARIANT']);
    const priceCol = getColumnIndex(headerRow, ['HARGASETELAHDISKON', 'HARGAAWAL', 'HARGAPRODUK', 'HARGADEAL']);
    const totalCol = getColumnIndex(headerRow, ['TOTALPEMBAYARANPRODUK', 'TOTALHARGAPRODUK', 'TOTALPEMBAYARAN']);
    const shipBuyerCol = getColumnIndex(headerRow, ['ONGKOSKIRIMDIBAYARPEMBELI', 'PERKIRAANONGKOSKIRIM']);
    const shipCourierCol = getColumnIndex(headerRow, ['ONGKOSKIRIMDITERUSKAN', 'ONGKOSKIRIMDITAGIHKAN', 'ONGKOSKIRIMAKTUAL']);

    const rows = rawRows.slice(headerIdx + 1);
    for (const r of rows) {
      if (!Array.isArray(r) || r.length === 0) continue;
      const sku = normalizeSKU(skuCol !== -1 ? r[skuCol] : '');
      const qty = Number(String(r[qtyCol] ?? '0').replace(/[^0-9]/g, '')) || 0;
      const orderId = orderIdCol !== -1 ? String(r[orderIdCol] ?? '').trim() : '';

      if (!sku && qty <= 0) continue;

      const price = priceCol !== -1 ? parseIdAmount(r[priceCol]) : 0;
      const totalPrice = totalCol !== -1 ? parseIdAmount(r[totalCol]) : price * qty;
      const orderDate = dateCol !== -1 ? parseShopeeDate(r[dateCol]) : new Date().toISOString().split('T')[0];
      const status = statusCol !== -1 ? String(r[statusCol] ?? '').trim() : 'Selesai';
      const rawProductName = prodNameCol !== -1 ? String(r[prodNameCol] ?? '').trim() : '';
      const rawVariantName = varNameCol !== -1 ? String(r[varNameCol] ?? '').trim() : '';
      const shipBuyer = shipBuyerCol !== -1 ? parseIdAmount(r[shipBuyerCol]) : 0;
      const shipCourier = shipCourierCol !== -1 ? parseIdAmount(r[shipCourierCol]) : 0;

      allItems.push({
        orderId: orderId || `ORD-${allItems.length + 1}`,
        orderDate,
        completeDate: orderDate,
        status,
        sku,
        rawProductName,
        rawVariantName,
        price,
        qty: qty || 1,
        totalPrice,
        shippingPaidByBuyer: shipBuyer,
        shippingChargedByCourier: shipCourier,
      });
    }
  }

  return allItems;
}

/**
 * Extracts and parses Income Released files (.xlsx/.xls).
 */
export async function parseIncomeReleasedFiles(files: File[]): Promise<IncomeReleasedItem[]> {
  const allItems: IncomeReleasedItem[] = [];

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
    if (!rawRows || rawRows.length === 0) continue;

    const orderIdKeywords = ['NOPESANAN', 'NOMORPESANAN', 'ORDERID'];
    const incomeKeywords = ['TOTALPENGHASILAN', 'JUMLAHPENGHASILAN', 'DIPERLUKAN', 'PENGHASILANBERSIH'];

    const headerIdx = findHeaderRow(rawRows, [orderIdKeywords, incomeKeywords]);
    if (headerIdx === -1) continue;

    const headerRow = rawRows[headerIdx].map(c => normalizeSKU(c));
    const orderIdCol = getColumnIndex(headerRow, ['NOPESANAN', 'NOMORPESANAN', 'ORDERID']);
    const dateCol = getColumnIndex(headerRow, ['TANGGALDANADILEPAS', 'WAKTUDANADILEPAS', 'TANGGALPESANANSELESAI', 'TANGGAL']);
    const incomeCol = getColumnIndex(headerRow, ['TOTALPENGHASILAN', 'JUMLAHPENGHASILAN', 'PENGHASILANBERSIH']);
    const adminCol = getColumnIndex(headerRow, ['BIAYAADMINISTRASI', 'BIAYAADMIN']);
    const serviceCol = getColumnIndex(headerRow, ['BIAYALAYANAN', 'SERVICELAYANAN']);
    const orderFeeCol = getColumnIndex(headerRow, ['BIAYAPROSESPESANAN', 'BIAYATRANSAKSI', 'BIAYAPEMBAYARAN']);
    const adsCol = getColumnIndex(headerRow, ['BIAYAIKLAN', 'IKLAN', 'POTONGANIKLAN']);
    const shipSellerCol = getColumnIndex(headerRow, ['ONGKOSKIRIMYANGDIKENAKAN', 'SELISIHONGKOSKIRIM', 'KOMPENSASIONGKOSKIRIM']);

    const rows = rawRows.slice(headerIdx + 1);
    for (const r of rows) {
      if (!Array.isArray(r) || r.length === 0) continue;
      const orderId = orderIdCol !== -1 ? String(r[orderIdCol] ?? '').trim() : '';
      if (!orderId) continue;

      const netIncome = incomeCol !== -1 ? parseIdAmount(r[incomeCol]) : 0;
      const adminFee = adminCol !== -1 ? Math.abs(parseIdAmount(r[adminCol])) : 0;
      const serviceFee = serviceCol !== -1 ? Math.abs(parseIdAmount(r[serviceCol])) : 0;
      const orderFee = orderFeeCol !== -1 ? Math.abs(parseIdAmount(r[orderFeeCol])) : 0;
      const adsFee = adsCol !== -1 ? Math.abs(parseIdAmount(r[adsCol])) : 0;
      const shippingSeller = shipSellerCol !== -1 ? Math.abs(parseIdAmount(r[shipSellerCol])) : 0;
      const releaseDate = dateCol !== -1 ? parseShopeeDate(r[dateCol]) : new Date().toISOString().split('T')[0];

      allItems.push({
        orderId,
        releaseDate,
        netIncome,
        adminFee,
        serviceFee,
        orderFee,
        adsFee,
        shippingSeller,
      });
    }
  }

  return allItems;
}

/**
 * Extracts and parses Return & Refund (RR) and Failed Delivery (RTS) files from ZIP or direct Excel files.
 */
export async function parseRtsRrArchive(
  archiveFile: File,
  ingredients: Ingredient[],
  products: Product[]
): Promise<RtsRrItem[]> {
  const items: RtsRrItem[] = [];
  const buffersToParse: { name: string; buffer: ArrayBuffer }[] = [];

  const isZip = archiveFile.name.toLowerCase().endsWith('.zip') ||
                archiveFile.type === 'application/zip' ||
                archiveFile.type === 'application/x-zip-compressed';

  if (isZip) {
    try {
      const zip = await JSZip.loadAsync(archiveFile);
      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (!zipEntry.dir && (relativePath.endsWith('.xlsx') || relativePath.endsWith('.xls') || relativePath.endsWith('.csv'))) {
          const content = await zipEntry.async('arraybuffer');
          buffersToParse.push({ name: relativePath, buffer: content });
        }
      }
    } catch (err) {
      console.warn('Failed to parse zip with JSZip, trying direct read:', err);
      buffersToParse.push({ name: archiveFile.name, buffer: await archiveFile.arrayBuffer() });
    }
  } else {
    buffersToParse.push({ name: archiveFile.name, buffer: await archiveFile.arrayBuffer() });
  }

  const now = new Date().getTime();

  for (const item of buffersToParse) {
    try {
      const wb = XLSX.read(item.buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
      if (!rawRows || rawRows.length === 0) continue;

      const orderKeywords = ['NOPESANAN', 'NOMORPESANAN', 'ORDERID', 'NOPENGEMBALIAN'];
      const statusKeywords = ['STATUSPESANAN', 'STATUSPENGEMBALIAN', 'STATUS'];
      const headerIdx = findHeaderRow(rawRows, [orderKeywords, statusKeywords]);
      if (headerIdx === -1) continue;

      const headerRow = rawRows[headerIdx].map(c => normalizeSKU(c));
      const orderCol = getColumnIndex(headerRow, ['NOPESANAN', 'NOMORPESANAN', 'ORDERID', 'NOPENGEMBALIAN']);
      const resiCol = getColumnIndex(headerRow, ['NO.RESI', 'NORESI', 'NOMORPELACAKAN', 'RESI', 'TRACKINGNUMBER']);
      const returnIdCol = getColumnIndex(headerRow, ['NOPENGEMBALIAN', 'IDPENGEMBALIAN', 'RETURNID']);
      const statusCol = getColumnIndex(headerRow, ['STATUSPESANAN', 'STATUSPENGEMBALIAN', 'STATUS']);
      const reasonCol = getColumnIndex(headerRow, ['ALASAN', 'ALASANGAGALKIRIM', 'ALASANPENGEMBALIAN']);
      const dateCol = getColumnIndex(headerRow, ['WAKTUPERMINTAAN', 'WAKTUPENGAJUAN', 'TANGGALDIBUAT', 'WAKTUTERAKHIR']);
      const skuCol = getColumnIndex(headerRow, ['NOMORREFERENSISKU', 'SKUVARIAN', 'SKUINDUK', 'SKU']);
      const prodNameCol = getColumnIndex(headerRow, ['NAMAPRODUK', 'PRODUK']);
      const qtyCol = getColumnIndex(headerRow, ['JUMLAH', 'QTY', 'KUANTITAS']);

      const rows = rawRows.slice(headerIdx + 1);
      for (const r of rows) {
        if (!Array.isArray(r) || r.length === 0) continue;
        const orderId = orderCol !== -1 ? String(r[orderCol] ?? '').trim() : '';
        if (!orderId) continue;

        const trackingNumber = resiCol !== -1 ? String(r[resiCol] ?? '').trim() : '';
        const returnId = returnIdCol !== -1 ? String(r[returnIdCol] ?? '').trim() : '';
        const status = statusCol !== -1 ? String(r[statusCol] ?? '').trim() : '';
        const reason = reasonCol !== -1 ? String(r[reasonCol] ?? '').trim() : '';
        const dateStr = dateCol !== -1 ? parseShopeeDate(r[dateCol]) : new Date().toISOString().split('T')[0];
        const sku = normalizeSKU(skuCol !== -1 ? r[skuCol] : '');
        const productName = prodNameCol !== -1 ? String(r[prodNameCol] ?? '').trim() : '';
        const qty = qtyCol !== -1 ? Number(String(r[qtyCol] ?? '1').replace(/[^0-9]/g, '')) || 1 : 1;

        // Calculate days stuck
        const dateMs = new Date(dateStr).getTime();
        const diffDays = isNaN(dateMs) ? 0 : Math.max(0, Math.floor((now - dateMs) / (1000 * 60 * 60 * 24)));

        // Check if stuck / in-transit / not completed
        const lowerStatus = status.toLowerCase();
        const isCompleted = lowerStatus.includes('selesai') ||
                            lowerStatus.includes('diterima') ||
                            lowerStatus.includes('kompensasi');
        const isInTransit = lowerStatus.includes('transit') ||
                            lowerStatus.includes('perjalanan') ||
                            lowerStatus.includes('dikirim') ||
                            lowerStatus.includes('gagal') ||
                            lowerStatus.includes('tunggu');

        const isStuck = (!isCompleted && diffDays >= 7) || (isInTransit && diffDays >= 7);

        // Find HPP modal loss
        let modalPerUnit = 0;
        if (sku) {
          for (const p of products) {
            for (const v of p.varian) {
              if (normalizeSKU(v.sku) === sku) {
                modalPerUnit = calculateVariantHppModal(v, ingredients);
                break;
              }
            }
            if (modalPerUnit > 0) break;
          }
        }

        items.push({
          orderId,
          trackingNumber: trackingNumber || `RESI-${orderId.slice(-6)}`,
          returnId,
          status: status || 'Dalam Perjalanan Kembali',
          reason: reason || 'Gagal Kirim / Retur',
          requestDate: dateStr,
          sku,
          productName,
          qty,
          isStuck,
          daysStuck: diffDays,
          lossValueHpp: modalPerUnit * qty,
        });
      }
    } catch (e) {
      console.warn('Failed parsing file inside RTS/RR archive:', item.name, e);
    }
  }

  return items;
}

/**
 * Main calculation engine that runs the consolidated & variant breakdown formulas,
 * SKU matching, and loss audit detection.
 */
export function runShopeeAuditEngine(params: {
  orders: OrderCompleteItem[];
  incomeItems: IncomeReleasedItem[];
  rtsRrItems: RtsRrItem[];
  products: Product[];
  ingredients: Ingredient[];
  biayaIklanManual?: number;
  biayaOperasionalManual?: number;
  manualSkuMap?: Record<string, { productId: string; variantId: string }>;
}): ShopeeAuditResult {
  const {
    orders,
    incomeItems,
    rtsRrItems,
    products,
    ingredients,
    biayaIklanManual = 0,
    biayaOperasionalManual = 0,
    manualSkuMap = {},
  } = params;

  // 1. Build SKU lookup cache from products
  interface SkuEntry {
    product: Product;
    variant: Variant;
    hppModal: number;
  }
  const skuLookup = new Map<string, SkuEntry>();

  for (const p of products) {
    for (const v of p.varian) {
      const vSku = normalizeSKU(v.sku);
      const hpp = calculateVariantHppModal(v, ingredients);
      if (vSku) {
        skuLookup.set(vSku, { product: p, variant: v, hppModal: hpp });
      }
    }
    const pSku = normalizeSKU(p.sku);
    if (pSku && !skuLookup.has(pSku) && p.varian.length > 0) {
      const v0 = p.varian[0];
      skuLookup.set(pSku, {
        product: p,
        variant: v0,
        hppModal: calculateVariantHppModal(v0, ingredients),
      });
    }
  }

  // 2. Aggregate Income Released
  let totalPendapatanDilepas = 0;
  let totalAdminLayanan = 0;
  let totalIklanFromIncome = 0;
  let totalShippingSellerFromIncome = 0;
  const incomeOrderSet = new Set<string>();

  for (const inc of incomeItems) {
    totalPendapatanDilepas += inc.netIncome;
    totalAdminLayanan += (inc.adminFee + inc.serviceFee + inc.orderFee);
    totalIklanFromIncome += inc.adsFee;
    totalShippingSellerFromIncome += inc.shippingSeller;
    incomeOrderSet.add(inc.orderId);
  }

  // Determine Ads Cost (with 11% PPN)
  const totalBiayaIklanIncPpn = totalIklanFromIncome > 0
    ? totalIklanFromIncome
    : (biayaIklanManual > 0 ? biayaIklanManual * 1.11 : 0);

  // 3. Process Orders & Match SKU
  const unmappedSkuMap = new Map<string, UnmappedSku>();
  const variantAggMap = new Map<string, {
    sku: string;
    product: Product;
    variant: Variant;
    qty: number;
    omzet: number;
    hppModal: number;
  }>();

  let totalOmzetToko = 0;
  let totalHppTerjual = 0;
  let totalQtySold = 0;
  const matchedOrderIds = new Set<string>();

  for (const ord of orders) {
    // Deduplicate / count orders
    matchedOrderIds.add(ord.orderId);
    const ordSku = normalizeSKU(ord.sku);
    const itemOmzet = ord.totalPrice || (ord.price * ord.qty);

    let match = skuLookup.get(ordSku);

    // Check manual override mapping
    if (!match && manualSkuMap[ordSku]) {
      const { productId, variantId } = manualSkuMap[ordSku];
      const prod = products.find(p => p.id === productId);
      const vr = prod?.varian.find(v => v.id === variantId);
      if (prod && vr) {
        match = {
          product: prod,
          variant: vr,
          hppModal: calculateVariantHppModal(vr, ingredients),
        };
      }
    }

    if (!match) {
      if (!unmappedSkuMap.has(ordSku)) {
        unmappedSkuMap.set(ordSku, {
          sku: ordSku || `NO-SKU-${ord.rawProductName.slice(0, 10)}`,
          rawProductName: ord.rawProductName,
          rawVariantName: ord.rawVariantName,
          totalQty: 0,
          totalOmzet: 0,
        });
      }
      const u = unmappedSkuMap.get(ordSku)!;
      u.totalQty += ord.qty;
      u.totalOmzet += itemOmzet;
      continue;
    }

    // Matched item
    totalQtySold += ord.qty;
    totalOmzetToko += itemOmzet;
    const itemHpp = match.hppModal * ord.qty;
    totalHppTerjual += itemHpp;

    const aggKey = `${match.product.id}_${match.variant.id}`;
    if (!variantAggMap.has(aggKey)) {
      variantAggMap.set(aggKey, {
        sku: ordSku || match.variant.sku || '',
        product: match.product,
        variant: match.variant,
        qty: 0,
        omzet: 0,
        hppModal: match.hppModal,
      });
    }
    const agg = variantAggMap.get(aggKey)!;
    agg.qty += ord.qty;
    agg.omzet += itemOmzet;
  }

  // 4. Variant-level Breakdown with Pro-rata Admin Allocation
  const variantBreakdown: VariantAuditBreakdown[] = [];
  for (const item of variantAggMap.values()) {
    const totalHppVarian = item.qty * item.hppModal;
    const alokasiAdminVarian = totalOmzetToko > 0
      ? (item.omzet / totalOmzetToko) * totalAdminLayanan
      : 0;
    const labaBersihVarian = item.omzet - (totalHppVarian + alokasiAdminVarian);
    const marginVarian = item.omzet > 0
      ? (labaBersihVarian / item.omzet) * 100
      : 0;

    variantBreakdown.push({
      sku: item.sku,
      productId: item.product.id,
      productName: item.product.nama,
      variantId: item.variant.id,
      variantName: item.variant.nama,
      qtyTerjual: item.qty,
      omzetVarian: item.omzet,
      hppModalPerUnit: item.hppModal,
      totalHppVarian,
      alokasiAdminVarian,
      labaBersihVarian,
      marginVarian,
    });
  }

  // Sort by highest omzet
  variantBreakdown.sort((a, b) => b.omzetVarian - a.omzetVarian);

  // 5. Loss Audit: Shipping Fee Discrepancy
  const discrepancies: ShippingDiscrepancy[] = [];
  let totalDiscrepancyLoss = 0;

  // Audit from Order files
  for (const ord of orders) {
    if (ord.shippingChargedByCourier > ord.shippingPaidByBuyer && ord.shippingChargedByCourier > 0) {
      const diff = ord.shippingChargedByCourier - ord.shippingPaidByBuyer;
      discrepancies.push({
        orderId: ord.orderId,
        date: ord.orderDate,
        shippingBuyer: ord.shippingPaidByBuyer,
        shippingCourier: ord.shippingChargedByCourier,
        discrepancy: diff,
      });
      totalDiscrepancyLoss += diff;
    }
  }

  // Audit from Income files (Ongkos Kirim yang Dikenakan ke Penjual / Selisih)
  for (const inc of incomeItems) {
    if (inc.shippingSeller > 0) {
      // Avoid duplicate order id
      if (!discrepancies.some(d => d.orderId === inc.orderId)) {
        discrepancies.push({
          orderId: inc.orderId,
          date: inc.releaseDate,
          shippingBuyer: 0,
          shippingCourier: inc.shippingSeller,
          discrepancy: inc.shippingSeller,
        });
        totalDiscrepancyLoss += inc.shippingSeller;
      }
    }
  }

  // 6. Loss Audit: Stuck RTS & RR Packages
  let totalRtsLoss = 0;
  for (const rts of rtsRrItems) {
    if (rts.isStuck) {
      totalRtsLoss += rts.lossValueHpp;
    }
  }

  // 7. Store Consolidated Net Profit
  // Laba Bersih = Total Pendapatan Dilepas - (Total HPP Terjual + Biaya Admin & Layanan + Biaya Iklan Inc. PPN + Biaya Operasional Manual)
  const labaBersihKonsolidasi = totalPendapatanDilepas - (
    totalHppTerjual +
    totalAdminLayanan +
    totalBiayaIklanIncPpn +
    biayaOperasionalManual
  );

  const marginKonsolidasi = totalPendapatanDilepas > 0
    ? (labaBersihKonsolidasi / totalPendapatanDilepas) * 100
    : 0;

  // Determine period from income items or orders
  const dates = [
    ...incomeItems.map(i => i.releaseDate),
    ...orders.map(o => o.orderDate),
  ].filter(Boolean);
  dates.sort();
  const startDate = dates[0] || new Date().toISOString().split('T')[0];
  const endDate = dates[dates.length - 1] || startDate;
  const periode = startDate === endDate ? startDate : `${startDate} s/d ${endDate}`;

  return {
    id: `audit_shopee_${Date.now()}`,
    periode,
    createdAt: new Date().toISOString(),
    orderCount: matchedOrderIds.size || orders.length,
    totalQtySold,
    totalOmzetToko,
    totalPendapatanDilepas,
    totalAdminLayanan,
    totalHppTerjual,
    totalBiayaIklanIncPpn,
    biayaIklanManual,
    biayaOperasionalManual,
    labaBersihKonsolidasi,
    marginKonsolidasi,
    variantBreakdown,
    discrepancies,
    totalDiscrepancyLoss,
    rtsPackages: rtsRrItems,
    totalRtsLoss,
    unmappedSkus: Array.from(unmappedSkuMap.values()),
  };
}
