/* 원본은 읽기만 하고 고유 임시 대상에서 복원·쓰기·프로세스 재시작을 검사한다. */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { openAccessStore, SUPER_ADMIN_EMAIL, QUOTAS, AccessError } from '../server/lib/access-store.mjs';

const MAX_STATE_BYTES = 4 * 1024 * 1024;
export class StateVerificationError extends Error {
  constructor(phase) { super('Private state verification failed: ' + phase); this.phase = phase; }
}
function requireCheck(value) { if (!value) throw new Error('verification failed'); }
export function stateHash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

export async function readPrivateSnapshot(source) {
  if (!path.isAbsolute(source)) throw new StateVerificationError('source');
  const handle = await fs.open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    requireCheck(stat.isFile() && stat.size > 0 && stat.size <= MAX_STATE_BYTES && (stat.mode & 0o077) === 0);
    const bytes = await handle.readFile(); requireCheck(bytes.length <= MAX_STATE_BYTES);
    return { bytes, document: JSON.parse(bytes.toString('utf8')) };
  } finally { await handle.close(); }
}

async function restartRead(directory, hash) {
  const moduleUrl = new URL('../server/lib/access-store.mjs', import.meta.url).href;
  const code = 'import fs from "node:fs/promises"; import path from "node:path"; import {createHash} from "node:crypto"; import {openAccessStore} from ' + JSON.stringify(moduleUrl) + ';' +
    'let store; try { store=await openAccessStore({directory:process.env.FLAGQUIZ_VERIFY_TARGET}); store.list();' +
    'const bytes=await fs.readFile(path.join(process.env.FLAGQUIZ_VERIFY_TARGET,"access.json"));' +
    'if(createHash("sha256").update(bytes).digest("hex")!==process.env.FLAGQUIZ_VERIFY_HASH)throw Error();' +
    'await store.close(); store=null; process.stdout.write("verified"); } catch { await store?.close(); process.exitCode=1; }';
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
      env: { FLAGQUIZ_VERIFY_TARGET: directory, FLAGQUIZ_VERIFY_HASH: hash }, stdio: ['ignore', 'pipe', 'ignore']
    });
    let output = '', settled = false;
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 5000);
    child.stdout.on('data', chunk => { output += chunk.toString(); if (output.length > 1024) child.kill('SIGKILL'); });
    function finish(ok) { if (settled) return; settled = true; clearTimeout(timer); ok ? resolve() : reject(new Error('restart failed')); }
    child.on('error', () => finish(false)); child.on('close', code => finish(code === 0 && output === 'verified'));
  });
}

export async function verifyPrivateState({ source, temporaryRoot = os.tmpdir() } = {}) {
  let workspace, store, phase = 'temporary-target', failure, result;
  try {
    workspace = await fs.mkdtemp(path.join(temporaryRoot, 'flagquiz-state-verify-'));
    await fs.chmod(workspace, 0o700);
    if (!source) {
      phase = 'fixture'; const fixture = path.join(workspace, 'fixture');
      store = await openAccessStore({ directory: fixture });
      const admin = await store.createSession({ email: SUPER_ADMIN_EMAIL, sub: 'verification-admin' });
      await store.add('verification-child@example.invalid', admin);
      await store.createSession({ email: 'verification-child@example.invalid', sub: 'verification-child' });
      await store.consumeSpeechQuota(admin); await store.close(); store = null;
      source = path.join(fixture, 'access.json');
    }
    phase = 'snapshot'; const snapshot = await readPrivateSnapshot(source);
    const backup = path.join(workspace, 'access-backup.json');
    await fs.writeFile(backup, snapshot.bytes, { flag: 'wx', mode: 0o600 });
    requireCheck(stateHash(await fs.readFile(backup)) === stateHash(snapshot.bytes));
    const restored = path.join(workspace, 'restored'); await fs.mkdir(restored, { mode: 0o700 });
    const restoredFile = path.join(restored, 'access.json');
    await fs.writeFile(restoredFile, snapshot.bytes, { flag: 'wx', mode: 0o600 });
    phase = 'restore'; store = await openAccessStore({ directory: restored });
    const users = store.list().map(({ role, ...user }) => user);
    requireCheck(isDeepStrictEqual(users, snapshot.document.users));
    requireCheck(stateHash(await fs.readFile(restoredFile)) === stateHash(snapshot.bytes));
    for (const file of [backup, restoredFile, path.join(restored, 'access-mutex.sqlite')]) requireCheck(((await fs.stat(file)).mode & 0o777) === 0o600);
    requireCheck(((await fs.stat(restored)).mode & 0o777) === 0o700);
    phase = 'single-writer'; let duplicate;
    try { duplicate = await openAccessStore({ directory: restored }); } catch (error) { requireCheck(/locked/.test(error.message)); }
    if (duplicate) { await duplicate.close(); throw new Error('duplicate writer'); }
    phase = 'write'; const owner = snapshot.document.users.find(user => user.email === SUPER_ADMIN_EMAIL);
    const admin = await store.createSession({ email: SUPER_ADMIN_EMAIL, sub: owner.sub || 'verification-admin' });
    requireCheck(store.session(admin.id)?.role === 'superadmin');
    const before = JSON.parse(await fs.readFile(restoredFile, 'utf8')), day = new Date().toISOString().slice(0, 10), month = day.slice(0, 7);
    const daily = before.quota.daily[day]?.[admin.sub] || 0, monthly = before.quota.monthly[month] || 0;
    phase = 'quota';
    try {
      const quota = await store.consumeSpeechQuota(admin);
      requireCheck(daily < QUOTAS.userDaily && monthly < QUOTAS.globalMonthly && quota.dailyUsed === daily + 1 && quota.monthlyUsed === monthly + 1);
    } catch (error) {
      requireCheck(error instanceof AccessError && error.status === 429 &&
        (daily >= QUOTAS.userDaily ? error.code === 'daily-speech-limit' : monthly >= QUOTAS.globalMonthly && error.code === 'monthly-speech-limit'));
    }
    await store.close(); store = null;
    phase = 'restart'; const persisted = await fs.readFile(restoredFile); await restartRead(restored, stateHash(persisted));
    requireCheck(isDeepStrictEqual(JSON.parse(await fs.readFile(restoredFile, 'utf8')), JSON.parse(persisted.toString('utf8'))));
    result = { ok: true, schemaVersion: snapshot.document.version,
      checks: { permissions: true, backup: true, separateRestore: true, singleWriter: true, write: true, quota: true, processRestart: true } };
  } catch { failure = new StateVerificationError(phase); }
  finally {
    try { await store?.close(); if (workspace) await fs.rm(workspace, { recursive: true, force: true }); }
    catch { failure = new StateVerificationError('cleanup'); }
  }
  if (failure) throw failure;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--source')) throw new StateVerificationError('arguments');
    console.log(JSON.stringify(await verifyPrivateState({ source: args[1] })));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: 'state-verification-failed', phase: error instanceof StateVerificationError ? error.phase : 'source' }));
    process.exitCode = 1;
  }
}
