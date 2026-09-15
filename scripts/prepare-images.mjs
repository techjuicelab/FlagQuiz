/* PNG 원본을 보존하며 화풍별 WebP 사본을 만든다. 실행에는 설치된 로컬 도구만 사용한다. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const IMAGE_STYLES = Object.freeze({
  a: Object.freeze({ width: 768, height: 576, quality: 80, warnBytes: 40 * 1000, maxBytes: 60 * 1000, background: '#FFFFFF' }),
  b: Object.freeze({ width: 1024, height: 768, quality: 80, warnBytes: 110 * 1000, maxBytes: 150 * 1000, background: '#F1F5FB' })
});
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const pngSignature = Buffer.from([137,80,78,71,13,10,26,10]);

export function readPngDimensions(bytes) {
  if (bytes.length < 33 || !bytes.subarray(0,8).equals(pngSignature) || bytes.toString('ascii',12,16) !== 'IHDR' || bytes.readUInt32BE(8) !== 13) throw new Error('PNG IHDR 형식이 올바르지 않습니다.');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 100000 || height > 100000) throw new Error('PNG 치수가 유효하지 않습니다.');
  return { width, height };
}

/** RIFF 컨테이너와 실제 이미지 청크를 함께 읽는다. VP8X canvas만 믿지 않는다. */
export function readWebpDimensions(bytes) {
  if (bytes.length < 20 || bytes.toString('ascii',0,4) !== 'RIFF' || bytes.toString('ascii',8,12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error('WebP RIFF 길이 또는 시그니처가 올바르지 않습니다.');
  let canvas = null, image = null;
  for (let at = 12; at < bytes.length;) {
    if (at + 8 > bytes.length) throw new Error('WebP 청크 헤더가 잘렸습니다.');
    const type = bytes.toString('ascii',at,at+4), length = bytes.readUInt32LE(at+4), start = at + 8, end = start + length;
    if (end + (length & 1) > bytes.length) throw new Error('WebP 청크 본문이 잘렸습니다.');
    let dims;
    if (type === 'VP8X') {
      if (canvas || at !== 12 || length !== 10 || (bytes[start] & 0xc3) || bytes.readUIntBE(start+1,3)) throw new Error('WebP VP8X 형식 또는 애니메이션이 허용되지 않습니다.');
      canvas = { width: bytes.readUIntLE(start+4,3)+1, height: bytes.readUIntLE(start+7,3)+1 };
    } else if (type === 'VP8 ') {
      if (length < 10 || (bytes[start] & 1) || !bytes.subarray(start+3,start+6).equals(Buffer.from([0x9d,1,0x2a]))) throw new Error('WebP VP8 키프레임 헤더가 올바르지 않습니다.');
      dims = { width: bytes.readUInt16LE(start+6) & 0x3fff, height: bytes.readUInt16LE(start+8) & 0x3fff };
    } else if (type === 'VP8L') {
      if (length < 5 || bytes[start] !== 0x2f) throw new Error('WebP VP8L 헤더가 올바르지 않습니다.');
      const bits = bytes.readUInt32LE(start+1);
      if (bits >>> 29) throw new Error('WebP VP8L 버전이 올바르지 않습니다.');
      dims = { width: (bits & 0x3fff)+1, height: ((bits >>> 14) & 0x3fff)+1 };
    } else if (type === 'ANIM' || type === 'ANMF') throw new Error('움직이는 WebP는 허용하지 않습니다.');
    if (dims) {
      if (image || !dims.width || !dims.height) throw new Error('WebP 이미지 청크가 중복되었거나 치수가 0입니다.');
      image = dims;
    }
    at = end + (length & 1);
  }
  if (!image) throw new Error('WebP 실제 이미지 청크가 없습니다.');
  if (canvas && (canvas.width !== image.width || canvas.height !== image.height)) throw new Error('WebP canvas와 실제 이미지 치수가 다릅니다.');
  return image;
}

export function imageStyle(ledger, requested) {
  if (!IMAGE_STYLES[ledger.styleChoice]) throw new Error('presets.json.styleChoice가 null 또는 미선택입니다. 화풍을 먼저 확정하세요.');
  if (requested && requested !== ledger.styleChoice) throw new Error('요청한 화풍이 presets.json.styleChoice와 다릅니다.');
  return IMAGE_STYLES[ledger.styleChoice];
}

export function imageGeometry({ width, height }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error('원본 치수가 유효하지 않습니다.');
  const adjustedWidth = Math.max(1, Math.round(height * 4 / 3));
  return { mode: width > adjustedWidth ? 'crop' : width < adjustedWidth ? 'pad' : 'resize',
    width: adjustedWidth, height, x: width > adjustedWidth ? Math.floor((width - adjustedWidth) / 2) : Math.round((adjustedWidth - width) / 2), y: 0 };
}

export function insetGeometry(dimensions, style, inset = 0) {
  if (typeof inset !== 'number' || !Number.isFinite(inset) || inset < 0 || inset >= 0.4) throw new Error('inset은 0 이상 0.4 미만의 숫자여야 합니다.');
  imageGeometry(dimensions);
  const scale = Math.min(style.width * (1 - 2 * inset) / dimensions.width, style.height * (1 - 2 * inset) / dimensions.height);
  const width = Math.max(1, Math.floor(dimensions.width * scale)), height = Math.max(1, Math.floor(dimensions.height * scale));
  return { width, height, x: Math.floor((style.width - width) / 2), y: Math.floor((style.height - height) / 2) };
}

export function conversionCommands({ tool, input, output, temp, dimensions, style, inset = 0 }) {
  const inner = insetGeometry(dimensions, style, inset);
  // 여백을 요청하면 기존 중앙 크롭 대신 원본 전체를 담는다. 원본은 임시 파일로만 처리한다.
  if (inset > 0) {
    const bg = style.background.slice(1), commands = [];
    if (tool === 'ffmpeg') {
      const filters = [`scale=${inner.width}:${inner.height}:flags=lanczos`, `pad=${style.width}:${style.height}:${inner.x}:${inner.y}:0x${bg}`];
      commands.push({ command: 'ffmpeg', args: ['-y','-i',input,'-vf',filters.join(','),'-c:v','libwebp','-quality','80','-compression_level','6','-preset','picture','-an','-frames:v','1',output] });
    } else if (tool === 'magick') {
      commands.push({ command: 'magick', args: [input,'-resize',`${inner.width}x${inner.height}!`,'-gravity','center','-background',style.background,'-extent',`${style.width}x${style.height}`,'-strip','-define','webp:method=6','-quality','80',output] });
    } else if (tool === 'sips' || tool === 'cwebp') {
      const processed = path.join(temp,'prepared.png');
      commands.push({ command:'sips', args:['-z',String(inner.height),String(inner.width),input,'--out',processed] });
      commands.push({ command:'sips', args:['-p',String(style.height),String(style.width),'--padColor',bg,processed,'--out',processed] });
      commands.push({ command:'cwebp', args:['-q','80','-m','6','-metadata','none',processed,'-o',output] });
    } else throw new Error('지원하지 않는 도구: ' + tool);
    return commands;
  }
  const g = imageGeometry(dimensions), size = `${style.width}:${style.height}`, bg = style.background.slice(1);
  const commands = [];
  if (tool === 'ffmpeg') {
    const filters = g.mode === 'crop' ? [`crop=${g.width}:${g.height}:${Math.floor((dimensions.width-g.width)/2)}:0`] : g.mode === 'pad' ? [`pad=${g.width}:${g.height}:${g.x}:0:0x${bg}`] : [];
    filters.push(`scale=${size}:flags=lanczos`);
    commands.push({ command: 'ffmpeg', args: ['-y','-i',input,'-vf',filters.join(','),'-c:v','libwebp','-quality','80','-compression_level','6','-preset','picture','-an','-frames:v','1',output] });
  } else if (tool === 'magick') {
    const args = [input,'-gravity','center'];
    if (g.mode === 'crop') args.push('-crop',`${g.width}x${g.height}+0+0`,'+repage');
    if (g.mode === 'pad') args.push('-background',style.background,'-extent',`${g.width}x${g.height}`);
    args.push('-resize',`${style.width}x${style.height}!`,'-strip','-define','webp:method=6','-quality','80',output);
    commands.push({ command: 'magick', args });
  } else if (tool === 'sips' || tool === 'cwebp') {
    let source = input;
    if (g.mode === 'pad' || tool === 'sips') {
      const processed = path.join(temp,'prepared.png');
      const args = g.mode === 'pad' ? ['-p',String(g.height),String(g.width),'--padColor',bg] : g.mode === 'crop' ? ['-c',String(g.height),String(g.width)] : [];
      commands.push({ command:'sips', args:[...args,input,'--out',processed] });
      commands.push({ command:'sips', args:['-z',String(style.height),String(style.width),processed,'--out',processed] });
      source = processed;
    }
    const args = ['-q','80','-m','6'];
    if (source === input) {
      if (g.mode === 'crop') args.push('-crop',String(Math.floor((dimensions.width-g.width)/2)),'0',String(g.width),String(g.height));
      args.push('-resize',String(style.width),String(style.height));
    }
    commands.push({ command:'cwebp', args:[...args,'-metadata','none',source,'-o',output] });
  } else throw new Error('지원하지 않는 도구: ' + tool);
  return commands;
}

export function shellQuote(value) { return "'" + String(value).replaceAll("'", "'\\''") + "'"; }
export function formatCommand({ command, args }) { return [command,...args].map(shellQuote).join(' '); }
function executable(name) {
  const names = name === 'magick' ? ['magick','convert'] : [name];
  for (const candidate of names) for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    const full = path.join(directory,candidate);
    try { fs.accessSync(full,fs.constants.X_OK); if (fs.statSync(full).isFile()) return full; } catch {}
  }
  const error = new Error('설치된 변환 도구가 없습니다: ' + name + '. macOS에서는 brew install webp (cwebp) 또는 선택한 ffmpeg/ImageMagick을 설치하세요.');
  error.exitCode = 2; throw error;
}
function safeRegular(file) { if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error('일반 파일만 허용합니다: ' + file); }
function outputFor(root, item) {
  const folder = item.kind === 'symbol' ? 'symbols' : item.kind === 'landmark' ? 'places' : null;
  if (!folder || !/^[a-z]{2}$/.test(item.code) || item.id !== item.code + '-' + item.kind) throw new Error('원장 항목 형식 오류: ' + item.id);
  const expected = `images/${folder}/${item.code}`;
  if (item.outputStem !== expected) throw new Error('원장 출력 경로 오류: ' + item.id);
  for (const rel of ['images',`images/${folder}`]) {
    const p = path.join(root,rel);
    if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) throw new Error('출력 폴더 심볼릭 링크를 허용하지 않습니다: ' + p);
  }
  return path.join(root,expected+'.webp');
}

export function prepareImages({ root = projectRoot, inputDir = 'docs/artifacts/images/raw', tool = 'cwebp', style: requested, only, inset = 0, dryRun = false, log = console.log, run = execFileSync, resolveTool = executable } = {}) {
  insetGeometry({width:4,height:3}, IMAGE_STYLES.b, inset);
  const inputRoot = path.resolve(root,inputDir), packPath = path.join(root,'docs/image-prompts/presets.json');
  const files = fs.existsSync(inputRoot) ? fs.readdirSync(inputRoot).filter(f=>f.endsWith('.png')) : [];
  if (!fs.existsSync(packPath) && !files.length) { log('원장·원본 이미지 없음: 변환 0건'); return []; }
  const pack = JSON.parse(fs.readFileSync(packPath,'utf8')), style = imageStyle(pack,requested);
  if (!Array.isArray(pack.items)) throw new Error('원장 items 배열이 없습니다.');
  const seen = new Set();
  const jobs = [];
  for (const item of pack.items) {
    if (seen.has(item.id)) throw new Error('원장 id 중복: ' + item.id); seen.add(item.id);
    if (only && item.id !== only) continue;
    const output = outputFor(root,item);
    const raw = files.filter(f=>new RegExp('^'+item.id+'-[0-9]{2}\\.png$').test(f)).sort().at(-1);
    if (!raw) continue;
    const input = path.join(inputRoot,raw); safeRegular(input);
    jobs.push({ item,input,output,dimensions:readPngDimensions(fs.readFileSync(input)) });
  }
  if (only && !seen.has(only)) throw new Error('원장에 없는 id: ' + only);
  if (only && !jobs.length) throw new Error('원본 PNG가 없습니다: ' + only);
  const reports = [];
  for (const job of jobs) {
    const targetDir = path.dirname(job.output);
    const plannedTemp = path.join(targetDir,'.prepare-'+job.item.id);
    const planned = conversionCommands({tool,input:job.input,output:path.join(plannedTemp,'output.webp'),temp:plannedTemp,dimensions:job.dimensions,style,inset});
    if (dryRun) {
      log('# '+job.item.id+' '+(inset > 0 ? 'contain inset='+inset : imageGeometry(job.dimensions).mode));
      log(formatCommand({command:'mkdir',args:['-p',plannedTemp]}));
      planned.forEach(c=>log(formatCommand(c)));
      log('# 실제 실행은 치수·용량 검증 후 최종 경로로 원자적 교체: '+job.output);
      log('# 검증을 포함한 실행: '+formatCommand({command:process.execPath,args:[fileURLToPath(import.meta.url),'--root',root,'--tool',tool,'--in',inputDir,'--only',job.item.id,'--inset',String(inset)]}));
      reports.push({id:job.item.id,output:job.output,inset,commands:planned}); continue;
    }
    const tools = new Map(planned.map(c=>[c.command,resolveTool(c.command)]));
    fs.mkdirSync(targetDir,{recursive:true});
    const temp = fs.mkdtempSync(path.join(targetDir,'.prepare-'));
    try {
      const staging = path.join(temp,'output.webp');
      const commands = conversionCommands({tool,input:job.input,output:staging,temp,dimensions:job.dimensions,style,inset});
      for (const command of commands) run(tools.get(command.command),command.args,{stdio:'pipe',maxBuffer:8*1024*1024});
      safeRegular(staging); const bytes = fs.readFileSync(staging), dimensions = readWebpDimensions(bytes);
      if (dimensions.width !== style.width || dimensions.height !== style.height) throw new Error('변환 치수 불일치: '+job.item.id);
      if (bytes.length > style.maxBytes) throw new Error('변환 용량 상한 초과: '+job.item.id+' '+bytes.length);
      fs.renameSync(staging,job.output);
      const report = {id:job.item.id,output:path.relative(root,job.output),bytes:bytes.length,warning:bytes.length>style.warnBytes,inset};
      reports.push(report); log(JSON.stringify(report));
    } finally { fs.rmSync(temp,{recursive:true,force:true}); }
  }
  if (!jobs.length) log('변환할 원본 PNG 없음: 0건');
  return reports;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    for (let i=2;i<process.argv.length;i++) {
      const arg=process.argv[i];
      if (arg==='--dry-run') options.dryRun=true;
      else if (['--tool','--style','--in','--only','--root','--inset'].includes(arg)) {
        const value=process.argv[++i]; if (!value || value.startsWith('--')) throw new Error('인자 값이 없습니다: '+arg);
        options[{'--in':'inputDir','--only':'only','--tool':'tool','--style':'style','--root':'root','--inset':'inset'}[arg]]=arg === '--inset' ? (value.trim() ? Number(value) : NaN) : value;
      } else throw new Error('알 수 없는 인자: '+arg);
    }
    prepareImages(options);
  } catch(error) { console.error(error.message); process.exitCode=error.exitCode || 1; }
}
