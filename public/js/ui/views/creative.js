import { CATEGORIES, scoreCopy } from '../../engine/index.js';
import { FORMATS, THEMES, canvasToBlob, pickTheme, renderPoster } from '../../render/poster.js';
import { makeZip } from '../../render/zip.js';
import { clear, download, h, icon, slug, toast } from '../dom.js';
import { copyButton, scoreBar } from '../widgets.js';

/** The poster spec for a given format from the current creative state. */
export function posterSpec(app, format) {
  const { result, creative, image, logo } = app.state;
  const p = result.profile;
  return {
    format,
    theme: creative.theme,
    headline: creative.headline,
    sub: creative.sub,
    offer: creative.offer,
    cta: creative.cta,
    biz: p.businessName,
    product: p.product,
    city: p.city,
    contact: p.contact,
    brandColor: creative.brandColor || p.brandColor,
    image,
    logo,
    seed: creative.seed,
  };
}

export function initCreative(app) {
  const r = app.state.result;
  const p = r.profile;
  app.state.creative = {
    format: 'square',
    theme: pickTheme({ tone: p.tone, themeHint: CATEGORIES[p.category].themeHint, hasImage: Boolean(app.state.image) }),
    headline: (app.state.ai.data?.headlines?.[0]) || r.copy.headlines[0],
    sub: r.copy.subheads[0] || '',
    offer: p.offer,
    cta: p.cta,
    brandColor: p.brandColor,
    seed: 1,
  };
}

export function createCreativeView(app) {
  const root = app.panels.creative;
  let canvas;
  let raf = 0;
  let inputs = {};

  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (canvas && app.state.result) renderPoster(canvas, posterSpec(app, app.state.creative.format));
    });
  };

  function headlineIdeas() {
    const r = app.state.result;
    const out = [];
    const seen = new Set();
    for (const t of (app.state.ai.data?.headlines || [])) if (!seen.has(t)) { seen.add(t); out.push({ t, ai: true }); }
    for (const t of r.copy.headlines) if (!seen.has(t)) { seen.add(t); out.push({ t }); }
    return out;
  }

  function render() {
    const r = app.state.result;
    clear(root);
    if (!r) return;
    const c = app.state.creative;
    const p = r.profile;

    canvas = h('canvas', { 'aria-label': 'Poster preview', role: 'img' });
    const stage = h('div', { class: 'stage' }, canvas);

    const formatBtns = h('div', { class: 'tabs-mini', role: 'group', 'aria-label': 'Poster size' },
      Object.values(FORMATS).map((f) => h('button', {
        type: 'button', 'aria-pressed': String(f.id === c.format), 'data-format': f.id,
        onClick: () => { c.format = f.id; for (const b of formatBtns.children) b.setAttribute('aria-pressed', String(b.dataset.format === f.id)); schedule(); },
      }, f.label, h('small', null, f.where))));

    const themeBtns = h('div', { class: 'tabs-mini', role: 'group', 'aria-label': 'Poster style' },
      Object.entries(THEMES).map(([id, t]) => h('button', {
        type: 'button', 'aria-pressed': String(id === c.theme), 'data-theme': id,
        onClick: () => { c.theme = id; for (const b of themeBtns.children) b.setAttribute('aria-pressed', String(b.dataset.theme === id)); schedule(); },
      }, t.label)));

    const bind = (key, el) => {
      el.value = c[key] || '';
      el.addEventListener('input', () => { c[key] = el.value; if (key === 'headline') app.state.creativeEdited = true; schedule(); });
      inputs[key] = el;
      return el;
    };
    const headlineIn = bind('headline', h('textarea', { rows: 2, maxlength: 90, 'aria-label': 'Headline' }));
    const subIn = bind('sub', h('input', { type: 'text', maxlength: 90, 'aria-label': 'Supporting line' }));
    const offerIn = bind('offer', h('input', { type: 'text', maxlength: 40, placeholder: 'e.g. 20% off', 'aria-label': 'Offer badge' }));
    const ctaIn = bind('cta', h('input', { type: 'text', maxlength: 24, 'aria-label': 'Button text' }));
    const colorIn = h('input', { type: 'color', value: c.brandColor, 'aria-label': 'Brand colour', onInput: (e) => { c.brandColor = e.target.value; schedule(); } });

    const ideas = h('div', { class: 'stack' });
    for (const idea of headlineIdeas()) {
      const s = scoreCopy(idea.t, p);
      ideas.append(h('div', { class: 'copy-item' },
        h('div', { class: 'txt' }, idea.t),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-sm', type: 'button', onClick: () => { c.headline = idea.t; headlineIn.value = idea.t; schedule(); } }, 'Use on poster'),
          copyButton(() => idea.t, '')),
        h('div', { class: 'meta' }, idea.ai ? h('span', { class: 'badge ai' }, 'Claude') : null, scoreBar(s.score), s.tips[0] ? h('span', null, s.tips[0]) : null)));
    }

    const captions = [
      ...(app.state.ai.data?.primaryTexts || []).map((t, i) => ({ label: `Claude ${i + 1}`, text: t, ai: true })),
      ...r.copy.primaryTexts,
    ];

    const g = r.copy.google;
    const serp = h('div', { class: 'serp' },
      h('div', { class: 'ad' }, 'Ad · ', /^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(p.contact) ? p.contact : 'yourwebsite.com'),
      h('div', { class: 'h' }, g.headlines.slice(0, 3).join(' | ')),
      h('div', { class: 'd' }, g.descriptions.slice(0, 2).join(' ')));
    const counted = (text, limit) => h('span', { class: `count${text.length > limit ? ' over' : ''}` }, `${text.length}/${limit}`);

    root.append(
      h('div', { class: 'page-h' }, h('div', { class: 'eyebrow' }, 'Step 3 · Creative studio'),
        h('h2', null, 'Posters that are ready to post'),
        h('p', null, 'Pick a size and a style, tweak the words, and download. Every poster is drawn on your device, so there is no per-poster cost.')),
      h('div', { class: 'stack' },
        h('div', { class: 'studio' },
          h('div', { class: 'card stack' },
            formatBtns, stage,
            h('div', { class: 'row' },
              h('button', { class: 'btn btn-primary', type: 'button', onClick: () => downloadOne(app) }, icon('download', 17), 'Download PNG'),
              h('button', { class: 'btn', type: 'button', onClick: () => downloadAll(app) }, icon('download', 17), 'All 4 sizes (.zip)'),
              h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { c.seed += 1; schedule(); } }, icon('shuffle', 17), 'Shuffle the look'))),
          h('div', { class: 'card stack' },
            h('div', { class: 'ctl-group' }, h('span', { class: 'lab' }, 'Style'), themeBtns),
            h('div', { class: 'ctl-group' }, h('span', { class: 'lab' }, 'Words on the poster'),
              h('div', { class: 'field' }, h('label', null, 'Headline'), headlineIn),
              h('div', { class: 'field' }, h('label', null, 'Supporting line'), subIn),
              h('div', { class: 'form-grid' },
                h('div', { class: 'field' }, h('label', null, 'Offer badge'), offerIn),
                h('div', { class: 'field' }, h('label', null, 'Button text'), ctaIn)),
              h('div', { class: 'field' }, h('label', null, 'Colour'), colorIn)),
            app.state.image ? null : h('p', { class: 'note' }, 'Tip: add a product photo on the Brief tab and this poster will use it instead of the generated art.'))),

        h('div', { class: 'card' },
          h('div', { class: 'card-h' }, h('h3', null, 'Headline ideas'), h('span', { class: 'muted small' }, 'Score = a craft checklist (numbers, place, action), not a sales prediction')),
          ideas),

        h('div', { class: 'card' },
          h('div', { class: 'card-h' }, h('h3', null, 'Captions for Instagram & Facebook'), h('span', { class: 'muted small' }, 'Paste under your poster or video')),
          captions.map((cap) => {
            const s = scoreCopy(cap.text, p, 'caption');
            return h('div', { class: 'copy-item' },
              h('div', { class: 'txt' }, cap.text),
              copyButton(() => cap.text),
              h('div', { class: 'meta' }, cap.ai ? h('span', { class: 'badge ai' }, 'Claude') : h('span', { class: 'badge info' }, cap.label), scoreBar(s.score), h('span', { class: 'count' }, `${cap.text.length} chars`), s.tips[0] ? h('span', null, s.tips[0]) : null));
          }),
          h('div', { class: 'copy-item' },
            h('div', { class: 'txt' }, r.copy.hashtags.join(' ')),
            copyButton(() => r.copy.hashtags.join(' ')),
            h('div', { class: 'meta' }, 'Hashtags: 5 to 10 relevant ones beat 30 random ones'))),

        h('div', { class: 'card' },
          h('div', { class: 'card-h' }, h('h3', null, 'Google search ad'), h('span', { class: 'muted small' }, 'Within Google\'s limits: 30 characters per headline, 90 per description')),
          h('div', { class: 'grid-2' },
            h('div', { class: 'stack' }, serp,
              h('p', { class: 'hint' }, 'Google mixes and matches these. Give it at least 3 headlines and 2 descriptions.')),
            h('div', null,
              g.headlines.map((t) => h('div', { class: 'copy-item' }, h('div', { class: 'txt' }, t), copyButton(() => t, ''), h('div', { class: 'meta' }, 'Headline ', counted(t, 30)))),
              g.descriptions.map((t) => h('div', { class: 'copy-item' }, h('div', { class: 'txt' }, t), copyButton(() => t, ''), h('div', { class: 'meta' }, 'Description ', counted(t, 90)))))))));

    schedule();
  }

  return { render, schedule };
}

async function downloadOne(app) {
  const c = app.state.creative;
  const cv = document.createElement('canvas');
  renderPoster(cv, posterSpec(app, c.format));
  download(await canvasToBlob(cv), `${slug(app.state.result.profile.businessName)}-${c.format}.png`);
}

export async function renderAllPosters(app) {
  const files = [];
  for (const f of Object.values(FORMATS)) {
    const cv = document.createElement('canvas');
    renderPoster(cv, posterSpec(app, f.id));
    const blob = await canvasToBlob(cv);
    files.push({ name: `posters/${slug(app.state.result.profile.businessName)}-${f.id}-${f.w}x${f.h}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  return files;
}

async function downloadAll(app) {
  try {
    const files = await renderAllPosters(app);
    download(new Blob([makeZip(files)], { type: 'application/zip' }), `${slug(app.state.result.profile.businessName)}-posters.zip`);
  } catch (e) {
    toast(`Could not build the zip: ${e.message}`, 'error');
  }
}
