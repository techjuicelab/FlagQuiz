import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const local = new Map(saved === undefined ? [] : [['flagquiz.v1', JSON.stringify(saved)]]);
  const context = { localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, value) } };
  context.window = context;
  vm.createContext(context);
  const load = (file) => vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
  for (const file of ['js/util.js', 'js/storage.js', 'js/features.js', 'data/countries.js', 'data/subjects.js', 'js/progress.js', 'js/quiz.js']) load(file);
  return { FQ: context.FQ, load, local };
}

test('축 생략과 명시적 flag는 같은 국기 기록을 만든다', () => {
  const a = fixture(), b = fixture();
  for (const correct of [false, true, true]) {
    a.FQ.storage.recordAnswer('kr', correct);
    b.FQ.storage.recordAnswer('kr', correct, 'flag');
  }
  assert.deepEqual(JSON.parse(a.FQ.storage.exportJson()), JSON.parse(b.FQ.storage.exportJson()));
  assert.deepEqual([...a.local.keys()], ['flagquiz.v1']);
});

test('그림·명소·지도 답변은 국기 오답·가중치·스티커를 바꾸지 않고 전체 놀이 수에는 포함한다', () => {
  const { FQ } = fixture();
  const store = FQ.storage;
  for (const axis of ['symbol', 'place', 'map']) {
    for (let i = 0; i < 10; i++) store.recordAnswer('kr', false, axis);
    store.recordAnswer('kr', true, axis);
    assert.equal(store.allAxisStats(axis).kr.wrong, 10);
    assert.equal(store.allAxisStats(axis).kr.correct, 1);
    assert.equal(store.allAxisStats(axis).kr.seen, 11);
  }
  assert.deepEqual([...store.wrongList()], []);
  assert.equal(store.weightOf('kr'), 2);
  assert.equal(FQ.progress.hasSticker('kr'), false);
  assert.deepEqual(Object.keys(store.allCountryStats()), []);
  assert.equal(store.stats().asked, 33);
  assert.equal(store.stats().correct, 3);
});

test('기존 국기 기록과 부분적인 새 축 기록을 복원해도 빠진 필드가 NaN으로 퍼지지 않는다', () => {
  const f = fixture({ countries: { kr: { seen: 3, correct: 3, streak: 3 } }, axes: { symbol: { kr: { correct: 2 } } } });
  f.FQ.storage.recordAnswer('kr', false);
  assert.equal(f.FQ.storage.countryStat('kr').wrong, 1);
  f.FQ.storage.recordAnswer('kr', true, 'symbol');
  assert.deepEqual(JSON.parse(JSON.stringify(f.FQ.storage.axisStat('symbol', 'kr'))), { seen: 1, correct: 3, wrong: 0, streak: 1 });
  f.load('js/storage.js');
  assert.equal(f.FQ.storage.allAxisStats('symbol').kr.correct, 3);
  assert.equal(f.FQ.storage.countryStat('kr').correct, 3);
  assert.ok(Number.isFinite(f.FQ.storage.weightOf('kr')));
});

test('새 축 기록을 초기화하면 비워지고 사용자 설정은 남는다', () => {
  const { FQ } = fixture();
  const store = FQ.storage;
  store.updateSettings({ sound: false, dev: { art: true } });
  for (const axis of ['symbol', 'place', 'map']) store.recordAnswer('kr', true, axis);
  store.resetProgress();
  assert.deepEqual(JSON.parse(store.exportJson()).axes, {});
  for (const axis of ['symbol', 'place', 'map']) assert.deepEqual(Object.keys(store.allAxisStats(axis)), []);
  assert.equal(store.settings().sound, false);
  assert.equal(store.settings().dev.art, true);
  store.recordAnswer('kr', true, 'map');
  store.resetAll();
  assert.deepEqual(JSON.parse(store.exportJson()).axes, {});
  assert.equal(store.settings().sound, true);
});

test('기존 네 모드는 국기 축, 수도는 capital 축이며 게임 제출은 모드 축에만 한 번 기록한다', () => {
  const { FQ } = fixture();
  for (const mode of ['choice4', 'reverse', 'typing', 'voice']) assert.equal(FQ.quiz.MODES[mode].axis, 'flag');
  assert.equal(FQ.quiz.MODES.capital.axis, 'capital', 'D17 채택 B: 수도 기록은 axes.capital 에');
  for (const axis of ['symbol', 'place', 'map', 'capital']) {
    const mode = 'axis-test-' + axis;
    FQ.quiz.MODES[mode] = { kind: 'choice', hasOptions: true, axis };
    const game = FQ.quiz.createGame({ mode, only: ['kr'], count: 1 });
    assert.equal(game.submit({ code: 'kr' }).correct, true);
    assert.equal(game.submit({ code: 'kr' }), null);
    assert.equal(FQ.storage.allAxisStats(axis).kr.correct, 1);
    assert.equal(FQ.storage.allCountryStats().kr, undefined);
  }
});

test('저장분에 없던 settings 객체를 제자리로 고쳐도 기본값이 오염되지 않는다', () => {
  // 옛 저장분에는 dev 가 없다. 병합이 DEFAULTS 의 실물을 넘기면
  // settings().dev.art = true 한 줄이 기본값 자체를 바꾸고 '모두 지우기'로도 안 지워진다.
  const { FQ } = fixture({ settings: { players: ['민규'], speak: true } });
  const store = FQ.storage;
  // vm 컨텍스트 밖에서는 프로토타입이 달라 deepEqual 이 못 쓰인다 — 문자열로 비교한다.
  assert.equal(JSON.stringify(store.settings().dev), '{}');
  store.settings().dev.art = true;
  store.settings().players.push('덧붙은 이름');
  store.resetAll();
  assert.equal(JSON.stringify(store.settings().dev), '{}', '초기화한 설정에 dev 오염이 남았다');
  assert.equal(JSON.stringify(store.settings().players), '["민규"]', '초기화한 설정에 players 오염이 남았다');
});

/* ---------------- 출제 가중치 ---------------- */

test('wrong·streak 가 없는 옛 국기 레코드도 가중치가 유한한 양수라 가중 출제가 죽지 않는다', () => {
  // 옛 저장분: {seen, correct} 만 있고 wrong·streak 가 없다. 그대로 셈하면 NaN 이 되어
  // weightedPick 의 합이 NaN → 늘 마지막 후보만 뽑혀 '틀린 나라 더 자주' 가 통째로 무력화됐다.
  const { FQ } = fixture({ countries: { kr: { seen: 3, correct: 1 }, jp: { seen: 2, correct: 2, streak: 2 }, fr: { seen: 1 } } });
  for (const code of ['kr', 'jp', 'fr', 'us']) {
    const w = FQ.storage.weightOf(code);
    assert.ok(Number.isFinite(w) && w > 0, code + ' 가중치 ' + w);
  }
  assert.equal(FQ.storage.weightOf('us'), 2);      // 안 본 나라
  assert.equal(FQ.storage.weightOf('kr'), 1);      // wrong 이 없으면 늘 맞힌 나라로 본다
  assert.equal(FQ.storage.weightOf('jp'), 1);
  // 실제 가중 출제: 첫 후보가 NaN 없이 골고루 뽑히는지 (NaN 이면 늘 마지막 후보만 나온다)
  const picks = new Set();
  for (let i = 0; i < 40; i++) {
    const g = FQ.quiz.createGame({ mode: 'choice4', only: ['kr', 'jp', 'fr', 'us'], count: 2, reviewFirst: true });
    picks.add(g.questions[0].country.code);
  }
  assert.ok(picks.size >= 2, '가중 출제가 늘 같은 나라만 뽑는다: ' + [...picks]);
});

test('새 축 가중치는 자기 버킷만 읽고 레코드를 만들지 않으며 국기 가중치를 건드리지 않는다', () => {
  const { FQ } = fixture();
  const store = FQ.storage;
  assert.equal(store.axisWeightOf('symbol', 'kr'), 2, '아직 안 만난 쌍은 2');
  assert.deepEqual(Object.keys(store.allAxisStats('symbol')), [], '읽기만으로 레코드가 생기면 안 된다');
  for (let i = 0; i < 3; i++) store.recordAnswer('kr', false, 'symbol');
  assert.ok(store.axisWeightOf('symbol', 'kr') > 2.5, '틀린 쌍은 자주');
  assert.equal(store.axisWeightOf('place', 'kr'), 2, '다른 축 버킷은 보지 않는다');
  assert.equal(store.axisWeightOf('map', 'kr'), 2);
  assert.equal(store.weightOf('kr'), 2, '국기 가중치는 그대로');
  assert.deepEqual([...store.wrongList()], [], '국기 오답노트는 그대로');
  store.recordAnswer('kr', true, 'symbol');
  store.recordAnswer('kr', true, 'symbol');
  assert.equal(store.axisWeightOf('symbol', 'kr'), 1.2, '두 번 연속 맞히면 보통 빈도로');
  assert.deepEqual(Object.keys(store.allAxisStats('place')), []);
  assert.equal(store.axisWeightOf('flag', 'kr'), store.weightOf('kr'), 'flag 를 넘기면 국기 가중치');
  // 옛 부분 레코드도 NaN 없이
  const f = fixture({ axes: { place: { kr: { seen: 2, correct: 1 } } } });
  assert.equal(f.FQ.storage.axisWeightOf('place', 'kr'), 1);
});

test('새 축 게임은 axisWeightOf 로, 국기 게임은 weightOf 로 순서를 정한다', () => {
  const { FQ } = fixture();
  const seen = [];
  FQ.storage.weightOf = (code) => { seen.push('flag:' + code); return 1; };
  FQ.storage.axisWeightOf = (axis, code) => { seen.push(axis + ':' + code); return 1; };
  FQ.quiz.createGame({ mode: 'choice4', count: 3, reviewFirst: true });
  assert.ok(seen.length > 0 && seen.every(s => s.startsWith('flag:')), '국기 축은 weightOf 만 쓴다');
  seen.length = 0;
  FQ.quiz.createGame({ mode: 'symbol', count: 3, reviewFirst: true });
  assert.ok(seen.length > 0 && seen.every(s => s.startsWith('symbol:')), '그림 축은 axisWeightOf(symbol) 만 쓴다');
  seen.length = 0;
  FQ.quiz.createGame({ mode: 'place', count: 3, reviewFirst: false });
  assert.equal(seen.length, 0, '오답 우선을 끄면 가중치를 읽지 않는다');
});

/* ---------------- 한 판 안에서 다시 만나기 ---------------- */

function play(game, answerOf) {
  const log = [];
  while (!game.isOver()) {
    const q = game.current();
    const pick = answerOf(q, game.index);
    const r = game.submit({ code: pick });
    log.push({ code: q.country.code, again: !!q.again, correct: r.correct, scheduled: r.scheduledAgain });
    game.next();
  }
  return log;
}

test('새 축에서 처음 만난 쌍은 3문제 뒤에 한 번 더 나오고 총 문제 수는 그대로다', () => {
  const { FQ } = fixture();
  const g = FQ.quiz.createGame({ mode: 'symbol', count: 10 });
  assert.equal(g.total, 10);
  const first = g.current().country.code;
  const r = g.submit({ code: first });
  assert.equal(r.correct, true);
  assert.equal(r.scheduledAgain, true, '처음 만난 쌍은 맞혀도 다시 만난다');
  assert.equal(g.questions.length, 10, '총 문제 수는 늘지 않는다');
  assert.equal(g.total, 10);
  assert.equal(g.questions[3].country.code, first, '3문제 뒤에 같은 쌍');
  assert.equal(g.questions[3].again, true);
  assert.equal(g.questions[3].options.length, 4, '다시 만난 문제도 보기 4개');
  assert.ok(g.questions[3].options.some(c => c.code === first));
  g.next();
  const log = play(g, (q) => q.country.code);
  const codes = new Set(log.map(l => l.code));
  assert.equal(log.length, 9);
  for (const l of log.filter(l => l.again)) assert.equal(l.scheduled, false, '다시 만난 문제는 또 잡지 않는다');
  // 전부 처음 만나는 10문제 판: 새 나라 5개를 각각 두 번 만난다 (0·1·2 → 3·4·5, 6·7 → 8·9)
  assert.equal(g.againCount, 5, '다시 만나기 수 ' + g.againCount);
  assert.equal(codes.size, 5, '다시 만난 만큼 새 나라가 줄어든다');
  // 기록: 각 쌍이 만난 횟수만큼 seen 에 쌓인다
  const recs = FQ.storage.allAxisStats('symbol');
  assert.equal(Object.values(recs).reduce((n, r) => n + r.seen, 0), 10);
});

test('이미 만난 쌍은 맞히면 다시 안 나오고, 틀리면 3문제 뒤에 한 번만 더 나온다', () => {
  const { FQ } = fixture();
  const withArt = FQ.countries.filter(c => FQ.subjects[c.code]?.symbol && !FQ.subjects[c.code].symbol.noArt).slice(0, 10).map(c => c.code);
  for (const code of withArt) FQ.storage.recordAnswer(code, true, 'symbol');
  const g = FQ.quiz.createGame({ mode: 'symbol', only: withArt, count: 10 });
  const order = g.questions.map(q => q.country.code);
  const target = order[1];
  const log = play(g, (q, i) => (q.country.code === target ? (q.options.find(c => c.code !== target) || q.country).code : q.country.code));
  assert.equal(log[0].scheduled, false, '이미 만났고 맞혔으면 다시 안 잡는다');
  assert.equal(log[1].code, target);
  assert.equal(log[1].correct, false);
  assert.equal(log[1].scheduled, true, '틀리면 다시 잡는다');
  assert.equal(log[4].code, target, '3문제 뒤에 다시');
  assert.equal(log[4].again, true);
  assert.equal(log[4].correct, false);
  assert.equal(log[4].scheduled, false, '다시 만난 문제를 또 틀려도 세 번째는 없다');
  assert.equal(log.filter(l => l.code === target).length, 2);
  assert.equal(log.length, 10);
  assert.equal(g.againCount, 1);
  assert.equal(g.summary().wrong.length, 1, '두 번 틀려도 한 번 더 만날 나라에는 한 번');
  assert.equal(g.summary().total, 10);
  assert.equal(new Set(order.filter(c => log.some(l => l.code === c))).size, 9, '원래 마지막 문제 하나가 자리를 내준다');
});

test('짧은 판의 규칙: 2문제는 다시 만나기 없음, 3문제는 마지막 자리에, 마지막 두 문제는 잡지 않는다', () => {
  const { FQ } = fixture();
  const g2 = FQ.quiz.createGame({ mode: 'place', count: 2 });
  const log2 = play(g2, (q) => q.country.code);
  assert.deepEqual(log2.map(l => l.scheduled), [false, false]);
  assert.equal(g2.againCount, 0);
  assert.equal(new Set(log2.map(l => l.code)).size, 2);

  const g3 = FQ.quiz.createGame({ mode: 'place', count: 3 });
  const first = g3.current().country.code;
  const log3 = play(g3, (q) => q.country.code);
  assert.deepEqual(log3.map(l => l.scheduled), [true, false, false]);
  assert.equal(log3[2].code, first, '판이 짧으면 마지막 자리에');
  assert.equal(log3[2].again, true);
  assert.equal(log3.length, 3);

  const g1 = FQ.quiz.createGame({ mode: 'symbol', count: 1 });
  assert.equal(play(g1, (q) => q.country.code)[0].scheduled, false);
  assert.equal(g1.total, 1);
});

test('국기 축은 다시 만나기를 하지 않아 한 판에 같은 나라가 두 번 나오지 않는다', () => {
  const { FQ } = fixture();
  for (const mode of ['choice4', 'reverse']) {
    const g = FQ.quiz.createGame({ mode, count: 8, level: 'all' });
    const log = play(g, (q) => (q.options.find(c => c.code !== q.country.code) || q.country).code);
    assert.ok(log.every(l => !l.correct && !l.scheduled && !l.again));
    assert.equal(new Set(log.map(l => l.code)).size, 8, mode);
    assert.equal(g.againCount, 0);
    assert.equal(g.summary().wrong.length, 8);
  }
});

test('수도 축은 자기 버킷의 가중치와 다시 만나기를 쓰고 보기는 나라 중복만 막는다', () => {
  const { FQ } = fixture();
  FQ.storage.recordAnswer('kr', false, 'capital');
  const weights = [];
  const realPick = FQ.util.weightedPick;
  FQ.util.weightedPick = (items, ws) => { weights.push(ws); return realPick(items, ws); };
  const g = FQ.quiz.createGame({ mode: 'capital', count: 6, reviewFirst: true });
  FQ.util.weightedPick = realPick;
  assert.ok(weights.length > 0 && weights.every(ws => ws.every(w => Number.isFinite(w) && w > 0)));
  assert.equal(FQ.storage.axisWeightOf('capital', 'kr'), 3.1, '수도 축에서 틀린 나라의 가중치');
  assert.equal(FQ.storage.weightOf('kr'), 2, '국기 가중치는 그대로');
  // 보기는 문제가 화면에 오를 때(current) 만든다(D24) — 그때의 기록으로 보기 거리를 정하기 위해서다.
  const log = play(g, (q) => {
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options.map(c => c.code)).size, 4, '보기(국기) 나라 중복 없음');
    assert.ok(q.options.some(c => c.code === q.country.code));
    return q.country.code;
  });
  assert.equal(log.length, 6);
  assert.ok(g.againCount >= 1, '수도에서도 처음 만난 쌍을 다시 만난다');
  assert.equal(Object.keys(FQ.storage.allCountryStats()).length, 0, '국기 기록은 그대로');
  assert.equal(FQ.progress.hasSticker(g.questions[0].country.code), false, '194칸 국기 스티커는 국기 축만');
  assert.ok(Object.keys(FQ.storage.allAxisStats('capital')).length >= 1);
  assert.deepEqual(Object.keys(JSON.parse(FQ.storage.exportJson()).axes), ['capital'], '내보내기 JSON 에 capital 버킷');
});

/* ---------------- 수도 놀이 학습 규칙 (D24) ---------------- */

function metCodes(FQ, n, times = 1) {
  const codes = FQ.countries.slice(0, n).map(c => c.code);
  for (const code of codes) for (let i = 0; i < times; i++) FQ.storage.recordAnswer(code, true, 'capital');
  return codes;
}
// vm 안에서 만든 배열은 이쪽 Array 와 프로토타입이 달라 deepEqual 이 실패한다 — 늘 이쪽 배열로 옮겨 비교한다.
const positions = (codes, code) => Array.from(codes).map((c, i) => (c === code ? i : -1)).filter(i => i >= 0);

test('D24: 수도 놀이는 새 나라를 한 판에 3개까지만 소개하고 소개→1문제 뒤→3문제 뒤 리듬으로 다시 내며 남는 자리는 복습이다', () => {
  const { FQ } = fixture();
  const met = new Set(metCodes(FQ, 12, 5));   // 다섯 번 연속 맞힌 굳은 나라 12개
  const g = FQ.quiz.createGame({ mode: 'capital', count: 10, level: 'all' });
  const codes = g.questions.map(q => q.country.code);
  assert.equal(g.total, 10);
  assert.equal(g.questions.length, 10, '총 문제 수는 count 그대로');
  const fresh = [...new Set(codes.filter(c => !met.has(c)))];
  assert.equal(fresh.length, 3, '처음 만나는 나라는 3개: ' + codes.join(' '));
  assert.equal(codes.filter(c => met.has(c)).length, 2, '남는 자리 둘은 복습 — 판 끝 다시 만나기보다 먼저다');
  for (let i = 1; i < codes.length; i++) assert.notEqual(codes[i], codes[i - 1], '같은 나라가 연달아 나오지 않는다');
  assert.deepEqual(positions(codes, codes[0]), [0, 2, 6], '첫 나라: 소개 → 1문제 뒤 → 3문제 뒤');
  assert.deepEqual(positions(codes, codes[1]), [1, 3, 8]);
  assert.deepEqual(positions(codes, codes[4]), [4, 7]);
  assert.equal(g.questions[0].again, false);
  assert.equal(g.questions[2].again, true);
  assert.equal(g.questions[5].review, true);
  assert.equal(g.questions[9].review, true);
  assert.equal(g.againCount, 5, '계획된 다시 만나기부터 센다');
  assert.equal(g.questions[2].options, null, '보기는 문제가 오를 때 만든다');
  const log = play(g, (q) => q.country.code);
  assert.equal(log.length, 10);
  assert.ok(log.every(l => l.scheduled === false), '맞히면 계획 밖 다시 만나기는 없다');
  const recs = FQ.storage.allAxisStats('capital');
  assert.equal(recs[codes[0]].seen, 3);
  assert.equal(recs[codes[0]].streak, 3);
  assert.equal(g.summary().wrong.length, 0);
  // 복습할 나라가 없으면 판 끝에 한 번 더 나온다 (첫 나라 0·2·5·9번째).
  const h = fixture().FQ.quiz.createGame({ mode: 'capital', count: 10, level: 'all' });
  const hc = h.questions.map(q => q.country.code);
  assert.equal(new Set(hc).size, 3);
  assert.deepEqual(positions(hc, hc[0]), [0, 2, 5, 9]);
  assert.equal(hc.length, 10);
});

test('D24: 안 굳은 나라(복습 가중치 2 이상)가 한도의 두 배 이상 밀려 있으면 새 나라를 하나 줄인다', () => {
  const { FQ } = fixture();
  metCodes(FQ, 6, 1);   // 한 번씩만 맞힌 나라 6개 — 가중치 2.0
  const g = FQ.quiz.createGame({ mode: 'capital', count: 10, level: 'all' });
  const codes = Array.from(g.questions, q => q.country.code);
  const metSet = new Set(FQ.countries.slice(0, 6).map(c => c.code));
  assert.equal(new Set(codes.filter(c => !metSet.has(c))).size, 2, '새 나라는 2개: ' + codes.join(' '));
  assert.ok(codes.filter(c => metSet.has(c)).length >= 3, '복습이 늘어난다');
  const f = fixture();
  metCodes(f.FQ, 5, 1);   // 5개면 아직 한도 그대로
  const g2 = f.FQ.quiz.createGame({ mode: 'capital', count: 10, level: 'all' });
  const met2 = new Set(f.FQ.countries.slice(0, 5).map(c => c.code));
  assert.equal(new Set(Array.from(g2.questions, q => q.country.code).filter(c => !met2.has(c))).size, 3);
});

test('D24: 판이 짧거나 나라가 적으면 그만큼만 낸다 — 5문제는 새 나라 2개, 나라 하나면 문제 하나, 연달아 같은 나라는 없다', () => {
  const { FQ } = fixture();
  const g5 = FQ.quiz.createGame({ mode: 'capital', count: 5, level: 'all' });
  const codes5 = g5.questions.map(q => q.country.code);
  assert.equal(codes5.length, 5);
  assert.equal(new Set(codes5).size, 2, '5문제 판의 새 나라는 2개');
  assert.deepEqual(positions(codes5, codes5[0]), [0, 2, 4]);
  const g1 = FQ.quiz.createGame({ mode: 'capital', only: ['mx'], count: 10 });
  assert.equal(g1.total, 1, '나라 하나면 사이에 낄 문제가 없어 한 번만');
  assert.equal(play(g1, (q) => q.country.code)[0].scheduled, false);
  // 두 나라(둘 다 처음)면 번갈아 가며 각각 네 번까지. 위 판에서 mx 를 만났으므로 새 픽스처로 본다.
  const g2 = fixture().FQ.quiz.createGame({ mode: 'capital', only: ['mx', 'kr'], count: 10 });
  const codes2 = g2.questions.map(q => q.country.code);
  assert.equal(codes2.length, 8, '두 나라면 번갈아 넷까지: ' + codes2.join(' '));
  for (let i = 1; i < codes2.length; i++) assert.notEqual(codes2[i], codes2[i - 1]);
  assert.ok(codes2.filter(c => c === 'mx').length === 4 && codes2.filter(c => c === 'kr').length === 4, '한 나라는 계획상 네 번까지');
  // 만난 나라 하나 + 새 나라 하나면 새 나라는 사이에 낄 문제가 하나뿐이라 두 번, 만난 나라는 복습 한 번.
  const g3 = FQ.quiz.createGame({ mode: 'capital', only: ['mx', 'kr'], count: 10 });
  assert.deepEqual(Array.from(g3.questions, q => q.country.code), ['kr', 'mx', 'kr']);
  assert.equal(g3.questions[1].review, true);
  const gAll = fixture().FQ.quiz.createGame({ mode: 'capital', count: 'all', level: '1' });
  assert.ok(gAll.total <= FQ.quiz.pool({ level: '1' }).length, '전부 모드도 나라 수를 넘지 않는다');
  assert.equal(new Set(gAll.questions.map(q => q.country.code)).size, 5, '전부 모드의 새 나라는 5개');
});

test('D24: 복습 문제를 틀리면 1문제 뒤에 한 번 더 내고 복습 자리 하나를 뒤에서 뺀다(총 문제 수 불변), 한 판 상한은 다섯 번', () => {
  const { FQ } = fixture();
  const codes = metCodes(FQ, 12, 2);
  const g = FQ.quiz.createGame({ mode: 'capital', only: codes, count: 10 });
  assert.equal(g.total, 10);
  assert.ok(g.questions.every(q => q.review), '전부 만난 나라면 전부 복습');
  const order = g.questions.map(q => q.country.code);
  const target = order[0];
  const wrongOf = (q) => (q.options.find(c => c.code !== q.country.code) || q.country).code;
  const log = play(g, (q) => (q.country.code === target ? wrongOf(q) : q.country.code));
  assert.equal(log.length, 10, '총 문제 수는 그대로');
  assert.equal(g.total, 10);
  assert.equal(log.filter(l => l.code === target).length, 5, '틀릴 때마다 1문제 뒤에 — 다섯 번까지');
  assert.deepEqual(positions(log.map(l => l.code), target), [0, 2, 4, 6, 8]);
  assert.ok(log[0].scheduled && log[2].scheduled && log[4].scheduled && log[6].scheduled, '틀리면 다시 잡는다');
  assert.equal(log[8].scheduled, false, '상한에 닿으면 더 잡지 않는다');
  assert.ok(log.filter(l => l.code === target).slice(1).every(l => l.again));
  assert.equal(g.againCount, 4);
  assert.equal(g.summary().wrong.length, 1, '여러 번 틀려도 한 번 더 만날 나라에는 한 번');
  assert.equal(new Set(order.filter(c => log.some(l => l.code === c))).size, 6, '원래 복습 넷이 자리를 내준다');
  assert.equal(FQ.storage.allAxisStats('capital')[target].wrong, 5);
  // 마지막 두 문제에서는 사이에 낄 자리가 없어 잡지 않는다.
  const h = FQ.quiz.createGame({ mode: 'capital', only: codes, count: 3 });
  const hl = play(h, (q, i) => (i >= 1 ? wrongOf(q) : q.country.code));
  assert.deepEqual(hl.map(l => l.scheduled), [false, false, false]);
  assert.equal(hl.length, 3);
});

test('D24: 힌트 2단계로 나라 이름까지 듣고 맞힌 답은 점수는 주되 기록은 틀림으로 남기고 한 번 더 만난다', () => {
  const { FQ } = fixture();
  const codes = metCodes(FQ, 12, 2);
  const g = FQ.quiz.createGame({ mode: 'capital', only: codes, count: 10 });
  const q = g.current();
  const r = g.submit({ code: q.country.code }, true, { revealed: true });
  assert.equal(r.correct, true, '아이에게는 정답');
  assert.equal(r.learned, false, '기록에는 아직');
  assert.equal(r.gained, 10);
  assert.equal(g.correct, 1);
  assert.equal(g.hintsUsed, 1);
  assert.equal(r.scheduledAgain, true, '1문제 뒤에 한 번 더');
  assert.equal(g.questions[2].country.code, q.country.code);
  assert.deepEqual(Array.from(g.summary().wrong, c => c.code), [q.country.code], '한 번 더 만날 나라에 오른다');
  const rec = FQ.storage.allAxisStats('capital')[q.country.code];
  assert.deepEqual([rec.seen, rec.correct, rec.wrong, rec.streak], [3, 2, 1, 0]);
  // revealed 없이 맞히면 여느 정답과 같다.
  g.next();
  const q2 = g.current();
  const r2 = g.submit({ code: q2.country.code }, false, { revealed: false });
  assert.equal(r2.learned, true);
  assert.equal(r2.scheduledAgain, false);
  assert.equal(FQ.storage.allAxisStats('capital')[q2.country.code].streak, 3);
  // 다른 축은 opts 를 넘겨도 D15 그대로다.
  const s = FQ.quiz.createGame({ mode: 'symbol', count: 4 });
  const sq = s.current();
  const sr = s.submit({ code: sq.country.code }, false, { revealed: true });
  assert.equal(sr.correct, true);
  assert.equal(sr.learned, false);
  assert.equal(FQ.storage.allAxisStats('symbol')[sq.country.code].wrong, 1);
});

test('D24: 보기 거리는 익힌 정도로 정한다 — 처음은 다른 대륙 국기, 두 번 연속 맞히면 같은 대륙, 다섯 번이면 같은 지역', () => {
  const { FQ } = fixture();
  const rule = FQ.quiz.LEARN.capital;
  assert.equal(rule.spreadFor(undefined), 'far');
  assert.equal(rule.spreadFor({ streak: 1 }), 'far');
  assert.equal(rule.spreadFor({ streak: 2 }), 'mid');
  assert.equal(rule.spreadFor({ streak: 4 }), 'mid');
  assert.equal(rule.spreadFor({ streak: 5 }), 'near');
  const kr = FQ.quiz.byCode('kr');
  for (let i = 0; i < 20; i++) {
    const far = FQ.quiz.distractors(kr, 3, FQ.countries, 'capital', { axis: 'capital', spread: 'far' });
    assert.ok(far.every(c => c.continent !== '아시아'), '처음 만나는 나라의 보기는 다른 대륙: ' + far.map(c => c.ko));
    const mid = FQ.quiz.distractors(kr, 3, FQ.countries, 'capital', { axis: 'capital', spread: 'mid' });
    assert.ok(mid.every(c => c.continent === '아시아' && c.region !== '동아시아'), '두 번 맞히면 같은 대륙·다른 지역: ' + mid.map(c => c.ko));
    const near = FQ.quiz.distractors(kr, 3, FQ.countries, 'capital', { axis: 'capital', spread: 'near' });
    assert.ok(near.every(c => c.region === '동아시아'), '다섯 번 맞히면 같은 지역: ' + near.map(c => c.ko));
    const plain = FQ.quiz.distractors(kr, 3, FQ.countries, 'choice4');
    assert.ok(plain.every(c => c.region === '동아시아'), '국기 놀이는 원래대로 같은 지역부터');
  }
  // 문제가 오를 때의 기록으로 정한다: 다섯 번 연속 맞힌 나라는 같은 지역 국기와 겨룬다.
  for (let i = 0; i < 5; i++) FQ.storage.recordAnswer('kr', true, 'capital');
  const g = FQ.quiz.createGame({ mode: 'capital', only: ['kr'], count: 10 });
  assert.ok(g.current().options.filter(c => c.code !== 'kr').every(c => c.region === '동아시아'));
  const h = FQ.quiz.createGame({ mode: 'capital', only: ['jp'], count: 10 });
  assert.ok(h.current().options.filter(c => c.code !== 'jp').every(c => c.continent !== '아시아'), '처음 만나는 일본은 다른 대륙 국기와');
  // 대륙을 골라 놀면 다른 대륙이 없으니 같은 대륙·다른 지역으로 물러난다.
  const asia = FQ.quiz.pool({ continent: '아시아' });
  const farAsia = FQ.quiz.distractors(kr, 3, asia, 'capital', { axis: 'capital', spread: 'far' });
  assert.ok(farAsia.every(c => c.continent === '아시아' && c.region !== '동아시아'));
});

test('D24: 복습 순서는 틀렸거나 한 번밖에 못 맞힌 나라가 먼저 흔들리고, 그림·명소·지도는 D15 그대로다', () => {
  const { FQ } = fixture();
  const w = FQ.quiz.LEARN.capital.reviewWeight;
  assert.equal(w({ seen: 2, correct: 1, wrong: 1, streak: 0 }), 3.0);
  assert.equal(w({ seen: 1, correct: 1, wrong: 0, streak: 1 }), 2.0);
  assert.equal(w({ seen: 3, correct: 3, wrong: 0, streak: 3 }), 1.4);
  assert.equal(w({ seen: 9, correct: 9, wrong: 0, streak: 9 }), 0.6);
  assert.equal(w(undefined), 2.0);
  assert.deepEqual(Object.keys(FQ.quiz.LEARN), ['capital'], '학습 규칙은 수도 축만');
  for (const mode of ['symbol', 'place']) {
    const g = FQ.quiz.createGame({ mode, count: 10 });
    assert.ok(g.questions.every(q => q.options && q.options.length === 4 && !q.review), mode + ' 은 보기를 미리 만들고 복습 표시가 없다');
    assert.equal(g.againCount, 0, mode + ' 은 다시 만나기를 채점 때 잡는다');
  }
});

test('지도 축도 자기 버킷의 가중치와 다시 만나기를 쓴다', () => {
  const { FQ } = fixture();
  FQ.map = { MIN_WIDTH: 0, chooseOptions: (answer, source) => [answer].concat(source.filter(c => c !== answer).slice(0, 3)) };
  FQ.storage.recordAnswer('kr', false, 'map');
  const weights = [];
  const realPick = FQ.util.weightedPick;
  FQ.util.weightedPick = (items, ws) => { weights.push(ws); return realPick(items, ws); };
  const g = FQ.quiz.createGame({ mode: 'map', count: 5, reviewFirst: true });
  FQ.util.weightedPick = realPick;
  assert.ok(weights.length > 0 && weights.every(ws => ws.every(w => Number.isFinite(w) && w > 0)));
  const log = play(g, (q) => q.country.code);
  assert.equal(log.length, 5);
  assert.ok(g.againCount >= 1, '지도에서도 처음 만난 쌍을 다시 만난다');
  assert.equal(Object.keys(FQ.storage.allCountryStats()).length, 0, '국기 기록은 그대로');
});
