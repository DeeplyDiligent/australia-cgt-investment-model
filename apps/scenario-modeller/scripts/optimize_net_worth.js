import { DEFAULT_GLOBALS, END_YEAR, START_YEAR, simulate, allWarnings } from '../engine.js';
import { appendFileSync, writeFileSync } from 'node:fs';

const BAD_WARNING = /Cash shortfall|Equity shortfall|DTI cap breached|Serviceability cap breached|Cash negative/;

function parseArgs(argv) {
  const out = {
    maxBuys: END_YEAR - START_YEAR + 1,
    beamWidth: 250,
    candidateLimit: null,
    maxEvaluations: null,
    minPrice: 500000,
    maxPrice: 3000000,
    stepPrice: 50000,
    minStockAmount: 10000,
    maxStockAmount: 500000,
    stockStep: 10000,
    assetTypes: 'property,stock',
    fundingStepPct: 25,
    onePerYear: false,
    startYear: START_YEAR,
    endYear: END_YEAR,
    subtype: 'any',
    depositSource: 'any',
    minCashBuffer: 88000,
    bestJson: null,
    bestJsonl: null,
    debug: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--max-buys') out.maxBuys = Number(v);
    if (k === '--beam') out.beamWidth = Number(v);
    if (k === '--candidate-limit') out.candidateLimit = Number(v);
    if (k === '--max-evaluations') out.maxEvaluations = Number(v);
    if (k === '--min-price') out.minPrice = Number(v);
    if (k === '--max-price') out.maxPrice = Number(v);
    if (k === '--step-price') out.stepPrice = Number(v);
    if (k === '--min-stock-amount') out.minStockAmount = Number(v);
    if (k === '--max-stock-amount') out.maxStockAmount = Number(v);
    if (k === '--stock-step') out.stockStep = Number(v);
    if (k === '--asset-types') out.assetTypes = v;
    if (k === '--funding-step-pct') out.fundingStepPct = Number(v);
    if (k === '--one-per-year') out.onePerYear = true;
    if (k === '--allow-same-year') out.onePerYear = false;
    if (k === '--start-year') out.startYear = Number(v);
    if (k === '--end-year') out.endYear = Number(v);
    if (k === '--subtype') out.subtype = v;
    if (k === '--deposit-source') out.depositSource = v;
    if (k === '--min-cash-buffer') out.minCashBuffer = Number(v);
    if (k === '--best-json') out.bestJson = v;
    if (k === '--best-jsonl') out.bestJsonl = v;
    if (k === '--debug') out.debug = true;
  }

  return out;
}

function buildPrices(min, max, step) {
  const prices = [];
  for (let p = min; p <= max; p += step) prices.push(p);
  return prices;
}

function buildAmounts(min, max, step) {
  const amounts = [];
  for (let amount = min; amount <= max; amount += step) amounts.push(amount);
  return amounts;
}

function buildYears(start, end) {
  const years = [];
  for (let y = start; y <= end; y++) years.push(y);
  return years;
}

function expandChoices(value, options) {
  return value === 'any' ? options : [value];
}

function buildFundingPcts(depositSource, stepPct) {
  if (depositSource === 'cash') return [100];
  if (depositSource === 'equity') return [0];
  const step = Math.max(1, Number(stepPct) || 25);
  const values = [];
  for (let pct = 0; pct <= 100; pct += step) values.push(Math.min(100, pct));
  if (!values.includes(100)) values.push(100);
  return [...new Set(values)].sort((a, b) => a - b);
}

function sourceFromCashPct(cashFundingPct) {
  if (cashFundingPct <= 0) return 'equity';
  if (cashFundingPct >= 100) return 'cash';
  return 'mixed';
}

function base64UrlEncode(text) {
  return Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function evaluatePlan(globals, plan) {
  const sim = simulate(globals, plan);
  const warnings = allWarnings(sim).filter((w) => BAD_WARNING.test(w.warning));
  const finalRow = sim.yearRows[sim.yearRows.length - 1];
  return {
    feasible: warnings.length === 0,
    warnings,
    finalNetWorth: finalRow.netWorth,
    finalDebt: finalRow.totalDebt,
    finalCash: finalRow.cash,
    finalIpCount: finalRow.ipCount,
  };
}

function makeInvestment(index, year, price, globals, subtype, cashFundingPct) {
  return {
    id: `opt-${index}`,
    type: 'property',
    subtype,
    depositSource: sourceFromCashPct(cashFundingPct),
    cashFundingPct,
    name: `OPT ${year} @ ${price.toLocaleString()}`,
    year,
    price,
    depositPct: globals.depositPct,
    yieldPct: globals.propertyYieldPct,
    growthMode: 'auto',
    interestPct: globals.interestRatePct,
    owner: 'primary',
    primaryOwnershipPct: 100,
  };
}

function makeStockInvestment(index, year, amount, cashFundingPct) {
  return {
    id: `opt-${index}`,
    type: 'stock',
    name: `OPT stock ${year} @ ${amount.toLocaleString()}`,
    year,
    amount,
    depositSource: sourceFromCashPct(cashFundingPct),
    cashFundingPct,
    owner: 'primary',
    primaryOwnershipPct: 100,
  };
}

function signature(plan) {
  return plan.map((p) => p.type === 'stock'
    ? `${p.year}-stock-${p.amount}-${p.cashFundingPct}`
    : `${p.year}-${p.price}-${p.subtype}-${p.cashFundingPct}`
  ).join('|');
}

function debugLog(cfg, message) {
  if (!cfg.debug) return;
  console.error(message);
}

function publicPlan(plan) {
  return plan.map((p) => p.type === 'stock'
    ? { type: p.type, year: p.year, amount: p.amount, depositSource: p.depositSource, cashFundingPct: p.cashFundingPct }
    : { type: p.type, year: p.year, price: p.price, subtype: p.subtype, depositSource: p.depositSource, cashFundingPct: p.cashFundingPct }
  );
}

function bestSummary(best) {
  return {
    additionalInvestments: best.plan.length,
    finalNetWorth: Math.round(best.finalNetWorth),
    finalDebt: Math.round(best.finalDebt),
    finalCash: Math.round(best.finalCash),
    finalIpCount: best.finalIpCount,
    plan: publicPlan(best.plan),
  };
}

function scenarioPayload(globals, plan) {
  return { globals, investments: plan, tab: 'borrow' };
}

function scenarioUrl(globals, plan) {
  const scenario = scenarioPayload(globals, plan);
  return `http://localhost:8765/scenario_modeller.html?v=4&scenario=${base64UrlEncode(JSON.stringify(scenario))}`;
}

function writeBestProgress(cfg, payload) {
  if (!cfg.bestJson) return;
  writeFileSync(cfg.bestJson, JSON.stringify(payload, null, 2));
}

function resetBestJsonl(cfg) {
  if (!cfg.bestJsonl) return;
  writeFileSync(cfg.bestJsonl, '');
}

function appendBestJsonl(cfg, payload) {
  if (!cfg.bestJsonl) return;
  appendFileSync(cfg.bestJsonl, `${JSON.stringify(payload)}\n`);
}

function trimCandidates(candidates, limit) {
  if (candidates.length <= limit) return candidates;
  candidates.sort((a, b) => b.finalNetWorth - a.finalNetWorth);
  candidates.length = limit;
  return candidates;
}

function optimise(globals, cfg) {
  const years = buildYears(cfg.startYear, cfg.endYear);
  const prices = buildPrices(cfg.minPrice, cfg.maxPrice, cfg.stepPrice);
  const stockAmounts = buildAmounts(cfg.minStockAmount, cfg.maxStockAmount, cfg.stockStep);
  const assetTypes = cfg.assetTypes.split(',').map((x) => x.trim()).filter(Boolean);
  const subtypes = expandChoices(cfg.subtype, ['new', 'established']);
  const fundingPcts = buildFundingPcts(cfg.depositSource, cfg.fundingStepPct);
  const candidateLimit = cfg.candidateLimit || Math.max(cfg.beamWidth * 12, cfg.beamWidth + 1);
  const emptyResult = evaluatePlan(globals, []);

  let states = [{ plan: [], lastYear: cfg.startYear }];
  let best = {
    plan: [],
    finalNetWorth: emptyResult.finalNetWorth,
    finalDebt: emptyResult.finalDebt,
    finalCash: emptyResult.finalCash,
    finalIpCount: emptyResult.finalIpCount,
  };

  let evaluations = 0;
  let stoppedEarly = false;
  const bestHistory = [];
  resetBestJsonl(cfg);

  function recordBest(depth, kind = 'new-best') {
    const event = {
      kind,
      depth,
      evaluations,
      foundAt: new Date().toISOString(),
      finalNetWorth: Math.round(best.finalNetWorth),
      additionalInvestments: best.plan.length,
      finalDebt: Math.round(best.finalDebt),
      finalCash: Math.round(best.finalCash),
      finalIpCount: best.finalIpCount,
      stoppedEarly,
      config: cfg,
      globals,
      plan: publicPlan(best.plan),
      scenario: scenarioPayload(globals, best.plan),
      scenarioUrl: scenarioUrl(globals, best.plan),
    };
    bestHistory.push({
      kind: event.kind,
      depth: event.depth,
      evaluations: event.evaluations,
      foundAt: event.foundAt,
      finalNetWorth: event.finalNetWorth,
      additionalInvestments: event.additionalInvestments,
    });
    appendBestJsonl(cfg, event);
    writeBestProgress(cfg, {
      updatedAt: new Date().toISOString(),
      evaluations,
      depth,
      stoppedEarly,
      config: cfg,
      best: bestSummary(best),
      bestHistory,
      scenarioUrl: scenarioUrl(globals, best.plan),
    });
  }

  recordBest(0, 'initial');

  for (let depth = 1; depth <= cfg.maxBuys; depth++) {
    const next = [];
    let feasibleAtDepth = 0;

    debugLog(cfg, `depth ${depth}: exploring ${states.length} states across ${years.length} years x ${prices.length} property prices x ${stockAmounts.length} stock amounts x ${subtypes.length} subtypes x ${fundingPcts.length} funding mixes`);

    for (const s of states) {
      for (const y of years) {
        if (y < s.lastYear) continue;

        if (assetTypes.includes('stock')) {
          for (const amount of stockAmounts) {
            for (const cashFundingPct of fundingPcts) {
              const inv = makeStockInvestment(s.plan.length + 1, y, amount, cashFundingPct);
              const plan = [...s.plan, inv];
              const result = evaluatePlan(globals, plan);
              evaluations++;

              if (cfg.maxEvaluations && evaluations >= cfg.maxEvaluations) {
                stoppedEarly = true;
                debugLog(cfg, `stopping early after ${evaluations.toLocaleString()} evaluations`);
                break;
              }

              if (!result.feasible) continue;
              feasibleAtDepth++;

              const candidate = {
                plan,
                lastYear: cfg.onePerYear ? y + 1 : y,
                finalNetWorth: result.finalNetWorth,
                finalDebt: result.finalDebt,
                finalCash: result.finalCash,
                finalIpCount: result.finalIpCount,
              };

              next.push(candidate);
              if (next.length > candidateLimit * 2) trimCandidates(next, candidateLimit);

              if (candidate.finalNetWorth > best.finalNetWorth) {
                best = candidate;
                debugLog(cfg, `depth ${depth}: new best net worth ${Math.round(best.finalNetWorth).toLocaleString()} with ${best.plan.length} buys`);
                recordBest(depth);
              }
            }
            if (stoppedEarly) break;
          }
          if (stoppedEarly) break;
        }

        if (!assetTypes.includes('property')) continue;

        for (const price of prices) {
          for (const subtype of subtypes) {
            for (const cashFundingPct of fundingPcts) {
              const inv = makeInvestment(s.plan.length + 1, y, price, globals, subtype, cashFundingPct);
              const plan = [...s.plan, inv];
              const result = evaluatePlan(globals, plan);
              evaluations++;

              if (cfg.maxEvaluations && evaluations >= cfg.maxEvaluations) {
                stoppedEarly = true;
                debugLog(cfg, `stopping early after ${evaluations.toLocaleString()} evaluations`);
                break;
              }

              if (!result.feasible) continue;
              feasibleAtDepth++;

              const candidate = {
                plan,
                lastYear: cfg.onePerYear ? y + 1 : y,
                finalNetWorth: result.finalNetWorth,
                finalDebt: result.finalDebt,
                finalCash: result.finalCash,
                finalIpCount: result.finalIpCount,
              };

              next.push(candidate);
              if (next.length > candidateLimit * 2) trimCandidates(next, candidateLimit);

              if (candidate.finalNetWorth > best.finalNetWorth) {
                best = candidate;
                debugLog(cfg, `depth ${depth}: new best net worth ${Math.round(best.finalNetWorth).toLocaleString()} with ${best.plan.length} buys`);
                recordBest(depth);
              }
            }
            if (stoppedEarly) break;
          }
          if (stoppedEarly) break;
        }
        if (stoppedEarly) break;
      }
      if (stoppedEarly) break;
    }

    if (!next.length) break;

  trimCandidates(next, candidateLimit);
    next.sort((a, b) => b.finalNetWorth - a.finalNetWorth);

    const deduped = [];
    const seen = new Set();
    for (const item of next) {
      const key = signature(item.plan);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
      if (deduped.length >= cfg.beamWidth) break;
    }

    states = deduped.map((d) => ({ plan: d.plan, lastYear: d.lastYear }));
    debugLog(cfg, `depth ${depth}: feasible ${feasibleAtDepth}, retained ${states.length}, total evaluations ${evaluations}`);
    if (stoppedEarly) break;
  }

  const url = scenarioUrl(globals, best.plan);
  writeBestProgress(cfg, {
    updatedAt: new Date().toISOString(),
    evaluations,
    depth: Math.min(cfg.maxBuys, best.plan.length),
    stoppedEarly,
    config: cfg,
    best: bestSummary(best),
    bestHistory,
    scenarioUrl: url,
  });

  return { best, evaluations, config: cfg, url, stoppedEarly };
}

const cfg = parseArgs(process.argv.slice(2));
const globals = { ...DEFAULT_GLOBALS, minCashBuffer: cfg.minCashBuffer };
const result = optimise(globals, cfg);

console.log(JSON.stringify({
  config: result.config,
  evaluations: result.evaluations,
  best: bestSummary(result.best),
  stoppedEarly: result.stoppedEarly,
  scenarioUrl: result.url,
}, null, 2));
