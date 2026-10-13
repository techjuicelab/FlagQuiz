import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { CAPITAL_SOURCES, verifyCapitalSource } from '../scripts/fetch-capital-source.mjs';
import { buildCapitalCoordinates, prepareCapitalCoordinates } from '../scripts/build-capital-coords.mjs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
function fixture() {
  const context = { window: {} }; vm.createContext(context);
  for (const file of ['js/util.js', 'data/countries.js', 'data/map-coords.js', 'data/map-shapes.js', 'data/capital-coords.js', 'js/map.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return context.window.FQ;
}
const plain = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, message + ': ' + actual + ' / ' + expected);
const project = ([lng, lat]) => [(lng + 180) / 360 * 2000, (90 - lat) / 180 * 1000];
function mapSvgs(html) {
  return Array.from(html.matchAll(/<svg class="(map-context-land|map-inset-shape)" viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/svg>/g), match =>
    ({ type: match[1], view: match[2].split(' ').map(Number), html: match[3] }));
}
function marker(svg) {
  const tags = [...svg.html.matchAll(/<g class="map-capital-marker" ([^>]+)>/g)];
  assert.equal(tags.length, 1, '확대 지도마다 수도 표시 하나');
  const attrs = Object.fromEntries([...tags[0][1].matchAll(/([\w-]+)="([^"]+)"/g)].map(match => [match[1], match[2]]));
  const position = attrs.transform.match(/^translate\(([^ ]+) ([^)]+)\)$/).slice(1).map(Number);
  return { attrs, position };
}

test('원자료 없이도 생성된 194개 수도 좌표·도시 출처·앱 이름과 나라 대표점 분리를 검증한다', () => {
  const FQ = fixture();
  const codes = Array.from(FQ.countries, country => country.code).sort();
  assert.equal(codes.length, 194);
  assert.deepEqual(Object.keys(FQ.capitalCoords).sort(), codes);
  assert.deepEqual(Object.keys(FQ.capitalCoordSources).sort(), codes);
  assert.deepEqual(Array.from(FQ.capitalCoordMeta.coordinateOrder), ['lng', 'lat']);
  assert.equal(FQ.capitalCoordMeta.decimalPlaces, 6);
  let differentFromCountryPoint = 0;
  for (const country of FQ.countries) {
    const point = FQ.capitalCoords[country.code], metadata = FQ.capitalCoordSources[country.code];
    assert.ok(point.length === 2 && point.every(Number.isFinite));
    assert.ok(Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90);
    assert.ok(point.every(value => Number(value.toFixed(6)) === value));
    assert.equal(metadata.capital, country.capital); assert.equal(metadata.capitalEn, country.capitalEn);
    assert.ok(CAPITAL_SOURCES[metadata.source]); assert.ok(Number.isFinite(metadata.sourceId));
    assert.ok(metadata.sourceName && metadata.sourceCountry && metadata.sourceDesignation);
    const source = FQ.capitalCoordMeta.sources[metadata.source];
    assert.equal(source.sha256, CAPITAL_SOURCES[metadata.source].sha256);
    assert.equal(source.url, CAPITAL_SOURCES[metadata.source].url);
    if (point.some((value, index) => value !== FQ.mapCoords[country.code][index])) differentFromCountryPoint++;
  }
  assert.ok(differentFromCountryPoint > 180, '나라 위치점을 수도 위치로 복사하지 않는다');
});

const rawSourcesAvailable = Object.values(CAPITAL_SOURCES).every(source => fs.existsSync(new URL('../' + source.path, import.meta.url)));
test('원자료가 준비되면 194개 수도의 고정 SHA·도시 ID·좌표와 재생성 결과를 대조한다', {
  skip: rawSourcesAvailable ? false : '수도 원자료 미보유: capitals:fetch 후 원자료 대조를 실행한다. 생성된 자료와 지도 검사는 계속 실행한다.'
}, () => {
  const FQ = fixture(), data = {};
  assert.equal(Object.keys(FQ.capitalCoords).length, 194);
  assert.deepEqual(Object.keys(FQ.capitalCoords).sort(), Array.from(FQ.countries, country => country.code).sort());
  assert.deepEqual(Object.keys(FQ.capitalCoordSources).sort(), Object.keys(FQ.capitalCoords).sort());
  assert.deepEqual(Array.from(FQ.capitalCoordMeta.coordinateOrder), ['lng', 'lat']);
  assert.equal(FQ.capitalCoordMeta.decimalPlaces, 6);
  for (const [key, source] of Object.entries(CAPITAL_SOURCES)) {
    const bytes = fs.readFileSync(new URL('../' + source.path, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, key + ' 고정 원자료');
    assert.equal(FQ.capitalCoordMeta.sources[key].sha256, source.sha256);
    assert.equal(FQ.capitalCoordMeta.sources[key].url, source.url);
    data[key] = verifyCapitalSource(bytes, key);
    assert.throws(() => verifyCapitalSource(Buffer.concat([bytes, Buffer.from('\n')]), key), /SHA-256 불일치/);
  }
  let differentFromCountryPoint = 0;
  for (const country of FQ.countries) {
    const point = FQ.capitalCoords[country.code], metadata = FQ.capitalCoordSources[country.code];
    assert.ok(point.length === 2 && point.every(Number.isFinite));
    assert.ok(Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90);
    assert.ok(point.every(value => Number(value.toFixed(6)) === value));
    assert.equal(metadata.capital, country.capital); assert.equal(metadata.capitalEn, country.capitalEn);
    let original;
    if (metadata.source === 'natural-earth') {
      const cities = data[metadata.source].features.filter(city => city.properties.ne_id === metadata.sourceId);
      assert.equal(cities.length, 1, country.code + ' 원자료 도시 ID');
      const city = cities[0]; original = city.geometry.coordinates;
      assert.equal(city.geometry.type, 'Point');
      assert.equal(city.properties.iso_a2.toLowerCase(), country.code);
      assert.equal(city.properties.name, metadata.sourceName);
    } else {
      const cities = data[metadata.source].features.filter(city => city.attributes.ufi === metadata.sourceId && city.attributes.uni === metadata.nameId);
      assert.equal(cities.length, 1, country.code + ' NGA 도시 이름 ID');
      const city = cities[0].attributes; original = [city.long_dd, city.lat_dd];
      assert.equal(city.full_name, metadata.sourceName);
      assert.equal(city.cc_ft, metadata.sourceCountry);
      assert.equal(city.desig_cd, metadata.sourceDesignation);
      assert.equal(city.nt, 'N');
    }
    assert.deepEqual(Array.from(point), original.map(value => Number(value.toFixed(6))), country.code + ' 실제 도시 좌표');
    if (point.some((value, index) => value !== FQ.mapCoords[country.code][index])) differentFromCountryPoint++;
  }
  assert.ok(differentFromCountryPoint > 180, '나라 위치점을 수도 위치로 복사하지 않는다');
  const generated = prepareCapitalCoordinates();
  assert.deepEqual(generated.coords, plain(FQ.capitalCoords));
  assert.deepEqual(generated.sources, plain(FQ.capitalCoordSources));
});

test('새 적도기니 수도와 수도 도시가 별도로 확인된 나우루·팔라우는 명시된 도시만 연결한다', () => {
  const FQ = fixture(), gq = FQ.countries.find(country => country.code === 'gq');
  assert.equal(gq.capital, '시우다드데라파스'); assert.equal(gq.capitalEn, 'Ciudad de la Paz');
  assert.deepEqual(Array.from(FQ.capitalCoords.gq), [10.823611, 1.5925]);
  assert.equal(FQ.capitalCoordSources.gq.sourceId, 14999106);
  assert.equal(FQ.capitalCoordSources.gq.sourceName, 'Ciudad de la Paz');
  assert.match(FQ.capitalCoordSources.gq.corroboration, /^https:\/\/www\.guineaecuatorialpress\.com\//);
  assert.equal(FQ.capitalCoordSources.nr.sourceName, 'Yaren');
  assert.equal(FQ.capitalCoordSources.nr.sourceId, -1187314);
  assert.equal(FQ.capitalCoordSources.pw.sourceName, 'Ngerulmud');
  assert.equal(FQ.capitalCoordSources.pw.sourceId, 13976139);
});

test('도시 이름·국가·자료 형태가 맞지 않으면 나라 대표점이나 다른 도시로 조용히 대체하지 않는다', () => {
  const country = { code: 'zz', capital: '예시수도', capitalEn: 'Example Town' };
  const city = (overrides = {}) => ({ properties: { iso_a2: 'ZZ', name: 'Example Town', ne_id: 123, adm0cap: 1, ...overrides },
    geometry: { type: 'Point', coordinates: [127.1234567, 37.1234567] } });
  assert.deepEqual(buildCapitalCoordinates([country], [city()]).coords, { zz: [127.123457, 37.123457] });
  for (const places of [[], [city({ iso_a2: 'AA' })], [city({ name: 'Different City' })], [city(), city()]]) {
    assert.throws(() => buildCapitalCoordinates([country], places), /하나로 매칭하지 못했습니다/);
  }
  assert.throws(() => buildCapitalCoordinates([country, country], [city()]), /중복/);
  assert.throws(() => buildCapitalCoordinates([{ ...country, capitalEn: '' }], [city()]), /수도 이름/);
  const notPoint = city(); notPoint.geometry.type = 'Polygon';
  assert.throws(() => buildCapitalCoordinates([country], [notPoint]), /Point가 아닙니다/);
  const invalid = city(); invalid.geometry.coordinates = [181, 37];
  assert.throws(() => buildCapitalCoordinates([country], [invalid]), /경위도가 유효하지 않습니다/);
});

test('194개 수도 별표는 지역 지도와 작은 나라 확대창의 실제 경위도에 놓이고 세계·문제 지도에는 답을 노출하지 않는다', () => {
  const FQ = fixture(), before = JSON.stringify([FQ.mapCoords, FQ.capitalCoords, FQ.mapRegions]);
  for (const country of FQ.countries) {
    const html = FQ.map.study(country), svgs = mapSvgs(html), coordinate = FQ.capitalCoords[country.code];
    const projected = project(coordinate);
    assert.ok(svgs.length >= 2);
    assert.doesNotMatch(svgs[0].html, /map-capital-marker|map-capital-star/);
    for (const svg of svgs.slice(1)) {
      const { attrs, position: [x, y] } = marker(svg);
      assert.equal(attrs['data-code'], country.code);
      assert.equal(Number(attrs['data-capital-lng']), coordinate[0]);
      assert.equal(Number(attrs['data-capital-lat']), coordinate[1]);
      near(y, projected[1], country.code + ' 수도 위도 역투영');
      assert.ok([-2000, 0, 2000].some(offset => Math.abs(x - projected[0] - offset) < 1e-8), country.code + ' 수도 경도 역투영');
      const [left, top, width, height] = svg.view;
      assert.ok(x >= left && x <= left + width && y >= top && y <= top + height, country.code + ' 수도 표시가 확대창 안');
      assert.match(svg.html, /<circle class="map-capital-halo"/);
      assert.match(svg.html, /<path class="map-capital-star"/);
    }
    const label = html.match(/class="map-capital-label[^\"]*"[^>]*style="left:([^%]+)%;top:([^%]+)%[^\"]*"[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>/);
    assert.ok(label, country.code + ' 수도 이름표'); assert.equal(label[3], country.capital);
    const [left, top, width, height] = svgs[1].view, local = marker(svgs[1]).position;
    near(left + Number(label[1]) / 100 * width, local[0], country.code + ' 이름표 경도');
    near(top + Number(label[2]) / 100 * height, local[1], country.code + ' 이름표 위도');
    assert.ok(html.includes('별표는 수도 ' + country.capital + '의 실제 위치입니다.'));
    assert.doesNotMatch(FQ.map.study(country, { detail: false }), /map-capital-marker|map-capital-label/);
  }
  const options = FQ.map.chooseOptions(FQ.countries[0], FQ.countries, 280);
  assert.doesNotMatch(FQ.map.render(options), /map-capital-marker|map-capital-label/);
  assert.doesNotMatch(FQ.map.collection(options), /map-capital-marker|map-capital-label/);
  assert.equal(JSON.stringify([FQ.mapCoords, FQ.capitalCoords, FQ.mapRegions]), before, '표시 때문에 실제 좌표나 경계를 이동하지 않는다');
});

test('날짜변경선 반대편 수도는 원경위를 유지한 채 이어진 지역 지도 안에 놓인다', () => {
  const FQ = fixture(), country = { code: 'zz', ko: '날짜변경선 나라', capital: '날짜변경선 수도', continent: '오세아니아' };
  FQ.mapCoords.zz = [179, 1]; FQ.capitalCoords.zz = [-179, 1];
  FQ.mapRegions = { ...FQ.mapRegions, zz: { d: 'M1950 490L2000 490L2000 510L1950 510L1950 490ZM0 490L20 490L20 510L0 510L0 490Z',
    bounds: [0, 490, 2000, 510], focusBounds: [1950, 490, 2000, 510] } };
  const html = FQ.map.study(country), region = mapSvgs(html)[1], { attrs, position: [x, y] } = marker(region);
  assert.equal(Number(attrs['data-capital-lng']), -179);
  near(x, project([-179, 1])[0] + 2000, '이웃한 경도 복사본 선택'); near(y, project([-179, 1])[1], '위도 유지');
  assert.ok(x >= region.view[0] && x <= region.view[0] + region.view[2]);
  assert.match(region.html, /translate\(2000 0\)/);
});

test('수도 좌표가 누락되거나 유효하지 않으면 나라 대표점에 가짜 수도 표시를 만들지 않는다', () => {
  const FQ = fixture(), country = FQ.countries.find(item => item.code === 'kr');
  for (const value of [undefined, [NaN, 37], [181, 37], [127]]) {
    FQ.capitalCoords.kr = value;
    assert.doesNotMatch(FQ.map.study(country), /map-capital-marker|map-capital-label/);
  }
});

test('193개 수도는 자기 나라 영역 안에 있고 니코시아 원자료의 UN 완충지대 예외만 명시적으로 보존한다', () => {
  const FQ = fixture(), outside = [];
  function inside(code, coordinate) {
    const [x, y] = project(coordinate); let filled = false;
    for (const part of FQ.mapRegions[code].d.split('Z').filter(Boolean)) {
      const values = part.match(/-?\d+(?:\.\d+)?/g).map(Number);
      const ring = Array.from({ length: values.length / 2 }, (_, index) => values.slice(index * 2, index * 2 + 2));
      for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
        const a = ring[index], b = ring[previous];
        if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) filled = !filled;
      }
    }
    return filled;
  }
  for (const country of FQ.countries) if (!inside(country.code, FQ.capitalCoords[country.code])) outside.push(country.code);
  assert.deepEqual(outside, ['cy'], '명시한 니코시아 경계 예외 외에는 실제 수도가 자기 나라 영역 안이어야 한다');
  const exception = FQ.capitalCoordSources.cy;
  assert.equal(exception.geometryException, 'cyprus-un-buffer-zone');
  assert.equal(exception.capital, '니코시아');
  assert.match(exception.note, /buffer|완충/i);
  assert.match(exception.geometrySource, /^https:\/\/raw\.githubusercontent\.com\/nvkelso\/natural-earth-vector\/v5\.1\.2\/geojson\/ne_10m_admin_0_countries\.geojson$/);
  for (const [outer, enclave] of [['it', 'va'], ['it', 'sm'], ['za', 'ls']]) {
    assert.equal(inside(outer, FQ.capitalCoords[enclave]), false, outer + '/' + enclave + ' 수도에 다른 나라 색을 덮지 않는다');
  }
});
