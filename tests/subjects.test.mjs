import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load() {
  const c = {console, Math}; c.window = c; vm.createContext(c);
  for (const f of ['js/util.js', 'data/countries.js', 'data/subjects.js', 'data/confusion-groups.js', 'js/quiz.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), c);
  }
  return c.FQ;
}

test('342개 그림 문제의 후보·폴백 모두 자료가 있고 혼동군이 겹치지 않는다', () => {
  const f = load();
  for (const axis of ['symbol', 'place']) {
    const source = f.quiz.pool({axis});
    assert.equal(source.length, axis === 'symbol' ? 194 : 148);
    for (const answer of source) {
      // 단일국가 풀은 전역 폴백 경로를 반드시 거친다.
      for (const pool of [source, [answer]]) {
        const options = f.quiz.distractors(answer, 3, pool, 'choice4', {axis}).concat(answer);
        assert.equal(options.length, 4, answer.code);
        assert.equal(new Set(options.map(c => c.code)).size, 4);
        for (const a of options) {
          assert.ok(f.subjects[a.code][axis]);
          for (const b of options) if (a !== b) {
            assert.ok(!f.quiz.confusionSet(a.code)[b.code], `${axis} ${a.code}/${b.code}`);
          }
        }
      }
    }
  }
});

test('혼동군은 교차축·다중군 합집합이며 첫 호출 뒤 캐시를 재사용한다', () => {
  const f = load();
  const set = f.quiz.confusionSet('dz');
  for (const code of ['mn', 'mr', 'na', 'sa']) assert.ok(set[code], code);
  assert.equal(f.quiz.confusionSet('dz'), set);
  for (const group of f.confusionGroups) for (const a of group.codes) for (const b of group.codes) {
    if (a !== b) assert.ok(f.quiz.confusionSet(a)[b] && f.quiz.confusionSet(b)[a]);
  }
});

test('자료가 부족할 때도 혼동군만 완화하며 only 목록도 자료 필터를 지킨다', () => {
  const f = load();
  f.subjects = Object.fromEntries(['kr', 'cn', 'jp', 'vn'].map(code => [code, {symbol: {ko: code}}]));
  f.confusionGroups = [{axis: '명소', codes: ['kr', 'cn', 'jp', 'vn']}];
  const answer = f.quiz.byCode('kr');
  const out = f.quiz.distractors(answer, 3, [answer], 'choice4', {axis: 'symbol'});
  assert.equal(out.length, 3);
  assert.ok(out.every(c => f.subjects[c.code]?.symbol));
  assert.equal(f.quiz.pool({only: ['kr', 'us'], axis: 'symbol'}).length, 1);
  assert.equal(f.quiz.pool({axis: 'place'}).length, 0);
  assert.equal(f.quiz.distractors(answer, 3, [answer], 'choice4', {axis: 'place'}).length, 0);
});

test('자료 없는 환경과 기존 국기 모드는 혼동군에 영향받지 않는다', () => {
  const f = load(); delete f.confusionGroups;
  const answer = f.quiz.byCode('kr');
  assert.equal(f.quiz.distractors(answer, 3, [answer], 'choice4').length, 3);
  f.confusionGroups = [{codes: f.countries.map(c => c.code)}];
  assert.equal(f.quiz.makeQuestion(answer, 'choice4', [answer]).options.length, 4);
});
