import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/* 그림이 보류된 소재는 출제하지 않는다. 보류가 풀리면 기대값도 따라 움직이도록 원장에서 직접 읽는다. */
const held = JSON.parse(fs.readFileSync(new URL('../docs/image-prompts/presets.json', import.meta.url), 'utf8'))
  .items.filter((item) => item.status === 'held');
const EXPECT = {
  symbol: 194 - held.filter((item) => item.kind === 'symbol').length,
  place: 148 - held.filter((item) => item.kind === 'landmark').length
};

function load() {
  const c = {console, Math}; c.window = c; vm.createContext(c);
  for (const f of ['js/util.js', 'data/countries.js', 'data/subjects.js', 'data/confusion-groups.js', 'js/quiz.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), c);
  }
  return c.FQ;
}

test('그림 ' + (EXPECT.symbol + EXPECT.place) + '개 문제의 후보·폴백 모두 자료가 있고 혼동군이 겹치지 않는다', () => {
  const f = load();
  for (const axis of ['symbol', 'place']) {
    const source = f.quiz.pool({axis});
    assert.equal(source.length, EXPECT[axis]);
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

test('그림 ' + (EXPECT.symbol + EXPECT.place) + '개 실제 게임이 해당 축으로 채점하며 빈 명소를 출제하지 않는다',()=>{
  const f=load(),records=[];
  f.features={on:()=>true};f.storage={recordAnswer:(...args)=>records.push(args)};
  for(const axis of ['symbol','place']) for(const answer of f.quiz.pool({axis})) {
    const g=f.quiz.createGame({mode:axis,only:[answer.code],count:1});
    assert.equal(g.current().mode,axis);
    assert.equal(g.current().country.code,answer.code);
    assert.equal(g.current().options.length,4);
    assert.ok(g.current().options.every(c=>f.subjects[c.code][axis]));
    assert.equal(g.submit({code:answer.code}).correct,true);
    assert.deepEqual(records.at(-1),[answer.code,true,axis]);
  }
  assert.equal(records.length,EXPECT.symbol+EXPECT.place);
  const g=f.quiz.createGame({mode:'place',only:['ae'],count:3});
  assert.ok(g.questions.every(q=>f.subjects[q.country.code].place));
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
