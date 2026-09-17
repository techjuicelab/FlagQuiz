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

  var DISCOVERIES = ['여행책에 한 장', '지도에 톡', '하나 더 만났어요', '깃발이 살랑'];

  // 첫 화면은 큰 놀이 단추 네 개뿐이다(2026-09-17 아이 기준 시안). 단추를 누르면 저장된 조건 그대로 바로 시작한다.
  // 순서는 늘 같다 — 글자를 못 읽는 아이는 자리로 단추를 기억하므로, 마지막에 고른 놀이를 앞으로 끌어오지 않는다.
  // 국기·그림 단추에는 세부 놀이 알약이 붙는다. 알약을 누르면 그 놀이로, 큰 단추는 마지막에 쓴 세부 놀이로 시작한다.
  // pill 은 아이패드(넓은 알약)의 이름, short 는 폰(좁은 알약)의 이름이다. 아이는 그림(emo)으로 고른다.
  var MODE_CARDS = [
    { id: 'choice4', group: 'flag', emo: '👀', title: '국기 보고 나라 고르기', pill: '국기 보고 고르기', short: '보고' },
    { id: 'reverse', group: 'flag', emo: '🔎', title: '나라 보고 국기 찾기', pill: '듣고 국기 찾기', short: '찾기' },
    { id: 'voice',   group: 'flag', emo: '🎤', title: '말로 답하기', pill: '말로 답하기', short: '말하기' },
    { id: 'typing',  group: 'flag', emo: '✏️', title: '이름 써서 맞히기', pill: '이름 써서 맞히기', short: '쓰기' },
    { id: 'symbol',  group: 'art', emo: '🎨', title: '그림 보고 나라 고르기', pill: '그림 보고 고르기', short: '그림' },
    { id: 'place',   group: 'art', emo: '🏞️', title: '명소 보고 나라 고르기', pill: '명소 보고 고르기', short: '명소' },
    { id: 'map',     group: 'map', emo: '🗺️', title: '지도에서 나라 찾기', pill: '지도', short: '지도' },
    { id: 'capital', group: 'capital', emo: '🏙️', title: '수도 듣고 국기 찾기', pill: '수도 듣기', short: '수도' }
  ];
  var PLAY_TILES = [
    { id: 'flag', emo: '🚩', title: '국기 놀이', pills: true },
    { id: 'art', emo: '🎨', title: '그림 놀이', pills: true },
    { id: 'map', emo: '🗺️', title: '지도 놀이', desc: '나라가 있는 자리를 찾아요' },
    { id: 'capital', emo: '🏙️', title: '수도 놀이', desc: '수도를 듣고 국기를 찾아요' }
  ];

  /** 둘이서 대결은 국기 축에서만 연다. 그림·명소·지도·수도는 어른이 압도적이라 아이가 매번 진다. */
  function duelAllowed(mode) {
    var m = quiz.MODES[mode];
    return !!m && m.axis === 'flag';
  }

  function modeCard(id) {
    for (var i = 0; i < MODE_CARDS.length; i++) if (MODE_CARDS[i].id === id) return MODE_CARDS[i];
    return null;
  }

  /** 놀이 단추 하나가 품은, 지금 켜져 있는 세부 놀이들. 그림 기능이 꺼지면 그림 단추는 비어서 숨는다. */
  function tileModes(tile) {
    return MODE_CARDS.filter(function (m) { return m.group === tile.id && quiz.availableMode(m.id) === m.id; });
  }

  /**
   * 큰 단추를 눌렀을 때 시작할 세부 놀이. 지금 고른 놀이가 그 단추 것이면 그대로,
   * 아니면 그 단추에서 마지막으로 쓴 놀이(settings.lastMode 버킷), 그것도 없으면 첫 번째.
   */
  function tileMode(tile, s) {
    var modes = tileModes(tile).map(function (m) { return m.id; });
    if (!modes.length) return null;
    if (modes.indexOf(s.mode) >= 0) return s.mode;
    var remembered = (s.lastMode || {})[tile.id];
    return modes.indexOf(remembered) >= 0 ? remembered : modes[0];
  }

  function playGrid(s) {
    var current = modeCard(s.mode);
    return '<div class="play-grid">' +
      PLAY_TILES.map(function (tile) {
        var modes = tileModes(tile);
        if (!modes.length) return '';
        var start = tileMode(tile, s);
        var pressed = !!current && current.group === tile.id;
        var desc = tile.desc || (modeCard(start) || {}).title || '';
        return '<div class="play-tile" data-play-tile="' + tile.id + '">' +
          '<button class="play-btn" id="play-' + tile.id + '" type="button" data-play="' + tile.id + '" aria-pressed="' + (pressed ? 'true' : 'false') + '">' +
            '<span class="play-emo" aria-hidden="true">' + tile.emo + '</span>' +
            '<span class="play-t">' + esc(tile.title) + '</span>' +
            '<span class="play-d">' + esc(desc) + '</span>' +
            (pressed ? '<span class="play-check" aria-hidden="true">✓</span>' : '') +
          '</button>' +
          (tile.pills
            ? '<div class="play-pills" data-tag="' + tile.emo + '">' + modes.map(function (m) {
                return '<button class="pill play-pill" type="button" data-mode="' + m.id + '" aria-pressed="' + (s.mode === m.id ? 'true' : 'false') + '" aria-label="' + esc(m.title) + '">' +
                  '<span aria-hidden="true">' + m.emo + '</span>' +
                  '<span class="lbl-l">' + esc(m.pill) + '</span><span class="lbl-s">' + esc(m.short) + '</span></button>';
              }).join('') + '</div>'
            : '') +
        '</div>';
      }).join('') +
    '</div>';
  }

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
    lastBadges: [],
    dadOpen: false          // 아빠 설정 패널이 펼쳐져 있는지. 저장하지 않는 화면 상태 — 홈을 새로 그리면 닫힌다.
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

  function playMusic(event, done, extra) {
    if (FQ.music) return FQ.music.play(event, Object.assign({ onDone: done, onFail: done }, extra || {}));
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
  /**
   * 아이 화면: 레벨 링 · 오늘의 도전 · 큰 놀이 단추 4개(+알약) · 여행 카드 다섯 칸 · '아빠 설정' 한 줄.
   * 어른 몫(이름·대결·난이도·대륙·문제 수·설정·제한 시간·대륙별 모으기·한 번 더 만나기)은 전부
   * 아빠 설정 패널에 접는다. 패널은 길게 눌러야 열리고, 홈을 새로 그리면 닫힌다
   * (opts.keepSettings 는 패널 안에서 조건을 바꿔 다시 그릴 때만 쓴다).
   */
  function renderHome(opts) {
    cancelPendingFeedback();
    stopTimer();
    stopListening();
    audio.stopSpeaking();
    state.game = null;
    state.dadOpen = !!(opts && opts.keepSettings) && state.dadOpen;
    var s = store.settings();
    if (s.mode !== quiz.availableMode(s.mode)) s = store.updateSettings({ mode: quiz.availableMode(s.mode) });
    musicScreen('home');
    var wrongCount = store.wrongList().length;
    var duel = s.players.length > 1;
    // 그림·명소·지도·수도 놀이에서는 대결 스위치를 감춘다. 저장된 두 이름은 그대로 두어 국기 놀이로 돌아오면 다시 보인다.
    var canDuel = duelAllowed(s.mode);
    var showDuel = duel && canDuel;
    var poolSize = quiz.pool({ level: s.level, continent: s.continent, axis: quiz.MODES[s.mode] && quiz.MODES[s.mode].axis }).length;

    var html =
      '<section class="screen home-kid">' +
        playerCard(s) +
        dailyCard() +
        playGrid(s) +
        travelRow() +

        '<button class="dad-open" id="dad-open" type="button" aria-expanded="' + (state.dadOpen ? 'true' : 'false') + '" aria-controls="dad-panel">' +
          GEAR_SVG +
          '<span class="dad-t">아빠 설정</span>' +
          '<span class="dad-d">이름 · 난이도 · 문제 수 · 소리</span>' +
          '<span class="spacer"></span>' +
          '<span class="dad-hint" id="dad-hint">길게 눌러 열어요</span>' +
          LOCK_SVG +
        '</button>' +

        '<div class="dad-panel" id="dad-panel"' + (state.dadOpen ? '' : ' hidden') + '>' +

        '<div class="card section">' +
          '<h3>누가 하나요?</h3>' +
          '<div class="field">' +
            '<label for="p1">이름</label>' +
            '<input class="text-input" id="p1" maxlength="10" value="' + esc(s.players[0] || '') + '" placeholder="민규">' +
          '</div>' +
          '<label class="switch' + (canDuel ? '' : ' hidden') + '" id="duel-switch"><input type="checkbox" id="duel"' + (duel ? ' checked' : '') + '> 둘이서 번갈아 대결하기</label>' +
          (canDuel ? '' : '<p class="small muted" id="duel-off-note" style="margin:8px 0 0">둘이서 대결하기는 국기 놀이에서 할 수 있어요.</p>') +
          '<p class="small muted' + (showDuel ? '' : ' hidden') + '" id="duel-note" style="margin:8px 0 0">' +
            '점수는 각자 따로 매기지만, 스티커·경험치·레벨은 <b id="duel-owner">' +
            esc(s.players[0] || '민규') + '</b> 것으로 쌓여요.</p>' +
          '<div class="field' + (showDuel ? '' : ' hidden') + '" id="p2-field" style="margin-top:10px">' +
            '<label for="p2">함께할 사람</label>' +
            '<input class="text-input" id="p2" maxlength="10" value="' + esc(s.players[1] || '아빠') + '" placeholder="아빠">' +
          '</div>' +
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
            '<label class="switch"><input type="checkbox" id="opt-bgm"' + (s.homeMusic ? ' checked' : '') + '> 🎵 홈과 도감 배경음</label>' +
            '<label class="switch"><input type="checkbox" id="opt-correct-music"' + (s.correctMusic ? ' checked' : '') + '> ✨ 정답에 다른 소리</label>' +
            '<label class="switch"><input type="checkbox" id="opt-review"' + (s.reviewFirst ? ' checked' : '') + '> 🔁 한 번 더 만날 나라를 자주</label>' +
          '</div>' +
          // 제한 시간은 국기 놀이에만 있다(D23). 다른 놀이를 고른 채 열면 줄을 감춘다(알약은 남겨 두어 저장값은 유지).
          '<div class="field" style="margin-top:12px' + (timedMode(s.mode) ? '' : ';display:none') + '">' +
            '<label for="opt-timer">제한 시간</label>' +
            '<div class="pill-grid">' +
              [0, 10, 20].map(function (t) {
                return '<button class="pill" type="button" data-timer="' + t + '" aria-pressed="' + (Number(s.timer) === t ? 'true' : 'false') + '">' +
                  (t === 0 ? '없음' : t + '초') + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          (s.mode === 'voice' ? voiceNotice() : '') +
        '</div>' +

        continentCard() +

        (wrongCount > 0
          ? '<button class="btn btn-big" id="review" type="button" style="width:100%">📖 한 번 더 만나기 (' +
              Math.min(wrongCount, 20) + '문제' + (wrongCount > 20 ? ' · 남은 ' + (wrongCount - 20) + '개는 다음에' : '') + ')</button>'
          : '') +

        '<button class="btn btn-ghost btn-big" id="dad-close" type="button" style="width:100%;margin-top:12px">✅ 설정 닫기</button>' +

        '</div>' +
      '</section>';

    var m = ui.setMain(html);

    // 아이 화면: 단추나 알약을 누르면 바로 시작한다. 별도 '시작하기'는 없다.
    ui.on(m, '[data-play]', 'click', function (e, t) {
      var tile = null;
      for (var i = 0; i < PLAY_TILES.length; i++) if (PLAY_TILES[i].id === t.getAttribute('data-play')) tile = PLAY_TILES[i];
      var mode = tile && tileMode(tile, store.settings());
      if (mode) startPlay(m, mode);
    });
    ui.on(m, '[data-mode]', 'click', function (e, t) {
      startPlay(m, t.getAttribute('data-mode'));
    });

    // 아빠 설정: 600ms 이상 길게 눌러야 열린다. 짧게 누르면 안내 글자만 바뀐다(읽어 주지 않는다 — 수아 음원에 없는 문구).
    longPress(ui.$('#dad-open', m), function () { openDadPanel(m); }, function () { nudgeDadHint(m); });
    var dadClose = ui.$('#dad-close', m);
    if (dadClose) dadClose.addEventListener('click', function () { savePlayers(m); renderHome(); });

    // 패널 안에서 조건을 바꾸면 다시 그리되 패널은 열어 둔다 — 알약 하나 누를 때마다 다시 길게 누르게 하지 않는다.
    ui.on(m, '[data-level]', 'click', function (e, t) {
      store.updateSettings({ level: t.getAttribute('data-level') });
      audio.play('click');
      renderHome({ keepSettings: true });
    });
    ui.on(m, '[data-continent]', 'click', function (e, t) {
      store.updateSettings({ continent: t.getAttribute('data-continent') });
      audio.play('click');
      renderHome({ keepSettings: true });
    });
    ui.on(m, '[data-count]', 'click', function (e, t) {
      var v = t.getAttribute('data-count');
      store.updateSettings({ count: v === 'all' ? 'all' : parseInt(v, 10) });
      audio.play('click');
      renderHome({ keepSettings: true });
    });
    ui.on(m, '[data-timer]', 'click', function (e, t) {
      store.updateSettings({ timer: parseInt(t.getAttribute('data-timer'), 10) });
      audio.play('click');
      renderHome({ keepSettings: true });
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
        keepFlagAxisMode();
        renderHome();
      });
    }

    // 대륙별 모으기 항목을 누르면 스티커 판의 그 대륙으로 간다
    ui.on(m, '[data-cont-go]', 'click', function (e, t) {
      FQ.screens.dex(t.getAttribute('data-cont-go'));
    });

    var reviewBtn = ui.$('#review', m);
    if (reviewBtn) {
      reviewBtn.addEventListener('click', function () {
        savePlayers(m);
        keepFlagAxisMode();
        startGame(store.wrongList());
      });
    }
  }

  var GEAR_SVG = '<svg class="dad-ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  var LOCK_SVG = '<svg class="dad-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  var LONG_PRESS_MS = 600;

  /**
   * 놀이 단추·알약 → 바로 시작. 고른 세부 놀이를 settings.mode 에, 단추별 마지막 세부 놀이를
   * settings.lastMode 버킷({ flag: 'voice', art: 'place' })에 남겨 다음에 큰 단추만 눌러도 같은 놀이로 간다.
   */
  function startPlay(m, mode) {
    if (quiz.availableMode(mode) !== mode) return;
    var card = modeCard(mode);
    var last = Object.assign({}, store.settings().lastMode || {});
    if (card) last[card.group] = mode;
    savePlayers(m);
    store.updateSettings({ mode: mode, lastMode: last });
    startGame(null);
  }

  /**
   * 길게 누르기. pointerdown(없으면 touchstart/mousedown)에서 시계를 걸고, 떼거나 움직이거나 취소되면 푼다.
   * 시계가 다 되면 onLong, 그 전에 떼어 click 이 오면 onShort. 길게 눌러 열린 뒤 따라오는 click 은 무시한다.
   */
  function longPress(el, onLong, onShort) {
    if (!el) return;
    var timer = null, fired = false, startX = 0, startY = 0;
    function clear() { if (timer) global.clearTimeout(timer); timer = null; }
    function down(ev) {
      if (ev && ev.button > 0) return;
      var p = ev && ev.touches && ev.touches[0] ? ev.touches[0] : ev || {};
      startX = p.clientX || 0; startY = p.clientY || 0;
      fired = false;
      clear();
      timer = global.setTimeout(function () { timer = null; fired = true; onLong(); }, LONG_PRESS_MS);
    }
    function move(ev) {
      if (!timer) return;
      var p = ev && ev.touches && ev.touches[0] ? ev.touches[0] : ev || {};
      if (Math.abs((p.clientX || 0) - startX) > 12 || Math.abs((p.clientY || 0) - startY) > 12) clear();
    }
    var hasPointer = !!global.PointerEvent;
    el.addEventListener(hasPointer ? 'pointerdown' : 'touchstart', down, { passive: true });
    el.addEventListener(hasPointer ? 'pointermove' : 'touchmove', move, { passive: true });
    ['pointerup', 'pointercancel', 'pointerleave', 'touchend', 'touchcancel'].forEach(function (evt) {
      el.addEventListener(evt, clear);
    });
    if (!hasPointer) el.addEventListener('mousedown', down);
    el.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    el.addEventListener('click', function () {
      clear();
      if (fired) { fired = false; return; }
      onShort();
    });
    // 자판으로 쓰는 어른을 위해 Enter/Space 를 1초 이상 누르면 열린다 (키를 누르고 있으면 keydown 이 반복된다).
    el.addEventListener('keydown', function (ev) {
      if ((ev.key === 'Enter' || ev.key === ' ') && !timer && !fired) { ev.preventDefault(); down(ev); }
      else if (ev.key === 'Enter' || ev.key === ' ') ev.preventDefault();
    });
    el.addEventListener('keyup', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var was = !!timer;
      clear();
      if (fired) { fired = false; return; }
      if (was) onShort();
    });
  }

  function openDadPanel(m) {
    state.dadOpen = true;
    var panel = ui.$('#dad-panel', m);
    var opener = ui.$('#dad-open', m);
    if (panel) { panel.hidden = false; panel.classList.add('is-open'); }
    if (opener) opener.setAttribute('aria-expanded', 'true');
    var hint = ui.$('#dad-hint', m);
    if (hint) hint.textContent = '열렸어요';
    audio.play('click');
    var first = ui.$('#p1', m);
    if (first && first.scrollIntoView) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  var nudgeTimer = null;
  function nudgeDadHint(m) {
    var hint = ui.$('#dad-hint', m);
    var opener = ui.$('#dad-open', m);
    if (!hint) return;
    hint.textContent = '길게 눌러 주세요';
    if (opener) opener.classList.add('nudge');
    if (nudgeTimer) global.clearTimeout(nudgeTimer);
    nudgeTimer = global.setTimeout(function () {
      nudgeTimer = null;
      if (opener) opener.classList.remove('nudge');
      if (!state.dadOpen) hint.textContent = '길게 눌러 열어요';
    }, 1400);
  }

  /** 홈 위쪽: 지금 레벨을 링 하나와 경험치 막대로 */
  function playerCard(s) {
    var lv = FQ.progress.level();
    return '<div class="player-card">' +
      '<span class="level-ring" title="레벨 ' + lv.number + '">' +
        '<span class="track" style="--p:' + lv.ratio.toFixed(3) + '"></span>' +
        '<span class="hole">' + lv.emoji + '</span>' +
      '</span>' +
      '<span class="player-meta">' +
        '<span class="player-top">' +
          '<span class="player-name">' + esc(s.players[0] || '친구') + '</span>' +
          '<span class="player-level">' + esc(lv.name) + '</span>' +
          '<span class="player-xp">' + (lv.isMax ? '✨ ' + FQ.progress.xp() : lv.into + ' / ' + lv.need) + '</span>' +
        '</span>' +
        '<span class="player-bar"><i style="width:' + Math.round(lv.ratio * 100) + '%"></i></span>' +
      '</span>' +
    '</div>';
  }

  /** 홈: 여행 카드 다섯 칸. 퀴즈의 상자 진행(chestProgress)과 같은 수를 보여 준다 — 칸이 차면 🎁. */
  function travelRow() {
    var chest = FQ.progress.chestProgress(store.stats().asked);
    var slots = '';
    for (var i = 0; i < chest.need; i++) {
      slots += '<span class="travel-slot' + (i < chest.into ? ' filled' : '') + '">' + (i < chest.into ? '✓' : '') + '</span>';
    }
    return '<div class="travel-row" id="travel-row" aria-label="여행 카드 ' + chest.into + ' / ' + chest.need + '장">' +
      '<span class="travel-ic" aria-hidden="true">📖</span>' +
      '<span class="travel-slots" aria-hidden="true">' + slots + '</span>' +
      '<span class="travel-num">' + chest.into + ' / ' + chest.need + '</span>' +
      '<span class="travel-ic" aria-hidden="true">🎁</span>' +
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

  /**
   * 오늘의 도전은 국기 기록만 센다.
   * 지도·그림·명소·수도 놀이는 축이 'flag' 가 아니라 아무리 맞혀도 칸이 오르지 않는다(의도된 설계).
   * 아이가 이유를 알 길이 없으니, 대륙이 어긋났을 때처럼 왜 멈춰 있는지 화면에 알려 준다.
   * 이 글자는 보여 주기만 하고 읽어 주지 않는다 — 수아 음원에 없는 문구다.
   */
  function dailyWhy(d, s) {
    if (d.complete) return '';
    // 국기 놀이가 아니면 대륙을 맞춰도 소용없다. 놀이부터 바꿔야 한다고 먼저 알려 준다.
    if (quiz.MODES[s.mode] && quiz.MODES[s.mode].axis !== 'flag') {
      return '지금 놀이로는 칸이 안 올라가요 · 눌러서 국기 놀이로 바꾸기';
    }
    // 고른 대륙이 오늘의 대륙과 다르면 도전은 한 칸도 오르지 않는다.
    if (s.continent !== 'all' && s.continent !== d.continent) {
      return '지금은 ' + s.continent + '만 나와서 오르지 않아요 · 눌러서 ' + d.continent + withParticle(d.continent) + ' 바꾸기';
    }
    return '';
  }

  /** 홈: 오늘의 도전 */
  /** 받침이 있으면 '으로', 없으면 '로'. '유럽로' 같은 글자를 아이에게 보이지 않는다. */
  function withParticle(word) {
    var last = String(word || '').slice(-1);
    var code = last.charCodeAt(0);
    if (!(code >= 0xAC00 && code <= 0xD7A3)) return '로';
    return (code - 0xAC00) % 28 === 0 ? '로' : '으로';
  }

  function dailyCard() {
    var d = FQ.progress.daily();
    var s = store.settings();
    var why = dailyWhy(d, s);
    return '<button class="daily-card" id="daily-go" type="button">' +
      '<span class="ic">' + (d.complete ? '🏆' : '🎯') + '</span>' +
      '<span class="body">' +
        '<span class="t">' +
          (d.complete
            ? '오늘의 도전을 끝냈어요!'
            : '오늘의 도전 · ' + esc(d.continent) + ' 나라 ' + d.target + '개 맞히기') +
        '</span>' +
        (why ? '<span class="daily-why">' + esc(why) + '</span>' : '') +
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

  /**
   * 오늘의 도전과 '한 번 더 만나기'는 국기 기록을 쓴다.
   * 지도·그림·명소·수도 놀이는 축이 달라 한 칸도 쌓이지 않으니 국기 놀이로 되돌린다.
   * 말하기·쓰기·나라 보고 국기 찾기는 이미 국기 축이므로 아이가 고른 그대로 둔다.
   */
  function keepFlagAxisMode() {
    var cur = quiz.MODES[store.settings().mode];
    if (!cur || cur.axis !== 'flag') store.updateSettings({ mode: 'choice4' });
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
    if (s.mode !== quiz.availableMode(s.mode)) s = store.updateSettings({ mode: quiz.availableMode(s.mode) });
    var reviewing = !!(onlyCodes && onlyCodes.length && quiz.MODES[s.mode].axis === 'flag');
    state.review = reviewing
      ? { asked: Math.min(onlyCodes.length, 20), before: store.wrongList().length }
      : null;
    audio.setEnabled(s.sound);
    audio.setSpeakEnabled(s.speak);
    audio.unlock();
    if (FQ.music) FQ.music.unlock();
    musicScreen('quiz');
    // 대결 스위치가 켜져 있어도 그림·명소·지도·수도 놀이는 혼자 논다 (홈에서 스위치를 감추는 것과 같은 규칙).
    var players = duelAllowed(s.mode) ? s.players : s.players.slice(0, 1);
    state.game = quiz.createGame({
      mode: s.mode,
      level: s.level,
      continent: s.continent,
      count: onlyCodes && onlyCodes.length ? Math.min(onlyCodes.length, 20) : s.count,
      players: players,
      reviewFirst: s.reviewFirst,
      only: onlyCodes && onlyCodes.length ? onlyCodes : null
    });
    state.lastBadges = [];
    state.xpGained = 0;
    state.newStickers = [];
    state.unscored = 0;        // 점수 없이 지나간 문제 수 (그림 실패·새 축 시간 초과). 총 문항에서 뺀다.
    state.answeredCodes = {};  // 이 판에서 실제로 채점한 나라. 결과의 '오늘 만난 나라'는 문제 수가 아니라 나라 수다.
    state.met = [];            // 이 판에서 채점한 순서대로 { country, correct }. 여행 카드 칸과 결과의 카드 다섯 장이 읽는다(저장 안 함).
    state.chestsOpened = 0;    // 이 판에서 열린 깜짝 상자 수. 결과 화면의 🎁 카드만 읽는다.
    state.chestLoot = [];      // 이 판에서 연 상자의 { kind, score, xp } — 결과 화면 합계용(저장 안 함).
    renderQuiz();
    // 말하기는 클릭한 순간 바로 마이크를 연다. 시작 음악보다 듣기를 우선한다.
    if (s.mode !== 'voice') playMusic('start');
  }

  /** 이 판에서 만난 나라를 순서대로 적어 둔다. 같은 나라를 다시 만나면(재만남 엔진) 마지막 결과로 바꾼다. 화면용이며 저장하지 않는다. */
  function noteMet(country, correct) {
    var met = state.met || (state.met = []);
    for (var i = 0; i < met.length; i++) {
      if (met[i].country.code === country.code) { met[i].correct = correct; return; }
    }
    met.push({ country: country, correct: correct });
  }

  /* 화면 글자 대신 쓰는 선 그림. 읽어 주는 문구가 아니라 눈으로 보는 표시라 수아 음원과 무관하다. */
  var ICONS = {
    back: '<svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m11 18-6-6 6-6"/></svg>',
    bulb: '<svg class="ic" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></svg>',
    hand: '<svg class="ic" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
    check: '<svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
    again: '<svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 1 3 6.7"/><path d="M3 22v-6h6"/></svg>',
    home: '<svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 12 3l9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
    replay: '<svg class="ic" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>'
  };

  /** 문제 화면 위의 여행 카드 칸 다섯 개. 홈의 travelRow 와 같은 수(chestProgress)를 보여 주되, 이 판에서 만난 나라는 국기로 채운다. */
  function travelSlots(chest, highlightNext) {
    var met = state.met || [];
    var html = '';
    for (var i = 0; i < chest.need; i++) {
      var filled = i < chest.into;
      // 채워진 칸 중 뒤쪽 met.length 칸이 이 판에서 만난 나라다(앞쪽은 지난 판에서 모은 카드).
      var fromThisGame = filled ? met.length - (chest.into - i) : -1;
      var entry = fromThisGame >= 0 ? met[fromThisGame] : null;
      var cls = 'travel-slot' + (filled ? ' filled' : '') + (highlightNext && i === chest.into ? ' now' : '');
      html += '<span class="' + cls + '">' +
        (entry ? '<img src="' + ui.flagSrc(entry.country.code) + '" alt="">' : (filled ? '✓' : '')) +
      '</span>';
    }
    return html;
  }

  /** 문제 화면 머리: 그만하기 · 여행 카드 알약(#combo-title 유지) · 레벨 알약(아이패드만 보임, #xp-fill·#xp-val 유지). */
  function quizHead(g, s, chest, lv) {
    var duel = g.players.length > 1;
    return '<div class="quiz-head kid-head">' +
      '<button class="btn btn-sm btn-ghost head-back" id="quit" type="button">' + ICONS.back + '<span>그만하기</span></button>' +
      '<span class="chip q-count">' + (g.index + 1) + ' / ' + g.total + '</span>' +
      (duel ? '<span class="chip turn">' + esc(g.currentPlayer()) + ' 차례</span>' : '') +
      (s.timer && timedMode(g.current().mode) ? '<span class="chip" id="timer-chip">⏱ ' + s.timer + '</span>' : '') +
      '<span class="spacer"></span>' +
      '<span class="chip travel-chip" role="group" aria-label="여행 카드 ' + chest.into + ' / ' + chest.need + '장">' +
        '<span class="travel-ic" aria-hidden="true">📖</span>' +
        '<span class="combo-title" id="combo-title">여행 카드 ' + chest.into + ' / ' + chest.need + '장</span>' +
        '<span class="travel-slots" aria-hidden="true">' + travelSlots(chest, true) + '</span>' +
        '<span class="travel-ic travel-gift" aria-hidden="true">🎁</span>' +
      '</span>' +
      '<span class="chip lv-chip" role="group" aria-label="' + esc(lv.name) + ' ' + (lv.isMax ? '최고 레벨' : lv.into + ' / ' + lv.need) + '">' +
        '<span aria-hidden="true">' + lv.emoji + '</span>' +
        '<span class="lv-name">' + esc(lv.name) + '</span>' +
        '<span class="lv-bar"><i id="xp-fill" style="width:' + Math.round(lv.ratio * 100) + '%"></i></span>' +
        '<span class="lv-val" id="xp-val">' + (lv.isMax ? '최고 레벨' : lv.into + ' / ' + lv.need) + '</span>' +
      '</span>' +
    '</div>';
  }

  /** 🔊 들어보기 큰 단추. 폰 56px·아이패드 64px 노란 단추 — 지시문보다 소리가 주인공이다. 라벨은 speakLines 가 textContent 로 바꾸므로 글자 그대로 둔다. */
  function listenButton(text, extra, id) {
    return '<button class="btn btn-listen"' + (id ? ' id="' + id + '"' : '') + ' data-speak="' + esc(text) + '"' +
      (extra ? ' data-speak-extra="' + esc(extra) + '"' : '') + ' type="button">🔊 들어보기</button>';
  }

  /** 그 축으로 한 번도 만나지 않은 나라인지 읽기만 한다. 조회로 빈 기록을 만들지 않는다(도감 원칙과 같다).
   * 그림·명소는 그림이 있어야 만나기 카드를 낼 수 있고, 수도는 194개국 모두 자료가 있다. */
  function needsMeet(q) {
    if (q.mode !== 'capital' && !artFor(q.country.code, q.mode)) return false;
    var records = store.allAxisStats ? store.allAxisStats(q.mode) : {};
    var r = records && records[q.country.code];
    return !r || !(r.seen > 0);
  }

  /** 🔊 단추 하나로 이름을 읽는다. data-speak 문구 뒤에 data-speak-extra 문구가 있으면 이어서 읽는다. */
  function speakFromButton(t) {
    var lines = [t.getAttribute('data-speak')];
    var extra = t.getAttribute('data-speak-extra');
    if (extra) lines.push(extra);
    speakLines(t, lines, t.getAttribute('data-label') || '🔊 들어보기');
  }

  function speakLines(t, lines, label) {
    // 읽어주기가 꺼져 있으면 눌러도 아무 일이 없었다. 켜 주고 바로 읽는다.
    if (!store.settings().speak) {
      store.updateSettings({ speak: true });
      audio.setSpeakEnabled(true);
      var chip = ui.$('#listen-tip') || ui.$('#heard');
      if (chip) chip.textContent = '읽어주기를 켰어요';
    }
    if (state.cancelFeedbackVoice) state.cancelFeedbackVoice();
    stopMusic();
    var generation = state.feedbackGeneration;
    var cancelled = false;
    state.cancelFeedbackVoice = function () { cancelled = true; };
    function nameCurrent() {
      return !cancelled && generation === state.feedbackGeneration && !doc.hidden;
    }
    t.classList.remove('needs-tap');
    t.textContent = label;
    audio.stopSpeaking();
    FQ.speech.stopAnd(function () {
      if (!nameCurrent()) return;
      audio.say(lines, {}, function () {
        if (!nameCurrent()) return;
        t.classList.add('needs-tap');
        t.textContent = '🔊 다시 눌러서 듣기';
      });
    });
  }

  /* =================== 퀴즈 화면 =================== */
  function renderQuiz() {
    cancelPendingFeedback();
    var g = state.game;
    if (!g || g.isOver()) return finishGame();
    state.answered = false;
    state.artUnavailable = false;
    state.usedHint = false;
    state.removed = [];
    state.timedOut = false;
    state.timerPaused = false;
    state.listenFailures = 0;

    var q = g.current();
    var s = store.settings();
    var duel = g.players.length > 1;
    // 처음 만나는 그림·명소·수도는 채점 전에 먼저 알려 준다(2026-09-17). 그 축의 기록이 없는 나라만, 문제마다 한 번.
    var meet = (q.mode === 'symbol' || q.mode === 'place' || q.mode === 'capital') && state.metQuestion !== q && needsMeet(q);

    var stage;
    if (q.mode === 'symbol' || q.mode === 'place') {
      var art = artFor(q.country.code, q.mode);
      // 그림 없는 나라는 출제 풀에서 걸러진다. 그래도 옛 자료와 새 화면이 섞여 캐시에 굳으면
      // 여기에 닿을 수 있다 — 그때 죽으면 아이가 시작을 눌러도 화면이 멈춘 채 아무 일도 안 난다.
      // 기다릴 그림이 아예 없으면 잠그지 않는다. 아이가 건너뛸 수 있어야 한다.
      state.artUnavailable = !!art;
      // 그림 이름은 수아 음원으로 읽어 준다(2026-09-17 추가). 글자를 못 읽는 아이가 이름을 듣고 고른다.
      var stageArtName = artAlt(q.country.code, q.mode);
      // 그림을 못 받았을 때의 화면은 글자를 못 읽는 아이가 봐도 알 수 있어야 한다 — 큰 그림 하나, 큰 단추 하나.
      // 읽어 주는 것은 수아 음원에 이미 있는 그림 이름뿐이다(만나기 카드에서는 그 이름이 이미 아래에 있으니 빼지 않아도 된다).
      var artErrorBody = '<div class="art-error-emoji" aria-hidden="true">🖼️</div><p>그림을 불러오지 못했어요.</p>';
      var artImage = art ? '<img id="question-art" src="' + esc(art.src) + '" alt="' + esc(art.alt) + '" width="1024" height="768">' +
          '<p id="art-loading" role="status">그림을 불러오고 있어요…</p>' +
          '<div id="art-error" class="art-error" hidden>' + artErrorBody +
            '<button class="btn btn-primary btn-big" id="art-retry" type="button">🔄 다시 불러오기</button>' +
            (stageArtName && !meet ? '<button class="btn btn-big" data-speak="' + esc(stageArtName) + '" type="button">🔊 그림 이름 듣기</button>' : '') +
          '</div>'
          : '<div id="art-error" class="art-error">' + artErrorBody + '</div>';
      stage = meet
        // 처음 만나는 그림은 문제보다 먼저 알려 준다. 나라 이름과 그림 이름을 함께 듣고 나서 같은 나라를 문제로 만난다.
        // 그림과 이름·단추를 따로 감싼다 — 아이패드 가로에서는 둘을 나란히 놓아야 단추가 한 화면에 들어온다.
        // 시안(PhonePlay): 국기 74×56 + 이름 36px, 그림 이름은 파란 알약, 🔊 다시 듣기 56px, '문제 풀어 볼게요' 64px 노란 단추.
        ? '<div class="flag-stage art-question meet-card"><div class="q-label">처음 만나는 나라예요 · 먼저 들어 볼까요?</div>' +
          '<div class="meet-art">' + artImage + '</div>' +
          '<div class="meet-body">' +
          '<div class="big-name"><img class="map-question-flag" src="' + ui.flagSrc(q.country.code) + '" alt="' + esc(q.country.ko) + ' 국기"> ' + esc(q.country.ko) + '</div>' +
          '<div class="meet-caption">' + esc(stageArtName) + '</div>' +
          '<button class="btn btn-listen btn-listen-soft" id="meet-speak" data-speak="' + esc(q.country.ko) + '" data-speak-extra="' + esc(stageArtName) + '" data-label="🔊 다시 듣기" type="button">🔊 다시 듣기</button>' +
          '<button class="btn btn-big btn-go btn-yellow" id="meet-next" type="button">문제 풀어 볼게요 →</button>' +
          '</div></div>'
        : '<div class="flag-stage art-question"><div class="q-label">' +
          (q.mode === 'place' ? '이 명소가 있는 나라는 어디일까요?' : '이 그림은 어느 나라를 떠올리게 하나요?') + '</div>' +
          artImage +
          (stageArtName ? listenButton(stageArtName) : '') + '</div>';
    } else if (q.mode === 'map') {
      // 시안(PhoneMap): 국기 120×80 과 이름을 한 줄에, 아래에 🔊 전폭. 아이패드 세로에서는 국기·이름·🔊 가 한 줄 카드가 된다(css).
      stage = '<div class="flag-stage map-question">' +
        '<div class="q-label">🗺️ 이 나라는 어디에 있을까요?</div>' +
        '<div class="map-who">' +
          '<img class="map-question-flag" src="' + ui.flagSrc(q.country.code) + '" alt="' + esc(q.country.ko) + ' 국기">' +
          '<div class="big-name">' + esc(q.country.ko) + '</div>' +
        '</div>' +
        listenButton(q.country.ko) + '</div>';
    } else if (q.mode === 'reverse') {
      stage =
        '<div class="flag-stage">' +
          '<div class="q-label">이 나라의 국기를 찾아보세요</div>' +
          '<div class="big-name">' + esc(q.country.ko) + '</div>' +
          listenButton(q.country.ko) +
        '</div>';
    } else if (q.mode === 'capital') {
      // 수도 놀이를 뒤집었다(2026-09-17 시안 PhoneCapital, D17 채택 B): 글자를 못 읽는 아이가 수도 이름을 '듣고' 국기 4장에서 나라를 찾는다.
      // 큰 🔊 (폰 88px 노란 단추)가 수도 이름 음원(voice-manifest 의 c.capital)을 읽고, 아래에 보조 글자로 수도 이름, 위에 작은 지시문.
      // 문제가 뜨면 수도 이름을 한 번 자동으로 읽는다(만나기 카드와 같은 speakLines — 실패하면 '다시 눌러서 듣기'로 바뀐다).
      // 처음 만나는 나라는 국기·나라 이름·수도 이름을 먼저 보여 주고 [수도, '나라의 수도예요'] 를 읽는다 — 둘 다 기존 음원이다.
      stage = meet
        ? '<div class="flag-stage meet-card capital-meet"><div class="q-label">처음 만나는 나라예요 · 먼저 들어 볼까요?</div>' +
          '<div class="meet-art"><img class="flag-img" src="' + ui.flagSrc(q.country.code) + '" alt="' + esc(q.country.ko) + ' 국기"></div>' +
          '<div class="meet-body">' +
          '<div class="big-name">' + esc(q.country.ko) + '</div>' +
          '<div class="meet-caption">🏙️ ' + esc(q.country.capital) + '</div>' +
          '<button class="btn btn-listen btn-listen-soft" id="meet-speak" data-speak="' + esc(q.country.capital) + '" data-speak-extra="' + esc(q.country.ko + '의 수도예요') + '" data-label="🔊 다시 듣기" type="button">🔊 다시 듣기</button>' +
          '<button class="btn btn-big btn-go btn-yellow" id="meet-next" type="button">문제 풀어 볼게요 →</button>' +
          '</div></div>'
        : '<div class="flag-stage capital-question">' +
          '<div class="q-label">🏙️ 어느 나라의 수도일까요?</div>' +
          // 88px 는 이 단추만의 크기라 인라인으로 둔다(.btn-listen 은 폰 56px·아이패드 64px). 라벨은 speakLines 가 textContent 로 바꾸므로 글자 그대로.
          '<button class="btn btn-listen capital-listen" id="capital-listen" data-speak="' + esc(q.country.capital) + '" data-label="🔊 눌러서 들어보기" type="button">🔊 눌러서 들어보기</button>' +
          '<div class="big-name capital-name muted">' + esc(q.country.capital) + '</div>' +
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

    // 진행 점 대신 여행 카드 칸 다섯 개(홈과 같은 chestProgress)가 머리에 있다. 정답 카드는 무대 아래(첫 칸)에 그려
    // 폰에서는 무대·보기를 접고 카드만 남기고, 아이패드 가로에서는 오른쪽 보기(지도 핀)를 남긴 채 왼쪽에 카드를 놓는다(css).
    var html =
      '<section class="screen quiz-screen">' +
        quizHead(g, s, chest, lv) +
        '<div class="quiz-body' + (q.mode === 'map' ? ' map-quiz' : '') + (meet ? ' meet-quiz' : '') + '">' +
          '<div class="quiz-stage-col">' + stage + '<div id="feedback-area"></div></div>' +
          '<div class="quiz-answer-col">' +
            '<div id="answer-area"' + (meet ? ' hidden' : '') + '>' + answerArea(q) + '</div>' +
            '<div class="row tool-row"' + (meet ? ' style="display:none"' : '') + '>' +
              '<button class="btn btn-sm btn-tool" id="hint" type="button">' + ICONS.bulb + '<span>힌트</span></button>' +
              '<button class="btn btn-sm btn-tool btn-tool-soft" id="skip" type="button">' + ICONS.hand + '<span>몰라요</span></button>' +
            '</div>' +
            '<div id="hint-area"></div>' +
          '</div>' +
        '</div>' +
      '</section>';

    var m = ui.setMain(html);
    // 지도 판은 폰 세로에서 위아래로 늘려 그린다(css .map-surface). 육지 svg 가 판을 꽉 채우도록 비율 고정을 푼다 —
    // 핀은 판의 % 좌표라 육지와 함께 늘어나므로 좌표 공식은 그대로다. 판이 2:1 인 곳에서는 아무 변화가 없다.
    var land = ui.$('.map-land', m);
    if (land && land.setAttribute) land.setAttribute('preserveAspectRatio', 'none');

    ui.on(m, '[data-speak]', 'click', function (e, t) { speakFromButton(t); });

    if (meet) {
      // 만나기 카드: 채점 없이 나라 이름과 그림 이름을 들려주고, 아이가 누르면 같은 나라를 문제로 낸다.
      state.meeting = true;
      ui.$('#meet-next', m).addEventListener('click', function () {
        if (state.game !== g || g.current() !== q) return;
        state.metQuestion = q;
        state.meeting = false;
        audio.stopSpeaking();
        renderQuiz();
      });
      speakLines(ui.$('#meet-speak', m),
        q.mode === 'capital' ? [q.country.capital, q.country.ko + '의 수도예요'] : [q.country.ko, artAlt(q.country.code, q.mode)],
        '🔊 다시 듣기');
    } else {
      state.meeting = false;
      // 수도 문제는 글자가 아니라 소리가 문제다. 뜨자마자 수도 이름을 한 번 읽어 준다(실패하면 단추가 '다시 눌러서 듣기'로 바뀐다).
      if (q.mode === 'capital') speakLines(ui.$('#capital-listen', m), [q.country.capital], '🔊 눌러서 들어보기');
    }
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
    ui.$('#skip', m).addEventListener('click', function () {
      if (state.artUnavailable) return skipUnscored();
      submit({ text: '' }, true);
    });

    bindAnswerArea(m, q);
    var questionArt = ui.$('#question-art', m);
    if ((q.mode === 'symbol' || q.mode === 'place') && questionArt) {
      function artState(status) {
        if (state.game !== g || g.current() !== q || state.answered) return;
        var unavailable = status !== 'ready';
        state.artUnavailable = unavailable;
        ui.$('#art-error', m).hidden = status !== 'error';
        ui.$('#art-loading', m).hidden = status !== 'loading';
        questionArt.hidden = status === 'error';
        ui.$$('.answer-btn', m).forEach(function (button) {
          button.disabled = unavailable || state.removed.indexOf(button.getAttribute('data-code')) !== -1;
        });
        // 보기는 잠가도 빠져나갈 길은 절대 잠그지 않는다. 아이는 차 안에서 비행기 모드로 논다 —
        // 그림을 못 받는 동안 '모르겠어요' 까지 잠기면 그 문제에 갇혀 아무것도 못 한다.
        ui.$('#skip', m).disabled = false;
        ui.$('#hint', m).disabled = state.usedHint;
        if (unavailable) stopTimer();
        else if (s.timer && !state.timerId && !meet) startTimer();
      }
      questionArt.addEventListener('error', function () { artState('error'); });
      questionArt.addEventListener('load', function () { artState('ready'); });
      ui.$('#art-retry', m).addEventListener('click', function () { artState('loading'); questionArt.src = art.src; });
      artState(questionArt.complete ? (questionArt.naturalWidth > 0 ? 'ready' : 'error') : 'loading');
    }
    preloadNext();
    if (!meet && !state.artUnavailable && !state.timerId) startTimer();

    if (q.mode === 'voice') {
      state.listenOn = true;
      audio.stopSpeaking();
      // 단추를 누른 그 흐름 안에서 시작해야 사파리가 마이크 권한을 다시 묻지 않는다.
      // 늦게(setTimeout) 시작하면 사용자가 누른 동작과 끊겨 매번 허용을 물어본다.
      startListening();
    }
  }

  /** 그림 소재를 읽는다. 옛 js/ui.js 가 캐시에 섞여도 죽지 않도록 여기서 한 번 더 막는다.
   * 지금 공개된 판(704be52)의 ui.js 에는 artFor 도 artAlt 도 없다. 배포가 바뀌는 잠깐 사이에
   * 새 app.js 와 옛 ui.js 가 함께 굳으면 그림 문제 렌더가 통째로 터져 화면이 멈춘다. */
  function artSubject(code, axis) {
    var key = axis === 'place' ? 'place' : 'symbol';
    var subject = FQ.subjects && FQ.subjects[code] && FQ.subjects[code][key];
    return subject && !subject.noArt ? subject : null;
  }

  function artFor(code, axis) {
    if (ui.artFor) return ui.artFor(code, axis);
    var subject = artSubject(code, axis);
    if (!subject) return null;
    return { src: 'images/' + (axis === 'place' ? 'places/' : 'symbols/') + code + '.webp', alt: subject.ko };
  }

  function artAlt(code, axis) {
    if (ui.artAlt) return ui.artAlt(code, axis);
    var key = axis === 'place' ? 'place' : 'symbol';
    var subject = FQ.subjects && FQ.subjects[code] && FQ.subjects[code][key];
    return subject ? subject.ko : '';
  }

  function answerArea(q) {
    if (q.mode === 'map') return FQ.map.render(q.options);
    if (q.mode === 'symbol' || q.mode === 'place' || q.mode === 'capital') {
      // 보기는 국기가 주인공이다(시안 IpadPlay·PortraitPlay·PhoneCapital): 2×2 격자, 국기 폭 폰 96px 이상·아이패드 200px 이상, 이름은 국기 아래 작게.
      // 수도 놀이도 같은 부품을 쓴다 — 수도 이름은 무대에서 듣고, 보기에는 국기와 나라 이름만 있다. 답은 나라 code 로 채점한다.
      return '<div class="answer-grid art-grid">' + q.options.map(function (c) {
        return '<button class="answer-btn art-choice" type="button" data-code="' + c.code + '">' +
          '<img src="' + ui.flagSrc(c.code) + '" alt="" width="160" height="120"><span class="art-choice-name">' + esc(c.ko) + '</span></button>';
      }).join('') + '</div>';
    }
    if (q.mode === 'choice4') {
      return '<div class="answer-grid">' + q.options.map(function (c, i) {
        return '<button class="answer-btn" type="button" data-code="' + c.code + '">' +
          '<span class="muted small">' + (i + 1) + '</span> ' + esc(c.ko) + '</button>';
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
    // 힌트는 소재 이름과 대륙이라 글자뿐이다. 그림을 못 받아도 아이에게 줄 수 있다.
    if (state.answered) return;
    var q = state.game.current();
    state.usedHint = true;
    var box = ui.$('#hint-area');
    var lines = [];
    if (q.mode === 'symbol' || q.mode === 'place') {
      // 소재 이름에 나라 이름이 들어 있으면('레바논 삼나무', '파나마 운하') 그 줄이 곧 정답이다. 그때는 이름 줄을 뺀다.
      var artName = artAlt(q.country.code, q.mode);
      if (artName && !revealsCountry(artName, q.country)) lines.push(esc(artName));
      lines.push('🗺️ ' + esc(q.country.continent) + '에 있는 나라예요');
    } else if (q.mode === 'map') {
      lines.push('🗺️ ' + esc(q.country.continent) + ' · ' + esc(q.country.region) + '에서 찾아보세요');
    } else if (q.mode === 'capital') {
      // 보기가 국기라 국기 힌트는 곧 정답이다. 대륙·지역 단서 + 오답 2개 지우기(아래 공통) + 수도 이름 다시 읽기(기존 음원).
      lines.push('🗺️ ' + esc(q.country.continent) + ' · ' + esc(q.country.region) + '에 있어요');
      var capitalBtn = ui.$('#capital-listen');
      if (capitalBtn) speakLines(capitalBtn, [q.country.capital], '🔊 눌러서 들어보기');
    } else if (q.mode === 'reverse') {
      lines.push('🚩 ' + esc(q.country.flagHint));
    } else {
      lines.push('🚩 ' + esc(q.country.flagHint));
      lines.push(esc(q.country.continent) + '에 있고, 이름은 <b>' + esc(util.initialOf(q.country.ko)) + '</b> 소리로 시작해요');
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

  /**
   * 그림을 못 받아 답할 수 없는 문제를 점수 없이 넘긴다.
   * 오답으로 기록하면 아이가 안 틀린 것을 틀렸다고 배우고, 그렇다고 막아 두면
   * 그 문제에 갇혀 놀이를 끝낼 수 없다. 기록에 손대지 않고 다음 문제로만 간다.
   */
  function skipUnscored() {
    if (state.answered || !state.game) return;
    stopTimer();
    state.listenOn = false;
    if (state.listenTimer) { global.clearTimeout(state.listenTimer); state.listenTimer = null; }
    audio.stopSpeaking();
    var g = state.game;
    var turn = g.turn;
    state.unscored = (state.unscored || 0) + 1;
    g.next();
    // 지나간 문제는 그 사람 차례로 세지 않는다. 대결에서 그림이 안 온 쪽만 차례를 잃으면 안 된다.
    g.turn = turn;
    renderQuiz();
  }

  /** 소재 이름 안에 나라 이름(별칭 포함)이 들어 있는가 — 힌트로 보여 주면 정답을 알려 주는 셈이다. */
  function revealsCountry(name, country) {
    var names = [country.ko].concat(country.aliases || []);
    return names.some(function (n) { return n && name.indexOf(n) !== -1; });
  }

  /* --------- 제출 --------- */
  function submit(payload, gaveUp) {
    // 만나기 카드가 떠 있는 동안은 채점하지 않는다(숫자 키 등 우회 입력 포함).
    if (state.answered || state.artUnavailable || state.meeting) return;
    state.answered = true;
    stopTimer();
    // 마이크는 showFeedback 에서 놓는다. 놓인 것을 확인한 뒤에 읽어 줘야
    // 아이폰·아이패드에서 소리가 사라지지 않는다.
    state.listenOn = false;
    if (state.listenTimer) { global.clearTimeout(state.listenTimer); state.listenTimer = null; }

    var g = state.game;
    var q = g.current();
    // 스티커는 "이 나라를 처음 맞혔는가" 로 정해지므로 기록하기 전에 확인해야 한다
    var flagAxis = q && quiz.MODES[q.mode].axis === 'flag';
    var isNewSticker = flagAxis && !FQ.progress.hasSticker(q.country.code);

    var res = g.submit(payload, state.usedHint);
    if (!res) return;
    res.gaveUp = !!gaveUp;
    if (q) {
      (state.answeredCodes || (state.answeredCodes = {}))[q.country.code] = true;
      noteMet(q.country, !!res.correct);
    }

    if (res.correct && q) {
      var gain = FQ.progress.xpFor(g.streak);
      state.xpGained += gain;
      res.xpGain = gain;
      res.levelUp = FQ.progress.addXp(gain);
      if (isNewSticker) {
        state.newStickers.push(q.country);
        res.newSticker = true;
      }
      if (flagAxis) res.dailyDone = FQ.progress.noteDaily(q.country, true);
    }
    // 깜짝 상자(D22): 지난 상자 뒤 쌓인 카드 수로 굴린다 — 2장째부터 15%, 8장째에는 반드시. 오답·건너뛰기도 한 장이고
    // 다음 판에 이어진다. 종류(보통·반짝·황금)와 흔들기 여부도 여기서 정하므로 셋 중 무엇을 골라도 결과는 같다.
    // state.rng / state.rngKind 는 검사에서 난수를 주입하는 자리다.
    var roll = state.rng || global.Math.random;
    var rollKind = state.rngKind || roll;
    var chestNow = store.chestState();
    res.chest = FQ.progress.chestRoll(chestNow.since + 1, roll());
    if (res.chest) {
      res.chestKind = FQ.progress.chestKind(rollKind());
      res.chestLoot = FQ.progress.chestLoot(res.chestKind);
      res.chestShape = FQ.progress.chestShape(q.country.continent);
      res.chestShake = rollKind() < 0.3;   // 열에 셋은 한 번 더 두드려야 열린다
      store.recordChest(res.chestKind);
      state.chestsOpened = (state.chestsOpened || 0) + 1;
      state.chestLoot = (state.chestLoot || []).concat([{ kind: res.chestKind, score: res.chestLoot.score, xp: res.chestLoot.xp }]);
      var chestLevel = FQ.progress.addXp(res.chestLoot.xp);
      if (chestLevel) res.levelUp = chestLevel;
      state.xpGained += res.chestLoot.xp;
      res.xpGain = (res.xpGain || 0) + res.chestLoot.xp;
      g.addBonus(res.chestLoot.score);
    } else {
      store.recordChest(null);
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
    // 새 축에서 처음 만나거나 틀린 나라는 조금 뒤에 한 번 더 나온다. 화면 글자로만 알리고 읽어 주지는 않는다(음원 없음).
    if (res.scheduledAgain) wins.push('조금 뒤에 한 번 더 만나요');
    if (wins.length) extra = '<div class="small muted">' + wins.join(' · ') + '</div>';

    var lvNow = FQ.progress.level();
    var fill = ui.$('#xp-fill');
    if (fill) fill.style.width = Math.round(lvNow.ratio * 100) + '%';
    var xpVal = ui.$('#xp-val');
    if (xpVal) xpVal.textContent = lvNow.isMax ? '최고 레벨' : lvNow.into + ' / ' + lvNow.need;
    var chestNow = FQ.progress.chestProgress(store.stats().asked);
    var cTitle = ui.$('#combo-title');
    if (cTitle) cTitle.textContent = res.chest ? '깜짝 상자를 찾았어요!' : '여행 카드 ' + chestNow.into + ' / ' + chestNow.need + '장';
    var slots = ui.$('.travel-slots');
    if (slots) slots.innerHTML = travelSlots(chestNow, false);

    // 정오답 모두 이름 한 번과 쉬운 설명 한 문장만 읽는다. 그림 문제는 나라 이름 뒤에 그림 이름을 한 번 더 읽어 쌍을 잇는다.
    var isCapitalQ = q.mode === 'capital';
    var isMapQ = q.mode === 'map';
    var isArtQ = q.mode === 'symbol' || q.mode === 'place';
    var feedbackArtName = isArtQ ? artAlt(c.code, q.mode) : '';
    state.lastSpeech = {
      lines: isCapitalQ ? [c.capital, c.ko + '의 수도예요'] : isArtQ ? [c.ko, feedbackArtName, c.fact].filter(Boolean) : isMapQ ? [c.ko, c.fact] : [c.ko, c.flagHint],
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
      showChest(c, res, q.mode);
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

    // 정답 카드(시안 PhoneAnswer): 정오답이 같은 카드다. 폰에서 국기 전폭, 이름 34px, 노란 상자(그림 이름·상식 / 국기 특징 / 수도 설명),
    // 🔊 설명 다시 듣기 56px, '다음 나라 →' 64px. 수도 놀이는 kname 에 나라 이름, 상자에 '🏙️ 수도 · 나라의 수도예요'(읽는 문구는 [수도, 나라의 수도예요] 그대로).
    var feedbackArt = isArtQ ? artFor(c.code, q.mode) : null;
    var rememberTitle = isArtQ ? esc(artAlt(c.code, q.mode)) : isMapQ ? '🗺️ ' + esc(c.continent) + ' · ' + esc(c.region) : '';
    var rememberBody = isCapitalQ ? '🏙️ ' + esc(c.capital) + ' · ' + esc(c.ko) + '의 수도예요' : isMapQ || isArtQ ? esc(c.fact) : '🚩 ' + esc(c.flagHint);
    var html =
      '<div class="feedback learn discovery-card">' +
        '<div class="fb-head"><div class="verdict">' + verdict + '</div>' + extra + '</div>' +
        '<div class="name-row">' +
          '<img class="fb-flag" src="' + ui.flagSrc(c.code) + '" alt="' + esc(c.ko) + ' 국기">' +
          '<div class="kname">' + esc(c.ko) + '</div>' +
        '</div>' +
        '<div class="remember-box">' +
          (feedbackArt ? '<img class="remember-art" src="' + esc(feedbackArt.src) + '" alt="">' : '') +
          '<div class="remember-hint">' +
            (rememberTitle ? '<b class="remember-title">' + rememberTitle + '</b>' : '') +
            '<span class="remember-body">' + rememberBody + '</span>' +
            // D1 후속: 명소 카드에 수도 한 줄을 병기한다. 읽기는 단추를 눌렀을 때만(기존 음원 두 문구).
            (q.mode === 'place'
              ? '<span class="remember-capital">🏙️ ' + esc(c.capital) + ' · ' + esc(c.ko) + '의 수도예요' +
                  ' <button class="btn btn-sm btn-ghost cap-listen" type="button" data-speak="' + esc(c.capital) + '" data-speak-extra="' + esc(c.ko) + '의 수도예요" data-label="🔊" aria-label="수도 들어보기">🔊</button>' +
                '</span>'
              : '') +
          '</div>' +
        '</div>' +
        (store.settings().speak
          ? '<button class="btn btn-listen btn-listen-soft" id="replay" type="button">🔊 설명 다시 듣기</button>'
          : '<button class="btn btn-listen btn-listen-soft" id="speak-on" type="button">🔇 읽어주기가 꺼져 있어요 · 켜고 듣기</button>') +
        '<button class="btn btn-primary btn-big btn-go" id="next" type="button">' +
          (g.isLast() ? '오늘 여행 보기 →' : '다음 나라 →') +
        '</button>' +
      '</div>';

    var area = ui.$('#feedback-area');
    area.innerHTML = html;
    // 폰에서는 무대·보기를 접어 카드만 남긴다(css .quiz-screen.answered). 아이패드 가로는 보기(지도 핀)를 그대로 둔다.
    var screen = ui.$('.quiz-screen');
    if (screen && screen.classList) screen.classList.add('answered');
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

  var CHEST_KIND_LABEL = { plain: '여행 상자', shiny: '반짝 상자 ✨', gold: '황금 상자 👑' };
  var CHEST_KIND_ICON = { plain: '🎁', shiny: '✨', gold: '👑' };

  /** 이 판에서 연 깜짝 상자의 합계 — 결과 화면용 */
  function chestSummary() {
    var all = state.chestLoot || [];
    var counts = { plain: 0, shiny: 0, gold: 0 };
    var score = 0, xp = 0;
    all.forEach(function (l) { counts[l.kind] = (counts[l.kind] || 0) + 1; score += l.score || 0; xp += l.xp || 0; });
    var kinds = ['gold', 'shiny', 'plain'].filter(function (k) { return counts[k]; })
      .map(function (k) { return CHEST_KIND_ICON[k] + ' ' + counts[k]; }).join(' · ');
    return { count: all.length, score: score, xp: xp, kinds: kinds, icon: counts.gold ? '👑' : counts.shiny ? '✨' : '🎁' };
  }

  /**
   * 깜짝 상자(D22). 대륙 모양 상자 셋 중 하나를 아이가 고르면 열린다. 열에 셋은 한 번 더 두드려야 한다.
   * 종류·보상은 submit 에서 이미 정해 반영했으므로 무엇을 골라도 같다. 여기서는 화면과 효과만 보여 준다.
   */
  function showChest(country, res, mode) {
    var st = FQ.progress.stickers();
    var shape = res.chestShape || FQ.progress.chestShape(country && country.continent);
    var kind = res.chestKind || 'plain';
    var loot = res.chestLoot || FQ.progress.chestLoot(kind);
    var art = (mode === 'symbol' || mode === 'place') && country ? artFor(country.code, mode) : null;
    var picks = '';
    for (var i = 0; i < 3; i++) {
      picks += '<button class="chest-pick" type="button" data-pick="' + i + '" aria-label="' + esc(shape.name) + ' ' + (i + 1) + '">' + shape.emoji + '</button>';
    }
    var back = doc.createElement('div');
    back.className = 'chest-back';
    back.innerHTML =
      '<div class="chest-card ' + kind + '" role="dialog" aria-modal="true" aria-label="깜짝 상자를 찾았어요">' +
        '<div class="chest-title">깜짝 상자를 찾았어요!</div>' +
        '<div class="chest-sub" id="chest-sub">' + esc(shape.name) + ' 셋 중 하나를 골라 봐요</div>' +
        '<div class="chest-picks" id="chest-picks">' + picks + '</div>' +
        '<div class="chest-open" id="chest-open" hidden>' +
          '<div class="chest-art">' +
            '<div class="chest-rays"></div>' +
            '<div class="chest-emoji">' + shape.emoji + '</div>' +
          '</div>' +
          '<div class="chest-kind">' + (CHEST_KIND_LABEL[kind] || CHEST_KIND_LABEL.plain) + '</div>' +
          '<div class="chest-loot">' +
            '<div class="loot" style="animation-delay:.15s">' +
              '<div class="ic">⭐</div><div class="n">보너스 별</div><div class="d">+' + loot.score + '점</div>' +
            '</div>' +
            '<div class="loot" style="animation-delay:.3s">' +
              '<div class="ic">✨</div><div class="n">경험치</div><div class="d">+' + loot.xp + '</div>' +
            '</div>' +
            (res.newSticker && country
              ? '<div class="loot" style="animation-delay:.45s">' +
                  '<div class="ic">🏳️</div><div class="n">' + esc(country.ko) + '</div><div class="d">새 스티커</div>' +
                '</div>'
              : '<div class="loot" style="animation-delay:.45s">' +
                  '<div class="ic">📖</div><div class="n">스티커 판</div><div class="d">' + st.owned + ' / ' + st.total + '</div>' +
                '</div>') +
          '</div>' +
          // 나라 친구 카드: 방금 만난 나라의 국기(그림 놀이면 그림도)가 상자에서 나온다. 새 읽어주기 문구는 없다.
          (country
            ? '<div class="chest-friend" role="group" aria-label="' + esc(country.ko) + ' 친구 카드">' +
                '<img src="' + ui.flagSrc(country.code) + '" alt="' + esc(country.ko) + ' 국기">' +
                (art ? '<img class="art" src="' + esc(art.src) + '" alt="' + esc(art.alt) + '">' : '') +
                '<span class="chest-friend-name">' + esc(country.ko) + '</span>' +
              '</div>'
            : '') +
          '<button class="btn btn-primary btn-big" id="chest-close" type="button" style="width:100%;margin-top:18px">좋아요!</button>' +
        '</div>' +
      '</div>';
    doc.body.appendChild(back);

    // 뒤의 '다음 문제' 단추를 잠가 둔다. 포커스를 쥔 채로 두면 엔터 한 번에
    // 상자를 못 본 채 다음 문제로 넘어가 버린다.
    var behind = ui.$('#next');
    if (behind) behind.disabled = true;
    var firstPick = back.querySelector('.chest-pick');
    if (firstPick) { try { firstPick.focus({ preventScroll: true }); } catch (e) { firstPick.focus(); } }

    // 상자가 나타나는 소리는 대륙 곡. 보상은 submit 에서 이미 반영했다.
    playMusic('chest', null, shape.music ? { prefer: shape.music } : null);

    var opened = false;
    var shaken = !res.chestShake;
    function openBox(pick) {
      if (opened) return;
      if (!shaken) {
        // 첫 두드림은 흔들리기만 한다. 아이가 한 번 더 두드리면 열린다.
        shaken = true;
        if (pick && pick.classList) pick.classList.add('wobble');
        var sub = back.querySelector('#chest-sub');
        if (sub) sub.textContent = '한 번 더 두드려요!';
        return;
      }
      opened = true;
      var picksBox = back.querySelector('#chest-picks');
      if (picksBox) picksBox.hidden = true;
      var openArea = back.querySelector('#chest-open');
      if (openArea) openArea.hidden = false;
      var sub2 = back.querySelector('#chest-sub');
      if (sub2) sub2.textContent = kind === 'gold' ? '와, 황금 상자예요!' : kind === 'shiny' ? '반짝반짝 상자예요!' : '상자가 열렸어요!';
      FQ.effects.burst(kind === 'gold' ? 70 : kind === 'shiny' ? 50 : 35);
      var closeBtn = back.querySelector('#chest-close');
      if (closeBtn) { try { closeBtn.focus({ preventScroll: true }); } catch (e2) { closeBtn.focus(); } }
    }
    function close() {
      stopMusic();
      back.remove();
      var nextBtn = ui.$('#next');
      if (nextBtn) { nextBtn.disabled = false; nextBtn.focus(); }
    }
    back.addEventListener('click', function (ev) {
      // 바깥을 눌러 닫는 것은 상자를 연 뒤에만. 고르기 전에 실수로 닫히면 아이가 선물을 못 본다.
      if (ev.target.closest('#chest-close') || (ev.target === back && opened)) { close(); return; }
      var pick = ev.target.closest('.chest-pick');
      if (pick) openBox(pick);
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
    if ((nq.mode === 'symbol' || nq.mode === 'place') && global.Image) {
      var art = artFor(nq.country.code, nq.mode);
      if (art) { var nextArt = new Image(); nextArt.src = art.src; }
    }
    var codes = [nq.country.code].concat((nq.options || []).map(function (c) { return c.code; }));
    codes.forEach(function (code) {
      var img = new Image();
      img.src = ui.flagSrc(code);
    });
  }

  /* --------- 제한 시간 --------- */
  /** 제한 시간은 국기 놀이에만 있다(D23). 그림·명소·지도·수도는 아이가 처음 보는 것이라 초시계를 붙이지 않는다. */
  function timedMode(mode) {
    return !!(quiz.MODES[mode] && quiz.MODES[mode].axis === 'flag');
  }

  function startTimer(remaining) {
    stopTimer();
    state.timerPaused = false;
    if (!state.game || state.answered || state.artUnavailable) return;
    var current = state.game.current();
    if (current && !timedMode(current.mode)) return;
    var limit = remaining === undefined ? Number(store.settings().timer) || 0 : remaining;
    if (!limit) return;
    state.timeLeft = limit;
    // 숨겨진 동안 그림이 준비되면 화면 복귀 후부터 온전한 제한 시간을 준다.
    if (doc.hidden) { state.timerPaused = true; return; }
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
          // 그림·명소·지도는 아이가 처음 보는 것이 많다. 다 보기도 전에 시간이 끝난 것을 오답으로 적으면
          // 안 틀린 것을 틀렸다고 배우고 그 나라가 '어려운 나라'로 더 자주 나온다. 기록 없이 지나간다.
          var q = state.game && state.game.current();
          if (q && quiz.MODES[q.mode] && quiz.MODES[q.mode].axis !== 'flag') { skipUnscored(); return; }
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
    // 점수 없이 지나간 문제는 총 문항·정답률·기록·만점 배지 어디에도 들어가지 않는다.
    summary.total = Math.max(0, (summary.total || 0) - (state.unscored || 0));
    summary.unscored = state.unscored || 0;
    summary.countries = Object.keys(state.answeredCodes || {}).length;
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

    // 새 축은 한 판에 같은 나라를 두 번 만나므로 문제 수가 아니라 나라 수를 센다.
    var metCount = summary.countries === undefined ? summary.total : summary.countries;
    // '맞힌 나라'도 나라 수다. 새 축은 같은 나라를 두 번 만나므로 문제 수(summary.correct)로 세면 만난 나라보다 커진다.
    var correctCount = state.met && state.met.length
      ? state.met.filter(function (m2) { return m2.correct; }).length
      : summary.correct;
    var met = (state.met || []).slice(-5);   // 여행 카드 다섯 장: 이 판에서 마지막으로 만난 다섯 나라
    var chest = FQ.progress.chestProgress(store.stats().asked);
    var st = FQ.progress.stickers();
    var wrongHtml = summary.wrong.map(function (c) {
      return '<button class="wrong-item" type="button" data-code="' + c.code + '">' +
        '<img src="' + ui.flagSrc(c.code) + '" alt="' + esc(c.ko) + ' 국기">' +
        '<div class="n">' + esc(c.ko) + '</div>' +
        '<div class="wh">' + esc(summary.mode === 'map' ? c.continent + ' · ' + c.region :
          summary.mode === 'symbol' || summary.mode === 'place' ? artAlt(c.code, summary.mode) :
          summary.mode === 'capital' ? '🏙️ ' + c.capital : c.flagHint) + '</div>' +
      '</button>';
    }).join('');

    // 시안(PhoneResult): 큰 제목 · 큰 숫자 두 칸 · 여행 카드 5장 · 레벨 링 · 🎁 상자 · 새 스티커 · '한 번 더' 64px 노란 + '홈으로' 56px.
    // 큰 숫자 칸의 aria-label 이 '오늘 만난 나라 N개' 한 문장이라 읽어 주는 기계와 검사 모두 같은 글을 본다.
    var html =
      '<section class="screen result-screen">' +
        '<div class="result-head">' +
          '<span class="result-ic" aria-hidden="true">🗺️</span>' +
          '<div class="result-title"><h2>오늘 여행 끝!</h2><p class="muted">여행책에 새로운 이야기가 쌓였어요</p></div>' +
          '<button class="btn btn-sm btn-listen-soft result-replay" id="result-replay" type="button">🔊 응원 다시 듣기</button>' +
        '</div>' +
        '<div class="big-stats">' +
          '<div class="big-stat" role="group" aria-label="오늘 만난 나라 ' + metCount + '개">' +
            '<span class="k"><span aria-hidden="true">🚩</span> 오늘 만난 나라</span>' +
            '<span class="v" aria-hidden="true">' + metCount + '<small>개</small></span>' +
          '</div>' +
          '<div class="big-stat ok" role="group" aria-label="맞힌 나라 ' + correctCount + '개">' +
            '<span class="k">' + ICONS.check + ' 맞힌 나라</span>' +
            '<span class="v" aria-hidden="true">' + correctCount + '<small>개</small></span>' +
          '</div>' +
        '</div>' +
        reviewResultBlock() +
        (met.length
          ? '<div class="card travel-cards">' +
              '<div class="tc-head"><span class="tc-title">📖 오늘의 여행 카드 ' + met.length + '장</span><span class="spacer"></span>' +
                (summary.wrong.length ? '<span class="tc-note small muted">한 번 더 만날 나라 ' + summary.wrong.length + '개</span>' : '') + '</div>' +
              '<div class="tc-grid">' + met.map(function (m2, i) {
                return '<button class="travel-card' + (m2.correct ? ' ok' : ' again') + '" type="button" data-code="' + m2.country.code + '" style="animation-delay:' + (0.1 + i * 0.08) + 's">' +
                  '<span class="tc-flag"><img src="' + ui.flagSrc(m2.country.code) + '" alt="' + esc(m2.country.ko) + ' 국기">' +
                    '<span class="tc-badge" role="img" aria-label="' + (m2.correct ? '맞았어요' : '한 번 더 만나요') + '">' + (m2.correct ? ICONS.check : ICONS.again) + '</span></span>' +
                  '<span class="tc-name">' + esc(m2.country.ko) + '</span>' +
                '</button>';
              }).join('') + '</div>' +
            '</div>'
          : '') +
        resultLevelBlock() +
        (state.chestsOpened
          ? '<div class="chest-note">' +
              '<span class="chest-note-ic" aria-hidden="true">' + chestSummary().icon + '</span>' +
              '<span class="chest-note-body"><b>깜짝 상자 ' + state.chestsOpened + '개를 열었어요!</b><span class="small muted">보너스 ' + chestSummary().score + '점 · 경험치 ' + chestSummary().xp + '</span></span>' +
              '<span class="chest-note-pill">' + chestSummary().kinds + '</span>' +
            '</div>'
          : '<div class="chest-note soft" role="group" aria-label="여행 카드 ' + chest.into + ' / ' + chest.need + '장 · 깜짝 상자를 기다려요">' +
              '<span class="chest-note-ic" aria-hidden="true">📖</span>' +
              '<span class="travel-slots" aria-hidden="true">' + travelSlots(chest, false) + '</span>' +
              '<span class="chest-note-pill" aria-hidden="true">🎁 깜짝</span>' +
            '</div>') +
        (state.newStickers.length
          ? '<div class="card new-sticker-card">' +
              '<img src="' + ui.flagSrc(state.newStickers[0].code) + '" alt="' + esc(state.newStickers[0].ko) + ' 스티커">' +
              '<span class="ns-body"><span class="ns-pill">새 스티커!' + (state.newStickers.length > 1 ? ' ' + state.newStickers.length + '개' : '') + '</span>' +
                '<span class="ns-name">' + state.newStickers.map(function (c) { return esc(c.ko); }).join(' · ') + '</span></span>' +
              '<span class="ns-count small muted">📖 ' + st.owned + ' / ' + st.total + '</span>' +
            '</div>'
          : '') +

        duelHtml +

        (earned && earned.length
          ? '<div class="section">' + earned.map(function (b) {
              return '<div class="badge-pop"><span class="ic">' + b.icon + '</span>' +
                '<span><span class="n">새 배지! ' + esc(b.name) + '</span><br><span class="d">' + esc(b.desc) + '</span></span></div>';
            }).join('') + '</div>'
          : '') +

        '<details class="journey-record card"><summary>학습 기록 보기</summary><div class="stat-grid">' +
          '<div class="stat"><div class="v">' + summary.score + '</div><div class="k">점수</div></div>' +
          '<div class="stat"><div class="v">' + summary.bestStreak + '</div><div class="k">최고 연속</div></div>' +
          '<div class="stat"><div class="v">' + util.formatDuration(summary.seconds) + '</div><div class="k">걸린 시간</div></div>' +
          '<div class="stat"><div class="v">' + Math.round((summary.correct / (summary.total || 1)) * 100) + '%</div><div class="k">정답률</div></div>' +
        '</div>' +
        (state.xpGained ? '<div class="xp-gain">✨ 경험치 +' + state.xpGained + '</div>' : '') +
        (summary.wrong.length
          ? '<h3 class="jr-title">한 번 더 만날 나라 ' + summary.wrong.length + '개</h3><div class="wrong-grid">' + wrongHtml + '</div>' +
            '<p class="small muted" style="margin-bottom:0">국기를 누르면 자세히 볼 수 있어요.</p>'
          : '<p class="small muted" style="margin-bottom:0;text-align:center">📖 오늘의 여행 카드가 모두 모였어요</p>') +
        '</details>' +

        '<div class="result-actions">' +
          '<button class="btn btn-big btn-go btn-yellow" id="again" type="button">' + ICONS.replay + '<span>한 번 더</span></button>' +
          (summary.wrong.length
            ? '<button class="btn btn-big btn-mid" id="retry-wrong" type="button">📖 한 번 더 만나기</button>'
            : '') +
          '<button class="btn btn-big btn-mid" id="home" type="button">' + ICONS.home + '<span>홈으로</span></button>' +
        '</div>' +
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
    ui.on(m, '.travel-card', 'click', function (e, t) {
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

  /** 결과 화면의 레벨 카드(시안): 레벨 링 + 이름 → 다음 레벨 이름 + '경험치 +N' 알약 + 막대 + 남은 수. 스티커 수는 새 스티커 카드에 있다. */
  function resultLevelBlock() {
    var lv = FQ.progress.level();
    var next = (FQ.progress.LEVELS || [])[lv.number];
    return '<div class="card level-card" role="group" aria-label="' + esc(lv.name) + ' ' + (lv.isMax ? '최고 레벨' : lv.into + ' / ' + lv.need) + '">' +
      '<span class="level-ring" aria-hidden="true">' +
        '<span class="track" style="--p:' + lv.ratio.toFixed(3) + '"></span>' +
        '<span class="hole">' + lv.emoji + '</span>' +
      '</span>' +
      '<span class="level-body">' +
        '<span class="level-top">' +
          '<span class="level-name">' + esc(lv.name) + '</span>' +
          (next ? '<span class="level-next" aria-hidden="true">→ ' + next.emoji + ' ' + esc(next.name) + '</span>' : '') +
          '<span class="spacer"></span>' +
          (state.xpGained ? '<span class="level-gain">경험치 +' + state.xpGained + '</span>' : '') +
        '</span>' +
        '<span class="player-bar"><i style="width:' + Math.round(lv.ratio * 100) + '%"></i></span>' +
        '<span class="level-foot small muted"><span>' + (lv.isMax ? '가장 높은 레벨이에요' : '다음 레벨까지') + '</span><span class="spacer"></span>' +
          '<span>' + (lv.isMax ? '경험치 ' + FQ.progress.xp() : lv.into + ' / ' + lv.need) + '</span></span>' +
      '</span>' +
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
