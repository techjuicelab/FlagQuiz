import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const KEY = 'flagquiz.v1', PENDING = 'flagquiz.legacy-pending';
const SOURCE = 'flagquiz.legacy-source', BACKUP = 'flagquiz.legacy-backup';
const code = fs.readFileSync(new URL('../js/legacy-records.js', import.meta.url), 'utf8');
const storageCode = fs.readFileSync(new URL('../js/storage.js', import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function defaults() {
  const c = { localStorage: { getItem: () => null, setItem() {} } }; c.window = c;
  vm.runInNewContext(storageCode, c); return JSON.parse(c.FQ.storage.exportJson());
}
function seed() {
  const data = defaults();
  data.settings.players = ['기존 아이 🚀']; data.settings.sound = false;
  data.stats = { games: 3, asked: 8, correct: 7, bestStreak: 3, playSeconds: 20, xp: 250 };
  data.countries = { kr: { seen: 4, correct: 3, wrong: 1, streak: 2 } };
  data.badges = { first_game: '2026-10-03' };
  data.axes = { capital: { jp: { seen: 1, correct: 1, wrong: 0, streak: 1, correctDays: 1, lastCorrectDay: '2026-10-03' } } };
  data.history = [{ date: '2026-10-03', mode: 'choice4', total: 8, correct: 7, players: ['기존 아이 🚀'], learnedCorrect: 6, helpedCorrect: 1 }];
  data.chest = { since: 3, opened: 2, kinds: { plain: 2 } };
  data.gifts = { owned: ['fire_truck'] };
  data.daily = { date: '2026-10-03', continent: '아시아', done: 2 };
  return data;
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const fingerprint = data => createHash('sha256').update(canonical(data)).digest('hex');
function fixture({ current, pending, marker, backup, fail, deniedLocal = false, deniedSession = false } = {}) {
  const local = new Map([['another-app', 'keep']]), session = new Map([['another-session', 'keep']]), operations = [];
  for (const [key, value] of [[KEY, current], [SOURCE, marker], [BACKUP, backup]]) if (value !== undefined) local.set(key, value);
  if (pending !== undefined) session.set(PENDING, pending);
  function storage(scope, values) {
    function operation(method, key, value) {
      const entry = { scope, method, key, value }; operations.push(entry);
      const behavior = fail && fail(entry);
      if (behavior === 'ignore') return false;
      if (behavior) throw new Error('Storage unavailable');
      return true;
    }
    return {
      getItem(key) { operation('get', key); return values.get(key) ?? null; },
      setItem(key, value) { if (operation('set', key, value)) values.set(key, String(value)); },
      removeItem(key) { if (operation('remove', key)) values.delete(key); }
    };
  }
  const c = { localStorage: storage('local', local), sessionStorage: storage('session', session) };
  if (deniedLocal) Object.defineProperty(c, 'localStorage', { get() { throw new Error('Denied'); } });
  if (deniedSession) Object.defineProperty(c, 'sessionStorage', { get() { throw new Error('Denied'); } });
  c.window = c; vm.createContext(c); vm.runInContext(code, c);
  return { c, local, session, operations, api: c.FQLegacyRecords,
    loadStorage() { vm.runInContext(storageCode, c); return c.FQ.storage; } };
}

test('초기 storage 로드 전에 XP 250·선물·배지·오답·축·설정 기록을 복원하고 출처 SHA256을 남긴다', () => {
  const data = seed(), raw = JSON.stringify(data), f = fixture({ pending: raw });
  const imported = f.api.consumePending();
  assert.equal(imported.status, 'imported'); assert.equal(imported.summary.xp, 250);
  assert.equal(f.local.get(KEY), raw); assert.equal(f.session.has(PENDING), false);
  assert.deepEqual(JSON.parse(f.local.get(SOURCE)), { version: 1, fingerprint: fingerprint(data), phase: 'complete' });
  assert.equal(f.local.has(BACKUP), false);
  const store = f.loadStorage();
  assert.equal(store.stats().xp, 250); assert.deepEqual(Array.from(store.giftState().owned), ['fire_truck']);
  assert.ok(store.badges().first_game); assert.equal(store.allAxisStats('capital').jp.correctDays, 1);
  assert.equal(store.settings().players[0], data.settings.players[0]);
  assert.equal(store.settings().sound, false); assert.equal(store.history().length, 1);
  assert.equal(f.local.get('another-app'), 'keep'); assert.equal(f.session.get('another-session'), 'keep');
});

test('실제 저장 API로 만든 export의 lastMode·XP·선물·축 도장·streak·day·history를 같은 loader로 복원한다', () => {
  const old = fixture(), store = old.loadStorage();
  for (const file of ['js/util.js', 'js/features.js', 'data/countries.js', 'data/subjects.js', 'js/progress.js', 'js/quiz.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), old.c);
  }
  store.updateSettings({ players: ['이전 아이'], sound: false, speak: false, correctMusic: true, dev: { art: true } });
  const lastMode = {};
  for (const [group, mode] of [['flag', 'voice'], ['art', 'place'], ['map', 'map'], ['capital', 'capitalVoice']]) {
    lastMode[group] = mode;
    store.updateSettings({ mode, lastMode: { ...lastMode } });
  }
  store.recordAnswer('kr', false);
  const game = old.c.FQ.quiz.createGame({ mode: 'choice4', only: ['kr'], count: 1, players: ['이전 아이'] });
  assert.equal(game.submit({ code: 'kr' }).correct, true);
  store.recordAnswer('kr', true);
  for (const axis of ['symbol', 'place', 'map', 'capital']) {
    store.recordAnswer('jp', false, axis); store.recordAnswer('jp', true, axis); store.recordAnswer('jp', true, axis);
  }
  game.startedAt = Date.now() - 12345;
  const played = game.summary();
  assert.equal(played.seconds, 12); assert.equal(Number.isInteger(played.seconds), true);
  store.finishGame(played); store.addXp(250);
  store.awardBadge('first_game'); store.awardGift('fire_truck'); store.awardGift('space_rocket');
  store.recordChest(null); store.recordChest('gold'); store.recordChest(null);
  const day = store.badges().first_game;
  store.setDaily({ date: day, continent: '아시아', done: 2 });
  const raw = store.exportJson(), f = fixture({ pending: raw });
  assert.equal(f.api.consumePending().status, 'imported');
  const restored = f.loadStorage();
  assert.deepEqual(JSON.parse(restored.exportJson()), JSON.parse(raw));
  assert.equal(restored.stats().xp, 250); assert.equal(restored.stats().playSeconds, 12);
  assert.equal(restored.countryStat('kr').streak, 2);
  for (const axis of ['symbol', 'place', 'map', 'capital']) {
    assert.equal(restored.allAxisStats(axis).jp.correctDays, 1);
    assert.equal(restored.allAxisStats(axis).jp.lastCorrectDay, day);
    assert.equal(restored.allAxisStats(axis).jp.streak, 2);
  }
  assert.deepEqual(clone(restored.settings().lastMode), lastMode);
  assert.equal(restored.settings().speak, false); assert.equal(restored.settings().dev.art, true);
  assert.equal(restored.history()[0].date, day); assert.equal(restored.history()[0].mode, 'choice4');
  assert.equal(restored.history()[0].learnedCorrect, 1); assert.equal(restored.history()[0].helpedCorrect, 0);
  assert.deepEqual(clone(restored.daily()), { date: day, continent: '아시아', done: 2 });
  assert.deepEqual(clone(restored.giftState().owned), ['fire_truck', 'space_rocket']);
  assert.deepEqual(clone(restored.chestState()), { since: 1, opened: 1, kinds: { gold: 1 } });
});

test('최근 놀이 버킷은 실제 그룹별 모드를 받아들이고 잘못 연결한 그룹·모드는 거부한다', () => {
  for (const [group, modes] of Object.entries({ flag: ['choice4', 'reverse', 'typing', 'voice'], art: ['symbol', 'place'], map: ['map'], capital: ['capital', 'capitalVoice'] })) {
    for (const mode of modes) {
      const data = seed(); data.settings.lastMode = { [group]: mode };
      assert.equal(fixture({ pending: JSON.stringify(data) }).api.consumePending().status, 'imported', group + ':' + mode);
    }
  }
  for (const lastMode of [null, [], { other: 'voice' }, { flag: 'capitalVoice' }, { art: 'map' }, { capital: 'choice4' }, { map: false }]) {
    const data = seed(); data.settings.lastMode = lastMode;
    assert.equal(fixture({ pending: JSON.stringify(data) }).api.consumePending().status, 'invalid');
  }
});

test('실제 storage의 기본 JSON과 키 순서·공백만 다른 기본 JSON에는 자동 복원을 허용한다', () => {
  const defaultData = defaults();
  const reverse = Object.fromEntries(Object.entries(defaultData).reverse());
  for (const current of [JSON.stringify(defaultData), JSON.stringify(reverse, null, 2)]) {
    const f = fixture({ current, pending: JSON.stringify(seed()) });
    assert.equal(f.api.consumePending().status, 'imported'); assert.equal(f.loadStorage().stats().xp, 250);
  }
});

test('어느 버킷이나 설정에 기존 NAS 기록이 있으면 원문·pending·기존 marker·backup을 모두 보존한다', () => {
  const variants = [
    d => { d.stats.xp = 1; }, d => { d.stats.asked = 1; }, d => { d.countries.kr = {}; },
    d => { d.badges.first_game = true; }, d => { d.axes.map = {}; },
    d => { d.history.push({ date: '2026-10-03', mode: 'voice', total: 1 }); },
    d => { d.gifts.owned.push('fire_truck'); }, d => { d.daily.done = 1; },
    d => { d.chest.since = 1; }, d => { d.settings.sound = false; }
  ].map(change => { const d = defaults(); change(d); return JSON.stringify(d); });
  for (const current of [...variants, '{}', '{broken', '', JSON.stringify({ unknown: 'record' })]) {
    const pending = JSON.stringify(seed()), f = fixture({ current, pending, marker: 'old marker', backup: 'old backup' });
    const before = Array.from(f.local.entries());
    assert.equal(f.api.consumePending().status, 'conflict'); assert.deepEqual(Array.from(f.local.entries()), before);
    assert.equal(f.session.get(PENDING), pending); assert.equal(f.operations.some(op => op.method !== 'get'), false);
  }
});

test('동일 JSON의 공백·키 순서가 바뀐 재전송도 fingerprint로 막고 이후 늘어난 NAS 기록을 유지한다', () => {
  const data = seed(), f = fixture({ pending: JSON.stringify(data) });
  assert.equal(f.api.consumePending().status, 'imported');
  const progressed = clone(data); progressed.stats.xp = 999;
  const current = JSON.stringify(progressed); f.local.set(KEY, current);
  const reordered = Object.fromEntries(Object.entries(data).reverse());
  f.session.set(PENDING, JSON.stringify(reordered, null, 2));
  assert.equal(f.api.consumePending().status, 'replayed'); assert.equal(f.local.get(KEY), current);
  assert.equal(f.session.has(PENDING), false);
  assert.equal(f.api.importJson(JSON.stringify(data), { replace: false }).status, 'conflict');
  assert.equal(f.local.get(KEY), current);
});

test('초기화 후 같은 백업의 파일 가져오기와 명시적 pending 교체는 오래된 출처 marker에 막히지 않는다', () => {
  const raw = JSON.stringify(seed());
  for (const operation of ['file', 'pending']) {
    const f = fixture({ pending: raw }); assert.equal(f.api.consumePending().status, 'imported');
    const store = f.loadStorage(); store.resetProgress();
    const before = f.local.get(KEY); assert.equal(JSON.parse(before).stats.xp, 0);
    if (operation === 'pending') f.session.set(PENDING, raw);
    const result = operation === 'file' ? f.api.importJson(raw, { replace: true }) : f.api.importPending({ replace: true });
    assert.equal(result.status, 'imported'); assert.equal(f.local.get(BACKUP), before);
    assert.equal(f.local.get(KEY), raw); assert.equal(f.loadStorage().stats().xp, 250);
  }
  const fresh = fixture({ pending: raw }); assert.equal(fresh.api.consumePending().status, 'imported');
  fresh.loadStorage().resetAll();
  assert.equal(fresh.api.importJson(raw, { replace: false }).status, 'imported');
  assert.equal(fresh.loadStorage().stats().xp, 250);
});

test('inspectPending은 읽기만 하며 원문·이름·나라 ID 대신 숫자 요약만 반환한다', () => {
  const raw = JSON.stringify(seed()), f = fixture({ pending: raw });
  const inspected = f.api.inspectPending();
  assert.equal(inspected.pending, true); assert.equal(inspected.status, 'pending');
  assert.deepEqual(clone(inspected.summary), { games: 3, asked: 8, correct: 7, xp: 250, countries: 1, badges: 1, axisCountries: 1, history: 1, gifts: 1 });
  assert.doesNotMatch(JSON.stringify(inspected), /기존 아이|fire_truck|first_game|fingerprint/);
  inspected.summary.xp = 0; assert.equal(f.api.inspectPending().summary.xp, 250);
  assert.equal(f.operations.some(op => op.method !== 'get'), false); assert.equal(f.session.get(PENDING), raw);
  assert.equal(fixture().api.inspectPending().pending, false);
});

test('명시적 replace:true에서만 기존 NAS 원문을 먼저 백업하고 pending 기록으로 교체한다', () => {
  const old = seed(); old.stats.xp = 900;
  const current = JSON.stringify(old), pending = JSON.stringify(seed());
  const f = fixture({ current, pending, backup: 'older backup' });
  for (const replace of [undefined, false, 'true', 1]) assert.equal(f.api.importPending({ replace }).status, 'conflict');
  assert.equal(f.api.importPending({ replace: true }).status, 'imported');
  assert.equal(f.local.get(BACKUP), current); assert.equal(f.local.get(KEY), pending);
  const writes = f.operations.filter(op => op.method === 'set');
  assert.ok(writes.findIndex(op => op.key === BACKUP) < writes.findIndex(op => op.key === KEY));
  assert.equal(f.session.has(PENDING), false);
});

test('내보낸 파일용 importJson도 같은 검증·충돌·백업 계약을 사용하며 다른 pending을 지우지 않는다', () => {
  const raw = JSON.stringify(seed()), f = fixture({ pending: 'unrelated pending' });
  assert.equal(f.api.importJson(raw, { replace: false }).status, 'imported');
  assert.equal(f.loadStorage().stats().xp, 250); assert.equal(f.session.get(PENDING), 'unrelated pending');
  const next = seed(); next.stats.xp = 300; const nextRaw = JSON.stringify(next);
  assert.equal(f.api.importJson(nextRaw, { replace: false }).status, 'conflict');
  assert.equal(f.api.importJson(nextRaw, { replace: true }).status, 'imported');
  assert.equal(f.local.get(BACKUP), raw); assert.equal(f.local.get(KEY), nextRaw);
  assert.equal(f.session.get(PENDING), 'unrelated pending');
});

test('discardPending은 보류분만 지우며 현재 기록·출처·백업·다른 세션을 유지한다', () => {
  const current = JSON.stringify(seed()), f = fixture({ current, pending: 'bad JSON', marker: 'marker', backup: 'backup' });
  const before = Array.from(f.local.entries());
  assert.equal(f.api.discardPending().status, 'discarded'); assert.equal(f.session.has(PENDING), false);
  assert.deepEqual(Array.from(f.local.entries()), before); assert.equal(f.session.get('another-session'), 'keep');
  assert.equal(f.api.consumePending().status, 'empty');
});

test('잘못된 JSON·허용하지 않은 버킷·유형·값·중첩 prototype 키는 현재와 pending을 보존하며 거부한다', () => {
  const bad = ['not JSON', 'null', '[]', '{}', '{"secret":"no"}', '{"stats":{"xp":"250"}}',
    '{"stats":{"xp":-1}}', '{"stats":{"xp":1e309}}', '{"stats":[]}', '{"countries":{"kr":null}}',
    '{"countries":{"kr":{"correct":true}}}', '{"gifts":{"owned":[3]}}', '{"history":[null]}',
    '{"settings":{"mode":"unknown"}}', '{"settings":{"players":[]}}', '{"settings":{"speak":"false"}}',
    '{"axes":{"unknown":{}}}', '{"daily":{"date":"bad-date"}}',
    '{"__proto__":{"polluted":true}}', '{"settings":{"dev":{"constructor":{"polluted":true}}}}',
    '{"history":[{"players":[{"prototype":{}}]}]}'];
  const nested = {}; let cursor = nested; for (let i = 0; i < 35; i++) cursor = cursor.a = {};
  bad.push(JSON.stringify({ settings: { dev: nested } }));
  for (const pending of bad) {
    const current = JSON.stringify(seed()), f = fixture({ current, pending, marker: 'source', backup: 'backup' });
    const before = Array.from(f.local.entries());
    assert.equal(f.api.consumePending().status, 'invalid', pending.slice(0, 60));
    assert.equal(f.api.inspectPending().status, 'invalid');
    assert.equal(f.api.importPending({ replace: true }).status, 'invalid');
    assert.deepEqual(Array.from(f.local.entries()), before); assert.equal(f.session.get(PENDING), pending);
    assert.equal(f.operations.some(op => op.method !== 'get'), false);
  }
  assert.equal({}.polluted, undefined);
});

test('UTF-8 512KiB는 허용하고 초과 ASCII·멀티바이트 JSON은 거부한다', () => {
  const raw = JSON.stringify(seed()), exact = raw + ' '.repeat(512 * 1024 - Buffer.byteLength(raw));
  assert.equal(Buffer.byteLength(exact), 512 * 1024);
  const fits = fixture({ pending: exact }); assert.equal(fits.api.consumePending().status, 'imported');
  const multibyte = JSON.stringify({ settings: { players: ['🚀'.repeat(140000)] } });
  assert.ok(multibyte.length < 512 * 1024); assert.ok(Buffer.byteLength(multibyte) > 512 * 1024);
  for (const pending of [exact + ' ', multibyte]) {
    const f = fixture({ pending }); assert.equal(f.api.consumePending().code, 'oversize');
    assert.equal(f.session.get(PENDING), pending); assert.equal(f.local.has(KEY), false);
  }
});

test('백업·prepared 마커·기록·complete 마커 쓰기 실패 시 이전 원문과 pending을 되돌리거나 유지한다', () => {
  for (const stage of ['backup', 'prepare', 'record', 'complete']) {
    const old = seed(); old.stats.xp = 900;
    const current = JSON.stringify(old), pending = JSON.stringify(seed()); let failed = false;
    const f = fixture({ current, pending, marker: 'old source', backup: 'old backup', fail(op) {
      if (failed) return false;
      const matches = op.scope === 'local' && op.method === 'set' &&
        ((stage === 'backup' && op.key === BACKUP) || (stage === 'record' && op.key === KEY) ||
         (stage === 'prepare' && op.key === SOURCE && JSON.parse(op.value).phase === 'prepared') ||
         (stage === 'complete' && op.key === SOURCE && JSON.parse(op.value).phase === 'complete'));
      if (!failed && matches) { failed = true; return true; } return false;
    } });
    const before = Array.from(f.local.entries());
    assert.equal(f.api.importPending({ replace: true }).status, 'unavailable', stage);
    assert.equal(failed, true); assert.deepEqual(Array.from(f.local.entries()), before);
    assert.equal(f.session.get(PENDING), pending);
    assert.equal(f.api.importPending({ replace: true }).status, 'imported', '실패 후 같은 pending 재시도');
  }
});

test('조용한 백업·prepared·기록·complete 저장 실패도 readback으로 감지하고 원문과 pending을 보존한다', () => {
  for (const stage of ['backup', 'prepare', 'record', 'complete']) {
    const old = seed(); old.stats.xp = 900;
    const current = JSON.stringify(old), pending = JSON.stringify(seed()); let ignored = false;
    const f = fixture({ current, pending, marker: 'old source', backup: 'old backup', fail(op) {
      if (ignored || op.method !== 'set') return false;
      const matches = (stage === 'backup' && op.key === BACKUP) || (stage === 'record' && op.key === KEY) ||
        (stage === 'prepare' && op.key === SOURCE && JSON.parse(op.value).phase === 'prepared') ||
        (stage === 'complete' && op.key === SOURCE && JSON.parse(op.value).phase === 'complete');
      if (matches) { ignored = true; return 'ignore'; } return false;
    } });
    const before = Array.from(f.local.entries());
    assert.equal(f.api.importPending({ replace: true }).status, 'unavailable', stage);
    assert.equal(ignored, true); assert.deepEqual(Array.from(f.local.entries()), before);
    assert.equal(f.session.get(PENDING), pending);
    assert.equal(f.api.importPending({ replace: true }).status, 'imported');
  }
});

test('초기 설치의 마커·기록·완료 쓰기 실패도 기존 기본값과 pending을 보존한다', () => {
  for (const stage of ['prepare', 'record', 'complete']) {
    const current = JSON.stringify(defaults()), pending = JSON.stringify(seed()); let failed = false;
    const f = fixture({ current, pending, fail(op) {
      const matches = op.method === 'set' && (op.key === KEY ? stage === 'record' : op.key === SOURCE && JSON.parse(op.value).phase === stage.replace('prepare','prepared'));
      if (!failed && matches) { failed = true; return true; } return false;
    } });
    assert.equal(f.api.consumePending().status, 'unavailable', stage); assert.equal(f.local.get(KEY), current);
    assert.equal(f.local.has(SOURCE), false); assert.equal(f.session.get(PENDING), pending);
  }
});

test('저장소 접근·읽기·삭제 차단은 원문을 지우지 않으며 성공 후 pending 삭제 실패는 replay로 안전하게 처리한다', () => {
  const raw = JSON.stringify(seed());
  for (const options of [{ deniedLocal: true }, { deniedSession: true }, { fail: op => op.method === 'get' && op.key === KEY }]) {
    const f = fixture({ current: raw, pending: raw, ...options });
    assert.equal(f.api.consumePending().status, 'unavailable'); assert.equal(f.local.get(KEY), raw); assert.equal(f.session.get(PENDING), raw);
  }
  let blocked = true;
  const f = fixture({ pending: raw, fail: op => blocked && op.scope === 'session' && op.method === 'remove' });
  assert.equal(f.api.consumePending().status, 'imported'); assert.equal(f.session.get(PENDING), raw);
  assert.equal(f.api.consumePending().status, 'replayed'); assert.equal(f.local.get(KEY), raw);
  assert.equal(f.api.discardPending().status, 'unavailable'); assert.equal(f.session.get(PENDING), raw);
  blocked = false; assert.equal(f.api.consumePending().status, 'replayed'); assert.equal(f.session.has(PENDING), false);
});

test('중단된 prepared 마커는 실제 설치된 같은 JSON에서만 완료하며 기존의 다른 기록은 보호한다', () => {
  const data = seed(), raw = JSON.stringify(data), prepared = JSON.stringify({ version: 1, fingerprint: fingerprint(data), phase: 'prepared' });
  const installed = fixture({ current: raw, pending: raw, marker: prepared });
  assert.equal(installed.api.consumePending().status, 'replayed'); assert.equal(installed.local.get(KEY), raw);
  assert.equal(JSON.parse(installed.local.get(SOURCE)).phase, 'complete');
  const retry = fixture({ current: JSON.stringify(defaults()), pending: raw, marker: prepared });
  assert.equal(retry.api.consumePending().status, 'imported');
  const old = clone(data); old.stats.xp = 900; const current = JSON.stringify(old);
  const conflicting = fixture({ current, pending: raw, marker: prepared });
  assert.equal(conflicting.api.consumePending().status, 'conflict'); assert.equal(conflicting.local.get(KEY), current);
  assert.equal(conflicting.local.get(SOURCE), prepared); assert.equal(conflicting.session.get(PENDING), raw);
});

test('기록 rollback도 막히면 기존 NAS 원문 백업과 pending을 남겨 두 복사본을 모두 복구할 수 있다', () => {
  const old = seed(); old.stats.xp = 900; const current = JSON.stringify(old), pending = JSON.stringify(seed()); let installed = false;
  const f = fixture({ current, pending, fail(op) {
    if (op.method !== 'set') return false;
    if (op.key === KEY && op.value === pending) installed = true;
    return installed && ((op.key === SOURCE && JSON.parse(op.value).phase === 'complete') || (op.key === KEY && op.value === current));
  } });
  assert.equal(f.api.importPending({ replace: true }).status, 'unavailable');
  assert.equal(f.local.get(BACKUP), current); assert.equal(f.session.get(PENDING), pending);
  assert.equal(f.local.get(KEY), pending);
});

test('동기 수신기는 DOM·네트워크·기존 앱 init 없이 로드되며 pending이 없으면 저장하지 않는다', () => {
  const f = fixture(); assert.equal(f.api.consumePending().status, 'empty');
  assert.equal(f.operations.some(op => op.method !== 'get'), false);
  assert.equal(f.c.FQ, undefined); assert.equal(typeof f.api.importJson, 'function');
  assert.doesNotMatch(code, /\bfetch\s*\(|\bXMLHttpRequest\b|\bpostMessage\s*\(|\bconsole\./);
});
