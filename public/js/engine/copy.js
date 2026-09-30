// Ad copy: headlines, captions, Google search ads, hashtags and a video
// storyboard, all from the owner's own words plus neutral category phrasing.
// The engine never invents offers, prices, or guarantees; anything factual
// (offer, selling points, contact) comes from the brief.

import { CATEGORIES } from './knowledge.js';
import { makeRng } from './rng.js';

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// "Handmade soy candles" mid-sentence -> "handmade soy candles", but keep acronyms/proper nouns.
const mid = (s) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** Trim to a limit on a word boundary (no ellipsis; ad platforms dislike them). */
export function fitTo(text, max) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const at = cut.lastIndexOf(' ');
  const out = (at > max * 0.5 ? cut.slice(0, at) : t.slice(0, max)).replace(/[\s,;:–—-]+$/, '');
  return out;
}

// [template, required slots]. Slots: P product, Pc capitalised product,
// B business, C city, O offer, S1/S2 selling points.
const HEADLINES = {
  friendly: [
    ['Say hello to {P}'], ['Treat yourself to {P}'], ['Your new favourite: {P}'], ['Meet {B}: {S1}'],
    ['{Pc}, made with love in {C}', ['C']], ['{O} on {P}', ['O']],
  ],
  premium: [
    ['{Pc}, elevated'], ['The art of {P}'], ['Crafted for those who notice'], ['{B}: {S1}'],
    ['Refined {P}, from {C}', ['C']], ['{Pc}. {O}.', ['O']],
  ],
  bold: [
    ['Stop scrolling. {Pc} is here.'], ['{Pc} you will actually love'], ['Meet your new obsession: {P}'], ['Ready for {P}? Here it is'],
    ['{O} on {P}', ['O']], ["Don't miss {O}", ['O']],
  ],
  playful: [
    ['Psst… have you met {P}?'], ['Warning: {P} may cause smiles'], ['Yes, {P}. Again.'], ["{B} has {P}. You're welcome."],
    ['Hello {C}! Meet {P}', ['C']], ['{O}? Yes please.', ['O']],
  ],
  trust: [
    ['{Pc} you can count on'], ['Real people. Real {P}.'], ['Simple, honest {P}'], ['{B}: {S1}'],
    ['Proudly serving {C}', ['C']], ['{O} on {P}', ['O']],
  ],
};

const CTA_LINE = {
  sales: (cta, contact) => (contact ? `${cta}: ${contact}` : `${cta}.`),
  leads: (cta, contact) => (contact ? `${cta}: ${contact}` : `${cta} to book or ask anything.`),
  traffic: (cta, contact) => (contact ? `${cta}: ${contact}` : `${cta}.`),
  awareness: (cta, contact) => (contact ? `${cta}. Find us: ${contact}` : `${cta}.`),
};

function ctx(profile) {
  const cat = CATEGORIES[profile.category];
  const points = [...profile.sellingPoints];
  for (const b of cat.benefits) if (points.length < 4 && !points.includes(b)) points.push(b);
  return {
    cat,
    P: mid(profile.product),
    Pc: cap(profile.product),
    B: profile.businessName,
    C: profile.city,
    O: profile.offer,
    points,
    userPoints: profile.sellingPoints.length,
  };
}

function fill(tpl, c) {
  return tpl
    .replaceAll('{Pc}', c.Pc)
    .replaceAll('{P}', c.P)
    .replaceAll('{B}', c.B)
    .replaceAll('{C}', c.C)
    .replaceAll('{O}', c.O)
    .replaceAll('{S1}', c.points[0])
    .replaceAll('{S2}', c.points[1] || c.points[0]);
}

function hashtags(profile, cat) {
  const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const tags = [...cat.hashtags];
  if (profile.city) tags.push(squash(profile.city));
  tags.push(squash(profile.businessName));
  for (const w of profile.product.split(/\s+/)) {
    const t = squash(w);
    if (t.length > 3 && !tags.includes(t)) tags.push(t);
  }
  return [...new Set(tags.filter((t) => t.length > 2))].slice(0, 10).map((t) => `#${t}`);
}

export function generateCopy(profile, { seed = 1 } = {}) {
  const rng = makeRng(`${seed}|${profile.businessName}|${profile.product}`);
  const c = ctx(profile);
  const bank = HEADLINES[profile.tone] || HEADLINES.friendly;

  const usable = bank.filter(([, req = []]) => req.every((k) => c[k]));
  const headlines = rng
    .shuffle(usable)
    .map(([t]) => fill(t, c))
    .filter((h) => h.length <= 48);
  // Top up from the other tones if a missing city/offer thinned the pool.
  if (headlines.length < 5) {
    for (const [t, req = []] of rng.shuffle(Object.values(HEADLINES).flat())) {
      if (headlines.length >= 5) break;
      if (!req.every((k) => c[k])) continue;
      const h = fill(t, c);
      if (h.length <= 48 && !headlines.includes(h)) headlines.push(h);
    }
  }

  if (headlines.length === 0) headlines.push(fitTo(`${c.B}: ${c.Pc}`, 48));

  const hook = rng.pick(c.cat.hooks);
  const hookLine = /[.!?]$/.test(hook) ? hook : `${hook}.`;
  const inCity = c.C ? ` in ${c.C}` : '';
  const ctaLine = CTA_LINE[profile.goal](profile.cta, profile.contact);
  const offerLine = c.O ? ` ${cap(c.O)} right now.` : '';

  const primaryTexts = [
    {
      label: 'Story',
      text: `${hookLine}\n\n${c.B}${inCity} brings you ${c.P}. ${c.points[0]}. ${c.points[1]}.${offerLine}\n\n${ctaLine}`,
    },
    {
      label: 'Direct',
      text: `${c.O ? `${cap(c.O)}: ` : ''}${c.Pc} from ${c.B}${inCity}.\n\n${c.points
        .slice(0, 3)
        .map((p) => `• ${p}`)
        .join('\n')}\n\n${ctaLine}`,
    },
    {
      label: 'Short',
      text: `${/[.!?…]$/.test(headlines[0]) ? headlines[0] : `${headlines[0]}.`} ${c.points[0]}.${c.O ? ` ${cap(c.O)}.` : ''} ${ctaLine}`,
    },
  ];

  const google = googleAds(profile, c);
  const subheads = [...new Set([c.points[0], `${c.points[0]} · ${c.points[1] || c.points[2] || ''}`.replace(/ · $/, ''), hook])];

  return {
    headlines,
    subheads,
    primaryTexts,
    google,
    hashtags: hashtags(profile, c.cat),
    sellingPoints: c.points,
    usingOwnSellingPoints: c.userPoints > 0,
    storyboard: storyboard(profile, c, headlines, hook),
  };
}

function googleAds(profile, c) {
  const verb = profile.goal === 'leads' ? 'Book' : profile.goal === 'awareness' ? 'Discover' : 'Shop';
  const candidates = [
    c.Pc,
    c.B,
    c.O && cap(c.O),
    c.C && `${c.Pc} in ${c.C}`,
    profile.goal === 'leads' ? `${verb} ${c.Pc} Today` : `${verb} ${c.Pc} Online`,
    c.points[0],
    c.C && `${c.B} in ${c.C}`,
    profile.cta,
    c.points[1],
  ].filter(Boolean);
  const seen = new Set();
  const headlines = [];
  for (const cand of candidates) {
    const h = cand.length <= 30 ? cand : null;
    if (h && !seen.has(h.toLowerCase())) {
      seen.add(h.toLowerCase());
      headlines.push(h);
    }
  }
  // Very long product/business names: guarantee at least three headlines.
  for (const fb of [fitTo(c.Pc, 30), fitTo(c.B, 30), fitTo(`${profile.cta} Today`, 30)]) {
    if (headlines.length >= 3) break;
    if (fb && !seen.has(fb.toLowerCase())) {
      seen.add(fb.toLowerCase());
      headlines.push(fb);
    }
  }
  const descs = [
    `${c.B}${c.C ? ` in ${c.C}` : ''}. ${c.points[0]}. ${profile.cta}.`,
    `${c.Pc}: ${c.points[0]}. ${c.points[1]}.`,
    `${c.O ? `${cap(c.O)}. ` : ''}${profile.cta}${profile.contact ? `: ${profile.contact}` : ''}.`,
  ].map((d) => fitTo(d, 90));
  return {
    headlines: headlines.slice(0, 8),
    descriptions: [...new Set(descs)].slice(0, 3),
    limits: { headline: 30, description: 90 },
  };
}

/**
 * Storyboard scenes. Timing is a relative weight; the video renderer turns
 * weights into seconds for whatever duration the user picks.
 */
function storyboard(profile, c, headlines, hook) {
  const scenes = [
    { kind: 'hook', weight: 0.2, title: headlines[0], sub: '' },
    { kind: 'value', weight: 0.22, title: cap(c.P), sub: c.points[0] },
    { kind: 'benefits', weight: 0.22, title: 'Why you will love it', sub: '', chips: c.points.slice(1, 4) },
  ];
  if (c.O) scenes.push({ kind: 'offer', weight: 0.16, title: c.O, sub: `at ${c.B}` });
  scenes.push({
    kind: 'cta',
    weight: 0.2,
    title: profile.cta,
    sub: [profile.contact, c.C].filter(Boolean).join(' · ') || c.B,
  });
  const total = scenes.reduce((s, x) => s + x.weight, 0);
  scenes.forEach((s) => (s.weight = s.weight / total));
  return scenes;
}

const ACTION = /\b(shop|buy|order|book|get|try|join|visit|call|message|discover|meet|start|find|treat|grab|say hello)\b/i;
const URGENCY = /\b(now|today|new|limited|last|only|don'?t miss|ready|here)\b/i;
const BENEFIT = /\b(love|care|easy|simple|fresh|honest|real|made|crafted|trusted|glow|style|fit|proud)\b/i;

/**
 * A transparent checklist score for a line of ad copy. It is a rule-based
 * craft check, not a performance prediction, and the UI labels it that way.
 */
export function scoreCopy(text, profile, kind = 'headline') {
  const tips = [];
  let score = 40;
  const len = text.length;
  const [lo, hi, ok] = kind === 'headline' ? [16, 40, 56] : [60, 220, 400];
  if (len >= lo && len <= hi) score += 18;
  else if (len <= ok) score += 8;
  else tips.push(`Shorten it: ${len} characters is long for a scroll-past ad.`);

  if (/\d/.test(text) || (profile.offer && text.toLowerCase().includes(profile.offer.toLowerCase()))) score += 10;
  else tips.push('Add a number or your offer so it feels concrete.');

  if (profile.city && text.toLowerCase().includes(profile.city.toLowerCase())) score += 8;
  else if (profile.scope !== 'online') tips.push(`Mention ${profile.city || 'your area'} so locals feel it is for them.`);

  if (ACTION.test(text)) score += 8;
  else tips.push('Use an action word (shop, book, try, meet).');
  if (URGENCY.test(text)) score += 6;
  if (BENEFIT.test(text)) score += 6;

  if ((text.match(/\b[A-Z]{3,}\b/g) || []).length > 1) {
    score -= 8;
    tips.push('Too much ALL CAPS reads as shouting.');
  }
  if (/[!?]{2,}/.test(text)) {
    score -= 6;
    tips.push('Drop the repeated punctuation.');
  }
  return { score: Math.max(30, Math.min(98, Math.round(score))), tips: tips.slice(0, 2) };
}
