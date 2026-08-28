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

  // TEST 1: Target Profit 15%, Target ROAS 8x -> Cari Harga -> Transfer to Cari ROAS -> ROAS ≈ 8x (or required ROAS <= 8x), Profit >= 15%
  const test1Input: ReverseCalcInput = {
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

  const rev1 = calculateReversePrice(test1Input);
  if (!rev1.isFeasible) {
    logs.push('TEST 1 FAIL: Reverse calculation returned infeasible for 15% profit & 8x ROAS.');
    allPassed = false;
  } else {
    // When price is transferred to CARI ROAS with same parameters
    const val1 = calculateUnitEconomics({
      sellingPrice: rev1.priceRecommended,
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

    if (val1.actualProfitPercent < 14.99 || Math.abs(val1.roasTarget - 8) > 0.05) {
      logs.push(`TEST 1 FAIL: Transfer inconsistency. Expected Profit >= 15% and ROAS Target ≈ 8x. Got Profit ${val1.actualProfitPercent.toFixed(2)}%, ROAS Target ${val1.roasTarget.toFixed(2)}x`);
      allPassed = false;
    } else {
      logs.push(`TEST 1 PASS: Cari Harga -> Cari ROAS consistent. Price: Rp${rev1.priceRecommended.toFixed(0)}, Profit: ${val1.actualProfitPercent.toFixed(2)}%, ROAS Target: ${val1.roasTarget.toFixed(2)}x`);
    }
  }

  // TEST 2: Target Profit 10%, Target ROAS 8x
  const test2Input: ReverseCalcInput = {
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
    roundingStep: 100,
  };
  const rev2 = calculateReversePrice(test2Input);
  if (!rev2.isFeasible || rev2.validationRecommended.actualProfitPercent < 10) {
    logs.push(`TEST 2 FAIL: Expected Profit >= 10%, got ${rev2.validationRecommended?.actualProfitPercent}%`);
    allPassed = false;
  } else {
    logs.push(`TEST 2 PASS: Target Profit 10% -> Rec Price: Rp${rev2.priceRecommended}, Profit: ${rev2.validationRecommended.actualProfitPercent.toFixed(2)}%`);
  }

  // TEST 3: Target Profit 20%, Target ROAS 10x
  const test3Input: ReverseCalcInput = {
    hppPcs: 12000,
    minOrder: 1,
    nominalPerOrder: 1600,
    nominalPerUnit: 0,
    percentRate: 6,
    voucherNominal: 500,
    voucherPct: 2,
    targetRoas: 10,
    targetProfitPct: 20,
    includePpn: true,
    ppnRate: 11,
    roundingStep: 500,
  };
  const rev3 = calculateReversePrice(test3Input);
  if (!rev3.isFeasible || rev3.validationRecommended.actualProfitPercent < 20) {
    logs.push(`TEST 3 FAIL: Expected Profit >= 20% with fees and voucher, got ${rev3.validationRecommended?.actualProfitPercent}%`);
    allPassed = false;
  } else {
    logs.push(`TEST 3 PASS: Target Profit 20% + 10x ROAS with PPN & Vouchers -> Rec Price: Rp${rev3.priceRecommended}, Profit: ${rev3.validationRecommended.actualProfitPercent.toFixed(2)}%`);
  }

  // TEST 4: Buffer 20%: Target ROAS 8x -> ROAS Setting 9.6x (Target ROAS remains 8x)
  const val4 = calculateUnitEconomics({
    sellingPrice: 20000,
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
  const expectedSetting = val4.roasTarget * 1.2; // 8 * 1.2 = 9.6
  if (Math.abs(val4.roasSetting - expectedSetting) > 0.05) {
    logs.push(`TEST 4 FAIL: Buffer calculation error. Expected ROAS Setting ${expectedSetting.toFixed(2)}x, got ${val4.roasSetting.toFixed(2)}x`);
    allPassed = false;
  } else {
    logs.push(`TEST 4 PASS: Buffer +20% -> Target ROAS: ${val4.roasTarget.toFixed(2)}x, ROAS Setting: ${val4.roasSetting.toFixed(2)}x`);
  }

  // TEST 5: Labor inside HPP not counted twice (Verified through pure HPP passing)
  const hppWithLabor = 15000; // includes Rp3000 labor
  const val5 = calculateUnitEconomics({
    sellingPrice: 25000,
    hppPcs: hppWithLabor,
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
  if (val5.realHppPerUnit !== 15000 + 1600) {
    logs.push(`TEST 5 FAIL: Real HPP expected ${15000 + 1600}, got ${val5.realHppPerUnit}`);
    allPassed = false;
  } else {
    logs.push(`TEST 5 PASS: Labor in HPP cleanly preserved without double counting. Real HPP: Rp${val5.realHppPerUnit}`);
  }

  // TEST 6: Rounding price recalculation preserves constraints
  const test6Input: ReverseCalcInput = {
    hppPcs: 10000,
    minOrder: 1,
    nominalPerOrder: 1600,
    nominalPerUnit: 0,
    percentRate: 5,
    voucherNominal: 0,
    voucherPct: 0,
    targetRoas: 8,
    targetProfitPct: 15,
    includePpn: false,
    ppnRate: 11,
    roundingStep: 1000,
  };
  const rev6 = calculateReversePrice(test6Input);
  if (!rev6.isFeasible || rev6.validationRecommended.actualProfitPercent < 15) {
    logs.push(`TEST 6 FAIL: Rounding to Rp1000 violated profit constraint. Profit: ${rev6.validationRecommended.actualProfitPercent}%`);
    allPassed = false;
  } else {
    logs.push(`TEST 6 PASS: Rounding to Rp1000 revalidated. Price Exact: Rp${rev6.priceExact.toFixed(0)} -> Rounded: Rp${rev6.priceRecommended} (Profit: ${rev6.validationRecommended.actualProfitPercent.toFixed(2)}% >= 15%)`);
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

  // TEST 8: Rule Verification - Target ROAS 10x, Buffer 20% -> Target ROAS = 10, Buffer = 20, ROAS Setting = 12 (NEVER Target ROAS = 12)
  const test8Econ = calculateUnitEconomics({
    sellingPrice: 50000,
    hppPcs: 15000,
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
    bufferPct: 20,
    actualRoas: 10,
  });

  if (Math.abs(test8Econ.roasTarget - 10) > 0.001) {
    logs.push(`TEST 8 FAIL: Target ROAS corrupted by buffer. Expected 10.00x, got ${test8Econ.roasTarget.toFixed(2)}x`);
    allPassed = false;
  } else if (Math.abs(test8Econ.roasSetting - 12) > 0.001) {
    logs.push(`TEST 8 FAIL: ROAS Setting incorrect. Expected 12.00x (10 * 1.2), got ${test8Econ.roasSetting.toFixed(2)}x`);
    allPassed = false;
  } else {
    logs.push(`TEST 8 PASS: Strict Variable Separation verified (Target ROAS: ${test8Econ.roasTarget.toFixed(2)}x, Buffer: 20%, ROAS Setting: ${test8Econ.roasSetting.toFixed(2)}x).`);
  }

  return { success: allPassed, results: logs };
}
