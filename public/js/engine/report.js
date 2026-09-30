// Plain-text exports for the campaign kit. Pure functions so they are easy to
// test and safe to run anywhere.

import { GOALS, TONES } from './profile.js';
import { CATEGORIES, PLATFORMS, REGIONS, SCENARIOS, fmtMoney } from './knowledge.js';

const pct = (v) => `${Math.round(v * 100)}%`;

export function planToMarkdown(result, { aiCopy = null } = {}) {
  const { profile: p, plan, audience: a, forecasts, economics: ue, playbook, verdict, copy } = result;
  const region = REGIONS[p.region];
  const m = (v) => fmtMoney(v, region);
  const L = [];
  L.push(`# ${p.businessName}: ad campaign plan`);
  L.push('');
  L.push(`*${CATEGORIES[p.category].label} · ${region.label} · goal: ${GOALS[p.goal].label} · tone: ${TONES[p.tone]}*`);
  L.push('');
  L.push('> All forecasts are planning estimates from rounded public industry benchmarks scaled to your region. They are not promises.');
  L.push('');
  L.push('## Verdict');
  L.push(`**${verdict.title}.** ${verdict.body}`);
  L.push('');
  L.push('## Budget');
  L.push(`Monthly budget: **${m(plan.monthly)}** (${m(plan.dailyTotal)} a day). Reserve held back for winners: ${m(plan.reserve)}.`);
  L.push('');
  L.push('| Platform | Monthly | Per day | Share |');
  L.push('|---|---:|---:|---:|');
  for (const r of plan.rows) L.push(`| ${r.name} | ${m(r.monthly)} | ${m(r.daily)} | ${pct(r.monthly / plan.monthly)} |`);
  if (plan.reserve > 0) L.push(`| Reserve for winners | ${m(plan.reserve)} | held back | ${pct(plan.reserve / plan.monthly)} |`);
  for (const n of plan.notes) L.push(`\n${n}`);
  L.push('');
  L.push('## Forecast');
  L.push('');
  L.push('| Scenario | Clicks | Results | Sales | ROAS |');
  L.push('|---|---:|---:|---:|---:|');
  for (const [id, s] of Object.entries(SCENARIOS)) {
    const t = forecasts[id].totals;
    L.push(`| ${s.label} | ${Math.round(t.clicks).toLocaleString('en')} | ${t.conversions.toFixed(1)} | ${p.goal === 'awareness' ? '–' : m(t.revenue)} | ${p.goal === 'awareness' ? 'n/a' : `${t.roas.toFixed(2)}×`} |`);
  }
  L.push('');
  L.push(`Break-even ROAS: **${ue.breakEvenRoas.toFixed(2)}×**. Never pay more than **${m(ue.breakEvenCpa)}** for one ${ue.conversionNoun}.`);
  L.push('');
  L.push('## Audience');
  L.push(`- **Core:** ${a.primary.label}. Interests: ${a.primary.interests.join(', ')}.`);
  for (const s of a.secondary) L.push(`- **${s.name}:** ${s.label}. ${s.why}`);
  L.push(`- **Location:** ${a.location.summary}. ${a.location.method}`);
  L.push(`- **Best hours:** ${a.timing.hours.join(', ')}. **Best days:** ${a.timing.days.join(', ')}.`);
  L.push(`- **Google keywords:** ${a.keywords.target.join('; ')}`);
  L.push(`- **Negative keywords:** ${a.keywords.negative.join('; ')}`);
  L.push('');
  L.push('## 30-day playbook');
  for (const ph of playbook.phases) L.push(`- **${ph.days} · ${ph.title}:** ${ph.body}`);
  L.push('');
  L.push('### Rules');
  for (const r of playbook.rules) L.push(`- **${r.title}:** ${r.body}`);
  L.push('');
  L.push('## Where each platform fits');
  for (const r of plan.rows) L.push(`- **${PLATFORMS[r.id].name}:** ${r.role} Formats: ${r.formats}.`);
  L.push('');
  L.push(adCopyToText(copy, aiCopy).replace(/^/gm, '').replace(/^# .*\n/, '## Copy\n'));
  return L.join('\n');
}

export function adCopyToText(copy, aiCopy = null) {
  const L = ['# Ad copy', ''];
  if (aiCopy?.headlines?.length) {
    L.push('## Headlines (Claude)');
    aiCopy.headlines.forEach((h) => L.push(`- ${h}`));
    L.push('');
  }
  L.push('## Headlines');
  copy.headlines.forEach((h) => L.push(`- ${h}`));
  L.push('');
  L.push('## Captions');
  for (const c of [...(aiCopy?.primaryTexts || []).map((t, i) => ({ label: `Claude ${i + 1}`, text: t })), ...copy.primaryTexts]) {
    L.push(`### ${c.label}`);
    L.push(c.text);
    L.push('');
  }
  L.push('## Hashtags');
  L.push(copy.hashtags.join(' '));
  L.push('');
  L.push('## Google search ad');
  L.push('Headlines (30 characters max):');
  copy.google.headlines.forEach((h) => L.push(`- ${h}`));
  L.push('Descriptions (90 characters max):');
  copy.google.descriptions.forEach((d) => L.push(`- ${d}`));
  return L.join('\n');
}
