/* 실제 app.js를 가상 화면에 연결해 그림·명소 공부와 퀴즈의 경계를 검사한다.
 * 브라우저 캐시의 실제 저장 여부는 offline.test.mjs가 담당한다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function fixture() {
  const nodes = new Map(), delegated = [], releases = [], spoken = [], local = new Map();
  const timers = new Map();
  let nextTimer = 0;
  function node(selector) {
    if (!nodes.has(selector)) {
      const classes = new Set();
      nodes.set(selector, {
        value: '', disabled: false, hidden: false, checked: false, textContent: '', attrs: {}, handlers: {}, style: {}, dataset: {},
        classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value),
          toggle(value, force) { const add = force === undefined ? !classes.has(value) : force; if (add) classes.add(value); else classes.delete(value); return add; } },
        addEventListener(type, fn) { this.handlers[type] = fn; },
        click() { if (!this.disabled) this.handlers.click?.({ target: this }); },
        setAttribute(name, value) { this.attrs[name] = String(value); },
        getAttribute(name) { return this.attrs[name] ?? ''; },
        removeAttribute(name) { delete this.attrs[name]; },
        querySelector: node, querySelectorAll: () => [], appendChild() {}, remove() {}, scrollIntoView() {}, focus() {},
        set innerHTML(html) {
          this.html = html;
          for (const match of html.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
            const child = node('#' + match[2]);
            child.disabled = /\sdisabled(?:[\s>]|$)/.test(match[0]);
            child.hidden = /\shidden(?:[\s>]|$)/.test(match[0]);
            child.checked = /\schecked(?:[\s>]|$)/.test(match[0]);
            for (const attr of match[0].matchAll(/([\w-]+)="([^"]*)"/g)) child.setAttribute(attr[1], attr[2]);
          }
        },
        get innerHTML() { return this.html ?? ''; }
      });
    }
    return nodes.get(selector);
  }
  const c = {
    console, Math, Date, JSON, Object, Array, String, Number, Image: function () {},
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearInterval(id) { timers.delete(id); },
    localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, String(value)), removeItem: key => local.delete(key) },
    document: { hidden: false, readyState: 'loading', addEventListener() {}, querySelector: selector => selector === '.app' ? node('.app') : null,
      getElementById: id => node('#' + id), createElement: () => node('created'), body: node('body') },
    navigator: { onLine: true }, location: { protocol: 'http:', hostname: 'localhost' }, confirm: () => true,
    addEventListener() {}, requestAnimationFrame() {}, cancelAnimationFrame() {}, matchMedia: () => ({ matches: false }), scrollTo() {},
    FQ: {
      ui: { $: node, $$: () => [], esc: String, setMain(html) { node('main').innerHTML = html; return node('main'); },
        on(target, selector, event, fn) { delegated.push({ selector, event, fn }); }, flagSrc: code => 'flags/' + code + '.svg', countryModal() {} },
      audio: { setEnabled() {}, setSpeakEnabled() {}, unlock() {}, stopSpeaking() {}, play() {},
        say(lines) { spoken.push([...lines]); } },
      music: { setEnabled() {}, setBgmEnabled() {}, unlock() {}, stop() {}, play() { return () => {}; } },
      effects: { celebrate: () => '정답', burst() {} }, badges: { check: () => [] },
      screens: { dex() {}, stats() {} },
      speech: { unavailableReason: () => null, blocked: () => false, abort() {}, isListening: () => false,
        stopAnd(callback) { releases.push(callback); }, start: () => true }
    }
  };
  c.window = c;
  vm.createContext(c);
  const uiMock = c.FQ.ui;
  vm.runInContext(read('js/ui.js'), c, { filename: 'js/ui.js' });
  Object.assign(c.FQ.ui, uiMock);
  for (const file of ['js/util.js', 'js/storage.js', 'js/features.js', 'data/countries.js', 'data/subjects.js',
    'data/confusion-groups.js', 'data/map-coords.js', 'data/map-shapes.js', 'js/map.js', 'js/progress.js', 'js/quiz.js']) {
    vm.runInContext(read(file), c, { filename: file });
  }
  const app = read('js/app.js').replace('FQ.app = { home:', 'FQ.test = { state:state, submit:submit, goNext:goNext };\n  FQ.app = { home:');
  vm.runInContext(app, c, { filename: 'js/app.js' });
  c.FQ.test.state.rng = () => 0.99;
  c.FQ.test.state.rngKind = () => 0.5;
  function delegate(selector, target) { delegated.filter(item => item.selector === selector && item.event === 'click').at(-1).fn({ target }, target); }
  function enter(mode) {
    c.FQ.app.home();
    const art = node('art-tile'); art.setAttribute('data-play', 'art'); delegate('[data-play]', art);
    const choice = node('art-choice'); choice.setAttribute('data-mode', mode); delegate('[data-mode]', choice);
    assert.equal(c.FQ.test.state.screen, 'art-menu');
  }
  function progress() {
    const { stats, daily, axes, countries, chest, history, badges } = JSON.parse(c.FQ.storage.exportJson());
    return { stats, daily, axes, countries, chest, history, badges };
  }
  return { c, node, releases, spoken, enter, progress };
}

for (const mode of ['symbol', 'place']) {
  const dir = mode === 'place' ? 'places' : 'symbols';
  const title = mode === 'place' ? '명소' : '그림';

  test(`${title} 메뉴는 공부와 퀴즈가 별도 경로이고 퀴즈는 만나기 카드 없이 시작한다`, () => {
    const f = fixture();
    f.c.FQ.storage.updateSettings({ count: 5, mode });
    f.enter(mode);
    const menu = f.node('main').innerHTML;
    assert.match(menu, /id="art-study-start"/);
    assert.match(menu, /id="art-quiz-start"/);
    assert.equal(f.c.FQ.test.state.game, null);
    f.node('#art-quiz-start').click();
    const game = f.c.FQ.test.state.game;
    assert.equal(game.current().mode, mode);
    assert.equal(game.total, 5);
    assert.equal(f.c.FQ.test.state.screen, 'quiz');
    assert.match(f.node('main').innerHTML, new RegExp('images/' + dir + '/[^" ]+\\.webp'));
    assert.doesNotMatch(f.node('main').innerHTML, /meet-card|id="meet-next"/);
  });

  test(`${title} 공부는 설정 범위로 진행되고 완료 뒤에도 점수와 퀴즈를 건드리지 않는다`, () => {
    const f = fixture();
    f.c.FQ.storage.updateSettings({ level: '2', continent: '아시아', count: 5, speak: false });
    f.enter(mode);
    const before = f.progress();
    f.node('#art-study-start').click();
    const study = f.c.FQ.test.state.artStudy;
    assert.equal(f.c.FQ.test.state.screen, 'art-study');
    assert.equal(study.mode, mode);
    assert.equal(study.countries.length, 5);
    assert.ok(study.countries.every(country => country.continent === '아시아' && country.level <= 2));
    assert.ok(study.countries.every(country => f.c.FQ.subjects[country.code]?.[mode] && !f.c.FQ.subjects[country.code][mode].noArt));
    const first = study.countries[0];
    assert.match(f.node('main').innerHTML, new RegExp('images/' + dir + '/' + first.code + '\\.webp'));
    assert.match(f.node('main').innerHTML, /class="art-study-fact"/, '짧은 나라 설명이 공부 카드에 보인다');
    assert.equal(f.node('#art-study-prev').disabled, true);
    assert.equal(f.c.FQ.test.state.game, null);
    f.node('#art-study-next').click();
    assert.equal(study.index, 1);
    f.node('#art-study-prev').click();
    assert.equal(study.index, 0);
    for (let i = 0; i < study.countries.length; i++) f.node('#art-study-next').click();
    assert.equal(f.c.FQ.test.state.screen, 'art-study-done');
    assert.equal(f.c.FQ.test.state.game, null);
    assert.deepEqual(f.progress(), before, '공부는 정오답·경험치·여행 카드·일일 기록을 바꾸지 않는다');
    f.node('#art-study-quiz').click();
    assert.equal(f.c.FQ.test.state.screen, 'art-menu', '완료 뒤 퀴즈는 메뉴에서 직접 선택한다');
    assert.equal(f.c.FQ.test.state.game, null);
  });

  test(`${title} 공부는 연결이 끊겨도 로컬 그림 경로와 기존 음성 흐름을 쓰고 늦은 읽기를 취소한다`, () => {
    const f = fixture();
    f.c.navigator.onLine = false;
    f.c.FQ.storage.updateSettings({ count: 5, speak: true });
    f.enter(mode);
    f.node('#art-study-start').click();
    const first = f.c.FQ.test.state.artStudy.countries[0];
    const art = f.c.FQ.subjects[first.code][mode].ko;
    assert.match(f.node('main').innerHTML, new RegExp('images/' + dir + '/' + first.code + '\\.webp'));
    assert.match(f.node('main').innerHTML, /id="art-study-retry"/);
    const play = f.releases.at(-1);
    assert.equal(typeof play, 'function', '자동 읽기가 기존 음성 재생 흐름을 사용한다');
    play();
    assert.deepEqual(f.spoken.at(-1), [first.ko, art, first.fact]);
    f.node('#art-study-speak').click();
    const late = f.releases.at(-1);
    const count = f.spoken.length;
    f.node('#art-study-back').click();
    late();
    assert.equal(f.c.FQ.test.state.screen, 'art-menu');
    assert.equal(f.spoken.length, count, '돌아간 뒤 도착한 음성 콜백은 무시한다');
  });

  test(`${title} 공부에서 그림이 실패해도 다시 시도하거나 다음 소재로 무채점 진행한다`, () => {
    const f = fixture();
    f.c.FQ.storage.updateSettings({ count: 5, speak: false });
    f.enter(mode);
    const before = f.progress();
    f.node('#art-study-start').click();
    const study = f.c.FQ.test.state.artStudy;
    const image = f.node('#art-study-image');
    const staleLoad = image.handlers.load;
    image.handlers.error();
    assert.equal(image.hidden, true);
    assert.equal(f.node('#art-study-error').hidden, false);
    assert.equal(f.node('#art-study-next').disabled, false);
    f.node('#art-study-retry').click();
    assert.equal(image.hidden, false);
    assert.equal(image.src, 'images/' + dir + '/' + study.countries[0].code + '.webp');
    image.handlers.error();
    f.node('#art-study-next').click();
    assert.equal(study.index, 1);
    assert.equal(f.node('#art-study-error').hidden, true);
    staleLoad();
    assert.equal(f.node('#art-study-error').hidden, true, '지난 소재의 늦은 응답은 현재 화면을 바꾸지 않는다');
    assert.deepEqual(f.progress(), before);
  });

  test(`${title} 공부를 더 이어가면 방금 본 나라보다 아직 안 본 나라를 먼저 고른다`, () => {
    const f = fixture();
    f.c.FQ.storage.updateSettings({ level: '3', continent: 'all', count: 5, speak: false });
    f.enter(mode);
    f.node('#art-study-start').click();
    const first = f.c.FQ.test.state.artStudy;
    const firstCodes = new Set(first.countries.map(country => country.code));
    assert.equal(firstCodes.size, 5);
    for (let i = 0; i < first.countries.length; i++) f.node('#art-study-next').click();
    assert.equal(f.c.FQ.test.state.screen, 'art-study-done');
    f.node('#art-study-more').click();
    const second = f.c.FQ.test.state.artStudy;
    assert.equal(second.mode, mode);
    assert.equal(second.countries.length, 5);
    assert.ok(second.countries.every(country => !firstCodes.has(country.code)), '다른 그림이 충분하면 같은 나라를 바로 반복하지 않는다');
    assert.equal(f.c.FQ.test.state.game, null);
  });
}
