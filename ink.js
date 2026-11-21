const sampleCount = 144;
const turn = Math.PI * 2;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function seededRandom(id) {
  let seed = 2166136261;
  for (const character of id) seed = Math.imul(seed ^ character.codePointAt(0), 16777619);
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function sampleStroke(path, random) {
  const length = path.getTotalLength();
  const phase = random() * turn;
  const accent = random() * turn;
  const amplitude = .35 + random() * .42;
  return Array.from({ length: sampleCount }, (_, index) => {
    const fraction = index / sampleCount;
    const angle = fraction * turn;
    const point = path.getPointAtLength(fraction * length);
    const swell = Math.sin(angle * 3 + phase) * amplitude + Math.sin(angle * 5 + accent) * .22;
    const radialX = point.x - 50;
    const radialY = point.y - 50;
    const radius = Math.hypot(radialX, radialY) || 1;
    return [point.x + swell * radialX / radius, point.y + swell * radialY / radius];
  });
}

function brushOutline(points, phase, span, lane, weight, grain) {
  const leading = [];
  const trailing = [];
  const segments = Math.ceil(span * sampleCount);
  for (let step = 0; step <= segments; step++) {
    const progress = step / segments;
    const position = ((phase + progress * span) % 1) * sampleCount;
    const index = Math.floor(position);
    const fraction = position - index;
    const here = points[index];
    const next = points[(index + 1) % sampleCount];
    const x = here[0] + (next[0] - here[0]) * fraction;
    const y = here[1] + (next[1] - here[1]) * fraction;
    const dx = x - 50;
    const dy = y - 50;
    const radius = Math.hypot(dx, dy) || 1;
    const pressure = .48 + .52 * (.5 + .5 * Math.sin(progress * turn * 1.35 + grain));
    const taper = Math.min(1, Math.sqrt(progress * 14), Math.sqrt((1 - progress) * 14));
    const halfWidth = .045 + weight * pressure * taper;
    const edge = distance => (x + dx / radius * distance).toFixed(2) + ' ' +
      (y + dy / radius * distance).toFixed(2);
    leading.push(edge(lane + halfWidth));
    trailing.push(edge(lane - halfWidth));
  }
  return 'M' + leading.concat(trailing.reverse()).join('L') + 'Z';
}

export function attachInk(card, id) {
  const row = card.parentElement;
  const paths = [...card.querySelectorAll('.selection-ink path')];
  const random = seededRandom(id);
  const phase = random();
  const duration = 2150 + random() * 500;
  // Each end overlaps the other stroke while the radial lanes keep the two marks apart.
  const strokes = [
    { span: .74 + random() * .07, offset: 0, lane: 0, weight: .36 + random() * .15, grain: random() * turn },
    { span: .43 + random() * .055, offset: .63 + random() * .025, lane: 1.7, weight: .28 + random() * .17, grain: random() * turn },
  ];
  let sampled;
  let frame = 0;
  let start;
  let hovered = false;

  function paint(time) {
    frame = 0;
    if (!card.isConnected || !hovered) return;
    sampled ??= sampleStroke(paths[0], random);
    start ??= time;
    const progress = reducedMotion.matches ? 0 : (time - start) / duration;
    strokes.forEach(({ span, offset, lane, weight, grain }, i) => {
      paths[i].setAttribute('d', brushOutline(sampled, phase + progress + offset, span, lane, weight, grain));
    });
    card.classList.add('ink-active');
    if (!reducedMotion.matches) frame = requestAnimationFrame(paint);
  }

  function stopInk() {
    hovered = false;
    cancelAnimationFrame(frame);
    frame = 0;
    start = undefined;
    card.classList.remove('ink-active');
  }

  row.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || event.buttons || hovered) return;
    hovered = true;
    frame = requestAnimationFrame(paint);
  }, { passive: true });
  row.addEventListener('pointerleave', stopInk);
  row.addEventListener('pointercancel', stopInk);
  card.addEventListener('click', stopInk, { capture: true });
}
