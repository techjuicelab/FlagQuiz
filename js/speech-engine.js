/* 서버 허용과 기기 지원을 확인해 녹음 시작 전에 전사 경로 하나를 고른다. */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  function provider() {
    var account = FQ.auth && FQ.auth.session();
    if (account && account.speechStreaming === true && FQ.streamingSpeech && FQ.streamingSpeech.supported()) {
      return FQ.streamingSpeech;
    }
    return FQ.cloudSpeech;
  }
  function supported() {
    var selected = provider();
    return !!(selected && selected.supported && selected.supported());
  }
  function create(options) {
    var selected = provider();
    if (!selected || !selected.create) throw new Error('말하기 엔진을 준비하지 못했어요.');
    // 생성·유료 시작 이후의 실패는 호출자에게 돌려준다. 다른 전사 요청을 자동으로 만들지 않는다.
    return selected.create(options || {});
  }
  FQ.speechEngine = { supported: supported, create: create };
})(window);
