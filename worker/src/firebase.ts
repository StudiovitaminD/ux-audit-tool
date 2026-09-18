import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore as firestoreForApp } from "firebase-admin/firestore";
import { getStorage as storageForApp } from "firebase-admin/storage";
import type { WorkerEnv } from "./env.js";

export function getAdminApp(env: WorkerEnv) {
  if (getApps().length) return getApp();
  const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
  return initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
  });
}

export function getFirestore(env: WorkerEnv) {
  return firestoreForApp(getAdminApp(env));
}

export function getStorage(env: WorkerEnv) {
  return storageForApp(getAdminApp(env));
}
