/* 같은 출처의 인증 프록시로 보내는 실시간 음성 인식. 키와 오디오는 저장하지 않는다. */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var FRAME_BYTES = 3200, MAX_BUFFER = 65536, MAX_SAMPLES = 16000 * 12;
  var HANDSHAKE_MS = 20000, FINAL_MS = 25000;

  function validMode(mode) { return mode === 'voice' || mode === 'capitalVoice' || mode === 'country-chain'; }
  function supported() {
    var host = global.location && global.location.hostname;
    var Audio = global.AudioContext || global.webkitAudioContext;
    return !!((global.isSecureContext || host === 'localhost' || host === '127.0.0.1') &&
      global.navigator && global.navigator.mediaDevices && global.navigator.mediaDevices.getUserMedia &&
      Audio && Audio.prototype && 'audioWorklet' in Audio.prototype && global.AudioWorkletNode && global.WebSocket && global.URL);
  }
  function deferred() {
    var resolve;
    var promise = new Promise(function (done) { resolve = done; });
    return { promise: promise, resolve: resolve };
  }
  function sameOriginUrl(value, path, websocket) {
    var url = new global.URL(value || path, global.location.href);
    if (websocket) {
      if (url.protocol === 'ws:') url.protocol = 'http:';
      else if (url.protocol === 'wss:') url.protocol = 'https:';
    }
    if (url.origin !== global.location.origin || (url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || url.hash) throw new Error('origin');
    if (websocket) url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.href;
  }

  function create(options) {
    var opts = options || {}, current = null, heldMicrophone = null, generation = 0;
    function live(session) { return current === session && !session.cancelled; }
    function emit(session, name, value) { if (live(session) && typeof session.handlers[name] === 'function') session.handlers[name](value); }
    function state(session, phase) {
      session.phase = phase;
      emit(session, 'onState', { state: phase, playerId: session.playerId, turnId: session.turnId, mode: session.mode });
    }
    function matches(session, value, required) {
      return ['playerId', 'turnId', 'mode'].every(function (key) {
        return value[key] === undefined ? !required : String(value[key]) === session[key];
      });
    }
    function enableTracks(stream, enabled) { if (stream && stream.getTracks) stream.getTracks().forEach(function (track) { track.enabled = enabled; }); }
    function stopTracks(stream) { if (stream && stream.getTracks) stream.getTracks().forEach(function (track) { if (track.readyState !== 'ended') track.stop(); }); }
    function closeAudio(audio) { if (audio && audio.state !== 'closed') { try { var pending = audio.close(); if (pending && pending.catch) pending.catch(function () {}); } catch (failure) {} } }
    function usable(microphone) {
      return microphone && !microphone.closed && microphone.audio.state !== 'closed' && microphone.stream.getTracks().length > 0 &&
        microphone.stream.getTracks().every(function (track) { return track.readyState !== 'ended'; });
    }
    function closeMicrophone(microphone) {
      if (!microphone || microphone.closed) return;
      microphone.closed = true;
      (microphone.endedHandlers || []).forEach(function (entry) {
        if (entry.track.removeEventListener) entry.track.removeEventListener('ended', entry.fn);
        else if (entry.track.onended === entry.fn) entry.track.onended = null;
      });
      microphone.node.port.onmessage = null;
      try { microphone.node.port.postMessage({ type: 'stop', generation: microphone.generation }); } catch (failure) {}
      stopTracks(microphone.stream);
      [microphone.source, microphone.node, microphone.gain].forEach(function (node) { try { node.disconnect(); } catch (failure) {} });
      closeAudio(microphone.audio);
    }
    function watch(microphone) {
      microphone.endedHandlers = microphone.stream.getTracks().map(function (track) {
        function ended() {
          if (microphone.closed) return;
          if (current && current.microphone === microphone) fail(current, 'recording', '마이크 연결이 끊겼어요. 다시 누르거나 글자로 답해 주세요.');
          else if (heldMicrophone === microphone) { heldMicrophone = null; closeMicrophone(microphone); }
        }
        if (track.addEventListener) track.addEventListener('ended', ended); else track.onended = ended;
        return { track: track, fn: ended };
      });
    }
    function mute(session) {
      if (session.microphone) {
        enableTracks(session.microphone.stream, false);
        try { session.microphone.node.port.postMessage({ type: 'stop', generation: session.generation }); } catch (failure) {}
      }
      session.preRoll = []; session.voiceBins = 0; session.quietBins = 0; session.vadFrame = 0; session.candidateFrame = null;
    }
    function release(session, keepMicrophone) {
      // result 콜백에서 cancel이 동기 재진입해도 다음 차례에 보관한 마이크는 한 번만 해제한다.
      if (session.released) return;
      session.released = true;
      ['permissionTimer', 'handshakeTimer', 'resumeTimer', 'workletTimer', 'beepTimer', 'finalTimer'].forEach(function (key) { global.clearTimeout(session[key]); session[key] = null; });
      if (session.beepDone) session.beepDone();
      session.ready.resolve(false); session.cancelSignal.resolve(false);
      mute(session);
      if (session.socket) {
        session.socket.onopen = null; session.socket.onmessage = null; session.socket.onerror = null; session.socket.onclose = null;
        try { session.socket.close(); } catch (failure) {}
      }
      if (session.microphone) {
        session.microphone.node.port.onmessage = null;
        if (keepMicrophone && usable(session.microphone)) {
          if (heldMicrophone && heldMicrophone !== session.microphone) closeMicrophone(heldMicrophone);
          heldMicrophone = session.microphone;
        } else closeMicrophone(session.microphone);
        session.microphone = null;
      } else closeAudio(session.audio);
      // addModule이 미완료여도 getUserMedia가 반환한 마이크를 소유하고 즉시 닫는다.
      stopTracks(session.pendingStream); session.pendingStream = null;
    }
    function fail(session, code, message, statusCode) {
      if (!live(session)) return;
      release(session, false);
      if (heldMicrophone) { closeMicrophone(heldMicrophone); heldMicrophone = null; }
      state(session, 'idle');
      var response = { code: code, message: message, playerId: session.playerId, turnId: session.turnId, mode: session.mode };
      if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599) response.status = statusCode;
      emit(session, 'onError', response);
      if (current === session) current = null;
    }
    function cancel(config) {
      var keep = config && config.keepMicrophone === true, session = current;
      if (session) { current = null; session.cancelled = true; release(session, keep); }
      if (!keep && heldMicrophone) { closeMicrophone(heldMicrophone); heldMicrophone = null; }
    }
    function networkFailure(session) { fail(session, 'network', '음성 연결이 끊겼어요. 다시 누르거나 글자로 답해 주세요.'); }
    function finalWait(session) {
      if (!live(session)) return;
      mute(session);
      if (!session.finalTimer) session.finalTimer = global.setTimeout(function () { networkFailure(session); }, FINAL_MS);
      state(session, 'finishing');
    }
    function finish(session) {
      if (!live(session) || session.phase !== 'recording') return false;
      finalWait(session);
      if (!live(session)) return true;
      try { session.socket.send(JSON.stringify({ type: 'finish' })); } catch (failure) { networkFailure(session); }
      return true;
    }
    function serverError(session, message) {
      var code = typeof message.code === 'string' ? message.code : 'service';
      if (code === 'daily-speech-limit' || code === 'monthly-speech-limit') code = 'quota';
      else if (code === 'speech-busy' || code === 'rate-limit') code = 'busy';
      else if (message.status === 401 || message.status === 403 || ['auth-required', 'invalid-csrf', 'login-required', 'request-not-allowed', 'authentication'].indexOf(code) >= 0) code = 'auth-required';
      else if (code === 'timeout') code = 'network';
      else if (['permission', 'no-speech', 'network', 'recording', 'service', 'quota', 'busy', 'configuration', 'unsupported'].indexOf(code) < 0) code = 'service';
      var copy = {
        quota: '음성 사용량을 모두 썼어요. 글자로 계속 풀 수 있어요.',
        busy: '음성 연결이 붐비고 있어요. 잠시 뒤 다시 눌러 주세요.',
        'auth-required': '다시 로그인하고 말하기를 눌러 주세요.',
        'no-speech': '목소리가 들리지 않았어요. 다시 말하거나 글자로 답해 주세요.',
        network: '음성을 확인하는 데 시간이 오래 걸려요. 다시 누르거나 글자로 답해 주세요.',
        recording: '마이크 음성을 읽지 못했어요. 다시 누르거나 글자로 답해 주세요.'
      };
      var text = typeof message.message === 'string' && message.message.trim() && message.message.length <= 500 ? message.message : copy[code] || '음성을 확인하지 못했어요. 다시 누르거나 글자로 답해 주세요.';
      fail(session, code, text, message.status);
    }
    function listening(session, value) {
      if (session.phase !== 'recording' && session.phase !== 'finishing') return;
      if ((value.reason !== 'retry' && value.reason !== 'no-speech') || typeof value.resetAudio !== 'boolean' ||
          !Number.isSafeInteger(value.window) || value.window < 1) return;
      if (!value.resetAudio) {
        // 보통의 필러 endpoint는 같은 공급자 창이다. 음성·표본 상한을 그대로 유지한다.
        if (value.window !== session.window || session.phase !== 'recording') return;
        state(session, 'recording'); return;
      }
      // 새 무료 VAD 창만 표본 상한을 갱신한다. 중복·이전 창은 녹음을 되살리지 않는다.
      if (value.window <= session.window) return;
      if (!usable(session.microphone)) { fail(session, 'recording', '마이크 연결이 끊겼어요. 다시 누르거나 글자로 답해 주세요.'); return; }
      global.clearTimeout(session.finalTimer); session.finalTimer = null;
      session.window = value.window; session.samples = 0; session.sending = false;
      session.preRoll = []; session.voiceBins = 0; session.quietBins = 0; session.vadFrame = 0; session.candidateFrame = null;
      session.generation = ++generation; session.microphone.generation = session.generation;
      try {
        session.microphone.node.port.postMessage({ type: 'start', generation: session.generation });
        enableTracks(session.microphone.stream, true);
      } catch (failure) { fail(session, 'recording', '마이크를 다시 시작하지 못했어요. 다시 누르거나 글자로 답해 주세요.'); return; }
      state(session, 'recording');
    }
    function message(session, event) {
      if (!live(session)) return;
      var value;
      try {
        if (typeof event.data !== 'string' || event.data.length > 16384) throw new Error('message');
        value = JSON.parse(event.data);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('message');
      } catch (failure) { fail(session, 'service', '음성 응답을 확인하지 못했어요. 다시 눌러 주세요.'); return; }
      var required = value.type !== 'ready' && value.type !== 'error';
      if (!matches(session, value, required)) return;
      if (value.type === 'ready') {
        if (session.phase !== 'requesting') return;
        if (Number.isSafeInteger(value.window) && value.window > 0) session.window = value.window;
        global.clearTimeout(session.handshakeTimer); session.handshakeTimer = null; session.ready.resolve(true);
      } else if (value.type === 'error') serverError(session, value);
      else if (value.type === 'listening') listening(session, value);
      else if (value.type === 'finishing') {
        if (session.phase === 'recording') finalWait(session);
      } else if (value.type === 'partial' || value.type === 'result') {
        if (session.phase !== 'recording' && session.phase !== 'finishing') return;
        if (typeof value.text !== 'string' || value.text.length > 500 || !value.text.trim()) { fail(session, 'service', '음성 응답을 확인하지 못했어요. 다시 눌러 주세요.'); return; }
        var response = { text: value.text, playerId: session.playerId, turnId: session.turnId, mode: session.mode };
        if (value.type === 'partial') { if (session.phase === 'recording') emit(session, 'onPartial', response); return; }
        if (value.resolution && typeof value.resolution === 'object' && !Array.isArray(value.resolution)) response.resolution = value.resolution;
        release(session, session.continuous);
        state(session, 'idle');
        emit(session, 'onResult', response);
        if (current === session) current = null;
      }
    }
    async function prepareMicrophone(session, workletUrl) {
      session.preparingMicrophone = true;
      var audio = session.audio, stream, microphone;
      try {
        stream = await global.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
        global.clearTimeout(session.permissionTimer); session.permissionTimer = null;
        enableTracks(stream, false);
        if (!live(session)) { stopTracks(stream); closeAudio(audio); return false; }
        session.pendingStream = stream;
        if (!audio.audioWorklet || !audio.audioWorklet.addModule) throw { code: 'unsupported' };
        session.workletTimer = global.setTimeout(function () { fail(session, 'recording', '마이크를 준비하는 데 시간이 오래 걸려요. 다시 누르거나 글자로 답해 주세요.'); }, HANDSHAKE_MS);
        await audio.audioWorklet.addModule(workletUrl, { credentials: 'same-origin' });
        global.clearTimeout(session.workletTimer); session.workletTimer = null;
        if (!live(session)) { stopTracks(stream); closeAudio(audio); return false; }
        var source = audio.createMediaStreamSource(stream);
        var node = new global.AudioWorkletNode(audio, 'flagquiz-pcm', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
        var gain = audio.createGain(); gain.gain.value = 0;
        source.connect(node); node.connect(gain); gain.connect(audio.destination);
        microphone = { audio: audio, stream: stream, source: source, node: node, gain: gain, generation: session.generation };
        session.microphone = microphone; session.pendingStream = null; watch(microphone);
        return true;
      } catch (failure) {
        if (microphone) closeMicrophone(microphone); else { stopTracks(stream); closeAudio(audio); }
        throw failure;
      } finally {
        global.clearTimeout(session.workletTimer); session.workletTimer = null;
        session.preparingMicrophone = false;
      }
    }
    function beforeRecord(session) {
      return new Promise(function (resolve) {
        var completed = false;
        function done(success) {
          if (completed) return;
          completed = true;
          global.clearTimeout(session.beepTimer); session.beepTimer = null; session.beepDone = null;
          var cleanup = session.beepCleanup; session.beepCleanup = null;
          if (typeof cleanup === 'function') { try { cleanup(); } catch (failure) {} }
          resolve(success !== false);
        }
        session.beepDone = done;
        if (typeof opts.beforeRecord !== 'function') { done(); return; }
        // 실제 준비음의 500ms 제한보다 길게 기다리되, 완료 없는 준비음을 성공으로 간주하지 않는다.
        session.beepTimer = global.setTimeout(function () { done(false); }, 1000);
        try {
          var pending = opts.beforeRecord(done);
          if (typeof pending === 'function') { if (completed) pending(); else session.beepCleanup = pending; }
          else if (pending && pending.then) pending.then(done, function () { done(false); });
        } catch (failure) { done(false); }
      });
    }
    function sendPcm(session, pcm) {
      if (!live(session) || session.phase !== 'recording') return false;
      if (session.socket.readyState !== 1 || !Number.isFinite(session.socket.bufferedAmount) || session.socket.bufferedAmount + pcm.byteLength > MAX_BUFFER) { networkFailure(session); return false; }
      try { session.socket.send(pcm); } catch (failure) { networkFailure(session); return false; }
      session.samples += pcm.byteLength / 2;
      if (session.samples >= MAX_SAMPLES) { finish(session); return false; }
      return true;
    }
    function pcm(session, event) {
      var value = event.data || {}, microphone = session.microphone;
      if (!microphone || value.generation !== session.generation) return;
      if (value.type === 'audio') microphone.node.port.postMessage({ type: 'ack', generation: session.generation, sequence: value.sequence });
      if (!live(session) || session.phase !== 'recording') return;
      if (value.type === 'overflow') { networkFailure(session); return; }
      if (value.type !== 'audio') return;
      if (!value.pcm || value.pcm.byteLength !== FRAME_BYTES || Object.prototype.toString.call(value.pcm) !== '[object ArrayBuffer]') { fail(session, 'recording', '마이크 음성을 읽지 못했어요. 다시 눌러 주세요.'); return; }
      if (session.sending) { sendPcm(session, value.pcm); return; }
      // 80ms 공백 9개와 100ms 발화는 820ms에 걸칠 수 있어 후보 전체를 최대 1초 보관한다.
      session.preRoll.push(value.pcm); if (session.preRoll.length > 10) session.preRoll.shift();
      var samples = new Int16Array(value.pcm), frame = ++session.vadFrame, bufferFrames = 4;
      for (var offset = 0; offset < samples.length; offset += 160) {
        var energy = 0;
        for (var i = offset; i < offset + 160; i++) energy += samples[i] * samples[i];
        var loud = Math.sqrt(energy / 160) / 32768 >= 0.003;
        // 서버와 같은 100ms 발화·80ms 자음 공백 기준이다. 한 번의 40ms 클릭은 통과하지 않는다.
        if (loud) {
          if (session.voiceBins === 0) session.candidateFrame = frame;
          session.voiceBins++; session.quietBins = 0;
        } else if (++session.quietBins > 8) { session.voiceBins = 0; session.candidateFrame = null; }
        if (session.voiceBins >= 10) {
          session.sending = true; bufferFrames = Math.max(4, frame - session.candidateFrame + 1); break;
        }
      }
      if (session.sending) {
        var buffered = session.preRoll.slice(-bufferFrames); session.preRoll = [];
        for (var index = 0; index < buffered.length; index++) if (!sendPcm(session, buffered[index])) break;
      }
    }
    async function start(handlers) {
      cancel({ keepMicrophone: true });
      var h = handlers || {}, ready = deferred(), cancelSignal = deferred();
      var session = { handlers: h, ready: ready, cancelSignal: cancelSignal, generation: ++generation,
        playerId: String(h.playerId), turnId: String(h.turnId), mode: h.mode === undefined ? (opts.mode || 'country-chain') : h.mode,
        continuous: h.continuous === true, preRoll: [], voiceBins: 0, quietBins: 0, vadFrame: 0, candidateFrame: null, samples: 0, window: 1 };
      current = session;
      var endpoint, workletUrl, token;
      try {
        if (!validMode(session.mode) || h.playerId === undefined || h.playerId === null || h.turnId === undefined || h.turnId === null ||
          !/^[a-zA-Z0-9_-]{1,80}$/.test(session.playerId) || !/^[a-zA-Z0-9_-]{1,80}$/.test(session.turnId)) throw new Error('identity');
        endpoint = sameOriginUrl(opts.endpoint, '/api/speech/stream', true);
        workletUrl = sameOriginUrl(opts.workletUrl, '/js/speech-pcm-worklet.js', false);
        token = typeof opts.csrfToken === 'function' ? opts.csrfToken() : opts.csrfToken;
        if (typeof token !== 'string' || !token || token.length > 256) throw new Error('csrf');
      } catch (failure) { fail(session, 'configuration', '음성 연결 설정을 확인해 주세요.'); return false; }
      if (!supported()) { fail(session, 'unsupported', '이 브라우저에서는 실시간 음성을 쓸 수 없어요. 다른 브라우저나 글자 답을 사용해 주세요.'); return false; }
      state(session, 'requesting'); if (!live(session)) return false;
      try {
        var microphone = heldMicrophone;
        if (!usable(microphone)) { closeMicrophone(microphone); microphone = null; }
        heldMicrophone = null;
        if (microphone) { session.microphone = microphone; session.audio = microphone.audio; microphone.generation = session.generation; }
        else session.audio = new (global.AudioContext || global.webkitAudioContext)();
        // 사용자 입력 콜스택 안에서 resume을 호출한다. Safari의 미완료 promise도 수명을 제한한다.
        var resumed = Promise.resolve(session.audio.resume()).then(function () {
          global.clearTimeout(session.resumeTimer); session.resumeTimer = null;
          if (session.audio.state === 'suspended') throw new Error('suspended');
        });
        session.socket = new global.WebSocket(endpoint);
        session.socket.onopen = function () {
          if (!live(session)) return;
          try { session.socket.send(JSON.stringify({ type: 'start', csrfToken: token, playerId: session.playerId, turnId: session.turnId, mode: session.mode })); }
          catch (failure) { networkFailure(session); }
        };
        session.socket.onmessage = function (event) { message(session, event); };
        session.socket.onerror = session.socket.onclose = function () { networkFailure(session); };
        session.handshakeTimer = global.setTimeout(function () { networkFailure(session); }, HANDSHAKE_MS);
        if (!microphone) session.permissionTimer = global.setTimeout(function () { fail(session, 'permission', '마이크 허용을 확인하고 다시 눌러 주세요.'); }, HANDSHAKE_MS);
        session.resumeTimer = global.setTimeout(function () { fail(session, 'recording', '마이크를 시작하지 못했어요. 다시 눌러 주세요.'); }, HANDSHAKE_MS);
        var preparation = microphone ? Promise.resolve(true) : prepareMicrophone(session, workletUrl);
        var prepared = await Promise.race([Promise.all([preparation, ready.promise, resumed]).then(function (values) { return values[0] && values[1]; }), cancelSignal.promise]);
        if (!prepared || !live(session)) return false;
        global.clearTimeout(session.permissionTimer); session.permissionTimer = null;
        // 트랙은 음소거한 채 렌더 스레드를 먼저 준비한다. 비프 중 PCM은 ACK만 하고 버린다.
        session.microphone.node.port.onmessage = function (event) { pcm(session, event); };
        session.microphone.node.port.postMessage({ type: 'start', generation: session.generation });
        var cued = await beforeRecord(session); if (!live(session)) return false;
        if (!cued) { fail(session, 'recording', '준비음을 재생하지 못했어요. 소리를 허용한 뒤 다시 눌러 주세요.'); return false; }
        enableTracks(session.microphone.stream, true);
        state(session, 'recording');
        return live(session);
      } catch (failure) {
        if (live(session)) {
          var code = failure && (failure.name === 'NotAllowedError' || failure.name === 'SecurityError') ? 'permission' : failure && failure.code === 'unsupported' ? 'unsupported' : 'recording';
          fail(session, code, code === 'permission' ? '마이크 사용을 허용하고 다시 눌러 주세요.' : '마이크를 시작하지 못했어요. 다시 누르거나 글자로 답해 주세요.');
        }
        return false;
      }
    }
    return { supported: supported, start: start, stop: function () { return current ? finish(current) : false; }, cancel: cancel, abort: cancel,
      dispose: function () { cancel(); }, isActive: function () { return !!current; }, isRecording: function () { return !!current && current.phase === 'recording'; } };
  }
  FQ.streamingSpeech = { supported: supported, create: create };
})(window);
