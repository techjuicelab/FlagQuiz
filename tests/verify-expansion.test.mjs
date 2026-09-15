import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildLand } from '../scripts/build-map.mjs';
import { verifyAudioCache, verifyActivateKeepsAudio, verifyMapTolerance,
  verifyMapGeometry, verifySmallLandPreservation, verifyUiVoicePhrases } from '../scripts/verify-expansion.mjs';

const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const buildMap = fs.readFileSync(new URL('../scripts/build-map.mjs', import.meta.url), 'utf8');
const headers = Object.fromEntries(['map-coords.js', 'map-shapes.js'].map(name => [name,
  fs.readFileSync(new URL('../data/' + name, import.meta.url), 'utf8').split('\n').filter(line => line.startsWith('//')).join('\n')
]));

function replaceOnce(source, original, replacement) {
  assert.equal(source.split(original).length, 2, '변이 지점은 실제 코드에 정확히 한 번 있어야 한다: ' + original);
  return source.replace(original, replacement);
}

async function problems(check, ...args) {
  const failures = [];
  const t = {
    ok(value, message, detail) { if (!value) failures.push(message + (detail === undefined ? '' : ': ' + detail)); },
    note() {},
    skip(reason) { assert.fail('회귀 검사에서 미구현으로 건너뛰면 안 됩니다: ' + reason); }
  };
  try { await check(t, ...args); }
  catch (error) { failures.push(error.message); }
  return failures;
}

function voiceAssets() {
  const context = { window: {} };
  for (const file of ['data/countries.js', 'js/voice-manifest.js']) {
    vm.runInNewContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
  }
  return [context.window.FQ.countries, context.window.FQ.voiceManifest];
}

test('금지6 검사는 194개국의 실제 이름·설명 버튼 발화를 기존 음원과 대조한다', async () => {
  assert.deepEqual(await problems(verifyUiVoicePhrases, ui, ...voiceAssets()), []);
  const renamed = ui.replaceAll('var lines =', 'var spokenLines =').replaceAll('FQ.audio.say(lines,', 'FQ.audio.say(spokenLines,');
  assert.notEqual(renamed, ui);
  assert.deepEqual(await problems(verifyUiVoicePhrases, renamed, ...voiceAssets()), [], '변수 이름은 음성 문구 계약이 아니다');
});

test('금지6 검사는 이름·설명 버튼의 미등록 문구와 발화 제거를 모두 거부한다', async () => {
  const assets = voiceAssets();
  const extraExplain = replaceOnce(ui, '[country.ko, country.flagHint, country.fact]',
    "[country.ko, country.flagHint, country.fact, '새 지도 안내 문구']");
  const extraName = replaceOnce(ui, ': [country.ko];', ": [country.ko, '새 나라 이름 문구'];");
  for (const [source, button] of [[extraExplain, 'data-explain'], [extraName, 'data-speak']]) {
    const failed = await problems(verifyUiVoicePhrases, source, ...assets);
    assert.ok(failed.some(message => message.includes('기존 수아 음원에 없는 UI 문구') && message.includes(button)), failed.join('\n'));
  }
  // 마지막 나라만 새 문구를 읽게 하여 일부 국가 표본만 검사하는 회귀도 잡는다.
  const lastCode = assets[0].at(-1).code;
  const oneCountry = replaceOnce(ui, ': [country.ko];',
    ': [country.code === ' + JSON.stringify(lastCode) + " ? '마지막 나라의 새 문구' : country.ko];");
  assert.ok((await problems(verifyUiVoicePhrases, oneCountry, ...assets)).some(message => message.includes(lastCode + ' data-speak')));
  const silent = replaceOnce(ui, 'FQ.audio.say(lines,', 'void (lines,');
  assert.ok((await problems(verifyUiVoicePhrases, silent, ...assets)).some(message => /재생 문구가 없다/.test(message)));
});

test('확장 검사기는 헬퍼를 통한 실제 v4 음원 조회·저장과 활성화를 통과시킨다', async () => {
  assert.deepEqual(await problems(verifyAudioCache, sw), []);
  assert.deepEqual(await problems(verifyActivateKeepsAudio, sw), []);
  const renamed = sw.replaceAll('matchCache', 'readBucket').replaceAll('putCache', 'saveBucket');
  assert.notEqual(renamed, sw);
  assert.deepEqual(await problems(verifyAudioCache, renamed), [], '헬퍼 이름은 음원 캐시 계약이 아니다');
  assert.deepEqual(await problems(verifyActivateKeepsAudio, renamed), []);
});

test('검사기는 음원 조회·저장 버킷을 따로 바꾼 변이를 모두 거부한다', async () => {
  const mutants = [
    ['조회 버킷', replaceOnce(sw, 'matchCache(AUDIO_CACHE, whole)', 'matchCache(SHELL_CACHE, whole)')],
    ['저장 버킷', replaceOnce(sw, 'putCache(AUDIO_CACHE, whole, copy)', 'putCache(SHELL_CACHE, whole, copy)')],
    ['음원 버킷명', replaceOnce(sw, "var AUDIO_CACHE = 'flagquiz-v4';", "var AUDIO_CACHE = 'flagquiz-audio-v1';")]
  ];
  for (const [name, source] of mutants) {
    assert.ok((await problems(verifyAudioCache, source)).length > 0, name + ' 위반을 놓쳤다');
  }
});

test('검사기는 음원 버킷 삭제와 버킷 내부 음원 삭제를 모두 거부한다', async () => {
  const mutants = [
    ['버킷 삭제', replaceOnce(sw, '[SHELL_CACHE, FLAG_CACHE, ART_CACHE, AUDIO_CACHE]', '[SHELL_CACHE, FLAG_CACHE, ART_CACHE]')],
    ['음원 항목 삭제', replaceOnce(sw,
      "return new URL(req.url).pathname.indexOf('/audio/') === -1;", 'return true;')]
  ];
  for (const [name, source] of mutants) {
    const failed = await problems(verifyActivateKeepsAudio, source);
    assert.ok(failed.some(message => /음원.*삭제|음원 캐시.*지운다/.test(message)), name + ': ' + failed.join('\n'));
    assert.ok(failed.some(message => /기존 음원 항목을 삭제/.test(message)), name + ' 후 실제 캐시 내용 유실을 확인하지 못했다');
  }
});

test('검사기는 이름을 유지한 음원 본문 손상도 잡는다', async () => {
  const source = replaceOnce(sw,
    '.then(function () { return self.clients.claim(); })',
    ".then(function () { return caches.open(AUDIO_CACHE).then(function (cache) { return cache.put('https://example.test/FlagQuiz/audio/sua/kept.mp3', new Response('corrupted')); }); })\n      .then(function () { return self.clients.claim(); })");
  const failed = await problems(verifyActivateKeepsAudio, source);
  assert.ok(failed.some(message => /음원 바이트가 달라졌다/.test(message)), failed.join('\n'));
});

test('검사기는 전역 캐시 조회로 인한 옛 셸과 다른 앱 스크립트 오염을 잡는다', async () => {
  const source = replaceOnce(sw,
    'return caches.open(name).then(function (cache) { return cache.match(req); });',
    'return caches.match(req);');
  const failed = await problems(verifyActivateKeepsAudio, source);
  assert.ok(failed.some(message => /오프라인 탐색.*현재 셸/.test(message)), failed.join('\n'));
  assert.ok(failed.some(message => /누락 스크립트.*다른 버킷/.test(message)), failed.join('\n'));
});

test('지도 검사기는 근거가 있는 0.5와 기본 0.7을 생성 헤더와 함께 허용한다', async () => {
  assert.deepEqual(await problems(verifyMapTolerance, buildMap, headers), []);
  const base = replaceOnce(buildMap, 'SIMPLIFY_TOLERANCE_DEG = 0.5;', 'SIMPLIFY_TOLERANCE_DEG = 0.7;');
  const baseHeaders = Object.fromEntries(Object.entries(headers).map(([name, header]) => [name, header.replace('허용 오차: 0.5', '허용 오차: 0.7')]));
  assert.deepEqual(await problems(verifyMapTolerance, base, baseHeaders), []);
});

test('지도 검사기는 임의 허용 오차·선택 근거 삭제·생성 헤더 불일치를 거부한다', async () => {
  const arbitrary = replaceOnce(buildMap, 'SIMPLIFY_TOLERANCE_DEG = 0.5;', 'SIMPLIFY_TOLERANCE_DEG = 0.9;');
  assert.ok((await problems(verifyMapTolerance, arbitrary, headers)).some(message => /0.7.*0.5/.test(message)));
  const noReason = buildMap.split('\n').filter(line => !(line.startsWith('//') && line.includes('HANDOFF'))).join('\n');
  assert.notEqual(noReason, buildMap);
  assert.ok((await problems(verifyMapTolerance, noReason, headers)).some(message => /근거/.test(message)));
  const mismatch = { ...headers, 'map-shapes.js': headers['map-shapes.js'].replace('허용 오차: 0.5', '허용 오차: 0.7') };
  assert.ok((await problems(verifyMapTolerance, buildMap, mismatch)).some(message => /헤더.*상수와 다르다/.test(message)));
});

function mapAssets() {
  const context = { window: {} };
  for (const name of ['map-coords.js', 'map-shapes.js']) {
    vm.runInNewContext(fs.readFileSync(new URL('../data/' + name, import.meta.url), 'utf8'), context);
  }
  return { land: context.window.FQ.mapLand, coords: context.window.FQ.mapCoords };
}

test('지도 검사기는 실제 최종 도형의 면적·방향·194개 핀을 검사한다', async () => {
  const { land, coords } = mapAssets();
  assert.deepEqual(await problems(verifyMapGeometry, land, coords), []);
  const collapsed = await problems(verifyMapGeometry, { ...land, d: 'M0 0Z' }, coords);
  assert.ok(collapsed.some(message => /300개 미만/.test(message)), collapsed.join('\n'));
  assert.ok(collapsed.some(message => /면적 0/.test(message)), collapsed.join('\n'));
  assert.ok(collapsed.some(message => /육지 밖/.test(message)), collapsed.join('\n'));
});

test('지도 검사기는 일부 링의 면적 소실과 반대 방향 및 바다 핀도 거부한다', async () => {
  const { land, coords } = mapAssets();
  const zero = await problems(verifyMapGeometry, { ...land, d: land.d + 'M0 0L1 0L0 0Z' }, coords);
  assert.ok(zero.some(message => /면적 0/.test(message)), zero.join('\n'));
  // 새 외곽은 나머지 최종 도형과 반대 방향이므로 nonzero fill 상쇄 위험이다.
  const reverse = await problems(verifyMapGeometry, { ...land, d: land.d + 'M0 0L0 1L1 1L1 0L0 0Z' }, coords);
  assert.ok(reverse.some(message => /방향이 통일되지/.test(message)), reverse.join('\n'));
  const sea = await problems(verifyMapGeometry, land, { ...coords, kr: [0, 90] });
  assert.ok(sea.some(message => /육지 밖.*kr/.test(message)), sea.join('\n'));
});

test('작은 육지 검사기는 임의 코드와 배제 지역의 보존을 실제 생성으로 검증한다', async () => {
  assert.deepEqual(await problems(verifySmallLandPreservation, buildLand), []);
  const dropExcluded = (features, matched) => buildLand(features.filter(feature => [...matched.values()].includes(feature)), matched);
  const missing = await problems(verifySmallLandPreservation, dropExcluded);
  assert.ok(missing.some(message => /배제 지역|Excluded land fixture/.test(message)), missing.join('\n'));
  const collapsed = await problems(verifySmallLandPreservation, () => ({ mapLand: { d: 'M1069 267.2L1069.1 267.2L1069 267.2Z' } }));
  assert.ok(collapsed.some(message => /면적 0/.test(message)), collapsed.join('\n'));
});
