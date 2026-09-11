/* 국기 퀴즈 - MLX Core에서 만든 짧은 음악. 수아 설명과의 순서는 앱에서 정한다. */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var enabled = true;
  var bgmEnabled = false;
  var player = null;
  var current = null;
  var generation = 0;
  var last = {};
  var primed = false;
  var priming = false;
  var primeTimer = null;
  var START_TIMEOUT = 6000;
  var SILENCE = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==';

  function getPlayer() {
    if (player) return player;
    if (!global.Audio) return null;
    try {
      player = new global.Audio();
      player.preload = 'auto';
      player.setAttribute('playsinline', '');
    } catch (e) { player = null; }
    return player;
  }

  function resetPlayer() {
    if (!player) return;
    player.onplaying = null;
    player.onended = null;
    player.onerror = null;
    player.onloadedmetadata = null;
    try {
      player.pause();
      player.loop = false;
      player.removeAttribute('src');
      player.load();
    } catch (e) { /* 해제된 요소는 다음 재생 때 다시 시도한다. */ }
  }

  function clearTimers(run) {
    if (!run) return;
    global.clearTimeout(run.startTimer);
    global.clearTimeout(run.endTimer);
    global.clearTimeout(run.callbackTimer);
  }

  function stop() {
    generation += 1;
    clearTimers(current);
    current = null;
    global.clearTimeout(primeTimer);
    primeTimer = null;
    priming = false;
    resetPlayer();
  }

  /** 같은 요소의 무음을 손가락 조작 안에서 재생하여 iOS 재생 허가를 연다. */
  function unlock() {
    if (!enabled || current || primed || priming) return;
    var audio = getPlayer();
    if (!audio) return;
    var token = generation;
    priming = true;
    function finish(success) {
      if (token !== generation || current || !priming) return;
      global.clearTimeout(primeTimer);
      primeTimer = null;
      priming = false;
      primed = success;
      resetPlayer();
    }
    primeTimer = global.setTimeout(function () { finish(false); }, START_TIMEOUT);
    try {
      audio.src = SILENCE;
      audio.volume = 0;
      audio.loop = false;
      var result = audio.play();
      if (result && result.then) result.then(function () { finish(true); }, function () { finish(false); });
      else { audio.onended = function () { finish(true); }; }
    } catch (e) { finish(false); }
  }

  function isCurrent(run) { return current === run && run.generation === generation; }
  function notify(callback, value) {
    if (typeof callback !== 'function') return;
    try { callback(value); } catch (e) { /* 화면 콜백이 실패해도 재생 상태를 풀어 둔다. */ }
  }

  /** 성공·실패·소리 꺼짐 모두 비동기로 끝내며, 화면 이동 뒤 늦은 콜백은 버린다. */
  function complete(run, error) {
    if (!isCurrent(run) || run.settled) return;
    run.settled = true;
    run.playing = false;
    clearTimers(run);
    resetPlayer();
    if (error && error.code === 'playback-blocked') primed = false;
    run.callbackTimer = global.setTimeout(function () {
      if (!isCurrent(run)) return;
      current = null;
      notify(error && typeof run.options.onFail === 'function' ? run.options.onFail : run.options.onDone, error);
    }, 0);
  }

  function choose(event) {
    var manifest = FQ.musicManifest;
    if (!manifest || manifest.ready !== true || !Array.isArray(manifest.clips)) return null;
    var clips = manifest.clips.filter(function (clip) {
      return clip.event === event && typeof clip.id === 'string' &&
        /^audio\/music\/[a-z0-9-]+\.mp3$/.test(clip.src) && Number(clip.duration) > 0;
    });
    if (!clips.length) return null;
    var choices = clips.length > 1 ? clips.filter(function (clip) { return clip.id !== last[event]; }) : clips;
    if (!choices.length) choices = clips;
    var clip = choices[Math.floor(Math.random() * choices.length)];
    last[event] = clip.id;
    return clip;
  }

  function play(event, options) {
    // 홈을 다시 그리는 일만으로 배경음이 처음부터 겹쳐 나오지 않는다.
    if (event === 'homeBgm' && enabled && bgmEnabled && current &&
        current.event === event && !current.settled) return current.cancel;
    stop();
    var run = {
      event: event, options: options || {}, generation: generation,
      settled: false, playing: false, started: false,
      startTimer: null, endTimer: null, callbackTimer: null
    };
    run.cancel = function () { if (isCurrent(run)) stop(); };
    current = run;
    var clip = enabled && (event !== 'homeBgm' || bgmEnabled) ? choose(event) : null;
    if (!clip) { complete(run); return run.cancel; }
    var audio = getPlayer();
    if (!audio) { complete(run); return run.cancel; }
    run.playing = true;
    var isBgm = event === 'homeBgm';
    function fail(code) { complete(run, { code: code, id: clip.id, event: event }); }
    function watchEnd() {
      if (!isCurrent(run) || run.settled || !run.started || isBgm) return;
      global.clearTimeout(run.endTimer);
      var duration = Number(audio.duration);
      if (!isFinite(duration) || duration <= 0) duration = Number(clip.duration);
      var maximum = Math.min(120000, Math.max(4000, duration * 1000 + 2500));
      var remaining = Math.max(0, maximum - (+new Date() - run.startedAt));
      run.endTimer = global.setTimeout(function () { fail('playback-timeout'); }, remaining);
    }
    function began() {
      if (!isCurrent(run) || run.settled || run.started) return;
      run.started = true;
      run.startedAt = +new Date();
      primed = true;
      global.clearTimeout(run.startTimer);
      watchEnd();
    }
    audio.onplaying = began;
    audio.onloadedmetadata = watchEnd;
    audio.onended = function () { if (isCurrent(run) && run.started && !isBgm) complete(run); };
    audio.onerror = function () { fail('audio-file-error'); };
    run.startTimer = global.setTimeout(function () { fail('start-timeout'); }, START_TIMEOUT);
    try {
      audio.src = clip.src;
      audio.loop = isBgm;
      audio.playbackRate = 1;
      // 완성 음원의 음량을 통일하고, 설명보다 작은 소리로 들려준다.
      var gain = Number(clip.gain);
      audio.volume = Math.max(0, Math.min(isBgm ? 0.22 : 0.6,
        isFinite(gain) && gain > 0 ? gain : (isBgm ? 0.18 : 0.45)));
      var promise = audio.play();
      if (promise && promise.then) promise.then(began, function (error) {
        fail(error && error.name === 'NotAllowedError' ? 'playback-blocked' : 'playback-failed');
      });
    } catch (error) {
      fail(error && error.name === 'NotAllowedError' ? 'playback-blocked' : 'playback-failed');
    }
    return run.cancel;
  }

  FQ.music = {
    unlock: unlock,
    play: play,
    stop: stop,
    setEnabled: function (value) { enabled = !!value; if (!enabled) stop(); },
    setBgmEnabled: function (value) {
      bgmEnabled = !!value;
      if (!bgmEnabled && current && current.event === 'homeBgm') stop();
    },
    isPlaying: function () { return !!(current && current.playing); }
  };
})(window);
