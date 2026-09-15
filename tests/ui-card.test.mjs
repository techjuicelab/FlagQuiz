import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture() {
  let modal;
  const c = {document: {addEventListener() {}, querySelector: () => null, body: {appendChild: el => {modal = el;}},
    createElement: () => ({addEventListener() {}, querySelector: () => null})}};
  c.window = c; vm.createContext(c);
  for (const f of ['js/storage.js', 'js/features.js', 'data/countries.js', 'data/subjects.js', 'js/ui.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), c);
  }
  c.FQ.quiz = {LEVEL_LABEL: {1: '쉬움'}};
  c.FQ.audio = {stopSpeaking() {}};
  return {f: c.FQ, render(code = 'kr') {c.FQ.ui.countryModal(c.FQ.countries.find(x => x.code === code)); return modal.innerHTML;}};
}

test('도감 그림을 켜기 전 HTML은 그대로이며 켜면 설명과 국기 힌트 사이에만 그림을 붙인다', () => {
  const {f, render} = fixture();
  const before = render();
  assert.ok(!before.includes('country-art'));
  f.storage.updateSettings({dev: {art: true}});
  const after = render();
  assert.equal(after.replace(/<figure class="country-art">[\s\S]*?<\/figure>/, ''), before);
  assert.match(after, /images\/symbols\/kr.webp/);
  assert.match(after, /alt="김치"/);
  assert.ok(after.indexOf('fact-box') < after.indexOf('country-art'));
  assert.ok(after.indexOf('country-art') < after.indexOf('hint-box'));
  delete f.features;
  assert.equal(render(), before);
});

test('누락 자료는 그림을 만들지 않고 제목의 HTML을 이스케이프한다', () => {
  const {f, render} = fixture();
  f.storage.updateSettings({dev: {art: true}});
  delete f.subjects.kr.symbol;
  assert.ok(!render().includes('country-art'));
  assert.equal(f.ui.artFor('zz'), null);
  f.subjects.kr.symbol = {ko: '<img onerror="bad">'};
  assert.match(render(), /&lt;img onerror=&quot;bad&quot;&gt;/);
  assert.ok(!render().includes('alt="<img'));
  assert.equal(f.ui.artFor('ae', 'place'), null);
  assert.equal(f.ui.artFor('kr', 'place').src, 'images/places/kr.webp');
});
