/** Verify Firebase Auth ID tokens using Google's rotating public JWKs. */
import { createPublicKey, verify as verifySignature } from "node:crypto";

interface TokenPayload {
  aud: string;
  iss: string;
  sub: string;
  exp: number;
  iat: number;
  auth_time: number;
  firebase?: { sign_in_provider?: string };
}
interface Jwk { kid?: string; kty?: string; alg?: string; use?: string; n?: string; e?: string }
let keys: { entries: Jwk[]; until: number } | undefined;
async function googleKeys(): Promise<Jwk[]> {
  if (keys && keys.until > Date.now()) return keys.entries;
  const response = await fetch(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  );
  if (!response.ok) throw new Error("Firebase Auth public keys unavailable");
  const body = await response.json() as { keys: Jwk[] };
  if (!body.keys?.length) throw new Error("Firebase Auth JWK list is empty");
  const maxAge = Number(response.headers.get("Cache-Control")?.match(/max-age=(\d+)/)?.[1] ?? 300);
  keys = { entries: body.keys, until: Date.now() + Math.min(3600, maxAge) * 1000 };
  return keys.entries;
}

export async function verifyFirebaseToken(header: string | null, project: string): Promise<string> {
  if (!header?.startsWith("Bearer ")) throw new AuthError("Firebase 로그인 토큰이 없습니다.");
  const jwt = header.slice("Bearer ".length);
  const segments = jwt.split(".");
  if (segments.length !== 3 || jwt.length > 12_000)
    throw new AuthError("로그인 토큰 형식이 올바르지 않습니다.");
  let head: { alg?: string; kid?: string }, claims: TokenPayload;
  try {
    head = JSON.parse(Buffer.from(segments[0], "base64url").toString());
    claims = JSON.parse(Buffer.from(segments[1], "base64url").toString());
  } catch { throw new AuthError("로그인 토큰을 해석할 수 없습니다."); }
  const now = Math.floor(Date.now() / 1000);
  if (
    head.alg !== "RS256" || !head.kid ||
    claims.aud !== project || claims.iss !== "https://securetoken.google.com/" + project ||
    typeof claims.sub !== "string" || claims.sub.length < 1 || claims.sub.length > 128 ||
    !Number.isFinite(claims.exp) || claims.exp <= now ||
    !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
    !Number.isFinite(claims.auth_time) || claims.auth_time > now + 60
  ) throw new AuthError("로그인이 만료되었거나 올바르지 않습니다.");
  const key = (await googleKeys()).find((jwk) => jwk.kid === head.kid);
  if (!key) {
    keys = undefined; // certificate rotation
    const refreshed = (await googleKeys()).find((jwk) => jwk.kid === head.kid);
    if (!refreshed) throw new AuthError("로그인 서명 키를 확인할 수 없습니다.");
    return validateSignature(refreshed);
  }
  return validateSignature(key);

  function validateSignature(jwk: Jwk): string {
    try {
      const publicKey = createPublicKey({ key: jwk as unknown as Record<string, string>, format: "jwk" });
      if (!verifySignature("RSA-SHA256", Buffer.from(segments[0] + "." + segments[1]),
        publicKey, Buffer.from(segments[2], "base64url")))
        throw new Error("signature mismatch");
      return claims.sub;
    } catch { throw new AuthError("로그인 토큰 서명이 올바르지 않습니다."); }
  }
}
export class AuthError extends Error {}
