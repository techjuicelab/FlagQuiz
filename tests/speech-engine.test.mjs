import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function fixture({ enabled, stream = true, cloud = true, missingStream = false, createFails = false } = {}) {
  const calls = [], account = { speechStreaming: enabled };
  function provider(kind, available) {
    return { supported: () => available, create(options) {
      calls.push({ kind, options });
      if (kind === 'stream' && createFails) throw new Error('stream unavailable');
      return { kind, start() { return Promise.reject(new Error('paid session failed')); } };
    } };
  }
  const window = { FQ: { auth: { session: () => account }, cloudSpeech: provider('cloud', cloud) } };
  if (!missingStream) window.FQ.streamingSpeech = provider('stream', stream);
  for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
    Object.defineProperty(window, name, { get() { throw new Error('browser STT must not be used'); } });
  }
  vm.runInNewContext(fs.readFileSync(new URL('../js/speech-engine.js', import.meta.url), 'utf8'), { window });
  return { engine: window.FQ.speechEngine, calls, account };
}

test('서버가 명시적으로 허용하고 기기가 지원할 때만 스트리밍 엔진을 만든다', () => {
  for (const enabled of [undefined, false, 'true', 1, true]) {
    const f = fixture({ enabled }), options = { csrfToken: () => 'csrf' };
    assert.equal(f.engine.supported(), true);
    const adapter = f.engine.create(options);
    assert.equal(adapter.kind, enabled === true ? 'stream' : 'cloud');
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options, options);
  }
});

test('스트리밍 미지원은 유료 세션을 시작하기 전에 기존 파일 전사를 고른다', () => {
  for (const options of [{ stream: false }, { missingStream: true }]) {
    const f = fixture({ enabled: true, ...options });
    assert.equal(f.engine.supported(), true); assert.equal(f.engine.create({}).kind, 'cloud');
    assert.deepEqual(f.calls.map(call => call.kind), ['cloud']);
  }
  assert.equal(fixture({ enabled: true, stream: false, cloud: false }).engine.supported(), false);
  assert.equal(fixture({ enabled: true, cloud: false }).engine.supported(), true);
});

test('스트리밍 생성이나 유료 시작 실패를 다른 엔진의 자동 요청으로 바꾸지 않는다', async () => {
  const creation = fixture({ enabled: true, createFails: true });
  assert.throws(() => creation.engine.create({}), /stream unavailable/);
  assert.deepEqual(creation.calls.map(call => call.kind), ['stream']);
  const start = fixture({ enabled: true });
  await assert.rejects(start.engine.create({}).start({}), /paid session failed/);
  assert.deepEqual(start.calls.map(call => call.kind), ['stream']);
});

test('엔진을 만들 때 최신 서버 기능 허용 값을 확인한다', () => {
  const f = fixture({ enabled: false });
  assert.equal(f.engine.create({}).kind, 'cloud');
  f.account.speechStreaming = true;
  assert.equal(f.engine.create({}).kind, 'stream');
});
