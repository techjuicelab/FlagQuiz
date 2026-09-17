/* 깜짝 상자(D22): 굴림 규칙·종류·모양·저장 버킷을 검사한다. 난수는 주입하고, 평균 간격은 고정 난수열로 잰다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// VM 안에서 만든 객체는 프로토타입이 달라 strict deepEqual 이 거부하므로 JSON 으로 평면화해 비교한다.
const deq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);

function fixture(saved) {
  const local = new Map(saved === undefined ? [] : [['flagquiz.v1', JSON.stringify(saved)]]);
  const context = { localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, value) } };
  context.window = context;
  vm.createContext(context);
  for (const file of ['js/util.js', 'js/storage.js', 'js/features.js', 'data/countries.js', 'js/progress.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
  }
  return { FQ: context.FQ, local };
}

test('굴림 규칙: 2장째부터 15%, 8장째에는 반드시, 1장째에는 절대 안 열린다', () => {
  const P = fixture().FQ.progress;
  deq(P.CHEST_RULE, { min: 2, max: 8, chance: 0.15 });
  assert.equal(P.chestRoll(1, 0), false, '첫 장은 난수가 0이어도 안 열린다');
  assert.equal(P.chestRoll(0, 0), false);
  assert.equal(P.chestRoll(2, 0.149), true);
  assert.equal(P.chestRoll(2, 0.15), false);
  assert.equal(P.chestRoll(7, 0.99), false);
  assert.equal(P.chestRoll(8, 0.99), true, '여덟째 장은 반드시');
  assert.equal(P.chestRoll(12, 0.99), true);
  assert.equal(P.chestRoll('x', 0.99), false);
});

test('평균 간격은 약 5.5장 — 전(5장)보다 10% 뜸하다', () => {
  const P = fixture().FQ.progress;
  // 고정 LCG 난수열로 50,000장을 굴린다.
  let seed = 12345;
  const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let since = 0, opened = 0;
  const gaps = [];
  for (let card = 0; card < 50000; card++) {
    since += 1;
    if (P.chestRoll(since, rand())) { opened += 1; gaps.push(since); since = 0; }
  }
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  assert.ok(mean > 5.3 && mean < 5.7, '평균 간격 ' + mean.toFixed(2));
  assert.ok(Math.max(...gaps) === 8, '8장을 넘긴 적이 없다');
  assert.ok(Math.min(...gaps) === 2, '연달아 열리지 않는다');
});

test('종류는 황금 5% · 반짝 20% · 보통 75% 이고 보상은 종류마다 다르다', () => {
  const P = fixture().FQ.progress;
  assert.equal(P.chestKind(0), 'gold');
  assert.equal(P.chestKind(0.049), 'gold');
  assert.equal(P.chestKind(0.05), 'shiny');
  assert.equal(P.chestKind(0.249), 'shiny');
  assert.equal(P.chestKind(0.25), 'plain');
  assert.equal(P.chestKind(0.99), 'plain');
  deq(P.chestLoot('plain'), { name: '여행 상자', score: 5, xp: 20 });
  deq(P.chestLoot('shiny'), { name: '반짝 상자', score: 5, xp: 40 });
  deq(P.chestLoot('gold'), { name: '황금 상자', score: 10, xp: 60 });
  deq(P.chestLoot('없음'), P.chestLoot('plain'), '모르는 종류는 보통 상자');
});

test('상자 모양은 대륙마다 다르고 상자 음악 6곡에 하나씩 붙는다', () => {
  const { FQ } = fixture();
  const P = FQ.progress;
  const continents = [...new Set(FQ.countries.map(c => c.continent))];
  assert.equal(continents.length, 6);
  const musics = new Set();
  const emojis = new Set();
  for (const continent of continents) {
    const shape = P.chestShape(continent);
    assert.ok(shape.emoji && shape.name && /^chest-0[1-6]-[a-z]+$/.test(shape.music), continent);
    musics.add(shape.music); emojis.add(shape.emoji);
  }
  assert.equal(musics.size, 6, '곡이 겹치지 않는다');
  assert.equal(emojis.size, 6, '모양이 겹치지 않는다');
  const manifest = fs.readFileSync(new URL('../js/music-manifest.js', import.meta.url), 'utf8');
  for (const id of musics) assert.ok(manifest.includes('"id": "' + id + '"'), id + ' 가 음악 목록에 있다');
  deq(P.chestShape('달나라'), { emoji: '🎁', name: '여행 상자', music: null });
});

test('저장 버킷: 옛 저장분에 chest 가 없어도 0으로 읽고, 열리면 since 가 0으로 돌아가며, 정리하기가 비운다', () => {
  const old = fixture({ stats: { asked: 12 }, countries: {}, settings: {} });
  deq(old.FQ.storage.chestState(), { since: 0, opened: 0, kinds: {} });
  const store = old.FQ.storage;
  store.recordChest(null); store.recordChest(null);
  assert.equal(store.chestState().since, 2);
  store.recordChest('shiny');
  deq(store.chestState(), { since: 0, opened: 1, kinds: { shiny: 1 } });
  store.recordChest('shiny'); store.recordChest('gold');
  deq(store.chestState().kinds, { shiny: 2, gold: 1 });
  const saved = JSON.parse(old.local.get('flagquiz.v1'));
  deq(saved.chest, { since: 0, opened: 3, kinds: { shiny: 2, gold: 1 } }, '저장된다');
  deq(JSON.parse(store.exportJson()).chest, saved.chest, '내보내기에 포함된다');
  store.resetProgress();
  deq(store.chestState(), { since: 0, opened: 0, kinds: {} });
  // 저장분의 이상한 값도 (x || 0) 로 방어한다.
  const odd = fixture({ chest: { since: 'x', kinds: 3 } });
  deq(odd.FQ.storage.chestState(), { since: 0, opened: 0, kinds: {} });
});
