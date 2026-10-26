import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AVATARS,
  EMPTY_ACCOUNT,
  SCENARIOS,
  THEMES,
  type Account,
  type Award,
  type Outcome,
} from "../../functions/src/shared/model";
import {
  QUESTS,
  koreaDay,
  type Daily,
} from "../../functions/src/shared/quests";
import type { Arena } from "../lib/useArena";
import { validNickname } from "../domain/game";
import { callGame } from "../lib/gameApi";
import { errorMessage } from "../lib/errors";
import { useDocument, useHistory } from "../lib/live";
export function Avatar({
  id = "sprout",
  name = "프로필",
}: {
  id?: string;
  name?: string;
}) {
  return (
    <img
      className="avatar-image"
      src={`/avatars/${id}.svg`}
      alt={name}
      width="48"
      height="48"
    />
  );
}
const avatarNames = ["새싹", "달", "혜성", "파도", "태양", "잎"];
export function ProfileForm({
  arena,
  onboarding = false,
}: {
  arena: Arena;
  onboarding?: boolean;
}) {
  const [nickname, setNickname] = useState(arena.profile?.nickname ?? ""),
    [avatar, setAvatar] = useState(arena.profile?.avatarId ?? "sprout"),
    [anonymous, setAnonymous] = useState(
      arena.profile?.rankingAnonymous ?? false,
    ),
    [step, setStep] = useState(1),
    [saved, setSaved] = useState(false);
  const save = async () => {
    setSaved(false);
    await arena.saveNickname(nickname, avatar, anonymous);
    setSaved(true);
  };
  return (
    <section className="panel">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (onboarding && step === 1) setStep(2);
          else void save();
        }}
      >
        <h2>
          {onboarding
            ? step === 1
              ? "1. 닉네임 설정"
              : "2. 프로필 사진 선택"
            : "내 프로필"}
        </h2>
        {(!onboarding || step === 1) && (
          <>
            <label htmlFor="nickname">게임 닉네임</label>
            <input
              id="nickname"
              value={nickname}
              maxLength={12}
              autoComplete="nickname"
              onChange={(e) => {
                setNickname(e.target.value);
                setSaved(false);
              }}
            />
            <p className="field-hint">한글·영문·숫자·밑줄 2~12자</p>
          </>
        )}
        {(!onboarding || step === 2) && (
          <>
            <fieldset>
              <legend>프로필 사진</legend>
              <div className="avatar-picker">
                {AVATARS.map((id, i) => (
                  <button
                    key={id}
                    type="button"
                    className={
                      avatar === id ? "avatar-option selected" : "avatar-option"
                    }
                    aria-pressed={avatar === id}
                    onClick={() => setAvatar(id)}
                    aria-label={avatarNames[i]}
                  >
                    <Avatar id={id} name={avatarNames[i]} />
                  </button>
                ))}
              </div>
            </fieldset>
            {!onboarding && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                />
                랭킹에서 익명으로 표시
              </label>
            )}
            <p className="field-hint">
              사진 업로드 없이 기본 아바타를 사용합니다. 나중에 설정에서 바꿀 수
              있어요.
            </p>
          </>
        )}
        <button
          className="primary"
          disabled={
            !!arena.busy || !arena.online || !validNickname(nickname.trim())
          }
        >
          {onboarding
            ? step === 1
              ? "다음: 프로필 사진"
              : "가입 완료"
            : "프로필 저장"}
        </button>
        {onboarding && step === 2 && (
          <>
            <button
              className="secondary"
              type="button"
              disabled={!!arena.busy}
              onClick={() => setStep(1)}
            >
              이전
            </button>
            <button
              className="text-button"
              type="button"
              disabled={!!arena.busy}
              onClick={() => void arena.saveNickname(nickname, "sprout", false)}
            >
              사진 선택 건너뛰고 가입
            </button>
          </>
        )}
        {!onboarding && saved && !arena.error && (
          <p role="status">프로필을 저장했어요.</p>
        )}
      </form>
    </section>
  );
}
export function Points({ arena }: { arena: Arena }) {
  const account = useDocument<Account>(
    arena.user ? `accounts/${arena.user.uid}` : null,
  );
  const attempted = useRef("");
  useEffect(() => {
    const uid = arena.user?.uid;
    if (
      uid &&
      arena.profile &&
      account.loaded &&
      !account.data &&
      attempted.current !== uid
    ) {
      attempted.current = uid;
      void arena.run("계정 연결 중", () => callGame("ensureAccount"));
    }
  }, [arena.user, arena.profile, account.loaded, account.data, arena.run]);
  return (
    <>
      <dl className="profile-stats">
        <div>
          <dt>보유 포인트</dt>
          <dd>
            {account.data
              ? `${account.data.points.toLocaleString()} P`
              : account.loaded
                ? "계정 연결 필요"
                : "불러오는 중"}
          </dd>
        </div>
      </dl>
      {account.error && <p role="alert">{account.error}</p>}
      {account.loaded && !account.data && (
        <button
          className="secondary"
          disabled={!!arena.busy}
          onClick={() =>
            void arena.run("계정 연결 중", () => callGame("ensureAccount"))
          }
        >
          포인트 계정 연결
        </button>
      )}
    </>
  );
}
export function Quests({ arena }: { arena: Arena }) {
  const [day, setDay] = useState(koreaDay(Date.now())),
    [error, setError] = useState("");
  const daily = useDocument<Daily>(`accounts/${arena.user!.uid}/days/${day}`);
  useEffect(() => {
    let active = true;
    void callGame<Daily>("daily")
      .then((d) => {
        if (active) setDay(d.day);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    const t = setInterval(() => {
      void callGame<Daily>("daily")
        .then((d) => {
          if (active) setDay(d.day);
        })
        .catch((e) => {
          if (active) setError(errorMessage(e));
        });
    }, 60000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);
  return (
    <section className="route-page">
      <h1>일일 퀘스트</h1>
      <Link to="/home" className="route-link">
        ← 메인 메뉴
      </Link>
      <p>한국 시간 자정에 바뀌는 네 가지 도전 · {day}</p>
      <p className="muted">
        완료한 경기만 반영되며 중도 포기는 진행도에 포함되지 않습니다.
      </p>
      {(error || daily.error) && <p role="alert">{error || daily.error}</p>}
      {!daily.loaded && <p role="status">퀘스트를 불러오고 있어요.</p>}
      <div className="stack">
        {daily.data?.ids.map((id) => {
          const q = QUESTS.find((q) => q.id === id)!;
          const progress = daily.data!.progress[id] ?? 0,
            claimed = daily.data!.claimed.includes(id);
          return (
            <article className="panel quest" key={id}>
              <h2>{q.title}</h2>
              <p>
                {progress} / {q.target} · 보상 {q.rewardPoints} P
              </p>
              <progress
                value={progress}
                max={q.target}
                aria-label={`${q.title} 진행도`}
              />
              <button
                className="primary"
                disabled={!!arena.busy || claimed || progress < q.target}
                onClick={() =>
                  void arena.run("보상 수령 중", () =>
                    callGame("claim", { day, questId: id }),
                  )
                }
              >
                {claimed
                  ? "수령 완료"
                  : progress >= q.target
                    ? "보상 받기"
                    : "진행 중"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
interface Rank extends Account {
  rank: number;
  nickname: string;
  avatarId: string;
  me: boolean;
}
export function Ranking() {
  const [rows, setRows] = useState<Rank[] | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    void callGame<Rank[]>("ranking")
      .then((r) => {
        if (active) setRows(r);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [revision]);
  return (
    <section className="route-page">
      <h1>포인트 랭킹</h1>
      <Link to="/home" className="route-link">
        ← 메인 메뉴
      </Link>
      <p>보유 포인트 상위 100명 · 동점은 같은 순위입니다.</p>
      <button className="secondary" onClick={() => setRevision((v) => v + 1)}>
        새로고침
      </button>
      {error && <p role="alert">{error}</p>}
      {!rows && !error && <p role="status">순위를 불러오고 있어요.</p>}
      {rows?.length === 0 && (
        <p className="panel">아직 등록된 랭킹이 없어요.</p>
      )}
      <ol className="ranking-list">
        {rows?.map((r, i) => (
          <li className="panel ranking-row" key={i}>
            <strong>{r.rank}위</strong>
            <Avatar id={r.avatarId} />
            <div>
              <strong>
                {r.nickname}
                {r.me ? " (나)" : ""}
              </strong>
              <p>
                {r.games}경기 · {r.wins}승
              </p>
            </div>
            <strong>{r.points} P</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}
export interface HistoryRow {
  matchId: string;
  finishedAt: number;
  mode: string;
  themeId: string | null;
  playerCount: number;
  finalCoins: number;
  award: Award;
  status: string;
  rounds: (Outcome & { round: number; scenarioId: string })[];
}
const statusNames: Record<string, string> = {
  win: "승리",
  loss: "패배",
  draw: "무승부",
  eliminated: "탈락",
  forfeited: "중도 포기",
};
export function History({ arena }: { arena: Arena }) {
  const { rows, error, loaded } = useHistory<HistoryRow>(arena.user!.uid);
  return (
    <section className="route-page">
      <h1>내 기록</h1>
      <Link to="/home" className="route-link">
        ← 메인 메뉴
      </Link>
      <p>최근 완료한 경기 50개 · 선택과 결과는 본인에게만 공개됩니다.</p>
      {error && <p role="alert">{error}</p>}
      {!loaded && <p role="status">경기 기록을 불러오고 있어요.</p>}
      {loaded && !error && !rows.length && (
        <p className="panel">
          아직 완료한 경기가 없어요. 첫 선택을 시작해 보세요.
        </p>
      )}
      <div className="stack">
        {rows.map((r) => (
          <details className="panel history-entry" key={r.matchId}>
            <summary>
              {statusNames[r.status]} · {r.award.rank}위 · {r.finalCoins}코인 ·
              +{r.award.points} P<br />
              <span className="muted">
                {new Date(r.finishedAt).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </span>
            </summary>
            <p>
              {r.playerCount === 2 ? "1 vs 1" : "1 vs 1 vs 1"} ·{" "}
              {r.mode === "story" ? "스토리" : "랜덤"} ·{" "}
              {THEMES.find((t) => t.id === r.themeId)?.name ?? "다양한 테마"}
            </p>
            {r.rounds.map((o) => {
              const s = SCENARIOS.find((s) => s.id === o.scenarioId)!;
              return (
                <article key={o.round}>
                  <h3>
                    {o.round}R · {s.title}
                  </h3>
                  <p>
                    {s.choices.find((c) => c.id === o.choiceId)?.title}
                    {o.timedOut ? " (시간 초과 자동 선택)" : ""}
                  </p>
                  <p>
                    {o.success ? "✓ 성공" : "✕ 실패"} · 최종 {signed(o.change)}
                    코인
                  </p>
                  <p>{o.text}</p>
                </article>
              );
            })}
          </details>
        ))}
      </div>
    </section>
  );
}
export function signed(value: number) {
  return value > 0 ? `+${value}` : value === 0 ? "0" : `${value}`;
}
export { EMPTY_ACCOUNT };
