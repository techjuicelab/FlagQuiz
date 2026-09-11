/* 국기 퀴즈 - 출제 엔진
 * 나라 목록을 걸러 문제를 만들고, 보기(오답 후보)를 고르고, 답을 채점한다.
 * 화면(DOM)을 전혀 건드리지 않아 그대로 테스트할 수 있다.
 */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var util = FQ.util;

  var MODES = {
    choice4: { label: '국기 보고 나라 고르기', kind: 'choice', hasOptions: true },
    reverse: { label: '나라 보고 국기 고르기', kind: 'choice', hasOptions: true },
    capital: { label: '나라 보고 수도 고르기', kind: 'choice', hasOptions: true },
    typing:  { label: '국기 보고 이름 쓰기', kind: 'text', hasOptions: false },
    voice:   { label: '국기 보고 말하기', kind: 'text', hasOptions: false }
  };

  var LEVEL_LABEL = { 1: '쉬움', 2: '보통', 3: '어려움' };

  function all() { return FQ.countries || []; }

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
    return list;
  }

  /** 정답과 헷갈릴 만한 오답 보기를 고른다. */
  function distractors(answer, count, source, mode) {
    var candidates = (source && source.length >= count + 1 ? source : all()).filter(function (c) {
      return c.code !== answer.code;
    });
    if (mode === 'capital') {
      // 수도 이름이 겹치면 정답이 둘이 되어 버린다
      candidates = candidates.filter(function (c) { return c.capital !== answer.capital; });
    }

    function tier(c) {
      if (c.region === answer.region) return 0;              // 같은 세부 지역이 가장 헷갈린다
      if (c.continent === answer.continent) return 1;
      if (c.level === answer.level) return 2;
      return 3;
    }

    var buckets = [[], [], [], []];
    candidates.forEach(function (c) { buckets[tier(c)].push(c); });

    var out = [];
    var usedCode = {};
    var usedCapital = {};
    usedCode[answer.code] = true;
    usedCapital[answer.capital] = true;

    function take(c) {
      if (usedCode[c.code]) return false;
      if (mode === 'capital' && usedCapital[c.capital]) return false;
      usedCode[c.code] = true;
      usedCapital[c.capital] = true;
      out.push(c);
      return true;
    }

    for (var t = 0; t < buckets.length && out.length < count; t++) {
      var picked = util.shuffle(buckets[t]);
      for (var i = 0; i < picked.length && out.length < count; i++) take(picked[i]);
    }
    // 그래도 모자라면 전체에서 채운다
    if (out.length < count) {
      var rest = util.shuffle(all());
      for (var j = 0; j < rest.length && out.length < count; j++) take(rest[j]);
    }
    return out.slice(0, count);
  }

  /** 한 문제를 만든다. */
  function makeQuestion(answer, mode, source) {
    var q = { mode: mode, country: answer, options: null };
    if (MODES[mode] && MODES[mode].hasOptions) {
      var opts = distractors(answer, 3, source, mode).concat([answer]);
      q.options = util.shuffle(opts);
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
    var best = null, bestStrength = -1, bestDist = Infinity, tie = false;
    for (var i = 0; i < list.length; i++) {
      var m = matchOne(list[i], keys, norm);
      if (!m.near) continue;
      if (m.strength > bestStrength || (m.strength === bestStrength && m.dist < bestDist)) {
        bestStrength = m.strength; bestDist = m.dist; best = list[i]; tie = false;
      } else if (m.strength === bestStrength && m.dist === bestDist && best && list[i].code !== best.code) {
        tie = true;
      }
    }
    return tie ? null : best;
  }

  /**
   * 자유 입력(말하기/쓰기) 채점.
   * 넉넉하게 인정하되, 다른 나라가 더 잘 맞아떨어지면 정답으로 치지 않는다.
   * (니제르 ↔ 나이지리아, 인도 ↔ 인도네시아 같은 사고 방지)
   */
  function checkText(answer, text) {
    var norm = util.normalize(text);
    var result = { correct: false, exact: false, score: 0, matched: null, confusedWith: null };
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

    // 다른 나라가 더 많이(또는 같은 만큼이지만 더 정확히) 맞아떨어지면 정답이 아니다
    var rivalWins = rivalStrength > mine.strength ||
                    (rivalStrength === mine.strength && rivalDist <= mine.dist);
    if (!mine.near || rivalWins) {
      if (rival) result.confusedWith = rival;
      return result;
    }
    result.correct = true;
    return result;
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

    var source = pool({ level: cfg.level, continent: cfg.continent, only: cfg.only });
    if (source.length === 0) source = all();

    var total = cfg.count === 'all' ? source.length : Math.min(cfg.count, source.length);
    if (total < 1) total = Math.min(1, source.length);

    // 출제 순서 정하기: 오답 우선이면 가중치로, 아니면 골고루 섞어서
    var order;
    if (cfg.reviewFirst && FQ.storage && source.length > total) {
      var remaining = source.slice();
      order = [];
      while (order.length < total && remaining.length) {
        var weights = remaining.map(function (c) { return FQ.storage.weightOf(c.code); });
        var chosen = util.weightedPick(remaining, weights);
        order.push(chosen);
        remaining = remaining.filter(function (c) { return c.code !== chosen.code; });
      }
    } else {
      order = util.sample(source, total);
    }

    var questions = order.map(function (c) { return makeQuestion(c, cfg.mode, source); });

    var game = {
      config: cfg,
      source: source,
      questions: questions,
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
    game.current = function () { return game.questions[game.index] || null; };
    game.currentPlayer = function () { return game.players[game.turn % game.players.length]; };
    game.currentPlayerIndex = function () { return game.turn % game.players.length; };
    game.isLast = function () { return game.index >= game.questions.length - 1; };
    game.isOver = function () { return game.index >= game.questions.length; };

    /**
     * 답을 채점하고 게임 상태를 갱신한다.
     * payload: {code: '선택한 나라 코드'} 또는 {text: '말하거나 쓴 답'}
     */
    game.submit = function (payload, usedHint) {
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
        game.wrong.push(q.country);
        res.gained = 0;
      }
      if (usedHint) game.hintsUsed += 1;
      if (FQ.storage) FQ.storage.recordAnswer(q.country.code, res.correct);
      res.question = q;
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
    LEVEL_LABEL: LEVEL_LABEL,
    all: all,
    byCode: byCode,
    pool: pool,
    distractors: distractors,
    makeQuestion: makeQuestion,
    checkText: checkText,
    findCountry: findCountry,
    isGiveUp: isGiveUp,
    createGame: createGame
  };
})(window);
