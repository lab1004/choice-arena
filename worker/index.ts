/**
 * Cloudflare Workers Free game API.
 * Existing Firebase Spark Authentication, Firestore & Hosting stay unchanged.
 * GameService + engine remain authoritative and unchanged (via module alias).
 * A 1-minute Cron replaces paid Firebase Cloud Tasks / Scheduler.
 */
import { GameService } from "../functions/src/service";
import { GameError } from "../functions/src/engine";
import { FirestoreREST, type WorkerEnv } from "./firestore-rest";
import { AuthError, verifyFirebaseToken } from "./firebase-auth";

function validId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    throw new BadRequest("요청 값을 확인해 주세요.");
  return value;
}
class BadRequest extends Error {}
function allowedOrigin(request: Request, env: WorkerEnv): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const permitted = (env.ALLOWED_ORIGINS ||
    "https://choice-arena.web.app,https://choice-arena.firebaseapp.com,http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((value) => value.trim());
  return permitted.includes(origin) ? origin : null;
}
function response(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(origin ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Vary": "Origin",
      } : {}),
    },
  });
}
function bodyString(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new BadRequest("요청 형식이 잘못되었습니다.");
  return data as Record<string, unknown>;
}
export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const origin = allowedOrigin(request, env);
    if (request.headers.has("Origin") && !origin)
      return response({ error: "허용되지 않은 웹사이트입니다." }, 403, null);
    if (request.method === "OPTIONS") return response({}, 204, origin);
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health")
      return response({ ok: true, provider: "cloudflare-workers-free" }, 200, origin);
    if (request.method !== "POST" || url.pathname !== "/action")
      return response({ error: "지원하지 않는 요청입니다." }, 404, origin);
    if (Number(request.headers.get("content-length") ?? 0) > 16_384)
      return response({ error: "요청이 너무 큽니다." }, 413, origin);
    try {
      const uid = await verifyFirebaseToken(
        request.headers.get("Authorization"), env.FIREBASE_PROJECT_ID,
      );
      const raw = await request.text();
      if (raw.length > 16_384) throw new BadRequest("요청이 너무 큽니다.");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { throw new BadRequest("JSON 형식이 올바르지 않습니다."); }
      const data = bodyString(parsed);
      const db = new FirestoreREST(env);
      const service = new GameService(db as never);
      let result: unknown;
      switch (data.action) {
        case "ensureAccount":
          await service.ensureAccount(uid); result = { ok: true }; break;
        case "start":
          result = { matchId: await service.start(uid, validId(data.roomCode)) }; break;
        case "vote":
          result = await service.act(uid, validId(data.matchId), {
            kind: "vote", value: validId(data.value),
          }); break;
        case "choose":
          if (!Number.isInteger(data.round) || (data.round as number) < 1 || (data.round as number) > 12)
            throw new BadRequest("라운드가 올바르지 않습니다.");
          result = await service.act(uid, validId(data.matchId), {
            kind: "choose", choiceId: validId(data.choiceId), round: data.round as number,
          }); break;
        case "sync":
          result = await service.act(uid, validId(data.matchId), { kind: "tick" }); break;
        case "exit":
          await service.exit(uid, validId(data.matchId)); result = { ok: true }; break;
        case "rematch":
          await service.rematch(uid, validId(data.matchId)); result = { ok: true }; break;
        case "daily":
          result = await service.daily(uid); break;
        case "claim":
          await service.claim(uid, validId(data.questId), validId(data.day)); result = { ok: true }; break;
        case "ranking":
          result = await service.ranking(uid); break;
        default:
          throw new BadRequest("지원하지 않는 요청입니다.");
      }
      return response(result ?? { ok: true }, 200, origin);
    } catch (error) {
      if (error instanceof AuthError) return response({ error: error.message, code: "unauthenticated" }, 401, origin);
      if (error instanceof BadRequest) return response({ error: error.message, code: "invalid-argument" }, 400, origin);
      if (error instanceof GameError) return response({ error: error.message, code: "failed-precondition" }, 409, origin);
      console.error("Worker Game API failed", error instanceof Error ? error.message : "unknown");
      return response({ error: "게임 서버에 연결할 수 없습니다.", code: "internal" }, 500, origin);
    }
  },
  async scheduled(_event: ScheduledEvent, env: WorkerEnv): Promise<void> {
    // When players are connected they already send authenticated sync calls
    // every 3 seconds. Cron advances matches if all clients go offline.
    // Free plan CPU/subrequest limits: process a bounded batch per minute.
    const db = new FirestoreREST(env);
    const service = new GameService(db as never);
    const due = await db.collection("matches")
      .where("deadline", ">", 0).where("deadline", "<=", Date.now())
      .limit(5).get();
    for (const match of due.docs) {
      try { await service.act(null, match.id, { kind: "tick" }); }
      catch (error) { console.error("Cron match advancement failed", match.id, error instanceof Error ? error.message : "unknown"); }
    }
  },
};
