import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { FQ: { util: {} } };
context.window = context;
for (const file of ['data/countries.js', 'data/map-coords.js', 'data/map-shapes.js', 'js/map.js']) {
  vm.runInNewContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
}

test('기록 지도는 전체194개국을 좌표 그대로 유지하고 퀴즈의4개 제한을 적용하지 않는다', () => {
  const html = context.FQ.map.collection(context.FQ.countries, { activeCode: 'kr', owners: { jp: 1 } });
  assert.equal((html.match(/data-chain-country=/g) || []).length, 194);
  for (const country of context.FQ.countries) {
    const [lng, lat] = context.FQ.mapCoords[country.code];
    const marker = html.match(new RegExp('<button[^>]+data-chain-country="' + country.code + '"[^>]+>'))[0];
    assert.match(marker, new RegExp('left:' + String((lng + 180) / 360 * 100).replaceAll('.', '\\.') + '%'));
    assert.match(marker, new RegExp('top:' + String((90 - lat) / 180 * 100).replaceAll('.', '\\.') + '%'));
  }
  assert.match(html, /chain-owner-1[^>]+data-chain-country="jp"/);
  assert.match(html, /is-active[^>]+data-chain-country="kr"[^>]+aria-pressed="true"/);
});

test('같은나라 중복입력과 잘못된 좌표는 지도표시를 복제하거나 지도밖으로 밀지 않는다', () => {
  const kr = context.FQ.countries.find(country => country.code === 'kr');
  const html = context.FQ.map.collection([kr, kr, { code: 'zz', ko: '<script>' }]);
  assert.equal((html.match(/data-chain-country=/g) || []).length, 1);
  assert.doesNotMatch(html, /<script>|zz/);
});
