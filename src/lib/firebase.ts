import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
const env = import.meta.env;
export const usingEmulators = env.DEV && env.VITE_USE_EMULATORS === "true";
const app = initializeApp({
  apiKey:
    env.VITE_FIREBASE_API_KEY || "AIzaSyAo15UBS5RcqJu4rsz7rRpgk7PDoMRita8",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "choice-arena.firebaseapp.com",
  projectId: usingEmulators
    ? "demo-choice-arena"
    : env.VITE_FIREBASE_PROJECT_ID || "choice-arena",
  storageBucket:
    env.VITE_FIREBASE_STORAGE_BUCKET || "choice-arena.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1035613270412",
  appId:
    env.VITE_FIREBASE_APP_ID || "1:1035613270412:web:6f64fc87258c626fc5a6a9",
});
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "asia-northeast3");
if (usingEmulators) {
  // The application already displays a persistent Korean Emulator banner.
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
export const authReady = setPersistence(auth, browserLocalPersistence);
