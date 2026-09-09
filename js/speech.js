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

  function supported() { return !!SR; }

  /** 마이크는 보안 컨텍스트에서만 열린다. file:// 로 열면 쓸 수 없다. */
  function secureOk() {
    if (global.isSecureContext) return true;
    var h = global.location && global.location.hostname;
    return h === 'localhost' || h === '127.0.0.1';
  }

  function unavailableReason() {
    if (!SR) return '이 브라우저는 음성 인식을 지원하지 않아요. 크롬이나 엣지에서 열어 주세요.';
    if (!secureOk()) return '음성 인식은 https 주소나 localhost에서만 쓸 수 있어요. 아래 안내대로 로컬 서버로 열어 주세요.';
    return null;
  }

  function build() {
    var r = new SR();
    r.lang = 'ko-KR';
    r.continuous = false;
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
      if (handlers.end) handlers.end();
    };
    return r;
  }

  function start(cbs) {
    handlers = cbs || {};
    var reason = unavailableReason();
    if (reason) {
      if (handlers.error) handlers.error('unsupported', reason);
      return false;
    }
    if (listening) stop();
    try {
      rec = build();
      rec.start();
      listening = true;
      return true;
    } catch (e) {
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
  }

  function isListening() { return listening; }

  FQ.speech = {
    supported: supported,
    secureOk: secureOk,
    unavailableReason: unavailableReason,
    start: start,
    stop: stop,
    abort: abort,
    isListening: isListening
  };
})(window);
