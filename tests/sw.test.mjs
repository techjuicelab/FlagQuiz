import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const BASE = 'https://example.test/FlagQuiz/';
const SHELL = 'flagquiz-shell-v1';
const FLAGS = 'flagquiz-flags-v1';
const ART = 'flagquiz-art-v1';
const AUDIO = 'flagquiz-v4';
const source = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const urlOf = request => new URL(request.url || request, BASE).href;

function worker({ buckets = new Map(['another-app-v1', 'flagquiz-v2', 'flagquiz-v3', AUDIO, SHELL].map(name => [name, new Map()])), script = source } = {}) {
  const events = {}, deleted = [], deletedEntries = [], puts = [], matches = [], addAllCalls = [];
  let globalMatches = 0;
  function entries(name) {
    if (!buckets.has(name)) buckets.set(name, new Map());
    return buckets.get(name);
  }
  function cache(name) {
    const stored = entries(name);
    return {
      async keys() { return [...stored.keys()].map(url => new Request(url)); },
      async delete(request) {
        deletedEntries.push({ name, url: urlOf(request) });
        return stored.delete(urlOf(request));
      },
      async match(request) {
        matches.push({ name, url: urlOf(request) });
        return stored.get(urlOf(request))?.clone();
      },
      async put(request, response) {
        puts.push({ name, request, response: response.clone() });
        if (response.status === 206) throw new TypeError('Partial response cannot be cached');
        stored.set(urlOf(request), response.clone());
      },
      async add(request) {
        // 워커가 만든 Request(cache 모드 등)는 그대로 넘겨 검사에서 볼 수 있게 한다.
        const response = await sandbox.fetch(request instanceof Request ? request : new Request(urlOf(request)));
        if (!response.ok) throw new TypeError('Cache.add requires a successful response');
        await this.put(request, response);
      },
      async addAll(requests) {
        addAllCalls.push({ name, urls: Array.from(requests, urlOf) });
        const responses = await Promise.all(requests.map(async request => {
          const response = await sandbox.fetch(new Request(urlOf(request)));
          if (!response.ok) throw new TypeError('Cache.addAll requires successful responses');
          return response;
        }));
        await Promise.all(requests.map((request, index) => this.put(request, responses[index])));
      }
    };
  }
  const sandbox = {
    URL, Request, Response, Headers, Promise,
    self: {
      location: { origin: 'https://example.test', href: BASE + 'sw.js' },
      addEventListener: (name, fn) => { events[name] = fn; },
      clients: { claim() {} }, skipWaiting() {}
    },
    caches: {
      keys: async () => [...buckets.keys()],
      delete: async name => { deleted.push(name); return buckets.delete(name); },
      match() {
        globalMatches += 1;
        throw new Error('전역 caches.match 대신 지정한 버킷에서 조회해야 합니다.');
      },
      open: async name => cache(name)
    },
    fetch: async () => { throw new Error('offline'); }
  };
  vm.runInNewContext(script, sandbox);
  return {
    events, deleted, deletedEntries, buckets, puts, matches, addAllCalls, sandbox,
    seed(name, request, response) { entries(name).set(urlOf(request), response.clone()); },
    read(name, request) { return buckets.get(name)?.get(urlOf(request))?.clone(); },
    assertScoped() { assert.equal(globalMatches, 0, '전역 caches.match를 호출하면 안 됩니다.'); }
  };
}

async function lifecycle(w, eventName) {
  const pending = [];
  w.events[eventName]({ waitUntil: promise => { pending.push(promise); } });
  await Promise.all(pending);
  w.assertScoped();
}

async function request(w, value) {
  const req = typeof value === 'string' ? new Request(urlOf(value)) : value;
  let response;
  const pending = [];
  w.events.fetch({
    request: req,
    respondWith: promise => { response = promise; },
    waitUntil: promise => { pending.push(promise); }
  });
  const result = await response;
  await Promise.all(pending);
  w.assertScoped();
  return result;
}

test('업데이트는 FlagQuiz의 이전 캐시만 삭제한다', async () => {
  const w = worker();
  await lifecycle(w, 'activate');
  assert.deepEqual(w.deleted, ['flagquiz-v2', 'flagquiz-v3']);
});

test('오프라인의 누락 스크립트에 HTML을 돌려주지 않는다', async () => {
  const w = worker(); let response;
  w.seed(SHELL, './index.html', new Response('<html>shell</html>'));
  w.events.fetch({ request: { method: 'GET', url: 'https://example.test/FlagQuiz/missing.js', mode: 'cors' }, respondWith: promise => { response = promise; } });
  assert.equal((await response).type, 'error');
});

test('오프라인 화면 탐색에는 앱 셸을 제공한다', async () => {
  const w = worker(); let response;
  w.seed(SHELL, './index.html', new Response('<html>shell</html>'));
  w.events.fetch({ request: { method: 'GET', url: 'https://example.test/FlagQuiz/', mode: 'navigate' }, respondWith: promise => { response = promise; } });
  assert.match(await (await response).text(), /shell/);
});

test('한번 받은 Sua 음성은 네트워크 없이 재생할 수 있다', async () => {
  const w = worker(); let response;
  const url = 'https://example.test/FlagQuiz/audio/sua/sample.mp3';
  w.seed(AUDIO, url, new Response('audio bytes', { headers: { 'content-type': 'audio/mpeg' } }));
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
  assert.equal(w.puts[0].name, AUDIO);
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
  w.seed(AUDIO, url, new Response('0123456789', { headers: { 'content-type': 'audio/mpeg' } }));
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
  const open = w.sandbox.caches.open;
  w.sandbox.caches.open = async name => ({ ...await open(name), put: async () => { throw new Error('QuotaExceededError'); } });
  let response;
  w.events.fetch({ request: new Request(url, { headers: { range: 'bytes=2-4' } }), respondWith: promise => { response = promise; } });
  const result = await response;
  assert.equal(result.status, 206);
  assert.equal(await result.text(), '234');
  assert.equal(w.buckets.get(AUDIO).size, 0);
});

test('전체 음원 저장이 끝나기 전에는 Range 응답을 완료하지 않는다', async () => {
  const w = worker();
  const url = 'https://example.test/FlagQuiz/audio/sua/sample.mp3';
  let save, response, saved = false, returned = false;
  const pendingSave = new Promise(resolve => { save = resolve; });
  w.sandbox.fetch = async () => new Response('0123456789', { headers: { 'content-type': 'audio/mpeg' } });
  const open = w.sandbox.caches.open;
  w.sandbox.caches.open = async name => ({ ...await open(name), put: async () => { await pendingSave; saved = true; } });
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
  w.seed(AUDIO, url, new Response('0123456789', { headers: { 'content-type': 'audio/mpeg' } }));
  let response;
  w.events.fetch({ request: new Request(url, { headers: { range: 'bytes=0-1' } }), respondWith: promise => { response = promise; } });
  const result = await response;
  assert.equal(result.status, 206);
  assert.equal(result.headers.get('content-type'), 'audio/mpeg');
  assert.equal(await result.text(), '01');
});

test('설치는 셸 버킷에만 앱 파일을 저장하고 기존 음원은 건드리지 않는다', async () => {
  const w = worker();
  const audio = './audio/sua/kept.mp3';
  w.seed(AUDIO, audio, new Response('kept audio'));
  const fetched = [];
  w.sandbox.fetch = async req => {
    fetched.push(urlOf(req));
    return new Response('shell file');
  };
  await lifecycle(w, 'install');
  assert.equal(w.addAllCalls.length, 1);
  assert.equal(w.addAllCalls[0].name, SHELL);
  assert.ok(w.addAllCalls[0].urls.includes(BASE + 'index.html'));
  assert.ok(w.addAllCalls[0].urls.includes(BASE + 'data/countries.js'));
  assert.ok(w.addAllCalls[0].urls.includes(BASE + 'js/screens.js'));
  assert.ok(w.puts.every(put => put.name === SHELL));
  assert.ok(fetched.every(url => !url.includes('/audio/') && !url.includes('/flags/')));
  assert.equal(await w.read(AUDIO, audio).text(), 'kept audio');
});

test('활성화는 빈 그림 버킷을 포함한 네 버킷과 타 앱 캐시를 보존한다', async () => {
  const w = worker();
  w.seed('another-app-v1', './other-app.js', new Response('other app'));
  await lifecycle(w, 'activate');
  assert.deepEqual([...w.buckets.keys()].sort(), ['another-app-v1', SHELL, FLAGS, ART, AUDIO].sort());
  assert.equal(await w.read('another-app-v1', './other-app.js').text(), 'other app');
  assert.equal(w.buckets.get(ART).size, 0);
});

test('레거시 v4에서 수아 음원과 음악 바이트는 유지하고 셸과 국기만 정리한다', async () => {
  const w = worker();
  const voice = './audio/sua/kept.mp3';
  const music = './audio/music/kept.mp3';
  w.seed(AUDIO, voice, new Response('voice bytes'));
  w.seed(AUDIO, music, new Response('music bytes'));
  w.seed(AUDIO, './index.html', new Response('old shell'));
  w.seed(AUDIO, './flags/kr.svg', new Response('old flag'));
  w.seed(AUDIO, './old.js?next=/audio/sua/kept.mp3', new Response('not audio'));
  const fetched = [];
  w.sandbox.fetch = async req => { fetched.push(urlOf(req)); throw new Error('offline'); };
  await lifecycle(w, 'activate');
  assert.deepEqual([...w.buckets.get(AUDIO).keys()].sort(), [urlOf(voice), urlOf(music)].sort());
  assert.equal(await w.read(AUDIO, voice).text(), 'voice bytes');
  assert.equal(await w.read(AUDIO, music).text(), 'music bytes');
  assert.equal(w.deletedEntries.length, 3);
  assert.ok(w.deletedEntries.every(entry => !new URL(entry.url).pathname.includes('/audio/')));
  assert.ok(fetched.every(url => !new URL(url).pathname.includes('/audio/')));
  assert.equal(await w.read(FLAGS, './flags/kr.svg').text(), 'old flag');
  assert.ok(w.puts.every(put => !new URL(urlOf(put.request)).pathname.includes('/audio/')),
    '음원 캐시를 다른 버킷으로 복사하지 않는다.');
  assert.ok(w.matches.every(match => !new URL(match.url).pathname.includes('/audio/')),
    '활성화 시 기존 음원 본문을 읽지 않는다.');
});

test('셸 버킷 이름을 바꾼 다음 워커도 기존 수아와 음악을 다운로드 없이 Range 재생한다', async () => {
  const first = worker();
  const voice = './audio/sua/kept.mp3';
  const music = './audio/music/kept.mp3';
  for (const path of [voice, music]) {
    first.seed(AUDIO, path, new Response('0123456789', { headers: { 'content-type': 'audio/mpeg' } }));
  }
  first.seed(SHELL, './index.html', new Response('old shell'));
  await lifecycle(first, 'activate');
  const updatedSource = source.replace('flagquiz-shell-v1', 'flagquiz-shell-v2');
  assert.notEqual(updatedSource, source, '셸 캐시 이름만 바꾼 워커로 검증해야 합니다.');
  const second = worker({ buckets: first.buckets, script: updatedSource });
  const fetched = [];
  second.sandbox.fetch = async req => {
    fetched.push(urlOf(req));
    return new Response('new shell');
  };
  await lifecycle(second, 'install');
  second.sandbox.fetch = async req => { fetched.push(urlOf(req)); throw new Error('offline'); };
  await lifecycle(second, 'activate');
  for (const path of [voice, music]) {
    const response = await request(second, new Request(urlOf(path), { headers: { range: 'bytes=2-4' } }));
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-type'), 'audio/mpeg');
    assert.equal(response.headers.get('content-range'), 'bytes 2-4/10');
    assert.equal(await response.text(), '234');
    assert.equal(await second.read(AUDIO, path).text(), '0123456789');
  }
  assert.ok(!second.buckets.has(SHELL));
  assert.ok(second.buckets.has('flagquiz-shell-v2'));
  assert.ok(fetched.every(url => !new URL(url).pathname.includes('/audio/')));
  assert.ok(second.puts.every(put => put.name === 'flagquiz-shell-v2'));
});

test('오프라인 탐색은 레거시나 타 앱의 옛 HTML 대신 현재 셸만 제공한다', async () => {
  const w = worker();
  w.seed(AUDIO, './index.html', new Response('legacy shell'));
  w.seed('another-app-v1', './index.html', new Response('other app shell'));
  w.seed(SHELL, './index.html', new Response('current shell'));
  const response = await request(w, { method: 'GET', url: BASE + 'unknown-page', mode: 'navigate' });
  assert.equal(await response.text(), 'current shell');
  assert.ok(w.matches.every(match => match.name === SHELL));
});

test('오프라인 스크립트는 다른 버킷의 오래된 파일을 가져오지 않는다', async () => {
  const w = worker();
  const script = './js/app.js';
  for (const name of [AUDIO, FLAGS, ART, 'another-app-v1']) w.seed(name, script, new Response('stale script'));
  w.seed(SHELL, './index.html', new Response('current shell'));
  assert.equal((await request(w, script)).type, 'error');
  w.seed(SHELL, script, new Response('current script'));
  assert.equal(await (await request(w, script)).text(), 'current script');
  assert.ok(w.matches.every(match => match.name === SHELL));
});

test('국기는 지정한 버킷에만 저장하고 다음 오프라인 요청에서 사용한다', async () => {
  const w = worker();
  const flag = './flags/kr.svg';
  w.seed(AUDIO, flag, new Response('legacy flag'));
  w.seed(SHELL, flag, new Response('wrong bucket flag'));
  let fetched = 0;
  w.sandbox.fetch = async () => { fetched += 1; return new Response('<svg>current flag</svg>'); };
  assert.equal(await (await request(w, flag)).text(), '<svg>current flag</svg>');
  assert.deepEqual(w.puts.map(put => put.name), [FLAGS]);
  assert.ok(w.matches.every(match => match.name === FLAGS));
  w.sandbox.fetch = async () => { fetched += 1; throw new Error('offline'); };
  assert.equal(await (await request(w, flag)).text(), '<svg>current flag</svg>');
  assert.equal(fetched, 1);
});

test('오프라인 국기 폴백은 v4의 동일한 정상 국기만 읽고 다른 버킷은 사용하지 않는다', async () => {
  for (const status of [200, 404, null]) {
    const w = worker();
    const flag = './flags/kr.svg';
    for (const name of [SHELL, ART, 'another-app-v1']) w.seed(name, flag, new Response('wrong bucket'));
    w.seed(AUDIO, './flags/jp.svg', new Response('different flag'));
    if (status) w.seed(AUDIO, flag, new Response('legacy flag', { status }));
    if (status === 200) {
      const res = await request(w, flag);
      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'legacy flag');
    } else {
      await assert.rejects(() => request(w, flag), /offline/);
    }
    assert.ok(w.matches.every(hit => hit.url === urlOf(flag) && [FLAGS, AUDIO].includes(hit.name)));
    assert.deepEqual(w.puts, [], '오프라인 폴백은 기존 국기를 이동하거나 덮어쓰지 않는다.');
    assert.deepEqual(w.deletedEntries, []);
  }
});

test('국기 예열은 국기 버킷만 채우고 개별 다운로드 실패를 허용한다', async () => {
  const w = worker();
  const fetched = [];
  w.sandbox.fetch = async req => {
    const url = urlOf(req);
    fetched.push(url);
    if (url.endsWith('/data/countries.js')) return new Response('[{"code":"kr"},{"code":"jp"}]');
    if (url.endsWith('/flags/kr.svg')) return new Response('<svg>flag</svg>');
    throw new Error('network failure');
  };
  await lifecycle(w, 'activate');
  assert.equal(await w.read(FLAGS, './flags/kr.svg').text(), '<svg>flag</svg>');
  assert.equal(w.read(FLAGS, './flags/jp.svg'), undefined);
  assert.ok(w.puts.every(put => put.name === FLAGS));
  assert.ok(fetched.includes(BASE + 'flags/jp.svg'));
  assert.ok(fetched.every(url => !new URL(url).pathname.includes('/audio/')));
});

test('새 스크립트는 셸에만 저장하고 오프라인에서 같은 버전을 제공한다', async () => {
  const w = worker();
  const script = './js/app.js';
  w.seed(SHELL, script, new Response('old script'));
  w.sandbox.fetch = async () => new Response('current script');
  assert.equal(await (await request(w, script)).text(), 'current script');
  assert.deepEqual(w.puts.map(put => put.name), [SHELL]);
  w.sandbox.fetch = async () => { throw new Error('offline'); };
  assert.equal(await (await request(w, script)).text(), 'current script');
});

test('음원과 국기 캐시 조회가 실패해도 네트워크 응답은 사용할 수 있다', async () => {
  for (const [path, name] of [['./audio/sua/sample.mp3', AUDIO], ['./flags/kr.svg', FLAGS]]) {
    const w = worker();
    const open = w.sandbox.caches.open;
    w.sandbox.caches.open = async cacheName => ({
      ...await open(cacheName),
      match: async () => { throw new Error('cache read failed'); }
    });
    w.sandbox.fetch = async () => new Response('network bytes');
    assert.equal(await (await request(w, path)).text(), 'network bytes', path);
    assert.deepEqual(w.puts.map(put => put.name), [name]);
  }
});

test('캐시 열기나 저장 실패가 현재 음원·국기·셸 응답을 막지 않는다', async () => {
  for (const failure of ['open', 'put']) {
    for (const path of ['./audio/sua/sample.mp3', './flags/kr.svg', './js/app.js']) {
      const w = worker();
      const open = w.sandbox.caches.open;
      w.sandbox.caches.open = async name => {
        if (failure === 'open') throw new Error('cache open failed');
        return { ...await open(name), put: async () => { throw new Error('QuotaExceededError'); } };
      };
      w.sandbox.fetch = async () => new Response('network bytes');
      assert.equal(await (await request(w, path)).text(), 'network bytes', failure + ': ' + path);
    }
  }
});

test('오프라인 셸 조회 실패에는 오래된 다른 버킷 대신 오류 응답을 제공한다', async () => {
  for (const failure of ['open', 'match']) {
    const w = worker();
    w.seed(AUDIO, './js/app.js', new Response('stale script'));
    const open = w.sandbox.caches.open;
    w.sandbox.caches.open = async name => {
      if (failure === 'open') throw new Error('cache open failed');
      return { ...await open(name), match: async () => { throw new Error('cache read failed'); } };
    };
    assert.equal((await request(w, './js/app.js')).type, 'error', failure);
  }
});

test('상징물과 명소 그림은 그림 버킷에만 저장하고 오프라인에서 재사용한다', async () => {
  const w = worker();
  const paths = ['./images/symbols/kr.webp', './images/places/kr.webp'];
  let fetched = 0;
  w.sandbox.fetch = async req => {
    fetched += 1;
    return new Response('webp bytes: ' + urlOf(req), { headers: { 'content-type': 'image/webp' } });
  };
  for (const path of paths) {
    const response = await request(w, path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('content-type'), 'image/webp', path);
    assert.equal(await response.text(), 'webp bytes: ' + urlOf(path), path);
    assert.equal(await w.read(ART, path).text(), 'webp bytes: ' + urlOf(path), path);
  }
  assert.equal(fetched, 2);
  assert.deepEqual(w.puts.map(put => put.name), [ART, ART]);
  assert.ok(w.matches.every(match => match.name === ART));
  for (const [name, entries] of w.buckets) {
    if (name !== ART) assert.equal(entries.size, 0, name + '에 그림을 저장하면 안 됩니다.');
  }
  w.sandbox.fetch = async () => { fetched += 1; throw new Error('offline'); };
  for (const path of paths) {
    const response = await request(w, path);
    assert.equal(response.headers.get('content-type'), 'image/webp', path);
    assert.equal(await response.text(), 'webp bytes: ' + urlOf(path), path);
  }
  assert.equal(fetched, 2, '저장된 그림은 오프라인 요청 때 네트워크를 사용하지 않습니다.');
});

test('상징물과 명소의 404 응답은 어느 버킷에도 저장하지 않는다', async () => {
  for (const path of ['./images/symbols/missing.webp', './images/places/missing.webp']) {
    const w = worker();
    w.sandbox.fetch = async () => new Response('not found', { status: 404 });
    const response = await request(w, path);
    assert.equal(response.status, 404, path);
    assert.equal(await response.text(), 'not found', path);
    assert.equal(w.puts.length, 0, path);
    assert.ok(w.matches.every(match => match.name === ART));
    for (const [name, entries] of w.buckets) assert.equal(entries.size, 0, name);
  }
});

test('같은 그림 URL이 다른 버킷에 있어도 그림 버킷의 응답만 사용한다', async () => {
  for (const path of ['./images/symbols/kr.webp', './images/places/kr.webp']) {
    const w = worker();
    for (const name of [SHELL, FLAGS, AUDIO, 'another-app-v1']) w.seed(name, path, new Response('stale: ' + name));
    w.seed(ART, path, new Response('current artwork', { headers: { 'content-type': 'image/webp' } }));
    let fetched = 0;
    w.sandbox.fetch = async () => { fetched += 1; throw new Error('offline'); };
    const response = await request(w, path);
    assert.equal(response.headers.get('content-type'), 'image/webp', path);
    assert.equal(await response.text(), 'current artwork', path);
    assert.equal(fetched, 0, path);
    assert.equal(w.puts.length, 0, path);
    assert.ok(w.matches.every(match => match.name === ART));
    for (const name of [SHELL, FLAGS, AUDIO, 'another-app-v1']) {
      assert.equal(await w.read(name, path).text(), 'stale: ' + name);
    }
  }
});

test('그림 캐시 저장 공간이 부족해도 현재 상징물과 명소 응답을 제공한다', async () => {
  for (const path of ['./images/symbols/kr.webp', './images/places/kr.webp']) {
    const w = worker();
    const attemptedPuts = [];
    const open = w.sandbox.caches.open;
    w.sandbox.caches.open = async name => ({
      ...await open(name),
      put: async () => { attemptedPuts.push(name); throw new Error('QuotaExceededError'); }
    });
    w.sandbox.fetch = async () => new Response('current artwork', { headers: { 'content-type': 'image/webp' } });
    const response = await request(w, path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('content-type'), 'image/webp', path);
    assert.equal(await response.text(), 'current artwork', path);
    assert.deepEqual(attemptedPuts, [ART]);
    for (const [name, entries] of w.buckets) assert.equal(entries.size, 0, name);
  }
});

test('설치 직후 오프라인이 되어도 활성화가 기존 국기를 잃지 않는다', async () => {
  const w = worker();
  const flag = './flags/kr.svg';
  const voice = './audio/sua/kept.mp3';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><title>대한민국 국기</title></svg>';
  w.seed(AUDIO, flag, new Response(svg, { headers: { 'content-type': 'image/svg+xml' } }));
  w.seed(AUDIO, voice, new Response('kept voice bytes', { headers: { 'content-type': 'audio/mpeg' } }));
  const fetched = [];
  w.sandbox.fetch = async req => {
    fetched.push(urlOf(req));
    if (urlOf(req).endsWith('/data/countries.js')) return new Response('[{"code":"kr"}]');
    return new Response('installed shell');
  };
  await lifecycle(w, 'install');
  w.sandbox.fetch = async req => { fetched.push(urlOf(req)); throw new Error('offline after install'); };
  await lifecycle(w, 'activate');
  const response = await request(w, flag);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/svg+xml');
  assert.equal(await response.text(), svg);
  assert.equal(await w.read(FLAGS, flag).text(), svg);
  assert.equal(await w.read(AUDIO, voice).text(), 'kept voice bytes');
  assert.ok(fetched.every(url => !new URL(url).pathname.includes('/audio/')));
  assert.ok(w.puts.every(put => !new URL(urlOf(put.request)).pathname.includes('/audio/')),
    '기존 음원은 다른 버킷으로 복사하지 않습니다.');
});

test('국기 이관 저장 실패는 원본을 보존하고 이미 있는 새 국기는 덮어쓰지 않는다', async () => {
  for (const hasCurrentFlag of [false, true]) {
    const w = worker();
    const flag = './flags/kr.svg';
    const voice = './audio/sua/kept.mp3';
    const music = './audio/music/kept.mp3';
    w.seed(AUDIO, flag, new Response('legacy flag'));
    w.seed(AUDIO, voice, new Response('voice bytes'));
    w.seed(AUDIO, music, new Response('music bytes'));
    w.seed(AUDIO, './index.html', new Response('legacy shell'));
    if (hasCurrentFlag) w.seed(FLAGS, flag, new Response('current flag'));
    const attemptedPuts = [];
    const open = w.sandbox.caches.open;
    w.sandbox.caches.open = async name => {
      const cache = await open(name);
      if (name !== FLAGS) return cache;
      return {
        ...cache,
        put: async req => { attemptedPuts.push(urlOf(req)); throw new Error('QuotaExceededError'); }
      };
    };
    const fetched = [];
    w.sandbox.fetch = async req => { fetched.push(urlOf(req)); throw new Error('offline'); };
    await lifecycle(w, 'activate');
    if (hasCurrentFlag) {
      assert.equal(await w.read(FLAGS, flag).text(), 'current flag');
      assert.equal(w.read(AUDIO, flag), undefined, '새 버킷에 이미 확보된 국기의 레거시 항목만 지운다.');
      assert.deepEqual(attemptedPuts, [], '이미 있는 새 국기를 옛 국기로 덮어쓰지 않는다.');
    } else {
      assert.equal(await w.read(AUDIO, flag).text(), 'legacy flag', '복사 실패 시 원본 국기를 남긴다.');
      assert.equal(w.read(FLAGS, flag), undefined);
      assert.deepEqual(attemptedPuts, [urlOf(flag)]);
      assert.ok(w.deletedEntries.every(entry => entry.url !== urlOf(flag)));
    }
    assert.equal(w.read(AUDIO, './index.html'), undefined);
    assert.equal(await w.read(AUDIO, voice).text(), 'voice bytes');
    assert.equal(await w.read(AUDIO, music).text(), 'music bytes');
    const offline = await request(w, flag);
    assert.equal(offline.status, 200, '이관 저장 실패 뒤에도 보존한 국기를 읽을 수 있다.');
    assert.equal(await offline.text(), hasCurrentFlag ? 'current flag' : 'legacy flag');
    assert.equal(fetched.filter(url => url.includes('/flags/')).length, hasCurrentFlag ? 0 : 1,
      '새 국기 캐시가 비었을 때만 네트워크를 시도하고 실패하면 레거시 국기를 읽는다.');
    assert.ok(w.matches.every(match => !new URL(match.url).pathname.includes('/audio/')),
      '국기를 이관할 때 기존 음원 본문을 읽지 않는다.');
    assert.ok(w.puts.every(put => !new URL(urlOf(put.request)).pathname.includes('/audio/')));
    assert.ok(w.deletedEntries.every(entry => !new URL(entry.url).pathname.includes('/audio/')));
    assert.ok(fetched.every(url => !new URL(url).pathname.includes('/audio/')));
  }
});

test('배포 전환 중 404·503 이 와도 담아 둔 셸을 쓴다', async () => {
  // fetch 는 404·503 을 '거부'가 아니라 '성공'으로 돌려준다. 그대로 넘기면 아이 화면이 희어진다.
  for (const status of [404, 500, 503]) {
    const w = worker(); let response;
    w.seed(SHELL, './js/app.js', new Response('담아 둔 앱 코드'));
    w.sandbox.fetch = async () => new Response('오류 본문', { status });
    w.events.fetch({ request: { method: 'GET', url: 'https://example.test/FlagQuiz/js/app.js', mode: 'cors' }, respondWith: p => { response = p; } });
    const got = await response;
    assert.equal(got.status, 200, status + ' 일 때 담아 둔 사본을 쓰지 않는다');
    assert.equal(await got.text(), '담아 둔 앱 코드');
  }
});

test('담아 둔 사본이 없으면 404·503 을 그대로 전달한다', async () => {
  // 폴백은 있는 것을 쓸 때만이다. 없는 것을 있는 척하지 않는다.
  const w = worker(); let response;
  w.sandbox.fetch = async () => new Response('없음', { status: 404 });
  w.events.fetch({ request: { method: 'GET', url: 'https://example.test/FlagQuiz/js/app.js', mode: 'cors' }, respondWith: p => { response = p; } });
  assert.equal((await response).status, 404);
});

test('오류 응답은 셸 캐시에 담기지 않는다', async () => {
  const w = worker(); let response;
  w.sandbox.fetch = async () => new Response('오류 본문', { status: 503 });
  w.events.fetch({ request: { method: 'GET', url: 'https://example.test/FlagQuiz/js/app.js', mode: 'cors' }, respondWith: p => { response = p; } });
  await response;
  assert.deepEqual(w.puts, [], '오류 응답을 담아 두면 다음 오프라인에서 그 오류가 재생된다');
});

test('그림 예열은 그림 버킷만 채우고 보류 소재는 아예 받지 않는다', async () => {
  // 아이는 차 안에서 비행기 모드로 논다. 그림을 그때 받으려 하면 문제가 통째로 잠긴다.
  const w = worker();
  const fetched = [];
  w.sandbox.fetch = async req => {
    const url = urlOf(req);
    fetched.push(url);
    if (url.endsWith('/data/countries.js')) return new Response('[{"code":"kr"},{"code":"gn"}]');
    if (url.endsWith('/data/subjects.js')) {
      // 실제 data/subjects.js 와 같은 모양으로 준다 — 머리말 주석에도 'subjects' 라는 글자가 있고
      // IIFE 로 감싸여 있다. 픽스처가 실제 파일과 다르면 파싱 버그가 그대로 지나간다.
      return new Response('/* 생성물: npm run subjects:build. */\n(function () {\n' +
        '  var FQ = window.FQ = window.FQ || {};\n  FQ.subjects = ' + JSON.stringify({
          kr: { symbol: { ko: '김치' }, place: { ko: '광화문' } },
          gn: { symbol: { ko: '코라 악기', noArt: true } }
        }, null, 2) + ';\n})();\n');
    }
    if (url.includes('/images/')) return new Response('webp bytes');
    return new Response('<svg>flag</svg>');
  };
  await lifecycle(w, 'activate');
  await w.sandbox.self.warmArtDone;  // 그림 예열은 활성화를 붙잡지 않는다 — 끝을 따로 기다린다.
  assert.equal(await w.read(ART, './images/symbols/kr.webp').text(), 'webp bytes');
  assert.equal(await w.read(ART, './images/places/kr.webp').text(), 'webp bytes');
  // 보류 소재는 파일 자체가 없다 — 받으려 시도조차 하지 않는다.
  assert.ok(!fetched.some(url => url.includes('symbols/gn.webp')), '보류 소재를 받으러 갔다');
  assert.ok(w.puts.every(put => [ART, FLAGS].includes(put.name)), '예열이 다른 버킷을 건드렸다');
  assert.ok(fetched.every(url => !new URL(url).pathname.includes('/audio/')), '예열이 음원을 건드렸다');
});

test('그림 예열이 실패해도 활성화는 끝까지 간다', async () => {
  const w = worker();
  w.sandbox.fetch = async req => {
    const url = urlOf(req);
    if (url.endsWith('/data/countries.js')) return new Response('[{"code":"kr"}]');
    if (url.endsWith('/flags/kr.svg')) return new Response('<svg>flag</svg>');
    throw new Error('network failure');
  };
  await lifecycle(w, 'activate');
  await w.sandbox.self.warmArtDone;
  assert.equal(await w.read(FLAGS, './flags/kr.svg').text(), '<svg>flag</svg>');
  assert.equal(w.read(ART, './images/symbols/kr.webp'), undefined);
});

/* 실제 data/subjects.js 와 같은 모양의 본문. 머리말 주석에 'subjects' 가 있고 IIFE 로 감싸여 있다. */
function subjectsScript(subjects) {
  return '/* 생성물: npm run subjects:build. 원문은 docs/expansion/ 에 있습니다. */\n(function () {\n' +
    '  var FQ = window.FQ = window.FQ || {};\n  FQ.subjects = ' + JSON.stringify(subjects, null, 2) + ';\n})();\n';
}
const MARK = './images/_warm-art';

test('그림 예열 파서는 문장 속 중괄호·따옴표·이스케이프에 흔들리지 않고 보류 소재만 거른다', async () => {
  const w = worker();
  const fetched = [];
  w.sandbox.fetch = async req => {
    const url = urlOf(req);
    fetched.push(url);
    if (url.endsWith('/data/countries.js')) return new Response('[]');
    if (url.endsWith('/data/subjects.js')) return new Response(subjectsScript({
      kr: { symbol: { ko: '김치', prompt: '김치 — 배추 {한 포기}에 "빨간" 양념 \\ 끝', bytes: 5 }, place: { ko: '광화문 }', prompt: '지붕 { 곡선 }' } },
      gn: { symbol: { ko: '코라 악기', noArt: true, prompt: '{보류}' } },
      jp: { symbol: { ko: '벚꽃 "}" 문양' } }
    }));
    if (url.includes('/images/')) return new Response('12345');
    throw new Error('network failure');
  };
  await lifecycle(w, 'activate');
  assert.equal(await w.sandbox.self.warmArtDone, true);
  for (const path of ['./images/symbols/kr.webp', './images/places/kr.webp', './images/symbols/jp.webp']) {
    assert.equal(await w.read(ART, path).text(), '12345', path);
  }
  assert.ok(!fetched.some(url => url.includes('symbols/gn.webp')), '보류 소재를 받으러 갔다');
  assert.equal(w.read(ART, './images/places/jp.webp'), undefined, '명소가 없는 나라의 명소를 받으러 갔다');
  assert.match(await w.read(ART, MARK).text(), /symbols\/kr\.webp 5\n/, '다 채운 목록을 기록해 둔다');
});

test('그림 예열은 활성화를 붙잡지 않는다', async () => {
  const w = worker();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  w.sandbox.fetch = async req => {
    const url = urlOf(req);
    if (url.endsWith('/data/countries.js')) return new Response('[]');
    if (url.endsWith('/data/subjects.js')) return new Response(subjectsScript({ kr: { symbol: { ko: '김치' } } }));
    await gate;  // 그림은 아직 오지 않는다
    return new Response('webp');
  };
  await lifecycle(w, 'activate');  // 그림이 멈춰 있어도 활성화는 끝난다
  let settled = false;
  w.sandbox.self.warmArtDone.then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, '활성화가 끝난 뒤에도 그림 예열은 아직 도는 중이어야 한다');
  release();
  assert.equal(await w.sandbox.self.warmArtDone, true);
  assert.equal(await w.read(ART, './images/symbols/kr.webp').text(), 'webp');
});

test('워커가 중간에 꺼져도 다음 워커가 온라인 셸 응답에서 남은 그림을 이어받고, 다 채우면 다시 훑지 않는다', async () => {
  const subjects = subjectsScript({ kr: { symbol: { ko: '김치' }, place: { ko: '광화문' } }, jp: { symbol: { ko: '벚꽃' } } });
  const network = (log, imageLimit) => async req => {
    const url = urlOf(req);
    log.push(url);
    if (url.endsWith('/data/countries.js')) return new Response('[]');
    if (url.endsWith('/data/subjects.js')) return new Response(subjects);
    if (url.includes('/images/')) {
      if (log.filter(u => u.includes('/images/')).length > imageLimit) throw new Error('worker killed');
      return new Response('webp ' + url);
    }
    return new Response('shell file');
  };
  // 1) 첫 워커: 그림 한 장만 받고 꺼진 것으로 친다.
  const first = worker();
  const firstLog = [];
  first.sandbox.fetch = network(firstLog, 1);
  await lifecycle(first, 'activate');
  assert.equal(await first.sandbox.self.warmArtDone, false);
  const cachedAfterFirst = ['./images/symbols/kr.webp', './images/places/kr.webp', './images/symbols/jp.webp'].filter(p => first.read(ART, p));
  assert.equal(cachedAfterFirst.length, 1);
  assert.equal(first.read(ART, MARK), undefined, '못 채운 예열은 완료 기록을 남기지 않는다');
  // 같은 워커 안에서는 곧바로 되풀이하지 않는다 — 온라인 신호가 와도 5분은 기다린다.
  const before = firstLog.length;
  await request(first, './js/app.js');
  assert.deepEqual(firstLog.slice(before), [BASE + 'js/app.js'], '실패 직후의 같은 워커가 예열을 다시 돌렸다');

  // 2) 새 워커(같은 캐시): 활성화 없이 셸 파일 하나를 네트워크에서 받는 순간 이어받는다.
  const second = worker({ buckets: first.buckets });
  const secondLog = [];
  second.sandbox.fetch = network(secondLog, Infinity);
  assert.equal(await (await request(second, './js/app.js')).text(), 'shell file');
  for (const path of ['./images/symbols/kr.webp', './images/places/kr.webp', './images/symbols/jp.webp']) {
    assert.ok(second.read(ART, path), path + ' 를 이어받지 못했다');
  }
  assert.ok(!secondLog.includes(BASE + cachedAfterFirst[0].slice(2)), '이미 받은 그림을 다시 받았다');
  assert.equal(secondLog.filter(u => u.includes('/images/')).length, 2);
  assert.ok(second.read(ART, MARK), '다 채운 뒤 완료 기록이 없다');
  assert.ok(second.puts.every(put => put.name === SHELL || put.name === ART));
  assert.ok(secondLog.every(url => !new URL(url).pathname.includes('/audio/')));

  // 3) 또 새 워커: 완료 기록이 같으면 342번 조회 없이 끝낸다.
  const third = worker({ buckets: first.buckets });
  const thirdLog = [];
  third.sandbox.fetch = network(thirdLog, Infinity);
  await request(third, './js/app.js');
  assert.ok(!thirdLog.some(u => u.includes('/images/')), '완료된 예열이 그림을 다시 받았다');
  assert.deepEqual(third.matches.filter(m => m.name === ART).map(m => m.url), [urlOf(MARK)], '완료 기록만 보고 그림 조회는 건너뛴다');
});

test('배포에서 같은 이름으로 바뀐 그림은 크기가 달라져 HTTP 캐시를 건너뛰고 새로 받고, 같은 크기는 그대로 둔다', async () => {
  const w = worker();
  const kr = './images/symbols/kr.webp', place = './images/places/kr.webp';
  w.seed(ART, kr, new Response('old-image', { headers: { 'content-type': 'image/webp' } }));                 // 9바이트, 헤더 없음
  w.seed(ART, place, new Response('x', { headers: { 'content-type': 'image/webp', 'content-length': '7' } })); // 헤더로 7바이트
  w.seed(ART, MARK, new Response('지난 배포의 목록'));
  const fetched = [];
  w.sandbox.fetch = async req => {
    fetched.push(req);
    const url = urlOf(req);
    if (url.endsWith('/data/subjects.js')) return new Response(subjectsScript({ kr: { symbol: { ko: '김치', bytes: 5 }, place: { ko: '광화문', bytes: 7 } } }));
    if (url.endsWith(kr.slice(1))) return new Response('new!!', { headers: { 'content-type': 'image/webp' } });
    return new Response('shell file');
  };
  await request(w, './js/app.js');
  assert.equal(await w.read(ART, kr).text(), 'new!!', '크기가 다른 옛 그림을 새 그림으로 바꾸지 않았다');
  assert.equal(await w.read(ART, place).text(), 'x', '크기가 같은 그림을 건드렸다');
  const reload = fetched.filter(req => urlOf(req).endsWith(kr.slice(1)));
  assert.equal(reload.length, 1);
  assert.equal(reload[0].cache, 'reload', '바뀐 그림은 브라우저 HTTP 캐시를 건너뛰어야 한다');
  assert.ok(!fetched.some(req => urlOf(req).endsWith(place.slice(1))));
  assert.match(await w.read(ART, MARK).text(), /symbols\/kr\.webp 5\n.*places\/kr\.webp 7/);
  assert.ok(w.puts.every(put => put.name === SHELL || put.name === ART));
  assert.equal(w.buckets.get(AUDIO).size, 0);
});

test('바뀐 그림을 못 받으면 옛 그림을 남기고 완료 기록도 남기지 않는다', async () => {
  const w = worker();
  const kr = './images/symbols/kr.webp';
  w.seed(ART, kr, new Response('old-image'));
  w.sandbox.fetch = async req => {
    const url = urlOf(req);
    if (url.endsWith('/data/subjects.js')) return new Response(subjectsScript({ kr: { symbol: { ko: '김치', bytes: 5 } } }));
    if (url.includes('/images/')) throw new Error('offline again');
    return new Response('shell file');
  };
  await request(w, './js/app.js');
  assert.equal(await w.read(ART, kr).text(), 'old-image', '새 그림을 못 받았으면 옛 그림이라도 남아야 한다');
  assert.equal(w.read(ART, MARK), undefined);
});
