/* 국기 퀴즈 - 서비스 워커
 * 한 번 열어 두면 인터넷 없이도 놀 수 있게 파일을 담아 둔다.
 * 셸·국기·그림·음원을 따로 담아 업데이트 때 기존 음원을 보존한다.
 */
var SHELL_CACHE = 'flagquiz-shell-v1';
var FLAG_CACHE = 'flagquiz-flags-v1';
var ART_CACHE = 'flagquiz-art-v1';
// 아이패드에 받아 둔 음원 114MB를 그대로 쓴다. 이 이름은 바꾸지 않는다.
var AUDIO_CACHE = 'flagquiz-v4';
var KEEP = [SHELL_CACHE, FLAG_CACHE, ART_CACHE, AUDIO_CACHE];
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './css/map.css',
  './data/countries.js',
  './data/subjects.js',
  './data/confusion-groups.js',
  './data/map-coords.js',
  './data/map-shapes.js',
  './js/util.js',
  './js/storage.js',
  './js/features.js',
  './js/audio.js',
  './js/recorded-audio.js',
  './js/voice-manifest.js',
  './js/music-manifest.js',
  './js/music.js',
  './js/speech.js',
  './js/effects.js',
  './js/ui.js',
  './js/map.js',
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
    caches.open(SHELL_CACHE)
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
      return caches.open(FLAG_CACHE).then(function (cache) {
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

function preserveLegacyFlag(legacy, req) {
  // 설치 직후 연결이 끊겨도 이미 받아 둔 국기를 잃지 않는다.
  return caches.open(FLAG_CACHE).then(function (flags) {
    return flags.match(req).then(function (hit) {
      if (hit && hit.ok) return true;
      return legacy.match(req).then(function (res) {
        if (!res || !res.ok) return false;
        return flags.put(req, res).then(function () { return true; });
      });
    });
  }).then(function (saved) {
    return saved ? legacy.delete(req) : null;
  })['catch'](function () { return null; }); // 확보에 실패하면 원본을 남긴다.
}

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k.indexOf('flagquiz-') === 0 && KEEP.indexOf(k) === -1; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () {
        return Promise.all(KEEP.map(function (name) { return caches.open(name); }));
      })
      .then(function () {
        // 국기는 새 버킷에 확보한 뒤 정리한다. 음원은 옮기거나 다시 받지 않는다.
        return caches.open(AUDIO_CACHE).then(function (cache) {
          return cache.keys().then(function (requests) {
            return Promise.all(requests.filter(function (req) {
              return new URL(req.url).pathname.indexOf('/audio/') === -1;
            }).map(function (req) {
              if (new URL(req.url).pathname.indexOf('/flags/') !== -1) return preserveLegacyFlag(cache, req);
              return cache.delete(req);
            }));
          });
        });
      })
      .then(function () { return self.clients.claim(); })
      .then(function () { return warmFlags(); })
  );
});

function matchCache(name, req) {
  return caches.open(name).then(function (cache) { return cache.match(req); });
}

function putCache(name, req, res) {
  return caches.open(name).then(function (cache) { return cache.put(req, res); })
    ['catch'](function () { return null; });
}

function cacheFirst(req, name) {
  return matchCache(name, req)['catch'](function () { return null; }).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (!res || !res.ok) return res;
      return putCache(name, req, res.clone()).then(function () { return res; });
    });
  });
}

function cachedFlag(req) {
  return cacheFirst(req, FLAG_CACHE)['catch'](function (error) {
    // 이관 저장 실패로 v4에 남은 동일 국기를 오프라인 폴백으로 읽는다.
    // 새 버킷·온라인 응답을 우선하며 음원·셸의 조회 규칙은 바꾸지 않는다.
    return matchCache(AUDIO_CACHE, req).then(function (hit) {
      if (hit && hit.ok) return hit;
      throw error;
    });
  });
}

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
  return matchCache(AUDIO_CACHE, whole)['catch'](function () { return null; }).then(function (hit) {
    if (hit && hit.status === 200) return hit;
    return fetch(whole).then(function (res) {
      if (!res || res.status !== 200) return res;
      var copy = res.clone();
      // 저장 완료를 응답 수명에 포함한다. 저장 공간 부족은 현재 재생을 막지 않는다.
      return putCache(AUDIO_CACHE, whole, copy)
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

  // 상징물·대표 명소는 같은 그림 버킷을 쓰며 404는 저장하지 않는다.
  if (url.pathname.indexOf('/images/') !== -1) {
    event.respondWith(cacheFirst(req, ART_CACHE));
    return;
  }

  // 국기 이미지는 한 번 받으면 그대로 쓴다
  if (url.pathname.indexOf('/flags/') !== -1) {
    event.respondWith(cachedFlag(req));
    return;
  }

  // 그 밖의 파일은 새 버전을 먼저 시도하고, 안 되면 담아 둔 것을 쓴다
  event.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          return putCache(SHELL_CACHE, req, copy).then(function () { return res; });
        }
        // 404·503 은 fetch 가 '성공'으로 돌려준다. 배포 전환이나 CDN 퍼지 구간이 바로
        // 아이가 새 코드를 받는 구간이라, 여기서 오류 응답을 그대로 넘기면 흰 화면이 된다.
        // 담아 둔 온전한 사본이 있으면 그것을 쓴다.
        return matchCache(SHELL_CACHE, req).then(function (hit) {
          return hit || res;
        })['catch'](function () { return res; });
      })
      .catch(function () {
        return matchCache(SHELL_CACHE, req).then(function (hit) {
          if (hit) return hit;
          if (req.mode === 'navigate') return matchCache(SHELL_CACHE, './index.html');
          return Response.error();
        })['catch'](function () { return Response.error(); });
      })
  );
});
