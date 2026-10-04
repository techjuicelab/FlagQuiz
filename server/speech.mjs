/* 음성은 메모리에서만 처리한다. 인증과 사용량 예약은 호출하는 서버가 먼저 맡는다. */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const MAX_DURATION_MS = 12000;
export const MAX_PROMPT_BYTES = 160;
const SAMPLE_RATE = 16000;
const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo';
// Whisper의 byte-level BPE는 UTF-8 바이트를 합친다. 내용은 최대 160토큰으로, 224토큰 한도에 여유를 둔다.
const COUNTRY_PROMPT = '한국어 나라 이름 놀이의 짧은 답변과 요청. 힌트, 몰라요, 다시.';
const CAPITAL_PROMPT = '한국어 수도 이름 놀이의 짧은 답변과 요청. 힌트, 몰라요, 다시.';
for (const prompt of [COUNTRY_PROMPT, CAPITAL_PROMPT]) {
  if (Buffer.byteLength(prompt, 'utf8') > MAX_PROMPT_BYTES) throw new Error('말하기 안내가 너무 길어요.');
}

export class SpeechError extends Error {
  constructor(status, code, message) { super(message); this.name = 'SpeechError'; this.status = status; this.code = code; }
}

function invalid() { return new SpeechError(400, 'invalid_audio', '녹음 형식을 확인할 수 없어요. 다시 말하거나 글자로 답해 주세요.'); }
function cancelled() { return new SpeechError(499, 'cancelled', '말하기 요청을 취소했어요.'); }

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

export function createTranscriber({ apiKey = process.env.GROQ_API_KEY, fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  const ready = typeof apiKey === 'string' && apiKey.trim().length > 0 && !/^['"]?op:\/\//.test(apiKey.trim());
  async function transcribe(rawInput, { signal } = {}) {
    if (!ready) throw new SpeechError(503, 'speech_unavailable', '클라우드 말하기가 아직 준비되지 않았어요. 글자로 답해 주세요.');
    const input = validateSpeechInput(rawInput);
    if (signal?.aborted) throw cancelled();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const body = new FormData();
      body.set('file', new Blob([input.audio], { type: 'audio/wav' }), 'speech.wav');
      body.set('model', MODEL); body.set('language', 'ko'); body.set('response_format', 'json');
      body.set('prompt', input.mode === 'capitalVoice' ? CAPITAL_PROMPT : COUNTRY_PROMPT);
      const response = await fetchImpl(ENDPOINT, { method: 'POST', headers: { Authorization: 'Bearer ' + apiKey }, body, signal: controller.signal });
      if (!response.ok) throw new SpeechError(502, 'speech_failed', '목소리를 알아듣지 못했어요. 다시 말하거나 글자로 답해 주세요.');
      const result = await response.json();
      if (controller.signal.aborted) throw cancelled();
      if (!result || typeof result.text !== 'string' || result.text.length > 500) throw new SpeechError(502, 'speech_failed', '목소리를 알아듣지 못했어요. 글자로 답해 주세요.');
      return { text: result.text.trim() };
    } catch (error) {
      if (timedOut) throw new SpeechError(504, 'speech_timeout', '목소리를 확인하는 데 시간이 오래 걸려요. 글자로 답해 주세요.');
      if (signal?.aborted) throw cancelled();
      if (error instanceof SpeechError) throw error;
      throw new SpeechError(502, 'speech_failed', '목소리를 알아듣지 못했어요. 다시 말하거나 글자로 답해 주세요.');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  transcribe.ready = ready;
  transcribe.model = MODEL;
  return transcribe;
}
