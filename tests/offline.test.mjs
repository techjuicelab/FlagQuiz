import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/offline.js', import.meta.url), 'utf8');
function fixture({ supported = true, online = true, registrationFails = false, controller = true, registrationPending = false, installing = false } = {}) {
  const nodes = new Map(), events = {}, swEvents = {}, requests = [], timers = new Map();
  const registrationJobs = [];
  let tick = 0, clock = 0, registerCalls = 0, updateCalls = 0;
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, disabled: false, textContent: '', attrs: {},
      addEventListener(type, fn) { this[type] = fn; }, setAttribute(k, v) { this.attrs[k] = v; } });
    return nodes.get(id);
  }
  function makeWorker() { return { postMessage(data, ports) { requests.push({ data, port: ports && ports[0], worker: this }); } }; }
  const worker = makeWorker();
  const installingWorker = { state: 'installing', addEventListener(type, fn) { this[type] = fn; } };
  const reg = { active: controller ? worker : null, installing: installing ? installingWorker : null,
    update() { updateCalls++; return Promise.resolve(reg); } };
  const c = { FQ: {}, navigator: { onLine: online }, location: { protocol: 'https:', hostname: 'test.invalid' },
    document: { getElementById: node, addEventListener(type, fn) { events[type] = fn; } },
    addEventListener(type, fn) { events[type] = fn; },
    Date: { now: () => clock },
    setTimeout(fn, delay) { fn.delay = delay; timers.set(++tick, fn); return tick; }, clearTimeout(id) { timers.delete(id); },
    MessageChannel: function () { this.port1 = { close() {} }; this.port2 = { receiver: this.port1 }; } };
  if (supported) c.navigator.serviceWorker = { controller: worker,
    register() {
      registerCalls++;
      return registrationPending ? new Promise((resolve, reject) => registrationJobs.push({ resolve, reject }))
        : registrationFails ? Promise.reject(new Error('offline')) : Promise.resolve(reg);
    },
    addEventListener(type, fn) { swEvents[type] = fn; } };
  if (supported && !controller) c.navigator.serviceWorker.controller = null;
  c.window = c;
  vm.runInNewContext(source, c);
  c.FQ.offline.init();
  const latest = () => requests.filter(r => r.port).at(-1);
  function reply(status, extra = {}, request = latest()) {
    request.port.receiver.onmessage({ data: { type: 'OFFLINE_PROGRESS', requestId: request.data.requestId,
      status, cached: 0, total: 100, ...extra } });
  }
  function connect(value) { c.navigator.onLine = value; events[value ? 'online' : 'offline'](); }
  function runDelay(delay) { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer(); } }
  return { c, node, events, swEvents, requests, timers, reply, connect, latest, reg, worker, makeWorker,
    installingWorker, registrationJobs, runDelay, advance(ms) { clock += ms; },
    get registerCalls() { return registerCalls; }, get updateCalls() { return updateCalls; } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('준비 완료는 워커의 실제 검사 응답 뒤에만 표시하고, 빠진 자료가 있으면 이어받기를 제공한다', async () => {
  const f = fixture();
  await settle();
  assert.equal(f.latest().data.type, 'OFFLINE_STATUS');
  assert.notEqual(f.node('offline-summary').textContent, '준비 완료');
  f.reply('partial', { cached: 60 });
  assert.equal(f.node('offline-download').disabled, false);
  assert.equal(f.node('offline-download').textContent, '전체 저장하기');
  f.node('offline-download').click();
  assert.equal(f.latest().data.type, 'OFFLINE_DOWNLOAD');
  assert.equal(f.node('offline-download').disabled, true);
  f.reply('ready', { cached: 100 });
  assert.equal(f.node('offline-summary').textContent, '준비 완료');
  assert.equal(f.node('offline-download').hidden, true);
});

test('다운로드 중 연결이 끊기면 받은 분량을 유지하고 재연결 시 자동으로 이어받는다', async () => {
  const f = fixture(); await settle();
  f.reply('partial', { cached: 10 });
  f.node('offline-download').click();
  f.reply('downloading', { cached: 35 });
  f.connect(false);
  f.reply('partial', { cached: 35, error: 'network' });
  assert.equal(f.node('offline-progress').value, 35);
  assert.equal(f.node('offline-download').disabled, true);
  assert.equal(f.node('connection-note').hidden, false);
  f.connect(true);
  assert.equal(f.latest().data.type, 'OFFLINE_DOWNLOAD');
  assert.equal(f.node('connection-note').hidden, true);
});

test('저장을 요청하지 않은 재접속은 작은 자료 예열과 상태 확인만 한다', async () => {
  const f = fixture(); await settle(); f.reply('partial');
  f.connect(false); f.connect(true);
  assert.equal(f.latest().data.type, 'OFFLINE_STATUS');
  assert.equal(f.requests.some(r => r.data.type === 'OFFLINE_DOWNLOAD'), false);
  assert.equal(f.requests.some(r => r.data.type === 'OFFLINE_WARM'), true);
});

test('저장 공간 부족과 워커 응답 중단은 완료로 표시하지 않고 재시도를 허용한다', async () => {
  const f = fixture(); await settle(); f.reply('partial');
  f.node('offline-download').click(); f.reply('partial', { cached: 40, error: 'quota' });
  assert.match(f.node('offline-status').textContent, /저장 공간/);
  assert.equal(f.node('offline-download').disabled, false);
  f.node('offline-download').click();
  for (const timer of [...f.timers.values()]) timer();
  assert.equal(f.node('offline-summary').textContent, '준비 확인');
  assert.equal(f.node('offline-download').textContent, '다시 확인하기');
  assert.equal(f.node('offline-download').disabled, false);
});

test('워커 교체 후 늦게 온 이전 응답은 최신 저장 상태를 덮어쓰지 않는다', async () => {
  const f = fixture(); await settle(); const old = f.latest();
  f.c.navigator.serviceWorker.controller = f.makeWorker();
  f.swEvents.controllerchange(); f.reply('partial', { cached: 10 });
  assert.notEqual(f.latest(), old);
  f.reply('ready', { cached: 100 }, old);
  assert.notEqual(f.node('offline-summary').textContent, '준비 완료');
});

test('오프라인 등록 갱신 실패에도 기존 워커로 상태를 확인한다', async () => {
  const f = fixture({ online: false, registrationFails: true }); await settle();
  assert.equal(f.latest().data.type, 'OFFLINE_STATUS');
  f.reply('ready', { cached: 100 });
  assert.equal(f.node('offline-summary').textContent, '준비 완료');
});

test('서비스 워커 미지원 환경에서도 퀴즈는 그대로 열고 저장 안내만 제한한다', () => {
  const f = fixture({ supported: false });
  assert.equal(f.node('offline-summary').textContent, '저장할 수 없음');
  assert.equal(f.node('offline-download').hidden, true);
  assert.equal(f.requests.length, 0);
});

test('등록 갱신이 지연돼도 기존 워커를 바로 조회하고 갱신 시간 초과가 확인 결과를 지우지 않는다', async () => {
  const f = fixture({ registrationPending: true });
  assert.equal(f.latest().data.type, 'OFFLINE_STATUS');
  f.reply('ready', { cached: 100 });
  await settle();
  f.runDelay(15000);
  assert.equal(f.node('offline-summary').textContent, '준비 완료');
  assert.equal(f.requests.filter(r => r.port).length, 1);
});

test('첫 등록과 설치가 15초 동안 멈춰도 준비 중 잠금을 풀고 재시도할 수 있다', async () => {
  for (const options of [{ controller: false, registrationPending: true }, { controller: false, installing: true }]) {
    const f = fixture(options); await settle();
    assert.equal(f.node('offline-download').disabled, true);
    f.runDelay(15000);
    assert.equal(f.node('offline-download').disabled, false);
    assert.equal(f.node('offline-download').textContent, '다시 확인하기');
    assert.notEqual(f.node('offline-summary').textContent, '준비 완료');
  }
});

test('응답하지 않는 구버전 워커의 재시도는 등록 갱신을 수행한다', async () => {
  const f = fixture(); await settle();
  f.runDelay(30000);
  assert.equal(f.node('offline-download').textContent, '다시 확인하기');
  f.node('offline-download').click();
  assert.equal(f.node('offline-download').disabled, true);
  await settle();
  assert.equal(f.updateCalls, 1);
  assert.equal(f.latest().data.type, 'OFFLINE_DOWNLOAD');
  f.reply('ready', { cached: 100 });
  assert.equal(f.node('offline-summary').textContent, '준비 완료');
});

test('시간 초과한 등록이 뒤늦게 끝나도 새 재시도의 워커나 저장 상태를 덮어쓰지 않는다', async () => {
  const f = fixture({ controller: false, registrationPending: true }); await settle();
  f.runDelay(15000);
  f.node('offline-download').click(); await settle();
  const nextWorker = f.makeWorker();
  f.registrationJobs[1].resolve({ active: nextWorker }); await settle();
  assert.equal(f.latest().worker, nextWorker);
  f.reply('partial', { cached: 60 });
  const count = f.requests.filter(r => r.port).length;
  f.registrationJobs[0].resolve({ active: f.worker }); await settle();
  assert.equal(f.requests.filter(r => r.port).length, count);
  assert.equal(f.node('offline-progress').value, 60);
  f.node('offline-download').click();
  assert.equal(f.latest().worker, nextWorker);
});

test('controllerchange와 늦은 등록 완료가 같은 워커의 전체 검사를 중복하지 않는다', async () => {
  const f = fixture({ registrationPending: true }); await settle();
  const nextWorker = f.makeWorker();
  f.c.navigator.serviceWorker.controller = nextWorker;
  f.swEvents.controllerchange();
  f.reply('ready', { cached: 100 });
  f.registrationJobs[0].resolve({ active: nextWorker }); await settle();
  assert.equal(f.requests.filter(r => r.port).length, 2);
  assert.equal(f.node('offline-summary').textContent, '준비 완료');
});

test('복귀 직후 상태 검사 중에도 전체 저장을 누를 수 있고 늦은 검사 응답은 버린다', async () => {
  const f = fixture(); await settle(); f.reply('partial', { cached: 30 });
  f.advance(31000); f.events.visibilitychange();
  const status = f.latest();
  assert.equal(status.data.type, 'OFFLINE_STATUS');
  assert.equal(f.node('offline-download').disabled, false);
  f.node('offline-download').click();
  const download = f.latest();
  assert.equal(download.data.type, 'OFFLINE_DOWNLOAD');
  f.reply('ready', { cached: 100 }, status);
  assert.equal(f.node('offline-summary').textContent, '저장 중');
  assert.equal(f.node('offline-download').disabled, true);
  f.reply('partial', { cached: 40, error: 'network' }, download);
  assert.equal(f.node('offline-progress').value, 40);
});

test('온라인 시작과 복귀에서는 작은 자료만 예열하고 잦은 복귀는 30초 동안 중복 조회를 하지 않는다', async () => {
  const f = fixture(); await settle(); f.reply('partial');
  const count = type => f.requests.filter(r => r.data.type === type).length;
  assert.equal(count('OFFLINE_WARM'), 1);
  for (let i = 0; i < 10; i++) f.events.visibilitychange();
  assert.equal(count('OFFLINE_WARM'), 1); assert.equal(count('OFFLINE_STATUS'), 1);
  f.advance(31000); f.events.visibilitychange();
  assert.equal(count('OFFLINE_WARM'), 2); assert.equal(count('OFFLINE_STATUS'), 2);
  assert.equal(count('OFFLINE_DOWNLOAD'), 0);
});

test('빠른 재연결이 끝나지 않은 실패 작업에 합류해도 종료 뒤 한 번 새로 이어받는다', async () => {
  for (const status of ['partial', 'error']) {
    const f = fixture(); await settle(); f.reply('partial');
    const count = () => f.requests.filter(r => r.data.type === 'OFFLINE_DOWNLOAD').length;
    f.node('offline-download').click(); f.reply('downloading', { cached: 35 });
    f.connect(false); f.connect(true);
    assert.equal(count(), 2);
    f.reply(status, { cached: 35, error: 'network' });
    assert.equal(count(), 2, '워커의 현재 다운로드 종료를 먼저 기다린다');
    f.runDelay(0);
    assert.equal(count(), 3);
    f.reply('partial', { cached: 50, error: 'network' }); f.runDelay(0);
    assert.equal(count(), 3, '마지막 재시도도 실패하면 자동 반복하지 않는다');
    assert.equal(f.node('offline-progress').value, 50);
    assert.equal(f.node('offline-download').disabled, false);
  }
});

test('재연결이 없는 일반 연결 실패와 저장 공간 부족은 자동 재시도하지 않는다', async () => {
  const f = fixture(); await settle(); f.reply('partial');
  f.node('offline-download').click(); f.reply('partial', { cached: 20, error: 'network' }); f.runDelay(0);
  assert.equal(f.requests.filter(r => r.data.type === 'OFFLINE_DOWNLOAD').length, 1);
  f.node('offline-download').click(); f.connect(false); f.connect(true);
  const count = f.requests.filter(r => r.data.type === 'OFFLINE_DOWNLOAD').length;
  f.reply('partial', { cached: 20, error: 'quota' }); f.runDelay(0);
  assert.equal(f.requests.filter(r => r.data.type === 'OFFLINE_DOWNLOAD').length, count);
});

test('재연결 후 완료·수동 재시도·다시 오프라인이 되면 예약된 자동 이어받기를 남기지 않는다', async () => {
  for (const action of ['ready', 'manual', 'offline']) {
    const f = fixture(); await settle(); f.reply('partial');
    const count = () => f.requests.filter(r => r.data.type === 'OFFLINE_DOWNLOAD').length;
    f.node('offline-download').click(); f.connect(false); f.connect(true);
    if (action === 'ready') f.reply('ready', { cached: 100 });
    else {
      f.reply('partial', { cached: 30, error: 'network' });
      if (action === 'manual') {
        f.node('offline-download').click();
        f.reply('partial', { cached: 40, error: 'network' });
      } else f.connect(false);
    }
    const before = count(); f.runDelay(0);
    assert.equal(count(), before, action);
  }
});
