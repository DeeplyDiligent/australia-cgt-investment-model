// Pure simulation engine — no DOM dependencies.
// Importable in both the browser (via <script type="module">) and Node (`node tests.js`).

// ---------- CONSTANTS ----------
export const START_YEAR = 2026;
export const END_YEAR = 2049;
export const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

// Available surplus to invest (post-tax income - expenses) per year
export const AVAILABLE_TO_INVEST = {
  2026: 52350.00, 2027: 51432.45, 2028: 48784.72, 2029: 39071.75, 2030: 30666.13,
  2031: 14993.42, 2032: -5438.96, 2033: -8546.65, 2034: -1328.06, 2035: -1361.26,
  2036: 20366.15, 2037: 20219.26, 2038: 20052.29, 2039: 19175.09, 2040: 16828.52,
  2041: 18697.53, 2042: 28072.00, 2043: 25730.56, 2044: 27933.49, 2045: 37424.40,
  2046: 58023.41, 2047: 58634.20, 2048: 58378.49, 2049: 81013.28,
};

// Current state (2026 starting position)
export const INITIAL_STATE = {
  // Values from "Current State (2026 Feb)" snapshot supplied by user.
  cash: 180598.07,
  stocks: 52552 + 9956 + 16879.79 + 20086.5 + 1740, // MSFT, A200, HACK, VAP, TSLA
  ppor: { value: 1011000, loan: 740625.48 },
  investmentProperties: [],
};

export const DEFAULT_GLOBALS = {
  grossIncome: 200000,          // primary earner pre-tax
  partnerGrossIncome: 67000,    // partner pre-tax (set to 0 for single)
  incomeGrowthPct: 2.5,         // annual wage/income uplift used for future borrowing capacity
  marginalTaxRate: 0.39,        // MTR of whoever owns the IPs (used for neg-gearing benefit)
  currentYearSurplusFraction: 7/12, // only the remaining share of 2026 surplus is available from late May
  // Legacy single drift retained for backward compatibility with old shared links.
  categoryPriceBandDriftPct: 4.0,
  lowerBandDriftPct: 4.5,
  upperBandDriftPct: 5.5,
  cashReturnPct: 4.0,
  stockGrowthPct: 8.0,
  stockDividendPct: 2.5,
  stockDividendTaxRatePct: 17.0, // top marginal 47% less 30% franking credit assumption
  propertyGrowthPct: 4.0,
  propertyYieldPct: 4.0,
  rentGrowthPct: 3.0,
  interestRatePct: 6.3,
  nonInterestCostPct: 1.2,
  principalRepayPct: 1.5,
  stressBufferPct: 3.0,
  rentShadingPct: 80,
  livingExpensesAnnual: 60000,  // HEM for a couple
  minCashBuffer: 0,             // cash reserve that cannot be used for new purchases
  dtiCap: 6.0,
  depositPct: 20,
  stampDutyPct: 5.5,
  ppor: {
    growthPct: 4.0,
    principalRepayPct: 3.0, // legacy fallback for old scenarios without repayment details
    loanRatePct: 5.95,
    repaymentMonthly: 4499,
    remainingTermYears: 28,
    useCashAsOffset: true,
  },
};

export function investmentFundingSplit(investment, totalRequired) {
  const parts = fundingParts(totalRequired, investment);
  const source = parts.cashUsed === 0 ? 'equity' : parts.equityDraw === 0 ? 'cash' : 'mixed';
  return { source, ...parts };
}

// ---------- FORMATTERS ----------
export const fmt = (v) => (v == null || isNaN(v)) ? '—' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString();
export const fmtK = (v) => v == null ? '—' : '$' + (Math.round(v/1000)).toLocaleString() + 'k';
export const pct = (v) => (v*100).toFixed(1) + '%';

export function fundingCashPct(investment) {
  if (investment?.cashFundingPct != null) return Math.max(0, Math.min(100, Number(investment.cashFundingPct)));
  if (investment?.depositSource === 'equity') return 0;
  if (investment?.depositSource === 'mix' || investment?.depositSource === 'mixed') return 50;
  return 100;
}

export function fundingParts(totalFunding, investment) {
  const cashPct = fundingCashPct(investment) / 100;
  const cashUsed = totalFunding * cashPct;
  return { cashUsed, equityDraw: totalFunding - cashUsed, cashFundingPct: cashPct * 100 };
}

function deductibleOffsetAmount(globals, ppor, cashUsed) {
  if (!globals.ppor?.useCashAsOffset) return 0;
  if ((ppor?.loan || 0) <= 0) return 0;
  return Math.max(0, Math.min(cashUsed || 0, ppor.loan || 0));
}
// ---------- TAX ----------
// ATO 2024-25 brackets + Medicare.
export function afterTaxIncome(gross) {
  const brackets = [[18200,0],[45000,0.16],[135000,0.30],[190000,0.37],[Infinity,0.45]];
  let tax = 0, lower = 0;
  for (const [upper, rate] of brackets) {
    const slice = Math.max(0, Math.min(gross, upper) - lower);
    tax += slice * rate; lower = upper;
    if (gross <= upper) break;
  }
  return gross - tax - gross*0.02;
}

// Household helpers: treat primary + partner separately so tax brackets apply individually.
export function incomeFactorForYear(g, year = START_YEAR) {
  const growth = (g.incomeGrowthPct ?? 0) / 100;
  return Math.pow(1 + growth, Math.max(0, year - START_YEAR));
}
export function householdGross(g, year = START_YEAR) {
  const factor = incomeFactorForYear(g, year);
  return ((g.grossIncome || 0) + (g.partnerGrossIncome || 0)) * factor;
}
export function householdNet(g, year = START_YEAR) {
  const factor = incomeFactorForYear(g, year);
  return afterTaxIncome((g.grossIncome || 0) * factor) + afterTaxIncome((g.partnerGrossIncome || 0) * factor);
}

export function growthSchedulePhase(years, pct) {
  return { years, pct };
}

export function priceBandThresholdsForYear(year, globals = DEFAULT_GLOBALS) {
  const lowerDrift = (globals.lowerBandDriftPct ?? globals.categoryPriceBandDriftPct ?? globals.propertyGrowthPct ?? 0) / 100;
  const upperDrift = (globals.upperBandDriftPct ?? globals.categoryPriceBandDriftPct ?? globals.propertyGrowthPct ?? 0) / 100;
  const years = Math.max(0, year - START_YEAR);
  const lowerFactor = Math.pow(1 + lowerDrift, years);
  const upperFactor = Math.pow(1 + upperDrift, years);
  return {
    lower: 600000 * lowerFactor,
    upper: 800000 * upperFactor,
    lowerFactor,
    upperFactor,
  };
}

export function defaultGrowthScheduleForProperty(subtype, price, year = START_YEAR, globals = DEFAULT_GLOBALS) {
  // Auto categories are set using purchase-year equivalent price bands indexed from 2026.
  // Once a property qualifies for a bucket at purchase time, it keeps that growth schedule.
  const bands = priceBandThresholdsForYear(year, globals);
  // Auto categories are determined from the purchase-time price/asset profile and then held constant.
  // A property that qualifies for a stronger growth bucket today keeps that bucket as it appreciates.
  if (subtype === 'new') {
    if (price < bands.lower) return [growthSchedulePhase(5, 0.0), growthSchedulePhase(5, 0.0), growthSchedulePhase(null, 0.0)];
    if (price <= bands.upper) return [growthSchedulePhase(5, 2.0), growthSchedulePhase(5, 4.0), growthSchedulePhase(null, 5.0)];
    return [growthSchedulePhase(5, 5.0), growthSchedulePhase(5, 5.0), growthSchedulePhase(null, 5.0)];
  }

  if (price < bands.lower) return [growthSchedulePhase(5, 1.0), growthSchedulePhase(5, 2.0), growthSchedulePhase(null, 3.0)];
  if (price <= bands.upper) return [growthSchedulePhase(5, 3.0), growthSchedulePhase(5, 4.0), growthSchedulePhase(null, 4.5)];
  return [growthSchedulePhase(5, 4.0), growthSchedulePhase(5, 4.5), growthSchedulePhase(null, 4.5)];
}

export function normalizeGrowthSchedule(schedule, fallbackPct = null) {
  if (Array.isArray(schedule) && schedule.length) {
    return schedule.map((phase, idx) => ({
      years: phase?.years == null ? null : Number(phase.years),
      pct: Number(phase?.pct ?? fallbackPct ?? 0),
      id: phase?.id ?? `phase-${idx}`,
    }));
  }
  return [growthSchedulePhase(null, fallbackPct ?? 0)];
}

export function growthPctForHeldYears(schedule, yearsHeld) {
  let remainingYears = Math.max(1, yearsHeld);
  const phases = normalizeGrowthSchedule(schedule);

  for (const phase of phases) {
    const span = phase.years == null ? Infinity : phase.years;
    if (remainingYears <= span) return phase.pct;
    remainingYears -= span;
  }

  return phases[phases.length - 1]?.pct ?? 0;
}

export function propertyGrowthSchedule(property, globals) {
  const mode = property?.growthMode || (property?.growthSchedule?.length ? 'phased' : (property?.growthPct != null ? 'fixed' : 'auto'));
  if (mode === 'phased' && property?.growthSchedule?.length) {
    return normalizeGrowthSchedule(property.growthSchedule, property.growthPct ?? globals.propertyGrowthPct);
  }
  if (mode === 'fixed') return normalizeGrowthSchedule(null, property.growthPct ?? globals.propertyGrowthPct);
  return defaultGrowthScheduleForProperty(
    property?.subtype || 'established',
    property?.price ?? property?.value ?? 0,
    property?.year ?? START_YEAR,
    globals,
  );
}

export function propertyGrowthPctForYear(property, globals, year) {
  const schedule = propertyGrowthSchedule(property, globals);
  return growthPctForHeldYears(schedule, year - property.year);
}

export function growthScheduleSummary(schedule) {
  return normalizeGrowthSchedule(schedule)
    .map((phase, idx) => {
      const label = phase.years == null ? 'thereafter' : idx === 0 ? `yrs 1-${phase.years}` : idx === 1 ? `yrs 6-${5 + phase.years}` : `${phase.years} yrs`;
      return `${label}: ${phase.pct.toFixed(1)}%`;
    })
    .join(' · ');
}

export function availableToInvestForYear(globals, year) {
  const base = AVAILABLE_TO_INVEST[year] || 0;
  if (year !== START_YEAR) return base;
  return base * (globals.currentYearSurplusFraction ?? 1);
}

export function pporPrincipalRepaymentForYear(globals, ppor, cashOffset = 0) {
  const cfg = globals.ppor || {};
  if (cfg.repaymentMonthly != null && cfg.loanRatePct != null) {
    const annualRepayment = cfg.repaymentMonthly * 12;
    const offset = cfg.useCashAsOffset === false ? 0 : Math.max(0, cashOffset || 0);
    const interest = Math.max(0, (ppor.loan || 0) - offset) * ((cfg.loanRatePct || 0) / 100);
    return Math.max(0, Math.min(ppor.loan || 0, annualRepayment - interest));
  }
  return (ppor.originalLoan || ppor.loan || 0) * ((cfg.principalRepayPct || 0) / 100);
}

// Lender-style NSR serviceability:
//   surplus = netIncome + shadedRent + negGearingAddBack − HEM − stressedPayments
//   must be ≥ 0. Solve for the new loan that drives surplus to 0.
export function borrowingCapacity(g, existingIps, ppor, prospective = null, year = START_YEAR) {
  const totalIpLoan = existingIps.reduce((s,p)=>s+p.loan,0);
  const pporDebt = (ppor?.loan ?? INITIAL_STATE.ppor.loan);
  const totalDebt = pporDebt + totalIpLoan;

  // Incremental debt the bank will assess. For equity-funded deposits the deposit + upfront costs
  // also become new debt (drawn against PPOR), so it's not just the IP-secured loan.
  let prospLoan = 0;
  if (prospective) {
    prospLoan = prospective.price * (1 - prospective.depositPct/100);
    const depositAndCosts = prospective.price * (prospective.depositPct/100) + prospective.price * (g.stampDutyPct/100);
    prospLoan += investmentFundingSplit(prospective, depositAndCosts).equityDraw;
  }
  const grossIncome = householdGross(g, year);
  const netIncome = householdNet(g, year);
  const dtiRoom = Math.max(0, g.dtiCap * grossIncome - totalDebt);

  const stressRate = (g.interestRatePct + g.stressBufferPct) / 100;
  const pporStressRate = ((g.ppor?.loanRatePct ?? g.interestRatePct) + g.stressBufferPct) / 100;
  const holdingRate = g.nonInterestCostPct / 100;
  const interestRate = g.interestRatePct / 100;

  const existingRent = existingIps.reduce((s,p)=>s+p.value*((p.yieldPct??g.propertyYieldPct)/100),0);
  const prospectiveRent = prospective ? prospective.price * (prospective.yieldPct/100) : 0;
  const shadedRent = (g.rentShadingPct/100) * (existingRent + prospectiveRent);

  // Negative-gearing tax add-back: only for new builds and grandfathered properties.
  let negGearAddBack = 0;
  for (const p of existingIps) {
    const negGearAllowed = (p.subtype === 'new') || p.grandfathered;
    if (!negGearAllowed) continue;
    const rent = p.value * ((p.yieldPct??g.propertyYieldPct)/100);
    const loss = p.loan*interestRate + p.value*holdingRate - rent;
    if (loss > 0) negGearAddBack += loss * g.marginalTaxRate;
  }
  if (prospective && prospective.subtype === 'new') {
    const loss = prospLoan*interestRate + prospective.price*holdingRate - prospectiveRent;
    if (loss > 0) negGearAddBack += loss * g.marginalTaxRate;
  }

  const stressedExisting = pporDebt * pporStressRate + totalIpLoan * stressRate;
  const availableForNewDebt = netIncome + shadedRent + negGearAddBack - g.livingExpensesAnnual - stressedExisting;
  const servRoom = Math.max(0, availableForNewDebt / stressRate);

  return { dtiRoom, servRoom, grossIncome, netIncome, shadedRent, negGearAddBack, stressedExisting, hem: g.livingExpensesAnnual };
}

// ---------- SIMULATION ----------
export function simulate(globals, investments, opts = {}) {
  const g = globals;
  const yearRows = [];
  let cash = INITIAL_STATE.cash;
  let stockBalance = INITIAL_STATE.stocks;
  let ppor = { value: INITIAL_STATE.ppor.value, loan: INITIAL_STATE.ppor.loan, originalLoan: INITIAL_STATE.ppor.loan };
  let deductiblePporDebt = 0;

  const ips = INITIAL_STATE.investmentProperties.map(p => ({
    ...p, value: p.price, originalLoan: p.loan, carriedLoss: 0,
  }));

  const byYear = {};
  for (const inv of investments) (byYear[inv.year] ||= []).push(inv);

  let totalInvestedShortfall = 0;

  const snapshotForYear = (year) => {
    const activeIps = ips.filter(property => year >= property.year);
    const ipValue = activeIps.reduce((sum, property) => sum + property.value, 0);
    const ipLoan = activeIps.reduce((sum, property) => sum + property.loan, 0);
    const ipEquity = ipValue - ipLoan;
    const pporEquity = ppor.value - ppor.loan;
    const usablePporEquity = Math.max(0, 0.8 * ppor.value - ppor.loan);
    const usableIpEquity = activeIps.reduce((sum, property) => sum + Math.max(0, 0.8 * property.value - property.loan), 0);
    const totalDebt = ppor.loan + ipLoan;
    const netWorth = cash + stockBalance + pporEquity + ipEquity;
    return {
      cash,
      stocks: stockBalance,
      pporValue: ppor.value,
      pporLoan: ppor.loan,
      pporEquity,
      ipValue,
      ipLoan,
      ipEquity,
      totalDebt,
      netWorth,
      usableEquity: usablePporEquity + usableIpEquity,
    };
  };

  for (const year of YEARS) {
    const yearLog = { year, events: [], warnings: [] };
    const investmentSteps = [];
    const surplus = availableToInvestForYear(g, year);
    cash += surplus;

    // Cash interest on opening balance. If cash is in the PPOR offset, it saves home-loan
    // interest instead of earning separate interest.
    const cashOpening = cash - surplus;
    const cashInterest = g.ppor?.useCashAsOffset ? 0 : cashOpening * (g.cashReturnPct/100);
    const cashInterestTax = cashInterest * g.marginalTaxRate;
    cash += cashInterest - cashInterestTax;

    // PPOR: grow + amortise (P&I assumed paid from expenses budget)
    ppor.value *= (1 + g.ppor.growthPct/100);
    const offsetForMortgage = g.ppor?.useCashAsOffset === false ? 0 : Math.max(0, cash);
    const pporLoanRate = (g.ppor?.loanRatePct ?? g.interestRatePct ?? 0) / 100;
    const deductibleInterestBase = Math.min(Math.max(0, deductiblePporDebt), Math.max(0, ppor.loan - offsetForMortgage));
    const deductiblePporInterest = deductibleInterestBase * pporLoanRate;
    const deductiblePporTaxBenefit = deductiblePporInterest * g.marginalTaxRate;
    const pporPay = pporPrincipalRepaymentForYear(g, ppor, cash);
    ppor.loan = Math.max(0, ppor.loan - pporPay);
    deductiblePporDebt = Math.min(deductiblePporDebt, ppor.loan);
    cash += deductiblePporTaxBenefit;

    // Existing IPs
    let ipNetCashflow = 0;
    for (const ip of ips) {
      if (year < ip.year) continue;
      if (year > ip.year) ip.value *= (1 + propertyGrowthPctForYear(ip, g, year)/100);
      const rent = ip.value * ((ip.yieldPct ?? g.propertyYieldPct)/100);
      const interestRate = (ip.interestPct ?? g.interestRatePct)/100;
      const interest = ip.loan * interestRate;
      const holding = ip.value * (g.nonInterestCostPct/100);
      const principal = ip.originalLoan * (g.principalRepayPct/100);
      const taxable = rent - interest - holding;
      const negGearAllowed = (ip.subtype === 'new') || ip.grandfathered;
      let tax;
      if (taxable >= 0) {
        const offset = Math.min(ip.carriedLoss || 0, taxable);
        const netTaxable = taxable - offset;
        ip.carriedLoss = (ip.carriedLoss || 0) - offset;
        tax = netTaxable * g.marginalTaxRate;
      } else if (negGearAllowed) {
        tax = taxable * g.marginalTaxRate; // refund (negative tax)
      } else {
        ip.carriedLoss = (ip.carriedLoss || 0) + (-taxable);
        tax = 0;
      }
      const cashflow = rent - interest - holding - principal - tax;
      ipNetCashflow += cashflow;
      ip.loan = Math.max(0, ip.loan - principal);
    }
    cash += ipNetCashflow;

    // Stocks: total return less dividends (paid as cash); price-only growth on stock balance.
    const stockGrowth = stockBalance * (g.stockGrowthPct/100);
    const dividends = stockBalance * (g.stockDividendPct/100);
    const divTax = dividends * ((g.stockDividendTaxRatePct ?? (g.marginalTaxRate * 100)) / 100);
    stockBalance += stockGrowth;
    cash += dividends - divTax;
    stockBalance -= dividends;
    stockBalance = Math.max(0, stockBalance);

    // Snapshot pre-purchase state so the UI can evaluate "what could I buy this year"
    // using the same lender logic as actual feasibility checks.
    const decisionCash = cash;
    const decisionPpor = { value: ppor.value, loan: ppor.loan, deductibleDebt: deductiblePporDebt };
    const decisionIps = ips.filter(p=>year>=p.year).map(p => ({
      loan: p.loan,
      value: p.value,
      yieldPct: p.yieldPct,
      subtype: p.subtype,
      grandfathered: p.grandfathered,
    }));

    // Process scheduled investments
    for (const inv of (byYear[year] || [])) {
      const before = snapshotForYear(year);
      const warningStart = yearLog.warnings.length;
      if (inv.type === 'stock') {
        const amt = inv.amount;
        const minCashBuffer = g.minCashBuffer || 0;
        const { source, cashUsed, equityDraw } = investmentFundingSplit(inv, amt);
        const pporUsable = Math.max(0, 0.8 * ppor.value - ppor.loan);
        const ipUsable = ips.filter(p=>year>=p.year)
          .reduce((s,p)=>s + Math.max(0, 0.8 * p.value - p.loan), 0);
        const usableEquity = pporUsable + ipUsable;
        let ok = true;
        if ((cash - cashUsed) < minCashBuffer) {
          const usableNow = Math.max(0, cash - minCashBuffer);
          yearLog.warnings.push(`Cash shortfall: need ${fmt(amt)} for ${inv.name}, usable ${fmt(usableNow)} after buffer ${fmt(minCashBuffer)}`);
          ok = false;
        }
        if (equityDraw > usableEquity) {
          yearLog.warnings.push(`Equity shortfall for ${inv.name}: need ${fmt(equityDraw)}, usable ${fmt(usableEquity)}`);
          ok = false;
        }
        const cap = borrowingCapacity(g, ips.filter(p=>year>=p.year), ppor, null, year);
        if (equityDraw > cap.dtiRoom) {
          yearLog.warnings.push(`DTI cap breached for ${inv.name}: new debt ${fmt(equityDraw)} > room ${fmt(cap.dtiRoom)}`);
          ok = false;
        }
        if (equityDraw > cap.servRoom) {
          yearLog.warnings.push(`Serviceability cap breached for ${inv.name}: new debt ${fmt(equityDraw)} > room ${fmt(cap.servRoom)}`);
          ok = false;
        }
        if (!ok && opts.strict) {
          investmentSteps.push({
            id: inv.id,
            year,
            type: inv.type,
            name: inv.name,
            investment: { amount: amt, source },
            funding: { cashUsed, equityDraw, totalRequired: amt },
            before,
            after: snapshotForYear(year),
            warnings: yearLog.warnings.slice(warningStart),
            skipped: true,
          });
          continue;
        }

        cash -= cashUsed;
        ppor.loan += equityDraw;
        deductiblePporDebt += equityDraw + deductibleOffsetAmount(g, ppor, cashUsed);
        deductiblePporDebt = Math.min(deductiblePporDebt, ppor.loan);
        stockBalance += amt;
        yearLog.events.push(`Buy stocks ${fmt(amt)} (${source}${cashUsed && equityDraw ? `: ${fmt(cashUsed)} cash, ${fmt(equityDraw)} equity` : ''})`);
        investmentSteps.push({
          id: inv.id,
          year,
          type: inv.type,
          name: inv.name,
          investment: { amount: amt, source },
          funding: { cashUsed, equityDraw, totalRequired: amt },
          before,
          after: snapshotForYear(year),
          warnings: yearLog.warnings.slice(warningStart),
          skipped: false,
        });
      } else if (inv.type === 'property') {
        const deposit = inv.price * (inv.depositPct/100);
        const upfront = inv.price * (g.stampDutyPct/100);
        const baseLoan = inv.price - deposit;
        const depositAndCosts = deposit + upfront;
        const depositSource = inv.depositSource || 'cash';

        const pporUsable = Math.max(0, 0.8 * ppor.value - ppor.loan);
        const ipUsable = ips.filter(p=>year>=p.year)
          .reduce((s,p)=>s + Math.max(0, 0.8 * p.value - p.loan), 0);
        const usableEquity = pporUsable + ipUsable;

        const { cashUsed, equityDraw } = investmentFundingSplit(inv, depositAndCosts);
        const totalNewDebt = baseLoan + equityDraw;

        const cap = borrowingCapacity(g, ips.filter(p=>year>=p.year), ppor, inv, year);
        let ok = true;
        const minCashBuffer = g.minCashBuffer || 0;
        if ((cash - cashUsed) < minCashBuffer) {
          const usableNow = Math.max(0, cash - minCashBuffer);
          yearLog.warnings.push(`Cash shortfall: need ${fmt(cashUsed)} for ${inv.name}, usable ${fmt(usableNow)} after buffer ${fmt(minCashBuffer)}`); ok = false;
        }
        if (equityDraw > usableEquity) {
          yearLog.warnings.push(`Equity shortfall for ${inv.name}: need ${fmt(equityDraw)}, usable ${fmt(usableEquity)}`); ok = false;
        }
        if (totalNewDebt > cap.dtiRoom) {
          yearLog.warnings.push(`DTI cap breached for ${inv.name}: new debt ${fmt(totalNewDebt)} > room ${fmt(cap.dtiRoom)}`); ok = false;
        }
        if (totalNewDebt > cap.servRoom) {
          yearLog.warnings.push(`Serviceability cap breached for ${inv.name}: new debt ${fmt(totalNewDebt)} > room ${fmt(cap.servRoom)}`); ok = false;
        }
        if (!ok && opts.strict) {
          investmentSteps.push({
            id: inv.id,
            year,
            type: inv.type,
            subtype: inv.subtype || 'established',
            name: inv.name,
            investment: { price: inv.price, depositPct: inv.depositPct, source: depositSource },
            funding: { deposit, upfront, baseLoan, cashUsed, equityDraw, totalRequired: depositAndCosts, totalNewDebt },
            before,
            after: snapshotForYear(year),
            warnings: yearLog.warnings.slice(warningStart),
            skipped: true,
          });
          continue;
        }

        cash -= cashUsed;
        ppor.loan += equityDraw;
          deductiblePporDebt += equityDraw + deductibleOffsetAmount(g, ppor, cashUsed);
          deductiblePporDebt = Math.min(deductiblePporDebt, ppor.loan);
        ips.push({
          id: inv.id, name: inv.name, year, price: inv.price, value: inv.price,
          loan: baseLoan, originalLoan: baseLoan,
          yieldPct: inv.yieldPct, growthPct: inv.growthPct,
          growthMode: inv.growthMode || (inv.growthSchedule?.length ? 'phased' : (inv.growthPct != null ? 'fixed' : 'auto')),
          growthSchedule: propertyGrowthSchedule(inv, g),
          interestPct: inv.interestPct ?? g.interestRatePct,
          subtype: inv.subtype || 'established',
          grandfathered: false,
          carriedLoss: 0,
          depositSource,
          cashUsed,
          equityDraw,
        });
        yearLog.events.push(`Buy property ${inv.name} ${fmt(inv.price)} (loan ${fmt(baseLoan)}${cashUsed?`, cash ${fmt(cashUsed)}`:''}${equityDraw?`, equity draw ${fmt(equityDraw)}`:''})`);
        investmentSteps.push({
          id: inv.id,
          year,
          type: inv.type,
          subtype: inv.subtype || 'established',
          name: inv.name,
          investment: { price: inv.price, depositPct: inv.depositPct, source: depositSource },
          funding: { deposit, upfront, baseLoan, cashUsed, equityDraw, totalRequired: depositAndCosts, totalNewDebt },
          before,
          after: snapshotForYear(year),
          warnings: yearLog.warnings.slice(warningStart),
          skipped: false,
        });
      }
    }

    if (cash < 0) {
      yearLog.warnings.push(`Cash negative: ${fmt(cash)}`);
      totalInvestedShortfall += -cash;
    }

    const totalIpValue = ips.filter(p=>year>=p.year).reduce((s,p)=>s+p.value,0);
    const totalIpLoan = ips.filter(p=>year>=p.year).reduce((s,p)=>s+p.loan,0);
    const netWorth = cash + stockBalance + ppor.value - ppor.loan + totalIpValue - totalIpLoan;
    const totalDebt = ppor.loan + totalIpLoan;
    const capNow = borrowingCapacity(g, ips.filter(p=>year>=p.year), ppor, null, year);
    yearRows.push({
      year, surplus,
      cash, stocks: stockBalance,
      pporValue: ppor.value, pporLoan: ppor.loan,
      pporDeductibleDebt: deductiblePporDebt,
      pporDeductibleInterest: deductiblePporInterest,
      pporDeductibleTaxBenefit: deductiblePporTaxBenefit,
      ipValue: totalIpValue, ipLoan: totalIpLoan,
      ipCount: ips.filter(p=>year>=p.year).length,
      ipCashflow: ipNetCashflow,
      netWorth, totalDebt,
      dtiUsed: totalDebt / householdGross(g, year),
      borrowingRoom: Math.min(capNow.dtiRoom, capNow.servRoom),
      decisionCash,
      decisionPpor,
      decisionIps,
      investmentSteps,
      events: yearLog.events,
      warnings: yearLog.warnings,
    });
  }
  return { yearRows, totalInvestedShortfall };
}

// ---------- HELPERS ----------
export function getRow(sim, year) { return sim.yearRows.find(r => r.year === year); }
export function allWarnings(sim) {
  return sim.yearRows.flatMap(r => r.warnings.map(w => ({ year: r.year, warning: w })));
}
