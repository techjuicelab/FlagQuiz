# 인계 명세 — 외부 코딩 에이전트용

이 문서는 최초 인계 때 작성한 구현 명세다. 현재 완료 범위는 [STATUS.md](STATUS.md)를 따른다. **2026-09-15 사용자 결정으로 화풍은 B로 확정했다.** 이후의 A/B 비교 계획은 당시 절차이며, 화풍을 다시 묻지 않는다.

각 과제의 터치포인트는 실제 소스를 열어 확인한 줄 번호다. 다만 **커밋이 쌓이면 줄이 밀린다** —
항상 인용된 코드 조각을 `grep`으로 찾아 현재 위치를 확인하고 작업하라.

먼저 읽을 것: [DECISIONS.md](DECISIONS.md)(결정 14건) · [SUBJECTS.csv](SUBJECTS.csv)(194행) · [confusion-groups.json](confusion-groups.json)(58군) · [IMAGE-PROMPTS.md](IMAGE-PROMPTS.md) · [PILOT.md](PILOT.md)

---

## 절대 하지 말 것

아래 여섯은 되돌릴 수 없거나 아이의 데이터를 잃는 것들이다.

1. js/storage.js:8의 `var KEY = 'flagquiz.v1';`을 절대 올리지 마라. 마이그레이션 코드가 저장소 전체에 없어서, v2로 올리는 순간 아이의 배지·194칸 스티커·기록이 조용히 전부 사라진다. 이 줄이 네 커밋의 diff에 나타나면 그 커밋은 잘못된 것이다.

2. 새 상태를 최상위 스칼라로 만들지 마라. js/storage.js:48-54가 저장분을 복원할 때 `typeof saved[k] === 'object'`인 값만 살리므로, `state.artOn = true` 같은 값은 저장은 되고 절대 읽히지 않아 매번 기본값으로 돌아간다. 기능 플래그는 settings.dev 객체 안에, 새 카운터는 새 최상위 객체 버킷(axes)으로 넣고, 병합이 1단계뿐이라 기존 레코드에 백필이 안 되니 모든 읽기를 `(s.x || 0)`으로 방어하고 resetProgress에도 같이 추가하라.

3. 서비스워커의 음원 캐시 이름을 바꾸거나 올리지 마라. 이름은 옛 이름 'flagquiz-v4'를 그대로 물려받아야 한다 — 아이패드에 이미 받아둔 114MB가 그 이름 아래 있고, 바꾸는 순간 차 안에서 앱이 벙어리가 된다. 캐시 분리는 0단계에서 한 번만 하고(셸·국기·그림·음원 네 버킷 + 화이트리스트 정리), 그 뒤 이미지 배선 단계에서 이미지 전용 버킷을 또 만들지 마라. 이미 ART_CACHE로 존재한다.

4. quiz.js:49의 후보 생성과 :87-90의 전체 폴백 **양쪽에** '자료 있는 나라만' 필터를 같은 커밋으로 넣어라. 한쪽만 고치는 것이 이 작업에서 가장 흔한 실수이고, 안 넣으면 그림 없는 나라가 보기로 올라와 빈 칸이 렌더링된다. 후보가 모자라 굶주릴 때 푸는 것은 혼동군 배제뿐이고, 자료 필터는 어떤 경우에도 풀지 않는다.

5. 새 그림을 flags/ 폴더에 넣지 마라. tests/run.mjs:114-124가 flags/ 안의 모든 파일이 194개 code 중 하나여야 한다고 단언해 즉시 실패하고, sw.js의 국기 예열과 build-site.mjs의 flags/ 통째 복사에도 섞여 들어간다. 그림 경로는 사용자가 images/symbols/·images/places/로 확정했다. build-site.mjs에는 images 하나를 추가하고 serve.mjs MIME·테스트·ui.js 경로 함수를 전부 이 경로에 맞춰라.

6. 새 수아 음원 문구를 한 줄도 추가하지 마라. scripts/build-site.mjs:13-15의 배포 게이트가 전체 음원이 준비되어야 배포를 허락하므로, 문구가 하나 늘어나는 순간 main 배포 전체가 멈춘다. 1차는 새 음원 0개로 간다 — 그림 이름을 읽어 주고 싶어도 ui.js의 lines 배열을 건드리지 말고, js/voice-manifest.js와 data/voice-config.json은 손대지 마라. 기존 fact 118행 재사용이 그 근거다. **(2026-09-17 부분 해제: 사용자 결정으로 상징물·명소 이름 342개를 voice-corpus.mjs 에 추가했다. 이후 새 문구도 같은 방식으로 voice:plan → voice:generate 로 음원을 먼저 채운 뒤에만 병합한다.)**

---

## 단계

**단계는 각각 독립적으로 배포 가능하다.** 그림이 0장이어도 0~4단계가 전부 들어간다.

| 단계 | 목표 | 사람이 먼저 할 것 | 배포되면 아이 화면 |
|---|---|---|---|
| 0단계 | 뒤의 모든 과제가 storage | — | 두 커밋을 각각 따로 배포한다. 아이 화면에 보이는 변화는 🏅 내 기록 화면에 '기록 내보내기' 버튼 하나가 늘어난 것뿐이다.… |
| 1단계 | 미완성 콘텐츠를 숨긴 채 코드를 main에 넣을 기능 플래그(D4 완화책)를 만들고, 194개국 상징물·명소 | 0단계의 캐시 버킷 분리 커밋을 단독 배포한 뒤, 아빠가 아이패드 비행기 모드에서 ①앱이 뜨고 ②국기가 보이… | 배포되지만 아이 화면 변화는 사실상 0이다. subjects·confusion-groups 자료가 로드되고 기능 플래그는 기본… |
| 2단계 | D6의 기록 축 분리(새 최상위 객체 버킷 axes)와, README가 '가장 확실히 예정된 버그'라 부른  | — | 배포되고 화면 변화는 0이지만 동작이 바뀐다. 그림 축 오답이 국기 출제 가중치와 오답노트를 더 이상 오염시키지 않고, 자료 … |
| 3단계 | D2의 첫 배포 대상 | — | 배포되지만 플래그 off라 나라 상세 모달의 HTML이 변경 전과 바이트 단위로 같다. 그림이 도착하면 콘솔에서 FQ.stor… |
| 4단계 | 사람이 그림을 뽑기 위해 필요한 도구 일체를 만든다 — CSV 파서, 원장(presets | — | 앱에는 아무것도 배포되지 않는다(docs/ 와 scripts/ 는 build-site.mjs 복사 대상 밖). 산출물은 사람이… |
| 5단계 | 이 계획에서 가장 길고 에이전트가 대신할 수 없는 구간 | ①SUBJECTS.csv의 draft 31행을 아빠가 먼저 승인해야 그 행의 영어 문장을 쓸 수 있다(파일럿… | 배포 없음. 아이 화면 변화 0. 커밋되는 것은 원장(presets.json·settings.csv), 8항목 채점표가 들어간… |
| 6단계 | 회차 규약(1대화창 = 앵커 1 + 항목 8~10, 상한 12장)에 따라 342장을 뽑고, 맥에서 화풍별 규 | presets.json.styleChoice가 확정되고 앵커 1장이 커밋된 뒤에만 시작한다. 생성(회차 35… | 배선 커밋 한 번을 배포한다. 플래그가 여전히 off라 아이 화면 변화는 0이고, 로컬에서 콘솔로 플래그를 켜면 도감 카드에 … |
| 7단계 | D4에 따라 상징물 194장·명소 148장이 전부 검수를 통과한 뒤 js/features | 342장 전량의 사람 검수 완료 판정(글자·국기·사람·앵커 대비 이탈·사실 오류·저작권·아이 인지). 기계 … | 194개국 도감 카드에 그림이 한 번에 나타난다. 아이가 처음으로 변화를 본다. 이 커밋은 342장이 같은 PR 안에 있어야만… |
| 별도 트랙 | Natural Earth 50m을 좌표 194개와 '국경선 없는 육지 실루엣 한 덩어리'로 변환해 커밋하고, | 없음. 다만 실루엣이 제대로 나왔는지는 사람이 브라우저로 한 번 봐야 한다(이탈리아 장화·한반도·플로리다 반… | 배포되지만 아이 화면 변화 0 — 좌표와 실루엣이 정적 자료로 로드될 뿐 어느 화면에도 나타나지 않는다. 눈에 보이는 변화는 … |

### 0단계 — 안전망: 기록 백업과 서비스워커 캐시 버킷 분리

뒤의 모든 과제가 storage.js 스키마나 sw.js 캐시를 건드린다. 되돌릴 수단(내보내기 JSON)과 음원 114MB를 지킬 구조(버킷 분리)를 다른 어떤 것보다 먼저 만든다. 두 커밋은 반드시 따로 배포한다.

- **과제** — `T1-export-button`, `T2-sw-cache-buckets`
- **배포되면** — 두 커밋을 각각 따로 배포한다. 아이 화면에 보이는 변화는 🏅 내 기록 화면에 '기록 내보내기' 버튼 하나가 늘어난 것뿐이다. 캐시 버킷 분리는 화면 변화가 0이지만 셸·국기 약 2MB가 1회 재다운로드된다(정상). 음원 114MB가 재다운로드되면 실패다.

### 1단계 — 스위치·자료·문서 (그림 0장에서 완결)

미완성 콘텐츠를 숨긴 채 코드를 main에 넣을 기능 플래그(D4 완화책)를 만들고, 194개국 상징물·명소 문자열과 혼동군 58군을 앱이 읽는 자리(data/*.js)로 옮기고, 문서 불일치 3건을 정리한다. 플래그는 최상위 스칼라가 아니라 settings.dev 객체 안에 넣는다.

- **과제** — `T3-feature-flags`, `T4-subjects-data`, `T9-doc-fixes`
- **사람이 먼저** — 0단계의 캐시 버킷 분리 커밋을 단독 배포한 뒤, 아빠가 아이패드 비행기 모드에서 ①앱이 뜨고 ②국기가 보이고 ③수아 음원이 재생되는지 확인해 줄 때까지 기다린다.
- **배포되면** — 배포되지만 아이 화면 변화는 사실상 0이다. subjects·confusion-groups 자료가 로드되고 기능 플래그는 기본 false다. 눈에 보이는 유일한 변화는 '최근 놀이' 기록 줄의 모드 이름 4개가 홈 화면 이름과 같아지는 것.

### 2단계 — 엔진 안전장치: 기록 축 분리 · 혼동군 배제 · CI 게이트

D6의 기록 축 분리(새 최상위 객체 버킷 axes)와, README가 '가장 확실히 예정된 버그'라 부른 quiz.js 폴백의 자료 필터·혼동군 배제를 넣는다. 그림 완비 검사는 플래그 뒤에 두어 점진 커밋을 막지 않게 한다.

- **과제** — `T5-record-axis`, `T7-confusion-exclude`, `T8-test-gates`
- **배포되면** — 배포되고 화면 변화는 0이지만 동작이 바뀐다. 그림 축 오답이 국기 출제 가중치와 오답노트를 더 이상 오염시키지 않고, 자료 없는 나라가 보기로 올라오지 않는다. CI가 '플래그 on + 그림 미완성' 커밋을 구조적으로 막기 시작한다.

### 3단계 — 도감 카드 그림 자리 (폴백이 기본, 그림이 예외)

D2의 첫 배포 대상. ui.js:64(fact-box)와 :65(hint-box) 사이에 그림 블록 하나를 끼운다. 엔진·채점 변경 0줄. 그림이 0장이어도 지금 들어갈 수 있고, 그림이 도착하면 플래그만 켜면 된다.

- **과제** — `T6-dex-art-slot`
- **배포되면** — 배포되지만 플래그 off라 나라 상세 모달의 HTML이 변경 전과 바이트 단위로 같다. 그림이 도착하면 콘솔에서 FQ.storage.updateSettings({dev:{art:true}}) 한 줄로 그 자리에 바로 보인다.

### 4단계 — 이미지 파이프라인 도구 (그림 0장에서 전부 머지 가능)

사람이 그림을 뽑기 위해 필요한 도구 일체를 만든다 — CSV 파서, 원장(presets.json·settings.csv), 영어 문장 lint, 프롬프트 조립 스크립트, 프롬프트 보드, 변환 명령 생성기, 기계 검수기, 컨택트시트. 의존성 0을 지킨다.

- **과제** — `T1-csv-reader`, `T2-ledger-seed`, `T4-subject-lint`, `T5-build-prompts`, `T6-board`, `T10-convert`, `T11-verify`, `T12-contactsheet`
- **배포되면** — 앱에는 아무것도 배포되지 않는다(docs/ 와 scripts/ 는 build-site.mjs 복사 대상 밖). 산출물은 사람이 쓰는 도구다 — 342건을 한 화면에서 골라 복사하는 보드, 맥에서 그대로 붙여 쓸 변환 명령줄, 검수 스크립트.

### 5단계 — 사람 구간: 영어 피사체 342건 · 파일럿 16장 · 앵커 1장

이 계획에서 가장 길고 에이전트가 대신할 수 없는 구간. 한국어 주제 문자열을 영어 피사체 문장으로 '재작성'하고, 화풍 A/B를 파일럿으로 비교해 styleChoice를 확정하고, 드리프트 계측기인 앵커 1장을 고정한다. 에이전트는 배치 표를 뽑아 주고 lint를 돌리고 결과를 원장에 기록하는 일만 한다.

- **과제** — `T3-subject-en`, `T7-pilot`, `T8-anchor`
- **사람이 먼저** — ①SUBJECTS.csv의 draft 31행을 아빠가 먼저 승인해야 그 행의 영어 문장을 쓸 수 있다(파일럿 8종 중 nl·kr·jp·bf 4개가 draft다) ②사용자가 B를 선택해 D7 화풍 결정은 완료했다. 소재·앵커·그림 승인은 별도다 ③이 환경에서는 내장 image_gen으로 생성 가능하며, 이번에는 확정 소재 비교 시안만 만들었다.
- **배포되면** — 배포 없음. 아이 화면 변화 0. 커밋되는 것은 원장(presets.json·settings.csv), 8항목 채점표가 들어간 docs/image-prompts/README.md, 앵커 PNG 1장뿐이다.

### 6단계 — 본 생성 342장 · WebP 변환 · 앱 배선

회차 규약(1대화창 = 앵커 1 + 항목 8~10, 상한 12장)에 따라 342장을 뽑고, 맥에서 화풍별 규격으로 변환하고, 폴더·MIME·서비스워커·경로 함수 다섯 자리를 배선한다. 배선은 그림 30장쯤 모인 시점에 한 번만 한다.

- **과제** — `T9-batches`, `T13-wiring`
- **사람이 먼저** — presets.json.styleChoice가 확정되고 앵커 1장이 커밋된 뒤에만 시작한다. 생성(회차 35~43개, 약 18~21시간)과 PNG→WebP 변환은 사람이 맥에서 실행한다 — 2026-09-15 맥 실측은 sips와 cwebp가 있고 ffmpeg·ImageMagick은 PATH에 없다. 도구 존재는 생성·검수의 사람 확인을 대신하지 않는다.
- **배포되면** — 배선 커밋 한 번을 배포한다. 플래그가 여전히 off라 아이 화면 변화는 0이고, 로컬에서 콘솔로 플래그를 켜면 도감 카드에 지금까지 모인 그림이 보인다. 서비스워커 음원 버킷 이름은 이 단계에서도 그대로다.

### 7단계 — 전량 공개 (플래그 on)

D4에 따라 상징물 194장·명소 148장이 전부 검수를 통과한 뒤 js/features.js의 DEFAULTS.art를 true로 바꾸는 한 줄 커밋. 2단계에서 만든 CI 게이트가 이 커밋의 전제 조건을 기계로 강제한다.

- **과제** — `T3-feature-flags`, `T8-test-gates`, `T6-dex-art-slot`
- **사람이 먼저** — 342장 전량의 사람 검수 완료 판정(글자·국기·사람·앵커 대비 이탈·사실 오류·저작권·아이 인지). 기계 검수 통과는 그림이 괜찮다는 뜻이 아니다.
- **배포되면** — 194개국 도감 카드에 그림이 한 번에 나타난다. 아이가 처음으로 변화를 본다. 이 커밋은 342장이 같은 PR 안에 있어야만 CI를 통과한다.

### 별도 트랙 — 지도 자산 파이프라인 (D3 선행, 어느 단계와도 병렬)

Natural Earth 50m을 좌표 194개와 '국경선 없는 육지 실루엣 한 덩어리'로 변환해 커밋하고, 네 자리에 등록하고, 테스트로 고정하고, 핀 렌더링 제약을 문서로 남긴다. 지도 화면·채점 코드는 이 트랙의 범위가 아니다(D2에 따라 2주 뒤 별도 과제).

- **과제** — `T7-pin-constraints`, `T1-fetch-raw`, `T2-code-join`, `T3-simplify-silhouette`, `T4-emit-data`, `T5-register`, `T6-tests`, `T8-attribution`
- **사람이 먼저** — 없음. 다만 실루엣이 제대로 나왔는지는 사람이 브라우저로 한 번 봐야 한다(이탈리아 장화·한반도·플로리다 반도가 알아보이는가, 국경선이 한 줄도 없는가).
- **배포되면** — 배포되지만 아이 화면 변화 0 — 좌표와 실루엣이 정적 자료로 로드될 뿐 어느 화면에도 나타나지 않는다. 눈에 보이는 변화는 푸터에 Natural Earth 출처 한 줄과 '땅만 그리고 국경선은 그리지 않아요' 문장이 늘어난 것.

---

## 과제 명세

### `T1-export-button` 기록 내보내기 버튼 (모든 작업의 선행 조건)

**왜** — 지금 민규 진행도의 백업본이 세상에 하나도 없다. 뒤의 모든 과제가 storage.js의 스키마나 sw.js의 캐시를 건드리고, 그중 하나라도 어긋나면 되돌릴 수단이 없다. DECISIONS.md D6 '착수 전 선행 작업'이 이것을 명시한다. 이 과제만 코드 30줄이고 나머지 전부의 안전망이다.

**독립 배포** — 가능

**고칠 곳**

- js/storage.js:160 (`function allCountryStats()`) 바로 아래에 `function exportJson(){ try { return JSON.stringify(state, null, 2); } catch(e){ return '{}'; } }` 추가
- js/storage.js:184-202 의 `FQ.storage = { … }` 객체에 `exportJson: exportJson,` 한 줄 추가 (197행 `allCountryStats` 다음이 자연스럽다)
- js/storage.js:8 `var KEY = 'flagquiz.v1';` — 한 글자도 바꾸지 않는다. 이 커밋의 diff에 8행이 등장하면 안 된다
- js/screens.js:244-248 의 '정리하기' 카드 **바로 위**에 새 `<div class="card section">` 삽입: `<h3>기록 백업</h3>` + `<p class="small muted">아래 글자를 통째로 복사해 두면 기록을 되살릴 수 있어요. 저장된 곳: <code>flagquiz.v1</code></p>` + `<button class="btn btn-sm" id="export" type="button">💾 기록 내보내기</button>` + `<div id="export-out"></div>`
- js/screens.js:256 의 `#reset` 핸들러 **위**에 `#export` 핸들러 추가: `#export-out`.innerHTML 에 `<textarea class="text-input" id="export-text" readonly rows="8" style="width:100%;font-family:monospace;font-size:.8rem"></textarea>` 를 넣고, 그다음 줄에서 `ui.$('#export-text').value = FQ.storage.exportJson();` 과 `.select()` 를 호출한다
- JSON 문자열을 innerHTML 보간으로 넣지 말고 반드시 `.value =` 로 대입한다 (JSON 안의 `<`·`</textarea>` 가 화면을 깨뜨린다). ui.esc 로 감싸는 우회도 쓰지 않는다
- `<a download>` / Blob 다운로드 / navigator.clipboard 를 쓰지 않는다 — 홈화면 앱 사파리에서 다운로드가 조용히 실패하고, clipboard 는 file:// (app.js:1443-1449 가 지원하는 경로) 에서 undefined 다

**완료 판정**

- [ ] 🏅 내 기록 화면에서 버튼을 누르면 textarea 에 `settings / stats / daily / countries / badges / history` 여섯 키가 그대로 보인다
- [ ] 그 문자열을 다른 브라우저에서 `localStorage.setItem('flagquiz.v1', <문자열>)` 로 넣고 새로고침하면 스티커 개수·배지·오답노트가 복원된다 (들여쓰기가 있어도 JSON.parse 가 무시하므로 pretty 출력이어도 된다)
- [ ] `git diff js/storage.js` 에 8행(KEY)이 나오지 않는다
- [ ] 시크릿 모드(localStorage 차단)에서도 버튼이 예외를 던지지 않고 기본값 JSON 을 보여 준다
- [ ] `npm test` 전부 통과 (기존 검사 한 건도 깨지지 않는다)

**테스트**

- tests/storage-export.test.mjs 신설 — tests/run.mjs:12-50 의 가짜 브라우저 샌드박스를 그대로 본떠 js/util.js, js/storage.js 만 로드
- `recordAnswer('kr', true)` 후 `JSON.parse(exportJson()).countries.kr.correct === 1`
- `JSON.parse(exportJson())` 가 `JSON.parse(localStorage.getItem('flagquiz.v1'))` 와 deepEqual — 화면에 보여 준 것이 실제 저장된 것과 같다는 단언
- `exportJson()` 이 항상 문자열을 돌려주고 절대 던지지 않는다 (state 에 순환 참조가 없음을 고정)

**함정**

- storage.js:8 의 KEY 를 v2 로 올리고 싶어진다 — 마이그레이션 코드가 저장소 전체에 없다. 올리는 순간 민규의 배지·194칸·기록이 조용히 전부 사라진다
- `state` 객체 자체를 export 에 노출하면 화면 코드가 저장소 내부를 직접 변형할 수 있게 된다. 문자열만 돌려준다
- screens.js:251 의 `ui.setMain(html)` 은 화면을 통째로 다시 그린다. export 핸들러 안에서 `stats()` 를 다시 부르면 방금 만든 출력이 지워진다 — 부르지 마라 (reset 핸들러 256-261 이 stats() 를 다시 부르는 것은 정상이다)
- tests/app.test.mjs 는 screens.js 를 로드하지 않으므로(:54 목록 참조) 이 변경의 영향을 받지 않는다. 거기에 테스트를 끼워 넣으려 하지 마라

### `T2-sw-cache-buckets` 서비스워커 캐시 버킷 분리 — 단독으로 먼저 배포해 검증

**왜** — T2 구현 전에는 VERSION 문자열 하나에 셸·국기·음원이 다 들어 있고 정리 코드가 'flagquiz- 로 시작하면 전부 삭제'였다. 그림을 교체할 때마다 버전을 올려야 하므로 이 구조 그대로면 '그림 몇 장 고쳤더니 아이가 차 안에서 앱이 벙어리가 됨'(114MB 음원 소실)이 구조적으로 예정돼 있다. 이관 자체가 1회 재다운로드를 유발하므로 그림 작업과 섞지 말고 **이 커밋만 단독 배포해 아이패드에서 확인한 뒤** 다음으로 간다.

**독립 배포** — 가능 · 선행: `T1-export-button`

**고칠 곳**

- js/sw.js 아님 — 파일은 저장소 루트의 `/home/user/FlagQuiz/sw.js` 다
- 최초 T2 이관 명세(현재 네 버킷 구현·단독 배포 완료, 아이패드 확인은 STATUS.md 참조): 옛 `var VERSION = 'flagquiz-v4';` 를 네 상수로 교체: `var SHELL_CACHE='flagquiz-shell-v1'; var FLAG_CACHE='flagquiz-flags-v1'; var ART_CACHE='flagquiz-art-v1'; var AUDIO_CACHE='flagquiz-v4';` + `var KEEP=[SHELL_CACHE,FLAG_CACHE,ART_CACHE,AUDIO_CACHE];`
- **AUDIO_CACHE 는 반드시 옛 이름 'flagquiz-v4' 를 물려받는다.** 아이패드에 이미 받아둔 114MB 가 그 이름 아래 있다. 바꾸는 순간 전량 재다운로드다. 그 취지를 주석으로 파일에 못박는다
- sw.js:35 `caches.open(VERSION)` → `caches.open(SHELL_CACHE)` (install)
- sw.js:55 `caches.open(VERSION)` → `caches.open(FLAG_CACHE)` (warmFlags)
- sw.js:76-77 정리 로직을 화이트리스트로: `keys.filter(function(k){ return k.indexOf('flagquiz-')===0 && KEEP.indexOf(k)===-1; })`
- sw.js:72-82 activate 의 `.then(warmFlags)` 앞에 **레거시 정리 단계** 추가: `caches.open(AUDIO_CACHE)` 를 열어 `cache.keys()` 를 훑고 `new URL(req.url).pathname.indexOf('/audio/')===-1` 인 항목만 정리한다. 국기는 FLAG_CACHE에 확보된 뒤 원본을 지우고, 복사 실패 시 원본을 보존한다. 옛 셸은 지우되 음원은 읽거나 복사·삭제하지 않는다 (음원 재다운로드 0바이트)
- sw.js:122 `caches.open(VERSION)` → `caches.open(AUDIO_CACHE)` (cachedAudio 저장)
- sw.js:148 `caches.open(VERSION)` → `caches.open(FLAG_CACHE)` (flags 저장)
- sw.js:163 `caches.open(VERSION)` → `caches.open(SHELL_CACHE)` (network-first 저장)
- **전역 `caches.match()` 를 전부 버킷 지정 조회로 바꾼다** — sw.js:116(cachedAudio 조회) → AUDIO_CACHE, sw.js:143(flags 조회) → FLAG_CACHE, sw.js:168·170(오프라인 폴백) → SHELL_CACHE. 전역 match 는 모든 버킷을 뒤지므로 레거시 버킷에 남은 옛 index.html 이 오프라인에서 새 셸을 덮어쓴다
- sw.js:135-155 사이(flags 분기 앞)에 `/images/` 분기 신설 — flags 와 같은 cache-first, 저장처는 ART_CACHE, `res && res.ok` 일 때만 put (404 를 캐시하지 않는다). 그림 파일이 아직 0장이어도 이번 커밋에 미리 넣는다
- tests/sw.test.mjs:13 의 `caches.keys` 고정값과 :31-36 의 단언을 새 이름 체계로 갱신한다

**완료 판정**

- [ ] `grep -n VERSION sw.js` 가 0건
- [ ] activate 직후 살아남는 캐시가 정확히 `flagquiz-shell-v1 / flagquiz-flags-v1 / flagquiz-art-v1 / flagquiz-v4` 네 개이고, `another-app-v1` 같은 남의 캐시는 건드리지 않는다
- [ ] `flagquiz-v2`·`flagquiz-v3` 는 삭제된다
- [ ] `flagquiz-v4` 안의 `/audio/…` 항목은 그대로 남는다. 옛 셸과 새 FLAG_CACHE에 확보한 국기만 정리하며, 국기 복사 실패 시 원본은 남겨 오프라인 조회에 재사용한다
- [ ] SHELL_CACHE 이름만 v1→v2 로 올려도 `/audio/sua/*.mp3` 요청이 여전히 캐시 적중한다 (이 과제의 존재 이유를 고정하는 단언)
- [ ] `/images/symbols/kr.webp` 응답은 ART_CACHE 에만 들어가고 404 응답은 어느 버킷에도 저장되지 않는다
- [ ] 기존 tests/sw.test.mjs 10개 테스트가 새 이름으로 전부 통과한다
- [ ] 아이패드 실기기: 이 커밋을 배포한 뒤 비행기 모드에서 앱을 열어 ①앱이 뜨고 ②국기가 보이고 ③수아 음원이 재생된다. 셸·국기(약 2MB)는 1회 재다운로드가 정상이고, 음원 114MB 재다운로드가 일어나면 실패다

**테스트**

- tests/sw.test.mjs:13 을 `['another-app-v1','flagquiz-v2','flagquiz-v3','flagquiz-v4','flagquiz-shell-v1']` 로 바꾸고 :35 단언을 `['flagquiz-v2','flagquiz-v3']` 로 유지 (v4 가 KEEP 에 있어 살아남는 것이 핵심 단언)
- 신규: 레거시 v4 버킷에 `/audio/sua/x.mp3` 와 `/index.html` 을 넣고 activate 후 음원은 남고 index.html 은 지워졌는지
- 신규: 셸 캐시 이름을 바꾼 두 번째 worker 를 만들어도 음원이 오프라인 재생되는지
- 신규: `/images/a.webp` 200 은 ART_CACHE 에 put, 404 는 puts 가 0건인지
- 신규: 오프라인 navigate 폴백이 SHELL_CACHE 의 index.html 을 쓰고 레거시 버킷의 옛 index.html 을 쓰지 않는지

**함정**

- 음원 버킷 이름을 'flagquiz-audio-v1' 처럼 예쁘게 바꾸고 싶어진다 — 바꾸는 순간 114MB 가 날아간다. 이름은 'flagquiz-v4' 로 고정
- activate 에서 옛 버킷의 음원을 새 버킷으로 **복사**하는 이관을 시도하지 마라. 114MB 를 Cache API 로 옮기는 동안 activate 가 붙잡히고 실패 시 절반만 옮겨진다
- 정리 코드를 화이트리스트로 바꾸지 않으면 새 버킷 네 개가 서로를 지운다 (지금 규칙은 'flagquiz- 로 시작하면 전부 삭제')
- install 의 `cache.addAll(SHELL)`(sw.js:36)은 목록 중 하나만 실패해도 전체 설치가 실패한다. SHELL(sw.js:6-31)에 아직 존재하지 않는 파일을 미리 적어 넣지 마라 — 새 파일은 T4 에서 파일 생성과 같은 커밋에 넣는다
- warmFlags(sw.js:46-70)의 정규식 `/"code"\s*:\s*"([a-z]{2})"/g` 는 `./data/countries.js` 를 텍스트로 훑는다. 이번 커밋에서 이 함수의 대상 파일을 바꾸지 마라

### `T3-feature-flags` 기능 플래그 — 미완성 콘텐츠를 숨긴 채 코드를 main 에 넣는 스위치

**왜** — D4 가 '194개국 전량 완성 후 한 번에 공개' 를 확정했고, 완화책이 '기능 플래그로 숨긴 채 코드는 계속 main 에 넣는다' 다. D6 함정 2 때문에 이 스위치는 최상위 스칼라가 될 수 없다 — storage.js:48-54 가 `typeof saved[k]==='object'` 인 값만 복원하므로 `state.artOn=true` 는 저장은 되고 절대 읽히지 않아 매번 기본값으로 돌아간다.

**독립 배포** — 가능 · 선행: `T1-export-button`

**고칠 곳**

- 새 파일 js/features.js — IIFE 로 `FQ.features = { DEFAULTS: {art:false}, flags: flags, on: on }` 를 노출
- `function flags()` 안에서 `var s=(FQ.storage && FQ.storage.settings())||{}; var over=(s.dev && typeof s.dev==='object')?s.dev:{};` 로 읽고 `typeof over.art==='boolean' ? over.art : DEFAULTS.art` 를 돌려준다. **모듈 로드 시점에 storage 를 부르지 않는다** — `on()` 호출 시점에만 읽는다
- js/storage.js:22 `timer: 0` 뒤에 `,\n      dev: {}` 추가. settings 는 storage.js:55 가 `Object.assign({}, DEFAULTS.settings, saved.settings)` 로 병합하므로 새 키가 기존 저장분에 자동 백필된다 — 이것이 settings 안에 넣는 이유다
- index.html:44 `<script src="js/storage.js"></script>` 다음 줄에 `<script src="js/features.js"></script>` 추가
- sw.js SHELL(6-31행)에 `'./js/features.js'` 추가 — `'./js/storage.js'`(13행) 옆
- tests/run.mjs:52 의 로드 목록에 `'js/features.js'` 를 `'js/storage.js'` 뒤에 추가
- tests/app.test.mjs:54 의 로드 목록에도 같은 파일 추가
- build-site.mjs 는 :56 에서 js/ 폴더를 통째로 복사하므로 추가 작업이 없다

**완료 판정**

- [ ] 기본값 `FQ.features.on('art') === false`
- [ ] 콘솔에서 `FQ.storage.updateSettings({dev:{art:true}})` 후 **새로고침해도** `FQ.features.on('art') === true` — 재시작 뒤에도 살아남는 것이 스칼라 함정을 피했다는 증거다
- [ ] `FQ.storage.updateSettings({dev:{}})` 로 되돌리면 다시 false
- [ ] localStorage 가 막힌 환경에서 `on('art')` 가 예외 없이 false
- [ ] **이 스위치를 켜는 UI 를 화면에 만들지 않는다.** 아이가 누를 수 있는 곳에 미완성 콘텐츠 스위치를 두지 않는다. 켜고 끄는 것은 콘솔에서만 한다
- [ ] `npm test` 전부 통과

**테스트**

- tests/run.mjs 에 '기능 플래그' 그룹 추가 — 기본 false / `updateSettings({dev:{art:true}})` 후 true / 같은 샌드박스에서 storage 를 다시 로드해도 true 로 복원 (스칼라 함정 회귀 검사) / `updateSettings({dev:{}})` 후 false
- `FQ.storage` 가 아직 없는 상태에서 `FQ.features.on('art')` 를 불러도 던지지 않고 false 를 돌려주는지

**함정**

- `updateSettings({dev:{art:true}})` 는 storage.js:78 의 `Object.assign(state.settings, patch)` 라 dev 객체를 **통째로 교체**한다. 부분 갱신이 아니다 — 플래그가 둘 이상이 되면 호출자가 기존 dev 를 펼쳐 넣어야 한다
- 플래그를 모듈 로드 시점 상수로 굳히면(`var ART = FQ.features.on('art')`) 설정 변경이 반영되지 않고, 로드 순서에 따라 FQ.storage 가 없어 터진다. 반드시 호출 시점에 읽는다
- 최상위에 `state.features = {...}` 를 새로 만들어도 동작은 하지만 settings 와 달리 **백필이 안 된다**(storage.js:48-54 의 병합은 1단계뿐이라 기존 객체 안에 새 키를 채워 주지 않는다). 이미 병합 특례가 있는 settings(storage.js:55) 안이 안전하다

### `T4-subjects-data` 자료 파일 신설 — data/subjects.js · data/confusion-groups.js · images/ 폴더와 배선 7곳

**왜** — 194개국 상징물·명소 문자열과 혼동군 58군이 docs/expansion/ 에만 있고 앱이 읽을 수 있는 자리에 하나도 없다. 뒤의 도감 카드(T6)와 혼동군 배제(T7)가 둘 다 이 파일을 읽는다. 그림은 0장이어도 이 과제는 완결된다 — 자료가 먼저 들어와 있어야 그림이 도착하는 대로 켜진다.

**독립 배포** — 가능 · 선행: `T1-export-button`, `T2-sw-cache-buckets`, `T3-feature-flags`

**고칠 곳**

- **countries.js 에 합치지 않는다.** 근거 셋: ①tests/run.mjs:85-112 가 나라마다 11개 필드를 전수 검사하고 194행 diff 가 그림 작업 내내 리뷰를 가린다 ②sw.js:47-53 의 warmFlags 가 `./data/countries.js` 를 **텍스트로 받아 정규식** `/"code"\s*:\s*"([a-z]{2})"/g` **으로 훑는다** — 이 파일 안에 `"code"` 키가 또 생기면 국기 예열 목록이 오염된다 ③버킷 분리(T2)가 의미를 가지려면 그림 자료가 따로 갱신돼야 한다
- 새 파일 data/subjects.js — **배열이 아니라 코드 키 객체**, `"code"` 필드를 두지 않는다: `window.FQ.subjects = { "af": { "symbol": {"ko":"석류","prompt":"반으로 갈라 붉은 알이 드러난 석류","cat":"땅과하늘"}, "place": {"ko":"밴드아미르 호수","prompt":"…","city":"바미안","grade":"B"} }, … }`
- 명소가 없는 46개국(ae, am, kh, kw, my, sg, sy, tj, tl, tm, ad, be, by, cy, md, mt, sm, bi, cf, er, gn, gq, lr, ly, mz, sl, so, st, tg, bs, cu, do, gd, ht, kn, lc, tt, vc, ec, gy, py, sr, uy, fj, mh, pg)은 `place` 키를 **아예 두지 않는다**. `null` 이나 `""` 를 넣지 마라 — 존재 검사가 `!!s.place` 한 줄로 끝난다
- `prompt` 는 SUBJECTS.csv 의 구별 지침 문자열 그대로(D8). 화면에 안 쓰더라도 남긴다 — 그림 재생성의 근거가 이 문자열이다. 예비1·예비2 는 넣지 않는다 (앱이 쓰지 않는다)
- 새 파일 data/confusion-groups.js — `window.FQ.confusionGroups = [ {name, axis, codes}, … ]` 58군. docs/expansion/confusion-groups.json 의 `_설명`·`_사용처`·`_출처` 세 메타 키는 버리고 `groups` 배열만 내보낸다
- JSON 을 `fetch()` 로 읽지 않는다 — ①docs/ 는 build-site.mjs:56 의 폴더 목록에 없어 배포되지 않고 ②이 앱은 file:// 로도 열린다(app.js:1443-1449)
- 새 스크립트 scripts/build-subjects.mjs — docs/expansion/SUBJECTS.csv(194행 15열) + confusion-groups.json → 위 두 .js 를 생성. package.json scripts 에 `"subjects:build": "node scripts/build-subjects.mjs"` 추가. **194행을 손으로 옮기지 마라**
- CSV 파서는 인용 필드를 처리해야 한다 — af 행의 명소 문자열이 실제로 따옴표 안에 쉼표를 담고 있다
- 새 폴더 images/symbols/ 와 images/places/ 에 `.gitkeep` 만 둔다. **flags/ 안에 넣지 마라** — tests/run.mjs:118-123 의 고아 파일 검사, sw.js:59 의 국기 예열, build-site.mjs:56-58 의 flags/ 통째 복사에 섞여 들어간다
- 배선 ①: index.html:53 `<script src="data/countries.js">` 다음 줄에 `data/subjects.js`, 그다음 `data/confusion-groups.js` (js/quiz.js 인 55행보다 앞)
- 배선 ②: sw.js SHELL(6-31행)에 `'./data/subjects.js'`, `'./data/confusion-groups.js'` 추가 — `'./data/countries.js'`(11행) 옆
- 배선 ③: scripts/build-site.mjs:16 `const files = ['index.html','sw.js','manifest.webmanifest','data/countries.js']` 에 두 파일 추가. **data/ 는 :56 의 폴더 통째 복사 대상이 아니다.** 여기 안 적으면 배포본에 파일이 없어 아이패드에서만 흰 화면이 된다
- 배선 ④: scripts/build-site.mjs:56 `for (const folder of ['assets','css','flags','js'])` 에 `'images'` 추가. 폴더가 없으면 `fs.cp` 가 던지므로 .gitkeep 이 그 방어다
- 배선 ⑤: scripts/serve.mjs:16-29 TYPES 에 `'.webp': 'image/webp'` 추가. 없으면 application/octet-stream 으로 나가 로컬 확인이 엉뚱하게 실패한다
- 배선 ⑥: tests/run.mjs:52 로드 목록에 `'data/subjects.js'`, `'data/confusion-groups.js'` 추가 (data/countries.js 뒤)
- 배선 ⑦: tests/app.test.mjs:54 로드 목록에도 같은 두 파일 추가

**완료 판정**

- [ ] `Object.keys(FQ.subjects).length === 194` 이고 키 집합이 FQ.countries 의 code 집합과 정확히 같다 (양방향 차집합 0)
- [ ] symbol 이 있는 나라 **194**개, place 가 있는 나라 **148**개, place 키가 아예 없는 나라 **46**개 (SUBJECTS.csv 실측값)
- [ ] data/subjects.js 안에 문자열 `"code"` 가 없다
- [ ] `FQ.confusionGroups.length === 58`, 모든 codes 가 실재 국가 코드(현재 CSV 기준 위반 0건), axis 는 '상징물'(30군)·'명소'(28군) 둘 중 하나
- [ ] `node scripts/build-subjects.mjs` 를 두 번 돌려도 산출물이 바이트 단위로 같다 (키 정렬 고정 — 결정적 출력)
- [ ] `npm run build` 통과 + `_site/data/subjects.js`, `_site/data/confusion-groups.js`, `_site/images/` 존재
- [ ] **새 음원 문구 0개** — js/voice-manifest.js 와 data/voice-config.json 을 이 작업에서 건드리지 않는다. 건드리면 build-site.mjs:13-15 게이트가 main 배포 전체를 멈춘다
- [ ] `npm start` 후 `curl -I http://localhost:8080/images/symbols/.gitkeep` 이 403·500 이 아니다

**테스트**

- tests/run.mjs 에 '주제 자료' 그룹 추가 — 위 수용 기준 1·2·4 를 단언
- `data/subjects.js` 원문에 `"code"` 가 없음을 fs 로 읽어 단언 (sw.js 정규식 오염 회귀 검사)
- 모든 place 항목이 `ko` 와 `prompt` 를 갖고, grade 는 'S'|'A'|'B' 중 하나임을 단언
- scripts/build-subjects.mjs 가 CSV 의 인용 필드(af 행)를 올바로 읽었는지 — 해당 문자열에 쉼표가 남아 있는지 단언

**함정**

- JSON 을 fetch 로 읽고 싶어진다 — file:// 에서 죽고 배포본에 파일도 없다. `<script>` 로 로드되는 .js 여야 한다
- 194행을 손으로 옮기면 CSV 의 따옴표 안 쉼표에서 반드시 깨진다
- subjects 를 배열로 만들면 나라마다 `code` 필드가 필요해지고, 그 파일이 SHELL 에 들어가는 순간 sw.js 정규식과 같은 모양의 텍스트가 배포본에 하나 더 생긴다. 코드 키 객체가 이 문제를 통째로 없앤다
- images/ 를 build-site.mjs:56 에 추가하면서 .gitkeep 을 빼먹으면 CI 체크아웃에 빈 폴더가 없어 `fs.cp` 가 던지고 **배포가 멈춘다**
- sw.js SHELL 에 파일을 적었는데 파일 생성을 잊으면 `cache.addAll`(sw.js:36)이 통째로 실패해 서비스워커가 설치되지 않는다 — 파일과 SHELL 항목은 같은 커밋에

### `T9-doc-fixes` 문서 불일치 정리 — 대상 연령 · 모드 라벨 5개 · README 방침 한 줄

**왜** — 셋 다 코드 위험이 0이고 지금 안 고치면 다음 사람이 잘못된 전제로 만든다. 특히 모드 라벨은 같은 모드를 두 이름으로 부르고 있어, 그림 모드가 추가되면 세 번째 이름이 생긴다.

**독립 배포** — 가능

**고칠 곳**

- design/SPEC.md:8 `한국어 어린이용(7~10세) 세계 국기 퀴즈` → 실제 사용자인 만 4세 기준으로 고친다. `grep -rn "7~10" design/ README.md index.html` 이 저장소에서 이 문자열이 있는 **유일한 곳**이다(실측 1건)
- **docs/expansion/README.md:145 가 말한 '본문 글자도 9~12.5px' 는 design/SPEC.md 안에 없다.** 116줄 전체에 `font-size` 라인이 0건이고 px 언급은 :25·26(그림자) :27(모서리) :37(터치 타깃 44/54/64) :45(아이콘 격자)뿐이다. 그 수치는 `.gitignore` 에 걸린 `design/flag-quiz-game-design.html`(생성 결과물)에 있을 것이다. **없는 줄을 찾아 헤매지 마라** — SPEC.md 는 :8 한 줄만 고치고, css/style.css 는 이 작업에서 건드리지 않는다
- 모드 라벨 — `js/quiz.js:11-15` 의 label 다섯 개를 `js/app.js:19-23` 의 title 다섯 개에 맞춘다. **MODE_CARDS 쪽이 정본**이다: 아이가 실제로 보는 홈 화면이고, README.md:72-76 표와 index.html:7 설명문이 이미 그 이름을 쓴다
- 실제 불일치는 4건이다 — quiz.js:12 '나라 보고 국기 고르기' → '나라 보고 국기 찾기' / quiz.js:13 '나라 보고 수도 고르기' → '수도 맞히기' / quiz.js:14 '국기 보고 이름 쓰기' → '이름 써서 맞히기' / quiz.js:15 '국기 보고 말하기' → '말로 답하기'. quiz.js:11 은 이미 일치한다
- MODES.label 은 screens.js:183-185 의 `modeLabel()` 을 통해 '최근 놀이' 기록 줄(screens.js:237)에만 나온다. 고쳐도 다른 화면에 영향이 없다
- **MODE_CARDS 를 quiz.js 로 옮겨 단일 출처로 만들지 마라** — app.js 는 quiz.js 보다 나중에 로드되고(index.html:55, 58) MODE_CARDS 에는 emo·desc 가 더 있다. 이번엔 문자열 5개를 맞추는 것으로 끝낸다
- README.md:68-79 모드 표 — 라벨은 이미 맞고 이번 PR 에서 모드가 늘지 않으므로 **표를 고치지 않는다**
- README.md:176 아래에 한 줄 추가: 지도에서는 땅만 그리고 국경선을 나라를 가르는 선으로 쓰지 않는다는 방침 (DECISIONS.md D3-5 가 명문화를 요구한 문장). 지도는 아직 안 만들지만 지금 적는 비용이 0이다
- index.html:7 meta description 은 모드 5개 그대로 — 고치지 않는다

**완료 판정**

- [ ] `grep -rn "7~10" design/ README.md index.html` 이 0건
- [ ] `FQ.quiz.MODES` 의 label 다섯 개가 app.js MODE_CARDS 의 title 다섯 개와 문자열 단위로 같다
- [ ] README.md 에 국경선 방침 한 줄이 추가되고 :173-176 의 기존 문단과 이어진다
- [ ] `npm test` 전부 통과 — 현재 어떤 테스트도 모드 라벨을 단언하지 않는다(`grep -rn "국기 보고\|나라 보고\|말로 답하기\|이름 써서\|수도 맞히기" tests/` 가 0건임을 실측으로 확인했다)

**테스트**

- tests/run.mjs 에 '모드 이름' 그룹 추가 — 다섯 개 문자열을 하드코딩한 배열과 `quiz.MODES[id].label` 을 비교한다
- **app.js 소스를 정규식으로 파싱해 MODE_CARDS 를 뽑는 테스트를 만들지 마라.** app.js 는 DOM 없이 실행되지 않고(tests/app.test.mjs:56-58 이 문자열 치환까지 해야 겨우 돌린다), 제품 코드를 정규식으로 읽는 테스트는 오래 못 간다. app.js 와의 동기화는 리뷰가 잡는다
- MODES 다섯 개 각각에 `axis` 필드가 있는지(T5 와 겹치는 단언 — 한쪽에만 둔다)

**함정**

- MODE_CARDS 와 MODES 를 한 곳으로 합치는 리팩터링으로 번지기 쉽다. 이번 범위는 문자열 5개
- design/SPEC.md 의 px 수치를 4세 기준으로 '고치려' 들면 :37 의 44/54/64px 을 건드리게 되는데, 그 값은 이미 4세에 맞는 값이고 css/style.css 가 그대로 쓰고 있다
- README.md 모드 표에 그림 모드를 미리 적지 마라 — D2 에 따라 퀴즈 모드는 2주 뒤 1개뿐이고 아직 조작 방식도 안 정해졌다

### `T5-record-axis` 기록 축 분리 — recordAnswer 에 축 인자, 스키마는 가산적으로만

**왜** — quiz.js:429 가 모드 구분 없이 나라 코드 하나에 기록하고, storage.js:120-126 이 틀린 나라를 최대 4.9배 자주 출제한다. 민규가 '케냐의 상징물'을 세 번 틀리면 이미 완벽히 아는 케냐 국기가 계속 튀어나온다. 한 번 뭉쳐 저장하면 어느 오답이 어느 축에서 나왔는지 복원할 방법이 없다(D6).

**독립 배포** — 가능 · 선행: `T1-export-button`

**고칠 곳**

- **설계: 기존 레코드 안에 필드를 더하지 않고 새 최상위 객체 버킷을 만든다.** storage.js:36 `badges: {}` 다음에 `axes: {},   /* axis -> code -> {seen,correct,wrong,streak} */` 추가. 객체이므로 storage.js:48-54 가 복원한다
- storage.js 상단에 `var FLAG_AXIS = 'flag';` 상수 추가
- storage.js:83-88 `countryStat` 은 **한 글자도 바꾸지 않는다** (국기 축의 저장처가 그대로 유지된다)
- 새 함수 `axisStat(axis, code)` — `state.axes[axis] = state.axes[axis] || {}` 후 `{seen:0,correct:0,wrong:0,streak:0}` 생성. 모든 필드를 `(r.x||0)` 으로 방어해 읽는다
- storage.js:91 시그니처를 `function recordAnswer(code, isCorrect, axis)` 로. 본문 첫 줄 `var ax = axis || FLAG_AXIS; var s = ax===FLAG_AXIS ? countryStat(code) : axisStat(ax, code);` 이후 증감은 전부 `(s.x||0)+1` 형태로 바꾼다
- **storage.js:112-117 wrongList 와 :120-126 weightOf 는 한 글자도 바꾸지 않는다.** state.countries 만 읽으므로 자동으로 국기 축만 본다 — 이 설계를 고른 이유가 이것이다 (D6 요구사항을 코드 0줄로 만족)
- storage.js:175-182 resetProgress 에 `state.axes = {};` 추가. resetAll(170-173)은 DEFAULTS 통째 복제라 자동으로 따라온다
- storage.js:184-202 export 에 `axisStat: axisStat,` 와 `allAxisStats: function(axis){ return (state.axes[axis] || {}); },` 추가
- quiz.js:10-16 MODES 다섯 항목에 `axis: 'flag'` 를 각각 명시한다 (choice4·reverse·capital·typing·voice)
- quiz.js:429 `FQ.storage.recordAnswer(q.country.code, res.correct)` → 세 번째 인자로 `(MODES[cfg.mode] && MODES[cfg.mode].axis)` 를 넘긴다. 인자를 생략해도 'flag' 로 떨어지므로 다른 호출부를 못 고쳐도 지금 동작이 변하지 않는다
- stats 총계(storage.js:101-102)는 축 구분 없이 올린다 — '얼마나 놀았나'이지 '국기를 얼마나 아나'가 아니다. 스티커(progress.js:72-75)와 '자주 틀리는 국기'(screens.js:175-181)는 state.countries 만 읽으므로 그대로 국기 축이다

**완료 판정**

- [ ] `recordAnswer('kr', false)` 와 `recordAnswer('kr', false, 'flag')` 가 완전히 같은 결과를 낸다 (하위호환)
- [ ] `recordAnswer('kr', false, 'symbol')` 를 10번 해도 `wrongList()` 에 'kr' 이 없고 `weightOf('kr') === 2.0` (아직 안 본 나라) 이다
- [ ] `allAxisStats('symbol').kr.wrong === 10`
- [ ] `progress.hasSticker('kr') === false` — 그림 축만 맞혀서는 국기 스티커가 생기지 않는다
- [ ] 옛 저장분 흉내: localStorage 에 `{"countries":{"kr":{"seen":3,"correct":3,"streak":3}}}` (wrong 필드 없음)을 심고 로드한 뒤 `recordAnswer('kr', false)` 가 NaN 을 만들지 않는다
- [ ] `resetProgress()` 뒤 `allAxisStats('symbol')` 이 빈 객체
- [ ] KEY 는 여전히 'flagquiz.v1' 이고 storage.js:8 이 diff 에 없다
- [ ] tests/run.mjs:429-446 '오답노트 졸업' 그룹이 한 줄도 안 바뀌고 통과한다

**테스트**

- tests/run.mjs:446 아래에 '기록 축 분리' 그룹 신설 — 위 수용 기준 1~6 을 단언
- tests/run.mjs:403 의 기존 2인자 호출은 그대로 두어 하위호환을 증명한다
- tests/app.test.mjs:360·373·385·392 의 2인자 호출도 그대로 둔다 (변경하면 하위호환 증명이 사라진다)

**함정**

- `state.countries[code].symbolWrong` 처럼 **기존 레코드 안에** 필드를 더하면 storage.js:48-54 의 병합이 1단계뿐이라 기존 194개 레코드에 백필되지 않는다. 실수 한 곳에서 NaN 이 퍼진다. 새 최상위 버킷 `axes` 가 이 문제를 통째로 없앤다
- `axes` 를 최상위 **스칼라**로 두면 storage.js:49 의 `typeof saved[k]==='object'` 를 통과하지 못해 저장은 되고 절대 읽히지 않는다. **배열**로 두면 storage.js:50-51 이 병합 대신 통째 교체를 한다. 반드시 평범한 객체
- weightOf/wrongList 를 '더 일반화한다'며 축 인자를 받게 고치고 싶어진다 — D6 가 금지한다. 손대지 마라
- resetProgress 에 `axes` 추가를 잊으면 '기록 모두 지우기'(screens.js:256-261)가 그림 축 기록을 남긴다 — 아이가 지웠다고 생각한 것이 남는다

### `T7-confusion-exclude` 혼동군 배제 + '자료 있는 나라만' 필터 — quiz.js 오답 생성

**왜** — D8 이 명소 축의 1:1 을 완화하는 대가로 '혼동군을 같은 판에 내지 않는다' 를 약속했다. 그리고 README 가 '이 작업에서 가장 확실히 예정된 버그' 라 부른 것이 quiz.js:49 와 :87-90 의 폴백이다 — 후보가 모자라면 194개국 전체에서 끌어와 그림 없는 나라가 보기로 올라온다. 두 필터는 같은 함수 안에 있으므로 같은 커밋에 넣는다.

**독립 배포** — 가능 · 선행: `T4-subjects-data`

**고칠 곳**

- quiz.js:9 근처(MODES 위)에 지연 인덱스 빌더 `confusionSet(code)` 추가 — `FQ.confusionGroups` 를 훑어 `code -> {같은 군의 다른 코드들}` 맵을 만들고 모듈 변수에 캐시한다. **로드 시점이 아니라 첫 호출 시점에** 만든다 (테스트가 나중에 주입할 수 있다)
- **축을 넘는 배제 — 군의 `axis` 필드로 군을 걸러내지 마라.** confusion-groups.json 은 축 교차를 이미 **코드로** 표현해 두었다: 12번 군 `axis:"명소"` 「사막 모래언덕」의 codes 에 상징물이 모래언덕인 `dz` 가 들어 있고, 10번 군에 `st·dj`, 13번 군에 `il·pk` 가 같은 이유로 들어 있다. `groups.filter(g => g.axis === 현재축)` 을 쓰면 이 교차가 통째로 사라진다. **소속은 (코드) 기준이지 (코드, 축) 기준이 아니다**
- quiz.js:48 시그니처를 `distractors(answer, count, source, mode, opts)` 로 확장 (5번째 선택 인자)
- quiz.js:49-51 의 candidates 생성 뒤에 두 단계 추가 — ①**자료 필터**: `opts.axis` 가 'symbol'|'place' 면 `FQ.subjects[c.code] && FQ.subjects[c.code][opts.axis]` 인 나라만 남긴다 ②**혼동군 필터**: `var avoid=confusionSet(answer.code);` 로 `avoid[c.code]` 인 나라를 뺀다
- quiz.js:86-90 의 전체 폴백도 **같은 두 필터를 거친 목록**에서 채운다. `all()` 을 그대로 쓰면 필터가 통째로 무의미해진다. `fallbackPool` 변수 하나를 만들어 82-85 루프와 87-90 이 같은 것을 보게 한다
- **굶주림 방어**: 두 필터를 다 걸고도 `out.length < count` 면 **혼동군 배제만** 풀고 한 번 더 채운다. **자료 필터는 절대 풀지 않는다.** 이유: tests/run.mjs:288-291 이 후보 1개짜리 풀에서도 보기 4개를 요구한다. 자료 없는 나라를 올리면 빈 칸이 렌더링되지만, 혼동군이 겹치는 것은 '운으로 찍게 된다'일 뿐 화면이 깨지지 않는다. 완화 순서를 거꾸로 하지 마라
- quiz.js:95 `makeQuestion(answer, mode, source)` 에 `opts` 를 통과시키고, quiz.js:361 의 호출부에 `MODES[cfg.mode]` 의 axis 를 넘긴다
- quiz.js:29-45 `pool()` 에도 `opts.axis` 필터를 같은 규칙으로 넣는다 (출제 풀 쪽 — 정답이 될 나라)
- quiz.js:52-54 와 :75 의 `mode==='capital'` 분기는 건드리지 않는다. 수도 중복 방지와 혼동군은 서로 다른 규칙이다

**완료 판정**

- [ ] 194개국 전수: `axis:'symbol'` 로 만든 보기 4개 안에 같은 혼동군에 속한 쌍이 하나도 없다. 굶주림 완화가 발동한 문항 수를 세어 **0건** 임을 단언한다
- [ ] `axis:'place'` 에서 정답이 `dz` 일 때 보기에 `mn·mr·na·sa` 가 없다 — 축 교차 배제가 살아 있다는 증거
- [ ] `axis:'place'` 로 출제하면 명소가 없는 46개국(ae 등)이 정답으로도 보기로도 나오지 않는다
- [ ] `axis` 를 넘기지 않으면 기존 동작과 완전히 같다 — tests/run.mjs:266-292 '문제 만들기' 그룹이 한 줄도 안 바뀌고 통과
- [ ] 후보가 1개인 풀(tests/run.mjs:288-291)에서도 보기 4개가 나온다
- [ ] `FQ.confusionGroups` 가 없는 환경에서도 distractors 가 예외 없이 기존대로 동작한다

**테스트**

- tests/subjects.test.mjs 신설 (node --test 가 `tests/*.test.mjs` 를 자동으로 집으므로 등록 작업 없음) — 위 수용 기준 1~6
- 혼동군 인덱스가 대칭인지: a 가 b 를 피하면 b 도 a 를 피한다
- 같은 코드가 여러 군에 속하는 경우(예: `sa` 는 12·25·46 세 군)에 세 군의 합집합이 전부 배제되는지
- 인덱스 빌더가 두 번 호출돼도 같은 결과를 주고 재계산하지 않는지 (성능 회귀 — 194문제 × 58군)

**함정**

- `g.axis === 현재축` 으로 군을 거르면 축 교차 배제 3건(dz / st·dj / il·pk)이 통째로 사라진다. 이 명세에서 가장 놓치기 쉬운 한 줄이다
- 인덱스를 문제마다 다시 만들면 194 × 58 이 된다. 첫 호출 시점에 만들어 캐시
- 12개짜리 군(0번 유럽풍 구시가지, 1번 폭포)이 대륙 필터와 겹치면 후보가 급격히 준다. 굶주림 완화가 없으면 보기가 3개로 나오고 tests/run.mjs:270 의 `options.length === 4` 가 깨진다
- 자료 필터를 완화 대상에 넣으면 README 가 경고한 '빈 칸 렌더링' 버그가 바로 돌아온다. 완화 대상은 혼동군뿐
- quiz.js:82-85 의 tier 루프만 고치고 :87-90 폴백을 잊는 것이 가장 흔한 실수다

### `T8-test-gates` 테스트 확장 — 고아 검사는 항상 엄격, 완비 검사는 게이트 뒤로

**왜** — tests/run.mjs:118-123 의 '쓰이지 않는 국기 파일이 없어야 함' 을 그대로 복제하면 방향이 반대인 검사(자료→파일)까지 따라와 194장이 다 모일 때까지 CI 가 빨간불이 되고 점진 커밋이 막힌다. 두 방향을 분리하고, 완비 검사를 플래그와 묶어 T6 의 '플래그 on + 그림 없음 = 깨진 이미지' 함정을 구조적으로 막는다.

**독립 배포** — 가능 · 선행: `T4-subjects-data`, `T7-confusion-exclude`

**고칠 곳**

- tests/run.mjs:114-124 '국기 이미지 파일' 그룹은 **손대지 않는다**
- tests/run.mjs:124 뒤에 '그림 자료' 그룹 신설
- **항상 엄격 ①(고아 방향, 파일→자료)**: `images/symbols/`·`images/places/` 의 모든 `.webp` 파일 이름이 (a) 실재 국가 코드이고 (b) `FQ.subjects[code][axis]` 가 존재한다. 파일이 0장이면 루프가 0바퀴 돌고 통과한다 — **이 방향은 점진 커밋을 막지 않는다**
- **항상 엄격 ②**: `images/` 밑에 `symbols`·`places` 외의 디렉터리가 없고, 그 안에 `.webp` 와 `.gitkeep` 외의 파일이 없다
- **항상 엄격 ③**: subjects 자료 자체의 완비 — 194 symbol / 148 place / 코드 집합 일치 (T4 의 단언과 같은 것)
- **진행률 출력(실패 아님)**: `console.log('  · 상징물 그림 ' + n + '/194, 명소 그림 ' + m + '/148')`
- **조건부 엄격(게이트)**: `FQ.features.on('art') === true` **이거나** `process.env.FQ_REQUIRE_ART === '1'` 일 때만 '194/194 · 148/148' 을 단언한다
- 이 게이트가 핵심이다 — js/features.js 의 `DEFAULTS.art` 를 true 로 바꾸는 커밋은 194장이 같은 PR 에 들어와야만 CI 를 통과한다
- tests/subjects.test.mjs (T7 에서 만든 파일)에 혼동군 배제 단언을 둔다. package.json 의 `"test": "node tests/run.mjs && node --test tests/*.test.mjs"` 가 자동으로 집으므로 등록 작업 없음
- `fs.readdirSync` 대상 폴더가 없을 때를 대비해 `fs.existsSync` 로 감싼다 (T4 의 .gitkeep 이 폴더를 존재하게 만들지만 이중 방어)
- tests/sw.test.mjs 갱신은 T2 에서 이미 끝난다 — 여기서 중복으로 손대지 마라

**완료 판정**

- [ ] 그림 0장 상태에서 `npm test` 통과하고 진행률 `0/194, 0/148` 이 출력된다
- [ ] `images/symbols/zz.webp` (없는 나라)를 두면 실패한다
- [ ] `images/symbols/kr.png` (확장자 다름)을 두면 실패한다
- [ ] `images/symbols/ae.webp` 는 통과하고 `images/places/ae.webp` 는 실패한다 — ae 는 명소가 없는 46개국 중 하나다
- [ ] 그림 0장에서 `FQ_REQUIRE_ART=1 npm test` 는 실패한다
- [ ] js/features.js 의 `DEFAULTS.art = true` 로 바꾸면 그림 0장에서 `npm test` 가 실패한다 (게이트 동작 확인)
- [ ] 상징물 194장 + 명소 148장을 모두 두고 플래그를 켜면 `npm test` 가 통과한다

**테스트**

- 이 과제 자체가 테스트다. 검증은 위 수용 기준 7개를 손으로 재현하는 것으로 한다 (더미 .webp 0바이트 파일로 충분 — 내용 검사는 하지 않는다)
- 진행률 출력이 `ok()` 를 호출하지 않아 pass 카운트를 흔들지 않는지 확인

**함정**

- tests/run.mjs:118-123 을 그대로 복사해 images/ 에 적용하면 **정확히 사용자가 걱정한 상황**이 된다 — 복사할 것은 고아 방향뿐이고, 완비 방향은 게이트 뒤에 둔다
- `npm test` 는 `node tests/run.mjs && node --test …` 라 run.mjs 가 먼저 죽으면 나머지가 안 돈다. 진행률 로그는 run.mjs 에 두되 절대 실패를 만들지 마라
- `.gitkeep` 을 고아 파일로 잡아 실패시키면 빈 폴더가 CI 에서 사라진다
- 그림 파일 내용(크기·포맷·해시)을 검사하려 들지 마라. build-site.mjs:29-49 가 음악에 하는 해시 검증을 흉내 내면 194장마다 해시 목록을 손으로 관리해야 하고, 그림은 재생성이 잦다

### `T6-dex-art-slot` 도감 카드에 그림 자리 — 폴백이 기본, 그림이 예외

**왜** — D2 가 '첫 배포는 도감 카드에 그림 붙이기' 를 확정했다. ui.js:64(fact-box)와 :65(hint-box) 사이에 블록 하나를 끼우는 것으로 끝나고 엔진·채점 변경이 0줄이다. 그림이 0장이어도 이 코드는 지금 들어갈 수 있고, 그림이 도착하면 T3 의 플래그만 켜면 된다.

**독립 배포** — 가능 · 선행: `T3-feature-flags`, `T4-subjects-data`

**고칠 곳**

- js/ui.js:42-47 `countryModal` 진입부에 `var art = (FQ.features && FQ.features.on('art')) ? artFor(country.code) : null;` 추가
- 같은 파일에 helper: `function artFor(code){ var s=(FQ.subjects||{})[code]; return (s && s.symbol) ? { src:'images/symbols/'+code+'.webp', alt:s.symbol.ko } : null; }` — flagSrc(ui.js:13) 옆에 두고 FQ.ui 에 함께 노출한다 (퀴즈 모드가 나중에 재사용한다)
- js/ui.js:64 와 :65 **사이**에 삽입: `(art ? '<figure class="art-box"><img src="'+art.src+'" alt="'+esc(art.alt)+'" loading="lazy" decoding="async"><figcaption class="small muted">'+esc(art.alt)+'</figcaption></figure>' : '') +`
- **폴백**: art 가 null 이면 이 조각이 `''` 라 카드 HTML 이 지금과 바이트 단위로 같다. 그림 없는 나라·플래그 off 에서 빈 칸·회색 네모·깨진 이미지 아이콘이 절대 나오지 않는다. `onerror` 로 숨기는 방식을 쓰지 마라 — 파일이 없으면 alt 텍스트가 이미 한 번 번쩍인다
- css/style.css:505 (`.modal img.big`) 바로 아래에 `.modal .art-box{margin:12px 0 0}` 와 `.modal .art-box img{width:100%;aspect-ratio:4/3;object-fit:contain;border-radius:12px;border:1px solid var(--line);background:var(--card-2);display:block}` 추가. **aspect-ratio 고정이 핵심** — 로딩 중 카드가 늘어나면 아래 '닫기' 단추가 손가락 아래에서 움직인다
- 다크모드: css/style.css:450·460 이 fact-box/hint-box 에 쓰는 패턴 그대로 `@media (prefers-color-scheme: dark){ .modal .art-box img{ background:#fff; } }` — 화풍 A(흰 배경)의 여백과 이어 붙인다. `filter: invert()` 류로 색을 뒤집지 마라 (국기 색과 어긋난다)
- **아이패드 더블탭 확대 방지**: css/style.css:73 의 목록 `button, .pill, .mode-card, .sticker-cell, .wrong-item, a` 에 `.art-box` 를 추가한다 (touch-action: manipulation)
- css/style.css:76 의 user-select 차단 목록에도 `.art-box` 를 추가해 캡션 글자가 끌려 선택되지 않게 한다. **:80 의 예외 목록(`input, .fact-box, .hint-box, .info-list`)에는 넣지 않는다**
- css/style.css:82 의 `img{-webkit-user-drag:none}` 이 이미 끌기를 막으므로 추가 작업 없음
- **ui.js:80 의 `lines` 배열을 바꾸지 않는다.** 그림 이름을 읽어 주려면 새 음원이 필요하고, 그 순간 build-site.mjs:13-15 게이트가 main 배포 전체를 멈춘다. 1차는 새 음원 0개

**완료 판정**

- [ ] 플래그 off 일 때 모달 HTML 문자열이 변경 전과 정확히 같다 (문자열 비교 테스트로 고정)
- [ ] 플래그 on + subjects 에 symbol 없음 → `<figure>` 블록 자체가 없다 (현재 CSV 기준 이 경우는 0건이지만 방어는 남긴다)
- [ ] 플래그 on + 그림 파일 없음 → `<figure>` 는 나오고 깨진 이미지가 보인다. **그래서 플래그 on 은 194장이 다 모인 뒤에만 켠다 — T8 의 CI 게이트가 이것을 강제한다**
- [ ] alt 와 figcaption 에 나라 이름이 아니라 그림 소재 이름(`subjects[code].symbol.ko`)이 들어간다
- [ ] 그림 로딩 전후로 카드 높이가 변하지 않는다
- [ ] 실기기: 그림을 두 번 빠르게 두드려도 확대되지 않고, 길게 눌러도 끌리지 않는다
- [ ] 다크모드에서 그림 배경이 흰색이고 카드 테두리가 보인다

**테스트**

- tests/ui-card.test.mjs 신설 — tests/app.test.mjs:11-52 의 가짜 DOM 을 본떠 js/ui.js 를 로드하고 `countryModal` 이 만든 HTML 문자열을 검사
- 플래그 off HTML 과 기준 문자열(현재 코드가 만드는 것)이 같은지
- `updateSettings({dev:{art:true}})` 후 `<figure class="art-box"` 가 정확히 1회 등장하고 `src="images/symbols/kr.webp"` 인지
- alt 에 나라 이름(`country.ko`)이 들어 있지 않은지
- subjects 에서 해당 코드를 지운 상태에서 `art-box` 가 0회인지

**함정**

- `FQ.features` 가 없을 수 있다 (index.html 로드 순서·테스트 샌드박스). 반드시 `FQ.features && FQ.features.on('art')` 로 방어
- alt 에 나라 이름을 넣지 마라 — 도감에서는 무해하지만 나중에 퀴즈 모드가 같은 `artFor` 를 쓰면 alt 가 정답을 흘린다
- ui.js:50-69 는 통짜 문자열 연결이다. `+` 하나를 빠뜨리면 조용한 문법 오류로 앱 전체가 뜨지 않는다. 삽입 후 반드시 `node --check js/ui.js`
- `.art-box` 를 css/style.css:80 의 user-select 예외 목록에 넣으면 아이가 그림 캡션을 끌어 선택하게 된다
- 이 과제에서 screens.js:140 의 도감 격자 썸네일에 그림을 넣지 마라. 194장이 한 화면에 깔리면 스크롤이 멈춘다 — 별도 과제다

### `T1-csv-reader` 의존성 0 SUBJECTS.csv 파서와 계수 게이트 (scripts/lib/subjects.mjs)

**왜** — 조립·원장·검수 세 스크립트가 전부 같은 CSV를 읽는다. 파서를 세 번 쓰면 따옴표 처리가 어긋나 나라마다 다른 결과가 난다. SUBJECTS.csv는 인용 필드 안에 쉼표와 줄바꿈이 섞여 있어(af·bh·ge·ve 행) split(',')로는 반드시 깨진다. 계수를 테스트로 고정해 두면 뒤의 모든 장수·용량 추정이 근거를 갖는다.

**독립 배포** — 가능

**고칠 곳**

- 신규 scripts/lib/subjects.mjs — RFC4180 최소 파서(따옴표, 이스케이프된 "", 필드 안 줄바꿈, CRLF)를 직접 구현한다. package.json에 의존성 0개(package.json:1-19에 dependencies 항목 자체가 없음)이므로 npm 패키지를 절대 추가하지 않는다.
- export function readSubjects(root) — docs/expansion/SUBJECTS.csv:1의 헤더 15열(code,ko,대륙,상징물,카테고리,선정근거,예비1,예비2,명소,명소도시,명소등급,수도에있음,기존fact재사용,위험,상태)을 그대로 키로 쓰는 객체 배열을 반환. 열 순서가 바뀌어도 헤더 이름으로 찾는다.
- export function toItems(rows) — 행 1개를 최대 2개 항목으로 펼친다. 상징물 칸은 항상 1항목(kind:'symbol'), 명소 칸은 비어 있지 않을 때만 1항목(kind:'landmark'). 빈 문자열/공백만 있는 칸은 항목을 만들지 않는다.
- export function counts(rows) — 아래 수치를 그대로 계산해 반환: 총행 194, 상징물 194, 명소 148, 명소등급 S 25·A 61·B 62·빈칸 46, 상태 final 148·draft 31·fixed-r1 15, 수도에있음 Y 17, 기존fact재사용 118, 대륙별 행수 아시아46·유럽45·아프리카54·북아메리카23·남아메리카12·오세아니아14, 명소 보유 대륙별 아시아36·유럽38·아프리카42·북아메리카14·남아메리카7·오세아니아11.
- scripts/lib/subjects.mjs는 data/countries.js의 code 집합과 CSV의 code 집합이 완전히 같은지 확인하는 crossCheck()도 제공한다(tests/run.mjs:114-124가 flags/에 하는 검사와 같은 성격).

**완료 판정**

- [ ] node -e "import('./scripts/lib/subjects.mjs').then(m=>console.log(m.counts(m.readSubjects('.'))))" 가 위 수치와 한 자도 다르지 않게 출력한다.
- [ ] readSubjects가 194행을 반환하고, 모든 행의 필드 수가 정확히 15다(ragged 0행).
- [ ] toItems가 정확히 342개 항목을 반환한다(symbol 194 + landmark 148).
- [ ] code 194개가 모두 유일하고, data/countries.js의 code 194개와 집합이 정확히 일치한다.
- [ ] 따옴표 안 쉼표 검증: ve 행(SUBJECTS.csv:181)의 상징물이 '트루피알 — …'로 온전히 한 필드로 읽히고, af 행(:3)의 명소가 '붉은 절벽 사이, 하얀 …'처럼 쉼표를 포함한 채 잘리지 않는다.

**테스트**

- tests/image-subjects.test.mjs 신설 — node --test로 돌아간다(package.json:9의 test 스크립트가 tests/*.test.mjs를 자동으로 잡는다). counts() 결과를 상수와 비교하는 스냅샷 테스트 1개, code 집합 대조 1개, 인용 필드 파싱 1개(ve·af 행).
- tests/run.mjs는 건드리지 않는다. 이 단계에서는 이미지 파일이 하나도 없으므로 run.mjs에 파일 존재 검사를 추가하면 즉시 빨간불이 된다.

**함정**

- CSV 필드 안에 '—', '·', '4세' 같은 문자가 많다. 정규식으로 파싱하려 들지 말고 문자 단위 상태기계로 쓴다.
- 상태 열의 값은 final/draft/fixed-r1 세 가지다. 'fixed-r1'은 FIX-ROUND1 교정을 거친 행이라는 뜻이지 미완성이 아니다. draft만 미승인으로 다룬다.
- 명소등급 빈칸 46행은 '등급 미정'이 아니라 '명소 칸 자체가 비어 있음'이다. 등급으로 필터링하지 말고 명소 칸의 공백 여부로 판정한다.
- BOM. CSV 첫 바이트에 BOM이 붙어 있으면 첫 헤더 이름이 'code'가 아니라 '﻿code'가 되어 조용히 전 행이 깨진다. 읽는 즉시 제거한다.

### `T2-ledger-seed` 원장 생성 — docs/image-prompts/presets.json + settings.csv (공통 블록 1회, 항목 342개)

**왜** — mlx-audio 팩이 presets.json을 먼저 확정하고 생성에 들어간 순서를 그대로 옮긴다(docs/mlx-audio/README.md 첫머리, docs/mlx-audio/presets.json의 common+presets 구조). 다만 음악은 16곡이라 프롬프트 전문을 항목마다 통째로 넣었는데, 이미지는 342개라 공통 4문단(약 3KB)을 복제하면 문구 한 줄 고칠 때 342곳을 고쳐야 한다. 공통은 common.blocks에 화풍별로 한 번만 둔다.

**독립 배포** — 가능 · 선행: `T1-csv-reader`

**고칠 곳**

- 신규 scripts/image-ledger.mjs — 서브커맨드 seed|lint|record|report. 의존성 0. node scripts/image-ledger.mjs seed 로 원장을 만든다.
- 신규 docs/image-prompts/presets.json — 최상위: {created, templateVersion:'FQ-IMG-v1', styleChoice:null, common:{tool, aspect, styles:{a:{composition,style,exclusions,output}, b:{composition,style,exclusions,output}}}, items:[…342]}. common.styles.a에는 IMAGE-PROMPTS.md:220-236(A-스타일 블록)과 :240-254(A-금지 블록)을, common.styles.b에는 :296-313(B-상징물 템플릿)과 :317-339(B-랜드마크 템플릿)의 COMPOSITION/STYLE/DO NOT INCLUDE/OUTPUT 네 문단을 한 글자도 바꾸지 않고 옮긴다. 두 화풍의 공통 블록은 서로 다르므로 둘 다 보관한다. 미선택 기본값은 null이며, 이 프로젝트는 D7의 사용자 확정값 b를 별도 반영한다.
- items[] 한 항목의 필드: {id:'<code>-<kind>', code, kind:'symbol'|'landmark', koRaw(CSV 원문 그대로), koApprove(아빠 승인용 2~10자 요약), subjectEn:null, accuracy(landmark만 true), override:null, substitutedFrom:null, keepsBackdrop:false, continent, category(symbol만), grade(landmark만), city(landmark만), inCapital, factReuse, riskNote(CSV 위험 열 원문), confusionGroups:[군 이름…], csvStatus:'final'|'draft'|'fixed-r1', status:'draft', tries:0, bytes:null, outputStem:'images/symbols/<code>'|'images/places/<code>'}
- inCapital은 CSV '수도에있음' 열이 'Y'인 17행만 true, 나머지는 false로 굳힌다(빈칸=false). IMAGE-PROMPTS.md:341-342가 요구한 필드다 — false면 화면 문구가 '수도의 명소'가 아니라 '이 나라의 명소'여야 한다.
- confusionGroups는 docs/expansion/confusion-groups.json의 groups[].codes를 code로 역인덱싱해 채운다. 이 값은 프롬프트에 들어가지 않는다 — 구별 지침을 얼마나 세게 써야 하는지 판단하는 사람용 표시다.
- 신규 docs/image-prompts/settings.csv — 열: code,kind,koApprove,subjectEn,inCapital,override유무,substitutedFrom,status,tries,생성일. docs/mlx-audio/settings.csv와 같은 따옴표 정책(전 필드 인용)으로 쓴다.
- 신규 docs/image-prompts/prompts/(.gitkeep), docs/image-prompts/anchor/(.gitkeep).

**완료 판정**

- [ ] node scripts/image-ledger.mjs seed 를 두 번 돌려도 presets.json의 바이트가 동일하다(멱등, 키 순서 고정, 들여쓰기 2칸, 끝에 개행 1개).
- [ ] presets.json의 items 길이가 정확히 342이고, kind==='symbol' 194개, kind==='landmark' 148개다.
- [ ] 공통 4문단 문자열은 presets.json 전체에서 화풍당 딱 1회씩만 등장한다. grep -c 'COMPOSITION (identical for every image' docs/image-prompts/presets.json 이 1이다(B 기준). items 안에 composition/style/exclusions/output 키가 하나도 없다.
- [ ] inCapital:true 명소 항목이 정확히 17개, factReuse가 있는 CSV 행은 118개다. symbol·landmark 양쪽으로 펼친 factReuse 항목은 220개이며 report는 행 수와 항목 수를 따로 출력한다.
- [ ] csvStatus==='draft'인 행에서 나온 항목은 status가 'blocked-approval'로 시드되어 T5 조립 대상에서 자동 제외된다(31행 → 해당 항목).
- [ ] settings.csv가 342행 + 헤더 1행이고, T1의 파서로 다시 읽었을 때 342항목이 그대로 복원된다.

**테스트**

- tests/image-ledger.test.mjs — (1) seed 멱등성(두 번 실행 후 파일 해시 동일), (2) items 342/194/148, (3) 공통 블록 문자열이 items 안에 복제되지 않았는지(JSON.stringify(items).includes('COMPOSITION (identical') === false), (4) presets.json ↔ settings.csv 행 수·id 집합 일치.

**함정**

- 공통 블록을 items에 복제하고 싶은 유혹이 가장 큰 함정이다. '한 항목만 보면 되니까'로 복제하면 IMAGE-PROMPTS.md:731-737이 금지한 바로 그 상태가 된다.
- koRaw를 요약하지 마라. CSV의 상징물·명소 칸에는 구별 지침이 섞여 있고(명소 칸 57개가 '—' 뒤에 구별 지침을 달고 있다), 그 지침이 D8의 1:1 완화를 지탱하는 유일한 장치다. 요약하면 정보가 사라진다.
- koApprove는 새로 지어내는 것이 아니라 koRaw의 '—' 앞부분(또는 첫 명사구)을 잘라 만든다. 자동 생성 결과가 이상한 항목은 null로 두고 T3에서 사람이 채운다. 지어내면 아빠 승인이 엉뚱한 문장을 승인하게 된다.
- docs/image-prompts/는 .gitignore:11의 docs/artifacts/ 와 다른 경로다. 원장은 커밋되어야 하고 원본 PNG는 커밋되면 안 된다. 두 경로를 헷갈리지 마라.
- scripts/build-site.mjs:56은 ['assets','css','flags','js']만 복사하므로 docs/ 는 자동으로 배포에서 빠진다. 원장이 사용자에게 노출될 걱정은 하지 않아도 된다.

### `T4-subject-lint` 영어 문장 기계 검증 (scripts/image-ledger.mjs lint)

**왜** — T3은 사람 판단이지만, 그 결과의 절반은 기계로 걸러진다. 단어 수·금지 형용사·숫자 누락·중복은 사람이 342건에서 놓친다. 프롬프트를 조립하기 전에 걸러야 잘못된 문장으로 그림을 뽑는 낭비가 없다.

**독립 배포** — 가능 · 선행: `T2-ledger-seed`

**고칠 곳**

- scripts/image-ledger.mjs 의 lint 서브커맨드. 종료 코드 0/1로 CI에서 쓸 수 있게 한다.
- 검사 항목 — (1) subjectEn이 ASCII + 일반 문장부호만(한글·한자·이모지 0자), (2) 단어 수 18~35, (3) 금지 형용사 목록(majestic/beautiful/detailed/intricate/iconic/stunning/cinematic/vibrant/whimsical/charming/epic/dramatic) 0회, (4) 금지 명사(flag/banner/text/letters/sign/signage/inscription/logo/watermark/person/people/face/crowd) 0회, (5) 문장이 마침표로 끝나고 줄바꿈이 없음, (6) 342건 전체에서 문장 중복 0건, (7) koRaw에 숫자 표현(한/두/세/네/다섯/여섯/일곱/여덟/개/장/채/겹)이 있으면 subjectEn에 영어 수사(one/two/three/four/five/six/seven/eight)가 있는지 경고, (8) kind==='landmark'인데 문장이 25단어 미만이면 '실루엣 요소 3가지 미달 의심' 경고, (9) confusionGroups가 2개 이상인 항목인데 색·형태 단어가 없으면 경고.
- report 서브커맨드 — --todo N(다음 N건 표), --status(상태별 집계), --budget(장수·예상 용량 집계, T13이 쓴다).

**완료 판정**

- [ ] node scripts/image-ledger.mjs lint 가 오류 0·경고 0으로 종료 코드 0을 반환한다.
- [ ] 일부러 깨뜨린 입력으로 확인: subjectEn에 'majestic'을 넣으면 오류 1건과 해당 id를 출력하고 종료 코드 1을 반환한다.
- [ ] subjectEn이 null인 항목이 있으면 lint는 그것을 오류가 아니라 '미작성 N건'으로 따로 집계한다(작업 진행률 표시용).
- [ ] 경고와 오류를 구분해 출력한다. 경고는 종료 코드를 바꾸지 않는다 — 7·8·9번은 사람이 판단할 여지가 있다.

**테스트**

- tests/image-ledger.test.mjs 에 lint 규칙별 단위 테스트 9개(각 규칙이 정확히 그 입력에서만 걸리는지).
- 실제 원장 전체에 대해 lint가 통과하는지 확인하는 통합 테스트 1개 — 단, subjectEn이 아직 비어 있는 동안에는 '미작성'을 실패로 세지 않게 한다(그러지 않으면 T3 진행 중 내내 빨간불이다).

**함정**

- 단어 수 세기를 정규식 \s+ 분할로만 하면 하이픈 복합어(blue-grey)를 1단어로 세는데, 이건 의도한 동작이다. 규칙을 문서화해 두지 않으면 나중에 사람이 lint를 의심한다.
- 금지어 검사를 부분 문자열로 하면 'signage' 때문에 'design'이 걸리거나 'face' 때문에 'surface'가 걸린다. 단어 경계(\b)로 검사한다.
- lint를 tests/run.mjs에 넣지 마라. run.mjs는 배포 게이트에 물려 있고, T3이 진행 중인 몇 주 동안 main이 빨간불이 된다.

### `T5-build-prompts` 프롬프트 조립 스크립트 (scripts/build-image-prompts.mjs, 화풍 A/B 인자)

**왜** — 수백 장을 뽑는 동안 프롬프트를 손으로 붙여 만들면 반드시 한 장에서 문단이 빠지거나 순서가 바뀐다. IMAGE-PROMPTS.md:276이 '어순을 바꾸거나 스타일 블록을 한 줄이라도 다듬는 순간 그 장만 다른 세계가 된다'고 못박았다. 조립을 기계에 맡기면 이 실수가 구조적으로 불가능해진다. 미선택 기본값 null과 A/B 분기 구조를 유지하되 현재 프로젝트 화풍은 D7의 B이며, 파일럿에서는 두 화풍의 프롬프트가 '피사체 문장만 같고 스타일 블록만 다른' 상태로 나와야 한다(PILOT.md:3).

**독립 배포** — 가능 · 선행: `T2-ledger-seed`, `T4-subject-lint`

**고칠 곳**

- 신규 scripts/build-image-prompts.mjs. 의존성 0. 인자: --style a|b (필수), --kind symbol|landmark|all (기본 all), --codes kr,jp,cn (기본 전체), --out <디렉터리> (기본 docs/image-prompts/prompts), --stdout (한 건만 표준출력), --force.
- 조립 순서를 코드 상수로 고정한다. 화풍 A: [subjectEn] + '\n\n' + common.styles.a.style + '\n\n' + common.styles.a.exclusions. 화풍 B: 'SUBJECT: ' + subjectEn + (landmark면 '\nACCURACY: …') + (override면 '\n' + override) + '\n\n' + composition + '\n\n' + style + '\n\n' + exclusions + '\n\n' + output. 순서 배열은 파일 맨 위에 const ORDER = [...] 로 한 번만 쓰고 그 외 어디서도 문자열을 이어붙이지 않는다.
- 출력 경로: <out>/<code>-<kind>.txt (예: prompts/kr-landmark.txt). 화풍을 바꾸면 같은 파일을 덮어쓴다 — 두 화풍의 프롬프트를 동시에 저장소에 두지 않는다. 본 생성은 presets.json.styleChoice가 null이면 --style·--force 유무와 무관하게 거부한다. 확정된 styleChoice와 --style이 다르면 --force 없이는 거부한다(확정된 화풍을 실수로 뒤엎는 것을 막는다).
- 파일럿 전용 출력: --out docs/artifacts/images/pilot/prompts-a 처럼 out을 바꿔 A·B를 나란히 뽑을 수 있게 한다(이 경로는 .gitignore:11 아래라 커밋되지 않는다).
- 각 .txt 파일 맨 앞에 주석 줄을 넣지 않는다. 파일 전체가 도구에 그대로 붙여넣는 본문이어야 한다. 메타데이터(화풍, templateVersion, 생성일)는 원장에만 둔다.
- 거부 조건: subjectEn이 null이거나 status가 'blocked-approval'이면 그 항목을 건너뛰고 목록을 요약해 출력한다. lint 오류가 있으면 아예 조립하지 않는다(내부에서 lint를 호출한다).

**완료 판정**

- [ ] node scripts/build-image-prompts.mjs --style b 가 342개 .txt를 쓰고, 파일 수·이름이 원장 items의 id와 1:1로 일치한다.
- [ ] 조립 결과에서 공통 4문단이 presets.json의 원문과 바이트 단위로 동일하다(공백·줄바꿈 포함). diff로 확인 가능해야 한다.
- [ ] --style a 와 --style b 로 각각 뽑은 kr-landmark.txt 두 개가 '피사체 문장은 동일하고 스타일 블록만 다르다'는 조건을 만족한다(첫 문장 비교 테스트).
- [ ] 두 번 실행해도 결과 바이트가 동일하다(멱등).
- [ ] subjectEn이 비어 있는 항목이 하나라도 있으면 그 항목만 건너뛰고 '미작성 N건'을 출력하며, 나머지는 정상 조립된다. 절대 빈 문장으로 조립하지 않는다.
- [ ] --codes kr,jp,cn,be,nl,ve,bf 로 파일럿 8장분(kr-landmark, jp-landmark, cn-symbol, cn-landmark, be-symbol, nl-landmark, ve-landmark, bf-symbol)만 뽑을 수 있다.

**테스트**

- tests/image-prompts.test.mjs — (1) 조립 순서 고정(출력에서 SUBJECT→ACCURACY→COMPOSITION→STYLE→DO NOT INCLUDE→OUTPUT 인덱스가 증가하는지), (2) 공통 블록 바이트 동일성, (3) 멱등성, (4) subjectEn null 항목 건너뛰기, (5) A/B의 피사체 문장 동일성, (6) landmark에만 ACCURACY가 붙고 symbol에는 안 붙는지.

**함정**

- 스크립트가 문장을 '다듬으려' 들면 안 된다. 대문자화, 마침표 보정, 줄바꿈 정규화 전부 금지다. 원장에 있는 그대로 나가야 3개월 뒤에 같은 그림을 다시 뽑을 수 있다.
- 화풍 A의 블록 첫 줄('STYLE LOCK — append this block verbatim…', 'NEGATIVE — append this block verbatim…')은 사람에게 주는 메모다. 기본값은 그대로 포함이고, PILOT.md:60이 말한 대로 도구가 이 문장에 혼란스러워할 때만 --drop-block-headers로 8장 전부에서 똑같이 뺀다. 스크립트가 알아서 빼면 비교가 깨진다.
- templateVersion을 올릴 때(FQ-IMG-v2) v1로 뽑은 그림과 섞지 마라(IMAGE-PROMPTS.md:786). 스크립트는 프롬프트 파일에 버전을 안 쓰므로, 버전을 올리면 원장의 해당 항목 status를 전부 되돌리는 별도 명령이 필요하다.
- prompts/ 342개 × 약 3KB ≈ 1MB가 저장소에 들어간다. 이것은 의도한 비용이다(flags/ 1.9MB와 같은 성격). 줄이려고 공통 블록을 파일에서 빼면 '실제로 보낸 전문을 남긴다'는 원장 원칙(IMAGE-PROMPTS.md:284)이 깨진다.

### `T6-board` 프롬프트 보드와 README (docs/image-prompts/index.html, README.md)

**왜** — docs/mlx-audio/index.html이 한 일을 그대로 옮긴다 — 사람이 342개 텍스트 파일을 탐색기에서 찾는 대신 한 화면에서 나라를 고르고 전문을 복사한다. 수백 번 반복하는 동작이라 여기서 생기는 마찰이 전체 일정을 좌우한다.

**독립 배포** — 가능 · 선행: `T5-build-prompts`

**고칠 곳**

- 신규 docs/image-prompts/index.html — 정적 HTML 1파일, 의존성 0, 외부 요청 0. presets.json을 fetch하지 말고 빌드 시점에 데이터를 인라인으로 박는다(file:// 로 열어도 동작해야 한다. docs/mlx-audio/index.html이 37KB 단일 파일인 것과 같은 이유).
- 화면: 대륙·축(symbol/landmark)·상태 필터, 검색(코드·한국어), 항목을 고르면 조립된 전문이 보이고 '복사' 버튼 하나. 항목마다 koRaw·riskNote·confusionGroups·grade를 함께 보여 준다(사람이 생성 직전에 위험을 다시 읽게 한다).
- scripts/build-image-prompts.mjs에 --board 플래그를 붙여 index.html도 함께 갱신한다. 손으로 고치지 않는다.
- 신규 docs/image-prompts/README.md — docs/mlx-audio/README.md와 같은 톤·같은 순서: 무엇을 만들었나 → 도구와 공통 설정표 → 생성하고 보관하는 순서 → 검수 → 진행 표. 첫머리에 진행 현황 한 줄(예: '342개 중 N개 생성·검수 완료')을 둔다.

**완료 판정**

- [ ] file:///…/docs/image-prompts/index.html 을 브라우저에서 직접 열었을 때 네트워크 요청 0건으로 342항목이 모두 보인다.
- [ ] 복사 버튼이 조립한 전문과 prompts/<code>-<kind>.txt 의 내용이 바이트 단위로 같다.
- [ ] README.md의 진행 표가 scripts/image-ledger.mjs report --status 의 출력과 일치한다(사람이 손으로 세지 않는다).
- [ ] index.html이 342항목 전체를 담고도 단일 파일 2MB 이하다.

**테스트**

- tests/image-board.test.mjs — index.html에 외부 리소스 참조(http://, https://, src=, @import)가 없는지, 342개 항목 id가 모두 들어 있는지.

**함정**

- 보드에 '생성' 버튼을 만들지 마라. 이 저장소는 이미지 도구 API를 호출하지 않는다. 사람이 복사해서 붙여넣는다.
- index.html은 docs/ 아래라 scripts/build-site.mjs:56의 복사 대상이 아니다. 앱에 노출되지 않는다 — 그대로 두는 것이 맞다.

### `T10-convert` PNG → WebP 변환 (scripts/prepare-images.mjs, sips/ffmpeg/ImageMagick 실명령)

**왜** — package.json에 의존성이 0개이며 scripts/build-site.mjs는 변환을 전혀 하지 않는다. 2026-09-15 맥 실측으로 /usr/bin/sips(sips-316)와 /opt/homebrew/bin/cwebp(1.6.0)를 확인했다. sips는 WebP 읽기만 가능하고 ffmpeg·magick·convert는 PATH에 없다. 즉 변환은 맥에서 커밋 전에 끝나야 하고, 저장소에는 '어떤 도구로 어떤 숫자로 변환하는가'가 명령줄 단위로 적혀 있어야 3개월 뒤 같은 결과가 나온다.

**독립 배포** — 가능 · 선행: `T2-ledger-seed`

**고칠 곳**

- 신규 scripts/prepare-images.mjs. 의존성 0. 인자: --tool sips|ffmpeg|magick|cwebp, --style a|b(기본값은 presets.json.styleChoice), --dry-run(명령만 출력), --in docs/artifacts/images/raw, --only <code>-<kind>.
- 규격은 화풍에 따라 갈린다. IMAGE-PROMPTS.md 안에서 두 숫자가 충돌하므로(A-기술 사양 :258-262는 배포 768×576·20~40KB·60KB 초과는 스타일 이탈, 6단계 :812-816과 체크리스트 E-1 :843은 긴 변 1024·약 110KB·150KB 이하) 스크립트가 화풍으로 분기해 고정한다. 화풍 A → 768×576, q80, 경고 40KB, 실패 60KB. 화풍 B → 1024×768, q80, 경고 110KB, 실패 150KB. 이 표를 docs/image-prompts/README.md에도 적는다.
- 치수 계산은 스크립트가 한다. PNG의 IHDR에서 폭·높이를 읽는다(바이트 16~23, 빅엔디언 32비트 2개) — 의존성 없이 가능하다. 그 값으로 크롭/패딩 픽셀 수를 계산해 정수로 박은 명령을 만든다. 도구의 비율 문법(magick -crop 4:3 등)에 의존하지 않는다.
- 3:2로 뽑힌 경우: 중앙 크롭. 예) 1536×1024 → crop 1365×1024(가로만 자른다, 좌우 12% 여백이 이걸 위한 장치다).
- 1:1로 뽑힌 경우: 크롭이 아니라 좌우 여백 덧대기. 1024×1024 → 1365×1024 패딩. 패딩 색은 화풍 A는 #FFFFFF, B는 #F1F5FB. 피사체를 절대 자르지 않는다(IMAGE-PROMPTS.md:259).
- ffmpeg(설치된 환경에서 선택 가능한 경로 — 현재 맥에는 없음): ffmpeg -y -i in.png -vf "crop=1365:1024,scale=768:576:flags=lanczos" -c:v libwebp -quality 80 -compression_level 6 -preset picture -an -frames:v 1 images/symbols/kr.webp  /  패딩판: -vf "pad=1365:1024:171:0:0xFFFFFF,scale=768:576:flags=lanczos"  /  존재 확인: ffmpeg -hide_banner -encoders | grep libwebp
- ImageMagick 7(설치된 환경에서 선택 가능한 경로 — 현재 맥에는 없음): magick in.png -gravity center -crop 1365x1024+0+0 +repage -resize 768x576 -strip -define webp:method=6 -quality 80 images/symbols/kr.webp  /  패딩판: magick in.png -background '#FFFFFF' -gravity center -extent 1365x1024 -resize 768x576 -strip -define webp:method=6 -quality 80 images/symbols/kr.webp  /  IM6이면 magick 대신 convert. 존재 확인: magick -version
- sips(맥 기본): `sips --formats | grep -i webp`에서 WebP 행이 보이는 것만으로 쓰기 지원을 판단하지 마라. Writable 표시를 확인한다. 현재 맥 출력은 `org.webmproject.webp         webp  `이고 Writable 표시가 없어 읽기 전용이다. 크롭·축소까지만 sips로 하고 인코딩은 cwebp로 넘긴다. 아래 WebP 직접 출력은 Writable이 확인된 다른 환경에서만 쓸 예시다: sips -c 1024 1365 in.png --out /tmp/c.png (sips -c 는 '높이 너비' 순서다) → sips -Z 768 /tmp/c.png --out /tmp/z.png → sips -s format webp -s formatOptions 80 /tmp/z.png --out images/symbols/kr.webp  /  패딩판: sips -p 1024 1365 --padColor FFFFFF in.png --out /tmp/c.png
- cwebp(현재 맥에 1.6.0 설치됨; 없는 환경은 brew install webp): 크롭·축소는 sips나 ffmpeg로 끝낸 뒤 cwebp -q 80 -m 6 -metadata none /tmp/z.png -o images/symbols/kr.webp  /  cwebp 단독으로도 가능: cwebp -q 80 -m 6 -crop 85 0 1365 1024 -resize 768 576 -metadata none in.png -o images/symbols/kr.webp (cwebp의 -crop 은 x y w h 순서이고 -resize 보다 먼저 적용된다)
- 출력 경로: images/symbols/<code>.webp, images/places/<code>.webp (저장소 루트의 images/ 아래; flags/와 분리). 원본 PNG는 docs/artifacts/images/raw/<code>-<kind>-<두자리 시도번호>.png 에 남기고 절대 덮어쓰지 않는다(docs/mlx-audio/README.md의 'WAV 원본을 MP3로 덮어쓰지 않는다'와 같은 규칙).
- --dry-run은 명령줄 전체를 그대로 출력해 맥에서 복사·실행할 수 있게 한다. 도구가 없는 환경에서는 exec를 시도하지 않고 '도구 없음'을 명확히 알린 뒤 종료 코드 2로 끝낸다.

**완료 판정**

- [ ] node scripts/prepare-images.mjs --dry-run --tool ffmpeg 가 342건에 대해 실행 가능한 명령줄을 출력하고, 각 명령의 크롭·패딩 픽셀 수가 원본 PNG의 실제 치수로부터 계산된 정수다(비율 문법 사용 0회).
- [ ] 맥에서 --tool 중 하나로 실행했을 때 생성된 .webp의 치수가 화풍 A는 768×576, B는 1024×768이고 오차 0픽셀이다.
- [ ] 장당 용량이 화풍 A 60KB / B 150KB를 넘는 파일이 0개다. 경고선(A 40KB, B 110KB)을 넘는 파일 목록은 출력되지만 실패는 아니다.
- [ ] 원본 PNG가 단 한 개도 변경·삭제되지 않았다(변환 전후 raw/ 의 파일 해시 동일).
- [ ] 1:1 원본에 대해 크롭이 아니라 패딩 경로가 선택되고, 패딩 색이 화풍에 맞다(A #FFFFFF, B #F1F5FB).
- [ ] 도구가 하나도 없는 환경에서 실행하면 '설치된 변환 도구가 없습니다'와 설치 방법을 출력하고 종료 코드 2로 끝난다. 절대 빈 파일을 만들지 않는다.

**테스트**

- tests/image-convert.test.mjs — (1) PNG IHDR 파서가 알려진 치수의 파일에서 정확한 값을 읽는지(flags/에는 PNG가 없으므로 테스트용 최소 PNG를 코드로 생성해 쓴다), (2) 3:2/1:1/4:3 세 입력에 대해 크롭·패딩 픽셀 계산이 기대값과 일치하는지, (3) 화풍별 목표 규격 분기, (4) --dry-run이 파일을 하나도 쓰지 않는지.
- 이 테스트들은 외부 도구 없이 전부 돌아야 한다. 도구가 필요한 경로는 테스트하지 않고 명령 문자열 생성만 테스트한다.

**함정**

- sips의 -c 와 -p 는 '높이 너비' 순서다. ffmpeg·magick·cwebp는 '너비 높이'다. 순서를 섞으면 세로로 찌그러진 342장이 나오고, 썸네일에서는 알아채기 어렵다.
- -strip / -metadata none 은 메타데이터를 지운다. 용량과 재현성에는 좋지만, 생성 도구의 출처 표시 의무(C2PA 등)가 있다면 메타에서 지우는 대신 원장·README에 적어야 한다. DECISIONS.md의 '아직 열려 있는 것'에 '생성 도구 약관의 재배포 권리와 출처 표시 의무'가 미결로 남아 있다 — 확인 전까지 원본 PNG의 메타데이터는 raw/ 쪽에 보존한다.
- WebP를 만들고 나서 원본을 지우지 마라. 화풍을 바꾸거나 규격을 바꾸면 원본에서 다시 뽑아야 하고, raw/ 는 어차피 커밋되지 않아 저장소를 불리지 않는다.
- q80을 임의로 올리지 마라. 60KB/150KB 상한은 스타일 이탈 계측기이기도 하다 — 품질을 올려 상한을 맞추는 게 아니라, 상한을 넘으면 그림에 그라데이션·노이즈가 섞인 것이다(IMAGE-PROMPTS.md:283).
- images/symbols/ 와 images/places/ 를 flags/ 아래에 만들면 tests/run.mjs:114-124의 '목록에 없는 파일이 있으면 실패' 검사에 즉시 걸린다. 반드시 저장소 루트의 images/ 아래에 둔다.

### `T11-verify` 기계 검수 (scripts/check-images.mjs) — 사람이 볼 것과 기계가 거를 것을 가른다

**왜** — 검수 체크리스트 18항목(IMAGE-PROMPTS.md:824-848) 중 절반은 눈이 필요 없고, 절반은 눈이 아니면 판정이 불가능하다. 섞어 두면 사람이 342장에서 파일 크기를 세고 있게 된다. 기계가 거를 것: E-1(치수·포맷·용량), E-2(파일명·고아 파일), E-3(원장 대조), A-5의 일부(여백은 픽셀로 잴 수 있다), A-4의 일부(배경 단색 여부는 모서리 픽셀 샘플로 잴 수 있다). 사람이 볼 것: A-1 글자, A-2 국기, A-3 사람, B-1 앵커 비교, C-1~C-4 사실·저작권, D-1 아이 인지.

**독립 배포** — 가능 · 선행: `T2-ledger-seed`

**고칠 곳**

- 신규 scripts/check-images.mjs. 의존성 0. WebP 헤더를 직접 읽는다: 바이트 0-3 'RIFF', 8-11 'WEBP', 12-15 청크 타입. 'VP8 '(lossy)면 폭=offset 26의 16비트 LE & 0x3FFF, 높이=offset 28. 'VP8X'면 오프셋 24부터 3바이트씩 (canvasWidth-1, canvasHeight-1). 'VP8L'이면 offset 21부터 비트필드에서 14비트씩.
- 검사 항목 — (1) images/symbols/·images/places/ 의 모든 파일이 .webp이고 RIFF/WEBP 시그니처가 맞는가, (2) 치수가 화풍별 목표와 정확히 일치하는가, (3) 용량이 상한 이하인가(경고선 별도 집계), (4) 파일명 code가 data/countries.js의 code에 있는가, (5) 고아 파일 0개 — 원장에 status:'approved-image'가 아닌데 파일이 있으면 실패, (6) 원장에 approved-image인데 파일이 없으면 실패, (7) prompts/<code>-<kind>.txt 가 존재하고 비어 있지 않은가, (8) presets.json의 bytes가 실제 파일 크기와 일치하는가.
- 여백 검사(선택, 화풍 A에 유효): WebP는 디코딩 없이 픽셀을 못 읽으므로, 이 검사는 raw PNG(무압축/필터 해제가 필요해 zlib inflate가 필요)에서 한다. node:zlib이 표준 모듈이라 의존성 0을 지킬 수 있다. 좌우 12% 세로 띠의 픽셀이 전부 배경색(A #FFFFFF, B #F1F5FB) ±2면 통과. 구현 비용이 크면 이 항목만 사람 검수로 넘기고 코드에 사유를 주석으로 남긴다.
- 신규 docs/image-prompts/CHECK.md — 사람이 볼 항목만 추린 인쇄용 체크리스트. IMAGE-PROMPTS.md:824-848에서 A-1/A-2/A-3/B-1/B-2/B-3/C-1/C-2/C-3/C-4/D-1/D-2/D-3만 옮기고, 기계가 보는 항목은 '스크립트가 봄'이라고만 적는다.
- tests/run.mjs 연동은 조건부로 만든다. tests/run.mjs:114-124의 국기 검사를 복제하되, '194개 다 있을 것'이 아니라 '원장에 approved-image인 나라만 파일이 있을 것'으로 바꾼다(IMAGE-PROMPTS.md:820). 342장이 다 모이기 전에는 개수 검사를 켜지 않는다.

**완료 판정**

- [ ] node scripts/check-images.mjs 가 파일이 0개인 현재 상태에서 종료 코드 0으로 통과한다(빈 상태가 실패가 되면 안 된다).
- [ ] 일부러 flags/ 에 kr.webp를 넣으면 tests/run.mjs가 즉시 실패한다(기존 검사가 살아 있음을 확인).
- [ ] images/symbols/ 에 원장에 없는 zz.webp를 넣으면 check-images가 '고아 파일' 오류와 파일명을 출력하고 종료 코드 1로 끝난다.
- [ ] 치수가 800×600인 webp를 넣으면(화풍 A 기준) '치수 불일치 768×576 기대' 오류를 낸다.
- [ ] WebP 헤더 파서가 VP8/VP8L/VP8X 세 형식 모두에서 정확한 치수를 반환한다.
- [ ] docs/image-prompts/CHECK.md가 사람이 볼 항목만 담고 있고, 기계 항목이 하나도 중복되지 않는다.

**테스트**

- tests/image-check.test.mjs — 세 가지 WebP 변종의 최소 바이트열을 코드로 만들어 헤더 파서를 검증, 고아/누락/치수/용량 네 가지 실패 경로를 각각 1건씩.
- tests/run.mjs 에는 새 그룹을 추가하되, 원장에 approved-image가 0건이면 그룹 전체를 건너뛰도록 한다.

**함정**

- WebP 치수를 얻겠다고 npm 패키지를 추가하는 것이 가장 흔한 실패다. package.json에 의존성 0개가 이 저장소의 규약이다.
- tests/run.mjs에 '342장 다 있어야 함'을 지금 넣으면 몇 주 동안 main이 빨간불이고, npm run build(package.json:7)가 voice:check를 거쳐 배포 게이트에 물려 있어 배포 전체가 멈춘다.
- 기계 검수가 통과했다고 그림이 괜찮은 것이 아니다. 글자·국기·사람은 기계가 못 본다 — CHECK.md의 사람 항목을 건너뛰면 검수를 안 한 것이다.
- D-1(아이 인지)에서 실패하면 재생성이 아니라 주제 교체다. 원장의 subjectEn을 고치고 status를 draft로 되돌린다(IMAGE-PROMPTS.md:794). 스크립트가 이 전이를 지원해야 한다.

### `T12-contactsheet` 컨택트시트 생성 (scripts/image-ledger.mjs contact → docs/image-prompts/contact/<batch>.html)

**왜** — IMAGE-PROMPTS.md:282이 실측으로 말한다 — 한 장씩 보면 전부 괜찮아 보이고, 40장씩 깔아 놓아야 채도가 반 단계 높은 장, 그림자 방향이 뒤집힌 장, 배경이 다른 장이 즉시 드러난다. 이 방법이면 342장 검수가 30~40분에 끝난다. 개별 검수로는 몇 시간이 걸리고 그래도 못 잡는다.

**독립 배포** — 가능 · 선행: `T2-ledger-seed`

**고칠 곳**

- scripts/image-ledger.mjs 에 contact 서브커맨드. 40장 단위로 정적 HTML을 만든다. 출력: docs/image-prompts/contact/<n>.html.
- 레이아웃: 그리드 8열 × 5행, 각 칸은 aspect-ratio 4/3(css/style.css:311·391·434·478·988·1027이 전부 4/3이다 — 검수 화면도 같은 비율이어야 실제 화면과 같은 판정이 나온다). 칸 아래에 code와 kind만 작게.
- 맨 위 첫 칸에 anchor/ 의 앵커 그림을 항상 고정으로 넣는다. 40장을 앵커와 같은 화면에서 본다.
- 배경 토글 2개: 밝은 배경(--card #ffffff)과 어두운 배경(css/style.css:27-46의 --card #1e2439). 체크리스트 D-2(다크모드에서 흰 네모로 도드라지는가)를 이 화면에서 바로 판정한다.
- 국기 나란히 보기 토글: 각 칸 옆에 flags/<code>.svg 를 같은 크기로 띄운다. 체크리스트 D-3을 여기서 판정한다.
- 외부 요청 0건. 이미지는 상대 경로(../../../images/symbols/kr.webp)로 참조한다 — file:// 로 열어도 보인다.

**완료 판정**

- [ ] node scripts/image-ledger.mjs contact 가 approved-image 항목 수에 맞춰 ceil(N/40)개의 HTML을 만든다.
- [ ] file:// 로 열었을 때 40장 + 앵커 1장이 모두 보이고 외부 네트워크 요청이 0건이다.
- [ ] 다크 토글을 눌렀을 때 배경이 #1e2439로 바뀌고 그림 카드가 국기와 같은 처리(css/style.css:307-317의 background/border/radius)를 받는다.
- [ ] 국기 토글에서 flags/<code>.svg 와 그림이 같은 4:3 칸에 나란히 보인다.
- [ ] 그림이 아직 없는 항목은 빈 칸에 code만 회색으로 표시하고 깨진 이미지 아이콘을 내지 않는다.

**테스트**

- tests/image-board.test.mjs 에 컨택트시트 검사 2건 — 외부 리소스 참조 0건, 칸 수가 40 이하.

**함정**

- 컨택트시트를 앱에 넣지 마라. docs/ 아래라 build-site.mjs:56의 복사 대상 밖이고, 그래야 한다.
- 칸 비율을 정사각으로 만들면 실제 화면과 다른 판정이 나온다. 앱은 전부 4:3이다.
- 이미지를 base64로 인라인하지 마라. 40장 × 110KB면 HTML이 수 MB가 되고, 상대 경로면 0KB다.

### `T3-subject-en` 영어 피사체 문장 342건 작성 — 스크립트가 아니라 사람(또는 별도 번역 세션)이 하는 일

**왜** — 이 명세에서 가장 중요한 경계다. CSV의 상징물·명소 칸은 한국어이고, 그 안에 4세 구별 지침이 섞여 있다(예: ve '트루피알 — 주황 몸에 검은 머리, 눈가에 파란 테', af '붉은 절벽 사이, 하얀 석회 둑이 계단처럼 층져 짙푸른 물이 담긴 밴드아미르 호수'). 이것은 번역이 아니라 재작성이다 — 도구가 실루엣을 틀리지 않도록 개수·재료색·부속물을 영어로 명시해야 하고(IMAGE-PROMPTS.md:317-320), 스타일 형용사는 한 단어도 들어가면 안 되며(:278), 저작권·종교·무기 회피 판단이 문장 단위로 걸린다. 기계 번역은 이 세 가지를 동시에 못 한다. 그래서 조립 스크립트는 번역을 절대 하지 않고, subjectEn이 null인 항목은 조립 자체를 거부한다.

**독립 배포** — 불가 · 선행: `T2-ledger-seed`

**고칠 곳**

- 작업 대상: docs/image-prompts/presets.json 의 items[].subjectEn (342칸) 과 items[].koApprove.
- 작업 단위: 20건 배치. 배치마다 scripts/image-ledger.mjs report --todo 20 가 다음 20건을 표로 뽑아 준다(code, kind, koRaw, riskNote, confusionGroups, grade, category, factReuse). 이 표 그대로를 번역 세션에 넣는다.
- 문장 규격 — symbol: 'A single <대상>, <구별되는 특징 한 가지>.' 형태를 기본으로 하되 18~35 단어(IMAGE-PROMPTS.md:299). landmark: 실루엣을 결정짓는 요소 3가지 이상을 반드시 포함(:319). 예시 원본은 IMAGE-PROMPTS.md:386-399(kr), :405-417(jp)를 그대로 따른다.
- 금지: majestic, beautiful, detailed, intricate, iconic, stunning, cinematic, vibrant, whimsical, charming 등 스타일 형용사(IMAGE-PROMPTS.md:278). 금지: flag, banner, sign, text, letters, written, inscription. 금지: 사람·얼굴·군중·실존 인물.
- 필수: CSV 명소 칸의 '—' 뒤 구별 지침을 반드시 영어 문장 안으로 옮긴다. 혼동군(confusion-groups.json)에 속한 항목은 그 군에서 자기만 갖는 특징을 문장의 앞쪽에 둔다.
- 개수가 사실인 항목은 숫자를 영어 단어로 못박는다(exactly four sails, three arched openings, three pyramids). PILOT.md:27이 이 규칙의 실효성 자체를 파일럿에서 검증한다.
- 판단이 필요한 항목은 override/substitutedFrom/keepsBackdrop을 함께 채운다: 종교 건축 외관 7건(D10), 저작권 교체(IMAGE-PROMPTS.md:341-342), 배경이 주제의 일부인 항목(checklist A-4 예외, 예: 마추픽추 뒷산).
- 아빠 승인은 settings.csv의 koApprove 열만 읽고 한다(194행 20분). status가 approved-text가 아닌 항목은 생성하지 않는다(IMAGE-PROMPTS.md:748).

**완료 판정**

- [ ] 342칸 중 subjectEn이 null인 항목이 0개다. 단, csvStatus==='draft'인 31행에서 나온 항목은 아빠 승인을 먼저 받아 csvStatus를 final로 올린 뒤에 채운다 — 승인 전에 채우면 안 된다.
- [ ] T4의 lint가 342건 전부에서 통과한다(경고 0, 오류 0).
- [ ] 동일 문장이 두 항목에 중복되지 않는다. 특히 같은 나라의 symbol과 landmark가 같은 대상이 된 항목(eg 피라미드, jp 후지산 계열)은 원장에 sharedSubject:true로 표시하거나 한쪽을 비운다 — 억지로 두 장을 채우지 않는다(IMAGE-PROMPTS.md:8절 마지막에서 두 번째 항목).
- [ ] koApprove 342칸이 전부 2~12자로 채워져 있고, 아빠가 읽었을 때 그림 한 장이 떠오른다.
- [ ] 각 배치 20건이 끝날 때마다 settings.csv의 status가 draft→approved-text로 갱신되고 커밋된다. 한 번에 342건을 몰아서 하지 않는다 — 중간에 기준이 흔들리면 앞 배치를 다시 봐야 한다.

**테스트**

- 기계 테스트는 T4의 lint가 전부다. 이 과제 자체는 사람 판단이라 단위 테스트를 만들지 않는다.
- 다만 tests/image-ledger.test.mjs에 '조립 시점에 subjectEn이 null인 항목이 있으면 빌드가 실패한다'는 계약을 1개 추가한다.

**함정**

- 코딩 에이전트가 이 과제를 '스크립트로 자동화'하려 드는 것이 가장 큰 위험이다. 자동 번역은 구별 지침을 잃고, 스타일 형용사를 섞고, 저작권 교체 판단을 통째로 빼먹는다. 이 과제는 스크립트를 만드는 과제가 아니다.
- 한국어 문장을 원장에 '두 벌'로 유지하려는 유혹. IMAGE-PROMPTS.md:8절이 명시적으로 경고한다 — 영어만 원본이고 한국어는 승인용 요약이다. 나중에 영어만 고치고 한국어를 안 고치는 어긋남이 생긴다.
- PILOT.md:15와 SUBJECTS.csv:80의 nl 항목이 실제로 어긋나 있다. PILOT은 '풍차 한 채 — 날개 정확히 네 장', CSV는 '킨더다이크 강둑에 줄지어 선 풍차'다. 공통 블록의 'one single subject'가 이긴다 — subjectEn은 풍차 한 채로 쓰고, CSV 쪽 표현은 채택하지 않는다. 같은 유형('줄지어', '여러 개')이 다른 행에도 있는지 전수로 훑는다.
- 무기 6개국(om·sa·ao·ke·bb·mz, D5)과 술·담배 6개국(fr·ge·md·cz·ie·cu)은 CSV에서 이미 대체되어 있다. 영어 문장을 쓰면서 '원래 유명한 것'으로 되돌리지 마라. ae 행의 위험 메모가 '부르즈 할리파는 … 되살리지 말 것'이라고 명시한 것이 그 예다.
- riskNote가 비어 있는 행은 194행 중 6행뿐이다. 나머지 188행은 전부 읽어야 할 경고가 있다.

### `T7-pilot` 파일럿 16장 실행과 화풍 확정 (사람 작업, 원장에 결과를 기록)

**왜** — D4가 '194개국 전량 완성 후 한 번에 공개'라서 화풍이 틀리면 재작업 범위가 342장 전부다. PILOT.md:6이 '이 16장이 그 위험을 막는 유일한 장치'라고 적었다. 본 생성 한 장을 뽑기 전에 반드시 끝낸다.

**독립 배포** — 불가 · 선행: `T5-build-prompts`

**고칠 곳**

- 프롬프트 준비: node scripts/build-image-prompts.mjs --style a --codes ve,nl,kr,cn,be,jp,bf --out docs/artifacts/images/pilot/prompts-a 와 --style b … prompts-b. 8장의 축은 PILOT.md:14-21 표를 따른다 — ve:landmark, nl:landmark, kr:landmark, cn:symbol, cn:landmark, be:symbol, jp:landmark, bf:symbol.
- 생성 순서(PILOT.md:76-79): (1) A의 jp 1장, B의 jp 1장만 먼저 뽑아 도구 능력 6가지를 확인한다. (2) 통과하면 A 8장을 한 화풍씩 몰아서, 대화창을 새로 열고 B 8장. 섞어 뽑으면 문맥 오염으로 두 화풍이 서로 닮는다. (3) 재생성은 프롬프트를 고치지 말고 그대로 다시, 소재당 최대 2회.
- 도구 능력 확인 결과를 presets.json의 새 키 toolCapabilities에 기록한다: {aspect43:true|false, referenceImage:bool, seedLock:bool, batch:bool, contextBleed:bool, rejections:[걸린 단어…]}. IMAGE-PROMPTS.md:851이 '(c) 4:3 출력만은 결과물 구조를 바꾼다'고 했으므로, aspect43:false면 T10의 변환이 '크롭'이 아니라 '여백 덧대기' 경로로 바뀐다.
- 저장 위치: docs/artifacts/images/pilot/<style>/<kind>s/<code>.png (.gitignore:11 아래, 커밋 안 됨).
- 판정: PILOT.md:89-97의 8항목 채점표(화풍당 만점 64점) → 결과를 docs/image-prompts/README.md의 표로 남기고, presets.json의 styleChoice를 'a' 또는 'b'로 확정한다. 이후 --style 인자는 이 값과 다르면 거부된다(T5).

**완료 판정**

- [ ] A 8장·B 8장 총 16장이 실제로 존재하고 파일명이 규약대로다.
- [ ] presets.json.styleChoice가 'a' 또는 'b'로 채워지고 커밋되어 있다. null인 상태로 본 생성에 들어가지 않는다.
- [ ] toolCapabilities 5개 항목이 전부 true/false로 채워져 있다(모름 없음).
- [ ] docs/image-prompts/README.md에 8항목 × 2화풍 채점표와 결론 한 줄, 그리고 민규 반응 3가지(PILOT.md:99-103)가 기록되어 있다.
- [ ] 화풍 A로 뽑은 첫 장을 WebP q80으로 변환했을 때 40KB 이하인지 실측치가 기록되어 있다(PILOT.md:65). 60KB를 넘으면 그 장은 스타일 이탈로 본다.
- [ ] bf와 ve가 안전 필터에 거부되지 않았는지, 거부됐다면 어떤 단어가 걸렸는지 기록되어 있다.

**테스트**

- 기계 테스트 없음(사람 판정). 다만 tests/image-ledger.test.mjs에 '본 생성 단계의 스크립트는 styleChoice가 null이면 실패한다'는 계약을 1개 넣는다.

**함정**

- 16장을 한 번에 뽑지 마라. jp 2장으로 도구 능력을 먼저 확인하지 않으면 나머지 14장은 뽑아도 정보가 없다(PILOT.md:77).
- 화풍 비교에 비대칭이 하나 있다 — B의 명소 템플릿에는 ACCURACY 한 줄이 원래부터 있고 A에는 대응 문장이 없다(PILOT.md:73). 명소 5장에서 A가 형태를 더 틀리면 '화풍이 나빠서'가 아니라 '블록에 정확도 지시가 없어서'일 수 있다. 판정할 때 감안한다.
- 여기서 화풍을 고친 뒤에는 반드시 앵커(T8)부터 다시 만든다. 100장을 뽑은 뒤 화풍을 바꾸면 100장을 다시 뽑는다(IMAGE-PROMPTS.md:764).

### `T8-anchor` 앵커 1장 확정 (docs/image-prompts/anchor/<style>-kr-landmark.png)

**왜** — 시드도 레퍼런스도 못 쓴다고 가정하는 설계에서, 드리프트를 재는 유일한 계측기가 '기준이 되는 한 장'이다(IMAGE-PROMPTS.md:755-760). 회차마다 첫 장을 이 한 장과 비교해 대화창을 버릴지 판정한다.

**독립 배포** — 불가 · 선행: `T7-pilot`

**고칠 곳**

- kr-landmark(광화문) 프롬프트를 5~8번 새로 뽑는다. 같은 대화에서 '다시'가 아니라, 매번 프롬프트 전문을 새 대화에 붙여넣는다.
- 선 굵기·채도·광원 방향·배경색이 가장 기준에 맞는 1장을 고른다. 글자(현판)가 한 글자라도 있는 장은 후보에서 제외한다 — 앵커가 규칙을 어기면 그 뒤 342장이 전부 어긴다.
- docs/image-prompts/anchor/<style>-kr-landmark.png 로 저장하고 커밋한다. 앱에는 들어가지 않는다(docs/ 는 build-site.mjs:56 복사 대상 밖).
- PNG 원본 그대로 커밋한다. 이 한 장만 예외적으로 .gitignore 밖에 둔다 — 검수 기준이라 저장소에 있어야 한다. 1MB 안쪽이면 그대로, 넘으면 긴 변 1024로만 줄인다.
- presets.json에 anchor:{file, style, generatedAt, tries} 를 기록한다.

**완료 판정**

- [ ] docs/image-prompts/anchor/ 에 정확히 1개의 PNG가 있고 파일명이 styleChoice와 일치한다.
- [ ] 그 장이 검수 체크리스트 A-1~A-5(글자·국기·사람·배경·여백)를 전부 통과한다.
- [ ] presets.json.anchor.tries에 실제 시도 횟수가 기록되어 있다.
- [ ] T7에서 화풍을 바꿨다면 이전 앵커 파일이 삭제되고 새로 만들어졌다(두 화풍의 앵커가 동시에 남아 있으면 안 된다).

**테스트**

- tests/image-ledger.test.mjs — anchor 파일이 실제로 존재하고 presets.json.anchor.file과 경로가 일치하는지 1건. 단 이 테스트는 styleChoice가 null이면 건너뛴다.

**함정**

- 앵커를 여러 장 두면 기준이 사라진다. 딱 1장이다. IMAGE-PROMPTS.md:280은 A 화풍에서 '앵커 3장(건축·동물·음식)으로 styleBlock을 되먹인다'고도 말하는데, 이때도 회차 비교용 계측기는 kr 1장이고 나머지 2장은 스타일 블록 보강용이다. 두 용도를 섞지 마라.
- 앵커를 뽑고 스타일 블록에 문장을 추가했다면(A 화풍의 되먹임), templateVersion을 FQ-IMG-v2로 올리고 앵커를 다시 뽑는다. 블록을 고친 뒤 옛 앵커와 비교하면 계측기가 거짓말을 한다.

### `T9-batches` 본 생성 회차 운영 규약과 회차 로그 (scripts/image-ledger.mjs record)

**왜** — 342장을 '몇 장씩, 어떤 순서로, 언제 대화창을 새로 여는가'가 일관성의 대부분을 결정한다. 규약을 문서로만 두면 200장쯤에서 흐려지므로, 회차를 원장에 기록해 스크립트가 다음 회차를 지시하게 만든다.

**독립 배포** — 불가 · 선행: `T8-anchor`

**고칠 곳**

- 회차 정의: 1회차 = 1대화창 = 9~11장(앵커 재생성 1장 + 실제 8~10장). IMAGE-PROMPTS.md:768이 12장을 상한으로 못박았다.
- 회차 규칙 4가지(IMAGE-PROMPTS.md:770-786): (1) 매 프롬프트는 전문을 붙여넣는다. '아까 그 스타일로 다음 나라'는 드리프트 1순위 원인. (2) 회차 첫 장은 언제나 앵커 재생성(kr-landmark). anchor/ 의 그림과 나란히 놓고 선 굵기·배경색·채도가 눈에 띄게 다르면 그 대화를 버리고 새 대화에서 다시 시작한다. (3) 12장을 넘기지 않는다. (4) 회차 중간에 프롬프트 문구를 고치지 않는다 — 메모해 두고 회차를 끝낸 뒤 원장에서 고치고 templateVersion을 올린다.
- 생성 순서: 같은 축·같은 카테고리를 묶어 연속으로 뽑는다(IMAGE-PROMPTS.md:281). 권장 순서는 ① symbol 194장을 카테고리 순으로(동물 46 → 식물 43 → 만든것 43 → 먹을거리 29 → 땅과하늘 23 → 입는것 10) ② 그다음 landmark 148장을 등급 순으로(S 25 → A 61 → B 62). 축을 오가며 뽑으면 직전 이미지의 잔상이 섞인다.
- 단, D4가 '전량 완성 후 공개'이므로 대륙 순서로 뽑지 않는다 — 카테고리 순이 스타일 일관성에 유리하고, 어차피 중간 공개가 없다.
- scripts/image-ledger.mjs next --size 10 : 다음 회차에 뽑을 항목 목록(앵커 1 + 항목 N)을 카테고리 묶음을 깨지 않고 출력한다.
- scripts/image-ledger.mjs record --batch 7 --id kr-landmark --tries 2 --status approved-image : 회차·시도·판정을 원장과 settings.csv에 함께 기록한다. 회차 메타(batches[]: {no, style, startedAt, anchorOk:true|false, discarded:bool, items:[…]})를 presets.json에 남긴다.
- 재생성 기준(IMAGE-PROMPTS.md:790-796)을 record가 강제한다: A군 위반 → 재생성 1회 → 실패 시 subjectEn에 금지 한 줄 추가. 앵커 대비 이탈 3회 연속 → 대화 폐기(anchorOk:false로 회차 전체를 discarded 표시). 한 나라에서 5회 실패 → status:'held'로 보류 목록에 넣고 다음으로 넘어간다.

**완료 판정**

- [ ] node scripts/image-ledger.mjs next --size 10 이 항상 '앵커 1건 + 같은 카테고리(또는 같은 등급) 항목 N건'을 반환하고, 이미 approved-image인 항목을 다시 내놓지 않는다.
- [ ] record 실행 후 presets.json과 settings.csv가 동시에 갱신되고, 둘의 status가 어긋나면 lint가 오류를 낸다.
- [ ] 회차가 discarded로 기록되면 그 회차의 항목들이 next의 대기열로 자동 복귀한다.
- [ ] 한 나라가 tries 5에 도달하면 자동으로 status:'held'가 되고, report --status에 보류 목록으로 따로 집계된다.
- [ ] batches[]의 총 항목 수와 approved-image 항목 수가 일치한다(누락·중복 기록 없음).

**테스트**

- tests/image-ledger.test.mjs — (1) next가 회차 크기 상한 12를 넘지 않는지, (2) 카테고리 경계를 넘어 섞지 않는지, (3) discarded 회차의 복귀, (4) tries 5 → held 전이, (5) presets.json ↔ settings.csv status 일치 검사.

**함정**

- '같은 대화에서 계속 뽑으면 일관성이 올라가더라'는 관찰이 나올 수 있다(IMAGE-PROMPTS.md:8절 마지막 부분이 열어 둔 질문). 그렇더라도 12장 상한과 '매번 전문 붙여넣기'는 파일럿에서 실측으로 뒤집기 전까지 규칙이다. 에이전트가 임의로 완화하면 안 된다.
- 회차 중간에 프롬프트를 고치는 것이 가장 잦은 규칙 위반이다. 고치고 싶어지면 그 회차를 끝내고 고친다.
- symbol 194장을 다 뽑은 뒤 landmark로 넘어갈 때 대화창을 반드시 새로 연다. cn처럼 두 축이 모두 있는 나라는 판다와 만리장성이 한 세계로 보여야 하는데(PILOT.md:96), 그건 스타일 블록이 보장하지 판다 대화의 잔상이 보장하는 게 아니다.
- held 항목을 끝까지 붙잡고 있지 마라. 342장 중 몇 장이 보류되는 것이 회차 전체가 무너지는 것보다 낫다.

### `T13-wiring` 앱 배선 — 폴더·MIME·서비스워커·경로 함수 (그림 30장쯤 모였을 때 한 번)

**왜** — 변환까지 끝나도 이 다섯 줄이 없으면 npm test는 초록불인데 아이패드에서는 그림이 안 보인다(체크리스트 E-4). 그리고 서비스워커 쪽은 잘못 건드리면 민규 아이패드의 114MB 음원 캐시가 통째로 날아간다 — 이 명세에서 되돌릴 수 없는 유일한 손상이다.

**독립 배포** — 불가 · 선행: `T10-convert`, `T11-verify`

**고칠 곳**

- scripts/build-site.mjs:56 — for (const folder of ['assets','css','flags','js']) 에 T4에서 추가한 'images'가 있는지 확인한다. 두 하위 폴더를 따로 추가하지 않는다. T4의 .gitkeep을 유지하고 폴더 존재를 확인하여 그림 0장에서도 빌드한다.
- scripts/serve.mjs:16-29 TYPES 에 '.webp': 'image/webp' 한 줄 추가. 없으면 배포본은 멀쩡한데 npm start 로컬에서만 그림이 깨진다.
- js/ui.js:13 flagSrc() 옆에 symbolSrc(code)='images/symbols/'+code+'.webp', landmarkSrc(code)='images/places/'+code+'.webp' 를 추가한다. 코드→경로 매핑 진입점을 한 곳으로 유지한다.
- css/style.css:73 의 touch-action:manipulation 선택자 목록과 :76-79 의 user-select:none 목록에 새 이미지 클래스를 반드시 추가한다. 빠뜨리면 아이패드에서 더블탭 확대·글자 끌림이 새 화면에서만 발생한다(IMAGE-PROMPTS.md:268).
- 새 이미지 클래스는 css/style.css:307-317 .flag-img 의 background:var(--card-2); border:1px solid var(--line); border-radius:12px; aspect-ratio:4/3 패턴을 그대로 복제한다. 다크용 이미지를 따로 만들지 않는다.
- sw.js — SHELL(:6-31)에 넣지 않는다. cache.addAll은 원자적이라 342장 중 한 장만 404여도 서비스워커 설치 전체가 실패한다. sw.js:46-70 warmFlags() 와 같은 방식의 warmImages()를 install이 아니라 activate에서, 20개씩 끊어, 개별 catch로 돌린다.
- sw.js의 기존 /images/ 분기는 두 축 모두 ART_CACHE를 사용한다. 같은 파일명으로 그림을 교체하면 cache-first 적중이 옛 그림을 유지하므로 ART_CACHE만 갱신한다. 국기 라우트와 새 분기를 중복으로 만들지 않는다.
- T2에서 만든 ART_CACHE를 그대로 사용한다. 새 IMG_CACHE를 만들지 않는다. 그림 교체 때 ART_CACHE 이름을 올리고 KEEP도 그 상수를 사용하게 유지한다. 최초 공개 때도 AUDIO_CACHE='flagquiz-v4'와 SHELL_CACHE·FLAG_CACHE는 그림 때문에 올리지 않는다.
- tests/run.mjs:114-124 의 검사를 T11의 조건부 버전으로 복제한다.

**완료 판정**

- [ ] npm test 가 통과한다(그림 0장 상태에서도, 30장 상태에서도).
- [ ] npm start 로컬에서 images/symbols/kr.webp 가 image/webp Content-Type으로 200을 반환한다.
- [ ] node scripts/build-site.mjs 후 _site/images/symbols/ 와 _site/images/places/ 에 파일이 복사되어 있다. 그림 0장에서도 T4의 .gitkeep 두 개로 images/symbols/·images/places/ 폴더가 존재하고 빌드가 성공한다.
- [ ] sw.js의 SHELL 배열에 .webp 경로가 0개다(grep -c 'webp' 로 SHELL 구간 확인).
- [ ] sw.js는 기존 ART_CACHE와 /images/ 분기를 사용하고 AUDIO_CACHE는 'flagquiz-v4' 그대로다. 최초 공개·개별 그림 교체 모두 음원 캐시 이름을 바꾸지 않는다.
- [ ] localStorage 키 'flagquiz.v1'이 저장소 전체에서 그대로다(grep으로 확인). 이 과제는 저장 구조를 건드리지 않는다.
- [ ] 새 이미지 클래스가 css/style.css:73과 :76-79 목록에 들어가 있다.

**테스트**

- tests/run.mjs 에 조건부 이미지 파일 그룹 추가(원장 approved-image 기준).
- tests/*.test.mjs 에 (1) serve.mjs TYPES에 .webp가 있는지, (2) build-site.mjs의 폴더 배열에 images가 있는지, (3) sw.js의 SHELL에 webp 경로가 없는지, (4) sw.js의 AUDIO_CACHE가 'flagquiz-v4'인지(음원 캐시 변경을 테스트로 막는다) — 4건.

**함정**

- AUDIO_CACHE 이름 'flagquiz-v4'를 바꾸거나 KEEP에서 빼면 기존 음원 114MB를 잃는다. 그림 배선·공개·교체에서는 음원 캐시를 절대 바꾸지 않는다.
- SHELL에 342장을 나열하는 것도 같은 종류의 사고다. cache.addAll이 원자적이라 설치 자체가 실패한다.
- localStorage 키와 storage.js의 복원 규칙(객체인 값만 복원)은 이 과제의 범위 밖이지만, 기능 플래그를 여기서 추가하고 싶어질 수 있다. 추가한다면 반드시 객체 안에 넣는다 — 최상위 스칼라는 저장은 되고 절대 읽히지 않는다.
- build-site.mjs:56에 폴더를 추가할 때 존재 확인 없이 넣으면, 그림 0장 상태에서 npm run build가 즉시 깨지고 배포가 멈춘다.
- 그림 없는 나라가 보기로 올라오지 않게 하는 필터(출제 풀·보기 채우기 폴백)는 이 과제가 아니라 퀴즈 쪽 과제다. 다만 그 필터가 읽을 '자료 있는 나라' 목록의 유일한 출처가 원장의 approved-image라는 점은 여기서 못박는다.

### `T7-pin-constraints` 핀 렌더링·애니메이션 제약 명세 문서 (코드 작성 아님)

**왜** — D3 항목 4·7·8이 지목한 세 함정 — 44px 터치 타깃, rAF 정리 코드, 움직임 줄이기에서 정답이 안 보이는 것 — 은 전부 '코드를 쓰기 전에 정해 두지 않으면 나중에 못 고치는' 종류다. 지도 화면 구현은 D2에 따라 2주 뒤 퀴즈 모드 과제에서 하되, 그때 읽을 제약을 지금 문서로 남긴다. 그림도 코드도 필요 없어 단독으로 배포 가능하다.

**독립 배포** — 가능

**고칠 곳**

- 새 파일 /home/user/FlagQuiz/docs/expansion/MAP-RENDER-CONSTRAINTS.md. 각 항목을 '반드시 / 하지 마라' 형태로 쓴다. 코드 예시는 CSS 규칙 수준까지만 적고 js/ 아래 파일은 만들지 않는다.
- **핀은 SVG 안이 아니라 SVG 위에 겹친 HTML 요소다.** 지도는 `<svg viewBox="0 0 2000 1000">` 안의 `<path>` 한 개, 핀은 그 위에 `position:absolute` 로 얹은 `<button type="button">` 들이다. 위치는 `left: calc((lng + 180) / 360 * 100%)`, `top: calc((90 - lat) / 180 * 100%)`, `transform: translate(-50%, -50%)`. SVG 내부 `<circle>` 로 만들면 viewBox 배율에 따라 핀 크기가 같이 변해 화면 폭이 바뀔 때마다 터치 타깃이 달라진다.
- **터치 타깃 44px 고정** (design/SPEC.md:37 '손가락으로 누르는 것은 최소 44px'). 버튼 자체가 `min-width:44px; min-height:44px`, 배경 투명. 눈에 보이는 점은 버튼 안쪽에 가운데 정렬한 16~20px 짜리 별도 요소다. 지도가 1040px이든 390px이든 44px 는 변하지 않는다. **도형을 탭 대상으로 삼지 마라** — 1040px 폭에서 싱가포르 1.1px, 모나코 0.07px, 바티칸 0.016px다(D3 항목 4).
- **한 화면에 띄우는 핀은 최대 5개.** 194개를 동시에 찍으면 유럽에서 44px 타깃이 서로 포개져 어느 것도 정확히 못 누른다. 한 문제에 필요한 것(정답 1 + 오답 N, 또는 한 판에서 만난 5개국)만 렌더링한다. 고를 때 서로의 화면 거리가 44px 미만이면 그 조합을 버리고 다시 뽑는다.
- **핀 요소는 반드시 `#main` 의 자손이다.** `ui.setMain()` 이 `#main.innerHTML` 을 통째로 갈아끼우므로 정리 코드가 0줄로 끝난다(D3 항목 7). js/effects.js:80 의 `.celebrate` 처럼 `document.body` 에 붙이지 마라 — 그것은 js/effects.js:81 에서 스스로 setTimeout 으로 지우기 때문에 성립하는 예외다.
- **requestAnimationFrame·setInterval 금지.** rAF 를 쓰면 js/app.js:62-73 에 정리 훅을 추가하고 그것을 호출하는 9개 지점(108·405·438·563·1135·1199·1400·1405·1413)을 전부 확인해야 하고, 하나라도 빠지면 홈으로 나간 뒤에도 도는 유령 루프가 남는다(D3 항목 7). setTimeout 은 '자기를 지우는 1회성'에만 허용하고, 콜백은 노드가 이미 사라진 경우를 방어해야 한다.
- **@keyframes 금지, CSS transition 만.** css/style.css:531-533 의 `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }` 가 애니메이션과 전환을 **둘 다** 죽인다. keyframes 로 만들면 그 설정에서 핀이 출발 위치(투명·화면 밖)에 멈춰 **정답이 화면에 나타나지 않는다**(D3 항목 8).
- **최종 상태를 기본값으로 쓰는 방향 규칙.** `.map-pin` 의 기본 CSS 가 곧 '정답이 찍힌 모습'이다(제자리, opacity:1, 추가 transform 없음). 등장 연출은 `.map-pin.is-entering` 이라는 **일시적** 클래스로 출발 상태(예: `opacity:0; transform: translate(-50%,-50%) translateY(-24px) scale(.6)`)를 준 뒤 한 프레임 뒤 클래스를 떼는 방식으로만 만든다. 움직임 줄이기에서는 transition 이 죽어 클래스를 떼는 순간 기본 상태로 즉시 스냅한다 = 정답이 바로 보인다. 반대 방향(기본이 숨김, 클래스로 보임)으로 쓰면 그 설정에서 영원히 안 보인다.
- **자바스크립트로 움직임 줄이기를 감지하지 마라.** js/effects.js:7-9 의 `reducedMotion()` 은 색종이를 아예 터뜨리지 않기 위한 것이고, 핀은 그것과 다르게 '빠져서는 안 되는 채점 결과'다. CSS 한 곳에서만 처리하면 분기가 한 군데로 모인다.
- **색은 기존 토큰만 쓴다** — css/style.css:6-25 의 `--primary`·`--success`·`--danger`·`--accent`·`--card`·`--line`. css/style.css:27-45 가 다크 모드를 이미 재정의하므로 새 색을 적으면 다크 모드에서만 깨진다. 육지 fill 과 바다 배경도 두 모드 모두 정의한다.
- **접근성**: 핀 버튼마다 `aria-label` 에 한글 나라 이름. 정답 공개는 `#main` 이 이미 `aria-live="polite"`(index.html:32)이므로 텍스트로 함께 내보낸다 — 핀의 색만으로 알리지 마라.
- **채점 해상도는 렌더링과 분리한다**: DECISIONS.md 의 D3 말미가 '정확한 국가 위치가 아니라 대륙 수준의 인식을 채점하는 편이 안전하다'고 적었고 '아직 열려 있는 것'에도 들어 있다. 제약 문서는 두 경우 모두에서 성립하도록 쓴다 — 핀 좌표는 나라 단위로 갖되, 정답 판정의 허용 반경은 렌더링이 아니라 채점 코드의 상수 하나로 분리해 둔다.

**완료 판정**

- [ ] docs/expansion/MAP-RENDER-CONSTRAINTS.md 가 존재하고 위 11개 제약을 전부 담는다. 각 제약은 (1) 규칙 한 줄, (2) 근거 파일:라인, (3) 어길 경우 생기는 증상 세 줄로 이뤄진다.
- [ ] 문서가 인용한 파일:라인이 실제로 그 내용이다: design/SPEC.md:37(44px), css/style.css:531-533(움직임 줄이기), js/effects.js:7-9 와 :80-81(body 부착 예외), index.html:32(aria-live), css/style.css:6-25·27-45(색 토큰).
- [ ] 문서 어느 곳에도 `@keyframes`·`requestAnimationFrame`·`setInterval` 을 쓰라는 지시가 없다.
- [ ] 문서가 '기본 CSS = 정답 상태, 일시 클래스 = 출발 상태' 방향을 명시하고, 반대 방향이 왜 위험한지를 한 문장으로 적었다.
- [ ] 코드 변경 0줄 — `git diff` 가 docs/ 아래 새 파일 하나만 보여준다. `npm test` 가 그대로 통과한다.
- [ ] docs/expansion/DECISIONS.md 의 D3 절 마지막에 한 줄 링크를 더한다: `항목 4·7·8의 구체 제약은 [MAP-RENDER-CONSTRAINTS.md](MAP-RENDER-CONSTRAINTS.md) 에 있다.` D3 자체의 내용은 고치지 않는다.

**테스트**

- 자동화 테스트 없음(문서 과제). D3 항목 9가 '가짜 DOM에서는 애니메이션 검증이 불가능하니 연출은 실기기 확인으로 남긴다'고 정했다.
- 문서 끝에 '실기기 확인표' 체크리스트를 넣는다: ① 아이패드 설정 → 접근성 → 동작 줄이기 켜고 한 판 → 정답 핀이 즉시 보이는가, ② 가장 작은 나라(바티칸·모나코)가 한 번에 눌리는가, ③ 홈으로 나갔다 다시 들어오기를 10번 반복해도 느려지지 않는가(유령 루프 검사), ④ 다크 모드에서 육지와 핀이 구분되는가.

**함정**

- 'CSS transition 이니까 자동으로 안전하다'가 아니다. transition 이어도 방향이 반대면(기본이 opacity:0) 움직임 줄이기에서 영원히 투명하다. 살아남는 것은 transition 종류가 아니라 **기본 상태가 무엇인가**다.
- '핀을 44px 로 키우면 지도가 핀으로 덮인다'는 걱정으로 타깃을 줄이고 싶어진다. 보이는 점과 탭 영역을 분리하면 둘 다 만족한다. design/SPEC.md:37 은 이 앱의 규칙이지 권고가 아니다.
- 핀을 `document.body` 에 붙이면 홈으로 나간 뒤에도 화면에 남아 떠다닋는다. `#main` 안이면 ui.setMain() 이 공짜로 치워준다.
- 핀 좌표를 CSS 변수나 인라인 style 로 주면서 '어찌피 재계산하니까' 하고 사전 계산 x/y 를 데이터 파일에 다시 넣고 싶어진다. 그것이 D3 항목 1이 금지한 바로 그것이다 — 변환은 렌더링 시점 두 줄로만 한다.

### `T1-fetch-raw` Natural Earth 50m 원본 확보 스크립트 + .gitignore

**왜** — 모든 후속 과제가 같은 입력 파일을 본다는 전제를 먼저 고정한다. '원본은 .gitignore, 결과만 커밋'(D3 항목 2)을 코드가 아니라 .gitignore 로 먼저 강제해 두지 않으면, 다음 과제에서 20MB짜리 원본이 실수로 커밋된다(이 저장소는 .git 이 이미 104MB다).

**독립 배포** — 가능

**고칠 곳**

- 새 파일 /home/user/FlagQuiz/scripts/fetch-map-source.mjs — Node 20 내장 fetch 만 사용, 의존성 0. https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson 를 받아 /home/user/FlagQuiz/data/natural-earth/ne_50m_admin_0_countries.geojson 에 저장한다.
- 셰이프파일(.shp/.zip) 배포본을 받지 마라. 셰이프파일 파서를 의존성 0으로 직접 구현하는 것은 이 과제의 범위가 아니고, GeoJSON 배포본은 JSON.parse 한 줄로 끝난다 — 이것이 '의존성 0 원칙'을 지키는 방법이다.
- scripts/fetch-map-source.mjs 상단에 `const EXPECTED_SHA256 = '…';` 을 두고 받은 바이트의 SHA-256 과 비교한다. 다르면 실제 해시를 출력하고 exit 1. scripts/build-site.mjs:44-51 이 음악 파일에 쓰는 것과 같은 패턴이다. 처음 돌릴 때는 해시를 찍어 스크립트에 박는다.
- /home/user/FlagQuiz/.gitignore 마지막(design/flag-quiz-game-design.html 줄) 뒤에 빈 줄 + `# 지도 원자료 (npm run map:fetch 로 다시 받는다. 결과만 커밋한다)` + `data/natural-earth/` 추가.
- /home/user/FlagQuiz/package.json:7-16 scripts 에 `"map:fetch": "node scripts/fetch-map-source.mjs"` 추가.

**완료 판정**

- [ ] `npm run map:fetch` 를 돌리면 data/natural-earth/ne_50m_admin_0_countries.geojson 이 생기고, JSON.parse 가 성공하며 `.features.length` 가 240 이상이다.
- [ ] 받은 파일의 SHA-256 이 EXPECTED_SHA256 과 같으면 exit 0, 일부러 한 바이트를 고쳐 다시 돌리면 exit 1 과 함께 기대·실제 해시가 둘 다 출력된다.
- [ ] `git status --porcelain` 에 data/natural-earth/ 아래 파일이 **한 개도** 나타나지 않는다.
- [ ] `npm test` 와 `npm run build` 는 data/natural-earth/ 를 통째로 지운 상태에서도 그대로 통과한다(이 과제 이후 모든 과제에서 계속 성립해야 하는 조건).
- [ ] package.json 의 `build`·`test` 스크립트 문자열이 이전과 바이트 단위로 동일하다.

**테스트**

- 별도 자동화 테스트 없음(네트워크가 필요하여 CI에서 돌리면 안 된다). 수동 확인: `rm -rf data/natural-earth && npm test` 가 통과하는지.

**함정**

- .github/workflows/pages.yml 과 test.yml 은 `npm test` / `npm run build` 만 돌린다. map:fetch 를 그 둘 중 어느 하나에라도 엮는 순간 CI가 매 번 외부 네트워크를 타게 되고, 실패하면 main 배포가 통째로 멈춘다.
- natural-earth-vector 저장소의 `master` 브랜치를 가리키지 마라. 반드시 태그(v5.1.2)를 박아 재현성을 확보한다 — 안 그러면 몇 달 뒤 다시 돌렸을 때 194개 좌표가 무성으로 바뀜다.
- data/ 폴더는 build-site.mjs:56 의 폴더 통째 복사 대상이 아니라 원본이 배포에 섮일 위험은 없다. 그래도 .gitignore 는 반드시 보택에 넣는다 — 문제는 배포가 아니라 104MB 짜리 .git 이다.

### `T2-code-join` 국가 코드 조인 — ISO_A2_EH → ISO_A2 → WB_A2 폴백과 194개국 전수 매칭 검증

**왜** — 좌표 추출(T4)과 실루엣 생성(T3)이 둘 다 이 조인 위에 선다. 조인이 190개만 맞춰도 스크립트가 조용히 성공하면 그 사실이 T6 테스트까지 가서야 드러난다. 조인을 독립 모듈로 떼고 **여기서 터지게** 만든다.

**독립 배포** — 불가 · 선행: `T1-fetch-raw`

**고칠 곳**

- 새 파일 /home/user/FlagQuiz/scripts/lib/ne-join.mjs — 순수 함수 모듈, 의존성 0. `export function joinFeatures(features, countryCodes)` 을 내보낸다. 반환값은 `{ matched: Map<code, feature>, excluded: feature[] }`.
- 폴백 순서: feature.properties 에서 `ISO_A2_EH` → `ISO_A2` → `WB_A2` 순으로 본다. 각 단계에서 값이 문자열이고 `/^[A-Z]{2}$/` 를 만족할 때만 채택. `'-99'`, `''`, `'-'`, `null`, `undefined` 는 전부 건너뛰고 다음 후보로 간다. 채택값을 toLowerCase() 해 우리 code 와 견준다. (노르웨이·프랑스가 ISO_A2=-99 인 것이 D3 항목 3의 사례이고, 둘 다 ISO_A2_EH 에서 잡힌다)
- 정답 집합은 /home/user/FlagQuiz/data/countries.js:16 이후의 194개 `code` 값이다. 스크립트는 이 파일을 vm 으로 읽어 FQ.countries 를 얻는다 — /home/user/FlagQuiz/tests/run.mjs:11-52 의 가짜 브라우저 샌드박스 패턴(window·document·localStorage·matchMedia 스텁)을 그대로 복사한다. **194개 목록을 스크립트에 하드코딩하지 마라.**
- ne-join.mjs 에 명시적 상수 두 개. (1) `CODE_OVERRIDES` — 세 단계 폴백으로도 안 잡히는 feature 를 NE의 `ADMIN` 값으로 우리 code 에 직접 꽂는 표. 비어 있더라도 상수는 존재해야 하고 각 줄에 이유를 주석한다. (2) `EXCLUDED_ADMINS` — 194개국이 아닌 나머지 도형 전부의 `ADMIN` 값 목록. Natural Earth v5.1.2는 242개 feature이므로 배제 지역은 48개다(242−194). 각 줄에 배제 사유를 한 단어로 적는다 — 예: `'Taiwan', // 견해가 갈림, README.md:173-176`, `'Greenland', // 속령`, `'Antarctica', // 무국적`, `'Somaliland', // 미승인`, `'Northern Cyprus', // 미승인`, `'Hong Kong S.A.R.', // 자치지역`.
- joinFeatures 는 세 종류의 실패를 **각각 다른 메시지로** throw 한다. ① 매칭 안 된 우리 code 목록, ② 194개국에도 EXCLUDED_ADMINS 에도 없는 미분류 feature 의 ADMIN 목록, ③ 한 code 에 두 개 이상의 feature 가 붙은 경우(code + 해당 ADMIN 들).

**완료 판정**

- [ ] joinFeatures 를 v5.1.2 원본에 돌리면 `matched.size === 194` 이고 예외가 없다.
- [ ] `matched` 의 키 집합이 data/countries.js 의 code 집합과 **양방향으로** 같다(빠진 것도 남는 것도 없음).
- [ ] `matched.size + excluded.length === features.length` — 분류되지 않고 사라진 feature 가 0개다.
- [ ] 노르웨이(no)·프랑스(fr)가 둘 다 `matched` 안에 있고, 그 둘의 `ISO_A2` 원값이 실제로 `'-99'` 임을 스크립트가 한 번 콘솔에 찍어 폴백이 작동했음을 눈으로 확인할 수 있다.
- [ ] `excluded` 안에 tests/run.mjs:87 의 DISPUTED 목록(대만·팔레스타인·코소보·서사하라)에 해당하는 feature 가 전부 들어 있고, `matched` 에는 하나도 없다.
- [ ] EXCLUDED_ADMINS 에서 한 줄을 지우고 돌리면 ②번 메시지와 함께 exit 1 한다(상위 NE 버전에서 도형이 늘어날 때 조용히 지나가지 않는다는 것을 보이는 검증).

**테스트**

- T6 의 '지도 자료' group 이 최종 결과물(data/map-coords.js)의 키 집합으로 이 조인을 간접 검증한다. 이 과제에서는 별도 테스트 파일을 만들지 않는다 — scripts/ 는 npm test 의 검사 범위가 아니고(tests/run.mjs:52 목록 참조), 원본 파일이 없는 CI에서는 돌릴 수도 없다.

**함정**

- `ISO_A2` 값이 숫자 -99 일 때와 문자열 '-99' 일 때가 버전마다 섮인다. `=== '-99'` 만 검사하지 말고 정규식 방식(대문자 2글자만 통과)으로 만들어 숫자·미정의 값이 자연스럽게 탈락되게 한다.
- `ISO_A2_EH` 가 어떤 feature에서는 속성 자체가 없을 수 있다. `properties.ISO_A2_EH` 의 존재 여부를 묻지 말고 값 검사만 하면 undefined 가 자연스럽게 다음 후보로 넘어간다.
- 프랑스·네덜란드는 NE에서 본토와 해외 영토가 **하나의** feature 에 MultiPolygon 으로 들어 있다. 코드가 같은 code 에 두 번 매칭될 것을 가정해 '나중 것이 이긴다' 로 덮어쓰면, 진짜 중복이 생겼을 때 조용히 한쪽을 잃는다. 반드시 ③번으로 throw 한다.
- WB_A2 를 1순위로 두지 마라. 세계은행 코드는 ISO 와 다른 값을 주는 나라가 있어 엉뙡한 나라에 붙는다. D3 항목 3이 정한 순서를 그대로 지킨다.

### `T3-simplify-silhouette` Douglas-Peucker 직접 구현과 '국경선을 그리지 않는' 단일 육지 실루엣 생성

**왜** — D3 항목 5의 핵심이고 이 파이프라인에서 유일하게 틀리기 쉬운 곳이다. '나라별 도형 242개를 그린 뒤 선을 안 그린다'가 아니라 '처음부터 도형이 하나뿐'이어야 영토 논쟁이 구조적으로 사라진다. 조인(T2)이 끝나야 어느 feature 가 194개국이고 어느 것이 48개 배제 도형인지 알 수 있다.

**독립 배포** — 불가 · 선행: `T1-fetch-raw`, `T2-code-join`

**고칠 곳**

- 새 파일 /home/user/FlagQuiz/scripts/lib/simplify.mjs — Douglas-Peucker 직접 구현, 의존성 0. **반복(명시적 스택) 방식으로** 쓴다 — 재귀로 쓰면 러시아 최대 링(수만 점)에서 콜스택이 넘친다. 점–선분 수직거리를 도(degree) 평면에서 계산한다.
- 도 평면에서 단순화하는 근거: 투영이 등적장방형(x=(lng+180)/360, y=(90-lat)/180, D3 항목 6)이라 경위도 공간에서의 거리가 화면 공간과 균일 배율만큼만 다르다. 구면거리(하버사인)를 쓰지 마라 — 고위도에서 필요 없이 점이 남아 용량만 늘고 그려진 모양은 같다.
- `const SIMPLIFY_TOLERANCE_DEG = 0.5;`를 유지한다. 초기 0.7° 육안 검사에서 한반도·일본·반도 해안이 거칠어 HANDOFF가 허용한 0.5°를 채택했다. 값을 결과 파일 헤더 주석에 기록한다.
- 닫힌 링 처리: GeoJSON 링은 첫 점 == 마지막 점이다. 이 배열을 '열린 폴리라인'으로 보고 DP 를 돌리면 첫·끝 점이 항상 보존되므로 닫힘이 저절로 유지된다. 링을 회전시키거나 재닫기 하지 마라.
- 새 파일 /home/user/FlagQuiz/scripts/build-map.mjs — T1 원본을 읽고, T2의 joinFeatures 로 분류하고, simplify 로 줄인 뒤, T4의 두 파일을 쓴다.
- **육지를 하나로 합치는 구체적 방법** — 폴리곤 불리언 합집합(union)을 구현하지 마라. 의존성 0으로 견고하게 만들 수 없고 부동소수 오차로 해안선에 실금이 생긴다. 대신: ① 194개국 feature 와 48개 배제 feature 를 **구분 없이 전부** 취한다. ② 각 Polygon 에서 **외곽 링(rings[0])만** 쓰고 내부 링(구멍)은 **전부 버린다**. MultiPolygon 은 각 Polygon 에 같은 규칙을 적용. ③ 살아남은 모든 링을 단순화한 뒤 **하나의 `d` 문자열**에 `M x y L x y … Z` 로 이어 붙인다. ④ 그것을 `<path>` **한 개**로, 단색 fill · `stroke:none` 으로 그린다. 선을 아예 안 그리므로 인접국이 맞닿아도 내부 경계가 생기지 않고, 구멍 링을 버렸으므로 nonzero fill-rule 에서 레소토·산마리노·바티칸 자리에 흰 구멍이 뚫리지 않는다.
- 48개 배제 도형의 처리: 육지는 같은 실루엣에 들어가되, **핀도 없고 code 도 없고 좌표도 없다.** 그냥 빼면 모로코 남쪽과 이스라엘 옆에 흰 구멍이 남아 오히려 더 눈에 띄다(D3 항목 5).
- 링 버리기 규칙: bbox 의 가로·세로가 **둘 다** tol 보다 작은 링은 버린다(자잘한 무인도). 단 **배제 지역을 포함한 모든 feature의 최대 면적 링과 194개 핀을 포함한 링은 보존한다**. 보존 대상 링이 DP 후 4점 미만이거나 화면 반올림 후 면적 0이면 바깥쪽 0.1 격자의 bbox 사각형(5점)으로 대체하고 최소 폭·높이를 보장한다. 화면 좌표 변환 후 외곽 방향을 통일한다(2026-09-15 사용자 수정 지시).
- 날짜변경선 검증: 한 링 안 연속한 두 점의 경도 차가 180을 넘으면 **throw** 한다(피지·키리바시·러시아 추코트카·뉴질랜드). NE 50m 은 ±180°에서 이미 잘라 두지만 그것을 믿지 말고 검사한다.
- 좌표 출력: x = (lng+180)/360*2000, y = (90-lat)/180*1000, 소수 **1자리** 반올림. viewBox 는 `0 0 2000 1000`(정확히 2:1). 1 단위 ≈ 0.18° ≈ 20km, 1040px 화면에서 0.52px. **픽셀 값(1040×520)을 데이터에 굽지 마라** — 그것이 D3 항목 1이 경계한 사전 계산의 같은 종류의 실수다.
- 남극: D3 항목 6이 가로:세로 정확히 2:1(위도 +90~-90 전체)을 못박았으므로 **자르지 않고 그대로 육지로 넣는다.** 위도 범위를 좁히면 2:1이 깨지고 T4의 공식 두 줄이 같이 무효가 된다.

**완료 판정**

- [ ] simplify.mjs 가 재귀 호출을 포함하지 않는다(함수 내부에 명시적 스택 배열이 있다). 러시아 최대 링에서 RangeError 가 나지 않는다.
- [ ] tol=0 으로 돌리면 입력 링과 출력 링의 점 개수가 같다(항등성). 채택한 tol=0.5에서 전체 점 개수가 원본의 20% 미만으로 줄어든다.
- [ ] 생성된 data/map-shapes.js 가 **단 하나의 `d` 문자열**을 갖는다. 파일 안에 나라 code 문자열이나 `ADMIN` 이름이 한 개도 등장하지 않는다(= 국경 정보가 데이터에 없다).
- [ ] 194개국과 배제 지역 각각에 대해 면적이 양수인 링이 최소 하나 출력에 들어간다. bbox 대체를 탄 모든 도형을 점검하며 특정 국가 코드 4개로 제한하지 않는다. 면적 소실·누락 시 exit 1.
- [ ] 날짜변경선 검사가 통과한다(가로로 지도를 가로지르는 선이 0개).
- [ ] 생성된 data/map-shapes.js 의 크기가 250KB 미만이다(2026-09-15 수정본 92,742바이트; 한도 250KB 유지).
- [ ] 생성된 path 를 브라우저에서 `fill:#cfe3c8; stroke:none` 으로 렌더링했을 때 육안으로 확인되어야 하는 것: 이탈리아 장화 모양, 한반도, 플로리다 반도, 스칸디나비아 반도, 일본 열도. 0.5°로도 알아볼 수 없으면 원자료·단순화·확대 표현을 다시 검토하고 용량을 재측정한다.
- [ ] 렌더링 결과에 **나라를 가르는 선이 한 개도 보이지 않고**, 모로코 남쪽(서사하라)과 이스라엘 옆(팔레스타인)에 흰 구멍이 없고, 남아프리카 안(레소토)에도 구멍이 없다.

**테스트**

- 자동화 테스트는 T6의 결과물 형식·면적·방향·194개 핀 winding 검사와 tests/map-build.test.mjs의 원자료 없는 합성 도형 회귀 검사를 함께 사용한다.
- 실기기·육안 확인: 생성 직후 path 를 한 장짜리 HTML 에 넣어 브라우저로 열어 위 수용 기준의 마지막 두 항목을 사람 눈으로 확인한다. 이 단계는 생략하지 마라.

**함정**

- 구멍 링을 살려둔 채 한 path 에 전부 붙이면 nonzero fill-rule 가 레소토·산마리노·바티칸 자리를 뚫어버린다. 반드시 내부 링을 버려라. `fill-rule:evenodd` 로 해결하려 하지 마라 — 그러면 겹치는 인접국 사이에 구멍이 생겨 정확히 피하려던 경계선이 나타난다.
- path 에 stroke 를 0.5라도 주지 마라. 한 path 안의 개별 링에도 선이 그려져 정확히 국경선이 된다.
- MultiPolygon 과 Polygon 을 한 단계 잘못 풀면(배열 중첩 깊이) 조용히 대륙 절반이 사라진다. geometry.type 을 분기하고, 그 둘 이외의 type 을 만나면 throw 한다.
- tol 을 올려 용량을 줄이고 싶은 유혹이 생긴다. 현재 실루엣 92,742바이트는 flags/rs.svg 한 장(177KB)보다 작다. 용량은 문제가 아니다 — 만 4세가 한반도를 알아보는 것이 문제다.
- '194개국이 다 들어갔으니 46개는 빼도 되겠지'로 가지 마라. 그리면 지도에 흰 구멍이 생기고, 그 구멍이 정확히 이 저장소가 피하고 싶었던 논쟁의 지도를 그리게 된다.

### `T4-emit-data` 좌표·실루엣 데이터 파일 출력 형식 확정

> 2026-09-15 사용자 재현 결함에 따라 아래 좌표·실루엣 게이트를 강화했다. 상세 근거와 전후 출력은 [지도 자료 결함 수정 검증](MAP-REPAIR.md)을 따른다.

**왜** — 이 저장소는 fetch 로 자료를 읽는 경로가 한 군데도 없다. 전부 <script> 태그 + `window.FQ` 전역이고, sw.js SHELL·build-site.mjs 화이트리스트·tests/run.mjs 로더가 전부 그 전제 위에 서 있다. JSON 파일로 내면 네 군데를 동시에 어기게 된다.

**독립 배포** — 불가 · 선행: `T3-simplify-silhouette`

**고칠 곳**

- 새 파일 /home/user/FlagQuiz/data/map-coords.js. 형식은 data/countries.js:15-16 을 그대로 따른다: `window.FQ = window.FQ || {};` 다음 줄에 `window.FQ.mapCoords = { … };`
- mapCoords 의 모양: `{"af":[66.00,34.00],"al":[20.07,41.14], …}` — 키는 소문자 2자 code, 값은 `[lng, lat]` 배열(GeoJSON 과 같은 순서). NE 의 `LABEL_X`/`LABEL_Y`(글자를 놓기 위한 좌표)를 기본값으로 쓰되, 자국 육지 밖이면 근거 있는 `LABEL_OVERRIDES`를 적용하고 **소수 2자리**로 반올림한다(D3 항목 1, 2026-09-15 사용자 수정 지시). 한 줄에 한 나라씩, code 사전순 정렬 — 나중에 한 나라 좌표를 손보정할 때 diff 가 한 줄로 남아야 한다.
- **사전 계산 x/y 를 넣지 않는 이유를 파일 헤더 주석에 적는다**: 특정 viewBox·특정 화면 폭에 맞춘 x/y 는 지도 도형을 한 번만 바꿔도 194개 값이 한꺼번에 무효가 된다(D3 항목 1). 화면 좌표는 렌더링 시점에 `x=(lng+180)/360`, `y=(90-lat)/180` 두 줄로 만든다. 이 두 줄을 주석에 그대로 적어 둔다.
- LABEL_X/LABEL_Y 검증: 모든 국가에서 원래 선택한 좌표와 소수 2자리로 반올림한 좌표가 **자국 exteriorRings 중 하나 안에 있는지 pointInRing으로 검사**한다. bbox + 2° 검증은 폐기한다. `LABEL_OVERRIDES`에 사유와 보정 좌표를 기록하고 생성물을 직접 수정하지 않는다. 최대 링뿐 아니라 핀을 포함한 섬 링도 보호한다. 화면 좌표 반올림 후 면적 0이면 보호 링을 바깥쪽 0.1 격자의 최소 폭·높이를 가진 bbox로 대체한다. 모든 bbox 대체 국가·배제 지역은 양수 면적의 출력 링이 있어야 하고, 최종 SVG의 194개 핀 winding이 모두 0이 아니어야 한다.
- 새 파일 /home/user/FlagQuiz/data/map-shapes.js. `window.FQ.mapLand = { viewBox: '0 0 2000 1000', d: 'M…Z' };` 한 덩어리. `d` 는 정확히 하나의 문자열. 나라별 키로 쪼개지 마라 — 쪼개는 순간 그것이 국경 데이터가 되고 D3 항목 5의 방침이 무너진다.
- 재현성: build-map.mjs 를 두 번 돌려 결과가 바이트 단위로 같아야 한다. 순회 순서를 code 사전순으로 고정, 반올림은 `Number(v.toFixed(n))` 로 통일, 줄바꿈 LF, 파일 끝에 개행 한 개.
- package.json:7-16 에 `"map:build": "node scripts/build-map.mjs"` 추가. **`build` 와 `test` 에는 엮지 마라** — .github/workflows/pages.yml 의 배포 잡이 `npm run build` 를 돌리는데 거기엔 .gitignore 된 원본이 없다.

**완료 판정**

- [ ] `npm run map:build` 가 exit 0 으로 끝나고 data/map-coords.js 와 data/map-shapes.js 두 파일을 쓴다.
- [ ] data/map-coords.js 크기가 12KB 미만이다(README.md:42 실측 약 6KB 기준 + 여유).
- [ ] 두 파일을 백업한 뒤 `npm run map:build` 를 다시 돌리면 `git diff --stat` 이 비어 있다(재현성).
- [ ] Object.keys(FQ.mapCoords).length === 194, 그리고 키 집합이 data/countries.js 의 code 집합과 양방향으로 일치한다.
- [ ] 모든 값이 `[lng, lat]` 길이 2 배열이고, lng ∈ [-180,180], lat ∈ [-90,90], 모두 `Number(v.toFixed(2)) === v` 를 만족한다.
- [ ] 손으로 고른 표본 5개가 상식적이다: kr ≈ [127.8, 36.4], au ≈ [134.0, -24.1], br ≈ [-53.1, -10.8], va 가 실제 바티칸 안쪽([12.43, 41.9], 경도 12.428~12.439·위도 41.898~41.906), ru 가 서쪽 본토(경도 30~100 사이, 동시베리가 아니다).
- [ ] LABEL_OVERRIDES 에서 임의의 한 줄을 지우거나 자국 육지 밖 좌표로 바꾸면 pointInRing 검증이 exit 1 한다.
- [ ] data/map-shapes.js 안에 2자 나라 코드나 ADMIN 이름 문자열이 없다(헤더 주석 제외).
- [ ] 두 파일 모두 출처·버전·tol·재생성 명령·'손으로 고치지 마세요' 헤더 주석을 갖는다.

**테스트**

- T6 의 '지도 자료' group 이 키 집합·값 범위·소수 자릿수·mapLand 형식에 더해 subpath 300개 이상·면적 0 없음·방향 통일·전체 핀의 winding을 자동으로 단언한다.
- 표본 5개(kr·au·br·va·ru) 좌표 검사를 T6 에 명시적 ok() 한 줄씩 넣는다 — 좌표 축이 바뀌거나([lat,lng] 로 뒤집히거나) 부호가 뒤집히는 사고를 잡는 가장 싸고 확실한 검사다.

**함정**

- `[lat, lng]` 순서로 쓰면 지도가 조용히 90도 돌아간 모양이 된다. GeoJSON 과 같은 `[lng, lat]` 로 통일하고 헤더 주석에 명시한다.
- `toFixed(2)` 는 문자열을 돌려준다. `Number()` 으로 감싸지 않으면 JSON 에 `"66.00"` 이 문자열로 들어가 테스트의 Number.isFinite 검사가 터진다.
- `window.FQ = window.FQ || {};` 줄을 빼면 로드 순서에 따라 FQ 가 undefined 일 수 있다. countries.js:15 와 같은 방어줄을 두 파일 모두에 넣는다.
- map-shapes.js는 2026-09-15 기준 92,742바이트이며 한 줄짜리 d 문자열이라 에디터에서 열면 무겁다. 이것은 정상이다 — 보기 좋게 하려고 줄바꿈을 넣으면 재현성 검사가 무너질 수 있으니, 넣기로 했으면 규칙을 고정해라(예: 링 하나당 한 줄).
- D6의 함정을 여기서 미리 피한다: 이 두 파일은 localStorage 와 아무 관계가 없는 정적 자료다. 진행도·플래그를 여기에 섮지 마라.

### `T5-register` 새 데이터 파일을 네 군데 등록 — index.html · sw.js · build-site.mjs · tests 로더

**왜** — 이 저장소에서 새 데이터 파일이 실제로 동작하려면 네 곳에 이름을 적어야 하고, 하나를 빠뜨렸을 때의 증상이 전부 다르다(화면에 안 뜸 / 오프라인에서만 깨짐 / 배포본에만 없음 / 테스트가 못 읽음). 그중 sw.js 수정은 114MB 음원 캐시를 날릴 수 있는 유일한 지점이라 따로 떼어 명세한다.

**독립 배포** — 불가 · 선행: `T4-emit-data`

**고칠 곳**

- /home/user/FlagQuiz/index.html:53 `<script src="data/countries.js"></script>` 바로 다음 줄에 두 줄 추가: `<script src="data/map-coords.js"></script>`, `<script src="data/map-shapes.js"></script>`. js/progress.js(index.html:54)보다 앞이어야 한다.
- /home/user/FlagQuiz/sw.js:11 `'./data/countries.js',` 다음 줄에 `'./data/map-coords.js',` 와 `'./data/map-shapes.js',` 추가.
- **AUDIO_CACHE='flagquiz-v4'와 KEEP의 음원 보존을 유지한다.** T2 뒤에는 install이 SHELL_CACHE에만 쓴다. SHELL 배열에 지도 파일을 추가하면 sw.js 바이트가 달라져 install이 다시 실행되고, 기존 음원 버킷은 그대로 남는다. 지도 등록 때문에 음원 캐시 이름을 바꾸지 않는다.
- /home/user/FlagQuiz/scripts/build-site.mjs:16 `const files = ['index.html', 'sw.js', 'manifest.webmanifest', 'data/countries.js'];` 에 `'data/map-coords.js', 'data/map-shapes.js'` 추가. build-site.mjs:56 은 assets·css·flags·js 폴더만 통째로 복사하고 **data/ 는 폴더 복사 대상이 아니다** — 여기에 안 적으면 _site 에 파일이 없어 배포본에서만 지도가 깨진다.
- /home/user/FlagQuiz/tests/run.mjs:52 목록에서 `'data/countries.js'` 뒤에 `'data/map-coords.js', 'data/map-shapes.js'` 추가.
- /home/user/FlagQuiz/js/ 아래에 새 파일을 만들지 마라 — 이 과제의 범위는 자산 등록까지다. 지도 화면·핀 렌더링 코드는 T7의 제약을 받아 2주 뒤 별도 과제에서 만든다.
- **새 그림을 flags/ 에 넣지 마라** — tests/run.mjs:120-123 이 flags/ 안의 모든 .svg 가 194개 code 중 하나여야 한다고 단언해 즉시 실패한다. 이 과제는 flags/ 를 건드리지 않는다.

**완료 판정**

- [ ] `npm test` 가 통과하고, tests/run.mjs 샌드박스에서 `FQ.mapCoords` 와 `FQ.mapLand` 가 모두 정의되어 있다.
- [ ] `npm run build` 후 `_site/data/map-coords.js` 와 `_site/data/map-shapes.js` 가 존재하고 원본과 바이트가 같다.
- [ ] `_site/data/natural-earth/` 는 존재하지 않는다.
- [ ] `grep -c "flagquiz-v4" sw.js` 가 1 이고, `git diff sw.js`에 AUDIO_CACHE 이름 변경이 나타나지 않는다.
- [ ] `npm test` 안의 tests/sw.test.mjs 의 '업데이트는 FlagQuiz의 이전 캐시만 삭제한다' 테스트가 그대로 통과한다(deleted === ['flagquiz-v2','flagquiz-v3']).
- [ ] index.html 에서 두 script 태그가 data/countries.js 뒤, js/progress.js 앞에 있다.
- [ ] js/ 아래 파일 목록이 이전과 같다(새 파일 0개). flags/ 안의 파일 개수가 이전과 같다.

**테스트**

- T6 가 추가하는 '등록 누락 검사'(build-site.mjs·sw.js·index.html 문자열 검사)가 이 과제의 회귀 방지 장치다. 두 과제를 같은 PR 로 넣는 것을 권한다.
- 기존 tests/sw.test.mjs 는 수정하지 않는다. 그대로 통과해야 한다.

**함정**

- '새 파일을 캐시에 넣으려면 버전을 올려야 한다'는 흔한 오해다. 이 저장소에서는 sw.js 의 **바이트가 바뀌면** install 이 다시 돌고, addAll은 SHELL_CACHE에 쓴다. AUDIO_CACHE='flagquiz-v4'는 이 등록과 무관하게 보존한다.
- build-site.mjs:56 의 폴더 복사 목록에 'data' 를 추가해서 해결하려 하지 마라. 그러면 data/voice-config.json 과 (로컬에 있을 경우) data/natural-earth/ 원본까지 배포에 섮린다. files 배열에 두 경로를 명시하는 방식을 지킨다.
- index.html 에만 넣고 sw.js 를 빠뜨리면 개발 중에는 멀줦하게 동작하다가 아이패드를 비행기 모드로 두는 순간 지도만 안 뜼는 버그가 된다. 네 곳을 한 커밋에 같이 고쳐라.

### `T6-tests` 지도 데이터 정합성 테스트 — 국기 파일 검사 패턴 복제

**왜** — D3 항목 9가 요구하는 것이 정확히 이것이다 — 가짜 DOM에서 연출은 검증할 수 없으니 좌표 데이터 정합성만 테스트한다. tests/run.mjs:114-124 의 국기 검사는 '빠진 것도 남는 것도 없음'을 양방향으로 단언하는 이 저장소의 확립된 패턴이고, 지도 좌표에 필요한 것도 똑같은 양방향 단언이다.

**독립 배포** — 불가 · 선행: `T5-register`

**고칠 곳**

- /home/user/FlagQuiz/tests/run.mjs:124 (`});` — '국기 이미지 파일' group 의 끝) 바로 다음에 `group('지도 자료', () => { … })` 를 삽입한다. 기존 `ok(cond, label, detail)` 헬퍼(tests/run.mjs:67-70)를 쓴다. **새 테스트 파일을 만들지 말고 run.mjs 안에 넣어라** — countries.js 와 같은 샌드박스를 공유해야 한다.
- 양방향 단언(tests/run.mjs:116-123 을 그대로 본뜬다): ① 194개국 각각에 대해 `FQ.mapCoords[c.code]` 가 있는지('지도 좌표 존재', c.code), ② `Object.keys(FQ.mapCoords)` 의 모든 키가 194개 code 집합에 들어 있는지('쓰이지 않는 지도 좌표가 없어야 함', key). ②이 빠지면 대만·코소보 좌표가 조용히 남는다.
- `ok(Object.keys(FQ.mapCoords).length === EXPECTED_COUNT, …)` — tests/run.mjs:62 의 EXPECTED_COUNT 상수를 재사용한다. 194를 다시 적지 마라.
- 값 검증: 길이 2 배열, lng ∈ [-180,180], lat ∈ [-90,90], 둘 다 Number.isFinite, 그리고 `Number(v.toFixed(2)) === v`(부동소수가 새는 `Math.round(v*100)===v*100` 를 쓰지 마라).
- 배제 지역 단언: tests/run.mjs:87 의 `DISPUTED` 상수(tw·ps·xk·eh·ck·nu)를 재사용해 `FQ.mapCoords` 에 그 키가 없음을 단언한다.
- 표본 좌표 단언 5줄: kr · au · br · va · ru 가 각각 합리적인 사각형 안에 있는지(예: kr 은 lng 124~132, lat 33~39). 좌표 축 뒤집힘·부호 반전을 잡는 가장 싸고 확실한 검사다.
- 실루엣 단언: `FQ.mapLand.viewBox === '0 0 2000 1000'`, `typeof FQ.mapLand.d === 'string'`, `FQ.mapLand.d.length < 400000`, `d` 안에 `M` 이 1회 이상, 그리고 **`Object.keys(FQ.mapLand).sort().join(',') === 'd,viewBox'`** — 나라별 키가 없음을 고정하는 검사다. 이것이 '국경선을 데이터로 갖지 않는다'를 문서가 아니라 테스트로 만드는 부분이다.
- **등록 누락 검사**(이 저장소에 없던 새 종류의 검사): `fs.readFileSync(path.join(root,'scripts/build-site.mjs'),'utf8')` 에 `'data/map-coords.js'`·`'data/map-shapes.js'` 문자열이 있는지, `sw.js` 에 `'./data/map-coords.js'`·`'./data/map-shapes.js'` 가 있는지, `index.html` 에 두 script 태그가 있는지. 실패 메시지에 '어느 파일에 무엇을 더해야 하는지'를 적는다.
- **sw.js AUDIO_CACHE 고정 검사**: `sw.js` 텍스트에 `flagquiz-v4` 가 들어 있음을 단언하고, 실패 메시지에 '서비스워커 버전을 올리면 아이패드에 받아 둔 음원 캐시가 전부 삭제된다'를 적는다. tests/sw.test.mjs:34 가 우회적으로 막고 있지만 이유가 적혀 있지 않다.
- /home/user/FlagQuiz/README.md:154-160 '검사하기' 절의 불릿 목록에 한 줄 추가: `- 지도 좌표 194개가 나라 목록과 정확히 짝지는지 — 빠진 나라도, 목록에서 뻐 나라의 좌표가 남은 것도 없는지`

**완료 판정**

- [ ] `npm test` 가 통과하고 출력에 `▶ 지도 자료` 그룹이 '✓ 통과'로 찍힌다. 전체 통과 건수가 이전보다 늘어난다.
- [ ] data/map-coords.js 에서 임의의 한 줄(예: "kr")을 지우면 npm test 가 exit 1 하고 실패 메시지에 kr 이 나온다.
- [ ] data/map-coords.js 에 `"tw":[121.0,23.6]` 을 더하면 npm test 가 exit 1 하고 '쓰이지 않는 지도 좌표' 와 '대만' 관련 두 검사가 동시에 잡힌다.
- [ ] data/map-shapes.js 에 `kr: 'M…'` 같은 나라별 키를 더하면 npm test 가 exit 1 한다.
- [ ] scripts/build-site.mjs:16 에서 'data/map-coords.js' 를 지우면 npm test 가 exit 1 하고 메시지가 그 파일과 줄을 가리킨다.
- [ ] sw.js의 AUDIO_CACHE를 flagquiz-v5로 바꾸면 npm test 가 exit 1 하고 음원 캐시 삭제 경고가 출력된다.
- [ ] 기존 검사(데이터 기본·국기 파일·정답 판정·보상 체계 등) 중 단 한 건도 수정되지 않았다 — `git diff tests/run.mjs` 가 순수 추가만 보여준다(삽입 지점 앞뒤 줄 제외).

**테스트**

- tests/run.mjs 에 '지도 자료' group 신규 추가(이 과제의 산출물 자체)
- tests/sw.test.mjs · tests/app.test.mjs 등 기존 테스트 파일은 수정하지 않는다. 모두 그대로 통과해야 한다.

**함정**

- `Math.round(v*100) === v*100` 로 소수 자릿수를 검사하면 부동소수 오차로 0.07 같은 값에서 거짓 실패한다. `Number(v.toFixed(2)) === v` 를 써라.
- tests/run.mjs 는 vm 샌드박스에서 돌아간다. fs · path 는 샌드박스 밖(모듈 최상위)에서 이미 import 되어 있으니(tests/run.mjs:5-6) 그것을 그대로 쓴다. 샌드박스에 fs 를 넣지 마라.
- `group()` 은 실패 건수만 세고 프로세스를 중단하지 않는다(tests/run.mjs:72-79). ok() 안에서 FQ.mapCoords[code] 가 undefined 일 수 있으므로 `[0]` 같은 접근 전에 존재 검사를 먼저 하고 가드를 두어라 — 안 그러면 194건 실패 목록 대신 TypeError 하나로 터져 무엇이 빠졌는지 보이지 않는다.
- 테스트에 애니메이션·핀 렌더링 검증을 넣지 마라. D3 항목 9가 명시적으로 제외했고, 가짜 DOM(tests/run.mjs:33-40)은 style 계산도 matchMedia 도 횵내를 못 낸다.

### `T8-attribution` 출처 표기와 '국경선을 쓰지 않는다' 방침 명문화

**왜** — Natural Earth 는 퍼블릭 도메인이라 법적 귀속 의무가 없지만, 이 저장소는 flag-icons(MIT)와 Typecast 음원을 index.html:36-40 푸터와 README.md:178-184 '만든 것들' 양쪽에 적는 관례를 이미 갖고 있다. 자료 출처가 적힐 자리가 비어 있는 파일이 하나 생기면 그 관례가 깨진다. 그리고 D3 항목 5가 README 명문화를 명시적으로 요구한다.

**독립 배포** — 불가 · 선행: `T4-emit-data`

**고칠 곳**

- /home/user/FlagQuiz/index.html:37 (`국기 이미지는 … flag-icons (MIT) 를 사용합니다.<br>`) 바로 다음 줄에 한 줄 추가: `세계지도는 <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a> (퍼블릭 도메인) 자료로 만들었습니다. 땅만 그리고 국경선은 그리지 않아요.<br>` — 기존 줄과 같은 `<br>` 종결, 같은 링크 속성(target·rel). index.html:39 의 '기록은 이 브라우저 안에만 저장돼요.' 보다는 앞에 둔다.
- /home/user/FlagQuiz/README.md:180 (`- 국기 이미지: [lipis/flag-icons](…) (MIT License)`) 다음에 항목 추가: `- 세계지도: [Natural Earth](https://www.naturalearthdata.com/) 50m admin_0_countries (퍼블릭 도메인). 원자료는 저장소에 넣지 않고 npm run map:fetch 로 받아 npm run map:build 로 변환합니다. 결과는 data/map-coords.js · data/map-shapes.js 두 파일입니다.`
- /home/user/FlagQuiz/README.md:173-176 의 '나라 목록은 유엔 회원국 193개국에 바티칸을 더한 194개입니다' 항목의 끝(176행 뒤)에 문장 추가: `지도에서는 **땅만 그리고 국경선을 나라를 가르는 선으로 쓰지 않습니다.** 어느 선을 어디에 긋느냐가 어른들 사이에서도 갈리는 문제라, 바다와 땅만 구분되는 한 장의 실루엣으로 그리고 나라는 어디서나 같은 크기의 핀으로 표시합니다.` — D3 항목 5가 요구한 정확한 명문화다.
- data/map-coords.js · data/map-shapes.js 두 파일 헤더 주석에 동일한 다섯 줄: 출처(Natural Earth 50m admin_0_countries), 버전 태그(T1의 URL과 같은 값), 라이선스(퍼블릭 도메인), 재생성 명령(`npm run map:fetch && npm run map:build`), `이 파일은 생성물입니다. 손으로 고치지 마세요.`
- /home/user/FlagQuiz/LICENSE 는 건드리지 마라. 퍼블릭 도메인 자료는 MIT 범위와 충돌하지 않고, README.md:182-184 가 '생성 음원에는 MIT 를 적용하지 않는다' 같은 예외를 README 쪽에서 다루는 구조다.
- docs/expansion/ 의 설계 문서는 고치지 마라. DECISIONS.md 는 확정된 결정의 기록이지 작업 상황판이 아니다(T7 의 링크 한 줄만 예외).

**완료 판정**

- [ ] index.html 푸터가 브라우저에서 네 줄로 보이고, Natural Earth 링크가 새 탭으로 열리며 rel="noopener" 가 붙어 있다.
- [ ] README.md '만든 것들' 절에 Natural Earth 항목이 있고, 그 항목이 적은 두 명령(`npm run map:fetch`, `npm run map:build`)이 package.json 의 scripts 에 실제로 존재한다.
- [ ] README.md 에 '국경선을 나라를 가르는 선으로 쓰지 않는다'는 문장이 있고, 기존 173-176행의 '어른들 사이에서도 답이 갈리는 것은 뺀다'는 방침과 같은 문단 안에 연속된다.
- [ ] data/map-coords.js 와 data/map-shapes.js 두 파일 첫 줄부터 헤더 주석 5줄이 동일한 문구로 들어 있고, 적힌 재생성 명령을 그대로 돌리면 같은 파일이 나온다.
- [ ] `git diff LICENSE` 가 비어 있다.
- [ ] `npm test` 가 통과한다(index.html 수정이 tests/app.test.mjs 의 파싱 경로를 건드리지 않았음을 확인).

**테스트**

- 자동화 테스트 없음(문서·푸터 과제). 기존 `npm test` 가 그대로 통과하는 것이 수용 기준이다.
- T6 의 '등록 누락 검사'가 index.html 을 문자열로 읽으므로, 푸터 수정으로 스크립트 태그 줄을 실수로 지우면 즉시 잡힌다.

**함정**

- '퍼블릭 도메인이니 안 적어도 된다'는 법적으로는 맞지만 이 저장소의 관례와 어긍난다. D3 항목 2가 '귀속 의무는 없지만 출처는 적는다'로 이미 정리해 두었다.
- 푸터 문구를 수아 음원으로 만들거나 새 음성 문구를 추가하지 마라. 새 문구가 생기는 순간 scripts/build-site.mjs:13-15 의 배포 게이트('전체 음원이 준비되어야 배포할 수 있습니다')가 걸려 main 배포 전체가 멈춘다. 이 푸터 줄은 화면에 적히는 텍스트일 뿐 음원 목록과 무관하다.
- README.md:173-176 항목을 통째로 다시 쓰지 마라. tests/run.mjs:86-90 의 DISPUTED 검사가 그 문장을 근거로 삼고 있고, docs/expansion 문서 여럿이 그 줄 번호를 인용한다. 문장을 **더하기만** 한다.

---

## 사람이 해야 하는 것 (에이전트가 대신 못 함)

- 0단계의 캐시 버킷 분리 커밋을 단독 배포한 뒤 아이패드 비행기 모드 확인 — ①앱이 뜨고 ②국기가 보이고 ③수아 음원이 재생되는가. 셸·국기 약 2MB 재다운로드는 정상, 음원 114MB 재다운로드는 실패다. 이 답이 오기 전에는 1단계로 넘어가지 않는다.
- SUBJECTS.csv의 draft 31행 승인 — settings.csv의 koApprove 열만 읽는다(행당 5초, 194행 약 20분). 승인 전에는 그 행의 영어 문장을 쓰지 않는다.
- 영어 피사체 문장 342건 작성 — 번역이 아니라 재작성이다. 4세 구별 지침·개수 명시·저작권과 무기·술담배 회피 판단이 문장 단위로 걸려 있어 기계 번역이 세 가지를 동시에 못 한다. 배치 20건씩 18배치, 자료 조사 포함 4~6시간.
- 화풍 A/B 파일럿 — 먼저 jp 2장만 뽑아 도구 능력 6가지(4:3 출력·시드 고정·레퍼런스 첨부·배치·문맥 오염·안전 필터)를 확인하고, 통과하면 A 8장·B 8장을 각각 새 대화창에서 몰아 뽑는다. 8항목 채점 후 styleChoice 확정과 민규 반응 3가지 기록.
- 앵커 1장 선정 — kr 광화문 프롬프트를 새 대화에서 5~8회 뽑아 선 굵기·채도·광원·배경색이 기준에 맞는 1장을 고르고 커밋한다. 글자가 한 글자라도 있는 장은 후보에서 제외.
- 본 생성 342장 — 대화창 1개당 앵커 1 + 항목 8~10, 회차 35~43개, 약 18~21시간. 원본 PNG 0.6~1.2GB가 쌓이므로 맥 디스크를 미리 비워 둔다.
- 맥에서 PNG→WebP 변환 실행 — 현재 sips는 WebP 읽기 전용이고 cwebp 1.6.0이 인코딩을 지원한다. 4단계에서 --dry-run 도구를 준비하고, 실제 변환·검수는 그림이 있는 6단계에서 진행한다. 도구가 있다는 이유로 5~7단계를 먼저 시작하지 않는다.
- 사람 눈 검수 — 글자·국기·사람·앵커 대비 이탈·사실 오류·저작권·아이 인지. 40장 컨택트시트를 앵커와 나란히 놓고 보면 30~40분에 끝난다. 기계 검수 통과가 그림이 괜찮다는 뜻이 아니다.
- 지도 실루엣 육안 확인 — 이탈리아 장화·한반도·플로리다 반도·스칸디나비아·일본 열도가 알아보이는가, 나라를 가르는 선이 한 개도 없는가, 서사하라·팔레스타인·레소토 자리에 흰 구멍이 없는가. 현재 채택값 0.5°로도 못 알아보면 단순화와 확대 표현을 다시 검토한다.
- 생성 도구 약관 확인 — 재배포 권리와 출처 표시 의무(C2PA 등). MIT 저장소에 그림을 넣기 전에 끝나야 하고, 확인 전까지 원본 PNG의 메타데이터는 raw/ 쪽에 보존한다.
- 전량 공개 판정 — 342장 검수가 끝났다는 사람의 확인이 있어야 플래그 on 커밋으로 넘어간다.

---

## 착수 전에 정해야 할 것

아래는 착수 전에 확인할 사항이다. 미정 항목만 필요한 단계에서 사용자에게 묻고, 날짜와 함께 확정한 항목은 그대로 적용한다.

- D7 화풍은 2026-09-15 사용자 선택으로 B 확정이다. 이 프로젝트 원장 생성 시 styleChoice b를 반영하며 규격은 1024×768·경고 110KB·실패 150KB다. 미선택 기본값 null과 null 본 생성 거부, A/B 분기 자체는 유지한다. 화풍 선택이 소재·앵커 승인이나 본 생성 선행 조건 전체의 완료는 아니다.
- 그림 폴더 경로는 2026-09-15 사용자 결정으로 images/symbols/·images/places/로 확정했다. 새로 물을 사항이 아니다. build-site.mjs는 images 하나를 복사하고 serve.mjs MIME·테스트·ui.js 경로 함수를 같은 이름으로 맞춘다.
- 퀴즈 모드의 손가락 조작 방식이 미정이다(끌어다 놓기 / 탭-탭 / 기존 사지선다). D2에 따라 2주 뒤 모드 작업 때 정하고, 현재 권장은 기존 사지선다 재사용이다 — 그림 1장 + 국기 4장.
- 지도 퀴즈가 나라 단위를 채점하는지 대륙 수준을 채점하는지 미정이다. 자산 형식(나라별 좌표 194개)은 두 경우 모두에 그대로 쓰이므로 지금 어느 작업도 막지 않지만, 정답 판정의 허용 반경은 렌더링이 아니라 채점 코드의 상수 하나로 분리해 둔다.
- 생성 도구 약관의 재배포 권리와 출처 표시 의무(C2PA 등)가 확인되지 않았다. MIT 저장소에 그림을 넣기 전에 답이 필요하고, 확인 전까지 변환 과정에서 메타데이터를 지우더라도 원본 PNG 쪽에는 보존한다.
- 맥 도구는 2026-09-15 확인했다: sips-316(WebP 읽기 전용), cwebp 1.6.0(쓰기 가능), ffmpeg·magick·convert는 PATH에 없음. `sips --formats | grep -i webp` 출력은 `org.webmproject.webp         webp  `이며 Writable 표시가 없다. 다른 맥에서는 다시 확인한다.
- 생성 도구의 능력 6가지(4:3 출력·시드 고정·레퍼런스 이미지 첨부·배치 생성·대화 문맥 오염·안전 필터 거부 단어)가 파일럿 전까지 미확인이다. 특히 4:3이 안 되면 변환이 '중앙 크롭'에서 '좌우 여백 덧대기' 경로로 통째로 바뀐다.
- 남극을 지도에 그릴 것인가. D3의 가로:세로 2:1 제약 때문에 기본은 '그린다'이고, 자르는 선택은 2:1과 좌표 공식 두 줄을 동시에 건드려 D3 재검토 안건이 된다. 실기기에서 보고 별도 결정한다.
- 자료 기준값은 confusion-groups.json 58군, SUBJECTS.csv 194행·상징물 194개·명소 148개(이미지 합계 342개)다. 초기 문서의 53군·314장 추정은 현재 구현 기준이 아니다. 코드는 두 원자료 파일을 계수해 검증한다.
- PILOT.md와 SUBJECTS.csv의 nl 명소가 어긋난다(풍차 한 채 — 날개 네 장 대 킨더다이크에 줄지어 선 풍차). 공통 블록의 'one single subject'가 이기므로 한 채로 쓰되, 같은 유형('줄지어'·'여러 개'·'늘어선')이 다른 행에도 있는지 전수로 훑는 일이 아직 안 됐다.
- D6의 '194칸 스티커 칸 안에 도장 3개(그림·명소·위치)를 겹친다'는 이번 범위 밖이다. 기록 축 분리가 들어간 뒤 별도 과제로 나가야 하고, 도장의 시각 디자인은 아직 아무것도 정해지지 않았다.
- 화풍을 파일럿 이후에 바꾸면 그때까지 뽑은 그림 전량이 재작업이고 앵커부터 다시 만들어야 한다. '몇 장까지는 되돌릴 수 있다'는 마지노선이 정해지지 않았다 — 본 생성 착수 전에 한 번 정해 두는 편이 안전하다.

---

## 검증

- 커밋 전 항상 `npm test && npm run verify`. 하나라도 실패하면 커밋하지 않는다. 초기 기준은 node 테스트 87개였고 현재 실행 결과는 STATUS.md와 검증 로그를 따른다.
- `npm run build`는 음원 게이트를 통과해야 한다. 새 수아 문구를 추가하면 여기서 막힌다.
- 서비스워커·캐시 관련 변경은 **아이패드 실기기 비행기 모드 확인**이 필요하다. 가짜 DOM으로는 검증되지 않는다.
