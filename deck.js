export function mountDeck(rail, track) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let cards = [];
  let targetIndex = 0;
  let wheelTime = -Infinity;
  let lastWheelEvent = -Infinity;
  let wheelDistance = 0;
  let drag = null;
  let suppressClick = false;
  let touchSnap;
  let tiltedCard = null;

  function tiltCard(card, event) {
    if (tiltedCard !== card) {
      tiltedCard?.style.removeProperty('--tilt-x');
      tiltedCard?.style.removeProperty('--tilt-y');
      tiltedCard = card;
    }
    if (!card) return;
    const bounds = card.parentElement.getBoundingClientRect();
    const horizontal = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
    const vertical = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
    card.style.setProperty('--tilt-x', (-vertical * 14).toFixed(2) + 'deg');
    card.style.setProperty('--tilt-y', (horizontal * 17).toFixed(2) + 'deg');
  }

  rail.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || reducedMotion.matches || drag) return;
    tiltCard(event.target.closest('.stop')?.firstElementChild ?? null, event);
  }, { passive: true });
  rail.addEventListener('pointerleave', () => tiltCard(null));
  rail.addEventListener('pointerout', event => {
    if (tiltedCard && !tiltedCard.parentElement?.contains(event.relatedTarget)) tiltCard(null);
  });
  rail.addEventListener('pointerdown', () => tiltCard(null));
  reducedMotion.addEventListener('change', () => tiltCard(null));

  function schedule() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function measure() {
    cards = Array.from(track.children, node => ({
      node,
      center: node.offsetLeft + node.offsetWidth / 2,
    }));
    targetIndex = nearest();
    schedule();
  }

  function draw() {
    frame = 0;
    const width = rail.clientWidth;
    if (!width) return;
    const middle = rail.scrollLeft + width / 2;
    const spacing = cards.length > 1 ? cards[1].center - cards[0].center : width;

    for (const { node, center } of cards) {
      const distance = (center - middle) / spacing;
      const angle = Math.atan(distance * .83);
      const depth = 1 - Math.cos(angle);
      node.style.setProperty('--rise', (-depth * 48).toFixed(2) + 'px');
      node.style.setProperty('--yaw', (angle * -44).toFixed(2) + 'deg');
      node.style.setProperty('--lean', (angle * -7).toFixed(2) + 'deg');
      node.style.setProperty('--depth', (1 - depth * .29).toFixed(3));
      node.style.setProperty('--stack', Math.max(0, 100 - Math.round(Math.abs(distance) * 20)));
    }
  }

  function nearest() {
    const center = rail.scrollLeft + rail.clientWidth / 2;
    let index = 0;
    for (let i = 1; i < cards.length; i++) {
      if (Math.abs(cards[i].center - center) < Math.abs(cards[index].center - center)) index = i;
    }
    return index;
  }

  function centerCard(index) {
    if (!cards.length) return;
    targetIndex = Math.max(0, Math.min(cards.length - 1, index));
    rail.scrollTo({
      left: cards[targetIndex].center - rail.clientWidth / 2,
      behavior: reducedMotion.matches ? 'instant' : 'smooth',
    });
  }

  function step(direction) {
    centerCard(nearest() + direction);
  }

  new ResizeObserver(measure).observe(track);
  new ResizeObserver(measure).observe(rail);
  new MutationObserver(measure).observe(track, { childList: true });
  rail.addEventListener('scroll', schedule, { passive: true });
  rail.addEventListener('wheel', event => {
    if (event.ctrlKey || cards.length < 2) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    event.preventDefault();
    const now = performance.now();
    if (now - lastWheelEvent > 420) {
      targetIndex = nearest();
      wheelDistance = 0;
    }
    lastWheelEvent = now;
    const unit = event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? rail.clientWidth : 1;
    wheelDistance += delta * unit;
    if (Math.abs(wheelDistance) < 36 || now - wheelTime < 220) return;
    wheelTime = now;
    centerCard(targetIndex + Math.sign(wheelDistance));
    wheelDistance = 0;
  }, { passive: false });

  rail.addEventListener('pointerdown', event => {
    clearTimeout(touchSnap);
    suppressClick = false;
    if (event.pointerType !== 'mouse' || event.button !== 0 || cards.length < 2) return;
    drag = { id: event.pointerId, start: event.clientX, scroll: rail.scrollLeft };
  });
  window.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const distance = event.clientX - drag.start;
    if (!suppressClick && Math.abs(distance) < 7) return;
    if (!suppressClick) {
      rail.setPointerCapture(event.pointerId);
      rail.classList.add('dragging');
      suppressClick = true;
    }
    rail.scrollLeft = drag.scroll - distance;
  });
  function endDrag(event) {
    if (event.pointerType === 'touch' && cards.length > 1) {
      clearTimeout(touchSnap);
      touchSnap = setTimeout(() => centerCard(nearest()), 420);
    }
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    rail.classList.remove('dragging');
    if (suppressClick) centerCard(nearest());
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  rail.addEventListener('click', event => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }, true);

  rail.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || !cards.length) return;
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    const current = cards.findIndex(({ node }) => node.contains(event.target));
    const next = current < 0 ? nearest() : current + direction;
    if (!cards[next]) return;
    event.preventDefault();
    cards[next].node.firstElementChild.focus({ preventScroll: true });
    centerCard(next);
  });
  return { step };
}
