import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

test('기준 앵커는 원장의 화풍·경로·해시와 일치하는 PNG 한 장이다', () => {
  const root=new URL('../',import.meta.url),pack=JSON.parse(fs.readFileSync(new URL('docs/image-prompts/presets.json',root)));
  assert.ok(pack.anchor,'선택한 B 제작 기준을 저장소에 보존한다');
  const anchor=pack.anchor;
  assert.equal(anchor.style,pack.styleChoice);
  assert.equal(anchor.file,'docs/image-prompts/anchor/'+anchor.style+'-kr-landmark.png');
  const directory=new URL('docs/image-prompts/anchor/',root);
  assert.deepEqual(fs.readdirSync(directory).filter(f=>f.endsWith('.png')),[path.basename(anchor.file)]);
  const png=fs.readFileSync(new URL(anchor.file,root));
  assert.ok(png.length<1_000_000);
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  assert.ok(width>0&&width<=1024);assert.equal(width/height,4/3);
  assert.equal(createHash('sha256').update(png).digest('hex'),anchor.sha256);
  assert.ok(Number.isInteger(anchor.tries)&&anchor.tries>0);
  assert.ok(fs.existsSync(new URL(anchor.review,root)));
});
