/* 음성은 메모리에서만 처리한다. 인증과 사용량 예약은 호출하는 서버가 먼저 맡는다. */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const MAX_DURATION_MS = 12000;
const SAMPLE_RATE = 16000;
const MODEL = 'stt-rt-v5';
const PCM_FRAME_BYTES = SAMPLE_RATE * 2 / 10;

export class SpeechError extends Error {
  constructor(status, code, message) { super(message); this.name = 'SpeechError'; this.status = status; this.code = code; }
}

function invalid() { return new SpeechError(400, 'invalid_audio', '녹음 형식을 확인할 수 없어요. 다시 말하거나 글자로 답해 주세요.'); }
function cancelled() { return new SpeechError(499, 'cancelled', '말하기 요청을 취소했어요.'); }
function failed() { return new SpeechError(502, 'speech_failed', '목소리를 알아듣지 못했어요. 다시 말하거나 글자로 답해 주세요.'); }

function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(cancelled()); return; }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    function abort() { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(cancelled()); }
    signal.addEventListener('abort', abort, { once: true });
  });
}

function speechMode(value) {
  const mode = value === undefined ? 'country-chain' : value;
  if (mode !== 'voice' && mode !== 'capitalVoice' && mode !== 'country-chain') {
    throw new SpeechError(400, 'invalid_mode', '말하기 놀이를 확인할 수 없어요. 글자로 답해 주세요.');
  }
  return mode;
}

/** 브라우저가 만든 고정 PCM WAV만 받아 헤더 신고값 대신 실제 표본 수로 길이를 제한한다. */
export function validateSpeechInput(input) {
  const mode = speechMode(input && input.mode);
  const audio = input && input.audio;
  if (!Buffer.isBuffer(audio) || audio.length < 46) throw invalid();
  if (audio.length > MAX_AUDIO_BYTES) throw new SpeechError(413, 'audio_too_large', '녹음이 너무 커요. 답을 짧게 말해 주세요.');
  if (input.mimeType !== 'audio/wav') throw new SpeechError(415, 'unsupported_audio', '이 녹음 형식은 지원하지 않아요. 글자로 답해 주세요.');
  if (audio.toString('ascii', 0, 4) !== 'RIFF' || audio.readUInt32LE(4) !== audio.length - 8 ||
      audio.toString('ascii', 8, 12) !== 'WAVE' || audio.toString('ascii', 12, 16) !== 'fmt ' || audio.readUInt32LE(16) !== 16 ||
      audio.readUInt16LE(20) !== 1 || audio.readUInt16LE(22) !== 1 || audio.readUInt32LE(24) !== SAMPLE_RATE ||
      audio.readUInt32LE(28) !== SAMPLE_RATE * 2 || audio.readUInt16LE(32) !== 2 || audio.readUInt16LE(34) !== 16 ||
      audio.toString('ascii', 36, 40) !== 'data' || audio.readUInt32LE(40) !== audio.length - 44 || (audio.length - 44) % 2) throw invalid();
  const durationMs = (audio.length - 44) / 2 / SAMPLE_RATE * 1000;
  if (durationMs > MAX_DURATION_MS) throw new SpeechError(413, 'audio_too_long', '답은 12초 안에 짧게 말해 주세요.');
  if (durationMs < 100) throw new SpeechError(400, 'no_speech', '목소리가 들리지 않았어요. 다시 말하거나 글자로 답해 주세요.');
  // 문턱은 완전무음에만 적용하여 작은 목소리의 표본을 보존한다.
  if (!audio.subarray(44).some(byte => byte !== 0)) throw new SpeechError(400, 'no_speech', '목소리가 들리지 않았어요. 다시 말하거나 글자로 답해 주세요.');
  return { ...input, durationMs, mode };
}

function header(req, name) {
  const value = req.headers[name];
  if (typeof value !== 'string') throw invalid();
  return value;
}

function readBody(req, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    let chunks = [], size = 0;
    const timer = setTimeout(() => finish(new SpeechError(408, 'upload_timeout', '녹음을 보내는 데 시간이 오래 걸려요. 글자로 답해 주세요.')), timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      req.removeListener('data', data); req.removeListener('end', end); req.removeListener('error', failed); req.removeListener('aborted', abort);
      signal?.removeEventListener('abort', abort);
    }
    function finish(error, value) {
      cleanup();
      if (error) { chunks = []; req.pause(); reject(error); } else resolve(value);
    }
    function data(chunk) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_AUDIO_BYTES) { finish(new SpeechError(413, 'audio_too_large', '녹음이 너무 커요. 답을 짧게 말해 주세요.')); return; }
      chunks.push(bytes);
    }
    function end() { const audio = Buffer.concat(chunks, size); chunks = []; finish(null, audio); }
    function failed() { finish(new SpeechError(400, 'upload_failed', '녹음을 받지 못했어요. 글자로 답해 주세요.')); }
    function abort() { finish(cancelled()); }
    if (signal?.aborted || req.aborted) { abort(); return; }
    req.on('data', data); req.on('end', end); req.on('error', failed); req.on('aborted', abort);
    signal?.addEventListener('abort', abort, { once: true });
    // 인증을 기다리며 멈춰 둔 HTTP 본문은 모든 리스너를 설치한 뒤 읽기 시작한다.
    req.resume();
  });
}

export async function readSpeechInput(req, { signal, timeoutMs = 10000 } = {}) {
  const mode = speechMode(req.headers['x-speech-mode']);
  const mimeType = header(req, 'content-type').split(';')[0].trim().toLowerCase();
  if (mimeType !== 'audio/wav') throw new SpeechError(415, 'unsupported_audio', '이 녹음 형식은 지원하지 않아요. 글자로 답해 주세요.');
  const declared = header(req, 'x-audio-duration-ms');
  if (!/^\d{1,5}$/.test(declared) || Number(declared) < 1 || Number(declared) > MAX_DURATION_MS) throw invalid();
  const playerId = header(req, 'x-player-id'), turnId = header(req, 'x-turn-id');
  if (![playerId, turnId].every(value => /^[a-zA-Z0-9_-]{1,80}$/.test(value))) throw invalid();
  if (req.headers['content-length'] !== undefined) {
    const length = header(req, 'content-length');
    if (!/^\d+$/.test(length)) throw invalid();
    if (Number(length) > MAX_AUDIO_BYTES) throw new SpeechError(413, 'audio_too_large', '녹음이 너무 커요. 답을 짧게 말해 주세요.');
  }
  const audio = await readBody(req, signal, timeoutMs);
  const input = validateSpeechInput({ audio, mimeType, playerId, turnId, mode });
  if (Math.abs(input.durationMs - Number(declared)) > 200) throw invalid();
  return input;
}

export function createTranscriber({ apiKey = process.env.SONIOX_API_KEY, realtimeTranscriber,
  WebSocketImpl, timeoutMs = 20000, delayImpl = pause } = {}) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  const ready = Boolean(key && !/^["']?op:\/\//i.test(key) && !/[\r\n]/.test(key) && realtimeTranscriber?.ready !== false);
  const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000;
  async function transcribe(rawInput, { signal } = {}) {
    if (!ready) throw new SpeechError(503, 'speech_unavailable', '클라우드 말하기가 아직 준비되지 않았어요. 글자로 답해 주세요.');
    const input = validateSpeechInput(rawInput);
    if (signal?.aborted) throw cancelled();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false, connection;
    function close() { try { connection?.close(); } catch { /* 종료 오류도 공급자 원문으로 노출하지 않는다. */ } }
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, duration);
    try {
      // 순환 import를 피하고 HTTP 파일 경로도 같은 Soniox RT 어댑터만 사용한다.
      const realtime = realtimeTranscriber || (await import('./realtime-speech.mjs')).createRealtimeTranscriber({
        apiKey: key, WebSocketImpl, timeoutMs: duration
      });
      if (controller.signal.aborted) throw cancelled();
      return await new Promise((resolve, reject) => {
        let settled = false, audioSent = false, finalizing = false;
        const segments = [];
        function finish(error, text) {
          if (settled) return;
          settled = true;
          controller.signal.removeEventListener('abort', aborted);
          close();
          controller.abort();
          if (error) reject(error); else resolve({ text });
        }
        function aborted() { finish(cancelled()); }
        controller.signal.addEventListener('abort', aborted, { once: true });
        function transcript(result) {
          if (settled) return;
          if (!result || typeof result.finalText !== 'string') { finish(failed()); return; }
          const text = [...segments, result.finalText].join(' ').trim();
          if (text.length > 500) { finish(failed()); return; }
          if (result.boundary === 'fin' || result.finished === true) {
            // 공급자가 오디오 끝보다 먼저 종료하면 잘린 답을 채점하지 않는다.
            if (!audioSent || !finalizing || result.hasNonFinal) { finish(failed()); return; }
            finish(null, text);
          } else if (result.boundary === 'end') {
            if (result.finalText.trim()) segments.push(result.finalText.trim());
          }
        }
        try {
          connection = realtime.connect({ mode: input.mode, signal: controller.signal,
            onTranscript: transcript, onError: error => finish(error instanceof SpeechError ? error : failed()) });
          if (settled) { close(); return; }
          async function stream() {
            await connection.ready;
            const pcm = input.audio.subarray(44);
            for (let offset = 0; offset < pcm.length; offset += PCM_FRAME_BYTES) {
              if (controller.signal.aborted || settled) return;
              const frame = pcm.subarray(offset, offset + PCM_FRAME_BYTES);
              await new Promise((sent, rejectSent) => {
                let completed = false;
                function done(error) {
                  if (completed) return;
                  completed = true;
                  controller.signal.removeEventListener('abort', cancelSend);
                  if (error) rejectSent(failed()); else sent();
                }
                function cancelSend() { done(cancelled()); }
                controller.signal.addEventListener('abort', cancelSend, { once: true });
                try { if (!connection.write(frame, done)) done(failed()); }
                catch { done(failed()); }
              });
              // 미리 녹음한 PCM도 공급자의 실시간 속도 규칙과 버퍼 상한을 지킨다.
              await delayImpl(frame.length / (SAMPLE_RATE * 2) * 1000, controller.signal);
            }
            if (controller.signal.aborted || settled) return;
            audioSent = true; finalizing = true;
            if (!connection.finalize()) finish(failed());
          }
          stream().catch(error => finish(error instanceof SpeechError ? error : failed()));
        } catch { finish(failed()); }
      });
    } catch (error) {
      if (timedOut) throw new SpeechError(504, 'speech_timeout', '목소리를 확인하는 데 시간이 오래 걸려요. 글자로 답해 주세요.');
      if (signal?.aborted) throw cancelled();
      if (error instanceof SpeechError) throw error;
      throw failed();
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); close(); }
  }
  transcribe.ready = ready;
  transcribe.model = MODEL;
  return transcribe;
}
