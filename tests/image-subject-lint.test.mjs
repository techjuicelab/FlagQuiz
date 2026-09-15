import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lintLedger, readLedger } from '../scripts/image-ledger.mjs';

const sentence = 'A small red clay teapot with a round body, short curved spout, smooth loop handle and a matching flat lid.';
const item = (subjectEn = sentence, patch = {}) => ({ id: 'zz-symbol', kind: 'symbol', koRaw: '찻주전자', subjectEn, confusionGroups: [], ...patch });
const check = (entry) => lintLedger({ items: [entry] });

test('영어 문장 lint: ASCII 밖 문자는 해당 항목의 오류다', () => {
  assert.deepEqual(check(item(sentence.replace('teapot', '찻주전자'))).errors.map((e) => e.rule), ['ascii']);
});
test('영어 문장 lint: 18~35단어이며 하이픈 복합어는 한 단어다', () => {
  assert.deepEqual(check(item('A teapot.')).errors.map((e) => e.rule), ['word-count']);
  assert.equal(check(item(sentence.replace('red', 'blue-grey'))).errors.length, 0);
});
test('영어 문장 lint: 금지 형용사는 단어 경계로 검사한다', () => {
  assert.deepEqual(check(item(sentence.replace('small', 'majestic'))).errors.map((e) => e.rule), ['adjective']);
});
test('영어 문장 lint: 금지 명사와 surface·design을 혼동하지 않는다', () => {
  assert.deepEqual(check(item(sentence.replace('teapot', 'flag'))).errors.map((e) => e.rule), ['noun']);
  assert.equal(check(item(sentence.replace('body', 'surface').replace('lid', 'design'))).errors.length, 0);
});
test('영어 문장 lint: 마침표 누락과 줄바꿈은 오류다', () => {
  assert.deepEqual(check(item(sentence.slice(0, -1))).errors.map((e) => e.rule), ['sentence']);
  assert.deepEqual(check(item(sentence.replace('red ', 'red\n'))).errors.map((e) => e.rule), ['sentence']);
});
test('영어 문장 lint: 항목 간 같은 문장을 거부한다', () => {
  const result = lintLedger({ items: [item(), item(sentence, { id: 'aa-symbol' })] });
  assert.deepEqual(result.errors.map((e) => [e.id, e.rule]), [['aa-symbol', 'duplicate']]);
});
test('영어 문장 lint: 한국어 개수에 영어 수사가 없으면 경고만 낸다', () => {
  const result = check(item(sentence, { koRaw: '두 개의 찻주전자' }));
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.warnings.map((e) => e.rule), ['number']);
  assert.equal(check(item(sentence.replace('A small', 'One small'), { koRaw: '한 개의 찻주전자' })).warnings.length, 0);
});
test('영어 문장 lint: 짧은 명소 문장은 실루엣 검토 경고다', () => {
  const result = check(item(sentence, { kind: 'landmark' }));
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.warnings.map((e) => e.rule), ['silhouette']);
});
test('영어 문장 lint: 혼동군 중첩에 구별 단어가 없으면 경고다', () => {
  const result = check(item('A pottery teapot with a body and a spout and a handle and a lid made entirely from clay.', { confusionGroups: ['a', 'b'] }));
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.warnings.map((e) => e.rule), ['distinction']);
});
test('실제 원장의 null 영어 문장은 실패가 아니라 미작성으로 센다', () => {
  const ledger = readLedger(), result = lintLedger(ledger);
  assert.equal(result.errors.length, 0);
  assert.equal(result.unwritten, ledger.items.filter((entry) => !entry.subjectEn).length);
});
test('lint CLI는 금지 문구에서 1, 미작성·경고만 있으면 0으로 끝난다', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flagquiz-lint-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'docs/image-prompts'), { recursive: true });
  const run = (entry) => {
    fs.writeFileSync(path.join(directory, 'docs/image-prompts/presets.json'), JSON.stringify({ items: [entry] }));
    return spawnSync(process.execPath, [new URL('../scripts/image-ledger.mjs', import.meta.url).pathname, 'lint', '--root', directory], { encoding: 'utf8' });
  };
  const invalid = run(item(sentence.replace('small', 'majestic')));
  assert.equal(invalid.status, 1); assert.match(invalid.stdout, /zz-symbol.*majestic/);
  assert.equal(run(item(null)).status, 0);
  assert.equal(run(item(sentence, { kind: 'landmark' })).status, 0);
});
