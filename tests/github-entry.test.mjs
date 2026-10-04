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
const LEGACY_LIMIT = 512 * 1024;
const LEGACY_RECORD = {
  settings: { players: ['아이🚀', '아빠'], speak: true }, stats: { xp: 45, games: 2 },
  daily: { date: '2026-10-04', done: 1 }, countries: { kr: { seen: 4, correct: 3, wrong: 1 } },
  badges: { first_game: true }, axes: { capital: { jp: { correct: 1 } } },
  history: [{ mode: 'map', correct: 2, players: ['아이'] }], chest: { opened: 1, kinds: { gold: 1 } },
  gifts: { owned: ['fire_truck', 'space_rocket'] }
};
const run = promisify(execFile);
const tick = () => new Promise(resolve => setImmediate(resolve));
function transferredRaw(destination) {
  const url = new URL(destination);
  assert.equal(url.origin + url.pathname, NAS_URL); assert.equal(url.search, '');
  assert.match(url.hash, /^#flagquiz-legacy=[A-Za-z0-9_-]+$/);
  return Buffer.from(url.hash.slice('#flagquiz-legacy='.length), 'base64url').toString('utf8');
}
async function storageProgress() {
  const local = new Map(), context = { localStorage: {
    getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, String(value))
  } };
  context.window = context; vm.createContext(context);
  for (const file of ['js/util.js', 'js/storage.js']) vm.runInContext(await fs.readFile(new URL('../' + file, import.meta.url), 'utf8'), context);
  const storage = context.FQ.storage;
  storage.updateSettings({ players: ['기존 아이🚀', '아빠'], sound: false,
    lastMode: { flag: 'voice', art: 'symbol', map: 'map', capital: 'capitalVoice' }, dev: { art: true, map: true, capital: true } });
  storage.recordAnswer('kr', true); storage.recordAnswer('jp', false);
  for (const axis of ['symbol', 'place', 'map', 'capital']) storage.recordAnswer('jp', true, axis);
  storage.addXp(250); storage.setDaily({ date: '2026-10-04', continent: '아시아', done: 2 });
  storage.awardBadge('first_game'); storage.awardGift('fire_truck'); storage.awardGift('space_rocket');
  storage.recordChest('gold');
  storage.finishGame({ mode: 'voice', total: 2, correct: 1, seconds: 12, bestStreak: 1,
    players: ['기존 아이🚀'], learnedCorrect: 1, helpedCorrect: 0 });
  return local.get('flagquiz.v1');
}
async function nasBrowser(destination, { current } = {}) {
  const local = new Map([['another-app', 'keep']]), session = new Map([['another-session', 'keep']]);
  if (current !== undefined) local.set('flagquiz.v1', current);
  const events = new Map(), logs = [], timers = [], nodes = new Map(); let reloads = 0, confirmations = 0;
  for (const id of ['legacy-notice', 'legacy-record-note', 'legacy-import-message']) nodes.set(id,
    { hidden: true, textContent: '', innerHTML: '', parentNode: { insertBefore() {} }, addEventListener() {} });
  const entry = new URL(destination), location = { href: entry.origin + '/login' + entry.hash, pathname: '/login', hash: entry.hash,
    reload() { reloads++; } };
  const storage = values => ({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) });
  const context = { location, URL, TextDecoder, Uint8Array, atob, btoa, localStorage: storage(local), sessionStorage: storage(session),
    history: { state: { preserved: true }, replaceState(state, title, href) { location.href = href; location.hash = ''; } },
    document: { readyState: 'complete', getElementById: id => nodes.get(id) || null, querySelector: () => null, querySelectorAll: () => [],
      addEventListener(name, handler) { if (!events.has(name)) events.set(name, []); events.get(name).push(handler); } },
    setTimeout: handler => timers.push(handler), confirm() { confirmations++; return false; },
    console: { log: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    fetch() { assert.fail('학습 기록을 HTTP로 보내면 안 됩니다.'); }
  };
  context.window = context; vm.createContext(context);
  const scripts = new Map();
  for (const file of ['server/login-legacy.js', 'js/legacy-records.js', 'js/legacy-boot.js', 'js/util.js', 'js/storage.js'])
    scripts.set(file, await fs.readFile(new URL('../' + file, import.meta.url), 'utf8'));
  const load = file => vm.runInContext(scripts.get(file), context, { filename: file });
  load('server/login-legacy.js');
  function app() {
    location.href = NAS_URL; location.pathname = '/'; location.hash = ''; context.document.readyState = 'loading';
    for (const file of ['server/login-legacy.js', 'js/legacy-records.js', 'js/legacy-boot.js', 'js/util.js', 'js/storage.js']) load(file);
    context.document.readyState = 'complete'; for (const handler of events.get('DOMContentLoaded') || []) handler();
  }
  return { local, session, context, location, nodes, logs, app, load, get reloads() { return reloads; }, get confirmations() { return confirmations; } };
}
async function fixture(t, repository = 'techjuicelab/FlagQuiz') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'flagquiz-github-entry-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const outputDirectory = path.join(directory, '_site');
  await buildGithubEntry({ outputDirectory, repository });
  return { directory, outputDirectory, read: name => fs.readFile(path.join(outputDirectory, name), 'utf8') };
}

function page(source, { online = true, cacheFailure = false, stuckWorker = false, serviceWorker = true, cacheStorage = true,
  saved, storageFailure = false, getterFailure = false, encoder = true, base64 = true, navigationFailure = false } = {}) {
  const events = {}, redirects = [], registered = [], deleted = [], timers = new Map(), downloads = [], logs = [], blobs = new Map(), revoked = [];
  const names = ['flagquiz-v4', 'flagquiz-shell-old', 'another-app-v1', 'flagquiz'];
  const local = new Map(saved === undefined ? [] : [['flagquiz.v1', saved]]);
  const status = { textContent: '' }, downloadEvents = {};
  const openLink = { href: NAS_URL, click() { redirects.push(this.href); } };
  const downloadButton = { hidden: true, addEventListener(name, fn) { downloadEvents[name] = fn; }, click() { downloadEvents.click?.(); } };
  let updates = 0, sequence = 0, storageReads = 0, blockGetter = getterFailure, blockRead = storageFailure;
  class PageURL extends URL {
    static createObjectURL(blob) { const url = 'blob:fixture-' + blobs.size; blobs.set(url, blob); return url; }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  const storage = {
    getItem(key) { assert.equal(key, 'flagquiz.v1'); storageReads++; if (blockRead) throw new Error('storage denied'); return local.get(key) ?? null; },
    setItem() { throw new Error('학습 기록을 변경하면 안 됩니다.'); },
    removeItem() { throw new Error('학습 기록을 삭제하면 안 됩니다.'); },
    clear() { throw new Error('학습 기록을 삭제하면 안 됩니다.'); }
  };
  const context = {
    URL: PageURL, Promise, Blob, TextEncoder, btoa: value => Buffer.from(value, 'latin1').toString('base64'),
    console: { log: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    location: { origin: new URL(BASE).origin, replace: url => {
      if (navigationFailure) throw new Error('navigation rejected');
      redirects.push(url);
    } },
    document: {
      getElementById: id => ({ 'entry-status': status, 'entry-open': openLink, 'entry-download': downloadButton })[id] || null,
      body: { appendChild(anchor) { anchor.attached = true; } },
      createElement(tag) {
        assert.equal(tag, 'a');
        return { href: '', download: '', attached: false,
          click() { assert.ok(this.attached); downloads.push({ filename: this.download, blob: blobs.get(this.href) }); },
          remove() { this.attached = false; }
        };
      }
    },
    navigator: { onLine: online, serviceWorker: { register: async (url, options) => {
      registered.push({ url, options });
      if (stuckWorker) return new Promise(() => {});
      return { update: async () => { updates++; } };
    } } },
    caches: { keys: async () => { if (cacheFailure) throw new Error('storage disabled'); return names; }, delete: async name => { deleted.push(name); return true; } },
    setTimeout: fn => { timers.set(++sequence, fn); return sequence; },
    clearTimeout: id => timers.delete(id)
  };
  Object.defineProperty(context, 'localStorage', { get() { if (blockGetter) throw new Error('storage access denied'); return storage; } });
  if (!encoder) delete context.TextEncoder;
  if (!base64) delete context.btoa;
  if (!serviceWorker) delete context.navigator.serviceWorker;
  if (!cacheStorage) delete context.caches;
  context.window = context; context.addEventListener = (name, fn) => { events[name] = fn; };
  vm.runInNewContext(source, context);
  return { context, events, redirects, registered, deleted, status, timers, local, downloads, logs, revoked, openLink, downloadButton,
    allowStorage() { blockGetter = false; blockRead = false; }, get storageReads() { return storageReads; }, get updates() { return updates; } };
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

test('기존 아홉 버킷 원문과 한글·이모지는 쿼리 없이 UTF-8 base64url fragment로 자동·수동 주소에 함께 전달한다', async t => {
  const f = await fixture(t), raw = JSON.stringify(LEGACY_RECORD, null, 2);
  const p = page(await f.read('entry.js'), { saved: raw }); await tick();
  assert.equal(p.redirects.length, 1); assert.equal(p.redirects[0], p.openLink.href);
  assert.equal(transferredRaw(p.redirects[0]), raw);
  assert.deepEqual(JSON.parse(transferredRaw(p.redirects[0])), LEGACY_RECORD);
  assert.equal(p.local.get('flagquiz.v1'), raw); assert.equal(p.storageReads, 1);
  assert.deepEqual(p.downloads, []); assert.deepEqual(p.logs, []);
  assert.doesNotMatch(p.status.textContent, /fire_truck|선물|players|45/);
  p.events.online(); await tick(); assert.equal(p.redirects.length, 1);
});

test('자동 이동의 worker 갱신이 멈춰도 수동 NAS 링크에는 이전 기록 fragment가 먼저 준비된다', async t => {
  const f = await fixture(t), raw = JSON.stringify(LEGACY_RECORD);
  const p = page(await f.read('entry.js'), { saved: raw, stuckWorker: true }); await tick();
  assert.deepEqual(p.redirects, []); assert.equal(transferredRaw(p.openLink.href), raw);
  p.openLink.click(); assert.equal(transferredRaw(p.redirects[0]), raw);
  assert.equal(p.local.get('flagquiz.v1'), raw);
});

test('유효 기록의 다운로드를 직접 선택하면 대기 중 자동 이동도 멈추고 파일과 이전 링크를 유지한다', async t => {
  const f = await fixture(t), raw = JSON.stringify(LEGACY_RECORD);
  const p = page(await f.read('entry.js'), { saved: raw, stuckWorker: true }); await tick();
  assert.equal(p.downloadButton.hidden, false); p.downloadButton.click();
  assert.equal(await p.downloads[0].blob.text(), raw);
  [...p.timers.values()].forEach(fn => fn()); await tick();
  p.events.online(); await tick(); assert.deepEqual(p.redirects, []);
  assert.equal(transferredRaw(p.openLink.href), raw); assert.equal(p.local.get('flagquiz.v1'), raw);
});

test('브라우저가 자동 이동을 거부해도 오류 원문을 출력하지 않고 기존 기록 다운로드와 수동 주소를 제공한다', async t => {
  const f = await fixture(t), raw = JSON.stringify(LEGACY_RECORD);
  const p = page(await f.read('entry.js'), { saved: raw, navigationFailure: true }); await tick();
  assert.deepEqual(p.redirects, []); assert.deepEqual(p.logs, []); assert.match(p.status.textContent, /자동으로 열지 못했어요/);
  p.events.online(); await tick(); assert.deepEqual(p.redirects, []);
  p.downloadButton.click(); assert.equal(await p.downloads[0].blob.text(), raw);
  assert.equal(transferredRaw(p.openLink.href), raw); assert.equal(p.local.get('flagquiz.v1'), raw);
});

test('오프라인·재연결과 SW/CacheStorage 없는 환경도 같은 기존 기록 fragment를 보존한다', async t => {
  const f = await fixture(t), source = await f.read('entry.js'), raw = JSON.stringify(LEGACY_RECORD);
  const p = page(source, { saved: raw, online: false }); await tick();
  assert.deepEqual(p.redirects, []); assert.equal(transferredRaw(p.openLink.href), raw);
  p.context.navigator.onLine = true; p.events.online(); await tick();
  assert.equal(transferredRaw(p.redirects[0]), raw);
  const unsupported = page(source, { saved: raw, serviceWorker: false, cacheStorage: false }); await tick();
  assert.equal(transferredRaw(unsupported.redirects[0]), raw); assert.deepEqual(unsupported.deleted, []);
});

test('512KiB 경계는 UTF-8 바이트 기준이며 초과 기록은 자동 이동 대신 원문 다운로드로 보존한다', async t => {
  const f = await fixture(t), source = await f.read('entry.js');
  const overhead = Buffer.byteLength(JSON.stringify({ history: [''] }));
  const exact = JSON.stringify({ history: ['x'.repeat(LEGACY_LIMIT - overhead)] });
  assert.equal(Buffer.byteLength(exact), LEGACY_LIMIT);
  const accepted = page(source, { saved: exact }); await tick();
  assert.equal(transferredRaw(accepted.redirects[0]), exact);
  for (const raw of [JSON.stringify({ history: ['x'.repeat(LEGACY_LIMIT - overhead + 1)] }),
    JSON.stringify({ settings: { players: ['가'.repeat(LEGACY_LIMIT / 2)] } })]) {
    assert.ok(Buffer.byteLength(raw) > LEGACY_LIMIT);
    const p = page(source, { saved: raw }); await tick();
    assert.deepEqual(p.redirects, []); assert.equal(p.openLink.href, NAS_URL); assert.equal(p.downloadButton.hidden, false);
    assert.deepEqual(p.downloads, []); p.events.online(); await tick(); assert.deepEqual(p.redirects, []);
    p.downloadButton.click(); assert.equal(p.downloads.length, 1);
    assert.equal(p.downloads[0].filename, 'flagquiz-legacy.json'); assert.equal(await p.downloads[0].blob.text(), raw);
    assert.equal(p.local.get('flagquiz.v1'), raw); assert.deepEqual(p.logs, []);
    p.openLink.click(); assert.deepEqual(p.redirects, [NAS_URL]);
  }
});

test('잘못된 루트·알 수 없는 top key·모든 깊이의 위험 키는 전송하지 않고 사용자 선택과 원문 백업을 남긴다', async t => {
  const f = await fixture(t), source = await f.read('entry.js');
  const invalid = ['', 'not-json', 'null', '[]', '42', '"기록"', '{"cookie":"sensitive-fixture"}',
    '{"__proto__":{"polluted":true}}', '{"settings":{"players":[{"constructor":{"polluted":true}}]}}',
    '{"history":[{"nested":{"prototype":true}}]}', '{"gifts":{"nested":{"__proto__":{"polluted":true}}}}'];
  for (const raw of invalid) {
    const p = page(source, { saved: raw }); await tick();
    assert.deepEqual(p.redirects, []); assert.equal(p.openLink.href, NAS_URL); assert.equal(p.downloadButton.hidden, false);
    assert.equal(p.downloads.length, 0); p.downloadButton.click();
    assert.equal(await p.downloads[0].blob.text(), raw); assert.equal(p.local.get('flagquiz.v1'), raw);
    p.events.online(); await tick(); assert.deepEqual(p.redirects, []); assert.deepEqual(p.logs, []);
    assert.doesNotMatch(p.status.textContent, /sensitive-fixture|polluted|not-json/);
  }
  assert.equal(Object.prototype.polluted, undefined);
});

test('허용 키의 부분 기록과 깊은 JSON 객체는 기본값을 덧씌우지 않고 원문 그대로 전달한다', async t => {
  const f = await fixture(t), source = await f.read('entry.js');
  for (const raw of ['{}', '{"gifts":{"owned":["fire_truck"]}}',
    '{"history":[' + '{"nested":'.repeat(10000) + '{}' + '}'.repeat(10000) + ']}']) {
    const p = page(source, { saved: raw }); await tick();
    assert.equal(transferredRaw(p.redirects[0]), raw); assert.equal(p.local.get('flagquiz.v1'), raw);
  }
});

test('저장소 접근·읽기 실패는 자동 이동을 멈추고 다운로드 클릭으로 재시도하되 가짜 빈 파일을 만들지 않는다', async t => {
  const f = await fixture(t), source = await f.read('entry.js'), raw = JSON.stringify(LEGACY_RECORD);
  for (const failure of [{ getterFailure: true }, { storageFailure: true }]) {
    const p = page(source, { saved: raw, ...failure }); await tick();
    assert.deepEqual(p.redirects, []); assert.equal(p.downloadButton.hidden, false); assert.equal(p.openLink.href, NAS_URL);
    p.downloadButton.click(); assert.deepEqual(p.downloads, []); assert.match(p.status.textContent, /저장소 접근/);
    p.allowStorage(); p.downloadButton.click(); assert.equal(await p.downloads[0].blob.text(), raw);
    assert.equal(transferredRaw(p.openLink.href), raw); assert.equal(p.local.get('flagquiz.v1'), raw);
    p.events.online(); await tick(); assert.deepEqual(p.redirects, []); assert.deepEqual(p.logs, []);
    [...p.timers.values()].forEach(fn => fn()); assert.equal(p.revoked.length, 1);
  }
  const absent = page(source, { getterFailure: true }); await tick(); absent.allowStorage(); absent.downloadButton.click();
  assert.deepEqual(absent.downloads, []); assert.match(absent.status.textContent, /기존 기록이 없어요/);
});

test('인코딩 API가 없는 브라우저에서도 기록을 삭제하거나 자동 이동하지 않고 JSON 다운로드를 제공한다', async t => {
  const f = await fixture(t), source = await f.read('entry.js'), raw = JSON.stringify(LEGACY_RECORD);
  for (const capability of [{ encoder: false }, { base64: false }]) {
    const p = page(source, { saved: raw, ...capability }); await tick();
    assert.deepEqual(p.redirects, []); assert.equal(p.openLink.href, NAS_URL); assert.equal(p.downloadButton.hidden, false);
    p.downloadButton.click(); assert.equal(await p.downloads[0].blob.text(), raw);
    assert.equal(p.local.get('flagquiz.v1'), raw); assert.deepEqual(p.logs, []);
  }
});

test('퇴역 worker가 제공하는 ENTRY_HTML과 entry.js에도 동일한 원문 fragment 이전·다운로드 경로가 포함된다', async t => {
  const f = await fixture(t), w = worker(await f.read('sw.js'));
  const html = await (await w.fetch(BASE + 'old-route', 'navigate')).text();
  assert.match(html, /id="entry-open"/); assert.match(html, /id="entry-download"/);
  assert.equal(html, await f.read('index.html'));
  const script = await (await w.fetch(BASE + 'entry.js')).text(); assert.equal(script, await f.read('entry.js'));
  const raw = JSON.stringify(LEGACY_RECORD), p = page(script, { saved: raw }); await tick();
  assert.equal(transferredRaw(p.redirects[0]), raw); assert.equal(p.local.get('flagquiz.v1'), raw);
});

test('실제 storage export는 Pages→로그인 임시 보관→실제 boot→storage 순서에서 아홉 버킷을 온전히 복원한다', async t => {
  const f = await fixture(t), raw = await storageProgress();
  const p = page(await f.read('entry.js'), { saved: raw }); await tick();
  const n = await nasBrowser(p.redirects[0]);
  assert.equal(n.session.get('flagquiz.legacy-pending'), raw); assert.equal(n.location.hash, '');
  assert.equal(n.local.has('flagquiz.v1'), false); assert.equal(n.context.FQ, undefined);
  // 비밀번호 오류로 로그인 화면을 다시 읽어도 같은 탭의 임시 기록은 남는다.
  n.location.pathname = '/login'; n.location.href = NAS_URL + 'login?error=failed'; n.load('server/login-legacy.js');
  assert.equal(n.session.get('flagquiz.legacy-pending'), raw);
  n.app();
  assert.equal(n.local.get('flagquiz.v1'), raw); assert.equal(n.session.has('flagquiz.legacy-pending'), false);
  assert.deepEqual(JSON.parse(n.context.FQ.storage.exportJson()), JSON.parse(raw));
  assert.equal(n.context.FQ.storage.stats().xp, 250); assert.equal(n.context.FQ.storage.allAxisStats('capital').jp.correct, 1);
  assert.deepEqual(Array.from(n.context.FQ.storage.giftState().owned), ['fire_truck', 'space_rocket']);
  assert.equal(n.confirmations, 0); assert.equal(n.reloads, 0); assert.deepEqual(n.logs, []);
  assert.match(n.nodes.get('legacy-record-note').textContent, /가져왔어요/);
  assert.equal(p.local.get('flagquiz.v1'), raw); assert.equal(n.local.get('another-app'), 'keep'); assert.equal(n.session.get('another-session'), 'keep');
});

test('같은 전달 경로에서 기존 NAS 진도는 자동 덮어쓰지 않고 이전 주소와 pending 두 원문을 보존한다', async t => {
  const f = await fixture(t), raw = await storageProgress(), existing = JSON.parse(raw); existing.stats.xp = 999;
  const current = JSON.stringify(existing), p = page(await f.read('entry.js'), { saved: raw }); await tick();
  const n = await nasBrowser(p.redirects[0], { current }); n.app();
  assert.equal(n.local.get('flagquiz.v1'), current); assert.equal(n.context.FQ.storage.stats().xp, 999);
  assert.equal(n.session.get('flagquiz.legacy-pending'), raw); assert.equal(p.local.get('flagquiz.v1'), raw);
  assert.match(n.nodes.get('legacy-record-note').innerHTML, /원하는 기록을 골라/);
  assert.equal(n.confirmations, 0); assert.equal(n.reloads, 0); assert.deepEqual(n.logs, []);
});

test('같은 Pages 기록을 재전달해도 이전 설치 이후 늘어난 NAS 진도를 초기값으로 되돌리지 않는다', async t => {
  const f = await fixture(t), raw = await storageProgress(), p = page(await f.read('entry.js'), { saved: raw }); await tick();
  const n = await nasBrowser(p.redirects[0]); n.app(); n.context.FQ.storage.addXp(75);
  const progressed = n.local.get('flagquiz.v1'), source = n.local.get('flagquiz.legacy-source');
  n.location.href = p.redirects[0]; n.location.hash = new URL(p.redirects[0]).hash;
  n.load('server/login-legacy.js'); assert.equal(n.session.get('flagquiz.legacy-pending'), raw);
  n.app();
  assert.equal(n.context.FQ.storage.stats().xp, 325); assert.equal(n.local.get('flagquiz.v1'), progressed);
  assert.equal(n.local.get('flagquiz.legacy-source'), source); assert.equal(n.session.has('flagquiz.legacy-pending'), false);
  assert.equal(p.local.get('flagquiz.v1'), raw); assert.equal(n.reloads, 0); assert.deepEqual(n.logs, []);
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
