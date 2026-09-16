/* 경위도 평면의 Douglas-Peucker. 긴 러시아 링도 재귀 없이 처리한다. */
export function simplify(points, tolerance) {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('단순화 허용 오차는 0 이상의 유한수여야 합니다.');
  if (tolerance === 0 || points.length <= 2) return points.map((point) => [...point]);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const squaredTolerance = tolerance * tolerance;
  while (stack.length) {
    const [first, last] = stack.pop();
    const a = points[first], b = points[last];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    let farthest = -1, maxDistance = squaredTolerance;
    for (let i = first + 1; i < last; i++) {
      const p = points[i];
      const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared));
      const distance = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
      if (distance > maxDistance) { maxDistance = distance; farthest = i; }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, index) => keep[index]).map((point) => [...point]);
}

export function exteriorRings(feature) {
  const geometry = feature.geometry;
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((polygon) => polygon[0]);
  throw new Error('지원하지 않는 지도 도형: ' + geometry.type);
}

export function ringArea(ring) {
  let sum = 0;
  for (let i = 1; i < ring.length; i++) sum += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
  return Math.abs(sum / 2);
}

export function ringBounds(ring) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of ring) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      throw new Error('지도 링에 유효하지 않은 경위도가 있습니다.');
    }
    bbox[0] = Math.min(bbox[0], lng); bbox[1] = Math.min(bbox[1], lat);
    bbox[2] = Math.max(bbox[2], lng); bbox[3] = Math.max(bbox[3], lat);
  }
  return bbox;
}

export function largestRing(feature) {
  return exteriorRings(feature).reduce((largest, ring) => !largest || ringArea(ring) > ringArea(largest) ? ring : largest, null);
}

export function assertDateline(ring, label) {
  for (let i = 1; i < ring.length; i++) {
    if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) throw new Error('날짜변경선 횡단: ' + label + ' 점 ' + i);
  }
}

/* 비인접 선분이 서로를 가로지르면 전체 signed area가 양수여도 음수 winding
 * 영역이 생길 수 있다. 축소·투영·반올림 이후의 점에도 같은 검사를 적용한다. */
export function hasSelfIntersections(points) {
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  const ring = points.filter((point, i) => !i || point[0] !== points[i - 1][0] || point[1] !== points[i - 1][1]);
  const last = ring.length - 1;
  if (last < 3) return false;
  for (let i = 0; i < last; i++) {
    const a = ring[i], b = ring[i + 1];
    for (let j = i + 2; j < last; j++) {
      if (i === 0 && j === last - 1) continue;
      const c = ring[j], d = ring[j + 1];
      if (Math.max(a[0], b[0]) <= Math.min(c[0], d[0]) || Math.max(c[0], d[0]) <= Math.min(a[0], b[0]) ||
          Math.max(a[1], b[1]) <= Math.min(c[1], d[1]) || Math.max(c[1], d[1]) <= Math.min(a[1], b[1])) continue;
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true;
    }
  }
  return false;
}

/* 공유 국경을 양쪽 나라에서 따로 줄이면 흰 틈이 생긴다. 동일한 원본 arc는
 * 한 번만 줄이고 반대 방향 링에는 결과를 역순으로 사용한다. 불리언 union은 하지 않는다.
 * 링 시작점도 전역 anchor로 포함해 입력의 시작점과 닫힘을 그대로 보존한다. */
export function topologySimplifier(features, tolerance) {
  const pointKey = (point) => point.join(',');
  const neighbors = new Map();
  const edgeUses = new Map();
  const anchors = new Set();
  const rings = features.flatMap(exteriorRings);
  const edgeKey = (a, b) => a < b ? a + '|' + b : b + '|' + a;
  for (const ring of rings) {
    anchors.add(pointKey(ring[0]));
    for (let i = 1; i < ring.length; i++) {
      const a = pointKey(ring[i - 1]), b = pointKey(ring[i]);
      if (a === b) continue;
      const edge = edgeKey(a, b);
      edgeUses.set(edge, (edgeUses.get(edge) || 0) + 1);
      for (const [key, other] of [[a, b], [b, a]]) {
        if (!neighbors.has(key)) neighbors.set(key, new Set());
        neighbors.get(key).add(other);
      }
    }
  }
  for (const [key, adjacent] of neighbors) {
    const degrees = [...adjacent].map((other) => edgeUses.get(edgeKey(key, other)));
    if (adjacent.size !== 2 || new Set(degrees).size !== 1) anchors.add(key);
  }
  const cache = new Map();
  const ringCache = new Map();
  const refined = new Set();
  const stats = { uniqueArcs: 0, reusedArcs: 0, refinedArcs: 0 };
  function arcEntry(arc) {
    const keys = arc.map(pointKey);
    const reverse = keys[0] > keys[keys.length - 1];
    const canonical = reverse ? [...arc].reverse() : arc;
    const cacheKey = (reverse ? [...keys].reverse() : keys).join('|');
    let entry = cache.get(cacheKey);
    if (!entry) {
      entry = { source: canonical, reduced: simplify(canonical, tolerance), tolerance, refinements: 0 };
      cache.set(cacheKey, entry);
      stats.uniqueArcs++;
    } else stats.reusedArcs++;
    return { entry, reverse };
  }
  function entriesFor(ring) {
    if (ringCache.has(ring)) return ringCache.get(ring);
    let start = 0;
    const entries = [];
    for (let i = 1; i < ring.length; i++) {
      if (i !== ring.length - 1 && !anchors.has(pointKey(ring[i]))) continue;
      entries.push(arcEntry(ring.slice(start, i + 1)));
      start = i;
    }
    ringCache.set(ring, entries);
    return entries;
  }
  return {
    stats,
    simplifyRing(ring) {
      if (tolerance === 0) return ring.map((point) => [...point]);
      const result = [];
      for (const { entry, reverse } of entriesFor(ring)) {
        const reduced = reverse ? [...entry.reduced].reverse() : entry.reduced;
        result.push(...(result.length ? reduced.slice(1) : reduced));
      }
      return result;
    },
    refineRings(problemRings) {
      // 링별 결과를 덮어쓰지 않는다. 공유 arc의 정밀도를 올려 모든 이웃이 함께 갱신되게 한다.
      const entries = new Set(problemRings.flatMap((ring) => entriesFor(ring).map(({ entry }) => entry)));
      let changed = false;
      for (const entry of entries) {
        if (entry.tolerance === 0) continue;
        entry.refinements++;
        entry.tolerance = entry.refinements < 12 ? entry.tolerance / 2 : 0;
        entry.reduced = simplify(entry.source, entry.tolerance);
        refined.add(entry); changed = true;
      }
      stats.refinedArcs = refined.size;
      return changed;
    }
  };
}
