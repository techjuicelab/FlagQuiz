import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/music.js', import.meta.url), 'utf8');
function setup({ ready = true, noAudio = false, clips } = {}) {
  let now = 0, nextTimer = 1;
  const timers = new Map(), players = [];
  class FakeAudio {
    constructor() { this.src = ''; this.duration = 2; this.calls = []; this.pauseCount = 0; players.push(this); }
    setAttribute() {}
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() {}
    pause() { this.pauseCount++; }
    play() {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      this.calls.push({ src: this.src, resolve, reject, ended: this.onended, playing: this.onplaying, error: this.onerror, metadata: this.onloadedmetadata });
      return promise;
    }
  }
  const sandbox = {
    Audio: noAudio ? null : FakeAudio,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } },
    Math: Object.assign(Object.create(Math), { random: () => 0 }),
    setTimeout(fn, delay = 0) { const id = nextTimer++; timers.set(id, { fn, time: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    FQ: { musicManifest: { ready, clips: clips || [
      { id: 'chest-one', event: 'chest', src: 'audio/music/chest-one.mp3', duration: 2 },
      { id: 'chest-two', event: 'chest', src: 'audio/music/chest-two.mp3', duration: 2 },
      { id: 'discovery-one', event: 'discovery', src: 'audio/music/discovery-one.mp3', duration: 1 },
      { id: 'home', event: 'homeBgm', src: 'audio/music/home.mp3', duration: 20 }
    ] } }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  return {
    music: sandbox.FQ.music, sandbox, players, timers,
    get player() { return players[0]; },
    advance(ms) {
      const target = now + ms;
      while (true) {
        const due = [...timers.entries()].filter(([, t]) => t.time <= target).sort((a, b) => a[1].time - b[1].time)[0];
        if (!due) break;
        now = due[1].time; timers.delete(due[0]); due[1].fn();
      }
      now = target;
    }
  };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
async function ended(env) {
  env.player.calls.at(-1).resolve(); await flush(); env.player.onended(); env.advance(0);
}

test('상자 음악은 한 요소에서 원음 속도로 재생하고 직전 곡을 반복하지 않는다', async () => {
  const env = setup(); let done = 0;
  env.music.play('chest', { onDone: () => done++ });
  assert.equal(env.player.src, 'audio/music/chest-one.mp3');
  assert.equal(env.player.volume, 0.45);
  assert.equal(env.player.playbackRate, 1);
  assert.equal(env.music.isPlaying(), true);
  await ended(env);
  assert.equal(done, 1);
  assert.equal(env.music.isPlaying(), false);
  env.music.play('chest');
  assert.equal(env.player.src, 'audio/music/chest-two.mp3');
  await ended(env);
  env.music.play('chest');
  assert.equal(env.player.src, 'audio/music/chest-one.mp3');
  await ended(env);
  assert.equal(env.players.length, 1);
  assert.equal(env.timers.size, 0);
});

test('소리 꺼짐·미준비·없는 이벤트·미지원은 비동기 완료로 다음 설명을 이어준다', () => {
  for (const variant of ['muted', 'unready', 'unknown', 'unsupported', 'invalid']) {
    const env = setup({ ready: variant !== 'unready', noAudio: variant === 'unsupported',
      clips: variant === 'invalid' ? [{ id: 'bad', event: 'chest', src: 'https://external.test/music.mp3', duration: 2 }] : undefined });
    let done = 0, failed = 0;
    if (variant === 'muted') env.music.setEnabled(false);
    env.music.play(variant === 'unknown' ? 'missing' : 'chest', { onDone: () => done++, onFail: () => failed++ });
    assert.equal(done, 0, variant);
    assert.equal(env.music.isPlaying(), false, variant);
    env.advance(0);
    assert.equal(done, 1, variant);
    assert.equal(failed, 0, variant);
    assert.equal(env.player?.calls.length || 0, 0, variant);
  }
});

test('화면을 떠나면 음소거의 대기 중 완료 콜백도 취소한다', () => {
  const env = setup(); let done = 0;
  env.music.setEnabled(false);
  const cancel = env.music.play('chest', { onDone: () => done++ });
  cancel(); env.advance(10000);
  assert.equal(done, 0);
  assert.equal(env.timers.size, 0);
});

test('빠른 다음 재생과 오래된 취소 함수는 새 곡의 이벤트·콜백을 건드리지 않는다', async () => {
  const env = setup(); let oldDone = 0, oldFail = 0, newDone = 0;
  const cancel = env.music.play('chest', { onDone: () => oldDone++, onFail: () => oldFail++ });
  const old = env.player.calls[0];
  env.music.play('discovery', { onDone: () => newDone++ });
  old.resolve(); old.playing(); old.ended(); old.error(); old.metadata(); cancel();
  await flush();
  assert.equal(env.player.src, 'audio/music/discovery-one.mp3');
  assert.equal(env.music.isPlaying(), true);
  await ended(env); env.advance(100000);
  assert.equal(oldDone, 0); assert.equal(oldFail, 0); assert.equal(newDone, 1);
});

test('음소거와 정지는 아직 해결되지 않은 play와 실패·종료 콜백을 취소한다', async () => {
  for (const action of ['stop', 'mute', 'cancel']) {
    const env = setup(); let callbacks = 0;
    const cancel = env.music.play('chest', { onDone: () => callbacks++, onFail: () => callbacks++ });
    const old = env.player.calls[0];
    if (action === 'stop') env.music.stop();
    else if (action === 'mute') env.music.setEnabled(false);
    else cancel();
    old.reject({ name: 'NotAllowedError' }); old.playing(); old.ended(); old.error();
    await flush(); env.advance(200000);
    assert.equal(env.player.src, '', action);
    assert.equal(env.music.isPlaying(), false, action);
    assert.equal(callbacks, 0, action);
    assert.equal(env.timers.size, 0, action);
  }
});

test('종료 뒤 다음 틱의 콜백도 정지하면 되살아나지 않는다', async () => {
  const env = setup(); let done = 0;
  env.music.play('chest', { onDone: () => done++ });
  env.player.calls[0].resolve(); await flush(); env.player.onended();
  assert.equal(env.music.isPlaying(), false);
  env.music.stop(); env.advance(0);
  assert.equal(done, 0);
});

test('파일 오류와 play 거부가 겹쳐도 실패는 한 번만 알린다', async () => {
  const env = setup(); const failures = []; let done = 0;
  env.music.play('chest', { onDone: () => done++, onFail: error => failures.push(error.code) });
  const call = env.player.calls[0];
  call.error(); call.reject(new Error('network')); call.playing(); call.ended();
  await flush(); env.advance(100000);
  assert.deepEqual(failures, ['audio-file-error']);
  assert.equal(done, 0);
  assert.equal(env.player.src, '');
  assert.equal(env.music.isPlaying(), false);
});

test('권한 거부 후 다음 손가락 조작으로 무음을 다시 열 수 있다', async () => {
  const env = setup(); const errors = [];
  env.music.play('chest', { onFail: error => errors.push(error.code) });
  env.player.calls[0].reject({ name: 'NotAllowedError' }); await flush(); env.advance(0);
  assert.deepEqual(errors, ['playback-blocked']);
  env.music.unlock();
  assert.match(env.player.src, /^data:audio\/wav;base64,/);
  assert.equal(env.player.volume, 0);
  env.player.calls[1].resolve(); await flush();
  env.music.play('discovery');
  assert.equal(env.player.volume, 0.45);
  assert.equal(env.players.length, 1);
});

test('onFail이 없는 오류는 onDone으로 게임 흐름을 풀어 준다', async () => {
  const env = setup(); const callbacks = [];
  env.music.play('chest', { onDone: error => callbacks.push(error.code) });
  env.player.calls[0].reject(new Error('network')); await flush(); env.advance(0);
  assert.deepEqual(callbacks, ['playback-failed']);
});

test('시작과 종료 이벤트가 빠져도 짧은 음악이 게임을 무한히 붙잡지 않는다', async () => {
  const env = setup(); const errors = [];
  env.music.play('chest', { onFail: error => errors.push(error.code) });
  env.advance(6000);
  assert.deepEqual(errors, ['start-timeout']);
  assert.equal(env.music.isPlaying(), false);
  env.music.play('chest', { onFail: error => errors.push(error.code) });
  env.player.calls[1].resolve(); await flush(); env.advance(4500);
  assert.deepEqual(errors, ['start-timeout', 'playback-timeout']);
  assert.equal(env.timers.size, 0);
});

test('무음 열기의 늦은 Promise나 타이머는 새 음악을 정지하지 않는다', async () => {
  const env = setup(); env.music.unlock(); env.music.unlock();
  assert.equal(env.player.calls.length, 1);
  const old = env.player.calls[0];
  env.music.play('chest');
  const pauses = env.player.pauseCount;
  old.resolve(); await flush();
  assert.equal(env.player.pauseCount, pauses);
  assert.equal(env.player.src, 'audio/music/chest-one.mp3');
  await ended(env); env.advance(100000);
  assert.equal(env.timers.size, 0);
});

test('무음 열기가 응답하지 않아도 타임아웃 후 다시 시도하고 stop으로 취소한다', () => {
  const env = setup(); env.music.unlock(); env.advance(6000);
  assert.equal(env.player.src, ''); assert.equal(env.timers.size, 0);
  env.music.unlock(); assert.equal(env.player.calls.length, 2);
  env.music.stop(); assert.equal(env.timers.size, 0);
});

test('배경음은 명시적으로 켜야 나오고 홈 재렌더 때 반복 시작하지 않는다', async () => {
  const env = setup(); let done = 0;
  env.music.play('homeBgm', { onDone: () => done++ }); env.advance(0);
  assert.equal(done, 1); assert.equal(env.players.length, 0);
  env.music.setBgmEnabled(true);
  const cancel = env.music.play('homeBgm');
  assert.equal(env.player.loop, true); assert.equal(env.player.volume, 0.18);
  env.player.calls[0].resolve(); await flush();
  assert.strictEqual(env.music.play('homeBgm'), cancel);
  env.advance(200000);
  assert.equal(env.music.isPlaying(), true);
  assert.equal(env.player.calls.length, 1);
  env.music.play('discovery');
  assert.equal(env.player.loop, false);
  assert.equal(env.player.src, 'audio/music/discovery-one.mp3');
  cancel(); assert.equal(env.music.isPlaying(), true);
  await ended(env);
});

test('배경음 설정을 끄면 배경음만 멈추고 축하음은 계속한다', async () => {
  const env = setup(); env.music.setBgmEnabled(true); env.music.play('homeBgm');
  env.music.setBgmEnabled(false);
  assert.equal(env.player.src, ''); assert.equal(env.music.isPlaying(), false);
  env.music.play('chest'); env.music.setBgmEnabled(false);
  assert.equal(env.music.isPlaying(), true); await ended(env);
});

test('끝 콜백이 곧바로 새 곡을 시작해도 이전 정리가 새 곡을 끊지 않는다', async () => {
  const env = setup();
  env.music.play('chest', { onDone: () => env.music.play('discovery') });
  await ended(env);
  assert.equal(env.player.src, 'audio/music/discovery-one.mp3');
  assert.equal(env.music.isPlaying(), true);
  await ended(env); assert.equal(env.timers.size, 0);
});
