/* 설치 메타·아이콘은 실제 HTTP로 검사하고 중앙 인증과 유료 공급자는 호출하지 않는다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createAuthServer, readConfig } from '../server/auth-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_FILES = new Map([
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json']],
  ['/assets/icon-180.png', ['assets/icon-180.png', 'image/png']],
  ['/assets/icon-192.png', ['assets/icon-192.png', 'image/png']],
  ['/assets/icon-512.png', ['assets/icon-512.png', 'image/png']],
  ['/assets/icon-maskable-512.png', ['assets/icon-maskable-512.png', 'image/png']],
  ['/assets/icon.svg', ['assets/icon.svg', 'image/svg+xml']],
  ['/assets/favicon.svg', ['assets/favicon.svg', 'image/svg+xml']],
  ['/apple-touch-icon.png', ['assets/icon-180.png', 'image/png']],
  ['/apple-touch-icon-precomposed.png', ['assets/icon-180.png', 'image/png']]
]);

async function fixture(t, kind = 'techjuice-id', { linkedRoot = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'flagquiz-install-http-'));
  const staticRoot = path.join(directory, 'site'), stateDirectory = path.join(directory, 'state');
  const calls = [], expected = new Map();
  let app;
  t.after(async () => {
    try { await app?.close(); }
    finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
  await fs.mkdir(path.join(staticRoot, 'assets'), { recursive: true });
  await fs.mkdir(path.join(staticRoot, 'js'));
  await fs.mkdir(path.join(staticRoot, 'audio'));
  for (const [relative] of PUBLIC_FILES.values()) {
    if (expected.has(relative)) continue;
    const bytes = await fs.readFile(path.join(ROOT, relative));
    expected.set(relative, bytes);
    await fs.writeFile(path.join(staticRoot, relative), bytes);
  }
  for (const [relative, bytes] of [
    ['index.html', 'protected quiz'], ['js/app.js', 'protected script'],
    ['audio/private.mp3', 'protected audio'], ['assets/country.png', 'protected picture'],
    ['assets/icon-180.png.bak', 'protected adjacent file']
  ]) await fs.writeFile(path.join(staticRoot, relative), bytes);
  const outside = path.join(directory, 'outside.json');
  await fs.writeFile(outside, 'outside-private-state');
  const configuredStaticRoot = linkedRoot ? path.join(directory, 'site-link') : staticRoot;
  if (linkedRoot) await fs.symlink(staticRoot, configuredStaticRoot, 'dir');
  const forbidden = name => async () => { calls.push(name); throw new Error('Unexpected isolated provider call: ' + name); };
  const techjuiceId = { ready: true, passwordGrant: forbidden('password'), sessionState: forbidden('central-state'),
    authorizationUrl: forbidden('authorization-url'), exchangeCode: forbidden('exchange'), resolveIdentifier: forbidden('identifier') };
  const oidc = { authorizationUrl: forbidden('google-authorization'), exchangeCode: forbidden('google-exchange') };
  const config = readConfig({
    AUTH_PROVIDER: kind === 'google' ? 'google' : 'techjuice-id', PUBLIC_ORIGIN: 'http://127.0.0.1',
    GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fixture-google-secret',
    TJID_SUPABASE_URL: 'https://fixture.supabase.co', TJID_SUPABASE_ANON_KEY: kind === 'unconfigured' ? '' : 'fixture-public-anon',
    SESSION_SECRET: 'fixture-signing-key-never-real-'.repeat(3), STATE_DIR: stateDirectory, STATIC_ROOT: configuredStaticRoot,
    GROQ_API_KEY: 'fixture-groq-key-never-real'
  });
  app = await createAuthServer({ config, techjuiceId, oidc,
    fetchImpl: forbidden('fetch'), clock: () => Date.UTC(2026, 9, 4, 12),
    speechModule: { readSpeechInput: forbidden('speech-input'), createTranscriber: forbidden('paid-speech') } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;
  app.config.publicOrigin = 'http://127.0.0.1:' + port;
  // fetch/URL의 경로 정규화를 거치지 않아 서버에 실제 encoded request-target을 보낸다.
  function request(route, { method = 'GET', headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      });
      req.on('error', reject); req.end();
    });
  }
  const snapshot = () => fs.readFile(path.join(stateDirectory, 'access.json'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return null; throw error;
  });
  return { app, staticRoot, stateDirectory, outside, calls, expected, request, snapshot };
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map(match => [match[1].toLowerCase(), match[2]]));
}

for (const kind of ['google', 'techjuice-id', 'unconfigured']) {
  test('로그인 공통 head는 절대 아이콘·manifest·앱 제목을 제공한다: ' + kind, async t => {
    const f = await fixture(t, kind), response = await f.request('/login');
    assert.equal(response.status, 200);
    const html = response.body.toString('utf8'), head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1];
    assert.ok(head, '설치 메타는 명시적인 head 안에 있어야 한다');
    const links = [...head.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0]));
    assert.ok(links.some(link => link.rel === 'manifest' && link.href === '/manifest.webmanifest'));
    assert.ok(links.some(link => link.rel === 'icon' && link.href === '/assets/favicon.svg' && link.type === 'image/svg+xml'));
    assert.ok(links.some(link => link.rel === 'apple-touch-icon' && link.href === '/assets/icon-180.png' && link.sizes === '180x180'));
    const meta = [...head.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
    assert.ok(meta.some(value => value.name === 'apple-mobile-web-app-title' && value.content === '국기 퀴즈'));
    assert.match(response.headers['content-security-policy'], /img-src 'self' data:/);
    assert.match(response.headers['cache-control'], /no-store/);
    assert.equal(f.calls.length, 0);
  });

  test('허용된 설치 파일과 루트 별칭만 인증 없이 GET·HEAD 원문을 제공한다: ' + kind, async t => {
    const f = await fixture(t, kind), before = await f.snapshot();
    for (const [route, [relative, mime]] of PUBLIC_FILES) {
      const expected = f.expected.get(relative);
      for (const method of ['GET', 'HEAD']) {
        const response = await f.request(route, { method });
        assert.equal(response.status, 200, method + ' ' + route);
        assert.equal(response.headers['content-type'].split(';')[0], mime, route);
        assert.equal(Number(response.headers['content-length']), expected.length, route);
        assert.match(response.headers['cache-control'], /no-store/, route);
        assert.equal(response.headers['x-content-type-options'], 'nosniff', route);
        assert.equal(response.headers['set-cookie'], undefined, route);
        assert.deepEqual(response.body, method === 'HEAD' ? Buffer.alloc(0) : expected, method + ' ' + route);
      }
    }
    assert.equal(await f.snapshot(), before, '공개 아이콘 조회는 인증·사용량 저장을 바꾸지 않는다');
    assert.equal(f.calls.length, 0);
  });
}

test('공개 설치 파일 추가 뒤에도 앱·음원·인접 자산·인증 API·상태 파일은 닫혀 있다', async t => {
  const f = await fixture(t);
  for (const route of ['/', '/index.html']) {
    const response = await f.request(route);
    assert.equal(response.status, 303, route); assert.equal(response.headers.location, '/login');
  }
  for (const route of ['/js/app.js', '/audio/private.mp3', '/assets/country.png', '/assets/icon-180.png.bak',
    '/assets/', '/state/access.json', '/access.json', '/server/auth-server.mjs', '/.env', '/api/admin/allowlist']) {
    const response = await f.request(route);
    assert.equal(response.status, 401, route);
    assert.deepEqual(JSON.parse(response.body), { error: 'login-required' }, route);
  }
  const speech = await f.request('/api/speech', { method: 'POST' });
  assert.equal(speech.status, 401);
  assert.equal(f.calls.length, 0, '인증 전에는 중앙 인증과 유료 입력 파서도 호출하지 않는다');
});

test('encoded 이름·경로 탈출은 정확한 공개 설치 allowlist를 우회하지 못한다', async t => {
  const f = await fixture(t);
  for (const route of ['/%6danifest.webmanifest', '/assets/%69con-180.png', '/assets/icon%2d180.png',
    '/%61pple-touch-icon.png', '/assets%2ficon-180.png', '/assets/icon-180.png%00',
    '/assets/icon-180.png/extra', '/assets/%2e%2e/manifest.webmanifest', '/%2e%2e/manifest.webmanifest',
    '/assets/%2e%2e/state/access.json', '/assets/%2f..%2foutside.json']) {
    assert.equal((await f.request(route)).status, 401, route);
  }
  assert.equal(f.calls.length, 0);
});

test('잘못된 로그인 쿠키로도 설치 파일만 열리고 앱 세션은 열리지 않는다', async t => {
  const f = await fixture(t);
  const headers = { Cookie: 'flagquiz_session=forged; flagquiz_login=forged', 'X-User-Email': 'forged@example.invalid', Authorization: 'Bearer forged' };
  const icon = await f.request('/apple-touch-icon.png', { headers });
  assert.equal(icon.status, 200); assert.deepEqual(icon.body, f.expected.get('assets/icon-180.png'));
  assert.equal(icon.headers['set-cookie'], undefined);
  assert.equal((await f.request('/js/app.js', { headers })).status, 401);
  const session = await f.request('/api/auth/session', { headers });
  assert.deepEqual(JSON.parse(session.body), { authenticated: false, configured: true });
  assert.equal(f.calls.length, 0);
});

test('공개 설치 경로는 GET·HEAD 이외 method를 405로 거절한다', async t => {
  const f = await fixture(t);
  for (const route of PUBLIC_FILES.keys()) for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await f.request(route, { method });
    assert.equal(response.status, 405, method + ' ' + route);
    assert.equal(response.headers['set-cookie'], undefined);
  }
  assert.equal(f.calls.length, 0);
});

test('허용된 이름이어도 웹 루트 밖 symlink와 누락된 파일은 404로 닫힌다', async t => {
  const f = await fixture(t);
  for (const relative of ['manifest.webmanifest', 'assets/icon-180.png', 'assets/favicon.svg']) {
    await fs.unlink(path.join(f.staticRoot, relative));
    await fs.symlink(f.outside, path.join(f.staticRoot, relative));
  }
  for (const route of ['/manifest.webmanifest', '/assets/icon-180.png', '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png', '/assets/favicon.svg']) for (const method of ['GET', 'HEAD']) {
    const response = await f.request(route, { method });
    assert.equal(response.status, 404, method + ' ' + route);
    assert.ok(!response.body.includes('outside-private-state'));
  }
  await fs.unlink(path.join(f.staticRoot, 'assets/icon-192.png'));
  assert.equal((await f.request('/assets/icon-192.png')).status, 404);
  assert.equal(f.calls.length, 0);
});

test('허용된 아이콘에서 웹 루트 안의 비공개 앱 파일로 향한 symlink도 거절한다', async t => {
  const f = await fixture(t);
  await fs.unlink(path.join(f.staticRoot, 'assets/icon-180.png'));
  await fs.symlink(path.join(f.staticRoot, 'js/app.js'), path.join(f.staticRoot, 'assets/icon-180.png'));
  for (const route of ['/assets/icon-180.png', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await f.request(route, { method });
      assert.equal(response.status, 404, method + ' ' + route);
      assert.ok(!response.body.includes('protected script'));
    }
  }
  assert.equal((await f.request('/assets/icon-192.png')).status, 200);
  assert.equal((await f.request('/js/app.js')).status, 401);
  assert.equal(f.calls.length, 0);
});

test('STATIC_ROOT 자체가 합법적인 디렉터리 symlink면 정확한 설치 파일은 제공한다', async t => {
  const f = await fixture(t, 'techjuice-id', { linkedRoot: true });
  assert.notEqual(f.app.config.staticRoot, f.staticRoot);
  for (const [route, [relative]] of PUBLIC_FILES) for (const method of ['GET', 'HEAD']) {
    const response = await f.request(route, { method });
    assert.equal(response.status, 200, method + ' ' + route);
    assert.deepEqual(response.body, method === 'HEAD' ? Buffer.alloc(0) : f.expected.get(relative));
  }
  assert.equal((await f.request('/js/app.js')).status, 401);
  assert.equal(f.calls.length, 0);
});
