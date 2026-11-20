import {
  useEffect,
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
  Copy,
  DoorOpen,
  Gamepad2,
  LoaderCircle,
  LogOut,
  Settings,
  Users,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./lib/firebase";
import { useArena, type Arena } from "./lib/useArena";
import { updateSettings } from "./lib/gameApi";
import { normalizeCode, validNickname } from "./domain/game";
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
  return (
    <div className="page">
      <section className="home-hero">
        <p className="eyebrow">WELCOME BACK</p>
        <h1>{arena.profile?.nickname}님의 다음 선택은?</h1>
      </section>
      <div className="menu-grid">
        <Link
          className="menu-card play-card"
          to={arena.code ? `/rooms/${arena.code}` : "/play"}
        >
          <Gamepad2 />
          <h2>게임 시작</h2>
          <p>최대 3명 실시간 대기실</p>
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
  const nav = useNavigate();
  useEffect(() => {
    if (arena.code) nav(`/rooms/${arena.code}`);
  }, [arena.code, nav]);
  return (
    <div className="page">
      <div className="page-heading">
        <p className="eyebrow">PLAY</p>
        <h1>게임 시작</h1>
        <p>방을 만들어 친구를 초대하세요.</p>
      </div>
      <div className="two-grid">
        <section className="panel">
          <h2>새로운 방</h2>
          <p className="muted">
            친구에게 코드를 공유하세요. 최대 3명까지 참가할 수 있습니다.
          </p>
          <button
            className="primary full"
            onClick={() => void arena.create(3)}
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
    if (!arena.loading && !arena.code) nav("/home");
  }, [arena.loading, arena.code, nav]);
  if (!room || !user) return <Loading />;
  const mine = room.members[user.uid], host = room.hostId === user.uid;
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
        <p className="muted">현재는 대기실까지 이용할 수 있습니다. 경기 시작은 다음 단계에서 추가합니다.</p>
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
function SettingsPage({ arena }: { arena: Arena }) {
  const [avatar, setAvatar] = useState("default"),
    [saved, setSaved] = useState(false),
    [nickname, setNickname] = useState(arena.profile?.nickname || "");
  useEffect(() => {
    if (arena.user)
      void getDoc(doc(db, "settings", arena.user.uid)).then((s) => {
        setAvatar(s.data()?.avatarId || "default");
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
      <button
        className="primary full"
        disabled={!validNickname(nickname.trim())}
        onClick={async () => {
          await updateSettings(avatar, false, nickname);
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
