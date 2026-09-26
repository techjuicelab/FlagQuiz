import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
function fixture() {
  const context = { window: {} };
  vm.createContext(context);
  for (const file of ['data/countries.js', 'data/map-coords.js', 'data/map-shapes.js', 'js/map.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return context.window.FQ;
}
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, message);

test('194개 나라의 공부 지도는 원좌표를 보존하고 세계 위치와 왜곡 없는 주변 확대를 함께 보여 준다', () => {
  const FQ = fixture();
  const before = JSON.stringify(FQ.mapCoords);
  for (const country of FQ.countries) {
    const html = FQ.map.study(country);
    const views = [...html.matchAll(/viewBox="([^"]+)"/g)].map(match => match[1].split(' ').map(Number));
    assert.equal(views.length, 2, country.code);
    assert.deepEqual(views[0], [0, 0, 2000, 1000]);
    const [vx, vy, vw, vh] = views[1];
    near(vw / vh, 4 / 3, country.code + ' 확대 가로세로 비율');
    assert.ok(vy >= 0 && vy + vh <= 1000, country.code + ' 위도 범위');
    const [lng, lat] = FQ.mapCoords[country.code];
    const x = (lng + 180) / 360 * 2000;
    const y = (90 - lat) / 180 * 1000;
    assert.ok(x >= vx && x <= vx + vw && y >= vy && y <= vy + vh, country.code + ' 확대 화면 안 대표 위치');
    const markers = [...html.matchAll(/class="map-location-marker"[^>]*style="left:([^%]+)%;top:([^%]+)%"/g)];
    assert.equal(markers.length, 2);
    near(Number(markers[0][1]), (lng + 180) / 360 * 100, country.code + ' 세계 경도');
    near(Number(markers[0][2]), (90 - lat) / 180 * 100, country.code + ' 세계 위도');
    near(vx + Number(markers[1][1]) / 100 * vw, x, country.code + ' 확대 경도 역투영');
    near(vy + Number(markers[1][2]) / 100 * vh, y, country.code + ' 확대 위도 역투영');
    assert.equal((html.match(/preserveAspectRatio="xMidYMid meet"/g) || []).length, 2);
    assert.ok(html.includes(country.ko));
    assert.match(html, /나라의 대표 위치/);
    assert.match(html, /국경을 나타내지는 않아요/);
    assert.doesNotMatch(html, /NaN|Infinity|<button|<script/);
  }
  assert.equal(JSON.stringify(FQ.mapCoords), before, '세계 및 확대 렌더링은 데이터에 쓰지 않는다');
});

test('날짜변경선을 지나는 확대 범위는 반대쪽 육지를 이어 붙이고 세계 지도 양 끝에서 같은 범위를 가리킨다', () => {
  const FQ = fixture();
  for (const code of ['fj', 'ki', 'nz']) {
    const country = FQ.countries.find(c => c.code === code);
    const html = FQ.map.study(country);
    const view = [...html.matchAll(/viewBox="([^"]+)"/g)][1][1].split(' ').map(Number);
    const [x, y, width, height] = view;
    assert.ok(x < 0 || x + width > 2000, code + ' 경도 경계 검사');
    assert.ok(html.includes('translate(' + (x < 0 ? '-2000' : '2000') + ' 0)'), code + ' 반대편 육지');
    const boxes = [...html.matchAll(/class="map-viewport-box"[^>]*style="left:([^%]+)%;top:([^%]+)%;width:([^%]+)%;height:([^%]+)%"/g)];
    assert.equal(boxes.length, 2, code + ' 세계 양 끝 범위 표시');
    let totalWidth = 0;
    for (const box of boxes) {
      const left = Number(box[1]), top = Number(box[2]), boxWidth = Number(box[3]), boxHeight = Number(box[4]);
      assert.ok(left >= 0 && left + boxWidth <= 100 + 1e-8);
      near(top, y / 1000 * 100, '범위 상단');
      near(boxHeight, height / 1000 * 100, '범위 높이');
      totalWidth += boxWidth;
    }
    near(totalWidth, width / 2000 * 100, code + ' 분할한 범위의 합');
  }
});

test('세계 지도만 요청하면 확대 지도를 생략하고 위치 설명은 기존 대륙·지역 데이터를 쓴다', () => {
  const FQ = fixture();
  const country = FQ.countries.find(c => c.code === 'kr');
  const html = FQ.map.study(country, { detail: false });
  assert.equal((html.match(/<svg\b/g) || []).length, 1);
  assert.doesNotMatch(html, /map-region-context|map-viewport-box/);
  assert.match(html, /map-learning--world-only/);
  const description = FQ.map.describe(country);
  assert.equal(description.continent, country.continent);
  assert.equal(description.region, country.region);
  assert.ok(description.text.includes(country.continent) && description.text.includes(country.region));
  assert.match(description.coordinates, /북위 .+° · 동경 .+°/);
  assert.throws(() => FQ.map.study({ code: 'missing' }), /좌표/);
  assert.throws(() => FQ.map.describe({ code: 'missing' }), /좌표/);
});

test('폰·태블릿·확대 지도에서 노르웨이 위치점과 퀴즈 번호가 대륙 이름표를 가리지 않는다', () => {
  const FQ = fixture();
  const norway = FQ.countries.find(c => c.code === 'no');
  const countries = ['no', 'cn', 'br', 'nz'].map(code => FQ.countries.find(c => c.code === code));
  function labels(html, width) {
    const suffix = width < 340 ? '' : width < 600 ? '-1' : width < 1000 ? '-2' : '-3';
    const font = width < 340 ? 11.2 : 16;
    return [...html.matchAll(/class="map-continent-label[^\"]*"[^>]*style="([^"]+)">([^<]+)/g)].map(match => {
      const css = Object.fromEntries(match[1].split(';').map(value => value.split(':')));
      const x = (parseFloat(css.left) + parseFloat(css['--map-label-x' + suffix])) / 100 * width;
      const y = parseFloat(css.top) / 100 * width / 2 + parseFloat(css['--map-label-y' + suffix]) / 100 * width;
      return { name: match[2], left: x - match[2].length * font / 2, right: x + match[2].length * font / 2,
        top: y - font * .6, bottom: y + font * .6 };
    });
  }
  for (const width of [236, 324, 400, 760, 1710]) {
    for (const quiz of [false, true]) {
      const html = quiz ? FQ.map.render(countries) : FQ.map.study(norway, { detail: false });
      for (const country of quiz ? countries : [norway]) {
        const [lng, lat] = FQ.mapCoords[country.code];
        const x = (lng + 180) / 360 * width, y = (90 - lat) / 180 * width / 2;
        const marker = quiz ? { left: x - 14, right: x + 14, top: y - 35, bottom: y + 5 }
          : { left: x - 12, right: x + 12, top: y - 12, bottom: y + 12 };
        for (const label of labels(html, width)) {
          const overlaps = label.left < marker.right && marker.left < label.right && label.top < marker.bottom && marker.top < label.bottom;
          assert.equal(overlaps, false, `${width}px ${quiz ? '퀴즈' : '공부'} ${country.code}/${label.name}`);
        }
      }
    }
  }
});
