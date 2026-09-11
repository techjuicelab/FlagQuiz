/* 국기 퀴즈 - 서비스 워커
 * 한 번 열어 두면 인터넷 없이도 놀 수 있게 파일을 담아 둔다.
 * 국기 SVG는 본 것만 담고(용량 절약), 나머지는 새 버전이 있으면 먼저 받아온다.
 */
var VERSION = 'flagquiz-v4';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './data/countries.js',
  './js/util.js',
  './js/storage.js',
  './js/audio.js',
  './js/recorded-audio.js',
  './js/voice-manifest.js',
  './js/music-manifest.js',
  './js/music.js',
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
        return Promise.all(keys.filter(function (k) { return k.indexOf('flagquiz-') === 0 && k !== VERSION; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
      .then(function () { return warmFlags(); })
  );
});

/** 전체 음원에서 브라우저가 요청한 구간을 잘라 준다(사파리의 첫 2바이트 탐색 포함). */
function audioRange(req, res) {
  var range = req.headers.get('range');
  if (!range || res.status !== 200) return res;
  var match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  // 복수 구간이나 알 수 없는 형식은 Range를 무시하고 전체 200을 제공한다.
  if (!match || (!match[1] && !match[2])) return res;
  return res.arrayBuffer().then(function (buffer) {
    var size = buffer.byteLength;
    var start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    var end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    var headers = new Headers(res.headers);
    // arrayBuffer는 해제된 본문을 주므로 압축된 원본의 길이·인코딩은 전달하지 않는다.
    headers.delete('content-encoding');
    headers.set('accept-ranges', 'bytes');
    if (!size || start >= size || start > end || !isFinite(start) || !isFinite(end)) {
      headers.set('content-range', 'bytes */' + size);
      headers.set('content-length', '0');
      return new Response(null, { status: 416, statusText: 'Range Not Satisfiable', headers: headers });
    }
    headers.set('content-range', 'bytes ' + start + '-' + end + '/' + size);
    headers.set('content-length', String(end - start + 1));
    return new Response(buffer.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers: headers });
  });
}

function cachedAudio(req) {
  // 206 응답은 Cache.put에 저장할 수 없다. 최초 재생부터 전체 파일을 받아 보관한다.
  var headers = new Headers(req.headers);
  headers.delete('range');
  headers.delete('if-range');
  var whole = new Request(req, { headers: headers });
  return caches.match(whole)['catch'](function () { return null; }).then(function (hit) {
    if (hit && hit.status === 200) return hit;
    return fetch(whole).then(function (res) {
      if (!res || res.status !== 200) return res;
      var copy = res.clone();
      // 저장 완료를 응답 수명에 포함한다. 저장 공간 부족은 현재 재생을 막지 않는다.
      return caches.open(VERSION).then(function (cache) { return cache.put(whole, copy); })
        ['catch'](function () { return null; })
        .then(function () { return res; });
    });
  }).then(function (res) { return audioRange(req, res); });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.indexOf('/audio/') !== -1) {
    event.respondWith(cachedAudio(req));
    return;
  }

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
          if (hit) return hit;
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      })
  );
});
