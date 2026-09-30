import { REGIONS, SCENARIOS, fmtMoney } from '../../engine/index.js';
import { allocationChart, scenarioChart } from '../charts.js';
import { clear, h, icon } from '../dom.js';
import { chips, compact, copyChip, kpi } from '../widgets.js';

const VERDICT_ICON = { good: 'check', warn: 'alert', bad: 'alert', info: 'info' };

export function createStrategyView(app) {
  const root = app.panels.strategy;
  let scenario = 'expected';

  function render() {
    const r = app.state.result;
    clear(root);
    if (!r) return;
    const region = REGIONS[r.profile.region];
    const money = (v) => fmtMoney(v, region);
    const ue = r.economics;
    const awareness = r.profile.goal === 'awareness';
    const noun = ue.conversionLabel;

    const kpiBox = h('div', { class: 'kpis' });
    const paint = () => {
      const t = r.forecasts[scenario].totals;
      clear(kpiBox);
      kpiBox.append(
        kpi('Estimated reach', compact(t.impressions), 'people seeing your ads'),
        kpi('Estimated clicks', compact(t.clicks), `about ${money(t.cpc)} each`),
        kpi(`Estimated ${noun}`, t.conversions < 10 ? t.conversions.toFixed(1) : compact(t.conversions), awareness ? 'not the goal here' : `${money(t.spend / Math.max(t.conversions, 0.0001))} per ${ue.conversionNoun}`),
        kpi('Estimated sales', awareness ? '–' : money(t.revenue), awareness ? 'awareness campaign' : `from ${money(t.spend)} spent`),
        awareness ? kpi('Return on ad spend', 'n/a', 'judge by reach & CTR', 'hero-k') : kpi('Return on ad spend', `${t.roas.toFixed(2)}×`, `break-even is ${ue.breakEvenRoas.toFixed(2)}×`, 'hero-k'),
      );
    };
    paint();

    const seg = h('div', { class: 'seg-ctl', role: 'group', 'aria-label': 'Forecast scenario' },
      Object.entries(SCENARIOS).map(([id, s]) => h('button', {
        type: 'button', 'aria-pressed': String(id === scenario),
        onClick: (e) => {
          scenario = id;
          for (const b of seg.children) b.setAttribute('aria-pressed', 'false');
          e.currentTarget.setAttribute('aria-pressed', 'true');
          paint();
        },
      }, s.label)));

    // ---- budget table
    const fc = r.forecasts.expected;
    const rows = r.plan.rows.map((row) => {
      const f = fc.rows.find((x) => x.id === row.id);
      const max = ue.maxCpc[row.id];
      const status = awareness ? null : row.benchmarks.cpc <= max * 0.8 ? ['good', 'Room to profit'] : row.benchmarks.cpc <= max ? ['warn', 'Tight'] : ['bad', 'Clicks cost too much'];
      return h('tr', null,
        h('td', null, h('div', { class: `p-${row.id}` }, h('i', { class: 'key' }), h('strong', null, row.name)), h('div', { class: 'muted small' }, row.role), h('div', { class: 'muted small' }, `Run: ${row.formats}`)),
        h('td', { class: 'num' }, money(row.monthly), h('div', { class: 'muted small' }, `${Math.round((row.monthly / r.plan.monthly) * 100)}% of budget`)),
        h('td', { class: 'num' }, money(row.daily)),
        h('td', { class: 'num' }, money(f.cpc), h('div', { class: 'muted small' }, `CTR ${f.ctr.toFixed(2)}%`)),
        h('td', { class: 'num' }, compact(f.clicks)),
        h('td', { class: 'num' }, f.conversions < 10 ? f.conversions.toFixed(1) : compact(f.conversions)),
        h('td', { class: 'num' }, awareness ? '–' : `${f.roas.toFixed(2)}×`),
        h('td', null, status ? h('span', { class: `badge ${status[0]}` }, status[1]) : null, status ? h('div', { class: 'muted small' }, `Max click cost ${money(max)}`) : null));
    });

    // ---- audience
    const a = r.audience;
    const persona = (p, main) => h('div', { class: `persona${main ? ' main' : ''}` },
      h('div', { class: 'eyebrow' }, main ? 'Core customer' : 'Also target'),
      h('div', { class: 'who' }, main ? p.label : p.name),
      main ? null : h('div', { class: 'muted' }, p.label),
      main ? chips(p.interests) : null,
      main ? h('ul', null, p.reasoning.map((t) => h('li', null, t))) : h('p', { class: 'small muted' }, p.why));

    root.append(
      h('div', { class: 'page-h' }, h('div', { class: 'eyebrow' }, 'Step 2 · Strategy'),
        h('h2', null, `Your plan for ${r.profile.businessName}`),
        h('p', null, `${money(r.plan.monthly)} a month, aimed at ${a.primary.label.toLowerCase()} ${a.location.radiusKm ? `within ${a.location.radiusKm} km of ${r.profile.city}` : 'across your market'}.`)),
      h('div', { class: 'stack' },
        h('div', { class: `verdict ${r.verdict.level}` }, h('div', { class: 'v-ic' }, icon(VERDICT_ICON[r.verdict.level], 20)), h('div', null, h('h3', null, r.verdict.title), h('p', null, r.verdict.body))),

        h('div', { class: 'card' },
          h('div', { class: 'card-h' }, h('h3', null, 'What to expect this month'), seg),
          kpiBox,
          h('p', { class: 'hint' }, 'Estimates from public industry benchmarks scaled to your region. Real results depend on your photos, offer, season and competitors.')),

        h('div', { class: 'grid-2' },
          h('div', { class: 'card' },
            h('div', { class: 'card-h' }, h('h3', null, 'Where every ' + (region.currency === 'INR' ? 'rupee' : 'dollar') + ' goes'), h('span', { class: 'muted small' }, `${money(r.plan.monthly)} · ${money(r.plan.dailyTotal)} a day`)),
            allocationChart(r.plan, fc),
            r.plan.notes.length ? h('p', { class: 'note' }, r.plan.notes.join(' ')) : null,
            r.plan.reserve > 0 ? h('p', { class: 'hint' }, `${money(r.plan.reserve)} is held back as a reserve. You move it into whichever ad proves it can pay back.`) : null),
          h('div', { class: 'card' },
            h('div', { class: 'card-h' }, h('h3', null, 'Return vs break-even')),
            awareness ? h('p', { class: 'muted' }, 'Awareness campaigns are not judged on sales return. Watch reach, CTR and profile visits instead.') : scenarioChart(r.forecasts, ue.breakEvenRoas),
            awareness ? null : h('p', { class: 'hint' }, `Break-even is ${ue.breakEvenRoas.toFixed(2)}× because you keep ${Math.round(ue.margin * 100)}% of each sale. Below that line, ads cost more than they earn. You should never pay more than ${money(ue.breakEvenCpa)} per ${ue.conversionNoun}.`))),

        h('div', { class: 'card' },
          h('div', { class: 'card-h' }, h('h3', null, 'Platform by platform'), h('span', { class: 'muted small' }, 'Expected case')),
          h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
            h('thead', null, h('tr', null, ['Platform', 'Monthly', 'Per day', 'Click cost', 'Clicks', 'Results', 'ROAS', 'Verdict'].map((c, i) => h('th', { class: i > 0 && i < 7 ? 'num' : '' }, c)))),
            h('tbody', null, rows)))),

        h('div', { class: 'card' },
          h('div', { class: 'card-h' }, h('h3', null, 'Who to target'), h('span', { class: 'muted small' }, 'Paste these into the ad platform')),
          h('div', { class: 'grid-3' }, persona(a.primary, true), a.secondary.map((p) => persona(p, false))),
          h('dl', { class: 'kv' },
            h('dt', null, 'Location'), h('dd', null, h('strong', null, a.location.summary), h('div', { class: 'muted small' }, a.location.method)),
            h('dt', null, 'Best hours'), h('dd', null, a.timing.hours.join('  ·  ')),
            h('dt', null, 'Best days'), h('dd', null, a.timing.days.join(', ')),
            h('dt', null, 'Where ads show'), h('dd', null, a.placements.join('; ')),
            h('dt', null, 'Google keywords'), h('dd', null, h('div', { class: 'chips' }, a.keywords.target.map((k) => copyChip(k)))),
            h('dt', null, 'Block (negatives)'), h('dd', null, h('div', { class: 'chips' }, a.keywords.negative.map((k) => copyChip(k, 'neg'))), h('div', { class: 'hint' }, 'Add these as negative keywords so you do not pay for the wrong searches.'))),
          app.state.ai.data?.audienceTips?.length ? h('div', { class: 'note' }, h('span', { class: 'badge ai' }, 'Claude'), ' ', app.state.ai.data.audienceTips.join('  ·  ')) : null),

        h('div', { class: 'card' },
          h('div', { class: 'card-h' }, h('h3', null, 'Your 30-day playbook'), h('span', { class: 'muted small' }, 'So budget is never wasted')),
          h('div', { class: 'timeline' }, r.playbook.phases.map((p) => h('div', { class: 'tl' }, h('div', { class: 'd' }, p.days), h('div', null, h('h4', null, p.title), h('p', null, p.body))))),
          h('div', { class: 'rules' }, r.playbook.rules.map((x) => h('div', { class: `rule ${x.kind}` }, h('h4', null, x.title), h('p', null, x.body))))),

        h('div', { class: 'row' },
          h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: () => app.go('creative') }, icon('image', 20), 'Create my posters'),
          h('button', { class: 'btn btn-lg', type: 'button', onClick: () => app.go('video') }, icon('film', 20), 'Make my video'))));
  }

  return { render };
}
