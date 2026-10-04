/* 실제 파일과 CLI 종료 코드로 첫 배포 초기화와 기존 데이터 보호를 검사한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openAccessStore } from '../server/lib/access-store.mjs';
import { checkPrivateState, PrivateStateCheckError } from '../scripts/check-private-state.mjs';

const script = fileURLToPath(new URL('../scripts/check-private-state.mjs', import.meta.url));
async function directory(t) {
  const value = await fs.mkdtemp(path.join(os.tmpdir(), 'flagquiz-deploy-state-'));
  await fs.chmod(value, 0o700);
  t.after(() => fs.rm(value, { recursive: true, force: true }));
  return value;
}
const cli = (value, allowEmpty = false) => spawnSync(process.execPath,
  [script, '--directory', value, ...(allowEmpty ? ['--allow-empty'] : [])], { encoding: 'utf8' });

test('완전히 빈 새 볼륨은 명시적으로 허용할 때만 초기화 exit3을 반환한다', async t => {
  const value = await directory(t);
  await assert.rejects(checkPrivateState({ directory: value }), PrivateStateCheckError);
  assert.equal(cli(value).status, 1);
  assert.deepEqual(await checkPrivateState({ directory: value, allowEmpty: true }), { state: 'empty' });
  const result = cli(value, true);
  assert.equal(result.status, 3); assert.deepEqual(JSON.parse(result.stdout), { ok: true, state: 'empty' });
  assert.deepEqual(await fs.readdir(value), []);
});

test('기존 access.json은 초기화 허용 여부와 무관하게 백업 대상 exit0이고 원본을 바꾸지 않는다', async t => {
  const value = await directory(t), store = await openAccessStore({ directory: value });
  await store.close();
  const before = await fs.readFile(path.join(value, 'access.json'));
  for (const allowEmpty of [false, true]) {
    assert.deepEqual(await checkPrivateState({ directory: value, allowEmpty }), { state: 'present' });
    const result = cli(value, allowEmpty); assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), { ok: true, state: 'present' });
    assert.equal(result.stdout.includes('gmail.com'), false);
  }
  assert.deepEqual(await fs.readFile(path.join(value, 'access.json')), before);
});

test('snapshot이 없어도 SQLite·잠금·다른 파일이 남은 볼륨은 빈 새 데이터로 분류하지 않는다', async t => {
  const value = await directory(t);
  for (const filename of ['access-mutex.sqlite', 'access.lock', 'unknown.json']) {
    await fs.writeFile(path.join(value, filename), 'existing-data', { mode: 0o600 });
    const result = cli(value, true); assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).phase, 'missing-snapshot');
    assert.equal(await fs.readFile(path.join(value, filename), 'utf8'), 'existing-data');
    await fs.rm(path.join(value, filename));
  }
});

test('손상된 JSON·노출된 파일 권한·디렉터리 권한 오류는 초기화하지 않고 닫는다', async t => {
  const value = await directory(t), file = path.join(value, 'access.json');
  await fs.writeFile(file, '{broken', { mode: 0o600 });
  assert.equal(cli(value, true).status, 1);
  assert.equal(await fs.readFile(file, 'utf8'), '{broken');
  await fs.writeFile(file, '{}'); await fs.chmod(file, 0o644);
  assert.equal(cli(value, true).status, 1);
  await fs.rm(file); await fs.chmod(value, 0o755);
  assert.equal(cli(value, true).status, 1);
  await fs.chmod(value, 0o500);
  assert.equal(cli(value, true).status, 1);
  await fs.chmod(value, 0o700);
});

test('snapshot symlink·directory symlink·누락된 경로는 초기화 경로가 될 수 없다', async t => {
  const value = await directory(t), target = path.join(value, 'private-source.json');
  await fs.writeFile(target, '{"private":"do-not-print"}', { mode: 0o600 });
  await fs.symlink(target, path.join(value, 'access.json'));
  const result = cli(value, true); assert.equal(result.status, 1); assert.equal((result.stdout + result.stderr).includes('do-not-print'), false);
  const alias = value + '-alias'; await fs.symlink(value, alias); t.after(() => fs.rm(alias, { force: true }));
  assert.equal(cli(alias, true).status, 1);
  assert.equal(cli(path.join(value, 'missing'), true).status, 1);
});
