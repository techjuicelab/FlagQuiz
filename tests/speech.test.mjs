import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../js/speech.js', import.meta.url), 'utf8');

function setup(options = {}) {
  let now = 0;
  let nextTimer = 0;
  let startAttempts = 0;
  const timers = new Map();
  const instances = [];
  class Recognition {
    constructor() { this.active = false; this.starts = 0; instances.push(this); }
    start() {
      startAttempts++;
      if (options.failStartAt === startAttempts) throw Object.assign(new Error('start failed'), { name: 'InvalidStateError' });
      if (options.startError) throw options.startError;
      if (this.active) throw Object.assign(new Error('recognition has already started'), { name: 'InvalidStateError' });
      this.active = true;
      this.starts++;
    }
    stop() {}
    abort() { if (options.synchronousAbortEnd) this.emit('end'); }
    emit(type, event = {}) {
      if (type === 'end') this.active = false;
      this['on' + type]?.(event);
    }
  }
  const window = {
    SpeechRecognition: Recognition,
    navigator: { userAgent: options.apple ? 'iPhone' : 'test', maxTouchPoints: 0 },
    isSecureContext: true,
    location: { hostname: 'localhost' },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.runInNewContext(source, { window });
  const advance = (ms) => {
    const until = now + ms;
    for (;;) {
      const next = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    now = until;
  };
  return { speech: window.FQ.speech, instances, advance };
}

function finalResult(text) {
  return { resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] };
}

test('마이크를 끈 직후 다시 켜면 이전 인식 종료 뒤 새 요청이 실제 시작된다', () => {
  const { speech, instances, advance } = setup();
  const oldResults = [], newResults = [];
  speech.start({ result: (values) => oldResults.push(...values) });
  const rec = instances[0];
  rec.emit('start');
  speech.abort();
  speech.start({ result: (values) => newResults.push(...values) });
  rec.emit('result', finalResult('미국'));
  assert.deepEqual(newResults, [], '중단한 인식 결과를 새 문제의 답으로 전달하면 안 된다');
  rec.emit('end');
  advance(400);
  assert.equal(instances.reduce((sum, item) => sum + item.starts, 0), 2, '새 마이크 요청이 소실되면 안 된다');
  assert.equal(speech.isListening(), true);
});

test('no-speech 오류 직후 설명 요청도 실제 onend까지 마이크 해제를 기다린다', () => {
  const { speech, instances, advance } = setup();
  let played = 0;
  speech.start({});
  instances[0].emit('start');
  instances[0].emit('error', { error: 'no-speech' });
  speech.stopAnd(() => played++);
  advance(100);
  assert.equal(played, 0, '오류 이벤트는 마이크가 해제되었다는 뜻이 아니다');
  instances[0].emit('end');
  advance(100);
  assert.equal(played, 1);
});

test('중단된 인식기의 늦은 결과와 오류를 현재 화면에 전달하지 않는다', () => {
  const { speech, instances } = setup();
  const results = [], errors = [];
  speech.start({ result: (values) => results.push(...values), error: (code) => errors.push(code) });
  speech.abort();
  instances[0].emit('result', finalResult('대한민국'));
  instances[0].emit('error', { error: 'aborted' });
  assert.deepEqual(results, []);
  assert.deepEqual(errors, []);
});

test('stopAnd 대기 시간 제한은 다음 세션의 마이크 해제를 앞당기지 않는다', () => {
  const { speech, instances, advance } = setup();
  let played = 0;
  speech.start({});
  speech.stopAnd(() => played++);
  advance(10);
  instances[0].emit('end');
  advance(100);
  assert.equal(played, 1);
  speech.start({});
  advance(990);
  speech.stopAnd(() => played++);
  advance(200);
  assert.equal(played, 1, '이전 세션의 1200ms 타이머가 현재 해제 콜백을 실행하면 안 된다');
  instances.at(-1).emit('end');
  advance(100);
  assert.equal(played, 2);
});

test('듣기 준비 안내는 실제 인식 시작 이벤트에서 한 번만 전달한다', () => {
  const { speech, instances } = setup();
  let started = 0;
  speech.start({ start: () => started++ });
  assert.equal(started, 0);
  instances[0].emit('start');
  instances[0].emit('start');
  assert.equal(started, 1);
});

test('마이크 권한 거부는 성공으로 표시하지 않고 재시도 가능한 오류로 전달한다', () => {
  const { speech, instances } = setup({ startError: Object.assign(new Error('denied'), { name: 'NotAllowedError' }) });
  const errors = [];
  assert.equal(speech.start({ error: (code) => errors.push(code) }), false);
  assert.deepEqual(errors, ['not-allowed']);
  assert.equal(speech.isListening(), false);
  // 실패한 인스턴스에 뒤늦게 도착한 이벤트는 콜백을 다시 호출하지 않는다.
  instances[0].emit('error', { error: 'not-allowed' });
  assert.deepEqual(errors, ['not-allowed']);
});

test('종료 이벤트가 누락되어도 재시작하며 폐기된 인식기의 이벤트를 무시한다', () => {
  const { speech, instances, advance } = setup();
  let ended = 0;
  const results = [];
  speech.start({});
  const old = instances[0];
  speech.abort();
  speech.start({ result: (alts) => results.push(...alts), end: () => ended++ });
  advance(1600);
  assert.equal(instances.length, 2);
  assert.equal(speech.isListening(), true);
  old.emit('end');
  old.emit('result', finalResult('영국'));
  old.emit('error', { error: 'aborted' });
  assert.equal(ended, 0);
  assert.deepEqual(results, []);
  instances[1].emit('result', finalResult('대한민국'));
  assert.deepEqual(results, ['대한민국']);
});

test('화면 이동은 마이크 해제 후 예약된 설명까지 취소한다', () => {
  const { speech, instances, advance } = setup({ apple: true });
  let played = 0;
  speech.start({});
  speech.stopAnd(() => played++);
  instances[0].emit('end');
  advance(100);
  speech.abort();
  advance(500);
  assert.equal(played, 0);
});

test('no-speech 이후 onend를 거쳐 다음 인식을 이어 갈 수 있다', () => {
  const { speech, instances, advance } = setup();
  const errors = [];
  let started = 0;
  const callbacks = {
    start: () => started++,
    error: (code) => errors.push(code),
    end: () => speech.start(callbacks)
  };
  speech.start(callbacks);
  instances[0].emit('start');
  instances[0].emit('error', { error: 'no-speech' });
  instances[0].emit('end');
  advance(400);
  instances.at(-1).emit('start');
  assert.deepEqual(errors, ['no-speech']);
  assert.equal(started, 2);
  assert.equal(instances[0].starts, 2);
});

test('중단 대기 중 다시 끄면 예약된 마이크 재시작도 취소한다', () => {
  const { speech, instances, advance } = setup();
  speech.start({});
  speech.abort();
  speech.start({});
  speech.abort();
  instances[0].emit('end');
  advance(2000);
  assert.equal(instances[0].starts, 1);
  assert.equal(speech.isListening(), false);
});

test('종료 안전장치의 abort가 동기 onend를 보내도 멈춘 인식기를 재사용하지 않는다', () => {
  const { speech, instances, advance } = setup({ synchronousAbortEnd: true });
  speech.start({});
  speech.stop();
  speech.start({});
  advance(1700);
  assert.equal(instances.length, 2);
  assert.equal(instances[1].starts, 1);
});

test('시작 이벤트가 15초 동안 없으면 수동 재시도 오류를 내고 늦은 권한 허용을 무시한다', () => {
  const { speech, instances, advance } = setup();
  const errors = [], results = [];
  let started = 0;
  speech.start({ start: () => started++, error: (code) => errors.push(code), result: (alts) => results.push(...alts) });
  advance(14999);
  assert.deepEqual(errors, []);
  advance(1);
  assert.deepEqual(errors, ['start-timeout']);
  assert.equal(speech.isListening(), false);
  instances[0].emit('start');
  instances[0].emit('result', finalResult('대한민국'));
  instances[0].emit('error', { error: 'aborted' });
  assert.equal(started, 0);
  assert.deepEqual(results, []);
  instances[0].emit('end');
  advance(20000);
  assert.deepEqual(errors, ['start-timeout']);
  assert.equal(instances[0].starts, 1, '권한을 기다리며 마이크를 자동으로 반복 시작하지 않는다');
});

test('정상 시작하거나 중단한 세션의 시작 제한 시간은 나중에 오류를 만들지 않는다', () => {
  const { speech, instances, advance } = setup();
  const errors = [];
  speech.start({ error: (code) => errors.push(code) });
  instances[0].emit('start');
  advance(20000);
  assert.deepEqual(errors, []);
  speech.abort();
  instances[0].emit('end');
  speech.start({ error: (code) => errors.push(code) });
  speech.abort();
  advance(20000);
  assert.deepEqual(errors, []);
});

test('종료 후 예약된 재시작이 동기 실패해도 오류 콜백에서 복구할 수 있다', () => {
  const { speech, instances, advance } = setup({ failStartAt: 2 });
  const errors = [];
  const next = { error(code) { errors.push(code); speech.start(next); } };
  speech.start({});
  speech.abort();
  assert.equal(speech.start(next), true);
  instances[0].emit('end');
  advance(100);
  assert.deepEqual(errors, ['start-failed']);
  assert.equal(instances.length, 2);
  assert.equal(instances[1].starts, 1);
  assert.equal(speech.isListening(), true);
});
