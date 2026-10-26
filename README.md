# 초이스 아레나

React + Vite + TypeScript, Firebase Spark Google Authentication·Firestore·Hosting과 Cloudflare Workers Free 기반의 2~3인 선택 전략 게임입니다. Firebase Cloud Functions는 로컬 Emulator 테스트용 코드로 유지하지만 무료 운영 배포에는 사용하지 않습니다. 경기마다 **1,000코인**으로 시작하며 계정 포인트와 경기 코인은 분리됩니다. 베팅·결제·환전은 없습니다.

## 구현 상태

- Google 로그인·복원, 닉네임 → 기본 아바타 선택/건너뛰기 → 가입. 닉네임은 가입 후 단 1회 변경 가능하며, 이후 Firestore 규칙에서 추가 변경 차단. 기본 아바타·랭킹 익명 설정은 계속 변경 가능
- `/login`, `/onboarding`, `/home`, `/play`, `/rooms/:roomId`, `/matches/:matchId/vote`, `/matches/:matchId/game`, `/matches/:matchId/result`, `/quests`, `/ranking`, `/history`, `/settings`
- 1 vs 1 / 1 vs 1 vs 1, 6자리 초대 코드 충돌 재시도, 트랜잭션 참가·정원 제한, 본인 준비, 방장 위임·명시적 퇴장
- 정원 충족 + 방장 포함 전원 준비 시 서버에서 시작. 스토리/랜덤 투표와 테마 투표, 동률 서버 추첨, 미투표 기권(전원 기권도 서버 추첨)
- 스토리 12라운드 / 랜덤 10라운드. 30초 선택, 전원 확정 시 조기 종료, 무료 자동 선택, 3초 잠금, 동시 결과 공개, 8초 결과 확인 후 다음 라운드
- 코인 0 탈락·관전, 한 명 생존 시 조기 종료, 마지막 라운드 최다 코인 우승·공동 우승·전원 탈락 무승부
- 우승 10 P + `min(5, floor(max(0, finalCoins - 1000) / 200))`, 패배·무승부·취소 보상 없음. 서버 트랜잭션/경기별 지급 내역으로 중복 방지
- 한국 날짜 기준 일일 퀘스트 30종 중 4개 배정, 완료한 실제 경기로 진행도 반영, 각 1 P 한 번 수령
- 포인트 순위(상위 100명), 동점 공동 순위(1,1,3), 익명 이름/아바타 처리, 본인은 실제 프로필 확인
- 본인 경기 기록(최근 50개), 라운드별 선택·성공/실패·코인 변화
- 기존 출석/꾸미기/티어/연습/가짜 미리보기 제거. `/attendance`는 `/quests`, `/customize`는 `/home`으로 이전 URL 호환만 유지

**현재 공개 사이트가 이 코드로 자동 업데이트되지는 않습니다.** 게임·포인트·퀘스트·랭킹을 실제로 실행하려면 Cloudflare Workers Free API를 먼저 배포하고, Firebase Hosting용 빌드에 `VITE_GAME_API_URL`을 지정해야 합니다. Firebase Functions/Blaze는 필요하지 않습니다. 기존 Firebase Functions Emulator 테스트는 유지합니다.

## GitHub 추가 작업 통합

추가된 PR [#4](https://github.com/lab1004/choice-arena/pull/4)의 `feature/playable-arena` 커밋 `5f14faf01df253b7a7ad9ee91b8cd5848ffaa6a0`도 비교해 통합했습니다. 해당 브랜치에서 바뀐 ‘폭풍 전의 낡은 다리’ 상황과 세 선택지 수치를 유지했습니다. UID·한국 날짜 해시 기반 일일 퀘스트 고정 배정, 오래된 예약 요청을 거르는 서버 마감 검증도 반영했습니다. 서버·라우팅·시나리오는 한 벌만 유지하며, 테스트는 현재 API/스키마에 맞춰 확장했습니다. 이 브랜치의 데이터 스키마는 아래 표가 기준이며, 이전 실험 브랜치의 `playerStats` 등은 운영 배포/마이그레이션된 것으로 간주하지 않습니다.

## 스토리 데이터와 균형

미병합 PR [#3](https://github.com/lab1004/choice-arena/pull/3), `2688176e641983553b29b234e1389c4642ca3d57`의 4개 테마·48개 상황·144개 행동 제목과 성공 서사를 가져왔습니다. 별도 테마를 중복 생성하지 않았습니다. 원래 `effect.coins` 모델은 제거하고 단일 데이터 원본 `functions/src/shared/stories.json`으로 전부 이전했습니다. 클라이언트와 서버가 이 데이터와 타입을 함께 사용합니다.

각 상황은 유료 고확률 / 무료 고위험 / 무료 안전 행동으로 구성하고 위치를 회전합니다. 모든 선택지에 비용, 성공 확률, 성공·실패 최종 변화량, 성공·실패 설명을 명시했습니다. 안전 행동은 100%, +30~50코인으로 시간 초과 기본값입니다. 기대값은 전체 144개에서 20~125 범위를 테스트하며 비용·최대 손실·현재 잔고에 따라 위험이 달라집니다. 이는 초기 밸런스로 실사용 경기 통계를 통한 추가 조정은 남아 있습니다.

`requiredCost`는 선택 자격만 검사합니다. `successNetChange` 또는 `failureNetChange`만 **한 번** 더하며 비용을 다시 빼지 않습니다. 음수 잔고는 0으로 제한하고 결과의 원래 변화량과 실제 적용량을 구분해 저장합니다.

## 로컬 실행

Node.js 22.12 이상(Functions 런타임 22), npm, Emulator에 Java 21이 필요합니다.

```sh
npm ci
npm ci --prefix functions
npm run build
```

터미널 1:

```sh
npm run emulators
```

터미널 2: `.env.example`을 `.env.local`로 복사하고 `VITE_USE_EMULATORS=true`로 바꾼 뒤:

```sh
npm run dev
```

브라우저에서 안내된 localhost 주소를 엽니다. 서로 다른 브라우저/시크릿 창에서 Emulator Google 로그인으로 참가합니다. `demo-choice-arena`를 사용하므로 운영 데이터와 분리됩니다. `.env` 없이 실행하면 제공된 실제 `choice-arena` 웹 설정을 사용합니다. Analytics는 초기화하지 않습니다. Storage/Realtime Database 업로드·온라인 표시도 사용하지 않습니다.

Functions Emulator `5001`, Auth `9099`, Firestore `8080`을 사용합니다. Web Emulator 모드는 개발 서버에서만 적용됩니다. 서버 인증 정보를 VITE 변수에 넣지 마세요. Firebase 웹 설정은 공개 프로젝트 식별자이며 서비스 계정 비밀키가 아닙니다.

## 서버와 데이터 구조

| 경로                               | 내용 / 접근                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `profiles/{uid}`                   | 닉네임, avatarId, rankingAnonymous, 생성·수정 Timestamp. 본인만 제한된 필드 편집, 로그인 사용자 exact get    |
| `privateProfiles/{uid}`            | Google 이메일, 본인만 읽기/이메일 일치 쓰기                                                                  |
| `accounts/{uid}`                   | points, games, wins. 본인 읽기, 서버만 변경                                                                  |
| `accounts/{uid}/days/{YYYY-MM-DD}` | 한국 날짜·배정 4개·진행도·수령 목록. 본인 읽기, 서버만 변경                                                  |
| `accounts/{uid}/history/{matchId}` | 본인의 완료된 경기 요약·선택·결과. 본인만 읽기                                                               |
| `accounts/{uid}/ledger/{id}`       | 경기/퀘스트의 고유 지급 영수증, 서버 전용                                                                    |
| `sessions/{uid}`                   | 참가 중인 roomCode, 본인 읽기·규칙에 맞는 참가 변경                                                          |
| `roomCodes/{code}`                 | 인원수·정원만 포함, 정확한 코드 조회만 허용                                                                  |
| `rooms/{code}`                     | 참가자·방장·준비·정원(2 또는 설정 상한 3)·status·서버 matchId. 참가자만 읽기                                 |
| `matches/{id}`                     | 참가자 프로필 스냅샷·코인·상태·현재 상황·서버 마감·확정자 ID·공개 결과·보상. 참가자만 exact get, 서버만 쓰기 |
| `matchSecrets/{id}`                | 비공개 투표·라운드 선택·다음 상황 덱. **모든 클라이언트 읽기/쓰기 금지**                                     |
| 서버 패키지 `shared/quests.ts`     | 변경 불가능한 배포 버전의 퀘스트 정의·목표·rewardPoints. 클라이언트 편집 불가                                |

프로필 편집 데이터에 포인트·승리 수를 넣지 않았습니다. 화면에서는 프로필과 accounts를 합쳐 보여 줍니다. 투표/선택은 callable 서버로 제출하고, 비공개 문서는 참가자도 읽을 수 없습니다. 공개 경기에는 확정한 사람의 ID만 저장되고 실제 선택은 결과 단계에서만 공개됩니다. 경기 UID는 참가 권한에 필요하지만 랭킹 응답에는 UID와 이메일을 포함하지 않습니다. 익명 설정은 랭킹에 적용되며 같은 경기 참가자 사이에는 게임 닉네임이 보입니다.

`arenaAction`은 Firebase 인증과 참가 권한·단계·마감·라운드·비용을 검증합니다. 클라이언트는 경기 상태나 통계를 직접 쓰지 못합니다. `crypto.randomInt`가 확률과 동률 추첨에 사용됩니다. 순수 판정기 `engine.ts`, 트랜잭션 `service.ts`, 호출·타이머 `index.ts`를 분리했습니다.

최종 상태·코인·모든 참가자 포인트·통계·기록·퀘스트 진행도·영수증을 하나의 Firestore 트랜잭션으로 정산합니다. 퀘스트 수령도 계정/진행도/영수증을 함께 갱신합니다. 네트워크 재시도나 동시 요청은 두 번 지급하지 않습니다. 확정 선택은 덮어쓰지 않고 거부합니다.

## 시간·재접속·퇴장

- 모든 마감은 서버 밀리초 시간으로 저장합니다. 클라이언트 시계는 서버 시간 응답/왕복 지연으로 보정한 **표시용**이며 판정에 사용하지 않습니다.
- **무료 운영에서는** 로그인된 경기 화면이 3초마다 Cloudflare Worker API로 `sync`를 보내 마감된 단계를 진행합니다. 여러 참가자가 동시에 호출해도 Firestore REST 트랜잭션에서 중복 정산되지 않습니다.
- Cloudflare Workers Free의 매분 Cron Trigger가 모든 참가자가 오프라인인 경기 중 만료된 경기를 최대 5개씩 처리합니다. 모든 이용자가 나가면 3초/8초 단계도 Cron 간격 때문에 **최대 1분 이상 지연될 수 있습니다.** 무료 Worker 할당량 및 서비스 지연에 따라 추가 지연도 있을 수 있습니다.
- Emulator에서는 기존 Firebase Functions 서버와 동일한 게임 엔진을 사용합니다. 무료 운영 Worker는 Firebase ID 토큰 서명을 Google 공개키로 검증하고 Firebase Firestore REST 트랜잭션을 실행합니다. 결과 확률과 포인트는 클라이언트가 지정할 수 없습니다.
- 페이지 이동·새로고침·로그아웃은 퇴장이 아닙니다. `sessions → rooms.matchId → matches`를 복원하며 서버 단계와 다른 URL은 현재 단계로 이동합니다. 홈에 경기 계속하기가 표시됩니다.
- 일시 단절은 탈락시키지 않습니다. 오래 복귀하지 않아도 제한 시간마다 무료 선택을 자동 적용하고 최대 라운드에서 마칩니다. 정확한 온라인 여부는 표시하지 않습니다. Realtime Database를 활성화하지 않았습니다.
- 경기 중 명시적 퇴장은 확인 후 중도 포기, 코인 0, 이후 관전만 허용합니다. 투표 중 퇴장은 취소입니다. 완료 후 퇴장은 보상에 영향을 주지 않습니다. 마지막 사람이 나가면 방과 코드를 지웁니다.
- 방치된 대기실·완료 경기의 **자동 삭제는 아직 활성화하지 않았습니다**. 운영 정책은 대기실 updatedAt 24시간 경과 시 트랜잭션으로 세션 일치 재확인 후 방/코드/세션 정리, 경기 종료 90일 후 matchSecrets/matches 삭제를 권장합니다. 본인 history와 지급 ledger는 보상 중복 방지/기록 보존을 위해 유지하세요. 실제 삭제 배치는 관리자가 정책 승인 후 추가해야 합니다.

## 보안 규칙과 인덱스

`firestore.rules.template`과 `game.config.json`에서 규칙과 Functions용 설정을 생성합니다. 클라이언트·서버·규칙이 같은 정원과 시작 코인을 사용합니다.

```sh
npm run rules:generate
npm run rules:check
```

기본 거부, 방 정원/멤버/방장/본인 준비/세션 일관성 검증을 유지했습니다. 경기 시작 후 클라이언트 대기실 편집은 차단됩니다. 서버가 처리하는 경로에 클라이언트 쓰기 권한을 열지 마세요. Admin SDK는 규칙을 우회하므로 service의 인증·단계 검증이 필수입니다.

필요 쿼리는 accounts.points 내림차순, history.finishedAt 내림차순, matches.deadline 범위이므로 Firestore의 기본 단일 필드 인덱스로 충분하며 복합 인덱스는 없습니다. `firestore.indexes.json`은 큰 맵/배열(players/results/scenario/비공개 choices/deck)의 불필요한 자동 인덱스를 제외합니다.

## 검증 명령

```sh
npm run typecheck
npm run build
npm run test:unit
npm run test:rules
npx playwright install --with-deps chromium
npm run test:ui
npm run test:auth
npm run test:game
```

- `engine.test.ts`: 48/144 데이터 검증·기대값, 투표/동률, 30초/3초, 시간 초과, 조기 종료, 비용/중복 정산, 탈락/우승/무승부, 보상 경계값, 퀘스트 날짜/진행도
- `firestore.test.ts`: 기존 프로필/로그인 데이터·방 참가/충돌/동시성/권한 17개
- `service.test.ts`: 실제 Firestore Emulator에서 정원 2/3, 서버 시작·동시 정산·중복 지급·비공개 선택·비참가자·퀘스트/랭킹/기록·복원·재대결 검증
- `auth.spec.ts`: Auth+Firestore+Functions Emulator, 로그인 유지/로그아웃, 360/375/390/768/1440px 가입·경로·새로고침·방 복원
- `game.spec.ts`: 실제 SDK와 독립 브라우저 2인/3인, 투표→실제 라운드→결과·보상·기록, 중도 포기/관전, 경기 URL 단계 복원과 화면 캡처. 가짜 경기 데이터/응답 mock 없음
- CI는 위 테스트를 실행하고 `browser-evidence` 아티팩트로 화면/실패 trace를 저장합니다.

2026-10-26 KST, [Verify CI 실행](https://github.com/lab1004/choice-arena/actions/runs/40292427798)에서 **77개 테스트 통과**: 판정 단위 19, Firestore 규칙/서비스 32, 비로그인 화면 18, 인증/경로 6, 다중 브라우저 경기 2. 360·375·390·768·1440px 경기/결과 캡처도 직접 확인했습니다. 2인전은 실제 제한 시간 흐름으로 랜덤 10라운드를 완료했고, 3인전은 스토리/테마 투표 후 중도 포기와 관전을 확인했습니다. 전체 스토리 12라운드는 서버/판정 테스트에서 확인했습니다.

로컬 TypeScript/빌드/단위/UI 테스트는 실행했습니다. 이 개발 환경에서는 `storage.googleapis.com` 다운로드가 차단되어 로컬 Emulator가 시작되지 않았습니다. 따라서 Emulator 실행 결과는 PR의 **Verify CI 실제 결과**를 기준으로 확인하세요. 실제 Google OAuth 팝업과 운영 Firebase 프로젝트는 직접 검증하지 않았습니다. Auth Emulator Google provider 테스트는 운영 OAuth 검증을 대신하지 않습니다.

## 결제 계정 없이 무료로 배포하기 (Firebase Spark + Cloudflare Workers Free)

Firebase **Spark 무료 요금제**를 그대로 사용합니다. 이미 사용 중인 `choice-arena` Firebase 프로젝트와 Google 로그인을 그대로 유지하고 **Cloud Functions v2/Cloud Tasks/Cloud Scheduler는 배포하지 않습니다.** 게임 서버 역할만 Cloudflare Workers Free로 옮깁니다. 이 방식은 요금제 전환이나 Firebase 결제 계정 없이 시작할 수 있지만, 각 서비스의 무료 사용량 제한이 있습니다.

- **Firebase Spark**: Google 로그인, Firestore, Hosting. Firestore는 하루 50,000 읽기 / 20,000 쓰기 무료 한도이며 한도를 넘으면 기능이 제한됩니다. Hosting도 저장 및 전송 한도를 지켜야 합니다.
- **Cloudflare Workers Free**: 하루 100,000 API 요청, 요청당 10ms CPU, Cron Trigger 최대 5개. 클라이언트는 현재 경기 중 3초마다 sync를 호출하므로 소수의 테스터로 시작하세요. 10ms CPU/50회 subrequest 한도는 실제 운영 환경에서 검증해야 합니다.
- Firebase Google 로그인은 현행 구조를 바꾸지 않습니다. Cloudflare에서는 Firebase ID 토큰의 Google 서명을 검증하고 서비스 계정으로 Firestore에 안전하게 읽고 씁니다.
- 서버 판정은 기존 `functions/src/engine.ts`, `functions/src/service.ts`와 동일한 코드를 사용합니다. Cloudflare Wrangler 모듈 alias가 Firebase Admin DB 클라이언트 부분만 Firestore REST 어댑터로 변경합니다.

### 1. Cloudflare 무료 계정과 Firebase 서비스 계정 준비

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)에서 **Workers Free** 계정을 만듭니다. 유료 플랜 선택이나 결제 계정 등록은 필요 없습니다.
2. 기존 [Firebase Console](https://console.firebase.google.com/)의 `choice-arena` 프로젝트 설정 → 서비스 계정에서 Firebase Admin SDK의 **새 비공개 키 생성**을 진행합니다. 이 파일은 절대 GitHub, 클라이언트, VITE_ 환경 변수, 채팅에 업로드하지 마세요. 가능한 최소 권한의 계정을 사용하세요. 플랫폼 정책상 키 생성이 막혀 있다면 관리자가 설정해야 합니다.
3. 서비스 계정 JSON의 `project_id`가 `choice-arena`인지 확인합니다.
4. Cloudflare에 로그인한 로컬 터미널에서 저장소 루트 기준 명령을 실행합니다.

```sh
npx --yes wrangler@4.129.1 login
npx --yes wrangler@4.129.1 secret put FIREBASE_SERVICE_ACCOUNT_JSON
```

두 번째 명령의 입력창에는 **로컬에 저장한 서비스 계정 JSON 전체 내용**을 입력합니다. 일부 셸에서는 JSON 파일의 줄바꿈을 비밀값 입력으로 전달하기 어려우므로, 로컬 파일의 내용을 한 줄 JSON으로 변환해 붙여 넣거나 Wrangler의 표준입력 기능을 확인하여 사용하세요. 비밀값은 Cloudflare Worker Secret에만 저장해야 합니다.

### 2. 무료 Worker API 배포

```sh
npx --yes wrangler@4.129.1 deploy
```

배포 후 출력되는 `https://choice-arena-game.<subdomain>.workers.dev` URL을 기록합니다. 먼저 `/health`에 접속하여 `{"ok":true}`가 표시되는지 확인합니다. `wrangler.jsonc`의 `ALLOWED_ORIGINS`에 Hosting 도메인이 포함되어야 합니다.

**주의:** Cloudflare Workers는 무료지만, GitHub에 코드가 올라갔다고 자동 배포되지는 않습니다. Cloudflare 계정 로그인이 필요합니다.

### 3. 무료 Firebase Hosting 배포

저장소 루트의 `.env.example`을 `.env.local`로 복사하고 다음 값을 설정합니다.

```env
VITE_USE_EMULATORS=false
VITE_GAME_API_URL=https://choice-arena-game.<subdomain>.workers.dev
```

`<subdomain>`을 실제 Wrangler 출력값으로 바꾸세요. **VITE_GAME_API_URL은 공개 API 주소이지 비밀 키가 아닙니다.**

```sh
npm ci
npm ci --prefix functions
npm run rules:check
npm run build
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes --project choice-arena
npx firebase deploy --only hosting --project choice-arena
```

**절대** `npx firebase deploy --only functions` 또는 전체 서비스 무조건 배포 명령을 실행하지 마세요. Firebase Spark에서는 Cloud Functions 배포가 허용되지 않고 Blaze가 요구됩니다. 프런트엔드는 유효한 `VITE_GAME_API_URL`이 없으면 게임 서버 요청을 실패 처리하며, 유료 Functions로 자동 전환하지 않습니다.

완료 후 접속: **https://choice-arena.web.app**

### 4. 실제 출시 검증 (필수)

- 실제 Google 계정 두 개로 로그인하여 2인방 생성, 준비, 시작, 모드 투표, 선택/결과, 우승 포인트, 일일 퀘스트, 랭킹까지 전체 진행합니다.
- 3인방 인원 제한과 중도 포기, 재대결, 모바일 화면을 검증합니다.
- 모든 브라우저를 닫고 무료 Cron Trigger가 남은 경기를 진행시키는지 Worker 로그와 Firestore 상태에서 확인합니다. 클라이언트가 없는 경기는 분 단위 지연이 있을 수 있습니다.
- Firestore 규칙이 게임/포인트 임의 쓰기를 거부하는지, Worker가 비로그인 요청을 거부하는지 확인합니다.
- Cloudflare Workers 및 Firebase의 무료 한도와 사용량 알림을 수시로 점검합니다. **서비스 규모가 커지면 무료 사용량을 초과해 기능이 중단될 수 있습니다.**
- 배포 후 닉네임은 가입 후 1회만 변경 가능한지 검증합니다. 기존 계정도 한 번의 변경 기회가 있습니다.

### 테스트와 한계

로컬에서는 계속 `VITE_USE_EMULATORS=true`로 원래 Firebase Functions Emulator 테스트를 실행할 수 있습니다. CI에서는 Wrangler 번들 검사를 포함합니다. **실제 Cloudflare Worker에서 Firebase 인증, Firestore REST 트랜잭션, Cron, 무료 플랜 CPU 한도가 통과하는지 운영 검증은 아직 완료되지 않았습니다.** 이 저장소에 Cloudflare 서비스 계정 비밀키나 유료 설정은 포함되지 않습니다.

실사용 규모가 커져 Workers Free의 요청당 CPU 10ms/일일 요청 한도를 넘으면 Worker 오류가 발생할 수 있습니다. Google OAuth 검증, OAuth 서비스 계정 토큰 발급, Firestore 동시 트랜잭션을 실제 Workers 환경에서 검증해야 합니다. 온라인 참가자가 있으면 3초 sync로 진행하지만 전원이 오프라인이면 Cron이 순차 보완하므로 진행이 늦어질 수 있습니다.

## 남은 운영 제한

- 실제 Cloudflare 배포와 Firebase Hosting/규칙 배포는 사용자의 계정 인증이 필요하며 자동 실행하지 않았습니다.
- 방치 대기실/오래된 경기 데이터 자동 정리, 정확한 접속 상태, 사진 업로드, 효과음은 아직 제공하지 않습니다.
- 반복 상대 담합·다중 계정 포인트 파밍 방지, App Check 강제, 사용자별 rate limit, 랭킹 전체 페이지네이션은 후속 운영 과제입니다.
- 경기 진행 중 시나리오 데이터 업데이트 시 호환성 관리가 필요합니다. 활성 경기가 끝난 뒤 새 버전을 배포하는 것을 권장합니다.
