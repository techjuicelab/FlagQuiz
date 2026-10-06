import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const path = new URL('../js/speech-pcm-worklet.js', import.meta.url);
const source = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
function fixture(rate = 48000) {
  let Processor;
  const messages = [];
  class Base { constructor() { this.port = { postMessage: value => messages.push(value) }; } }
  vm.runInNewContext(source, { AudioWorkletProcessor: Base, sampleRate: rate,
    registerProcessor(name, value) { assert.equal(name, 'flagquiz-pcm'); Processor = value; } });
  assert.ok(Processor, '실시간 PCM AudioWorklet이 등록되어야 한다');
  const processor = new Processor();
  const command = value => processor.port.onmessage({ data: value });
  function feed(values, widths = [128], stereo = false) {
    let offset = 0, block = 0;
    while (offset < values.length) {
      const size = Math.min(widths[block++ % widths.length], values.length - offset);
      const input = values.slice(offset, offset + size);
      const channels = stereo ? [input, Float32Array.from(input, value => -value)] : [input];
      const output = new Float32Array(size).fill(1);
      assert.equal(processor.process([channels], [[output]]), true);
      assert.ok(output.every(value => value === 0), '마이크 소리가 스피커로 나오지 않는다');
      offset += size;
    }
  }
  return { processor, command, feed, messages, audio: () => messages.filter(value => value.type === 'audio') };
}

test('48kHz·44.1kHz를 블록 경계와 무관하게 16kHz PCM16 100ms 프레임으로 만든다', () => {
  for (const rate of [48000, 44100]) {
    const samples = Float32Array.from({ length: rate }, (_, i) => Math.sin(i / rate * Math.PI * 2 * 440) * 0.2);
    const a = fixture(rate), b = fixture(rate);
    for (const f of [a, b]) f.command({ type: 'start', generation: 3 });
    a.feed(samples); b.feed(samples, [63, 257, 100, 17]);
    assert.equal(a.audio().length, 10);
    assert.equal(b.audio().length, 10);
    for (let i = 0; i < 10; i++) {
      assert.equal(a.audio()[i].pcm.byteLength, 3200);
      assert.equal(a.audio()[i].generation, 3);
      assert.equal(a.audio()[i].sequence, i);
      assert.deepEqual(Buffer.from(a.audio()[i].pcm), Buffer.from(b.audio()[i].pcm));
    }
    assert.ok(new Int16Array(a.audio()[0].pcm).some(value => value !== 0));
  }
});

test('채널을 mono로 섞고 PCM 범위를 제한하며 start 전과 stop 후에는 전송하지 않는다', () => {
  const f = fixture(16000);
  f.feed(new Float32Array(1600).fill(0.5)); assert.equal(f.audio().length, 0);
  f.command({ type: 'start', generation: 1 });
  f.feed(new Float32Array(1600).fill(0.5), [128], true);
  assert.ok(new Int16Array(f.audio()[0].pcm).every(value => value === 0));
  f.feed(Float32Array.from({ length: 1600 }, (_, i) => i < 800 ? -2 : 2));
  const pcm = new Int16Array(f.audio()[1].pcm);
  assert.equal(pcm[0], -32768); assert.equal(pcm[1599], 32767);
  f.command({ type: 'stop', generation: 1 });
  f.feed(new Float32Array(1600).fill(0.5)); assert.equal(f.audio().length, 2);
});

test('메인 스레드 미수신 PCM은 64KiB 안에 제한하고 ACK와 세대가 다르면 재활용하지 않는다', () => {
  const f = fixture(16000);
  f.command({ type: 'start', generation: 5 });
  f.feed(new Float32Array(1600 * 25).fill(0.2));
  assert.equal(f.audio().length, 20);
  assert.equal(f.messages.filter(value => value.type === 'overflow').length, 1);
  f.command({ type: 'start', generation: 6 });
  for (let i = 0; i < 30; i++) {
    f.feed(new Float32Array(1600).fill(0.1));
    f.command({ type: 'ack', generation: 5, sequence: i });
    f.command({ type: 'ack', generation: 6, sequence: i });
  }
  assert.equal(f.audio().length, 50);
  assert.equal(f.messages.filter(value => value.type === 'overflow').length, 1);
});
