import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSubjects } from '../scripts/build-subjects.mjs';
import { readSubjects } from '../scripts/lib/subjects.mjs';

test('주제 빌드는 원자료를 손실 없이 결정적으로 정적 파일에 옮긴다', () => {
  const first = buildSubjects();
  assert.deepEqual(first, buildSubjects());
  assert.equal(Object.keys(first.subjects).length, 194);
  assert.equal(Object.values(first.subjects).filter((s) => s.place).length, 148);
  assert.equal(first.groups.length, 58);
  assert.equal(first.files['data/subjects.js'].includes('"code"'), false);
  for (const row of readSubjects(new URL('..', import.meta.url).pathname)) {
    assert.equal(first.subjects[row.code].symbol.prompt, row['상징물']);
    if (row['명소'].trim()) assert.equal(first.subjects[row.code].place.prompt, row['명소']);
    else assert.equal(Object.hasOwn(first.subjects[row.code], 'place'), false);
  }
  assert.match(first.subjects.af.place.prompt, /,/);
  for (const [file, content] of Object.entries(first.files)) assert.equal(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), content);
});
