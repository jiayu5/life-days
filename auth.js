const cookieName = '__Host-bigdays-session';
const sessionSeconds = 30 * 24 * 60 * 60;
const codeSeconds = 10 * 60;
const encoder = new TextEncoder();

function authEnabled(env) {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM && env.EMAIL_LOGIN_SECRET && env.OWNER_LOGIN_EMAIL);
}

function authJson(data, status = 200, cookie) {
  const headers = { 'Cache-Control': 'no-store' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return Response.json(data, { status, headers });
}

function sessionCookie(token, seconds) {
  return cookieName + '=' + token + '; Max-Age=' + seconds + '; Path=/; HttpOnly; Secure; SameSite=Lax';
}

function cookieToken(request) {
  const cookies = request.headers.get('Cookie') || '';
  return cookies.match(/(?:^|;\s*)__Host-bigdays-session=([\da-f]{64})(?:;|$)/)?.[1];
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function tokenHash(token) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
}

async function codeHash(secret, email, nonce, code) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(JSON.stringify([email, nonce, code]))));
}

function makeCode() {
  const bytes = new Uint32Array(1);
  do {
    crypto.getRandomValues(bytes);
  } while (bytes[0] >= 4294000000);
  return String(bytes[0] % 1000000).padStart(6, '0');
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email) ? email : '';
}

async function readSession(request, env) {
  const token = cookieToken(request);
  if (!token) return null;
  return env.DB.prepare('SELECT email FROM email_sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(await tokenHash(token), nowSeconds()).first();
}

async function ownerForRequest(request, env) {
  if (!authEnabled(env)) {
    if (env.EMAIL_LOGIN_REQUIRED === '1') return null;
    const id = request.headers.get('oai-authenticated-user-id');
    return id ? { id, isPrimary: true } : null;
  }

  const session = await readSession(request, env);
  if (!session) return null;
  const isPrimary = session.email === normalizeEmail(env.OWNER_LOGIN_EMAIL);
  if (isPrimary) {
    const { results } = await env.DB.prepare("SELECT DISTINCT owner FROM events WHERE owner NOT LIKE 'email:%' LIMIT 2").all();
    if (results.length > 1) return null;
    if (results.length === 1) return { id: results[0].owner, isPrimary };
  }
  return { id: 'email:' + session.email, isPrimary };
}

async function sendCode(env, email, code, nonce) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.RESEND_API_KEY,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'bigdays-' + nonce,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email],
      subject: 'Big Days 登录验证码',
      text: '你的 Big Days 登录验证码是 ' + code + '，10 分钟内有效。请勿与他人分享验证码。',
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Email delivery rejected');
}

async function requestCode(env, email, now) {
  if (env.EMAIL_LOGIN_AUDIENCE === 'owner' && email !== normalizeEmail(env.OWNER_LOGIN_EMAIL)) {
    return authJson({ error: '这个邮箱没有登录权限。' }, 403);
  }

  const code = makeCode();
  const nonce = crypto.randomUUID();
  const digest = await codeHash(env.EMAIL_LOGIN_SECRET, email, nonce, code);
  const challenge = await env.DB.prepare(
    'INSERT INTO email_codes (email, nonce, digest, issued_at, expires_at, attempts) VALUES (?, ?, ?, ?, ?, 0) ' +
    'ON CONFLICT(email) DO UPDATE SET nonce=excluded.nonce, digest=excluded.digest, issued_at=excluded.issued_at, ' +
    'expires_at=excluded.expires_at, attempts=0 WHERE email_codes.issued_at <= ? RETURNING nonce',
  ).bind(email, nonce, digest, now, now + codeSeconds, now - 60).first();
  if (!challenge) return authJson({ error: '请稍等一分钟再发送。' }, 429);

  const hour = Math.floor(now / 3600);
  const quota = await env.DB.prepare(
    'INSERT INTO email_quota (slot, sent) VALUES (?, 1) ON CONFLICT(slot) DO UPDATE SET sent=sent+1 WHERE sent<30 RETURNING sent',
  ).bind(hour).first();
  if (!quota) return authJson({ error: '发信请求过多，请稍后再试。' }, 429);

  try {
    await sendCode(env, email, code, nonce);
  } catch {
    await env.DB.prepare('UPDATE email_codes SET expires_at=0 WHERE email=? AND nonce=?').bind(email, nonce).run();
    return authJson({ error: '暂时无法发送验证码，请稍后再试。' }, 503);
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM email_codes WHERE issued_at < ?').bind(now - 86400),
    env.DB.prepare('DELETE FROM email_sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM email_quota WHERE slot < ?').bind(hour - 1),
  ]);
  return authJson({ sent: true });
}

async function verifyCode(env, email, code, now) {
  const invalid = () => authJson({ error: '验证码有误或已过期，请重试。' }, 400);
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return invalid();
  const challenge = await env.DB.prepare('SELECT nonce FROM email_codes WHERE email=? AND expires_at>? AND attempts<5')
    .bind(email, now).first();
  if (!challenge) return invalid();
  const digest = await codeHash(env.EMAIL_LOGIN_SECRET, email, challenge.nonce, code);
  const result = await env.DB.prepare(
    'UPDATE email_codes SET attempts=attempts+1, expires_at=CASE WHEN digest=? THEN 0 ELSE expires_at END ' +
    'WHERE email=? AND nonce=? AND expires_at>? AND attempts<5 RETURNING digest=? AS verified',
  ).bind(digest, email, challenge.nonce, now, digest).first();
  if (!result?.verified) return invalid();

  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO email_sessions (token_hash, email, expires_at) VALUES (?, ?, ?)')
    .bind(await tokenHash(token), email, now + sessionSeconds).run();
  return authJson({ authenticated: true }, 200, sessionCookie(token, sessionSeconds));
}

async function handleAuth(request, env, url) {
  const enabled = authEnabled(env);
  if (url.pathname === '/api/auth/status' && request.method === 'GET') {
    return authJson({ enabled, authenticated: enabled && Boolean(await readSession(request, env)) });
  }
  if (!enabled) return authJson({ error: '邮箱登录暂未启用。' }, 503);
  if (request.method !== 'POST') return authJson({ error: '请求方法无效。' }, 405);
  if (request.headers.get('Origin') !== url.origin || request.headers.get('Content-Type') !== 'application/json') {
    return authJson({ error: '请求来源无效。' }, 403);
  }

  if (url.pathname === '/api/auth/logout') {
    const token = cookieToken(request);
    if (token) await env.DB.prepare('DELETE FROM email_sessions WHERE token_hash=?').bind(await tokenHash(token)).run();
    return authJson({ authenticated: false }, 200, sessionCookie('', 0));
  }

  let data;
  try {
    const body = await request.text();
    if (body.length > 1024) return authJson({ error: '请求过长。' }, 413);
    data = JSON.parse(body);
  } catch {
    return authJson({ error: '请求格式无效。' }, 400);
  }
  const email = normalizeEmail(data?.email);
  if (!email) return authJson({ error: '请输入有效的邮箱地址。' }, 400);
  const now = nowSeconds();
  if (url.pathname === '/api/auth/request') return requestCode(env, email, now);
  if (url.pathname === '/api/auth/verify') return verifyCode(env, email, data.code, now);
  return authJson({ error: '页面不存在。' }, 404);
}
