/* Compose가 해석한 JSON을 stdin으로만 검사한다. 서버 실행·데이터 생성·외부 호출은 하지 않는다. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../server/auth-server.mjs';

export const MAX_CONFIG_BYTES = 64 * 1024;
export class PrivateConfigCheckError extends Error {
  constructor() { super('Private config check failed'); }
}

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

export function checkPrivateComposeConfig(document) {
  try {
    const environment = document?.services?.web?.environment;
    if (!object(document) || !object(document.services) || !object(document.services.web) || !object(environment)) throw new Error();
    const env = Object.create(null);
    for (const [name, value] of Object.entries(environment)) {
      if (typeof value !== 'string') throw new Error();
      // Compose config는 재사용할 출력에서 모든 $를 $$로 바꾼다. 실행 환경 값으로 한 번 복원한다.
      if (value.replaceAll('$$', '').includes('$')) throw new Error();
      env[name] = value.replaceAll('$$', '$');
    }
    const config = readConfig(env);
    if (!config.ready || !config.groqApiKey) throw new Error();
    return { ok: true };
  } catch { throw new PrivateConfigCheckError(); }
}

export async function readPrivateComposeConfig(stream) {
  try {
    const chunks = []; let size = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_CONFIG_BYTES) throw new Error();
      chunks.push(bytes);
    }
    const json = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    return checkPrivateComposeConfig(JSON.parse(json));
  } catch { throw new PrivateConfigCheckError(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error();
    await readPrivateComposeConfig(process.stdin);
    console.log('운영 설정 검사 통과');
  } catch {
    console.error('운영 설정 검사 실패');
    process.exitCode = 1;
  }
}
