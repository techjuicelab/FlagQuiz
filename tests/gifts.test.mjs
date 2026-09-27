/* 그림 선물: 오래된 기록과 함께 저장되고, 아홉 칸 스프라이트가 오프라인에 준비된다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const local = new Map(saved === undefined ? [] : [['flagquiz.v1', JSON.stringify(saved)]]);
  const context = { localStorage: {
    getItem: key => local.get(key) ?? null,
    setItem: (key, value) => local.set(key, value)
  } };
  context.window = context;
  vm.createContext(context);
  for (const file of ['js/util.js', 'js/storage.js', 'js/features.js', 'data/countries.js', 'js/progress.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
  }
  return { FQ: context.FQ, local };
}

test('그림 선물은 옛 기록에서 빈 수집함으로 시작해 한 번씩 저장되고 초기화된다', () => {
  const { FQ, local } = fixture({ stats: { asked: 12 }, countries: {}, settings: {} });
  const catalog = FQ.progress.giftCatalog();
  assert.equal(catalog.length, 9);
  assert.deepEqual([...catalog].map(g => [g.col, g.row]), [
    [0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]
  ]);
  assert.deepEqual([...FQ.storage.giftState().owned], []);
  for (const gift of catalog) assert.equal(FQ.storage.awardGift(gift.id), true);
  assert.equal(FQ.storage.awardGift(catalog[0].id), false);
  assert.equal(FQ.progress.gifts().owned, 9);
  assert.deepEqual(JSON.parse(local.get('flagquiz.v1')).gifts.owned, Array.from(catalog, g => g.id));
  FQ.storage.resetProgress();
  assert.deepEqual([...FQ.storage.giftState().owned], []);
});

test('3×3 투명 스프라이트를 서비스 워커가 셸 자산으로 오프라인 저장한다', () => {
  const png = fs.readFileSync(new URL('../assets/gifts-sprite.png', import.meta.url));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1254);
  assert.equal(png.readUInt32BE(20), 1254);
  assert.equal(png[25], 6, 'RGBA PNG');
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /SHELL = \[[\s\S]*'\.\/assets\/gifts-sprite\.png'/);
});
