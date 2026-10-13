/* 나라를 눌러 수도와 이야기를 살펴보는 탐색 화면. 학습 기록과 설정은 바꾸지 않는다. */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var CONTINENTS = ['all', '아시아', '유럽', '아프리카', '북아메리카', '남아메리카', '오세아니아'];
  // 홈이나 상세창을 다녀와도 찾던 나라와 대륙을 그대로 이어 본다.
  var filter = { query: '', continent: 'all' };

  function searchKey(value) {
    var text = String(value == null ? '' : value);
    if (text.normalize) text = text.normalize('NFKD');
    return text.toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[\s\-_'’.,()·]/g, '');
  }

  function countryList() {
    return (FQ.countries || []).slice().sort(function (a, b) {
      if (a.code === 'kr') return -1;
      if (b.code === 'kr') return 1;
      return a.ko.localeCompare(b.ko, 'ko');
    });
  }

  function matches(country, query) {
    if (filter.continent !== 'all' && country.continent !== filter.continent) return false;
    if (!query) return true;
    return [country.ko, country.en, country.capital, country.capitalEn].concat(country.aliases || []).some(function (value) {
      return searchKey(value).indexOf(query) !== -1;
    });
  }

  function card(country, ui) {
    var esc = ui.esc;
    return '<button class="country-browser-card" type="button" data-country-browse data-code="' + esc(country.code) +
      '" aria-label="' + esc(country.ko + ', 수도 ' + country.capital + ', 나라 정보 보기') + '">' +
      '<img class="country-browser-flag" src="' + esc(ui.flagSrc(country.code)) + '" alt="" loading="lazy" width="96" height="64">' +
      '<span class="country-browser-card-body">' +
        '<strong class="country-browser-name">' + esc(country.ko) + '</strong>' +
        '<span class="country-browser-english">' + esc(country.en) + '</span>' +
        '<span class="country-browser-capital-label">수도</span>' +
        '<span class="country-browser-capital">' + esc(country.capital) + '</span>' +
        '<span class="country-browser-card-region">' + esc(country.continent) + '</span>' +
      '</span>' +
    '</button>';
  }

  /** 입력란은 다시 만들지 않아 한글을 쓰는 도중에도 포커스와 조합 중인 글자를 지킨다. */
  function updateResults(main, ui) {
    var query = searchKey(filter.query);
    var list = countryList().filter(function (country) { return matches(country, query); });
    var grid = ui.$('#country-browser-results', main);
    var status = ui.$('#country-browser-status', main);
    var clear = ui.$('[data-country-browser-clear]', main);
    if (grid) {
      grid.innerHTML = list.length ? list.map(function (country) { return card(country, ui); }).join('') :
        '<div class="country-browser-empty"><p>찾는 나라가 아직 보이지 않아요.</p>' +
          '<p class="small muted">나라 이름이나 수도를 다시 써 보거나 모든 나라를 살펴봐요.</p>' +
          '<button class="btn btn-primary country-browser-reset" type="button" data-country-browser-reset>모든 나라 보기</button></div>';
    }
    if (status) status.textContent = list.length + '개 나라' + (filter.continent === 'all' ? '' : ' · ' + filter.continent);
    if (clear) clear.disabled = !filter.query;
    ui.$$('[data-country-browser-continent]', main).forEach(function (button) {
      var selected = button.getAttribute('data-country-browser-continent') === filter.continent;
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.classList.toggle('is-active', selected);
    });
  }

  function open() {
    var ui = FQ.ui;
    if (!ui) return;
    var esc = ui.esc;
    var main = ui.setMain(
      '<section class="country-browser" aria-labelledby="country-browser-title">' +
        '<div class="country-browser-head">' +
          '<button class="btn btn-sm" type="button" data-country-browser-home>← 처음으로</button>' +
          '<h2 id="country-browser-title">나라 살펴보기</h2>' +
          '<p>궁금한 나라를 눌러 수도와 이야기를 만나 봐요.</p>' +
        '</div>' +
        '<div class="country-browser-controls">' +
          '<div class="country-search">' +
            '<label class="country-search-label" for="country-browser-search">나라 이름이나 수도 찾기</label>' +
            '<div class="country-search-field">' +
              '<input class="country-search-input text-input" id="country-browser-search" type="search" value="' + esc(filter.query) +
                '" placeholder="대한민국, 서울, France…" autocomplete="off" autocapitalize="off" spellcheck="false" aria-controls="country-browser-results">' +
              '<button class="btn btn-sm country-search-clear" type="button" data-country-browser-clear>검색 지우기</button>' +
            '</div>' +
          '</div>' +
          '<div class="country-continent-filters" role="group" aria-label="대륙 고르기">' +
            CONTINENTS.map(function (continent) {
              return '<button class="btn btn-sm country-filter-btn" type="button" data-country-browser-continent="' + esc(continent) +
                '" aria-pressed="false">' + (continent === 'all' ? '모든 나라' : esc(continent)) + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<p class="country-browser-status" id="country-browser-status" role="status" aria-live="polite" aria-atomic="true"></p>' +
        '<div class="country-browser-grid" id="country-browser-results"></div>' +
      '</section>'
    );
    updateResults(main, ui);
    ui.on(main, '[data-country-browser-home]', 'click', function () { FQ.app.home(); });
    ui.on(main, '#country-browser-search', 'input', function (event, input) {
      filter.query = input.value;
      updateResults(main, ui);
    });
    ui.on(main, '[data-country-browser-continent]', 'click', function (event, button) {
      var continent = button.getAttribute('data-country-browser-continent');
      if (CONTINENTS.indexOf(continent) === -1) return;
      filter.continent = continent;
      updateResults(main, ui);
    });
    ui.on(main, '[data-country-browser-clear]', 'click', function () {
      filter.query = '';
      var input = ui.$('#country-browser-search', main);
      if (input) input.value = '';
      updateResults(main, ui);
      if (input && input.focus) input.focus({ preventScroll: true });
    });
    ui.on(main, '[data-country-browser-reset]', 'click', function () {
      filter.query = '';
      filter.continent = 'all';
      var input = ui.$('#country-browser-search', main);
      if (input) input.value = '';
      updateResults(main, ui);
      if (input && input.focus) input.focus({ preventScroll: true });
    });
    ui.on(main, '[data-country-browse]', 'click', function (event, button) {
      var code = button.getAttribute('data-code');
      var country = (FQ.countries || []).filter(function (entry) { return entry.code === code; })[0];
      if (country) ui.countryModal(country);
    });
    return main;
  }

  FQ.countryBrowser = { open: open };
})(window);
