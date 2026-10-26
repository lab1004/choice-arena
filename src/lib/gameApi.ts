import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "firebase/firestore";
import { db, firebaseApp, usingEmulators } from "./firebase";
const functions = getFunctions(firebaseApp, "asia-northeast3");
if (usingEmulators) connectFunctionsEmulator(functions, "127.0.0.1", 5001);
const action = httpsCallable<Record<string, unknown>, any>(
  functions,
  "gameAction",
);
let serverOffset = 0;
export const serverNow = () => Date.now() + serverOffset;
async function invoke(data: Record<string, unknown>) {
  const before = Date.now();
  const response = await action(data);
  if (typeof response.data.serverNow === "number")
    serverOffset = response.data.serverNow - (before + Date.now()) / 2;
  return response;
}
export const startMatch = (roomCode: string) =>
  invoke({ action: "start", roomCode });
export const vote = (matchId: string, value: string) =>
  invoke({ action: "vote", matchId, value });
export const choose = (matchId: string, choiceId: string, round: number) =>
  invoke({ action: "choose", matchId, choiceId, round });
export const advance = (matchId: string) =>
  invoke({ action: "advance", matchId });
export const getQuests = () => httpsCallable(functions, "getQuests")({});
export const claimQuest = (id: string) =>
  httpsCallable(functions, "claimQuest")({ id });
export const getRanking = () => httpsCallable(functions, "getRanking")({});
export const updateSettings = (
  avatarId: string,
  anonymous: boolean,
  nickname?: string,
) =>
  httpsCallable(
    functions,
    "updateSettings",
  )({ avatarId, anonymous, ...(nickname ? { nickname } : {}) });
export const watchMatch = (
  id: string,
  next: (value: any | null) => void,
  error: (e: Error) => void,
): Unsubscribe =>
  onSnapshot(
    doc(db, "matches", id),
    (s) => next(s.exists() ? { id: s.id, ...s.data() } : null),
    error,
  );
export async function loadHistory(uid: string) {
  const s = await getDocs(
    query(
      collection(db, "histories", uid, "matches"),
      orderBy("finishedAt", "desc"),
    ),
  );
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
