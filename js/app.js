/* 국기 퀴즈 - 화면 흐름과 게임 진행
 * 홈 → 퀴즈 → 결과. 도감과 기록 화면은 screens.js 가 그린다.
 */
(function (global) {
  'use strict';
  var FQ = global.FQ;
  var doc = global.document;
  var util = FQ.util;
  var store = FQ.storage;
  var quiz = FQ.quiz;
  var audio = FQ.audio;
  var ui = FQ.ui;
  var esc = ui.esc;

  var MODE_CARDS = [
    { id: 'choice4', emo: '🚩', title: '국기 보고 나라 고르기', desc: '네 개 중에서 골라요' },
    { id: 'reverse', emo: '🔎', title: '나라 보고 국기 찾기', desc: '이름을 보고 국기를 골라요' },
    { id: 'voice',   emo: '🎤', title: '말로 답하기', desc: '누르지 않고 바로 말하면 돼요' },
    { id: 'typing',  emo: '⌨️', title: '이름 써서 맞히기', desc: '글자로 입력해요' },
    { id: 'capital', emo: '🏙️', title: '수도 맞히기', desc: '나라의 수도를 골라요' }
  ];

  function totalCountries() { return quiz.all().length; }

  function levels() {
    return [
      { id: '1', label: '쉬움', desc: '유명한 나라' },
      { id: '2', label: '보통', desc: '조금 더 많이' },
      { id: '3', label: '어려움', desc: totalCountries() + '개국 전부' }
    ];
  }

  var CONTINENTS = ['all', '아시아', '유럽', '아프리카', '북아메리카', '남아메리카', '오세아니아'];
  var COUNTS = [5, 10, 20, 'all'];

  var state = {
    game: null,
    answered: false,
    usedHint: false,
    removed: [],
    timerId: null,
    timeLeft: 0,
    listenOn: false,
    listenTimer: null,
    lastSpeech: { lines: [], opts: {} },
    xpGained: 0,
    newStickers: [],
    lastSummary: null,
    lastBadges: []
  };

  /* =================== 홈 =================== */
  function renderHome() {
    stopTimer();
    var s = store.settings();
    var wrongCount = store.wrongList().length;
    var duel = s.players.length > 1;
    var poolSize = quiz.pool({ level: s.level, continent: s.continent }).length;

    var html =
      '<section class="screen">' +
        playerCard(s) +
        dailyCard() +

        '<div class="card section">' +
          '<h3>누가 하나요?</h3>' +
          '<div class="field">' +
            '<label for="p1">이름</label>' +
            '<input class="text-input" id="p1" maxlength="10" value="' + esc(s.players[0] || '') + '" placeholder="민규">' +
          '</div>' +
          '<label class="switch"><input type="checkbox" id="duel"' + (duel ? ' checked' : '') + '> 둘이서 번갈아 대결하기</label>' +
          '<div class="field' + (duel ? '' : ' hidden') + '" id="p2-field" style="margin-top:10px">' +
            '<label for="p2">함께할 사람</label>' +
            '<input class="text-input" id="p2" maxlength="10" value="' + esc(s.players[1] || '아빠') + '" placeholder="아빠">' +
          '</div>' +
        '</div>' +

        '<div class="section">' +
          '<h3>어떻게 맞힐까요?</h3>' +
          '<div class="mode-grid">' +
            MODE_CARDS.map(function (m) {
              return '<button class="mode-card" type="button" data-mode="' + m.id + '" aria-pressed="' + (s.mode === m.id ? 'true' : 'false') + '">' +
                '<span class="emo" aria-hidden="true">' + m.emo + '</span>' +
                '<span class="txt"><span class="t">' + esc(m.title) + '</span><span class="d">' + esc(m.desc) + '</span></span>' +
              '</button>';
            }).join('') +
          '</div>' +
          (s.mode === 'voice' ? voiceNotice() : '') +
        '</div>' +

        '<div class="card section">' +
          '<h3>난이도</h3>' +
          '<div class="pill-grid">' +
            levels().map(function (l) {
              return '<button class="pill" type="button" data-level="' + l.id + '" aria-pressed="' + (String(s.level) === l.id ? 'true' : 'false') + '">' +
                esc(l.label) + ' <span class="small">· ' + esc(l.desc) + '</span></button>';
            }).join('') +
          '</div>' +

          '<h3 style="margin-top:18px">대륙</h3>' +
          '<div class="pill-grid">' +
            CONTINENTS.map(function (c) {
              return '<button class="pill" type="button" data-continent="' + esc(c) + '" aria-pressed="' + (s.continent === c ? 'true' : 'false') + '">' +
                (c === 'all' ? '전체' : esc(c)) + '</button>';
            }).join('') +
          '</div>' +

          '<h3 style="margin-top:18px">몇 문제 풀까요?</h3>' +
          '<div class="pill-grid">' +
            COUNTS.map(function (n) {
              return '<button class="pill" type="button" data-count="' + n + '" aria-pressed="' + (String(s.count) === String(n) ? 'true' : 'false') + '">' +
                (n === 'all' ? '전부 (' + poolSize + '문제)' : n + '문제') + '</button>';
            }).join('') +
          '</div>' +
          '<p class="small muted" style="margin:12px 0 0">지금 고른 조건에 맞는 나라는 <b>' + poolSize + '개</b>예요.</p>' +
        '</div>' +

        '<div class="card section">' +
          '<h3>설정</h3>' +
          '<div class="row" style="gap:18px">' +
            '<label class="switch"><input type="checkbox" id="opt-sound"' + (s.sound ? ' checked' : '') + '> 🔔 효과음</label>' +
            '<label class="switch"><input type="checkbox" id="opt-speak"' + (s.speak ? ' checked' : '') + '> 🔊 이름 읽어주기</label>' +
            '<label class="switch"><input type="checkbox" id="opt-review"' + (s.reviewFirst ? ' checked' : '') + '> 🔁 틀린 나라 더 자주</label>' +
          '</div>' +
          '<div class="field" style="margin-top:12px">' +
            '<label for="opt-timer">제한 시간</label>' +
            '<div class="pill-grid">' +
              [0, 10, 20].map(function (t) {
                return '<button class="pill" type="button" data-timer="' + t + '" aria-pressed="' + (Number(s.timer) === t ? 'true' : 'false') + '">' +
                  (t === 0 ? '없음' : t + '초') + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +

        continentCard() +

        '<button class="btn btn-primary btn-big" id="start" type="button" style="width:100%">🎮 시작하기</button>' +

        (wrongCount > 0
          ? '<button class="btn btn-big" id="review" type="button" style="width:100%;margin-top:12px">📝 틀렸던 ' + wrongCount + '개 나라 복습하기</button>'
          : '') +
      '</section>';

    var m = ui.setMain(html);

    ui.on(m, '[data-mode]', 'click', function (e, t) {
      store.updateSettings({ mode: t.getAttribute('data-mode') });
      audio.play('click');
      renderHome();
    });
    ui.on(m, '[data-level]', 'click', function (e, t) {
      store.updateSettings({ level: t.getAttribute('data-level') });
      audio.play('click');
      renderHome();
    });
    ui.on(m, '[data-continent]', 'click', function (e, t) {
      store.updateSettings({ continent: t.getAttribute('data-continent') });
      audio.play('click');
      renderHome();
    });
    ui.on(m, '[data-count]', 'click', function (e, t) {
      var v = t.getAttribute('data-count');
      store.updateSettings({ count: v === 'all' ? 'all' : parseInt(v, 10) });
      audio.play('click');
      renderHome();
    });
    ui.on(m, '[data-timer]', 'click', function (e, t) {
      store.updateSettings({ timer: parseInt(t.getAttribute('data-timer'), 10) });
      audio.play('click');
      renderHome();
    });

    ui.$('#duel', m).addEventListener('change', function (ev) {
      ui.$('#p2-field', m).classList.toggle('hidden', !ev.target.checked);
      savePlayers(m);
    });
    ['#p1', '#p2'].forEach(function (sel) {
      var input = ui.$(sel, m);
      if (input) input.addEventListener('change', function () { savePlayers(m); });
    });
    ui.$('#opt-sound', m).addEventListener('change', function (ev) {
      store.updateSettings({ sound: ev.target.checked });
      audio.setEnabled(ev.target.checked);
    });
    ui.$('#opt-speak', m).addEventListener('change', function (ev) {
      store.updateSettings({ speak: ev.target.checked });
      audio.setSpeakEnabled(ev.target.checked);
    });
    ui.$('#opt-review', m).addEventListener('change', function (ev) {
      store.updateSettings({ reviewFirst: ev.target.checked });
    });

    ui.$('#start', m).addEventListener('click', function () {
      savePlayers(m);
      startGame(null);
    });
    var reviewBtn = ui.$('#review', m);
    if (reviewBtn) {
      reviewBtn.addEventListener('click', function () {
        savePlayers(m);
        startGame(store.wrongList());
      });
    }
  }

  /** 홈 위쪽: 지금 레벨과 모은 것들을 한눈에 */
  function playerCard(s) {
    var lv = FQ.progress.level();
    var st = FQ.progress.stickers();
    var stats = store.stats();
    return '<div class="player-card">' +
      '<span class="level-ring" title="레벨 ' + lv.number + '">' +
        '<span class="track" style="--p:' + lv.ratio.toFixed(3) + '"></span>' +
        '<span class="hole">' + lv.emoji + '</span>' +
      '</span>' +
      '<span class="player-meta">' +
        '<span class="player-name">' + esc(s.players[0] || '친구') + '</span>' +
        '<span class="player-level"> · 레벨 ' + lv.number + ' ' + esc(lv.name) + '</span>' +
        '<span class="player-nums">' +
          '<span class="mini-chip">✨ ' + lv.into + ' / ' + lv.need + '</span>' +
          '<span class="mini-chip">🔥 최고 ' + (stats.bestStreak || 0) + '연속</span>' +
        '</span>' +
      '</span>' +
    '</div>';
  }

  /** 홈: 대륙별로 얼마나 모았는지 */
  function continentCard() {
    var st = FQ.progress.stickers();
    var names = Object.keys(st.byContinent);
    if (!names.length) return '';
    return '<div class="card section cont-card">' +
      '<h3>대륙별 모으기</h3>' +
      '<div class="cont-grid">' +
        names.map(function (name) {
          var b = st.byContinent[name];
          var pct = b.total ? Math.round((b.owned / b.total) * 100) : 0;
          return '<span class="cont-item">' +
            '<span class="cont-top">' +
              '<span class="cont-name">' + esc(name) + '</span>' +
              '<span class="cont-num">' + b.owned + '/' + b.total + '</span>' +
            '</span>' +
            '<span class="cont-bar"><i style="width:' + pct + '%"></i></span>' +
          '</span>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  /** 홈: 오늘의 도전 */
  function dailyCard() {
    var d = FQ.progress.daily();
    return '<div class="daily-card">' +
      '<span class="ic">' + (d.complete ? '🏆' : '🎯') + '</span>' +
      '<span class="body">' +
        '<span class="t">' +
          (d.complete
            ? '오늘의 도전을 끝냈어요!'
            : '오늘의 도전 · ' + esc(d.continent) + ' 나라 ' + d.target + '개 맞히기') +
        '</span>' +
        '<span class="daily-bar"><i style="width:' + Math.round(d.ratio * 100) + '%"></i></span>' +
      '</span>' +
      '<span class="cnt">' + d.done + '/' + d.target + '</span>' +
    '</div>';
  }

  function voiceNotice() {
    var reason = FQ.speech.unavailableReason();
    if (!reason) return '<div class="notice">🎤 버튼을 누를 필요 없어요. 국기가 나오면 <b>바로 나라 이름을 말하면</b> 알아듣습니다. 마이크 사용을 물어보면 “허용”을 눌러 주세요.</div>';
    return '<div class="notice">⚠️ ' + esc(reason) +
      (FQ.speech.blocked() ? '<br>말하기 대신 <b>이름 써서 맞히기</b>로도 즐길 수 있어요.' : '') + '</div>';
  }

  function savePlayers(m) {
    var p1 = (ui.$('#p1', m).value || '').trim() || '민규';
    var duel = ui.$('#duel', m).checked;
    var players = [p1];
    if (duel) {
      var p2 = (ui.$('#p2', m).value || '').trim() || '아빠';
      if (p2 === p1) p2 = p2 + '2';
      players.push(p2);
    }
    store.updateSettings({ players: players });
  }

  /* =================== 게임 시작 =================== */
  function startGame(onlyCodes) {
    var s = store.settings();
    audio.setEnabled(s.sound);
    audio.setSpeakEnabled(s.speak);
    audio.unlock();
    state.game = quiz.createGame({
      mode: s.mode,
      level: s.level,
      continent: s.continent,
      count: onlyCodes && onlyCodes.length ? Math.min(onlyCodes.length, 20) : s.count,
      players: s.players,
      reviewFirst: s.reviewFirst,
      only: onlyCodes && onlyCodes.length ? onlyCodes : null
    });
    state.lastBadges = [];
    state.xpGained = 0;
    state.newStickers = [];
    renderQuiz();
  }

  /* =================== 퀴즈 화면 =================== */
  function renderQuiz() {
    var g = state.game;
    if (!g || g.isOver()) return finishGame();
    state.answered = false;
    state.usedHint = false;
    state.removed = [];

    var q = g.current();
    var s = store.settings();
    var duel = g.players.length > 1;

    var stage;
    if (q.mode === 'reverse') {
      stage =
        '<div class="flag-stage">' +
          '<div class="q-label">이 나라의 국기를 찾아보세요</div>' +
          '<div class="big-name">' + esc(q.country.ko) + '</div>' +
          '<button class="btn btn-sm" data-speak="' + esc(q.country.ko) + '" type="button">🔊 들어보기</button>' +
        '</div>';
    } else if (q.mode === 'capital') {
      stage =
        '<div class="flag-stage">' +
          '<img class="flag-img" src="' + ui.flagSrc(q.country.code) + '" alt="국기">' +
          '<div class="big-name">' + esc(q.country.ko) + '</div>' +
          '<div class="q-label">이 나라의 수도는 어디일까요?</div>' +
        '</div>';
    } else {
      stage =
        '<div class="flag-stage">' +
          '<div class="q-label">이 국기는 어느 나라일까요?</div>' +
          '<img class="flag-img" src="' + ui.flagSrc(q.country.code) + '" alt="맞혀야 할 국기">' +
        '</div>';
    }

    var lv = FQ.progress.level();
    var chest = FQ.progress.chestProgress(g.streak);
    var dots = '';
    for (var di = 0; di < g.total; di++) {
      var cls = di < g.index ? 'done' : (di === g.index ? 'now' : '');
      dots += '<i class="' + cls + '" style="animation-delay:' + (di * 0.03) + 's"></i>';
    }

    var html =
      '<section class="screen">' +
        '<div class="quiz-head">' +
          '<button class="btn btn-sm btn-ghost" id="quit" type="button">← 그만하기</button>' +
          '<span class="chip">' + (g.index + 1) + ' / ' + g.total + '</span>' +
          (duel ? '<span class="chip turn">' + esc(g.currentPlayer()) + ' 차례</span>' : '') +
          (s.timer ? '<span class="chip" id="timer-chip">⏱ ' + s.timer + '</span>' : '') +
        '</div>' +

        '<div class="game-head">' +
          '<div class="row" style="align-items:center">' +
            '<span class="level-chip"><span class="num">' + lv.number + '</span>' + esc(lv.name) + '</span>' +
            '<span class="spacer"></span>' +
            '<span class="val" id="xp-val">' + lv.into + ' / ' + lv.need + '</span>' +
          '</div>' +
          '<div class="xp-bar"><i id="xp-fill" style="width:' + Math.round(lv.ratio * 100) + '%"></i></div>' +
        '</div>' +

        '<div class="combo-card">' +
          '<span class="combo-flame">🔥</span>' +
          '<span class="combo-body">' +
            '<span class="combo-title" id="combo-title">' +
              (g.streak > 0
                ? g.streak + '연속! 보물상자까지 ' + chest.left + '개'
                : (FQ.progress.CHEST_EVERY || 5) + '연속이면 보물상자가 열려요') +
            '</span>' +
            '<span class="combo-bar"><i id="combo-fill" style="width:' + Math.round(chest.ratio * 100) + '%"></i></span>' +
          '</span>' +
          '<span class="combo-goal">🎁</span>' +
        '</div>' +

        '<div class="qdots">' + dots + '</div>' +
        '<div class="quiz-body">' +
          '<div>' + stage + '</div>' +
          '<div>' +
            '<div id="answer-area">' + answerArea(q) + '</div>' +
            '<div class="row" style="margin-top:14px">' +
              '<button class="btn btn-sm" id="hint" type="button">💡 힌트 (-3점)</button>' +
              '<button class="btn btn-sm btn-ghost" id="skip" type="button">🤷 모르겠어요</button>' +
            '</div>' +
            '<div id="hint-area"></div>' +
          '</div>' +
        '</div>' +
        '<div id="feedback-area"></div>' +
      '</section>';

    var m = ui.setMain(html);

    ui.on(m, '[data-speak]', 'click', function (e, t) { audio.speak(t.getAttribute('data-speak')); });
    ui.$('#quit', m).addEventListener('click', function () {
      stopTimer();
      stopListening();
      audio.stopSpeaking();
      state.game = null;
      renderHome();
    });
    ui.$('#hint', m).addEventListener('click', showHint);
    ui.$('#skip', m).addEventListener('click', function () { submit({ text: '' }, true); });

    bindAnswerArea(m, q);
    preloadNext();
    startTimer();

    if (q.mode === 'voice') {
      state.listenOn = true;
      audio.stopSpeaking();
      // 단추를 누른 그 흐름 안에서 시작해야 사파리가 마이크 권한을 다시 묻지 않는다.
      // 늦게(setTimeout) 시작하면 사용자가 누른 동작과 끊겨 매번 허용을 물어본다.
      startListening();
    }
  }

  function answerArea(q) {
    if (q.mode === 'choice4') {
      return '<div class="answer-grid">' + q.options.map(function (c, i) {
        return '<button class="answer-btn" type="button" data-code="' + c.code + '">' +
          '<span class="muted small">' + (i + 1) + '</span> ' + esc(c.ko) + '</button>';
      }).join('') + '</div>';
    }
    if (q.mode === 'capital') {
      return '<div class="answer-grid">' + q.options.map(function (c, i) {
        return '<button class="answer-btn" type="button" data-code="' + c.code + '">' +
          '<span class="muted small">' + (i + 1) + '</span> ' + esc(c.capital) + '</button>';
      }).join('') + '</div>';
    }
    if (q.mode === 'reverse') {
      return '<div class="answer-grid grid-2">' + q.options.map(function (c) {
        return '<button class="answer-btn flag-choice" type="button" data-code="' + c.code + '">' +
          '<img src="' + ui.flagSrc(c.code) + '" alt="국기 후보"></button>';
      }).join('') + '</div>';
    }
    if (q.mode === 'voice') {
      var reason = FQ.speech.unavailableReason();
      var off = FQ.speech.blocked();
      return '<div class="mic-wrap">' +
        (reason ? '<div class="notice">⚠️ ' + esc(reason) + '</div>' : '') +
        '<button class="mic-btn" id="mic" type="button" aria-label="듣기 멈추기"' + (off ? ' disabled' : '') + '>🎤</button>' +
        '<div class="listen-state" id="listen-state">' +
          (off ? '마이크를 쓸 수 없어요' : '마이크를 준비하고 있어요…') +
        '</div>' +
        '<div class="heard" id="heard"></div>' +
        '<div class="listen-tip small muted" id="listen-tip"></div>' +
        '<details class="type-fallback">' +
          '<summary>⌨️ 글자로 답하기</summary>' +
          '<div class="field" style="margin-top:10px">' +
            '<input class="text-input" id="answer-input" placeholder="나라 이름을 써 보세요" autocomplete="off">' +
            '<button class="btn btn-primary" id="answer-submit" type="button">확인</button>' +
          '</div>' +
        '</details>' +
      '</div>';
    }
    return '<div class="field">' +
      '<input class="text-input" id="answer-input" placeholder="나라 이름을 써 보세요" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      '<button class="btn btn-primary" id="answer-submit" type="button">확인</button>' +
    '</div>';
  }

  function bindAnswerArea(m, q) {
    ui.on(m, '.answer-btn', 'click', function (e, t) {
      if (state.answered) return;
      submit({ code: t.getAttribute('data-code') });
    });

    var input = ui.$('#answer-input', m);
    if (input) {
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); submitTyped(); }
      });
      // 손가락으로 쓰는 기기에서는 자동으로 자판을 올리지 않는다 (화면이 갑자기 튀어 오르는 걸 막는다)
      var touchDevice = global.matchMedia && global.matchMedia('(hover: none)').matches;
      if (q.mode === 'typing' && !touchDevice) setTimeout(function () { input.focus(); }, 60);
    }
    var sub = ui.$('#answer-submit', m);
    if (sub) sub.addEventListener('click', submitTyped);

    var mic = ui.$('#mic', m);
    if (mic) mic.addEventListener('click', toggleMic);
  }

  function submitTyped() {
    if (state.answered) return;
    var input = ui.$('#answer-input');
    if (!input) return;
    var text = (input.value || '').trim();
    if (!text) { input.focus(); return; }
    if (!quiz.findCountry(text) && quiz.isGiveUp(text)) { submit({ text: '' }, true); return; }
    submit({ text: text });
  }

  /* --------- 마이크: 버튼을 누르지 않아도 계속 듣는다 --------- */

  /**
   * 들린 말을 어떻게 받아들일지 정한다.
   *   {kind:'answer'}  정답이거나 다른 나라 이름이 확실하다 → 채점
   *   {kind:'giveup'}  "몰라요" 처럼 넘어가고 싶다는 말이다
   *   null             웅얼거림이나 나라 이름이 아닌 말 → 흘려듣고 계속 기다린다
   */
  function interpret(text) {
    if (!text || !state.game) return null;
    var q = state.game.current();
    if (!q) return null;
    // 나라 이름을 먼저 본다. "브라질 뭐지?" 처럼 이름을 말했으면 그것을 답으로 받는다
    if (quiz.checkText(q.country, text).correct) return { kind: 'answer', text: text };
    var other = quiz.findCountry(text);
    if (other && other.code !== q.country.code) return { kind: 'answer', text: text };
    if (quiz.isGiveUp(text)) return { kind: 'giveup' };
    return null;
  }

  function actOn(hit, text) {
    if (!hit) return false;
    if (hit.kind === 'giveup') { submit({ text: '' }, true); return true; }
    submit({ text: hit.text || text });
    return true;
  }

  function setListenState(msg, cls) {
    var el = ui.$('#listen-state');
    if (!el) return;
    el.textContent = msg;
    el.className = 'listen-state' + (cls ? ' ' + cls : '');
  }

  /** 문제가 뜨면 알아서 듣기 시작한다. */
  function startListening() {
    if (state.answered || !state.listenOn) return;
    var mic = ui.$('#mic');
    if (!mic || mic.disabled) return;
    audio.stopSpeaking();
    mic.classList.add('listening');
    setListenState('듣고 있어요. 나라 이름을 말해 보세요!', 'on');
    var tip = ui.$('#listen-tip');
    if (tip) tip.textContent = '모르겠으면 “몰라요” 나 “이게 뭐야?” 라고 말해도 돼요';

    FQ.speech.start({
      continuous: true,
      interim: function (text) {
        if (state.answered) return;
        var heard = ui.$('#heard');
        if (heard) heard.textContent = text;
        // 말하는 도중에도 나라 이름이 들리면 바로 채점한다
        actOn(interpret(text), text);
      },
      result: function (alts) {
        if (state.answered) return;
        var heard = ui.$('#heard');
        if (heard) heard.textContent = alts[0] || '';
        // 여러 후보 중 정답이 있으면 그것부터 인정해 준다
        var i;
        for (i = 0; i < alts.length; i++) {
          var hit = interpret(alts[i]);
          if (hit && hit.kind === 'answer' && quiz.checkText(state.game.current().country, alts[i]).correct) {
            submit({ text: alts[i] });
            return;
          }
        }
        for (i = 0; i < alts.length; i++) {
          if (actOn(interpret(alts[i]), alts[i])) return;
        }
        // 나라 이름이 아니면 그냥 흘려듣고 계속 기다린다
      },
      error: function (code, message) {
        if (state.answered) return;
        if (code === 'no-speech' || code === 'aborted') return;   // 조용하면 그냥 계속 기다린다
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          state.listenOn = false;
          var mic2 = ui.$('#mic');
          if (mic2) mic2.classList.remove('listening');
          setListenState('마이크 사용을 허용해 주세요. 글자로 답해도 좋아요.', 'off');
          return;
        }
        setListenState(message || '마이크가 잠깐 멈췄어요. 다시 들을게요.', 'off');
      },
      end: function () {
        var mic3 = ui.$('#mic');
        if (mic3) mic3.classList.remove('listening');
        // 사파리는 몇 초마다 스스로 끊는다. 아직 답을 안 했으면 곧바로 다시 듣는다.
        if (!state.answered && state.listenOn) {
          state.listenTimer = global.setTimeout(startListening, 250);
        }
      }
    });
  }

  function stopListening() {
    state.listenOn = false;
    if (state.listenTimer) { global.clearTimeout(state.listenTimer); state.listenTimer = null; }
    FQ.speech.abort();
    var mic = ui.$('#mic');
    if (mic) mic.classList.remove('listening');
  }

  /** 마이크 버튼은 이제 듣기를 잠깐 멈추거나 다시 켜는 스위치다. */
  function toggleMic() {
    if (state.answered) return;
    if (state.listenOn) {
      stopListening();
      setListenState('듣기를 멈췄어요. 마이크를 누르면 다시 들어요.', 'off');
    } else {
      state.listenOn = true;
      startListening();
    }
  }

  /* --------- 힌트 --------- */
  function showHint() {
    if (state.answered) return;
    var q = state.game.current();
    state.usedHint = true;
    var box = ui.$('#hint-area');
    var lines = [];
    if (q.mode === 'capital') {
      lines.push('첫 글자는 <b>' + esc(util.initialOf(q.country.capital)) + '</b> 로 시작해요');
      lines.push(esc(q.country.continent) + ' · ' + esc(q.country.region) + ' 에 있어요');
    } else if (q.mode === 'reverse') {
      lines.push('🚩 ' + esc(q.country.flagHint));
    } else {
      lines.push('🚩 ' + esc(q.country.flagHint));
      lines.push(esc(q.country.continent) + ' 에 있고, 이름은 <b>' + esc(util.initialOf(q.country.ko)) + '</b> 소리로 시작해요');
    }
    box.innerHTML = '<div class="hint-box">' + lines.join('<br>') + '</div>';
    audio.play('click');

    // 사지선다에서는 오답 두 개를 지워 준다
    if (q.options && q.options.length === 4 && !state.removed.length) {
      var wrongs = util.shuffle(q.options.filter(function (c) { return c.code !== q.country.code; })).slice(0, 2);
      wrongs.forEach(function (c) {
        var btn = ui.$('.answer-btn[data-code="' + c.code + '"]');
        if (btn) { btn.disabled = true; btn.style.opacity = '.3'; }
        state.removed.push(c.code);
      });
    }
    var hintBtn = ui.$('#hint');
    if (hintBtn) hintBtn.disabled = true;
  }

  /* --------- 제출 --------- */
  function submit(payload, gaveUp) {
    if (state.answered) return;
    state.answered = true;
    stopTimer();
    // 마이크는 showFeedback 에서 놓는다. 놓인 것을 확인한 뒤에 읽어 줘야
    // 아이폰·아이패드에서 소리가 사라지지 않는다.
    state.listenOn = false;
    if (state.listenTimer) { global.clearTimeout(state.listenTimer); state.listenTimer = null; }

    var g = state.game;
    var q = g.current();
    // 스티커는 "이 나라를 처음 맞혔는가" 로 정해지므로 기록하기 전에 확인해야 한다
    var isNewSticker = q && !FQ.progress.hasSticker(q.country.code);

    var res = g.submit(payload, state.usedHint);
    if (!res) return;
    res.gaveUp = !!gaveUp;

    if (res.correct && q) {
      var gain = FQ.progress.xpFor(g.streak);
      state.xpGained += gain;
      res.xpGain = gain;
      res.levelUp = FQ.progress.addXp(gain);
      if (isNewSticker) {
        state.newStickers.push(q.country);
        res.newSticker = true;
      }
      res.dailyDone = FQ.progress.noteDaily(q.country, true);
      res.chest = FQ.progress.chestOpensAt(g.streak);
    }
    showFeedback(res);
  }

  function showFeedback(res) {
    var q = res.question;
    var c = q.country;
    var g = state.game;
    var s = store.settings();

    ui.$$('.answer-btn').forEach(function (btn) {
      btn.disabled = true;
      var code = btn.getAttribute('data-code');
      if (code === c.code) btn.classList.add('is-correct');
      else if (res.picked && code === res.picked.code && !res.correct) btn.classList.add('is-wrong');
    });
    var hintBtn = ui.$('#hint');
    if (hintBtn) hintBtn.disabled = true;
    var skipBtn = ui.$('#skip');
    if (skipBtn) skipBtn.disabled = true;
    var micBtn = ui.$('#mic');
    if (micBtn) { micBtn.disabled = true; micBtn.classList.remove('listening'); }
    setListenState('', '');
    var inputBox = ui.$('#answer-input');
    if (inputBox) inputBox.disabled = true;
    var subBtn = ui.$('#answer-submit');
    if (subBtn) subBtn.disabled = true;

    var who = g.players.length > 1 ? esc(g.currentPlayer()) + ', ' : '';
    var verdict, extra = '', cheerWord = '';
    if (res.correct) {
      verdict = '🎉 ' + who + '정답이에요!' + (res.gained > 10 ? ' <span class="small">(+' + res.gained + '점 연속 보너스!)</span>' : '');
      // 연속으로 맞힐수록 소리도 화면도 더 신나게
      var level = g.streak >= 7 ? 3 : g.streak >= 5 ? 2 : g.streak >= 3 ? 1 : 0;
      audio.play(level >= 3 ? 'bigcombo' : level >= 1 ? 'combo' : 'correct');
      cheerWord = FQ.effects.celebrate({ level: level, streak: g.streak });
      var stage = ui.$('.flag-stage');
      if (stage) {
        stage.classList.add('correct-pulse');
        global.setTimeout(function () { stage.classList.remove('correct-pulse'); }, 700);
      }
      if (!res.exact && res.matched) {
        extra = '<div class="small muted">비슷하게 말해도 정답으로 인정했어요. 정확한 이름은 <b>' + esc(c.ko) + '</b> 예요.</div>';
      }
      var wins = [];
      if (res.xpGain) wins.push('✨ 경험치 +' + res.xpGain);
      if (res.newSticker) wins.push('🏳️ ' + esc(c.ko) + ' 스티커를 얻었어요!');
      if (res.levelUp) wins.push('🎉 레벨 ' + res.levelUp.number + ' ' + esc(res.levelUp.name) + ' 이 되었어요!');
      if (res.dailyDone) wins.push('🏆 오늘의 도전을 끝냈어요!');
      if (wins.length) extra += '<div class="xp-gain" style="margin-top:8px">' + wins.join(' · ') + '</div>';

      // 게임 머리판의 경험치·콤보를 그 자리에서 갱신한다
      var lvNow = FQ.progress.level();
      var fill = ui.$('#xp-fill');
      if (fill) { fill.classList.add('gain'); fill.style.width = Math.round(lvNow.ratio * 100) + '%'; }
      var xpVal = ui.$('#xp-val');
      if (xpVal) xpVal.textContent = lvNow.into + ' / ' + lvNow.need;
      var chestNow = FQ.progress.chestProgress(g.streak);
      var cFill = ui.$('#combo-fill');
      if (cFill) cFill.style.width = Math.round(chestNow.ratio * 100) + '%';
      var cTitle = ui.$('#combo-title');
      if (cTitle) {
        cTitle.textContent = res.chest
          ? '보물상자가 열렸어요!'
          : g.streak + '연속! 보물상자까지 ' + chestNow.left + '개';
      }
    } else {
      verdict = res.gaveUp ? '👀 같이 외워 볼까요?' : '😅 아쉬워요';
      audio.play('wrong');
      if (res.confusedWith) {
        extra = '<div class="small">고른 나라는 <b>' + esc(res.confusedWith.ko) + '</b> 였어요.</div>';
      }
    }

    // 소리로도 알려 준다.
    //   맞혔을 때  → "정답!" 하고 외친 뒤 나라 이름을 읽어 준다
    //   모를 때·틀렸을 때 → 나라 이름을 두 번 읽고 국기 특징을 짧게 알려 준다
    state.lastSpeech = res.correct
      ? { lines: [cheerWord || '정답', c.ko], opts: { rates: [1.02, 0.95], pitches: [1.35, 1.1] } }
      : { lines: [c.ko, c.ko, c.flagHint], opts: { rate: 0.93, pitch: 1.1 } };

    // 마이크를 완전히 놓은 뒤에 읽어 준다.
    // 말하기 모드에서 곧바로 읽으면 아이폰·아이패드는 소리를 조용히 버린다.
    FQ.speech.stopAnd(function () {
      var micBtn2 = ui.$('#mic');
      if (micBtn2) micBtn2.classList.remove('listening');
      if (!store.settings().speak) return;
      global.setTimeout(function () {
        audio.say(state.lastSpeech.lines, state.lastSpeech.opts, nudgeReplay);
      }, res.correct ? 180 : 120);
    });

    var html =
      '<div class="feedback ' + (res.correct ? 'ok' : 'no') + '">' +
        '<div class="verdict">' + verdict + '</div>' +
        extra +
        '<div class="name-row" style="margin-top:10px">' +
          '<img src="' + ui.flagSrc(c.code) + '" alt="' + esc(c.ko) + ' 국기">' +
          '<div>' +
            '<div class="kname">' + esc(c.ko) + '</div>' +
            '<div class="ename">' + esc(c.en) + '</div>' +
          '</div>' +
          '<button class="btn btn-sm" data-speak="' + esc(c.ko) + '" type="button">🔊</button>' +
        '</div>' +
        '<ul class="info-list">' +
          '<li><b>수도</b><span>' + esc(c.capital) + '</span></li>' +
          '<li><b>위치</b><span>' + esc(c.continent) + ' · ' + esc(c.region) + '</span></li>' +
        '</ul>' +
        (res.correct ? '' :
          '<div class="remember-box">' +
            '<div class="remember-name">' + esc(c.ko) + ' · ' + esc(c.ko) + '</div>' +
            '<div class="remember-hint">🚩 ' + esc(c.flagHint) + '</div>' +
            (store.settings().speak
              ? '<button class="btn btn-sm" id="replay" type="button" style="margin-top:8px">🔊 다시 들려주기</button>'
              : '<button class="btn btn-sm" id="speak-on" type="button" style="margin-top:8px">🔇 읽어주기가 꺼져 있어요 · 켜고 듣기</button>') +
            '<div class="remember-tip small">이렇게 기억해 두면 다음엔 맞힐 수 있어요!</div>' +
          '</div>') +
        '<div class="fact-box">💡 ' + esc(c.fact) + '</div>' +
        '<button class="btn btn-primary btn-big" id="next" type="button" style="width:100%;margin-top:14px">' +
          (g.isLast() ? '결과 보기 →' : '다음 문제 →') +
        '</button>' +
      '</div>';

    var area = ui.$('#feedback-area');
    area.innerHTML = html;
    var replay = ui.$('#replay', area);
    if (replay) {
      replay.addEventListener('click', function () {
        replay.classList.remove('needs-tap');
        replay.textContent = '🔊 다시 들려주기';
        audio.say(state.lastSpeech.lines, state.lastSpeech.opts);
      });
    }
    var speakOn = ui.$('#speak-on', area);
    if (speakOn) {
      speakOn.addEventListener('click', function () {
        store.updateSettings({ speak: true });
        audio.setSpeakEnabled(true);
        speakOn.textContent = '🔊 다시 들려주기';
        speakOn.id = 'replay';
        audio.say(state.lastSpeech.lines, state.lastSpeech.opts);
      });
    }
    var next = ui.$('#next');
    next.addEventListener('click', goNext);
    next.focus();
    if (res.chest) global.setTimeout(function () { showChest(c, res.newSticker); }, 950);
    next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /**
   * 아이폰·아이패드가 소리를 끝내 내주지 않을 때 부른다.
   * 조용히 넘어가면 아이가 답을 못 듣게 되므로, 눌러서 들을 수 있다고 크게 알려 준다.
   */
  function nudgeReplay() {
    var btn = ui.$('#replay');
    if (!btn) return;
    btn.classList.add('needs-tap');
    btn.textContent = '🔊 눌러서 들어보기';
    try { btn.focus({ preventScroll: true }); } catch (e) {}
  }

  /**
   * 연속 정답으로 보물상자가 열리는 순간.
   * 눌러서 닫을 때까지 떠 있고, 안에서 무엇을 얻었는지 보여 준다.
   */
  function showChest(country, gotSticker) {
    var st = FQ.progress.stickers();
    var back = doc.createElement('div');
    back.className = 'chest-back';
    back.innerHTML =
      '<div class="chest-card" role="dialog" aria-label="보물상자를 열었어요">' +
        '<div class="chest-art">' +
          '<div class="chest-rays"></div>' +
          '<div class="chest-emoji">🎁</div>' +
        '</div>' +
        '<div class="chest-title">보물상자를 열었어요!</div>' +
        '<div class="chest-sub">' + FQ.progress.CHEST_EVERY + '문제를 연달아 맞혔어요</div>' +
        '<div class="chest-loot">' +
          '<div class="loot" style="animation-delay:.15s">' +
            '<div class="ic">⭐</div><div class="n">보너스 별</div><div class="d">+5점</div>' +
          '</div>' +
          '<div class="loot" style="animation-delay:.3s">' +
            '<div class="ic">✨</div><div class="n">경험치</div><div class="d">+20</div>' +
          '</div>' +
          (gotSticker && country
            ? '<div class="loot" style="animation-delay:.45s">' +
                '<div class="ic">🏳️</div><div class="n">' + esc(country.ko) + '</div><div class="d">새 스티커</div>' +
              '</div>'
            : '<div class="loot" style="animation-delay:.45s">' +
                '<div class="ic">📖</div><div class="n">스티커 판</div><div class="d">' + st.owned + ' / ' + st.total + '</div>' +
              '</div>') +
        '</div>' +
        '<button class="btn btn-primary btn-big" id="chest-close" type="button" style="width:100%;margin-top:18px">좋아요!</button>' +
      '</div>';
    doc.body.appendChild(back);

    // 상자를 여는 동안 보상 경험치를 더해 준다
    FQ.progress.addXp(20);
    state.xpGained += 20;
    audio.play('badge');
    FQ.effects.burst(110);

    function close() {
      back.remove();
      var nextBtn = ui.$('#next');
      if (nextBtn) nextBtn.focus();
    }
    back.addEventListener('click', function (ev) {
      if (ev.target === back || ev.target.closest('#chest-close')) close();
    });
    var btn = back.querySelector('#chest-close');
    if (btn) global.setTimeout(function () { btn.focus(); }, 600);
  }

  function goNext() {
    audio.stopSpeaking();
    state.game.next();
    if (state.game.isOver()) finishGame();
    else renderQuiz();
  }

  function preloadNext() {
    var g = state.game;
    var nq = g.questions[g.index + 1];
    if (!nq) return;
    var codes = [nq.country.code].concat((nq.options || []).map(function (c) { return c.code; }));
    codes.forEach(function (code) {
      var img = new Image();
      img.src = ui.flagSrc(code);
    });
  }

  /* --------- 제한 시간 --------- */
  function startTimer() {
    var limit = Number(store.settings().timer) || 0;
    if (!limit) return;
    state.timeLeft = limit;
    var chip = ui.$('#timer-chip');
    if (chip) chip.textContent = '⏱ ' + state.timeLeft;
    state.timerId = global.setInterval(function () {
      state.timeLeft -= 1;
      var c = ui.$('#timer-chip');
      if (c) c.textContent = '⏱ ' + Math.max(0, state.timeLeft);
      if (state.timeLeft <= 3 && state.timeLeft > 0) audio.play('tick');
      if (state.timeLeft <= 0) {
        stopTimer();
        if (!state.answered) submit({ text: '' }, true);
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerId) { global.clearInterval(state.timerId); state.timerId = null; }
  }

  /* =================== 결과 =================== */
  function finishGame() {
    stopTimer();
    stopListening();
    var g = state.game;
    if (!g) return renderHome();
    var summary = g.summary();
    store.finishGame(summary);
    var earned = FQ.badges.check(summary);
    state.lastSummary = summary;
    state.lastBadges = earned;
    renderResult(summary, earned);
  }

  function renderResult(summary, earned) {
    var rate = summary.total ? summary.correct / summary.total : 0;
    var starCount = FQ.progress.starsFor(summary.correct, summary.total);
    var stars = '';
    for (var si = 0; si < 3; si++) {
      stars += '<span class="' + (si < starCount ? '' : 'off') +
        '" style="animation-delay:' + (0.15 + si * 0.22) + 's">⭐</span>';
    }
    var cheer = rate >= 0.9 ? '대단해요! 세계 국기 박사님!'
      : rate >= 0.7 ? '아주 잘했어요!'
      : rate >= 0.4 ? '조금만 더 하면 돼요!'
      : '괜찮아요, 다시 해 보면 훨씬 잘할 거예요!';

    var duelHtml = '';
    if (summary.players.length > 1) {
      var best = 0;
      summary.playerScores.forEach(function (p, i) { if (p.score > summary.playerScores[best].score) best = i; });
      var tie = summary.playerScores.every(function (p) { return p.score === summary.playerScores[0].score; });
      duelHtml =
        '<div class="card section">' +
          '<h3>대결 결과</h3>' +
          summary.players.map(function (name, i) {
            var p = summary.playerScores[i];
            return '<div class="row" style="align-items:center;padding:8px 0">' +
              '<b style="font-size:1.15rem">' + esc(name) + '</b>' +
              '<span class="spacer"></span>' +
              '<span>' + p.correct + ' / ' + p.asked + ' 정답</span>' +
              '<span class="chip">⭐ ' + p.score + '</span>' +
            '</div>';
          }).join('') +
          '<div style="text-align:center;font-size:1.3rem;font-weight:900;margin-top:8px">' +
            (tie ? '🤝 비겼어요!' : '🏆 ' + esc(summary.players[best]) + ' 승리!') +
          '</div>' +
        '</div>';
    }

    var html =
      '<section class="screen">' +
        '<div class="card">' +
          '<div class="result-hero">' +
            '<div class="star-row">' + stars + '</div>' +
            '<div class="score">' + summary.correct + ' / ' + summary.total + '</div>' +
            '<p class="muted">' + esc(cheer) + '</p>' +
            (state.xpGained
              ? '<div class="xp-gain">✨ 경험치 +' + state.xpGained + '</div>'
              : '') +
          '</div>' +
          resultLevelBlock() +
          '<div class="stat-grid">' +
            '<div class="stat"><div class="v">' + summary.score + '</div><div class="k">점수</div></div>' +
            '<div class="stat"><div class="v">' + summary.bestStreak + '</div><div class="k">최고 연속</div></div>' +
            '<div class="stat"><div class="v">' + util.formatDuration(summary.seconds) + '</div><div class="k">걸린 시간</div></div>' +
            '<div class="stat"><div class="v">' + Math.round((summary.correct / (summary.total || 1)) * 100) + '%</div><div class="k">정답률</div></div>' +
          '</div>' +
        '</div>' +

        duelHtml +

        (earned && earned.length
          ? '<div class="section">' + earned.map(function (b) {
              return '<div class="badge-pop"><span class="ic">' + b.icon + '</span>' +
                '<span><span class="n">새 배지! ' + esc(b.name) + '</span><br><span class="d">' + esc(b.desc) + '</span></span></div>';
            }).join('') + '</div>'
          : '') +

        (state.newStickers.length
          ? '<div class="card section">' +
              '<h3>새로 얻은 스티커 ' + state.newStickers.length + '개</h3>' +
              '<div class="new-stickers">' + state.newStickers.map(function (c, i) {
                return '<div style="animation-delay:' + (0.1 + i * 0.08) + 's">' +
                  '<img src="' + ui.flagSrc(c.code) + '" alt="' + esc(c.ko) + ' 스티커">' +
                  '<div class="n">' + esc(c.ko) + '</div></div>';
              }).join('') + '</div>' +
            '</div>'
          : '') +

        (summary.wrong.length
          ? '<div class="card section">' +
              '<h3>다시 보면 좋은 국기 ' + summary.wrong.length + '개</h3>' +
              '<div class="wrong-grid">' + summary.wrong.map(function (c) {
                return '<button class="wrong-item" type="button" data-code="' + c.code + '">' +
                  '<img src="' + ui.flagSrc(c.code) + '" alt="' + esc(c.ko) + ' 국기">' +
                  '<div class="n">' + esc(c.ko) + '</div></button>';
              }).join('') + '</div>' +
              '<p class="small muted" style="margin-bottom:0">국기를 누르면 자세히 볼 수 있어요.</p>' +
            '</div>'
          : '<div class="card section" style="text-align:center">🎊 하나도 안 틀렸어요!</div>') +

        '<div class="row">' +
          '<button class="btn btn-primary btn-big" id="again" type="button" style="flex:1">🔁 한 번 더</button>' +
          (summary.wrong.length
            ? '<button class="btn btn-big" id="retry-wrong" type="button" style="flex:1">📝 틀린 것만 다시</button>'
            : '') +
        '</div>' +
        '<button class="btn btn-ghost btn-big" id="home" type="button" style="width:100%;margin-top:10px">🏠 처음으로</button>' +
      '</section>';

    var m = ui.setMain(html);
    if (rate >= 0.7) { audio.play('finish'); FQ.effects.burst(140); }
    else audio.play('finish');
    if (earned && earned.length) setTimeout(function () { audio.play('badge'); }, 700);

    ui.on(m, '.wrong-item', 'click', function (e, t) {
      ui.countryModal(quiz.byCode(t.getAttribute('data-code')));
    });
    ui.$('#again', m).addEventListener('click', function () { startGame(null); });
    var rw = ui.$('#retry-wrong', m);
    if (rw) rw.addEventListener('click', function () {
      startGame(summary.wrong.map(function (c) { return c.code; }));
    });
    ui.$('#home', m).addEventListener('click', renderHome);
  }

  /** 결과 화면에 지금 레벨과 스티커 판 진행을 보여 준다 */
  function resultLevelBlock() {
    var lv = FQ.progress.level();
    var st = FQ.progress.stickers();
    return '<div class="game-head" style="margin:14px 0 0">' +
      '<div class="row" style="align-items:center">' +
        '<span class="level-chip"><span class="num">' + lv.number + '</span>' + esc(lv.name) + '</span>' +
        '<span class="spacer"></span>' +
        '<span class="mini-chip">📖 ' + st.owned + ' / ' + st.total + '</span>' +
      '</div>' +
      '<div class="xp-row">' +
        '<span class="who">' + (lv.isMax ? '가장 높은 레벨이에요' : '다음 레벨까지') + '</span>' +
        '<span class="val">' + lv.into + ' / ' + lv.need + '</span>' +
      '</div>' +
      '<div class="xp-bar"><i style="width:' + Math.round(lv.ratio * 100) + '%"></i></div>' +
    '</div>';
  }

  /* =================== 키보드 =================== */
  doc.addEventListener('keydown', function (ev) {
    if (!state.game) return;
    if (doc.querySelector('.modal-back')) return;
    var tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    if (!state.answered && ev.key >= '1' && ev.key <= '4') {
      var target = ui.$$('.answer-btn')[parseInt(ev.key, 10) - 1];
      if (target && !target.disabled) { ev.preventDefault(); target.click(); }
    } else if (state.answered && (ev.key === 'Enter' || ev.key === ' ')) {
      var next = ui.$('#next');
      if (next) { ev.preventDefault(); next.click(); }
    }
  });

  /* =================== 시작 =================== */
  function boot() {
    if (!FQ.countries || !FQ.countries.length) {
      ui.setMain('<div class="card">국기 자료를 불러오지 못했어요. <code>data/countries.js</code> 파일을 확인해 주세요.</div>');
      return;
    }
    var s = store.settings();
    audio.setEnabled(s.sound);
    audio.setSpeakEnabled(s.speak);

    doc.getElementById('nav-dex').addEventListener('click', function () {
      stopTimer(); stopListening(); audio.stopSpeaking(); state.game = null;
      FQ.screens.dex();
    });
    doc.getElementById('nav-stats').addEventListener('click', function () {
      stopTimer(); stopListening(); audio.stopSpeaking(); state.game = null;
      FQ.screens.stats();
    });
    // 아이폰·아이패드는 사용자가 화면을 처음 만질 때만 소리를 열어 준다
    ['pointerdown', 'touchend', 'click', 'keydown'].forEach(function (evt) {
      doc.addEventListener(evt, audio.unlock, { passive: true });
    });

    registerServiceWorker();
    renderHome();
  }

  /* 한 번 열어 두면 인터넷 없이도 놀 수 있게 한다. file:// 로 연 경우에는 건너뛴다. */
  function registerServiceWorker() {
    if (!('serviceWorker' in global.navigator)) return;
    var proto = global.location.protocol;
    var host = global.location.hostname;
    if (proto !== 'https:' && host !== 'localhost' && host !== '127.0.0.1') return;
    global.navigator.serviceWorker.register('sw.js').catch(function () { /* 없어도 그만 */ });
  }

  FQ.app = { home: renderHome, boot: boot, startGame: startGame };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
