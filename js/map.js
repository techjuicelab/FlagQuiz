/* 나라의 실제 영역과 좌표를 함께 쓰는 지도 보기. 채점과 화면 수명은 app.js가 맡는다. */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var TOUCH_SIZE = 44;
  var MIN_WIDTH = 280;
  var PADDING = TOUCH_SIZE / 2;
  var WORLD_WIDTH = 2000;
  var WORLD_HEIGHT = 1000;
  // 32개 색상환 × 4개 채도 × 2개 밝기의 명시 팔레트. 서로 다른 RGB 256개를 보존한다.
  var PALETTE_256 = Object.freeze([
    '#d05858', '#d06e58', '#d08558', '#d09b58', '#d0b258', '#d0c858', '#c1d058', '#aad058',
    '#94d058', '#7dd058', '#67d058', '#58d05f', '#58d076', '#58d08c', '#58d0a3', '#58d0b9',
    '#58d0d0', '#58b9d0', '#58a3d0', '#588cd0', '#5876d0', '#585fd0', '#6758d0', '#7d58d0',
    '#9458d0', '#aa58d0', '#c158d0', '#d058c8', '#d058b2', '#d0589b', '#d05885', '#d0586e',
    '#df4949', '#df6549', '#df8149', '#df9d49', '#dfb949', '#dfd549', '#ccdf49', '#b0df49',
    '#94df49', '#78df49', '#5cdf49', '#49df52', '#49df6e', '#49df8b', '#49dfa7', '#49dfc3',
    '#49dfdf', '#49c3df', '#49a7df', '#498bdf', '#496edf', '#4952df', '#5c49df', '#7849df',
    '#9449df', '#b049df', '#cc49df', '#df49d5', '#df49b9', '#df499d', '#df4981', '#df4965',
    '#ee3a3a', '#ee5c3a', '#ee7d3a', '#ee9f3a', '#eec13a', '#eee33a', '#d7ee3a', '#b6ee3a',
    '#94ee3a', '#72ee3a', '#50ee3a', '#3aee45', '#3aee67', '#3aee89', '#3aeeaa', '#3aeecc',
    '#3aeeee', '#3accee', '#3aaaee', '#3a89ee', '#3a67ee', '#3a45ee', '#503aee', '#723aee',
    '#943aee', '#b63aee', '#d73aee', '#ee3ae3', '#ee3ac1', '#ee3a9f', '#ee3a7d', '#ee3a5c',
    '#fd2b2b', '#fd522b', '#fd7a2b', '#fda12b', '#fdc82b', '#fdf02b', '#e3fd2b', '#bbfd2b',
    '#94fd2b', '#6dfd2b', '#45fd2b', '#2bfd38', '#2bfd5f', '#2bfd87', '#2bfdae', '#2bfdd5',
    '#2bfdfd', '#2bd5fd', '#2baefd', '#2b87fd', '#2b5ffd', '#2b38fd', '#452bfd', '#6d2bfd',
    '#942bfd', '#bb2bfd', '#e32bfd', '#fd2bf0', '#fd2bc8', '#fd2ba1', '#fd2b7a', '#fd2b52',
    '#dd8888', '#dd9888', '#dda888', '#ddb888', '#ddc888', '#ddd888', '#d3dd88', '#c3dd88',
    '#b3dd88', '#a2dd88', '#92dd88', '#88dd8d', '#88dd9d', '#88ddad', '#88ddbd', '#88ddcd',
    '#88dddd', '#88cddd', '#88bddd', '#88addd', '#889ddd', '#888ddd', '#9288dd', '#a288dd',
    '#b388dd', '#c388dd', '#d388dd', '#dd88d8', '#dd88c8', '#dd88b8', '#dd88a8', '#dd8898',
    '#e87d7d', '#e8917d', '#e8a57d', '#e8b97d', '#e8cd7d', '#e8e17d', '#dbe87d', '#c7e87d',
    '#b3e87d', '#9ee87d', '#8ae87d', '#7de884', '#7de898', '#7de8ac', '#7de8c0', '#7de8d4',
    '#7de8e8', '#7dd4e8', '#7dc0e8', '#7dace8', '#7d98e8', '#7d84e8', '#8a7de8', '#9e7de8',
    '#b37de8', '#c77de8', '#db7de8', '#e87de1', '#e87dcd', '#e87db9', '#e87da5', '#e87d91',
    '#f37272', '#f38a72', '#f3a272', '#f3bb72', '#f3d372', '#f3eb72', '#e3f372', '#cbf372',
    '#b3f372', '#9af372', '#82f372', '#72f37a', '#72f392', '#72f3aa', '#72f3c3', '#72f3db',
    '#72f3f3', '#72dbf3', '#72c3f3', '#72aaf3', '#7292f3', '#727af3', '#8272f3', '#9a72f3',
    '#b372f3', '#cb72f3', '#e372f3', '#f372eb', '#f372d3', '#f372bb', '#f372a2', '#f3728a',
    '#fd6868', '#fd8468', '#fda068', '#fdbc68', '#fdd868', '#fdf468', '#ebfd68', '#cffd68',
    '#b3fd68', '#96fd68', '#7afd68', '#68fd71', '#68fd8d', '#68fda9', '#68fdc5', '#68fde1',
    '#68fdfd', '#68e1fd', '#68c5fd', '#68a9fd', '#688dfd', '#6871fd', '#7a68fd', '#9668fd',
    '#b368fd', '#cf68fd', '#eb68fd', '#fd68f4', '#fd68d8', '#fd68bc', '#fd68a0', '#fd6884'
  ]);
  var NEUTRAL_COUNTRY_COLOR = '#64748b';
  // 가까운 5개국과 주영역 bbox 인접 그래프에서 CIE76 색차를 최대화한 고정 표다. 추가 국가가 기존 색을 바꾸지 않는다.
  // 재생성: node scripts/build-map-palette.mjs --write (전체 재배정은 --rebuild를 명시한다).
  var COUNTRY_COLOR_INDEX = Object.freeze({
    ad: 84, ae: 123, af: 82, ag: 40, al: 125, am: 107, ao: 142, ar: 1,
    at: 71, au: 73, az: 184, ba: 54, bb: 131, bd: 157, be: 124, bf: 43,
    bg: 103, bh: 130, bi: 255, bj: 36, bn: 49, bo: 165, br: 213, bs: 203,
    bt: 81, bw: 223, by: 34, bz: 193, ca: 60, cd: 59, cf: 226, cg: 19,
    ch: 47, ci: 176, cl: 252, cm: 233, cn: 96, co: 31, cr: 11, cu: 162,
    cv: 211, cy: 240, cz: 239, de: 51, dj: 42, dk: 33, dm: 26, do: 29,
    dz: 110, ec: 218, ee: 69, eg: 120, er: 145, es: 253, et: 95, fi: 225,
    fj: 244, fm: 231, fr: 98, ga: 174, gb: 115, gd: 39, ge: 68, gh: 243,
    gm: 156, gn: 0, gq: 224, gr: 88, gt: 5, gw: 56, gy: 222, hn: 248,
    hr: 79, ht: 197, hu: 114, id: 85, ie: 159, il: 101, in: 105, iq: 112,
    ir: 100, is: 208, it: 93, jm: 22, jo: 149, jp: 189, ke: 57, kg: 106,
    kh: 64, ki: 194, km: 229, kn: 212, kp: 104, kr: 207, kw: 116, kz: 118,
    la: 102, lb: 76, lc: 30, li: 89, lk: 111, lr: 236, ls: 148, lt: 242,
    lu: 230, lv: 21, ly: 146, ma: 67, mc: 70, md: 132, me: 72, mg: 180,
    mh: 16, mk: 17, ml: 55, mm: 122, mn: 121, mr: 210, mt: 66, mu: 44,
    mv: 86, mw: 250, mx: 202, my: 196, mz: 192, na: 247, ne: 32, ng: 18,
    ni: 143, nl: 15, no: 92, np: 4, nr: 254, nz: 133, om: 241, pa: 3,
    pe: 237, pg: 209, ph: 75, pk: 119, pl: 91, pt: 178, pw: 87, py: 190,
    qa: 108, ro: 90, rs: 97, ru: 113, rw: 35, sa: 94, sb: 249, sc: 48,
    sd: 234, se: 235, sg: 74, si: 99, sk: 65, sl: 37, sm: 52, sn: 238,
    so: 227, sr: 45, ss: 50, st: 251, sv: 221, sy: 117, sz: 246, td: 58,
    tg: 63, th: 80, tj: 228, tl: 62, tm: 126, tn: 245, to: 144, tr: 127,
    tt: 214, tv: 232, tz: 147, ua: 109, ug: 77, us: 179, uy: 46, uz: 78,
    va: 177, vc: 206, ve: 164, vn: 83, vu: 2, ws: 61, ye: 53, za: 38,
    zm: 41, zw: 175
  });

  function countryColor(codeOrCountry) {
    var code = typeof codeOrCountry === 'string' ? codeOrCountry : codeOrCountry && codeOrCountry.code;
    var index = typeof code === 'string' ? COUNTRY_COLOR_INDEX[code.trim().toLowerCase()] : undefined;
    return typeof index === 'number' ? PALETTE_256[index] : NEUTRAL_COUNTRY_COLOR;
  }

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

  function capitalCoord(country) {
    var p = country && FQ.capitalCoords && FQ.capitalCoords[country.code];
    return country && country.capital && Array.isArray(p) && p.length === 2 &&
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

  // 표시 범위에 가장 가까운 같은 경도의 사본을 쓴다. 실제 경위도는 바꾸지 않는다.
  function projectInView(p, view) {
    var point = project(p);
    point.x += Math.round((view.x + view.width / 2 - point.x) / WORLD_WIDTH) * WORLD_WIDTH;
    return point;
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
          if (marker.capital) {
            var capitalWidth = Math.min(190, marker.name.length * 16 + 28);
            if (overlaps(box, { left: x - capitalWidth, right: x + capitalWidth, top: y - 54, bottom: y + 54 })) return -1;
          }
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

  function continentLabels(view, active, countries, kind, capitalCountry) {
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
      var p = projectInView(coord(country), view);
      return { name: country.ko, x: (p.x - view.x) / view.width * 100, y: (p.y - view.y) / view.height * 100 };
    });
    if (capitalCoord(capitalCountry)) {
      var capitalPoint = projectInView(capitalCoord(capitalCountry), view);
      markers.push({ name: '수도 ' + capitalCountry.capital, capital: true,
        x: (capitalPoint.x - view.x) / view.width * 100, y: (capitalPoint.y - view.y) / view.height * 100 });
    }
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
      bounds = bounds.slice();
      if (capitalCoord(country)) {
        var capital = projectInView(capitalCoord(country), { x: bounds[0], width: bounds[2] - bounds[0] });
        // 나라 대표점과 수도가 다른 섬에 있어도 실제 수도까지 같은 확대 지도 안에 담는다.
        bounds[0] = Math.min(bounds[0], capital.x);
        bounds[1] = Math.min(bounds[1], capital.y);
        bounds[2] = Math.max(bounds[2], capital.x);
        bounds[3] = Math.max(bounds[3], capital.y);
      }
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

  function capitalMarker(country, view) {
    var p = capitalCoord(country);
    if (!p) return '';
    var point = projectInView(p, view), radius = view.width * .015, star = [];
    for (var i = 0; i < 10; i++) {
      var angle = -Math.PI / 2 + i * Math.PI / 5;
      var length = i % 2 ? radius * .45 : radius;
      star.push((i ? 'L' : 'M') + (Math.cos(angle) * length).toFixed(6) + ',' + (Math.sin(angle) * length).toFixed(6));
    }
    return '<g class="map-capital-marker" data-code="' + esc(country.code) +
      '" data-capital-lng="' + p[0] + '" data-capital-lat="' + p[1] +
      '" transform="translate(' + point.x + ' ' + point.y + ')">' +
      '<circle class="map-capital-halo" cx="0" cy="0" r="' + (view.width * .023) + '" vector-effect="non-scaling-stroke"></circle>' +
      '<path class="map-capital-star" d="' + star.join(' ') + 'Z" vector-effect="non-scaling-stroke"></path></g>';
  }

  function capitalLabel(country, view) {
    var p = capitalCoord(country);
    if (!p) return '';
    var point = projectInView(p, view);
    var x = (point.x - view.x) / view.width * 100, y = (point.y - view.y) / view.height * 100;
    return '<span class="map-capital-label' + (x > 50 ? ' map-capital-label--left' : '') +
      (y < 25 ? ' map-capital-label--below' : '') + '" aria-hidden="true" style="' + percent(x, y) +
      ';--map-capital-label-room:calc(' + (x > 50 ? x : 100 - x) + '% - 18px)' +
      '"><span>수도</span> <strong>' + esc(country.capital) + '</strong></span>';
  }

  function coordinateText(p) {
    return (p[1] < 0 ? '남위 ' : '북위 ') + Math.abs(p[1]) + '° · ' +
      (p[0] < 0 ? '서경 ' : '동경 ') + Math.abs(p[0]) + '°';
  }

  function contextMap(country, view, detailed, viewport) {
    var p = projectInView(coord(country), view);
    var capital = detailed && capitalCoord(country);
    var art = countryArt([country], 'is-study');
    // 국경과 강조 영역도 육지와 함께 복사해 날짜변경선 반대쪽 영토를 이어 붙인다.
    if (view.x < 0) art += '<g transform="translate(-2000 0)">' + countryArt([country], 'is-study') + '</g>';
    if (view.x + view.width > WORLD_WIDTH) art += '<g transform="translate(2000 0)">' + countryArt([country], 'is-study') + '</g>';
    var capitalPosition = capital ? projectInView(capital, view) : null;
    var captionTop = capitalPosition && (capitalPosition.y - view.y) / view.height > .65;
    var point = '<span class="map-location-marker' + (capital ? ' map-location-marker--caption' + (captionTop ? ' is-top' : '') : '') +
      '" aria-hidden="true" style="' + (capital ? (captionTop ? 'left:12px;top:12px' : 'left:12px;bottom:12px') :
        percent((p.x - view.x) / view.width * 100, (p.y - view.y) / view.height * 100)) + '">' +
      (detailed ? '<span class="map-location-label-country">' + esc(country.ko) + '</span>' : '') + '</span>';
    return '<div class="map-context-canvas map-context-canvas--' + (detailed ? 'region' : 'world') +
      '" role="img" aria-label="' + esc(country.ko + (detailed ? ' 주변 확대 지도. ' : '의 세계 위치. ') +
        describe(country).coordinates + '. 색칠한 영역이 이 나라입니다.' +
        (capital ? ' 별표는 수도 ' + country.capital + '의 실제 위치입니다. ' + coordinateText(capital) + '.' : '')) + '">' +
      '<svg class="map-context-land" viewBox="' + [view.x, view.y, view.width, view.height].join(' ') +
      '" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">' + art + equator(view) +
        (capital ? capitalMarker(country, view) : '') + '</svg>' +
      (viewport ? viewportBoxes(viewport) : '') + continentLabels(view, country.continent, [country], detailed ? 'region' : 'world', capital ? country : null) +
        point + (capital ? capitalLabel(country, view) : '') + '</div>';
  }

  /** 세계지도에서 작은 나라는 같은 실제 경계를 별도 확대창에서도 보여 준다. */
  function inset(country) {
    if (!tiny(country)) return '';
    var bounds = focusBounds(country);
    bounds = bounds.slice();
    var capital = capitalCoord(country);
    if (capital) {
      var point = projectInView(capital, { x: bounds[0], width: bounds[2] - bounds[0] });
      bounds[0] = Math.min(bounds[0], point.x);
      bounds[1] = Math.min(bounds[1], point.y);
      bounds[2] = Math.max(bounds[2], point.x);
      bounds[3] = Math.max(bounds[3], point.y);
    }
    var width = bounds[2] - bounds[0], height = bounds[3] - bounds[1];
    var pad = Math.max(width, height) * .3;
    var view = { x: bounds[0] - pad, y: bounds[1] - pad, width: width + pad * 2, height: height + pad * 2 };
    return '<div class="map-inset" role="img" aria-label="' + esc(country.ko) + '의 작은 영역 확대">' +
      '<span class="map-inset-label">작은 나라 크게 보기</span>' +
      '<svg class="map-inset-shape" viewBox="' + [view.x, view.y, view.width, view.height].join(' ') +
        '" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">' + countryArt([country], 'is-study') +
          (capital ? capitalMarker(country, view) : '') + '</svg>' +
      (capital ? '<span class="map-capital-inset-label">★ 수도 ' + esc(country.capital) + '</span>' : '') + '</div>';
  }

  function study(country, options) {
    if (!coord(country)) throw new Error('이 나라의 지도 좌표가 없습니다.');
    var detailed = !options || options.detail !== false;
    var view = regionView(country);
    var capital = capitalCoord(country);
    return '<div class="map-learning' + (detailed ? '' : ' map-learning--world-only') + '">' +
      '<section class="map-world-context"><h3>세계에서 어디일까요?</h3>' +
      contextMap(country, worldView(), false, detailed ? view : null) +
      '<p class="map-context-caption">' + (detailed ? '테두리 안을 확대 지도에서 크게 보아요.' : '색칠한 나라의 영역을 살펴보아요.') + '</p></section>' +
      (detailed ? '<section class="map-region-context"><h3>' + esc(country.ko) + ' 주변을 크게 보기</h3>' +
        contextMap(country, view, true) + inset(country) + '<p class="map-context-caption">지도 위쪽은 북쪽이에요.' +
          (capital ? ' ★ 별표는 수도 ' + esc(country.capital) + '의 실제 위치예요.' : '') + '</p></section>' : '') +
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

  /* 번갈아 말하기의 기록 지도. 나라 고유색으로 전체 영역을 누적하고 소유자 표시는 따로 보존한다. */
  function collection(countries, options) {
    var opts = options || {}, seen = {}, list = [];
    (countries || []).forEach(function (country) {
      if (coord(country) && !seen[country.code]) { seen[country.code] = true; list.push(country); }
    });
    var areas = list.filter(function (country) { return country.code !== opts.activeCode; });
    list.forEach(function (country) { if (country.code === opts.activeCode) areas.push(country); });
    return '<div class="chain-map-scroll" role="region" aria-label="말한 나라의 땅을 색칠한 세계지도. 나라의 땅이나 표시를 누르면 정보를 볼 수 있어요. 좌우로 움직여 볼 수 있어요." tabindex="0">' +
      '<div class="chain-map-canvas">' +
      '<svg class="map-context-land" viewBox="0 0 2000 1000" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">' +
      land() + countryPaths() + areas.map(function (country) {
        var shape = region(country);
        if (!shape) throw new Error('이 나라의 지도 영역 자료가 없습니다.');
        var owner = opts.owners && opts.owners[country.code] === 1 ? 1 : 0;
        var color = countryColor(country);
        return '<path class="chain-map-region chain-owner-' + owner + (country.code === opts.activeCode ? ' is-active' : '') +
          '" data-chain-country="' + esc(country.code) + '" data-code="' + esc(country.code) +
          '" data-country-color="' + color + '" style="--chain-country-color:' + color +
          '" d="' + esc(shape.d) + '" fill-rule="evenodd" vector-effect="non-scaling-stroke"></path>';
      }).join('') + equator(worldView()) + '</svg>' + continentLabels(worldView(), null, [], 'world') +
      list.map(function (country) {
        var p = coord(country), owner = opts.owners && opts.owners[country.code] === 1 ? 1 : 0;
        var active = country.code === opts.activeCode;
        var color = countryColor(country);
        return '<button type="button" class="chain-map-marker chain-owner-' + owner + (active ? ' is-active' : '') +
          '" data-chain-country="' + esc(country.code) + '" aria-label="' + esc(country.ko + ' 나라 정보 보기') +
          '" aria-pressed="' + active + '" title="' + esc(country.ko) + '" data-country-color="' + color +
          '" style="--chain-country-color:' + color + ';' +
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
    markAnswer: markAnswer, removeOptions: removeOptions, highlight: highlight, palette256: PALETTE_256, countryColor: countryColor };
})(window);
