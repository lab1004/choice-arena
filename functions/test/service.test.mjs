import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { createService, dailyFor, rewardFor } from "../lib/service.js";
let app,
  db,
  now = Date.UTC(2026, 9, 26, 3),
  counter = 0;
before(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST)
    throw new Error("Tests require Firestore Emulator");
  app = initializeApp({ projectId: "demo-choice-arena" }, "server-tests");
  db = getFirestore(app);
});
after(async () => {
  await db.terminate();
  await deleteApp(app);
});
async function fixture(count = 2) {
  const code = `SERVER${++counter}`,
    ids = Array.from({ length: count }, (_, i) => `${code}-p${i}`),
    service = createService(db, () => now);
  for (const uid of ids) {
    await service.settings(uid, {
      nickname: "플레이어",
      avatarId: "avatar-1",
      anonymous: false,
    });
    await db.doc(`sessions/${uid}`).set({ roomCode: code });
  }
  await db.doc(`rooms/${code}`).set({
    hostId: ids[0],
    maxPlayers: count,
    status: "waiting",
    memberIds: ids,
    members: Object.fromEntries(
      ids.map((id) => [id, { nickname: "플레이어", ready: true }]),
    ),
  });
  await db
    .doc(`roomCodes/${code}`)
    .set({ playerCount: count, maxPlayers: count });
  return { code, ids, service };
}
async function begin(f, mode = "random") {
  const { matchId } = await f.service.start(f.ids[0], f.code);
  await Promise.all(
    f.ids.map((uid) =>
      f.service.process(matchId, uid, { action: "vote", value: mode }),
    ),
  );
  if (mode === "story")
    await Promise.all(
      f.ids.map((uid) =>
        f.service.process(matchId, uid, { action: "vote", value: "island" }),
      ),
    );
  return matchId;
}
const get = async (id) => (await db.doc(`matches/${id}`).get()).data();
async function expire(service, id) {
  const m = await get(id);
  now = m.deadline.toMillis() + 1;
  await service.process(id, undefined, {
    action: "advance",
    revision: m.revision,
  });
}

test("start is atomic, concurrent votes/choices settle once; 3 seconds cannot be bypassed", async () => {
  const f = await fixture(3);
  const starts = await Promise.all([
    f.service.start(f.ids[0], f.code),
    f.service.start(f.ids[0], f.code),
  ]);
  assert.equal(starts[0].matchId, starts[1].matchId);
  const id = starts[0].matchId;
  await Promise.all(
    f.ids.map((uid) =>
      f.service.process(id, uid, { action: "vote", value: "story" }),
    ),
  );
  assert.equal((await get(id)).phase, "themeVote");
  await Promise.all(
    f.ids.map((uid) =>
      f.service.process(id, uid, { action: "vote", value: "space" }),
    ),
  );
  let m = await get(id);
  assert.equal(m.phase, "playing");
  assert.equal(m.totalRounds, 12);
  const c = m.currentScenario.choices.find((c) => c.isTimeoutDefault);
  await Promise.all(
    f.ids.flatMap((uid) => [
      f.service.process(id, uid, {
        action: "choose",
        round: 1,
        choiceId: c.id,
      }),
      f.service.process(id, uid, {
        action: "choose",
        round: 1,
        choiceId: c.id,
      }),
    ]),
  );
  m = await get(id);
  assert.equal(m.phase, "countdown");
  assert.equal(m.selectedCount, 3);
  await f.service.process(id, f.ids[0], { action: "advance" });
  assert.equal((await get(id)).phase, "countdown");
  now = m.deadline.toMillis() + 1;
  await Promise.all(
    f.ids.map((uid) =>
      f.service.process(id, uid, { action: "advance", revision: m.revision }),
    ),
  );
  m = await get(id);
  assert.equal(m.phase, "reveal");
  assert.equal(m.roundHistory.length, 1);
  for (const uid of f.ids)
    assert.equal(m.coins[uid], 1000 + c.successNetChange);
});

test("full 10-round game, free timeouts, joint win and reward idempotency", async () => {
  const f = await fixture(),
    id = await begin(f);
  let m = await get(id);
  assert.equal(m.totalRounds, 10);
  while (m.phase !== "finished") {
    await expire(f.service, id);
    m = await get(id);
  }
  assert.equal(m.roundHistory.length, 10);
  assert.equal(m.winners.length, 2);
  for (const uid of f.ids) {
    const stats = (await db.doc(`playerStats/${uid}`).get()).data();
    assert.equal(stats.games, 1);
    assert.equal(stats.wins, 1);
    assert.equal(stats.points, rewardFor(m.coins[uid]));
    const hist = (await db.doc(`histories/${uid}/matches/${id}`).get()).data();
    assert.equal(hist.roundHistory.length, 10);
    assert.equal(hist.rank, 1);
    assert.equal((await db.doc(`sessions/${uid}`).get()).data().roomCode, null);
  }
  await Promise.all(
    f.ids.map((uid) => f.service.process(id, uid, { action: "advance" })),
  );
  assert.equal((await db.doc(`playerStats/${f.ids[0]}`).get()).data().games, 1);
  assert.equal((await db.doc(`rooms/${f.code}`).get()).exists, false);
});

test("rejects outsider, late choice, insufficient coins, locked choice changes", async () => {
  const f = await fixture(),
    id = await begin(f);
  let m = await get(id);
  await assert.rejects(
    f.service.process(id, "outsider", {
      action: "choose",
      round: 1,
      choiceId: "a",
    }),
    /참가자/,
  );
  const paid = m.currentScenario.choices.find((c) => c.requiredCost > 0);
  await db.doc(`matches/${id}`).update({ [`coins.${f.ids[0]}`]: 1 });
  await assert.rejects(
    f.service.process(id, f.ids[0], {
      action: "choose",
      round: 1,
      choiceId: paid.id,
    }),
    /코인/,
  );
  now = m.deadline.toMillis() + 1;
  await assert.rejects(
    f.service.process(id, f.ids[0], {
      action: "choose",
      round: 1,
      choiceId: "a",
    }),
    /선택/,
  );
  await f.service.process(id, f.ids[0], { action: "advance" });
  m = await get(id);
  assert.equal(m.phase, "countdown");
  const saved = (
    await db.doc(`matches/${id}/choices/1-${f.ids[0]}`).get()
  ).data();
  assert.equal(saved.timeout, true);
  assert.equal(
    m.currentScenario.choices.find((c) => c.id === saved.choiceId).requiredCost,
    0,
  );
});

test("all eliminated yields draw, no points and no winners", async () => {
  const f = await fixture(),
    id = await begin(f);
  await db.doc(`matches/${id}`).update({
    phase: "countdown",
    deadline: Timestamp.fromMillis(now - 1),
    alive: Object.fromEntries(f.ids.map((id) => [id, false])),
    coins: Object.fromEntries(f.ids.map((id) => [id, 0])),
  });
  await f.service.process(id, f.ids[0], { action: "advance" });
  const m = await get(id);
  assert.equal(m.phase, "finished");
  assert.deepEqual(m.winners, []);
  for (const uid of f.ids)
    assert.equal((await db.doc(`playerStats/${uid}`).get()).data().points, 0);
});

test("quests stable within day, 30 pool candidates, rollover and single concurrent claim", async () => {
  const f = await fixture(),
    uid = f.ids[0];
  const d = await f.service.getQuests(uid),
    again = await f.service.getQuests(uid);
  assert.equal(d.quests.length, 4);
  assert.equal(new Set(d.quests.map((q) => q.id)).size, 4);
  assert.deepEqual(d.quests, again.quests);
  const seen = new Set();
  for (let i = 0; i < 200; i++)
    dailyFor(`user-${i}`, now).quests.forEach((q) => seen.add(q.id));
  assert.equal(seen.size, 30);
  const ref = db.doc(`dailyQuests/${uid}/days/${d.day}`);
  await ref.update({
    quests: d.quests.map((q) => ({ ...q, progress: q.target })),
  });
  const claims = await Promise.allSettled([
    f.service.claimQuest(uid, d.quests[0].id),
    f.service.claimQuest(uid, d.quests[0].id),
  ]);
  assert.equal(claims.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await db.doc(`playerStats/${uid}`).get()).data().points, 1);
  now += 86400000;
  assert.notEqual((await f.service.getQuests(uid)).day, d.day);
});

test("anonymous ranking removes UID and photo for others; self retains profile", async () => {
  const f = await fixture(),
    uid = f.ids[0];
  await f.service.settings(uid, {
    nickname: "비밀닉",
    avatarId: "avatar-4",
    anonymous: true,
  });
  const other = (await f.service.ranking(f.ids[1])).rows.find(
    (r) => r.anonymous,
  );
  assert.equal(other.nickname, "익명 플레이어");
  assert.equal(other.avatarId, "anonymous");
  assert.equal("uid" in other, false);
  const self = (await f.service.ranking(uid)).rows.find((r) => r.isMe);
  assert.equal(self.nickname, "비밀닉");
  assert.equal(self.avatarId, "avatar-4");
});

test("paid success applies net change once, and early elimination ends the match", async () => {
  const f = await fixture(),
    id = await begin(f);
  const successService = createService(
    db,
    () => now,
    () => 0,
  );
  let m = await get(id),
    paid = m.currentScenario.choices.find((c) => c.requiredCost > 0),
    safe = m.currentScenario.choices.find((c) => c.isTimeoutDefault);
  await successService.process(id, f.ids[0], {
    action: "choose",
    round: 1,
    choiceId: paid.id,
  });
  await successService.process(id, f.ids[1], {
    action: "choose",
    round: 1,
    choiceId: safe.id,
  });
  await expire(successService, id);
  m = await get(id);
  assert.equal(m.coins[f.ids[0]], 1000 + paid.successNetChange);
  await expire(successService, id);
  m = await get(id);
  await db.doc(`matches/${id}`).update({ [`coins.${f.ids[0]}`]: 100 });
  const risk = m.currentScenario.choices.find(
    (c) => c.successProbability <= 50,
  );
  safe = m.currentScenario.choices.find((c) => c.isTimeoutDefault);
  const failureService = createService(
    db,
    () => now,
    (max) => max - 1,
  );
  await failureService.process(id, f.ids[0], {
    action: "choose",
    round: 2,
    choiceId: risk.id,
  });
  await failureService.process(id, f.ids[1], {
    action: "choose",
    round: 2,
    choiceId: safe.id,
  });
  await expire(failureService, id);
  m = await get(id);
  assert.equal(m.coins[f.ids[0]], 0);
  assert.equal(m.alive[f.ids[0]], false);
  assert.equal(m.phase, "finished");
  assert.deepEqual(m.winners, [f.ids[1]]);
  assert.equal(m.rewards[f.ids[0]], 0);
});
