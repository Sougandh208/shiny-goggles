// Low-level canvas helpers shared by the poster and video renderers:
// colour maths, text fitting, rounded shapes, image cover-fit, easing.

// ---- colour ---------------------------------------------------------------

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s, l];
}

export function hslToRgb([h, s, l]) {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export const shiftHue = (hex, deg, sMul = 1, lAdd = 0) => {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h + deg, Math.min(1, s * sMul), Math.max(0, Math.min(1, l + lAdd))]));
};

export const mix = (a, b, t) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
};

export const rgba = (hex, alpha) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
};

/** WCAG relative luminance. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Ink colour (near-black or white) that reads best on this background. */
export const inkOn = (bg, dark = '#0b0f1f', light = '#ffffff') =>
  contrast(bg, light) >= contrast(bg, dark) ? light : dark;

// ---- easing ---------------------------------------------------------------

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - (1 - clamp01(t)) ** 3;
export const easeInCubic = (t) => clamp01(t) ** 3;
export const easeInOutCubic = (t) => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
};
export const easeOutBack = (t) => {
  t = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
export const easeOutElastic = (t) => {
  t = clamp01(t);
  if (t === 0 || t === 1) return t;
  return 2 ** (-10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1;
};
/** Progress of a sub-interval [from, to] of t, clamped to 0..1. */
export const seg = (t, from, to) => clamp01((t - from) / (to - from));

// ---- text -----------------------------------------------------------------

export const SANS = '"Inter","Segoe UI","Helvetica Neue","Noto Sans",Arial,sans-serif';
export const SERIF = '"Playfair Display","Georgia","Times New Roman","Noto Serif",serif';
export const HEAVY = '"Arial Black","Inter","Helvetica Neue","Noto Sans",Arial,sans-serif';

export const fontStr = (weight, size, family) => `${weight} ${Math.round(size)}px ${family}`;

/** Word-wrap into lines no wider than maxW; breaks over-long words by character. */
export function wrapLines(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxW) {
      line = test;
      continue;
    }
    if (line) lines.push(line);
    if (ctx.measureText(word).width <= maxW) {
      line = word;
      continue;
    }
    let chunk = '';
    for (const ch of word) {
      if (ctx.measureText(chunk + ch).width > maxW && chunk) {
        lines.push(chunk);
        chunk = ch;
      } else chunk += ch;
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Largest font size (between min and max) at which the text wraps to fit the
 * box. Returns lines and size so callers can draw or animate them.
 */
export function fitText(ctx, text, { maxW, maxH, weight = 800, family = SANS, maxSize, minSize, lineHeight = 1.1, maxLines = 6, balance = false }) {
  let size = maxSize;
  let lines = [];
  for (; size >= minSize; size -= Math.max(1, size * 0.04)) {
    ctx.font = fontStr(weight, size, family);
    lines = wrapLines(ctx, text, maxW);
    if (lines.length <= maxLines && lines.length * size * lineHeight <= maxH) break;
  }
  size = Math.max(size, minSize);
  ctx.font = fontStr(weight, size, family);
  lines = wrapLines(ctx, text, maxW);
  if (balance && lines.length > 1) lines = balanceLines(ctx, text, maxW, lines);
  return { size, lines, lineHeight, height: lines.length * size * lineHeight, weight, family };
}

/**
 * Same line count, evenly filled: narrows the wrap width until adding another
 * line would be needed. Avoids a lone orphan word on the last line.
 */
function balanceLines(ctx, text, maxW, lines) {
  const target = lines.length;
  let lo = maxW * 0.45;
  let hi = maxW;
  let best = lines;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const attempt = wrapLines(ctx, text, mid);
    if (attempt.length <= target && attempt.every((l) => ctx.measureText(l).width <= maxW)) {
      best = attempt;
      hi = mid;
    } else lo = mid;
  }
  return best;
}

export function drawLines(ctx, block, x, y, align = 'left', { stroke } = {}) {
  ctx.font = fontStr(block.weight, block.size, block.family);
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  block.lines.forEach((ln, i) => {
    const ly = y + i * block.size * block.lineHeight;
    if (stroke) ctx.strokeText(ln, x, ly);
    ctx.fillText(ln, x, ly);
  });
  return y + block.height;
}

// ---- shapes ---------------------------------------------------------------

export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = typeof r === 'number' ? [r, r, r, r] : r;
  const [tl, tr, br, bl] = rr.map((v) => Math.max(0, Math.min(v, w / 2, h / 2)));
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

export function starburstPath(ctx, cx, cy, outer, inner, points, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (Math.PI * i) / points;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function drawPin(ctx, x, y, size, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - size * 0.35, size * 0.42, Math.PI, 0);
  ctx.quadraticCurveTo(x + size * 0.42, y - size * 0.1, x, y + size * 0.5);
  ctx.quadraticCurveTo(x - size * 0.42, y - size * 0.1, x - size * 0.42, y - size * 0.35);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(x, y - size * 0.35, size * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawArrow(ctx, x, y, size, color, lw) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - size / 2, y);
  ctx.lineTo(x + size / 2, y);
  ctx.moveTo(x + size * 0.1, y - size * 0.4);
  ctx.lineTo(x + size / 2, y);
  ctx.lineTo(x + size * 0.1, y + size * 0.4);
  ctx.stroke();
  ctx.restore();
}

export function drawCheck(ctx, x, y, size, color, lw) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - size * 0.4, y);
  ctx.lineTo(x - size * 0.1, y + size * 0.32);
  ctx.lineTo(x + size * 0.45, y - size * 0.32);
  ctx.stroke();
  ctx.restore();
}

// ---- images ---------------------------------------------------------------

/**
 * Draw an image to fill (x,y,w,h) like CSS object-fit: cover, optionally with
 * a zoom and pan (used for Ken Burns). pan is -1..1 on each axis.
 */
export function drawCover(ctx, img, x, y, w, h, { zoom = 1, panX = 0, panY = 0 } = {}) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const ox = (dw - w) / 2;
  const oy = (dh - h) / 2;
  ctx.drawImage(img, x - ox + panX * ox, y - oy + panY * oy, dw, dh);
}

/** Draw an image inside a box without cropping (logos). */
export function drawContain(ctx, img, x, y, w, h, align = 'left') {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const s = Math.min(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  const dx = align === 'right' ? x + w - dw : align === 'center' ? x + (w - dw) / 2 : x;
  ctx.drawImage(img, dx, y + (h - dh) / 2, dw, dh);
  return dw;
}

export const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'A';

/** The most "product-like" word for big background typography. */
export function keyWord(product) {
  const words = product.split(/\s+/).filter((w) => w.length > 2);
  return (words.at(-1) || product).toUpperCase();
}
