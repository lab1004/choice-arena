import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
  useNavigate,
} from "react-router-dom";
import { Zap, LoaderCircle } from "lucide-react";
import { useArena, type Arena } from "./lib/useArena";
import { validNickname, validCode } from "./domain/game";
import { usingEmulators } from "./lib/firebase";
import {
  GoogleMark,
  NicknameForm,
  HomeActions,
  Lobby,
} from "./pages/LobbyForms";
import "./styles.css";
import "./pages.css";

const menu = [
  ["/play", "게임 시작", "친구와 함께할 방을 만들거나 참가하세요."],
  ["/attendance", "출석", "오늘의 출석과 보상"],
  ["/ranking", "랭킹", "선택으로 쌓아갈 순위"],
  ["/history", "내 기록", "경기와 선택 돌아보기"],
  ["/settings", "설정", "닉네임과 소리 설정"],
];
function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="route-page">
      <h1>{title}</h1>
      {children}
    </section>
  );
}
function Loading() {
  return (
    <div className="panel" role="status">
      <LoaderCircle className="spin" /> 정보를 확인하고 있어요.
    </div>
  );
}
function Gate({ arena }: { arena: Arena }) {
  if (arena.loading) return <Loading />;
  if (!arena.user) return <Navigate to="/login" replace />;
  if (!arena.profile) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
function Frame({ arena }: { arena: Arena }) {
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    document.title = "초이스 아레나";
    main.current?.focus();
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <div className="app-shell routed">
      <a className="skip-link" href="#page-content">
        본문으로 이동
      </a>
      <header className="site-header">
        <Link className="brand" to="/home">
          <span className="brand-icon">
            <Zap />
          </span>
          CHOICE ARENA
        </Link>
        {arena.user && (
          <button
            className="text-button"
            disabled={!!arena.busy}
            onClick={() => void arena.logout()}
          >
            로그아웃
          </button>
        )}
      </header>
      {usingEmulators && (
        <p className="notice">Firebase Emulator · 테스트 환경</p>
      )}
      {!arena.online && (
        <p className="notice warning" role="status">
          인터넷 연결이 끊겼어요. 참가 중인 방은 유지되며, 재연결 후 복원됩니다.
        </p>
      )}
      {arena.error && (
        <div className="notice error" role="alert">
          <span>{arena.error}</span>
          <button className="text-button" onClick={arena.reconnect}>
            다시 연결
          </button>
        </div>
      )}
      {arena.code && arena.online && !arena.canMutate && (
        <p className="notice" role="status">
          서버 연결을 확인하고 있어요. 확인 후 방을 변경할 수 있어요.
        </p>
      )}
      {arena.busy && (
        <p role="status" className="busy-toast">
          {arena.busy}…
        </p>
      )}
      <main id="page-content" ref={main} tabIndex={-1}>
        <Outlet />
      </main>
      <footer>
        <span>CHOICE ARENA</span>
        <span>같은 상황, 당신의 선택.</span>
      </footer>
    </div>
  );
}
function Login({ arena }: { arena: Arena }) {
  if (arena.user === undefined) return <Loading />;
  if (arena.user)
    return arena.loading ? (
      <Loading />
    ) : (
      <Navigate to={arena.profile ? "/home" : "/onboarding"} replace />
    );
  return (
    <Page title="초이스 아레나">
      <section className="panel login-card">
        <p className="eyebrow accent">SAME WORLD. YOUR CHOICE.</p>
        <h2>같은 상황, 서로 다른 선택</h2>
        <p>친구들과 세 가지 선택의 가능성을 펼쳐 보세요.</p>
        <button
          className="google-button"
          disabled={!!arena.busy || !arena.online}
          onClick={() => void arena.login()}
        >
          <GoogleMark />
          Google로 시작하기
        </button>
        <p className="field-hint">게임 닉네임만 다른 참가자에게 공개됩니다.</p>
      </section>
    </Page>
  );
}
function Onboarding({ arena }: { arena: Arena }) {
  if (arena.loading) return <Loading />;
  if (!arena.user) return <Navigate to="/login" replace />;
  if (arena.profile) return <Navigate to="/home" replace />;
  return (
    <Page title="첫 번째 선택">
      <NicknameForm arena={arena} />
    </Page>
  );
}
function Home({ arena }: { arena: Arena }) {
  return (
    <Page title={`${arena.profile?.nickname}님의 아레나`}>
      <section className="panel">
        <p>다음 선택을 시작해 볼까요?</p>
        <dl className="profile-stats">
          <div>
            <dt>보유 포인트</dt>
            <dd>준비 중</dd>
          </div>
        </dl>
        <p className="field-hint">
          포인트는 경기·보상 시스템 연결 후 제공됩니다.
        </p>
        {arena.code && (
          <Link className="primary route-link" to={`/rooms/${arena.code}`}>
            참가 중인 대기실로 돌아가기
          </Link>
        )}
      </section>
      <div className="menu-grid">
        {menu.map(([url, label, description]) => (
          <Link key={url} className="panel menu-card" to={url}>
            <strong>{label} →</strong>
            <span className="muted">{description}</span>
          </Link>
        ))}
      </div>
    </Page>
  );
}
function Play({ arena }: { arena: Arena }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (arena.code) navigate(`/rooms/${arena.code}`, { replace: true });
  }, [arena.code, navigate]);
  if (arena.code) return <Loading />;
  return (
    <Page title="어떻게 플레이할까요?">
      <Link className="route-link" to="/home">
        ← 메인 메뉴
      </Link>
      <HomeActions arena={arena} />
    </Page>
  );
}
function RoomPage({ arena }: { arena: Arena }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const wasMember = useRef(false);
  useEffect(() => {
    if (arena.code === roomId) wasMember.current = true;
    else if (wasMember.current && !arena.code)
      navigate("/play", { replace: true });
  }, [arena.code, roomId, navigate]);
  if (!roomId || !validCode(roomId) || arena.code !== roomId)
    return (
      <Page title="참가 권한을 확인해 주세요">
        <div className="panel">
          <p>
            현재 참가 중인 방이 아닙니다. 플레이 선택에서 초대 코드로 먼저
            참가해 주세요.
          </p>
          <Link className="primary route-link" to="/play">
            플레이 선택으로
          </Link>
        </div>
      </Page>
    );
  if (!arena.room)
    return (
      <Page title="대기실">
        <Lobby arena={arena} />
      </Page>
    );
  if (
    !arena.user ||
    !arena.room.memberIds.includes(arena.user.uid) ||
    arena.room.status !== "waiting"
  )
    return (
      <Page title="방 상태를 확인할 수 없어요">
        <p>참가 권한 또는 서버 상태가 변경되었습니다.</p>
        <button className="secondary" onClick={arena.reconnect}>
          다시 확인
        </button>
      </Page>
    );
  return (
    <Page title="대기실">
      <Link className="route-link" to="/home">
        ← 메인 메뉴 (참가 유지)
      </Link>
      <Lobby arena={arena} />
    </Page>
  );
}
const pending: Record<string, [string, string]> = {
  attendance: [
    "출석",
    "오늘 출석, 연속·누적 출석과 보상은 서버 보상 시스템 연결 후 제공됩니다.",
  ],
  ranking: [
    "랭킹",
    "닉네임으로 구성된 순위는 랭크 시스템 연결 후 제공됩니다. 이메일 등 개인정보는 공개하지 않습니다.",
  ],
  history: [
    "내 기록",
    "경기 목록, 상세 결과와 선택 내역은 실제 경기 기록이 저장되면 제공됩니다.",
  ],
};
function Pending({ kind }: { kind: string }) {
  const [title, description] = pending[kind];
  return (
    <Page title={title}>
      <div className="panel">
        <span className="pill">준비 중</span>
        <h2>{title} 기능을 준비하고 있어요</h2>
        <p>{description}</p>
        <Link className="route-link" to="/home">
          메인 메뉴로 돌아가기
        </Link>
      </div>
    </Page>
  );
}
function MatchUnavailable() {
  return (
    <Page title="경기 기능 준비 중">
      <div className="panel">
        <p>
          아직 서버에서 생성되는 경기가 없습니다. 투표·경기·최종 결과는 경기
          시스템 연결 후 참가 권한과 진행 단계를 확인하여 제공됩니다.
        </p>
        <p>주소를 입력해도 경기를 시작하거나 결과·보상을 생성할 수 없습니다.</p>
        <Link className="primary route-link" to="/home">
          메인 메뉴로 돌아가기
        </Link>
      </div>
    </Page>
  );
}
function Settings({ arena }: { arena: Arena }) {
  const [nickname, setNickname] = useState(arena.profile?.nickname ?? "");
  const [message, setMessage] = useState("");
  const [sound, setSound] = useState(() => {
    try {
      return localStorage.getItem("choice-arena:sound") !== "off";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (arena.profile?.nickname === nickname && message === "저장 중")
      setMessage("닉네임을 저장했어요.");
  }, [arena.profile?.nickname, nickname, message]);
  return (
    <Page title="설정">
      <Link className="route-link" to="/home">
        ← 메인 메뉴
      </Link>
      <section className="panel">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setMessage("저장 중");
            setNickname(nickname.trim());
            void arena.saveNickname(nickname.trim());
          }}
        >
          <label htmlFor="edit-nickname">게임 닉네임</label>
          <input
            id="edit-nickname"
            maxLength={12}
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              setMessage("");
            }}
            aria-describedby="edit-help"
          />
          <p id="edit-help" className="field-hint">
            한글·영문·숫자·밑줄 2~12자. 참가 중인 방에는 입장 당시 닉네임이
            표시됩니다.
          </p>
          <button
            className="primary"
            disabled={
              !!arena.busy ||
              !arena.online ||
              !validNickname(nickname.trim()) ||
              nickname.trim() === arena.profile?.nickname
            }
          >
            닉네임 저장
          </button>
          <p role="status">
            {arena.error ? "" : message === "저장 중" ? "" : message}
          </p>
        </form>
        <label className="sound-toggle">
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => {
              setSound(e.target.checked);
              try {
                localStorage.setItem(
                  "choice-arena:sound",
                  e.target.checked ? "on" : "off",
                );
                setMessage("소리 설정을 저장했어요.");
              } catch {
                setMessage("이 브라우저에서는 설정을 저장할 수 없어요.");
              }
            }}
          />{" "}
          소리 사용
        </label>
        <p className="field-hint">
          이 기기에 설정을 저장합니다. 효과음은 추후 제공됩니다.
        </p>
        <button
          className="secondary"
          disabled={!!arena.busy}
          onClick={() => void arena.logout()}
        >
          로그아웃
        </button>
        <p className="field-hint">로그아웃해도 참가 중인 방은 유지됩니다.</p>
      </section>
    </Page>
  );
}
export default function App() {
  const arena = useArena();
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Frame arena={arena} />}>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/login" element={<Login arena={arena} />} />
          <Route path="/onboarding" element={<Onboarding arena={arena} />} />
          <Route element={<Gate arena={arena} />}>
            <Route
              path="/customize"
              element={<Navigate to="/home" replace />}
            />
            <Route path="/home" element={<Home arena={arena} />} />
            <Route path="/play" element={<Play arena={arena} />} />
            <Route path="/rooms/:roomId" element={<RoomPage arena={arena} />} />
            <Route
              path="/matches/:matchId/vote"
              element={<MatchUnavailable />}
            />
            <Route
              path="/matches/:matchId/result"
              element={<MatchUnavailable />}
            />
            <Route path="/matches/:matchId" element={<MatchUnavailable />} />
            {Object.keys(pending).map((kind) => (
              <Route
                key={kind}
                path={`/${kind}`}
                element={<Pending kind={kind} />}
              />
            ))}
            <Route path="/settings" element={<Settings arena={arena} />} />
          </Route>
          <Route
            path="*"
            element={
              <Page title="페이지를 찾을 수 없어요">
                <Link className="primary route-link" to="/home">
                  메인 메뉴로
                </Link>
              </Page>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
