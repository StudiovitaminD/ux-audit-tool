import { deflateSync, inflateSync } from "node:zlib";
import { getAdminFirestore } from "@/lib/firebase-admin";

const COLLECTION = "report_export_overrides";

function encodeReport(report: unknown) {
  const json = JSON.stringify(report);
  return deflateSync(Buffer.from(json, "utf8")).toString("base64url");
}

function decodeReport(payload: unknown) {
  if (typeof payload !== "string" || !payload.trim()) return null;
  try {
    const json = inflateSync(Buffer.from(payload, "base64url")).toString("utf8");
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

export async function storeReportExportOverride(report: unknown) {
  const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const db = getAdminFirestore();
  await db.collection(COLLECTION).doc(token).set({
    payload: encodeReport(report),
    createdAt: Date.now(),
  });
  return token;
}

export async function loadReportExportOverride(token: string) {
  if (!token.trim()) return null;
  const db = getAdminFirestore();
  const snap = await db.collection(COLLECTION).doc(token).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  return decodeReport(data.payload);
}

export async function deleteReportExportOverride(token: string) {
  if (!token.trim()) return;
  const db = getAdminFirestore();
  await db.collection(COLLECTION).doc(token).delete().catch(() => undefined);
}
