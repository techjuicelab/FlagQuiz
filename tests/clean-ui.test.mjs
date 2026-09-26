/* 새 화면의 접근성·반응형 계약. 실제 기기의 배치와 입력은 브라우저 검증에서 함께 확인한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selector: match[1].trim(), body: match[2] }));
const rule = selector => rules.find(entry => entry.selector.split(',').map(part => part.trim()).includes(selector))?.body || '';
const number = (body, property) => Number(body.match(new RegExp('(?:^|;)\\s*' + property + ':\\s*([\\d.]+)px'))?.[1]);
function luminance(hex) {
  const full = hex.length === 4 ? '#' + [...hex.slice(1)].map(value => value + value).join('') : hex;
  const channels = full.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast(a, b) { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); }

test('밝은 화면과 어두운 화면 모두 본문·보조 설명·링크·정답 상태의 색 대비를 확보한다', () => {
  const palettes = rules.filter(entry => entry.selector === ':root').map(entry => Object.fromEntries([...entry.body.matchAll(/(--[\w-]+):\s*(#[\da-f]{3,6})\b/gi)].map(match => [match[1], match[2]])));
  assert.equal(palettes.length, 2, '다크 모드 의미별 토큰을 별도로 제공한다');
  for (const [index, palette] of palettes.entries()) {
    for (const surface of ['--bg', '--card']) for (const text of ['--text', '--text-soft', '--primary']) {
      assert.ok(contrast(palette[text], palette[surface]) >= 4.5, `${index} ${text}/${surface} 본문 대비`);
    }
    for (const tone of ['primary', 'success', 'danger']) {
      const foreground = palette[tone === 'primary' ? '--primary-dark' : '--' + tone];
      const background = palette['--' + tone + (tone === 'primary' ? '-soft' : '-bg')];
      assert.ok(contrast(foreground, background) >= 4.5, `${index} ${tone} 상태 문구 대비`);
    }
  }
  assert.doesNotMatch(css, /@import|https?:\/\/[^\s)]+\.(?:woff2?|ttf)|fonts\.googleapis/i, '오프라인 화면에 외부 글꼴을 추가하지 않는다');
});

test('자주 누르는 버튼과 설정 스위치는 최소 44px 높이의 조작 영역을 유지한다', () => {
  for (const selector of ['.btn', '.btn-sm', '.head-back', '.play-btn', '.mode-option', '.answer-btn', '.sticker-cell', '.primary-nav button', '.home-offline', '.pill']) {
    assert.ok(number(rule(selector), 'min-height') >= 44, selector + ' 최소 높이');
  }
  const control = rule('.setting-row input[type="checkbox"]');
  assert.ok(number(control, 'height') >= 44, '설정 스위치의 여백이 아닌 실제 클릭 영역 높이');
  assert.ok(number(control, 'width') >= 44, '설정 스위치의 실제 클릭 영역 너비');
  assert.match(plain, /button:focus-visible[\s\S]*?outline:\s*[1-9]/);
});

test('문제 진행은 항상 보이고 학습 중에는 기본 내비게이션을 숨긴다', () => {
  assert.match(rule('.quiz-head .q-count'), /display:\s*inline-flex/);
  assert.doesNotMatch(plain, /\.q-count[^{}]*\{[^{}]*display:\s*none/);
  const hiddenNav = rules.find(entry => entry.selector.includes('.primary-nav') && entry.selector.includes('data-screen="quiz"') && /display:\s*none/.test(entry.body));
  assert.ok(hiddenNav, '퀴즈의 기본 내비게이션을 숨긴다');
  assert.match(hiddenNav.selector, /data-screen="capital-study"/, '수도 공부도 학습 화면으로 다룬다');
  assert.match(rule('[hidden]'), /display:\s*none\s*!important/, '저장 진행률과 이미지 등의 hidden 상태를 다른 표시 규칙이 덮지 않는다');
  assert.match(plain, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none\s*!important/);
});

test('좁은 창과 확대된 글자는 스크롤할 수 있고 주제·선택지는 두 열로 흐른다', () => {
  assert.doesNotMatch(rule('body'), /(?:overflow(?:-y)?):\s*hidden|height:\s*(?:100vh|100dvh)/);
  assert.doesNotMatch(rule('.app'), /(?:overflow(?:-y)?):\s*hidden|height:\s*(?:100vh|100dvh)/);
  for (const selector of ['.play-grid', '.answer-grid']) assert.match(rule(selector), /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(rule('.capital-word'), /overflow-wrap:\s*anywhere/);
  assert.match(rule('.sticker-cell .n'), /overflow-wrap:\s*anywhere/);
  assert.match(plain, /env\(safe-area-inset-bottom\)/);
  assert.match(plain, /@media\s*\(min-width:\s*900px\)\s*\{[\s\S]*?\.quiz-body\s*\{[^{}]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(0,\s*1fr\)/);
  assert.match(plain, /@media\s*\(min-width:\s*1000px\)\s*\{[\s\S]*?\.primary-nav\s*\{[^{}]*flex-direction:\s*column/);
  assert.doesNotMatch(plain, /orientation:/, '회전만으로 넓은 화면 배치를 강요하지 않는다');
});
