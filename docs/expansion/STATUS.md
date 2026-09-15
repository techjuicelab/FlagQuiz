# FlagQuiz 확장 구현 — 2026-09-15 작업 상태

## 현재 상태

- 작업 브랜치: `claude/flag-game-expansion-design-rpv24x`
- Claude 인수인계 기준: `61753bb` (`HANDOFF.md` 추가).
- 완료: 30개 과제 중 T1-export-button 1개 + 독립 지도 트랙 8개.
- 과제별 커밋 9개를 원격 브랜치에 push했다. main 병합과 배포는 아직 하지 않았다.
- push 전에 `git fetch origin` → `git pull --rebase origin claude/flag-game-expansion-design-rpv24x` → `npm test`를 실행했다. 받은 원격 기준은 `61753bb`였고 충돌은 없었다. push 결과는 `61753bb..967d208`이다.
- T2-sw-cache-buckets의 미완성 변경은 `sw.js`와 `tests/sw.test.mjs` 두 파일이며, rebase와 STATUS 단독 커밋을 위해 stash에 보관했다. 아직 T2를 완료한 것으로 세지 않는다.
- 기록 KEY `flagquiz.v1` 유지. 음원 캐시 이름 `flagquiz-v4` 유지. 새 수아 문구·음원·의존성을 추가하지 않았다.

## 완료 커밋

| 과제 | 현재 작업 브랜치 커밋 |
| --- | --- |
| T1-export-button | `0cadea5` |
| 지도 T7-pin-constraints | `ce899f9` |
| 지도 T1-fetch-raw | `5374334` |
| 지도 T2-code-join | `959fe1f` |
| 지도 T3-simplify-silhouette | `e86ffd8` |
| 지도 T4-emit-data | `37dd058` |
| 지도 T5-register | `0fa000a` |
| 지도 T6-tests | `4d4fb41` |
| 지도 T8-attribution | `967d208` |

각 커밋 직전 전체 `npm test`를 실행해 통과했다. 위 표가 현재 브랜치에 통합되어 원격에 올라간 최종 커밋이다.

## 검증

- 기준 버전: 기존 node 테스트 87개 통과.
- 완료된 9개 커밋: `tests/run.mjs` 8,614개 단언 + node 테스트 98개 통과.
- 직전 회차 T2 초안을 포함한 작업본: 8,614개 단언 + node 테스트 110개 통과. 실패 0개. 이번 push 직전에는 커밋된 상태만으로 98개 테스트를 다시 통과했다.
- `npm run build` 통과: 기존 Sua 음원 977개, 음악 16개 준비 완료.
- 기록 내보내기: 실제 Chrome 클릭과 `file://`에서 읽기 전용 텍스트 선택 확인. JSON을 별도 브라우저 세션에 복원하여 기록·스티커·배지·오답 재현. HTML처럼 생긴 이름도 실행되지 않고 JSON 문자열로 표시됨.
- 지도: 194개국 좌표, 단일 육지 실루엣. 0.5도 단순화, 공유 경계 틈 방지. 전체 지도 및 표본 핀과 출처 푸터를 브라우저에서 확인. 지도 퀴즈 UI는 이번 자산 트랙에 포함되지 않음.
- 지도 원자료 없이도 테스트·빌드 통과. 지도 재생성 결과 바이트 동일. 누락 좌표·분쟁 지역 코드·배포 등록 누락 등 잘못된 상태에서 실제 테스트 실패 확인.
- T2 브라우저 표본: 기존 v4 캐시에서 업데이트한 뒤 네 버킷만 유지. 오프라인 앱 HTML·국기·지도 파일 200, 음원 전체 200 및 Range 요청 206 확인.
- 보존 음원 표본: `audio/sua/e06eefefecbe19a7eeb73171.mp3`, 40,794바이트. 전후 SHA-256 `5643020b48f4c9d2b8c55c3f7e70bf52ddaee472f2b09a62bded9b82bceb3af0` 일치.
- 위 브라우저 검증은 로컬 Chrome의 표본 검증이다. 아이패드 실기기에서 114MB 전량 보존 및 실제 소리 재생을 검증했다는 뜻은 아니다.

## 확정된 결정과 진행 조건

1. 그림 경로는 사용자가 `images/symbols/` + `images/places/`로 확정했다. `places`는 D1의 나라 대표 명소 축을 뜻한다. 향후 배포 복사 목록은 `images`, 서비스워커는 `/images/` 분기로 통일한다.
2. 화풍 A/B: 아직 미정. 이미지 도구는 `presets.json`의 `styleChoice`로 규격을 선택한다. 기본값은 `null`이며, 이 상태에서는 본 생성을 거부해야 한다. 5단계의 영어 피사체 작성·파일럿·앵커 및 6·7단계는 이번 작업 범위에서 시작하지 않는다.
3. HANDOFF.md의 진행 조건: T1과 T2를 각각 따로 배포한 뒤, T2에 대해 아이패드 비행기 모드에서 앱·국기·수아 음원이 정상인지 사용자가 확인해야 한다. 문서의 “이 답이 오기 전에는 1단계로 넘어가지 않는다”에 따라 1단계는 착수하지 않았다.
4. 사용자가 추가할 `scripts/verify-expansion.mjs`와 `npm run verify`는 이번 최초 pull 시점에는 아직 원격에 없었다. 임의의 대체 검사기를 만들지 않고 원격 추가분을 기다린다.

## 지도 구현에서 명세와 실측이 달랐던 부분

- Natural Earth v5.1.2 원본은 242개 도형이다. AU 코드를 함께 쓰는 두 속령을 명시적으로 제외하여 194개국과 48개 제외 지역으로 분류했다. 제외 지역도 육지 실루엣에는 포함한다.
- 인도네시아의 원본 라벨은 수마트라 안에 있고 최대 링은 칼리만탄이다. 라벨 좌표를 옮기지 않고 해당 원본 링의 포함 여부를 별도로 검증했다.
- 국가별 독립 단순화에서 생긴 경계 틈은 공유 경로를 한 번만 단순화하고 역순으로 재사용하여 해결했다. 0.7도와 0.5도 미리보기를 비교한 뒤 명세가 허용한 0.5도를 채택했다.
- 결과는 `data/map-coords.js` 4,965바이트와 `data/map-shapes.js` 54,992바이트다. 외부 의존성은 추가하지 않았다.

## 이 맥의 변환 도구

- `sips`: `/usr/bin/sips`, `sips-316`. `sips --formats`의 WebP 행에는 Writable 표시가 없어 WebP 쓰기는 지원하지 않는다.
- `cwebp`: `/opt/homebrew/bin/cwebp`, 버전 `1.6.0`, WebP 쓰기 지원.
- `ffmpeg`, ImageMagick의 `magick`과 `convert`: 현재 PATH에서 찾지 못했다.
- `sips --formats | rg -i webp` 출력:

```text
org.webmproject.webp         webp  
```

설치나 실제 이미지 변환은 수행하지 않았다.

## 로컬 검증 산출물

아래 자료는 `docs/artifacts/expansion-2026-09-15/`에 남아 있고 기존 ignore 규칙에 따라 원격에는 올라가지 않는다. 작업 상태와 판단 근거는 위 본문에 기록했다.

- `npm-test.log`, `npm-build.log`: 직전 회차 작업본의 최종 출력.
- `map-validation.md`: 지도 명세와 원자료의 차이, 처리 근거 및 독립 검수.
- `export-preview.png`: 기록 내보내기 화면.
- `map-preview.png`: 지도 자산 확인용 미리보기. 제품의 지도 게임 화면은 아님.
- `map-attribution-footer.png`: 앱의 지도 출처 푸터.

이 STATUS 파일은 추적 가능한 `docs/expansion/STATUS.md`로 이동했다.
