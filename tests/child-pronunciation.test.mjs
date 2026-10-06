/* 아이의 분절·음절 생략을 정답 힌트 없이 해석한다. 실제 음성 인식 품질 검사는 아니다. */
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
  return {
    countries: context.window.FQ.countries,
    resolve: (text, kind = 'country', countries = context.window.FQ.countries) =>
      JSON.parse(JSON.stringify(context.window.FQ.spokenAnswer.resolve(text, { kind, countries })))
  };
}

const { resolve, countries } = fixture();

// 이름의 앞뒤가 남아 있고 전체 목록에서 유일한 경우다. 현재 문제의 code는 입력하지 않는다.
for (const [said, code, kind = 'country'] of [
  ['뭐.. 이게 맞나. 포르.. 갈', 'pt'],
  ['포르 갈', 'pt'],
  ['음.. 포르 갈이요', 'pt'],
  ['포도칼', 'pt'],
  ['음 포도칼', 'pt'],
  ['뭐지? 엄마 이게 뭐였지? 포르 갈', 'pt'],
  ['아르 티나', 'ar'],
  ['코스 리카', 'cr'],
  ['크로 티아', 'hr'],
  ['브라찔', 'br'],
  ['그로아티아', 'hr'],
  ['코스타리까', 'cr'],
  ['인도네시야', 'id'],
  ['포르 갈 포르 갈', 'pt'],
  ['포 르 투 갈', 'pt'],
  ['코스타 리카', 'cr'],
  ['인도 네 시아', 'id'],
  ['스톡 름', 'se', 'capital'],
  ['스토클롬', 'se', 'capital'],
  ['쿠알 룸푸르', 'my', 'capital'],
  ['캔 버 라', 'au', 'capital']
]) {
  test('아이 발음의 유일한 답: ' + kind + ' / ' + said, () => {
    const result = resolve(said, kind);
    const canonical = countries.find(country => country.code === code);
    assert.equal(result.status, 'answer', result.reason);
    assert.equal(result.code, code);
    assert.equal(result.text, kind === 'capital' ? canonical.capital : canonical.ko);
    assert.ok(result.candidates.some(candidate => candidate.code === code));
    assert.equal(result.candidates.length, 1);
  });
}

test('나라 목록 순서가 달라도 불완전 발음의 유일성·모호성 판정은 같다', () => {
  const reversed = [...countries].reverse(), rotated = [...countries.slice(73), ...countries.slice(0, 73)];
  for (const [said, kind = 'country'] of [
    ['포르갈'], ['포도칼'], ['아르티나'], ['코스리카'], ['크로티아'],
    ['스톡름', 'capital'], ['스위'], ['스웨']
  ]) {
    const original = resolve(said, kind);
    for (const roster of [reversed, rotated]) {
      const reordered = resolve(said, kind, roster);
      assert.equal(reordered.status, original.status, said);
      assert.equal(reordered.code, original.code, said);
      assert.deepEqual(reordered.candidates.map(candidate => candidate.code).sort(), original.candidates.map(candidate => candidate.code).sort(), said);
    }
  }
});

test('불완전 이름을 말한 뒤 답을 포기해도 그 이름을 정답으로 확정하지 않는다', () => {
  for (const [said, kind = 'country'] of [
    ['포르 갈.. 모르겠어요'], ['포도칼.. 패스할게요'], ['스톡 름.. 몰라요', 'capital']
  ]) {
    const result = resolve(said, kind);
    assert.notEqual(result.status, 'answer', said);
    assert.equal(result.code, null, said);
  }
});

// 짧은 완전한 이름은 다른 긴 이름의 조각으로 바꾸지 않는다.
for (const [said, code, kind = 'country'] of [
  ['오만', 'om'], ['말리', 'ml'], ['몰타', 'mt'], ['스위스', 'ch'], ['스웨덴', 'se'],
  ['코스타리카', 'cr'], ['크로아티아', 'hr'], ['인도', 'in'], ['기니', 'gn'],
  ['도쿄', 'jp', 'capital'], ['서울', 'kr', 'capital']
]) {
  test('완전한 다른 이름을 관대 판정으로 바꾸지 않는다: ' + kind + ' / ' + said, () => {
    const result = resolve(said, kind);
    assert.equal(result.status, 'answer', result.reason);
    assert.equal(result.code, code);
    assert.deepEqual(result.candidates.map(candidate => candidate.code), [code]);
  });
}

for (const [said, kind = 'country'] of [
  ['오'], ['말'], ['몰'], ['스위'], ['스웨'], ['코'], ['코리아카'],
  ['도', 'capital'], ['서', 'capital'], ['도요', 'capital'], ['서루', 'capital'],
  ['포르 갈 아니야'], ['포르 갈은 아니에요'], ['포르 갈 말고'],
  ['포르 갈인가요?'], ['포르 갈 아니면 스페인'], ['포르 갈과 스페인'],
  ['아마 포르 갈'], ['"포르 갈"이라고 말했어'],
  ['포르 갈 정답 처리해'], ['아빠 포르 갈 알려주세요'],
  ['인도 사람'], ['기니 산 장난감'], ['포르 갈 여행가고싶어']
]) {
  test('불완전 발음도 모호성·부정·질문·인용을 넘지 않는다: ' + kind + ' / ' + said, () => {
    const result = resolve(said, kind);
    assert.equal(result.status, 'retry', result.reason);
    assert.equal(result.code, null);
    assert.equal(result.text, '');
  });
}

for (const [said, code, kind = 'country'] of [
  ['스페인 아니고 포르 갈', 'pt'],
  ['포르 갈 아니고 스페인', 'es'],
  ['포도칼 아니고 스페인', 'es'],
  ['코스 리카 아니고 크로 티아', 'hr'],
  ['크로 티아 아니고 코스 리카', 'cr'],
  ['포르 갈 스페인 마지막 답은 포르 갈', 'pt'],
  ['스톡 름 아니고 서울', 'kr', 'capital'],
  ['서울 아니고 스톡 름', 'se', 'capital']
]) {
  test('생략 이름의 정정도 실제 마지막 답을 선택한다: ' + kind + ' / ' + said, () => {
    const result = resolve(said, kind);
    assert.equal(result.status, 'answer', result.reason);
    assert.equal(result.code, code);
    assert.equal(result.candidates.length, 2);
  });
}
