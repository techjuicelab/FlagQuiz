/* 실제 HTTP·서명·디스크 저장을 검사한다. Google/Groq 유료 호출은 가짜 응답으로 격리한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import vm from 'node:vm';
import { createAuthServer, readConfig } from '../server/auth-server.mjs';
import { createGoogleOidc, GOOGLE, IdentityError, normalizeEmail } from '../server/lib/google-oidc.mjs';
import { openAccessStore, AccessError, SUPER_ADMIN_EMAIL, QUOTAS } from '../server/lib/access-store.mjs';

const time = Date.UTC(2026, 9, 3, 12), clientId = 'flagquiz-test.apps.googleusercontent.com', nonce = 'nonce-123456789012345678901234567890';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256', use: 'sig' };
function jwt(patch = {}, header = {}) {
  const claims = { iss: 'https://accounts.google.com', aud: clientId, sub: 'google-subject-1', email: 'Person@gmail.com',
    email_verified: true, nonce, iat: Math.floor(time / 1000) - 1, exp: Math.floor(time / 1000) + 3600, ...patch };
  const parts = [Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1', ...header })).toString('base64url'), Buffer.from(JSON.stringify(claims)).toString('base64url')];
  return parts.join('.') + '.' + sign('RSA-SHA256', Buffer.from(parts.join('.')), privateKey).toString('base64url');
}
function provider(overrides = {}) {
  const calls = [];
  const oidc = createGoogleOidc({ clientId, clientSecret: 'server-secret', redirectUri: 'https://quiz.test/api/auth/callback', clock: () => time,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(url === GOOGLE.jwks ? { keys: [jwk] } : { id_token: jwt() }), { status: 200, headers: { 'Cache-Control': 'public,max-age=3600' } }); }, ...overrides });
  return { oidc, calls };
}
async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'flagquiz-auth-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true })); return directory;
}
async function storeFixture(t) {
  const directory = await temporary(t); let now = time;
  let store = await openAccessStore({ directory, clock: () => now });
  t.after(async () => store.close());
  return { directory, get store() { return store; }, setTime(value) { now = value; }, async reopen() { await store.close(); store = await openAccessStore({ directory, clock: () => now }); return store; } };
}
async function httpFixture(t, extra = {}) {
  const directory = await temporary(t), staticRoot = path.join(directory, 'site'); await fs.mkdir(staticRoot);
  await fs.writeFile(path.join(staticRoot, 'index.html'), 'protected quiz'); await fs.writeFile(path.join(staticRoot, 'app.js'), 'protected script');
  await fs.writeFile(path.join(staticRoot, 'clip.mp3'), '0123456789'); await fs.writeFile(path.join(directory, 'secret.json'), 'server-only');
  await fs.symlink(path.join(directory, 'secret.json'), path.join(staticRoot, 'leak.json'));
  const env = { PUBLIC_ORIGIN: 'http://127.0.0.1', GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: 'private-secret', SESSION_SECRET: 'a'.repeat(64),
    STATE_DIR: path.join(directory, 'state'), STATIC_ROOT: staticRoot, GROQ_API_KEY: 'test-key-never-real', ...extra.env };
  let identity = { email: SUPER_ADMIN_EMAIL, sub: 'google-admin-sub' }, exchanges = 0;
  const oidc = { authorizationUrl({ state, nonce: requestNonce, verifier }) {
    assert.ok(requestNonce.length >= 43); assert.ok(verifier.length >= 43);
    return 'https://accounts.google.com/o/oauth2/v2/auth?state=' + state;
  }, async exchangeCode({ code, nonce: requestNonce, verifier }) { exchanges++; assert.equal(code, 'valid'); assert.ok(requestNonce.length >= 43); assert.ok(verifier.length >= 43); return { ...identity }; } };
  const app = await createAuthServer({ config: readConfig(env), oidc, clock: extra.clock || (() => time), speechModule: extra.speechModule });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port; app.config.publicOrigin = base;
  t.after(() => app.close());
  async function request(route, options = {}) { return fetch(base + route, { ...options, redirect: 'manual' }); }
  async function login(email = SUPER_ADMIN_EMAIL, sub = 'google-admin-sub') {
    identity = { email, sub };
    const started = await request('/api/auth/login'); assert.equal(started.status, 303);
    const state = new URL(started.headers.get('location')).searchParams.get('state'), cookie = started.headers.getSetCookie()[0].split(';')[0];
    const completed = await request('/api/auth/callback?code=valid&state=' + state, { headers: { Cookie: cookie } });
    return { started, completed, state, loginCookie: cookie, cookie: completed.headers.getSetCookie().find(value => value.startsWith('flagquiz_session='))?.split(';')[0] };
  }
  async function session(cookie) { return (await request('/api/auth/session', { headers: { Cookie: cookie } })).json(); }
  async function mutate(cookie, csrfToken, method, body, headers = {}) {
    return request('/api/admin/allowlist', { method, headers: { Cookie: cookie, Origin: base, 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  }
  return { app, env, request, login, session, mutate, base, get exchanges() { return exchanges; } };
}

test('Google 로그인은 PKCE·nonce·state 를 사용하고 비밀 키는 서버 token 교환에만 보낸다', async () => {
  const { oidc, calls } = provider(); const verifier = 'v'.repeat(43), state = 's'.repeat(43);
  const url = new URL(oidc.authorizationUrl({ state, nonce, verifier }));
  assert.equal(url.origin, 'https://accounts.google.com'); assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'openid email'); assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'));
  assert.equal(url.searchParams.has('client_secret'), false);
  const identity = await oidc.exchangeCode({ code: 'valid', nonce, verifier });
  assert.deepEqual(identity, { email: 'person@gmail.com', sub: 'google-subject-1' });
  const exchange = calls.find(call => call.url === GOOGLE.token); assert.equal(exchange.options.body.get('client_secret'), 'server-secret');
  assert.equal(exchange.options.body.get('code_verifier'), verifier); assert.equal(exchange.options.redirect, 'error');
});

test('Google 서명·issuer·audience·만료·verified email·sub·nonce 하나라도 틀리면 인증을 거절한다', async () => {
  const { oidc } = provider();
  const invalid = [{ iss: 'https://attacker.test' }, { aud: 'other-client' }, { aud: [clientId] }, { azp: 'other-client' },
    { exp: time / 1000 }, { exp: 'future' }, { iat: time / 1000 + 61 }, { nbf: time / 1000 + 61 }, { email_verified: false },
    { email_verified: 'true' }, { sub: '' }, { sub: null }, { email: 'not-email' }, { nonce: 'old-nonce' }];
  for (const claims of invalid) await assert.rejects(oidc.verifyIdToken(jwt(claims), nonce), IdentityError);
  for (const header of [{ alg: 'none' }, { alg: 'HS256' }, { kid: 'untrusted' }, { crit: ['jku'] }]) await assert.rejects(oidc.verifyIdToken(jwt({}, header), nonce), IdentityError);
  const signed = jwt().split('.'); signed[1] = Buffer.from(JSON.stringify({ email: SUPER_ADMIN_EMAIL })).toString('base64url');
  await assert.rejects(oidc.verifyIdToken(signed.join('.'), nonce), /invalid-signature/);
  await assert.rejects(oidc.verifyIdToken('untrusted', nonce), /invalid-token/);
});

test('Google 공개 키는 캐시하고 인증 서버 실패·비정상 큰 응답은 인증을 열지 않는다', async () => {
  const { oidc, calls } = provider(); await oidc.verifyIdToken(jwt(), nonce); await oidc.verifyIdToken(jwt(), nonce);
  assert.equal(calls.filter(call => call.url === GOOGLE.jwks).length, 1);
  const missing = provider({ fetchImpl: async () => new Response('unavailable', { status: 503 }) });
  await assert.rejects(missing.oidc.verifyIdToken(jwt(), nonce), /identity-unavailable/);
  const large = provider({ fetchImpl: async () => new Response('{}', { headers: { 'Content-Length': '2000000' } }) });
  await assert.rejects(large.oidc.verifyIdToken(jwt(), nonce), /identity-unavailable/);
});

test('서명된 Gmail 또는 도메인이 일치하는 Workspace 계정만 받으며 외부 메일의 verified 주장만으로 허용하지 않는다', async () => {
  const { oidc } = provider();
  assert.equal((await oidc.verifyIdToken(jwt({ email: 'CHILD@gmail.com' }), nonce)).email, 'child@gmail.com');
  assert.equal((await oidc.verifyIdToken(jwt({ email: 'child@example.com', hd: 'Example.com' }), nonce)).email, 'child@example.com');
  for (const hd of [undefined, '', true, 'other.com', 'https://example.com', 'example..com']) await assert.rejects(oidc.verifyIdToken(jwt({ email: 'child@example.com', hd }), nonce), /hosted-account-required/);
  const unsigned = jwt({ email: 'child@example.com', hd: 'example.com' }).split('.'); unsigned[2] = Buffer.from('forged-signature').toString('base64url');
  await assert.rejects(oidc.verifyIdToken(unsigned.join('.'), nonce), /invalid-signature/);
});

test('이메일은 대소문자·공백만 정규화하고 별칭·다른 계정을 합치지 않는다', () => {
  assert.equal(normalizeEmail(' TECHJUICELAB@gmail.com '), SUPER_ADMIN_EMAIL);
  assert.equal(normalizeEmail('kid+quiz@gmail.com'), 'kid+quiz@gmail.com'); assert.notEqual(normalizeEmail('tech.juice.lab@gmail.com'), SUPER_ADMIN_EMAIL);
  for (const value of [null, '', 'kid', 'kid@localhost', 'kid\n@gmail.com', 'a..b@gmail.com']) assert.throws(() => normalizeEmail(value));
});

test('최고 관리자는 고정이고 허용 목록의 첫 로그인은 Google sub 에 묶여 다른 계정이 이어받지 못한다', async t => {
  const f = await storeFixture(t), admin = await f.store.createSession({ email: 'TECHJUICELAB@gmail.com', sub: 'admin-sub' });
  assert.equal(admin.role, 'superadmin'); assert.equal(f.store.list().length, 1);
  await assert.rejects(f.store.createSession({ email: 'stranger@gmail.com', sub: 'stranger' }), /access-denied/);
  await f.store.add(' Child@gmail.com ', admin); const child = await f.store.createSession({ email: 'child@gmail.com', sub: 'child-sub' });
  assert.equal(child.role, 'user'); await assert.rejects(f.store.createSession({ email: 'child@gmail.com', sub: 'replacement-sub' }), /account-changed/);
  await assert.rejects(f.store.add('other@gmail.com', { email: SUPER_ADMIN_EMAIL, sub: 'admin-sub' }), /admin-required/);
  await assert.rejects(f.store.add('other@gmail.com', child), /admin-required/); await assert.rejects(f.store.remove(SUPER_ADMIN_EMAIL, admin), /immutable-superadmin/);
  await f.reopen(); assert.equal(f.store.session(child.id).email, 'child@gmail.com'); assert.equal(f.store.list().length, 2);
  await f.store.remove('child@gmail.com', f.store.session(admin.id)); assert.equal(f.store.session(child.id), null);
  await f.reopen(); assert.equal(f.store.list().length, 1); assert.equal(f.store.session(child.id), null);
});

test('허용 목록·세션 파일은 제한 권한으로 저장하며 동시 서버·손상 파일은 접근을 열지 않는다', async t => {
  const f = await storeFixture(t); assert.equal((await fs.stat(path.join(f.directory, 'access.json'))).mode & 0o777, 0o600);
  await assert.rejects(openAccessStore({ directory: f.directory }), /locked/);
  await f.store.close(); await fs.writeFile(path.join(f.directory, 'access.json'), '{broken');
  await assert.rejects(openAccessStore({ directory: f.directory }), /JSON/);
  assert.equal(await fs.readFile(path.join(f.directory, 'access.json'), 'utf8'), '{broken');
});

test('유료 사용량은 동시 요청에도 마지막 한 회만 예약하고 재시작 뒤 하루·월 한도를 유지한다', async t => {
  const f = await storeFixture(t), admin = await f.store.createSession({ email: SUPER_ADMIN_EMAIL, sub: 'admin-sub' });
  await f.store.close(); const file = path.join(f.directory, 'access.json'), document = JSON.parse(await fs.readFile(file, 'utf8'));
  document.quota = { daily: { '2026-10-03': { 'admin-sub': QUOTAS.userDaily - 1 } }, monthly: { '2026-10': QUOTAS.globalMonthly - 1 } };
  await fs.writeFile(file, JSON.stringify(document)); await f.reopen();
  const results = await Promise.allSettled([f.store.consumeSpeechQuota(admin), f.store.consumeSpeechQuota(admin)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'fulfilled').value.dailyUsed, 120);
  await f.reopen(); await assert.rejects(f.store.consumeSpeechQuota(admin), /daily-speech-limit/);
  await f.store.add('child@gmail.com', f.store.session(admin.id)); const child = await f.store.createSession({ email: 'child@gmail.com', sub: 'child-sub' });
  await assert.rejects(f.store.consumeSpeechQuota(child), /monthly-speech-limit/);
  f.setTime(Date.UTC(2026, 10, 1)); const fresh = await f.store.createSession({ email: SUPER_ADMIN_EMAIL, sub: 'admin-sub' });
  assert.deepEqual(await f.store.consumeSpeechQuota(fresh), { dailyUsed: 1, dailyLimit: 120, monthlyUsed: 1, monthlyLimit: 3000 });
});

test('세션은 만료·로그아웃·허용 해제 즉시 무효가 되고 관리자도 유료 한도를 적용한다', async t => {
  const f = await storeFixture(t), admin = await f.store.createSession({ email: SUPER_ADMIN_EMAIL, sub: 'admin-sub' }, 1000);
  assert.equal((await f.store.consumeSpeechQuota(admin)).dailyUsed, 1); await f.store.revokeSession(admin.id); assert.equal(f.store.session(admin.id), null);
  await assert.rejects(f.store.consumeSpeechQuota(admin), /access-denied/);
  await assert.rejects(f.store.add('child@gmail.com', admin), /admin-required/);
  const second = await f.store.createSession({ email: SUPER_ADMIN_EMAIL, sub: 'admin-sub' }, 1000); f.setTime(time + 1000);
  assert.equal(f.store.session(second.id), null); await assert.rejects(f.store.consumeSpeechQuota(second), /access-denied/);
});

function storeProcess(directory) {
  const moduleUrl = new URL('../server/lib/access-store.mjs', import.meta.url).href;
  const source = "import {openAccessStore,SUPER_ADMIN_EMAIL} from " + JSON.stringify(moduleUrl) + ";\n" +
    "try { const store=await openAccessStore({directory:process.argv[1]}); await store.createSession({email:SUPER_ADMIN_EMAIL,sub:'process-admin'}); console.log('ready'); setInterval(()=>{},1000); } catch { console.log('locked'); }";
  const child = spawn(process.execPath, ['--input-type=module', '-e', source, directory], { stdio: ['ignore', 'pipe', 'pipe'] });
  const firstLine = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('child startup timeout')); }, 5000); let output = '';
    child.stdout.on('data', chunk => { output += chunk.toString(); if (output.includes('\n')) { clearTimeout(timer); resolve(output.trim()); } });
    child.on('error', error => { clearTimeout(timer); reject(error); });
  });
  return { child, firstLine };
}

test('실제 서버 프로세스를 SIGKILL 로 끝내도 OS 잠금이 풀리고 저장한 관리자·세션으로 재시작한다', async t => {
  const directory = await temporary(t), worker = storeProcess(directory);
  t.after(() => worker.child.kill('SIGKILL')); assert.equal(await worker.firstLine, 'ready');
  const stopped = once(worker.child, 'exit'); worker.child.kill('SIGKILL'); await stopped;
  assert.ok((await fs.readFile(path.join(directory, 'access.lock'), 'utf8')).trim());
  const store = await openAccessStore({ directory }); t.after(() => store.close());
  assert.equal(store.list()[0].sub, 'process-admin');
  assert.equal((await fs.readFile(path.join(directory, 'access.lock'), 'utf8')).trim(), String(process.pid));
});

test('서로 다른 두 프로세스가 동시에 시작해도 한 서버만 영속 파일을 소유한다', async t => {
  const directory = await temporary(t), workers = [storeProcess(directory), storeProcess(directory)];
  t.after(() => workers.forEach(worker => worker.child.kill('SIGKILL')));
  const results = await Promise.all(workers.map(worker => worker.firstLine)); assert.deepEqual([...results].sort(), ['locked', 'ready']);
  const live = workers[results.indexOf('ready')].child, stopped = once(live, 'exit'); live.kill('SIGKILL'); await stopped;
  const store = await openAccessStore({ directory }); await store.close();
});

test('같은 PID 의 오래된 잠금은 복구하고 살아 있는 다른 PID 의 이전 서버 잠금은 훔치지 않는다', async t => {
  const directory = await temporary(t); await fs.writeFile(path.join(directory, 'access.lock'), String(process.pid));
  const store = await openAccessStore({ directory }); await store.close();
  await fs.writeFile(path.join(directory, 'access.lock'), String(process.ppid));
  await assert.rejects(openAccessStore({ directory }), /locked/);
  assert.equal((await fs.readFile(path.join(directory, 'access.lock'), 'utf8')).trim(), String(process.ppid));
});

test('비밀 설정이 없어도 상태·로그인 화면만 열고 전체 앱 파일과 API 는 닫힌다', async t => {
  const f = await httpFixture(t, { env: { GOOGLE_CLIENT_SECRET: '' } });
  assert.deepEqual(await (await f.request('/api/auth/session')).json(), { authenticated: false, configured: false });
  assert.equal((await f.request('/login')).status, 200); assert.equal((await f.request('/api/auth/login')).status, 503);
  assert.equal((await f.request('/')).headers.get('location'), '/login');
  for (const route of ['/app.js', '/clip.mp3', '/api/admin/allowlist', '/api/speech']) assert.equal((await f.request(route, { method: route === '/api/speech' ? 'POST' : 'GET' })).status, 401);
  assert.equal((await f.request('/auth-cleanup.js')).status, 200);
});

test('기록 전달 helper만 고정 공개 경로로 제공하며 로그인 CSP·CSRF·앱 차단을 유지한다', async t => {
  const expected = await fs.readFile(new URL('../server/login-legacy.js', import.meta.url));
  for (const ready of [true, false]) {
    const f = await httpFixture(t, ready ? {} : { env: { GOOGLE_CLIENT_SECRET: '' } });
    const script = await f.request('/login-legacy.js');
    assert.equal(script.status, 200); assert.deepEqual(Buffer.from(await script.arrayBuffer()), expected);
    assert.match(script.headers.get('cache-control'), /no-store/); assert.match(script.headers.get('content-type'), /text\/javascript/);
    assert.match(script.headers.get('content-security-policy'), /script-src 'self';/); assert.equal(script.headers.getSetCookie().length, 0);
    const head = await f.request('/login-legacy.js', { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0); assert.equal(Number(head.headers.get('content-length')), expected.length);
    assert.equal((await f.request('/login-legacy.js', { method: 'POST' })).status, 405);
    const login = await f.request('/login'), html = await login.text();
    assert.match(html, /<script src="\/login-legacy\.js" defer><\/script>/); assert.match(html, /id="legacy-notice"/);
    assert.doesNotMatch(html, /fixture-public|private-secret|test-key-never-real|onload=|onclick=/);
    for (const route of ['/server/login-legacy.js', '/app.js', '/clip.mp3']) assert.equal((await f.request(route)).status, 401);
    assert.equal(f.exchanges, 0);
  }
});

test('서버 설정은 HTTPS·강한 서명 키·웹 루트 밖 영속 경로만 허용한다', () => {
  const base = { PUBLIC_ORIGIN: 'https://quiz.test', GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: 'secret', SESSION_SECRET: 's'.repeat(64), STATE_DIR: '/private/state', STATIC_ROOT: '/private/site' };
  assert.equal(readConfig(base).secureCookie, true); assert.equal(readConfig({ ...base, PUBLIC_ORIGIN: 'http://localhost:8080' }).secureCookie, false);
  for (const patch of [{ PUBLIC_ORIGIN: 'http://quiz.test' }, { PUBLIC_ORIGIN: 'https://quiz.test/path' }, { PUBLIC_ORIGIN: 'https://user:password@quiz.test' }, { SESSION_SECRET: 'short' },
    { STATE_DIR: 'relative' }, { STATE_DIR: '/private/site/state' }]) assert.throws(() => readConfig({ ...base, ...patch }));
});

test('op run 없이 남은 참조 문자열은 필수·선택 설정 모두에서 값 노출 없이 서버 시작을 거절한다', () => {
  const base = { PUBLIC_ORIGIN: 'https://quiz.test', GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: 'secret', SESSION_SECRET: 's'.repeat(64), STATE_DIR: '/private/state', STATIC_ROOT: '/private/site' };
  for (const name of ['PUBLIC_ORIGIN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SESSION_SECRET', 'STATE_DIR', 'STATIC_ROOT', 'GROQ_API_KEY', 'HOST', 'PORT']) {
    for (const value of ['op://test-vault/test-item/test-field', '  op://test-vault/test-item/test-field ', '"op://test-vault/test-item/test-field"']) {
      assert.throws(() => readConfig({ ...base, [name]: value }), error => {
        assert.match(error.message, /Unresolved 1Password reference/); assert.match(error.message, new RegExp(name));
        assert.doesNotMatch(error.message, /test-vault|test-item|test-field|op:\/\//); return true;
      });
    }
  }
  assert.throws(() => readConfig({ GROQ_API_KEY: 'op://test-vault/test-item/test-field' }), /Unresolved 1Password reference/);
  assert.equal(readConfig({}).ready, false, '빈 설정은 인증을 열지 않고 준비 상태만 보여 준다');
});

test('서버 로그인은 state 위조·재사용·등록되지 않은 이메일을 막고 signed HttpOnly 쿠키만 인정한다', async t => {
  const f = await httpFixture(t), stranger = await f.login('stranger@gmail.com', 'stranger-sub');
  assert.equal(stranger.completed.headers.get('location'), '/login?error=denied'); assert.equal(stranger.cookie, undefined);
  const admin = await f.login(); assert.ok(admin.completed.headers.getSetCookie().some(value => /HttpOnly; SameSite=Lax/.test(value)));
  const session = await f.session(admin.cookie); assert.equal(session.role, 'superadmin'); assert.equal(session.email, SUPER_ADMIN_EMAIL); assert.equal(session.authenticated, true);
  assert.equal(session.sub, undefined); assert.equal(session.id, undefined); assert.ok(session.csrfToken.length >= 43);
  const replay = await f.request('/api/auth/callback?code=valid&state=' + admin.state, { headers: { Cookie: admin.loginCookie } }); assert.equal(replay.status, 401);
  const forged = admin.cookie.slice(0, -1) + (admin.cookie.endsWith('a') ? 'b' : 'a'); assert.equal((await f.session(forged)).authenticated, false);
  assert.equal((await f.request('/app.js', { headers: { 'X-User-Email': SUPER_ADMIN_EMAIL, Authorization: 'Bearer untrusted' } })).status, 401);
  const wrongState = await f.request('/api/auth/callback?code=valid&state=forged', { headers: { Cookie: admin.loginCookie } }); assert.equal(wrongState.status, 401);
  assert.equal(f.exchanges, 2);
});

test('앱 파일은 로그인 후에만 no-store 로 제공하고 범위 요청·경로 탈출·symlink 를 검증한다', async t => {
  const f = await httpFixture(t), admin = await f.login();
  const page = await f.request('/', { headers: { Cookie: admin.cookie } }); assert.equal(await page.text(), 'protected quiz');
  assert.equal(page.headers.get('cache-control'), 'no-store, private'); assert.equal(page.headers.get('vary'), 'Cookie');
  const partial = await f.request('/clip.mp3', { headers: { Cookie: admin.cookie, Range: 'bytes=2-4' } }); assert.equal(partial.status, 206); assert.equal(await partial.text(), '234');
  assert.equal(partial.headers.get('content-range'), 'bytes 2-4/10');
  for (const route of ['/leak.json', '/%2e%2e%2fsecret.json', '/%00.js', '/.env']) assert.equal((await f.request(route, { headers: { Cookie: admin.cookie } })).status, 404);
});

test('관리자는 CSRF·Origin 을 확인한 뒤 이메일을 관리하고 일반 사용자는 관리자 API 를 사용할 수 없다', async t => {
  const f = await httpFixture(t), admin = await f.login(), session = await f.session(admin.cookie);
  for (const headers of [{ Origin: 'https://attacker.test' }, { Origin: '' }, { 'X-CSRF-Token': 'forged' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await f.mutate(admin.cookie, session.csrfToken, 'POST', { email: 'child@gmail.com' }, headers)).status, 403);
  }
  assert.equal((await f.mutate(admin.cookie, session.csrfToken, 'POST', { email: ' CHILD@gmail.com ', role: 'superadmin' })).status, 200);
  const listed = await (await f.request('/api/admin/allowlist', { headers: { Cookie: admin.cookie } })).json(); assert.equal(listed.members.length, 2);
  assert.equal(listed.members.find(user => user.email === 'child@gmail.com').role, 'user');
  const child = await f.login('child@gmail.com', 'child-sub'); assert.equal((await f.request('/api/admin/allowlist', { headers: { Cookie: child.cookie } })).status, 403);
  assert.equal((await f.mutate(admin.cookie, session.csrfToken, 'DELETE', { email: 'TECHJUICELAB@gmail.com' })).status, 403);
  assert.equal((await f.mutate(admin.cookie, session.csrfToken, 'POST', { email: 'not-email' })).status, 400);
  assert.equal((await f.session(admin.cookie)).authenticated, true, '잘못 입력한 이메일은 관리자를 로그아웃시키지 않는다');
  assert.equal((await f.mutate(admin.cookie, session.csrfToken, 'DELETE', { email: 'child@gmail.com' })).status, 200);
  assert.equal((await f.request('/app.js', { headers: { Cookie: child.cookie } })).status, 401);
  const logout = await f.request('/api/auth/logout', { method: 'POST', headers: { Cookie: admin.cookie, Origin: f.base, 'X-CSRF-Token': session.csrfToken } });
  assert.equal(logout.status, 200); assert.equal(logout.headers.get('clear-site-data'), '"cache"'); assert.equal((await f.session(admin.cookie)).authenticated, false);
});

test('로그인 요청은 IP 별 한도를 적용하고 인증되지 않은 API 는 CORS 를 열지 않는다', async t => {
  const f = await httpFixture(t); for (let n = 0; n < 10; n++) assert.equal((await f.request('/api/auth/login')).status, 303);
  assert.equal((await f.request('/api/auth/login')).status, 429);
  const response = await f.request('/api/auth/session', { headers: { Origin: 'https://attacker.test' } }); assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('로그인 제한에 만료된 IP 10,000개가 쌓여도 새 IP 를 허용하고 활성 IP 의 한도는 유지한다', async t => {
  let now = time; const f = await httpFixture(t, { clock: () => now });
  // 실제 HTTP 요청에서 서로 다른 소켓 주소를 모사한다. 운영 코드에는 헤더 신뢰 경로를 추가하지 않는다.
  f.app.server.prependListener('request', req => {
    Object.defineProperty(req.socket, 'remoteAddress', { value: req.headers['x-test-peer'], configurable: true });
  });
  async function startLogin(peer) {
    const response = await f.request('/api/auth/login', { headers: { 'X-Test-Peer': peer } });
    await response.text(); return response.status;
  }
  for (let start = 0; start < 10000; start += 100) {
    const statuses = await Promise.all(Array.from({ length: 100 }, (_, offset) => startLogin('198.18.' + Math.floor((start + offset) / 256) + '.' + (start + offset) % 256)));
    assert.ok(statuses.every(status => status === 303 || status === 429));
  }
  const freshPeer = '198.19.255.1';
  assert.equal(await startLogin(freshPeer), 429, '활성 항목이 가득 차면 새 IP 를 차단한다');
  now += 11 * 60 * 1000;
  for (let n = 0; n < 10; n++) assert.equal(await startLogin(freshPeer), 303, '만료 항목을 정리한 뒤 로그인 요청을 다시 받는다');
  assert.equal(await startLogin(freshPeer), 429, '살아 있는 IP 의 10회 한도는 초기화하지 않는다');
  assert.equal(await startLogin('198.19.255.2'), 303, '다른 새 IP 도 만료 항목에 막히지 않는다');
});

test('관리자 JSON 을 기다리는 중 로그아웃하거나 세션이 만료되면 add/remove 둘 다 현재 권한으로 다시 차단한다', async t => {
  for (const method of ['POST', 'DELETE']) for (const revoke of ['logout', 'expire']) {
    let now = time; const f = await httpFixture(t, { clock: () => now }), admin = await f.login(), session = await f.session(admin.cookie);
    assert.equal((await f.mutate(admin.cookie, session.csrfToken, 'POST', { email: 'child@gmail.com' })).status, 200);
    const target = method === 'POST' ? 'other@gmail.com' : 'child@gmail.com', before = f.app.store.list().map(user => user.email);
    let received; const bodyStarted = new Promise(resolve => { received = resolve; });
    f.app.server.prependListener('request', req => { if (req.headers['x-test-slow'] === 'yes') req.once('data', received); });
    let slow;
    const completed = new Promise((resolve, reject) => {
      slow = http.request(f.base + '/api/admin/allowlist', { method, headers: { Cookie: admin.cookie, Origin: f.base, 'X-CSRF-Token': session.csrfToken,
        'Content-Type': 'application/json', 'X-Test-Slow': 'yes', 'Transfer-Encoding': 'chunked' } }, response => {
        let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; }); response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
      }); slow.on('error', reject); slow.write('{"email":');
    });
    await bodyStarted;
    if (revoke === 'logout') assert.equal((await f.request('/api/auth/logout', { method: 'POST', headers: { Cookie: admin.cookie, Origin: f.base, 'X-CSRF-Token': session.csrfToken } })).status, 200);
    else now += 8 * 60 * 60 * 1000;
    slow.end(JSON.stringify(target) + '}'); const response = await completed;
    assert.deepEqual(response, { status: 403, body: { error: 'admin-required' } }, method + ' ' + revoke);
    assert.deepEqual(f.app.store.list().map(user => user.email), before, method + ' ' + revoke);
  }
});

test('로그인 cleanup 은 루트의 FlagQuiz worker 와 flagquiz- 캐시만 정리한다', async () => {
  const deleted = [], unregistered = [], origin = 'https://quiz.test';
  function registration(name, scope, scriptURL, phase = 'active') { return { scope, [phase]: { scriptURL }, unregister() { unregistered.push(name); return Promise.resolve(true); } }; }
  const registrations = [registration('root', origin + '/', origin + '/sw.js'), registration('waiting', origin + '/', origin + '/sw.js?private=1', 'waiting'),
    registration('nested', origin + '/other/', origin + '/sw.js'), registration('other-app', origin + '/', origin + '/other-worker.js'),
    registration('other-origin', 'https://other.test/', 'https://other.test/sw.js')];
  const context = { URL, location: { origin }, navigator: { serviceWorker: { getRegistrations: async () => registrations } },
    caches: { keys: async () => ['flagquiz-v4', 'flagquiz-shell-v2', 'flagquiz-other', 'flagquiz', 'flagquizother', 'another-app'], delete: async name => { deleted.push(name); } } };
  context.window = context;
  vm.runInNewContext(await fs.readFile(new URL('../server/login-cleanup.js', import.meta.url), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(unregistered, ['root', 'waiting']); assert.deepEqual(deleted, ['flagquiz-v4', 'flagquiz-shell-v2', 'flagquiz-other']);
});

test('유료 음성 요청은 로그인·CSRF·키·입력 검사를 먼저 하고 quota 를 저장한 후에만 호출한다', async t => {
  const events = []; let f;
  const speechModule = { readSpeechInput: async () => { events.push('input'); return { audio: Buffer.from('test'), playerId: '2', turnId: 'turn-1' }; },
    createTranscriber: ({ apiKey }) => { assert.equal(apiKey, f.env.GROQ_API_KEY); return async () => { const persisted = JSON.parse(await fs.readFile(path.join(f.env.STATE_DIR, 'access.json'), 'utf8')); assert.equal(persisted.quota.monthly['2026-10'], 1); events.push('paid'); return { text: '대한민국' }; }; } };
  f = await httpFixture(t, { speechModule }); const admin = await f.login(), session = await f.session(admin.cookie);
  assert.equal((await f.request('/api/speech', { method: 'POST' })).status, 401);
  assert.equal((await f.request('/api/speech', { method: 'POST', headers: { Cookie: admin.cookie, Origin: f.base, 'X-CSRF-Token': 'bad' } })).status, 403);
  assert.deepEqual(events, []);
  const response = await f.request('/api/speech', { method: 'POST', headers: { Cookie: admin.cookie, Origin: f.base, 'X-CSRF-Token': session.csrfToken } });
  assert.equal(response.status, 200); assert.deepEqual(events, ['input', 'paid']);
  assert.deepEqual(await response.json(), { text: '대한민국', playerId: '2', turnId: 'turn-1',
    resolution: { status: 'answer', code: 'kr', text: '대한민국', reason: 'single-answer', source: 'rules' },
    quota: { dailyUsed: 1, dailyLimit: 120 } });
  const missing = await httpFixture(t, { env: { GROQ_API_KEY: '', OPENAI_API_KEY: 'legacy-key-never-real' }, speechModule }); const other = await missing.login(), otherSession = await missing.session(other.cookie);
  assert.equal((await missing.request('/api/speech', { method: 'POST', headers: { Cookie: other.cookie, Origin: missing.base, 'X-CSRF-Token': otherSession.csrfToken } })).status, 503);
  assert.equal(events.length, 2); assert.deepEqual(JSON.parse(await fs.readFile(path.join(missing.env.STATE_DIR, 'access.json'), 'utf8')).quota.monthly, {});
});

test('Groq 호출 실패는 자동 재시도·quota 환불 없이 원시 provider 오류·비밀을 응답에 숨긴다', async t => {
  let calls = 0;
  const f = await httpFixture(t, { speechModule: { readSpeechInput: async () => ({ playerId: '1', turnId: 'turn-1' }),
    createTranscriber: () => async () => { calls++; throw new Error('private-groq-token'); } } });
  const admin = await f.login(), session = await f.session(admin.cookie);
  const response = await f.request('/api/speech', { method: 'POST', headers: { Cookie: admin.cookie, Origin: f.base, 'X-CSRF-Token': session.csrfToken } });
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'service-unavailable' });
  assert.equal(calls, 1, '실패한 유료 인식은 자동으로 다시 호출하지 않는다');
  assert.equal(JSON.parse(await fs.readFile(path.join(f.env.STATE_DIR, 'access.json'), 'utf8')).quota.monthly['2026-10'], 1);
});
