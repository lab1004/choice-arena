import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  saveProfile,
  setReady,
  transferHost,
} from "../src/lib/arena";
import { GAME_CONFIG } from "../src/domain/game";
let env: RulesTestEnvironment;
const code = "ABC234";
const dbFor = (uid: string) =>
  env
    .authenticatedContext(uid, { email: `${uid}@example.com` })
    .firestore() as unknown as Firestore;
async function player(uid: string) {
  const db = dbFor(uid);
  await saveProfile(db, uid, `선택_${uid}`, `${uid}@example.com`);
  return db;
}
async function lobby() {
  const host = await player("host");
  await createRoom(host, "host", () => code);
  return host;
}
beforeAll(async () => {
  setLogLevel("silent");
  env = await initializeTestEnvironment({
    projectId: "demo-choice-arena",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});
beforeEach(() => env.clearFirestore());
afterAll(() => env?.cleanup());

describe("profiles and default denial", () => {
  it("saves nickname separately from owner-only email and blocks strangers", async () => {
    const alice = await player("alice");
    const bob = dbFor("bob");
    expect(
      (await getDoc(doc(alice, "profiles", "alice"))).data()?.nickname,
    ).toBe("선택_alice");
    await assertSucceeds(getDoc(doc(bob, "profiles", "alice")));
    await assertFails(getDoc(doc(bob, "privateProfiles", "alice")));
    await assertFails(
      updateDoc(doc(bob, "profiles", "alice"), {
        nickname: "탈취",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      getDoc(
        doc(
          env.unauthenticatedContext().firestore() as unknown as Firestore,
          "profiles",
          "alice",
        ),
      ),
    );
  });
  it("allows exactly one post-onboarding nickname change and permanently locks later changes", async () => {
    const db = await player("alice");
    const ref = doc(db, "profiles", "alice");
    await saveProfile(db, "alice", "선택_alice", "alice@example.com", "moon", true);
    expect((await getDoc(ref)).data()?.nicknameChangeUsed).toBe(false);
    await assertFails(
      updateDoc(ref, {
        nickname: "탈취시도",
        nicknameChangeUsed: false,
        updatedAt: serverTimestamp(),
      }),
    );
    await saveProfile(db, "alice", "변경완료", "alice@example.com", "moon", true);
    expect((await getDoc(ref)).data()).toMatchObject({
      nickname: "변경완료",
      nicknameChangeUsed: true,
    });
    await expect(
      saveProfile(db, "alice", "두번째변경", "alice@example.com"),
    ).rejects.toMatchObject({ code: "nickname-locked" });
    await assertFails(
      updateDoc(ref, {
        nickname: "또바꾸기",
        nicknameChangeUsed: true,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(ref, {
        nicknameChangeUsed: false,
        updatedAt: serverTimestamp(),
      }),
    );
    await saveProfile(db, "alice", "변경완료", "alice@example.com", "sun", false);
    expect((await getDoc(ref)).data()).toMatchObject({
      nickname: "변경완료",
      nicknameChangeUsed: true,
      avatarId: "sun",
      rankingAnonymous: false,
    });
  });
  it("rejects reward/rank injection, invalid nickname, arbitrary email and unknown paths", async () => {
    const db = await player("alice");
    await assertFails(
      updateDoc(doc(db, "profiles", "alice"), {
        rank: 9999,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db, "profiles", "alice"), {
        nickname: "<script>",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(db, "privateProfiles", "alice"), {
        email: "spoof@example.com",
      }),
    );
    for (const path of ["rankings", "attendance", "matches", "unknown"])
      await assertFails(setDoc(doc(db, path, "alice"), { coins: 9999 }));
  });
});
describe("room lifecycle and transaction races", () => {
  it("creates a consistent room, directory and restorable session", async () => {
    const host = await lobby();
    expect((await getDoc(doc(host, "rooms", code))).data()).toMatchObject({
      hostId: "host",
      maxPlayers: GAME_CONFIG.maxPlayers,
      memberIds: ["host"],
      members: { host: { ready: false } },
    });
    expect(
      (await getDoc(doc(dbFor("host"), "sessions", "host"))).data(),
    ).toEqual({ roomCode: code });
    expect(
      (await getDoc(doc(host, "roomCodes", code))).data()?.playerCount,
    ).toBe(1);
  });
  it("retries code collisions without replacing the existing room", async () => {
    const host = await lobby();
    const guest = await player("guest");
    let attempts = 0;
    expect(
      await createRoom(guest, "guest", () =>
        ++attempts === 1 ? code : "XYZ789",
      ),
    ).toBe("XYZ789");
    expect(attempts).toBe(2);
    expect((await getDoc(doc(host, "rooms", code))).data()?.hostId).toBe(
      "host",
    );
  });
  it("fails after bounded collision attempts", async () => {
    await lobby();
    const guest = await player("guest");
    await expect(createRoom(guest, "guest", () => code)).rejects.toMatchObject({
      code: "code-exhausted",
    });
    expect((await getDoc(doc(guest, "sessions", "guest"))).exists()).toBe(
      false,
    );
  });
  it("never exceeds capacity when more clients join concurrently", async () => {
    const host = await lobby();
    const users = await Promise.all(
      Array.from({ length: GAME_CONFIG.maxPlayers + 2 }, async (_, i) => ({
        uid: `u${i}`,
        db: await player(`u${i}`),
      })),
    );
    const results = await Promise.allSettled(
      users.map((p) => joinRoom(p.db, p.uid, code)),
    );
    for (const result of results) {
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ code: "room-full" });
    }
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(
      GAME_CONFIG.maxPlayers - 1,
    );
    const room = (await getDoc(doc(host, "rooms", code))).data()!;
    expect(room.memberIds).toHaveLength(GAME_CONFIG.maxPlayers);
    expect(
      (await getDoc(doc(host, "roomCodes", code))).data()?.playerCount,
    ).toBe(GAME_CONFIG.maxPlayers);
    for (const p of users)
      expect(
        (await getDoc(doc(p.db, "sessions", p.uid))).data()?.roomCode ?? null,
      ).toBe(room.memberIds.includes(p.uid) ? code : null);
  });
  it("rejects simultaneous attempts by one user to join two rooms", async () => {
    await lobby();
    const other = await player("other");
    await createRoom(other, "other", () => "XYZ789");
    const guest = await player("guest");
    const results = await Promise.allSettled([
      joinRoom(guest, "guest", code),
      joinRoom(guest, "guest", "XYZ789"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("handles invalid, absent and full room codes explicitly", async () => {
    await lobby();
    const guest = await player("guest");
    await expect(joinRoom(guest, "guest", "bad")).rejects.toMatchObject({
      code: "invalid-code",
    });
    await expect(joinRoom(guest, "guest", "ZZZ999")).rejects.toMatchObject({
      code: "room-not-found",
    });
    for (let i = 1; i < GAME_CONFIG.maxPlayers; i++) {
      const uid = `u${i}`;
      await joinRoom(await player(uid), uid, code);
    }
    await expect(joinRoom(guest, "guest", code)).rejects.toMatchObject({
      code: "room-full",
    });
  });
  it("duplicate joining is idempotent", async () => {
    const host = await lobby();
    const guest = await player("guest");
    await Promise.all([
      joinRoom(guest, "guest", code),
      joinRoom(guest, "guest", code),
    ]);
    expect((await getDoc(doc(host, "rooms", code))).data()?.memberIds).toEqual([
      "host",
      "guest",
    ]);
  });
  it("reflects readiness through a realtime subscription", async () => {
    const host = await lobby();
    const guest = await player("guest");
    await joinRoom(guest, "guest", code);
    const observed = new Promise<void>((resolve, reject) => {
      const stop = onSnapshot(
        doc(host, "rooms", code),
        (snap) => {
          if (snap.data()?.members.guest.ready) {
            stop();
            resolve();
          }
        },
        reject,
      );
    });
    await setReady(guest, "guest", code, true);
    await observed;
    await setReady(guest, "guest", code, false);
  });
  it("allows host delegation and automatically transfers on host departure", async () => {
    const host = await lobby();
    const guest = await player("guest");
    await joinRoom(guest, "guest", code);
    await transferHost(host, "host", code, "guest");
    expect((await getDoc(doc(host, "rooms", code))).data()?.hostId).toBe(
      "guest",
    );
    await leaveRoom(guest, "guest");
    expect((await getDoc(doc(host, "rooms", code))).data()?.hostId).toBe(
      "host",
    );
    expect(
      (await getDoc(doc(guest, "sessions", "guest"))).data()?.roomCode,
    ).toBeNull();
  });
  it("removes the room and code only when the last member explicitly leaves", async () => {
    const host = await lobby();
    await leaveRoom(host, "host");
    expect((await getDoc(doc(host, "rooms", code))).exists()).toBe(false);
    expect((await getDoc(doc(host, "roomCodes", code))).exists()).toBe(false);
    expect(
      (await getDoc(doc(host, "sessions", "host"))).data()?.roomCode,
    ).toBeNull();
    await leaveRoom(host, "host");
    expect(await createRoom(host, "host", () => code)).toBe(code);
  });
  it("serializes simultaneous last-player leave and join", async () => {
    const host = await lobby();
    const guest = await player("guest");
    const results = await Promise.allSettled([
      leaveRoom(host, "host"),
      joinRoom(guest, "guest", code),
    ]);
    if (results[0].status === "rejected") throw results[0].reason;
    if (results[1].status === "rejected")
      expect(results[1].reason).toMatchObject({ code: "room-not-found" });
    expect(results[0].status).toBe("fulfilled");
    const directory = await getDoc(doc(guest, "roomCodes", code));
    if (results[1].status === "fulfilled") {
      expect(directory.data()?.playerCount).toBe(1);
      expect((await getDoc(doc(guest, "rooms", code))).data()?.hostId).toBe(
        "guest",
      );
    } else expect(directory.exists()).toBe(false);
  });
});
describe("hostile clients cannot bypass UI checks", () => {
  it("hides lobby and sessions from outsiders and denies collection enumeration", async () => {
    await lobby();
    const outsider = dbFor("outsider");
    expect((await getDoc(doc(outsider, "roomCodes", code))).data()).toEqual({
      playerCount: 1,
      maxPlayers: GAME_CONFIG.maxPlayers,
    });
    await assertFails(getDoc(doc(outsider, "rooms", code)));
    await assertFails(getDoc(doc(outsider, "sessions", "host")));
    for (const path of ["rooms", "roomCodes", "profiles"])
      await assertFails(getDocs(collection(outsider, path)));
  });
  it("blocks changing another player readiness, nickname, host or membership", async () => {
    const host = await lobby();
    const guest = await player("guest");
    await joinRoom(guest, "guest", code);
    await assertFails(
      updateDoc(doc(guest, "rooms", code), {
        "members.host.ready": true,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(host, "rooms", code), {
        "members.guest.ready": true,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(guest, "rooms", code), {
        "members.guest.nickname": "사칭",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(guest, "rooms", code), {
        hostId: "guest",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(host, "rooms", code), {
        memberIds: ["host"],
        members: { host: { nickname: "선택_host", ready: false } },
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(host, "rooms", code)));
  });
  it("blocks forged sessions, directory counts and configuration changes", async () => {
    const host = await lobby();
    const guest = await player("guest");
    await assertFails(
      setDoc(doc(guest, "sessions", "guest"), { roomCode: code }),
    );
    await assertFails(
      setDoc(doc(host, "sessions", "host"), { roomCode: null }),
    );
    await assertFails(
      updateDoc(doc(host, "rooms", code), {
        maxPlayers: GAME_CONFIG.maxPlayers + 1,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(host, "rooms", code), {
        status: "playing",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(host, "roomCodes", code), { playerCount: 2 }),
    );
    await assertFails(deleteDoc(doc(host, "roomCodes", code)));
    await assertFails(
      updateDoc(doc(host, "rooms", code), {
        extra: true,
        updatedAt: serverTimestamp(),
      }),
    );
  });
  it("rejects an atomic but over-capacity join crafted without service helpers", async () => {
    const host = await lobby();
    for (let i = 1; i < GAME_CONFIG.maxPlayers; i++) {
      const uid = `u${i}`;
      await joinRoom(await player(uid), uid, code);
    }
    const extra = await player("extra");
    const room = (await getDoc(doc(host, "rooms", code))).data()!;
    const batch = writeBatch(extra);
    batch.update(doc(extra, "rooms", code), {
      memberIds: [...room.memberIds, "extra"],
      members: {
        ...room.members,
        extra: { nickname: "선택_extra", ready: false },
      },
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(extra, "roomCodes", code), {
      playerCount: GAME_CONFIG.maxPlayers + 1,
    });
    batch.set(doc(extra, "sessions", "extra"), { roomCode: code });
    await assertFails(batch.commit());
  });
});
