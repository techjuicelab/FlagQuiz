/* 국기 퀴즈 - 소리
 * 효과음은 Web Audio API로 그때그때 만들어 쓴다(음원 파일 없음).
 * 나라 이름·설명·응원은 미리 만든 Typecast 음원을 재생한다.
 */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  // 선택한 목소리의 전체 음원이 준비되기 전에는 기존 읽어주기를 교체하지 않는다.
  if (!FQ.voiceManifest || FQ.voiceManifest.ready !== true) return;
  var ctx = null;
  var enabled = true;
  var speakEnabled = true;
  var unlocked = false;
  var voicePlayer = null;
  var mediaPrimed = false;
  var generation = 0;
  var active = null;
  var pending = [];
  var clip = null;
  var START_TIMEOUT = 12000;
  var MAX_CLIP_TIMEOUT = 120000;
  // 짧은 PCM 무음. 외부 파일을 기다리지 않고 손가락 조작 안에서 재생 허가를 연다.
  var SILENCE = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==';

  function ac() {
    if (ctx) return ctx;
    var C = global.AudioContext || global.webkitAudioContext;
    if (!C) return null;
    try { ctx = new C(); } catch (e) { ctx = null; }
    return ctx;
  }

  /**
   * 사용자가 화면을 처음 만질 때 소리를 깨운다.
   * 아이폰·아이패드는 손가락 조작 중에 한 번 소리를 내 봐야 그다음부터 소리가 난다.
   * 여러 번 불러도 안전하며, 열리고 나면 아무 일도 하지 않는다.
   */
  function unlock() {
    var a = ac();
    if (a) {
      if (a.state === 'suspended' && a.resume) {
        try {
          var resumed = a.resume();
          if (resumed && resumed.catch) resumed.catch(function () {});
        } catch (e) { /* 다음 손가락 조작에서 다시 시도한다 */ }
      }
      if (!unlocked) {
        try {
          var buffer = a.createBuffer(1, 1, 22050);
          var source = a.createBufferSource();
          source.buffer = buffer;
          source.connect(a.destination);
          if (source.start) source.start(0);
          unlocked = true;
        } catch (e) { /* 효과음을 못 열어도 게임은 계속한다 */ }
      }
    }
    primeSpeech();
  }

  function getPlayer() {
    if (voicePlayer) return voicePlayer;
    if (!global.Audio) return null;
    try {
      voicePlayer = new global.Audio();
      voicePlayer.preload = 'auto';
      voicePlayer.setAttribute('playsinline', '');
    } catch (e) { voicePlayer = null; }
    return voicePlayer;
  }

  /**
   * 같은 오디오 요소를 계속 써야 사파리의 재생 허가를 이어갈 수 있다.
   * 진행 중인 음원을 건드리지 않고, 무음 재생이 실패하면 다음 탭에서 다시 연다.
   */
  function primeSpeech() {
    if (active || mediaPrimed) return;
    var player = getPlayer();
    if (!player) return;
    var token = generation;
    try {
      player.src = SILENCE;
      var started = player.play();
      if (started && started.then) started.then(function () {
        // 그동안 실제 음원이나 다른 무음 시도가 시작됐다면 이전 작업은 아무것도 바꾸지 않는다.
        if (token !== generation || active || player.src !== SILENCE) return;
        mediaPrimed = true;
        player.pause();
      }, function () {});
    } catch (e) { /* 읽어주기를 누르면 실패 안내와 함께 다시 시도할 수 있다 */ }
  }

  /* 소리가 여러 개 겹쳐도 찢어지지 않도록 한 번 눌러서 내보낸다 */
  var master = null;
  function bus() {
    var a = ac();
    if (!a) return null;
    if (master) return master;
    var comp = a.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-16, a.currentTime);
    comp.ratio.setValueAtTime(6, a.currentTime);
    comp.attack.setValueAtTime(0.003, a.currentTime);
    comp.release.setValueAtTime(0.2, a.currentTime);
    var g = a.createGain();
    g.gain.setValueAtTime(0.85, a.currentTime);
    comp.connect(g);
    g.connect(a.destination);
    master = comp;
    return master;
  }

  /**
   * 음 하나를 낸다.
   * detune 을 주면 살짝 어긋난 소리를 겹쳐 더 도톰하게 들린다.
   */
  function tone(freq, startAt, duration, type, gain, detune) {
    var a = ac();
    var out = bus();
    if (!a || !out) return;
    var t = a.currentTime + startAt;
    var osc = a.createOscillator();
    var g = a.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (detune) osc.detune.setValueAtTime(detune, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain || 0.18), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  /** 화음 — 여러 음을 한꺼번에 */
  function chord(freqs, startAt, duration, type, gain) {
    for (var i = 0; i < freqs.length; i++) {
      tone(freqs[i], startAt, duration, type, gain, i === 0 ? 0 : (i % 2 ? 6 : -6));
    }
  }

  /** 아르페지오 — 음을 차례로 굴려 올린다 */
  function arp(freqs, startAt, step, duration, type, gain) {
    for (var i = 0; i < freqs.length; i++) {
      tone(freqs[i], startAt + i * step, duration, type, gain);
    }
  }

  /* 음이름 → 주파수 (12평균율) */
  var C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880.00;
  var C6 = 1046.50, D6 = 1174.66, E6 = 1318.51, G6 = 1567.98, A6 = 1760.00, C7 = 2093.00, E7 = 2637.02;

  /**
   * 정답 축하 소리.
   * level 이 올라갈수록(연속 정답) 더 높고 화려해진다.
   */
  function fanfare(level) {
    var lv = Math.max(0, Math.min(3, level || 0));
    // 밑에 깔리는 포근한 화음
    chord([C5, E5, G5], 0, 0.5, 'triangle', 0.09);
    // 반짝이며 굴러 올라가는 아르페지오
    arp([C6, E6, G6, C7], 0.04, 0.075, 0.28, 'sine', 0.16);
    // 맨 위에서 한 번 더 반짝
    tone(E7, 0.34, 0.5, 'sine', 0.1);
    if (lv >= 1) {
      chord([E5, G5, C6], 0.3, 0.5, 'triangle', 0.08);
      arp([E6, G6, C7], 0.34, 0.07, 0.26, 'sine', 0.13);
    }
    if (lv >= 2) {
      arp([G6, C7, E7], 0.56, 0.065, 0.3, 'sine', 0.12);
      tone(A6, 0.75, 0.55, 'triangle', 0.09);
    }
    if (lv >= 3) {
      chord([C6, E6, G6, C7], 0.8, 0.7, 'sine', 0.08);
    }
  }

  function play(name) {
    if (!enabled) return;
    unlock();
    switch (name) {
      case 'correct':                       // 정답 — 짧고 밝은 팡파레
        fanfare(0);
        break;
      case 'combo':                         // 연속 정답 — 더 화려하게
        fanfare(2);
        break;
      case 'bigcombo':                      // 많이 연속 — 제일 화려하게
        fanfare(3);
        break;
      case 'wrong':                         // 낮은 두 음, 야단치지 않는 부드러운 소리
        tone(320, 0, 0.16, 'triangle', 0.12);
        tone(240, 0.13, 0.3, 'triangle', 0.12);
        break;
      case 'click':
        tone(A5, 0, 0.05, 'sine', 0.07);
        break;
      case 'tick':
        tone(D6, 0, 0.03, 'square', 0.04);
        break;
      case 'finish':                        // 판이 끝났을 때
        chord([C5, E5, G5], 0, 0.6, 'triangle', 0.09);
        arp([C6, D6, E6, G6, C7], 0.06, 0.09, 0.32, 'sine', 0.15);
        chord([E5, A5, C6], 0.5, 0.7, 'triangle', 0.08);
        tone(E7, 0.62, 0.7, 'sine', 0.1);
        break;
      case 'badge':                         // 새 배지
        arp([E5, A5, C6, E6, A6], 0, 0.085, 0.35, 'triangle', 0.12);
        tone(C7, 0.42, 0.6, 'sine', 0.1);
        break;
    }
  }

  /* ---------------- Typecast 읽어주기 ---------------- */
  function canSpeak() { return !!global.Audio; }
  function isSpeaking() { return !!active; }

  function voiceClip(text) {
    var manifest = FQ.voiceManifest;
    return manifest && manifest.clips && Object.prototype.hasOwnProperty.call(manifest.clips, text)
      ? manifest.clips[text] : null;
  }

  function clearClip() {
    if (!clip) return;
    global.clearTimeout(clip.startTimer);
    global.clearTimeout(clip.endTimer);
    clip = null;
    if (voicePlayer) {
      voicePlayer.onplaying = null;
      voicePlayer.onended = null;
      voicePlayer.onerror = null;
      voicePlayer.onloadedmetadata = null;
    }
  }

  /**
   * 다음 문제·새 읽어주기·마이크 시작은 앞선 재생을 모두 취소한다.
   * src를 비우고 load()까지 호출해야 아직 대기 중인 play()도 사파리에서 중단된다.
   */
  function stopSpeaking() {
    generation += 1;
    clearClip();
    active = null;
    pending = [];
    if (voicePlayer) {
      try {
        voicePlayer.pause();
        voicePlayer.removeAttribute('src');
        voicePlayer.load();
      } catch (e) { /* 이미 해제된 오디오 요소는 무시한다 */ }
    }
  }

  function stillCurrent(run, item) {
    return active === run && clip === item && run.generation === generation;
  }

  function notify(callback, value) {
    if (typeof callback !== 'function') return;
    try { callback(value); } catch (e) { /* 화면 콜백 오류가 재생 상태를 잠그지 않게 한다 */ }
  }

  function nextRun() {
    if (active || !pending.length) return;
    active = pending.shift();
    playNext(active);
  }

  function fail(run, item, code) {
    if (!stillCurrent(run, item)) return;
    clearClip();
    if (code === 'playback-blocked') mediaPrimed = false;
    try {
      voicePlayer.pause();
      voicePlayer.removeAttribute('src');
      voicePlayer.load();
    } catch (e) {}
    active = null;
    // 한 문장의 일부만 빠진 채 다음 설명이 이어지지 않도록 해당 묶음 전체를 중단한다.
    var error = { code: code, text: run.lines[run.index] };
    var token = generation;
    global.setTimeout(function () {
      if (token !== generation) return;
      notify(run.handle && run.handle.onerror, { error: error });
      notify(run.onFail, error);
      nextRun();
    }, 0);
  }

  function playNext(run) {
    if (active !== run || run.generation !== generation) return;
    if (run.index >= run.lines.length) {
      active = null;
      notify(run.handle && run.handle.onend);
      notify(run.opts.onEnd);
      nextRun();
      return;
    }
    var text = run.lines[run.index];
    var asset = voiceClip(text);
    var player = getPlayer();
    var item = { startTimer: null, endTimer: null, started: false, startedAt: 0 };
    clip = item;
    if (!player) { fail(run, item, 'audio-unsupported'); return; }
    if (!asset || !asset.src) { fail(run, item, 'missing-clip'); return; }

    function watchEnd() {
      if (!stillCurrent(run, item) || !item.started) return;
      global.clearTimeout(item.endTimer);
      // 끝 이벤트가 없는 브라우저에서도 읽어주기가 영원히 진행 중으로 남지 않게 한다.
      var duration = Number(player.duration);
      if (!isFinite(duration) || duration <= 0) duration = Number(asset.duration) || 40;
      var maximum = Math.min(MAX_CLIP_TIMEOUT, Math.max(15000, duration * 1000 + 8000));
      var remaining = Math.max(0, maximum - (+new Date() - item.startedAt));
      item.endTimer = global.setTimeout(function () { fail(run, item, 'playback-timeout'); }, remaining);
    }
    function began() {
      if (!stillCurrent(run, item) || item.started) return;
      item.started = true;
      item.startedAt = +new Date();
      mediaPrimed = true;
      global.clearTimeout(item.startTimer);
      watchEnd();
      if (run.index === 0) {
        notify(run.handle && run.handle.onstart);
        notify(run.opts.onStart);
      }
    }
    player.onplaying = began;
    player.onloadedmetadata = watchEnd;
    player.onended = function () {
      if (!stillCurrent(run, item)) return;
      clearClip();
      run.index += 1;
      playNext(run);
    };
    player.onerror = function () { fail(run, item, 'audio-file-error'); };
    item.startTimer = global.setTimeout(function () { fail(run, item, 'start-timeout'); }, START_TIMEOUT);
    try {
      player.src = asset.src;
      // 생성된 원음의 말투와 높이를 그대로 살린다. 이전 합성음 rate/pitch는 사용하지 않는다.
      player.playbackRate = 1;
      player.volume = 1;
      var promise = player.play();
      if (promise && promise.then) promise.then(began, function (error) {
        fail(run, item, error && error.name === 'NotAllowedError' ? 'playback-blocked' : 'playback-failed');
      });
    } catch (error) {
      fail(run, item, error && error.name === 'NotAllowedError' ? 'playback-blocked' : 'playback-failed');
    }
  }

  function enqueue(lines, opts, onFail, handle) {
    if (!speakEnabled) return null;
    var list = (lines || []).filter(function (text) { return typeof text === 'string' && text.length; });
    if (!list.length) return null;
    opts = opts || {};
    if (!opts.queue) stopSpeaking();
    var run = { lines: list, index: 0, opts: opts, onFail: onFail, handle: handle, generation: generation };
    pending.push(run);
    nextRun();
    return handle || run;
  }

  /** 한 문장 읽기. 기존 반환값의 이벤트 콜백 모양은 유지한다. */
  function speak(text, opts) {
    var handle = { text: text, onstart: null, onend: null, onerror: null };
    return enqueue([text], opts, opts && opts.onFail, handle);
  }

  /** 여러 문장을 순서대로 읽는다. 하나라도 실패하면 onFail로 다시 듣기 안내를 요청한다. */
  function say(lines, opts, onFail) {
    return enqueue(lines, opts, onFail || (opts && opts.onFail), null);
  }

  /** 가까운 문제의 짧은 음원만 HTTP 캐시에 준비한다. 재생 허가나 현재 재생에는 손대지 않는다. */
  function preload(lines) {
    if (!global.fetch || !speakEnabled) return;
    var seen = {};
    (lines || []).slice(0, 4).forEach(function (text) {
      var asset = voiceClip(text);
      if (!asset || !asset.src || seen[asset.src]) return;
      seen[asset.src] = true;
      global.fetch(asset.src, { cache: 'force-cache' }).then(function (response) {
        return response.ok ? response.arrayBuffer() : null;
      }).catch(function () { /* 실제 재생 때 다시 시도하고 실패하면 화면에 안내한다 */ });
    });
  }

  function setEnabled(v) { enabled = !!v; }
  function setSpeakEnabled(v) { speakEnabled = !!v; if (!v) stopSpeaking(); }

  FQ.audio = {
    play: play,
    speak: speak,
    say: say,
    stopSpeaking: stopSpeaking,
    canSpeak: canSpeak,
    isSpeaking: isSpeaking,
    preload: preload,
    setEnabled: setEnabled,
    setSpeakEnabled: setSpeakEnabled,
    unlock: unlock,
    primeSpeech: primeSpeech
  };
})(window);
