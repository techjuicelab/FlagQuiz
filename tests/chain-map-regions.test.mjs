import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const context = { window: {} }; vm.createContext(context);
  for (const file of ['js/util.js', 'data/countries.js', 'data/map-coords.js', 'data/map-shapes.js', 'js/map.js', 'js/spoken-answer.js', 'js/country-chain.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context, { filename: file });
  }
  return context.window.FQ;
}
function regions(html) {
  return Array.from(html.matchAll(/<path\b[^>]*class="([^"]*\bchain-map-region\b[^"]*)"[^>]*>/g), match => {
    const attrs = Object.fromEntries(Array.from(match[0].matchAll(/([\w-]+)="([^"]*)"/g), attr => [attr[1], attr[2]]));
    return { code: attrs['data-chain-country'], attrs, classes: match[1].split(' ') };
  });
}

test('두 사람 모두 194개 나라의 실제 경계·섬·내륙국 구멍 전체를 자기 색으로 칠하고 중립 국경과 44px 보조 단추를 유지한다', () => {
  const FQ = fixture(), before = JSON.stringify([FQ.mapCoords, FQ.mapRegions]);
  for (const owner of [0, 1]) {
    const owners = Object.fromEntries(FQ.countries.map(country => [country.code, owner]));
    const html = FQ.map.collection(FQ.countries, { owners, activeCode: 'kr' }), paths = regions(html);
    assert.equal(paths.length, 194); assert.equal(new Set(paths.map(path => path.code)).size, 194);
    assert.equal((html.match(/class="map-country"/g) || []).length, 194, '누적 전에도 전체 나라 경계가 보인다');
    assert.equal((html.match(/<button[^>]*data-chain-country=/g) || []).length, 194);
    for (const country of FQ.countries) {
      const path = paths.find(item => item.code === country.code);
      assert.equal(path.attrs.d, FQ.mapRegions[country.code].d, country.code + ' 전체 도형 그대로');
      assert.equal(path.attrs['fill-rule'], 'evenodd', country.code + ' 내륙국 구멍');
      assert.equal(path.attrs['vector-effect'], 'non-scaling-stroke');
      assert.ok(path.classes.includes('chain-owner-' + owner));
      assert.equal(path.classes.includes('is-active'), country.code === 'kr');
    }
    assert.doesNotMatch(html, /map-capital-marker|answer-btn|is-correct|is-wrong/, '이어 말하기 누적 지도는 수도 퀴즈나 정오답 표시가 아니다');
  }
  assert.equal(JSON.stringify([FQ.mapCoords, FQ.mapRegions]), before, '누적 렌더링이 좌표와 경계를 바꾸지 않는다');
  const css = fs.readFileSync(new URL('../css/map.css', import.meta.url), 'utf8');
  assert.match(css, /\.chain-map-marker\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/);
});

test('같은 나라를 여러 번 넘겨도 영역과 단추를 한 번만 만들며 유효하지 않은 나라는 칠하지 않는다', () => {
  const FQ = fixture(), kr = FQ.countries.find(country => country.code === 'kr');
  const html = FQ.map.collection([kr, kr, kr, null, { code: 'zz', ko: '<script>' }], { owners: { kr: 1, zz: 0 } });
  assert.deepEqual(regions(html).map(path => path.code), ['kr']);
  assert.equal((html.match(/<button[^>]*data-chain-country=/g) || []).length, 1);
  assert.doesNotMatch(html, /<script>|data-chain-country="zz"/);
  assert.ok(regions(html)[0].classes.includes('chain-owner-1'));
});

test('accepted만 누적하고 중복·미확인·여러 나라 발화와 선택 변경은 기존 색과 차례를 바꾸지 않는다', () => {
  const FQ = fixture(), game = FQ.countryChain.createGame({ players: ['민규', '아빠'] });
  function draw(activeCode) {
    const state = game.snapshot(), owners = Object.fromEntries(state.history.map(entry => [entry.code, entry.playerIndex]));
    return FQ.map.collection(state.countries, { owners, activeCode });
  }
  assert.equal(game.submit('대한민국').status, 'accepted');
  assert.equal(game.submit('일본').status, 'accepted');
  const before = JSON.stringify(game.snapshot());
  const colors = html => regions(html).map(path => ({ code: path.code, d: path.attrs.d, owner: path.classes.find(name => /^chain-owner-/.test(name)) })).sort((a, b) => a.code.localeCompare(b.code));
  const previous = colors(draw('jp'));
  for (const said of ['한국', '달나라', '', '프랑스 또는 미국']) {
    assert.ok(['duplicate', 'unknown', 'ambiguous'].includes(game.submit(said).status), said);
    assert.equal(JSON.stringify(game.snapshot()), before, said + ' 차례와 기록 유지');
    assert.deepEqual(colors(draw('kr')), previous);
  }
  assert.equal(game.submit('프랑스').status, 'accepted');
  assert.deepEqual(regions(draw('fr')).map(path => [path.code, path.classes.find(name => /^chain-owner-/.test(name))]),
    [['kr', 'chain-owner-0'], ['jp', 'chain-owner-1'], ['fr', 'chain-owner-0']]);
});

test('말한 나라가 없거나 새 판을 시작하면 색칠을 비우고 중립 국가 경계는 남긴다', () => {
  const FQ = fixture();
  const html = FQ.map.collection([], { owners: { kr: 0, jp: 1 }, activeCode: 'kr' });
  assert.equal(regions(html).length, 0);
  assert.equal((html.match(/class="map-country"/g) || []).length, 194);
  assert.doesNotMatch(html, /data-chain-country=|chain-map-region|is-active/);
});
