export function mountDeck(canvas, rail, track) {
  const context = canvas.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let height = 0;
  let frame = 0;
  let cards = [];

  function schedule() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function measure() {
    cards = Array.from(track.children, node => ({
      node,
      center: node.offsetLeft + node.offsetWidth / 2,
    }));
    schedule();
  }

  function draw() {
    frame = 0;
    if (!width || !height) return;
    const scroll = rail.scrollLeft;
    const depth = Math.min(85, height * .12);
    const curve = x => -depth * ((x - width / 2) / (width / 2)) ** 2;
    for (const { node, center } of cards) {
      const x = center - scroll;
      if (x < -300 || x > width + 300) continue;
      const visibleX = Math.max(0, Math.min(width, x));
      node.style.setProperty('--rise', curve(visibleX).toFixed(1) + 'px');
      node.style.setProperty('--lean', ((visibleX * 2 / width - 1) * -13).toFixed(1) + 'deg');
    }
    if (!context) return;
    context.clearRect(0, 0, width, height);
    if (cards.length < 2) return;
    context.beginPath();
    context.moveTo(0, height / 2 - depth);
    context.quadraticCurveTo(width / 2, height / 2 + depth, width, height / 2 - depth);
    context.strokeStyle = '#5e64554a';
    context.stroke();
  }

  new ResizeObserver(([entry]) => {
    ({ width, height } = entry.contentRect);
    if (context) {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    measure();
  }).observe(canvas);
  new ResizeObserver(measure).observe(track);
  new MutationObserver(measure).observe(track, { childList: true });
  rail.addEventListener('scroll', schedule, { passive: true });
  rail.addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || rail.scrollWidth <= rail.clientWidth) return;
    const unit = event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? rail.clientWidth : 1;
    event.preventDefault();
    rail.scrollLeft += event.deltaY * unit;
  }, { passive: false });
  rail.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    const buttons = Array.from(track.querySelectorAll('button'));
    const index = buttons.indexOf(event.target);
    const next = buttons[index < 0 ? (direction > 0 ? 0 : buttons.length - 1) : index + direction];
    if (!next) return;
    event.preventDefault();
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  });
}
