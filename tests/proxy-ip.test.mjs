/* 실제 계정·외부 API 없이 프록시 신뢰와 로그인 제한 경계를 검사한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { clientIp, normalizeIp, parseTrustedProxyIPs } from '../server/lib/proxy-ip.mjs';
import { createAuthServer, readConfig } from '../server/auth-server.mjs';

const PROXY = '172.21.0.1';
function request(peer, cf, xff) { return { socket: { remoteAddress: peer }, headers: { 'cf-connecting-ip': cf, 'x-forwarded-for': xff } }; }

test('프록시는 기본 신뢰하지 않고 IPv4·IPv6 exact IP만 정규화해 설정한다', () => {
  assert.deepEqual(parseTrustedProxyIPs(), []); assert.deepEqual(parseTrustedProxyIPs('  '), []);
  assert.deepEqual(parseTrustedProxyIPs('172.21.0.1, 2001:0db8:0:0:0:0:0:1, ::ffff:172.21.0.1'), [PROXY, '2001:db8::1']);
  assert.equal(normalizeIp('::ffff:ac15:1'), PROXY);
  assert.equal(normalizeIp('::1'), '::1');
  for (const value of ['172.21.0.0/16', '172.21.*.*', 'proxy.local', '172.21.0.1:80', '[::1]', 'fe80::1%eth0', ',', '172.21.0.1,']) {
    assert.throws(() => parseTrustedProxyIPs(value), /TRUSTED_PROXY_IPS/);
  }
  assert.throws(() => parseTrustedProxyIPs(Array(33).fill(PROXY).join(',')), /TRUSTED_PROXY_IPS/);
  assert.throws(() => parseTrustedProxyIPs(['172.21.0.1']), /TRUSTED_PROXY_IPS/);
});

test('명시한 프록시 peer와 단일 유효 CF IP가 모두 있을 때만 방문자 주소를 사용한다', () => {
  assert.equal(clientIp(request(PROXY, '198.51.100.1'), [PROXY]), '198.51.100.1');
  assert.equal(clientIp(request('::ffff:172.21.0.1', '2001:0db8::1'), [PROXY]), '2001:db8::1');
  assert.equal(clientIp(request(PROXY, '198.51.100.1')), PROXY);
  assert.equal(clientIp(request('172.21.0.2', '198.51.100.1'), [PROXY]), '172.21.0.2');
  assert.equal(clientIp(request(PROXY, undefined, '198.51.100.1'), [PROXY]), PROXY);
  for (const value of ['', 'invalid', '198.51.100.1, 198.51.100.2', ['198.51.100.1'], '198.51.100.1:80', '[2001:db8::1]', '198.051.100.1']) {
    assert.equal(clientIp(request(PROXY, value, '198.51.100.9'), [PROXY]), PROXY);
  }
});

test('서버 설정의 프록시 목록은 비어 있으면 직접 접속 계약을 유지하고 잘못된 참조·CIDR는 시작 전에 거부한다', () => {
  assert.deepEqual(readConfig({}).trustedProxyIPs, []);
  assert.deepEqual(readConfig({ TRUSTED_PROXY_IPS: PROXY }).trustedProxyIPs, [PROXY]);
  assert.throws(() => readConfig({ TRUSTED_PROXY_IPS: '172.21.0.0/16' }), /TRUSTED_PROXY_IPS/);
  assert.throws(() => readConfig({ TRUSTED_PROXY_IPS: 'op://private/vault/field' }), error => {
    assert.match(error.message, /Unresolved 1Password reference in TRUSTED_PROXY_IPS/);
    assert.doesNotMatch(error.message, /private|vault|field|op:\/\//); return true;
  });
});

async function fixture(t, { trusted = PROXY, google = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'flagquiz-proxy-test-'));
  let now = Date.UTC(2026, 9, 3, 12), providerCalls = 0;
  const app = await createAuthServer({ config: readConfig({ AUTH_PROVIDER: 'techjuice-id', PUBLIC_ORIGIN: 'http://127.0.0.1',
    TJID_SUPABASE_URL: 'https://fixture.supabase.co', TJID_SUPABASE_ANON_KEY: 'fixture-public-key',
    TJID_GOOGLE_ENABLED: google ? 'true' : 'false', TRUSTED_PROXY_IPS: trusted, SESSION_SECRET: 's'.repeat(64),
    STATE_DIR: path.join(directory, 'state'), STATIC_ROOT: path.join(directory, 'site') }), clock: () => now,
    techjuiceId: { ready: true, passwordGrant: async () => { providerCalls++; return null; },
      authorizationUrl: ({ state }) => 'https://fixture.supabase.co/auth/v1/authorize?state=' + state } });
  // 실제 HTTP 소켓의 peer만 테스트 안에서 모사한다. 운영 코드는 이 헤더를 읽지 않는다.
  app.server.prependListener('request', req => Object.defineProperty(req.socket, 'remoteAddress', {
    value: req.headers['x-test-peer'] || PROXY, configurable: true
  }));
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + app.server.address().port; app.config.publicOrigin = origin;
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const get = (route, headers = {}) => fetch(origin + route, { headers, redirect: 'manual' });
  const page = await get('/login'), html = await page.text();
  const cookie = page.headers.getSetCookie()[0].split(';')[0], csrf = /name="csrf" value="([A-Za-z0-9_-]+)"/.exec(html)[1];
  async function login(n, { visitor = '198.51.100.1', peer = PROXY, headers = {}, token = csrf, body } = {}) {
    const response = await fetch(origin + '/api/auth/password', { method: 'POST', redirect: 'manual', headers: {
      Origin: origin, Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', 'X-Test-Peer': peer,
      ...(visitor === undefined ? {} : { 'CF-Connecting-IP': visitor }), ...headers
    }, body: body ?? new URLSearchParams({ identifier: 'child' + n + '@example.invalid', password: 'fixture-wrong', csrf: token }) });
    await response.arrayBuffer(); return response.status;
  }
  return { app, get, login, get providerCalls() { return providerCalls; }, advance(ms) { now += ms; } };
}

test('동일한 신뢰 프록시 뒤의 서로 다른 CF 방문자 31명은 비밀번호 한도를 공유하지 않는다', async t => {
  const f = await fixture(t);
  for (let n = 0; n < 31; n++) assert.equal(await f.login(n, { visitor: '198.51.100.' + (n + 1) }), 303);
  assert.equal(f.providerCalls, 31);
});

test('동일 CF 방문자의 31번째 비밀번호 요청은 막되 다른 방문자는 즉시 로그인할 수 있다', async t => {
  const f = await fixture(t);
  for (let n = 0; n < 30; n++) assert.equal(await f.login(n), 303);
  assert.equal(await f.login(30), 429); assert.equal(f.providerCalls, 30);
  assert.equal(await f.login(31, { visitor: '198.51.100.2' }), 303); assert.equal(f.providerCalls, 31);
  f.advance(5 * 60_000); assert.equal(await f.login(32), 303);
});

test('비신뢰 peer의 CF·XFF 위조와 프록시 미설정은 소켓의 기존 한도를 우회하지 못한다', async t => {
  for (const options of [{}, { trusted: '' }]) {
    const f = await fixture(t, options), peer = options.trusted === '' ? PROXY : '172.21.0.2';
    for (let n = 0; n < 30; n++) assert.equal(await f.login(n, { peer, visitor: '198.51.100.' + (n + 1), headers: { 'X-Forwarded-For': '203.0.113.' + (n + 1) } }), 303);
    assert.equal(await f.login(30, { peer, visitor: '198.51.100.99' }), 429); assert.equal(f.providerCalls, 30);
  }
});

test('유효하지 않은 CSRF·과도한 폼은 방문자 한도와 중앙 로그인 호출을 소비하지 않는다', async t => {
  const f = await fixture(t);
  for (let n = 0; n < 40; n++) assert.equal(await f.login(n, { token: 'wrong' }), 403);
  assert.equal(await f.login(40, { body: 'identifier=' + 'a'.repeat(8192) }), 413);
  assert.equal(f.providerCalls, 0);
  for (let n = 0; n < 30; n++) assert.equal(await f.login(n), 303);
  assert.equal(await f.login(30), 429); assert.equal(f.providerCalls, 30);
});

test('계정별 비밀번호 제한은 CF 방문자 주소를 바꿔도 유지한다', async t => {
  const f = await fixture(t);
  for (let n = 0; n < 10; n++) assert.equal(await f.login(0, { visitor: '198.51.100.' + (n + 1) }), 303);
  assert.equal(await f.login(0, { visitor: '198.51.100.99' }), 429); assert.equal(f.providerCalls, 10);
  assert.equal(await f.login(1, { visitor: '198.51.100.99' }), 303);
});

test('잘못된 폼의 전체 입력은 분당 300회에서 제한하고 다음 분에는 다시 받는다', async t => {
  const f = await fixture(t);
  for (let n = 0; n < 300; n++) assert.equal(await f.login(n, { token: 'wrong', visitor: '198.51.100.' + (n % 250 + 1) }), 403);
  assert.equal(await f.login(301), 429); assert.equal(f.providerCalls, 0);
  f.advance(60000); assert.equal(await f.login(302), 303); assert.equal(f.providerCalls, 1);
});

test('Google 시작도 신뢰 프록시의 방문자별 한도를 적용하며 XFF만으로 분리하지 않는다', async t => {
  const f = await fixture(t, { google: true });
  for (let n = 0; n < 11; n++) {
    const response = await f.get('/api/auth/login', { 'CF-Connecting-IP': '198.51.100.' + (n + 1) });
    assert.equal(response.status, 303); await response.arrayBuffer();
  }
  for (let n = 0; n < 10; n++) {
    const response = await f.get('/api/auth/login', { 'X-Forwarded-For': '203.0.113.' + (n + 1) });
    assert.equal(response.status, 303); await response.arrayBuffer();
  }
  const limited = await f.get('/api/auth/login', { 'X-Forwarded-For': '203.0.113.99' });
  assert.equal(limited.status, 429); await limited.arrayBuffer();
});
