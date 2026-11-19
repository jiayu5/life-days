import { today, duration } from './dates.js';

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
  byId('form-title').textContent = event ? '编辑日子' : '记一个日子';
  byId('form-error').textContent = '';
  deleteButton.hidden = !event;
  dialog.showModal();
}

const detail = byId('detail');
const rail = byId('rail');
const track = byId('events');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let activeId = null;
let reveal = null;
let markerButtons = new Map();

function fillDetail(event) {
  const elapsed = duration(event.day, today());
  byId('detail-date').dateTime = event.day;
  byId('detail-date').textContent = event.day.replaceAll('-', '.');
  byId('detail-title').textContent = event.title;
  byId('detail-note').textContent = event.note;
  byId('detail-note').hidden = !event.note;
  byId('detail-duration').textContent = elapsed.label;
  byId('detail-count').textContent = number.format(Math.abs(elapsed.difference));
}

function showDetail(event) {
  const pin = markerButtons.get(event.id).querySelector('.pin').getBoundingClientRect();
  const x = pin.left + pin.width / 2;
  const y = pin.top + pin.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  activeId = event.id;
  fillDetail(event);
  detail.scrollTop = 0;
  detail.showModal();
  if (!reducedMotion.matches && typeof detail.animate === 'function') {
    reveal = detail.animate([
      { clipPath: `circle(9px at ${x}px ${y}px)` },
      { clipPath: `circle(${radius + 8}px at ${x}px ${y}px)` },
    ], { duration: 620, easing: 'cubic-bezier(.2,.65,.2,1)' });
  }
}

function closeDetail() {
  const target = markerButtons.get(activeId) || document.querySelector('.add');
  detail.close();
  reveal?.cancel();
  reveal = null;
  activeId = null;
  target.focus({ preventScroll: true });
}

function returnToRail() {
  if (reveal?.playbackRate < 0) return;
  if (reveal && !reducedMotion.matches) {
    reveal.effect.updateTiming({ fill: 'both' });
    reveal.onfinish = closeDetail;
    reveal.reverse();
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
byId('back').addEventListener('click', () => rail.scrollBy({ left: -rail.clientWidth * .72 }));
byId('forward').addEventListener('click', () => rail.scrollBy({ left: rail.clientWidth * .72 }));

function render() {
  const date = today();
  const stops = [...events, { title: '今天', day: date }].sort((a, b) => a.day.localeCompare(b.day));
  const oldFocus = [...markerButtons].find(([, button]) => button === document.activeElement)?.[0];
  markerButtons = new Map();
  byId('status').textContent = events.length ? '' : '记下你的第一个大日子。';
  byId('status').hidden = events.length > 0;
  byId('hint').hidden = !events.length;
  track.replaceChildren(...stops.map(event => {
    const row = element('li', '', 'stop');
    const label = element('span', '', 'marker-label');
    const dateLabel = element('time', event.day.replaceAll('-', '.'));
    dateLabel.dateTime = event.day;
    label.append(dateLabel, element('span', event.title, 'marker-name'));
    const pin = element('span', '', 'pin');
    pin.setAttribute('aria-hidden', 'true');
    const marker = event.id ? element('button', '') : element('div', '', 'now');
    if (event.id) {
      marker.type = 'button';
      marker.setAttribute('aria-haspopup', 'dialog');
      marker.addEventListener('click', () => showDetail(event));
      markerButtons.set(event.id, marker);
    }
    marker.append(pin, label);
    row.append(marker);
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
