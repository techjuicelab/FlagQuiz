/* 로그인과 초대된 이메일 관리. 권한은 서버 세션만 사용한다. */
(function (global) {
  'use strict';
  var FQ = global.FQ = global.FQ || {};
  var session = null, hooks = {}, checking = null, timer = null, mounted = false, generation = 0;
  function preview() {
    var loc = global.location || {};
    return ['localhost', '127.0.0.1', '[::1]'].indexOf(loc.hostname) >= 0 &&
      new global.URLSearchParams(loc.search || '').get('preview') === '1';
  }
  function api(path, options) {
    var opts = Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {});
    opts.headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    if (opts.method && opts.method !== 'GET') opts.headers['X-CSRF-Token'] = session && session.csrfToken || '';
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
  function block(message) {
    generation += 1;
    checking = null;
    session = null;
    navigation(false);
    if (hooks.onBlocked) hooks.onBlocked();
    if (timer) global.clearInterval(timer);
    timer = null;
    var ui = FQ.ui, local = ['localhost', '127.0.0.1', '[::1]'].indexOf((global.location || {}).hostname) >= 0;
    ui.setMain('<section class="screen card auth-gate"><h2>초대받은 가족만 함께 놀아요</h2>' +
      '<p role="status">' + ui.esc(message || '등록된 이메일의 Google 계정으로 로그인해 주세요.') + '</p>' +
      '<a class="btn btn-primary" href="/api/auth/login">Google 계정으로 로그인</a>' +
      '<p class="small muted">등록되지 않은 계정은 접속할 수 없어요.</p>' +
      (local ? '<p class="small muted"><a href="?preview=1">개발 미리보기 열기</a> · 로그인과 음성 API는 연결되지 않아요.</p>' : '') + '</section>');
  }
  function refresh(initial) {
    if (checking) return checking;
    var epoch = generation;
    var request = api('/api/auth/session').then(function (data) {
      if (epoch !== generation) return false;
      if (!data.authenticated) { block(); return false; }
      if (typeof data.expiresAt === 'number' && data.expiresAt <= Date.now()) { block('로그인이 만료됐어요. 다시 로그인해 주세요.'); return false; }
      session = data;
      navigation(true);
      return true;
    }).catch(function () {
      if (initial && epoch === generation) block('지금은 접속을 확인할 수 없어요. 잠시 뒤 다시 열어 주세요.');
      return false;
    }).finally(function () { if (checking === request) checking = null; });
    checking = request;
    return checking;
  }
  function start(options) {
    hooks = options || {};
    navigation(false);
    if (preview()) {
      session = { authenticated: true, preview: true };
      navigation(true);
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
      if (!mounted) {
        mounted = true;
        global.document.addEventListener('visibilitychange', function () {
          if (session && !global.document.hidden) refresh(false);
        });
        global.addEventListener('online', function () { if (session) refresh(false); });
      }
      return true;
    });
  }
  function account(options) {
    if (!session || session.preview) return;
    var ui = FQ.ui, admin = session.role === 'superadmin' || session.role === 'SuperAdmin';
    var host = ui.setMain('<section class="screen account-screen"><div class="screen-heading"><h2>가족 계정</h2>' +
      '<button class="btn btn-sm btn-ghost" id="account-home" type="button">놀이로</button></div>' +
      '<div class="card"><p><b>' + ui.esc(session.email) + '</b></p><p class="small muted">' +
      (admin ? 'SuperAdmin · 초대 이메일을 관리할 수 있어요.' : '초대받은 가족 계정이에요.') + '</p>' +
      '<button class="btn btn-sm" id="account-logout" type="button">로그아웃</button></div>' +
      (admin ? '<section class="card"><h3>접속할 수 있는 이메일</h3><form id="allowlist-form" class="allowlist-form">' +
        '<label for="allowlist-email">초대할 이메일</label><input id="allowlist-email" type="email" autocomplete="email" required maxlength="254">' +
        '<button class="btn btn-primary" type="submit">추가하기</button></form>' +
        '<p class="small muted">추가한 이메일의 Gmail 또는 Google Workspace 계정만 로그인할 수 있어요.</p><p id="allowlist-status" role="status"></p>' +
        '<ul id="allowlist-members" class="allowlist-members"></ul></section>' : '') + '</section>');
    ui.$('#account-home', host).addEventListener('click', options.onHome);
    ui.$('#account-logout', host).addEventListener('click', function () {
      api('/api/auth/logout', { method: 'POST' }).then(function () {
        block('로그아웃했어요.');
        global.location.replace('/');
      }).catch(function () { block('로그아웃을 마치지 못했어요. 다시 로그인해 주세요.'); });
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
      api('/api/admin/allowlist', { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) })
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
  FQ.auth = { start: start, refresh: refresh, account: account, isPreview: preview,
    requireLogin: function () { block('로그인이 필요해요. 다시 로그인해 주세요.'); },
    session: function () { return session; }, csrfToken: function () { return session && session.csrfToken || ''; }, api: api };
})(window);
