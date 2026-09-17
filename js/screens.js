/* 국기 퀴즈 - 국기 도감 / 내 기록 화면 */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var ui, esc;

  var CONTINENTS = ['all', '아시아', '유럽', '아프리카', '북아메리카', '남아메리카', '오세아니아'];
  var dexFilter = { continent: 'all', query: '', onlyWrong: false, onlyLocked: false };
  var AXES = [
    { id: 'flag', label: '국기', icon: '🚩' },
    { id: 'symbol', label: '그림', icon: '🎨' },
    { id: 'place', label: '명소', icon: '🏞️' },
    { id: 'map', label: '위치', icon: '📍' }
  ];

  /** 화면을 보는 것만으로 저장 기록이나 스티커 수를 바꾸지 않는다. */
  function axisRecords(axis) {
    return axis === 'flag' ? FQ.storage.allCountryStats() : FQ.storage.allAxisStats(axis);
  }

  /** 지금 보여 줄 축. 그림을 끄면 홈·도감과 똑같이 그림·명소 축을 감춘다. */
  function visibleAxes() {
    return AXES.filter(function (axis) {
      if (axis.id === 'flag' || axis.id === 'map') return true;
      return !!(FQ.features && FQ.features.on('art'));
    });
  }

  /** 스티커 칸 안에 겹치는 도장 축 (국기 제외) */
  function stampAxes() {
    return visibleAxes().filter(function (axis) { return axis.id !== 'flag'; });
  }

  function axisSummary() {
    return '<div class="card section"><h3>놀이별 기록</h3><div class="axis-stat-list">' +
      visibleAxes().map(function (axis) {
        var records = axisRecords(axis.id), seen = 0, correct = 0, countries = 0;
        (FQ.countries || []).forEach(function (c) {
          var r = records[c.code] || {};
          seen += r.seen || 0;
          correct += r.correct || 0;
          if ((r.seen || 0) > 0) countries++;
        });
        return '<div class="axis-stat" data-axis="' + axis.id + '"><b>' + axis.icon + ' ' + axis.label + '</b>' +
          '<div>' + countries + '개국 · ' + seen + '문제</div>' +
          '<div class="small muted">정답 ' + correct + '개 · ' + (seen ? Math.round(correct / seen * 100) : 0) + '%</div></div>';
      }).join('') + '</div></div>';
  }

  /** 스티커 판 위쪽: 모은 개수 */
  function stickerHeader() {
    var st = FQ.progress.stickers();
    return '<div class="card section">' +
      '<div class="row" style="align-items:baseline">' +
        '<b style="font-size:1.15rem">모은 스티커 ' + st.owned + ' / ' + st.total + '</b>' +
        '<span class="spacer"></span>' +
        '<span class="small muted">' + st.left + '개 남았어요</span>' +
      '</div>' +
      '<div class="xp-bar" style="margin-top:8px"><i style="width:' + Math.round(st.ratio * 100) + '%"></i></div>' +
    '</div>';
  }

  /** 스티커 판이 비었을 때, 왜 비었는지에 따라 다르게 말해 준다 */
  function emptyDexMessage() {
    if (dexFilter.query) {
      return '<b>“' + esc(dexFilter.query) + '”</b> 로 찾은 나라가 없어요.' +
        '<div class="small muted" style="margin-top:6px">이름의 앞 글자만 써 봐도 좋아요.</div>' +
        '<button class="btn btn-sm" id="dex-clear" type="button" style="margin-top:10px">검색어 지우기</button>';
    }
    if (dexFilter.onlyWrong) {
      return '여행책을 골고루 만나고 있어요' +
        '<div class="small muted" style="margin-top:6px">' +
        (dexFilter.continent === 'all' ? '' : esc(dexFilter.continent) + '에서 ') +
        '다른 나라의 국기도 펼쳐 볼까요?</div>';
    }
    if (dexFilter.onlyLocked) {
      // 국기 스티커는 다 모았어도 칸 안의 도장(그림·명소·위치)은 남아 있을 수 있다. 도장까지 세어 말한다.
      var cont = dexFilter.continent;
      var left = stampsLeft(cont);
      var head = cont === 'all'
        ? '국기 스티커 ' + (FQ.countries || []).length + '칸을 모두 모았어요! 🌍'
        : esc(cont) + objectParticle(cont) + ' 모두 모았어요! 🎉';
      var tail = left.count > 0
        ? '국기는 다 모았고, 아직 못 찍은 도장이 ' + left.count + '개 있어요. ' + left.labels.join('·') + ' 놀이로 찍어 볼까요?'
        : '못 모은 칸도, 못 찍은 도장도 하나도 없어요.';
      return head + '<div class="small muted" style="margin-top:6px">' + tail + '</div>';
    }
    return '찾는 나라가 없어요.';
  }

  /** 한글 이름 뒤에 붙일 목적격 조사 (을/를) — util 의 받침 판정을 그대로 쓴다 */
  function objectParticle(word) {
    return FQ.util.hasJongseong(word) ? '을' : '를';
  }

  /** 그 대륙(또는 전체)에서 아직 못 찍은 도장 수. 딸 수 없는 도장은 세지 않는다. 읽기만 한다. */
  function stampsLeft(continent) {
    var axes = stampAxes();
    var records = {};
    axes.forEach(function (axis) { records[axis.id] = axisRecords(axis.id); });
    var count = 0;
    var labels = [];
    (FQ.countries || []).forEach(function (c) {
      if (continent !== 'all' && c.continent !== continent) return;
      axes.forEach(function (axis) {
        if (!canEarn(c.code, axis.id)) return;
        var earned = ((records[axis.id][c.code] || {}).correct || 0) > 0;
        if (earned) return;
        count += 1;
        if (labels.indexOf(axis.label) === -1) labels.push(axis.label);
      });
    });
    return { count: count, labels: labels };
  }

  function init() { ui = FQ.ui; esc = ui.esc; }

  /* =================== 국기 도감 =================== */
  function dex(startContinent) {
    init();
    if (FQ.app.musicScreen) FQ.app.musicScreen('dex');
    if (startContinent) {
      dexFilter.continent = startContinent;
      dexFilter.query = '';
      dexFilter.onlyWrong = false;
      dexFilter.onlyLocked = false;
    }
    var html =
      '<section class="screen">' +
        '<div class="row" style="align-items:center;margin-bottom:12px">' +
          '<button class="btn btn-sm btn-ghost" id="back" type="button">← 돌아가기</button>' +
          '<h2 style="margin:0;font-size:1.4rem">📖 스티커 판</h2>' +
        '</div>' +
        stickerHeader() +
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
          '<label class="switch" style="margin-top:12px"><input type="checkbox" id="dex-wrong"' + (dexFilter.onlyWrong ? ' checked' : '') + '> 한 번 더 만날 나라</label>' +
          '<label class="switch"><input type="checkbox" id="dex-locked"' + (dexFilter.onlyLocked ? ' checked' : '') + '> 새로 만날 스티커</label>' +
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
    ui.$('#dex-locked', m).addEventListener('change', function (ev) {
      dexFilter.onlyLocked = ev.target.checked;
      paintDex();
    });
    ui.on(m, '.sticker-cell', 'click', function (e, t) {
      ui.countryModal(FQ.quiz.byCode(t.getAttribute('data-code')));
    });
    paintDex();
  }

  /* 자물쇠는 이모지 대신 선으로 그린다 */
  var LOCK_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="4" y="10" width="16" height="11" rx="2"></rect>' +
    '<path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>';

  /** 그 나라가 그 축으로 출제될 수 있는가 — js/quiz.js 의 hasData 와 같은 기준이다. */
  function canEarn(code, axis) {
    if (axis !== 'symbol' && axis !== 'place') return true;
    // 자료를 못 읽었으면 숨기지 않는다. 자료가 없다는 이유로 도장을 지우면
    // 아이가 이미 딴 도장이 화면에서 사라진다. 확실히 못 따는 경우에만 지운다.
    if (!FQ.subjects) return true;
    var subject = FQ.subjects[code] && FQ.subjects[code][axis];
    return !!subject && !subject.noArt;
  }

  function paintDex() {
    var util = FQ.util;
    var stats = FQ.storage.allCountryStats();
    var stamps = stampAxes();
    var stampRecords = {};
    stamps.forEach(function (axis) { stampRecords[axis.id] = axisRecords(axis.id); });
    var wrongSet = {};
    FQ.storage.wrongList().forEach(function (c) { wrongSet[c] = true; });
    var norm = util.normalize(dexFilter.query);

    var list = (FQ.countries || []).filter(function (c) {
      if (dexFilter.continent !== 'all' && c.continent !== dexFilter.continent) return false;
      if (dexFilter.onlyWrong && !wrongSet[c.code]) return false;
      if (dexFilter.onlyLocked && stats[c.code] && stats[c.code].correct > 0) return false;
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
      '<p class="small muted">' + list.length + '개 나라 · 모은 스티커 ' + seen + '개</p>' +
      (list.length
        ? '<div class="sticker-grid">' + list.map(function (c, i) {
            var cs = stats[c.code];
            var got = cs && cs.correct > 0;
            return '<button class="sticker-cell ' + (got ? 'got' : 'locked') + '" type="button"' +
              ' data-code="' + c.code + '" style="animation-delay:' + Math.min(0.5, i * 0.012).toFixed(3) + 's">' +
              '<img src="' + ui.flagSrc(c.code) + '" alt="' + esc(c.ko) + ' 스티커" loading="lazy">' +
              (got ? '' : '<span class="lock">' + LOCK_SVG + '</span>') +
              '<div class="n">' + esc(c.ko) + '</div>' +
              '<div class="axis-stamps">' + stamps.map(function (axis) {
                // 딸 수 없는 도장은 그리지 않는다. 그림이 없는 나라(보류)와 명소가 없는 나라는
                // 그 축에 출제되지 않으므로, 자리를 남겨 두면 아이가 영원히 못 채우는 칸이 된다.
                if (!canEarn(c.code, axis.id)) return '';
                var earned = ((stampRecords[axis.id][c.code] || {}).correct || 0) > 0;
                var label = axis.label + ' 도장 ' + (earned ? '획득' : '아직');
                return '<span class="axis-stamp' + (earned ? ' earned' : '') + '" data-axis="' + axis.id +
                  '" title="' + label + '" aria-label="' + label + '">' + axis.icon + '</span>';
              }).join('') + '</div>' +
            '</button>';
          }).join('') + '</div>'
        : '<div class="card">' + emptyDexMessage() + '</div>');

    var host = ui.$('#dex-list');
    host.innerHTML = html;
    var clearBtn = ui.$('#dex-clear', host);
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        dexFilter.query = '';
        var box = ui.$('#dex-q');
        if (box) box.value = '';
        paintDex();
      });
    }
  }

  /* =================== 내 기록 =================== */
  function stats() {
    init();
    if (FQ.app.musicScreen) FQ.app.musicScreen('stats');
    var st = FQ.storage.stats();
    var countryStats = FQ.storage.allCountryStats();
    var badges = FQ.storage.badges();
    var history = FQ.storage.history();
    var util = FQ.util;

    var total = (FQ.countries || []).length;
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
            '<div class="stat"><div class="v">' + st.asked + '</div><div class="k">푼 문제 · 모든 놀이</div></div>' +
            '<div class="stat"><div class="v">' + rate + '%</div><div class="k">정답률 · 모든 놀이</div></div>' +
            '<div class="stat"><div class="v">' + st.bestStreak + '</div><div class="k">최고 연속 · 모든 놀이</div></div>' +
            '<div class="stat"><div class="v">' + seenCount + '</div><div class="k">국기로 만난 나라</div></div>' +
            '<div class="stat"><div class="v">' + learnedCount + '</div><div class="k">익숙한 국기</div></div>' +
          '</div>' +
          // 위 세 칸은 국기·그림·명소·위치를 모두 더한 수이고, '국기로 만난 나라' 부터는 국기 놀이만 센다.
          // 어느 쪽인지 적어 두지 않으면 국기 판만 보는 아빠가 문제 수와 나라 수가 안 맞는다고 헷갈린다.
          '<p class="small muted" style="margin:12px 0 0">‘모든 놀이’는 국기·그림·명소·위치 놀이를 모두 더한 수예요. ' +
            '국기 놀이에서는 전체 ' + total + '개국 중 ' + seenCount + '개국을 만났어요. ' +
            (seenCount >= total ? '온 세계를 한 바퀴 돌았네요! 🌐' : '아직 ' + (total - seenCount) + '개국이 남았어요.') + '</p>' +
        '</div>' +

        axisSummary() +

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
          '<h3>기록 백업</h3>' +
          '<p class="small muted">아래 글자를 통째로 복사해 두면 기록을 되살릴 수 있어요. 저장된 곳: <code>flagquiz.v1</code></p>' +
          '<button class="btn btn-sm" id="export" type="button">💾 기록 내보내기</button>' +
          '<div id="export-out"></div>' +
        '</div>' +

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
    ui.$('#export', m).addEventListener('click', function () {
      ui.$('#export-out', m).innerHTML = '<textarea class="text-input" id="export-text" aria-label="기록 백업 JSON" readonly rows="8" style="width:100%;font-family:monospace;font-size:.8rem"></textarea>';
      var output = ui.$('#export-text', m);
      output.value = FQ.storage.exportJson();
      output.select();
    });
    ui.$('#reset', m).addEventListener('click', function () {
      if (global.confirm('스티커 판, 레벨과 경험치, 배지, 오답노트, 놀이 기록을 모두 지울까요?\n되돌릴 수 없어요.')) {
        FQ.storage.resetProgress();
        stats();
      }
    });
  }

  FQ.screens = { dex: dex, stats: stats };
})(window);
