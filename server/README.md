# 비공개 앱 서버

Node.js 24 이상으로 `_site`를 로그인 뒤에서 제공한다. Google OAuth 자격 증명과 영속 저장 경로가 준비되지 않으면 앱 파일과 유료 API는 열리지 않는다. 기존 1Password Google OAuth 참조 주입과 실제 Groq 나라 이름 음원 전사를 확인했다. 실제 Google 로그인·callback 등록·운영 배포는 아직 완료되지 않았다.

운영에서는 HTTPS 도메인을 이 서버의 reverse proxy에 연결하고 `STATE_DIR`를 서버 재시작 후에도 남는 로컬 디스크 또는 Docker volume에 연결한다. 동일 `STATE_DIR`는 서버 프로세스 하나만 사용한다. GitHub Pages의 정적 파일 배포는 서버 세션으로 보호할 수 없으므로 공개 배포를 종료하고 비공개 서버 주소를 사용해야 한다.

로그인 시작은 서버가 직접 본 소켓 IP마다 5분에 10회로 제한한다. Reverse proxy 뒤에서는 여러 사용자의 소켓 IP가 프록시 IP 하나가 되어 이 한도를 공유할 수 있다. 현재 서버는 `X-Forwarded-For`를 신뢰하지 않는다. 운영 프록시를 정한 뒤 신뢰할 프록시 범위와 실제 사용자 IP별 제한을 검증하고 조정해야 한다.

## 시작 설정

`PUBLIC_ORIGIN`은 실제 HTTPS origin이고 경로를 붙이지 않는다. Google Cloud의 웹 OAuth client에 다음 redirect URI를 정확히 등록한다.

```text
https://운영-도메인/api/auth/callback
```

필수 런타임 값은 `PUBLIC_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, 최소 32바이트 `SESSION_SECRET`, 절대 경로 `STATE_DIR`다. `STATE_DIR`는 `_site` 밖에 있어야 한다. `STATIC_ROOT` 기본값은 저장소의 `_site`, `HOST` 기본값은 `127.0.0.1`, `PORT` 기본값은 `8080`이다. Container 안에서는 `HOST=0.0.0.0`으로 실행하고 외부 공개는 HTTPS proxy를 거친다.

비밀 값은 1Password에 보관하고 저장소에는 검증한 `op://` 참조만 둔다. `env/private.op.env`의 참조를 실제 준비한 항목에 연결한 뒤 실행한다. Google ID·Secret은 기존 `Private` 보관함 항목의 ID 기반 참조로 재사용한다. 기존 웹 OAuth client의 redirect 목록에 이 앱의 callback을 추가하되 기존 URI와 secret은 유지한다. Groq API 키도 기존 `AI Automation` 항목에서 참조한다. `FlagQuiz Private`의 운영 주소·저장 경로를 준비해야 전체 환경 파일이 해결된다.

```sh
npm run build
op run --env-file=env/private.op.env -- node server/auth-server.mjs
```

`GROQ_API_KEY`가 없으면 로그인한 가족도 유료 말하기 API를 사용할 수 없고, 수동으로 문제를 계속 풀 수 있다. OAuth 자격 증명을 생략하면 `/health`, 로그인 화면, 미인증 `/api/auth/session`만 제공하여 설정 전 접근을 막는다. HTTP는 `localhost` 개발 서버에만 허용한다.

환경 변수에 `op://` 참조가 문자 그대로 남아 있으면 서버 시작을 거절한다. 참조 템플릿을 일반 dotenv 파일처럼 읽는 것으로는 설정이 완료되지 않으며 반드시 `op run`으로 실제 런타임 값을 주입해야 한다. 이 오류에 참조나 비밀 값을 출력하지 않는다.

## 로그인과 이메일 관리

Google authorization code를 서버에서 교환하고 RSA 공개 키로 ID token 서명과 `iss`, `aud`, `azp`, `exp`, `iat`, `sub`, `email_verified`, `nonce`를 검증한다. `state`는 브라우저의 서명된 HttpOnly 쿠키와 서버의 일회용 로그인 요청이 일치해야 한다. PKCE verifier와 OAuth secret은 브라우저 코드에 전달하지 않는다. [Google의 서버 로그인 절차](https://developers.google.com/identity/openid-connect/openid-connect), [ID token 검증 안내](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)를 기준으로 구현했다.

`techjuicelab@gmail.com`은 변경하거나 삭제할 수 없는 `superadmin`이다. 최초로 검증된 Google `sub`에 연결하며 같은 이메일을 가진 다른 `sub`는 거절한다. 관리자가 등록한 일반 이메일도 첫 로그인에서 `sub`에 연결한다. 이메일은 공백과 대소문자만 정규화하고 Gmail 별칭은 임의로 합치지 않는다.

로그인은 Gmail 또는 검증된 `hd`가 이메일 도메인과 일치하는 Google Workspace 계정만 지원한다. 다른 외부 메일로 만든 Google 계정은 `email_verified=true`여도 현재 메일 소유자가 바뀌었을 수 있으므로 받지 않는다. 관리자는 Workspace 사용자 정의 도메인을 등록할 수 있지만, 해당 메일이 실제 Workspace 계정인지 로그인 때 검증한다. 외부 메일의 별도 인증 서비스는 구현하지 않았다.

세션은 8시간 유지되는 서명된 HttpOnly·SameSite=Lax 쿠키로 식별한다. 운영 HTTPS에서는 Secure 속성을 사용한다. 이메일·권한·세션 유효성은 서버의 영속 저장소에서 매 요청 다시 확인한다. 허용 목록 삭제와 로그아웃은 기존 세션도 즉시 차단한다. 서버는 요청 헤더에 적힌 이메일이나 임의 Bearer token을 사용하지 않는다.

| API | 방식 | 응답/요건 |
| --- | --- | --- |
| `/api/auth/session` | GET | `{authenticated,email,role,csrfToken,expiresAt}`, 미인증이면 `{authenticated:false,configured}` |
| `/api/auth/login` | GET | Google 로그인으로 이동 |
| `/api/auth/callback` | GET | Google code/state 검증 후 앱으로 이동 |
| `/api/auth/logout` | POST | 로그인·동일 Origin·`X-CSRF-Token` |
| `/api/admin/allowlist` | GET | 최고 관리자만 `{members:[{email,sub,role,...}]}` |
| `/api/admin/allowlist` | POST/DELETE | 최고 관리자·동일 Origin·CSRF·JSON `{email}` |
| `/api/speech` | POST | 로그인·동일 Origin·CSRF·고정 PCM WAV·사용량 한도 |

앱·음원·응답은 `no-store, private`로 제공한다. 공개 `/sw.js`는 이전 PWA를 정리하는 worker만 제공하고 로그인 화면도 이전 FlagQuiz cache를 정리한다. 로그인한 앱의 오프라인 캐시는 사용하지 않는다. 클라이언트 학습 기록은 로그인/로그아웃 시 지우지 않는다.

## 유료 말하기와 저장

기본 모델은 Groq `whisper-large-v3-turbo`다. 한국어 `ko`와 JSON 응답을 사용하고 224토큰 한도 안의 짧은 맞춤법 힌트를 보낸다. 시간당 $0.04, 요청당 최소 10초 과금이며 월 3,000회 × 최대 12초는 약 $0.40의 전사 비용에 해당한다(무료 크레딧·세금 제외, 2026-10-03 기준). 실제 어린이 나라 이름 정확도는 운영 연결 후 검증해야 한다. [공식 규격·요금](https://console.groq.com/docs/speech-to-text).

음성은 메모리에서만 처리한다. 실제 WAV 길이를 검사한 뒤 사용자당 UTC 하루 120회, 전체 서비스 UTC 월 3,000회를 디스크에 먼저 예약하고 Groq를 호출한다. 최고 관리자도 같은 한도를 적용한다. 호출이 실패하거나 취소되어도 예약을 환불하지 않아 비용 상한을 유지한다. 사용자당 한 요청, 전체 네 요청만 동시에 처리한다. 클라이언트의 이름·player ID·turn ID는 권한과 사용량 식별에 사용하지 않는다.

허용 목록·Google sub 연결·세션·사용량은 `STATE_DIR/access.json`에 저장한다. 파일 쓰기는 임시 파일 `fsync` → 원자적 rename → 디렉터리 `fsync` 후에 성공으로 반환한다. 손상되거나 쓰기에 실패한 저장소는 접근을 닫고 빈 파일로 덮어쓰지 않는다. 저장 파일 권한은 0600이다.

Node 내장 SQLite의 배타적 OS 잠금과 프로세스 내부 소유 목록으로 동시 서버를 막는다. SIGKILL/재부팅 뒤에는 OS 잠금이 풀리고 오래된 PID 파일을 guard 안에서 정리한다. 살아 있는 다른 PID의 이전 서버 잠금은 거절한다. 외부 npm DB/잠금 패키지는 필요하지 않으며 네트워크 파일시스템 대신 로컬 디스크 volume을 사용한다. [Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html), [SQLite 파일 잠금](https://www.sqlite.org/lockingv3.html)을 참고했다.

## 검사

```sh
node --test tests/auth-backend.test.mjs tests/speech-api.test.mjs tests/cloud-speech.test.mjs tests/auth-ui.test.mjs
```

검사는 실제 HTTP·RSA 서명·허용 목록·Origin/CSRF·세션 취소·원자적 한도·프로세스 강제 종료 복구를 확인하고 Google/Groq 응답은 격리한다. 기존 Groq 키로 대한민국 음원을 1회 전사하여 나라 판정까지 확인했다. 운영 준비 후에는 실제 Google 계정 로그인, 관리자의 이메일 추가/삭제, 세션 즉시 해제, 아이의 실제 짧은 음성과 한도 응답을 별도로 확인해야 한다.
