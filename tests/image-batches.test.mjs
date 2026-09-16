import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nextBatch, recordBatch, lintBatches, batchReport } from '../scripts/lib/image-batches.mjs';
import { writeLedger, readLedger, lintSettings, recordItem, LEDGER_PATH } from '../scripts/image-ledger.mjs';

const script = fileURLToPath(new URL('../scripts/image-ledger.mjs', import.meta.url));
const sentence = 'A single round brown animal standing with four short legs, two rounded ears and one long curved tail on pale ground.';
function item(id, category = '동물', extra = {}) {
  const [code, kind] = id.split('-');
  return { id, code, kind, category, subjectEn: sentence, status: 'approved-text', tries: 0, ...extra };
}
function fixture(extra = []) {
  return { styleChoice: 'b', templateVersion: 'FQ-IMG-v1', common: { style: 'fixture' }, items: [item('kr-landmark', undefined, { grade: 'S', status: 'approved-image' }), item('aa-symbol'), item('ab-symbol'), item('ac-symbol'), ...extra] };
}
const start = (ledger, no = 1, extra = {}) => recordBatch(ledger, { batch: no, id: 'kr-landmark', tries: 1, anchorOk: true, ...extra });
const record = (ledger, id, tries, status = 'approved-image', extra = {}) => recordBatch(ledger, { batch: 1, id, tries, status, ...extra });
const reject = (ledger, id, tries, failure = 'other', extra = {}) => record(ledger, id, tries, 'rejected', { failure, ...extra });
const temporary = (t) => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fq-batches-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory; };
const cli = (root, ...args) => spawnSync(process.execPath, [script, ...args, '--root', root], { encoding: 'utf8' });

test('next는 읽기만 하고 앵커 하나와 같은 카테고리를 최대 10개 반환한다', () => {
  const ledger = fixture(Array.from({ length: 20 }, (_, n) => item('x' + n + '-symbol')));
  ledger.items.push(item('zz-symbol', '식물'));
  const before = JSON.stringify(ledger), plan = nextBatch(ledger, { size: 10 });
  assert.equal(plan.anchor.id, 'kr-landmark');
  assert.equal(plan.items.length, 10);
  assert.ok(plan.items.every((entry) => entry.category === '동물'));
  assert.equal(JSON.stringify(ledger), before);
  for (const size of [0, 11, 12, 100, 1.2]) assert.throws(() => nextBatch(ledger, { size }), /1~10/);
});

test('카테고리 잔여 수가 적어도 다음 분류를 섞지 않고 상징물이 끝난 뒤 명소 S/A/B를 반환한다', () => {
  const ledger = fixture([item('dd-symbol', '식물'), item('fr-landmark', undefined, { grade: 'B' }), item('es-landmark', undefined, { grade: 'S' }), item('de-landmark', undefined, { grade: 'A' })]);
  assert.deepEqual(nextBatch(ledger).items.map((entry) => entry.id), ['aa-symbol', 'ab-symbol', 'ac-symbol']);
  for (const entry of ledger.items.filter((entry) => entry.kind === 'symbol')) entry.status = 'approved-image';
  assert.deepEqual(nextBatch(ledger).items.map((entry) => entry.id), ['es-landmark']);
});

test('미선택 화풍·영어 없는 앵커·승인 대기 소재는 자동으로 우회하지 않는다', () => {
  const ledger = fixture(); ledger.styleChoice = null;
  assert.throws(() => nextBatch(ledger), /화풍이 미정/);
  ledger.styleChoice = 'b'; ledger.items[0].subjectEn = null;
  assert.throws(() => nextBatch(ledger), /앵커의 영어/);
  ledger.items[0].subjectEn = sentence;
  ledger.items.slice(1).forEach((entry) => { entry.status = 'blocked-approval'; });
  assert.deepEqual(nextBatch(ledger).items, []);
});

test('회차 시작에는 명시적인 실제 앵커 판정이 필요하며 기준 항목의 승인 상태를 바꾸지 않는다', () => {
  const ledger = fixture(), original = structuredClone(ledger.items[0]);
  assert.throws(() => record(ledger, 'aa-symbol', 1), /첫 기록/);
  assert.throws(() => recordBatch(ledger, { batch: 1, id: 'kr-landmark', tries: 1 }), /첫 기록/);
  assert.equal(ledger.batches, undefined);
  const batch = start(ledger);
  assert.equal(batch.anchorOk, true);
  assert.deepEqual(ledger.items[0], original);
  assert.throws(() => nextBatch(ledger), /진행 중/);
});

test('앵커 불일치는 즉시 회차를 폐기하고 후보는 다음 회차에 그대로 남긴다', () => {
  const ledger = fixture(); start(ledger, 1, { anchorOk: false });
  assert.equal(ledger.batches[0].discarded, true);
  assert.equal(nextBatch(ledger).no, 2);
  assert.equal(nextBatch(ledger).items.length, 3);
});

test('회차는 축·카테고리 혼합과 중복 승인·시도 건너뛰기를 거부하고 오류 시 원장을 보존한다', () => {
  const ledger = fixture([item('zz-symbol', '식물'), item('zz-landmark', undefined, { grade: 'S' })]); start(ledger);
  for (const id of ['zz-symbol', 'zz-landmark']) assert.throws(() => record(ledger, id, 1), /섞을 수 없습니다/);
  assert.throws(() => record(ledger, 'aa-symbol', 2), /시도마다/);
  record(ledger, 'aa-symbol', 1);
  const before = JSON.stringify(ledger);
  assert.throws(() => record(ledger, 'aa-symbol', 2), /대기 항목/);
  assert.equal(JSON.stringify(ledger), before);
  assert.deepEqual(lintBatches(ledger), []);
});

test('앵커·재시도까지 12장에 도달하면 닫히고 새 이미지 기록이 거부된다', () => {
  const ledger = fixture(); start(ledger, 1, { tries: 10 });
  reject(ledger, 'aa-symbol', 1); record(ledger, 'aa-symbol', 2);
  assert.equal(ledger.batches[0].generatedCount, 12);
  assert.equal(ledger.batches[0].closeReason, 'image-limit');
  assert.throws(() => record(ledger, 'ab-symbol', 1), /종료된/);
  assert.deepEqual(lintBatches(ledger), []);
});

test('정상 회차는 10개 채택 후 닫히며 11번째 실제 항목으로 채우지 않는다', () => {
  const ledger = fixture(Array.from({ length: 10 }, (_, n) => item('y' + n + '-symbol'))); start(ledger);
  for (const entry of ledger.items.filter((entry) => entry.kind === 'symbol').slice(0, 10)) record(ledger, entry.id, 1);
  assert.equal(ledger.batches[0].items.length, 10);
  assert.equal(ledger.batches[0].closeReason, 'ten-items-complete');
});

test('3회 연속 스타일 이탈은 전체 회차 채택을 철회하고 다음 대기열로 돌린다', () => {
  const ledger = fixture(); start(ledger); record(ledger, 'aa-symbol', 1);
  for (let tries = 1; tries <= 3; tries++) reject(ledger, 'ab-symbol', tries, 'style-drift');
  const batch = ledger.batches[0];
  assert.equal(batch.discarded, true); assert.equal(batch.anchorOk, false);
  assert.equal(ledger.items.find((entry) => entry.id === 'aa-symbol').status, 'generated');
  assert.ok(nextBatch(ledger).items.some((entry) => entry.id === 'aa-symbol'));
  assert.equal(batch.items.length, 1, '폐기된 채택 이력은 삭제하지 않는다');
  assert.equal(batchReport(ledger).batchedApproved, 0);
  assert.deepEqual(lintBatches(ledger), []);
});

test('스타일 이탈 연속 수는 통과 판정으로 초기화된다', () => {
  const ledger = fixture(); start(ledger); reject(ledger, 'aa-symbol', 1, 'style-drift');
  record(ledger, 'aa-symbol', 2);
  reject(ledger, 'ab-symbol', 1, 'style-drift'); reject(ledger, 'ab-symbol', 2, 'style-drift');
  assert.equal(ledger.batches[0].discarded, false);
});

test('A군 2회 실패는 자동 번역 없이 회차를 닫고 수동 문장 보강·버전 갱신을 요구한다', () => {
  const ledger = fixture(); start(ledger); reject(ledger, 'aa-symbol', 1, 'a-group'); reject(ledger, 'aa-symbol', 2, 'a-group');
  const entry = ledger.items.find((entry) => entry.id === 'aa-symbol');
  assert.equal(entry.subjectEn, sentence);
  assert.equal(ledger.batches[0].closeReason, 'prompt-revision-required');
  assert.ok(!nextBatch(ledger).items.some((candidate) => candidate.id === 'aa-symbol'));
  entry.override = 'Exclude all decorative lettering.';
  assert.throws(() => start(ledger, 2), /templateVersion/);
  ledger.templateVersion = 'FQ-IMG-v2';
  assert.ok(nextBatch(ledger).items.some((candidate) => candidate.id === 'aa-symbol'));
  start(ledger, 2); record(ledger, 'aa-symbol', 3, 'approved-image', { batch: 2 });
  assert.equal(ledger.items.find((candidate) => candidate.id === 'aa-symbol').retryRequirement, undefined);
});

test('회차 중 프롬프트 수정은 기록을 거부하고 종료 후 새 버전을 요구한다', () => {
  const ledger = fixture(); start(ledger); ledger.items[1].override = 'Exclude decorations.';
  const before = JSON.stringify(ledger);
  assert.throws(() => record(ledger, 'aa-symbol', 1), /회차 중 프롬프트/);
  assert.equal(JSON.stringify(ledger), before);
  recordBatch(ledger, { batch: 1, close: true });
  assert.throws(() => start(ledger, 2), /templateVersion/);
  ledger.templateVersion = 'FQ-IMG-v2'; start(ledger, 2);
});

test('같은 나라의 다섯 번째 실패는 held로 보류하고 다른 축도 대기열에서 제외한다', () => {
  const ledger = fixture([item('aa-landmark', undefined, { grade: 'S' })]); start(ledger);
  for (let tries = 1; tries <= 5; tries++) reject(ledger, 'aa-symbol', tries);
  assert.equal(ledger.items[1].status, 'held');
  recordBatch(ledger, { batch: 1, close: true });
  ledger.items.filter((entry) => entry.kind === 'symbol' && entry.id !== 'aa-symbol').forEach((entry) => { entry.status = 'approved-image'; });
  assert.equal(nextBatch(ledger).items.length, 0);
  assert.equal(batchReport(ledger).held[0].id, 'aa-symbol');
});

test('네 번 실패 뒤 다섯 번째 성공은 보류하지 않는다', () => {
  const ledger = fixture(); start(ledger);
  for (let tries = 1; tries <= 4; tries++) reject(ledger, 'aa-symbol', tries);
  record(ledger, 'aa-symbol', 5);
  assert.equal(ledger.items[1].status, 'approved-image');
});

test('기존 무회차 승인은 소급 로그 없이 따로 집계하고 회차 누락·중복을 검출한다', () => {
  const ledger = fixture();
  assert.deepEqual(batchReport(ledger).unbatchedApproved, ['kr-landmark']);
  assert.equal(ledger.batches, undefined);
  start(ledger); record(ledger, 'aa-symbol', 1);
  assert.equal(batchReport(ledger).batchedApproved, 1);
  assert.deepEqual(lintBatches(ledger), []);
  ledger.batches[0].items.push('aa-symbol');
  assert.ok(lintBatches(ledger).some((error) => /중복/.test(error.message)));
  ledger.batches[0].items = [];
  assert.ok(lintBatches(ledger).some((error) => /누락/.test(error.message)));
});

test('직접 상태 덮어쓰기는 회차 연결을 훼손할 수 없지만 바이트 보완은 가능하다', () => {
  const ledger = fixture(); start(ledger); record(ledger, 'aa-symbol', 1);
  assert.throws(() => recordItem(ledger, 'aa-symbol', { status: 'rejected' }), /회차 항목/);
  recordItem(ledger, 'aa-symbol', { bytes: 110000 });
  assert.equal(ledger.items[1].bytes, 110000);
});

test('CLI next/record는 JSON과 CSV를 동기 갱신하고 lint가 수동 status 불일치를 검출한다', (t) => {
  const root = temporary(t), ledger = fixture(); writeLedger(ledger, root);
  const plan = cli(root, 'next', '--size', '2'); assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(plan.stdout).items.length, 2);
  const anchor = cli(root, 'record', '--batch', '7', '--id', 'kr-landmark', '--tries', '1', '--anchor-ok', 'true');
  assert.equal(anchor.status, 0, anchor.stderr);
  const result = cli(root, 'record', '--batch', '7', '--id', 'aa-symbol', '--tries', '1', '--status', 'approved-image', '--bytes', '12345');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(lintSettings(readLedger(root), root), []);
  const csv = path.join(root, 'docs/image-prompts/settings.csv');
  fs.writeFileSync(csv, fs.readFileSync(csv, 'utf8').replace('"approved-image"', '"rejected"'));
  assert.equal(lintSettings(readLedger(root), root).length, 1);
  const lint = cli(root, 'lint'); assert.equal(lint.status, 1); assert.match(lint.stdout, /settings-sync/);
});

test('CSV 교체가 실패하면 JSON도 이전 상태로 복구하여 서로 다른 회차 판정을 남기지 않는다', (t) => {
  const root = temporary(t), ledger = fixture(); writeLedger(ledger, root);
  const json = fs.readFileSync(path.join(root, LEDGER_PATH));
  const csv = fs.readFileSync(path.join(root, 'docs/image-prompts/settings.csv'));
  start(ledger); record(ledger, 'aa-symbol', 1);
  const original = fs.renameSync;
  t.mock.method(fs, 'renameSync', (source, destination) => {
    if (destination.endsWith('settings.csv')) throw new Error('synthetic CSV rename failure');
    return original(source, destination);
  });
  assert.throws(() => writeLedger(ledger, root), /synthetic CSV/);
  assert.deepEqual(fs.readFileSync(path.join(root, LEDGER_PATH)), json);
  assert.deepEqual(fs.readFileSync(path.join(root, 'docs/image-prompts/settings.csv')), csv);
});

test('회차를 닫았다 다시 열어도 같은 문장의 A군 두 번 실패 기록을 잃지 않는다', () => {
  const ledger = fixture(); start(ledger); reject(ledger, 'aa-symbol', 1, 'a-group');
  recordBatch(ledger, { batch: 1, close: true }); start(ledger, 2);
  reject(ledger, 'aa-symbol', 2, 'a-group', { batch: 2 });
  assert.equal(ledger.batches[1].closeReason, 'prompt-revision-required');
  assert.equal(batchReport(ledger).needsPromptRevision[0], 'aa-symbol');
});

test('회차에서 실패한 항목도 회차 없는 record로 시도·승인을 덮어쓸 수 없다', () => {
  const ledger = fixture(); start(ledger); reject(ledger, 'aa-symbol', 1);
  assert.throws(() => recordItem(ledger, 'aa-symbol', { status: 'approved-image' }), /회차 항목/);
  assert.throws(() => recordItem(ledger, 'aa-symbol', { tries: 0 }), /회차 항목/);
});
