/* Sua 읽어주기의 취소·순차 재생·실패 안내를 실제 비동기 순서로 검사한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const legacySource = fs.readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../js/recorded-audio.js', import.meta.url), 'utf8');

function setup({ ready = true, legacy = false, online = true, audioContext } = {}) {
  let now = 0;
  let nextTimer = 1;
  const timers = new Map();
  const players = [];
  const fetches = [];
  const utterances = [];
  const events = {};
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
    AudioContext: audioContext,
    navigator: { onLine: online },
    addEventListener(name, callback) { (events[name] ||= []).push(callback); },
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
    network(online) {
      sandbox.navigator.onLine = online;
      for (const callback of events[online ? 'online' : 'offline'] || []) callback();
    },
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

function listeningCueFixture(options = {}) {
  const contexts = [], oscillators = [], gains = [];
  let resolveResume, rejectResume;
  class Context {
    constructor() { this.state = options.suspended ? 'suspended' : 'running'; this.currentTime = 5; this.destination = {}; contexts.push(this); }
    resume() {
      if (options.resumeThrows) throw new Error('audio unavailable');
      return new Promise((resolve, reject) => { resolveResume = () => { this.state = 'running'; resolve(); }; rejectResume = reject; });
    }
    createOscillator() {
      if (options.oscillatorThrows) throw new Error('audio unavailable');
      const oscillator = {
        frequency: { setValueAtTime(value, time) { oscillator.frequencyValue = value; oscillator.frequencyAt = time; } },
        connect() {}, disconnect() { this.disconnected = true; },
        start(time) { this.startedAt = time; }, stop(time) { (this.stops ||= []).push(time); }
      };
      oscillators.push(oscillator); return oscillator;
    }
    createGain() {
      const gain = { values: [], gain: {
        setValueAtTime(value, time) { gain.values.push({ value, time }); },
        linearRampToValueAtTime(value, time) { gain.values.push({ value, time }); }
      }, connect() {}, disconnect() { this.disconnected = true; } };
      gains.push(gain); return gain;
    }
  }
  const f = setup({ ready: options.recorded === true, legacy: true, audioContext: Context });
  return { ...f, contexts, oscillators, gains, resolveResume: () => resolveResume(), rejectResume: () => rejectResume(new Error('private audio detail')) };
}

test('녹음 준비 비프는 두 오디오 엔진에서 45ms 작게 재생하고 실제 종료 후에만 완료된다', () => {
  for (const recorded of [false, true]) {
    const f = listeningCueFixture({ recorded }); let ended = 0;
    f.audio.cueListening(() => ended++);
    assert.equal(f.oscillators.length, 1);
    const beep = f.oscillators[0];
    assert.equal(beep.type, 'sine');
    assert.equal(beep.frequencyValue, 880);
    assert.ok(Math.abs(beep.stops[0] - beep.startedAt - 0.045) < 0.000001);
    assert.ok(Math.max(...f.gains[0].values.map(entry => entry.value)) <= 0.03);
    assert.equal(ended, 0, '비프가 끝나기 전에 마이크 표본을 받지 않는다');
    const lateEnd = beep.onended; lateEnd(); lateEnd(); f.advance(1000);
    assert.equal(ended, 1); assert.equal(beep.disconnected, true); assert.equal(f.gains[0].disconnected, true);
    assert.equal(f.timers.size, 0); assert.equal(f.players.length, 0); assert.equal(f.utterances.length, 0); assert.equal(f.fetches.length, 0);
  }
});

test('소리 OFF와 Web Audio 미지원은 준비 비프 없이 즉시 녹음을 계속한다', () => {
  for (const recorded of [false, true]) {
    const f = listeningCueFixture({ recorded }); let ended = 0;
    f.audio.setEnabled(false); f.audio.cueListening(() => ended++);
    assert.equal(ended, 1); assert.equal(f.contexts.length, 0); assert.equal(f.timers.size, 0);
  }
  const unsupported = setup({ ready: false, legacy: true }); let ended = 0;
  unsupported.audio.cueListening(() => ended++);
  assert.equal(ended, 1); assert.equal(unsupported.timers.size, 0);
});

test('준비 비프의 재생 실패·종료 누락은 한 번만 완료하여 마이크를 막지 않는다', async () => {
  for (const options of [{ oscillatorThrows: true }, { suspended: true, resumeThrows: true }]) {
    const throwing = listeningCueFixture(options); let throwsDone = 0;
    throwing.audio.cueListening(() => throwsDone++); assert.equal(throwsDone, 1); assert.equal(throwing.timers.size, 0);
  }
  const rejected = listeningCueFixture({ suspended: true }); let rejectedDone = 0;
  rejected.audio.cueListening(() => rejectedDone++); rejected.rejectResume(); await flush();
  assert.equal(rejectedDone, 1); assert.equal(rejected.oscillators.length, 0); assert.equal(rejected.timers.size, 0);
  const missingEnd = listeningCueFixture(); let missingDone = 0;
  missingEnd.audio.cueListening(() => missingDone++); const lateEnd = missingEnd.oscillators[0].onended;
  missingEnd.advance(250); lateEnd(); assert.equal(missingDone, 1); assert.equal(missingEnd.oscillators[0].stops.length, 2);
  assert.equal(missingEnd.timers.size, 0);
});

test('재생 허가가 늦게 끝나거나 준비 비프를 취소해도 새 화면에 늦은 소리를 내지 않는다', async () => {
  const pending = listeningCueFixture({ suspended: true }); let pendingDone = 0;
  pending.audio.cueListening(() => pendingDone++); pending.advance(250); pending.resolveResume(); await flush();
  assert.equal(pendingDone, 1); assert.equal(pending.oscillators.length, 0);
  const canceled = listeningCueFixture({ suspended: true }); let canceledDone = 0;
  const cancel = canceled.audio.cueListening(() => canceledDone++); cancel(); canceled.resolveResume(); await flush(); canceled.advance(1000);
  assert.equal(canceledDone, 0); assert.equal(canceled.oscillators.length, 0); assert.equal(canceled.timers.size, 0);
  const playing = listeningCueFixture(); let playingDone = 0;
  const stop = playing.audio.cueListening(() => playingDone++); const lateEnd = playing.oscillators[0].onended;
  stop(); lateEnd(); playing.advance(1000);
  assert.equal(playingDone, 0); assert.equal(playing.oscillators[0].disconnected, true); assert.equal(playing.timers.size, 0);
});

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

test('오프라인에서 응답 없는 음원은 1.5초 안에 실패하고 다시 듣기는 바로 재시도한다', async () => {
  const env = setup({ online: false });
  const failures = [];
  env.audio.say(['정답'], {}, error => failures.push(error.code));
  const old = env.player.calls[0];
  env.advance(1499);
  assert.deepEqual(failures, []);
  env.advance(1);
  assert.deepEqual(failures, ['offline-audio-unavailable']);
  assert.equal(env.audio.isSpeaking(), false);
  old.resolve(); old.ended(); old.error(); await flush();
  env.audio.say(['대한민국']);
  env.player.calls[1].resolve(); await flush();
  env.player.onended(); env.advance(200000);
  assert.deepEqual(failures, ['offline-audio-unavailable']);
  assert.equal(env.timers.size, 0);
});

test('오프라인 저장 음원과 잠깐 버퍼링 후 이어지는 음원은 끝까지 재생한다', async () => {
  const env = setup({ online: false });
  let ended = 0; const failures = [];
  env.audio.say(['설명'], { onEnd: () => ended++ }, error => failures.push(error.code));
  env.player.calls[0].resolve(); await flush();
  env.advance(1600);
  assert.equal(env.audio.isSpeaking(), true);
  env.player.onwaiting(); env.advance(1000);
  env.player.onplaying(); env.advance(1600);
  assert.deepEqual(failures, []);
  env.player.onended();
  assert.equal(ended, 1);
  assert.equal(env.timers.size, 0);
});

test('온라인 재생 대기는 유지하고 연결 중단과 재연결에 맞춰 오프라인 대기를 조정한다', async () => {
  const env = setup(); const failures = [];
  env.audio.say(['설명'], {}, error => failures.push(error.code));
  env.advance(2000);
  assert.equal(env.audio.isSpeaking(), true);
  env.network(false); env.advance(1000); env.network(true); env.advance(1600);
  assert.deepEqual(failures, []);
  env.player.calls[0].resolve(); await flush();
  env.player.readyState = 4;
  env.network(false); env.advance(1600);
  assert.equal(env.audio.isSpeaking(), true, '이미 준비된 음원은 연결이 끊겨도 이어진다');
  env.player.onstalled(); env.advance(1600);
  assert.equal(env.audio.isSpeaking(), true, '버퍼가 충분하면 네트워크 이벤트만으로 중단하지 않는다');
  env.player.readyState = 2;
  env.player.onstalled(); env.advance(1500);
  assert.deepEqual(failures, ['offline-audio-unavailable']);
  assert.equal(env.timers.size, 0);
});

test('온라인으로 시작한 읽어주기가 연결 중단 뒤 준비되지 않으면 빠르게 끝난다', () => {
  const env = setup(); const failures = [];
  env.audio.say(['설명'], {}, error => failures.push(error.code));
  env.network(false); env.advance(1500);
  assert.deepEqual(failures, ['offline-audio-unavailable']);
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
