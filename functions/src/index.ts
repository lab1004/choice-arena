import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";
import { onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { REGION, createService, requireUid } from "./service.js";
initializeApp();
const service = createService(getFirestore());
const options = { region: REGION, maxInstances: 10 };
export const gameAction = onCall(options, async (req) => {
  const uid = requireUid(req.auth?.uid),
    data = req.data || {};
  if (data.action === "start")
    return {
      ...(await service.start(uid, data.roomCode)),
      serverNow: Date.now(),
    };
  return {
    ...(await service.process(data.matchId, uid, data)),
    serverNow: Date.now(),
  };
});
export const getQuests = onCall(options, (req) =>
  service.getQuests(requireUid(req.auth?.uid)),
);
export const claimQuest = onCall(options, (req) =>
  service.claimQuest(requireUid(req.auth?.uid), String(req.data?.id || "")),
);
export const getRanking = onCall(options, (req) =>
  service.ranking(requireUid(req.auth?.uid)),
);
export const updateSettings = onCall(options, (req) =>
  service.settings(requireUid(req.auth?.uid), req.data || {}),
);
// Durable task delivery advances deadlines even if every browser closes.
export const advanceDeadline =
  process.env.FUNCTIONS_EMULATOR === "true"
    ? undefined
    : onTaskDispatched(
        {
          ...options,
          retryConfig: { maxAttempts: 5, minBackoffSeconds: 2 },
          rateLimits: { maxConcurrentDispatches: 10 },
        },
        async (req) => {
          await service.process(req.data.matchId, undefined, {
            action: "advance",
            revision: req.data.revision,
          });
        },
      );
export const scheduleDeadline =
  process.env.FUNCTIONS_EMULATOR === "true"
    ? undefined
    : onDocumentWritten(
        { region: REGION, document: "matches/{matchId}", retry: true },
        async (event) => {
          const after = event.data?.after.data(),
            before = event.data?.before.data();
          if (
            !after?.deadline ||
            after.phase === "finished" ||
            after.revision === before?.revision
          )
            return;
          if (process.env.FUNCTIONS_EMULATOR === "true") return;
          await getFunctions()
            .taskQueue(`locations/${REGION}/functions/advanceDeadline`)
            .enqueue(
              { matchId: event.params.matchId, revision: after.revision },
              {
                scheduleTime: new Date(
                  Math.max(Date.now() + 1000, after.deadline.toMillis() + 500),
                ),
              },
            );
        },
      );
