// One call runs the whole local engine: brief -> audience -> budget split ->
// forecasts -> playbook -> copy. Pure and synchronous, so it also runs in Node
// for tests and on the server for validation.

import { CATEGORY_IDS, REGION_IDS } from './knowledge.js';
import { normalizeProfile } from './profile.js';
import { buildAudience } from './audience.js';
import { buildPlaybook, forecastPlan, judgePlan, planBudget, unitEconomics } from './budget.js';
import { generateCopy } from './copy.js';

export * from './knowledge.js';
export { normalizeProfile, GOALS, TONES, SCOPES, DEFAULT_CTA } from './profile.js';
export { buildAudience } from './audience.js';
export { getBenchmarks, unitEconomics, planBudget, forecastPlan, forecastPlatform, judgePlan, buildPlaybook } from './budget.js';
export { generateCopy, scoreCopy, fitTo } from './copy.js';
export { computeMetrics, diagnose, summarizePortfolio, VERDICTS } from './metrics.js';
export { makeRng } from './rng.js';

export function validateProfile(raw) {
  return normalizeProfile(raw, { categories: CATEGORY_IDS, regions: REGION_IDS });
}

export function runEngine(raw, { seed = 1 } = {}) {
  const checked = validateProfile(raw);
  if (!checked.ok) return { ok: false, errors: checked.errors, profile: checked.profile };
  const { profile } = checked;
  const audience = buildAudience(profile);
  const plan = planBudget(profile);
  const forecasts = {
    cautious: forecastPlan(plan, profile, 'cautious'),
    expected: forecastPlan(plan, profile, 'expected'),
    optimistic: forecastPlan(plan, profile, 'optimistic'),
  };
  return {
    ok: true,
    profile,
    audience,
    plan,
    forecasts,
    verdict: judgePlan(profile, forecasts),
    economics: unitEconomics(profile),
    playbook: buildPlaybook(profile, plan),
    copy: generateCopy(profile, { seed }),
  };
}
