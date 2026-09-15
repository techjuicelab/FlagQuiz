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
      if (['agent-curated', 'approved-text', 'generated', 'approved-image'].includes(item.status) && item.subjectEn && item.koApprove?.trim()) {
        subjects[item.code][axis].ko = item.koApprove.trim();
      }
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
