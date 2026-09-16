/* 완성된 그림만 40장씩 비교한다. 파일 경로는 검증된 code/kind로 조립한다. */
import fs from 'node:fs';
import path from 'node:path';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
const isFile = (file) => { try { return fs.statSync(file).isFile(); } catch { return false; } };
export function contactClient(document) {
  for (const theme of ['light', 'dark']) document.getElementById(theme).addEventListener('click', () => {
    document.body.dataset.theme = theme;
    for (const name of ['light', 'dark']) document.getElementById(name).setAttribute('aria-pressed', String(theme === name));
  });
  document.getElementById('flags').addEventListener('change', (event) => { document.body.classList.toggle('show-flags', event.target.checked); });
  for (const image of document.querySelectorAll('img')) image.addEventListener('error', () => {
    image.hidden = true; image.nextElementSibling.hidden = false;
  });
}

export function contactHtml({ root, items, page, pages, anchor = 'kr.png' }) {
  const outputDirectory = path.join(root, 'docs/image-prompts/contact');
  const picture = (file, label) => {
    const fallback = '<span class="missing"' + (isFile(file) ? ' hidden' : '') + '>' + escapeHtml(label) + '</span>';
    if (!isFile(file)) return '<div class="picture">' + fallback + '</div>';
    const relative = path.relative(outputDirectory, file).split(path.sep).map((piece) => piece === '..' ? piece : encodeURIComponent(piece)).join('/');
    return '<div class="picture"><img src="' + relative + '" alt="' + escapeHtml(label) + '">' + fallback + '</div>';
  };
  const cells = items.map((item) => '<figure class="item" data-id="' + item.id + '"><div class="pair">' + picture(path.join(root, 'images', item.kind === 'symbol' ? 'symbols' : 'places', item.code + '.webp'), item.code) + '<div class="flag">' + picture(path.join(root, 'flags', item.code + '.svg'), item.code + ' 국기') + '</div></div><figcaption>' + item.code + ' · ' + item.kind + '</figcaption></figure>').join('\n');
  return `<!doctype html>
<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FlagQuiz 그림 검수 ${page}/${pages}</title>
<style>:root{--card:#ffffff;--card-2:#f8fafc;--line:#e5e7eb;--ink:#17213b}body[data-theme=dark]{--card:#1e2439;--card-2:#262d45;--line:#333c57;--ink:#f1f5fb}body{margin:20px;font:14px/1.5 system-ui,sans-serif;color:var(--ink);background:var(--card)}button,label,a{margin-right:12px}button{font:inherit;padding:8px 12px}h1{font-size:22px}header{display:flex;align-items:center;gap:24px;margin:16px 0}.anchor{width:calc((100vw - 96px)/8);min-width:90px;margin:0}.grid{display:grid;grid-template-columns:repeat(8,minmax(90px,1fr));grid-template-rows:repeat(5,auto);gap:10px;min-width:790px}.item{margin:0;min-width:0}.pair{display:grid;grid-template-columns:1fr;gap:4px}.flag{display:none}.show-flags .pair{grid-template-columns:1fr 1fr}.show-flags .flag{display:block}.picture{display:grid;place-items:center;width:100%;aspect-ratio:4/3;box-sizing:border-box;border:1px solid var(--line);border-radius:12px;background:var(--card-2);overflow:hidden}.picture img{width:100%;height:100%;aspect-ratio:4/3;object-fit:contain}.picture [hidden]{display:none}.missing{color:#8a94a8}figcaption{font-size:11px;text-align:center;margin-top:3px}nav{margin:12px 0}a{color:inherit}@media print{button,label,nav{display:none}.grid{min-width:0}.anchor{min-width:0}}</style>
<body data-theme="light"><h1>그림 검수 ${page} / ${pages}</h1><button id="light" type="button" aria-pressed="true">밝은 배경</button><button id="dark" type="button" aria-pressed="false">어두운 배경</button><label><input id="flags" type="checkbox">국기 나란히 보기</label>
<header><figure class="anchor">${picture(path.join(root, 'docs/image-prompts/anchor', anchor), '앵커 미등록')}<figcaption>기준 앵커</figcaption></figure><p>앵커와 아래 최대 40장의 선·채도·그림자·여백을 비교하세요.<br>회색 코드는 파일 미등록 또는 읽기 실패입니다.</p></header>
<nav aria-label="검수 페이지">${Array.from({ length: pages }, (_, index) => '<a href="' + (index + 1) + '.html"' + (index + 1 === page ? ' aria-current="page"' : '') + '>' + (index + 1) + '</a>').join('')}</nav><main class="grid">${cells}</main>
<script>(${contactClient.toString()})(document);</script></body></html>\n`;
}

export function buildContactSheets(root, ledger, { anchor = path.basename(ledger.anchor?.file || 'kr.png') } = {}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(png|webp|jpg|jpeg)$/i.test(anchor)) throw new Error('앵커는 anchor/ 안의 PNG/WebP/JPEG 파일 이름이어야 합니다.');
  const items = ledger.items.filter((item) => item.status === 'approved-image');
  const seen = new Set();
  for (const item of items) {
    if (!/^[a-z]{2}$/.test(item.code) || !['symbol', 'landmark'].includes(item.kind) || item.id !== item.code + '-' + item.kind || seen.has(item.id)) throw new Error('검수 항목 id 형식 또는 중복: ' + item.id);
    seen.add(item.id);
  }
  const directory = path.join(root, 'docs/image-prompts/contact'), pages = Math.ceil(items.length / 40);
  const files = Array.from({ length: pages }, (_, index) => ({ path: path.join(directory, (index + 1) + '.html'), content: contactHtml({ root, items: items.slice(index * 40, (index + 1) * 40), page: index + 1, pages, anchor }) }));
  fs.mkdirSync(directory, { recursive: true });
  for (const file of fs.readdirSync(directory)) if (/^[1-9]\d*\.html$/.test(file)) fs.rmSync(path.join(directory, file));
  for (const file of files) fs.writeFileSync(file.path, file.content);
  return { items: items.length, pages, files: files.map((file) => file.path), anchor: isFile(path.join(root, 'docs/image-prompts/anchor', anchor)) ? anchor : null };
}
