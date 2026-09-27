/* 국기 퀴즈 - 서비스 워커
 * 한 번 열어 두면 인터넷 없이도 놀 수 있게 파일을 담아 둔다.
 * 셸·국기·그림·음원을 따로 담아 업데이트 때 기존 음원을 보존한다.
 */
// 배포 빌드는 셸 콘텐츠 해시로 치환한다. 설치가 모두 끝난 버전만 활성화한다.
var SHELL_CACHE = 'flagquiz-shell-v2';
var FLAG_CACHE = 'flagquiz-flags-v1';
var ART_CACHE = 'flagquiz-art-v1';
// 아이패드에 이미 받아 둔 음원을 그대로 쓴다. 이 이름은 바꾸지 않는다.
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
  './js/offline.js',
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
  './assets/icon-192.png',
  './assets/gifts-sprite.png',
  './assets/gifts-sprite-2.png',
  './assets/gifts-sprite-3.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function (cache) {
        return cache.addAll(SHELL.map(function (url) {
          return new Request(new URL(url, self.location.href).href, { cache: 'reload' });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

/**
 * 국기 194장을 미리 담아 둔다. 다 합쳐도 2MB 남짓이라,
 * 한 번 담아 두면 인터넷 없이도 처음 보는 나라가 회색 네모로 나오지 않는다.
 * 설치를 붙잡지 않도록 활성화 뒤에 조금씩 담고, 실패해도 그냥 넘어간다.
 */
function warmFlags() {
  return manifestText('./data/countries.js')
    .then(function (src) {
      var codes = [];
      var re = /"code"\s*:\s*"([a-z]{2})"/g;
      var m;
      while ((m = re.exec(src))) codes.push(m[1]);
      if (!codes.length) return false;
      return caches.open(FLAG_CACHE).then(function (cache) {
        var i = 0, failed = false;
        function nextChunk() {
          if (i >= codes.length) return !failed;
          var chunk = codes.slice(i, i + 20).map(function (c) { return './flags/' + c + '.svg'; });
          i += 20;
          return Promise.all(chunk.map(function (u) {
            return cache.match(u).then(function (hit) {
              return hit && hit.ok ? null : saveAsset(cache, { url: u })['catch'](function () { failed = true; });
            });
          })).then(nextChunk);
        }
        return nextChunk();
      });
    })['catch'](function () { return null; });
}

/**
 * 상징물·명소 그림을 활성화 뒤에 조금씩 담아 둔다.
 * 아이는 차 안에서 비행기 모드로 논다. 그림을 그때 받으려 하면 문제가 통째로 잠기고
 * 답도 못 하고 넘기지도 못한다. 국기와 같은 방식으로 미리 받아 둔다.
 * 342장 8.5MB 라 설치·활성화를 붙잡으면 안 되고, 실패해도 그냥 넘어간다.
 *
 * 워커는 30초쯤 한가하면 브라우저가 꺼 버린다. 예열이 중간에 끊기면 다음 온라인 신호
 * (앱을 열거나 연결이 복구된 순간)에 resumeArtWarm 이 남은 것을 이어받는다.
 * 다 채운 목록은 그림 버킷 안의 기록(ART_WARM_MARK)으로 남겨, 워커가 다시 뜰 때마다
 * 342번 조회를 되풀이하지 않는다. 목록이나 그림 크기가 바뀐 배포에서는 기록이 어긋나
 * 다시 훑고, 크기가 다른 옛 그림은 새로 받는다.
 */
var ART_WARM_MARK = './images/_warm-art'; // 페이지가 절대 요청하지 않는 이름이라 cacheFirst 와 섞이지 않는다.
var artWarm = null;       // 이 워커 수명 안에서 도는 예열 약속
var artWarmRetryAt = 0;   // 끝까지 못 채운 예열을 곧바로 되풀이하지 않는다

/** 대입 자리부터 짝이 맞는 닫는 중괄호까지 잘라 낸다. JSON 문자열 속 중괄호·따옴표는 세지 않는다. */
function sliceObjectLiteral(src, start) {
  var depth = 0, inString = false;
  for (var i = start; i < src.length; i++) {
    var ch = src.charAt(i);
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (!depth) return src.slice(start, i + 1); }
  }
  return null;
}

/** subjects.js 본문에서 받아야 할 그림 경로와, 원장이 적어 둔 바이트 수를 뽑는다. */
function artItemsFrom(src) {
  // 파일은 IIFE 로 감싸여 있고 머리말 주석에도 'subjects' 라는 글자가 있다. 대입 자리를 정확히 집는다.
  var assign = /FQ\.subjects\s*=\s*\{/.exec(src);
  if (!assign) return [];
  var literal = sliceObjectLiteral(src, assign.index + assign[0].length - 1);
  if (!literal) return [];
  var subjects;
  try { subjects = JSON.parse(literal); }
  catch (e) { return []; }
  var items = [];
  Object.keys(subjects).forEach(function (code) {
    [['symbol', './images/symbols/'], ['place', './images/places/']].forEach(function (pair) {
      var subject = subjects[code] && subjects[code][pair[0]];
      // noArt 는 원장이 보류한 소재다. 받을 파일이 아예 없으므로 요청하지 않는다.
      if (subject && !subject.noArt) items.push({ url: pair[1] + code + '.webp', bytes: subject.bytes > 0 ? subject.bytes : 0 });
    });
  });
  return items;
}

/** 담아 둔 그림이 배포본과 같은 크기인가. 'fresh' | 'stale' | 'missing'. 크기를 모르면 있는 것을 믿는다. */
function artState(hit, bytes) {
  if (!hit || !hit.ok) return Promise.resolve('missing');
  if (!bytes) return Promise.resolve('fresh');
  var length = Number(hit.headers.get('content-length'));
  if (length > 0) return Promise.resolve(length === bytes ? 'fresh' : 'stale');
  return hit.arrayBuffer().then(function (buffer) { return buffer.byteLength === bytes ? 'fresh' : 'stale'; })
    ['catch'](function () { return 'missing'; });
}

/** 한 바퀴 돈다. 전부 담겼으면 true, 하나라도 못 받았으면 false. 절대 거부하지 않는다. */
function warmArt() {
  return manifestText('./data/subjects.js')
    .then(function (src) {
      var items = artItemsFrom(src);
      if (!items.length) return false;
      var stamp = items.map(function (it) { return it.url + ' ' + it.bytes; }).join('\n');
      return caches.open(ART_CACHE).then(function (cache) {
        return cache.match(ART_WARM_MARK)
          .then(function (mark) { return mark ? mark.text() : ''; })
          ['catch'](function () { return ''; })
          .then(function (previous) {
            if (previous === stamp) return true; // 지난 예열이 같은 목록을 다 채웠다.
            var i = 0, failed = 0;
            function refill(it) {
              return cache.match(it.url)
                .then(function (hit) { return artState(hit, it.bytes); }, function () { return 'missing'; })
                .then(function (state) {
                  if (state === 'fresh') return null;
                  // 크기가 다른 옛 그림은 브라우저 HTTP 캐시도 건너뛰고 서버에서 새로 받는다. 못 받으면 옛 것이 남는다.
                  // Request 는 상대 경로를 못 받으므로 워커 주소 기준으로 절대 경로를 만든다.
                  var req = state === 'stale' ? new Request(new URL(it.url, self.location.href).href, { cache: 'reload' }) : it.url;
                  return saveAsset(cache, { url: it.url, bytes: it.bytes }, req)['catch'](function () { failed += 1; });
                });
            }
            function nextChunk() {
              if (i >= items.length) return null;
              var chunk = items.slice(i, i + 10);
              i += 10;
              return Promise.all(chunk.map(refill)).then(nextChunk);
            }
            return Promise.resolve(nextChunk()).then(function () {
              if (failed) return false;
              return cache.put(ART_WARM_MARK, new Response(stamp))
                .then(function () { return true; }, function () { return false; });
            });
          });
      });
    })['catch'](function () { return false; });
}

/** 도는 예열이 있으면 그것을, 없으면 새로 시작한 것을 돌려준다. 못 채운 예열은 5분 뒤에야 다시 시도한다. */
function resumeArtWarm() {
  if (artWarm) return artWarm;
  if (Date.now() < artWarmRetryAt) return Promise.resolve(false);
  artWarm = warmArt().then(function (done) {
    if (!done) { artWarm = null; artWarmRetryAt = Date.now() + 5 * 60 * 1000; }
    return done;
  });
  return artWarm;
}

/** 응답을 막지 않고 워커 수명만 늘린다. 옛 검사 도구처럼 waitUntil 이 없거나 이미 닫힌 이벤트면 조용히 넘어간다. */
function extend(event, promise) {
  try { if (event && typeof event.waitUntil === 'function') event.waitUntil(promise); }
  catch (e) { /* 이벤트가 이미 끝났다 — 예열은 어차피 배경 작업이다. */ }
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
      // 예열은 활성화를 붙잡지 않는다. 앱의 WARM 메시지가 중단된 작은 자료를 이어받는다.
      .then(function () {
        self.warmFlagsDone = resumeFlagsWarm();
        self.warmArtDone = resumeArtWarm();
      })
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

  // 설치를 마친 셸을 즉시 쓴다. 느린 연결을 기다리거나 배포 중 신·구 코드를 섞지 않는다.
  extend(event, resumeArtWarm());
  extend(event, resumeFlagsWarm());
  event.respondWith(shellResponse(req));
});

/** 저장된 셸의 원장부터 읽어 현재 앱과 같은 자료 목록을 사용한다. */
function manifestText(url) {
  return matchCache(SHELL_CACHE, url).then(function (hit) {
    if (hit && hit.ok) return hit.text();
    return boundedFetch(url).then(function (res) {
      if (!res || !res.ok) throw new Error('network');
      return res.text();
    });
  });
}

/** 응답이 오지 않는 연결도 종료한다. 다운로드 버튼은 나중에 누락분부터 다시 시작할 수 있다. */
function withDeadline(work, controller) {
  var timer;
  return Promise.race([
    Promise.resolve().then(work),
    new Promise(function (_, reject) {
      timer = setTimeout(function () {
        if (controller) controller.abort();
        var error = new Error('network');
        error.offlineCode = 'network';
        reject(error);
      }, 12000);
    })
  ]).then(function (value) { clearTimeout(timer); return value; }, function (error) { clearTimeout(timer); throw error; });
}

function boundedFetch(url) {
  var controller = new AbortController();
  return withDeadline(function () { return fetch(url, { signal: controller.signal }); }, controller);
}

/** 저장 성공 뒤 실제 캐시를 확인한다. 재생용 putCache와 달리 실패를 숨기지 않는다. */
function saveAsset(cache, item, request) {
  var controller = new AbortController();
  return withDeadline(function () {
    return fetch(request || item.url, { signal: controller.signal }).then(function (res) {
      if (!res || res.status !== 200) {
        var error = new Error('network');
        error.offlineCode = 'network';
        throw error;
      }
      return res.arrayBuffer().then(function (body) {
        if (!body.byteLength || (item.bytes && body.byteLength !== item.bytes)) {
          var error = new Error('network');
          error.offlineCode = 'network';
          throw error;
        }
        var headers = new Headers(res.headers);
        headers.delete('content-encoding');
        headers.set('content-length', String(body.byteLength));
        return cache.put(item.url, new Response(body, { status: 200, headers: headers }))
          ['catch'](function (error) {
            error.offlineCode = error.name === 'QuotaExceededError' || /quota/i.test(error.message) ? 'quota' : 'storage';
            throw error;
          });
      });
    }).then(function () { return cache.match(item.url); })
      .then(function (hit) { return artState(hit, item.bytes || 0); })
      .then(function (state) {
        if (state !== 'fresh') {
          var error = new Error('storage');
          error.offlineCode = 'storage';
          throw error;
        }
      });
  }, controller);
}

var flagWarm = null;
var flagWarmRetryAt = 0;
function resumeFlagsWarm() {
  if (flagWarm) return flagWarm;
  if (Date.now() < flagWarmRetryAt) return Promise.resolve(false);
  flagWarm = warmFlags().then(function (done) {
    if (!done) { flagWarm = null; flagWarmRetryAt = Date.now() + 5 * 60 * 1000; }
    return done;
  });
  return flagWarm;
}

function shellResponse(req) {
  var clean = new URL(req.url);
  clean.search = '';
  return matchCache(SHELL_CACHE, clean.href)['catch'](function () { return null; }).then(function (hit) {
    if (hit && hit.ok) return hit;
    if (req.mode === 'navigate') {
      return matchCache(SHELL_CACHE, './index.html').then(function (index) {
        return index || fetchShell(req);
      });
    }
    return fetchShell(req);
  })['catch'](function () { return Response.error(); });
}

function fetchShell(req) {
  return boundedFetch(req).then(function (res) {
    if (res && res.ok) return putCache(SHELL_CACHE, req, res.clone()).then(function () { return res; });
    return res;
  });
}

function manifestObject(src, name) {
  var assign = new RegExp('(?:window\\.)?FQ\\.' + name + '\\s*=\\s*\\{').exec(src);
  if (!assign) throw new Error('manifest');
  var literal = sliceObjectLiteral(src, assign.index + assign[0].length - 1);
  if (!literal) throw new Error('manifest');
  return JSON.parse(literal);
}

var offlinePlan = null;
function offlineItems() {
  if (offlinePlan) return offlinePlan;
  offlinePlan = Promise.all([
    manifestText('./data/countries.js'), manifestText('./data/subjects.js'),
    manifestText('./js/voice-manifest.js'), manifestText('./js/music-manifest.js')
  ]).then(function (sources) {
    var items = SHELL.map(function (url) { return { url: url, cache: SHELL_CACHE, group: 'shell' }; });
    var re = /"code"\s*:\s*"([a-z]{2})"/g, found, flags = 0;
    while ((found = re.exec(sources[0]))) {
      items.push({ url: './flags/' + found[1] + '.svg', cache: FLAG_CACHE, group: 'flags' });
      flags += 1;
    }
    if (!flags) throw new Error('manifest');
    artItemsFrom(sources[1]).forEach(function (item) { item.cache = ART_CACHE; item.group = 'art'; items.push(item); });
    // 문법이 어긋난 원장을 빈 그림 목록으로 오인하지 않는다.
    manifestObject(sources[1], 'subjects');
    ['voiceManifest', 'musicManifest'].forEach(function (name, index) {
      var manifest = manifestObject(sources[index + 2], name);
      if (!manifest.ready || !manifest.clips || !Object.keys(manifest.clips).length) throw new Error('manifest');
      Object.keys(manifest.clips).forEach(function (key) {
        var clip = manifest.clips[key];
        if (!clip || !/^audio\/(sua|music)\/[a-zA-Z0-9_.-]+\.mp3$/.test(clip.src)) throw new Error('manifest');
        items.push({ url: './' + clip.src, cache: AUDIO_CACHE, group: 'audio' });
      });
    });
    var seen = {};
    return items.filter(function (item) {
      if (seen[item.url]) return false;
      seen[item.url] = true;
      return true;
    });
  })['catch'](function (error) { offlinePlan = null; throw error; });
  return offlinePlan;
}

function emptyProgress(items, status) {
  var progress = { status: status, total: items.length, cached: 0, failed: 0, groups: {} };
  ['shell', 'flags', 'art', 'audio'].forEach(function (name) { progress.groups[name] = { cached: 0, total: 0 }; });
  items.forEach(function (item) { progress.groups[item.group].total += 1; });
  return progress;
}

/** 완료 기록 대신 파일을 직접 확인한다. 브라우저가 일부 캐시를 지운 경우도 알아낸다. */
function inspectOffline(items, onProgress) {
  var progress = emptyProgress(items, 'checking');
  var missing = [], i = 0;
  function nextChunk() {
    var chunk = items.slice(i, i + 30);
    i += chunk.length;
    return Promise.all(chunk.map(function (item) {
      return matchCache(item.cache, item.url)['catch'](function (error) {
        error.offlineCode = 'storage';
        throw error;
      }).then(function (hit) {
        if (item.group === 'audio' && hit && hit.status !== 200) return 'missing';
        return artState(hit, item.bytes || 0);
      }).then(function (state) {
        if (state === 'fresh') { progress.cached += 1; progress.groups[item.group].cached += 1; }
        else missing.push(item);
      });
    })).then(function () {
      if (onProgress) onProgress(progress);
      return i < items.length ? nextChunk() : { progress: progress, missing: missing };
    });
  }
  return nextChunk();
}

function offlineError(error) {
  if (error && error.offlineCode) return error.offlineCode;
  if (error && (error.name === 'QuotaExceededError' || /quota/i.test(error.message))) return 'quota';
  if (error && error.message === 'manifest') return 'manifest';
  return 'network';
}

var offlineDownload = null;
var offlineListeners = [];
var offlineLastProgress = null;
function broadcastOffline(progress) {
  offlineLastProgress = progress;
  offlineListeners.forEach(function (reply) { reply(progress); });
}

function downloadOffline() {
  return offlineItems().then(function (items) {
    return inspectOffline(items, broadcastOffline).then(function (initial) {
      var progress = initial.progress, missing = initial.missing, i = 0, stopped = false, errorCode;
      progress.status = 'downloading';
      broadcastOffline(progress);
      function nextChunk() {
        if (stopped || i >= missing.length) return;
        var chunk = missing.slice(i, i + 4);
        i += chunk.length;
        return Promise.all(chunk.map(function (item) {
          return caches.open(item.cache).then(function (cache) { return saveAsset(cache, item); })
            .then(function () { progress.cached += 1; progress.groups[item.group].cached += 1; })
            ['catch'](function (error) {
              progress.failed += 1;
              stopped = true;
              var code = offlineError(error);
              if (!errorCode || code === 'quota' || code === 'storage') errorCode = code;
            }).then(function () { broadcastOffline(progress); });
        })).then(nextChunk);
      }
      return Promise.resolve(nextChunk()).then(function () {
        // Cache.put 성공을 세는 것만으로는 부족하다. 마지막에 모든 항목을 다시 확인한다.
        return inspectOffline(items, broadcastOffline).then(function (checked) {
          var result = checked.progress;
          result.status = checked.missing.length ? 'partial' : 'ready';
          result.failed = progress.failed;
          if (errorCode) result.error = errorCode;
          broadcastOffline(result);
        });
      });
    });
  })['catch'](function (error) {
    broadcastOffline({ status: 'error', total: 0, cached: 0, failed: 0, error: offlineError(error) });
  });
}

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (['OFFLINE_STATUS', 'OFFLINE_DOWNLOAD', 'OFFLINE_WARM'].indexOf(data.type) === -1) return;
  var target = event.ports && event.ports[0] || event.source;
  function reply(progress) {
    if (!target || typeof target.postMessage !== 'function') return;
    var message = { type: 'OFFLINE_PROGRESS', requestId: data.requestId };
    Object.keys(progress).forEach(function (key) { message[key] = progress[key]; });
    try { target.postMessage(message); } catch (e) { /* 닫힌 화면은 다음에 실제 캐시를 다시 확인한다. */ }
  }
  if (data.type === 'OFFLINE_WARM') {
    // 재연결 신호에서는 이전 실패의 5분 대기를 건너뛴다. 전체 음원은 버튼으로만 받는다.
    artWarmRetryAt = 0;
    flagWarmRetryAt = 0;
    extend(event, Promise.all([resumeFlagsWarm(), resumeArtWarm()]));
    return;
  }
  if (data.type === 'OFFLINE_DOWNLOAD') {
    offlineListeners.push(reply);
    if (offlineLastProgress && offlineDownload) reply(offlineLastProgress);
    if (!offlineDownload) {
      reply({ status: 'checking', total: 0, cached: 0, failed: 0 });
      offlineDownload = downloadOffline().then(function () {
        offlineDownload = null;
        offlineListeners = [];
        offlineLastProgress = null;
      });
    }
    extend(event, offlineDownload);
    return;
  }
  reply({ status: 'checking', total: 0, cached: 0, failed: 0 });
  extend(event, offlineItems().then(function (items) {
    return inspectOffline(items, reply).then(function (checked) {
      checked.progress.status = checked.missing.length ? 'partial' : 'ready';
      reply(checked.progress);
    });
  })['catch'](function (error) {
    reply({ status: 'error', total: 0, cached: 0, failed: 0, error: offlineError(error) });
  }));
});
