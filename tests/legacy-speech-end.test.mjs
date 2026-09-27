import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8');

function setup({ throwOnSpeak = false, speakNow = false } = {}) {
  let now = 0;
  let nextTimer = 1;
  const timers = new Map();
  const utterances = [];
  const synth = {
    speaking: false,
    pending: false,
    cancelled: 0,
    getVoices() { return []; },
    speak(utterance) {
      utterances.push(utterance);
      if (throwOnSpeak) throw new Error('speech unavailable');
      if (speakNow) { utterance.onstart?.(); utterance.onend?.(); }
    },
    cancel() { this.cancelled++; this.speaking = false; this.pending = false; }
  };
  const sandbox = {
    speechSynthesis: synth,
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    setTimeout(fn, delay = 0) { const id = nextTimer++; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  return {
    audio: sandbox.FQ.audio, synth, utterances, timers,
    advance(ms) {
      const end = now + ms;
      while (true) {
        const due = [...timers.entries()].filter(([, item]) => item.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
      }
      now = end;
    }
  };
}

test('기존 합성음은 여러 문장의 마지막 발화가 끝날 때 한 번만 완료된다', () => {
  const env = setup();
  let ended = 0, failed = 0;
  env.audio.say(['정답', '대한민국', '설명'], { onEnd: () => ended++ }, () => failed++);
  assert.deepEqual(env.utterances.map(u => u.text), ['정답', '대한민국', '설명']);
  env.utterances[0].onstart();
  env.utterances[0].onend?.();
  env.utterances[1].onend?.();
  assert.equal(ended, 0);
  env.utterances[2].onend();
  env.utterances[2].onend();
  env.advance(10000);
  assert.equal(ended, 1);
  assert.equal(failed, 0);
  assert.equal(env.timers.size, 0);
});

test('브라우저가 발화 이벤트를 즉시 보내도 완료 콜백을 받는다', () => {
  const env = setup({ speakNow: true });
  let ended = 0, failed = 0;
  env.audio.say(['정답', '대한민국'], { onEnd: () => ended++ }, () => failed++);
  assert.equal(ended, 1);
  assert.equal(failed, 0);
  assert.equal(env.timers.size, 0);
});

test('읽기 취소 및 설정 해제 후 늦은 종료·오류 이벤트가 콜백을 되살리지 않는다', () => {
  for (const disable of [false, true]) {
    const env = setup();
    let ended = 0, failed = 0;
    env.audio.say(['정답', '설명'], { onEnd: () => ended++ }, () => failed++);
    env.utterances[0].onstart();
    if (disable) env.audio.setSpeakEnabled(false);
    else env.audio.stopSpeaking();
    env.utterances[1].onend();
    env.utterances[0].onerror();
    env.advance(10000);
    assert.equal(ended, 0);
    assert.equal(failed, 0);
    assert.equal(env.timers.size, 0);
  }
});

test('새 읽기가 시작되면 이전 문장의 늦은 종료는 새 읽기를 넘기지 않는다', () => {
  const env = setup();
  let oldEnd = 0, oldFail = 0, newEnd = 0;
  env.audio.say(['정답', '설명'], { onEnd: () => oldEnd++ }, () => oldFail++);
  const oldLast = env.utterances[1];
  env.synth.pending = true;
  env.audio.say(['대한민국'], { onEnd: () => newEnd++ });
  env.advance(150);
  oldLast.onend();
  oldLast.onerror();
  assert.equal(oldEnd, 0);
  assert.equal(oldFail, 0);
  env.utterances[2].onstart();
  env.utterances[2].onend();
  assert.equal(newEnd, 1);
  assert.equal(env.timers.size, 0);
});

test('재생 오류는 기존 실패 안내를 한 번만 보내고 늦은 완료를 막는다', () => {
  const env = setup();
  let ended = 0, failed = 0;
  env.audio.say(['정답', '설명'], { onEnd: () => ended++ }, () => failed++);
  const [first, last] = env.utterances;
  first.onstart();
  first.onerror();
  first.onerror();
  last.onend();
  env.advance(10000);
  assert.equal(ended, 0);
  assert.equal(failed, 1);
  assert.equal(env.timers.size, 0);
});

test('시작 실패로 세 번 재시도한 뒤 기존 실패 콜백을 한 번만 보낸다', () => {
  const env = setup();
  let ended = 0, failed = 0;
  env.audio.say(['정답', '설명'], { onEnd: () => ended++ }, () => failed++);
  env.advance(1800);
  assert.equal(env.utterances.length, 6);
  assert.equal(failed, 1);
  for (const utterance of env.utterances) {
    utterance.onend?.();
    utterance.onerror?.();
  }
  env.advance(10000);
  assert.equal(ended, 0);
  assert.equal(failed, 1);
  assert.equal(env.timers.size, 0);
});

test('재시도 뒤 먼저 들린 묶음이 끝나면 중복 큐를 멈추고 한 번만 완료된다', () => {
  const env = setup();
  let ended = 0, failed = 0;
  env.audio.say(['정답', '대한민국'], { onEnd: () => ended++ }, () => failed++);
  env.advance(600);
  assert.equal(env.utterances.length, 4);
  env.utterances[0].onstart();
  env.utterances[1].onend();
  env.utterances[3].onend();
  env.advance(10000);
  assert.equal(ended, 1);
  assert.equal(failed, 0);
  assert.equal(env.synth.cancelled, 1);
  assert.equal(env.timers.size, 0);
});

test('합성음 enqueue 예외도 실패 안내를 하고 후속 문장을 큐에 넣지 않는다', () => {
  const env = setup({ throwOnSpeak: true });
  let ended = 0, failed = 0;
  env.audio.say(['정답', '설명'], { onEnd: () => ended++ }, () => failed++);
  assert.equal(env.utterances.length, 1);
  env.utterances[0].onend?.();
  env.advance(10000);
  assert.equal(ended, 0);
  assert.equal(failed, 1);
  assert.equal(env.timers.size, 0);
});
