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
    for (var t = 0; t < buckets.length && out.length < count; t++) {
      var picked = util.shuffle(buckets[t]);
      for (var i = 0; i < picked.length && out.length < count; i++) out.push(picked[i]);
    }
    // 그래도 모자라면 전체에서 채운다
    if (out.length < count) {
      var used = {};
      out.concat([answer]).forEach(function (c) { used[c.code] = true; });
      var rest = util.shuffle(all().filter(function (c) { return !used[c.code]; }));
      for (var j = 0; j < rest.length && out.length < count; j++) out.push(rest[j]);
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

  /** 이름 길이에 따라 봐줄 수 있는 오타 개수 (자모 기준) */
  function allowedSlip(len) {
    if (len <= 5) return 1;    // 칠레, 인도처럼 짧은 이름은 한 글자까지
    if (len <= 11) return 2;   // 필리핀, 브라질 정도
    return 3;                  // 오스트레일리아처럼 긴 이름
  }

  /**
   * 자유 입력(말하기/쓰기) 채점.
   * 살짝 틀리게 말하거나 써도 인정하되, 그 답이 다른 나라와 더 가깝거나
   * 똑같이 가까우면 정답으로 치지 않는다. (니제르 ↔ 나이지리아 같은 사고 방지)
   */
  function checkText(answer, text) {
    var norm = util.normalize(text);
    var result = { correct: false, exact: false, score: 0, matched: null, confusedWith: null };
    if (!norm) return result;
    var inputKey = util.compareKey(text);

    function best(country) {
      var names = (country.aliases || []).concat([country.ko, country.en]);
      var out = { score: 0, name: null, exact: false, near: false };
      for (var i = 0; i < names.length; i++) {
        var nm = names[i];
        if (!nm) continue;
        if (util.normalize(nm) === norm) return { score: 1, name: nm, exact: true, near: true };
        var key = util.compareKey(nm);
        if (!key) continue;
        var gap = Math.abs(inputKey.length - key.length);
        var longer = Math.max(inputKey.length, key.length);
        // 길이 차이가 이미 크면 편집 거리를 재 볼 필요가 없다
        var dist = gap > 4 ? gap : util.editDistance(inputKey, key);
        var score = longer ? 1 - dist / longer : 0;
        if (score > out.score) {
          out = { score: score, name: nm, exact: false, near: dist <= allowedSlip(key.length) };
        }
      }
      return out;
    }

    var mine = best(answer);
    result.score = mine.score;
    result.matched = mine.name;
    result.exact = mine.exact;
    if (mine.exact) { result.correct = true; return result; }

    // 다른 나라 이름을 말한 것은 아닌지 확인한다
    var list = all();
    var rivalScore = 0, rival = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].code === answer.code) continue;
      var r = best(list[i]);
      if (r.exact) { rivalScore = 1.0001; rival = list[i]; break; }
      if (r.score > rivalScore) { rivalScore = r.score; rival = list[i]; }
    }

    if (rivalScore >= mine.score) {
      if (rivalScore >= 0.75) result.confusedWith = rival;
      return result;
    }
    result.correct = mine.near;
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
      correct: 0,
      wrong: [],
      hintsUsed: 0,
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
      if (!q) return null;
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
        var gained = 10 + (game.streak >= 3 ? 5 : 0) - (usedHint ? 3 : 0);
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
    createGame: createGame
  };
})(window);
