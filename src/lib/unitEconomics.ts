import { formatCurrency } from './formatUtils';

/* ==========================================================================
   GLOBAL UNIT ECONOMICS SERVICE (SINGLE SOURCE OF TRUTH)
   ========================================================================== */

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
   AUTOMATED SELF-TEST SUITE (SECTION 16 COMPLIANT)
   ========================================================================== */

export function runUnitEconomicsSelfTests(): { success: boolean; results: string[] } {
  const logs: string[] = [];
  let allPassed = true;

  // TEST A: Target ROAS 10x -> Cari Harga -> Harga X -> Cari ROAS -> Expected 10x ±0.01, Profit >= 15%
  const testAInput: ReverseCalcInput = {
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
  };
  const revA = calculateReversePrice(testAInput);
  if (!revA.isFeasible) {
    logs.push('TEST A FAIL: Reverse calculation infeasible for 10x ROAS.');
    allPassed = false;
  } else {
    const valA = calculateUnitEconomics({
      sellingPrice: revA.priceRecommended,
      hppPcs: 10000,
      minOrder: 1,
      nominalPerOrder: 1600,
      nominalPerUnit: 0,
      percentRate: 5,
      voucherNominal: 0,
      voucherPct: 0,
      includePpn: false,
      ppnRate: 11,
      targetProfitPct: 15,
      actualRoas: 10,
      targetRoas: 10,
      bufferPct: 20,
    });
    if (Math.abs(valA.actualProfitPercent - 15) > 0.05 || Math.abs(valA.roasTarget - 10) > 0.01) {
      logs.push(`TEST A FAIL: Bidirectional mismatch. Expected 10x ROAS & 15% Profit. Got ROAS ${valA.roasTarget.toFixed(2)}x, Profit ${valA.actualProfitPercent.toFixed(2)}%`);
      allPassed = false;
    } else {
      logs.push(`TEST A PASS: Target ROAS 10x <-> Cari Harga (Rp${revA.priceRecommended.toFixed(0)}) <-> Cari ROAS (ROAS: ${valA.roasTarget.toFixed(2)}x, Profit: ${valA.actualProfitPercent.toFixed(2)}%).`);
    }
  }

  // TEST B: Target ROAS 8x -> Cari Harga -> Harga X -> Cari ROAS -> Expected 8x ±0.01
  const testBInput: ReverseCalcInput = {
    hppPcs: 10000,
    minOrder: 1,
    nominalPerOrder: 1600,
    nominalPerUnit: 0,
    percentRate: 5,
    voucherNominal: 0,
    voucherPct: 0,
    targetRoas: 8,
    targetProfitPct: 15,
    bufferPct: 20,
    includePpn: false,
    ppnRate: 11,
    roundingStep: 0,
  };
  const revB = calculateReversePrice(testBInput);
  if (!revB.isFeasible) {
    logs.push('TEST B FAIL: Reverse calculation infeasible for 8x ROAS.');
    allPassed = false;
  } else {
    const valB = calculateUnitEconomics({
      sellingPrice: revB.priceRecommended,
      hppPcs: 10000,
      minOrder: 1,
      nominalPerOrder: 1600,
      nominalPerUnit: 0,
      percentRate: 5,
      voucherNominal: 0,
      voucherPct: 0,
      includePpn: false,
      ppnRate: 11,
      targetProfitPct: 15,
      actualRoas: 8,
      targetRoas: 8,
      bufferPct: 20,
    });
    if (Math.abs(valB.actualProfitPercent - 15) > 0.05 || Math.abs(valB.roasTarget - 8) > 0.01) {
      logs.push(`TEST B FAIL: Bidirectional mismatch for 8x ROAS. Got ROAS ${valB.roasTarget.toFixed(2)}x, Profit ${valB.actualProfitPercent.toFixed(2)}%`);
      allPassed = false;
    } else {
      logs.push(`TEST B PASS: Target ROAS 8x <-> Cari Harga (Rp${revB.priceRecommended.toFixed(0)}) <-> Cari ROAS (ROAS: ${valB.roasTarget.toFixed(2)}x, Profit: ${valB.actualProfitPercent.toFixed(2)}%).`);
    }
  }

  // TEST C: Target ROAS 12x -> Cari Harga -> Harga X -> Cari ROAS -> Expected 12x ±0.01
  const testCInput: ReverseCalcInput = {
    hppPcs: 10000,
    minOrder: 1,
    nominalPerOrder: 1600,
    nominalPerUnit: 0,
    percentRate: 5,
    voucherNominal: 0,
    voucherPct: 0,
    targetRoas: 12,
    targetProfitPct: 15,
    bufferPct: 20,
    includePpn: false,
    ppnRate: 11,
    roundingStep: 0,
  };
  const revC = calculateReversePrice(testCInput);
  if (!revC.isFeasible) {
    logs.push('TEST C FAIL: Reverse calculation infeasible for 12x ROAS.');
    allPassed = false;
  } else {
    const valC = calculateUnitEconomics({
      sellingPrice: revC.priceRecommended,
      hppPcs: 10000,
      minOrder: 1,
      nominalPerOrder: 1600,
      nominalPerUnit: 0,
      percentRate: 5,
      voucherNominal: 0,
      voucherPct: 0,
      includePpn: false,
      ppnRate: 11,
      targetProfitPct: 15,
      actualRoas: 12,
      targetRoas: 12,
      bufferPct: 20,
    });
    if (Math.abs(valC.actualProfitPercent - 15) > 0.05 || Math.abs(valC.roasTarget - 12) > 0.01) {
      logs.push(`TEST C FAIL: Bidirectional mismatch for 12x ROAS. Got ROAS ${valC.roasTarget.toFixed(2)}x, Profit ${valC.actualProfitPercent.toFixed(2)}%`);
      allPassed = false;
    } else {
      logs.push(`TEST C PASS: Target ROAS 12x <-> Cari Harga (Rp${revC.priceRecommended.toFixed(0)}) <-> Cari ROAS (ROAS: ${valC.roasTarget.toFixed(2)}x, Profit: ${valC.actualProfitPercent.toFixed(2)}%).`);
    }
  }

  // TEST D: Target ROAS 10x, Buffer 20% -> ROAS Setting = 12x -> Cari Harga remains exactly 10x, not 12x
  const testD_Reverse = calculateReversePrice({
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
  const testD_DirectAt12 = calculateReversePrice({
    hppPcs: 10000,
    minOrder: 1,
    nominalPerOrder: 1600,
    nominalPerUnit: 0,
    percentRate: 5,
    voucherNominal: 0,
    voucherPct: 0,
    targetRoas: 12, // what it would be if corrupted by buffer
    targetProfitPct: 15,
    includePpn: false,
    ppnRate: 11,
    roundingStep: 0,
  });
  if (Math.abs(testD_Reverse.priceExact - testD_DirectAt12.priceExact) < 0.1) {
    logs.push('TEST D FAIL: Cari Harga erroneously used 12x instead of 10x!');
    allPassed = false;
  } else {
    logs.push(`TEST D PASS: Cari Harga strictly uses Target ROAS 10x (Rp${testD_Reverse.priceExact.toFixed(0)}), completely isolated from ROAS Setting 12x (Rp${testD_DirectAt12.priceExact.toFixed(0)}).`);
  }

  // TEST E: Buffer changes from 20% to 30% -> Target ROAS remains 10x, ROAS Setting becomes 13x, Price remains unchanged
  const testE_Buf20 = calculateReversePrice({
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
  const testE_Buf30 = calculateReversePrice({
    hppPcs: 10000,
    minOrder: 1,
    nominalPerOrder: 1600,
    nominalPerUnit: 0,
    percentRate: 5,
    voucherNominal: 0,
    voucherPct: 0,
    targetRoas: 10,
    targetProfitPct: 15,
    bufferPct: 30, // changed buffer
    includePpn: false,
    ppnRate: 11,
    roundingStep: 0,
  });
  if (Math.abs(testE_Buf20.priceExact - testE_Buf30.priceExact) > 0.001) {
    logs.push('TEST E FAIL: Buffer change altered Cari Harga calculation!');
    allPassed = false;
  } else {
    const valE_Buf30 = calculateUnitEconomics({
      sellingPrice: testE_Buf30.priceRecommended,
      hppPcs: 10000,
      minOrder: 1,
      nominalPerOrder: 1600,
      nominalPerUnit: 0,
      percentRate: 5,
      voucherNominal: 0,
      voucherPct: 0,
      includePpn: false,
      ppnRate: 11,
      targetProfitPct: 15,
      targetRoas: 10,
      bufferPct: 30,
    });
    if (Math.abs(valE_Buf30.roasSetting - 13.0) > 0.01 || Math.abs(valE_Buf30.roasTarget - 10.0) > 0.01) {
      logs.push(`TEST E FAIL: ROAS Setting calculation error on 30% buffer. Got ${valE_Buf30.roasSetting.toFixed(2)}x`);
      allPassed = false;
    } else {
      logs.push(`TEST E PASS: Buffer 30% -> Target ROAS remains 10.00x, ROAS Setting is 13.00x, and Cari Harga price is identical (Rp${testE_Buf20.priceExact.toFixed(0)}).`);
    }
  }

  // TEST 8: AdditionalFee synchronization with percent & nominal fees
  const sampleVariantFees: AdditionalFee[] = [
    { nama: 'Admin Shopee', tipe: 'persen', nilai: 6.75 },
    { nama: 'Gratis Ongkir Extra', tipe: 'persen', nilai: 4.5 },
    { nama: 'Biaya Pesanan', tipe: 'nominal', nilai: 1000 },
  ];
  const test8Result = calculateProductEconomics({
    sellingPrice: 100000,
    hppPcs: 40000,
    minOrder: 2,
    additionalCosts: sampleVariantFees,
    targetProfitPct: 15,
    actualRoas: 5,
    includePpn: true,
    ppnRate: 11,
  });

  // Admin Shopee 6.75% of 100k = 6750
  // Gratis Ongkir 4.5% of 100k = 4500
  // Biaya Pesanan 1000 / 2 minOrder = 500
  // Total fees per unit = 6750 + 4500 + 500 = 11750
  if (Math.abs(test8Result.totalAdditionalCostPerUnit - 11750) > 0.01) {
    logs.push(`TEST 8 FAIL: AdditionalFee total cost per unit mismatch. Expected 11750, got ${test8Result.totalAdditionalCostPerUnit}`);
    allPassed = false;
  } else if (test8Result.feeBreakdown.length !== 3) {
    logs.push(`TEST 8 FAIL: Expected 3 itemized fees, got ${test8Result.feeBreakdown.length}`);
    allPassed = false;
  } else {
    logs.push(`TEST 8 PASS: AdditionalFee synchronization correctly parsed 3 fees (Total: Rp${test8Result.totalAdditionalCostPerUnit.toLocaleString('id-ID')}/unit).`);
  }

  // TEST 9: Dynamic Fee Addition & Isolation
  const variantAFees: AdditionalFee[] = [
    { nama: 'Admin Shopee', tipe: 'persen', nilai: 6.75 },
  ];
  const variantBFees: AdditionalFee[] = [
    { nama: 'Admin Shopee', tipe: 'persen', nilai: 6.75 },
    { nama: 'Affiliate', tipe: 'persen', nilai: 5 },
  ];
  const resA = calculateProductEconomics({ sellingPrice: 50000, hppPcs: 20000, additionalCosts: variantAFees });
  const resB = calculateProductEconomics({ sellingPrice: 50000, hppPcs: 20000, additionalCosts: variantBFees });
  if (resA.totalCostBeforeAdsPerUnit >= resB.totalCostBeforeAdsPerUnit) {
    logs.push('TEST 9 FAIL: Variant isolation failed. Variant B with Affiliate fee should have higher total cost than Variant A.');
    allPassed = false;
  } else {
    logs.push('TEST 9 PASS: Variant isolation confirmed. Costs and profit remain strictly isolated per variant configuration.');
  }

  // TEST 10: Bidirectional Reverse Price with AdditionalFee array
  const revWithFees = calculateReversePrice({
    hppPcs: 15000,
    minOrder: 1,
    additionalCosts: sampleVariantFees,
    targetRoas: 8,
    targetProfitPct: 20,
    includePpn: true,
    ppnRate: 11,
    roundingStep: 100,
  });
  if (!revWithFees.isFeasible || revWithFees.validationRecommended.actualProfitPercent < 19.9) {
    logs.push(`TEST 10 FAIL: Reverse price with AdditionalFee array failed target profit. Got profit: ${revWithFees.validationRecommended.actualProfitPercent.toFixed(2)}%`);
    allPassed = false;
  } else {
    logs.push(`TEST 10 PASS: Reverse price with AdditionalFee array -> Recommended Price: Rp${revWithFees.priceRecommended.toLocaleString('id-ID')} achieves ${revWithFees.validationRecommended.actualProfitPercent.toFixed(2)}% profit at 8x ROAS.`);
  }

  // TEST 7: Safety & No undefined .toFixed() crashes on all properties
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
    if (!checkStr) {
      throw new Error('Crash in formatting');
    }
    logs.push('TEST 7 PASS: Zero-value edge case and formatting safety verified without crashes.');
  } catch (err: any) {
    logs.push(`TEST 7 FAIL: Crash during zero-value handling: ${err.message}`);
    allPassed = false;
  }

  return { success: allPassed, results: logs };
}
