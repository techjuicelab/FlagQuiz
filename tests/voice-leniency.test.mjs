/* 말하기 답의 30% 발음 유사도는 현재 문제 채점에만 적용한다. 실제 STT 품질 검사는 아니다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const context = { localStorage: { getItem: () => null, setItem() {} } };
  context.window = context;
  vm.createContext(context);
  for (const file of ['js/util.js', 'js/storage.js', 'js/features.js', 'data/countries.js',
    'data/subjects.js', 'js/progress.js', 'js/quiz.js', 'js/spoken-answer.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context, { filename: file });
  }
  return context.FQ;
}

function similarity(FQ, said, name) {
  const key = text => FQ.util.soundKey(FQ.util.compareKey(text));
  const left = key(said), right = key(name);
  return 1 - FQ.util.editDistance(left, right) / Math.max(left.length, right.length);
}

test('적도기니의 격도누기 전사는 실제 자모 유사도 44.4%로 말하기에서만 인정한다', () => {
  const FQ = fixture(), answer = FQ.quiz.byCode('gq');
  assert.ok(Math.abs(similarity(FQ, '격도누기', answer.ko) - 4 / 9) < 1e-10);
  for (const text of ['격도누기', '격도누기요', '음 격도누기', '정답은 격도누기예요']) {
    const result = FQ.quiz.checkVoiceText(answer, text, 'country');
    assert.equal(result.correct, true, text);
    assert.equal(FQ.quiz.checkText(answer, text, 'country').correct, false, text);
    assert.equal(FQ.spokenAnswer.resolve(text, { kind: 'country' }).status, 'retry', text);
  }
});

test('말하기의 30% 경계는 포함하며 30% 미만은 별칭을 포함해도 인정하지 않는다', () => {
  const FQ = fixture(), answer = FQ.quiz.byCode('gq');
  assert.ok(Math.abs(similarity(FQ, '더주마주니', answer.ko) - 0.3) < 1e-10);
  assert.equal(FQ.quiz.checkVoiceText(answer, '더주마주니', 'country').correct, true);
  const scores = [answer.ko, ...answer.aliases].map(name => similarity(FQ, '적라무로가', name));
  assert.ok(Math.max(...scores) < 0.3);
  assert.equal(FQ.quiz.checkVoiceText(answer, '적라무로가', 'country').correct, false);
});

test('단음절도 30% 발음 유사도를 충족하면 인정하고 필러만 말한 답은 인정하지 않는다', () => {
  const FQ = fixture(), answer = FQ.quiz.byCode('ml');
  assert.equal(similarity(FQ, '리', answer.ko), 0.4);
  assert.equal(FQ.quiz.checkVoiceText(answer, '리', 'country').correct, true);
  assert.equal(FQ.quiz.checkText(answer, '리', 'country').correct, false);
  for (const text of ['', ' ', '음', '어', '아', '네', '요', '음 그러니까']) {
    assert.equal(FQ.quiz.checkVoiceText(answer, text, 'country').correct, false, text);
  }
  for (const kind of ['country', 'capital']) {
    for (const text of ['글쎄', '글쎄요']) {
      assert.equal(FQ.quiz.checkVoiceText(FQ.quiz.byCode('kr'), text, kind).correct, false, kind + ': ' + text);
    }
  }
});

test('30% 말하기 채점도 실제 다른 나라·수도 이름과 명시적 정정의 마지막 답을 보호한다', () => {
  const FQ = fixture();
  for (const [target, said, kind = 'country'] of [
    ['gq', '기니'], ['gq', '기니비사우'], ['gn', '적도기니'], ['do', '도미니카'],
    ['dm', '도미니카공화국'], ['kr', '북한'], ['kp', '대한민국'],
    ['kr', '도쿄', 'capital'], ['jp', '서울', 'capital']
  ]) {
    assert.equal(FQ.quiz.checkVoiceText(FQ.quiz.byCode(target), said, kind).correct, false, target + ': ' + said);
  }
  assert.equal(FQ.quiz.checkVoiceText(FQ.quiz.byCode('gq'), '적도기니 아니고 기니', 'country').correct, false);
  assert.equal(FQ.quiz.checkVoiceText(FQ.quiz.byCode('gn'), '적도기니 아니고 기니', 'country').correct, true);
});

test('30% 발음 유사도는 부정·질문·여러 후보·인용·포기를 정답으로 만들지 않는다', () => {
  const FQ = fixture(), answer = FQ.quiz.byCode('gq');
  for (const text of ['격도누기 아니야', '격도누기 말고', '격도누기인가요?', '아마 격도누기',
    '격도누기 맞지', '격도누기 맞죠', '격도누기인듯', '격도누기라던데',
    '격도누기 안 맞아', '격도누기 안맞아요', '격도누기 아닐걸', '격도누기 아님',
    '격도누기 틀려', '격도누기 빼고', '격도누기 모르겠네', '격도누기 몰라', '격도누기 몰라요',
    '격도누기 또는 기니', '기니 격도누기', '"격도누기"라고 했어',
    '격도누기에서 살아요', '몰라요', '패스']) {
    assert.equal(FQ.quiz.checkVoiceText(answer, text, 'country').correct, false, text);
  }
});

test('말하기 채점은 수도 이름과 나라 이름의 경계를 유지하고 수도 오인식도 30%로 인정한다', () => {
  const FQ = fixture();
  for (const [target, text, kind] of [['kr', '대한민국', 'capital'], ['kr', '북한', 'capital'],
    ['gq', '적도기니', 'capital'], ['kr', '서울', 'country'], ['gq', '말라보', 'country']]) {
    assert.equal(FQ.quiz.checkVoiceText(FQ.quiz.byCode(target), text, kind).correct, false, target + ': ' + text);
  }
  assert.ok(similarity(FQ, '서루', '서울') >= 0.3);
  assert.equal(FQ.quiz.checkText(FQ.quiz.byCode('kr'), '서루', 'capital').correct, false);
  assert.equal(FQ.quiz.checkVoiceText(FQ.quiz.byCode('kr'), '서루', 'capital').correct, true);
});

test('game.submit의 30% 채점은 음성 문제와 실제 음성 출처를 모두 요구한다', () => {
  for (const [mode, source, text, code, expected] of [
    ['voice', 'voice', '격도누기', 'gq', true],
    ['voice', undefined, '격도누기', 'gq', false],
    ['typing', 'voice', '격도누기', 'gq', false],
    ['typing', undefined, '격도누기', 'gq', false],
    ['capitalVoice', 'voice', '서루', 'kr', true],
    ['capitalVoice', undefined, '서루', 'kr', false],
    ['capitalVoice', 'voice', '대한민국', 'kr', false]
  ]) {
    const FQ = fixture(), game = FQ.quiz.createGame({ mode, only: [code], count: 1 });
    const result = game.submit({ text, ...(source ? { source } : {}) });
    assert.equal(result.correct, expected, mode + '/' + source + ': ' + text);
    assert.equal(game.correct, Number(expected));
    assert.equal(game.voiceCorrect, Number(expected && source === 'voice'));
  }
});
