/* 원장 문장은 고치지 않고 공통 블록의 고정 순서로만 조립한다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, readLedger, lintLedger, cliArguments } from './image-ledger.mjs';

export const ORDER = Object.freeze({
  a: [['subject'], ['style'], ['exclusions']],
  b: [['subject', 'accuracy', 'override'], ['composition'], ['style'], ['exclusions'], ['output']]
});

export function buildPrompt(item, ledger, style, { dropBlockHeaders = false } = {}) {
  if (!['a', 'b'].includes(style)) throw new Error('화풍은 a 또는 b여야 합니다.');
  if (!item.subjectEn || item.status === 'blocked-approval') throw new Error('문장이 없거나 소재 승인이 필요한 항목: ' + item.id);
  const common = ledger.common.styles[style];
  const pieces = {
    ...common,
    subject: style === 'b' ? 'SUBJECT: ' + item.subjectEn : item.subjectEn,
    accuracy: style === 'b' && item.kind === 'landmark' ? ledger.common.accuracy : '',
    override: style === 'b' ? item.override || '' : ''
  };
  for (const key of style === 'b' ? ['composition', 'style', 'exclusions', 'output'] : ['style', 'exclusions']) {
    if (typeof pieces[key] !== 'string' || !pieces[key]) throw new Error('공통 문단이 없습니다: ' + style + '.' + key);
  }
  if (style === 'b' && item.kind === 'landmark' && !pieces.accuracy) throw new Error('명소 ACCURACY 문단이 없습니다.');
  if (dropBlockHeaders && style === 'a') {
    pieces.style = pieces.style.replace(/^STYLE LOCK[^\n]*\n\n/, '');
    pieces.exclusions = pieces.exclusions.replace(/^NEGATIVE[^\n]*\n\n/, '');
  }
  return ORDER[style].map((line) => line.map((key) => pieces[key]).filter(Boolean).join('\n')).join('\n\n') + '\n';
}

export function selectItems(ledger, { kind = 'all', codes, ids } = {}) {
  if (!['symbol', 'landmark', 'all'].includes(kind)) throw new Error('--kind는 symbol/landmark/all 중 하나여야 합니다.');
  const list = (value) => value === undefined ? null : Array.isArray(value) ? value : value.split(',');
  const selectedCodes = list(codes), selectedIds = list(ids);
  for (const [values, field] of [[selectedCodes, 'code'], [selectedIds, 'id']]) if (values) {
    if (!values.length || new Set(values).size !== values.length || values.some((value) => !ledger.items.some((item) => item[field] === value))) {
      throw new Error('없는 값 또는 중복 선택: ' + field);
    }
  }
  return ledger.items.filter((item) => (kind === 'all' || item.kind === kind) && (!selectedCodes || selectedCodes.includes(item.code)) && (!selectedIds || selectedIds.includes(item.id)));
}

export function buildPrompts({ root = ROOT, style, kind = 'all', codes, ids, out = 'docs/image-prompts/prompts', stdout = false, force = false, dropBlockHeaders = false } = {}) {
  const ledger = readLedger(root);
  if (!['a', 'b'].includes(style)) throw new Error('--style a|b를 지정하세요.');
  // 다른 출력 폴더와 --force도 화풍 미선택 상태의 본 생성 거부를 우회하지 못한다.
  if (!['a', 'b'].includes(ledger.styleChoice)) throw new Error('styleChoice가 null이거나 미선택입니다. 본 생성 프롬프트를 만들 수 없습니다.');
  if (ledger.styleChoice !== style && !force) throw new Error('확정 화풍 ' + ledger.styleChoice + '와 다릅니다. 비교 목적이면 --force를 명시하세요.');
  const seen = new Set();
  for (const item of ledger.items) {
    if (!/^[a-z]{2}-(symbol|landmark)$/.test(item.id) || item.id !== item.code + '-' + item.kind || seen.has(item.id)) throw new Error('원장 id 형식 또는 중복: ' + item.id);
    seen.add(item.id);
  }
  const lint = lintLedger(ledger);
  if (lint.errors.length) throw new Error('영어 문장 오류로 조립을 중단합니다.\n' + lint.errors.map((error) => error.id + ' ' + error.rule + ': ' + error.message).join('\n'));
  const selected = selectItems(ledger, { kind, codes, ids });
  const skipped = {
    unwritten: selected.filter((item) => !item.subjectEn).map((item) => item.id),
    blocked: selected.filter((item) => item.status === 'blocked-approval').map((item) => item.id)
  };
  const outputDirectory = path.resolve(root, out);
  const written = selected.filter((item) => item.subjectEn && item.status !== 'blocked-approval').map((item) => ({
    id: item.id, path: path.join(outputDirectory, item.id + '.txt'), content: buildPrompt(item, ledger, style, { dropBlockHeaders })
  }));
  if (stdout && written.length !== 1) throw new Error('--stdout은 조립 가능한 항목을 정확히 한 개 선택해야 합니다.');
  if (!stdout) {
    if (written.length) fs.mkdirSync(outputDirectory, { recursive: true });
    // 문장 삭제·승인 철회 뒤 옛 프롬프트가 그대로 복사되는 것을 막는다. 선택 밖 파일은 보존한다.
    for (const id of new Set([...skipped.unwritten, ...skipped.blocked])) fs.rmSync(path.join(outputDirectory, id + '.txt'), { force: true });
    for (const file of written) fs.writeFileSync(file.path, file.content);
  }
  return { written, skipped, warnings: lint.warnings };
}

export function main(args = process.argv.slice(2)) {
  const options = cliArguments(args);
  const booleans = ['stdout', 'force', 'drop-block-headers'];
  const strings = ['root', 'style', 'kind', 'codes', 'ids', 'out'];
  if (options.positional.length) throw new Error('알 수 없는 인자: ' + options.positional.join(' '));
  for (const [key, value] of Object.entries(options)) {
    if (key === 'positional') continue;
    if (![...booleans, ...strings].includes(key)) throw new Error('알 수 없는 인자: --' + key);
    if ((strings.includes(key) && typeof value !== 'string') || (booleans.includes(key) && value !== true)) throw new Error('--' + key + ' 값을 확인하세요.');
  }
  const result = buildPrompts({ ...options, root: options.root ? path.resolve(options.root) : ROOT, dropBlockHeaders: !!options['drop-block-headers'] });
  const summary = '조립 ' + result.written.length + '건 · 미작성 ' + result.skipped.unwritten.length + '건 · 소재 승인 대기 ' + result.skipped.blocked.length + '건 · 경고 ' + result.warnings.length + '건';
  if (options.stdout) { process.stdout.write(result.written[0].content); console.error(summary); }
  else console.log(summary);
  for (const [label, ids] of [['미작성', result.skipped.unwritten], ['소재 승인 대기', result.skipped.blocked]]) if (ids.length) console.error(label + ': ' + ids.join(', '));
  for (const warning of result.warnings) console.error('경고 [' + warning.id + '] ' + warning.message);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
