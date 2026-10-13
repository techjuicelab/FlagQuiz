/* 가까운 나라끼리 구별되도록 기존 밝은 256색 안에서 고정 색 번호를 배정한다. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const PALETTE_SEED_INDEX = 113;

export function colorLab(hex) {
  const rgb = [1, 3, 5].map((at) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  const [r, g, b] = rgb;
  const curve = (value) => value > (6 / 29) ** 3 ? Math.cbrt(value) : value / (3 * (6 / 29) ** 2) + 4 / 29;
  const x = curve((.4124564 * r + .3575761 * g + .1804375 * b) / .95047);
  const y = curve(.2126729 * r + .7151522 * g + .0721750 * b);
  const z = curve((.0193339 * r + .1191920 * g + .9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function colorDistance(a, b) {
  const aa = colorLab(a), bb = colorLab(b);
  return Math.hypot(...aa.map((value, index) => value - bb[index]));
}

function geographicDistance(a, b) {
  const dx = Math.min(Math.abs(a[0] - b[0]), 360 - Math.abs(a[0] - b[0])) * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180);
  return Math.hypot(dx, a[1] - b[1]);
}

export function countryNeighbors(codes, coordinates, regions) {
  const graph = Object.fromEntries([...codes].sort().map((code) => [code, new Set()]));
  const link = (a, b) => { graph[a].add(b); graph[b].add(a); };
  for (const a of Object.keys(graph)) {
    const close = Object.keys(graph).filter((b) => a !== b).sort((b, c) =>
      geographicDistance(coordinates[a], coordinates[b]) - geographicDistance(coordinates[a], coordinates[c]) || b.localeCompare(c));
    close.slice(0, 5).forEach((b) => link(a, b));
    for (const b of close) {
      const aa = regions[a].focusBounds || regions[a].bounds, bb = regions[b].focusBounds || regions[b].bounds;
      // 2000×1000 투영의 약 0.45°. 해외영토를 제외한 학습용 주영역으로 접촉·중첩을 판정한다.
      const dx = Math.max(0, aa[0] - bb[2], bb[0] - aa[2]);
      const dy = Math.max(0, aa[1] - bb[3], bb[1] - aa[3]);
      if (dx <= 2.5 && dy <= 2.5) link(a, b);
    }
  }
  return graph;
}

export function assignCountryColors(codes, coordinates, regions, palette, existing = {}) {
  if (new Set(palette).size !== 256 || palette.length !== 256) throw new Error('팔레트는 서로 다른 256색이어야 합니다.');
  if (codes.length > palette.length || new Set(codes).size !== codes.length || codes.some((code) => !/^[a-z]{2}$/.test(code))) {
    throw new Error('국가 코드가 중복되었거나 팔레트의 범위를 넘었습니다.');
  }
  for (const code of codes) {
    const coordinate = coordinates[code], region = regions[code], bounds = region && (region.focusBounds || region.bounds);
    if (!Array.isArray(coordinate) || coordinate.length !== 2 || !coordinate.every(Number.isFinite) ||
        !Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) throw new Error('나라의 지리 자료가 없습니다: ' + code);
  }
  const graph = countryNeighbors(codes, coordinates, regions);
  const assigned = {}, used = new Set();
  const distances = palette.map((color) => palette.map((other) => colorDistance(color, other)));
  for (const code of Object.keys(graph)) {
    const index = existing[code];
    if (index === undefined) continue;
    if (!Number.isInteger(index) || index < 0 || index >= palette.length || used.has(index)) throw new Error('기존 국가 색 번호 오류: ' + code);
    assigned[code] = index; used.add(index);
  }
  while (Object.keys(assigned).length < codes.length) {
    const candidates = Object.keys(graph).filter((code) => assigned[code] === undefined);
    const assignedNeighbors = (code) => [...graph[code]].filter((neighbor) => assigned[neighbor] !== undefined);
    candidates.sort((a, b) => assignedNeighbors(b).length - assignedNeighbors(a).length || graph[b].size - graph[a].size || a.localeCompare(b));
    const code = candidates[0], neighbors = assignedNeighbors(code);
    let best = -1, bestMinimum = -1, bestAverage = -1;
    for (let index = 0; index < palette.length; index++) {
      if (used.has(index)) continue;
      // 미배정 이웃만 있는 새 대륙은 이미 쓴 전체 색과의 거리로 시작한다. 최초 색 번호는 고정 seed다.
      const references = neighbors.length ? neighbors.map((neighbor) => assigned[neighbor]) : [...used];
      const values = references.map((other) => distances[index][other]);
      const minimum = values.length ? Math.min(...values) : (index === PALETTE_SEED_INDEX ? Infinity : 0);
      const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      if (minimum > bestMinimum || (minimum === bestMinimum && average > bestAverage)) {
        best = index; bestMinimum = minimum; bestAverage = average;
      }
    }
    if (best < 0) throw new Error('사용하지 않은 나라 색이 부족합니다.');
    assigned[code] = best; used.add(best);
  }
  return Object.fromEntries(Object.keys(assigned).sort().map((code) => [code, assigned[code]]));
}

export function prepareCountryPalette({ rebuild = false } = {}) {
  const context = { window: {} };
  for (const file of ['countries', 'map-coords', 'map-shapes']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'data/' + file + '.js'), 'utf8'), context);
  }
  const source = fs.readFileSync(path.join(root, 'js/map.js'), 'utf8');
  const paletteLiteral = /var PALETTE_256 = Object\.freeze\((\[[\s\S]*?\])\);/.exec(source);
  const mappingLiteral = /var COUNTRY_COLOR_INDEX = Object\.freeze\((\{[\s\S]*?\})\);/.exec(source);
  if (!paletteLiteral || !mappingLiteral) throw new Error('지도 파일에서 팔레트와 국가 색 번호 표를 찾지 못했습니다.');
  const palette = vm.runInNewContext(paletteLiteral[1]);
  const existing = rebuild ? {} : vm.runInNewContext('(' + mappingLiteral[1] + ')');
  const FQ = context.window.FQ;
  const codes = FQ.countries.map((country) => country.code).sort();
  const mapping = assignCountryColors(codes, FQ.mapCoords, FQ.mapRegions, palette, existing);
  return { mapping, palette, source, graph: countryNeighbors(codes, FQ.mapCoords, FQ.mapRegions) };
}

export function emitCountryPalette(options = {}) {
  const result = prepareCountryPalette(options);
  const entries = Object.entries(result.mapping);
  const rows = Array.from({ length: Math.ceil(entries.length / 8) }, (_, index) => '    ' + entries.slice(index * 8, index * 8 + 8)
    .map(([code, colorIndex]) => code + ': ' + colorIndex).join(', '));
  const table = 'var COUNTRY_COLOR_INDEX = Object.freeze({\n' + rows.join(',\n') + '\n  });';
  fs.writeFileSync(path.join(root, 'js/map.js'), result.source.replace(/var COUNTRY_COLOR_INDEX = Object\.freeze\(\{[\s\S]*?\}\);/, table));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--write', '--rebuild'].includes(arg))) { console.error('사용법: node scripts/build-map-palette.mjs [--write] [--rebuild]'); process.exitCode = 1; }
  else try {
    // 기본값은 기존 색 번호를 고정한다. 전체 재배정은 검토 후 명시적인 --rebuild로만 한다.
    const result = args.includes('--write') ? emitCountryPalette({ rebuild: args.includes('--rebuild') }) : prepareCountryPalette({ rebuild: args.includes('--rebuild') });
    const contrasts = [];
    for (const [a, neighbors] of Object.entries(result.graph)) for (const b of neighbors) if (a < b) {
      contrasts.push(colorDistance(result.palette[result.mapping[a]], result.palette[result.mapping[b]]));
    }
    console.log(JSON.stringify({ countries: Object.keys(result.mapping).length, neighborPairs: contrasts.length,
      minimumNeighborCie76: Math.min(...contrasts), meanNeighborCie76: contrasts.reduce((sum, value) => sum + value, 0) / contrasts.length,
      samples: [['gn', 'ci'], ['cn', 'np']].map(([a, b]) => ({ countries: [a, b], colors: [a, b].map((code) => result.palette[result.mapping[code]]),
        cie76: colorDistance(result.palette[result.mapping[a]], result.palette[result.mapping[b]]) })) }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
