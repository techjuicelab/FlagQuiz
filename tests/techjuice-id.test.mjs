import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { createTechJuiceId, TechJuiceIdError } from '../server/lib/techjuice-id.mjs';

const URL_BASE = 'https://project.supabase.co';
const NOW = Date.UTC(2026, 9, 3, 12);
const SUB = 'ab198ece-319e-4a28-b66c-b7ce28c8b4c8';
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keyFor = alg => alg === 'ES256' ? ec : rsa;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const jwk = (alg = 'ES256', kid = 'central-key') => ({ ...keyFor(alg).publicKey.export({ format: 'jwk' }), kid, alg, use: 'sig', key_ops: ['verify'] });
function claims(overrides = {}) {
  return { iss: URL_BASE + '/auth/v1', aud: 'authenticated', exp: Math.floor(NOW / 1000) + 3600,
    iat: Math.floor(NOW / 1000), sub: SUB, role: 'authenticated', is_anonymous: false,
    email: 'kid1@users.techjuicelab.space', tj: { disabled: false, superadmin: false, roles: { flagquiz: 'user' } }, ...overrides };
}
function token(payload = claims(), header = {}, pair) {
  const alg = header.alg || 'ES256';
  const h = Buffer.from(JSON.stringify({ alg, kid: 'central-key', typ: 'JWT', ...header })).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const key = (pair || keyFor(alg)).privateKey;
  const signature = sign('sha256', Buffer.from(h + '.' + p), alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key);
  return h + '.' + p + '.' + signature.toString('base64url');
}
function client(fetchImpl, options = {}) {
  const { stateResponse = () => json([{ gen: 1, disabled: false }]), ...config } = options;
  return createTechJuiceId({ supabaseUrl: URL_BASE, anonKey: 'test-anon-key',
    fetchImpl: (url, request) => url.endsWith('/tj_session_state') ? stateResponse(url, request) : fetchImpl(url, request), clock: () => NOW, ...config });
}
function onlyKeys(alg = 'ES256') { return async () => json({ keys: [jwk(alg)] }); }
function code(expected) { return error => error instanceof TechJuiceIdError && error.code === expected; }

test('아이디 비밀번호 로그인은 중앙 ES256 서명을 검증해 UUID·서명 이메일·FlagQuiz 역할만 반환한다', async () => {
  const calls = [];
  const auth = client(async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('jwks.json') ? json({ keys: [jwk()] }) : json({ access_token: token(), refresh_token: 'private-refresh', user: { email: 'attacker@example.com' } });
  });
  assert.equal(auth.ready, true);
  assert.deepEqual(await auth.passwordGrant('  Kid1  ', 'private-password'), {
    sub: SUB, email: 'kid1@users.techjuicelab.space', emailVerified: true, techjuiceRole: 'user', superadmin: false,
    generation: 1, expiresAt: NOW + 3600_000
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, URL_BASE + '/auth/v1/token?grant_type=password');
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'kid1@users.techjuicelab.space', password: 'private-password' });
  assert.equal(calls[0].options.headers.apikey, 'test-anon-key');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[1].url, URL_BASE + '/auth/v1/.well-known/jwks.json');
});

test('중앙 실이메일 계정도 아이디로 로그인하며 합성 이메일 실패 때에만 RPC로 해석한다', async () => {
  const calls = [];
  const auth = client(async (url, options) => {
    calls.push({ url, body: options.body && JSON.parse(options.body) });
    if (url.endsWith('jwks.json')) return json({ keys: [jwk('RS256')] });
    if (url.endsWith('email_for_username')) return json('TJ@Gmail.com');
    if (JSON.parse(options.body).email.endsWith('@users.techjuicelab.space')) return json({}, 400);
    return json({ access_token: token(claims({ email: 'tj@gmail.com', tj: { disabled: false, superadmin: true, roles: {} } }), { alg: 'RS256' }) });
  });
  assert.deepEqual(await auth.passwordGrant('  TJ  ', 'private-password'), {
    sub: SUB, email: 'tj@gmail.com', emailVerified: true, techjuiceRole: 'admin', superadmin: true,
    generation: 1, expiresAt: NOW + 3600_000
  });
  assert.deepEqual(calls.map(x => x.url), [URL_BASE + '/auth/v1/token?grant_type=password', URL_BASE + '/rest/v1/rpc/email_for_username',
    URL_BASE + '/auth/v1/token?grant_type=password', URL_BASE + '/auth/v1/.well-known/jwks.json']);
  assert.deepEqual(calls[1].body, { p_username: 'tj' });
  assert.equal(calls[2].body.email, 'tj@gmail.com');
});

test('이메일 직접 입력 실패·중앙 장애·권한 거절에는 아이디 해석이나 토큰 자동 재요청을 하지 않는다', async () => {
  for (const [identifier, response] of [
    ['kid@example.com', () => json({}, 400)], ['kid1', () => json({}, 500)],
    ['kid1', () => json({ access_token: token(claims({ tj: { disabled: false, superadmin: false, roles: {} } })) })]
  ]) {
    const calls = [];
    const auth = client(async (url) => { calls.push(url); return url.endsWith('jwks.json') ? json({ keys: [jwk()] }) : response(); });
    assert.equal(await auth.passwordGrant(identifier, 'password'), null);
    assert.equal(calls.filter(url => url.includes('/token?')).length, 1);
    assert.equal(calls.filter(url => url.includes('/rpc/')).length, 0);
  }
});

test('RPC의 빈 응답·잘못된 메일·같은 합성 메일은 두 번째 비밀번호 요청을 만들지 않는다', async () => {
  for (const resolved of [null, '', 'not-email', 'kid1@users.techjuicelab.space', { email: 'kid@example.com' }]) {
    const calls = [];
    const auth = client(async url => { calls.push(url); return url.includes('/token?') ? json({}, 400) : json(resolved); });
    assert.equal(await auth.passwordGrant('kid1', 'password'), null);
    assert.equal(calls.length, 2);
  }
});

test('HTTP·경로·미해결 1Password·관리용 키·잘못된 앱 설정은 준비 상태를 끄고 외부 호출하지 않는다', async () => {
  const managed = 'e30.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.stub';
  const configs = [{ supabaseUrl: 'http://project.supabase.co' }, { supabaseUrl: URL_BASE + '/other' },
    { supabaseUrl: URL_BASE + '?key=private' }, { supabaseUrl: 'https://user:password@project.supabase.co' },
    { supabaseUrl: 'op://Private/TechJuice ID/supabase_url' }, { anonKey: '' }, { anonKey: 'op://Private/TechJuice ID/anon_key' },
    { anonKey: '  "op://Private/TechJuice ID/anon_key"  ' }, { anonKey: 'sb_secret_private' }, { anonKey: managed }, { appSlug: '../other' }];
  let calls = 0;
  for (const options of configs) {
    const auth = client(async () => { calls++; return json({}); }, options);
    assert.equal(auth.ready, false);
    assert.equal(await auth.passwordGrant('kid1', 'password'), null);
  }
  assert.equal(calls, 0);
});

test('빈 값·과도한 비밀번호·잘못된 아이디는 중앙에 전달하지 않는다', async () => {
  let calls = 0;
  const auth = client(async () => { calls++; return json({}); });
  for (const [identifier, password] of [['', 'password'], ['../kid', 'password'], ['kid1', ''], ['kid1', 'x'.repeat(1025)], [null, 'password'], ['a@b', 'password']]) {
    assert.equal(await auth.passwordGrant(identifier, password), null);
  }
  assert.equal(calls, 0);
});

test('ES256·RS256 실제 서명과 서명된 앱별 admin·tester·user 역할은 모두 지원한다', async () => {
  for (const alg of ['ES256', 'RS256']) for (const role of ['admin', 'tester', 'user']) {
    const auth = client(onlyKeys(alg));
    const identity = await auth.verifyAccessToken(token(claims({ tj: { disabled: false, superadmin: false, roles: { flagquiz: role } } }), { alg }));
    assert.equal(identity.techjuiceRole, role);
    assert.equal(identity.superadmin, false);
  }
});

test('다른 프로젝트 issuer·audience·만료·미래 nbf·잘못된 sub·익명·service role 토큰을 거부한다', async () => {
  const cases = [
    [{ iss: 'https://other.supabase.co/auth/v1' }, 'invalid-issuer'], [{ aud: 'other-app' }, 'invalid-audience'],
    [{ exp: NOW / 1000 }, 'expired-token'], [{ exp: '9999999999' }, 'expired-token'], [{ nbf: NOW / 1000 + 1 }, 'expired-token'],
    [{ iat: NOW / 1000 + 61 }, 'expired-token'], [{ sub: 'google-id' }, 'invalid-subject'], [{ role: 'service_role' }, 'invalid-role'],
    [{ is_anonymous: true }, 'invalid-role'], [{ is_anonymous: undefined }, 'invalid-role'], [{ is_anonymous: 'false' }, 'invalid-role']
  ];
  const auth = client(onlyKeys());
  for (const [overrides, expected] of cases) await assert.rejects(auth.verifyAccessToken(token(claims(overrides))), code(expected));
});

test('중앙 세션 세대는 매번 새로 읽고 문자열·누락·빈 행·장애를 승인 상태로 바꾸지 않는다', async () => {
  const calls = [];
  let gen = 1;
  const auth = client(onlyKeys(), { stateResponse: (url, options) => { calls.push({ url, options }); return json([{ gen: gen++, disabled: false }]); } });
  assert.deepEqual(await auth.sessionState(SUB), { gen: 1, disabled: false });
  assert.deepEqual(await auth.sessionState(SUB), { gen: 2, disabled: false });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, URL_BASE + '/rest/v1/rpc/tj_session_state');
  assert.deepEqual(JSON.parse(calls[0].options.body), { p_sub: SUB });
  assert.equal(calls[0].options.headers.apikey, 'test-anon-key');
  for (const rows of [[], null, [{ gen: '1', disabled: false }], [{ gen: 1, disabled: 'false' }], [{ gen: 1 }],
    [{ gen: 0, disabled: false }], [{ gen: -1, disabled: false }], [{ gen: 1.5, disabled: false }],
    [{ gen: 2147483648, disabled: false }], [{ gen: 1, disabled: false }, { gen: 2, disabled: false }]]) {
    const bad = client(onlyKeys(), { stateResponse: () => json(rows) });
    assert.equal(await bad.sessionState(SUB), null);
    assert.equal(await bad.passwordGrant('kid@example.com', 'password'), null);
    await assert.rejects(bad.verifyAccessToken(token()), code('access-denied'));
  }
  const unavailable = client(onlyKeys(), { stateResponse: () => json({}, 503) });
  assert.equal(await unavailable.sessionState(SUB), null);
  assert.equal(await auth.sessionState('not-a-uuid'), null);
});

test('JWT가 유효해도 중앙 disabled 계정·확인 불가·조회 중 만료는 새 로그인 세션을 발급하지 않는다', async () => {
  for (const state of [json([{ gen: 2, disabled: true }]), json([], 200)]) {
    const auth = client(onlyKeys(), { stateResponse: () => state });
    await assert.rejects(auth.verifyAccessToken(token()), code('access-denied'));
  }
  let now = NOW;
  const expiring = client(onlyKeys(), { clock: () => now, stateResponse: () => { now += 3600_000; return json([{ gen: 1, disabled: false }]); } });
  await assert.rejects(expiring.verifyAccessToken(token()), code('expired-token'));
});

test('아이디 해석은 중앙 등록 이메일만 반환하고 직접 이메일에는 불필요한 RPC를 호출하지 않는다', async () => {
  const calls = [];
  const auth = client(async (url, options) => { calls.push({ url, options }); return json('Kid.Real@Example.com'); });
  assert.equal(await auth.resolveIdentifier(' KID1 '), 'kid.real@example.com');
  assert.equal(calls[0].url, URL_BASE + '/rest/v1/rpc/email_for_username');
  assert.deepEqual(JSON.parse(calls[0].options.body), { p_username: 'kid1' });
  assert.equal(await auth.resolveIdentifier(' Parent@Example.com '), 'parent@example.com');
  assert.equal(await auth.resolveIdentifier('../other'), null);
  assert.equal(calls.length, 1);
});

test('Google 시작 URL은 중앙 Supabase·고정 provider·s256·콜백 state를 사용하고 verifier·키를 노출하지 않는다', () => {
  const auth = client(onlyKeys());
  const verifier = 'a'.repeat(64), state = 's'.repeat(32);
  const url = new URL(auth.authorizationUrl({ redirectUri: 'https://flagquiz.techjuicelab.space/auth/callback?keep=1', state, verifier }));
  assert.equal(url.origin, URL_BASE);
  assert.equal(url.pathname, '/auth/v1/authorize');
  assert.equal(url.searchParams.get('provider'), 'google');
  assert.equal(url.searchParams.get('code_challenge_method'), 's256');
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'));
  const callback = new URL(url.searchParams.get('redirect_to'));
  assert.equal(callback.origin, 'https://flagquiz.techjuicelab.space');
  assert.equal(callback.searchParams.get('state'), state);
  assert.equal(callback.searchParams.get('keep'), '1');
  assert.equal(url.searchParams.has('state'), false);
  assert.doesNotMatch(url.href, /test-anon-key|a{64}/);
  assert.ok(auth.authorizationUrl({ redirectUri: 'http://localhost:8090/auth/callback', state, verifier }));
  for (const redirectUri of ['http://public.example/auth/callback', 'https://user:password@flagquiz.example/auth/callback', 'https://flagquiz.example/auth/callback#fragment']) {
    assert.throws(() => auth.authorizationUrl({ redirectUri, state, verifier }), code('invalid-redirect'));
  }
  assert.throws(() => auth.authorizationUrl({ redirectUri: callback.href, state: 'short', verifier }), code('invalid-oauth-state'));
  assert.throws(() => auth.authorizationUrl({ redirectUri: callback.href, state, verifier: 'short' }), code('invalid-oauth-state'));
});

test('Google PKCE 교환은 코드·verifier를 한 번 보내고 중앙 JWT·권한·세대 검증 후 같은 identity를 반환한다', async () => {
  const calls = [];
  const auth = client(async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('jwks.json') ? json({ keys: [jwk()] }) : json({ access_token: token(), refresh_token: 'private-refresh' });
  }, { stateResponse: () => json([{ gen: 4, disabled: false }]) });
  const identity = await auth.exchangeCode({ code: 'auth-code', verifier: 'a'.repeat(64) });
  assert.deepEqual(identity, { sub: SUB, email: 'kid1@users.techjuicelab.space', emailVerified: true,
    techjuiceRole: 'user', superadmin: false, generation: 4, expiresAt: NOW + 3600_000 });
  assert.equal(calls[0].url, URL_BASE + '/auth/v1/token?grant_type=pkce');
  assert.deepEqual(JSON.parse(calls[0].options.body), { auth_code: 'auth-code', code_verifier: 'a'.repeat(64) });
  assert.equal(calls.filter(x => x.url.includes('/token?')).length, 1);
  for (const args of [{ code: '', verifier: 'a'.repeat(64) }, { code: 'auth-code', verifier: 'short' }, { code: 'code\ninvalid', verifier: 'a'.repeat(64) }]) {
    assert.equal(await auth.exchangeCode(args), null);
  }
  assert.equal(calls.length, 2);
  let failedCalls = 0;
  const failed = client(async () => { failedCalls++; return json({ error: 'private detail' }, 400); });
  assert.equal(await failed.exchangeCode({ code: 'auth-code', verifier: 'a'.repeat(64) }), null);
  assert.equal(failedCalls, 1);
});

test('user_metadata의 관리자·역할·이메일 위조는 무시하고 tj 누락·disabled·다른 앱 권한은 거부한다', async () => {
  const auth = client(onlyKeys());
  for (const tj of [undefined, {}, { disabled: true, superadmin: true, roles: { flagquiz: 'admin' } },
    { disabled: false, superadmin: false, roles: { 'kids-admin': 'admin' } },
    { disabled: false, superadmin: false, roles: { flagquiz: 'superadmin' } },
    { disabled: false, superadmin: false, roles: [] }]) {
    await assert.rejects(auth.verifyAccessToken(token(claims({ tj, user_metadata: { superadmin: true, disabled: false, roles: { flagquiz: 'admin' } } }))), code('access-denied'));
  }
  const identity = await auth.verifyAccessToken(token(claims({ user_metadata: { superadmin: true, email: 'attacker@example.com', roles: { flagquiz: 'admin' } } })));
  assert.equal(identity.techjuiceRole, 'user');
  assert.equal(identity.superadmin, false);
  assert.equal(identity.email, 'kid1@users.techjuicelab.space');
});

test('허용하지 않은 alg·외부 키 URL·crit·과도한 토큰은 JWKS 조회 전에 거부한다', async () => {
  let calls = 0;
  const auth = client(async () => { calls++; return json({ keys: [jwk()] }); });
  for (const header of [{ alg: 'none' }, { alg: 'HS256' }, { jku: 'https://attacker.example/keys' }, { jwk: jwk() }, { x5u: 'https://attacker.example/key' }, { crit: [] }]) {
    const h = Buffer.from(JSON.stringify({ kid: 'central-key', alg: 'ES256', ...header })).toString('base64url');
    await assert.rejects(auth.verifyAccessToken(h + '.' + token().split('.')[1] + '.c2ln'), code('invalid-token'));
  }
  await assert.rejects(auth.verifyAccessToken('x'.repeat(16385)), code('invalid-token'));
  assert.equal(calls, 0);
});

test('서명 위조·작은 RSA 키·용도가 다른 공개키를 거부한다', async () => {
  const signed = token();
  const parts = signed.split('.');
  const auth = client(onlyKeys());
  parts[1] = Buffer.from(JSON.stringify(claims({ tj: { disabled: false, superadmin: true, roles: {} } }))).toString('base64url');
  await assert.rejects(auth.verifyAccessToken(parts.join('.')), code('invalid-signature'));
  const small = generateKeyPairSync('rsa', { modulusLength: 1024 });
  const smallAuth = client(async () => json({ keys: [{ ...small.publicKey.export({ format: 'jwk' }), kid: 'central-key', alg: 'RS256' }] }));
  await assert.rejects(smallAuth.verifyAccessToken(token(claims(), { alg: 'RS256' }, small)), code('invalid-signature'));
  const encrypt = client(async () => json({ keys: [{ ...jwk(), use: 'enc' }] }));
  await assert.rejects(encrypt.verifyAccessToken(token()), code('identity-unavailable'));
});

test('JWKS 캐시·동시 조회 병합·새 kid 키 회전은 중앙 검증을 유지한다', async () => {
  let calls = 0;
  const auth = client(async () => { calls++; return json({ keys: [jwk('ES256', calls === 1 ? 'central-key' : 'rotated-key')] }); });
  await Promise.all([auth.verifyAccessToken(token()), auth.verifyAccessToken(token())]);
  assert.equal(calls, 1);
  assert.equal((await auth.verifyAccessToken(token(claims(), { kid: 'rotated-key' }))).sub, SUB);
  assert.equal(calls, 2);
  await assert.rejects(auth.verifyAccessToken(token(claims(), { kid: 'unknown-a' })), code('invalid-signature'));
  await assert.rejects(auth.verifyAccessToken(token(claims(), { kid: 'unknown-b' })), code('invalid-signature'));
  assert.equal(calls, 2);
});

test('중앙 오류·잘못된 JSON·너무 큰 응답·네트워크 오류는 비밀번호와 원문을 노출하지 않는다', async () => {
  for (const response of [
    () => json({ error: 'private-password test-anon-key private-refresh' }, 500),
    () => new Response('private-password malformed'),
    () => json({ junk: 'x'.repeat(65536) }),
    () => { throw new Error('private-password test-anon-key raw request'); }
  ]) {
    const auth = client(async () => response());
    assert.equal(await auth.passwordGrant('kid@example.com', 'private-password'), null);
    await assert.rejects(auth.verifyAccessToken(token()), error => {
      assert.ok(error instanceof TechJuiceIdError);
      assert.doesNotMatch(error.message, /private-password|test-anon-key|private-refresh|raw request|malformed/);
      return true;
    });
  }
});

test('중앙 요청은 시간 제한으로 취소하고 응답 토큰·refresh를 로그인 결과에 넣지 않는다', async () => {
  let aborted = false;
  const auth = client(async (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => { aborted = true; reject(new Error('private-password aborted')); }, { once: true });
  }), { timeoutMs: 5 });
  // AbortSignal.timeout은 unref 타이머여서 테스트의 대기만 별도로 유지한다.
  const keepAlive = setTimeout(() => {}, 100);
  try { assert.equal(await auth.passwordGrant('kid@example.com', 'private-password'), null); }
  finally { clearTimeout(keepAlive); }
  assert.equal(aborted, true);
});
