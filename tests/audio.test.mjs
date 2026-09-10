/* Sua 읽어주기의 취소·순차 재생·실패 안내를 실제 비동기 순서로 검사한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const legacySource = fs.readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../js/recorded-audio.js', import.meta.url), 'utf8');

function setup({ ready = true, legacy = false } = {}) {
  let now = 0;
  let nextTimer = 1;
  const timers = new Map();
  const players = [];
  const fetches = [];
  const utterances = [];
  class FakeAudio {
    constructor() {
      this.src = '';
      this.duration = 1;
      this.paused = true;
      this.calls = [];
      this.pauseCount = 0;
      players.push(this);
    }
    setAttribute() {}
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() {}
    pause() { this.paused = true; this.pauseCount++; }
    play() {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      this.calls.push({ src: this.src, resolve, reject, ended: this.onended, playing: this.onplaying, error: this.onerror });
      return promise;
    }
  }
  const sandbox = {
    Audio: FakeAudio,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } },
    setTimeout(fn, delay = 0) { const id = nextTimer++; timers.set(id, { fn, time: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(src) { fetches.push(src); return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }); },
    FQ: {
      voiceManifest: {
        ready,
        voice: { name: 'Sua', id: 'test' },
        clips: {
          '정답': { src: 'audio/sua/correct.mp3', duration: 1 },
          '대한민국': { src: 'audio/sua/korea.mp3', duration: 1 },
          '설명': { src: 'audio/sua/hint.mp3', duration: 2 }
        }
      }
    },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    speechSynthesis: {
      speaking: false, pending: false,
      speak(utterance) { utterances.push(utterance); },
      cancel() { this.speaking = false; this.pending = false; },
      getVoices() { return []; }
    }
  };
  sandbox.window = sandbox;
  if (legacy) vm.runInNewContext(legacySource, sandbox);
  const originalAudio = sandbox.FQ.audio;
  vm.runInNewContext(source, sandbox);
  return {
    audio: sandbox.FQ.audio, originalAudio, sandbox, players, timers, fetches, utterances,
    get player() { return players[0]; },
    advance(ms) {
      const target = now + ms;
      while (true) {
        const due = [...timers.entries()].filter(([, t]) => t.time <= target).sort((a, b) => a[1].time - b[1].time)[0];
        if (!due) break;
        now = due[1].time;
        timers.delete(due[0]);
        due[1].fn();
      }
      now = target;
    }
  };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

// play()의 Promise와 미디어 이벤트는 다른 순서로 도착할 수 있다.
test('Sua 문장을 하나의 요소에서 순차 재생하며 원음 속도를 유지한다', async () => {
  const env = setup();
  let ended = 0;
  env.audio.say(['정답', '대한민국', '설명'], { rate: 2, pitch: 3, onEnd: () => ended++ });
  assert.equal(env.player.calls.length, 1);
  assert.equal(env.player.src, 'audio/sua/correct.mp3');
  assert.equal(env.player.playbackRate, 1);
  env.player.calls[0].resolve();
  await flush();
  env.player.onended();
  assert.equal(env.player.src, 'audio/sua/korea.mp3');
  env.player.onended();
  assert.equal(env.player.src, 'audio/sua/hint.mp3');
  env.player.onended();
  assert.equal(ended, 1);
  assert.equal(env.audio.isSpeaking(), false);
  assert.equal(env.players.length, 1);
  assert.equal(env.timers.size, 0);
});

test('빠르게 여러 번 눌러도 이전 Promise·종료·오류가 새 음원을 바꾸지 않는다', async () => {
  const env = setup();
  let failures = 0;
  env.audio.say(['정답', '대한민국'], {}, () => failures++);
  const stale = env.player.calls[0];
  env.audio.say(['설명']);
  const current = env.player.calls[1];
  stale.resolve();
  stale.ended();
  stale.error();
  await flush();
  env.advance(100);
  assert.equal(env.player.src, 'audio/sua/hint.mp3');
  assert.equal(env.player.calls.length, 2);
  assert.equal(failures, 0);
  assert.equal(env.audio.isSpeaking(), true);
  current.resolve();
  await flush();
  env.player.onended();
  env.advance(200000);
  assert.equal(env.player.calls.length, 2);
  assert.equal(failures, 0);
});

test('취소 후 늦은 재생 거부와 타이머가 재시도나 실패 안내를 되살리지 않는다', async () => {
  const env = setup();
  let failures = 0;
  env.audio.say(['정답'], {}, () => failures++);
  const stale = env.player.calls[0];
  env.audio.stopSpeaking();
  stale.reject({ name: 'NotAllowedError' });
  stale.playing();
  stale.ended();
  await flush();
  env.advance(200000);
  assert.equal(env.player.src, '');
  assert.equal(env.player.calls.length, 1);
  assert.equal(env.audio.isSpeaking(), false);
  assert.equal(failures, 0);
  assert.equal(env.timers.size, 0);
});

test('중간 파일 실패는 다음 설명을 중단하고 실패 콜백을 한 번만 보낸다', async () => {
  const env = setup();
  const failures = [];
  env.audio.say(['정답', '대한민국', '설명'], {}, (error) => failures.push(error));
  env.player.calls[0].resolve();
  await flush();
  env.player.onended();
  const broken = env.player.calls[1];
  broken.error();
  broken.reject(new Error('network'));
  await flush();
  env.advance(200000);
  assert.equal(env.player.calls.length, 2);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].code, 'audio-file-error');
  assert.equal(failures[0].text, '대한민국');
  assert.equal(env.audio.isSpeaking(), false);
});

test('재생 권한 거부를 알려 주고 사용자 재청취는 바로 재생한다', async () => {
  const env = setup();
  const failures = [];
  env.audio.say(['설명'], {}, (error) => failures.push(error.code));
  env.player.calls[0].reject({ name: 'NotAllowedError' });
  await flush();
  env.advance(0);
  assert.deepEqual(failures, ['playback-blocked']);
  env.audio.say(['설명']);
  assert.equal(env.player.calls.length, 2);
  env.player.calls[1].resolve();
  await flush();
  env.player.onended();
  assert.equal(env.audio.isSpeaking(), false);
});

test('시작 이벤트와 play 결과가 모두 없으면 제한 시간 후 실패한다', () => {
  const env = setup();
  const failures = [];
  env.audio.say(['정답'], {}, (error) => failures.push(error.code));
  env.advance(12000);
  assert.deepEqual(failures, ['start-timeout']);
  assert.equal(env.audio.isSpeaking(), false);
  assert.equal(env.timers.size, 0);
});

test('끝 이벤트가 누락되어도 재생 상태와 타이머가 무한히 남지 않는다', async () => {
  const env = setup();
  const failures = [];
  env.audio.say(['정답', '설명'], {}, (error) => failures.push(error.code));
  env.player.calls[0].resolve();
  await flush();
  env.advance(15000);
  assert.deepEqual(failures, ['playback-timeout']);
  assert.equal(env.player.calls.length, 1);
  assert.equal(env.audio.isSpeaking(), false);
  assert.equal(env.timers.size, 0);
});

test('존재하지 않는 음원을 기기 음성으로 대체하지 않고 누락을 알린다', () => {
  const env = setup();
  const failures = [];
  env.audio.say(['미등록 문장'], {}, (error) => failures.push(error.code));
  env.advance(0);
  assert.deepEqual(failures, ['missing-clip']);
  assert.equal(env.player.calls.length, 0);
  assert.equal(env.utterances.length, 0);
});

test('읽어주기 설정을 끄면 진행 중인 말과 큐를 모두 취소한다', async () => {
  const env = setup();
  env.audio.speak('정답');
  env.audio.speak('설명', { queue: true });
  const old = env.player.calls[0];
  env.audio.setSpeakEnabled(false);
  old.resolve();
  old.ended();
  await flush();
  env.advance(200000);
  assert.equal(env.audio.speak('대한민국'), null);
  assert.equal(env.player.calls.length, 1);
  assert.equal(env.audio.isSpeaking(), false);
});

test('무음 열기의 늦은 Promise가 실제 Sua 재생을 멈추지 않는다', async () => {
  const env = setup();
  env.audio.unlock();
  const prime = env.player.calls[0];
  assert.match(prime.src, /^data:audio\/wav;base64,/);
  env.audio.say(['정답']);
  const pauses = env.player.pauseCount;
  prime.resolve();
  await flush();
  assert.equal(env.player.pauseCount, pauses);
  assert.equal(env.player.src, 'audio/sua/correct.mp3');
  env.audio.unlock();
  assert.equal(env.player.calls.length, 2);
});

test('speak 콜백과 명시적 queue 옵션이 순서대로 작동한다', async () => {
  const env = setup();
  const events = [];
  const first = env.audio.speak('정답');
  first.onstart = () => events.push('start');
  first.onend = () => events.push('end');
  env.audio.speak('대한민국', { queue: true });
  env.player.calls[0].resolve();
  await flush();
  env.player.onended();
  assert.deepEqual(events, ['start', 'end']);
  assert.equal(env.player.src, 'audio/sua/korea.mp3');
  env.player.onended();
  assert.equal(env.audio.isSpeaking(), false);
});

test('미리 불러오기는 재생을 시작하지 않고 가까운 네 문장만 가져온다', async () => {
  const env = setup();
  env.audio.preload(['정답', '정답', '대한민국', '미등록 문장', '설명']);
  await flush();
  assert.deepEqual(env.fetches, ['audio/sua/correct.mp3', 'audio/sua/korea.mp3']);
  assert.equal(env.players.length, 0);
});


test('전체 음원 ready 확인 전에는 기존 읽어주기를 교체하지 않는다', () => {
  const env = setup({ ready: false, legacy: true });
  assert.strictEqual(env.audio, env.originalAudio);
  env.audio.speak('대한민국');
  assert.equal(env.utterances[0].text, '대한민국');
  assert.equal(env.players.length, 0);
});

test('ready 확인 후에는 기존 합성음을 호출하지 않고 정적 엔진을 사용한다', () => {
  const env = setup({ ready: true, legacy: true });
  assert.notStrictEqual(env.audio, env.originalAudio);
  env.audio.speak('대한민국');
  assert.equal(env.player.src, 'audio/sua/korea.mp3');
  assert.equal(env.utterances.length, 0);
});

test('기존 엔진도 stopSpeaking 이후 이전 재시도를 되살리지 않는다', () => {
  const env = setup({ ready: false, legacy: true });
  let failed = 0;
  env.audio.say(['정답', '대한민국'], {}, () => failed++);
  assert.equal(env.utterances.length, 2);
  env.audio.stopSpeaking();
  env.advance(10000);
  assert.equal(env.utterances.length, 2);
  assert.equal(failed, 0);
  assert.equal(env.timers.size, 0);
});

test('기존 엔진의 cancel 이후 150ms 대기도 화면을 떠나면 취소된다', () => {
  const env = setup({ ready: false, legacy: true });
  env.sandbox.speechSynthesis.speaking = true;
  env.audio.say(['정답']);
  env.audio.stopSpeaking();
  env.advance(10000);
  assert.equal(env.utterances.length, 0);
  assert.equal(env.timers.size, 0);
});

test('기존 엔진에서 새 다시 듣기가 이전 묶음의 재시도와 실패 안내를 지운다', () => {
  const env = setup({ ready: false, legacy: true });
  let oldFailure = 0;
  env.audio.say(['정답'], {}, () => oldFailure++);
  env.audio.say(['대한민국']);
  env.utterances[1].onstart();
  env.advance(10000);
  assert.deepEqual(env.utterances.map((u) => u.text), ['정답', '대한민국']);
  assert.equal(oldFailure, 0);
});

test('기존 엔진의 단일 이름 읽기도 이전 설명 재시도를 취소한다', () => {
  const env = setup({ ready: false, legacy: true });
  env.audio.say(['설명']);
  env.audio.speak('대한민국');
  env.advance(10000);
  assert.deepEqual(env.utterances.map((u) => u.text), ['설명', '대한민국']);
  assert.equal(env.timers.size, 0);
});
