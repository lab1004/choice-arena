import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Cat,
  Rocket,
  Compass,
  Flower,
  Star,
  Flame,
  Moon,
  Sun,
  Check,
  Coins,
  Copy,
  DoorOpen,
  Gamepad2,
  History,
  ListChecks,
  LoaderCircle,
  LogOut,
  Medal,
  Settings,
  Users,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "./lib/firebase";
import { useArena, type Arena } from "./lib/useArena";
import {
  advance,
  choose,
  claimQuest,
  getQuests,
  getRanking,
  loadHistory,
  startMatch,
  serverNow,
  updateSettings,
  vote,
  watchMatch,
} from "./lib/gameApi";
import { normalizeCode, validNickname, type PlayChoice } from "./domain/game";
import "./styles.css";
const AVATARS = [
  "avatar-1",
  "avatar-2",
  "avatar-3",
  "avatar-4",
  "avatar-5",
  "avatar-6",
  "avatar-7",
  "avatar-8",
];
function GoogleMark() {
  return <span className="google-mark">G</span>;
}
function Avatar({
  id = "default",
  name = "?",
}: {
  id?: string;
  name?: string;
}) {
  const icons = [Cat, Rocket, Compass, Flower, Star, Flame, Moon, Sun];
  const Icon = id.startsWith("avatar-")
    ? icons[Number(id.slice(7)) - 1]
    : id === "anonymous"
      ? Users
      : undefined;
  return (
    <span
      className={`avatar ${id}`}
      aria-label={id === "anonymous" ? "익명 프로필" : `${name} 프로필`}
    >
      {Icon ? <Icon size={24} aria-hidden="true" /> : name.slice(0, 1)}
    </span>
  );
}
function useStats(uid?: string) {
  const [v, setV] = useState<any>({ points: 0, games: 0, wins: 0 });
  useEffect(
    () =>
      uid
        ? onSnapshot(doc(db, "playerStats", uid), (s) =>
            setV(s.data() || { points: 0, games: 0, wins: 0 }),
          )
        : undefined,
    [uid],
  );
  return v;
}
function Layout({ arena, children }: { arena: Arena; children: ReactNode }) {
  const [requestError, setRequestError] = useState("");
  const location = useLocation();
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      setRequestError(
        event.reason instanceof Error
          ? event.reason.message
          : "서버 요청에 실패했습니다. 다시 시도하세요.",
      );
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);
  useEffect(() => setRequestError(""), [location.pathname]);
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/home">
          <span className="brand-icon">
            <Zap size={22} />
          </span>
          <b>
            CHOICE <span>ARENA</span>
          </b>
        </Link>
        {arena.user && (
          <button className="ghost" onClick={() => void arena.logout()}>
            <LogOut size={17} />
            로그아웃
          </button>
        )}
      </header>
      {requestError && (
        <div className="notice error" role="alert">
          <span>{requestError}</span>
          <button
            className="icon-button"
            onClick={() => setRequestError("")}
            aria-label="오류 닫기"
          >
            <X />
          </button>
        </div>
      )}
      {!arena.online && (
        <div className="notice warning">
          <WifiOff size={18} />
          인터넷 연결이 끊겼습니다.
        </div>
      )}
      {arena.error && (
        <div className="notice error">
          <span>{arena.error}</span>
          <button className="icon-button" onClick={arena.dismissError}>
            <X />
          </button>
        </div>
      )}
      {arena.busy && (
        <div className="busy-toast">
          <LoaderCircle className="spin" /> {arena.busy}
        </div>
      )}
      <main>{children}</main>
      {arena.user && arena.profile && (
        <nav className="bottom-nav">
          <Link to="/home">홈</Link>
          <Link to="/play">게임</Link>
          <Link to="/quests">퀘스트</Link>
          <Link to="/ranking">랭킹</Link>
          <Link to="/settings">설정</Link>
        </nav>
      )}
    </div>
  );
}
function Guard({ arena, children }: { arena: Arena; children: ReactNode }) {
  if (arena.loading) return <Loading />;
  if (!arena.user) return <Navigate to="/login" replace />;
  if (!arena.profile) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}
function Loading() {
  return (
    <section className="panel center">
      <LoaderCircle className="spin" />
      <h2>아레나에 연결하고 있어요</h2>
    </section>
  );
}
function Login({ arena }: { arena: Arena }) {
  if (arena.loading) return <Loading />;
  if (arena.user)
    return <Navigate to={arena.profile ? "/home" : "/onboarding"} replace />;
  return (
    <section className="auth-card panel">
      <div className="hero-icon">
        <Gamepad2 />
      </div>
      <p className="eyebrow">같은 상황, 다른 선택</p>
      <h1>선택이 전략이 되는 곳</h1>
      <p className="muted">
        Google 계정으로 로그인하고 친구와 실시간으로 플레이하세요.
      </p>
      <button
        className="google-button"
        disabled={!arena.online}
        onClick={() => void arena.login()}
      >
        <GoogleMark />
        Google로 시작하기
      </button>
    </section>
  );
}
function Onboarding({ arena }: { arena: Arena }) {
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("default");
  if (!arena.user) return <Navigate to="/login" />;
  if (arena.profile) return <Navigate to="/home" />;
  async function submit(e: FormEvent) {
    e.preventDefault();
    await updateSettings(avatar, false, nickname);
  }
  return (
    <section className="panel page-card">
      <p className="eyebrow">프로필 만들기</p>
      <h1>아레나에서 사용할 모습을 정하세요</h1>
      <form onSubmit={(e) => void submit(e)}>
        <label htmlFor="nickname">닉네임</label>
        <input
          id="nickname"
          value={nickname}
          maxLength={12}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="닉네임 입력"
        />
        <label>프로필 사진</label>
        <div className="avatar-picker">
          {AVATARS.map((id, i) => (
            <button
              type="button"
              className={avatar === id ? "selected" : ""}
              onClick={() => setAvatar(id)}
              key={id}
            >
              <Avatar id={id} name={String(i + 1)} />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="text-button"
          onClick={() => setAvatar("default")}
        >
          건너뛰기
        </button>
        <button
          className="primary full"
          disabled={!validNickname(nickname.trim())}
        >
          완료
        </button>
      </form>
    </section>
  );
}
function Home({ arena }: { arena: Arena }) {
  const stats = useStats(arena.user?.uid);
  return (
    <div className="page">
      <section className="home-hero">
        <p className="eyebrow">WELCOME BACK</p>
        <h1>{arena.profile?.nickname}님의 다음 선택은?</h1>
        <div className="point-box">
          <Coins />
          <div>
            <span>보유 포인트</span>
            <strong>{stats.points || 0} P</strong>
          </div>
        </div>
      </section>
      {arena.room?.matchId && arena.room.status === "playing" && (
        <Link
          className="resume-card"
          to={`/matches/${arena.room.matchId}/game`}
        >
          진행 중인 경기 계속하기 →
        </Link>
      )}
      <div className="menu-grid">
        <Link
          className="menu-card play-card"
          to={arena.code ? `/rooms/${arena.code}` : "/play"}
        >
          <Gamepad2 />
          <h2>게임 시작</h2>
          <p>1vs1 또는 1vs1vs1</p>
        </Link>
        <Link className="menu-card" to="/quests">
          <ListChecks />
          <h3>일일 퀘스트</h3>
        </Link>
        <Link className="menu-card" to="/ranking">
          <Medal />
          <h3>랭킹</h3>
        </Link>
        <Link className="menu-card" to="/history">
          <History />
          <h3>내 기록</h3>
        </Link>
        <Link className="menu-card" to="/settings">
          <Settings />
          <h3>설정</h3>
        </Link>
      </div>
    </div>
  );
}
function Play({ arena }: { arena: Arena }) {
  const [code, setCode] = useState("");
  const [capacity, setCapacity] = useState(2);
  const nav = useNavigate();
  useEffect(() => {
    if (arena.code) nav(`/rooms/${arena.code}`);
  }, [arena.code, nav]);
  return (
    <div className="page">
      <div className="page-heading">
        <p className="eyebrow">PLAY</p>
        <h1>게임 시작</h1>
        <p>인원을 선택하고 방을 만들어 친구를 초대하세요.</p>
      </div>
      <div className="two-grid">
        <section className="panel">
          <h2>새로운 방</h2>
          <div className="mode-selector">
            {[2, 3].map((n) => (
              <button
                className={capacity === n ? "primary" : "secondary"}
                key={n}
                onClick={() => setCapacity(n)}
              >
                {n === 2 ? "1 vs 1" : "1 vs 1 vs 1"}
              </button>
            ))}
          </div>
          <p className="muted">
            친구에게 코드를 공유하세요. 최대 3명까지 참가할 수 있습니다.
          </p>
          <button
            className="primary full"
            onClick={() => void arena.create(capacity)}
          >
            방 만들기
          </button>
        </section>
        <section className="panel">
          <h2>코드로 참가</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void arena.join(code);
            }}
          >
            <input
              aria-label="6자리 방 코드"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              placeholder="6자리 코드 입력"
            />
            <button className="secondary full" disabled={code.length !== 6}>
              참가하기
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
function Lobby({ arena }: { arena: Arena }) {
  const nav = useNavigate(),
    room = arena.room,
    user = arena.user;
  useEffect(() => {
    if (room?.matchId) nav(`/matches/${room.matchId}/game`);
    else if (!arena.loading && !arena.code) nav("/home");
  }, [room?.matchId, arena.loading, arena.code, nav]);
  if (!room || !user) return <Loading />;
  const mine = room.members[user.uid],
    host = room.hostId === user.uid,
    allReady =
      room.memberIds.length === room.maxPlayers &&
      room.memberIds.every((id) => room.members[id].ready);
  async function start() {
    const r = (await startMatch(arena.code!)) as any;
    nav(`/matches/${r.data.matchId}/game`);
  }
  return (
    <div className="page">
      <section className="panel lobby">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LOBBY</p>
            <h1>선택의 시작점</h1>
          </div>
          <span className="pill">
            <Users size={15} />
            {room.memberIds.length}/{room.maxPlayers}
          </span>
        </div>
        <div className="invite-box">
          <div>
            <span>초대 코드</span>
            <strong>{arena.code}</strong>
          </div>
          <button
            className="icon-button"
            onClick={() => navigator.clipboard.writeText(arena.code!)}
          >
            <Copy />
          </button>
        </div>
        <div className="players">
          {room.memberIds.map((id, i) => (
            <div className="player-row" key={id}>
              <Avatar id={`avatar-${i + 1}`} name={room.members[id].nickname} />
              <div>
                <strong>{room.members[id].nickname}</strong>
                <p>{room.hostId === id ? "방장" : "참가자"}</p>
                {host && id !== user.uid && (
                  <button
                    className="text-button"
                    disabled={!!arena.busy}
                    onClick={() => void arena.transfer(id)}
                  >
                    방장 위임
                  </button>
                )}
              </div>
              <span className={room.members[id].ready ? "ready" : "waiting"}>
                {room.members[id].ready ? "준비 완료" : "대기 중"}
              </span>
            </div>
          ))}
        </div>
        <button
          className="secondary full"
          disabled={!!arena.busy || !arena.canMutate}
          onClick={() => void arena.ready(!mine.ready)}
        >
          {mine.ready ? "준비 취소" : "준비 완료"}
          <Check />
        </button>
        {host && (
          <button
            className="primary full"
            disabled={!allReady || !!arena.busy}
            onClick={() => void start()}
          >
            경기 시작
          </button>
        )}
        <button
          className="text-button leave"
          onClick={() => {
            if (window.confirm("방에서 나갈까요?")) void arena.leave();
          }}
        >
          <DoorOpen />방 나가기
        </button>
      </section>
    </div>
  );
}
function useMatch(id?: string) {
  const [match, setMatch] = useState<any>(),
    [error, setError] = useState("");
  useEffect(
    () =>
      id ? watchMatch(id, setMatch, (e) => setError(e.message)) : undefined,
    [id],
  );
  return { match, error };
}
function useCountdown(deadline: any, onDone: () => void) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!deadline) return;
    let lastAttempt = 0;
    const tick = () => {
      const ms = Math.max(0, deadline.toMillis() - serverNow());
      setLeft(Math.ceil(ms / 1000));
      if (ms === 0 && Date.now() - lastAttempt > 2500) {
        lastAttempt = Date.now();
        onDone();
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [deadline, onDone]);
  return left;
}
function MatchPage({ arena }: { arena: Arena }) {
  const { matchId } = useParams(),
    { match, error } = useMatch(matchId),
    [picked, setPicked] = useState(""),
    [sent, setSent] = useState(false);
  const done = useMemo(
    () => () => {
      if (matchId) void advance(matchId).catch(() => {});
    },
    [matchId],
  );
  useEffect(() => {
    if (matchId) void advance(matchId).catch(() => {});
  }, [matchId]);
  const left = useCountdown(match?.deadline, done);
  useEffect(() => {
    setPicked("");
    setSent(false);
  }, [match?.round, match?.phase]);
  if (error) return <div className="notice error">{error}</div>;
  if (!match) return <Loading />;
  const confirmed = sent || match.selectedIds?.includes(arena.user!.uid);
  if (match.phase === "finished")
    return <Navigate to={`/matches/${matchId}/result`} replace />;
  if (match.phase === "modeVote")
    return (
      <VotePanel
        key="mode"
        title="게임 방식을 선택하세요"
        options={[
          ["story", "스토리 모드"],
          ["random", "랜덤 모드"],
        ]}
        left={left}
        onVote={(v) => vote(matchId!, v)}
      />
    );
  if (match.phase === "themeVote")
    return (
      <VotePanel
        key="theme"
        title="스토리 테마를 선택하세요"
        options={[
          ["island", "무인도 생존"],
          ["medieval", "중세 도시"],
          ["space", "우주 탐사"],
          ["mansion", "미스터리 저택"],
        ]}
        left={left}
        onVote={(v) => vote(matchId!, v)}
      />
    );
  const me = arena.user?.uid,
    eliminated = me && !match.alive[me];
  return (
    <div className="game-page">
      <header className="game-status">
        <span>
          {match.round}/{match.totalRounds} 라운드
        </span>
        <strong>
          {match.phase === "countdown"
            ? `결과 공개까지 ${left}`
            : match.phase === "reveal"
              ? `다음 라운드까지 ${left}`
              : `${left}초`}
        </strong>
        <span>
          <Coins /> {me ? match.coins[me] : 0}
        </span>
      </header>
      <div className="score-strip">
        {match.participants.map((id: string) => (
          <span key={id} className={!match.alive[id] ? "eliminated" : ""}>
            {match.participantNames[id]} · {match.coins[id]}코인
          </span>
        ))}
      </div>
      {eliminated && match.phase !== "reveal" ? (
        <section className="panel center">
          <h2>탈락했습니다</h2>
          <p>남은 경기를 관전하고 있습니다.</p>
        </section>
      ) : match.phase === "playing" ? (
        <section className="scenario">
          <p className="eyebrow">{match.currentScenario.themeId}</p>
          <h1>{match.currentScenario.title}</h1>
          <p>{match.currentScenario.description}</p>
          <div className="choice-list">
            {match.currentScenario.choices.map((c: PlayChoice, i: number) => (
              <ChoiceCard
                key={c.id}
                choice={c}
                number={i + 1}
                coins={match.coins[me!]}
                selected={picked === c.id}
                disabled={confirmed}
                onClick={() => setPicked(c.id)}
              />
            ))}
          </div>
          <button
            className="primary full confirm-choice"
            disabled={!picked || confirmed}
            onClick={async () => {
              if (
                !window.confirm(
                  "이 선택을 확정할까요? 이후에는 바꿀 수 없습니다.",
                )
              )
                return;
              setSent(true);
              try {
                await choose(matchId!, picked, match.round);
              } catch (e) {
                setSent(false);
                window.alert(
                  e instanceof Error
                    ? e.message
                    : "선택을 저장하지 못했습니다.",
                );
              }
            }}
          >
            {confirmed
              ? "선택 완료 · 다른 플레이어를 기다리는 중"
              : "선택 확정"}
          </button>
        </section>
      ) : match.phase === "reveal" ? (
        <Results match={match} />
      ) : (
        <section className="panel center">
          <LoaderCircle className="spin" />
          <h2>모든 선택이 끝났습니다</h2>
          <p>{left}초 후 결과를 공개합니다.</p>
        </section>
      )}
    </div>
  );
}
function ChoiceCard({
  choice: c,
  number,
  coins,
  selected,
  disabled,
  onClick,
}: {
  choice: PlayChoice;
  number: number;
  coins: number;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const insufficient = coins < c.requiredCost;
  return (
    <button
      className={`choice-card ${selected ? "selected" : ""}`}
      disabled={disabled || insufficient}
      onClick={onClick}
    >
      <div className="choice-title">
        <b>
          {number}. {c.title}
        </b>
        <span>필요 비용 {c.requiredCost}코인</span>
      </div>
      <div className="odds">
        <span>성공 {c.successProbability}%</span>
        <span>실패 {100 - c.successProbability}%</span>
      </div>
      <div className="outcomes">
        <span className="gain">성공 시 {signed(c.successNetChange)}</span>
        <span className="loss">실패 시 {signed(c.failureNetChange)}</span>
      </div>
      {insufficient && <em>코인이 부족합니다</em>}
    </button>
  );
}
const signed = (n: number) =>
  n === 0 ? "변화 없음" : `${n > 0 ? "+" : ""}${n}코인`;
function Results({ match }: { match: any }) {
  return (
    <section className="panel results">
      <p className="eyebrow">ROUND RESULT</p>
      <h1>선택의 결과</h1>
      {match.results?.map((r: any) => (
        <article key={r.key}>
          <div>
            <strong>{match.participantNames[r.uid]}</strong>
            <p>{r.choiceTitle}</p>
          </div>
          <div>
            <b className={r.success ? "gain" : "loss"}>
              {r.success ? "성공" : "실패"} · {signed(r.change)}
            </b>
            <p>{r.text}</p>
            <span>{r.coins}코인</span>
          </div>
        </article>
      ))}
    </section>
  );
}
function VotePanel({
  title,
  options,
  left,
  onVote,
}: {
  title: string;
  options: string[][];
  left: number;
  onVote: (v: string) => Promise<any>;
}) {
  const [done, setDone] = useState(false);
  return (
    <section className="panel vote-panel">
      <p className="timer">{left}초</p>
      <h1>{title}</h1>
      <div className="choice-list">
        {options.map(([v, l]) => (
          <button
            className="choice-card"
            disabled={done}
            onClick={() => {
              setDone(true);
              void onVote(v).catch((e) => {
                setDone(false);
                throw e;
              });
            }}
            key={v}
          >
            {l}
          </button>
        ))}
      </div>
      {done && <p>투표 완료 · 다른 플레이어를 기다리는 중</p>}
    </section>
  );
}
function ResultPage({ arena }: { arena: Arena }) {
  const { matchId } = useParams(),
    { match, error } = useMatch(matchId);
  if (error) return <div className="notice error">{error}</div>;
  if (!match) return <Loading />;
  if (match.phase !== "finished")
    return <Navigate to={`/matches/${matchId}/game`} replace />;
  const me = arena.user!.uid,
    won = match.winners?.includes(me),
    draw = match.winners?.length === 0;
  return (
    <section className="panel final-result">
      <Medal size={50} />
      <p className="eyebrow">MATCH COMPLETE</p>
      <h1>{draw ? "무승부" : won ? "승리했습니다!" : "경기가 끝났습니다"}</h1>
      <strong>{match.coins[me]}코인</strong>
      <p>획득 포인트 +{match.rewards?.[me] || 0}P</p>
      <div className="final-ranking">
        {[...match.participants]
          .sort((a, b) => match.coins[b] - match.coins[a])
          .map((id: string) => (
            <div key={id}>
              <span>
                {1 +
                  match.participants.filter(
                    (other: string) => match.coins[other] > match.coins[id],
                  ).length}
                위 {match.participantNames[id]}
              </span>
              <b>{match.coins[id]}코인</b>
            </div>
          ))}
      </div>
      <Link className="primary link-button" to="/home">
        홈으로
      </Link>
    </section>
  );
}
function Quests() {
  const [data, setData] = useState<any>(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const load = () =>
    getQuests()
      .then((r: any) => {
        setData(r.data);
        setError("");
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  if (error)
    return (
      <section className="panel">
        <p role="alert">{error}</p>
        <button className="secondary" onClick={() => void load()}>
          다시 시도
        </button>
      </section>
    );
  if (!data) return <Loading />;
  return (
    <div className="page">
      <div className="page-heading">
        <p className="eyebrow">DAILY QUEST</p>
        <h1>오늘의 퀘스트</h1>
        <p>{data.day} · 매일 4개가 새로 배정됩니다.</p>
      </div>
      <div className="quest-list">
        {data.quests.map((q: any) => (
          <section className="panel quest" key={q.id}>
            <div>
              <h3>{q.title}</h3>
              <p>
                {q.progress}/{q.target}
              </p>
            </div>
            <progress max={q.target} value={q.progress} />
            <button
              className="secondary"
              disabled={q.claimed || q.progress < q.target || busy === q.id}
              onClick={async () => {
                setBusy(q.id);
                try {
                  await claimQuest(q.id);
                  await load();
                } finally {
                  setBusy("");
                }
              }}
            >
              {q.claimed ? "수령 완료" : `+${q.rewardPoints}P 받기`}
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}
function Ranking() {
  const [rows, setRows] = useState<any[]>(),
    [error, setError] = useState("");
  const load = () =>
    getRanking()
      .then((r: any) => {
        setRows(r.data.rows);
        setError("");
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  if (error)
    return (
      <section className="panel">
        <p role="alert">{error}</p>
        <button className="secondary" onClick={() => void load()}>
          다시 시도
        </button>
      </section>
    );
  if (!rows) return <Loading />;
  let prev = -1,
    rank = 0;
  return (
    <div className="page">
      <div className="page-heading">
        <p className="eyebrow">RANKING</p>
        <h1>포인트 랭킹</h1>
      </div>
      <section className="panel ranking">
        {rows.map((r, i) => {
          if (r.points !== prev) {
            rank = i + 1;
            prev = r.points;
          }
          return (
            <div className="rank-row" key={r.key}>
              <b>{rank}</b>
              <Avatar id={r.avatarId} name={r.nickname} />
              <div>
                <strong>{r.nickname}</strong>
                <p>
                  {r.games}경기 · {r.wins}승
                </p>
              </div>
              <span>{r.points} P</span>
            </div>
          );
        })}
      </section>
    </div>
  );
}
function HistoryPage({ arena }: { arena: Arena }) {
  const [rows, setRows] = useState<any[]>();
  useEffect(() => {
    if (arena.user) void loadHistory(arena.user.uid).then(setRows);
  }, [arena.user]);
  if (!rows) return <Loading />;
  return (
    <div className="page">
      <div className="page-heading">
        <p className="eyebrow">HISTORY</p>
        <h1>내 기록</h1>
      </div>
      {rows.length === 0 ? (
        <section className="panel center">아직 완료한 경기가 없습니다.</section>
      ) : (
        <div className="history-list">
          {rows.map((r) => (
            <section className="panel history-card" key={r.id}>
              <b>
                {r.result === "win"
                  ? "승리"
                  : r.result === "draw"
                    ? "무승부"
                    : r.result === "eliminated"
                      ? "탈락"
                      : "패배"}
              </b>
              <span>
                {r.playerMode === "duel" ? "1vs1" : "1vs1vs1"} ·{" "}
                {r.gameMode === "story" ? "스토리" : "랜덤"}
              </span>
              <strong>
                {r.finalCoins}코인 · +{r.points}P
              </strong>
              <div className="history-details">
                <p>
                  {r.finishedAt?.toDate().toLocaleDateString("ko-KR")} ·{" "}
                  {r.rank}위
                </p>
                <details>
                  <summary>라운드별 기록</summary>
                  {r.roundHistory?.map((round: any) => {
                    const result = round.results.find(
                      (x: any) => x.uid === arena.user!.uid,
                    );
                    return result ? (
                      <article key={round.round}>
                        <b>
                          {round.round}라운드 · {round.title}
                        </b>
                        <p>
                          {result.choiceTitle} ·{" "}
                          {result.success ? "성공" : "실패"} ·{" "}
                          {signed(result.change)} → {result.coins}코인
                        </p>
                      </article>
                    ) : null;
                  })}
                </details>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
function SettingsPage({ arena }: { arena: Arena }) {
  const [avatar, setAvatar] = useState("default"),
    [anonymous, setAnonymous] = useState(false),
    [saved, setSaved] = useState(false),
    [nickname, setNickname] = useState(arena.profile?.nickname || "");
  useEffect(() => {
    if (arena.user)
      void getDoc(doc(db, "settings", arena.user.uid)).then((s) => {
        setAvatar(s.data()?.avatarId || "default");
        setAnonymous(!!s.data()?.anonymous);
      });
  }, [arena.user]);
  return (
    <section className="panel page-card">
      <p className="eyebrow">SETTINGS</p>
      <h1>프로필 설정</h1>
      <label htmlFor="edit-nickname">닉네임</label>
      <input
        id="edit-nickname"
        value={nickname}
        maxLength={12}
        onChange={(e) => setNickname(e.target.value)}
      />
      <label>프로필 사진</label>
      <div className="avatar-picker">
        {AVATARS.map((id, i) => (
          <button
            className={avatar === id ? "selected" : ""}
            onClick={() => setAvatar(id)}
            key={id}
          >
            <Avatar id={id} name={String(i + 1)} />
          </button>
        ))}
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
        />
        <span>랭킹에서 익명으로 표시</span>
      </label>
      <button
        className="primary full"
        disabled={!validNickname(nickname.trim())}
        onClick={async () => {
          await updateSettings(avatar, anonymous, nickname);
          setSaved(true);
        }}
      >
        저장
      </button>
      {saved && <p className="success-note">저장했습니다.</p>}
    </section>
  );
}
function AppRoutes() {
  const arena = useArena(),
    loc = useLocation();
  return (
    <Layout arena={arena}>
      <Routes location={loc}>
        <Route path="/login" element={<Login arena={arena} />} />
        <Route path="/onboarding" element={<Onboarding arena={arena} />} />
        <Route
          path="/home"
          element={
            <Guard arena={arena}>
              <Home arena={arena} />
            </Guard>
          }
        />
        <Route
          path="/play"
          element={
            <Guard arena={arena}>
              <Play arena={arena} />
            </Guard>
          }
        />
        <Route
          path="/rooms/:roomId"
          element={
            <Guard arena={arena}>
              <Lobby arena={arena} />
            </Guard>
          }
        />
        <Route
          path="/matches/:matchId/vote"
          element={
            <Guard arena={arena}>
              <MatchPage arena={arena} />
            </Guard>
          }
        />
        <Route
          path="/matches/:matchId/game"
          element={
            <Guard arena={arena}>
              <MatchPage arena={arena} />
            </Guard>
          }
        />
        <Route
          path="/matches/:matchId/result"
          element={
            <Guard arena={arena}>
              <ResultPage arena={arena} />
            </Guard>
          }
        />
        <Route
          path="/quests"
          element={
            <Guard arena={arena}>
              <Quests />
            </Guard>
          }
        />
        <Route
          path="/ranking"
          element={
            <Guard arena={arena}>
              <Ranking />
            </Guard>
          }
        />
        <Route
          path="/history"
          element={
            <Guard arena={arena}>
              <HistoryPage arena={arena} />
            </Guard>
          }
        />
        <Route
          path="/settings"
          element={
            <Guard arena={arena}>
              <SettingsPage arena={arena} />
            </Guard>
          }
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Layout>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
