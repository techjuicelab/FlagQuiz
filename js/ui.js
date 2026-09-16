/* 국기 퀴즈 - 화면 공통 도구 */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var doc = global.document;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
        // 그림은 선캐시가 아니라 필요할 때 받는다. 오프라인에서 아직 안 받아 둔 나라를 열면
        // 깨진 아이콘이 뜨므로, 그때는 그림만 감추고 아래 이름은 그대로 남긴다.
        (art ? '<img src="' + esc(art.src) + '" alt="' + esc(art.alt) + '" width="1024" height="768" loading="lazy"' +
          ' onerror="this.hidden = true">' : '') +
        '<figcaption>' + label + esc(subject.ko) + '</figcaption></figure>';
    }).join('');
  }

  function main() { return doc.getElementById('main'); }

  function setMain(html) {
    var m = main();
    m.innerHTML = html;
    global.scrollTo({ top: 0, behavior: 'auto' });
    return m;
  }

  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || doc).querySelectorAll(sel));
  }

  function on(root, selector, event, fn) {
    root.addEventListener(event, function (ev) {
      var t = ev.target.closest(selector);
      if (t && root.contains(t)) fn(ev, t);
    });
  }

  /* --------- 나라 상세 모달 --------- */
  function closeModal() {
    var back = $('.modal-back');
    if (back) { FQ.audio.stopSpeaking(); back.remove(); }
  }

  function countryModal(country) {
    if (!country) return;
    if (FQ.music) FQ.music.stop();
    closeModal();
    var st = FQ.storage.allCountryStats()[country.code] || { seen: 0, correct: 0, wrong: 0, streak: 0 };
    var rate = st.seen ? Math.round((st.correct / st.seen) * 100) : null;
    var back = doc.createElement('div');
    back.className = 'modal-back';
    back.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(country.ko) + ' 정보">' +
        '<img class="big" src="' + flagSrc(country.code) + '" alt="' + esc(country.ko) + ' 국기">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap">' +
          '<div style="font-size:1.7rem;font-weight:900">' + esc(country.ko) + '</div>' +
          '<button class="btn btn-sm" data-speak="' + esc(country.ko) + '" type="button">🔊 들어보기</button>' +
        '</div>' +
        '<div class="muted">' + esc(country.en) + '</div>' +
        '<ul class="info-list">' +
          '<li><b>수도</b><span>' + esc(country.capital) + ' <span class="muted small">' + esc(country.capitalEn || '') + '</span></span></li>' +
          '<li><b>대륙</b><span>' + esc(country.continent) + ' · ' + esc(country.region) + '</span></li>' +
          '<li><b>난이도</b><span>' + esc(FQ.quiz.LEVEL_LABEL[country.level] || '-') + '</span></li>' +
          (rate === null ? '' : '<li><b>내 기록</b><span>' + st.seen + '번 중 ' + st.correct + '번 정답 (' + rate + '%)</span></li>') +
        '</ul>' +
        '<div class="fact-box">💡 ' + esc(country.fact) + '</div>' +
        countryArt(country.code) +
        '<div class="hint-box" style="margin-top:10px">🚩 ' + esc(country.flagHint) + '</div>' +
        '<button class="btn btn-sm" data-explain type="button" style="margin-top:10px">🔊 설명 듣기</button>' +
        '<div class="small muted" data-audio-status role="status"></div>' +
        '<button class="btn btn-primary btn-big" data-close-modal type="button" style="width:100%;margin-top:14px">닫기</button>' +
      '</div>';
    back.addEventListener('click', function (ev) {
      if (ev.target === back || ev.target.closest('[data-close-modal]')) closeModal();
      var sp = ev.target.closest('[data-speak]');
      var explain = ev.target.closest('[data-explain]');
      if (sp || explain) {
        if (FQ.music) FQ.music.stop();
        FQ.storage.updateSettings({ speak: true });
        FQ.audio.setSpeakEnabled(true);
        var status = back.querySelector('[data-audio-status]');
        if (status) status.textContent = '';
        var lines = explain ? [country.ko, country.flagHint, country.fact] : [country.ko];
        FQ.audio.say(lines, {}, function () {
          if (status) status.textContent = '소리를 재생하지 못했어요. 연결과 음량을 확인하고 다시 눌러 주세요.';
        });
      }
    });
    doc.body.appendChild(back);
    var btn = back.querySelector('[data-close-modal]');
    if (btn) btn.focus();
  }

  doc.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') closeModal();
  });

  FQ.ui = {
    esc: esc,
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
