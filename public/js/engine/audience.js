// Audience intelligence: turns a business brief into concrete targeting.
// Category defaults come from knowledge.js; the owner's own words in the
// "who do you sell to" box override them when we can understand them.

import { CATEGORIES } from './knowledge.js';

const GENDER_LABEL = { women: 'Women', men: 'Men', all: 'All genders' };

// Free-text hints -> structured overrides. Order matters: first hit wins per field.
const AGE_HINTS = [
  [/\b(teen|teens|school kids?)\b/i, [16, 19]],
  [/\b(college|university|students?|gen ?z)\b/i, [18, 24]],
  [/\b(young professionals?|millennials?|first job)\b/i, [24, 35]],
  [/\b(moms?|mothers?|mums?|parents?|families|family)\b/i, [26, 45]],
  [/\b(newlyweds?|brides?|weddings?)\b/i, [23, 34]],
  [/\b(seniors?|elderly|retired|retirees)\b/i, [55, 70]],
];
const GENDER_HINTS = [
  [/\b(women|woman|ladies|girls?|moms?|mothers?|mums?|brides?)\b/i, 'women'],
  [/\b(men|man|guys|boys?|dads?|fathers?|grooms?)\b/i, 'men'],
];

function parseRange(text) {
  const m = text.match(/\b(1[3-9]|[2-7]\d)\s*(?:-|–|to)\s*(1[3-9]|[2-7]\d)\b/);
  if (!m) return null;
  const a = +m[1];
  const b = +m[2];
  return a < b ? [a, b] : [b, a];
}

export function parseTargetNote(note) {
  const out = {};
  if (!note) return out;
  out.age = parseRange(note);
  if (!out.age) for (const [re, r] of AGE_HINTS) if (re.test(note)) { out.age = r; break; }
  for (const [re, g] of GENDER_HINTS) if (re.test(note)) { out.gender = g; break; }
  return out;
}

function ageLabel([a, b]) {
  return `${a}–${b}`;
}

function personaLabel(p) {
  return `${GENDER_LABEL[p.gender] || 'All genders'}, ${ageLabel(p.age)}`;
}

function locationPlan(profile, cat) {
  const city = profile.city;
  if (profile.scope === 'online' || cat.radiusKm === 0) {
    return {
      summary: 'Country-wide, then narrow by what actually converts',
      radiusKm: null,
      method: 'Start with your top 3 to 5 cities where delivery is fastest; expand outward from wherever orders come in.',
    };
  }
  if (profile.scope === 'regional') {
    const r = Math.max(cat.radiusKm, 25);
    return {
      summary: `${city || 'Your city'} + ${r} km around it`,
      radiusKm: r,
      method: 'Pin your shop or pickup point on the map and target people who live or recently were within this radius.',
    };
  }
  const r = cat.radiusKm;
  return {
    summary: `${r} km around ${city || 'your shop'}`,
    radiusKm: r,
    method: `Drop a pin on your address, target "people living in this location", and start small at ${r} km. Widen only if you run out of reach.`,
  };
}

export function buildAudience(profile) {
  const cat = CATEGORIES[profile.category];
  const base = cat.audience;
  const hint = parseTargetNote(profile.targetNote);

  const primary = {
    name: 'Core customer',
    age: hint.age || base.age,
    gender: hint.gender || base.gender,
    interests: base.interests.slice(0, 5),
    behaviors: base.behaviors,
    reasoning: [],
  };
  primary.label = personaLabel(primary);

  if (hint.age || hint.gender) {
    primary.reasoning.push(`Using your description ("${profile.targetNote}") to set the age and gender.`);
  }
  primary.reasoning.push(
    `${cat.label} buyers cluster around ${ageLabel(base.age)} and respond to ${base.interests.slice(0, 2).join(' and ').toLowerCase()} content.`,
  );
  if (profile.goal === 'leads') primary.reasoning.push('For enquiries we favour people who already message and call local businesses.');
  if (profile.goal === 'sales') primary.reasoning.push('For sales we favour recent online shoppers over general browsers.');

  const secondary = cat.personas.map((p) => ({
    name: p.name,
    age: p.age,
    gender: p.gender,
    label: personaLabel(p),
    why: p.why,
  }));

  const kw = (t) =>
    t.replaceAll('{p}', profile.product.toLowerCase()).replaceAll('{c}', (profile.city || '').toLowerCase()).replace(/\s+/g, ' ').trim();
  const keywords = [...new Set(cat.keywords.filter((k) => profile.city || !k.includes('{c}')).map(kw))];

  const placements = [
    'Instagram Reels and Stories (video ad)',
    'Instagram and Facebook Feed (poster ad)',
    profile.goal === 'sales' || profile.goal === 'leads' ? 'Google Search + Maps (text ad)' : 'YouTube Shorts (video ad)',
  ];

  return {
    primary,
    secondary,
    location: locationPlan(profile, cat),
    timing: { hours: base.hours, days: base.days },
    keywords: { target: keywords, negative: cat.negatives },
    placements,
  };
}
