import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function fixture({ hostname = 'example.com', search = '', replies = [] } = {}) {
  const nodes = Object.fromEntries(['nav-home', 'nav-dex', 'nav-stats', 'nav-settings', 'nav-account'].map(id => [id, {}]));
  const requests = [], html = [], ready = [], blocked = [], timers = new Set();
  const ui = { esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    setMain(value) { html.push(value); return { contains: () => true }; },
    $(selector) { return { addEventListener() {}, innerHTML: '', value: '' }; }, on() {} };
  const context = { URLSearchParams, location: { hostname, search, replace() {} }, navigator: { onLine: true },
    document: { hidden: false, getElementById: id => nodes[id], addEventListener() {} },
    addEventListener() {}, setInterval(callback) { timers.add(callback); return callback; }, clearInterval(callback) { timers.delete(callback); },
    fetch: async (path, options) => { requests.push({ path, options }); const reply = replies.shift() || { status: 200, data: { authenticated: false } };
      if (reply.throw) throw new Error('offline'); if (reply.deferred) return reply.deferred;
      return { ok: reply.status < 400, status: reply.status, json: async () => reply.data }; },
    FQ: { ui } };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(new URL('../js/auth.js', import.meta.url), 'utf8'), context);
  return { ...context, context, nodes, requests, html, ready, blocked, timers,
    start: () => context.FQ.auth.start({ onReady: () => ready.push(true), onBlocked: () => blocked.push(true) }) };
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
    assert.match(f.html.at(-1), /Google 계정으로 로그인/);
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
  assert.match(f.html.at(-1), /초대받은 가족 계정/);
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
