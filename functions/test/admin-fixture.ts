// Resolve Admin SDK from the same package as the deployed service.
// Separate npm roots must not mix Firestore/FieldValue class instances.
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
export function createAdminFixture() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080")
    throw new Error("Firestore Emulator is required");
  const app = initializeApp(
    { projectId: "demo-choice-arena" },
    "service-tests",
  );
  const db = getFirestore(app);
  return {
    db,
    async dispose() {
      await db.terminate();
      await deleteApp(app);
    },
  };
}
