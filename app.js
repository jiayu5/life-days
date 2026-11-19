import { today, duration } from './dates.js';
import { mountDeck } from './deck.js';
import { attachInk } from './ink.js';

const byId = id => document.getElementById(id);
const dialog = byId('editor');
const form = byId('event-form');
const deleteButton = byId('delete');
const submit = form.querySelector('[type="submit"]');
const number = new Intl.NumberFormat('zh-CN');
let events = [];
let editing = null;
let busy = false;

async function api(method = 'GET', data) {
  const response = await fetch('/api/events', {
    method, headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!response.ok) throw new Error(response.status === 401 ? '请用站主的 ChatGPT 账号登录后重试。' : '暂时无法连接，请稍后重试。');
  return response.json();
}

function element(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function edit(event = null) {
  editing = event;
  form.reset();
  form.elements.title.value = event?.title || '';
  form.elements.day.value = event?.day || today();
  form.elements.note.value = event?.note || '';
  byId('form-title').textContent = event ? '编辑日子' : '新增日期';
  byId('form-error').textContent = '';
  deleteButton.hidden = !event;
  dialog.showModal();
}

const detail = byId('detail');
const rail = byId('rail');
const track = byId('events');
const incomingYear = byId('year-in');
const outgoingYear = byId('year-out');
const galleryYear = incomingYear.parentElement;
const deck = mountDeck(rail, track, showGalleryYear);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let activeId = null;
let reveal = null;
let returning = false;
let detailAnimations = [];
let markerButtons = new Map();

function showGalleryYear(year, progress) {
  galleryYear.style.setProperty('--year-shift', (-progress * 26).toFixed(1) + 'px');
  const oldYear = incomingYear.textContent;
  if (oldYear === year) return;

  incomingYear.getAnimations().forEach(animation => animation.cancel());
  outgoingYear.getAnimations().forEach(animation => animation.cancel());
  outgoingYear.textContent = '';
  incomingYear.textContent = year;

  if (!oldYear || !year || reducedMotion.matches) return;
  const direction = Number(year) > Number(oldYear) ? 1 : -1;
  const timing = { duration: 420, easing: 'cubic-bezier(.2,.7,.25,1)' };
  outgoingYear.textContent = oldYear;
  const outgoing = outgoingYear.animate([
    { opacity: 1, transform: 'translateX(0)' },
    { opacity: 0, transform: 'translateX(' + (-direction * 38) + 'px)' },
  ], timing);
  outgoing.onfinish = () => { outgoingYear.textContent = ''; };
  incomingYear.animate([
    { opacity: 0, transform: 'translateX(' + (direction * 38) + 'px)' },
    { opacity: 1, transform: 'translateX(0)' },
  ], timing);
}

function fillDetail(event) {
  const elapsed = duration(event.day, today());
  byId('detail-year').textContent = event.day.slice(0, 4);
  detail.dataset.palette = String(palette(event));
  byId('detail-date').dateTime = event.day;
  byId('detail-date').textContent = event.day.replaceAll('-', '.');
  byId('detail-title').textContent = event.title;
  byId('detail-note').textContent = event.note;
  byId('detail-note').hidden = !event.note;
  byId('detail-duration').textContent = elapsed.label;
  byId('detail-count').textContent = number.format(Math.abs(elapsed.difference));
}

function showDetail(event) {
  const card = markerButtons.get(event.id).getBoundingClientRect();
  const insets = [card.top, innerWidth - card.right, innerHeight - card.bottom, card.left];
  const origin = insets.map(value => Math.max(0, value) + 'px').join(' ');
  activeId = event.id;
  fillDetail(event);
  detail.scrollTop = 0;
  detail.showModal();
  if (!reducedMotion.matches && typeof detail.animate === 'function') {
    reveal = detail.animate([
      { clipPath: 'inset(' + origin + ' round 12px)' },
      { clipPath: 'inset(0px 0px 0px 0px round 0px)' },
    ], { duration: 680, easing: 'cubic-bezier(.19,1,.22,1)' });
    detailAnimations = [...detail.querySelectorAll('.detail-content > *, #detail-year')].map((node, index) => node.animate([
      { opacity: 0, translate: '0 34px' },
      { opacity: 1, translate: '0 0' },
    ], { duration: 540, delay: 130 + index * 65, fill: 'backwards', easing: 'cubic-bezier(.18,.86,.3,1)' }));
  }
}

function closeDetail() {
  const target = markerButtons.get(activeId) || document.querySelector('.add');
  detail.close();
  reveal?.cancel();
  reveal = null;
  detailAnimations.forEach(animation => animation.cancel());
  detailAnimations = [];
  activeId = null;
  returning = false;
  target.focus({ preventScroll: true });
}

function returnToRail() {
  if (returning) return;
  if (reveal && !reducedMotion.matches) {
    returning = true;
    reveal.effect.updateTiming({ fill: 'both' });
    reveal.onfinish = closeDetail;
    reveal.updatePlaybackRate(-1.7);
    reveal.play();
  } else {
    closeDetail();
  }
}

byId('return').addEventListener('click', returnToRail);
detail.addEventListener('cancel', event => {
  event.preventDefault();
  returnToRail();
});
byId('edit-event').addEventListener('click', () => {
  const event = events.find(item => item.id === activeId);
  if (event) edit(event);
});

function updateRailControls() {
  const max = rail.scrollWidth - rail.clientWidth;
  byId('rail-controls').hidden = max <= 2;
  byId('back').disabled = rail.scrollLeft <= 2;
  byId('forward').disabled = rail.scrollLeft >= max - 2;
}

rail.addEventListener('scroll', updateRailControls, { passive: true });
new ResizeObserver(updateRailControls).observe(rail);
byId('back').addEventListener('click', () => deck.step(-1));
byId('forward').addEventListener('click', () => deck.step(1));

function palette(event) {
  return [...event.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 4;
}

function render() {
  const date = today();
  const stops = [...events].sort((a, b) => a.day.localeCompare(b.day));
  const oldFocus = [...markerButtons].find(([, button]) => button === document.activeElement)?.[0];
  markerButtons = new Map();
  byId('status').textContent = stops.length ? '' : '点击 Add，记下第一个大日子。';
  byId('status').hidden = stops.length > 0;
  track.replaceChildren(...stops.map(event => {
    const row = element('li', '', 'stop');
    row.dataset.tone = palette(event);
    row.dataset.year = event.day.slice(0, 4);
    const button = element('button', '', 'day-card');
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'dialog');
    button.addEventListener('click', () => showDetail(event));
    markerButtons.set(event.id, button);

    const dateLabel = element('time', event.day.replaceAll('-', '.'));
    dateLabel.dateTime = event.day;
    const artwork = element('span', '', 'cover-art');
    artwork.setAttribute('aria-hidden', 'true');
    artwork.append(element('span', event.day.slice(8), 'cover-day'));
    button.append(dateLabel, artwork, element('span', event.title, 'card-title'), byId('selection-ink').content.cloneNode(true));
    row.append(button);
    attachInk(button, event.id);
    return row;
  }));
  if (oldFocus) markerButtons.get(oldFocus)?.focus({ preventScroll: true });
  if (detail.open) {
    const active = events.find(event => event.id === activeId);
    if (active) fillDetail(active);
    else closeDetail();
  }
  updateRailControls();
  lastDate = date;
}

async function load() {
  try {
    events = await api();
    render();
    document.querySelectorAll('.add').forEach(button => { button.disabled = false; });
    return true;
  } catch (error) {
    const retry = element('button', '重试', 'retry');
    retry.addEventListener('click', load);
    byId('status').replaceChildren(error.message + ' ', retry);
    byId('status').hidden = false;
    return false;
  }
}

async function persist(method, data) {
  if (busy) return;
  busy = submit.disabled = deleteButton.disabled = true;
  byId('form-error').textContent = '';
  try {
    const saved = await api(method, data);
    events = events.filter(event => event.id !== data.id);
    if (method !== 'DELETE') events.push(saved);
    dialog.close();
    render();
  } catch (error) {
    byId('form-error').textContent = error.message;
  } finally {
    busy = submit.disabled = deleteButton.disabled = false;
  }
}

document.querySelectorAll('.add').forEach(button => button.addEventListener('click', () => edit()));
dialog.querySelector('.close').addEventListener('click', () => { if (!busy) dialog.close(); });
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
form.addEventListener('submit', event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (!data.title.trim()) {
    byId('form-error').textContent = '请填写事件名称。';
    return;
  }
  data.id = editing?.id || crypto.randomUUID();
  persist('PUT', data);
});
deleteButton.addEventListener('click', () => {
  if (window.confirm('确定删除这个日子吗？')) persist('DELETE', { id: editing.id });
});
let lastDate;
let loaded = await load();
setInterval(() => { if (lastDate && today() !== lastDate) render(); }, 30000);
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden && !dialog.open && !busy && (lastDate || !loaded)) loaded = await load();
});
