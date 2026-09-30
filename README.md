# NovaAd: AI ad studio for small businesses

Small shops, home sellers, boutiques and early-stage startups usually run ads without a marketer or an analyst. NovaAd takes a two-minute business brief and produces:

| | |
|---|---|
| **Who to target** | Core customer and two secondary personas, radius, best hours and days, Google keywords and negative keywords |
| **Where the money goes** | A budget split across Instagram, Facebook, Google and YouTube, sized so no platform is starved of learning data, with a reserve for winners |
| **What to expect** | Cautious / expected / optimistic forecasts of reach, clicks, results and ROAS, next to your own **break-even ROAS** and the most you can pay per click |
| **Posters** | Five styles in four sizes (feed, 4:5, story with safe zones, landscape) as PNGs, using your photo and logo if you add them |
| **A video ad** | 8 to 20 seconds, vertical / 4:5 / square, animated scenes and generated royalty-free music, recorded on your device as MP4 (WebM where the browser can't do MP4) |
| **Copy** | Headlines, captions, hashtags, and a Google search ad that stays inside Google's 30/90 character limits |
| **An ad coach** | Paste real numbers from your dashboard. It computes CTR, CPC, CPM, CVR, cost per result and ROAS and says **scale, keep, fix or pause**, judged against *your* margin, so underperformers stop draining the budget |
| **A kit** | Posters, video, plan and copy in one `.zip` |

## Run it

```bash
npm install
npm start            # http://127.0.0.1:3000
```

Node 20+ is required. There is no build step and nothing to configure: the whole app works without any API key.

Optional Claude polish (rewrites headlines, captions, the video storyboard and gives targeting tips):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm start
# or: node --env-file=.env server.js
```

| Variable | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Turns on the "Polish copy with Claude" option |
| `NOVAAD_MODEL` | `claude-opus-5-5` | Any Claude model id; a smaller model costs less |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Set `HOST=0.0.0.0` to serve other machines (put it behind HTTPS) |

A Claude call is one short structured request (on the order of 1k tokens in and 1k out, plus some reasoning), so a few cents per campaign at the default model. The UI shows the estimate the API reports.

## What is "AI" here, honestly

- **The local engine is rule-based, not a neural network.** It is a transparent knowledge base (`public/js/engine/knowledge.js`) plus arithmetic: rounded public industry benchmarks per platform, scaled by a region cost index, category and goal. Every number it prints can be traced to a line of code. That is a deliberate choice: an owner can trust and audit it, and it costs nothing to run.
- **Forecasts are estimates, not promises.** Real results depend on your photos, offer, season and competitors. The UI and the exported plan say so wherever numbers appear. Currency conversion uses fixed approximate rates.
- **Posters and video are drawn by a design engine, not a generative image model.** Layout, type fitting and animation are computed on a canvas. That is why they render in seconds, cost nothing, and never hallucinate your product or spelling.
- **Claude is optional and constrained.** It only sees the brief, may only use facts in it, returns schema-validated JSON, and is clipped server-side. It can reword the hook, product and offer lines, but the final call-to-action card always keeps your own words and contact details. If it fails or refuses, the built-in copy is used.
- **The engine never invents claims.** Free delivery, warranties, discounts and guarantees appear only if you type them in. Default phrases are neutral.

## Budget-safe by design

- Platforms are dropped until each remaining one gets at least a learning minimum per day; tiny budgets go to one platform with a "run your best 3 to 4 days" tip.
- 10% of the budget is a reserve you move into whatever proves it pays.
- The 30-day playbook has concrete pause, creative, scale and ceiling rules in your own currency ("pause any ad that has spent ₹1,080 with no results").
- Break-even is your `1 / margin`, not a generic "good ROAS".

## Privacy and security

- Photos and logos are read and drawn in the browser and are never uploaded. The brief is saved in your browser's `localStorage` (not on a server) so you can come back to it.
- The only server route that does work is `POST /api/enhance`. It re-validates the brief, rebuilds the audience itself, caps the body at 16 KB, limits each client address to 12 calls a minute (it does not trust `X-Forwarded-For`, so behind a proxy all users share one bucket: raise the limit or put the limiter in the proxy), and never returns internal errors.
- Strict CSP (`script-src 'self'`, no inline script or style), `nosniff`, no referrer. All user text is inserted with `textContent`, never `innerHTML`.

## Browser notes

Video recording uses `MediaRecorder`. Recent Chrome, Edge and Safari save **MP4** (what Instagram and Facebook prefer). Firefox, and Chromium builds without proprietary codecs, save **WebM** instead; the app tells you when that happens, and any free converter handles it. Rendering is real time (an 8 s video takes about 9 s) and needs the tab in front: browsers pause drawing in background tabs, so NovaAd stops and tells you rather than saving a frozen video.

## Tests

```bash
npm test         # 52 unit/integration tests: engine maths, copy limits, ZIP (verified with `unzip -t`),
                 # server security, and the Claude request/response path against a fake Anthropic API
npm run e2e      # 23 browser checks in Chromium: the whole flow, real downloads, audio in the rendered
                 # video, XSS attempts, the Claude success and failure paths, and no sideways scroll on a phone
```

`npm run e2e` needs a Chromium that matches the pinned Playwright (`npx playwright install chromium`), or set `CHROME_PATH` to a Chrome/Chromium binary.

The Claude integration is tested against a local stand-in for the API (exact request path, beta header, `fallbacks`, JSON-schema output, and every error mapping). It has not been run against the live API in this repository's CI, so try it with your key before you rely on it.

## Layout

```
server.js               static files + /api/status + /api/enhance
src/enhance.js          Claude request/response, validation, cost estimate
public/js/engine/       knowledge, budget & forecasts, audience, copy, coach (pure, DOM-free, shared with the server)
public/js/render/       poster + video renderers, soundtrack synth, ZIP writer
public/js/ui/           views (brief, strategy, creative, video, coach), charts, pipeline overlay
test/                   node:test suites + Playwright e2e
```

## Extending it

- New business type: add an entry to `CATEGORIES` in `knowledge.js` (audience, weights, keywords, neutral benefits). The tests sweep every category × tone × goal × region.
- New region: add it to `REGIONS` (currency, cost index, minimum daily spend per platform).
- New poster style: add a background to `BACKGROUNDS`, a palette in `themePalette`, and an entry in `THEMES` / `STYLE` in `render/poster.js`. Video reuses it automatically.
