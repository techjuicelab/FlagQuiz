/* 나라의 실제 영역과 좌표를 함께 쓰는 지도 보기. 채점과 화면 수명은 app.js가 맡는다. */
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

  function validBounds(bounds) {
    return Array.isArray(bounds) && bounds.length === 4 && bounds.every(function (value) {
      return typeof value === 'number' && isFinite(value);
    }) && bounds[0] < bounds[2] && bounds[1] < bounds[3];
  }

  function region(country) {
    var shape = country && FQ.mapRegions && FQ.mapRegions[country.code];
    return shape && typeof shape.d === 'string' && shape.d && validBounds(shape.bounds) ? shape : null;
  }

  function focusBounds(country) {
    var shape = region(country);
    return shape ? (validBounds(shape.focusBounds) ? shape.focusBounds : shape.bounds) : null;
  }

  function tiny(country) {
    var bounds = focusBounds(country);
    return !!bounds && bounds[2] - bounds[0] < 12 && bounds[3] - bounds[1] < 8;
  }

  var borderSource = null, borderPaths = '';
  function countryPaths() {
    if (!FQ.mapRegions) throw new Error('지도 나라 영역 자료가 없습니다.');
    if (borderSource !== FQ.mapRegions) {
      borderSource = FQ.mapRegions;
      borderPaths = Object.keys(borderSource).sort().map(function (code) {
        return '<path class="map-country" data-code="' + esc(code) + '" d="' + esc(borderSource[code].d) +
          '" fill-rule="evenodd" vector-effect="non-scaling-stroke"></path>';
      }).join('');
    }
    return borderPaths;
  }

  function highlighted(country, mode) {
    var shape = region(country);
    if (!shape) throw new Error('이 나라의 지도 영역 자료가 없습니다.');
    return '<path class="map-region ' + mode + (tiny(country) ? ' is-tiny' : '') +
      '" data-code="' + esc(country.code) + '" d="' + esc(shape.d) +
      '" fill-rule="evenodd" vector-effect="non-scaling-stroke"></path>';
  }

  function countryArt(countries, mode) {
    return land() + countryPaths() + countries.map(function (country) { return highlighted(country, mode); }).join('');
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
    var bounds = focusBounds(country);
    if (bounds) {
      // 주국토와 인접 섬을 모두 담고 주변 나라도 남긴다. 먼 영토는 위의 세계지도에 함께 색칠한다.
      var width = Math.max(250, (bounds[2] - bounds[0]) / .72, (bounds[3] - bounds[1]) / .64 * 4 / 3);
      var height = width * 3 / 4;
      return { x: (bounds[0] + bounds[2] - width) / 2,
        y: Math.max(0, Math.min(WORLD_HEIGHT - height, (bounds[1] + bounds[3] - height) / 2)),
        width: width, height: height };
    }
    // 영역 자료가 없는 옛 자료와 섞여도 대표 좌표 중심의 지역 지도는 유지한다.
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
    var art = countryArt([country], 'is-study');
    // 국경과 강조 영역도 육지와 함께 복사해 날짜변경선 반대쪽 영토를 이어 붙인다.
    if (view.x < 0) art += '<g transform="translate(-2000 0)">' + countryArt([country], 'is-study') + '</g>';
    if (view.x + view.width > WORLD_WIDTH) art += '<g transform="translate(2000 0)">' + countryArt([country], 'is-study') + '</g>';
    var point = '<span class="map-location-marker" aria-hidden="true" style="' +
      percent((p.x - view.x) / view.width * 100, (p.y - view.y) / view.height * 100) + '">' +
      (detailed ? '<span class="map-location-label-country">' + esc(country.ko) + '</span>' : '') + '</span>';
    return '<div class="map-context-canvas map-context-canvas--' + (detailed ? 'region' : 'world') +
      '" role="img" aria-label="' + esc(country.ko + (detailed ? ' 주변 확대 지도. ' : '의 세계 위치. ') +
        describe(country).coordinates + '. 색칠한 영역이 이 나라입니다.') + '">' +
      '<svg class="map-context-land" viewBox="' + [view.x, view.y, view.width, view.height].join(' ') +
      '" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">' + art + equator(view) + '</svg>' +
      (viewport ? viewportBoxes(viewport) : '') + continentLabels(view, country.continent, [country], detailed ? 'region' : 'world') + point + '</div>';
  }

  /** 세계지도에서 작은 나라는 같은 실제 경계를 별도 확대창에서도 보여 준다. */
  function inset(country) {
    if (!tiny(country)) return '';
    var bounds = focusBounds(country);
    var width = bounds[2] - bounds[0], height = bounds[3] - bounds[1];
    var pad = Math.max(width, height) * .3;
    return '<div class="map-inset" role="img" aria-label="' + esc(country.ko) + '의 작은 영역 확대">' +
      '<span class="map-inset-label">작은 나라 크게 보기</span>' +
      '<svg class="map-inset-shape" viewBox="' + [bounds[0] - pad, bounds[1] - pad, width + pad * 2, height + pad * 2].join(' ') +
        '" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">' + countryArt([country], 'is-study') + '</svg></div>';
  }

  function study(country, options) {
    if (!coord(country)) throw new Error('이 나라의 지도 좌표가 없습니다.');
    var detailed = !options || options.detail !== false;
    var view = regionView(country);
    return '<div class="map-learning' + (detailed ? '' : ' map-learning--world-only') + '">' +
      '<section class="map-world-context"><h3>세계에서 어디일까요?</h3>' +
      contextMap(country, worldView(), false, detailed ? view : null) +
      '<p class="map-context-caption">' + (detailed ? '테두리 안을 확대 지도에서 크게 보아요.' : '색칠한 나라의 영역을 살펴보아요.') + '</p></section>' +
      (detailed ? '<section class="map-region-context"><h3>' + esc(country.ko) + ' 주변을 크게 보기</h3>' +
        contextMap(country, view, true) + inset(country) + '<p class="map-context-caption">지도 위쪽은 북쪽이에요.</p></section>' : '') +
      '<p class="map-location-note">색칠한 영역이 이 나라예요. 멀리 떨어진 영토는 세계지도에서 함께 살펴보아요.</p></div>';
  }

  function render(options) {
    if (!Array.isArray(options) || options.length !== 4 || !fits(options, MIN_WIDTH)) {
      throw new Error('지도에는 겹치지 않는 보기 네 개가 필요합니다.');
    }
    return '<div class="map-board"><div class="map-surface">' +
      '<svg class="map-land" viewBox="0 0 2000 1000" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">' +
      countryArt(options, 'is-option') + equator(worldView()) + '</svg>' + continentLabels(worldView(), null, options, 'quiz') +
      options.map(function (country, index) {
        var p = coord(country);
        return '<button type="button" class="map-pin answer-btn" data-code="' + esc(country.code) +
          '" aria-label="위치 ' + (index + 1) + '" style="left:' + ((p[0] + 180) / 360 * 100) +
          '%;top:' + ((90 - p[1]) / 180 * 100) + '%"><span class="map-dot" aria-hidden="true">' +
          (index + 1) + '</span></button>';
      }).join('') + '</div></div>';
  }

  /* 번갈아 말하기의 기록 지도. 퀴즈 보기와 달리 모든 나라의 실제 위치를 누적한다. */
  function collection(countries, options) {
    var opts = options || {}, seen = {}, list = [];
    (countries || []).forEach(function (country) {
      if (coord(country) && !seen[country.code]) { seen[country.code] = true; list.push(country); }
    });
    return '<div class="chain-map-scroll" role="region" aria-label="말한 나라가 쌓이는 세계지도. 좌우로 움직여 볼 수 있어요." tabindex="0">' +
      '<div class="chain-map-canvas">' +
      '<svg class="map-context-land" viewBox="0 0 2000 1000" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">' +
      land() + equator(worldView()) + '</svg>' + continentLabels(worldView(), null, [], 'world') +
      list.map(function (country) {
        var p = coord(country), owner = opts.owners && opts.owners[country.code] === 1 ? 1 : 0;
        var active = country.code === opts.activeCode;
        return '<button type="button" class="chain-map-marker chain-owner-' + owner + (active ? ' is-active' : '') +
          '" data-chain-country="' + esc(country.code) + '" aria-label="' + esc(country.ko + ' 위치 보기') +
          '" aria-pressed="' + active + '" title="' + esc(country.ko) + '" style="' +
          percent((p[0] + 180) / 360 * 100, (90 - p[1]) / 180 * 100) + '"><span aria-hidden="true"></span></button>';
      }).join('') + '</div></div>';
  }

  /** 채점·힌트 상태는 번호 단추와 영역에 함께 적용한다. 화면 수명과 채점은 app.js가 맡는다. */
  function markAnswer(root, answerCode, selectedCode) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('.map-region'), function (path) {
      var code = path.getAttribute('data-code');
      path.classList.remove('is-focused', 'is-correct', 'is-wrong', 'is-muted', 'is-removed');
      if (code === answerCode) path.classList.add('is-correct');
      else if (code === selectedCode) path.classList.add('is-wrong');
      else path.classList.add('is-muted');
      path.setAttribute('data-disabled', 'true');
    });
  }

  function removeOptions(root, codes) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('.map-region'), function (path) {
      var removed = (codes || []).indexOf(path.getAttribute('data-code')) !== -1;
      path.classList.toggle('is-removed', removed);
      if (removed) path.setAttribute('data-disabled', 'true');
      else path.removeAttribute('data-disabled');
    });
  }

  function highlight(root, code) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('.map-region'), function (path) {
      path.classList.toggle('is-focused', !!code && path.getAttribute('data-code') === code && path.getAttribute('data-disabled') !== 'true');
    });
  }

  FQ.map = { chooseOptions: chooseOptions, render: render, study: study, collection: collection, describe: describe, fits: fits, MIN_WIDTH: MIN_WIDTH,
    markAnswer: markAnswer, removeOptions: removeOptions, highlight: highlight };
})(window);
