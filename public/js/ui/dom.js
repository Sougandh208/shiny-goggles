// Tiny DOM toolkit. Everything user-supplied goes in via textContent /
// createTextNode; nothing here ever assigns innerHTML.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'vars') for (const [n, val] of Object.entries(v)) el.style.setProperty(n, String(val));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (['value', 'checked', 'disabled', 'selected', 'hidden', 'open'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const clear = (el) => el.replaceChildren();

// ---- icons (24x24 stroke set) ------------------------------------------------

const ICONS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  download: 'M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14',
  play: 'M8 5.5v13l11-6.5z',
  pause: 'M8 5v14M16 5v14',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  shuffle: 'M4 7h3.5c5 0 4 10 9 10H20m0 0l-3-3m3 3l-3 3M4 17h3.5c1.6 0 2.6-.9 3.4-2M20 7h-3.5c-1.6 0-2.6.9-3.4 2M20 7l-3-3m3 3l-3 3',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  plus: 'M12 5v14M5 12h14',
  alert: 'M12 4l9 16H3zM12 10v4.5M12 17.2v.1',
  arrow: 'M5 12h14m-5-5l5 5-5 5',
  image: 'M4 5h16v14H4zM4 16l4.5-4.5 4 4 3-3L20 17M15.5 9.5v.1',
  film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4',
  bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
  info: 'M12 8.2v.1M12 11.5v5M4 12a8 8 0 1016 0 8 8 0 10-16 0',
  x: 'M6 6l12 12M18 6L6 18',
  up: 'M12 19V6m0 0l-5 5m5-5l5 5',
  pause2: 'M9 5v14M15 5v14',
  stop: 'M7 7h10v10H7z',
};

export function icon(name, size = 18) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name] || ICONS.info);
  svg.append(path);
  return svg;
}

// ---- toast / tooltip ----------------------------------------------------------

export function toast(message, kind = 'info', ms = 4200) {
  const box = $('#toasts');
  const el = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  box.append(el);
  setTimeout(() => el.remove(), ms);
}

let tipEl;
/** Attach a hover/focus tooltip. `content()` returns {value, label, lines?} (all plain text). */
export function attachTip(el, content) {
  tipEl ||= $('#tip');
  const show = (x, y) => {
    const c = content();
    tipEl.replaceChildren(
      h('div', { class: 't-v' }, c.value),
      c.label ? h('div', { class: 't-s' }, c.label) : null,
      ...(c.lines || []).map((l) => h('div', { class: 't-s' }, l)),
    );
    tipEl.hidden = false;
    const r = tipEl.getBoundingClientRect();
    const nx = Math.min(window.innerWidth - r.width - 8, Math.max(8, x + 14));
    const ny = y - r.height - 14 < 8 ? y + 18 : y - r.height - 14;
    tipEl.style.left = `${nx}px`;
    tipEl.style.top = `${ny}px`;
  };
  const hide = () => { tipEl.hidden = true; };
  el.addEventListener('pointermove', (e) => show(e.clientX, e.clientY));
  el.addEventListener('pointerleave', hide);
  el.addEventListener('focus', () => {
    const r = el.getBoundingClientRect();
    show(r.left + r.width / 2, r.top);
  });
  el.addEventListener('blur', hide);
}

// ---- files ---------------------------------------------------------------------

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { 'aria-hidden': 'true' });
    ta.value = text;
    ta.style.setProperty('position', 'fixed');
    ta.style.setProperty('opacity', '0');
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('Copy is blocked in this browser');
  }
}

export const slug = (s) => (s || 'ad').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ad';

const ACCEPTED = /^image\/(png|jpe?g|webp|gif|avif)$/;
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Read a picked image entirely in the browser and downscale it. Returns a
 * canvas (a valid drawImage source) plus a small data URL for the thumbnail.
 */
export async function loadImageFile(file, maxDim = 1600) {
  if (!ACCEPTED.test(file.type)) throw new Error('Please choose a PNG, JPG, WebP or GIF image.');
  if (file.size > MAX_BYTES) throw new Error('That image is over 15 MB. Please pick a smaller one.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error('That file could not be read as an image. Try a different PNG or JPG.');
    }
    const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * s));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * s));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const thumb = document.createElement('canvas');
    const ts = 104 / Math.max(canvas.width, canvas.height);
    thumb.width = Math.max(1, Math.round(canvas.width * ts));
    thumb.height = Math.max(1, Math.round(canvas.height * ts));
    thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height);
    return { canvas, thumbUrl: thumb.toDataURL('image/png') };
  } finally {
    URL.revokeObjectURL(url);
  }
}
