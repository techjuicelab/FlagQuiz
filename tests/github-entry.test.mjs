import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildGithubEntry, NAS_URL } from '../scripts/build-github-entry.mjs';

const BASE = 'https://techjuicelab.github.io/FlagQuiz/';
const run = promisify(execFile);
const tick = () => new Promise(resolve => setImmediate(resolve));
async function fixture(t, repository = 'techjuicelab/FlagQuiz') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'flagquiz-github-entry-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const outputDirectory = path.join(directory, '_site');
  await buildGithubEntry({ outputDirectory, repository });
  return { directory, outputDirectory, read: name => fs.readFile(path.join(outputDirectory, name), 'utf8') };
}

function page(source, { online = true, cacheFailure = false, stuckWorker = false, serviceWorker = true, cacheStorage = true } = {}) {
  const events = {}, redirects = [], registered = [], deleted = [], timers = new Map();
  const names = ['flagquiz-v4', 'flagquiz-shell-old', 'another-app-v1', 'flagquiz'];
  const status = { textContent: '' }; let updates = 0, sequence = 0;
  const context = {
    URL, Promise,
    location: { origin: new URL(BASE).origin, replace: url => redirects.push(url) },
    document: { getElementById: () => status },
    navigator: { onLine: online, serviceWorker: { register: async (url, options) => {
      registered.push({ url, options });
      if (stuckWorker) return new Promise(() => {});
      return { update: async () => { updates++; } };
    } } },
    caches: { keys: async () => { if (cacheFailure) throw new Error('storage disabled'); return names; }, delete: async name => { deleted.push(name); return true; } },
    setTimeout: fn => { timers.set(++sequence, fn); return sequence; },
    clearTimeout: id => timers.delete(id),
    localStorage: new Proxy({}, { get() { throw new Error('학습 기록은 변경하면 안 됩니다.'); } })
  };
  if (!serviceWorker) delete context.navigator.serviceWorker;
  if (!cacheStorage) delete context.caches;
  context.window = context; context.addEventListener = (name, fn) => { events[name] = fn; };
  vm.runInNewContext(source, context);
  return { context, events, redirects, registered, deleted, status, timers, get updates() { return updates; } };
}

function worker(source, { scope = BASE, clientEntries } = {}) {
  const events = {}, deleted = [], navigated = []; let claimed = 0, skipped = 0;
  const clients = clientEntries || [BASE, BASE + 'index.html', 'https://techjuicelab.github.io/another-app/', 'https://techjuicelab.github.io/FlagQuiz-other/', 'https://example.com/FlagQuiz/']
    .map((url, index) => ({ url, controlled: true, closed: index === 0 }));
  const context = { URL, Response, Promise,
    caches: { keys: async () => ['flagquiz-v4', 'flagquiz-flags-v1', 'unrelated-cache', 'flagquiz'], delete: async name => { deleted.push(name); return true; },
      match() { throw new Error('이전 앱 캐시를 읽으면 안 됩니다.'); }, open() { throw new Error('앱 캐시를 새로 만들면 안 됩니다.'); } },
    self: { registration: { scope }, addEventListener: (name, fn) => { events[name] = fn; },
      skipWaiting: async () => { skipped++; }, clients: {
        claim: async () => { claimed++; }, matchAll: async options => {
          assert.equal(options.type, 'window');
          return clients.filter(client => options.includeUncontrolled || client.controlled)
            .map(({ url, closed }) => ({ url, navigate: async target => { navigated.push({ url, target }); if (closed) throw new Error('닫힌 창'); } }));
        }
      }
    }
  };
  vm.runInNewContext(source, context);
  async function lifecycle(name) {
    const pending = []; events[name]({ waitUntil: promise => pending.push(promise) }); await Promise.all(pending);
  }
  async function fetch(url, mode = 'cors', method = 'GET') {
    let pending; events.fetch({ request: { url, mode, method }, respondWith: promise => { pending = promise; } });
    return pending ? await pending : null;
  }
  return { deleted, navigated, lifecycle, fetch, get claimed() { return claimed; }, get skipped() { return skipped; } };
}

test('Pages 빌드는 이전 앱·음원을 제거하고 진입 파일만 만들며 원본은 보존한다', async t => {
  const f = await fixture(t), original = path.join(f.directory, 'original-app.js');
  await fs.writeFile(original, 'original source');
  await fs.mkdir(path.join(f.outputDirectory, 'audio'), { recursive: true });
  await fs.writeFile(path.join(f.outputDirectory, 'audio', 'old.mp3'), 'private audio');
  await fs.mkdir(path.join(f.outputDirectory, 'js')); await fs.writeFile(path.join(f.outputDirectory, 'js', 'app.js'), 'public game');
  await buildGithubEntry({ outputDirectory: f.outputDirectory, repository: 'techjuicelab/FlagQuiz' });
  assert.deepEqual((await fs.readdir(f.outputDirectory)).sort(), ['404.html', 'entry.js', 'index.html', 'sw.js']);
  assert.equal(await fs.readFile(original, 'utf8'), 'original source');
  const html = await f.read('index.html'); assert.equal(await f.read('404.html'), html);
  assert.match(html, /href="https:\/\/flagquiz\.techjuicelab\.space\/"/); assert.match(html, /<noscript>/);
  assert.doesNotMatch(html, /js\/app\.js|voice-manifest|audio\//);
  await assert.rejects(buildGithubEntry({ outputDirectory: f.directory }), /_site/);
  await assert.rejects(buildGithubEntry({ outputDirectory: f.outputDirectory, repository: 'owner/..' }), /repository/);
  assert.equal(await f.read('index.html'), html);
});

test('CLI는 앱 생성기·음원 의존 없이 Pages 산출물을 만들고 프로젝트·사용자 사이트 경로를 구분한다', async t => {
  const f = await fixture(t, 'owner/owner.github.io'); assert.match(await f.read('index.html'), /<base href="\/">/);
  const scripts = path.join(f.directory, 'scripts'); await fs.mkdir(scripts);
  const copied = path.join(scripts, 'build-github-entry.mjs');
  await fs.copyFile(new URL('../scripts/build-github-entry.mjs', import.meta.url), copied);
  await run(process.execPath, [copied], { env: { GITHUB_REPOSITORY: 'techjuicelab/FlagQuiz' } });
  assert.match(await f.read('index.html'), /<base href="\/FlagQuiz\/">/);
  const workflow = await fs.readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /run: node scripts\/build-github-entry\.mjs/); assert.doesNotMatch(workflow, /run: npm run build/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts.build, /scripts\/build-site\.mjs/);
  assert.match(await fs.readFile(new URL('../Dockerfile', import.meta.url), 'utf8'), /npm run build/);
});

test('온라인 진입은 FlagQuiz cache만 정리·같은 worker 갱신 후 NAS로 한 번 이동하고 학습 기록을 보존한다', async t => {
  const f = await fixture(t), p = page(await f.read('entry.js')); await tick();
  assert.deepEqual(p.deleted.sort(), ['flagquiz-shell-old', 'flagquiz-v4']);
  assert.deepEqual(p.redirects, [NAS_URL]); assert.equal(p.updates, 1);
  assert.equal(p.registered[0].url, BASE + 'sw.js'); assert.equal(p.registered[0].options.scope, BASE);
  assert.equal(p.registered[0].options.updateViaCache, 'none'); assert.equal(p.timers.size, 0);
  p.events.online(); await tick(); assert.deepEqual(p.redirects, [NAS_URL]);
});

test('오프라인 진입은 연결 안내를 보이고 재연결 때 이동하며 저장소 실패·워커 무응답은 이동을 막지 않는다', async t => {
  const f = await fixture(t), source = await f.read('entry.js'), offline = page(source, { online: false });
  await tick(); assert.deepEqual(offline.redirects, []); assert.equal(offline.registered.length, 0);
  assert.match(offline.status.textContent, /인터넷/);
  offline.context.navigator.onLine = true; offline.events.online(); await tick(); assert.deepEqual(offline.redirects, [NAS_URL]);
  const failed = page(source, { cacheFailure: true }); await tick(); assert.deepEqual(failed.redirects, [NAS_URL]);
  const stuck = page(source, { stuckWorker: true }); await tick(); assert.deepEqual(stuck.redirects, []);
  [...stuck.timers.values()].forEach(fn => fn()); await tick(); assert.deepEqual(stuck.redirects, [NAS_URL]);
  const disconnected = page(source, { stuckWorker: true }); await tick(); disconnected.context.navigator.onLine = false;
  [...disconnected.timers.values()].forEach(fn => fn()); await tick(); assert.deepEqual(disconnected.redirects, []);
  disconnected.context.navigator.onLine = true; disconnected.events.online(); await tick();
  [...disconnected.timers.values()].forEach(fn => fn()); await tick(); assert.deepEqual(disconnected.redirects, [NAS_URL]);
});

test('SW와 CacheStorage가 없는 환경에서도 진입 화면은 바로 NAS로 이동한다', async t => {
  const f = await fixture(t), source = await f.read('entry.js');
  for (const capabilities of [{ serviceWorker: false }, { cacheStorage: false }, { serviceWorker: false, cacheStorage: false }]) {
    const p = page(source, capabilities); await tick();
    assert.deepEqual(p.redirects, [NAS_URL]); assert.equal(p.timers.size, 0);
    if (capabilities.serviceWorker === false) assert.equal(p.registered.length, 0);
    if (capabilities.cacheStorage === false) assert.deepEqual(p.deleted, []);
  }
});

test('같은 Pages scope 아래에서 다른 SW가 제어하는 창은 자동 이동하지 않는다', async t => {
  for (const repository of ['techjuicelab/FlagQuiz', 'techjuicelab/techjuicelab.github.io']) {
    const f = await fixture(t, repository);
    const scope = repository.endsWith('.github.io') ? new URL('/', BASE).href : BASE;
    const unrelated = scope + 'another-app/';
    const w = worker(await f.read('sw.js'), { scope, clientEntries: [
      { url: scope, controlled: true },
      { url: scope + 'index.html?old-version=1', controlled: true },
      { url: unrelated, controlled: false }
    ] });
    await w.lifecycle('activate');
    assert.equal(w.claimed, 1);
    assert.deepEqual(w.navigated.map(client => client.url), [scope, scope + 'index.html?old-version=1']);
    assert.ok(w.navigated.every(client => client.target === scope));
    assert.equal((await w.fetch(scope + 'saved/deep-link', 'navigate')).status, 200);
    assert.equal(await (await w.fetch(scope + 'entry.js?version=2')).text(), await f.read('entry.js'));
  }
});

test('교체 worker는 즉시 활성화·소유 cache만 삭제·해당 Pages 창만 이동하고 옛 앱 요청은 차단한다', async t => {
  const f = await fixture(t), w = worker(await f.read('sw.js'));
  await w.lifecycle('install'); assert.equal(w.skipped, 1);
  await w.lifecycle('activate'); assert.equal(w.claimed, 1);
  assert.deepEqual(w.deleted.sort(), ['flagquiz-flags-v1', 'flagquiz-v4']);
  assert.deepEqual(w.navigated.map(item => item.url), [BASE, BASE + 'index.html']);
  assert.ok(w.navigated.every(item => item.target === BASE));
  const navigation = await w.fetch(BASE, 'navigate'); assert.equal(navigation.status, 200);
  assert.equal(navigation.headers.get('cache-control'), 'no-store'); assert.equal(await navigation.text(), await f.read('index.html'));
  const script = await w.fetch(BASE + 'entry.js'); assert.equal(await script.text(), await f.read('entry.js'));
  for (const name of ['js/app.js', 'audio/old.mp3', 'data/countries.js', 'manifest.webmanifest']) {
    const response = await w.fetch(BASE + name); assert.equal(response.status, 410); assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await w.fetch(BASE + 'entry.js', 'cors', 'POST')).status, 410);
  assert.equal(await w.fetch('https://techjuicelab.github.io/another-app/app.js'), null);
  assert.equal(await w.fetch('https://example.com/FlagQuiz/'), null);
});
