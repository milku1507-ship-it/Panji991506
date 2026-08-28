import { formatCurrency } from './formatUtils';

/* ==========================================================================
   GLOBAL UNIT ECONOMICS SERVICE (SINGLE SOURCE OF TRUTH)
   ========================================================================== */

export interface UnitEconomicsParams {
  sellingPrice: number;        // Omzet / Harga Jual per unit (Rp)
  hppPcs: number;              // HPP bahan + packing (Rp/unit)
  minOrder: number;            // Minimum order (pcs/order)
  nominalPerOrder: number;     // Biaya proses/admin fixed per order (Rp)
  nominalPerUnit: number;      // Biaya ekstra per unit (Rp)
  percentRate: number;         // Admin marketplace % (0-100)
  voucherNominal: number;      // Voucher Rp/unit
  voucherPct: number;          // Voucher % (0-100)
  includePpn: boolean;         // PPN on ad spend
  ppnRate: number;             // PPN rate % (e.g. 11)
  targetProfitPct: number;     // Target profit % minimum
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
  adminFeePerUnit: number;
  omzetRealPerUnit: number;
  realHppPerUnit: number;
  profitBeforeAdsPerUnit: number;
  marginBeforeAdsPct: number;
  
  // Target Profit & Max Ad Spend
  targetProfitPct: number;
  targetProfitNominalPerUnit: number;
  profitAvailableForAdsPerUnit: number;
  isTargetFeasible: boolean;
  infeasibilityReason?: string;
  maxAdSpendPerUnit: number;        // Before PPN
  maxAdSpendBurdenPerUnit: number;  // With PPN
  
  // ROAS Benchmark Metrics
  roasBep: number;
  roasTarget: number;
  roasSetting: number;
  
  // Actual/Simulated ROAS Result
  actualRoas: number;
  actualAdSpendPerUnit: number;        // Before PPN
  actualAdSpendBurdenPerUnit: number;  // With PPN
  actualProfitPerUnit: number;
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
  totalHppReal: number;
  totalProfitBeforeAds: number;
  totalTargetProfit: number;
  totalMaxAdSpend: number;
  totalMaxAdSpendBurden: number;
  totalActualAdSpend: number;
  totalActualAdSpendBurden: number;
  totalActualNetProfit: number;
}

export function calculateUnitEconomics(params: UnitEconomicsParams): UnitEconomicsResult {
  const minOrder = Math.max(1, params.minOrder || 1);
  const numOrders = Math.max(1, params.numOrders || 1);
  const sellingPrice = Math.max(0, params.sellingPrice || 0);
  const hppPcs = Math.max(0, params.hppPcs || 0);
  const nominalPerOrder = Math.max(0, params.nominalPerOrder || 0);
  const nominalPerUnit = Math.max(0, params.nominalPerUnit || 0);
  const percentRate = Math.max(0, params.percentRate || 0);
  const voucherNominal = Math.max(0, params.voucherNominal || 0);
  const voucherPct = Math.max(0, params.voucherPct || 0);
  const includePpn = Boolean(params.includePpn);
  const ppnRate = Math.max(0, params.ppnRate ?? 11);
  const targetProfitPct = Math.max(0, params.targetProfitPct || 0);
  const bufferPct = Math.max(0, params.bufferPct || 0);
  
  // Default actualRoas to targetRoas if provided, or 10 as fallback
  const actualRoas = params.actualRoas && params.actualRoas > 0 
    ? params.actualRoas 
    : (params.targetRoas && params.targetRoas > 0 ? params.targetRoas : 10);

  const t_ppn = includePpn ? ppnRate / 100 : 0;
  const C = percentRate / 100;
  const V_pct = voucherPct / 100;

  // 1. Voucher & Fee
  const voucherPerUnit = voucherNominal + (sellingPrice * V_pct);
  const priceAfterVoucher = Math.max(0, sellingPrice - voucherPerUnit);
  const adminFeePerUnit = priceAfterVoucher * C;
  const omzetRealPerUnit = priceAfterVoucher - adminFeePerUnit;

  // 2. HPP Real & Margin Before Ads
  const realHppPerUnit = hppPcs + (nominalPerOrder / minOrder) + nominalPerUnit;
  const profitBeforeAdsPerUnit = omzetRealPerUnit - realHppPerUnit;
  const marginBeforeAdsPct = sellingPrice > 0 ? (profitBeforeAdsPerUnit / sellingPrice) * 100 : 0;

  // 3. Target Profit & Max Ad Spend
  const targetProfitNominalPerUnit = sellingPrice * (targetProfitPct / 100);
  const profitAvailableForAdsPerUnit = profitBeforeAdsPerUnit - targetProfitNominalPerUnit;

  // Check feasibility
  let isTargetFeasible = true;
  let infeasibilityReason: string | undefined = undefined;

  if (realHppPerUnit >= sellingPrice && sellingPrice > 0) {
    isTargetFeasible = false;
    infeasibilityReason = `HPP Real (${formatCurrency(realHppPerUnit)}) lebih besar dari atau sama dengan Harga Jual (${formatCurrency(sellingPrice)}). Profit sebelum iklan sudah negatif.`;
  } else if (profitBeforeAdsPerUnit <= 0) {
    isTargetFeasible = false;
    infeasibilityReason = `Margin sebelum iklan negatif (${marginBeforeAdsPct.toFixed(1)}%). Biaya operasional & HPP melebihi omzet real.`;
  } else if (profitAvailableForAdsPerUnit < 0) {
    isTargetFeasible = false;
    infeasibilityReason = `Margin Sebelum Iklan (${marginBeforeAdsPct.toFixed(1)}%) lebih kecil dari Target Profit Bersih (${targetProfitPct}%). Tidak memungkinkan mencapai target profit dengan struktur biaya saat ini.`;
  }

  const maxAdSpendBurdenPerUnit = isTargetFeasible ? Math.max(0, profitAvailableForAdsPerUnit) : 0;
  const maxAdSpendPerUnit = isTargetFeasible ? maxAdSpendBurdenPerUnit / (1 + t_ppn) : 0;

  // 4. ROAS Metrics
  const roasBep = profitBeforeAdsPerUnit > 0 ? (sellingPrice * (1 + t_ppn)) / profitBeforeAdsPerUnit : 0;
  const roasTarget = isTargetFeasible && maxAdSpendPerUnit > 0 ? sellingPrice / maxAdSpendPerUnit : 0;
  const roasSetting = roasTarget > 0 ? roasTarget / (1 - bufferPct / 100) : 0;

  // 5. Actual / Simulated ROAS Performance
  const actualAdSpendPerUnit = actualRoas > 0 ? sellingPrice / actualRoas : 0;
  const actualAdSpendBurdenPerUnit = actualAdSpendPerUnit * (1 + t_ppn);
  const actualProfitPerUnit = profitBeforeAdsPerUnit - actualAdSpendBurdenPerUnit;
  const actualProfitPercent = sellingPrice > 0 ? (actualProfitPerUnit / sellingPrice) * 100 : 0;
  const selisihFromTargetPct = actualProfitPercent - targetProfitPct;

  // 6. Status Determination
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

  // 7. Order Totals
  const totalUnits = numOrders * minOrder;
  const totalGrossRevenue = totalUnits * sellingPrice;
  const totalOmzetReal = totalUnits * omzetRealPerUnit;
  const totalHppReal = totalUnits * realHppPerUnit;
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
    nominalPerOrder,
    nominalPerUnit,
    percentRate,
    voucherPerUnit,
    priceAfterVoucher,
    adminFeePerUnit,
    omzetRealPerUnit,
    realHppPerUnit,
    profitBeforeAdsPerUnit,
    marginBeforeAdsPct,
    targetProfitPct,
    targetProfitNominalPerUnit,
    profitAvailableForAdsPerUnit,
    isTargetFeasible,
    infeasibilityReason,
    maxAdSpendPerUnit,
    maxAdSpendBurdenPerUnit,
    roasBep,
    roasTarget,
    roasSetting,
    actualRoas,
    actualAdSpendPerUnit,
    actualAdSpendBurdenPerUnit,
    actualProfitPerUnit,
    actualProfitPercent,
    selisihFromTargetPct,
    statusBadge,
    statusColor,
    statusDesc,
    numOrders,
    totalUnits,
    totalGrossRevenue,
    totalOmzetReal,
    totalHppReal,
    totalProfitBeforeAds,
    totalTargetProfit,
    totalMaxAdSpend,
    totalMaxAdSpendBurden,
    totalActualAdSpend,
    totalActualAdSpendBurden,
    totalActualNetProfit,
  };
}

/* ==========================================================================
   REVERSE PRICE ENGINE (CARI HARGA REKOMENDASI)
   ========================================================================== */

export interface ReverseCalcInput {
  hppPcs: number;            // HPP per unit (bahan + packing)
  minOrder: number;          // Minimal order per transaksi (unit)
  nominalPerOrder: number;   // Biaya proses per order (Rp)
  nominalPerUnit: number;    // Biaya per unit (Rp)
  percentRate: number;       // Fee marketplace % (0-100)
  voucherNominal: number;    // Voucher Rp per unit
  voucherPct: number;        // Voucher % (0-100)
  targetRoas: number;        // Target ROAS (misal 8.0)
  targetProfitPct: number;   // Target Profit Bersih Setelah Iklan %
  includePpn: boolean;       // Status PPN Iklan
  ppnRate: number;           // Rate PPN Iklan (11%)
  roundingStep: number;      // 0, 100, 500, 1000
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

export function roundPrice(price: number, step: number): number {
  if (step <= 0) return Math.round(price);
  return Math.ceil(price / step) * step;
}

export function calculateReversePrice(input: ReverseCalcInput): ReverseCalcResult {
  const {
    hppPcs,
    minOrder,
    nominalPerOrder,
    nominalPerUnit,
    percentRate,
    voucherNominal,
    voucherPct,
    targetRoas,
    targetProfitPct,
    includePpn,
    ppnRate,
    roundingStep,
  } = input;

  const M = Math.max(1, minOrder || 1);
  const E = Math.max(0, hppPcs || 0);
  const F = Math.max(0, nominalPerOrder || 0);
  const V_unit = Math.max(0, nominalPerUnit || 0);

  const realHppPerUnit = E + (F / M) + V_unit;

  const C = Math.max(0, percentRate) / 100;
  const V_pct = Math.max(0, voucherPct) / 100;
  const V_nom = Math.max(0, voucherNominal || 0);
  const R_target = Math.max(0.01, targetRoas || 0.01);
  const T_profit = Math.max(0, targetProfitPct) / 100;
  const t_ppn = includePpn ? Math.max(0, ppnRate || 0) / 100 : 0;

  // Beban biaya iklan terhadap harga jual = (1 + t_ppn) / R_target
  const adSpendRatio = (1 + t_ppn) / R_target;

  // Koefisien harga = (1 - V_pct) * (1 - C) - adSpendRatio - T_profit
  const priceCoefficient = (1 - V_pct) * (1 - C) - adSpendRatio - T_profit;

  const dummyValidation = calculateUnitEconomics({
    sellingPrice: 0,
    hppPcs: E,
    minOrder: M,
    nominalPerOrder: F,
    nominalPerUnit: V_unit,
    percentRate,
    voucherNominal: V_nom,
    voucherPct,
    includePpn,
    ppnRate,
    targetProfitPct,
    actualRoas: R_target,
    targetRoas: R_target,
  });

  if (priceCoefficient <= 0) {
    return {
      isFeasible: false,
      errorMessage: `Target Profit (${targetProfitPct}%) dan Target ROAS (${targetRoas}x) tidak dapat dicapai secara bersamaan dengan struktur biaya saat ini.`,
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
  const priceRecommended = roundPrice(priceExact, roundingStep);

  // Validation passes using central engine
  const validationExact = calculateUnitEconomics({
    sellingPrice: priceExact,
    hppPcs: E,
    minOrder: M,
    nominalPerOrder: F,
    nominalPerUnit: V_unit,
    percentRate,
    voucherNominal: V_nom,
    voucherPct,
    includePpn,
    ppnRate,
    targetProfitPct,
    actualRoas: R_target,
    targetRoas: R_target,
  });

  const validationRecommended = calculateUnitEconomics({
    sellingPrice: priceRecommended,
    hppPcs: E,
    minOrder: M,
    nominalPerOrder: F,
    nominalPerUnit: V_unit,
    percentRate,
    voucherNominal: V_nom,
    voucherPct,
    includePpn,
    ppnRate,
    targetProfitPct,
    actualRoas: R_target,
    targetRoas: R_target,
  });

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

  // TEST A: Cari Harga -> Price X -> Cari ROAS -> Profit >= 10%, ROAS >= 8x
  const testAInput: ReverseCalcInput = {
    hppPcs: 10000,
    minOrder: 1,
    nominalPerOrder: 1600,
    nominalPerUnit: 0,
    percentRate: 5,
    voucherNominal: 0,
    voucherPct: 0,
    targetRoas: 8,
    targetProfitPct: 10,
    includePpn: false,
    ppnRate: 11,
    roundingStep: 0,
  };

  const revA = calculateReversePrice(testAInput);
  if (!revA.isFeasible) {
    logs.push('TEST A FAIL: Reverse calculation returned infeasible.');
    allPassed = false;
  } else {
    const valA = revA.validationExact;
    const profitDiff = Math.abs(valA.actualProfitPercent - 10);
    if (profitDiff > 0.01) {
      logs.push(`TEST A FAIL: Expected Net Profit 10%, got ${valA.actualProfitPercent}%`);
      allPassed = false;
    } else {
      logs.push(`TEST A PASS: Price Rp${revA.priceExact.toFixed(0)} -> Profit ${valA.actualProfitPercent.toFixed(2)}%, ROAS ${valA.roasTarget.toFixed(2)}x`);
    }
  }

  // TEST B: Higher price produces higher profit & ROAS
  if (revA.isFeasible) {
    const higherPrice = revA.priceExact * 1.2;
    const valB = calculateUnitEconomics({
      sellingPrice: higherPrice,
      hppPcs: 10000,
      minOrder: 1,
      nominalPerOrder: 1600,
      nominalPerUnit: 0,
      percentRate: 5,
      voucherNominal: 0,
      voucherPct: 0,
      includePpn: false,
      ppnRate: 11,
      targetProfitPct: 10,
      actualRoas: 8,
    });

    if (valB.actualProfitPercent <= 10) {
      logs.push(`TEST B FAIL: Expected Net Profit > 10%, got ${valB.actualProfitPercent}%`);
      allPassed = false;
    } else {
      logs.push(`TEST B PASS: Higher Price Rp${higherPrice.toFixed(0)} -> Net Profit ${valB.actualProfitPercent.toFixed(2)}% (> 10%)`);
    }
  }

  // TEST C: Lower price produces lower profit & warning
  if (revA.isFeasible) {
    const lowerPrice = revA.priceExact * 0.8;
    const valC = calculateUnitEconomics({
      sellingPrice: lowerPrice,
      hppPcs: 10000,
      minOrder: 1,
      nominalPerOrder: 1600,
      nominalPerUnit: 0,
      percentRate: 5,
      voucherNominal: 0,
      voucherPct: 0,
      includePpn: false,
      ppnRate: 11,
      targetProfitPct: 10,
      actualRoas: 8,
    });

    if (valC.actualProfitPercent >= 10 || valC.statusBadge.includes('SESUAI')) {
      logs.push(`TEST C FAIL: Expected warning/below target, got status ${valC.statusBadge}`);
      allPassed = false;
    } else {
      logs.push(`TEST C PASS: Lower Price Rp${lowerPrice.toFixed(0)} -> Net Profit ${valC.actualProfitPercent.toFixed(2)}%, Status: ${valC.statusBadge}`);
    }
  }

  // TEST D: HPP higher than selling price -> Status = RUGI / TARGET TIDAK TERPENUHI
  const valD = calculateUnitEconomics({
    sellingPrice: 1500,
    hppPcs: 1720,
    minOrder: 1,
    nominalPerOrder: 1600,
    nominalPerUnit: 0,
    percentRate: 5,
    voucherNominal: 0,
    voucherPct: 0,
    includePpn: false,
    ppnRate: 11,
    targetProfitPct: 10,
    actualRoas: 8,
  });

  if (valD.isTargetFeasible || valD.actualProfitPercent >= 0) {
    logs.push(`TEST D FAIL: Expected loss / infeasible when HPP > Price, got profit ${valD.actualProfitPercent}%`);
    allPassed = false;
  } else {
    logs.push(`TEST D PASS: Price Rp1.500 < HPP Rp1.720 -> Detected loss (${valD.actualProfitPercent.toFixed(1)}%), Status: ${valD.statusBadge}`);
  }

  // TEST E: Multi-variant with different HPPs (Conservative Pricing)
  const hpps = [1322, 1507, 1720, 1612, 1276];
  const maxHpp = Math.max(...hpps); // 1720
  const revMax = calculateReversePrice({
    hppPcs: maxHpp,
    minOrder: 1,
    nominalPerOrder: 1600,
    nominalPerUnit: 0,
    percentRate: 5,
    voucherNominal: 0,
    voucherPct: 0,
    targetRoas: 8,
    targetProfitPct: 10,
    includePpn: false,
    ppnRate: 11,
    roundingStep: 100,
  });

  let testEPassed = true;
  hpps.forEach((hpp) => {
    const valVariant = calculateUnitEconomics({
      sellingPrice: revMax.priceRecommended,
      hppPcs: hpp,
      minOrder: 1,
      nominalPerOrder: 1600,
      nominalPerUnit: 0,
      percentRate: 5,
      voucherNominal: 0,
      voucherPct: 0,
      includePpn: false,
      ppnRate: 11,
      targetProfitPct: 10,
      actualRoas: 8,
    });
    if (valVariant.actualProfitPercent < 10) {
      testEPassed = false;
    }
  });

  if (!testEPassed) {
    logs.push('TEST E FAIL: Conservative pricing did not cover all variants.');
    allPassed = false;
  } else {
    logs.push(`TEST E PASS: Conservative Price Rp${revMax.priceRecommended} satisfies all variants with HPPs [${hpps.join(', ')}]`);
  }

  return { success: allPassed, results: logs };
}
