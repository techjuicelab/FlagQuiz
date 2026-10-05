import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

// 실제 녹음·WAV 변환·speech facade를 실행한다. 가상 PCM은 녹음된 시간 구간만 재현한다.
// 고정된 STT 문자열을 돌려주는 검사가 놓치는 첫/마지막 음절 손실을 파형으로 확인한다.
function fixture(mode, { initialRms = 0 } = {}) {
  let now = 0, timerId = 0, rms = initialRms;
  const signal = [{ at: 0, rms }], timers = new Map();
  const streams = [], recorders = [], requests = [], states = [], results = [], errors = [], ends = [];
  function stream() {
    const track = new EventTarget();
    Object.assign(track, { readyState: 'live', enabled: true, stops: 0,
      stop() { this.stops++; this.readyState = 'ended'; } });
    const value = { track, getTracks: () => [track] };
    streams.push(value); return value;
  }
  class Recorder {
    static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
    constructor(input, options) { this.stream = input; this.mimeType = options.mimeType; this.state = 'inactive'; recorders.push(this); }
    start() { this.state = 'recording'; this.started = now; this.lastData = now; }
    requestData() {
      this.ondataavailable?.({ data: new Blob([JSON.stringify({ from: this.lastData, to: now }) + '\n']) });
      this.lastData = now;
    }
    stop() { this.state = 'inactive'; this.requestData(); this.onstop?.(); }
  }
  class Audio {
    constructor() { this.state = 'running'; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createMediaStreamSource(input) { this.input = input; return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: samples => {
      const amplitude = this.input.track.enabled && this.input.track.readyState === 'live' ? rms : 0;
      for (let i = 0; i < samples.length; i++) samples[i] = amplitude * Math.SQRT2 * Math.sin(2 * Math.PI * i / 16);
    } }; }
    decodeAudioData(bytes) {
      const chunks = new TextDecoder().decode(bytes).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      const from = chunks[0]?.from ?? now, to = chunks.at(-1)?.to ?? now;
      const length = Math.round((to - from) * 16), samples = new Float32Array(length);
      let segment = signal.findLastIndex(item => item.at <= from);
      for (let i = 0; i < length; i++) {
        const at = from + i / 16;
        while (segment + 1 < signal.length && signal[segment + 1].at <= at) segment++;
        samples[i] = (signal[segment]?.rms || 0) * Math.SQRT2 * Math.sin(2 * Math.PI * i / 16);
      }
      return Promise.resolve({ length, sampleRate: 16000, numberOfChannels: 1, getChannelData: () => samples });
    }
  }
  class Clock extends Date { static now() { return now; } }
  const window = {
    navigator: { onLine: true, mediaDevices: { getUserMedia: async () => stream() } },
    location: { hostname: 'localhost', origin: 'http://localhost', href: 'http://localhost/' }, isSecureContext: true,
    MediaRecorder: Recorder, AudioContext: Audio, Blob, AbortController, URL,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url, config) => {
      requests.push({ url, config, at: now, pcm: new DataView(await config.body.arrayBuffer()) });
      return { ok: true, status: 200, json: async () => ({ text: mode === 'capitalVoice' ? '서울' : '포르투갈',
        playerId: config.headers['X-Player-Id'], turnId: config.headers['X-Turn-Id'], mode: config.headers['X-Speech-Mode'] }) };
    },
    FQ: { auth: { session: () => ({ preview: false }), csrfToken: () => 'synthetic-csrf' },
      audio: { cueListening(done) { done(); } } }
  };
  const context = vm.createContext({ window, Date: Clock });
  for (const file of ['js/cloud-speech.js', 'js/speech.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context, { filename: file });
  }
  function start() {
    return window.FQ.speech.start({ mode, playerId: 0, turnId: 'capture_probe',
      state: state => states.push(state), result: text => results.push(text),
      error: code => errors.push(code), end: metadata => ends.push(metadata) });
  }
  async function advance(ms) {
    const target = now + ms;
    for (;;) {
      const due = [...timers].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at; timers.delete(due[0]); due[1].fn(); await flush();
    }
    now = target; await flush();
  }
  function peakIn(request, fromMs, toMs) {
    let peak = 0;
    const pcm = request.pcm, end = Math.min(pcm.byteLength, 44 + Math.floor(toMs * 16) * 2);
    for (let at = 44 + Math.floor(fromMs * 16) * 2; at < end; at += 2) peak = Math.max(peak, Math.abs(pcm.getInt16(at, true)) / 32767);
    return peak;
  }
  return { window, streams, recorders, requests, states, results, errors, ends, timers, start, advance, peakIn,
    setRms(value) { rms = value; signal.push({ at: now, rms }); }, cancel() { window.FQ.speech.abort(); } };
}

for (const mode of ['voice', 'capitalVoice']) for (const gapMs of [150, 220, 300, 500]) {
  test(`${mode}: 음절 사이 ${gapMs}ms 쉼 뒤 실제 둘째 음절 PCM을 한 WAV에 보존한다`, async t => {
    const f = fixture(mode); t.after(() => f.cancel());
    assert.equal(f.start(), true); await flush();
    await f.advance(300); f.setRms(0.03); await f.advance(400); f.setRms(0); await f.advance(gapMs);
    assert.equal(f.requests.length, 0, '아직 한 답을 말하는 도중 앞 음절만 전사하면 안 된다');
    assert.equal(f.window.FQ.speech.isListening(), true);
    f.setRms(0.09); await f.advance(400); f.setRms(0); await f.advance(3000);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].config.headers['X-Speech-Mode'], mode);
    assert.ok(f.peakIn(f.requests[0], 600, 700) > 0.04, '첫 음절의 마지막 100ms 보존');
    assert.ok(f.peakIn(f.requests[0], 1000 + gapMs, 1100 + gapMs) > 0.12, '둘째 음절의 마지막 100ms가 실제 WAV에 있어야 한다');
    assert.ok(Number(f.requests[0].config.headers['X-Audio-Duration-Ms']) >= 1100 + gapMs, '둘째 음절 끝 이후까지 녹음해야 한다');
    assert.equal(f.results.length, 1); assert.equal(f.errors.length, 0);
    await f.advance(60000); assert.equal(f.requests.length, 1, '답 하나로 자동 유료 재전송하면 안 된다');
    assert.equal(f.timers.size, 0);
  });
}

for (const mode of ['voice', 'capitalVoice']) test(`${mode}: 듣기 시작과 동시에 말한 작은 RMS0.006 답의 PCM을 보존한다`, async t => {
  const f = fixture(mode, { initialRms: 0.006 }); t.after(() => f.cancel());
  assert.equal(f.start(), true); await flush();
  await f.advance(500); f.setRms(0); await f.advance(6000);
  assert.equal(f.requests.length, 1, '첫 발화를 배경 소음으로 고정해 no-speech로 버리면 안 된다');
  assert.ok(f.peakIn(f.requests[0], 400, 500) > 0.008, '작은 첫 목소리의 마지막 100ms도 보존한다');
  assert.equal(f.results.length, 1); assert.equal(f.errors.length, 0);
});

for (const mode of ['voice', 'capitalVoice']) test(`${mode}: 마지막 음절이 작아져도 원본 WAV에서 꼬리를 잘라내지 않는다`, async t => {
  const f = fixture(mode); t.after(() => f.cancel());
  assert.equal(f.start(), true); await flush();
  await f.advance(300); f.setRms(0.03); await f.advance(400);
  f.setRms(0.0018); await f.advance(450);
  assert.equal(f.requests.length, 0, '큰 앞 음절 뒤 작은 마지막 음절을 말하는 중 전송하면 안 된다');
  f.setRms(0); await f.advance(3000);
  assert.equal(f.requests.length, 1);
  assert.ok(f.peakIn(f.requests[0], 1130, 1150) > 0.0024, '음량이 낮은 마지막 20ms도 WAV 안에 남아야 한다');
  assert.ok(Number(f.requests[0].config.headers['X-Audio-Duration-Ms']) >= 1150);
  assert.equal(f.results.length, 1); assert.equal(f.errors.length, 0);
});

for (const mode of ['voice', 'capitalVoice']) test(`${mode}: 짧은 80ms 음절 둘 사이 40ms 쉼을 누적 발화로 보존한다`, async t => {
  const f = fixture(mode); t.after(() => f.cancel());
  assert.equal(f.start(), true); await flush(); await f.advance(300);
  f.setRms(0.006); await f.advance(80); f.setRms(0); await f.advance(40);
  f.setRms(0.009); await f.advance(80); f.setRms(0); await f.advance(3000);
  assert.equal(f.requests.length, 1, '짧은 음절을 각각 버려 한 단어 전체가 no-speech가 되면 안 된다');
  assert.ok(f.peakIn(f.requests[0], 360, 380) > 0.008, '첫 짧은 음절의 마지막 20ms');
  assert.ok(f.peakIn(f.requests[0], 480, 500) > 0.012, '둘째 짧은 음절의 마지막 20ms');
  assert.equal(f.results.length, 1); assert.equal(f.errors.length, 0);
});

for (const mode of ['voice', 'capitalVoice']) test(`${mode}: 선행 무음 없이 시작한 80ms+40ms쉼+80ms 답의 마지막 PCM을 보존한다`, async t => {
  const f = fixture(mode, { initialRms: 0.006 }); t.after(() => f.cancel());
  assert.equal(f.start(), true); await flush(); await f.advance(80);
  f.setRms(0); await f.advance(40);
  f.setRms(0.009); await f.advance(80); f.setRms(0); await f.advance(3000);
  assert.equal(f.requests.length, 1, '시작의 짧은 첫 음절도 바로 이어진 둘째 음절과 누적해야 한다');
  assert.ok(f.peakIn(f.requests[0], 60, 80) > 0.008, '시작 첫 음절의 마지막 20ms');
  assert.ok(f.peakIn(f.requests[0], 180, 200) > 0.012, '둘째 음절의 마지막 20ms');
  assert.equal(f.results.length, 1); assert.equal(f.errors.length, 0);
  await f.advance(60000); assert.equal(f.requests.length, 1); assert.equal(f.timers.size, 0);
});

for (const mode of ['voice', 'capitalVoice']) for (const initialRms of [0.006, 0.1]) for (const durationMs of [40, 80]) {
  test(`${mode}: 듣기 시작의 단독 RMS${initialRms}/${durationMs}ms 신호를 유료 전사하지 않는다`, async t => {
    const f = fixture(mode, { initialRms }); t.after(() => f.cancel());
    assert.equal(f.start(), true); await flush(); await f.advance(durationMs);
    f.setRms(0); await f.advance(6000);
    assert.equal(f.requests.length, 0); assert.deepEqual(f.errors, ['no-speech']);
    assert.equal(f.streams.length, 1); assert.equal(f.streams[0].track.stops, 1);
    await f.advance(60000); assert.equal(f.requests.length, 0);
  });
}

for (const mode of ['voice', 'capitalVoice']) test(`${mode}: 초기 배경 소음이 낮아진 뒤 작은 진짜 발화의 PCM을 놓치지 않는다`, async t => {
  const f = fixture(mode, { initialRms: 0.015 }); t.after(() => f.cancel());
  assert.equal(f.start(), true); await flush(); await f.advance(1000);
  f.setRms(0); await f.advance(600);
  assert.equal(f.requests.length, 0, '배경 신호만 끝났다는 이유로 전사하면 안 된다');
  f.setRms(0.006); await f.advance(500); f.setRms(0); await f.advance(3000);
  assert.equal(f.requests.length, 1);
  assert.ok(f.peakIn(f.requests[0], 2000, 2100) > 0.008, '초기 noiseFloor 때문에 작은 답의 마지막 100ms를 놓치면 안 된다');
  assert.ok(Number(f.requests[0].config.headers['X-Audio-Duration-Ms']) >= 2100);
  assert.equal(f.results.length, 1); assert.equal(f.errors.length, 0);
});

for (const mode of ['voice', 'capitalVoice']) for (const [initialRms, durationMs] of [[0.015, 500], [0.015, 1000], [0.006, 1000]]) {
  test(`${mode}: 초기 평탄 신호 RMS${initialRms}/${durationMs}ms가 끝났을 뿐인 입력은 유료 전사하지 않는다`, async t => {
    const f = fixture(mode, { initialRms }); t.after(() => f.cancel());
    assert.equal(f.start(), true); await flush(); await f.advance(durationMs);
    f.setRms(0); await f.advance(6000);
    assert.equal(f.requests.length, 0, '평탄한 초기 신호의 하강만으로 발화를 확정하면 안 된다');
    assert.deepEqual(f.errors, ['no-speech']);
    assert.equal(f.streams.length, 1); assert.equal(f.streams[0].track.stops, 1);
    await f.advance(60000); assert.equal(f.requests.length, 0); assert.equal(f.timers.size, 0);
  });
}

for (const mode of ['voice', 'capitalVoice']) test(`${mode}: 완전무음과 일정한 배경 신호는 녹음을 종료해도 유료 요청하지 않는다`, async t => {
  for (const initialRms of [0, 0.015]) {
    const f = fixture(mode, { initialRms }); t.after(() => f.cancel());
    assert.equal(f.start(), true); await flush(); await f.advance(6000);
    assert.equal(f.requests.length, 0);
    assert.deepEqual(f.errors, ['no-speech']);
    await f.advance(60000); assert.equal(f.requests.length, 0);
    assert.equal(f.streams.length, 1); assert.equal(f.streams[0].track.stops, 1);
    assert.equal(f.timers.size, 0);
  }
});
