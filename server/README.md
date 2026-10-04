# 비공개 앱 서버

Node.js 24 이상으로 `_site`를 로그인 뒤에서 제공한다. NAS 구성의 기본 인증은 `TechJuiceID`이며, 다른 TechJuice 앱에서 사용하는 아이디 또는 이메일과 같은 비밀번호로 로그인한다. 비밀번호를 FlagQuiz 저장소에 추가로 저장하지 않는다. 기존 7개 앱과 계정은 같지만 세션 쿠키를 공유하거나 복사하지 않는다.

2026-10-03 기준 중앙 `flagquiz` 앱을 ‘세계 놀이’로 등록하고 기존 활성 계정 17개 모두에 앱 권한을 부여했다(`user` 16개, 기존 TECH 관리자 1개). 비활성·익명 계정은 제외했고 다른 앱 설정은 변경하지 않았다. [NAS 최초 성공 운영 기록](../docs/nas-deploy.md#최초-성공-운영-기록)에 실제 배포, DNS·Cloudflare·외부 HTTPS, 중앙 관리자·일반 계정 로그인, 운영 Groq 전사, 백업·별도 복원 및 재시작 후 상태 유지 검증이 있다. 외부 주소는 `https://flagquiz.techjuicelab.space`, NAS loopback 포트는 `31015`다. `/health`의 `configured:true`는 설정 검사를 뜻하며 실제 로그인이나 전사 성공을 보장하지 않는다.

국기 보고 나라 말하기(`voice`)·국기 보고 수도 말하기(`capitalVoice`)·나라 이어 말하기(`country-chain`)를 모두 같은 NAS Groq STT로 연결한다. 이번 경로 통합의 운영 배포와 실제 iPhone/iPad 어린이 발화 정확도·지연은 위 최초 성공 기록과 별개의 검증 대상이다. [말하기 설계와 검증 범위](../docs/spoken-stt.md)를 참고한다.

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
| `TYPESAFE_API_KEY` | 선택 설정, 기본값은 비어 있음. 서버 전용 Jev 최종 선택 보조 키 |

비밀은 1Password에서 실행 시 주입한다. `env/private.op.env`에서 중앙 연결·세션·Groq 값은 기존 참조를 사용하고, 비밀이 아닌 `PUBLIC_ORIGIN=https://flagquiz.techjuicelab.space`와 `STATE_DIR=/var/lib/flagquiz`는 명시한다. `FlagQuiz Private`의 빈 운영 주소·저장 경로 필드를 채울 필요는 없다. `npm run start:private`가 `op run`으로 참조를 해결한다. NAS에서는 1Password에서 해결한 배포용 사본을 Forgejo의 `APP_ENV_FILE` secret으로 전달한 운영 기록이 있다. 중앙 인증에는 service-role key나 앱 전용 Google client secret을 전달하지 않는다. 환경 변수에 `op://`가 문자 그대로 남으면 시작을 거절하고 오류에 참조나 비밀 값을 출력하지 않는다.

```sh
npm run build
npm run start:private
```

직접 실행할 때 `STATIC_ROOT` 기본값은 `_site`, `HOST`는 `127.0.0.1`, `PORT`는 `8080`이다. NAS 컨테이너는 UID/GID `1000:1000`, `HOST=0.0.0.0`, 내부 `PORT=8090`, `/app/_site`를 사용하며 호스트 loopback `127.0.0.1:31015`와 `cf-web` 네트워크에 연결한다. `flagquiz-data` named volume을 `/var/lib/flagquiz`에 마운트한다. 배포·HTTPS 연결 절차는 [NAS 안내](../docs/nas-deploy.md)에 있다.

NAS 커널 `4.4.302+`는 [Node.js 24의 공식 Linux 지원 범위](https://github.com/nodejs/node/blob/v24.x/BUILDING.md)의 kernel 4.18 이상을 충족하지 않는다. 실제 NAS smoke 성공과 공식 지원 여부를 구분하며 운영 컨테이너 재시작·인증·백업까지 별도로 확인한다.

## 로그인과 접근 관리

서버가 아이디/이메일과 비밀번호를 중앙 인증 서비스에 전달하고 중앙 native JWKS로 JWT 서명을 검증한다. `iss`, `aud=authenticated`, 만료·발급 시각·`sub`, 인증된 비익명 `role`, `tj.disabled`, `tj.superadmin`, `tj.roles.flagquiz`를 확인한다. 중앙 최고 관리자가 아니면 `flagquiz`의 `admin`, `tester`, `user` 권한 중 하나가 필요하다. 브라우저가 보낸 이메일·역할이나 임의 Bearer token으로 앱 권한을 부여하지 않는다.

기존 활성 TechJuiceID 계정 전체에 중앙 `flagquiz` 권한을 부여했으며, 검증을 통과한 중앙 계정은 첫 접속 때 로컬 허용 목록에 자동 등록하고 중앙 `sub`에 고정한다. 아이디 계정의 합성 이메일은 계정 식별자이며 실제 메일 수신 확인을 뜻하지 않는다. 직접 Google 로그인용 Gmail/Workspace 제한은 이 중앙 계정 경로에 적용하지 않는다.

`techjuicelab@gmail.com`은 삭제하거나 바꿀 수 없는 로컬 `superadmin`이다. 다른 중앙 관리자도 FlagQuiz의 로컬 최고 관리자 권한을 자동으로 얻지 않는다. 최고 관리자는 ‘가족 계정’의 ‘세계 놀이 계정 접근’에서 기존 아이디 또는 이메일을 추가·해제한다. 해제하면 현재 세션을 삭제하고 `blockedEmails`에 차단 기록을 남겨 중앙 계정의 다음 자동 등록도 막는다. 다시 추가하면 차단 기록을 해제한다. 이메일 대소문자와 공백은 정규화하지만 별칭을 임의로 합치지 않는다.

서명된 `flagquiz_session` 쿠키는 HttpOnly·SameSite=Lax이며 HTTPS에서 Secure를 사용한다. Domain 속성이 없는 host-only 쿠키이고 세션 만료는 중앙 JWT 만료와 8시간 중 빠른 시점이다. 중앙 토큰 수명이 보통 1시간이면 FlagQuiz 세션도 그 범위를 넘지 않는다. 중앙 토큰/refresh token을 브라우저 세션 쿠키나 영속 저장소에 복사하지 않는다.

로컬 세션·허용 목록은 매 요청 확인한다. 중앙 `disabled`와 session generation은 기본 60초 캐시로 확인하므로 일반 앱 요청에 중앙 변경이 반영되기까지 최대 60초 걸릴 수 있다. 관리 API와 유료 전사 호출 직전에는 최신 중앙 상태를 조회한다. 계정 비활성화나 generation 변경 시 로컬 세션을 폐기한다. 최신 조회가 실패하면 해당 요청의 접근을 닫으며, 로컬 로그아웃·관리자 해제는 즉시 적용한다.

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

앱·음원·응답은 `no-store, private`로 제공하고 인증된 앱 복사본을 PWA 오프라인 캐시에 보관하지 않는다. 공개 `/sw.js`와 로그인 정리 스크립트는 해당 origin의 루트 `/sw.js` 등록과 `flagquiz-` cache만 정리한다. 학습 localStorage는 로그인·로그아웃 시 지우지 않는다. GitHub Pages는 NAS 진입과 이전 브라우저 기록 이동 화면을 제공한다. NAS 안에 기존 기록이 있으면 자동으로 덮어쓰지 않으며 사용자가 가져올 기록을 선택한다. 자세한 이전 경로와 오프라인 구버전의 전환 한계는 [NAS 안내](../docs/nas-deploy.md)에 있다.

## 유료 말하기와 영속 저장

전사는 Groq `whisper-large-v3-turbo`를 고정 사용한다. 한국어 `ko`·JSON 응답과 160 UTF-8 바이트 이하의 짧은 나라 또는 수도 말하기 힌트를 보낸다. 힌트에는 현재 문제의 나라·수도 정답을 넣지 않는다. STT는 최종 문자를 반환하고, 공유 `js/spoken-answer.js`가 실제 이름·별칭과 정정 표현으로 최종 선택을 찾은 뒤 브라우저의 기존 채점 엔진에 정식 이름 하나를 전달한다. 현재 문제 정답을 기준으로 전사에서 원하는 이름을 골라 넣지 않는다. 시간당 $0.04, 요청당 최소 10초 과금이며 월 3,000회 × 최대 12초는 약 $0.40의 전사 비용에 해당한다(무료 크레딧·세금 제외, 2026-10-03 기준의 계산이며 이번 변경에서 요금은 재검증하지 않았다). 실제 어린이 발화 정확도는 별도 검증이 필요하다. [공식 규격·요금](https://console.groq.com/docs/speech-to-text).

브라우저는 `getUserMedia`·`MediaRecorder`로 받은 짧은 녹음을 메모리에서 WAV로 변환하고 같은 origin의 `/api/speech`에 보낸다. `Content-Type: audio/wav`, 실제 길이에 맞춘 `X-Audio-Duration-Ms`, `X-Speech-Mode`(`voice`·`capitalVoice`·`country-chain`), `X-Player-Id`, `X-Turn-Id`, `X-CSRF-Token`과 세션 쿠키를 사용한다. 요청의 이름이나 차례를 인증 증거로 쓰지 않으며 서버가 세션·Origin·CSRF·최신 중앙 상태를 검사한다. 성공 응답은 STT 원문 `text`, `mode`, 대응 `playerId`·`turnId`, 사용량과 `resolution`을 반환한다. `resolution`의 필드는 `status`(`answer`·`retry`·`giveup`), `code` 또는 `null`, 선택한 정식 이름 `text`, `reason`, `source`(`rules`·`jev`)다. 원문은 유지하며 별도 선택 결과에 현재 정답을 섞지 않는다. 브라우저는 자체 규칙과 실제 후보를 다시 검사하고 이미 취소하거나 떠난 문제의 늦은 응답을 버린다.

`server/answer-resolution.mjs`는 서버에서 같은 순수 규칙을 먼저 실행한다. 명확한 결과는 외부 선택 호출 없이 사용한다. 선택 설정 `TYPESAFE_API_KEY`가 있을 때만 규칙이 미해석한 복잡한 문장의 실제 복수 후보와 명시적 최종 선택을 Jev `Choice`로 보조한다. `jev-1.13.0`을 고정하며 최대 3초·전사당 최대 한 번이고 자동 재시도하지 않는다. 부정·인용·선택 미정·질문·지시 조작·단순 나열은 보조 결과로 덮지 않는다. 키 미설정, 장애, 시간 초과, 형식·확률 검증 실패와 후보 밖 응답은 규칙의 재질문을 유지한다. 출제 정답·보기·이미지·아이 이름·계정은 Jev에 전달하지 않는다. [최종 답 설계와 공식 TypeSafe 근거](../docs/spoken-answer-intent.md)에 모델 고정·보수적 기준·한계를 정리했다.

`TYPESAFE_API_KEY`는 기본값이 비어 있고 Compose도 미설정 상태를 허용한다. 서버 실행 시 1Password에서 주입하며 브라우저·빌드·로그·학습 기록에 저장하지 않는다. 이번 작업에서는 이 키를 연결하지 않았고 실제 Jev API 호출과 응답 정확도는 검증하지 않았다. 키가 없어도 Groq STT와 순수 최종 답 규칙은 동작한다.

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

최초 운영 서버의 로그인·외부 HTTPS·인증되지 않은 앱/API 접근 차단·로그아웃 쿠키 폐기, 실제 Groq 전사, 운영 백업·별도 복원, 서버 재시작 후 상태와 사용량 보존은 [배포 증거](../docs/nas-deploy.md#최초-성공-운영-기록)에 있다. 이번 STT 통합은 별도 배포 SHA로 운영 화면과 세 말하기 모드의 인식 경로를 검증해야 한다. iPhone/iPad의 실제 어린이 발화, 인식 지연, 마이크 권한 거부와 재시도, 지연 응답·화면 이동 취소, 예약 백업·외부 암호화 사본은 기존 검사와 구분해 확인한다. 자동 검사만으로 운영 배포나 실제 기기 정확도를 완료로 표시하지 않는다.
