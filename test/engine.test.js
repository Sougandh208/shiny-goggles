import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_IDS, REGION_IDS, GOALS, TONES, PLATFORMS,
  runEngine, validateProfile, fitTo, planBudget, forecastPlatform, unitEconomics,
  computeMetrics, diagnose, summarizePortfolio, generateCopy, scoreCopy, buildAudience,
} from '../public/js/engine/index.js';
import { parseTargetNote } from '../public/js/engine/audience.js';

const base = {
  businessName: 'Lotus Boutique',
  product: 'Handmade cotton kurtis',
  category: 'fashion',
  region: 'IN',
  goal: 'sales',
  tone: 'friendly',
  scope: 'local',
  city: 'Pune',
  monthlyBudget: 15000,
  aov: 1200,
  margin: 45,
  offer: '20% off',
  sellingPoints: 'Free delivery over 999, Easy exchange',
  contact: '@lotusboutique',
  brandColor: '#ff3d9a',
};
const norm = (over = {}) => {
  const r = validateProfile({ ...base, ...over });
  assert.ok(r.ok, JSON.stringify(r.errors));
  return r.profile;
};

test('profile: valid input passes and is normalised', () => {
  const p = norm();
  assert.equal(p.margin, 45);
  assert.deepEqual(p.sellingPoints, ['Free delivery over 999', 'Easy exchange']);
  assert.equal(p.brandColor, '#ff3d9a');
});

test('profile: missing / bad fields are reported, not thrown', () => {
  const r = validateProfile({ ...base, businessName: '  ', monthlyBudget: -5, aov: 'abc', category: 'nope', region: '??' });
  assert.equal(r.ok, false);
  for (const k of ['businessName', 'monthlyBudget', 'aov', 'category', 'region']) assert.ok(r.errors[k], k);
});

test('profile: city is only required when not selling online', () => {
  assert.ok(validateProfile({ ...base, city: '', scope: 'local' }).errors.city);
  assert.ok(validateProfile({ ...base, city: '', scope: 'online' }).ok);
});

test('profile: sanitises control chars, clamps margin, rejects bad colours', () => {
  const p = norm({ businessName: 'A\u0000B\n\tC', margin: 500, brandColor: 'javascript:1', product: 'x'.repeat(500) });
  assert.equal(p.businessName, 'A B C');
  assert.equal(p.margin, 95);
  assert.equal(p.brandColor, '#22e4ff');
  assert.equal(p.product.length, 80);
});

test('budget: plan adds back to the monthly budget exactly (spend + reserve)', () => {
  for (const monthly of [500, 3000, 15000, 80000, 123457]) {
    const plan = planBudget(norm({ monthlyBudget: monthly }));
    const deployed = plan.rows.reduce((s, r) => s + r.monthly, 0);
    assert.ok(Math.abs(deployed + plan.reserve - monthly) < 1e-6, `${monthly}: ${deployed}+${plan.reserve}`);
    const shares = plan.rows.reduce((s, r) => s + r.share, 0);
    assert.ok(Math.abs(shares - 1) < 1e-9);
  }
});

test('budget: tiny budgets concentrate on one platform and explain why', () => {
  const plan = planBudget(norm({ monthlyBudget: 1200 })); // ~₹40/day
  assert.equal(plan.rows.length, 1);
  assert.ok(plan.notes.length > 0);
});

test('budget: every chosen platform can afford the learning minimum', () => {
  for (const region of REGION_IDS) {
    for (const monthly of [2000, 9000, 40000]) {
      const p = norm({ region, monthlyBudget: monthly });
      const plan = planBudget(p);
      if (plan.rows.length > 1) {
        for (const r of plan.rows) assert.ok(r.daily >= plan.region.minDaily - 1, `${region} ${monthly} ${r.id} ${r.daily}`);
      }
    }
  }
});

test('forecast: scenarios are ordered and zero spend is safe', () => {
  const p = norm();
  const f = runEngine(base).forecasts;
  assert.ok(f.cautious.totals.revenue < f.expected.totals.revenue);
  assert.ok(f.expected.totals.revenue < f.optimistic.totals.revenue);
  const z = forecastPlatform('instagram', 0, p);
  assert.equal(z.clicks, 0);
  assert.equal(z.roas, 0);
});

test('economics: break-even ROAS is 1 / margin; leads are discounted by close rate', () => {
  const sales = unitEconomics(norm({ margin: 40 }));
  assert.ok(Math.abs(sales.breakEvenRoas - 2.5) < 1e-9);
  assert.ok(Math.abs(sales.breakEvenCpa - 480) < 1e-9);
  const leads = unitEconomics(norm({ margin: 40, goal: 'leads' }));
  assert.ok(leads.breakEvenCpa < sales.breakEvenCpa);
});

test('india costs come out far below US costs for the same plan', () => {
  const inr = runEngine({ ...base, region: 'IN', monthlyBudget: 15000 }).plan.rows[0].benchmarks.cpc; // rupees
  const usd = runEngine({ ...base, region: 'US', monthlyBudget: 500 }).plan.rows[0].benchmarks.cpc; // dollars
  assert.ok(inr / 83 < usd);
});

test('audience: free-text target overrides defaults', () => {
  assert.deepEqual(parseTargetNote('college students').age, [18, 24]);
  assert.deepEqual(parseTargetNote('women 25-40 who love sarees').age, [25, 40]);
  assert.equal(parseTargetNote('women 25-40').gender, 'women');
  assert.deepEqual(parseTargetNote('moms nearby'), { age: [26, 45], gender: 'women' });
  assert.deepEqual(parseTargetNote(''), {});
  const a = buildAudience(norm({ targetNote: 'men 30 to 45' }));
  assert.deepEqual(a.primary.age, [30, 45]);
  assert.equal(a.primary.gender, 'men');
});

test('audience: local scope gives a radius, online gives none', () => {
  assert.ok(buildAudience(norm({ scope: 'local' })).location.radiusKm > 0);
  assert.equal(buildAudience(norm({ scope: 'online' })).location.radiusKm, null);
});

test('copy: Google ad limits are always respected', () => {
  for (const cat of CATEGORY_IDS) {
    const p = norm({ category: cat, product: 'Extra long product name for a very specific small business', businessName: 'The Extraordinarily Long Business Name Co' });
    const g = generateCopy(p).google;
    assert.ok(g.headlines.length >= 3, cat);
    for (const h of g.headlines) assert.ok(h.length <= 30, `${cat} headline "${h}"`);
    for (const d of g.descriptions) assert.ok(d.length <= 90, `${cat} desc "${d}"`);
  }
});

test('copy: never invents an offer or claim the owner did not provide', () => {
  const p = norm({ offer: '', sellingPoints: '' });
  for (const cat of CATEGORY_IDS) {
    const c = generateCopy({ ...p, category: cat });
    const all = [...c.headlines, ...c.primaryTexts.map((t) => t.text), ...c.sellingPoints].join(' ');
    assert.ok(!/\d/.test(all.replace(/@\w+/g, '')), `${cat}: digits in "${all}"`);
    assert.ok(!/\b(free|guarantee|warranty|refund|returns?|% off|discount|best in)\b/i.test(all), `${cat}: claim in "${all}"`);
    assert.equal(c.usingOwnSellingPoints, false);
  }
});

test('copy: the owner\'s own offer and selling points are used', () => {
  const c = generateCopy(norm());
  const all = c.primaryTexts.map((t) => t.text).join('\n');
  assert.match(all, /20% off/i);
  assert.match(all, /Free delivery over 999/);
  assert.equal(c.usingOwnSellingPoints, true);
  assert.ok(c.storyboard.some((s) => s.kind === 'offer'));
});

test('copy: no doubled punctuation, deterministic per seed, varies across seeds', () => {
  const p = norm();
  const a = generateCopy(p, { seed: 7 });
  const b = generateCopy(p, { seed: 7 });
  assert.deepEqual(a, b);
  for (let s = 0; s < 30; s++) {
    const c = generateCopy(p, { seed: s });
    for (const t of c.primaryTexts) assert.ok(!/\.\.(?!\.)/.test(t.text), `seed ${s}: ${t.text}`);
  }
  const seen = new Set();
  for (let s = 0; s < 20; s++) seen.add(generateCopy(p, { seed: s }).headlines[0]);
  assert.ok(seen.size > 2);
});

test('copy: storyboard weights sum to 1', () => {
  for (const offer of ['', '10% off']) {
    const sb = generateCopy(norm({ offer })).storyboard;
    assert.ok(Math.abs(sb.reduce((s, x) => s + x.weight, 0) - 1) < 1e-9);
    assert.equal(sb.at(-1).kind, 'cta');
  }
});

test('copy score: rewards concrete local action copy over vague shouting', () => {
  const p = norm();
  const good = scoreCopy('Shop 20% off kurtis in Pune', p).score;
  const bad = scoreCopy('BEST PRODUCTS EVER!!! AMAZING QUALITY', p).score;
  assert.ok(good > bad);
  assert.ok(scoreCopy('x', p).tips.length > 0);
});

test('fitTo trims on word boundaries', () => {
  assert.equal(fitTo('short', 30), 'short');
  const t = fitTo('Handmade cotton kurtis for every occasion', 30);
  assert.ok(t.length <= 30);
  assert.ok(!t.endsWith(' '));
  assert.equal(t, 'Handmade cotton kurtis for');
});

test('every category x tone x goal x region combination runs cleanly', () => {
  let n = 0;
  for (const category of CATEGORY_IDS)
    for (const tone of Object.keys(TONES))
      for (const goal of Object.keys(GOALS))
        for (const region of REGION_IDS) {
          const scope = n % 3 === 0 ? 'online' : n % 3 === 1 ? 'regional' : 'local';
          const r = runEngine({ ...base, category, tone, goal, region, scope, offer: n % 2 ? '' : 'Buy 1 Get 1', monthlyBudget: [300, 4000, 25000][n % 3] }, { seed: n });
          assert.ok(r.ok, JSON.stringify(r.errors));
          assert.ok(r.plan.rows.length >= 1);
          assert.ok(r.copy.headlines.length >= 3, `${category}/${tone}: ${r.copy.headlines}`);
          for (const row of r.forecasts.expected.rows) {
            for (const k of ['clicks', 'impressions', 'conversions', 'revenue', 'roas']) {
              assert.ok(Number.isFinite(row[k]), `${category}/${goal}/${region} ${k}`);
            }
          }
          assert.ok(['good', 'warn', 'bad', 'info'].includes(r.verdict.level));
          n++;
        }
  assert.ok(n > 1000);
});

// ---- Coach ---------------------------------------------------------------

const camp = (over) => ({ platform: 'instagram', name: 'Reel A', spend: 3000, impressions: 60000, clicks: 700, conversions: 12, revenue: 14400, ...over });

test('metrics: computes the six numbers and returns null instead of dividing by zero', () => {
  const m = computeMetrics({ spend: 100, impressions: 10000, clicks: 200, conversions: 10, revenue: 500 });
  assert.equal(m.ctr, 2);
  assert.equal(m.cpc, 0.5);
  assert.equal(m.cpm, 10);
  assert.equal(m.cvr, 5);
  assert.equal(m.cpa, 10);
  assert.equal(m.roas, 5);
  const z = computeMetrics({});
  for (const k of ['ctr', 'cpc', 'cpm', 'cvr', 'cpa', 'roas']) assert.equal(z[k], null, k);
});

test('coach: tiny sample -> wait, not a verdict', () => {
  const d = diagnose(camp({ spend: 20, impressions: 200, clicks: 3, conversions: 0, revenue: 0 }), norm());
  assert.equal(d.verdict, 'wait');
});

test('coach: strongly profitable -> scale', () => {
  const d = diagnose(camp({ spend: 3000, revenue: 12000 }), norm({ margin: 40 })); // 4x vs 2.5x break-even
  assert.equal(d.verdict, 'scale');
});

test('coach: profitable but modest -> keep', () => {
  const d = diagnose(camp({ spend: 3000, revenue: 7800 }), norm({ margin: 40 })); // 2.6x vs 2.5x
  assert.equal(d.verdict, 'keep');
});

test('coach: spent 2x break-even CPA with zero results -> pause', () => {
  const p = norm({ margin: 40 }); // break-even CPA = 480
  const d = diagnose(camp({ spend: 1200, impressions: 40000, clicks: 400, conversions: 0, revenue: 0 }), p);
  assert.equal(d.verdict, 'pause');
  assert.match(d.actions[0], /Pause now/);
});

test('coach: low CTR points at the creative; low CVR points at the page/offer', () => {
  const p = norm({ margin: 40 });
  const creative = diagnose(camp({ spend: 2000, impressions: 200000, clicks: 400, conversions: 2, revenue: 2400 }), p);
  assert.ok(['fix', 'pause'].includes(creative.verdict));
  assert.match(creative.actions.join(' '), /image|first line/i);
  const page = diagnose(camp({ spend: 2000, impressions: 30000, clicks: 300, conversions: 1, revenue: 1200 }), p);
  assert.match(page.actions.join(' '), /landing|WhatsApp|price/i);
});

test('coach: awareness goal is judged on reach, never on ROAS', () => {
  const d = diagnose(camp({ revenue: 0, conversions: 0 }), norm({ goal: 'awareness' }));
  assert.ok(['keep', 'fix'].includes(d.verdict));
});

test('coach: portfolio tells the owner where to move money', () => {
  const p = norm({ margin: 40 });
  const s = summarizePortfolio(
    [camp({ name: 'Winner', spend: 3000, revenue: 12000 }), camp({ name: 'Loser', platform: 'facebook', spend: 1500, impressions: 30000, clicks: 300, conversions: 0, revenue: 0 })],
    p,
  );
  assert.equal(s.rows[0].verdict, 'scale');
  assert.equal(s.rows[1].verdict, 'pause');
  assert.match(s.lines.join(' '), /Loser/);
  assert.match(s.lines.join(' '), /Winner/);
  assert.equal(s.totals.spend, 4500);
});

test('platform table is complete', () => {
  for (const id of Object.keys(PLATFORMS)) for (const k of ['cpc', 'ctr', 'cvr', 'name', 'formats', 'role']) assert.ok(PLATFORMS[id][k], `${id}.${k}`);
});

// ---- Kit export ----------------------------------------------------------------

test('report: the plan export shows shares of the whole budget that add to 100% and carries the disclaimer', async () => {
  const { planToMarkdown, adCopyToText } = await import('../public/js/engine/report.js');
  const r = runEngine(base, { seed: 2 });
  const md = planToMarkdown(r, { aiCopy: { headlines: ['Claude line'], primaryTexts: ['Claude caption'] } });
  assert.match(md, /# Lotus Boutique: ad campaign plan/);
  assert.match(md, /not promises/);
  assert.match(md, /Break-even ROAS/);
  assert.match(md, /Headlines \(Claude\)/);
  const shares = [...md.matchAll(/\|\s*(\d+)%\s*\|/g)].map((m) => Number(m[1]));
  const budgetShares = shares.slice(0, r.plan.rows.length + 1);
  assert.ok(Math.abs(budgetShares.reduce((a, b) => a + b, 0) - 100) <= 2, `shares ${budgetShares}`);
  assert.match(adCopyToText(r.copy), /Descriptions \(90 characters max\)/);
});
