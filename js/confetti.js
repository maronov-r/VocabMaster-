// confetti.js — tiny dependency-free canvas confetti burst for celebrations.
export function burst(opts = {}) {
  const {
    count = 120,
    colors = ['#FF5964', '#FFC24B', '#3DDC97', '#5B8DEF', '#B48DEF', '#FF8FB1'],
    duration = 2200,
  } = opts;

  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const resize = () => {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  resize();

  const W = () => canvas.width, H = () => canvas.height;
  const parts = Array.from({ length: count }, () => ({
    x: W() / 2 + (Math.random() - 0.5) * W() * 0.3,
    y: H() * 0.35 + (Math.random() - 0.5) * 60 * dpr,
    vx: (Math.random() - 0.5) * 16 * dpr,
    vy: (Math.random() * -10 - 6) * dpr,
    g: (0.32 + Math.random() * 0.18) * dpr,
    size: (6 + Math.random() * 8) * dpr,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    color: colors[(Math.random() * colors.length) | 0],
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
  }));

  const start = performance.now();
  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, W(), H());
    for (const p of parts) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.99;
      p.rot += p.vr;
      const alpha = Math.max(0, 1 - t / duration);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (t < duration) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  }
  addEventListener('resize', resize);
  requestAnimationFrame(frame);
  setTimeout(() => removeEventListener('resize', resize), duration + 100);
}
