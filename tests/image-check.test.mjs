import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import os from'node:os';
import{checkImages,readWebpDimensions}from'../scripts/check-images.mjs';
import{createHash}from'node:crypto';
function chunk(type,payload){const b=Buffer.alloc(8+payload.length+(payload.length&1));b.write(type);b.writeUInt32LE(payload.length,4);payload.copy(b,8);return b;}
function webp(width=1024,height=768,type='VP8 ',extra=0){let p,chunks=[];if(type==='VP8L'){p=Buffer.alloc(5);p[0]=0x2f;p.writeUInt32LE((width-1)|((height-1)<<14),1);chunks.push(chunk('VP8L',p));}else{p=Buffer.alloc(10);Buffer.from([0x9d,1,0x2a]).copy(p,3);p.writeUInt16LE(width,6);p.writeUInt16LE(height,8);if(type==='VP8X'){const x=Buffer.alloc(10);x.writeUIntLE(width-1,4,3);x.writeUIntLE(height-1,7,3);chunks.push(chunk('VP8X',x));}chunks.push(chunk('VP8 ',p));}if(extra)chunks.push(chunk('JUNK',Buffer.alloc(extra)));const body=Buffer.concat([Buffer.from('WEBP'),...chunks]);const out=Buffer.alloc(8+body.length);out.write('RIFF');out.writeUInt32LE(body.length,4);body.copy(out,8);return out;}
function fixture({style='b',status='approved-image',bytes=webp(),write=true,prompt='Actual prompt'}={}){const root=fs.mkdtempSync(path.join(os.tmpdir(),'fq-image-check-'));fs.mkdirSync(path.join(root,'data'));fs.writeFileSync(path.join(root,'data/countries.js'),"window.FQ={countries:[{code:'kr'}]};");fs.mkdirSync(path.join(root,'docs/image-prompts/prompts'),{recursive:true});fs.writeFileSync(path.join(root,'docs/image-prompts/prompts/kr-symbol.txt'),prompt);fs.writeFileSync(path.join(root,'docs/image-prompts/presets.json'),JSON.stringify({styleChoice:style,items:[{id:'kr-symbol',code:'kr',kind:'symbol',status,bytes:bytes.length,outputStem:'images/symbols/kr'}]}));if(write){fs.mkdirSync(path.join(root,'images/symbols'),{recursive:true});fs.writeFileSync(path.join(root,'images/symbols/kr.webp'),bytes);}return root;}
function using(options,fn){const root=fixture(options);try{fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('WebP VP8·VP8L·VP8X는 실제 이미지 청크의 치수를 읽는다',()=>{for(const type of ['VP8 ','VP8L','VP8X'])assert.deepEqual(readWebpDimensions(webp(768,576,type)),{width:768,height:576});assert.deepEqual(readWebpDimensions(webp(1024,768,'VP8X',3)),{width:1024,height:768});});
test('RIFF 길이·키프레임·실제 청크 없는 canvas·canvas 속임수를 거부한다',()=>{const broken=webp();broken.writeUInt32LE(0,4);assert.throws(()=>readWebpDimensions(broken),/RIFF/);const keyframe=webp();keyframe[23]=0;assert.throws(()=>readWebpDimensions(keyframe),/키프레임/);const noImage=webp(1024,768,'VP8X').subarray(0,30);noImage.writeUInt32LE(noImage.length-8,4);assert.throws(()=>readWebpDimensions(noImage),/실제 이미지/);const mismatch=webp(800,600,'VP8X');mismatch.writeUIntLE(1023,24,3);mismatch.writeUIntLE(767,27,3);assert.throws(()=>readWebpDimensions(mismatch),/canvas/);const animated=webp(1024,768,'VP8X');animated[20]=2;assert.throws(()=>readWebpDimensions(animated),/애니메이션/);});
test('원장도 이미지도 없는 단계와 승인0건 null 화풍은 정상 통과한다',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'fq-image-empty-'));try{assert.equal(checkImages({root}).ok,true);}finally{fs.rmSync(root,{recursive:true,force:true});}using({status:'draft',style:null,write:false},root=>assert.equal(checkImages({root}).ok,true));using({},root=>assert.equal(checkImages({root}).ok,true));});
test('고아 파일과 미승인 그림은 실패하고 승인 그림의 누락도 실패한다',()=>{using({},root=>{fs.writeFileSync(path.join(root,'images/symbols/zz.webp'),webp());assert.ok(checkImages({root}).errors.some(e=>/고아 파일.*zz.webp/.test(e)));});using({status:'generated'},root=>assert.ok(checkImages({root}).errors.some(e=>/고아 파일/.test(e))));using({write:false},root=>assert.ok(checkImages({root}).errors.some(e=>/승인 그림 파일 누락/.test(e))));});
test('화풍 치수와 소수 없는 10진 KB 경고·상한을 검사한다',()=>{using({style:'a',bytes:webp(800,600)},root=>assert.ok(checkImages({root}).errors.some(e=>/치수 불일치 768×576 기대/.test(e))));using({bytes:webp(1024,768,'VP8 ',110000)},root=>{const r=checkImages({root});assert.equal(r.ok,true);assert.equal(r.warnings.length,1);});using({bytes:webp(1024,768,'VP8 ',150000)},root=>assert.ok(checkImages({root}).errors.some(e=>/용량 상한 초과/.test(e))));using({style:null},root=>assert.ok(checkImages({root}).errors.some(e=>/미선택/.test(e))));});
test('프롬프트 누락·원장 bytes 불일치·가짜확장자·심볼릭 링크를 거부한다',()=>{using({prompt:'  '},root=>assert.ok(checkImages({root}).errors.some(e=>/프롬프트 누락/.test(e))));using({},root=>{const packPath=path.join(root,'docs/image-prompts/presets.json'),p=JSON.parse(fs.readFileSync(packPath));p.items[0].bytes++;fs.writeFileSync(packPath,JSON.stringify(p));assert.ok(checkImages({root}).errors.some(e=>/bytes 불일치/.test(e)));});using({},root=>{fs.writeFileSync(path.join(root,'images/symbols/kr.png'),webp());assert.ok(checkImages({root}).errors.some(e=>/확장자 오류/.test(e)));fs.symlinkSync('kr.webp',path.join(root,'images/symbols/jp.webp'));assert.ok(checkImages({root}).errors.some(e=>/일반 WebP/.test(e)));});});
test('원장의 출력 경로가 지정된 이미지 폴더를 벗어나면 거부한다',()=>{using({},root=>{const packPath=path.join(root,'docs/image-prompts/presets.json'),p=JSON.parse(fs.readFileSync(packPath));p.items[0].outputStem='../../outside';fs.writeFileSync(packPath,JSON.stringify(p));assert.ok(checkImages({root}).errors.some(e=>/원장 항목 경로/.test(e)));p.items=[null];fs.writeFileSync(packPath,JSON.stringify(p));assert.ok(checkImages({root}).errors.some(e=>/항목은 객체/.test(e)));});});
test('빈 폴더용 .gitkeep만 허용하며 숨긴 비이미지 파일은 계속 거부한다',()=>{using({status:'draft',style:null,write:false},root=>{const dir=path.join(root,'images/symbols');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'.gitkeep'),'');assert.equal(checkImages({root}).ok,true);fs.writeFileSync(path.join(dir,'.gitkeep'),'unexpected content');assert.equal(checkImages({root}).ok,false);});});

function addProduction(root) {
  const base=path.join(root,'docs/image-prompts'), file=path.join(base,'presets.json'),pack=JSON.parse(fs.readFileSync(file));
  pack.items[0].productionRecord='docs/image-prompts/production.json#kr-symbol';
  fs.writeFileSync(file,JSON.stringify(pack));
  const prompt='SUBJECT: One crane.',promptPath='docs/image-prompts/generation-prompts/kr-symbol-01.txt';
  fs.mkdirSync(path.join(base,'generation-prompts'));
  fs.writeFileSync(path.join(root,promptPath),prompt);
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  const record={id:'kr-symbol',output:'images/symbols/kr.webp',outputSha256:sha(fs.readFileSync(path.join(root,'images/symbols/kr.webp'))),actualPrompts:[{attempt:1,path:promptPath,sha256:sha(prompt)}]};
  fs.writeFileSync(path.join(base,'production.json'),JSON.stringify({items:[record]}));
  return {base,promptPath,record};
}
test('치수와 길이가 같아도 검수 후 그림 본문이 바뀌면 제작 해시로 거부한다',()=>using({bytes:webp(1024,768,'VP8 ',8)},root=>{
  addProduction(root);assert.equal(checkImages({root}).ok,true);
  const file=path.join(root,'images/symbols/kr.webp'),bytes=fs.readFileSync(file);bytes[bytes.length-1]=1;fs.writeFileSync(file,bytes);
  assert.ok(checkImages({root}).errors.some(e=>/검수한 그림과 SHA-256 불일치/.test(e)));
}));
test('제작 이력이나 실제 요청이 누락·변경되면 거부하고 경로 탈출을 읽지 않는다',()=>using({},root=>{
  const {base,promptPath,record}=addProduction(root);
  fs.writeFileSync(path.join(root,promptPath),'Changed request');
  assert.ok(checkImages({root}).errors.some(e=>/생성 요청 SHA-256/.test(e)));
  record.actualPrompts[0].path='../../outside.txt';fs.writeFileSync(path.join(base,'production.json'),JSON.stringify({items:[record]}));
  assert.ok(checkImages({root}).errors.some(e=>/생성 요청 경로 오류/.test(e)));
  fs.rmSync(path.join(base,'production.json'));assert.ok(checkImages({root}).errors.some(e=>/제작 이력 읽기 실패/.test(e)));
}));
