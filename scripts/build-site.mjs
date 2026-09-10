/* GitHub Pages에는 앱 실행에 필요한 파일만 담는다. */
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
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
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
for (const folder of ['assets', 'css', 'flags', 'js']) {
  await fs.cp(path.join(root, folder), path.join(output, folder), { recursive: true });
}
for (const file of files) {
  await fs.mkdir(path.dirname(path.join(output, file)), { recursive: true });
  await fs.copyFile(path.join(root, file), path.join(output, file));
}
console.log('배포 파일 준비 완료: Sua 음원 ' + manifest.expectedClips + '개');
