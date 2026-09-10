/* 국기 퀴즈 - 브라우저 저장소
 * 설정, 누적 통계, 오답노트, 배지를 localStorage에 담는다.
 * 사생활 보호를 위해 기기 밖으로 나가는 데이터는 하나도 없다.
 */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var KEY = 'flagquiz.v1';

  var DEFAULTS = {
    settings: {
      players: ['민규'],
      mode: 'choice4',
      level: '1',
      continent: 'all',
      count: 10,
      sound: true,
      speak: true,
      reviewFirst: true,
      timer: 0
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
    history: []
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
        if (saved.settings) data.settings = Object.assign({}, DEFAULTS.settings, saved.settings);
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

  /** 한 문제의 결과를 기록한다. */
  function recordAnswer(code, isCorrect) {
    var s = countryStat(code);
    s.seen += 1;
    if (isCorrect) {
      s.correct += 1;
      s.streak += 1;
    } else {
      s.wrong += 1;
      s.streak = 0;
    }
    state.stats.asked += 1;
    if (isCorrect) state.stats.correct += 1;
    save();
  }

  /** 아직 확실히 익히지 못한 나라 목록 (오답노트) */
  function wrongList() {
    return Object.keys(state.countries).filter(function (code) {
      var s = state.countries[code];
      return s.wrong > 0 && s.streak < 2;
    });
  }

  /** 출제 가중치: 틀렸던 나라일수록 자주 나온다. */
  function weightOf(code) {
    var s = state.countries[code];
    if (!s || s.seen === 0) return 2.0;          // 아직 안 본 나라
    if (s.wrong === 0) return 1.0;               // 늘 맞힌 나라
    if (s.streak >= 2) return 1.2;               // 최근 두 번 연속 맞힘
    return 2.5 + Math.min(s.wrong, 4) * 0.6;     // 자주 틀린 나라
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
    state.history = [];
    state.daily = deepClone(DEFAULTS.daily);
    save();
  }

  FQ.storage = {
    settings: settings,
    updateSettings: updateSettings,
    countryStat: countryStat,
    recordAnswer: recordAnswer,
    wrongList: wrongList,
    weightOf: weightOf,
    finishGame: finishGame,
    stats: stats,
    addXp: addXp,
    daily: daily,
    setDaily: setDaily,
    history: history,
    allCountryStats: allCountryStats,
    badges: badges,
    awardBadge: awardBadge,
    resetAll: resetAll,
    resetProgress: resetProgress
  };
})(window);
