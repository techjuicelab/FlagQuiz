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

  /* ---------------- 로마자를 한글 소리로 ---------------- */
  /*
   * 아이패드·아이폰 받아쓰기는 한국말을 로마자로 적어 보낼 때가 있다.
   * 예: "시리아" → "Siri야" (시리 호출로 알아듣는 탓)
   * 이런 답도 인정하려면 로마자 부분을 한글 소리(자모)로 옮겨 견주어야 한다.
   */
  var LATIN_PAIR = {
    ch: 'ㅊ', sh: 'ㅅ', th: 'ㅌ', ph: 'ㅍ', kh: 'ㅋ', gh: 'ㄱ', wh: 'ㅇ', ck: 'ㅋ',
    ee: 'ㅣ', oo: 'ㅜ', ai: 'ㅐ', ei: 'ㅔ', ea: 'ㅣ', ie: 'ㅣ', ou: 'ㅜ', au: 'ㅗ', eu: 'ㅡ'
  };
  var LATIN_ONE = {
    a: 'ㅏ', b: 'ㅂ', c: 'ㅋ', d: 'ㄷ', e: 'ㅔ', f: 'ㅍ', g: 'ㄱ', h: 'ㅎ', i: 'ㅣ',
    j: 'ㅈ', k: 'ㅋ', l: 'ㄹ', m: 'ㅁ', n: 'ㄴ', o: 'ㅗ', p: 'ㅍ', q: 'ㅋ', r: 'ㄹ',
    s: 'ㅅ', t: 'ㅌ', u: 'ㅜ', v: 'ㅂ', w: 'ㅇ', x: 'ㅋㅅ', y: 'ㅣ', z: 'ㅈ'
  };
  var JUNG_SET = {};
  JUNG.forEach(function (v) { JUNG_SET[v] = true; });

  function hasLatin(str) { return /[a-z]/i.test(str || ''); }

  /**
   * 로마자가 섞인 말을 한글 자모로 옮긴다. 한글 부분은 그대로 분해한다.
   * 홀소리 앞에 닿소리가 없으면 'ㅇ' 을 넣어 한글 소리 모양을 맞춘다.
   */
  function latinToJamo(str) {
    var src = String(str || '').toLowerCase();
    var out = '';
    var i = 0;
    function push(jamo) {
      for (var k = 0; k < jamo.length; k++) {
        var ch = jamo[k];
        if (JUNG_SET[ch]) {
          var prev = out[out.length - 1];
          if (!prev || JUNG_SET[prev]) out += 'ㅇ';
        }
        out += ch;
      }
    }
    while (i < src.length) {
      var two = src.slice(i, i + 2);
      if (LATIN_PAIR[two]) { push(LATIN_PAIR[two]); i += 2; continue; }
      var one = src[i];
      if (LATIN_ONE[one]) { push(LATIN_ONE[one]); i += 1; continue; }
      out += toJamo(one);          // 한글이나 그 밖의 글자는 그대로
      i += 1;
    }
    return out;
  }

  /**
   * 말한 내용(input) 안에서 이름(pattern)과 가장 가까운 부분을 찾아
   * 그 부분과 이름 사이의 편집 거리를 돌려준다.
   *
   * 앞뒤를 공짜로 건너뛰기 때문에
   *   "음… 브라질이요"   → 앞의 "음…"과 뒤의 "이요"를 빼고 견준다
   *   "브라질 브라질"     → 두 번 말해도 한 번만 견준다
   *   "브라찔"           → 살짝 틀리게 말해도 거리 1 로 나온다
   * 처럼 아이가 말한 그대로도 이름을 찾아낸다.
   */
  function containsDistance(input, pattern) {
    if (!pattern || !pattern.length) return input ? input.length : 0;
    if (!input || !input.length) return pattern.length;
    var n = input.length;
    var prev = new Array(n + 1);
    var cur = new Array(n + 1);
    var i, j;
    for (i = 0; i <= n; i++) prev[i] = 0;          // 앞부분은 얼마든지 건너뛸 수 있다
    for (j = 1; j <= pattern.length; j++) {
      cur[0] = j;
      for (i = 1; i <= n; i++) {
        var cost = input[i - 1] === pattern[j - 1] ? 0 : 1;
        cur[i] = Math.min(cur[i - 1] + 1, prev[i] + 1, prev[i - 1] + cost);
      }
      for (i = 0; i <= n; i++) prev[i] = cur[i];
    }
    var best = prev[0];                            // 뒷부분도 얼마든지 남아도 된다
    for (i = 1; i <= n; i++) if (prev[i] < best) best = prev[i];
    return best;
  }

  /* 같은 나라 이름을 몇 번이고 다시 분해하지 않도록 결과를 담아 둔다 */
  var keyCache = {};
  function compareKey(s) {
    if (typeof s !== 'string') s = String(s == null ? '' : s);
    var hit = keyCache[s];
    if (hit === undefined) {
      hit = toJamo(normalize(s));
      keyCache[s] = hit;
    }
    return hit;
  }

  /** 0~1 유사도. 자모 단위로 비교해 받침 하나 차이 같은 실수에 관대하다. */
  function similarity(a, b) {
    var x = compareKey(a);
    var y = compareKey(b);
    if (!x && !y) return 1;
    if (!x || !y) return 0;
    var longer = Math.max(x.length, y.length);
    var gap = Math.abs(x.length - y.length);
    // 길이 차이만으로 이미 많이 다르면 편집 거리를 계산하지 않는다.
    // 이때 돌려주는 값은 실제 유사도보다 높으므로, 어떤 문턱값에도 못 미칠 때만 건너뛴다.
    if (gap / longer > 0.34) return 1 - gap / longer;
    return 1 - editDistance(x, y) / longer;
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
    compareKey: compareKey,
    hasLatin: hasLatin,
    latinToJamo: latinToJamo,
    editDistance: editDistance,
    containsDistance: containsDistance,
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
