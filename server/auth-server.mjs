/* 앱 파일과 유료 음성 API 는 검증된 로그인·서버 허용 목록 뒤에서만 제공한다. */
import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createGoogleOidc, IdentityError } from './lib/google-oidc.mjs';
import { createTechJuiceId, TechJuiceIdError } from './lib/techjuice-id.mjs';
import { openAccessStore, AccessError } from './lib/access-store.mjs';
import { clientIp, parseTrustedProxyIPs } from './lib/proxy-ip.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COOKIE = 'flagquiz_session', LOGIN_COOKIE = 'flagquiz_login';
const SESSION_MS = 8 * 60 * 60 * 1000, LOGIN_MS = 10 * 60 * 1000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ico': 'image/x-icon' };

export function readConfig(env = process.env) {
  for (const name of ['PUBLIC_ORIGIN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SESSION_SECRET', 'STATE_DIR', 'STATIC_ROOT', 'GROQ_API_KEY', 'TYPESAFE_API_KEY', 'HOST', 'PORT', 'TJID_SUPABASE_URL', 'TJID_SUPABASE_ANON_KEY', 'TRUSTED_PROXY_IPS']) {
    if (typeof env[name] === 'string' && /^["']?\s*op:\/\//i.test(env[name].trim())) {
      throw new Error('Unresolved 1Password reference in ' + name + '; start with op run');
    }
  }
  const config = { publicOrigin: env.PUBLIC_ORIGIN || '', clientId: env.GOOGLE_CLIENT_ID || '', clientSecret: env.GOOGLE_CLIENT_SECRET || '',
    sessionSecret: env.SESSION_SECRET || '', stateDirectory: env.STATE_DIR || '', staticRoot: path.resolve(env.STATIC_ROOT || path.join(repository, '_site')),
    groqApiKey: env.GROQ_API_KEY || '', typesafeApiKey: env.TYPESAFE_API_KEY || '', port: Number(env.PORT || 8080), host: env.HOST || '127.0.0.1',
    authProvider: env.AUTH_PROVIDER || (env.TJID_SUPABASE_URL ? 'techjuice-id' : 'google'),
    supabaseUrl: env.TJID_SUPABASE_URL || '', anonKey: env.TJID_SUPABASE_ANON_KEY || '', appSlug: env.TJID_APP_SLUG || 'flagquiz',
    googleEnabled: env.TJID_GOOGLE_ENABLED === 'true', trustedProxyIPs: parseTrustedProxyIPs(env.TRUSTED_PROXY_IPS) };
  if (!['google', 'techjuice-id'].includes(config.authProvider)) throw new Error('AUTH_PROVIDER is invalid');
  const identityReady = config.authProvider === 'techjuice-id' ? Boolean(config.supabaseUrl && config.anonKey) : Boolean(config.clientId && config.clientSecret);
  config.ready = Boolean(config.publicOrigin && identityReady && config.sessionSecret && config.stateDirectory);
  if (!config.ready) return config;
  let origin;
  try { origin = new URL(config.publicOrigin); } catch { throw new Error('PUBLIC_ORIGIN must be an absolute origin'); }
  if (origin.href !== origin.origin + '/' || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) {
    throw new Error('PUBLIC_ORIGIN must use HTTPS; HTTP is allowed only on localhost');
  }
  config.publicOrigin = origin.origin; config.secureCookie = origin.protocol === 'https:';
  if (Buffer.byteLength(config.sessionSecret) < 32) throw new Error('SESSION_SECRET must have at least 32 bytes');
  if (!path.isAbsolute(config.stateDirectory)) throw new Error('STATE_DIR must be absolute');
  config.stateDirectory = path.resolve(config.stateDirectory);
  if (config.stateDirectory === config.staticRoot || config.stateDirectory.startsWith(config.staticRoot + path.sep)) throw new Error('STATE_DIR must be outside STATIC_ROOT');
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw new Error('PORT is invalid');
  if (config.authProvider === 'techjuice-id' && !createTechJuiceId({ supabaseUrl: config.supabaseUrl, anonKey: config.anonKey, appSlug: config.appSlug }).ready) {
    throw new Error('TechJuice ID configuration is invalid');
  }
  return config;
}

function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right);
}
function sign(value, purpose, secret) {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return payload + '.' + createHmac('sha256', secret).update(purpose + '.' + payload).digest('base64url');
}
function unsign(value, purpose, secret) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  const parts = value.split('.'); if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0])) return null;
  if (!equal(parts[1], createHmac('sha256', secret).update(purpose + '.' + parts[0]).digest('base64url'))) return null;
  try { const parsed = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null; } catch { return null; }
}
function cookies(req) {
  const result = new Map();
  for (const entry of (req.headers.cookie || '').split(';')) {
    const at = entry.indexOf('='); if (at < 0) continue;
    const name = entry.slice(0, at).trim();
    if (result.has(name)) { result.set(name, null); continue; }
    result.set(name, entry.slice(at + 1).trim());
  }
  return result;
}
function cookie(name, value, config, milliseconds = 0) {
  return name + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(milliseconds / 1000) + (config.secureCookie ? '; Secure' : '');
}
function json(res, status, value) {
  if (res.destroyed) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(value));
}
function redirect(res, target) { res.writeHead(303, { Location: target }).end(); }
function safeError(res, error) {
  if (error instanceof AccessError) return json(res, error.status, { error: error.code });
  if (error instanceof IdentityError || error instanceof TechJuiceIdError) return json(res, error.code === 'identity-unavailable' ? 503 : 401, { error: 'login-failed' });
  return json(res, 503, { error: 'service-unavailable' });
}
async function readJson(req) {
  if ((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new AccessError(415, 'json-required');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 8192) throw new AccessError(413, 'body-too-large'); chunks.push(chunk); }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value;
  } catch { throw new AccessError(400, 'invalid-json'); }
}
async function readForm(req) {
  if ((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') throw new AccessError(415, 'form-required');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 8192) throw new AccessError(413, 'body-too-large'); chunks.push(chunk); }
  const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  for (const key of ['identifier', 'password', 'csrf']) if (form.getAll(key).length !== 1) throw new AccessError(400, 'invalid-form');
  return { identifier: form.get('identifier'), password: form.get('password'), csrf: form.get('csrf') };
}
function loginPage(res, error, config, formToken) {
  const messages = { denied: '등록된 이메일만 이용할 수 있어요. 관리자에게 이메일 등록을 요청해 주세요.',
    failed: '로그인을 완료하지 못했어요. 다시 시도해 주세요.', unavailable: '로그인 서비스 준비 중이에요. 잠시 뒤 다시 시도해 주세요.',
    'hosted-account-required': 'Gmail 또는 Google Workspace 계정으로 로그인해 주세요.' };
  if (config.authProvider === 'techjuice-id') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>세계 놀이 · TechJuice ID 로그인</title>' +
      '<style>body{margin:0;background:#f2f7ee;color:#243c2b;font-family:system-ui,sans-serif;display:grid;min-height:100dvh;place-items:center}main{box-sizing:border-box;background:#fff;border-radius:24px;padding:32px;width:min(92vw,440px);box-shadow:0 12px 40px #243c2b14}h1{margin-top:0}label{display:block;margin:20px 0 8px;font-weight:600}input,button{box-sizing:border-box;font:inherit;border-radius:12px;padding:13px;width:100%}input{border:1px solid #a9bba9}button{border:0;background:#397749;color:#fff;margin-top:24px;font-weight:700;cursor:pointer}a{color:#275f38}p{line-height:1.6}.hint{color:#536558;font-size:14px}input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #df9e2e;outline-offset:3px}</style></head><body><main>' +
      '<h1>세계 놀이</h1><p>기존 TechJuice ID로 로그인해 주세요.</p><p id="legacy-notice" class="hint" role="status" aria-live="polite" hidden></p>' +
      (!config.ready ? '<p role="status">로그인 서비스 준비 중이에요. 잠시 뒤 다시 시도해 주세요.</p>' :
        '<form method="post" action="/api/auth/password"><input type="hidden" name="csrf" value="' + formToken + '">' +
        '<label for="identifier">아이디 또는 이메일</label><input id="identifier" name="identifier" autocomplete="username" required maxlength="254" autocapitalize="none" spellcheck="false">' +
        '<label for="password">비밀번호</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024"><button type="submit">로그인</button></form>' +
        (config.googleEnabled ? '<p><a href="/api/auth/login">Google 계정으로 로그인</a></p>' : '')) +
      (error ? '<p role="status">' + (error === 'denied' ? '이 계정은 세계 놀이를 이용할 수 없어요. 관리자에게 문의해 주세요.' : '로그인하지 못했어요. 아이디와 비밀번호를 확인해 주세요.') + '</p>' : '') +
      '<p class="hint">다른 TechJuice 앱에서 사용하는 계정과 같아요.<br>비밀번호를 잊으셨다면 관리자에게 문의해 주세요.</p></main><script src="/auth-cleanup.js" defer></script><script src="/login-legacy.js" defer></script></body></html>');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>세계 놀이 · 로그인</title><main><h1>세계 놀이</h1><p>등록된 Gmail 또는 Google Workspace 계정으로 로그인해 주세요.</p>' +
    (messages[error] ? '<p role="status">' + messages[error] + '</p>' : '') +
    '<p id="legacy-notice" role="status" aria-live="polite" hidden></p><a href="/api/auth/login">Google 계정으로 로그인</a></main><script src="/auth-cleanup.js" defer></script><script src="/login-legacy.js" defer></script></html>');
}

export async function createAuthServer({ config = readConfig(), fetchImpl = fetch, clock = Date.now, timingClock = () => performance.now(), oidc: injectedOidc, techjuiceId: injectedTechjuiceId, speechModule: injectedSpeech } = {}) {
  const store = config.ready ? await openAccessStore({ directory: config.stateDirectory, clock }) : null;
  const staticRoot = await fs.realpath(config.staticRoot).catch(() => config.staticRoot);
  if (store) {
    const stateRoot = await fs.realpath(config.stateDirectory);
    if (stateRoot === staticRoot || stateRoot.startsWith(staticRoot + path.sep)) { await store.close(); throw new Error('STATE_DIR must be outside STATIC_ROOT'); }
  }
  const tjid = config.ready && config.authProvider === 'techjuice-id' ? injectedTechjuiceId || createTechJuiceId({ supabaseUrl: config.supabaseUrl, anonKey: config.anonKey, appSlug: config.appSlug, fetchImpl, clock }) : null;
  const oidc = config.ready && !tjid ? injectedOidc || createGoogleOidc({ clientId: config.clientId, clientSecret: config.clientSecret,
    redirectUri: config.publicOrigin + '/api/auth/callback', fetchImpl, clock }) : null;
  let speech = injectedSpeech, transcribe = null, resolveAnswer = null;
  const pending = new Map(), rates = new Map(), speechUsers = new Set(), centralStates = new Map(); let activeSpeech = 0;
  function csrf(session) { return createHmac('sha256', config.sessionSecret).update('csrf.' + session.id).digest('base64url'); }
  async function sessionOf(req, fresh = false) {
    if (!store) return null;
    const data = unsign(cookies(req).get(COOKIE), 'session', config.sessionSecret);
    const session = data && typeof data.id === 'string' && Number.isInteger(data.exp) && data.exp > clock() ? store.session(data.id) : null;
    if (!session || !tjid) return session;
    let cached = centralStates.get(session.sub);
    if (fresh || !cached || cached.until <= clock()) {
      const state = await tjid.sessionState(session.sub);
      if (!state) throw new AccessError(503, 'identity-unavailable');
      cached = { state, until: clock() + 60000 };
      if (centralStates.size >= 1000) for (const [sub, item] of centralStates) if (item.until <= clock()) centralStates.delete(sub);
      if (centralStates.size < 1000 || centralStates.has(session.sub)) centralStates.set(session.sub, cached);
    }
    if (cached.state.disabled || cached.state.gen !== session.generation) { await store.revokeSession(session.id); return null; }
    return store.session(session.id);
  }
  async function authorized(req, fresh = false) { const session = await sessionOf(req, fresh); if (!session) throw new AccessError(401, 'login-required'); return session; }
  function sameOrigin(req, session) {
    if (req.headers.origin !== config.publicOrigin || !equal(req.headers['x-csrf-token'], csrf(session))) throw new AccessError(403, 'request-not-allowed');
    if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') throw new AccessError(403, 'request-not-allowed');
  }
  function rate(key, limit, interval) {
    const time = clock();
    if (rates.size >= 10000) for (const [id, item] of rates) if (item.until <= time) rates.delete(id);
    if (!rates.has(key) && rates.size >= 10000) throw new AccessError(429, 'request-limit');
    let entry = rates.get(key);
    if (!entry || entry.until <= time) { entry = { count: 0, until: time + interval }; rates.set(key, entry); }
    if (entry.count >= limit) throw new AccessError(429, 'request-limit'); entry.count += 1;
  }
  async function staticFile(req, res, pathname) {
    if (!['GET', 'HEAD'].includes(req.method)) throw new AccessError(405, 'method-not-allowed');
    if (!(await sessionOf(req))) {
      if (pathname === '/' || pathname === '/index.html') return redirect(res, '/login');
      throw new AccessError(401, 'login-required');
    }
    let decoded; try { decoded = decodeURIComponent(pathname); } catch { throw new AccessError(400, 'invalid-path'); }
    if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some(part => part.startsWith('.'))) throw new AccessError(404, 'not-found');
    const relative = decoded.endsWith('/') ? decoded + 'index.html' : decoded;
    const file = path.resolve(config.staticRoot, '.' + relative);
    if (!file.startsWith(config.staticRoot + path.sep)) throw new AccessError(404, 'not-found');
    let real, stat;
    try { real = await fs.realpath(file); stat = await fs.stat(real); } catch { throw new AccessError(404, 'not-found'); }
    if (!real.startsWith(staticRoot + path.sep) || !stat.isFile()) throw new AccessError(404, 'not-found');
    const type = TYPES[path.extname(real).toLowerCase()]; if (!type) throw new AccessError(404, 'not-found');
    const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes' };
    let status = 200, start = 0, end = stat.size - 1;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) throw new AccessError(416, 'invalid-range');
      if (match[1]) { start = Number(match[1]); end = match[2] ? Number(match[2]) : end; }
      else start = Math.max(0, stat.size - Number(match[2]));
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) throw new AccessError(416, 'invalid-range');
      end = Math.min(end, stat.size - 1); status = 206; headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
    }
    headers['Content-Length'] = String(stat.size ? end - start + 1 : 0);
    res.writeHead(status, headers);
    if (req.method === 'HEAD' || !stat.size) return res.end();
    const stream = createReadStream(real, { start, end }); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
  }
  async function speechRequest(req, res, session) {
    sameOrigin(req, session);
    if (!config.groqApiKey) throw new AccessError(503, 'speech-not-configured');
    if (speechUsers.has(session.sub) || activeSpeech >= 4) throw new AccessError(429, 'speech-busy');
    rate('speech:' + session.sub, 20, 60 * 1000);
    const abort = new AbortController();
    function disconnected() { if (!res.writableEnded) abort.abort(); }
    req.on('aborted', disconnected); res.on('close', disconnected);
    activeSpeech += 1; speechUsers.add(session.sub);
    const timings = [];
    async function measure(name, operation) {
      const started = timingClock();
      try { return await operation(); }
      finally {
        // 전사·오디오·계정 정보 없이 단계 이름과 단조시계의 경과 시간만 응답한다.
        const duration = timingClock() - started;
        if (Number.isFinite(duration) && !res.destroyed && !res.headersSent) {
          timings.push(name + ';dur=' + Math.max(0, duration).toFixed(1));
          res.setHeader('Server-Timing', timings.join(', '));
        }
      }
    }
    try {
      speech ||= await import('./speech.mjs');
      transcribe ||= speech.createTranscriber({ apiKey: config.groqApiKey, fetchImpl });
      const input = await speech.readSpeechInput(req, { signal: abort.signal });
      const current = await measure('authorization', async () => {
        const checked = tjid ? await authorized(req, true) : session;
        if (checked.id !== session.id) throw new AccessError(401, 'login-required');
        return checked;
      });
      const quota = await store.consumeSpeechQuota(current);
      const result = await measure('speech', () => transcribe(input, { signal: abort.signal }));
      if (abort.signal.aborted) throw new AccessError(499, 'cancelled');
      const resolution = await measure('selection', async () => {
        resolveAnswer ||= (await import('./answer-resolution.mjs')).createAnswerResolver({ apiKey: config.typesafeApiKey, fetchImpl });
        return resolveAnswer({ text: result.text, mode: input.mode }, { signal: abort.signal,
          beforeSemantic: () => measure('selection-auth', async () => {
            const selectionSession = await authorized(req, true);
            if (selectionSession.id !== session.id) throw new AccessError(401, 'login-required');
          })
        });
      });
      json(res, 200, { text: result.text, playerId: input.playerId, turnId: input.turnId, mode: input.mode,
        resolution, quota: { dailyUsed: quota.dailyUsed, dailyLimit: quota.dailyLimit } });
    } catch (error) {
      if (speech?.SpeechError && error instanceof speech.SpeechError) json(res, error.status, { error: error.code });
      else throw error;
    } finally {
      activeSpeech -= 1; speechUsers.delete(session.sub); req.off('aborted', disconnected); res.off('close', disconnected);
    }
  }
  async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store, private'); res.setHeader('Pragma', 'no-cache'); res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob: data:; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const url = new URL(req.url, 'http://localhost'); const pathname = url.pathname;
    if (pathname === '/health' && req.method === 'GET') return json(res, 200, { ok: true, configured: config.ready });
    if ((pathname === '/sw.js' || pathname === '/auth-cleanup.js' || pathname === '/login-legacy.js') && ['GET', 'HEAD'].includes(req.method)) {
      const file = path.join(repository, 'server', pathname === '/sw.js' ? 'private-sw.js' : pathname === '/auth-cleanup.js' ? 'login-cleanup.js' : 'login-legacy.js');
      let bytes; try { bytes = await fs.readFile(file); } catch { throw new AccessError(404, 'not-found'); }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Length': bytes.length });
      return res.end(req.method === 'HEAD' ? undefined : bytes);
    }
    if (pathname === '/login' && req.method === 'GET') {
      // 폼 POST의 Origin을 보존하고 외부 사이트에는 Referer를 보내지 않는다.
      res.setHeader('Referrer-Policy', 'same-origin');
      const token = randomBytes(32).toString('base64url');
      if (config.ready && tjid) res.setHeader('Set-Cookie', cookie(LOGIN_COOKIE, sign({ form: token, exp: clock() + LOGIN_MS }, 'login', config.sessionSecret), config, LOGIN_MS));
      return loginPage(res, url.searchParams.get('error'), config, token);
    }
    if (pathname === '/api/auth/password' && req.method === 'POST') {
      if (!tjid) throw new AccessError(503, 'auth-not-configured');
      if (req.headers.origin !== config.publicOrigin || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) throw new AccessError(403, 'request-not-allowed');
      // 잘못된 폼은 방문자 한도를 소비하지 않는다. 전체 입력 비용은 짧은 전역 한도로 제한한다.
      rate('password-input', 300, 60 * 1000);
      const form = await readForm(req);
      const data = unsign(cookies(req).get(LOGIN_COOKIE), 'login', config.sessionSecret);
      if (!data || !Number.isInteger(data.exp) || data.exp <= clock() || !equal(data.form, form.csrf)) throw new AccessError(403, 'invalid-login-state');
      rate('password:' + clientIp(req, config.trustedProxyIPs), 30, 5 * 60 * 1000);
      rate('account:' + createHmac('sha256', config.sessionSecret).update(form.identifier.trim().toLowerCase()).digest('hex'), 10, 5 * 60 * 1000);
      res.setHeader('Set-Cookie', cookie(LOGIN_COOKIE, '', config));
      const identity = await tjid.passwordGrant(form.identifier, form.password);
      if (!identity) return redirect(res, '/login?error=failed');
      const lifetime = Math.min(SESSION_MS, identity.expiresAt - clock());
      if (!Number.isInteger(lifetime) || lifetime <= 0) return redirect(res, '/login?error=failed');
      try {
        const session = await store.createSession(identity, lifetime, { trustedCentralIdentity: true });
        res.setHeader('Set-Cookie', [cookie(LOGIN_COOKIE, '', config), cookie(COOKIE, sign({ id: session.id, exp: session.expiresAt }, 'session', config.sessionSecret), config, lifetime)]);
        return redirect(res, '/');
      } catch (error) {
        if (error instanceof AccessError && error.status === 403) return redirect(res, '/login?error=denied');
        throw error;
      }
    }
    if (pathname === '/api/auth/session' && req.method === 'GET') {
      const session = await sessionOf(req);
      return json(res, 200, session ? { authenticated: true, email: session.email, role: session.role, csrfToken: csrf(session), expiresAt: session.expiresAt }
        : { authenticated: false, configured: config.ready });
    }
    if (pathname === '/api/auth/login' && req.method === 'GET') {
      if (!config.ready) throw new AccessError(503, 'auth-not-configured');
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new AccessError(403, 'request-not-allowed');
      if (tjid && !config.googleEnabled) return redirect(res, '/login');
      rate('login:' + clientIp(req, config.trustedProxyIPs), 10, 5 * 60 * 1000);
      for (const [id, data] of pending) if (data.expiresAt <= clock()) pending.delete(id);
      if (pending.size >= 1000) throw new AccessError(429, 'request-limit');
      const state = randomBytes(32).toString('base64url'), nonce = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url');
      pending.set(state, { nonce, verifier, expiresAt: clock() + LOGIN_MS });
      res.setHeader('Set-Cookie', cookie(LOGIN_COOKIE, sign({ state }, 'login', config.sessionSecret), config, LOGIN_MS));
      return redirect(res, tjid ? tjid.authorizationUrl({ state, verifier, redirectUri: config.publicOrigin + '/api/auth/callback' }) : oidc.authorizationUrl({ state, nonce, verifier }));
    }
    if (pathname === '/api/auth/callback' && req.method === 'GET') {
      if (!config.ready) throw new AccessError(503, 'auth-not-configured');
      res.setHeader('Set-Cookie', cookie(LOGIN_COOKIE, '', config));
      const data = unsign(cookies(req).get(LOGIN_COOKIE), 'login', config.sessionSecret), state = url.searchParams.get('state');
      const attempt = data && equal(data.state, state) ? pending.get(state) : null;
      if (!attempt || attempt.expiresAt <= clock()) throw new AccessError(401, 'invalid-login-state');
      pending.delete(state);
      if (url.searchParams.has('error')) return redirect(res, '/login?error=failed');
      try {
        const identity = tjid ? await tjid.exchangeCode({ code: url.searchParams.get('code'), verifier: attempt.verifier }) : await oidc.exchangeCode({ code: url.searchParams.get('code'), nonce: attempt.nonce, verifier: attempt.verifier });
        if (!identity) throw new IdentityError('invalid-token');
        const lifetime = tjid ? Math.min(SESSION_MS, identity.expiresAt - clock()) : SESSION_MS;
        if (!Number.isInteger(lifetime) || lifetime <= 0) throw new IdentityError('expired-token');
        const session = await store.createSession(identity, lifetime, { trustedCentralIdentity: Boolean(tjid) });
        res.setHeader('Set-Cookie', [cookie(LOGIN_COOKIE, '', config), cookie(COOKIE, sign({ id: session.id, exp: session.expiresAt }, 'session', config.sessionSecret), config, lifetime)]);
        return redirect(res, '/');
      } catch (error) {
        if (error instanceof AccessError && error.status === 403) return redirect(res, '/login?error=denied');
        const loginError = error instanceof IdentityError ? error.code === 'identity-unavailable' ? 'unavailable' :
          error.code === 'hosted-account-required' ? 'hosted-account-required' : 'failed' : 'failed';
        return redirect(res, '/login?error=' + loginError);
      }
    }
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const session = await authorized(req); sameOrigin(req, session); await store.revokeSession(session.id);
      res.setHeader('Set-Cookie', cookie(COOKIE, '', config)); res.setHeader('Clear-Site-Data', '"cache"'); return json(res, 200, { ok: true });
    }
    if (pathname === '/api/admin/allowlist') {
      const session = await authorized(req, true); if (session.role !== 'superadmin') throw new AccessError(403, 'admin-required');
      if (req.method === 'GET') return json(res, 200, { members: store.list() });
      if (!['POST', 'DELETE'].includes(req.method)) throw new AccessError(405, 'method-not-allowed');
      sameOrigin(req, session); rate('admin:' + session.id, 30, 60 * 1000);
      const body = await readJson(req);
      const resolvedEmail = tjid && body.identifier ? await tjid.resolveIdentifier(body.identifier) : body.email || body.identifier;
      const result = req.method === 'POST' ? await store.add(resolvedEmail, session) : await store.remove(resolvedEmail, session);
      return json(res, 200, result);
    }
    if (pathname === '/api/speech' && req.method === 'POST') return speechRequest(req, res, await authorized(req));
    if (pathname.startsWith('/api/')) throw new AccessError(404, 'not-found');
    return staticFile(req, res, pathname);
  }
  const server = http.createServer((req, res) => {
    // 중앙 인증을 기다리는 동안 요청 본문이 먼저 소비되지 않도록 유지한다.
    req.pause();
    handle(req, res).catch(error => { if (res.headersSent) res.destroy(); else safeError(res, error); });
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return { server, store, config, async close() { await new Promise(resolve => server.close(resolve)); await store?.close(); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createAuthServer();
  app.server.listen(app.config.port, app.config.host, () => console.log('FlagQuiz private server started; authentication configured: ' + app.config.ready));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { app.close().then(() => process.exit(0), () => process.exit(1)); });
}
