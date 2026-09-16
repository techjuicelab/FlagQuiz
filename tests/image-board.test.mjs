import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { readLedger, writeLedger, reportLedger } from '../scripts/image-ledger.mjs';
import { buildPrompt, buildPrompts } from '../scripts/build-image-prompts.mjs';
import { boardHtml, boardReadme } from '../scripts/lib/image-board.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flagquiz-board-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ledger = readLedger(); writeLedger(ledger, root); return { root, ledger };
}
function embedded(html) { return JSON.parse(html.match(/<script id="board-data" type="application\/json">([^]*?)<\/script>/)[1]); }
function controls(html, clipboard) {
  const make = () => ({ value: '', textContent: '', children: [], events: {}, disabled: false,
    append(node) { this.children.push(node); }, replaceChildren() { this.children = []; },
    addEventListener(type, handler) { this.events[type] = handler; }, focus() { this.focused = true; }, select() { this.selected = true; } });
  const elements = Object.fromEntries(['board-data','items','prompt','copy','message','continent','kind','status','search','details','count'].map((id) => [id, make()]));
  elements['board-data'].textContent = JSON.stringify(embedded(html));
  const document = { getElementById: (id) => elements[id], createElement: make, execCommand: () => false };
  vm.runInNewContext(html.match(/<script>([^]*?)<\/script>/)[1], { document, navigator: { clipboard } });
  return elements;
}

test('보드는 원장 342개를 인라인하고 조립 파일과 복사 본문이 바이트까지 같다', async (t) => {
  const { root, ledger } = fixture(t);
  // 실제 제작이 전부 끝나도 미작성 항목의 복사 차단을 계속 검사한다.
  ledger.items[0].subjectEn = null;
  ledger.items[0].status = 'draft';
  writeLedger(ledger, root);
  const result = buildPrompts({ root, style: 'b', board: true });
  const html = fs.readFileSync(path.join(root, 'docs/image-prompts/index.html'), 'utf8');
  const items = embedded(html);
  assert.equal(items.length, 342);
  assert.deepEqual(items.map((item) => item.id), ledger.items.map((item) => item.id));
  assert.ok(Buffer.byteLength(html) < 2_000_000);
  assert.doesNotMatch(html, /<(?:script|link|img)\b[^>]*(?:src|href)\s*=|fetch\s*\(|@import|url\s*\(/i);
  let copied;
  const ui = controls(html, { async writeText(text) { copied = text; } });
  for (const file of result.written) {
    const item = items.find((entry) => entry.id === file.id);
    assert.equal(item.prompt, fs.readFileSync(file.path, 'utf8'));
    ui.items.value = file.id; ui.items.events.change(); await ui.copy.events.click();
    assert.equal(copied, file.content);
  }
  const unfinished = items.find((item) => !item.prompt);
  ui.items.value = unfinished.id; ui.items.events.change(); assert.equal(ui.copy.disabled, true);
});

test('실제 인라인 UI는 대륙·종류·상태와 한국어·코드 검색을 교차 적용한다', () => {
  const items = [{ id:'kr-symbol',code:'kr',kind:'symbol',continent:'아시아',status:'draft',koRaw:'호랑이',prompt:'A\n' }, { id:'fr-landmark',code:'fr',kind:'landmark',continent:'유럽',status:'generated',koRaw:'에펠탑',prompt:'B\n' }];
  const ui = controls(boardHtml(items));
  ui.continent.value = '유럽'; ui.continent.events.input(); assert.equal(ui.items.value, 'fr-landmark');
  ui.kind.value = 'symbol'; ui.kind.events.input(); assert.equal(ui.items.children.length, 0);
  ui.kind.value = ''; ui.continent.value = ''; ui.search.value = '호랑'; ui.search.events.input(); assert.equal(ui.items.value, 'kr-symbol');
  ui.search.value = 'FR'; ui.search.events.input(); assert.equal(ui.items.value, 'fr-landmark');
  ui.status.value = 'draft'; ui.status.events.input(); assert.equal(ui.items.children.length, 0);
});

test('원장 태그·따옴표는 실행되지 않고 file:// 복사 제한 때 수동 복사가 가능하다', async () => {
  const evil = '</script><img src="https://invalid.test/x" onerror="throw 1">&\u2028\n"';
  const html = boardHtml([{ id:'kr-symbol',code:'kr',kind:'symbol',koRaw:evil,riskNote:evil,prompt:evil,confusionGroups:[evil] }]);
  assert.doesNotMatch(html, /<img/);
  assert.equal((html.match(/<script\b/g) || []).length, 2);
  assert.equal(embedded(html)[0].prompt, evil);
  const ui = controls(html); await ui.copy.events.click();
  assert.equal(ui.prompt.value, evil); assert.equal(ui.prompt.selected, true);
  assert.match(ui.message.textContent, /⌘C/); assert.ok(ui.details.textContent.includes(evil));
});

test('342개 전체 조립도 2MB 이하이고 README는 실제 승인 상태에서 집계한다', () => {
  const ledger = readLedger();
  const populated = ledger.items.map((item) => ({ ...item, subjectEn:'A single test subject with green leaves.', status:'agent-curated' }));
  const html = boardHtml(populated.map((item) => ({ ...item, prompt: buildPrompt(item, ledger, 'b') })));
  assert.ok(Buffer.byteLength(html) < 2_000_000);
  ledger.items[0].status = 'approved-image'; ledger.items[1].status = 'generated'; ledger.items[2].status = 'draft';
  const report = reportLedger(ledger), readme = boardReadme(ledger, report);
  assert.ok(readme.startsWith('342개 중 ' + report.statuses['approved-image'] + '개 생성·검수 완료'));
  assert.match(readme, /agent-curated|draft/);
  ledger.styleChoice = null; assert.match(boardReadme(ledger, reportLedger(ledger)), /미선택: 본 생성 거부/);
});

test('stdout과 board를 함께 요청하면 아무 파일도 쓰지 않는다', (t) => {
  const { root } = fixture(t);
  assert.throws(() => buildPrompts({ root, style:'b', stdout:true, board:true }), /함께/);
  assert.equal(fs.existsSync(path.join(root, 'docs/image-prompts/index.html')), false);
});

const { buildContactSheets, contactClient } = await import('../scripts/lib/image-contact.mjs');

test('컨택트시트는 승인된 항목을 40개씩 나누고 앵커·그림·국기를 로컬 상대 경로로 읽는다', (t) => {
  const { root, ledger } = fixture(t);
  delete ledger.anchor; // 앵커 미등록 원장의 기존 kr.png 폴백을 검사한다.
  ledger.items.forEach((item, index) => { item.status = index < 81 ? 'approved-image' : 'generated'; });
  for (const file of ['docs/image-prompts/anchor/kr.png', 'images/symbols/ad.webp', 'flags/ad.svg']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), 'fixture');
  }
  const result = buildContactSheets(root, ledger);
  assert.equal(result.pages, 3); assert.equal(result.items, 81); assert.equal(result.anchor, 'kr.png');
  const htmls = result.files.map((file) => fs.readFileSync(file, 'utf8'));
  assert.deepEqual(htmls.map((html) => (html.match(/class="item"/g) || []).length), [40,40,1]);
  for (const html of htmls) {
    assert.match(html, /repeat\(8,/); assert.match(html, /repeat\(5,/); assert.match(html, /aspect-ratio:4\/3/);
    assert.match(html, /src="..\/anchor\/kr.png"/);
    for (const [, resource] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      assert.doesNotMatch(resource, /^(?:[a-z]+:|\/\/|\/)/i);
      assert.ok(fs.existsSync(path.resolve(path.dirname(result.files[0]), resource)), resource);
    }
    assert.doesNotMatch(html, /fetch\s*\(|@import|url\s*\(|data:image/);
  }
  assert.match(htmls[0], /src="..\/..\/..\/images\/symbols\/ad.webp"/);
  assert.match(htmls[0], /src="..\/..\/..\/flags\/ad.svg"/);
  assert.doesNotMatch(htmls[0], /src="[^"]*ae.webp"/);
  assert.match(htmls[0], /<span class="missing">ae<\/span>/);
  fs.writeFileSync(path.join(root, 'docs/image-prompts/contact/notes.html'), 'keep');
  ledger.items.forEach((item) => { item.status = 'draft'; });
  assert.equal(buildContactSheets(root, ledger).pages, 0);
  assert.deepEqual(fs.readdirSync(path.join(root, 'docs/image-prompts/contact')), ['notes.html']);
});

test('컨택트시트는 별도 인자 없이 원장에 등록한 B 앵커를 읽는다', (t) => {
  const {root,ledger}=fixture(t);
  ledger.anchor={file:'docs/image-prompts/anchor/b-kr-landmark.png'};
  const file=path.join(root,ledger.anchor.file);
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fixture');
  const result=buildContactSheets(root,ledger);
  assert.equal(result.anchor,'b-kr-landmark.png');
  assert.match(fs.readFileSync(result.files[0],'utf8'),/src="..\/anchor\/b-kr-landmark.png"/);
});

test('컨택트시트 토글은 실제 테마·국기 나란히 표시·깨진 파일 대체를 작동시킨다', () => {
  const make = () => ({ events:{}, attrs:{}, addEventListener(type, handler) { this.events[type] = handler; }, setAttribute(key, value) { this.attrs[key] = value; } });
  const buttons = { light:make(), dark:make(), flags:make() }, image = { ...make(), hidden:false, nextElementSibling:{ hidden:true } };
  const document = { getElementById:(id) => buttons[id], body:{ dataset:{ theme:'light' }, classList:{ toggle(name, value) { this[name] = value; } } }, querySelectorAll:() => [image] };
  contactClient(document);
  buttons.dark.events.click(); assert.equal(document.body.dataset.theme, 'dark'); assert.equal(buttons.dark.attrs['aria-pressed'], 'true');
  buttons.light.events.click(); assert.equal(document.body.dataset.theme, 'light');
  buttons.flags.events.change({ target:{ checked:true } }); assert.equal(document.body.classList['show-flags'], true);
  image.events.error(); assert.equal(image.hidden, true); assert.equal(image.nextElementSibling.hidden, false);
});

test('컨택트시트 경로 주입과 중복 ID는 파일을 쓰기 전에 거부한다', (t) => {
  const { root, ledger } = fixture(t);
  assert.throws(() => buildContactSheets(root, ledger, { anchor:'../../else.png' }), /앵커/);
  assert.throws(() => buildContactSheets(root, ledger, { anchor:'https://x.invalid/a.png' }), /앵커/);
  ledger.items[0].status = 'approved-image'; ledger.items[0].code = '../x';
  assert.throws(() => buildContactSheets(root, ledger), /형식/);
  assert.equal(fs.existsSync(path.join(root, 'docs/image-prompts/contact')), false);
});
