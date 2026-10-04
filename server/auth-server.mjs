/* 앱 파일과 유료 음성 API 는 검증된 로그인·서버 허용 목록 뒤에서만 제공한다. */
import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { createGoogleOidc, IdentityError } from './lib/google-oidc.mjs';
import { openAccessStore, AccessError } from './lib/access-store.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COOKIE = 'flagquiz_session', LOGIN_COOKIE = 'flagquiz_login';
const SESSION_MS = 8 * 60 * 60 * 1000, LOGIN_MS = 10 * 60 * 1000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ico': 'image/x-icon' };

export function readConfig(env = process.env) {
  for (const name of ['PUBLIC_ORIGIN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SESSION_SECRET', 'STATE_DIR', 'STATIC_ROOT', 'OPENAI_API_KEY', 'HOST', 'PORT']) {
    if (typeof env[name] === 'string' && /^["']?\s*op:\/\//i.test(env[name].trim())) {
      throw new Error('Unresolved 1Password reference in ' + name + '; start with op run');
    }
  }
  const config = { publicOrigin: env.PUBLIC_ORIGIN || '', clientId: env.GOOGLE_CLIENT_ID || '', clientSecret: env.GOOGLE_CLIENT_SECRET || '',
    sessionSecret: env.SESSION_SECRET || '', stateDirectory: env.STATE_DIR || '', staticRoot: path.resolve(env.STATIC_ROOT || path.join(repository, '_site')),
    openaiApiKey: env.OPENAI_API_KEY || '', port: Number(env.PORT || 8080), host: env.HOST || '127.0.0.1' };
  config.ready = Boolean(config.publicOrigin && config.clientId && config.clientSecret && config.sessionSecret && config.stateDirectory);
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
  if (error instanceof IdentityError) return json(res, error.code === 'identity-unavailable' ? 503 : 401, { error: 'login-failed' });
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
function loginPage(res, error) {
  const messages = { denied: '등록된 이메일만 이용할 수 있어요. 관리자에게 이메일 등록을 요청해 주세요.',
    failed: '로그인을 완료하지 못했어요. 다시 시도해 주세요.', unavailable: '로그인 서비스 준비 중이에요. 잠시 뒤 다시 시도해 주세요.',
    'hosted-account-required': 'Gmail 또는 Google Workspace 계정으로 로그인해 주세요.' };
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>세계 놀이 · 로그인</title><main><h1>세계 놀이</h1><p>등록된 Gmail 또는 Google Workspace 계정으로 로그인해 주세요.</p>' +
    (messages[error] ? '<p role="status">' + messages[error] + '</p>' : '') +
    '<a href="/api/auth/login">Google 계정으로 로그인</a></main><script src="/auth-cleanup.js" defer></script></html>');
}

export async function createAuthServer({ config = readConfig(), fetchImpl = fetch, clock = Date.now, oidc: injectedOidc, speechModule: injectedSpeech } = {}) {
  const store = config.ready ? await openAccessStore({ directory: config.stateDirectory, clock }) : null;
  const staticRoot = await fs.realpath(config.staticRoot).catch(() => config.staticRoot);
  if (store) {
    const stateRoot = await fs.realpath(config.stateDirectory);
    if (stateRoot === staticRoot || stateRoot.startsWith(staticRoot + path.sep)) { await store.close(); throw new Error('STATE_DIR must be outside STATIC_ROOT'); }
  }
  const oidc = config.ready ? injectedOidc || createGoogleOidc({ clientId: config.clientId, clientSecret: config.clientSecret,
    redirectUri: config.publicOrigin + '/api/auth/callback', fetchImpl, clock }) : null;
  let speech = injectedSpeech, transcribe = null;
  const pending = new Map(), rates = new Map(), speechUsers = new Set(); let activeSpeech = 0;
  function csrf(session) { return createHmac('sha256', config.sessionSecret).update('csrf.' + session.id).digest('base64url'); }
  function sessionOf(req) {
    if (!store) return null;
    const data = unsign(cookies(req).get(COOKIE), 'session', config.sessionSecret);
    return data && typeof data.id === 'string' && Number.isInteger(data.exp) && data.exp > clock() ? store.session(data.id) : null;
  }
  function authorized(req) { const session = sessionOf(req); if (!session) throw new AccessError(401, 'login-required'); return session; }
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
    if (!sessionOf(req)) {
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
    if (!config.openaiApiKey) throw new AccessError(503, 'speech-not-configured');
    if (speechUsers.has(session.sub) || activeSpeech >= 4) throw new AccessError(429, 'speech-busy');
    rate('speech:' + session.sub, 20, 60 * 1000);
    const abort = new AbortController();
    function disconnected() { if (!res.writableEnded) abort.abort(); }
    req.on('aborted', disconnected); res.on('close', disconnected);
    activeSpeech += 1; speechUsers.add(session.sub);
    try {
      speech ||= await import('./speech.mjs');
      transcribe ||= speech.createTranscriber({ apiKey: config.openaiApiKey, fetchImpl });
      const input = await speech.readSpeechInput(req, { signal: abort.signal });
      const quota = await store.consumeSpeechQuota(session);
      const result = await transcribe(input, { signal: abort.signal });
      json(res, 200, { text: result.text, playerId: input.playerId, turnId: input.turnId, quota: { dailyUsed: quota.dailyUsed, dailyLimit: quota.dailyLimit } });
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
    if ((pathname === '/sw.js' || pathname === '/auth-cleanup.js') && ['GET', 'HEAD'].includes(req.method)) {
      const file = path.join(repository, 'server', pathname === '/sw.js' ? 'private-sw.js' : 'login-cleanup.js');
      let bytes; try { bytes = await fs.readFile(file); } catch { throw new AccessError(404, 'not-found'); }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Length': bytes.length });
      return res.end(req.method === 'HEAD' ? undefined : bytes);
    }
    if (pathname === '/login' && req.method === 'GET') return loginPage(res, url.searchParams.get('error'));
    if (pathname === '/api/auth/session' && req.method === 'GET') {
      const session = sessionOf(req);
      return json(res, 200, session ? { authenticated: true, email: session.email, role: session.role, csrfToken: csrf(session), expiresAt: session.expiresAt }
        : { authenticated: false, configured: config.ready });
    }
    if (pathname === '/api/auth/login' && req.method === 'GET') {
      if (!config.ready) throw new AccessError(503, 'auth-not-configured');
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new AccessError(403, 'request-not-allowed');
      rate('login:' + req.socket.remoteAddress, 10, 5 * 60 * 1000);
      for (const [id, data] of pending) if (data.expiresAt <= clock()) pending.delete(id);
      if (pending.size >= 1000) throw new AccessError(429, 'request-limit');
      const state = randomBytes(32).toString('base64url'), nonce = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url');
      pending.set(state, { nonce, verifier, expiresAt: clock() + LOGIN_MS });
      res.setHeader('Set-Cookie', cookie(LOGIN_COOKIE, sign({ state }, 'login', config.sessionSecret), config, LOGIN_MS));
      return redirect(res, oidc.authorizationUrl({ state, nonce, verifier }));
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
        const identity = await oidc.exchangeCode({ code: url.searchParams.get('code'), nonce: attempt.nonce, verifier: attempt.verifier });
        const session = await store.createSession(identity, SESSION_MS);
        res.setHeader('Set-Cookie', [cookie(LOGIN_COOKIE, '', config), cookie(COOKIE, sign({ id: session.id, exp: session.expiresAt }, 'session', config.sessionSecret), config, SESSION_MS)]);
        return redirect(res, '/');
      } catch (error) {
        if (error instanceof AccessError && error.status === 403) return redirect(res, '/login?error=denied');
        const loginError = error instanceof IdentityError ? error.code === 'identity-unavailable' ? 'unavailable' :
          error.code === 'hosted-account-required' ? 'hosted-account-required' : 'failed' : 'failed';
        return redirect(res, '/login?error=' + loginError);
      }
    }
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const session = authorized(req); sameOrigin(req, session); await store.revokeSession(session.id);
      res.setHeader('Set-Cookie', cookie(COOKIE, '', config)); res.setHeader('Clear-Site-Data', '"cache"'); return json(res, 200, { ok: true });
    }
    if (pathname === '/api/admin/allowlist') {
      const session = authorized(req); if (session.role !== 'superadmin') throw new AccessError(403, 'admin-required');
      if (req.method === 'GET') return json(res, 200, { members: store.list() });
      if (!['POST', 'DELETE'].includes(req.method)) throw new AccessError(405, 'method-not-allowed');
      sameOrigin(req, session); rate('admin:' + session.id, 30, 60 * 1000);
      const body = await readJson(req);
      const result = req.method === 'POST' ? await store.add(body.email, session) : await store.remove(body.email, session);
      return json(res, 200, result);
    }
    if (pathname === '/api/speech' && req.method === 'POST') return speechRequest(req, res, authorized(req));
    if (pathname.startsWith('/api/')) throw new AccessError(404, 'not-found');
    return staticFile(req, res, pathname);
  }
  const server = http.createServer((req, res) => { handle(req, res).catch(error => { if (res.headersSent) res.destroy(); else safeError(res, error); }); });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return { server, store, config, async close() { await new Promise(resolve => server.close(resolve)); await store?.close(); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createAuthServer();
  app.server.listen(app.config.port, app.config.host, () => console.log('FlagQuiz private server started; authentication configured: ' + app.config.ready));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { app.close().then(() => process.exit(0), () => process.exit(1)); });
}
