/* 국기 퀴즈 - 서비스 워커
 * 한 번 열어 두면 인터넷 없이도 놀 수 있게 파일을 담아 둔다.
 * 국기 SVG는 본 것만 담고(용량 절약), 나머지는 새 버전이 있으면 먼저 받아온다.
 */
var VERSION = 'flagquiz-v2';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './data/countries.js',
  './js/util.js',
  './js/storage.js',
  './js/audio.js',
  './js/speech.js',
  './js/effects.js',
  './js/ui.js',
  './js/progress.js',
  './js/quiz.js',
  './js/badges.js',
  './js/screens.js',
  './js/app.js',
  './assets/favicon.svg',
  './assets/icon.svg',
  './assets/icon-180.png',
  './assets/icon-192.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

/**
 * 국기 194장을 미리 담아 둔다. 다 합쳐도 2MB 남짓이라,
 * 한 번 담아 두면 인터넷 없이도 처음 보는 나라가 회색 네모로 나오지 않는다.
 * 설치를 붙잡지 않도록 활성화 뒤에 조금씩 담고, 실패해도 그냥 넘어간다.
 */
function warmFlags() {
  return fetch('./data/countries.js')
    .then(function (res) { return res.ok ? res.text() : ''; })
    .then(function (src) {
      var codes = [];
      var re = /"code"\s*:\s*"([a-z]{2})"/g;
      var m;
      while ((m = re.exec(src))) codes.push(m[1]);
      if (!codes.length) return;
      return caches.open(VERSION).then(function (cache) {
        var i = 0;
        function nextChunk() {
          if (i >= codes.length) return;
          var chunk = codes.slice(i, i + 20).map(function (c) { return './flags/' + c + '.svg'; });
          i += 20;
          return Promise.all(chunk.map(function (u) {
            return cache.match(u).then(function (hit) {
              return hit ? null : cache.add(u)['catch'](function () { return null; });
            });
          })).then(nextChunk);
        }
        return nextChunk();
      });
    })['catch'](function () { return null; });
}

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== VERSION; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
      .then(function () { return warmFlags(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 국기 이미지는 한 번 받으면 그대로 쓴다
  if (url.pathname.indexOf('/flags/') !== -1) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(VERSION).then(function (c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
    return;
  }

  // 그 밖의 파일은 새 버전을 먼저 시도하고, 안 되면 담아 둔 것을 쓴다
  event.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
  );
});
