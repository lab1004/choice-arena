import { createHash, randomInt } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type Firestore,
  type Transaction,
  type DocumentReference,
} from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import content from "./game-content.json" with { type: "json" };
const themes = content.themes;
const scenarios = themes.flatMap((t) => t.scenarios);
const byId = new Map(scenarios.map((s) => [s.id, s]));
type Data = Record<string, any>;
const stamp = () => FieldValue.serverTimestamp();
export const REGION = "asia-northeast3";
export function requireUid(uid?: string) {
  if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  return uid;
}
function validId(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw new HttpsError("invalid-argument", "잘못된 식별자입니다.");
  return value;
}
const dayAt = (now: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const tally = (votes: Record<string, string>, allowed: string[]) => {
  const counts = allowed.map(
    (v) => Object.values(votes).filter((x) => x === v).length,
  );
  const max = Math.max(...counts);
  const ties = allowed.filter((_, i) => counts[i] === max);
  return ties[randomInt(ties.length)];
};
function scenario(id: string) {
  const s = byId.get(id);
  if (!s) throw new HttpsError("internal", "상황 데이터가 없습니다.");
  return s;
}
export const QUESTS = [
  ["play1", "게임 1회 완료", 1, 1],
  ["play2", "게임 2회 완료", 2, 1],
  ["win1", "경기 1회 승리", 1, 1],
  ["duel", "1vs1 경기 완료", 1, 1],
  ["triple", "1vs1vs1 경기 완료", 1, 1],
  ["story", "스토리 모드 완료", 1, 1],
  ["random", "랜덤 모드 완료", 1, 1],
  ["island", "무인도 생존 플레이", 1, 1],
  ["medieval", "중세 도시 플레이", 1, 1],
  ["space", "우주 탐사 플레이", 1, 1],
  ["mansion", "미스터리 저택 플레이", 1, 1],
  ["survive", "탈락하지 않고 완료", 1, 1],
  ["coins1200", "1,200코인 이상으로 종료", 1, 1],
  ["coins1500", "1,500코인 이상으로 종료", 1, 1],
  ["choose5", "선택 5회 완료", 5, 1],
  ["choose10", "선택 10회 완료", 10, 1],
  ["free3", "무료 선택 3회", 3, 1],
  ["paid3", "비용 있는 선택 3회", 3, 1],
  ["success3", "선택 결과 3회 성공", 3, 1],
  ["success5", "선택 결과 5회 성공", 5, 1],
  ["risk2", "성공 확률 50% 이하 선택 2회", 2, 1],
  ["safe2", "성공 확률 75% 이상 선택 2회", 2, 1],
  ["fast3", "10초 이상 남기고 선택 3회", 3, 1],
  ["round5", "5라운드 이상 생존", 1, 1],
  ["round10", "10라운드 이상 생존", 1, 1],
  ["positive3", "코인이 증가한 결과 3회", 3, 1],
  ["comeback", "1,000코인 미만에서 승리", 1, 1],
  ["highriskwin", "고위험 선택 성공", 1, 1],
  ["noTimeout", "시간 초과 없이 경기 완료", 1, 1],
  ["dailyFinish", "오늘의 경기 완료", 1, 1],
].map(([id, title, target, rewardPoints]) => ({
  id: String(id),
  title: String(title),
  target: Number(target),
  rewardPoints: Number(rewardPoints),
}));
export function dailyFor(uid: string, now: number) {
  const day = dayAt(now);
  return {
    day,
    quests: QUESTS.map((q) => ({
      q,
      key: createHash("sha256").update(`${uid}:${day}:${q.id}`).digest("hex"),
    }))
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(0, 4)
      .map(({ q }) => ({ ...q, progress: 0, claimed: false })),
  };
}
export function winnerIds(m: Data): string[] {
  const alive = m.participants.filter((id: string) => m.alive[id]);
  if (!alive.length) return [];
  const max = Math.max(...alive.map((id: string) => m.coins[id]));
  return alive.filter((id: string) => m.coins[id] === max);
}
export function rewardFor(coins: number) {
  return 10 + Math.min(5, Math.floor(Math.max(0, coins - 1000) / 200));
}
export function createService(
  db: Firestore,
  clock = () => Date.now(),
  draw = (max: number) => randomInt(max),
) {
  const expires = (seconds: number) =>
    Timestamp.fromMillis(clock() + seconds * 1000);
  const dailyRef = (uid: string) =>
    db.doc(`dailyQuests/${uid}/days/${dayAt(clock())}`);
  async function getQuests(uid: string) {
    return db.runTransaction(async (tx) => {
      const ref = dailyRef(uid),
        s = await tx.get(ref);
      if (s.exists) return s.data();
      const daily = dailyFor(uid, clock());
      tx.create(ref, { ...daily, createdAt: stamp() });
      return daily;
    });
  }
  async function claimQuest(uid: string, id: string) {
    return db.runTransaction(async (tx) => {
      const ref = dailyRef(uid),
        s = await tx.get(ref);
      if (!s.exists)
        throw new HttpsError(
          "failed-precondition",
          "퀘스트를 먼저 확인하세요.",
        );
      let reward = 0;
      const quests = s.data()!.quests.map((q: Data) => {
        if (q.id === id && !q.claimed && q.progress >= q.target) {
          reward = q.rewardPoints;
          return { ...q, claimed: true };
        }
        return q;
      });
      if (!reward)
        throw new HttpsError(
          "failed-precondition",
          "받을 수 있는 보상이 없습니다.",
        );
      tx.update(ref, { quests, updatedAt: stamp() });
      tx.set(
        db.doc(`playerStats/${uid}`),
        { points: FieldValue.increment(reward), updatedAt: stamp() },
        { merge: true },
      );
      tx.create(
        db.doc(`rewardLedger/${uid}/entries/quest-${dayAt(clock())}-${id}`),
        { points: reward, kind: "quest", createdAt: stamp() },
      );
      return { reward };
    });
  }
  function begin(m: Data, mode: string, themeId: string | null) {
    const sequence =
      mode === "story"
        ? themes.find((t) => t.id === themeId)!.scenarios.map((s) => s.id)
        : shuffle(scenarios.map((s) => s.id)).slice(0, 10);
    return {
      ...m,
      gameMode: mode,
      themeId,
      sequence,
      totalRounds: sequence.length,
      phase: "playing",
      votes: {},
      round: 1,
      currentScenario: scenario(sequence[0]),
      selectedCount: 0,
      selectedIds: [],
      results: [],
      deadline: expires(30),
    };
  }
  async function start(uid: string, code: string) {
    const roomRef = db.doc(`rooms/${validId(code)}`),
      ref = db.collection("matches").doc();
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(roomRef),
        room = snap.data();
      if (!room || room.hostId !== uid)
        throw new HttpsError("permission-denied", "방장만 시작할 수 있습니다.");
      if (room.status !== "waiting") return { matchId: room.matchId };
      if (
        room.memberIds.length !== room.maxPlayers ||
        !room.memberIds.every((id: string) => room.members[id].ready)
      )
        throw new HttpsError(
          "failed-precondition",
          "모든 자리가 채워지고 전원이 준비해야 합니다.",
        );
      const m = {
        roomCode: code,
        participants: room.memberIds,
        participantNames: Object.fromEntries(
          room.memberIds.map((id: string) => [id, room.members[id].nickname]),
        ),
        playerMode: room.maxPlayers === 2 ? "duel" : "triple",
        phase: "modeVote",
        votes: {},
        round: 0,
        totalRounds: 0,
        coins: Object.fromEntries(
          room.memberIds.map((id: string) => [id, 1000]),
        ),
        alive: Object.fromEntries(
          room.memberIds.map((id: string) => [id, true]),
        ),
        metrics: Object.fromEntries(
          room.memberIds.map((id: string) => [id, {}]),
        ),
        selectedIds: [],
        selectedCount: 0,
        roundHistory: [],
        revision: 1,
        deadline: expires(30),
        createdAt: stamp(),
        updatedAt: stamp(),
      };
      tx.create(ref, m);
      tx.update(roomRef, {
        status: "playing",
        matchId: ref.id,
        updatedAt: stamp(),
      });
      return { matchId: ref.id };
    });
  }
  async function finish(tx: Transaction, ref: DocumentReference, m: Data) {
    // Read all quest/session documents before any transaction writes.
    const reads = await Promise.all(
      m.participants.map(async (uid: string) => {
        const [daily, session] = await Promise.all([
          tx.get(dailyRef(uid)),
          tx.get(db.doc(`sessions/${uid}`)),
        ]);
        return { uid, daily, session };
      }),
    );
    const winners = winnerIds(m),
      rewards: Data = {};
    for (const { uid, daily, session } of reads) {
      const won = winners.includes(uid),
        points = won ? rewardFor(m.coins[uid]) : 0;
      rewards[uid] = points;
      const metric = { ...(m.metrics[uid] || {}) };
      for (const k of [
        "play1",
        "play2",
        "dailyFinish",
        m.playerMode,
        m.gameMode,
      ])
        metric[k] = (metric[k] || 0) + 1;
      if (m.themeId) metric[m.themeId] = (metric[m.themeId] || 0) + 1;
      if (won) metric.win1 = 1;
      if (m.alive[uid]) metric.survive = 1;
      if (!(metric.timeouts || 0)) metric.noTimeout = 1;
      if ((metric.survivedRounds || 0) >= 5) metric.round5 = 1;
      if ((metric.survivedRounds || 0) >= 10) metric.round10 = 1;
      if (m.coins[uid] >= 1200) metric.coins1200 = 1;
      if (m.coins[uid] >= 1500) metric.coins1500 = 1;
      if (won && m.coins[uid] < 1000) metric.comeback = 1;
      const d = daily.exists ? daily.data()! : dailyFor(uid, clock());
      tx.set(dailyRef(uid), {
        ...d,
        quests: d.quests.map((q: Data) => ({
          ...q,
          progress: Math.min(q.target, q.progress + (metric[q.id] || 0)),
        })),
        updatedAt: stamp(),
      });
      tx.set(
        db.doc(`playerStats/${uid}`),
        {
          points: FieldValue.increment(points),
          games: FieldValue.increment(1),
          wins: FieldValue.increment(won ? 1 : 0),
          updatedAt: stamp(),
        },
        { merge: true },
      );
      tx.create(db.doc(`rewardLedger/${uid}/entries/match-${ref.id}`), {
        kind: "match",
        points,
        version: 1,
        createdAt: stamp(),
      });
      const rank =
        1 +
        m.participants.filter((id: string) => m.coins[id] > m.coins[uid])
          .length;
      tx.set(db.doc(`histories/${uid}/matches/${ref.id}`), {
        matchId: ref.id,
        finishedAt: stamp(),
        playerMode: m.playerMode,
        gameMode: m.gameMode,
        themeId: m.themeId || null,
        finalCoins: m.coins[uid],
        points,
        rank,
        result: !winners.length
          ? "draw"
          : won
            ? "win"
            : m.alive[uid]
              ? "loss"
              : "eliminated",
        rounds: m.round,
        roundHistory: m.roundHistory,
      });
      if (session.data()?.roomCode === m.roomCode)
        tx.set(db.doc(`sessions/${uid}`), { roomCode: null });
    }
    tx.delete(db.doc(`rooms/${m.roomCode}`));
    tx.delete(db.doc(`roomCodes/${m.roomCode}`));
    return {
      ...m,
      phase: "finished",
      winners,
      rewards,
      deadline: null,
      finishedAt: stamp(),
    };
  }
  async function process(
    matchId: string,
    uid: string | undefined,
    input: Data,
  ) {
    const ref = db.doc(`matches/${validId(matchId)}`);
    return db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists)
        throw new HttpsError("not-found", "경기를 찾을 수 없습니다.");
      let m = snapshot.data() as Data;
      if (uid && !m.participants.includes(uid))
        throw new HttpsError("permission-denied", "경기 참가자가 아닙니다.");
      if (input.revision !== undefined && input.revision !== m.revision)
        return { ok: true };
      if (m.phase === "finished") return { ok: true };
      const action = input.action,
        ended = m.deadline.toMillis() <= clock();
      if (action === "vote") {
        if (ended)
          throw new HttpsError(
            "failed-precondition",
            "투표 시간이 끝났습니다.",
          );
        const allowed =
          m.phase === "modeVote"
            ? ["story", "random"]
            : m.phase === "themeVote"
              ? themes.map((t) => t.id)
              : [];
        if (!allowed.includes(input.value))
          throw new HttpsError("invalid-argument", "잘못된 투표입니다.");
        if (m.votes[uid!]) return { ok: true };
        m = { ...m, votes: { ...m.votes, [uid!]: input.value } };
        if (Object.keys(m.votes).length < m.participants.length) {
          tx.update(ref, { votes: m.votes });
          return { ok: true };
        }
      } else if (action === "choose") {
        if (input.round !== m.round)
          throw new HttpsError(
            "failed-precondition",
            "이전 라운드의 요청입니다.",
          );
        if (m.selectedIds.includes(uid)) return { ok: true };
        if (m.phase !== "playing" || ended || !m.alive[uid!])
          throw new HttpsError(
            "failed-precondition",
            "현재 선택할 수 없습니다.",
          );
        const choice = scenario(m.sequence[m.round - 1]).choices.find(
          (c) => c.id === input.choiceId,
        );
        if (!choice)
          throw new HttpsError("invalid-argument", "잘못된 선택입니다.");
        if (m.coins[uid!] < choice.requiredCost)
          throw new HttpsError("failed-precondition", "코인이 부족합니다.");
        if (m.selectedIds.includes(uid)) return { ok: true };
        const selectedIds = [...m.selectedIds, uid];
        tx.set(ref.collection("choices").doc(`${m.round}-${uid}`), {
          uid,
          round: m.round,
          choiceId: choice.id,
          timeout: false,
          remainingMs: m.deadline.toMillis() - clock(),
        });
        const all =
          selectedIds.length ===
          m.participants.filter((id: string) => m.alive[id]).length;
        tx.update(ref, {
          selectedIds,
          selectedCount: selectedIds.length,
          ...(all
            ? {
                phase: "countdown",
                deadline: expires(3),
                revision: m.revision + 1,
              }
            : {}),
          updatedAt: stamp(),
        });
        return { ok: true };
      } else if (action !== "advance")
        throw new HttpsError("invalid-argument", "알 수 없는 요청입니다.");
      else if (!ended) return { ok: true };
      if (m.phase === "modeVote") {
        const mode = tally(m.votes, ["story", "random"]);
        m =
          mode === "story"
            ? {
                ...m,
                gameMode: mode,
                phase: "themeVote",
                votes: {},
                deadline: expires(30),
              }
            : begin(m, "random", null);
      } else if (m.phase === "themeVote")
        m = begin(
          m,
          "story",
          tally(
            m.votes,
            themes.map((t) => t.id),
          ),
        );
      else if (m.phase === "playing") {
        const s = scenario(m.sequence[m.round - 1]);
        for (const id of m.participants.filter(
          (id: string) => m.alive[id] && !m.selectedIds.includes(id),
        ))
          tx.set(ref.collection("choices").doc(`${m.round}-${id}`), {
            uid: id,
            round: m.round,
            choiceId: s.choices.find((c) => c.isTimeoutDefault)!.id,
            timeout: true,
            remainingMs: 0,
          });
        m = {
          ...m,
          phase: "countdown",
          deadline: expires(3),
          selectedIds: m.participants.filter((id: string) => m.alive[id]),
          selectedCount: Object.values(m.alive).filter(Boolean).length,
        };
      } else if (m.phase === "countdown") {
        const active = m.participants.filter((id: string) => m.alive[id]);
        const choices = await Promise.all(
          active.map((id: string) =>
            tx.get(ref.collection("choices").doc(`${m.round}-${id}`)),
          ),
        );
        const coins = { ...m.coins },
          alive = { ...m.alive },
          metrics = structuredClone(m.metrics),
          results: Data[] = [];
        const s = scenario(m.sequence[m.round - 1]);
        active.forEach((id: string, i: number) => {
          const selection = choices[i].data();
          if (!selection)
            throw new HttpsError("internal", "선택 데이터가 없습니다.");
          const c = s.choices.find((c) => c.id === selection.choiceId)!;
          const success = draw(1_000_000) < c.successProbability * 10_000,
            change = success ? c.successNetChange : c.failureNetChange;
          coins[id] = Math.max(0, coins[id] + change);
          alive[id] = coins[id] > 0;
          results.push({
            uid: id,
            choiceId: c.id,
            choiceTitle: c.title,
            success,
            change,
            coins: coins[id],
            text: success ? c.successText : c.failureText,
            timeout: selection.timeout,
          });
          const q = metrics[id];
          const add = (key: string) => (q[key] = (q[key] || 0) + 1);
          add("survivedRounds");
          if (selection.timeout) add("timeouts");
          else {
            add("choose5");
            add("choose10");
            add(c.requiredCost === 0 ? "free3" : "paid3");
            if (c.successProbability <= 50) add("risk2");
            if (c.successProbability >= 75) add("safe2");
            if (selection.remainingMs >= 10000) add("fast3");
          }
          if (success) {
            add("success3");
            add("success5");
            if (c.successProbability <= 50) add("highriskwin");
          }
          if (change > 0) add("positive3");
        });
        m = {
          ...m,
          phase: "reveal",
          coins,
          alive,
          metrics,
          results,
          roundHistory: [
            ...m.roundHistory,
            { round: m.round, title: s.title, scenarioId: s.id, results },
          ],
          deadline: expires(5),
        };
        if (
          Object.values(alive).filter(Boolean).length <= 1 ||
          m.round === m.totalRounds
        )
          m = await finish(tx, ref, m);
      } else if (m.phase === "reveal") {
        const next = m.round + 1;
        m = {
          ...m,
          phase: "playing",
          round: next,
          currentScenario: scenario(m.sequence[next - 1]),
          selectedIds: [],
          selectedCount: 0,
          results: [],
          deadline: expires(30),
        };
      }
      m.revision++;
      m.updatedAt = stamp();
      tx.set(ref, m);
      return { ok: true };
    });
  }
  async function settings(uid: string, data: Data) {
    const avatarId = String(data.avatarId || "default"),
      nickname =
        typeof data.nickname === "string" ? data.nickname.trim() : undefined;
    if (!/^(default|anonymous|avatar-[1-8])$/.test(avatarId))
      throw new HttpsError("invalid-argument", "잘못된 아바타입니다.");
    if (nickname && !/^[가-힣a-zA-Z0-9_]{2,12}$/.test(nickname))
      throw new HttpsError(
        "invalid-argument",
        "닉네임은 한글·영문·숫자·밑줄 2~12자입니다.",
      );
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`profiles/${uid}`),
        profile = await tx.get(ref);
      if (!profile.exists && !nickname)
        throw new HttpsError("failed-precondition", "닉네임이 필요합니다.");
      tx.set(ref, {
        nickname: nickname || profile.data()!.nickname,
        createdAt: profile.data()?.createdAt || stamp(),
        updatedAt: stamp(),
      });
      tx.set(db.doc(`settings/${uid}`), {
        avatarId,
        anonymous: !!data.anonymous,
        updatedAt: stamp(),
      });
      tx.set(
        db.doc(`playerStats/${uid}`),
        {
          points: FieldValue.increment(0),
          games: FieldValue.increment(0),
          wins: FieldValue.increment(0),
        },
        { merge: true },
      );
    });
    return { ok: true };
  }
  async function ranking(uid: string) {
    const snaps = await db
      .collection("playerStats")
      .orderBy("points", "desc")
      .limit(100)
      .get();
    const rows = await Promise.all(
      snaps.docs.map(async (d, i) => {
        const [p, s] = await Promise.all([
          db.doc(`profiles/${d.id}`).get(),
          db.doc(`settings/${d.id}`).get(),
        ]);
        const anonymous = !!s.data()?.anonymous && uid !== d.id;
        return {
          key: i,
          isMe: uid === d.id,
          nickname: anonymous
            ? "익명 플레이어"
            : p.data()?.nickname || "플레이어",
          avatarId: anonymous ? "anonymous" : s.data()?.avatarId || "default",
          points: d.data().points || 0,
          games: d.data().games || 0,
          wins: d.data().wins || 0,
          anonymous,
        };
      }),
    );
    return { rows };
  }
  return { start, process, getQuests, claimQuest, settings, ranking };
}
