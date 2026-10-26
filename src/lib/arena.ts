import {
  arrayUnion,
  doc,
  FieldPath,
  getDocFromServer,
  runTransaction,
  serverTimestamp,
  snapshotEqual,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from "firebase/firestore";
import {
  GAME_CONFIG,
  generateCode,
  normalizeCode,
  validCode,
  validNickname,
  type Room,
  type Profile,
} from "../domain/game";
import { ArenaError } from "./errors";

// Rules may reject a stale optimistic write before the backend reports ABORTED.
// Retry the entire transaction only if a document it read has actually changed.
// Genuine authorization failures remain failures; no rules are relaxed.
async function membershipTransaction<T>(
  db: Firestore,
  operation: (
    tx: Transaction,
    observe: (...snapshots: DocumentSnapshot[]) => void,
  ) => Promise<T>,
): Promise<T> {
  const attempts = 4;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const observed: DocumentSnapshot[] = [];
    try {
      return await runTransaction(db, (tx) => {
        observed.length = 0;
        return operation(tx, (...snapshots) => observed.push(...snapshots));
      });
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          "code" in error &&
          error.code === "permission-denied"
        ) ||
        attempt === attempts - 1
      )
        throw error;
      let changed = false;
      for (const before of observed) {
        try {
          if (!snapshotEqual(before, await getDocFromServer(before.ref))) {
            changed = true;
            break;
          }
        } catch {
          /* A revoked read is not evidence that retrying is safe. */
        }
      }
      if (!changed) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 50 * (attempt + 1) + Math.random() * 100),
      );
    }
  }
  throw new ArenaError("aborted");
}
export async function saveProfile(
  db: Firestore,
  uid: string,
  nickname: string,
  email: string | null,
  avatarId = "sprout",
  rankingAnonymous = false,
) {
  nickname = nickname.trim();
  if (!validNickname(nickname)) throw new ArenaError("invalid-nickname");
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "profiles", uid);
    const existing = await tx.get(ref);
    tx.set(ref, {
      nickname,
      avatarId,
      rankingAnonymous,
      createdAt: existing.data()?.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.set(doc(db, "privateProfiles", uid), { email });
  });
}
export async function createRoom(
  db: Firestore,
  uid: string,
  nextCode = generateCode,
  maxPlayers: number = GAME_CONFIG.maxPlayers,
): Promise<string> {
  if (![2, GAME_CONFIG.maxPlayers].includes(maxPlayers))
    throw new ArenaError("invalid-capacity");
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = nextCode();
    const result = await membershipTransaction(db, async (tx, observe) => {
      const directory = doc(db, "roomCodes", code);
      const session = doc(db, "sessions", uid);
      const [existing, current, profile] = await Promise.all([
        tx.get(directory),
        tx.get(session),
        tx.get(doc(db, "profiles", uid)),
      ]);
      observe(current, existing, profile);
      if (current.data()?.roomCode) throw new ArenaError("already-in-room");
      if (!profile.exists()) throw new ArenaError("profile-required");
      if (existing.exists()) return false;
      tx.set(doc(db, "rooms", code), {
        hostId: uid,
        maxPlayers,
        status: "waiting",
        memberIds: [uid],
        members: {
          [uid]: {
            nickname: (profile.data() as Profile).nickname,
            ready: false,
          },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.set(directory, { playerCount: 1, maxPlayers });
      tx.set(session, { roomCode: code });
      return true;
    });
    if (result) return code;
  }
  throw new ArenaError("code-exhausted");
}
export async function joinRoom(db: Firestore, uid: string, input: string) {
  const code = normalizeCode(input);
  if (!validCode(code)) throw new ArenaError("invalid-code");
  await membershipTransaction(db, async (tx, observe) => {
    const directory = doc(db, "roomCodes", code);
    const session = doc(db, "sessions", uid);
    const [room, current, profile] = await Promise.all([
      tx.get(directory),
      tx.get(session),
      tx.get(doc(db, "profiles", uid)),
    ]);
    observe(current, room, profile);
    if (current.data()?.roomCode === code) return;
    if (current.data()?.roomCode) throw new ArenaError("already-in-room");
    if (!room.exists()) throw new ArenaError("room-not-found");
    if (!profile.exists()) throw new ArenaError("profile-required");
    if (room.data().playerCount >= room.data().maxPlayers)
      throw new ArenaError("room-full");
    // Nonmembers may only read the directory. No lobby read is needed to join.
    tx.update(
      doc(db, "rooms", code),
      new FieldPath("members", uid),
      { nickname: profile.data().nickname, ready: false },
      "memberIds",
      arrayUnion(uid),
      "updatedAt",
      serverTimestamp(),
    );
    tx.update(directory, { playerCount: room.data().playerCount + 1 });
    tx.set(session, { roomCode: code });
  });
  return code;
}
export async function setReady(
  db: Firestore,
  uid: string,
  code: string,
  ready: boolean,
) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "rooms", code);
    const room = await tx.get(ref);
    if (!room.exists() || !room.data().memberIds.includes(uid))
      throw new ArenaError("not-member");
    tx.update(
      ref,
      new FieldPath("members", uid, "ready"),
      ready,
      "updatedAt",
      serverTimestamp(),
    );
  });
}
export async function transferHost(
  db: Firestore,
  uid: string,
  code: string,
  target: string,
) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "rooms", code);
    const snap = await tx.get(ref);
    if (
      !snap.exists() ||
      snap.data().hostId !== uid ||
      !snap.data().memberIds.includes(target)
    )
      throw new ArenaError("permission-denied");
    tx.update(ref, { hostId: target, updatedAt: serverTimestamp() });
  });
}
export async function leaveRoom(db: Firestore, uid: string) {
  await membershipTransaction(db, async (tx, observe) => {
    const session = doc(db, "sessions", uid);
    const current = await tx.get(session);
    observe(current);
    const code = current.data()?.roomCode;
    if (!code) return;
    const ref = doc(db, "rooms", code);
    const snap = await tx.get(ref);
    observe(snap);
    if (!snap.exists()) {
      tx.set(session, { roomCode: null });
      return;
    }
    const room = snap.data() as Room;
    const memberIds = room.memberIds.filter((id) => id !== uid);
    if (!room.memberIds.includes(uid)) throw new ArenaError("not-member");
    if (!memberIds.length) {
      tx.delete(ref);
      tx.delete(doc(db, "roomCodes", code));
    } else {
      const members = { ...room.members };
      delete members[uid];
      tx.update(ref, {
        memberIds,
        members,
        hostId: room.hostId === uid ? memberIds[0] : room.hostId,
        updatedAt: serverTimestamp(),
      });
      tx.update(doc(db, "roomCodes", code), { playerCount: memberIds.length });
    }
    tx.set(session, { roomCode: null });
  });
}
