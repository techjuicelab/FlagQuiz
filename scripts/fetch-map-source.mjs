/* Natural Earth 원자료만 내려받는다. 앱 빌드와 테스트에는 네트워크를 연결하지 않는다. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const SOURCE_VERSION = 'v5.1.2';
export const SOURCE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson';
export const EXPECTED_SHA256 = '3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb';
export const SOURCE_RELATIVE_PATH = 'data/natural-earth/ne_50m_admin_0_countries.geojson';
const root = fileURLToPath(new URL('../', import.meta.url));

export function verifySource(bytes) {
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== EXPECTED_SHA256) {
    throw new Error('지도 원자료 SHA-256 불일치\n기대: ' + EXPECTED_SHA256 + '\n실제: ' + actual);
  }
  const data = JSON.parse(bytes.toString('utf8'));
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length < 240) {
    throw new Error('지도 원자료는 도형 240개 이상의 FeatureCollection이어야 합니다.');
  }
  return data;
}

export async function fetchSource({ refresh = false } = {}) {
  const target = path.join(root, SOURCE_RELATIVE_PATH);
  if (!refresh) {
    try {
      const bytes = await fs.readFile(target);
      const data = verifySource(bytes);
      console.log('지도 원자료 검증 완료: ' + data.features.length + '개 도형 (기존 파일)');
      return data;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('지도 원자료 다운로드 실패: HTTP ' + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  const data = verifySource(bytes);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target + '.tmp', bytes);
  await fs.rename(target + '.tmp', target);
  console.log('지도 원자료 저장 완료: ' + data.features.length + '개 도형, ' + bytes.length + '바이트');
  return data;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--refresh')) {
    console.error('사용법: npm run map:fetch -- [--refresh]');
    process.exitCode = 1;
  } else {
    try { await fetchSource({ refresh: args.includes('--refresh') }); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
