/* 브라우저 전달 기록은 메모리 DOM과 저장소로 검사하며 외부 요청은 금지한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../server/login-legacy.js', import.meta.url), 'utf8');
const KEY = 'flagquiz.legacy-pending', PREFIX = '#flagquiz-legacy=', MAX = 512 * 1024;
const encoded = raw => PREFIX + Buffer.from(raw).toString('base64url');
function fixture(hash, options = {}) {
  const current = new URL('https://quiz.test' + (options.page || '/login?error=failed&next=%2F') + hash);
  const location = { href: current.href, hash: current.hash, pathname: current.pathname };
  const pending = new Map(), local = new Map([['flagquiz.v1', 'existing-learning-data']]), events = [], downloads = [], blobs = new Map();
  function element(tag) {
    return { tag, hidden: true, textContent: '', listeners: new Map(), addEventListener(name, callback) { this.listeners.set(name, callback); },
      click() { if (tag === 'a' && this.download) downloads.push({ filename: this.download, blob: blobs.get(this.href) }); else this.listeners.get('click')?.({ preventDefault() {} }); }, remove() {} };
  }
  const parent = { buttons: [], insertBefore(value) { this.buttons.push(value); } };
  const notice = element('p'); notice.parentNode = parent;
  const form = element('form'), google = element('a'), deferred = new Map();
  const document = { readyState: options.loading ? 'loading' : 'complete',
    getElementById: () => options.noNotice ? null : notice, createElement: element,
    querySelector: () => options.noForm ? null : form, querySelectorAll: () => options.google ? [google] : [],
    addEventListener: (name, callback) => deferred.set(name, callback), body: { appendChild() {} } };
  Object.defineProperty(document, 'cookie', { get() { assert.fail('cookie read'); }, set() { assert.fail('cookie write'); } });
  const state = { existing: true }, history = { state, replaceState(value, title, url) {
    if (options.historyFails) throw new Error('fixture-only');
    events.push({ value, title, url }); location.href = url; location.hash = '';
  } };
  class FixtureUrl extends URL {}
  FixtureUrl.createObjectURL = blob => { if (options.downloadFails) throw new Error('fixture-only'); const url = 'blob:fixture-' + blobs.size; blobs.set(url, blob); return url; };
  FixtureUrl.revokeObjectURL = url => blobs.delete(url);
  const window = {}, context = { window, location, history, document, TextDecoder, Uint8Array, Blob, URL: FixtureUrl, atob, btoa,
    sessionStorage: { setItem(name, raw) { if (options.storageFails) throw new Error('fixture-only'); if (!options.silentStorage) pending.set(name, raw); }, getItem: name => pending.get(name) ?? null },
    localStorage: { getItem() { assert.fail('localStorage read'); }, setItem() { assert.fail('localStorage write'); } },
    fetch() { assert.fail('external request'); }, setTimeout() {} };
  vm.runInNewContext(source, context);
  function prevented(target = form, name = 'submit') { let prevented = false; target.listeners.get(name)?.({ preventDefault() { prevented = true; } }); return prevented; }
  return { window, location, history, state, pending, local, events, notice, form, google, parent, downloads, deferred, prevented };
}

test('UTF8 한국어 기록은 원문으로 임시 보관하고 성공 후 자신의 hash만 제거한다', () => {
  const raw = ' { "settings":{"name":"나라 놀이"},"stats":{},"daily":{},"countries":{},"badges":[],"axes":{},"history":[],"chest":{},"gifts":{} } ';
  const f = fixture(encoded(raw));
  assert.equal(f.pending.get(KEY), raw); assert.equal(f.location.hash, ''); assert.equal(f.window.FQLegacyHandoff.status, 'stored');
  assert.equal(f.events.length, 1); assert.equal(f.events[0].value, f.state); assert.equal(f.events[0].title, '');
  assert.equal(f.events[0].url, 'https://quiz.test/login?error=failed&next=%2F');
  assert.match(f.notice.textContent, /임시 보관/); assert.equal(f.prevented(), false); assert.equal(f.local.get('flagquiz.v1'), 'existing-learning-data');
});
test('인증된 index에서는 DOM 준비 전 기록을 포획하고 minimal 상태만 노출한다', () => {
  const raw = '{"stats":{"correct":12}}', f = fixture(encoded(raw), { page: '/', loading: true, noForm: true });
  assert.equal(f.pending.get(KEY), raw); assert.equal(f.location.hash, ''); assert.equal(f.window.FQLegacyHandoff.status, 'stored');
  assert.deepEqual(Object.keys(f.window.FQLegacyHandoff).sort(), ['reason', 'status']);
  assert.doesNotMatch(JSON.stringify(f.window.FQLegacyHandoff), /correct|legacy-pending/);
  f.deferred.get('DOMContentLoaded')(); assert.equal(f.parent.buttons.length, 0); assert.equal(f.notice.hidden, true);
});
test('다른 anchor는 기록이나 history를 변경하지 않는다', () => {
  const f = fixture('#help'); assert.equal(f.window.FQLegacyHandoff.status, 'none');
  assert.equal(f.pending.size, 0); assert.equal(f.events.length, 0); assert.equal(f.location.hash, '#help'); assert.equal(f.notice.hidden, true);
});
test('깨진 base64·UTF8·JSON·허용하지 않은 top key와 재귀 위험키를 거절하며 주소를 보존한다', () => {
  const hashes = [PREFIX, PREFIX + '%%', PREFIX + 'a', PREFIX + 'e30=', PREFIX + 'e31', PREFIX + '_w',
    PREFIX + Buffer.from([0xc3, 0x28]).toString('base64url'), encoded('null'), encoded('[]'), encoded('"text"'), encoded('{broken'),
    encoded('{"unknown":{}}'), encoded('{"countries":{"__proto__":{"polluted":true}}}'),
    encoded('{"history":[{"constructor":{}}]}'), encoded('{"gifts":{"nested":{"prototype":{}}}}'), encoded('{"stats":{"count":1e309}}')];
  for (const hash of hashes) {
    const f = fixture(hash); assert.equal(f.window.FQLegacyHandoff.status, 'failed', hash);
    assert.equal(f.location.hash, hash); assert.equal(f.pending.size, 0); assert.equal(f.events.length, 0); assert.equal(f.prevented(), true);
  }
  assert.equal({}.polluted, undefined);
});
test('512KiB 상한은 글자 수 대신 UTF8 바이트로 적용하고 경계 안의 기록은 보관한다', () => {
  const prefix = '{"settings":{"note":"', suffix = '"}}';
  const raw = prefix + 'a'.repeat(MAX - Buffer.byteLength(prefix + suffix)) + suffix;
  assert.equal(Buffer.byteLength(raw), MAX); assert.equal(fixture(encoded(raw)).pending.get(KEY), raw);
  for (const oversized of [raw + ' ', prefix + '한'.repeat(Math.floor(MAX / 2)) + suffix]) {
    const hash = encoded(oversized), f = fixture(hash);
    assert.equal(f.window.FQLegacyHandoff.reason, 'size'); assert.equal(f.location.hash, hash); assert.equal(f.pending.size, 0); assert.equal(f.prevented(), true);
  }
});
test('저장소 실패와 조용한 쓰기 실패는 hash를 지우지 않고 로그인 전에 백업을 안내한다', () => {
  const raw = '{"stats":{"correct":3}}', hash = encoded(raw);
  for (const options of [{ storageFails: true }, { silentStorage: true }]) {
    const f = fixture(hash, options); assert.equal(f.window.FQLegacyHandoff.reason, 'storage'); assert.equal(f.location.hash, hash);
    assert.equal(f.pending.size, 0); assert.equal(f.events.length, 0); assert.equal(f.prevented(), true); assert.equal(f.parent.buttons.length, 1);
  }
});
test('해독한 기록의 백업은 원문 JSON이고 다운로드 시작 뒤에도 실패한 전달 주소를 보존한다', async () => {
  const raw = '{"stats":{"correct":3}}', hash = encoded(raw), f = fixture(hash, { storageFails: true, google: true });
  assert.equal(f.prevented(f.google, 'click'), true); f.parent.buttons[0].click();
  assert.equal(f.downloads.length, 1); assert.equal(f.downloads[0].filename, 'flagquiz-learning-records.json');
  assert.equal(await f.downloads[0].blob.text(), raw); assert.equal(f.location.hash, hash); assert.equal(f.prevented(), false);
  assert.match(f.notice.textContent, /파일을 저장한 뒤 로그인/);
});
test('해독할 수 없는 전달은 원래 fragment 사본을 저장하고 다운로드 실패는 로그인 보호를 유지한다', async () => {
  const hash = PREFIX + 'broken%payload', f = fixture(hash); f.parent.buttons[0].click();
  assert.equal(f.downloads[0].filename, 'flagquiz-record-handoff.txt'); assert.equal(await f.downloads[0].blob.text(), hash);
  assert.equal(f.location.hash, hash);
  const failed = fixture(encoded('{"stats":{}}'), { storageFails: true, downloadFails: true }); failed.parent.buttons[0].click();
  assert.match(failed.notice.textContent, /저장하지 못했어요/); assert.equal(failed.prevented(), true);
});
test('history 변경 실패에도 임시 기록과 원래 URL을 보존하고 인증된 페이지의 UI를 건드리지 않는다', () => {
  const raw = '{"history":[]}', hash = encoded(raw), f = fixture(hash, { historyFails: true });
  assert.equal(f.window.FQLegacyHandoff.reason, 'url'); assert.equal(f.pending.get(KEY), raw); assert.equal(f.location.hash, hash); assert.equal(f.prevented(), true);
  const privatePage = fixture(encoded('{broken'), { page: '/', noForm: true });
  assert.equal(privatePage.window.FQLegacyHandoff.status, 'failed'); assert.equal(privatePage.parent.buttons.length, 0); assert.equal(privatePage.notice.hidden, true);
});
test('defer 로딩 중에도 포획은 즉시 끝나고 로그인 안내만 DOM 준비를 기다린다', () => {
  const raw = '{"chest":{}}', f = fixture(encoded(raw), { loading: true });
  assert.equal(f.pending.get(KEY), raw); assert.equal(f.location.hash, ''); assert.equal(f.notice.hidden, true);
  f.deferred.get('DOMContentLoaded')(); assert.equal(f.notice.hidden, false); assert.match(f.notice.textContent, /임시 보관/);
});
