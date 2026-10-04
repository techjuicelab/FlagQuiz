/* 운영 JSON은 읽기만 한다. 검증한 사본만 별도 백업 볼륨에 원자적으로 보관한다. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { verifyPrivateState, readPrivateSnapshot, stateHash } from './verify-private-state.mjs';

const ownedDestinations = new Set();
const TIERS = { daily: 14, weekly: 8, monthly: 12 };
const SNAPSHOT = /^flagquiz-json-(\d{8})T(\d{9})Z-[a-f0-9]{12}$/;
function check(value) { if (!value) throw new Error('backup failed'); }
export class StateBackupError extends Error {
  constructor(phase) { super('Private state backup failed: ' + phase); this.phase = phase; }
}
async function durableFile(file, bytes) {
  const handle = await fs.open(file, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
async function syncDirectory(directory) {
  const handle = await fs.open(directory, 'r'); try { await handle.sync(); } finally { await handle.close(); }
}
async function prune(directory, tier, current) {
  const entries = (await fs.readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory() && SNAPSHOT.test(entry.name));
  entries.sort((a, b) => a.name === current ? -1 : b.name === current ? 1 : b.name.localeCompare(a.name));
  const periods = new Set(); let removed = 0;
  for (const entry of entries) {
    const day = SNAPSHOT.exec(entry.name)[1], period = tier === 'monthly' ? day.slice(0, 6) : day;
    if (periods.has(period) || periods.size >= TIERS[tier]) { await fs.rm(path.join(directory, entry.name), { recursive: true }); removed++; }
    else periods.add(period);
  }
  await syncDirectory(directory); return { periods: periods.size, removed };
}

export async function backupPrivateState({ source, destination, now = new Date(), temporaryRoot = os.tmpdir(), deploymentSha = process.env.DEPLOYMENT_SHA || 'unknown' } = {}) {
  let workspace, mutex, owner, phase = 'paths', result, failure;
  try {
    check(typeof source === 'string' && typeof destination === 'string' && path.isAbsolute(source) && path.isAbsolute(destination));
    check(deploymentSha === 'unknown' || /^[a-f0-9]{40}$/.test(deploymentSha));
    const sourceDirectory = await fs.realpath(path.dirname(source)), target = await fs.realpath(destination);
    check((await fs.lstat(destination)).isDirectory() && target !== sourceDirectory && !target.startsWith(sourceDirectory + path.sep) && !sourceDirectory.startsWith(target + path.sep));
    check(((await fs.stat(target)).mode & 0o077) === 0);
    phase = 'backup-lock'; check(!ownedDestinations.has(target)); ownedDestinations.add(target); owner = target;
    mutex = new DatabaseSync(path.join(target, 'backup-mutex.sqlite'), { timeout: 0 });
    mutex.exec('PRAGMA journal_mode=DELETE; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE;');
    await fs.chmod(path.join(target, 'backup-mutex.sqlite'), 0o600);
    phase = 'snapshot'; const snapshot = await readPrivateSnapshot(source);
    workspace = await fs.mkdtemp(path.join(temporaryRoot, 'flagquiz-state-backup-')); await fs.chmod(workspace, 0o700);
    const candidate = path.join(workspace, 'access.json'); await durableFile(candidate, snapshot.bytes);
    phase = 'restore-verification'; const verification = await verifyPrivateState({ source: candidate, temporaryRoot });
    const capturedAt = now.toISOString(), stamp = capturedAt.replace(/[-:.]/g, '');
    const name = 'flagquiz-json-' + stamp + '-' + randomBytes(6).toString('hex'); check(SNAPSHOT.test(name));
    const tiers = ['daily']; if (now.getUTCDay() === 0) tiers.push('weekly'); if (now.getUTCDate() === 1) tiers.push('monthly');
    const metadata = { capturedAt, deploymentSha, schemaVersion: verification.schemaVersion, sha256: stateHash(snapshot.bytes), checks: verification.checks };
    const retention = {}; phase = 'archive';
    for (const tier of tiers) {
      const bucket = path.join(target, tier); await fs.mkdir(bucket, { recursive: true, mode: 0o700 });
      check(((await fs.lstat(bucket)).mode & 0o777) === 0o700 && (await fs.lstat(bucket)).isDirectory());
      const staging = await fs.mkdtemp(path.join(bucket, '.pending-'));
      try {
        await fs.chmod(staging, 0o700);
        await durableFile(path.join(staging, 'access.json'), snapshot.bytes);
        await durableFile(path.join(staging, 'metadata.json'), JSON.stringify(metadata));
        await syncDirectory(staging); await fs.rename(staging, path.join(bucket, name)); await syncDirectory(bucket);
      } finally { await fs.rm(staging, { recursive: true, force: true }); }
      retention[tier] = await prune(bucket, tier, name);
    }
    await syncDirectory(target);
    result = { ok: true, ...metadata, tiers, retention };
  } catch { failure = new StateBackupError(phase); }
  finally {
    try { mutex?.close(); if (owner) ownedDestinations.delete(owner); if (workspace) await fs.rm(workspace, { recursive: true, force: true }); }
    catch { failure = new StateBackupError('cleanup'); }
  }
  if (failure) throw failure;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--source' || args[2] !== '--destination') throw new StateBackupError('arguments');
    console.log(JSON.stringify(await backupPrivateState({ source: args[1], destination: args[3] })));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: 'state-backup-failed', phase: error instanceof StateBackupError ? error.phase : 'paths' }));
    process.exitCode = 1;
  }
}
