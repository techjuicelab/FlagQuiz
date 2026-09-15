import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readLedger, writeLedger } from '../scripts/image-ledger.mjs';
import { buildPrompt, buildPrompts, selectItems } from '../scripts/build-image-prompts.mjs';

const pilot = fs.readFileSync(new URL('../docs/expansion/PILOT.md', import.meta.url), 'utf8');
const original = (id) => pilot.split('### ' + id + '. ')[1].split('```text\n')[1].split('\n```')[0];
const sentences = { 'cn-symbol': original('A4').split('\n')[0], 'cn-landmark': original('A5').split('\n')[0] };
function ledger() {
  const ledger = readLedger();
  ledger.items = ledger.items.filter((item) => Object.hasOwn(sentences, item.id)).map((item) => ({ ...item, subjectEn: sentences[item.id], status: 'agent-curated' }));
  return ledger;
}
function fixture(t, value = ledger()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flagquiz-prompts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeLedger(value, root);
  return root;
}

test('A/B 조립은 기존 중국 파일럿 전문과 공백까지 같고 공통 블록을 고치지 않는다', () => {
  const value = ledger();
  for (const [style, ids] of [['a', ['A4', 'A5']], ['b', ['B4', 'B5']]]) for (let i = 0; i < 2; i++) {
    const item = value.items.find((item) => item.id === (i ? 'cn-landmark' : 'cn-symbol'));
    assert.equal(buildPrompt(item, value, style), original(ids[i]) + '\n');
    for (const block of Object.values(value.common.styles[style]).filter(Boolean)) assert.ok(buildPrompt(item, value, style).includes(block));
  }
});

test('B 조립 순서는 SUBJECT·ACCURACY·OVERRIDE·공통 4문단이며 정확도는 명소에만 붙는다', () => {
  const value = ledger(), place = value.items.find((item) => item.kind === 'landmark');
  place.override = 'OVERRIDE for this image only: keep the outline unchanged.';
  const result = buildPrompt(place, value, 'b');
  const markers = ['SUBJECT:', 'ACCURACY:', 'OVERRIDE for', 'COMPOSITION (', 'STYLE (', 'DO NOT INCLUDE:', 'OUTPUT:'];
  const positions = markers.map((marker) => result.indexOf(marker));
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
  assert.ok(!buildPrompt(value.items.find((item) => item.kind === 'symbol'), value, 'b').includes('ACCURACY:'));
});

test('두 번 조립해도 같은 바이트이며 stdout은 텍스트 외 파일을 쓰지 않는다', (t) => {
  const root = fixture(t);
  const first = buildPrompts({ root, style: 'b' });
  const second = buildPrompts({ root, style: 'b' });
  assert.deepEqual(first, second);
  for (const output of first.written) assert.equal(fs.readFileSync(output.path, 'utf8'), output.content);
  const output = buildPrompts({ root, style: 'b', ids: 'cn-symbol', out: 'stdout-only', stdout: true });
  assert.equal(output.written.length, 1);
  assert.equal(fs.existsSync(path.join(root, 'stdout-only')), false);
});

test('미작성·승인 대기는 제외하고 선택한 항목의 오래된 프롬프트만 지운다', (t) => {
  const value = ledger(), root = fixture(t, value);
  buildPrompts({ root, style: 'b' });
  value.items.find((item) => item.kind === 'symbol').subjectEn = null;
  value.items.find((item) => item.kind === 'landmark').status = 'blocked-approval';
  writeLedger(value, root);
  const result = buildPrompts({ root, style: 'b' });
  assert.equal(result.written.length, 0);
  assert.equal(result.skipped.unwritten.length, 1);
  assert.equal(result.skipped.blocked.length, 1);
  assert.equal(fs.readdirSync(path.join(root, 'docs/image-prompts/prompts')).length, 0);
});

test('화풍 미선택은 force·다른 출력 경로로도 우회할 수 없고 불일치는 명시해야 한다', (t) => {
  const value = ledger(), root = fixture(t, value);
  assert.throws(() => buildPrompts({ root, style: 'a' }), /확정 화풍/);
  assert.equal(buildPrompts({ root, style: 'a', force: true }).written.length, 2);
  value.styleChoice = null; writeLedger(value, root);
  assert.throws(() => buildPrompts({ root, style: 'b', force: true, out: 'elsewhere' }), /styleChoice/);
  assert.equal(fs.existsSync(path.join(root, 'elsewhere')), false);
});

test('lint 오류는 어느 파일도 쓰기 전에 조립 전체를 중단한다', (t) => {
  const value = ledger(); value.items[0].subjectEn = value.items[0].subjectEn.replace('single', 'majestic');
  const root = fixture(t, value);
  assert.throws(() => buildPrompts({ root, style: 'b' }), /adjective/);
  assert.equal(fs.existsSync(path.join(root, 'docs/image-prompts/prompts')), false);
});

test('항목 선택은 나라·축·명시 id를 구분하고 오타를 거부한다', () => {
  const value = readLedger();
  assert.equal(selectItems(value, { codes: 'cn' }).length, 2);
  assert.deepEqual(selectItems(value, { codes: 'cn', kind: 'symbol' }).map((item) => item.id), ['cn-symbol']);
  const ids = ['kr-landmark','jp-landmark','cn-symbol','cn-landmark','be-symbol','nl-landmark','ve-landmark','bf-symbol'];
  assert.deepEqual(selectItems(value, { ids }).map((item) => item.id).sort(), [...ids].sort());
  assert.throws(() => selectItems(value, { ids: ['xx-symbol'] }), /없는 값/);
});

test('A 헤더 제거는 명시했을 때만 적용되고 CLI stdout 본문에는 집계가 섞이지 않는다', (t) => {
  const value = ledger(), subject = value.items[0];
  assert.ok(buildPrompt(subject, value, 'a').includes('STYLE LOCK'));
  assert.ok(!buildPrompt(subject, value, 'a', { dropBlockHeaders: true }).includes('STYLE LOCK'));
  const root = fixture(t, value);
  const result = spawnSync(process.execPath, [new URL('../scripts/build-image-prompts.mjs', import.meta.url).pathname, '--root', root, '--style', 'b', '--ids', subject.id, '--stdout'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, buildPrompt(subject, value, 'b'));
  assert.match(result.stderr, /조립 1건/);
});
