import { describe, expect, it, vi } from "vitest";
import { FieldValue, FirestoreREST, makeWrite } from "../worker/firestore-rest";
import { AuthError, verifyFirebaseToken } from "../worker/firebase-auth";

const prefix = "projects/choice-arena/databases/(default)/documents/";

describe("Cloudflare Free Firestore adapter", () => {
  it("generates Firestore REST transforms rather than persisting fake timestamps", () => {
    const write = makeWrite(
      "rooms/ABC234",
      {
        status: "playing",
        matchId: "match1",
        updatedAt: FieldValue.serverTimestamp(),
      },
      "update",
      prefix,
    );
    expect(write).toMatchObject({
      update: {
        name: prefix + "rooms/ABC234",
        fields: { status: { stringValue: "playing" }, matchId: { stringValue: "match1" } },
      },
      updateMask: { fieldPaths: ["status", "matchId"] },
      currentDocument: { exists: true },
      updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
    });
    expect((write.update as { fields: Record<string, unknown> }).fields).not.toHaveProperty("updatedAt");
  });
  it("serializes nested maps, arrays, integral milliseconds and preconditions", () => {
    const write = makeWrite("matches/game1", {
      deadline: 123456789,
      done: false,
      memberIds: ["u1", "u2"],
      results: [],
      players: { u1: { coins: 1000, alive: true } },
      createdAt: FieldValue.serverTimestamp(),
    }, "create", prefix);
    expect(write.currentDocument).toEqual({ exists: false });
    expect(write.update).toMatchObject({
      fields: {
        deadline: { integerValue: "123456789" },
        done: { booleanValue: false },
        memberIds: { arrayValue: { values: [{ stringValue: "u1" }, { stringValue: "u2" }] } },
        players: { mapValue: { fields: {
          u1: { mapValue: { fields: { coins: { integerValue: "1000" }, alive: { booleanValue: true } } } },
        } } },
      },
    });
    expect(write.updateTransforms).toEqual([{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }]);
  });
  it("sends Firestore resource names, never full HTTPS URLs, on batchGet", async () => {
    const db = new FirestoreREST({ FIREBASE_PROJECT_ID: "choice-arena", FIREBASE_SERVICE_ACCOUNT_JSON: "" });
    const first = "accounts/user_01/days/2026-10-26", second = "profiles/unknown";
    const request = vi.spyOn(db, "request").mockResolvedValueOnce([
      { missing: prefix + second },
      { found: { name: prefix + first, fields: {
        day: { stringValue: "2026-10-26" },
        ids: { arrayValue: { values: [{ stringValue: "q1" }] } },
      } } },
    ]);
    expect(db.root).toBe(prefix.slice(0, -1));
    const documents = await db.getAll(db.doc(first), db.doc(second));
    expect(request).toHaveBeenCalledWith(":batchGet", {
      documents: [prefix + first, prefix + second],
    });
    expect(documents[0].exists).toBe(true);
    expect(documents[0].data()).toEqual({ day: "2026-10-26", ids: ["q1"] });
    expect(documents[1].exists).toBe(false);
  });
  it("parses Firestore query document names as relative collection paths", async () => {
    const db = new FirestoreREST({ FIREBASE_PROJECT_ID: "choice-arena", FIREBASE_SERVICE_ACCOUNT_JSON: "" });
    const request = vi.spyOn(db, "request").mockResolvedValueOnce([
      { document: { name: prefix + "accounts/player1", fields: { points: { integerValue: "15" } } } },
    ]);
    const result = await db.collection("accounts").orderBy("points", "desc").limit(10).get();
    expect(request).toHaveBeenCalledWith(":runQuery", {
      structuredQuery: {
        from: [{ collectionId: "accounts" }],
        limit: 10,
        orderBy: [{ field: { fieldPath: "points" }, direction: "DESCENDING" }],
      },
    });
    expect(result.docs[0].ref.path).toBe("accounts/player1");
    expect(result.docs[0].data()).toEqual({ points: 15 });
  });
  it("commits canonical Firestore resource names in native transactions", async () => {
    const db = new FirestoreREST({ FIREBASE_PROJECT_ID: "choice-arena", FIREBASE_SERVICE_ACCOUNT_JSON: "" });
    const request = vi.spyOn(db, "request").mockImplementation(async (path) => {
      if (path === ":beginTransaction") return [{ transaction: "transaction-test" }];
      if (path === ":batchGet") return [{ missing: prefix + "accounts/player1" }];
      if (path === ":commit") return [{}];
      throw new Error("Unexpected transaction operation: " + path);
    });
    await db.runTransaction(async (tx) => {
      const ref = db.doc("accounts/player1");
      const snap = await tx.get(ref);
      expect(snap.exists).toBe(false);
      tx.create(ref, { points: 0, wins: 0, games: 0 });
    });
    expect(request).toHaveBeenCalledWith(":commit", {
      transaction: "transaction-test",
      writes: [
        { update: {
          name: prefix + "accounts/player1",
          fields: {
            points: { integerValue: "0" },
            wins: { integerValue: "0" },
            games: { integerValue: "0" },
          },
        }, currentDocument: { exists: false } },
      ],
    });
  });
  it("validates document paths and collection paths", () => {
    const db = new FirestoreREST({ FIREBASE_PROJECT_ID: "choice-arena", FIREBASE_SERVICE_ACCOUNT_JSON: "" });
    expect(db.doc("accounts/user_01/history/match-42").id).toBe("match-42");
    expect(db.collection("matches").doc("ABC234").id).toBe("ABC234");
    expect(() => db.doc("accounts")).toThrow();
    expect(() => db.doc("accounts/u1/../private")).toThrow();
  });
});
describe("Firebase verification", () => {
  it("rejects missing or unsigned tokens without a network request", async () => {
    await expect(verifyFirebaseToken(null, "choice-arena")).rejects.toBeInstanceOf(AuthError);
    await expect(verifyFirebaseToken("Bearer invalid", "choice-arena")).rejects.toBeInstanceOf(AuthError);
  });
});
