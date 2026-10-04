/* 차례가 정해진 놀이용 클라우드 음성 인식. 녹음·변환은 메모리에서만 한다. */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var MAX_MS = 12000;
  var MAX_BYTES = 2 * 1024 * 1024;
  var RATE = 16000;

  function supported() {
    var host = global.location && global.location.hostname;
    var secure = global.isSecureContext || host === 'localhost' || host === '127.0.0.1';
    return !!(secure && global.navigator && global.navigator.mediaDevices && global.navigator.mediaDevices.getUserMedia &&
      global.MediaRecorder && (global.AudioContext || global.webkitAudioContext) && global.fetch && global.Blob && global.AbortController);
  }

  function mime() {
    var types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
    if (!global.MediaRecorder.isTypeSupported) return '';
    for (var i = 0; i < types.length; i++) if (global.MediaRecorder.isTypeSupported(types[i])) return types[i];
    return '';
  }

  function wav(decoded) {
    var duration = Math.min(MAX_MS / 1000, decoded.length / decoded.sampleRate);
    var count = Math.floor(duration * RATE);
    if (count < RATE / 10) throw { code: 'no-speech' };
    var buffer = new ArrayBuffer(44 + count * 2);
    var view = new DataView(buffer);
    function word(at, value) { for (var i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); }
    word(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); word(8, 'WAVE'); word(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, RATE, true); view.setUint32(28, RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    word(36, 'data'); view.setUint32(40, count * 2, true);
    var channels = [];
    for (var ch = 0; ch < decoded.numberOfChannels; ch++) channels.push(decoded.getChannelData(ch));
    if (!channels.length) throw { code: 'no-speech' };
    // 선형 보간으로 16kHz 단일 채널을 만든다. 파일의 표본 수가 서버의 시간 상한이다.
    for (var n = 0; n < count; n++) {
      var position = n * decoded.sampleRate / RATE;
      var a = Math.floor(position), b = Math.min(a + 1, decoded.length - 1), fraction = position - a, sample = 0;
      for (var c = 0; c < channels.length; c++) sample += channels[c][a] * (1 - fraction) + channels[c][b] * fraction;
      sample = Math.max(-1, Math.min(1, sample / channels.length));
      view.setInt16(44 + n * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
    return { blob: new global.Blob([buffer], { type: 'audio/wav' }), durationMs: Math.round(count / RATE * 1000) };
  }

  function decode(context, bytes) {
    return new Promise(function (resolve, reject) {
      try {
        var promise = context.decodeAudioData(bytes, resolve, reject);
        if (promise && promise.then) promise.then(resolve, reject);
      } catch (error) { reject(error); }
    });
  }

  function create(options) {
    var opts = options || {};
    var current = null;

    function live(session) { return current === session && !session.cancelled; }
    function emit(session, callback, value) {
      if (live(session) && typeof session.handlers[callback] === 'function') session.handlers[callback](value);
    }
    function state(session, phase) {
      session.phase = phase;
      emit(session, 'onState', { state: phase, playerId: session.playerId, turnId: session.turnId });
    }
    function clearTimers(session) {
      ['permissionTimer', 'recordTimer', 'levelTimer', 'stopTimer', 'processingTimer', 'networkTimer'].forEach(function (key) {
        if (session[key]) global.clearTimeout(session[key]);
        session[key] = null;
      });
    }
    function stopTracks(stream) {
      if (stream && stream.getTracks) stream.getTracks().forEach(function (track) { track.stop(); });
    }
    function release(session) {
      clearTimers(session);
      if (session.recorder) {
        session.recorder.ondataavailable = null; session.recorder.onstop = null; session.recorder.onerror = null;
        if (session.recorder.state !== 'inactive') { try { session.recorder.stop(); } catch (error) {} }
      }
      stopTracks(session.stream);
      if (session.source) { try { session.source.disconnect(); } catch (error) {} }
      if (session.audio) { try { var closed = session.audio.close(); if (closed && closed.catch) closed.catch(function () {}); } catch (error) {} }
      if (session.request) session.request.abort();
      session.chunks = [];
    }
    function error(session, code, message) {
      if (!live(session)) return;
      release(session);
      state(session, 'idle');
      emit(session, 'onError', { code: code, message: message, playerId: session.playerId, turnId: session.turnId });
      if (current === session) current = null;
    }
    function cancel() {
      var session = current;
      if (!session) return;
      current = null; session.cancelled = true; release(session);
    }

    async function upload(session) {
      if (!live(session)) return;
      clearTimers(session); stopTracks(session.stream);
      state(session, 'transcribing');
      if (!live(session)) return;
      session.processingTimer = global.setTimeout(function () {
        error(session, 'processing', '녹음을 준비하는 데 시간이 오래 걸려요. 지금 차례는 글자로 답해 주세요.');
      }, 10000);
      try {
        var recording = new global.Blob(session.chunks, { type: session.recorder.mimeType || session.mime });
        session.chunks = [];
        if (!recording.size) throw { code: 'no-speech' };
        var bytes = await recording.arrayBuffer();
        if (!live(session)) return;
        var decoded = await decode(session.audio, bytes);
        if (!live(session)) return;
        var input = wav(decoded);
        global.clearTimeout(session.processingTimer); session.processingTimer = null;
        var endpoint = new global.URL(opts.endpoint || '/api/speech', global.location.href);
        if (endpoint.origin !== global.location.origin) throw { code: 'configuration' };
        var token = typeof opts.csrfToken === 'function' ? opts.csrfToken() : opts.csrfToken;
        if (typeof token !== 'string' || !token) throw { code: 'auth-required' };
        session.request = new global.AbortController();
        session.networkTimer = global.setTimeout(function () {
          session.timedOut = true; session.request.abort();
          error(session, 'timeout', '목소리를 확인하는 데 시간이 오래 걸려요. 지금 차례는 글자로 답해 주세요.');
        }, 25000);
        var response = await global.fetch(endpoint.href, {
          method: 'POST', credentials: 'same-origin', signal: session.request.signal,
          headers: { 'Content-Type': 'audio/wav', 'X-Audio-Duration-Ms': String(input.durationMs),
            'X-Player-Id': session.playerId, 'X-Turn-Id': session.turnId, 'X-CSRF-Token': token }, body: input.blob
        });
        if (!live(session)) return;
        var result = await response.json();
        if (!live(session)) return;
        if (!response.ok) {
          var safeCode = response.status === 401 || response.status === 403 ? 'auth-required' : response.status === 429 ? 'quota' : 'service';
          error(session, safeCode, safeCode === 'auth-required' ? '로그인을 확인해 주세요. 지금 차례는 글자로 답할 수 있어요.' :
            safeCode === 'quota' ? '오늘의 말하기 사용량을 다 썼어요. 지금 차례는 글자로 답해 주세요.' : '말하기 연결이 어려워요. 지금 차례는 글자로 답해 주세요.');
          return;
        }
        if (!result || typeof result.text !== 'string' || result.text.length > 500) throw { code: 'service' };
        var text = result.text.trim();
        if (!text) { error(session, 'no-speech', '목소리가 들리지 않았어요. 다시 말하거나 글자로 답해 주세요.'); return; }
        release(session); state(session, 'idle');
        emit(session, 'onResult', { text: text, playerId: session.playerId, turnId: session.turnId });
        if (current === session) current = null;
      } catch (failure) {
        if (!live(session)) return;
        var code = failure && failure.code;
        error(session, code || 'network', code === 'auth-required' ? '로그인을 확인해 주세요. 지금 차례는 글자로 답할 수 있어요.' :
          code === 'no-speech' ? '목소리가 들리지 않았어요. 다시 말하거나 글자로 답해 주세요.' : '말하기 연결이 어려워요. 지금 차례는 글자로 답해 주세요.');
      }
    }

    function stop() {
      var session = current;
      if (!session || session.phase !== 'recording') return false;
      state(session, 'finishing');
      clearTimers(session);
      session.stopTimer = global.setTimeout(function () { error(session, 'recording', '녹음을 마치지 못했어요. 지금 차례는 글자로 답해 주세요.'); }, 2000);
      try { session.recorder.stop(); stopTracks(session.stream); }
      catch (failure) { error(session, 'recording', '녹음을 마치지 못했어요. 지금 차례는 글자로 답해 주세요.'); }
      return true;
    }

    function levels(session) {
      if (!live(session) || session.phase !== 'recording') return;
      var samples = new Float32Array(session.analyser.fftSize);
      session.analyser.getFloatTimeDomainData(samples);
      var sum = 0;
      for (var i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      var now = Date.now();
      if (Math.sqrt(sum / samples.length) > 0.012) { session.heard = true; session.lastLoud = now; }
      if (session.heard && now - session.lastLoud >= 1200) { stop(); return; }
      if (!session.heard && now - session.started >= 5000) {
        error(session, 'no-speech', '목소리가 들리지 않았어요. 다시 말하거나 글자로 답해 주세요.'); return;
      }
      session.levelTimer = global.setTimeout(function () { levels(session); }, 100);
    }

    async function start(handlers) {
      cancel();
      var h = handlers || {};
      var session = { handlers: h, playerId: String(h.playerId), turnId: String(h.turnId), phase: 'requesting', chunks: [], cancelled: false };
      current = session;
      if (!supported() || ![session.playerId, session.turnId].every(function (id) { return /^[a-zA-Z0-9_-]{1,80}$/.test(id) && id !== 'undefined'; })) {
        error(session, 'unsupported', '이 기기에서는 클라우드 말하기를 쓸 수 없어요. 지금 차례는 글자로 답해 주세요.'); return;
      }
      state(session, 'requesting');
      if (!live(session)) return;
      session.permissionTimer = global.setTimeout(function () { error(session, 'permission', '마이크 허용을 확인해 주세요. 지금 차례는 글자로 답할 수 있어요.'); }, 20000);
      try {
        var Audio = global.AudioContext || global.webkitAudioContext;
        session.audio = new Audio();
        if (session.audio.resume) await session.audio.resume();
        if (!live(session)) return;
        var stream = await global.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }, video: false });
        if (!live(session)) { stopTracks(stream); return; }
        global.clearTimeout(session.permissionTimer); session.permissionTimer = null;
        session.stream = stream; session.mime = mime();
        session.recorder = new global.MediaRecorder(stream, session.mime ? { mimeType: session.mime, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 });
        session.source = session.audio.createMediaStreamSource(stream); session.analyser = session.audio.createAnalyser();
        session.analyser.fftSize = 1024; session.source.connect(session.analyser);
        session.recorder.ondataavailable = function (event) {
          if (!live(session) || !event.data || !event.data.size) return;
          session.bytes = (session.bytes || 0) + event.data.size;
          if (session.bytes > MAX_BYTES) { error(session, 'size', '녹음이 너무 커요. 나라 이름을 짧게 말해 주세요.'); return; }
          session.chunks.push(event.data);
        };
        session.recorder.onstop = function () { if (live(session)) upload(session); };
        session.recorder.onerror = function () { error(session, 'recording', '녹음이 어려워요. 지금 차례는 글자로 답해 주세요.'); };
        session.recorder.start(250); session.started = Date.now();
        state(session, 'recording');
        if (!live(session)) return;
        session.recordTimer = global.setTimeout(function () { if (live(session)) stop(); }, MAX_MS);
        levels(session);
      } catch (failure) {
        error(session, 'permission', '마이크를 열지 못했어요. 허용을 확인하거나 지금 차례는 글자로 답해 주세요.');
      }
    }

    return { supported: supported, start: start, stop: stop, cancel: cancel, isRecording: function () { return !!(current && current.phase === 'recording'); } };
  }

  FQ.cloudSpeech = { create: create, supported: supported, MAX_DURATION_MS: MAX_MS };
})(window);
