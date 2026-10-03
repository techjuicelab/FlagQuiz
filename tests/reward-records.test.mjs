/* 입력 출처에 맞는 배지와 정답 세부 집계, 기기 날짜 및 옛 기록 호환성을 검사한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const KEY = 'flagquiz.v1';
const MODES = ['choice4', 'reverse', 'typing', 'voice', 'capital', 'capitalVoice', 'map', 'symbol', 'place'];

function fixture({ saved, Clock = Date } = {}) {
  const local = new Map(saved === undefined ? [] : [[KEY, JSON.stringify(saved)]]);
  const c = {
    Date: Clock,
    localStorage: {
      getItem: key => local.get(key) ?? null,
      setItem: (key, value) => local.set(key, String(value))
    }
  };
  c.window = c;
  vm.createContext(c);
  for (const file of ['js/util.js', 'js/storage.js', 'js/features.js', 'data/countries.js', 'data/subjects.js', 'data/map-coords.js', 'js/map.js', 'js/progress.js', 'js/quiz.js', 'js/badges.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), c, { filename: file });
  }
  return { FQ: c.FQ, local };
}

function answer(FQ, q, source) {
  const definition = FQ.quiz.MODES[q.mode];
  const payload = definition.kind === 'choice'
    ? { code: q.country.code }
    : { text: definition.answer === 'capital' ? q.country.capital : q.country.ko };
  if (source) payload.source = source;
  return payload;
}

function finish(FQ, game) {
  const summary = game.summary();
  FQ.storage.finishGame(summary);
  return { summary, badges: FQ.badges.check(summary).map(b => b.id) };
}

test('목소리 탐험가는 실제 국기 음성 정답에만 주며 글자·터치 대체 답에는 주지 않는다', () => {
  for (const [input, expected] of [
    [{ text: '대한민국', source: 'voice' }, 1],
    [{ text: '대한민국' }, 0],
    [{ code: 'kr' }, 0],
    [{ text: '대한민국', source: 'typing' }, 0]
  ]) {
    const { FQ } = fixture();
    const game = FQ.quiz.createGame({ mode: 'voice', only: ['kr'], count: 1 });
    assert.equal(game.submit(input).correct, true);
    assert.equal(game.submit(input), null, '늦은 중간 결과와 최종 결과가 중복 제출돼도 한 번만 센다');
    const { summary, badges } = finish(FQ, game);
    assert.equal(summary.correct, 1);
    assert.equal(summary.voiceCorrect, expected);
    assert.equal(badges.includes('voice_win'), Boolean(expected), JSON.stringify(input));
    assert.equal(Boolean(FQ.storage.badges().voice_win), Boolean(expected));
  }
});

test('음성 오답은 음성 정답 횟수와 목소리 배지를 올리지 않는다', () => {
  const { FQ } = fixture();
  const game = FQ.quiz.createGame({ mode: 'voice', only: ['kr'], count: 1 });
  assert.equal(game.submit({ text: '일본', source: 'voice' }).correct, false);
  const { summary, badges } = finish(FQ, game);
  assert.deepEqual([summary.correct, summary.learnedCorrect, summary.helpedCorrect, summary.voiceCorrect], [0, 0, 0, 0]);
  assert.equal(badges.includes('voice_win'), false);
});

test('음성 출처 표시가 있어도 터치 대체 문제와 일반 글자 문제는 음성 정답으로 세지 않는다', () => {
  for (const mode of ['reverse', 'typing']) {
    const { FQ } = fixture();
    const game = FQ.quiz.createGame({ mode, only: ['kr'], count: 1 });
    // 오프라인 전환은 판의 설정을 voice로 두고 현재 문제만 reverse로 바꾼다.
    if (mode === 'reverse') game.config.mode = 'voice';
    assert.equal(game.submit(answer(FQ, game.current(), 'voice')).correct, true);
    const { summary, badges } = finish(FQ, game);
    assert.equal(summary.voiceCorrect, 0, mode);
    assert.equal(badges.includes('voice_win'), false, mode);
  }
});

test('수도 말하기의 실제 음성 정답은 추적하되 D17의 국기 목소리 배지 범위는 유지한다', () => {
  const { FQ } = fixture();
  const game = FQ.quiz.createGame({ mode: 'capitalVoice', only: ['kr'], count: 1 });
  assert.equal(game.submit(answer(FQ, game.current(), 'voice')).correct, true);
  const { summary, badges } = finish(FQ, game);
  assert.equal(summary.voiceCorrect, 1);
  assert.equal(badges.includes('voice_win'), false);
  assert.equal(FQ.storage.allAxisStats('capital').kr.correct, 1);
  assert.deepEqual(Object.keys(FQ.storage.allCountryStats()), []);
});

test('실제 입력 집계 없는 옛 요약에 새 음성 배지를 주지 않고 이미 얻은 배지는 보존한다', () => {
  const fresh = fixture();
  const oldSummary = { mode: 'voice', total: 1, correct: 1 };
  assert.equal(fresh.FQ.badges.check(oldSummary).some(b => b.id === 'voice_win'), false);
  const { FQ } = fixture({ saved: { badges: { voice_win: '2026-10-03' } } });
  FQ.badges.check(oldSummary);
  FQ.badges.check({ ...oldSummary, voiceCorrect: 0 });
  assert.equal(FQ.storage.badges().voice_win, '2026-10-03');
});

test('아홉 퀴즈의 독립 정답·답을 공개하지 않은 힌트·오답은 기존 학습 정책과 같은 세부 집계를 남긴다', () => {
  for (const mode of MODES) {
    const { FQ } = fixture();
    const game = FQ.quiz.createGame({ mode, only: ['kr', 'jp', 'fr'], count: 3 });
    assert.equal(game.total, 3, mode);
    assert.deepEqual([game.learnedCorrect, game.helpedCorrect, game.voiceCorrect], [0, 0, 0]);
    for (let i = 0; i < 2; i++) {
      const q = game.current();
      const result = game.submit(answer(FQ, q), i === 1, { revealed: false });
      assert.equal(result.correct, true, mode);
      assert.equal(result.learned, true, '답을 공개하지 않은 힌트는 기존 학습 인정 정책을 유지한다');
      game.next();
    }
    assert.equal(game.submit({ text: '' }).correct, false, mode);
    const { summary } = finish(FQ, game);
    assert.deepEqual([summary.correct, summary.learnedCorrect, summary.helpedCorrect, summary.voiceCorrect], [2, 2, 0, 0], mode);
    assert.equal(summary.correct, summary.learnedCorrect + summary.helpedCorrect);
    assert.equal(summary.hintsUsed, 1);
    assert.equal(FQ.storage.stats().correct, 2, '전체 학습 정답 통계는 유지한다');
    assert.equal(FQ.storage.history()[0].learnedCorrect, 2);
    assert.equal(FQ.storage.history()[0].helpedCorrect, 0);
  }
});

test('수도 답을 듣고 맞힌 정답은 helpedCorrect로 분리하고 점수·학습 기록·복습 목록은 유지한다', () => {
  for (const mode of ['capital', 'capitalVoice']) {
    const { FQ } = fixture();
    const game = FQ.quiz.createGame({ mode, only: ['kr', 'jp', 'fr'], count: 3 });
    const helped = game.current().country.code;
    const revealed = game.submit(answer(FQ, game.current()), true, { revealed: true });
    assert.deepEqual([revealed.correct, revealed.learned, revealed.gained], [true, false, 10]);
    game.next();
    const independent = game.current().country.code;
    game.submit(answer(FQ, game.current()), true, { revealed: false });
    game.next();
    const wrong = game.current().country.code;
    game.submit({ text: '' }, true, { revealed: true });
    const { summary } = finish(FQ, game);
    assert.deepEqual([summary.correct, summary.learnedCorrect, summary.helpedCorrect], [2, 1, 1], mode);
    assert.equal(summary.score, 20);
    assert.equal(summary.hintsUsed, 3);
    assert.deepEqual(Array.from(summary.wrong, country => country.code), [helped, wrong]);
    const records = FQ.storage.allAxisStats('capital');
    assert.deepEqual([records[helped].correct, records[helped].wrong, records[helped].streak], [0, 1, 0]);
    assert.equal(records[independent].correct, 1);
    assert.equal(records[wrong].wrong, 1);
    assert.equal(FQ.storage.stats().correct, 1);
    assert.deepEqual([FQ.storage.history()[0].learnedCorrect, FQ.storage.history()[0].helpedCorrect], [1, 1]);
  }
});

test('답을 듣고 맞힌 수도 한 판도 기존 정답 점수와 만점·연속 배지를 유지한다', () => {
  const { FQ } = fixture();
  const game = FQ.quiz.createGame({ mode: 'capital', count: 5 });
  while (!game.isOver()) {
    game.submit(answer(FQ, game.current()), true, { revealed: true });
    game.next();
  }
  const { summary, badges } = finish(FQ, game);
  assert.deepEqual([summary.correct, summary.learnedCorrect, summary.helpedCorrect, summary.score, summary.bestStreak], [5, 0, 5, 65, 5]);
  assert.equal(FQ.storage.stats().correct, 0);
  assert.ok(badges.includes('perfect'));
  assert.ok(badges.includes('streak5'));
});

test('새 정답 세부 기록을 백업·재로드해도 보존하고 옛 기록에는 추정 필드를 추가하지 않는다', () => {
  const oldRecord = { date: '2026-09-15', mode: 'capital', total: 5, correct: 5, players: ['민규'] };
  const { FQ } = fixture({ saved: { history: [oldRecord] } });
  FQ.storage.finishGame({ mode: 'capital', total: 2, correct: 2, learnedCorrect: 1, helpedCorrect: 1, players: ['민규'] });
  FQ.storage.finishGame({ mode: 'voice', total: 1, correct: 1, players: ['민규'] });
  const backup = FQ.storage.exportJson();
  const restored = fixture({ saved: JSON.parse(backup) });
  assert.deepEqual(JSON.parse(restored.FQ.storage.exportJson()), JSON.parse(backup));
  const [legacySummaryRecord, newRecord, preserved] = restored.FQ.storage.history();
  assert.equal(Object.hasOwn(legacySummaryRecord, 'learnedCorrect'), false);
  assert.equal(Object.hasOwn(legacySummaryRecord, 'helpedCorrect'), false);
  assert.deepEqual([newRecord.learnedCorrect, newRecord.helpedCorrect], [1, 1]);
  assert.deepEqual(JSON.parse(JSON.stringify(preserved)), oldRecord);
  assert.equal(Object.hasOwn(preserved, 'learnedCorrect'), false);
});

class LocalEvening extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-03T01:30:00.000Z'])); }
  static now() { return Date.parse('2026-10-03T01:30:00.000Z'); }
  getFullYear() { return 2026; }
  getMonth() { return 9; }
  getDate() { return 2; }
}

test('UTC와 기기 날짜가 달라도 새 놀이·배지·도장 날짜는 같은 기기 날짜를 쓰고 옛 날짜는 보존한다', () => {
  assert.equal(new LocalEvening().toISOString().slice(0, 10), '2026-10-03', 'UTC 날짜는 이미 다음 날');
  const oldRecord = { date: '2026-10-03', mode: 'voice', total: 1, correct: 1, players: ['민규'] };
  const oldStamp = { seen: 1, correct: 1, wrong: 0, streak: 1, correctDays: 1, lastCorrectDay: '2026-10-03' };
  const { FQ } = fixture({ Clock: LocalEvening, saved: {
    history: [oldRecord], badges: { voice_win: '2026-10-03' }, axes: { capital: { jp: oldStamp } }
  } });
  FQ.storage.recordAnswer('kr', true, 'capital');
  FQ.storage.finishGame({ mode: 'capital', total: 1, correct: 1, learnedCorrect: 1, helpedCorrect: 0, players: ['민규'] });
  assert.equal(FQ.storage.awardBadge('first_game'), true);
  assert.equal(FQ.storage.awardBadge('voice_win'), false);
  assert.equal(FQ.storage.history()[0].date, '2026-10-02');
  assert.equal(FQ.storage.badges().first_game, '2026-10-02');
  assert.equal(FQ.storage.allAxisStats('capital').kr.lastCorrectDay, '2026-10-02');
  assert.deepEqual(JSON.parse(JSON.stringify(FQ.storage.history()[1])), oldRecord);
  assert.equal(FQ.storage.badges().voice_win, '2026-10-03');
  assert.deepEqual(JSON.parse(JSON.stringify(FQ.storage.allAxisStats('capital').jp)), oldStamp);
  const restored = fixture({ Clock: LocalEvening, saved: JSON.parse(FQ.storage.exportJson()) });
  assert.deepEqual(JSON.parse(restored.FQ.storage.exportJson()), JSON.parse(FQ.storage.exportJson()));
});
