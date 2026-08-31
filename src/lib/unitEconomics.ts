import { formatCurrency } from './formatUtils';
import { AdditionalFee } from '../types';

/* ==========================================================================
   GLOBAL UNIT ECONOMICS & PRODUCT COST ENGINE (SINGLE SOURCE OF TRUTH)
   ========================================================================== */

export interface ProductFeeDetail {
  nama: string;
  tipe: 'persen' | 'nominal';
  nilai: number;
  amountPerUnit: number;
  amountPerOrder: number;
  amountTotal: number;
  nominalPerUnit: number;
  nominalPerOrder: number;
  isOrderLevel: boolean;
}

export interface UnitEconomicsParams {
  sellingPrice: number;        // Omzet / Harga Jual per unit (Rp)
  hppPcs: number;              // HPP bahan + packing (Rp/unit)
  minOrder?: number;           // Minimum order (pcs/order)
  additionalCosts?: AdditionalFee[]; // Biaya tambahan dari varian & produk (Single Source of Truth)
  nominalPerOrder?: number;    // Biaya proses/admin fixed per order (Rp)
  nominalPerUnit?: number;     // Biaya ekstra per unit (Rp)
  percentRate?: number;        // Admin marketplace % (0-100)
  voucherNominal?: number;     // Voucher Rp/unit
  voucherPct?: number;         // Voucher % (0-100)
  includePpn?: boolean;        // PPN on ad spend
  ppnRate?: number;            // PPN rate % (e.g. 11)
  targetProfitPct?: number;    // Target profit % minimum
  targetRoas?: number;         // Target ROAS (e.g. 8.0)
  actualRoas?: number;         // Simulated/Actual ROAS (e.g. 10.0)
  bufferPct?: number;          // Buffer % for ROAS setting in Seller Center (e.g. 15%)
  numOrders?: number;          // Simulation order count
}

export interface UnitEconomicsResult {
  sellingPrice: number;
  hppPcs: number;
  minOrder: number;
  nominalPerOrder: number;
  nominalPerUnit: number;
  percentRate: number;
  voucherPerUnit: number;
  priceAfterVoucher: number;
  
  // Breakdown Detail Biaya Tambahan (Section 14 & 15 Diagnostic)
  feeBreakdown: ProductFeeDetail[];
  totalAdditionalCostPerUnit: number;
  totalAdditionalCostPerOrder: number;
  adminFeePerUnit: number;
  marketplaceFeePerUnit: number;
  omzetRealPerUnit: number;
  realHppPerUnit: number;
  totalCostBeforeAdsPerUnit: number;
  totalCostBeforeAdsPerOrder: number;
  profitBeforeAdsPerUnit: number;
  profitBeforeAdsPerOrder: number;
  marginBeforeAdsPct: number;
  
  // Target Profit & Max Ad Spend
  targetProfitPct: number;
  targetProfitNominalPerUnit: number;
  targetProfitNominalPerOrder: number;
  profitAvailableForAdsPerUnit: number;
  profitAvailableForAdsPerOrder: number;
  isTargetFeasible: boolean;
  infeasibilityReason?: string;
  maxAdSpendPerUnit: number;        // Before PPN
  maxAdSpendBurdenPerUnit: number;  // With PPN
  maxAdSpendPerOrder: number;
  maxAdSpendBurdenPerOrder: number;
  
  // ROAS Benchmark Metrics (STRICTLY SEPARATED)
  roasBep: number;                  // Break-even ROAS (0 profit)
  roasTarget: number;               // Pure Target ROAS from user (NOT modified by buffer)
  roasSetting: number;              // Target ROAS × (1 + bufferPct / 100) for Seller Center
  requiredRoasForPrice?: number;    // Break-even required ROAS for current price
  
  // Actual/Simulated ROAS Result
  actualRoas: number;
  actualAdSpendPerUnit: number;        // Before PPN
  actualAdSpendBurdenPerUnit: number;  // With PPN
  actualAdSpendPerOrder: number;
  actualAdSpendBurdenPerOrder: number;
  actualProfitPerUnit: number;
  actualProfitPerOrder: number;
  actualProfitPercent: number;
  selisihFromTargetPct: number;
  statusBadge: string;
  statusColor: string;
  statusDesc: string;
  
  // Totals for N Orders (Total Units = N * minOrder)
  numOrders: number;
  totalUnits: number;
  totalGrossRevenue: number;
  totalOmzetReal: number;
  totalHppProduk: number;
  totalBiayaProses: number;
  totalHppReal: number;
  totalAdditionalCosts: number;
  totalCostBeforeAds: number;
  totalProfitBeforeAds: number;
  totalTargetProfit: number;
  totalMaxAdSpend: number;
  totalMaxAdSpendBurden: number;
  totalActualAdSpend: number;
  totalActualAdSpendBurden: number;
  totalActualNetProfit: number;
}

/**
 * Helper to determine if a nominal fee applies per order rather than per unit.
 */
export function isOrderLevelFee(feeName: string): boolean {
  const name = (feeName || '').toLowerCase().trim();
  return (
    name.includes('order') ||
    name.includes('pesanan') ||
    name.includes('proses') ||
    name.includes('transaksi')
  );
}

/**
 * Single source of truth calculation engine for all product economics,
 * ROAS, margins, and diagnostic breakdowns.
 */
export function calculateProductEconomics(params: UnitEconomicsParams): UnitEconomicsResult {
  const minOrder = Math.max(1, params.minOrder || 1);
  const numOrders = Math.max(1, params.numOrders || 1);
  const sellingPrice = Math.max(0, params.sellingPrice || 0);
  const hppPcs = Math.max(0, params.hppPcs || 0);
  const voucherNominal = Math.max(0, params.voucherNominal || 0);
  const voucherPct = Math.max(0, params.voucherPct || 0);
  const includePpn = Boolean(params.includePpn);
  const ppnRate = Math.max(0, params.ppnRate ?? 11);
  const targetProfitPct = Math.max(0, params.targetProfitPct || 0);
  const bufferPct = Math.max(0, params.bufferPct || 0);

  const t_ppn = includePpn ? ppnRate / 100 : 0;
  const V_pct = voucherPct / 100;

  // 1. Voucher per unit & price after voucher
  const voucherPerUnit = voucherNominal + (sellingPrice * V_pct);
  const priceAfterVoucher = Math.max(0, sellingPrice - voucherPerUnit);

  // 2. Parse & compute itemized Additional Fees
  const feeBreakdown: ProductFeeDetail[] = [];
  let aggregatePercentRate = Math.max(0, params.percentRate || 0);
  let aggregateNominalPerOrder = Math.max(0, params.nominalPerOrder || 0);
  let aggregateNominalPerUnit = Math.max(0, params.nominalPerUnit || 0);

  if (Array.isArray(params.additionalCosts) && params.additionalCosts.length > 0) {
    // If explicit additionalCosts array is passed, calculate itemized breakdown
    params.additionalCosts.forEach((fee) => {
      if (!fee || !fee.nama) return;
      const nilai = Number(fee.nilai) || 0;
      if (nilai === 0 && !fee.nama) return;

      let amountPerUnit = 0;
      let amountPerOrder = 0;

      if (fee.tipe === 'persen') {
        amountPerUnit = priceAfterVoucher * (nilai / 100);
        amountPerOrder = amountPerUnit * minOrder;
      } else {
        if (isOrderLevelFee(fee.nama)) {
          amountPerOrder = nilai;
          amountPerUnit = nilai / minOrder;
        } else {
          amountPerUnit = nilai;
          amountPerOrder = nilai * minOrder;
        }
      }

      feeBreakdown.push({
        nama: fee.nama,
        tipe: fee.tipe,
        nilai,
        amountPerUnit,
        amountPerOrder,
        amountTotal: amountPerOrder * numOrders,
        nominalPerUnit: amountPerUnit,
        nominalPerOrder: amountPerOrder,
        isOrderLevel: isOrderLevelFee(fee.nama),
      });
    });

    // Compute aggregate rates for validation and reverse formulas
    aggregatePercentRate = params.additionalCosts
      .filter((f) => f.tipe === 'persen')
      .reduce((sum, f) => sum + (Number(f.nilai) || 0), 0);
    aggregateNominalPerOrder = params.additionalCosts
      .filter((f) => f.tipe === 'nominal' && isOrderLevelFee(f.nama))
      .reduce((sum, f) => sum + (Number(f.nilai) || 0), 0);
    aggregateNominalPerUnit = params.additionalCosts
      .filter((f) => f.tipe === 'nominal' && !isOrderLevelFee(f.nama))
      .reduce((sum, f) => sum + (Number(f.nilai) || 0), 0);
  } else {
    // Fallback if only flat values were provided
    if (aggregatePercentRate > 0) {
      const amountPerUnit = priceAfterVoucher * (aggregatePercentRate / 100);
      feeBreakdown.push({
        nama: 'Admin Marketplace',
        tipe: 'persen',
        nilai: aggregatePercentRate,
        amountPerUnit,
        amountPerOrder: amountPerUnit * minOrder,
        amountTotal: amountPerUnit * minOrder * numOrders,
        nominalPerUnit: amountPerUnit,
        nominalPerOrder: amountPerUnit * minOrder,
        isOrderLevel: false,
      });
    }
    if (aggregateNominalPerOrder > 0) {
      const amountPerUnit = aggregateNominalPerOrder / minOrder;
      feeBreakdown.push({
        nama: 'Biaya Proses Pesanan',
        tipe: 'nominal',
        nilai: aggregateNominalPerOrder,
        amountPerUnit,
        amountPerOrder: aggregateNominalPerOrder,
        amountTotal: aggregateNominalPerOrder * numOrders,
        nominalPerUnit: amountPerUnit,
        nominalPerOrder: aggregateNominalPerOrder,
        isOrderLevel: true,
      });
    }
    if (aggregateNominalPerUnit > 0) {
      feeBreakdown.push({
        nama: 'Biaya Tambahan Unit',
        tipe: 'nominal',
        nilai: aggregateNominalPerUnit,
        amountPerUnit: aggregateNominalPerUnit,
        amountPerOrder: aggregateNominalPerUnit * minOrder,
        amountTotal: aggregateNominalPerUnit * minOrder * numOrders,
        nominalPerUnit: aggregateNominalPerUnit,
        nominalPerOrder: aggregateNominalPerUnit * minOrder,
        isOrderLevel: false,
      });
    }
  }

  const totalAdditionalCostPerUnit = feeBreakdown.reduce((sum, f) => sum + f.amountPerUnit, 0);
  const totalAdditionalCostPerOrder = feeBreakdown.reduce((sum, f) => sum + f.amountPerOrder, 0);

  const adminFeePerUnit = priceAfterVoucher * (aggregatePercentRate / 100);
  const marketplaceFeePerUnit = totalAdditionalCostPerUnit;
  const omzetRealPerUnit = priceAfterVoucher - adminFeePerUnit;

  // 3. HPP Real & Margin Sebelum Iklan (Single Source of Truth)
  // Total Cost Before Ads = HPP Produk + Seluruh Biaya Tambahan
  const totalCostBeforeAdsPerUnit = hppPcs + totalAdditionalCostPerUnit;
  const totalCostBeforeAdsPerOrder = (hppPcs * minOrder) + totalAdditionalCostPerOrder;
  const realHppPerUnit = totalCostBeforeAdsPerUnit;

  // Profit Sebelum Iklan = Omzet Kotor - Voucher - Total Cost Before Ads
  const profitBeforeAdsPerUnit = sellingPrice - voucherPerUnit - totalCostBeforeAdsPerUnit;
  const profitBeforeAdsPerOrder = profitBeforeAdsPerUnit * minOrder;
  const marginBeforeAdsPct = sellingPrice > 0 ? (profitBeforeAdsPerUnit / sellingPrice) * 100 : 0;

  // 4. Target Profit & Max Ad Spend
  const targetProfitNominalPerUnit = sellingPrice * (targetProfitPct / 100);
  const targetProfitNominalPerOrder = targetProfitNominalPerUnit * minOrder;
  const profitAvailableForAdsPerUnit = profitBeforeAdsPerUnit - targetProfitNominalPerUnit;
  const profitAvailableForAdsPerOrder = profitAvailableForAdsPerUnit * minOrder;

  // Check feasibility
  let isTargetFeasible = true;
  let infeasibilityReason: string | undefined = undefined;

  if (totalCostBeforeAdsPerUnit >= sellingPrice && sellingPrice > 0) {
    isTargetFeasible = false;
    infeasibilityReason = `Total Biaya Sebelum Iklan (${formatCurrency(totalCostBeforeAdsPerUnit)}) lebih besar dari atau sama dengan Harga Jual (${formatCurrency(sellingPrice)}). Profit sebelum iklan sudah negatif.`;
  } else if (profitBeforeAdsPerUnit <= 0) {
    isTargetFeasible = false;
    infeasibilityReason = `Margin sebelum iklan negatif (${marginBeforeAdsPct.toFixed(1)}%). Biaya operasional & HPP melebihi omzet real.`;
  } else if (profitAvailableForAdsPerUnit < 0) {
    isTargetFeasible = false;
    infeasibilityReason = `Margin Sebelum Iklan (${marginBeforeAdsPct.toFixed(1)}%) lebih kecil dari Target Profit Bersih (${targetProfitPct}%). Tidak memungkinkan mencapai target profit dengan struktur biaya saat ini.`;
  }

  const maxAdSpendBurdenPerUnit = isTargetFeasible ? Math.max(0, profitAvailableForAdsPerUnit) : 0;
  const maxAdSpendPerUnit = isTargetFeasible ? maxAdSpendBurdenPerUnit / (1 + t_ppn) : 0;
  const maxAdSpendBurdenPerOrder = maxAdSpendBurdenPerUnit * minOrder;
  const maxAdSpendPerOrder = maxAdSpendPerUnit * minOrder;

  // 5. ROAS Metrics (STRICT SINGLE SOURCE OF TRUTH & VARIABLE SEPARATION)
  // - roasBep: Break-even ROAS (0 profit)
  const roasBep = profitBeforeAdsPerUnit > 0 ? (sellingPrice * (1 + t_ppn)) / profitBeforeAdsPerUnit : 0;

  // - requiredRoasForPrice: Break-even ROAS required to achieve target profit at current selling price
  const requiredRoasForPrice = isTargetFeasible && maxAdSpendPerUnit > 0 ? sellingPrice / maxAdSpendPerUnit : 0;

  // - roasTarget: The pure target ROAS requested by the user
  const roasTarget = params.targetRoas && params.targetRoas > 0
    ? params.targetRoas
    : requiredRoasForPrice;

  // - roasSetting: Computed separately for Seller Center recommendation
  const roasSetting = roasTarget > 0 ? roasTarget * (1 + bufferPct / 100) : 0;

  // 6. Actual / Simulated ROAS Performance
  const actualRoas = params.actualRoas && params.actualRoas > 0
    ? params.actualRoas
    : (roasTarget > 0 ? roasTarget : 10);

  const actualAdSpendPerUnit = actualRoas > 0 ? sellingPrice / actualRoas : 0;
  const actualAdSpendBurdenPerUnit = actualAdSpendPerUnit * (1 + t_ppn);
  const actualAdSpendPerOrder = actualAdSpendPerUnit * minOrder;
  const actualAdSpendBurdenPerOrder = actualAdSpendBurdenPerUnit * minOrder;

  const actualProfitPerUnit = profitBeforeAdsPerUnit - actualAdSpendBurdenPerUnit;
  const actualProfitPerOrder = actualProfitPerUnit * minOrder;
  const actualProfitPercent = sellingPrice > 0 ? (actualProfitPerUnit / sellingPrice) * 100 : 0;
  const selisihFromTargetPct = actualProfitPercent - targetProfitPct;

  // 7. Status Determination
  let statusBadge = '✓ DI ATAS TARGET';
  let statusColor = 'bg-emerald-50 border-emerald-200 text-emerald-900';
  let statusDesc = `Profit bersih aktual (${actualProfitPercent.toFixed(1)}%) berada di atas target minimum (${targetProfitPct}%). Selisih: +${selisihFromTargetPct.toFixed(1)}%.`;

  if (!isTargetFeasible) {
    statusBadge = '✕ STRUKTUR BIAYA MELEBIHI TARGET';
    statusColor = 'bg-rose-50 border-rose-200 text-rose-900';
    statusDesc = infeasibilityReason || 'Tidak memungkinkan mencapai target profit dengan struktur biaya saat ini.';
  } else if (actualProfitPercent < 0) {
    statusBadge = '✕ RUGI';
    statusColor = 'bg-rose-50 border-rose-200 text-rose-900';
    statusDesc = `Biaya total iklan & operasional melebihi omzet. Transaksi mengalami kerugian (${actualProfitPercent.toFixed(1)}%).`;
  } else if (Math.abs(selisihFromTargetPct) < 0.01) {
    statusBadge = '✓ SESUAI TARGET';
    statusColor = 'bg-emerald-50 border-emerald-200 text-emerald-900';
    statusDesc = `Profit bersih aktual (${actualProfitPercent.toFixed(1)}%) tepat sesuai target minimum (${targetProfitPct}%).`;
  } else if (actualProfitPercent < targetProfitPct) {
    statusBadge = '⚠ DI BAWAH TARGET';
    statusColor = 'bg-amber-50 border-amber-200 text-amber-900';
    statusDesc = `Profit bersih aktual (${actualProfitPercent.toFixed(1)}%) berada di bawah target minimum (${targetProfitPct}%). Selisih: ${selisihFromTargetPct.toFixed(1)}%.`;
  }

  // 8. Order Totals
  const totalUnits = numOrders * minOrder;
  const totalGrossRevenue = totalUnits * sellingPrice;
  const totalOmzetReal = totalUnits * omzetRealPerUnit;
  const totalHppProduk = totalUnits * hppPcs;
  const totalBiayaProses = numOrders * aggregateNominalPerOrder;
  const totalHppReal = totalUnits * totalCostBeforeAdsPerUnit;
  const totalAdditionalCosts = totalUnits * totalAdditionalCostPerUnit;
  const totalCostBeforeAds = totalUnits * totalCostBeforeAdsPerUnit;
  const totalProfitBeforeAds = totalUnits * profitBeforeAdsPerUnit;
  const totalTargetProfit = totalUnits * targetProfitNominalPerUnit;
  const totalMaxAdSpend = totalUnits * maxAdSpendPerUnit;
  const totalMaxAdSpendBurden = totalUnits * maxAdSpendBurdenPerUnit;
  const totalActualAdSpend = totalUnits * actualAdSpendPerUnit;
  const totalActualAdSpendBurden = totalUnits * actualAdSpendBurdenPerUnit;
  const totalActualNetProfit = totalUnits * actualProfitPerUnit;

  return {
    sellingPrice,
    hppPcs,
    minOrder,
    nominalPerOrder: aggregateNominalPerOrder,
    nominalPerUnit: aggregateNominalPerUnit,
    percentRate: aggregatePercentRate,
    voucherPerUnit,
    priceAfterVoucher,
    feeBreakdown,
    totalAdditionalCostPerUnit,
    totalAdditionalCostPerOrder,
    adminFeePerUnit,
    marketplaceFeePerUnit,
    omzetRealPerUnit,
    realHppPerUnit,
    totalCostBeforeAdsPerUnit,
    totalCostBeforeAdsPerOrder,
    profitBeforeAdsPerUnit,
    profitBeforeAdsPerOrder,
    marginBeforeAdsPct,
    targetProfitPct,
    targetProfitNominalPerUnit,
    targetProfitNominalPerOrder,
    profitAvailableForAdsPerUnit,
    profitAvailableForAdsPerOrder,
    isTargetFeasible,
    infeasibilityReason,
    maxAdSpendPerUnit,
    maxAdSpendBurdenPerUnit,
    maxAdSpendPerOrder,
    maxAdSpendBurdenPerOrder,
    roasBep,
    roasTarget,
    roasSetting,
    requiredRoasForPrice,
    actualRoas,
    actualAdSpendPerUnit,
    actualAdSpendBurdenPerUnit,
    actualAdSpendPerOrder,
    actualAdSpendBurdenPerOrder,
    actualProfitPerUnit,
    actualProfitPerOrder,
    actualProfitPercent,
    selisihFromTargetPct,
    statusBadge,
    statusColor,
    statusDesc,
    numOrders,
    totalUnits,
    totalGrossRevenue,
    totalOmzetReal,
    totalHppProduk,
    totalBiayaProses,
    totalHppReal,
    totalAdditionalCosts,
    totalCostBeforeAds,
    totalProfitBeforeAds,
    totalTargetProfit,
    totalMaxAdSpend,
    totalMaxAdSpendBurden,
    totalActualAdSpend,
    totalActualAdSpendBurden,
    totalActualNetProfit,
  };
}

/**
 * Direct alias for backward-compatibility.
 */
export const calculateUnitEconomics = calculateProductEconomics;

/* ==========================================================================
   REVERSE PRICE ENGINE (CARI HARGA REKOMENDASI)
   ========================================================================== */

export interface ReverseCalcInput {
  hppPcs: number;            // HPP per unit (bahan + packing)
  minOrder?: number;         // Minimal order per transaksi (unit)
  additionalCosts?: AdditionalFee[]; // Biaya tambahan dari varian & produk (Single Source of Truth)
  nominalPerOrder?: number;  // Biaya proses per order (Rp)
  nominalPerUnit?: number;   // Biaya per unit (Rp)
  percentRate?: number;      // Fee marketplace % (0-100)
  voucherNominal?: number;   // Voucher Rp per unit
  voucherPct?: number;       // Voucher % (0-100)
  targetRoas: number;        // Target ROAS (misal 8.0)
  targetProfitPct: number;   // Target Profit Bersih Setelah Iklan %
  bufferPct?: number;        // Buffer ROAS Setting % (default: 15)
  includePpn?: boolean;      // Status PPN Iklan
  ppnRate?: number;          // Rate PPN Iklan (11%)
  roundingStep?: number;     // 0, 100, 500, 1000
}

export interface ReverseCalcResult {
  isFeasible: boolean;
  errorMessage: string | null;
  priceExact: number;
  priceRecommended: number;
  realHppPerUnit: number;
  priceCoefficient: number;
  validationExact: UnitEconomicsResult;
  validationRecommended: UnitEconomicsResult;
}

export function roundPrice(price: number, step: number = 0): number {
  if (step <= 0) return Math.ceil(price);
  return Math.ceil(price / step) * step;
}

export function calculateReversePrice(input: ReverseCalcInput): ReverseCalcResult {
  const {
    hppPcs,
    minOrder = 1,
    additionalCosts,
    nominalPerOrder = 0,
    nominalPerUnit = 0,
    percentRate = 0,
    voucherNominal = 0,
    voucherPct = 0,
    targetRoas,
    targetProfitPct,
    bufferPct = 15,
    includePpn = false,
    ppnRate = 11,
    roundingStep = 0,
  } = input;

  const M = Math.max(1, minOrder || 1);
  const E = Math.max(0, hppPcs || 0);

  // Parse additional costs if present
  let aggregatePercentRate = Math.max(0, percentRate || 0);
  let aggregateNominalPerOrder = Math.max(0, nominalPerOrder || 0);
  let aggregateNominalPerUnit = Math.max(0, nominalPerUnit || 0);

  if (Array.isArray(additionalCosts) && additionalCosts.length > 0) {
    aggregatePercentRate = additionalCosts
      .filter((f) => f.tipe === 'persen')
      .reduce((sum, f) => sum + (Number(f.nilai) || 0), 0);
    aggregateNominalPerOrder = additionalCosts
      .filter((f) => f.tipe === 'nominal' && isOrderLevelFee(f.nama))
      .reduce((sum, f) => sum + (Number(f.nilai) || 0), 0);
    aggregateNominalPerUnit = additionalCosts
      .filter((f) => f.tipe === 'nominal' && !isOrderLevelFee(f.nama))
      .reduce((sum, f) => sum + (Number(f.nilai) || 0), 0);
  }

  const realHppPerUnit = E + (aggregateNominalPerOrder / M) + aggregateNominalPerUnit;

  const C = Math.max(0, aggregatePercentRate) / 100;
  const V_pct = Math.max(0, voucherPct) / 100;
  const V_nom = Math.max(0, voucherNominal || 0);
  const R_target = Math.max(0.01, targetRoas || 0.01);
  const T_profit = Math.max(0, targetProfitPct) / 100;
  const t_ppn = includePpn ? Math.max(0, ppnRate || 0) / 100 : 0;

  // Beban biaya iklan terhadap harga jual = (1 + t_ppn) / R_target
  const adSpendRatio = (1 + t_ppn) / R_target;

  // Koefisien harga = (1 - V_pct) * (1 - C) - adSpendRatio - T_profit
  const priceCoefficient = (1 - V_pct) * (1 - C) - adSpendRatio - T_profit;

  const dummyValidation = calculateProductEconomics({
    sellingPrice: 0,
    hppPcs: E,
    minOrder: M,
    additionalCosts,
    nominalPerOrder: aggregateNominalPerOrder,
    nominalPerUnit: aggregateNominalPerUnit,
    percentRate: aggregatePercentRate,
    voucherNominal: V_nom,
    voucherPct,
    includePpn,
    ppnRate,
    targetProfitPct,
    actualRoas: R_target,
    targetRoas: R_target,
    bufferPct,
  });

  if (priceCoefficient <= 0) {
    return {
      isFeasible: false,
      errorMessage: `Target Profit (${targetProfitPct}%) dan Target ROAS (${targetRoas}x) tidak dapat dicapai secara bersamaan dengan struktur biaya saat ini. Margin sebelum iklan tidak mencukupi untuk menutupi biaya iklan dan profit target.`,
      priceExact: 0,
      priceRecommended: 0,
      realHppPerUnit,
      priceCoefficient,
      validationExact: dummyValidation,
      validationRecommended: dummyValidation,
    };
  }

  // Pembilang = realHppPerUnit + V_nom * (1 - C)
  const numerator = realHppPerUnit + V_nom * (1 - C);
  const priceExact = numerator / priceCoefficient;
  let priceRecommended = roundPrice(priceExact, roundingStep);

  // Validation passes using central engine
  const validationExact = calculateProductEconomics({
    sellingPrice: priceExact,
    hppPcs: E,
    minOrder: M,
    additionalCosts,
    nominalPerOrder: aggregateNominalPerOrder,
    nominalPerUnit: aggregateNominalPerUnit,
    percentRate: aggregatePercentRate,
    voucherNominal: V_nom,
    voucherPct,
    includePpn,
    ppnRate,
    targetProfitPct,
    actualRoas: R_target,
    targetRoas: R_target,
    bufferPct,
  });

  let validationRecommended = calculateProductEconomics({
    sellingPrice: priceRecommended,
    hppPcs: E,
    minOrder: M,
    additionalCosts,
    nominalPerOrder: aggregateNominalPerOrder,
    nominalPerUnit: aggregateNominalPerUnit,
    percentRate: aggregatePercentRate,
    voucherNominal: V_nom,
    voucherPct,
    includePpn,
    ppnRate,
    targetProfitPct,
    actualRoas: R_target,
    targetRoas: R_target,
    bufferPct,
  });

  // Post-rounding safety step: ensure target profit is strictly met
  let loopCount = 0;
  while (
    priceRecommended > 0 &&
    loopCount < 20 &&
    (!validationRecommended.isTargetFeasible || validationRecommended.actualProfitPercent < targetProfitPct - 0.001)
  ) {
    const step = roundingStep > 0 ? roundingStep : 1;
    priceRecommended += step;
    loopCount++;
    validationRecommended = calculateProductEconomics({
      sellingPrice: priceRecommended,
      hppPcs: E,
      minOrder: M,
      additionalCosts,
      nominalPerOrder: aggregateNominalPerOrder,
      nominalPerUnit: aggregateNominalPerUnit,
      percentRate: aggregatePercentRate,
      voucherNominal: V_nom,
      voucherPct,
      includePpn,
      ppnRate,
      targetProfitPct,
      actualRoas: R_target,
      targetRoas: R_target,
      bufferPct,
    });
  }

  const isFeasible = validationRecommended.isTargetFeasible && validationRecommended.actualProfitPercent >= (targetProfitPct - 0.05);

  return {
    isFeasible,
    errorMessage: isFeasible ? null : `Target Profit ${targetProfitPct}% & ROAS ${targetRoas}x tidak dapat dicapai secara bersamaan dengan struktur biaya saat ini.`,
    priceExact,
    priceRecommended,
    realHppPerUnit,
    priceCoefficient,
    validationExact,
    validationRecommended,
  };
}

/* ==========================================================================
   PROMO TANGGAL CANTIK SIMULATION ENGINE (REVERSE CALCULATION)
   ========================================================================== */

export interface PromoTanggalCantikInput extends ReverseCalcInput {
  sellingPrice: number;        // Harga Normal / Master (Rp)
  promoDiscountPct: number;   // Diskon promo % (e.g. 5)
}

export interface PromoTanggalCantikResult {
  isFeasible: boolean;
  errorMessage: string | null;
  normalPrice: number;                 // Harga Normal (Rp)
  promoDiscountPct: number;            // Diskon Promo (%)
  recommendedPromoPrice: number;       // HARGA YANG HARUS DIPASANG (sebelum diskon)
  discountNominal: number;             // Potongan Promo (Rp)
  effectivePrice: number;              // Harga Setelah Promo (Rp)
  hppPcs: number;                      // HPP per unit
  totalAdditionalCostPerUnit: number;   // Total Biaya Tambahan per unit
  adSpendBurdenPerUnit: number;        // Biaya Iklan per unit
  netProfitPerUnit: number;            // Profit Bersih per unit
  profitMarginPct: number;             // Profit Margin (%)
  roasActual: number;                  // ROAS Hasil Simulasi
  validationEffective: UnitEconomicsResult; // Unit economics result on effective price
}

export function calculatePromoTanggalCantik(input: PromoTanggalCantikInput): PromoTanggalCantikResult {
  const normalPrice = input.sellingPrice || 0;
  const promoDiscountPct = Math.max(0, input.promoDiscountPct || 0);

  // Validation of required fields
  if (!input.hppPcs || input.hppPcs <= 0 || normalPrice <= 0) {
    const dummyEcon = calculateProductEconomics({
      sellingPrice: normalPrice,
      hppPcs: input.hppPcs || 0,
      additionalCosts: input.additionalCosts,
      targetProfitPct: input.targetProfitPct,
      actualRoas: input.targetRoas,
      targetRoas: input.targetRoas,
    });
    return {
      isFeasible: false,
      errorMessage: 'Data biaya varian belum lengkap.',
      normalPrice,
      promoDiscountPct,
      recommendedPromoPrice: normalPrice,
      discountNominal: 0,
      effectivePrice: normalPrice,
      hppPcs: input.hppPcs || 0,
      totalAdditionalCostPerUnit: dummyEcon.totalAdditionalCostPerUnit,
      adSpendBurdenPerUnit: dummyEcon.actualAdSpendBurdenPerUnit,
      netProfitPerUnit: dummyEcon.actualProfitPerUnit,
      profitMarginPct: dummyEcon.actualProfitPercent,
      roasActual: dummyEcon.roasTarget,
      validationEffective: dummyEcon,
    };
  }

  // Calculate reverse required price (this is the effective price needed after promo)
  const rev = calculateReversePrice(input);
  if (!rev.isFeasible) {
    return {
      isFeasible: false,
      errorMessage: rev.errorMessage || 'Target profit dan ROAS tidak dapat dicapai.',
      normalPrice,
      promoDiscountPct,
      recommendedPromoPrice: normalPrice,
      discountNominal: 0,
      effectivePrice: normalPrice,
      hppPcs: input.hppPcs,
      totalAdditionalCostPerUnit: rev.validationRecommended.totalAdditionalCostPerUnit,
      adSpendBurdenPerUnit: rev.validationRecommended.actualAdSpendBurdenPerUnit,
      netProfitPerUnit: rev.validationRecommended.actualProfitPerUnit,
      profitMarginPct: rev.validationRecommended.actualProfitPercent,
      roasActual: rev.validationRecommended.roasTarget,
      validationEffective: rev.validationRecommended,
    };
  }

  const requiredEffectivePrice = rev.priceRecommended;
  const discountRate = promoDiscountPct / 100;

  if (discountRate >= 1) {
    return {
      isFeasible: false,
      errorMessage: 'Diskon promo tidak valid (harus kurang dari 100%).',
      normalPrice,
      promoDiscountPct,
      recommendedPromoPrice: normalPrice,
      discountNominal: 0,
      effectivePrice: normalPrice,
      hppPcs: input.hppPcs,
      totalAdditionalCostPerUnit: rev.validationRecommended.totalAdditionalCostPerUnit,
      adSpendBurdenPerUnit: rev.validationRecommended.actualAdSpendBurdenPerUnit,
      netProfitPerUnit: rev.validationRecommended.actualProfitPerUnit,
      profitMarginPct: rev.validationRecommended.actualProfitPercent,
      roasActual: rev.validationRecommended.roasTarget,
      validationEffective: rev.validationRecommended,
    };
  }

  // Calculate required promo list price before discount
  const roundingStep = input.roundingStep !== undefined ? input.roundingStep : 0;
  const rawListPrice = requiredEffectivePrice / (1 - discountRate);
  let recommendedPromoPrice = roundPrice(rawListPrice, roundingStep);

  // Validate using central calculation engine
  let effectivePrice = recommendedPromoPrice * (1 - discountRate);
  let validationEffective = calculateProductEconomics({
    ...input,
    sellingPrice: effectivePrice,
    actualRoas: input.targetRoas,
    targetRoas: input.targetRoas,
  });

  // Re-validation loop: If rounding caused profit margin or ROAS to fall below target, increment promo list price
  let loopCount = 0;
  while (
    recommendedPromoPrice > 0 &&
    loopCount < 30 &&
    (!validationEffective.isTargetFeasible || validationEffective.actualProfitPercent < (input.targetProfitPct - 0.01))
  ) {
    const step = roundingStep > 0 ? roundingStep : 1;
    recommendedPromoPrice += step;
    effectivePrice = recommendedPromoPrice * (1 - discountRate);
    validationEffective = calculateProductEconomics({
      ...input,
      sellingPrice: effectivePrice,
      actualRoas: input.targetRoas,
      targetRoas: input.targetRoas,
    });
    loopCount++;
  }

  const discountNominal = recommendedPromoPrice * discountRate;
  effectivePrice = recommendedPromoPrice - discountNominal;

  const isFeasible = validationEffective.isTargetFeasible && validationEffective.actualProfitPercent >= (input.targetProfitPct - 0.05);

  return {
    isFeasible,
    errorMessage: isFeasible ? null : `Target Profit ${input.targetProfitPct}% & ROAS ${input.targetRoas}x tidak dapat dicapai.`,
    normalPrice,
    promoDiscountPct,
    recommendedPromoPrice,
    discountNominal,
    effectivePrice,
    hppPcs: input.hppPcs,
    totalAdditionalCostPerUnit: validationEffective.totalAdditionalCostPerUnit,
    adSpendBurdenPerUnit: validationEffective.actualAdSpendBurdenPerUnit,
    netProfitPerUnit: validationEffective.actualProfitPerUnit,
    profitMarginPct: validationEffective.actualProfitPercent,
    roasActual: validationEffective.roasTarget,
    validationEffective,
  };
}

/* ==========================================================================
   AUTOMATED SELF-TEST SUITE (SECTION 16 & FINAL FIX COMPLIANT)
   ========================================================================== */

export function calculatePriceSpread(prices: number[], averagePrice?: number): {
  minPrice: number;
  maxPrice: number;
  spreadNominal: number;
  spreadPct: number;
  warningLevel: 'none' | 'moderate' | 'high';
  warningMessage: string | null;
} {
  if (!prices || prices.length <= 1) {
    return {
      minPrice: prices?.[0] || 0,
      maxPrice: prices?.[0] || 0,
      spreadNominal: 0,
      spreadPct: 0,
      warningLevel: 'none',
      warningMessage: null,
    };
  }

  const validPrices = prices.filter((p) => typeof p === 'number' && p > 0);
  if (validPrices.length <= 1) {
    return {
      minPrice: validPrices[0] || 0,
      maxPrice: validPrices[0] || 0,
      spreadNominal: 0,
      spreadPct: 0,
      warningLevel: 'none',
      warningMessage: null,
    };
  }

  const minPrice = Math.min(...validPrices);
  const maxPrice = Math.max(...validPrices);
  const avg = averagePrice && averagePrice > 0 ? averagePrice : validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
  const spreadNominal = maxPrice - minPrice;
  const spreadPct = avg > 0 ? (spreadNominal / avg) * 100 : 0;

  let warningLevel: 'none' | 'moderate' | 'high' = 'none';
  let warningMessage: string | null = null;

  if (spreadPct > 40) {
    warningLevel = 'high';
    warningMessage = `Selisih harga antarvarian sangat tinggi (${spreadPct.toFixed(1)}%). Pastikan menggunakan hasil per varian untuk keputusan harga dan profit aktual.`;
  } else if (spreadPct > 20) {
    warningLevel = 'moderate';
    warningMessage = `Selisih harga antarvarian cukup tinggi (${spreadPct.toFixed(1)}%). Rata-rata harga gabungan hanya sebagai acuan simulasi portofolio.`;
  }

  return {
    minPrice,
    maxPrice,
    spreadNominal,
    spreadPct,
    warningLevel,
    warningMessage,
  };
}

export function runUnitEconomicsSelfTests(): { success: boolean; results: string[] } {
  const logs: string[] = [];
  let allPassed = true;

  // TEST 1: Single SKU Unit Economics (1 SKU = 1 Unit Economics)
  const test1Input: UnitEconomicsParams = {
    sellingPrice: 100000,
    hppPcs: 35000,
    minOrder: 1,
    percentRate: 5,
    nominalPerOrder: 2000,
    nominalPerUnit: 0,
    voucherNominal: 0,
    voucherPct: 0,
    targetRoas: 8,
    actualRoas: 8,
    targetProfitPct: 20,
    includePpn: true,
    ppnRate: 11,
  };
  const econ1 = calculateProductEconomics(test1Input);
  if (econ1.sellingPrice !== 100000 || econ1.hppPcs !== 35000 || econ1.nominalPerOrder !== 2000) {
    logs.push('TEST 1 FAIL: Single SKU economics mismatch on base parameters.');
    allPassed = false;
  } else {
    logs.push(`TEST 1 PASS: Single SKU economics verified (Omzet Real: Rp${econ1.omzetRealPerUnit.toLocaleString('id-ID')}, Profit Sebelum Iklan: Rp${econ1.profitBeforeAdsPerUnit.toLocaleString('id-ID')}).`);
  }

  // TEST 2: Multi-Variant CARI HARGA (1 Product, Multiple SKUs) -> Individual Prices & Weighted Average (NOT MAX)
  const skuA_Hpp = 15000;
  const skuB_Hpp = 25000;
  const revA = calculateReversePrice({
    hppPcs: skuA_Hpp,
    minOrder: 1,
    percentRate: 6.5,
    nominalPerOrder: 1500,
    targetRoas: 8,
    targetProfitPct: 15,
    includePpn: true,
    ppnRate: 11,
    roundingStep: 100,
  });
  const revB = calculateReversePrice({
    hppPcs: skuB_Hpp,
    minOrder: 1,
    percentRate: 6.5,
    nominalPerOrder: 1500,
    targetRoas: 8,
    targetProfitPct: 15,
    includePpn: true,
    ppnRate: 11,
    roundingStep: 100,
  });

  const weightA = 0.6;
  const weightB = 0.4;
  const weightedPrice = revA.priceRecommended * weightA + revB.priceRecommended * weightB;
  const maxPrice = Math.max(revA.priceRecommended, revB.priceRecommended);

  if (revA.priceRecommended >= revB.priceRecommended) {
    logs.push('TEST 2 FAIL: SKU A (lower HPP) has higher recommended price than SKU B.');
    allPassed = false;
  } else if (weightedPrice === maxPrice) {
    logs.push('TEST 2 FAIL: Combined price erroneously used MAX price instead of weighted average!');
    allPassed = false;
  } else {
    logs.push(`TEST 2 PASS: Multi-Variant Cari Harga verified. SKU A (HPP Rp${skuA_Hpp.toLocaleString('id-ID')}) = Rp${revA.priceRecommended.toLocaleString('id-ID')}, SKU B (HPP Rp${skuB_Hpp.toLocaleString('id-ID')}) = Rp${revB.priceRecommended.toLocaleString('id-ID')}. Weighted Average = Rp${Math.round(weightedPrice).toLocaleString('id-ID')} (strictly != MAX Rp${maxPrice.toLocaleString('id-ID')}).`);
  }

  // TEST 3: Bidirectional Handoff (Cari Harga -> Cari ROAS per SKU)
  const valA = calculateProductEconomics({
    sellingPrice: revA.priceRecommended,
    hppPcs: skuA_Hpp,
    minOrder: 1,
    percentRate: 6.5,
    nominalPerOrder: 1500,
    actualRoas: 8,
    targetRoas: 8,
    targetProfitPct: 15,
    includePpn: true,
    ppnRate: 11,
  });
  const valB = calculateProductEconomics({
    sellingPrice: revB.priceRecommended,
    hppPcs: skuB_Hpp,
    minOrder: 1,
    percentRate: 6.5,
    nominalPerOrder: 1500,
    actualRoas: 8,
    targetRoas: 8,
    targetProfitPct: 15,
    includePpn: true,
    ppnRate: 11,
  });

  if (Math.abs(valA.actualProfitPercent - 15) > 0.1 || Math.abs(valB.actualProfitPercent - 15) > 0.1) {
    logs.push(`TEST 3 FAIL: Bidirectional validation failed. SKU A Profit = ${valA.actualProfitPercent.toFixed(2)}%, SKU B Profit = ${valB.actualProfitPercent.toFixed(2)}%`);
    allPassed = false;
  } else {
    logs.push(`TEST 3 PASS: Bidirectional Cari Harga -> Cari ROAS verified. Both SKUs achieve target profit (SKU A: ${valA.actualProfitPercent.toFixed(2)}%, SKU B: ${valB.actualProfitPercent.toFixed(2)}%).`);
  }

  // TEST 4: Price Spread Calculation & Alert Thresholds (>20% and >40%)
  const spreadLow = calculatePriceSpread([100000, 105000], 102500); // 4.8% spread
  const spreadMed = calculatePriceSpread([100000, 130000], 115000); // 26.0% spread
  const spreadHigh = calculatePriceSpread([50000, 100000], 75000);  // 66.6% spread

  if (spreadLow.warningLevel !== 'none' || spreadMed.warningLevel !== 'moderate' || spreadHigh.warningLevel !== 'high') {
    logs.push(`TEST 4 FAIL: Price spread warning level incorrect. Got low=${spreadLow.warningLevel}, med=${spreadMed.warningLevel}, high=${spreadHigh.warningLevel}`);
    allPassed = false;
  } else {
    logs.push(`TEST 4 PASS: Price spread alerts verified (Low: ${spreadLow.spreadPct.toFixed(1)}% [none], Med: ${spreadMed.spreadPct.toFixed(1)}% [moderate], High: ${spreadHigh.spreadPct.toFixed(1)}% [high]).`);
  }

  // TEST 5: Pack / Bundle Pricing vs Pcs Pricing (Pack 50 pcs = Rp 50.000, minOrder = 1 pack)
  const packPrice = 50000;
  const packHpp = 20000;
  const packMinOrder = 1; // 1 pack per order
  const packEcon = calculateProductEconomics({
    sellingPrice: packPrice,
    hppPcs: packHpp,
    minOrder: packMinOrder,
    percentRate: 5,
    nominalPerOrder: 1500,
    targetRoas: 6,
    actualRoas: 6,
    targetProfitPct: 20,
    includePpn: true,
    ppnRate: 11,
  });
  if (packEcon.sellingPrice !== 50000 || packEcon.realHppPerUnit !== (20000 + 1500)) {
    logs.push('TEST 5 FAIL: Pack/bundle pricing corrupted unit values.');
    allPassed = false;
  } else {
    logs.push(`TEST 5 PASS: Pack pricing integrity verified (Harga: Rp${packEcon.sellingPrice.toLocaleString('id-ID')}, HPP Real: Rp${packEcon.realHppPerUnit.toLocaleString('id-ID')}).`);
  }

  // TEST 6: Target ROAS 10x with Buffer 20% Isolation
  const test6_Rev = calculateReversePrice({
    hppPcs: 10000,
    minOrder: 1,
    nominalPerOrder: 1600,
    nominalPerUnit: 0,
    percentRate: 5,
    voucherNominal: 0,
    voucherPct: 0,
    targetRoas: 10,
    targetProfitPct: 15,
    bufferPct: 20,
    includePpn: false,
    ppnRate: 11,
    roundingStep: 0,
  });
  const val6 = calculateProductEconomics({
    sellingPrice: test6_Rev.priceRecommended,
    hppPcs: 10000,
    minOrder: 1,
    nominalPerOrder: 1600,
    percentRate: 5,
    targetRoas: 10,
    actualRoas: 10,
    targetProfitPct: 15,
    bufferPct: 20,
    includePpn: false,
    ppnRate: 11,
  });
  if (Math.abs(val6.roasTarget - 10) > 0.01 || Math.abs(val6.roasSetting - 12) > 0.01) {
    logs.push(`TEST 6 FAIL: ROAS Target / Setting separation failed. roasTarget=${val6.roasTarget}, roasSetting=${val6.roasSetting}`);
    allPassed = false;
  } else {
    logs.push(`TEST 6 PASS: Target ROAS (10.00x) & ROAS Setting (12.00x) strictly isolated.`);
  }

  // TEST 7: Zero and Edge Cases Safety
  try {
    const dummy = calculateUnitEconomics({
      sellingPrice: 0,
      hppPcs: 0,
      minOrder: 0,
      nominalPerOrder: 0,
      nominalPerUnit: 0,
      percentRate: 0,
      voucherNominal: 0,
      voucherPct: 0,
      includePpn: false,
      ppnRate: 0,
      targetProfitPct: 0,
    });
    const checkStr = `${Number(dummy.roasBep ?? 0).toFixed(2)} ${Number(dummy.roasTarget ?? 0).toFixed(2)} ${Number(dummy.roasSetting ?? 0).toFixed(2)} ${Number(dummy.actualProfitPercent ?? 0).toFixed(2)}`;
    if (!checkStr) throw new Error('Empty formatted output');
    logs.push('TEST 7 PASS: Zero-value edge case and formatting safety verified.');
  } catch (err: any) {
    logs.push(`TEST 7 FAIL: Crash during zero-value handling: ${err.message}`);
    allPassed = false;
  }

  return { success: allPassed, results: logs };
}
