/* 인증된 한 차례의 PCM만 중계하며 공급자 키·원음·오류 원문은 기록하지 않는다. */
import { WebSocketServer } from 'ws';

const PATH = '/api/speech/stream';
const MODES = new Set(['voice', 'capitalVoice', 'country-chain']);
const MAX_CONNECTIONS = 32, MAX_FRAME = 8192, MAX_QUEUE = 64 * 1024, MAX_PCM = 384000;
const START_TIMEOUT = 5000, IDLE_TIMEOUT = 60000, PAID_TIMEOUT = 20000;
const START_FIELDS = new Set(['type', 'csrfToken', 'mode', 'playerId', 'turnId']);
const invalid = code => Object.assign(new Error('Speech stream request failed'), { code });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function clientCode(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (error?.status === 401 || error?.status === 403 || ['auth-required', 'login-required', 'request-not-allowed'].includes(code)) return 'auth-required';
  if (['daily-speech-limit', 'monthly-speech-limit', 'quota'].includes(code)) return 'quota';
  if (['speech-busy', 'request-limit', 'busy'].includes(code)) return 'busy';
  if (code === 'no_speech' || code === 'no-speech') return 'no-speech';
  if (/timeout/.test(code)) return 'timeout';
  if (['invalid_audio', 'invalid-start', 'invalid-frame', 'audio_too_large', 'audio_too_long', 'recording'].includes(code)) return 'recording';
  return 'service';
}

export function attachSpeechWebSocket(server, { origin, isConfigured, getSession, validateCsrf, claimSpeech, consumeQuota,
  createTranscriber, resolveInstant, resolveFinal, canGradeUnknown = () => false }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: false });
  const connections = new Set(), pending = new Set();
  let shuttingDown = false, closing;

  function rejectUpgrade(socket, status = 403) {
    if (socket.destroyed) return;
    const reason = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 429: 'Too Many Requests', 503: 'Service Unavailable' }[status] || 'Forbidden';
    try { socket.end('HTTP/1.1 ' + status + ' ' + reason + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n', () => socket.destroy()); }
    catch { socket.destroy(); }
  }
  function ids(state) { return state.identity || {}; }
  function closeUpstream(state) {
    const upstream = state.upstream; state.upstream = null;
    try { upstream?.close(); } catch { /* 공급자의 종료 오류 원문을 전파하지 않는다. */ }
  }
  function end(state, terminate = false, code = 1000) {
    if (state.phase !== 'closed') {
      state.phase = 'closed'; clearTimeout(state.startTimer); clearTimeout(state.idleTimer); clearTimeout(state.paidTimer);
      state.abort.abort(); closeUpstream(state); state.queue = []; state.queueBytes = 0; state.vadRemainder = Buffer.alloc(0);
      const release = state.release; state.release = null;
      try { release?.(); } catch { /* 한 번 해제한 공유 슬롯을 다시 해제하지 않는다. */ }
    }
    const ws = state.ws;
    if (ws.readyState === 3) { clearTimeout(state.closeTimer); connections.delete(state); return; }
    if (terminate) { clearTimeout(state.closeTimer); ws.terminate(); return; }
    if (ws.readyState === 1) ws.close(code);
    state.closeTimer ||= setTimeout(() => { if (ws.readyState !== 3) ws.terminate(); }, 200);
  }
  function send(state, payload) {
    const data = JSON.stringify({ ...payload, ...ids(state) });
    if (state.ws.readyState !== 1 || state.ws.bufferedAmount + Buffer.byteLength(data) > MAX_QUEUE) { end(state, true); return false; }
    try {
      state.ws.send(data, { binary: false }, error => { if (error) end(state, true); }); return true;
    } catch { end(state, true); return false; }
  }
  function fail(state, error) {
    if (state.phase === 'closed') return;
    const code = clientCode(error);
    send(state, { type: 'error', code }); end(state, false, code === 'auth-required' ? 1008 : 1011);
  }
  async function fresh(state) {
    const session = await getSession(state.req, true);
    if (!session || session.id !== state.session.id) throw invalid('auth-required');
    return session;
  }
  function paidActive(state) { return state.phase === 'starting-provider' || state.phase === 'streaming'; }
  function armIdle(state) {
    clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(async () => {
      const window = state.window;
      try {
        await fresh(state);
        if (state.phase === 'ready' && state.window === window) listenAgain(state, 'no-speech', true);
      } catch (error) { fail(state, error); }
    }, IDLE_TIMEOUT);
  }
  function listenAgain(state, reason, resetAudio) {
    if (state.phase === 'closed') return;
    if (resetAudio) {
      closeUpstream(state); clearTimeout(state.paidTimer);
      state.window++; state.phase = 'ready'; state.queue = []; state.queueBytes = 0;
      state.pcmBytes = 0; state.voicedBins = 0; state.quietBins = 0; state.vadRemainder = Buffer.alloc(0);
      state.finishRequested = false; state.finalizeSent = false; state.quota = null; state.segments = [];
      armIdle(state);
    }
    send(state, { type: 'listening', reason, resetAudio, window: state.window });
  }
  function finalize(state) {
    if (state.phase !== 'streaming' || state.finalizeSent) return;
    state.finalizeSent = true;
    try { if (state.upstream.finalize() === false && state.phase === 'streaming') fail(state, invalid('service')); }
    catch { fail(state, invalid('service')); }
  }
  async function complete(state, text, resolution) {
    if (!paidActive(state)) return;
    state.phase = 'finishing';
    if (!send(state, { type: 'finishing' })) return;
    // 최종 선택을 기다리는 동안에도 녹음과 공급자 과금은 이미 끝나 있어야 한다.
    closeUpstream(state); state.queue = []; state.queueBytes = 0; state.segments = [];
    try {
      await fresh(state);
      if (state.phase !== 'finishing') return;
      if (!object(resolution)) throw invalid('service');
      await fresh(state);
      if (state.phase !== 'finishing' || state.abort.signal.aborted) return;
      if (send(state, { type: 'result', text, resolution, quota: state.quota })) end(state);
    } catch (error) { fail(state, error); }
  }
  async function resolveSegments(state) {
    if (state.resolving || !paidActive(state)) return;
    const resolvingWindow = state.window;
    state.resolving = true;
    try {
      while (state.segments.length && paidActive(state)) {
        const segment = state.segments.shift(), window = state.window;
        const session = await fresh(state);
        if (!paidActive(state) || state.window !== window) return;
        const resolution = segment.text ? await resolveFinal({ text: segment.text, mode: state.identity.mode }, state.abort.signal, session, state.req) : { status: 'retry' };
        if (!paidActive(state) || state.window !== window || state.abort.signal.aborted) return;
        if (!object(resolution) || !['answer', 'giveup', 'retry'].includes(resolution.status) || resolution.reason === 'rules-unavailable') throw invalid('service');
        await fresh(state);
        if (!paidActive(state) || state.window !== window) return;
        let gradeUnknown = false;
        if (resolution.status === 'retry' && resolution.reason === 'unknown' &&
            (state.identity.mode === 'voice' || state.identity.mode === 'capitalVoice')) {
          gradeUnknown = canGradeUnknown({ text: segment.text, mode: state.identity.mode });
          if (typeof gradeUnknown !== 'boolean') throw invalid('service');
        }
        // 최종 이름 원문은 문제 화면에서만 관대 채점한다. 중간 토큰·이어 말하기는 이 경로에 넣지 않는다.
        if (resolution.status !== 'retry' || gradeUnknown) { void complete(state, segment.text, resolution); return; }
        listenAgain(state, segment.text ? 'retry' : 'no-speech', segment.terminal);
      }
    } catch (error) {
      // 다음 확정 답의 인증 대기를 이전 구간의 늦은 실패가 취소하지 않는다.
      if (paidActive(state) && state.window === resolvingWindow) fail(state, error);
    }
    finally { state.resolving = false; }
  }
  function transcript(state, value) {
    if (!paidActive(state)) return;
    if (!object(value) || typeof value.text !== 'string' || typeof value.finalText !== 'string' ||
        value.text.length > 500 || value.finalText.length > 500 || typeof value.hasNonFinal !== 'boolean' ||
        ![null, 'end', 'fin'].includes(value.boundary) || typeof value.finished !== 'boolean' ||
        ((value.boundary || value.finished) && value.hasNonFinal)) { fail(state, invalid('service')); return; }
    // 공급자의 초기 heartbeat는 표시할 전사가 없으며 클라이언트의 녹음 상태를 바꾸지 않는다.
    if (value.text.trim() && !send(state, { type: 'partial', text: value.text.trim(), finalText: value.finalText, hasNonFinal: value.hasNonFinal,
      boundary: value.boundary, finished: value.finished })) return;
    try {
      if (!value.hasNonFinal && value.finalText.trim()) {
        const resolution = resolveInstant({ text: value.finalText, mode: state.identity.mode });
        if (resolution?.then) throw invalid('service');
        if (resolution?.status === 'answer') { void complete(state, value.finalText.trim(), resolution); return; }
      }
      if (value.boundary || value.finished) {
        const text = value.finalText.trim();
        if (state.segments.length >= 16) throw invalid('service');
        state.segments.push({ text, terminal: value.boundary === 'fin' || value.finished });
        void resolveSegments(state);
      }
    } catch (error) { fail(state, error); }
  }
  async function startProvider(state) {
    if (state.phase !== 'ready') return;
    state.phase = 'starting-provider'; clearTimeout(state.idleTimer);
    const window = state.window;
    state.paidTimer = setTimeout(() => fail(state, invalid('speech_timeout')), PAID_TIMEOUT);
    try {
      const session = await fresh(state);
      if (!paidActive(state)) return;
      const consumed = await consumeQuota(session);
      if (!paidActive(state)) return;
      if (!Number.isInteger(consumed?.dailyUsed) || consumed.dailyUsed < 0 || !Number.isInteger(consumed?.dailyLimit) || consumed.dailyLimit < 1) throw invalid('service');
      state.quota = { dailyUsed: consumed.dailyUsed, dailyLimit: consumed.dailyLimit };
      const transcriber = createTranscriber();
      if (!transcriber?.ready || typeof transcriber.connect !== 'function') throw invalid('service');
      state.upstream = transcriber.connect({ mode: state.identity.mode, signal: state.abort.signal,
        onTranscript: value => { if (state.window === window) transcript(state, value); },
        onError: error => { if (state.window === window && paidActive(state)) fail(state, error); } });
      if (!paidActive(state)) { closeUpstream(state); return; }
      await state.upstream.ready;
      if (!paidActive(state)) return;
      state.phase = 'streaming';
      const queued = state.queue; state.queue = []; state.queueBytes = 0;
      for (const chunk of queued) {
        if (state.phase !== 'streaming') break;
        if (state.upstream.write(chunk) === false && state.phase === 'streaming') { fail(state, invalid('service')); return; }
      }
      if (state.finishRequested) finalize(state);
    } catch (error) { fail(state, error); }
  }
  function voiced(state, chunk) {
    const audio = state.vadRemainder.length ? Buffer.concat([state.vadRemainder, chunk]) : chunk;
    let offset = 0, detected = false;
    for (; offset + 320 <= audio.length; offset += 320) {
      let energy = 0;
      for (let index = offset; index < offset + 320; index += 2) { const sample = audio.readInt16LE(index) / 32768; energy += sample * sample; }
      if (Math.sqrt(energy / 160) >= 0.003) { state.voicedBins++; state.quietBins = 0; }
      else if (++state.quietBins > 8) state.voicedBins = 0;
      if (state.voicedBins >= 10) detected = true;
    }
    state.vadRemainder = Buffer.from(audio.subarray(offset));
    return detected;
  }
  function pcm(state, data) {
    if (!['ready', 'starting-provider', 'streaming'].includes(state.phase)) { fail(state, invalid('invalid-frame')); return; }
    if (state.finishRequested) return;
    if (!Buffer.isBuffer(data) || !data.length || data.length > MAX_FRAME || data.length % 2) { fail(state, invalid('invalid-frame')); return; }
    if (state.pcmBytes + data.length > MAX_PCM) { fail(state, invalid('audio_too_long')); return; }
    state.pcmBytes += data.length;
    if (state.phase === 'streaming') {
      try { if (state.upstream.write(data) === false && state.phase === 'streaming') fail(state, invalid('service')); }
      catch { fail(state, invalid('service')); }
      return;
    }
    if (state.queueBytes + data.length > MAX_QUEUE) { fail(state, invalid('audio_too_large')); return; }
    const chunk = Buffer.from(data); state.queue.push(chunk); state.queueBytes += chunk.length;
    if (state.phase === 'ready' && voiced(state, chunk)) void startProvider(state);
  }
  function message(state, data, binary) {
    if (state.phase === 'closed') return;
    if (binary) { if (state.phase !== 'finishing') pcm(state, data); return; }
    if (!Buffer.isBuffer(data) || data.length > 2048) { fail(state, invalid('invalid-start')); return; }
    let value;
    try { value = JSON.parse(data.toString()); } catch { fail(state, invalid('invalid-start')); return; }
    if (!object(value)) { fail(state, invalid('invalid-start')); return; }
    if (value.type === 'cancel') { end(state); return; }
    if (state.phase === 'finishing') return;
    if (state.phase === 'waiting-start') {
      if (value.type !== 'start' || Object.keys(value).some(key => !START_FIELDS.has(key)) ||
          typeof value.csrfToken !== 'string' || !value.csrfToken.length || value.csrfToken.length > 256 || !MODES.has(value.mode) ||
          ![value.playerId, value.turnId].every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id))) {
        fail(state, invalid('invalid-start')); return;
      }
      state.identity = { mode: value.mode, playerId: value.playerId, turnId: value.turnId };
      try {
        if (validateCsrf(state.req, state.session, value.csrfToken) === false) throw invalid('auth-required');
        state.release = claimSpeech(state.session);
        if (typeof state.release !== 'function') throw invalid('service');
        clearTimeout(state.startTimer); state.phase = 'ready';
        armIdle(state);
        send(state, { type: 'ready' });
      } catch (error) { fail(state, error); }
      return;
    }
    if (value.type !== 'finish') { fail(state, invalid('invalid-frame')); return; }
    if (state.finishRequested) return;
    state.finishRequested = true;
    if (state.phase === 'ready') {
      const window = state.window;
      void fresh(state).then(() => {
        if (state.phase === 'ready' && state.window === window) listenAgain(state, 'no-speech', true);
      }).catch(error => fail(state, error));
      return;
    }
    finalize(state);
  }
  function accept(ws, req, session) {
    const state = { ws, req, session, phase: 'waiting-start', identity: null, release: null, upstream: null,
      abort: new AbortController(), queue: [], queueBytes: 0, pcmBytes: 0, voicedBins: 0, quietBins: 0, vadRemainder: Buffer.alloc(0),
      finishRequested: false, finalizeSent: false, quota: null, window: 1, resolving: false, segments: [] };
    connections.add(state);
    state.startTimer = setTimeout(() => fail(state, invalid('speech_timeout')), START_TIMEOUT);
    ws.on('message', (data, binary) => message(state, data, binary));
    ws.on('error', () => end(state, true));
    ws.on('close', () => { end(state); clearTimeout(state.closeTimer); connections.delete(state); });
  }
  async function upgrade(req, socket, head) {
    socket.on('error', () => {});
    let expectedOrigin;
    try { expectedOrigin = typeof origin === 'function' ? origin() : origin; } catch { rejectUpgrade(socket, 503); return; }
    if (shuttingDown || req.url !== PATH || req.method !== 'GET' || typeof expectedOrigin !== 'string' || !expectedOrigin || req.headers.origin !== expectedOrigin ||
        (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) { rejectUpgrade(socket); return; }
    if (!req.headers.cookie) { rejectUpgrade(socket, 401); return; }
    if (connections.size + pending.size >= MAX_CONNECTIONS) { rejectUpgrade(socket, 429); return; }
    try { if (!isConfigured()) { rejectUpgrade(socket, 503); return; } } catch { rejectUpgrade(socket, 503); return; }
    const item = { socket, active: true };
    const remove = () => { item.active = false; clearTimeout(item.timer); pending.delete(item); };
    item.timer = setTimeout(() => { remove(); socket.destroy(); }, START_TIMEOUT);
    item.remove = remove; pending.add(item); socket.once('close', remove);
    try {
      const session = await getSession(req, true);
      if (!item.active || shuttingDown || socket.destroyed) return;
      if (!session || typeof session.id !== 'string') { remove(); rejectUpgrade(socket, 401); return; }
      remove();
      wss.handleUpgrade(req, socket, head, ws => accept(ws, req, session));
    } catch (error) {
      if (socket.destroyed || shuttingDown) return;
      remove(); rejectUpgrade(socket, clientCode(error) === 'auth-required' ? 401 : 503);
    }
  }
  server.on('upgrade', upgrade);
  function close() {
    if (closing) return closing;
    shuttingDown = true; server.off('upgrade', upgrade);
    for (const item of pending) { item.remove(); item.socket.destroy(); }
    for (const state of connections) end(state, true);
    closing = new Promise(resolve => wss.close(() => resolve()));
    return closing;
  }
  return { close };
}
