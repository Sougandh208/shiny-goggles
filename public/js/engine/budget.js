// Budget allocation, benchmark scaling, forecasting and unit economics.
// Pure functions, no DOM. All money is in the region's local currency.

import {
  CATEGORIES, GOAL_MODEL, LEAD_CLOSE_RATE, PLATFORMS, PLATFORM_ORDER, REGIONS, SCENARIOS, fmtMoney,
} from './knowledge.js';

const DAYS = 30;
// Share of the monthly budget held back to feed winners once data arrives.
export const RESERVE_SHARE = 0.1;

/** Expected benchmarks for one platform, in local currency, tuned to this business. */
export function getBenchmarks(platformId, profile) {
  const region = REGIONS[profile.region];
  const cat = CATEGORIES[profile.category];
  const plat = PLATFORMS[platformId];
  const goal = GOAL_MODEL[profile.goal];
  const cpc = plat.cpc * region.costIndex * region.fx * cat.mult.cpc;
  const ctr = plat.ctr * cat.mult.ctr;
  const cvr = plat.cvr * cat.mult.cvr * goal.cvr;
  return {
    cpc,
    ctr,
    cvr,
    cpm: (cpc * ctr) * 10, // cost per 1,000 impressions
  };
}

/** What one conversion is worth and where the profit line sits. */
export function unitEconomics(profile) {
  const goal = GOAL_MODEL[profile.goal];
  const margin = profile.margin / 100;
  const valuePerConversion = profile.aov * (profile.goal === 'leads' ? LEAD_CLOSE_RATE : 1);
  const breakEvenRoas = 1 / margin;
  const breakEvenCpa = valuePerConversion * margin;
  const maxCpc = {};
  for (const id of PLATFORM_ORDER) {
    const b = getBenchmarks(id, profile);
    maxCpc[id] = breakEvenCpa * (b.cvr / 100);
  }
  return { margin, valuePerConversion, breakEvenRoas, breakEvenCpa, maxCpc, conversionLabel: goal.label, conversionNoun: goal.noun };
}

function platformWeights(profile) {
  const cat = CATEGORIES[profile.category];
  const goal = GOAL_MODEL[profile.goal];
  const w = {};
  for (const id of PLATFORM_ORDER) {
    let v = cat.weights[id] * goal.weights[id];
    if (profile.scope === 'local' && id === 'youtube') v *= 0.6; // wide reach is wasted
    if (profile.scope === 'local' && id === 'google') v *= 1.1;
    if (profile.scope === 'online' && id === 'facebook') v *= 0.9;
    w[id] = v;
  }
  return w;
}

function roundTo(v, step) {
  return Math.max(0, Math.round(v / step) * step);
}

const PLATFORM_WHY = {
  instagram: (p) => `People discover ${p.category === 'services' ? 'trusted local names' : 'products'} here visually. Reels and Stories give your poster and video a home.`,
  facebook: (p) => `Strong local targeting and older buyers${p.goal === 'leads' ? '; click-to-WhatsApp/Messenger keeps enquiries cheap' : ''}.`,
  google: () => 'Catches people already searching to buy, so every click is high intent.',
  youtube: () => 'Low-cost reach with your video ad; best for being remembered.',
};

/**
 * Splits the budget across platforms. Splitting too thin starves every
 * platform of learning data, so we only keep as many platforms as the daily
 * budget can actually feed.
 */
export function planBudget(profile) {
  const region = REGIONS[profile.region];
  const monthly = profile.monthlyBudget;
  const reserve = roundTo(monthly * RESERVE_SHARE, region.step);
  const deployable = monthly - reserve;
  const dailyDeployable = deployable / DAYS;
  const notes = [];

  const weights = platformWeights(profile);
  const ranked = PLATFORM_ORDER.slice().sort((a, b) => weights[b] - weights[a]);

  // Keep dropping the weakest platform until every remaining one gets at least
  // the learning minimum from its weighted share. Splitting thinner than that
  // starves each platform of data and wastes the money.
  const canFeed = Math.floor(dailyDeployable / region.minDaily);
  let chosen = ranked.slice(0, Math.min(PLATFORM_ORDER.length, Math.max(1, canFeed)));
  while (chosen.length > 1) {
    const tw = chosen.reduce((s, id) => s + weights[id], 0);
    if (!chosen.some((id) => (dailyDeployable * weights[id]) / tw < region.minDaily)) break;
    chosen = chosen.slice(0, -1);
  }
  const count = chosen.length;

  if (canFeed < 1) {
    notes.push(
      `Your budget works out to about ${fmtMoney(monthly / DAYS, region)} a day, below the ${fmtMoney(region.minDaily, region)} per platform that ad systems need to learn. ` +
        'Everything goes to one platform, and running ads on your best 3 to 4 days a week (peak days below) will stretch it further than spreading thin every day.',
    );
  } else if (count < PLATFORM_ORDER.length) {
    notes.push(
      `With ${fmtMoney(dailyDeployable, region)} a day we recommend ${count} platform${count > 1 ? 's' : ''}. Splitting across more would leave at least one below the ${fmtMoney(region.minDaily, region)} a day needed to learn.`,
    );
  }

  const totalW = chosen.reduce((s, id) => s + weights[id], 0);
  const rows = chosen.map((id) => {
    const share = weights[id] / totalW;
    const amount = roundTo(deployable * share, region.step);
    return { id, name: PLATFORMS[id].name, share, monthly: amount };
  });
  // Absorb rounding drift into the largest line so the total is exact.
  const drift = deployable - rows.reduce((s, r) => s + r.monthly, 0);
  rows[0].monthly = Math.max(0, rows[0].monthly + drift);
  for (const r of rows) {
    r.share = deployable > 0 ? r.monthly / deployable : 0;
    r.daily = r.monthly / DAYS;
    r.formats = PLATFORMS[r.id].formats;
    r.role = PLATFORMS[r.id].role;
    r.why = PLATFORM_WHY[r.id](profile);
    r.benchmarks = getBenchmarks(r.id, profile);
  }

  return { monthly, reserve, deployable, dailyTotal: monthly / DAYS, rows, notes, region };
}

/** Forecast for a spend on one platform under a scenario. */
export function forecastPlatform(platformId, spend, profile, scenarioId = 'expected') {
  const s = SCENARIOS[scenarioId];
  const b = getBenchmarks(platformId, profile);
  const cpc = b.cpc * s.cpc;
  const ctr = b.ctr * s.ctr;
  const cvr = b.cvr * s.cvr;
  const clicks = spend / cpc;
  const impressions = clicks / (ctr / 100);
  const conversions = clicks * (cvr / 100);
  const ue = unitEconomics(profile);
  const revenue = conversions * ue.valuePerConversion;
  return { spend, cpc, ctr, cvr, clicks, impressions, conversions, revenue, roas: spend > 0 ? revenue / spend : 0 };
}

/** Full forecast for the plan: every platform + totals, for one scenario. */
export function forecastPlan(plan, profile, scenarioId = 'expected') {
  const rows = plan.rows.map((r) => ({ id: r.id, ...forecastPlatform(r.id, r.monthly, profile, scenarioId) }));
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const spend = sum('spend');
  const revenue = sum('revenue');
  const clicks = sum('clicks');
  const totals = {
    spend,
    impressions: sum('impressions'),
    clicks,
    conversions: sum('conversions'),
    revenue,
    cpc: clicks > 0 ? spend / clicks : 0,
    ctr: sum('impressions') > 0 ? (clicks / sum('impressions')) * 100 : 0,
    roas: spend > 0 ? revenue / spend : 0,
  };
  return { scenario: scenarioId, rows, totals };
}

/** Plain-English verdict on whether the plan can be profitable. */
export function judgePlan(profile, forecasts) {
  const ue = unitEconomics(profile);
  const e = forecasts.expected.totals;
  const c = forecasts.cautious.totals;
  if (profile.goal === 'awareness') {
    return {
      level: 'info',
      title: 'Built for reach, not direct sales',
      body: 'For an awareness goal, success is people remembering you. Judge this by reach, CTR and profile visits, not ROAS. Switch the goal to Sales or Enquiries if you need orders this month.',
    };
  }
  if (e.roas >= ue.breakEvenRoas * 1.25 && c.roas >= ue.breakEvenRoas * 0.8) {
    return {
      level: 'good',
      title: 'Looks workable',
      body: `Expected ROAS is about ${e.roas.toFixed(1)}x against a break-even of ${ue.breakEvenRoas.toFixed(1)}x. Even the cautious case stays close to break-even. Start with the test phase and let real data confirm it.`,
    };
  }
  if (e.roas >= ue.breakEvenRoas * 0.9) {
    return {
      level: 'warn',
      title: 'Borderline: watch closely',
      body: `Expected ROAS (${e.roas.toFixed(1)}x) sits right at break-even (${ue.breakEvenRoas.toFixed(1)}x). A stronger offer, a bundle that lifts your average sale, or a sharper audience is what tips this into profit.`,
    };
  }
  return {
    level: 'bad',
    title: 'Unlikely to pay back at these numbers',
    body: `Expected ROAS (${e.roas.toFixed(1)}x) is below break-even (${ue.breakEvenRoas.toFixed(1)}x). Before spending, try raising your average sale (bundles, minimum order), improving margin, or aiming for enquiries and WhatsApp orders instead of website sales.`,
  };
}

/** The 30-day operating plan with concrete, currency-aware guardrails. */
export function buildPlaybook(profile, plan) {
  const region = REGIONS[profile.region];
  const ue = unitEconomics(profile);
  const dailyTest = plan.dailyTotal * 0.9;
  const killSpend = ue.breakEvenCpa * 2;
  const phases = [
    {
      days: 'Days 1–3', title: 'Test',
      body: `Run 3 creatives (the poster, the video and one text variant) at about ${fmtMoney(dailyTest, region)} a day in total. Do not touch settings; the systems need this data.`,
    },
    {
      days: 'Day 4', title: 'Cut the losers',
      body: 'Pause the weakest creative on each platform. Keep the two with the best CTR and cheapest cost per result.',
    },
    {
      days: 'Days 5–14', title: 'Tighten',
      body: 'Feed the winners. Narrow or widen the audience based on who actually clicks. Add the negative keywords on Google.',
    },
    {
      days: 'Days 15–30', title: 'Scale what pays',
      body: `Move the ${fmtMoney(plan.reserve, region)} reserve, plus anything freed from paused ads, into ads that clear break-even. Refresh the creative every 10–14 days so people do not tire of it.`,
    },
  ];
  const rules = [
    {
      kind: 'pause', title: 'Pause rule',
      body: `Pause any ad that has spent ${fmtMoney(killSpend, region)} (2× your break-even cost per ${ue.conversionNoun}) with zero results.`,
    },
    {
      kind: 'fix', title: 'Creative rule',
      body: 'After 1,000 impressions, if CTR is under 60% of the benchmark shown in the plan, replace the image or first line, not the budget.',
    },
    {
      kind: 'scale', title: 'Scale rule',
      body: `If ROAS stays above ${(ue.breakEvenRoas * 1.5).toFixed(1)}x for 3 days with at least 5 results, raise that ad's daily budget by 20%. Never more than 30% in one step.`,
    },
    {
      kind: 'cap', title: 'Ceiling rule',
      body: `Never pay more than ${fmtMoney(ue.breakEvenCpa, region)} for one ${ue.conversionNoun}. Above that you lose money on every sale.`,
    },
  ];
  return { phases, rules };
}
