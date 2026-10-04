/* 수도 결과의 도움 구분과 같은 나라 재공부를 실제 앱·기록 화면에서 검사한다. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = fs.readFileSync(new URL('app.test.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function fixture(');
const end = source.indexOf('let passed=0;');
assert.ok(start >= 0 && end > start, '앱 흐름 fixture를 찾을 수 있어야 한다');
const fixture = new Function('fs', 'vm', 'path', 'root', 'assert', source.slice(start, end) + '\nreturn fixture;')(fs, vm, path, root, assert);

for (const mode of ['capital', 'capitalVoice']) {
  test(mode + ' 결과와 최근 놀이가 직접 맞힌 답·이름 힌트 답을 구분한다', () => {
    const f = fixture();
    f.c.FQ.storage.updateSettings({ mode, speak: false, sound: false });
    f.c.FQ.app.startGame(['kr', 'jp']);
    const app = f.c.FQ.test;
    app.submit({ code: app.state.game.current().country.code });
    f.advance(1800);
    f.node('#hint').click();
    if (mode === 'capital') f.node('#hint').click();
    assert.equal(app.state.revealed, true);
    app.submit({ code: app.state.game.current().country.code });
    f.releases.at(-1)();
    f.finishVoice();
    f.advance(900);
    assert.equal(app.state.lastSummary.correct, 2);
    assert.equal(app.state.lastSummary.learnedCorrect, 1);
    assert.equal(app.state.lastSummary.helpedCorrect, 1);
    assert.match(f.node('main').innerHTML, /aria-label="직접 맞힌 나라 1개"/);
    assert.match(f.node('main').innerHTML, /답을 듣고 맞힌 나라 1개/);
    assert.match(f.node('main').innerHTML, /정답률 · 도움받은 답 포함/);
    vm.runInContext(fs.readFileSync(path.join(root, 'js/badges.js'), 'utf8'), f.c);
    vm.runInContext(fs.readFileSync(path.join(root, 'js/screens.js'), 'utf8'), f.c);
    f.c.FQ.screens.stats();
    assert.match(f.node('main').innerHTML, /<b>2 \/ 2<\/b>/);
    assert.match(f.node('main').innerHTML, /직접 1 · 답을 듣고 1/);
  });

  test(mode + ' 결과에서 만난 수도만 재공부하고 모든 기록·설정을 보존한다', () => {
    const f = fixture();
    f.c.FQ.storage.updateSettings({ mode, speak: false, sound: false, count: 5 });
    f.c.FQ.app.startGame(['kr', 'jp']);
    const app = f.c.FQ.test;
    while (!app.state.game.isOver()) {
      app.submit({ code: app.state.game.current().country.code });
      f.advance(1800);
    }
    assert.match(f.node('main').innerHTML, /id="capital-result-study"/);
    const before = f.c.FQ.storage.exportJson();
    f.node('#capital-result-study').click();
    assert.equal(app.state.game, null);
    assert.deepEqual(Array.from(app.state.study.countries, c => c.code).sort(), ['jp', 'kr']);
    assert.match(f.node('main').innerHTML, /capital-study/);
    f.node('#study-next').click();
    f.node('#study-next').click();
    assert.match(f.node('main').innerHTML, /수도 공부를 마쳤어요/);
    assert.equal(f.c.FQ.storage.exportJson(), before);
  });
}

test('기존 최근 놀이 기록에는 도움 구분을 추정하거나 추가하지 않는다', () => {
  const f = fixture();
  f.c.FQ.storage.finishGame({ mode: 'capital', total: 5, correct: 5, players: ['민규'], seconds: 0, bestStreak: 5 });
  const original = JSON.stringify(f.c.FQ.storage.history());
  vm.runInContext(fs.readFileSync(path.join(root, 'js/badges.js'), 'utf8'), f.c);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/screens.js'), 'utf8'), f.c);
  f.c.FQ.screens.stats();
  assert.match(f.node('main').innerHTML, /<b>5 \/ 5<\/b>/);
  assert.doesNotMatch(f.node('main').innerHTML, /직접 undefined|답을 듣고 undefined/);
  assert.equal(JSON.stringify(f.c.FQ.storage.history()), original);
});
