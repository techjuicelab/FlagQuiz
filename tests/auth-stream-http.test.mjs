/* 실제 로그인 저장소·HTTP·WebSocket을 잇되 유료 공급자는 격리한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import WebSocket from 'ws';
import { createAuthServer, readConfig } from '../server/auth-server.mjs';

async function fixture(t, { configured = true, quotaDelayMs = 0 } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'flagquiz-stream-auth-'));
  await fs.mkdir(path.join(directory, 'site'));
  let disabled = false;
  const calls = [], frames = new EventEmitter(), secret = 'fixture-local-signing-secret-'.repeat(3);
  const realtimeTranscriber = { ready: true, connect(options) {
    const call = { options, frames: [], closed: 0, finalized: 0 }; calls.push(call);
    return { ready: Promise.resolve(), write(frame) { call.frames.push(frame); frames.emit('received', call); return true; },
      finalize() { call.finalized++; }, close() { call.closed++; } };
  } };
  const config = readConfig({ AUTH_PROVIDER: 'techjuice-id', PUBLIC_ORIGIN: 'http://127.0.0.1',
    TJID_SUPABASE_URL: 'https://fixture.supabase.co', TJID_SUPABASE_ANON_KEY: 'fixture-public-anon-key',
    SESSION_SECRET: secret, STATE_DIR: path.join(directory, 'state'), STATIC_ROOT: path.join(directory, 'site'),
    SONIOX_API_KEY: configured ? 'fixture-soniox-never-real' : '' });
  const app = await createAuthServer({ config, realtimeTranscriber,
    techjuiceId: { ready: true, sessionState: async () => ({ gen: 1, disabled }) } });
  if (quotaDelayMs) {
    const consume = app.store.consumeSpeechQuota.bind(app.store);
    app.store.consumeSpeechQuota = async session => {
      await new Promise(resolve => setTimeout(resolve, quotaDelayMs));
      return consume(session);
    };
  }
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  config.publicOrigin = 'http://127.0.0.1:' + app.server.address().port;
  const session = await app.store.createSession({ sub: '12345678-1234-4123-8123-123456789abc',
    email: 'fixture@example.invalid', emailVerified: true, techjuiceRole: 'user', generation: 1 }, 3600000, { trustedCentralIdentity: true });
  const payload = Buffer.from(JSON.stringify({ id: session.id, exp: session.expiresAt })).toString('base64url');
  const cookie = 'flagquiz_session=' + payload + '.' + createHmac('sha256', secret).update('session.' + payload).digest('base64url');
  const request = (route, options = {}) => fetch(config.publicOrigin + route, { ...options, headers: { Cookie: cookie, ...options.headers } });
  const auth = await (await request('/api/auth/session')).json();
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  async function connect(mode = 'voice', headers = {}) {
    const socket = new WebSocket(config.publicOrigin.replace(/^http/, 'ws') + '/api/speech/stream',
      { headers: { Cookie: cookie, Origin: config.publicOrigin, ...headers } });
    const messages = [], pending = [];
    socket.on('message', data => { const value = JSON.parse(data.toString()); messages.push(value);
      for (const waiter of pending.splice(0)) waiter(); });
    await once(socket, 'open');
    t.after(() => socket.terminate());
    function wait(type) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Missing ' + type)), 2000);
        function check() { const found = messages.find(value => value.type === type);
          if (found) { clearTimeout(timer); resolve(found); } else pending.push(check); }
        check();
      });
    }
    socket.send(JSON.stringify({ type: 'start', csrfToken: auth.csrfToken, mode, playerId: 'one', turnId: 'turn-1' }));
    await wait('ready');
    return { socket, messages, wait, mode };
  }
  return { app, config, calls, frames, request, auth, cookie, session, connect, disable() { disabled = true; } };
}
const voice = () => { const pcm = Buffer.alloc(3200); for (let i = 0; i < 1600; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 8) * 3000), i * 2); return pcm; };
const tick = () => new Promise(resolve => setTimeout(resolve, 25));
async function spoken(f, connection) {
  const previous = f.calls.length;
  // 인증과 사용량 fsync가 끝난 뒤 실제 첫 PCM 전달까지 기다린다. NAS 부하를 고정 1초 폴링으로 판정하지 않는다.
  const received = once(f.frames, 'received', { signal: AbortSignal.timeout(10000) });
  connection.socket.send(voice());
  const [call] = await received;
  assert.equal(f.calls.length, previous + 1);
  assert.equal(call, f.calls[previous]);
  assert.deepEqual(call.frames[0], voice());
  return call;
}

test('사용량 저장이 1초 넘게 걸려도 첫 PCM 전달을 확인한 뒤 스트리밍 결과를 검사한다', async t => {
  const f = await fixture(t, { quotaDelayMs: 1250 }), connection = await f.connect(), call = await spoken(f, connection);
  call.options.onTranscript({ text: '프랑스', finalText: '프랑스', hasNonFinal: false, boundary: null, finished: false });
  const result = await connection.wait('result');
  assert.equal(result.resolution.code, 'fr');
  assert.equal(result.quota.dailyUsed, 1);
  assert.equal(call.closed, 1);
});

test('인증 세션은 서버 스트리밍 준비 여부만 공개하고 공급자 키를 보내지 않는다', async t => {
  for (const configured of [false, true]) {
    const f = await fixture(t, { configured });
    assert.equal(f.auth.speechStreaming, configured);
    assert.doesNotMatch(JSON.stringify(f.auth), /fixture-soniox|SONIOX_API_KEY/);
    assert.match((await f.request('/login')).headers.get('content-security-policy'), new RegExp(f.config.publicOrigin.replace('http:', 'ws:')));
  }
});

test('세 모드 모두 부분 문자열은 표시만 하고 확정 이름에서 finish 없이 즉시 결과를 보낸다', async t => {
  for (const mode of ['voice', 'capitalVoice', 'country-chain']) {
    const f = await fixture(t), connection = await f.connect(mode), call = await spoken(f, connection);
    const name = mode === 'capitalVoice' ? '서울' : '프랑스';
    call.options.onTranscript({ text: name, finalText: '', hasNonFinal: true, boundary: null, finished: false });
    await connection.wait('partial'); assert.equal(connection.messages.some(value => value.type === 'result'), false);
    call.options.onTranscript({ text: name, finalText: name, hasNonFinal: false, boundary: null, finished: false });
    const result = await connection.wait('result');
    assert.equal(result.resolution.code, mode === 'capitalVoice' ? 'kr' : 'fr');
    assert.equal(result.resolution.source, 'rules'); assert.equal(result.playerId, 'one');
    assert.equal(call.finalized, 0); assert.ok(call.closed > 0);
    assert.ok(connection.messages.findIndex(value => value.type === 'finishing') < connection.messages.findIndex(value => value.type === 'result'));
    assert.equal(result.quota.dailyUsed, 1);
  }
});

test('말하기 퀴즈의 미해석 이름은 최종 경계에서 원문과 retry 결정을 브라우저 채점으로 보낸다', async t => {
  for (const [mode, text, boundary] of [['voice', '격도누기', 'end'], ['capitalVoice', '서루', 'fin']]) {
    const f = await fixture(t), connection = await f.connect(mode), call = await spoken(f, connection);
    call.options.onTranscript({ text, finalText: text, hasNonFinal: false, boundary: null, finished: false });
    await connection.wait('partial'); await tick();
    assert.equal(connection.messages.some(packet => packet.type === 'result'), false);
    call.options.onTranscript({ text, finalText: text, hasNonFinal: false, boundary, finished: false });
    const result = await connection.wait('result');
    assert.equal(result.text, text); assert.equal(result.mode, mode);
    assert.equal(result.resolution.status, 'retry'); assert.equal(result.resolution.reason, 'unknown');
    assert.equal(result.resolution.source, 'rules'); assert.equal(result.resolution.code, null);
    assert.equal(result.playerId, 'one'); assert.equal(result.turnId, 'turn-1');
    assert.equal(result.quota.dailyUsed, 1); assert.equal(call.closed, 1);
    call.options.onTranscript({ text: '대한민국', finalText: '대한민국', hasNonFinal: false, boundary: 'end', finished: false });
    await tick();
    assert.equal(connection.messages.filter(packet => packet.type === 'result').length, 1);
    assert.equal(connection.messages.some(packet => packet.type === 'listening'), false);
  }
});

test('미해석 원문 전달도 이어 말하기·질문·부정·후보 모호성·나라 수도 경계를 보호한다', async t => {
  for (const [mode, text] of [
    ['country-chain', '격도누기'], ['voice', '격도누기인가요?'], ['voice', '격도누기 아니야'],
    ['voice', '격도누기 또는 기니'], ['voice', '기니 격도누기'], ['voice', '"격도누기"라고 했어'],
    ['voice', '음.'], ['voice', '서울'], ['capitalVoice', '대한민국']
  ]) {
    const f = await fixture(t), connection = await f.connect(mode), call = await spoken(f, connection);
    call.options.onTranscript({ text, finalText: text, hasNonFinal: false, boundary: 'end', finished: false });
    const listening = await connection.wait('listening');
    assert.equal(listening.resetAudio, false, mode + ': ' + text);
    assert.equal(connection.messages.some(packet => packet.type === 'result'), false, mode + ': ' + text);
    assert.equal(call.closed, 0, text);
    connection.socket.send(JSON.stringify({ type: 'cancel' }));
    await once(connection.socket, 'close');
  }
});

test('미해석 원문 전달은 실제 다른 이름·명시 정정·포기의 최종 결정을 바꾸지 않는다', async t => {
  for (const [mode, text, status, code] of [
    ['voice', '기니', 'answer', 'gn'], ['voice', '기니 아니고 적도기니', 'answer', 'gq'],
    ['voice', '몰라요', 'giveup', null], ['capitalVoice', '도쿄', 'answer', 'jp']
  ]) {
    const f = await fixture(t), connection = await f.connect(mode), call = await spoken(f, connection);
    call.options.onTranscript({ text, finalText: text, hasNonFinal: false, boundary: 'end', finished: false });
    const result = await connection.wait('result');
    assert.equal(result.text, text); assert.equal(result.resolution.status, status, text);
    assert.equal(result.resolution.code, code, text); assert.equal(result.quota.dailyUsed, 1);
    assert.equal(connection.messages.filter(packet => packet.type === 'result').length, 1);
  }
});

test('미해석 원문 결과 뒤 다음 차례를 재연결하며 이전 결과나 사용량을 중복 적용하지 않는다', async t => {
  const f = await fixture(t), first = await f.connect(), old = await spoken(f, first);
  old.options.onTranscript({ text: '격도누기', finalText: '격도누기', hasNonFinal: false, boundary: 'end', finished: false });
  assert.equal((await first.wait('result')).quota.dailyUsed, 1);
  if (first.socket.readyState !== WebSocket.CLOSED) await once(first.socket, 'close');
  assert.equal(f.calls.length, 1); assert.equal(old.closed, 1);
  const next = await f.connect(), current = await spoken(f, next);
  old.options.onTranscript({ text: '미국', finalText: '미국', hasNonFinal: false, boundary: 'end', finished: false });
  current.options.onTranscript({ text: '대한민국', finalText: '대한민국', hasNonFinal: false, boundary: null, finished: false });
  const result = await next.wait('result');
  assert.equal(result.resolution.code, 'kr'); assert.equal(result.quota.dailyUsed, 2);
  assert.equal(next.messages.filter(packet => packet.type === 'result').length, 1);
  assert.equal(first.messages.filter(packet => packet.type === 'result').length, 1);
  assert.equal(f.calls.length, 2); assert.equal(current.closed, 1);
});

test('인도 확정 토큰 뒤 인도네시아가 완성될 때까지 나라를 잘못 확정하지 않는다', async t => {
  const f = await fixture(t), connection = await f.connect(), call = await spoken(f, connection);
  call.options.onTranscript({ text: '인도', finalText: '인도', hasNonFinal: false, boundary: null, finished: false });
  await connection.wait('partial'); assert.equal(connection.messages.some(value => value.type === 'result'), false);
  call.options.onTranscript({ text: '인도네시아', finalText: '인도네시아', hasNonFinal: false, boundary: null, finished: false });
  assert.equal((await connection.wait('result')).resolution.code, 'id');
});

test('무음과 짧은 클릭에는 공급자 연결·사용량 예약이 없고 취소 후 슬롯을 반환한다', async t => {
  const f = await fixture(t), connection = await f.connect();
  connection.socket.send(Buffer.alloc(3200)); connection.socket.send(voice().subarray(0, 1280)); await tick();
  assert.equal(f.calls.length, 0);
  connection.socket.close(); await once(connection.socket, 'close');
  const next = await f.connect(); const call = await spoken(f, next);
  call.options.onTranscript({ text: '대한민국', finalText: '대한민국', hasNonFinal: false, boundary: null, finished: false });
  assert.equal((await next.wait('result')).quota.dailyUsed, 1);
});

test('중앙 권한이 회수된 차례의 늦은 확정 결과는 채점하지 않는다', async t => {
  const f = await fixture(t), connection = await f.connect(), call = await spoken(f, connection);
  f.disable();
  call.options.onTranscript({ text: '대한민국', finalText: '대한민국', hasNonFinal: false, boundary: null, finished: false });
  const error = await connection.wait('error'); assert.equal(error.code, 'auth-required');
  assert.equal(connection.messages.some(value => value.type === 'result'), false);
});

test('WebSocket과 기존 파일 전사는 같은 사용자의 동시 슬롯을 공유한다', async t => {
  const f = await fixture(t), connection = await f.connect();
  const response = await f.request('/api/speech', { method: 'POST', headers: {
    Origin: f.config.publicOrigin, 'X-CSRF-Token': f.auth.csrfToken, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 429); assert.deepEqual(await response.json(), { error: 'speech-busy' });
  assert.equal(f.calls.length, 0);
  connection.socket.close(); await once(connection.socket, 'close');
  const next = await f.connect(); assert.equal(next.socket.readyState, WebSocket.OPEN);
});

test('로그인·Origin·CSRF가 없는 스트림은 공급자 연결 전에 거절한다', async t => {
  const f = await fixture(t), endpoint = f.config.publicOrigin.replace(/^http/, 'ws') + '/api/speech/stream';
  for (const [headers, expected] of [[{ Origin: f.config.publicOrigin }, 401],
    [{ Origin: 'https://external.invalid', Cookie: f.cookie }, 403]]) {
    const status = await new Promise((resolve, reject) => {
      const socket = new WebSocket(endpoint, { headers }); socket.on('error', () => {});
      socket.on('unexpected-response', (_request, response) => { resolve(response.statusCode); socket.terminate(); });
      socket.on('open', () => { socket.terminate(); reject(new Error('Unexpected upgrade')); });
    });
    assert.equal(status, expected);
  }
  const socket = new WebSocket(endpoint, { headers: { Origin: f.config.publicOrigin, Cookie: f.cookie } });
  socket.on('error', () => {}); await once(socket, 'open');
  const message = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'start', csrfToken: 'invalid', mode: 'voice', playerId: 'one', turnId: 'one' }));
  assert.equal(JSON.parse((await message)[0]).code, 'auth-required'); socket.terminate();
  assert.equal(f.calls.length, 0);
});

test('발화 직전에 로그아웃한 세션은 사용량과 공급자 연결을 예약하지 않는다', async t => {
  const f = await fixture(t), connection = await f.connect();
  await f.app.store.revokeSession(f.session.id); connection.socket.send(voice());
  assert.equal((await connection.wait('error')).code, 'auth-required'); assert.equal(f.calls.length, 0);
  const state = JSON.parse(await fs.readFile(path.join(f.config.stateDirectory, 'access.json'), 'utf8'));
  assert.equal(Object.values(state.quota.monthly).reduce((sum, count) => sum + count, 0), 0);
});
