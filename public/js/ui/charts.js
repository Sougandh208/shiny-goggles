// Two small charts, built as plain DOM so they inherit the theme, need no
// library, and are keyboard/tooltip friendly. The table beside each chart is
// its accessible equivalent: nothing is reachable only by hover.

import { PLATFORMS, REGIONS, fmtMoney } from '../engine/index.js';
import { attachTip, h } from './dom.js';

/** Part-to-whole: one horizontal stacked bar (platforms + reserve). */
export function allocationChart(plan, forecast) {
  const region = REGIONS[plan.region.id];
  const segs = plan.rows.map((r) => ({ id: r.id, name: r.name, amount: r.monthly, share: r.share * (plan.deployable / plan.monthly) }));
  if (plan.reserve > 0) segs.push({ id: 'reserve', name: 'Reserve for winners', amount: plan.reserve, share: plan.reserve / plan.monthly });

  const bar = h('div', { class: 'alloc', role: 'img', 'aria-label': `Budget split: ${segs.map((s) => `${s.name} ${Math.round(s.share * 100)}%`).join(', ')}` });
  for (const s of segs) {
    const fc = forecast?.rows.find((r) => r.id === s.id);
    const seg = h('button', { class: `seg p-${s.id}`, type: 'button', vars: { '--w': (s.share * 100).toFixed(3) }, 'aria-label': `${s.name}: ${fmtMoney(s.amount, region)}` },
      s.share >= 0.14 ? `${Math.round(s.share * 100)}%` : '');
    if (s.id === 'reserve') {
      seg.style.setProperty('--c', '#4b5586');
    }
    attachTip(seg, () => ({
      value: fmtMoney(s.amount, region),
      label: `${s.name} · ${Math.round(s.share * 100)}% of budget`,
      lines: fc ? [`≈ ${Math.round(fc.clicks).toLocaleString('en')} clicks`] : ['Held back until winners appear'],
    }));
    bar.append(seg);
  }
  const legend = h('div', { class: 'legend' },
    segs.map((s) => h('span', { class: `lg p-${s.id}` }, h('i', { class: 'key', vars: s.id === 'reserve' ? { '--c': '#4b5586' } : {} }), `${s.name} ${fmtMoney(s.amount, region)}`)));
  return h('div', null, bar, legend);
}

/** Delta-to-target: ROAS per scenario against the break-even line. */
export function scenarioChart(forecasts, breakEven) {
  const items = [
    ['cautious', 'Cautious'],
    ['expected', 'Expected'],
    ['optimistic', 'Optimistic'],
  ].map(([id, label]) => ({ id, label, roas: forecasts[id].totals.roas }));
  const max = Math.max(breakEven, ...items.map((i) => i.roas)) * 1.18 || 1;
  const wrap = h('div', { class: 'scen', vars: { '--be': ((breakEven / max) * 100).toFixed(2) }, role: 'img', 'aria-label': `Return on ad spend by scenario against a break-even of ${breakEven.toFixed(1)} times` },
    h('div', { class: 'scen-ref' }, h('span', null, `break-even ${breakEven.toFixed(1)}×`)));
  for (const it of items) {
    const bar = h('div', { class: `scen-bar${it.id === 'expected' ? ' hi' : ''}`, vars: { '--w': ((it.roas / max) * 100).toFixed(2) }, tabindex: 0 },
      h('span', { class: 'val' }, `${it.roas.toFixed(2)}×`));
    attachTip(bar, () => ({
      value: `${it.roas.toFixed(2)}× ROAS`,
      label: `${it.label} case`,
      lines: [it.roas >= breakEven ? 'Above break-even: profitable' : 'Below break-even: loses money'],
    }));
    wrap.append(h('div', { class: 'scen-row' }, h('span', { class: 'lab' }, it.label), h('div', { class: 'scen-track' }, bar)));
  }
  return wrap;
}

export const platformKey = (id) => h('i', { class: `key p-${id}` });
export const platformName = (id) => PLATFORMS[id].name;
