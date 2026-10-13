import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture({ map = false } = {}) {
  let modal, main;
  let writes = 0, aborted = 0, stopped = 0;
  const saved = new Map(), spoken = [], releases = [];
  const document = {
    listeners: {}, activeElement: null,
    addEventListener(type, callback, capture) { this.listeners[type] = { callback, capture }; },
    querySelector: sel => sel === '.modal-back' ? modal : null,
    getElementById: id => id === 'main' ? main : null,
    body: { style: { overflow: 'auto' }, appendChild: el => { modal = el; el.isConnected = true; } },
    createElement: () => createElement()
  };
  function createElement(attrs = {}) {
    return {
      attrs, listeners: {}, buttons: [], style: {}, hidden: false, offsetParent: {}, isConnected: true,
      addEventListener(type, listener) { this.listeners[type] = listener; },
      removeEventListener(type) { delete this.listeners[type]; },
      getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null; },
      setAttribute(name, value) { this.attrs[name] = value; },
      closest(selector) {
        if (selector.startsWith('[')) return Object.hasOwn(this.attrs, selector.slice(1, -1)) ? this : null;
        if (selector.startsWith('.')) return (this.attrs.class || '').split(' ').includes(selector.slice(1)) ? this : null;
        return null;
      },
      focus() { document.activeElement = this; },
      contains(target) { return target === this || this.buttons.includes(target) || target === this.status; },
      querySelector(selector) {
        if (selector === '[data-audio-status]') return this.status;
        return this.buttons.find(button => button.closest(selector)) || null;
      },
      querySelectorAll() { return this.buttons.filter(button => !Object.hasOwn(button.attrs, 'disabled')); },
      set innerHTML(html) {
        this.html = html;
        this.buttons = Array.from(html.matchAll(/<button\b([^>]*)>/g), match => {
          const attrs = {};
          for (const attr of match[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[attr[1]] = attr[2] ?? '';
          return createElement(attrs);
        });
        this.status = createElement({ 'data-audio-status': '' }); this.status.textContent = '';
      },
      get innerHTML() { return this.html || ''; },
      remove() { this.isConnected = false; this.buttons.forEach(button => { button.isConnected = false; }); if (modal === this) modal = null; }
    };
  }
  const opener = createElement({ id: 'country-card-kr' }); opener.focus();
  main = createElement({ id: 'main' });
  const c = {
    localStorage: {
      getItem: key => saved.get(key) || null,
      setItem(key, value) { saved.set(key, value); writes++; }
    }, document, scrollTo() {}
  };
  c.window = c; vm.createContext(c);
  const files = ['js/storage.js', 'js/features.js', 'data/countries.js', 'data/subjects.js'];
  if (map) files.push('data/map-coords.js', 'data/map-shapes.js', 'data/capital-coords.js', 'js/map.js');
  files.push('js/ui.js');
  for (const file of files) vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), c, { filename: file });
  c.FQ.quiz = { LEVEL_LABEL: { 1: '쉬움' } };
  c.FQ.audio = { stopSpeaking() { stopped++; }, setSpeakEnabled() {}, say(lines, options, onFail) { spoken.push({ lines: [...lines], onFail }); } };
  function click(button) { assert.ok(modal, '모달이 열려 있어야 한다'); modal.listeners.click({ target: button }); }
  return {
    f: c.FQ, document, opener, spoken, releases,
    render(code = 'kr') { c.FQ.ui.countryModal(c.FQ.countries.find(x => x.code === code)); return modal.innerHTML; },
    imageError(image) { assert.equal(c.document.listeners.error.capture, true); c.document.listeners.error.callback({ target: image }); },
    close() { click(modal.querySelector('[data-close-modal]')); assert.equal(modal, null, '닫기 버튼이 실제 모달을 제거해야 한다'); },
    click,
    key(key, shiftKey = false) { let prevented = false; document.listeners.keydown.callback({ key, shiftKey, preventDefault() { prevented = true; } }); return prevented; },
    deferSpeech() { c.FQ.speech = { abort() { aborted++; }, stopAnd(callback) { releases.push(callback); } }; },
    writes: () => writes, aborted: () => aborted, stopped: () => stopped,
    modal: () => modal
  };
}

test('대표 그림을 끄면 설명을 보존하고 켜면 설명과 국기 힌트 사이에만 그림을 붙인다', () => {
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

test('CSP가 인라인 이벤트를 허용하지 않아도 도감의 깨진 그림은 감추고 설명을 남긴다', () => {
  const {f, render, imageError} = fixture();
  f.storage.updateSettings({dev: {art: true}});
  const html = render();
  assert.doesNotMatch(html, /\sonerror="/);
  assert.equal((html.match(/data-country-art=""/g) || []).length, 2);
  for (let n = 0; n < 2; n++) {
    const img = { hidden: false, style: {}, getAttribute: name => name === 'data-country-art' ? '' : null };
    imageError(img);
    assert.equal(img.hidden, true);
    assert.equal(img.style.display, 'none', 'hidden 속성만으로는 .country-art img { display: block } 에 밀려 깨진 그림이 보인다');
  }
  const other = { hidden: false, style: {}, getAttribute: () => null };
  imageError(other);
  assert.equal(other.hidden, false);
});

test('도감의 수도 줄에는 듣기 단추가 있고 누르면 수도 이름과 설명 두 문구를 읽는다', () => {
  const {f, render, modal} = fixture();
  const spoken = [];
  f.audio.say = (lines) => spoken.push([...lines]);
  f.audio.setSpeakEnabled = () => {};
  const html = render('kr');
  assert.match(html, /<section class="country-detail-capital" aria-label="수도">[\s\S]*<strong class="country-detail-capital-name">서울<\/strong>[\s\S]*<span class="country-detail-capital-en muted">Seoul<\/span>[\s\S]*data-speak-art="서울" data-speak-extra="대한민국의 수도예요"[\s\S]*🔊 수도 듣기/);
  const attrs = {'data-speak-art': '서울', 'data-speak-extra': '대한민국의 수도예요'};
  const button = {getAttribute: (k) => attrs[k], closest: sel => sel === '[data-speak-art]' ? button : null};
  modal().listeners.click({target: button});
  assert.deepEqual(spoken, [['서울', '대한민국의 수도예요']]);
});

test('나라 상세는 수도를 먼저 강조하고 세계 위치·주변 지도·실제 국가 영역을 함께 보여 준다', () => {
  const f = fixture({ map: true });
  for (const code of ['kr', 'va', 'nz', 'gq']) {
    const country = f.f.countries.find(item => item.code === code);
    const html = f.render(code);
    assert.match(html, /class="country-detail-capital-name"/);
    assert.ok(html.indexOf('country-detail-capital-name') < html.indexOf('country-detail-fact'));
    assert.ok(html.includes(f.f.ui.esc(country.capital)));
    assert.match(html, /class="country-detail-map"/);
    assert.match(html, /세계에서 어디일까요/);
    assert.ok(html.includes(country.ko + ' 주변을 크게 보기'));
    assert.ok(html.includes('d="' + f.f.mapRegions[code].d + '"'), code + ' 실제 국가 외곽');
    assert.match(html, /fill-rule="evenodd"/);
    assert.match(html, /class="map-capital-marker"/);
    assert.ok(html.includes('data-capital-lng="' + f.f.capitalCoords[code][0] + '" data-capital-lat="' + f.f.capitalCoords[code][1] + '"'), code + ' 수도 원좌표');
    assert.ok(html.includes('별표는 수도 ' + country.capital + '의 실제 위치입니다.'));
    assert.doesNotMatch(html, /class="map-pin answer-btn"/, '상세 지도는 채점 보기가 아니다');
    if (code === 'va') assert.match(html, /class="map-inset"/, '세계지도보다 작은 나라도 실제 윤곽을 크게 본다');
    f.close();
  }
});

test('상세 모달 제목을 읽을 수 있고 Tab·Shift+Tab이 안에서 순환하며 Escape는 초점과 스크롤을 복원한다', () => {
  const f = fixture(), html = f.render('kr'), back = f.modal();
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="country-detail-title-kr" tabindex="-1"/);
  assert.match(html, /<h2[^>]*id="country-detail-title-kr">대한민국<\/h2>/);
  assert.equal(f.document.activeElement, back.querySelector('.country-detail-dismiss'));
  assert.equal(f.document.body.style.overflow, 'hidden');
  const first = back.buttons[0], last = back.buttons.at(-1);
  last.focus(); assert.equal(f.key('Tab'), true); assert.equal(f.document.activeElement, first);
  first.focus(); assert.equal(f.key('Tab', true), true); assert.equal(f.document.activeElement, last);
  f.opener.focus(); assert.equal(f.key('Tab'), true); assert.equal(f.document.activeElement, first);
  f.opener.focus(); assert.equal(f.key('Tab', true), true); assert.equal(f.document.activeElement, last);
  assert.equal(f.key('Escape'), true);
  assert.equal(f.modal(), null); assert.equal(f.document.activeElement, f.opener);
  assert.equal(f.document.body.style.overflow, 'auto');
});

test('배경을 누르거나 화면을 바꾸면 모달을 닫고 기존 스크롤 상태를 되돌린다', () => {
  const f = fixture(); f.render(); f.click(f.modal());
  assert.equal(f.modal(), null); assert.equal(f.document.activeElement, f.opener);
  assert.equal(f.document.body.style.overflow, 'auto');
  f.render('jp'); f.f.ui.setMain('<section>처음 화면</section>');
  assert.equal(f.modal(), null, '다른 화면 위에 이전 나라 상세를 남기지 않는다');
  assert.equal(f.document.body.style.overflow, 'auto');
});

test('모달을 닫은 뒤 늦게 끝난 마이크 해제 콜백은 음성을 시작하지 않는다', () => {
  const f = fixture(); f.deferSpeech(); f.render('kr');
  f.click(f.modal().querySelector('[data-speak-art]'));
  assert.equal(f.releases.length, 1); assert.equal(f.spoken.length, 0);
  f.close(); f.releases[0]();
  assert.equal(f.spoken.length, 0);
  assert.ok(f.aborted() >= 2); assert.ok(f.stopped() >= 2);
  assert.equal(f.document.activeElement, f.opener);
});

test('다른 나라 상세와 새 듣기를 열면 이전 요청을 버리고 최신 나라의 선택한 설명만 읽는다', () => {
  const f = fixture(); f.deferSpeech(); f.render('kr');
  const old = f.modal(); f.click(old.querySelector('[data-speak]'));
  f.render('jp');
  assert.equal(old.isConnected, false);
  f.releases[0](); assert.equal(f.spoken.length, 0);
  f.click(f.modal().querySelector('[data-speak]'));
  f.click(f.modal().querySelector('[data-speak-art]'));
  f.releases[1](); assert.equal(f.spoken.length, 0, '더 최근에 누른 수도 듣기가 이름 듣기를 취소한다');
  f.releases[2]();
  assert.deepEqual(f.spoken.map(item => item.lines), [['도쿄', '일본의 수도예요']]);
  const lateFailure = f.spoken[0].onFail;
  f.close(); f.render('fr'); lateFailure();
  assert.equal(f.modal().querySelector('[data-audio-status]').textContent, '', '이전 재생 실패가 새 나라 안내를 덮지 않는다');
});

test('화면이 숨겨진 뒤 마이크 해제가 끝나도 상세 음성을 시작하지 않는다', () => {
  const f = fixture(); f.deferSpeech(); f.render('kr');
  f.click(f.modal().querySelector('[data-speak-art]'));
  f.document.hidden = true; f.releases[0]();
  assert.equal(f.spoken.length, 0);
});
