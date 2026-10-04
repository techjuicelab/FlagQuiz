/* 이전 주소의 기록은 초기 저장소에만 자동 설치한다. 기록은 서버로 보내지 않는다. */
(function (global) {
  'use strict';
  var KEY = 'flagquiz.v1', PENDING = 'flagquiz.legacy-pending';
  var SOURCE = 'flagquiz.legacy-source', BACKUP = 'flagquiz.legacy-backup';
  var MAX_BYTES = 512 * 1024;
  var TOP = ['settings', 'stats', 'daily', 'countries', 'badges', 'axes', 'history', 'chest', 'gifts'];
  var DEFAULTS = {
    settings: { players: ['민규'], mode: 'choice4', level: '1', continent: 'all', count: 10,
      sound: true, homeMusic: false, correctMusic: false, speak: true, reviewFirst: true, timer: 0, dev: {} },
    stats: { games: 0, asked: 0, correct: 0, bestStreak: 0, playSeconds: 0, xp: 0 },
    daily: { date: '', continent: '', done: 0 }, countries: {}, badges: {}, axes: {}, history: [],
    chest: { since: 0, opened: 0, kinds: {} }, gifts: { owned: [] }
  };
  var MODES = ['choice4', 'reverse', 'capital', 'capitalVoice', 'typing', 'voice', 'map', 'symbol', 'place'];
  var MODE_GROUPS = { flag: ['choice4', 'reverse', 'typing', 'voice'], art: ['symbol', 'place'], map: ['map'], capital: ['capital', 'capitalVoice'] };
  var IDENTIFIER = /^[A-Za-z0-9_-]{1,80}$/;
  var own = function (value, key) { return Object.prototype.hasOwnProperty.call(value, key); };
  function fail(code) { var error = new Error(code); error.code = code; throw error; }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function integer(value) { return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0 && value <= 1000000000000; }
  function string(value, limit) { return typeof value === 'string' && value.length <= limit; }
  function allowed(value, keys) { return object(value) && Object.keys(value).every(function (key) { return keys.indexOf(key) !== -1; }); }
  function optional(value, key, check) { return !own(value, key) || check(value[key]); }
  function numbers(value, keys) { return keys.every(function (key) { return optional(value, key, integer); }); }
  function names(value) { return Array.isArray(value) && value.length > 0 && value.length <= 16 && value.every(function (name) { return string(name, 1024) && name.length > 0; }); }
  function day(value) { return string(value, 10) && (value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value)); }
  function map(value, checkKey, checkValue, limit) {
    return object(value) && Object.keys(value).length <= limit && Object.keys(value).every(function (key) { return checkKey(key) && checkValue(value[key]); });
  }
  function record(value) {
    return allowed(value, ['seen', 'correct', 'wrong', 'streak', 'correctDays', 'lastCorrectDay']) &&
      numbers(value, ['seen', 'correct', 'wrong', 'streak', 'correctDays']) && optional(value, 'lastCorrectDay', day);
  }
  function countries(value) { return map(value, function (key) { return /^[a-z]{2}$/.test(key); }, record, 676); }
  function identifier(value) { return typeof value === 'string' && IDENTIFIER.test(value); }
  function lastModes(value) {
    return allowed(value, Object.keys(MODE_GROUPS)) && Object.keys(value).every(function (group) {
      return MODE_GROUPS[group].indexOf(value[group]) !== -1;
    });
  }

  // TextEncoder가 없는 환경에서도 같은 UTF-8 바이트 수와 출처 fingerprint를 사용한다.
  function utf8(value) {
    var bytes = [], i, code, next;
    for (i = 0; i < value.length; i++) {
      code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        next = value.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) { code = 0x10000 + ((code - 0xd800) << 10) + next - 0xdc00; i++; }
        else code = 0xfffd;
      } else if (code >= 0xdc00 && code <= 0xdfff) code = 0xfffd;
      if (code < 0x80) bytes.push(code);
      else if (code < 0x800) bytes.push(0xc0 | code >>> 6, 0x80 | code & 63);
      else if (code < 0x10000) bytes.push(0xe0 | code >>> 12, 0x80 | code >>> 6 & 63, 0x80 | code & 63);
      else bytes.push(0xf0 | code >>> 18, 0x80 | code >>> 12 & 63, 0x80 | code >>> 6 & 63, 0x80 | code & 63);
    }
    return bytes;
  }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (object(value)) return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + canonical(value[key]); }).join(',') + '}';
    return JSON.stringify(value);
  }
  function fingerprint(value) {
    var bytes = utf8(canonical(value)), bits = bytes.length * 8;
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    function rotate(v, n) { return v >>> n | v << 32 - n; }
    bytes.push(128); while (bytes.length % 64 !== 56) bytes.push(0);
    bytes.push(0, 0, 0, 0, bits >>> 24 & 255, bits >>> 16 & 255, bits >>> 8 & 255, bits & 255);
    for (var offset = 0; offset < bytes.length; offset += 64) {
      var w = [], i;
      for (i = 0; i < 16; i++) { var p = offset + i * 4; w[i] = (bytes[p] << 24 | bytes[p + 1] << 16 | bytes[p + 2] << 8 | bytes[p + 3]) >>> 0; }
      for (i = 16; i < 64; i++) {
        var s0 = rotate(w[i - 15], 7) ^ rotate(w[i - 15], 18) ^ w[i - 15] >>> 3;
        var s1 = rotate(w[i - 2], 17) ^ rotate(w[i - 2], 19) ^ w[i - 2] >>> 10;
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      var a=h[0], b=h[1], c=h[2], d=h[3], e=h[4], f=h[5], g=h[6], z=h[7];
      for (i = 0; i < 64; i++) {
        var t1 = (z + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + (e & f ^ ~e & g) + k[i] + w[i]) >>> 0;
        var t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + (a & b ^ a & c ^ b & c)) >>> 0;
        z=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
      }
      [a,b,c,d,e,f,g,z].forEach(function (value, index) { h[index] = (h[index] + value) >>> 0; });
    }
    return h.map(function (value) { return ('00000000' + value.toString(16)).slice(-8); }).join('');
  }

  function validate(raw) {
    if (typeof raw !== 'string') fail('malformed');
    if (raw.length > MAX_BYTES || utf8(raw).length > MAX_BYTES) fail('oversize');
    var data;
    try { data = JSON.parse(raw); } catch (error) { fail('malformed'); }
    var nodes = 0;
    function safe(value, depth) {
      if (++nodes > 100000 || depth > 32) fail('schema');
      if (value && typeof value === 'object') Object.keys(value).forEach(function (key) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') fail('schema');
        safe(value[key], depth + 1);
      });
      else if (typeof value === 'number' && !isFinite(value)) fail('schema');
    }
    safe(data, 0);
    if (!allowed(data, TOP) || !Object.keys(data).length) fail('schema');
    if (own(data, 'settings')) {
      var s = data.settings;
      if (!allowed(s, Object.keys(DEFAULTS.settings).concat(['lastMode'])) || !optional(s, 'players', names) ||
          !optional(s, 'mode', function (value) { return MODES.indexOf(value) !== -1; }) ||
          !optional(s, 'lastMode', lastModes) ||
          !optional(s, 'level', function (value) { return value === 'all' || (typeof value === 'string' && /^[1-9][0-9]?$/.test(value)) || (integer(value) && value > 0 && value <= 99); }) ||
          !optional(s, 'continent', function (value) { return string(value, 100); }) ||
          !optional(s, 'count', function (value) { return value === 'all' || (integer(value) && value > 0 && value <= 1000); }) ||
          !optional(s, 'timer', function (value) { return integer(value) && value <= 3600; }) ||
          !['sound','homeMusic','correctMusic','speak','reviewFirst'].every(function (key) { return optional(s, key, function (value) { return typeof value === 'boolean'; }); }) ||
          !optional(s, 'dev', function (value) { return map(value, identifier, function (flag) { return typeof flag === 'boolean'; }, 16); })) fail('schema');
    }
    if (own(data, 'stats') && (!allowed(data.stats, Object.keys(DEFAULTS.stats)) || !numbers(data.stats, Object.keys(DEFAULTS.stats)))) fail('schema');
    if (own(data, 'daily') && (!allowed(data.daily, ['date','continent','done']) || !optional(data.daily, 'date', day) ||
        !optional(data.daily, 'continent', function (value) { return string(value, 100); }) || !optional(data.daily, 'done', integer))) fail('schema');
    if (own(data, 'countries') && !countries(data.countries)) fail('schema');
    if (own(data, 'badges') && !map(data.badges, identifier, function (value) { return value === true || string(value, 80); }, 1000)) fail('schema');
    if (own(data, 'axes') && !map(data.axes, function (key) { return ['flag','symbol','place','map','capital'].indexOf(key) !== -1; }, countries, 5)) fail('schema');
    if (own(data, 'history') && (!Array.isArray(data.history) || data.history.length > 1000 || !data.history.every(function (entry) {
      return allowed(entry, ['date','mode','total','correct','players','learnedCorrect','helpedCorrect']) &&
        optional(entry, 'date', day) && optional(entry, 'mode', identifier) && optional(entry, 'players', names) &&
        numbers(entry, ['total','correct','learnedCorrect','helpedCorrect']);
    }))) fail('schema');
    if (own(data, 'chest') && (!allowed(data.chest, ['since','opened','kinds']) || !numbers(data.chest, ['since','opened']) ||
        !optional(data.chest, 'kinds', function (value) { return map(value, identifier, integer, 1000); }))) fail('schema');
    if (own(data, 'gifts') && (!allowed(data.gifts, ['owned']) || !optional(data.gifts, 'owned', function (value) {
      return Array.isArray(value) && value.length <= 1000 && value.every(identifier);
    }))) fail('schema');
    return { data: data, fingerprint: fingerprint(data), summary: summary(data) };
  }
  function summary(data) {
    var s = data.stats || {}, axes = data.axes || {}, count = 0;
    Object.keys(axes).forEach(function (axis) { count += Object.keys(axes[axis]).length; });
    return { games: s.games || 0, asked: s.asked || 0, correct: s.correct || 0, xp: s.xp || 0,
      countries: Object.keys(data.countries || {}).length, badges: Object.keys(data.badges || {}).length,
      axisCountries: count, history: (data.history || []).length, gifts: ((data.gifts || {}).owned || []).length };
  }
  function result(status, proof, code) {
    var value = { status: status };
    if (proof) value.summary = proof.summary;
    if (code) value.code = code;
    return value;
  }
  function fresh(raw) {
    if (raw === null) return true;
    try { return canonical(validate(raw).data) === canonical(DEFAULTS); } catch (error) { return false; }
  }
  function marker(raw) {
    try {
      var value = JSON.parse(raw);
      return value && value.version === 1 && /^[0-9a-f]{64}$/.test(value.fingerprint) &&
        (value.phase === 'prepared' || value.phase === 'complete') ? value : null;
    } catch (error) { return null; }
  }
  function forgetPending() { try { global.sessionStorage.removeItem(PENDING); return true; } catch (error) { return false; } }
  function write(storage, key, raw) {
    storage.setItem(key, raw);
    if (storage.getItem(key) !== raw) fail('storage');
  }
  function restore(storage, key, raw) {
    if (raw === null) {
      storage.removeItem(key);
      if (storage.getItem(key) !== null) fail('storage');
    } else write(storage, key, raw);
  }
  function install(raw, options, pending) {
    var proof;
    try { proof = validate(raw); } catch (error) { return result('invalid', null, error.code || 'schema'); }
    var storage, current, source, oldBackup, parsed;
    var replace = options && options.replace === true;
    try {
      storage = global.localStorage; current = storage.getItem(KEY); source = storage.getItem(SOURCE);
      oldBackup = replace && current !== null ? storage.getItem(BACKUP) : null;
    } catch (error) { return result('unavailable', proof, 'storage'); }
    parsed = marker(source);
    // 자동 전달만 재전송을 막는다. 사용자가 고른 파일 복원과 교체는 다시 설치할 수 있다.
    if (pending && !replace && parsed && parsed.fingerprint === proof.fingerprint) {
      var installed = parsed.phase === 'complete';
      if (!installed && current !== null) {
        try { installed = validate(current).fingerprint === proof.fingerprint; } catch (error) { /* 미완료 상태의 기존 기록도 아래에서 보호한다. */ }
      }
      if (installed) {
        try { if (parsed.phase !== 'complete') write(storage, SOURCE, JSON.stringify({ version: 1, fingerprint: proof.fingerprint, phase: 'complete' })); }
        catch (error) { return result('unavailable', proof, 'storage'); }
        if (pending) forgetPending();
        return result('replayed', proof);
      }
    }
    if (!replace && !fresh(current)) return result('conflict', proof);
    var wroteBackup = false, wroteSource = false, wroteCurrent = false;
    try {
      // 먼저 백업하고 출처 마커의 공간을 확보한 뒤 기록을 설치한다.
      if (replace && current !== null) { wroteBackup = true; write(storage, BACKUP, current); }
      wroteSource = true; write(storage, SOURCE, JSON.stringify({ version: 1, fingerprint: proof.fingerprint, phase: 'prepared' }));
      wroteCurrent = true; write(storage, KEY, raw);
      write(storage, SOURCE, JSON.stringify({ version: 1, fingerprint: proof.fingerprint, phase: 'complete' }));
    } catch (error) {
      var restored = !wroteCurrent;
      if (wroteCurrent) {
        try { restore(storage, KEY, current); restored = storage.getItem(KEY) === current; } catch (ignored) { /* 백업과 pending은 남긴다. */ }
      }
      if (wroteSource) { try { restore(storage, SOURCE, source); } catch (ignored) { /* prepared 마커는 성공 표시로 취급하지 않는다. */ } }
      if (wroteBackup && restored) { try { restore(storage, BACKUP, oldBackup); } catch (ignored) { /* 이전 원문 백업을 보존한다. */ } }
      return result('unavailable', proof, 'storage');
    }
    if (pending) forgetPending();
    return result('imported', proof);
  }
  function inspectPending() {
    var raw, proof;
    try { raw = global.sessionStorage.getItem(PENDING); } catch (error) { return { pending: false, status: 'unavailable' }; }
    if (raw === null) return { pending: false, status: 'empty' };
    try { proof = validate(raw); } catch (error) { return { pending: true, status: 'invalid', code: error.code || 'schema' }; }
    return { pending: true, status: 'pending', summary: proof.summary };
  }
  function importPending(options) {
    var raw;
    try { raw = global.sessionStorage.getItem(PENDING); } catch (error) { return result('unavailable', null, 'storage'); }
    return raw === null ? result('empty') : install(raw, options, true);
  }
  global.FQLegacyRecords = {
    consumePending: function () { return importPending({ replace: false }); },
    inspectPending: inspectPending,
    importPending: importPending,
    importJson: function (raw, options) { return install(raw, options, false); },
    discardPending: function () { return result(forgetPending() ? 'discarded' : 'unavailable'); }
  };
})(window);
