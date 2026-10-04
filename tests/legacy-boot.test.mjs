import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../js/legacy-boot.js', import.meta.url), 'utf8');
function fixture(initial = 'empty', confirm = false) {
  const events = new Map(), nodes = new Map(), calls = [], timers = [];
  for (const id of ['legacy-record-note', 'legacy-import-message', 'settings-import-file', 'settings-import-status'])
    nodes.set(id, { hidden: true, textContent: '', innerHTML: '', value: 'selected', click() { calls.push('choose-file'); } });
  const records = {
    consumePending() { calls.push('consume'); return { status: initial }; },
    discardPending() { calls.push('discard'); return { status: 'discarded' }; },
    importPending(options) { calls.push(['pending', options.replace]); return { status: 'imported' }; },
    importJson(raw, options) { calls.push(['file', options.replace]); return { status: options.replace ? 'imported' : 'conflict' }; }
  };
  const c = { FQLegacyRecords: records, document: { readyState: 'complete', getElementById: id => nodes.get(id),
    addEventListener: (name, handler) => events.set(name, handler) },
    confirm: () => confirm, location: { reload() { calls.push('reload'); } }, setTimeout: handler => timers.push(handler) };
  c.window = c; vm.runInNewContext(source, c);
  return { c, calls, nodes, events, timers };
}
test('handoff와 복원 bootstrap은 storage loader보다 먼저 실행하며 offline shell에도 포함한다', async () => {
  const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('src="login-legacy.js"') < html.indexOf('src="js/legacy-records.js"'));
  assert.ok(html.indexOf('src="js/legacy-records.js"') < html.indexOf('src="js/legacy-boot.js"'));
  assert.ok(html.indexOf('src="js/legacy-boot.js"') < html.indexOf('src="js/storage.js"'));
  const worker = await fs.readFile(new URL('../sw.js', import.meta.url), 'utf8');
  for (const file of ['login-legacy.js', 'js/legacy-records.js', 'js/legacy-boot.js']) assert.ok(worker.includes("'./" + file + "'"));
});
test('자동 복원 안내는 reload나 확인 없이 나타났다 사라진다', () => {
  const f = fixture('imported'); assert.deepEqual(f.calls, ['consume']);
  assert.equal(f.nodes.get('legacy-record-note').hidden, false); assert.match(f.nodes.get('legacy-record-note').textContent, /이어/);
  f.timers[0](); assert.equal(f.nodes.get('legacy-record-note').hidden, true);
});
test('NAS 기존 기록 충돌은 놀이를 막지 않으며 명시적 선택 이전에 덮어쓰지 않는다', () => {
  const f = fixture('conflict'); assert.match(f.nodes.get('legacy-record-note').innerHTML, /지금 놀이를 계속/);
  f.events.get('click')({ target: { id: 'legacy-import-pending' } }); assert.deepEqual(f.calls, ['consume']);
  f.events.get('click')({ target: { id: 'legacy-keep-current' } }); assert.deepEqual(f.calls, ['consume', 'discard']);
  assert.equal(f.nodes.get('legacy-record-note').hidden, true);
});
test('이전 기록을 선택한 경우에만 backup을 만드는 수신기를 호출하고 reload한다', () => {
  const f = fixture('conflict', true); f.events.get('click')({ target: { id: 'legacy-import-pending' } });
  assert.deepEqual(f.calls, ['consume', ['pending', true], 'reload']);
});
test('파일 충돌의 취소는 기록을 변경하지 않고 다시 선택할 수 있다', async () => {
  const f = fixture(), input = f.nodes.get('settings-import-file');
  input.id = 'settings-import-file'; input.files = [{ size: 3, text: async () => '{}' }];
  f.events.get('change')({ target: input }); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.calls, ['consume', ['file', false]]); assert.equal(input.value, '');
  assert.match(f.nodes.get('settings-import-status').textContent, /지금 기록/);
});
test('크기 초과 파일과 파일 읽기 실패는 importer나 reload를 호출하지 않는다', async () => {
  for (const file of [{ size: 524289, text() { assert.fail('oversized file read'); } }, { size: 10, text: async () => { throw Error(); } }]) {
    const f = fixture(), input = f.nodes.get('settings-import-file'); input.id = 'settings-import-file'; input.files = [file];
    f.events.get('change')({ target: input }); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.calls, ['consume']); assert.equal(input.value, '');
  }
});
