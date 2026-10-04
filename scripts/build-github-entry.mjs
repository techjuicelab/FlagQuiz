/* GitHub Pages에는 로그인 서버로 이동하는 진입 화면과 이전 PWA 정리만 배포한다. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const NAS_URL = 'https://flagquiz.techjuicelab.space/';

function entryScript(scopePath) {
  return `/* 이전 공개 앱 캐시만 정리하고 온라인이면 새 로그인 서버로 이동한다. */
(function () {
  var destination = ${JSON.stringify(NAS_URL)};
  var scope = new URL(${JSON.stringify(scopePath)}, location.origin);
  var status = document.getElementById('entry-status');
  var openLink = document.getElementById('entry-open');
  var downloadButton = document.getElementById('entry-download');
  var moving = false, requiresChoice = false, legacyRaw = null;
  var maxLegacyBytes = 512 * 1024;
  var allowedKeys = ['settings', 'stats', 'daily', 'countries', 'badges', 'axes', 'history', 'chest', 'gifts'];
  function text(value) { if (status) status.textContent = value; }
  function migrationUrl(raw) {
    if (raw.length > maxLegacyBytes) return null;
    var bytes = new TextEncoder().encode(raw);
    if (bytes.length > maxLegacyBytes) return null;
    var data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (Object.keys(data).some(function (key) { return allowedKeys.indexOf(key) === -1; })) return null;
    // 깊은 JSON도 호출 스택을 늘리지 않고 모든 위험 키를 확인한다.
    var pending = [data];
    while (pending.length) {
      var item = pending.pop();
      if (!item || typeof item !== 'object') continue;
      var keys = Object.keys(item);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') return null;
        if (item[key] && typeof item[key] === 'object') pending.push(item[key]);
      }
    }
    var binary = '';
    for (var i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    var encoded = btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
    return ${JSON.stringify(NAS_URL)} + '#flagquiz-legacy=' + encoded;
  }
  function setMigration(raw) {
    var url;
    try { url = migrationUrl(raw); } catch (_) { return false; }
    if (!url) return false;
    destination = url;
    if (openLink) openLink.href = url;
    return true;
  }
  function prepareLegacy() {
    try { legacyRaw = localStorage.getItem('flagquiz.v1'); }
    catch (_) {
      requiresChoice = true;
      if (downloadButton) downloadButton.hidden = false;
      text('기존 기록을 읽지 못했어요. 다운로드로 다시 읽어 보거나 새 주소를 열 수 있어요.');
      return;
    }
    if (legacyRaw === null) return;
    if (downloadButton) downloadButton.hidden = false;
    if (setMigration(legacyRaw)) return;
    requiresChoice = true;
    if (downloadButton) downloadButton.hidden = false;
    text('기존 기록을 자동으로 옮길 수 없어요. JSON 파일로 저장한 뒤 새 주소를 열어 주세요.');
  }
  function downloadLegacy() {
    requiresChoice = true;
    moving = false;
    var anchor, objectUrl;
    try {
      if (legacyRaw === null) legacyRaw = localStorage.getItem('flagquiz.v1');
      if (legacyRaw === null) { text('이 브라우저에 다운로드할 기존 기록이 없어요.'); return; }
      // 원문은 파일에만 넣는다. 화면·콘솔에 표시하거나 저장소를 수정하지 않는다.
      objectUrl = URL.createObjectURL(new Blob([legacyRaw], { type: 'application/json;charset=utf-8' }));
      anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = 'flagquiz-legacy.json';
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); anchor = null;
      setMigration(legacyRaw);
      text('기존 기록 JSON 다운로드를 요청했어요. 파일을 확인한 뒤 새 주소를 열어 주세요.');
    } catch (_) {
      text('기존 기록을 다운로드하지 못했어요. 이 브라우저의 저장소 접근을 허용한 뒤 다시 눌러 주세요.');
    } finally {
      if (anchor) anchor.remove();
      if (objectUrl) setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
    }
  }
  prepareLegacy();
  if (downloadButton) downloadButton.addEventListener('click', downloadLegacy);
  function clearOwnedCaches() {
    if (!('caches' in window)) return Promise.resolve();
    return Promise.resolve().then(function () { return caches.keys(); }).then(function (names) {
      return Promise.all(names.filter(function (name) { return name.indexOf('flagquiz-') === 0; })
        .map(function (name) { return caches.delete(name); }));
    }).catch(function () {});
  }
  var cleanup = clearOwnedCaches();
  function updateWorker() {
    if (!navigator.serviceWorker) return Promise.resolve();
    return Promise.resolve().then(function () {
      return navigator.serviceWorker.register(new URL('sw.js', scope).href,
        { scope: scope.href, updateViaCache: 'none' });
    }).then(function (registration) {
      return typeof registration.update === 'function' ? registration.update() : null;
    }).catch(function () {});
  }
  function go() {
    if (moving) return;
    if (requiresChoice) {
      if (navigator.onLine !== false) updateWorker();
      return;
    }
    if (navigator.onLine === false) {
      text('인터넷에 연결되면 새 주소로 이동해요. 아래 버튼으로도 열 수 있어요.');
      return;
    }
    moving = true;
    text('새 세계 놀이 주소로 이동하고 있어요.');
    var timer;
    // 저장소나 워커 등록이 응답하지 않아도 새 주소로 이동할 수 있어야 한다.
    Promise.race([Promise.all([cleanup, updateWorker()]), new Promise(function (resolve) {
      timer = setTimeout(resolve, 1000);
    })]).then(function () {
      clearTimeout(timer);
      if (requiresChoice) { moving = false; return; }
      if (navigator.onLine === false) {
        moving = false;
        text('인터넷에 연결되면 새 주소로 이동해요. 아래 버튼으로도 열 수 있어요.');
      } else {
        try { location.replace(destination); }
        catch (_) {
          moving = false; requiresChoice = true;
          text('새 주소를 자동으로 열지 못했어요. 기존 기록을 다운로드하거나 아래 새 주소를 눌러 주세요.');
        }
      }
    });
  }
  window.addEventListener('online', go);
  go();
})();
`;
}

function entryHtml(scopePath) {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><base href="${scopePath}">
<title>세계 놀이 새 주소</title>
<style>body{margin:0;padding:24px;background:#f6f7ff;color:#20253f;font:18px/1.6 system-ui,sans-serif}main{box-sizing:border-box;max-width:580px;margin:12vh auto;padding:32px;background:white;border-radius:24px}h1{font-size:clamp(25px,5vw,34px);line-height:1.3}a,button{display:inline-block;margin-top:12px;padding:12px 20px;background:#5551cf;color:white;border:0;border-radius:12px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}button{background:#eeeefa;color:#343095}button[hidden]{display:none}a:focus-visible,button:focus-visible{outline:3px solid #20253f;outline-offset:4px}.small{font-size:15px;color:#535970}@media(max-width:480px){body{padding:16px}main{margin:6vh auto;padding:24px}}</style>
<script src="entry.js" defer></script></head><body><main>
<h1>세계 놀이 주소가 바뀌었어요</h1>
<p id="entry-status" role="status" aria-live="polite">새 주소에서 기존 TechJuice ID 계정으로 로그인해 주세요.</p>
<a id="entry-open" href="${NAS_URL}">새 주소 열기</a>
<button id="entry-download" type="button" hidden>기존 기록 JSON 다운로드</button>
<p class="small">이전에 사용하던 아이디 또는 이메일과 같은 비밀번호를 사용해요.</p>
<noscript><p>위 버튼을 누르면 새 세계 놀이로 이동해요.</p></noscript>
</main></body></html>
`;
}

function retiredWorker(html, script) {
  return `/* 같은 sw.js 경로로 이전 공개 PWA를 교체한다. 앱·음원은 캐시하지 않는다. */
var ENTRY_HTML = ${JSON.stringify(html)};
var ENTRY_SCRIPT = ${JSON.stringify(script)};
var scope = new URL(self.registration.scope);
function owned(url) { return url.origin === scope.origin && url.pathname.indexOf(scope.pathname) === 0; }
function clearOwnedCaches() {
  return Promise.resolve().then(function () { return caches.keys(); }).then(function (names) {
    return Promise.all(names.filter(function (name) { return name.indexOf('flagquiz-') === 0; })
      .map(function (name) { return caches.delete(name); }));
  }).catch(function () {});
}
self.addEventListener('install', function (event) { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', function (event) {
  event.waitUntil(clearOwnedCaches().then(function () { return self.clients.claim(); }).catch(function () {})
    // 별도 하위 SW가 제어하는 창은 같은 URL 범위라도 이동시키지 않는다.
    .then(function () { return self.clients.matchAll({ type: 'window', includeUncontrolled: false }); })
    .then(function (clients) {
      return Promise.all(clients.filter(function (client) { return owned(new URL(client.url)); })
        .map(function (client) { return client.navigate(scope.href).catch(function () {}); }));
    }));
});
self.addEventListener('fetch', function (event) {
  var request = event.request, url = new URL(request.url);
  if (!owned(url)) return;
  if (request.mode === 'navigate') {
    event.respondWith(Promise.resolve(new Response(ENTRY_HTML,
      { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })));
  } else if (request.method === 'GET' && url.pathname === new URL('entry.js', scope).pathname) {
    event.respondWith(Promise.resolve(new Response(ENTRY_SCRIPT,
      { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' } })));
  } else {
    event.respondWith(Promise.resolve(new Response('세계 놀이는 새 주소에서 로그인해 주세요.',
      { status: 410, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })));
  }
});
`;
}

export async function buildGithubEntry({ outputDirectory = path.join(root, '_site'), repository = process.env.GITHUB_REPOSITORY || 'techjuicelab/FlagQuiz' } = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('GitHub repository 경로를 확인하세요.');
  if (!path.isAbsolute(outputDirectory) || path.basename(outputDirectory) !== '_site') throw new Error('Pages 산출 경로는 절대 경로의 _site여야 합니다.');
  const [owner, repo] = repository.split('/');
  if (owner === '.' || owner === '..' || repo === '.' || repo === '..') throw new Error('GitHub repository 경로를 확인하세요.');
  const scopePath = repo.toLowerCase() === owner.toLowerCase() + '.github.io' ? '/' : '/' + repo + '/';
  const html = entryHtml(scopePath), script = entryScript(scopePath);
  // 산출 폴더만 교체한다. 원본 게임 파일과 기존 앱·Docker 빌드 명령은 바꾸지 않는다.
  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(outputDirectory, { recursive: true });
  const files = { 'index.html': html, '404.html': html, 'entry.js': script, 'sw.js': retiredWorker(html, script) };
  await Promise.all(Object.entries(files).map(([name, content]) => fs.writeFile(path.join(outputDirectory, name), content)));
  return { outputDirectory, destination: NAS_URL, files: Object.keys(files) };
}

if (process.argv[1] && await fs.realpath(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('이 스크립트에는 인자를 전달하지 않습니다.');
  await buildGithubEntry();
  console.log('GitHub Pages 진입 파일 준비 완료: NAS 로그인 주소로 이동');
}
