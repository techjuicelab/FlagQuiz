/* 마이크 표본을 연속 16kHz mono PCM16으로 바꾼다. 오디오는 메모리에만 둔다. */
class FlagQuizPCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capturing = false;
    this.generation = 0;
    this.port.onmessage = event => {
      const command = event.data || {};
      if (command.type === 'start' && Number.isSafeInteger(command.generation)) {
        this.generation = command.generation;
        this.capturing = true;
        this.inputIndex = -1; this.outputAt = 0; this.previous = 0;
        this.frame = new Int16Array(1600); this.used = 0; this.sequence = 0;
        this.pending = new Set();
      } else if (command.generation === this.generation) {
        if (command.type === 'stop') this.capturing = false;
        if (command.type === 'ack' && this.pending) this.pending.delete(command.sequence);
      }
    };
  }

  append(sample) {
    if (!Number.isFinite(sample)) sample = 0;
    sample = Math.max(-1, Math.min(1, sample));
    this.frame[this.used++] = Math.round(sample * (sample < 0 ? 32768 : 32767));
    if (this.used !== 1600) return;
    // ACK가 밀리면 MessagePort 큐도 제한한다. 전송된 ArrayBuffer는 복사하지 않는다.
    if ((this.pending.size + 1) * 3200 > 65536) {
      this.capturing = false;
      this.port.postMessage({ type: 'overflow', generation: this.generation });
      return;
    }
    const pcm = this.frame.buffer, sequence = this.sequence++;
    this.pending.add(sequence);
    this.port.postMessage({ type: 'audio', generation: this.generation, sequence, pcm }, [pcm]);
    this.frame = new Int16Array(1600); this.used = 0;
  }

  process(inputs, outputs) {
    // 연결을 유지하되 마이크 소리가 destination으로 재생되지 않게 한다.
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const channels = inputs[0];
    if (!this.capturing || !channels || !channels.length || !channels[0]) return true;
    const step = sampleRate / 16000;
    for (let index = 0; index < channels[0].length && this.capturing; index++) {
      let sample = 0;
      for (const channel of channels) sample += channel[index] || 0;
      sample /= channels.length;
      this.inputIndex++;
      // 보간 위치를 처리 블록 사이에도 보관해 44.1kHz의 경계 표본을 잃지 않는다.
      while (this.outputAt <= this.inputIndex && this.capturing) {
        const fraction = this.inputIndex === 0 ? 1 : this.outputAt - (this.inputIndex - 1);
        this.append(this.previous * (1 - fraction) + sample * fraction);
        this.outputAt += step;
      }
      this.previous = sample;
    }
    return true;
  }
}

registerProcessor('flagquiz-pcm', FlagQuizPCMProcessor);
