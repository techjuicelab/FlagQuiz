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
  const attrs = {};
  return {
    id, value: '', selectCalls: 0, hidden: false, attrs,
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return name in attrs ? attrs[name] : null; },
    focus() { this.focused = true; },
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
    change(checked) { this.checked = checked; for (const callback of listeners.get('change') || []) callback({ target: this }); },
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
  f.load('data/countries.js', 'data/subjects.js', 'js/features.js', 'js/progress.js', 'js/quiz.js', 'js/badges.js', 'js/ui.js', 'js/screens.js');
  return { ...f, main, node: selector => main.querySelector(selector) };
}

test('194개 국기 스티커 안의 새 도장은 학습 축별 정답만 읽고 기존 기록을 변경하지 않는다', () => {
  const f = screenFixture();
  f.storage.updateSettings({ dev: { art: true } });
  f.storage.recordAnswer('kr', true, 'symbol');
  f.storage.recordAnswer('kr', false, 'place');
  f.storage.recordAnswer('kr', true, 'map');
  f.storage.recordAnswer('kr', true, 'capital');
  const before = f.storage.exportJson();
  f.c.FQ.screens.dex('all');
  const html = f.node('#dex-list').innerHTML;
  assert.equal((html.match(/class="sticker-cell /g) || []).length, 194);
  const kr = html.match(/<button class="sticker-cell [^>]*data-code="kr"[\s\S]*?<\/button>/)[0];
  assert.match(kr, /sticker-cell locked/);
  assert.match(kr, /axis-stamp earned" data-axis="symbol"/);
  assert.match(kr, /axis-stamp" data-axis="place"/);
  assert.match(kr, /axis-stamp earned" data-axis="map"/);
  // 도장은 넷: 🎨 그림 · 🏞️ 명소 · 📍 위치 · 🏙️ 수도 (2026-09-17 D17 채택 B). 수도 정답은 국기 스티커를 열지 않는다.
  assert.match(kr, /axis-stamp earned" data-axis="capital" title="수도 도장 획득" aria-label="수도 도장 획득">🏙️<\/span>/);
  assert.equal((kr.match(/ data-axis="/g) || []).length, 4, '칸 안 도장은 넷');
  assert.equal(f.c.FQ.progress.stickers().owned, 0);
  assert.equal(f.storage.exportJson(), before);
  assert.equal(JSON.parse(before).axes.capital.kr.correct, 1, '내보내기 JSON 에 capital 축이 들어간다');
  f.storage.updateSettings({ dev: { art: false } });
  f.c.FQ.screens.dex('all');
  assert.doesNotMatch(f.node('#dex-list').innerHTML, /data-axis="(?:symbol|place)"/);
  assert.match(f.node('#dex-list').innerHTML, /data-axis="map"/);
  assert.match(f.node('#dex-list').innerHTML, /data-axis="capital"/, '수도 도장은 그림을 꺼도 보인다');
});

test('놀이별 기록은 국기·그림·명소·위치·수도를 따로 집계하며 오래된 빈 레코드도 0으로 읽는다', () => {
  const seed = fixture();
  const saved = JSON.parse(seed.storage.exportJson());
  saved.axes = { symbol: { kr: { seen: 2, correct: 1 }, jp: {} }, map: { au: { seen: 1 } }, capital: { mx: { seen: 3, correct: 2, wrong: 1 } } };
  const f = screenFixture({ saved: JSON.stringify(saved) });
  f.storage.recordAnswer('fr', true);
  const before = f.storage.exportJson();
  f.c.FQ.screens.stats();
  assert.match(f.main.innerHTML, /data-axis="symbol"[\s\S]*?1개국 · 2문제[\s\S]*?정답 1개 · 50%/);
  assert.match(f.main.innerHTML, /data-axis="map"[\s\S]*?1개국 · 1문제[\s\S]*?정답 0개 · 0%/);
  assert.match(f.main.innerHTML, /data-axis="place"[\s\S]*?0개국 · 0문제/);
  assert.match(f.main.innerHTML, /data-axis="flag"[\s\S]*?1개국 · 1문제/);
  assert.match(f.main.innerHTML, /data-axis="capital"><b>🏙️ 수도<\/b><div>1개국 · 3문제<\/div><div class="small muted">정답 2개 · 67%/);
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

test('딸 수 없는 도장은 도감에 아예 그리지 않는다', () => {
  // 그림이 보류된 나라와 명소가 없는 나라는 그 축으로 출제되지 않는다.
  // 도장 자리를 남겨 두면 아이가 영원히 못 채우는 칸이 된다.
  const f = screenFixture();
  const heldCode = f.c.FQ.countries.find((country) => f.c.FQ.subjects[country.code]?.symbol)?.code;
  assert.ok(heldCode, '보류 도장 동작을 검증할 상징물 소재가 없다');
  f.c.FQ.subjects[heldCode].symbol.noArt = true;
  f.storage.updateSettings({ dev: { art: true } });
  f.c.FQ.screens.dex('all');
  const html = f.node('#dex-list').innerHTML;
  const subjects = f.c.FQ.subjects;
  const cellOf = (code) => html.match(new RegExp('<button class="sticker-cell [^>]*data-code="' + code + '"[\\s\\S]*?</button>'))[0];
  const earnable = (code, axis) => !!subjects[code]?.[axis] && !subjects[code][axis].noArt;

  let checkedHeld = 0, checkedNoPlace = 0;
  for (const c of f.c.FQ.countries) {
    const cell = cellOf(c.code);
    for (const axis of ['symbol', 'place']) {
      const has = cell.includes('data-axis="' + axis + '"');
      assert.equal(has, earnable(c.code, axis), c.code + ' 의 ' + axis + ' 도장 표시가 출제 가능 여부와 어긋난다');
      if (axis === 'symbol' && !earnable(c.code, axis)) checkedHeld += 1;
      if (axis === 'place' && !earnable(c.code, axis)) checkedNoPlace += 1;
    }
    // 위치·수도 도장은 194개국 모두 딸 수 있다.
    assert.ok(cell.includes('data-axis="map"'), c.code + ' 에 위치 도장이 없다');
    assert.ok(cell.includes('data-axis="capital"'), c.code + ' 에 수도 도장이 없다');
  }
  assert.equal(checkedHeld, 1, '주입한 보류 상징물의 도장만 숨겨야 한다');
  assert.ok(checkedNoPlace > 0, '이 검사는 명소 없는 나라가 있을 때를 고정한다');
});

test('새로 만날 스티커가 비었을 때 조사가 맞고 아직 못 찍은 도장 수를 말해 준다', () => {
  const f = screenFixture();
  const FQ = f.c.FQ;
  const subjects = FQ.subjects;
  const earnable = (code, axis) => axis === 'map' || axis === 'capital' || (!!subjects[code]?.[axis] && !subjects[code][axis].noArt);
  const europe = FQ.countries.filter((c) => c.continent === '유럽');
  for (const c of europe) f.storage.recordAnswer(c.code, true);
  f.storage.updateSettings({ dev: { art: true } });

  f.c.FQ.screens.dex('유럽');
  f.node('#dex-locked').change(true);
  let html = f.node('#dex-list').innerHTML;
  assert.match(html, /유럽을 모두 모았어요/, '유럽 뒤에는 「을」');
  assert.doesNotMatch(html, /유럽를/);
  let left = 0;
  for (const c of europe) for (const axis of ['symbol', 'place', 'map', 'capital']) if (earnable(c.code, axis)) left += 1;
  assert.match(html, new RegExp('못 찍은 도장이 ' + left + '개 있어요'));
  assert.match(html, /그림·명소·위치·수도 놀이로 찍어 볼까요/);
  assert.doesNotMatch(html, /못 모은 칸이 하나도 없어요/, '도장이 남았는데 다 끝났다고 말하면 안 된다');

  // 도장을 몇 개 찍으면 남은 수가 줄고, 그림을 끄면 그림·명소 도장은 세지 않는다
  f.storage.recordAnswer(europe[0].code, true, 'map');
  f.c.FQ.screens.dex('유럽');
  f.node('#dex-locked').change(true);
  assert.match(f.node('#dex-list').innerHTML, new RegExp('못 찍은 도장이 ' + (left - 1) + '개 있어요'));
  f.storage.updateSettings({ dev: { art: false } });
  f.c.FQ.screens.dex('유럽');
  f.node('#dex-locked').change(true);
  html = f.node('#dex-list').innerHTML;
  // 그림을 꺼도 위치·수도 도장은 남는다: 유럽 나라 수 × 2 에서 방금 찍은 위치 도장 하나를 뺀 수.
  assert.match(html, new RegExp('못 찍은 도장이 ' + (europe.length * 2 - 1) + '개 있어요'));
  assert.match(html, /위치·수도 놀이로 찍어 볼까요/);
  assert.doesNotMatch(html, /그림·명소/);

  // 받침 없는 대륙은 「를」. 전체는 194칸 국기 스티커라고 분명히 말한다.
  f.storage.updateSettings({ dev: { art: true } });
  const asia = FQ.countries.filter((c) => c.continent === '아시아');
  for (const c of asia) f.storage.recordAnswer(c.code, true);
  f.c.FQ.screens.dex('아시아');
  f.node('#dex-locked').change(true);
  assert.match(f.node('#dex-list').innerHTML, /아시아를 모두 모았어요/);
  for (const c of FQ.countries) f.storage.recordAnswer(c.code, true);
  f.c.FQ.screens.dex('all');
  f.node('#dex-locked').change(true);
  assert.match(f.node('#dex-list').innerHTML, /국기 스티커 194칸을 모두 모았어요/);
  for (const c of FQ.countries) for (const axis of ['symbol', 'place', 'map', 'capital']) if (earnable(c.code, axis)) f.storage.recordAnswer(c.code, true, axis);
  f.c.FQ.screens.dex('all');
  f.node('#dex-locked').change(true);
  assert.match(f.node('#dex-list').innerHTML, /못 모은 칸도, 못 찍은 도장도 하나도 없어요/);
});

test('내 기록 상단은 어느 수가 모든 놀이 합산이고 어느 수가 국기 놀이인지 문구로 밝힌다', () => {
  const f = screenFixture();
  f.storage.recordAnswer('kr', true);
  f.storage.recordAnswer('kr', false, 'symbol');
  f.storage.recordAnswer('jp', true, 'map');
  f.c.FQ.screens.stats();
  const html = f.main.innerHTML;
  assert.match(html, /<div class="v">3<\/div><div class="k">푼 문제 · 모든 놀이<\/div>/);
  assert.match(html, /<div class="v">67%<\/div><div class="k">정답률 · 모든 놀이<\/div>/);
  assert.match(html, /<div class="k">최고 연속 · 모든 놀이<\/div>/);
  assert.match(html, /<div class="v">1<\/div><div class="k">국기로 만난 나라<\/div>/);
  assert.match(html, /‘모든 놀이’는 국기·그림·명소·위치·수도 놀이를 모두 더한 수예요/);
  assert.match(html, /국기 놀이에서는 전체 194개국 중 1개국을 만났어요/);
});

test('그림을 끄면 놀이별 기록도 홈·도감처럼 그림·명소 축을 감춘다', () => {
  const f = screenFixture();
  f.storage.recordAnswer('kr', true, 'symbol');
  f.storage.updateSettings({ dev: { art: false } });
  f.c.FQ.screens.stats();
  let html = f.main.innerHTML;
  assert.match(html, /data-axis="flag"/);
  assert.match(html, /data-axis="map"/);
  assert.match(html, /data-axis="capital"/);
  assert.doesNotMatch(html, /data-axis="(?:symbol|place)"/);
  f.storage.updateSettings({ dev: { art: true } });
  f.c.FQ.screens.stats();
  html = f.main.innerHTML;
  assert.match(html, /data-axis="symbol"[\s\S]*?1개국 · 1문제/);
  assert.match(html, /data-axis="place"/);
});

test('스티커 판은 큰 숫자·굵은 진행바·대륙 알약 한 줄이고 검색·필터는 원형 단추로 접었다 편다', () => {
  const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  const f = screenFixture();
  f.storage.updateSettings({ dev: { art: true } });
  f.storage.recordAnswer('kr', true);
  f.storage.recordAnswer('kr', true, 'map');
  f.storage.recordAnswer('jp', false, 'symbol');
  const before = f.storage.exportJson();
  f.c.FQ.screens.dex('all');
  const html = f.main.innerHTML;
  assert.match(html, /<div class="card dex-count-card" role="group" aria-label="모은 스티커 1 \/ 194 · 193개 남았어요">/);
  assert.match(html, /<span class="v">1 <small>\/ 194<\/small><\/span><span class="stamps">도장 1개<\/span>/);
  assert.match(html, /<span class="dex-bar" aria-hidden="true"><i style="width:1%"><\/i><\/span>/);
  assert.match(html, /<button class="dex-back" id="back" type="button" aria-label="홈으로"><svg/);
  assert.match(html, /<button class="dex-toggle" id="dex-search-toggle" type="button" aria-label="나라 이름으로 찾기" aria-expanded="false" aria-controls="dex-tools"><svg/);
  assert.match(html, /<button class="dex-toggle" id="dex-filter-toggle" type="button" aria-label="한 번 더 만날 나라·새로 만날 스티커만 보기" aria-expanded="false" aria-controls="dex-filters"><svg/);
  assert.match(html, /<div class="dex-tools" id="dex-tools" hidden>[\s\S]*id="dex-q"/);
  assert.match(html, /<div class="dex-filters" id="dex-filters" hidden>[\s\S]*id="dex-wrong"[\s\S]*id="dex-locked"/);
  assert.match(html, /<div class="dex-conts">(<button class="pill" type="button" data-cont="[^"]+" aria-pressed="(?:true|false)">[^<]+<\/button>){7}<\/div>/);
  assert.doesNotMatch(html, /pill-grid|← 돌아가기|개 남았어요<\/span>/);
  // 모은 칸은 국기, 못 모은 칸은 회색 실루엣 + 자물쇠 — 진짜 국기를 흐리게 보여 주지 않는다.
  const list = f.node('#dex-list').innerHTML;
  const kr = list.match(/<button class="sticker-cell [^>]*data-code="kr"[\s\S]*?<\/button>/)[0];
  assert.match(kr, /^<button class="sticker-cell got" type="button" data-code="kr" aria-label="대한민국 · 모은 스티커"/);
  assert.match(kr, /<img src="flags\/kr\.svg" alt="대한민국 스티커" loading="lazy">/);
  assert.doesNotMatch(kr, /flag-ghost|class="lock"/);
  const jp = list.match(/<button class="sticker-cell [^>]*data-code="jp"[\s\S]*?<\/button>/)[0];
  assert.match(jp, /^<button class="sticker-cell locked" type="button" data-code="jp" aria-label="일본 · 아직 못 모은 스티커"/);
  assert.match(jp, /<span class="flag-ghost"><svg viewBox="0 0 92 62" aria-hidden="true">[\s\S]*<\/svg><span class="lock"><span><svg[\s\S]*<\/svg><\/span><\/span><\/span><div class="n">일본<\/div>/);
  assert.doesNotMatch(jp, /flags\/jp\.svg/);
  assert.match(jp, /axis-stamp" data-axis="symbol"/);
  assert.equal(f.storage.exportJson(), before, '화면을 그리는 것만으로 기록이 바뀌지 않는다');
  // 단추를 누르면 접었다 편다. 검색을 펴면 입력칸에 초점이 간다. 열림은 저장하지 않는다.
  const search = f.node('#dex-search-toggle'), tools = f.node('#dex-tools'), box = f.node('#dex-q');
  search.click();
  assert.equal(search.getAttribute('aria-expanded'), 'true'); assert.equal(tools.hidden, false); assert.equal(box.focused, true);
  search.click();
  assert.equal(search.getAttribute('aria-expanded'), 'false'); assert.equal(tools.hidden, true);
  const filter = f.node('#dex-filter-toggle'), filters = f.node('#dex-filters');
  filter.click();
  assert.equal(filter.getAttribute('aria-expanded'), 'true'); assert.equal(filters.hidden, false);
  assert.equal(f.storage.exportJson(), before);
  // 필터를 켜 둔 채 다시 그리면 그 패널은 펼쳐진 채다 — 접힌 채 걸러지면 왜 나라가 줄었는지 알 수 없다.
  f.node('#dex-locked').change(true);
  f.c.FQ.screens.dex();
  assert.match(f.main.innerHTML, /id="dex-filter-toggle"[^>]*aria-expanded="true"/);
  assert.match(f.main.innerHTML, /<div class="dex-filters" id="dex-filters">/);
  assert.match(f.main.innerHTML, /<div class="dex-tools" id="dex-tools" hidden>/);
  assert.equal((f.node('#dex-list').innerHTML.match(/class="sticker-cell /g) || []).length, 193);
  // css: 폰 3열(칸 124px 이상) · 아이패드 가로 8열 · 알약 44px · 원형 단추 48px · 대륙 줄 가로 스크롤
  assert.match(css, /\.sticker-grid \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.sticker-cell \{ min-height: 124px/);
  assert.match(css, /\.dex-toggle \{ width: 48px; height: 48px; min-height: 48px/);
  assert.match(css, /\.dex-back \{ width: 44px; height: 44px; min-height: 44px/);
  assert.match(css, /\.dex-conts \{ display: flex; gap: 8px; overflow-x: auto/);
  assert.match(css, /\.dex-conts \.pill \{[^}]*min-height: 44px/);
  assert.match(css, /\.dex-bar \{[^}]*height: 14px/);
  assert.match(css, /\.dex-tools\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.dex-filters\[hidden\] \{ display: none; \}/);
  assert.match(css, /@media \(min-width: 760px\) and \(orientation: landscape\) \{[^@]*\.sticker-grid \{ grid-template-columns: repeat\(8, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /\.sticker-cell\.got \{ border-color: var\(--success\)/);
});
