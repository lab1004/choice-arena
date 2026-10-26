import { useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  THEMES,
  SCENARIOS,
  matchPath,
  type Match,
  type ScenarioChoice,
} from "../../functions/src/shared/model";
import type { Arena } from "../lib/useArena";
import { useDocument } from "../lib/live";
import { callGame } from "../lib/gameApi";
import { errorMessage } from "../lib/errors";
import { Avatar, signed } from "./AccountPages";
function Choice({
  c,
  index,
  coins,
  disabled,
  onSelect,
}: {
  c: ScenarioChoice;
  index: number;
  coins: number;
  disabled: boolean;
  onSelect: () => void;
}) {
  const short = coins < c.requiredCost;
  return (
    <button
      className="choice-card"
      disabled={disabled || short}
      onClick={onSelect}
    >
      <strong>
        {index + 1}. {c.title}
      </strong>
      <span>필요 비용 {c.requiredCost}코인</span>
      <div className="probabilities">
        <div>
          <b>성공 {c.successProbability}%</b>
          <span>최종 {signed(c.successNetChange)}코인</span>
        </div>
        <div>
          <b>실패 {100 - c.successProbability}%</b>
          <span>
            {c.failureNetChange === 0
              ? "변화 없음"
              : `최종 ${signed(c.failureNetChange)}코인`}
          </span>
        </div>
      </div>
      {short && <span>코인이 부족합니다</span>}
      {c.isTimeoutDefault && (
        <span className="muted">시간 초과 시 이 행동을 선택해요</span>
      )}
    </button>
  );
}
export function MatchPage({ arena }: { arena: Arena }) {
  const { matchId = "" } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const {
    data: m,
    error,
    loaded,
  } = useDocument<Match>(
    /^[a-zA-Z0-9_-]{1,80}$/.test(matchId) ? `matches/${matchId}` : null,
  );
  const [now, setNow] = useState(Date.now()),
    [clockReady, setClockReady] = useState(false),
    [syncError, setSyncError] = useState(""),
    [choice, setChoice] = useState<ScenarioChoice | null>(null),
    [leaving, setLeaving] = useState(false);
  const offset = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (choice) dialog.current?.showModal();
    else dialog.current?.close();
  }, [choice]);
  useEffect(() => {
    setChoice(null);
  }, [m?.stage, m?.round]);
  useEffect(() => {
    if (!m) return;
    let active = true,
      inFlight = false;
    setClockReady(false);
    const sync = async () => {
      if (inFlight || !navigator.onLine) return;
      inFlight = true;
      const before = Date.now();
      try {
        const r = await callGame<{ serverNow: number }>("sync", { matchId });
        if (active) {
          offset.current = r.serverNow - (before + Date.now()) / 2;
          setClockReady(true);
          setSyncError("");
          setNow(Date.now() + offset.current);
        }
      } catch (e) {
        if (active) setSyncError(errorMessage(e));
      } finally {
        inFlight = false;
      }
    };
    void sync();
    const poll = setInterval(() => void sync(), 3000),
      tick = setInterval(() => setNow(Date.now() + offset.current), 250);
    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [matchId, !!m]);
  if (error)
    return (
      <section className="route-page">
        <h1>경기에 접근할 수 없어요</h1>
        <p role="alert">{error}</p>
        <Link to="/home">메인 메뉴로</Link>
      </section>
    );
  if (!loaded)
    return (
      <section className="route-page">
        <h1>경기 연결 중</h1>
        <p role="status">현재 진행 상태를 복원하고 있어요.</p>
      </section>
    );
  if (!m || !m.memberIds.includes(arena.user!.uid))
    return (
      <section className="route-page">
        <h1>경기를 찾을 수 없어요</h1>
        <Link to="/home">메인 메뉴로</Link>
      </section>
    );
  const canonical = matchPath(m);
  if (pathname !== canonical) return <Navigate to={canonical} replace />;
  const uid = arena.user!.uid,
    mine = m.players[uid],
    time = Math.max(0, Math.ceil((m.deadline - now) / 1000)),
    finished = ["finished", "cancelled"].includes(m.stage),
    voting = ["modeVote", "themeVote"].includes(m.stage),
    locked = !!arena.busy || !arena.online || !clockReady || time === 0;
  const exit = () =>
    void arena.run("경기 나가는 중", async () => {
      await callGame("exit", { matchId });
      navigate("/home", { replace: true });
    });
  return (
    <section className="route-page match-page">
      <div className="match-heading">
        <div>
          <p className="eyebrow">
            {m.mode === "story"
              ? THEMES.find((t) => t.id === m.themeId)?.name
              : m.mode === "random"
                ? "랜덤 모드"
                : "함께 고르는 모험"}
          </p>
          <h1>
            {finished
              ? "최종 결과"
              : voting
                ? "게임 방식 선택"
                : `${m.round} / ${m.totalRounds} 라운드`}
          </h1>
        </div>
        {!finished && (
          <div className="timer" role="timer" aria-label="남은 시간">
            {clockReady ? `${time}초` : "동기화 중"}
          </div>
        )}
      </div>
      {syncError && (
        <p className="notice error" role="alert">
          {syncError}
        </p>
      )}
      <div className="match-players">
        {m.memberIds.map((id) => (
          <div className={`panel ${id === uid ? "is-me" : ""}`} key={id}>
            <Avatar id={m.players[id].avatarId} />
            <strong>
              {m.players[id].nickname}
              {id === uid ? " (나)" : ""}
            </strong>
            <b>{m.players[id].coins.toLocaleString()}코인</b>
            <span>
              {m.players[id].forfeited
                ? "중도 포기"
                : !m.players[id].alive
                  ? "탈락 · 관전"
                  : m.confirmedIds.includes(id) && !voting
                    ? "선택 확정"
                    : "생존"}
            </span>
          </div>
        ))}
      </div>
      {!finished && !mine.alive && (
        <p className="notice">
          관전 중입니다. 공개된 결과와 다른 참가자의 진행 상황을 볼 수 있어요.
        </p>
      )}
      {voting && (
        <section className="panel">
          <h2>
            {m.stage === "modeVote"
              ? "어떤 방식으로 플레이할까요?"
              : "이야기의 배경을 골라 주세요"}
          </h2>
          <p>
            전원이 투표하면 바로 결정합니다. 동률은 서버 추첨, 미투표는 기권으로
            처리해요.
          </p>
          <p>
            {m.votedIds.length} / {m.memberIds.length}명 투표 완료
          </p>
          <div className="stack">
            {(m.stage === "modeVote"
              ? [
                  {
                    id: "story",
                    name: "스토리 모드",
                    summary: "이어지는 이야기 · 12라운드",
                  },
                  {
                    id: "random",
                    name: "랜덤 모드",
                    summary: "여러 테마를 넘나드는 선택 · 10라운드",
                  },
                ]
              : THEMES
            ).map((t) => (
              <button
                className="secondary vote-card"
                key={t.id}
                disabled={locked || m.votedIds.includes(uid) || mine.forfeited}
                onClick={() =>
                  void arena.run("투표 저장 중", () =>
                    callGame("vote", { matchId, value: t.id }),
                  )
                }
              >
                <strong>{t.name}</strong>
                <span>{t.summary}</span>
              </button>
            ))}
          </div>
          {m.votedIds.includes(uid) && (
            <p role="status">투표를 저장했어요. 다른 참가자를 기다립니다.</p>
          )}
        </section>
      )}
      {m.stage === "choosing" && m.scenario && (
        <>
          <section className="panel scenario">
            <p className="eyebrow">
              {THEMES.find((t) => t.id === m.scenario!.themeId)?.name}
            </p>
            <h2>{m.scenario.title}</h2>
            <p>{m.scenario.description}</p>
          </section>
          <p>
            아래 변화량에는 비용이 이미 반영되어 있어요. 비용을 다시 차감하지
            않습니다.
          </p>
          <div className="stack">
            {m.scenario.choices.map((c, i) => (
              <Choice
                key={c.id}
                c={c}
                index={i}
                coins={mine.coins}
                disabled={locked || !mine.alive || m.confirmedIds.includes(uid)}
                onSelect={() => setChoice(c)}
              />
            ))}
          </div>
          {m.confirmedIds.includes(uid) && (
            <p className="notice" role="status">
              선택 확정 · 공개될 때까지 다른 참가자의 선택은 숨겨집니다.
            </p>
          )}
        </>
      )}
      {m.stage === "countdown" && (
        <section className="panel countdown" role="status">
          <h2>선택이 잠겼어요</h2>
          <strong>{time}</strong>
          <p>서버에서 모든 결과를 함께 공개합니다.</p>
        </section>
      )}
      {(m.stage === "roundResult" || finished) && m.results.length > 0 && (
        <section className="panel round-results">
          <h2>{m.results.at(-1)!.round}라운드 결과</h2>
          {Object.entries(m.results.at(-1)!.outcomes).map(([id, o]) => (
            <article key={id}>
              <h3>{m.players[id].nickname}</h3>
              <p>
                {
                  SCENARIOS.find(
                    (s) => s.id === m.results.at(-1)!.scenarioId,
                  )?.choices.find((c) => c.id === o.choiceId)?.title
                }
                {o.timedOut ? " · 시간 초과 자동 선택" : ""}
              </p>
              <strong
                className={o.success ? "outcome-success" : "outcome-failure"}
              >
                {o.success ? "✓ 성공" : "✕ 실패"} ·{" "}
                {o.change === 0 ? "변화 없음" : `최종 ${signed(o.change)}코인`}
              </strong>
              <p>{o.text}</p>
              {o.appliedChange !== o.change && (
                <p>코인은 0 아래로 내려가지 않습니다. 잔액 0코인 · 탈락</p>
              )}
            </article>
          ))}
          {!finished && <p>결과를 확인한 뒤 다음 라운드로 이동합니다.</p>}
        </section>
      )}
      {finished && (
        <section className="panel">
          <h2>
            {m.stage === "cancelled"
              ? "경기가 취소되었습니다"
              : Object.values(m.awards).some((a) => a.winner)
                ? `${m.memberIds
                    .filter((id) => m.awards[id].winner)
                    .map((id) => m.players[id].nickname)
                    .join(
                      ", ",
                    )} ${Object.values(m.awards).filter((a) => a.winner).length > 1 ? "공동 우승" : "우승"}`
                : "모두 탈락 · 무승부"}
          </h2>
          {m.memberIds.map((id) => {
            const a = m.awards[id];
            return (
              a && (
                <article className="award-row" key={id}>
                  <h3>
                    {a.rank}위 · {m.players[id].nickname}
                  </h3>
                  <p>최종 {m.players[id].coins}코인</p>
                  <p>
                    기본 승리 {a.base} P + 성과 보너스 {a.bonus} P
                  </p>
                  <strong>최종 지급 {a.points} P</strong>
                </article>
              )
            );
          })}
          <p>포인트는 서버에서 한 번만 지급됩니다.</p>
          {arena.room?.matchId === matchId && arena.room.hostId === uid && (
            <button
              className="primary"
              disabled={!!arena.busy}
              onClick={() =>
                void arena.run("재대결 준비 중", async () => {
                  await callGame("rematch", { matchId });
                  navigate(`/rooms/${m.roomCode}`);
                })
              }
            >
              재대결 대기실 열기
            </button>
          )}
          {arena.code === m.roomCode && arena.room?.status === "waiting" && (
            <Link className="primary route-link" to={`/rooms/${m.roomCode}`}>
              재대결 대기실로
            </Link>
          )}
          <Link className="secondary route-link" to="/home">
            메인 메뉴
          </Link>
        </section>
      )}
      {leaving ? (
        <div className="panel" role="alert">
          <p>
            {finished
              ? "방을 나갈까요?"
              : "경기에서 나가면 중도 포기하며 이번 경기에서 다시 선택할 수 없습니다. 계속할까요?"}
          </p>
          <button className="danger" disabled={!!arena.busy} onClick={exit}>
            확인하고 나가기
          </button>
          <button className="secondary" onClick={() => setLeaving(false)}>
            취소
          </button>
        </div>
      ) : (
        arena.code === m.roomCode && (
          <button className="text-button" onClick={() => setLeaving(true)}>
            {finished ? "방 나가기" : "경기 중도 포기"}
          </button>
        )
      )}
      <dialog
        ref={dialog}
        onCancel={() => setChoice(null)}
        aria-labelledby="confirm-title"
      >
        <h2 id="confirm-title">이 선택을 확정할까요?</h2>
        <p>{choice?.title}</p>
        <p>확정 후에는 변경할 수 없습니다.</p>
        <button
          className="primary"
          disabled={locked || m.stage !== "choosing"}
          onClick={() => {
            const selected = choice;
            setChoice(null);
            if (selected)
              void arena.run("선택 확정 중", () =>
                callGame("choose", {
                  matchId,
                  round: m.round,
                  choiceId: selected.id,
                }),
              );
          }}
        >
          선택 확정
        </button>
        <button className="secondary" onClick={() => setChoice(null)}>
          다시 고르기
        </button>
      </dialog>
    </section>
  );
}
