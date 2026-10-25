// Browser test fixture only. Never imported by the application bundle.
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { auth, authReady, usingEmulators } from "../../src/lib/firebase";
export async function signInForAuthTest() {
  if (!usingEmulators || !auth.emulatorConfig)
    throw new Error("Auth Emulator required");
  await authReady;
  const id = crypto.randomUUID();
  const credential = GoogleAuthProvider.credential(
    JSON.stringify({
      sub: id,
      email: `${id}@example.com`,
      email_verified: true,
      name: "Emulator Test",
    }),
  );
  await signInWithCredential(auth, credential);
}
