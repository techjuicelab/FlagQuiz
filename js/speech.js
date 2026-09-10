/* 국기 퀴즈 - 음성 인식(말로 답하기)
 * Web Speech API의 SpeechRecognition을 ko-KR로 사용한다.
 * 크롬/엣지/사파리에서 동작하며 https 또는 localhost가 필요하다.
 */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var SR = global.SpeechRecognition || global.webkitSpeechRecognition;

  var rec = null;
  var session = null;
  var pendingStart = null;
  var restartTimer = null;
  var releaseVersion = 0;

  function supported() { return !!SR; }

  /** 아이폰·아이패드 여부 (아이패드는 데스크톱 사파리인 척하므로 터치로 가려낸다) */
  function isApple() {
    var ua = global.navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua)) return true;
    return /Macintosh/.test(ua) && global.navigator.maxTouchPoints > 1;
  }

  /** 홈 화면에 추가해서 앱처럼 실행 중인지 */
  function isStandalone() {
    if (global.navigator.standalone) return true;
    return !!(global.matchMedia && global.matchMedia('(display-mode: standalone)').matches);
  }

  /** 마이크는 보안 컨텍스트에서만 열린다. file:// 로 열면 쓸 수 없다. */
  function secureOk() {
    if (global.isSecureContext) return true;
    var h = global.location && global.location.hostname;
    return h === 'localhost' || h === '127.0.0.1';
  }

  function unavailableReason() {
    if (!SR) {
      if (isApple()) {
        return '이 아이폰·아이패드에서는 말하기를 쓸 수 없어요. 사파리로 열고, 설정 > 일반 > 키보드에서 “받아쓰기 활성화”를 켠 뒤 다시 열어 주세요.';
      }
      return '이 브라우저는 음성 인식을 지원하지 않아요. 크롬, 엣지, 사파리에서 열어 주세요.';
    }
    if (!secureOk()) {
      return '말하기는 https 주소나 localhost 에서만 쓸 수 있어요. 아래 안내대로 로컬 서버나 인터넷 주소로 열어 주세요.';
    }
    if (isApple() && isStandalone()) {
      return '홈 화면에 추가한 앱에서는 사파리가 마이크를 막을 수 있어요. 말하기가 안 되면 사파리에서 열어 주세요.';
    }
    return null;
  }

  /** 안내는 하되 마이크는 시도해 볼 수 있는 경우 */
  function blocked() {
    return !SR || !secureOk();
  }

  /** 정상 종료한 인식기는 재사용하고, 종료 신호가 사라진 인식기만 교체한다. */
  function build(current) {
    var r = rec || new SR();
    rec = r;
    r.lang = 'ko-KR';
    r.continuous = current.handlers.continuous !== false;
    r.interimResults = true;
    r.maxAlternatives = 5;
    r.onstart = function () {
      if (session !== current || current.phase !== 'starting') return;
      clearStartTimer(current);
      current.phase = 'listening';
      if (current.handlers.start) current.handlers.start();
    };
    r.onresult = function (ev) {
      if (session !== current || current.discardResults) return;
      var finals = [];
      var interim = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var result = ev.results[i];
        if (result.isFinal) {
          for (var j = 0; j < result.length; j++) finals.push(result[j].transcript);
        } else if (result.length) {
          interim += result[0].transcript;
        }
      }
      if (interim && current.handlers.interim) current.handlers.interim(interim.trim());
      // interim 콜백에서 정답 처리나 화면 이동으로 중단했을 수 있다.
      if (session !== current || current.discardResults) return;
      if (finals.length && current.handlers.result) current.handlers.result(finals.map(function (t) { return t.trim(); }));
    };
    r.onerror = function (ev) {
      if (session !== current) return;
      clearStartTimer(current);
      current.phase = 'stopping';
      current.discardResults = true;
      current.error = ev.error;
      waitForEnd(current);
      if (!current.silent && current.handlers.error) current.handlers.error(ev.error);
    };
    r.onend = function () { finish(current, false); };
    return r;
  }

  function cancelPendingStart() {
    pendingStart = null;
    if (restartTimer !== null) global.clearTimeout(restartTimer);
    restartTimer = null;
  }

  function clearStartTimer(current) {
    if (current.startTimer !== null) global.clearTimeout(current.startTimer);
    current.startTimer = null;
  }

  /** 종료 안전장치는 해당 세션에만 속한다. 다음 문제의 콜백을 건드리지 않는다. */
  function waitForEnd(current) {
    if (current.endTimer !== null) return;
    current.endTimer = global.setTimeout(function () {
      if (session !== current) return;
      // 브라우저가 onend를 누락했다면 기존 인식기를 폐기한다.
      current.retired = true;
      try { rec.abort(); } catch (e) {}
      finish(current, true);
    }, 1500);
  }

  function afterRelease(cb, version, delay) {
    global.setTimeout(function () {
      if (version === releaseVersion) cb();
    }, delay);
  }

  function finish(current, retire) {
    if (session !== current) return;
    clearStartTimer(current);
    if (current.endTimer !== null) global.clearTimeout(current.endTimer);
    session = null;
    if (retire || current.retired) rec = null;
    var extra = isApple() ? 350 : 60;
    current.release.forEach(function (item) { afterRelease(item.cb, item.version, extra); });
    if (!current.silent && current.handlers.end) current.handlers.end({ error: current.error || null });
    if (pendingStart && !session) {
      restartTimer = global.setTimeout(function () {
        restartTimer = null;
        var next = pendingStart;
        pendingStart = null;
        if (next) begin(next);
      }, isApple() ? 350 : 60);
    }
  }

  function start(cbs) {
    var handlers = cbs || {};
    if (blocked()) {
      if (handlers.error) handlers.error('unsupported', unavailableReason());
      return false;
    }
    releaseVersion++;
    if (session) {
      if (session.phase === 'stopping') {
        // stop/abort는 비동기다. 이전 onend 이전에 start하면 요청이 소실된다.
        pendingStart = handlers;
      }
      return true;
    }
    cancelPendingStart();
    return begin(handlers);
  }

  function begin(handlers) {
    var current = {
      handlers: handlers,
      phase: 'starting',
      discardResults: false,
      silent: false,
      error: null,
      startTimer: null,
      endTimer: null,
      release: []
    };
    session = current;
    current.startTimer = global.setTimeout(function () {
      if (session !== current || current.phase !== 'starting') return;
      current.startTimer = null;
      current.phase = 'stopping';
      current.discardResults = true;
      current.error = 'start-timeout';
      current.silent = true;
      waitForEnd(current);
      // 권한 대기나 브라우저 무응답을 무한히 기다리지 않고 수동 재시도로 안내한다.
      if (handlers.error) handlers.error('start-timeout');
      if (session === current) { try { rec.abort(); } catch (e) {} }
    }, 15000);
    try {
      build(current).start();
      return true;
    } catch (e) {
      // 시작 실패를 성공으로 표시하지 않는다. 다음 시도에는 새 인식기를 쓴다.
      clearStartTimer(current);
      session = null;
      var failed = rec;
      rec = null;
      try { if (failed) failed.abort(); } catch (ignored) {}
      var code = e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'not-allowed' : 'start-failed';
      if (handlers.error) handlers.error(code);
      return false;
    }
  }

  function stop() {
    cancelPendingStart();
    if (!session || session.phase === 'stopping') return;
    clearStartTimer(session);
    session.phase = 'stopping';
    waitForEnd(session);
    try { rec.stop(); } catch (e) {}
  }

  function abort() {
    releaseVersion++;
    cancelPendingStart();
    if (!session) return;
    clearStartTimer(session);
    session.silent = true;
    session.discardResults = true;
    session.release = [];
    session.phase = 'stopping';
    waitForEnd(session);
    try { rec.abort(); } catch (e) {}
  }

  /** 마이크 종료를 기다린 뒤 재생한다. 화면 이동이나 새 듣기가 시작되면 취소한다. */
  function stopAnd(cb) {
    cancelPendingStart();
    if (!session) {
      afterRelease(cb, releaseVersion, 0);
      return;
    }
    session.release.push({ cb: cb, version: releaseVersion });
    session.discardResults = true;
    session.silent = true;
    waitForEnd(session);
    stop();
  }

  function isListening() { return !!session && session.phase !== 'stopping'; }

  FQ.speech = {
    supported: supported,
    isApple: isApple,
    isStandalone: isStandalone,
    blocked: blocked,
    secureOk: secureOk,
    unavailableReason: unavailableReason,
    start: start,
    stop: stop,
    stopAnd: stopAnd,
    abort: abort,
    isListening: isListening
  };
})(window);
