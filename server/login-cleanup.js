/* 로그인 화면에서는 이전 공개 PWA 의 앱 캐시와 등록만 정리하고 학습 기록은 보존한다. */
(function () {
  'use strict';
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
