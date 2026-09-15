/* 이미지 원장이 정본이고 settings.csv는 같은 내용을 읽기 편하게 펼친 표다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContactSheets } from './lib/image-contact.mjs';
import { readSubjects, toItems, counts, crossCheck } from './lib/subjects.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = 'docs/image-prompts/presets.json';
export const SETTINGS_HEADERS = ['code', 'kind', 'koApprove', 'subjectEn', 'inCapital', 'override유무', 'substitutedFrom', 'status', 'tries', '생성일'];
export const STATUSES = ['blocked-approval', 'draft', 'agent-curated', 'approved-text', 'generated', 'approved-image', 'rejected'];

export function readLedger(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, LEDGER_PATH), 'utf8'));
}

export function extractCommon(root = ROOT) {
  const document = fs.readFileSync(path.join(root, 'docs/expansion/IMAGE-PROMPTS.md'), 'utf8');
  const block = (heading) => {
    const section = document.split('### ' + heading)[1];
    if (!section?.includes('```text\n')) throw new Error('공통 프롬프트 블록이 없습니다: ' + heading);
    return section.split('```text\n')[1].split('\n```')[0];
  };
  const symbol = block('B-상징물 템플릿'), landmark = block('B-랜드마크 템플릿');
  const markers = { composition: 'COMPOSITION (', style: 'STYLE (', exclusions: 'DO NOT INCLUDE:', output: 'OUTPUT:' };
  const b = {};
  for (const [key, prefix] of Object.entries(markers)) {
    b[key] = symbol.split('\n').find((part) => part.startsWith(prefix));
    const other = landmark.split('\n').find((part) => part.startsWith(prefix));
    if (!b[key] || b[key] !== other) throw new Error('B 상징물·명소의 공통 문단이 다릅니다: ' + key);
  }
  return {
    tool: '내장 image_gen (구체적 모델 버전은 생성 도구가 제공한 경우에만 기록)',
    aspect: '4:3',
    accuracy: landmark.split('\n').find((line) => line.startsWith('ACCURACY:')),
    styles: {
      // A의 composition과 output은 원본 style 안에 포함되어 있어 중복 저장하지 않는다.
      a: { composition: '', style: block('A-스타일 블록'), exclusions: block('A-금지 블록'), output: '' },
      b
    }
  };
}

export function settingsCsv(ledger) {
  const quoted = (value) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const rows = ledger.items.map((item) => [item.code, item.kind, item.koApprove, item.subjectEn, item.inCapital,
    item.override ? 'Y' : 'N', item.substitutedFrom, item.status, item.tries, item.generatedAt || '']);
  return [SETTINGS_HEADERS, ...rows].map((row) => row.map(quoted).join(',')).join('\n') + '\n';
}

export function writeLedger(ledger, root = ROOT) {
  const files = {
    [LEDGER_PATH]: JSON.stringify(ledger, null, 2) + '\n',
    'docs/image-prompts/settings.csv': settingsCsv(ledger)
  };
  for (const [file, content] of Object.entries(files)) {
    const destination = path.join(root, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = destination + '.tmp-' + process.pid;
    try { fs.writeFileSync(temporary, content); fs.renameSync(temporary, destination); }
    finally { fs.rmSync(temporary, { force: true }); }
  }
}

export function seedLedger(root = ROOT, options = {}) {
  if (options.styleChoice !== undefined && options.styleChoice !== null && !['a', 'b'].includes(options.styleChoice)) throw new Error('화풍은 a/b/null만 가능합니다.');
  const rows = readSubjects(root);
  crossCheck(rows, root);
  const groups = JSON.parse(fs.readFileSync(path.join(root, 'docs/expansion/confusion-groups.json'), 'utf8')).groups;
  const existing = fs.existsSync(path.join(root, LEDGER_PATH)) ? readLedger(root) : null;
  const previous = new Map((existing?.items || []).map((item) => [item.id, item]));
  if (previous.size !== (existing?.items.length || 0)) throw new Error('원장에 중복 id가 있습니다.');
  const items = toItems(rows).map((item) => {
    const axis = item.kind === 'symbol' ? '상징물' : '명소';
    item.confusionGroups = groups.filter((group) => group.axis === axis && group.codes.includes(item.code)).map((group) => group.name);
    const old = previous.get(item.id);
    if (old && (old.code !== item.code || old.kind !== item.kind || old.koRaw !== item.koRaw)) {
      throw new Error('원장 소재가 바뀌었습니다. 작업값을 검토한 뒤 갱신하세요: ' + item.id);
    }
    previous.delete(item.id);
    return { ...item, ...old };
  });
  if (previous.size) throw new Error('원자료에서 없어진 원장 항목: ' + [...previous.keys()].join(', '));
  const ledger = {
    created: existing?.created || options.created || new Date().toISOString().slice(0, 10),
    templateVersion: 'FQ-IMG-v1', styleChoice: null, common: extractCommon(root),
    ...existing, items
  };
  if (options.styleChoice !== undefined) ledger.styleChoice = options.styleChoice;
  writeLedger(ledger, root);
  for (const folder of ['prompts', 'anchor']) {
    const directory = path.join(root, 'docs/image-prompts', folder);
    fs.mkdirSync(directory, { recursive: true });
    const keep = path.join(directory, '.gitkeep');
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, '');
  }
  return ledger;
}

export function recordItem(ledger, id, patch) {
  const item = ledger.items.find((entry) => entry.id === id);
  if (!item) throw new Error('원장 항목이 없습니다: ' + id);
  const allowed = new Set(['bytes', 'tries', 'status', 'generatedAt']);
  for (const key of Object.keys(patch)) if (!allowed.has(key)) throw new Error('기록할 수 없는 필드: ' + key);
  for (const key of ['bytes', 'tries']) if (Object.hasOwn(patch, key) && (!Number.isSafeInteger(patch[key]) || patch[key] < (key === 'bytes' ? 1 : 0))) {
    throw new Error(key + '는 유효한 정수여야 합니다.');
  }
  if (patch.status !== undefined && !STATUSES.includes(patch.status)) throw new Error('알 수 없는 상태: ' + patch.status);
  if (patch.generatedAt !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(patch.generatedAt) || new Date(patch.generatedAt).toISOString().slice(0, 10) !== patch.generatedAt)) throw new Error('생성일은 YYYY-MM-DD여야 합니다.');
  Object.assign(item, patch);
  return item;
}

export function reportLedger(ledger, rows) {
  const statuses = {};
  for (const item of ledger.items) statuses[item.status] = (statuses[item.status] || 0) + 1;
  return {
    items: ledger.items.length, symbols: ledger.items.filter((i) => i.kind === 'symbol').length,
    landmarks: ledger.items.filter((i) => i.kind === 'landmark').length,
    unwritten: ledger.items.filter((i) => !i.subjectEn).length, statuses,
    inCapital: ledger.items.filter((i) => i.kind === 'landmark' && i.inCapital).length,
    factReuseRows: rows ? counts(rows).factReuse : new Set(ledger.items.filter((i) => i.factReuse).map((i) => i.code)).size,
    factReuseItems: ledger.items.filter((i) => i.factReuse).length,
    styleChoice: ledger.styleChoice,
    recordedBytes: ledger.items.reduce((sum, item) => sum + (item.bytes || 0), 0)
  };
}

export function lintLedger(ledger) {
  const errors = [], warnings = [], seen = new Map();
  let unwritten = 0;
  const adjective = /\b(majestic|beautiful|detailed|intricate|iconic|stunning|cinematic|vibrant|whimsical|charming|epic|dramatic)\b/i;
  const noun = /\b(flag|banner|text|letters|sign|signage|inscription|logo|watermark|person|people|face|crowd)\b/i;
  const numericKo = /\d+|(?:한|두|세|네|다섯|여섯|일곱|여덟)\s*(?:개|장|채|겹|층|쌍|줄기|마리|봉우리|갈래)/;
  const numericEn = /\b(single|one|two|three|four|five|six|seven|eight|\d+)\b/i;
  const visible = /\b(black|white|blue|grey|gray|red|green|yellow|golden|gold|brown|orange|pink|purple|cream|round|square|rectangular|circular|triangular|curved|flat|pointed|arched|domed|conical|layered)\b/i;
  for (const item of ledger.items) {
    const subject = item.subjectEn;
    if (subject === null || subject === undefined || subject === '') { unwritten++; continue; }
    const add = (collection, rule, message) => collection.push({ id: item.id, rule, message });
    if (typeof subject !== 'string') { add(errors, 'ascii', 'subjectEn은 문자열이어야 합니다.'); continue; }
    if (/[^\x20-\x7e\r\n]/.test(subject)) add(errors, 'ascii', 'ASCII 문자와 일반 문장부호만 쓸 수 있습니다.');
    // 하이픈 복합어(blue-grey)는 공백으로 나뉘지 않으므로 한 단어로 센다.
    const words = subject.trim() ? subject.trim().split(/\s+/).length : 0;
    if (words < 18 || words > 35) add(errors, 'word-count', '단어 수 ' + words + ' (18~35 필요)');
    if (adjective.test(subject)) add(errors, 'adjective', '금지 형용사: ' + subject.match(adjective)[0]);
    if (noun.test(subject)) add(errors, 'noun', '금지 명사: ' + subject.match(noun)[0]);
    if (!subject.endsWith('.') || /[\r\n]/.test(subject)) add(errors, 'sentence', '줄바꿈 없는 한 문장을 마침표로 끝내세요.');
    const normalized = subject.trim().toLowerCase();
    if (seen.has(normalized)) add(errors, 'duplicate', '다른 항목과 문장 중복: ' + seen.get(normalized));
    else seen.set(normalized, item.id);
    if (numericKo.test(item.koRaw || '') && !numericEn.test(subject)) add(warnings, 'number', '한국어 개수 표현에 대응하는 영어 수사를 확인하세요.');
    if (item.kind === 'landmark' && words < 25) add(warnings, 'silhouette', '명소 25단어 미만: 실루엣 요소 세 가지를 확인하세요.');
    if ((item.confusionGroups || []).length >= 2 && !visible.test(subject)) add(warnings, 'distinction', '혼동군이 겹칩니다. 색·형태 구별 지침을 확인하세요.');
  }
  return { errors, warnings, unwritten };
}

export function cliArguments(args) {
  const result = { positional: [] };
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) result.positional.push(args[i]);
    else {
      const key = args[i].slice(2);
      if (Object.hasOwn(result, key)) throw new Error('중복 인자: --' + key);
      result[key] = args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[++i] : true;
    }
  }
  return result;
}

export function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  const options = cliArguments(rest);
  const flags = { seed: ['root', 'style'], record: ['root', 'bytes', 'tries', 'status', 'date'], report: ['root', 'todo', 'status', 'budget'], lint: ['root'], contact: ['root', 'anchor'] }[command] || [];
  for (const [key, value] of Object.entries(options)) {
    if (key === 'positional') continue;
    if (!flags.includes(key)) throw new Error('알 수 없는 인자: --' + key);
    if (!(command === 'report' && ['status', 'budget'].includes(key)) && typeof value !== 'string') throw new Error('--' + key + ' 값이 필요합니다.');
  }
  const root = options.root ? path.resolve(options.root) : ROOT;
  if (command === 'contact') {
    if (options.positional.length) throw new Error('contact에는 위치 인자를 받지 않습니다.');
    console.log(JSON.stringify(buildContactSheets(root, readLedger(root), { anchor: options.anchor || 'kr.png' }), null, 2));
  } else if (command === 'seed') {
    const ledger = seedLedger(root, options.style ? { styleChoice: options.style === 'null' ? null : options.style } : {});
    console.log(JSON.stringify(reportLedger(ledger, readSubjects(root)), null, 2));
  } else if (command === 'record') {
    const ledger = readLedger(root), patch = {};
    for (const key of ['bytes', 'tries']) if (options[key] !== undefined) patch[key] = Number(options[key]);
    if (options.status !== undefined) patch.status = options.status;
    if (options.date !== undefined) patch.generatedAt = options.date;
    if (!Object.keys(patch).length) throw new Error('record에는 --bytes/--tries/--status/--date 중 하나가 필요합니다.');
    console.log(JSON.stringify(recordItem(ledger, options.positional[0], patch)));
    writeLedger(ledger, root);
  } else if (command === 'lint') {
    const result = lintLedger(readLedger(root));
    console.log('오류 ' + result.errors.length + ' · 경고 ' + result.warnings.length + ' · 미작성 ' + result.unwritten + '건');
    for (const [label, entries] of [['오류', result.errors], ['경고', result.warnings]]) for (const entry of entries) console.log(label + ' [' + entry.id + '] ' + entry.rule + ': ' + entry.message);
    if (result.errors.length) process.exitCode = 1;
  } else if (command === 'report') {
    const ledger = readLedger(root);
    console.log(JSON.stringify(reportLedger(ledger, readSubjects(root)), null, 2));
    if (options.todo !== undefined) {
      const limit = Number(options.todo);
      if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('--todo는 양의 정수여야 합니다.');
      console.table(ledger.items.filter((item) => !item.subjectEn).slice(0, limit).map(({ id, koApprove, koRaw, status }) => ({ id, koApprove, koRaw, status })));
    }
    if (options.budget) {
      const limits = ledger.styleChoice === 'a' ? [40000, 60000] : ledger.styleChoice === 'b' ? [110000, 150000] : null;
      console.log(JSON.stringify({ budget: limits ? { estimatedBytes: limits[0] * ledger.items.length, maximumBytes: limits[1] * ledger.items.length } : null }));
    }
  } else throw new Error('사용법: node scripts/image-ledger.mjs seed|lint|record|report|contact [--root 경로] (contact: [--anchor kr.png])');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
