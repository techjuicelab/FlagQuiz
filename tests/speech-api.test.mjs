import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createTranscriber, readSpeechInput, validateSpeechInput, SpeechError, MAX_AUDIO_BYTES } from '../server/speech.mjs';

function wav(durationMs = 1000) {
  const samples = Math.round(durationMs * 16);
  const audio = Buffer.alloc(44 + samples * 2);
  audio.write('RIFF', 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28);
  audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(samples * 2, 40);
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
  assert.equal(result.audio.length, 32044);
  const boundary = await request(wav(12000), { 'x-audio-duration-ms': '12000' });
  assert.equal(boundary.durationMs, 12000);
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

test('OpenAI 요청은 서버 고정 모델·한국어·나라 사전을 쓰고 WAV를 한 번만 전송한다', async () => {
  const calls = [];
  const transcribe = createTranscriber({ apiKey: 'test-secret', fetchImpl: async (url, options) => {
    calls.push({ url, options }); return { ok: true, json: async () => ({ text: '  대한민국  ', extra: 'private' }) };
  } });
  assert.equal(transcribe.ready, true);
  assert.equal(transcribe.model, 'gpt-4o-mini-transcribe');
  assert.deepEqual(await transcribe(input()), { text: '대한민국' });
  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(options.headers.Authorization, 'Bearer test-secret');
  assert.equal(options.body.get('model'), 'gpt-4o-mini-transcribe');
  assert.equal(options.body.get('language'), 'ko');
  assert.equal(options.body.get('response_format'), 'json');
  assert.match(options.body.get('prompt'), /대한민국/);
  assert.match(options.body.get('prompt'), /짐바브웨/);
  const file = options.body.get('file');
  assert.equal(file.type, 'audio/wav');
  assert.equal(file.name, 'country.wav');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), input().audio);
});

test('키 없음·무효 음성·미리 취소한 요청은 유료 호출을 만들지 않는다', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, json: async () => ({ text: '일본' }) }; };
  const missing = createTranscriber({ apiKey: '', fetchImpl });
  assert.equal(missing.ready, false);
  await assert.rejects(missing(input()), code('speech_unavailable'));
  const ready = createTranscriber({ apiKey: 'test-secret', fetchImpl });
  await assert.rejects(ready(input(12001)), code('audio_too_long'));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(ready(input(), { signal: controller.signal }), code('cancelled'));
  assert.equal(calls, 0);
});

test('미해결 1Password 참조는 공백 유무와 관계없이 준비되지 않은 키로 처리하고 외부 호출하지 않는다', async () => {
  let calls = 0;
  for (const apiKey of ['op://Private/OpenAI/api-key', '  op://Private/OpenAI/api-key  ', '"op://Private/OpenAI/api-key"', "'op://Private/OpenAI/api-key'", '  ']) {
    const transcribe = createTranscriber({ apiKey, fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ text: '일본' }) }; } });
    assert.equal(transcribe.ready, false);
    await assert.rejects(transcribe(input()), code('speech_unavailable'));
  }
  assert.equal(calls, 0);
});

test('상위 서비스 오류·깨진 응답·네트워크 오류는 비밀이나 원문을 노출하지 않고 자동 재시도하지 않는다', async () => {
  for (const response of [
    async () => ({ ok: false, status: 401, json: async () => ({ error: 'test-secret provider detail' }) }),
    async () => { throw new Error('test-secret raw upstream request'); },
    async () => ({ ok: true, json: async () => { throw new Error('test-secret malformed json'); } }),
    async () => ({ ok: true, json: async () => ({ text: 'x'.repeat(501) }) })
  ]) {
    let calls = 0;
    const transcribe = createTranscriber({ apiKey: 'test-secret', fetchImpl: (...args) => { calls++; return response(...args); } });
    await assert.rejects(transcribe(input()), error => {
      assert.ok(error instanceof SpeechError);
      assert.equal(error.code, 'speech_failed');
      assert.doesNotMatch(error.message, /test-secret|raw upstream|provider|malformed/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('유료 요청 시간 제한과 클라이언트 취소가 상위 fetch를 abort한다', async () => {
  function stalled() {
    let calls = 0, aborted = false;
    return { get calls() { return calls; }, get aborted() { return aborted; }, fetchImpl: async (url, options) => {
      calls++;
      return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => {
        aborted = true; reject(new Error('test-secret abort detail'));
      }, { once: true }));
    } };
  }
  const timeout = stalled();
  await assert.rejects(createTranscriber({ apiKey: 'test-secret', timeoutMs: 5, fetchImpl: timeout.fetchImpl })(input()), code('speech_timeout'));
  assert.equal(timeout.calls, 1); assert.equal(timeout.aborted, true);
  const cancelled = stalled(), controller = new AbortController();
  const pending = createTranscriber({ apiKey: 'test-secret', fetchImpl: cancelled.fetchImpl })(input(), { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, code('cancelled'));
  assert.equal(cancelled.calls, 1); assert.equal(cancelled.aborted, true);
});
