import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('최근 놀이에 쓰는 기존 다섯 모드 이름은 홈 화면의 확정 명칭과 같다', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(new URL('../js/quiz.js', import.meta.url), 'utf8'), context);
  const names = {
    choice4: '국기 보고 나라 고르기', reverse: '나라 보고 국기 찾기', capital: '수도 듣고 국기 찾기',
    typing: '이름 써서 맞히기', voice: '말로 답하기'
  };
  for (const [mode, label] of Object.entries(names)) assert.equal(context.window.FQ.quiz.MODES[mode].label, label);
});
