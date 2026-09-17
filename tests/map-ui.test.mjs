import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { verifyMapScriptScope } from '../scripts/verify-expansion.mjs';

const read = (file) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
function fixture(seed = 1) {
  const math = Object.create(Math);
  math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
  const forbidden = () => assert.fail('지도 모듈은 화면 자원을 만들거나 반복 작업을 예약하지 않는다');
  const context = { Math: math, setTimeout: forbidden, setInterval: forbidden, requestAnimationFrame: forbidden,
    addEventListener: forbidden, matchMedia: forbidden, document: new Proxy({}, { get: forbidden }) };
  context.window = context;
  vm.createContext(context);
  for (const file of ['js/util.js', 'data/countries.js', 'data/map-coords.js', 'data/map-shapes.js', 'js/map.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return context.FQ;
}

// 실제 44px 사각 터치 영역을 따로 계산한다. 중심 간 대각선 거리로 대체하지 않는다.
function assertTargets(FQ, options, width) {
  const height = (width - 44) / 2 + 44;
  const boxes = options.map((country) => {
    const [lng, lat] = FQ.mapCoords[country.code];
    const x = 22 + (lng + 180) / 360 * (width - 44);
    const y = 22 + (90 - lat) / 180 * (height - 44);
    return { code: country.code, left: x - 22, right: x + 22, top: y - 22, bottom: y + 22 };
  });
  for (const [i, a] of boxes.entries()) {
    assert.ok(a.left >= 0 && a.right <= width && a.top >= 0 && a.bottom <= height, a.code + ' 화면 밖');
    for (const b of boxes.slice(0, i)) {
      const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      assert.equal(overlap, false, `${width}px ${a.code}/${b.code} 터치 영역 겹침`);
    }
  }
}

test('194개 정답의 실제 핀 네 개가 280·320·768·1024px에서 겹치지 않고 회전 뒤에도 유지된다', () => {
  const FQ = fixture(42);
  const before = JSON.stringify(FQ.mapCoords);
  for (const answer of FQ.countries) {
    const local = FQ.countries.filter((country) => country.continent === answer.continent);
    for (const width of [280, 320, 768, 1024]) {
      for (const source of [local, [answer], FQ.countries]) {
        const options = FQ.map.chooseOptions(answer, source, width, (width - 44) / 2 + 44);
        assert.equal(options.length, 4);
        assert.equal(new Set(options.map((country) => country.code)).size, 4);
        assert.ok(options.includes(answer));
        const codes = options.map((country) => country.code).join(',');
        for (const resized of [280, 320, 768, 1024]) {
          assertTargets(FQ, options, resized);
          assert.equal(FQ.map.fits(options, resized), true);
        }
        FQ.map.render(options);
        assert.equal(options.map((country) => country.code).join(','), codes, '렌더링과 크기 검사로 보기가 바뀌지 않는다');
      }
    }
  }
  assert.equal(JSON.stringify(FQ.mapCoords), before, '정답 좌표를 이동하거나 화면 좌표로 바꾸지 않는다');
});

test('가까운 유럽 나라만 있어도 세계 자료에서 겹치지 않는 보기를 보충한다', () => {
  const FQ = fixture(17);
  const answer = FQ.countries.find((country) => country.code === 'va');
  const source = FQ.countries.filter((country) => ['va', 'mc', 'sm', 'it'].includes(country.code));
  const options = FQ.map.chooseOptions(answer, source, 280);
  assertTargets(FQ, options, 280);
  assert.ok(options.some((country) => !source.includes(country)));
  assert.deepEqual(Array.from(FQ.mapCoords.va), [12.43, 41.9]);
  const bad = { code: 'missing', ko: '없음' };
  assert.throws(() => FQ.map.chooseOptions(bad, FQ.countries, 280), /좌표/);
  FQ.countries = [answer];
  assert.throws(() => FQ.map.chooseOptions(answer, [answer, answer, bad], 280), /네 개/);
});

test('육지 한 path와 한글 aria-label을 가진 HTML 버튼은 원자료 좌표를 그대로 렌더링한다', () => {
  const FQ = fixture(8);
  const options = FQ.map.chooseOptions(FQ.countries[0], FQ.countries, 280);
  const html = FQ.map.render(options);
  assert.equal((html.match(/<svg\b/g) || []).length, 1);
  assert.equal((html.match(/<path\b/g) || []).length, 1);
  assert.ok(html.includes('viewBox="0 0 2000 1000"'));
  assert.ok(html.includes('<path d="' + FQ.mapLand.d + '"></path>'));
  const svgEnd = html.indexOf('</svg>');
  assert.ok(html.indexOf('<button') > svgEnd, '핀은 SVG 바깥 HTML 버튼이다');
  assert.equal((html.match(/class="map-pin answer-btn"/g) || []).length, 4);
  for (const [index, country] of options.entries()) {
    const [lng, lat] = FQ.mapCoords[country.code];
    const button = html.match(new RegExp('<button[^>]+data-code="' + country.code + '"[^>]*>[\\s\\S]*?</button>'))?.[0];
    assert.ok(button);
    assert.ok(button.includes('aria-label="' + country.ko + '"'));
    const position = button.match(/style="left:([^%]+)%;top:([^%]+)%"/);
    assert.equal(Number(position[1]), (lng + 180) / 360 * 100);
    assert.equal(Number(position[2]), (90 - lat) / 180 * 100);
    assert.ok(button.endsWith('>' + (index + 1) + '</span></button>'));
  }
  assert.doesNotMatch(html, /is-correct|is-wrong|is-entering|<circle\b|<text\b|<image\b/);
  assert.throws(() => FQ.map.render([options[0], options[0], options[1], options[2]]), /네 개/);
});

test('핀은 기본 상태부터 보이며 44px을 유지하고 별도 화면 자원을 남기지 않는다', () => {
  const FQ = fixture();
  const options = FQ.map.chooseOptions(FQ.countries[0], [], 280);
  for (let i = 0; i < 10; i++) FQ.map.render(options);
  const css = read('css/map.css');
  const base = css.match(/\.map-board \.map-pin\s*\{([^}]+)\}/)[1];
  assert.match(base, /min-width:\s*44px/);
  assert.match(base, /min-height:\s*44px/);
  assert.match(base, /width:\s*44px/);
  assert.match(base, /height:\s*44px/);
  assert.match(base, /opacity:\s*1/);
  assert.match(base, /transform:\s*translate\(-50%, -50%\)/);
  assert.match(css, /\.map-land path\s*\{[^}]*stroke:\s*none/);
  assert.match(css, /aspect-ratio:\s*2\s*\/\s*1/);
  assert.match(css, /padding:\s*22px/);
  assert.doesNotMatch(css, /@keyframes|animation\s*:|opacity:\s*0/);
  // 아이패드 가로에서는 무대와 지도판을 나란히 놓아 남쪽 핀까지 스크롤 없이 닿는다. 세로·폰은 한 칸 그대로다.
  const landscape = css.slice(css.indexOf('@media (min-width: 760px) and (orientation: landscape)'));
  assert.match(landscape, /\.quiz-body\.map-quiz \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 5fr\) minmax\(0, 7fr\)/);
  assert.match(css.slice(0, css.indexOf('@media')), /\.quiz-body\.map-quiz \{ display: block; \}/);
  assert.match(read('index.html'), /href="css\/map.css"/);
  assert.match(read('index.html'), /src="js\/map.js"/);
  assert.match(read('sw.js'), /'\.\/css\/map.css'/);
  assert.match(read('sw.js'), /'\.\/js\/map.js'/);
});

test('지도 승인 범위 검사는 map.js만 허용하고 임의 스크립트나 기존 파일 삭제를 거부한다', () => {
  const actual = fs.readdirSync(new URL('../js', import.meta.url)).filter((file) => file.endsWith('.js'));
  function failures(files) {
    const result = [];
    verifyMapScriptScope({ ok(value, message) { if (!value) result.push(message); } }, files);
    return result;
  }
  assert.deepEqual(failures(actual), []);
  assert.match(failures(actual.concat('map-extra.js')).join('\n'), /승인 범위 밖/);
  assert.match(failures(actual.filter((file) => file !== 'app.js')).join('\n'), /기존 파일/);
});
