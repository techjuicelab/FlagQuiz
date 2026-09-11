/* 설치된 MLX Core 로컬 엔진으로 생성한다. 원본과 요청을 보존하고 완료된 파일은 재사용한다. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function option(name, fallback) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
const base = new URL(option('--base-url', 'http://127.0.0.1:11234'));
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) {
  throw new Error('이 생성 스크립트는 MLX Core 로컬 주소만 사용합니다.');
}
const pack = JSON.parse(await fs.readFile(path.join(root, 'docs/mlx-audio/presets.json'), 'utf8'));
const only = option('--only', null);
const selected = pack.presets.filter(p => !only || p.id === only);
if (!selected.length) throw new Error('해당 프리셋이 없습니다.');
const rawDir = path.join(root, 'docs/artifacts/mlx-music/raw');
await fs.mkdir(rawDir, { recursive: true });
const modelPath = path.join(os.homedir(), '.mlx-serve/models/ddalcu/ACE-Step-1.5-XL-Turbo-MLX-Serve-8bit');
const modelId = 'ddalcu/ACE-Step-1.5-XL-Turbo-MLX-Serve-8bit';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
async function jsonRequest(route, body) {
  const response = await fetch(new URL(route, base), {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180000)
  });
  if (!response.ok) throw new Error(route + ': HTTP ' + response.status + ' ' + (await response.text()).slice(0, 500));
  return response.json();
}
const before = await jsonRequest('/v1/models');
const wasLoaded = before.data.find(m => m.id === modelId)?.loaded === true;
let loadedId = modelId;
let loadedByUs = false;
try {
  if (!wasLoaded) {
    console.log('MLX 음악 모델 로딩');
    const result = await jsonRequest('/v1/load-model', { model: modelPath });
    loadedId = result.model.id;
    loadedByUs = true;
  }
  for (const p of selected) {
    const body = { model: loadedId, prompt: p.prompt, instrumental: true,
      duration_seconds: p.durationSeconds, bpm: p.bpm, keyscale: p.key,
      timesignature: p.timeSignature.split('/')[0], vocal_language: 'ko',
      seed: Number(option('--seed', p.seed)), stream: true };
    const requestHash = hash(JSON.stringify(body));
    const stem = p.outputStem + '-seed' + body.seed;
    const wavPath = path.join(rawDir, stem + '.wav');
    const metaPath = path.join(rawDir, stem + '.json');
    try {
      const metadata = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      const old = await fs.readFile(wavPath);
      if (metadata.requestHash !== requestHash || metadata.sha256 !== hash(old)) throw new Error('보존된 원본과 요청이 다릅니다: ' + stem);
      console.log('기존 완료 음원 재사용: ' + p.id);
      continue;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const started = Date.now();
    console.log('생성 시작: ' + p.id + ' / ' + p.durationSeconds + '초 / seed ' + body.seed);
    const response = await fetch(new URL('/v1/audio/music-generations', base), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(600000)
    });
    if (!response.ok) throw new Error(p.id + ': HTTP ' + response.status + ' ' + (await response.text()).slice(0, 500));
    let wav = null;
    if ((response.headers.get('content-type') || '').includes('text/event-stream')) {
      const decoder = new TextDecoder();
      let pending = '';
      function handle(line) {
        if (!line.startsWith('data:')) return;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') return;
        const event = JSON.parse(data);
        if (event.type === 'error') throw new Error(p.id + ': ' + event.message);
        if (event.type === 'complete' && event.data) wav = Buffer.from(event.data, 'base64');
        if (event.type === 'progress' && (event.step === event.total || event.step === 1)) {
          console.log(p.id + ': ' + event.stage + ' ' + event.step + '/' + event.total);
        }
      }
      for await (const chunk of response.body) {
        pending += decoder.decode(chunk, { stream: true });
        let newline;
        while ((newline = pending.indexOf('\n')) >= 0) { handle(pending.slice(0, newline).replace(/\r$/, '')); pending = pending.slice(newline + 1); }
      }
      pending += decoder.decode();
      if (pending.trim()) handle(pending);
    } else { wav = Buffer.from(await response.arrayBuffer()); }
    if (!wav || wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error(p.id + ': 유효한 WAV가 아닙니다.');
    }
    const metadata = { id: p.id, title: p.title, generatedAt: new Date().toISOString(),
      engine: 'MLX Core local API', request: body, requestHash, sha256: hash(wav), bytes: wav.length,
      elapsedSeconds: Math.round((Date.now() - started) / 100) / 10 };
    await fs.writeFile(wavPath + '.partial', wav);
    await fs.rename(wavPath + '.partial', wavPath);
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2) + '\n');
    await fs.writeFile(path.join(rawDir, stem + '.txt'), Object.entries(body).filter(([k]) => k !== 'prompt').map(([k,v]) => k + ': ' + v).join('\n') + '\n\n# Style prompt\n' + p.prompt + '\n');
    console.log('완료: ' + p.id + ' / ' + wav.length + ' bytes / ' + metadata.elapsedSeconds + '초');
  }
} finally {
  if (loadedByUs) {
    try { await jsonRequest('/v1/unload-model', { model: loadedId }); console.log('생성 모델 메모리 해제'); }
    catch (error) { console.error('생성 완료 후 모델 해제 확인 필요: ' + error.message); }
  }
}
