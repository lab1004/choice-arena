import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Coins,
  Copy,
  Crown,
  DoorOpen,
  Gamepad2,
  Layers3,
  LoaderCircle,
  LogOut,
  Plus,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { GAME_CONFIG, normalizeCode, validNickname } from "./domain/game";
import { useArena, type Arena } from "./lib/useArena";
import { usingEmulators } from "./lib/firebase";
import { ScenarioPreview } from "./components/ScenarioPreview";
import "./styles.css";

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24">
      <path
        fill="#4285f4"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.3 2.9-7.4"
      />
      <path
        fill="#34a853"
        d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1-2.6 0-4.9-1.8-5.7-4.1H2.9v2.6A10 10 0 0 0 12 22"
      />
      <path
        fill="#fbbc05"
        d="M6.3 14a6 6 0 0 1 0-4V7.4H2.9a10 10 0 0 0 0 9.2z"
      />
      <path
        fill="#ea4335"
        d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9.1 5.4L6.3 10c.8-2.3 3.1-4.1 5.7-4.1"
      />
    </svg>
  );
}
function NicknameForm({ arena }: { arena: Arena }) {
  const [nickname, setNickname] = useState("");
  return (
    <section className="panel nickname-panel">
      <span className="icon-tile">
        <Sparkles />
      </span>
      <p className="eyebrow">첫 번째 선택</p>
      <h2>어떤 이름으로 만날까요?</h2>
      <p className="muted">
        게임에서 사용할 닉네임을 정해 주세요.
        <br />
        Google 이름과 이메일은 다른 참가자에게 공개되지 않아요.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void arena.saveNickname(nickname);
        }}
      >
        <label htmlFor="nickname">게임 닉네임</label>
        <input
          id="nickname"
          autoComplete="nickname"
          autoFocus
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={12}
          placeholder="예: 선택의고수"
          aria-describedby="nickname-help"
        />
        <p id="nickname-help" className="field-hint">
          한글·영문·숫자·밑줄, 2~12자 / 중복 닉네임 사용 가능
        </p>
        <button
          className="primary full"
          disabled={
            !!arena.busy || !arena.online || !validNickname(nickname.trim())
          }
        >
          닉네임 저장하고 시작하기 <ArrowRight size={18} />
        </button>
      </form>
    </section>
  );
}
function HomeActions({ arena }: { arena: Arena }) {
  const [input, setInput] = useState("");
  const disabled = !!arena.busy || !arena.canMutate;
  return (
    <div className="home-actions">
      <section className="panel profile-panel">
        <div className="avatar">{arena.profile?.nickname.slice(0, 1)}</div>
        <div>
          <p className="eyebrow">나의 프로필</p>
          <h2>{arena.profile?.nickname}</h2>
          <span className="muted small">오늘은 어떤 선택을 해볼까요?</span>
        </div>
        <ShieldCheck className="profile-check" size={22} />
      </section>
      <section className="panel create-panel">
        <div className="card-icon">
          <Plus />
        </div>
        <h2>우리만의 아레나</h2>
        <p className="muted">
          방을 만들고 친구를 초대하세요.
          <br />
          최대 {GAME_CONFIG.maxPlayers}명이 함께할 수 있어요.
        </p>
        <button
          className="primary full"
          disabled={disabled}
          onClick={() => void arena.create()}
        >
          새로운 방 만들기 <ArrowRight size={18} />
        </button>
      </section>
      <section className="panel join-panel">
        <h2>초대받으셨나요?</h2>
        <p className="muted">친구에게 받은 6자리 코드를 입력하세요.</p>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void arena.join(input);
          }}
        >
          <label className="sr-only" htmlFor="room-code">
            6자리 방 코드
          </label>
          <div className="join-input">
            <input
              id="room-code"
              value={input}
              onChange={(e) => setInput(normalizeCode(e.target.value))}
              maxLength={GAME_CONFIG.roomCodeLength}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="ABC234"
            />
            <button
              className="secondary"
              disabled={disabled || input.length !== GAME_CONFIG.roomCodeLength}
              type="submit"
            >
              참가 <ChevronRight size={17} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function Lobby({ arena }: { arena: Arena }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { room, user, code } = arena;
  if (!room || !user || !code)
    return (
      <section className="panel">
        <LoaderCircle className="spin" />
        <h2>
          {room === null
            ? "방 정보를 찾을 수 없어요"
            : "참가 중인 방을 복원하고 있어요"}
        </h2>
        <p className="muted">연결이 복구되면 다시 표시됩니다.</p>
        {room === null && (
          <button
            className="secondary"
            disabled={!!arena.busy || !arena.online}
            onClick={() => void arena.leave()}
          >
            홈으로 돌아가기
          </button>
        )}
      </section>
    );
  const isHost = room.hostId === user.uid;
  const mine = room.members[user.uid];
  const disabled = !!arena.busy || !arena.canMutate;
  async function copy() {
    try {
      await navigator.clipboard.writeText(code!);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <section className="panel lobby">
      <div className="section-heading">
        <div>
          <p className="eyebrow">LOBBY</p>
          <h2>선택의 시작점</h2>
        </div>
        <span className="pill">
          <Users size={14} />
          {room.memberIds.length} / {room.maxPlayers}
        </span>
      </div>
      <div className="invite-box">
        <div>
          <span className="muted small">친구에게 초대 코드를 알려 주세요</span>
          <p className="invite-code">{code}</p>
        </div>
        <button
          className="icon-button"
          aria-label="초대 코드 복사"
          onClick={() => void copy()}
        >
          {copied ? <Check /> : <Copy size={20} />}
        </button>
      </div>
      <p className="field-hint" role="status">
        {copyError
          ? "자동 복사가 안 돼요. 위 코드를 길게 눌러 직접 복사해 주세요."
          : copied
            ? "초대 코드를 복사했어요."
            : "코드를 아는 친구가 정원 내에서 참가할 수 있어요."}
      </p>
      <div className="players">
        {room.memberIds.map((uid, index) => (
          <div
            className={`player-row ${uid === user.uid ? "is-me" : ""}`}
            key={uid}
          >
            <div className={`avatar avatar-${index % GAME_CONFIG.maxPlayers}`}>
              {room.members[uid].nickname.slice(0, 1)}
            </div>
            <div className="player-name">
              <strong>{room.members[uid].nickname}</strong>
              <div className="small muted">
                {uid === user.uid && <span>나 · </span>}
                {room.hostId === uid ? (
                  <span className="host-label">
                    <Crown size={12} /> 방장
                  </span>
                ) : (
                  "참가자"
                )}
              </div>
            </div>
            <div className="player-actions">
              <span
                className={`ready-tag ${room.members[uid].ready ? "is-ready" : ""}`}
              >
                {room.members[uid].ready ? "준비 완료" : "대기 중"}
              </span>
              {isHost && uid !== user.uid && (
                <button
                  className="text-button"
                  disabled={disabled}
                  onClick={() => void arena.transfer(uid)}
                  aria-label={`${room.members[uid].nickname}에게 방장 위임`}
                >
                  방장 위임
                </button>
              )}
            </div>
          </div>
        ))}
        {Array.from(
          { length: Math.max(0, room.maxPlayers - room.memberIds.length) },
          (_, index) => (
            <div className="empty-player" key={index}>
              <div className="empty-avatar">
                <Plus size={20} />
              </div>
              <span>친구를 기다리고 있어요</span>
            </div>
          ),
        )}
      </div>
      <button
        className={mine?.ready ? "secondary full" : "primary full"}
        disabled={disabled || !mine}
        onClick={() => void arena.ready(!mine?.ready)}
      >
        {mine?.ready ? "준비 취소하기" : "준비 완료"} <Check size={18} />
      </button>
      <div className="coming-note">
        <CircleHelp size={17} />
        <p>
          지금은 로그인과 대기실을 이용할 수 있어요.
          <br />
          모두 준비해도 경기는 시작되지 않아요.
        </p>
      </div>
      {confirmLeave ? (
        <div className="leave-confirm">
          <p>
            방에서 나갈까요?{" "}
            {isHost && room.memberIds.length > 1
              ? "다음 참가자에게 방장이 자동 위임돼요."
              : room.memberIds.length === 1
                ? "마지막 참가자가 나가면 방이 삭제돼요."
                : "다시 참가하려면 초대 코드가 필요해요."}
          </p>
          <div>
            <button
              className="secondary"
              disabled={disabled}
              onClick={() => setConfirmLeave(false)}
            >
              취소
            </button>
            <button
              className="danger"
              disabled={disabled}
              onClick={() => void arena.leave()}
            >
              방 나가기
            </button>
          </div>
        </div>
      ) : (
        <button
          className="text-button leave-button"
          disabled={disabled}
          onClick={() => setConfirmLeave(true)}
        >
          <DoorOpen size={17} /> 방 나가기
        </button>
      )}
      <p className="field-hint">
        창을 닫거나 연결이 끊겨도 자리는 유지돼요. 퇴장은 ‘방 나가기’를 눌러
        주세요. 참가자별 접속 여부는 표시하지 않아요.
      </p>
    </section>
  );
}
export default function App() {
  const arena = useArena();
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="초이스 아레나 홈">
          <span className="brand-icon">
            <Zap size={24} fill="currentColor" />
          </span>
          <span>
            CHOICE<span className="brand-light"> ARENA</span>
          </span>
        </a>
        <div className="header-right">
          <span className="alpha-badge">EARLY ACCESS</span>
          {arena.user && (
            <button
              className="text-button"
              disabled={!!arena.busy}
              onClick={() => void arena.logout()}
              title="로그아웃해도 참가 중인 방은 유지됩니다"
            >
              <LogOut size={16} />
              <span>로그아웃</span>
            </button>
          )}
        </div>
      </header>
      <main>
        <div className="page-topline">
          <span>
            <span className="status-dot" /> 선택이 이야기가 되는 곳
          </span>
          <span className="version">LOBBY · v0.1</span>
        </div>
        {usingEmulators && (
          <div className="notice">
            Firebase Emulator 연결 중 · 테스트 데이터 환경
          </div>
        )}
        {!arena.online && (
          <div className="notice warning" role="status">
            <WifiOff size={18} /> 인터넷 연결이 끊겼어요. 참가 중인 방은
            유지되며, 재연결 후 복원됩니다.
          </div>
        )}
        {arena.error && (
          <div className="notice error" role="alert">
            <span>{arena.error}</span>
            <button className="text-button" onClick={arena.reconnect}>
              다시 연결
            </button>
            <button
              className="icon-button"
              aria-label="오류 안내 닫기"
              onClick={arena.dismissError}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {arena.busy && (
          <div className="busy-toast" role="status">
            <LoaderCircle size={18} className="spin" />
            {arena.busy}…
          </div>
        )}
        <section className="intro">
          <span className="eyebrow accent">SAME WORLD. YOUR CHOICE.</span>
          <h1>
            같은 상황.
            <br />
            <span>다른 선택.</span> 새로운 이야기.
          </h1>
          <p>
            정답은 없어도, 전략은 있다.
            <br className="mobile-break" /> 친구와 함께 당신만의 선택을 펼쳐
            보세요.
          </p>
          <div className="game-facts">
            <span>
              <Users size={16} /> 최대 {GAME_CONFIG.maxPlayers}인
            </span>
            <span>
              <Coins size={16} /> 경기마다{" "}
              {GAME_CONFIG.startingCoins.toLocaleString("ko-KR")}코인
            </span>
            <span>
              <Layers3 size={16} /> 세 가지 선택
            </span>
          </div>
        </section>
        <div className="main-grid">
          <div className="interaction-column">
            {arena.loading ? (
              <section className="panel loading-panel">
                <LoaderCircle className="spin" />
                <h2>아레나에 연결하고 있어요</h2>
                <p className="muted">로그인과 참가 정보를 확인하고 있어요.</p>
                <button className="text-button" onClick={arena.reconnect}>
                  연결 다시 시도
                </button>
              </section>
            ) : !arena.user ? (
              <section className="panel welcome-panel">
                <span className="icon-tile">
                  <Gamepad2 size={28} />
                </span>
                <p className="eyebrow">당신의 다음 선택은?</p>
                <h2>
                  함께할수록 흥미로운
                  <br />
                  선택의 세계
                </h2>
                <p className="muted">
                  Google 계정으로 시작하고
                  <br />
                  친구들과 만날 대기실을 만들어 보세요.
                </p>
                <button
                  className="google-button"
                  disabled={!!arena.busy || !arena.online}
                  onClick={() => void arena.login()}
                >
                  <GoogleMark /> Google로 시작하기 <ArrowRight size={18} />
                </button>
                <div className="login-note">
                  <ShieldCheck size={15} />
                  <span>게임 닉네임만 다른 참가자에게 보여요</span>
                </div>
                <div className="welcome-bottom">
                  <span className="mini-dot" /> 로그인 · 친구 초대 · 실시간
                  대기실 이용 가능
                </div>
              </section>
            ) : !arena.profile ? (
              <NicknameForm arena={arena} />
            ) : arena.code ? (
              <Lobby key={arena.code} arena={arena} />
            ) : (
              <HomeActions arena={arena} />
            )}
            {arena.user &&
              arena.profile &&
              !arena.canMutate &&
              arena.online && (
                <p className="connection-note" role="status">
                  <Radio size={15} /> 서버 연결을 확인하고 있어요. 확인 후 방을
                  변경할 수 있어요.
                </p>
              )}
          </div>
          <ScenarioPreview />
        </div>
        <section className="how-it-works" aria-labelledby="how-title">
          <div className="section-heading">
            <h2 id="how-title">작은 선택, 무한한 가능성</h2>
            <span className="muted small">우리가 만들어 갈 게임</span>
          </div>
          <div className="feature-grid">
            <article>
              <span className="feature-number">01</span>
              <h3>하나의 상황을 마주하고</h3>
              <p>
                일상부터 생존, 판타지, SF까지.
                <br />
                다양한 세계의 이야기가 펼쳐져요.
              </p>
            </article>
            <article>
              <span className="feature-number">02</span>
              <h3>나만의 전략을 선택하고</h3>
              <p>
                동일한 {GAME_CONFIG.startingCoins.toLocaleString("ko-KR")}
                코인으로 시작해
                <br />세 가지 행동 중 하나를 선택해요.
              </p>
            </article>
            <article>
              <span className="feature-number">03</span>
              <h3>서로의 결과를 비교해요</h3>
              <p>
                코인, 아이템, 상태의 변화가
                <br />
                어떤 이야기를 만들지 확인해요.
              </p>
            </article>
          </div>
        </section>
        <div className="roadmap">
          <Sparkles size={18} />
          <span>다음 업데이트</span>
          <p>
            경기 진행 · 출석 · 랭크 <span className="pill subtle">준비 중</span>
          </p>
        </div>
      </main>
      <footer>
        <span className="footer-brand">CHOICE ARENA</span>
        <p>베팅 없이, 결제 없이. 오직 선택과 전략으로.</p>
        <span>매 경기 동일한 출발선</span>
      </footer>
    </div>
  );
}
