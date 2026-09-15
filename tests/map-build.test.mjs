import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCoordinates, buildLand, assertPinsOnLand, prepareMap } from '../scripts/build-map.mjs';

const box = (west, south, east, north) => [[west, south], [east, south], [east, north], [west, north], [west, south]];
const polygon = (name, ring, label) => ({
  type: 'Feature',
  properties: { ADMIN: name, LABEL_X: label[0], LABEL_Y: label[1] },
  geometry: { type: 'Polygon', coordinates: [ring] }
});
const matched = (feature) => new Map([['zz', feature]]);

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
