import { getAdminFirestore } from "@/lib/firebase-admin";
import { chunkString } from "@/lib/intake-storage";
import { getReportGridFsBucket, isMongoConfigured } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

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

async function storeInMongoGridFs(auditId: string, payload: string, createdAt: string) {
  const bucket = await getReportGridFsBucket();
  const filename = `${auditId}.json`;
  const existing = await bucket.find({ filename }).toArray();

  const upload = bucket.openUploadStream(filename, {
    metadata: { auditId, contentType: "application/json", createdAt },
  });
  await new Promise<void>((resolve, reject) => {
    upload.once("error", reject);
    upload.once("finish", () => resolve());
    upload.end(Buffer.from(payload, "utf8"));
  });
  await Promise.all(existing.map((file) => bucket.delete(file._id)));
  return upload.id.toHexString();
}

export async function storeFullReportBlob(auditId: string, report: RecordLike) {
  const createdAt = new Date().toISOString();
  const payload = JSON.stringify(report);
  const size = Buffer.byteLength(payload, "utf8");
  const path = `audit-reports/${auditId}/report.json`;
  let mongoError = "";
  if (isMongoConfigured()) {
    try {
      const fileId = await storeInMongoGridFs(auditId, payload, createdAt);
      return {
        ok: true as const,
        blob: {
          provider: "mongodb_gridfs",
          file_id: fileId,
          filename: `${auditId}.json`,
          size,
          content_type: "application/json",
          created_at: createdAt,
        },
      };
    } catch (error) {
      mongoError = error instanceof Error ? error.message : String(error);
      console.error("MongoDB report storage failed; using configured fallback:", error);
    }
  }
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
        mongoError,
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
    if (provider === "mongodb_gridfs") {
      const fileId = typeof blob?.file_id === "string" ? blob.file_id : "";
      if (!ObjectId.isValid(fileId)) return null;
      const stream = (await getReportGridFsBucket()).openDownloadStream(new ObjectId(fileId));
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      return record(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    }
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

export async function deleteFullReportBlob(source: RecordLike | null | undefined) {
  const blob = record(source?.report_blob);
  const provider = typeof blob?.provider === "string" ? blob.provider : "";
  const path = typeof blob?.path === "string" ? blob.path : "";

  if (provider === "mongodb_gridfs") {
    const fileId = typeof blob?.file_id === "string" ? blob.file_id : "";
    if (ObjectId.isValid(fileId)) {
      await (await getReportGridFsBucket()).delete(new ObjectId(fileId));
    }
    return;
  }
  if (provider === "firebase_storage" && path) {
    await (await storageBucket()).file(path).delete({ ignoreNotFound: true });
  }
}
