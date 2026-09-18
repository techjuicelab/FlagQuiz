/* 말로 답하기의 인정 규칙(D25): 소리 닮은꼴·앞부분 인정과 '앞부분이 겹치는 나라' 표.
 * 실제 마이크·받아쓰기 품질은 이 검사 범위 밖이다. 채점 엔진이 무엇을 인정하고 무엇을 거부하는지만 고정한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const context = { localStorage: { getItem: () => null, setItem() {} } };
  context.window = context;
  vm.createContext(context);
  for (const file of ['js/util.js', 'js/storage.js', 'js/features.js', 'data/countries.js', 'data/subjects.js', 'js/progress.js', 'js/quiz.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
  }
  return context.FQ;
}

test('소리 닮은꼴 키는 초성·중성 묶음과 받침 일곱 소리로 같은 소리를 같게 본다', () => {
  const { util: u } = fixture();
  const same = (a, b) => assert.equal(u.soundKey(u.compareKey(a)), u.soundKey(u.compareKey(b)), a + ' ~ ' + b);
  const differ = (a, b) => assert.notEqual(u.soundKey(u.compareKey(a)), u.soundKey(u.compareKey(b)), a + ' ≠ ' + b);
  same('케냐', '캐냐');
  same('쿠바', '구바');
  same('브라질', '브라찔');
  same('페루', '패루');
  same('통가', '통까');
  same('있', '읻');
  same('꽃', '꼳');
  differ('일본', '일번');
  differ('가나', '하나');
  differ('차드', '챠드');
  assert.equal(u.soundKey(u.compareKey('케냐')).length, u.compareKey('케냐').length, '글자 수는 그대로');
  assert.equal(u.vowelCount(u.compareKey('사우디아')), 4);
  assert.equal(u.vowelCount(u.compareKey('오스트')), 3, '오스트는 세 음절 — 앞부분 인정은 겹치는 이름(오스트리아·오스트레일리아)이 막는다');
  assert.equal(u.vowelCount(u.compareKey('사우')), 2);
});

test('목표 나라의 소리 닮은꼴과 세 음절 이상 앞부분은 인정하고 관대 표시를 남긴다', () => {
  const FQ = fixture();
  const ACCEPT = [
    ['ke', '캐냐'], ['ke', '캐냐요'], ['ke', '음 캐냐'], ['cu', '구바'], ['pe', '패루'], ['td', '자드'],
    ['bt', '부단'],   // 수단이 비슷하게 걸리지만 부탄과 소리가 정확히 같다
    ['sa', '사우디아라'], ['ba', '보스니아헤르'], ['cd', '콩고민주']
  ];
  for (const [code, said] of ACCEPT) {
    const r = FQ.quiz.checkText(FQ.quiz.byCode(code), said);
    assert.equal(r.correct, true, code + ' ← "' + said + '"');
    assert.equal(r.lenient, true, code + ' ← "' + said + '" 는 관대 인정이다');
    assert.equal(r.confusedWith, null);
  }
  // 엄격 채점으로 이미 맞는 것은 관대 표시가 없다 (세 음절 이상 이름은 한두 글자 달라도 원래 인정한다).
  const STRICT = [
    ['kr', '대한민국'], ['br', '브라찔'], ['to', '통까'], ['to', '동가'], ['mv', '몰디부'], ['td', '챠드'],
    ['au', '오스트레일리'], ['mg', '마다가스'], ['af', '아프가니'], ['uz', '우즈베키'], ['nz', '뉴질랜'], ['ar', '아르헨티'], ['lk', '스리랑'], ['kz', '카자흐']
  ];
  for (const [code, said] of STRICT) {
    const r = FQ.quiz.checkText(FQ.quiz.byCode(code), said);
    assert.equal(r.correct, true, code + ' ← "' + said + '"');
    assert.equal(r.lenient, false, code + ' ← "' + said + '" 는 엄격 채점이 이미 인정한다');
  }
  assert.deepEqual(FQ.quiz.soundsLike(FQ.quiz.byCode('sa'), FQ.quiz.candidateKeys('사우디아라')).sound, -1, '앞부분 인정 표시');
  assert.deepEqual(FQ.quiz.soundsLike(FQ.quiz.byCode('ke'), FQ.quiz.candidateKeys('캐냐')).sound, 0);
});

test('다른 나라 이름·겹치는 앞부분·두 음절 앞부분·짧은 이름의 다른 소리는 여전히 거부한다', () => {
  const FQ = fixture();
  const REJECT = [
    ['at', '오스트레일리아'], ['au', '오스트리아'], ['in', '인도네시아'], ['id', '인도'], ['gn', '기니비사우'], ['gw', '기니'],
    ['do', '도미니카'], ['au', '오스트'], ['sa', '사우'], ['gh', '하나'], ['gh', '차드'], ['td', '가나'],
    ['bt', '수단'], ['bt', '수담'],   // 수단은 수단이고, '수담'은 부탄과 소리도 다르다
    ['kr', '일본'], ['ne', '나이지리아'], ['ng', '니제르'], ['cg', '콩고민주공화국'], ['cd', '콩고공화국'],
    ['sk', '슬로베니아'], ['ie', '아이슬란드'], ['is', '아일랜드'], ['kp', '대한민국'], ['kr', ''], ['kr', '음 그러니까'], ['jp', '일번일번'], ['fr', '프']
  ];
  for (const [code, said] of REJECT) {
    assert.equal(FQ.quiz.checkText(FQ.quiz.byCode(code), said).correct, false, code + ' ← "' + said + '" 는 오답');
  }
  assert.equal(FQ.quiz.checkText(FQ.quiz.byCode('bt'), '수단').confusedWith.code, 'sd');
  assert.equal(FQ.quiz.checkText(FQ.quiz.byCode('bt'), '수담').confusedWith.code, 'sd');
});

test('194개국 전수: 다른 나라의 어떤 이름·별칭도 채점에서 인정되지 않는다 — 소리가 닮아도 그 나라 이름이 걸리면 관대 인정을 밟지 않는다', () => {
  const FQ = fixture();
  const list = FQ.countries;
  let checked = 0, nearMisses = 0;
  for (const target of list) {
    for (const other of list) {
      if (other.code === target.code) continue;
      for (const name of (other.aliases || []).concat([other.ko])) {
        checked++;
        // 소리만 보면 닮은 쌍(부탄↔수단, 이란↔이락, 몰디브↔몰도바 …)이 있다. 그런 말은 그 나라 이름이 '걸려' checkText 가 거부해야 한다.
        if (!FQ.quiz.soundsLike(target, FQ.quiz.candidateKeys(name))) continue;
        nearMisses++;
        const r = FQ.quiz.checkText(target, name);
        assert.equal(r.correct, false, target.ko + ' 에 ' + other.ko + ' 의 "' + name + '" 이 인정됐다');
        assert.ok(r.confusedWith && r.confusedWith.code === other.code, target.ko + ' ← "' + name + '" 는 ' + other.ko + ' 로 알아들어야 한다');
      }
    }
    assert.ok(FQ.quiz.soundsLike(target, FQ.quiz.candidateKeys(target.ko)), target.ko + ' 자기 이름');
  }
  assert.ok(checked > 100000, '교차 검사 수 ' + checked);
  assert.ok(nearMisses > 100 && nearMisses < 400, '소리 닮은 쌍 수 ' + nearMisses);
});

test('말로 답하기의 소리 닮은꼴 인정은 쓰기 모드 채점에도 같이 적용되지만 국기 이름 찾기(findCountry)는 엄격 그대로다', () => {
  const FQ = fixture();
  assert.equal(FQ.quiz.checkText(FQ.quiz.byCode('ke'), '캐냐').correct, true);
  assert.equal(FQ.quiz.findCountry('캐냐'), null, '엄격 찾기는 캐냐를 모른다');
  assert.equal(FQ.quiz.findCountry('케냐').code, 'ke');
  assert.equal(FQ.quiz.findCountry('사우디아라'), null);
});

test('앞부분이 다른 나라 이름과 겹치는 나라는 인도·기니뿐이라 그 둘만 끝까지 듣는다', () => {
  const FQ = fixture();
  const risky = Array.from(FQ.countries).filter(c => FQ.quiz.prefixRisky(c)).map(c => c.code).sort();
  assert.deepEqual(risky, ['gn', 'in']);
  for (const code of ['id', 'gw', 'kr', 'cg', 'cd', 'do', 'dm', 'at', 'au']) assert.equal(FQ.quiz.prefixRisky(FQ.quiz.byCode(code)), false, code);
  assert.equal(FQ.quiz.prefixRisky(null), false);
});
