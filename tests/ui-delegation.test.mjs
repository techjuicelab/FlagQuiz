/* 실제 ui.on/setMain과 이벤트 리스너 수명으로 주제 전환 경합을 검사한다. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setMaxListeners } from 'node:events';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fixture({ app = false } = {}) {
  const nodes = new Map(), spoken = [], releases = [], timers = new Map(), local = new Map();
  let timerId = 0, c;
  class Element extends EventTarget {
    constructor(name) {
      super();
      setMaxListeners(0, this); // 브라우저 EventTarget처럼 제한을 두지 않고 아래에서 실제 개수를 검사한다.
      this.name = name;
      this.attrs = {};
      this.style = {};
      this.dataset = {};
      this.tagName = 'BUTTON';
      this.value = '';
      this.disabled = false;
      this.listeners = new Map();
      this.children = new Set();
      const classes = new Set();
      this.classList = { add: value => classes.add(value), remove: value => classes.delete(value),
        contains: value => classes.has(value), toggle(value) { classes.has(value) ? classes.delete(value) : classes.add(value); } };
    }
    addEventListener(event, listener, options) {
      super.addEventListener(event, listener, options);
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event).add(listener);
    }
    removeEventListener(event, listener, options) {
      super.removeEventListener(event, listener, options);
      this.listeners.get(event)?.delete(listener);
    }
    contains(target) { return target === this || this.children.has(target); }
    appendChild(target) { this.children.add(target); target.parentNode = this; }
    remove() { this.parentNode?.children.delete(this); this.parentNode = null; }
    closest(selector) {
      if (selector.startsWith('[')) return this.attrs[selector.slice(1, -1)] !== undefined ? this : null;
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1)) ? this : null;
      return null;
    }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    getAttribute(key) { return this.attrs[key] ?? ''; }
    removeAttribute(key) { delete this.attrs[key]; }
    querySelector(selector) { return node(selector); }
    querySelectorAll() { return []; }
    focus() { c.document.activeElement = this; }
    scrollIntoView() {}
    click() {
      if (this.disabled) return;
      const parent = this.parentNode;
      dispatch(this, 'click', this);
      if (parent) dispatch(parent, 'click', this);
    }
    set innerHTML(html) {
      this.html = html;
      for (const child of this.children) child.parentNode = null;
      this.children.clear();
      for (const match of html.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
        const element = new Element('#' + match[2]);
        element.tagName = match[1].toUpperCase();
        element.disabled = /\sdisabled(?:[\s>]|$)/.test(match[0]);
        for (const attr of match[0].matchAll(/([\w-]+)="([^"]*)"/g)) element.setAttribute(attr[1], attr[2]);
        nodes.set('#' + match[2], element);
        this.appendChild(element);
      }
    }
    get innerHTML() { return this.html ?? ''; }
  }
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, new Element(selector));
    return nodes.get(selector);
  }
  function dispatch(target, type, clicked) {
    const event = new Event(type);
    Object.defineProperty(event, 'target', { value: clicked });
    target.dispatchEvent(event);
  }
  c = { console, Math, Date, JSON, Object, Array, String, Number, Image: function () {},
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id), setInterval() {}, clearInterval() {},
    localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, String(value)) },
    document: { hidden: false, readyState: 'loading', activeElement: null, addEventListener() {},
      getElementById: id => node('#' + id), querySelector: () => null,
      body: node('body'), createElement: () => new Element('created') },
    navigator: {}, location: { protocol: 'http:', hostname: 'localhost' }, confirm: () => true,
    addEventListener() {}, scrollTo() {}, requestAnimationFrame() {}, cancelAnimationFrame() {},
    matchMedia: () => ({ matches: false }),
    FQ: { audio: { setEnabled() {}, setSpeakEnabled() {}, unlock() {}, stopSpeaking() {}, play() {},
      say(lines) { spoken.push([...lines]); } },
      music: { setEnabled() {}, setBgmEnabled() {}, unlock() {}, stop() {}, play() {} },
      effects: { burst() {} }, badges: { check: () => [] }, screens: { dex() {}, stats() {} },
      speech: { stopAnd: callback => releases.push(callback), abort() {}, start: () => true,
        isListening: () => false, unavailableReason: () => null, blocked: () => false } } };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8'), c, { filename: 'js/ui.js' });
  if (app) {
    // 레이아웃 조회만 모사한다. setMain/on은 제품 함수를 그대로 유지한다.
    Object.assign(c.FQ.ui, { $: node, $$: () => [] });
    for (const file of ['js/util.js', 'js/storage.js', 'js/features.js', 'data/countries.js',
      'data/subjects.js', 'data/confusion-groups.js', 'data/map-coords.js', 'data/map-shapes.js',
      'js/map.js', 'js/progress.js', 'js/quiz.js']) {
      vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file });
    }
    const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8').replace('FQ.app = { home:',
      'FQ.test = {state:state,submit:submit,goNext:goNext};\n  FQ.app = { home:');
    vm.runInContext(source, c, { filename: 'js/app.js' });
    c.FQ.storage.updateSettings({ dev: { art: true } });
    c.FQ.app.boot();
  }
  function button(attrs, container = node('#main')) {
    const target = new Element('button');
    for (const [key, value] of Object.entries(attrs)) target.setAttribute(key, value);
    container.appendChild(target);
    return target;
  }
  return { c, node, button, spoken, releases, timers, Element };
}

test('화면 교체는 이전 위임만 제거하고 부분 갱신·같은 화면·다른 root 리스너는 유지한다', () => {
  const f = fixture(), ui = f.c.FQ.ui, main = ui.setMain('<section>첫 화면</section>');
  const calls = [];
  main.addEventListener('click', () => calls.push('native'));
  ui.on(main, '[data-mode]', 'click', () => calls.push('old'));
  ui.on(main, '[data-mode]', 'click', () => calls.push('same-screen'));
  const modal = new f.Element('modal');
  ui.on(modal, '[data-mode]', 'click', () => calls.push('modal'));
  f.button({ 'data-mode': 'voice' }).click();
  assert.deepEqual(calls, ['native', 'old', 'same-screen']);
  // 정답 카드처럼 main 안쪽 일부만 바꾸어도 main의 위임은 계속 유효해야 한다.
  const partial = new f.Element('feedback'); main.appendChild(partial); partial.innerHTML = '<p>정답</p>';
  calls.length = 0; f.button({ 'data-mode': 'voice' }).click();
  assert.deepEqual(calls, ['native', 'old', 'same-screen']);
  ui.setMain('<section>다음 화면</section>');
  assert.equal(main.listeners.get('click').size, 1, '직접 등록한 리스너는 보존한다');
  ui.on(main, '[data-mode]', 'click', () => calls.push('new'));
  calls.length = 0; f.button({ 'data-mode': 'symbol' }).click();
  assert.deepEqual(calls, ['native', 'new']);
  calls.length = 0; f.button({ 'data-mode': 'symbol' }, modal).click();
  assert.deepEqual(calls, ['modal']);
});

for (const mode of ['symbol', 'place']) test(`국기를 먼저 방문해도 ${mode}의 공부·퀴즈 선택을 건너뛰지 않는다`, () => {
  const f = fixture({ app: true });
  f.button({ 'data-play': 'flag' }).click(); f.node('#category-back').click();
  f.button({ 'data-play': 'art' }).click(); f.button({ 'data-mode': mode }).click();
  assert.equal(f.c.FQ.test.state.screen, 'art-menu');
  assert.equal(f.c.FQ.test.state.game, null);
  assert.match(f.node('#main').innerHTML, /id="art-study-start"/);
  assert.match(f.node('#main').innerHTML, /id="art-quiz-start"/);
});

for (const mode of ['choice4', 'reverse', 'voice', 'typing']) test(`그림을 먼저 방문해도 국기 ${mode}를 시작한다`, () => {
  const f = fixture({ app: true });
  f.button({ 'data-play': 'art' }).click(); f.node('#category-back').click();
  f.button({ 'data-play': 'flag' }).click(); f.button({ 'data-mode': mode }).click();
  assert.equal(f.c.FQ.test.state.screen, 'quiz');
  assert.equal(f.c.FQ.test.state.game.config.mode, mode);
});

test('국기·그림을 반복 방문해도 현재 선택만 처리하고 위임 리스너가 쌓이지 않는다', () => {
  const f = fixture({ app: true });
  for (let i = 0; i < 20; i++) {
    f.button({ 'data-play': i % 2 ? 'art' : 'flag' }).click();
    assert.equal(f.node('#main').listeners.get('click').size, 1);
    f.node('#category-back').click();
    assert.equal(f.node('#main').listeners.get('click').size, 1);
  }
  f.button({ 'data-play': 'art' }).click(); f.button({ 'data-mode': 'place' }).click();
  assert.equal(f.c.FQ.test.state.screen, 'art-menu');
});

test('지난 결과의 설명·나라 핸들러가 다음 퀴즈나 새 결과의 입력을 방해하지 않는다', () => {
  const f = fixture({ app: true }), app = f.c.FQ.app;
  f.c.FQ.storage.updateSettings({ mode: 'capital', speak: true });
  app.startGame(['kr']);
  f.c.FQ.test.submit({ code: 'kr' }); f.c.FQ.test.goNext();
  assert.match(f.node('#main').innerHTML, /result-screen/);
  app.startGame(['kr', 'jp']);
  f.c.FQ.test.submit({ code: f.c.FQ.test.state.game.current().country.code });
  const before = f.releases.length;
  f.button({ 'data-speak': '서울', 'data-speak-extra': '대한민국의 수도예요' }).click();
  assert.equal(f.releases.length, before + 1, '현재 퀴즈의 듣기 요청만 등록한다');
  assert.ok([...f.timers.values()].some(timer => timer.delay === 21000), '자동 진행 보호 예약이 유지된다');
  f.c.FQ.test.goNext();
  f.c.FQ.test.submit({ code: f.c.FQ.test.state.game.current().country.code }); f.c.FQ.test.goNext();
  const modals = [];
  f.c.FQ.ui.countryModal = country => modals.push(country);
  const card = f.button({ 'data-code': 'kr' }); card.classList.add('travel-card'); card.click();
  assert.equal(modals.length, 1, '현재 결과의 나라 설명만 한 번 연다');
});
