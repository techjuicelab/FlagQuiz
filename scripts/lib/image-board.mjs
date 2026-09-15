/* 검토 자료는 앱과 분리된 정적 문서이며 원장 텍스트를 HTML로 실행하지 않는다. */
import fs from 'node:fs';
import path from 'node:path';

export function inlineJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
}

export function boardClient(document, navigator) {
  const items = JSON.parse(document.getElementById('board-data').textContent);
  const byId = (id) => document.getElementById(id);
  const select = byId('items'), prompt = byId('prompt'), copy = byId('copy'), message = byId('message');
  const filters = ['continent', 'kind', 'status'];
  for (const key of filters) {
    for (const value of [...new Set(items.map((item) => item[key]).filter(Boolean))].sort()) {
      const option = document.createElement('option'); option.value = value; option.textContent = value; byId(key).append(option);
    }
  }
  function show() {
    const item = items.find((entry) => entry.id === select.value);
    prompt.value = item?.prompt || ''; copy.disabled = !prompt.value;
    byId('details').textContent = item ? ['소재: ' + item.koRaw, '승인용 한국어: ' + (item.koApprove || '미작성'), '위험: ' + (item.riskNote || '없음'), '혼동군: ' + (item.confusionGroups?.join(', ') || '없음'), '등급: ' + (item.grade || item.csvStatus || '미지정')].join('\n') : '선택할 항목이 없습니다.';
    message.textContent = item && !item.prompt ? '문장 미작성 또는 소재 승인 대기 항목입니다.' : '';
  }
  function filter() {
    const previous = select.value, query = byId('search').value.trim().toLocaleLowerCase();
    const matches = items.filter((item) => filters.every((key) => !byId(key).value || item[key] === byId(key).value) && (!query || [item.code, item.id, item.koRaw, item.koApprove].some((value) => String(value || '').toLocaleLowerCase().includes(query))));
    select.replaceChildren();
    for (const item of matches) {
      const option = document.createElement('option'); option.value = item.id; option.textContent = item.id + ' · ' + item.koRaw; select.append(option);
    }
    select.value = matches.some((item) => item.id === previous) ? previous : matches[0]?.id || '';
    byId('count').textContent = matches.length + ' / ' + items.length + '개'; show();
  }
  for (const key of [...filters, 'search']) byId(key).addEventListener('input', filter);
  select.addEventListener('change', show);
  copy.addEventListener('click', async () => {
    if (!prompt.value) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(prompt.value); message.textContent = '프롬프트 전체를 복사했습니다.';
    } catch {
      prompt.focus(); prompt.select();
      try { if (!document.execCommand('copy')) throw new Error('copy unavailable'); message.textContent = '프롬프트 전체를 복사했습니다.'; }
      catch { message.textContent = '복사가 제한되어 전체를 선택했습니다. ⌘C 또는 Ctrl+C로 복사하세요.'; }
    }
  });
  filter();
}

export function boardHtml(items) {
  return `<!doctype html>
<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FlagQuiz 그림 프롬프트 보드</title>
<style>body{max-width:1120px;margin:32px auto;padding:0 20px;background:#f1f5fb;color:#17213b;font:16px/1.5 system-ui,sans-serif}h1{font-size:28px}label{display:inline-flex;flex-direction:column;gap:4px;margin:0 12px 12px 0}select,input,button,textarea{font:inherit;padding:10px;border:1px solid #8c97ae;border-radius:8px}main{display:grid;grid-template-columns:minmax(220px,1fr) minmax(300px,2fr);gap:20px}#items{width:100%;height:520px}textarea{box-sizing:border-box;width:100%;height:430px;background:white}pre{white-space:pre-wrap;overflow-wrap:anywhere}button{cursor:pointer;background:#e0e9ff}button:disabled{cursor:default;opacity:.55}@media(max-width:700px){main{display:block}#items{height:200px}}</style>
<h1>그림 프롬프트 보드</h1><p>원장에서 조립한 문장을 복사하여 이미지 도구에 붙여 넣으세요. 이 페이지는 로컬 파일만으로 작동합니다.</p>
<label>대륙<select id="continent"><option value="">전체</option></select></label><label>종류<select id="kind"><option value="">전체</option></select></label><label>상태<select id="status"><option value="">전체</option></select></label><label>나라 코드·한국어 검색<input id="search" type="search"></label><span id="count"></span>
<main><section><label for="items">항목</label><select id="items" size="15"></select><pre id="details"></pre></section><section><label for="prompt">조립된 전체 프롬프트</label><textarea id="prompt" readonly spellcheck="false"></textarea><button id="copy" type="button">프롬프트 전체 복사</button><p id="message" role="status" aria-live="polite"></p></section></main>
<script id="board-data" type="application/json">${inlineJson(items)}</script><script>(${boardClient.toString()})(document,navigator);</script></html>\n`;
}

export function boardReadme(ledger, report) {
  const safe = (value) => String(value ?? '').replace(/[|<>\r\n]/g, ' ');
  const done = report.statuses['approved-image'] || 0;
  return `${report.items}개 중 ${done}개 생성·검수 완료\n\n# FlagQuiz 그림 제작 팩\n\n[프롬프트 보드 열기](index.html)에서 항목을 고르고 전체 문장을 복사합니다. presets.json이 정본이며 settings.csv는 같은 항목의 검토용 표입니다. 문장·그림의 승인 상태를 구분하여 기록합니다.\n\n## 도구와 공통 설정\n\n| 항목 | 값 |\n|---|---|\n| 생성 도구 | ${safe(ledger.common.tool)} |\n| 화풍 | ${safe(report.styleChoice || '미선택: 본 생성 거부')} |\n| 비율 | 4:3 |\n| A 변환 | 768×576 · WebP quality 80 · 40KB 경고 / 60KB 실패 |\n| B 변환 | 1024×768 · WebP quality 80 · 110KB 경고 / 150KB 실패 |\n| 원본 | 생성 결과 PNG를 별도 보존 |\n| 앱 파일 | images/symbols/ · images/places/ |\n\n## 생성·저장 흐름\n\n1. 원장 문장을 개별 큐레이션하고 소재 및 화풍 결정을 기록합니다. styleChoice가 null이면 본 생성 조립이 중단됩니다.\n2. \`node scripts/build-image-prompts.mjs --style ${report.styleChoice || 'a|b'} --board\`로 개별 텍스트·보드·이 현황을 함께 갱신합니다. 필터를 지정하면 텍스트 파일은 선택 항목만 갱신되며 보드는 원장 전체를 보여 줍니다.\n3. 보드에서 전체 프롬프트를 복사해 내장 이미지 도구로 한 장씩 생성합니다. 구체적 모델 버전은 도구가 제공한 경우에만 기록합니다.\n4. 원본을 보존하고 변환 도구로 WebP를 만듭니다. 변환·검사 명령의 사용법은 해당 스크립트의 도움말을 따릅니다.\n\n## 검수\n\n[CHECK.md](CHECK.md)의 개별 항목과 컨택트시트에서 개수·형태·여백·색·밝고 어두운 배경을 확인합니다. 기계 검사와 이미지 검토가 끝난 항목만 approved-image로 기록합니다. 에이전트 큐레이션은 사람 승인으로 표시하지 않습니다.\n\n\`node scripts/image-ledger.mjs contact\`는 approved-image 항목을 40장씩 나눠 contact/1.html부터 만듭니다. 기본 앵커는 원장에 등록한 ${safe(ledger.anchor?.file || "anchor/kr.png")}이며 다른 파일은 \`--anchor 파일명.png\`로 고릅니다. 앵커가 없으면 미등록으로 표시합니다. 각 페이지에서 밝은·어두운 배경과 국기 비교를 전환할 수 있습니다.\n\n## 진행 현황\n\n| 항목 | 개수 |\n|---|---:|\n| 전체 | ${report.items} |\n| 상징물 | ${report.symbols} |\n| 명소 | ${report.landmarks} |\n| 문장 미작성 | ${report.unwritten} |\n${Object.entries(report.statuses).sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => '| ' + safe(status) + ' | ' + count + ' |').join('\n')}\n\n이 집계는 원장 상태를 읽어 자동 생성합니다. 이 문서를 수정하지 말고 원장을 갱신한 뒤 --board를 다시 실행하세요.\n`;
}

export function writeBoard(root, ledger, report, prompts) {
  const items = ledger.items.map((item) => ({ id: item.id, code: item.code, kind: item.kind, continent: item.continent, status: item.status, koRaw: item.koRaw, koApprove: item.koApprove, riskNote: item.riskNote, confusionGroups: item.confusionGroups, grade: item.grade, csvStatus: item.csvStatus, prompt: prompts.get(item.id) || null }));
  const html = boardHtml(items);
  if (Buffer.byteLength(html) > 2_000_000) throw new Error('프롬프트 보드가 2MB를 초과했습니다.');
  const directory = path.join(root, 'docs/image-prompts');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), html);
  fs.writeFileSync(path.join(directory, 'README.md'), boardReadme(ledger, report));
  return { items: items.length, bytes: Buffer.byteLength(html) };
}
