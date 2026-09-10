/* 국기 퀴즈 - 소리
 * 효과음은 Web Audio API로 그때그때 만들어 쓴다(음원 파일 없음).
 * 나라 이름 읽어주기는 SpeechSynthesis(ko-KR)를 쓴다.
 */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var ctx = null;
  var enabled = true;
  var speakEnabled = true;
  var unlocked = false;
  var speechPrimed = false;
  var lastPrime = -99999;
  // 화면을 옮기거나 다시 듣기를 누르면 이전 읽어주기의 지연·재시도를 함께 무효화한다.
  var speechGeneration = 0;
  var speechTimers = [];
  function clearSpeechWork() {
    speechGeneration += 1;
    speechTimers.forEach(function (timer) { global.clearTimeout(timer); });
    speechTimers = [];
  }
  function afterSpeech(delay, callback) {
    var token = speechGeneration;
    var timer = global.setTimeout(function () {
      speechTimers = speechTimers.filter(function (id) { return id !== timer; });
      if (token === speechGeneration) callback();
    }, delay);
    speechTimers.push(timer);
  }
  function tick() { return (global.performance && global.performance.now) ? global.performance.now() : +new Date(); }

  var synth = global.speechSynthesis || null;

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
    if (!a) { primeSpeech(); return; }
    if (a.state === 'suspended' && a.resume) a.resume();
    if (!unlocked) {
      try {
        var buffer = a.createBuffer(1, 1, 22050);
        var source = a.createBufferSource();
        source.buffer = buffer;
        source.connect(a.destination);
        if (source.start) source.start(0);
        unlocked = true;
      } catch (e) { /* 못 열어도 게임은 그대로 돌아간다 */ }
    }
    primeSpeech();
  }

  /**
   * 읽어주기를 깨워 둔다.
   *
   * 아이폰·아이패드는 손가락으로 화면을 만진 흐름 안에서 한 번 말을 시켜 둬야
   * 그 뒤에 소리가 난다. 게다가 이 허가는 시간이 지나거나 음성 인식이
   * 소리 장치를 가져갔다 놓으면 풀린다. 그래서 손가락 조작이 있을 때마다
   * 다시 깨운다. (아이가 "다음 문제" 를 누르는 순간마다 깨워지므로,
   * 그다음 문제에서 말로 답해 손가락 조작이 없어도 소리가 난다.)
   *
   * 음량을 0 으로 두면 아이폰이 발화를 아예 건너뛰어 깨워지지 않는다.
   * 들리지 않을 만큼 작게, 그러나 0 이 아닌 값으로 말한다.
   */
  function primeSpeech() {
    if (!synth) return;
    var now = tick();
    if (now - lastPrime < 1500) return;      // 너무 자주 하지 않는다
    lastPrime = now;
    speechPrimed = true;
    try {
      if (synth.speaking || synth.pending) return;   // 말하는 중이면 건드리지 않는다
      var u = new global.SpeechSynthesisUtterance('\u200b');
      u.volume = 0.01;
      u.rate = 2;
      u.lang = 'ko-KR';
      synth.speak(u);
    } catch (e) { /* 지원하지 않으면 넘어간다 */ }
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

  /* ---------------- 읽어주기 ---------------- */
  function canSpeak() { return !!synth; }

  /**
   * 소리로 읽어 준다.
   * opts.queue 를 주면 앞의 말을 끊지 않고 뒤에 이어 붙인다.
   */
  /** 발화 하나를 만들어 바로 내보낸다 (끊기·기다리기 판단은 부르는 쪽에서 한다) */
  function speak(text, opts) {
    if (!speakEnabled || !synth || !text) return null;
    opts = opts || {};
    if (!opts.queue) stopSpeaking();
    try {
      if (synth.paused && synth.resume) synth.resume();   // 사파리가 멈춰 둔 경우
      var u = new global.SpeechSynthesisUtterance(text);
      u.lang = opts.lang || 'ko-KR';
      u.rate = opts.rate || 0.95;
      u.pitch = opts.pitch || 1.1;
      var voices = synth.getVoices() || [];
      var want = (opts.lang || 'ko-KR').slice(0, 2);
      for (var i = 0; i < voices.length; i++) {
        if (voices[i].lang && voices[i].lang.toLowerCase().indexOf(want) === 0) { u.voice = voices[i]; break; }
      }
      synth.speak(u);
      return u;
    } catch (e) {
      return null;   // 브라우저가 지원하지 않으면 조용히 넘어간다
    }
  }

  /**
   * 여러 줄을 차례로 읽어 준다.
   *
   *   say(['정답', '브라질'])
   *   say(['브라질', '브라질', '초록 바탕에 …'], { rate: 0.92 }, onFail)
   *
   * 아이폰·아이패드에서 소리가 조용히 사라지는 경우가 많아 세 가지를 함께 한다.
   *   - 사파리는 cancel 직후의 speak 을 삼키므로, 끊어야 할 때는 한 틈 뒤에 말한다
   *   - 첫 줄이 실제로 시작됐는지 지켜보다가 두 번까지 다시 시도한다 (이때는 끊지 않는다)
   *   - 끝내 시작되지 않으면 onFail 을 불러, 화면에서 눌러 들을 수 있게 안내한다
   */
  function say(lines, opts, onFail) {
    if (!speakEnabled || !synth) return;
    var list = (lines || []).filter(function (t) { return t; });
    if (!list.length) return;
    opts = opts || {};
    clearSpeechWork();
    var token = speechGeneration;
    var started = false;
    var attempt = 0;

    function utter() {
      for (var i = 0; i < list.length; i++) {
        var u = speak(list[i], {
          rate: (opts.rates && opts.rates[i]) || opts.rate,
          pitch: (opts.pitches && opts.pitches[i]) || opts.pitch,
          queue: true
        });
        if (i === 0 && u) u.onstart = function () { if (token === speechGeneration) started = true; };
      }
    }

    function attemptOnce() {
      if (token !== speechGeneration || !speakEnabled) return;
      attempt += 1;
      utter();
      afterSpeech(600, function () {
        if (started || !speakEnabled || !synth) return;
        if (attempt < 3) {
          // 다시 시도할 때는 cancel 하지 않는다. 사파리는 cancel 뒤의 speak 을 삼킨다.
          attemptOnce();
        } else if (onFail) {
          onFail();
        }
      });
    }

    // 앞의 말이 남아 있으면 끊고 한 틈 뒤에 시작한다
    if (synth.speaking || synth.pending) {
      try { synth.cancel(); } catch (e) {}
      afterSpeech(150, attemptOnce);
    } else {
      attemptOnce();
    }
  }

  function stopSpeaking() {
    clearSpeechWork();
    if (synth) { try { synth.cancel(); } catch (e) {} }
  }

  function setEnabled(v) { enabled = !!v; }
  function setSpeakEnabled(v) { speakEnabled = !!v; if (!v) stopSpeaking(); }

  /* 일부 브라우저는 voices가 비동기로 채워진다 */
  if (synth && typeof synth.getVoices === 'function') {
    try { synth.getVoices(); } catch (e) {}
    if ('onvoiceschanged' in synth) {
      synth.onvoiceschanged = function () { try { synth.getVoices(); } catch (e) {} };
    }
  }

  FQ.audio = {
    play: play,
    speak: speak,
    say: say,
    stopSpeaking: stopSpeaking,
    canSpeak: canSpeak,
    isSpeaking: function () { return !!(synth && (synth.speaking || synth.pending)); },
    preload: function () {},
    setEnabled: setEnabled,
    setSpeakEnabled: setSpeakEnabled,
    unlock: unlock,
    primeSpeech: primeSpeech
  };
})(window);
