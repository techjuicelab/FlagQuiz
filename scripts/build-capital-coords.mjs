/* 앱의 수도 이름과 실제 도시를 연결한다. 국가의 지도 라벨은 수도 좌표로 사용하지 않는다. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { CAPITAL_SOURCES, verifyCapitalSource } from './fetch-capital-source.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const CAPITAL_NAME_ALIASES = Object.freeze({
  ad: { capitalEn: 'Andorra la Vella', sourceName: 'Andorra' },
  dk: { capitalEn: 'Copenhagen', sourceName: 'København' },
  ag: { capitalEn: "St. John's", sourceName: "Saint John's" },
  gd: { capitalEn: "St. George's", sourceName: "Saint George's" }
});
export const CAPITAL_OVERRIDES = Object.freeze({
  nr: { capitalEn: 'Yaren', source: 'nga-yaren', sourceId: -1187314, country: 'NRU', designation: 'ADM1',
    note: '나우루에는 공식 수도가 없으며 앱이 학습하는 정부 소재 지역 Yaren의 실제 대표점을 표시한다. UNECE UN/LOCODE NR YRN도 Yaren을 확인한다.',
    corroboration: 'https://service.unece.org/trade/locode/nr.htm' },
  pw: { capitalEn: 'Ngerulmud', source: 'nga-ngerulmud', sourceId: 13976139, country: 'PLW', designation: 'PPLC',
    note: 'Natural Earth의 Melekeok 도시점을 응게룰무드로 대체하지 않고, NGA의 동명 수도점을 사용한다.' },
  gq: { capitalEn: 'Ciudad de la Paz', source: 'nga-ciudad-de-la-paz', sourceId: 14999106, country: 'GNQ', designation: 'PPLA',
    note: '2026-01-02 정부 수도 선언. 앱의 수도 명칭이 Ciudad de la Paz일 때만 이 좌표를 사용한다.',
    corroboration: 'https://www.guineaecuatorialpress.com/index.php/noticias/el_presidente_de_la_republica_proclama_la_ciudad_de_la_paz_como_capital_de_la_republica_de_guinea_ecuatorial_con_la_firma_de_un_decreto_ley' }
});
export const CAPITAL_GEOMETRY_NOTES = Object.freeze({
  cy: {
    capitalEn: 'Nicosia',
    geometryException: 'cyprus-un-buffer-zone',
    note: 'Natural Earth 10m은 이 수도 도시점을 Cyprus U.N. Buffer Zone 도형에 포함한다. 국가 영역 안으로 보이게 하려고 실제 도시점을 이동하지 않는다. NGA PPLC 동명 도시점도 Natural Earth의 키프로스 본국 영역 밖이므로 대체하지 않았다.',
    geometrySource: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson'
  }
});

export function normalizeCapitalName(name) {
  return String(name || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function validCoordinate(point) {
  return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) &&
    Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
}

export function buildCapitalCoordinates(countries, places, supplemental = {}) {
  const coords = {}, sources = {}, usedCodes = new Set();
  for (const country of [...countries].sort((a, b) => a.code.localeCompare(b.code))) {
    if (!/^[a-z]{2}$/.test(country.code) || usedCodes.has(country.code)) throw new Error('수도 좌표 국가 코드 형식 또는 중복: ' + country.code);
    if (!country.capital || !country.capitalEn) throw new Error('앱의 수도 이름이 없습니다: ' + country.code);
    usedCodes.add(country.code);
    const override = CAPITAL_OVERRIDES[country.code];
    const supplement = override && normalizeCapitalName(override.capitalEn) === normalizeCapitalName(country.capitalEn);
    let coordinate, metadata;
    if (supplement) {
      const features = supplemental[override.source] && supplemental[override.source].features;
      const matches = (features || []).filter(({ attributes: a }) => a && a.ufi === override.sourceId &&
        a.cc_ft === override.country && a.desig_cd === override.designation && a.nt === 'N' &&
        normalizeCapitalName(a.full_name) === normalizeCapitalName(country.capitalEn));
      if (matches.length !== 1) throw new Error('공공 보정 자료의 수도 이름·국가·식별자가 일치하지 않습니다: ' + country.code);
      const a = matches[0].attributes;
      coordinate = [a.long_dd, a.lat_dd];
      metadata = { source: override.source, sourceName: a.full_name, sourceId: a.ufi, nameId: a.uni,
        sourceCountry: a.cc_ft, sourceDesignation: a.desig_cd, match: 'exact-name-and-government-id',
        note: override.note, ...(override.corroboration ? { corroboration: override.corroboration } : {}) };
    } else {
      const alias = CAPITAL_NAME_ALIASES[country.code];
      const name = alias && normalizeCapitalName(alias.capitalEn) === normalizeCapitalName(country.capitalEn) ? alias.sourceName : country.capitalEn;
      let matches = places.filter(({ properties: p }) => p && String(p.iso_a2).toLowerCase() === country.code &&
        [p.name, p.nameascii, p.namealt].some((value) => normalizeCapitalName(value) === normalizeCapitalName(name)));
      let match = name === country.capitalEn ? 'city-name-and-iso' : 'explicit-city-alias-and-iso';
      if (matches.length > 1) {
        const capitals = matches.filter(({ properties: p }) => p.adm0cap === 1);
        if (capitals.length === 1) { matches = capitals; match += '-capital-flag-disambiguated'; }
      }
      if (matches.length !== 1) throw new Error('수도 도시를 하나로 매칭하지 못했습니다: ' + country.code + '/' + country.capitalEn + ' (' + matches.length + '개)');
      const feature = matches[0], p = feature.properties;
      if (feature.geometry.type !== 'Point') throw new Error('수도 도시가 Point가 아닙니다: ' + country.code);
      coordinate = feature.geometry.coordinates;
      metadata = { source: 'natural-earth', sourceName: p.name, sourceId: p.ne_id, sourceCountry: p.iso_a2,
        sourceDesignation: p.featurecla, match };
    }
    if (!validCoordinate(coordinate)) throw new Error('수도 경위도가 유효하지 않습니다: ' + country.code);
    const geometryNote = CAPITAL_GEOMETRY_NOTES[country.code];
    if (geometryNote && normalizeCapitalName(geometryNote.capitalEn) === normalizeCapitalName(country.capitalEn)) {
      const { capitalEn, ...details } = geometryNote;
      metadata = { ...metadata, ...details };
    }
    coords[country.code] = coordinate.map((value) => Number(value.toFixed(6)));
    sources[country.code] = { capital: country.capital, capitalEn: country.capitalEn, ...metadata };
  }
  return { coords, sources };
}

export function prepareCapitalCoordinates() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'data/countries.js'), 'utf8'), context, { filename: 'data/countries.js' });
  const data = {};
  for (const [key, source] of Object.entries(CAPITAL_SOURCES)) {
    let bytes;
    try { bytes = fs.readFileSync(path.join(root, source.path)); }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error('수도 원자료가 없습니다. node scripts/fetch-capital-source.mjs 를 먼저 실행하세요.');
      throw error;
    }
    data[key] = verifyCapitalSource(bytes, key);
  }
  const countries = context.window.FQ.countries;
  if (countries.length !== 194) throw new Error('수도 좌표 대상 나라가 194개가 아닙니다.');
  const result = buildCapitalCoordinates(countries, data['natural-earth'].features, data);
  if (Object.keys(result.coords).length !== countries.length || Object.keys(result.sources).length !== countries.length) {
    throw new Error('수도 좌표·도시 출처의 국가 목록이 일치하지 않습니다.');
  }
  return result;
}

export function emitCapitalCoordinates() {
  const result = prepareCapitalCoordinates();
  const sourceInfo = Object.fromEntries(Object.entries(CAPITAL_SOURCES).map(([key, source]) => [key,
    { url: source.url, version: source.version, sha256: source.sha256, license: source.license, licenseUrl: source.licenseUrl, description: source.description }]));
  const header = '// 출처: Natural Earth 10m populated_places_simple v5.1.2 및 미국정부 NGA GNS\n' +
    '// 라이선스: Natural Earth 퍼블릭 도메인; NGA GNS 사용 제한 없음\n' +
    '// 좌표 순서: [lng, lat], 소수 여섯째 자리. 나라 대표점이 아닌 앱에 적힌 수도 도시의 실제 좌표.\n' +
    '// 재생성: node scripts/fetch-capital-source.mjs && node scripts/build-capital-coords.mjs\n' +
    '// 이 파일은 생성물입니다. 손으로 고치지 마세요.\n';
  const text = header + 'window.FQ = window.FQ || {};\n' +
    'window.FQ.capitalCoords = ' + JSON.stringify(result.coords) + ';\n' +
    'window.FQ.capitalCoordSources = ' + JSON.stringify(result.sources) + ';\n' +
    'window.FQ.capitalCoordMeta = ' + JSON.stringify({ coordinateOrder: ['lng', 'lat'], decimalPlaces: 6, sources: sourceInfo }) + ';\n';
  fs.writeFileSync(path.join(root, 'data/capital-coords.js'), text);
  return { countries: Object.keys(result.coords).length, bytes: Buffer.byteLength(text),
    sourceCounts: Object.values(result.sources).reduce((counts, source) => { counts[source.source] = (counts[source.source] || 0) + 1; return counts; }, {}) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(emitCapitalCoordinates(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
