/* 실제로 시작한 회차만 기록한다. 기존 제작물을 회차에 소급 배정하지 않는다. */
import { createHash } from 'node:crypto';

export const ANCHOR_ID = 'kr-landmark';
export const CATEGORY_ORDER = ['동물', '식물', '만든것', '먹을거리', '땅과하늘', '입는것'];
export const GRADE_ORDER = ['S', 'A', 'B'];
const READY = new Set(['approved-text', 'agent-curated', 'generated', 'rejected']);
const FAILURES = new Set(['a-group', 'style-drift', 'fact', 'recognition', 'other']);
const groupOf = (item) => item.kind + ':' + (item.kind === 'symbol' ? item.category : item.grade);
const promptOf = (item) => JSON.stringify([item.subjectEn, item.override, item.accuracy, item.keepsBackdrop]);
const fingerprint = (ledger) => createHash('sha256').update(JSON.stringify([
  ledger.templateVersion, ledger.styleChoice, ledger.common,
  ledger.items.map((item) => [item.id, promptOf(item)])
])).digest('hex');
const now = () => new Date().toISOString();
function styleRequired(ledger) {
  if (!['a', 'b'].includes(ledger.styleChoice)) throw new Error('화풍이 미정입니다. styleChoice를 먼저 선택하세요.');
}
function revisionReady(item, ledger) {
  const gate = item.retryRequirement;
  return !gate || (gate.templateVersion !== ledger.templateVersion && gate.prompt !== promptOf(item));
}
function eligible(item, ledger) {
  return READY.has(item.status) && typeof item.subjectEn === 'string' && item.subjectEn.trim() && revisionReady(item, ledger);
}
function ordered(ledger) {
  const held = new Set(ledger.items.filter((item) => item.status === 'held').map((item) => item.code));
  const rank = (item) => item.kind === 'symbol' ? CATEGORY_ORDER.indexOf(item.category) : CATEGORY_ORDER.length + GRADE_ORDER.indexOf(item.grade);
  return ledger.items.filter((item) => eligible(item, ledger) && !held.has(item.code)).sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id, 'en'));
}

export function nextBatch(ledger, { size = 10 } = {}) {
  styleRequired(ledger);
  if (!Number.isSafeInteger(size) || size < 1 || size > 10) throw new Error('회차 항목 수는 1~10입니다(별도 앵커 1장, 재시도 포함 상한 12장).');
  const anchor = ledger.items.find((item) => item.id === ANCHOR_ID);
  if (!anchor?.subjectEn) throw new Error('kr-landmark 앵커의 영어 프롬프트가 필요합니다.');
  const active = (ledger.batches || []).find((batch) => !batch.closedAt && !batch.discarded);
  if (active) throw new Error('진행 중인 회차 ' + active.no + '를 먼저 닫으세요: record --batch ' + active.no + ' --close');
  const queue = ordered(ledger);
  if (!queue.length) return { no: null, anchor: null, items: [], group: null };
  const group = groupOf(queue[0]);
  if (group.endsWith(':undefined') || (queue[0].kind === 'symbol' ? !CATEGORY_ORDER.includes(queue[0].category) : !GRADE_ORDER.includes(queue[0].grade))) throw new Error('분류가 없는 항목입니다: ' + queue[0].id);
  return {
    no: Math.max(0, ...(ledger.batches || []).map((batch) => batch.no)) + 1,
    style: ledger.styleChoice, templateVersion: ledger.templateVersion,
    anchor: { id: ANCHOR_ID, role: 'anchor-check' }, group,
    items: queue.filter((item) => groupOf(item) === group).slice(0, size).map((item) => ({ id: item.id, kind: item.kind, category: item.category, grade: item.grade })),
    instruction: '새 대화에서 앵커를 먼저 재생성·비교하고 --anchor-ok true|false로 실제 판정을 기록하세요. 매번 전문을 붙여넣고 재시도 포함 12장을 넘기지 마세요.'
  };
}

function discard(ledger, batch, reason, timestamp) {
  batch.discarded = true;
  batch.anchorOk = false;
  batch.closedAt ||= timestamp;
  batch.closeReason = reason;
  for (const id of batch.items) {
    const item = ledger.items.find((entry) => entry.id === id);
    if (item?.batchNo === batch.no) {
      // 파일과 시도 이력은 보존하지만 폐기 회차의 승인만 철회한다.
      item.status = 'generated';
      delete item.batchNo;
    }
  }
}

function mutateBatch(ledger, options) {
  const { batch: no, id, tries, status, anchorOk, failure, close = false, discard: discardRequested = false, timestamp = now() } = options;
  styleRequired(ledger);
  if (!Number.isSafeInteger(no) || no < 1) throw new Error('--batch는 양의 정수여야 합니다.');
  if (Number.isNaN(Date.parse(timestamp))) throw new Error('회차 기록 시각이 올바르지 않습니다.');
  ledger.batches ||= [];
  let batch = ledger.batches.find((entry) => entry.no === no);
  if (!batch) {
    const plan = nextBatch(ledger);
    const latest = ledger.batches.at(-1);
    if (latest && latest.templateVersion === ledger.templateVersion && latest.promptHash !== fingerprint(ledger)) throw new Error('프롬프트를 바꿨으면 새 회차 전에 templateVersion을 올리세요.');
    if (!plan.items.length) throw new Error('생성할 대기 항목이 없습니다.');
    if (id !== ANCHOR_ID || typeof anchorOk !== 'boolean') throw new Error('새 회차의 첫 기록은 kr-landmark와 --anchor-ok true|false여야 합니다.');
    if (status !== undefined || failure !== undefined || close || discardRequested || options.bytes !== undefined || options.generatedAt !== undefined) throw new Error('앵커 판정에는 항목 상태나 바이트를 기록하지 않습니다.');
    if (no < plan.no) throw new Error('이전 회차 번호를 재사용할 수 없습니다.');
    if (!Number.isSafeInteger(tries) || tries < 1 || tries > 12) throw new Error('앵커 생성 횟수는 1~12의 정수여야 합니다.');
    batch = { no, style: ledger.styleChoice, templateVersion: ledger.templateVersion, startedAt: timestamp,
      anchorOk, discarded: !anchorOk, group: plan.group, items: [], attempts: [], generatedCount: tries,
      promptHash: fingerprint(ledger), anchor: { id: ANCHOR_ID, tries, checkedAt: timestamp }, driftStreak: 0 };
    ledger.batches.push(batch);
    if (!anchorOk || tries === 12) { batch.closedAt = timestamp; batch.closeReason = anchorOk ? 'image-limit' : 'anchor-mismatch'; }
    return batch;
  }
  if (anchorOk !== undefined) throw new Error('앵커 판정은 회차 시작 시 한 번만 기록합니다.');
  if (discardRequested || close) {
    if (id !== undefined || status !== undefined || tries !== undefined || failure !== undefined || options.bytes !== undefined || options.generatedAt !== undefined) throw new Error('회차 닫기·폐기는 항목 기록과 나누어 실행하세요.');
    if (discardRequested) discard(ledger, batch, 'manual-discard', timestamp);
    else { batch.closedAt ||= timestamp; batch.closeReason ||= 'completed'; }
    return batch;
  }
  if (batch.discarded || batch.closedAt) throw new Error('종료된 회차에는 이미지를 추가할 수 없습니다.');
  if (!batch.anchorOk) throw new Error('앵커 비교가 통과되지 않았습니다.');
  if (batch.promptHash !== fingerprint(ledger)) throw new Error('회차 중 프롬프트가 바뀌었습니다. 이 회차를 닫고 templateVersion을 올린 후 새로 시작하세요.');
  const item = ledger.items.find((entry) => entry.id === id);
  if (!item || !eligible(item, ledger)) throw new Error('생성 대기 항목이 아닙니다: ' + id);
  if (ledger.items.some((entry) => entry.code === item.code && entry.status === 'held')) throw new Error('5회 실패로 보류된 나라입니다: ' + item.code);
  if (groupOf(item) !== batch.group) throw new Error('같은 회차에서는 축·카테고리 또는 명소 등급을 섞을 수 없습니다.');
  if (!Number.isSafeInteger(tries) || tries <= (item.tries || 0)) throw new Error('--tries는 이전 누적 시도 수보다 커야 합니다.');
  const added = tries - (item.tries || 0);
  if (batch.generatedCount + added > 12) throw new Error('앵커와 재시도를 합쳐 회차 상한 12장을 넘습니다.');
  if (!['approved-image', 'rejected'].includes(status)) throw new Error('회차 판정은 approved-image 또는 rejected입니다.');
  if (status === 'rejected' && !FAILURES.has(failure)) throw new Error('실패 사유 --failure a-group|style-drift|fact|recognition|other가 필요합니다.');
  if (status === 'approved-image' && failure !== undefined) throw new Error('승인과 실패 사유를 함께 기록할 수 없습니다.');
  if (added !== 1) throw new Error('앵커 이탈·재시도 횟수를 검증할 수 있도록 시도마다 하나씩 기록하세요.');
  if (options.bytes !== undefined && (!Number.isSafeInteger(options.bytes) || options.bytes < 1)) throw new Error('bytes는 양의 정수여야 합니다.');
  if (options.generatedAt !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(options.generatedAt) || new Date(options.generatedAt).toISOString().slice(0, 10) !== options.generatedAt)) throw new Error('생성일은 YYYY-MM-DD여야 합니다.');
  batch.generatedCount += added;
  batch.attempts.push({ id, tries, status, prompt: promptOf(item), ...(failure ? { failure } : {}), at: timestamp });
  item.tries = tries;
  if (options.bytes !== undefined) item.bytes = options.bytes;
  if (options.generatedAt !== undefined) item.generatedAt = options.generatedAt;
  delete item.retryRequirement;
  item.status = status;
  batch.driftStreak = failure === 'style-drift' ? batch.driftStreak + 1 : 0;
  if (status === 'approved-image') {
    batch.items.push(id);
    item.batchNo = no;
  } else {
    item.failureCount = (item.failureCount || 0) + 1;
    const previous = ledger.batches.flatMap((entry) => entry.attempts).filter((attempt) => attempt.id === id && attempt.prompt === promptOf(item)).slice(-2);
    if (failure === 'recognition' || (['a-group', 'fact'].includes(failure) && previous.length === 2 && previous.every((attempt) => attempt.failure === failure))) {
      item.retryRequirement = { reason: failure, templateVersion: ledger.templateVersion, prompt: promptOf(item),
        instruction: failure === 'a-group' ? '금지 조건을 직접 보강하고 templateVersion을 올리세요.' : failure === 'fact' ? '구도를 직접 단순화하고 templateVersion을 올리세요.' : '피사체를 직접 다시 선정하고 문장·templateVersion을 고치세요.' };
      if (failure === 'recognition') item.status = 'draft';
      batch.closedAt = timestamp; batch.closeReason = 'prompt-revision-required';
    }
    if (ledger.items.filter((entry) => entry.code === item.code).reduce((sum, entry) => sum + (entry.failureCount || 0), 0) >= 5) item.status = 'held';
  }
  if (batch.driftStreak >= 3) discard(ledger, batch, 'three-consecutive-style-drifts', timestamp);
  if (batch.items.length === 10) { batch.closedAt ||= timestamp; batch.closeReason ||= 'ten-items-complete'; }
  if (batch.generatedCount === 12) { batch.closedAt ||= timestamp; batch.closeReason ||= 'image-limit'; }
  return batch;
}

export function recordBatch(ledger, options) {
  // 판정 오류가 났을 때 메모리와 파일 어느 쪽에도 부분 기록을 남기지 않는다.
  const candidate = structuredClone(ledger);
  const result = mutateBatch(candidate, options);
  Object.assign(ledger, candidate);
  return result;
}

export function batchReport(ledger) {
  const activeIds = (ledger.batches || []).filter((batch) => !batch.discarded).flatMap((batch) => batch.items);
  const active = new Set(activeIds);
  return {
    batches: (ledger.batches || []).length,
    discardedBatches: (ledger.batches || []).filter((batch) => batch.discarded).map((batch) => batch.no),
    batchedApproved: activeIds.length,
    unbatchedApproved: ledger.items.filter((item) => item.status === 'approved-image' && !active.has(item.id)).map((item) => item.id),
    held: ledger.items.filter((item) => item.status === 'held').map(({ id, code, tries, failureCount }) => ({ id, code, tries, failureCount })),
    needsPromptRevision: ledger.items.filter((item) => !revisionReady(item, ledger)).map((item) => item.id)
  };
}

export function lintBatches(ledger) {
  const errors = [], numbers = new Set(), accepted = new Set();
  const add = (id, message) => errors.push({ id, rule: 'batch', message });
  let open = 0;
  for (const batch of ledger.batches || []) {
    if (!Number.isSafeInteger(batch.no) || numbers.has(batch.no)) add(String(batch.no), '회차 번호가 잘못되었거나 중복됩니다.');
    numbers.add(batch.no);
    if (!batch.closedAt && !batch.discarded) open++;
    if (typeof batch.anchorOk !== 'boolean' || !batch.anchor || batch.anchor.id !== ANCHOR_ID) add(String(batch.no), '실제 앵커 판정 기록이 없습니다.');
    if (batch.generatedCount > 12 || batch.generatedCount !== (batch.anchor?.tries || 0) + (batch.attempts || []).length) add(String(batch.no), '회차 장수 또는 시도 기록이 맞지 않습니다.');
    for (const id of batch.items || []) {
      if (batch.discarded) continue;
      const item = ledger.items.find((entry) => entry.id === id);
      if (accepted.has(id)) add(id, '유효 회차에 중복 채택되었습니다.');
      accepted.add(id);
      if (!item || item.status !== 'approved-image' || item.batchNo !== batch.no) add(id, '회차 채택과 현재 승인 상태가 다릅니다.');
      if (!(batch.attempts || []).some((attempt) => attempt.id === id && attempt.status === 'approved-image')) add(id, '채택 판정 기록이 없습니다.');
    }
  }
  if (open > 1) add('batches', '동시에 열려 있는 회차가 둘 이상입니다.');
  for (const item of ledger.items) if (item.batchNo !== undefined && !accepted.has(item.id)) add(item.id, '항목의 회차 연결이 누락되었습니다.');
  return errors;
}
