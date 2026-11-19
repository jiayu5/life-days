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

function render() {
  const date = today();
  const sorted = [...events].sort((a, b) => a.day.localeCompare(b.day));
  const featured = events.find(event => event.id === 'birthday') || sorted[0];
  byId('status').textContent = sorted.length ? '' : '还没有事件。记下第一个重要的日子吧。';
  byId('status').hidden = sorted.length > 0;
  byId('cal-year').textContent = (featured?.day || date).slice(0, 4);
  byId('cal-month').textContent = (featured?.day || date).slice(5, 7) + ' 月';
  byId('cal-day').textContent = (featured?.day || date).slice(8);
  byId('cal-title').textContent = featured?.title || '今天';
  const difference = featured ? duration(featured.day, date).difference : 0;
  document.querySelector('.hero-foot > span').textContent = featured ? (difference < 0 ? '距离那一天还有' : '自那天起') : '从今天开始';
  byId('hero-count').textContent = featured ? number.format(Math.abs(difference)) : '';
  byId('hero-unit').textContent = featured ? '天' : '';
  byId('events').replaceChildren(...sorted.map(event => {
    const row = element('li', '', 'event');
    const dateLabel = element('time', event.day.replaceAll('-', ' / '));
    dateLabel.dateTime = event.day;
    const story = element('div', '');
    story.append(element('h3', event.title));
    if (event.note) story.append(element('p', event.note));
    const elapsed = element('span', duration(event.day, date).label, 'elapsed');
    const button = element('button', '编辑', 'edit');
    button.type = 'button';
    button.setAttribute('aria-label', '编辑' + event.title);
    button.addEventListener('click', () => edit(event));
    row.append(dateLabel, story, elapsed, button);
    return row;
  }));
  lastDate = date;
}

async function load() {
  try {
    events = await api();
    render();
    document.querySelectorAll('.add').forEach(button => { button.disabled = false; });
    return true;
  } catch (error) {
    const retry = element('button', '重试', 'edit');
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
