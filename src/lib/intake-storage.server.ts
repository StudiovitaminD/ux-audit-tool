import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  asPlainRecord,
  chunkString,
  parseStoredIntake,
} from "@/lib/intake-storage";

async function getAdminStorageBucket() {
  const { getStorage } = await import("firebase-admin/storage");
  return getStorage().bucket();
}

export async function storeFullIntakeBlob(auditId: string, intake: Record<string, unknown>) {
  const createdAt = new Date().toISOString();
  const payload = JSON.stringify(intake);
  const size = Buffer.byteLength(payload, "utf8");
  const path = `audit-intakes/${auditId}/intake.json`;

  try {
    const bucket = await getAdminStorageBucket();
    const file = bucket.file(path);
    await file.save(payload, {
      contentType: "application/json",
      public: false,
      metadata: {
        contentType: "application/json",
        cacheControl: "no-store",
      },
    });
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: "2030-01-01T00:00:00.000Z",
    });

    return {
      ok: true,
      blob: {
        provider: "firebase_storage",
        path,
        url,
        size,
        content_type: "application/json",
        created_at: createdAt,
      },
      bytes: size,
      storageStrategy: "firebase_storage_blob",
    } as const;
  } catch (storageError) {
    const db = getAdminFirestore();
    try {
      const chunks = chunkString(payload);
      const fallbackPath = `audit_intake_blobs/${auditId}`;
      const metadataRef = db.collection("audit_intake_blobs").doc(auditId);
      const batch = db.batch();

      batch.set(
        metadataRef,
        {
          createdAt,
          size,
          content_type: "application/json",
          path: fallbackPath,
          chunk_count: chunks.length,
        },
        { merge: true },
      );

      chunks.forEach((chunk, index) => {
        const chunkRef = metadataRef.collection("chunks").doc(String(index).padStart(6, "0"));
        batch.set(chunkRef, {
          order: index,
          content: chunk,
          size: Buffer.byteLength(chunk, "utf8"),
        });
      });

      await batch.commit();
      return {
        ok: true,
        blob: {
          provider: "firestore_chunks",
          path: fallbackPath,
          size,
          content_type: "application/json",
          created_at: createdAt,
        },
        bytes: size,
        storageStrategy: "firestore_chunks_fallback",
      } as const;
    } catch (dbError) {
      const message = dbError instanceof Error ? dbError.message : String(dbError);
      return {
        ok: false,
        error: message,
        bytes: size,
        storageStrategy: "firebase_storage_blob",
        storageError: storageError instanceof Error ? storageError.message : String(storageError),
      } as const;
    }
  }
}

export async function loadStoredIntake(record: Record<string, unknown> | null | undefined) {
  const rec = asPlainRecord(record);
  if (!rec) return null;

  if (rec.intake_blob && typeof rec.intake_blob === "object") {
    const blob = asPlainRecord(rec.intake_blob);
    const provider = typeof blob?.provider === "string" ? blob.provider : "";
    const path = typeof blob?.path === "string" ? blob.path : "";

    if (provider === "firebase_storage" && path) {
      try {
        const bucket = await getAdminStorageBucket();
        const [content] = await bucket.file(path).download();
        return parseStoredIntake(Buffer.from(content).toString("utf8"));
      } catch {
      }
    }

    if ((provider === "firestore_document" || provider === "firestore_chunks") && path) {
      try {
        const docId = path.split("/").pop() || "";
        if (docId) {
          const metadataRef = getAdminFirestore().collection("audit_intake_blobs").doc(docId);
          const snap = await metadataRef.get();
          const data = asPlainRecord(snap.data());
          if (data?.intake_json) return parseStoredIntake(data.intake_json);
          const chunkCount = typeof data?.chunk_count === "number" ? data.chunk_count : 0;
          if (chunkCount > 0 || provider === "firestore_chunks") {
            const chunksSnap = await metadataRef.collection("chunks").orderBy("order", "asc").get();
            const content = chunksSnap.docs
              .map((chunkDoc) => {
                const chunk = asPlainRecord(chunkDoc.data());
                return typeof chunk?.content === "string" ? chunk.content : "";
              })
              .join("");
            if (content) return parseStoredIntake(content);
          }
        }
      } catch {
      }
    }
  }

  if (typeof rec.intake_json === "string" && rec.intake_json.trim()) {
    return parseStoredIntake(rec.intake_json);
  }
  if (typeof rec.intake === "string" && rec.intake.trim()) {
    return parseStoredIntake(rec.intake);
  }
  if (rec.intake && typeof rec.intake === "object") {
    return parseStoredIntake(rec.intake);
  }
  return null;
}
