import { getAdminFirestore } from "@/lib/firebase-admin";
import { getAccountSessionFromRequest } from "@/lib/account-server";
import { asRecord, unwrapReportPayload } from "@/lib/report-record";

const BAD_REPORT_STATUSES = new Set([
  "error",
  "cancelled",
  "incomplete",
  "failed",
  "aborted",
]);
const STALE_INCOMPLETE_REPORT_MS = 12 * 60 * 60 * 1000;

type CleanupReportDoc = {
  id: string;
  data: () => Record<string, unknown> | undefined;
  ref: { delete: () => Promise<unknown> };
};

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value);
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNumberLike(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseTimestampMs(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const rec = asRecord(value);
  if (!rec) return null;
  const seconds = asNumberLike(rec.seconds);
  if (seconds !== null) {
    const nanos = asNumberLike(rec.nanoseconds) ?? 0;
    return seconds * 1000 + Math.floor(nanos / 1_000_000);
  }
  const msFromMillis = asNumberLike(rec._seconds);
  if (msFromMillis !== null) {
    const nanos = asNumberLike(rec._nanoseconds) ?? 0;
    return msFromMillis * 1000 + Math.floor(nanos / 1_000_000);
  }
  return null;
}

function normalizeStatus(value: unknown) {
  return safeString(value).toLowerCase();
}

function hasFinalizedReportPayload(value: unknown) {
  const report = asRecord(value);
  if (!report) return false;

  const auditMode = safeString(report.audit_mode);
  const coverageStatus = safeString(report.coverage_status);
  const scoreEligible = typeof report.ux_score_eligible === "boolean" ? report.ux_score_eligible : null;
  const questionsTotal = asNumberLike(report.questions_total);
  const questionsScoreable = asNumberLike(report.questions_scoreable);
  const bucketResults = Array.isArray(report.bucket_results) ? report.bucket_results : null;
  const scorecard = Array.isArray(report.scorecard) ? report.scorecard : null;
  const hasOverallScore = asNumberLike(report.overall_score) !== null;

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

function shouldDeleteReport(data: Record<string, unknown>, merged: Record<string, unknown>) {
  const status = normalizeStatus(merged.status || data.status);
  if (BAD_REPORT_STATUSES.has(status)) return true;

  const finalized = hasFinalizedReportPayload(merged) || hasFinalizedReportPayload(unwrapReportPayload(data.report));
  if (status === "complete" || finalized) return false;

  const createdAtMs = parseTimestampMs(data.createdAt);
  if (createdAtMs === null) return false;

  if (status === "queued" || status === "processing" || !status) {
    return Date.now() - createdAtMs > STALE_INCOMPLETE_REPORT_MS;
  }

  return false;
}

function shouldIncludeReport(data: Record<string, unknown>, merged: Record<string, unknown>) {
  const status = normalizeStatus(merged.status || data.status);
  const finalized = hasFinalizedReportPayload(merged) || hasFinalizedReportPayload(unwrapReportPayload(data.report));
  return status === "complete" || finalized;
}

function buildReportsList(docs: CleanupReportDoc[]) {
  const reports: Array<{
    id: string;
    reportId: string;
    createdAt: string;
    status: string;
    productName: string;
    productUrl: string;
    productType: string;
    primaryPlatform: string;
    overallScore: number | null;
    overallHealth: string;
    overallRisk: string;
  }> = [];

  docs.forEach((doc) => {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      const parsedReport = unwrapReportPayload(data.report);
      const report = asRecord(parsedReport) ?? {};
      const intake = asRecord(report.intake) ?? asRecord(data.intake_preview) ?? asRecord(data.intake) ?? {};
      const merged: Record<string, unknown> = { ...data, ...report, intake };

      if (shouldDeleteReport(data, merged)) return;

      if (!shouldIncludeReport(data, merged)) return;

      reports.push({
        id: doc.id,
        reportId: safeString(merged.reportId || doc.id),
        createdAt: safeString(data.createdAt),
        status: normalizeStatus(merged.status || data.status) || "complete",
        productName: safeString(merged.product_name || intake.product_name) || "Untitled product",
        productUrl: safeString(merged.product_url || intake.product_url),
        productType: safeString(merged.product_type || intake.product_type),
        primaryPlatform: safeString(merged.primary_platform || intake.primary_platform),
        overallScore: safeNumber(merged.overall_score),
        overallHealth: safeString(merged.overall_health),
        overallRisk: safeString(merged.overall_risk),
      });
    });

  reports.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return reports;
}

export async function GET(req: Request) {
  try {
    const accountSession = await getAccountSessionFromRequest(req);
    if (!accountSession) {
      return Response.json({ error: "Please sign in first." }, { status: 401 });
    }
    const db = getAdminFirestore();
    if (accountSession.role === "admin") {
      const snap = await db.collection("ux_audits").orderBy("createdAt", "desc").limit(50).get();
      const reports = buildReportsList(snap.docs as unknown as CleanupReportDoc[]);

      return Response.json({ reports }, { headers: { "Cache-Control": "private, max-age=30" } });
    }
    const ownerSnap = await db.collection("ux_audits").where("created_by", "==", accountSession.id).limit(50).get();
    // Older audits may predate created_by. Only pay for the legacy lookup when needed.
    const docs = ownerSnap.empty
      ? (await db.collection("ux_audits").where("user_email", "==", accountSession.email).limit(50).get()).docs
      : ownerSnap.docs;
    const snapDocs = [...docs].sort((left, right) => {
      const leftCreated = String((left.data() ?? {}).createdAt ?? "");
      const rightCreated = String((right.data() ?? {}).createdAt ?? "");
      return rightCreated.localeCompare(leftCreated);
    });
    const reports = buildReportsList(snapDocs as unknown as CleanupReportDoc[]);

    return Response.json({ reports }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    const code = asRecord(error)?.code;
    const message = error instanceof Error ? error.message : "Failed to load reports";
    if (code === 8 || code === "8" || code === "resource-exhausted" || /resource_exhausted|quota exceeded/i.test(message)) {
      return Response.json(
        {
          code: "REPORTS_TEMPORARILY_UNAVAILABLE",
          error: "Reports are temporarily unavailable because the data service reached its usage limit. Please retry shortly.",
        },
        { status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" } },
      );
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
