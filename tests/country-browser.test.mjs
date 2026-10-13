import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

// 공개 화면 진입점과 위임 이벤트만 사용한다. 검색 구현의 내부 필터에는 접근하지 않는다.
function fixture() {
  const saved = new Map(), nodes = new Map(), opened = [];
  let writes = 0, homeCalls = 0, bindings = [], mainHTML = '';
  const makeNode = (attrs = {}) => ({
    attrs, value: '', innerHTML: '', textContent: '', disabled: false, focusCount: 0,
    classes: new Set(),
    getAttribute(key) { return this.attrs[key] ?? null; },
    setAttribute(key, value) { this.attrs[key] = String(value); },
    focus() { this.focusCount++; },
    classList: { toggle() {} }
  });
  const main = makeNode();
  let continents = [];
  const context = {
    document: { addEventListener() {} },
    localStorage: { getItem: key => saved.get(key) ?? null, setItem(key, value) { saved.set(key, String(value)); writes++; } }
  };
  context.window = context; vm.createContext(context);
  for (const file of ['js/storage.js', 'data/countries.js', 'js/ui.js']) vm.runInContext(read(file), context, { filename: file });
  Object.assign(context.FQ.ui, {
    setMain(html) {
      mainHTML = html; bindings = []; nodes.clear();
      for (const selector of ['#country-browser-search', '#country-browser-results', '#country-browser-status', '[data-country-browser-clear]']) nodes.set(selector, makeNode());
      // input.value는 브라우저가 HTML 속성에서 복원하는 값에 맞춘다.
      nodes.get('#country-browser-search').value = html.match(/id="country-browser-search"[^>]*value="([^"]*)"/)[1]
        .replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
      continents = Array.from(html.matchAll(/data-country-browser-continent="([^"]+)"/g), match => makeNode({ 'data-country-browser-continent': match[1] }));
      return main;
    },
    $(selector) { return nodes.get(selector) || null; },
    $$(selector) { return selector === '[data-country-browser-continent]' ? continents : []; },
    on(root, selector, event, callback) { bindings.push({ selector, event, callback }); },
    countryModal(country) { opened.push(country); }
  });
  context.FQ.app = { home() { homeCalls++; } };
  vm.runInContext(read('js/country-browser.js'), context, { filename: 'js/country-browser.js' });
  function fire(selector, event = 'click', target = makeNode()) {
    const binding = bindings.find(item => item.selector === selector && item.event === event);
    assert.ok(binding, selector + ' 이벤트가 연결되어야 한다');
    binding.callback({ target }, target);
  }
  function search(value) {
    const input = nodes.get('#country-browser-search'); input.value = value;
    fire('#country-browser-search', 'input', input);
  }
  function filter(continent) { fire('[data-country-browser-continent]', 'click', makeNode({ 'data-country-browser-continent': continent })); }
  function openCountry(code) { fire('[data-country-browse]', 'click', makeNode({ 'data-code': code })); }
  const resultHTML = () => nodes.get('#country-browser-results').innerHTML;
  return {
    fq: context.FQ, open: () => context.FQ.countryBrowser.open(), search, filter, openCountry, fire, opened,
    node: selector => nodes.get(selector), resultHTML,
    codes: () => Array.from(resultHTML().matchAll(/data-country-browse data-code="([^"]+)"/g), match => match[1]),
    mainHTML: () => mainHTML, continents: () => continents, writes: () => writes, homeCalls: () => homeCalls
  };
}

test('기록이나 구매 조건 없이 194개 나라의 국기·이름·수도를 보고 모든 상세 정보를 열 수 있다', () => {
  const f = fixture(), before = f.fq.storage.exportJson(), writes = f.writes();
  f.open();
  assert.equal(f.codes().length, 194);
  assert.equal(new Set(f.codes()).size, 194);
  assert.equal(f.codes()[0], 'kr');
  assert.equal(f.node('#country-browser-status').textContent, '194개 나라');
  assert.equal(f.node('[data-country-browser-clear]').disabled, true);
  for (const country of f.fq.countries) {
    const card = f.resultHTML().match(new RegExp('<button[^>]*data-code="' + country.code + '"[\\s\\S]*?</button>'))?.[0];
    assert.ok(card, country.code + ' 공부 카드');
    assert.ok(card.includes('flags/' + country.code + '.svg'));
    assert.ok(card.includes('class="country-browser-name">' + f.fq.ui.esc(country.ko)));
    assert.ok(card.includes('class="country-browser-capital">' + f.fq.ui.esc(country.capital)));
    assert.ok(card.includes('aria-label="' + f.fq.ui.esc(country.ko + ', 수도 ' + country.capital + ', 나라 정보 보기') + '"'));
    assert.doesNotMatch(card, /disabled|data-locked|구매|잠금/);
    f.openCountry(country.code);
    assert.equal(f.opened.at(-1).code, country.code);
  }
  f.openCountry('missing');
  assert.equal(f.opened.length, 194, '알 수 없는 코드는 다른 나라 상세로 연결하지 않는다');
  assert.equal(f.fq.storage.exportJson(), before);
  assert.equal(f.writes(), writes, '공부 목록 조회와 상세 열기는 기록이나 설정을 쓰지 않는다');
});

test('한글·영문 나라 이름과 한글·영문 수도·별칭으로 원하는 나라를 찾는다', () => {
  const f = fixture(); f.open();
  for (const country of f.fq.countries) {
    f.search(country.ko);
    assert.ok(f.codes().includes(country.code), country.ko + ' 나라 이름 검색');
    f.search(country.capital);
    assert.ok(f.codes().includes(country.code), country.capital + ' 수도 검색');
  }
  for (const [query, expected] of [['  seOUL  ', 'kr'], ['KOREA', 'kr'], ['한국', 'kr'], ['London', 'gb'], ['FRANCE', 'fr'], ['Côte d’Ivoire', 'ci']]) {
    f.search(query);
    assert.ok(f.codes().includes(expected), query + ' 검색');
  }
  for (const code of ['kr', 'gb', 'ci']) {
    const country = f.fq.countries.find(item => item.code === code);
    for (const alias of country.aliases) { f.search(alias); assert.ok(f.codes().includes(code), alias + ' 별칭 검색'); }
  }
});

test('대륙 필터는 해당 나라만 보여 주고 선택 상태를 읽을 수 있으며 검색 조건과 함께 적용된다', () => {
  const f = fixture(); f.open();
  for (const continent of ['아시아', '유럽', '아프리카', '북아메리카', '남아메리카', '오세아니아']) {
    f.filter(continent);
    assert.deepEqual(f.codes().slice().sort(), Array.from(f.fq.countries.filter(country => country.continent === continent), country => country.code).sort());
    assert.equal(f.continents().filter(button => button.getAttribute('aria-pressed') === 'true').length, 1);
    assert.equal(f.continents().find(button => button.getAttribute('data-country-browser-continent') === continent).getAttribute('aria-pressed'), 'true');
    assert.ok(f.node('#country-browser-status').textContent.endsWith(' · ' + continent));
  }
  f.filter('아시아'); f.search('서울'); assert.deepEqual(f.codes(), ['kr']);
  f.filter('유럽'); assert.deepEqual(f.codes(), []);
  assert.match(f.resultHTML(), /찾는 나라가 아직 보이지 않아요/);
  f.filter('없는 대륙'); assert.deepEqual(f.codes(), [], '잘못된 필터 입력으로 전체 목록이 열리지 않는다');
});

test('결과가 없어도 모든 나라 보기로 복구하고 검색 지우기는 선택한 대륙을 보존한다', () => {
  const f = fixture(); f.open(); f.filter('유럽'); f.search('서울');
  assert.deepEqual(f.codes(), []); assert.match(f.resultHTML(), /data-country-browser-reset/);
  const input = f.node('#country-browser-search');
  f.fire('[data-country-browser-clear]');
  assert.equal(input.value, ''); assert.equal(input.focusCount, 1);
  assert.ok(f.codes().length > 0 && f.codes().length < 194);
  assert.ok(f.node('#country-browser-status').textContent.endsWith('유럽'));
  f.search('없는나라xyz'); f.fire('[data-country-browser-reset]');
  assert.equal(f.codes().length, 194); assert.equal(input.value, ''); assert.equal(input.focusCount, 2);
  assert.equal(f.node('#country-browser-status').textContent, '194개 나라');
});

test('검색 중 입력란을 교체하지 않고 상세와 홈을 다녀와도 검색어·대륙을 이어 본다', () => {
  const f = fixture(); f.open(); const input = f.node('#country-browser-search');
  f.filter('아시아'); f.search('서울');
  assert.equal(f.node('#country-browser-search'), input, '한글 조합 중인 입력란을 다시 만들지 않는다');
  f.openCountry('kr'); f.fire('[data-country-browser-home]');
  assert.equal(f.homeCalls(), 1);
  f.open();
  assert.equal(f.node('#country-browser-search').value, '서울');
  assert.deepEqual(f.codes(), ['kr']);
  assert.equal(f.continents().find(button => button.getAttribute('data-country-browser-continent') === '아시아').getAttribute('aria-pressed'), 'true');
  f.openCountry('kr');
  assert.equal(f.opened.length, 2, '재진입 후 카드 한 번 누르기로 상세 한 번만 연다');
});

test('검색어를 화면에 다시 넣을 때 HTML을 실행하지 않고 검색 결과 수를 접근성 상태로 안내한다', () => {
  const f = fixture(); f.open();
  f.search('\"><img src=x onerror=alert(1)>'); f.open();
  assert.doesNotMatch(f.mainHTML(), /<img src=x/);
  assert.match(f.mainHTML(), /value="&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;"/);
  assert.match(f.mainHTML(), /id="country-browser-status" role="status" aria-live="polite" aria-atomic="true"/);
  assert.equal(f.node('#country-browser-status').textContent, '0개 나라');
});
