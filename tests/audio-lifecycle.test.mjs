/* 화면 잠금 뒤 효과음이 Web Audio 재개를 기다리는지 공개 엔진 경로로 검사한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const legacySource = fs.readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8');
const recordedSource = fs.readFileSync(new URL('../js/recorded-audio.js', import.meta.url), 'utf8');
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

function fixture(recorded) {
  const contexts = [], oscillators = [];
  const windowEvents = new Map(), documentEvents = new Map();
  const timers = new Map();
  let nextTimer = 1;
  function listen(events, name, callback) {
    if (!events.has(name)) events.set(name, []);
    events.get(name).push(callback);
  }
  function dispatch(events, name, event = {}) {
    for (const callback of events.get(name) || []) callback(event);
  }
  function parameter() {
    return { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
  }
  class Context {
    constructor() {
      this.state = 'running'; this.currentTime = 10; this.destination = { context: this };
      this.resumes = []; this.events = new Map(); contexts.push(this);
    }
    addEventListener(name, callback) { listen(this.events, name, callback); }
    removeEventListener() {}
    resume() {
      const call = {};
      call.promise = new Promise((resolve, reject) => {
        call.resolve = () => {
          this.state = 'running';
          dispatch(this.events, 'statechange');
          if (this.onstatechange) this.onstatechange();
          resolve();
        };
        call.reject = reject;
      });
      this.resumes.push(call);
      return call.promise;
    }
    createBuffer() { return {}; }
    node(properties = {}) {
      const context = this;
      return {
        context, ...properties,
        connect(target) {
          if (target.context && target.context !== context) throw new Error('AudioContext mismatch');
        },
        disconnect() {}
      };
    }
    createBufferSource() { return this.node({ start() {}, stop() {} }); }
    createDynamicsCompressor() {
      return this.node({ threshold: parameter(), ratio: parameter(), attack: parameter(), release: parameter() });
    }
    createGain() { return this.node({ gain: parameter() }); }
    createOscillator() {
      if (this.state === 'closed') throw new Error('AudioContext closed');
      const context = this;
      const oscillator = this.node({
        frequency: parameter(), detune: parameter(),
        start(time) { this.startedAt = time; this.stateAtStart = context.state; },
        stop() {}
      });
      oscillators.push(oscillator);
      return oscillator;
    }
  }
  class Audio {
    constructor() { this.src = ''; }
    setAttribute() {}
    removeAttribute() {}
    pause() {}
    load() {}
    play() { return Promise.resolve(); }
  }
  const document = {
    hidden: false, visibilityState: 'visible',
    addEventListener(name, callback) { listen(documentEvents, name, callback); },
    removeEventListener() {}
  };
  const sandbox = {
    AudioContext: Context, Audio, document, navigator: { onLine: true },
    FQ: { voiceManifest: { ready: recorded, clips: {} } },
    addEventListener(name, callback) { listen(windowEvents, name, callback); },
    removeEventListener() {},
    setTimeout(callback, delay) { const id = nextTimer++; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(legacySource, sandbox);
  if (recorded) vm.runInNewContext(recordedSource, sandbox);
  return {
    audio: sandbox.FQ.audio, contexts, oscillators,
    get context() { return contexts.at(-1); },
    lock(state) {
      document.hidden = true; document.visibilityState = 'hidden';
      dispatch(documentEvents, 'visibilitychange'); dispatch(windowEvents, 'pagehide');
      this.context.state = state;
    },
    restore() {
      document.hidden = false; document.visibilityState = 'visible';
      dispatch(documentEvents, 'visibilitychange'); dispatch(windowEvents, 'pageshow', { persisted: false });
    }
  };
}

for (const recorded of [false, true]) {
  const engine = recorded ? '녹음 음성 엔진' : '기본 음성 엔진';

  test(`${engine}: 잠금 뒤 interrupted 정답 효과음은 컨텍스트를 재개한 뒤 재생한다`, async () => {
    const f = fixture(recorded);
    f.audio.unlock();
    await flush();
    f.lock('interrupted'); f.restore();
    f.audio.play('correct');
    assert.ok(f.context.resumes.length > 0, 'iPad의 interrupted 상태에서도 resume을 요청한다');
    assert.equal(f.oscillators.length, 0, '재개 Promise가 끝나기 전에는 효과음을 예약하지 않는다');
    for (const resume of f.context.resumes) resume.resolve();
    await flush();
    assert.ok(f.oscillators.length > 0, '재개 완료 후 정답 효과음을 재생한다');
    assert.ok(f.oscillators.every(oscillator => oscillator.stateAtStart === 'running'));
  });

  test(`${engine}: suspended 재개가 비동기이면 첫 효과음을 재개 완료까지 보존한다`, async () => {
    const f = fixture(recorded);
    f.audio.unlock();
    await flush();
    f.lock('suspended'); f.restore();
    f.audio.play('wrong');
    assert.ok(f.context.resumes.length > 0);
    assert.equal(f.oscillators.length, 0, '멈춘 컨텍스트에 효과음을 미리 소모하지 않는다');
    for (const resume of f.context.resumes) resume.resolve();
    await flush();
    assert.equal(f.oscillators.length, 2, '오답 효과음의 두 음을 한 번만 재생한다');
    assert.ok(f.oscillators.every(oscillator => oscillator.stateAtStart === 'running'));
  });

  test(`${engine}: 잠금 중 closed가 된 컨텍스트와 출력 노드를 함께 교체한다`, async () => {
    const f = fixture(recorded);
    f.audio.play('click');
    await flush();
    assert.equal(f.oscillators.length, 1);
    const previousContext = f.context;
    f.oscillators.length = 0;
    f.lock('closed'); f.restore();
    assert.doesNotThrow(() => f.audio.play('correct'));
    await flush();
    assert.notEqual(f.context, previousContext, 'closed 컨텍스트는 새로 만든다');
    assert.ok(f.oscillators.length > 0);
    assert.ok(f.oscillators.every(oscillator => oscillator.context === f.context));
  });

  test(`${engine}: 재개 대기 중 다시 잠그면 이전 정답 효과음을 뒤늦게 재생하지 않는다`, async () => {
    const f = fixture(recorded);
    f.audio.unlock();
    await flush();
    f.lock('interrupted'); f.restore();
    f.audio.play('correct');
    assert.ok(f.context.resumes.length > 0);
    f.lock('interrupted');
    for (const resume of f.context.resumes) resume.resolve();
    await flush();
    assert.equal(f.oscillators.length, 0, '새 잠금은 재개 전의 효과음을 무효화한다');
    f.restore();
    await flush();
    assert.equal(f.oscillators.length, 0, '화면 복귀만으로 지난 효과음을 재생하지 않는다');
    f.audio.play('click');
    await flush();
    assert.equal(f.oscillators.length, 1, '새 조작의 효과음은 정상 재생한다');
  });

  test(`${engine}: resume 거부 뒤 다음 조작에서 재시도한다`, async () => {
    const f = fixture(recorded);
    f.audio.unlock();
    await flush();
    f.lock('interrupted'); f.restore();
    f.audio.play('correct');
    assert.ok(f.context.resumes.length > 0);
    for (const resume of f.context.resumes) resume.reject(new Error('audio interrupted'));
    await flush();
    const previousAttempts = f.context.resumes.length;
    f.audio.play('click');
    assert.ok(f.context.resumes.length > previousAttempts, '실패한 resume Promise를 다시 사용하지 않는다');
    for (const resume of f.context.resumes.slice(previousAttempts)) resume.resolve();
    await flush();
    assert.equal(f.oscillators.length, 1, '실패했던 정답 효과음은 되살리지 않는다');
  });
}
