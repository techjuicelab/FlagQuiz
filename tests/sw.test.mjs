import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

function worker() {
  const events = {}, deleted = [], cached = new Map(), puts = [];
  const match = async request => cached.get(request.url || request)?.clone();
  const sandbox = {
    URL, Request, Response, Headers, Promise,
    self: { location: { origin: 'https://example.test' }, addEventListener: (name, fn) => { events[name] = fn; }, clients: { claim() {} }, skipWaiting() {} },
    caches: {
      keys: async () => ['another-app-v1', 'flagquiz-v2', 'flagquiz-v3', 'flagquiz-v4'],
      delete: async key => { deleted.push(key); },
      match,
      open: async () => ({
        async put(request, response) {
          puts.push({ request, response });
          if (response.status === 206) throw new TypeError('Partial response cannot be cached');
          cached.set(request.url || request, response.clone());
        },
        match, add: async () => {}, addAll: async () => {}
      })
    },
    fetch: async () => { throw new Error('offline'); }
  };
  vm.runInNewContext(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), sandbox);
  return { events, deleted, cached, puts, sandbox };
}

test('업데이트는 FlagQuiz의 이전 캐시만 삭제한다', async () => {
  const w = worker(); let done;
  w.events.activate({ waitUntil: promise => { done = promise; } });
  await done;
  assert.deepEqual(w.deleted, ['flagquiz-v2', 'flagquiz-v3']);
});

test('오프라인의 누락 스크립트에 HTML을 돌려주지 않는다', async () => {
  const w = worker(); let response;
  w.cached.set('./index.html', new Response('<html>shell</html>'));
  w.events.fetch({ request: { method: 'GET', url: 'https://example.test/FlagQuiz/missing.js', mode: 'cors' }, respondWith: promise => { response = promise; } });
  assert.equal((await response).type, 'error');
});

test('오프라인 화면 탐색에는 앱 셸을 제공한다', async () => {
  const w = worker(); let response;
  w.cached.set('./index.html', new Response('<html>shell</html>'));
  w.events.fetch({ request: { method: 'GET', url: 'https://example.test/FlagQuiz/', mode: 'navigate' }, respondWith: promise => { response = promise; } });
  assert.match(await (await response).text(), /shell/);
});

test('한번 받은 Sua 음성은 네트워크 없이 재생할 수 있다', async () => {
  const w = worker(); let response;
  const url = 'https://example.test/FlagQuiz/audio/sua/sample.mp3';
  w.cached.set(url, new Response('audio bytes', { headers: { 'content-type': 'audio/mpeg' } }));
  w.events.fetch({ request: new Request(url), respondWith: promise => { response = promise; } });
  assert.equal((await response).headers.get('content-type'), 'audio/mpeg');
});

test('최초 Range 음성 요청은 전체 200을 캐시에 저장한 뒤 필요한 206 구간을 돌려준다', async () => {
  const w = worker();
  const url = 'https://example.test/FlagQuiz/audio/sua/sample.mp3';
  const fetched = [];
  w.sandbox.fetch = async request => {
    fetched.push(request);
    // 배포 서버처럼 Range 헤더가 있으면 저장할 수 없는 206을 반환한다.
    return request.headers.has('range')
      ? new Response('01', { status: 206, headers: { 'content-type': 'audio/mpeg', 'content-range': 'bytes 0-1/10' } })
      : new Response('0123456789', { headers: { 'content-type': 'audio/mpeg', 'content-length': '10' } });
  };
  let response;
  w.events.fetch({
    request: new Request(url, { headers: { range: 'bytes=0-1', 'if-range': 'old-etag' } }),
    respondWith: promise => { response = promise; }
  });
  const first = await response;
  assert.equal(fetched[0].headers.has('range'), false);
  assert.equal(fetched[0].headers.has('if-range'), false);
  assert.equal(w.puts.length, 1);
  assert.equal(w.puts[0].response.status, 200);
  assert.equal(first.status, 206);
  assert.equal(first.headers.get('content-range'), 'bytes 0-1/10');
  assert.equal(first.headers.get('content-length'), '2');
  assert.equal(await first.text(), '01');

  w.sandbox.fetch = async () => { throw new Error('offline'); };
  w.events.fetch({ request: new Request(url, { headers: { range: 'bytes=5-' } }), respondWith: promise => { response = promise; } });
  const offline = await response;
  assert.equal(offline.status, 206);
  assert.equal(offline.headers.get('content-range'), 'bytes 5-9/10');
  assert.equal(await offline.text(), '56789');
  assert.equal(fetched.length, 1);
});

test('오프라인 Range의 끝 생략·뒤쪽 길이·범위 초과와 복수 구간을 처리한다', async () => {
  const w = worker();
  const url = 'https://example.test/FlagQuiz/audio/sua/sample.mp3';
  w.cached.set(url, new Response('0123456789', { headers: { 'content-type': 'audio/mpeg' } }));
  const cases = [
    ['bytes=3-', 206, '3456789', 'bytes 3-9/10'],
    ['bytes=-3', 206, '789', 'bytes 7-9/10'],
    ['bytes=8-99', 206, '89', 'bytes 8-9/10'],
    ['bytes=-99', 206, '0123456789', 'bytes 0-9/10'],
    ['bytes=10-', 416, '', 'bytes */10'],
    ['bytes=-0', 416, '', 'bytes */10'],
    ['bytes=8-3', 416, '', 'bytes */10'],
    ['bytes=0-1,3-4', 200, '0123456789', null],
    ['other=0-1', 200, '0123456789', null]
  ];
  for (const [range, status, body, contentRange] of cases) {
    let response;
    w.events.fetch({ request: new Request(url, { headers: { range } }), respondWith: promise => { response = promise; } });
    const result = await response;
    assert.equal(result.status, status, range);
    assert.equal(await result.text(), body, range);
    assert.equal(result.headers.get('content-range'), contentRange, range);
  }
});

test('저장 공간이 부족해도 현재 Sua 음성의 Range 재생은 계속한다', async () => {
  const w = worker();
  const url = 'https://example.test/FlagQuiz/audio/sua/sample.mp3';
  w.sandbox.fetch = async () => new Response('0123456789', { headers: { 'content-type': 'audio/mpeg' } });
  w.sandbox.caches.open = async () => ({ put: async () => { throw new Error('QuotaExceededError'); } });
  let response;
  w.events.fetch({ request: new Request(url, { headers: { range: 'bytes=2-4' } }), respondWith: promise => { response = promise; } });
  const result = await response;
  assert.equal(result.status, 206);
  assert.equal(await result.text(), '234');
  assert.equal(w.cached.size, 0);
});

test('전체 음원 저장이 끝나기 전에는 Range 응답을 완료하지 않는다', async () => {
  const w = worker();
  const url = 'https://example.test/FlagQuiz/audio/sua/sample.mp3';
  let save, response, saved = false, returned = false;
  const pendingSave = new Promise(resolve => { save = resolve; });
  w.sandbox.fetch = async () => new Response('0123456789', { headers: { 'content-type': 'audio/mpeg' } });
  w.sandbox.caches.open = async () => ({ put: async () => { await pendingSave; saved = true; } });
  w.events.fetch({ request: new Request(url, { headers: { range: 'bytes=0-1' } }), respondWith: promise => { response = promise.then(result => { returned = true; return result; }); } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved, false);
  assert.equal(returned, false);
  save();
  assert.equal((await response).status, 206);
  assert.equal(saved, true);
});

test('전체 요청에도 206을 주는 응답은 완전한 음원으로 캐시하지 않는다', async () => {
  const w = worker();
  const url = 'https://example.test/FlagQuiz/audio/sua/sample.mp3';
  w.sandbox.fetch = async () => new Response('01', { status: 206, headers: { 'content-type': 'audio/mpeg', 'content-range': 'bytes 0-1/10' } });
  let response;
  w.events.fetch({ request: new Request(url), respondWith: promise => { response = promise; } });
  assert.equal((await response).status, 206);
  assert.equal(w.puts.length, 0);
});


test('새 축하 음악도 오프라인에서 Safari Range 요청을 재생한다', async () => {
  const w = worker();
  const url = 'https://example.test/FlagQuiz/audio/music/chest-01-musicbox.mp3';
  w.cached.set(url, new Response('0123456789', { headers: { 'content-type': 'audio/mpeg' } }));
  let response;
  w.events.fetch({ request: new Request(url, { headers: { range: 'bytes=0-1' } }), respondWith: promise => { response = promise; } });
  const result = await response;
  assert.equal(result.status, 206);
  assert.equal(result.headers.get('content-type'), 'audio/mpeg');
  assert.equal(await result.text(), '01');
});
