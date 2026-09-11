/* MLX 원본을 보존하고 짧은 앱용 사본만 편집한다. ffmpeg 경로는 --ffmpeg로 지정한다. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const ffmpeg = args.includes('--ffmpeg') ? args[args.indexOf('--ffmpeg') + 1] : 'ffmpeg';
const pack = JSON.parse(await fs.readFile(path.join(root, 'docs/mlx-audio/presets.json'), 'utf8'));
const rawDir = path.join(root, 'docs/artifacts/mlx-music/raw');
const masters = path.join(root, 'docs/artifacts/mlx-music/edited');
const destination = path.join(root, 'audio/music');
await fs.mkdir(masters, { recursive: true });
await fs.mkdir(destination, { recursive: true });
const sampleRate = 48000, channels = 2, frameSamples = 240;
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
function run(options) { return execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...options], { maxBuffer: 64 * 1024 * 1024 }); }
function decode(file, filtered = false) {
  const filter = filtered ? ['-af', 'highpass=f=90,lowpass=f=7000'] : [];
  const pcm = run(['-i', file, ...filter, '-ar', String(sampleRate), '-ac', String(channels), '-f', 'f32le', 'pipe:1']);
  return new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
}
function stats(samples) {
  let square = 0, peak = 0, clipped = 0;
  for (const value of samples) {
    if (!Number.isFinite(value)) throw new Error('오디오 샘플 값이 유효하지 않습니다.');
    square += value * value; peak = Math.max(peak, Math.abs(value));
    if (Math.abs(value) >= 0.999) clipped++;
  }
  return { rms: Math.sqrt(square / samples.length), peak, clippedSamples: clipped,
    duration: samples.length / sampleRate / channels };
}
const clips = [], records = [];
for (const p of pack.presets) {
  const rawStem = p.outputStem + '-seed' + p.seed;
  const raw = path.join(rawDir, rawStem + '.wav');
  const metadata = JSON.parse(await fs.readFile(path.join(rawDir, rawStem + '.json'), 'utf8'));
  if (hash(await fs.readFile(raw)) !== metadata.sha256) throw new Error('원본 해시 불일치: ' + p.id);
  const samples = decode(raw, true), before = stats(samples);
  if (before.rms < 0.0001 || before.duration < p.durationSeconds - 0.1) throw new Error('원본 음원 길이·무음을 확인하세요: ' + p.id);
  const envelope = [];
  for (let i = 0; i < samples.length; i += frameSamples * channels) {
    let square = 0, count = 0;
    for (let j = i; j < Math.min(i + frameSamples * channels, samples.length); j++) { square += samples[j] ** 2; count++; }
    envelope.push(Math.sqrt(square / count));
  }
  const frameSeconds = frameSamples / sampleRate;
  const threshold = Math.max(0.0005, Math.max(...envelope) * 0.025);
  const onset = Math.max(0, envelope.findIndex((v, i) => v > threshold && (envelope[i + 1] || 0) > threshold) * frameSeconds - 0.015);
  const start = p.event === 'homeBgm' ? 0 : Math.min(onset, before.duration - p.clipSeconds[1]);
  // 설정 범위 안에서 에너지가 낮은 지점을 끝으로 골라 긴 악구 중간의 절단을 줄인다.
  const target = (p.clipSeconds[0] + p.clipSeconds[1]) / 2;
  let bestLength = target, bestCost = Infinity;
  for (let length = p.clipSeconds[0]; length <= p.clipSeconds[1]; length += frameSeconds) {
    const index = Math.round((start + length) / frameSeconds);
    const energy = envelope.slice(Math.max(0, index - 3), index + 1).reduce((a,b) => a+b, 0) / 4;
    const cost = energy + Math.abs(length - target) / Math.max(0.1, target) * before.rms * 0.12;
    if (cost < bestCost) { bestCost = cost; bestLength = length; }
  }
  const offset = Math.round(start * sampleRate) * channels;
  const cut = samples.slice(offset, offset + Math.round(bestLength * sampleRate) * channels);
  const fadeIn = p.event === 'homeBgm' ? 0.35 : 0.015;
  const fadeOut = p.event === 'homeBgm' ? 0.75 : Math.min(0.24, bestLength * 0.22);
  const frameCount = cut.length / channels;
  for (let i = 0; i < frameCount; i++) {
    const t = i / sampleRate;
    const gain = Math.min(1, t / fadeIn, (frameCount - 1 - i) / sampleRate / fadeOut);
    for (let c = 0; c < channels; c++) cut[i * channels + c] *= Math.max(0, gain);
  }
  const cutStats = stats(cut);
  const targetDb = p.event === 'homeBgm' ? -23 : p.event === 'discovery' ? -24 : -21;
  const gain = Math.min(10 ** (targetDb / 20) / cutStats.rms, 0.45 / cutStats.peak, 8);
  for (let i = 0; i < cut.length; i++) cut[i] *= gain;
  const temp = path.join(masters, p.id + '.f32');
  const wav = path.join(masters, p.id + '.wav');
  const mp3 = path.join(destination, p.id + '.mp3');
  await fs.writeFile(temp, Buffer.from(cut.buffer, cut.byteOffset, cut.byteLength));
  run(['-y', '-f', 'f32le', '-ar', String(sampleRate), '-ac', '2', '-i', temp, '-c:a', 'pcm_s16le', wav]);
  run(['-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', String(sampleRate), '-map_metadata', '-1', mp3]);
  await fs.unlink(temp);
  const decoded = stats(decode(mp3));
  if (decoded.clippedSamples || decoded.peak >= 0.55 || decoded.rms < 0.001) throw new Error('편집 후 음량 검증 실패: ' + p.id);
  const bytes = await fs.readFile(mp3);
  clips.push({ id: p.id, title: p.title, event: p.event, src: 'audio/music/' + p.id + '.mp3',
    duration: Math.round(decoded.duration * 1000) / 1000, sha256: hash(bytes), gain: p.event === 'homeBgm' ? 0.18 : 0.6 });
  records.push({ id: p.id, seed: p.seed, rawSha256: metadata.sha256, rawDuration: before.duration,
    trimStart: Math.round(start * 1000) / 1000, trimDuration: Math.round(bestLength * 1000) / 1000,
    fadeIn, fadeOut, normalizationGain: gain, rmsDbFS: 20 * Math.log10(decoded.rms),
    peakDbFS: 20 * Math.log10(decoded.peak), clippedSamples: decoded.clippedSamples,
    bytes: bytes.length, sha256: hash(bytes) });
  console.log(p.id + ': ' + clips.at(-1).duration + '초 / peak ' + records.at(-1).peakDbFS.toFixed(1) + 'dBFS / ' + bytes.length + ' bytes');
}
const manifest = { ready: true, generatedWith: 'MLX Core / ACE-Step 1.5 XL Turbo (8-bit)', generatedAt: new Date().toISOString(), clips };
await fs.writeFile(path.join(root, 'js/music-manifest.js'), '/* MLX Core에서 만든 음악. 원본과 생성 설정은 로컬 제작 기록에 보존한다. */\nwindow.FQ = window.FQ || {};\nwindow.FQ.musicManifest = ' + JSON.stringify(manifest, null, 2) + ';\n');
await fs.writeFile(path.join(root, 'docs/artifacts/mlx-music/edit-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), method: 'onset / low-energy endpoint / gentle fades / RMS gain with peak ceiling', records }, null, 2) + '\n');
