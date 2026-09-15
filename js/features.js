/* 미완성 그림은 기본으로 숨긴다. 개발 설정은 호출할 때 읽어 새로고침 없이 반영한다. */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var DEFAULTS = { art: false };

  function flags() {
    var settings = {};
    try { settings = (FQ.storage && FQ.storage.settings()) || {}; }
    catch (e) { /* 저장소를 읽을 수 없으면 기본값을 따른다. */ }
    var over = settings.dev && typeof settings.dev === 'object' ? settings.dev : {};
    return { art: typeof over.art === 'boolean' ? over.art : DEFAULTS.art };
  }

  function on(name) { return flags()[name] === true; }

  FQ.features = { DEFAULTS: DEFAULTS, flags: flags, on: on };
})(window);
