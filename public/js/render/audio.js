// Royalty-free background music, synthesised with WebAudio: no downloads, no
// licensing. Three moods; the whole track is scheduled up front against the
// audio clock, so it stays in time with the video however the tab behaves.

import { makeRng } from '../engine/rng.js';

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const QUALITY = { m: [0, 3, 7], M: [0, 4, 7] };

export const MOODS = {
  energetic: {
    label: 'Energetic', bpm: 124, root: 57, drums: 'full', arp: 4, bass: 2,
    prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']],
  },
  warm: {
    label: 'Warm & friendly', bpm: 98, root: 60, drums: 'light', arp: 2, bass: 1,
    prog: [[0, 'M'], [-5, 'M'], [-3, 'm'], [-7, 'M']],
  },
  elegant: {
    label: 'Calm & elegant', bpm: 76, root: 62, drums: 'none', arp: 2, bass: 0.25,
    prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']],
  },
};

export const moodForTone = (tone) =>
  ({ bold: 'energetic', playful: 'energetic', friendly: 'warm', trust: 'warm', premium: 'elegant' })[tone] || 'warm';

function noiseBuffer(ctx, seconds = 1) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rng = makeRng(42);
  for (let i = 0; i < d.length; i++) d[i] = rng.next() * 2 - 1;
  return buf;
}

export function audioSupported() {
  return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);
}

/**
 * @returns {{ctx:AudioContext, stream:MediaStream, start:(opts?:{monitor?:boolean})=>Promise<void>, stop:()=>void}}
 */
export function createSoundtrack({ duration, mood = 'warm', seed = 1 }) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const cfg = MOODS[mood] || MOODS.warm;
  const rng = makeRng(`${seed}|${mood}`);
  const dest = ctx.createMediaStreamDestination();

  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp);
  comp.connect(dest);
  const noise = noiseBuffer(ctx);
  let started = false;

  const beat = 60 / cfg.bpm;
  const bar = beat * 4;

  function env(param, t0, attack, hold, release, peak) {
    param.setValueAtTime(0.0001, t0);
    param.linearRampToValueAtTime(peak, t0 + attack);
    param.setValueAtTime(peak, t0 + attack + hold);
    param.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  }

  function tone(type, freq, t0, len, peak, { attack = 0.01, release = 0.08, lp } = {}) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    let node = o;
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(master);
    env(g.gain, t0, attack, Math.max(0.01, len - attack), release, peak);
    o.start(t0);
    o.stop(t0 + len + release + 0.05);
  }

  function kick(t0, vol = 0.9) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t0);
    o.frequency.exponentialRampToValueAtTime(42, t0 + 0.14);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + 0.3);
  }

  function hit(t0, { hp = 6000, len = 0.05, vol = 0.18, bp } = {}) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = bp ? 'bandpass' : 'highpass';
    f.frequency.value = bp || hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
    s.connect(f);
    f.connect(g);
    g.connect(master);
    s.start(t0, rng.range(0, 0.5));
    s.stop(t0 + len + 0.02);
  }

  function schedule(t0) {
    const bars = Math.ceil(duration / bar) + 1;
    for (let b = 0; b < bars; b++) {
      const [off, q] = cfg.prog[b % cfg.prog.length];
      const root = cfg.root + off;
      const chord = QUALITY[q].map((i) => root + i);
      const bt = t0 + b * bar;
      if (bt - t0 > duration) break;

      // pad
      for (const n of chord) {
        tone('sawtooth', hz(n + 12), bt, bar, 0.035, { attack: 0.35, release: 0.5, lp: 1100 });
        tone('sawtooth', hz(n + 12) * 1.004, bt, bar, 0.025, { attack: 0.35, release: 0.5, lp: 900 });
      }
      // bass
      const steps = Math.max(1, Math.round(4 * cfg.bass));
      for (let i = 0; i < steps; i++) {
        const t = bt + (i * bar) / steps;
        tone(cfg.drums === 'none' ? 'sine' : 'triangle', hz(root - 24), t, (bar / steps) * 0.85, 0.2, { attack: 0.01, release: 0.1, lp: 500 });
      }
      // arpeggio
      const per = cfg.arp * 4;
      for (let i = 0; i < per; i++) {
        const t = bt + (i * bar) / per;
        const n = chord[i % 3] + (i % 6 >= 3 ? 24 : 12);
        tone(cfg.drums === 'none' ? 'sine' : 'triangle', hz(n + 12), t, bar / per * 0.7, cfg.drums === 'none' ? 0.05 : 0.07, { attack: 0.005, release: 0.12 });
      }
      // drums
      if (cfg.drums !== 'none') {
        for (let i = 0; i < 4; i++) {
          const t = bt + i * beat;
          if (cfg.drums === 'full' || i % 2 === 0) kick(t, cfg.drums === 'full' ? 0.9 : 0.6);
          hit(t + beat / 2, { hp: 7000, vol: cfg.drums === 'full' ? 0.16 : 0.08 });
          if (cfg.drums === 'full' && i % 2 === 1) hit(t, { bp: 1800, len: 0.12, vol: 0.28 });
        }
      }
    }
  }

  return {
    ctx,
    stream: dest.stream,
    async start({ monitor = false } = {}) {
      if (started) return;
      started = true;
      await ctx.resume();
      const t0 = ctx.currentTime + 0.08;
      master.gain.setValueAtTime(0.0001, t0);
      master.gain.linearRampToValueAtTime(0.55, t0 + 0.5);
      master.gain.setValueAtTime(0.55, t0 + Math.max(0.6, duration - 1.1));
      master.gain.linearRampToValueAtTime(0.0001, t0 + duration);
      if (monitor) comp.connect(ctx.destination);
      schedule(t0);
    },
    stop() {
      try {
        master.disconnect();
        ctx.close();
      } catch { /* already closed */ }
    },
  };
}
