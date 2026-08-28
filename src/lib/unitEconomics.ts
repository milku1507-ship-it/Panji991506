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
  marketplaceFeePerUnit: number;
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
  
  // ROAS Benchmark Metrics (STRICTLY SEPARATED)
  roasBep: number;                  // Break-even ROAS (0 profit)
  roasTarget: number;               // Pure Target ROAS from user (NOT modified by buffer)
  roasSetting: number;              // Target ROAS × (1 + bufferPct / 100) for Seller Center
  requiredRoasForPrice?: number;    // Break-even required ROAS for current price
  
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

  const t_ppn = includePpn ? ppnRate / 100 : 0;
  const C = percentRate / 100;
  const V_pct = voucherPct / 100;

  // 1. Voucher & Fee
  const voucherPerUnit = voucherNominal + (sellingPrice * V_pct);
  const priceAfterVoucher = Math.max(0, sellingPrice - voucherPerUnit);
  const adminFeePerUnit = priceAfterVoucher * C;
  const marketplaceFeePerUnit = adminFeePerUnit + (nominalPerOrder / minOrder) + nominalPerUnit;
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

  // 4. ROAS Metrics (STRICT SINGLE SOURCE OF TRUTH & VARIABLE SEPARATION)
  // - roasBep: Break-even ROAS (0 profit)
  const roasBep = profitBeforeAdsPerUnit > 0 ? (sellingPrice * (1 + t_ppn)) / profitBeforeAdsPerUnit : 0;

  // - requiredRoasForPrice: Break-even ROAS required to achieve target profit at current selling price
  const requiredRoasForPrice = isTargetFeasible && maxAdSpendPerUnit > 0 ? sellingPrice / maxAdSpendPerUnit : 0;

  // - roasTarget: The pure target ROAS requested by the user.
  //   Rule 1: targetROAS is the original target ROAS inputted by user.
  //   Rule 2: bufferROAS does NOT alter targetROAS.
  //   Rule 5: NEVER use roasSetting as targetROAS.
  const roasTarget = params.targetRoas && params.targetRoas > 0
    ? params.targetRoas
    : requiredRoasForPrice;

  // - roasSetting: Computed separately for Seller Center recommendation:
  //   Rule 3: roasSetting = targetROAS × (1 + bufferROAS / 100)
  const roasSetting = roasTarget > 0 ? roasTarget * (1 + bufferPct / 100) : 0;

  // 5. Actual / Simulated ROAS Performance
  // - actualRoas: The ROAS value currently tested in simulation (defaults to roasTarget)
  const actualRoas = params.actualRoas && params.actualRoas > 0 
    ? params.actualRoas 
    : (roasTarget > 0 ? roasTarget : 10);

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
    marketplaceFeePerUnit: adminFeePerUnit + nominalPerUnit + (nominalPerOrder / minOrder),
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
  bufferPct?: number;        // Buffer ROAS Setting % (default: 15)
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
  if (step <= 0) return Math.ceil(price);
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
    bufferPct = 15,
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
    bufferPct,
  });

  let validationRecommended = calculateUnitEconomics({
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
    validationRecommended = calculateUnitEconomics({
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
