/* 국기 퀴즈 - 화면 공통 도구 */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var doc = global.document;
  var delegatedListeners = new WeakMap();
  var modalState = null;
  var modalGeneration = 0;
  var modalSpeechGeneration = 0;
  // CSP가 인라인 이벤트를 차단해도 깨진 그림은 글자 설명만 남긴다.
  doc.addEventListener('error', function (event) {
    var image = event.target;
    if (!image || !image.getAttribute || image.getAttribute('data-country-art') === null) return;
    image.hidden = true;
    image.style.display = 'none';
  }, true);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** 작은 화면에서도 같은 모양으로 보이는 공통 선 아이콘. */
  function icon(name) {
    var paths = {
      home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
      flag: '<path d="M5 21V3m0 1c5-4 9 4 15 0v10c-6 4-10-4-15 0"/>',
      art: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
      map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16"/>',
      capital: '<path d="M3 21h18M5 21V9h6v12m0-16h8v16M7 12h2m-2 4h2m4-8h4m-4 4h4m-4 4h4"/>',
      book: '<path d="M12 5C9 3 5 3 2 4v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v16"/>',
      chart: '<path d="M4 20h17M7 16v-5m5 5V4m5 12V8"/>',
      settings: '<path d="m10 3-.6 2.2-2 .9-2-.6-2 3.5 1.5 1.6v2.8L3.4 15l2 3.5 2-.6 2 .9L10 21h4l.6-2.2 2-.9 2 .6 2-3.5-1.5-1.6v-2.8L20.6 9l-2-3.5-2 .6-2-.9L14 3Z"/><circle cx="12" cy="12" r="3"/>',
      eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
      mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
      keyboard: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.1m4 0h.1m4 0h.1m4 0h.1M6 12h.1m4 0h.1m4 0h.1m4 0h.1M7 16h10"/>',
      chevron: '<path d="m9 5 7 7-7 7"/>',
      back: '<path d="m14 5-7 7 7 7"/>',
      sound: '<path d="m11 4-6 5H2v6h3l6 5Zm5 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
      user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'
    };
    return '<svg class="ui-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.flag) + '</svg>';
  }

  function flagSrc(code) { return 'flags/' + code + '.svg'; }

  function artFor(code, axis) {
    axis = axis === 'place' ? 'place' : 'symbol';
    var subject = FQ.subjects && FQ.subjects[code] && FQ.subjects[code][axis];
    // noArt 는 원장에 남긴 보류다. 문장은 있어도 그림 파일이 없으니 경로를 만들면 깨진 그림이 뜬다.
    if (!subject || subject.noArt) return null;
    return { src: 'images/' + (axis === 'place' ? 'places/' : 'symbols/') + code + '.webp', alt: subject.ko };
  }

  /** 그림 파일이 없어도 소재 이름은 남는다 — 해설·결과 줄이 빈칸이 되지 않게 한다. */
  function artAlt(code, axis) {
    axis = axis === 'place' ? 'place' : 'symbol';
    var subject = FQ.subjects && FQ.subjects[code] && FQ.subjects[code][axis];
    return subject ? subject.ko : '';
  }

  function countryArt(code) {
    if (!FQ.features || !FQ.features.on('art')) return '';
    return ['symbol', 'place'].map(function (axis) {
      var subject = FQ.subjects && FQ.subjects[code] && FQ.subjects[code][axis];
      if (!subject) return '';
      // 그림이 보류된 소재도 이름은 배운다. 그림 자리만 비우고 소재 이름은 그대로 둔다.
      var art = artFor(code, axis);
      var label = axis === 'place' ? '나라 대표 명소 · ' : art ? '나라를 떠올리는 그림 · ' : '나라를 떠올리는 것 · ';
      return '<figure class="country-art">' +
        // 오프라인에서 아직 안 받아 둔 나라를 열면 깨진 아이콘이 뜨므로, 그때는 그림만 감추고
        // 아래 이름은 그대로 남긴다. 캡처 error 핸들러가 display:block 규칙까지 덮어 감춘다.
        (art ? '<img src="' + esc(art.src) + '" alt="' + esc(art.alt) + '" width="1024" height="768" loading="lazy"' +
          ' data-country-art="">' : '') +
        '<figcaption>' + label + esc(subject.ko) +
          ' <button class="btn btn-sm btn-ghost" data-speak-art="' + esc(subject.ko) + '" type="button" aria-label="' + esc(subject.ko) + ' 들어보기">🔊</button>' +
        '</figcaption></figure>';
    }).join('');
  }

  function main() { return doc.getElementById('main'); }

  function setMain(html) {
    if (modalState) closeModal();
    var m = main();
    // #main은 화면 사이에 남으므로, 이전 화면에서 맡긴 위임 이벤트를 먼저 해제한다.
    var listeners = delegatedListeners.get(m) || [];
    listeners.forEach(function (item) { m.removeEventListener(item.event, item.listener); });
    delegatedListeners.delete(m);
    m.innerHTML = html;
    global.scrollTo({ top: 0, behavior: 'auto' });
    if (m.focus) m.focus({ preventScroll: true });
    return m;
  }

  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || doc).querySelectorAll(sel));
  }

  function on(root, selector, event, fn) {
    var listener = function (ev) {
      var t = ev.target.closest(selector);
      if (t && root.contains(t)) fn(ev, t);
    };
    var listeners = delegatedListeners.get(root) || [];
    listeners.push({ event: event, listener: listener });
    delegatedListeners.set(root, listeners);
    root.addEventListener(event, listener);
  }

  /* --------- 나라 상세 모달 --------- */
  function closeModal() {
    modalGeneration++;
    modalSpeechGeneration++;
    var current = modalState;
    var back = current ? current.back : $('.modal-back');
    modalState = null;
    if (!back) return;
    if (FQ.speech && FQ.speech.abort) FQ.speech.abort();
    if (FQ.audio && FQ.audio.stopSpeaking) FQ.audio.stopSpeaking();
    if (back.remove) back.remove();
    if (current) {
      if (doc.body.style) doc.body.style.overflow = current.bodyOverflow;
      var opener = current.opener;
      if (opener && opener.focus && opener.isConnected !== false) opener.focus({ preventScroll: true });
    }
  }

  function countryModal(country) {
    if (!country) return;
    if (FQ.music) FQ.music.stop();
    var opener = modalState ? modalState.opener : doc.activeElement;
    closeModal();
    if (FQ.speech && FQ.speech.abort) FQ.speech.abort();
    if (FQ.audio && FQ.audio.stopSpeaking) FQ.audio.stopSpeaking();
    var generation = ++modalGeneration;
    var st = FQ.storage.allCountryStats()[country.code] || { seen: 0, correct: 0, wrong: 0, streak: 0 };
    var rate = st.seen ? Math.round((st.correct / st.seen) * 100) : null;
    var mapHTML = '';
    if (FQ.map && typeof FQ.map.study === 'function') mapHTML = FQ.map.study(country);
    else if (FQ.map && typeof FQ.map.renderStudy === 'function') mapHTML = FQ.map.renderStudy(country, flagSrc(country.code));
    var titleId = 'country-detail-title-' + country.code;
    var back = doc.createElement('div');
    back.className = 'modal-back';
    back.innerHTML =
      '<div class="modal country-detail" role="dialog" aria-modal="true" aria-labelledby="' + esc(titleId) + '" tabindex="-1">' +
        '<header class="country-detail-head">' +
          '<img class="big country-detail-flag" src="' + esc(flagSrc(country.code)) + '" alt="' + esc(country.ko) + ' 국기">' +
          '<div class="country-detail-heading"><span class="country-detail-eyebrow">나라 공부</span>' +
            '<h2 class="country-detail-title" id="' + esc(titleId) + '">' + esc(country.ko) + '</h2>' +
            '<p class="muted">' + esc(country.en) + '</p>' +
            '<p class="country-detail-region">' + esc(country.continent) + ' · ' + esc(country.region) + '</p></div>' +
          '<button class="btn btn-listen" data-speak="' + esc(country.ko) + '" type="button" aria-label="' + esc(country.ko) + ' 이름 듣기">🔊 이름 듣기</button>' +
          '<button class="btn btn-sm btn-ghost country-detail-dismiss" data-close-modal type="button" aria-label="나라 정보 닫기">닫기</button>' +
        '</header>' +
        '<div class="country-detail-grid"><div class="country-detail-summary">' +
        '<section class="country-detail-capital" aria-label="수도">' +
          '<span class="country-detail-capital-label">🏙️ 수도</span>' +
          '<strong class="country-detail-capital-name">' + esc(country.capital) + '</strong>' +
          '<span class="country-detail-capital-en muted">' + esc(country.capitalEn || '') + '</span>' +
          '<button class="btn btn-listen" data-speak-art="' + esc(country.capital) + '" data-speak-extra="' + esc(country.ko) + '의 수도예요" type="button" aria-label="수도 들어보기">🔊 수도 듣기</button>' +
        '</section>' +
        '<ul class="info-list">' +
          '<li><b>대륙</b><span>' + esc(country.continent) + ' · ' + esc(country.region) + '</span></li>' +
          '<li><b>난이도</b><span>' + esc(FQ.quiz.LEVEL_LABEL[country.level] || '-') + '</span></li>' +
          (rate === null ? '' : '<li><b>내 기록</b><span>' + st.seen + '번 중 ' + st.correct + '번 정답 (' + rate + '%)</span></li>') +
        '</ul>' +
        '<div class="fact-box country-detail-fact">💡 ' + esc(country.fact) + '</div>' +
        '<div class="country-detail-gallery">' + countryArt(country.code) + '</div>' +
        '<div class="hint-box" style="margin-top:10px">🚩 ' + esc(country.flagHint) + '</div>' +
        '</div>' +
        (mapHTML ? '<section class="country-detail-map" aria-label="' + esc(country.ko) + '의 지도">' +
          '<h3>지도로 살펴보기</h3>' + mapHTML + '</section>' : '') +
        '</div>' +
        '<button class="btn btn-sm" data-explain type="button" style="margin-top:10px">🔊 설명 듣기</button>' +
        '<div class="small muted" data-audio-status role="status"></div>' +
        '<button class="btn btn-primary btn-big" data-close-modal type="button" style="width:100%;margin-top:14px">닫기</button>' +
      '</div>';
    modalState = { back: back, opener: opener, bodyOverflow: doc.body.style ? doc.body.style.overflow : '' };
    if (doc.body.style) doc.body.style.overflow = 'hidden';
    back.addEventListener('click', function (ev) {
      if (generation !== modalGeneration || !modalState || modalState.back !== back) return;
      if (ev.target === back || ev.target.closest('[data-close-modal]')) { closeModal(); return; }
      var sp = ev.target.closest('[data-speak]');
      var explain = ev.target.closest('[data-explain]');
      var artButton = ev.target.closest('[data-speak-art]');
      if (sp || explain || artButton) {
        if (FQ.music) FQ.music.stop();
        FQ.storage.updateSettings({ speak: true });
        FQ.audio.setSpeakEnabled(true);
        var status = back.querySelector('[data-audio-status]');
        if (status) status.textContent = '';
        var lines = explain ? [country.ko, country.flagHint, country.fact] : [country.ko];
        // 그림 이름 단추(data-speak-art, 2026-09-17)는 소재 이름만 읽는다. 위 두 배열은 검사기(verify-expansion)의 계약이라 그대로 둔다.
        if (artButton && !sp && !explain) {
          lines = [artButton.getAttribute('data-speak-art')];
          // 수도 단추는 '수도 이름' 뒤에 '나라의 수도예요'를 잇는다(둘 다 기존 음원).
          var extra = artButton.getAttribute('data-speak-extra');
          if (extra) lines.push(extra);
        }
        var request = ++modalSpeechGeneration;
        FQ.audio.stopSpeaking();
        function current() {
          return generation === modalGeneration && request === modalSpeechGeneration && modalState && modalState.back === back && !doc.hidden;
        }
        function play() {
          if (!current()) return;
          FQ.audio.say(lines, {}, function () {
            if (current() && status) status.textContent = '소리를 재생하지 못했어요. 연결과 음량을 확인하고 다시 눌러 주세요.';
          });
        }
        if (FQ.speech && typeof FQ.speech.stopAnd === 'function') FQ.speech.stopAnd(play);
        else play();
      }
    });
    doc.body.appendChild(back);
    var btn = back.querySelector('.country-detail-dismiss') || back.querySelector('[data-close-modal]');
    if (btn) btn.focus();
  }

  doc.addEventListener('keydown', function (ev) {
    if (!modalState) return;
    if (ev.key === 'Escape') { if (ev.preventDefault) ev.preventDefault(); closeModal(); return; }
    if (ev.key !== 'Tab' || !modalState.back.querySelectorAll) return;
    var back = modalState.back;
    var focusable = Array.prototype.slice.call(back.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter(function (element) { return !element.hidden && element.offsetParent !== null; });
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    var active = doc.activeElement;
    var outside = back.contains ? !back.contains(active) : focusable.indexOf(active) === -1;
    if ((ev.shiftKey && (active === first || outside)) || (!ev.shiftKey && (active === last || outside))) {
      if (ev.preventDefault) ev.preventDefault();
      (ev.shiftKey ? last : first).focus();
    }
  });

  FQ.ui = {
    esc: esc,
    icon: icon,
    flagSrc: flagSrc,
    artFor: artFor,
    artAlt: artAlt,
    setMain: setMain,
    main: main,
    $: $,
    $$: $$,
    on: on,
    countryModal: countryModal,
    closeModal: closeModal
  };
})(window);
