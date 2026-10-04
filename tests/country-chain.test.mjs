import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fixture() {
  const nodes = new Map(), timers = new Map(), sessions = [], spoken = [], maps = [];
  let nextTimer = 0, cancels = 0, stops = 0, speechStops = 0, c;
  class Element extends EventTarget {
    constructor(name) {
      super(); this.name = name; this.attrs = {}; this.children = new Set(); this.disabled = false;
      this.value = ''; this.hidden = false; this.textContent = ''; this.classes = new Set();
      this.classList = { toggle: (name, force) => force ? this.classes.add(name) : this.classes.delete(name) };
    }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) { return this.attrs[name] ?? ''; }
    closest(selector) { return selector.startsWith('[') && this.attrs[selector.slice(1, -1)] !== undefined ? this : null; }
    contains(target) { return target === this || this.children.has(target); }
    querySelector(selector) { return node(selector); }
    querySelectorAll() { return []; }
    focus() {}
    set innerHTML(html) {
      this.html = html;
      if (this.name !== '#main') return;
      this.children.clear();
      for (const match of html.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
        const target = new Element('#' + match[2]);
        for (const attr of match[0].matchAll(/([\w-]+)="([^"]*)"/g)) target.setAttribute(attr[1], attr[2]);
        for (const attr of match[0].matchAll(/\s(data-chain-[\w-]+)(?=[\s>])/g)) target.setAttribute(attr[1], '');
        nodes.set('#' + match[2], target); this.children.add(target);
      }
    }
    get innerHTML() { return this.html || ''; }
  }
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, new Element(selector));
    return nodes.get(selector);
  }
  const doc = new EventTarget();
  Object.assign(doc, { hidden: false, getElementById: id => node('#' + id), querySelector: selector => node(selector) });
  const voice = { supported: () => true, start(options) { sessions.push(options); options.onState({ state: 'recording' }); return Promise.resolve(); },
    cancel() { cancels += 1; }, stop() { stops += 1; } };
  c = { console, Math, Date, JSON, Object, Array, String, Number, document: doc, scrollTo() {},
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
    FQ: { storage: { settings: () => ({ speak: true }) },
      audio: { canSpeak: () => true, unlock() {}, stopSpeaking() { speechStops += 1; }, say(lines, opts, fail) { spoken.push({ lines: [...lines], opts, fail }); } },
      map: { collection(countries, opts) { maps.push({ countries: [...countries], opts }); return countries.map(country => '<button data-chain-country="' + country.code + '">' + country.ko + '</button>').join(''); } } } };
  c.window = c; vm.createContext(c);
  for (const file of ['js/util.js', 'data/countries.js', 'js/ui.js', 'js/country-chain.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file });
  }
  function dispatch(target, type) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'target', { value: target });
    node('#main').dispatchEvent(event);
  }
  function click(selectorOrAttrs) {
    const target = typeof selectorOrAttrs === 'string' ? node(selectorOrAttrs) : new Element('button');
    if (typeof selectorOrAttrs !== 'string') {
      Object.assign(target.attrs, selectorOrAttrs); node('#main').children.add(target);
    }
    if (!target.disabled) dispatch(target, 'click');
  }
  function type(text) {
    node('#chain-input').value = text;
    const target = new Element('form'); target.setAttribute('data-chain-form', ''); node('#main').children.add(target);
    dispatch(target, 'submit');
  }
  function runTimer(delay) {
    const entry = [...timers.entries()].find(([, value]) => delay === undefined || value.delay === delay);
    assert.ok(entry, `예약 타이머 ${delay ?? 'any'}가 있어야 한다`);
    timers.delete(entry[0]); entry[1].fn();
  }
  return { c, node, click, type, voice, sessions, spoken, maps, timers, runTimer,
    hide(hidden) { doc.hidden = hidden; doc.dispatchEvent(new Event('visibilitychange')); },
    get cancels() { return cancels; }, get stops() { return stops; }, get speechStops() { return speechStops; } };
}

test('질문 없이 두 사람 차례를 번갈아 바꾸고 나라·지도·기록을 누적한다', () => {
  const f = fixture(), game = f.c.FQ.countryChain.createGame({ players: ['민규', '아빠'] });
  assert.equal(game.snapshot().currentPlayer, '민규');
  const first = game.submit('한국');
  assert.equal(first.status, 'accepted'); assert.equal(first.country.code, 'kr'); assert.equal(first.nextPlayer, '아빠');
  const second = game.submit('Japan');
  assert.equal(second.status, 'accepted'); assert.equal(second.country.code, 'jp'); assert.equal(second.nextPlayer, '민규');
  const state = game.snapshot();
  assert.equal(state.total, 2); assert.deepEqual(Array.from(state.scores), [1, 1]);
  assert.deepEqual(Array.from(state.history, entry => [entry.number, entry.code, entry.player]), [[1, 'kr', '민규'], [2, 'jp', '아빠']]);
});

test('두 사람 전체에서 별칭·한국어·영문은 같은 나라로 중복 처리하고 차례를 유지한다', () => {
  const f = fixture(), game = f.c.FQ.countryChain.createGame();
  assert.equal(game.submit('대한민국').status, 'accepted');
  for (const alias of ['한국', '대한 민국', 'South Korea', '대한민국이요!']) {
    const duplicate = game.submit(alias);
    assert.equal(duplicate.status, 'duplicate', alias); assert.equal(duplicate.country.code, 'kr');
    assert.equal(duplicate.previous.playerIndex, 0); assert.equal(game.snapshot().playerIndex, 1);
  }
  assert.equal(game.submit('일본').status, 'accepted');
  assert.equal(game.submit('재팬').status, 'duplicate'); assert.equal(game.snapshot().playerIndex, 0);
  assert.equal(game.snapshot().total, 2);
});

test('공백·기호·말끝과 여러 낱말 공식 이름을 받되 여러 나라를 임의로 고르지 않는다', () => {
  const f = fixture(), game = f.c.FQ.countryChain.createGame();
  for (const [text, code] of [['음 브라질이요', 'br'], ['어 기니 비사우요', 'gw'], ['인도 네시아', 'id'], ['UNITED STATES OF AMERICA!', 'us']]) {
    const result = game.submit(text); assert.equal(result.status, 'accepted', text); assert.equal(result.country.code, code);
  }
  const before = JSON.stringify(game.snapshot());
  for (const text of ['일본 대한민국', '한국 또는 미국', '음 기니 비사우 일본', '미국 아메리카 일본', '일본이랑 대한민국', '일본보다 미국', '한국이나 일본']) {
    assert.equal(game.submit(text).status, 'ambiguous', text); assert.equal(JSON.stringify(game.snapshot()), before);
  }
});

test('모르는 말·빈 입력·ISO코드·긴 입력은 나라를 추가하거나 차례를 바꾸지 않는다', () => {
  const f = fixture(), game = f.c.FQ.countryChain.createGame();
  for (const text of ['', '  ', '몰라요', '아빠 이거 뭐야', 'kr', '달나라', '프랑스일본', '가'.repeat(2001)]) {
    assert.equal(game.submit(text).status, 'unknown', text.slice(0, 30));
    assert.equal(game.snapshot().total, 0); assert.equal(game.snapshot().playerIndex, 0);
  }
});

test('전체 원장의 나라 이름·영문·모든 별칭을 정규화하여 정확히 같은 코드로 받는다', () => {
  const f = fixture();
  let aliases = 0;
  for (const country of f.c.FQ.countries) {
    for (const name of new Set([country.ko, country.en, ...(country.aliases || [])])) {
      const result = f.c.FQ.countryChain.createGame().submit(name);
      assert.equal(result.status, 'accepted', name); assert.equal(result.country.code, country.code, name); aliases += 1;
    }
  }
  assert.ok(aliases > 650);
});

test('정확한 별칭이 서로 겹치는 자료는 모호함을 알리고 모델 snapshot은 배열 수정을 막는다', () => {
  const f = fixture(), game = f.c.FQ.countryChain.createGame({ countries: [
    { code: 'a', ko: '첫나라', aliases: ['같은이름'] }, { code: 'b', ko: '둘나라', aliases: ['같은이름'] }
  ], players: ['한명'] });
  assert.equal(game.submit('같은이름').status, 'ambiguous'); assert.equal(game.snapshot().total, 0);
  game.submit('첫나라'); const state = game.snapshot(); state.history.length = 0; state.scores[0] = 99; state.players[1] = '바뀜';
  assert.equal(game.snapshot().total, 1); assert.equal(game.snapshot().scores[0], 1); assert.equal(game.snapshot().players[1], '두 번째 친구');
  assert.equal(game.submit('둘나라').complete, true); assert.equal(game.submit('첫나라').status, 'complete');
});

test('화면은 5개 제한 없이 전체 accepted 나라를 지도·국기 목록·선택 정보로 전달한다', () => {
  const f = fixture(), screen = f.c.FQ.countryChain.start({ players: ['민규', '아빠'], speak: false });
  const countries = Array.from(f.c.FQ.countries).slice(0, 12);
  countries.forEach(country => f.type(country.ko));
  assert.equal(screen.snapshot().total, 12); assert.equal(f.maps.at(-1).countries.length, 12);
  assert.equal((f.node('#chain-history').innerHTML.match(/data-chain-country=/g) || []).length, 12);
  assert.match(f.node('#chain-detail').innerHTML, new RegExp(countries.at(-1).ko));
  f.click({ 'data-chain-country': countries[0].code });
  assert.equal(f.maps.at(-1).opts.activeCode, countries[0].code); assert.equal(screen.snapshot().total, 12);
  assert.match(f.node('#chain-detail').innerHTML, new RegExp(countries[0].ko));
  assert.equal(f.maps.at(-1).opts.owners[countries[0].code], 0); assert.equal(f.maps.at(-1).opts.owners[countries[1].code], 1);
  assert.doesNotMatch(f.node('#main').innerHTML, /정답|문제|data-chain-next|confirm/);
});

test('accepted면 먼저 화면·차례를 바꾸고 음성 읽기 완료 뒤 다음 사람을 자동으로 듣는다', () => {
  const f = fixture(), screen = f.c.FQ.countryChain.start({ voice: f.voice, players: ['민규', '아빠'] });
  assert.equal(f.sessions.length, 0, '마이크 권한은 사용자의 첫 클릭에서 요청한다');
  f.click('#chain-mic'); const first = f.sessions[0];
  assert.equal(first.playerId, 0); assert.equal(first.turnId, 0);
  first.onResult({ text: '한국', playerId: 0, turnId: 0 });
  assert.equal(screen.snapshot().playerIndex, 1); assert.equal(screen.snapshot().total, 1);
  assert.match(f.node('#chain-turn').textContent, /아빠/); assert.deepEqual(f.spoken[0].lines, ['대한민국']);
  assert.equal(f.sessions.length, 1);
  f.spoken[0].opts.onEnd(); f.runTimer(300);
  assert.equal(f.sessions.length, 2); assert.equal(f.sessions[1].playerId, 1); assert.equal(f.sessions[1].turnId, 1);
  f.spoken[0].opts.onEnd(); assert.equal(f.timers.size, 0, '늦은 읽기 종료는 중복으로 마이크를 예약하지 않는다');
});

for (const reason of ['silent', 'fail', 'throw']) test(`읽기가 ${reason}여도 차례 진행을 막지 않고 마이크를 다시 연다`, () => {
  const f = fixture();
  if (reason === 'throw') f.c.FQ.audio.say = () => { throw new Error('unavailable'); };
  const screen = f.c.FQ.countryChain.start({ voice: f.voice }); f.click('#chain-mic');
  f.sessions[0].onResult({ text: '일본' });
  assert.equal(screen.snapshot().playerIndex, 1);
  if (reason === 'silent') f.runTimer(7000);
  if (reason === 'fail') f.spoken[0].fail();
  f.runTimer(300); assert.equal(f.sessions.length, 2); assert.equal(f.sessions[1].playerId, 1);
});

test('중복·미확인·모호한 음성은 같은 차례에서 다시 듣고 원래 목록을 유지한다', () => {
  const f = fixture(), screen = f.c.FQ.countryChain.start({ voice: f.voice, speak: false });
  f.click('#chain-mic'); f.sessions[0].onResult({ text: '한국' }); f.runTimer(300);
  for (const text of ['대한민국', '달나라', '일본 미국']) {
    f.sessions.at(-1).onResult({ text });
    assert.equal(screen.snapshot().total, 1); assert.equal(screen.snapshot().playerIndex, 1);
    assert.ok(f.node('#chain-feedback').classes.has('is-warning')); f.runTimer(500);
    assert.equal(f.sessions.at(-1).playerId, 1);
  }
});

test('오래된 STT·상태·오류·읽기 callback은 수동 입력 뒤 다음 차례를 건드리지 않는다', () => {
  const f = fixture(), screen = f.c.FQ.countryChain.start({ voice: f.voice });
  f.click('#chain-mic'); const first = f.sessions[0]; first.onResult({ text: '한국' });
  const reading = f.spoken[0]; f.type('일본'); const status = f.node('#chain-voice-state').textContent;
  first.onResult({ text: '미국' }); first.onState({ state: 'recording' }); first.onError({ message: 'old failure' });
  reading.opts.onEnd(); reading.fail();
  assert.equal(screen.snapshot().total, 2); assert.equal(screen.snapshot().playerIndex, 0);
  assert.equal(f.node('#chain-voice-state').textContent, status);
  f.spoken[1].opts.onEnd(); f.runTimer(300);
  assert.equal(f.sessions.at(-1).playerId, 0); assert.equal(f.sessions.at(-1).turnId, 2);
});

test('다른 사람·차례에 속한 STT는 현재 녹음 세션이어도 받지 않는다', () => {
  const f = fixture(), screen = f.c.FQ.countryChain.start({ voice: f.voice, speak: false });
  f.click('#chain-mic'); const first = f.sessions[0];
  first.onResult({ text: '미국', playerId: 1, turnId: 0 }); first.onResult({ text: '일본', playerId: 0, turnId: 4 });
  assert.equal(screen.snapshot().total, 0); first.onResult({ text: '한국', playerId: 0, turnId: 0 });
  assert.equal(screen.snapshot().total, 1);
});

test('서버 음성 어댑터의 문자열 playerId·turnId를 같은 숫자 차례로 받아들인다', () => {
  const f = fixture(), screen = f.c.FQ.countryChain.start({ voice: f.voice, speak: false });
  f.click('#chain-mic'); f.sessions[0].onResult({ text: '한국', playerId: '0', turnId: '0' });
  assert.equal(screen.snapshot().total, 1); assert.equal(screen.snapshot().playerIndex, 1);
  f.runTimer(300); f.sessions[1].onResult({ text: '일본', playerId: '1', turnId: '1' });
  assert.equal(screen.snapshot().total, 2); assert.equal(screen.snapshot().playerIndex, 0);
});

test('녹음 정리·받아쓰기 중 나라 정보를 골라도 마이크가 중복 시작되지 않는다', () => {
  const f = fixture(), screen = f.c.FQ.countryChain.start({ voice: f.voice, speak: false });
  screen.submit('한국'); f.click('#chain-mic');
  for (const state of ['finishing', 'transcribing']) {
    f.sessions[0].onState({ state }); assert.equal(f.node('#chain-mic').disabled, true);
    f.click({ 'data-chain-country': 'kr' }); assert.equal(f.node('#chain-mic').disabled, true);
    f.click('#chain-mic'); assert.equal(f.sessions.length, 1);
  }
  assert.equal(screen.snapshot().total, 1);
});

test('모바일 지도는 선택한 실제 좌표를 안쪽으로 이동하고 글 입력 초점은 유지한다', () => {
  const f = fixture(), screen = f.c.FQ.countryChain.start({ speak: false });
  f.node('.chain-map-scroll').clientWidth = 300;
  f.node('.chain-map-marker.is-active').offsetLeft = 650;
  f.c.document.activeElement = f.node('#chain-input');
  f.c.FQ.map.describe = () => ({ coordinates: '북위 36° · 동경 138°' });
  screen.submit('일본');
  assert.equal(f.node('.chain-map-scroll').scrollLeft, 500);
  assert.equal(f.c.document.activeElement, f.node('#chain-input'));
  assert.match(f.node('#chain-detail').innerHTML, /북위 36° · 동경 138°/);
});

test('녹음 종료 버튼은 STT 업로드를 요청하고 듣기 멈추기는 요청을 취소한다', () => {
  const f = fixture(), screen = f.c.FQ.countryChain.start({ voice: f.voice, speak: false });
  f.click('#chain-mic'); f.click('#chain-mic'); assert.equal(f.stops, 1);
  const first = f.sessions[0]; first.onState({ state: 'transcribing' });
  assert.equal(f.node('#chain-mic').disabled, true); assert.equal(f.node('#chain-pause').hidden, false);
  const before = f.cancels; f.click('#chain-pause'); assert.equal(f.cancels, before + 1);
  first.onResult({ text: '한국' }); assert.equal(screen.snapshot().total, 0);
  f.type('일본'); assert.equal(screen.snapshot().total, 1); assert.equal(f.timers.size, 0);
});

test('마이크 오류·미지원에서도 차례와 누적 목록을 보존하고 수동 입력을 이어간다', async () => {
  const f = fixture(), errors = [], screen = f.c.FQ.countryChain.start({ voice: f.voice, speak: false, onVoiceError: error => errors.push(error) });
  f.click('#chain-mic'); f.sessions[0].onError({ code: 'permission', message: '마이크 권한을 확인해 주세요.' });
  assert.equal(screen.snapshot().total, 0); assert.equal(screen.snapshot().playerIndex, 0); assert.equal(errors.length, 1);
  assert.match(f.node('#chain-voice-state').textContent, /같은 차례/); assert.equal(f.timers.size, 0);
  f.type('한국'); assert.equal(screen.snapshot().playerIndex, 1);
  f.voice.supported = () => false; f.click('#chain-mic'); assert.equal(f.sessions.length, 1);
  f.type('일본'); assert.equal(screen.snapshot().total, 2); assert.equal(screen.snapshot().playerIndex, 0);
  f.voice.supported = () => true; f.voice.start = () => Promise.reject(new Error('network'));
  f.click('#chain-mic'); await Promise.resolve();
  assert.match(f.node('#chain-voice-state').textContent, /network/); assert.equal(screen.snapshot().total, 2);
});

test('페이지 숨김·홈·새로 하기·cleanup은 녹음과 예약을 취소하며 늦은 답을 받지 않는다', () => {
  const f = fixture(); let homes = 0;
  const screen = f.c.FQ.countryChain.start({ voice: f.voice, speak: false, onHome: () => { homes += 1; } });
  f.click('#chain-mic'); const first = f.sessions[0]; f.hide(true); first.onResult({ text: '한국' });
  assert.equal(screen.snapshot().total, 0); assert.equal(f.timers.size, 0);
  f.hide(false); assert.equal(f.sessions.length, 1, '복귀할 때 사용자 의사 없이 다시 녹음하지 않는다');
  f.type('일본'); f.click('#chain-mic'); const next = f.sessions[1];
  f.click({ 'data-chain-reset': '' }); next.onResult({ text: '미국' });
  assert.equal(screen.snapshot().total, 0); assert.equal(screen.snapshot().playerIndex, 0);
  f.type('한국'); f.click({ 'data-chain-home': '' });
  assert.equal(homes, 1); assert.equal(f.timers.size, 0); assert.equal(screen.submit('일본').status, 'inactive');
  screen.cleanup(); next.onResult({ text: '미국' }); assert.equal(screen.snapshot().total, 1);
});

test('전 원장을 다 말하면 마지막 나라와 누적 지도를 남기고 새로 할 수 있다', () => {
  const f = fixture(), countries = Array.from(f.c.FQ.countries), screen = f.c.FQ.countryChain.start({ voice: f.voice, speak: false });
  countries.forEach(country => screen.submit(country.ko));
  assert.equal(screen.snapshot().complete, true); assert.equal(screen.snapshot().total, countries.length);
  assert.equal(f.maps.at(-1).countries.length, countries.length); assert.match(f.node('#chain-turn').textContent, /모든 나라/);
  assert.equal(f.node('#chain-mic').disabled, true); assert.equal(f.timers.size, 0);
  f.click({ 'data-chain-reset': '' }); assert.equal(screen.snapshot().total, 0); assert.equal(screen.snapshot().complete, false);
  assert.equal(f.node('#chain-input').disabled, false); assert.equal(f.node('#chain-mic').disabled, false);
});

test('플레이어 이름과 입력은 화면에 HTML로 실행되지 않는다', () => {
  const f = fixture(), screen = f.c.FQ.countryChain.start({ players: ['<img src=x>', '<script>'], speak: false });
  screen.submit('한국');
  assert.match(f.node('#chain-players').innerHTML, /&lt;img src=x&gt;/);
  assert.doesNotMatch(f.node('#chain-players').innerHTML, /<img|<script/);
  assert.doesNotMatch(f.node('#chain-history').innerHTML, /<script/);
});
