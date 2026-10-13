import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { buildCoordinates, buildLand, buildRegions, assertPinsOnLand, assertPinsInRegions, prepareMap } from '../scripts/build-map.mjs';
import { verifyMapRegions } from '../scripts/verify-expansion.mjs';

const box = (west, south, east, north) => [[west, south], [east, south], [east, north], [west, north], [west, south]];
const polygon = (name, ring, label) => ({
  type: 'Feature',
  properties: { ADMIN: name, LABEL_X: label[0], LABEL_Y: label[1] },
  geometry: { type: 'Polygon', coordinates: [ring] }
});
const matched = (feature) => new Map([['zz', feature]]);
function generatedMap() {
  const context = { window: {} };
  for (const file of ['data/countries.js', 'data/map-coords.js', 'data/map-shapes.js']) {
    vm.runInNewContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context, { filename: file });
  }
  return context.window.FQ;
}

// 생성기에서 반환한 문자열을 독립적으로 읽어 실제 SVG fill 결과를 검증한다.
function readRings(land) {
  return land.d.split('Z').filter(Boolean).map((part) => {
    const values = part.match(/-?\d+(?:\.\d+)?/g).map(Number);
    return Array.from({ length: values.length / 2 }, (_, i) => values.slice(i * 2, i * 2 + 2));
  });
}
function area(ring) {
  return ring.reduce((sum, [x, y], i) => {
    const next = ring[(i + 1) % ring.length];
    return sum + x * next[1] - next[0] * y;
  }, 0) / 2;
}
function windingAt(land, [lng, lat]) {
  const px = (lng + 180) / 360 * 2000, py = (90 - lat) / 180 * 1000;
  let winding = 0;
  for (const ring of readRings(land)) for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    const cross = (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1);
    if (y1 <= py && y2 > py && cross > 0) winding++;
    else if (y1 > py && y2 <= py && cross < 0) winding--;
  }
  return winding;
}

// SVG evenodd 규칙은 외곽과 구멍의 링 방향에 의존하지 않는다.
function containsRegion(region, [lng, lat]) {
  const x = (lng + 180) / 360 * 2000, y = (90 - lat) / 180 * 1000;
  let inside = false;
  for (const ring of readRings(region)) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

test('LABEL이 나라 bbox 안이어도 실제 육지 밖이면 거부한다', () => {
  const feature = polygon('삼각형 나라', [[0, 0], [2, 0], [0, 2], [0, 0]], [1.8, 1.8]);
  assert.throws(() => buildCoordinates(matched(feature)), /zz: 라벨이 원본 육지 링 밖/);
  assert.deepEqual(buildCoordinates(matched(feature), { overrides: { zz: [0.5, 0.5] } }), { zz: [0.5, 0.5] });
});

test('원본 LABEL은 육지 안이지만 소수 둘째 자리 반올림이 육지를 벗어나면 거부한다', () => {
  const feature = polygon('격자 사이 작은 섬', box(0.011, 0.011, 0.017, 0.017), [0.014, 0.014]);
  assert.throws(() => buildCoordinates(matched(feature)), /zz: 반올림 좌표가 원본 육지 링 밖/);
});

test('최대 링 밖의 작은 섬에 놓인 정상 LABEL은 허용하고 그 섬도 실루엣에 남긴다', () => {
  const feature = polygon('두 섬 나라', box(-10, -10, -6, -6), [1.1, 1.1]);
  feature.geometry = { type: 'MultiPolygon', coordinates: [[box(-10, -10, -6, -6)], [box(1, 1, 1.2, 1.2)]] };
  assert.deepEqual(buildCoordinates(matched(feature)), { zz: [1.1, 1.1] });
  const { mapLand } = buildLand([feature], matched(feature));
  assert.equal(readRings(mapLand).length, 2, '0.5도보다 작은 핀의 섬도 지우지 않는다');
  assert.notEqual(windingAt(mapLand, [1.1, 1.1]), 0);
});

test('바티칸 크기 bbox가 반올림으로 납작해져도 임의 코드의 나라를 면적 있는 도형으로 보존한다', () => {
  const feature = polygon('초소형국', box(12.428, 41.898, 12.439, 41.906), [12.43, 41.9]);
  // tolerance 0으로 원래 네 모서리를 유지해, 단순화가 아닌 화면 반올림 결함을 재현한다.
  const { mapLand, stats } = buildLand([feature], matched(feature), 0);
  assert.deepEqual(stats.bboxFallbacks, ['zz'], 'sg/mc/va/tv 하드코딩에 기대지 않는다');
  const rings = readRings(mapLand);
  assert.equal(rings.length, 1);
  assert.ok(area(rings[0]) > 1e-9);
  const xs = rings[0].map((p) => p[0]), ys = rings[0].map((p) => p[1]);
  assert.ok(Math.max(...xs) - Math.min(...xs) >= 0.1 - 1e-9);
  assert.ok(Math.max(...ys) - Math.min(...ys) >= 0.1 - 1e-9);
  assert.notEqual(windingAt(mapLand, [12.43, 41.9]), 0);
});

test('나라 목록에서 배제된 작은 지역도 육지 최대 링을 보존한다', () => {
  const country = polygon('국가', box(-10, -10, -6, -6), [-8, -8]);
  const excluded = polygon('작은 배제 지역', box(1, 1, 1.02, 1.02), [1.01, 1.01]);
  const { mapLand } = buildLand([country, excluded], matched(country));
  assert.equal(readRings(mapLand).length, 2);
  assert.notEqual(windingAt(mapLand, [1.01, 1.01]), 0, '핀 없는 지역도 크기 필터 때문에 사라지지 않는다');
});

test('서로 반대 방향의 외곽 링도 변환 후 방향을 통일하여 겹친 육지가 구멍이 되지 않는다', () => {
  const country = polygon('큰 육지', box(-2, -2, 2, 2), [0, 0]);
  const reversed = polygon('방향이 다른 외곽', box(-1, -1, 1, 1).reverse(), [0, 0]);
  const { mapLand } = buildLand([country, reversed], matched(country), 0);
  const areas = readRings(mapLand).map(area);
  assert.equal(areas.length, 2);
  assert.ok(areas.every((a) => a > 0) || areas.every((a) => a < 0));
  assert.equal(Math.abs(windingAt(mapLand, [0, 0])), 2, '반대 방향 때문에 fill이 상쇄되지 않는다');
});

test('최종 실루엣 게이트는 바다 핀과 면적 없는 M0 0Z를 거부한다', () => {
  const country = polygon('육지', box(-2, -2, 2, 2), [0, 0]);
  const { mapLand } = buildLand([country], matched(country), 0);
  assert.doesNotThrow(() => assertPinsOnLand({ zz: [0, 0] }, mapLand));
  assert.throws(() => assertPinsOnLand({ zz: [40, 40] }, mapLand), /실루엣 밖의 지도 핀: zz/);
  assert.throws(() => assertPinsOnLand({ zz: [0, 0] }, { viewBox: '0 0 2000 1000', d: 'M0 0Z' }), /실루엣 밖의 지도 핀: zz/);
});

test('바탕 실루엣의 이탈 거부는 유지하고 국가 영역은 좁은 돌출부의 자기 좌표를 정밀화로 보존한다', () => {
  // 0.4도 높이의 좁은 돌출부는 0.5도 단순화에서 사라지지만 나머지 큰 링 면적은 남는다.
  const feature = polygon('돌출부에 핀이 있는 나라', [
    [0, 0], [4, 0], [4, 4], [2.2, 4], [2, 4.4], [1.8, 4], [0, 4], [0, 0]
  ], [2, 4.3]);
  assert.deepEqual(buildCoordinates(matched(feature)), { zz: [2, 4.3] }, '원자료 검증은 정상 통과해야 한다');
  assert.throws(() => buildLand([feature], matched(feature), 0.5), /생성된 실루엣 밖의 지도 핀: zz/);
  const mapRegions = buildRegions([feature], matched(feature), { zz: [2, 4.3] }, 0.5);
  assert.equal(containsRegion(mapRegions.zz, [2, 4.3]), true);
});

test('아주 작은 나라의 실제 외곽과 라벨 없는 부속 섬도 사각형 대체나 생략 없이 남긴다', () => {
  const triangle = [[12.428, 41.898], [12.439, 41.898], [12.433, 41.906], [12.428, 41.898]];
  const feature = polygon('작은 삼각형 나라', triangle, [12.433, 41.9]);
  feature.geometry = { type: 'MultiPolygon', coordinates: [[triangle], [box(12.45, 41.9, 12.452, 41.902)]] };
  const mapRegions = buildRegions([feature], matched(feature), { zz: [12.433, 41.9] }, 0);
  const rings = readRings(mapRegions.zz);
  assert.equal(rings.length, 2, '0.002도 부속 섬도 국가 영역에 보존한다');
  assert.equal(rings[0].length, 4, '닫힌 삼각형을 bbox 사각형으로 바꾸지 않는다');
  assert.equal(containsRegion(mapRegions.zz, [12.433, 41.9]), true);
  assert.equal(containsRegion(mapRegions.zz, [12.451, 41.901]), true);
  assert.equal(containsRegion(mapRegions.zz, [12.438, 41.905]), false, 'bbox 안이지만 나라 밖인 곳은 채우지 않는다');
});

test('한 나라 안의 다른 나라는 구멍으로 남겨 둘러싼 나라의 색이 침범하지 않는다', () => {
  const outer = polygon('둘러싼 나라', box(-5, -5, 5, 5), [3, 3]);
  outer.geometry.coordinates.push(box(-1, -1, 1, 1));
  const enclave = polygon('안쪽 나라', box(-1, -1, 1, 1), [0, 0]);
  const { mapRegions } = buildLand([outer, enclave], new Map([['aa', outer], ['bb', enclave]]), 0);
  assert.equal(readRings(mapRegions.aa).length, 2);
  assert.equal(containsRegion(mapRegions.aa, [3, 3]), true);
  assert.equal(containsRegion(mapRegions.aa, [0, 0]), false);
  assert.equal(containsRegion(mapRegions.bb, [0, 0]), true);
  assert.throws(() => assertPinsInRegions({ aa: [0, 0] }, mapRegions), /자기 나라 영역 밖/);
});

test('군도는 인접한 주요 섬을 focus에 이어 담고 먼 섬과 날짜변경선 반대편은 전체 영역에 남긴다', () => {
  const feature = polygon('섬나라', box(170, -10, 173, -8), [171, -9]);
  feature.geometry = { type: 'MultiPolygon', coordinates: [
    [box(170, -10, 173, -8)], [box(176, -10, 178, -8)],
    [box(-179, -10, -177, -8)], [box(80, -10, 82, -8)]
  ] };
  const { mapRegions } = buildLand([feature], matched(feature), 0);
  const region = mapRegions.zz;
  for (const coordinate of [[171, -9], [177, -9], [-178, -9], [81, -9]]) {
    assert.equal(containsRegion(region, coordinate), true, coordinate.join(','));
  }
  assert.equal(readRings(region).length, 4);
  assert.ok(region.bounds[2] - region.bounds[0] > 1900, '전체 영토는 날짜변경선 양쪽을 포함한다');
  assert.ok(region.focusBounds[2] - region.focusBounds[0] < 50, '주영역과 인접 섬만 가까이 본다');
  assert.ok(region.focusBounds[2] > (177 + 180) / 360 * 2000, '두 번째 주요 섬도 포함한다');
});

test('생성된 194개 나라 영역은 각각 자기 좌표를 포함하고 경계·주영역 범위가 유효하다', () => {
  const { countries, mapCoords, mapRegions } = generatedMap();
  assert.equal(Object.keys(mapRegions).length, 194);
  assert.deepEqual(Object.keys(mapRegions).sort(), Array.from(countries, (country) => country.code).sort());
  for (const country of countries) {
    const region = mapRegions[country.code];
    assert.equal(containsRegion(region, mapCoords[country.code]), true, country.code + ' 자기 좌표');
    for (const bounds of [region.bounds, region.focusBounds]) {
      assert.ok(bounds.every(Number.isFinite));
      assert.ok(bounds[0] >= 0 && bounds[1] >= 0 && bounds[2] <= 2000 && bounds[3] <= 1000);
      assert.ok(bounds[0] < bounds[2] && bounds[1] < bounds[3], country.code + ' 면적 있는 범위');
    }
    const [west, north, east, south] = region.bounds;
    const focus = region.focusBounds;
    assert.ok(focus[0] >= west && focus[1] >= north && focus[2] <= east && focus[3] <= south);
  }
  assert.equal(containsRegion(mapRegions.za, mapCoords.ls), false, '레소토에 남아공 색을 칠하지 않는다');
  assert.equal(containsRegion(mapRegions.ls, mapCoords.ls), true);
});

test('국가 영역 검증기는 다른 나라 도형 대입·내륙국 덮기·범위 오류·날짜변경선 횡단을 거부한다', () => {
  const { mapCoords, mapRegions } = generatedMap();
  function failures(regions) {
    const messages = [];
    verifyMapRegions({ ok(value, message) { if (!value) messages.push(message); }, note() {} }, regions, mapCoords);
    return messages.join('\n');
  }
  assert.equal(failures(mapRegions), '');
  const wrongCountry = structuredClone(mapRegions);
  wrongCountry.kr.d = mapRegions.jp.d;
  assert.match(failures(wrongCountry), /자기 나라 영역 밖.*kr/);
  const coveredEnclave = structuredClone(mapRegions);
  coveredEnclave.it.d += mapRegions.va.d;
  assert.match(failures(coveredEnclave), /안쪽 나라의 영역을 덮는다: it\/va/);
  const invalidBounds = structuredClone(mapRegions);
  invalidBounds.kr.focusBounds = [0, 0, 0, 0];
  assert.match(failures(invalidBounds), /focusBounds가 유효하지 않다: kr/);
  const crossedDateline = structuredClone(mapRegions);
  crossedDateline.ru.d += 'M0 100L2000 100L2000 101L0 101L0 100Z';
  assert.match(failures(crossedDateline), /날짜변경선 오류: ru/);
});

test('원자료가 없으면 ENOENT 대신 준비 명령을 알려준다', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'flagquiz-missing-map-'));
  try {
    assert.throws(() => prepareMap({ sourcePath: path.join(temporary, 'missing.geojson') }), {
      message: '지도 원자료가 없습니다. npm run map:fetch 를 먼저 실행하세요.'
    });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
