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
    { id: 'voice',   emo: '🎤', title: '말로 답하기', desc: '국기를 보고 소리 내어 말해요' },
    { id: 'typing',  emo: '⌨️', title: '이름 써서 맞히기', desc: '글자로 입력해요' },
    { id: 'capital', emo: '🏙️', title: '수도 맞히기', desc: '나라의 수도를 골라요' }
  ];

  var LEVELS = [
    { id: '1', label: '쉬움', desc: '유명한 나라' },
    { id: '2', label: '보통', desc: '조금 더 많이' },
    { id: '3', label: '어려움', desc: '195개국 전부' }
  ];

  var CONTINENTS = ['all', '아시아', '유럽', '아프리카', '북아메리카', '남아메리카', '오세아니아'];
  var COUNTS = [5, 10, 20, 'all'];

  var state = {
    game: null,
    answered: false,
    usedHint: false,
    removed: [],
    timerId: null,
    timeLeft: 0,
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
        '<div class="hero">' +
          '<h2>어느 나라 국기일까요?</h2>' +
          '<p>' + esc(s.players[0] || '친구') + '와 함께 세계 195개 나라를 만나 봐요</p>' +
        '</div>' +

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
          '<div class="choice-grid">' +
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
            LEVELS.map(function (l) {
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

  function voiceNotice() {
    var reason = FQ.speech.unavailableReason();
    if (!reason) return '<div class="notice">🎤 마이크 사용을 물어보면 “허용”을 눌러 주세요. 조용한 곳에서 또박또박 말하면 더 잘 알아들어요.</div>';
    return '<div class="notice">⚠️ ' + esc(reason) + '<br>말하기 대신 <b>이름 써서 맞히기</b>로도 즐길 수 있어요.</div>';
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
    var progress = Math.round((g.index / g.total) * 100);

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

    var html =
      '<section class="screen">' +
        '<div class="quiz-head">' +
          '<button class="btn btn-sm btn-ghost" id="quit" type="button">← 그만하기</button>' +
          '<span class="chip">' + (g.index + 1) + ' / ' + g.total + '</span>' +
          '<span class="chip">⭐ ' + g.score + '</span>' +
          (g.streak >= 2 ? '<span class="chip combo">🔥 ' + g.streak + '연속</span>' : '') +
          (duel ? '<span class="chip turn">' + esc(g.currentPlayer()) + ' 차례</span>' : '') +
          (s.timer ? '<span class="chip" id="timer-chip">⏱ ' + s.timer + '</span>' : '') +
        '</div>' +
        '<div class="progress"><i style="width:' + progress + '%"></i></div>' +
        stage +
        '<div id="answer-area">' + answerArea(q) + '</div>' +
        '<div class="row" style="margin-top:14px">' +
          '<button class="btn btn-sm" id="hint" type="button">💡 힌트 (-3점)</button>' +
          '<button class="btn btn-sm btn-ghost" id="skip" type="button">🤷 모르겠어요</button>' +
        '</div>' +
        '<div id="hint-area"></div>' +
        '<div id="feedback-area"></div>' +
      '</section>';

    var m = ui.setMain(html);

    ui.on(m, '[data-speak]', 'click', function (e, t) { audio.speak(t.getAttribute('data-speak')); });
    ui.$('#quit', m).addEventListener('click', function () {
      stopTimer();
      FQ.speech.abort();
      audio.stopSpeaking();
      state.game = null;
      renderHome();
    });
    ui.$('#hint', m).addEventListener('click', showHint);
    ui.$('#skip', m).addEventListener('click', function () { submit({ text: '' }, true); });

    bindAnswerArea(m, q);
    preloadNext();
    startTimer();
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
      return '<div class="mic-wrap">' +
        (reason ? '<div class="notice">⚠️ ' + esc(reason) + '</div>' : '') +
        '<button class="mic-btn" id="mic" type="button" aria-label="눌러서 말하기"' + (reason ? ' disabled' : '') + '>🎤</button>' +
        '<div class="heard" id="heard">' + (reason ? '' : '버튼을 누르고 나라 이름을 말해 보세요') + '</div>' +
        '<div class="field" style="margin-top:14px">' +
          '<input class="text-input" id="answer-input" placeholder="글자로 답해도 좋아요" autocomplete="off">' +
          '<button class="btn btn-primary" id="answer-submit" type="button">확인</button>' +
        '</div>' +
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
      if (q.mode === 'typing') setTimeout(function () { input.focus(); }, 60);
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
    submit({ text: text });
  }

  /* --------- 마이크 --------- */
  function toggleMic() {
    var mic = ui.$('#mic');
    var heard = ui.$('#heard');
    if (!mic) return;
    if (FQ.speech.isListening()) { FQ.speech.stop(); return; }
    audio.stopSpeaking();
    mic.classList.add('listening');
    heard.textContent = '듣고 있어요…';
    FQ.speech.start({
      interim: function (text) { if (heard) heard.textContent = text; },
      result: function (alts) {
        if (state.answered) return;
        if (heard) heard.textContent = alts[0] || '';
        var q = state.game.current();
        var best = null;
        for (var i = 0; i < alts.length; i++) {
          var r = quiz.checkText(q.country, alts[i]);
          if (r.correct) { best = alts[i]; break; }
          if (!best) best = alts[i];
        }
        submit({ text: best || '' });
      },
      error: function (code, message) {
        mic.classList.remove('listening');
        if (!heard) return;
        if (code === 'no-speech') heard.textContent = '소리가 잘 안 들렸어요. 다시 눌러 볼까요?';
        else if (code === 'not-allowed' || code === 'service-not-allowed') heard.textContent = '마이크 사용을 허용해 주세요.';
        else heard.textContent = message || '지금은 마이크를 쓸 수 없어요. 글자로 답해 주세요.';
      },
      end: function () { if (mic) mic.classList.remove('listening'); }
    });
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
    FQ.speech.abort();

    var g = state.game;
    var res = g.submit(payload, state.usedHint);
    if (!res) return;
    res.gaveUp = !!gaveUp;
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
    var inputBox = ui.$('#answer-input');
    if (inputBox) inputBox.disabled = true;
    var subBtn = ui.$('#answer-submit');
    if (subBtn) subBtn.disabled = true;

    var who = g.players.length > 1 ? esc(g.currentPlayer()) + ', ' : '';
    var verdict, extra = '';
    if (res.correct) {
      verdict = '🎉 ' + who + '정답이에요!' + (res.gained > 10 ? ' <span class="small">(+' + res.gained + '점 연속 보너스!)</span>' : '');
      audio.play(g.streak >= 3 ? 'combo' : 'correct');
      FQ.effects.burst(g.streak >= 3 ? 90 : 40);
      if (!res.exact && res.matched) {
        extra = '<div class="small muted">비슷하게 말해도 정답으로 인정했어요. 정확한 이름은 <b>' + esc(c.ko) + '</b> 예요.</div>';
      }
    } else {
      verdict = res.gaveUp ? '👀 같이 알아볼까요?' : '😅 아쉬워요';
      audio.play('wrong');
      if (res.confusedWith) {
        extra = '<div class="small">고른 나라는 <b>' + esc(res.confusedWith.ko) + '</b> 였어요.</div>';
      }
    }

    var speakText = res.correct
      ? c.ko
      : '정답은 ' + c.ko + (util.hasJongseong(c.ko) ? '이에요' : '예요');
    if (s.speak) setTimeout(function () { audio.speak(speakText); }, res.correct ? 380 : 520);

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
        '<div class="fact-box">💡 ' + esc(c.fact) + '</div>' +
        '<button class="btn btn-primary btn-big" id="next" type="button" style="width:100%;margin-top:14px">' +
          (g.isLast() ? '결과 보기 →' : '다음 문제 →') +
        '</button>' +
      '</div>';

    var area = ui.$('#feedback-area');
    area.innerHTML = html;
    var next = ui.$('#next');
    next.addEventListener('click', goNext);
    next.focus();
    next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
    FQ.speech.abort();
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
    var stars = rate >= 0.9 ? '⭐⭐⭐' : rate >= 0.7 ? '⭐⭐' : rate >= 0.4 ? '⭐' : '💪';
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
            '<div class="stars">' + stars + '</div>' +
            '<div class="score">' + summary.correct + ' / ' + summary.total + '</div>' +
            '<p class="muted">' + esc(cheer) + '</p>' +
          '</div>' +
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
      stopTimer(); FQ.speech.abort(); audio.stopSpeaking(); state.game = null;
      FQ.screens.dex();
    });
    doc.getElementById('nav-stats').addEventListener('click', function () {
      stopTimer(); FQ.speech.abort(); audio.stopSpeaking(); state.game = null;
      FQ.screens.stats();
    });
    doc.addEventListener('click', function once() {
      audio.unlock();
      doc.removeEventListener('click', once);
    });

    renderHome();
  }

  FQ.app = { home: renderHome, boot: boot, startGame: startGame };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
