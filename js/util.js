/* 국기 퀴즈 - 공통 유틸리티
 * 한글 자모 분해, 정답 비교, 배열 셔플 등 순수 함수 모음
 */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});

  /* ---------------- 한글 자모 ---------------- */
  var CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  var JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
  var JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

  /** 한글 음절을 자모 문자열로 분해한다. 한글이 아닌 문자는 그대로 둔다. */
  function toJamo(str) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code >= 0xac00 && code <= 0xd7a3) {
        var idx = code - 0xac00;
        out += CHO[Math.floor(idx / 588)];
        out += JUNG[Math.floor((idx % 588) / 28)];
        out += JONG[idx % 28];
      } else {
        out += str[i];
      }
    }
    return out;
  }

  /** 첫 글자의 초성을 돌려준다(힌트용). 한글이 아니면 첫 글자 그대로. */
  function initialOf(str) {
    var code = str.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) return CHO[Math.floor((code - 0xac00) / 588)];
    return str[0];
  }

  /** 비교용 정규화: 공백/기호 제거, 소문자화, 전각→반각 */
  function normalize(str) {
    if (!str) return '';
    return String(str)
      .normalize('NFC')
      .toLowerCase()
      .replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
      .replace(/[\s ]/g, '')
      .replace(/[.,!?'"`~\-_/\\()\[\]{}·:;]/g, '');
  }

  /** 레벤슈타인 편집 거리 */
  function editDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = new Array(b.length + 1);
    var cur = new Array(b.length + 1);
    for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (var k = 1; k <= b.length; k++) {
        var cost = a[i - 1] === b[k - 1] ? 0 : 1;
        cur[k] = Math.min(cur[k - 1] + 1, prev[k] + 1, prev[k - 1] + cost);
      }
      for (var m = 0; m <= b.length; m++) prev[m] = cur[m];
    }
    return prev[b.length];
  }

  /** 0~1 유사도. 자모 단위로 비교해 받침 하나 차이 같은 실수에 관대하다. */
  function similarity(a, b) {
    var x = toJamo(normalize(a));
    var y = toJamo(normalize(b));
    if (!x && !y) return 1;
    if (!x || !y) return 0;
    var d = editDistance(x, y);
    return 1 - d / Math.max(x.length, y.length);
  }

  /* ---------------- 배열 ---------------- */
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function sample(arr, n) {
    return shuffle(arr).slice(0, n);
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /** 가중치 배열에서 하나 고르기. weights[i] > 0 */
  function weightedPick(items, weights) {
    var total = 0, i;
    for (i = 0; i < weights.length; i++) total += weights[i];
    if (total <= 0) return pick(items);
    var r = Math.random() * total;
    for (i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /** 초 → "1분 23초" */
  function formatDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m > 0 ? m + '분 ' + s + '초' : s + '초';
  }

  /** 한글 이름 뒤에 붙일 주격 조사 (이/가) */
  function subjectParticle(word) {
    return hasJongseong(word) ? '이' : '가';
  }
  /** 한글 이름 뒤에 붙일 보조사 (은/는) */
  function topicParticle(word) {
    return hasJongseong(word) ? '은' : '는';
  }
  function hasJongseong(word) {
    if (!word) return false;
    var code = word.charCodeAt(word.length - 1);
    if (code < 0xac00 || code > 0xd7a3) return false;
    return (code - 0xac00) % 28 !== 0;
  }

  FQ.util = {
    toJamo: toJamo,
    initialOf: initialOf,
    normalize: normalize,
    editDistance: editDistance,
    similarity: similarity,
    shuffle: shuffle,
    sample: sample,
    pick: pick,
    weightedPick: weightedPick,
    clamp: clamp,
    formatDuration: formatDuration,
    subjectParticle: subjectParticle,
    topicParticle: topicParticle,
    hasJongseong: hasJongseong
  };
})(window);
