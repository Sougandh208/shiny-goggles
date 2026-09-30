import { copyText, h, icon, toast } from './dom.js';

const compactFmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const compact = (n) => (n == null || !Number.isFinite(n) ? '–' : Math.abs(n) < 1000 ? String(Math.round(n)) : compactFmt.format(n));

export function kpi(label, value, sub, cls = '') {
  return h('div', { class: `kpi ${cls}` }, h('div', { class: 'k-l' }, label), h('div', { class: 'k-v' }, value), sub ? h('div', { class: 'k-s' }, sub) : null);
}

export function copyButton(getText, label = 'Copy') {
  const btn = h('button', { class: 'btn btn-sm', type: 'button' }, icon('copy', 15), label);
  btn.addEventListener('click', async () => {
    try {
      await copyText(getText());
      toast('Copied to clipboard', 'ok', 1800);
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  return btn;
}

export function copyChip(text, cls = '') {
  const c = h('button', { class: `chip ${cls}`, type: 'button', title: 'Click to copy' }, text);
  c.addEventListener('click', async () => {
    try {
      await copyText(text);
      toast(`Copied "${text}"`, 'ok', 1500);
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  return c;
}

export const chips = (items, cls = '') => h('div', { class: 'chips' }, items.map((t) => h('span', { class: `chip ${cls}` }, t)));

export const scoreBar = (score) => h('span', { class: 'score', title: 'Rule-based craft checklist, not a performance prediction' }, h('i', { vars: { '--w': score } }), `${score}`);
