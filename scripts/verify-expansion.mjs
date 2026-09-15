/* 국기 퀴즈 확장 과제 검사기 — 의존성 0, node 내장 모듈만 쓴다.
 *   node scripts/verify-expansion.mjs          기본 검사
 *   node scripts/verify-expansion.mjs --deep    느린 검사까지 (빌드 실행·변이 주입)
 *
 * 상태는 셋뿐이다.
 *   통과   — 검사했고 문제가 없다
 *   실패   — 검사했고 문제가 있다
 *   미구현 — 그 과제의 파일 자체가 아직 없다 (실패가 아니다)
 *
 * 파일이 없을 때 조용히 통과시키지 않는다. 파일이 없으면 '미구현',
 * 파일은 있는데 내용이 틀리면 '실패'다. 이 구분이 이 스크립트의 전부다.
 *
 * 종료 코드: 금지 사항(guardrail) 위반이 하나라도 있으면 1, 그 밖에는 0.
 * 미구현은 0이다 — 아직 안 한 일이 CI를 막아서는 안 된다.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEEP = process.argv.includes('--deep');

/* ──────────────────────────── 작은 검사 틀 ──────────────────────────── */

const PASS = '통과', FAIL = '실패', SKIP = '미구현';

class SkipSignal extends Error {}

const results = [];

/** 검사 하나를 등록하고 바로 돌린다. fn 은 async 여도 된다. */
async function check(meta, fn) {
  const problems = [];
  const notes = [];
  const t = {
    ok(cond, message, detail) {
      if (!cond) problems.push(message + (detail !== undefined ? ' — ' + detail : ''));
    },
    note(message) { notes.push(message); },
    skip(reason) { throw new SkipSignal(reason); }
  };
  let status = PASS;
  let reason = '';
  try {
    await fn(t);
    if (problems.length) status = FAIL;
  } catch (e) {
    if (e instanceof SkipSignal) {
      status = SKIP;
      reason = e.message;
    } else {
      // 검사기가 터진 것도 통과로 넘기지 않는다. 사람이 볼 수 있게 실패로 남긴다.
      status = FAIL;
      problems.push('검사 도중 예외가 났다 (검사기 버그이거나 파일 형태가 예상과 다르다): ' + e.message);
    }
  }
  results.push({ ...meta, status, reason, problems, notes });
}

/* ──────────────────────────── 파일 도우미 ──────────────────────────── */

const p = (...parts) => path.join(root, ...parts);
const exists = (rel) => fs.existsSync(p(rel));

/** 반드시 있어야 하는 파일. 없으면 '미구현'이 아니라 실패다. */
function read(rel) {
  const full = p(rel);
  if (!fs.existsSync(full)) throw new Error('있어야 할 파일이 없다: ' + rel);
  return fs.readFileSync(full, 'utf8');
}

/** 없으면 '미구현'으로 건너뛰게 하는 파일. */
function readOrSkip(t, rel, taskLabel) {
  if (!exists(rel)) t.skip(rel + ' 이 아직 없다 — ' + taskLabel + ' 미구현');
  return fs.readFileSync(p(rel), 'utf8');
}

/** `function 이름(` 부터 중괄호 깊이를 세어 본문 `{...}` 를 떼어 낸다. */
function funcBody(src, header) {
  const at = src.indexOf(header);
  if (at === -1) return null;
  const start = src.indexOf('{', at);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}

/** 파일 맨 앞의 헤더 주석. 블록(/* *\/)과 줄(//) 주석을 모두 받는다. */
function headerComment(src) {
  const block = /^\s*\/\*[\s\S]*?\*\//.exec(src);
  if (block) return block[0];
  const lines = [];
  for (const line of src.split('\n')) {
    if (/^\s*\/\//.test(line)) lines.push(line);
    else if (line.trim() === '' && lines.length === 0) continue;
    else break;
  }
  return lines.join('\n');
}

/** `var 이름 = [ ... ];` 안의 작은따옴표 리터럴을 모은다. */
function arrayLiterals(src, re) {
  const m = re.exec(src);
  if (!m) return null;
  return (m[1].match(/'[^']*'/g) || []).map((s) => s.slice(1, -1));
}

function countOf(src, re) {
  return (src.match(re) || []).length;
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/* ──────────────────────── 가짜 브라우저 샌드박스 ──────────────────────── */
/* tests/run.mjs:12-57 의 것을 그대로 본떴다. 새 기법을 쓰지 않는다. */

function makeSandbox(storeImpl) {
  const store = storeImpl || new Map();
  const sandbox = {
    console, Math, Date, JSON, Object, Array, String, Number, RegExp, Error,
    isNaN, isFinite, parseInt, parseFloat,
    Image: function () {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: store instanceof Map ? {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    } : store,
    document: {
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, addEventListener() {} }),
      readyState: 'complete',
      body: { appendChild() {} }
    },
    addEventListener() {},
    requestAnimationFrame() {},
    cancelAnimationFrame() {},
    matchMedia: () => ({ matches: false }),
    scrollTo() {}
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  sandbox.__store = store;
  return sandbox;
}

function loadInto(sandbox, files) {
  for (const file of files) {
    vm.runInContext(read(file), sandbox, { filename: file });
  }
  return sandbox;
}

/** 실제 CacheStorage처럼 버킷별 URL·응답·삭제를 보관한다. 외부 네트워크는 쓰지 않는다. */
function makeWorker(src, cacheKeys = ['another-app-v1', 'flagquiz-v2', 'flagquiz-v3', 'flagquiz-v4']) {
  const base = 'https://example.test/FlagQuiz/';
  const keyOf = request => new URL(request.url || request, base).href;
  const events = {}, deleted = [], deletedEntries = [], opened = [], matches = [], puts = [], fetched = [];
  const buckets = new Map(cacheKeys.map(name => [name, new Map()]));
  let network = async () => { throw new Error('offline'); };
  function bucket(name) {
    if (!buckets.has(name)) buckets.set(name, new Map());
    return buckets.get(name);
  }
  function cache(name) {
    const entries = bucket(name);
    return {
      async keys() { return [...entries.keys()].map(url => new Request(url)); },
      async delete(request) {
        const url = keyOf(request);
        deletedEntries.push({ name, url });
        return entries.delete(url);
      },
      async match(request) {
        const url = keyOf(request);
        matches.push({ name, url });
        return entries.get(url)?.clone();
      },
      async put(request, response) {
        if (response.status === 206) throw new TypeError('부분 음원 206은 Cache.put에 저장할 수 없다');
        const url = keyOf(request);
        puts.push({ name, url, status: response.status });
        entries.set(url, response.clone());
      },
      async add(request) {
        const response = await sandbox.fetch(new Request(keyOf(request)));
        if (!response.ok) throw new TypeError('Cache.add 응답이 성공하지 않았다');
        await this.put(request, response);
      },
      async addAll(requests) {
        const responses = await Promise.all(requests.map(async request => {
          const response = await sandbox.fetch(new Request(keyOf(request)));
          if (!response.ok) throw new TypeError('Cache.addAll 응답이 성공하지 않았다');
          return response;
        }));
        await Promise.all(requests.map((request, i) => this.put(request, responses[i])));
      }
    };
  }
  const sandbox = {
    URL, Request, Response, Headers, Promise, console,
    self: {
      location: { origin: new URL(base).origin, href: base + 'sw.js' },
      addEventListener: (name, fn) => { events[name] = fn; },
      clients: { claim() {} }, skipWaiting() {}
    },
    caches: {
      keys: async () => [...buckets.keys()],
      delete: async name => { deleted.push(name); return buckets.delete(name); },
      async match(request) {
        for (const name of buckets.keys()) {
          const hit = await cache(name).match(request);
          if (hit) return hit;
        }
      },
      open: async name => { opened.push(name); return cache(name); }
    },
    fetch: async request => { fetched.push(keyOf(request)); return network(request); }
  };
  vm.runInNewContext(src, sandbox, { filename: 'sw.js', timeout: 5000 });
  return {
    events, deleted, deletedEntries, opened, matches, puts, fetched, buckets, sandbox, keyOf,
    seed(name, request, response) { bucket(name).set(keyOf(request), response.clone()); },
    peek(name, request) { return buckets.get(name)?.get(keyOf(request))?.clone(); },
    network(fn) { network = fn; },
    async activate() {
      if (typeof events.activate !== 'function') throw new Error('sw.js 가 activate 이벤트를 등록하지 않는다');
      const pending = [];
      events.activate({ waitUntil: promise => pending.push(promise) });
      await Promise.all(pending);
    },
    async request(request) {
      if (typeof events.fetch !== 'function') throw new Error('sw.js 가 fetch 이벤트를 등록하지 않는다');
      let response;
      const pending = [];
      events.fetch({ request, respondWith: promise => { response = promise; }, waitUntil: promise => pending.push(promise) });
      if (response === undefined) throw new Error('요청을 처리하는 fetch 분기가 없다: ' + request.url);
      const result = await response;
      await Promise.all(pending);
      if (!result) throw new Error('fetch 응답이 비어 있다: ' + request.url);
      return result;
    }
  };
}

/** 헬퍼 이름이나 caches.open의 위치 대신 기존 음원 조회와 신규 저장 경로를 실행한다. */
export async function verifyAudioCache(t, src) {
  const audio = 'flagquiz-v4';
  const w = makeWorker(src);
  const body = Uint8Array.from([0, 255, 1, 128, 3, 4, 5, 6, 7, 8]);
  const response = () => new Response(body, { headers: { 'content-type': 'audio/mpeg' } });
  for (const kind of ['sua', 'music']) {
    const url = w.keyOf('./audio/' + kind + '/kept.mp3');
    w.seed(audio, url, response());
    const hit = await w.request(new Request(url, { headers: { range: 'bytes=0-1' } }));
    t.ok(hit.status === 206, '기존 ' + kind + ' 음원의 오프라인 Range 응답이 206이 아니다');
    t.ok(Buffer.from(await hit.arrayBuffer()).equals(Buffer.from(body.slice(0, 2))),
      '기존 ' + kind + ' 음원을 flagquiz-v4 에서 그대로 읽지 못했다');
  }
  t.ok(w.fetched.length === 0, '이미 저장된 음원을 다시 다운로드한다', w.fetched.join(', '));
  t.ok(w.puts.length === 0, '이미 저장된 음원을 다른 버킷으로 복사한다');
  w.network(async req => {
    t.ok(!req.headers.has('range') && !req.headers.has('if-range'), '신규 음원의 전체 200 요청에서 Range 헤더를 제거하지 않았다');
    return response();
  });
  for (const kind of ['sua', 'music']) {
    const url = w.keyOf('./audio/' + kind + '/new.mp3');
    const result = await w.request(new Request(url, { headers: { range: 'bytes=2-4', 'if-range': 'old-etag' } }));
    t.ok(result.status === 206, '신규 ' + kind + ' 음원의 Range 응답이 206이 아니다');
    t.ok(Buffer.from(await result.arrayBuffer()).equals(Buffer.from(body.slice(2, 5))), '신규 음원 응답 바이트가 다르다');
    const saved = w.peek(audio, url);
    t.ok(saved?.status === 200, '신규 ' + kind + ' 음원 전체 200이 flagquiz-v4 에 저장되지 않았다');
    if (saved) t.ok(Buffer.from(await saved.arrayBuffer()).equals(Buffer.from(body)), 'flagquiz-v4 에 저장된 신규 음원 바이트가 다르다');
    t.ok(w.puts.some(put => put.name === audio && put.url === url), '음원 저장이 완료되기 전에 응답했다', url);
    t.ok(w.puts.filter(put => put.url === url).every(put => put.name === audio), '신규 음원이 flagquiz-v4 이외 버킷에도 저장된다', url);
  }
  t.ok(countOf(src, /flagquiz-v4/g) >= 1, "sw.js 안에 'flagquiz-v4' 문자열이 사라졌다");
  const higher = (src.match(/flagquiz-v(\d+)/g) || []).filter(name => Number(name.slice(10)) > 4);
  t.ok(higher.length === 0, 'sw.js 에 flagquiz-v5 이상의 캐시 이름이 있다', higher.join(', '));
  t.note('수아·음악의 기존 v4 오프라인 조회와 신규 전체 200 저장·206 응답을 실행 확인했다');
}

export async function verifyActivateKeepsAudio(t, src) {
  const audio = 'flagquiz-v4';
  const found = new Set(src.match(/flagquiz-[a-z0-9-]+/g) || []);
  const keys = Array.from(new Set(['another-app-v1', 'flagquiz-v2', 'flagquiz-v3', audio, ...found]));
  const w = makeWorker(src, keys);
  const body = Uint8Array.from([255, 0, 128, 17, 6, 99]);
  const audioUrls = ['sua', 'music'].map(kind => w.keyOf('./audio/' + kind + '/kept.mp3'));
  for (const url of audioUrls) w.seed(audio, url, new Response(body, { headers: { 'content-type': 'audio/mpeg' } }));
  w.seed(audio, './index.html', new Response('legacy shell'));
  w.seed(audio, './js/util.js', new Response('legacy script'));
  w.seed(audio, './flags/kr.svg', new Response('<svg>legacy flag</svg>'));
  w.seed('another-app-v1', './index.html', new Response('other app shell'));
  w.seed('another-app-v1', './js/missing.js', new Response('other app script'));
  const shell = w.sandbox.SHELL_CACHE;
  if (shell && shell !== audio) {
    w.seed(shell, './index.html', new Response('current shell'));
    w.seed(shell, './js/util.js', new Response('current script'));
  }
  await w.activate();
  t.ok(!w.deleted.includes(audio) && w.buckets.has(audio), 'activate 가 음원 캐시 flagquiz-v4 를 지운다 — 114MB 재다운로드다', w.deleted.join(', '));
  t.ok(!w.deleted.includes('another-app-v1'), 'activate 가 남의 앱 캐시까지 지운다', w.deleted.join(', '));
  for (const url of audioUrls) {
    const saved = w.peek(audio, url);
    t.ok(!!saved, 'activate 가 기존 음원 항목을 삭제했다', url);
    if (saved) t.ok(Buffer.from(await saved.arrayBuffer()).equals(Buffer.from(body)), 'activate 뒤 음원 바이트가 달라졌다', url);
  }
  const isAudio = entry => new URL(entry.url).pathname.includes('/audio/');
  t.ok(!w.matches.some(isAudio), 'activate 가 기존 음원 본문을 읽는다 — 음원 이관은 금지다');
  t.ok(!w.puts.some(isAudio), 'activate 가 기존 음원을 다른 버킷으로 복사한다');
  t.ok(!w.deletedEntries.some(isAudio), 'activate 가 기존 음원 항목을 삭제한다');
  t.ok(!w.fetched.some(url => new URL(url).pathname.includes('/audio/')), 'activate 가 음원을 재다운로드한다');
  if (shell && shell !== audio) {
    const navigate = await w.request({ method: 'GET', mode: 'navigate', url: w.keyOf('./unknown-page') });
    t.ok(await navigate.text() === 'current shell', '오프라인 탐색이 현재 셸 대신 레거시 또는 타 앱 HTML을 제공한다');
    const script = await w.request(new Request(w.keyOf('./js/util.js')));
    t.ok(await script.text() === 'current script', '오프라인 스크립트가 다른 버킷의 옛 파일을 제공한다');
    const missing = await w.request(new Request(w.keyOf('./js/missing.js')));
    t.ok(missing.type === 'error', '누락 스크립트에 다른 버킷의 파일 또는 HTML을 제공한다');
  }
  t.note('v4 수아·음악 바이트 보존, 음원 읽기·복사·삭제·다운로드 없음, 타 앱 캐시 보존을 실행 확인했다');
}

/** 실제 나라 모달의 두 버튼을 눌러 음원 목록에 없는 문구가 추가되지 않았는지 검사한다. */
export function verifyUiVoicePhrases(t, src, countries, manifest) {
  const sandbox = makeSandbox();
  let modal = null;
  const spoken = [];
  sandbox.document.createElement = () => ({
    innerHTML: '',
    listeners: new Map(),
    addEventListener(type, listener) { this.listeners.set(type, listener); },
    querySelector() { return { textContent: '', focus() {} }; },
    remove() { if (modal === this) modal = null; }
  });
  sandbox.document.querySelector = (selector) => selector === '.modal-back' ? modal : null;
  sandbox.document.body.appendChild = (node) => { modal = node; };
  // 상태와 음성 장치는 격리하고, 화면 생성과 이벤트 처리 코드는 실제 ui.js를 실행한다.
  sandbox.FQ = {
    storage: { countryStat: () => ({ seen: 0 }), updateSettings() {} },
    quiz: { LEVEL_LABEL: {} },
    audio: {
      stopSpeaking() {}, setSpeakEnabled() {},
      say(lines) { spoken.push(Array.isArray(lines) ? [...lines] : [lines]); }
    }
  };
  vm.runInContext(src, sandbox, { filename: 'js/ui.js' });
  t.ok(countries.length === 194, '음성 버튼 검사 대상이 194개국이 아니다', countries.length);
  t.ok(typeof sandbox.FQ.ui?.countryModal === 'function', '나라 모달을 실행할 수 없다');
  if (typeof sandbox.FQ.ui?.countryModal !== 'function') return;
  let buttons = 0;
  for (const country of countries) {
    sandbox.FQ.ui.countryModal(country);
    for (const attribute of ['data-speak', 'data-explain']) {
      const label = country.code + ' ' + attribute;
      t.ok(modal && new RegExp('\\b' + attribute + '\\b').test(modal.innerHTML), '나라 모달에 음성 버튼이 없다', label);
      const click = modal?.listeners.get('click');
      t.ok(typeof click === 'function', '나라 모달의 클릭 처리가 없다', label);
      if (typeof click !== 'function') continue;
      const start = spoken.length;
      const target = { closest(selector) { return selector === '[' + attribute + ']' ? target : null; } };
      click({ target });
      const lines = spoken.slice(start).flat();
      t.ok(lines.length > 0, '음성 버튼을 눌러도 재생 문구가 없다', label);
      for (const line of lines) {
        t.ok(typeof line === 'string' && Object.hasOwn(manifest.clips, line),
          '기존 수아 음원에 없는 UI 문구', label + ': ' + JSON.stringify(line));
      }
      buttons++;
    }
  }
  t.note('194개국 이름·설명 버튼 ' + buttons + '회 실행: 실제 발화 문구를 기존 manifest와 대조했다');
}

export function verifyMapTolerance(t, src, headers = {}) {
  const match = /\b(?:const|let|var)\s+SIMPLIFY_TOLERANCE_DEG\s*=\s*(\d+(?:\.\d+)?)\s*;/.exec(src);
  t.ok(!!match, 'SIMPLIFY_TOLERANCE_DEG 상수가 없다');
  if (!match) return;
  const tol = Number(match[1]);
  t.ok(tol === 0.7 || tol === 0.5, '단순화 허용 오차는 HANDOFF의 기본 0.7° 또는 육안 확인 후 허용 대안 0.5°여야 한다', '실제 ' + tol + '°');
  if (tol === 0.5) {
    const reason = src.slice(0, match.index).split('\n').slice(-4).join('\n');
    t.ok(/\/\/|\/\*/.test(reason) && /HANDOFF/.test(reason) && /육안/.test(reason) && /0\.5/.test(reason),
      '0.5° 선택은 상수 앞 주석에 HANDOFF의 육안 확인 대안이라는 근거를 남겨야 한다');
  }
  for (const [name, header] of Object.entries(headers)) {
    const value = (/허용 오차:\s*([\d.]+)/.exec(header) || [])[1];
    t.ok(value !== undefined && Number(value) === tol, name + ' 헤더의 단순화 오차가 build-map.mjs 상수와 다르다', '헤더 ' + value + '° vs 상수 ' + tol + '°');
  }
  t.note('단순화 허용 오차 ' + tol + '° — HANDOFF 허용값과 선택 근거·생성 헤더 일치 확인');
}

/** data/countries.js 만 올려 194개 code 집합을 얻는다. */
function countryCodes() {
  const ctx = { window: {} };
  vm.runInNewContext(read('data/countries.js'), ctx, { filename: 'data/countries.js' });
  const list = ctx.window.FQ.countries;
  return { list, codes: new Set(list.map((c) => c.code)) };
}

/** 'd' 문자열을 M/L/Z 로 파싱해 서브패스별 점 배열을 만든다. */
function parsePathData(d) {
  const subs = [];
  let cur = null;
  const re = /([MLZ])([^MLZ]*)/gi;
  let m;
  while ((m = re.exec(d))) {
    const cmd = m[1].toUpperCase();
    if (cmd === 'Z') { if (cur && cur.length) { subs.push(cur); cur = null; } continue; }
    const nums = (m[2].match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (cmd === 'M') { if (cur && cur.length) subs.push(cur); cur = []; }
    if (!cur) cur = [];
    for (let i = 0; i + 1 < nums.length; i += 2) cur.push([nums[i], nums[i + 1]]);
  }
  if (cur && cur.length) subs.push(cur);
  return subs;
}

function signedPathArea(points) {
  const [ox, oy] = points[0] || [0, 0];
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
    area += (x1 - ox) * (y2 - oy) - (x2 - ox) * (y1 - oy);
  }
  return area / 2;
}

function pathWinding([px, py], points) {
  let winding = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
    const side = (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1);
    if (y1 <= py && y2 > py && side > 0) winding++;
    else if (y1 > py && y2 <= py && side < 0) winding--;
  }
  return winding;
}

/** 생성기와 독립적으로 최종 SVG fill과 핀의 관계를 검사한다. */
export function verifyMapGeometry(t, land, coords) {
  const subs = parsePathData(land.d);
  t.ok(subs.length >= 300, '육지 서브패스가 300개 미만이다', subs.length + '개');
  const areas = subs.map(signedPathArea);
  const zero = areas.flatMap((area, index) => Math.abs(area) < 1e-9 ? [index] : []);
  t.ok(zero.length === 0, '면적 0인 육지 서브패스가 있다', zero.join(', '));
  const directions = new Set(areas.filter(area => Math.abs(area) >= 1e-9).map(Math.sign));
  t.ok(directions.size === 1, '육지 서브패스의 방향이 통일되지 않았다 — nonzero fill이 서로 상쇄될 수 있다');
  const pins = Object.entries(coords);
  t.ok(pins.length === 194, '실루엣에 대조할 핀이 194개가 아니다', pins.length + '개');
  const outside = pins.filter(([, point]) => {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) return true;
    const [lng, lat] = point;
    const projected = [(lng + 180) / 360 * 2000, (90 - lat) / 180 * 1000];
    return subs.reduce((sum, points) => sum + pathWinding(projected, points), 0) === 0;
  }).map(([code]) => code);
  t.ok(outside.length === 0, '생성 실루엣의 육지 밖에 있는 핀', outside.join(', '));
  t.note('최종 도형 면적·방향 및 핀 ' + pins.length + '개의 winding number 검사');
}

/** 국가 코드 목록을 하드코딩해 통과할 수 없도록 가상 국가와 배제 지역을 직접 생성한다. */
export function verifySmallLandPreservation(t, buildLand) {
  t.ok(typeof buildLand === 'function', 'buildLand를 export하지 않는다');
  if (typeof buildLand !== 'function') return;
  const tiny = (name, [lng, lat]) => ({
    type: 'Feature',
    properties: { ADMIN: name, LABEL_X: lng, LABEL_Y: lat },
    geometry: { type: 'Polygon', coordinates: [[
      [lng - 0.001, lat - 0.001], [lng + 0.001, lat - 0.001],
      [lng + 0.001, lat + 0.001], [lng - 0.001, lat + 0.001],
      [lng - 0.001, lat - 0.001]
    ]] }
  });
  const country = tiny('Tiny country fixture', [12.43, 41.9]);
  const excluded = tiny('Excluded land fixture', [30, 20]);
  const result = buildLand([country, excluded], new Map([['zz', country]]));
  const subs = parsePathData(result.mapLand.d);
  t.ok(subs.length === 2, '초소형 국가와 배제 지역의 두 도형이 모두 보존되지 않았다', subs.length + '개');
  t.ok(subs.every(points => signedPathArea(points) > 1e-9), 'bbox 대체 도형이 반올림 뒤 면적 0이거나 방향이 다르다');
  for (const feature of [country, excluded]) {
    const { ADMIN, LABEL_X: lng, LABEL_Y: lat } = feature.properties;
    const projected = [(lng + 180) / 360 * 2000, (90 - lat) / 180 * 1000];
    t.ok(subs.reduce((sum, points) => sum + pathWinding(projected, points), 0) !== 0,
      '초소형 도형의 내부 점이 최종 실루엣에서 사라졌다: ' + ADMIN);
  }
  t.note('가상 코드 zz와 배제 지역을 생성해 bbox 대체·면적·내부 점 보존 확인');
}

/* 여러 검사가 함께 쓰는 기준선 — Codex 작업 전 이 저장소에서 실측한 값이다. */
const BASE_SCRIPTS = [
  'js/util.js', 'js/storage.js', 'js/voice-manifest.js', 'js/audio.js', 'js/recorded-audio.js',
  'js/music-manifest.js', 'js/music.js', 'js/speech.js', 'js/effects.js', 'js/ui.js',
  'data/countries.js', 'js/progress.js', 'js/quiz.js', 'js/badges.js', 'js/screens.js', 'js/app.js'
];
const BASE_JS_FILES = [
  'app.js', 'audio.js', 'badges.js', 'effects.js', 'music-manifest.js', 'music.js', 'progress.js',
  'quiz.js', 'recorded-audio.js', 'screens.js', 'speech.js', 'storage.js', 'ui.js', 'util.js', 'voice-manifest.js'
];
const DISPUTED = ['tw', 'ps', 'xk', 'eh', 'ck', 'nu'];
const BASE_RUN_CHECKS = 7424;
const BASE_NODE_TESTS = 87;

function indexScripts() {
  const html = read('index.html');
  const out = [];
  const re = /<script src="([^"]+)"><\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function shellList() {
  return arrayLiterals(read('sw.js'), /var\s+SHELL\s*=\s*\[([\s\S]*?)\];/);
}

/** 지금 저장소에 새로 들어온 js/·data/ 스크립트 (기준선에 없던 것). */
function newScriptFiles() {
  const found = [];
  for (const dir of ['js', 'data']) {
    if (!exists(dir)) continue;
    for (const f of fs.readdirSync(p(dir))) {
      if (!f.endsWith('.js')) continue;
      const rel = dir + '/' + f;
      if (!BASE_SCRIPTS.includes(rel)) found.push(rel);
    }
  }
  return found.sort();
}

/* ══════════════════════════════════════════════════════════════════════
   1부 — 금지 사항 (severity: guardrail) · 위반하면 종료 코드 1
   ══════════════════════════════════════════════════════════════════════ */

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
await check({
  id: 'guard-storage-key',
  task: '금지1 (전 과제 공통)',
  label: 'localStorage 키가 flagquiz.v1 그대로인가',
  severity: 'guardrail',
  why: '마이그레이션 코드가 저장소 전체에 없다. v2로 올리는 순간 아이의 배지·194칸 스티커·기록·오답노트가 조용히 전부 사라지고 되돌릴 수 없다.'
}, (t) => {
  const src = read('js/storage.js');
  const m = /^\s*var\s+KEY\s*=\s*'([^']+)';\s*$/m.exec(src);
  t.ok(m, 'js/storage.js 에 var KEY 선언이 보이지 않는다 — 키가 어디로 갔는지 사람이 직접 봐야 한다');
  if (m) t.ok(m[1] === 'flagquiz.v1', '키가 바뀌었다. 이대로 배포하면 아이 기록이 전부 사라진다', '실제 ' + JSON.stringify(m[1]));
  t.ok(countOf(src, /flagquiz\.v/g) === 1, 'js/storage.js 안에 flagquiz.v 문자열이 1회여야 한다', '실제 ' + countOf(src, /flagquiz\.v/g) + '회');
  // js/ 전체: 등장 자체는 정상(안내문에 적을 수 있다). 값만 본다.
  const bad = [];
  for (const f of fs.readdirSync(p('js'))) {
    if (!f.endsWith('.js')) continue;
    for (const v of fs.readFileSync(p('js', f), 'utf8').match(/flagquiz\.v[0-9]+/g) || []) {
      if (v !== 'flagquiz.v1') bad.push('js/' + f + ' → ' + v);
    }
  }
  t.ok(bad.length === 0, 'js/ 안에 flagquiz.v1 이 아닌 키 문자열이 있다', bad.join(', '));
});

/** resetAll() 을 실제로 돌려 저장된 기본값을 뽑는다 — 텍스트 파싱이 아니다. */
let _snap = null;
function defaultsSnapshot() {
  if (_snap) return _snap;
  const sandbox = makeSandbox();
  loadInto(sandbox, ['js/util.js', 'js/storage.js']);
  sandbox.FQ.storage.resetAll();
  const raw = sandbox.__store.get('flagquiz.v1');
  if (raw === undefined) throw new Error('resetAll() 이 flagquiz.v1 에 아무것도 저장하지 않았다');
  _snap = JSON.parse(raw);
  return _snap;
}

await check({
  id: 'guard-defaults-all-objects',
  task: '금지2 (T3-feature-flags · T5-record-axis)',
  label: 'DEFAULTS 최상위 값이 전부 객체인가 (새 상태의 최상위 스칼라 금지)',
  severity: 'guardrail',
  why: "storage.js 의 복원 루프가 typeof saved[k]==='object' 인 키만 살린다. 최상위 스칼라는 저장은 되고 절대 읽히지 않아 매번 기본값으로 돌아간다. 증상이 '가끔 설정이 풀린다'라 아무도 못 잡는다."
}, (t) => {
  const snap = defaultsSnapshot();
  for (const [k, v] of Object.entries(snap)) {
    t.ok(v !== null && typeof v === 'object',
      '최상위 스칼라 상태가 있다 (저장은 되고 절대 읽히지 않는다): ' + k, 'typeof ' + typeof v);
  }
  t.note('DEFAULTS 최상위 키: ' + Object.keys(snap).join(', '));
});

await check({
  id: 'guard-audio-cache-name',
  task: '금지3 (T2-sw-cache-buckets)',
  label: '음원 캐시 이름이 flagquiz-v4 그대로인가',
  severity: 'guardrail',
  why: '아이패드에 이미 받아 둔 수아 음원 114MB가 그 이름 아래 있다. 이름을 바꾸는 순간 차 안에서 앱이 벙어리가 되고 114MB 재다운로드다.'
}, (t) => verifyAudioCache(t, read('sw.js')));

await check({
  id: 'guard-activate-keeps-audio',
  task: '금지3 (T2-sw-cache-buckets)',
  label: 'activate 정리가 flagquiz-v4 를 지우지 않는가 (실동작 시뮬레이션)',
  severity: 'guardrail',
  why: "현재 정리 코드는 'flagquiz- 로 시작하면 전부 삭제'다. 버킷을 넷으로 쪼개면서 화이트리스트로 바꾸지 않으면 새 버킷들이 서로를 지우고, 그중 하나가 음원 114MB다."
}, (t) => verifyActivateKeepsAudio(t, read('sw.js')));

await check({
  id: 'guard-flags-folder-clean',
  task: '금지5 (T4-subjects-data · T13-wiring · 지도 T5-register)',
  label: 'flags/ 에 194개 국기 SVG 외의 파일이 없는가',
  severity: 'guardrail',
  why: 'flags/ 에 새 그림을 넣으면 tests/run.mjs 고아 검사가 즉시 실패하고, sw.js 국기 예열과 build-site.mjs 의 flags/ 통째 복사에도 섞여 배포본에 실려 나간다. 그림은 images/symbols·images/places 로 간다.'
}, (t) => {
  const ALLOW = ['README.md'];
  const { codes } = countryCodes();
  const entries = fs.readdirSync(p('flags'), { withFileTypes: true });
  let svgCount = 0;
  for (const e of entries) {
    if (e.isDirectory()) { t.ok(false, 'flags/ 아래 하위 디렉터리가 생겼다', e.name); continue; }
    if (e.name.endsWith('.svg')) {
      svgCount++;
      t.ok(codes.has(e.name.slice(0, -4)), '194개 code 에 없는 국기 파일', 'flags/' + e.name);
    } else {
      t.ok(ALLOW.includes(e.name),
        'flags/ 에 국기 SVG 가 아닌 파일이 들어왔다 (그림은 images/ 로 간다)', 'flags/' + e.name);
    }
  }
  t.ok(svgCount === codes.size, 'flags/*.svg 개수가 194개국과 다르다', svgCount + ' vs ' + codes.size);
  t.note('flags/ 총 ' + entries.length + '개 (svg ' + svgCount + ', 허용 파일 ' + ALLOW.join('·') + ')');
});

await check({
  id: 'guard-voice-clip-count',
  task: '금지6 (T4-subjects-data · T6-dex-art-slot)',
  label: '수아 음원 문구가 977개 그대로인가',
  severity: 'guardrail',
  why: 'scripts/build-site.mjs 의 배포 게이트가 clips 개수와 expectedClips 가 같아야만 배포를 허락한다. 문구가 하나 늘면 음원 파일이 없어 main 배포 전체가 멈춘다. 1차는 새 음원 0개로 간다.'
}, (t) => {
  const ctx = { window: {} };
  vm.runInNewContext(read('js/voice-manifest.js'), ctx, { filename: 'js/voice-manifest.js' });
  const m = ctx.window.FQ.voiceManifest;
  const clips = Object.keys(m.clips).length;
  t.ok(m.ready === true, 'voiceManifest.ready 가 true 가 아니다', String(m.ready));
  t.ok(m.expectedClips === 977, 'expectedClips 가 977이 아니다 — 문구가 늘었다면 배포가 멈춘다', String(m.expectedClips));
  t.ok(clips === 977, 'clips 개수가 977이 아니다', String(clips));
  t.ok(clips === m.expectedClips, 'clips 개수와 expectedClips 가 어긋난다 — 이 상태로는 배포 게이트가 막는다',
    clips + ' vs ' + m.expectedClips);
  t.ok(exists('data/voice-config.json'), 'data/voice-config.json 이 사라졌다');
  const { list } = countryCodes();
  verifyUiVoicePhrases(t, read('js/ui.js'), list, m);
});

await check({
  id: 'guard-build-gate-intact',
  task: '금지6 (scripts/build-site.mjs)',
  label: '배포 게이트(전체 음원 준비 검사)가 무력화되지 않았는가',
  severity: 'guardrail',
  why: '금지6의 집행 장치 자체다. 문구를 늘리고 싶어진 사람이 게이트를 지우면 음원 없는 배포가 나가 아이 화면에서 소리가 안 난다.'
}, (t) => {
  const src = read('scripts/build-site.mjs');
  t.ok(/manifest\?\.ready/.test(src), 'manifest?.ready 검사가 사라졌다');
  t.ok(/Object\.keys\(manifest\.clips\)\.length\s*!==\s*manifest\.expectedClips/.test(src),
    '음원 개수 게이트가 사라졌다');
  t.ok(src.includes('전체 음원이 준비되어야 배포할 수 있습니다'), '음원 게이트 실패 메시지가 사라졌다');
  t.ok(/music\.clips\.length\s*!==\s*16/.test(src), '음악 16곡 게이트가 사라졌다');
});

await check({
  id: 'guard-quiz-filter-static',
  task: '금지4 (T7-confusion-exclude)',
  label: 'distractors 폴백이 필터 안 거친 all() 을 다시 긁지 않는가 (정적 확인)',
  severity: 'guardrail',
  why: '폴백이 all() 을 직접 부르면 그 자리에서 자료 필터가 통째로 무의미해진다. 그림 없는 나라가 보기로 올라와 빈 칸이 렌더링된다.'
}, (t) => {
  const src = read('js/quiz.js');
  if (!exists('data/subjects.js') || !/confusionSet|FQ\.subjects/.test(src)) {
    t.skip('data/subjects.js 가 없고 js/quiz.js 에 FQ.subjects·confusionSet 이 없다 — T7 미구현');
  }
  const body = funcBody(src, 'function distractors');
  t.ok(body, 'js/quiz.js 에서 distractors 본문을 찾지 못했다');
  if (!body) return;
  const sig = /function distractors\(([^)]*)\)/.exec(src);
  t.ok(sig && sig[1].split(',').length >= 5,
    'distractors 시그니처에 opts 인자가 없다 (축 정보를 못 받는다)', sig ? sig[1] : '?');
  const allCalls = countOf(body, /\ball\(\)/g);
  t.ok(allCalls <= 1, '본문에서 all() 을 ' + allCalls + '회 부른다 — 폴백이 필터 밖 목록을 다시 긁고 있다');
  const at = body.indexOf('if (out.length < count)');
  if (at !== -1) {
    const tail = body.slice(at);
    t.ok(!/util\.shuffle\(all\(\)\)/.test(tail), '폴백 구간에 util.shuffle(all()) 이 남아 있다 — 한쪽만 고쳤다');
    t.note('굶주림 완화 구간 (자료 필터를 푸는 분기가 없는지 사람이 읽는다):\n' +
      tail.split('\n').slice(0, 14).map((l) => '      | ' + l).join('\n'));
  }
  const head = at === -1 ? body : body.slice(0, at);
  t.ok(/opts\.axis/.test(head), '후보 생성 구간에 opts.axis 참조가 없다');
  t.ok(/FQ\.subjects/.test(head), '후보 생성 구간에 FQ.subjects 참조가 없다');
});

await check({
  id: 'guard-quiz-filter-runtime',
  task: '금지4 (T7-confusion-exclude)',
  label: '후보 생성과 전체 폴백 양쪽에 자료 필터가 걸리는가 (실행 검사)',
  severity: 'guardrail',
  why: '후보 생성과 전체 폴백 중 한쪽만 고치는 것이 이 작업에서 가장 흔한 실수다. 정적 검사는 우회되기 쉬우니 실제로 폴백 경로를 강제로 태운다.'
}, (t) => {
  const quizSrc = read('js/quiz.js');
  if (!exists('data/subjects.js') || !/confusionSet|FQ\.subjects/.test(quizSrc)) {
    t.skip('data/subjects.js 가 없고 js/quiz.js 에 FQ.subjects·confusionSet 이 없다 — T7 미구현');
  }
  const files = ['js/util.js', 'js/storage.js', 'data/countries.js', 'data/subjects.js'];
  if (exists('data/confusion-groups.js')) files.push('data/confusion-groups.js');
  files.push('js/progress.js', 'js/quiz.js');
  const sb = loadInto(makeSandbox(), files);
  const FQ = sb.FQ;
  const full = FQ.countries.slice();

  for (const axis of ['place', 'symbol']) {
    const has = (code) => !!(FQ.subjects && FQ.subjects[code] && FQ.subjects[code][axis]);
    const withData = full.filter((c) => has(c.code));
    if (withData.length < 5) { t.note(axis + ' 축 자료가 5개국 미만이라 실행 검사를 건너뛴다'); continue; }
    const answer = withData[0];

    // ① 정상 경로
    let out = FQ.quiz.distractors(answer, 3, full, 'choice4', { axis: axis });
    for (const c of out) t.ok(has(c.code), axis + ' 축 정상 경로에서 자료 없는 나라가 보기로 올라왔다', c.code);

    // ② 폴백 강제 — all() 이 매 호출 FQ.countries 를 읽으므로 목록을 굶겨 폴백을 태운다
    const starved = withData.slice(0, 2).concat(full.filter((c) => !has(c.code)).slice(0, 4));
    FQ.countries = starved;
    try {
      out = FQ.quiz.distractors(answer, 3, starved, 'choice4', { axis: axis });
      for (const c of out) t.ok(has(c.code), axis + ' 축 폴백 경로에 자료 필터가 빠졌다 (한쪽만 고쳤다)', c.code);
    } finally {
      FQ.countries = full;
    }
  }

  // ③ 회귀 — opts 없이 부르던 기존 동작이 그대로인지
  const q = FQ.quiz.makeQuestion(full[0], 'choice4', full);
  t.ok(q.options && q.options.length === 4, '기존 makeQuestion 이 보기 4개를 주지 않는다', String(q.options && q.options.length));
  if (q.options) {
    t.ok(new Set(q.options.map((c) => c.code)).size === 4, '보기에 중복이 있다');
    t.ok(q.options.some((c) => c.code === full[0].code), '보기에 정답이 없다');
  }
});

await check({
  id: 'guard-raw-not-tracked',
  task: '금지 파생 (지도 T1-fetch-raw)',
  label: 'Natural Earth 원본이 git 에 추적되지 않는가',
  severity: 'guardrail',
  why: '이 저장소의 .git 은 이미 100MB 대다. 20MB GeoJSON 원본이 한 번 커밋되면 히스토리에서 되돌릴 수 없다.'
}, (t) => {
  if (!fs.existsSync(p('.git'))) t.skip('.git 이 없다 — git 추적 검사 불가');
  let tracked, dirty;
  try {
    tracked = git(['ls-files', '--', 'data/natural-earth']).trim();
    dirty = git(['status', '--porcelain', '--', 'data/natural-earth']).trim();
  } catch (e) {
    t.skip('git 명령을 쓸 수 없다: ' + e.message);
  }
  t.ok(tracked === '', 'Natural Earth 원본이 git 에 추적되고 있다', tracked.split('\n').join(', '));
  t.ok(dirty === '', 'data/natural-earth 에 커밋 대기 중인 변경이 있다', dirty.split('\n').join(', '));
  const heavy = git(['ls-files']).split('\n').filter((f) => /\.(geojson|shp|zip)$/i.test(f));
  t.ok(heavy.length === 0, '무거운 원본 파일이 추적되고 있다', heavy.join(', '));
});

/* ══════════════════════════════════════════════════════════════════════
   2부 — 완료 판정 (severity: acceptance) · 실패해도 종료 코드 0
   ══════════════════════════════════════════════════════════════════════ */

await check({
  id: 'export-json-roundtrip',
  task: 'T1-export-button',
  label: '기록 내보내기가 실제 저장분과 같은 문자열을 돌려주는가',
  severity: 'acceptance',
  why: '뒤의 모든 과제(스키마·캐시 변경)의 유일한 되돌릴 수단이다. 화면에 보여 준 것이 실제 저장된 것과 다르면 백업이 아니라 위안일 뿐이다.'
}, (t) => {
  const src = read('js/storage.js');
  if (!src.includes('exportJson')) t.skip('js/storage.js 에 exportJson 이 없다 — T1-export-button 미구현');
  t.ok(/function exportJson\(/.test(src), 'exportJson 함수 정의가 없다');
  const api = funcBody(src, 'FQ.storage =');
  t.ok(api && /\bexportJson\b/.test(api), 'FQ.storage 에 exportJson 이 노출되지 않았다');

  const sb = loadInto(makeSandbox(), ['js/util.js', 'js/storage.js']);
  const st = sb.FQ.storage;
  t.ok(typeof st.exportJson === 'function', 'FQ.storage.exportJson 이 함수가 아니다', typeof st.exportJson);
  if (typeof st.exportJson !== 'function') return;

  st.recordAnswer('kr', true);
  const text = st.exportJson();
  t.ok(typeof text === 'string', 'exportJson 이 문자열을 돌려주지 않는다', typeof text);
  let obj;
  try { obj = JSON.parse(text); } catch (e) { t.ok(false, 'exportJson 결과가 JSON 이 아니다', e.message); return; }
  for (const k of ['settings', 'stats', 'daily', 'countries', 'badges', 'history']) {
    t.ok(Object.hasOwn(obj, k), '내보낸 JSON 에 ' + k + ' 가 없다');
  }
  t.ok(obj.countries && obj.countries.kr && obj.countries.kr.correct === 1,
    '방금 기록한 답이 내보낸 JSON 에 없다');
  const stored = sb.__store.get('flagquiz.v1');
  t.ok(JSON.stringify(obj) === JSON.stringify(JSON.parse(stored)),
    '내보낸 내용이 실제 저장분과 다르다 — 백업이 아니다');

  // 시크릿 모드: getItem/setItem 이 던져도 버튼이 아이 앞에서 터지면 안 된다
  const blocked = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); }
  };
  const sb2 = loadInto(makeSandbox(blocked), ['js/util.js', 'js/storage.js']);
  let threw = null, out2 = null;
  try { out2 = sb2.FQ.storage.exportJson(); } catch (e) { threw = e; }
  t.ok(!threw, '저장소가 막힌 환경에서 exportJson 이 예외를 던진다', threw && threw.message);
  if (!threw) {
    let okParse = true;
    try { JSON.parse(out2); } catch (e) { okParse = false; }
    t.ok(okParse, '시크릿 모드에서 돌려준 값이 JSON 이 아니다');
  }
});

await check({
  id: 'export-roundtrip-restore',
  task: 'T1-export-button',
  label: '내보낸 JSON 으로 다른 브라우저에서 복원되는가',
  severity: 'acceptance',
  why: "'복사해 두면 되살릴 수 있다'가 실제로 성립하는지 고정한다."
}, (t) => {
  const src = read('js/storage.js');
  if (!src.includes('exportJson')) t.skip('js/storage.js 에 exportJson 이 없다 — T1-export-button 미구현');
  const a = loadInto(makeSandbox(), ['js/util.js', 'js/storage.js']);
  const A = a.FQ.storage;
  A.recordAnswer('kr', true); A.recordAnswer('jp', false); A.recordAnswer('us', true);
  A.awardBadge('first-win');
  A.finishGame({ seconds: 42, mode: 'choice4', total: 10, correct: 8, bestStreak: 4, players: ['민규'] });
  const text = A.exportJson();

  const store = new Map([['flagquiz.v1', text]]);
  const b = loadInto(makeSandbox(store), ['js/util.js', 'js/storage.js']);
  const B = b.FQ.storage;
  t.ok(JSON.stringify(B.allCountryStats()) === JSON.stringify(A.allCountryStats()), '복원한 나라별 기록이 다르다');
  t.ok(JSON.stringify(B.badges()) === JSON.stringify(A.badges()), '복원한 배지가 다르다');
  t.ok(JSON.stringify(B.history()) === JSON.stringify(A.history()), '복원한 놀이 기록이 다르다');
});

await check({
  id: 'export-screen-wiring',
  task: 'T1-export-button',
  label: '🏅 내 기록 화면 배선과 금지 API 미사용',
  severity: 'acceptance',
  why: 'JSON 을 innerHTML 로 보간하면 문자열 안의 </textarea> 가 화면을 깨고, <a download>·Blob·clipboard 는 홈화면 사파리와 file:// 에서 조용히 실패한다.'
}, (t) => {
  const src = read('js/screens.js');
  if (!src.includes('export')) t.skip("js/screens.js 에 'export' 문자열이 없다 — 화면 배선 미구현");
  t.ok(src.includes('id="export"'), 'id="export" 버튼이 없다');
  t.ok(src.includes('id="export-text"'), 'id="export-text" textarea 가 없다');
  t.ok(/export-text[^]{0,200}readonly|readonly[^]{0,200}export-text/.test(src), 'export-text 에 readonly 가 없다');
  t.ok(/\.value\s*=/.test(src), 'textarea 에 .value 로 넣는 대입이 없다 (innerHTML 보간이면 화면이 깨진다)');
  t.ok(!/\+\s*FQ\.storage\.exportJson\(\)/.test(src) && !/exportJson\(\)\s*\+/.test(src),
    'exportJson() 결과를 문자열 연결로 HTML 에 넣고 있다');
  for (const banned of ['<a download', 'URL.createObjectURL', 'new Blob', 'navigator.clipboard']) {
    t.ok(!src.includes(banned), '홈화면 사파리에서 조용히 실패하는 API 를 쓴다: ' + banned);
  }
});

await check({
  id: 'export-test-file',
  task: 'T1-export-button',
  label: 'tests/storage-export.test.mjs 신설과 통과',
  severity: 'acceptance',
  why: '이 회귀 검사가 없으면 뒤의 스키마 변경이 exportJson 을 조용히 깨뜨려도 아무도 모른다.'
}, (t) => {
  const rel = 'tests/storage-export.test.mjs';
  const src = readOrSkip(t, rel, 'T1-export-button 테스트');
  // 지침은 'app.test.mjs 에 끼워 넣지 마라' 였다. 전용 파일이 화면까지 함께 보는 것은 문제가 아니다.
  if (src.includes('js/screens.js')) t.note('이 전용 테스트는 js/screens.js 까지 로드해 화면 배선도 함께 본다 (app.test.mjs 는 로드하지 않는다)');
  let out = '', code = 0;
  try {
    out = execFileSync(process.execPath, ['--test', '--test-reporter=tap', rel], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    code = e.status ?? 1;
    out = (e.stdout || '') + (e.stderr || '');
  }
  t.ok(code === 0, rel + ' 가 실패한다', '종료 코드 ' + code);
  const m = /# pass (\d+)/.exec(out);
  t.ok(m && Number(m[1]) > 0, '전용 테스트의 통과 건수를 확인하지 못했다');
  t.note(rel + ' → ' + (m ? m[1] + '개 통과' : '통과 개수를 읽지 못함'));
});

await check({
  id: 'defaults-dev-object',
  task: 'T3-feature-flags',
  label: '기능 플래그가 settings.dev 객체 안에 있는가',
  severity: 'acceptance',
  why: 'settings 만 storage.js 의 Object.assign 특례로 기존 저장분에 백필된다. 최상위에 두면 저장은 되고 읽히지 않는다.'
}, (t) => {
  const src = readOrSkip(t, 'js/features.js', 'T3-feature-flags');
  const snap = defaultsSnapshot();
  t.ok(snap.settings && typeof snap.settings.dev === 'object' && snap.settings.dev !== null,
    'DEFAULTS.settings.dev 객체가 없다', 'typeof ' + typeof (snap.settings && snap.settings.dev));
  t.ok(/\bart\b/.test(src), 'js/features.js 의 DEFAULTS 에 art 키가 보이지 않는다');
  // 모듈 최상위에서 FQ.storage 를 부르면 로드 순서에 따라 undefined 를 읽는다
  let depth = 0, bad = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    else if (src.startsWith('FQ.storage', i) && depth <= 1) bad++;
  }
  t.ok(bad === 0, '모듈 최상위(함수 밖)에서 FQ.storage 를 호출한다 — 로드 순서에 따라 undefined 를 읽는다', bad + '곳');
});

await check({
  id: 'reset-covers-new-buckets',
  task: 'T5-record-axis',
  label: '새 최상위 버킷이 resetProgress 에도 들어갔는가',
  severity: 'acceptance',
  why: "새 버킷을 DEFAULTS 에만 넣고 resetProgress 에 빠뜨리면 '정리하기'를 눌러도 그 기록만 남아 다음 판 출제 가중치를 계속 오염시킨다."
}, (t) => {
  const snap = defaultsSnapshot();
  const BASE = ['settings', 'stats', 'daily', 'countries', 'badges', 'history'];
  const extra = Object.keys(snap).filter((k) => !BASE.includes(k));
  if (extra.length === 0) t.skip('DEFAULTS 최상위 키가 기존 6개 그대로다 — 새 버킷 미구현');
  const src = read('js/storage.js');
  const body = funcBody(src, 'function resetProgress');
  t.ok(body, 'resetProgress 본문을 찾지 못했다');
  if (!body) return;
  const reset = new Set((body.match(/state\.([A-Za-z_$][\w$]*)\s*=/g) || []).map((s) => /state\.([\w$]*)/.exec(s)[1]));
  for (const k of Object.keys(snap)) {
    if (k === 'settings') continue;
    t.ok(reset.has(k), "'정리하기'가 이 버킷을 비우지 않는다: " + k);
  }
  t.note('새 최상위 버킷: ' + extra.join(', ') + '\n      (모든 읽기가 (r.x||0) 으로 방어됐는지는 기계로 못 본다 — 사람이 읽는다)');
});

await check({
  id: 'map-coords-keyset',
  task: '지도 T4-emit-data · T6-tests',
  label: '지도 좌표가 194개국과 양방향으로 정확히 일치하는가',
  severity: 'acceptance',
  why: '한쪽 방향만 보면 대만·코소보 좌표가 조용히 남거나 몇 나라가 빠진 채 초록불이 된다.'
}, (t) => {
  const src = readOrSkip(t, 'data/map-coords.js', '지도 트랙');
  const ctx = { window: {} };
  vm.runInNewContext(read('data/countries.js'), ctx);
  vm.runInNewContext(src, ctx, { filename: 'data/map-coords.js' });
  const coords = ctx.window.FQ.mapCoords;
  t.ok(coords && typeof coords === 'object', 'FQ.mapCoords 가 없다');
  if (!coords) return;
  const codes = new Set(ctx.window.FQ.countries.map((c) => c.code));
  const keys = Object.keys(coords);
  t.ok(keys.length === 194, '좌표가 194개가 아니다', String(keys.length));
  const missing = [...codes].filter((c) => !Object.hasOwn(coords, c));
  t.ok(missing.length === 0, '좌표가 없는 나라', missing.join(', '));
  const orphan = keys.filter((k) => !codes.has(k));
  t.ok(orphan.length === 0, '194개국에 없는 좌표 키', orphan.join(', '));
  for (const d of DISPUTED) t.ok(!Object.hasOwn(coords, d), '뺀 나라의 좌표가 남아 있다: ' + d);
  t.ok(/window\.FQ\s*=\s*window\.FQ\s*\|\|\s*\{\};/.test(src), '방어줄 window.FQ = window.FQ || {}; 가 없다');
  const size = fs.statSync(p('data/map-coords.js')).size;
  t.ok(size < 12 * 1024, '파일이 12KB 이상이다', size + 'B');
  const order = (src.match(/^\s*['"]?([a-z]{2})['"]?\s*:/gm) || []).map((s) => /([a-z]{2})/.exec(s)[1]);
  t.ok(order.length === 194, '키가 한 줄에 하나씩 194줄이 아니다', order.length + '줄');
  t.ok(order.join(',') === order.slice().sort().join(','), '좌표 키가 사전순이 아니다 — 손보정 diff 가 194줄로 번진다');
});

await check({
  id: 'map-coords-values',
  task: '지도 T4-emit-data · T6-tests',
  label: '좌표가 [lng, lat] 순서·범위·소수 2자리를 지키는가',
  severity: 'acceptance',
  why: '[lat,lng] 로 뒤집히면 지도가 조용히 90도 돌아간 모양이 되고 테스트는 초록불이다. toFixed 를 Number() 로 감싸지 않으면 문자열이 들어가 렌더링 시점에 터진다.'
}, (t) => {
  readOrSkip(t, 'data/map-coords.js', '지도 트랙');
  const ctx = { window: {} };
  vm.runInNewContext(read('data/countries.js'), ctx);
  vm.runInNewContext(read('data/map-coords.js'), ctx);
  const coords = ctx.window.FQ.mapCoords || {};
  for (const [code, v] of Object.entries(coords)) {
    if (!Array.isArray(v) || v.length !== 2) { t.ok(false, '좌표가 길이 2 배열이 아니다: ' + code, JSON.stringify(v)); continue; }
    const [lng, lat] = v;
    if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat)) {
      t.ok(false, '좌표가 유한한 수가 아니다 (toFixed 문자열이 샜을 수 있다): ' + code, JSON.stringify(v)); continue;
    }
    t.ok(lng >= -180 && lng <= 180, 'lng 범위를 벗어났다: ' + code, String(lng));
    t.ok(lat >= -90 && lat <= 90, 'lat 범위를 벗어났다 ([lat,lng] 로 뒤집혔을 수 있다): ' + code, String(lat));
    t.ok(Number(lng.toFixed(2)) === lng && Number(lat.toFixed(2)) === lat, '소수 2자리가 아니다: ' + code, JSON.stringify(v));
  }
  const SAMPLES = {
    kr: [[124, 132], [33, 39]],
    au: [[112, 154], [-44, -10]],
    br: [[-74, -34], [-34, 5]],
    va: [[12.428, 12.439], [41.898, 41.906]],
    ru: [[30, 100], [40, 78]]
  };
  for (const [code, [lngR, latR]] of Object.entries(SAMPLES)) {
    const v = coords[code];
    if (!Array.isArray(v)) { t.ok(false, '표본 좌표가 없다: ' + code); continue; }
    t.ok(v[0] >= lngR[0] && v[0] <= lngR[1], '표본 lng 가 상식 밖이다 (축 뒤집힘·부호 반전): ' + code, JSON.stringify(v));
    t.ok(v[1] >= latR[0] && v[1] <= latR[1], '표본 lat 가 상식 밖이다: ' + code, JSON.stringify(v));
  }
});

await check({
  id: 'map-shapes-no-borders',
  task: '지도 T3-simplify-silhouette · T4-emit-data',
  label: '육지 실루엣이 나라별로 쪼개지지 않았는가 (국경선 데이터 금지)',
  severity: 'acceptance',
  why: "나라별 키로 쪼개는 순간 그것이 국경 데이터가 되고, '땅만 그리고 국경선은 그리지 않는다' 방침이 문서만 남고 무너진다."
}, (t) => {
  const src = readOrSkip(t, 'data/map-shapes.js', '지도 트랙');
  const ctx = { window: {} };
  vm.runInNewContext(src, ctx, { filename: 'data/map-shapes.js' });
  const land = ctx.window.FQ.mapLand;
  t.ok(land && typeof land === 'object', 'FQ.mapLand 가 없다');
  if (!land) return;
  t.ok(Object.keys(land).sort().join(',') === 'd,viewBox',
    "mapLand 에 나라별 키가 있다 — 그것이 국경 데이터다", Object.keys(land).sort().join(','));
  t.ok(land.viewBox === '0 0 2000 1000', 'viewBox 가 다르다', String(land.viewBox));
  t.ok(typeof land.d === 'string', 'd 가 문자열이 아니다', typeof land.d);
  if (typeof land.d !== 'string') return;
  t.ok(land.d.length < 400000, 'd 가 너무 길다', land.d.length + '자');
  t.ok(land.d.includes('M'), 'd 에 M 명령이 없다');
  const size = fs.statSync(p('data/map-shapes.js')).size;
  t.ok(size < 250 * 1024, '파일이 250KB 이상이다', size + 'B');

  const body = src.replace(/^\s*\/\*[\s\S]*?\*\//, '');
  t.ok(!/["']?[a-z]{2}["']?\s*:\s*['"]M/.test(body), '나라 코드 키로 쪼갠 경로가 있다');
  for (const word of ['ADMIN', 'France', 'Russia', 'Taiwan', 'Korea']) {
    t.ok(!body.includes(word), '실루엣 파일에 나라 이름이 들어 있다: ' + word);
  }

  const subs = parsePathData(land.d);
  readOrSkip(t, 'data/map-coords.js', '지도 트랙');
  vm.runInNewContext(read('data/map-coords.js'), ctx, { filename: 'data/map-coords.js' });
  verifyMapGeometry(t, land, ctx.window.FQ.mapCoords || {});
  let outOfRange = 0, notRounded = 0, crossing = 0, tooShort = 0, seams = 0;
  for (const pts of subs) {
    if (pts.length < 4) tooShort++;
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      if (x < 0 || x > 2000 || y < 0 || y > 1000) outOfRange++;
      if (Number(x.toFixed(1)) !== x || Number(y.toFixed(1)) !== y) notRounded++;
      if (i > 0 && Math.abs(x - pts[i - 1][0]) >= 1000) {
        const [px, py] = pts[i - 1];
        // 남극처럼 지도 바닥/천장을 따라 x=0 ↔ x=2000 을 잇는 가장자리 이음새는 정상이다.
        const edgeSeam = (px === 0 || px === 2000) && (x === 0 || x === 2000) && py === y;
        if (!edgeSeam) crossing++; else seams++;
      }
    }
  }
  t.ok(outOfRange === 0, 'viewBox 밖 좌표가 있다', outOfRange + '개');
  t.ok(notRounded === 0, '소수 1자리가 아닌 좌표가 있다', notRounded + '개');
  t.ok(crossing === 0, '지도를 가로지르는 선이 있다 (날짜변경선 처리 누락)', crossing + '곳');
  t.note('서브패스 ' + subs.length + '개 · 가장자리 이음새 ' + seams + '곳(남극 바닥 등, 정상으로 셈)');
  t.ok(tooShort === 0, '점이 4개 미만인 서브패스가 있다', tooShort + '개');

  // 사람이 눈으로 볼 미리보기를 만들어 둔다
  const out = path.join(os.tmpdir(), 'flagquiz-map-preview.html');
  fs.writeFileSync(out,
    '<!doctype html><meta charset="utf-8"><title>육지 실루엣 미리보기</title>' +
    '<body style="margin:0;background:#dff"><svg viewBox="' + land.viewBox + '" width="100%">' +
    '<path d="' + land.d + '" fill="#cfe3c8" stroke="none"/></svg>');
  t.note('육안 확인용 미리보기를 만들었다: ' + out);
});

await check({
  id: 'new-file-registration',
  task: '지도 T5-register · T3-feature-flags · T4-subjects-data',
  label: '⚠ 새 데이터/스크립트가 index.html·sw.js SHELL·build-site.mjs·tests 로더에 빠짐없이 등록됐는가',
  severity: 'acceptance',
  why: '한 곳만 빠지면 증상이 전부 다르고 전부 늦게 발견된다 — 화면에 안 뜸 / 아이패드 비행기 모드에서만 깨짐 / 배포본에만 없음(테스트는 초록불) / 검사가 그 파일을 못 읽음.'
}, (t) => {
  const newFiles = newScriptFiles();
  if (newFiles.length === 0) t.skip('js/·data/ 에 새 스크립트 파일이 없다 — 등록할 것이 아직 없다');
  const html = read('index.html');
  const shell = shellList() || [];
  const buildSrc = read('scripts/build-site.mjs');
  const buildFiles = (/const files = \[([^\]]*)\]/.exec(buildSrc) || [, ''])[1];
  const runSrc = read('tests/run.mjs');
  const loader = (/for \(const file of \[([^\]]*)\]/.exec(runSrc) || [, ''])[1];

  for (const f of newFiles) {
    t.ok(html.includes('<script src="' + f + '"></script>'),
      'index.html 에 <script src="' + f + '"></script> 를 더해야 한다 (없으면 화면에 안 뜬다)');
    t.ok(shell.includes('./' + f),
      "sw.js 의 SHELL 배열에 './" + f + "' 를 더해야 한다 (없으면 아이패드 비행기 모드에서만 깨진다)");
    if (f.startsWith('data/')) {
      t.ok(buildFiles.includes("'" + f + "'"),
        "scripts/build-site.mjs 의 const files 배열에 '" + f + "' 를 더해야 한다 (없으면 배포본에만 없어 아이패드가 흰 화면이다)");
    }
    t.ok(loader.includes("'" + f + "'"),
      "tests/run.mjs 의 로더 배열에 '" + f + "' 를 더해야 한다 (없으면 검사가 그 파일을 아예 못 읽는다)");
    if (exists('tests/app.test.mjs')) {
      t.note(f + ' — tests/app.test.mjs 로더에도 ' + (read('tests/app.test.mjs').includes(f) ? '있다' : '없다 (참고)'));
    }
  }
  t.note('새로 발견한 스크립트: ' + newFiles.join(', '));
});

await check({
  id: 'sw-shell-files-exist',
  task: '지도 T5-register · T4-subjects-data',
  label: 'SHELL 에 적힌 파일이 전부 실제로 존재하는가',
  severity: 'acceptance',
  why: 'install 의 cache.addAll(SHELL) 은 목록 중 하나만 실패해도 전체 설치가 실패한다 — 서비스워커가 아예 설치되지 않아 오프라인이 통째로 죽는다.'
}, (t) => {
  const shell = shellList();
  t.ok(shell, 'sw.js 에서 SHELL 배열을 떼어 내지 못했다');
  if (!shell) return;
  for (const item of shell) {
    if (item === './') continue;
    const rel = item.replace(/^\.\//, '');
    t.ok(exists(rel), 'SHELL 에 이름만 있고 파일이 없다 — 서비스워커 설치가 통째로 실패한다', item);
  }
  const missing = indexScripts().filter((s) => !shell.includes('./' + s));
  t.ok(missing.length === 0, 'index.html 이 읽는데 SHELL 에 없는 스크립트가 있다 (오프라인에서만 깨진다)', missing.join(', '));
  t.note('SHELL 항목 ' + shell.length + '개 / index.html script ' + indexScripts().length + '개');
});

await check({
  id: 'index-script-order',
  task: '지도 T5-register · T4-subjects-data · T3-feature-flags',
  label: '새 data/*.js 가 이를 읽는 스크립트보다 먼저 로드되는가',
  severity: 'acceptance',
  why: '전역 window.FQ 에 얹히는 정적 자료라 순서가 어긋나면 js/quiz.js·js/progress.js 가 undefined 를 읽는다. 브라우저에서만 나는 버그라 노드 테스트로는 안 잡힌다.'
}, (t) => {
  const newFiles = newScriptFiles();
  const newData = newFiles.filter((f) => f.startsWith('data/'));
  const hasFeatures = exists('js/features.js');
  if (newData.length === 0 && !hasFeatures) t.skip('새 data/*.js 도 js/features.js 도 없다');
  const list = indexScripts();
  const at = (f) => list.indexOf(f);
  for (const f of newData) {
    const i = at(f);
    t.ok(i !== -1, 'index.html 에 ' + f + ' 가 없다');
    if (i === -1) continue;
    t.ok(i > at('data/countries.js'), f + ' 가 data/countries.js 보다 먼저 로드된다');
    for (const reader of ['js/progress.js', 'js/quiz.js']) {
      if (at(reader) !== -1) t.ok(i < at(reader), f + ' 가 ' + reader + ' 보다 뒤에 로드된다 — undefined 를 읽는다');
    }
  }
  if (hasFeatures) {
    const i = at('js/features.js');
    t.ok(i !== -1, 'index.html 에 js/features.js 가 없다');
    if (i !== -1) t.ok(i === at('js/storage.js') + 1, 'js/features.js 는 js/storage.js 바로 뒤여야 한다', '현재 ' + i + '번째');
  }
  t.note('현재 로드 순서: ' + list.join(' → '));
});

await check({
  id: 'sw-buckets-split',
  task: 'T2-sw-cache-buckets',
  label: '캐시 버킷 4개 분리가 끝났는가',
  severity: 'acceptance',
  why: "Codex 가 스스로 미완이라고 보고한 과제다. 다만 절반만 들어간 상태(VERSION 은 지웠는데 화이트리스트를 안 넣은 경우)는 새 버킷들이 서로를 지우는 가장 위험한 상태라 구분해서 본다."
}, (t) => {
  const src = read('sw.js');
  if (/var\s+VERSION\s*=/.test(src)) t.skip('sw.js 에 var VERSION 선언이 그대로 있다 — T2 미구현 (Codex 보고와 일치)');
  for (const name of ['SHELL_CACHE', 'FLAG_CACHE', 'ART_CACHE', 'AUDIO_CACHE']) {
    t.ok(src.includes(name), '버킷 상수가 없다: ' + name);
  }
  t.ok(/var\s+KEEP\s*=\s*\[/.test(src), 'KEEP 화이트리스트 배열이 없다 — 새 버킷들이 서로를 지운다');
  t.ok(/KEEP\.indexOf\(k\)\s*===\s*-1/.test(src), '정리 로직이 화이트리스트 형태가 아니다');
  const globalMatch = src.split('\n').filter((l) => /(^|[^.\w])caches\.match\(/.test(l));
  t.ok(globalMatch.length === 0,
    '전역 caches.match( 가 남아 있다 — 레거시 버킷의 옛 index.html 이 오프라인에서 새 셸을 덮어쓴다',
    globalMatch.length + '곳');
  const swTest = exists('tests/sw.test.mjs') ? read('tests/sw.test.mjs') : '';
  t.ok(/SHELL_CACHE|AUDIO_CACHE|flagquiz-shell|flagquiz-audio/.test(swTest),
    'tests/sw.test.mjs 가 새 이름 체계로 갱신되지 않았다');
});

await check({
  id: 'images-folder-shape',
  task: 'T4-subjects-data · T8-test-gates',
  label: '그림이 images/symbols·images/places 밖으로 새지 않았는가',
  severity: 'acceptance',
  why: '폴더 이름이 한 곳만 어긋나면 build-site.mjs 폴더 목록·serve.mjs MIME·ui.js 경로 함수가 서로 다른 곳을 가리킨다.'
}, (t) => {
  if (!exists('images')) t.skip('images/ 폴더가 없다 — T4/T13 미구현');
  const { codes } = countryCodes();
  const dirs = fs.readdirSync(p('images'), { withFileTypes: true });
  const counts = { symbols: 0, places: 0 };
  for (const d of dirs) {
    if (!d.isDirectory()) { t.ok(false, 'images/ 바로 아래에 파일이 있다', d.name); continue; }
    t.ok(['symbols', 'places'].includes(d.name), 'images/ 아래에 약속 밖 폴더가 있다', d.name);
    if (!['symbols', 'places'].includes(d.name)) continue;
    for (const f of fs.readdirSync(p('images', d.name))) {
      if (f === '.gitkeep') continue;
      if (!f.endsWith('.webp')) { t.ok(false, '.webp 가 아닌 파일', 'images/' + d.name + '/' + f); continue; }
      counts[d.name]++;
      t.ok(codes.has(f.slice(0, -5)), '194개 code 에 없는 그림', 'images/' + d.name + '/' + f);
    }
  }
  t.ok(read('scripts/build-site.mjs').includes("'images'"), "build-site.mjs 폴더 목록에 'images' 가 없다 — 배포본에 그림이 빠진다");
  t.ok(read('scripts/serve.mjs').includes("'.webp'"), "scripts/serve.mjs 의 TYPES 에 '.webp' 가 없다 — 로컬에서 그림이 안 뜬다");
  t.note('진행률: 상징물 ' + counts.symbols + '/194, 명소 ' + counts.places + '/148');
});

await check({
  id: 'ci-scripts-unchanged',
  task: '지도 T1-fetch-raw',
  label: 'build·test 스크립트 불변 (CI 가 네트워크를 타지 않는가)',
  severity: 'acceptance',
  why: 'map:fetch·map:build 를 build 나 test 에 엮는 순간 CI 가 매번 외부 네트워크를 타고, 실패하면 main 배포가 통째로 멈춘다.'
}, (t) => {
  const pkg = JSON.parse(read('package.json'));
  t.ok(pkg.scripts.build === 'npm run voice:check && node scripts/build-site.mjs',
    'build 스크립트가 바뀌었다', JSON.stringify(pkg.scripts.build));
  t.ok(pkg.scripts.test === 'node tests/run.mjs && node --test tests/*.test.mjs',
    'test 스크립트가 바뀌었다 (검사 범위를 좁혀 초록불을 만드는 우회를 막는다)', JSON.stringify(pkg.scripts.test));
  for (const key of ['build', 'test']) {
    for (const bad of ['map:fetch', 'map:build', 'natural-earth']) {
      t.ok(!String(pkg.scripts[key]).includes(bad), key + ' 스크립트가 ' + bad + ' 를 부른다');
    }
  }
  if (exists('.github/workflows')) {
    for (const f of fs.readdirSync(p('.github/workflows'))) {
      const src = fs.readFileSync(p('.github/workflows', f), 'utf8');
      for (const bad of ['map:fetch', 'map:build', 'natural-earth']) {
        t.ok(!src.includes(bad), '.github/workflows/' + f + ' 가 네트워크를 타는 ' + bad + ' 를 부른다');
      }
    }
  }
  for (const f of fs.readdirSync(p('tests'))) {
    t.ok(!fs.readFileSync(p('tests', f), 'utf8').includes('natural-earth'),
      'tests/' + f + ' 가 원본 geojson 에 기댄다 — 원본 없이 npm test 가 성립해야 한다');
  }
});

await check({
  id: 'fetch-script-and-ignore',
  task: '지도 T1-fetch-raw',
  label: 'fetch-map-source.mjs · .gitignore · map:fetch 등록',
  severity: 'acceptance',
  why: '태그를 안 박으면 몇 달 뒤 같은 명령이 다른 좌표를 만들고, .gitignore 가 없으면 다음 과제에서 20MB 원본이 실수로 커밋된다.'
}, (t) => {
  const src = readOrSkip(t, 'scripts/fetch-map-source.mjs', '지도 T1-fetch-raw');
  t.ok(src.includes('natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson'),
    '버전 태그가 박힌 URL 이 없다');
  t.ok(!/\/master\//.test(src), 'master 를 참조한다 — 몇 달 뒤 다른 좌표가 나온다');
  t.ok(src.includes('data/natural-earth'), '저장 경로 data/natural-earth 가 없다');
  const sha = /EXPECTED_SHA256\s*=\s*['"]([a-f0-9]+)['"]/.exec(src);
  t.ok(sha && /^[a-f0-9]{64}$/.test(sha[1]), 'EXPECTED_SHA256 상수가 없거나 형식이 다르다');
  t.ok(/process\.exit\(1\)|exitCode\s*=\s*1/.test(src), '해시 불일치 시 exit 1 하는 경로가 없다');
  t.ok(!/\.shp|\.zip/.test(src), 'shp·zip 을 받는 코드가 있다');
  const imports = src.match(/^import .*?from ['"]([^'"]+)['"]/gm) || [];
  for (const line of imports) {
    const mod = /from ['"]([^'"]+)['"]/.exec(line)[1];
    t.ok(mod.startsWith('node:'), '외부 의존성을 쓴다 (의존성 0 원칙)', mod);
  }
  t.ok(read('.gitignore').split('\n').some((l) => l.trim() === 'data/natural-earth/'),
    '.gitignore 에 data/natural-earth/ 줄이 없다');
  const pkg = JSON.parse(read('package.json'));
  t.ok(pkg.scripts['map:fetch'] === 'node scripts/fetch-map-source.mjs', 'package.json 에 map:fetch 가 없다');
  t.note('네트워크는 타지 않았다 — 실제 다운로드는 이 검사가 하지 않는다');
});

await check({
  id: 'join-module-shape',
  task: '지도 T2-code-join',
  label: 'ne-join.mjs 모듈 형태 · 폴백 순서 · 두 상수',
  severity: 'acceptance',
  why: '폴백 순서를 뒤집으면 엉뚱한 나라에 붙고, 194개를 하드코딩하면 countries.js 와 조용히 어긋난다.'
}, (t) => {
  const src = readOrSkip(t, 'scripts/lib/ne-join.mjs', '지도 T2-code-join');
  t.ok(/export function joinFeatures/.test(src), 'export function joinFeatures 가 없다');
  // 후보 배열 한 줄 안에서 순서를 본다. 파일 전체 indexOf 는 ISO_A2 가 ISO_A2_EH 에 먼저 걸린다.
  const cand = /\[\s*[\w.]*\bISO_A2_EH\b[\s\S]{0,120}?\]/.exec(src);
  t.ok(cand, '세 속성을 순서대로 늘어놓은 후보 배열을 찾지 못했다');
  if (cand) {
    const o = ['ISO_A2_EH', 'ISO_A2', 'WB_A2'].map((k) => new RegExp('\\b' + k + '\\b').exec(cand[0]));
    t.ok(o.every(Boolean), '후보 배열에 세 속성이 모두 없다', cand[0].replace(/\s+/g, ' '));
    if (o.every(Boolean)) {
      t.ok(o[0].index < o[1].index && o[1].index < o[2].index,
        '폴백 순서가 ISO_A2_EH → ISO_A2 → WB_A2 가 아니다', cand[0].replace(/\s+/g, ' '));
    }
  }
  t.ok(/\/\^\[A-Z\]\{2\}\$\//.test(src), "코드 형식 검사가 없다 (=== '-99' 만 비교하면 숫자 -99 를 놓친다)");
  t.ok(src.includes('CODE_OVERRIDES'), 'CODE_OVERRIDES 상수가 없다');
  // Object.freeze([...]) 로 감싼 형태도 받는다
  const ex = /EXCLUDED_ADMINS\s*=\s*(?:Object\.freeze\(\s*)?\[([\s\S]*?)\]/.exec(src);
  t.ok(ex, 'EXCLUDED_ADMINS 상수가 없다 — 상위 NE 버전에서 도형이 늘어도 지나간다');
  if (ex) {
    const items = ex[1].match(/'[^']*'|"[^"]*"/g) || [];
    t.ok(items.length > 0, 'EXCLUDED_ADMINS 가 비어 있다 — 상위 NE 버전에서 도형이 늘어도 지나간다');
    // 개수는 사람이 고르는 값이 아니라 원본이 정하는 값이다. 194 + N = 원본 도형 수가 맞는지는
    // 원본을 받아 join-real-source 가 산술로 확인한다. 여기서는 숫자를 보여 주기만 한다.
    t.note('EXCLUDED_ADMINS ' + items.length + '개 (194 + ' + items.length + ' = ' + (194 + items.length) +
      ' 도형). 인계 명세는 46을 예상했다 — 산술 검증은 `npm run map:fetch` 뒤 --deep 에서 한다');
    const lines = ex[1].split('\n').filter((l) => /['"]/.test(l));
    const noComment = lines.filter((l) => !l.includes('//'));
    t.ok(noComment.length === 0, '배제 사유 주석이 없는 줄이 있다', noComment.length + '줄');
  }
  const lits = (src.match(/'[a-z]{2}'/g) || []).length;
  t.ok(lits < 50, '2자 코드 리터럴이 ' + lits + '개다 — 194개 하드코딩이 의심된다');
  t.ok(src.includes('countries.js'), '정답 집합을 data/countries.js 에서 읽지 않는다');
});

await check({
  id: 'join-synthetic-unit',
  task: '지도 T2-code-join',
  label: '조인 함수 단위 검사 (원본 없이 실행)',
  severity: 'acceptance',
  why: '폴백이 실제로 작동하는지와 세 종류 실패가 각각 다른 메시지로 터지는지는 20MB 원본 없이도 확인할 수 있어야 한다. 조인은 여기서 터지게 만드는 것이 목적이다.'
}, async (t) => {
  readOrSkip(t, 'scripts/lib/ne-join.mjs', '지도 T2-code-join');
  const mod = await import('../scripts/lib/ne-join.mjs');
  t.ok(typeof mod.joinFeatures === 'function', 'joinFeatures 를 export 하지 않는다');
  if (typeof mod.joinFeatures !== 'function') return;
  const { codes } = countryCodes();
  const list = [...codes];
  const make = (code, extra) => ({
    properties: Object.assign({ ISO_A2_EH: code.toUpperCase(), ADMIN: 'X' + code }, extra)
  });
  // no·fr 은 ISO_A2 가 '-99'(문자열)·-99(숫자)라 ISO_A2_EH 로만 잡혀야 한다
  const base = list.map((c) => make(c, c === 'no' ? { ISO_A2: '-99' } : c === 'fr' ? { ISO_A2: -99 } : {}));

  const good = mod.joinFeatures(base, list);
  t.ok(good.matched.size === 194, '합성 원본 194개가 전부 매칭되지 않는다', String(good.matched.size));
  t.ok(good.excluded.length === 0, '합성 원본에서 배제가 생겼다', String(good.excluded.length));
  t.ok(good.matched.has('no') && good.matched.has('fr'), "ISO_A2 가 '-99'·-99 인 나라가 폴백으로 잡히지 않는다");

  const messages = [];
  const expectThrow = (label, features, keyword) => {
    let msg = null;
    try { mod.joinFeatures(features, list); } catch (e) { msg = e.message; }
    t.ok(msg !== null, label + ' 인데 조인이 그냥 통과한다 (여기서 터져야 한다)');
    if (msg !== null) {
      t.ok(msg.includes(keyword), label + ' 메시지에 ' + keyword + ' 가 없다', msg.split('\n')[0].slice(0, 80));
      messages.push(msg);
    }
  };
  expectThrow('한 나라가 빠짐', base.filter((x) => x.properties.ADMIN !== 'Xkr'), '매칭 안 된');
  expectThrow('배제 목록에 없는 무코드 도형', base.concat([{ properties: { ADMIN: 'Neverland' } }]), '미분류');
  expectThrow('같은 코드 두 번', base.concat([make('kr')]), '중복');
  t.ok(new Set(messages).size === messages.length, '세 실패의 메시지가 서로 구별되지 않는다');
});

await check({
  id: 'join-real-source',
  task: '지도 T2-code-join',
  label: 'v5.1.2 원본 전수 조인 194개 일치',
  severity: 'acceptance',
  why: '조인이 190개만 맞춰도 조용히 성공하면 그 사실이 T6 테스트까지 가서야 드러난다. matched + excluded = 전체 도형 산술이 여기서 닫힌다.'
}, async (t) => {
  readOrSkip(t, 'scripts/lib/ne-join.mjs', '지도 T2-code-join');
  const raw = 'data/natural-earth/ne_50m_admin_0_countries.geojson';
  if (!exists(raw)) {
    t.skip('원본 미보유 — `npm run map:fetch` 로 내려받은 뒤 다시 돌린다 (이 검사는 네트워크를 타지 않는다)');
  }
  const mod = await import('../scripts/lib/ne-join.mjs');
  const { codes } = countryCodes();
  const features = JSON.parse(read(raw)).features;
  const r = mod.joinFeatures(features, [...codes]);
  t.ok(r.matched.size === 194, '원본 조인이 194개가 아니다', String(r.matched.size));
  const missing = [...codes].filter((c) => !r.matched.has(c));
  t.ok(missing.length === 0, '원본에서 못 찾은 나라', missing.join(', '));
  const orphan = [...r.matched.keys()].filter((c) => !codes.has(c));
  t.ok(orphan.length === 0, '194개국에 없는 코드가 매칭됐다', orphan.join(', '));
  t.ok(r.matched.size + r.excluded.length === features.length,
    'matched + excluded 가 전체 도형 수와 다르다 — 조용히 사라진 도형이 있다',
    r.matched.size + ' + ' + r.excluded.length + ' ≠ ' + features.length);
  for (const c of ['no', 'fr']) {
    const f = r.matched.get(c);
    t.ok(f, '폴백으로 잡혀야 할 나라가 없다: ' + c);
    if (f) t.note(c + ' 의 원본 ISO_A2 = ' + JSON.stringify(f.properties.ISO_A2) + ' (ISO_A2_EH 폴백이 작동했다)');
  }
  const excludedNames = new Set(r.excluded.map((f) => f.properties && f.properties.ADMIN));
  for (const name of ['Taiwan', 'Palestine', 'Kosovo', 'Western Sahara']) {
    t.ok(excludedNames.has(name), '견해가 갈리는 지역이 배제 목록에 없다: ' + name);
  }
  t.note('원본 도형 ' + features.length + '개 = 매칭 ' + r.matched.size + ' + 배제 ' + r.excluded.length);
});

await check({
  id: 'simplify-iterative',
  task: '지도 T3-simplify-silhouette',
  label: 'Douglas-Peucker 비재귀 구현 · 의존성 0',
  severity: 'acceptance',
  why: '재귀로 쓰면 러시아 최대 링(수만 점)에서 콜스택이 넘쳐 파이프라인이 통째로 멈춘다. tol=0 항등성은 구현이 점을 몰래 버리지 않는다는 증거다.'
}, async (t) => {
  const src = readOrSkip(t, 'scripts/lib/simplify.mjs', '지도 T3-simplify-silhouette');
  const names = (src.match(/export function ([A-Za-z_$][\w$]*)/g) || []).map((s) => s.split(' ').pop());
  t.ok(names.length > 0, 'export function 이 없다');
  for (const n of names) {
    const body = funcBody(src, 'export function ' + n);
    if (body) t.ok(!new RegExp('\\b' + n + '\\s*\\(').test(body), n + ' 이 자기 자신을 부른다 (재귀 — 큰 링에서 콜스택이 넘친다)');
  }
  t.ok(/while\s*\(/.test(src) && /\.pop\(\)/.test(src) && /\.push\(/.test(src),
    '명시적 스택(while + push/pop)이 보이지 않는다');
  t.ok(!/Math\.sin|haversine/i.test(src), '구면거리 계산이 있다 (평면 근사면 충분하다)');
  const imports = src.match(/^import .*?from ['"]([^'"]+)['"]/gm) || [];
  for (const line of imports) {
    const mod = /from ['"]([^'"]+)['"]/.exec(line)[1];
    t.ok(mod.startsWith('node:') || mod.startsWith('.'), '외부 의존성을 쓴다', mod);
  }
  const mod = await import('../scripts/lib/simplify.mjs');
  const fn = mod.simplify;
  t.ok(typeof fn === 'function', 'simplify 를 export 하지 않는다');
  if (typeof fn !== 'function') return;
  // 항등성: tol=0 이면 점을 하나도 버리지 않아야 한다
  const ring = [];
  for (let i = 0; i < 1000; i++) ring.push([Math.sin(i) * 50, Math.cos(i * 1.7) * 30]);
  t.ok(fn(ring, 0).length === ring.length, 'tol=0 인데 점이 줄었다 (구현이 점을 몰래 버린다)',
    fn(ring, 0).length + ' / ' + ring.length);
  // 대용량: 콜스택이 넘치면 안 되고, 실제로 줄어야 한다
  const big = [];
  for (let i = 0; i < 50000; i++) big.push([i * 0.001, Math.sin(i * 0.01) * 0.2]);
  let out = null, err = null;
  try { out = fn(big, 0.7); } catch (e) { err = e; }
  t.ok(!err, '5만 점에서 터진다 (재귀 구현이면 콜스택이 넘친다)', err && err.message);
  if (out) t.ok(out.length < big.length * 0.2, '5만 점이 20% 미만으로 줄지 않았다', out.length + '점');
  // 닫힌 링은 닫힌 채로 나와야 한다
  const closed = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const cout = fn(closed, 0.1);
  t.ok(cout[0][0] === cout[cout.length - 1][0] && cout[0][1] === cout[cout.length - 1][1],
    '닫힌 링이 열린 채로 나왔다', JSON.stringify(cout));
});

await check({
  id: 'buildmap-silhouette-rules',
  task: '지도 T3-simplify-silhouette · T4-emit-data',
  label: 'build-map.mjs 의 실루엣 생성 규칙과 라벨 검증',
  severity: 'acceptance',
  why: '내부 링을 살려두면 레소토·산마리노·바티칸 자리에 흰 구멍이 뚫리고, 작은 나라 링 보존 예외가 없으면 싱가포르·바티칸이 지도에서 사라진다.'
}, async (t) => {
  const src = readOrSkip(t, 'scripts/build-map.mjs', '지도 T3/T4');
  const headers = Object.fromEntries(['data/map-coords.js', 'data/map-shapes.js']
    .filter(exists).map(file => [file, headerComment(read(file))]));
  verifyMapTolerance(t, src, headers);
  t.ok(/rings\[0\]|\[0\]/.test(src), '외곽 링만 쓰는 흔적이 없다 — 내부 링을 살리면 흰 구멍이 뚫린다');
  // 도형 분기는 scripts/lib/ 로 빠져 있을 수 있다 — 지도 파이프라인 전체에서 찾는다
  const pipeline = ['scripts/build-map.mjs', 'scripts/lib/simplify.mjs', 'scripts/lib/ne-join.mjs']
    .filter(exists).map(read).join('\n');
  t.ok(pipeline.includes('MultiPolygon') && pipeline.includes('Polygon'), 'MultiPolygon/Polygon 분기가 없다');
  t.ok(/throw/.test(pipeline), '예상 밖 형태에서 멈추는 throw 가 없다');
  t.ok(/180/.test(src), '날짜변경선 검사(경도 차 180)가 보이지 않는다');
  const { buildLand } = await import('./build-map.mjs');
  verifySmallLandPreservation(t, buildLand);
  t.ok(/process\.exit\(1\)|exitCode\s*=\s*1/.test(src), '누락 시 exit 1 하는 경로가 없다');
  t.ok(src.includes('2000') && src.includes('1000'), '좌표 변환식의 2000·1000 이 없다');
  t.ok(/toFixed\(1\)/.test(src), 'toFixed(1) 이 없다');
  t.ok(!/lat\s*<\s*-6\d/.test(src), '남극을 자르는 위도 필터가 있다');
  t.ok(src.includes('LABEL_X') && src.includes('LABEL_Y'), 'LABEL_X/LABEL_Y 를 쓰지 않는다');
  t.ok(src.includes('LABEL_OVERRIDES'), 'LABEL_OVERRIDES 상수가 없다');
  t.ok(/Number\(\s*[\w.[\]]+\.toFixed\(2\)\s*\)/.test(src), 'Number(x.toFixed(2)) 형태의 반올림이 없다');
  const imports = src.match(/^import .*?from ['"]([^'"]+)['"]/gm) || [];
  for (const line of imports) {
    const mod = /from ['"]([^'"]+)['"]/.exec(line)[1];
    t.ok(mod.startsWith('node:') || mod.startsWith('.'), '외부 의존성을 쓴다', mod);
  }
  const pkg = JSON.parse(read('package.json'));
  t.ok(pkg.scripts['map:build'] === 'node scripts/build-map.mjs', 'package.json 에 map:build 가 없다');
});

await check({
  id: 'no-new-js-files',
  task: '지도 T5-register',
  label: 'js/ 아래 새 파일 0개 (지도 화면 코드 없음)',
  severity: 'acceptance',
  why: '이 트랙의 범위는 자산 등록까지다. 지도 화면·핀 렌더링은 T7 의 제약을 받아 별도 과제이고, 지금 들어오면 제약 없이 굳는다.'
}, (t) => {
  const actual = fs.readdirSync(p('js')).filter((f) => f.endsWith('.js')).sort();
  const extra = actual.filter((f) => !BASE_JS_FILES.includes(f));
  const outOfScope = extra.filter((f) => f === 'features.js');
  const inScope = extra.filter((f) => f !== 'features.js');
  t.ok(inScope.length === 0, 'js/ 에 지도 트랙 범위 밖의 새 파일이 들어왔다', inScope.join(', '));
  if (outOfScope.length) t.note('이 area 범위 밖 파일(다른 트랙): ' + outOfScope.join(', '));
  const missing = BASE_JS_FILES.filter((f) => !actual.includes(f));
  t.ok(missing.length === 0, 'js/ 에서 기존 파일이 사라졌다', missing.join(', '));
});

await check({
  id: 'map-test-group',
  task: '지도 T6-tests',
  label: "tests/run.mjs 의 '지도 자료' group 구성",
  severity: 'acceptance',
  why: '양방향 단언·상수 재사용·부동소수 안전 비교가 이 group 의 핵심이고, 등록 누락 검사와 캐시 이름 경고는 이 저장소에 없던 새 종류의 검사다.'
}, (t) => {
  const src = read('tests/run.mjs');
  if (!src.includes('지도 자료')) t.skip("tests/run.mjs 에 '지도 자료' group 이 없다 — T6-tests 미구현");
  const at = src.indexOf("group('지도 자료'");
  t.ok(at > src.indexOf("group('국기 이미지 파일'"), "'지도 자료' group 이 '국기 이미지 파일' 뒤가 아니다");
  const body = funcBody(src.slice(at), 'group(');
  const g = body || src.slice(at);
  t.ok(g.includes('EXPECTED_COUNT'), 'EXPECTED_COUNT 를 재사용하지 않는다');
  t.ok(!/\b194\b/.test(g), 'group 안에 숫자 194 를 다시 적었다 — 상수를 재사용해야 한다');
  t.ok(g.includes('DISPUTED'), 'DISPUTED 상수를 재사용하지 않는다');
  t.ok(g.includes('toFixed(2)'), 'toFixed(2) 비교를 쓰지 않는다');
  t.ok(!/Math\.round\([^)]*\*\s*100/.test(g), 'Math.round(x*100) 방식을 쓴다 — 부동소수가 샌다');
  t.ok(g.includes("'d,viewBox'") || g.includes('"d,viewBox"'), "mapLand 키를 'd,viewBox' 로 고정하는 단언이 없다");
  for (const s of ['kr', 'au', 'br', 'va', 'ru']) t.ok(g.includes("'" + s + "'"), '표본 단언이 없다: ' + s);
  for (const f of ['build-site.mjs', 'sw.js', 'index.html']) {
    t.ok(g.includes(f), f + ' 등록 여부를 단언하지 않는다');
  }
  t.ok(g.includes('flagquiz-v4'), 'flagquiz-v4 단언이 없다');
  const readme = read('README.md');
  t.ok(/지도 좌표/.test(readme) && /194/.test(readme), "README '## 검사하기' 절에 지도 좌표 줄이 없다");
});

await check({
  id: 'pin-doc-content',
  task: '지도 T7-pin-constraints',
  label: 'MAP-RENDER-CONSTRAINTS.md 존재와 11개 제약·확인표',
  severity: 'acceptance',
  why: "'CSS transition 이니까 안전'이 아니라 '기본 상태가 무엇인가'가 핵심이고, 방향을 거꾸로 적으면 움직임 줄이기에서 정답 핀이 영원히 안 보인다."
}, (t) => {
  const rel = 'docs/expansion/MAP-RENDER-CONSTRAINTS.md';
  const src = readOrSkip(t, rel, '지도 T7-pin-constraints');
  // 이 문서는 '## N. 제목' 절 하나가 제약 하나다
  const sections = src.match(/^#{2,3}\s*\d+\.\s+.+$/gm) || [];
  t.ok(sections.length >= 11, '제약 항목이 11개 미만이다', sections.length + '개');
  for (const sec of sections) {
    const at = src.indexOf(sec);
    const next = src.indexOf('\n## ', at + 1);
    const block = src.slice(at, next === -1 ? undefined : next);
    t.ok(/규칙/.test(block) && /근거/.test(block) && /증상/.test(block),
      '제약 항목에 규칙·근거·증상 세 줄이 다 있지 않다', sec.trim());
    t.ok(/[\w./-]+\.(?:js|css|html|md):\d+/.test(block), '제약 항목에 파일:라인 근거가 없다', sec.trim());
  }
  for (const api of ['@keyframes', 'requestAnimationFrame', 'setInterval']) {
    const lines = src.split('\n').filter((l) => l.includes(api));
    t.ok(lines.length > 0, api + ' 에 대한 언급이 없다');
    for (const l of lines) {
      t.ok(/금지|쓰지 마라|하지 마라|안 된다/.test(l), api + ' 가 금지 표현 없이 등장한다 (권장으로 읽힌다)', l.trim().slice(0, 60));
    }
  }
  t.ok(src.split('\n').some((l) => l.includes('기본') && l.includes('정답')),
    "'기본 상태가 정답 상태' 라는 방향 설명이 없다");
  t.ok(src.split('\n').some((l) => l.includes('일시 클래스') || l.includes('출발 상태')),
    "일시 클래스/출발 상태의 반대 방향 위험 설명이 없다");
  for (const v of ['44px', '최대 5개', '#main']) t.ok(src.includes(v), '명시돼야 할 값이 없다: ' + v);
  const ck = src.split('\n').filter((l) => /^\s*[-*]\s*\[\s*\]/.test(l));
  t.ok(ck.length >= 4, '실기기 확인표 체크리스트가 4개 미만이다', ck.length + '개');
});

await check({
  id: 'pin-doc-citations',
  task: '지도 T7-pin-constraints',
  label: '문서가 인용한 파일:라인이 실제로 그 내용인가',
  severity: 'acceptance',
  why: '틀린 줄 번호를 인용한 제약 문서는 몇 주 뒤 읽는 사람을 엉뚱한 곳으로 보낸다.'
}, (t) => {
  const rel = 'docs/expansion/MAP-RENDER-CONSTRAINTS.md';
  const src = readOrSkip(t, rel, '지도 T7-pin-constraints');
  const cites = src.match(/([\w./-]+\.(?:js|css|html|md)):(\d+)(?:-(\d+))?/g) || [];
  t.ok(cites.length > 0, '파일:라인 인용이 하나도 없다');
  for (const c of cites) {
    const [, file, a, b] = /([\w./-]+):(\d+)(?:-(\d+))?/.exec(c);
    if (!exists(file)) { t.ok(false, '인용한 파일이 없다', c); continue; }
    const lines = read(file).split('\n').length;
    t.ok(Number(a) <= lines && (!b || Number(b) <= lines), '인용한 줄 번호가 파일 줄 수를 넘는다', c + ' (' + lines + '줄)');
  }
  const SPOT = [
    ['design/SPEC.md', 37, '44px'],
    ['css/style.css', 531, 'prefers-reduced-motion'],
    ['js/effects.js', 7, 'reducedMotion'],
    ['js/effects.js', 80, 'celebrate'],
    ['index.html', 32, 'aria-live']
  ];
  for (const [file, line, keyword] of SPOT) {
    if (!exists(file) || !src.includes(file)) continue;
    const all = read(file).split('\n');
    const near = all.slice(Math.max(0, line - 4), line + 3).join('\n');
    if (!near.includes(keyword)) {
      const real = all.findIndex((l) => l.includes(keyword)) + 1;
      t.ok(false, file + ':' + line + ' 근처에 ' + keyword + ' 가 없다', real ? '실제 ' + real + '행' : '파일에 없음');
    }
  }
  const dec = 'docs/expansion/DECISIONS.md';
  if (exists(dec)) {
    t.ok(read(dec).includes('[MAP-RENDER-CONSTRAINTS.md](MAP-RENDER-CONSTRAINTS.md)'),
      'DECISIONS.md 의 D3 절에 제약 문서 링크가 없다');
  }
});

await check({
  id: 'attr-footer',
  task: '지도 T8-attribution',
  label: 'index.html 푸터의 Natural Earth 출처 한 줄',
  severity: 'acceptance',
  why: "이 저장소는 flag-icons·Typecast 를 푸터와 README 양쪽에 적는 관례가 있고, D3 항목 5 가 '땅만 그리고 국경선은 그리지 않는다' 의 화면 명문화를 요구한다."
}, (t) => {
  const html = read('index.html');
  if (!html.includes('Natural Earth')) t.skip("index.html 에 'Natural Earth' 가 없다 — T8-attribution 미구현");
  const footer = /<footer[\s\S]*?<\/footer>/.exec(html);
  t.ok(footer, '<footer> 구간을 찾지 못했다');
  if (!footer) return;
  const f = footer[0];
  const line = f.split('<br>').find((l) => l.includes('Natural Earth')) || '';
  t.ok(/href="https:\/\/www\.naturalearthdata\.com\/"/.test(line), 'naturalearthdata.com 링크가 없다');
  t.ok(/target="_blank"/.test(line) && /rel="noopener"/.test(line), 'target="_blank" rel="noopener" 가 없다');
  t.ok(line.includes('퍼블릭 도메인'), "'퍼블릭 도메인' 문구가 없다");
  t.ok(line.includes('국경선'), "'국경선을 그리지 않아요' 방침 문구가 없다");
  const parts = f.split('<br>');
  const ne = parts.findIndex((l) => l.includes('Natural Earth'));
  const fi = parts.findIndex((l) => l.includes('flag-icons'));
  const last = parts.findIndex((l) => l.includes('이 브라우저 안에만'));
  t.ok(fi !== -1 && ne > fi, 'Natural Earth 줄이 flag-icons 줄보다 앞이다');
  t.ok(last !== -1 && ne < last, 'Natural Earth 줄이 마지막 안내문보다 뒤다');
  t.ok(countOf(f, /<br>/g) === 3, '푸터 <br> 개수가 3(=네 줄)이 아니다', countOf(f, /<br>/g) + '개');
});

await check({
  id: 'attr-readme-license',
  task: '지도 T8-attribution',
  label: 'README 두 항목과 LICENSE 불변',
  severity: 'acceptance',
  why: '적어 둔 재생성 명령이 package.json 에 실제로 없으면 문서가 거짓말이 되고, 기존 문단을 통째로 다시 쓰면 tests/run.mjs 의 DISPUTED 검사가 근거로 삼는 문장이 흔들린다.'
}, (t) => {
  const md = read('README.md');
  if (!md.includes('Natural Earth')) t.skip("README.md 에 'Natural Earth' 가 없다 — T8-attribution 미구현");
  const at = md.indexOf('## 만든 것들');
  t.ok(at !== -1, "README 에 '## 만든 것들' 절이 없다");
  if (at !== -1) {
    const section = md.slice(at, md.indexOf('\n## ', at + 5) === -1 ? undefined : md.indexOf('\n## ', at + 5));
    t.ok(section.includes('Natural Earth'), "'만든 것들' 절에 Natural Earth 항목이 없다");
    const pkg = JSON.parse(read('package.json'));
    for (const cmd of ['map:fetch', 'map:build']) {
      if (section.includes('npm run ' + cmd)) {
        t.ok(Object.hasOwn(pkg.scripts, cmd), 'README 가 적은 명령이 package.json 에 없다: ' + cmd);
      }
    }
  }
  t.ok(md.includes('국경선을 나라를 가르는 선으로 쓰지 않습니다'), '국경선 방침 문장이 없다');
  const lines = md.split('\n');
  const policy = lines.findIndex((l) => l.includes('국경선을 나라를 가르는 선으로 쓰지 않습니다'));
  const un = lines.findIndex((l) => l.includes('유엔 회원국 193개국'));
  if (policy !== -1 && un !== -1) {
    const [a, b] = [Math.min(policy, un), Math.max(policy, un)];
    t.ok(!lines.slice(a, b + 1).some((l) => l.trim() === ''), '국경선 방침 문장이 기존 불릿과 같은 블록 안에 있지 않다');
  }
  t.ok(md.includes('어른들 사이에서도 답이 갈리는 것은 빼는 편이 낫다'),
    'DISPUTED 검사의 근거 문장이 삭제됐다');
  if (fs.existsSync(p('.git'))) {
    try {
      git(['diff', '--quiet', 'HEAD', '--', 'LICENSE']);
    } catch (e) {
      t.ok(false, 'LICENSE 가 바뀌었다 (Natural Earth 는 퍼블릭 도메인이라 LICENSE 를 건드릴 이유가 없다)');
    }
  }
});

await check({
  id: 'attr-data-headers',
  task: '지도 T8-attribution · T4-emit-data',
  label: '데이터 두 파일의 헤더 주석 5줄',
  severity: 'acceptance',
  why: '생성물임을 적어 두지 않으면 몇 달 뒤 누군가 좌표를 손으로 고치고, 다음 map:build 가 그 수정을 말없이 덮어쓴다.'
}, (t) => {
  const targets = ['data/map-coords.js', 'data/map-shapes.js'].filter(exists);
  if (targets.length === 0) t.skip('data/map-coords.js·map-shapes.js 가 둘 다 없다 — 지도 트랙 미구현');
  for (const rel of ['data/map-coords.js', 'data/map-shapes.js']) {
    if (!exists(rel)) { t.note(rel + ' 은 아직 없다 (미구현)'); continue; }
    const head = headerComment(read(rel));
    t.ok(head, rel + ' 에 헤더 주석이 없다');
    for (const need of ['Natural Earth', '50m', 'admin_0_countries', 'v5.1.2', '퍼블릭 도메인',
      'npm run map:fetch && npm run map:build', '손으로 고치지 마세요']) {
      t.ok(head.includes(need), rel + ' 헤더에 빠진 것: ' + need);
    }
  }
  if (exists('data/map-coords.js')) {
    const head = headerComment(read('data/map-coords.js'));
    t.ok(head.includes('x=(lng+180)/360'), 'map-coords 헤더에 x 변환식이 없다');
    t.ok(head.includes('y=(90-lat)/180'), 'map-coords 헤더에 y 변환식이 없다');
  }
  // 헤더가 적은 단순화 오차는 build-map.mjs 의 상수와 같아야 한다 (문서가 거짓말하지 않게).
  const tolConst = exists('scripts/build-map.mjs')
    ? (/SIMPLIFY_TOLERANCE_DEG\s*=\s*([\d.]+)/.exec(read('scripts/build-map.mjs')) || [])[1] : null;
  if (tolConst) {
    for (const rel of ['data/map-coords.js', 'data/map-shapes.js']) {
      if (!exists(rel)) continue;
      const head = headerComment(read(rel));
      const inHead = (/허용 오차:\s*([\d.]+)/.exec(head) || [])[1];
      t.ok(inHead === tolConst,
        rel + ' 헤더의 단순화 오차가 build-map.mjs 상수와 다르다', '헤더 ' + inHead + '° vs 상수 ' + tolConst + '°');
    }
  }
});

/* ───────────────── --deep 에서만 도는 느린 검사 ───────────────── */

await check({
  id: 'test-counts-grew',
  task: '지도 T6-tests',
  label: 'npm test 통과와 검사 건수 증가',
  severity: 'acceptance',
  why: 'Codex 는 110개 통과(작업 전 87개)를 보고했다. 기존 검사가 한 건도 사라지지 않으면서 늘었는지를 숫자로 확인한다.'
}, (t) => {
  if (!DEEP) t.skip('기본 실행에서 제외한다 — 실패 원인이 뒤섞이지 않게 npm test 는 따로 돌린다 (--deep 으로 포함)');
  let out = '', code = 0;
  try {
    out = execFileSync(process.execPath, ['tests/run.mjs'], { cwd: root, encoding: 'utf8' });
  } catch (e) { code = e.status ?? 1; out = (e.stdout || '') + (e.stderr || ''); }
  t.ok(code === 0, 'node tests/run.mjs 가 실패한다', '종료 코드 ' + code);
  const n = /검사 (\d+)건/.exec(out);
  t.ok(n && Number(n[1]) >= BASE_RUN_CHECKS, '검사 건수가 기준선보다 줄었다',
    (n ? n[1] : '?') + ' vs 기준 ' + BASE_RUN_CHECKS);
  let tout = '', tcode = 0;
  try {
    const files = fs.readdirSync(p('tests')).filter(name => name.endsWith('.test.mjs')).sort().map(name => p('tests', name));
    tout = execFileSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: root, encoding: 'utf8' });
  } catch (e) { tcode = e.status ?? 1; tout = (e.stdout || '') + (e.stderr || ''); }
  t.ok(tcode === 0, 'node --test 가 실패한다', '종료 코드 ' + tcode);
  const pm = /# pass (\d+)/.exec(tout);
  t.ok(pm && Number(pm[1]) >= BASE_NODE_TESTS, 'node 테스트 통과 건수가 없거나 기준선보다 줄었다',
    (pm ? pm[1] : '?') + ' vs 기준 ' + BASE_NODE_TESTS);
  t.note('node --test → ' + (pm ? pm[1] : '?') + '개 통과 (작업 전 기준 ' + BASE_NODE_TESTS + '개, Codex 보고 110개)');
});

await check({
  id: 'build-output',
  task: '지도 T5-register',
  label: 'npm run build 산출물에 두 파일이 들어가고 원본은 빠지는가',
  severity: 'acceptance',
  why: 'data/ 는 폴더 통째 복사 대상이 아니라 files 배열에 안 적으면 아이패드에서만 흰 화면이 되고, 반대로 data 폴더를 통째로 복사하면 원본 20MB 가 배포에 섞인다.'
}, (t) => {
  if (!exists('data/map-coords.js') || !exists('data/map-shapes.js')) t.skip('지도 자료가 없다 — 미구현');
  if (!DEEP) t.skip('빌드 실행은 느리다 — --deep 으로 포함');
  let code = 0, out = '';
  try { out = execFileSync(process.execPath, ['scripts/build-site.mjs'], { cwd: root, encoding: 'utf8' }); }
  catch (e) { code = e.status ?? 1; out = (e.stdout || '') + (e.stderr || ''); }
  if (code !== 0 && /음원|음악/.test(out)) t.skip('음원·음악 파일이 없어 빌드 게이트에서 먼저 막혔다 — 환경 미비');
  t.ok(code === 0, 'build-site.mjs 가 실패한다', out.slice(0, 200));
  for (const f of ['data/map-coords.js', 'data/map-shapes.js']) {
    const dst = p('_site', f);
    t.ok(fs.existsSync(dst), '배포본에 빠졌다 (아이패드에서만 흰 화면)', f);
    if (fs.existsSync(dst)) t.ok(fs.readFileSync(dst).equals(fs.readFileSync(p(f))), '배포본 내용이 원본과 다르다: ' + f);
  }
  t.ok(!fs.existsSync(p('_site/data/natural-earth')), '_site 에 Natural Earth 원본이 섞였다');
  t.ok(!fs.existsSync(p('_site/data/voice-config.json')), '_site 에 voice-config.json 이 섞였다');
});

await check({
  id: 'mapbuild-reproducible',
  task: '지도 T4-emit-data',
  label: 'map:build 재현성 (두 번 돌려 바이트 동일)',
  severity: 'acceptance',
  why: '순회 순서나 반올림이 흔들리면 좌표 한 줄을 손보정할 때 194줄 diff 가 나와 리뷰가 불가능해진다.'
}, (t) => {
  if (!exists('scripts/build-map.mjs')) t.skip('scripts/build-map.mjs 가 없다 — 지도 트랙 미구현');
  if (!exists('data/natural-earth/ne_50m_admin_0_countries.geojson')) {
    t.skip('원본 미보유 — `npm run map:fetch` 로 내려받은 뒤 다시 돌린다 (이 검사는 네트워크를 타지 않는다)');
  }
  if (!DEEP) t.skip('빌드 재실행은 느리다 — --deep 으로 포함');
  const targets = ['data/map-coords.js', 'data/map-shapes.js'].filter(exists);
  const backup = targets.map((f) => [f, fs.readFileSync(p(f))]);
  try {
    execFileSync(process.execPath, ['scripts/build-map.mjs'], { cwd: root, encoding: 'utf8' });
    for (const [f, before] of backup) {
      const after = fs.readFileSync(p(f));
      t.ok(after.equals(before), '두 번 돌린 결과가 다르다 (재현성 없음): ' + f);
      const text = after.toString('utf8');
      t.ok(!text.includes('\r\n'), '줄바꿈이 LF 가 아니다: ' + f);
      t.ok(text.endsWith('\n') && !text.endsWith('\n\n'), '파일 끝 개행이 정확히 1개가 아니다: ' + f);
    }
  } finally {
    for (const [f, before] of backup) fs.writeFileSync(p(f), before);
  }
});

await check({
  id: 'mutation-bite',
  task: '지도 T6-tests',
  label: '변이 주입 — 테스트가 실제로 무는가',
  severity: 'acceptance',
  why: '통과하는 테스트는 많지만 정작 틀린 값을 넣어도 안 잡히면 게이트가 아니다.'
}, (t) => {
  if (!read('tests/run.mjs').includes('지도 자료') || !exists('data/map-coords.js')) {
    t.skip("tests/run.mjs 에 '지도 자료' group 이 없거나 지도 자료가 없다 — T6 미구현");
  }
  if (!DEEP) t.skip('저장소 사본을 만들어 돌리는 느린 검사다 — --deep 으로 포함');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flagquiz-mut-'));
  try {
    for (const link of ['flags', 'audio', 'assets', 'css', 'design', 'docs']) {
      if (exists(link)) fs.symlinkSync(p(link), path.join(tmp, link));
    }
    for (const copy of ['data', 'tests', 'js', 'scripts', 'index.html', 'sw.js', 'package.json']) {
      if (exists(copy)) fs.cpSync(p(copy), path.join(tmp, copy), { recursive: true });
    }
    const MUT = [
      ['data/map-coords.js', (s) => s.split('\n').filter((l) => !/["']?kr["']?\s*:/.test(l)).join('\n'), 'kr'],
      ['data/map-coords.js', (s) => s.replace(/(\n\s*["']?kr["']?\s*:)/, '\n  "tw": [121.0, 23.6],$1'), '쓰이지 않는'],
      ['sw.js', (s) => s.replace('flagquiz-v4', 'flagquiz-v5'), '음원']
    ];
    for (const [file, mutate, expect] of MUT) {
      const full = path.join(tmp, file);
      const before = fs.readFileSync(full, 'utf8');
      fs.writeFileSync(full, mutate(before));
      let code = 0, out = '';
      try { out = execFileSync(process.execPath, ['tests/run.mjs'], { cwd: tmp, encoding: 'utf8' }); }
      catch (e) { code = e.status ?? 1; out = (e.stdout || '') + (e.stderr || ''); }
      t.ok(code === 1, file + ' 를 망가뜨렸는데 tests/run.mjs 가 통과한다 (게이트가 물지 않는다)');
      t.ok(out.includes(expect), file + ' 변이의 실패 메시지에 ' + expect + ' 가 없다');
      fs.writeFileSync(full, before);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

/* ══════════════════════════════════════════════════════════════════════
   출력
   ══════════════════════════════════════════════════════════════════════ */

const ICON = { [PASS]: '✅', [FAIL]: '❌', [SKIP]: '⬜' };

function render(section, title, rows) {
  console.log('\n' + '━'.repeat(72));
  console.log(section + '. ' + title);
  console.log('━'.repeat(72));
  if (!rows.length) { console.log('  (검사 없음)'); return; }
  for (const r of rows) {
    console.log('\n' + ICON[r.status] + ' ' + r.status + '  [' + r.id + ']  ' + r.task);
    console.log('   ' + r.label);
    console.log('   근거: ' + r.why);
    if (r.status === SKIP) console.log('   → ' + r.reason);
    for (const pr of r.problems) console.log('   ✗ ' + pr);
    for (const n of r.notes) console.log('   · ' + n);
  }
}

let head = '';
try { head = git(['rev-parse', '--short', 'HEAD']).trim(); } catch { head = '(git 없음)'; }

console.log('국기 퀴즈 확장 검사 — node scripts/verify-expansion.mjs' + (DEEP ? ' --deep' : ''));
console.log('저장소: ' + root + '   HEAD: ' + head);
console.log('상태는 셋이다 — ✅ 통과 / ❌ 실패 / ⬜ 미구현 (미구현은 실패가 아니다)');

const guards = results.filter((r) => r.severity === 'guardrail');
const accepts = results.filter((r) => r.severity === 'acceptance');

render('1', '금지 사항 — 위반하면 되돌릴 수 없다 (이것만 종료 코드 1)', guards);
render('2', '완료 판정 — 과제별 수용 검사 (실패해도 종료 코드 0)', accepts);

const tally = (rows) => ({
  [PASS]: rows.filter((r) => r.status === PASS).length,
  [FAIL]: rows.filter((r) => r.status === FAIL).length,
  [SKIP]: rows.filter((r) => r.status === SKIP).length
});
const g = tally(guards), a = tally(accepts), all = tally(results);

console.log('\n' + '━'.repeat(72));
console.log('3. 요약');
console.log('━'.repeat(72));
console.log('  금지 사항   통과 ' + g[PASS] + ' · 실패 ' + g[FAIL] + ' · 미구현 ' + g[SKIP] + '   (전 ' + guards.length + '건)');
console.log('  완료 판정   통과 ' + a[PASS] + ' · 실패 ' + a[FAIL] + ' · 미구현 ' + a[SKIP] + '   (전 ' + accepts.length + '건)');
console.log('  합계        통과 ' + all[PASS] + ' · 실패 ' + all[FAIL] + ' · 미구현 ' + all[SKIP] + '   (전 ' + results.length + '건)');

if (g[FAIL] > 0) {
  console.log('\n  ❌ 금지 사항 위반 ' + g[FAIL] + '건 — 이 커밋은 그대로 두면 안 된다.');
  for (const r of guards.filter((r) => r.status === FAIL)) console.log('     · [' + r.id + '] ' + r.label);
} else {
  console.log('\n  ✅ 금지 사항 위반 없음 — 되돌릴 수 없는 종류의 사고는 없다.');
}
if (a[FAIL] > 0) {
  console.log('  ⚠ 완료 판정 실패 ' + a[FAIL] + '건 — CI 는 막지 않지만 그대로 배포하면 아이 화면에서 드러난다.');
  for (const r of accepts.filter((r) => r.status === FAIL)) console.log('     · [' + r.id + '] ' + r.label);
}
if (all[SKIP] > 0) {
  console.log('  ⬜ 미구현 ' + all[SKIP] + '건 — 아직 안 한 일이다. 실패가 아니다.');
}
if (!DEEP) console.log('\n  (느린 검사는 빠져 있다: node scripts/verify-expansion.mjs --deep)');

console.log('\n' + '─'.repeat(72));
console.log('기계가 확인하지 못한 것 — 사람이 봐야 한다');
console.log('─'.repeat(72));
for (const line of [
  '① 아이패드 비행기 모드: 앱이 뜨고 · 국기가 보이고 · 수아 음원이 재생되는가.',
  '   셸·국기 약 2MB 재다운로드는 정상이고, 음원 114MB 재다운로드는 실패다.',
  '② 내보낸 JSON 을 다른 브라우저에 붙여 실제로 복원되는가 (기계는 샌드박스까지만 본다).',
  '③ 육지 실루엣 육안 확인: 이탈리아 장화 · 한반도 · 플로리다 반도 · 스칸디나비아 · 일본 열도가',
  '   알아보이는가 / 나라를 가르는 선이 한 개도 없는가 / 서사하라·팔레스타인·레소토 자리에 흰 구멍이 없는가.',
  '④ 푸터가 브라우저에서 네 줄로 보이고 Natural Earth 링크가 새 탭으로 열리는가.',
  '⑤ 새 버킷의 모든 읽기가 (r.x || 0) 으로 방어됐는가 · export 핸들러가 stats() 를 다시 부르지 않는가.'
]) console.log('  ' + line);

process.exit(g[FAIL] > 0 ? 1 : 0);
}
