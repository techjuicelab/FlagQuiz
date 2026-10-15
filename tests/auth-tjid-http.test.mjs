/* 중앙 인증은 가짜 공급자로 격리하고 실제 HTTP·쿠키·영속 quota 경계를 검사한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAuthServer, readConfig } from '../server/auth-server.mjs';
import { TechJuiceIdError } from '../server/lib/techjuice-id.mjs';

const NOW = Date.UTC(2026, 9, 3, 12);
const SUB = '12345678-1234-4123-8123-123456789abc';
const PASSWORD = 'fixture-password-never-real';
const DEVICE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'flagquiz-tjid-http-'));
  const staticRoot = path.join(directory, 'site');
  await fs.mkdir(staticRoot);
  await fs.writeFile(path.join(staticRoot, 'index.html'), 'protected quiz');
  await fs.writeFile(path.join(staticRoot, 'app.js'), 'protected script');
  let now = NOW, identity = { sub: SUB, email: 'child@example.invalid', emailVerified: true,
    techjuiceRole: 'user', superadmin: false, generation: 1, expiresAt: NOW + 3600_000 };
  let centralState = { gen: 1, disabled: false }, loginError = null, exchanges = 0;
  const events = [], passwordCalls = [], stateCalls = [], authorizations = [], exchangeCalls = [];
  const techjuiceId = {
    ready: true,
    async passwordGrant(identifier, password) {
      passwordCalls.push({ identifier, password });
      if (loginError) throw loginError;
      return password === PASSWORD && identity ? { ...identity } : null;
    },
    async sessionState(sub) { stateCalls.push(sub); events.push('central'); await options.onState?.(); return centralState && { ...centralState }; },
    authorizationUrl({ state, verifier, redirectUri }) {
      authorizations.push({ state, verifier, redirectUri });
      assert.match(verifier, /^[A-Za-z0-9._~-]{43,128}$/);
      return 'https://fixture.supabase.co/auth/v1/authorize?provider=google&state=' + state;
    },
    async exchangeCode(request) {
      exchangeCalls.push(request); exchanges++;
      if (loginError) throw loginError;
      return identity && { ...identity };
    },
    async resolveIdentifier() { return 'child@example.invalid'; }
  };
  const env = { AUTH_PROVIDER: 'techjuice-id', PUBLIC_ORIGIN: options.secure ? 'https://quiz.test' : 'http://127.0.0.1',
    TJID_SUPABASE_URL: 'https://fixture.supabase.co', TJID_SUPABASE_ANON_KEY: 'fixture-public-anon-key', TJID_APP_SLUG: 'flagquiz',
    TJID_GOOGLE_ENABLED: options.google ? 'true' : 'false', SESSION_SECRET: 'a'.repeat(64),
    STATE_DIR: path.join(directory, 'state'), STATIC_ROOT: staticRoot, SONIOX_API_KEY: 'fixture-soniox-key-never-real',
    TYPESAFE_API_KEY: options.typesafeApiKey || '' };
  let app;
  const speechModule = { readSpeechInput: async () => { events.push('input'); await options.onRead?.(); return { playerId: '0', turnId: '1', mode: 'voice' }; },
    createTranscriber: ({ apiKey }) => {
      assert.equal(apiKey, env.SONIOX_API_KEY);
      return async () => {
        const saved = JSON.parse(await fs.readFile(path.join(env.STATE_DIR, 'access.json'), 'utf8'));
        assert.equal(saved.quota.monthly['2026-10'], 1);
        events.push('paid');
        await options.onPaid?.();
        return { text: options.text || '대한민국' };
      };
    } };
  t.after(async () => { try { await app?.close(); } finally { await fs.rm(directory, { recursive: true, force: true }); } });
  let base;
  async function start() {
    app = await createAuthServer({ config: readConfig(env), techjuiceId, clock: () => now, speechModule,
      fetchImpl: async (url, config) => {
        events.push('jev');
        if (!options.onFetch) throw new Error('Unexpected fixture provider call');
        return options.onFetch(url, config);
      } });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    base = 'http://127.0.0.1:' + app.server.address().port;
    app.config.publicOrigin = base;
  }
  await start();
  const request = (route, init = {}) => fetch(base + route, { ...init, redirect: 'manual' });
  async function form() {
    const response = await request('/login'), html = await response.text();
    assert.equal(response.status, 200);
    const csrf = /name="csrf" value="([A-Za-z0-9_-]+)"/.exec(html)?.[1];
    assert.ok(csrf);
    const header = response.headers.getSetCookie().find(value => value.startsWith('flagquiz_login='));
    assert.ok(header);
    return { response, html, csrf, cookie: header.split(';')[0] };
  }
  async function password(formValue, { password = PASSWORD, identifier = 'child@example.invalid', csrf = formValue.csrf, cookie = formValue.cookie, headers = {}, body } = {}) {
    return request('/api/auth/password', { method: 'POST', headers: { Cookie: cookie, Origin: base,
      'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: body ?? new URLSearchParams({ identifier, password, csrf }) });
  }
  async function login() {
    const started = await form(), completed = await password(started);
    const sessionHeader = completed.headers.getSetCookie().find(value => value.startsWith('flagquiz_session='));
    return { started, completed, sessionHeader, cookie: sessionHeader?.split(';')[0] };
  }
  async function session(cookie) { return (await request('/api/auth/session', { headers: { Cookie: cookie } })).json(); }
  async function speech(cookie, csrfToken, headers = {}) {
    return request('/api/speech', { method: 'POST', headers: { Cookie: cookie, Origin: base, 'X-CSRF-Token': csrfToken, ...headers } });
  }
  return { get app() { return app; }, env, get base() { return base; }, directory, request, form, password, login, session, speech, events, passwordCalls, stateCalls,
    authorizations, exchangeCalls, get exchanges() { return exchanges; },
    setIdentity(value) { identity = value; }, setCentralState(value) { centralState = value; }, setLoginError(value) { loginError = value; },
    async restart() { await app.close(); await start(); },
    advance(milliseconds) { now += milliseconds; } };
}

test('중앙 이메일·비밀번호 폼 로그인은 앱 권한을 가진 계정에 별도 HttpOnly 세션만 발급한다', async t => {
  const f = await fixture(t, { secure: true }), login = await f.login();
  assert.equal(login.completed.status, 303); assert.equal(login.completed.headers.get('location'), '/');
  assert.match(login.started.html, /기존 TechJuice ID/);
  assert.match(login.started.html, /action="\/api\/auth\/password"/);
  assert.match(login.started.html, /<script src="\/login-legacy\.js" defer><\/script>/);
  assert.doesNotMatch(login.started.html, /Google 계정으로 로그인|fixture-public-anon-key|fixture-soniox-key/);
  assert.match(login.sessionHeader, /HttpOnly/); assert.match(login.sessionHeader, /SameSite=Lax/); assert.match(login.sessionHeader, /Secure/);
  assert.match(login.sessionHeader, /Max-Age=2592000(?:;|$)/);
  assert.deepEqual(f.passwordCalls, [{ identifier: 'child@example.invalid', password: PASSWORD }]);
  const session = await f.session(login.cookie);
  assert.equal(session.authenticated, true); assert.equal(session.email, 'child@example.invalid'); assert.equal(session.role, 'user');
  assert.ok(session.csrfToken); assert.equal(session.expiresAt, NOW + DEVICE_SESSION_MS);
  assert.equal((await f.request('/app.js', { headers: { Cookie: login.cookie } })).status, 200);
  assert.equal((await f.request('/app.js')).status, 401);
  const state = JSON.parse(await fs.readFile(path.join(f.env.STATE_DIR, 'access.json'), 'utf8'));
  assert.equal(state.sessions[0].generation, 1);
  assert.doesNotMatch(JSON.stringify(state), /fixture-password|fixture-soniox-key|fixture-public-anon-key/);
});

test('기기 로그인은 중앙 JWT 만료 후 새 요청과 같은 상태 디렉터리의 서버 재시작에서도 30일 동안 유지된다', async t => {
  const f = await fixture(t), login = await f.login();
  assert.equal(login.completed.status, 303);
  const initial = await f.session(login.cookie);
  f.advance(2 * 3600_000);
  const reopened = await f.session(login.cookie);
  assert.equal(reopened.authenticated, true, '1시간 중앙 JWT가 만료되어도 기기 세션은 유지된다');
  assert.equal(reopened.expiresAt, NOW + DEVICE_SESSION_MS);
  assert.equal((await f.request('/app.js', { headers: { Cookie: login.cookie } })).status, 200);
  await f.restart();
  const restarted = await f.session(login.cookie);
  assert.equal(restarted.authenticated, true, '메모리 캐시를 비우고 영속 세션을 다시 읽는다');
  assert.equal(restarted.csrfToken, initial.csrfToken);
  assert.equal(restarted.expiresAt, initial.expiresAt);
  assert.equal(f.passwordCalls.length, 1, '앱 재접속은 비밀번호 로그인을 다시 호출하지 않는다');
  const saved = JSON.parse(await fs.readFile(path.join(f.env.STATE_DIR, 'access.json'), 'utf8'));
  assert.equal(saved.sessions.length, 1);
  assert.doesNotMatch(JSON.stringify(saved), /fixture-password|access_token|refresh_token/);
});

test('기기 로그인은 마지막 사용과 서버 재시작이 있어도 최초 로그인에서 30일이 지나면 만료된다', async t => {
  const f = await fixture(t), login = await f.login();
  f.advance(DEVICE_SESSION_MS - 1);
  assert.equal((await f.session(login.cookie)).authenticated, true);
  await f.restart();
  assert.equal((await f.session(login.cookie)).authenticated, true);
  f.advance(1);
  assert.equal((await f.session(login.cookie)).authenticated, false);
  assert.equal((await f.request('/app.js', { headers: { Cookie: login.cookie } })).status, 401);
  await f.restart();
  assert.equal((await f.session(login.cookie)).authenticated, false);
});

test('기기 로그인은 중앙 JWT 만료 뒤 서버를 다시 열어도 disabled·세대 변경을 확인하고 영속 세션을 회수한다', async t => {
  for (const state of [{ gen: 1, disabled: true }, { gen: 2, disabled: false }]) {
    const f = await fixture(t), login = await f.login();
    f.advance(2 * 3600_000);
    await f.restart();
    f.setCentralState(state);
    const calls = f.stateCalls.length;
    assert.equal((await f.session(login.cookie)).authenticated, false);
    assert.equal(f.stateCalls.length, calls + 1, '장기 기기 쿠키도 중앙 상태를 실제로 조회한다');
    const saved = JSON.parse(await fs.readFile(path.join(f.env.STATE_DIR, 'access.json'), 'utf8'));
    assert.equal(saved.sessions.length, 0);
    await f.restart();
    f.setCentralState({ gen: 1, disabled: false });
    assert.equal((await f.session(login.cookie)).authenticated, false, '회수한 쿠키는 재시작 후 다시 살아나지 않는다');
  }
});

test('기기 로그인의 중앙 조회 장애는 오래된 쿠키의 접근을 닫고 정상 복구 뒤 같은 유효 세션을 보존한다', async t => {
  const f = await fixture(t), login = await f.login();
  f.advance(2 * 3600_000);
  await f.restart();
  f.setCentralState(null);
  const unavailable = await f.request('/api/auth/session', { headers: { Cookie: login.cookie } });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: 'identity-unavailable' });
  assert.equal((await f.request('/app.js', { headers: { Cookie: login.cookie } })).status, 503);
  f.setCentralState({ gen: 1, disabled: false });
  assert.equal((await f.session(login.cookie)).authenticated, true, '일시 조회 장애는 비밀번호 재입력을 강제하지 않는다');
  assert.equal(f.passwordCalls.length, 1);
});

test('기기 로그인은 JWT 만료 뒤 서버 재시작 후에도 CSRF 로그아웃과 회수 상태를 보존한다', async t => {
  const f = await fixture(t), login = await f.login();
  f.advance(2 * 3600_000);
  await f.restart();
  const session = await f.session(login.cookie);
  assert.equal(session.authenticated, true);
  const denied = await f.request('/api/auth/logout', { method: 'POST', headers: { Cookie: login.cookie, Origin: f.base } });
  assert.equal(denied.status, 403);
  const logout = await f.request('/api/auth/logout', { method: 'POST', headers: { Cookie: login.cookie, Origin: f.base, 'X-CSRF-Token': session.csrfToken } });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.getSetCookie()[0], /Max-Age=0(?:;|$)/);
  assert.equal((await f.session(login.cookie)).authenticated, false);
  await f.restart();
  assert.equal((await f.session(login.cookie)).authenticated, false);
});

test('로그인 페이지는 익명 사용자에게만 폼을 보여 주고 유효한 기기 쿠키는 서버 재시작 뒤에도 앱으로 이동한다', async t => {
  const f = await fixture(t);
  const anonymous = await f.request('/login');
  assert.equal(anonymous.status, 200);
  assert.match(await anonymous.text(), /<form method="post" action="\/api\/auth\/password">/);
  const login = await f.login();
  f.advance(2 * 3600_000);
  await f.restart();
  const restored = await f.request('/login', { headers: { Cookie: login.cookie } });
  assert.equal(restored.status, 303);
  assert.equal(restored.headers.get('location'), '/');
  assert.equal(restored.headers.get('cache-control'), 'no-store, private');
  assert.equal(restored.headers.getSetCookie().some(value => value.startsWith('flagquiz_login=')), false);
  assert.equal(f.passwordCalls.length, 1);
});

test('로그인 페이지는 서명이 바뀌거나 30일 만료된 기기 쿠키를 앱 접근으로 바꾸지 않는다', async t => {
  const f = await fixture(t), login = await f.login();
  const forged = login.cookie.slice(0, -1) + (login.cookie.endsWith('a') ? 'b' : 'a');
  const tampered = await f.request('/login', { headers: { Cookie: forged } });
  assert.equal(tampered.status, 200);
  assert.match(await tampered.text(), /action="\/api\/auth\/password"/);
  f.advance(DEVICE_SESSION_MS);
  const expired = await f.request('/login', { headers: { Cookie: login.cookie } });
  assert.equal(expired.status, 200);
  assert.match(await expired.text(), /action="\/api\/auth\/password"/);
  assert.equal(f.passwordCalls.length, 1);
});

test('로그인 페이지의 중앙 조회 장애는 유효 쿠키를 삭제하거나 로그인 폼으로 우회하지 않고 복구 뒤 앱으로 이동한다', async t => {
  const f = await fixture(t), login = await f.login();
  f.advance(2 * 3600_000);
  await f.restart();
  f.setCentralState(null);
  const unavailable = await f.request('/login', { headers: { Cookie: login.cookie } });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: 'identity-unavailable' });
  assert.equal(unavailable.headers.getSetCookie().length, 0);
  f.setCentralState({ gen: 1, disabled: false });
  const restored = await f.request('/login', { headers: { Cookie: login.cookie } });
  assert.equal(restored.status, 303);
  assert.equal(restored.headers.get('location'), '/');
  assert.equal(f.passwordCalls.length, 1);
});

test('로그인 페이지는 native form POST의 Origin을 보존하는 same-origin 정책을 사용한다', async t => {
  const f = await fixture(t), form = await f.form();
  assert.equal(form.response.headers.get('referrer-policy'), 'same-origin');
  assert.match(form.html, /<form method="post" action="\/api\/auth\/password">/);
});

test('비밀번호 로그인은 같은 Origin·폼 CSRF·로그인 쿠키가 확인되기 전 중앙 공급자를 호출하지 않는다', async t => {
  const f = await fixture(t), form = await f.form();
  const opaqueOrigin = await f.password(form, { headers: { Origin: 'null', 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(opaqueOrigin.status, 403);
  assert.deepEqual(await opaqueOrigin.json(), { error: 'request-not-allowed' });
  assert.equal(f.passwordCalls.length, 0);
  for (const patch of [{ csrf: 'wrong' }, { cookie: '' }, { headers: { Origin: 'https://attacker.test' } },
    { headers: { Origin: '' } }, { headers: { 'Sec-Fetch-Site': 'cross-site' } }]) {
    const response = await f.password(form, patch); assert.equal(response.status, 403); await response.arrayBuffer();
  }
  assert.equal(f.passwordCalls.length, 0);
  assert.equal((await f.password(form, { headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 415);
  assert.equal((await f.password(form, { body: new URLSearchParams([['identifier', 'a'], ['identifier', 'b'], ['password', PASSWORD], ['csrf', form.csrf]]) })).status, 400);
  assert.equal((await f.password(form, { body: 'identifier=' + 'a'.repeat(8192) })).status, 413);
  assert.equal(f.passwordCalls.length, 0);
  f.advance(10 * 60_000);
  assert.equal((await f.password(form)).status, 403);
  assert.equal(f.passwordCalls.length, 0);
});

test('잘못된 비밀번호·없는 앱 역할·만료된 중앙 identity는 로컬 허용 목록만으로 로그인시키지 않는다', async t => {
  const f = await fixture(t), form = await f.form();
  const wrong = await f.password(form, { password: 'wrong-password' });
  assert.equal(wrong.status, 303); assert.equal(wrong.headers.get('location'), '/login?error=failed');
  assert.equal(wrong.headers.getSetCookie().some(value => value.startsWith('flagquiz_session=')), false);
  for (const patch of [{ techjuiceRole: undefined }, { techjuiceRole: 'owner' }, { generation: undefined }, { generation: 0 }]) {
    f.setIdentity({ sub: SUB, email: 'child@example.invalid', expiresAt: NOW + 3600_000, techjuiceRole: 'user', generation: 1, ...patch });
    const denied = await f.login(); assert.equal(denied.completed.status, 303);
    assert.equal(denied.completed.headers.get('location'), '/login?error=denied'); assert.equal(denied.cookie, undefined);
  }
  f.setIdentity({ sub: SUB, email: 'child@example.invalid', expiresAt: NOW, techjuiceRole: 'user', generation: 1 });
  const expired = await f.login(); assert.equal(expired.completed.headers.get('location'), '/login?error=failed'); assert.equal(expired.cookie, undefined);
  const state = JSON.parse(await fs.readFile(path.join(f.env.STATE_DIR, 'access.json'), 'utf8'));
  assert.equal(state.sessions.length, 0);
});

test('중앙 로그인 장애는 기존 세션이나 원시 오류·비밀을 반환하지 않는다', async t => {
  const f = await fixture(t); f.setLoginError(new TechJuiceIdError('identity-unavailable'));
  const login = await f.login(); assert.equal(login.completed.status, 503); assert.equal(login.cookie, undefined);
  assert.deepEqual(await login.completed.json(), { error: 'login-failed' });
  f.setLoginError(new Error('fixture-private-provider-token'));
  const failed = await f.login(); assert.equal(failed.completed.status, 503);
  assert.deepEqual(await failed.completed.json(), { error: 'service-unavailable' });
});

test('중앙 disabled·세대 변경은 캐시된 세션이 있어도 유료 요청 직전에 새로 읽고 무효화한다', async t => {
  for (const state of [{ gen: 1, disabled: true }, { gen: 2, disabled: false }]) {
    const f = await fixture(t), login = await f.login(), session = await f.session(login.cookie);
    assert.equal(session.authenticated, true); const calls = f.stateCalls.length;
    f.events.length = 0; f.setCentralState(state);
    const response = await f.speech(login.cookie, session.csrfToken);
    assert.equal(response.status, 401); assert.deepEqual(await response.json(), { error: 'login-required' });
    assert.equal(f.stateCalls.length, calls + 1); assert.deepEqual(f.events, ['input', 'central']);
    assert.equal((await f.session(login.cookie)).authenticated, false);
    assert.equal((await f.request('/app.js', { headers: { Cookie: login.cookie } })).status, 401);
    const saved = JSON.parse(await fs.readFile(path.join(f.env.STATE_DIR, 'access.json'), 'utf8'));
    assert.equal(saved.sessions.length, 0); assert.deepEqual(saved.quota.monthly, {});
  }
});

test('중앙 상태를 확인할 수 없으면 유료 호출을 닫고 일반 앱 접근도 캐시 만료 후 닫는다', async t => {
  const f = await fixture(t), login = await f.login(), session = await f.session(login.cookie);
  f.setCentralState(null); f.events.length = 0;
  const response = await f.speech(login.cookie, session.csrfToken);
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'identity-unavailable' });
  assert.deepEqual(f.events, ['input', 'central']);
  f.advance(60001);
  assert.equal((await f.request('/app.js', { headers: { Cookie: login.cookie } })).status, 503);
  assert.equal((await f.request('/api/auth/session', { headers: { Cookie: login.cookie } })).status, 503);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.env.STATE_DIR, 'access.json'), 'utf8')).quota.monthly, {});
});

test('중앙 상태 조회를 기다리는 동안 세션이 만료되면 앱 파일과 로그인 상태를 다시 닫는다', async t => {
  let f;
  f = await fixture(t, { onState: () => f.advance(DEVICE_SESSION_MS) });
  const login = await f.login(), response = await f.request('/app.js', { headers: { Cookie: login.cookie } });
  assert.equal(response.status, 401);
  assert.equal((await f.session(login.cookie)).authenticated, false);
});

test('음성 업로드를 읽는 동안 중앙 세대가 바뀌면 읽기 완료 뒤 새 상태를 확인해 quota·유료 호출을 막는다', async t => {
  let f;
  f = await fixture(t, { onRead: () => f.setCentralState({ gen: 2, disabled: false }) });
  const login = await f.login(), session = await f.session(login.cookie); f.events.length = 0;
  const response = await f.speech(login.cookie, session.csrfToken);
  assert.equal(response.status, 401); assert.deepEqual(f.events, ['input', 'central']);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.env.STATE_DIR, 'access.json'), 'utf8')).quota.monthly, {});
});

test('중앙 세션·CSRF·Origin 검사 뒤 사용량을 저장한 후에만 유료 음성 호출을 한다', async t => {
  const f = await fixture(t), login = await f.login(), session = await f.session(login.cookie);
  f.events.length = 0;
  for (const patch of [{ 'X-CSRF-Token': 'bad' }, { Origin: 'https://attacker.test' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const response = await f.speech(login.cookie, session.csrfToken, patch); assert.equal(response.status, 403); await response.arrayBuffer();
  }
  assert.deepEqual(f.events, []);
  const response = await f.speech(login.cookie, session.csrfToken);
  assert.equal(response.status, 200); assert.deepEqual(f.events, ['input', 'central', 'paid']);
  assert.deepEqual(await response.json(), { text: '대한민국', playerId: '0', turnId: '1', mode: 'voice',
    resolution: { status: 'answer', code: 'kr', text: '대한민국', reason: 'single-answer', source: 'rules' }, quota: { dailyUsed: 1, dailyLimit: 120 } });
  assert.equal((await f.request('/api/speech', { method: 'POST' })).status, 401);
});

test('STT 호출 중 중앙 disabled·세대 변경·장애가 생기면 추가 Jev 호출 직전에 다시 닫는다', async t => {
  for (const [state, status, error] of [
    [{ gen: 1, disabled: true }, 401, 'login-required'],
    [{ gen: 2, disabled: false }, 401, 'login-required'],
    [null, 503, 'identity-unavailable']
  ]) {
    let f;
    f = await fixture(t, { typesafeApiKey: 'fixture-typesafe-never-real',
      text: '포르투갈 스페인 중에서 포르투갈 쪽으로 선택할래', onPaid: () => f.setCentralState(state) });
    const login = await f.login(), session = await f.session(login.cookie); f.events.length = 0;
    const response = await f.speech(login.cookie, session.csrfToken);
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { error });
    assert.deepEqual(f.events, ['input', 'central', 'paid', 'central']);
    assert.equal(f.events.includes('jev'), false);
    assert.equal(JSON.parse(await fs.readFile(path.join(f.env.STATE_DIR, 'access.json'), 'utf8')).quota.monthly['2026-10'], 1);
  }
});

test('추가 Jev 호출은 최신 중앙 상태를 두 번째로 확인한 후 전사와 실제 후보만 보낸다', async t => {
  const text = '스페인은 처음에 떠올랐던 거고 포르투갈 쪽으로 할래';
  const f = await fixture(t, { typesafeApiKey: 'fixture-typesafe-never-real', text,
    onFetch: async (url, config) => {
      assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
      const payload = JSON.parse(config.body);
      assert.equal(payload.model, 'jev-1.13.0'); assert.deepEqual(payload.state, { utterance: text });
      assert.deepEqual(Object.keys(payload.questions.final_selection.criteria).sort(), ['es', 'giveup', 'pt', 'unresolved']);
      return new Response(JSON.stringify({ model: 'jev-1.13.0', answers: { final_selection: { type: 'choice', choice: 'pt', confidence: 0.98,
        probabilities: { es: 0.005, pt: 0.985, unresolved: 0.005, giveup: 0.005 } } } }), { headers: { 'Content-Type': 'application/json' } });
    } });
  const login = await f.login(), session = await f.session(login.cookie); f.events.length = 0;
  const response = await f.speech(login.cookie, session.csrfToken);
  assert.equal(response.status, 200); assert.deepEqual(f.events, ['input', 'central', 'paid', 'central', 'jev']);
  const result = await response.json();
  assert.equal(result.text, text); assert.equal(result.mode, 'voice');
  assert.deepEqual(result.resolution, { status: 'answer', code: 'pt', text: '포르투갈', reason: 'final-selection', source: 'jev' });
  assert.deepEqual(result.quota, { dailyUsed: 1, dailyLimit: 120 });
});

test('로그아웃도 자체 세션 CSRF가 필요하고 성공 후 앱 접근을 닫는다', async t => {
  const f = await fixture(t), login = await f.login(), session = await f.session(login.cookie);
  const denied = await f.request('/api/auth/logout', { method: 'POST', headers: { Cookie: login.cookie, Origin: f.base } });
  assert.equal(denied.status, 403);
  const complete = await f.request('/api/auth/logout', { method: 'POST', headers: { Cookie: login.cookie, Origin: f.base, 'X-CSRF-Token': session.csrfToken } });
  assert.equal(complete.status, 200); assert.match(complete.headers.getSetCookie()[0], /Max-Age=0/);
  assert.equal((await f.session(login.cookie)).authenticated, false);
});

test('Google가 꺼진 중앙 로그인은 비밀번호 폼만 제공하고 OAuth 시작을 중앙 공급자에 보내지 않는다', async t => {
  const f = await fixture(t), form = await f.form();
  assert.doesNotMatch(form.html, /Google 계정으로 로그인/);
  const response = await f.request('/api/auth/login'); assert.equal(response.status, 303); assert.equal(response.headers.get('location'), '/login');
  assert.equal(f.authorizations.length, 0); assert.equal(f.exchanges, 0);
});

test('Google 옵션은 서버의 PKCE verifier·state·로그인 쿠키를 묶고 콜백 재사용을 거절한다', async t => {
  const f = await fixture(t, { google: true }), form = await f.form();
  assert.match(form.html, /Google 계정으로 로그인/);
  const started = await f.request('/api/auth/login'); assert.equal(started.status, 303);
  const state = new URL(started.headers.get('location')).searchParams.get('state');
  const cookie = started.headers.getSetCookie()[0].split(';')[0];
  assert.equal(f.authorizations.length, 1); assert.equal(f.authorizations[0].redirectUri, f.base + '/api/auth/callback');
  assert.ok(state.length >= 43);
  const route = '/api/auth/callback?code=valid&state=' + state;
  assert.equal((await f.request(route)).status, 401); assert.equal(f.exchanges, 0);
  assert.equal((await f.request('/api/auth/callback?code=valid&state=wrong', { headers: { Cookie: cookie } })).status, 401);
  const completed = await f.request(route, { headers: { Cookie: cookie } }); assert.equal(completed.status, 303); assert.equal(completed.headers.get('location'), '/');
  assert.match(completed.headers.getSetCookie().find(value => value.startsWith('flagquiz_session=')), /Max-Age=2592000(?:;|$)/);
  assert.equal(f.exchanges, 1); assert.deepEqual(f.exchangeCalls[0], { code: 'valid', verifier: f.authorizations[0].verifier });
  assert.equal((await f.request(route, { headers: { Cookie: cookie } })).status, 401); assert.equal(f.exchanges, 1);
  const ownCookie = completed.headers.getSetCookie().find(value => value.startsWith('flagquiz_session='))?.split(';')[0];
  assert.equal((await f.session(ownCookie)).authenticated, true);
});

test('Google 교차 사이트 시작과 만료된 state는 중앙 코드 교환 없이 거절한다', async t => {
  const f = await fixture(t, { google: true });
  const blocked = await f.request('/api/auth/login', { headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(blocked.status, 403); assert.equal(f.authorizations.length, 0);
  const started = await f.request('/api/auth/login');
  const state = new URL(started.headers.get('location')).searchParams.get('state'), cookie = started.headers.getSetCookie()[0].split(';')[0];
  f.advance(10 * 60_000);
  const expired = await f.request('/api/auth/callback?code=valid&state=' + state, { headers: { Cookie: cookie } });
  assert.equal(expired.status, 401); assert.equal(f.exchanges, 0);
});
