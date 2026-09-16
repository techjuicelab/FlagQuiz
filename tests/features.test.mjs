import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture({ saved, blocked = false, storage = true } = {}) {
  const values = new Map(saved === undefined ? [] : [['flagquiz.v1', JSON.stringify(saved)]]);
  const context = { localStorage: {
    getItem(key) { if (blocked) throw new Error('blocked'); return values.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw new Error('blocked'); values.set(key, value); }
  } };
  context.window = context;
  vm.createContext(context);
  const load = (file) => vm.runInContext(fs.readFileSync(new URL('../js/' + file, import.meta.url), 'utf8'), context);
  if (storage) load('storage.js');
  load('features.js');
  return { context, values, load };
}

test('그림 플래그는 호출 시 설정을 읽고 저장소 재시작 뒤에도 유지된다', () => {
  const { context: c, load } = fixture();
  // 검수를 마친 그림은 기본으로 켜져 있고, 끄는 것도 개발 설정으로만 한다.
  assert.equal(c.FQ.features.on('art'), true);
  assert.equal(c.FQ.features.on('unknown'), false);
  c.FQ.storage.updateSettings({ dev: { art: false } });
  assert.equal(c.FQ.features.on('art'), false);
  load('storage.js');
  assert.equal(c.FQ.features.on('art'), false);
  c.FQ.storage.updateSettings({ dev: {} });
  assert.equal(c.FQ.features.on('art'), true);
});

test('옛 설정에는 dev가 백필되고 불리언 외의 플래그 값은 기본값을 덮지 못한다', () => {
  const { context: c } = fixture({ saved: { settings: { sound: false } } });
  assert.equal(c.FQ.storage.settings().sound, false);
  assert.equal(typeof c.FQ.storage.settings().dev, 'object');
  // 'false' 나 0 처럼 꺼진 것처럼 보이는 값이 기본값을 끄면 아이 화면에서 그림이 통째로 사라진다.
  for (const art of ['false', 0, '', null, 1, {}]) {
    c.FQ.storage.updateSettings({ dev: { art } });
    assert.equal(c.FQ.features.on('art'), true, JSON.stringify(art));
  }
});

test('저장소가 차단되거나 아직 없어도 기본 그림 플래그를 안전하게 읽는다', () => {
  assert.equal(fixture({ blocked: true }).context.FQ.features.on('art'), true);
  const { context: c, load } = fixture({ storage: false });
  assert.equal(c.FQ.features.on('art'), true);
  let reads = 0;
  c.FQ.storage = { settings() { reads++; return { dev: { art: false } }; } };
  load('features.js');
  assert.equal(reads, 0, '모듈 로드 시 저장소를 읽지 않는다');
  assert.equal(c.FQ.features.on('art'), false);
  assert.equal(reads, 1);
});
