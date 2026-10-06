/* 실시간 음성은 메모리에서만 중계한다. 인증과 사용량 예약은 호출하는 서버가 맡는다. */
import WebSocket from 'ws';
import { SpeechError, MAX_DURATION_MS } from './speech.mjs';

const ENDPOINT = 'wss://stt-rt.soniox.com/transcribe-websocket';
const MODEL = 'stt-rt-v5';
const MAX_BUFFERED_BYTES = 64 * 1024;
const MAX_PCM_BYTES = MAX_DURATION_MS * 16000 * 2 / 1000;
const MAX_TEXT_LENGTH = 500;
const MODES = new Set(['voice', 'capitalVoice', 'country-chain']);

function failed() { return new SpeechError(502, 'speech_failed', '목소리를 알아듣지 못했어요. 다시 말하거나 글자로 답해 주세요.'); }
function cancelled() { return new SpeechError(499, 'cancelled', '말하기 요청을 취소했어요.'); }
function timedOut() { return new SpeechError(504, 'speech_timeout', '목소리를 확인하는 데 시간이 오래 걸려요. 글자로 답해 주세요.'); }
function invalidAudio() { return new SpeechError(400, 'invalid_audio', '녹음 형식을 확인할 수 없어요. 다시 말하거나 글자로 답해 주세요.'); }

export function createRealtimeTranscriber({ apiKey = process.env.SONIOX_API_KEY, WebSocketImpl = WebSocket, timeoutMs = 20000 } = {}) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  const ready = Boolean(key && !/^["']?op:\/\//i.test(key) && !/[\r\n]/.test(key));
  const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000;

  function connect({ mode = 'country-chain', signal, onTranscript = () => {}, onError = () => {} } = {}) {
    let socket, timer, terminal = false, opened = false, settled = false, finalizing = false;
    let finalText = '', pcmBytes = 0;
    let resolveReady, rejectReady;
    const connectionReady = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    // connect 직후의 취소도 처리하되 호출자가 ready를 늦게 구독할 때 거부가 유실되지 않게 한다.
    connectionReady.catch(() => {});

    function settle(error) {
      if (settled) return;
      settled = true;
      if (error) rejectReady(error); else resolveReady();
    }
    function dispose() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', aborted);
      if (!socket) return;
      socket.off('open', opening); socket.off('message', message); socket.off('close', disconnected);
      // terminate가 CONNECTING 소켓에 발생시키는 후속 error도 원문을 전달하지 않는다.
      if (socket.readyState === 0 || socket.readyState === 1 || socket.readyState === 2) {
        try { socket.terminate(); } catch { /* 이미 닫힌 연결에는 추가 동작을 하지 않는다. */ }
      }
    }
    function fail(error = failed()) {
      if (terminal) return;
      terminal = true; opened = false; settle(error); dispose();
      try { onError(error); } catch { /* 소비자의 오류도 공급자 원문으로 바꾸지 않는다. */ }
    }
    function aborted() { fail(cancelled()); }
    function disconnected() { fail(failed()); }
    function transportError() { fail(failed()); }

    function send(value, binary) {
      if (terminal || socket?.readyState !== 1) return false;
      const size = Buffer.isBuffer(value) ? value.length : Buffer.byteLength(value);
      if (!Number.isFinite(socket.bufferedAmount) || socket.bufferedAmount + size > MAX_BUFFERED_BYTES) {
        fail(new SpeechError(503, 'speech_backpressure', '음성 연결이 지연되고 있어요. 다시 말하거나 글자로 답해 주세요.'));
        return false;
      }
      try {
        socket.send(value, { binary }, error => { if (error) fail(failed()); });
        return !terminal;
      } catch { fail(failed()); return false; }
    }
    function opening() {
      if (terminal) return;
      const config = JSON.stringify({ model: MODEL, audio_format: 'pcm_s16le', sample_rate: 16000, num_channels: 1,
        language_hints: ['ko'], enable_endpoint_detection: true, endpoint_latency_adjustment_level: 3,
        endpoint_sensitivity: 0.3, max_endpoint_delay_ms: 500 });
      if (!Number.isFinite(socket.bufferedAmount) || socket.bufferedAmount + Buffer.byteLength(config) > MAX_BUFFERED_BYTES) {
        fail(failed()); return;
      }
      try {
        socket.send(config, { binary: false }, error => {
          if (terminal) return;
          if (error) { fail(failed()); return; }
          opened = true; settle();
        });
      } catch { fail(failed()); }
    }
    function message(data, binary = false) {
      if (terminal) return;
      if (!opened || binary || !(typeof data === 'string' || Buffer.isBuffer(data)) || Buffer.byteLength(data) > MAX_BUFFERED_BYTES) {
        fail(failed()); return;
      }
      let result;
      try { result = JSON.parse(data.toString()); } catch { fail(failed()); return; }
      if (!result || typeof result !== 'object' || Array.isArray(result) || Object.hasOwn(result, 'error_code') ||
          !Array.isArray(result.tokens) || result.tokens.length > 1024 ||
          (result.finished !== undefined && typeof result.finished !== 'boolean')) { fail(failed()); return; }
      let nextFinal = finalText, nonFinal = '', hasNonFinal = false, boundary = null;
      for (const token of result.tokens) {
        if (!token || typeof token !== 'object' || Array.isArray(token) || typeof token.text !== 'string' || typeof token.is_final !== 'boolean') {
          fail(failed()); return;
        }
        if (token.text === '<end>' || token.text === '<fin>') {
          if (!token.is_final) { fail(failed()); return; }
          // 자동 endpoint와 수동 finalize가 경합해도 완료는 한 번만 전달한다.
          boundary ||= token.text === '<end>' ? 'end' : 'fin';
          continue;
        }
        // 완료 경계 뒤에 이어 붙은 텍스트를 같은 차례의 답으로 받아들이지 않는다.
        if (boundary) { fail(failed()); return; }
        if (token.is_final) nextFinal += token.text;
        else { nonFinal += token.text; hasNonFinal = true; }
        if (nextFinal.length + nonFinal.length > MAX_TEXT_LENGTH) { fail(failed()); return; }
      }
      if ((boundary || result.finished) && hasNonFinal) { fail(failed()); return; }
      finalText = nextFinal;
      try { onTranscript({ text: (finalText + nonFinal).trim(), finalText: finalText.trim(), hasNonFinal,
        boundary, finished: result.finished === true }); }
      catch { fail(failed()); return; }
      // 한 연결은 한 차례만 처리한다. 중복 경계와 늦은 메시지는 추가 결과를 만들지 않는다.
      if (!terminal && (boundary || result.finished)) { terminal = true; opened = false; dispose(); }
    }

    const connection = {
      ready: connectionReady,
      write(audio) {
        if (terminal || !opened || finalizing) return false;
        if (!Buffer.isBuffer(audio) || !audio.length || audio.length % 2) { fail(invalidAudio()); return false; }
        if (pcmBytes + audio.length > MAX_PCM_BYTES) {
          fail(new SpeechError(413, 'audio_too_long', '답은 12초 안에 짧게 말해 주세요.')); return false;
        }
        if (!send(Buffer.from(audio), true)) return false;
        pcmBytes += audio.length; return true;
      },
      finalize() {
        if (terminal || !opened || finalizing) return false;
        finalizing = true;
        return send(JSON.stringify({ type: 'finalize' }), false);
      },
      close() {
        if (terminal) return;
        terminal = true; opened = false; settle(cancelled()); dispose();
      }
    };

    let initialError;
    if (!ready) initialError = new SpeechError(503, 'speech_unavailable', '클라우드 말하기가 아직 준비되지 않았어요. 글자로 답해 주세요.');
    else if (!MODES.has(mode)) initialError = new SpeechError(400, 'invalid_mode', '말하기 놀이를 확인할 수 없어요. 글자로 답해 주세요.');
    else if (signal?.aborted) initialError = cancelled();
    if (initialError) { queueMicrotask(() => fail(initialError)); return connection; }
    signal?.addEventListener('abort', aborted, { once: true });
    timer = setTimeout(() => fail(timedOut()), duration);
    try {
      socket = new WebSocketImpl(ENDPOINT, { headers: { Authorization: 'Bearer ' + key },
        perMessageDeflate: false, maxPayload: MAX_BUFFERED_BYTES, handshakeTimeout: duration });
      socket.on('error', transportError);
      // 생성 도중 abort된 경우에도 뒤늦게 반환된 실제 소켓을 남기지 않는다.
      if (terminal) { dispose(); return connection; }
      socket.on('open', opening); socket.on('message', message); socket.on('close', disconnected);
    } catch { queueMicrotask(() => fail(failed())); }
    return connection;
  }
  return { ready, connect };
}
