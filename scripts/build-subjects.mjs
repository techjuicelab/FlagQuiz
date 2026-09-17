/* 한국어 주제 원문을 앱의 정적 자료로 옮긴다. 영어 번역·소재 승인은 하지 않는다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSubjects, crossCheck } from './lib/subjects.mjs';
import { readCountryCodes } from './lib/ne-join.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function buildSubjects(projectRoot = root) {
  const rows = readSubjects(projectRoot);
  crossCheck(rows, projectRoot);
  const codes = new Set(readCountryCodes(projectRoot));
  const seen = new Set();
  const subjects = {};
  for (const row of [...rows].sort((a, b) => a.code.localeCompare(b.code, 'en'))) {
    if (!codes.has(row.code) || seen.has(row.code)) throw new Error('주제 나라 코드가 없거나 중복됩니다: ' + row.code);
    seen.add(row.code);
    if (!row['상징물'].trim()) throw new Error('상징물이 없습니다: ' + row.code);
    const label = (value) => value.split('—')[0].trim();
    const subject = { symbol: { ko: label(row['상징물']), prompt: row['상징물'], cat: row['카테고리'] } };
    if (row['명소'].trim()) {
      if (!['S', 'A', 'B'].includes(row['명소등급'])) throw new Error('명소 등급 오류: ' + row.code);
      subject.place = { ko: label(row['명소']), prompt: row['명소'], city: row['명소도시'], grade: row['명소등급'] };
    }
    subjects[row.code] = subject;
  }
  const missing = [...codes].filter((code) => !seen.has(code));
  if (missing.length) throw new Error('주제에서 빠진 나라: ' + missing.join(', '));
  // 원문과 출제 대상은 CSV로 유지하고, 제작 중 검토한 짧은 이름만 화면에 반영한다.
  const ledgerPath = path.join(projectRoot, 'docs/image-prompts/presets.json');
  if (fs.existsSync(ledgerPath)) {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const ids = new Set();
    for (const item of ledger.items) {
      const axis = item.kind === 'landmark' ? 'place' : item.kind === 'symbol' ? 'symbol' : null;
      if (!axis || ids.has(item.id) || item.id !== item.code + '-' + item.kind || !subjects[item.code]?.[axis]) throw new Error('원장 소재가 원자료와 다릅니다: ' + item.id);
      ids.add(item.id);
      // 그림 재시도·보류는 이미 검토한 화면 이름을 원문 긴 문장으로 되돌리지 않는다.
      if (['agent-curated', 'approved-text', 'generated', 'approved-image', 'rejected', 'held'].includes(item.status) && item.subjectEn && item.koApprove?.trim()) {
        subjects[item.code][axis].ko = item.koApprove.trim();
      }
      // 보류는 조용한 빈칸이 아니라 원장에 적힌 기록이다. 소재 이름은 남기고 그림만 없다는 것을
      // 여기서 못 박아야 출제·도감·배포 게이트가 원장 하나만 보고 같은 판단을 한다.
      if (item.status === 'held') subjects[item.code][axis].noArt = true;
      // 검수한 그림의 바이트 수를 함께 싣는다. 서비스워커(sw.js warmArt)가 담아 둔 그림이 배포본과
      // 같은 크기인지 이것으로 보고, 같은 이름으로 교체된 그림을 새로 받는다.
      else if (Number.isSafeInteger(item.bytes) && item.bytes > 0) subjects[item.code][axis].bytes = item.bytes;
    }
  }
  const raw = JSON.parse(fs.readFileSync(path.join(projectRoot, 'docs/expansion/confusion-groups.json'), 'utf8'));
  const groups = raw.groups.map(({ name, axis, codes: groupCodes }) => {
    if (!name || !['상징물', '명소'].includes(axis) || !Array.isArray(groupCodes) || groupCodes.some((code) => !codes.has(code))) {
      throw new Error('혼동군 형식 또는 나라 코드 오류: ' + name);
    }
    return { name, axis, codes: groupCodes };
  });
  const emit = (key, value) => '/* 생성물: npm run subjects:build. 원문은 docs/expansion/, 검토한 화면 이름은 docs/image-prompts/presets.json에 있습니다. */\n' +
    '(function () {\n  var FQ = window.FQ = window.FQ || {};\n  FQ.' + key + ' = ' + JSON.stringify(value, null, 2) + ';\n})();\n';
  return { subjects, groups, files: { 'data/subjects.js': emit('subjects', subjects), 'data/confusion-groups.js': emit('confusionGroups', groups) } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildSubjects();
  for (const [file, content] of Object.entries(result.files)) fs.writeFileSync(path.join(root, file), content);
  console.log('주제 자료: 나라 ' + Object.keys(result.subjects).length + ', 명소 ' + Object.values(result.subjects).filter((s) => s.place).length + ', 혼동군 ' + result.groups.length);
}
