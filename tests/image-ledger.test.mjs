import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedLedger, readLedger, writeLedger, extractCommon, recordItem, reportLedger, LEDGER_PATH } from '../scripts/image-ledger.mjs';
import { parseCsv, readSubjects } from '../scripts/lib/subjects.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flagquiz-ledger-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const file of ['docs/expansion/SUBJECTS.csv', 'docs/expansion/confusion-groups.json', 'docs/expansion/IMAGE-PROMPTS.md', 'data/countries.js']) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(directory, file));
  }
  return directory;
}

test('시드 기본 화풍은 null이고 명시한 B 선택·기존 작업값은 재실행해도 보존된다', (t) => {
  const directory = fixture(t);
  assert.equal(seedLedger(directory).styleChoice, null);
  const ledger = seedLedger(directory, { styleChoice: 'b' });
  Object.assign(ledger.items[0], { subjectEn: 'Existing curated sentence.', tries: 2, bytes: 70000, status: 'agent-curated', curation: { by: 'human fixture' } });
  writeLedger(ledger, directory);
  const before = fs.readFileSync(path.join(directory, LEDGER_PATH));
  const csvBefore = fs.readFileSync(path.join(directory, 'docs/image-prompts/settings.csv'));
  seedLedger(directory);
  assert.deepEqual(fs.readFileSync(path.join(directory, LEDGER_PATH)), before);
  assert.deepEqual(fs.readFileSync(path.join(directory, 'docs/image-prompts/settings.csv')), csvBefore);
});

test('시드 342개는 승인·영어를 만들지 않고 출처 계수와 축별 혼동군을 보존한다', (t) => {
  const directory = fixture(t), ledger = seedLedger(directory);
  const report = reportLedger(ledger, readSubjects(directory));
  assert.deepEqual([report.items, report.symbols, report.landmarks, report.inCapital, report.factReuseRows, report.factReuseItems], [342,194,148,24,118,220]);
  assert.equal(report.statuses['blocked-approval'], 59);
  assert.equal(report.unwritten, 342);
  assert.ok(ledger.items.filter((item) => item.csvStatus === 'draft').every((item) => item.status === 'blocked-approval'));
  assert.ok(!JSON.stringify(ledger.items).includes('COMPOSITION (identical'));
  const groups = JSON.parse(fs.readFileSync(path.join(root, 'docs/expansion/confusion-groups.json'))).groups;
  for (const item of ledger.items) for (const name of item.confusionGroups) {
    assert.ok(groups.some((g) => g.name === name && g.codes.includes(item.code) && g.axis === (item.kind === 'symbol' ? '상징물' : '명소')));
  }
  const settings = parseCsv(fs.readFileSync(path.join(directory, 'docs/image-prompts/settings.csv'), 'utf8'));
  assert.equal(settings.length, 342);
  assert.deepEqual(settings.map((r) => r.code + '-' + r.kind), ledger.items.map((item) => item.id));
});

test('공통 문단은 원문과 같고 화풍당 한 번만 저장된다', (t) => {
  const ledger = seedLedger(fixture(t));
  assert.deepEqual(ledger.common, extractCommon(root));
  const text = JSON.stringify(ledger);
  for (const block of Object.values(ledger.common.styles.b)) assert.equal(text.split(JSON.stringify(block).slice(1, -1)).length - 1, 1);
  const pilot = fs.readFileSync(path.join(root, 'docs/expansion/PILOT.md'), 'utf8').split('### B4. ')[1].split('```text\n')[1].split('\n```')[0];
  for (const block of Object.values(ledger.common.styles.b)) assert.ok(pilot.includes(block));
  assert.ok(!ledger.common.styles.b.output.includes('────'));
});

test('바이트 기록은 승인 상태를 바꾸지 않고 잘못된 입력은 원장을 변경하지 않는다', (t) => {
  const directory = fixture(t), ledger = seedLedger(directory);
  const item = ledger.items[0], status = item.status;
  recordItem(ledger, item.id, { bytes: 1234, tries: 1, generatedAt: '2026-09-15' });
  assert.equal(item.status, status);
  writeLedger(ledger, directory);
  assert.equal(readLedger(directory).items[0].bytes, 1234);
  const snapshot = JSON.stringify(ledger);
  for (const patch of [{ bytes: -1 }, { tries: 0.5 }, { status: 'unknown' }, { outputStem: '../elsewhere' }]) assert.throws(() => recordItem(ledger, item.id, patch));
  assert.equal(JSON.stringify(ledger), snapshot);
});
