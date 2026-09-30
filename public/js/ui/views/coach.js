import { PLATFORMS, PLATFORM_ORDER, REGIONS, VERDICTS, fmtMoney, getBenchmarks, summarizePortfolio } from '../../engine/index.js';
import { clear, h, icon } from '../dom.js';

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

let nextId = 1;
export const newCampaign = (over = {}) => ({ id: nextId++, name: '', platform: 'instagram', spend: '', impressions: '', clicks: '', conversions: '', revenue: '', ...over });

/** Believable example campaigns scaled to the owner's own budget, margin and prices. */
export function exampleCampaigns(profile) {
  const budget = profile.monthlyBudget;
  const make = (name, platform, share, cpcM, ctrM, cvrM) => {
    const b = getBenchmarks(platform, profile);
    const spend = Math.round(budget * share);
    const clicks = Math.round(spend / (b.cpc * cpcM));
    const impressions = Math.round(clicks / ((b.ctr * ctrM) / 100));
    const conversions = Math.round((clicks * ((b.cvr * cvrM) / 100)));
    return newCampaign({ name, platform, spend, impressions, clicks, conversions, revenue: Math.round(conversions * profile.aov) });
  };
  return [
    make('Reel: hero product', 'instagram', 0.2, 0.8, 1.3, 2.2),
    make('Feed poster: offer', 'facebook', 0.12, 1.9, 0.45, 0),
    make('Google search ad', 'google', 0.14, 1.0, 1.0, 0.9),
  ];
}

const GLOSSARY = [
  ['CTR (click-through rate)', 'Of everyone who saw your ad, the share who clicked. Low CTR means the picture or first line is not catching attention. Fix the creative.'],
  ['CPC (cost per click)', 'What you pay each time someone clicks. High CPC usually means your audience is too narrow or the slot is crowded.'],
  ['CPM (cost per 1,000 views)', 'What it costs to show your ad 1,000 times. Useful for awareness ads; it moves with season and competition.'],
  ['CVR (conversion rate)', 'Of the people who clicked, the share who bought or enquired. Low CVR with normal CTR means the problem is after the click: price, page, or slow replies.'],
  ['CPA (cost per result)', 'Spend divided by purchases or enquiries. Compare it to your break-even cost: paying more than that loses money on every sale.'],
  ['ROAS (return on ad spend)', 'Sales divided by ad spend. A ROAS of 3× means every 1 spent brought back 3. What matters is your own break-even ROAS, which depends on your margin.'],
];

export function createCoachView(app) {
  const root = app.panels.coach;
  let resultsBox;

  function persist() {
    app.saveCampaigns();
  }

  function rowEl(c, profile, onChange, onRemove) {
    const region = REGIONS[profile.region];
    const f = (key, label, type = 'number') => {
      const id = `c${c.id}-${key}`;
      const input = h('input', { id, type, value: c[key] ?? '', inputmode: type === 'number' ? 'decimal' : undefined, min: type === 'number' ? '0' : undefined, step: 'any', maxlength: type === 'text' ? 40 : undefined, placeholder: key === 'name' ? 'e.g. Diwali reel' : '0' });
      input.addEventListener('input', () => { c[key] = input.value; onChange(); });
      return h('div', { class: 'field' }, h('label', { for: id }, label), input);
    };
    const platId = `c${c.id}-platform`;
    const sel = h('select', { id: platId },
      PLATFORM_ORDER.map((p) => h('option', { value: p, selected: p === c.platform }, PLATFORMS[p].name)));
    sel.addEventListener('change', () => { c.platform = sel.value; onChange(); });
    const conv = profile.goal === 'leads' ? 'Enquiries' : 'Purchases';
    return h('div', { class: 'camp-row' },
      f('name', 'Campaign name', 'text'),
      h('div', { class: 'field' }, h('label', { for: platId }, 'Platform'), sel),
      f('spend', `Spend (${region.symbol})`),
      f('impressions', 'Impressions'),
      f('clicks', 'Clicks'),
      f('conversions', conv),
      f('revenue', `Sales (${region.symbol})`),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': `Remove ${c.name || 'campaign'}`, onClick: onRemove }, icon('trash', 16)));
  }

  function verdictCard(row, profile) {
    const region = REGIONS[profile.region];
    const money = (v) => fmtMoney(v, region);
    const m = row.metrics;
    const b = row.bench;
    const v = VERDICTS[row.verdict];
    const met = (l, val, bench) => h('div', { class: 'met' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, val), bench ? h('div', { class: 'b' }, bench) : null);
    const pct = (x) => (x == null ? '–' : `${x.toFixed(2)}%`);
    return h('div', { class: `vcard ${row.verdict}` },
      h('div', { class: 'row' },
        h('span', { class: `p-${row.camp.platform}` }, h('i', { class: 'key' }), h('strong', null, row.camp.name || PLATFORMS[row.camp.platform].name)),
        h('span', { class: `badge ${v.tone}` }, icon(v.tone === 'good' ? 'check' : v.tone === 'info' ? 'info' : 'alert', 13), v.label)),
      h('h4', null, row.headline),
      h('div', { class: 'mets' },
        met('CTR', pct(m.ctr), `typical ${b.ctr.toFixed(2)}%`),
        met('CPC', m.cpc == null ? '–' : money(m.cpc), `typical ${money(b.cpc)}`),
        met('CPM', m.cpm == null ? '–' : money(m.cpm), `typical ${money(b.cpm)}`),
        met('CVR', pct(m.cvr), `typical ${b.cvr.toFixed(2)}%`),
        met('Cost / result', m.cpa == null ? '–' : money(m.cpa)),
        met('ROAS', m.roas == null ? '–' : `${m.roas.toFixed(2)}×`, `break-even ${app.state.result.economics.breakEvenRoas.toFixed(2)}×`)),
      h('ul', null, row.reasons.map((t) => h('li', null, t))),
      h('div', null, h('div', { class: 'eyebrow' }, 'What to do'), h('ul', { class: 'do' }, row.actions.map((t) => h('li', null, t)))));
  }

  function paintResults() {
    const r = app.state.result;
    clear(resultsBox);
    const camps = app.state.campaigns.filter((c) => num(c.spend) > 0 || num(c.impressions) > 0 || num(c.clicks) > 0);
    if (!camps.length) {
      resultsBox.append(h('div', { class: 'note' }, 'Enter the numbers from your Meta, Google or YouTube dashboard (or load the example) and the coach will tell you what to do next.'));
      return;
    }
    const clean = camps.map((c) => ({ ...c, spend: num(c.spend), impressions: num(c.impressions), clicks: num(c.clicks), conversions: num(c.conversions), revenue: num(c.revenue) }));
    const s = summarizePortfolio(clean, r.profile);
    const region = REGIONS[r.profile.region];
    resultsBox.append(
      h('div', { class: `verdict ${s.rows.some((x) => x.verdict === 'pause') ? 'bad' : s.rows.some((x) => x.verdict === 'scale') ? 'good' : 'info'}` },
        h('div', { class: 'v-ic' }, icon(s.rows.some((x) => x.verdict === 'pause') ? 'alert' : 'check', 20)),
        h('div', null,
          h('h3', null, 'What to do with your money this week'),
          h('p', null, s.lines.join(' ')),
          h('p', { class: 'muted small' }, `Spent ${fmtMoney(s.totals.spend, region)} · sales ${fmtMoney(s.totals.revenue, region)}${s.totals.roas != null ? ` · overall ROAS ${s.totals.roas.toFixed(2)}×` : ''} · your break-even is ${r.economics.breakEvenRoas.toFixed(2)}×`))),
      ...s.rows.map((row) => verdictCard(row, r.profile)));
  }

  function render() {
    const r = app.state.result;
    clear(root);
    root.append(h('div', { class: 'page-h' }, h('div', { class: 'eyebrow' }, 'Step 5 · Ad coach'),
      h('h2', null, 'What do your ad numbers really mean?'),
      h('p', null, 'Paste the numbers from your ad dashboard. The coach compares them with your own break-even point and says scale, keep, fix or pause, so no campaign quietly drains your budget.')));
    if (!r) {
      root.append(h('div', { class: 'card empty' }, h('h3', null, 'Start with your brief'),
        h('p', null, 'The coach needs your profit margin and average sale to know what "good" means for you.'),
        h('div', { class: 'row' }, h('button', { class: 'btn btn-primary', type: 'button', onClick: () => app.go('brief') }, 'Go to the brief'))));
      return;
    }
    resultsBox = h('div', { class: 'stack' });
    const list = h('div');
    const draw = () => {
      clear(list);
      const onChange = () => { persist(); paintResults(); };
      for (const c of app.state.campaigns) {
        list.append(rowEl(c, r.profile, onChange, () => { app.state.campaigns = app.state.campaigns.filter((x) => x !== c); persist(); draw(); paintResults(); }));
      }
      if (!app.state.campaigns.length) list.append(h('p', { class: 'muted' }, 'No campaigns yet. Add one, or load the example.'));
    };
    draw();

    const ue = r.economics;
    const region = REGIONS[r.profile.region];
    root.append(h('div', { class: 'stack' },
      h('div', { class: 'card' },
        h('div', { class: 'card-h' }, h('h3', null, 'Your campaigns'),
          h('span', { class: 'muted small' }, `Your break-even: ${ue.breakEvenRoas.toFixed(2)}× ROAS · ${fmtMoney(ue.breakEvenCpa, region)} per ${ue.conversionNoun}`)),
        list,
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onClick: () => { app.state.campaigns.push(newCampaign()); persist(); draw(); } }, icon('plus', 16), 'Add campaign'),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { app.state.campaigns = exampleCampaigns(r.profile); persist(); draw(); paintResults(); } }, icon('spark', 16), 'Load an example'),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { app.state.campaigns = []; persist(); draw(); paintResults(); } }, icon('trash', 16), 'Clear all'))),
      resultsBox,
      h('div', { class: 'card' },
        h('div', { class: 'card-h' }, h('h3', null, 'What these numbers mean')),
        GLOSSARY.map(([t, d]) => h('details', { class: 'gl' }, h('summary', null, t), h('p', null, d))))));
    paintResults();
  }

  return { render };
}
