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

  /** 읽어주기도 첫 손가락 조작 때 한 번 깨워 둬야 사파리에서 소리가 난다. */
  function primeSpeech() {
    if (speechPrimed || !synth) return;
    speechPrimed = true;
    try {
      var u = new global.SpeechSynthesisUtterance(' ');
      u.volume = 0;
      u.lang = 'ko-KR';
      synth.speak(u);
    } catch (e) { /* 지원하지 않으면 넘어간다 */ }
  }

  function tone(freq, startAt, duration, type, gain) {
    var a = ac();
    if (!a) return;
    var osc = a.createOscillator();
    var g = a.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, a.currentTime + startAt);
    g.gain.setValueAtTime(0.0001, a.currentTime + startAt);
    g.gain.exponentialRampToValueAtTime(gain || 0.18, a.currentTime + startAt + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + startAt + duration);
    osc.connect(g);
    g.connect(a.destination);
    osc.start(a.currentTime + startAt);
    osc.stop(a.currentTime + startAt + duration + 0.02);
  }

  function play(name) {
    if (!enabled) return;
    unlock();
    switch (name) {
      case 'correct':                       // 도-미-솔 아르페지오
        tone(523.25, 0, 0.14, 'sine');
        tone(659.25, 0.09, 0.14, 'sine');
        tone(783.99, 0.18, 0.24, 'sine');
        break;
      case 'wrong':                         // 낮은 두 음
        tone(220, 0, 0.16, 'triangle', 0.14);
        tone(164.81, 0.14, 0.28, 'triangle', 0.14);
        break;
      case 'combo':                         // 반짝
        tone(1046.5, 0, 0.08, 'sine', 0.12);
        tone(1318.5, 0.07, 0.08, 'sine', 0.12);
        tone(1567.9, 0.14, 0.16, 'sine', 0.12);
        break;
      case 'click':
        tone(880, 0, 0.05, 'sine', 0.07);
        break;
      case 'tick':
        tone(1200, 0, 0.03, 'square', 0.04);
        break;
      case 'finish':                        // 팡파레
        [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
          tone(f, i * 0.11, 0.3, 'sine', 0.16);
        });
        tone(1318.5, 0.46, 0.5, 'sine', 0.14);
        break;
      case 'badge':
        [659.25, 880, 1174.7].forEach(function (f, i) { tone(f, i * 0.1, 0.35, 'triangle', 0.13); });
        break;
    }
  }

  /* ---------------- 읽어주기 ---------------- */
  function canSpeak() { return !!synth; }

  function speak(text, opts) {
    if (!speakEnabled || !synth || !text) return;
    opts = opts || {};
    try {
      synth.cancel();
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
    } catch (e) { /* 브라우저가 지원하지 않으면 조용히 넘어간다 */ }
  }

  function stopSpeaking() {
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
    stopSpeaking: stopSpeaking,
    canSpeak: canSpeak,
    setEnabled: setEnabled,
    setSpeakEnabled: setSpeakEnabled,
    unlock: unlock,
    primeSpeech: primeSpeech
  };
})(window);
