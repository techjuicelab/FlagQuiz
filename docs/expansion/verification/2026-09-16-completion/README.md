# 최종 구현·그림 검증 근거

2026-09-16 KST에 현재 결과를 모았다. 실행 원문을 요약으로 대체하지 않았으며 각 파일의 검사 시점과 범위는 아래와 같다.

## 제품 기준 38710d8

- [npm-test.txt](npm-test.txt): 자료·통합 단언 10,219건 + node 249개, 실패·건너뜀 0.
- [verify.txt](verify.txt): 기본 38통과·0실패·4심화 생략.
- [verify-deep.txt](verify-deep.txt): 42통과·0실패·0미구현.
- [build.txt](build.txt): art 기본값 false의 일반 빌드 성공, 기존 Sua 977개·음악16개 확인.
- [strict-art-gate.json](strict-art-gate.json): 전량 필수 빌드는 기니 한 파일 누락으로 실패. 기존 _site 1,564개 파일의 바이트·크기·mtime·inode 전부 보존.
- [images-lint.txt](images-lint.txt), [images-check.txt](images-check.txt), [images-report.txt](images-report.txt): 342항목, 승인341·보류1, 최종WebP341·오류0·경고0.

## 독립 이미지·지도 검사

- [production-audit.json](production-audit.json): 원본사본/native/최종 파일 1,023개와 실제 요청384개를 대조했다. gn은 제작 승인물에 없고 원장 held/tries5이다.
- [native-history-audit.json](native-history-audit.json): 과거 저장 원본과 도구 native 107쌍 확인. approved 파일 해시는 이후 동일하다.
- [map-and-assets.json](map-and-assets.json): 최신 원장·gn5회·앵커·이미지 해시 재검사와 사용자가 제시한 지도 재현. 바다핀0·면적0도형0·subpath402·194좌표.
- [browser-all-images.json](browser-all-images.json): 실제 Chrome에서 341개 HTMLImageElement.decode() 실행. 모든 실제 치수1024×768, 실패0. 보고서 안의 production SHA로 대상 파일 집합을 고정한다.

## 독립 앱·오프라인 브라우저 검사

- [browser-offline-summary.json](browser-offline-summary.json): macOS HeadlessChrome150, 격리 세션390×844, 앱기준e0faf8a. app/quiz/storage/features/map의 캐시SHA는 검사 당시 primary와 같았다. 최신 도감 조회 수정은 그 이후 별도 회귀 테스트로 확인했다.
- 테스트 세션에서만 settings.dev.art=true를 설정했다. 홈 모드를 실제 클릭한 뒤 대한민국 한 문제를 FQ.app.startGame(['kr'])로 지정하고 답은 실제 클릭으로 제출했다. 저장값을 만들어 정답 기록으로 제시하지 않았다.
- [browser-records-after-four-correct.json](browser-records-after-four-correct.json): 상징물·명소·지도·국기 정답 후 축별 실제 저장값.
- 전용 서버PID17364(8144)를 종료해 실제 연결을 끊고 새 탭에서 앱을 다시 열었다. 캐시한 그림2장·국기·수아 표본 바이트와 SHA가 온라인/오프라인에서 같았다.
- [browser-records-offline-place-wrong.json](browser-records-offline-place-wrong.json): 명소 오답은 place.wrong=1이고 국기wrong=0·wrongList=[]였다.
- [browser-offline-audio-events.json](browser-offline-audio-events.json): 수아 '들어보기'가 playing에서 ended까지 실제 재생됐다. Range0-1은206/2bytes, suffix16은206/16bytes, 범위밖은416이었다.

모든341장 사전 다운로드, 실제 아이패드 설치형PWA·비행기모드, 기존114MB 음원 이관, 보호자 승인·4세 인지는 확인한 것으로 표시하지 않는다. 자세한 로컬 스크린샷·원로그는 docs/artifacts/final-browser-8144-2026-09-15/에 보존했다.
