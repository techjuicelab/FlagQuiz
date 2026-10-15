# 비공개 앱 서버

Node.js 24 이상으로 `_site`를 로그인 뒤에서 제공한다. NAS 구성의 기본 인증은 `TechJuiceID`이며, 다른 TechJuice 앱에서 사용하는 아이디 또는 이메일과 같은 비밀번호로 로그인한다. 비밀번호를 FlagQuiz 저장소에 추가로 저장하지 않는다. 기존 7개 앱과 계정은 같지만 세션 쿠키를 공유하거나 복사하지 않는다.

2026-10-03 기준 중앙 `flagquiz` 앱을 ‘세계 놀이’로 등록하고 기존 활성 계정 17개 모두에 앱 권한을 부여했다(`user` 16개, 기존 TECH 관리자 1개). 비활성·익명 계정은 제외했고 다른 앱 설정은 변경하지 않았다. [NAS 최초 성공 운영 기록](../docs/nas-deploy.md#최초-성공-운영-기록)에 실제 배포, DNS·Cloudflare·외부 HTTPS, 중앙 관리자·일반 계정 로그인, 운영 Groq 전사, 백업·별도 복원 및 재시작 후 상태 유지 검증이 있다. 외부 주소는 `https://flagquiz.techjuicelab.space`, NAS loopback 포트는 `31015`다. `/health`의 `configured:true`는 설정 검사를 뜻하며 실제 로그인이나 전사 성공을 보장하지 않는다.

국기 보고 나라 말하기(`voice`)·국기 보고 수도 말하기(`capitalVoice`)·나라 이어 말하기(`country-chain`)는 NAS가 허용하고 기기가 지원하면 Soniox 스트리밍으로 연결해 확정 이름을 즉시 채점한다. 키 미설정·기기 미지원이면 기존 Groq 파일 전사를 선택한다. 실제 iPhone/iPad 어린이 발화 정확도·지연은 별도 검증 대상이다. [말하기 설계와 검증 범위](../docs/spoken-stt.md), [스트리밍 계약](../docs/streaming-speech-design.md)을 참고한다.

Soniox에는 한국어 제한만 제공하며, 매 연결마다 텍스트 입력 비용이 발생하는 나라·수도 문맥 사전은 보내지 않는다. 사용량 로그에는 개인정보 없는 `flagquiz-rt:<UUID>`를 붙인다. 현재 문제의 정답이나 보기로 전사를 유도하지 않는다. `voice`·`capitalVoice`의 발화 종료 시점에서 이름으로 해석하지 못한 짧은 한국어 답도 브라우저로 전달해 소리 자모의 실제 편집거리 유사도 30%부터 관대하게 채점한다. 명확한 다른 이름, 질문·부정·포기·모호한 후보와 망설임만 있는 말은 기존 해석을 유지한다. 글자 입력과 `country-chain`에는 이 추가 채점 기준을 적용하지 않는다.

## 시작 설정

NAS용 [Compose](../deploy/compose.prod.yml)는 `AUTH_PROVIDER=techjuice-id`, `TJID_APP_SLUG=flagquiz`, `TJID_GOOGLE_ENABLED=false`를 사용한다. Google 버튼은 중앙 Google 로그인 검증 전까지 표시하지 않는다. 기존 `AUTH_PROVIDER=google` 경로는 호환용으로 남아 있지만 현재 NAS 배포의 로그인 방식은 아니다.

| 환경 변수 | 용도 |
| --- | --- |
| `PUBLIC_ORIGIN` | 경로가 없는 실제 HTTPS origin. HTTP는 localhost 개발 서버만 허용 |
| `TJID_SUPABASE_URL` | 기존 TechJuiceID 중앙 인증 서비스의 HTTPS 주소 |
| `TJID_SUPABASE_ANON_KEY` | 중앙 서비스의 공개/anon client key. Secret·service-role key는 사용하지 않음 |
| `TJID_APP_SLUG` | 중앙 앱 권한 이름, `flagquiz` |
| `SESSION_SECRET` | 최소 32바이트의 서버 세션 서명 키 |
| `STATE_DIR` | 정적 폴더 밖의 절대 경로. NAS에서는 `/var/lib/flagquiz` |
| `GROQ_API_KEY` | 서버 전용 전사 키. 없으면 수동 입력으로 놀이 가능 |
| `SONIOX_API_KEY` | 선택 설정, 서버 전용 실시간 인식 키. 설정되고 AudioWorklet을 지원하면 녹음 중 이름 확정 |
| `TYPESAFE_API_KEY` | 선택 설정, 기본값은 비어 있음. 서버 전용 Jev 최종 선택 보조 키 |

비밀은 1Password에서 실행 시 주입한다. `env/private.op.env`에서 중앙 연결·세션·Groq 값은 기존 참조를 사용하고, 비밀이 아닌 `PUBLIC_ORIGIN=https://flagquiz.techjuicelab.space`와 `STATE_DIR=/var/lib/flagquiz`는 명시한다. `FlagQuiz Private`의 빈 운영 주소·저장 경로 필드를 채울 필요는 없다. `npm run start:private`가 `op run`으로 참조를 해결한다. NAS에서는 1Password에서 해결한 배포용 사본을 Forgejo의 `APP_ENV_FILE` secret으로 전달한 운영 기록이 있다. 중앙 인증에는 service-role key나 앱 전용 Google client secret을 전달하지 않는다. 환경 변수에 `op://`가 문자 그대로 남으면 시작을 거절하고 오류에 참조나 비밀 값을 출력하지 않는다.

```sh
npm ci --ignore-scripts
npm run build
npm run start:private
```

직접 실행할 때 `STATIC_ROOT` 기본값은 `_site`, `HOST`는 `127.0.0.1`, `PORT`는 `8080`이다. NAS 컨테이너는 UID/GID `1000:1000`, `HOST=0.0.0.0`, 내부 `PORT=8090`, `/app/_site`를 사용하며 호스트 loopback `127.0.0.1:31015`와 `cf-web` 네트워크에 연결한다. `flagquiz-data` named volume을 `/var/lib/flagquiz`에 마운트한다. 배포·HTTPS 연결 절차는 [NAS 안내](../docs/nas-deploy.md)에 있다.

NAS 커널 `4.4.302+`는 [Node.js 24의 공식 Linux 지원 범위](https://github.com/nodejs/node/blob/v24.x/BUILDING.md)의 kernel 4.18 이상을 충족하지 않는다. 실제 NAS smoke 성공과 공식 지원 여부를 구분하며 운영 컨테이너 재시작·인증·백업까지 별도로 확인한다.

## 로그인과 접근 관리

서버가 아이디/이메일과 비밀번호를 중앙 인증 서비스에 전달하고 중앙 native JWKS로 JWT 서명을 검증한다. `iss`, `aud=authenticated`, 만료·발급 시각·`sub`, 인증된 비익명 `role`, `tj.disabled`, `tj.superadmin`, `tj.roles.flagquiz`를 확인한다. 중앙 최고 관리자가 아니면 `flagquiz`의 `admin`, `tester`, `user` 권한 중 하나가 필요하다. 브라우저가 보낸 이메일·역할이나 임의 Bearer token으로 앱 권한을 부여하지 않는다.

기존 활성 TechJuiceID 계정 전체에 중앙 `flagquiz` 권한을 부여했으며, 검증을 통과한 중앙 계정은 첫 접속 때 로컬 허용 목록에 자동 등록하고 중앙 `sub`에 고정한다. 아이디 계정의 합성 이메일은 계정 식별자이며 실제 메일 수신 확인을 뜻하지 않는다. 직접 Google 로그인용 Gmail/Workspace 제한은 이 중앙 계정 경로에 적용하지 않는다.

`techjuicelab@gmail.com`은 삭제하거나 바꿀 수 없는 로컬 `superadmin`이다. 다른 중앙 관리자도 FlagQuiz의 로컬 최고 관리자 권한을 자동으로 얻지 않는다. 최고 관리자는 ‘가족 계정’의 ‘세계 놀이 계정 접근’에서 기존 아이디 또는 이메일을 추가·해제한다. 해제하면 현재 세션을 삭제하고 `blockedEmails`에 차단 기록을 남겨 중앙 계정의 다음 자동 등록도 막는다. 다시 추가하면 차단 기록을 해제한다. 이메일 대소문자와 공백은 정규화하지만 별칭을 임의로 합치지 않는다.

서명된 `flagquiz_session` 쿠키는 HttpOnly·SameSite=Lax이며 HTTPS에서 Secure를 사용한다. Domain 속성이 없는 host-only 쿠키이고 TechJuiceID 로그인 시 이 기기에서 30일 동안 유지한다. 새 로그인 증명의 중앙 JWT 만료는 계속 검사하지만 앱 세션의 만료와 분리한다. 로그인 시점에서 30일 뒤에 만료하며 접속할 때마다 연장하지 않는다. 브라우저는 세션 식별자와 만료 시각이 담긴 서명 쿠키를 보관하고 NAS의 `access.json`에 같은 세션을 영속 저장하므로, 같은 기기의 브라우저를 다시 열거나 서버를 재시작해도 유효한 로그인은 유지된다. 중앙 토큰/refresh token이나 비밀번호를 브라우저 localStorage·세션 쿠키·영속 저장소에 복사하지 않는다. 호환용 `AUTH_PROVIDER=google` 직접 로그인은 기존 8시간을 유지한다.

변경 전에 발급한 짧은 쿠키는 자동 연장하지 않는다. 기존 세션이 만료되면 한 번 다시 로그인하여 30일 쿠키를 받는다. 로그아웃하면 이 기기의 쿠키와 NAS의 해당 세션을 폐기한다. `SESSION_SECRET`과 `flagquiz-data` volume은 재배포에서도 유지해야 한다.

로컬 세션·허용 목록은 매 요청 확인한다. 중앙 `disabled`와 session generation은 기본 60초 캐시로 확인하므로 일반 앱 요청에 중앙 변경이 반영되기까지 최대 60초 걸릴 수 있다. 관리 API와 유료 전사 호출 직전에는 최신 중앙 상태를 조회한다. 계정 비활성화나 generation 변경 시 로컬 세션을 폐기한다. 최신 조회가 실패하면 해당 요청의 접근을 닫으며, 로컬 로그아웃·관리자 해제는 즉시 적용한다. 중앙 앱 역할 변경은 다음 로그인부터 반영되는 중앙 계약이다. 기존 기기의 접근도 회수하려면 중앙 전체 기기 로그아웃으로 generation을 올리거나 FlagQuiz의 로컬 접근 해제를 함께 적용한다. 앱 서버에 중앙 service-role key를 추가하지 않는다.

| API | 방식 | 응답/요건 |
| --- | --- | --- |
| `/health` | GET | `{ok:true,configured}`. 실제 중앙 로그인·전사는 별도 검사 |
| `/api/auth/session` | GET | `{authenticated,email,role,csrfToken,expiresAt}`, 미인증이면 `{authenticated:false,configured}` |
| `/api/auth/password` | POST | 같은 Origin·서명된 로그인 form CSRF·아이디/이메일과 비밀번호 |
| `/api/auth/login`, `/api/auth/callback` | GET | 선택적 중앙 Google OAuth 경로. 현재 `TJID_GOOGLE_ENABLED=false` |
| `/api/auth/logout` | POST | 로그인·같은 Origin·`X-CSRF-Token` |
| `/api/admin/allowlist` | GET | 최신 중앙 상태·로컬 최고 관리자, `{members:[{email,sub,role,...}]}` |
| `/api/admin/allowlist` | POST/DELETE | 최신 중앙 상태·최고 관리자·같은 Origin·CSRF·JSON `{email}` 또는 `{identifier}` |
| `/api/speech` | POST | 로그인·같은 Origin·CSRF·고정 PCM WAV·최신 중앙 상태·사용량 한도 |

비밀번호 로그인은 유효한 폼·CSRF를 확인한 방문자 IP마다 5분에 30회, 입력 계정마다 5분에 10회로 제한한다. 앞단 입력 처리는 서버 전체에서 분당 300회로 제한한다. `TRUSTED_PROXY_IPS`에 지정한 정확한 소켓 IP의 유효한 단일 `CF-Connecting-IP`만 방문자 주소로 사용하며 `X-Forwarded-For`는 무시한다. NAS에서는 관찰한 프록시 peer `172.21.0.1`을 지정하고 서비스 포트를 loopback에 한정한다. 신뢰 목록이 비었거나 헤더·peer가 일치하지 않으면 소켓 IP를 사용한다.

앱·음원·응답의 HTTP 캐시는 `no-store, private`로 유지한다. 로그인한 앱에서는 NAS 전용 설정과 빌드된 공통 워커를 `/sw.js`로 제공해 앱 셸·국기·그림·읽어주기·음악을 Cache Storage에 저장한다. 워커 설치 전에 서버 세션을 확인하며, 오프라인 이용 증명에는 `authenticated`, `offline`, `expiresAt`만 저장한다. 이메일·관리자 역할·CSRF·음성 API 응답은 캐시하지 않는다. `/api/auth/session`의 실제 네트워크 실패에서만 기한 내 오프라인 응답을 제공하며, 서버의 명시적 인증 거절·만료·로그아웃에는 캐시를 폐기한다. 서버 API의 권한 검사는 그대로 적용하며 다른 기기에서 회수한 권한은 다음 온라인 확인 때 반영된다.

로그인 정리 스크립트는 해당 origin의 루트 `/sw.js` 등록과 `flagquiz-` cache만 정리한다. 학습 localStorage는 로그인·로그아웃 시 지우지 않는다. 오프라인 로그아웃은 기기의 앱 접근을 즉시 닫고, 재연결 때 서버 세션 폐기도 마친다. 오프라인 학습 기록은 기존처럼 이 기기의 localStorage에 저장한다. GitHub Pages는 NAS 진입과 이전 브라우저 기록 이동 화면을 제공한다. NAS 안에 기존 기록이 있으면 자동으로 덮어쓰지 않으며 사용자가 가져올 기록을 선택한다. 자세한 이전 경로와 오프라인 구버전의 전환 한계는 [NAS 안내](../docs/nas-deploy.md)에 있다.

홈 화면 설치용 메타데이터는 `GET`·`HEAD`의 정확한 공개 목록으로 제공한다: `/manifest.webmanifest`, `/assets/icon-180.png`, `/assets/icon-192.png`, `/assets/icon-512.png`, `/assets/icon-maskable-512.png`, `/assets/icon.svg`, `/assets/favicon.svg`. Safari의 기본 탐색 경로 `/apple-touch-icon.png`와 `/apple-touch-icon-precomposed.png`도 같은 180px PNG에 고정 매핑한다. 로그인 화면에도 같은 manifest와 180px `apple-touch-icon`, 설치 이름을 선언하므로 로그인 전 설치와 세션 만료 뒤 아이콘 요청이 인증 상태에 의존하지 않는다. 지정 파일만 공개하며 앱 HTML·JS·나라 데이터·음원·계정 및 유료 API에는 기존 인증을 유지한다. 공개 파일도 `no-store`·정확한 MIME·정적 경로 검증을 적용한다.

## 유료 말하기와 영속 저장

전사는 Groq `whisper-large-v3-turbo`를 고정 사용한다. 한국어 `ko`·JSON 응답과 160 UTF-8 바이트 이하의 짧은 나라 또는 수도 말하기 힌트를 보낸다. 힌트에는 현재 문제의 나라·수도 정답을 넣지 않는다. STT는 최종 문자를 반환하고, 공유 `js/spoken-answer.js`가 실제 이름·별칭과 정정 표현으로 최종 선택을 찾은 뒤 브라우저의 기존 채점 엔진에 정식 이름 하나를 전달한다. 현재 문제 정답을 기준으로 전사에서 원하는 이름을 골라 넣지 않는다. 시간당 $0.04, 요청당 최소 10초 과금이며 월 3,000회 × 최대 12초는 약 $0.40의 전사 비용에 해당한다(무료 크레딧·세금 제외, 2026-10-03 기준의 계산이며 이번 변경에서 요금은 재검증하지 않았다). 실제 어린이 발화 정확도는 별도 검증이 필요하다. [공식 규격·요금](https://console.groq.com/docs/speech-to-text).

브라우저는 `getUserMedia`·`MediaRecorder`로 받은 짧은 녹음을 메모리에서 WAV로 변환하고 같은 origin의 `/api/speech`에 보낸다. `Content-Type: audio/wav`, 실제 길이에 맞춘 `X-Audio-Duration-Ms`, `X-Speech-Mode`(`voice`·`capitalVoice`·`country-chain`), `X-Player-Id`, `X-Turn-Id`, `X-CSRF-Token`과 세션 쿠키를 사용한다. 요청의 이름이나 차례를 인증 증거로 쓰지 않으며 서버가 세션·Origin·CSRF·최신 중앙 상태를 검사한다. 성공 응답은 STT 원문 `text`, `mode`, 대응 `playerId`·`turnId`, 사용량과 `resolution`을 반환한다. `resolution`의 필드는 `status`(`answer`·`retry`·`giveup`), `code` 또는 `null`, 선택한 정식 이름 `text`, `reason`, `source`(`rules`·`jev`)다. 원문은 유지하며 별도 선택 결과에 현재 정답을 섞지 않는다. 브라우저는 자체 규칙과 실제 후보를 다시 검사하고 이미 취소하거나 떠난 문제의 늦은 응답을 버린다.

`server/answer-resolution.mjs`는 서버에서 같은 순수 규칙을 먼저 실행한다. 선택 설정 `TYPESAFE_API_KEY`가 있으면 명확한 답과 최종 선택이 있는 복잡한 문장 모두 실제 후보 안에서 Jev `Choice`로 확인한다. `jev-1.13.0`을 고정하며 최대 3초·전사당 최대 한 번이고 자동 재시도하지 않는다. 부정·인용·선택 미정·질문·지시 조작·단순 나열은 모델 선택으로 덮지 않는다. 키 미설정, 장애, 시간 초과, 형식·확률 검증 실패와 후보 밖 응답은 기존 규칙 결과를 유지하며 명시적으로 확정한 답도 다른 앞선 후보로 바꾸지 않는다. 유료 선택 직전 fresh 권한 확인은 실제 모델 호출에만 수행하고 권한 오류는 fallback으로 삼키지 않는다. 출제 정답·보기·이미지·아이 이름·계정은 Jev에 전달하지 않는다. 인증된 응답의 `Server-Timing`에는 authorization·speech·selection-auth·selection의 숫자만 기록하며 selection은 selection-auth를 포함하므로 단순 합산하지 않는다. [최종 답 설계와 공식 TypeSafe 근거](../docs/spoken-answer-intent.md)에 모델 고정·보수적 기준·한계를 정리했다.

`TYPESAFE_API_KEY`는 기본값이 비어 있고 Compose도 미설정 상태를 허용한다. 서버 실행 시 1Password에서 주입하며 브라우저·빌드·로그·학습 기록에 저장하지 않는다. [합성 비교](../docs/spoken-answer-intent.md#확인-범위)와 별도로 NAS run `585`의 SHA `57810302aa60beb912500fe822e144f921676f9f`에서 세 말하기 모드의 합성 음원 3개가 실제 Groq → Jev 경로로 올바른 이름과 `source:jev`를 반환했다. 이는 운영 키 연결과 서버 경로 검증이며 실제 어린이 발화 정확도를 뜻하지 않는다. 말끝 이후 전체 지연은 추정 1.18–1.48초로 목표 미달이며 [측정 구간과 스트리밍 후속 설계](../docs/streaming-speech-design.md)에 한계를 기록했다. 키가 없어도 Groq STT와 순수 최종 답 규칙은 동작한다.

권한·연결·사용량 오류에는 현재 문제·차례를 유지하고 글자 입력과 수동 마이크 재시도를 제공한다. 실패한 유료 요청은 자동 재시도하지 않는다. 말하기 시도의 제한시간은 실제 녹음 중에 측정하고 권한·녹음 정리·전사 대기 중에는 멈춘다. 수동 입력이나 재시도로 돌아오면 기존 남은 시간을 이어 쓴다. 연결이 완전히 끊기면 기존 동일 문제 선택형 전환을 사용한다. localhost 정적 `?preview=1`에는 인증된 STT를 연결하지 않는다.

녹음은 메모리에서만 처리한다. 서버가 16kHz·16bit·단일 채널 WAV의 실제 표본 수로 최대 12초·2MiB를 검사한 뒤 사용자당 UTC 하루 120회, 서비스 전체 UTC 월 3,000회를 먼저 영속 예약한다. 최고 관리자도 같은 한도이며 실패·취소 시 환불하거나 자동 재시도하지 않는다. 사용자당 한 요청, 전체 네 요청만 동시에 처리한다. 이름·player ID·turn ID는 권한과 비용 사용량 식별에 사용하지 않는다.

`STATE_DIR/access.json`에는 허용 목록·중앙 `sub` 연결·차단 기록·세션 generation·사용량을 저장한다. 임시 파일 `fsync` → 원자적 rename → 디렉터리 `fsync` 후 성공을 반환하며 파일은 0600, 상태 디렉터리는 0700으로 준비한다. 손상·쓰기 실패 시 접근을 닫고 빈 파일로 덮어쓰지 않는다. Node 내장 SQLite의 배타적 OS guard와 프로세스 내부 소유 목록으로 같은 상태 디렉터리의 두 서버 실행을 막는다. SIGKILL/재부팅 뒤 OS guard가 해제되면 오래된 PID 파일을 정리해 재시작할 수 있다. SQLite 파일은 잠금용이며 원본 데이터는 `access.json`이다. 네트워크 파일시스템 대신 NAS의 로컬 Docker volume을 사용한다.

백업 작업만 `flagquiz-data`를 읽기 전용으로, `flagquiz-backups`를 `/var/backups/flagquiz`에 쓰기 가능하게 마운트한다. 운영 web에는 백업 volume을 붙이지 않으며 백업 컨테이너에 로그인·Groq 키를 전달하지 않는다. 원자적 JSON snapshot을 매번 별도 임시 디렉터리에 복원하여 재시작·쓰기·단일 프로세스 guard를 검사한 뒤 보관한다. 일간 14개·일요일 주간 8개·매월 1일 월간 12개를 유지하고 파일 0600·디렉터리 0700, 공개 배포 SHA 등 metadata만 출력한다.

```sh
node scripts/verify-private-state.mjs --source /var/lib/flagquiz/access.json
node scripts/backup-private-state.mjs --source /var/lib/flagquiz/access.json --destination /var/backups/flagquiz
```

Forgejo 운영 backup run `576`에서 백업·별도 대상 복원·단일 writer·재시작·사용량 보존을 확인했다. 예약 백업의 첫 일정 실행과 실패 알림은 [운영 기록](../docs/nas-deploy.md)에 아직 미확인으로 남아 있다. 같은 NAS의 백업은 장비 전체 장애를 해결하지 못한다. 암호화된 외부 사본은 아직 설정하지 않았다. 복구는 별도 승인 후 운영 서버를 멈추고 검증된 snapshot을 별도 volume에 복원·검사하며 기존 volume을 기본 삭제하지 않는다.

Snapshot을 그대로 연결하면 그 이후 로그아웃·로컬 차단·사용량 예약도 과거로 돌아간다. 복원 대상의 전체 세션을 폐기하고 최신 중앙 `disabled`·session generation·`flagquiz` 권한 및 로컬 `blockedEmails`와 대조한다. 이후 해제한 계정이 다시 자동 등록되지 않는지 확인하고, 현재 UTC 월·일의 누락된 사용량을 검증 가능한 기록으로 보수적으로 보정한다. 누락분을 확인할 수 없으면 한도 여유를 임의로 복구하지 않고 유료 호출을 보류한다. 이 검토와 별도 대상 검증이 끝날 때까지 운영 트래픽과 유료 음성 키를 연결하지 않는다.

## 검사와 남은 운영 확인

```sh
node --test tests/auth-backend.test.mjs tests/auth-tjid-http.test.mjs tests/techjuice-id.test.mjs tests/auth-store.test.mjs tests/private-state.test.mjs tests/speech-api.test.mjs tests/cloud-speech.test.mjs tests/auth-ui.test.mjs
```

검사는 실제 HTTP·JWT 서명·중앙 권한과 상태 장애·Origin/CSRF·세션 해제·로컬 차단·원자적 사용량·강제 종료 복구·별도 대상 백업 복원을 다루며 중앙 인증/Groq 응답은 격리한다. 기존 Groq 키로 대한민국 음원을 전사한 사전 검사와, 최초 운영 서버에서 합성 대한민국 WAV를 실제 Groq에 전송한 1회 검사는 별도의 기록이다. 실제 어린이 목소리의 기기 검사를 뜻하지 않는다.

최초 운영 서버의 로그인·외부 HTTPS·인증되지 않은 앱/API 접근 차단·로그아웃 쿠키 폐기, 실제 Groq 전사, 운영 백업·별도 복원, 서버 재시작 후 상태와 사용량 보존은 [배포 증거](../docs/nas-deploy.md#최초-성공-운영-기록)에 있다. 후속 run `585`에서는 실제 세 모드 합성 음원·Jev 선택·기존 인증 세션 유지·운영 JS 일치를 별도로 확인했다. iPhone/iPad의 실제 어린이 발화, 인식 지연, 마이크 권한 거부와 재시도, 지연 응답·화면 이동 취소, 예약 백업·외부 암호화 사본은 기존 검사와 구분해 확인한다. 자동 검사만으로 운영 배포나 실제 기기 정확도를 완료로 표시하지 않는다.
