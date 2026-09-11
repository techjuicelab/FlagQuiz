/* 국기 퀴즈 - 보상 체계
 *
 * 별, 경험치와 레벨, 스티커, 보물상자, 하루 도전을 한곳에서 계산한다.
 * 대부분은 이미 저장하고 있던 것에서 끌어낸다.
 *   - 스티커 : 나라별 정답 기록 (한 번이라도 맞힌 나라 = 스티커를 얻은 나라)
 *   - 콤보   : 한 판 안에서의 연속 정답
 *   - 별     : 한 판의 정답률
 * 새로 저장하는 것은 누적 경험치와 하루 도전 두 가지뿐이다.
 */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});

  /* 레벨: 이름과, 그 레벨이 시작되는 누적 경험치 */
  var LEVELS = [
    { name: '씨앗 탐험가', emoji: '🌱', from: 0 },
    { name: '새싹 탐험가', emoji: '🌿', from: 300 },
    { name: '나침반 탐험가', emoji: '🧭', from: 900 },
    { name: '지도 박사', emoji: '🗺️', from: 2000 },
    { name: '세계 박사', emoji: '🌍', from: 4000 }
  ];

  /** 한 문제를 맞혔을 때 받는 경험치. 연속으로 맞힐수록 더 준다. */
  function xpFor(streak) {
    var xp = 10;
    if (streak >= 3) xp += 5;
    if (streak >= 7) xp += 5;
    return xp;
  }

  function xp() {
    var s = FQ.storage.stats();
    return Math.max(0, s.xp || 0);
  }

  /**
   * 지금 레벨과 다음 레벨까지의 진행.
   *   { number, name, emoji, into, need, ratio, isMax }
   * into/need 는 "이 레벨 안에서 얼마나 왔는지" 라서 화면의 경험치 바에 그대로 쓴다.
   */
  function level() {
    var total = xp();
    var i = 0;
    for (var k = 0; k < LEVELS.length; k++) if (total >= LEVELS[k].from) i = k;
    var cur = LEVELS[i];
    var next = LEVELS[i + 1];
    var into = total - cur.from;
    var need = next ? next.from - cur.from : into;
    return {
      number: i + 1,
      name: cur.name,
      emoji: cur.emoji,
      into: into,
      need: need,
      ratio: next ? Math.min(1, into / need) : 1,
      isMax: !next
    };
  }

  /** 경험치를 더하고, 레벨이 올랐으면 오른 레벨을 돌려준다. */
  function addXp(amount) {
    if (!amount) return null;
    var before = level().number;
    FQ.storage.addXp(amount);
    var after = level();
    return after.number > before ? after : null;
  }

  /* ---------------- 스티커 ---------------- */

  /** 한 번이라도 맞힌 나라는 스티커를 얻은 것으로 본다. */
  function hasSticker(code) {
    var s = FQ.storage.allCountryStats()[code];
    return !!(s && s.correct > 0);
  }

  /** { owned, total, left, ratio, byContinent: { 아시아: {owned, total}, … } } */
  function stickers() {
    var stats = FQ.storage.allCountryStats();
    var list = FQ.countries || [];
    var owned = 0;
    var by = {};
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!by[c.continent]) by[c.continent] = { owned: 0, total: 0 };
      by[c.continent].total += 1;
      var s = stats[c.code];
      if (s && s.correct > 0) { owned += 1; by[c.continent].owned += 1; }
    }
    return {
      owned: owned,
      total: list.length,
      left: list.length - owned,
      ratio: list.length ? owned / list.length : 0,
      byContinent: by
    };
  }

  /* ---------------- 별 ---------------- */

  /** 한 판의 정답률로 별 개수를 정한다 (0~3). */
  function starsFor(correct, total) {
    if (!total) return 0;
    var rate = correct / total;
    if (rate >= 0.9) return 3;
    if (rate >= 0.7) return 2;
    if (rate >= 0.4) return 1;
    return 0;
  }

  /* ---------------- 보물상자 ---------------- */

  var CHEST_EVERY = 5;

  /** 누적 학습 카드로 여행 상자가 열리는가 (5, 10, 15 …) */
  function chestOpensAt(cards) {
    return cards > 0 && cards % CHEST_EVERY === 0;
  }

  /** 다음 상자까지 남은 개수와 진행 비율 */
  function chestProgress(cards) {
    var into = Math.max(0, Number(cards) || 0) % CHEST_EVERY;
    return { into: into, need: CHEST_EVERY, left: CHEST_EVERY - into, ratio: into / CHEST_EVERY };
  }

  /* ---------------- 하루 도전 ---------------- */

  var CONTINENTS = ['아시아', '유럽', '아프리카', '북아메리카', '남아메리카', '오세아니아'];
  var DAILY_TARGET = 5;

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /** 날짜에서 대륙을 고른다. 같은 날에는 늘 같은 대륙이 나온다. */
  function continentForDay(dateStr) {
    var sum = 0;
    for (var i = 0; i < dateStr.length; i++) sum += dateStr.charCodeAt(i);
    return CONTINENTS[sum % CONTINENTS.length];
  }

  /** 오늘의 도전. 날짜가 바뀌면 새로 만든다. */
  function daily() {
    var d = FQ.storage.daily();
    var day = today();
    if (d.date !== day) {
      d = { date: day, continent: continentForDay(day), done: 0 };
      FQ.storage.setDaily(d);
    }
    return {
      date: d.date,
      continent: d.continent,
      done: Math.min(d.done, DAILY_TARGET),
      target: DAILY_TARGET,
      ratio: Math.min(1, d.done / DAILY_TARGET),
      complete: d.done >= DAILY_TARGET
    };
  }

  /**
   * 한 문제를 맞혔을 때 하루 도전에 반영한다.
   * 오늘의 대륙에 속한 나라를 맞혔을 때만 올라간다.
   * 이번에 도전을 막 끝냈으면 true 를 돌려준다.
   */
  function noteDaily(country, isCorrect) {
    if (!isCorrect || !country) return false;
    var d = daily();
    if (d.complete) return false;
    if (country.continent !== d.continent) return false;
    var raw = FQ.storage.daily();
    raw.done = (raw.done || 0) + 1;
    FQ.storage.setDaily(raw);
    return raw.done >= DAILY_TARGET;
  }

  FQ.progress = {
    LEVELS: LEVELS,
    CHEST_EVERY: CHEST_EVERY,
    DAILY_TARGET: DAILY_TARGET,
    xpFor: xpFor,
    xp: xp,
    level: level,
    addXp: addXp,
    hasSticker: hasSticker,
    stickers: stickers,
    starsFor: starsFor,
    chestOpensAt: chestOpensAt,
    chestProgress: chestProgress,
    daily: daily,
    noteDaily: noteDaily,
    continentForDay: continentForDay
  };
})(window);
