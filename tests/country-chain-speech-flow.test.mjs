import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}

// 실제 두 모듈을 실행하고 기기·네트워크·시간만 바꾼다. 외부 요청은 없다.
function fixture({ responses = ['대한민국'], network, permission, speak = true, countryCodes } = {}) {
  let now = 0, timerId = 0, loud = 0, homes = 0;
  const signal = [{ at: 0, value: 0 }];
  const timers = new Map(), nodes = new Map(), events = new Map();
  const streams = [], recorders = [], contexts = [], requests = [], spoken = [], errors = [];
  const doc = new EventTarget(); doc.hidden = false;
  function node(selector) {
    if (selector.startsWith('.')) return null;
    if (!nodes.has(selector)) nodes.set(selector, {
      disabled: false, hidden: false, value: '', textContent: '', innerHTML: '', attrs: {},
      setAttribute(name, value) { this.attrs[name] = String(value); },
      classList: { toggle() {} }
    });
    return nodes.get(selector);
  }
  function stream() {
    const track = new EventTarget();
    Object.assign(track, { enabled: true, readyState: 'live', kind: 'audio', stops: 0,
      stop() { this.stops++; this.readyState = 'ended'; },
      end(notify = true) {
        this.readyState = 'ended';
        if (notify) { this.dispatchEvent(new Event('ended')); this.onended?.(); }
      } });
    const value = { track, getTracks: () => [track], getAudioTracks: () => [track], get active() { return track.readyState === 'live'; } };
    streams.push(value); return value;
  }
  class Recorder {
    static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
    constructor(input, options) {
      this.stream = input; this.mimeType = options.mimeType; this.state = 'inactive'; this.stops = 0;
      recorders.push(this);
    }
    start() { this.state = 'recording'; this.started = now; this.lastData = now; }
    requestData() {
      this.ondataavailable?.({ data: new Blob([JSON.stringify({ from: this.lastData, to: now }) + '\n']) });
      this.lastData = now;
    }
    stop() {
      this.state = 'inactive'; this.stops++;
      this.requestData();
      this.onstop?.();
    }
  }
  class AudioContext {
    constructor() { this.closed = 0; this.resumes = 0; this.state = 'running'; contexts.push(this); }
    resume() {
      this.resumes++;
      if (this.state === 'closed') return Promise.reject(new Error('closed context'));
      this.state = 'running'; return Promise.resolve();
    }
    close() { this.closed++; this.state = 'closed'; return Promise.resolve(); }
    createMediaStreamSource(input) { this.input = input; return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: samples => {
      const amplitude = this.state !== 'running' || this.input?.track.enabled === false || this.input?.track.readyState === 'ended' ? 0 : loud;
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
        samples[i] = (signal[segment]?.value || 0) * Math.SQRT2 * Math.sin(2 * Math.PI * i / 16);
      }
      return Promise.resolve({ length, sampleRate: 16000, numberOfChannels: 1,
        getChannelData: () => samples });
    }
  }
  class Clock extends Date { static now() { return now; } }
  const window = {
    document: doc, navigator: { mediaDevices: { getUserMedia: () => permission ? permission.promise : Promise.resolve(stream()) } },
    location: { hostname: 'localhost', origin: 'http://localhost', href: 'http://localhost/' }, isSecureContext: true,
    MediaRecorder: Recorder, AudioContext, Blob, AbortController, URL,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url, config) => {
      const data = new DataView(await config.body.arrayBuffer());
      let voicedSamples = 0;
      for (let i = 44; i < data.byteLength; i += 2) if (Math.abs(data.getInt16(i, true)) > 0.025 * 32767) voicedSamples++;
      requests.push({ url, config, inputHasVoice: voicedSamples > 0, inputVoiceDurationMs: voicedSamples / 16 });
      if (network) return network.promise;
      const response = responses[requests.length - 1] || '';
      return { ok: true, status: 200, json: async () => ({ playerId: config.headers['X-Player-Id'],
        turnId: config.headers['X-Turn-Id'], mode: config.headers['X-Speech-Mode'],
        ...(typeof response === 'string' ? { text: response } : response) }) };
    },
    FQ: {
      storage: { settings: () => ({ speak }) },
      auth: { session: () => ({ preview: false }), csrfToken: () => 'synthetic-csrf' },
      ui: { esc: String, icon: () => '', flagSrc: code => '/flags/' + code + '.svg',
        $: node, setMain: html => { const main = node('#main'); main.innerHTML = html; return main; },
        on(host, selector, type, fn) { events.set(selector + ':' + type, fn); } },
      map: { collection: () => '' },
      audio: { unlock() {}, canSpeak: () => true,
        say(lines, options, fail) { spoken.push({ lines: Array.from(lines), options, fail, active: true }); },
        stopSpeaking() { spoken.forEach(item => { item.active = false; }); } }
    }
  };
  const context = vm.createContext({ window, Date: Clock });
  for (const file of ['js/util.js', 'data/countries.js', 'js/spoken-answer.js', 'js/cloud-speech.js', 'js/speech.js', 'js/country-chain.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context, { filename: file });
  }
  const adapter = window.FQ.cloudSpeech.create({ csrfToken: 'synthetic-csrf', mode: 'country-chain' });
  const game = window.FQ.countryChain.start({ players: ['첫째', '둘째'], voice: adapter,
    countries: countryCodes && window.FQ.countries.filter(country => countryCodes.includes(country.code)),
    onHome() { homes++; }, onVoiceError(error) { errors.push(error); } });
  function click(selector) {
    const target = selector === '[data-chain-mic]' ? node('#chain-mic') : selector === '[data-chain-pause]' ? node('#chain-pause') : null;
    if (target?.disabled || target?.hidden) return false;
    events.get(selector + ':click')?.({ preventDefault() {} }, target); return true;
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
  return { window, game, adapter, node, click, advance, streams, recorders, requests, spoken, contexts, errors, timers,
    stream, setLoud(value) { loud = value; signal.push({ at: now, value }); }, get homes() { return homes; },
    hide(hidden) { doc.hidden = hidden; doc.dispatchEvent(new Event('visibilitychange')); },
    finishSpeech(index = spoken.length - 1) { const item = spoken[index]; item.active = false; item.options.onEnd(); } };
}

test('통합: 무음 대기 30초 동안 같은 마이크를 유지하고 종료·재획득·유료 요청을 반복하지 않는다', async t => {
  const f = fixture(); t.after(() => f.game.cleanup());
  f.click('[data-chain-mic]'); await flush();
  assert.equal(f.streams.length, 1);
  await f.advance(30000);
  assert.equal(f.streams[0].track.stops, 0, '아직 말하지 않은 친구를 기다리는 동안 마이크를 닫으면 안 된다');
  assert.equal(f.streams.length, 1, '무음 대기로 권한을 반복 요청하면 안 된다');
  assert.equal(f.requests.length, 0, '무음만으로 STT 요금을 쓰면 안 된다');
  assert.equal(f.game.snapshot().total, 0);
  assert.equal(f.game.snapshot().playerIndex, 0);
  assert.equal(f.node('#chain-pause').hidden, false, '계속 듣는 상태에서 멈추기만 명시적으로 제공한다');
});

test('통합: 긴 무음 뒤 발화도 실제 WAV에 남으며 앞부분 12초 무음만 잘라 보내지 않는다', async t => {
  const f = fixture(); t.after(() => f.game.cleanup());
  f.click('[data-chain-mic]'); await flush();
  await f.advance(20000);
  f.setLoud(0.1); await f.advance(500); f.setLoud(0); await f.advance(1200);
  assert.equal(f.requests.length, 1, '친구가 늦게 말해도 한 번만 받아쓴다');
  assert.equal(f.requests[0].inputHasVoice, true, '유료 요청 WAV에 실제 늦은 발화의 표본이 있어야 한다');
  assert.ok(Number(f.requests[0].config.headers['X-Audio-Duration-Ms']) <= 12000);
  assert.equal(f.game.snapshot().total, 1);
  assert.deepEqual(f.spoken[0].lines, ['대한민국']);
});

test('통합: 12초 교체 직전 11.8초에 시작한 500ms 발화는 경계에서 잘리지 않고 WAV에 남는다', async t => {
  const f = fixture(); t.after(() => f.game.cleanup());
  f.click('[data-chain-mic]'); await flush();
  await f.advance(11800);
  f.setLoud(0.1); await f.advance(500); f.setLoud(0); await f.advance(1200);
  assert.equal(f.requests.length, 1);
  assert.ok(f.requests[0].inputVoiceDurationMs >= 400,
    '교체 경계에서도 500ms 발화의 400ms 이상 표본이 있어야 한다: ' + f.requests[0].inputVoiceDurationMs);
  assert.ok(Number(f.requests[0].config.headers['X-Audio-Duration-Ms']) <= 12000);
  assert.equal(f.game.snapshot().total, 1);
});

test('통합: 작은 고정 배경음은 다음 나라 발화로 반복 과금·모호한 나라 메시지를 만들지 않는다', async t => {
  const f = fixture({ responses: ['대한민국 일본', '프랑스 미국', '영국 독일'] }); t.after(() => f.game.cleanup());
  f.setLoud(0.015); f.click('[data-chain-mic]'); await flush();
  await f.advance(30000);
  assert.equal(f.requests.length, 0, '고정 배경음만으로 유료 STT를 반복 요청하지 않는다');
  assert.equal(f.game.snapshot().total, 0);
  assert.equal(f.spoken.length, 0);
  assert.doesNotMatch(f.node('#chain-feedback').textContent, /여러 나라/);
});

test('통합: 한 나라 인식 뒤 이름 재생 중에는 시작·멈추기 모순과 TTS 재녹음을 막고 상대 차례 듣기를 잇는다', async t => {
  const f = fixture({ responses: ['대한민국', '일본'] }); t.after(() => f.game.cleanup());
  f.setLoud(0.1); f.click('[data-chain-mic]'); await flush();
  await f.advance(300); f.setLoud(0); await f.advance(1200);
  assert.equal(f.requests.length, 1);
  assert.equal(f.game.snapshot().total, 1);
  assert.equal(f.game.snapshot().playerIndex, 1);
  assert.deepEqual(f.spoken[0].lines, ['대한민국']);
  assert.equal(f.adapter.isRecording(), false, '앱이 나라 이름을 읽는 동안 녹음하지 않는다');
  assert.equal(f.streams[0].track.enabled, false, '앱의 TTS가 남아 있는 마이크로 들어가지 않게 실제 트랙을 mute한다');
  assert.equal(f.streams[0].track.stops, 0, '다음 친구를 위해 이미 허용한 마이크를 보관한다');
  assert.equal(f.contexts[0].closed, 0, '같은 기기의 오디오 컨텍스트를 차례마다 다시 열지 않는다');
  assert.ok(f.node('#chain-mic').disabled || f.node('#chain-mic').hidden, '이름 재생 중 말하기 시작으로 듣기를 다시 켤 수 없어야 한다');
  f.setLoud(0.1); // 앱의 이름 읽기가 마이크에 들리는 동안 버튼을 연타한다.
  f.click('[data-chain-mic]'); await flush();
  await f.advance(300); f.setLoud(0); await f.advance(1200);
  assert.equal(f.streams.length, 1, '읽기 버튼 연타로 자기 목소리를 다음 친구 입력으로 받지 않는다');
  assert.equal(f.requests.length, 1, 'TTS를 다음 나라 발화로 다시 받아쓰지 않는다');
  f.finishSpeech(); await f.advance(300);
  assert.equal(f.adapter.isRecording(), true);
  assert.equal(f.streams.length, 1, '상대 차례도 이미 허용한 같은 트랙을 사용한다');
  assert.equal(f.contexts.length, 1);
  assert.equal(f.streams[0].track.enabled, true);
  assert.equal(f.requests.length, 1);
  assert.equal(f.node('#chain-pause').hidden, false);
  f.setLoud(0.1); await f.advance(300); f.setLoud(0); await f.advance(1200);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].inputHasVoice, true);
  assert.equal(f.requests[1].config.headers['X-Player-Id'], '1');
  assert.equal(f.requests[1].config.headers['X-Turn-Id'], '1');
  assert.deepEqual(Array.from(f.game.snapshot().scores), [1, 1]);
  assert.equal(f.game.snapshot().playerIndex, 0);
  assert.deepEqual(f.spoken[1].lines, ['일본']);
  assert.equal(f.streams.length, 1);
  assert.equal(f.contexts.length, 1);
  assert.equal(f.streams[0].track.enabled, false);
});

test('통합: 여러 나라가 들린 발화는 자동 재요청 없이 같은 차례를 남기고 명시적 다시 듣기의 한 나라만 인정한다', async t => {
  const f = fixture({ responses: ['대한민국 일본', '일본'] }); t.after(() => f.game.cleanup());
  f.setLoud(0.1); f.click('[data-chain-mic]'); await flush();
  await f.advance(300); f.setLoud(0); await f.advance(1200);
  assert.equal(f.requests.length, 1);
  assert.equal(f.game.snapshot().total, 0);
  assert.equal(f.game.snapshot().playerIndex, 0);
  assert.match(f.node('#chain-feedback').textContent, /하나만/);
  assert.equal(f.spoken.length, 0, '여러 나라로 판정한 입력을 정답 이름으로 읽지 않는다');
  assert.ok(f.streams[0].track.stops > 0, '판정하지 못한 답은 자동 유료 재시도를 끝내고 트랙도 닫는다');
  await f.advance(30000);
  assert.equal(f.requests.length, 1);
  assert.equal(f.streams.length, 1);
  assert.equal(f.node('#chain-pause').hidden, true);
  f.setLoud(0.1); f.click('[data-chain-mic]'); await flush();
  await f.advance(800); f.setLoud(0); await f.advance(1200);
  assert.equal(f.requests.length, 2);
  assert.equal(f.game.snapshot().total, 1);
  assert.equal(f.game.snapshot().playerIndex, 1);
  assert.deepEqual(Array.from(f.game.snapshot().scores), [1, 0]);
  assert.deepEqual(f.spoken[0].lines, ['일본']);
  assert.equal(f.streams.length, 2, '사용자가 명시적으로 다시 시작한 뒤에만 새 마이크를 얻는다');
  assert.equal(f.contexts.length, 2);
  assert.equal(f.streams[1].track.enabled, false, '새 세션의 정답 읽기에서도 마이크를 mute한다');
});

for (const action of ['pause', 'home', 'hidden', 'reset']) {
  test('통합: ' + action + '은 업로드를 취소하고 늦은 결과·녹음 이벤트로 차례나 듣기를 되살리지 않는다', async t => {
    const network = deferred(), f = fixture({ network }); t.after(() => f.game.cleanup());
    f.setLoud(0.1); f.click('[data-chain-mic]'); await flush();
    const oldData = f.recorders[0].ondataavailable, oldStop = f.recorders[0].onstop;
    await f.advance(300); f.setLoud(0); await f.advance(1200);
    assert.equal(f.requests.length, 1);
    assert.equal(f.node('#chain-mic').disabled, true);
    if (action === 'pause') f.click('[data-chain-pause]');
    else if (action === 'home') f.click('[data-chain-home]');
    else if (action === 'reset') f.click('[data-chain-reset]');
    else f.hide(true);
    assert.equal(f.requests[0].config.signal.aborted, true);
    oldData({ data: new Blob(['late synthetic recording']) }); oldStop();
    network.resolve({ ok: true, status: 200, json: async () => ({ text: '일본' }) });
    await flush();
    if (action === 'hidden') f.hide(false);
    await f.advance(60000);
    assert.equal(f.requests.length, 1);
    assert.equal(f.game.snapshot().total, 0);
    assert.equal(f.game.snapshot().playerIndex, 0);
    assert.equal(f.spoken.length, 0);
    assert.equal(f.streams.length, 1);
    assert.ok(f.streams[0].track.stops > 0);
    assert.equal(f.timers.size, 0);
    assert.equal(f.homes, action === 'home' ? 1 : 0);
  });

  test('통합: ' + action + '은 정답 이름을 읽는 도중 취소하고 늦은 TTS 종료로 상대 마이크를 켜지 않는다', async t => {
    const f = fixture(); t.after(() => f.game.cleanup());
    f.setLoud(0.1); f.click('[data-chain-mic]'); await flush();
    await f.advance(300); f.setLoud(0); await f.advance(1200);
    assert.equal(f.game.snapshot().total, 1);
    assert.equal(f.spoken[0].active, true);
    if (action === 'pause') f.click('[data-chain-pause]');
    else if (action === 'home') f.click('[data-chain-home]');
    else if (action === 'reset') f.click('[data-chain-reset]');
    else f.hide(true);
    assert.equal(f.spoken[0].active, false);
    assert.ok(f.streams[0].track.stops > 0, '취소는 다음 차례를 위해 보관하던 트랙도 닫는다');
    assert.ok(f.contexts[0].closed > 0);
    f.finishSpeech();
    if (action === 'hidden') f.hide(false);
    await f.advance(60000);
    assert.equal(f.game.snapshot().total, action === 'reset' ? 0 : 1);
    assert.equal(f.game.snapshot().playerIndex, action === 'reset' ? 0 : 1);
    assert.equal(f.streams.length, 1);
    assert.equal(f.requests.length, 1);
    assert.equal(f.timers.size, 0);
  });
}

test('통합: 권한 대기 중 화면을 나가면 늦게 허용된 실제 트랙도 닫고 녹음·업로드하지 않는다', async t => {
  const permission = deferred(), f = fixture({ permission }); t.after(() => f.game.cleanup());
  f.click('[data-chain-mic]'); await flush();
  f.click('[data-chain-home]');
  permission.resolve(f.stream()); await flush();
  assert.equal(f.streams[0].track.stops, 1);
  assert.equal(f.recorders.length, 0);
  assert.equal(f.requests.length, 0);
  assert.equal(f.game.snapshot().total, 0);
  assert.equal(f.timers.size, 0);
});

test('통합: 로그인 만료 응답은 보관 마이크까지 닫고 자동 재요청 없이 같은 차례의 글 입력을 남긴다', async t => {
  const network = deferred(), f = fixture({ network }); t.after(() => f.game.cleanup());
  f.setLoud(0.1); f.click('[data-chain-mic]'); await flush();
  await f.advance(300); f.setLoud(0); await f.advance(1200);
  network.resolve({ ok: false, status: 401, json: async () => ({ code: 'auth-required' }) }); await flush();
  await f.advance(30000);
  assert.equal(f.requests.length, 1);
  assert.equal(f.errors[0].code, 'auth-required');
  assert.ok(f.streams[0].track.stops > 0);
  assert.ok(f.contexts[0].closed > 0);
  assert.equal(f.game.snapshot().total, 0);
  assert.equal(f.game.snapshot().playerIndex, 0);
  assert.equal(f.node('#chain-pause').hidden, true);
  assert.equal(f.timers.size, 0);
  assert.equal(f.game.submit('일본').status, 'accepted');
  assert.equal(f.game.snapshot().total, 1);
});

test('통합: 마지막 나라를 인정하면 보관 마이크도 닫고 이름 재생 완료 뒤 다음 듣기를 켜지 않는다', async t => {
  const f = fixture({ countryCodes: ['kr'] }); t.after(() => f.game.cleanup());
  f.setLoud(0.1); f.click('[data-chain-mic]'); await flush();
  await f.advance(300); f.setLoud(0); await f.advance(1200);
  assert.equal(f.game.snapshot().complete, true);
  assert.equal(f.game.snapshot().total, 1);
  assert.ok(f.streams[0].track.stops > 0);
  assert.ok(f.contexts[0].closed > 0);
  assert.equal(f.node('#chain-mic').disabled, true);
  assert.equal(f.node('#chain-pause').hidden, false, '마지막 이름을 읽는 동안에도 읽기 멈추기를 제공한다');
  f.finishSpeech(); await f.advance(30000);
  assert.equal(f.requests.length, 1);
  assert.equal(f.streams.length, 1);
  assert.equal(f.timers.size, 0);
  assert.equal(f.node('#chain-pause').hidden, true);
});

test('통합: 최신 문장 판정은 전사에 나온 Jev 선택을 보존하고 나오지 않은 나라 선택은 거부한다', async t => {
  for (const [code, name, accepted] of [['pt', '포르투갈', true], ['br', '브라질', false]]) {
    const f = fixture({ responses: [{ text: '스페인은 처음에 떠올랐던 거고 포르투갈 쪽으로 할래',
      resolution: { source: 'jev', status: 'answer', code, text: name, reason: 'final-selection' } }] });
    t.after(() => f.game.cleanup());
    f.setLoud(0.1); f.click('[data-chain-mic]'); await flush();
    await f.advance(300); f.setLoud(0); await f.advance(1200);
    assert.equal(f.requests[0].config.headers['X-Speech-Mode'], 'country-chain');
    assert.equal(f.game.snapshot().total, accepted ? 1 : 0);
    if (accepted) {
      assert.equal(f.game.snapshot().countries[0].code, 'pt');
      assert.deepEqual(f.spoken[0].lines, ['포르투갈']);
      assert.equal(f.streams[0].track.enabled, false);
    } else {
      assert.equal(f.spoken.length, 0);
      assert.ok(f.streams[0].track.stops > 0);
      await f.advance(30000);
      assert.equal(f.requests.length, 1, '유효하지 않은 모델 선택도 자동 유료 재시도하지 않는다');
    }
  }
});

test('통합: 서버의 다른 사람·차례·놀이 응답을 현재 나라 이어말하기 정답으로 적용하지 않는다', async t => {
  for (const mismatch of [{ playerId: '1' }, { turnId: 'old' }, { mode: 'capitalVoice' }]) {
    const f = fixture({ responses: [{ text: '대한민국', ...mismatch }] }); t.after(() => f.game.cleanup());
    f.setLoud(0.1); f.click('[data-chain-mic]'); await flush();
    await f.advance(300); f.setLoud(0); await f.advance(1200);
    assert.equal(f.requests.length, 1);
    assert.equal(f.game.snapshot().total, 0);
    assert.equal(f.game.snapshot().playerIndex, 0);
    assert.equal(f.spoken.length, 0);
    assert.equal(f.errors[0].code, 'service');
    assert.ok(f.streams[0].track.stops > 0);
    await f.advance(30000);
    assert.equal(f.requests.length, 1);
  }
});

test('통합: TTS 중 보관한 트랙 종료·컨텍스트 종료는 다음 차례에 새 마이크로 복구하고 요청을 반복하지 않는다', async t => {
  for (const reason of ['ended', 'closed']) {
    const f = fixture({ responses: ['대한민국', '일본'] }); t.after(() => f.game.cleanup());
    f.setLoud(0.1); f.click('[data-chain-mic]'); await flush();
    await f.advance(300); f.setLoud(0); await f.advance(1200);
    assert.equal(f.game.snapshot().total, 1);
    assert.equal(f.streams[0].track.enabled, false);
    if (reason === 'ended') f.streams[0].track.end();
    else f.contexts[0].state = 'closed';
    f.finishSpeech(); await f.advance(300);
    assert.equal(f.streams.length, 2, reason + ': 사용할 수 없는 자원을 재사용하지 않는다');
    assert.equal(f.contexts.length, 2);
    assert.ok(f.streams[0].track.stops > 0);
    assert.equal(f.contexts[1].state, 'running');
    f.setLoud(0.1); await f.advance(300); f.setLoud(0); await f.advance(1200);
    assert.equal(f.requests.length, 2);
    assert.equal(f.game.snapshot().total, 2);
    assert.deepEqual(Array.from(f.game.snapshot().scores), [1, 1]);
    assert.deepEqual(f.spoken[1].lines, ['일본']);
  }
});

test('통합: 보관 중 suspended 된 컨텍스트는 다음 차례 전에 resume하고 같은 허용 마이크를 유지한다', async t => {
  const f = fixture({ responses: ['대한민국', '일본'] }); t.after(() => f.game.cleanup());
  f.setLoud(0.1); f.click('[data-chain-mic]'); await flush();
  await f.advance(300); f.setLoud(0); await f.advance(1200);
  f.contexts[0].state = 'suspended';
  f.finishSpeech(); await f.advance(300);
  assert.equal(f.contexts[0].state, 'running', 'suspended AudioContext를 그대로 두면 영원히 조용한 대기가 된다');
  assert.equal(f.contexts[0].resumes, 2);
  assert.equal(f.streams.length, 1);
  assert.equal(f.contexts.length, 1);
  f.setLoud(0.1); await f.advance(300); f.setLoud(0); await f.advance(1200);
  assert.equal(f.requests.length, 2);
  assert.equal(f.game.snapshot().total, 2);
});

test('통합: 활성 트랙의 ended 이벤트·누락된 이벤트 모두 오류를 알리고 닫으며 자동 재요청하지 않는다', async t => {
  for (const notify of [true, false]) {
    const f = fixture(); t.after(() => f.game.cleanup());
    f.click('[data-chain-mic]'); await flush();
    f.streams[0].track.end(notify); await f.advance(100);
    assert.equal(f.errors.length, 1);
    assert.equal(f.errors[0].code, 'recording');
    assert.match(f.node('#chain-voice-state').textContent, /마이크 연결|같은 차례/);
    assert.equal(f.node('#chain-pause').hidden, true);
    assert.equal(f.node('#chain-mic').disabled, false);
    assert.ok(f.contexts[0].closed > 0);
    assert.equal(f.timers.size, 0);
    await f.advance(30000);
    assert.equal(f.requests.length, 0);
    assert.equal(f.streams.length, 1);
    assert.equal(f.game.snapshot().total, 0);
    assert.equal(f.game.snapshot().playerIndex, 0);
  }
});
