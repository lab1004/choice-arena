import { callGame } from "./gameApi";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { auth, authReady, db } from "./firebase";
import { ArenaError, errorMessage } from "./errors";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  saveProfile,
  setReady,
  transferHost,
} from "./arena";
import type { PlayerSession, Profile, Room } from "../domain/game";

export function useArena() {
  const [user, setUser] = useState<User | null>();
  const [profile, setProfile] = useState<Profile | null>();
  const [session, setSession] = useState<PlayerSession>();
  const [roomState, setRoomState] = useState<{
    code: string;
    data: Room | null;
    synced: boolean;
  }>();
  const [sessionSynced, setSessionSynced] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [retry, setRetry] = useState(0);
  const busyRef = useRef(false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    let unsubscribe = () => {};
    let active = true;
    void authReady
      .then(() => {
        if (!active) return;
        unsubscribe = onAuthStateChanged(
          auth,
          (next) => {
            setProfile(undefined);
            setSession(undefined);
            setRoomState(undefined);
            setSessionSynced(false);
            setError("");
            setUser(next);
          },
          (e) => setError(errorMessage(e)),
        );
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    setSessionSynced(false);
    const stopProfile = onSnapshot(
      doc(db, "profiles", user.uid),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.exists() || !snap.metadata.fromCache)
          setProfile(snap.exists() ? (snap.data() as Profile) : null);
      },
      (e) => setError(errorMessage(e)),
    );
    const stopSession = onSnapshot(
      doc(db, "sessions", user.uid),
      { includeMetadataChanges: true },
      (snap) => {
        setSessionSynced(!snap.metadata.fromCache);
        if (snap.exists() || !snap.metadata.fromCache)
          setSession(
            snap.exists() ? (snap.data() as PlayerSession) : { roomCode: null },
          );
      },
      (e) => {
        setSessionSynced(false);
        setError(errorMessage(e));
      },
    );
    return () => {
      stopProfile();
      stopSession();
    };
  }, [user, retry]);
  const code = session?.roomCode;
  useEffect(() => {
    if (!user || !code) return;
    let active = true;
    const stop = onSnapshot(
      doc(db, "rooms", code),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.exists() || !snap.metadata.fromCache)
          setRoomState({
            code,
            data: snap.exists() ? (snap.data() as Room) : null,
            synced: !snap.metadata.fromCache,
          });
      },
      async (e) => {
        // A successful leave can revoke this listener before the session listener catches up.
        try {
          const latest = await getDocFromServer(doc(db, "sessions", user.uid));
          if (!active) return;
          if (latest.data()?.roomCode !== code) {
            setSession((latest.data() as PlayerSession) ?? { roomCode: null });
            return;
          }
        } catch {
          /* Keep the original subscription error visible. */
        }
        if (active) {
          setError(errorMessage(e));
          setRoomState(undefined);
        }
      },
    );
    return () => {
      active = false;
      stop();
    };
  }, [code, user, retry]);
  const run = useCallback(
    async (label: string, action: () => Promise<unknown>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(label);
      setError("");
      try {
        if (!navigator.onLine) throw new ArenaError("offline");
        await action();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        busyRef.current = false;
        setBusy("");
      }
    },
    [],
  );
  const room =
    roomState && roomState.code === code ? roomState.data : undefined;
  return {
    user,
    profile,
    session,
    room,
    code,
    online,
    error,
    busy,
    loading:
      user === undefined ||
      (!!user && (profile === undefined || session === undefined)),
    canMutate:
      online &&
      sessionSynced &&
      (!code || (roomState?.code === code && roomState.synced)),
    reconnect: () => {
      setError("");
      setRetry((v) => v + 1);
    },
    dismissError: () => setError(""),
    login: () =>
      run("로그인 중", () => signInWithPopup(auth, new GoogleAuthProvider())),
    logout: () => run("로그아웃 중", () => signOut(auth)),
    run,
    saveNickname: (
      nickname: string,
      avatarId = "sprout",
      rankingAnonymous = false,
    ) =>
      user &&
      run("닉네임 저장 중", () =>
        saveProfile(
          db,
          user.uid,
          nickname,
          user.email,
          avatarId,
          rankingAnonymous,
        ),
      ),
    create: (maxPlayers: number) =>
      user &&
      run("방 만드는 중", async () => {
        const createdCode = await createRoom(
          db, user.uid, undefined, maxPlayers,
        );
        // The committed transaction is authoritative. Update the local route
        // immediately instead of waiting for a delayed mobile onSnapshot.
        setSession({ roomCode: createdCode });
      }),
    start: () =>
      code && run("경기 시작 중", () => callGame("start", { roomCode: code })),
    join: (input: string) =>
      user &&
      run("방에 참가하는 중", async () => {
        const joinedCode = await joinRoom(db, user.uid, input);
        // Never navigate optimistically before Firestore has confirmed join.
        // This avoids appearing stuck on /play on slower mobile connections.
        setSession({ roomCode: joinedCode });
      }),
    leave: () => user && run("방 나가는 중", () => leaveRoom(db, user.uid)),
    ready: (value: boolean) =>
      user &&
      code &&
      run("준비 상태 저장 중", () => setReady(db, user.uid, code, value)),
    transfer: (target: string) =>
      user &&
      code &&
      run("방장 위임 중", () => transferHost(db, user.uid, code, target)),
  };
}
export type Arena = ReturnType<typeof useArena>;
