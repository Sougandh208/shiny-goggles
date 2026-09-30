import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer, rateLimited } from '../server.js';
import { EnhanceError } from '../src/enhance.js';

const valid = {
  businessName: 'Lotus Boutique', product: 'Handmade cotton kurtis', category: 'fashion', region: 'IN', goal: 'sales', tone: 'friendly',
  scope: 'local', city: 'Pune', monthlyBudget: 15000, aov: 1800, margin: 50,
};

const servers = [];
async function start(opts) {
  const s = createServer(opts);
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  servers.push(s);
  return `http://127.0.0.1:${s.address().port}`;
}
after(() => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))));

const post = (url, body, headers = { 'content-type': 'application/json' }) =>
  fetch(url, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

/** Raw request so the client cannot normalise `..` segments away. */
function raw(base, path) {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    http.get({ host: u.hostname, port: u.port, path }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

test('static: serves the app with a strict CSP and security headers', async () => {
  const base = await start({ client: null });
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(?!.*unsafe)/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await res.text(), /NovaAd/);
  const js = await fetch(`${base}/js/main.js`);
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(`${base}/missing.js`)).status, 404);
});

test('static: path traversal cannot escape the public folder', async () => {
  const base = await start({ client: null });
  for (const p of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/package.json', '/js/../../server.js', '/%2e%2e%2f%2e%2e%2fetc/passwd', '/..\\package.json']) {
    const r = await raw(base, p);
    assert.notEqual(r.status, 200, p);
    assert.ok(!r.data.includes('"name": "novaad"') && !r.data.includes('createServer'), `${p} leaked a file`);
  }
});

test('static: a malformed percent-escape is a 4xx, not a crash', async () => {
  const base = await start({ client: null });
  const r = await raw(base, '/%E0%A4%A');
  assert.ok(r.status >= 400 && r.status < 500, String(r.status));
  assert.equal((await fetch(`${base}/api/status`)).status, 200); // still alive
});

test('api: status reflects whether Claude is configured', async () => {
  const off = await start({ client: null });
  assert.deepEqual(await (await fetch(`${off}/api/status`)).json(), { ai: false, model: null });
  const on = await start({ client: {}, model: 'claude-opus-5-5' });
  assert.deepEqual(await (await fetch(`${on}/api/status`)).json(), { ai: true, model: 'claude-opus-5-5' });
});

test('api: enhance is a clean 503 without a key, and POST-only', async () => {
  const off = await start({ client: null });
  const res = await post(`${off}/api/enhance`, { profile: valid });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'not_configured');
  const on = await start({ client: {}, enhanceFn: async () => ({}) });
  assert.equal((await fetch(`${on}/api/enhance`)).status, 405);
  assert.equal((await fetch(`${on}/api/nope`)).status, 404);
});

test('api: the server re-validates and sanitises the brief before calling Claude', async () => {
  let received;
  const base = await start({
    client: {},
    enhanceFn: async (_c, profile, audience, model) => {
      received = { profile, audience, model };
      return { data: { headlines: ['x'] }, model, cost: null };
    },
    model: 'test-model',
  });
  const res = await post(`${base}/api/enhance`, { profile: { ...valid, businessName: 'Lo\u0000tus\nBoutique', margin: 9999, brandColor: 'url(javascript:1)' } });
  assert.equal(res.status, 200);
  assert.equal(received.profile.businessName, 'Lo tus Boutique');
  assert.equal(received.profile.margin, 95);
  assert.equal(received.profile.brandColor, '#22e4ff');
  assert.equal(received.model, 'test-model');
  assert.ok(received.audience.primary.label); // built server-side, not taken from the client
});

test('api: bad input is rejected with a useful 4xx', async () => {
  const base = await start({ client: {}, enhanceFn: async () => ({}) });
  const bad = await post(`${base}/api/enhance`, { profile: { ...valid, businessName: '', monthlyBudget: -1 } });
  assert.equal(bad.status, 400);
  const body = await bad.json();
  assert.ok(body.fields.businessName && body.fields.monthlyBudget);
  assert.equal((await post(`${base}/api/enhance`, '{not json')).status, 400);
  assert.equal((await post(`${base}/api/enhance`, { profile: valid }, { 'content-type': 'text/plain' })).status, 415);
  const big = await post(`${base}/api/enhance`, JSON.stringify({ profile: { ...valid, product: 'x'.repeat(40_000) } }));
  assert.equal(big.status, 413);
});

test('api: Claude failures come back as typed JSON errors, never a stack trace', async () => {
  const base = await start({ client: {}, enhanceFn: async () => { throw new EnhanceError('Claude declined this request.', { status: 502, code: 'refusal' }); } });
  const res = await post(`${base}/api/enhance`, { profile: valid });
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: 'Claude declined this request.', code: 'refusal' });
  const crash = await start({ client: {}, enhanceFn: async () => { throw new Error('secret internal detail'); } });
  const r2 = await post(`${crash}/api/enhance`, { profile: valid });
  assert.equal(r2.status, 500);
  assert.ok(!(await r2.text()).includes('secret internal detail'));
});

test('rate limiter: allows the limit, blocks beyond it, and forgets after the window', () => {
  const ip = 'test-ip-1';
  for (let i = 0; i < 12; i++) assert.equal(rateLimited(ip, 1000 + i), false, `req ${i}`);
  assert.equal(rateLimited(ip, 1100), true);
  assert.equal(rateLimited(ip, 1000 + 61_000), false);
  assert.equal(rateLimited('another-ip', 1000), false);
});

test('api: the limiter protects the paid route', async () => {
  const base = await start({ client: {}, enhanceFn: async () => ({ data: {}, model: 'm', cost: null }) });
  const codes = [];
  for (let i = 0; i < 14; i++) codes.push((await post(`${base}/api/enhance`, { profile: valid })).status);
  assert.ok(codes.includes(429), codes.join(','));
  assert.equal(codes[0], 200);
});
