import http from "node:http";
import { getEnv } from "./env.js";
import { getFirestore, getStorage } from "./firebase.js";
import { IntakeSchema, type Intake } from "./types.js";
import { collectEvidence } from "./evidence.js";
import { auditOneBucket, aggregateScores, writeNarrative } from "./audit.js";
import { QUESTION_BANK, normalizeBucketName } from "./question-bank.js";

const FREE_AUDIT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

function json(res: http.ServerResponse, status: number, body: unknown) {
  const data = Buffer.from(JSON.stringify(body));
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Length", String(data.length));
  res.end(data);
}

async function readBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function toSnakeEnum(value: unknown) {
  if (typeof value !== "string") return value;
  const v = value.trim().toLowerCase();
  if (v === "saas" || v === "saas / platform" || v === "platform" || v === "saas") return "saas";
  if (v === "e-commerce" || v === "ecommerce" || v === "e commerce") return "ecommerce";
  if (v === "marketing website" || v === "website" || v === "marketing_website") return "marketing_website";
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseStoredIntake(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return asRecord(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  return asRecord(value);
}

async function loadStoredIntake(
  env: ReturnType<typeof getEnv>,
  doc: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const fromInline =
    parseStoredIntake(doc.intake_json) ??
    parseStoredIntake(doc.intake);
  if (fromInline) return fromInline;

  const intakeBlob = asRecord(doc.intake_blob);
  const provider = typeof intakeBlob?.provider === "string" ? intakeBlob.provider : "";
  const path = typeof intakeBlob?.path === "string" ? intakeBlob.path : "";
  if (!provider || !path) return null;

  if (provider === "firebase_storage") {
    try {
      const bucket = getStorage(env).bucket();
      const [content] = await bucket.file(path).download();
      return parseStoredIntake(Buffer.from(content).toString("utf8"));
    } catch {
      return null;
    }
  }

  if (provider === "firestore_document" || provider === "firestore_chunks") {
    try {
      const docId = path.split("/").pop() || "";
      if (!docId) return null;
      const db = getFirestore(env);
      const metadataRef = db.collection("audit_intake_blobs").doc(docId);
      const metadataSnap = await metadataRef.get();
      const metadata = asRecord(metadataSnap.data());
      const chunkCount = typeof metadata?.chunk_count === "number" ? metadata.chunk_count : 0;
      if (metadata?.intake_json) return parseStoredIntake(metadata.intake_json);
      if (chunkCount > 0 || provider === "firestore_chunks") {
        const chunksSnap = await metadataRef.collection("chunks").orderBy("order", "asc").get();
        const content = chunksSnap.docs
          .map((chunkDoc) => {
            const chunk = asRecord(chunkDoc.data());
            return typeof chunk?.content === "string" ? chunk.content : "";
          })
          .join("");
        return content ? parseStoredIntake(content) : null;
      }
    } catch {
      return null;
    }
  }

  return null;
}

async function runJob(env: ReturnType<typeof getEnv>, reportId: string) {
  const db = getFirestore(env);
  const ref = db.collection("ux_audits").doc(reportId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Report not found");
  const doc = snap.data() || {};
  const intakeRaw = await loadStoredIntake(env, doc as Record<string, unknown>);

  const parsed = IntakeSchema.safeParse(intakeRaw);
  if (!parsed.success) throw new Error("Invalid intake payload");

  const intake = { ...parsed.data, product_type: toSnakeEnum(parsed.data.product_type) } as Intake;
  const buckets = Array.from(
    new Set(
      (intake.selected_buckets || [])
        .filter(Boolean)
        .map((bucket) => normalizeBucketName(bucket))
        .filter((bucket) => (QUESTION_BANK[bucket] || []).length > 0),
    ),
  );
  if (!buckets.length) throw new Error("No supported buckets selected");

  await ref.set({ status: "processing", startedAt: new Date().toISOString(), progress: { bucketIndex: 0, totalBuckets: buckets.length } }, { merge: true });

  const evidence = await collectEvidence(env, reportId, intake);
  await ref.set({ evidence }, { merge: true });

  const bucketResults = [];
  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i]!;
    const result = await auditOneBucket(env, { intake, bucket, evidence });
    bucketResults.push(result);
    await ref.set({ progress: { bucketIndex: i + 1, totalBuckets: buckets.length }, bucketResults }, { merge: true });
  }

  const meta = {
    audit_id: doc.audit_id || `audit_${Date.now()}`,
    generated_at: new Date().toISOString(),
    product_name: intake.product_name,
    product_url: intake.product_url,
    product_type: intake.product_type,
    primary_platform: intake.primary_platform,
    audit_goal: intake.audit_goal,
    competitors: intake.competitors || "",
    differentiation: intake.differentiation || "",
    known_problem: intake.known_problem || "",
    who_implements: intake.who_implements || "Unknown",
    success_metric: intake.success_metric || "",
    product_stage: intake.product_stage || "Not specified",
    primary_user: intake.primary_user || "",
    primary_user_goal: intake.primary_user_goal || "",
  };

  const scored = aggregateScores({ meta, bucketResults });
  const narrativeModel =
    typeof doc.model_tier === "string" && doc.model_tier === "free_limited"
      ? FREE_AUDIT_MODEL
      : env.OPENROUTER_MODEL;
  const narrative = await writeNarrative(env, scored, narrativeModel);

  const merged = {
    ...scored,
    executive_summary: (narrative as any).executive_summary || {},
    section_narrative: (narrative as any).section_narrative || {},
    findings_detailed: (narrative as any).findings_detailed || [],
    quick_wins_table: (narrative as any).quick_wins_table || [],
    roadmap: (narrative as any).roadmap || scored.roadmap || {},
    closing_note: (narrative as any).closing_note || "",
  };

  await ref.set({ status: "complete", completedAt: new Date().toISOString(), report: merged }, { merge: true });
}

const env = getEnv();
const port = Number(env.PORT || process.env.PORT || 8080);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/healthz") return json(res, 200, { ok: true });

    if (url.pathname === "/run" && req.method === "POST") {
      const secret = req.headers["x-worker-secret"];
      if (secret !== env.WORKER_SECRET) return json(res, 401, { error: "Unauthorized" });
      const body = await readBody(req);
      const reportId = typeof body.reportId === "string" ? body.reportId : "";
      if (!reportId) return json(res, 400, { error: "Missing reportId" });

      // Run synchronously for now (Cloud Run can handle long requests). We can queue later via Cloud Tasks.
      await runJob(env, reportId);
      return json(res, 200, { ok: true, reportId });
    }

    return json(res, 404, { error: "Not found" });
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : "Worker error" });
  }
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Worker listening on :${port}`);
});
