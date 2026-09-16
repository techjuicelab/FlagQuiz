/* 파일이 없는 도입 단계는 허용하고, 있는 그림은 원장·실제 WebP 헤더와 대조한다. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { imageStyle, readWebpDimensions } from './prepare-images.mjs';
export { readWebpDimensions } from './prepare-images.mjs';
const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function checkImages({root = projectRoot} = {}) {
  const errors = [], warnings = [], files = [];
  const images = path.join(root,'images');
  if (fs.existsSync(images)) {
    if (!fs.lstatSync(images).isDirectory() || fs.lstatSync(images).isSymbolicLink()) errors.push('그림 루트는 실제 디렉터리여야 합니다: images');
    else for (const entry of fs.readdirSync(images,{withFileTypes:true})) {
      if (!['symbols','places'].includes(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) { errors.push('허용되지 않은 그림 경로: images/'+entry.name); continue; }
      for (const file of fs.readdirSync(path.join(images,entry.name),{withFileTypes:true})) {
        const relative = 'images/'+entry.name+'/'+file.name;
        if (file.name === '.gitkeep' && file.isFile() && fs.statSync(path.join(root,relative)).size === 0) continue;
        if (!file.isFile() || file.isSymbolicLink()) { errors.push('일반 WebP 파일만 허용합니다: '+relative); continue; }
        files.push({relative,folder:entry.name,name:file.name});
      }
    }
  }
  const packFile = path.join(root,'docs/image-prompts/presets.json');
  if (!fs.existsSync(packFile)) {
    if (files.length) errors.push('원장 없음: 그림 파일은 고아 파일입니다. docs/image-prompts/presets.json 필요');
    return {ok:errors.length===0,errors,warnings,files:files.length,approved:0,checked:0};
  }
  let pack, codes;
  try {
    pack = JSON.parse(fs.readFileSync(packFile,'utf8'));
    if (!Array.isArray(pack.items)) throw new Error('items 배열 없음');
    const context = {window:{}};
    vm.runInNewContext(fs.readFileSync(path.join(root,'data/countries.js'),'utf8'),context,{filename:'data/countries.js'});
    codes = new Set(context.window.FQ.countries.map(c=>c.code));
  } catch(error) {
    errors.push('원장 또는 국가 자료 오류: '+error.message);
    return {ok:false,errors,warnings,files:files.length,approved:0,checked:0};
  }
  const byPath = new Map(), approved = [], seen = new Set();
  for (const item of pack.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { errors.push('원장 항목은 객체여야 합니다.'); continue; }
    const folder = item.kind === 'symbol' ? 'symbols' : item.kind === 'landmark' ? 'places' : null;
    const stem = `images/${folder}/${item.code}`;
    if (seen.has(item.id)) errors.push('원장 id 중복: '+item.id); seen.add(item.id);
    if (!folder || !/^[a-z]{2}$/.test(item.code) || !codes.has(item.code) || item.id !== item.code+'-'+item.kind || item.outputStem !== stem) {
      errors.push('원장 항목 경로·국가 코드 불일치: '+item.id); continue;
    }
    byPath.set(stem+'.webp',item);
    if (item.status === 'approved-image') approved.push(item);
  }
  let style;
  if (files.length || approved.length) {
    try { style=imageStyle(pack); } catch(error) { errors.push(error.message); }
  }
  const present = new Set(); let checked = 0;
  const production = new Map();
  const tracked = approved.filter(item => item.productionRecord);
  if (tracked.length) {
    try {
      const record = JSON.parse(fs.readFileSync(path.join(root,'docs/image-prompts/production.json'),'utf8'));
      if (!Array.isArray(record.items)) throw new Error('items 배열 없음');
      for (const entry of record.items) {
        if (!entry || production.has(entry.id)) throw new Error('중복 또는 잘못된 제작 id');
        production.set(entry.id,entry);
      }
    } catch(error) { errors.push('제작 이력 읽기 실패: '+error.message); }
  }
  for (const file of files) {
    const {relative,name} = file;
    present.add(relative);
    if (!/^[a-z]{2}\.webp$/.test(name)) errors.push('WebP 파일명·확장자 오류: '+relative);
    const code=name.replace(/\.webp$/,'');
    if (!codes.has(code)) errors.push('국가 목록에 없는 파일 코드: '+relative);
    const item=byPath.get(relative);
    if (!item || item.status !== 'approved-image') errors.push('고아 파일 (approved-image 원장 없음): '+relative);
    const bytes=fs.readFileSync(path.join(root,relative));
    try {
      const dimensions=readWebpDimensions(bytes);
      if (style && (dimensions.width !== style.width || dimensions.height !== style.height)) errors.push('치수 불일치 '+style.width+'×'+style.height+' 기대: '+relative+' ('+dimensions.width+'×'+dimensions.height+')');
      checked++;
    } catch(error) { errors.push(relative+': '+error.message); }
    if (style && bytes.length > style.maxBytes) errors.push('용량 상한 초과: '+relative+' '+bytes.length+'B / '+style.maxBytes+'B');
    else if (style && bytes.length > style.warnBytes) warnings.push('용량 경고: '+relative+' '+bytes.length+'B / '+style.warnBytes+'B');
    if (item && item.bytes !== bytes.length) errors.push('원장 bytes 불일치: '+relative+' 원장 '+item.bytes+' / 실제 '+bytes.length);
    if (item?.productionRecord) {
      const record = production.get(item.id);
      if (!record || item.productionRecord !== 'docs/image-prompts/production.json#'+item.id || record.output !== relative) errors.push('제작 이력 경로 불일치: '+item.id);
      else if (createHash('sha256').update(bytes).digest('hex') !== record.outputSha256) errors.push('검수한 그림과 SHA-256 불일치: '+relative);
    }
  }
  for (const item of approved) {
    const relative=item.outputStem+'.webp';
    if (!present.has(relative)) errors.push('승인 그림 파일 누락: '+relative);
    const prompt=path.join(root,'docs/image-prompts/prompts',item.id+'.txt');
    if (!fs.existsSync(prompt) || !fs.lstatSync(prompt).isFile() || fs.lstatSync(prompt).isSymbolicLink() || !fs.readFileSync(prompt,'utf8').trim()) errors.push('실제 프롬프트 누락 또는 비어 있음: '+item.id);
    if (item.productionRecord) {
      const requests = production.get(item.id)?.actualPrompts;
      if (!Array.isArray(requests) || !requests.length) errors.push('실제 생성 요청 이력 없음: '+item.id);
      else for (const request of requests) {
        if (!request || !new RegExp('^docs/image-prompts/generation-prompts/'+item.id+'-[0-9]{2}\\.txt$').test(request.path)) { errors.push('생성 요청 경로 오류: '+item.id); continue; }
        const file = path.join(root,request.path);
        if (!fs.existsSync(file) || !fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink() || createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== request.sha256) errors.push('실제 생성 요청 SHA-256 불일치: '+request.path);
      }
    }
  }
  // 배경색·12% 여백은 WebP 헤더로 알 수 없다. 픽셀 디코더를 추가하지 않고 CHECK.md 사람 검수로 남긴다.
  return {ok:errors.length===0,errors,warnings,files:files.length,approved:approved.length,checked};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--root')) throw new Error('사용법: node scripts/check-images.mjs [--root 저장소]');
    const result=checkImages(args.length ? {root:path.resolve(args[1])} : {});
    for (const error of result.errors) console.error('실패: '+error);
    for (const warning of result.warnings) console.log('경고: '+warning);
    console.log('이미지 검사: 파일 '+result.files+' · 승인 '+result.approved+' · 헤더 확인 '+result.checked+' · 실패 '+result.errors.length+' · 경고 '+result.warnings.length);
    if (!result.ok) process.exitCode=1;
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
