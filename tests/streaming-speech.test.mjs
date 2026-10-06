import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const path = new URL('../js/streaming-speech.js', import.meta.url);
const source = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
function fixture(options = {}) {
  let now = 0, timerId = 0, csrf = 'session-csrf';
  const timers = new Map(), sockets = [], streams = [], contexts = [], nodes = [], states = [], results = [], partials = [], errors = [];
  function stream() {
    const listeners = new Set();
    const track = { enabled: true, readyState: 'live', stops: 0, stop() { this.stops++; this.readyState = 'ended'; },
      addEventListener(_, fn) { listeners.add(fn); }, removeEventListener(_, fn) { listeners.delete(fn); },
      end() { this.readyState = 'ended'; for (const fn of listeners) fn(); } };
    const value = { track, getTracks: () => [track] }; streams.push(value); return value;
  }
  class Audio {
    constructor() { this.state = 'running'; this.closed = 0; this.destination = {}; this.modules = [];
      this.audioWorklet = { addModule: (url, config) => { this.modules.push({ url, config }); return options.module ? options.module.promise : Promise.resolve(); } }; contexts.push(this); }
    resume() { this.resumes = (this.resumes || 0) + 1; return options.resume ? options.resume.promise : Promise.resolve(); }
    close() { this.state = 'closed'; this.closed++; return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
  }
  if (!options.noAudioWorklet) Object.defineProperty(Audio.prototype, 'audioWorklet', { value: null, writable: true });
  class Worklet {
    constructor(audio, name, config) { this.audio = audio; this.name = name; this.config = config; this.commands = [];
      this.port = { postMessage: value => this.commands.push(value), onmessage: null }; nodes.push(this); }
    connect() {} disconnect() {}
  }
  class Socket {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 0; this.bufferedAmount = 0; this.sent = []; this.closes = 0; sockets.push(this); }
    send(value) { assert.equal(this.readyState, 1); this.sent.push(value); }
    open() { this.readyState = 1; this.onopen?.(); }
    message(value) { this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) }); }
    close() { this.closes++; this.readyState = 3; this.onclose?.(); }
  }
  class Clock extends Date { static now() { return now; } }
  const window = { navigator: { mediaDevices: { getUserMedia: () => options.media ? options.media.promise : Promise.resolve(stream()) } },
    location: { hostname: 'localhost', origin: 'http://localhost', href: 'http://localhost/play' }, isSecureContext: true,
    AudioContext: Audio, AudioWorkletNode: options.unsupported ? null : Worklet, WebSocket: Socket, URL,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { at: now + delay, fn }); return id; }, clearTimeout(id) { timers.delete(id); } };
  vm.runInNewContext(source, { window, Date: Clock });
  assert.ok(window.FQ?.streamingSpeech, '녹음 중 인식할 실시간 어댑터가 있어야 한다');
  const adapter = window.FQ.streamingSpeech.create({ mode: options.mode || 'voice', csrfToken: () => csrf,
    endpoint: options.endpoint, workletUrl: options.workletUrl, beforeRecord: options.beforeRecord });
  const handlers = () => ({ playerId: 0, turnId: 4, onState: value => states.push(value), onResult: value => results.push(value), onPartial: value => partials.push(value), onError: value => errors.push(value) });
  const ids = { playerId: '0', turnId: '4', mode: options.mode || 'voice' };
  function advance(ms) {
    const target = now + ms;
    for (;;) { const due = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break; now = due[1].at; timers.delete(due[0]); due[1].fn(); }
    now = target;
  }
  async function start(extra = {}) {
    const pending = adapter.start({ ...handlers(), ...extra }); await flush(); sockets.at(-1)?.open(); sockets.at(-1)?.message({ type: 'ready', ...ids,
      ...(extra.turnId !== undefined ? { turnId: String(extra.turnId) } : {}),
      ...(extra.playerId !== undefined ? { playerId: String(extra.playerId) } : {}),
      ...(extra.mode !== undefined ? { mode: extra.mode } : {}) }); await pending; return pending;
  }
  function pcm(amplitude = 0.05, windows = 5, node = nodes.at(-1), generation) {
    const command = node.commands.findLast(value => value.type === 'start');
    const samples = new Int16Array(1600);
    for (let i = 0; i < 320 * windows; i++) samples[i] = Math.round(amplitude * 32767) * (i % 2 ? 1 : -1);
    node.port.onmessage?.({ data: { type: 'audio', generation: generation ?? command.generation, sequence: node.sequence = (node.sequence ?? -1) + 1, pcm: samples.buffer } });
  }
  const binary = () => sockets.flatMap(socket => socket.sent.filter(value => typeof value !== 'string'));
  const control = () => sockets.flatMap(socket => socket.sent.filter(value => typeof value === 'string').map(value => JSON.parse(value)));
  return { window, adapter, handlers, ids, streams, contexts, sockets, nodes, states, results, partials, errors, timers,
    start, pcm, binary, control, advance, stream, setCsrf(value) { csrf = value; } };
}

test('인증 ready와 준비 비프가 끝나기 전에는 마이크와 PCM을 켜지 않는다', async () => {
  let beepDone;
  const f = fixture({ beforeRecord(done) { beepDone = done; } });
  const pending = f.adapter.start(f.handlers()); await flush();
  assert.equal(f.sockets[0].url, 'ws://localhost/api/speech/stream');
  assert.equal(f.streams[0].track.enabled, false);
  f.sockets[0].open();
  assert.deepEqual(f.control(), [{ type: 'start', csrfToken: 'session-csrf', ...f.ids }]);
  assert.equal(beepDone, undefined); assert.equal(f.binary().length, 0);
  f.sockets[0].message({ type: 'ready', ...f.ids }); await flush();
  assert.equal(typeof beepDone, 'function'); assert.equal(f.adapter.isRecording(), false);
  assert.equal(f.streams[0].track.enabled, false);
  beepDone(); await pending;
  assert.equal(f.adapter.isRecording(), true); assert.equal(f.streams[0].track.enabled, true);
  assert.equal(f.contexts[0].modules[0].url, 'http://localhost/js/speech-pcm-worklet.js');
  assert.equal(f.contexts[0].modules[0].config.credentials, 'same-origin');
  f.adapter.dispose(); assert.equal(f.timers.size, 0);
});

test('생각 무음과 40ms 클릭은 전송 0이며 100ms 발화부터 400ms pre-roll을 실시간 전송한다', async () => {
  const f = fixture(); await f.start({ continuous: true });
  for (let i = 0; i < 300; i++) f.pcm(0);
  f.advance(30000); assert.equal(f.binary().length, 0); assert.equal(f.adapter.isRecording(), true);
  f.pcm(0.3, 2); f.pcm(0); assert.equal(f.binary().length, 0);
  f.pcm(0); f.pcm(0); f.pcm(0.006);
  assert.equal(f.binary().length, 4);
  assert.equal(new Int16Array(f.binary()[3])[0], -197);
  f.pcm(0); f.advance(1000);
  assert.equal(f.binary().length, 5); assert.equal(f.adapter.isRecording(), true);
  assert.equal(f.control().filter(value => value.type === 'finish').length, 0);
  f.adapter.cancel();
});

test('자음 사이 80ms 이내 공백은 발화 시간에 합치고 단독 클릭은 과금하지 않는다', async () => {
  const f = fixture(); await f.start();
  f.pcm(0.006, 3); assert.equal(f.binary().length, 0);
  f.pcm(0.006, 3); assert.equal(f.binary().length, 2);
  f.adapter.dispose();
});

test('발화가 계속되는 중 partial은 표시만 하고 result는 즉시 음소거·한 번 채점한다', async () => {
  for (const mode of ['voice', 'capitalVoice', 'country-chain']) {
    const f = fixture({ mode }); await f.start({ continuous: true }); f.pcm(0.05);
    f.sockets[0].message({ type: 'partial', text: '대한', ...f.ids });
    assert.equal(f.partials.length, 1); assert.equal(f.results.length, 0);
    const oldListener = f.sockets[0].onmessage;
    f.sockets[0].message({ type: 'result', text: '대한민국', resolution: { answerId: 'kr' }, ...f.ids });
    assert.equal(f.results.length, 1); assert.equal(f.results[0].resolution.answerId, 'kr');
    assert.equal(f.streams[0].track.enabled, false); assert.equal(f.adapter.isActive(), false);
    assert.equal(f.nodes[0].commands.at(-1).type, 'stop');
    f.pcm(0.05); oldListener({ data: JSON.stringify({ type: 'result', text: '대한민국', ...f.ids }) });
    assert.equal(f.binary().length, 1); assert.equal(f.results.length, 1); assert.equal(f.errors.length, 0);
    f.adapter.dispose(); assert.equal(f.streams[0].track.stops, 1); assert.equal(f.timers.size, 0);
  }
});

test('서버 finishing은 먼저 송신을 끊고 수동 finish를 중복 보내지 않은 채 최종 결과를 기다린다', async () => {
  const f = fixture(); await f.start(); f.pcm();
  f.sockets[0].message({ type: 'finishing', ...f.ids });
  assert.equal(f.adapter.isRecording(), false); assert.equal(f.streams[0].track.enabled, false);
  assert.equal(f.states.at(-1).state, 'finishing'); assert.equal(f.adapter.stop(), false);
  f.pcm(); assert.equal(f.binary().length, 1); assert.equal(f.control().length, 1);
  f.sockets[0].message({ type: 'result', text: '대한민국', ...f.ids });
  assert.equal(f.results.length, 1); assert.equal(f.timers.size, 0);
});

test('수동 stop과 실제 전송 12초 상한은 finish 한 번이고 최종 응답 제한을 지킨다', async () => {
  const manual = fixture(); await manual.start(); manual.pcm();
  assert.equal(manual.adapter.stop(), true); assert.equal(manual.adapter.stop(), false);
  assert.equal(manual.control().filter(value => value.type === 'finish').length, 1);
  manual.advance(25000); assert.equal(manual.errors[0].code, 'network'); assert.equal(manual.timers.size, 0);
  const capped = fixture(); await capped.start();
  for (let i = 0; i < 140; i++) capped.pcm();
  assert.equal(capped.binary().length, 120);
  assert.equal(capped.control().filter(value => value.type === 'finish').length, 1);
  assert.equal(capped.streams[0].track.enabled, false); capped.adapter.cancel();
});

test('cancel·이전 차례·늦은 권한 응답은 새 차례에 결과나 녹음을 되살리지 않는다', async () => {
  const f = fixture(); await f.start(); const listener = f.sockets[0].onmessage;
  f.adapter.cancel({ keepMicrophone: true });
  assert.equal(f.streams[0].track.enabled, false); assert.equal(f.streams[0].track.stops, 0);
  listener({ data: JSON.stringify({ type: 'result', text: '대한민국', ...f.ids }) }); assert.equal(f.results.length, 0);
  await f.start({ turnId: 'next' });
  assert.equal(f.streams.length, 1); assert.equal(f.contexts.length, 1);
  f.sockets[1].message({ type: 'result', text: '대한민국', ...f.ids }); assert.equal(f.results.length, 0);
  f.adapter.cancel(); assert.equal(f.streams[0].track.stops, 1); assert.equal(f.timers.size, 0);
  const permission = deferred(), late = fixture({ media: permission });
  const pending = late.adapter.start(late.handlers()); await flush(); late.adapter.cancel();
  assert.equal(late.contexts[0].closed, 1, '권한 대화상자가 남아 있어도 AudioContext는 즉시 해제한다');
  const lateStream = late.stream(); permission.resolve(lateStream); await pending; await flush();
  assert.equal(lateStream.track.stops, 1); assert.equal(late.results.length, 0); assert.equal(late.timers.size, 0);
});

test('AudioWorklet 미지원은 마이크를 열기 전에 판별하고 resume 지연·실패·재사용을 처리한다', async () => {
  const oldSafari = fixture({ noAudioWorklet: true });
  assert.equal(oldSafari.adapter.supported(), false);
  await oldSafari.adapter.start(oldSafari.handlers());
  assert.equal(oldSafari.errors[0].code, 'unsupported'); assert.equal(oldSafari.streams.length, 0); assert.equal(oldSafari.sockets.length, 0);
  const resume = deferred(), delayed = fixture({ resume });
  const pending = delayed.adapter.start(delayed.handlers()); await flush(); delayed.sockets[0].open(); delayed.sockets[0].message({ type: 'ready', ...delayed.ids }); await flush();
  assert.equal(delayed.streams[0].track.enabled, false); assert.equal(delayed.adapter.isRecording(), false);
  resume.resolve(); await pending; assert.equal(delayed.adapter.isRecording(), true);
  delayed.adapter.cancel({ keepMicrophone: true }); await delayed.start();
  assert.equal(delayed.contexts[0].resumes, 2); assert.equal(delayed.streams.length, 1); delayed.adapter.dispose();
  const blocked = deferred(), timeout = fixture({ resume: blocked });
  const waiting = timeout.adapter.start(timeout.handlers()); await flush(); timeout.sockets[0].open(); timeout.sockets[0].message({ type: 'ready', ...timeout.ids }); await flush();
  timeout.advance(20000); await waiting;
  assert.equal(timeout.errors[0].code, 'recording'); assert.equal(timeout.contexts[0].closed, 1); assert.equal(timeout.timers.size, 0);
  blocked.resolve(); await flush(); assert.equal(timeout.adapter.isRecording(), false);
  const suspended = deferred(), cancelled = fixture({ resume: suspended });
  const cancelling = cancelled.adapter.start(cancelled.handlers()); await flush(); cancelled.adapter.cancel(); await cancelling;
  assert.equal(cancelled.timers.size, 0); assert.equal(cancelled.contexts[0].closed, 1);
  suspended.resolve(); await flush(); assert.equal(cancelled.errors.length, 0); assert.equal(cancelled.adapter.isRecording(), false);
});

test('Worklet 모듈·PCM 형식·미수신 큐 오류와 인증 만료는 유료 재시도 없이 끝낸다', async () => {
  const module = deferred(), broken = fixture({ module });
  const pending = broken.adapter.start(broken.handlers()); await flush(); module.reject(new Error('module unavailable')); await pending;
  assert.equal(broken.errors[0].code, 'recording'); assert.equal(broken.streams[0].track.stops, 1); assert.equal(broken.contexts[0].closed, 1); assert.equal(broken.timers.size, 0);
  for (const type of ['audio', 'overflow']) {
    const f = fixture(); await f.start(); const generation = f.nodes[0].commands.at(-1).generation;
    f.nodes[0].port.onmessage({ data: { type, generation, sequence: 0, pcm: new ArrayBuffer(100) } });
    assert.equal(f.errors.length, 1); assert.equal(f.binary().length, 0); assert.equal(f.timers.size, 0); assert.equal(f.sockets.length, 1);
  }
  const auth = fixture(); const starting = auth.adapter.start(auth.handlers()); await flush(); auth.sockets[0].open();
  auth.sockets[0].message({ type: 'error', code: 'auth-required', status: 401, message: '다시 로그인해 주세요.' }); await starting;
  assert.equal(auth.errors[0].code, 'auth-required'); assert.equal(auth.errors[0].status, 401);
  assert.equal(auth.binary().length, 0); assert.equal(auth.timers.size, 0);
});

test('권한이 완료된 뒤 Worklet 로딩이 멈추면 녹음 초기화 오류로 종료하고 즉시 마이크를 해제한다', async () => {
  for (const cancel of [false, true]) {
    const module = deferred(), f = fixture({ module });
    const pending = f.adapter.start(f.handlers()); await flush();
    f.sockets[0].open(); f.sockets[0].message({ type: 'ready', ...f.ids }); await flush();
    assert.equal(f.streams[0].track.enabled, false);
    if (cancel) f.adapter.cancel(); else f.advance(20000);
    await pending;
    assert.equal(f.streams[0].track.stops, 1, 'Worklet promise가 끝나지 않아도 마이크는 즉시 닫는다');
    assert.equal(f.contexts[0].closed, 1); assert.equal(f.timers.size, 0);
    assert.equal(f.errors.length, cancel ? 0 : 1);
    if (!cancel) assert.equal(f.errors[0].code, 'recording', '이미 완료된 마이크 권한을 재요청하지 않는다');
    module.resolve(); await flush(); assert.equal(f.streams[0].track.stops, 1);
    assert.equal(f.adapter.isRecording(), false); assert.equal(f.results.length, 0);
  }
});

test('외부 URL·CSRF 누락·권한 거절·handshake 제한·마이크 해제·buffer 초과는 정리 후 오류 한 번이다', async () => {
  for (const config of [{ endpoint: 'wss://other.invalid/stream' }, { workletUrl: 'https://other.invalid/worklet.js' }]) {
    const f = fixture(config); await f.adapter.start(f.handlers());
    assert.equal(f.errors[0].code, 'configuration'); assert.equal(f.sockets.length, 0); assert.equal(f.streams.length, 0);
  }
  const csrf = fixture(); csrf.setCsrf(''); await csrf.adapter.start(csrf.handlers()); assert.equal(csrf.errors[0].code, 'configuration');
  const timeout = fixture(); const waiting = timeout.adapter.start(timeout.handlers()); await flush(); timeout.advance(20000); await waiting;
  assert.equal(timeout.errors[0].code, 'network'); assert.equal(timeout.timers.size, 0);
  const denied = deferred(), permission = fixture({ media: denied }); const pending = permission.adapter.start(permission.handlers());
  denied.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })); await pending;
  assert.equal(permission.errors[0].code, 'permission'); assert.equal(permission.timers.size, 0);
  const ended = fixture(); await ended.start(); ended.streams[0].track.end(); assert.equal(ended.errors[0].code, 'recording');
  const full = fixture(); await full.start(); full.sockets[0].bufferedAmount = 64000; full.pcm();
  assert.equal(full.errors[0].code, 'network'); assert.equal(full.binary().length, 0); assert.equal(full.timers.size, 0);
});

test('서버 오류 코드와 잘못된 메시지를 구분하고 자동으로 재시도하지 않는다', async () => {
  const quota = fixture(); const pending = quota.adapter.start(quota.handlers()); await flush(); quota.sockets[0].open();
  quota.sockets[0].message({ type: 'error', code: 'daily-speech-limit', message: '오늘 음성 사용량을 모두 썼어요.' }); await pending;
  assert.equal(quota.errors[0].code, 'quota'); assert.match(quota.errors[0].message, /오늘/); assert.equal(quota.sockets.length, 1);
  const invalid = fixture(); await invalid.start(); invalid.sockets[0].message('{');
  assert.equal(invalid.errors[0].code, 'service'); assert.equal(invalid.timers.size, 0);
  for (const [serverCode, clientCode, copy] of [['busy', 'busy', /잠시/], ['quota', 'quota', /사용량/], ['timeout', 'network', /시간/], ['no-speech', 'no-speech', /목소리/]]) {
    const f = fixture(); await f.start(); f.sockets[0].message({ type: 'error', code: serverCode, ...f.ids });
    assert.equal(f.errors[0].code, clientCode); assert.match(f.errors[0].message, copy); assert.equal(f.sockets.length, 1);
  }
});
