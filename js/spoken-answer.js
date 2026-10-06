/* 전사에 실제로 나온 이름과 명시적 정정을 해석한다. 현재 문제의 정답은 받지 않는다. */
(function (global) {
  'use strict';
  var FQ = global.FQ = global.FQ || {};
  var MAX_TEXT = 500;

  function compact(value) {
    return String(value || '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  }

  var PREFIX = [
    '다시생각해보니까', '다시생각해보니', '생각해보니까', '생각해보니', '처음에는', '처음엔',
    '잘모르겠는데', '모르겠는데', '모르겠지만', '몰랐는데', '이제알겠어요', '이제알겠어',
    '기억났어요', '기억났어', '알겠어요', '알겠다', '제생각에는', '내생각에는',
    '최종정답은', '최종답은', '마지막답은', '최종정답', '최종답', '마지막답',
    '정답은', '정답이', '정답', '제답은', '내답은', '답은', '답', '정정할게요', '정정할게', '정정',
    '아맞다', '맞다', '그러니까', '그러면', '잠깐만요', '잠깐만', '잠깐', '잠시만', '다시',
    '이국기는', '국기는', '수도는', '이게뭐였죠', '이게뭐였지', '이게뭐지', '이게맞나', '뭐였죠', '뭐였지', '뭐지', '뭐', '어느나라지', '무슨나라지',
    '이거는', '이건요', '이건', '이거', '이게', '그거', '그건', '아빠', '엄마', '저기',
    'theansweris', 'myansweris', 'finalansweris', 'answeris', 'actually', 'correction', 'itis', 'its',
    '으음', '음', '어', '아', '오', '에', '네', '응', '그', 'um', 'uh', 'oh', 'well', 'yes'
  ];
  var SUFFIX = [
    '이라고생각해요', '라고생각해요', '이라고생각해', '라고생각해', '인것같아요', '인거같아요',
    '가정답이에요', '이정답이에요', '가답이에요', '이답이에요', '정답이에요', '정답입니다',
    '으로정할게요', '로정할게요', '으로정할게', '로정할게', '으로할게요', '로할게요', '으로할게', '로할게', '을고를게요', '를고를게요',
    '쪽으로선택할래', '쪽으로선택할게요', '쪽으로선택할게', '으로선택할래', '로선택할래', '를선택할래', '을선택할래',
    '으로할래', '로할래', '가맞아요', '이맞아요', '맞아요', '맞아', '같아요',
    '마지막답', '최종답', '정답', '입니다', '이에요', '이예요', '예요', '이요', '이야',
    '이라고', '라고', '이다', '요', '야', '다', '끝', '네', '응', 'yes'
  ];
  PREFIX.sort(function (a, b) { return b.length - a.length; });
  SUFFIX.sort(function (a, b) { return b.length - a.length; });

  function wordsOnly(text, words) {
    var rest = text;
    while (rest) {
      var found = false;
      for (var i = 0; i < words.length; i++) {
        if (rest.indexOf(words[i]) === 0) { rest = rest.slice(words[i].length); found = true; break; }
      }
      if (!found) return false;
    }
    return true;
  }

  function entries(countries, kind) {
    var names = Object.create(null);
    countries.forEach(function (country) {
      if (!country || typeof country.code !== 'string') return;
      var entry = kind === 'capital' && FQ.quiz && FQ.quiz.entryFor ? FQ.quiz.entryFor(country, kind) :
        kind === 'capital' ? { code: country.code, ko: country.capital, en: country.capitalEn, aliases: country.capitalAliases || [] } : country;
      if (!entry || !entry.ko) return;
      (entry.aliases || []).concat([entry.ko, entry.en]).forEach(function (name) {
        var key = compact(name);
        if (!key) return;
        var list = names[key] || (names[key] = []);
        if (!list.some(function (item) { return item.code === country.code; })) list.push({ code: country.code, name: entry.ko });
      });
    });
    return names;
  }

  function mentions(text, names) {
    var found = [];
    Object.keys(names).forEach(function (name) {
      var start = text.indexOf(name);
      while (start !== -1) {
        found.push({ start: start, end: start + name.length, entries: names[name] });
        start = text.indexOf(name, start + 1);
      }
    });
    // 인도네시아의 인도, 기니비사우의 기니, 긴 수도 별칭 안의 짧은 이름을 억제한다.
    found = found.filter(function (span) {
      return !found.some(function (other) { return other.start < span.end && other.end > span.start && other.end - other.start > span.end - span.start; });
    });
    found.sort(function (a, b) { return a.start - b.start || b.end - a.end; });
    return found;
  }

  function sound(value) { return FQ.util.soundKey(FQ.util.compareKey(value)); }
  function slip(length) { return length <= 4 ? 0 : length <= 6 ? 1 : length <= 10 ? 2 : length <= 15 ? 3 : 4; }

  function pronunciationDistance(said, name) {
    var util = FQ.util, saidKey = sound(said), nameKey = sound(name), allowed = slip(nameKey.length);
    if (Math.abs(saidKey.length - nameKey.length) <= allowed) {
      var distance = util.editDistance(saidKey, nameKey);
      if (distance <= allowed) return distance / nameKey.length;
    }
    // 긴 이름의 안쪽 음절을 생략해도 앞·뒤 소리와 충분한 실제 음절은 남아 있어야 한다.
    var missing = name.length - said.length;
    if (name.length < 4 || said.length < 3 || missing < 1 || missing > 2 || said.length / name.length < 2 / 3 ||
        sound(said[0]) !== sound(name[0]) || sound(said[said.length - 1]) !== sound(name[name.length - 1])) return null;
    var best = Infinity;
    function align(i, j, omitted, changed) {
      if (changed > 1 || omitted > missing) return;
      if (i === said.length && j === name.length) { if (omitted === missing) best = Math.min(best, changed); return; }
      if (i < said.length && j < name.length) {
        var difference = util.editDistance(sound(said[i]), sound(name[j]));
        if (difference <= 1) align(i + 1, j + 1, omitted, changed + difference);
      }
      if (j > 0 && j < name.length - 1) align(i, j + 1, omitted + 1, changed);
    }
    align(0, 0, 0, 0);
    return best === Infinity ? null : (missing * 2 + best) / nameKey.length;
  }

  function spokenMentions(text, names, raw) {
    var exact = mentions(text, names), util = FQ.util;
    if (!util || !util.soundKey || names[text]) return exact;
    var fragments = Object.create(null), firstSounds = Object.create(null), positions = Object.create(null), edgeDistances = Object.create(null), reserved = [], reservedCounts = [0];
    PREFIX.concat(SUFFIX, ['아니고', '아니라', '아니야', '아니에요', '아니다', '말고', '말구', '아니면',
      '또는', '혹은', '인지', '일까', '인가요', '아마', '혹시', '몰라요', '몰라', '모르겠어요', '모르겠네', '모르겠다']).forEach(function (word) {
      if (word.length < 2) return;
      var start = text.indexOf(word);
      while (start !== -1) {
        var end = start + word.length;
        if (!exact.some(function (span) { return start < span.end && end > span.start; })) reserved.push({ start: start, end: end });
        start = text.indexOf(word, start + 1);
      }
    });
    // 분리해서 말한 짧은 필러를 이름의 첫 음절로 소비하지 않는다(음 가보네 → 음바바네 방지).
    // 실제 전체 이름·별칭은 위의 exact 판정이 먼저 처리하므로 음바바네 같은 이름은 보존된다.
    var offset = 0;
    String(raw || '').normalize('NFC').replace(/[\p{L}\p{N}]+/gu, function (word) {
      var value = compact(word), end = offset + value.length;
      if (PREFIX.indexOf(value) !== -1 && !exact.some(function (span) { return offset < span.end && end > span.start; })) {
        reserved.push({ start: offset, end: end });
      }
      offset = end;
      return word;
    });
    var blocked = [];
    reserved.forEach(function (span) { for (var p = span.start; p < span.end; p++) blocked[p] = true; });
    for (var position = 0; position < text.length; position++) {
      var initial = firstSounds[position] = sound(text[position]);
      if (!blocked[position]) (positions[initial] || (positions[initial] = [])).push(position);
      reservedCounts[position + 1] = reservedCounts[position] + (blocked[position] ? 1 : 0);
    }
    function edgeDistance(a, b) {
      var key = a + ':' + b;
      if (!(key in edgeDistances)) edgeDistances[key] = util.editDistance(a, b);
      return edgeDistances[key];
    }
    Object.keys(names).forEach(function (name) {
      if (!/^[가-힣]{2,20}$/.test(name)) return;
      var first = sound(name[0]), last = sound(name[name.length - 1]), distances = Object.create(null), starts = [];
      Object.keys(positions).forEach(function (initial) { if (edgeDistance(initial, first) <= 1) starts = starts.concat(positions[initial]); });
      for (var s = 0; s < starts.length; s++) {
        var start = starts[s];
        for (var length = Math.max(2, name.length - 2); length <= name.length + 1 && start + length <= text.length; length++) {
          var end = start + length, fragment = text.slice(start, end);
          if (reservedCounts[end] !== reservedCounts[start] || !/^[가-힣]+$/.test(fragment) || edgeDistance(firstSounds[end - 1], last) > 1 || fragment === name) continue;
          if (!(fragment in distances)) distances[fragment] = pronunciationDistance(fragment, name);
          var score = distances[fragment];
          if (score === null) continue;
          // 실제 다른 이름은 우선한다. 인도→인도네시야처럼 긴 이름 앞부분에 포함된 경우만 이어 본다.
          if (exact.some(function (span) {
            if (span.start >= end || span.end <= start) return false;
            return !(span.start === start && span.end < end && name.indexOf(text.slice(span.start, span.end)) === 0);
          })) continue;
          var key = start + ':' + end, group = fragments[key] || (fragments[key] = { start: start, end: end, entries: [], phonetic: true });
          names[name].forEach(function (entry) {
            if (!group.entries.some(function (item) { return item.code === entry.code; })) group.entries.push(entry);
          });
        }
      }
    });
    // 유효한 생략음과 유사음이 서로 다른 이름이면 어느 쪽도 거리 점수로 지워 추측하지 않는다.
    var found = exact.concat(Object.keys(fragments).map(function (key) { return fragments[key]; }));
    // 분절된 긴 이름이 짧은 이름·조각을 감싸면 완성한 후보를 남긴다. 후보끼리 경합하면 entries를 보존한다.
    found = found.filter(function (span) {
      return !found.some(function (other) { return other.start <= span.start && other.end >= span.end && other.end - other.start > span.end - span.start; });
    });
    found.sort(function (a, b) { return a.start - b.start || b.end - a.end; });
    return found;
  }

  function candidateList(spans) {
    var list = [], seen = Object.create(null);
    spans.forEach(function (span) {
      span.entries.forEach(function (entry) {
        if (!seen[entry.code]) { seen[entry.code] = true; list.push({ code: entry.code, name: entry.name }); }
      });
    });
    return list;
  }

  function result(status, reason, candidates, entry) {
    return { status: status, code: entry ? entry.code : null, text: entry ? entry.name : '', reason: reason, candidates: candidates };
  }

  function quoted(raw, text) {
    // 이름 안의 영문 apostrophe는 인용으로 세지 않는다.
    return /["“”「」『』]/.test(raw) || /(?:^|[^a-zA-Z])[‘’']/.test(raw) ||
      /(?:이라고|라고|이라|라)\s*(?:했|말했|얘기했|적혀|쓰여|나왔|들었|들려|읽었|읽어|불렀)/.test(text) ||
      /(?:이라는|라는)(?:말|이름|답)|(?:이라는데|라는데)/.test(text) ||
      /(?:친구가|엄마가|아빠가|선생님이|누가).*(?:말|얘기|했|그랬)/.test(text);
  }

  function manipulation(raw, text) {
    return /[{}<>]/.test(raw) || /(?:ignore(?:previous|all)|systemprompt|assistant|developer|instruction|정답처리|지시.*(?:무시|따르)|(?:무시|따르).*지시|채점.*(?:변경|조작)|후보.*(?:추가|변경))/.test(text);
  }

  function help(text) { return /(?:힌트|도와|알려|가르쳐|뭐지|뭐야|뭐예요|어느나라|무슨나라|what|help)/.test(text); }
  function pass(text) {
    return /(?:패스(?:할게요|할게|해요|해줘|해주세요)?|스킵|넘어가(?:요|줘|주세요)?|다음문제(?:로|요)?|다음으로(?:가요|가줘|가주세요)?|skip|pass)$/.test(text);
  }
  function terminalUnknown(text) {
    return /^(?:음|어|아|저기|에이|나|저|잘)*(?:몰라(?:요|요끝|끝)?|모르겠(?:어요|습니다|네|다)|모릅니다|기억(?:이)?안나(?:요)?|생각(?:이)?안나(?:요)?)$/.test(text);
  }
  function uncertainty(text) {
    return /(?:또는|혹은|아니면|인지|일까|인가요|인가|맞나요|맞나|아마|혹시|둘중|중에서|either|maybe|perhaps)/.test(text);
  }
  function negative(text) { return /(?:아니|아닌|아니다|아닙|말고|말구|not|isnt|isnot|dont|cannot|하지마)/.test(text); }

  function connector(gap) {
    // 조사는 앞의 이름에 붙으며, 필러는 정정 표현의 앞뒤에 붙을 수 있다.
    var rest = gap.replace(/^(?:이라고|라고|이라는|이란|은|는|이|가|을|를|요)/, '');
    var marker = /(?:최종정답은|최종답은|마지막답은|최종정답|최종답|마지막답|정정할게요|정정할게|정정하면|정정|다시생각해보니까|다시생각해보니|생각해보니까|생각해보니|답을바꿀게요|답을바꿀게|바꿔서|finalansweris|correction)/;
    var strong = marker.exec(rest);
    if (strong && wordsOnly(rest.slice(0, strong.index), PREFIX.concat(SUFFIX)) && wordsOnly(rest.slice(strong.index + strong[0].length), PREFIX)) return 'reset';
    var replace = /(?:아니고|아니라|아니야|아니에요|아닙니다|아니다|말고|말구|인줄알았는데|생각했는데|but|rather|instead)/.exec(rest);
    if (replace && wordsOnly(rest.slice(0, replace.index), PREFIX.concat(SUFFIX)) && wordsOnly(rest.slice(replace.index + replace[0].length), PREFIX)) return 'replace';
    if (/^(?:중|중에|중에서|그중|그중에|그중에서)$/.test(rest)) return 'selection';
    if (uncertainty(rest.replace(/중에서/g, '')) || /^(?:이나|나|or|either)$/.test(rest)) return 'conditional';
    if (/^(?:과|와|랑|하고|그리고|및|and)$/.test(rest)) return 'alternative';
    if (negative(rest)) return 'negative';
    if (wordsOnly(rest, PREFIX.concat(SUFFIX))) return 'repeat';
    return 'unknown';
  }

  function bareFallback(raw, text, kind, countries, evidence) {
    if (!FQ.quiz || !FQ.quiz.findCountry || !/^[\p{L}\p{N}\s.,!。！…]+$/u.test(raw.trim()) || text.length > 80 ||
        negative(text) || help(text) || uncertainty(text) || /(?:and|or|but|그리고|정정|생각해|마지막|최종)/.test(text)) return null;
    // 전체 이름 한 덩어리만 비교한다. 필러·조사를 떼어도 일반 문장 안의 낱말은 추출하지 않는다.
    var forms = [text], stripped = text, changed = true;
    function add(value) { if (forms.indexOf(value) === -1) forms.push(value); }
    while (changed) {
      changed = false;
      for (var p = 0; p < PREFIX.length; p++) {
        if (stripped.indexOf(PREFIX[p]) === 0 && stripped.length > PREFIX[p].length + 1) {
          stripped = stripped.slice(PREFIX[p].length); add(stripped); changed = true; break;
        }
      }
    }
    // 아일랜드의 '아'처럼 이름 자체도 필러로 시작한다. 중간 단계의 이름을 함께 보존한다.
    forms.slice().forEach(function (value) {
      stripped = value; changed = true;
      while (changed) {
        changed = false;
        for (var s = 0; s < SUFFIX.length; s++) {
          if (stripped.endsWith(SUFFIX[s]) && stripped.length > SUFFIX[s].length + 1) {
            stripped = stripped.slice(0, -SUFFIX[s].length); add(stripped); changed = true; break;
          }
        }
      }
    });
    var matches = forms.map(function (value) {
      return singleNameFallback(value, kind, countries);
    }).filter(Boolean);
    var conflicting = matches.length > 0 && matches.some(function (entry) { return entry.code !== matches[0].code; });
    if (evidence) { evidence.forms = forms; evidence.conflicting = conflicting; }
    if (!matches.length || conflicting) return null;
    return matches[0];
  }

  function intactNameCorrection(forms, names, code) {
    var matched = Object.create(null);
    // 아일랜드처럼 필러와 같은 첫 음절도 실제 이름의 일부다. 음절 수를 보존한 보완을 유지한다.
    // 첫 음절과 길이가 같은 실제 발음 후보가 둘이면 여전히 재질문한다.
    (forms || []).forEach(function (form) {
      if (!/^[가-힣]{3,20}$/.test(form) || PREFIX.indexOf(form[0]) === -1) return;
      Object.keys(names).forEach(function (name) {
        if (!/^[가-힣]{3,20}$/.test(name) || name.length !== form.length || sound(form[0]) !== sound(name[0]) ||
            pronunciationDistance(form, name) === null) return;
        names[name].forEach(function (entry) { matched[entry.code] = true; });
      });
    });
    var codes = Object.keys(matched);
    return codes.length === 1 && codes[0] === code;
  }

  function singleNameFallback(text, kind, countries) {
    var found = FQ.quiz.findCountry(text, kind);
    if (!found && FQ.quiz.checkText) {
      var keys = FQ.quiz.candidateKeys ? FQ.quiz.candidateKeys(text) : null;
      var likely = keys && FQ.quiz.soundsLike ? countries.filter(function (country) {
        var entry = kind === 'capital' ? FQ.quiz.entryFor(country, kind) : country;
        return FQ.quiz.soundsLike(entry, keys, kind);
      }) : countries;
      var matched = likely.filter(function (country) { return FQ.quiz.checkText(country, text, kind).correct; });
      if (matched.length === 1) found = matched[0];
    }
    if (!found || !countries.some(function (country) { return country.code === found.code; })) return null;
    var entry = kind === 'capital' ? FQ.quiz.entryFor(found, kind) : found;
    return entry && { code: found.code, name: entry.ko };
  }

  function detachedRestart(raw, suffix, spans, candidates) {
    // STT가 같은 이름을 반복한 뒤 별도 문장에 남긴 미완성 시작말만 무시한다.
    // 완전한 문장, 다른 후보, 질문·부정·인용은 기존 보수적 판정을 유지한다.
    if (spans.length < 2 || candidates.length !== 1 || !/^(?:그는|나는|저는|이건|그건)$/.test(suffix)) return false;
    var sentences = raw.split(/[.!。！]+/).filter(function (sentence) { return sentence.trim(); });
    return sentences.length > 1 && compact(sentences[sentences.length - 1]) === suffix;
  }

  function resolveCore(raw, options, withPronunciation, evidence) {
    options = options || {};
    var kind = options.kind === 'capital' ? 'capital' : 'country';
    if (typeof raw !== 'string' || raw.length > MAX_TEXT || !raw.trim()) return result('retry', 'invalid-input', []);
    var countries = Array.isArray(options.countries) ? options.countries : FQ.countries || [];
    var text = compact(raw), names = entries(countries, kind), spans = withPronunciation ? spokenMentions(text, names, raw) : mentions(text, names);
    // 몰타+이에요 안의 '타이'처럼 조사 경계를 가로지른 별칭은 완전한 이름과 경쟁하지 않는다.
    var wrapped = spans.filter(function (span) {
      return span.entries.length === 1 && wordsOnly(text.slice(0, span.start), PREFIX) && wordsOnly(text.slice(span.end), SUFFIX);
    });
    if (wrapped.length === 1 && spans.every(function (span) { return span.start < wrapped[0].end && span.end > wrapped[0].start; })) spans = wrapped;
    var candidates = candidateList(spans);
    if (manipulation(raw, text)) return result('retry', 'unsafe-instruction', candidates);
    // 앞에서 다른 사람의 답을 언급했어도 뒤의 명시적 자기 답은 별도 문장으로 해석한다.
    var finalMarkers = /(?:내답은|제답은|나는|저는|최종답은|마지막답은|이번에는|이번엔|myansweris)/g;
    var finalMarker, lastMarker = null;
    while ((finalMarker = finalMarkers.exec(text))) lastMarker = finalMarker;
    if (lastMarker && spans.length > 1 && lastMarker.index >= spans[0].end && !/["“”「」『』‘’']/.test(raw) && !/\?\s*$/.test(raw)) {
      var finalResult = resolve(text.slice(lastMarker.index + lastMarker[0].length), { kind: kind, countries: countries });
      if (finalResult.status === 'answer') return result('answer', 'explicit-correction', candidates, { code: finalResult.code, name: finalResult.text });
    }
    if (quoted(raw, text)) return result('retry', 'quoted', candidates);
    if (pass(text)) return result('giveup', 'explicit-giveup', candidates);
    if (!spans.length) {
      if (terminalUnknown(text)) return result('giveup', 'explicit-giveup', []);
      if (wordsOnly(text, PREFIX.concat(SUFFIX, ['가', '는', '를', '하고']))) return result('retry', help(text) ? 'help-request' : 'unknown', []);
      var fallback = bareFallback(raw, text, kind, countries, evidence);
      if (fallback) return result('answer', 'name-match', [fallback], fallback);
      return result('retry', help(text) ? 'help-request' : 'unknown', []);
    }
    if (spans.some(function (span) { return span.entries.length !== 1; })) return result('retry', 'ambiguous-alias', candidates);
    if (spans.some(function (span, i) { return i && span.start < spans[i - 1].end; })) return result('retry', 'ambiguous-alias', candidates);
    var prefix = text.slice(0, spans[0].start), suffix = text.slice(spans[spans.length - 1].end);
    // 사우디아라처럼 완전한 짧은 별칭(사우디) 뒤를 더 말한 긴 이름의 앞부분만 보완한다.
    if (spans.length === 1 && wordsOnly(prefix, PREFIX) && suffix && !wordsOnly(suffix, SUFFIX) && spans[0].entries.length === 1 && countries.some(function (country) {
      if (country.code !== spans[0].entries[0].code) return false;
      var entry = kind === 'capital' && FQ.quiz && FQ.quiz.entryFor ? FQ.quiz.entryFor(country, kind) : country;
      var nameText = text.slice(prefix.length);
      return (entry.aliases || []).concat([entry.ko, entry.en]).some(function (name) { var key = compact(name); return key.length > nameText.length && key.indexOf(nameText.replace(/(?:이요|요)$/, '')) === 0; });
    })) {
      var completed = bareFallback(raw, text, kind, countries, evidence);
      if (completed && completed.code === spans[0].entries[0].code) return result('answer', 'name-match', candidates, completed);
    }
    if (kind === 'capital') {
      var contextual = mentions(prefix, entries(countries, 'country'));
      if (contextual.length === 1 && /^(?:의)?수도(?:는|가|이)?$/.test(prefix.slice(contextual[0].end)) && wordsOnly(prefix.slice(0, contextual[0].start), PREFIX)) prefix = '';
    }
    if (negative(suffix)) return result('retry', 'negation', candidates);
    if (uncertainty(suffix) || /\?\s*$/.test(raw) || /(?:몰라|모르겠|모릅니|기억안나)$/.test(suffix)) return result('retry', 'uncertain', candidates);
    if (detachedRestart(raw, suffix, spans, candidates)) suffix = '';
    if (!wordsOnly(suffix, SUFFIX)) return result('retry', help(suffix) ? 'help-request' : 'unsupported-structure', candidates);
    var prefixNot = /^(?:not|아니|아닌)$/.test(prefix);
    if (!prefixNot && !wordsOnly(prefix, PREFIX)) return result('retry', uncertainty(prefix) ? 'uncertain' : negative(prefix) ? 'negation' : 'unsupported-structure', candidates);
    var chosen = spans[0].entries[0], unresolved = false, corrected = false, complex = false, alternative = false, conditional = false, selection = false;
    for (var i = 1; i < spans.length; i++) {
      var next = spans[i].entries[0], gap = text.slice(spans[i - 1].end, spans[i].start);
      var relation = connector(gap);
      if (relation === 'reset') { chosen = next; unresolved = false; complex = false; alternative = false; conditional = false; selection = false; corrected = true; prefixNot = false; }
      else if (relation === 'replace') { chosen = next; corrected = true; prefixNot = false; }
      else if (relation === 'negative') return result('retry', 'negation', candidates);
      else if (relation === 'selection') {
        selection = spans.slice(0, i).some(function (span) { return span.entries[0].code === next.code; });
        if (!selection) { unresolved = true; complex = true; }
      }
      else if (relation === 'repeat' && next.code === chosen.code) { /* 같은 이름을 다시 말해도 하나의 답이다. */ }
      else { unresolved = true; if (relation === 'unknown') complex = true; if (relation === 'alternative' || relation === 'conditional') alternative = true; if (relation === 'conditional') conditional = true; }
    }
    if (prefixNot) return result('retry', 'negation', candidates);
    if (unresolved && selection && !conditional && !complex && /^(?:으로|로)(?:할게요|할게|할래|정할게요|정할게)$/.test(suffix)) {
      return result('answer', 'explicit-correction', candidates, spans[spans.length - 1].entries[0]);
    }
    if (unresolved) return result('retry', alternative ? 'uncertain' : complex ? 'unsupported-structure' : 'multiple-answers', candidates);
    return result('answer', corrected ? 'explicit-correction' : spans.some(function (span) { return span.phonetic; }) ? 'phonetic-match' : spans.length > 1 ? 'repeated-answer' : 'single-answer', candidates, chosen);
  }

  function resolve(raw, options) {
    // 이미 명확한 실제 이름·정정·포기는 유지하고, 해석하지 못한 말에만 발음 보완을 적용한다.
    var evidence = {};
    var exact = resolveCore(raw, options, false, evidence);
    if (exact.status !== 'retry' && exact.reason !== 'name-match') return exact;
    if (typeof raw === 'string' && wordsOnly(compact(raw), PREFIX.concat(SUFFIX, ['가', '는', '를', '하고']))) return exact;
    var kind = options && options.kind === 'capital' ? 'capital' : 'country';
    var countries = options && Array.isArray(options.countries) ? options.countries : FQ.countries || [];
    var pronounced = resolveCore(raw, options, true);
    // 두 음절의 짧은 이름은 필러를 붙인 원문과 떼어낸 이름이 서로 다른 나라를 가리키면 추정하지 않는다.
    // 긴 분절 이름은 명시적으로 분리한 필러를 이름의 음절로 삼키지 않는 spokenMentions 판정을 따른다.
    if (evidence.conflicting && pronounced.status === 'answer' && compact(pronounced.text).length <= 2) return exact;
    if (exact.status === 'answer' && exact.reason === 'name-match') {
      if (pronounced.candidates.some(function (candidate) { return candidate.code !== exact.code; })) {
        if (intactNameCorrection(evidence.forms, entries(countries, kind), exact.code)) return exact;
        return result('retry', 'ambiguous-alias', pronounced.candidates);
      }
      if (pronounced.status !== 'answer') return exact;
    }
    return pronounced;
  }

  function canUseSemantic(raw, resolved) {
    if (typeof raw !== 'string' || raw.length > MAX_TEXT || !resolved || resolved.status !== 'retry' ||
        ['multiple-answers', 'unsupported-structure'].indexOf(resolved.reason) === -1 || !Array.isArray(resolved.candidates) || resolved.candidates.length < 2) return false;
    if (new Set(resolved.candidates.map(function (candidate) { return candidate && candidate.code; })).size !== resolved.candidates.length) return false;
    var text = compact(raw);
    if (manipulation(raw, text) || quoted(raw, text) || negative(text) || /\?\s*$/.test(raw) ||
        /(?:또는|혹은|아니면|인지|일까|인가요|둘중하나|어느|어떤|누구|누가)/.test(text) || /\b(?:or|either|maybe|perhaps)\b/i.test(raw)) return false;
    var spans = mentions(text, entries(FQ.countries || [], 'country'));
    var capitals = mentions(text, entries(FQ.countries || [], 'capital'));
    if (!resolved.candidates.every(function (candidate) {
      return spans.concat(capitals).some(function (span) { return span.entries.some(function (entry) { return candidate.code === entry.code && candidate.name === entry.name; }); });
    })) return false;
    var actual = spans.concat(capitals).filter(function (span) { return span.entries.some(function (entry) {
      return resolved.candidates.some(function (candidate) { return candidate.code === entry.code && candidate.name === entry.name; });
    }); }).sort(function (a, b) { return a.end - b.end; });
    if (!actual.length) return false;
    var tail = text.slice(actual[actual.length - 1].end);
    // 후보 뒤의 직접 선택 의사만 허용한다. 단순 나열·질문·부정·도움말은 모델로 넘기지 않는다.
    return /^(?:(?:이|가|은|는)?더맞는것같아서)?(?:쪽으로|으로|로|을|를)?(?:선택할래|선택할게요|선택할게|고를래|고를게요|고를게|정할래|정할게요|정할게|확정할래|확정할게요|확정할게|할래|할게요|할게)$/.test(tail) &&
      !negative(tail) && !help(tail);
  }

  FQ.spokenAnswer = { resolve: resolve, canUseSemantic: canUseSemantic, MAX_TEXT_LENGTH: MAX_TEXT };
})(window);
