// End-to-end: drives the real UI in headless Chromium and asserts on outcomes.
//   npm run e2e        (needs `npm i` and a Chromium: PLAYWRIGHT_BROWSERS_PATH or CHROME_PATH)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from '../server.js';
import { EnhanceError } from '../src/enhance.js';

const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${s.address().port}`)));
const tmp = mkdtempSync(path.join(tmpdir(), 'novaad-e2e-'));
let step = 0;
const ok = (msg) => console.log(`  ✔ ${String(++step).padStart(2, '0')} ${msg}`);

const CLAUDE = {
  headlines: ['Claude headline one', 'Claude headline two', 'Claude headline three', 'Claude headline four', 'Claude headline five'],
  primaryTexts: ['Claude caption A', 'Claude caption B', 'Claude caption C'],
  storyboard: [
    { title: 'Claude hook line', sub: '' }, { title: 'Claude product line', sub: 'Claude product sub' }, { title: 'Claude benefits title', sub: '' },
    { title: 'Claude offer line', sub: 'Claude offer sub' }, { title: 'Claude should not win here', sub: 'nor here' },
  ],
  audienceTips: ['Claude tip one', 'Claude tip two', 'Claude tip three'],
};

const plain = await listen(createServer({ client: null }));
let failClaude = false;
const withClaude = await listen(createServer({
  client: {},
  model: 'claude-opus-5-5',
  enhanceFn: async () => {
    if (failClaude) throw new EnhanceError('Claude is busy right now. Try again shortly.', { status: 429, code: 'rate_limited' });
    return { data: CLAUDE, model: 'claude-opus-5-5', cost: { inputTokens: 900, outputTokens: 700, usd: 0.0176 } };
  },
}));

const launchOpts = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
const browser = await chromium.launch({ ...launchOpts, args: ['--autoplay-policy=no-user-gesture-required'] });

async function newPage(base, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) problems.push(`console: ${m.text()}`); });
  await page.goto(base);
  return { page, ctx, problems };
}

const fill = async (page, values) => {
  for (const [k, v] of Object.entries(values)) await page.locator(`#f-${k}`).fill(String(v));
};
async function download(page, action) {
  const [dl] = await Promise.all([page.waitForEvent('download'), action()]);
  const file = path.join(tmp, `${Date.now()}-${dl.suggestedFilename()}`);
  await dl.saveAs(file);
  return { file, name: dl.suggestedFilename() };
}
const unzip = (file, flag) => execFileSync('unzip', [flag, file]).toString();
const unzipMember = (file, member) => execFileSync('unzip', ['-p', file, member]).toString();
const launch = async (page) => {
  await page.getByRole('button', { name: /Launch AI engine/ }).click();
  await page.locator('#pipe-skip').click({ timeout: 5000 }).catch(() => {});
  await page.waitForSelector('#panel-strategy:not([hidden])', { timeout: 30_000 });
};

try {
  // ---------------------------------------------------------------------------
  console.log('Validation and first run (no Claude)');
  {
    const { page, problems } = await newPage(plain);
    assert.equal(await page.locator('#tab-strategy').isDisabled(), true);
    assert.equal(await page.locator('#kit-btn').isDisabled(), true);
    ok('workspace tabs and kit are locked until a campaign exists');

    await page.getByRole('button', { name: /Launch AI engine/ }).click();
    assert.ok((await page.locator('.err:not([hidden])').count()) >= 5);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'f-businessName');
    assert.equal(await page.locator('#f-businessName').getAttribute('aria-invalid'), 'true');
    ok('empty submit shows field errors and focuses the first bad field');

    await page.getByRole('button', { name: /Boutique in Pune/ }).click();
    assert.equal(await page.locator('.err:not([hidden])').count(), 0);
    await launch(page);
    const kpis = await page.locator('#panel-strategy .kpi').allTextContents();
    assert.equal(kpis.length, 5);
    assert.match(kpis.join(' '), /₹/);
    assert.match(await page.locator('#panel-strategy').innerText(), /Where every rupee goes/);
    ok('example brief launches and the strategy shows ₹ figures');

    const segs = await page.locator('.alloc .seg').evaluateAll((els) => els.map((e) => Number(e.style.getPropertyValue('--w'))));
    assert.ok(Math.abs(segs.reduce((a, b) => a + b, 0) - 100) < 0.1, `segments sum ${segs}`);
    ok('budget bar segments add up to 100% of the budget');

    // ---- creative
    await page.locator('#tab-creative').click();
    await page.waitForFunction(() => document.querySelector('#panel-creative canvas')?.width === 1080);
    const nonBlank = await page.evaluate(() => {
      const c = document.querySelector('#panel-creative canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let colours = new Set();
      for (let i = 0; i < d.length; i += 4 * 997) colours.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
      return colours.size;
    });
    assert.ok(nonBlank > 12, `poster looks blank (${nonBlank} colours)`);
    ok('poster canvas is drawn (not blank)');

    await page.getByRole('button', { name: /Story 9:16/ }).click();
    await page.waitForFunction(() => document.querySelector('#panel-creative canvas').height === 1920);
    ok('switching to Story resizes the poster to 1080×1920');

    await page.locator('textarea[aria-label="Headline"]').fill('My custom headline');
    const before = await page.evaluate(() => document.querySelector('#panel-creative canvas').toDataURL().length);
    await page.getByRole('button', { name: 'Bold Pop' }).click();
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => document.querySelector('#panel-creative canvas').toDataURL().length);
    assert.notEqual(before, after);
    ok('editing text and switching style re-renders the poster');

    const png = await download(page, () => page.getByRole('button', { name: /Download PNG/ }).click());
    const head = readFileSync(png.file).subarray(0, 8);
    assert.deepEqual([...head], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.match(png.name, /lotus-boutique-story\.png$/);
    ok(`PNG download is a real PNG (${png.name})`);

    const zip = await download(page, () => page.getByRole('button', { name: /All 4 sizes/ }).click());
    assert.match(unzip(zip.file, '-t'), /No errors detected/);
    const listing = unzip(zip.file, '-l');
    for (const f of ['square-1080x1080', 'portrait-1080x1350', 'story-1080x1920', 'landscape-1200x628']) assert.match(listing, new RegExp(f));
    ok('all-sizes zip verifies with unzip and holds the 4 formats');

    const g = await page.locator('#panel-creative .count').allTextContents();
    assert.ok(g.some((t) => /\/30$/.test(t)) && g.some((t) => /\/90$/.test(t)));
    assert.equal(await page.locator('#panel-creative .count.over').count(), 0);
    ok('Google ad counters are shown and none exceed their limits');

    // ---- video
    await page.locator('#tab-video').click();
    await page.getByRole('button', { name: '8 seconds' }).click();
    const t0 = Date.now();
    await page.getByRole('button', { name: /Render my video/ }).click();
    await page.waitForSelector('.result-video', { timeout: 60_000 });
    const secs = (Date.now() - t0) / 1000;
    assert.ok(secs < 25, `8s video took ${secs}s`);
    const vinfo = await page.evaluate(async () => {
      const el = document.querySelector('.result-video');
      await new Promise((r) => (el.readyState >= 1 ? r() : el.addEventListener('loadedmetadata', r, { once: true })));
      // (fetch() of a blob: URL is blocked by the app's CSP, so read the blob from app state.)
      const bytes = await window.__novaad.state.video.blob.arrayBuffer();
      const ac = new AudioContext();
      const buf = await ac.decodeAudioData(bytes.slice(0));
      const ch = buf.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
      return { w: el.videoWidth, h: el.videoHeight, size: bytes.byteLength, audioSeconds: buf.duration, rms: Math.sqrt(sum / ch.length) };
    });
    assert.deepEqual([vinfo.w, vinfo.h], [720, 1280]);
    assert.ok(vinfo.size > 100_000, `video only ${vinfo.size} bytes`);
    assert.ok(vinfo.audioSeconds > 7 && vinfo.audioSeconds < 9.5, `audio ${vinfo.audioSeconds}s`);
    assert.ok(vinfo.rms > 0.02, `audio is silent (rms ${vinfo.rms})`);
    ok(`8s video rendered in ${secs.toFixed(1)}s: 720×1280, ${(vinfo.size / 1e6).toFixed(1)} MB, music present (rms ${vinfo.rms.toFixed(3)})`);

    const vid = await download(page, () => page.getByRole('button', { name: /Download \.(mp4|webm)/ }).click());
    assert.ok(statSync(vid.file).size === vinfo.size);
    ok(`video download matches what was rendered (${vid.name})`);

    // ---- kit
    const kit = await download(page, () => page.locator('#kit-btn').click());
    assert.match(unzip(kit.file, '-t'), /No errors detected/);
    const kl = unzip(kit.file, '-l');
    for (const f of ['posters/', 'video/', 'campaign-plan.md', 'ad-copy.txt']) assert.ok(kl.includes(f), f);
    assert.equal((kl.match(/\.png/g) || []).length, 4);
    const plan = unzipMember(kit.file, 'campaign-plan.md');
    assert.match(plan, /# Lotus Boutique: ad campaign plan/);
    assert.match(plan, /not promises/);
    assert.match(plan, /Reserve for winners/);
    ok('campaign kit contains 4 posters, the video, the plan and the copy');

    // ---- coach
    await page.locator('#tab-coach').click();
    await page.getByRole('button', { name: /Load an example/ }).click();
    const coach = await page.locator('#panel-coach').innerText();
    assert.doesNotMatch(coach, /\[object /);
    assert.match(coach, /Scale/);
    assert.match(coach, /Pause/);
    assert.match(coach, /Fix/);
    assert.match(coach, /What to do with your money this week/);
    ok('coach gives Scale / Pause / Fix verdicts with actions');
    await page.locator('.camp-row').first().locator('input[id$="-spend"]').fill('0');
    await page.locator('.camp-row').first().locator('input[id$="-impressions"]').fill('0');
    await page.locator('.camp-row').first().locator('input[id$="-clicks"]').fill('0');
    assert.equal(await page.locator('.vcard').count(), 2);
    ok('editing numbers recomputes verdicts live');

    // persistence
    await page.reload();
    await page.waitForSelector('#tab-strategy:not([disabled])');
    assert.equal(await page.locator('#f-businessName').inputValue(), 'Lotus Boutique');
    await page.locator('#tab-coach').click();
    assert.ok((await page.locator('.camp-row').count()) === 3);
    ok('brief and campaigns are restored after a reload');

    assert.deepEqual(problems, []);
    ok('no console or page errors');
  }

  // ---------------------------------------------------------------------------
  console.log('Untrusted text never becomes markup');
  {
    const { page, problems } = await newPage(plain);
    await page.getByRole('button', { name: /Boutique in Pune/ }).click();
    const evil = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
    await fill(page, { businessName: evil, product: `"'><svg onload=window.__xss=3>`, offer: '<b>50%</b> off', contact: '<a href=javascript:window.__xss=4>x</a>' });
    await launch(page);
    for (const tab of ['strategy', 'creative', 'video', 'coach']) {
      await page.locator(`#tab-${tab}`).click();
      await page.waitForTimeout(150);
    }
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await page.locator('#panel-strategy img, #panel-strategy script, #panel-creative img[src="x"]').count(), 0);
    await page.locator('#tab-strategy').click();
    assert.ok((await page.locator('#panel-strategy').innerText()).includes('<img src=x'));
    assert.deepEqual(problems.filter((p) => !/Content Security Policy/i.test(p)), []);
    ok('HTML/JS in business fields is shown as text and never executes');
  }

  // ---------------------------------------------------------------------------
  console.log('Claude polish (fake enhancer)');
  {
    const { page, problems } = await newPage(withClaude);
    await page.waitForSelector('#ai-pill.on');
    assert.equal(await page.locator('#ai-toggle').isVisible(), true);
    await page.getByRole('button', { name: /Boutique in Pune/ }).click();
    await page.getByRole('button', { name: /Launch AI engine/ }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('#pipe-steps li')].some((l) => /Claude/.test(l.textContent)));
    await page.waitForSelector('#panel-strategy:not([hidden])', { timeout: 30_000 });
    assert.match(await page.locator('#panel-strategy').innerText(), /Claude tip one/);
    await page.locator('#tab-creative').click();
    const t = await page.locator('#panel-creative').innerText();
    assert.match(t, /Claude headline one/);
    assert.match(t, /Claude caption A/);
    assert.equal(await page.locator('textarea[aria-label="Headline"]').inputValue(), 'Claude headline one');
    ok('Claude headlines, captions and tips appear and the poster uses the first headline');

    await page.locator('#tab-video').click();
    const scenes = await page.locator('.scene-edit input').evaluateAll((els) => els.map((e) => e.value));
    assert.equal(scenes[0], 'Claude hook line');
    assert.equal(scenes[2], 'Claude product line');
    assert.ok(!scenes.some((s) => /should not win/.test(s)), 'the CTA card must keep the owner\'s own words');
    assert.equal(scenes[8], 'Shop now');
    ok('Claude rewrites the hook/product/offer scenes but the call-to-action stays the owner\'s');

    const kit = await download(page, () => page.locator('#kit-btn').click());
    assert.match(unzipMember(kit.file, 'ad-copy.txt'), /Headlines \(Claude\)/);
    ok('Claude copy is included in the kit');
    assert.deepEqual(problems, []);
  }
  {
    failClaude = true;
    const { page, problems } = await newPage(withClaude);
    await page.getByRole('button', { name: /Boutique in Pune/ }).click();
    await page.getByRole('button', { name: /Launch AI engine/ }).click();
    await page.waitForSelector('#panel-strategy:not([hidden])', { timeout: 30_000 });
    await page.locator('#tab-creative').click();
    const t = await page.locator('#panel-creative').innerText();
    assert.doesNotMatch(t, /Claude headline/);
    assert.ok((await page.locator('.copy-item').count()) > 5);
    ok('if Claude fails, the built-in copy is used and nothing breaks');
    assert.deepEqual(problems.filter((p) => !/429/.test(p)), []);
    failClaude = false;
  }

  // ---------------------------------------------------------------------------
  console.log('Mobile (390px)');
  {
    const { page, problems } = await newPage(plain, { width: 390, height: 844 });
    await page.getByRole('button', { name: /Home bakery in Austin/ }).click();
    assert.equal(await page.locator('#f-monthlyBudget').locator('..').locator('span').textContent(), '$');
    await launch(page);
    for (const tab of ['brief', 'strategy', 'creative', 'video', 'coach']) {
      await page.locator(`#tab-${tab}`).click();
      await page.waitForTimeout(250);
      if (tab === 'coach') await page.getByRole('button', { name: /Load an example/ }).click();
      const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      assert.ok(w.sw <= w.iw + 1, `${tab}: page scrolls sideways (${w.sw} > ${w.iw})`);
    }
    ok('no tab scrolls sideways on a phone; currency follows the region ($)');
    assert.deepEqual(problems, []);
  }
  console.log(`\nAll ${step} checks passed.`);
} catch (err) {
  console.error('\nE2E FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  process.exit(process.exitCode || 0);
}
