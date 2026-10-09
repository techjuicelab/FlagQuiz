import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function fixture({ hostname = 'example.com', search = '', replies = [], local = new Map(), online = true } = {}) {
  const nodes = Object.fromEntries(['nav-home', 'nav-dex', 'nav-stats', 'nav-settings', 'nav-account'].map(id => [id, {}]));
  const requests = [], html = [], ready = [], blocked = [], changes = [], timers = new Set(), events = {}, workerEvents = {}, messages = [];
  const controls = new Map();
  const ui = { esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    setMain(value) { html.push(value); return { contains: () => true }; },
    $(selector) { if (!controls.has(selector)) controls.set(selector, { addEventListener(type, callback) { this[type] = callback; }, innerHTML: '', value: '' }); return controls.get(selector); }, on() {} };
  const context = { URLSearchParams, location: { hostname, search, replace() {} }, navigator: { onLine: online,
    serviceWorker: { controller: { postMessage(message) { messages.push(message); } }, addEventListener(type, callback) { workerEvents[type] = callback; } } },
    localStorage: { getItem: key => local.get(key) || null, setItem: (key, value) => local.set(key, value), removeItem: key => local.delete(key) },
    document: { hidden: false, getElementById: id => nodes[id], addEventListener(type, callback) { events[type] = callback; } },
    addEventListener(type, callback) { events[type] = callback; }, setInterval(callback) { timers.add(callback); return callback; }, clearInterval(callback) { timers.delete(callback); },
    fetch: async (path, options) => { requests.push({ path, options }); const reply = replies.shift() || { status: 200, data: { authenticated: false } };
      if (reply.throw) throw new Error('offline'); if (reply.deferred) return reply.deferred;
      return { ok: reply.status < 400, status: reply.status, json: async () => reply.data }; },
    FQ: { ui } };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(new URL('../js/auth.js', import.meta.url), 'utf8'), context);
  return { ...context, context, nodes, requests, html, ready, blocked, changes, timers, local, controls, events, workerEvents, messages,
    start: () => context.FQ.auth.start({ onReady: () => ready.push(true), onBlocked: () => blocked.push(true), onSessionChange: (next, previous) => changes.push({ next, previous }) }) };
}

test('서버가 확인하기 전에는 놀이를 열지 않고 인증된 세션만 시작한다', async () => {
  const f = fixture({ replies: [{ status: 200, data: { authenticated: true, role: 'user', email: 'child@example.com', csrfToken: 'csrf' } }] });
  const pending = f.start();
  assert.equal(f.nodes['nav-home'].disabled, true);
  assert.equal(f.ready.length, 0);
  await pending;
  assert.equal(f.nodes['nav-home'].disabled, false);
  assert.equal(f.ready.length, 1);
  assert.equal(f.requests[0].options.cache, 'no-store');
  assert.equal(f.requests[0].options.credentials, 'same-origin');
});

test('미인증·응답실패에는 모든 놀이가 잠기고 preview 쿼리도 공개호스트에서는 우회할 수 없다', async () => {
  for (const reply of [{ status: 200, data: { authenticated: false } }, { throw: true }, { status: 503, data: {} }]) {
    const f = fixture({ search: '?preview=1', replies: [reply] });
    await f.start();
    assert.equal(f.ready.length, 0);
    assert.equal(f.nodes['nav-home'].disabled, true);
    assert.equal(f.FQ.auth.session(), null);
    assert.match(f.html.at(-1), /TechJuice ID로 로그인/);
    assert.doesNotMatch(f.html.at(-1), /개발 미리보기 열기/);
  }
});

test('로컬 명시적 preview는 인증 연결로 표시하지 않고 계정 관리도 열지 않는다', async () => {
  const f = fixture({ hostname: 'localhost', search: '?preview=1' });
  await f.start();
  assert.equal(f.FQ.auth.session().preview, true);
  assert.equal(f.requests.length, 0);
  assert.equal(f.nodes['nav-account'].hidden, true);
  f.FQ.auth.account({ onHome() {} });
  assert.equal(f.html.length, 0);
});

test('접속 해제된 세션을 다시 확인하면 진행 중 화면을 정리하고 초대 로그인 화면으로 돌아간다', async () => {
  const f = fixture({ replies: [{ status: 200, data: { authenticated: true, role: 'user', email: 'x@example.com' } }, { status: 401, data: {} }] });
  await f.start();
  assert.equal(f.timers.size, 1);
  await f.FQ.auth.refresh(false);
  assert.equal(f.FQ.auth.session(), null);
  assert.equal(f.blocked.length, 1);
  assert.equal(f.nodes['nav-stats'].disabled, true);
  assert.equal(f.timers.size, 0);
});

test('관리자 이메일을 썼더라도 서버의 일반 사용자 역할이면 초대 관리 UI를 주지 않는다', async () => {
  const f = fixture({ replies: [{ status: 200, data: { authenticated: true, role: 'user', email: 'TECHJUICELAB@gmail.com' } }] });
  await f.start();
  f.FQ.auth.account({ onHome() {} });
  assert.doesNotMatch(f.html.at(-1), /allowlist-form/);
  assert.match(f.html.at(-1), /TechJuice ID로 로그인한 가족 계정/);
});

test('변경 요청은 현재 서버 세션 CSRF 토큰을 사용하고 화면에 이메일 HTML을 실행하지 않는다', async () => {
  const f = fixture({ replies: [{ status: 200, data: { authenticated: true, role: 'user', email: '<img src=x>', csrfToken: 'server-csrf' } }, { status: 200, data: {} }] });
  await f.start();
  f.FQ.auth.account({ onHome() {} });
  assert.match(f.html.at(-1), /&lt;img/);
  await f.FQ.auth.api('/api/auth/logout', { method: 'POST' });
  assert.equal(f.requests.at(-1).options.headers['X-CSRF-Token'], 'server-csrf');
});

test('로그인 해제 이후 도착한 과거 세션 확인 응답은 화면과 권한을 다시 열지 않는다', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const f = fixture({ replies: [{ status: 200, data: { authenticated: true, role: 'user', email: 'x@example.com' } },
    { deferred: pending }, { status: 401, data: {} }] });
  await f.start();
  const previous = f.FQ.auth.refresh(false);
  await assert.rejects(f.FQ.auth.api('/api/speech', { method: 'POST' }));
  resolve({ ok: true, status: 200, json: async () => ({ authenticated: true, role: 'user', email: 'x@example.com' }) });
  await previous;
  assert.equal(f.FQ.auth.session(), null);
  assert.equal(f.nodes['nav-home'].disabled, true);
  assert.equal(f.ready.length, 1);
});

test('인터넷이 끊겨도 이미 만료된 서버 세션은 놀이를 열지 않는다', async () => {
  const f = fixture({ replies: [{ status: 200, data: { authenticated: true, expiresAt: Date.now() - 1000 } }] });
  await f.start();
  assert.equal(f.FQ.auth.session(), null);
  assert.equal(f.ready.length, 0);
});

test('클라우드 말하기가 권한 해제를 알리면 진행 중이던 세션 조회도 즉시 무효화한다', async () => {
  let resolve;
  const f = fixture({ replies: [{ status: 200, data: { authenticated: true } },
    { deferred: new Promise(done => { resolve = done; }) }] });
  await f.start();
  const pending = f.FQ.auth.refresh(false);
  f.FQ.auth.requireLogin();
  assert.equal(f.FQ.auth.session(), null);
  assert.equal(f.nodes['nav-home'].disabled, true);
  resolve({ ok: true, status: 200, json: async () => ({ authenticated: true }) });
  await pending;
  assert.equal(f.FQ.auth.session(), null);
});

test('저장된 기한 내 오프라인 세션으로 놀이를 열되 계정 권한·CSRF는 복원하지 않는다', async () => {
  const f = fixture({ online: false, replies: [{ status: 200, data: { authenticated: true, offline: true,
    expiresAt: Date.now() + 60000, role: 'superadmin', csrfToken: 'must-not-use', email: 'must-not-restore@example.com' } }] });
  await f.start();
  assert.equal(f.ready.length, 1);
  assert.equal(f.nodes['nav-home'].disabled, false);
  assert.equal(f.FQ.auth.session().offline, true);
  assert.equal(f.FQ.auth.session().role, undefined);
  assert.equal(f.FQ.auth.session().email, undefined);
  assert.equal(f.FQ.auth.csrfToken(), '');
  f.FQ.auth.account({ onHome() {} });
  assert.match(f.html.at(-1), /오프라인 가족 계정/);
  assert.doesNotMatch(f.html.at(-1), /allowlist-form|must-not-/);
});

test('유효기한이 없는 오프라인 세션은 놀이를 열지 않는다', async () => {
  for (const expiresAt of [undefined, null, 'tomorrow', Date.now() - 1000]) {
    const f = fixture({ online: false, replies: [{ status: 200, data: { authenticated: true, offline: true, expiresAt } }] });
    await f.start();
    assert.equal(f.ready.length, 0);
    assert.equal(f.FQ.auth.session(), null);
  }
});

test('오프라인 로그인 후 연결이 돌아오면 서버의 현재 권한을 다시 확인한다', async () => {
  const f = fixture({ online: false, replies: [{ status: 200, data: { authenticated: true, offline: true, expiresAt: Date.now() + 60000 } },
    { status: 200, data: { authenticated: true, email: 'current@example.com', role: 'user', csrfToken: 'fresh' } }] });
  await f.start();
  f.navigator.onLine = true; f.events.online();
  await f.FQ.auth.refresh(false);
  assert.equal(f.FQ.auth.session().offline, undefined);
  assert.equal(f.FQ.auth.csrfToken(), 'fresh');
  assert.equal(f.changes.length, 2);
  assert.equal(f.changes[1].previous.offline, true);
  assert.equal(f.changes[1].next.email, 'current@example.com');
});

test('브라우저는 온라인이어도 서버 접속이 끊기고 복구되는 세션 변경을 알린다', async () => {
  const f = fixture({ replies: [{ status: 200, data: { authenticated: true, expiresAt: Date.now() + 60000 } },
    { status: 200, data: { authenticated: true, offline: true, expiresAt: Date.now() + 60000 } },
    { status: 200, data: { authenticated: true, expiresAt: Date.now() + 60000 } }] });
  await f.start();
  await f.FQ.auth.refresh(false);
  await f.FQ.auth.refresh(false);
  assert.equal(f.navigator.onLine, true);
  assert.deepEqual(f.changes.map(change => Boolean(change.next.offline)), [false, true, false]);
});

test('개발 미리보기는 연결 복귀에도 서버 로그인을 조회하거나 놀이를 잠그지 않는다', async () => {
  const f = fixture({ hostname: 'localhost', search: '?preview=1' });
  await f.start();
  f.events.online(); await f.FQ.auth.refresh(false);
  assert.equal(f.requests.length, 0);
  assert.equal(f.FQ.auth.session().preview, true);
  assert.equal(f.blocked.length, 0);
});

test('온라인 관리자 세션도 연결이 끊기면 계정 변경·API 토큰 사용을 제한한다', async () => {
  const f = fixture({ replies: [{ status: 200, data: { authenticated: true, email: 'admin@example.com', role: 'superadmin', csrfToken: 'private' } }] });
  await f.start();
  f.navigator.onLine = false;
  f.FQ.auth.account({ onHome() {} });
  assert.match(f.html.at(-1), /오프라인 가족 계정/);
  assert.doesNotMatch(f.html.at(-1), /allowlist-form/);
  assert.equal(f.FQ.auth.csrfToken(), '');
  await assert.rejects(f.FQ.auth.api('/api/admin/allowlist', { method: 'POST' }), /인터넷에 연결/);
  assert.equal(f.requests.length, 1);
  assert.ok(f.FQ.auth.session());
});

test('다른 창의 워커가 로그인 해제를 알리면 즉시 놀이를 잠그고 캐시 정리를 되풀이하지 않는다', async () => {
  const f = fixture({ replies: [{ status: 200, data: { authenticated: true } }] });
  await f.start();
  f.workerEvents.message({ data: { type: 'OFFLINE_AUTH_REVOKED' } });
  assert.equal(f.FQ.auth.session(), null);
  assert.equal(f.nodes['nav-home'].disabled, true);
  assert.equal(f.messages.length, 0);
});

test('오프라인 로그아웃은 즉시 잠그고 재실행·재연결 뒤 서버 세션까지 해제한다', async () => {
  const local = new Map([['flagquiz.v1', '{"stats":{"xp":250}}']]);
  const f = fixture({ local, online: false, replies: [{ status: 200, data: { authenticated: true, offline: true, expiresAt: Date.now() + 60000 } }] });
  await f.start();
  assert.equal(await f.FQ.auth.logout(), true);
  assert.equal(f.FQ.auth.session(), null);
  assert.equal(local.get('flagquiz.logout-pending'), '1');
  assert.equal(local.get('flagquiz.v1'), '{"stats":{"xp":250}}');
  assert.equal(f.messages.at(-1).type, 'OFFLINE_CLEAR');
  const reopened = fixture({ local, online: false });
  await reopened.start();
  assert.equal(reopened.ready.length, 0);
  assert.equal(reopened.requests.length, 0);
  reopened.navigator.onLine = true;
  reopened.context.fetch = async (path, options) => {
    reopened.requests.push({ path, options });
    return { ok: true, status: 200, json: async () => path.endsWith('/session')
      ? { authenticated: true, csrfToken: 'logout-csrf', expiresAt: Date.now() + 60000 } : { ok: true } };
  };
  reopened.events.online(); await reopened.FQ.auth.refresh(false);
  assert.deepEqual(reopened.requests.map(request => request.path), ['/api/auth/session', '/api/auth/logout']);
  assert.equal(reopened.requests[1].options.headers['X-CSRF-Token'], 'logout-csrf');
  assert.equal(local.has('flagquiz.logout-pending'), false);
  assert.equal(reopened.ready.length, 0);
});
