import test from 'node:test';
import assert from 'node:assert/strict';
import { simplify, topologySimplifier } from '../scripts/lib/simplify.mjs';

const feature = (ring) => ({ geometry: { type: 'Polygon', coordinates: [ring] } });
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
function arc(ring, from, to) {
  const points = ring.slice(0, -1);
  const start = points.findIndex((point) => same(point, from));
  assert.notEqual(start, -1, '공유 arc 시작 anchor가 살아 있어야 한다');
  const result = [];
  for (let step = 0; step <= points.length; step++) {
    const point = points[(start + step) % points.length];
    result.push(point);
    if (step && same(point, to)) return result;
  }
  assert.fail('공유 arc 끝 anchor가 살아 있어야 한다');
}

test('공유 경계는 두 나라에서 정확히 반대 순서로 단순화된다', () => {
  const left = [[0,0],[4,0],[4,1],[3.7,1.6],[4.3,2.2],[4,3],[0,3],[0,0]];
  const right = [[4,3],[4.3,2.2],[3.7,1.6],[4,1],[4,0],[8,0],[8,3],[4,3]];
  const original = JSON.stringify([left, right]);
  const topology = topologySimplifier([feature(left), feature(right)], 0.2);
  const a = topology.simplifyRing(left), b = topology.simplifyRing(right);
  const common = arc(a, [4,0], [4,3]);
  assert.deepEqual(common, arc(b, [4,3], [4,0]).reverse());
  assert.ok(common.length < 6, '경계를 그대로 복사하는 것으로만 통과하면 안 된다');
  assert.equal(topology.stats.reusedArcs, 1);
  assert.equal(JSON.stringify([left, right]), original, '원본 점을 바꾸지 않는다');
});

test('끝점이 같은 국경과 서로 다른 해안 경로를 캐시에서 혼동하지 않는다', () => {
  const north = [[0,0],[1,0.2],[2,0],[2,2],[0,2],[0,0]];
  const south = [[2,0],[1,0.2],[0,0],[0,-2],[2,-2],[2,0]];
  const topology = topologySimplifier([feature(north), feature(south)], 0.1);
  const a = topology.simplifyRing(north), b = topology.simplifyRing(south);
  assert.deepEqual(arc(a, [0,0], [2,0]), arc(b, [2,0], [0,0]).reverse());
  assert.ok(arc(a, [2,0], [0,0]).some((point) => point[1] === 2), '북쪽 해안이 국경으로 덮이지 않는다');
  assert.ok(arc(b, [0,0], [2,0]).some((point) => point[1] === -2), '남쪽 해안이 국경으로 덮이지 않는다');
  assert.equal(topology.stats.uniqueArcs, 3);
  assert.equal(topology.stats.reusedArcs, 1);
});

test('허용 오차 0은 닫힌 링의 모든 점과 원래 시작점을 보존한다', () => {
  const ring = [[0,0],[1,0],[2,0],[2,2],[0,2],[0,0]];
  assert.deepEqual(simplify(ring, 0), ring);
  assert.deepEqual(topologySimplifier([feature(ring)], 0).simplifyRing(ring), ring);
});

test('긴 링은 명시적 스택으로 처리하며 닫힘과 끝점을 유지한다', () => {
  const ring = Array.from({ length: 50000 }, (_, i) => [i / 1000, Math.sin(i / 1000)]);
  ring.push(ring[0]);
  const output = simplify(ring, 0.1);
  assert.ok(output.length < ring.length / 10);
  assert.deepEqual(output[0], ring[0]);
  assert.deepEqual(output.at(-1), ring[0]);
});
