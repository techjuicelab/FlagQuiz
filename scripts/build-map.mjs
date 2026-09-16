/* 지도 자산 빌드. 앱 빌드와 분리되어 원자료를 명시적으로 준비한 경우만 실행한다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_RELATIVE_PATH, SOURCE_VERSION, verifySource } from './fetch-map-source.mjs';
import { joinFeatures, readCountryCodes } from './lib/ne-join.mjs';
import { exteriorRings, largestRing, ringBounds, assertDateline, hasSelfIntersections, topologySimplifier } from './lib/simplify.mjs';

// 0.7°의 육안 검사에서 한반도·일본·반도 해안이 거칠어, HANDOFF의 허용 대안 0.5°를 채택.
export const SIMPLIFY_TOLERANCE_DEG = 0.5;
const root = fileURLToPath(new URL('../', import.meta.url));

export function signedArea(points) {
  // 원점을 옮겨 작은 도형의 큰 좌표끼리 빼면서 생기는 오차를 줄인다.
  const [ox, oy] = points[0] || [0, 0];
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
    sum += (x1 - ox) * (y2 - oy) - (x2 - ox) * (y1 - oy);
  }
  return sum / 2;
}

const project = ([lng, lat]) => [(lng + 180) / 360 * 2000, (90 - lat) / 180 * 1000];
const roundPoint = (point) => point.map((value) => Number(value.toFixed(1)));

function bboxPath([west, south, east, north]) {
  const [left, top] = project([west, north]), [right, bottom] = project([east, south]);
  // 가장 가까운 0.1로 반올림하면 바티칸은 높이가 0이 되고 mc·tv 핀이 밖으로 밀린다.
  // 바깥쪽 0.1 격자로 감싸 원본 bbox를 보존하고 최소 폭·높이도 보장한다.
  const x0 = Math.max(0, Math.min(19999, Math.floor(left * 10)));
  const y0 = Math.max(0, Math.min(9999, Math.floor(top * 10)));
  const x1 = Math.min(20000, Math.max(x0 + 1, Math.ceil(right * 10)));
  const y1 = Math.min(10000, Math.max(y0 + 1, Math.ceil(bottom * 10)));
  return [[x0,y0], [x1,y0], [x1,y1], [x0,y1], [x0,y0]].map((p) => roundPoint(p.map((v) => v / 10)));
}

export function buildLand(features, matched, tolerance = SIMPLIFY_TOLERANCE_DEG, coords = buildCoordinates(matched)) {
  // 좌표를 만들지 않는 48개 지역도 육지다. 홍콩·마카오 등을 크기 필터로 지우지 않는다.
  // 모든 도형의 최대 링과 핀이 있는 링을 보호하고, 그 밖의 작은 부속 섬만 생략한다.
  const protectedRings = new Set(features.map(largestRing));
  for (const [code, feature] of matched) {
    for (const ring of exteriorRings(feature)) if (pointInRing(coords[code], ring)) protectedRings.add(ring);
  }
  const countryByFeature = new Map([...matched].map(([code, feature]) => [feature, code]));
  const positiveAreaFeatures = new Set();
  const bboxFallbackFeatures = new Set();
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
  let refinementPasses = 0;
  for (;;) {
    // 앞선 패스에서 공유 arc를 정밀하게 만들었으면 이웃 나라의 도형도 다시 구성한다.
    positiveAreaFeatures.clear(); bboxFallbackFeatures.clear(); parts.length = 0;
    sourcePoints = 0; outputPoints = 0; outputRings = 0;
    const crossingRings = [];
    for (const feature of ordered) {
      for (const ring of exteriorRings(feature)) {
        sourcePoints += ring.length;
        assertDateline(ring, feature.properties.ADMIN);
        const bbox = ringBounds(ring);
        const protect = protectedRings.has(ring);
        if (!protect && bbox[2] - bbox[0] < tolerance && bbox[3] - bbox[1] < tolerance) continue;
        const reduced = topology.simplifyRing(ring);
        let points = reduced.map((point) => roundPoint(project(point)));
        // 점이 남아 있어도 반올림 뒤 면적이 0이면 SVG fill에는 아무것도 그려지지 않는다.
        if (points.length < 4 || Math.abs(signedArea(points)) < 1e-9) {
          if (!protect) continue;
          points = bboxPath(bbox);
          bboxFallbackFeatures.add(feature);
        }
        if (hasSelfIntersections(points)) { crossingRings.push(ring); continue; }
        // 교차를 해소한 화면 외곽의 방향을 통일한다. 면적 부호만으로 교차를 판단하지 않는다.
        if (signedArea(points) < 0) points.reverse();
        if (!(signedArea(points) > 1e-9)) throw new Error('지도 링 면적 0: ' + feature.properties.ADMIN);
        parts.push(points.map((point, index) => (index ? 'L' : 'M') + point.join(' ')).join('') + 'Z');
        outputPoints += points.length; outputRings++;
        positiveAreaFeatures.add(feature);
      }
    }
    if (!crossingRings.length) break;
    if (refinementPasses >= 64 || !topology.refineRings(crossingRings)) {
      throw new Error('반올림 뒤 지도 자기교차를 해소하지 못했습니다. 원자료와 정밀도를 확인하세요.');
    }
    refinementPasses++;
  }
  const missing = [...matched].filter(([, feature]) => !positiveAreaFeatures.has(feature)).map(([code]) => code);
  if (missing.length) throw new Error('지도 실루엣에서 빠진 국가: ' + missing.join(', '));
  for (const feature of bboxFallbackFeatures) {
    if (!positiveAreaFeatures.has(feature)) throw new Error('작은 나라 보존 실패: ' + (countryByFeature.get(feature) || feature.properties.ADMIN));
  }
  const missingLand = features.filter((feature) => !positiveAreaFeatures.has(feature));
  if (missingLand.length) throw new Error('배제 지역 포함 육지 보존 실패: ' + missingLand.map((f) => f.properties.ADMIN).join(', '));
  const mapLand = { viewBox: '0 0 2000 1000', d: parts.join('') };
  if (Buffer.byteLength(JSON.stringify(mapLand)) >= 250000) throw new Error('지도 실루엣이 250KB를 넘었습니다.');
  assertPinsOnLand(coords, mapLand);
  return { mapLand, stats: { sourcePoints, outputPoints, outputRings, preservedCountries: matched.size, preservedFeatures: positiveAreaFeatures.size,
    bboxFallbacks: [...bboxFallbackFeatures].map((f) => countryByFeature.get(f) || f.properties.ADMIN), refinementPasses, ...topology.stats } };
}

export function prepareMap({ sourcePath = path.join(root, SOURCE_RELATIVE_PATH) } = {}) {
  let bytes;
  try { bytes = fs.readFileSync(sourcePath); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error('지도 원자료가 없습니다. npm run map:fetch 를 먼저 실행하세요.');
    throw error;
  }
  const source = verifySource(bytes);
  const joined = joinFeatures(source.features, readCountryCodes(root));
  const coords = buildCoordinates(joined.matched);
  return { source, ...joined, coords, ...buildLand(source.features, joined.matched, SIMPLIFY_TOLERANCE_DEG, coords) };
}

export const LABEL_OVERRIDES = Object.freeze({
  // Natural Earth v5.1.2의 LABEL은 글자 배치용으로 아래 7개는 자국 육지 밖에 있다.
  // 각 좌표는 해당 나라의 원자료 exterior ring 안에서 선택했으며 빌드마다 재검증한다.
  ag: [-61.8, 17.08], // 해상 라벨을 앤티가섬 내부로 이동.
  gq: [10.35, 1.65], // 해상 라벨을 리오무니 본토 내부로 이동.
  nz: [175.4, -38.6], // 해상 라벨을 북섬 내부로 이동.
  st: [6.61, 0.23], // 해상 라벨을 상투메섬 내부로 이동.
  tt: [-61.3, 10.45], // 해상 라벨을 트리니다드섬 내부로 이동.
  va: [12.43, 41.9], // 원본 라벨은 바티칸 동쪽 로마에 있어 실제 작은 외곽 안으로 이동.
  vc: [-61.2, 13.25] // 해상 라벨을 세인트빈센트섬 내부로 이동.
});

function inBounds([lng, lat], [west, south, east, north]) {
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

export function pointInRing([lng, lat], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > lat) !== (b[1] > lat) && lng < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function buildCoordinates(matched, { overrides = LABEL_OVERRIDES } = {}) {
  const coords = {};
  const errors = [];
  for (const code of [...matched.keys()].sort()) {
    const feature = matched.get(code);
    const label = overrides[code] || [feature.properties.LABEL_X, feature.properties.LABEL_Y];
    if (!Array.isArray(label) || label.length !== 2 || !label.every(Number.isFinite) || !inBounds(label, [-180, -90, 180, 90])) {
      errors.push(code + ': LABEL 경위도가 유효하지 않음');
      continue;
    }
    const rounded = label.map((value) => Number(value.toFixed(2)));
    const rings = exteriorRings(feature);
    if (!rings.some((ring) => pointInRing(label, ring))) errors.push(code + ': 라벨이 원본 육지 링 밖: ' + JSON.stringify(label));
    if (!rings.some((ring) => pointInRing(rounded, ring))) errors.push(code + ': 반올림 좌표가 원본 육지 링 밖: ' + JSON.stringify(rounded));
    coords[code] = rounded;
  }
  if (errors.length) throw new Error('지도 라벨 검증 실패\n' + errors.join('\n'));
  return coords;
}

export function assertPinsOnLand(coords, mapLand) {
  // 최종으로 쓸 SVG 문자열을 다시 읽는다. 원본 링 통과만으로 단순화·반올림 결함을 놓치지 않는다.
  const rings = mapLand.d.split('Z').filter((s) => s.trim()).map((s) => {
    const numbers = s.match(/-?\d+(?:\.\d+)?/g) || [];
    return Array.from({ length: numbers.length / 2 }, (_, i) => [+numbers[2 * i], +numbers[2 * i + 1]]);
  });
  const bad = [];
  for (const [code, coord] of Object.entries(coords)) {
    const [px, py] = project(coord);
    let winding = 0;
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
      const cross = (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1);
      if (y1 <= py && y2 > py && cross > 0) winding++;
      else if (y1 > py && y2 <= py && cross < 0) winding--;
    }
    if (winding === 0) bad.push(code);
  }
  if (bad.length) throw new Error('생성된 실루엣 밖의 지도 핀: ' + bad.join(', '));
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
  const { coords } = result;
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
    console.log(JSON.stringify({ matched: result.matched.size, excluded: result.excluded.length, ...result.stats, bytes: result.bytes, labelOverrides: Object.keys(LABEL_OVERRIDES) }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
