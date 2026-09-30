// Video ad engine. A scene graph drawn on a canvas as a pure function of time,
// so the same code drives the live preview, the scrubber and the recording.
// Recording uses MediaRecorder on canvas.captureStream(): no server, no
// per-render cost, ready in roughly the length of the video.

import { makeRng } from '../engine/rng.js';
import {
  BACKGROUNDS, STYLE, THEMES, heroArt, themePalette,
} from './poster.js';
import {
  SANS, clamp01, drawArrow, drawCheck, drawContain, drawCover, drawPin, easeInOutCubic, easeOutBack, easeOutCubic,
  easeOutElastic, fitText, fontStr, initials, inkOn, lerp, rgba, roundRectPath, seg, starburstPath,
} from './draw.js';

export const VIDEO_FORMATS = {
  vertical: { id: 'vertical', label: 'Vertical 9:16', w: 720, h: 1280, where: 'Reels, Stories, Shorts, TikTok' },
  portrait: { id: 'portrait', label: 'Portrait 4:5', w: 720, h: 900, where: 'Instagram & Facebook feed' },
  square: { id: 'square', label: 'Square 1:1', w: 720, h: 720, where: 'Feed, WhatsApp status, Google' },
};

export const DURATIONS = [8, 12, 15, 20];

// ---- recording support ---------------------------------------------------------

const MIME_CANDIDATES = [
  ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
  ['video/mp4', 'mp4'],
  ['video/webm;codecs=vp9,opus', 'webm'],
  ['video/webm;codecs=vp8,opus', 'webm'],
  ['video/webm', 'webm'],
];

export function videoSupport() {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return { supported: false };
  for (const [mimeType, ext] of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mimeType)) return { supported: true, mimeType, ext };
  }
  return { supported: false };
}

// ---- helpers -------------------------------------------------------------------

function layoutWords(ctx, block, cx, y, align) {
  ctx.font = fontStr(block.weight, block.size, block.family);
  const space = ctx.measureText(' ').width;
  const items = [];
  block.lines.forEach((ln, li) => {
    const lw = ctx.measureText(ln).width;
    let x = align === 'center' ? cx - lw / 2 : cx;
    for (const word of ln.split(' ')) {
      const w = ctx.measureText(word).width;
      items.push({ text: word, x, y: y + li * block.size * block.lineHeight });
      x += w + space;
    }
  });
  return items;
}

function drawWords(ctx, block, items, tin, { delay = 0, stagger = 0.08, rise = 0.55 } = {}) {
  ctx.font = fontStr(block.weight, block.size, block.family);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  items.forEach((it, i) => {
    const p = seg(tin, delay + i * stagger, delay + i * stagger + 0.45);
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha *= clamp01(p * 2);
    ctx.translate(0, (1 - easeOutBack(p)) * block.size * rise);
    ctx.fillText(it.text, it.x, it.y);
    ctx.restore();
  });
}

function makeConfetti(rng, n, colors, W, H) {
  return Array.from({ length: n }, () => ({
    x: W / 2 + rng.range(-W * 0.1, W * 0.1),
    y: H * 0.42,
    vx: rng.range(-W * 0.55, W * 0.55),
    vy: rng.range(-H * 0.5, -H * 0.12),
    rot: rng.range(0, 6.28),
    vr: rng.range(-8, 8),
    size: rng.range(W * 0.012, W * 0.028),
    color: rng.pick(colors),
    round: rng.next() > 0.6,
  }));
}

function drawConfetti(ctx, list, t, H) {
  const g = H * 0.9;
  for (const p of list) {
    const x = p.x + p.vx * t * 0.6;
    const y = p.y + p.vy * t * 0.6 + 0.5 * g * t * t * 0.36;
    const a = clamp01(1 - t / 2.2);
    if (a <= 0) continue;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.rotate(p.rot + p.vr * t);
    ctx.fillStyle = p.color;
    if (p.round) {
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    ctx.restore();
  }
}

// Animated overlays drawn over the pre-rendered poster background.
const OVERLAYS = {
  aurora(ctx, W, H, pal, t, P) {
    const g1 = ctx.createRadialGradient(W * (0.5 + 0.35 * Math.sin(t * 0.5)), H * (0.3 + 0.1 * Math.cos(t * 0.4)), 0, W * 0.5, H * 0.3, W * 0.8);
    g1.addColorStop(0, rgba(pal.accent, 0.22));
    g1.addColorStop(1, rgba(pal.accent, 0));
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createRadialGradient(W * (0.3 + 0.3 * Math.cos(t * 0.35)), H * (0.75 + 0.08 * Math.sin(t * 0.6)), 0, W * 0.4, H * 0.8, W * 0.7);
    g2.addColorStop(0, rgba(pal.accent2, 0.2));
    g2.addColorStop(1, rgba(pal.accent2, 0));
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
    for (const p of P) {
      ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.5 * Math.abs(Math.sin(t * p.s + p.o))})`;
      ctx.beginPath();
      ctx.arc(p.x * W, ((p.y + t * p.v) % 1) * H, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  bold(ctx, W, H, pal, t) {
    ctx.save();
    ctx.translate(W * 0.85, H * 0.18);
    ctx.rotate(t * 0.25);
    ctx.strokeStyle = rgba(pal.ink, 0.18);
    ctx.lineWidth = W * 0.012;
    ctx.setLineDash([W * 0.05, W * 0.035]);
    ctx.beginPath();
    ctx.arc(0, 0, W * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const x = ((t * 0.22) % 1.6) * W * 1.6 - W * 0.6;
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#fff';
    ctx.transform(1, 0, -0.35, 1, 0, 0);
    ctx.fillRect(x, 0, W * 0.12, H);
    ctx.restore();
  },
  elegant(ctx, W, H, pal, t, P) {
    for (const p of P) {
      const y = (((p.y - t * p.v * 0.4) % 1) + 1) % 1;
      ctx.fillStyle = rgba(pal.accent2, 0.25 + 0.35 * Math.abs(Math.sin(t * p.s + p.o)));
      ctx.beginPath();
      ctx.arc(p.x * W + Math.sin(t * p.s + p.o) * 10, y * H, p.r * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  fresh(ctx, W, H, pal, t, P) {
    for (const p of P) {
      const y = (((p.y - t * p.v * 0.6) % 1) + 1) % 1;
      ctx.strokeStyle = rgba(pal.accent, 0.35);
      ctx.fillStyle = rgba(pal.accent, 0.08);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x * W + Math.sin(t * p.s + p.o) * 12, y * H, p.r * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  },
  spotlight(ctx, W, H, pal, t) {
    const a = Math.sin(t * 0.5) * 0.35;
    ctx.save();
    ctx.translate(W / 2, -H * 0.05);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, 0, H * 1.1);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-W * 0.03, 0);
    ctx.lineTo(W * 0.03, 0);
    ctx.lineTo(W * 0.55, H * 1.1);
    ctx.lineTo(-W * 0.55, H * 1.1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
};

// ---- video ---------------------------------------------------------------------

/**
 * Build a video from a spec. Returns { width, height, duration, draw(t), scenes }.
 * @param {HTMLCanvasElement} canvas
 * @param {{format:string, theme:string, brandColor:string, biz:string, product:string, city?:string,
 *   contact?:string, cta:string, image?:CanvasImageSource, logo?:CanvasImageSource, duration:number,
 *   scenes:{kind:string,title:string,sub?:string,chips?:string[],weight:number}[], seed?:number|string}} spec
 */
export function createVideo(canvas, spec) {
  const fmt = VIDEO_FORMATS[spec.format] || VIDEO_FORMATS.vertical;
  const W = fmt.w;
  const H = fmt.h;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const u = W / 720;
  const theme = THEMES[spec.theme] ? spec.theme : 'aurora';
  const style = STYLE[theme];
  const pal = themePalette(theme, spec.brandColor || '#22e4ff');
  const rng = makeRng(`${spec.seed ?? 1}|video|${theme}`);
  const duration = spec.duration;
  const vertical = fmt.id === 'vertical';
  const safe = { top: H * (vertical ? 0.13 : 0.08), bottom: H * (vertical ? 0.84 : 0.92), left: W * 0.08, right: W * 0.92 };
  const cx = W / 2;
  const isDark = THEMES[theme].dark;
  const ink = pal.ink;
  const btnFill = theme === 'bold' ? pal.btn : theme === 'elegant' ? pal.ink : pal.accent;
  const btnInk = theme === 'bold' ? pal.onBtn : theme === 'elegant' ? '#f8f1e7' : pal.onAccent;

  // Static background rendered once; per-frame overlays animate on top.
  const bg = document.createElement('canvas');
  bg.width = W;
  bg.height = H;
  BACKGROUNDS[theme](bg.getContext('2d'), W, H, pal, makeRng(`${spec.seed ?? 1}|${theme}|bg`), W * 0.07);

  const particles = Array.from({ length: 46 }, () => ({
    x: rng.next(), y: rng.next(), v: rng.range(0.01, 0.045), r: rng.range(0.8, 2.6) * u, s: rng.range(0.8, 2.4), o: rng.range(0, 6),
  }));

  // Hero art when there is no photo: rendered once, then panned/zoomed.
  const cardW = W - safe.left * 2;
  const cardH = Math.min(H * 0.42, cardW * 1.05);
  let hero = null;
  if (!spec.image) {
    hero = document.createElement('canvas');
    hero.width = Math.round(cardW * 1.2);
    hero.height = Math.round(cardH * 1.2);
    heroArt(hero.getContext('2d'), { x: 0, y: 0, w: hero.width, h: hero.height }, pal, makeRng(`${spec.seed ?? 1}|hero`), spec.product || spec.biz, false);
  }

  // ---- scene timeline
  const raw = spec.scenes.filter((s) => s && s.title);
  const totalW = raw.reduce((s, x) => s + (x.weight || 1), 0) || 1;
  let acc = 0;
  const scenes = raw.map((s) => {
    const dur = ((s.weight || 1) / totalW) * duration;
    const out = { ...s, start: acc, end: acc + dur, dur };
    acc += dur;
    return out;
  });
  for (const s of scenes) s.build = buildScene(s);

  function headFit(text, maxW, maxH, maxSize) {
    return fitText(ctx, style.upper ? text.toUpperCase() : text, {
      maxW, maxH, weight: style.headW, family: style.head, maxSize, minSize: 26 * u, lineHeight: style.upper ? 1.02 : 1.1, maxLines: 5, balance: true,
    });
  }

  function buildScene(s) {
    const availW = safe.right - safe.left;
    const midY = (safe.top + safe.bottom) / 2;
    switch (s.kind) {
      case 'hook': {
        const block = headFit(s.title, availW, (safe.bottom - safe.top) * 0.55, 108 * u);
        const y = midY - block.height / 2;
        const items = layoutWords(ctx, block, cx, y, 'center');
        const widest = Math.max(...block.lines.map((l) => (ctx.font = fontStr(block.weight, block.size, block.family), ctx.measureText(l).width)));
        return (tin) => {
          ctx.fillStyle = ink;
          drawWords(ctx, block, items, tin, { delay: 0.15 });
          const p = easeOutCubic(seg(tin, 0.6, 1.2));
          ctx.fillStyle = pal.accent;
          roundRectPath(ctx, cx - (widest * 0.35 * p), y + block.height + 26 * u, widest * 0.7 * p, 8 * u, 4 * u);
          ctx.fill();
        };
      }
      case 'value': {
        const cardY = safe.top + 10 * u;
        const block = headFit(s.title, availW, H * 0.12, 64 * u);
        const sub = s.sub ? fitText(ctx, s.sub, { maxW: availW, maxH: H * 0.1, weight: 500, family: SANS, maxSize: 30 * u, minSize: 20 * u, lineHeight: 1.3, maxLines: 2, balance: true }) : null;
        const textY = cardY + cardH + 34 * u;
        const items = layoutWords(ctx, block, cx, textY, 'center');
        const subY = textY + block.height + 16 * u;
        const subItems = sub ? layoutWords(ctx, sub, cx, subY, 'center') : [];
        return (tin, tout, dur) => {
          const p = easeOutCubic(seg(tin, 0, 0.6));
          ctx.save();
          ctx.translate(0, (1 - p) * 80 * u);
          ctx.globalAlpha *= p;
          // card
          ctx.save();
          roundRectPath(ctx, safe.left, cardY, cardW, cardH, 34 * u);
          ctx.shadowColor = rgba(pal.accent, isDark ? 0.5 : 0.25);
          ctx.shadowBlur = 40 * u;
          ctx.fillStyle = isDark ? pal.bg1 : '#fff';
          ctx.fill();
          ctx.restore();
          ctx.save();
          roundRectPath(ctx, safe.left, cardY, cardW, cardH, 34 * u);
          ctx.clip();
          const k = tin / dur;
          if (spec.image) drawCover(ctx, spec.image, safe.left, cardY, cardW, cardH, { zoom: 1.02 + 0.14 * k, panX: lerp(-0.4, 0.4, k), panY: 0 });
          else {
            const z = 1 + 0.08 * k;
            const dw = cardW * z;
            const dh = cardH * z;
            ctx.drawImage(hero, safe.left - (dw - cardW) * (0.3 + 0.4 * k), cardY - (dh - cardH) / 2, dw, dh);
          }
          ctx.restore();
          ctx.restore();
          ctx.fillStyle = ink;
          drawWords(ctx, block, items, tin, { delay: 0.35, stagger: 0.07, rise: 0.4 });
          if (sub) {
            ctx.fillStyle = pal.soft;
            drawWords(ctx, sub, subItems, tin, { delay: 0.7, stagger: 0.04, rise: 0.3 });
          }
        };
      }
      case 'benefits': {
        const chips = (s.chips && s.chips.length ? s.chips : [s.sub]).filter(Boolean).slice(0, 4);
        const titleBlock = fitText(ctx, s.title, { maxW: availW, maxH: H * 0.12, weight: style.headW, family: style.head, maxSize: 56 * u, minSize: 26 * u, lineHeight: 1.1, maxLines: 2, balance: true });
        const chipH = 96 * u;
        const gap = 22 * u;
        const total = titleBlock.height + 44 * u + chips.length * chipH + (chips.length - 1) * gap;
        const y0 = midY - total / 2;
        const titleItems = layoutWords(ctx, titleBlock, cx, y0, 'center');
        const chipFits = chips.map((c) => fitText(ctx, c, { maxW: availW - chipH * 1.6, maxH: chipH * 0.7, weight: 700, family: SANS, maxSize: 34 * u, minSize: 20 * u, lineHeight: 1.1, maxLines: 2 }));
        return (tin) => {
          ctx.fillStyle = ink;
          drawWords(ctx, titleBlock, titleItems, tin, { delay: 0.05 });
          chips.forEach((c, i) => {
            const p = easeOutBack(seg(tin, 0.45 + i * 0.28, 0.95 + i * 0.28));
            if (p <= 0) return;
            const y = y0 + titleBlock.height + 44 * u + i * (chipH + gap);
            ctx.save();
            ctx.globalAlpha *= clamp01(p * 1.4);
            ctx.translate((1 - p) * W * 0.5, 0);
            ctx.shadowColor = 'rgba(0,0,0,0.25)';
            ctx.shadowBlur = 24 * u;
            ctx.shadowOffsetY = 8 * u;
            roundRectPath(ctx, safe.left, y, availW, chipH, chipH / 2);
            ctx.fillStyle = isDark ? pal.panel : 'rgba(255,255,255,0.9)';
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.fillStyle = pal.accent;
            ctx.beginPath();
            ctx.arc(safe.left + chipH * 0.5, y + chipH / 2, chipH * 0.28, 0, Math.PI * 2);
            ctx.fill();
            drawCheck(ctx, safe.left + chipH * 0.5, y + chipH / 2, chipH * 0.28, pal.onAccent, 5 * u);
            const f = chipFits[i];
            ctx.fillStyle = isDark ? ink : pal.ink === '#ffffff' ? '#0b0f1f' : pal.ink;
            ctx.font = fontStr(f.weight, f.size, f.family);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            f.lines.forEach((ln, li) => ctx.fillText(ln, safe.left + chipH * 1.05, y + chipH / 2 + (li - (f.lines.length - 1) / 2) * f.size * 1.1));
            ctx.restore();
          });
        };
      }
      case 'offer': {
        const d = Math.min(W * 0.78, (safe.bottom - safe.top) * 0.5);
        const f = fitText(ctx, s.title, { maxW: d * 0.66, maxH: d * 0.52, weight: 900, family: theme === 'elegant' ? style.head : SANS, maxSize: d * 0.3, minSize: d * 0.1, lineHeight: 1.05, maxLines: 3 });
        const sub = s.sub ? fitText(ctx, s.sub, { maxW: availW, maxH: H * 0.08, weight: 600, family: SANS, maxSize: 34 * u, minSize: 20 * u, lineHeight: 1.2, maxLines: 2 }) : null;
        const conf = makeConfetti(makeRng(`${spec.seed ?? 1}|confetti`), 46, [pal.accent, pal.accent2, '#ffffff', '#ffe14d'], W, H);
        const cy = midY - (sub ? 36 * u : 0);
        const badgeInk = theme === 'elegant' ? '#f8f1e7' : pal.onAccent;
        const badgeFill = theme === 'elegant' ? pal.ink : theme === 'bold' ? pal.accent : pal.accent;
        return (tin) => {
          // rotating rays
          const rp = easeOutCubic(seg(tin, 0, 0.6));
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(tin * 0.35);
          ctx.globalAlpha *= 0.22 * rp;
          ctx.fillStyle = pal.accent2 || pal.accent;
          for (let i = 0; i < 14; i++) {
            ctx.rotate((Math.PI * 2) / 14);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(W * 0.05, -H * 0.5);
            ctx.lineTo(-W * 0.05, -H * 0.5);
            ctx.closePath();
            if (i % 2 === 0) ctx.fill();
          }
          ctx.restore();
          const p = easeOutElastic(seg(tin, 0.1, 1.0));
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(-0.12 + Math.sin(tin * 2) * 0.02);
          ctx.scale(Math.max(0.001, p), Math.max(0.001, p));
          ctx.shadowColor = rgba(pal.accent, 0.6);
          ctx.shadowBlur = 40 * u;
          if (theme === 'bold') starburstPath(ctx, 0, 0, d * 0.56, d * 0.45, 18, tin * 0.4);
          else {
            ctx.beginPath();
            ctx.arc(0, 0, d * 0.5, 0, Math.PI * 2);
          }
          ctx.fillStyle = badgeFill;
          ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.fillStyle = badgeInk;
          ctx.font = fontStr(f.weight, f.size, f.family);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          f.lines.forEach((ln, li) => ctx.fillText(ln, 0, (li - (f.lines.length - 1) / 2) * f.size * 1.05));
          ctx.restore();
          if (sub) {
            ctx.fillStyle = ink;
            ctx.globalAlpha *= easeOutCubic(seg(tin, 0.7, 1.2));
            ctx.font = fontStr(sub.weight, sub.size, sub.family);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            sub.lines.forEach((ln, li) => ctx.fillText(ln, cx, cy + d * 0.62 + li * sub.size * 1.2));
            ctx.globalAlpha = 1;
          }
          drawConfetti(ctx, conf, Math.max(0, tin - 0.15), H);
        };
      }
      default: {
        // cta
        const label = s.title;
        const btnFont = 46 * u;
        ctx.font = fontStr(800, btnFont, SANS);
        const lw = ctx.measureText(label).width;
        const arrow = btnFont * 0.9;
        const bw = Math.min(availW, lw + arrow + btnFont * 2.6);
        const bh = btnFont * 2.3;
        const by = midY - bh / 2 + 20 * u;
        const subFit = s.sub ? fitText(ctx, s.sub, { maxW: availW, maxH: H * 0.08, weight: 700, family: SANS, maxSize: 34 * u, minSize: 20 * u, lineHeight: 1.2, maxLines: 2 }) : null;
        const conf = makeConfetti(makeRng(`${spec.seed ?? 1}|confetti2`), 26, [pal.accent, pal.accent2, '#ffffff'], W, H);
        return (tin) => {
          // brand lockup
          const bp = easeOutCubic(seg(tin, 0, 0.5));
          ctx.save();
          ctx.globalAlpha *= bp;
          const nameFit = fitText(ctx, spec.biz, { maxW: availW - 90 * u, maxH: 60 * u, weight: 800, family: style.head === SANS ? SANS : style.head, maxSize: 44 * u, minSize: 22 * u, lineHeight: 1, maxLines: 1 });
          ctx.font = fontStr(nameFit.weight, nameFit.size, nameFit.family);
          const nw = ctx.measureText(spec.biz).width;
          const tile = 64 * u;
          const lockW = (spec.logo ? 0 : tile + 16 * u) + nw;
          let x = cx - lockW / 2;
          const ly = by - 130 * u;
          if (spec.logo) {
            const lw2 = drawContain(ctx, spec.logo, cx - 130 * u, ly - 90 * u, 260 * u, 90 * u, 'center');
            void lw2;
          } else {
            ctx.fillStyle = btnFill;
            roundRectPath(ctx, x, ly - tile / 2, tile, tile, tile * 0.28);
            ctx.fill();
            ctx.fillStyle = btnInk;
            ctx.font = fontStr(800, tile * 0.44, SANS);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(initials(spec.biz), x + tile / 2, ly + 2);
            x += tile + 16 * u;
          }
          ctx.fillStyle = ink;
          ctx.font = fontStr(nameFit.weight, nameFit.size, nameFit.family);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          if (!spec.logo) ctx.fillText(spec.biz, x, ly + 2);
          ctx.restore();

          // pulsing button
          const p = easeOutBack(seg(tin, 0.25, 0.85));
          const pulse = 1 + 0.045 * Math.sin(Math.max(0, tin - 0.9) * 5);
          ctx.save();
          ctx.translate(cx, by + bh / 2);
          ctx.scale(Math.max(0.001, p * pulse), Math.max(0.001, p * pulse));
          ctx.shadowColor = rgba(pal.accent, 0.7);
          ctx.shadowBlur = 36 * u;
          roundRectPath(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
          if (theme === 'aurora') {
            const g = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
            g.addColorStop(0, pal.accent);
            g.addColorStop(1, pal.accent2);
            ctx.fillStyle = g;
          } else ctx.fillStyle = btnFill;
          ctx.fill();
          ctx.shadowColor = 'transparent';
          const bi = theme === 'aurora' ? inkOn(pal.accent) : btnInk;
          ctx.fillStyle = bi;
          ctx.font = fontStr(800, btnFont, SANS);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const tx = -bw / 2 + (bw - lw - arrow - btnFont * 0.5) / 2;
          ctx.fillText(label, tx, 2 * u);
          drawArrow(ctx, tx + lw + btnFont * 0.5 + arrow / 2 + Math.sin(tin * 6) * 4 * u, 0, arrow, bi, 5 * u);
          ctx.restore();

          if (subFit) {
            ctx.save();
            ctx.globalAlpha *= easeOutCubic(seg(tin, 0.8, 1.3));
            ctx.fillStyle = ink;
            ctx.font = fontStr(subFit.weight, subFit.size, subFit.family);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const startY = by + bh + 44 * u;
            subFit.lines.forEach((ln, li) => ctx.fillText(ln, cx, startY + li * subFit.size * 1.2));
            ctx.restore();
          }
          drawConfetti(ctx, conf, Math.max(0, tin - 0.3), H);
        };
      }
    }
  }

  // Small persistent brand tag (hidden on the final card, which shows it large).
  const tagFont = fitText(ctx, spec.biz, { maxW: W * 0.5, maxH: 34 * u, weight: 800, family: SANS, maxSize: 26 * u, minSize: 16 * u, lineHeight: 1, maxLines: 1 });

  function drawTag(alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const size = 46 * u;
    const x = safe.left;
    const y = safe.top - size - 14 * u;
    if (spec.logo) drawContain(ctx, spec.logo, x, y, size * 3, size, 'left');
    else {
      ctx.fillStyle = btnFill;
      roundRectPath(ctx, x, y, size, size, size * 0.28);
      ctx.fill();
      ctx.fillStyle = btnInk;
      ctx.font = fontStr(800, size * 0.42, SANS);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials(spec.biz), x + size / 2, y + size / 2 + 1);
      ctx.fillStyle = ink;
      ctx.font = fontStr(tagFont.weight, tagFont.size, tagFont.family);
      ctx.textAlign = 'left';
      ctx.fillText(spec.biz, x + size + 12 * u, y + size / 2 + 1);
    }
    if (spec.city) {
      ctx.font = fontStr(600, 22 * u, SANS);
      const tw = ctx.measureText(spec.city).width;
      ctx.fillStyle = pal.soft;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(spec.city, safe.right, y + size / 2 + 1);
      drawPin(ctx, safe.right - tw - 16 * u, y + size / 2 + 5 * u, 22 * u, pal.accent);
    }
    ctx.restore();
  }

  function draw(t) {
    t = Math.max(0, Math.min(duration, t));
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0);
    if (spec.image) {
      ctx.save();
      drawCover(ctx, spec.image, 0, 0, W, H, { zoom: 1.06 + 0.1 * (t / duration), panX: Math.sin(t * 0.25) * 0.6, panY: Math.cos(t * 0.2) * 0.3 });
      ctx.fillStyle = isDark ? 'rgba(4,6,16,0.66)' : rgba(pal.bg1, 0.84);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    OVERLAYS[theme](ctx, W, H, pal, t, particles);

    const scene = scenes.find((s) => t >= s.start && t < s.end) || scenes.at(-1);
    if (scene) {
      const tin = t - scene.start;
      const tout = scene.end - t;
      const fadeIn = easeInOutCubic(seg(tin, 0, 0.3));
      const fadeOut = scene === scenes.at(-1) ? 1 : clamp01(tout / 0.22);
      ctx.save();
      ctx.globalAlpha = fadeIn * fadeOut;
      scene.build(tin, tout, scene.dur);
      ctx.restore();
      drawTag(scene.kind === 'cta' ? 0 : fadeIn * fadeOut);
    }
    // progress bar
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, 0, W, 6 * u);
    ctx.fillStyle = pal.accent;
    ctx.fillRect(0, 0, (W * t) / duration, 6 * u);
  }

  return { width: W, height: H, duration, draw, scenes: scenes.map(({ build, ...rest }) => rest), format: fmt };
}

// ---- recording -----------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Record the canvas in real time. `video.draw(t)` is called every animation
 * frame with the elapsed time; MediaRecorder captures the canvas stream.
 */
export async function recordVideo({ canvas, video, audio, fps = 30, onProgress, signal }) {
  const support = videoSupport();
  if (!support.supported) throw new Error('This browser cannot record video. Try recent Chrome, Edge, Safari or Firefox.');
  const stream = canvas.captureStream(fps);
  if (audio) audio.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  const recorder = new MediaRecorder(stream, {
    mimeType: support.mimeType,
    videoBitsPerSecond: 6_000_000,
    ...(audio ? { audioBitsPerSecond: 128_000 } : {}),
  });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  const finished = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = (e) => reject(e.error || new Error('Recording failed'));
  });

  video.draw(0);
  recorder.start(250);
  if (audio) await audio.start();
  const t0 = performance.now();
  await new Promise((resolve) => {
    const frame = (now) => {
      if (signal?.aborted) return resolve();
      const t = Math.min(video.duration, (now - t0) / 1000);
      video.draw(t);
      onProgress?.(t / video.duration);
      if (t >= video.duration) return resolve();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  await sleep(200); // let the encoder flush the last frame
  if (recorder.state !== 'inactive') recorder.stop();
  await finished;
  stream.getTracks().forEach((tr) => tr.stop());
  audio?.stop();
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const type = support.mimeType.split(';')[0];
  return { blob: new Blob(chunks, { type }), mimeType: type, ext: support.ext };
}
