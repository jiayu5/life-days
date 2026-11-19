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

function coordinate(points, position) {
  const index = Math.floor(position);
  const lower = points[index % sampleCount];
  const upper = points[(index + 1) % sampleCount];
  const fraction = position - index;
  return lower.map((value, axis) => (value + (upper[axis] - value) * fraction).toFixed(2)).join(' ');
}

function trace(points, phase, span) {
  const start = (phase % 1) * sampleCount;
  const end = start + span * sampleCount;
  let commands = 'M' + coordinate(points, start);
  for (let index = Math.floor(start) + 1; index < end; index++) {
    commands += 'L' + points[index % sampleCount].map(value => value.toFixed(2)).join(' ');
  }
  return commands + 'L' + coordinate(points, end);
}

export function attachInk(card, id) {
  const row = card.parentElement;
  const paths = [...card.querySelectorAll('.selection-ink path')];
  const random = seededRandom(id);
  const phase = random();
  const duration = 2150 + random() * 500;
  const spans = [.7 + random() * .11, .37 + random() * .09];
  const offsets = [0, .44 + random() * .07];
  paths.forEach(path => path.style.strokeWidth = (1.45 + random() * .8).toFixed(2));
  let sampled;
  let frame = 0;
  let start;
  let hovered = false;
  let focused = false;

  function paint(time) {
    frame = 0;
    if (!card.isConnected || (!hovered && !focused)) return;
    sampled ??= paths.map(path => sampleStroke(path, random));
    start ??= time;
    const progress = reducedMotion.matches ? 0 : (time - start) / duration;
    paths.forEach((path, i) => path.setAttribute('d', trace(sampled[i], phase + progress + offsets[i], spans[i])));
    if (!reducedMotion.matches) frame = requestAnimationFrame(paint);
  }

  function update() {
    if (hovered || focused) {
      if (!frame) frame = requestAnimationFrame(paint);
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      start = undefined;
    }
  }

  row.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse') return;
    hovered = true;
    update();
  });
  row.addEventListener('pointerleave', () => { hovered = false; update(); });
  card.addEventListener('focus', () => { focused = card.matches(':focus-visible'); update(); });
  card.addEventListener('blur', () => { focused = false; update(); });
}
