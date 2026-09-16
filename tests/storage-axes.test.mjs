import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const local = new Map(saved === undefined ? [] : [['flagquiz.v1', JSON.stringify(saved)]]);
  const context = { localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, value) } };
  context.window = context;
  vm.createContext(context);
  const load = (file) => vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
  for (const file of ['js/util.js', 'js/storage.js', 'data/countries.js', 'data/subjects.js', 'js/progress.js', 'js/quiz.js']) load(file);
  return { FQ: context.FQ, load, local };
}

test('축 생략과 명시적 flag는 같은 국기 기록을 만든다', () => {
  const a = fixture(), b = fixture();
  for (const correct of [false, true, true]) {
    a.FQ.storage.recordAnswer('kr', correct);
    b.FQ.storage.recordAnswer('kr', correct, 'flag');
  }
  assert.deepEqual(JSON.parse(a.FQ.storage.exportJson()), JSON.parse(b.FQ.storage.exportJson()));
  assert.deepEqual([...a.local.keys()], ['flagquiz.v1']);
});

test('그림·명소·지도 답변은 국기 오답·가중치·스티커를 바꾸지 않고 전체 놀이 수에는 포함한다', () => {
  const { FQ } = fixture();
  const store = FQ.storage;
  for (const axis of ['symbol', 'place', 'map']) {
    for (let i = 0; i < 10; i++) store.recordAnswer('kr', false, axis);
    store.recordAnswer('kr', true, axis);
    assert.equal(store.allAxisStats(axis).kr.wrong, 10);
    assert.equal(store.allAxisStats(axis).kr.correct, 1);
    assert.equal(store.allAxisStats(axis).kr.seen, 11);
  }
  assert.deepEqual([...store.wrongList()], []);
  assert.equal(store.weightOf('kr'), 2);
  assert.equal(FQ.progress.hasSticker('kr'), false);
  assert.deepEqual(Object.keys(store.allCountryStats()), []);
  assert.equal(store.stats().asked, 33);
  assert.equal(store.stats().correct, 3);
});

test('기존 국기 기록과 부분적인 새 축 기록을 복원해도 빠진 필드가 NaN으로 퍼지지 않는다', () => {
  const f = fixture({ countries: { kr: { seen: 3, correct: 3, streak: 3 } }, axes: { symbol: { kr: { correct: 2 } } } });
  f.FQ.storage.recordAnswer('kr', false);
  assert.equal(f.FQ.storage.countryStat('kr').wrong, 1);
  f.FQ.storage.recordAnswer('kr', true, 'symbol');
  assert.deepEqual(JSON.parse(JSON.stringify(f.FQ.storage.axisStat('symbol', 'kr'))), { seen: 1, correct: 3, wrong: 0, streak: 1 });
  f.load('js/storage.js');
  assert.equal(f.FQ.storage.allAxisStats('symbol').kr.correct, 3);
  assert.equal(f.FQ.storage.countryStat('kr').correct, 3);
  assert.ok(Number.isFinite(f.FQ.storage.weightOf('kr')));
});

test('새 축 기록을 초기화하면 비워지고 사용자 설정은 남는다', () => {
  const { FQ } = fixture();
  const store = FQ.storage;
  store.updateSettings({ sound: false, dev: { art: true } });
  for (const axis of ['symbol', 'place', 'map']) store.recordAnswer('kr', true, axis);
  store.resetProgress();
  assert.deepEqual(JSON.parse(store.exportJson()).axes, {});
  for (const axis of ['symbol', 'place', 'map']) assert.deepEqual(Object.keys(store.allAxisStats(axis)), []);
  assert.equal(store.settings().sound, false);
  assert.equal(store.settings().dev.art, true);
  store.recordAnswer('kr', true, 'map');
  store.resetAll();
  assert.deepEqual(JSON.parse(store.exportJson()).axes, {});
  assert.equal(store.settings().sound, true);
});

test('기존 다섯 모드는 국기 축이며 게임 제출은 모드 축에만 한 번 기록한다', () => {
  const { FQ } = fixture();
  for (const mode of ['choice4', 'reverse', 'capital', 'typing', 'voice']) assert.equal(FQ.quiz.MODES[mode].axis, 'flag');
  for (const axis of ['symbol', 'place', 'map']) {
    const mode = 'axis-test-' + axis;
    FQ.quiz.MODES[mode] = { kind: 'choice', hasOptions: true, axis };
    const game = FQ.quiz.createGame({ mode, only: ['kr'], count: 1 });
    assert.equal(game.submit({ code: 'kr' }).correct, true);
    assert.equal(game.submit({ code: 'kr' }), null);
    assert.equal(FQ.storage.allAxisStats(axis).kr.correct, 1);
    assert.equal(FQ.storage.allCountryStats().kr, undefined);
  }
});

test('저장분에 없던 settings 객체를 제자리로 고쳐도 기본값이 오염되지 않는다', () => {
  // 옛 저장분에는 dev 가 없다. 병합이 DEFAULTS 의 실물을 넘기면
  // settings().dev.art = true 한 줄이 기본값 자체를 바꾸고 '모두 지우기'로도 안 지워진다.
  const { FQ } = fixture({ settings: { players: ['민규'], speak: true } });
  const store = FQ.storage;
  // vm 컨텍스트 밖에서는 프로토타입이 달라 deepEqual 이 못 쓰인다 — 문자열로 비교한다.
  assert.equal(JSON.stringify(store.settings().dev), '{}');
  store.settings().dev.art = true;
  store.settings().players.push('덧붙은 이름');
  store.resetAll();
  assert.equal(JSON.stringify(store.settings().dev), '{}', '초기화한 설정에 dev 오염이 남았다');
  assert.equal(JSON.stringify(store.settings().players), '["민규"]', '초기화한 설정에 players 오염이 남았다');
});
