/* 국기 퀴즈 - 국기 도감 / 내 기록 화면 */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var ui, esc;

  var CONTINENTS = ['all', '아시아', '유럽', '아프리카', '북아메리카', '남아메리카', '오세아니아'];
  var dexFilter = { continent: 'all', query: '', onlyWrong: false };

  function init() { ui = FQ.ui; esc = ui.esc; }

  /* =================== 국기 도감 =================== */
  function dex() {
    init();
    var html =
      '<section class="screen">' +
        '<div class="row" style="align-items:center;margin-bottom:12px">' +
          '<button class="btn btn-sm btn-ghost" id="back" type="button">← 돌아가기</button>' +
          '<h2 style="margin:0;font-size:1.4rem">📚 국기 도감</h2>' +
        '</div>' +
        '<div class="card section">' +
          '<div class="field">' +
            '<input class="text-input" id="dex-q" placeholder="나라 이름으로 찾기 (예: 브라질)" value="' + esc(dexFilter.query) + '" autocomplete="off">' +
          '</div>' +
          '<div class="pill-grid">' +
            CONTINENTS.map(function (c) {
              return '<button class="pill" type="button" data-cont="' + esc(c) + '" aria-pressed="' + (dexFilter.continent === c ? 'true' : 'false') + '">' +
                (c === 'all' ? '전체' : esc(c)) + '</button>';
            }).join('') +
          '</div>' +
          '<label class="switch" style="margin-top:12px"><input type="checkbox" id="dex-wrong"' + (dexFilter.onlyWrong ? ' checked' : '') + '> 틀렸던 나라만 보기</label>' +
        '</div>' +
        '<div id="dex-list"></div>' +
      '</section>';

    var m = ui.setMain(html);
    ui.$('#back', m).addEventListener('click', function () { FQ.app.home(); });
    ui.on(m, '[data-cont]', 'click', function (e, t) {
      dexFilter.continent = t.getAttribute('data-cont');
      ui.$$('[data-cont]', m).forEach(function (b) {
        b.setAttribute('aria-pressed', b === t ? 'true' : 'false');
      });
      paintDex();
    });
    var q = ui.$('#dex-q', m);
    q.addEventListener('input', function () { dexFilter.query = q.value; paintDex(); });
    ui.$('#dex-wrong', m).addEventListener('change', function (ev) {
      dexFilter.onlyWrong = ev.target.checked;
      paintDex();
    });
    ui.on(m, '.dex-card', 'click', function (e, t) {
      ui.countryModal(FQ.quiz.byCode(t.getAttribute('data-code')));
    });
    paintDex();
  }

  function paintDex() {
    var util = FQ.util;
    var stats = FQ.storage.allCountryStats();
    var wrongSet = {};
    FQ.storage.wrongList().forEach(function (c) { wrongSet[c] = true; });
    var norm = util.normalize(dexFilter.query);

    var list = (FQ.countries || []).filter(function (c) {
      if (dexFilter.continent !== 'all' && c.continent !== dexFilter.continent) return false;
      if (dexFilter.onlyWrong && !wrongSet[c.code]) return false;
      if (!norm) return true;
      var names = (c.aliases || []).concat([c.ko, c.en, c.capital]);
      for (var i = 0; i < names.length; i++) {
        if (names[i] && util.normalize(names[i]).indexOf(norm) !== -1) return true;
      }
      return false;
    });

    list.sort(function (a, b) { return a.ko.localeCompare(b.ko, 'ko'); });

    var seen = list.filter(function (c) { return stats[c.code] && stats[c.code].correct > 0; }).length;

    var html =
      '<p class="small muted">' + list.length + '개 나라 · 맞혀 본 나라 ' + seen + '개</p>' +
      (list.length
        ? '<div class="dex-grid">' + list.map(function (c) {
            var st = stats[c.code];
            var learned = st && st.correct > 0;
            var meta = st && st.seen
              ? st.correct + '/' + st.seen + ' 정답'
              : '아직 안 만났어요';
            return '<button class="dex-card' + (learned ? ' learned' : '') + '" type="button" data-code="' + c.code + '">' +
              '<img src="' + ui.flagSrc(c.code) + '" alt="' + esc(c.ko) + ' 국기" loading="lazy">' +
              '<div class="n">' + esc(c.ko) + '</div>' +
              '<div class="m">' + esc(meta) + '</div>' +
            '</button>';
          }).join('') + '</div>'
        : '<div class="card">찾는 나라가 없어요.</div>');

    ui.$('#dex-list').innerHTML = html;
  }

  /* =================== 내 기록 =================== */
  function stats() {
    init();
    var st = FQ.storage.stats();
    var countryStats = FQ.storage.allCountryStats();
    var badges = FQ.storage.badges();
    var history = FQ.storage.history();
    var util = FQ.util;

    var seenCount = Object.keys(countryStats).filter(function (k) { return countryStats[k].seen > 0; }).length;
    var learnedCount = Object.keys(countryStats).filter(function (k) { return countryStats[k].correct > 0 && countryStats[k].streak >= 2; }).length;
    var rate = st.asked ? Math.round((st.correct / st.asked) * 100) : 0;

    var tough = Object.keys(countryStats)
      .map(function (code) { return { code: code, s: countryStats[code] }; })
      .filter(function (x) { return x.s.wrong > 0; })
      .sort(function (a, b) { return b.s.wrong - a.s.wrong; })
      .slice(0, 12)
      .map(function (x) { return { c: FQ.quiz.byCode(x.code), s: x.s }; })
      .filter(function (x) { return x.c; });

    var modeLabel = function (id) {
      return (FQ.quiz.MODES[id] && FQ.quiz.MODES[id].label) || id;
    };

    var html =
      '<section class="screen">' +
        '<div class="row" style="align-items:center;margin-bottom:12px">' +
          '<button class="btn btn-sm btn-ghost" id="back" type="button">← 돌아가기</button>' +
          '<h2 style="margin:0;font-size:1.4rem">🏅 내 기록</h2>' +
        '</div>' +

        '<div class="card section">' +
          '<div class="stat-grid" style="margin:0">' +
            '<div class="stat"><div class="v">' + st.games + '</div><div class="k">놀이 횟수</div></div>' +
            '<div class="stat"><div class="v">' + st.asked + '</div><div class="k">푼 문제</div></div>' +
            '<div class="stat"><div class="v">' + rate + '%</div><div class="k">정답률</div></div>' +
            '<div class="stat"><div class="v">' + st.bestStreak + '</div><div class="k">최고 연속</div></div>' +
            '<div class="stat"><div class="v">' + seenCount + '</div><div class="k">만난 나라</div></div>' +
            '<div class="stat"><div class="v">' + learnedCount + '</div><div class="k">확실히 아는 나라</div></div>' +
          '</div>' +
          '<p class="small muted" style="margin:12px 0 0">전체 195개국 중 ' + seenCount + '개국을 만났어요. ' +
            (seenCount >= 195 ? '온 세계를 한 바퀴 돌았네요! 🌐' : '아직 ' + (195 - seenCount) + '개국이 남았어요.') + '</p>' +
        '</div>' +

        (tough.length
          ? '<div class="card section">' +
              '<h3>자주 틀리는 국기</h3>' +
              '<div class="wrong-grid">' + tough.map(function (x) {
                return '<button class="wrong-item" type="button" data-code="' + x.c.code + '">' +
                  '<img src="' + ui.flagSrc(x.c.code) + '" alt="' + esc(x.c.ko) + ' 국기" loading="lazy">' +
                  '<div class="n">' + esc(x.c.ko) + '</div>' +
                  '<div class="small muted">' + x.s.wrong + '번 틀림</div>' +
                '</button>';
              }).join('') + '</div>' +
            '</div>'
          : '') +

        '<div class="card section">' +
          '<h3>배지 ' + Object.keys(badges).length + ' / ' + FQ.badges.LIST.length + '</h3>' +
          '<div class="badge-grid">' + FQ.badges.LIST.map(function (b) {
            var got = !!badges[b.id];
            return '<div class="badge-item' + (got ? ' got' : '') + '">' +
              '<div class="ic">' + b.icon + '</div>' +
              '<div class="n">' + esc(b.name) + '</div>' +
              '<div class="d">' + esc(b.desc) + '</div>' +
            '</div>';
          }).join('') + '</div>' +
        '</div>' +

        (history.length
          ? '<div class="card section">' +
              '<h3>최근 놀이</h3>' +
              '<ul class="history-list">' + history.slice(0, 10).map(function (h) {
                return '<li><span class="muted small">' + esc(h.date) + '</span>' +
                  '<span>' + esc(modeLabel(h.mode)) + '</span>' +
                  '<span class="spacer"></span>' +
                  '<b>' + h.correct + ' / ' + h.total + '</b></li>';
              }).join('') + '</ul>' +
            '</div>'
          : '') +

        '<div class="card section">' +
          '<h3>정리하기</h3>' +
          '<p class="small muted">기록은 이 브라우저에만 저장돼요. 지우면 되돌릴 수 없어요.</p>' +
          '<button class="btn btn-sm" id="reset" type="button">🗑 기록 모두 지우기</button>' +
        '</div>' +
      '</section>';

    var m = ui.setMain(html);
    ui.$('#back', m).addEventListener('click', function () { FQ.app.home(); });
    ui.on(m, '.wrong-item', 'click', function (e, t) {
      ui.countryModal(FQ.quiz.byCode(t.getAttribute('data-code')));
    });
    ui.$('#reset', m).addEventListener('click', function () {
      if (global.confirm('점수, 배지, 오답노트를 모두 지울까요?')) {
        FQ.storage.resetProgress();
        stats();
      }
    });
  }

  FQ.screens = { dex: dex, stats: stats };
})(window);
