import { moodForTone, MOODS, audioSupported, createSoundtrack } from '../../render/audio.js';
import { THEMES } from '../../render/poster.js';
import { DURATIONS, VIDEO_FORMATS, createVideo, recordVideo, videoSupport } from '../../render/video.js';
import { clear, download, h, icon, slug, toast } from '../dom.js';

export function initVideo(app) {
  const r = app.state.result;
  const ai = app.state.ai.data?.storyboard;
  const base = r.copy.storyboard;
  // Claude may reword the hook, product, benefits title and offer lines when its
  // storyboard has the same beats as ours. The final card always keeps the
  // owner's own call to action and contact details (facts, never rewritten).
  const scenes = base.map((s, i) => {
    const a = ai && ai.length === base.length ? ai[i] : null;
    const copy = { ...s, chips: s.chips ? [...s.chips] : undefined };
    if (!a || s.kind === 'cta') return copy;
    copy.title = a.title;
    if (s.kind !== 'benefits' && a.sub) copy.sub = a.sub;
    return copy;
  });
  app.state.video = {
    format: 'vertical',
    duration: 12,
    music: 'auto',
    theme: app.state.creative.theme,
    scenes,
    blob: null,
    url: null,
    ext: null,
    rendering: false,
  };
}

const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
// Idle preview shows a mid-hook frame; at t=0 every scene is still fading in and looks blank.
const restTime = (d) => Math.min(1.3, d * 0.15);
const fmtTime = (t, d) => `${t.toFixed(1)} / ${d.toFixed(0)} s`;

export function videoSpec(app) {
  const { result, creative, image, logo, video: v } = app.state;
  const p = result.profile;
  return {
    format: v.format, theme: v.theme, brandColor: creative.brandColor || p.brandColor, biz: p.businessName, product: p.product,
    city: p.city, contact: p.contact, cta: creative.cta || p.cta, image, logo, duration: v.duration, scenes: v.scenes, seed: creative.seed,
  };
}

export function createVideoView(app) {
  const root = app.panels.video;
  let canvas;
  let vid;
  let t = 0;
  let playing = false;
  let raf = 0;
  let playStart = 0;
  let scrub;
  let timeLabel;
  let playBtn;
  let abort = null;
  let musicPreview = null;
  const support = videoSupport();

  function rebuild() {
    if (!canvas || !app.state.result) return;
    const v = app.state.video;
    vid = createVideo(canvas, videoSpec(app));
    scrub.max = String(v.duration);
    t = Math.min(t, v.duration);
    vid.draw(t);
    timeLabel.textContent = fmtTime(t, v.duration);
  }

  function setPlaying(on) {
    playing = on;
    playBtn.replaceChildren(icon(on ? 'pause' : 'play', 17), on ? 'Pause' : 'Preview');
    cancelAnimationFrame(raf);
    if (!on) return;
    playStart = performance.now() - t * 1000;
    const loop = (now) => {
      t = (now - playStart) / 1000;
      if (t >= vid.duration) {
        t = restTime(vid.duration);
        setPlaying(false);
        vid.draw(t);
        scrub.value = String(t);
        timeLabel.textContent = fmtTime(t, vid.duration);
        return;
      }
      vid.draw(t);
      scrub.value = String(t);
      timeLabel.textContent = fmtTime(t, vid.duration);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function stopMusicPreview() {
    musicPreview?.stop();
    musicPreview = null;
  }

  function moodId() {
    const m = app.state.video.music;
    return m === 'auto' ? moodForTone(app.state.result.profile.tone) : m;
  }

  async function toggleMusic(btn) {
    if (musicPreview) {
      stopMusicPreview();
      btn.replaceChildren(icon('play', 15), 'Hear the music');
      return;
    }
    if (!audioSupported()) return toast('This browser cannot play the generated music.', 'error');
    const v = app.state.video;
    musicPreview = createSoundtrack({ duration: Math.min(v.duration, 12), mood: moodId(), seed: app.state.creative.seed });
    await musicPreview.start({ monitor: true });
    btn.replaceChildren(icon('stop', 15), 'Stop');
    setTimeout(() => { if (musicPreview) { stopMusicPreview(); btn.replaceChildren(icon('play', 15), 'Hear the music'); } }, Math.min(v.duration, 12) * 1000);
  }

  async function renderNow(ui) {
    const v = app.state.video;
    if (document.hidden) return toast('Bring this tab to the front first: the browser pauses drawing in the background.', 'error');
    setPlaying(false);
    stopMusicPreview();
    v.rendering = true;
    abort = new AbortController();
    ui.start();
    const onHide = () => {
      if (document.hidden && abort) {
        abort.abort('hidden');
      }
    };
    document.addEventListener('visibilitychange', onHide);
    const audio = v.music !== 'off' && audioSupported() ? createSoundtrack({ duration: v.duration, mood: moodId(), seed: app.state.creative.seed }) : null;
    const t0 = performance.now();
    try {
      const out = await recordVideo({ canvas, video: vid, audio, signal: abort.signal, onProgress: (p) => ui.progress(p) });
      if (v.url) URL.revokeObjectURL(v.url);
      v.blob = out.blob;
      v.ext = out.ext;
      v.url = URL.createObjectURL(out.blob);
      v.info = { seconds: (performance.now() - t0) / 1000, size: out.blob.size, w: vid.width, h: vid.height, audio: Boolean(audio) };
      app.onVideoReady();
      toast(`Your video is ready in ${v.info.seconds.toFixed(0)} seconds`, 'ok');
    } catch (e) {
      audio?.stop();
      if (e.name === 'AbortError') {
        toast(abort?.signal.reason === 'hidden' ? 'Rendering stopped because the tab was hidden. Keep it in front and try again.' : 'Rendering cancelled.', 'error');
      } else toast(`Could not render the video: ${e.message}`, 'error');
    } finally {
      document.removeEventListener('visibilitychange', onHide);
      v.rendering = false;
      abort = null;
      ui.done();
      t = restTime(v.duration);
      rebuild();
      render();
    }
  }

  function render() {
    const r = app.state.result;
    stopMusicPreview();
    playing = false;
    cancelAnimationFrame(raf);
    clear(root);
    if (!r) return;
    const v = app.state.video;
    canvas = h('canvas', { 'aria-label': 'Video preview', role: 'img' });
    t = restTime(v.duration);
    scrub = h('input', { type: 'range', min: '0', max: String(v.duration), step: '0.05', value: String(t), 'aria-label': 'Timeline', onInput: (e) => { setPlaying(false); t = Number(e.target.value); vid.draw(t); timeLabel.textContent = fmtTime(t, v.duration); } });
    timeLabel = h('span', { class: 't' }, fmtTime(t, v.duration));
    playBtn = h('button', { class: 'btn btn-sm', type: 'button', onClick: () => setPlaying(!playing) }, icon('play', 17), 'Preview');

    const pressed = (id, cur, onPick, label, small) => h('button', { type: 'button', 'aria-pressed': String(id === cur), onClick: (e) => {
      onPick(id);
      for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-pressed', 'false');
      e.currentTarget.setAttribute('aria-pressed', 'true');
    } }, label, small ? h('small', null, small) : null);

    const formatBtns = h('div', { class: 'tabs-mini', role: 'group', 'aria-label': 'Video size' },
      Object.values(VIDEO_FORMATS).map((f) => pressed(f.id, v.format, (id) => { v.format = id; t = restTime(v.duration); scrub.value = String(t); rebuild(); }, f.label, f.where)));
    const durBtns = h('div', { class: 'tabs-mini', role: 'group', 'aria-label': 'Length' },
      DURATIONS.map((d) => pressed(d, v.duration, (x) => { v.duration = x; t = restTime(x); scrub.value = String(t); rebuild(); }, `${d} seconds`)));
    const themeSel = h('select', { 'aria-label': 'Video style', onChange: (e) => { v.theme = e.target.value; rebuild(); } },
      Object.entries(THEMES).map(([id, th]) => h('option', { value: id, selected: id === v.theme }, th.label)));
    const musicSel = h('select', { 'aria-label': 'Music', onChange: (e) => { v.music = e.target.value; stopMusicPreview(); } },
      h('option', { value: 'auto', selected: v.music === 'auto' }, `Auto (${MOODS[moodForTone(app.state.result.profile.tone)].label})`),
      Object.entries(MOODS).map(([id, m]) => h('option', { value: id, selected: v.music === id }, m.label)),
      h('option', { value: 'off', selected: v.music === 'off' }, 'No music'));
    const musicBtn = h('button', { class: 'btn btn-sm', type: 'button', onClick: (e) => toggleMusic(e.currentTarget) }, icon('play', 15), 'Hear the music');

    const sceneLabel = { hook: 'Hook', value: 'Product', benefits: 'Benefits', offer: 'Offer', cta: 'Call to act' };
    const scriptEditors = v.scenes.map((s) => {
      const title = h('input', { type: 'text', maxlength: 60, value: s.title, 'aria-label': `${sceneLabel[s.kind] || s.kind} text`, onInput: (e) => { s.title = e.target.value; rebuildSoon(); } });
      const isChips = s.kind === 'benefits';
      const sub = h('input', {
        type: 'text', maxlength: 120, value: isChips ? (s.chips || []).join(', ') : (s.sub || ''), placeholder: isChips ? 'Up to 3 points, comma separated' : 'Supporting line',
        'aria-label': `${sceneLabel[s.kind] || s.kind} detail`,
        onInput: (e) => {
          if (isChips) s.chips = e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 3);
          else s.sub = e.target.value;
          rebuildSoon();
        },
      });
      return h('div', { class: 'scene-edit' }, h('span', { class: 'k' }, sceneLabel[s.kind] || s.kind), title, sub);
    });
    let rebuildTimer;
    function rebuildSoon() {
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(rebuild, 150);
    }

    // ---- render panel
    const bar = h('i', { vars: { '--w': 0 } });
    const progress = h('div', { class: 'progress', hidden: true, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, bar);
    const status = h('p', { class: 'muted small', 'aria-live': 'polite' });
    const renderBtn = h('button', { class: 'btn btn-primary btn-lg', type: 'button', disabled: !support.supported }, icon('film', 20), 'Render my video');
    const cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button', hidden: true, onClick: () => abort?.abort() }, icon('x', 15), 'Cancel');
    const ui = {
      start() { renderBtn.disabled = true; cancelBtn.hidden = false; progress.hidden = false; status.textContent = 'Recording your ad in real time. Keep this tab in front.'; },
      progress(p) { bar.style.setProperty('--w', (p * 100).toFixed(1)); progress.setAttribute('aria-valuenow', String(Math.round(p * 100))); status.textContent = `Recording… ${Math.round(p * 100)}%. Keep this tab in front.`; },
      done() { renderBtn.disabled = !support.supported; cancelBtn.hidden = true; progress.hidden = true; status.textContent = ''; },
    };
    renderBtn.addEventListener('click', () => renderNow(ui));

    const resultBox = h('div', { class: 'stack' });
    if (v.url) {
      resultBox.append(
        h('video', { class: 'result-video', src: v.url, controls: true, playsinline: true, 'aria-label': 'Your rendered video ad' }),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-primary', type: 'button', onClick: () => download(v.blob, `${slug(app.state.result.profile.businessName)}-ad.${v.ext}`) }, icon('download', 17), `Download .${v.ext}`),
          h('span', { class: 'muted small' }, `${fmtSize(v.blob.size)} · ${v.info.w}×${v.info.h} · ${v.duration} s · ${v.info.audio ? 'with music' : 'no music'} · rendered in ${v.info.seconds.toFixed(0)} s`)),
        v.ext !== 'mp4' ? h('div', { class: 'warn-box' }, icon('info', 18), h('span', null, 'Your browser saved this as WebM. Instagram and Facebook prefer MP4. Chrome, Edge and Safari can save MP4 directly, or run this file through any free video converter.')) : null);
    }

    root.append(
      h('div', { class: 'page-h' }, h('div', { class: 'eyebrow' }, 'Step 4 · Video studio'),
        h('h2', null, 'A video ad in about ', `${v.duration + 2} seconds`),
        h('p', null, 'Edit the script, preview it, then render. The video is recorded on your device with royalty-free music generated on the spot, so it costs nothing.')),
      h('div', { class: 'vid' },
        h('div', { class: 'card' },
          h('div', { class: 'stage' }, canvas),
          h('div', { class: 'scrub' }, playBtn, scrub, timeLabel)),
        h('div', { class: 'stack' },
          h('div', { class: 'card stack' },
            h('div', { class: 'ctl-group' }, h('span', { class: 'lab' }, 'Size'), formatBtns),
            h('div', { class: 'ctl-group' }, h('span', { class: 'lab' }, 'Length'), durBtns),
            h('div', { class: 'form-grid' },
              h('div', { class: 'field' }, h('label', null, 'Style'), themeSel),
              h('div', { class: 'field' }, h('label', null, 'Music'), h('div', { class: 'row' }, musicSel, musicBtn)))),
          h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', null, 'Script'), h('span', { class: 'muted small' }, 'Scene by scene')), scriptEditors),
          h('div', { class: 'card stack' },
            h('div', { class: 'card-h' }, h('h3', null, 'Render')),
            support.supported ? null : h('div', { class: 'warn-box' }, icon('alert', 18), h('span', null, 'This browser cannot record video. Please use a recent Chrome, Edge, Safari or Firefox.')),
            h('div', { class: 'row' }, renderBtn, cancelBtn), progress, status, resultBox))));

    rebuild();
  }

  return { render, rebuild };
}
