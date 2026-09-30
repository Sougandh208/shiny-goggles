// Business brief: the single input every part of the engine works from.
// Shared by the browser and the server (the server re-validates before it
// sends anything to an LLM), so it must stay DOM-free.

export const GOALS = {
  sales: { label: 'Get sales', hint: 'Buyers ordering or paying online' },
  leads: { label: 'Get enquiries / visits', hint: 'WhatsApp, calls, DMs, store visits' },
  traffic: { label: 'Get website visitors', hint: 'Clicks to your page or shop' },
  awareness: { label: 'Get known locally', hint: 'Reach and brand recall' },
};

export const TONES = {
  friendly: 'Friendly & warm',
  premium: 'Premium & elegant',
  bold: 'Bold & urgent',
  playful: 'Playful & fun',
  trust: 'Trustworthy & calm',
};

export const SCOPES = {
  local: 'Local: customers come from my area',
  regional: 'Regional: my city and nearby towns',
  online: 'Online: I ship or serve anywhere',
};

export const DEFAULT_CTA = {
  sales: 'Shop now',
  leads: 'Message us',
  traffic: 'Learn more',
  awareness: 'Discover us',
};

const HEX = /^#[0-9a-fA-F]{6}$/;

const clean = (v, max) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * @param {object} raw untrusted input (form values / request body)
 * @param {{categories: string[], regions: string[]}} lists valid ids
 * @returns {{ok: boolean, profile: object, errors: Record<string,string>}}
 */
export function normalizeProfile(raw, lists) {
  const errors = {};
  const r = raw || {};

  const businessName = clean(r.businessName, 60);
  if (!businessName) errors.businessName = 'Tell us your business name.';

  const product = clean(r.product, 80);
  if (!product) errors.product = 'Describe what you sell in a few words.';

  const category = lists.categories.includes(r.category) ? r.category : null;
  if (!category) errors.category = 'Pick the closest business type.';

  const region = lists.regions.includes(r.region) ? r.region : null;
  if (!region) errors.region = 'Pick where you advertise.';

  const goal = Object.hasOwn(GOALS, r.goal) ? r.goal : 'sales';
  const tone = Object.hasOwn(TONES, r.tone) ? r.tone : 'friendly';
  const scope = Object.hasOwn(SCOPES, r.scope) ? r.scope : 'local';

  const monthlyBudget = num(r.monthlyBudget);
  if (!(monthlyBudget > 0)) errors.monthlyBudget = 'Enter a monthly ad budget above zero.';
  else if (monthlyBudget > 10_000_000) errors.monthlyBudget = 'That looks too large. Check the number.';

  let aov = num(r.aov);
  if (!(aov > 0)) {
    errors.aov = 'Enter your average sale value (what one customer spends).';
    aov = NaN;
  }

  let margin = num(r.margin);
  if (!Number.isFinite(margin)) margin = 40;
  margin = Math.min(95, Math.max(5, margin));

  const city = clean(r.city, 40);
  if (scope !== 'online' && !city) errors.city = 'Add your city or area so we can target locally.';

  const offer = clean(r.offer, 40);
  // Real selling points the owner can stand behind: "free delivery over 500",
  // "1-year warranty". The engine never invents claims like these itself.
  const sellingPoints = (Array.isArray(r.sellingPoints) ? r.sellingPoints : String(r.sellingPoints ?? '').split(/[,\n;]/))
    .map((s) => clean(s, 40).replace(/[.!?\s]+$/, ''))
    .filter(Boolean)
    .slice(0, 3);
  const targetNote = clean(r.targetNote, 120);
  const contact = clean(r.contact, 40);
  const cta = clean(r.cta, 24) || DEFAULT_CTA[goal];
  const brandColor = HEX.test(r.brandColor || '') ? r.brandColor.toLowerCase() : '#22e4ff';

  const profile = {
    businessName, product, category, region, goal, tone, scope,
    monthlyBudget: Number.isFinite(monthlyBudget) ? monthlyBudget : 0,
    aov: Number.isFinite(aov) ? aov : 0,
    margin,
    city, offer, sellingPoints, targetNote, contact, cta, brandColor,
  };
  return { ok: Object.keys(errors).length === 0, profile, errors };
}
