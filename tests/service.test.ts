import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  updateDoc,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { readFileSync } from "node:fs";
import { GameService } from "../functions/src/service";
import { createRoom, joinRoom, saveProfile, setReady } from "../src/lib/arena";
import type { Match, Secret } from "../functions/src/shared/model";
import { koreaDay } from "../functions/src/shared/quests";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const app = initializeApp({ projectId: "demo-choice-arena" }, "service-tests");
const db = getFirestore(app);
let now = Date.parse("2026-10-25T14:00:00Z");
const service = new GameService(
  db,
  () => now,
  () => 0,
);
let env: RulesTestEnvironment;
const client = (uid: string) =>
  env
    .authenticatedContext(uid, { email: `${uid}@example.com` })
    .firestore() as unknown as Firestore;
async function room(n = 2) {
  for (const uid of ["a", "b", "c", "d"])
    await saveProfile(client(uid), uid, `선택_${uid}`, `${uid}@example.com`);
  await createRoom(client("a"), "a", () => "ABC234", n);
  for (const uid of ["b", "c"].slice(0, n - 1))
    await joinRoom(client(uid), uid, "ABC234");
  return "ABC234";
}
async function start(n = 2) {
  const code = await room(n);
  for (const uid of ["a", "b", "c"].slice(0, n))
    await setReady(client(uid), uid, code, true);
  return service.start("a", code);
}
async function state(id: string) {
  return (await db.doc(`matches/${id}`).get()).data() as Match;
}
async function finishMatch(id: string) {
  let m = await state(id);
  while (!["finished", "cancelled"].includes(m.stage)) {
    now = m.deadline;
    await service.act(null, id, { kind: "tick" });
    m = await state(id);
  }
  return m;
}
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-choice-arena",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  now = Date.parse("2026-10-25T14:00:00Z");
});
afterAll(async () => {
  await env.cleanup();
  await db.terminate();
  await deleteApp(app);
});
it.each([2, 3])(
  "enforces exact capacity %i and concurrent joins never overflow",
  async (n) => {
    await saveProfile(client("a"), "a", "선택_a", "a@example.com");
    await createRoom(client("a"), "a", () => "ABC234", n);
    for (const uid of ["b", "c", "d"])
      await saveProfile(client(uid), uid, `선택_${uid}`, `${uid}@example.com`);
    const r = await Promise.allSettled(
      ["b", "c", "d"].map((uid) => joinRoom(client(uid), uid, "ABC234")),
    );
    expect(r.filter((r) => r.status === "fulfilled")).toHaveLength(n - 1);
    expect((await db.doc("rooms/ABC234").get()).data()!.memberIds).toHaveLength(
      n,
    );
  },
);
it("rejects missing players, unready players and non-host starts; double start creates one match", async () => {
  await room();
  await expect(service.start("b", "ABC234")).rejects.toThrow(/방장/);
  await expect(service.start("a", "ABC234")).rejects.toThrow(/준비/);
  await setReady(client("a"), "a", "ABC234", true);
  await setReady(client("b"), "b", "ABC234", true);
  const ids = await Promise.all([
    service.start("a", "ABC234"),
    service.start("a", "ABC234"),
  ]);
  expect(ids[0]).toBe(ids[1]);
  expect((await db.collection("matches").get()).size).toBe(1);
  await assertFails(
    updateDoc(doc(client("a"), "rooms", "ABC234"), {
      "members.a.ready": false,
      updatedAt: serverTimestamp(),
    }),
  );
});
it("insufficient players cannot start even when every present player is ready", async () => {
  await saveProfile(client("a"), "a", "선택_a", "a@example.com");
  await createRoom(client("a"), "a", () => "ABC234", 3);
  await setReady(client("a"), "a", "ABC234", true);
  await expect(service.start("a", "ABC234")).rejects.toThrow(/인원/);
});
it("hides pre-reveal selections, prevents outsider reads and all forged authoritative writes", async () => {
  const id = await start();
  await service.act("a", id, { kind: "vote", value: "random" });
  await service.act("b", id, { kind: "vote", value: "random" });
  let m = await state(id);
  await service.act("a", id, {
    kind: "choose",
    round: 1,
    choiceId: m.scenario!.choices[0].id,
  });
  await assertSucceeds(getDoc(doc(client("b"), "matches", id)));
  await assertFails(getDoc(doc(client("d"), "matches", id)));
  await assertFails(getDoc(doc(client("b"), "matchSecrets", id)));
  await assertFails(getDocs(collection(client("a"), "accounts")));
  for (const path of [
    `matches/${id}`,
    `matchSecrets/${id}`,
    "accounts/a",
    "accounts/a/days/2026-10-25",
    "accounts/a/history/fake",
    "accounts/a/ledger/fake",
  ])
    await assertFails(
      setDoc(doc(client("a"), path), { points: 999999, coins: 9999 }),
    );
  m = await state(id);
  expect(m.results).toHaveLength(0);
  expect(JSON.stringify(m)).not.toContain("choiceId");
});
it("concurrent confirmations and settlement pay each winner once and create private complete histories", async () => {
  const id = await start();
  for (const uid of ["a", "b"])
    await service.act(uid, id, { kind: "vote", value: "story" });
  for (const uid of ["a", "b"])
    await service.act(uid, id, { kind: "vote", value: "island" });
  let m = await state(id);
  const safe = m.scenario!.choices.find((c) => c.isTimeoutDefault)!;
  await Promise.all(
    ["a", "b"].map((uid) =>
      service.act(uid, id, { kind: "choose", round: 1, choiceId: safe.id }),
    ),
  );
  m = await state(id);
  expect(m.stage).toBe("countdown");
  expect(m.deadline - now).toBe(3000);
  now = m.deadline;
  await Promise.all([
    service.act(null, id, { kind: "tick" }),
    service.act(null, id, { kind: "tick" }),
  ]);
  expect((await state(id)).players.a.coins).toBe(1000 + safe.successNetChange);
  m = await finishMatch(id);
  await Promise.all([
    service.act("a", id, { kind: "tick" }),
    service.act("b", id, { kind: "tick" }),
  ]);
  for (const uid of ["a", "b"]) {
    const account = (await db.doc(`accounts/${uid}`).get()).data()!;
    expect(account).toEqual({
      points: m.awards[uid].points,
      games: 1,
      wins: 1,
    });
    expect((await db.collection(`accounts/${uid}/ledger`).get()).size).toBe(1);
    const history = await getDoc(
      doc(client(uid), `accounts/${uid}/history/${id}`),
    );
    expect(history.data()!.rounds).toHaveLength(12);
    await assertFails(
      getDoc(
        doc(client(uid === "a" ? "b" : "a"), `accounts/${uid}/history/${id}`),
      ),
    );
  }
  expect((await db.doc("rooms/ABC234").get()).data()!.status).toBe("finished");
});
it("same day assignments persist concurrently, next Korea day assigns new document, claim is exactly-once", async () => {
  await room();
  await service.ensureAccount("a");
  const ds = await Promise.all([service.daily("a"), service.daily("a")]);
  expect(ds[0]).toEqual(ds[1]);
  expect(new Set(ds[0].ids).size).toBe(4);
  const day = ds[0].day,
    id = ds[0].ids[0];
  await expect(service.claim("a", id, day)).rejects.toThrow(/완료/);
  const dailyRef = db.doc(`accounts/a/days/${day}`);
  await dailyRef.update({ [`progress.${id}`]: 999 });
  await Promise.all([service.claim("a", id, day), service.claim("a", id, day)]);
  expect((await db.doc("accounts/a").get()).data()!.points).toBe(1);
  expect((await db.collection("accounts/a/ledger").get()).size).toBe(1);
  now = Date.parse("2026-10-25T15:00:00Z");
  const next = await service.daily("a");
  expect(next.day).toBe("2026-10-26");
  expect(next.claimed).toEqual([]);
  expect((await dailyRef.get()).exists).toBe(true);
  await expect(service.claim("a", id, day)).rejects.toThrow(/오늘/);
});
it("ranking sorts points, uses competition ranks and sanitizes anonymous profiles for other users", async () => {
  await room();
  for (const [uid, points] of [
    ["a", 15],
    ["b", 15],
    ["c", 5],
  ] as const)
    await db.doc(`accounts/${uid}`).set({ points, games: 1, wins: 1 });
  await saveProfile(
    client("a"),
    "a",
    "비밀닉네임",
    "a@example.com",
    "moon",
    true,
  );
  const ranks = await service.ranking("b");
  expect(ranks.map((r) => r.rank)).toEqual([1, 1, 3]);
  expect(ranks.map((r) => r.points)).toEqual([15, 15, 5]);
  expect(ranks.find((r) => r.nickname === "익명 플레이어")?.avatarId).toBe(
    "anonymous",
  );
  expect(JSON.stringify(ranks)).not.toContain("비밀닉네임");
  expect(JSON.stringify(ranks)).not.toContain("email");
  expect(JSON.stringify(ranks)).not.toContain("uid");
  expect((await service.ranking("a")).find((r) => r.me)?.nickname).toBe(
    "비밀닉네임",
  );
});
it("server rejection cannot be bypassed by direct profile/stat updates", async () => {
  await room();
  await assertFails(
    updateDoc(doc(client("a"), "profiles", "a"), {
      points: 999,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(client("a"), "profiles", "a"), {
      avatarId: "https://evil.example",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(client("b"), "profiles", "a"), {
      rankingAnonymous: false,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(getDoc(doc(client("b"), "privateProfiles", "a")));
});
it("cancelled vote has no winner rewards/history; explicit exit clears only that session", async () => {
  const id = await start();
  await service.exit("a", id);
  expect((await state(id)).stage).toBe("cancelled");
  expect((await db.doc("accounts/a").get()).data()!.points).toBe(0);
  expect((await db.collection("accounts/a/history").get()).empty).toBe(true);
  expect((await db.doc("sessions/a").get()).data()!.roomCode).toBeNull();
  expect((await db.doc("sessions/b").get()).data()!.roomCode).toBe("ABC234");
  await service.exit("b", id);
  expect((await db.doc("rooms/ABC234").get()).exists).toBe(false);
});
it("rematch restores readiness, preserves capacity, and requires the current host", async () => {
  const id = await start(3);
  await finishMatch(id);
  await expect(service.rematch("b", id)).rejects.toThrow(/방장/);
  await service.rematch("a", id);
  const r = (await db.doc("rooms/ABC234").get()).data()!;
  expect(r.status).toBe("waiting");
  expect(r.maxPlayers).toBe(3);
  expect(
    Object.values(r.members).every((m) => !(m as { ready: boolean }).ready),
  ).toBe(true);
  expect(r.matchId).toBeUndefined();
});
it("server settlement updates quests from real match records, and forfeit state survives reads", async () => {
  const id = await start(3);
  for (const uid of ["a", "b", "c"])
    await service.act(uid, id, { kind: "vote", value: "random" });
  const day = koreaDay(now);
  await db
    .doc(`accounts/b/days/${day}`)
    .set({
      day,
      ids: ["complete1", "free3", "random", "survive"],
      progress: {},
      claimed: [],
    });
  await service.exit("a", id);
  expect((await state(id)).players.a.forfeited).toBe(true);
  await service.act("b", id, { kind: "tick" });
  expect((await state(id)).players.a.alive).toBe(false);
  await finishMatch(id);
  expect(
    (await db.doc(`accounts/b/days/${day}`).get()).data()!.progress,
  ).toMatchObject({ complete1: 1, free3: 3, random: 1, survive: 1 });
});
it("persisted countdown resumes after disconnection with unchanged hidden choices", async () => {
  const id = await start();
  for (const uid of ["a", "b"])
    await service.act(uid, id, { kind: "vote", value: "random" });
  let m = await state(id);
  now = m.deadline;
  await service.act(null, id, { kind: "tick" });
  const secret = (await db.doc(`matchSecrets/${id}`).get()).data() as Secret;
  expect(Object.values(secret.choices).every((c) => c.timedOut)).toBe(true);
  const fresh = new GameService(
    db,
    () => now,
    () => 0,
  );
  m = await state(id);
  now = m.deadline;
  await fresh.act(null, id, { kind: "tick" });
  expect((await state(id)).results).toHaveLength(1);
  expect((await state(id)).players.a.alive).toBe(true);
});
