/* 국기 퀴즈 - 배지
 * 한 판이 끝날 때 조건을 검사해 새로 딴 배지를 돌려준다.
 */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});

  var CONTINENTS = ['아시아', '유럽', '아프리카', '북아메리카', '남아메리카', '오세아니아'];

  var LIST = [
    { id: 'first_game', icon: '🎒', name: '첫 여행', desc: '첫 판을 끝냈어요',
      test: function (c) { return c.stats.games >= 1; } },
    { id: 'perfect', icon: '💯', name: '만점왕', desc: '한 판을 다 맞혔어요 (5문제 이상)',
      test: function (c) { return c.summary && c.summary.total >= 5 && c.summary.correct === c.summary.total; } },
    { id: 'streak5', icon: '🔥', name: '불꽃 5연속', desc: '5문제를 연달아 맞혔어요',
      test: function (c) { return c.stats.bestStreak >= 5; } },
    { id: 'streak10', icon: '🚀', name: '로켓 10연속', desc: '10문제를 연달아 맞혔어요',
      test: function (c) { return c.stats.bestStreak >= 10; } },
    { id: 'play50', icon: '📖', name: '오십 문제', desc: '문제를 50개 풀었어요',
      test: function (c) { return c.stats.asked >= 50; } },
    { id: 'play200', icon: '🏆', name: '이백 문제', desc: '문제를 200개 풀었어요',
      test: function (c) { return c.stats.asked >= 200; } },
    { id: 'voice_win', icon: '🎤', name: '목소리 탐험가', desc: '말하기로 정답을 맞혔어요',
      test: function (c) { return c.summary && c.summary.mode === 'voice' && c.summary.correct >= 1; } },
    { id: 'explorer50', icon: '🧭', name: '50개국 탐험', desc: '서로 다른 나라 국기 50개를 만났어요',
      test: function (c) { return c.seenCount >= 50; } },
    { id: 'explorer100', icon: '🌏', name: '100개국 탐험', desc: '서로 다른 나라 국기 100개를 만났어요',
      test: function (c) { return c.seenCount >= 100; } },
    { id: 'explorer_all', icon: '🌐', name: '온 세계 한 바퀴', desc: '모든 나라의 국기를 만났어요',
      test: function (c) { return c.seenCount >= (FQ.countries || []).length; } }
  ];

  CONTINENTS.forEach(function (cont) {
    LIST.push({
      id: 'master_' + cont,
      icon: '⭐',
      name: cont + ' 박사',
      desc: cont + '의 모든 나라를 한 번 이상 맞혔어요',
      test: function (c) {
        var need = (FQ.countries || []).filter(function (x) { return x.continent === cont; });
        if (!need.length) return false;
        return need.every(function (x) {
          var s = c.countryStats[x.code];
          return s && s.correct > 0;
        });
      }
    });
  });

  function byId(id) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
    return null;
  }

  /** 새로 딴 배지 목록을 돌려준다(저장까지 함께). */
  function check(summary) {
    var countryStats = FQ.storage.allCountryStats();
    var seenCount = Object.keys(countryStats).filter(function (k) { return countryStats[k].seen > 0; }).length;
    var context = {
      stats: FQ.storage.stats(),
      countryStats: countryStats,
      seenCount: seenCount,
      summary: summary || null
    };
    var earned = [];
    LIST.forEach(function (b) {
      var pass = false;
      try { pass = !!b.test(context); } catch (e) { pass = false; }
      if (pass && FQ.storage.awardBadge(b.id)) earned.push(b);
    });
    return earned;
  }

  FQ.badges = { LIST: LIST, byId: byId, check: check };
})(window);
