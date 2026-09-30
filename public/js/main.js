// NovaAd bootstrap: shared state, tabs, the launch pipeline, and the kit export.

import { CATEGORIES, GOALS, REGIONS, fmtMoney, runEngine } from './engine/index.js';
import { adCopyToText, planToMarkdown } from './engine/report.js';
import { makeZip } from './render/zip.js';
import { $, download, h, slug, toast } from './ui/dom.js';
import { startNeural } from './ui/neural-bg.js';
import { runPipeline } from './ui/pipeline.js';
import { createBriefView } from './ui/views/brief.js';
import { createCoachView, newCampaign } from './ui/views/coach.js';
import { createCreativeView, initCreative, renderAllPosters } from './ui/views/creative.js';
import { createStrategyView } from './ui/views/strategy.js';
import { createVideoView, initVideo } from './ui/views/video.js';
import { pickTheme } from './render/poster.js';

const TABS = [
  ['brief', 'Brief'],
  ['strategy', 'Strategy'],
  ['creative', 'Posters & copy'],
  ['video', 'Video'],
  ['coach', 'Ad coach'],
];
const STORE = { profile: 'novaad.profile.v1', campaigns: 'novaad.campaigns.v1' };

const store = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* private mode or full: the app works without it */ }
  },
};

const app = {
  state: {
    raw: null,
    result: null,
    image: null,
    logo: null,
    ai: { available: false, model: null, enabled: true, data: null, cost: null },
    creative: null,
    video: null,
    campaigns: [],
  },
  panels: Object.fromEntries(TABS.map(([id]) => [id, $(`#panel-${id}`)])),
};

let views;
const dirty = new Set();
let current = 'brief';

// ---- tabs -----------------------------------------------------------------

const tabsEl = $('#tabs');
const tabBtns = {};
TABS.forEach(([id, label], i) => {
  const b = h('button', { class: 'tab', role: 'tab', id: `tab-${id}`, type: 'button', 'aria-controls': `panel-${id}`, 'aria-selected': 'false', tabindex: '-1', onClick: () => app.go(id) },
    h('span', { class: 'n' }, String(i + 1).padStart(2, '0')), label);
  tabBtns[id] = b;
  tabsEl.append(b);
});
tabsEl.addEventListener('keydown', (e) => {
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
  const enabled = TABS.map(([id]) => id).filter((id) => !tabBtns[id].disabled);
  const i = enabled.indexOf(current);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? enabled.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length;
  e.preventDefault();
  app.go(enabled[next]);
  tabBtns[enabled[next]].focus();
});

function refreshTabs() {
  const has = Boolean(app.state.result);
  for (const [id] of TABS) tabBtns[id].disabled = !has && !['brief', 'coach'].includes(id);
  $('#kit-btn').disabled = !has;
  $('#kit-btn').title = has ? 'Posters, video, copy and plan in one .zip' : 'Create a campaign first';
}

app.go = (id) => {
  if (tabBtns[id]?.disabled) id = 'brief';
  current = id;
  for (const [tid] of TABS) {
    const on = tid === id;
    tabBtns[tid].setAttribute('aria-selected', String(on));
    tabBtns[tid].tabIndex = on ? 0 : -1;
    app.panels[tid].hidden = !on;
  }
  if (dirty.has(id)) {
    dirty.delete(id);
    views[id]?.render?.();
  }
  if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
};

// ---- lifecycle ----------------------------------------------------------------

function markAllDirty() {
  for (const id of ['strategy', 'creative', 'video', 'coach']) dirty.add(id);
}

app.saveCampaigns = () => store.set(STORE.campaigns, app.state.campaigns.map(({ id, ...rest }) => rest));

app.onImagesChanged = () => {
  if (!app.state.result) return;
  views.creative.schedule();
  if (app.state.video) views.video.rebuild();
};

app.onVideoReady = () => {};

async function askClaude(raw, signal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55_000);
  signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  try {
    const res = await fetch('/api/enhance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: raw }), signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Server said ${res.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

app.launch = async (raw) => {
  const result = runEngine(raw, { seed: 1 });
  if (!result.ok) {
    views.brief.setErrors(result.errors);
    toast('A few details are missing. Check the highlighted fields.', 'error');
    return;
  }
  views.brief.setErrors({});
  const { profile: p, audience, plan, forecasts, economics, copy } = result;
  const region = REGIONS[p.region];
  const money = (v) => fmtMoney(v, region);
  app.state.raw = raw;
  app.state.ai.data = null;
  app.state.ai.cost = null;
  store.set(STORE.profile, raw);
  const useClaude = app.state.ai.available && app.state.ai.enabled;
  const theme = pickTheme({ tone: p.tone, themeHint: CATEGORIES[p.category].themeHint, hasImage: Boolean(app.state.image) });

  const steps = [
    { label: 'Reading your brief', run: () => `${CATEGORIES[p.category].label} · ${region.label} · goal: ${GOALS[p.goal].label.toLowerCase()}` },
    { label: 'Finding the right people', run: () => `${audience.primary.label} · ${audience.location.summary}` },
    { label: `Splitting ${money(p.monthlyBudget)} across platforms`, run: () => `${plan.rows.map((r) => `${r.name} ${money(r.monthly)}`).join(' · ')}${plan.reserve ? ` · reserve ${money(plan.reserve)}` : ''}` },
    {
      label: 'Forecasting results and break-even',
      run: () => (p.goal === 'awareness'
        ? `about ${Math.round(forecasts.expected.totals.impressions).toLocaleString('en')} people reached`
        : `expected ROAS ${forecasts.expected.totals.roas.toFixed(2)}× vs break-even ${economics.breakEvenRoas.toFixed(2)}×`),
    },
    { label: 'Writing ad copy', run: () => `${copy.headlines.length} headlines · 3 captions · Google search ad within limits` },
  ];
  if (useClaude) {
    steps.push({
      label: 'Polishing copy with Claude',
      minMs: 0,
      run: async (signal) => {
        const out = await askClaude(raw, signal);
        app.state.ai.data = out.data;
        app.state.ai.cost = out.cost;
        return `${out.data.headlines.length} headlines · ${out.data.primaryTexts.length} captions · storyboard${out.cost ? ` · about $${out.cost.usd.toFixed(3)}` : ''}`;
      },
      onError: (e) => `skipped (${e.name === 'AbortError' ? 'stopped' : e.message}). Using the built-in copy`,
    });
  }
  steps.push({ label: 'Composing posters and the video storyboard', run: () => `${theme} style · 4 poster sizes · ${copy.storyboard.length}-scene video` });

  await runPipeline(steps);
  finishLaunch(result);
  app.go('strategy');
};

function finishLaunch(result) {
  app.state.result = result;
  if (app.state.video?.url) URL.revokeObjectURL(app.state.video.url);
  initCreative(app);
  initVideo(app);
  refreshTabs();
  markAllDirty();
  views.strategy.render();
  dirty.delete('strategy');
}

// ---- kit ------------------------------------------------------------------------

$('#kit-btn').addEventListener('click', async () => {
  const r = app.state.result;
  if (!r) return;
  const btn = $('#kit-btn');
  btn.disabled = true;
  btn.textContent = 'Building…';
  try {
    const name = slug(r.profile.businessName);
    const files = await renderAllPosters(app);
    const v = app.state.video;
    if (v?.blob) files.push({ name: `video/${name}-ad.${v.ext}`, data: new Uint8Array(await v.blob.arrayBuffer()) });
    files.push({ name: 'campaign-plan.md', data: planToMarkdown(r, { aiCopy: app.state.ai.data }) });
    files.push({ name: 'ad-copy.txt', data: adCopyToText(r.copy, app.state.ai.data) });
    download(new Blob([makeZip(files)], { type: 'application/zip' }), `${name}-campaign-kit.zip`);
    toast(v?.blob ? 'Campaign kit downloaded' : 'Kit downloaded. Render the video on the Video tab to include it next time.', 'ok');
  } catch (e) {
    toast(`Could not build the kit: ${e.message}`, 'error');
  } finally {
    btn.textContent = 'Download kit';
    refreshTabs();
  }
});

// ---- boot -----------------------------------------------------------------------

views = {
  brief: createBriefView(app),
  strategy: createStrategyView(app),
  creative: createCreativeView(app),
  video: createVideoView(app),
  coach: createCoachView(app),
};

startNeural($('#neural'));
refreshTabs();

(async function boot() {
  // Restore the last brief so returning owners land straight in their workspace.
  const savedRaw = store.get(STORE.profile);
  const savedCamps = store.get(STORE.campaigns);
  if (Array.isArray(savedCamps)) app.state.campaigns = savedCamps.map((c) => newCampaign(c));
  if (savedRaw) {
    views.brief.setRaw(savedRaw);
    const result = runEngine(savedRaw, { seed: 1 });
    if (result.ok) {
      app.state.raw = savedRaw;
      finishLaunch(result);
    }
  }
  try {
    const s = await (await fetch('/api/status')).json();
    app.state.ai.available = Boolean(s.ai);
    app.state.ai.model = s.model;
  } catch { /* offline server status is optional */ }
  const pill = $('#ai-pill');
  pill.hidden = false;
  pill.textContent = app.state.ai.available ? `Local engine + Claude` : 'Local AI engine';
  pill.classList.toggle('on', app.state.ai.available);
  pill.title = app.state.ai.available ? `Claude polish is on (${app.state.ai.model})` : 'Runs fully on your device. Set ANTHROPIC_API_KEY on the server to add Claude polish.';
  views.brief.setAi(app.state.ai.available);

  const start = location.hash.slice(1);
  app.go(TABS.some(([id]) => id === start) ? start : 'brief');
})();

window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (TABS.some(([t]) => t === id) && id !== current) app.go(id);
});

// Exposed for the end-to-end test only.
window.__novaad = app;
