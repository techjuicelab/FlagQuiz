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
    closeModal();
    var st = FQ.storage.countryStat(country.code);
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
    setMain: setMain,
    main: main,
    $: $,
    $$: $$,
    on: on,
    countryModal: countryModal,
    closeModal: closeModal
  };
})(window);
