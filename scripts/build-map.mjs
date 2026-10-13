/* 지도 자산 빌드. 앱 빌드와 분리되어 원자료를 명시적으로 준비한 경우만 실행한다. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { SOURCE_RELATIVE_PATH, SOURCE_VERSION, SOURCE_URL, EXPECTED_SHA256, verifySource,
  HIGH_RESOLUTION_URL, HIGH_RESOLUTION_SHA256, HIGH_RESOLUTION_RELATIVE_PATH, verifyHighResolutionSource } from './fetch-map-source.mjs';
import { joinFeatures, readCountryCodes } from './lib/ne-join.mjs';
import { exteriorRings, largestRing, ringBounds, assertDateline, hasSelfIntersections, topologySimplifier } from './lib/simplify.mjs';

// 0.7°의 육안 검사에서 한반도·일본·반도 해안이 거칠어, HANDOFF의 허용 대안 0.5°를 채택.
export const SIMPLIFY_TOLERANCE_DEG = 0.5;
// 선택한 나라의 윤곽은 확대해서 배우므로 바탕 실루엣보다 정밀하게 보존한다.
export const REGION_SIMPLIFY_TOLERANCE_DEG = 0.15;
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
const regionPoint = (point) => point.map((value) => Number(value.toFixed(3)));
const pathFor = (points) => points.map((point, index) => (index ? 'L' : 'M') + point.join(' ')).join('') + 'Z';
const polygonsFor = (feature) => feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
const holesFor = (feature) => polygonsFor(feature).flatMap((polygon) => polygon.slice(1));

function pointBounds(points) {
  return points.reduce((box, [x, y]) => [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)],
    [Infinity, Infinity, -Infinity, -Infinity]);
}

export function regionContains(d, coordinate) {
  const rings = d.split('Z').filter(Boolean).map((part) => {
    const values = (part.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    return Array.from({ length: values.length / 2 }, (_, index) => values.slice(index * 2, index * 2 + 2));
  });
  return rings.reduce((count, ring) => count + Number(pointInRing(project(coordinate), ring)), 0) % 2 !== 0;
}

export function featureContains(feature, coordinate) {
  return polygonsFor(feature).some((polygon) => pointInRing(coordinate, polygon[0]) &&
    !polygon.slice(1).some((ring) => pointInRing(coordinate, ring)));
}

function readCapitals() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'data/capital-coords.js'), 'utf8'), context);
  const capitals = context.window.FQ.capitalCoords;
  const codes = readCountryCodes(root).sort();
  if (!capitals || JSON.stringify(Object.keys(capitals).sort()) !== JSON.stringify(codes) ||
      Object.values(capitals).some((point) => !Array.isArray(point) || point.length !== 2 ||
        !point.every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90)) {
    throw new Error('수도 좌표는 앱 194개 나라와 일치하는 실제 경위도여야 합니다.');
  }
  return capitals;
}

/** 원본 50m 경계가 실제 수도를 담지 못하는 나라만 공식 10m 도형으로 보완한다. */
export function upgradeCapitalGeometry(source, highResolution, capitals) {
  const codes = readCountryCodes(root);
  const original = joinFeatures(source.features, codes);
  const replacements = new Map(), overrides = [];
  const outside = [];
  for (const [code, feature] of original.matched) {
    if (!capitals[code] || featureContains(feature, capitals[code])) continue;
    const candidates = highResolution.features.filter((candidate) => candidate.properties.ADMIN === feature.properties.ADMIN);
    if (candidates.length !== 1) throw new Error('10m 국가 매칭 실패: ' + code);
    const precise = candidates[0];
    if (!featureContains(precise, capitals[code])) {
      // 니코시아의 공식 도시점은 Natural Earth의 UN 완충 지대에 있다. 국가 경계와 점을 옮기지 않는다.
      if (code !== 'cy') throw new Error('10m 경계도 실제 수도를 포함하지 못합니다: ' + code);
      outside.push(code); continue;
    }
    replacements.set(feature, { ...feature, geometry: precise.geometry });
    overrides.push(code);
  }
  // 바티칸 외곽과 이탈리아의 해당 구멍은 같은 원자료 링을 사용한다. 이전 위치의 구멍도 제거한다.
  const vatican = original.matched.get('va'), italy = original.matched.get('it');
  if (replacements.has(vatican)) {
    const oldRing = exteriorRings(vatican)[0], actualRing = exteriorRings(replacements.get(vatican))[0];
    const oldBox = ringBounds(oldRing);
    let replaced = 0;
    const polygons = polygonsFor(italy).map((polygon) => polygon.map((ring, index) => {
      if (!index || !ringBounds(ring).every((value, i) => Math.abs(value - oldBox[i]) < 1e-6)) return ring;
      replaced++; return actualRing;
    }));
    if (replaced !== 1) throw new Error('이탈리아의 바티칸 구멍 매칭 실패');
    replacements.set(italy, { ...italy, geometry: italy.geometry.type === 'Polygon'
      ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons } });
  }
  const features = source.features.map((feature) => replacements.get(feature) || feature);
  return { features, ...joinFeatures(features, codes), overrides: overrides.sort(), outside: outside.sort() };
}

function focusRings(feature, label, rendered) {
  const rings = exteriorRings(feature).filter((ring) => rendered.has(ring));
  const chosen = new Set(rings.filter((ring) => pointInRing(label, ring)));
  // 본토와 가까운 섬은 함께 보여 주되, 해외영토와 날짜변경선 반대편 때문에 세계 전체로 벌어지지 않는다.
  // 4° 이내의 링을 이어 일본·인도네시아·뉴질랜드의 주요 군도를 보존한다.
  let changed = true;
  while (changed) {
    changed = false;
    for (const ring of rings) {
      if (chosen.has(ring)) continue;
      const box = ringBounds(ring);
      for (const member of chosen) {
        const nearby = ringBounds(member);
        const dx = Math.max(0, box[0] - nearby[2], nearby[0] - box[2]);
        const dy = Math.max(0, box[1] - nearby[3], nearby[1] - box[3]);
        if (dx <= 4 && dy <= 4) { chosen.add(ring); changed = true; break; }
      }
    }
  }
  return [...chosen].flatMap((ring) => rendered.get(ring));
}

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

export function buildLand(features, matched, tolerance = SIMPLIFY_TOLERANCE_DEG, coords = buildCoordinates(matched), options = {}) {
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
  const mapRegions = buildRegions(options.regionFeatures || features, options.regionMatched || matched, coords,
    REGION_SIMPLIFY_TOLERANCE_DEG, options);
  return { mapLand, mapRegions, stats: { sourcePoints, outputPoints, outputRings, preservedCountries: matched.size, preservedFeatures: positiveAreaFeatures.size,
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
  let highBytes;
  try { highBytes = fs.readFileSync(path.join(root, HIGH_RESOLUTION_RELATIVE_PATH)); }
  catch (error) { if (error.code === 'ENOENT') throw new Error('10m 지도 원자료가 없습니다. npm run map:fetch 를 먼저 실행하세요.'); throw error; }
  const capitals = readCapitals();
  const upgraded = upgradeCapitalGeometry(source, verifyHighResolutionSource(highBytes), capitals);
  const coords = buildCoordinates(upgraded.matched);
  // 바탕 실루엣은 기존 50m를 유지하고 위치가 잘못된 바티칸만 교체한다.
  const baseFeatures = source.features.map((feature) => feature.properties.ADMIN === 'Vatican'
    ? upgraded.matched.get('va') : feature);
  const base = joinFeatures(baseFeatures, readCountryCodes(root));
  const sourceMetadata = { version: SOURCE_VERSION, base: { url: SOURCE_URL, sha256: EXPECTED_SHA256 },
    boundaryOverrides: { url: HIGH_RESOLUTION_URL, sha256: HIGH_RESOLUTION_SHA256, countries: upgraded.overrides },
    capitalOutsideBoundary: upgraded.outside,
    capitalBoundaryExceptions: upgraded.outside.length ? { cy: '니코시아 도시점은 Natural Earth 10m Cyprus U.N. Buffer Zone 안에 있다. 실제 도시점과 기존 국가 경계를 유지한다.' } : {},
    boundaryApproximation: 'Natural Earth는 지도 축척에 맞춘 근사 경계다. 바티칸의 10m 외곽도 실측 지적 경계를 뜻하지 않는다.' };
  return { source, ...upgraded, coords, sourceMetadata, ...buildLand(baseFeatures, base.matched, SIMPLIFY_TOLERANCE_DEG, coords,
    { regionFeatures: upgraded.features, regionMatched: upgraded.matched, capitals, capitalBoundaryExceptions: upgraded.outside }) };
}

export function buildRegions(features, matched, coords = buildCoordinates(matched), tolerance = REGION_SIMPLIFY_TOLERANCE_DEG, options = {}) {
  // 이탈리아의 바티칸·산마리노와 남아공의 레소토를 실제 구멍으로 남긴다.
  // 구멍도 공유 arc 계산에 참여시켜 둘러싼 나라와 안쪽 나라의 경계를 일치시킨다.
  const holeFeatures = features.flatMap((feature) => holesFor(feature).map((ring) => ({
    geometry: { type: 'Polygon', coordinates: [ring] }
  })));
  const topology = topologySimplifier([...features, ...holeFeatures], tolerance);
  const ordered = [...matched].sort(([a], [b]) => a.localeCompare(b));
  for (let pass = 0; pass <= 64; pass++) {
    const mapRegions = {}, rendered = new Map(), refine = [];
    for (const [code, feature] of ordered) {
      const parts = [];
      // 작은 부속섬도 생략하지 않는다. 지도 전체와 확대창 모두 같은 실제 영역을 쓴다.
      for (const [hole, rings] of [[false, exteriorRings(feature)], [true, holesFor(feature)]]) {
        for (const ring of rings) {
          assertDateline(ring, feature.properties.ADMIN);
          let points = topology.simplifyRing(ring).map((point) => regionPoint(project(point)));
          // 축약하면 사라지는 초소형 영역은 사각형 대체 없이 원본 외곽으로 되돌린다.
          if (points.length < 4 || Math.abs(signedArea(points)) < 1e-9) points = ring.map((point) => regionPoint(project(point)));
          if (hasSelfIntersections(points)) { refine.push(ring); continue; }
          if (Math.abs(signedArea(points)) < 1e-9) throw new Error('나라 영역 면적 0: ' + code);
          if ((signedArea(points) > 0) === hole) points.reverse();
          parts.push(pathFor(points));
          if (!hole) rendered.set(ring, points);
        }
      }
      const exteriorPoints = exteriorRings(feature).flatMap((ring) => rendered.get(ring) || []);
      const focusPoints = focusRings(feature, coords[code], rendered);
      mapRegions[code] = { d: parts.join(''), bounds: pointBounds(exteriorPoints),
        focusBounds: pointBounds(focusPoints.length ? focusPoints : exteriorPoints) };
      // 합친 육지는 이웃 나라가 좌표 이탈을 숨길 수 있으므로 자기 나라의 evenodd fill도 확인한다.
      if (!regionContains(mapRegions[code].d, coords[code])) {
        refine.push(...exteriorRings(feature).filter((ring) => pointInRing(coords[code], ring)));
      }
      const capital = options.capitals && options.capitals[code];
      if (capital && featureContains(feature, capital) && !regionContains(mapRegions[code].d, capital)) {
        refine.push(...exteriorRings(feature).filter((ring) => pointInRing(capital, ring)));
      }
    }
    if (!refine.length) {
      assertPinsInRegions(coords, mapRegions);
      const missed = Object.keys(options.capitals || {}).filter((code) => matched.has(code) &&
        !(options.capitalBoundaryExceptions || []).includes(code) && !regionContains(mapRegions[code].d, options.capitals[code]));
      if (missed.length) throw new Error('나라 영역 밖의 실제 수도: ' + missed.join(', '));
      return mapRegions;
    }
    if (pass === 64 || !topology.refineRings(refine)) {
      throw new Error('나라 영역의 자기교차 또는 좌표 이탈을 해소하지 못했습니다.');
    }
  }
}

export const LABEL_OVERRIDES = Object.freeze({
  // Natural Earth v5.1.2의 LABEL은 글자 배치용으로 아래 7개는 자국 육지 밖에 있다.
  // 각 좌표는 해당 나라의 원자료 exterior ring 안에서 선택했으며 빌드마다 재검증한다.
  ag: [-61.8, 17.08], // 해상 라벨을 앤티가섬 내부로 이동.
  gq: [10.35, 1.65], // 해상 라벨을 리오무니 본토 내부로 이동.
  nz: [175.4, -38.6], // 해상 라벨을 북섬 내부로 이동.
  st: [6.61, 0.23], // 해상 라벨을 상투메섬 내부로 이동.
  tt: [-61.3, 10.45], // 해상 라벨을 트리니다드섬 내부로 이동.
  va: [12.453418, 41.903323], // 10m 공식 LABEL. 50m의 서쪽으로 치우친 경계와 라벨을 함께 바로잡는다.
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
    const rounded = label.map((value) => Number(value.toFixed(code === 'va' ? 6 : 2)));
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

export function assertPinsInRegions(coords, regions) {
  const bad = [];
  for (const [code, coordinate] of Object.entries(coords)) {
    const region = regions[code];
    if (!region || typeof region.d !== 'string') { bad.push(code); continue; }
    if (!regionContains(region.d, coordinate) || !region.bounds.every(Number.isFinite) || !region.focusBounds.every(Number.isFinite)) bad.push(code);
  }
  if (bad.length) throw new Error('자기 나라 영역 밖의 지도 좌표: ' + bad.join(', '));
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
    '// 바티칸만 10m 공식 LABEL을 소수 여섯째 자리로 보존하며, 나머지 나라는 소수 둘째 자리다.\n' +
    'window.FQ = window.FQ || {};\nwindow.FQ.mapCoords = {\n' + coordBody + '\n};\n';
  const shapeText = header + 'window.FQ = window.FQ || {};\nwindow.FQ.mapLand = ' + JSON.stringify(result.mapLand) + ';\n' +
    '// 나라 영역 단순화 허용 오차: ' + REGION_SIMPLIFY_TOLERANCE_DEG + '°; SVG 소수 셋째 자리; 작은 영역은 원본 외곽 보존.\n' +
    '// 나라 영역은 evenodd fill을 쓰며, bounds는 전체 영역·focusBounds는 주영역과 인접 섬의 SVG 좌표다.\n' +
    'window.FQ.mapRegions = ' + JSON.stringify(result.mapRegions) + ';\n' +
    '// 수도 원좌표는 바꾸지 않는다. 바티칸을 포함한 작은 나라의 경계는 지도 축척에 따른 근사다.\n' +
    'window.FQ.mapSourceMeta = ' + JSON.stringify(result.sourceMetadata) + ';\n';
  if (Buffer.byteLength(coordText) >= 12000 || Buffer.byteLength(shapeText) >= 1000000) throw new Error('지도 생성물이 용량 한도를 넘었습니다.');
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
