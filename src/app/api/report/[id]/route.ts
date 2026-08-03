import { getAdminFirestore } from "@/lib/firebase-admin";
import { getAccountSessionFromRequest } from "@/lib/account-server";
import {
  loadStoredReport,
  reportBelongsToSession,
  resolveReportSnapshot,
  unwrapReportPayload,
} from "@/lib/report-record";
import { collectCloudinaryPublicIds, destroyCloudinaryAsset } from "@/lib/cloudinary-cleanup";

const AUTO_CONTINUE_STAGES = new Set([
  "queued_next_bucket",
  "finalizing",
  "retrying_primary_model",
  "fallback_scoring",
]);
const AUTO_CONTINUE_LEASE_MS = 8000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function hasFinalizedReportPayload(value: unknown) {
  const report = asRecord(value);
  if (!report) return false;

  const auditMode = asString(report.audit_mode);
  const coverageStatus = asString(report.coverage_status);
  const scoreEligible = typeof report.ux_score_eligible === "boolean" ? report.ux_score_eligible : null;
  const questionsTotal = asNumber(report.questions_total);
  const questionsScoreable = asNumber(report.questions_scoreable);
  const bucketResults = Array.isArray(report.bucket_results) ? report.bucket_results : null;
  const scorecard = Array.isArray(report.scorecard) ? report.scorecard : null;
  const hasOverallScore = asNumber(report.overall_score) !== null;

  return Boolean(
    auditMode &&
      coverageStatus &&
      scoreEligible !== null &&
      questionsTotal !== null &&
      questionsScoreable !== null &&
      (
        (bucketResults && bucketResults.length > 0) ||
        (scorecard && scorecard.length > 0) ||
        hasOverallScore
      ),
  );
}

function hasRenderableNormalizedReport(data: Record<string, unknown>) {
  return hasFinalizedReportPayload(data);
}

function normalizeProgressState(data: Record<string, unknown>) {
  const progress = asRecord(data.progress) ?? {};
  const bucketIndex = asNumber(progress.bucketIndex ?? data.bucketIndex);
  const totalBuckets = asNumber(progress.totalBuckets ?? data.totalBuckets);
  const retryCount = asNumber(progress.retryCount ?? data.retryCount) ?? 0;
  const attemptCount = asNumber(progress.attemptCount ?? data.attemptCount) ?? 0;
  const completedBuckets =
    asNumber(progress.completedBuckets ?? data.completedBuckets) ??
    bucketIndex ??
    0;
  const currentBucketNumber =
    asNumber(progress.currentBucketNumber ?? data.currentBucketNumber) ??
    (bucketIndex !== null && totalBuckets !== null && bucketIndex < totalBuckets
      ? bucketIndex + 1
      : null);
  const currentBucketName =
    asString(progress.currentBucketName ?? data.currentBucketName) ?? null;
  const currentStage = asString(progress.currentStage ?? data.currentStage) ?? null;
  const currentBucketStartedAt =
    asString(progress.currentBucketStartedAt ?? data.currentBucketStartedAt) ?? null;
  const startedAt = asString(progress.startedAt ?? data.startedAt) ?? null;

  return {
    bucketIndex,
    totalBuckets,
    retryCount,
    attemptCount,
    completedBuckets,
    currentBucketNumber,
    currentBucketName,
    currentStage,
    currentBucketStartedAt,
    startedAt,
  };
}

function isProgressFinished(data: Record<string, unknown>) {
  const progress = normalizeProgressState(data);
  if (progress.bucketIndex === null || progress.totalBuckets === null) return false;
  return progress.totalBuckets >= 0 && progress.bucketIndex >= progress.totalBuckets;
}

async function maybeAutoContinueQueuedReport(req: Request, id: string) {
  const db = getAdminFirestore();
  const ref = db.collection("ux_audits").doc(id);
  let shouldKick = false;

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return;

    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const progressRecord = asRecord(data.progress) ?? {};
    const progress = normalizeProgressState(data);
    const status = asString(data.status) ?? "processing";
    const currentStage = progress.currentStage ?? null;
    const leaseUntil = asNumber(progressRecord.autoContinueLeaseUntil) ?? 0;
    const now = Date.now();

    if (status === "complete" || status === "error") return;
    if (!currentStage || !AUTO_CONTINUE_STAGES.has(currentStage)) return;
    if (leaseUntil > now) return;

    shouldKick = true;
    transaction.set(
      ref,
      {
        progress: {
          ...progressRecord,
          autoContinueLeaseUntil: now + AUTO_CONTINUE_LEASE_MS,
          lastAutoContinueRequestedAt: new Date(now).toISOString(),
          lastAutoContinueRequestedStage: currentStage,
        },
      },
      { merge: true },
    );
  });

  if (!shouldKick) return;

  const origin = new URL(req.url).origin;
  void fetch(`${origin}/api/audit/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportId: id }),
  }).catch(() => undefined);
}

function stripInlineAssets(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => stripInlineAssets(item, key));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && /^data:(image|video|application)\//i.test(value)) {
      return "";
    }
    if (
      typeof value === "string" &&
      (key === "screenshot" || key === "screenshot_url" || key === "screenshotUrl") &&
      /^data:(image|video|application)\//i.test(value)
    ) {
      return "";
    }
    return value;
  }

  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(rec)) {
    if (
      (childKey === "screenshot" ||
        childKey === "screenshot_url" ||
        childKey === "screenshotUrl" ||
        childKey === "image" ||
        childKey === "dataUrl" ||
        childKey === "data_url") &&
      typeof childValue === "string" &&
      /^data:(image|video|application)\//i.test(childValue)
    ) {
      continue;
    }
    out[childKey] = stripInlineAssets(childValue, childKey);
  }
  return out;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const id = params.id;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const accountSession = await getAccountSessionFromRequest(req);
  if (!accountSession) {
    return Response.json({ error: "Please sign in first." }, { status: 401 });
  }

  const snap = await resolveReportSnapshot(id);
  if (!snap?.exists) return Response.json({ error: "Not found" }, { status: 404 });

  const dataRecord = (snap.data() ?? {}) as Record<string, unknown>;
  if (!reportBelongsToSession(dataRecord, accountSession)) {
    return Response.json({ error: "You do not have access to this report." }, { status: 403 });
  }
  const normalizedProgress = normalizeProgressState(dataRecord);
  const captureDebug = asRecord(dataRecord.captureDebug);
  const rawReport = unwrapReportPayload(dataRecord.report);
  const rawReportRecord = asRecord(rawReport) ?? {};
  const reportIsFinalized =
    hasFinalizedReportPayload(rawReportRecord) || hasRenderableNormalizedReport(dataRecord);
  const progressFinished = isProgressFinished(dataRecord);
  const derivedStatus =
    asString(dataRecord.status) === "complete" ||
    (reportIsFinalized && progressFinished) ||
    Boolean(asString(dataRecord.completedAt)) ||
    asString(captureDebug?.phase) === "report_complete"
      ? "complete"
      : asString(dataRecord.status) ?? "processing";

  if (
    derivedStatus === "processing" &&
    normalizedProgress.currentStage &&
    AUTO_CONTINUE_STAGES.has(normalizedProgress.currentStage)
  ) {
    await maybeAutoContinueQueuedReport(req, id);
  }

  if (derivedStatus !== "complete") {
    return Response.json({
      id: snap.id,
      ...dataRecord,
      status: derivedStatus,
      progress: {
        ...(asRecord(dataRecord.progress) ?? {}),
        ...normalizedProgress,
      },
      report: rawReportRecord,
    });
  }

  const loaded = await loadStoredReport(id);
  if (!loaded) return Response.json({ error: "Not found" }, { status: 404 });
  const normalizedReport = loaded.report as Record<string, unknown>;

  return Response.json({
    id: loaded.id,
    ...loaded.data,
    ...normalizedReport,
    status: derivedStatus,
    progress: {
      ...(asRecord(dataRecord.progress) ?? {}),
      ...normalizedProgress,
    },
    report: normalizedReport,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const id = params.id;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  try {
    const accountSession = await getAccountSessionFromRequest(req);
    if (!accountSession) {
      return Response.json({ error: "Please sign in first." }, { status: 401 });
    }
    const raw = (await req.json()) as { report?: unknown } | null;
    const report = raw?.report;
    if (!report) {
      return Response.json({ error: "Missing report payload" }, { status: 400 });
    }

    const sanitizedReport = stripInlineAssets(report);
    const snap = await resolveReportSnapshot(id);
    if (!snap?.exists) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (!reportBelongsToSession((snap.data() ?? {}) as Record<string, unknown>, accountSession)) {
      return Response.json({ error: "You do not have access to edit this report." }, { status: 403 });
    }

    const ref = snap.ref;
    await ref.set(
      {
        report: sanitizedReport,
        editedAt: new Date().toISOString(),
        user_edited: true,
      },
      { merge: true },
    );

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save report";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const id = params.id;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  try {
    const accountSession = await getAccountSessionFromRequest(_req);
    if (!accountSession) {
      return Response.json({ error: "Please sign in first." }, { status: 401 });
    }
    const snap = await resolveReportSnapshot(id);
    if (!snap?.exists) return Response.json({ error: "Not found" }, { status: 404 });
    if (!reportBelongsToSession((snap.data() ?? {}) as Record<string, unknown>, accountSession)) {
      return Response.json({ error: "You do not have access to delete this report." }, { status: 403 });
    }

    const data = snap.data() ?? {};
    const publicIds = Array.from(new Set(collectCloudinaryPublicIds(data)));
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (publicIds.length && cloudName && apiKey && apiSecret) {
      await Promise.allSettled(
        publicIds.map((publicId) => destroyCloudinaryAsset(publicId, cloudName, apiKey, apiSecret)),
      );
    }

    await snap.ref.delete();
    return Response.json({ ok: true, deletedAssets: publicIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete report";
    return Response.json({ error: message }, { status: 500 });
  }
}
