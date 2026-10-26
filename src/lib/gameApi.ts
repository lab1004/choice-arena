import { httpsCallable } from "firebase/functions";
import { auth, functions, usingEmulators } from "./firebase";

const gameApi = import.meta.env.VITE_GAME_API_URL?.replace(/\/$/, "");

export async function callGame<T = unknown>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  // Local emulator keeps the existing tested Firebase Functions implementation.
  if (usingEmulators) {
    return (
      await httpsCallable<Record<string, unknown>, T>(
        functions, "arenaAction",
      )({ action, ...data })
    ).data;
  }
  // Production uses the zero-billing Cloudflare Workers Free server.
  // NEVER silently fall back to Blaze-only Cloud Functions.
  if (!gameApi || !/^https:\/\//.test(gameApi))
    throw new Error(
      "무료 게임 서버 주소가 설정되지 않았어요. 배포 설정에서 VITE_GAME_API_URL을 지정해 주세요.",
    );
  const user = auth.currentUser;
  if (!user) throw new Error("로그인 후 다시 시도해 주세요.");
  const invoke = async (forceRefresh: boolean) => {
    const token = await user.getIdToken(forceRefresh);
    return fetch(gameApi + "/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ action, ...data }),
    });
  };
  let res = await invoke(false);
  if (res.status === 401) res = await invoke(true);
  const result = await res.json() as { error?: string; code?: string } & T;
  if (!res.ok) {
    const message = result.error || "게임 서버 요청에 실패했어요.";
    const error = new Error(message) as Error & { code?: string };
    error.code = result.code ? "functions/" + result.code : "functions/internal";
    throw error;
  }
  return result;
}
