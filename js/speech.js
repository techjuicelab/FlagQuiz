/* 말로 답하기의 공통 NAS STT 연결. 녹음과 전사는 선택한 어댑터가 담당한다. */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var engine = null;
  var session = null;
  var releaseVersion = 0;
  var sequence = 0;

  function factory() { return FQ.speechEngine || FQ.cloudSpeech; }
  function supported() { var selected = factory(); return !!(selected && selected.supported()); }
  function isApple() {
    var nav = global.navigator || {};
    return /iPhone|iPad|iPod/.test(nav.userAgent || '') || /Macintosh/.test(nav.userAgent || '') && nav.maxTouchPoints > 1;
  }
  function isStandalone() {
    return !!((global.navigator || {}).standalone || global.matchMedia && global.matchMedia('(display-mode: standalone)').matches);
  }
  function secureOk() {
    var host = global.location && global.location.hostname;
    return !!global.isSecureContext || host === 'localhost' || host === '127.0.0.1';
  }
  function unavailableReason() {
    if (!secureOk()) return '말하기는 https 주소에서 사용할 수 있어요. 지금 문제는 글자로 답해 주세요.';
    if (!supported()) return '이 기기에서는 마이크 녹음을 사용할 수 없어요. 지금 문제는 글자로 답해 주세요.';
    if ((global.navigator || {}).onLine === false) return '말하기에는 인터넷 연결이 필요해요. 글자나 보기로 계속 놀 수 있어요.';
    var account = FQ.auth && FQ.auth.session();
    if (!account || account.preview) return '말하기에는 TechJuice ID 로그인이 필요해요. 지금 문제는 글자로 답해 주세요.';
    return null;
  }
  function blocked() { return !!unavailableReason(); }
  function live(current, event) {
    return session === current && (!event ||
      (event.playerId === undefined || String(event.playerId) === current.playerId) &&
      (event.turnId === undefined || String(event.turnId) === current.turnId) &&
      (event.mode === undefined || event.mode === current.mode));
  }
  function finish(current, code, message, text, resolution) {
    if (!live(current)) return;
    session = null;
    var version = releaseVersion;
    if (code) {
      if (current.handlers.error) current.handlers.error(code, message);
    } else if (current.handlers.result) current.handlers.result([text], { resolution: resolution });
    // 채점이나 화면 이동으로 취소되었다면 이전 차례의 종료도 보내지 않는다.
    if (version === releaseVersion && !session && current.handlers.end) current.handlers.end({ error: code || null, retry: false });
  }
  function start(handlers) {
    var h = handlers || {};
    if (session) return true;
    if (blocked()) {
      abort();
      if (h.error) h.error('unsupported', unavailableReason());
      return false;
    }
    releaseVersion++;
    var current = { handlers: h, mode: h.mode || 'voice', playerId: String(h.playerId === undefined ? 0 : h.playerId),
      turnId: String(h.turnId === undefined ? ++sequence : h.turnId), phase: null };
    session = current;
    try {
      if (!engine) engine = factory().create({
        csrfToken: function () { return FQ.auth && FQ.auth.csrfToken() || ''; },
        beforeRecord: function (done) {
          if (FQ.audio && FQ.audio.cueListening) return FQ.audio.cueListening(done);
          done(false);
        }
      });
      // 문제 제한시간은 화면에서 관리한다. 아이가 생각하는 무음만으로 말하기를 끄지 않는다.
      var pending = engine.start({ mode: current.mode, playerId: current.playerId, turnId: current.turnId, continuous: h.continuous !== false,
        onState: function (event) {
          if (!live(current, event) || event.state === 'idle') return;
          var previousPhase = current.phase;
          current.phase = event.state;
          if (h.state) h.state(event.state);
          if (!live(current)) return;
          // 무음 파일을 버리고 다시 듣는 경우에도 실제 녹음 상태로 마이크 표시를 복원한다.
          if (event.state === 'recording' && previousPhase !== 'recording') {
            if (h.start) h.start();
          }
        },
        onPartial: function (event) {
          if (!live(current, event) || !event || typeof event.text !== 'string' || !event.text.trim()) return;
          if (h.partial) h.partial(event.text.trim());
        },
        onResult: function (event) {
          if (!live(current, event)) return;
          if (!event || typeof event.text !== 'string' || !event.text.trim()) { finish(current, 'no-speech', '목소리가 들리지 않았어요. 다시 말하거나 글자로 답해 주세요.'); return; }
          finish(current, null, null, event.text.trim(), event.resolution);
        },
        onError: function (event) {
          if (!live(current, event)) return;
          finish(current, event.code || 'service', event.message || '말하기가 어려워요. 다시 시도하거나 글자로 답해 주세요.');
        }
      });
      if (pending && pending.catch) pending.catch(function () {
        finish(current, 'service', '마이크를 준비하지 못했어요. 다시 시도하거나 글자로 답해 주세요.');
      });
      return true;
    } catch (failure) {
      finish(current, 'service', '마이크를 준비하지 못했어요. 다시 시도하거나 글자로 답해 주세요.');
      return false;
    }
  }
  function stop() { if (session && engine) engine.stop(); }
  function cancelSession(keepMicrophone) {
    var hadSession = !!session;
    releaseVersion++;
    session = null;
    // 최종 결과 callback 안에서는 어댑터가 이미 마이크를 보관했다. 중복 해제로 오디오를 닫지 않는다.
    if (engine && (!keepMicrophone || hadSession)) {
      if (keepMicrophone) engine.cancel({ keepMicrophone: true });
      else engine.cancel();
    }
  }
  function abort() { cancelSession(false); }
  /** 안내 음성은 업로드 없이 녹음을 취소한 뒤 재생한다. 다음 화면에서는 예약을 버린다. */
  function stopAnd(callback, options) {
    var hadSession = !!session;
    // 같은 게임의 다음 말하기 차례만 음소거한 마이크를 보관한다. 화면 이동은 abort로 해제한다.
    cancelSession(!!options && options.keepMicrophone === true);
    var version = releaseVersion;
    global.setTimeout(function () { if (version === releaseVersion) callback(); }, hadSession && isApple() ? 350 : 0);
  }
  /** 모델도 전사에 실제로 등장한 후보만 선택할 수 있다. 정답은 이 함수에 전달하지 않는다. */
  function resolveAnswer(text, kind, remote) {
    var local = FQ.spokenAnswer ? FQ.spokenAnswer.resolve(text, { kind: kind }) :
      { status: 'retry', code: null, text: '', reason: 'unavailable', candidates: [] };
    if (remote === undefined) return local;
    if (!remote || (remote.source !== 'rules' && remote.source !== 'jev')) return { status: 'retry', reason: 'invalid-decision' };
    // 명확한 규칙은 모델의 선택으로 덮지 않는다.
    if (local.status !== 'retry') return local;
    if (remote.source !== 'jev' || remote.status !== 'answer' ||
        !FQ.spokenAnswer || !FQ.spokenAnswer.canUseSemantic || !FQ.spokenAnswer.canUseSemantic(text, local)) return local;
    var candidate = (local.candidates || []).filter(function (entry) { return entry.code === remote.code; })[0];
    if (!candidate || remote.text !== candidate.name) return local;
    return { status: 'answer', code: candidate.code, text: candidate.name, reason: 'semantic-choice', source: 'jev' };
  }
  FQ.speech = { supported: supported, isApple: isApple, isStandalone: isStandalone, secureOk: secureOk,
    blocked: blocked, unavailableReason: unavailableReason, start: start, stop: stop, abort: abort,
    stopAnd: stopAnd, resolveAnswer: resolveAnswer, isListening: function () { return !!session; } };
})(window);
