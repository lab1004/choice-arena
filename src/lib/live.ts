import { useEffect, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "./firebase";
import { errorMessage } from "./errors";
export function useDocument<T>(path: string | null) {
  const [state, set] = useState<{
    path: string | null;
    data: T | null;
    loaded: boolean;
    error: string;
  }>({ path: null, data: null, loaded: false, error: "" });
  useEffect(() => {
    if (!path) return;
    set({ path, data: null, loaded: false, error: "" });
    return onSnapshot(
      doc(db, path),
      (s) =>
        set({
          path,
          data: s.exists() ? (s.data() as T) : null,
          loaded: !s.metadata.fromCache || s.exists(),
          error: "",
        }),
      (e) => set({ path, data: null, loaded: true, error: errorMessage(e) }),
    );
  }, [path]);
  return state.path === path
    ? state
    : { path, data: null, loaded: false, error: "" };
}
export function useHistory<T>(uid: string) {
  const [rows, setRows] = useState<T[]>([]),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
  useEffect(
    () =>
      onSnapshot(
        query(
          collection(db, `accounts/${uid}/history`),
          orderBy("finishedAt", "desc"),
          limit(50),
        ),
        (s) => {
          setRows(s.docs.map((d) => d.data() as T));
          setLoaded(true);
        },
        (e) => {
          setError(errorMessage(e));
          setLoaded(true);
        },
      ),
    [uid],
  );
  return { rows, error, loaded };
}
