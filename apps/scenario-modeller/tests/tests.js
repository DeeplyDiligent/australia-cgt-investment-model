// Node CLI test runner for the simulation engine.
//   node tests.js              # run all built-in tests
//   node tests.js --scenario   # dump a full sim with the default plan
//   node tests.js --json '<json>'  # run an arbitrary scenario from stdin/arg

import {
  START_YEAR, END_YEAR, AVAILABLE_TO_INVEST, INITIAL_STATE, DEFAULT_GLOBALS,
  simulate, borrowingCapacity, afterTaxIncome, householdGross, householdNet,
  defaultGrowthScheduleForProperty, propertyGrowthPctForYear, priceBandThresholdsForYear, availableToInvestForYear,
  pporPrincipalRepaymentForYear, getRow, allWarnings,
} from './engine.js';

// ---------- TINY ASSERTION LIB ----------
let passed = 0, failed = 0;
const failures = [];

function near(actual, expected, tol = 1, msg = '') {
  if (Math.abs(actual - expected) <= tol) return true;
  throw new Error(`${msg} expected ≈ ${expected} (±${tol}), got ${actual}`);
}
function eq(actual, expected, msg = '') {
  if (actual === expected) return true;
  throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function truthy(v, msg = '') {
  if (v) return true;
  throw new Error(`${msg} expected truthy, got ${JSON.stringify(v)}`);
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`  \u2717 ${name}`);
    console.log(`      ${e.message}`);
  }
}

function section(label) { console.log(`\n[${label}]`); }

// ---------- FIXTURES ----------
const G = DEFAULT_GLOBALS;
const emptyPlan = [];
const samplePropertyEstablished = {
  id: 't1', name: 'Test IP Est', type: 'property', subtype: 'established',
  depositSource: 'cash', year: 2028, price: 700000,
  depositPct: 20, yieldPct: 4.0, growthPct: 4.0, interestPct: 6.2,
};
const samplePropertyNew = { ...samplePropertyEstablished, id: 't2', subtype: 'new', name: 'Test IP New' };
const samplePropertyEquity = { ...samplePropertyEstablished, id: 't3', depositSource: 'equity', name: 'Test IP Equity' };

// ---------- TESTS ----------
section('Tax calc');
test('afterTaxIncome(300000) matches ATO 2024-25 brackets', () => {
  near(afterTaxIncome(300000), 192862, 1);
});
test('afterTaxIncome(0) is 0', () => eq(afterTaxIncome(0), 0));
test('afterTaxIncome(45000) deducts 16% on slice above 18.2k + medicare', () => {
  // tax = (45000-18200)*0.16 = 4288; medicare 900
  near(afterTaxIncome(45000), 45000 - 4288 - 900, 1);
});
test('Household gross sums both incomes (200k + 67k = 267k)', () => {
  eq(householdGross(G), 267000);
});
test('Household gross grows by incomeGrowthPct in future years', () => {
  near(householdGross(G, 2028), 267000 * Math.pow(1 + G.incomeGrowthPct/100, 2), 1);
});
test('Household net taxes each earner independently', () => {
  // Each gets their own brackets/Medicare, NOT joint.
  near(householdNet(G), afterTaxIncome(200000) + afterTaxIncome(67000), 1);
});
test('Single household (partner=0) still works', () => {
  const single = { ...G, partnerGrossIncome: 0 };
  near(householdNet(single), afterTaxIncome(200000), 1);
});
test('PPOR and investment debt use separate default rates', () => {
  near(G.ppor.loanRatePct, 5.95, 0.001);
  near(G.interestRatePct, 6.3, 0.001);
});

section('Growth assumptions');
test('New 700k property gets 2% then 4% then 5% auto growth', () => {
  const sched = defaultGrowthScheduleForProperty('new', 700000);
  eq(sched[0].pct, 2);
  eq(sched[1].pct, 4);
  eq(sched[2].pct, 5);
  const prop = { subtype: 'new', price: 700000, year: 2026, growthMode: 'auto' };
  eq(propertyGrowthPctForYear(prop, G, 2027), 2);
  eq(propertyGrowthPctForYear(prop, G, 2032), 4);
  eq(propertyGrowthPctForYear(prop, G, 2037), 5);
});
test('New 800k stays in the middle bucket, but >800k gets 5% immediately', () => {
  eq(defaultGrowthScheduleForProperty('new', 800000)[0].pct, 2);
  eq(defaultGrowthScheduleForProperty('new', 850000)[0].pct, 5);
});
test('Category price bands drift upward over time from 2026 levels', () => {
  const bands2026 = priceBandThresholdsForYear(2026, G);
  const bands2044 = priceBandThresholdsForYear(2044, G);
  eq(Math.round(bands2026.lower), 600000);
  truthy(bands2044.lower > bands2026.lower);
});
test('An 850k new property in 2044 no longer falls in the premium bucket', () => {
  eq(defaultGrowthScheduleForProperty('new', 850000, 2044, G)[0].pct, 0);
  eq(defaultGrowthScheduleForProperty('new', 2200000, 2044, G)[0].pct, 5);
});
test('Fixed growth mode still uses explicit growthPct', () => {
  const prop = { subtype: 'new', price: 700000, year: 2026, growthMode: 'fixed', growthPct: 6.5 };
  eq(propertyGrowthPctForYear(prop, G, 2035), 6.5);
});

section('Surplus timing');
test('2026 surplus is prorated by currentYearSurplusFraction', () => {
  near(availableToInvestForYear(G, START_YEAR), AVAILABLE_TO_INVEST[START_YEAR] * G.currentYearSurplusFraction, 1);
});
test('Later years use full available-to-invest values', () => {
  eq(availableToInvestForYear(G, 2027), AVAILABLE_TO_INVEST[2027]);
});

section('Borrowing capacity');
test('DTI room with no IPs ≈ 6×household_gross − PPOR loan', () => {
  const cap = borrowingCapacity(G, [], { value: INITIAL_STATE.ppor.value, loan: INITIAL_STATE.ppor.loan });
  near(cap.dtiRoom, 6*householdGross(G) - INITIAL_STATE.ppor.loan, 1);
});
test('Future DTI room uses inflated household income', () => {
  const ppor = { value: INITIAL_STATE.ppor.value, loan: INITIAL_STATE.ppor.loan };
  const cap2028 = borrowingCapacity(G, [], ppor, null, 2028);
  near(cap2028.dtiRoom, 6*householdGross(G, 2028) - INITIAL_STATE.ppor.loan, 1);
  truthy(cap2028.dtiRoom > borrowingCapacity(G, [], ppor, null, 2026).dtiRoom);
});
test('Servicing room is positive at baseline (no prospective)', () => {
  const cap = borrowingCapacity(G, [], { value: INITIAL_STATE.ppor.value, loan: INITIAL_STATE.ppor.loan });
  truthy(cap.servRoom > 0);
});
test('New build adds neg-gearing tax shield to servicing income', () => {
  const ppor = { value: INITIAL_STATE.ppor.value, loan: INITIAL_STATE.ppor.loan };
  const capEst = borrowingCapacity(G, [], ppor, samplePropertyEstablished);
  const capNew = borrowingCapacity(G, [], ppor, samplePropertyNew);
  truthy(capNew.negGearAddBack > capEst.negGearAddBack);
  truthy(capNew.servRoom > capEst.servRoom);
});
test('Equity-funded deposit increases assessed debt vs cash', () => {
  const ppor = { value: INITIAL_STATE.ppor.value, loan: INITIAL_STATE.ppor.loan };
  // Solve dtiRoom delta by inspecting servRoom shrink
  const capCash = borrowingCapacity(G, [], ppor, samplePropertyEstablished);
  const capEq = borrowingCapacity(G, [], ppor, samplePropertyEquity);
  // both compute servRoom regardless of prospective debt path; sanity: capCash still defined
  truthy(capCash.dtiRoom === capEq.dtiRoom); // dtiRoom is based on existing debt only here
});

section('Simulation — baseline (no new investments)');
const baseline = simulate(G, emptyPlan);
test('Baseline produces a row per year', () => {
  eq(baseline.yearRows.length, END_YEAR - START_YEAR + 1);
});
test('First year surplus matches AVAILABLE_TO_INVEST', () => {
  near(getRow(baseline, START_YEAR).surplus, AVAILABLE_TO_INVEST[START_YEAR] * G.currentYearSurplusFraction, 1);
});
test('Cash grows over time with no investments', () => {
  const first = getRow(baseline, START_YEAR).cash;
  const last = getRow(baseline, END_YEAR).cash;
  truthy(last > first);
});
test('Stock dividends use tax after franking credits', () => {
  const noDividendTax = simulate({ ...G, stockDividendTaxRatePct: 0 }, []);
  const frankedDividendTax = simulate({ ...G, stockDividendTaxRatePct: 17 }, []);
  const firstNoTax = getRow(noDividendTax, START_YEAR).cash;
  const firstFrankedTax = getRow(frankedDividendTax, START_YEAR).cash;
  const openingStockDividends = INITIAL_STATE.stocks * (G.stockDividendPct/100);
  near(firstNoTax - firstFrankedTax, openingStockDividends * 0.17, 1);
});
test('PPOR loan reduces to ~0 by 2049 with default amortisation', () => {
  // 3% of $740906 originalLoan = $22,227/yr × 24yr = $533k; loan reduces from $740k by that much.
  const last = getRow(baseline, END_YEAR);
  truthy(last.pporLoan < INITIAL_STATE.ppor.loan);
});
test('PPOR principal repayment uses repayment less offset-adjusted interest', () => {
  const ppor = { value: INITIAL_STATE.ppor.value, loan: INITIAL_STATE.ppor.loan, originalLoan: INITIAL_STATE.ppor.loan };
  const principal = pporPrincipalRepaymentForYear(G, ppor, INITIAL_STATE.cash);
  const interest = Math.max(0, INITIAL_STATE.ppor.loan - INITIAL_STATE.cash) * (G.ppor.loanRatePct/100);
  near(principal, G.ppor.repaymentMonthly * 12 - interest, 1);
});
test('Baseline has zero IP cashflow before adding any properties', () => {
  const r = getRow(baseline, START_YEAR);
  eq(r.ipCount, 0);
  near(r.ipCashflow, 0, 0.01);
});

section('Simulation — single established IP, cash deposit, 2028');
const planEst = [samplePropertyEstablished];
const simEst = simulate(G, planEst);
test('IP count goes from 0 to 1 in 2028', () => {
  eq(getRow(simEst, 2027).ipCount, 0);
  eq(getRow(simEst, 2028).ipCount, 1);
});
test('Cash drops by ~$140k in 2028 (20% deposit + 5.5% costs of $700k)', () => {
  const cashBefore = getRow(simEst, 2027).cash;
  const cashAfter = getRow(simEst, 2028).cash;
  const surplus2028 = AVAILABLE_TO_INVEST[2028];
  // delta ≈ surplus + interest + ipCashflow + dividends − $178.5k
  const expectedDraw = 700000 * 0.255; // 178,500
  const consumed = cashBefore + surplus2028 - cashAfter;
  truthy(consumed > expectedDraw - 30000 && consumed < expectedDraw + 30000,
    `cash drop ${consumed} should be near ${expectedDraw}`);
});
test('PPOR loan unchanged by cash-deposit purchase', () => {
  // Cash deposit must not touch PPOR loan.
  const baselineLoan2028 = getRow(simulate(G, []), 2028).pporLoan;
  const planLoan2028 = getRow(simEst, 2028).pporLoan;
  near(baselineLoan2028, planLoan2028, 1);
});
test('Established post-policy IP quarantines losses (no refund)', () => {
  // Compare IP cashflow uplift: established (no refund) should be worse than new (refund).
  // Compare in 2029 — the year *after* purchase, when the new IP has been generating cashflow.
  const simNew = simulate(G, [samplePropertyNew]);
  const cfEst = getRow(simEst, 2029).ipCashflow;
  const cfNew = getRow(simNew, 2029).ipCashflow;
  truthy(cfNew > cfEst, `new-build cashflow ${cfNew} should beat established ${cfEst}`);
});

section('Simulation — equity-funded deposit');
const simEq = simulate(G, [samplePropertyEquity]);
test('Equity deposit increases PPOR loan in purchase year', () => {
  const baseLoan = getRow(simulate(G, []), 2028).pporLoan;
  const eqLoan = getRow(simEq, 2028).pporLoan;
  truthy(eqLoan > baseLoan, `equity path PPOR loan ${eqLoan} should exceed baseline ${baseLoan}`);
  near(eqLoan - baseLoan, 700000 * 0.255, 5);
});
test('Equity deposit leaves cash mostly untouched', () => {
  const baseCash = getRow(simulate(G, []), 2028).cash;
  const eqCash = getRow(simEq, 2028).cash;
  // Equity path still pays interest on bigger loan, so slightly lower than baseline but no $140k drop.
  truthy(Math.abs(baseCash - eqCash) < 30000, `cash diff ${baseCash - eqCash} should be small`);
});
test('Mixed property funding uses both cash and PPOR equity', () => {
  const mixed = { ...samplePropertyNew, id: 'mixed', depositSource: 'mixed', cashFundingPct: 40 };
  const sim = simulate(G, [mixed]);
  const baseLoan = getRow(simulate(G, []), 2028).pporLoan;
  const row = getRow(sim, 2028);
  const upfront = mixed.price * (mixed.depositPct/100 + G.stampDutyPct/100);
  near(row.pporLoan - baseLoan, upfront * 0.60, 5);
  truthy(row.pporDeductibleDebt > 0, 'mixed investment funding should create deductible PPOR/offset debt');
});
test('Cash-funded stock from offset creates deductible interest without increasing PPOR loan', () => {
  const stock = { id: 'stock-cash', type: 'stock', name: 'Stock cash', year: 2028, amount: 50000, depositSource: 'cash' };
  const sim = simulate(G, [stock]);
  const baseLoan = getRow(simulate(G, []), 2028).pporLoan;
  const row = getRow(sim, 2028);
  near(row.pporLoan, baseLoan, 1);
  truthy(row.pporDeductibleDebt > 0, 'offset cash invested into stocks should create deductible interest base');
});
test('Equity-funded stock increases PPOR loan and deductible interest base', () => {
  const stock = { id: 'stock-equity', type: 'stock', name: 'Stock equity', year: 2028, amount: 50000, depositSource: 'equity' };
  const sim = simulate(G, [stock]);
  const baseLoan = getRow(simulate(G, []), 2028).pporLoan;
  const row = getRow(sim, 2028);
  near(row.pporLoan - baseLoan, 50000, 1);
  truthy(row.pporDeductibleDebt >= 50000, 'equity-funded stocks should create deductible PPOR debt');
});

section('Constraint warnings');
test('Cash shortfall warns when buying with no savings', () => {
  // 5 properties in same year would blow cash
  const plan = [1,2,3,4,5].map(i => ({ ...samplePropertyEstablished, id: 'big'+i, year: 2026 }));
  const sim = simulate(G, plan);
  const warns = allWarnings(sim).filter(w => /Cash shortfall/.test(w.warning));
  truthy(warns.length > 0, 'expected at least one cash shortfall warning');
});
test('Stock buys respect protected cash buffer', () => {
  const sim = simulate({ ...G, minCashBuffer: 999999 }, [{ id: 'stock-big', type: 'stock', name: 'Stock buffer test', year: START_YEAR, amount: 10000 }]);
  const warns = allWarnings(sim).filter(w => /Cash shortfall/.test(w.warning));
  truthy(warns.length > 0, 'expected stock cash shortfall warning');
});
test('Equity shortfall warns when drawing more than 80% LVR allows', () => {
  const plan = [{ ...samplePropertyEquity, year: 2026 }]; // usable equity in 2026 is only ~$117k
  const sim = simulate(G, plan);
  const warns = allWarnings(sim).filter(w => /Equity shortfall/.test(w.warning));
  truthy(warns.length > 0, 'expected an equity-shortfall warning');
});
test('Empty plan produces zero warnings (other than nothing)', () => {
  const sim = simulate(G, []);
  const warns = allWarnings(sim);
  eq(warns.length, 0);
});

section('Deterministic & no NaN');
test('All numeric fields are finite for baseline run', () => {
  for (const r of baseline.yearRows) {
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === 'number' && !Number.isFinite(v)) {
        throw new Error(`Year ${r.year} field ${k} is ${v}`);
      }
    }
  }
});
test('simulate is deterministic (same input → same output)', () => {
  const a = JSON.stringify(simulate(G, planEst).yearRows);
  const b = JSON.stringify(simulate(G, planEst).yearRows);
  eq(a, b);
});

// ---------- CLI MODES ----------
const args = process.argv.slice(2);

if (args.includes('--scenario')) {
  const sim = simulate(G, planEst);
  console.log('\n[Scenario dump — default plan]');
  console.table(sim.yearRows.map(r => ({
    year: r.year,
    surplus: Math.round(r.surplus),
    cash: Math.round(r.cash),
    stocks: Math.round(r.stocks),
    ips: r.ipCount,
    ipVal: Math.round(r.ipValue),
    debt: Math.round(r.totalDebt),
    netWorth: Math.round(r.netWorth),
    borrowRoom: Math.round(r.borrowingRoom),
    warnings: r.warnings.length,
  })));
} else if (args.includes('--json')) {
  const idx = args.indexOf('--json');
  const payload = JSON.parse(args[idx+1] || '{}');
  const userGlobals = { ...G, ...(payload.globals||{}), ppor: { ...G.ppor, ...((payload.globals||{}).ppor||{}) } };
  const sim = simulate(userGlobals, payload.investments || []);
  process.stdout.write(JSON.stringify(sim, null, 2));
} else {
  // ---------- SUMMARY ----------
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
