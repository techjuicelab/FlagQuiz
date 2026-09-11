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

  var CHEST_BONUS = 5;   // 학습 카드 다섯 장을 모으면 더해 주는 점수
  var DISCOVERIES = ['여행책에 한 장', '지도에 톡', '하나 더 만났어요', '깃발이 살랑'];

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
    listenFailures: 0,
    feedbackGeneration: 0,
    screen: 'home',
    musicGeneration: 0,
    cancelFeedbackVoice: null,
    timerPaused: false,
    lastSpeech: { lines: [], opts: {} },
    xpGained: 0,
    newStickers: [],
    lastSummary: null,
    lastBadges: []
  };

  /** 다른 문제나 화면으로 넘어간 뒤 이전 안내가 뒤늦게 나오지 않도록 한다. */
  function cancelPendingFeedback() {
    if (state.cancelFeedbackVoice) state.cancelFeedbackVoice();
    state.cancelFeedbackVoice = null;
    state.feedbackGeneration += 1;
    stopMusic();
    var chest = ui.$('.chest-back');
    if (chest) {
      chest.remove();
      var next = ui.$('#next');
      if (next) next.disabled = false;
    }
  }

  function stopMusic() {
    state.musicGeneration += 1;
    if (FQ.music) FQ.music.stop();
  }

  function playMusic(event, done) {
    if (FQ.music) return FQ.music.play(event, { onDone: done, onFail: done });
    var pending = global.setTimeout(function () { if (done) done(); }, 0);
    return function () { global.clearTimeout(pending); };
  }

  function musicScreen(screen) {
    state.screen = screen;
    if (!FQ.music) return;
    var s = store.settings();
    FQ.music.setEnabled(s.sound);
    FQ.music.setBgmEnabled(!!s.homeMusic);
    if ((screen === 'home' || screen === 'dex') && !doc.hidden && s.homeMusic && s.sound) {
      var request = ++state.musicGeneration;
      var generation = state.feedbackGeneration;
      // 화면이 바뀌어도 마이크 해제는 아직 진행 중일 수 있다. BGM도 실제 종료 뒤에 연다.
      FQ.speech.stopAnd(function () {
        var latest = store.settings();
        if (request !== state.musicGeneration || generation !== state.feedbackGeneration ||
            state.screen !== screen || doc.hidden || !latest.homeMusic || !latest.sound ||
            doc.querySelector('.modal-back') || (audio.isSpeaking && audio.isSpeaking())) return;
        FQ.music.play('homeBgm');
      });
    } else stopMusic();
  }

  /* =================== 홈 =================== */
  function renderHome() {
    cancelPendingFeedback();
    stopTimer();
    stopListening();
    audio.stopSpeaking();
    state.game = null;
    var s = store.settings();
    musicScreen('home');
    var wrongCount = store.wrongList().length;
    var duel = s.players.length > 1;
    var poolSize = quiz.pool({ level: s.level, continent: s.continent }).length;

    var html =
      '<section class="screen">' +
        playerCard(s) +
        dailyCard() +

        '<div class="home-cols">' +

        '<div class="col">' +

        '<div class="card section">' +
          '<h3>누가 하나요?</h3>' +
          '<div class="field">' +
            '<label for="p1">이름</label>' +
            '<input class="text-input" id="p1" maxlength="10" value="' + esc(s.players[0] || '') + '" placeholder="민규">' +
          '</div>' +
          '<label class="switch"><input type="checkbox" id="duel"' + (duel ? ' checked' : '') + '> 둘이서 번갈아 대결하기</label>' +
          '<p class="small muted' + (duel ? '' : ' hidden') + '" id="duel-note" style="margin:8px 0 0">' +
            '점수는 각자 따로 매기지만, 스티커·경험치·레벨은 <b id="duel-owner">' +
            esc(s.players[0] || '민규') + '</b> 것으로 쌓여요.</p>' +
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

        '</div>' +
        '<div class="col">' +

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
            '<label class="switch"><input type="checkbox" id="opt-bgm"' + (s.homeMusic ? ' checked' : '') + '> 🎵 홈과 도감 배경음</label>' +
            '<label class="switch"><input type="checkbox" id="opt-correct-music"' + (s.correctMusic ? ' checked' : '') + '> ✨ 정답에 다른 소리</label>' +
            '<label class="switch"><input type="checkbox" id="opt-review"' + (s.reviewFirst ? ' checked' : '') + '> 🔁 한 번 더 만날 나라를 자주</label>' +
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
          ? '<button class="btn btn-big" id="review" type="button" style="width:100%;margin-top:12px">📖 한 번 더 만나기 (' +
              Math.min(wrongCount, 20) + '문제' + (wrongCount > 20 ? ' · 남은 ' + (wrongCount - 20) + '개는 다음에' : '') + ')</button>'
          : '') +

        '</div>' +
        '</div>' +
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
      var note = ui.$('#duel-note', m);
      if (note) {
        note.classList.toggle('hidden', !ev.target.checked);
        var owner = ui.$('#duel-owner', m);
        var p1box = ui.$('#p1', m);
        if (owner && p1box) owner.textContent = (p1box.value || '').trim() || '민규';
      }
      savePlayers(m);
    });
    ['#p1', '#p2'].forEach(function (sel) {
      var input = ui.$(sel, m);
      if (input) input.addEventListener('change', function () { savePlayers(m); });
    });
    ui.$('#opt-sound', m).addEventListener('change', function (ev) {
      store.updateSettings({ sound: ev.target.checked });
      audio.setEnabled(ev.target.checked);
      musicScreen('home');
    });
    ui.$('#opt-speak', m).addEventListener('change', function (ev) {
      store.updateSettings({ speak: ev.target.checked });
      audio.setSpeakEnabled(ev.target.checked);
    });
    ui.$('#opt-bgm', m).addEventListener('change', function (ev) {
      if (FQ.music) FQ.music.unlock();
      store.updateSettings({ homeMusic: ev.target.checked });
      musicScreen('home');
    });
    ui.$('#opt-correct-music', m).addEventListener('change', function (ev) {
      store.updateSettings({ correctMusic: ev.target.checked });
    });
    ui.$('#opt-review', m).addEventListener('change', function (ev) {
      store.updateSettings({ reviewFirst: ev.target.checked });
    });

    // 오늘의 도전 카드를 누르면 그 대륙으로 맞춰 준다 (여태 눌러도 아무 일이 없었다)
    var dailyGo = ui.$('#daily-go', m);
    if (dailyGo) {
      dailyGo.addEventListener('click', function () {
        var d = FQ.progress.daily();
        if (d.complete) { FQ.screens.dex(); return; }
        savePlayers(m);
        store.updateSettings({ continent: d.continent });
        renderHome();
      });
    }

    // 대륙별 모으기 항목을 누르면 스티커 판의 그 대륙으로 간다
    ui.on(m, '[data-cont-go]', 'click', function (e, t) {
      FQ.screens.dex(t.getAttribute('data-cont-go'));
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
          '<span class="mini-chip">✨ ' + (lv.isMax ? '경험치 ' + FQ.progress.xp() : lv.into + ' / ' + lv.need) + '</span>' +
          '<span class="mini-chip">📖 여행 카드 ' + (stats.asked || 0) + '장</span>' +
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
          return '<button class="cont-item" type="button" data-cont-go="' + esc(name) + '">' +
            '<span class="cont-top">' +
              '<span class="cont-name">' + esc(name) + '</span>' +
              '<span class="cont-num">' + b.owned + '/' + b.total + '</span>' +
            '</span>' +
            '<span class="cont-bar"><i style="width:' + pct + '%"></i></span>' +
          '</button>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  /** 홈: 오늘의 도전 */
  function dailyCard() {
    var d = FQ.progress.daily();
    var s = store.settings();
    // 고른 대륙이 오늘의 대륙과 다르면 도전은 한 칸도 오르지 않는다.
    // 여태 아무 말도 없이 조용히 멈춰 있었다.
    var mismatch = !d.complete && s.continent !== 'all' && s.continent !== d.continent;
    return '<button class="daily-card" id="daily-go" type="button">' +
      '<span class="ic">' + (d.complete ? '🏆' : '🎯') + '</span>' +
      '<span class="body">' +
        '<span class="t">' +
          (d.complete
            ? '오늘의 도전을 끝냈어요!'
            : '오늘의 도전 · ' + esc(d.continent) + ' 나라 ' + d.target + '개 맞히기') +
        '</span>' +
        (mismatch
          ? '<span class="daily-why">지금은 ' + esc(s.continent) + '만 나와서 오르지 않아요 · 눌러서 ' +
            esc(d.continent) + '로 바꾸기</span>'
          : '') +
        '<span class="daily-bar"><i style="width:' + Math.round(d.ratio * 100) + '%"></i></span>' +
      '</span>' +
      '<span class="cnt">' + d.done + '/' + d.target + '</span>' +
    '</button>';
  }

  function voiceNotice() {
    var reason = FQ.speech.unavailableReason();
    if (!reason) return '<div class="notice">🎤 “듣고 있어요”가 나오면 <b>나라 이름을 끝까지 말해 주세요.</b> 마이크 사용을 물어보면 “허용”을 눌러 주세요. 음성 인식에는 인터넷 연결이 필요할 수 있어요.</div>';
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
    cancelPendingFeedback();
    stopTimer();
    stopListening();
    audio.stopSpeaking();
    var s = store.settings();
    var reviewing = !!(onlyCodes && onlyCodes.length);
    state.review = reviewing
      ? { asked: Math.min(onlyCodes.length, 20), before: store.wrongList().length }
      : null;
    audio.setEnabled(s.sound);
    audio.setSpeakEnabled(s.speak);
    audio.unlock();
    if (FQ.music) FQ.music.unlock();
    musicScreen('quiz');
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
    // 말하기는 클릭한 순간 바로 마이크를 연다. 시작 음악보다 듣기를 우선한다.
    if (s.mode !== 'voice') playMusic('start');
  }

  /* =================== 퀴즈 화면 =================== */
  function renderQuiz() {
    cancelPendingFeedback();
    var g = state.game;
    if (!g || g.isOver()) return finishGame();
    state.answered = false;
    state.usedHint = false;
    state.removed = [];
    state.timedOut = false;
    state.timerPaused = false;
    state.listenFailures = 0;

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
          '<img class="flag-img" src="' + ui.flagSrc(q.country.code) + '" alt="' + esc(q.country.ko) + ' 국기">' +
          '<div class="big-name">' + esc(q.country.ko) + '</div>' +
          '<button class="btn btn-sm" data-speak="' + esc(q.country.ko) + '" type="button">🔊 들어보기</button>' +
          '<div class="q-label" style="margin-top:10px">이 나라의 수도는 어디일까요?</div>' +
        '</div>';
    } else {
      stage =
        '<div class="flag-stage">' +
          '<div class="q-label">이 국기는 어느 나라일까요?</div>' +
          '<img class="flag-img" src="' + ui.flagSrc(q.country.code) + '" alt="맞혀야 할 국기">' +
        '</div>';
    }

    var lv = FQ.progress.level();
    var chest = FQ.progress.chestProgress(store.stats().asked);
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
            '<span class="val" id="xp-val">' + (lv.isMax ? '최고 레벨' : lv.into + ' / ' + lv.need) + '</span>' +
          '</div>' +
          '<div class="xp-bar"><i id="xp-fill" style="width:' + Math.round(lv.ratio * 100) + '%"></i></div>' +
        '</div>' +

        '<div class="combo-card">' +
          '<span class="journey-icon">📖</span>' +
          '<span class="combo-body">' +
            '<span class="combo-title" id="combo-title">' +
              '여행 카드 ' + chest.into + ' / ' + chest.need + '장 · 상자까지 ' + chest.left + '장' +
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
              '<button class="btn btn-sm" id="hint" type="button">💡 같이 보기</button>' +
              '<button class="btn btn-sm btn-ghost" id="skip" type="button">🤷 모르겠어요</button>' +
            '</div>' +
            '<div id="hint-area"></div>' +
          '</div>' +
        '</div>' +
        '<div id="feedback-area"></div>' +
      '</section>';

    var m = ui.setMain(html);

    ui.on(m, '[data-speak]', 'click', function (e, t) {
      // 읽어주기가 꺼져 있으면 눌러도 아무 일이 없었다. 켜 주고 바로 읽는다.
      if (!store.settings().speak) {
        store.updateSettings({ speak: true });
        audio.setSpeakEnabled(true);
        var chip = ui.$('#listen-tip') || ui.$('#heard');
        if (chip) chip.textContent = '읽어주기를 켰어요';
      }
      if (state.cancelFeedbackVoice) state.cancelFeedbackVoice();
      stopMusic();
      var name = t.getAttribute('data-speak');
      var generation = state.feedbackGeneration;
      var cancelled = false;
      state.cancelFeedbackVoice = function () { cancelled = true; };
      function nameCurrent() {
        return !cancelled && generation === state.feedbackGeneration && !doc.hidden;
      }
      t.classList.remove('needs-tap');
      t.textContent = '🔊 들어보기';
      audio.stopSpeaking();
      FQ.speech.stopAnd(function () {
        if (!nameCurrent()) return;
        audio.say([name], {}, function () {
          if (!nameCurrent()) return;
          t.classList.add('needs-tap');
          t.textContent = '🔊 다시 눌러서 듣기';
        });
      });
    });
    ui.$('#quit', m).addEventListener('click', function () {
      var g2 = state.game;
      var played = g2 ? g2.index : 0;
      if (played > 0 && !global.confirm('지금 그만하면 이번 판 기록은 남지 않아요. 그만할까요?')) return;
      cancelPendingFeedback();
      stopTimer();
      stopListening();
      audio.stopSpeaking();
      state.game = null;
      state.timedOut = false;
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
      return '<div class="answer-grid grid-2">' + q.options.map(function (c, i) {
        return '<button class="answer-btn flag-choice" type="button" data-code="' + c.code + '"' +
          ' aria-label="' + (i + 1) + '번 국기">' +
          '<span class="choice-num" aria-hidden="true">' + (i + 1) + '</span>' +
          '<img src="' + ui.flagSrc(c.code) + '" alt=""></button>';
      }).join('') + '</div>';
    }
    if (q.mode === 'voice') {
      var reason = FQ.speech.unavailableReason();
      var off = FQ.speech.blocked();
      return '<div class="mic-wrap">' +
        (reason ? '<div class="notice">⚠️ ' + esc(reason) + '</div>' : '') +
        '<button class="mic-btn" id="mic" type="button" aria-label="듣기 시작하기" aria-pressed="false"' + (off ? ' disabled' : '') + '>🎤</button>' +
        '<div class="listen-state" id="listen-state">' +
          (off ? '마이크를 쓸 수 없어요' : '마이크를 준비하고 있어요…') +
        '</div>' +
        '<div class="heard" id="heard"></div>' +
        '<div class="listen-tip small muted" id="listen-tip">' +
          (off ? '아래에 나라 이름을 써서 답해 주세요' : '') +
        '</div>' +
        '<details class="type-fallback"' + (off ? ' open' : '') + '>' +
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
    if (state.answered || !state.listenOn || doc.hidden || !state.game) return;
    var game = state.game;
    var question = game.current();
    if (!question || question.mode !== 'voice') return;
    if (FQ.speech.isListening && FQ.speech.isListening()) return;
    var generation = state.feedbackGeneration;
    function current() {
      return state.game === game && game.current() === question &&
        generation === state.feedbackGeneration && !state.answered && state.listenOn && !doc.hidden;
    }
    var mic = ui.$('#mic');
    if (!mic || mic.disabled) return;
    audio.stopSpeaking();
    stopMusic();
    mic.classList.remove('listening');
    mic.setAttribute('aria-label', '듣기 멈추기');
    mic.setAttribute('aria-pressed', 'false');
    setListenState('마이크를 준비하고 있어요…', '');
    var tip = ui.$('#listen-tip');
    if (tip) tip.textContent = '모르겠으면 “몰라요” 나 “이게 뭐야?” 라고 말해도 돼요';

    function retryListening() {
      if (state.listenTimer) global.clearTimeout(state.listenTimer);
      state.listenTimer = global.setTimeout(function () {
        state.listenTimer = null;
        if (current()) startListening();
      }, state.listenFailures ? Math.min(2000, state.listenFailures * 750) : 250);
    }

    var requested = FQ.speech.start({
      continuous: true,
      start: function () {
        if (!current()) return;
        mic.classList.add('listening');
        mic.setAttribute('aria-pressed', 'true');
        setListenState('듣고 있어요. 나라 이름을 끝까지 말해 주세요!', 'on');
      },
      interim: function (text) {
        if (!current()) return;
        state.listenFailures = 0;
        var heard = ui.$('#heard');
        if (heard) heard.textContent = text;
        // 중간 결과는 바뀔 수 있다. “인도네시아”의 “인도”를 먼저 채점하지 않는다.
      },
      result: function (alts) {
        if (!current()) return;
        state.listenFailures = 0;
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
        if (heard) heard.textContent = alts[0] || '';
        var tip2 = ui.$('#listen-tip');
        if (tip2) tip2.textContent = '나라 이름을 찾지 못했어요. 한 번 더 말하거나 글자로 답해 주세요.';
      },
      error: function (code, message) {
        if (!current()) return;
        if (code === 'no-speech' || code === 'aborted') return;   // 조용하면 그냥 계속 기다린다
        mic.classList.remove('listening');
        mic.setAttribute('aria-pressed', 'false');
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          state.listenOn = false;
          mic.setAttribute('aria-label', '마이크 다시 시도하기');
          setListenState('마이크 허용을 확인한 뒤 마이크를 눌러 다시 시도해 주세요.', 'off');
          openTypeFallback('브라우저의 마이크 권한을 허용해 주세요. 글자로 답해도 좋아요.');
          return;
        }
        state.listenFailures += 1;
        var fatal = code === 'unsupported' || code === 'audio-capture' ||
          code === 'language-not-supported' || code === 'start-timeout';
        if (fatal || state.listenFailures >= 3) {
          state.listenOn = false;
          mic.setAttribute('aria-label', '마이크 다시 시도하기');
          mic.disabled = code === 'unsupported';
          setListenState(code === 'start-timeout'
            ? '마이크 준비가 오래 걸려요. 권한 허용을 확인한 뒤 마이크를 눌러 주세요.'
            : code === 'network'
              ? '연결이 불안정해요. 인터넷을 확인한 뒤 마이크를 눌러 주세요.'
              : '마이크가 멈췄어요. 마이크를 눌러 다시 시도하거나 글자로 답해 주세요.', 'off');
          openTypeFallback(message || '아래에 나라 이름을 써서 답해도 좋아요.');
          return;
        }
        setListenState(code === 'network' ? '연결을 다시 확인하고 있어요…' : '마이크가 잠깐 멈췄어요. 다시 들을게요.', 'off');
        // 이전 세션이 끝난 뒤 예약된 시작이 실패한 경우에는 start() 반환값을 받을 수 없다.
        if (code === 'start-failed') retryListening();
      },
      end: function () {
        if (!current()) return;
        var mic3 = ui.$('#mic');
        if (mic3) { mic3.classList.remove('listening'); mic3.setAttribute('aria-pressed', 'false'); }
        // 사파리는 몇 초마다 스스로 끊는다. 아직 답을 안 했으면 곧바로 다시 듣는다.
        retryListening();
      }
    });
    // 동기 시작 실패에는 onend가 오지 않는다.
    if (requested === false && current()) retryListening();
  }

  /** 말로 답할 수 없을 때, 글자 입력을 펼쳐 주고 그리로 안내한다 */
  function openTypeFallback(tip) {
    var box = ui.$('.type-fallback');
    if (box) box.open = true;
    var t = ui.$('#listen-tip');
    if (t && tip) t.textContent = tip;
  }

  function stopListening() {
    state.listenOn = false;
    if (state.listenTimer) { global.clearTimeout(state.listenTimer); state.listenTimer = null; }
    FQ.speech.abort();
    var mic = ui.$('#mic');
    if (mic) {
      mic.classList.remove('listening');
      mic.setAttribute('aria-pressed', 'false');
      mic.setAttribute('aria-label', '듣기 시작하기');
    }
  }

  /** 마이크 버튼은 이제 듣기를 잠깐 멈추거나 다시 켜는 스위치다. */
  function toggleMic() {
    if (state.answered) return;
    if (state.listenOn) {
      stopListening();
      setListenState('듣기를 멈췄어요. 마이크를 누르면 다시 들어요.', 'off');
    } else {
      state.listenFailures = 0;
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
    }
    // recordAnswer는 제출 때 딱 한 번 증가한다. 오답·건너뛰기도 쌓이고 다음 판에 이어진다.
    res.chest = FQ.progress.chestOpensAt(store.stats().asked);
    if (res.chest) {
      var chestLevel = FQ.progress.addXp(20);
      if (chestLevel) res.levelUp = chestLevel;
      state.xpGained += 20;
      res.xpGain = (res.xpGain || 0) + 20;
      g.addBonus(CHEST_BONUS);
    }
    showFeedback(res);
  }

  function showFeedback(res) {
    if (state.cancelFeedbackVoice) state.cancelFeedbackVoice();
    state.cancelFeedbackVoice = null;
    stopMusic();
    audio.stopSpeaking();
    var q = res.question;
    var c = q.country;
    var g = state.game;

    ui.$$('.answer-btn').forEach(function (btn) {
      btn.disabled = true;
      var code = btn.getAttribute('data-code');
      if (code === c.code) btn.classList.add('is-correct');
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

    // 같은 짧은 발견 반응을 모든 학습 카드에 쓴다. 정오답이 소리나 색의 신호가 되지 않는다.
    var verdict = '📖 ' + DISCOVERIES[(Math.max(1, store.stats().asked) - 1) % DISCOVERIES.length];
    var extra = '';
    var wins = [];
    if (res.newSticker) wins.push('새 스티커가 여행책에 들어왔어요');
    if (res.levelUp) wins.push('새 길이 열렸어요 · ' + esc(res.levelUp.name));
    if (wins.length) extra = '<div class="small muted">' + wins.join(' · ') + '</div>';

    var lvNow = FQ.progress.level();
    var fill = ui.$('#xp-fill');
    if (fill) fill.style.width = Math.round(lvNow.ratio * 100) + '%';
    var xpVal = ui.$('#xp-val');
    if (xpVal) xpVal.textContent = lvNow.isMax ? '최고 레벨' : lvNow.into + ' / ' + lvNow.need;
    var chestNow = FQ.progress.chestProgress(store.stats().asked);
    var cFill = ui.$('#combo-fill');
    if (cFill) cFill.style.width = Math.round(chestNow.ratio * 100) + '%';
    var cTitle = ui.$('#combo-title');
    if (cTitle) cTitle.textContent = res.chest ? '여행책에 다섯 장이 모였어요' :
      '여행 카드 ' + chestNow.into + ' / ' + chestNow.need + '장 · 상자까지 ' + chestNow.left + '장';

    // 정오답 모두 이름 한 번과 쉬운 설명 한 문장만 읽는다.
    var isCapitalQ = q.mode === 'capital';
    state.lastSpeech = {
      lines: isCapitalQ ? [c.capital, c.ko + '의 수도예요'] : [c.ko, c.flagHint],
      opts: { rate: 0.93, pitch: 1.1 }
    };
    var feedbackSpeech = state.lastSpeech;
    var generation = state.feedbackGeneration;
    var narrationRequest = 0;
    var chestShown = false;
    function cancelNarration() {
      narrationRequest += 1;
      stopMusic();
    }
    state.cancelFeedbackVoice = cancelNarration;
    function feedbackCurrent() {
      return state.feedbackGeneration === generation && state.game === g &&
        g.current() === q && state.answered && !doc.hidden;
    }
    function afterExplanation(request) {
      if (!feedbackCurrent() || request !== narrationRequest || !res.chest || chestShown) return;
      chestShown = true;
      showChest(c, res.newSticker);
    }
    function narrate(request) {
      if (!feedbackCurrent() || request !== narrationRequest) return;
      if (!store.settings().speak) { afterExplanation(request); return; }
      audio.say(feedbackSpeech.lines, Object.assign({}, feedbackSpeech.opts, {
        onEnd: function () { afterExplanation(request); }
      }), function () {
        if (!feedbackCurrent() || request !== narrationRequest) return;
        nudgeReplay();
        afterExplanation(request);
      });
    }
    function beginFeedback(request, replaying) {
      FQ.speech.stopAnd(function () {
        if (!feedbackCurrent() || request !== narrationRequest) return;
        // 보상 소리는 우선순위가 높은 하나만 쓴다. 상자는 설명이 끝난 뒤 열린다.
        if (res.chest || replaying) { narrate(request); return; }
        var event = res.levelUp ? 'level' : res.newSticker ? 'sticker' :
          res.correct && store.settings().correctMusic ? 'correct' : 'discovery';
        playMusic(event, function () { narrate(request); });
      });
    }

    var html =
      '<div class="feedback learn discovery-card">' +
        '<div class="verdict">' + verdict + '</div>' + extra +
        '<div class="name-row" style="margin-top:10px">' +
          '<img src="' + ui.flagSrc(c.code) + '" alt="' + esc(c.ko) + ' 국기">' +
          '<div><div class="kname">' + esc(isCapitalQ ? c.capital : c.ko) + '</div></div>' +
        '</div>' +
        '<div class="remember-box"><div class="remember-hint">' +
          (isCapitalQ ? '🏙️ ' + esc(c.ko) + '의 수도예요' : '🚩 ' + esc(c.flagHint)) +
        '</div></div>' +
        (store.settings().speak
          ? '<button class="btn btn-sm" id="replay" type="button" style="margin-top:8px">🔊 설명 다시 듣기</button>'
          : '<button class="btn btn-sm" id="speak-on" type="button" style="margin-top:8px">🔇 읽어주기가 꺼져 있어요 · 켜고 듣기</button>') +
        '<button class="btn btn-primary btn-big" id="next" type="button" style="width:100%;margin-top:14px">' +
          (g.isLast() ? '오늘 여행 보기 →' : '다음 나라 →') +
        '</button>' +
      '</div>';

    var area = ui.$('#feedback-area');
    area.innerHTML = html;
    function replayFeedback() {
      if (state.cancelFeedbackVoice && state.cancelFeedbackVoice !== cancelNarration) state.cancelFeedbackVoice();
      cancelNarration();
      state.cancelFeedbackVoice = cancelNarration;
      generation = state.feedbackGeneration;
      audio.stopSpeaking();
      beginFeedback(narrationRequest, true);
    }
    var replay = ui.$('#replay', area);
    if (replay) {
      replay.addEventListener('click', function () {
        replay.classList.remove('needs-tap');
        replay.textContent = '🔊 설명 다시 듣기';
        replayFeedback();
      });
    }
    var speakOn = ui.$('#speak-on', area);
    if (speakOn) {
      speakOn.addEventListener('click', function () {
        store.updateSettings({ speak: true });
        audio.setSpeakEnabled(true);
        speakOn.textContent = '🔊 설명 다시 듣기';
        speakOn.id = 'replay';
        replayFeedback();
      });
    }
    var next = ui.$('#next');
    next.addEventListener('click', goNext);
    next.focus();
    beginFeedback(narrationRequest, false);
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
   * 학습 카드 다섯 장으로 여행 상자가 열리는 순간.
   * 눌러서 닫을 때까지 떠 있고, 안에서 무엇을 얻었는지 보여 준다.
   */
  function showChest(country, gotSticker) {
    var st = FQ.progress.stickers();
    var back = doc.createElement('div');
    back.className = 'chest-back';
    back.innerHTML =
      '<div class="chest-card" role="dialog" aria-modal="true" aria-label="여행 상자가 열렸어요">' +
        '<div class="chest-art">' +
          '<div class="chest-rays"></div>' +
          '<div class="chest-emoji">🎁</div>' +
        '</div>' +
        '<div class="chest-title">여행 상자가 열렸어요!</div>' +
        '<div class="chest-sub">여행책에 다섯 장이 모였어요</div>' +
        '<div class="chest-loot">' +
          '<div class="loot" style="animation-delay:.15s">' +
            '<div class="ic">⭐</div><div class="n">보너스 별</div><div class="d">+' + CHEST_BONUS + '점</div>' +
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

    // 뒤의 '다음 문제' 단추를 잠가 둔다. 포커스를 쥔 채로 두면 엔터 한 번에
    // 상자를 못 본 채 다음 문제로 넘어가 버린다.
    var behind = ui.$('#next');
    if (behind) behind.disabled = true;
    var closeBtn0 = back.querySelector('#chest-close');
    if (closeBtn0) { try { closeBtn0.focus({ preventScroll: true }); } catch (e) { closeBtn0.focus(); } }

    // 보상은 submit 에서 이미 반영했다. 여기서는 화면과 효과만 보여 준다.
    playMusic('chest');
    FQ.effects.burst(35);

    function close() {
      stopMusic();
      back.remove();
      var nextBtn = ui.$('#next');
      if (nextBtn) { nextBtn.disabled = false; nextBtn.focus(); }
    }
    back.addEventListener('click', function (ev) {
      if (ev.target === back || ev.target.closest('#chest-close')) close();
    });
  }

  function goNext() {
    if (!state.game || !state.answered || !state.game.current()) return;
    cancelPendingFeedback();
    state.timedOut = false;
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
  function startTimer(remaining) {
    stopTimer();
    var limit = remaining === undefined ? Number(store.settings().timer) || 0 : remaining;
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
        if (!state.answered) {
          state.timedOut = true;
          // 쓰던 답이 있으면 버리지 않고 그것으로 채점한다
          var typed = ui.$('#answer-input');
          var left = typed && typed.value ? typed.value.trim() : '';
          submit({ text: left }, !left);
        }
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
    cancelPendingFeedback();
    var cheer = '멋져!';
    musicScreen('result');

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
            '<div class="journey-finish" aria-hidden="true">🗺️</div>' +
            '<div class="score">오늘 만난 나라 ' + summary.total + '개</div>' +
            '<p class="muted">여행책에 새로운 이야기가 쌓였어요</p>' +
            '<button class="btn btn-sm" id="result-replay" type="button">🔊 응원 다시 듣기</button>' +
            (state.xpGained
              ? '<div class="xp-gain">✨ 경험치 +' + state.xpGained + '</div>'
              : '') +
          '</div>' +
          reviewResultBlock() +
          resultLevelBlock() +
          '<details class="journey-record"><summary>학습 기록 보기</summary><div class="stat-grid">' +
            '<div class="stat"><div class="v">' + summary.score + '</div><div class="k">점수</div></div>' +
            '<div class="stat"><div class="v">' + summary.bestStreak + '</div><div class="k">최고 연속</div></div>' +
            '<div class="stat"><div class="v">' + util.formatDuration(summary.seconds) + '</div><div class="k">걸린 시간</div></div>' +
            '<div class="stat"><div class="v">' + Math.round((summary.correct / (summary.total || 1)) * 100) + '%</div><div class="k">정답률</div></div>' +
          '</div></details>' +
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
              '<h3>한 번 더 만날 나라 ' + summary.wrong.length + '개</h3>' +
              '<div class="wrong-grid">' + summary.wrong.map(function (c) {
                return '<button class="wrong-item" type="button" data-code="' + c.code + '">' +
                  '<img src="' + ui.flagSrc(c.code) + '" alt="' + esc(c.ko) + ' 국기">' +
                  '<div class="n">' + esc(c.ko) + '</div>' +
                  (c.flagHint ? '<div class="wh">' + esc(c.flagHint) + '</div>' : '') +
                '</button>';
              }).join('') + '</div>' +
              '<p class="small muted" style="margin-bottom:0">국기를 누르면 자세히 볼 수 있어요.</p>' +
            '</div>'
          : '<div class="card section" style="text-align:center">📖 오늘의 여행 카드가 모두 모였어요</div>') +

        '<div class="row">' +
          '<button class="btn btn-primary btn-big" id="again" type="button" style="flex:1">🔁 한 번 더</button>' +
          (summary.wrong.length
            ? '<button class="btn btn-big" id="retry-wrong" type="button" style="flex:1">📖 한 번 더 만나기</button>'
            : '') +
        '</div>' +
        '<button class="btn btn-ghost btn-big" id="home" type="button" style="width:100%;margin-top:10px">🏠 처음으로</button>' +
      '</section>';

    var m = ui.setMain(html);
    var resultGame = state.game;
    var resultReplay = ui.$('#result-replay', m);
    var resultRequest = 0;
    function cancelResultVoice() { resultRequest += 1; stopMusic(); }
    function playResultVoice(withMusic) {
      cancelResultVoice();
      state.cancelFeedbackVoice = cancelResultVoice;
      var request = resultRequest;
      function resultCurrent() {
        return state.game === resultGame && state.lastSummary === summary &&
          request === resultRequest && !doc.hidden;
      }
      resultReplay.classList.remove('needs-tap');
      resultReplay.textContent = '🔊 응원 다시 듣기';
      audio.stopSpeaking();
      // 마지막 답에서 곧바로 결과를 열어도 마이크를 놓기 전에는 응원을 시작하지 않는다.
      FQ.speech.stopAnd(function () {
        if (!resultCurrent()) return;
        function finishMusic() { if (withMusic && resultCurrent()) playMusic('finish'); }
        if (!store.settings().speak) { finishMusic(); return; }
        audio.say([cheer], { onEnd: finishMusic }, function () {
          if (!resultCurrent()) return;
          resultReplay.classList.add('needs-tap');
          resultReplay.textContent = '🔊 눌러서 응원 듣기';
          finishMusic();
        });
      });
    }
    playResultVoice(true);
    resultReplay.addEventListener('click', function () {
      if (!store.settings().speak) {
        store.updateSettings({ speak: true });
        audio.setSpeakEnabled(true);
      }
      playResultVoice();
    });
    FQ.effects.burst(35);

    ui.on(m, '.wrong-item', 'click', function (e, t) {
      cancelResultVoice();
      audio.stopSpeaking();
      ui.countryModal(quiz.byCode(t.getAttribute('data-code')));
    });
    ui.$('#again', m).addEventListener('click', function () { startGame(null); });
    var rw = ui.$('#retry-wrong', m);
    if (rw) rw.addEventListener('click', function () {
      startGame(summary.wrong.map(function (c) { return c.code; }));
    });
    ui.$('#home', m).addEventListener('click', renderHome);
  }

  /** 한 번 더 만난 나라의 여정을 돌아본다. 정답 기록은 따로 보존한다. */
  function reviewResultBlock() {
    var r = state.review;
    if (!r) return '';
    return '<div class="review-done"><span class="ic">📖</span><span class="body">' +
      '<span class="t">익숙한 나라를 한 번 더 만났어요</span>' +
      '<span class="d">오늘 본 국기는 여행책에서 언제든 펼쳐 볼 수 있어요</span></span></div>';
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
        '<span class="val">' + (lv.isMax ? '경험치 ' + FQ.progress.xp() : lv.into + ' / ' + lv.need) + '</span>' +
      '</div>' +
      '<div class="xp-bar"><i style="width:' + Math.round(lv.ratio * 100) + '%"></i></div>' +
    '</div>';
  }

  /* =================== 키보드 =================== */
  doc.addEventListener('keydown', function (ev) {
    if (!state.game) return;
    if (doc.querySelector('.modal-back') || doc.querySelector('.chest-back')) return;
    var tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    // 버튼에 포커스가 있으면 Enter/Space는 그 버튼의 원래 동작을 따른다.
    if ((ev.key === 'Enter' || ev.key === ' ') &&
        (tag === 'button' || tag === 'a' || tag === 'summary')) return;

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
      cancelPendingFeedback();
      stopTimer(); stopListening(); audio.stopSpeaking(); state.game = null;
      FQ.screens.dex();
    });
    doc.getElementById('nav-stats').addEventListener('click', function () {
      cancelPendingFeedback();
      stopTimer(); stopListening(); audio.stopSpeaking(); state.game = null;
      musicScreen('stats');
      FQ.screens.stats();
    });

    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) {
        cancelPendingFeedback();
        audio.stopSpeaking();
        if (state.game && !state.answered) {
          state.timerPaused = !!state.timerId;
          stopTimer();
        }
        stopListening();
      } else if (state.game && !state.answered) {
        if (state.timerPaused) {
          state.timerPaused = false;
          startTimer(state.timeLeft);
        }
        var q = state.game.current();
        if (q && q.mode === 'voice') {
          setListenState('다시 말하려면 마이크를 눌러 주세요.', 'off');
        }
      }
    });
    // 아이폰·아이패드는 사용자가 화면을 처음 만질 때만 소리를 열어 준다
    ['pointerdown', 'touchend', 'click', 'keydown'].forEach(function (evt) {
      doc.addEventListener(evt, function () {
        audio.unlock();
        if (FQ.music) FQ.music.unlock();
      }, { passive: true });
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

  FQ.app = { home: renderHome, boot: boot, startGame: startGame, musicScreen: musicScreen };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
