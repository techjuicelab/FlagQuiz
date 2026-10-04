# NAS 운영 배포

Forgejo `techjuice/flagquiz`의 `main`을 NAS에 배포한다. 기존 GitHub `origin`은 유지하고 Forgejo는 별도 remote로 연결한다. Forgejo Actions의 `deploy` runner는 NAS Docker 소켓을 사용하므로 배포 워크플로와 `main` 변경은 운영 관리자 권한으로 검토한다.

2026-10-03 NAS 전체 이미지 `flagquiz:build-check`(`d2b366557e36`)의 빌드와 Compose 구성 검사를 완료했다. 로컬 Node 테스트 541개가 통과했고, NAS에서는 540개 통과·macOS 전용 이미지 도구 검사 1개 제외·실패 0개였다. 기존 통합 10,028개와 엄격 검사 36개도 NAS에서 통과했다. 문서 근거 파일이 빠진 검증용 사본은 엄격 검사에서 종료 코드 1로 차단되는 것을 확인했다.

NAS의 격리 컨테이너에서 UID 1000·읽기 전용 루트·빈 볼륨 보호·권한 회수·재시작 후 사용량과 세대 보존·백업·별도 대상 복원을 확인했다. 이 검사는 임시 합성 데이터로 수행했으며 운영 데이터 볼륨과 실제 서비스는 생성하지 않았다. 1Password CLI 조회 시간 초과로 런타임 비밀 주입이 대기 중이다. Forgejo 배포 run·DNS/Cloudflare 경로·외부 실제 계정 로그인·마이크·운영 예약 백업은 아직 확인 전이다. 운영자는 아래 확인을 마친 뒤 배포 SHA와 성공 시각을 기록한다.

## 운영 계약

| 항목 | 값 |
| --- | --- |
| Compose project / 이미지 이름 | `flagquiz` |
| 실행 서비스 | `web` 한 개, UID/GID `1000:1000` |
| NAS loopback 포트 → 컨테이너 포트 | `127.0.0.1:31015` → `8090` |
| 외부 URL | `https://flagquiz.techjuicelab.space` |
| Cloudflare 경로 | HTTP `localhost:31015` |
| 네트워크 | 기존 외부 네트워크 `cf-web` |
| 운영 데이터 | `flagquiz-data` → `/var/lib/flagquiz` |
| 별도 백업 | `flagquiz-backups` → `/var/backups/flagquiz`, 백업 서비스에만 연결 |
| 정상 판정 | `/health`의 HTTP 성공, `ok: true`, `configured: true` |
| 종료 유예 | 30초 |
| 배포 관리 표식 | `deployed-by=forgejo-actions` |

포트, runner, 네트워크, Cloudflare 경로는 첫 배포 직전에 실제 상태를 확인한다. 위 URL은 설정 대상이며, 파일 작성만으로 DNS·Cloudflare 경로가 연결되지는 않는다. `/health`는 필수 설정과 서버 기동 상태를 확인하며 TechJuice ID 로그인 성공이나 Groq의 실제 인식 성공까지 보증하지 않는다.

앱은 프로젝트의 Node 24 요구를 유지하며 `node:24-bookworm-slim`으로 빌드한다. 공식 이미지의 `amd64` 지원과 UID/GID 1000은 [Node Dockerfile](https://github.com/nodejs/docker-node/blob/main/24/bookworm-slim/Dockerfile)에서 확인할 수 있다. Node 24의 Linux x64 공식 기준은 kernel 4.18 이상·glibc 2.28 이상이다. 2026-10-03 NAS의 kernel `4.4.302+`에서 이미지의 Node `v24.18.0`, `node:sqlite`, `fetch` 기동 검사를 통과했다. 이 결과는 해당 환경의 일차 동작 확인이며 공식 지원 범위를 바꾸지는 않는다. 이미지 갱신 후 같은 검사를 다시 수행한다. [Node 24 플랫폼 기준](https://github.com/nodejs/node/blob/v24.x/BUILDING.md), [지원 릴리스](https://nodejs.org/en/about/previous-releases).

## 설정 전달

1Password가 원본이며 Forgejo의 저장소 secret `APP_ENV_FILE`은 배포용 사본이다. 해결된 값을 로그·채팅·Git에 남기지 않는다. 환경 파일의 필수 이름은 아래와 같다.

```text
AUTH_PROVIDER=techjuice-id
PUBLIC_ORIGIN=https://flagquiz.techjuicelab.space
TJID_SUPABASE_URL=<TechJuice ID Supabase URL>
TJID_SUPABASE_ANON_KEY=<TechJuice ID 공개 anon key>
TJID_APP_SLUG=flagquiz
TJID_GOOGLE_ENABLED=false
TRUSTED_PROXY_IPS=172.21.0.1
SESSION_SECRET=<32바이트 이상의 서버 비밀>
GROQ_API_KEY=<서버 전용 Groq 키>
STATE_DIR=/var/lib/flagquiz
```

`op://` 참조를 직접 secret에 넣지 않는다. 1Password 주입으로 참조를 해결한 사본을 저장한다. `PUBLIC_ORIGIN`은 경로 없는 HTTPS origin이다. `SESSION_SECRET` 교체 시 기존 세션이 무효화된다. `AUTH_PROVIDER`는 공통 로그인으로 고정하고 선택값 `TJID_GOOGLE_ENABLED`는 중앙 Google provider를 실제 확인한 뒤에만 `true`로 바꾼다. 기본 로그인은 중앙 계정의 이메일·비밀번호를 사용한다. 개인 Google OAuth 변수는 이 공통 로그인 배포에 전달하지 않는다. Groq 모델은 서버의 `whisper-large-v3-turbo` 고정 설정을 사용한다.

NAS의 기존 `cloudflared`는 host network로 실행 중이다. 2026-10-03 `cf-web`의 격리 컨테이너에 loopback 포트로 접속해 실제 peer `172.21.0.1`을 확인했다. `TRUSTED_PROXY_IPS`는 정확한 IP만 지정하며, 일치하는 peer의 유효한 단일 `CF-Connecting-IP`만 방문자 제한에 사용한다. `X-Forwarded-For`는 신뢰하지 않는다. 직접 LAN 접속으로 헤더를 위조하지 못하도록 published port를 `127.0.0.1`에 한정한다. 네트워크·터널 실행 방식 변경 시 peer를 다시 측정하고 설정도 함께 변경한다.

워크플로는 `umask 077`로 절대 경로의 `deploy/.env`를 만들고 EXIT trap으로 삭제한다. Compose의 `web.environment`가 필요한 값만 읽으며 `HOST`, `PORT`, `STATE_DIR`, `STATIC_ROOT`는 컨테이너 계약으로 고정한다. `config --quiet`를 사용해 환경 값을 출력하지 않는다. 운영 파일 시스템은 읽기 전용이고 쓰기는 데이터 볼륨과 임시 `/tmp`에 한정한다. 음성 녹음 파일은 영속 저장하지 않는다.

## 배포와 실패 복귀

이번 릴리스는 **스키마 변경 없음**이다. `access.json`의 형식을 유지하고 별도 migration은 실행하지 않는다. Docker build 안에서 `npm test`, `npm run build`, `npm run verify -- --strict`를 통과한 뒤 운영 이미지를 만든다. 엄격 검사는 금지 사항과 완료 판정의 실패를 모두 배포 중단으로 처리한다. 빌드에는 서버 비밀을 전달하지 않으며 NAS 호환을 위해 classic builder(`DOCKER_BUILDKIT=0`)를 사용한다.

`main` push 또는 `main`에서 수동 실행하면 다음 순서로 진행한다.

1. 저장소 slug가 `flagquiz`인지 검증하고 commit SHA 앞 12자리를 이미지 tag로 사용한다.
2. 이미지 빌드와 설정 사전 검사를 수행한다. 필수 로그인 설정 및 Groq 키가 없으면 현재 앱을 교체하지 않는다.
3. 기존 데이터 볼륨이 있으면 읽기 전용 검사 뒤 새 이미지의 백업 도구로 검증된 사본을 먼저 만든다. 기존 운영 앱이 없고 UID 1000·0700의 완전히 빈 볼륨일 때만 초기화를 허용한다. 손상·권한 오류·잠금 파일만 남은 상태·기존 앱의 빈 볼륨·백업 실패는 배포를 중단한다.
4. `docker compose up -d --wait --wait-timeout 120 web`으로 교체한다. 한 개의 writable 앱만 실행하며 데이터 잠금은 서버가 관리한다.
5. 정상 확인 후에만 `flagquiz:latest`를 새 이미지로 갱신한다.

새 앱의 health 확인에 실패하면 기존 `flagquiz:<12자리 SHA>` 이미지로 같은 볼륨을 다시 연결한다. 첫 배포에서 실패하면 해당 `web` 서비스만 중지하고 workflow를 실패 처리한다. 이전 이미지는 다음 성공 배포에도 남겨 둔다. 전역 image prune은 사용하지 않는다.

이미지 복귀는 현재 데이터의 복원을 뜻하지 않는다. 스키마를 변경하는 후속 릴리스는 배포 전에 migration 명령·호환 여부·검증 백업·실패 복귀를 별도로 정의해야 한다. 파괴적 변경은 쓰기를 중지하는 유지보수 방식과 명시적 복원 승인 없이 진행하지 않는다.

## 백업과 복원

백업 책임자는 NAS/Forgejo 운영자 TechJuice이다. 정식 데이터는 원자적으로 교체되는 `access.json`이며 권한 기록, 로그인 세션, 음성 사용량을 포함한다. `access-mutex.sqlite`, `access.lock`, 임시 파일은 실행 중 잠금 장치로 복원 대상에서 제외하고 새 서버가 다시 만든다.

`.forgejo/workflows/backup.yml`은 매일 **19:30 UTC**와 수동 실행을 지원한다. 배포·중지·백업은 동일한 `flagquiz-nas` concurrency group을 사용한다. `operations` profile의 일회성 백업 컨테이너는 운영 데이터를 읽기 전용으로 연결하고 백업 볼륨만 쓸 수 있다. 네트워크와 로그인·음성 비밀을 받지 않는다.

백업 스크립트는 사본을 별도 임시 대상에 복원해 읽기·쓰기·재시작·quota 보존을 검증한 다음 보관한다. UTC 시각, schema version, 배포 SHA, SHA256만 로그에 남기며 데이터 내용을 출력하지 않는다. 파일은 0600, 디렉터리는 0700이다.

| 보관 구분 | 생성 기준 | 보관 수 |
| --- | --- | --- |
| 일간 | 매일 / 배포 전 검증본 | 14 |
| 주간 | UTC 일요일 | 8 |
| 월간 | UTC 1일 | 12 |

최초 운영 전에 수동 백업과 별도 대상 복원을 실제 실행하고, 매월 별도 복원 확인 결과를 기록한다. 매회 백업 검증도 별도 대상을 사용한다. Forgejo Actions에서 마지막 성공 시각과 실패한 run을 관찰하고 운영자에게 실패 알림이 도착하는지 확인한다. 운영 볼륨과 백업 볼륨은 같은 NAS에 있으므로 NAS 자체 손실에 대비한 **NAS 외부 암호화 사본**의 대상·복사 일정·실패 알림은 운영자가 별도로 연결해야 한다. 이 연결과 첫 성공/복원 기록 전에는 재해 복구 준비 완료로 판단하지 않는다.

원본을 변경하지 않는 수동 복원 검사는 백업 파일을 읽기 전용으로 연결한 상태에서 다음 도구를 사용한다.

```text
node scripts/verify-private-state.mjs --source <검증할 access.json의 절대 경로>
```

운영 데이터 위로 복원하는 작업은 별도 승인 대상이다. 정확한 백업 UTC 시각·SHA256·schema version·볼륨과 중단 시간을 먼저 확인한다. Snapshot에는 당시 세션·허용/차단 목록·사용량이 들어 있으므로, 사본을 그대로 운영에 연결하면 이후 로그아웃·로컬 차단·사용량 예약이 되돌아갈 수 있다.

별도 복원 대상에서 전체 세션을 폐기한 뒤 최신 중앙 `disabled`·session generation·`flagquiz` 권한과 로컬 `blockedEmails`를 대조한다. Snapshot 이후 해제한 계정의 차단 기록을 빠뜨리지 않으며, 단순 재로그인으로 자동 등록되지 않는지 확인한다. 현재 UTC 월·일의 사용량은 snapshot 이후 호출까지 포함한 검증 가능한 기록과 대조하고 보수적으로 보정한다. 누락분을 확인할 수 없으면 해당 기간의 한도 여유를 임의로 되살리지 않고 유료 호출을 보류한다. 원본을 보존하고 이 검토와 별도 대상 검증을 마칠 때까지 운영 트래픽과 유료 음성 키를 연결하지 않는다.

## 운영 확인과 중지

Actions 성공 뒤 SSH로 NAS 안의 `http://127.0.0.1:31015/health`와 외부 `https://flagquiz.techjuicelab.space/health`를 확인한다. 외부 로그인 화면에서 TechJuice ID 로그인을 하고 해당 앱 권한을 가진 계정만 들어가는지 검증한다. 서로 다른 방문자가 로그인 제한을 공유하지 않는지도 확인한다. 나라 이어 말하기에서 실제 마이크 인식, 중복 나라의 현재 차례 유지, 새 나라의 차례 전환, 지도 누적, 홈 이동 시 녹음 취소를 확인한다. 로그인 없이 앱 파일과 `/api/speech`가 열리지 않는지도 확인한다.

재시작·재배포 후 운영 권한, 세션, 사용량이 보존되는지 확인한다. 마지막 배포 SHA, 마지막 성공 백업 UTC 시각, 마지막 별도 복원 확인 시각과 외부 암호화 사본 위치를 운영 기록에 남긴다.

수동 `undeploy.yml`은 `flagquiz` Compose project와 `deployed-by=forgejo-actions`가 모두 일치하는 컨테이너 및 해당 앱 이미지만 제거한다. `flagquiz-data`, `flagquiz-backups`, Cloudflare 경로, Forgejo 저장소는 보존한다. 중지 후 이미지가 없으면 예약 백업은 실패하므로 운영 중지 기간에는 예약 상태를 함께 관리한다. 데이터·백업 볼륨 삭제는 최신 검증 백업을 명시한 별도 purge 승인으로만 진행한다.
