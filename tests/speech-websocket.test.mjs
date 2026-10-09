import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { attachSpeechWebSocket } from '../server/speech-websocket.mjs';

const realTimeout = setTimeout;
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const error = (code, status) => Object.assign(new Error('provider-private-secret internal detail'), { code, status });
function pcm(ms = 100, sample = 512) { const audio = Buffer.alloc(ms * 32); for (let offset = 0; offset < audio.length; offset += 2) audio.writeInt16LE(sample, offset); return audio; }
function value(text, { finalText = text, hasNonFinal = false, boundary = null, finished = false } = {}) { return { text, finalText, hasNonFinal, boundary, finished }; }
const answer = (code = 'kr', text = '대한민국') => ({ status: 'answer', code, text, source: 'rules' });
async function until(predicate) {
  const deadline = Date.now() + 1500;
  while (!predicate()) { assert.ok(Date.now() < deadline, '예상한 비동기 상태에 도달하지 못했다'); await new Promise(resolve => realTimeout(resolve, 2)); }
}
async function drain(ws) { const pong = once(ws, 'pong'); ws.ping('barrier'); await pong; await new Promise(setImmediate); }

async function fixture(t, options = {}) {
  const f = { session: { id: 'session-a', sub: 'user-a' }, configured: true, claims: 0, releases: 0, active: 0, quotas: 0,
    authCalls: [], providers: [], instantCalls: [], finalCalls: [], clients: [], providerReady: null, finalGate: null };
  f.hooks = {
    origin: () => f.origin,
    isConfigured: () => f.configured,
    async getSession(req, fresh) {
      f.authCalls.push(fresh);
      if (req.headers.cookie !== 'session=valid' || !f.session) throw error('login-required', 401);
      return f.session;
    },
    validateCsrf(req, session, token) { if (token !== 'session-csrf') throw error('request-not-allowed', 403); },
    claimSpeech() { f.claims++; f.active++; return () => { f.releases++; f.active--; }; },
    async consumeQuota() { f.quotas++; return { dailyUsed: f.quotas, dailyLimit: 120, monthlyUsed: 123, monthlyLimit: 3000, secret: 'private quota metadata' }; },
    createTranscriber: () => ({ ready: true, connect(handlers) {
      const provider = { handlers, ready: f.providerReady?.promise || Promise.resolve(), writes: [], finalizes: 0, closes: 0,
        write(data) { this.writes.push(Buffer.from(data)); return true; },
        finalize() { this.finalizes++; return true; },
        close() { this.closes++; },
        emit(result) { handlers.onTranscript(result); }, fail(err) { handlers.onError(err); } };
      f.providers.push(provider); return provider;
    } }),
    resolveInstant(input) { f.instantCalls.push(input); return input.text === '대한민국' ? answer() : input.text === '파리' ? answer('fr', '파리') : null; },
    async resolveFinal(input, signal, session, req) {
      f.finalCalls.push({ input, signal, session, req });
      return f.finalGate ? f.finalGate.promise : answer('fr', input.text);
    }, ...options
  };
  const server = http.createServer((req, res) => res.writeHead(404).end());
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  f.origin = 'http://127.0.0.1:' + server.address().port;
  const attached = attachSpeechWebSocket(server, Object.fromEntries(Object.entries(f.hooks).map(([name]) =>
    [name, (...args) => f.hooks[name](...args)])));
  f.close = () => attached.close();
  t.after(async () => {
    for (const ws of f.clients) ws.terminate();
    await attached.close(); await new Promise(resolve => server.close(resolve));
  });
  f.open = async ({ path = '/api/speech/stream', headers = {}, start = true, startValue = {} } = {}) => {
    const ws = new WebSocket(f.origin.replace('http:', 'ws:') + path, { perMessageDeflate: false,
      headers: { Origin: f.origin, Cookie: 'session=valid', 'Sec-Fetch-Site': 'same-origin', ...headers } });
    f.clients.push(ws); ws.on('error', () => {});
    const packets = [];
    ws.on('message', data => packets.push(JSON.parse(data.toString())));
    const c = { ws, packets, send: payload => ws.send(JSON.stringify(payload)),
      async wait(type, predicate = () => true) { await until(() => packets.some(packet => packet.type === type && predicate(packet))); return packets.find(packet => packet.type === type && predicate(packet)); },
      async closed() { if (ws.readyState !== 3) await once(ws, 'close'); } };
    await once(ws, 'open');
    if (start) {
      c.send({ type: 'start', csrfToken: 'session-csrf', mode: 'voice', playerId: '0', turnId: '4', ...startValue });
      await c.wait('ready');
    }
    return c;
  };
  f.reject = async ({ path = '/api/speech/stream', headers = {} } = {}) => {
    const ws = new WebSocket(f.origin.replace('http:', 'ws:') + path, {
      headers: { Origin: f.origin, Cookie: 'session=valid', 'Sec-Fetch-Site': 'same-origin', ...headers } });
    f.clients.push(ws); ws.on('error', () => {});
    return new Promise(resolve => ws.on('unexpected-response', (req, res) => { res.resume(); ws.terminate(); resolve(res.statusCode); }));
  };
  f.voice = async c => { const before = f.providers.length; c.ws.send(pcm()); await until(() => f.providers.length > before && f.providers.at(-1).writes.length > 0); return f.providers.at(-1); };
  return f;
}

test('인증된 start만 ready와 공유 슬롯을 얻고 아직 유료 호출하지 않는다', async t => {
  const f = await fixture(t), c = await f.open();
  assert.deepEqual(c.packets, [{ type: 'ready', mode: 'voice', playerId: '0', turnId: '4' }]);
  assert.equal(f.claims, 1); assert.equal(f.quotas, 0); assert.equal(f.providers.length, 0); assert.deepEqual(f.authCalls, [true]);
  c.send({ type: 'cancel' }); await c.closed(); assert.equal(f.releases, 1); assert.equal(f.active, 0);
});

test('음.. 뒤 같은 소켓에서 유효한 나라를 기다리며 채점과 quota는 한 번만 한다', async t => {
  const f = await fixture(t, { resolveFinal: async () => ({ status: 'retry', reason: 'unknown' }) });
  const c = await f.open({ startValue: { mode: 'country-chain' } }), provider = await f.voice(c);
  provider.emit(value('음.', { boundary: 'end' }));
  await c.wait('listening');
  assert.equal(provider.closes, 0); assert.equal(f.quotas, 1);
  assert.equal(c.packets.some(packet => ['result', 'finishing', 'error'].includes(packet.type)), false);
  c.ws.send(pcm()); await drain(c.ws); assert.equal(provider.writes.length, 2);
  provider.emit(value('대한민국')); const result = await c.wait('result'); await c.closed();
  assert.equal(result.resolution.code, 'kr'); assert.equal(provider.closes, 1);
  assert.equal(f.quotas, 1); assert.equal(c.packets.filter(packet => packet.type === 'result').length, 1);
});

test('불인식된 12초 창은 자동으로 무료 대기로 돌아가고 다음 발화만 새로 예약한다', async t => {
  const f = await fixture(t, { resolveFinal: async () => ({ status: 'retry', reason: 'unknown' }) });
  const c = await f.open(), old = await f.voice(c);
  c.send({ type: 'finish' }); await until(() => old.finalizes === 1);
  old.emit(value('음.', { boundary: 'fin' }));
  const listening = await c.wait('listening');
  assert.equal(listening.resetAudio, true); assert.equal(listening.window, 2);
  assert.equal(old.closes, 1); assert.equal(f.quotas, 1); assert.equal(f.providers.length, 1);
  old.emit(value('대한민국')); old.fail(error('speech_failed')); await drain(c.ws);
  assert.equal(c.packets.some(packet => ['error', 'result'].includes(packet.type)), false);
  const next = await f.voice(c); assert.equal(f.quotas, 2);
  next.emit(value('대한민국')); await c.wait('result'); await c.closed();
  assert.equal(f.releases, 1); assert.equal(next.closes, 1);
});

test('빈 endpoint는 계속 듣고 빈 finalize는 새 창에서 계속 듣는다', async t => {
  const f = await fixture(t), c = await f.open(), provider = await f.voice(c);
  provider.emit(value('', { boundary: 'end' }));
  const same = await c.wait('listening', packet => !packet.resetAudio);
  assert.equal(same.reason, 'no-speech'); assert.equal(provider.closes, 0);
  c.send({ type: 'finish' }); await until(() => provider.finalizes === 1);
  provider.emit(value('', { boundary: 'fin' }));
  await c.wait('listening', packet => packet.resetAudio);
  assert.equal(f.quotas, 1); assert.equal(f.finalCalls.length, 0);
  c.send({ type: 'cancel' }); await c.closed();
  provider.emit(value('대한민국')); assert.equal(c.packets.some(packet => packet.type === 'result'), false);
});

test('미해석 음성 원문 전달 guard의 실패나 비동기 반환은 결과를 보내지 않고 연결을 닫는다', async t => {
  for (const guard of [() => { throw new Error('private guard failure'); }, async () => true, () => undefined]) {
    const f = await fixture(t, { resolveFinal: async () => ({ status: 'retry', reason: 'unknown', source: 'rules' }), canGradeUnknown: guard });
    const c = await f.open(), provider = await f.voice(c);
    provider.emit(value('격도누기', { boundary: 'end' }));
    assert.equal((await c.wait('error')).code, 'service'); await c.closed();
    assert.equal(c.packets.some(packet => packet.type === 'result'), false);
    assert.equal(provider.closes, 1); assert.equal(f.releases, 1); assert.equal(f.quotas, 1);
    assert.doesNotMatch(JSON.stringify(c.packets), /private guard failure/);
  }
});

test('망설임 해석 대기 중 다음 확정 이름이 오면 늦은 retry로 덮어쓰지 않는다', async t => {
  const f = await fixture(t), gate = deferred(); f.finalGate = gate;
  const c = await f.open(), provider = await f.voice(c);
  provider.emit(value('음.', { boundary: 'end' })); await until(() => f.finalCalls.length === 1);
  provider.emit(value('대한민국')); await c.wait('result'); await c.closed();
  gate.resolve({ status: 'retry' }); await new Promise(setImmediate);
  assert.equal(c.packets.filter(packet => packet.type === 'result').length, 1);
  assert.equal(c.packets.some(packet => packet.type === 'listening'), false); assert.equal(f.quotas, 1);
});

test('이전 망설임 해석의 늦은 실패는 새 확정 이름의 인증 대기를 취소하지 않는다', async t => {
  const f = await fixture(t), old = deferred(), auth = deferred(); f.finalGate = old;
  const c = await f.open(), provider = await f.voice(c);
  provider.emit(value('음.', { boundary: 'end' })); await until(() => f.finalCalls.length === 1);
  f.hooks.getSession = async () => auth.promise;
  provider.emit(value('대한민국')); await c.wait('finishing');
  old.reject(error('speech_failed')); await new Promise(resolve => realTimeout(resolve, 20));
  assert.equal(c.packets.some(packet => packet.type === 'error'), false);
  auth.resolve(f.session); await c.wait('result'); await c.closed();
  assert.equal(c.packets.filter(packet => packet.type === 'result').length, 1);
});

test('프레임 중간에 확인한 100ms 발화는 뒤의 90ms 쉼으로 유실하지 않는다', async t => {
  const f = await fixture(t), c = await f.open();
  c.ws.send(Buffer.concat([pcm(90), pcm(10, 0)]));
  c.ws.send(Buffer.concat([pcm(10), pcm(90, 0)]));
  await until(() => f.providers.length === 1);
  assert.equal(f.quotas, 1); c.send({ type: 'cancel' }); await c.closed();
});

test('나라·수도·이어 말하기는 고정 무음 대기 없이 불변 이름에서 즉시 완성한다', async t => {
  const f = await fixture(t);
  for (const mode of ['voice', 'capitalVoice', 'country-chain']) {
    const c = await f.open({ startValue: { mode, turnId: mode } }), provider = await f.voice(c);
    provider.emit(value(mode === 'capitalVoice' ? '파리' : '대한민국'));
    const result = await c.wait('result'); await c.closed();
    assert.equal(result.mode, mode); assert.equal(result.turnId, mode); assert.equal(result.playerId, '0');
    assert.equal(result.resolution.code, mode === 'capitalVoice' ? 'fr' : 'kr');
    assert.deepEqual(Object.keys(result.quota).sort(), ['dailyLimit', 'dailyUsed']);
    assert.equal(provider.closes, 1); assert.equal(provider.finalizes, 0);
    assert.deepEqual(c.packets.map(packet => packet.type), ['ready', 'partial', 'finishing', 'result']);
  }
  assert.equal(f.quotas, 3); assert.equal(f.claims, 3); assert.equal(f.releases, 3); assert.equal(f.finalCalls.length, 0);
});

test('변할 수 있는 부분 전사는 표시만 하며 빈 heartbeat는 전송하지 않는다', async t => {
  const f = await fixture(t), c = await f.open(), provider = await f.voice(c);
  provider.emit(value('', { finalText: '', hasNonFinal: false }));
  provider.emit(value('미국', { finalText: '', hasNonFinal: true }));
  provider.emit(value('영국', { finalText: '', hasNonFinal: true }));
  await c.wait('partial', packet => packet.text === '영국');
  assert.deepEqual(c.packets.filter(packet => packet.type === 'partial').map(packet => packet.text), ['미국', '영국']);
  assert.equal(f.instantCalls.length, 0); assert.equal(f.finalCalls.length, 0); assert.equal(provider.closes, 0);
  provider.emit(value('대한민국')); await c.wait('result');
  assert.equal(f.instantCalls.length, 1); assert.equal(f.releases, 1);
});

test('접두 이름은 더 긴 이름의 endpoint를 보존하고 최종 해석은 한 번만 수행한다', async t => {
  const f = await fixture(t), c = await f.open(), provider = await f.voice(c);
  provider.emit(value('인도')); await c.wait('partial');
  assert.equal(c.packets.some(packet => packet.type === 'finishing'), false);
  provider.emit(value('인도네시아', { boundary: 'end' }));
  provider.emit(value('영국', { boundary: 'fin' }));
  await c.wait('result'); await c.closed();
  assert.equal(f.finalCalls.length, 1); assert.deepEqual(f.finalCalls[0].input, { text: '인도네시아', mode: 'voice' });
  assert.equal(c.packets.filter(packet => packet.type === 'result').length, 1); assert.equal(provider.closes, 1);
});

test('finalize/finished 경계는 모두 최종 해석으로 이어진다', async t => {
  const f = await fixture(t);
  for (const finish of [{ boundary: 'fin' }, { finished: true }]) {
    const c = await f.open(), provider = await f.voice(c); provider.emit(value('프랑스', finish));
    await c.wait('result'); await c.closed();
  }
  assert.equal(f.finalCalls.length, 2); assert.equal(f.releases, 2);
});

test('무음과 멀리 떨어진 40ms click은 합쳐서 사용량을 예약하지 않는다', async t => {
  const f = await fixture(t), c = await f.open();
  for (let index = 0; index < 3; index++) { c.ws.send(pcm(40)); c.ws.send(pcm(100, 0)); }
  c.ws.send(pcm(100, 1)); await drain(c.ws);
  assert.equal(f.quotas, 0); assert.equal(f.providers.length, 0);
  c.send({ type: 'finish' }); const listening = await c.wait('listening');
  assert.equal(listening.reason, 'no-speech'); assert.equal(listening.resetAudio, true);
  assert.equal(f.releases, 0); assert.equal(f.quotas, 0);
  c.send({ type: 'cancel' }); await c.closed(); assert.equal(f.releases, 1);
});

test('발화 bin은 frame 경계를 보존하며 80ms 단어 안 쉼을 허용한다', async t => {
  const f = await fixture(t), c = await f.open();
  const first = pcm(40); c.ws.send(first.subarray(0, 126)); c.ws.send(first.subarray(126));
  c.ws.send(pcm(80, 0)); c.ws.send(pcm(60)); await until(() => f.providers.length === 1);
  await until(() => f.providers[0].writes.length > 0);
  assert.equal(f.quotas, 1); assert.equal(Buffer.concat(f.providers[0].writes).length, 5760);
});

test('90ms 이상 끊긴 작은 후보는 초기화하고 새로운 연속 발화 100ms를 기다린다', async t => {
  const f = await fixture(t), c = await f.open();
  c.ws.send(pcm(40)); c.ws.send(pcm(90, 0)); c.ws.send(pcm(60)); await drain(c.ws);
  assert.equal(f.quotas, 0); c.ws.send(pcm(40)); await until(() => f.providers.length === 1);
  assert.equal(f.quotas, 1);
});

test('Origin·동일사이트·정확한 경로·쿠키·준비 상태는 upgrade 전에 검사한다', async t => {
  const f = await fixture(t);
  for (const [options, status] of [[{ path: '/api/speech/stream?token=never-accept' }, 403], [{ path: '/other' }, 403],
    [{ headers: { Origin: 'https://other.invalid' } }, 403], [{ headers: { 'Sec-Fetch-Site': 'cross-site' } }, 403],
    [{ headers: { Cookie: '' } }, 401], [{ headers: { Cookie: 'session=invalid' } }, 401]]) {
    assert.equal(await f.reject(options), status);
  }
  f.configured = false; assert.equal(await f.reject(), 503);
  assert.equal(f.claims, 0); assert.equal(f.quotas, 0); assert.equal(f.providers.length, 0);
});

test('시작 JSON의 크기·필드·모드·ASCII IDs·CSRF를 유료 호출 전에 거절한다', async t => {
  const f = await fixture(t);
  for (const startValue of [{ csrfToken: 'wrong' }, { mode: 'unknown' }, { playerId: '../0' }, { turnId: 4 },
    { apiKey: 'private client key' }, { csrfToken: 'x'.repeat(2100) }]) {
    const c = await f.open({ start: false });
    c.send({ type: 'start', csrfToken: 'session-csrf', mode: 'voice', playerId: '0', turnId: '4', ...startValue });
    const packet = await c.wait('error'); await c.closed();
    assert.equal(packet.code, startValue.csrfToken === 'wrong' ? 'auth-required' : 'recording');
    assert.doesNotMatch(JSON.stringify(packet), /private|wrong|session-csrf/);
  }
  assert.equal(f.claims, 0); assert.equal(f.quotas, 0);
});

test('ready 전 PCM·잘못된 PCM·잘못된 control은 녹음 오류로 종료한다', async t => {
  const f = await fixture(t);
  const before = await f.open({ start: false }); before.ws.send(pcm());
  assert.equal((await before.wait('error')).code, 'recording'); await before.closed();
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(3)]) {
    const c = await f.open(); c.ws.send(bytes); assert.equal((await c.wait('error')).code, 'recording'); await c.closed();
  }
  const c = await f.open(); c.send({ type: 'start' }); assert.equal((await c.wait('error')).code, 'recording'); await c.closed();
  assert.equal(f.quotas, 0); assert.equal(f.releases, 3);
});

test('동시 슬롯·rate·일/월 quota 오류는 안전한 코드로 매핑한다', async t => {
  const f = await fixture(t);
  for (const code of ['speech-busy', 'request-limit']) {
    f.hooks.claimSpeech = () => { throw error(code, 429); };
    const c = await f.open({ start: false }); c.send({ type: 'start', csrfToken: 'session-csrf', mode: 'voice', playerId: '0', turnId: '4' });
    assert.equal((await c.wait('error')).code, 'busy'); await c.closed();
  }
  f.hooks.claimSpeech = () => { f.claims++; return () => f.releases++; };
  for (const code of ['daily-speech-limit', 'monthly-speech-limit']) {
    f.hooks.consumeQuota = async () => { throw error(code, 429); };
    const c = await f.open(); c.ws.send(pcm()); assert.equal((await c.wait('error')).code, 'quota'); await c.closed();
  }
  assert.equal(f.providers.length, 0); assert.equal(f.releases, 2);
});

test('유료 연결 전 최신 권한을 재검사하며 변경·회수된 세션에는 quota도 예약하지 않는다', async t => {
  const f = await fixture(t);
  for (const session of [null, { id: 'different-session', sub: 'user-a' }]) {
    f.session = { id: 'session-a', sub: 'user-a' }; const c = await f.open(); f.session = session; c.ws.send(pcm());
    assert.equal((await c.wait('error')).code, 'auth-required'); await c.closed();
  }
  assert.equal(f.quotas, 0); assert.equal(f.providers.length, 0); assert.equal(f.releases, 2);
});

test('최종 선택 시작·전송 전 권한을 다시 확인하고 회수 뒤 결과를 보내지 않는다', async t => {
  const f = await fixture(t); f.finalGate = deferred();
  const c = await f.open(), provider = await f.voice(c); provider.emit(value('프랑스', { boundary: 'end' }));
  await until(() => f.finalCalls.length === 1);
  assert.equal(provider.closes, 0); f.session = null; f.finalGate.resolve(answer('fr', '프랑스'));
  assert.equal((await c.wait('error')).code, 'auth-required'); await c.closed();
  assert.equal(c.packets.some(packet => packet.type === 'result'), false); assert.equal(f.releases, 1);
});

test('manual finish는 provider 준비를 기다렸다가 PCM 다음 finalize를 한 번만 보낸다', async t => {
  const f = await fixture(t); f.providerReady = deferred(); const c = await f.open();
  c.ws.send(pcm()); await until(() => f.providers.length === 1);
  c.send({ type: 'finish' }); c.send({ type: 'finish' }); await drain(c.ws);
  const provider = f.providers[0]; assert.equal(provider.writes.length, 0); assert.equal(provider.finalizes, 0);
  f.providerReady.resolve(); await until(() => provider.finalizes === 1);
  assert.equal(Buffer.concat(provider.writes).length, 3200);
  provider.emit(value('프랑스', { boundary: 'fin' })); await c.wait('result'); await c.closed();
  assert.equal(provider.finalizes, 1); assert.equal(f.quotas, 1); assert.equal(f.releases, 1);
});

test('cancel은 quota 대기 중 유료 연결과 늦은 callbacks를 차단한다', async t => {
  const f = await fixture(t), gate = deferred(); f.hooks.consumeQuota = async () => { f.quotas++; await gate.promise; return { dailyUsed: 1, dailyLimit: 120 }; };
  const c = await f.open(); c.ws.send(pcm()); await until(() => f.quotas === 1);
  c.send({ type: 'cancel' }); await c.closed(); gate.resolve(); await new Promise(setImmediate);
  assert.equal(f.providers.length, 0); assert.equal(f.releases, 1);
});

test('provider 준비 중 close와 최종 선택 중 cancel은 슬롯을 한 번 해제하고 결과를 폐기한다', async t => {
  const f = await fixture(t); f.providerReady = deferred();
  const first = await f.open(); first.ws.send(pcm()); await until(() => f.providers.length === 1);
  const pending = f.providers[0]; first.ws.close(); await first.closed(); f.providerReady.resolve();
  pending.emit(value('대한민국')); pending.fail(error('speech_failed')); await new Promise(setImmediate);
  assert.equal(first.packets.some(packet => packet.type === 'result'), false); assert.equal(pending.closes, 1);
  f.providerReady = null; f.finalGate = deferred();
  const second = await f.open(), provider = await f.voice(second); provider.emit(value('프랑스', { boundary: 'end' }));
  await until(() => f.finalCalls.length === 1);
  second.send({ type: 'cancel' }); await second.closed();
  assert.equal(f.finalCalls[0].signal.aborted, true); f.finalGate.resolve(answer('fr', '프랑스'));
  provider.emit(value('대한민국')); await new Promise(setImmediate);
  assert.equal(second.packets.some(packet => packet.type === 'result'), false); assert.equal(f.releases, 2);
});

test('공급자 오류는 원문 없이 한 번만 전달하고 유료 재시도하지 않는다', async t => {
  const f = await fixture(t), c = await f.open(), provider = await f.voice(c);
  provider.fail(error('speech_failed', 502)); provider.fail(error('speech_timeout', 504)); provider.emit(value('대한민국'));
  const packet = await c.wait('error'); await c.closed();
  assert.equal(packet.code, 'service'); assert.doesNotMatch(JSON.stringify(packet), /provider-private|internal|secret/);
  assert.equal(c.packets.filter(value => value.type === 'error').length, 1); assert.equal(f.providers.length, 1); assert.equal(f.releases, 1);
});

test('공급자 준비 전 PCM queue 64KiB와 실제 PCM 12초 상한을 강제한다', async t => {
  const f = await fixture(t); f.providerReady = deferred(); const c = await f.open();
  c.ws.send(pcm()); await until(() => f.providers.length === 1);
  for (let index = 0; index < 8; index++) c.ws.send(Buffer.alloc(8192));
  assert.equal((await c.wait('error')).code, 'recording'); await c.closed();
  assert.equal(f.providers[0].writes.length, 0); f.providerReady.resolve();
  f.providerReady = null; const next = await f.open(), provider = await f.voice(next);
  let remaining = 384000 - 3200;
  while (remaining) { const size = Math.min(8192, remaining); next.ws.send(Buffer.alloc(size)); remaining -= size; }
  await drain(next.ws); assert.equal(Buffer.concat(provider.writes).length, 384000);
  next.ws.send(Buffer.alloc(2)); assert.equal((await next.wait('error')).code, 'recording'); await next.closed();
  assert.equal(f.releases, 2);
});

test('빈 완료·부정확한 provider callback은 결과 대신 안전한 오류로 종료한다', async t => {
  const f = await fixture(t);
  for (const result of [value('미국', { hasNonFinal: true, boundary: 'end' }), value('가'.repeat(501))]) {
    const c = await f.open(), provider = await f.voice(c); provider.emit(result);
    const packet = await c.wait('error'); await c.closed();
    assert.equal(packet.code, 'service');
    assert.equal(c.packets.some(packet => packet.type === 'result'), false);
  }
  assert.equal(f.finalCalls.length, 0);
});

test('연결 32개 제한은 인증된 무시작 소켓에도 적용한다', async t => {
  const f = await fixture(t);
  for (let index = 0; index < 32; index++) await f.open({ start: false });
  assert.equal(await f.reject(), 429); assert.equal(f.claims, 0); assert.equal(f.quotas, 0);
});

test('서버 close는 준비·유료 소켓을 끊고 중복 close에도 해제를 반복하지 않는다', async t => {
  const f = await fixture(t), c = await f.open(), provider = await f.voice(c);
  await f.open({ start: false }); await f.close(); await f.close(); await c.closed();
  assert.equal(f.releases, 1); assert.equal(provider.closes, 1); assert.equal(provider.handlers.signal.aborted, true);
  provider.emit(value('대한민국')); assert.equal(c.packets.some(packet => packet.type === 'result'), false);
});

test('최대 frame을 넘긴 PCM은 WS 수신 계층에서도 공급자 호출 없이 닫는다', async t => {
  const f = await fixture(t), c = await f.open();
  c.ws.send(Buffer.alloc(8194)); await c.closed();
  assert.equal(f.quotas, 0); assert.equal(f.providers.length, 0); assert.equal(f.releases, 1);
});

test('브라우저 송신 buffer 상한을 넘으면 슬롯과 마이크 연결을 종료한다', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'bufferedAmount');
  Object.defineProperty(WebSocket.prototype, 'bufferedAmount', { ...descriptor, get() {
    return this._isServer ? 65536 : descriptor.get.call(this);
  } });
  t.after(() => Object.defineProperty(WebSocket.prototype, 'bufferedAmount', descriptor));
  const f = await fixture(t), c = await f.open({ start: false });
  c.send({ type: 'start', csrfToken: 'session-csrf', mode: 'voice', playerId: '0', turnId: '4' });
  await c.closed(); assert.equal(f.claims, 1); assert.equal(f.releases, 1); assert.equal(f.quotas, 0);
});

test('서버 종료는 upgrade 인증 대기도 끊고 늦은 인증 응답을 재사용하지 않는다', async t => {
  const gate = deferred(), f = await fixture(t); let checks = 0, opened = false;
  f.hooks.getSession = async () => { checks++; return gate.promise; };
  const ws = new WebSocket(f.origin.replace('http:', 'ws:') + '/api/speech/stream', {
    headers: { Origin: f.origin, Cookie: 'session=valid', 'Sec-Fetch-Site': 'same-origin' } });
  f.clients.push(ws); ws.on('open', () => { opened = true; }); ws.on('error', () => {});
  const disconnected = new Promise(resolve => ws.once('close', resolve));
  await until(() => checks === 1); await f.close(); await disconnected;
  gate.resolve(f.session); await new Promise(setImmediate);
  assert.equal(opened, false); assert.equal(f.claims, 0); assert.equal(f.providers.length, 0);
});

test('시작 5초·무음 60초·유료 20초 timeout은 유료 호출·슬롯을 정리한다', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture(t), before = await f.open({ start: false });
  t.mock.timers.tick(5001); assert.equal((await before.wait('error')).code, 'timeout'); await before.closed();
  const silent = await f.open(); t.mock.timers.tick(60001);
  assert.equal((await silent.wait('listening')).reason, 'no-speech');
  silent.send({ type: 'cancel' }); await silent.closed();
  assert.equal(f.quotas, 0);
  const paid = await f.open(), provider = await f.voice(paid); t.mock.timers.tick(20001);
  assert.equal((await paid.wait('error')).code, 'timeout'); await paid.closed();
  assert.equal(provider.closes, 1); assert.equal(f.quotas, 1); assert.equal(f.releases, 2);
});
