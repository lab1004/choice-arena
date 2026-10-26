import {
  ProfileForm,
  Points,
  Quests,
  Ranking,
  History,
} from "./pages/AccountPages";
import { MatchPage } from "./pages/MatchPages";
import { matchPath } from "../functions/src/shared/model";
import { useEffect, useRef, type ReactNode } from "react";
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
import { validCode } from "./domain/game";
import { usingEmulators } from "./lib/firebase";
import { GoogleMark, HomeActions, Lobby } from "./pages/LobbyForms";
import "./styles.css";
import "./pages.css";

const menu = [
  ["/play", "게임 시작", "친구와 함께할 방을 만들거나 참가하세요."],
  ["/quests", "일일 퀘스트", "매일 네 가지 도전과 작은 보상"],
  ["/ranking", "랭킹", "선택으로 쌓아갈 순위"],
  ["/history", "내 기록", "경기와 선택 돌아보기"],
  ["/settings", "설정", "닉네임·프로필 사진·익명 설정"],
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
      <Navigate
        to={
          arena.profile
            ? arena.code
              ? `/rooms/${arena.code}`
              : "/home"
            : "/onboarding"
        }
        replace
      />
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
      <ProfileForm arena={arena} onboarding />
    </Page>
  );
}
function Home({ arena }: { arena: Arena }) {
  return (
    <Page title={`${arena.profile?.nickname}님의 아레나`}>
      <section className="panel">
        <p>다음 선택을 시작해 볼까요?</p>
        <Points arena={arena} />
        {arena.code && (
          <Link
            className="primary route-link"
            to={
              arena.room?.matchId
                ? `/matches/${arena.room.matchId}/game`
                : `/rooms/${arena.code}`
            }
          >
            {arena.room?.matchId
              ? "경기 계속하기"
              : "참가 중인 대기실로 돌아가기"}
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
  if (arena.room.matchId && arena.room.status !== "waiting")
    return (
      <Navigate
        to={matchPath({
          id: arena.room.matchId,
          stage: arena.room.status === "finished" ? "finished" : "choosing",
        })}
        replace
      />
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
function Settings({ arena }: { arena: Arena }) {
  return (
    <Page title="설정">
      <Link className="route-link" to="/home">
        ← 메인 메뉴
      </Link>
      <ProfileForm arena={arena} />
      <p>로그아웃해도 참가 중인 방과 경기는 유지됩니다.</p>
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
              element={<MatchPage arena={arena} />}
            />
            <Route
              path="/matches/:matchId/result"
              element={<MatchPage arena={arena} />}
            />
            <Route
              path="/matches/:matchId"
              element={<MatchPage arena={arena} />}
            />
            <Route
              path="/matches/:matchId/game"
              element={<MatchPage arena={arena} />}
            />
            <Route path="/quests" element={<Quests arena={arena} />} />
            <Route
              path="/attendance"
              element={<Navigate to="/quests" replace />}
            />
            <Route path="/ranking" element={<Ranking />} />
            <Route path="/history" element={<History arena={arena} />} />
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
