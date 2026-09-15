/* 기록 백업의 저장·복원 계약과 실제 내 기록 화면의 클릭 동작을 검사한다.
 * 최소 DOM은 값 대입과 이벤트만 흉내 내므로 Safari의 선택·복사 동작은 기기에서 확인한다.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const KEY = 'flagquiz.v1';
const KEYS = ['settings', 'stats', 'daily', 'countries', 'badges', 'axes', 'history'];

function fixture({ saved, blocked = false, getterBlocked = false } = {}) {
  const local = new Map(saved === undefined ? [] : [[KEY, saved]]);
  const denied = () => { throw new Error('Storage access denied'); };
  const c = { console, Math, Date, JSON, Object, Array, String, Number,
    localStorage: {
      getItem: blocked ? denied : key => local.get(key) ?? null,
      setItem: blocked ? denied : (key, value) => local.set(key, String(value))
    }
  };
  if (getterBlocked) Object.defineProperty(c, 'localStorage', { get: denied });
  c.window = c;
  vm.createContext(c);
  function load(...files) {
    for (const file of files) {
      vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), c, { filename: file });
    }
  }
  load('js/util.js', 'js/storage.js');
  return { c, local, load, storage: c.FQ.storage };
}

function recordProgress(storage) {
  storage.updateSettings({ players: ['민규', '아빠'], sound: false });
  storage.recordAnswer('kr', true);
  storage.recordAnswer('jp', false);
  storage.recordAnswer('kr', false, 'symbol');
  storage.recordAnswer('au', true, 'map');
  storage.addXp(35);
  storage.setDaily({ date: '2026-09-15', continent: '아시아', done: 1 });
  storage.awardBadge('first_game');
  storage.finishGame({ mode: 'choice4', total: 2, correct: 1, seconds: 20, bestStreak: 1, players: ['민규'] });
}

test('기록 백업은 새 축을 포함한 일곱 버킷 JSON이며 저장된 내용과 일치한다', () => {
  const f = fixture();
  const initial = f.storage.exportJson();
  assert.equal(typeof initial, 'string');
  assert.deepEqual(Object.keys(JSON.parse(initial)), KEYS);
  assert.match(initial, /\n  "settings":/);
  recordProgress(f.storage);
  const backup = JSON.parse(f.storage.exportJson());
  assert.equal(backup.countries.kr.correct, 1);
  assert.equal(backup.axes.symbol.kr.wrong, 1);
  assert.equal(backup.axes.map.au.correct, 1);
  assert.deepEqual(backup, JSON.parse(f.local.get(KEY)));
  assert.deepEqual([...f.local.keys()], [KEY]);
});

test('백업 JSON을 새 브라우저 저장소에 넣으면 스티커·배지·오답노트와 전체 기록이 복원된다', () => {
  const original = fixture();
  recordProgress(original.storage);
  original.load('data/countries.js', 'js/progress.js');
  const restored = fixture({ saved: original.storage.exportJson() });
  restored.load('data/countries.js', 'js/progress.js');
  assert.deepEqual(JSON.parse(restored.storage.exportJson()), JSON.parse(original.storage.exportJson()));
  assert.equal(restored.c.FQ.progress.stickers().owned, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.c.FQ.progress.stickers())),
    JSON.parse(JSON.stringify(original.c.FQ.progress.stickers())));
  assert.ok(restored.storage.badges().first_game);
  assert.deepEqual([...restored.storage.wrongList()], ['jp']);
  assert.equal(restored.local.size, 1);
});

test('localStorage의 읽기·쓰기 또는 접근 자체가 차단돼도 기본값과 현재 기록을 내보낸다', () => {
  for (const options of [{ blocked: true }, { getterBlocked: true }]) {
    const f = fixture(options);
    assert.doesNotThrow(() => f.storage.exportJson());
    const initial = JSON.parse(f.storage.exportJson());
    assert.deepEqual(Object.keys(initial), KEYS);
    assert.equal(initial.stats.asked, 0);
    assert.doesNotThrow(() => f.storage.recordAnswer('kr', true));
    assert.equal(JSON.parse(f.storage.exportJson()).countries.kr.correct, 1);
    assert.equal(f.local.size, 0);
  }
});

test('직렬화가 실패해도 내보내기는 예외 대신 JSON 문자열을 반환한다', () => {
  const f = fixture();
  f.storage.settings().circular = f.storage.settings();
  assert.doesNotThrow(() => f.storage.exportJson());
  assert.equal(f.storage.exportJson(), '{}');
});

/* ID 조회, innerHTML로 만든 요소, 클릭, textarea 선택만 필요한 화면용 DOM. */
function element(id) {
  let html = '', children = [];
  const listeners = new Map();
  return {
    id, value: '', selectCalls: 0,
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      children = [...value.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)].map(match => element(match[1]));
    },
    querySelector(selector) {
      for (const child of children) {
        if (selector === '#' + child.id) return child;
        const nested = child.querySelector(selector);
        if (nested) return nested;
      }
      return null;
    },
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    click() { for (const callback of listeners.get('click') || []) callback({ target: this }); },
    select() { this.selectCalls++; }
  };
}

function screenFixture(options) {
  const f = fixture(options);
  const main = element('main');
  f.c.document = {
    getElementById: id => id === 'main' ? main : main.querySelector('#' + id),
    querySelector: selector => main.querySelector(selector),
    addEventListener() {}
  };
  f.c.scrollTo = () => {};
  f.c.FQ.app = { home() {} };
  f.load('data/countries.js', 'js/features.js', 'js/progress.js', 'js/quiz.js', 'js/badges.js', 'js/ui.js', 'js/screens.js');
  return { ...f, main, node: selector => main.querySelector(selector) };
}

test('194개 국기 스티커 안의 새 도장은 학습 축별 정답만 읽고 기존 기록을 변경하지 않는다', () => {
  const f = screenFixture();
  f.storage.updateSettings({ dev: { art: true } });
  f.storage.recordAnswer('kr', true, 'symbol');
  f.storage.recordAnswer('kr', false, 'place');
  f.storage.recordAnswer('kr', true, 'map');
  const before = f.storage.exportJson();
  f.c.FQ.screens.dex('all');
  const html = f.node('#dex-list').innerHTML;
  assert.equal((html.match(/class="sticker-cell /g) || []).length, 194);
  const kr = html.match(/<button class="sticker-cell [^>]*data-code="kr"[\s\S]*?<\/button>/)[0];
  assert.match(kr, /sticker-cell locked/);
  assert.match(kr, /axis-stamp earned" data-axis="symbol"/);
  assert.match(kr, /axis-stamp" data-axis="place"/);
  assert.match(kr, /axis-stamp earned" data-axis="map"/);
  assert.equal(f.c.FQ.progress.stickers().owned, 0);
  assert.equal(f.storage.exportJson(), before);
  f.storage.updateSettings({ dev: { art: false } });
  f.c.FQ.screens.dex('all');
  assert.doesNotMatch(f.node('#dex-list').innerHTML, /data-axis="(?:symbol|place)"/);
  assert.match(f.node('#dex-list').innerHTML, /data-axis="map"/);
});

test('놀이별 기록은 국기·그림·명소·위치를 따로 집계하며 오래된 빈 레코드도 0으로 읽는다', () => {
  const seed = fixture();
  const saved = JSON.parse(seed.storage.exportJson());
  saved.axes = { symbol: { kr: { seen: 2, correct: 1 }, jp: {} }, map: { au: { seen: 1 } } };
  const f = screenFixture({ saved: JSON.stringify(saved) });
  f.storage.recordAnswer('fr', true);
  const before = f.storage.exportJson();
  f.c.FQ.screens.stats();
  assert.match(f.main.innerHTML, /data-axis="symbol"[\s\S]*?1개국 · 2문제[\s\S]*?정답 1개 · 50%/);
  assert.match(f.main.innerHTML, /data-axis="map"[\s\S]*?1개국 · 1문제[\s\S]*?정답 0개 · 0%/);
  assert.match(f.main.innerHTML, /data-axis="place"[\s\S]*?0개국 · 0문제/);
  assert.match(f.main.innerHTML, /data-axis="flag"[\s\S]*?1개국 · 1문제/);
  assert.doesNotMatch(f.main.innerHTML, /NaN|undefined/);
  assert.equal(f.storage.exportJson(), before);
});

test('내 기록에서 백업 버튼을 누르면 읽기 전용 textarea에 원문을 넣고 전체 선택한다', () => {
  const f = screenFixture();
  const literal = '</textarea><img id="injected" src=x onerror="alert(1)"> & <기록>';
  f.storage.updateSettings({ players: [literal] });
  f.c.FQ.screens.stats();
  assert.ok(f.main.innerHTML.indexOf('기록 백업') < f.main.innerHTML.indexOf('정리하기'));
  assert.ok(f.node('#export'));
  assert.equal(f.node('#export-text'), null);
  f.node('#export').click();
  const output = f.node('#export-out');
  const textarea = f.node('#export-text');
  assert.match(output.innerHTML, /<textarea\b[^>]*\breadonly\b/);
  assert.match(output.innerHTML, /rows="8"/);
  assert.equal(textarea.value, f.storage.exportJson());
  assert.deepEqual(Object.keys(JSON.parse(textarea.value)), KEYS);
  assert.equal(JSON.parse(textarea.value).settings.players[0], literal);
  assert.equal(textarea.selectCalls, 1);
  assert.equal(output.innerHTML.includes(literal), false);
  assert.equal(f.node('#injected'), null);
});

test('백업 버튼을 다시 누르면 최신 기록을 표시하고 출력 화면을 지우지 않는다', () => {
  const f = screenFixture();
  f.c.FQ.screens.stats();
  f.node('#export').click();
  assert.equal(JSON.parse(f.node('#export-text').value).stats.asked, 0);
  f.storage.recordAnswer('kr', true);
  f.node('#export').click();
  assert.equal(JSON.parse(f.node('#export-text').value).countries.kr.correct, 1);
  assert.equal(f.node('#export-text').selectCalls, 1);
});

test('저장소가 차단된 내 기록 화면에서도 백업 버튼은 기본값 JSON을 표시한다', () => {
  const f = screenFixture({ getterBlocked: true });
  assert.doesNotThrow(() => f.c.FQ.screens.stats());
  assert.doesNotThrow(() => f.node('#export').click());
  assert.deepEqual(Object.keys(JSON.parse(f.node('#export-text').value)), KEYS);
  assert.equal(JSON.parse(f.node('#export-text').value).stats.asked, 0);
});
