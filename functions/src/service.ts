import {
  getFirestore,
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";
import { createHash, randomInt } from "node:crypto";
import { GameError, newMatch, reduce, type Command } from "./engine";
import {
  AVATARS,
  CONFIG,
  EMPTY_ACCOUNT,
  type Account,
  type Match,
  type Secret,
} from "./shared/model";
import { koreaDay, progressDaily, QUESTS, type Daily } from "./shared/quests";
// Adopt the added playable-arena branch's UID/date hash ordering. Reassigning
// the same day (even after an administrative restore) cannot reroll its tasks.
export function dailyFor(uid: string, day: string): Daily {
  const ids = [...QUESTS]
    .sort((a, b) =>
      createHash("sha256")
        .update(`${uid}:${day}:${a.id}`)
        .digest("hex")
        .localeCompare(
          createHash("sha256").update(`${uid}:${day}:${b.id}`).digest("hex"),
        ),
    )
    .slice(0, 4)
    .map((q) => q.id);
  return { day, ids, progress: {}, claimed: [] };
}
export const random = () => randomInt(0, 0x100000000) / 0x100000000;
const requireThat = (ok: unknown, message: string) => {
  if (!ok) throw new GameError(message);
};
export class GameService {
  constructor(
    readonly db: Firestore = getFirestore(),
    readonly clock = Date.now,
    readonly rng = random,
  ) {}
  async ensureAccount(uid: string) {
    await this.db.runTransaction(async (tx) => {
      const p = await tx.get(this.db.doc(`profiles/${uid}`));
      requireThat(p.exists, "먼저 프로필을 설정해 주세요.");
      const ref = this.db.doc(`accounts/${uid}`);
      if (!(await tx.get(ref)).exists) tx.create(ref, EMPTY_ACCOUNT);
    });
  }
  async start(uid: string, code: string) {
    const id = this.db.collection("matches").doc().id;
    await this.db.runTransaction(async (tx) => {
      const ref = this.db.doc(`rooms/${code}`),
        snap = await tx.get(ref);
      const r = snap.data();
      requireThat(r && r.hostId === uid, "방장만 시작할 수 있습니다.");
      if (r!.status === "playing" && r!.matchId) return;
      requireThat(r!.status === "waiting", "대기실 상태를 확인해 주세요.");
      requireThat(
        [2, 3].includes(r!.maxPlayers) && r!.memberIds.length === r!.maxPlayers,
        "선택한 인원이 모두 입장해야 합니다.",
      );
      requireThat(
        r!.memberIds.every((id: string) => r!.members[id].ready),
        "모두 준비해야 시작할 수 있습니다.",
      );
      const profiles = await tx.getAll(
        ...(r!.memberIds as string[]).map((id: string) =>
          this.db.doc(`profiles/${id}`),
        ),
      );
      const sessions = await tx.getAll(
        ...(r!.memberIds as string[]).map((id: string) =>
          this.db.doc(`sessions/${id}`),
        ),
      );
      requireThat(
        sessions.every((s) => s.data()?.roomCode === code),
        "참가자 상태가 바뀌었습니다.",
      );
      const players: Match["players"] = {};
      for (const p of profiles) {
        requireThat(p.exists, "참가자 프로필을 확인해 주세요.");
        players[p.id] = {
          nickname: p.data()!.nickname,
          avatarId: AVATARS.includes(p.data()!.avatarId)
            ? p.data()!.avatarId
            : "sprout",
          coins: CONFIG.startingCoins,
          alive: true,
          forfeited: false,
        };
      }
      const { match, secret } = newMatch(id, code, players, this.clock());
      tx.create(this.db.doc(`matches/${id}`), match);
      tx.create(this.db.doc(`matchSecrets/${id}`), secret);
      tx.update(ref, {
        status: "playing",
        matchId: id,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    // Return the committed id, including a duplicate start request's existing match.
    return (await this.db.doc(`rooms/${code}`).get()).data()!.matchId as string;
  }
  async act(
    uid: string | null,
    id: string,
    command: Command,
    expectedDeadline?: number,
  ) {
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.doc(`matches/${id}`),
        secretRef = this.db.doc(`matchSecrets/${id}`);
      const [pub, sec] = await tx.getAll(ref, secretRef);
      requireThat(pub.exists && sec.exists, "경기를 찾을 수 없습니다.");
      const before = pub.data() as Match;
      const now = this.clock();
      if (
        expectedDeadline !== undefined &&
        before.deadline !== expectedDeadline
      )
        return { serverNow: now };
      const { match: m, secret: s } = reduce(
        before,
        sec.data() as Secret,
        uid,
        command,
        now,
        this.rng,
      );
      const changed =
        JSON.stringify({ ...m, updatedAt: 0 }) !==
        JSON.stringify({ ...before, updatedAt: 0 });
      if (!changed) return { serverNow: now };
      const terminal = m.stage === "finished" || m.stage === "cancelled";
      const roomRef = this.db.doc(`rooms/${m.roomCode}`);
      const room = await tx.get(roomRef);
      const day = koreaDay(now);
      const settlements: {
        uid: string;
        account: Account;
        daily: Daily;
        paid: boolean;
      }[] = [];
      if (
        terminal &&
        before.stage !== "finished" &&
        before.stage !== "cancelled"
      ) {
        for (const pid of m.memberIds) {
          const [a, d, receipt] = await tx.getAll(
            this.db.doc(`accounts/${pid}`),
            this.db.doc(`accounts/${pid}/days/${day}`),
            this.db.doc(`accounts/${pid}/ledger/match-${id}`),
          );
          settlements.push({
            uid: pid,
            account: (a.data() as Account) ?? { ...EMPTY_ACCOUNT },
            daily: (d.data() as Daily) ?? dailyFor(pid, day),
            paid: receipt.exists,
          });
        }
      }
      // All reads above; rewards, histories, state and receipt are one transaction.
      tx.set(ref, m);
      tx.set(secretRef, s);
      if (terminal && room.data()?.matchId === id)
        tx.update(roomRef, {
          status: "finished",
          updatedAt: FieldValue.serverTimestamp(),
        });
      for (const item of settlements) {
        if (item.paid) continue;
        const award = m.awards[item.uid];
        const completed = m.stage === "finished";
        const points = completed ? award.points : 0;
        tx.set(this.db.doc(`accounts/${item.uid}`), {
          points: item.account.points + points,
          games: item.account.games + (completed ? 1 : 0),
          wins: item.account.wins + (award?.winner ? 1 : 0),
        });
        tx.create(this.db.doc(`accounts/${item.uid}/ledger/match-${id}`), {
          kind: "match",
          matchId: id,
          points,
          createdAt: now,
        });
        if (completed) {
          tx.set(
            this.db.doc(`accounts/${item.uid}/days/${day}`),
            progressDaily(item.daily, m, item.uid),
          );
          tx.create(this.db.doc(`accounts/${item.uid}/history/${id}`), {
            matchId: id,
            finishedAt: now,
            mode: m.mode,
            themeId: m.themeId,
            playerCount: m.memberIds.length,
            finalCoins: m.players[item.uid].coins,
            award,
            status: m.players[item.uid].forfeited
              ? "forfeited"
              : award.winner
                ? "win"
                : !Object.values(m.awards).some((a) => a.winner)
                  ? "draw"
                  : m.players[item.uid].alive
                    ? "loss"
                    : "eliminated",
            rounds: m.results
              .filter((r) => r.outcomes[item.uid])
              .map((r) => ({
                scenarioId: r.scenarioId,
                round: r.round,
                ...r.outcomes[item.uid],
              })),
          });
        }
      }
      return { serverNow: now };
    });
  }
  async daily(uid: string) {
    const day = koreaDay(this.clock());
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.doc(`accounts/${uid}/days/${day}`);
      const doc = await tx.get(ref);
      if (doc.exists) return doc.data() as Daily;
      const p = await tx.get(this.db.doc(`profiles/${uid}`));
      requireThat(p.exists, "프로필이 필요합니다.");
      const d = dailyFor(uid, day);
      tx.create(ref, d);
      return d;
    });
  }
  async claim(uid: string, questId: string, day: string) {
    requireThat(
      day === koreaDay(this.clock()),
      "오늘의 퀘스트만 수령할 수 있습니다.",
    );
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.doc(`accounts/${uid}/days/${day}`),
        acc = this.db.doc(`accounts/${uid}`),
        ledger = this.db.doc(`accounts/${uid}/ledger/quest-${day}-${questId}`);
      const [d, a, l] = await tx.getAll(ref, acc, ledger);
      const daily = d.data() as Daily | undefined;
      const q = QUESTS.find((q) => q.id === questId);
      requireThat(
        q && daily?.ids.includes(questId),
        "배정된 퀘스트가 아닙니다.",
      );
      if (l.exists || daily!.claimed.includes(questId)) return;
      requireThat(
        (daily!.progress[questId] ?? 0) >= q!.target,
        "아직 완료하지 않은 퀘스트입니다.",
      );
      tx.update(ref, { claimed: [...daily!.claimed, questId] });
      tx.set(acc, {
        ...EMPTY_ACCOUNT,
        ...a.data(),
        points: (a.data()?.points ?? 0) + q!.rewardPoints,
      });
      tx.create(ledger, {
        kind: "quest",
        day,
        questId,
        points: q!.rewardPoints,
        createdAt: this.clock(),
      });
    });
  }
  async ranking(uid: string) {
    // Return only a sanitized projection; clients cannot list accounts or profile IDs.
    const accounts = await this.db
      .collection("accounts")
      .orderBy("points", "desc")
      .limit(100)
      .get();
    const profiles = accounts.empty
      ? []
      : await this.db.getAll(
          ...accounts.docs.map((d) => this.db.doc(`profiles/${d.id}`)),
        );
    let rank = 0,
      previous = -1;
    return accounts.docs.map((a, i) => {
      const p = profiles[i].data();
      if (a.data().points !== previous) rank = i + 1;
      previous = a.data().points;
      const me = a.id === uid,
        anonymous = p?.rankingAnonymous && !me;
      return {
        rank,
        nickname: anonymous ? "익명 플레이어" : (p?.nickname ?? "플레이어"),
        avatarId: anonymous ? "anonymous" : (p?.avatarId ?? "sprout"),
        ...(a.data() as Account),
        me,
      };
    });
  }
  async rematch(uid: string, id: string) {
    await this.db.runTransaction(async (tx) => {
      const m = (await tx.get(this.db.doc(`matches/${id}`))).data() as
        Match | undefined;
      requireThat(
        m && ["finished", "cancelled"].includes(m.stage),
        "종료된 경기만 재대결할 수 있습니다.",
      );
      const ref = this.db.doc(`rooms/${m!.roomCode}`),
        snap = await tx.get(ref);
      const r = snap.data();
      requireThat(
        r && r.matchId === id && r.hostId === uid,
        "현재 방장만 재대결을 열 수 있습니다.",
      );
      const sessions = await tx.getAll(
        ...(r!.memberIds as string[]).map((id: string) =>
          this.db.doc(`sessions/${id}`),
        ),
      );
      const ids = r!.memberIds.filter(
        (_: string, i: number) => sessions[i].data()?.roomCode === m!.roomCode,
      );
      requireThat(ids.includes(uid), "방을 나간 상태입니다.");
      const members = Object.fromEntries(
        ids.map((id: string) => [id, { ...r!.members[id], ready: false }]),
      );
      tx.set(ref, {
        hostId: uid,
        maxPlayers: r!.maxPlayers,
        status: "waiting",
        memberIds: ids,
        members,
        createdAt: r!.createdAt,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(this.db.doc(`roomCodes/${m!.roomCode}`), {
        maxPlayers: r!.maxPlayers,
        playerCount: ids.length,
      });
    });
  }
  async exit(uid: string, id: string) {
    await this.act(uid, id, { kind: "forfeit" });
    await this.db.runTransaction(async (tx) => {
      const m = (await tx.get(this.db.doc(`matches/${id}`))).data() as Match;
      const sessionRef = this.db.doc(`sessions/${uid}`),
        roomRef = this.db.doc(`rooms/${m.roomCode}`);
      const [sess, rs] = await tx.getAll(sessionRef, roomRef);
      if (sess.data()?.roomCode !== m.roomCode || rs.data()?.matchId !== id)
        return;
      tx.set(sessionRef, { roomCode: null });
      const r = rs.data()!;
      const ids = r.memberIds.filter((i: string) => i !== uid);
      if (!ids.length) {
        tx.delete(roomRef);
        tx.delete(this.db.doc(`roomCodes/${m.roomCode}`));
      } else {
        const members = { ...r.members };
        delete members[uid];
        tx.update(roomRef, {
          memberIds: ids,
          members,
          hostId: r.hostId === uid ? ids[0] : r.hostId,
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(this.db.doc(`roomCodes/${m.roomCode}`), {
          playerCount: ids.length,
        });
      }
    });
  }
}
