/* SUBJECTS.csv와 이미지 원장에서 함께 쓰는 의존성 없는 CSV 읽기. */
import fs from 'node:fs';
import path from 'node:path';
import { readCountryCodes } from './ne-join.mjs';

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

export function crossCheck(rows, rootOrCodes = '.') {
  const expected = new Set(Array.isArray(rootOrCodes) ? rootOrCodes : readCountryCodes(rootOrCodes));
  const seen = new Set();
  const errors = [];
  for (const row of rows) {
    if (!/^[a-z]{2}$/.test(row.code) || !expected.has(row.code)) errors.push('없는 코드 ' + row.code);
    if (seen.has(row.code)) errors.push('중복 코드 ' + row.code);
    seen.add(row.code);
  }
  for (const code of expected) if (!seen.has(code)) errors.push('빠진 코드 ' + code);
  if (errors.length) throw new Error('주제 나라 대조 실패: ' + errors.join(', '));
  return true;
}

export function toItems(rows) {
  return [...rows].sort((a, b) => a.code.localeCompare(b.code, 'en')).flatMap((row) => {
    return [['symbol', '상징물'], ['landmark', '명소']].filter(([, column]) => row[column].trim()).map(([kind, column]) => {
      const label = row[column].split('—')[0].trim();
      const place = kind === 'landmark';
      return {
        id: row.code + '-' + kind, code: row.code, kind,
        koRaw: row[column], koApprove: label.length >= 2 && label.length <= 10 ? label : null,
        subjectEn: null, accuracy: place, override: null, substitutedFrom: null, keepsBackdrop: false,
        continent: row['대륙'], ...(place ? { grade: row['명소등급'], city: row['명소도시'] } : { category: row['카테고리'] }),
        inCapital: place && row['수도에있음'] === 'Y', factReuse: row['기존fact재사용'].trim() ? row['기존fact재사용'] : null,
        riskNote: row['위험'], confusionGroups: [], csvStatus: row['상태'],
        status: row['상태'] === 'draft' ? 'blocked-approval' : 'draft', tries: 0, bytes: null,
        outputStem: 'images/' + (place ? 'places/' : 'symbols/') + row.code
      };
    });
  });
}

export function counts(rows) {
  const tally = (values) => values.reduce((out, value) => { out[value] = (out[value] || 0) + 1; return out; }, {});
  const places = rows.filter((row) => row['명소'].trim());
  return {
    rows: rows.length, symbols: rows.filter((row) => row['상징물'].trim()).length, places: places.length,
    grades: tally(rows.map((row) => row['명소등급'] || 'blank')),
    statuses: tally(rows.map((row) => row['상태'])),
    inCapital: places.filter((row) => row['수도에있음'] === 'Y').length,
    factReuse: rows.filter((row) => row['기존fact재사용'].trim()).length,
    continents: tally(rows.map((row) => row['대륙'])),
    placesByContinent: tally(places.map((row) => row['대륙']))
  };
}
