import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { assignCountryColors, colorDistance, countryNeighbors, prepareCountryPalette } from '../scripts/build-map-palette.mjs';

const read = (file) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
function fixture(reorder) {
  const forbidden = () => assert.fail('나라 색은 화면·테마·타이머에 의존하지 않는다');
  const context = { document: new Proxy({}, { get: forbidden }), matchMedia: forbidden,
    setTimeout: forbidden, setInterval: forbidden, requestAnimationFrame: forbidden };
  context.window = context;
  vm.createContext(context);
  for (const file of ['js/util.js', 'data/countries.js', 'data/map-coords.js', 'data/map-shapes.js', 'data/capital-coords.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  if (reorder) context.FQ.countries = reorder(Array.from(context.FQ.countries));
  vm.runInContext(read('js/map.js'), context, { filename: 'js/map.js' });
  return context.FQ;
}

function nodes(html, tag) {
  const result = new Map();
  for (const match of html.matchAll(new RegExp('<' + tag + '\\b[^>]*data-chain-country="([a-z]{2})"[^>]*>', 'g'))) {
    const attrs = Object.fromEntries(Array.from(match[0].matchAll(/([\w-]+)="([^"]*)"/g), (attribute) => [attribute[1], attribute[2]]));
    result.set(match[1], attrs);
  }
  return result;
}

test('명시 팔레트는 고유 RGB 256개이며 194개국은 그 안의 서로 다른 색을 쓴다', () => {
  const FQ = fixture(), palette = Array.from(FQ.map.palette256);
  assert.equal(palette.length, 256);
  assert.equal(new Set(palette).size, 256);
  assert.ok(palette.every((color) => /^#[0-9a-f]{6}$/.test(color)));
  assert.ok(Object.isFrozen(FQ.map.palette256), '다른 화면이 팔레트를 바꿔 나라 색을 흔들지 않는다');
  const countries = Array.from(FQ.countries);
  assert.equal(countries.length, 194);
  const colors = countries.map((country) => FQ.map.countryColor(country));
  assert.equal(new Set(colors).size, 194);
  assert.ok(colors.every((color) => palette.includes(color)), '194개 나라 색 모두 256색 팔레트에 속한다');
});

test('ISO 고정 색은 자료 순서·조회 순서·객체 또는 코드 입력에 따라 바뀌지 않는다', () => {
  const original = fixture(), reversed = fixture((countries) => countries.reverse());
  const rotated = fixture((countries) => countries.slice(71).concat(countries.slice(0, 71)));
  const before = JSON.stringify(original.countries);
  for (const country of original.countries) {
    const color = original.map.countryColor(country.code);
    assert.equal(original.map.countryColor(country), color);
    assert.equal(original.map.countryColor(' ' + country.code.toUpperCase() + ' '), color);
    assert.equal(reversed.map.countryColor(country.code), color);
    assert.equal(rotated.map.countryColor(country.code), color);
  }
  assert.equal(JSON.stringify(original.countries), before, '나라 데이터 순서나 내용을 바꾸지 않는다');
  original.countries = [original.countries[0]];
  assert.equal(original.map.countryColor('kr'), reversed.map.countryColor('kr'), '게임이 후보 목록을 바꿔도 이미 배정한 색은 유지한다');
});

test('서로 붙은 기니·코트디부아르와 중국·네팔은 눈에 띄는 색차를 유지한다', () => {
  const FQ = fixture();
  for (const [a, b] of [['gn', 'ci'], ['cn', 'np']]) {
    const left = FQ.map.countryColor(a), right = FQ.map.countryColor(b);
    assert.ok(colorDistance(left, right) >= 60, a + '/' + b + '는 고유 RGB뿐 아니라 충분한 CIE76 색차가 필요하다: ' + left + '/' + right);
  }
  const codes = FQ.countries.map((country) => country.code);
  const neighbors = countryNeighbors(codes, FQ.mapCoords, FQ.mapRegions);
  for (const [a, adjacent] of Object.entries(neighbors)) for (const b of adjacent) if (a < b) {
    assert.ok(colorDistance(FQ.map.countryColor(a), FQ.map.countryColor(b)) >= 30, '가까운 나라의 색차가 작다: ' + a + '/' + b);
  }
});

test('지리 기반 고정 표는 결정적으로 재현되며 새 국가 추가가 기존 194개 색 번호를 바꾸지 않는다', () => {
  const result = prepareCountryPalette(), rebuilt = prepareCountryPalette({ rebuild: true });
  assert.deepEqual(rebuilt.mapping, result.mapping, '전체 재배정도 같은 원자료와 seed에서 동일한 표를 생성한다');
  const FQ = fixture(), codes = FQ.countries.map((country) => country.code);
  const reversed = assignCountryColors([...codes].reverse(), FQ.mapCoords, FQ.mapRegions, result.palette);
  assert.deepEqual(reversed, result.mapping);
  const coordinates = { ...FQ.mapCoords, zz: [0, 0] };
  const regions = { ...FQ.mapRegions, zz: { bounds: [999, 499, 1001, 501], focusBounds: [999, 499, 1001, 501] } };
  const extended = assignCountryColors([...codes, 'zz'], coordinates, regions, result.palette, result.mapping);
  for (const code of codes) assert.equal(extended[code], result.mapping[code], '새 코드 때문에 기존 나라 색이 바뀌었다: ' + code);
  assert.ok(!Object.values(result.mapping).includes(extended.zz), '추가 국가는 아직 사용하지 않은 색만 고른다');
  assert.equal(new Set(Object.values(extended)).size, 195);
});

test('전체 194개 영역과 보조 단추는 같은 나라 색을 쓰고 소유자·선택이 바뀌어도 색을 유지한다', () => {
  const FQ = fixture(), countries = Array.from(FQ.countries);
  for (const owner of [0, 1]) {
    const owners = Object.fromEntries(countries.map((country) => [country.code, owner]));
    for (const activeCode of ['kr', 'jp', null]) {
      const html = FQ.map.collection(countries, { owners, activeCode });
      const paths = nodes(html, 'path'), markers = nodes(html, 'button');
      assert.equal(paths.size, 194);
      assert.equal(markers.size, 194);
      for (const country of countries) {
        const color = FQ.map.countryColor(country.code);
        for (const element of [paths.get(country.code), markers.get(country.code)]) {
          assert.equal(element['data-country-color'], color);
          assert.ok(element.style.includes('--chain-country-color:' + color));
          assert.ok(element.class.includes('chain-owner-' + owner), '소유자를 색 매핑과 별개로 보존한다');
        }
        assert.equal(paths.get(country.code).d, FQ.mapRegions[country.code].d, '나라 전체 경계를 보존한다');
        assert.equal(markers.get(country.code)['aria-pressed'], String(country.code === activeCode));
      }
    }
  }
});

test('알 수 없는 입력은 중립색이며 퀴즈·수도 표시에는 수집 색 속성을 추가하지 않는다', () => {
  const FQ = fixture();
  const neutral = FQ.map.countryColor('zz');
  assert.equal(neutral, '#64748b');
  assert.ok(!Array.from(FQ.map.palette256).includes(neutral));
  for (const value of [null, undefined, '', 42, {}, { code: 'zz' }, '__proto__', 'constructor']) {
    assert.equal(FQ.map.countryColor(value), neutral);
  }
  const kr = FQ.countries.find((country) => country.code === 'kr');
  const options = FQ.map.chooseOptions(kr, FQ.countries, 280);
  const quiz = FQ.map.render(options), study = FQ.map.study(kr);
  assert.doesNotMatch(quiz, /data-country-color|--chain-country-color|map-capital-marker/);
  assert.doesNotMatch(study, /data-country-color|--chain-country-color/);
  assert.match(study, /map-capital-marker/);
});
