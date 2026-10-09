/* 로그인 화면에서는 앱 캐시·등록과 이전 로그아웃 예약만 정리하고 학습 기록은 보존한다. */
(function () {
  'use strict';
  // 서버가 실제 로그인 폼을 표시했다면 이전 쿠키는 더 이상 유효하지 않다.
  // 새 로그인까지 예전 로그아웃 예약으로 취소하지 않도록 예약만 해제한다.
  try { window.localStorage.removeItem('flagquiz.logout-pending'); } catch (error) { /* 저장소 제한에도 로그인은 계속한다. */ }
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(function (registrations) {
    return Promise.all(registrations.filter(function (registration) {
      if (registration.scope !== location.origin + '/') return false;
      return [registration.active, registration.waiting, registration.installing].some(function (worker) {
        if (!worker) return false;
        var url = new URL(worker.scriptURL);
        return url.origin === location.origin && url.pathname === '/sw.js';
      });
    }).map(function (registration) { return registration.unregister(); }));
  }).catch(function () {});
  if ('caches' in window) caches.keys().then(function (names) {
    return Promise.all(names.filter(function (name) { return name.indexOf('flagquiz-') === 0; }).map(function (name) { return caches.delete(name); }));
  }).catch(function () {});
})();
