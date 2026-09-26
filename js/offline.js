/* 오프라인 자료의 실제 저장 상태와, 끊겨도 이어받는 전체 저장 안내. */
(function (global) {
  'use strict';
  var FQ = global.FQ = global.FQ || {};
  var nav = global.navigator;
  var doc = global.document;
  var registration = null;
  var initialized = false;
  var available = false;
  var activeRequest = null;
  var registrationAttempt = null;
  var registrationSequence = 0;
  var checkedWorker = null;
  var failedWorker = null;
  var warmedWorker = null;
  var warmedAt = 0;
  var statusWorker = null;
  var statusCheckedAt = 0;
  var sequence = 0;
  var downloadWanted = false;
  var resumeAfterCurrent = false;
  var reconnectTimer = null;
  var state = { status: 'checking', cached: 0, total: 0 };

  function node(id) { return doc.getElementById(id); }
  function online() { return nav.onLine !== false; }
  function worker() { return nav.serviceWorker.controller || (registration && registration.active); }
  function busy() { return !!(activeRequest && activeRequest.type === 'OFFLINE_DOWNLOAD') || (!available && !!registrationAttempt); }

  function render() {
    var status = node('offline-status');
    if (!status) return;
    var ready = state.status === 'ready';
    var summary = '일부 저장됨';
    var message = '전체 저장을 누르면 처음 만나는 나라의 그림과 소리까지 준비해요.';
    if (!available) {
      summary = state.status === 'unsupported' ? '저장할 수 없음' : '준비 확인';
      message = state.status === 'unsupported'
        ? '오프라인 저장은 HTTPS 주소나 localhost에서 지원하는 브라우저로 열어 주세요.'
        : '저장 기능을 준비하고 있어요. 잠시 뒤 다시 확인할 수 있어요.';
    }
    if (state.status === 'checking') { summary = '확인 중'; message = '이 기기에 저장한 놀이를 확인하고 있어요.'; }
    if (state.status === 'downloading') { summary = '저장 중'; message = '그림과 소리를 저장하고 있어요. 저장하는 동안에도 놀 수 있어요.'; }
    if (ready) { summary = '준비 완료'; message = '그림과 읽어주기까지 모두 준비됐어요. 인터넷 없이도 놀 수 있어요.'; }
    if (state.error === 'quota') message = '기기 저장 공간이 부족해요. 공간을 확보한 뒤 이어서 저장해 주세요. 이미 받은 자료는 남아 있어요.';
    else if (state.error === 'storage') message = '이 브라우저에 자료를 저장하지 못했어요. 저장 공간과 브라우저 설정을 확인한 뒤 다시 시도해 주세요.';
    else if (state.error) message = online()
      ? '저장을 마치지 못했어요. 연결을 확인하고 이어서 저장해 주세요. 이미 받은 자료는 남아 있어요.'
      : '인터넷이 다시 연결되면 나머지를 이어서 저장해요. 지금은 저장한 자료로 놀 수 있어요.';
    else if (!online() && !ready && !busy()) message = '지금은 저장한 자료로 놀 수 있어요. 인터넷에 연결한 뒤 전체 저장을 마쳐 주세요.';
    status.textContent = message;
    node('offline-summary').textContent = summary;
    var homeSummary = node('home-offline-summary');
    if (homeSummary) homeSummary.textContent = summary;
    var progress = node('offline-progress');
    progress.hidden = !state.total || ready;
    progress.max = state.total || 1;
    progress.value = state.cached || 0;
    progress.setAttribute('aria-valuetext', (state.cached || 0) + ' / ' + (state.total || 0) + '개 저장');
    var button = node('offline-download');
    button.hidden = ready || state.status === 'unsupported';
    button.disabled = busy() || !online();
    button.textContent = !available ? '다시 확인하기' : state.status === 'downloading' ? '저장 중…' : downloadWanted && state.cached ? '이어서 저장하기' : '전체 저장하기';
    var connection = node('connection-note');
    connection.hidden = online();
    connection.textContent = ready ? '인터넷 없이 놀고 있어요.' : '인터넷이 없어도 저장한 놀이를 계속할 수 있어요.';
  }

  function fail(error) {
    clearReconnectRetry();
    state = { status: 'partial', cached: state.cached, total: state.total, error: error };
    render();
  }

  function clearReconnectRetry() {
    resumeAfterCurrent = false;
    if (reconnectTimer !== null) { global.clearTimeout(reconnectTimer); reconnectTimer = null; }
  }

  function request(type) {
    if (!available || !worker() || activeRequest) return;
    if (reconnectTimer !== null) { global.clearTimeout(reconnectTimer); reconnectTimer = null; }
    var target = worker();
    checkedWorker = target;
    if (type === 'OFFLINE_STATUS') { statusWorker = target; statusCheckedAt = Date.now(); }
    var id = ++sequence;
    var channel = new global.MessageChannel();
    var timer;
    function close() {
      global.clearTimeout(timer);
      channel.port1.close();
      if (activeRequest && activeRequest.id === id) activeRequest = null;
    }
    function arm() {
      global.clearTimeout(timer);
      timer = global.setTimeout(function () {
        if (!activeRequest || activeRequest.id !== id) return;
        close();
        available = false;
        failedWorker = target;
        fail('timeout');
      }, 30000);
    }
    activeRequest = { id: id, type: type, close: close };
    state.status = type === 'OFFLINE_DOWNLOAD' ? 'downloading' : 'checking';
    state.error = null;
    render();
    channel.port1.onmessage = function (event) {
      var data = event.data;
      if (!activeRequest || activeRequest.id !== id || !data || data.type !== 'OFFLINE_PROGRESS' || data.requestId !== id) return;
      failedWorker = null;
      state = data;
      if (data.status === 'checking' || data.status === 'downloading') arm();
      else {
        close();
        // 연결이 빨리 돌아오면 새 요청도 아직 끝나지 않은 실패 작업에 합류할 수 있다.
        // 그 작업이 끝난 다음 한 번만 새로 시작하며, 일반 연결 실패를 계속 재시도하지 않는다.
        var retryAfterEnd = resumeAfterCurrent && type === 'OFFLINE_DOWNLOAD' && downloadWanted && online() &&
          (data.status === 'partial' || data.status === 'error') && data.error === 'network';
        clearReconnectRetry();
        if (data.status === 'ready') downloadWanted = false;
        if (retryAfterEnd) reconnectTimer = global.setTimeout(function () {
          reconnectTimer = null;
          if (downloadWanted && online() && !activeRequest) request('OFFLINE_DOWNLOAD');
        }, 0);
      }
      render();
    };
    arm();
    try { target.postMessage({ type: type, requestId: id }, [channel.port2]); }
    catch (e) { close(); available = false; failedWorker = target; fail('storage'); }
  }

  function refresh(quiet) {
    if (!available || activeRequest) return;
    if (quiet && !downloadWanted && statusWorker === worker() && Date.now() - statusCheckedAt < 30000) return;
    request(downloadWanted && online() ? 'OFFLINE_DOWNLOAD' : 'OFFLINE_STATUS');
  }

  function warmSmall(force) {
    if (!available || !online() || !worker()) return;
    var target = worker();
    var now = Date.now();
    if (!force && target === warmedWorker && now - warmedAt < 30000) return;
    try {
      target.postMessage({ type: 'OFFLINE_WARM' });
      warmedWorker = target;
      warmedAt = now;
    } catch (e) { /* 다음 연결이나 화면 복귀 때 작은 자료만 다시 준비한다. */ }
  }

  /** controllerchange와 등록 완료가 같은 워커를 알려도 전체 검사는 한 번만 한다. */
  function useWorker(retry) {
    var target = worker();
    if (!target || (target === failedWorker && !retry)) return false;
    if (target === checkedWorker && available) return true;
    if (activeRequest) activeRequest.close();
    available = true;
    warmSmall(false);
    refresh();
    return true;
  }

  function register(retry) {
    if (registrationAttempt) return;
    var id = ++registrationSequence;
    var timer;
    var attempt = { id: id };
    registrationAttempt = attempt;
    function current() { return registrationAttempt === attempt && registrationSequence === id; }
    function close() {
      global.clearTimeout(timer);
      if (current()) registrationAttempt = null;
    }
    function failed(error) {
      if (!current()) return;
      close();
      // 오프라인 등록 갱신 실패가 기존 워커의 검사 결과나 다운로드를 덮어쓰지 않는다.
      if (available || activeRequest || useWorker(false)) render();
      else fail(error);
    }
    function activated() {
      if (!current()) return;
      close();
      if (!useWorker(!!retry)) fail('network');
      else render();
    }
    // 사용 가능한 워커의 상태 확인은 등록 갱신을 기다리지 않는다. 첫 설치만 준비 중으로 잠근다.
    if (!available && !activeRequest) { state.status = 'checking'; state.error = null; }
    render();
    timer = global.setTimeout(function () { failed('timeout'); }, 15000);
    Promise.resolve().then(function () {
      // 응답하지 않는 구버전 워커에서 재시도하면 등록 갱신까지 다시 수행한다.
      return retry && registration && typeof registration.update === 'function'
        ? registration.update() : nav.serviceWorker.register('sw.js');
    }).then(function (reg) {
      if (!current()) return;
      registration = reg;
      var installing = reg.installing || reg.waiting;
      if (!installing) { activated(); return; }
      useWorker(false);
      function changed() {
        if (!current()) return;
        if (installing.state === 'activated') activated();
        else if (installing.state === 'redundant') failed('network');
      }
      installing.addEventListener('statechange', changed);
      changed();
    }).catch(function () { failed('network'); });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    var proto = global.location.protocol;
    var host = global.location.hostname;
    if (!nav.serviceWorker || !global.MessageChannel ||
        (proto !== 'https:' && host !== 'localhost' && host !== '127.0.0.1')) {
      state.status = 'unsupported';
      render();
      return;
    }
    node('offline-download').addEventListener('click', function () {
      if (!online() || busy()) return;
      clearReconnectRetry();
      // 복귀 직후 상태를 검사하고 있어도, 아이가 누른 전체 저장을 먼저 시작한다.
      if (activeRequest) activeRequest.close();
      downloadWanted = true;
      if (!available) register(true);
      else request('OFFLINE_DOWNLOAD');
    });
    nav.serviceWorker.addEventListener('controllerchange', function () {
      useWorker(false);
    });
    global.addEventListener('online', function () {
      clearReconnectRetry();
      resumeAfterCurrent = downloadWanted;
      if (available) {
        warmSmall(true);
        if (activeRequest) activeRequest.close();
        refresh();
      } else register(true);
      render();
    });
    global.addEventListener('offline', function () { clearReconnectRetry(); render(); });
    doc.addEventListener('visibilitychange', function () {
      if (!doc.hidden) { warmSmall(false); refresh(true); }
    });
    useWorker(false);
    register(false);
  }

  FQ.offline = { init: init, render: render };
})(window);
