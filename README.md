# 초이스 아레나

같은 상황에서 세 가지 행동 중 하나를 고르는 모바일 우선 전략 게임입니다. 이번 버전은 **실제 Firebase Google 로그인, 닉네임, 프로필, 최대 3인 실시간 대기실**까지 제공합니다. 경기 진행·출석·랭크·보상은 아직 구현하지 않았고 화면에도 준비 중으로 표시합니다. 상황 카드는 상호작용하지 않는 화면 예시입니다. 베팅·실제 결제·환전 기능은 없습니다. 향후 경기는 모두 동일한 1,000코인으로 시작합니다.

## 로컬 실행

Node.js 22 이상과 npm을 사용합니다.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Vite가 표시하는 주소(기본 `http://localhost:5173`)를 엽니다. 제공받은 Firebase 웹 설정을 기본값으로 사용하며 `.env.local`로 변경할 수 있습니다. 웹 설정/API key는 브라우저에 공개되는 프로젝트 식별자이지 관리자 권한 비밀키가 아닙니다. **서비스 계정, 개인키, 인증 토큰을 `VITE_` 환경 변수나 저장소에 넣지 마세요.** Analytics는 초기화하지 않습니다.

```sh
npm run typecheck
npm run build
npm run preview
```

`game.config.json`이 현재 정원과 시작 코인의 기준입니다. `maxPlayers`를 바꾸면 `npm run rules:generate`로 보안 규칙도 생성합니다. 빌드는 생성 결과가 최신인지 검사합니다. 시작 코인은 게임 설계 설정이며, 아직 실제 경기 잔액으로 저장하거나 홈에서 보유 재화처럼 표시하지 않습니다.

## Firebase Console에서 남은 설정

1. `choice-arena` 프로젝트에서 **Authentication → Sign-in method → Google**을 활성화하고 프로젝트 지원 이메일을 지정합니다.
2. **Authentication → Settings → Authorized domains**에 실제 개발·운영 호스트를 등록합니다. 새 프로젝트는 `localhost`도 직접 추가해야 할 수 있습니다. `choice-arena.firebaseapp.com`, 배포할 `choice-arena.web.app`, 나중에 사용할 커스텀 도메인을 확인하세요. 모바일의 인앱 브라우저 대신 Chrome/Safari 등 외부 브라우저로 로그인합니다. 팝업 차단 시 허용 안내가 표시됩니다.
3. **Firestore Database**를 기본 데이터베이스 `(default)`로 생성하고 지역을 선택합니다. 테스트 모드로 전체 공개하지 말고 아래 규칙을 적용하세요.
4. Firebase CLI에 권한 있는 계정으로 로그인한 뒤 프로젝트가 `choice-arena`인지 확인합니다. 규칙 배포 전에는 실제 프로필/방 작업이 거부될 수 있습니다.
5. 서로 다른 실제 Google 계정과 휴대폰·PC 브라우저에서 아래 수동 검증을 완료하세요.

Firebase Authentication, Firestore, 정적 Hosting만 사용하며 Cloud Functions나 유료 서비스 활성화는 필요하지 않습니다. Spark 요금제의 제공량 범위에서 시작할 수 있으며 쿼터/정책은 Firebase Console에서 확인하세요. 결제 계정 연결이나 실제 배포를 이 작업에서 수행하지 않습니다.

## 데이터와 보안

| 경로                    | 내용                                                            | 접근                                                      |
| ----------------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| `profiles/{uid}`        | 게임 닉네임, 생성·수정 시각                                     | 로그인 사용자 단건 읽기, 본인만 정해진 필드 생성/수정     |
| `privateProfiles/{uid}` | Google 인증 토큰과 일치하는 이메일                              | 본인만 단건 읽기/쓰기                                     |
| `sessions/{uid}`        | 현재 `roomCode` 또는 `null`                                     | 본인만 접근, 방 소속과 원자적으로 일치해야 변경 가능      |
| `roomCodes/{code}`      | `playerCount`, `maxPlayers`                                     | 로그인 사용자가 정확한 코드로만 단건 조회, 목록 열람 금지 |
| `rooms/{code}`          | 방장, 참가자 UID/닉네임 스냅샷/준비 상태, 정원, 대기 상태, 시각 | 현재 참가자만 읽기, 허용된 상태 전이만 쓰기               |
| 그 외 모든 경로         | 추후 경기·출석·랭크 등                                          | 기본 거부                                                 |

방 코드에는 혼동하기 쉬운 `I`, `O`, `0`, `1`을 제외한 영문 대문자·숫자를 사용합니다. Web Crypto로 생성하며, 이미 사용 중인 코드는 최대 8회 새로 생성합니다. 이메일과 Google 표시 이름은 방에 복사하지 않습니다. 닉네임은 한글 완성형·영문·숫자·밑줄 2~12자이며 중복을 허용합니다.

입장 전에는 방 내부를 읽지 않습니다. 참가 트랜잭션은 초대 코드 문서의 정원만 확인한 뒤 참가자를 추가하고, `rooms`, `roomCodes`, `sessions`를 한 번에 갱신합니다. 보안 규칙은 `getAfter()`로 세 문서의 일관성, 정원, 본인 추가/삭제, 초기 준비 상태, 닉네임 출처, 방장 권한을 검증합니다. 다른 사람의 준비 상태는 방장도 변경할 수 없습니다. 로그인 사용자도 방 전체 목록이나 타인의 참가 방 기록은 조회할 수 없습니다.

방장은 다른 참가자에게 직접 위임할 수 있습니다. 방장이 나가면 참가 목록의 다음 사람에게 자동 위임됩니다. 마지막 참가자의 명시적인 퇴장만 방과 초대 코드 문서를 삭제합니다. 같은 사용자가 여러 탭·기기에서 동시에 두 방에 참가할 수 없습니다.

현재 문서 ID 직접 접근만 사용하므로 복합 인덱스가 필요 없습니다. `firestore.indexes.json`에 이를 명시하고 동적 `members` 맵의 불필요한 인덱싱을 제외했습니다.

## 연결 끊김과 방 복원

- Firebase Auth의 브라우저 로컬 지속성을 사용하여 새로고침 후 로그인 상태를 복원합니다.
- 참가 중인 방은 로컬 저장소 대신 `sessions/{uid}`를 구독해 복원합니다. 다른 기기에서도 같은 계정의 방으로 돌아옵니다.
- 닫기·새로고침·로그아웃·네트워크 단절은 **퇴장이 아닙니다**. 정원에서 자리를 유지하고 방장도 바뀌지 않습니다. 로그아웃한 뒤 다시 로그인해도 복원됩니다.
- ‘방 나가기’만 서버 트랜잭션으로 퇴장합니다. 오프라인에서는 변경 버튼을 막고 안내를 표시합니다. 오래된 캐시를 확정된 서버 상태처럼 처리하지 않습니다.
- Firestore만으로 접속 여부를 정확하게 판단하지 않습니다. 화면의 ‘대기 중/준비 완료’는 **준비 상태**이며 온라인 여부가 아닙니다. 브라우저 네트워크 감지와 스냅샷 메타데이터는 연결 안내 용도입니다.
- 영구 이탈자의 자동 퇴장/유휴 방 청소는 현재 없습니다. 정확한 presence가 필요하면 Realtime Database `onDisconnect`와 서버 정리 로직 등을 별도로 설계해야 합니다.
- 초대 코드를 알면 정원 내 참가가 가능하며, 코드 조회에 서버 속도 제한은 구현하지 않았습니다. 현재 코드를 비밀번호나 민감정보 보호 수단으로 사용하지 않습니다.

## Emulator 검증

Java 21 이상이 필요합니다. 개발 데이터는 실제 Firebase 프로젝트와 다른 `demo-choice-arena`에 저장합니다.

```sh
npm run test:rules
```

테스트는 실제 앱의 서비스 함수를 Emulator 보안 규칙 아래에서 실행합니다. 동시 입장과 정원 초과, 한 계정의 두 방 동시 입장, 코드 충돌, 준비 상태 실시간 반영, 방장 위임과 마지막 퇴장, 비참가자 읽기 차단, 타인 프로필/준비 상태 수정 차단, 규칙 우회용 배치, 출석·랭크 임의 쓰기 거부를 검증합니다. 인터넷이 제한된 환경은 Firebase CLI의 Emulator JAR 다운로드가 차단될 수 있습니다.

앱으로 Emulator를 사용하려면:

```sh
npm run emulators
# 다른 터미널에서
VITE_USE_EMULATORS=true npm run dev
```

Auth Emulator의 Google 제공자 테스트 화면을 사용합니다. 이는 실제 Google OAuth가 아니며, 이 앱에 가짜 로그인이나 로컬 멀티플레이를 넣는 방식이 아닙니다. 프로덕션 빌드에서는 Emulator 플래그를 강제로 무시합니다. SDK가 `127.0.0.1`에 연결하므로 기본 설정은 Emulator를 실행한 PC 브라우저용입니다. 휴대폰으로 Emulator를 테스트하려면 별도 호스트/방화벽 구성이 필요합니다.

수동 확인 항목:

- 실제 Google 팝업 로그인, 취소·팝업 차단 안내, 닉네임 최초 저장, 새로고침 로그인 복원
- 계정 3개의 방 참가·준비·위임 실시간 반영, 네 번째 계정의 정원 초과 안내
- 두 탭의 중복 클릭·동시 참가, 방장 퇴장 중 입장 경합, 마지막 퇴장 후 코드 삭제
- 네트워크 오프라인/복원, 새로고침/로그아웃 후 같은 방 복원, 명시적인 퇴장 구분
- 모바일 320/375/390px과 PC에서 가로 스크롤, 키보드 조작, 입력/버튼 터치 확인

실제 Google 계정 로그인, 실제 Firebase 규칙·Hosting 배포는 개발 환경의 테스트와 별도로 검증해야 합니다.

브라우저 검증과 Auth 복원 테스트:

```sh
npx playwright install chromium
npm run test:ui
npm run test:auth
```

Auth 테스트는 `tests/fixtures`에서만 Google 제공자용 Emulator 자격 증명을 생성하고 실제 Firebase SDK로 로그인·새로고침 복원·로그아웃을 검증합니다. 앱에는 테스트 로그인 버튼이나 가짜 인증 경로가 없습니다. 이 검증은 실제 Google 로그인 팝업과 계정 승인을 검증하지 않습니다. 기존 Chromium을 사용하려면 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`에 실행 파일 경로를 지정하세요.

### 이번 작업의 로컬 검증 기록 (2026-10-24 KST)

- 의존성 설치, TypeScript, 프로덕션 빌드: 통과
- Chromium 화면/오프라인 테스트 5개: 통과 (320, 390, 768, 1440px, 가로 넘침 없음)
- Auth Emulator Google 제공자 세션 복원·로그아웃 테스트 1개: 통과
- 프로덕션 의존성 `npm audit --omit=dev`: 알려진 취약점 0개. Firebase의 Node용 gRPC 전이 의존성은 수정된 1.14.6 이상으로 override했습니다.
- Firestore 규칙/동시성 테스트 17개: 작성했으나 로컬 실행 차단. 공식 Emulator JAR 다운로드가 이 환경의 네트워크 정책에 의해 `403 Domain forbidden`으로 거부되었습니다. 테스트 통과로 간주하지 않습니다. GitHub Actions에도 실행 단계를 포함했습니다.
- 실제 Google OAuth, 운영 Firestore 연결, 실제 모바일 기기: 미검증
- 실제 배포/유료 서비스 활성화: 수행하지 않음

## 배포 방법 — 이번 작업에서는 실행하지 않음

먼저 권한 있는 계정으로 로그인하고 대상 프로젝트를 확인합니다.

```sh
npx firebase login
npx firebase use choice-arena
npm run rules:generate
npm run test:rules
npm run build
```

보안 규칙과 인덱스를 먼저 배포합니다.

```sh
npx firebase deploy --only firestore:rules,firestore:indexes --project choice-arena
```

그 다음 빌드 산출물을 Hosting에 배포합니다.

```sh
npx firebase deploy --only hosting --project choice-arena
```

`firebase.json`에는 SPA 경로 fallback, 정적 파일 캐싱, 기본 보안 헤더가 포함돼 있습니다. `.env.local`, 서비스 계정, Emulator 데이터, 로그는 Git에 넣지 않습니다.

## 확장 구조

- `src/domain/game.ts`: 상황 분야, 세 가지 선택, 코인·아이템·상태 효과의 타입과 게임 설정
- `src/lib/arena.ts`: UI와 분리한 프로필·대기실 트랜잭션. Emulator 테스트에서도 동일 코드 사용
- `src/lib/useArena.ts`: 인증 복원, 실시간 구독 해제, 로딩/중복 요청/연결 오류 처리
- `src/components/ScenarioPreview.tsx`: 이후 실제 상황 카드로 확장할 화면 영역
- `firestore.rules.template` + `game.config.json` → `firestore.rules`: 클라이언트와 정원 정책 공유

후속 버전의 경기 결과·랭크·출석 보상은 편집 가능한 프로필에 추가하지 않습니다. 서버가 검증하고 갱신하는 별도 컬렉션으로 설계하세요. 신뢰할 수 있는 경기 판정, 일별 보상 중복 방지, 예약 청소를 Firebase Cloud Functions/Cloud Scheduler로 구현할 경우 일반적으로 Blaze 요금제 및 결제 계정이 필요하며, 비용·한도를 검토하고 별도 승인 후 활성화해야 합니다. 현재는 해당 경로의 모든 클라이언트 쓰기를 차단합니다.
