/* 문제의 정답과 무관하게 전체 나라·수도 이름을 실시간 STT의 고정 어휘로 제공한다. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function browserSource(file) {
  try { return readFileSync(new URL('../' + file, import.meta.url), 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // 운영 이미지는 브라우저 코드를 _site 안에 둔다. 경로는 사용자 입력에서 받지 않는다.
    return readFileSync(new URL('../_site/' + file, import.meta.url), 'utf8');
  }
}

const sandbox = vm.createContext({ window: { FQ: {} } }, { codeGeneration: { strings: false, wasm: false } });
for (const file of ['js/util.js', 'data/countries.js', 'js/quiz.js']) {
  vm.runInContext(browserSource(file), sandbox, { filename: file, timeout: 1000 });
}
const fq = sandbox.window.FQ;
if (!Array.isArray(fq.countries) || !fq.countries.length || typeof fq.quiz?.entryFor !== 'function') {
  throw new Error('말하기 어휘 자료를 준비하지 못했어요.');
}

function contextFor(kind) {
  const terms = new Set();
  for (const country of fq.countries) {
    const entry = fq.quiz.entryFor(country, kind);
    for (const value of [entry.ko, ...(entry.aliases || [])]) {
      if (typeof value === 'string' && /[가-힣]/.test(value)) terms.add(value.normalize('NFC').trim());
    }
  }
  const context = {
    general: [
      { key: 'domain', value: '한국어 지리 학습 놀이' },
      { key: 'topic', value: kind === 'capital' ? '수도 이름을 말하는 짧은 답변과 요청' : '나라 이름을 말하는 짧은 답변과 요청' },
      { key: 'language', value: 'Korean' }
    ],
    terms: [...terms].sort()
  };
  // 공급자 문맥 한도에 여유를 두고, 같은 모드의 모든 문제에 동일한 불변 사전을 쓴다.
  if (JSON.stringify(context).length >= 10000) throw new Error('말하기 어휘 자료가 너무 커요.');
  context.general.forEach(Object.freeze);
  Object.freeze(context.general); Object.freeze(context.terms);
  return Object.freeze(context);
}

const countryContext = contextFor('country'), capitalContext = contextFor('capital');
export function speechVocabulary(mode) {
  return mode === 'capitalVoice' ? capitalContext : countryContext;
}
