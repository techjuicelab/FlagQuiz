import test from 'node:test';import assert from 'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{spawnSync}from'node:child_process';
import{deflateSync}from'node:zlib';
import{IMAGE_STYLES,readPngDimensions,readWebpDimensions,imageGeometry,insetGeometry,imageStyle,conversionCommands,prepareImages,formatCommand}from'../scripts/prepare-images.mjs';
function png(width,height){const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);return b;}
function webp(width,height){const b=Buffer.alloc(30);b.write('RIFF');b.writeUInt32LE(22,4);b.write('WEBPVP8 ',8);b.writeUInt32LE(10,16);Buffer.from([0x9d,1,0x2a]).copy(b,23);b.writeUInt16LE(width,26);b.writeUInt16LE(height,28);return b;}
function fixture(style='b'){const root=fs.mkdtempSync(path.join(os.tmpdir(),'fq-image-prepare-'));fs.mkdirSync(path.join(root,'docs/image-prompts'),{recursive:true});fs.mkdirSync(path.join(root,'raw'),{recursive:true});fs.writeFileSync(path.join(root,'raw/kr-symbol-01.png'),png(1536,1024));fs.writeFileSync(path.join(root,'docs/image-prompts/presets.json'),JSON.stringify({styleChoice:style,items:[{id:'kr-symbol',code:'kr',kind:'symbol',outputStem:'images/symbols/kr',bytes:null,status:'draft'}]}));return root;}
const quiet=()=>{};
test('PNG IHDR는 실제 폭·높이를 읽고 잘못된 헤더를 거부한다',()=>{assert.deepEqual(readPngDimensions(png(1536,1024)),{width:1536,height:1024});assert.throws(()=>readPngDimensions(Buffer.alloc(33)),/PNG/);assert.throws(()=>readPngDimensions(png(0,1)),/치수/);});
test('3:2는 중앙 크롭, 정사각은 여백 추가, 4:3은 크기 변경이며 스타일별 규격을 지킨다',()=>{assert.deepEqual(imageGeometry({width:1536,height:1024}),{mode:'crop',width:1365,height:1024,x:85,y:0});assert.deepEqual(imageGeometry({width:1024,height:1024}),{mode:'pad',width:1365,height:1024,x:171,y:0});assert.equal(imageGeometry({width:1024,height:768}).mode,'resize');assert.deepEqual([IMAGE_STYLES.a.width,IMAGE_STYLES.a.height,IMAGE_STYLES.a.maxBytes],[768,576,60000]);assert.deepEqual([IMAGE_STYLES.b.width,IMAGE_STYLES.b.height,IMAGE_STYLES.b.maxBytes],[1024,768,150000]);assert.throws(()=>imageStyle({styleChoice:null},'b'),/미선택/);assert.throws(()=>imageStyle({styleChoice:'b'},'a'),/다릅니다/);});
test('모든 명령은 정수 크롭·패딩 및 q80을 쓰며 cwebp 패딩은 sips와 연결한다',()=>{for(const tool of ['ffmpeg','magick','sips','cwebp']){const cmds=conversionCommands({tool,input:'raw.png',output:'out.webp',temp:'/tmp/fq',dimensions:{width:1024,height:1024},style:IMAGE_STYLES.b});const all=cmds.map(formatCommand).join('\n');assert.match(all,/1365/);assert.match(all,/F1F5FB/);assert.match(all,/80/);assert.doesNotMatch(all,/crop=4:3|-crop.*'4:3'/);if(tool==='sips'||tool==='cwebp'){assert.equal(cmds[0].command,'sips');assert.deepEqual(cmds[0].args.slice(0,3),['-p','1024','1365']);assert.equal(cmds.at(-1).command,'cwebp');}}const crop=conversionCommands({tool:'cwebp',input:'raw.png',output:'out.webp',temp:'/tmp/fq',dimensions:{width:1536,height:1024},style:IMAGE_STYLES.a})[0];assert.deepEqual(crop.args.slice(4,9),['-crop','85','0','1365','1024']);assert.ok(formatCommand({command:'cwebp',args:["file';$(bad).png"]}).includes("'\\''"));});
test('dry-run은 도구가 없어도 실제 PNG 치수 기반 명령만 만들고 아무 파일도 쓰지 않는다',()=>{const root=fixture();try{const before=fs.readdirSync(root);const logs=[];const jobs=prepareImages({root,inputDir:'raw',tool:'ffmpeg',dryRun:true,log:x=>logs.push(x),resolveTool(){assert.fail('dry-run에서 도구를 실행하면 안 된다');}});assert.equal(jobs.length,1);assert.ok(logs.some(x=>x.includes('crop=1365:1024:85:0')));assert.deepEqual(fs.readdirSync(root),before);assert.equal(fs.existsSync(path.join(root,'images')),false);}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('실행 실패는 기존 출력·원본·원장을 보존하고 정상 결과만 원자적으로 교체한다',()=>{const root=fixture();try{const output=path.join(root,'images/symbols/kr.webp');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,'old');const raw=fs.readFileSync(path.join(root,'raw/kr-symbol-01.png')),ledger=fs.readFileSync(path.join(root,'docs/image-prompts/presets.json'));const options={root,inputDir:'raw',log:quiet,resolveTool:x=>x};assert.throws(()=>prepareImages({...options,run(){throw new Error('encoder failed');}}),/encoder/);assert.equal(fs.readFileSync(output,'utf8'),'old');assert.throws(()=>prepareImages({...options,run(_command,args){fs.writeFileSync(args.at(-1),webp(800,600));}}),/치수/);assert.equal(fs.readFileSync(output,'utf8'),'old');const reports=prepareImages({...options,run(_command,args){fs.writeFileSync(args.at(-1),webp(1024,768));}});assert.equal(reports[0].bytes,30);assert.ok(fs.readFileSync(output).equals(webp(1024,768)));assert.ok(fs.readFileSync(path.join(root,'raw/kr-symbol-01.png')).equals(raw));assert.ok(fs.readFileSync(path.join(root,'docs/image-prompts/presets.json')).equals(ledger));assert.deepEqual(fs.readdirSync(path.dirname(output)),['kr.webp']);}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('도구가 없는 실제 CLI는 빈 파일을 만들지 않고 종료 코드 2를 반환한다',()=>{const root=fixture();try{const r=spawnSync(process.execPath,[new URL('../scripts/prepare-images.mjs',import.meta.url).pathname,'--root',root,'--in','raw'],{env:{...process.env,PATH:''},encoding:'utf8'});assert.equal(r.status,2);assert.match(r.stderr,/설치된 변환 도구가 없습니다/);assert.equal(fs.existsSync(path.join(root,'images')),false);}finally{fs.rmSync(root,{recursive:true,force:true});}});

test('inset은 비정상 값을 빈 작업에서도 거부하고 내부 상자에 원본 전체를 넣는다',()=>{
  for(const inset of [-1,.4,1,NaN,Infinity,'0.12',null]) assert.throws(()=>prepareImages({root:os.tmpdir(),inputDir:'nonexistent',inset,log:quiet}),/inset/);
  const inner=insetGeometry({width:400,height:100},IMAGE_STYLES.b,.12);
  assert.deepEqual(inner,{width:778,height:194,x:123,y:287});
  for(const tool of ['cwebp','sips','magick','ffmpeg']){
    const commands=conversionCommands({tool,input:'wide.png',output:'out.webp',temp:'/tmp/fq',dimensions:{width:400,height:100},style:IMAGE_STYLES.b,inset:.12});
    const command=commands.map(formatCommand).join('\n');
    assert.doesNotMatch(command,/crop/);assert.match(command,/778/);assert.match(command,/194/);assert.match(command,/1024/);assert.match(command,/768/);assert.match(command,/F1F5FB/);
  }
});
test('inset dry-run은 재실행 명령과 보고서에 여백값을 보존한다',()=>{const root=fixture();try{const logs=[];const reports=prepareImages({root,inputDir:'raw',inset:.12,dryRun:true,log:x=>logs.push(x)});assert.equal(reports[0].inset,.12);assert.ok(logs.some(x=>x.includes("'--inset' '0.12'")));assert.equal(fs.existsSync(path.join(root,'images')),false);
  for(const value of ['NaN','Infinity','-0.01','0.4',' ']){const result=spawnSync(process.execPath,[new URL('../scripts/prepare-images.mjs',import.meta.url).pathname,'--root',root,'--in','raw','--dry-run','--inset',value],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/inset/);}
}finally{fs.rmSync(root,{recursive:true,force:true});}});

// 가장자리 두 색 표식으로 실제 크롭 여부를 판별한다. 생성기 함수의 예상 배열을 복제하지 않는다.
function markedPng(width,height){
  const chunk=(name,data)=>{const bytes=Buffer.alloc(data.length+12);bytes.writeUInt32BE(data.length);bytes.write(name,4);data.copy(bytes,8);let crc=0xffffffff;for(const x of bytes.subarray(4,-4)){crc^=x;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}bytes.writeUInt32BE((crc^0xffffffff)>>>0,bytes.length-4);return bytes;};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  const pixels=Buffer.alloc((1+width*3)*height,255);for(let y=0;y<height;y++){pixels[y*(1+width*3)]=0;for(let x=0;x<width;x++){const at=y*(1+width*3)+1+x*3;if(x<width/10){pixels[at+1]=0;pixels[at+2]=0;}else if(x>=width*.9){pixels[at]=0;pixels[at+1]=0;}}}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
const hasRealTools=process.platform==='darwin'&&spawnSync('cwebp',['-version']).status===0&&spawnSync('sips',['--version']).status===0;
test('실제 sips+cwebp inset .12는 1024×768, 원본·원장 보존, 양쪽 끝 색 표식을 유지한다',{skip:!hasRealTools},()=>{
  const root=fixture();try{
    const input=path.join(root,'raw/kr-symbol-01.png'),raw=markedPng(400,100);fs.writeFileSync(input,raw);const ledger=fs.readFileSync(path.join(root,'docs/image-prompts/presets.json'));
    const reports=prepareImages({root,inputDir:'raw',tool:'cwebp',inset:.12,log:quiet});assert.equal(reports[0].inset,.12);
    const output=path.join(root,'images/symbols/kr.webp');assert.deepEqual(readWebpDimensions(fs.readFileSync(output)),{width:1024,height:768});assert.ok(fs.readFileSync(input).equals(raw));assert.ok(fs.readFileSync(path.join(root,'docs/image-prompts/presets.json')).equals(ledger));
    const bmpFile=path.join(root,'decoded.bmp');const decoded=spawnSync('sips',['-s','format','bmp',output,'--out',bmpFile],{encoding:'utf8'});assert.equal(decoded.status,0,decoded.stderr);
    const bmp=fs.readFileSync(bmpFile),offset=bmp.readUInt32LE(10),width=bmp.readInt32LE(18),height=bmp.readInt32LE(22),bpp=bmp.readUInt16LE(28);assert.ok(bpp===24||bpp===32);assert.equal(width,1024);assert.equal(Math.abs(height),768);
    const pixel=(x,y)=>{const stride=Math.ceil(width*bpp/32)*4,at=offset+(height>0?height-1-y:y)*stride+x*bpp/8;return[bmp[at+2],bmp[at+1],bmp[at]];};
    const background=pixel(10,10);for(let i=0;i<3;i++)assert.ok(Math.abs(background[i]-[241,245,251][i])<=6,'B 배경색 불일치: '+background);
    const left=pixel(140,350),right=pixel(880,350);assert.ok(left[0]>230&&left[1]<25&&left[2]<25,'왼쪽 표식 손실: '+left);assert.ok(right[2]>230&&right[0]<25&&right[1]<25,'오른쪽 표식 손실: '+right);
    assert.deepEqual(fs.readdirSync(path.dirname(output)),['kr.webp']);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
