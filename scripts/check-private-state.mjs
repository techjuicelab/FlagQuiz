/* 데이터는 읽기만 한다. 새 볼륨의 완전히 빈 디렉터리만 명시적으로 초기화를 허용한다. */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPrivateSnapshot } from './verify-private-state.mjs';

export class PrivateStateCheckError extends Error {
  constructor(phase) { super('Private state check failed: ' + phase); this.phase = phase; }
}

export async function checkPrivateState({ directory, allowEmpty = false } = {}) {
  let phase = 'directory';
  try {
    if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error();
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid()) throw new Error();
    await fs.access(directory, constants.R_OK | constants.X_OK);
    phase = 'snapshot';
    try {
      await fs.lstat(path.join(directory, 'access.json'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      phase = 'missing-snapshot';
      if (allowEmpty !== true || (await fs.readdir(directory)).length !== 0) throw new Error();
      return { state: 'empty' };
    }
    await readPrivateSnapshot(path.join(directory, 'access.json'));
    return { state: 'present' };
  } catch { throw new PrivateStateCheckError(phase); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (![2, 3].includes(args.length) || args[0] !== '--directory' || (args.length === 3 && args[2] !== '--allow-empty')) {
      throw new PrivateStateCheckError('arguments');
    }
    const result = await checkPrivateState({ directory: args[1], allowEmpty: args.length === 3 });
    console.log(JSON.stringify({ ok: true, ...result }));
    process.exitCode = result.state === 'empty' ? 3 : 0;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: 'state-check-failed', phase: error instanceof PrivateStateCheckError ? error.phase : 'directory' }));
    process.exitCode = 1;
  }
}
