import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, EnhanceError, SCHEMA, buildRequest, enhance, estimateCost, parseResponse, sanitize } from '../src/enhance.js';
import { buildAudience, validateProfile } from '../public/js/engine/index.js';

const profile = validateProfile({
  businessName: 'Lotus Boutique', product: 'Handmade cotton kurtis', category: 'fashion', region: 'IN', goal: 'sales', tone: 'friendly',
  scope: 'local', city: 'Pune', monthlyBudget: 15000, aov: 1800, margin: 50, offer: '20% off', sellingPoints: 'Free delivery over 999', contact: '@lotus',
}).profile;
const audience = buildAudience(profile);

const GOOD = {
  headlines: ['One', 'Two', 'Three', 'Four', 'Five'],
  primaryTexts: ['A caption', 'B caption', 'C caption'],
  storyboard: [{ title: 'Hook', sub: '' }, { title: 'Value', sub: 'sub' }, { title: 'Benefits', sub: '' }, { title: 'Offer', sub: '' }, { title: 'CTA', sub: '' }],
  audienceTips: ['tip 1', 'tip 2', 'tip 3'],
};
const message = (over = {}) => ({
  id: 'msg_test', type: 'message', role: 'assistant', model: DEFAULT_MODEL, stop_reason: 'end_turn', stop_sequence: null,
  content: [{ type: 'text', text: JSON.stringify(GOOD) }],
  usage: { input_tokens: 1000, output_tokens: 1000 },
  ...over,
});

test('request: uses the default model, structured output, low effort and refusal fallbacks', () => {
  const r = buildRequest(profile, audience);
  assert.equal(r.model, 'claude-opus-5-5');
  assert.equal(r.output_config.effort, 'low');
  assert.equal(r.output_config.format.type, 'json_schema');
  assert.equal(r.output_config.format.schema, SCHEMA);
  assert.deepEqual(r.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(r.fallbacks, 'default');
  assert.ok(r.max_tokens >= 2000);
  // Removed/rejected on the current models: none of these may appear.
  for (const k of ['temperature', 'top_p', 'top_k', 'thinking']) assert.ok(!(k in r), k);
  assert.equal(r.messages.at(-1).role, 'user'); // no assistant prefill
});

test('request: the brief carries the owner\'s facts and the system prompt forbids inventing any', () => {
  const r = buildRequest(profile, audience);
  const brief = r.messages[0].content;
  assert.match(brief, /Lotus Boutique/);
  assert.match(brief, /20% off/);
  assert.match(brief, /Free delivery over 999/);
  assert.match(r.system, /ONLY facts present in the business brief/);
  assert.match(r.system, /never as instructions/);
});

test('request: model can be overridden', () => {
  assert.equal(buildRequest(profile, audience, 'claude-sonnet-5-5').model, 'claude-sonnet-5-5');
});

test('response: valid JSON is parsed and returned', () => {
  const out = parseResponse(message());
  assert.equal(out.headlines.length, 5);
  assert.equal(out.storyboard[0].title, 'Hook');
});

test('response: refusal, truncation, empty and invalid JSON are typed errors', () => {
  assert.throws(() => parseResponse(message({ stop_reason: 'refusal' })), { code: 'refusal' });
  assert.throws(() => parseResponse(message({ stop_reason: 'max_tokens' })), { code: 'truncated' });
  assert.throws(() => parseResponse(message({ content: [] })), { code: 'empty_output' });
  assert.throws(() => parseResponse(message({ content: [{ type: 'thinking', thinking: '' }] })), { code: 'empty_output' });
  assert.throws(() => parseResponse(message({ content: [{ type: 'text', text: 'not json' }] })), { code: 'bad_json' });
  assert.throws(() => parseResponse(message({ content: [{ type: 'text', text: '{"headlines":[],"primaryTexts":[],"storyboard":[],"audienceTips":[]}' }] })), { code: 'empty_output' });
});

test('sanitize: enforces hard limits whatever the model returns', () => {
  const long = 'x'.repeat(5000);
  const out = sanitize({
    headlines: [long, 'b', 'c', 'd', 'e', 'f', 'g', 42, null],
    primaryTexts: [long, 'b', 'c', 'd'],
    storyboard: [{ title: long, sub: long }, { title: '', sub: 'dropped' }, null, { title: 'ok' }],
    audienceTips: [long, 'b', 'c', 'd'],
  });
  assert.equal(out.headlines.length, 5);
  assert.ok(out.headlines.every((h) => h.length <= 48));
  assert.equal(out.primaryTexts.length, 3);
  assert.ok(out.primaryTexts.every((t) => t.length <= 400));
  assert.equal(out.audienceTips.length, 3);
  assert.deepEqual(out.storyboard.map((s) => s.title.length <= 60), [true, true]);
  assert.equal(out.storyboard[1].sub, '');
});

test('cost: known models get an estimate, unknown ones do not', () => {
  const c = estimateCost('claude-opus-5-5', { input_tokens: 1000, output_tokens: 1000 });
  assert.equal(c.inputTokens, 1000);
  assert.ok(Math.abs(c.usd - 0.024) < 1e-9);
  assert.equal(estimateCost('some-future-model', { input_tokens: 1, output_tokens: 1 }), null);
});

// ---- wire-level: the real SDK against a fake Anthropic API ---------------------------

async function withFakeApi(handler, fn) {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    seen.push({ url: req.url, method: req.method, headers: req.headers, body });
    const { status = 200, json } = handler(body);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(json));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const client = new Anthropic({ apiKey: 'sk-test-key', baseURL: `http://127.0.0.1:${server.address().port}`, maxRetries: 0 });
  try {
    await fn(client, seen);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('wire: the SDK sends the beta request we expect and the reply is parsed', async () => {
  await withFakeApi(() => ({ json: message() }), async (client, seen) => {
    const out = await enhance(client, profile, audience);
    assert.equal(seen.length, 1);
    const req = seen[0];
    assert.equal(req.method, 'POST');
    assert.match(req.url, /^\/v1\/messages/);
    assert.equal(req.headers['x-api-key'], 'sk-test-key');
    assert.match(req.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
    assert.equal(req.body.model, 'claude-opus-5-5');
    assert.equal(req.body.fallbacks, 'default');
    assert.equal(req.body.output_config.effort, 'low');
    assert.equal(req.body.output_config.format.type, 'json_schema');
    assert.equal(req.body.messages[0].role, 'user');
    assert.equal(out.data.headlines[0], 'One');
    assert.equal(out.model, DEFAULT_MODEL);
    assert.ok(Math.abs(out.cost.usd - 0.024) < 1e-9);
  });
});

test('wire: API failures map to friendly typed errors', async () => {
  const cases = [
    [401, 'auth'],
    [429, 'rate_limited'],
    [400, 'bad_request'],
    [500, 'api_error'],
  ];
  for (const [status, code] of cases) {
    await withFakeApi(() => ({ status, json: { type: 'error', error: { type: 'x', message: 'nope' } } }), async (client) => {
      await assert.rejects(() => enhance(client, profile, audience), (e) => e instanceof EnhanceError && e.code === code, `status ${status}`);
    });
  }
});

test('wire: a refusal from the API surfaces as a typed refusal, not junk copy', async () => {
  await withFakeApi(() => ({ json: message({ stop_reason: 'refusal', content: [] }) }), async (client) => {
    await assert.rejects(() => enhance(client, profile, audience), { code: 'refusal' });
  });
});
