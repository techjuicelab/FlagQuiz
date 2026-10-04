/* 차례가 정해진 놀이용 클라우드 음성 인식. 녹음·변환은 메모리에서만 한다. */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var MAX_MS = 12000;
  var MAX_BYTES = 2 * 1024 * 1024;
  var RATE = 16000;

  function validMode(mode) { return mode === 'voice' || mode === 'capitalVoice' || mode === 'country-chain'; }

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
    var hasAudio = false;
    for (var n = 0; n < count; n++) {
      var position = n * decoded.sampleRate / RATE;
      var a = Math.floor(position), b = Math.min(a + 1, decoded.length - 1), fraction = position - a, sample = 0;
      for (var c = 0; c < channels.length; c++) sample += channels[c][a] * (1 - fraction) + channels[c][b] * fraction;
      sample = Math.max(-1, Math.min(1, sample / channels.length));
      var pcm = Math.round(sample * (sample < 0 ? 32768 : 32767));
      if (!isFinite(pcm)) pcm = 0;
      if (pcm !== 0) hasAudio = true;
      view.setInt16(44 + n * 2, pcm, true);
    }
    // 수동 종료도 완전무음을 보내지 않는다. 작은 아이 목소리를 RMS 문턱으로 다시 제거하지 않는다.
    if (!hasAudio) throw { code: 'no-speech' };
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
    var current = null, heldMicrophone = null;

    function live(session) { return current === session && !session.cancelled; }
    function emit(session, callback, value) {
      if (live(session) && typeof session.handlers[callback] === 'function') session.handlers[callback](value);
    }
    function state(session, phase) {
      session.phase = phase;
      emit(session, 'onState', { state: phase, playerId: session.playerId, turnId: session.turnId, mode: session.mode });
    }
    function clearTimers(session) {
      ['permissionTimer', 'recordTimer', 'rotationTimer', 'levelTimer', 'stopTimer', 'processingTimer', 'networkTimer'].forEach(function (key) {
        if (session[key]) global.clearTimeout(session[key]);
        session[key] = null;
      });
    }
    function stopTracks(stream) {
      if (stream && stream.getTracks) stream.getTracks().forEach(function (track) { track.stop(); });
    }
    function enableTracks(stream, enabled) {
      if (stream && stream.getTracks) stream.getTracks().forEach(function (track) { track.enabled = enabled; });
    }
    function closeAudio(audio) {
      if (audio) { try { var closed = audio.close(); if (closed && closed.catch) closed.catch(function () {}); } catch (error) {} }
    }
    function usableMicrophone(microphone) {
      if (!microphone || microphone.closed || microphone.tracksStopped || microphone.audio.state === 'closed') return false;
      var tracks = microphone.stream.getTracks();
      return tracks.length > 0 && tracks.every(function (track) { return track.readyState !== 'ended'; });
    }
    function watchMicrophone(microphone) {
      microphone.endedHandlers = microphone.stream.getTracks().map(function (track) {
        function ended() {
          if (microphone.closed) return;
          if (current && current.microphone === microphone && live(current)) {
            error(current, 'recording', '마이크 연결이 끊겼어요. 같은 차례에서 다시 누르거나 글자로 답해 주세요.');
          } else if (heldMicrophone === microphone) {
            closeMicrophone(microphone); heldMicrophone = null;
          }
        }
        if (track.addEventListener) track.addEventListener('ended', ended);
        else track.onended = ended;
        return { track: track, handler: ended };
      });
    }
    function closeMicrophone(microphone) {
      if (!microphone || microphone.closed) return;
      microphone.closed = true;
      (microphone.endedHandlers || []).forEach(function (entry) {
        if (entry.track.removeEventListener) entry.track.removeEventListener('ended', entry.handler);
        else if (entry.track.onended === entry.handler) entry.track.onended = null;
      });
      if (!microphone.tracksStopped) stopTracks(microphone.stream);
      try { microphone.source.disconnect(); } catch (error) {}
      closeAudio(microphone.audio);
    }
    function release(session, keepMicrophone) {
      clearTimers(session);
      if (session.recorder) {
        session.recorder.ondataavailable = null; session.recorder.onstop = null; session.recorder.onerror = null;
        if (session.recorder.state !== 'inactive') { try { session.recorder.stop(); } catch (error) {} }
      }
      if (session.microphone) {
        if (keepMicrophone && usableMicrophone(session.microphone)) {
          enableTracks(session.stream, false);
          if (heldMicrophone && heldMicrophone !== session.microphone) closeMicrophone(heldMicrophone);
          heldMicrophone = session.microphone;
        } else closeMicrophone(session.microphone);
        session.microphone = null;
      } else if (!session.microphoneEstablished && !session.audioClosed) {
        stopTracks(session.stream);
        if (session.source) { try { session.source.disconnect(); } catch (error) {} }
        closeAudio(session.audio); session.audioClosed = true;
      }
      if (session.request) session.request.abort();
      session.chunks = [];
    }
    function error(session, code, message) {
      if (!live(session)) return;
      release(session);
      if (heldMicrophone) { closeMicrophone(heldMicrophone); heldMicrophone = null; }
      state(session, 'idle');
      emit(session, 'onError', { code: code, message: message, playerId: session.playerId, turnId: session.turnId, mode: session.mode });
      if (current === session) current = null;
    }
    function cancel(options) {
      var keep = options && options.keepMicrophone === true;
      var session = current;
      if (session) { current = null; session.cancelled = true; release(session, keep); }
      if (!keep && heldMicrophone) { closeMicrophone(heldMicrophone); heldMicrophone = null; }
    }
    function resumeListening(session) {
      if (!live(session)) return;
      clearTimers(session);
      if (session.request) session.request.abort();
      session.request = null; enableTracks(session.stream, true);
      beginRecording(session, true);
    }

    async function upload(session) {
      if (!live(session)) return;
      clearTimers(session); enableTracks(session.stream, false);
      // 연속 대기는 실제로 이어진 발화가 있을 때만 인식한다. 수동 종료한 배경음도 기기 안에서 버린다.
      if (session.continuous && !session.heard) { resumeListening(session); return; }
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
            'X-Player-Id': session.playerId, 'X-Turn-Id': session.turnId, 'X-Speech-Mode': session.mode, 'X-CSRF-Token': token }, body: input.blob
        });
        if (!live(session)) return;
        var result = await response.json();
        if (!live(session)) return;
        if (!response.ok) {
          var serverCode = result && typeof result.error === 'string' ? result.error : '';
          var quota = serverCode === 'daily-speech-limit' || serverCode === 'monthly-speech-limit';
          var safeCode = response.status === 401 || response.status === 403 ? 'auth-required' :
            response.status === 429 ? (quota ? 'quota' : 'busy') : response.status === 400 && serverCode === 'no_speech' ? 'no-speech' : 'service';
          var message = safeCode === 'auth-required' ? '로그인을 확인해 주세요. 지금 차례는 글자로 답할 수 있어요.' :
            safeCode === 'quota' ? (serverCode === 'monthly-speech-limit' ? '이번 달의 말하기 사용량을 다 썼어요. 지금 차례는 글자로 답해 주세요.' :
              '오늘의 말하기 사용량을 다 썼어요. 지금 차례는 글자로 답해 주세요.') :
            safeCode === 'busy' ? '말하기 요청이 잠시 몰렸어요. 잠시 뒤 마이크를 다시 누르거나 글자로 답해 주세요.' :
            safeCode === 'no-speech' ? '목소리가 들리지 않았어요. 다시 말하거나 글자로 답해 주세요.' :
            '말하기 연결이 어려워요. 지금 차례는 글자로 답해 주세요.';
          error(session, safeCode, message);
          return;
        }
        if (!result || typeof result.text !== 'string' || result.text.length > 500) throw { code: 'service' };
        if (result.playerId !== session.playerId || result.turnId !== session.turnId ||
            result.mode !== undefined && result.mode !== session.mode) throw { code: 'service' };
        var text = result.text.trim();
        if (!text) {
          error(session, 'no-speech', '목소리가 들리지 않았어요. 다시 말하거나 글자로 답해 주세요.');
          return;
        }
        release(session, session.continuous); state(session, 'idle');
        emit(session, 'onResult', { text: text, resolution: result.resolution, playerId: session.playerId, turnId: session.turnId, mode: session.mode });
        if (current === session) current = null;
      } catch (failure) {
        if (!live(session)) return;
        var code = failure && failure.code;
        if (code === 'no-speech' && session.continuous) { resumeListening(session); return; }
        error(session, code || 'network', code === 'auth-required' ? '로그인을 확인해 주세요. 지금 차례는 글자로 답할 수 있어요.' :
          code === 'no-speech' ? '목소리가 들리지 않았어요. 다시 말하거나 글자로 답해 주세요.' : '말하기 연결이 어려워요. 지금 차례는 글자로 답해 주세요.');
      }
    }

    function stop() {
      var session = current;
      if (!session || session.phase !== 'recording' || session.rotating) return false;
      state(session, 'finishing');
      if (!live(session)) return false;
      clearTimers(session);
      session.stopTimer = global.setTimeout(function () { error(session, 'recording', '녹음을 마치지 못했어요. 지금 차례는 글자로 답해 주세요.'); }, 2000);
      enableTracks(session.stream, false);
      try {
        session.recorder.stop();
        if (!session.continuous && session.microphone && !session.microphone.tracksStopped) {
          stopTracks(session.stream); session.microphone.tracksStopped = true;
        }
      }
      catch (failure) { error(session, 'recording', '녹음을 마치지 못했어요. 지금 차례는 글자로 답해 주세요.'); }
      return true;
    }

    function rotate(session) {
      if (!live(session) || session.phase !== 'recording' || session.rotating) return;
      clearTimers(session); session.rotating = true;
      session.stopTimer = global.setTimeout(function () { error(session, 'recording', '녹음을 이어 듣지 못했어요. 지금 차례는 글자로 답해 주세요.'); }, 2000);
      try { session.recorder.stop(); }
      catch (failure) { error(session, 'recording', '녹음이 어려워요. 지금 차례는 글자로 답해 주세요.'); }
    }

    function levels(session) {
      if (!live(session) || session.phase !== 'recording') return;
      if (!usableMicrophone(session.microphone)) {
        error(session, 'recording', '마이크 연결이 끊겼어요. 같은 차례에서 다시 누르거나 글자로 답해 주세요.'); return;
      }
      var samples = new Float32Array(session.analyser.fftSize);
      session.analyser.getFloatTimeDomainData(samples);
      var sum = 0;
      for (var i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      var now = Date.now();
      var rms = Math.sqrt(sum / samples.length);
      if (!session.continuous) {
        if (rms > 0.012) { session.heard = true; session.lastLoud = now; }
      } else {
        // 배경 대비 증가가 150ms 이어질 때 발화로 본다. 정숙한 곳에서는 작은 목소리도 받는다.
        if (session.noiseFloor === undefined) session.noiseFloor = Math.min(rms, 0.015);
        var threshold = Math.max(0.003, session.noiseFloor * 1.5);
        if (rms > threshold) {
          if (session.candidateSince === null) session.candidateSince = now;
          if (now - session.candidateSince >= 150) session.heard = true;
          if (session.heard) session.lastLoud = now;
        } else {
          session.candidateSince = null;
          if (!session.heard) session.noiseFloor = session.noiseFloor * 0.9 + Math.min(rms, 0.015) * 0.1;
        }
        if (!session.heard && session.candidateSince === null && now - session.started >= 4000) { rotate(session); return; }
      }
      var quietMs = session.mode === 'country-chain' ? 1200 : 2200;
      if (session.heard && now - session.lastLoud >= quietMs) { stop(); return; }
      if (!session.continuous && !session.heard && now - session.started >= 5000) {
        error(session, 'no-speech', '목소리가 들리지 않았어요. 다시 말하거나 글자로 답해 주세요.'); return;
      }
      session.levelTimer = global.setTimeout(function () { levels(session); }, 100);
    }

    function beginRecording(session, announce) {
      if (!live(session)) return;
      var segment = (session.segment || 0) + 1; session.segment = segment;
      session.chunks = []; session.bytes = 0; session.heard = false; session.candidateSince = null;
      session.rotating = false; session.started = Date.now();
      var recorder;
      try { recorder = new global.MediaRecorder(session.stream, session.mime ? { mimeType: session.mime, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 }); }
      catch (failure) { error(session, 'recording', '녹음이 어려워요. 지금 차례는 글자로 답해 주세요.'); return; }
      session.recorder = recorder;
      recorder.ondataavailable = function (event) {
        if (!live(session) || session.segment !== segment || !event.data || !event.data.size) return;
        session.bytes += event.data.size;
        if (session.bytes > MAX_BYTES) { error(session, 'size', '녹음이 너무 커요. 답을 짧게 말해 주세요.'); return; }
        session.chunks.push(event.data);
      };
      recorder.onstop = function () {
        if (!live(session) || session.segment !== segment) return;
        if (session.rotating) {
          global.clearTimeout(session.stopTimer); session.stopTimer = null;
          recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null;
          beginRecording(session, false);
        } else upload(session);
      };
      recorder.onerror = function () {
        if (!live(session) || session.segment !== segment) return;
        error(session, 'recording', '녹음이 어려워요. 지금 차례는 글자로 답해 주세요.');
      };
      try { recorder.start(250); }
      catch (failure) { error(session, 'recording', '녹음이 어려워요. 지금 차례는 글자로 답해 주세요.'); return; }
      if (announce) state(session, 'recording');
      if (!live(session)) return;
      session.recordTimer = global.setTimeout(function () {
        if (!live(session)) return;
        if (session.continuous && !session.heard) rotate(session);
        else stop();
      }, MAX_MS);
      if (session.continuous) {
        // 발화 시작 직전까지의 소리를 포함하되, 무음 앞부분 때문에 첫 음절이 12초 상한에 잘리지 않게 한다.
        session.rotationTimer = global.setTimeout(function () {
          if (!live(session) || session.heard) return;
          // 교체 직전의 최신 소리를 확인해 샘플 주기 사이에 시작한 첫 음절도 남긴다.
          if (session.levelTimer) global.clearTimeout(session.levelTimer);
          session.levelTimer = null; levels(session);
        }, 4000);
      }
      levels(session);
    }

    async function start(handlers) {
      var h = handlers || {};
      var mode = h.mode === undefined ? (opts.mode === undefined ? 'country-chain' : opts.mode) : h.mode;
      var continuous = h.continuous === true && mode === 'country-chain';
      cancel({ keepMicrophone: continuous });
      var session = { handlers: h, continuous: continuous, playerId: String(h.playerId), turnId: String(h.turnId), mode: mode, phase: 'requesting', chunks: [], cancelled: false };
      current = session;
      if (!validMode(mode)) { error(session, 'configuration', '말하기 놀이를 확인할 수 없어요. 같은 문제에서 글자로 답해 주세요.'); return; }
      if (!supported() || ![session.playerId, session.turnId].every(function (id) { return /^[a-zA-Z0-9_-]{1,80}$/.test(id) && id !== 'undefined'; })) {
        error(session, 'unsupported', '이 기기에서는 클라우드 말하기를 쓸 수 없어요. 지금 차례는 글자로 답해 주세요.'); return;
      }
      state(session, 'requesting');
      if (!live(session)) return;
      session.permissionTimer = global.setTimeout(function () { error(session, 'permission', '마이크 허용을 확인해 주세요. 지금 차례는 글자로 답할 수 있어요.'); }, 20000);
      try {
        if (heldMicrophone && !usableMicrophone(heldMicrophone)) { closeMicrophone(heldMicrophone); heldMicrophone = null; }
        if (session.continuous && heldMicrophone) {
          session.microphone = heldMicrophone; heldMicrophone = null;
          session.audio = session.microphone.audio; session.stream = session.microphone.stream;
          session.source = session.microphone.source; session.analyser = session.microphone.analyser;
          session.microphoneEstablished = true;
          if (session.audio.resume) await session.audio.resume();
          if (!live(session)) return;
        } else {
          var Audio = global.AudioContext || global.webkitAudioContext;
          session.audio = new Audio();
          if (session.audio.resume) await session.audio.resume();
          if (!live(session)) return;
          var stream = await global.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }, video: false });
          if (!live(session)) { stopTracks(stream); return; }
          session.stream = stream;
          session.source = session.audio.createMediaStreamSource(stream); session.analyser = session.audio.createAnalyser();
          session.analyser.fftSize = 1024; session.source.connect(session.analyser);
          session.microphone = { audio: session.audio, stream: stream, source: session.source, analyser: session.analyser };
          session.microphoneEstablished = true;
          watchMicrophone(session.microphone);
        }
        if (!usableMicrophone(session.microphone)) throw { code: 'recording' };
        global.clearTimeout(session.permissionTimer); session.permissionTimer = null;
        session.mime = mime(); enableTracks(session.stream, true);
        beginRecording(session, true);
      } catch (failure) {
        error(session, 'permission', '마이크를 열지 못했어요. 허용을 확인하거나 지금 차례는 글자로 답해 주세요.');
      }
    }

    return { supported: supported, start: start, stop: stop, cancel: cancel, isRecording: function () { return !!(current && current.phase === 'recording'); } };
  }

  FQ.cloudSpeech = { create: create, supported: supported, MAX_DURATION_MS: MAX_MS };
})(window);
