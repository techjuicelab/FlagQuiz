import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { parseCsv, readSubjects, toItems, counts, crossCheck } from '../scripts/lib/subjects.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('CSV는 인용 쉼표·이스케이프·필드 줄바꿈·CRLF·BOM과 끝 빈 필드를 보존한다', () => {
  assert.deepEqual(parseCsv('\uFEFFb,a,c\r\n"two,parts","say ""yes""",\r\n"line\r\nbreak",plain,""'), [
    { b: 'two,parts', a: 'say "yes"', c: '' }, { b: 'line\r\nbreak', a: 'plain', c: '' }
  ]);
  assert.deepEqual(parseCsv('x,y\na,b\n'), [{ x: 'a', y: 'b' }]);
});

test('CSV의 닫히지 않은 인용·중복 헤더·ragged 행은 조용히 손실시키지 않는다', () => {
  for (const text of ['a,b\n"x', 'a,a\nx,y', 'a,b\nx', 'a,b\n"x"oops,y', 'a,b\nx"x,y']) assert.throws(() => parseCsv(text), /CSV/);
});

test('실제 SUBJECTS는 15열·194행이며 두 축으로 342개가 된다', () => {
  const rows = readSubjects(root), items = toItems(rows);
  assert.equal(rows.length, 194);
  assert.ok(rows.every((row) => Object.keys(row).length === 15));
  assert.equal(crossCheck(rows, root), true);
  assert.equal(items.length, 342);
  assert.equal(items.filter((item) => item.kind === 'symbol').length, 194);
  assert.equal(items.filter((item) => item.kind === 'landmark').length, 148);
  // 24 = 명소도시가 그 나라 수도와 같은 행 수(2026-09-17 정정: az·th·ee·li·lv·se·cg 7행이 Y 없이 남아 있었다).
  // '수도 인근'(mv·ao·ng·sn·dm)은 수도 밖이라 세지 않는다.
  assert.equal(items.filter((item) => item.inCapital).length, 24);
  assert.ok(items.filter((item) => item.inCapital).every((item) => item.kind === 'landmark'));
  assert.equal(items.filter((item) => item.factReuse).length, 220);
  assert.equal(items.filter((item) => item.status === 'blocked-approval').length, 59);
  assert.ok(items.every((item) => item.subjectEn === null));
  assert.match(rows.find((r) => r.code === 'af')['명소'], /,/);
  assert.match(rows.find((r) => r.code === 've')['상징물'], /^트루피알 —/);
  assert.equal(toItems([{ ...rows[0], 상징물: ' ', 명소: '\t' }]).length, 0);
});

test('원자료 계수는 등급·상태·대륙별로 정확한 기준값을 고정한다', () => {
  assert.deepEqual(counts(readSubjects(root)), {
    rows: 194, symbols: 194, places: 148, grades: { S: 25, A: 61, B: 62, blank: 46 },
    statuses: { final: 148, draft: 31, 'fixed-r1': 15 }, inCapital: 24, factReuse: 118,
    continents: { 아시아: 46, 유럽: 45, 아프리카: 54, 북아메리카: 23, 남아메리카: 12, 오세아니아: 14 },
    placesByContinent: { 아시아: 36, 유럽: 38, 아프리카: 42, 북아메리카: 14, 남아메리카: 7, 오세아니아: 11 }
  });
});

test('나라 대조는 빠짐·고아·중복을 양방향으로 거부한다', () => {
  assert.throws(() => crossCheck([{ code: 'kr' }], ['kr', 'jp']), /빠진 코드 jp/);
  assert.throws(() => crossCheck([{ code: 'kr' }, { code: 'tw' }], ['kr']), /없는 코드 tw/);
  assert.throws(() => crossCheck([{ code: 'kr' }, { code: 'kr' }], ['kr']), /중복 코드 kr/);
});
