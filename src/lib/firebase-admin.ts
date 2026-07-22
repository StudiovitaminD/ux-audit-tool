import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} env var`);
  return value;
}

let configuredFirestore = false;

export function getAdminFirestore() {
  if (!getApps().length) {
    const projectId = requiredEnv("FIREBASE_PROJECT_ID");
    const clientEmail = requiredEnv("FIREBASE_CLIENT_EMAIL");
    const privateKey = requiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();

    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      ...(storageBucket ? { storageBucket } : {}),
    });
  }

  const db = getFirestore();
  // Prevent crashes when any code accidentally tries to write `undefined` values.
  // This is safe and recommended for server environments.
  if (!configuredFirestore) {
    db.settings({ ignoreUndefinedProperties: true });
    configuredFirestore = true;
  }
  return db;
}
