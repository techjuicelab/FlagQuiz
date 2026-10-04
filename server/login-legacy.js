/* 이전 공개 앱의 기록은 임시 보관만 한다. 인증된 앱이 기존 기록과 합친다. */
(function () {
  'use strict';
  var prefix = '#flagquiz-legacy=', key = 'flagquiz.legacy-pending', maxBytes = 512 * 1024;
  var allowed = ['settings', 'stats', 'daily', 'countries', 'badges', 'axes', 'history', 'chest', 'gifts'];
  var status = { status: 'none', reason: '' }, raw = '', sourceHash = location.hash, backupStarted = false;
  window.FQLegacyHandoff = status;
  if (sourceHash.indexOf(prefix) !== 0) return;

  function fail(reason) { status.status = 'failed'; status.reason = reason; }
  function safeDocument(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (Object.keys(value).some(function (name) { return allowed.indexOf(name) < 0; })) return false;
    var remaining = [value];
    while (remaining.length) {
      var current = remaining.pop();
      if (!current || typeof current !== 'object') continue;
      var names = Object.keys(current);
      for (var i = 0; i < names.length; i++) {
        if (names[i] === '__proto__' || names[i] === 'prototype' || names[i] === 'constructor') return false;
        var child = current[names[i]];
        if (typeof child === 'number' && !Number.isFinite(child)) return false;
        if (child && typeof child === 'object') remaining.push(child);
      }
    }
    return true;
  }
  try {
    var token = sourceHash.slice(prefix.length);
    if (token.length > Math.ceil(maxBytes / 3) * 4) fail('size');
    else if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length % 4 === 1) fail('format');
    else {
      var binary = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
      if (binary.length > maxBytes) fail('size');
      else if (btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== token) fail('format');
      else {
        var bytes = new Uint8Array(binary.length);
        for (var j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
        raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        if (!safeDocument(JSON.parse(raw))) fail('format');
        else {
          try {
            sessionStorage.setItem(key, raw);
            if (sessionStorage.getItem(key) !== raw) throw new Error();
            status.status = 'stored';
          } catch (_) { fail('storage'); }
          if (status.status === 'stored') {
            try {
              // 성공한 이 전달 hash만 없애고 경로·query·history state는 그대로 둔다.
              history.replaceState(history.state, '', location.href.slice(0, location.href.length - sourceHash.length));
            } catch (_) { fail('url'); }
          }
        }
      }
    }
  } catch (_) { fail('format'); }

  function attachLoginNotice() {
    if (location.pathname !== '/login') return;
    var notice = document.getElementById('legacy-notice');
    if (!notice) return;
    notice.hidden = false;
    if (status.status === 'stored') {
      notice.textContent = '이전 학습 기록을 임시 보관했어요. 로그인하면 이어서 사용할 수 있어요.';
      return;
    }
    notice.textContent = '이전 학습 기록을 안전하게 옮기지 못했어요. 전달 주소는 그대로 보관하고 있어요. 기록 파일을 먼저 저장하거나 관리자에게 도움을 요청해 주세요.';
    var button = document.createElement('button'); button.type = 'button'; button.textContent = '기록 파일 저장';
    notice.parentNode.insertBefore(button, notice.nextSibling);
    button.addEventListener('click', function () {
      var url;
      try {
        var payload = raw || sourceHash;
        var blob = new Blob([payload], { type: raw ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' });
        url = URL.createObjectURL(blob);
        var link = document.createElement('a'); link.href = url;
        link.download = raw ? 'flagquiz-learning-records.json' : 'flagquiz-record-handoff.txt';
        document.body.appendChild(link); link.click(); link.remove();
        backupStarted = true;
        notice.textContent = '기록 파일 다운로드를 시작했어요. 파일을 저장한 뒤 로그인해 주세요. 기록을 불러오지 못하면 관리자에게 이 파일로 도움을 요청할 수 있어요.';
      } catch (_) { notice.textContent = '기록 파일을 저장하지 못했어요. 전달 주소를 그대로 보관하고 관리자에게 도움을 요청해 주세요.'; }
      finally { if (url) setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }
    });
    function protectLogin(event) {
      if (backupStarted) return;
      event.preventDefault();
      notice.textContent = '학습 기록을 잃지 않도록 기록 파일을 먼저 저장해 주세요. 전달 주소는 그대로 보관하고 있어요.';
    }
    var form = document.querySelector('form[action="/api/auth/password"]');
    if (form) form.addEventListener('submit', protectLogin);
    var links = document.querySelectorAll('a[href="/api/auth/login"]');
    for (var k = 0; k < links.length; k++) links[k].addEventListener('click', protectLogin);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachLoginNotice, { once: true });
  else attachLoginNotice();
})();
