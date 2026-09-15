/* SUBJECTS.csv와 이미지 원장에서 함께 쓰는 의존성 없는 CSV 읽기. */
import fs from 'node:fs';
import path from 'node:path';

export const SUBJECT_HEADERS = ['code', 'ko', '대륙', '상징물', '카테고리', '선정근거', '예비1', '예비2', '명소', '명소도시', '명소등급', '수도에있음', '기존fact재사용', '위험', '상태'];

export function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const records = [];
  let row = [], field = '', quoted = false, closed = false;
  const cell = () => { row.push(field); field = ''; closed = false; };
  const record = () => { cell(); records.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += char;
    } else if (char === ',') cell();
    else if (char === '\r' || char === '\n') {
      record();
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else if (closed) throw new Error('CSV 닫는 따옴표 뒤의 문자: ' + (i + 1));
    else if (char === '"') {
      if (field) throw new Error('CSV 필드 중간의 따옴표: ' + (i + 1));
      quoted = true;
    } else field += char;
  }
  if (quoted) throw new Error('CSV 닫히지 않은 따옴표');
  if (field || row.length || closed) record();
  if (!records.length) return [];
  const headers = records.shift();
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length) throw new Error('CSV 헤더가 비었거나 중복됩니다.');
  return records.map((values, index) => {
    if (values.length !== headers.length) throw new Error('CSV ' + (index + 2) + '행 열 수: ' + values.length + ' (기대 ' + headers.length + ')');
    return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
  });
}

export function readSubjects(root) {
  const rows = parseCsv(fs.readFileSync(path.join(root, 'docs/expansion/SUBJECTS.csv'), 'utf8'));
  if (!rows.length || Object.keys(rows[0]).length !== SUBJECT_HEADERS.length || SUBJECT_HEADERS.some((header) => !Object.hasOwn(rows[0], header))) {
    throw new Error('SUBJECTS.csv의 15개 헤더 이름을 확인하세요.');
  }
  return rows;
}
