import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture() {
  let modal;
  let writes = 0;
  const saved = new Map();
  const c = {
    localStorage: {
      getItem: key => saved.get(key) || null,
      setItem(key, value) { saved.set(key, value); writes++; }
    },
    document: {addEventListener() {}, querySelector: sel => sel === '.modal-back' ? modal : null,
      body: {appendChild: el => {modal = el;}},
      createElement: () => ({
        listeners: {},
        addEventListener(type, listener) { this.listeners[type] = listener; },
        querySelector: () => null,
        remove() { if (modal === this) modal = null; }
      })}
  };
  c.window = c; vm.createContext(c);
  for (const f of ['js/storage.js', 'js/features.js', 'data/countries.js', 'data/subjects.js', 'js/ui.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), c);
  }
  c.FQ.quiz = {LEVEL_LABEL: {1: '쉬움'}};
  c.FQ.audio = {stopSpeaking() {}};
  return {
    f: c.FQ,
    render(code = 'kr') {c.FQ.ui.countryModal(c.FQ.countries.find(x => x.code === code)); return modal.innerHTML;},
    close() {
      const button = {closest: sel => sel === '[data-close-modal]' ? button : null};
      modal.listeners.click({target: button});
      assert.equal(modal, null, '닫기 버튼이 실제 모달을 제거해야 한다');
    },
    writes: () => writes
  };
}

test('도감 그림을 끄면 HTML은 예전 그대로이며 켜면 설명과 국기 힌트 사이에만 그림을 붙인다', () => {
  const {f, render} = fixture();
  f.storage.updateSettings({dev: {art: false}});
  const before = render();
  assert.ok(!before.includes('country-art'));
  f.storage.updateSettings({dev: {art: true}});
  const after = render();
  assert.equal(after.replace(/<figure class="country-art">[\s\S]*?<\/figure>/g, ''), before);
  assert.match(after, /images\/symbols\/kr.webp/);
  assert.match(after, /images\/places\/kr.webp/);
  assert.match(after, /나라 대표 명소 · 광화문/);
  assert.match(after, /alt="김치"/);
  assert.ok(after.indexOf('fact-box') < after.indexOf('country-art'));
  assert.ok(after.indexOf('country-art') < after.indexOf('hint-box'));
  delete f.features;
  assert.equal(render(), before);
});

test('누락 자료는 그림을 만들지 않고 제목의 HTML을 이스케이프한다', () => {
  const {f, render} = fixture();
  delete f.subjects.kr.symbol;
  assert.ok(!render().includes('images/symbols/kr.webp'));
  assert.ok(render().includes('images/places/kr.webp'));
  assert.equal(f.ui.artFor('zz'), null);
  f.subjects.kr.symbol = {ko: '<img onerror="bad">'};
  assert.match(render(), /&lt;img onerror=&quot;bad&quot;&gt;/);
  assert.ok(!render().includes('alt="<img'));
  assert.equal(f.ui.artFor('ae', 'place'), null);
  assert.equal(f.ui.artFor('kr', 'place').src, 'images/places/kr.webp');
  assert.ok(!render('ae').includes('images/places/'));
});

for (const mapOnly of [false, true]) {
  test((mapOnly ? '지도만 푼 나라' : '미방문 나라') + '의 도감을 열고 닫아도 국기 기록과 저장 상태를 바꾸지 않는다', () => {
    const {f, render, close, writes} = fixture();
    if (mapOnly) f.storage.recordAnswer('kr', true, 'map');
    assert.equal(Object.keys(f.storage.allCountryStats()).length, 0);
    const before = f.storage.exportJson();
    const writesBefore = writes();

    assert.ok(!render('kr').includes('<b>내 기록</b>'));
    close();

    assert.equal(Object.keys(f.storage.allCountryStats()).length, 0);
    assert.equal(f.storage.exportJson(), before, '국기 기록뿐 아니라 다른 축과 설정도 그대로여야 한다');
    assert.equal(writes(), writesBefore, '조회 동작은 localStorage에 쓰지 않아야 한다');
  });
}

test('기존 국기 기록은 도감에 표시하면서 그대로 보존한다', () => {
  const {f, render, close, writes} = fixture();
  f.storage.recordAnswer('kr', true);
  f.storage.recordAnswer('kr', false);
  const before = f.storage.exportJson();
  const writesBefore = writes();

  assert.match(render('kr'), /<b>내 기록<\/b><span>2번 중 1번 정답 \(50%\)<\/span>/);
  close();

  assert.equal(f.storage.exportJson(), before);
  assert.equal(writes(), writesBefore);
});
