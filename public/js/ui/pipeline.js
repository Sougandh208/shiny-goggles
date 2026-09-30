// The "engine at work" overlay. Each step really runs (and prints a real result
// from the engine); the short pauses between steps are only there so a person
// can follow along, and Skip removes them.

import { $, clear, h } from './dom.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{label:string, minMs?:number, run:(signal:AbortSignal)=>Promise<string>|string, onError?:(e:Error)=>string}[]} steps
 */
export async function runPipeline(steps) {
  const overlay = $('#pipeline');
  const list = $('#pipe-steps');
  const skip = $('#pipe-skip');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const previousFocus = document.activeElement;
  let fast = reduce;
  const ac = new AbortController();

  clear(list);
  const rows = steps.map((s) => {
    const out = h('span', { class: 'out' });
    const li = h('li', null, h('span', { class: 'dot' }), h('span', null, s.label, out));
    list.append(li);
    return { li, out };
  });
  overlay.hidden = false;
  skip.onclick = () => {
    fast = true;
    ac.abort();
  };
  skip.focus();

  for (const [i, s] of steps.entries()) {
    const { li, out } = rows[i];
    li.classList.add('active');
    const started = performance.now();
    let text;
    try {
      text = await s.run(ac.signal);
    } catch (e) {
      text = s.onError ? s.onError(e) : `skipped: ${e.message}`;
    }
    if (!fast) await sleep(Math.max(0, (s.minMs ?? 420) - (performance.now() - started)));
    li.classList.remove('active');
    li.classList.add('done');
    if (text) out.textContent = text;
  }
  if (!fast) await sleep(500);
  overlay.hidden = true;
  previousFocus?.focus?.();
}
