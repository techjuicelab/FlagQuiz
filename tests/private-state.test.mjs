import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openAccessStore, SUPER_ADMIN_EMAIL } from '../server/lib/access-store.mjs';
import { verifyPrivateState, stateHash } from '../scripts/verify-private-state.mjs';
import { backupPrivateState, StateBackupError } from '../scripts/backup-private-state.mjs';

const run = promisify(execFile);
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flagquiz-backup-test-'));
  const live = path.join(root, 'live'), destination = path.join(root, 'backups'), temporaryRoot = path.join(root, 'scratch');
  await fs.mkdir(destination, { mode: 0o700 }); await fs.mkdir(temporaryRoot, { mode: 0o700 });
  const store = await openAccessStore({ directory: live });
  const admin = await store.createSession({ email: SUPER_ADMIN_EMAIL, sub: 'source-admin' });
  await store.createSession({ email: 'private-child@gmail.com', sub: 'child-sub', techjuiceRole: 'user', generation: 3 }, undefined, { trustedCentralIdentity: true });
  await store.consumeSpeechQuota(admin); await store.remove('blocked@gmail.com', admin);
  t.after(async () => { await store.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { root, live, store, admin, source: path.join(live, 'access.json'), destination, temporaryRoot };
}
async function archives(destination, tier = 'daily') { return (await fs.readdir(path.join(destination, tier))).filter(name => name.startsWith('flagquiz-json-')); }
function options(f, extra = {}) { return { source: f.source, destination: f.destination, temporaryRoot: f.temporaryRoot, ...extra }; }

test('fixture 검증은 별도 복원·쓰기·실제 프로세스 재시작을 수행하고 임시 개인정보를 정리한다', async t => {
  const f = await fixture(t), result = await verifyPrivateState({ temporaryRoot: f.temporaryRoot });
  assert.equal(result.ok, true); assert.ok(Object.values(result.checks).every(value => value === true));
  assert.deepEqual(await fs.readdir(f.temporaryRoot), []);
  const cli = new URL('../scripts/verify-private-state.mjs', import.meta.url);
  const response = await run(process.execPath, [cli.pathname], { env: { GROQ_API_KEY: 'secret-must-not-print', SESSION_SECRET: 'other-secret-must-not-print' } });
  assert.equal(JSON.parse(response.stdout).checks.processRestart, true);
  assert.doesNotMatch(response.stdout + response.stderr, /secret-must-not-print|@|source-admin|child-sub/);
});

test('온라인 백업은 잠금 중인 운영 원본을 바꾸지 않고 권한·차단 목록·generation·quota 를 보존한다', async t => {
  const f = await fixture(t), before = await fs.readFile(f.source), stat = await fs.stat(f.source);
  const result = await backupPrivateState(options(f, { now: new Date('2026-10-03T02:03:04.005Z'), deploymentSha: 'a'.repeat(40) }));
  assert.equal(result.ok, true); assert.deepEqual(result.tiers, ['daily']); assert.equal(result.deploymentSha, 'a'.repeat(40));
  assert.deepEqual(await fs.readFile(f.source), before); assert.equal((await fs.stat(f.source)).mtimeMs, stat.mtimeMs);
  assert.ok(f.store.session(f.admin.id)); assert.equal(result.sha256, stateHash(before));
  const name = (await archives(f.destination))[0], saved = path.join(f.destination, 'daily', name);
  assert.deepEqual(await fs.readFile(path.join(saved, 'access.json')), before);
  assert.equal((await fs.stat(saved)).mode & 0o777, 0o700);
  for (const file of ['access.json', 'metadata.json']) assert.equal((await fs.stat(path.join(saved, file))).mode & 0o777, 0o600);
  const metadata = JSON.parse(await fs.readFile(path.join(saved, 'metadata.json'), 'utf8'));
  assert.equal(metadata.sha256, result.sha256); assert.equal(metadata.checks.processRestart, true);
  assert.doesNotMatch(JSON.stringify(result) + JSON.stringify(metadata), /private-child|blocked@gmail|source-admin|child-sub/);
  assert.deepEqual(await fs.readdir(f.temporaryRoot), []);
});

test('일14·주8·월12 기간을 유지하며 같은 기간의 수동 백업은 마지막 검증본으로 교체한다', async t => {
  const f = await fixture(t), bytes = await fs.readFile(f.source);
  for (const [tier, count] of [['daily', 16], ['weekly', 9], ['monthly', 13]]) {
    const bucket = path.join(f.destination, tier); await fs.mkdir(bucket, { mode: 0o700 });
    for (let i = 0; i < count; i++) {
      const date = tier === 'monthly' ? new Date(Date.UTC(2025, i, 1)) : new Date(Date.UTC(2025, 0, tier === 'weekly' ? 5 + i * 7 : i + 1));
      const name = 'flagquiz-json-' + date.toISOString().replace(/[-:.]/g, '') + '-000000000000';
      const directory = path.join(bucket, name); await fs.mkdir(directory, { mode: 0o700 });
      await fs.writeFile(path.join(directory, 'access.json'), bytes, { mode: 0o600 });
      await fs.writeFile(path.join(directory, 'metadata.json'), '{}', { mode: 0o600 });
    }
  }
  const now = new Date('2026-02-01T03:04:05.006Z');
  const result = await backupPrivateState(options(f, { now })); assert.deepEqual(result.tiers, ['daily', 'weekly', 'monthly']);
  for (const [tier, limit] of [['daily', 14], ['weekly', 8], ['monthly', 12]]) assert.equal((await archives(f.destination, tier)).length, limit);
  const later = new Date('2026-02-01T04:04:05.006Z'); await backupPrivateState(options(f, { now: later }));
  for (const [tier, limit] of [['daily', 14], ['weekly', 8], ['monthly', 12]]) {
    const names = await archives(f.destination, tier); assert.equal(names.length, limit);
    const fresh = names.filter(name => name.includes('20260201')); assert.equal(fresh.length, 1); assert.match(fresh[0], /T040405006Z/);
  }
});

test('손상·비정상 차단 목록은 기존 백업과 원본을 보존하며 실패하고 운영 경로는 백업 대상으로 거절한다', async t => {
  const f = await fixture(t); await backupPrivateState(options(f));
  const retained = await archives(f.destination), saved = await fs.readFile(path.join(f.destination, 'daily', retained[0], 'access.json'));
  for (const bytes of [Buffer.from('{private-corruption-marker'), Buffer.from(JSON.stringify({ ...JSON.parse(saved), blockedEmails: ['bad-email'] }))]) {
    await fs.writeFile(f.source, bytes);
    await assert.rejects(backupPrivateState(options(f)), error => error instanceof StateBackupError && ['snapshot', 'restore-verification'].includes(error.phase));
    assert.deepEqual(await fs.readFile(f.source), bytes); assert.deepEqual(await archives(f.destination), retained);
    assert.deepEqual(await fs.readFile(path.join(f.destination, 'daily', retained[0], 'access.json')), saved);
    assert.deepEqual(await fs.readdir(f.temporaryRoot), []);
  }
  await assert.rejects(backupPrivateState(options(f, { destination: f.live })), error => error.phase === 'paths');
  const cli = new URL('../scripts/backup-private-state.mjs', import.meta.url);
  await assert.rejects(run(process.execPath, [cli.pathname, '--source', f.source, '--destination', f.destination]), error => {
    assert.doesNotMatch(error.stdout + error.stderr, /private-corruption-marker|bad-email|private-child|source-admin/); return true;
  });
});

test('같은 백업 대상 동시 실행은 한 작업만 받아 서로의 보관·정리를 훼손하지 않는다', async t => {
  const f = await fixture(t), results = await Promise.allSettled([backupPrivateState(options(f)), backupPrivateState(options(f))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.phase, 'backup-lock');
  assert.equal((await archives(f.destination)).length, 1);
});
