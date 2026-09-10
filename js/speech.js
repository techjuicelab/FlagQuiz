/* 국기 퀴즈 - 음성 인식(말로 답하기)
 * Web Speech API의 SpeechRecognition을 ko-KR로 사용한다.
 * 크롬/엣지/사파리에서 동작하며 https 또는 localhost가 필요하다.
 */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var SR = global.SpeechRecognition || global.webkitSpeechRecognition;

  var rec = null;
  var listening = false;
  var handlers = {};
  var pendingRelease = null;

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

  /**
   * 인식기는 한 번만 만들어 두고 계속 다시 쓴다.
   * 새로 만들 때마다 사파리가 마이크 권한을 다시 물어보기 때문에,
   * 문제마다 새 인식기를 만들면 아이가 매번 “허용”을 눌러야 한다.
   */
  function build(opts) {
    if (rec) {
      rec.continuous = !opts || opts.continuous !== false;
      return rec;
    }
    var r = new SR();
    r.lang = 'ko-KR';
    // 계속 듣기: 버튼을 누르지 않아도 아이가 말하면 바로 알아듣게 한다
    r.continuous = !opts || opts.continuous !== false;
    r.interimResults = true;
    r.maxAlternatives = 5;
    r.onresult = function (ev) {
      var finals = [];
      var interim = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var result = ev.results[i];
        if (result.isFinal) {
          for (var j = 0; j < result.length; j++) finals.push(result[j].transcript);
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim && handlers.interim) handlers.interim(interim.trim());
      if (finals.length && handlers.result) handlers.result(finals.map(function (t) { return t.trim(); }));
    };
    r.onerror = function (ev) {
      listening = false;
      if (handlers.error) handlers.error(ev.error);
    };
    r.onend = function () {
      listening = false;
      releaseNow();
      if (handlers.end) handlers.end();
    };
    rec = r;
    return r;
  }

  /** 마이크가 놓였다고 기다리던 쪽에 알려 준다 */
  function releaseNow() {
    if (!pendingRelease) return;
    var fn = pendingRelease;
    pendingRelease = null;
    fn();
  }

  function start(cbs) {
    handlers = cbs || {};
    if (blocked()) {
      if (handlers.error) handlers.error('unsupported', unavailableReason());
      return false;
    }
    if (listening) return true;      // 이미 듣고 있으면 그대로 둔다
    try {
      build(cbs).start();
      listening = true;
      return true;
    } catch (e) {
      // 이미 켜져 있는데 또 켜려 한 경우는 그대로 두면 된다
      if (String(e).indexOf('already started') !== -1) { listening = true; return true; }
      listening = false;
      if (handlers.error) handlers.error('start-failed', String(e));
      return false;
    }
  }

  function stop() {
    if (rec) {
      try { rec.stop(); } catch (e) {}
    }
    listening = false;
  }

  function abort() {
    if (rec) {
      try { rec.abort(); } catch (e) {}
    }
    listening = false;
    releaseNow();
  }

  /**
   * 듣기를 멈추고, 마이크가 실제로 놓인 뒤에 cb 를 부른다.
   *
   * 아이폰·아이패드는 음성 인식이 소리 장치를 쥐고 있어서, 멈추자마자
   * 읽어주기를 시키면 소리가 조용히 사라진다. 그래서 인식이 끝났다는
   * 신호(onend)를 기다렸다가, 소리 장치가 돌아올 틈을 조금 더 주고 부른다.
   */
  function stopAnd(cb) {
    var extra = isApple() ? 350 : 60;
    if (!listening) {
      global.setTimeout(cb, 0);
      return;
    }
    pendingRelease = function () { global.setTimeout(cb, extra); };
    stop();
    // onend 가 오지 않는 경우를 대비한 안전장치
    global.setTimeout(releaseNow, 1200);
  }

  function isListening() { return listening; }

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
