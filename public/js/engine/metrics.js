// The "Coach": computes the numbers ad dashboards throw at owners (CTR, CPC,
// CPM, CVR, CPA, ROAS) and explains what they mean for THIS business, measured
// against the owner's own break-even point rather than generic thresholds.

import { PLATFORMS, REGIONS, fmtMoney } from './knowledge.js';
import { getBenchmarks, unitEconomics } from './budget.js';

const div = (a, b) => (b > 0 ? a / b : null);

export function computeMetrics(c) {
  const spend = Math.max(0, +c.spend || 0);
  const impressions = Math.max(0, +c.impressions || 0);
  const clicks = Math.max(0, +c.clicks || 0);
  const conversions = Math.max(0, +c.conversions || 0);
  const revenue = Math.max(0, +c.revenue || 0);
  return {
    spend, impressions, clicks, conversions, revenue,
    ctr: div(clicks, impressions) == null ? null : (clicks / impressions) * 100,
    cpc: div(spend, clicks),
    cpm: div(spend, impressions) == null ? null : (spend / impressions) * 1000,
    cvr: div(conversions, clicks) == null ? null : (conversions / clicks) * 100,
    cpa: div(spend, conversions),
    roas: div(revenue, spend),
  };
}

export const VERDICTS = {
  scale: { label: 'Scale', tone: 'good' },
  keep: { label: 'Keep running', tone: 'good' },
  fix: { label: 'Fix', tone: 'warn' },
  pause: { label: 'Pause', tone: 'bad' },
  wait: { label: 'Too early', tone: 'info' },
};

/**
 * Diagnose one campaign.
 * @param {{platform:string,name?:string,spend:number,impressions:number,clicks:number,conversions:number,revenue:number}} camp
 */
export function diagnose(camp, profile) {
  const region = REGIONS[profile.region];
  const m = computeMetrics(camp);
  const bench = getBenchmarks(camp.platform, profile);
  const ue = unitEconomics(profile);
  const noun = ue.conversionNoun;
  const money = (v) => fmtMoney(v, region);
  const reasons = [];
  const actions = [];

  const enoughData = m.impressions >= 1000 || m.clicks >= 30;
  const awarenessGoal = profile.goal === 'awareness';

  if (!enoughData && m.spend < ue.breakEvenCpa) {
    return {
      verdict: 'wait', metrics: m, bench,
      headline: 'Too early to judge',
      reasons: [`Only ${m.impressions.toLocaleString('en')} impressions and ${m.clicks} clicks so far. Numbers this small swing wildly.`],
      actions: ['Let it run until it has at least 1,000 impressions or 30 clicks before changing anything.'],
    };
  }

  // Diagnose the funnel stage by stage: it tells the owner what to actually fix.
  const ctrLow = m.ctr != null && m.ctr < bench.ctr * 0.6;
  const ctrGood = m.ctr != null && m.ctr >= bench.ctr * 0.9;
  const cpcHigh = m.cpc != null && m.cpc > bench.cpc * 1.5;
  const cvrLow = m.clicks >= 30 && m.cvr != null && m.cvr < bench.cvr * 0.5;

  if (m.ctr != null) {
    reasons.push(
      `CTR ${m.ctr.toFixed(2)}% vs about ${bench.ctr.toFixed(2)}% typical for you: ` +
        (ctrLow ? 'people are scrolling past. The image or first line is not landing.' : ctrGood ? 'people do care about the ad.' : 'a bit under par, worth testing a new hook.'),
    );
  }
  if (m.cpc != null) {
    reasons.push(
      `CPC ${money(m.cpc)} vs about ${money(bench.cpc)} typical: ` +
        (cpcHigh ? 'you are paying a premium per click, often a too-narrow audience or a crowded slot.' : 'click cost is in a healthy range.'),
    );
  }
  if (m.cvr != null && m.clicks >= 30) {
    reasons.push(
      `${(m.cvr).toFixed(1)}% of clicks became ${noun === 'purchase' ? 'purchases' : 'enquiries'} vs about ${bench.cvr.toFixed(1)}% typical: ` +
        (cvrLow ? 'clicks arrive but do not convert. Look at the offer, price, page speed, and how fast you reply.' : 'the click-to-result step is fine.'),
    );
  }

  if (awarenessGoal) {
    const good = ctrGood && !cpcHigh;
    return {
      verdict: good ? 'keep' : 'fix', metrics: m, bench,
      headline: good ? 'Reach is healthy' : 'Reach could be cheaper or sharper',
      reasons,
      actions: good
        ? ['Keep it running and look for profile visits and follows, the real signal for awareness.']
        : ['Try a new hook in the first 2 seconds of the video and a tighter local audience.'],
    };
  }

  const roas = m.roas ?? 0;
  const profitable = roas >= ue.breakEvenRoas;
  const strong = roas >= ue.breakEvenRoas * 1.5 && m.conversions >= 3;
  const noResults = m.conversions === 0 && m.spend >= ue.breakEvenCpa * 2;
  const deepLoss = roas < ue.breakEvenRoas * 0.5 && m.spend >= ue.breakEvenCpa * 3;

  if (m.roas != null) {
    reasons.unshift(
      `ROAS ${roas.toFixed(2)}x vs your break-even ${ue.breakEvenRoas.toFixed(2)}x` +
        (profitable ? ': every ' + money(1) + ' you spend returns ' + money(roas) + '.' : `: you lose money below ${ue.breakEvenRoas.toFixed(2)}x.`),
    );
  }

  if (strong) {
    actions.push('Raise the daily budget by 20%, then again every 3 days while ROAS holds. Never more than 30% at once.');
    actions.push('Copy this ad into a new audience (a "lookalike") instead of only spending more on the same one.');
    return { verdict: 'scale', metrics: m, bench, headline: 'This one is earning: feed it', reasons, actions };
  }
  if (profitable) {
    actions.push('Leave settings alone for now and check again in 3 days.');
    if (ctrLow || cpcHigh) actions.push('It pays, but tightening the creative could make it pay more.');
    return { verdict: 'keep', metrics: m, bench, headline: 'Profitable: keep it running', reasons, actions };
  }

  // Unprofitable: choose the most likely root cause first.
  if (ctrLow) actions.push('Swap the image or the first line. Test the poster and video side by side, one change at a time.');
  if (cpcHigh) actions.push('Broaden the audience a little, remove narrow interests, and try Reels/Stories placements.');
  if (cvrLow) actions.push('Check the landing page or WhatsApp flow: price visible, one clear button, reply within minutes.');
  if (!ctrLow && !cpcHigh && !cvrLow) {
    actions.push(`Clicks and conversions look normal, so the economics are the problem. Raise your average sale (bundles, minimum order) above ${money(profile.aov)}.`);
  }

  if (noResults || deepLoss) {
    actions.unshift(
      noResults
        ? `Pause now. It has spent ${money(m.spend)} (over 2× your break-even cost per ${noun}) with no results.`
        : 'Pause now. It is losing more than half of what it spends and has enough data to trust that.',
    );
    return { verdict: 'pause', metrics: m, bench, headline: 'Stop the leak', reasons, actions };
  }
  return { verdict: 'fix', metrics: m, bench, headline: 'Not paying back yet: fix the weak step', reasons, actions };
}

/** Roll up several campaigns and say where the money should move. */
export function summarizePortfolio(campaigns, profile) {
  const region = REGIONS[profile.region];
  const rows = campaigns.map((c) => ({ camp: c, ...diagnose(c, profile) }));
  const spend = rows.reduce((s, r) => s + r.metrics.spend, 0);
  const revenue = rows.reduce((s, r) => s + r.metrics.revenue, 0);
  const paused = rows.filter((r) => r.verdict === 'pause');
  const scaled = rows.filter((r) => r.verdict === 'scale');
  const atRisk = paused.reduce((s, r) => s + r.metrics.spend, 0);
  const lines = [];
  if (paused.length) {
    lines.push(
      `Pause ${paused.map((r) => r.camp.name || PLATFORMS[r.camp.platform].name).join(', ')} and stop the drip. ` +
        `They have spent ${fmtMoney(atRisk, region)} without paying back.`,
    );
  }
  if (scaled.length) {
    lines.push(`Move the freed budget into ${scaled.map((r) => r.camp.name || PLATFORMS[r.camp.platform].name).join(', ')}.`);
  }
  if (!paused.length && !scaled.length && rows.length) {
    lines.push('No emergencies. Keep the test running and review again in 3 days.');
  }
  return {
    rows,
    totals: { spend, revenue, roas: div(revenue, spend) },
    lines,
  };
}
