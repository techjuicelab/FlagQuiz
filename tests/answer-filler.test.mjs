/* 말머리("어", "아", "음")가 붙은 답을 제대로 채점하는지 검사한다.
 *
 * 만 4세 아이는 나라 이름 앞에 "어…", "아…", "음…" 을 거의 늘 붙인다.
 * checkText 는 이어지는 낱말을 붙여 후보 키를 만들기 때문에 "어 가나" 에서
 * '어가나' 라는 가짜 낱말이 생기고, 이것이 '우간다' 로 걸려 정답 '가나' 를 빼앗아 갔다.
 * (같은 식으로 "음 수단"→남수단, "아 파키스탄"→아프가니스탄, "저기 기니"→적도기니)
 * 말하기 모드에서는 다시 말할 기회도 없이 그 자리에서 오답으로 제출된다.
 *
 * 그렇다고 말머리를 살리려다 이름이 겹치는 나라까지 정답으로 받아 주면
 * 아이가 틀린 것을 맞았다고 배운다. 두 방향을 함께 묶어 둔다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const local = new Map();
  const context = { localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, value) } };
  context.window = context;
  vm.createContext(context);
  for (const file of ['js/util.js', 'js/storage.js', 'data/countries.js', 'data/subjects.js', 'js/progress.js', 'js/quiz.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context, { filename: file });
  }
  return context.FQ;
}

const FQ = fixture();
const quiz = FQ.quiz;
const countries = FQ.countries;

/* 아이가 실제로 붙이는 말머리들. 낱말이 늘수록 후보 키가 늘어 채점이 느려지므로
 * 194개국 전수에는 짧은 말머리를 쓰고, 긴 말머리는 걸려 넘어지던 나라에만 곱한다. */
const HEADS = ['어 ', '아 ', '음 ', '어… ', '으음 ', '저기 '];
const HEADS_LONG = ['어 그 ', '음 그러니까 ', '아 맞다 '];
/* 이름 뒤에 붙는 말끝들 */
const TAILS = ['', '요', '이요', '이에요', '입니다'];

function said(country, text) {
  return country.code + ' ← "' + text + '"';
}

test('말머리가 붙어도 정답으로 인정한다', () => {
  // 감사에서 실제로 오답이 되던 말들. 뒤 칸은 정답을 빼앗아 가던 나라다.
  const ACCEPT = [
    ['gh', '어 가나'],        // → 우간다
    ['gh', '아 가나요'],
    ['gh', '에… 가나'],
    ['gh', '어 가나공화국'],
    ['sd', '음 수단'],        // → 남수단
    ['sd', '아 수단'],
    ['sd', '아 수단이요'],
    ['sd', '음 수단공화국'],
    ['pk', '아 파키스탄'],    // → 아프가니스탄
    ['pk', '아 파키스탄이요'],
    ['gn', '저기 기니'],      // → 적도기니
    ['gn', '어 기니공화국'],
    ['pl', '아아 폴란드'],    // → 아이슬란드
    ['ke', '아 케니아'],      // → 아르메니아
    ['in', '아 인도공화국']   // → 아일랜드
  ];
  for (const [code, text] of ACCEPT) {
    const country = quiz.byCode(code);
    assert.ok(quiz.checkText(country, text).correct, '인정해야 함 ' + said(country, text));
  }
});

test('194개국 모두 말머리와 말끝이 붙은 이름을 정답으로 인정한다', () => {
  // 나라마다 말머리·말끝을 돌려 가며 붙여 전부 훑는다.
  for (let i = 0; i < countries.length; i++) {
    const country = countries[i];
    const text = HEADS[i % HEADS.length] + country.ko + TAILS[i % TAILS.length];
    assert.ok(quiz.checkText(country, text).correct, '인정해야 함 ' + said(country, text));
  }
  // 말머리에 걸려 넘어지던 나라들은 낱말이 여럿인 말머리까지 붙여 본다.
  for (const code of ['gh', 'sd', 'pk', 'gn', 'pl', 'ke']) {
    const country = quiz.byCode(code);
    for (const head of HEADS_LONG) {
      const text = head + country.ko;
      assert.ok(quiz.checkText(country, text).correct, '인정해야 함 ' + said(country, text));
    }
  }
});

test('이름이 겹치는 나라는 말머리가 붙어도 오답으로 남는다', () => {
  // 여기가 무너지면 아이가 틀린 것을 맞았다고 배운다. 말머리보다 이쪽이 더 중요하다.
  // "음 수단" 의 '음수단' 은 남수단과 자모 두 개 차이라 남수단으로도 걸리지만,
  // 수단 쪽이 낱말 그대로 맞았으므로 남수단 문제에서는 오답이어야 한다.
  const REJECT = [
    ['in', '인도네시아'], ['in', '어 인도네시아'], ['in', '인도네시아요'], ['id', '인도'], ['id', '음 인도'],
    ['gn', '기니비사우'], ['gn', '적도기니'], ['gw', '기니'], ['gw', '어 기니'], ['gq', '기니'], ['gq', '아 기니'],
    ['sd', '남수단'], ['sd', '어 남수단'], ['ss', '수단'], ['ss', '음 수단'], ['ss', '아 수단'],
    ['ne', '나이지리아'], ['ng', '니제르'],
    ['at', '오스트레일리아'], ['au', '오스트리아'],
    ['ir', '이라크'], ['iq', '이란'],
    ['sk', '슬로베니아'], ['si', '슬로바키아'],
    ['kr', '북한'], ['kp', '대한민국'], ['kp', '한국'],
    ['cg', '콩고민주공화국'], ['cd', '콩고공화국'],
    ['is', '아일랜드'], ['ie', '아이슬란드'],
    ['do', '도미니카 연방'], ['dm', '도미니카공화국'],
    ['gh', '우간다'], ['ug', '가나'], ['gh', '차드'], ['td', '가나'],
    ['pk', '아프가니스탄'], ['af', '파키스탄'], ['kr', '일본']
  ];
  for (const [code, text] of REJECT) {
    const country = quiz.byCode(code);
    assert.equal(quiz.checkText(country, text).correct, false, '오답이어야 함 ' + said(country, text));
  }
});

test('긴 이름을 끊어 말하면 말끝이 붙어도 짧은 나라가 가로채지 않는다', () => {
  // 받아쓰기는 "인도네시아" 를 "인도 네시아" 처럼 끊어 적어 보낸다.
  // 이때 말끝("요")이 붙으면 말 전체가 이름과 같지 않으므로, 낱말을 이어 본 결과로 가려야 한다.
  const REJECT = [
    ['in', '인도 네시아'], ['in', '인도 네시아요'],
    ['gn', '기니 비사우'], ['gn', '기니 비사우요'], ['gn', '기니 비싸우'],
    ['gn', '적도 기니'], ['gn', '적도 기니요'],
    ['sd', '남 수단'], ['sd', '남 수단이요'],
    ['kr', '북 한이요']
  ];
  for (const [code, text] of REJECT) {
    const country = quiz.byCode(code);
    assert.equal(quiz.checkText(country, text).correct, false, '오답이어야 함 ' + said(country, text));
  }
  // 반대로 제 이름을 끊어 말한 것은 그대로 인정한다
  for (const [code, text] of [['id', '인도 네시아'], ['id', '인도 네시아요'], ['gw', '기니 비사우요'],
                              ['gq', '적도 기니요'], ['ss', '남 수단이요'], ['za', '남아프리카 공화국']]) {
    const country = quiz.byCode(code);
    assert.ok(quiz.checkText(country, text).correct, '인정해야 함 ' + said(country, text));
  }
});

test('안내 문구가 채점과 같은 나라를 말한다', () => {
  // checkText 만 고치고 findCountry 를 두면, 채점은 정답인데 '우간다라고 했구나' 로 안내된다.
  // 아이는 자기가 뭐라고 말했는지를 그 문구로 배운다.
  const said = [['어 가나', '가나'], ['음 수단', '수단'], ['아 파키스탄', '파키스탄'], ['저기 기니', '기니']];
  for (const [text, ko] of said) {
    assert.equal(quiz.findCountry(text)?.ko, ko, text + ' 를 다른 나라로 안내한다');
  }
  // 긴 이름을 끊어 말한 것은 여전히 긴 나라다 — 한쪽으로 쏠리지 않았다.
  for (const [text, ko] of [['인도 네시아요', '인도네시아'], ['남 수단이요', '남수단'], ['적도 기니요', '적도기니']]) {
    assert.equal(quiz.findCountry(text)?.ko, ko, text + ' 가 짧은 나라로 넘어갔다');
  }
});
