const TAU = Math.PI * 2;
const bands = [
  ['#fa8f79', '#ffac94', '#f86e67'],
  ['#fdce50', '#ffe193', '#ffac67'],
  ['#ae91f7', '#d3bbff', '#8867f7'],
  ['#6750eb', '#9d88ff', '#6541ed'],
];

export function mountRibbon(canvas, rail) {
  const context = canvas.getContext('2d');
  if (!context) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const target = { x: .52, y: 0, strength: 0 };
  const motion = { x: .52, y: 0, strength: 0 };
  let width = 0;
  let height = 0;
  let frame = 0;
  let visible = true;
  let previous = 0;
  let phase = 0;
  let pressed = 0;
  let impulse = 0;
  let gradients = [];

  function point(x, band, edge) {
    const unit = x / width;
    const scroll = rail.scrollLeft * .003;
    const distance = (unit - motion.x) * 3.8;
    const influence = Math.exp(-distance * distance) * motion.strength;
    const base = Math.sin(unit * TAU * 1.22 - phase + scroll) * .12;
    const bow = influence * (motion.y * .36 + .08);
    const ripple = impulse * Math.sin(distance * 5 - phase * 15) * influence * .12;
    const twist = Math.sin(unit * 7.6 + phase * .9 + band * .72 + scroll + influence);
    return height * (.50 + base + bow + ripple + (band - 1.5) * .034 + twist * (.065 + band * .012) + edge * (.074 + .026 * twist));
  }

  function draw(time) {
    frame = 0;
    if (!width || !height) return;
    const dt = previous ? Math.min((time - previous) / 16.667, 3) : 1;
    previous = time;
    if (!reduced.matches) {
      const ease = 1 - Math.pow(.88, dt);
      for (const key of Object.keys(motion)) motion[key] += (target[key] - motion[key]) * ease;
      phase += .0048 * dt;
      impulse += (pressed - impulse) * ease;
      pressed *= Math.pow(.91, dt);
    }
    context.clearRect(0, 0, width, height);
    const count = Math.ceil(width / 9);
    const step = width / count;
    for (let band = 0; band < bands.length; band++) {
      context.beginPath();
      context.moveTo(0, point(0, band, -1));
      for (let i = 1; i <= count; i++) context.lineTo(i * step, point(i * step, band, -1));
      for (let i = count; i >= 0; i--) context.lineTo(i * step, point(i * step, band, 1));
      context.closePath();
      context.fillStyle = gradients[band];
      context.fill();
      for (const edge of [-.78, -.55, .68]) {
        context.beginPath();
        context.moveTo(0, point(0, band, edge));
        for (let i = 1; i <= count; i++) context.lineTo(i * step, point(i * step, band, edge));
        context.lineWidth = 1;
        context.strokeStyle = 'rgba(255,255,255,.29)';
        context.stroke();
      }
    }
    if (!reduced.matches) schedule();
  }

  function schedule() {
    if (!frame && visible && !document.hidden) frame = requestAnimationFrame(draw);
  }

  new ResizeObserver(([entry]) => {
    ({ width, height } = entry.contentRect);
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    gradients = bands.map(colors => {
      const gradient = context.createLinearGradient(0, height * .25, width, height * .65);
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(.55, colors[1]);
      gradient.addColorStop(1, colors[2]);
      return gradient;
    });
    schedule();
  }).observe(canvas);

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) cancelAnimationFrame(frame);
    if (!visible) frame = 0;
    schedule();
  }).observe(canvas);

  function follow(event) {
    if (reduced.matches) return;
    const bounds = canvas.getBoundingClientRect();
    target.x = (event.clientX - bounds.left) / (bounds.width || 1);
    target.y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / (bounds.height || 1) * 2 - 1));
    target.strength = 1;
  }

  rail.addEventListener('pointermove', follow, { passive: true });
  rail.addEventListener('pointerdown', event => {
    follow(event);
    pressed = 1.6;
  }, { passive: true });
  for (const type of ['pointerleave', 'pointercancel', 'pointerup']) {
    rail.addEventListener(type, event => {
      if (type !== 'pointerup' || event.pointerType !== 'mouse') target.strength = 0;
    }, { passive: true });
  }
  rail.addEventListener('scroll', schedule, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      phase = impulse = pressed = target.strength = motion.strength = 0;
    }
    schedule();
  });
}
