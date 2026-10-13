/* 수도 좌표 원자료만 명시적으로 준비한다. 앱 빌드와 테스트는 네트워크를 사용하지 않는다. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const ngaQuery = (where) => 'https://geonames.nga.mil/geon-ags/rest/services/RESEARCH/GIS_OUTPUT/MapServer/0/query?' +
  new URLSearchParams({ where, outFields: 'ufi,uni,lat_dd,long_dd,desig_cd,full_name,full_nm_nd,nt,cc_ft,cc_nm,mod_dt_ft,mod_dt_nm',
    returnGeometry: 'true', f: 'json' });

export const CAPITAL_SOURCES = Object.freeze({
  'natural-earth': {
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_populated_places_simple.geojson',
    path: 'data/natural-earth/ne_10m_populated_places_simple.geojson', version: 'v5.1.2',
    sha256: 'fd3fa867a320cbd5c5b6bb5bc550afeec2939fb2cef688e508007282a55ac42f',
    license: 'Public domain', licenseUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
    description: 'Natural Earth 10m populated_places_simple; geometry.coordinates 도시 대표점'
  },
  'nga-ngerulmud': {
    url: ngaQuery("full_nm_nd = 'Ngerulmud'"), path: 'data/natural-earth/nga-ngerulmud.json', version: '2026-10-13 snapshot',
    sha256: 'a999a90c3d0f6d9c7aa0bdd8df9a0cf4e51fcac4b8eb8bbe477c4b582c912d89',
    license: 'No licensing requirements or restrictions', licenseUrl: 'https://geonames.nga.mil/geonames/GNSHome/',
    description: 'NGA GNS; Palau Ngerulmud, UFI 13976139, PPLC'
  },
  'nga-yaren': {
    url: ngaQuery("full_nm_nd = 'Yaren'"), path: 'data/natural-earth/nga-yaren.json', version: '2026-10-13 snapshot',
    sha256: '0505fb641ac66de5eead0a71b28d67ebb3e08f2d444970263b41d344e026b7c6',
    license: 'No licensing requirements or restrictions', licenseUrl: 'https://geonames.nga.mil/geonames/GNSHome/',
    description: 'NGA GNS; Nauru Yaren district, UFI -1187314, ADM1; 국가 대표점으로 대체하지 않는다'
  },
  'nga-ciudad-de-la-paz': {
    url: ngaQuery("full_nm_nd = 'Ciudad de la Paz' AND cc_ft = 'GNQ'"), path: 'data/natural-earth/nga-ciudad-de-la-paz.json',
    version: '2026-10-13 snapshot', sha256: 'b48b5b7b30f11330abae0be4de15be41c9dbcfae64d193ef7911c2aa2dfd0dc7',
    license: 'No licensing requirements or restrictions', licenseUrl: 'https://geonames.nga.mil/geonames/GNSHome/',
    description: 'NGA GNS; Ciudad de la Paz, UFI 14999106; 앱 수도 명칭이 일치할 때만 사용'
  }
});

export function verifyCapitalSource(bytes, sourceKey) {
  const source = CAPITAL_SOURCES[sourceKey];
  if (!source) throw new Error('알 수 없는 수도 원자료: ' + sourceKey);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== source.sha256) throw new Error('수도 원자료 SHA-256 불일치: ' + sourceKey + '\n기대: ' + source.sha256 + '\n실제: ' + actual);
  const data = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(data.features) || (sourceKey === 'natural-earth' && data.features.length < 7000)) {
    throw new Error('수도 원자료의 도형 목록이 유효하지 않습니다: ' + sourceKey);
  }
  return data;
}

export async function fetchCapitalSources({ refresh = false } = {}) {
  for (const [key, source] of Object.entries(CAPITAL_SOURCES)) {
    const target = path.join(root, source.path);
    if (!refresh) {
      try { verifyCapitalSource(await fs.readFile(target), key); console.log('수도 원자료 검증 완료: ' + key); continue; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const response = await fetch(source.url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('수도 원자료 다운로드 실패: ' + key + ' HTTP ' + response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    verifyCapitalSource(bytes, key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target + '.tmp', bytes);
    await fs.rename(target + '.tmp', target);
    console.log('수도 원자료 저장 완료: ' + key + ' (' + bytes.length + 'B)');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--refresh')) { console.error('사용법: node scripts/fetch-capital-source.mjs [--refresh]'); process.exitCode = 1; }
  else try { await fetchCapitalSources({ refresh: args.includes('--refresh') }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
