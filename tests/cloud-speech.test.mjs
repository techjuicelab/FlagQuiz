import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { validateSpeechInput } from '../server/speech.mjs';

const source = fs.readFileSync(new URL('../js/cloud-speech.js', import.meta.url), 'utf8');
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function flush() { for (let i = 0; i < 15; i++) await Promise.resolve(); }

function fixture(options = {}) {
  let now = 0, nextTimer = 0, loud = 0, csrf = 'session-csrf';
  const timers = new Map(), recorders = [], streams = [], contexts = [], requests = [], results = [], errors = [], states = [];
  const media = options.media || null;
  function stream() { const track = { stops: 0, stop() { this.stops++; } }; const value = { track, getTracks: () => [track] }; streams.push(value); return value; }
  class Recorder {
    static isTypeSupported(type) { return type === (options.mp4 ? 'audio/mp4' : 'audio/webm;codecs=opus'); }
    constructor(input, config) { this.state = 'inactive'; this.mimeType = config.mimeType; this.stream = input; this.stops = 0; recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.stops++; this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['recorded audio']) }); this.onstop?.(); }
  }
  class Audio {
    constructor() { this.closed = 0; contexts.push(this); }
    resume() { return Promise.resolve(); }
    close() { this.closed++; return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: values => values.fill(loud) }; }
    decodeAudioData() {
      if (options.decode) return options.decode.promise;
      if (options.decodeError) return Promise.reject(new Error('codec unavailable'));
      const length = options.longAudio ? 14 * 48000 : 48000;
      return Promise.resolve({ length, sampleRate: 48000, numberOfChannels: 2, getChannelData: () => new Float32Array(length).fill(options.sample ?? 0.25) });
    }
  }
  class Clock extends Date { static now() { return now; } }
  const window = {
    navigator: { mediaDevices: { getUserMedia: () => media ? media.promise : Promise.resolve(stream()) } },
    location: { hostname: 'localhost', origin: 'http://localhost', href: 'http://localhost/' }, isSecureContext: true,
    MediaRecorder: options.unsupported ? null : Recorder, AudioContext: Audio, Blob, AbortController, URL,
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url, config) => {
      requests.push({ url, config });
      if (options.network) return options.network.promise;
      return { ok: options.status ? false : true, status: options.status || 200,
        json: () => options.json ? options.json.promise : Promise.resolve({ text: options.text ?? '대한민국',
          playerId: config.headers['X-Player-Id'], turnId: config.headers['X-Turn-Id'],
          mode: config.headers['X-Speech-Mode'], ...(options.response || {}) }) };
    }
  };
  vm.runInNewContext(source, { window, Date: Clock });
  const adapter = window.FQ.cloudSpeech.create({ csrfToken: () => csrf, endpoint: options.endpoint, mode: options.mode });
  const handlers = (playerId = 0, turnId = 4) => ({ playerId, turnId, onState: value => states.push(value), onResult: value => results.push(value), onError: value => errors.push(value) });
  function advance(ms) {
    const target = now + ms;
    for (;;) {
      const due = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at; timers.delete(due[0]); due[1].fn();
    }
    now = target;
  }
  return { window, adapter, handlers, streams, recorders, contexts, requests, results, errors, states, media, advance, stream,
    setLoud(value) { loud = value; }, setCsrf(value) { csrf = value; }, timers };
}

test('현재 플레이어·차례의 음성을 WAV로 바꿔 CSRF·세션과 함께 보내고 결과를 한 번 전달한다', async () => {
  for (const mp4 of [false, true]) {
    const f = fixture({ mp4 });
    await f.adapter.start(f.handlers());
    assert.equal(f.adapter.isRecording(), true);
    f.setCsrf('new-csrf');
    assert.equal(f.adapter.stop(), true);
    assert.equal(f.adapter.stop(), false);
    await flush();
    assert.equal(f.requests.length, 1);
    const { url, config } = f.requests[0];
    assert.equal(url, 'http://localhost/api/speech');
    assert.equal(config.credentials, 'same-origin');
    assert.equal(config.headers['X-CSRF-Token'], 'new-csrf');
    assert.equal(config.headers['X-Player-Id'], '0');
    assert.equal(config.headers['X-Turn-Id'], '4');
    assert.equal(config.headers['X-Speech-Mode'], 'country-chain');
    assert.equal(config.headers['X-Audio-Duration-Ms'], '1000');
    assert.equal(config.body.type, 'audio/wav');
    assert.equal(config.headers.Authorization, undefined);
    const audio = Buffer.from(await config.body.arrayBuffer());
    assert.equal(validateSpeechInput({ audio, mimeType: 'audio/wav' }).durationMs, 1000);
    assert.equal(audio.readInt16LE(44), 8192);
    assert.deepEqual(JSON.parse(JSON.stringify(f.results)), [{ text: '대한민국', playerId: '0', turnId: '4', mode: 'country-chain' }]);
    assert.equal(f.errors.length, 0);
    assert.ok(f.streams[0].track.stops > 0);
    assert.equal(f.contexts[0].closed, 1);
    assert.equal(f.timers.size, 0);
  }
});

test('나라·수도·이어 말하기 모드는 같은 녹음 경로를 쓰고 시작 모드가 기본값보다 우선한다', async () => {
  for (const mode of ['voice', 'capitalVoice', 'country-chain']) {
    const f = fixture({ mode });
    await f.adapter.start(f.handlers()); f.adapter.stop(); await flush();
    assert.equal(f.requests[0].config.headers['X-Speech-Mode'], mode);
    assert.equal(f.results[0].mode, mode);
  }
  const f = fixture({ mode: 'voice' });
  await f.adapter.start({ ...f.handlers(), mode: 'capitalVoice' }); f.adapter.stop(); await flush();
  assert.equal(f.requests[0].config.headers['X-Speech-Mode'], 'capitalVoice');
  for (const mode of ['other', '', null, ['voice']]) {
    const invalid = fixture();
    await invalid.adapter.start({ ...invalid.handlers(), mode });
    assert.equal(invalid.errors[0].code, 'configuration');
    assert.equal(invalid.streams.length, 0); assert.equal(invalid.requests.length, 0);
  }
});

test('수동으로 녹음을 끝내도 완전무음은 보내지 않고 조용한 목소리의 PCM은 제거하지 않는다', async () => {
  const silent = fixture({ sample: 0 });
  await silent.adapter.start(silent.handlers()); silent.adapter.stop(); await flush();
  assert.equal(silent.requests.length, 0); assert.equal(silent.errors[0].code, 'no-speech');
  const quiet = fixture({ sample: 0.0001 }); quiet.setLoud(0.001);
  await quiet.adapter.start(quiet.handlers()); quiet.adapter.stop(); await flush();
  assert.equal(quiet.requests.length, 1); assert.equal(quiet.results.length, 1);
});

test('응답의 플레이어·차례·모드가 다르면 채점하지 않고 모드 없는 기존 서버 응답은 받는다', async () => {
  for (const response of [{ playerId: '1' }, { turnId: 'old-turn' }, { mode: 'capitalVoice' }, { playerId: undefined }, { turnId: undefined }]) {
    const f = fixture({ mode: 'voice', response });
    await f.adapter.start(f.handlers()); f.adapter.stop(); await flush();
    assert.equal(f.results.length, 0); assert.equal(f.errors[0].code, 'service');
    assert.equal(f.requests.length, 1);
  }
  const legacy = fixture({ mode: 'voice', response: { mode: undefined } });
  await legacy.adapter.start(legacy.handlers()); legacy.adapter.stop(); await flush();
  assert.equal(legacy.results.length, 1); assert.equal(legacy.results[0].mode, 'voice');
});

test('일간·월간 사용량과 서버 혼잡·분당 제한을 구분하고 자동 재전송하지 않는다', async () => {
  for (const [serverCode, clientCode, message] of [
    ['daily-speech-limit', 'quota', /오늘/], ['monthly-speech-limit', 'quota', /이번 달/],
    ['speech-busy', 'busy', /잠시/], ['rate-limit', 'busy', /잠시/]
  ]) {
    const f = fixture({ status: 429, response: { error: serverCode } });
    await f.adapter.start(f.handlers()); f.adapter.stop(); await flush();
    assert.equal(f.errors[0].code, clientCode); assert.match(f.errors[0].message, message);
    f.advance(60000); await flush(); assert.equal(f.requests.length, 1);
  }
});

test('말소리 뒤 1.2초 조용해지면 저절로 녹음을 마치고 무음만 있으면 유료 요청하지 않는다', async () => {
  const spoken = fixture(); spoken.setLoud(0.1);
  await spoken.adapter.start(spoken.handlers());
  spoken.advance(300); spoken.setLoud(0); spoken.advance(1200);
  await flush();
  assert.equal(spoken.requests.length, 1);
  assert.equal(spoken.results.length, 1);
  const silent = fixture();
  await silent.adapter.start(silent.handlers()); silent.advance(5000); await flush();
  assert.equal(silent.requests.length, 0);
  assert.equal(silent.errors[0].code, 'no-speech');
  assert.ok(silent.streams[0].track.stops > 0);
});

test('최대 12초에 녹음을 멈추고 종료 신호 지연으로 긴 원본이 생겨도 12초 WAV만 보낸다', async () => {
  const f = fixture({ longAudio: true }); f.setLoud(0.1);
  await f.adapter.start(f.handlers()); f.advance(12000); await flush();
  assert.equal(f.requests.length, 1);
  const { config } = f.requests[0];
  assert.equal(config.headers['X-Audio-Duration-Ms'], '12000');
  const audio = Buffer.from(await config.body.arrayBuffer());
  assert.equal(validateSpeechInput({ audio, mimeType: 'audio/wav' }).durationMs, 12000);
});

test('나라·수도 문제는 생각하는 사이 1.2초 쉼을 기다리고 2.2초 침묵 뒤 한 번만 전사한다', async () => {
  for (const mode of ['voice', 'capitalVoice']) {
    const f = fixture(); f.setLoud(0.1);
    await f.adapter.start({ ...f.handlers(), mode });
    f.advance(300); f.setLoud(0); f.advance(1200); await flush();
    assert.equal(f.requests.length, 0);
    assert.equal(f.adapter.isRecording(), true);
    f.advance(1000); await flush();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].config.headers['X-Speech-Mode'], mode);
    assert.equal(f.results.length, 1);
  }
});

test('마이크 권한 대기 중 취소하면 뒤늦게 열린 트랙도 닫고 녹음·요청을 시작하지 않는다', async () => {
  const media = deferred(), f = fixture({ media });
  const pending = f.adapter.start(f.handlers()); await flush();
  f.adapter.cancel(); const stream = f.stream(); media.resolve(stream); await pending;
  assert.equal(stream.track.stops, 1);
  assert.equal(f.recorders.length, 0);
  assert.equal(f.requests.length, 0);
  assert.equal(f.results.length, 0);
  assert.equal(f.errors.length, 0);
  assert.equal(f.contexts[0].closed, 1);
});

test('권한 대기가 끝나지 않거나 거절돼도 같은 차례로 오류를 알려 주고 유료 요청하지 않는다', async () => {
  const media = deferred(), f = fixture({ media });
  const pending = f.adapter.start(f.handlers(1, 8)); await flush(); f.advance(20000);
  assert.equal(f.errors[0].playerId, '1'); assert.equal(f.errors[0].turnId, '8');
  assert.equal(f.errors[0].code, 'permission');
  media.resolve(f.stream()); await pending;
  assert.equal(f.streams[0].track.stops, 1);
  assert.equal(f.requests.length, 0);
  const denied = deferred(), g = fixture({ media: denied });
  const attempt = g.adapter.start(g.handlers()); await flush(); denied.reject(new Error('private device detail')); await attempt;
  assert.equal(g.errors[0].code, 'permission');
  assert.doesNotMatch(g.errors[0].message, /private/);
  assert.equal(g.requests.length, 0);
});

test('변환 대기 중 수동 답변으로 취소하면 뒤늦은 디코딩에서 업로드하지 않는다', async () => {
  const decode = deferred(), f = fixture({ decode });
  await f.adapter.start(f.handlers()); f.adapter.stop(); await flush();
  f.adapter.cancel(); decode.resolve({ length: 48000, sampleRate: 48000, numberOfChannels: 1, getChannelData: () => new Float32Array(48000) });
  await flush();
  assert.equal(f.requests.length, 0); assert.equal(f.results.length, 0); assert.equal(f.errors.length, 0);
});

test('기기의 음성 변환이 멈춰도 10초 뒤 같은 차례의 글 입력으로 돌아가며 유료 요청하지 않는다', async () => {
  const decode = deferred(), f = fixture({ decode });
  await f.adapter.start(f.handlers(1, 6)); f.adapter.stop(); await flush(); f.advance(10000);
  assert.equal(f.errors.length, 1); assert.equal(f.errors[0].code, 'processing');
  assert.equal(f.errors[0].playerId, '1'); assert.equal(f.errors[0].turnId, '6');
  assert.equal(f.requests.length, 0); assert.equal(f.contexts[0].closed, 1); assert.equal(f.timers.size, 0);
  decode.resolve({ length: 48000, sampleRate: 48000, numberOfChannels: 1, getChannelData: () => new Float32Array(48000) });
  await flush(); assert.equal(f.requests.length, 0); assert.equal(f.results.length, 0);
});

test('업로드 중 취소하면 네트워크를 중단하고 늦은 응답·이전 녹음 이벤트를 무시한다', async () => {
  const network = deferred(), f = fixture({ network });
  await f.adapter.start(f.handlers()); const recorder = f.recorders[0], oldData = recorder.ondataavailable, oldStop = recorder.onstop;
  f.adapter.stop(); await flush();
  f.adapter.cancel();
  assert.equal(f.requests[0].config.signal.aborted, true);
  oldData({ data: new Blob(['late audio']) }); oldStop();
  network.resolve({ ok: true, json: async () => ({ text: '일본' }) }); await flush();
  assert.equal(f.results.length, 0); assert.equal(f.errors.length, 0); assert.equal(f.requests.length, 1);
});

test('응답 JSON 대기 중 다음 플레이어가 시작하면 이전 차례의 결과와 시간 제한을 적용하지 않는다', async () => {
  const json = deferred(), f = fixture({ json });
  await f.adapter.start(f.handlers()); f.adapter.stop(); await flush();
  f.setLoud(0.1); await f.adapter.start(f.handlers(1, 5));
  json.resolve({ text: '프랑스' }); await flush();
  assert.equal(f.results.length, 0);
  f.advance(11000);
  assert.equal(f.adapter.isRecording(), true, '이전 세션의 12초 예약이 새 세션을 멈추면 안 된다');
  f.adapter.cancel();
});

test('클라우드 시간 제한·사용량 제한·로그인 만료·변환 실패는 자동 유료 재시도 없이 수동 답변을 유지한다', async () => {
  for (const [options, expected] of [[{ status: 429, response: { error: 'daily-speech-limit' } }, 'quota'], [{ status: 401 }, 'auth-required'], [{ decodeError: true }, 'network'], [{ text: '' }, 'no-speech']]) {
    const f = fixture(options); await f.adapter.start(f.handlers(1, 7)); f.adapter.stop(); await flush();
    assert.equal(f.errors.length, 1); assert.equal(f.errors[0].code, expected);
    assert.equal(f.errors[0].turnId, '7'); assert.equal(f.errors[0].playerId, '1');
    assert.equal(f.results.length, 0); assert.ok(f.requests.length <= 1);
    f.advance(60000); await flush(); assert.ok(f.requests.length <= 1);
  }
  const network = deferred(), stalled = fixture({ network });
  await stalled.adapter.start(stalled.handlers()); stalled.adapter.stop(); await flush(); stalled.advance(25000);
  assert.equal(stalled.errors[0].code, 'timeout'); assert.equal(stalled.requests[0].config.signal.aborted, true);
  network.resolve({ ok: true, json: async () => ({ text: '미국' }) }); await flush();
  assert.equal(stalled.results.length, 0); assert.equal(stalled.requests.length, 1);
});

test('지원하지 않는 기기·CSRF 없음·외부 endpoint는 유료 요청을 만들지 않는다', async () => {
  const unsupported = fixture({ unsupported: true });
  await unsupported.adapter.start(unsupported.handlers()); assert.equal(unsupported.errors[0].code, 'unsupported');
  const missing = fixture(); missing.setCsrf('');
  await missing.adapter.start(missing.handlers()); missing.adapter.stop(); await flush();
  assert.equal(missing.errors[0].code, 'auth-required'); assert.equal(missing.requests.length, 0);
  const foreign = fixture({ endpoint: 'https://other.test/api/speech' });
  await foreign.adapter.start(foreign.handlers()); foreign.adapter.stop(); await flush();
  assert.equal(foreign.requests.length, 0); assert.equal(foreign.results.length, 0);
});

test('실제 클라우드 어댑터의 문자열 차례 ID와 결과가 번갈아 말하기 게임·이름 재생·다음 마이크에 연결된다', async () => {
  const f = fixture(), nodes = new Map(), events = new Map(), spoken = [];
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, { value: '', textContent: '', disabled: false, hidden: false, innerHTML: '',
      setAttribute() {}, classList: { toggle() {} }, querySelector() { return null; } });
    return nodes.get(selector);
  }
  const doc = { hidden: false, addEventListener() {}, removeEventListener() {} };
  f.window.document = doc;
  Object.assign(f.window.FQ, {
    ui: { esc: String, icon: () => '', flagSrc: code => '/flags/' + code + '.svg',
      setMain: () => node('#main'), $: node, on(host, selector, type, callback) { events.set(selector + ':' + type, callback); } },
    storage: { settings: () => ({ speak: true }) },
    map: { collection: () => '' },
    audio: { unlock() {}, canSpeak: () => true, stopSpeaking() {}, say(lines, options) { spoken.push({ lines, options }); } }
  });
  for (const file of ['js/util.js', 'data/countries.js', 'js/country-chain.js']) {
    vm.runInNewContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { window: f.window });
  }
  const game = f.window.FQ.countryChain.start({ players: ['첫째', '둘째'], voice: f.adapter });
  events.get('[data-chain-mic]:click')(); await flush();
  assert.equal(f.adapter.isRecording(), true);
  events.get('[data-chain-mic]:click')(); await flush();
  assert.equal(f.requests[0].config.headers['X-Player-Id'], '0');
  assert.equal(f.requests[0].config.headers['X-Turn-Id'], '0');
  assert.deepEqual(Array.from(game.snapshot().scores), [1, 0]);
  assert.equal(game.snapshot().playerIndex, 1);
  assert.equal(game.snapshot().countries[0].code, 'kr');
  assert.deepEqual(Array.from(spoken[0].lines), ['대한민국']);
  spoken[0].options.onEnd(); f.advance(300); await flush();
  assert.equal(f.adapter.isRecording(), true, '이름을 읽고 다음 친구의 실제 마이크를 켠다');
  assert.equal(f.recorders.length, 2);
  game.cleanup();
  assert.equal(f.adapter.isRecording(), false);
  assert.ok(f.streams[1].track.stops > 0);
  assert.equal(f.timers.size, 0);
});
