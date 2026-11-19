const assets = ASSET_MAP;
const defaultBirthday = { id: 'birthday', title: '我出生了', day: '1996-03-26', note: '' };
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/events') {
      const asset = Object.hasOwn(assets, url.pathname) ? assets[url.pathname] : null;
      if (!asset) return new Response('页面不存在', { status: 404 });
      return new Response(asset.body, {
        headers: { 'Content-Type': asset.type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' },
      });
    }

    const owner = request.headers.get('oai-authenticated-user-id');
    if (!owner) return json({ error: 'Sign in required' }, 401);
    if (request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, title, day, note FROM events WHERE owner = ?').bind(owner).all();
      if (!results.some(event => event.id === 'birthday')) results.push(defaultBirthday);
      return json(results.filter(event => event.title !== ''));
    }
    if (request.method !== 'PUT' && request.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405);
    if (request.headers.get('Origin') !== url.origin || request.headers.get('Content-Type') !== 'application/json') {
      return json({ error: 'Invalid origin or content type' }, 403);
    }
    let data;
    try {
      const body = await request.text();
      if (body.length > 5000) return json({ error: 'Request too large' }, 413);
      data = JSON.parse(body);
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    if (typeof data?.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(data.id)) return json({ error: 'Invalid id' }, 400);
    if (request.method === 'DELETE') {
      if (data.id === 'birthday') {
        await env.DB.prepare("INSERT INTO events (owner,id,title,day) VALUES (?, 'birthday', '', '1996-03-26') ON CONFLICT(owner,id) DO UPDATE SET title = ''").bind(owner).run();
      } else {
        await env.DB.prepare('DELETE FROM events WHERE owner = ? AND id = ?').bind(owner, data.id).run();
      }
      return json({ ok: true });
    }

    const { id, day } = data;
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    const note = typeof data.note === 'string' ? data.note.trim() : '';
    const date = new Date(typeof day === 'string' ? day + 'T00:00:00Z' : NaN);
    if (!title || title.length > 60 || note.length > 500 || typeof day !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(day) || day.startsWith('0000') ||
        !Number.isFinite(+date) || date.toISOString().slice(0, 10) !== day) {
      return json({ error: 'Invalid event' }, 400);
    }
    await env.DB.prepare(
      'INSERT INTO events (owner,id,title,day,note) VALUES (?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET title=excluded.title,day=excluded.day,note=excluded.note',
    ).bind(owner, id, title, day, note).run();
    return json({ id, title, day, note });
  },
};
