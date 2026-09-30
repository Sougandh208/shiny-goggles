// Ambient "neural network" background: drifting nodes joined by faint links.
// Cheap (capped node count and DPR), pauses when the tab is hidden, and draws a
// single still frame for people who prefer reduced motion.

export function startNeural(canvas) {
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const colors = ['34,228,255', '139,92,246', '255,61,154'];
  let W = 0;
  let H = 0;
  let nodes = [];
  let raf = 0;
  const pointer = { x: -999, y: -999 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.max(24, Math.min(70, Math.round((W * H) / 26000)));
    nodes = Array.from({ length: count }, (_, i) => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.28,
      r: Math.random() * 1.6 + 0.8,
      c: colors[i % colors.length],
    }));
    if (reduce.matches) frame(true);
  }

  function frame(still = false) {
    ctx.clearRect(0, 0, W, H);
    const link = 150;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (!still) {
        a.x += a.vx;
        a.y += a.vy;
        if (a.x < -20) a.x = W + 20;
        if (a.x > W + 20) a.x = -20;
        if (a.y < -20) a.y = H + 20;
        if (a.y > H + 20) a.y = -20;
        const dx = pointer.x - a.x;
        const dy = pointer.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 22000) {
          a.x -= dx * 0.0009;
          a.y -= dy * 0.0009;
        }
      }
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < link) {
          ctx.strokeStyle = `rgba(${a.c},${(1 - d / link) * 0.22})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.fillStyle = `rgba(${a.c},0.75)`;
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop() {
    frame();
    raf = requestAnimationFrame(loop);
  }

  function run() {
    cancelAnimationFrame(raf);
    if (reduce.matches || document.hidden) return;
    raf = requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  }, { passive: true });
  document.addEventListener('visibilitychange', run);
  reduce.addEventListener?.('change', () => { resize(); run(); });
  resize();
  run();
}
