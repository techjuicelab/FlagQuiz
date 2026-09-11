/* GitHub Pages에는 앱 실행에 필요한 파일만 담는다. */
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '_site');
const context = { window: {} };
vm.runInNewContext(await fs.readFile(path.join(root, 'js/voice-manifest.js'), 'utf8'), context);
const manifest = context.window.FQ.voiceManifest;
if (!manifest?.ready || Object.keys(manifest.clips).length !== manifest.expectedClips) {
  throw new Error('전체 음원이 준비되어야 배포할 수 있습니다.');
}
const files = ['index.html', 'sw.js', 'manifest.webmanifest', 'data/countries.js'];
for (const clip of Object.values(manifest.clips)) {
  if (!/^audio\/[a-z0-9-]+\/[a-f0-9]+\.mp3$/.test(clip.src)) throw new Error('음원 경로를 확인하세요.');
  files.push(clip.src);
}
// 음악 생성이 덜 끝났거나 목록과 다른 파일이면 기존 배포 묶음을 지우기 전에 멈춘다.
vm.runInNewContext(await fs.readFile(path.join(root, 'js/music-manifest.js'), 'utf8'), context);
const music = context.window.FQ.musicManifest;
const expectedEvents = { chest: 6, discovery: 3, correct: 2, sticker: 1, level: 1, finish: 1, start: 1, homeBgm: 1 };
if (!music?.ready || !Array.isArray(music.clips) || music.clips.length !== 16) {
  throw new Error('새 음악 16개가 모두 준비되어야 배포할 수 있습니다.');
}
const ids = new Set(), sources = new Set(), counts = {};
for (const clip of music.clips) {
  if (!/^[a-z0-9-]+$/.test(clip.id) || clip.src !== 'audio/music/' + clip.id + '.mp3' ||
      !Object.hasOwn(expectedEvents, clip.event) || !Number.isFinite(clip.duration) || clip.duration <= 0 ||
      !/^[a-f0-9]{64}$/.test(clip.sha256) ||
      (clip.gain !== undefined && (!Number.isFinite(clip.gain) || clip.gain <= 0 || clip.gain > 1))) {
    throw new Error('음악 목록의 경로·길이·해시를 확인하세요.');
  }
  if (ids.has(clip.id) || sources.has(clip.src)) throw new Error('음악 목록에 중복 파일이 있습니다.');
  ids.add(clip.id); sources.add(clip.src);
  counts[clip.event] = (counts[clip.event] || 0) + 1;
  const fullPath = path.join(root, clip.src);
  const stat = await fs.lstat(fullPath);
  const realPath = await fs.realpath(fullPath);
  if (!stat.isFile() || !realPath.startsWith(path.join(root, 'audio/music') + path.sep)) {
    throw new Error('음악은 audio/music 안의 일반 파일이어야 합니다.');
  }
  const bytes = await fs.readFile(fullPath);
  if (!bytes.length || createHash('sha256').update(bytes).digest('hex') !== clip.sha256) {
    throw new Error('음악 파일이 생성 목록과 다릅니다: ' + clip.id);
  }
  files.push(clip.src);
}
for (const [event, count] of Object.entries(expectedEvents)) {
  if (counts[event] !== count) throw new Error('음악 이벤트의 곡 수를 확인하세요: ' + event);
}
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
for (const folder of ['assets', 'css', 'flags', 'js']) {
  await fs.cp(path.join(root, folder), path.join(output, folder), { recursive: true });
}
for (const file of files) {
  await fs.mkdir(path.dirname(path.join(output, file)), { recursive: true });
  await fs.copyFile(path.join(root, file), path.join(output, file));
}
console.log('배포 파일 준비 완료: Sua 음원 ' + manifest.expectedClips + '개, 새 음악 ' + music.clips.length + '개');
