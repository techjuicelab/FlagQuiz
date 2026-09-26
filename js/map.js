/* 실제 나라 좌표를 그대로 쓰는 지도 보기. 채점과 화면 수명은 app.js가 맡는다. */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var TOUCH_SIZE = 44;
  var MIN_WIDTH = 280;
  var PADDING = TOUCH_SIZE / 2;
  var WORLD_WIDTH = 2000;
  var WORLD_HEIGHT = 1000;
  // 이름표는 나라의 정답 좌표와 별개인 읽기 쉬운 대륙 안내 위치다.
  var CONTINENTS = [
    { name: '북아메리카', lng: -110, lat: 48 },
    { name: '남아메리카', lng: -61, lat: -12 },
    { name: '유럽', lng: 17, lat: 59 },
    { name: '아프리카', lng: 18, lat: 6 },
    { name: '아시아', lng: 88, lat: 46 },
    { name: '오세아니아', lng: 136, lat: -29 }
  ];

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

  function project(p) {
    return { x: (p[0] + 180) / 360 * WORLD_WIDTH, y: (90 - p[1]) / 180 * WORLD_HEIGHT };
  }

  function land() {
    if (!FQ.mapLand || !FQ.mapLand.d) throw new Error('지도 육지 자료가 없습니다.');
    return '<path d="' + esc(FQ.mapLand.d) + '"></path>';
  }

  function percent(x, y) {
    return 'left:' + x + '%;top:' + y + '%';
  }

  function overlaps(a, b) {
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  }

  /** 이름표만 옮긴다. 나라의 점과 번호는 원래 좌표에 고정한다. */
  function labelOffset(label, labels, markers, view, kind, sizes) {
    function labelBox(item, width, font, offset) {
      var x = item.x / 100 * width + offset.x;
      var y = item.y / 100 * width * view.height / view.width + offset.y;
      var halfWidth = item.name.length * font / 2, halfHeight = font * .6;
      return { left: x - halfWidth, right: x + halfWidth, top: y - halfHeight, bottom: y + halfHeight };
    }
    function inspect(offset, otherLabels) {
      var penalty = 0;
      for (var s = 0; s < sizes.length; s++) {
        var width = sizes[s][0], font = sizes[s][1], height = width * view.height / view.width;
        var box = labelBox(label, width, font, offset);
        if (box.left < 0 || box.right > width || box.top < 0 || box.bottom > height) return -1;
        for (var m = 0; m < markers.length; m++) {
          var marker = markers[m], x = marker.x / 100 * width, y = marker.y / 100 * height;
          var pointBox = kind === 'quiz'
            ? { left: x - 18, right: x + 18, top: y - 39, bottom: y + 8 }
            : { left: x - 13, right: x + 13, top: y - 13, bottom: y + 13 };
          if (overlaps(box, pointBox)) return -1;
          if (kind === 'region') {
            var nameWidth = Math.min(208, marker.name.length * 18 + 20);
            if (overlaps(box, { left: x - nameWidth / 2, right: x + nameWidth / 2, top: y + 19, bottom: y + 58 })) return -1;
          }
        }
        if (otherLabels) labels.forEach(function (other) {
          if (other !== label && overlaps(box, labelBox(other, width, font, other.offset || { x: 0, y: 0 }))) penalty += 1;
        });
      }
      return penalty;
    }
    var zero = { x: 0, y: 0 };
    if (!markers.length || inspect(zero, false) >= 0) return zero;
    var best = zero, bestScore = Infinity;
    var limit = kind === 'region' ? 48 : 32;
    for (var dx = -limit; dx <= limit; dx += 8) {
      for (var dy = -limit; dy <= limit; dy += 8) {
        var candidate = { x: dx, y: dy }, penalty = inspect(candidate, true);
        if (penalty < 0) continue;
        var score = dx * dx + dy * dy + penalty * 256;
        if (score < bestScore) { best = candidate; bestScore = score; }
      }
    }
    return best;
  }

  function continentLabels(view, active, countries, kind) {
    var labels = CONTINENTS.map(function (continent) {
      var p = project([continent.lng, continent.lat]);
      // 날짜변경선을 가로지르는 확대 화면에서도 같은 지리 좌표의 이름표를 쓴다.
      while (p.x < view.x) p.x += WORLD_WIDTH;
      while (p.x > view.x + view.width) p.x -= WORLD_WIDTH;
      var x = (p.x - view.x) / view.width * 100;
      var y = (p.y - view.y) / view.height * 100;
      if (x < 5 || x > 95 || y < 7 || y > 93) return null;
      return { name: continent.name, x: x, y: y };
    }).filter(Boolean);
    var markers = (countries || []).map(function (country) {
      var p = project(coord(country));
      return { name: country.ko, x: (p.x - view.x) / view.width * 100, y: (p.y - view.y) / view.height * 100 };
    });
    // 확대나 화면 회전 때 이름표만 해당 폭에 맞춰 바뀐다. 지리 좌표와 문제 보기는 그대로다.
    var ranges = [
      [[236, 11.2]], [[340, 16]], [[600, 16]], [[1000, 16]]
    ];
    ranges.forEach(function (sizes) {
      labels.forEach(function (label) { label.offset = null; });
      labels.forEach(function (label) {
        label.offset = labelOffset(label, labels, markers, view, kind, sizes);
        if (!label.offsets) label.offsets = [];
        label.offsets.push(label.offset);
      });
    });
    return labels.map(function (label) {
      var offsets = label.offsets.map(function (offset, index) {
        var suffix = index ? '-' + index : '';
        var width = ranges[index][0][0];
        return ';--map-label-x' + suffix + ':' + (offset.x / width * 100) + 'cqw;--map-label-y' + suffix + ':' + (offset.y / width * 100) + 'cqw';
      }).join('');
      return '<span class="map-continent-label' + (label.name === active ? ' map-continent-label--active' : '') +
        '" aria-hidden="true" style="' + percent(label.x, label.y) +
        offsets + '">' + label.name + '</span>';
    }).join('');
  }

  function equator(view) {
    if (view.y > WORLD_HEIGHT / 2 || view.y + view.height < WORLD_HEIGHT / 2) return '';
    return '<line class="map-equator" x1="' + view.x + '" y1="500" x2="' +
      (view.x + view.width) + '" y2="500" vector-effect="non-scaling-stroke"></line>';
  }

  function worldView() {
    return { x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT };
  }

  function regionView(country) {
    var p = project(coord(country));
    // 넓은 나라는 더 넓게 보되 투영 비율은 세계지도와 동일하게 유지한다.
    var widths = { ru: 1050, ca: 850, us: 850, cn: 750, au: 750, br: 650, id: 650, kz: 650, in: 650 };
    var width = widths[country.code] || 500;
    var height = width * 3 / 4;
    return { x: p.x - width / 2, y: Math.max(0, Math.min(WORLD_HEIGHT - height, p.y - height / 2)),
      width: width, height: height };
  }

  function describe(country) {
    var p = coord(country);
    if (!p) throw new Error('이 나라의 지도 좌표가 없습니다.');
    return {
      continent: country.continent || '',
      region: country.region || '',
      text: [country.ko, country.continent, country.region].filter(Boolean).join(' · '),
      coordinates: (p[1] < 0 ? '남위 ' : '북위 ') + Math.abs(p[1]) + '° · ' +
        (p[0] < 0 ? '서경 ' : '동경 ') + Math.abs(p[0]) + '°'
    };
  }

  function viewportBoxes(view) {
    // 세계지도의 양 끝은 이어져 있다. 경도 ±180°를 넘는 확대 범위는 양 끝에 나누어 보여 준다.
    var boxes = '';
    [-WORLD_WIDTH, 0, WORLD_WIDTH].forEach(function (offset) {
      var left = Math.max(0, view.x + offset);
      var right = Math.min(WORLD_WIDTH, view.x + offset + view.width);
      if (right <= left) return;
      boxes += '<span class="map-viewport-box" aria-hidden="true" style="' +
        percent(left / WORLD_WIDTH * 100, view.y / WORLD_HEIGHT * 100) +
        ';width:' + ((right - left) / WORLD_WIDTH * 100) + '%;height:' + (view.height / WORLD_HEIGHT * 100) + '%"></span>';
    });
    return boxes;
  }

  function contextMap(country, view, detailed, viewport) {
    var p = project(coord(country));
    var art = land();
    // 육지 원자료를 복사해서 날짜변경선의 반대쪽을 이어 붙인다. 핀의 좌표는 옮기지 않는다.
    if (view.x < 0) art += '<g transform="translate(-2000 0)">' + land() + '</g>';
    if (view.x + view.width > WORLD_WIDTH) art += '<g transform="translate(2000 0)">' + land() + '</g>';
    var point = '<span class="map-location-marker" aria-hidden="true" style="' +
      percent((p.x - view.x) / view.width * 100, (p.y - view.y) / view.height * 100) + '">' +
      '<span class="map-location-halo"></span><span class="map-location-point"></span>' +
      (detailed ? '<span class="map-location-label-country">' + esc(country.ko) + '</span>' : '') + '</span>';
    return '<div class="map-context-canvas map-context-canvas--' + (detailed ? 'region' : 'world') +
      '" role="img" aria-label="' + esc(country.ko + (detailed ? ' 주변 확대 지도. ' : '의 세계 위치. ') +
        describe(country).coordinates + '. 점은 나라의 대표 위치입니다.') + '">' +
      '<svg class="map-context-land" viewBox="' + [view.x, view.y, view.width, view.height].join(' ') +
      '" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">' + art + equator(view) + '</svg>' +
      (viewport ? viewportBoxes(viewport) : '') + continentLabels(view, country.continent, [country], detailed ? 'region' : 'world') + point + '</div>';
  }

  function study(country, options) {
    if (!coord(country)) throw new Error('이 나라의 지도 좌표가 없습니다.');
    var detailed = !options || options.detail !== false;
    var view = regionView(country);
    return '<div class="map-learning' + (detailed ? '' : ' map-learning--world-only') + '">' +
      '<section class="map-world-context"><h3>세계에서 어디일까요?</h3>' +
      contextMap(country, worldView(), false, detailed ? view : null) +
      '<p class="map-context-caption">' + (detailed ? '테두리 안을 확대 지도에서 크게 보아요.' : '점을 따라 나라의 위치를 살펴보아요.') + '</p></section>' +
      (detailed ? '<section class="map-region-context"><h3>' + esc(country.ko) + ' 주변을 크게 보기</h3>' +
        contextMap(country, view, true) + '<p class="map-context-caption">지도 위쪽은 북쪽이에요.</p></section>' : '') +
      '<p class="map-location-note">점은 나라의 대표 위치예요. 나라의 크기나 국경을 나타내지는 않아요.</p></div>';
  }

  function render(options) {
    if (!Array.isArray(options) || options.length !== 4 || !fits(options, MIN_WIDTH)) {
      throw new Error('지도에는 겹치지 않는 보기 네 개가 필요합니다.');
    }
    return '<div class="map-board"><div class="map-surface">' +
      '<svg class="map-land" viewBox="0 0 2000 1000" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">' +
      land() + equator(worldView()) + '</svg>' + continentLabels(worldView(), null, options, 'quiz') +
      options.map(function (country, index) {
        var p = coord(country);
        return '<button type="button" class="map-pin answer-btn" data-code="' + esc(country.code) +
          '" aria-label="위치 ' + (index + 1) + '" style="left:' + ((p[0] + 180) / 360 * 100) +
          '%;top:' + ((90 - p[1]) / 180 * 100) + '%"><span class="map-pin-point" aria-hidden="true"></span><span class="map-dot" aria-hidden="true">' +
          (index + 1) + '</span></button>';
      }).join('') + '</div></div>';
  }

  FQ.map = { chooseOptions: chooseOptions, render: render, study: study, describe: describe, fits: fits, MIN_WIDTH: MIN_WIDTH };
})(window);
