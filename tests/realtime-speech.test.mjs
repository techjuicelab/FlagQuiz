import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { createRealtimeTranscriber } from '../server/realtime-speech.mjs';
import { SpeechError } from '../server/speech.mjs';

function setup(options = {}) {
  const sockets = [], transcripts = [], errors = [];
  class Socket extends EventEmitter {
    constructor(url, config) {
      super(); this.url = url; this.config = config; this.readyState = 0; this.bufferedAmount = 0;
      this.sent = []; this.pendingSends = []; this.terminations = 0; sockets.push(this);
      if (options.constructorError) throw new Error('provider-key private upstream address');
      options.constructorAbort?.abort();
    }
    open() { this.readyState = 1; this.emit('open'); }
    send(data, config, callback) {
      if (options.sendThrow) throw new Error('provider-key private send detail');
      this.sent.push({ data, config });
      if (options.deferSend) this.pendingSends.push(callback);
      else callback(options.sendError ? new Error('provider-key private send detail') : null);
    }
    flush(error = null) { this.pendingSends.shift()?.(error); }
    receive(value, binary = false) { this.emit('message', typeof value === 'string' ? value : Buffer.from(JSON.stringify(value)), binary); }
    terminate() { this.terminations++; this.readyState = 3; this.emit('close', 1006, Buffer.from('private provider close detail')); }
  }
  const transcriber = createRealtimeTranscriber({ apiKey: 'provider-key', WebSocketImpl: Socket, timeoutMs: 2000, ...options.transcriber });
  const connect = extra => transcriber.connect({ mode: 'voice', onTranscript: result => transcripts.push(result), onError: error => errors.push(error), ...extra });
  return { sockets, transcripts, errors, transcriber, connect };
}
const final = text => ({ text, is_final: true });
const partial = text => ({ text, is_final: false });
const code = expected => error => error instanceof SpeechError && error.code === expected;

test('Soniox 연결은 서버 고정 WSS·Bearer와 한국어 PCM 설정만 사용한다', async () => {
  for (const mode of ['voice', 'capitalVoice', 'country-chain']) {
    const f = setup(), c = f.connect({ mode, apiKey: 'client-key', model: 'client-model', answer: '프랑스' });
    const ws = f.sockets[0];
    assert.equal(ws.url, 'wss://stt-rt.soniox.com/transcribe-websocket');
    assert.deepEqual(ws.config.headers, { Authorization: 'Bearer provider-key' });
    assert.equal(ws.config.perMessageDeflate, false); assert.equal(ws.config.maxPayload, 65536);
    assert.equal(c.write(Buffer.alloc(320)), false);
    ws.open(); await c.ready;
    const config = JSON.parse(ws.sent[0].data);
    assert.deepEqual(config, { model: 'stt-rt-v5', audio_format: 'pcm_s16le', sample_rate: 16000, num_channels: 1,
      language_hints: ['ko'], enable_endpoint_detection: true, endpoint_latency_adjustment_level: 3, endpoint_sensitivity: 0.3, max_endpoint_delay_ms: 500 });
    assert.equal(ws.sent[0].config.binary, false);
    assert.doesNotMatch(ws.sent[0].data, /provider-key|client-key|프랑스|client-model/);
    const audio = Buffer.from([1, 0, 2, 0]); assert.equal(c.write(audio), true);
    assert.deepEqual(ws.sent[1].data, audio); assert.equal(ws.sent[1].config.binary, true);
    audio.fill(0); assert.deepEqual(ws.sent[1].data, Buffer.from([1, 0, 2, 0]));
    c.close();
  }
});

test('ready는 open뿐 아니라 고정 설정 전송 완료를 기다린다', async () => {
  const f = setup({ deferSend: true }), c = f.connect(), ws = f.sockets[0]; let ready = false;
  c.ready.then(() => { ready = true; }); ws.open(); await Promise.resolve();
  assert.equal(ready, false); assert.equal(c.write(Buffer.alloc(320)), false);
  ws.flush(); await c.ready; assert.equal(ready, true); assert.equal(c.write(Buffer.alloc(320)), true);
  c.close(); ws.flush(new Error('private late send failure')); assert.equal(f.errors.length, 0);
});

test('최종 token만 누적하고 부분 전사는 매 응답의 최신 부분으로 대체한다', async () => {
  const f = setup(), c = f.connect(), ws = f.sockets[0]; ws.open(); await c.ready;
  ws.receive({ tokens: [partial('미국')] });
  ws.receive({ tokens: [partial('영국')] });
  ws.receive({ tokens: [final('대한'), partial('민')] });
  ws.receive({ tokens: [final('민국'), partial(' 입니다')] });
  ws.receive({ tokens: [] });
  assert.deepEqual(f.transcripts, [
    { text: '미국', finalText: '', hasNonFinal: true, boundary: null, finished: false },
    { text: '영국', finalText: '', hasNonFinal: true, boundary: null, finished: false },
    { text: '대한민', finalText: '대한', hasNonFinal: true, boundary: null, finished: false },
    { text: '대한민국 입니다', finalText: '대한민국', hasNonFinal: true, boundary: null, finished: false },
    { text: '대한민국', finalText: '대한민국', hasNonFinal: false, boundary: null, finished: false }
  ]);
  c.close();
});

for (const [marker, boundary] of [['<end>', 'end'], ['<fin>', 'fin']]) {
  test(`${marker}는 텍스트에서 제거하고 한 차례 경계를 한 번만 전달한다`, async () => {
    const f = setup(), c = f.connect(), ws = f.sockets[0]; ws.open(); await c.ready;
    ws.receive({ tokens: [final(' 파리'), final(marker)] });
    ws.receive({ tokens: [final('런던'), final(marker)] }); ws.emit('error', new Error('private late error'));
    assert.deepEqual(f.transcripts, [{ text: '파리', finalText: '파리', hasNonFinal: false, boundary, finished: false }]);
    assert.equal(f.errors.length, 0); assert.equal(ws.terminations, 1);
    assert.equal(c.write(Buffer.alloc(320)), false); assert.equal(c.finalize(), false); c.close();
    assert.equal(ws.terminations, 1);
  });
}

test('finished 응답은 경계 token 없이도 한 번 종료한다', async () => {
  const f = setup(), c = f.connect(), ws = f.sockets[0]; ws.open(); await c.ready;
  ws.receive({ tokens: [final('일본')], finished: true });
  assert.deepEqual(f.transcripts, [{ text: '일본', finalText: '일본', hasNonFinal: false, boundary: null, finished: true }]);
  assert.equal(ws.terminations, 1); assert.equal(f.errors.length, 0);
});

test('자동 endpoint와 manual finalize 경계가 같은 응답에 와도 완료는 한 번이다', async () => {
  const f = setup(), c = f.connect(), ws = f.sockets[0]; ws.open(); await c.ready;
  ws.receive({ tokens: [final('일본'), final('<end>'), final('<fin>'), final('<fin>')] });
  assert.equal(f.transcripts.length, 1); assert.equal(f.transcripts[0].boundary, 'end');
  assert.equal(f.transcripts[0].text, '일본'); assert.equal(f.errors.length, 0); assert.equal(ws.terminations, 1);
});

test('manual finalize는 고정 control을 한 번 보내고 추가 PCM·중복 finalize를 막는다', async () => {
  const f = setup(), c = f.connect(), ws = f.sockets[0];
  assert.equal(c.finalize(), false); ws.open(); await c.ready;
  assert.equal(c.write(Buffer.alloc(3200)), true); assert.equal(c.finalize(), true); assert.equal(c.finalize(), false);
  assert.equal(c.write(Buffer.alloc(320)), false);
  assert.equal(ws.sent.length, 3); assert.deepEqual(JSON.parse(ws.sent[2].data), { type: 'finalize' });
  assert.equal(ws.sent[2].config.binary, false); c.close();
});

test('없거나 미해결인 키·잘못된 모드·선취소는 공급자 소켓을 만들지 않는다', async () => {
  for (const apiKey of ['', ' ', 'op://Private/Soniox/credential', ' "op://Private/Soniox/credential" ', 'key\nother']) {
    const f = setup({ transcriber: { apiKey } }), c = f.connect();
    assert.equal(f.transcriber.ready, false); await assert.rejects(c.ready, code('speech_unavailable'));
    assert.equal(f.sockets.length, 0); assert.equal(f.errors.length, 1);
  }
  const f = setup(), c = f.connect({ mode: 'other' }); await assert.rejects(c.ready, code('invalid_mode'));
  assert.equal(f.sockets.length, 0);
  const a = new AbortController(); a.abort(); const before = f.connect({ signal: a.signal });
  await assert.rejects(before.ready, code('cancelled')); assert.equal(f.sockets.length, 0);
});

test('ready timeout은 연결을 끊고 거부·오류를 한 번만 전달한다', async () => {
  const f = setup({ transcriber: { timeoutMs: 5 } }), c = f.connect(), ws = f.sockets[0];
  await assert.rejects(c.ready, code('speech_timeout'));
  ws.open(); ws.emit('error', new Error('private late error')); c.close();
  assert.equal(f.errors.length, 1); assert.equal(ws.sent.length, 0); assert.equal(ws.terminations, 1);
});

test('설정 전송 중 abort와 늦은 send callback이 ready를 되살리지 않는다', async () => {
  const abort = new AbortController(), f = setup({ deferSend: true }), c = f.connect({ signal: abort.signal }), ws = f.sockets[0];
  ws.open(); abort.abort(); await assert.rejects(c.ready, code('cancelled'));
  ws.flush(); ws.emit('error', new Error('private late error')); ws.receive({ tokens: [final('일본')] });
  assert.equal(f.errors.length, 1); assert.equal(f.transcripts.length, 0); assert.equal(c.write(Buffer.alloc(320)), false);
});

test('소켓 생성 중 abort도 뒤늦게 반환된 연결을 남기지 않는다', async () => {
  const abort = new AbortController(), f = setup({ constructorAbort: abort }), c = f.connect({ signal: abort.signal });
  await assert.rejects(c.ready, code('cancelled'));
  const ws = f.sockets[0]; ws.open();
  assert.equal(ws.terminations, 1); assert.equal(ws.sent.length, 0); assert.equal(f.errors.length, 1);
});

test('연결 후 abort는 결과를 폐기하고 명시적인 close는 오류 콜백 없이 정리한다', async () => {
  const a = new AbortController(), f = setup(), c = f.connect({ signal: a.signal }), ws = f.sockets[0]; ws.open(); await c.ready;
  a.abort(); a.abort(); ws.receive({ tokens: [final('일본')] });
  assert.equal(f.errors.length, 1); assert.equal(f.errors[0].code, 'cancelled'); assert.equal(f.transcripts.length, 0);
  const g = setup(), closed = g.connect(), before = g.sockets[0]; closed.close();
  await assert.rejects(closed.ready, code('cancelled')); before.open(); before.emit('error', new Error('private late error'));
  assert.equal(g.errors.length, 0); assert.equal(before.sent.length, 0);
});

test('준비 후 응답이 멎은 공급자도 전체 timeout에서 연결을 정리한다', async () => {
  const f = setup({ transcriber: { timeoutMs: 10 } }), c = f.connect(), ws = f.sockets[0]; ws.open(); await c.ready;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(f.errors.length, 1); assert.equal(f.errors[0].code, 'speech_timeout'); assert.equal(ws.terminations, 1);
});

test('소켓 생성·전송·공급자 오류의 키와 원문은 숨기고 자동 재시도하지 않는다', async () => {
  for (const options of [{ constructorError: true }, { sendThrow: true }, { sendError: true }]) {
    const f = setup(options), c = f.connect(); f.sockets[0]?.open();
    await assert.rejects(c.ready, code('speech_failed'));
    assert.equal(f.errors.length, 1); assert.doesNotMatch(f.errors[0].message, /provider-key|private/); assert.equal(f.sockets.length, 1);
  }
  for (const response of [ { error_code: 401, error_message: 'provider-key private auth detail' }, { tokens: 'provider-key' },
    { tokens: [{ text: 'provider-key', is_final: 'yes' }] }, 'not json provider-key' ]) {
    const f = setup(), c = f.connect(), ws = f.sockets[0]; ws.open(); await c.ready; ws.receive(response);
    ws.emit('error', new Error('provider-key private detail')); ws.receive({ tokens: [final('일본')] });
    assert.equal(f.errors.length, 1); assert.equal(f.errors[0].code, 'speech_failed');
    assert.doesNotMatch(f.errors[0].message, /provider-key|private/); assert.equal(f.transcripts.length, 0); assert.equal(f.sockets.length, 1);
  }
});

test('공급자 close는 부분 전사를 최종 답으로 승격하지 않는다', async () => {
  const f = setup(), c = f.connect(), ws = f.sockets[0]; ws.open(); await c.ready;
  ws.receive({ tokens: [partial('미국')] }); ws.readyState = 3; ws.emit('close', 1000, Buffer.from('private close reason'));
  assert.equal(f.errors.length, 1); assert.equal(f.transcripts.length, 1); assert.equal(f.transcripts[0].hasNonFinal, true);
});

test('64KiB 송신 상한은 현재 bufferedAmount와 다음 PCM·finalize를 함께 계산한다', async () => {
  for (const operation of ['write', 'finalize']) {
    const f = setup(), c = f.connect(), ws = f.sockets[0]; ws.open(); await c.ready;
    ws.bufferedAmount = operation === 'write' ? 65535 : 65536;
    assert.equal(operation === 'write' ? c.write(Buffer.alloc(2)) : c.finalize(), false);
    assert.equal(ws.sent.length, 1); assert.equal(f.errors.length, 1); assert.equal(f.errors[0].code, 'speech_backpressure');
  }
  const f = setup(), c = f.connect(), ws = f.sockets[0]; ws.open(); await c.ready;
  ws.bufferedAmount = 65534; assert.equal(c.write(Buffer.alloc(2)), true); c.close();
});

test('PCM은 짝수 Buffer와 12초 실제 표본 수를 제한한다', async () => {
  for (const audio of [new Uint8Array(2), Buffer.alloc(0), Buffer.alloc(3)]) {
    const f = setup(), c = f.connect(), ws = f.sockets[0]; ws.open(); await c.ready;
    assert.equal(c.write(audio), false); assert.equal(f.errors[0].code, 'invalid_audio');
  }
  const f = setup(), c = f.connect(), ws = f.sockets[0]; ws.open(); await c.ready;
  for (let i = 0; i < 12; i++) assert.equal(c.write(Buffer.alloc(32000)), true);
  assert.equal(c.write(Buffer.alloc(2)), false); assert.equal(f.errors[0].code, 'audio_too_long');
});

test('500문자 전사 상한과 잘못된 완료 경계는 안전하게 거절한다', async () => {
  for (const tokens of [ [final('가'.repeat(501))], [partial('가'.repeat(501))], [partial('미국'), final('<end>')],
    [final('<fin>'), final('일본')], [partial('<end>')] ]) {
    const f = setup(), c = f.connect(), ws = f.sockets[0]; ws.open(); await c.ready; ws.receive({ tokens });
    assert.equal(f.errors.length, 1); assert.equal(f.transcripts.length, 0); assert.equal(ws.terminations, 1);
  }
  const f = setup(), c = f.connect(), ws = f.sockets[0]; ws.open(); await c.ready;
  ws.receive({ tokens: [final('가'.repeat(500))] }); assert.equal(f.transcripts[0].text.length, 500);
  ws.receive({ tokens: [final('나')] }); assert.equal(f.errors.length, 1); assert.equal(f.transcripts.length, 1);
});

test('잘못된 binary·대형 provider 응답은 부분 결과 없이 종료한다', async () => {
  for (const [payload, binary] of [['{"tokens":[]}', true], ['x'.repeat(65537), false]]) {
    const f = setup(), c = f.connect(), ws = f.sockets[0]; ws.open(); await c.ready; ws.receive(payload, binary);
    assert.equal(f.errors.length, 1); assert.equal(f.transcripts.length, 0);
  }
});

test('실제 ws 전송은 Bearer·고정 config·PCM·finalize와 부분 대체를 함께 지킨다', async t => {
  const provider = new WebSocketServer({ host: '127.0.0.1', port: 0, perMessageDeflate: false });
  await once(provider, 'listening');
  let connection, configured = false, receivedPcm = false, receivedFinalize = false;
  t.after(async () => {
    connection?.close();
    for (const peer of provider.clients) peer.terminate();
    await new Promise(resolve => provider.close(resolve));
  });
  provider.on('connection', (peer, request) => {
    assert.equal(request.headers.authorization, 'Bearer local-test-key');
    peer.on('message', (data, binary) => {
      if (binary) {
        assert.equal(configured, true); receivedPcm = true; assert.equal(data.length, 3200);
        peer.send(JSON.stringify({ tokens: [partial('미국')] }));
        peer.send(JSON.stringify({ tokens: [final('대한'), partial('민')] }));
        return;
      }
      const message = JSON.parse(data.toString());
      if (!configured) { assert.equal(message.model, 'stt-rt-v5'); configured = true; return; }
      assert.deepEqual(message, { type: 'finalize' }); receivedFinalize = true;
      peer.send(JSON.stringify({ tokens: [final('민국'), final('<fin>')] }));
    });
  });
  class LocalSocket extends WebSocket {
    constructor(url, options) {
      assert.equal(url, 'wss://stt-rt.soniox.com/transcribe-websocket');
      super('ws://127.0.0.1:' + provider.address().port, options);
    }
  }
  const events = [];
  let resolvePartial, resolveComplete, rejectComplete;
  const partialReady = new Promise(resolve => { resolvePartial = resolve; });
  const complete = new Promise((resolve, reject) => { resolveComplete = resolve; rejectComplete = reject; });
  const transcriber = createRealtimeTranscriber({ apiKey: 'local-test-key', WebSocketImpl: LocalSocket, timeoutMs: 1000 });
  connection = transcriber.connect({ mode: 'voice', onError: rejectComplete, onTranscript: value => {
    events.push(value);
    if (value.text === '대한민') resolvePartial();
    if (value.boundary) resolveComplete(value);
  } });
  await connection.ready;
  assert.equal(connection.write(Buffer.alloc(3200, 1)), true);
  await partialReady; assert.equal(connection.finalize(), true);
  assert.deepEqual(await complete, { text: '대한민국', finalText: '대한민국', hasNonFinal: false, boundary: 'fin', finished: false });
  assert.deepEqual(events.map(value => value.text), ['미국', '대한민', '대한민국']);
  assert.equal(receivedPcm, true); assert.equal(receivedFinalize, true);
});
