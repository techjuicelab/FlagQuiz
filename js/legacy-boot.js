/* 주소 이전과 파일 복원은 놀이를 막지 않고, 기존 기록이 있을 때만 선택을 받는다. */
(function (global) {
  'use strict';
  var records = global.FQLegacyRecords, doc = global.document;
  if (!records || !doc) return;
  // storage.js가 상태를 읽기 전에 새 주소의 빈 저장소에 이전 기록을 설치한다.
  var initial = records.consumePending();

  function errorText(status) {
    return status === 'invalid' ? '기록 파일을 읽을 수 없어요. 세계 놀이에서 내보낸 JSON 파일을 골라 주세요.' :
      '기록을 저장하지 못했어요. 원래 기록은 그대로 두었으니 저장 공간과 브라우저 설정을 확인해 주세요.';
  }
  function imported(result, status) {
    if (result.status === 'imported' || result.status === 'replayed') {
      status.textContent = '기록을 가져왔어요. 화면을 새로 열고 있어요.';
      global.location.reload();
      return true;
    }
    status.textContent = errorText(result.status);
    return false;
  }
  function download(raw, filename) {
    var url = global.URL.createObjectURL(new global.Blob([raw], { type: 'application/json' }));
    var link = doc.createElement('a');
    link.href = url; link.download = filename; doc.body.appendChild(link); link.click(); link.remove();
    global.setTimeout(function () { global.URL.revokeObjectURL(url); }, 1000);
  }
  function showInitial() {
    var note = doc.getElementById('legacy-record-note');
    if (!note) return;
    if (initial.status === 'imported') {
      note.hidden = false;
      note.textContent = '이전 주소의 학습 기록을 가져왔어요. 이어서 놀 수 있어요.';
      global.setTimeout(function () { note.hidden = true; }, 8000);
    } else if (initial.status === 'conflict') {
      note.hidden = false;
      note.innerHTML = '<p>이 주소에도 학습 기록이 있어요. 원하는 기록을 골라 주세요. 지금 놀이를 계속해도 괜찮아요.</p>' +
        '<button class="btn btn-sm" id="legacy-import-pending" type="button">이전 주소의 기록 가져오기</button> ' +
        '<button class="btn btn-sm btn-ghost" id="legacy-keep-current" type="button">지금 기록 유지하기</button>' +
        '<p id="legacy-import-message" class="small" role="status"></p>';
    } else if (initial.status === 'invalid' || initial.status === 'unavailable' ||
        global.FQLegacyHandoff && global.FQLegacyHandoff.status === 'failed') {
      note.hidden = false;
      note.textContent = '기록을 자동으로 가져오지 못했어요. 이전 주소에서 기록 파일을 받은 뒤 설정의 기록 가져오기를 이용해 주세요. 원래 기록은 지우지 않았어요.';
    }
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', showInitial);
  else showInitial();

  doc.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.id) return;
    if (target.id === 'settings-import') {
      var file = doc.getElementById('settings-import-file');
      if (file) file.click();
    } else if (target.id === 'settings-legacy-backup') {
      var message = doc.getElementById('settings-import-status');
      try {
        var backup = global.localStorage.getItem('flagquiz.legacy-backup');
        if (!backup) throw new Error();
        download(backup, 'flagquiz-before-import.json');
        if (message) message.textContent = '가져오기 전 기록을 파일로 보관했어요.';
      } catch (error) { if (message) message.textContent = '보관한 기록을 파일로 만들지 못했어요.'; }
    } else if (target.id === 'legacy-import-pending') {
      if (!global.confirm('이전 주소의 기록을 사용할까요? 지금 기록은 가져오기 전 기록으로 보관해요.')) return;
      imported(records.importPending({ replace: true }), doc.getElementById('legacy-import-message'));
    } else if (target.id === 'legacy-keep-current') {
      var result = records.discardPending();
      if (result.status === 'discarded') doc.getElementById('legacy-record-note').hidden = true;
      else doc.getElementById('legacy-import-message').textContent = errorText(result.status);
    }
  });
  doc.addEventListener('change', function (event) {
    var input = event.target;
    if (!input || input.id !== 'settings-import-file') return;
    var file = input.files && input.files[0], status = doc.getElementById('settings-import-status');
    if (!file || !status) return;
    if (file.size > 512 * 1024) { status.textContent = '512KB 이하의 세계 놀이 기록 파일을 골라 주세요.'; input.value = ''; return; }
    file.text().then(function (raw) {
      var result = records.importJson(raw, { replace: false });
      if (result.status === 'conflict') {
        if (!global.confirm('이 파일의 기록을 사용할까요? 지금 기록은 가져오기 전 기록으로 보관해요.')) {
          status.textContent = '지금 기록을 그대로 사용해요.'; return;
        }
        result = records.importJson(raw, { replace: true });
      }
      imported(result, status);
    }).catch(function () { status.textContent = '기록 파일을 읽지 못했어요. 원래 기록은 그대로 두었어요.'; })
      .then(function () { input.value = ''; });
  });
})(window);
