/* 앱에서 쓰는 읽어주기 문구의 단일 목록. 개인 이름이나 마이크 전사는 포함하지 않는다. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'data/countries.js'), 'utf8'), sandbox);
export const countries = sandbox.window.FQ.countries;
export const cheers = [
  '정답!', '정답', '잘했어!', '멋져!', '최고야!', '맞았어!', '대단해!',
  '보물상자를 열었어요!', '대단해요! 세계 국기 박사님!', '아주 잘했어요!',
  '조금만 더 하면 돼요!', '괜찮아요, 다시 해 보면 훨씬 잘할 거예요!'
];

export function voiceCorpus() {
  const entries = new Map();
  function add(text, kind) { if (text && !entries.has(text)) entries.set(text, { text, kind }); }
  cheers.forEach(text => add(text, 'cheer'));
  countries.forEach(c => {
    add(c.ko, 'name');
    add(c.capital, 'name');
    add(c.flagHint, 'explanation');
    add(c.fact, 'explanation');
    add(c.ko + '의 수도예요', 'explanation');
  });
  return [...entries.values()];
}

// 샘플도 본 생성과 같은 문구·분류를 써야 생성 설정과 파일 키가 같아진다.
export function voiceSamples(corpus = voiceCorpus()) {
  const korea = countries.find(country => country.code === 'kr');
  const texts = ['정답!', '잘했어!', korea?.ko, korea?.flagHint];
  return texts.map(text => {
    const entry = corpus.find(item => item.text === text);
    if (!entry) throw new Error('대표 음성 샘플이 전체 문구 목록에 없습니다.');
    return entry;
  });
}
