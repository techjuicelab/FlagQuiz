import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSubjects } from '../scripts/build-subjects.mjs';
import { readSubjects } from '../scripts/lib/subjects.mjs';

test('주제 빌드는 원자료를 손실 없이 결정적으로 정적 파일에 옮긴다', () => {
  const first = buildSubjects();
  assert.deepEqual(first, buildSubjects());
  assert.equal(Object.keys(first.subjects).length, 194);
  assert.equal(Object.values(first.subjects).filter((s) => s.place).length, 148);
  assert.equal(first.groups.length, 58);
  assert.equal(first.files['data/subjects.js'].includes('"code"'), false);
  // pathname 은 공백·한글 경로를 %20 처럼 남겨 두어 fs 가 못 연다. fileURLToPath 로 실제 경로를 만든다.
  for (const row of readSubjects(fileURLToPath(new URL('..', import.meta.url)))) {
    assert.equal(first.subjects[row.code].symbol.prompt, row['상징물']);
    if (row['명소'].trim()) assert.equal(first.subjects[row.code].place.prompt, row['명소']);
    else assert.equal(Object.hasOwn(first.subjects[row.code], 'place'), false);
  }
  assert.match(first.subjects.af.place.prompt, /,/);
  const ledger = JSON.parse(fs.readFileSync(new URL('../docs/image-prompts/presets.json', import.meta.url), 'utf8'));
  for (const item of ledger.items.filter(i => ['agent-curated', 'approved-text', 'generated', 'approved-image'].includes(i.status))) {
    assert.equal(first.subjects[item.code][item.kind === 'landmark' ? 'place' : 'symbol'].ko, item.koApprove);
  }
  for (const [file, content] of Object.entries(first.files)) assert.equal(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), content);
});
