import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {checkArtSet} from '../scripts/lib/art-gate.mjs';

test('공개 전에도 고아·다른 확장자는 거부하고 전량 공개 때 누락을 거부한다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fq-art-gate-'));
  const subjects = {ae: {symbol: {}}, kr: {symbol: {}, place: {}}};
  const run = (required = false) => checkArtSet(root, subjects, ['ae', 'kr'], required);
  const write = file => fs.writeFileSync(path.join(root, 'images', file), '');
  try {
    for (const dir of ['symbols', 'places']) fs.mkdirSync(path.join(root, 'images', dir), {recursive: true});
    assert.equal(run().errors.length, 0);
    assert.equal(run(true).errors.length, 3);
    for (const invalid of ['symbols/zz.webp', 'symbols/kr.png', 'places/ae.webp']) {
      write(invalid); assert.ok(run().errors.length); fs.unlinkSync(path.join(root, 'images', invalid));
    }
    write('symbols/ae.webp'); assert.equal(run().errors.length, 0);
    write('symbols/kr.webp'); write('places/kr.webp');
    assert.equal(run(true).errors.length, 0);
    fs.mkdirSync(path.join(root, 'images', 'flags'));
    assert.ok(run().errors.some(x => x.includes('flags')));
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
