import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const build = new URL('../scripts/build-site.mjs', import.meta.url);
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flagquiz-music-build-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const folder of ['scripts', 'js', 'assets', 'css', 'flags', 'data', 'audio/sua', 'audio/music', '_site']) await fs.mkdir(path.join(root, folder), { recursive: true });
  await fs.copyFile(build, path.join(root, 'scripts/build-site.mjs'));
  for (const file of ['index.html', 'sw.js', 'manifest.webmanifest', 'data/countries.js']) await fs.writeFile(path.join(root, file), file);
  await fs.writeFile(path.join(root, 'js/voice-manifest.js'), 'window.FQ={voiceManifest:{ready:true,expectedClips:1,clips:{hello:{src:"audio/sua/abcdef.mp3"}}}};');
  await fs.writeFile(path.join(root, 'audio/sua/abcdef.mp3'), 'voice');
  await fs.writeFile(path.join(root, '_site/previous-release'), 'preserve on validation failure');
  const events = { chest: 6, discovery: 3, correct: 2, sticker: 1, level: 1, finish: 1, start: 1, homeBgm: 1 };
  const clips = [];
  for (const [event, count] of Object.entries(events)) for (let n = 1; n <= count; n++) {
    const id = event.toLowerCase() + '-' + n;
    const bytes = Buffer.from('music-' + id);
    const src = 'audio/music/' + id + '.mp3';
    await fs.writeFile(path.join(root, src), bytes);
    clips.push({ id, event, src, duration: 2, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const manifest = { ready: true, clips };
  return { root, manifest, async run() {
    await fs.writeFile(path.join(root, 'js/music-manifest.js'), 'window.FQ.musicManifest=' + JSON.stringify(manifest) + ';');
    return spawnSync(process.execPath, ['scripts/build-site.mjs'], { cwd: root, encoding: 'utf8' });
  } };
}

test('검증된 음악 16개만 배포하고 원본·제작 문서·목록 밖 파일은 포함하지 않는다', async t => {
  const env = await fixture(t);
  await fs.writeFile(path.join(env.root, 'audio/music/not-in-manifest.mp3'), 'do not publish');
  await fs.writeFile(path.join(env.root, 'audio/music/source.wav'), 'do not publish');
  await fs.writeFile(path.join(env.root, 'audio/music/ledger.json'), '{}');
  const result = await env.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal((await fs.readdir(path.join(env.root, '_site/audio/music'))).length, 16);
  for (const clip of env.manifest.clips) assert.deepEqual(await fs.readFile(path.join(env.root, '_site', clip.src)), await fs.readFile(path.join(env.root, clip.src)));
  await assert.rejects(fs.access(path.join(env.root, '_site/previous-release')));
});

test('미완성·중복·경로탈출·해시불일치·빠진파일·잘못된event는 기존 배포 묶음을 보존하고 거부한다', async t => {
  for (const variant of ['unready', 'duplicate', 'traversal', 'hash', 'missing', 'event-count', 'duration', 'symlink']) {
    await t.test(variant, async t => {
      const env = await fixture(t);
      const clip = env.manifest.clips[0];
      if (variant === 'unready') env.manifest.ready = false;
      if (variant === 'duplicate') env.manifest.clips[1] = clip;
      if (variant === 'traversal') clip.src = '../private.mp3';
      if (variant === 'hash') clip.sha256 = '0'.repeat(64);
      if (variant === 'missing') await fs.rm(path.join(env.root, clip.src));
      if (variant === 'event-count') clip.event = 'start';
      if (variant === 'duration') clip.duration = -1;
      if (variant === 'symlink') {
        await fs.rename(path.join(env.root, clip.src), path.join(env.root, 'source.mp3'));
        await fs.symlink(path.join(env.root, 'source.mp3'), path.join(env.root, clip.src));
      }
      const result = await env.run();
      assert.notEqual(result.status, 0, variant);
      assert.equal(await fs.readFile(path.join(env.root, '_site/previous-release'), 'utf8'), 'preserve on validation failure', variant);
    });
  }
});
