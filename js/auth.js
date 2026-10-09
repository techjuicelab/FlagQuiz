/* 로그인과 초대된 이메일 관리. 권한은 서버 세션만 사용한다. */
(function (global) {
  'use strict';
  var FQ = global.FQ = global.FQ || {};
  var session = null, hooks = {}, checking = null, timer = null, mounted = false, generation = 0;
  var LOGOUT_KEY = 'flagquiz.logout-pending', pendingLogout = false;
  try { pendingLogout = global.localStorage.getItem(LOGOUT_KEY) === '1'; } catch (e) { /* 저장소 차단은 로그인 확인을 막지 않는다. */ }
  function online() { return global.navigator.onLine !== false; }
  function markLogout(pending) {
    pendingLogout = pending;
    try {
      if (pending) global.localStorage.setItem(LOGOUT_KEY, '1');
      else global.localStorage.removeItem(LOGOUT_KEY);
    } catch (e) { /* 현재 창의 차단 상태와 워커의 캐시 삭제는 계속 유지한다. */ }
  }
  function clearOffline() {
    try {
      var worker = global.navigator.serviceWorker && global.navigator.serviceWorker.controller;
      if (worker) worker.postMessage({ type: 'OFFLINE_CLEAR' });
    } catch (e) { /* 서버의 권한 확인은 오프라인 캐시와 별도로 계속 적용된다. */ }
  }
  function preview() {
    var loc = global.location || {};
    return ['localhost', '127.0.0.1', '[::1]'].indexOf(loc.hostname) >= 0 &&
      new global.URLSearchParams(loc.search || '').get('preview') === '1';
  }
  function api(path, options) {
    var opts = Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {});
    if ((session && session.offline || !online()) && path !== '/api/auth/session') {
      return Promise.reject(new Error('이 기능은 인터넷에 연결한 뒤 사용할 수 있어요.'));
    }
    opts.headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    if (opts.method && opts.method !== 'GET' && !opts.headers['X-CSRF-Token']) opts.headers['X-CSRF-Token'] = session && session.csrfToken || '';
    return global.fetch(path, opts).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var error = new Error(data.message || (data.error && data.error.message) || '요청을 마치지 못했어요.');
          error.status = response.status;
          if (response.status === 401 || (response.status === 403 && path.indexOf('/api/admin/') !== 0)) block('로그인이 필요해요. 다시 로그인해 주세요.');
          throw error;
        }
        return data;
      });
    });
  }
  function navigation(enabled) {
    var doc = global.document;
    ['nav-home', 'nav-dex', 'nav-stats', 'nav-settings'].forEach(function (id) {
      var button = doc.getElementById(id);
      if (button) button.disabled = !enabled;
    });
    var account = doc.getElementById('nav-account');
    if (account) account.hidden = !enabled || !session || session.preview;
  }
  function changeSession(next) {
    var previous = session;
    session = next;
    navigation(true);
    // 브라우저 연결 이벤트 뒤 실제 서버 확인은 늦게 끝날 수 있으므로 완료 시에도 알린다.
    if (hooks.onSessionChange) hooks.onSessionChange(session, previous);
  }
  function block(message, clear) {
    generation += 1;
    checking = null;
    session = null;
    if (clear !== false) clearOffline();
    navigation(false);
    if (hooks.onBlocked) hooks.onBlocked();
    if (timer) global.clearInterval(timer);
    timer = null;
    var ui = FQ.ui, local = ['localhost', '127.0.0.1', '[::1]'].indexOf((global.location || {}).hostname) >= 0;
    ui.setMain('<section class="screen card auth-gate"><h2>초대받은 가족만 함께 놀아요</h2>' +
      '<p role="status">' + ui.esc(message || '기존 TechJuice ID로 로그인해 주세요.') + '</p>' +
      '<a class="btn btn-primary" href="/login">TechJuice ID로 로그인</a>' +
      '<p class="small muted">세계 놀이 권한이 있는 TechJuice ID만 접속할 수 있어요.</p>' +
      (local ? '<p class="small muted"><a href="?preview=1">개발 미리보기 열기</a> · 로그인과 음성 API는 연결되지 않아요.</p>' : '') + '</section>');
  }
  function finishLogout(initial) {
    if (checking) return checking;
    if (!online()) {
      if (initial) block('이 기기에서 로그아웃했어요. 인터넷에 연결되면 로그인을 마저 해제해요.', false);
      return Promise.resolve(false);
    }
    var request = api('/api/auth/session').then(function (data) {
      // 캐시의 오프라인 확인으로는 서버 쿠키를 해제했다고 간주하지 않는다.
      if (data.offline) throw new Error('offline');
      if (!data.authenticated) return;
      return api('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': data.csrfToken || '' } });
    }).then(function () {
      markLogout(false);
      block('로그아웃했어요.', false);
      return false;
    }).catch(function (error) {
      if (error.status === 401) markLogout(false);
      if (initial) block('이 기기에서 로그아웃했어요. 인터넷에 연결되면 로그인을 마저 해제해요.', false);
      return false;
    }).finally(function () { if (checking === request) checking = null; });
    checking = request;
    return request;
  }
  function refresh(initial) {
    if (session && session.preview) {
      changeSession(session);
      return Promise.resolve(true);
    }
    if (pendingLogout) return finishLogout(initial);
    if (checking) return checking;
    if (session && typeof session.expiresAt === 'number' && session.expiresAt <= Date.now()) {
      block('로그인이 만료됐어요. 다시 로그인해 주세요.');
      return Promise.resolve(false);
    }
    var epoch = generation;
    var request = api('/api/auth/session').then(function (data) {
      if (epoch !== generation) return false;
      if (!data.authenticated) { block(); return false; }
      if (data.offline && (typeof data.expiresAt !== 'number' || !Number.isFinite(data.expiresAt))) {
        block('인터넷에 연결해 로그인한 뒤 오프라인 놀이를 준비해 주세요.'); return false;
      }
      if (typeof data.expiresAt === 'number' && data.expiresAt <= Date.now()) { block('로그인이 만료됐어요. 다시 로그인해 주세요.'); return false; }
      // 저장된 로그인 확인에는 계정 정보·관리 권한·API 토큰을 복원하지 않는다.
      changeSession(data.offline ? { authenticated: true, offline: true, expiresAt: data.expiresAt } : data);
      return true;
    }).catch(function () {
      if (initial && epoch === generation) block('지금은 접속을 확인할 수 없어요. 잠시 뒤 다시 열어 주세요.', false);
      return false;
    }).finally(function () { if (checking === request) checking = null; });
    checking = request;
    return checking;
  }
  function start(options) {
    hooks = options || {};
    navigation(false);
    if (!mounted) {
      mounted = true;
      global.document.addEventListener('visibilitychange', function () {
        if ((session || pendingLogout) && !global.document.hidden) refresh(false);
      });
      global.addEventListener('online', function () { if (session || pendingLogout) refresh(false); });
      if (global.navigator.serviceWorker && global.navigator.serviceWorker.addEventListener) {
        global.navigator.serviceWorker.addEventListener('message', function (event) {
          if (event.data && event.data.type === 'OFFLINE_AUTH_REVOKED' && !pendingLogout && (session || checking)) {
            block('로그인이 해제됐어요. 인터넷에 연결해 다시 로그인해 주세요.', false);
          }
        });
      }
    }
    if (preview()) {
      changeSession({ authenticated: true, preview: true });
      if (hooks.onReady) hooks.onReady();
      return Promise.resolve(true);
    }
    return refresh(true).then(function (ready) {
      if (!ready) return false;
      if (hooks.onReady) hooks.onReady();
      timer = global.setInterval(function () {
        if (session && typeof session.expiresAt === 'number' && session.expiresAt <= Date.now()) {
          block('로그인이 만료됐어요. 다시 로그인해 주세요.'); return;
        }
        if (!global.document.hidden && global.navigator.onLine !== false) refresh(false);
      }, 60000);
      return true;
    });
  }
  function logout() {
    markLogout(true);
    block('이 기기에서 로그아웃했어요. 인터넷에 연결되면 로그인을 마저 해제해요.');
    if (!online()) return Promise.resolve(true);
    return finishLogout(false).then(function () { return !pendingLogout; });
  }
  function account(options) {
    if (!session || session.preview) return;
    var ui = FQ.ui, offline = session.offline || !online(), admin = !offline && (session.role === 'superadmin' || session.role === 'SuperAdmin');
    var host = ui.setMain('<section class="screen account-screen"><div class="screen-heading"><h2>가족 계정</h2>' +
      '<button class="btn btn-sm btn-ghost" id="account-home" type="button">놀이로</button></div>' +
      '<div class="card"><p><b>' + ui.esc(offline ? '오프라인 가족 계정' : session.email) + '</b></p><p class="small muted">' +
      (offline ? '저장한 놀이를 계속할 수 있어요. 계정 관리는 인터넷에 연결한 뒤 사용할 수 있어요.' : admin ? 'SuperAdmin · 초대 이메일을 관리할 수 있어요.' : 'TechJuice ID로 로그인한 가족 계정이에요.') + '</p>' +
      '<button class="btn btn-sm" id="account-logout" type="button">로그아웃</button></div>' +
      (admin ? '<section class="card"><h3>세계 놀이 계정 접근</h3><form id="allowlist-form" class="allowlist-form">' +
        '<label for="allowlist-email">아이디 또는 이메일</label><input id="allowlist-email" type="text" autocomplete="username" required maxlength="254">' +
        '<button class="btn btn-primary" type="submit">추가하기</button></form>' +
        '<p class="small muted">기존 TechJuice ID의 세계 놀이 접근을 관리해요.</p><p id="allowlist-status" role="status"></p>' +
        '<ul id="allowlist-members" class="allowlist-members"></ul></section>' : '') + '</section>');
    ui.$('#account-home', host).addEventListener('click', options.onHome);
    ui.$('#account-logout', host).addEventListener('click', function () {
      logout().then(function (complete) { if (complete && online()) global.location.replace('/'); });
    });
    if (!admin) return;
    var status = ui.$('#allowlist-status', host), members = ui.$('#allowlist-members', host), busy = false;
    function current() { return host.contains(members); }
    function load() {
      return api('/api/admin/allowlist').then(function (data) {
        if (!current()) return;
        var rows = Array.isArray(data) ? data : data.members || data.allowlist || [];
        members.innerHTML = rows.map(function (item) {
          var email = typeof item === 'string' ? item : item.email;
          var fixed = String(email).toLowerCase() === 'techjuicelab@gmail.com';
          return '<li><span>' + ui.esc(email) + (fixed ? ' · SuperAdmin' : '') + '</span>' +
            (fixed ? '' : '<button type="button" class="btn btn-sm" data-remove-email="' + ui.esc(email) + '">접속 해제</button>') + '</li>';
        }).join('');
      }).catch(function (error) { if (current()) status.textContent = error.message; });
    }
    function mutate(method, email) {
      if (busy) return;
      busy = true;
      status.textContent = '변경하고 있어요…';
      api('/api/admin/allowlist', { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(method === 'POST' ? { identifier: email } : { email: email }) })
        .then(function () {
          if (!current()) return;
          ui.$('#allowlist-email', host).value = '';
          status.textContent = method === 'POST' ? '이 이메일로 접속할 수 있어요.' : '이 이메일의 접속을 해제했어요.';
          return load();
        }).catch(function (error) { if (current()) status.textContent = error.message; })
        .finally(function () { busy = false; });
    }
    ui.$('#allowlist-form', host).addEventListener('submit', function (event) {
      event.preventDefault();
      mutate('POST', ui.$('#allowlist-email', host).value.trim());
    });
    ui.on(members, '[data-remove-email]', 'click', function (event, button) { mutate('DELETE', button.getAttribute('data-remove-email')); });
    load();
  }
  FQ.auth = { start: start, refresh: refresh, account: account, logout: logout, isPreview: preview,
    requireLogin: function () { block('로그인이 필요해요. 다시 로그인해 주세요.'); },
    session: function () { return session; }, csrfToken: function () { return online() && session && !session.offline && session.csrfToken || ''; }, api: api };
})(window);
