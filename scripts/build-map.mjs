/* 지도 자산 빌드. 앱 빌드와 분리되어 원자료를 명시적으로 준비한 경우만 실행한다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_RELATIVE_PATH, SOURCE_VERSION, verifySource } from './fetch-map-source.mjs';
import { joinFeatures, readCountryCodes } from './lib/ne-join.mjs';
import { exteriorRings, largestRing, ringBounds, assertDateline, topologySimplifier } from './lib/simplify.mjs';

// 0.7°의 육안 검사에서 한반도·일본·반도 해안이 거칠어, HANDOFF의 허용 대안 0.5°를 채택.
export const SIMPLIFY_TOLERANCE_DEG = 0.5;
const root = fileURLToPath(new URL('../', import.meta.url));

export function buildLand(features, matched, tolerance = SIMPLIFY_TOLERANCE_DEG) {
  const protectedRings = new Set([...matched.values()].map(largestRing));
  const countryByFeature = new Map([...matched].map(([code, feature]) => [feature, code]));
  const includedCountries = new Set();
  const parts = [];
  const topology = topologySimplifier(features, tolerance);
  let sourcePoints = 0, outputPoints = 0, outputRings = 0;
  // 국가를 먼저 코드순, 나머지 육지는 ADMIN순으로 돌려 출력 순서를 고정한다.
  const ordered = [...features].sort((a, b) => {
    const aa = countryByFeature.get(a), bb = countryByFeature.get(b);
    const ka = aa ? '0:' + aa : '1:' + a.properties.ADMIN;
    const kb = bb ? '0:' + bb : '1:' + b.properties.ADMIN;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  for (const feature of ordered) {
    for (const ring of exteriorRings(feature)) {
      sourcePoints += ring.length;
      assertDateline(ring, feature.properties.ADMIN);
      const bbox = ringBounds(ring);
      const protect = protectedRings.has(ring);
      if (!protect && bbox[2] - bbox[0] < tolerance && bbox[3] - bbox[1] < tolerance) continue;
      let reduced = topology.simplifyRing(ring);
      if (reduced.length < 4) {
        if (!protect) continue;
        const [west, south, east, north] = bbox;
        reduced = [[west, south], [east, south], [east, north], [west, north], [west, south]];
        // nonzero fill에서 이웃 육지를 지우지 않도록 원본 외곽의 방향을 보존한다.
        const signedArea = ring.reduce((sum, point, index) => index ? sum + ring[index - 1][0] * point[1] - point[0] * ring[index - 1][1] : sum, 0);
        if (signedArea < 0) reduced.reverse();
      }
      const points = reduced.map(([lng, lat]) => [Number(((lng + 180) / 360 * 2000).toFixed(1)), Number(((90 - lat) / 180 * 1000).toFixed(1))]);
      parts.push(points.map((point, index) => (index ? 'L' : 'M') + point.join(' ')).join('') + 'Z');
      outputPoints += points.length; outputRings++;
      const code = countryByFeature.get(feature);
      if (code) includedCountries.add(code);
    }
  }
  const missing = [...matched.keys()].filter((code) => !includedCountries.has(code));
  if (missing.length) throw new Error('지도 실루엣에서 빠진 국가: ' + missing.join(', '));
  for (const code of ['sg', 'mc', 'va', 'tv']) if (!includedCountries.has(code)) throw new Error('작은 나라 보존 실패: ' + code);
  const mapLand = { viewBox: '0 0 2000 1000', d: parts.join('') };
  if (Buffer.byteLength(JSON.stringify(mapLand)) >= 250000) throw new Error('지도 실루엣이 250KB를 넘었습니다.');
  return { mapLand, stats: { sourcePoints, outputPoints, outputRings, preservedCountries: includedCountries.size, ...topology.stats } };
}

export function prepareMap() {
  const source = verifySource(fs.readFileSync(path.join(root, SOURCE_RELATIVE_PATH)));
  const joined = joinFeatures(source.features, readCountryCodes(root));
  return { source, ...joined, ...buildLand(source.features, joined.matched) };
}


export const LABEL_OVERRIDES = Object.freeze({
  // 원본 LABEL_X/LABEL_Y를 이동한 국가는 없다. 향후 보정은 근거와 함께 명시한다.
});
export const LABEL_VALIDATION_EXCEPTIONS = Object.freeze({
  // 원본 LABEL은 수마트라 안에 있지만 최대 면적 링은 칼리만탄이다.
  // 좌표를 옮기지 않고 원본의 라벨 포함 링을 검증해 D3의 LABEL 보존 계약을 지킨다.
  id: '라벨을 포함하는 수마트라 링으로 검증'
});

function inBounds([lng, lat], [west, south, east, north], padding = 0) {
  return lng >= west - padding && lng <= east + padding && lat >= south - padding && lat <= north + padding;
}

export function pointInRing([lng, lat], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > lat) !== (b[1] > lat) && lng < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function buildCoordinates(matched, { overrides = LABEL_OVERRIDES, exceptions = LABEL_VALIDATION_EXCEPTIONS } = {}) {
  const coords = {};
  const errors = [];
  for (const code of [...matched.keys()].sort()) {
    const feature = matched.get(code);
    const label = overrides[code] || [feature.properties.LABEL_X, feature.properties.LABEL_Y];
    if (!Array.isArray(label) || label.length !== 2 || !label.every(Number.isFinite) || !inBounds(label, [-180, -90, 180, 90])) {
      errors.push(code + ': LABEL 경위도가 유효하지 않음');
      continue;
    }
    const maxBounds = ringBounds(largestRing(feature));
    if (exceptions[code]) {
      const containing = exteriorRings(feature).filter((ring) => inBounds(label, ringBounds(ring)) && pointInRing(label, ring));
      if (!containing.length) errors.push(code + ': 예외 라벨이 원본 육지 링에 포함되지 않음');
    } else if (!inBounds(label, maxBounds, 2)) {
      errors.push(code + ': LABEL=' + JSON.stringify(label) + ', 최대 링 bbox=' + JSON.stringify(maxBounds));
    }
    coords[code] = label.map((value) => Number(value.toFixed(2)));
  }
  if (errors.length) throw new Error('지도 라벨 검증 실패\n' + errors.join('\n'));
  return coords;
}

function generatedHeader() {
  return [
    '// 출처: Natural Earth 50m admin_0_countries (https://www.naturalearthdata.com/)',
    '// 버전: ' + SOURCE_VERSION + '; 단순화 허용 오차: ' + SIMPLIFY_TOLERANCE_DEG + '°',
    '// 라이선스: 퍼블릭 도메인',
    '// 재생성: npm run map:fetch && npm run map:build',
    '// 이 파일은 생성물입니다. 손으로 고치지 마세요.'
  ].join('\n') + '\n';
}

export function emitMap() {
  const result = prepareMap();
  const coords = buildCoordinates(result.matched);
  const header = generatedHeader();
  const coordBody = Object.entries(coords).map(([code, point]) => '  ' + JSON.stringify(code) + ': ' + JSON.stringify(point)).join(',\n');
  const coordText = header + '// 값은 [lng, lat]. 특정 화면의 x/y는 저장하지 않는다.\n' +
    '// 렌더링 시 x=(lng+180)/360, y=(90-lat)/180으로 화면 좌표를 구한다.\n' +
    'window.FQ = window.FQ || {};\nwindow.FQ.mapCoords = {\n' + coordBody + '\n};\n';
  const shapeText = header + 'window.FQ = window.FQ || {};\nwindow.FQ.mapLand = ' + JSON.stringify(result.mapLand) + ';\n';
  if (Buffer.byteLength(coordText) >= 12000 || Buffer.byteLength(shapeText) >= 250000) throw new Error('지도 생성물이 용량 한도를 넘었습니다.');
  fs.writeFileSync(path.join(root, 'data/map-coords.js'), coordText);
  fs.writeFileSync(path.join(root, 'data/map-shapes.js'), shapeText);
  return { ...result, coords, bytes: { coords: Buffer.byteLength(coordText), shapes: Buffer.byteLength(shapeText) } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = emitMap();
    console.log(JSON.stringify({ matched: result.matched.size, excluded: result.excluded.length, ...result.stats, bytes: result.bytes, labelExceptions: Object.keys(LABEL_VALIDATION_EXCEPTIONS) }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
