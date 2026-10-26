# 초이스 아레나

Firebase 기반 모바일 우선 2~3인 확률 전략 게임입니다. 모든 플레이어는 경기마다 1,000코인으로 시작하고, 공개된 비용·확률·성공/실패 최종 변화량을 비교해 3가지 행동 중 하나를 선택합니다.

## 구현 범위

- Google 로그인, 닉네임, 선택 가능한 기본 아바타
- 6자리 코드 방 생성·참가, 최대 3명, 준비 상태와 방장 시작
- 참가 인원에 따른 1vs1 / 1vs1vs1
- 스토리/랜덤 투표와 스토리 테마 투표
- 무인도 생존·중세 도시·우주 탐사·미스터리 저택 4개 테마
- 테마별 12개, 총 48개 상황과 144개 선택지
- 스토리 12라운드, 랜덤 10라운드
- 서버 기준 30초 선택, 전원 선택 시 3초 카운트다운, 동시 결과 공개
- 시간 초과 시 무료 기본 행동, 코인 0 탈락, 관전, 우승·공동 우승·무승부
- 우승 10포인트 + 최종 코인 보너스 최대 5포인트
- 일일 퀘스트 30개 중 한국 시간 기준 4개 배정
- 포인트 랭킹, 익명 표시, 내 경기 기록, 설정 페이지
- 모바일 360px 이상과 데스크톱 반응형 UI

경기 코인은 계정 포인트와 분리됩니다. 실제 현금, 결제, 환전 기능은 없습니다.

## 구조

- `src/`: React + Vite + TypeScript 클라이언트
- `functions/`: 서버 권한 경기 판정·확률 추첨·보상·퀘스트·랭킹
- `game-content.json`: 4개 테마의 단일 원본 데이터
- `firestore.rules.template`: 인증 사용자와 경기 참가자 중심 보안 규칙

선택지의 `successNetChange`와 `failureNetChange`는 필요 비용까지 포함한 최종 변화량입니다. `requiredCost`는 선택 가능 여부를 판정하며 결과에서 다시 차감하지 않습니다.

## 로컬 실행

Node.js 22.12 이상이 필요합니다.

```sh
npm ci
npm --prefix functions ci
cp .env.example .env.local
npm run dev
```

기본 주소는 `http://localhost:5173`입니다.

Firebase Emulator 전체 실행에는 Java 21 이상이 필요합니다.

```sh
npm run emulators
VITE_USE_EMULATORS=true npm run dev
```

## 검사

```sh
npm run test:content
npm run typecheck
npm --prefix functions run check
npm run build
npm run test:rules
npm run test:server
npm run test:ui
npm run test:auth
```

`test:content`는 테마 4개, 상황 48개, 선택지 144개, 확률 범위와 라운드별 무료 시간 초과 행동을 검사합니다.

## Firebase Console 설정

1. Authentication에서 Google 로그인을 활성화하고 지원 이메일을 지정합니다.
2. Authentication의 Authorized domains에 개발·운영 도메인을 등록합니다.
3. `(default)` Firestore 데이터베이스를 생성합니다.
4. 보안 규칙과 인덱스를 배포합니다.
5. Cloud Functions를 배포합니다.
6. Hosting을 배포합니다.

```sh
npx firebase login
npx firebase use choice-arena
npm run rules:generate
npx firebase deploy --only firestore:rules,firestore:indexes --project choice-arena
npx firebase deploy --only functions --project choice-arena
npm run build
npx firebase deploy --only hosting --project choice-arena
```

## 요금제 주의

신뢰할 수 있는 확률 추첨, 코인 정산, 탈락·우승 판정, 포인트·퀘스트 보상은 `asia-northeast3` Cloud Functions에서 처리합니다. 운영 프로젝트에 Functions를 배포하려면 Firebase Blaze 요금제와 결제 계정이 필요할 수 있습니다. 이 저장소 작업은 요금제 전환이나 실제 배포를 자동으로 수행하지 않습니다.

## 보안

클라이언트는 포인트, 경기 결과, 퀘스트 완료 여부를 직접 쓸 수 없습니다. 결과 공개 전 선택은 `matches/{matchId}/choices/{uid}`에 서버 권한으로 저장되며 클라이언트 읽기를 차단합니다. 경기 참가자만 공개 경기 문서를 읽을 수 있고, 개인 경기 기록과 설정은 본인만 읽을 수 있습니다. 랭킹은 callable function이 익명 설정을 반영해 반환합니다.

서비스 계정, 개인키, 인증 토큰은 저장소나 `VITE_` 환경 변수에 넣지 마세요. Firebase 웹 설정은 브라우저용 프로젝트 식별자이며 관리자 비밀키가 아닙니다.

## 남은 운영 검증

- 실제 Google OAuth와 운영 Firebase 프로젝트 연결
- 서로 다른 실제 계정·휴대폰에서 2인/3인 전체 경기 검증
- Functions·Firestore·Hosting 실제 배포
- 장기 미접속자 presence와 방치된 경기 자동 청소
- 운영 사용량·비용 알림 설정

현재 연결 끊김은 서버 마감 시간과 무료 자동 행동으로 처리하지만, 정확한 온라인 표시와 `onDisconnect` 기반 presence는 아직 포함하지 않습니다.

## 경기 처리와 예약 작업

모든 경기 상태 변경은 Firestore 트랜잭션으로 처리합니다. 동시에 시작·투표·선택·결과 요청이 들어와도 현재 라운드와 revision을 확인합니다. 우승 포인트·전적·퀘스트 진행도·지급 원장은 경기 종료와 함께 원자적으로 저장됩니다. 퀘스트 진행도는 완료한 경기 기준으로 반영됩니다.

운영 환경에서는 `scheduleDeadline` Firestore 트리거가 `advanceDeadline` Cloud Tasks 작업을 예약합니다. 모든 브라우저가 닫혀도 서버가 기한을 처리하며, 지연되거나 중복 전달된 작업은 revision으로 걸러집니다. Functions 배포 시 Cloud Tasks/Eventarc 관련 API와 작업을 등록·호출할 서비스 계정 권한이 필요합니다. 실제 권한과 예약 작업 배달은 운영 배포 후 검증해야 합니다.

Emulator에서는 예약 작업용 두 함수를 로드하지 않습니다. 브라우저가 서버 기한을 확인하여 `advance`를 호출하고, 서버 통합 테스트는 시계를 진행시켜 동일한 트랜잭션을 실행합니다. 이 로컬 검증은 운영 Cloud Tasks 배달 테스트를 대체하지 않습니다.

## 검증 기록 (2026-10-26 KST)

- TypeScript 클라이언트/Functions 검사 및 프로덕션 빌드 통과
- 콘텐츠 검사: 4개 테마·48개 상황·144개 선택지, 무료 기본 행동 검증 통과
- 실제 Firestore Emulator: 기존 대기실/보안 + 경기 접근/포인트 조작 차단/2인 정원 테스트 19개 통과
- 서버 통합 테스트 7개 통과: 동시 시작·투표·선택, 10라운드 전체 진행, 비용 이중 차감 방지, 0코인 탈락, 조기 우승, 공동 우승, 무승부, 지급 중복 방지, 퀘스트 날짜 변경, 랭킹 익명 처리
- Chromium 로그인/오프라인/가로 넘침 테스트 5개 통과 (320·390·768·1440px)
- Auth/Firestore/Functions Emulator 브라우저 통합 테스트 1개 통과: 가입·아바타 건너뛰기·닉네임 변경·퀘스트 4개 조회·2인 방 생성·준비 상태 및 새로고침 복원·로그아웃
- 실제 Google OAuth, 실제 휴대폰 동시 플레이, 운영 예약 작업 배달은 미검증
- 결제 계정 연결·요금제 전환·운영 배포는 수행하지 않음

테스트 환경은 Node 24에서 실행했고, 배포 및 CI는 Node 22를 사용합니다. 이 실행 환경은 Unix socket을 제한하여 Functions Emulator 내부 통신을 로컬 TCP로 바꿔 테스트했습니다. 이 조정은 `node_modules` 내부에만 적용했고 저장소에는 포함하지 않습니다.
