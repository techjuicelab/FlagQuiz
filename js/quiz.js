/* 국기 퀴즈 - 출제 엔진
 * 나라 목록을 걸러 문제를 만들고, 보기(오답 후보)를 고르고, 답을 채점한다.
 * 화면(DOM)을 전혀 건드리지 않아 그대로 테스트할 수 있다.
 */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var util = FQ.util;

  var MODES = {
    choice4: { label: '국기 보고 나라 고르기', kind: 'choice', hasOptions: true, axis: 'flag' },
    reverse: { label: '나라 보고 국기 찾기', kind: 'choice', hasOptions: true, axis: 'flag' },
    // 수도 놀이(2026-09-17 D17 채택 B): 수도 이름을 듣고 국기 4장 중 그 나라를 찾는다. 기록은 axes.capital 에 따로 쌓여
    // 새 축 규칙(시간 초과 지나감·대결 없음·오늘의 도전 미집계)을 받되, 출제는 D15 대신 LEARN.capital(D24) 규칙을 탄다.
    capital: { label: '수도 듣고 국기 찾기', kind: 'choice', hasOptions: true, axis: 'capital' },
    typing:  { label: '이름 써서 맞히기', kind: 'text', hasOptions: false, axis: 'flag' },
    voice:   { label: '말로 답하기', kind: 'text', hasOptions: false, axis: 'flag' },
    map:     { label: '지도에서 나라 찾기', kind: 'choice', hasOptions: true, axis: 'map' },
    symbol:  { label: '그림 보고 나라 고르기', kind: 'choice', hasOptions: true, axis: 'symbol' },
    place:   { label: '명소 보고 나라 고르기', kind: 'choice', hasOptions: true, axis: 'place' }
  };

  function availableMode(mode) {
    if (!MODES[mode]) return 'choice4';
    if ((mode === 'symbol' || mode === 'place') && (!FQ.features || !FQ.features.on('art'))) return 'choice4';
    return mode;
  }

  var LEVEL_LABEL = { 1: '쉬움', 2: '보통', 3: '어려움' };

  function all() { return FQ.countries || []; }

  // 혼동군은 축을 넘겨 연결된다. 나중에 자료를 주입하는 환경도 지원한다.
  var indexedGroups = null;
  var confusionIndex = {};
  function confusionSet(code) {
    var groups = FQ.confusionGroups || [];
    if (groups !== indexedGroups) {
      indexedGroups = groups;
      confusionIndex = {};
      groups.forEach(function (group) {
        group.codes.forEach(function (a) {
          var set = confusionIndex[a] || (confusionIndex[a] = {});
          group.codes.forEach(function (b) { if (a !== b) set[b] = true; });
        });
      });
    }
    return confusionIndex[code] || {};
  }

  function hasData(country, axis) {
    if (axis !== 'symbol' && axis !== 'place') return true;
    var subject = FQ.subjects && FQ.subjects[country.code] && FQ.subjects[country.code][axis];
    // noArt 는 원장에 적힌 보류다. 문장만 있고 그림 파일이 없어, 출제하면 아이가 빈 그림을 보고 못 푼다.
    return !!subject && !subject.noArt;
  }

  function byCode(code) {
    var list = all();
    for (var i = 0; i < list.length; i++) if (list[i].code === code) return list[i];
    return null;
  }

  /** 난이도/대륙 조건에 맞는 나라 목록 */
  function pool(opts) {
    opts = opts || {};
    var list = all().filter(function (c) {
      if (opts.continent && opts.continent !== 'all' && c.continent !== opts.continent) return false;
      if (opts.level && opts.level !== 'all') {
        var max = parseInt(opts.level, 10);
        if (!(c.level <= max)) return false;
      }
      return true;
    });
    if (opts.only && opts.only.length) {
      var set = {};
      opts.only.forEach(function (c) { set[c] = true; });
      list = all().filter(function (c) { return set[c.code]; });
    }
    return list.filter(function (c) { return hasData(c, opts.axis); });
  }

  /** 정답과 헷갈릴 만한 오답 보기를 고른다. */
  function distractors(answer, count, source, mode, opts) {
    opts = opts || {};
    var axis = opts.axis || (MODES[mode] && MODES[mode].axis);
    var art = axis === 'symbol' || axis === 'place';
    // 자료 필터는 후보·폴백·혼동군 완화 뒤에도 항상 유지한다.
    // 판단은 hasData() 한 곳에만 둔다. FQ.subjects 의 축 문장과 noArt(보류) 조건을 여기에
    // 인라인으로 복제하면 조건이 늘 때 한쪽만 고쳐 그림 없는 나라가 보기로 올라온다.
    var fallbackPool = all().filter(function (c) { return hasData(c, axis); });
    // 수도 놀이의 보기도 국기(나라)이므로 나라 중복만 막으면 된다 — 수도 이름 특례는 필요 없다(2026-09-17).
    var candidates = (source && source.length >= count + 1 ? source : fallbackPool).filter(function (c) {
      return c.code !== answer.code && hasData(c, axis);
    });

    // 보기 거리(D24). 'near'(기본)는 같은 세부 지역부터 — 국기 놀이의 원래 규칙이다.
    // 수도 놀이는 익힌 정도에 따라 'far'(다른 대륙부터) → 'mid'(같은 대륙·다른 지역부터) → 'near' 로 좁힌다.
    // 처음 배우는 아이에게 "베를린" 을 들려주고 독일·프랑스·네덜란드·벨기에 국기 중 고르게 하는 것은 최고 난도라서다.
    var spread = opts.spread || 'near';
    function tier(c) {
      if (spread === 'far' || spread === 'mid') {
        var sameContinent = c.continent === answer.continent;
        var sameRegion = sameContinent && c.region === answer.region;
        if (sameRegion) return 2;
        if (spread === 'far') return sameContinent ? 1 : 0;
        return sameContinent ? 0 : 1;
      }
      if (c.region === answer.region) return 0;              // 같은 세부 지역이 가장 헷갈린다
      if (c.continent === answer.continent) return 1;
      if (c.level === answer.level) return 2;
      return 3;
    }

    var buckets = [[], [], [], []];
    candidates.forEach(function (c) { buckets[tier(c)].push(c); });

    var out = [];
    var usedCode = {};
    usedCode[answer.code] = true;

    function take(c, relaxConfusion) {
      if (usedCode[c.code]) return false;
      if (art && !relaxConfusion && Object.keys(usedCode).some(function (code) {
        return confusionSet(code)[c.code];
      })) return false;
      usedCode[c.code] = true;
      out.push(c);
      return true;
    }

    for (var t = 0; t < buckets.length && out.length < count; t++) {
      var picked = util.shuffle(buckets[t]);
      for (var i = 0; i < picked.length && out.length < count; i++) take(picked[i]);
    }
    // 그래도 모자라면 전체에서 채운다
    if (out.length < count) {
      var rest = util.shuffle(fallbackPool);
      for (var j = 0; j < rest.length && out.length < count; j++) take(rest[j]);
    }
    if (art && out.length < count) {
      var relaxed = util.shuffle(fallbackPool);
      for (var k = 0; k < relaxed.length && out.length < count; k++) take(relaxed[k], true);
    }
    return out.slice(0, count);
  }

  /** 한 문제를 만든다. */
  function makeQuestion(answer, mode, source, opts) {
    var q = { mode: mode, country: answer, options: null };
    if (mode === 'map') {
      q.options = FQ.map.chooseOptions(answer, source, FQ.map.MIN_WIDTH);
    } else if (MODES[mode] && MODES[mode].hasOptions) {
      var choices = distractors(answer, 3, source, mode, opts).concat([answer]);
      q.options = util.shuffle(choices);
    }
    return q;
  }

  /**
   * 이름 길이에 따라 봐줄 수 있는 발음·오타 차이 (자모 기준).
   * 아이가 말한 것이니 넉넉하게 인정한다.
   */
  function allowedSlip(len) {
    if (len <= 4) return 0;     // 가나, 페루, 쿠바처럼 아주 짧은 이름 — 그대로 말해야 한다.
                                // 한 글자만 봐줘도 "하나 만 더" 의 '하나' 가 가나로 잡힌다.
    if (len <= 6) return 1;     // 미국, 인도, 몰타 정도.
                                // 더 봐주면 "아 맞다" 가 몰타로, "또 할래" 가 말리로 잡힌다.
    if (len <= 10) return 2;    // 프랑스, 브라질, 필리핀 정도
    if (len <= 15) return 3;    // 인도네시아, 슬로바키아 정도
    return 4;                   // 보스니아헤르체고비나처럼 긴 이름
  }

  /**
   * 아이가 "모른다" 거나 "이게 뭐야?" 하고 물어볼 때 쓰는 말들.
   * 이런 말이 들리면 나라 이름을 한 번 읽어 주고 국기 특징을 알려 준다.
   *
   * 낱말이 들어 있는지로 보기 때문에 "아빠 이거 뭐야?", "에이 나 모르겠네" 처럼
   * 앞뒤에 다른 말이 붙어도 알아본다. 나라 이름 중에 이 말이 들어간 것은 없다.
   */
  var GIVE_UP_MARKS = [
    // 모른다
    '몰라', '모르겠', '모릅니', '모르는데', '기억안나', '기억이안나', '생각안나', '생각이안나',
    // 물어본다
    '뭐지', '뭐야', '뭐예요', '뭐에요', '뭔가요', '뭘까', '뭐냐', '뭐임', '무엇',
    '어디야', '어디지', '어디예요', '어느나라', '무슨나라',
    '알려줘', '알려주세요', '가르쳐', '답이뭐', '정답이뭐',
    // 넘어간다
    '패스', '넘어가', '스킵', '다음문제', '다음이요'
  ];

  /** 모른다고 하거나 무엇인지 물어보는 말인가 */
  function isGiveUp(text) {
    var n = util.normalize(text);
    if (!n) return false;
    if (n === '다음') return true;
    for (var i = 0; i < GIVE_UP_MARKS.length; i++) {
      if (n.indexOf(GIVE_UP_MARKS[i]) !== -1) return true;
    }
    return false;
  }

  /* 이름 뒤에 흔히 붙는 조사·말끝. 낱말 끝에서만 떼어 본다. */
  var TAILS = ['입니다', '이에요', '인가요', '이랑', '이요', '예요', '이야', '이다', '인가',
               '하고', '까지', '부터', '으로', '에서', '에게', '한테',
               '요', '은', '는', '이', '가', '을', '를', '도', '만', '랑', '과', '와', '의', '로', '에'];

  /** 낱말 끝의 조사를 떼어 본다. 떼고 나서 너무 짧아지면 그대로 둔다. */
  function stripTail(word) {
    for (var i = 0; i < TAILS.length; i++) {
      var t = TAILS[i];
      if (word.length > t.length + 1 && word.slice(-t.length) === t) {
        return word.slice(0, word.length - t.length);
      }
    }
    return word;
  }

  /**
   * 말한 내용을 낱말로 쪼개고, 이어지는 낱말들을 묶어 견줄 후보를 만든다.
   *
   *   "음 그러니까 브라질이요" → "음", "그러니까", "브라질이요"("브라질"),
   *                             "음그러니까", "그러니까브라질이요", …
   *
   * 낱말 단위로 견주기 때문에 "에이 모르겠네" 안의 조각이 나라 이름으로
   * 잘못 잡히지 않는다.
   */
  function candidateKeys(text) {
    var raw = String(text || '').split(/[\s.,!?…·:;'"()\[\]{}~\-]+/);
    var words = [];
    for (var i = 0; i < raw.length; i++) {
      var w = util.normalize(raw[i]);
      if (w) words.push(w);
    }
    var keys = [];
    var seen = {};
    function add(str) {
      if (!str) return;
      var key = util.compareKey(str);
      if (!key || seen[key]) return;
      seen[key] = true;
      keys.push(key);
    }
    function addLatin(str) {
      // 받아쓰기가 한국말을 로마자로 적어 보낸 경우 ("시리아" → "Siri야")
      if (!str || !util.hasLatin(str)) return;
      var key = util.latinToJamo(str);
      if (!key || seen[key]) return;
      seen[key] = true;
      keys.push(key);
    }
    // 이어지는 낱말 1~4개를 묶어 본다 (세인트빈센트그레나딘처럼 여러 낱말인 이름 때문)
    for (var a = 0; a < words.length; a++) {
      var joined = '';
      for (var b = a; b < words.length && b < a + 4; b++) {
        joined += words[b];
        add(joined);
        add(stripTail(joined));
        addLatin(joined);
        addLatin(stripTail(joined));
      }
    }
    if (!keys.length) add(util.normalize(text));
    return keys;
  }

  /** 같은 이름을 두세 번 이어 말한 것까지 헤아려 가장 가까운 거리를 잰다. */
  function keyDistance(runKey, nameKey, allowed) {
    var best = Infinity;
    var repeated = nameKey;
    for (var k = 1; k <= 3; k++) {
      if (k > 1) repeated += nameKey;
      // 길이 차이만으로 이미 허용치를 넘으면 계산할 필요가 없다
      if (Math.abs(runKey.length - repeated.length) > allowed) continue;
      var d = util.editDistance(runKey, repeated);
      if (d < best) best = d;
      if (best === 0) break;
    }
    return best;
  }

  /**
   * 아이가 말한(쓴) 내용이 이 나라의 이름과 얼마나 맞아떨어지는지 잰다.
   *
   * 앞뒤에 다른 말이 붙어도("음… 브라질이요"), 두 번 말해도("브라질 브라질"),
   * 살짝 틀리게 말해도("브라찔") 인정한다.
   *
   *   near      인정할 만큼 가깝다
   *   strength  맞아떨어진 이름의 길이. 여러 나라가 걸릴 때 어느 쪽이 더 구체적인지
   *             가른다. (예: "인도네시아" 는 '인도' 보다 '인도네시아')
   */
  function matchOne(country, keys, norm) {
    var names = (country.aliases || []).concat([country.ko, country.en]);
    var out = { strength: -1, dist: Infinity, name: null, exact: false, near: false };
    for (var i = 0; i < names.length; i++) {
      var nm = names[i];
      if (!nm) continue;
      var nameKey = util.compareKey(nm);
      if (!nameKey) continue;
      var allowed = allowedSlip(nameKey.length);
      var exact = util.normalize(nm) === norm;
      var dist = Infinity;
      if (exact) dist = 0;
      else {
        for (var j = 0; j < keys.length; j++) {
          var d = keyDistance(keys[j], nameKey, allowed);
          if (d < dist) dist = d;
          if (dist === 0) break;
        }
      }
      var near = dist <= allowed;
      var strength = near ? nameKey.length - dist : -1;
      if (strength > out.strength || (strength === out.strength && dist < out.dist)) {
        out = { strength: strength, dist: dist, name: nm, exact: exact, near: near };
      }
    }
    return out;
  }

  /**
   * 말한 내용이 어느 나라를 가리키는지 찾는다.
   * 걸리는 나라가 없거나 둘 이상이 똑같이 걸리면 null 을 돌려준다.
   * 웅얼거림이나 나라 이름이 아닌 말에는 null 이 나온다.
   */
  function findCountry(text) {
    var norm = util.normalize(text);
    if (!norm) return null;
    var keys = candidateKeys(text);
    var list = all();
    var best = null, bestStrength = -1, bestDist = Infinity, bestExact = false, tie = false;
    for (var i = 0; i < list.length; i++) {
      var m = matchOne(list[i], keys, norm);
      if (!m.near) continue;
      // checkText 와 같은 규칙을 쓴다. 낱말 그대로 맞은 쪽이 긴 이름보다 먼저다.
      // 두 판정이 어긋나면 "어 가나" 를 정답으로 채점하면서 안내는 '우간다라고 했구나' 가 된다.
      var exact = m.dist === 0;
      var wins = exact !== bestExact ? exact
        : (m.strength > bestStrength || (m.strength === bestStrength && m.dist < bestDist));
      if (wins) {
        bestStrength = m.strength; bestDist = m.dist; bestExact = exact; best = list[i]; tie = false;
      } else if (exact === bestExact && m.strength === bestStrength && m.dist === bestDist && best && list[i].code !== best.code) {
        tie = true;
      }
    }
    return tie ? null : best;
  }

  /* ---------------- 소리 닮은꼴·앞부분 인정 (말로 답하기, D25) ---------------- */

  // 194개국 이름·별칭의 자모 키 목록과 '앞부분이 겹치는 나라' 표. FQ.countries 가 바뀌면 다시 만든다.
  var indexedList = null;
  var nameIndex = [];
  var prefixRiskyByCode = {};
  function names() {
    var list = all();
    if (list !== indexedList) {
      indexedList = list;
      nameIndex = [];
      list.forEach(function (c) {
        (c.aliases || []).concat([c.ko]).forEach(function (n) {
          var key = util.compareKey(n);
          if (key) nameIndex.push({ code: c.code, key: key });
        });
      });
      prefixRiskyByCode = {};
      nameIndex.forEach(function (a) {
        if (prefixRiskyByCode[a.code]) return;
        for (var i = 0; i < nameIndex.length; i++) {
          var b = nameIndex[i];
          if (b.code !== a.code && b.key.length > a.key.length && b.key.indexOf(a.key) === 0) {
            prefixRiskyByCode[a.code] = true;
            break;
          }
        }
      });
    }
    return nameIndex;
  }

  /** 이 나라 이름이 다른 나라 이름의 앞부분인가 (인도 ⊂ 인도네시아, 기니 ⊂ 기니비사우). 그런 나라는 말을 끝까지 듣고 채점한다. */
  function prefixRisky(country) {
    names();
    return !!(country && prefixRiskyByCode[country.code]);
  }

  /** 이 앞부분으로 시작하는 이름이 이 나라 것뿐인가 */
  function uniquePrefix(key, code) {
    var list = names();
    for (var i = 0; i < list.length; i++) {
      if (list[i].code !== code && list[i].key.indexOf(key) === 0) return false;
    }
    return true;
  }

  /**
   * 목표 나라만 소리 기준으로 한 번 더 본다. 다른 나라 이름이 하나도 걸리지 않았을 때만 부른다(checkText).
   *   소리 닮은꼴  '캐냐'→케냐, '구바'→쿠바 처럼 초성·중성·받침 묶음이 같으면 같은 소리로 본다 (허용 오차는 엄격 채점과 같다)
   *   앞부분      세 음절 이상을 말했고 그것으로 시작하는 이름이 이 나라뿐이면 인정 ('사우디아라'→사우디아라비아, '오스트레일리'→오스트레일리아)
   *               '도미니카'(공화국·연방 둘 다)·'오스트'(오스트리아·오스트레일리아 둘 다)·'사우'(두 음절)는 인정하지 않는다
   * 인정하면 { name: 인정한 이름, sound: 소리 거리(앞부분 인정은 -1) } 을, 아니면 null 을 돌려준다.
   */
  function soundsLike(country, keys) {
    if (!country || !keys) return null;
    var list = (country.aliases || []).concat([country.ko]);
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var nameKey = util.compareKey(list[i]);
      if (!nameKey) continue;
      var nameSound = util.soundKey(nameKey);
      var allowed = allowedSlip(nameKey.length);
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j];
        if (!k) continue;
        if (Math.abs(k.length - nameKey.length) <= allowed) {
          var d = util.editDistance(util.soundKey(k), nameSound);
          if (d <= allowed && (!best || d < best.sound)) best = { name: list[i], sound: d };
          if (best && best.sound === 0) return best;
        }
        if (!best && k.length < nameKey.length && util.vowelCount(k) >= 3 && nameKey.indexOf(k) === 0 && uniquePrefix(k, country.code)) {
          best = { name: list[i], sound: -1 };
        }
      }
    }
    return best;
  }

  /**
   * 자유 입력(말하기/쓰기) 채점.
   * 넉넉하게 인정하되, 다른 나라가 더 잘 맞아떨어지면 정답으로 치지 않는다.
   * (니제르 ↔ 나이지리아, 인도 ↔ 인도네시아 같은 사고 방지)
   */
  function checkText(answer, text) {
    var norm = util.normalize(text);
    var result = { correct: false, exact: false, lenient: false, score: 0, matched: null, confusedWith: null };
    if (!norm) return result;
    var keys = candidateKeys(text);

    var mine = matchOne(answer, keys, norm);
    result.matched = mine.name;
    result.exact = mine.exact;
    result.score = mine.near ? (mine.strength / (mine.strength + mine.dist)) : 0;
    if (mine.exact) { result.correct = true; return result; }

    // 다른 나라 이름을 말한 것은 아닌지 확인한다
    var list = all();
    var rivalStrength = -1, rivalDist = Infinity, rival = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].code === answer.code) continue;
      var r = matchOne(list[i], keys, norm);
      if (!r.near) continue;
      if (r.exact) { rivalStrength = Infinity; rivalDist = 0; rival = list[i]; break; }
      if (r.strength > rivalStrength || (r.strength === rivalStrength && r.dist < rivalDist)) {
        rivalStrength = r.strength; rivalDist = r.dist; rival = list[i];
      }
    }

    // 어느 쪽이 '낱말 그대로' 맞았는지를 이름 길이보다 먼저 본다.
    // 후보 키는 이어지는 낱말을 붙여 만들기 때문에, 말머리가 붙으면 "어 가나" 에서
    // '어가나' 라는 가짜 낱말이 생겨 우간다로 걸린다. 이름이 더 길다는 이유만으로
    // 넘겨주면 딱 맞은 '가나' 가 오답이 된다. ("음 수단"→남수단, "아 파키스탄"→아프가니스탄도 같다)
    // 아이 말에는 "어…", "아…", "음…" 이 늘 붙으니 딱 맞은 쪽을 살려야 한다.
    var rivalWins;
    if (rivalStrength === Infinity) rivalWins = true;              // 말 전체가 라이벌 이름이다
    else if (mine.dist === 0 && rivalDist > 0) rivalWins = false;   // 정답만 낱말 그대로 맞았다
    else if (rivalDist === 0 && mine.dist > 0) rivalWins = true;    // 라이벌만 낱말 그대로 맞았다
    else rivalWins = rivalStrength > mine.strength ||               // 둘 다 같은 만큼 맞았으면 긴 이름이 이긴다
                     (rivalStrength === mine.strength && rivalDist <= mine.dist);
    if (!mine.near || rivalWins) {
      // 목표 나라만 소리 닮은꼴·앞부분으로 한 번 더 본다(D25). 다른 나라 이름이 낱말 그대로 걸렸으면 밟지 않고,
      // 비슷하게만 걸렸을 때('부단' 에 수단이 가깝다)는 목표 나라가 소리로 정확히 같을 때만 인정한다('부단'→부탄).
      var rivalExact = rivalStrength === Infinity || rivalDist === 0;
      if (!rivalExact) {
        var alike = soundsLike(answer, keys);
        if (alike && (!rival || alike.sound === 0)) {
          result.correct = true;
          result.lenient = true;
          result.matched = alike.name;
          if (!result.score) result.score = 0.5;
          return result;
        }
      }
      if (rival) result.confusedWith = rival;
      return result;
    }
    result.correct = true;
    return result;
  }

  /* ---------------- 수도 놀이 학습 규칙 (D24) ----------------
   * 그림·명소·지도는 D15(가중치 + 3문제 뒤 한 번 다시 만나기) 그대로다. 수도 축만 이 규칙을 탄다.
   *   newPerGame   한 판에 처음 만나는 나라 수의 한도 — 한 번에 외울 양을 줄인다
   *   gaps         처음 만난 나라를 같은 판에서 다시 내는 간격(사이에 낀 문제 수) — 1문제 뒤, 3문제 뒤, 그리고 판 끝
   *   maxAsks      한 나라를 한 판에 내는 횟수 상한 (계획 4 + 틀렸을 때 1)
   *   spreadFor    보기(오답 국기)의 거리 — 그 축 기록의 연속 정답 수로 정한다(distractors 의 opts.spread)
   *   reviewWeight 복습 순서 가중치 — 틀렸거나 한 번밖에 못 맞힌 나라가 먼저 흔들린다
   */
  var LEARN = {
    capital: {
      newPerGame: function (total) { return total <= 5 ? 2 : total <= 15 ? 3 : total <= 30 ? 4 : 5; },
      gaps: [1, 3],
      maxAsks: 5,
      spreadFor: function (record) {
        var streak = record ? (record.streak || 0) : 0;
        if (streak >= 5) return 'near';
        if (streak >= 2) return 'mid';
        return 'far';
      },
      reviewWeight: function (record) {
        var r = record || {};
        var streak = r.streak || 0, wrong = r.wrong || 0;
        if (wrong > 0 && streak < 2) return 3.0;   // 틀렸고 아직 안 굳었다
        if (streak <= 1) return 2.0;                // 한 번 맞힌 것이 가장 먼저 흔들린다
        if (streak <= 4) return 1.4;
        return 0.6;                                 // 잘 아는 나라도 가끔은
      }
    }
  };

  /**
   * 수도 놀이 한 판의 문제 순서(D24). 새 나라는 '소개 → 1문제 뒤 → 3문제 뒤 → 판 끝' 리듬으로 여러 번 내고,
   * 남는 자리는 복습(이미 만난 나라)으로 채운다. 총 문제 수는 target 을 넘지 않고, 낼 것이 없으면 짧아진다.
   * 같은 나라가 연달아 나오지는 않는다. 자리마다 { country, kind: 'intro' | 'again' | 'review' } 를 돌려준다.
   */
  function planSession(rule, freshList, reviewList, target) {
    var slots = [];
    var fresh = freshList.slice(), review = reviewList.slice();
    var pending = [];   // 다시 내기를 기다리는 새 나라 { country, due, step, last }
    var endQueue = [];  // 간격 계단을 다 오른 새 나라 — 판 끝에 한 번 더
    function notAdjacent(country) {
      return !slots.length || slots[slots.length - 1].country.code !== country.code;
    }
    function byDue(a, b) { return a.due - b.due; }
    function byLast(a, b) { return a.last - b.last; }
    function placeAgain(p) {
      var i = slots.length;
      slots.push({ country: p.country, kind: 'again' });
      p.step += 1;
      p.last = i;
      if (p.step < rule.gaps.length) {
        p.due = i + 1 + rule.gaps[p.step];
      } else {
        pending.splice(pending.indexOf(p), 1);
        endQueue.push(p);
      }
    }
    function placeEnd(p) {
      slots.push({ country: p.country, kind: 'again' });
      endQueue.splice(endQueue.indexOf(p), 1);
    }
    while (slots.length < target) {
      var i = slots.length;
      // 1) 때가 된 다시 만나기 — 먼저 때가 된 것부터
      var due = pending.filter(function (p) { return p.due <= i && notAdjacent(p.country); }).sort(byDue)[0];
      if (due) { placeAgain(due); continue; }
      // 2) 새 나라 소개 — 첫 다시 만나기는 gaps[0] 문제 뒤
      if (fresh.length) {
        var c = fresh.shift();
        slots.push({ country: c, kind: 'intro' });
        pending.push({ country: c, due: i + 1 + rule.gaps[0], step: 0, last: i });
        continue;
      }
      // 3) 복습 — 판 끝 다시 만나기보다 먼저다. 어제 만난 나라를 오늘 흔드는 쪽이 오래 남는다.
      if (review.length) { slots.push({ country: review.shift(), kind: 'review' }); continue; }
      // 4) 채울 것이 없으면 아직 때가 안 된 다시 만나기를 당겨서라도 낸다 (연달아는 안 됨)
      var early = pending.filter(function (p) { return notAdjacent(p.country); }).sort(byDue)[0];
      if (early) { placeAgain(early); continue; }
      // 5) 간격 계단을 다 오른 새 나라를 판 끝에 한 번 더 — 가장 오래전에 만난 나라부터
      var endReady = endQueue.filter(function (p) { return notAdjacent(p.country); }).sort(byLast);
      if (endReady.length) { placeEnd(endReady[0]); continue; }
      break;   // 더 낼 것이 없다 — 판이 짧아진다
    }
    return slots;
  }

  /* ---------------- 한 판(게임) ---------------- */
  function createGame(config) {
    var cfg = Object.assign({
      mode: 'choice4',
      level: 'all',
      continent: 'all',
      count: 10,
      players: ['민규'],
      reviewFirst: true,
      only: null
    }, config || {});

    cfg.mode = availableMode(cfg.mode);
    var axis = MODES[cfg.mode].axis;
    var only = cfg.only && cfg.only.length ? cfg.only : null;
    var source = pool({ level: cfg.level, continent: cfg.continent, only: only, axis: axis });
    // only 목록(다시 살펴볼 나라)에서 자료 없는 나라는 빠진다. 전부 빠졌다고 조용히 전역 풀로 바꾸면
    // 아이가 고른 적 없는 엉뚱한 나라가 나오므로, 무엇을 뺐고 어디로 대신 갔는지 game 에 남겨 호출자가 알게 한다.
    var fallback = null;
    var skipped = only ? only.filter(function (code) {
      var c = byCode(code);
      return !c || !hasData(c, axis);
    }) : [];
    if (only && source.length === 0) {
      fallback = 'only';
      source = pool({ level: cfg.level, continent: cfg.continent, axis: axis });
    }
    if (source.length === 0) { fallback = fallback || 'filters'; source = pool({ axis: axis }); }

    var total = cfg.count === 'all' ? source.length : Math.min(cfg.count, source.length);
    if (total < 1) total = Math.min(1, source.length);

    var learn = LEARN[axis] || null;
    function axisRecords() {
      return (FQ.storage && FQ.storage.allAxisStats) ? (FQ.storage.allAxisStats(axis) || {}) : {};
    }

    var order, questions, plannedAgain = 0;
    if (learn) {
      /* ---- 수도 놀이(D24) ----
       * 처음 만나는 나라는 한 판에 한도(10문제 3개)만큼만 뽑고, 각각 '소개 → 1문제 뒤 → 3문제 뒤 → 판 끝' 리듬으로 낸다.
       * 남는 자리는 이미 만난 나라의 복습이다 — 틀렸거나 한 번밖에 못 맞힌 나라부터. 새 나라 고르기는 무작위다.
       * 보기는 문제가 화면에 오를 때 만든다(current) — 그 순간의 기록으로 보기 거리(far·mid·near)를 정하기 위해서다.
       */
      var recs = axisRecords();
      var fresh = [], met = [];
      source.forEach(function (c) {
        var r = recs[c.code];
        (r && (r.seen || 0) > 0 ? met : fresh).push(c);
      });
      var target = cfg.count === 'all' ? source.length : Math.max(1, parseInt(cfg.count, 10) || 1);
      var cap = learn.newPerGame(target);
      // 복습이 밀리면 새 나라를 하나 줄인다 — 안 굳은 나라(복습 가중치 2 이상)가 한도의 두 배(10문제 6개) 이상일 때.
      var fragile = met.filter(function (c) { return learn.reviewWeight(recs[c.code]) >= 2; }).length;
      if (cap > 1 && fragile >= cap * 2) cap -= 1;
      var picked = util.sample(fresh, Math.min(fresh.length, cap));
      var reviewOrder = [];
      if (cfg.reviewFirst) {
        var left = met.slice();
        while (left.length) {
          var ws = left.map(function (c) { return learn.reviewWeight(recs[c.code]); });
          var pick = util.weightedPick(left, ws);
          reviewOrder.push(pick);
          left = left.filter(function (c) { return c.code !== pick.code; });
        }
      } else {
        reviewOrder = util.shuffle(met);
      }
      var plan = planSession(learn, picked, reviewOrder, target);
      order = plan.map(function (slot) { return slot.country; });
      questions = plan.map(function (slot) {
        return { mode: cfg.mode, country: slot.country, options: null, again: slot.kind === 'again', review: slot.kind === 'review' };
      });
      plannedAgain = questions.filter(function (q) { return q.again; }).length;
    } else {
      // 출제 순서 정하기: 오답 우선이면 가중치로, 아니면 골고루 섞어서.
      // 국기 축은 countries 의 weightOf, 새 축(그림·명소·지도)은 자기 axes 버킷만 읽는 axisWeightOf 를 쓴다 (D6: 축을 섞지 않는다).
      var weightFor = null;
      if (cfg.reviewFirst && FQ.storage) {
        if (axis === 'flag' && FQ.storage.weightOf) {
          weightFor = function (c) { return FQ.storage.weightOf(c.code); };
        } else if (axis !== 'flag' && FQ.storage.axisWeightOf) {
          weightFor = function (c) { return FQ.storage.axisWeightOf(axis, c.code); };
        }
      }
      if (weightFor && source.length > total) {
        var remaining = source.slice();
        order = [];
        while (order.length < total && remaining.length) {
          var weights = remaining.map(weightFor);
          var chosen = util.weightedPick(remaining, weights);
          order.push(chosen);
          remaining = remaining.filter(function (c) { return c.code !== chosen.code; });
        }
      } else {
        order = util.sample(source, total);
      }
      questions = order.map(function (c) { return makeQuestion(c, cfg.mode, source, { axis: axis }); });
    }

    /* ---- 한 판 안에서 다시 만나기 (새 축 전용, D15) ----
     * 그림·명소·지도는 아이가 처음 보는 쌍이 많다. 처음 만난 쌍과 틀린 쌍은 같은 판에서 3문제 뒤에
     * 한 번 더 낸다. 총 문제 수는 그대로다 — 아직 안 만난 원래 문제 하나를 뒤에서 빼고 그 자리를 쓴다.
     * 국기 축은 여기에 들어오지 않는다. 국기 한 판은 "같은 나라가 두 번 안 나온다" 가 약속이다.
     * 수도 축은 위의 계획(D24)이 다시 만나기를 미리 깔아 두므로 여기서는 틀린 문제만 다룬다(scheduleSoon).
     */
    var revisit = axis !== 'flag' && !learn;
    var firstMeet = {};
    if (revisit) {
      var records = axisRecords();
      order.forEach(function (c) {
        var r = records[c.code];
        firstMeet[c.code] = !(r && (r.seen || 0) > 0);
      });
    }

    var game = {
      config: cfg,
      source: source,
      questions: questions,
      fallback: fallback,   // null | 'only' (only 목록이 전부 자료 없음) | 'filters' (난이도·대륙 조건에 맞는 나라 없음)
      skipped: skipped,     // only 목록에서 자료가 없어 뺀 나라 코드
      againCount: plannedAgain,  // 이 판에서 다시 만나기로 잡은 문제 수 (수도 놀이는 계획된 것부터 센다)
      index: 0,
      streak: 0,
      bestStreak: 0,
      score: 0,
      bonusScore: 0,
      correct: 0,
      wrong: [],
      hintsUsed: 0,
      answered: {},
      startedAt: Date.now(),
      turn: 0,
      players: cfg.players.slice(),
      playerScores: cfg.players.map(function () { return { score: 0, correct: 0, asked: 0 }; })
    };

    game.total = questions.length;
    /** 수도 놀이의 보기는 문제가 화면에 오를 때 만든다 — 그 순간의 기록(연속 정답)으로 보기 거리를 정한다(D24). */
    function materialize(q) {
      if (!q || q.options || !(MODES[cfg.mode] && MODES[cfg.mode].hasOptions)) return q;
      var record = learn ? axisRecords()[q.country.code] : null;
      q.options = makeQuestion(q.country, cfg.mode, source, { axis: axis, spread: learn ? learn.spreadFor(record) : undefined }).options;
      return q;
    }
    game.current = function () { return materialize(game.questions[game.index] || null); };
    game.currentPlayer = function () { return game.players[game.turn % game.players.length]; };
    game.currentPlayerIndex = function () { return game.turn % game.players.length; };
    game.isLast = function () { return game.index >= game.questions.length - 1; };
    game.isOver = function () { return game.index >= game.questions.length; };

    var AGAIN_GAP = 3;
    var againDone = {};
    /**
     * 지금 문제의 나라를 3문제 뒤에 한 번 더 낸다. 판이 그보다 짧으면 마지막 자리에, 바로 다음 자리뿐이면 내지 않는다.
     * 쌍마다 한 판에 한 번만. 이미 잡아 둔 다시 만나기는 자리를 내주지 않는다.
     */
    function scheduleAgain(country) {
      if (!revisit || againDone[country.code]) return false;
      var i = game.index;
      var len = game.questions.length;
      var at = Math.min(i + AGAIN_GAP, len - 1);
      if (at - i < 2) return false;
      var drop = -1;
      for (var k = len - 1; k > i; k--) {
        if (!game.questions[k].again) { drop = k; break; }
      }
      if (drop === -1) return false;
      game.questions.splice(drop, 1);
      var q = makeQuestion(country, cfg.mode, source, { axis: axis });
      q.again = true;
      game.questions.splice(Math.min(at, game.questions.length), 0, q);
      againDone[country.code] = true;
      game.againCount += 1;
      return true;
    }

    /**
     * 수도 놀이(D24): 틀렸거나 나라 이름까지 듣고서야 맞힌 문제는 1문제 뒤에 한 번 더 낸다.
     * 복습 자리 하나를 뒤에서 빼서 쓰므로 총 문제 수는 그대로다. 복습 자리가 없거나(새 나라만 있는 판),
     * 곧 그 나라가 어차피 나오거나, 한 판 상한(maxAsks)에 닿았거나, 사이에 낄 문제가 없으면 내지 않는다.
     */
    function scheduleSoon(country) {
      if (!learn) return false;
      var asks = game.questions.filter(function (q) { return q.country.code === country.code; }).length;
      if (asks >= learn.maxAsks) return false;
      var i = game.index;
      var len = game.questions.length;
      var at = i + 2;
      if (at > len - 1) return false;
      for (var k = i + 1; k <= at; k++) if (game.questions[k].country.code === country.code) return false;
      var drop = -1;
      for (var d = len - 1; d > i; d--) {
        if (game.questions[d].review) { drop = d; break; }
      }
      if (drop === -1) return false;
      game.questions.splice(drop, 1);
      game.questions.splice(at, 0, { mode: cfg.mode, country: country, options: null, again: true, review: false });
      game.againCount += 1;
      return true;
    }

    /**
     * 답을 채점하고 게임 상태를 갱신한다.
     * payload: {code: '선택한 나라 코드'} 또는 {text: '말하거나 쓴 답'}
     * opts.revealed: 힌트 2단계로 나라 이름('○○의 수도예요')까지 듣고 답했다(수도 놀이). 점수는 주되 기록은 '아직'이다.
     */
    game.submit = function (payload, usedHint, opts) {
      var q = game.current();
      if (!q || game.answered[game.index]) return null;
      game.answered[game.index] = true;
      var res;
      if (payload && typeof payload.code === 'string') {
        res = {
          correct: payload.code === q.country.code,
          exact: payload.code === q.country.code,
          picked: byCode(payload.code),
          confusedWith: payload.code === q.country.code ? null : byCode(payload.code)
        };
      } else {
        res = checkText(q.country, (payload && payload.text) || '');
        res.picked = null;
      }

      var pi = game.currentPlayerIndex();
      game.playerScores[pi].asked += 1;

      // 나라 이름까지 듣고 맞힌 답(수도 놀이 힌트 2단계)은 아이에게는 정답이지만 기록에는 '아직 모른다'로 남긴다(D24).
      var revealed = !!(opts && opts.revealed);
      var learned = !!res.correct && !revealed;
      res.learned = learned;

      if (res.correct) {
        game.correct += 1;
        game.streak += 1;
        if (game.streak > game.bestStreak) game.bestStreak = game.streak;
        var gained = 10 + (game.streak >= 3 ? 5 : 0);
        if (gained < 1) gained = 1;
        game.score += gained;
        game.playerScores[pi].score += gained;
        game.playerScores[pi].correct += 1;
        res.gained = gained;
      } else {
        game.streak = 0;
        res.gained = 0;
      }
      // 다시 만난 문제를 또 틀려도 '한 번 더 만날 나라' 에는 한 번만 싣는다
      if (!learned && !game.wrong.some(function (c) { return c.code === q.country.code; })) game.wrong.push(q.country);
      if (usedHint) game.hintsUsed += 1;
      if (FQ.storage) FQ.storage.recordAnswer(q.country.code, learned, MODES[cfg.mode] && MODES[cfg.mode].axis);
      res.question = q;
      res.again = !!q.again;
      if (learn) {
        // 수도 놀이: 계획된 다시 만나기 위에, 틀렸거나 나라 이름까지 들은 문제만 1문제 뒤에 한 번 더.
        res.scheduledAgain = !learned ? scheduleSoon(q.country) : false;
      } else {
        // 처음 만난 쌍이거나 틀린 쌍이면 3문제 뒤에 한 번 더 (새 축만). 다시 만난 문제 자체는 또 잡지 않는다.
        res.scheduledAgain = !q.again && (!res.correct || firstMeet[q.country.code]) ? scheduleAgain(q.country) : false;
      }
      return res;
    };

    /** 보물상자처럼 문제 밖에서 생기는 보너스 점수를 더한다 */
    game.addBonus = function (points) {
      var n = Number(points) || 0;
      if (n <= 0) return;
      game.score += n;
      game.playerScores[game.currentPlayerIndex()].score += n;
      game.bonusScore += n;
    };

    game.next = function () {
      game.index += 1;
      game.turn += 1;
      return game.current();
    };

    game.summary = function () {
      return {
        mode: cfg.mode,
        total: game.total,
        correct: game.correct,
        score: game.score,
        bonusScore: game.bonusScore,
        bestStreak: game.bestStreak,
        wrong: game.wrong,
        seconds: Math.round((Date.now() - game.startedAt) / 1000),
        players: game.players.slice(),
        playerScores: game.playerScores.slice(),
        hintsUsed: game.hintsUsed
      };
    };

    return game;
  }

  FQ.quiz = {
    MODES: MODES,
    LEARN: LEARN,
    planSession: planSession,
    availableMode: availableMode,
    LEVEL_LABEL: LEVEL_LABEL,
    all: all,
    byCode: byCode,
    pool: pool,
    distractors: distractors,
    confusionSet: confusionSet,
    makeQuestion: makeQuestion,
    checkText: checkText,
    candidateKeys: candidateKeys,
    soundsLike: soundsLike,
    prefixRisky: prefixRisky,
    findCountry: findCountry,
    isGiveUp: isGiveUp,
    createGame: createGame
  };
})(window);
