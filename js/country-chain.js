/* 두 사람이 질문 없이 나라 이름을 번갈아 말한다. 판정 모델과 화면 수명을 따로 둔다. */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var TAILS = ['이라든지', '이라고', '입니다', '이에요', '이래요', '이랑', '이나', '이요', '예요', '이야', '이다', '라고', '하고', '에서', '보다', '까지', '부터', '으로', '든지', '요', '은', '는', '이', '가', '을', '를', '도', '랑', '과', '와', '의', '로', '에'];

  function normalize(text) {
    if (FQ.util && FQ.util.normalize) return FQ.util.normalize(text);
    return String(text || '').normalize('NFC').toLowerCase().replace(/[\s.,!?"'`~\-_\/\\()[\]{}·:;]/g, '');
  }

  function makeMatcher(countries) {
    var index = Object.create(null);
    countries.forEach(function (country) {
      (country.aliases || []).concat([country.ko, country.en]).forEach(function (name) {
        var key = normalize(name);
        if (!key) return;
        var matches = index[key] || (index[key] = []);
        if (!matches.some(function (c) { return c.code === country.code; })) matches.push(country);
      });
    });
    function lookup(text) {
      var key = normalize(text);
      if (index[key]) return index[key];
      for (var i = 0; i < TAILS.length; i++) {
        var tail = TAILS[i];
        if (key.length > tail.length + 1 && key.slice(-tail.length) === tail) {
          var match = index[key.slice(0, -tail.length)];
          if (match) return match;
        }
      }
      return [];
    }
    return function (text) {
      text = String(text || '').trim();
      if (!text || text.length > 2000) return { status: 'unknown', country: null };
      var whole = lookup(text);
      if (whole.length) return { status: whole.length === 1 ? 'matched' : 'ambiguous', country: whole.length === 1 ? whole[0] : null };
      var words = text.split(/[\s.,!?…·:;'"`()\[\]{}~\-]+/).filter(Boolean);
      var found = Object.create(null), spans = [];
      // 여러 낱말인 공식 이름도 묶는다. 서로 다른 나라가 나오면 임의로 하나를 고르지 않는다.
      for (var a = 0; a < words.length; a++) {
        var joined = '';
        for (var b = a; b < words.length && b < a + 6; b++) {
          joined += words[b];
          lookup(joined).forEach(function (country) { spans.push({ first: a, last: b, country: country }); });
        }
      }
      // "음 기니 비사우"의 '기니'처럼 긴 나라 이름 안의 짧은 별칭은 따로 세지 않는다.
      spans.forEach(function (span) {
        if (spans.some(function (other) { return other.first <= span.first && other.last >= span.last && (other.first < span.first || other.last > span.last); })) return;
        found[span.country.code] = span.country;
      });
      var codes = Object.keys(found);
      return { status: codes.length === 1 ? 'matched' : codes.length ? 'ambiguous' : 'unknown', country: codes.length === 1 ? found[codes[0]] : null };
    };
  }

  function createGame(options) {
    options = options || {};
    var countries = [], known = Object.create(null), used = Object.create(null), history = [];
    (options.countries || FQ.countries || []).forEach(function (country) {
      if (country && country.code && country.ko && !known[country.code]) {
        known[country.code] = true;
        countries.push(country);
      }
    });
    var players = [0, 1].map(function (i) {
      return String((options.players || [])[i] || (i ? '두 번째 친구' : '첫 번째 친구')).trim().slice(0, 20) || (i ? '두 번째 친구' : '첫 번째 친구');
    });
    var turn = 0, scores = [0, 0], match = makeMatcher(countries);
    function snapshot() {
      return { players: players.slice(), playerIndex: turn, currentPlayer: players[turn], scores: scores.slice(),
        total: history.length, remaining: countries.length - history.length, complete: history.length === countries.length,
        countries: history.map(function (entry) { return entry.country; }),
        history: history.map(function (entry) { return Object.assign({}, entry); }) };
    }
    function submit(text) {
      var before = turn;
      if (history.length === countries.length) return { status: 'complete', playerIndex: before, nextPlayerIndex: turn };
      var resolved = FQ.spokenAnswer && FQ.spokenAnswer.resolve(text, { kind: 'country', countries: countries });
      var result = resolved ? { status: resolved.status === 'answer' ? 'matched' :
        resolved.reason === 'multiple-answers' || resolved.reason === 'ambiguous-alias' ? 'ambiguous' : 'unknown',
        country: resolved.status === 'answer' ? countries.filter(function (item) { return item.code === resolved.code; })[0] : null } : match(text);
      var country = result.country;
      var status = result.status === 'matched' ? (used[country.code] ? 'duplicate' : 'accepted') : result.status;
      var entry = null;
      if (status === 'accepted') {
        entry = { number: history.length + 1, code: country.code, country: country, playerIndex: before, player: players[before], text: String(text).trim().slice(0, 400) };
        used[country.code] = entry;
        history.push(entry);
        scores[before] += 1;
        turn = 1 - turn;
      }
      return { status: status, country: country, entry: entry && Object.assign({}, entry), previous: country && used[country.code] && Object.assign({}, used[country.code]),
        playerIndex: before, player: players[before], nextPlayerIndex: turn, nextPlayer: players[turn], total: history.length,
        complete: history.length === countries.length };
    }
    return { submit: submit, snapshot: snapshot };
  }

  function start(options) {
    options = options || {};
    var ui = FQ.ui, esc = ui.esc, doc = global.document, game = createGame(options), voice = options.voice;
    var alive = true, generation = 0, continuous = false, voiceState = 'idle', speaking = false, timer = null, selectedCode = null;
    var settings = FQ.storage && FQ.storage.settings ? FQ.storage.settings() : {};
    var speak = options.speak === undefined ? settings.speak !== false : !!options.speak;
    var m = ui.setMain('<section class="chain-screen"><header class="chain-head"><button type="button" class="btn btn-ghost" data-chain-home aria-label="홈으로">' + ui.icon('back') + '</button><div><h1>나라 이어 말하기</h1><p>두 사람이 번갈아 나라 이름을 말해요.</p></div><button type="button" class="btn btn-ghost" data-chain-reset>새로 하기</button></header>' +
      '<div class="chain-players" id="chain-players"></div><p class="chain-turn" id="chain-turn" aria-live="polite"></p>' +
      '<section class="chain-entry" aria-label="나라 이름 말하기"><div class="chain-voice-controls"><button type="button" class="btn btn-primary" id="chain-mic" data-chain-mic>' + ui.icon('mic') + '<span>말하기 시작</span></button><button type="button" class="btn btn-ghost" id="chain-pause" data-chain-pause hidden>듣기 멈추기</button></div>' +
      '<p class="small muted" id="chain-voice-state" role="status">마이크를 누르고 나라 이름을 하나 말해요. 글로 써도 좋아요.</p>' +
      '<form class="chain-input-form" data-chain-form><label class="sr-only" for="chain-input">나라 이름</label><input class="text-input" id="chain-input" name="country" placeholder="나라 이름을 써도 좋아요" autocomplete="off" maxlength="100"><button class="btn" type="submit">말하기</button></form>' +
      '<p class="chain-feedback" id="chain-feedback" role="status" aria-live="polite">아직 말하지 않은 나라를 자유롭게 말해요.</p></section>' +
      '<section class="chain-map" aria-label="함께 찾은 나라 지도" id="chain-map"></section><article class="chain-country-detail" id="chain-detail"></article>' +
      '<section class="chain-history"><h2 id="chain-history-title">함께 찾은 나라 · 0개</h2><ol class="chain-history-list" id="chain-history"></ol></section></section>');
    function element(id) { return ui.$('#' + id, m); }
    function clearTimer() { if (timer !== null) global.clearTimeout(timer); timer = null; }
    function stopReading() {
      clearTimer();
      try { if (speaking && FQ.audio && FQ.audio.stopSpeaking) FQ.audio.stopSpeaking(); } catch (error) { /* 읽기 취소 실패가 다음 입력을 막지 않게 한다. */ }
      speaking = false;
    }
    function cancelVoice(keepMicrophone) {
      generation += 1;
      try { if (voice && voice.cancel) voice.cancel(keepMicrophone ? { keepMicrophone: true } : undefined); } catch (error) { /* 취소 실패가 글 입력을 막지 않게 한다. */ }
      voiceState = 'idle';
    }
    function current(token) { return alive && token === generation && !doc.hidden; }
    function voiceAvailable() { return !!(voice && voice.start && (!voice.supported || voice.supported())); }
    function updateVoiceControls() {
      var mic = element('chain-mic'), pause = element('chain-pause');
      mic.disabled = game.snapshot().complete || speaking || !(voiceState === 'recording' || voiceState === 'idle' && !continuous);
      var label = speaking ? '이름 읽는 중' : ({ recording: '말했어요', requesting: '마이크 준비 중', waiting: '듣기 준비 중',
        speaking: '이름 읽는 중', finishing: '녹음 정리 중', transcribing: '나라 이름 확인 중' }[voiceState] || (continuous ? '듣기 준비 중' : '말하기 시작'));
      mic.innerHTML = ui.icon('mic') + '<span>' + label + '</span>';
      pause.hidden = !continuous && !speaking;
      mic.setAttribute('aria-pressed', voiceState === 'recording' ? 'true' : 'false');
    }
    function setVoiceState(state, message) {
      if (!alive) return;
      voiceState = speaking ? 'speaking' : state === 'idle' && continuous ? 'waiting' : state;
      updateVoiceControls();
      element('chain-voice-state').textContent = message || ({ requesting: '마이크를 켜고 있어요.', recording: '듣고 있어요. 나라 이름을 하나 말해요.',
        waiting: '듣기를 이어갈 준비를 하고 있어요.', speaking: '나라 이름을 읽고 있어요. 다 읽으면 듣기를 이어가요.',
        finishing: '녹음을 정리하고 있어요.', transcribing: '말한 나라 이름을 확인하고 있어요.',
        idle: '마이크를 누르고 나라 이름을 하나 말해요. 글로 써도 좋아요.' }[voiceState] || '');
    }
    function message(text, warning) {
      var node = element('chain-feedback');
      node.textContent = text;
      node.classList.toggle('is-warning', !!warning);
    }
    function renderDetails(state) {
      var country = state.countries.filter(function (c) { return c.code === selectedCode; })[0];
      var location = country && FQ.map && FQ.map.describe ? FQ.map.describe(country).coordinates : '';
      element('chain-detail').innerHTML = country ? '<img class="chain-detail-flag" src="' + esc(ui.flagSrc(country.code)) + '" alt="' + esc(country.ko + ' 국기') + '"><div><h2>' + esc(country.ko) + '</h2><p>' + esc([country.continent, country.region].filter(Boolean).join(' · ')) + '</p><p><span class="muted">수도</span> ' + esc(country.capital || '') + '</p>' + (location ? '<p class="small muted">' + esc(location) + '</p>' : '') + '</div>' : '<p class="muted">나라 이름을 말하면 국기와 위치가 여기에 쌓여요.</p>';
    }
    function render() {
      if (!alive) return;
      var state = game.snapshot(), owners = {};
      state.history.forEach(function (entry) { owners[entry.code] = entry.playerIndex; });
      element('chain-players').innerHTML = state.players.map(function (name, i) {
        return '<div class="chain-player chain-player--' + i + (state.playerIndex === i && !state.complete ? ' is-current' : '') + '"><span>' + esc(name) + '</span><strong>' + state.scores[i] + '<small>개</small></strong>' + (state.playerIndex === i && !state.complete ? '<span class="chain-player-turn">지금 차례</span>' : '') + '</div>';
      }).join('');
      element('chain-turn').textContent = state.complete ? '모든 나라를 함께 찾았어요!' : state.currentPlayer + ' 차례예요. 나라 이름을 하나 말해요.';
      element('chain-input').disabled = state.complete;
      updateVoiceControls();
      element('chain-history-title').textContent = '함께 찾은 나라 · ' + state.total + '개';
      element('chain-map').innerHTML = FQ.map && FQ.map.collection ? FQ.map.collection(state.countries, { activeCode: selectedCode, owners: owners }) : '<p class="muted">지도 자료를 준비하고 있어요.</p>';
      var scroller = ui.$('.chain-map-scroll', m), marker = scroller && ui.$('.chain-map-marker.is-active', scroller);
      // 지도 안에서만 선택한 점을 가운데로 보낸다. 글 입력의 초점과 페이지 위치는 유지한다.
      if (marker && typeof marker.offsetLeft === 'number' && scroller.clientWidth) scroller.scrollLeft = Math.max(0, marker.offsetLeft - scroller.clientWidth / 2);
      element('chain-history').innerHTML = state.history.map(function (entry) {
        return '<li class="chain-history-item"><button type="button" class="chain-country-button chain-owner--' + entry.playerIndex + (entry.code === selectedCode ? ' is-selected' : '') + '" data-chain-country="' + esc(entry.code) + '" aria-label="' + esc(entry.number + '번째, ' + entry.player + ', ' + entry.country.ko + ' 정보 보기') + '"><span class="chain-country-number">' + entry.number + '</span><img src="' + esc(ui.flagSrc(entry.code)) + '" alt="" loading="lazy"><strong>' + esc(entry.country.ko) + '</strong><span>' + esc(entry.player) + '</span></button></li>';
      }).join('');
      renderDetails(state);
    }
    function scheduleListening(delay) {
      clearTimer();
      var token = generation;
      if (!continuous || game.snapshot().complete) { setVoiceState('idle'); return; }
      setVoiceState('waiting');
      timer = global.setTimeout(function () { timer = null; if (current(token)) beginListening(); }, delay);
    }
    function voiceError(error, token) {
      if (!current(token)) return;
      continuous = false;
      cancelVoice();
      stopReading();
      setVoiceState('idle', (error && error.message || '지금은 마이크로 들을 수 없어요.') + ' 같은 차례에서 글로 쓰거나 마이크를 다시 눌러요.');
      if (options.onVoiceError) options.onVoiceError(error);
    }
    function beginListening() {
      if (!alive || doc.hidden || !continuous || game.snapshot().complete) return;
      if (!voiceAvailable()) {
        continuous = false;
        cancelVoice();
        stopReading();
        setVoiceState('idle', '이 기기에서는 마이크를 사용할 수 없어요. 같은 차례에서 나라 이름을 글로 써요.');
        return;
      }
      cancelVoice(continuous);
      stopReading();
      var token = generation, state = game.snapshot();
      setVoiceState('requesting');
      try {
        var pending = voice.start({ continuous: true, playerId: state.playerIndex, turnId: state.total,
          onState: function (event) { if (current(token)) setVoiceState(event.state); },
          onResult: function (event) {
            if (!current(token)) return;
            if (event.playerId !== undefined && String(event.playerId) !== String(state.playerIndex) || event.turnId !== undefined && String(event.turnId) !== String(state.total)) return;
            var resolved = FQ.speech && FQ.speech.resolveAnswer ? FQ.speech.resolveAnswer(event.text, 'country', event.resolution) : null;
            if (resolved && resolved.status !== 'answer') {
              continuous = false; cancelVoice();
              message('답을 하나만 다시 말해 주세요. 지금 차례에서 계속할 수 있어요.', true);
              setVoiceState('idle', '마이크를 다시 누르거나 나라 이름을 글로 써요.');
              return;
            }
            submit(resolved ? resolved.text : event.text);
          },
          onError: function (error) { voiceError(error, token); }
        });
        if (pending && pending.catch) pending.catch(function (error) { voiceError(error, token); });
      } catch (error) { voiceError(error, token); }
    }
    function readName(country) {
      if (!speak || !FQ.audio || !FQ.audio.say || FQ.audio.canSpeak && !FQ.audio.canSpeak()) { scheduleListening(300); return; }
      var token = generation, finished = false;
      speaking = true;
      setVoiceState('speaking');
      function finish(stopAudio) {
        if (finished || !current(token)) return;
        finished = true;
        clearTimer();
        if (stopAudio) stopReading();
        else speaking = false;
        scheduleListening(300);
      }
      function done() { finish(false); }
      // 읽기가 조용히 멈춰도 다음 사람의 마이크를 끝없이 기다리게 하지 않는다.
      timer = global.setTimeout(function () { finish(true); }, 7000);
      try { FQ.audio.say([country.ko], { onEnd: done }, done); } catch (error) { done(); }
    }
    function submit(text) {
      if (!alive) return { status: 'inactive' };
      cancelVoice(continuous);
      stopReading();
      var result = game.submit(text);
      if (result.status === 'accepted') {
        if (result.complete) { continuous = false; cancelVoice(); }
        selectedCode = result.country.code;
        element('chain-input').value = '';
        render();
        message(result.complete ? '모든 나라를 함께 찾았어요! 새로 하기를 누르면 다시 시작해요.' : result.country.ko + '! 이제 ' + result.nextPlayer + ' 차례예요.');
        setVoiceState('idle', continuous ? '나라 이름을 듣고 다음 사람이 말해요.' : undefined);
        readName(result.country);
      } else {
        continuous = false;
        cancelVoice();
        if (result.status === 'duplicate') message(result.country.ko + '은(는) ' + result.previous.player + '이(가) 이미 말했어요. ' + result.player + ' 차례에서 다른 나라를 말해요.', true);
        else if (result.status === 'ambiguous') message('여러 나라 이름이 들렸어요. ' + result.player + ' 차례에서 하나만 말해요.', true);
        else if (result.status === 'complete') message('모든 나라를 함께 찾았어요! 새로 하기를 누르면 다시 시작해요.');
        else message('나라 이름을 찾지 못했어요. ' + result.player + ' 차례에서 다시 말하거나 글로 써요.', true);
        setVoiceState('idle');
      }
      return result;
    }
    function pauseListening() {
      continuous = false;
      cancelVoice();
      stopReading();
      setVoiceState('idle', '듣기를 멈췄어요. 같은 차례에서 글로 쓰거나 마이크를 다시 눌러요.');
    }
    function visibility() { if (doc.hidden && alive) pauseListening(); }
    function cleanup() {
      if (!alive) return;
      alive = false;
      continuous = false;
      cancelVoice();
      stopReading();
      doc.removeEventListener('visibilitychange', visibility);
    }
    ui.on(m, '[data-chain-form]', 'submit', function (event) { event.preventDefault(); if (alive) submit(element('chain-input').value); });
    ui.on(m, '[data-chain-mic]', 'click', function () {
      if (!alive) return;
      if (voiceState === 'recording') {
        try { if (voice && voice.stop) voice.stop(); } catch (error) { voiceError(error, generation); }
        return;
      }
      if (continuous || speaking || voiceState !== 'idle') return;
      if (FQ.audio && FQ.audio.unlock) FQ.audio.unlock();
      continuous = true;
      beginListening();
    });
    ui.on(m, '[data-chain-pause]', 'click', function () { if (alive) pauseListening(); });
    ui.on(m, '[data-chain-home]', 'click', function () { if (alive) { cleanup(); if (options.onHome) options.onHome(); } });
    ui.on(m, '[data-chain-reset]', 'click', function () {
      if (!alive) return;
      pauseListening();
      game = createGame(options);
      selectedCode = null;
      element('chain-input').value = '';
      render();
      message('새로 시작했어요. 아직 말하지 않은 나라를 자유롭게 말해요.');
    });
    ui.on(m, '[data-chain-country]', 'click', function (event, button) {
      if (!alive) return;
      selectedCode = button.getAttribute('data-chain-country');
      render();
    });
    doc.addEventListener('visibilitychange', visibility);
    render();
    if (!voiceAvailable()) setVoiceState('idle', '나라 이름을 글로 써도 같은 놀이를 이어갈 수 있어요.');
    return { cleanup: cleanup, submit: submit, snapshot: function () { return game.snapshot(); }, pause: pauseListening };
  }

  FQ.countryChain = { createGame: createGame, start: start };
})(window);
