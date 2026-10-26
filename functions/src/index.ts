import { initializeApp } from "firebase-admin/app";
import { getFunctions } from "firebase-admin/functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { GameError } from "./engine";
import { GameService } from "./service";
initializeApp();
const service = new GameService();
const region = "asia-northeast3";
function id(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    throw new HttpsError("invalid-argument", "요청 값을 확인해 주세요.");
  return value;
}
export const arenaAction = onCall({ region, maxInstances: 10 }, async (req) => {
  if (!req.auth)
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const uid = req.auth.uid;
  const data = req.data ?? {};
  try {
    switch (data.action) {
      case "ensureAccount":
        await service.ensureAccount(uid);
        break;
      case "start":
        return { matchId: await service.start(uid, id(data.roomCode)) };
      case "vote":
        return await service.act(uid, id(data.matchId), {
          kind: "vote",
          value: id(data.value),
        });
      case "choose":
        if (!Number.isInteger(data.round))
          throw new HttpsError("invalid-argument", "라운드가 필요합니다.");
        return await service.act(uid, id(data.matchId), {
          kind: "choose",
          choiceId: id(data.choiceId),
          round: data.round,
        });
      case "sync":
        return await service.act(uid, id(data.matchId), { kind: "tick" });
      case "exit":
        await service.exit(uid, id(data.matchId));
        break;
      case "rematch":
        await service.rematch(uid, id(data.matchId));
        break;
      case "daily":
        return await service.daily(uid);
      case "claim":
        await service.claim(uid, id(data.questId), id(data.day));
        break;
      case "ranking":
        return await service.ranking(uid);
      default:
        throw new HttpsError("invalid-argument", "지원하지 않는 요청입니다.");
    }
    return { ok: true, serverNow: Date.now() };
  } catch (e) {
    if (e instanceof GameError)
      throw new HttpsError("failed-precondition", e.message);
    throw e;
  }
});
// Production: a durable Cloud Task at each deadline, independent of client connectivity.
export const scheduleDeadline = onDocumentWritten(
  { document: "matches/{matchId}", region, retry: true },
  async (event) => {
    const after = event.data?.after.data(),
      before = event.data?.before.data();
    if (!after?.deadline || before?.deadline === after.deadline) return;
    // The Tasks emulator doesn't deliver scheduled tasks. Clients + sweep exercise the same transaction.
    if (process.env.FUNCTIONS_EMULATOR === "true") return;
    await getFunctions()
      .taskQueue(`locations/${region}/functions/advanceMatch`)
      .enqueue(
        { matchId: event.params.matchId, deadline: after.deadline },
        { scheduleTime: new Date(after.deadline), dispatchDeadlineSeconds: 60 },
      );
  },
);
export const advanceMatch = onTaskDispatched(
  {
    region,
    retryConfig: { maxAttempts: 5, minBackoffSeconds: 1 },
    rateLimits: { maxConcurrentDispatches: 20 },
  },
  async (req) => {
    await service.act(
      null,
      id(req.data.matchId),
      { kind: "tick" },
      req.data.deadline,
    );
  },
);
// Repairs missed/late task delivery. Server deadlines remain authoritative.
export const sweepMatches = onSchedule(
  {
    region,
    schedule: "every 1 minutes",
    timeZone: "Asia/Seoul",
    maxInstances: 1,
  },
  async () => {
    const due = await service.db
      .collection("matches")
      .where("deadline", ">", 0)
      .where("deadline", "<=", Date.now())
      .limit(100)
      .get();
    await Promise.all(
      due.docs.map((d) => service.act(null, d.id, { kind: "tick" })),
    );
  },
);
