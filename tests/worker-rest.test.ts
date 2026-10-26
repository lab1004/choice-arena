import { describe, expect, it } from "vitest";
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
