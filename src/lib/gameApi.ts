import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
export async function callGame<T = unknown>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  return (
    await httpsCallable<Record<string, unknown>, T>(
      functions,
      "arenaAction",
    )({ action, ...data })
  ).data;
}
