/* 국기 퀴즈 - 화면 흐름과 게임 진행
 * 홈에서 주제를 골라 공부하거나 퀴즈를 푼다. 도감과 기록 화면은 screens.js 가 그린다.
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

  // 홈에서는 주제를 고르고, 다음 화면에서 놀이 방식을 고른다. 네 주제의 자리는 늘 같다.
  var MODE_CARDS = [
    { id: 'choice4', group: 'flag', emo: '👀', title: '국기 보고 나라 고르기', pill: '국기 보고 고르기', short: '보고' },
    { id: 'reverse', group: 'flag', emo: '🔎', title: '나라 보고 국기 찾기', pill: '듣고 국기 찾기', short: '찾기' },
    { id: 'voice',   group: 'flag', emo: '🎤', title: '말로 답하기', pill: '말로 답하기', short: '말하기' },
    { id: 'typing',  group: 'flag', emo: '✏️', title: '이름 써서 맞히기', pill: '이름 써서 맞히기', short: '쓰기' },
    { id: 'symbol',  group: 'art', emo: '🎨', title: '그림 보고 나라 고르기', pill: '그림 보고 고르기', short: '그림' },
    { id: 'place',   group: 'art', emo: '🏞️', title: '명소 보고 나라 고르기', pill: '명소 보고 고르기', short: '명소' },
    { id: 'map',     group: 'map', emo: '🗺️', title: '지도에서 나라 찾기', pill: '지도', short: '지도' },
    { id: 'capital', group: 'capital', emo: '🏙️', title: '수도 듣고 국기 찾기', pill: '수도 듣기', short: '듣기' },
    { id: 'capitalVoice', group: 'capital', emo: '🎤', title: '국기 보고 수도 말하기', pill: '수도 말하기', short: '말하기' }
  ];
  var PLAY_TILES = [
    { id: 'flag', title: '국기 놀이', desc: '세계의 국기를 알아봐요' },
    { id: 'art', title: '그림 놀이', desc: '그림·명소 공부와 퀴즈' },
    { id: 'map', emo: '🗺️', title: '지도 놀이', desc: '위치 공부 · 퀴즈 풀기' },
    { id: 'capital', emo: '🏙️', title: '수도 놀이', desc: '공부하기 · 문제 풀기' }
  ];

  /** 둘이서 대결은 국기 축에서만 연다. 그림·명소·지도·수도는 어른이 압도적이라 아이가 매번 진다. */
  function duelAllowed(mode) {
    var m = quiz.MODES[mode];
    return !!m && m.axis === 'flag';
  }

  /** 말로 답하는 놀이(말로 답하기·국기 보고 수도 말하기) — 마이크·중간 결과 채점·맞히면 저절로 다음(D25)을 같이 쓴다. */
  function speechMode(mode) { var m = quiz.MODES[mode]; return !!(m && m.speech); }
  /** 무엇을 말하면 답인가: 'country'(나라 이름) 또는 'capital'(수도 이름, D28) */
  function answerKind(mode) { var m = quiz.MODES[mode]; return (m && m.answer) || 'country'; }
  function answerWhat(mode) { return answerKind(mode) === 'capital' ? '수도 이름' : '나라 이름'; }
  /** 수도 축 퀴즈(수도 듣고 국기 찾기·국기 보고 수도 말하기) — 정답 카드·결과의 수도 줄을 같이 쓴다. */
  function capitalAxis(mode) { var m = quiz.MODES[mode]; return !!(m && m.axis === 'capital'); }

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
    return '<div class="play-grid">' + PLAY_TILES.map(function (tile) {
      if (!tileModes(tile).length) return '';
      return '<div class="play-tile" data-play-tile="' + tile.id + '">' +
        '<button class="play-btn" id="play-' + tile.id + '" type="button" data-play="' + tile.id + '">' +
          '<span class="play-icon">' + ui.icon(tile.id) + '</span>' +
          '<span class="play-t">' + esc(tile.title) + '</span>' +
          '<span class="play-d">' + esc(tile.desc) + '</span>' +
        '</button></div>';
    }).join('') + '</div>';
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
  // 말로 맞힌 정답 이름을 들은 뒤 잠깐 쉬고 넘어간다. 종료 알림이 빠져도 다음 국기에 갇히지 않는다.
  var AUTO_NEXT_AFTER_SPEECH = 900;
  var AUTO_NEXT_SILENT = 1800;
  var AUTO_NEXT_VOICE_WATCHDOG = 7000;

  var state = {
    game: null,
    study: null,
    studiedCapitals: {},
    mapStudy: null,
    studiedMap: {},
    artStudy: null,
    artMode: null,
    studiedArt: { symbol: {}, place: {} },
    answered: false,
    usedHint: false,
    hintLevel: 0,      // 수도 놀이 힌트 단계(D24): 1 오답 지우기 + 수도 다시 듣기, 2 나라 이름 듣기
    revealed: false,   // 힌트 2단계로 나라 이름까지 들었다 — 채점은 정답이어도 기록은 '아직'
    removed: [],
    timerId: null,
    timeLeft: 0,
    listenOn: false,
    listenTimer: null,
    listenFailures: 0,
    speechNeedsConnection: false,
    artTimer: null,
    questionGeneration: 0,
    autoNextTimer: null,   // 말로 맞힌 뒤 저절로 다음으로 가는 예약(D25)
    feedbackGeneration: 0,
    screen: 'home',
    musicGeneration: 0,
    cancelFeedbackVoice: null,
    timerPaused: false,
    lastSpeech: { lines: [], opts: {} },
    xpGained: 0,
    newStickers: [],
    giftsFound: [],
    lastSummary: null,
    lastBadges: [],
    category: null,
    settingsReturn: 'home'
  };

  /** 다른 문제나 화면으로 넘어간 뒤 이전 안내가 뒤늦게 나오지 않도록 한다. */
  function cancelPendingFeedback() {
    if (state.cancelFeedbackVoice) state.cancelFeedbackVoice();
    state.cancelFeedbackVoice = null;
    state.feedbackGeneration += 1;
    stopMusic();
    if (state.autoNextTimer) { global.clearTimeout(state.autoNextTimer); state.autoNextTimer = null; }
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
    var shell = doc.querySelector('.app');
    if (shell) shell.setAttribute('data-screen', screen);
    var extras = doc.getElementById('settings-extras');
    if (extras) extras.hidden = screen !== 'settings';
    ['home', 'dex', 'stats', 'settings'].forEach(function (name) {
      var link = doc.getElementById('nav-' + name);
      if (link) link.setAttribute('aria-current', (name === screen || (name === 'home' && ['category', 'art-menu', 'capital-menu', 'map-menu', 'result'].indexOf(screen) >= 0)) ? 'page' : 'false');
    });
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

  /* =================== 홈 · 주제 선택 · 설정 =================== */
  function renderHome() {
    enterCapitalScreen('home');
    state.study = null;
    state.mapStudy = null;
    state.artStudy = null;
    var s = store.settings();
    if (s.mode !== quiz.availableMode(s.mode)) s = store.updateSettings({ mode: quiz.availableMode(s.mode) });
    var name = s.players[0] || '친구';
    var m = ui.setMain('<section class="screen home-kid">' +
      '<div class="home-intro"><span class="home-avatar" aria-hidden="true">' + esc(name.slice(0, 1)) + '</span>' +
        '<span class="eyebrow">' + esc(name) + '의 세계 여행</span><h2>무엇을 알아볼까요?</h2></div>' +
      playGrid(s) + playerCard(s) + dailyCard() +
      '<button class="home-offline" id="home-offline" type="button">' + ui.icon('download') +
        '<span>인터넷 없이 놀기</span><span class="spacer"></span><span id="home-offline-summary">준비 확인</span>' + ui.icon('chevron') + '</button>' +
      '</section>');
    ui.on(m, '[data-play]', 'click', function (e, t) { renderCategory(t.getAttribute('data-play')); });
    ui.$('#home-offline', m).addEventListener('click', function () { renderSettings('offline'); });
    ui.$('#home-progress', m).addEventListener('click', function () { FQ.screens.stats(); });
    var dailyGo = ui.$('#daily-go', m);
    if (dailyGo) dailyGo.addEventListener('click', function () {
      var d = FQ.progress.daily();
      if (d.complete) { FQ.screens.dex(); return; }
      store.updateSettings({ continent: d.continent });
      keepFlagAxisMode();
      renderCategory('flag');
    });
    if (FQ.offline && FQ.offline.render) FQ.offline.render();
  }

  function renderCategory(group) {
    if (group === 'capital') { renderCapitalMenu(); return; }
    if (group === 'map') { renderMapMenu(); return; }
    var tile = PLAY_TILES.filter(function (t) { return t.id === group; })[0];
    if (!tile || !tileModes(tile).length) return;
    enterCapitalScreen('category');
    state.study = null;
    state.mapStudy = null;
    state.artStudy = null;
    state.category = group;
    var s = store.updateSettings({ mode: tileMode(tile, store.settings()) });
    var descriptions = {
      choice4: '국기를 보고 나라 이름을 골라요', reverse: '나라 이름을 듣고 국기를 찾아요',
      voice: '국기를 보고 나라 이름을 말해요', typing: '국기를 보고 나라 이름을 써요',
      symbol: '그림을 보고 배우거나 퀴즈를 풀어요', place: '명소를 보고 배우거나 퀴즈를 풀어요',
      map: '세계지도에서 나라의 자리를 찾아요'
    };
    var m = ui.setMain('<section class="screen category-menu">' +
      '<div class="screen-heading"><button class="btn btn-sm btn-ghost" id="category-back" type="button">' + ui.icon('back') + ' 놀이</button>' +
        '<h2>' + esc(tile.title) + '</h2></div><p class="muted">' + (group === 'art' ? '무엇을 알아볼까요?' : '어떻게 놀아 볼까요?') + '</p>' +
      '<div class="mode-list">' + tileModes(tile).map(function (mode) {
        return '<button class="mode-option" type="button" data-mode="' + mode.id + '"><span class="mode-icon">' + ui.icon(({choice4:'eye',reverse:'sound',voice:'mic',typing:'keyboard',symbol:'art',place:'map'})[mode.id] || group) + '</span>' +
          '<span><strong>' + esc(group === 'art' ? (mode.id === 'place' ? '세계의 명소' : '나라를 떠올리는 그림') : mode.title) + '</strong><small>' + esc(descriptions[mode.id]) + '</small>' +
          ((s.lastMode || {})[group] === mode.id ? '<span class="mode-recent">최근에 한 놀이</span>' : '') + '</span>' + ui.icon('chevron') + '</button>';
      }).join('') + '</div>' +
      '<button class="category-settings btn btn-ghost" id="category-settings" type="button">' + ui.icon('settings') +
        esc(quiz.LEVEL_LABEL[s.level]) + ' · ' + esc(s.continent === 'all' ? '모든 대륙' : s.continent) + ' · ' + (s.count === 'all' ? '모든 문제' : s.count + '문제') + '</button>' +
      (group === 'flag' && store.wrongList().length ? '<button class="btn btn-ghost" id="review" type="button">한 번 더 만나기 · ' + Math.min(store.wrongList().length, 20) + '문제</button>' : '') +
      '</section>');
    ui.$('#category-back', m).addEventListener('click', renderHome);
    ui.$('#category-settings', m).addEventListener('click', function () { renderSettings(); });
    ui.on(m, '[data-mode]', 'click', function (e, t) {
      var mode = t.getAttribute('data-mode');
      if (group === 'art') renderArtMenu(mode);
      else startPlay(m, mode);
    });
    var review = ui.$('#review', m);
    if (review) review.addEventListener('click', function () { keepFlagAxisMode(); startGame(store.wrongList()); });
  }

  function settingRow(id, title, control, description) {
    return '<div class="setting-row"><label class="setting-copy" for="' + id + '"><span>' + title + '</span>' +
      (description ? '<small>' + description + '</small>' : '') + '</label>' + control + '</div>';
  }

  function settingSelect(id, selected, options, disabled) {
    return '<select id="' + id + '"' + (disabled ? ' disabled' : '') + '>' + options.map(function (option) {
      return '<option value="' + esc(option[0]) + '"' + (String(selected) === String(option[0]) ? ' selected' : '') + '>' + esc(option[1]) + '</option>';
    }).join('') + '</select>';
  }

  function settingSwitch(id, checked, disabled) {
    return '<input class="setting-switch" type="checkbox" role="switch" id="' + id + '"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '>';
  }

  function closeSettings() {
    if (state.settingsReturn === 'category') renderCategory(state.category);
    else if (state.settingsReturn === 'art-menu') renderArtMenu(state.artMode);
    else if (state.settingsReturn === 'capital-menu') renderCapitalMenu();
    else if (state.settingsReturn === 'map-menu') renderMapMenu();
    else if (state.settingsReturn === 'dex') FQ.screens.dex();
    else if (state.settingsReturn === 'stats') FQ.screens.stats();
    else renderHome();
  }

  function renderSettings(section) {
    if (state.screen !== 'settings') state.settingsReturn = state.screen;
    enterCapitalScreen('settings');
    state.study = null;
    state.mapStudy = null;
    state.artStudy = null;
    var s = store.settings();
    var canDuel = duelAllowed(s.mode), duel = s.players.length > 1;
    var m = ui.setMain('<section class="screen settings-screen">' +
      '<div class="settings-header"><div><p class="eyebrow">내게 맞게</p><h2>설정</h2></div>' +
        '<button class="btn btn-sm btn-ghost" id="settings-done" type="button">완료</button></div>' +
      '<section class="settings-group"><h3>놀이 조건</h3>' +
        '<p class="settings-caption">' + esc((modeCard(s.mode) || {}).title || '국기 놀이') + '에 사용할 조건이에요.</p>' +
        settingRow('p1', '이름', '<input class="text-input" type="text" id="p1" maxlength="10" value="' + esc(s.players[0] || '') + '" placeholder="민규">') +
        settingRow('duel', '둘이서 번갈아 대결', settingSwitch('duel', duel, !canDuel), canDuel ? '국기 놀이에서 함께 답해요' : '국기 놀이를 고르면 사용할 수 있어요') +
        '<div id="p2-field"' + (duel && canDuel ? '' : ' hidden') + '>' + settingRow('p2', '함께할 사람', '<input class="text-input" type="text" id="p2" maxlength="10" value="' + esc(s.players[1] || '아빠') + '" placeholder="아빠">') +
          '<p class="settings-caption" id="duel-note">스티커와 경험치는 <b id="duel-owner">' + esc(s.players[0]) + '</b>의 기록에 쌓여요.</p></div>' +
        settingRow('setting-level', '난이도', settingSelect('setting-level', s.level, levels().map(function (l) { return [l.id, l.label]; }))) +
        settingRow('setting-continent', '대륙', settingSelect('setting-continent', s.continent, CONTINENTS.map(function (c) { return [c, c === 'all' ? '전체' : c]; }))) +
        settingRow('setting-count', '문제 수', settingSelect('setting-count', s.count, COUNTS.map(function (n) { return [n, n === 'all' ? '전부' : n + '문제']; }))) +
        settingRow('setting-timer', '제한 시간', settingSelect('setting-timer', s.timer, [[0, '없음'], [10, '10초'], [20, '20초']], !timedMode(s.mode)), timedMode(s.mode) ? '' : '시간 제한은 국기 놀이에서 사용할 수 있어요') +
        settingRow('opt-review', '한 번 더 만날 나라를 자주', settingSwitch('opt-review', s.reviewFirst)) +
        '<p class="settings-caption" id="settings-pool" role="status"></p>' +
      '</section><section class="settings-group"><h3>소리</h3>' +
        settingRow('opt-sound', '효과음', settingSwitch('opt-sound', s.sound)) +
        settingRow('opt-speak', '이름 읽어주기', settingSwitch('opt-speak', s.speak)) +
        settingRow('opt-bgm', '홈과 도감 배경음', settingSwitch('opt-bgm', s.homeMusic), '효과음이 켜져 있을 때 재생해요') +
        settingRow('opt-correct-music', '정답에 다른 소리', settingSwitch('opt-correct-music', s.correctMusic), '효과음이 켜져 있을 때 재생해요') +
      '</section><section class="settings-group" id="settings-records"><h3>기록 관리</h3>' +
        '<p class="settings-caption">기록은 이 기기의 브라우저에 저장돼요.</p>' +
        '<div class="settings-actions"><button class="btn" id="settings-export" type="button">기록 내보내기</button>' +
          '<button class="btn btn-ghost danger-text" id="settings-reset" type="button">기록 초기화</button></div><div id="export-out"></div>' +
      '</section></section>');
    ui.$('#settings-done', m).addEventListener('click', closeSettings);
    function updatePool() {
      var current = store.settings();
      var count = quiz.pool({ level: current.level, continent: current.continent, axis: quiz.MODES[current.mode].axis }).length;
      ui.$('#settings-pool', m).textContent = '지금 조건에 맞는 나라는 ' + count + '개예요.';
    }
    ['level', 'continent', 'count', 'timer'].forEach(function (key) {
      ui.$('#setting-' + key, m).addEventListener('change', function (event) {
        var value = event.target.value;
        if (key === 'timer' || (key === 'count' && value !== 'all')) value = Number(value);
        var patch = {}; patch[key] = value;
        store.updateSettings(patch);
        updatePool();
      });
    });
    ui.$('#duel', m).addEventListener('change', function (event) {
      ui.$('#p2-field', m).hidden = !event.target.checked;
      savePlayers(m);
    });
    ['#p1', '#p2'].forEach(function (sel) {
      ui.$(sel, m).addEventListener('change', function () { savePlayers(m); });
    });
    [['sound', 'opt-sound'], ['speak', 'opt-speak'], ['homeMusic', 'opt-bgm'], ['correctMusic', 'opt-correct-music'], ['reviewFirst', 'opt-review']].forEach(function (pair) {
      ui.$('#' + pair[1], m).addEventListener('change', function (event) {
        var patch = {}; patch[pair[0]] = event.target.checked;
        store.updateSettings(patch);
        audio.setEnabled(store.settings().sound);
        audio.setSpeakEnabled(store.settings().speak);
        musicScreen('settings');
      });
    });
    ui.$('#settings-export', m).addEventListener('click', function () { FQ.screens.exportRecords(); });
    ui.$('#settings-reset', m).addEventListener('click', function () { FQ.screens.resetRecords(); });
    updatePool();
    if (FQ.offline && FQ.offline.render) FQ.offline.render();
    var target = section === 'offline' ? doc.getElementById('offline-panel') : section === 'records' ? ui.$('#settings-records', m) : null;
    if (target) {
      if (section === 'offline') target.open = true;
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  }

  /** 고른 놀이를 다음에도 쓸 수 있게 기억하고 시작한다. */
  function startPlay(m, mode) {
    if (quiz.availableMode(mode) !== mode) return;
    var card = modeCard(mode);
    var last = Object.assign({}, store.settings().lastMode || {});
    if (card) last[card.group] = mode;
    store.updateSettings({ mode: mode, lastMode: last });
    startGame(null);
  }

  /** 보상은 작은 한 줄로 보여 주고 자세한 기록은 따로 연다. */
  function playerCard(s) {
    var lv = FQ.progress.level(), stickers = FQ.progress.stickers();
    var chest = FQ.progress.chestProgress(store.stats().asked);
    return '<button class="home-progress" id="home-progress" type="button">' +
      '<span aria-hidden="true">' + lv.emoji + '</span><span><strong>' + esc(lv.name) + ' · 스티커 ' + stickers.owned + '개</strong>' +
      '<small>경험치 ' + FQ.progress.xp() + ' · 여행 카드 ' + chest.into + ' / ' + chest.need + '</small></span>' + ui.icon('chevron') + '</button>';
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

  function voiceNotice(mode) {
    if (global.navigator.onLine === false || state.speechNeedsConnection) {
      return '<div class="notice">📴 인터넷 없이도 놀 수 있어요. 이름을 듣고 국기를 누르는 놀이로 이어져요.</div>';
    }
    var reason = FQ.speech.unavailableReason();
    if (!reason) return '<div class="notice">🎤 “듣고 있어요”가 나오면 <b>' + answerWhat(mode) + '을 끝까지 말해 주세요.</b> 마이크 사용을 물어보면 “허용”을 눌러 주세요. 음성 인식에는 인터넷 연결이 필요할 수 있어요.</div>';
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
    var input = ui.$('#p1', m);
    if (!input) return;
    var p1 = (input.value || '').trim() || '민규';
    var duel = ui.$('#duel', m).checked;
    var players = [p1];
    if (duel) {
      var p2 = (ui.$('#p2', m).value || '').trim() || '아빠';
      if (p2 === p1) p2 = p2 + '2';
      players.push(p2);
    }
    store.updateSettings({ players: players });
    var owner = ui.$('#duel-owner', m);
    if (owner) owner.textContent = p1;
  }

  /* =================== 게임 시작 =================== */
  function startGame(onlyCodes) {
    state.study = null;
    state.mapStudy = null;
    state.artStudy = null;
    cancelPendingFeedback();
    stopTimer();
    stopListening();
    audio.stopSpeaking();
    // 음성 서버만 잠깐 끊겼던 경우, 새 판에서는 연결 상태에 맞춰 다시 시도한다.
    state.speechNeedsConnection = global.navigator.onLine === false;
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
    state.giftsFound = [];     // 이 판에서 상자로 받은 그림 선물 — 결과 화면용.
    renderQuiz();
    // 말하기는 클릭한 순간 바로 마이크를 연다. 시작 음악보다 듣기를 우선한다.
    if (!speechMode(s.mode)) playMusic('start');
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
      '<span class="quiz-mode-title">' + esc(capitalAxis(g.config.mode) ? '수도 퀴즈' : (modeCard(g.config.mode) || {}).title || '나라 퀴즈') + '</span>' +
      '<span class="chip q-count" aria-label="문제 진행">' + (g.index + 1) + ' / ' + g.total + '</span>' +
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

  /** 수도 안에 있는 명소 그림(D26): 명소 도시가 수도와 같은 나라만. 수도 이름 소리에 그림 갈고리를 붙인다(파리=에펠탑, 런던=빅벤, 서울=광화문). */
  function capitalPlace(country) {
    if (!country || !FQ.features || !FQ.features.on('art')) return null;
    var subject = artSubject(country.code, 'place');
    if (!subject || !subject.city) return null;
    var squeeze = function (s) { return String(s || '').replace(/\s/g, ''); };
    if (squeeze(subject.city) !== squeeze(country.capital)) return null;
    return artFor(country.code, 'place');
  }

  /** 긴 수도 이름은 폰 한 줄에 들어오게 명패 글자를 한 단계씩 줄인다(6~7 글자 len-m, 8 글자부터 len-l). 다섯 글자까지가 194개 중 178개다. */
  function capitalWordSize(name) {
    var n = String(name || '').replace(/\s/g, '').length;
    return n >= 8 ? ' len-l' : n >= 6 ? ' len-m' : '';
  }

  /**
   * 수도 명패(D29): 수도 놀이의 주인공은 수도 이름이다. '🏙️ 수도' 꼬리표 아래 수도 이름을 화면에서 가장 큰 글자로 둔다.
   * 수도 안 명소 그림(D26)이 있으면 명패 안에 같이 둔다. opts.hidden 이면 이름 자리에 물음표를 둔다(수도 말하기 문제 — 수도가 답이다).
   */
  function capitalPlate(country, place, opts) {
    opts = opts || {};
    var size = opts.hidden ? '' : capitalWordSize(country.capital);
    return '<div class="capital-plate' + (place ? ' has-art' : '') + (opts.hidden ? ' is-hidden' : '') + '"' + (opts.id ? ' id="' + opts.id + '"' : '') + '>' +
      (place ? '<figure class="capital-place"><img src="' + esc(place.src) + '" alt="' + esc(place.alt) + '"><figcaption>' + esc(place.alt) + '</figcaption></figure>' : '') +
      '<div class="capital-plate-text"><span class="capital-tag">🏙️ 수도</span>' +
        '<span class="capital-word' + size + '"' + (opts.id ? ' id="' + opts.id + '-word"' : '') + '>' + (opts.hidden ? '?' : esc(country.capital)) + '</span>' +
      '</div>' +
    '</div>';
  }

  /** 명패 아래 한 줄(D29): 국기와 '○○의 수도예요'. 읽어 주는 두 번째 문구와 같은 글이라 소리와 글자가 같은 순서로 놓인다. */
  function capitalOf(country) {
    return '<div class="capital-of">' +
      '<img class="capital-of-flag" src="' + ui.flagSrc(country.code) + '" alt="' + esc(country.ko) + ' 국기">' +
      '<span class="capital-of-text"><b>' + esc(country.ko) + '</b>의 수도예요</span>' +
    '</div>';
  }

  /* =================== 수도 공부 / 퀴즈 선택 =================== */
  function enterCapitalScreen(screen) {
    if (state.artTimer) { global.clearTimeout(state.artTimer); state.artTimer = null; }
    cancelPendingFeedback();
    stopTimer();
    stopListening();
    audio.stopSpeaking();
    state.game = null;
    musicScreen(screen);
  }

  /* =================== 그림·명소 공부 / 퀴즈 선택 =================== */
  function artTitle(mode) { return mode === 'place' ? '명소' : '그림'; }

  function artStudyPool(mode) {
    var s = store.settings();
    return quiz.pool({ level: s.level, continent: s.continent, axis: mode });
  }

  function artBatchSize(list) {
    var count = store.settings().count;
    return count === 'all' ? list.length : Math.min(list.length, Math.max(1, Number(count) || 10));
  }

  function renderArtMenu(mode) {
    if (mode !== 'symbol' && mode !== 'place') mode = state.artMode || 'symbol';
    if (quiz.availableMode(mode) !== mode) { renderHome(); return; }
    enterCapitalScreen('art-menu');
    state.artStudy = null;
    state.artMode = mode;
    state.category = 'art';
    var last = Object.assign({}, store.settings().lastMode || {});
    last.art = mode;
    var s = store.updateSettings({ mode: mode, lastMode: last });
    var list = artStudyPool(mode);
    var title = artTitle(mode);
    var scope = (s.continent === 'all' ? '모든 대륙' : s.continent) + ' · ' +
      (quiz.LEVEL_LABEL[s.level] || '모든 난이도') + ' · 한 번에 ' + artBatchSize(list) + '개';
    var m = ui.setMain('<section class="screen art-menu">' +
      '<div class="screen-heading"><button class="btn btn-sm btn-ghost" id="art-category" type="button">' + ui.icon('back') + ' 그림 놀이</button>' +
        '<h2>' + title + ' 놀이</h2></div>' +
      '<button class="category-settings btn btn-ghost" id="art-settings" type="button">' + ui.icon('settings') + esc(scope) + '</button>' +
      '<div class="art-paths">' +
        '<section class="card art-path"><span class="capital-path-icon" aria-hidden="true">' + ui.icon('book') + '</span><h3>' + title + ' 공부</h3>' +
          '<p>' + title + '과 나라 이름을 함께 보고 듣고,<br>내 속도로 넘겨요.</p>' +
          '<button class="btn btn-big btn-primary" id="art-study-start" type="button"' + (list.length ? '' : ' disabled') + '>공부하기</button></section>' +
        '<section class="card art-path"><span class="capital-path-icon" aria-hidden="true">' + ui.icon('flag') + '</span><h3>' + title + ' 퀴즈</h3>' +
          '<p>' + title + '을 보고 어느 나라인지<br>바로 맞혀 봐요.</p>' +
          '<button class="btn btn-big btn-primary" id="art-quiz-start" type="button"' + (list.length ? '' : ' disabled') + '>퀴즈 풀기</button></section>' +
      '</div>' +
      (!list.length ? '<p class="notice">지금 조건에 맞는 ' + title + '이 없어요. 설정에서 대륙이나 난이도를 바꿔 주세요.</p>' : '') +
      '<p class="small muted art-menu-note">공부에는 점수가 없어요. 퀴즈는 바로 문제를 풀어요.</p></section>');
    ui.$('#art-category', m).addEventListener('click', function () { renderCategory('art'); });
    ui.$('#art-settings', m).addEventListener('click', function () { renderSettings(); });
    ui.$('#art-study-start', m).addEventListener('click', function () { startArtStudy(mode); });
    ui.$('#art-quiz-start', m).addEventListener('click', function () { startPlay(null, mode); });
  }

  /** 공부 화면에서는 채점·여행 카드·도장을 갱신하지 않는다. 다음 묶음은 아직 안 본 소재부터 펼친다. */
  function startArtStudy(mode, onlyCodes) {
    if (mode !== 'symbol' && mode !== 'place') return;
    var list = onlyCodes && onlyCodes.length ? quiz.pool({ axis: mode, only: onlyCodes }) : artStudyPool(mode);
    var seenCodes = state.studiedArt[mode];
    var fresh = list.filter(function (c) { return !seenCodes[c.code]; });
    var seen = list.filter(function (c) { return seenCodes[c.code]; });
    state.artMode = mode;
    state.study = null;
    state.mapStudy = null;
    state.artStudy = { mode: mode, countries: util.shuffle(fresh).concat(util.shuffle(seen)).slice(0, artBatchSize(list)), index: 0 };
    var s = store.settings();
    audio.setEnabled(s.sound);
    audio.setSpeakEnabled(s.speak);
    audio.unlock();
    renderArtStudy();
  }

  function renderArtStudy() {
    enterCapitalScreen('art-study');
    var study = state.artStudy;
    if (!study || !study.countries.length) {
      var empty = ui.setMain('<section class="screen card art-study-done"><h2>이 범위에는 볼 그림이 없어요</h2>' +
        '<p>설정에서 대륙이나 난이도를 바꿔 주세요.</p><button class="btn btn-big" id="art-study-home" type="button">그림 놀이로</button></section>');
      ui.$('#art-study-home', empty).addEventListener('click', function () { renderArtMenu(state.artMode); });
      return;
    }
    if (study.index >= study.countries.length) { renderArtStudyDone(); return; }
    var c = study.countries[study.index];
    var mode = study.mode;
    var title = artTitle(mode);
    var art = artFor(c.code, mode);
    var subject = artSubject(c.code, mode) || {};
    state.studiedArt[mode][c.code] = true;
    var detail = mode === 'place' ? subject.city : subject.cat;
    var m = ui.setMain('<section class="screen art-study">' +
      '<div class="screen-heading"><button class="btn btn-sm btn-ghost" id="art-study-back" type="button">' + ui.icon('back') + ' ' + title + ' 놀이</button>' +
        '<h2>' + title + ' 공부</h2><span class="chip" id="art-study-count">' + (study.index + 1) + ' / ' + study.countries.length + '</span></div>' +
      '<div class="card art-study-card">' +
        '<figure class="art-study-figure">' +
          (art ? '<img id="art-study-image" src="' + esc(art.src) + '" alt="' + esc(art.alt) + '" width="1024" height="768">' : '') +
          '<div id="art-study-error" class="art-study-error" role="status"' + (art ? ' hidden' : '') + '><span aria-hidden="true">🖼️</span>' +
            '<p>그림을 불러오지 못했어요. 다음 ' + title + '으로 계속할 수 있어요.</p>' +
            '<button class="btn btn-sm btn-ghost" id="art-study-retry" type="button"' + (art ? '' : ' disabled') + '>다시 불러오기</button></div>' +
          '<figcaption>' + esc(art ? art.alt : artAlt(c.code, mode)) +
            (detail ? '<small>' + esc(detail) + '</small>' : '') + '</figcaption></figure>' +
        '<div class="art-study-info"><img src="' + ui.flagSrc(c.code) + '" alt="' + esc(c.ko) + ' 국기">' +
          '<div><h3>' + esc(c.ko) + '</h3><p>' + esc(c.continent) + ' · ' + esc(c.region) + '</p></div></div>' +
        '<p class="art-study-fact">' + esc(c.fact) + '</p>' +
        '<button class="btn btn-listen btn-listen-soft" id="art-study-speak" type="button">🔊 다시 듣기</button></div>' +
      '<div class="study-actions"><button class="btn btn-big btn-ghost" id="art-study-prev" type="button"' + (study.index ? '' : ' disabled') + '>← 이전 ' + title + '</button>' +
        '<button class="btn btn-big btn-primary" id="art-study-next" type="button">' + (study.index === study.countries.length - 1 ? '공부 마치기 ✓' : '다음 ' + title + ' →') + '</button></div></section>');
    function listen() { speakLines(ui.$('#art-study-speak', m), [c.ko, artAlt(c.code, mode), c.fact].filter(Boolean), '🔊 다시 듣기'); }
    ui.$('#art-study-back', m).addEventListener('click', function () { renderArtMenu(mode); });
    ui.$('#art-study-speak', m).addEventListener('click', listen);
    ui.$('#art-study-prev', m).addEventListener('click', function () {
      if (state.artStudy !== study || study.index <= 0) return;
      study.index -= 1;
      renderArtStudy();
    });
    ui.$('#art-study-next', m).addEventListener('click', function () {
      if (state.artStudy !== study) return;
      study.index += 1;
      renderArtStudy();
    });
    var studyImage = ui.$('#art-study-image', m);
    if (studyImage && art) {
      function imageState(failed) {
        if (state.artStudy !== study || state.screen !== 'art-study' || study.countries[study.index] !== c) return;
        studyImage.hidden = failed;
        ui.$('#art-study-error', m).hidden = !failed;
      }
      studyImage.addEventListener('error', function () { imageState(true); });
      studyImage.addEventListener('load', function () { imageState(false); });
      ui.$('#art-study-retry', m).addEventListener('click', function () {
        imageState(false);
        studyImage.src = art.src;
      });
      if (studyImage.complete && !studyImage.naturalWidth) imageState(true);
    }
    if (store.settings().speak) listen();
  }

  function renderArtStudyDone() {
    musicScreen('art-study-done');
    var study = state.artStudy;
    var title = artTitle(study.mode);
    var hasMore = artStudyPool(study.mode).some(function (c) { return !state.studiedArt[study.mode][c.code]; });
    var m = ui.setMain('<section class="screen card art-study-done"><h2>' + title + ' 공부를 마쳤어요</h2>' +
      '<p>' + study.countries.length + '개 나라의 ' + title + '을 만나봤어요.</p>' +
      '<button class="btn btn-big btn-primary" id="art-study-more" type="button">' + (hasMore ? '다른 ' + title + ' 공부하기' : '한 번 더 보기') + '</button>' +
      '<button class="btn btn-big" id="art-study-quiz" type="button">' + title + ' 놀이로</button>' +
      '<button class="btn btn-big btn-ghost" id="art-study-home" type="button">홈으로</button></section>');
    ui.$('#art-study-more', m).addEventListener('click', function () { startArtStudy(study.mode); });
    ui.$('#art-study-quiz', m).addEventListener('click', function () { renderArtMenu(study.mode); });
    ui.$('#art-study-home', m).addEventListener('click', renderHome);
  }

  function capitalStudyPool() {
    var s = store.settings();
    return quiz.pool({ level: s.level, continent: s.continent, axis: 'capital' });
  }

  function capitalBatchSize(list) {
    var count = store.settings().count;
    return count === 'all' ? list.length : Math.min(list.length, Math.max(1, Number(count) || 10));
  }

  function startCapitalQuiz(mode) {
    if (mode !== 'capital' && mode !== 'capitalVoice') return;
    var last = Object.assign({}, store.settings().lastMode || {});
    last.capital = mode;
    store.updateSettings({ mode: mode, lastMode: last });
    startGame(null);
  }

  function renderCapitalMenu() {
    enterCapitalScreen('capital-menu');
    state.study = null;
    state.mapStudy = null;
    var remembered = tileMode(PLAY_TILES[3], store.settings());
    var s = store.updateSettings({ mode: remembered });
    var list = capitalStudyPool();
    var scope = (s.continent === 'all' ? '모든 대륙' : s.continent) + ' · ' +
      (quiz.LEVEL_LABEL[s.level] || '모든 난이도') + ' · 한 번에 ' + capitalBatchSize(list) + '개';
    var m = ui.setMain('<section class="screen capital-menu">' +
      '<div class="capital-nav"><button class="btn btn-sm btn-ghost" id="capital-home" type="button">' + ICONS.home + ' 홈으로</button><h2>수도 놀이</h2></div>' +
      '<button class="capital-scope category-settings btn btn-ghost" id="capital-settings" type="button">' + ui.icon('settings') + esc(scope) + '</button>' +
      '<div class="capital-paths">' +
        '<section class="card capital-path"><span class="capital-path-icon" aria-hidden="true">' + ui.icon('book') + '</span><h3>수도 공부</h3>' +
          '<p>나라와 수도를 듣고,<br>내 속도로 넘겨요.</p>' +
          '<button class="btn btn-big btn-yellow" id="capital-study-start" type="button">공부하기</button></section>' +
        '<section class="card capital-path"><span class="capital-path-icon" aria-hidden="true">' + ui.icon('flag') + '</span><h3>수도 퀴즈</h3>' +
          '<p>서로 다른 수도를<br>바로 맞혀 봐요.</p>' +
          '<button class="btn btn-big btn-primary" id="capital-choice-start" type="button">듣고 국기 고르기</button>' +
          '<button class="btn btn-big btn-ghost" id="capital-voice-start" type="button">말로 답하기</button></section>' +
      '</div></section>');
    ui.$('#capital-home', m).addEventListener('click', renderHome);
    ui.$('#capital-settings', m).addEventListener('click', function () { renderSettings(); });
    ui.$('#capital-study-start', m).addEventListener('click', startCapitalStudy);
    ui.$('#capital-choice-start', m).addEventListener('click', function () { startCapitalQuiz('capital'); });
    ui.$('#capital-voice-start', m).addEventListener('click', function () { startCapitalQuiz('capitalVoice'); });
  }

  /** 공부는 정답 기록·점수와 분리한다. 이 앱에서 이미 본 수도는 다음 묶음의 뒤로 보낸다. */
  function startCapitalStudy() {
    var list = capitalStudyPool();
    var fresh = list.filter(function (c) { return !state.studiedCapitals[c.code]; });
    var seen = list.filter(function (c) { return state.studiedCapitals[c.code]; });
    state.study = { countries: util.shuffle(fresh).concat(util.shuffle(seen)).slice(0, capitalBatchSize(list)), index: 0 };
    var s = store.settings();
    audio.setEnabled(s.sound);
    audio.setSpeakEnabled(s.speak);
    audio.unlock();
    renderCapitalStudy();
  }

  function renderCapitalStudy() {
    enterCapitalScreen('capital-study');
    var study = state.study;
    if (!study || !study.countries.length) {
      var empty = ui.setMain('<section class="screen card capital-study-done"><h2>이 범위에는 수도가 없어요</h2>' +
        '<p>설정에서 대륙이나 난이도를 바꿔 주세요.</p><button class="btn btn-big" id="study-home" type="button">홈으로</button></section>');
      ui.$('#study-home', empty).addEventListener('click', renderHome);
      return;
    }
    if (study.index >= study.countries.length) { renderCapitalStudyDone(); return; }
    var c = study.countries[study.index];
    state.studiedCapitals[c.code] = true;
    var m = ui.setMain('<section class="screen capital-study">' +
      '<div class="capital-nav"><button class="btn btn-sm btn-ghost" id="study-back" type="button">' + ICONS.back + ' 수도 놀이</button>' +
        '<h2>수도 공부</h2><span class="chip" id="study-count">' + (study.index + 1) + ' / ' + study.countries.length + '</span></div>' +
      '<div class="card capital-study-card">' + capitalPlate(c, capitalPlace(c)) + capitalOf(c) +
        '<button class="btn btn-listen btn-listen-soft" id="study-speak" type="button">🔊 다시 듣기</button></div>' +
      '<div class="study-actions"><button class="btn btn-big btn-ghost" id="study-prev" type="button"' + (study.index ? '' : ' disabled') + '>← 이전 수도</button>' +
        '<button class="btn btn-big btn-yellow" id="study-next" type="button">' +
          (study.index === study.countries.length - 1 ? '공부 마치기 ✓' : '다음 수도 →') + '</button></div></section>');
    function listen() { speakLines(ui.$('#study-speak', m), [c.capital, c.ko + '의 수도예요'], '🔊 다시 듣기'); }
    ui.$('#study-back', m).addEventListener('click', renderCapitalMenu);
    ui.$('#study-speak', m).addEventListener('click', listen);
    ui.$('#study-prev', m).addEventListener('click', function () {
      if (state.study !== study || study.index <= 0) return;
      study.index -= 1;
      renderCapitalStudy();
    });
    ui.$('#study-next', m).addEventListener('click', function () {
      if (state.study !== study) return;
      study.index += 1;
      renderCapitalStudy();
    });
    if (store.settings().speak) listen();
  }

  function renderCapitalStudyDone() {
    musicScreen('capital-study-done');
    var count = state.study.countries.length;
    var hasMore = capitalStudyPool().some(function (c) { return !state.studiedCapitals[c.code]; });
    var m = ui.setMain('<section class="screen card capital-study-done"><span class="capital-path-icon" aria-hidden="true">📖</span>' +
      '<h2>수도 공부를 마쳤어요</h2><p>' + count + '개 나라의 수도를 만나봤어요.</p>' +
      '<button class="btn btn-big btn-yellow" id="study-more" type="button">' + (hasMore ? '다른 수도 공부하기' : '한 번 더 보기') + '</button>' +
      '<button class="btn btn-big btn-primary" id="study-quiz" type="button">🧩 퀴즈 고르기</button>' +
      '<button class="btn btn-big btn-ghost" id="study-home" type="button">홈으로</button></section>');
    ui.$('#study-more', m).addEventListener('click', startCapitalStudy);
    ui.$('#study-quiz', m).addEventListener('click', renderCapitalMenu);
    ui.$('#study-home', m).addEventListener('click', renderHome);
  }

  /* =================== 지도 공부 / 퀴즈 선택 =================== */
  function mapStudyPool() {
    var s = store.settings();
    return quiz.pool({ level: s.level, continent: s.continent, axis: 'map' });
  }

  function mapBatchSize(list) {
    var count = store.settings().count;
    return count === 'all' ? list.length : Math.min(list.length, Math.max(1, Number(count) || 10));
  }

  function renderMapMenu() {
    enterCapitalScreen('map-menu');
    state.study = null;
    state.mapStudy = null;
    var s = store.updateSettings({ mode: 'map' });
    var list = mapStudyPool();
    var scope = (s.continent === 'all' ? '모든 대륙' : s.continent) + ' · ' +
      (quiz.LEVEL_LABEL[s.level] || '모든 난이도') + ' · 한 번에 ' + mapBatchSize(list) + '개';
    var m = ui.setMain('<section class="screen map-menu">' +
      '<div class="map-nav"><button class="btn btn-sm btn-ghost" id="map-home" type="button">' + ui.icon('back') + ' 놀이</button><h2>지도 놀이</h2></div>' +
      '<button class="category-settings btn btn-ghost" id="map-settings" type="button">' + ui.icon('settings') + esc(scope) + '</button>' +
      '<div class="map-paths">' +
        '<section class="card map-path"><span class="capital-path-icon">' + ui.icon('book') + '</span><h3>지도 공부</h3>' +
          '<p>어느 대륙에 있는지 살펴보고,<br>나라 주변을 크게 봐요.</p>' +
          '<button class="btn btn-big btn-primary" id="map-study-start" type="button"' + (list.length ? '' : ' disabled') + '>공부하기</button></section>' +
        '<section class="card map-path"><span class="capital-path-icon">' + ui.icon('map') + '</span><h3>지도 퀴즈</h3>' +
          '<p>세계지도에서 나라의 위치를<br>바로 찾아봐요.</p>' +
          '<button class="btn btn-big btn-primary" id="map-quiz-start" type="button"' + (list.length ? '' : ' disabled') + '>퀴즈 풀기</button></section></div>' +
      (!list.length ? '<p class="notice">지금 조건에 맞는 나라가 없어요. 설정에서 대륙이나 난이도를 바꿔 주세요.</p>' : '') +
      '<p class="small muted map-menu-note">공부는 점수 없이 내 속도로, 퀴즈는 서로 다른 나라로 진행해요.</p></section>');
    ui.$('#map-home', m).addEventListener('click', renderHome);
    ui.$('#map-settings', m).addEventListener('click', function () { renderSettings(); });
    ui.$('#map-study-start', m).addEventListener('click', function () { startMapStudy(); });
    ui.$('#map-quiz-start', m).addEventListener('click', function () { startPlay(null, 'map'); });
  }

  /** 지도 공부는 정답·도장·경험치를 쓰지 않는다. 이미 본 나라는 다음 묶음의 뒤로 보낸다. */
  function startMapStudy(onlyCodes) {
    var list = mapStudyPool();
    if (onlyCodes && onlyCodes.length) list = quiz.pool({ axis: 'map', only: onlyCodes });
    var fresh = list.filter(function (c) { return !state.studiedMap[c.code]; });
    var seen = list.filter(function (c) { return state.studiedMap[c.code]; });
    state.study = null;
    state.mapStudy = { countries: util.shuffle(fresh).concat(util.shuffle(seen)).slice(0, mapBatchSize(list)), index: 0 };
    var s = store.settings();
    audio.setEnabled(s.sound);
    audio.setSpeakEnabled(s.speak);
    audio.unlock();
    renderMapStudy();
  }

  function renderMapStudy() {
    enterCapitalScreen('map-study');
    var study = state.mapStudy;
    if (!study || !study.countries.length) { renderMapMenu(); return; }
    if (study.index >= study.countries.length) { renderMapStudyDone(); return; }
    var c = study.countries[study.index];
    state.studiedMap[c.code] = true;
    var m = ui.setMain('<section class="screen map-study">' +
      '<div class="map-nav"><button class="btn btn-sm btn-ghost" id="map-study-back" type="button">' + ui.icon('back') + ' 지도 놀이</button>' +
        '<h2>지도 공부</h2><span class="chip" id="map-study-count">' + (study.index + 1) + ' / ' + study.countries.length + '</span></div>' +
      '<div class="map-study-card">' +
        '<div class="map-study-heading"><img class="map-question-flag" src="' + ui.flagSrc(c.code) + '" alt="' + esc(c.ko) + ' 국기">' +
          '<div><h3>' + esc(c.ko) + '</h3><p>' + esc(c.continent) + ' · ' + esc(c.region) + '</p></div>' +
          '<button class="btn btn-listen btn-listen-soft" id="map-study-speak" type="button">🔊 나라 설명 듣기</button></div>' +
        FQ.map.study(c) + '</div>' +
      '<div class="study-actions"><button class="btn btn-big btn-ghost" id="map-study-prev" type="button"' + (study.index ? '' : ' disabled') + '>← 이전 나라</button>' +
        '<button class="btn btn-big btn-primary" id="map-study-next" type="button">' + (study.index === study.countries.length - 1 ? '공부 마치기 ✓' : '다음 나라 →') + '</button></div></section>');
    function listen() { speakLines(ui.$('#map-study-speak', m), [c.ko, c.fact], '🔊 나라 설명 듣기'); }
    ui.$('#map-study-back', m).addEventListener('click', renderMapMenu);
    ui.$('#map-study-speak', m).addEventListener('click', listen);
    ui.$('#map-study-prev', m).addEventListener('click', function () {
      if (state.mapStudy !== study || study.index <= 0) return;
      study.index -= 1;
      renderMapStudy();
    });
    ui.$('#map-study-next', m).addEventListener('click', function () {
      if (state.mapStudy !== study) return;
      study.index += 1;
      renderMapStudy();
    });
    if (store.settings().speak) listen();
  }

  function renderMapStudyDone() {
    musicScreen('map-study-done');
    var count = state.mapStudy.countries.length;
    var hasMore = mapStudyPool().some(function (c) { return !state.studiedMap[c.code]; });
    var m = ui.setMain('<section class="screen card map-study-done"><h2>지도 공부를 마쳤어요</h2>' +
      '<p>' + count + '개 나라가 어디에 있는지 살펴봤어요.</p>' +
      '<button class="btn btn-big btn-primary" id="map-study-more" type="button">' + (hasMore ? '다른 나라 공부하기' : '한 번 더 보기') + '</button>' +
      '<button class="btn btn-big" id="map-study-quiz" type="button">지도 놀이로</button>' +
      '<button class="btn btn-big btn-ghost" id="map-study-home" type="button">홈으로</button></section>');
    ui.$('#map-study-more', m).addEventListener('click', function () { startMapStudy(); });
    ui.$('#map-study-quiz', m).addEventListener('click', renderMapMenu);
    ui.$('#map-study-home', m).addEventListener('click', renderHome);
  }

  /** 🔊 단추 하나로 이름을 읽는다. data-speak 문구 뒤에 data-speak-extra 문구가 있으면 이어서 읽고, data-speak-lines('|'로 나눔)면 그 전부를 읽는다. */
  function speakFromButton(t, after) {
    var lines;
    var joined = t.getAttribute('data-speak-lines');
    if (joined) {
      lines = joined.split('|').filter(Boolean);
    } else {
      lines = [t.getAttribute('data-speak')];
      var extra = t.getAttribute('data-speak-extra');
      if (extra) lines.push(extra);
    }
    speakLines(t, lines, t.getAttribute('data-label') || '🔊 들어보기', after);
  }

  /** 문구를 읽는다. 끝나거나 실패하면(같은 화면일 때만) after 를 부른다 — 말하기 놀이가 마이크를 다시 여는 자리다. */
  function speakLines(t, lines, label, after) {
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
      audio.say(lines, { onEnd: function () { if (nameCurrent() && after) after(); } }, function () {
        if (!nameCurrent()) return;
        t.classList.add('needs-tap');
        t.textContent = '🔊 다시 눌러서 듣기';
        if (after) after();
      });
    });
  }

  /* =================== 퀴즈 화면 =================== */
  function renderQuiz(keep) {
    if (state.artTimer) { global.clearTimeout(state.artTimer); state.artTimer = null; }
    state.questionGeneration += 1;
    cancelPendingFeedback();
    var g = state.game;
    if (!g || g.isOver()) return finishGame();
    state.answered = false;
    state.artUnavailable = false;
    if (!keep) {
      state.usedHint = false;
      state.hintLevel = 0;
      state.revealed = false;
      state.removed = [];
    }
    state.timedOut = false;
    state.timerPaused = false;
    state.listenFailures = 0;

    var q = g.current();
    var s = store.settings();
    if (speechMode(q.mode) && (global.navigator.onLine === false || state.speechNeedsConnection)) touchQuestion(q);
    var duel = g.players.length > 1;
    var stage;
    if (q.mode === 'symbol' || q.mode === 'place') {
      var art = artFor(q.country.code, q.mode);
      // 그림 없는 나라는 출제 풀에서 걸러진다. 그래도 옛 자료와 새 화면이 섞여 캐시에 굳으면
      // 여기에 닿을 수 있다 — 그때 죽으면 아이가 시작을 눌러도 화면이 멈춘 채 아무 일도 안 난다.
      // 기다릴 그림이 아예 없으면 잠그지 않는다. 아이가 건너뛸 수 있어야 한다.
      state.artUnavailable = !!art;
      // 소재 이름에 나라 이름이 들어 있으면 정답이므로 문제의 글·음성·대체 텍스트에서 감춘다.
      var stageArtName = artAlt(q.country.code, q.mode);
      var quizArtName = stageArtName && !revealsCountry(stageArtName, q.country) ? stageArtName : '';
      // 그림을 못 받았을 때의 화면은 글자를 못 읽는 아이가 봐도 알 수 있어야 한다 — 큰 그림 하나, 큰 단추 하나.
      // 문제에서 읽어 주는 것은 정답을 드러내지 않는 기존 수아 음원뿐이다.
      var artErrorBody = '<div class="art-error-emoji" aria-hidden="true">🖼️</div><p>그림을 불러오지 못했어요.</p>';
      var artImage = art ? '<img id="question-art" src="' + esc(art.src) + '" alt="' + esc(quizArtName || (q.mode === 'place' ? '나라를 맞힐 명소 그림' : '나라를 맞힐 상징 그림')) + '" width="1024" height="768">' +
          '<p id="art-loading" role="status">그림을 불러오고 있어요…</p>' +
          '<div id="art-error" class="art-error" hidden>' + artErrorBody +
            '<button class="btn btn-primary btn-big" id="art-retry" type="button">🔄 다시 불러오기</button>' +
            '<button class="btn btn-big btn-yellow" id="art-next" type="button">⏭ 다음 그림</button>' +
            (quizArtName ? '<button class="btn btn-big" data-speak="' + esc(quizArtName) + '" type="button">🔊 그림 이름 듣기</button>' : '') +
          '</div>'
          : '<div id="art-error" class="art-error">' + artErrorBody + '<button class="btn btn-big btn-yellow" id="art-next" type="button">⏭ 다음 그림</button></div>';
      stage = '<div class="flag-stage art-question"><div class="q-label">' +
          (q.mode === 'place' ? '이 명소가 있는 나라는 어디일까요?' : '이 그림은 어느 나라를 떠올리게 하나요?') + '</div>' +
          artImage +
          (quizArtName ? listenButton(quizArtName) : '') + '</div>';
    } else if (q.mode === 'map') {
      // 시안(PhoneMap): 국기 120×80 과 이름을 한 줄에, 아래에 🔊 전폭. 아이패드 세로에서는 국기·이름·🔊 가 한 줄 카드가 된다(css).
      stage = '<div class="flag-stage map-question">' +
        '<div class="q-label">이 나라는 어디에 있을까요?</div>' +
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
          listenButton(q.country.ko, null, q.touchFallback ? 'touch-listen' : null) +
        '</div>';
    } else if (capitalAxis(q.mode)) {
      // 수도 퀴즈는 소개 카드 없이 시작한다. 듣기는 수도 이름, 말하기는 국기와 나라 이름을 문제로 낸다.
      stage = q.mode === 'capitalVoice'
          ? '<div class="flag-stage capital-say">' +
            '<div class="q-label">🏙️ 이 나라의 수도를 말해 보세요</div>' +
            '<div class="map-who">' +
              '<img class="map-question-flag" src="' + ui.flagSrc(q.country.code) + '" alt="' + esc(q.country.ko) + ' 국기">' +
              '<div class="big-name">' + esc(q.country.ko) + '</div>' +
            '</div>' +
            // 답이 수도라 이름 자리는 물음표다. 힌트로 수도를 들려줄 때 이 자리에 이름이 뜬다(showHint).
            capitalPlate(q.country, null, { hidden: true, id: 'say-plate' }) +
            listenButton(q.country.ko, null, 'say-listen') +
          '</div>'
          : '<div class="flag-stage capital-question">' +
            '<div class="q-label">🏙️ 어느 나라의 수도일까요?</div>' +
            capitalPlate(q.country, null) +
            // 88px 는 이 단추만의 크기다(css .capital-question .btn-listen — .btn-listen 은 폰 56px·아이패드 64px). 라벨은 speakLines 가 textContent 로 바꾸므로 글자 그대로.
            '<button class="btn btn-listen capital-listen" id="capital-listen" data-speak="' + esc(q.country.capital) + '" data-label="🔊 눌러서 들어보기" type="button">🔊 눌러서 들어보기</button>' +
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
    // 지도는 답을 고르면 위치 설명을 전체 폭으로 보여 준다. 다른 놀이는 기존 정답 카드 배치를 따른다.
    var html =
      '<section class="screen quiz-screen' + (q.mode === 'map' ? ' map-screen' : '') + '">' +
        quizHead(g, s, chest, lv) +
        '<div class="quiz-body' + (q.mode === 'map' ? ' map-quiz' : '') + '">' +
          '<div class="quiz-stage-col">' +
            (q.touchFallback ? '<div class="notice" role="status">👆 이름을 듣고 국기를 눌러요</div>' : '') +
            stage + '<div id="feedback-area" role="status" aria-live="polite"></div></div>' +
          '<div class="quiz-answer-col">' +
            '<div id="answer-area">' + answerArea(q) + '</div>' +
            '<div class="row tool-row">' +
              '<button class="btn btn-sm btn-tool" id="hint" type="button">' + ICONS.bulb + '<span>힌트</span></button>' +
              '<button class="btn btn-sm btn-tool btn-tool-soft" id="skip" type="button">' + ICONS.hand + '<span>몰라요</span></button>' +
            '</div>' +
            '<div id="hint-area"></div>' +
          '</div>' +
        '</div>' +
      '</section>';

    var m = ui.setMain(html);
    var shell = doc.querySelector('.app');
    if (shell) shell.setAttribute('data-mode', q.mode);

    // 🔊 를 듣고 나면 말하기 놀이는 마이크를 다시 연다(수도 말하기의 나라 이름 듣기·힌트).
    ui.on(m, '[data-speak]', 'click', function (e, t) { speakFromButton(t, resumeListening); });

    // 수도 문제는 글자가 아니라 소리가 문제다. 뜨자마자 수도 이름을 한 번 읽어 준다.
    if (q.mode === 'capital') speakLines(ui.$('#capital-listen', m), [q.country.capital], '🔊 눌러서 들어보기');
    if (q.mode === 'reverse' && q.touchFallback) speakLines(ui.$('#touch-listen', m), [q.country.ko], '🔊 들어보기');
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

    if (q.mode === 'map') {
      var zoom = ui.$('#map-zoom', m);
      zoom.addEventListener('click', function () {
        if (state.game !== g || g.current() !== q || state.answered) return;
        var expanded = zoom.getAttribute('aria-pressed') !== 'true';
        ui.$('.map-explorer', m).classList.toggle('is-zoomed', expanded);
        zoom.setAttribute('aria-pressed', String(expanded));
        zoom.textContent = expanded ? '세계 전체 보기' : '지도 확대';
        ui.$('#map-view-help', m).textContent = expanded ? '좌우로 움직여 살펴보세요' : '점이 가리키는 위치를 골라요';
        var mapScroll = ui.$('#map-scroll', m);
        mapScroll.scrollLeft = expanded ? (mapScroll.scrollWidth - mapScroll.clientWidth) / 2 : 0;
      });
    }
    bindAnswerArea(m, q);
    if (q.mode === 'symbol' || q.mode === 'place') {
      var artNext = ui.$('#art-next', m);
      if (artNext) artNext.addEventListener('click', skipUnscored);
    }
    if (keep && state.usedHint) {
      ui.$('#hint-area', m).innerHTML = keep.hint;
      ui.$('#hint', m).disabled = true;
    }
    var questionArt = ui.$('#question-art', m);
    if ((q.mode === 'symbol' || q.mode === 'place') && questionArt) {
      var artGeneration = state.questionGeneration;
      function artState(status) {
        if (state.game !== g || g.current() !== q || state.answered || artGeneration !== state.questionGeneration) return;
        if (state.artTimer) { global.clearTimeout(state.artTimer); state.artTimer = null; }
        if (status === 'loading') state.artTimer = global.setTimeout(function () { artState('error'); }, 8000);
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
        else if (s.timer && !state.timerId) startTimer();
      }
      questionArt.addEventListener('error', function () { artState('error'); });
      questionArt.addEventListener('load', function () { artState('ready'); });
      ui.$('#art-retry', m).addEventListener('click', function () { artState('loading'); questionArt.src = art.src; });
      artState(questionArt.complete ? (questionArt.naturalWidth > 0 ? 'ready' : 'error') : 'loading');
    }
    preloadNext();
    if (!state.artUnavailable && !state.timerId) startTimer(keep ? keep.timeLeft : undefined);

    if (speechMode(q.mode)) {
      state.listenOn = true;
      audio.stopSpeaking();
      // 단추를 누른 그 흐름 안에서 시작해야 사파리가 마이크 권한을 다시 묻지 않는다.
      // 늦게(setTimeout) 시작하면 사용자가 누른 동작과 끊겨 매번 허용을 물어본다.
      startListening();
    }
  }

  /** 말하기 연결이 끊겨도 같은 나라·차례·기록으로, 소리를 듣고 국기를 고르는 놀이를 이어 간다. */
  function touchQuestion(q) {
    var mode = q.mode === 'capitalVoice' ? 'capital' : 'reverse';
    var s = store.settings();
    var axis = quiz.MODES[mode].axis;
    q.touchFallback = true;
    q.mode = mode;
    q.options = quiz.makeQuestion(q.country, mode, quiz.pool({ level: s.level, continent: s.continent, axis: axis }),
      { axis: axis, spread: mode === 'capital' ? 'far' : undefined }).options;
  }

  function continueWithTouch() {
    var q = state.game && state.game.current();
    if (!q || !speechMode(q.mode) || state.answered) return;
    var keep = { timeLeft: state.timerId || state.timerPaused ? state.timeLeft : 0, hint: ui.$('#hint-area').innerHTML };
    stopListening();
    stopTimer();
    touchQuestion(q);
    renderQuiz(keep);
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
    if (q.mode === 'map') return '<div class="map-explorer"><div class="map-view-tools">' +
      '<span id="map-view-help">점이 가리키는 위치를 골라요</span><button class="btn btn-sm btn-ghost" id="map-zoom" type="button" aria-pressed="false" aria-controls="map-scroll">지도 확대</button></div>' +
      '<div class="map-scroll" id="map-scroll" tabindex="0" aria-label="세계 지도. 확대하면 좌우로 움직일 수 있어요">' + FQ.map.render(q.options) + '</div></div>';
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
    if (speechMode(q.mode)) {
      var reason = FQ.speech.unavailableReason();
      var off = FQ.speech.blocked();
      var what = answerWhat(q.mode);
      return '<div class="mic-wrap">' +
        (reason ? '<div class="notice">⚠️ ' + esc(reason) + '</div>' : '') +
        '<button class="mic-btn" id="mic" type="button" aria-label="듣기 시작하기" aria-pressed="false"' + (off ? ' disabled' : '') + '>🎤</button>' +
        '<div class="listen-state" id="listen-state">' +
          (off ? '마이크를 쓸 수 없어요' : '마이크를 준비하고 있어요…') +
        '</div>' +
        '<div class="heard" id="heard"></div>' +
        '<div class="listen-tip small muted" id="listen-tip">' +
          (off ? '아래에 ' + what + '을 써서 답해 주세요' : '') +
        '</div>' +
        '<details class="type-fallback"' + (off ? ' open' : '') + '>' +
          '<summary>⌨️ 글자로 답하기</summary>' +
          '<div class="field" style="margin-top:10px">' +
            '<input class="text-input" id="answer-input" placeholder="' + what + '을 써 보세요" autocomplete="off">' +
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
    var q = state.game && state.game.current();
    if (!quiz.findCountry(text, answerKind(q ? q.mode : '')) && quiz.isGiveUp(text)) { submit({ text: '' }, true); return; }
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
    // 나라 이름(수도 말하기는 수도 이름)을 먼저 본다. "브라질 뭐지?" 처럼 이름을 말했으면 그것을 답으로 받는다
    var kind = answerKind(q.mode);
    if (quiz.checkText(q.country, text, kind).correct) return { kind: 'answer', text: text };
    var other = quiz.findCountry(text, kind);
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
    if (!question || !speechMode(question.mode)) return;
    if (global.navigator.onLine === false || state.speechNeedsConnection) { continueWithTouch(); return; }
    if (FQ.speech.isListening && FQ.speech.isListening()) return;
    var kind = answerKind(question.mode);
    var what = answerWhat(question.mode);
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
        setListenState('듣고 있어요. ' + what + '을 끝까지 말해 주세요!', 'on');
      },
      interim: function (text) {
        if (!current()) return;
        state.listenFailures = 0;
        var heard = ui.$('#heard');
        if (heard) heard.textContent = text;
        // 중간 결과라도 목표 나라 이름이 확실히 들렸으면 바로 채점한다(D25). 최종 결과를 기다리다
        // 사파리가 스스로 끊어 놓치는 것보다 낫고, 아이는 말하자마자 정답 카드를 본다.
        // 단 이름이 다른 나라 이름의 앞부분인 나라(인도·기니)는 끝까지 듣는다 — “인도네시아”의 “인도”를 먼저 채점하지 않는다.
        // 다른 나라 이름은 중간 결과로 채점하지 않는다(말이 끝나기 전에 틀렸다고 하지 않는다).
        if (!quiz.prefixRisky(question.country, kind) && quiz.checkText(question.country, text, kind).correct) submit({ text: text });
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
          if (hit && hit.kind === 'answer' && quiz.checkText(state.game.current().country, alts[i], kind).correct) {
            submit({ text: alts[i] });
            return;
          }
        }
        for (i = 0; i < alts.length; i++) {
          if (actOn(interpret(alts[i]), alts[i])) return;
        }
        if (heard) heard.textContent = alts[0] || '';
        var tip2 = ui.$('#listen-tip');
        if (tip2) tip2.textContent = what + '을 찾지 못했어요. 한 번 더 말하거나 글자로 답해 주세요.';
      },
      error: function (code, message) {
        if (!current()) return;
        if (code === 'network' || global.navigator.onLine === false) {
          state.speechNeedsConnection = true;
          continueWithTouch();
          return;
        }
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
            : '마이크가 멈췄어요. 마이크를 눌러 다시 시도하거나 글자로 답해 주세요.', 'off');
          openTypeFallback(message || '아래에 나라 이름을 써서 답해도 좋아요.');
          return;
        }
        setListenState('마이크가 잠깐 멈췄어요. 다시 들을게요.', 'off');
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

  /** 🔊 를 듣고 난 뒤 말하기 놀이면 마이크를 다시 연다(문제가 그대로이고 아직 답하지 않았을 때만). */
  function resumeListening() {
    var g = state.game;
    var q = g && g.current();
    if (!q || !speechMode(q.mode) || state.answered || doc.hidden) return;
    state.listenOn = true;
    startListening();
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
      // 소리 힌트 2단계(D24). 글자를 못 읽는 아이에게 대륙·지역 글자는 닿지 않으니 소리로 돕는다 — 둘 다 기존 음원이다.
      // 1단계: 오답 2개 지우기(아래 공통) + 수도 이름 다시 읽기. 대륙·지역 글자는 옆에서 읽어 주는 어른 몫으로 남긴다.
      // 2단계: '○○의 수도예요'(나라 이름)까지 읽는다. 나라 이름을 들으면 국기는 100% 찾으니 늘 성공으로 끝나되(무오류 학습),
      //         기록에는 '아직 모른다'로 남겨 곧 다시 만난다(quiz.js submit 의 opts.revealed).
      state.hintLevel = (state.hintLevel || 0) + 1;
      var capitalBtn = ui.$('#capital-listen');
      if (state.hintLevel >= 2) {
        state.revealed = true;
        lines.push('🏙️ ' + esc(q.country.capital) + ' · ' + esc(q.country.ko) + '의 수도예요');
        if (capitalBtn) {
          capitalBtn.setAttribute('data-speak-extra', q.country.ko + '의 수도예요');
          speakLines(capitalBtn, [q.country.capital, q.country.ko + '의 수도예요'], '🔊 눌러서 들어보기');
        }
      } else {
        lines.push('🗺️ ' + esc(q.country.continent) + ' · ' + esc(q.country.region) + '에 있어요');
        if (capitalBtn) speakLines(capitalBtn, [q.country.capital], '🔊 눌러서 들어보기');
      }
    } else if (q.mode === 'capitalVoice') {
      // 수도 말하기의 힌트는 수도 이름을 들려주는 것뿐이라 곧 답이다 — 듣고 따라 말하는 연습으로 삼는다(D28).
      // 기록에는 '아직'으로 남긴다(D24 힌트 2단계와 같은 규칙). 듣고 나면 마이크를 다시 연다.
      state.revealed = true;
      lines.push('🏙️ ' + esc(q.country.capital) + ' · ' + esc(q.country.ko) + '의 수도예요');
      // 물음표 명패에 수도 이름을 띄운다(D29) — 들으면서 큰 글자도 같이 본다.
      var sayPlate = ui.$('#say-plate');
      var sayWord = ui.$('#say-plate-word');
      if (sayPlate && sayWord) {
        sayPlate.classList.remove('is-hidden');
        sayWord.className = 'capital-word' + capitalWordSize(q.country.capital);
        sayWord.textContent = q.country.capital;
      }
      var sayBtn = ui.$('#say-listen');
      if (sayBtn) {
        sayBtn.setAttribute('data-speak', q.country.capital);
        sayBtn.setAttribute('data-speak-extra', q.country.ko + '의 수도예요');
        speakLines(sayBtn, [q.country.capital, q.country.ko + '의 수도예요'], '🔊 눌러서 들어보기', resumeListening);
      }
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
    if (hintBtn) {
      if (q.mode === 'capital' && state.hintLevel < 2) {
        // 한 번 더 누르면 나라 이름을 들려준다. 🔊 는 아이가 아는 '듣기' 표시다.
        hintBtn.innerHTML = ICONS.bulb + '<span>🔊 나라 듣기</span>';
      } else {
        hintBtn.disabled = true;
      }
    }
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
    if (state.answered || state.artUnavailable) return;
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

    var res = g.submit(payload, state.usedHint, { revealed: !!state.revealed });
    if (!res) return;
    res.gaveUp = !!gaveUp;
    if (q) {
      (state.answeredCodes || (state.answeredCodes = {}))[q.country.code] = true;
      // 여행 카드의 ✓ 는 '외웠다' 표시다. 나라 이름까지 듣고 맞힌 수도 문제는 '한 번 더 만나요' 로 남긴다(D24).
      noteMet(q.country, !!res.learned);
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
    // 다음 판에 이어진다. 선물은 정답을 제출하는 즉시 저장하고, 아직 없는 그림을 먼저 무작위로 준다.
    // state.rng / state.rngKind 는 검사에서 난수를 주입하는 자리다.
    var roll = state.rng || global.Math.random;
    var rollKind = state.rngKind || roll;
    var chestNow = store.chestState();
    res.chest = FQ.progress.chestRoll(chestNow.since + 1, roll());
    if (res.chest) {
      res.chestKind = FQ.progress.chestKind(rollKind());
      res.chestLoot = FQ.progress.chestLoot(res.chestKind);
      res.chestShape = FQ.progress.chestShape(q.country.continent);
      store.recordChest(res.chestKind);
      var gifts = FQ.progress.giftCatalog();
      var ownedGifts = store.giftState().owned;
      var availableGifts = gifts.filter(function (gift) { return ownedGifts.indexOf(gift.id) < 0; });
      var giftPool = availableGifts.length ? availableGifts : gifts;
      res.gift = giftPool[Math.min(giftPool.length - 1, Math.floor(roll() * giftPool.length))];
      res.newGift = store.awardGift(res.gift.id);
      state.giftsFound = (state.giftsFound || []).concat([{ gift: res.gift, isNew: res.newGift }]);
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
    if (wins.length) extra = '<div class="small muted">' + wins.join(' · ') + '</div>';

    var lvNow = FQ.progress.level();
    var fill = ui.$('#xp-fill');
    if (fill) fill.style.width = Math.round(lvNow.ratio * 100) + '%';
    var xpVal = ui.$('#xp-val');
    if (xpVal) xpVal.textContent = lvNow.isMax ? '최고 레벨' : lvNow.into + ' / ' + lvNow.need;
    var chestNow = FQ.progress.chestProgress(store.stats().asked);
    var cTitle = ui.$('#combo-title');
    if (cTitle) cTitle.textContent = res.chest ? '깜짝 상자를 찾았어요!' : '여행 카드 ' + chestNow.into + ' / ' + chestNow.need + '장';
    var travelChip = ui.$('.travel-chip');
    if (travelChip && cTitle) travelChip.setAttribute('aria-label', cTitle.textContent);
    var slots = ui.$('.travel-slots');
    if (slots) slots.innerHTML = travelSlots(chestNow, false);

    // 정답 카드의 다시 듣기는 이름과 설명을 읽는다. 말하기 정답의 첫 안내는 이름만 짧게 읽는다.
    var isCapitalQ = capitalAxis(q.mode);
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
    var voiceWatchdog = null;
    var chestShown = false;
    var chestClosed = false;
    var autoAfterChest = false;
    function clearVoiceWatchdog() {
      if (voiceWatchdog !== null) { global.clearTimeout(voiceWatchdog); voiceWatchdog = null; }
    }
    function cancelNarration() {
      narrationRequest += 1;
      clearVoiceWatchdog();
      stopMusic();
      if (state.autoNextTimer) { global.clearTimeout(state.autoNextTimer); state.autoNextTimer = null; }
    }
    state.cancelFeedbackVoice = cancelNarration;
    function feedbackCurrent() {
      return state.feedbackGeneration === generation && state.game === g &&
        g.current() === q && state.answered && !doc.hidden;
    }
    function afterExplanation(request) {
      if (!feedbackCurrent() || request !== narrationRequest || !res.chest || chestShown) return;
      chestShown = true;
      showChest(c, res, q.mode, function () {
        chestClosed = true;
        if (autoAfterChest) scheduleAutoNext(request, AUTO_NEXT_AFTER_SPEECH);
      });
    }
    // 말하기 정답은 이름을 한 번 더 듣고 자동으로 넘어간다. 오답과 다른 놀이는 정답 카드를 읽을 시간을 준다.
    // 깜짝 상자는 그림 선물을 바로 보여 주고, 닫으면 진행한다. 재생 실패는 다시 듣기 안내를 남긴다.
    var autoNext = speechMode(q.mode) && !!res.correct;
    var quickAnswerSpeech = autoNext ? { lines: [isCapitalQ ? c.capital : c.ko], opts: feedbackSpeech.opts } : feedbackSpeech;
    function scheduleAutoNext(request, delay) {
      if (!autoNext || (res.chest && !chestClosed) || !feedbackCurrent() || request !== narrationRequest) return;
      if (state.autoNextTimer) global.clearTimeout(state.autoNextTimer);
      state.autoNextTimer = global.setTimeout(function () {
        state.autoNextTimer = null;
        if (!feedbackCurrent() || request !== narrationRequest) return;
        goNext();
      }, delay);
    }
    function narrate(request, replaying) {
      if (!feedbackCurrent() || request !== narrationRequest) return;
      if (!store.settings().speak) {
        autoAfterChest = true;
        afterExplanation(request);
        scheduleAutoNext(request, AUTO_NEXT_SILENT);
        return;
      }
      var spoken = replaying ? feedbackSpeech : quickAnswerSpeech;
      if (autoNext && !replaying) {
        clearVoiceWatchdog();
        voiceWatchdog = global.setTimeout(function () {
          voiceWatchdog = null;
          if (!feedbackCurrent() || request !== narrationRequest) return;
          audio.stopSpeaking();
          autoAfterChest = true;
          afterExplanation(request);
          scheduleAutoNext(request, AUTO_NEXT_AFTER_SPEECH);
        }, AUTO_NEXT_VOICE_WATCHDOG);
      }
      audio.say(spoken.lines, Object.assign({}, spoken.opts, {
        onEnd: function () {
          clearVoiceWatchdog();
          autoAfterChest = true;
          afterExplanation(request);
          scheduleAutoNext(request, AUTO_NEXT_AFTER_SPEECH);
        }
      }), function () {
        if (!feedbackCurrent() || request !== narrationRequest) return;
        clearVoiceWatchdog();
        nudgeReplay();
        afterExplanation(request);
      });
    }
    function beginFeedback(request, replaying) {
      FQ.speech.stopAnd(function () {
        if (!feedbackCurrent() || request !== narrationRequest) return;
        // 보상 소리는 우선순위가 높은 하나만 쓴다. 상자는 설명이 끝난 뒤 열린다.
        if (autoNext || res.chest || replaying) { narrate(request, replaying); return; }
        var event = res.levelUp ? 'level' : res.newSticker ? 'sticker' :
          res.correct && store.settings().correctMusic ? 'correct' : 'discovery';
        playMusic(event, function () { narrate(request, replaying); });
      });
    }

    // 정답 카드(시안 PhoneAnswer): 정오답이 같은 카드다. 폰에서 국기 전폭, 이름 34px, 노란 상자(그림 이름·상식 / 국기 특징),
    // 🔊 설명 다시 듣기 56px, '다음 나라 →' 64px.
    // 수도 놀이의 정답 카드는 수도가 주인공이다(D29): 수도 명패(가장 큰 글자, 수도 안 명소 그림(D26)이 있으면 함께 — 파리 옆에 에펠탑) 아래에
    // '[국기] 나라의 수도예요' 한 줄. 읽는 문구 [수도, 나라의 수도예요] 와 같은 순서이고, 나라 이름·국기는 수도를 받치는 자리로 내려간다.
    var feedbackArt = isArtQ ? artFor(c.code, q.mode) : null;
    var rememberTitle = isArtQ ? esc(artAlt(c.code, q.mode)) : isMapQ ? '🗺️ ' + esc(c.continent) + ' · ' + esc(c.region) : '';
    var rememberBody = isMapQ || isArtQ ? esc(c.fact) : '🚩 ' + esc(c.flagHint);
    var html =
      '<div class="feedback learn discovery-card' + (isCapitalQ ? ' capital-card' : '') + (isMapQ ? ' map-feedback' : '') + '">' +
        '<div class="fb-head"><div class="verdict">' + verdict + '</div>' + extra + '</div>' +
        (res.gift
          ? '<div class="feedback-gift">' + giftSprite(res.gift) +
              '<div class="feedback-gift-copy"><b>' + (res.newGift ? '새 그림 선물을 받았어요!' : '그림 선물을 다시 만났어요!') + '</b>' +
                '<small>' + esc(res.gift.name) + '</small></div></div>'
          : '') +
        (isCapitalQ
          ? capitalPlate(c, capitalPlace(c)) + capitalOf(c)
          : '<div class="name-row">' +
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
            '</div>') +
        (isMapQ ? FQ.map.study(c) : '') +
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
    if (isMapQ) {
      // 큰 위치 설명을 건너뛰지 않고 정답 카드의 시작부터 보여 준다.
      area.setAttribute('tabindex', '-1');
      area.focus({ preventScroll: true });
      area.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else {
      next.focus();
      next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    beginFeedback(narrationRequest, false);
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

  function giftSprite(gift) {
    return '<span class="gift-sprite' + (gift.sheet > 1 ? ' gift-sheet-' + gift.sheet : '') +
      '" role="img" aria-label="' + esc(gift.name) +
      '" style="background-position:' + (gift.col * 50) + '% ' + (gift.row * 50) + '%"></span>';
  }

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

  /** 깜짝 상자(D22). 선물·점수·경험치는 submit 에서 저장하고, 그림 선물을 바로 보여 준다. */
  function showChest(country, res, mode, onClose) {
    var st = FQ.progress.stickers();
    var shape = res.chestShape || FQ.progress.chestShape(country && country.continent);
    var kind = res.chestKind || 'plain';
    var loot = res.chestLoot || FQ.progress.chestLoot(kind);
    var art = (mode === 'symbol' || mode === 'place') && country ? artFor(country.code, mode) : null;
    var back = doc.createElement('div');
    back.className = 'chest-back';
    back.innerHTML =
      '<div class="chest-card ' + kind + '" role="dialog" aria-modal="true" aria-label="그림 선물을 받았어요">' +
        '<div class="chest-title">그림 선물을 받았어요!</div>' +
        '<div class="chest-sub" id="chest-sub">' + esc(shape.name) + '에서 나왔어요</div>' +
        '<div class="chest-open" id="chest-open">' +
          '<div class="chest-art">' +
            '<div class="chest-rays"></div>' +
            (res.gift ? giftSprite(res.gift) : '<div class="chest-emoji">' + shape.emoji + '</div>') +
          '</div>' +
          '<div class="chest-kind">' + (CHEST_KIND_LABEL[kind] || CHEST_KIND_LABEL.plain) + '</div>' +
          (res.gift
            ? '<div class="chest-gift-copy"><b id="chest-gift-status">' + (res.newGift ? '새 그림 선물!' : '그림 선물을 다시 만났어요!') + '</b>' +
                '<span>' + esc(res.gift.name) + '</span></div>'
            : '') +
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

    // 선물 그림을 보고 닫을 때까지 뒤의 '다음 문제' 단추를 잠근다.
    var behind = ui.$('#next');
    if (behind) behind.disabled = true;
    var closeBtn = back.querySelector('#chest-close');
    if (closeBtn) { try { closeBtn.focus({ preventScroll: true }); } catch (e) { closeBtn.focus(); } }

    // 상자가 나타나는 소리는 대륙 곡. 선물·점수·경험치는 submit 에서 이미 반영했다.
    playMusic('chest', null, shape.music ? { prefer: shape.music } : null);
    FQ.effects.burst(kind === 'gold' ? 70 : kind === 'shiny' ? 50 : 35);
    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      stopMusic();
      back.remove();
      var nextBtn = ui.$('#next');
      if (nextBtn) { nextBtn.disabled = false; nextBtn.focus({ preventScroll: true }); }
      if (onClose) onClose();
    }
    back.addEventListener('click', function (ev) {
      if (ev.target.closest('#chest-close') || ev.target === back) close();
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

    // 여행 카드는 실제 채점한 나라 수를 보여 준다.
    var metCount = summary.countries === undefined ? summary.total : summary.countries;
    // 다시 보기에서도 나라별 마지막 채점 결과를 센다.
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
          capitalAxis(summary.mode) ? '🏙️ ' + c.capital : c.flagHint) + '</div>' +
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
        capitalRecapBlock(summary) +
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

        (state.giftsFound && state.giftsFound.length
          ? '<div class="card result-gifts"><h3>오늘 받은 그림 선물</h3><div class="result-gift-list">' +
              state.giftsFound.map(function (item) {
                return '<div class="result-gift">' + giftSprite(item.gift) +
                  '<span>' + esc(item.gift.name) + (item.isNew ? ' · 새 선물' : '') + '</span></div>';
              }).join('') + '</div></div>'
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
          (summary.mode === 'map' ? '<button class="btn btn-big btn-mid" id="map-result-study" type="button">지도에서 다시 보기</button>' : '') +
          ((summary.mode === 'symbol' || summary.mode === 'place') && state.met && state.met.length
            ? '<button class="btn btn-big btn-mid" id="art-result-study" type="button">' + artTitle(summary.mode) + ' 다시 공부하기</button>' : '') +
          '<button class="btn btn-big btn-mid" id="home" type="button">' + ICONS.home + '<span>홈으로</span></button>' +
        '</div>' +
      '</section>';

    var m = ui.setMain(html);
    var resultMapStudy = ui.$('#map-result-study', m);
    if (resultMapStudy) resultMapStudy.addEventListener('click', function () {
      startMapStudy((state.met || []).map(function (item) { return item.country.code; }));
    });
    var resultArtStudy = ui.$('#art-result-study', m);
    if (resultArtStudy) resultArtStudy.addEventListener('click', function () {
      startArtStudy(summary.mode, (state.met || []).map(function (item) { return item.country.code; }));
    });
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
    // 오늘 만난 수도 다시 듣기(D26): 응원을 멈추고 수도와 '○○의 수도예요'를 읽는다(기존 음원).
    ui.on(m, '[data-speak]', 'click', function (e, t) {
      cancelResultVoice();
      speakFromButton(t);
    });
    ui.$('#again', m).addEventListener('click', function () { startGame(null); });
    var rw = ui.$('#retry-wrong', m);
    if (rw) rw.addEventListener('click', function () {
      startGame(summary.wrong.map(function (c) { return c.code; }));
    });
    ui.$('#home', m).addEventListener('click', renderHome);
  }

  /**
   * 수도 놀이의 결과에 '오늘 만난 수도 다시 듣기'(D26). 만난 나라마다 국기·수도·'○○의 수도'와 🔊, 위에는 전부 이어 듣는 단추.
   * 칸의 큰 글자는 수도 이름이고 나라는 그 아래 '○○의 수도' 로 받친다(D29).
   * 아빠가 옆에서 같이 따라 하기 좋게 [수도, '○○의 수도예요'] 를 차례로 읽는다 — 새 문구 없음.
   */
  function capitalRecapBlock(summary) {
    if (!capitalAxis(summary.mode) || !state.met || !state.met.length) return '';
    var lines = [];
    state.met.forEach(function (m2) { lines.push(m2.country.capital, m2.country.ko + '의 수도예요'); });
    return '<div class="card capital-recap">' +
      '<div class="tc-head"><span class="tc-title">🏙️ 오늘 만난 수도 다시 듣기</span><span class="spacer"></span>' +
        '<button class="btn btn-sm btn-listen-soft" id="capital-recap-all" type="button" data-speak-lines="' + esc(lines.join('|')) + '" data-label="🔊 이어 듣기">🔊 이어 듣기</button>' +
      '</div>' +
      '<div class="recap-grid">' + state.met.map(function (m2) {
        var c2 = m2.country;
        return '<div class="recap-item' + (m2.correct ? '' : ' again') + '">' +
          '<img src="' + ui.flagSrc(c2.code) + '" alt="' + esc(c2.ko) + ' 국기">' +
          '<span class="c">' + esc(c2.capital) + '</span>' +
          '<span class="n">' + esc(c2.ko) + '의 수도</span>' +
          '<button class="btn btn-sm btn-ghost recap-listen" type="button" data-speak="' + esc(c2.capital) + '" data-speak-extra="' + esc(c2.ko) + '의 수도예요" data-label="🔊" aria-label="' + esc(c2.ko) + '의 수도 ' + esc(c2.capital) + ' 듣기">🔊</button>' +
        '</div>';
      }).join('') + '</div>' +
    '</div>';
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

    doc.getElementById('nav-home').addEventListener('click', renderHome);
    doc.getElementById('nav-settings').addEventListener('click', function () { renderSettings(); });
    doc.getElementById('nav-dex').addEventListener('click', function () {
      cancelPendingFeedback();
      stopTimer(); stopListening(); audio.stopSpeaking(); state.game = null;
      state.study = null;
      state.mapStudy = null;
      state.artStudy = null;
      FQ.screens.dex();
    });
    doc.getElementById('nav-stats').addEventListener('click', function () {
      cancelPendingFeedback();
      stopTimer(); stopListening(); audio.stopSpeaking(); state.game = null;
      state.study = null;
      state.mapStudy = null;
      state.artStudy = null;
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
        if (q && speechMode(q.mode)) {
          setListenState('다시 말하려면 마이크를 눌러 주세요.', 'off');
        }
      }
    });
    global.addEventListener('offline', function () {
      state.speechNeedsConnection = true;
      continueWithTouch();
    });
    global.addEventListener('online', function () {
      // 풀던 문제는 그대로 둔다. 다음 말하기 문제부터 마이크를 다시 사용한다.
      state.speechNeedsConnection = false;
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
    if (FQ.offline) { FQ.offline.init(); return; }
    if (!('serviceWorker' in global.navigator)) return;
    var proto = global.location.protocol;
    var host = global.location.hostname;
    if (proto !== 'https:' && host !== 'localhost' && host !== '127.0.0.1') return;
    global.navigator.serviceWorker.register('sw.js').catch(function () { /* 없어도 그만 */ });
  }

  FQ.app = { home: renderHome, settings: renderSettings, category: renderCategory, boot: boot, startGame: startGame, musicScreen: musicScreen };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
