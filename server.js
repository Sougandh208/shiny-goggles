// NovaAd server: serves the static app and one optional API route that asks
// Claude to polish the copy. No framework, no build step.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MODEL, EnhanceError, createClient, enhance } from './src/enhance.js';
import { buildAudience, validateProfile } from './public/js/engine/index.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const MAX_BODY = 16 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

// All assets are same-origin. blob:/data: are needed for user-picked images and
// the rendered video preview; nothing the user uploads ever leaves the browser.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new EnhanceError('Request too large.', { status: 413, code: 'too_large' });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Small in-memory limiter: the AI route costs real money when a key is set.
const hits = new Map();
export function rateLimited(ip, now = Date.now(), limit = 12, windowMs = 60_000) {
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return arr.length > limit;
}

async function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, 'Bad request', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  if (rel.includes('\0')) return send(res, 400, 'Bad request', { 'Content-Type': 'text/plain; charset=utf-8' });
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    const data = await readFile(file);
    const ext = path.extname(file).toLowerCase();
    send(res, 200, req.method === 'HEAD' ? '' : data, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
  } catch {
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}

export function createServer({ client = createClient(), model = process.env.NOVAAD_MODEL || DEFAULT_MODEL, enhanceFn = enhance } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');

      if (url.pathname === '/api/status' && req.method === 'GET') {
        return sendJson(res, 200, { ai: Boolean(client), model: client ? model : null });
      }

      if (url.pathname === '/api/enhance') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });
        if (!client) return sendJson(res, 503, { error: 'Claude is not configured on this server.', code: 'not_configured' });
        if (rateLimited(req.socket.remoteAddress || 'unknown')) return sendJson(res, 429, { error: 'Too many requests. Wait a minute.', code: 'rate_limited' });
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) return sendJson(res, 415, { error: 'Send JSON.' });

        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch (e) {
          if (e instanceof EnhanceError) return sendJson(res, e.status, { error: e.message, code: e.code });
          return sendJson(res, 400, { error: 'Invalid JSON.' });
        }
        // Never trust the client: re-validate the brief and rebuild the audience on the server.
        const checked = validateProfile(body?.profile);
        if (!checked.ok) return sendJson(res, 400, { error: 'Invalid business brief.', fields: checked.errors });
        const audience = buildAudience(checked.profile);
        const out = await enhanceFn(client, checked.profile, audience, model);
        return sendJson(res, 200, out);
      }

      if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found.' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return serveStatic(req, res, url.pathname);
    } catch (err) {
      if (err instanceof EnhanceError) return sendJson(res, err.status, { error: err.message, code: err.code });
      console.error('Unhandled error:', err);
      return sendJson(res, 500, { error: 'Something went wrong.' });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  const client = createClient();
  const model = process.env.NOVAAD_MODEL || DEFAULT_MODEL;
  createServer({ client, model }).listen(port, host, () => {
    console.log(`NovaAd running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    console.log(client ? `Claude polish: ON (${model})` : 'Claude polish: off (set ANTHROPIC_API_KEY to enable). Everything else works without it.');
  });
}
