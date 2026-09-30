// Poster / static ad renderer. Draws a complete ad onto a <canvas> from a
// small spec. Five themes share one layout engine that adapts to every ad
// format (feed, portrait, story with safe zones, landscape).

import { makeRng } from '../engine/rng.js';
import {
  HEAVY, SANS, SERIF, contrast, drawArrow, drawContain, drawCover, drawLines, drawPin, fitText, fontStr, hexToRgb,
  initials, inkOn, keyWord, luminance, mix, rgbToHex, hslToRgb, rgbToHsl, rgba, roundRectPath, shiftHue, starburstPath,
} from './draw.js';

export const FORMATS = {
  square: { id: 'square', label: 'Square 1:1', w: 1080, h: 1080, where: 'Instagram & Facebook feed' },
  portrait: { id: 'portrait', label: 'Portrait 4:5', w: 1080, h: 1350, where: 'Instagram feed (most screen space)' },
  story: { id: 'story', label: 'Story 9:16', w: 1080, h: 1920, where: 'Stories, Reels cover, Shorts' },
  landscape: { id: 'landscape', label: 'Landscape 1.91:1', w: 1200, h: 628, where: 'Facebook link ads, Google display' },
};

export const THEMES = {
  aurora: { label: 'Neon Future', dark: true },
  bold: { label: 'Bold Pop', dark: false },
  elegant: { label: 'Soft Luxe', dark: false },
  fresh: { label: 'Fresh Clean', dark: false },
  spotlight: { label: 'Spotlight', dark: true },
};

// ---- palette ----------------------------------------------------------------

/** Nudge a colour's lightness until it reads (>= min contrast) on the background. */
function ensureContrast(fg, bg, min) {
  let [h, s, l] = rgbToHsl(hexToRgb(fg));
  const dir = luminance(bg) < 0.4 ? 1 : -1;
  for (let i = 0; i < 40 && contrast(rgbToHex(hslToRgb([h, s, l])), bg) < min; i++) l = Math.min(0.97, Math.max(0.03, l + dir * 0.02));
  return rgbToHex(hslToRgb([h, s, l]));
}

export function themePalette(theme, brand) {
  switch (theme) {
    case 'aurora': {
      const bg1 = '#060918';
      const accent = ensureContrast(brand, bg1, 5);
      return { bg1, bg2: mix('#0d1236', accent, 0.16), ink: '#ffffff', soft: 'rgba(255,255,255,0.74)', accent, accent2: shiftHue(accent, 62), onAccent: inkOn(accent), panel: 'rgba(255,255,255,0.07)' };
    }
    case 'bold': {
      const [h, s, l] = rgbToHsl(hexToRgb(brand));
      const bg1 = rgbToHex(hslToRgb([h, Math.max(0.65, s), Math.min(0.55, Math.max(0.42, l))]));
      const ink = inkOn(bg1);
      const accent = ink === '#ffffff' ? '#ffe14d' : '#ffffff';
      return { bg1, bg2: shiftHue(bg1, -22, 1, -0.12), ink, soft: ink === '#ffffff' ? 'rgba(255,255,255,0.86)' : 'rgba(11,15,31,0.8)', accent, accent2: shiftHue(bg1, 150, 1, 0.1), onAccent: inkOn(accent), btn: ink === '#ffffff' ? '#0b0f1f' : '#ffffff', onBtn: ink === '#ffffff' ? '#ffe14d' : '#0b0f1f', panel: 'rgba(255,255,255,0.14)' };
    }
    case 'elegant': {
      const bg1 = '#f8f1e7';
      const accent = ensureContrast(shiftHue(brand, 0, 0.75, -0.06), bg1, 4.5);
      return { bg1, bg2: '#eadfce', ink: '#2a2118', soft: 'rgba(42,33,24,0.72)', accent, accent2: '#b48a4d', onAccent: inkOn(accent), panel: 'rgba(42,33,24,0.05)' };
    }
    case 'fresh': {
      const bg1 = mix(brand, '#ffffff', 0.92);
      const accent = ensureContrast(brand, '#ffffff', 3);
      return { bg1, bg2: mix(brand, '#ffffff', 0.8), ink: '#0f172a', soft: 'rgba(15,23,42,0.72)', accent, accent2: shiftHue(accent, -45), onAccent: inkOn(accent), panel: 'rgba(15,23,42,0.05)' };
    }
    default: {
      const bg1 = '#05060f';
      const accent = ensureContrast(brand, bg1, 5);
      return { bg1, bg2: '#141a33', ink: '#ffffff', soft: 'rgba(255,255,255,0.8)', accent, accent2: shiftHue(accent, 50), onAccent: inkOn(accent), panel: 'rgba(255,255,255,0.1)' };
    }
  }
}

export const STYLE = {
  aurora: { head: SANS, headW: 800, align: 'left', upper: false },
  bold: { head: HEAVY, headW: 900, align: 'left', upper: true },
  elegant: { head: SERIF, headW: 700, align: 'center', upper: false },
  fresh: { head: SANS, headW: 800, align: 'left', upper: false },
  spotlight: { head: SANS, headW: 800, align: 'left', upper: false },
};

// ---- backgrounds -------------------------------------------------------------

function glow(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function sparkle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

function blob(ctx, cx, cy, r, rng, color) {
  const n = 7;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    const rr = r * rng.range(0.72, 1.12);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n];
    const p1 = pts[i];
    const mx = (p0[0] + p1[0]) / 2;
    const my = (p0[1] + p1[1]) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.quadraticCurveTo(p0[0], p0[1], mx, my);
  }
  ctx.closePath();
  ctx.fill();
}

export const BACKGROUNDS = {
  aurora(ctx, W, H, pal, rng) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, pal.bg1);
    g.addColorStop(1, pal.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const big = Math.max(W, H);
    glow(ctx, W * rng.range(0.7, 1), H * rng.range(0, 0.25), big * 0.6, pal.accent, 0.4);
    glow(ctx, W * rng.range(0, 0.25), H * rng.range(0.7, 1), big * 0.55, pal.accent2, 0.32);
    glow(ctx, W * 0.5, H * rng.range(0.35, 0.55), big * 0.5, '#7c3aed', 0.22);
    // perspective grid floor
    const horizon = H * 0.66;
    ctx.save();
    ctx.strokeStyle = rgba(pal.accent, 0.16);
    ctx.lineWidth = Math.max(1, W * 0.0018);
    for (let i = 1; i <= 12; i++) {
      const y = horizon + (H - horizon) * (i / 12) ** 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (let i = -14; i <= 14; i++) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + i * W * 0.02, horizon);
      ctx.lineTo(W / 2 + i * W * 0.16, H);
      ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rng.range(0.15, 0.8)})`;
      ctx.beginPath();
      ctx.arc(rng.range(0, W), rng.range(0, H * 0.7), rng.range(0.6, 2.2) * (W / 1080), 0, Math.PI * 2);
      ctx.fill();
    }
  },
  bold(ctx, W, H, pal, rng) {
    ctx.fillStyle = pal.bg1;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = pal.bg2;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.58);
    ctx.lineTo(W, H * 0.3);
    ctx.lineTo(W, H * 0.62);
    ctx.lineTo(0, H * 0.94);
    ctx.closePath();
    ctx.fill();
    // halftone dots, top-right
    ctx.fillStyle = rgba(pal.ink, 0.13);
    const step = W * 0.028;
    for (let y = 0; y < H * 0.34; y += step) {
      for (let x = W * 0.55; x < W; x += step) {
        const d = Math.hypot(x - W, y) / (W * 0.6);
        const r = Math.max(0, (1 - d) * step * 0.42);
        if (r > 0.6) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.strokeStyle = rgba(pal.ink, 0.22);
    ctx.lineWidth = W * 0.012;
    ctx.beginPath();
    ctx.arc(rng.range(0, W * 0.2), H * rng.range(0.78, 0.95), W * 0.26, 0, Math.PI * 2);
    ctx.stroke();
  },
  elegant(ctx, W, H, pal, rng, m) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal.bg1);
    g.addColorStop(1, pal.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 2200; i++) {
      ctx.fillStyle = `rgba(90,70,40,${rng.range(0.02, 0.06)})`;
      ctx.fillRect(rng.range(0, W), rng.range(0, H), 1.4, 1.4);
    }
    ctx.strokeStyle = pal.accent2;
    ctx.lineWidth = Math.max(1.5, W * 0.002);
    ctx.strokeRect(m * 0.4, m * 0.4, W - m * 0.8, H - m * 0.8);
    ctx.globalAlpha = 0.55;
    ctx.strokeRect(m * 0.4 + 10, m * 0.4 + 10, W - m * 0.8 - 20, H - m * 0.8 - 20);
    ctx.globalAlpha = 1;
  },
  fresh(ctx, W, H, pal, rng) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, pal.bg1);
    g.addColorStop(1, pal.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const big = Math.max(W, H);
    blob(ctx, W * rng.range(0.75, 1), H * rng.range(0.05, 0.25), big * 0.32, rng, rgba(pal.accent, 0.16));
    blob(ctx, W * rng.range(0, 0.2), H * rng.range(0.7, 0.95), big * 0.3, rng, rgba(pal.accent2, 0.18));
    blob(ctx, W * rng.range(0.4, 0.6), H * rng.range(0.4, 0.6), big * 0.2, rng, rgba(pal.accent, 0.07));
    ctx.fillStyle = rgba(pal.accent, 0.35);
    const step = W * 0.03;
    for (let y = H * 0.03; y < H * 0.16; y += step) for (let x = W * 0.05; x < W * 0.22; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, W * 0.0022, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  spotlight(ctx, W, H, pal, rng) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal.bg2);
    g.addColorStop(1, pal.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    glow(ctx, W * 0.5, H * 0.18, Math.max(W, H) * 0.7, '#ffffff', 0.16);
    glow(ctx, W * rng.range(0.6, 0.9), H * 0.4, Math.max(W, H) * 0.5, pal.accent, 0.22);
  },
};

// ---- hero art (used when no product photo is provided) ----------------------

export function heroArt(ctx, r, pal, rng, product, avoidRight = false) {
  const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  g.addColorStop(0, pal.accent);
  g.addColorStop(1, pal.accent2);
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const cx = r.x + r.w * rng.range(0.4, 0.6);
  const cy = r.y + r.h * rng.range(0.4, 0.6);
  const style = rng.int(0, 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = Math.max(2, r.w * 0.006);
  if (style === 0) {
    for (let i = 1; i <= 7; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(r.w, r.h) * 0.12 * i, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (style === 1) {
    for (let i = -12; i < 22; i++) {
      ctx.beginPath();
      ctx.moveTo(r.x + i * r.w * 0.09, r.y + r.h);
      ctx.lineTo(r.x + i * r.w * 0.09 + r.h * 0.6, r.y);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    const step = Math.min(r.w, r.h) * 0.09;
    for (let y = r.y + step / 2; y < r.y + r.h; y += step) for (let x = r.x + step / 2; x < r.x + r.w; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, step * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  glow(ctx, cx, cy, Math.min(r.w, r.h) * 0.75, '#ffffff', 0.35);
  // Oversized product word, clipped by the frame: on-brand and never blank.
  const word = keyWord(product);
  let size = r.h * 0.44;
  ctx.font = fontStr(900, size, HEAVY);
  const wpx = ctx.measureText(word).width;
  const maxWord = r.w * (avoidRight ? 0.68 : 0.94);
  if (wpx > maxWord) size *= maxWord / wpx;
  ctx.font = fontStr(900, size, HEAVY);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = size * 0.12;
  ctx.fillText(word, r.x + r.w * (avoidRight ? 0.4 : 0.5), r.y + r.h * 0.66);
  ctx.shadowBlur = 0;
  for (let i = 0; i < 5; i++) sparkle(ctx, r.x + rng.range(0.08, 0.92) * r.w, r.y + rng.range(0.1, 0.9) * r.h, rng.range(0.018, 0.05) * r.w, 'rgba(255,255,255,0.9)');
}

// ---- layout ------------------------------------------------------------------

function computeLayout(ctx, spec, fmt, style) {
  const { w: W, h: H } = fmt;
  const wide = W / H > 1.3;
  const spot = spec.theme === 'spotlight';
  const centered = style.align === 'center';
  const m = wide ? H * 0.09 : W * 0.07;
  const safeTop = fmt.id === 'story' ? H * 0.125 : 0;
  const safeBot = fmt.id === 'story' ? H * 0.16 : 0;
  const y0 = m + safeTop;
  const y1 = H - m - safeBot;
  const gap = (wide ? H : W) * 0.024;

  const bh = wide ? H * 0.1 : W * 0.072;
  const ch = wide ? H * 0.125 : W * 0.092;
  const leftW = W * 0.535 - m;
  const brand = { x: m, y: y0, w: wide ? leftW : W - 2 * m, h: bh };

  const contactH = centered && (spec.contact || spec.city) ? (wide ? H * 0.06 : W * 0.042) : 0;
  const footerH = ch + (contactH ? gap * 0.8 + contactH : 0);
  const footer = { x: m, y: y1 - footerH, w: wide ? leftW : W - 2 * m, h: footerH, ctaH: ch };

  let textW = W - 2 * m;
  let textX = m;
  if (wide) textW = leftW;

  const headText = spec.headline || spec.biz;
  const headMaxH = wide ? (H - 2 * m) * 0.4 : (y1 - y0) * (spot ? 0.3 : 0.23);
  const headline = fitText(ctx, style.upper ? headText.toUpperCase() : headText, {
    maxW: textW, maxH: headMaxH, weight: style.headW, family: style.head,
    maxSize: wide ? H * 0.135 : W * (spot ? 0.115 : 0.096), minSize: W * 0.04, lineHeight: style.upper ? 1.02 : 1.08, maxLines: 4, balance: true,
  });
  const sub = spec.sub
    ? fitText(ctx, spec.sub, { maxW: textW, maxH: (wide ? H * 0.2 : W * 0.1), weight: 500, family: SANS, maxSize: wide ? H * 0.052 : W * 0.033, minSize: W * 0.02, lineHeight: 1.3, maxLines: 2, balance: true })
    : null;

  const textH = headline.height + (sub ? gap * 0.9 + sub.height : 0);
  let visual = null;
  let textY;
  if (wide) {
    visual = spot ? null : { x: W * 0.575, y: m, w: W - m - W * 0.575, h: H - 2 * m };
    const avail = footer.y - gap - (brand.y + brand.h + gap);
    textY = brand.y + brand.h + gap + Math.max(0, (avail - textH) / 2);
  } else if (spot) {
    textY = footer.y - gap * 1.2 - textH;
  } else {
    textY = footer.y - gap - textH;
    const top = brand.y + brand.h + gap;
    visual = { x: m, y: top, w: W - 2 * m, h: Math.max(W * 0.22, textY - gap - top) };
    textY = visual.y + visual.h + gap;
  }
  return { W, H, m, wide, spot, centered, gap, brand, footer, headline, sub, textX, textW, textY, visual, safeTop };
}

// ---- pieces ------------------------------------------------------------------

function drawBrand(ctx, L, spec, pal, style) {
  const { brand, W, gap } = L;
  ctx.save();
  let x = brand.x;
  const cx = L.centered ? W / 2 : null;
  const size = brand.h;
  if (spec.logo) {
    const lw = drawContain(ctx, spec.logo, L.centered ? cx - size * 1.5 : x, brand.y, size * 3, size, L.centered ? 'center' : 'left');
    x += lw + gap;
    if (L.centered) {
      ctx.restore();
      return;
    }
  }
  const name = spec.biz;
  const nameMax = brand.w * (spec.city && !L.centered ? 0.58 : 0.9) - (x - brand.x);
  if (!spec.logo) {
    // monogram tile
    ctx.fillStyle = spec.theme === 'bold' ? pal.btn : pal.accent;
    roundRectPath(ctx, x, brand.y, size, size, size * 0.28);
    ctx.fill();
    ctx.fillStyle = spec.theme === 'bold' ? pal.onBtn : pal.onAccent;
    ctx.font = fontStr(800, size * 0.44, SANS);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(name), x + size / 2, brand.y + size / 2 + size * 0.02);
    x += size + gap * 0.7;
  }
  const f = fitText(ctx, name, { maxW: nameMax, maxH: size, weight: style.head === SERIF ? 700 : 800, family: style.head === HEAVY ? SANS : style.head, maxSize: size * 0.52, minSize: size * 0.28, lineHeight: 1, maxLines: 1 });
  ctx.fillStyle = pal.ink;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = fontStr(f.weight, f.size, f.family);
  ctx.fillText(name, x, brand.y + size / 2 + 1);
  if (spec.city && !L.centered) {
    const t = spec.city;
    ctx.font = fontStr(600, size * 0.36, SANS);
    const tw = ctx.measureText(t).width;
    const rx = brand.x + brand.w;
    ctx.textAlign = 'right';
    ctx.fillStyle = pal.soft;
    ctx.fillText(t, rx, brand.y + size / 2 + 1);
    drawPin(ctx, rx - tw - size * 0.3, brand.y + size / 2 + size * 0.12, size * 0.36, pal.accent);
  }
  ctx.restore();
}

function visualPath(ctx, r, theme) {
  if (theme === 'elegant') {
    const rad = Math.min(r.w / 2, r.h * 0.55);
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + r.h);
    ctx.lineTo(r.x, r.y + rad);
    ctx.arc(r.x + rad, r.y + rad, rad, Math.PI, 0);
    ctx.arc(r.x + r.w - rad, r.y + rad, rad, Math.PI, 0);
    ctx.lineTo(r.x + r.w, r.y + r.h);
    ctx.closePath();
    // Full-width arch: when the box is wider than 2*rad, flatten into a soft rounded top.
    if (r.w > rad * 2.4) roundRectPath(ctx, r.x, r.y, r.w, r.h, [r.h * 0.45, r.h * 0.45, 24, 24]);
    return;
  }
  const radius = theme === 'bold' ? r.w * 0.03 : theme === 'aurora' ? r.w * 0.045 : r.w * 0.06;
  roundRectPath(ctx, r.x, r.y, r.w, r.h, radius);
}

function drawVisual(ctx, L, spec, pal, rng) {
  const r = L.visual;
  const t = spec.theme;
  ctx.save();
  // frame under-layer (shadow / glow)
  if (t === 'bold') {
    const o = L.W * 0.014;
    visualPath(ctx, { ...r, x: r.x + o, y: r.y + o }, t);
    ctx.fillStyle = pal.btn;
    ctx.fill();
  } else if (t === 'aurora') {
    visualPath(ctx, r, t);
    ctx.shadowColor = rgba(pal.accent, 0.65);
    ctx.shadowBlur = L.W * 0.04;
    ctx.fillStyle = pal.bg1;
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (t === 'fresh') {
    visualPath(ctx, r, t);
    ctx.shadowColor = 'rgba(15,23,42,0.22)';
    ctx.shadowBlur = L.W * 0.04;
    ctx.shadowOffsetY = L.W * 0.012;
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowColor = 'transparent';
  }
  ctx.restore();

  ctx.save();
  const inset = t === 'fresh' ? L.W * 0.01 : 0;
  const inner = { x: r.x + inset, y: r.y + inset, w: r.w - 2 * inset, h: r.h - 2 * inset };
  visualPath(ctx, inner, t);
  ctx.clip();
  if (spec.image) drawCover(ctx, spec.image, inner.x, inner.y, inner.w, inner.h);
  else heroArt(ctx, inner, pal, rng, spec.product || spec.biz, Boolean(spec.offer));
  ctx.restore();

  ctx.save();
  visualPath(ctx, r, t);
  if (t === 'aurora') {
    ctx.strokeStyle = rgba(pal.accent, 0.9);
    ctx.lineWidth = Math.max(2, L.W * 0.003);
    ctx.stroke();
  } else if (t === 'bold') {
    ctx.strokeStyle = pal.btn;
    ctx.lineWidth = L.W * 0.008;
    ctx.stroke();
  } else if (t === 'elegant') {
    ctx.strokeStyle = pal.accent2;
    ctx.lineWidth = Math.max(2, L.W * 0.003);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHeadlineBlock(ctx, L, spec, pal, style) {
  const align = L.centered ? 'center' : 'left';
  const x = L.centered ? L.textX + L.textW / 2 : L.textX;
  ctx.save();
  ctx.fillStyle = pal.ink;
  if (L.spot) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = L.W * 0.02;
  }
  if ('letterSpacing' in ctx && style.upper) ctx.letterSpacing = `${L.headline.size * 0.005}px`;
  let y = drawLines(ctx, L.headline, x, L.textY, align);
  ctx.restore();
  if (L.sub) {
    ctx.save();
    ctx.fillStyle = pal.soft;
    if (L.spot) {
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = L.W * 0.012;
    }
    drawLines(ctx, L.sub, x, y + L.gap * 0.9, align);
    ctx.restore();
  }
  // Accent underline on left-aligned themes
  if (!L.centered && spec.theme !== 'bold') {
    ctx.fillStyle = pal.accent;
    roundRectPath(ctx, L.textX, L.textY - L.gap * (L.wide ? 0.9 : 0.55), L.W * 0.09, Math.max(4, L.W * 0.006), 4);
    ctx.fill();
  }
}

function drawBadge(ctx, L, spec, pal, rng) {
  if (!spec.offer) return;
  const t = spec.theme;
  const { W, H } = L;
  let d = Math.min(L.wide ? H * 0.3 : W * 0.27, (L.visual ? L.visual.h : H * 0.3) * 0.75);
  let cx;
  let cy;
  if (L.spot) {
    d = L.wide ? H * 0.3 : W * 0.26;
    cx = W - L.m - d * 0.5;
    cy = L.brand.y + L.brand.h + d * 0.65;
  } else {
    cx = L.visual.x + L.visual.w - d * 0.52;
    cy = L.visual.y + d * (t === 'bold' ? 0.5 : 0.44);
  }
  const rot = t === 'elegant' ? 0 : -0.14;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  let fill;
  let ink;
  if (t === 'bold') {
    starburstPath(ctx, 0, 0, d * 0.56, d * 0.44, 16);
    fill = pal.accent;
    ink = pal.onAccent;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowOffsetY = d * 0.03;
  } else if (t === 'aurora' || t === 'spotlight') {
    ctx.beginPath();
    ctx.arc(0, 0, d * 0.5, 0, Math.PI * 2);
    fill = pal.accent;
    ink = pal.onAccent;
    ctx.shadowColor = rgba(pal.accent, 0.7);
    ctx.shadowBlur = d * 0.25;
  } else if (t === 'elegant') {
    ctx.beginPath();
    ctx.arc(0, 0, d * 0.5, 0, Math.PI * 2);
    fill = pal.ink;
    ink = '#f8f1e7';
  } else {
    roundRectPath(ctx, -d * 0.5, -d * 0.36, d, d * 0.72, d * 0.36);
    fill = pal.accent;
    ink = pal.onAccent;
    ctx.shadowColor = 'rgba(15,23,42,0.25)';
    ctx.shadowBlur = d * 0.15;
    ctx.shadowOffsetY = d * 0.05;
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (t === 'elegant') {
    ctx.strokeStyle = pal.accent2;
    ctx.lineWidth = Math.max(2, d * 0.02);
    ctx.beginPath();
    ctx.arc(0, 0, d * 0.44, 0, Math.PI * 2);
    ctx.stroke();
  }
  const box = t === 'fresh' ? { w: d * 0.8, h: d * 0.48 } : { w: d * 0.68, h: d * 0.56 };
  const f = fitText(ctx, spec.offer, { maxW: box.w, maxH: box.h, weight: t === 'elegant' ? 700 : 900, family: t === 'elegant' ? SERIF : t === 'bold' ? HEAVY : SANS, maxSize: d * 0.3, minSize: d * 0.1, lineHeight: 1.05, maxLines: 3 });
  ctx.fillStyle = ink;
  drawLines(ctx, f, 0, -f.height / 2, 'center');
  ctx.restore();
}

function drawFooter(ctx, L, spec, pal) {
  const { footer, W } = L;
  const t = spec.theme;
  const label = spec.cta || 'Learn more';
  const size = footer.ctaH * 0.4;
  ctx.font = fontStr(800, size, SANS);
  const tw = ctx.measureText(label).width;
  const arrow = size * 0.9;
  const bw = tw + arrow + size * 2.3;
  const bx = L.centered ? W / 2 - bw / 2 : footer.x;
  const by = footer.y;
  ctx.save();
  let fill = pal.accent;
  let ink = pal.onAccent;
  if (t === 'aurora') {
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, pal.accent);
    g.addColorStop(1, pal.accent2);
    fill = g;
    ctx.shadowColor = rgba(pal.accent, 0.6);
    ctx.shadowBlur = footer.ctaH * 0.5;
    ink = inkOn(pal.accent);
  } else if (t === 'bold') {
    fill = pal.btn;
    ink = pal.onBtn;
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowOffsetY = footer.ctaH * 0.08;
  } else if (t === 'elegant') {
    fill = pal.ink;
    ink = '#f8f1e7';
  } else if (t === 'fresh') {
    ctx.shadowColor = rgba(pal.accent, 0.45);
    ctx.shadowBlur = footer.ctaH * 0.4;
    ctx.shadowOffsetY = footer.ctaH * 0.1;
  }
  roundRectPath(ctx, bx, by, bw, footer.ctaH, footer.ctaH / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = ink;
  ctx.font = fontStr(800, size, SANS);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, bx + size * 0.9, by + footer.ctaH / 2 + 1);
  drawArrow(ctx, bx + bw - size * 0.9 - arrow / 2, by + footer.ctaH / 2, arrow, ink, Math.max(3, size * 0.12));

  // contact / city
  const bits = spec.contact ? [spec.contact] : [];
  if (!bits.length && !(L.centered && spec.city)) return;
  if (L.centered) {
    const line = [spec.contact, spec.city].filter(Boolean).join('   ·   ');
    const f = fitText(ctx, line, { maxW: footer.w, maxH: footer.h - footer.ctaH, weight: 600, family: SANS, maxSize: W * 0.03, minSize: W * 0.018, lineHeight: 1, maxLines: 1 });
    ctx.fillStyle = pal.soft;
    drawLines(ctx, f, W / 2, footer.y + footer.ctaH + L.gap * 0.8, 'center');
  } else {
    const rx = footer.x + footer.w;
    const room = rx - (bx + bw + L.gap * 1.2);
    if (room < W * 0.16) return;
    const f = fitText(ctx, spec.contact, { maxW: room, maxH: footer.ctaH, weight: 700, family: SANS, maxSize: footer.ctaH * 0.36, minSize: footer.ctaH * 0.2, lineHeight: 1, maxLines: 1 });
    ctx.fillStyle = pal.ink;
    ctx.textBaseline = 'middle';
    ctx.font = fontStr(f.weight, f.size, f.family);
    ctx.textAlign = 'right';
    ctx.fillText(spec.contact, rx, footer.y + footer.ctaH / 2 + 1);
  }
}

// ---- main --------------------------------------------------------------------

/**
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {{format:string, theme:string, headline:string, sub?:string, offer?:string, cta?:string,
 *   biz:string, product?:string, city?:string, contact?:string, brandColor:string,
 *   image?:CanvasImageSource, logo?:CanvasImageSource, seed?:number|string}} spec
 */
export function renderPoster(canvas, spec) {
  const fmt = FORMATS[spec.format] || FORMATS.square;
  const theme = THEMES[spec.theme] ? spec.theme : 'aurora';
  spec = { ...spec, theme };
  canvas.width = fmt.w;
  canvas.height = fmt.h;
  const ctx = canvas.getContext('2d');
  const style = STYLE[theme];
  const pal = themePalette(theme, spec.brandColor || '#22e4ff');
  const rng = makeRng(`${spec.seed ?? 1}|${theme}|${fmt.id}`);

  ctx.clearRect(0, 0, fmt.w, fmt.h);
  const L = computeLayout(ctx, spec, fmt, style);

  BACKGROUNDS[theme](ctx, fmt.w, fmt.h, pal, rng, L.m);

  if (L.spot) {
    if (spec.image) {
      ctx.save();
      drawCover(ctx, spec.image, 0, 0, fmt.w, fmt.h);
      const top = ctx.createLinearGradient(0, 0, 0, fmt.h);
      top.addColorStop(0, 'rgba(0,0,0,0.5)');
      top.addColorStop(0.28, 'rgba(0,0,0,0.05)');
      top.addColorStop(0.5, 'rgba(0,0,0,0.25)');
      top.addColorStop(1, 'rgba(0,0,0,0.9)');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, fmt.w, fmt.h);
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = rgba(pal.accent, 0.35);
      ctx.fillRect(0, 0, fmt.w, fmt.h);
      ctx.restore();
    } else {
      const r = { x: 0, y: 0, w: fmt.w, h: fmt.h * 0.72 };
      ctx.save();
      ctx.globalAlpha = 0.9;
      heroArt(ctx, r, pal, rng, spec.product || spec.biz);
      ctx.restore();
      const fade = ctx.createLinearGradient(0, fmt.h * 0.25, 0, fmt.h);
      fade.addColorStop(0, 'rgba(5,6,15,0)');
      fade.addColorStop(0.7, 'rgba(5,6,15,0.92)');
      fade.addColorStop(1, 'rgba(5,6,15,0.98)');
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, fmt.w, fmt.h);
    }
  } else {
    drawVisual(ctx, L, spec, pal, rng);
  }

  drawBrand(ctx, L, spec, pal, style);
  drawHeadlineBlock(ctx, L, spec, pal, style);
  drawBadge(ctx, L, spec, pal, rng);
  drawFooter(ctx, L, spec, pal);
  return { width: fmt.w, height: fmt.h, palette: pal };
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not export image'))), type, quality);
  });
}

/** Best default look for a category + tone, or the user's photo. */
export function pickTheme({ tone, themeHint, hasImage }) {
  if (tone === 'premium') return 'elegant';
  if (tone === 'bold') return hasImage ? 'spotlight' : 'bold';
  if (tone === 'playful') return 'fresh';
  if (tone === 'trust') return hasImage ? 'spotlight' : themeHint === 'aurora' ? 'aurora' : 'fresh';
  return hasImage && themeHint === 'spotlight' ? 'spotlight' : themeHint || 'aurora';
}
