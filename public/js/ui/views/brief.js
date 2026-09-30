import { CATEGORIES, GOALS, REGIONS, SCOPES, TONES } from '../../engine/index.js';
import { clear, h, icon, loadImageFile, toast } from '../dom.js';

export const SAMPLES = [
  {
    label: 'Boutique in Pune (₹)',
    values: {
      businessName: 'Lotus Boutique', category: 'fashion', product: 'Handmade cotton kurtis', region: 'IN', city: 'Pune', scope: 'local',
      goal: 'sales', tone: 'friendly', monthlyBudget: 15000, aov: 1800, margin: 50, offer: '20% off', sellingPoints: 'Free delivery over ₹999',
      targetNote: 'Women 22-35 who love ethnic wear (2-piece sets)', contact: '@lotusboutique', cta: 'Shop now', brandColor: '#e11d74',
    },
  },
  {
    label: 'Home bakery in Austin ($)',
    values: {
      businessName: 'Sweet Crumb Bakery', category: 'food', product: 'custom birthday cakes', region: 'US', city: 'Austin', scope: 'local',
      goal: 'leads', tone: 'playful', monthlyBudget: 300, aov: 65, margin: 55, offer: 'Free tasting box on your first order', sellingPoints: 'Custom flavours, Orders open all week',
      targetNote: 'Parents planning birthday parties', contact: 'Text 512-555-0134', cta: 'Order a cake', brandColor: '#ff7a2f',
    },
  },
  {
    label: 'App startup ($)',
    values: {
      businessName: 'TaskTide', category: 'startup', product: 'TaskTide team planner app', region: 'US', city: '', scope: 'online',
      goal: 'traffic', tone: 'trust', monthlyBudget: 600, aov: 240, margin: 80, offer: '', sellingPoints: '',
      targetNote: 'Founders and team leads', contact: 'tasktide.app', cta: 'Try it today', brandColor: '#4f7cff',
    },
  },
];

export function createBriefView(app) {
  const root = app.panels.brief;
  const fields = {};
  const currencySpans = [];

  const text = (name, label, opts = {}) => {
    const input = h('input', { type: opts.type || 'text', autocomplete: 'off', maxlength: opts.max || 60, placeholder: opts.placeholder || '', inputmode: opts.inputmode });
    return field(name, label, input, opts);
  };

  function field(name, label, control, { hint, optional, span2, wrap } = {}) {
    const id = `f-${name}`;
    control.id = id;
    control.name = name;
    const err = h('div', { class: 'err', id: `${id}-err`, hidden: true });
    control.setAttribute('aria-describedby', `${hint ? `${id}-hint ` : ''}${id}-err`);
    fields[name] = { control, err };
    return h('div', { class: `field${span2 ? ' span-2' : ''}` },
      h('label', { for: id }, label, optional ? h('span', { class: 'opt' }, ' (optional)') : null),
      wrap || control,
      hint ? h('div', { class: 'hint', id: `${id}-hint` }, hint) : null,
      err);
  }

  function select(name, label, options, opts) {
    const s = h('select', null, options.map(([v, l]) => h('option', { value: v }, l)));
    return field(name, label, s, opts);
  }

  function money(name, label, opts) {
    const input = h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: opts.placeholder || '' });
    const span = h('span', { text: '$' });
    currencySpans.push(span);
    return field(name, label, input, { ...opts, wrap: h('div', { class: 'affix' }, span, input) });
  }

  function percent(name, label, opts) {
    const input = h('input', { type: 'number', min: '5', max: '95', step: '1', inputmode: 'numeric', placeholder: '40' });
    return field(name, label, input, { ...opts, wrap: h('div', { class: 'affix right' }, h('span', { text: '%' }), input) });
  }

  const goalRadios = h('div', { class: 'radios', role: 'radiogroup', 'aria-label': 'Main goal' },
    Object.entries(GOALS).map(([id, g], i) => {
      const input = h('input', { type: 'radio', name: 'goal', id: `goal-${id}`, value: id, checked: i === 0 });
      return h('div', { class: 'radio' }, input, h('label', { for: `goal-${id}` }, g.label, h('small', null, g.hint)));
    }));

  function imagePicker(key, label, hint) {
    const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', id: `f-${key}` });
    const thumb = h('img', { class: 'thumb', alt: '', hidden: true });
    const pick = h('button', { class: 'btn btn-sm', type: 'button', onClick: () => input.click() }, icon('image', 16), 'Choose image');
    const remove = h('button', { class: 'btn btn-sm btn-ghost', type: 'button', hidden: true, onClick: () => set(null) }, icon('x', 14), 'Remove');
    function set(val) {
      app.state[key] = val ? val.canvas : null;
      thumb.hidden = remove.hidden = !val;
      if (val) thumb.src = val.thumbUrl;
      input.value = '';
      app.onImagesChanged();
    }
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        set(await loadImageFile(f, key === 'logo' ? 600 : 1600));
      } catch (e) {
        toast(e.message, 'error');
      }
    });
    return h('div', { class: 'field' },
      h('span', { class: 'lab' }, label, h('span', { class: 'opt' }, ' (optional)')),
      h('div', { class: 'file-row' }, thumb, pick, remove, input),
      h('div', { class: 'hint' }, hint));
  }

  const catOptions = [['', 'Choose one…'], ...Object.entries(CATEGORIES).map(([id, c]) => [id, c.label])];
  const regionOptions = Object.values(REGIONS).map((r) => [r.id, `${r.label} (${r.symbol})`]);

  const form = h('form', { novalidate: true, onSubmit: (e) => { e.preventDefault(); app.launch(getRaw()); } },
    h('div', { class: 'form-sec' },
      h('h3', null, h('span', { class: 'num' }, '01'), 'Your business'),
      h('div', { class: 'form-grid' },
        text('businessName', 'Business name', { placeholder: 'Lotus Boutique' }),
        select('category', 'Business type', catOptions),
        text('product', 'What do you sell?', { placeholder: 'Handmade soy candles', max: 80, span2: true, hint: 'A few words is enough. This is what your ads will talk about.' }),
        select('region', 'Where do you advertise?', regionOptions),
        select('scope', 'Who can buy from you?', Object.entries(SCOPES)),
        text('city', 'City or area', { placeholder: 'Pune', hint: 'Used for local targeting and in your ads.' }),
        text('targetNote', 'Who is your ideal customer?', { placeholder: 'Women 22 to 35 who love ethnic wear', max: 120, optional: true, hint: 'Optional. We read ages and groups from this.' }))),
    h('div', { class: 'form-sec' },
      h('h3', null, h('span', { class: 'num' }, '02'), 'Your goal and money'),
      h('div', { class: 'form-grid' },
        h('div', { class: 'field span-2' }, h('span', { class: 'lab' }, 'Main goal'), goalRadios),
        money('monthlyBudget', 'Monthly ad budget', { placeholder: '15000', hint: 'The most you are willing to spend in 30 days.' }),
        money('aov', 'Average sale value', { placeholder: '1200', hint: 'What one customer typically spends with you.' }),
        percent('margin', 'Profit margin', { hint: 'Of each sale, how much is left after costs? Guess if unsure.' }),
        select('tone', 'Ad tone', Object.entries(TONES)))),
    h('div', { class: 'form-sec' },
      h('h3', null, h('span', { class: 'num' }, '03'), 'What your ads should say'),
      h('div', { class: 'form-grid' },
        text('offer', 'Offer', { placeholder: '20% off', max: 40, optional: true, hint: 'Only if you really have one. It goes on your poster badge.' }),
        text('cta', 'Button text', { placeholder: 'Shop now', max: 24, optional: true }),
        text('sellingPoints', 'Real selling points', { placeholder: 'Free delivery over 999, Easy exchange', max: 130, span2: true, optional: true, hint: 'Separate with commas (up to 3). We never invent guarantees or delivery promises, so add the ones that are true.' }),
        text('contact', 'How customers reach you', { placeholder: '@yourshop, phone or website', max: 40, optional: true }),
        field('brandColor', 'Brand colour', h('input', { type: 'color', value: '#22e4ff' }), {}),
        h('div', { class: 'field' }),
        imagePicker('image', 'Product photo', 'Used on your poster and video. Stays on your device.'),
        imagePicker('logo', 'Logo', 'A transparent PNG works best.'))),
    h('div', { class: 'submit-row' },
      h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, icon('bolt', 20), 'Launch AI engine'),
      h('label', { class: 'ai-toggle', id: 'ai-toggle', hidden: true },
        h('input', { type: 'checkbox', id: 'ai-enabled', checked: true, onChange: (e) => { app.state.ai.enabled = e.target.checked; } }),
        h('span', null, 'Polish copy with Claude ', h('span', { class: 'muted' }, '(uses a few cents of API credit)')))));

  const samples = h('div', { class: 'samples' },
    SAMPLES.map((s) => h('button', { class: 'btn btn-sm', type: 'button', onClick: () => { setRaw(s.values); toast(`Loaded example: ${s.label}`); } }, s.label)));

  root.append(
    h('div', { class: 'hero' },
      h('div', { class: 'eyebrow' }, 'AI ad studio for small business'),
      h('h1', null, 'Ads that find the right people, ', h('em', null, 'on a small budget.')),
      h('p', null, 'Tell us about your business once. In about a minute you get your target audience, where to spend every rupee or dollar, ready-to-post posters, and a video ad. Then learn what CTR, CPC and ROAS really mean for you.'),
      h('div', { class: 'hero-points' }, ['No design or marketing skills needed', 'Video ready in about 15 seconds', 'Zero cost per poster or video', 'Your photos never leave your device'].map((t) => h('span', null, t)))),
    h('div', { class: 'brief-grid' },
      h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', null, 'Your brief'), h('span', { class: 'muted small' }, 'Takes about 2 minutes')), samples, form),
      h('aside', { class: 'stack' },
        h('div', { class: 'card side-card' },
          h('h3', null, 'What you will get'),
          h('ul', null,
            h('li', null, 'Who to target, with age, interests, radius and best hours'),
            h('li', null, 'A budget split across Instagram, Facebook, Google and YouTube'),
            h('li', null, 'Honest forecasts with your break-even point'),
            h('li', null, 'Posters in 4 sizes and a music-backed video ad'),
            h('li', null, 'A coach that tells you to scale, fix or pause')),
          h('p', { class: 'note' }, 'Numbers are estimates from public industry benchmarks, never promises.')))));

  function getRaw() {
    const o = {};
    for (const [name, { control }] of Object.entries(fields)) o[name] = control.value;
    o.goal = form.querySelector('input[name="goal"]:checked')?.value || 'sales';
    return o;
  }

  function setRaw(v) {
    for (const [name, { control }] of Object.entries(fields)) if (v[name] != null) control.value = String(v[name]);
    const radio = form.querySelector(`input[name="goal"][value="${v.goal}"]`);
    if (radio) radio.checked = true;
    updateCurrency();
    setErrors({});
  }

  function updateCurrency() {
    const r = REGIONS[fields.region.control.value];
    if (r) for (const span of currencySpans) span.textContent = r.symbol;
  }
  fields.region.control.addEventListener('change', updateCurrency);
  fields.category.control.value = '';
  fields.margin.control.value = '40';
  updateCurrency();

  function setErrors(errors) {
    let first = null;
    for (const [name, { control, err }] of Object.entries(fields)) {
      const msg = errors[name];
      err.hidden = !msg;
      clear(err);
      if (msg) {
        err.append(icon('alert', 14), msg);
        control.setAttribute('aria-invalid', 'true');
        first ||= control;
      } else control.removeAttribute('aria-invalid');
    }
    first?.focus();
  }

  function setAi(available) {
    form.querySelector('#ai-toggle').hidden = !available;
  }

  return { getRaw, setRaw, setErrors, setAi };
}
