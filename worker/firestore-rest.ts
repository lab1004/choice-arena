/**
 * Cloudflare Workers adapter for the Firestore Admin SDK subset used by GameService.
 * The original game reducer / transaction service stays the single source of truth.
 *
 * All calls use an OAuth-scoped service-account token held only in Worker secrets.
 * Every multi-document mutation uses a native Firestore REST transaction.
 */
import { createSign, randomUUID } from "node:crypto";

export interface WorkerEnv {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  ALLOWED_ORIGINS?: string;
}
interface Credentials { client_email: string; private_key: string; project_id: string; }
type Json = Record<string, unknown>;
const SERVER_TIME = Symbol("SERVER_TIME");
export const FieldValue = { serverTimestamp: () => SERVER_TIME };

function credentials(env: WorkerEnv): Credentials {
  const value = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as Credentials;
  if (!value.client_email || !value.private_key || value.project_id !== env.FIREBASE_PROJECT_ID)
    throw new Error("Worker Firebase service account project mismatch");
  return value;
}
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
let cached: { email: string; token: string; expiration: number } | undefined;
async function accessToken(env: WorkerEnv): Promise<string> {
  const cred = credentials(env);
  if (cached?.email === cred.client_email && cached.expiration > Date.now() + 120_000)
    return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: cred.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = encode({ alg: "RS256", typ: "JWT" }) + "." + encode(claim);
  const signature = createSign("RSA-SHA256").update(unsigned).sign(cred.private_key, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: unsigned + "." + signature,
    }),
  });
  if (!response.ok) throw new Error("Google OAuth service-account exchange failed: " + response.status);
  const result = await response.json() as { access_token: string; expires_in: number };
  cached = {
    email: cred.client_email,
    token: result.access_token,
    expiration: Date.now() + result.expires_in * 1000,
  };
  return result.access_token;
}

function fromValue(v: Json): unknown {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return new Date(String(v.timestampValue));
  if ("referenceValue" in v) return v.referenceValue;
  if ("arrayValue" in v) {
    const array = v.arrayValue as { values?: Json[] };
    return (array?.values ?? []).map(fromValue);
  }
  if ("mapValue" in v) return fromFields((v.mapValue as { fields?: Json })?.fields ?? {});
  throw new Error("Unsupported Firestore document value");
}
function fromFields(fields: Json): Json {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromValue(value as Json)]));
}
function toValue(value: unknown): Json {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isFinite(value))
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (value && typeof value === "object") return { mapValue: { fields: toFields(value as Json) } };
  throw new Error("Invalid Firestore value");
}
function toFields(object: Json): Json {
  return Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== SERVER_TIME)
    .map(([k, v]) => [k, toValue(v)]));
}
export function makeWrite(path: string, value: Json, operation: "create" | "set" | "update", prefix: string): Json {
  const fields = toFields(value);
  const transform = Object.keys(value).filter((k) => value[k] === SERVER_TIME)
    .map((fieldPath) => ({ fieldPath, setToServerValue: "REQUEST_TIME" }));
  const write: Json = { update: { name: prefix + path, fields } };
  if (operation === "create") write.currentDocument = { exists: false };
  if (operation === "update") {
    write.currentDocument = { exists: true };
    write.updateMask = { fieldPaths: Object.keys(fields) };
  }
  if (transform.length) write.updateTransforms = transform;
  return write;
}
export class Doc {
  constructor(readonly path: string) {}
  get id(): string { return this.path.split("/").at(-1)!; }
}
export class Snapshot {
  constructor(readonly ref: Doc, private readonly row: Json | undefined) {}
  get id(): string { return this.ref.id; }
  get exists(): boolean { return this.row !== undefined; }
  data(): Json | undefined { return this.row; }
}
function parseStream(body: string): Json[] {
  const text = body.trim();
  if (!text) return [];
  try {
    const result = JSON.parse(text);
    return Array.isArray(result) ? result : [result];
  } catch {
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Json);
  }
}
export class FirestoreREST {
  readonly root: string;
  constructor(readonly env: WorkerEnv) {
    this.root = "https://firestore.googleapis.com/v1/projects/" +
      encodeURIComponent(env.FIREBASE_PROJECT_ID) + "/databases/(default)/documents";
  }
  doc(path: string): Doc {
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(path) || path.split("/").length % 2 !== 0)
      throw new Error("Invalid Firestore document path");
    return new Doc(path);
  }
  collection(path: string): Query {
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(path) || path.split("/").length % 2 !== 1)
      throw new Error("Invalid Firestore collection path");
    return new Query(this, path);
  }
  async request(path: string, body: Json): Promise<Json[]> {
    const res = await fetch(this.root + path, {
      method: "POST",
      headers: { Authorization: "Bearer " + await accessToken(this.env), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.text();
    if (!res.ok) {
      const error = new Error("Firestore REST " + res.status + ": " + payload.slice(0, 500));
      (error as Error & { status: number }).status = res.status;
      throw error;
    }
    return parseStream(payload);
  }
  async getAll(...refs: Doc[]): Promise<Snapshot[]> {
    return this.readMany(refs);
  }
  async readMany(refs: Doc[], transaction?: string): Promise<Snapshot[]> {
    if (!refs.length) return [];
    const body: Json = { documents: refs.map((r) => this.root + "/" + r.path) };
    if (transaction) body.transaction = transaction;
    const rows = await this.request(":batchGet", body);
    const byName = new Map<string, Json>();
    for (const row of rows) {
      const found = row.found as Json | undefined;
      if (found) byName.set(String(found.name), fromFields((found.fields as Json) ?? {}));
    }
    return refs.map((r) => new Snapshot(r, byName.get(this.root + "/" + r.path)));
  }
  async runTransaction<T>(action: (tx: Transaction) => Promise<T>): Promise<T> {
    for (let tries = 0; tries < 4; tries++) {
      const begun = (await this.request(":beginTransaction", { options: { readWrite: {} } }))[0];
      const transaction = begun.transaction as string;
      if (!transaction) throw new Error("Could not begin Firestore transaction");
      const tx = new Transaction(this, transaction);
      try {
        const result = await action(tx);
        await this.request(":commit", { transaction, writes: tx.writes });
        return result;
      } catch (error) {
        try { await this.request(":rollback", { transaction }); } catch { /* retry or propagate original */ }
        // Firestore reports ABORTED (409) when concurrently modified.
        if (tries < 3 && (error as { status?: number }).status === 409) continue;
        throw error;
      }
    }
    throw new Error("Firestore transaction contention");
  }
}
class Transaction {
  readonly writes: Json[] = [];
  private wrote = false;
  constructor(private readonly db: FirestoreREST, private readonly transaction: string) {}
  async get(ref: Doc): Promise<Snapshot> { return (await this.getAll(ref))[0]; }
  async getAll(...refs: Doc[]): Promise<Snapshot[]> {
    if (this.wrote) throw new Error("Firestore transaction reads must precede writes");
    return this.db.readMany(refs, this.transaction);
  }
  create(ref: Doc, value: Json): void { this.add(ref, value, "create"); }
  set(ref: Doc, value: Json): void { this.add(ref, value, "set"); }
  update(ref: Doc, value: Json): void { this.add(ref, value, "update"); }
  private add(ref: Doc, value: Json, operation: "create" | "set" | "update"): void {
    this.wrote = true;
    this.writes.push(makeWrite(ref.path, value, operation, this.db.root + "/"));
  }
}
export class Query {
  private filters: Array<{ key: string; op: string; value: unknown }> = [];
  private order?: { key: string; direction: string };
  private maximum = 100;
  constructor(private readonly db: FirestoreREST, private readonly path: string) {}
  doc(id = randomUUID().replaceAll("-", "")): Doc { return this.db.doc(this.path + "/" + id); }
  orderBy(key: string, direction: string): this {
    this.order = { key, direction: direction === "desc" ? "DESCENDING" : "ASCENDING" }; return this;
  }
  where(key: string, comparison: string, value: unknown): this {
    const op = ({ ">": "GREATER_THAN", "<=": "LESS_THAN_OR_EQUAL" } as Record<string, string>)[comparison];
    if (!op) throw new Error("Unsupported query comparison");
    this.filters.push({ key, op, value });
    return this;
  }
  limit(limit: number): this { this.maximum = Math.max(1, Math.min(100, limit)); return this; }
  async get(): Promise<{ empty: boolean; docs: Snapshot[] }> {
    const [collectionId] = this.path.split("/").slice(-1);
    const clauses = this.filters.map((f) => ({
      fieldFilter: { field: { fieldPath: f.key }, op: f.op, value: toValue(f.value) },
    }));
    const query: Json = { from: [{ collectionId }], limit: this.maximum };
    if (clauses.length === 1) query.where = clauses[0];
    if (clauses.length > 1) query.where = { compositeFilter: { op: "AND", filters: clauses } };
    if (this.order) query.orderBy = [{ field: { fieldPath: this.order.key }, direction: this.order.direction }];
    const rows = await this.db.request(":runQuery", { structuredQuery: query });
    const docs = rows.filter((r) => r.document).map((r) => {
      const row = r.document as Json, name = String(row.name);
      const path = name.slice(this.db.root.length + 1);
      return new Snapshot(this.db.doc(path), fromFields((row.fields as Json) ?? {}));
    });
    return { empty: docs.length === 0, docs };
  }
}
export function getFirestore(): never {
  throw new Error("Pass a FirestoreREST instance to GameService in Cloudflare Workers");
}
