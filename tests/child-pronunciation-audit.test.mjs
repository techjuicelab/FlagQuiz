/* 생략 발음이 다른 실제 이름과 닮을 때의 독립 회귀 검사. 음성 녹음 품질 검사는 아니다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const context = { window: { FQ: {} } };
  vm.createContext(context);
  for (const file of ['js/util.js', 'data/countries.js', 'js/quiz.js', 'js/spoken-answer.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context, { filename: file });
  }
  return context.window.FQ;
}

const FQ = fixture();
const competingPronunciations = [
  ['country', '캄디아'], ['country', '캄보아'], ['country', '타키스탄'], ['country', '벨루스'],
  ['country', '루니아'], ['country', '그나다'], ['country', '자이카'],
  ['capital', '아타나'], ['capital', '키시우'], ['capital', '프라아'],
  ['capital', '아스라'], ['capital', '브지타운'], ['capital', '브리타운'],
  ['capital', '세인트조스'], ['capital', '브라리아']
];

// 완전한 이름이 아닌 생략 발음끼리 경합하면 기존 단독 발음도 재질문한다.
// 말앞의 필러 유무가 선택한 나라를 바꾸지 않으며 현재 문제의 답은 입력하지 않는다.
for (const [kind, said] of competingPronunciations) {
  test('경합하는 생략 발음은 필러를 붙여도 추측하지 않는다: ' + kind + ' / ' + said, () => {
    for (const text of [said, '음 ' + said]) {
      const result = FQ.spokenAnswer.resolve(text, { kind });
      assert.equal(result.status, 'retry', text + ': ' + result.reason);
      assert.equal(result.code, null, text);
      assert.equal(result.text, '', text);
    }
  });
}

test('분리된 음 필러를 수도 이름의 음절로 삼키지 않고 실제 이름의 음절은 유지한다', () => {
  for (const [text, code, name] of [
    ['가보네', 'bw', '가보로네'], ['음 가보네', 'bw', '가보로네'],
    ['음.. 가보네', 'bw', '가보로네'], ['음바바네', 'sz', '음바바네'],
    ['음 음바바네', 'sz', '음바바네']
  ]) {
    const result = FQ.spokenAnswer.resolve(text, { kind: 'capital' });
    assert.equal(result.status, 'answer', text + ': ' + result.reason);
    assert.equal(result.code, code, text);
    assert.equal(result.text, name, text);
  }
});

test('경합 보호 이후에도 모든 완전한 나라·수도 이름은 실제 이름의 답을 유지한다', () => {
  for (const kind of ['country', 'capital']) {
    for (const country of FQ.countries) {
      const entry = FQ.quiz.entryFor(country, kind);
      if (!entry.ko) continue;
      const shared = FQ.countries.filter(item => FQ.quiz.entryFor(item, kind).ko === entry.ko);
      if (shared.length !== 1) continue;
      for (const text of [entry.ko, '음 ' + entry.ko]) {
        const result = FQ.spokenAnswer.resolve(text, { kind });
        assert.equal(result.status, 'answer', kind + ': ' + text + ': ' + result.reason);
        assert.equal(result.code, country.code, kind + ': ' + text);
        assert.equal(result.text, entry.ko, kind + ': ' + text);
      }
    }
  }
});
