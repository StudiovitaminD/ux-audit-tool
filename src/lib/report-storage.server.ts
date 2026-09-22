import { getAdminFirestore } from "@/lib/firebase-admin";
import { chunkString } from "@/lib/intake-storage";

type RecordLike = Record<string, unknown>;

function record(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordLike
    : null;
}

async function storageBucket() {
  const { getStorage } = await import("firebase-admin/storage");
  return getStorage().bucket();
}

export async function storeFullReportBlob(auditId: string, report: RecordLike) {
  const createdAt = new Date().toISOString();
  const payload = JSON.stringify(report);
  const size = Buffer.byteLength(payload, "utf8");
  const path = `audit-reports/${auditId}/report.json`;
  try {
    const bucket = await storageBucket();
    await bucket.file(path).save(payload, {
      contentType: "application/json",
      public: false,
      metadata: { cacheControl: "no-store" },
    });
    return {
      ok: true as const,
      blob: { provider: "firebase_storage", path, size, content_type: "application/json", created_at: createdAt },
    };
  } catch (storageError) {
    try {
      const chunks = chunkString(payload);
      const metadataRef = getAdminFirestore().collection("audit_report_blobs").doc(auditId);
      const oldChunks = await metadataRef.collection("chunks").get();
      const batch = getAdminFirestore().batch();
      oldChunks.docs.forEach((doc) => batch.delete(doc.ref));
      batch.set(metadataRef, { createdAt, size, content_type: "application/json", chunk_count: chunks.length });
      chunks.forEach((content, index) => {
        batch.set(metadataRef.collection("chunks").doc(String(index).padStart(6, "0")), {
          order: index,
          content,
        });
      });
      await batch.commit();
      return {
        ok: true as const,
        blob: { provider: "firestore_chunks", path: `audit_report_blobs/${auditId}`, size, content_type: "application/json", created_at: createdAt },
      };
    } catch (fallbackError) {
      return {
        ok: false as const,
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        storageError: storageError instanceof Error ? storageError.message : String(storageError),
      };
    }
  }
}

export async function loadFullReportBlob(source: RecordLike | null | undefined) {
  const blob = record(source?.report_blob);
  const provider = typeof blob?.provider === "string" ? blob.provider : "";
  const path = typeof blob?.path === "string" ? blob.path : "";
  try {
    if (provider === "firebase_storage" && path) {
      const [content] = await (await storageBucket()).file(path).download();
      return record(JSON.parse(content.toString("utf8")));
    }
    if (provider === "firestore_chunks") {
      const id = path.split("/").pop() || "";
      const chunks = await getAdminFirestore()
        .collection("audit_report_blobs")
        .doc(id)
        .collection("chunks")
        .orderBy("order", "asc")
        .get();
      const content = chunks.docs.map((doc) => String(doc.data().content || "")).join("");
      return content ? record(JSON.parse(content)) : null;
    }
  } catch {
    return null;
  }
  return null;
}
