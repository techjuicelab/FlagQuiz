import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createRealtimeTranscriber } from '../server/realtime-speech.mjs';
import { createTranscriber, readSpeechInput, validateSpeechInput, SpeechError, MAX_AUDIO_BYTES } from '../server/speech.mjs';

function wav(durationMs = 1000, sample = 512) {
  const samples = Math.round(durationMs * 16);
  const audio = Buffer.alloc(44 + samples * 2);
  audio.write('RIFF', 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28);
  audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(samples * 2, 40);
  for (let i = 44; i < audio.length; i += 2) audio.writeInt16LE(sample, i);
  return audio;
}

function request(audio, headers = {}, options) {
  const req = new PassThrough();
  req.headers = { 'content-type': 'audio/wav', 'x-audio-duration-ms': '1000', 'x-player-id': '0', 'x-turn-id': '4', ...headers };
  const result = readSpeechInput(req, options);
  req.end(audio);
  return result;
}

function input(duration = 1000) { return { audio: wav(duration), mimeType: 'audio/wav', durationMs: duration, playerId: '0', turnId: '4' }; }
function code(expected) { return error => error instanceof SpeechError && error.code === expected; }

test('서버는 PCM WAV 표본 수에서 실제 길이를 읽고 플레이어·차례를 유지한다', async () => {
  const result = await request(wav());
  assert.equal(result.durationMs, 1000);
  assert.equal(result.playerId, '0');
  assert.equal(result.turnId, '4');
  assert.equal(result.mimeType, 'audio/wav');
  assert.equal(result.mode, 'country-chain');
  assert.equal(result.audio.length, 32044);
  const boundary = await request(wav(12000), { 'x-audio-duration-ms': '12000' });
  assert.equal(boundary.durationMs, 12000);
});

test('음성 모드는 허용된 나라·수도·이어 말하기만 받고 알 수 없는 모드는 본문을 읽기 전에 거절한다', async () => {
  for (const mode of ['voice', 'capitalVoice', 'country-chain']) {
    assert.equal((await request(wav(), { 'x-speech-mode': mode })).mode, mode);
  }
  for (const mode of ['other', '', null, ['voice'], ['voice', 'capitalVoice']]) {
    await assert.rejects(request(wav(), { 'x-speech-mode': mode }), code('invalid_mode'));
  }
});

test('서버도 완전무음 PCM은 유료 호출 전에 거절하지만 매우 작은 음성 표본은 허용한다', async () => {
  await assert.rejects(request(wav(1000, 0)), code('no_speech'));
  assert.equal((await request(wav(1000, 1))).durationMs, 1000);
});

test('인증 대기 중 pause한 요청은 리스너 설치 후 재개하여 이미 도착한 WAV 전체를 읽는다', async () => {
  const req = new PassThrough();
  req.headers = { 'content-type': 'audio/wav', 'x-audio-duration-ms': '1000', 'x-player-id': '0', 'x-turn-id': '4' };
  req.pause(); req.end(wav());
  assert.equal(req.readableFlowing, false);
  const result = await readSpeechInput(req, { timeoutMs: 100 });
  assert.deepEqual(result.audio, wav()); assert.equal(result.durationMs, 1000);
  assert.equal(req.listenerCount('data'), 0);
});

test('조작한 길이 헤더로 12초보다 긴 실제 음성을 유료 서비스에 전달할 수 없다', async () => {
  await assert.rejects(request(wav(12001)), code('audio_too_long'));
  await assert.rejects(request(wav(), { 'x-audio-duration-ms': '12000' }), code('invalid_audio'));
  for (const duration of ['0', '-1', '12001', 'NaN', '1000.5', '']) {
    await assert.rejects(request(wav(), { 'x-audio-duration-ms': duration }), code('invalid_audio'));
  }
});

test('크기·컨테이너·표본 형식·플레이어·차례 오류는 외부 호출 전에 거절한다', async () => {
  await assert.rejects(request(Buffer.alloc(MAX_AUDIO_BYTES + 1)), code('audio_too_large'));
  await assert.rejects(request(wav(), { 'content-length': String(MAX_AUDIO_BYTES + 1) }), code('audio_too_large'));
  await assert.rejects(request(wav(), { 'content-type': 'audio/webm' }), code('unsupported_audio'));
  await assert.rejects(request(wav(), { 'x-player-id': '../other' }), code('invalid_audio'));
  await assert.rejects(request(wav(), { 'x-turn-id': '' }), code('invalid_audio'));
  await assert.rejects(request(wav(50), { 'x-audio-duration-ms': '50' }), code('no_speech'));
  for (const [offset, value] of [[4, 0], [16, 0], [24, 48000], [28, 0], [40, 10]]) {
    const audio = wav(); audio.writeUInt32LE(value, offset);
    assert.throws(() => validateSpeechInput({ ...input(), audio }), code('invalid_audio'));
  }
  const stereo = wav(); stereo.writeUInt16LE(2, 22);
  assert.throws(() => validateSpeechInput({ ...input(), audio: stereo }), code('invalid_audio'));
  assert.throws(() => validateSpeechInput({ ...input(), audio: Buffer.alloc(10) }), code('invalid_audio'));
});

test('업로드 취소와 시간 제한은 대기 중인 메모리 버퍼를 폐기한다', async () => {
  const req = new PassThrough();
  req.headers = { 'content-type': 'audio/wav', 'x-audio-duration-ms': '1000', 'x-player-id': '1', 'x-turn-id': '2' };
  const controller = new AbortController();
  const pending = readSpeechInput(req, { signal: controller.signal });
  req.write(wav().subarray(0, 100));
  controller.abort();
  await assert.rejects(pending, code('cancelled'));
  assert.equal(req.listenerCount('data'), 0);
  const slow = new PassThrough(); slow.headers = req.headers;
  await assert.rejects(readSpeechInput(slow, { timeoutMs: 5 }), code('upload_timeout'));
  assert.equal(slow.listenerCount('data'), 0);
});

function provider(options = {}) {
  const sockets = [], delays = [];
  const final = text => ({ text, is_final: true });
  class Socket extends EventEmitter {
    constructor(url, config) {
      super(); this.url = url; this.config = config; this.readyState = 0; this.bufferedAmount = 0;
      this.sent = []; this.pending = []; this.terminations = 0; sockets.push(this);
      if (options.constructorError) throw new Error('test-secret raw constructor detail');
      if (!options.stalled) queueMicrotask(() => { this.readyState = 1; this.emit('open'); });
    }
    send(data, config, callback) {
      this.sent.push({ data, config });
      if (config.binary && options.sendThrow) throw new Error('test-secret raw send detail');
      if (config.binary && options.deferSend) { this.pending.push(callback); return; }
      callback(config.binary && options.sendError ? new Error('test-secret raw send detail') : null);
      if (!config.binary && JSON.parse(data).type === 'finalize' && !options.noFinal) {
        if (options.onFinalize) options.onFinalize(this);
        else this.receive({ tokens: [final(options.text || '  대한민국  '), final('<fin>')] });
      }
      if (config.binary) options.onFrame?.(this);
    }
    receive(result) { this.emit('message', Buffer.from(JSON.stringify(result)), false); }
    terminate() { this.terminations++; this.readyState = 3; this.emit('close'); }
  }
  const realtime = createRealtimeTranscriber({ apiKey: 'test-secret', WebSocketImpl: Socket, timeoutMs: 1000 });
  const transcribe = createTranscriber({ apiKey: 'test-secret', realtimeTranscriber: realtime, timeoutMs: 1000,
    delayImpl: async (ms, signal) => { delays.push(ms); assert.equal(signal.aborted, false); await options.delay?.(ms, signal); },
    ...options.transcriber });
  return { sockets, delays, realtime, transcribe, Socket };
}
const final = text => ({ text, is_final: true });
const referencePattern = /^flagquiz-rt:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const tick = () => new Promise(setImmediate);

test('파일 대체 경로도 Soniox RT만 사용하고 WAV 헤더 없이 PCM을 한 연결로 보낸다', async () => {
  const f = provider();
  assert.equal(f.transcribe.ready, true); assert.equal(f.transcribe.model, 'stt-rt-v5');
  assert.deepEqual(await f.transcribe(input()), { text: '대한민국' });
  assert.equal(f.sockets.length, 1);
  const ws = f.sockets[0], config = JSON.parse(ws.sent[0].data);
  assert.equal(ws.url, 'wss://stt-rt.soniox.com/transcribe-websocket');
  assert.equal(ws.config.headers.Authorization, 'Bearer test-secret');
  assert.equal(config.model, 'stt-rt-v5'); assert.deepEqual(config.language_hints, ['ko']);
  assert.equal(config.language_hints_strict, true); assert.match(config.client_reference_id, referencePattern);
  assert.equal(Object.hasOwn(config, 'context'), false); assert.equal(Object.hasOwn(config, 'prompt'), false);
  const frames = ws.sent.filter(row => row.config.binary);
  assert.equal(frames.length, 10); assert.ok(frames.every(row => row.data.length <= 3200));
  assert.deepEqual(Buffer.concat(frames.map(row => row.data)), input().audio.subarray(44));
  assert.deepEqual(f.delays, Array(10).fill(100));
  assert.deepEqual(JSON.parse(ws.sent.at(-1).data), { type: 'finalize' });
  assert.equal(ws.terminations, 1);
});

test('나라·수도·이어 말하기는 큰 사전·정답·동적 후보를 보내지 않고 매번 고유 reference를 쓴다', async () => {
  const f = provider(), references = new Set();
  for (const mode of ['voice', 'capitalVoice', 'country-chain']) {
    await f.transcribe({ ...input(100), mode, answer: '파리', country: '프랑스', prompt: '파리',
      candidates: ['파리'], context: { terms: ['프랑스'] }, model: 'client-model', client_reference_id: 'private-child' });
    const ws = f.sockets.at(-1), config = JSON.parse(ws.sent[0].data);
    assert.match(config.client_reference_id, referencePattern); references.add(config.client_reference_id);
    assert.equal(Object.hasOwn(config, 'context'), false); assert.equal(Object.hasOwn(config, 'prompt'), false);
    assert.doesNotMatch(ws.sent[0].data, /파리|프랑스|client-model|private-child/);
  }
  assert.equal(references.size, 3);
  await assert.rejects(f.transcribe({ ...input(), mode: 'other' }), code('invalid_mode'));
  assert.equal(f.sockets.length, 3);
});

test('기본 키는 SONIOX_API_KEY만 쓰고 Groq나 다른 공급자의 키로 대체하지 않는다', async () => {
  const previous = Object.fromEntries(['SONIOX_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY'].map(key => [key, process.env[key]]));
  const f = provider();
  try {
    process.env.GROQ_API_KEY = 'test-other-provider-secret'; process.env.OPENAI_API_KEY = 'test-other-provider-secret';
    delete process.env.SONIOX_API_KEY;
    const missing = createTranscriber({ WebSocketImpl: f.Socket });
    assert.equal(missing.ready, false); await assert.rejects(missing(input()), code('speech_unavailable'));
    assert.equal(f.sockets.length, 0);
    process.env.SONIOX_API_KEY = '  test-soniox-secret  ';
    const configured = createTranscriber({ WebSocketImpl: f.Socket, delayImpl: async () => {} });
    assert.equal(configured.ready, true); assert.deepEqual(await configured(input(100)), { text: '대한민국' });
    assert.equal(f.sockets.length, 1);
    assert.equal(f.sockets[0].config.headers.Authorization, 'Bearer test-soniox-secret');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('키 없음·무효 음성·미리 취소한 요청은 유료 연결을 만들지 않는다', async () => {
  const f = provider();
  const missing = createTranscriber({ apiKey: '', realtimeTranscriber: f.realtime });
  assert.equal(missing.ready, false); await assert.rejects(missing(input()), code('speech_unavailable'));
  await assert.rejects(f.transcribe(input(12001)), code('audio_too_long'));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.transcribe(input(), { signal: controller.signal }), code('cancelled'));
  assert.equal(f.sockets.length, 0);
});

test('미해결 참조·줄바꿈 키·준비되지 않은 공급자는 외부 연결 전에 거절한다', async () => {
  const f = provider();
  for (const apiKey of ['op://Private/Soniox/api-key', '  op://Private/Soniox/api-key  ', '"op://Private/Soniox/api-key"',
    "'op://Private/Soniox/api-key'", 'OP://Private/Soniox/api-key', '  ', 'test\nsecret']) {
    const transcribe = createTranscriber({ apiKey, realtimeTranscriber: f.realtime });
    assert.equal(transcribe.ready, false); await assert.rejects(transcribe(input()), code('speech_unavailable'));
  }
  const unavailable = createTranscriber({ apiKey: 'test-secret', realtimeTranscriber: { ready: false } });
  assert.equal(unavailable.ready, false); await assert.rejects(unavailable(input()), code('speech_unavailable'));
  assert.equal(f.sockets.length, 0);
});

test('큰 WAV도 100ms PCM씩 송신 완료를 기다려 버퍼 상한 안에서 한 번만 전송한다', async () => {
  const f = provider({ deferSend: true });
  const pending = f.transcribe(input(12000));
  await tick(); const ws = f.sockets[0];
  for (let i = 0; i < 120; i++) {
    assert.equal(ws.sent.filter(row => row.config.binary).length, i + 1);
    assert.equal(ws.pending.length, 1); const callback = ws.pending.shift(); callback(); callback();
    await tick();
  }
  assert.deepEqual(await pending, { text: '대한민국' });
  assert.equal(f.sockets.length, 1); assert.equal(f.delays.reduce((sum, value) => sum + value, 0), 12000);
  assert.deepEqual(Buffer.concat(ws.sent.filter(row => row.config.binary).map(row => row.data)), input(12000).audio.subarray(44));
});

test('부분 전사를 반복해서 덧붙이지 않고 여러 endpoint의 확정 발화를 최종 결과에 보존한다', async () => {
  let frames = 0;
  const f = provider({ onFrame(ws) {
    frames++;
    if (frames === 1) {
      ws.receive({ tokens: [{ text: '대한', is_final: false }] });
      ws.receive({ tokens: [final('대한민국'), final('<end>')] });
    }
    if (frames === 2) ws.receive({ tokens: [{ text: '아니', is_final: false }] });
  }, onFinalize(ws) { ws.receive({ tokens: [final('아니면 일본'), final('<fin>')] }); } });
  assert.deepEqual(await f.transcribe(input()), { text: '대한민국 아니면 일본' });
});

test('여러 확정 구간 사이의 공백을 포함한 전체 전사는 500자까지만 반환한다', async () => {
  for (const tail of [249, 250]) {
    let frames = 0;
    const f = provider({ onFrame(ws) {
      if (++frames === 1) ws.receive({ tokens: [final('가'.repeat(250)), final('<end>')] });
    }, onFinalize(ws) { ws.receive({ tokens: [final('나'.repeat(tail)), final('<fin>')] }); } });
    if (tail === 249) assert.equal((await f.transcribe(input())).text.length, 500);
    else await assert.rejects(f.transcribe(input()), code('speech_failed'));
    assert.equal(f.sockets.length, 1); assert.equal(f.sockets[0].terminations, 1);
  }
});

test('조기 finished·누적 500자 초과·상위 오류는 안전한 실패이고 자동 재연결하지 않는다', async () => {
  for (const options of [
    { constructorError: true }, { sendError: true }, { sendThrow: true },
    { onFrame: ws => ws.receive({ tokens: [final('대한민국')], finished: true }) },
    { onFrame: ws => ws.receive({ tokens: [final('x'.repeat(251)), final('<end>')] }) },
    { onFinalize: ws => ws.receive({ error_code: 500, error_message: 'test-secret raw provider detail' }) }
  ]) {
    const f = provider(options);
    await assert.rejects(f.transcribe(input()), error => {
      assert.ok(error instanceof SpeechError); assert.equal(error.code, 'speech_failed');
      assert.doesNotMatch(error.message, /test-secret|raw|provider/); return true;
    });
    await tick(); assert.equal(f.sockets.length, 1);
  }
});

test('연결·송신 callback·최종 응답 대기는 전체 시간 제한과 취소 시 즉시 닫힌다', async () => {
  for (const options of [{ stalled: true }, { deferSend: true }, { noFinal: true }]) {
    const timed = provider({ ...options, transcriber: { timeoutMs: 10 } });
    await assert.rejects(timed.transcribe(input(100)), code('speech_timeout'));
    assert.equal(timed.sockets.length, 1); assert.equal(timed.sockets[0].terminations, 1);
    const f = provider(options), controller = new AbortController();
    const pending = f.transcribe(input(100), { signal: controller.signal }); await tick();
    controller.abort(); await assert.rejects(pending, code('cancelled'));
    const ws = f.sockets[0], before = ws.sent.length;
    ws.pending.shift()?.(); ws.receive({ tokens: [final('late answer'), final('<fin>')] });
    await tick(); assert.equal(ws.terminations, 1); assert.equal(ws.sent.length, before); assert.equal(f.sockets.length, 1);
  }
});

test('실제 pacing 대기 중 취소는 다음 PCM과 finalize를 보내지 않는다', async () => {
  const f = provider(), controller = new AbortController();
  const transcribe = createTranscriber({ apiKey: 'test-secret', realtimeTranscriber: f.realtime });
  const pending = transcribe(input(), { signal: controller.signal });
  await tick(); assert.equal(f.sockets[0].sent.filter(row => row.config.binary).length, 1);
  controller.abort(); await assert.rejects(pending, code('cancelled'));
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(f.sockets[0].sent.filter(row => row.config.binary).length, 1);
  assert.equal(f.sockets[0].sent.filter(row => !row.config.binary).length, 1);
});
