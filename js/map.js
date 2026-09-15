/* 실제 나라 좌표를 그대로 쓰는 지도 보기. 채점과 화면 수명은 app.js가 맡는다. */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var TOUCH_SIZE = 44;
  var MIN_WIDTH = 280;
  var PADDING = TOUCH_SIZE / 2;

  function coord(country) {
    var p = country && FQ.mapCoords && FQ.mapCoords[country.code];
    return Array.isArray(p) && p.length === 2 &&
      typeof p[0] === 'number' && isFinite(p[0]) && Math.abs(p[0]) <= 180 &&
      typeof p[1] === 'number' && isFinite(p[1]) && Math.abs(p[1]) <= 90 ? p : null;
  }

  function dimensions(width, height) {
    var w = Math.max(MIN_WIDTH, Number(width) || MIN_WIDTH) - 2 * PADDING;
    var h = Math.max((MIN_WIDTH - 2 * PADDING) / 2, (Number(height) || w / 2 + 2 * PADDING) - 2 * PADDING);
    return { width: w, height: h };
  }

  function separated(a, b, size) {
    var pa = coord(a), pb = coord(b);
    if (!pa || !pb || a.code === b.code) return false;
    // 중심 사이 직선 거리 대신 44px 사각형 두 개가 겹치지 않는지 확인한다.
    return Math.abs(pa[0] - pb[0]) / 360 * size.width >= TOUCH_SIZE ||
      Math.abs(pa[1] - pb[1]) / 180 * size.height >= TOUCH_SIZE;
  }

  function fits(options, width, height) {
    if (!Array.isArray(options)) return false;
    var size = dimensions(width, height);
    for (var i = 0; i < options.length; i++) {
      if (!coord(options[i])) return false;
      for (var j = 0; j < i; j++) if (!separated(options[i], options[j], size)) return false;
    }
    return true;
  }

  /** 폭·높이는 22px 여백을 포함한 바깥 크기. 높이를 생략하면 내부 지도는 2:1이다. */
  function chooseOptions(answer, source, width, height) {
    if (!coord(answer)) throw new Error('이 나라의 지도 좌표가 없습니다.');
    var minimum = dimensions(MIN_WIDTH), current = dimensions(width, height);
    var candidates = [], used = {};
    used[answer.code] = true;
    function add(list) {
      FQ.util.shuffle(list || []).forEach(function (country) {
        if (country && !used[country.code] && coord(country)) {
          used[country.code] = true;
          if (separated(answer, country, minimum) && separated(answer, country, current)) candidates.push(country);
        }
      });
    }
    add(source);
    add(FQ.countries);
    // 최소 폭에서도 맞는 조합을 한 번만 고른다. 화면 회전으로 보기나 정답 위치를 바꾸지 않는다.
    for (var a = 0; a < candidates.length; a++) {
      for (var b = a + 1; b < candidates.length; b++) {
        if (!separated(candidates[a], candidates[b], minimum) || !separated(candidates[a], candidates[b], current)) continue;
        for (var c = b + 1; c < candidates.length; c++) {
          var option = candidates[c];
          if (separated(candidates[a], option, minimum) && separated(candidates[b], option, minimum) &&
              separated(candidates[a], option, current) && separated(candidates[b], option, current)) {
            return FQ.util.shuffle([answer, candidates[a], candidates[b], option]);
          }
        }
      }
    }
    throw new Error('겹치지 않는 지도 보기 네 개를 준비할 수 없습니다.');
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function render(options) {
    if (!Array.isArray(options) || options.length !== 4 || !fits(options, MIN_WIDTH)) {
      throw new Error('지도에는 겹치지 않는 보기 네 개가 필요합니다.');
    }
    if (!FQ.mapLand || !FQ.mapLand.d) throw new Error('지도 육지 자료가 없습니다.');
    return '<div class="map-board"><div class="map-surface">' +
      '<svg class="map-land" viewBox="0 0 2000 1000" aria-hidden="true" focusable="false">' +
      '<path d="' + esc(FQ.mapLand.d) + '"></path></svg>' +
      options.map(function (country, index) {
        var p = coord(country);
        return '<button type="button" class="map-pin answer-btn" data-code="' + esc(country.code) +
          '" aria-label="' + esc(country.ko) + '" style="left:' + ((p[0] + 180) / 360 * 100) +
          '%;top:' + ((90 - p[1]) / 180 * 100) + '%"><span class="map-dot" aria-hidden="true">' +
          (index + 1) + '</span></button>';
      }).join('') + '</div></div>';
  }

  FQ.map = { chooseOptions: chooseOptions, render: render, fits: fits, MIN_WIDTH: MIN_WIDTH };
})(window);
