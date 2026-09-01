import { getAdminFirestore } from "@/lib/firebase-admin";
import { getAccountSessionFromRequest } from "@/lib/account-server";
import { asRecord, mergeReportWithDoc, unwrapReportPayload } from "@/lib/report-record";
import { buildReportViewModel } from "@/lib/report-model";

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

async function buildReportsList(docs: CleanupReportDoc[]) {
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

  await Promise.all(
    docs.map(async (doc) => {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      const parsedReport = unwrapReportPayload(data.report);
      const merged =
        (await mergeReportWithDoc(data, asRecord(parsedReport) ?? parsedReport ?? data.report, doc.id)) ?? {};

      if (shouldDeleteReport(data, merged)) {
        await doc.ref.delete().catch(() => undefined);
        return;
      }

      if (!shouldIncludeReport(data, merged)) return;

      const intake = asRecord(merged.intake) ?? {};
      const listViewReport = {
        ...merged,
        selected_buckets: [],
        selectedBuckets: [],
        intake: {
          ...intake,
          selected_buckets: [],
          selectedBuckets: [],
        },
        overall_score: null,
      };
      const vm = buildReportViewModel(listViewReport);
      reports.push({
        id: doc.id,
        reportId: safeString(merged.reportId || doc.id),
        createdAt: safeString(data.createdAt),
        status: normalizeStatus(merged.status || data.status) || "complete",
        productName: safeString(merged.product_name || intake.product_name) || "Untitled product",
        productUrl: safeString(merged.product_url || intake.product_url),
        productType: safeString(merged.product_type || intake.product_type),
        primaryPlatform: safeString(merged.primary_platform || intake.primary_platform),
        overallScore: vm.overallScore ?? safeNumber(merged.overall_score),
        overallHealth: vm.overallHealth || safeString(merged.overall_health),
        overallRisk: vm.overallRisk || safeString(merged.overall_risk),
      });
    }),
  );

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
      const reports = await buildReportsList(snap.docs as unknown as CleanupReportDoc[]);

      return Response.json({ reports });
    }
    const queries = [
      db.collection("ux_audits").where("created_by", "==", accountSession.id),
      db.collection("ux_audits").where("user_email", "==", accountSession.email),
    ];

    const snaps = await Promise.all(queries.map((query) => query.limit(50).get()));
    const docsById = new Map<string, (typeof snaps)[number]["docs"][number]>();
    for (const snap of snaps) {
      for (const doc of snap.docs) {
        if (!docsById.has(doc.id)) {
          docsById.set(doc.id, doc);
        }
      }
    }

    const snapDocs = Array.from(docsById.values()).sort((left, right) => {
      const leftCreated = String((left.data() ?? {}).createdAt ?? "");
      const rightCreated = String((right.data() ?? {}).createdAt ?? "");
      return rightCreated.localeCompare(leftCreated);
    });
    const reports = await buildReportsList(snapDocs as unknown as CleanupReportDoc[]);

    return Response.json({ reports });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load reports";
    return Response.json({ error: message }, { status: 500 });
  }
}
