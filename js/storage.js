/* 국기 퀴즈 - 브라우저 저장소
 * 설정, 누적 통계, 오답노트, 배지를 localStorage에 담는다.
 * 사생활 보호를 위해 기기 밖으로 나가는 데이터는 하나도 없다.
 */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var KEY = 'flagquiz.v1';
  var FLAG_AXIS = 'flag';

  var DEFAULTS = {
    settings: {
      players: ['민규'],
      mode: 'choice4',
      level: '1',
      continent: 'all',
      count: 10,
      sound: true,
      homeMusic: false,
      correctMusic: false,
      speak: true,
      reviewFirst: true,
      timer: 0,
      dev: {}
    },
    stats: {
      games: 0,
      asked: 0,
      correct: 0,
      bestStreak: 0,
      playSeconds: 0,
      xp: 0
    },
    /* 오늘의 도전: { date: 'YYYY-MM-DD', continent, done } */
    daily: { date: '', continent: '', done: 0 },
    /* code -> {seen, correct, wrong, streak} */
    countries: {},
    badges: {},
    axes: {},   /* axis(symbol·place·map·capital) -> code -> {seen,correct,wrong,streak} — 읽을 때는 늘 (x || 0) */
    history: [],
    /* 깜짝 상자: since = 지난 상자 뒤 쌓인 카드 수(8장 보장의 근거), opened = 연 상자 수, kinds = 종류별 수. 읽을 때는 (x || 0) */
    chest: { since: 0, opened: 0, kinds: {} }
  };

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  function load() {
    var data = deepClone(DEFAULTS);
    try {
      var raw = global.localStorage.getItem(KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        Object.keys(DEFAULTS).forEach(function (k) {
          if (saved[k] && typeof saved[k] === 'object') {
            data[k] = Array.isArray(DEFAULTS[k])
              ? saved[k]
              : Object.assign({}, DEFAULTS[k], saved[k]);
          }
        });
        // DEFAULTS 를 그대로 병합하면 저장분에 없던 객체 값(dev·players)이 DEFAULTS 의
        // 실물 참조로 들어와, 제자리로 고치는 순간 기본값 자체가 오염되고 초기화로도 안 지워진다.
        if (saved.settings) data.settings = Object.assign(deepClone(DEFAULTS.settings), saved.settings);
      }
    } catch (e) {
      /* 시크릿 모드나 저장소 차단 환경에서도 게임은 그대로 돌아간다 */
    }
    if (!Array.isArray(data.settings.players) || !data.settings.players.length) {
      data.settings.players = DEFAULTS.settings.players.slice();
    }
    if (!Array.isArray(data.history)) data.history = [];
    return data;
  }

  var state = load();

  function save() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* 저장 실패해도 진행에 지장 없음 */ }
  }

  function settings() { return state.settings; }

  function updateSettings(patch) {
    Object.assign(state.settings, patch);
    save();
    return state.settings;
  }

  function countryStat(code) {
    if (!state.countries[code]) {
      state.countries[code] = { seen: 0, correct: 0, wrong: 0, streak: 0 };
    }
    return state.countries[code];
  }

  /** 그림·명소·지도·수도 기록은 국기 오답노트와 별도 버킷에 둔다(axes.symbol · axes.place · axes.map · axes.capital). */
  function axisStat(axis, code) {
    state.axes[axis] = state.axes[axis] || {};
    var records = state.axes[axis];
    records[code] = records[code] || {};
    var r = records[code];
    r.seen = r.seen || 0;
    r.correct = r.correct || 0;
    r.wrong = r.wrong || 0;
    r.streak = r.streak || 0;
    return r;
  }

  /** 오늘 날짜(기기 시간) — 도장 단계의 '다른 날' 판정용. progress.js 의 today 와 같은 모양이다. */
  function localDay() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /** 한 문제의 결과를 기록한다. 축을 생략한 옛 호출은 계속 국기 기록이다. */
  function recordAnswer(code, isCorrect, axis) {
    var ax = axis || FLAG_AXIS;
    var s = ax === FLAG_AXIS ? countryStat(code) : axisStat(ax, code);
    s.seen = (s.seen || 0) + 1;
    s.correct = s.correct || 0;
    s.wrong = s.wrong || 0;
    s.streak = s.streak || 0;
    // 새 축 도장 단계(D26)용: 맞힌 날 수(correctDays)와 마지막으로 맞힌 날(lastCorrectDay).
    // 옛 기록에 없으면 이미 맞힌 적이 있는 것을 하루로 친다 — 예전에 딴 도장은 그대로 인정한다.
    var hadCorrect = (s.correct || 0) > 0;
    var days = s.correctDays === undefined ? (hadCorrect ? 1 : 0) : (s.correctDays || 0);
    if (isCorrect) {
      s.correct = (s.correct || 0) + 1;
      s.streak = (s.streak || 0) + 1;
      if (ax !== FLAG_AXIS) {
        var day = localDay();
        if (s.lastCorrectDay !== day) { s.correctDays = days + 1; s.lastCorrectDay = day; }
        else s.correctDays = days;
      }
    } else {
      s.wrong = (s.wrong || 0) + 1;
      s.streak = 0;
    }
    state.stats.asked = (state.stats.asked || 0) + 1;
    if (isCorrect) state.stats.correct = (state.stats.correct || 0) + 1;
    save();
  }

  /**
   * 아직 확실히 익히지 못한 나라 목록 (오답노트).
   * 한 번 맞히면 목록에서는 빠진다 — 복습 한 판을 다 맞혔는데 개수가 그대로면
   * 아이 입장에서는 아무 일도 일어나지 않은 것과 같기 때문이다.
   * 대신 weightOf 가 두 번 연속 맞힐 때까지 계속 자주 내보내므로 그냥 놓아 주는 것은 아니다.
   */
  function wrongList() {
    return Object.keys(state.countries).filter(function (code) {
      var s = state.countries[code];
      return s.wrong > 0 && s.streak < 1;
    });
  }

  /**
   * 레코드 하나의 출제 가중치. 틀렸던 나라일수록 자주 나온다.
   * 옛 저장분에는 wrong·streak 가 없을 수 있다. 그대로 셈하면 NaN 이 되어
   * weightedPick 의 합이 NaN 이 되고, 결국 늘 마지막 후보만 뽑혀 가중 출제가 통째로 죽는다.
   */
  function weightFrom(s) {
    if (!s || !((s.seen || 0) > 0)) return 2.0;       // 아직 안 본 나라
    var wrong = s.wrong || 0;
    var streak = s.streak || 0;
    if (wrong === 0) return 1.0;                        // 늘 맞힌 나라
    if (streak >= 2) return 1.2;                        // 최근 두 번 연속 맞힘
    return 2.5 + Math.min(wrong, 4) * 0.6;              // 자주 틀린 나라
  }

  /** 출제 가중치 (국기 축). */
  function weightOf(code) {
    return weightFrom(state.countries[code]);
  }

  /**
   * 새 축(그림·명소·지도·수도)의 출제 가중치. 그 축의 버킷만 읽고, 국기 기록은 보지 않는다.
   * 읽기만 한다 — axisStat 과 달리 레코드를 만들지 않으므로 출제만으로 도장 수가 바뀌지 않는다.
   */
  function axisWeightOf(axis, code) {
    if (!axis || axis === FLAG_AXIS) return weightOf(code);
    var bucket = (state.axes || {})[axis];
    return weightFrom(bucket ? bucket[code] : null);
  }

  function finishGame(summary) {
    state.stats.games += 1;
    state.stats.playSeconds += summary.seconds || 0;
    if (summary.bestStreak > state.stats.bestStreak) state.stats.bestStreak = summary.bestStreak;
    state.history.unshift({
      date: new Date().toISOString().slice(0, 10),
      mode: summary.mode,
      total: summary.total,
      correct: summary.correct,
      players: summary.players
    });
    state.history = state.history.slice(0, 50);
    save();
  }

  function stats() { return state.stats; }

  /** 경험치를 더한다 */
  function addXp(amount) {
    state.stats.xp = Math.max(0, (state.stats.xp || 0) + (amount || 0));
    save();
    return state.stats.xp;
  }

  function daily() { return state.daily; }

  function setDaily(next) {
    state.daily = { date: next.date || '', continent: next.continent || '', done: next.done || 0 };
    save();
    return state.daily;
  }
  function history() { return state.history; }
  function allCountryStats() { return state.countries; }
  function allAxisStats(axis) { return state.axes[axis] || {}; }
  function exportJson() {
    try { return JSON.stringify(state, null, 2); }
    catch (e) { return '{}'; }
  }
  function badges() { return state.badges; }

  function awardBadge(id) {
    if (state.badges[id]) return false;
    state.badges[id] = new Date().toISOString().slice(0, 10);
    save();
    return true;
  }

  function resetAll() {
    state = deepClone(DEFAULTS);
    save();
  }

  function resetProgress() {
    state.stats = deepClone(DEFAULTS.stats);
    state.countries = {};
    state.badges = {};
    state.axes = {};
    state.history = [];
    state.daily = deepClone(DEFAULTS.daily);
    state.chest = deepClone(DEFAULTS.chest);
    save();
  }

  /* ---------------- 깜짝 상자 ---------------- */

  /** 읽기 전용. 옛 저장분에는 chest 버킷이 없으므로 전부 (x || 0) 로 방어한다. */
  function chestState() {
    var c = state.chest && typeof state.chest === 'object' ? state.chest : {};
    return { since: Number(c.since) || 0, opened: Number(c.opened) || 0, kinds: c.kinds && typeof c.kinds === 'object' ? c.kinds : {} };
  }

  /** 카드 한 장이 쌓였다. kind 가 있으면 그 종류의 상자가 열린 것이고 since 는 0 으로 돌아간다. */
  function recordChest(kind) {
    var c = state.chest = state.chest && typeof state.chest === 'object' ? state.chest : {};
    if (kind) {
      c.since = 0;
      c.opened = (Number(c.opened) || 0) + 1;
      c.kinds = c.kinds && typeof c.kinds === 'object' ? c.kinds : {};
      c.kinds[kind] = (c.kinds[kind] || 0) + 1;
    } else {
      c.since = (Number(c.since) || 0) + 1;
    }
    save();
    return chestState();
  }

  FQ.storage = {
    settings: settings,
    updateSettings: updateSettings,
    countryStat: countryStat,
    axisStat: axisStat,
    recordAnswer: recordAnswer,
    wrongList: wrongList,
    weightOf: weightOf,
    axisWeightOf: axisWeightOf,
    finishGame: finishGame,
    stats: stats,
    addXp: addXp,
    daily: daily,
    setDaily: setDaily,
    history: history,
    allCountryStats: allCountryStats,
    allAxisStats: allAxisStats,
    exportJson: exportJson,
    badges: badges,
    awardBadge: awardBadge,
    resetAll: resetAll,
    resetProgress: resetProgress,
    chestState: chestState,
    recordChest: recordChest
  };
})(window);
