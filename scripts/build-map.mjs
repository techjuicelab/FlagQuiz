/* 지도 자산 빌드. 앱 빌드와 분리되어 원자료를 명시적으로 준비한 경우만 실행한다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_RELATIVE_PATH, verifySource } from './fetch-map-source.mjs';
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = prepareMap();
    console.log(JSON.stringify({ matched: result.matched.size, excluded: result.excluded.length, ...result.stats }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
