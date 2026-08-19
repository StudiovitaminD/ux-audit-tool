import { getAdminFirestore } from "@/lib/firebase-admin";
import { loadStoredIntake } from "@/lib/intake-storage.server";

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function reportBelongsToSession(
  data: Record<string, unknown>,
  session: { id: string; email: string; role?: string },
) {
  if (session.role === "admin") return true;
  const ownerFields = [
    data.created_by,
    data.createdBy,
    data.user_id,
    data.userId,
    data.owner_id,
    data.ownerId,
  ];
  const emailFields = [data.user_email, data.userEmail, data.email, data.owner_email, data.ownerEmail];
  const normalizedSessionId = session.id.trim();
  const normalizedSessionEmail = session.email.trim().toLowerCase();

  if (
    ownerFields.some((value) => typeof value === "string" && value.trim() === normalizedSessionId)
  ) {
    return true;
  }

  return emailFields.some(
    (value) => typeof value === "string" && value.trim().toLowerCase() === normalizedSessionEmail,
  );
}

export function tryParseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const looksLikeJson =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));
  if (!looksLikeJson) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function looksLikeReportRecord(value: Record<string, unknown>) {
  return (
    "overall_score" in value ||
    "product_name" in value ||
    "intake" in value ||
    "bucket_results" in value ||
    "scorecard" in value ||
    "executive_summary" in value ||
    "section_narrative" in value
  );
}

export function unwrapReportPayload(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  const parsed = tryParseJsonString(value);
  const rec = asRecord(parsed);
  if (!rec) return parsed;
  if (looksLikeReportRecord(rec)) return rec;
  if ("report" in rec) return unwrapReportPayload(rec.report, depth + 1);
  if ("value" in rec) return unwrapReportPayload(rec.value, depth + 1);
  return rec;
}

function safeString(value: unknown) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

function hasMeaningfulValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function preferReportOrDoc(reportValue: unknown, docValue: unknown) {
  return hasMeaningfulValue(reportValue) ? reportValue : docValue;
}

function preferMostCompleteArray(reportValue: unknown, docValue: unknown) {
  const reportArray = Array.isArray(reportValue) ? reportValue : null;
  const docArray = Array.isArray(docValue) ? docValue : null;
  if (!reportArray?.length) return docArray ?? reportValue ?? docValue;
  if (!docArray?.length) return reportArray;

  const reportQuestionCount = reportArray.reduce((sum, item) => {
    const rec = asRecord(item);
    return sum + (Array.isArray(rec?.questions) ? rec!.questions.length : 0);
  }, 0);
  const docQuestionCount = docArray.reduce((sum, item) => {
    const rec = asRecord(item);
    return sum + (Array.isArray(rec?.questions) ? rec!.questions.length : 0);
  }, 0);

  if (docArray.length > reportArray.length) return docArray;
  if (docQuestionCount > reportQuestionCount) return docArray;
  return reportArray;
}

function preferReportArray(reportValue: unknown, docValue: unknown) {
  const reportArray = Array.isArray(reportValue) ? reportValue : null;
  const docArray = Array.isArray(docValue) ? docValue : null;
  if (reportArray?.length) return reportArray;
  return docArray ?? reportValue ?? docValue;
}

export async function mergeReportWithDoc(
  data: Record<string, unknown>,
  reportValue: unknown,
  requestedId: string,
) {
  const report = asRecord(reportValue) ?? {};
  const [docIntake, reportIntake] = await Promise.all([
    loadStoredIntake(data),
    loadStoredIntake(report),
  ]);
  const intake = { ...(docIntake ?? {}), ...(reportIntake ?? {}) };

  return {
    ...report,
    evidence: preferReportOrDoc(report.evidence, data.evidence),
    captureDebug: preferReportOrDoc(report.captureDebug, data.captureDebug),
    audit_mode: preferReportOrDoc(report.audit_mode, data.audit_mode),
    coverage_status: preferReportOrDoc(report.coverage_status, data.coverage_status),
    ux_score_eligible: preferReportOrDoc(report.ux_score_eligible, data.ux_score_eligible),
    questions_scoreable: preferReportOrDoc(report.questions_scoreable, data.questions_scoreable),
    questions_total: preferReportOrDoc(report.questions_total, data.questions_total),
    bucket_results: preferReportArray(report.bucket_results, data.bucketResults),
    scorecard: preferReportArray(report.scorecard, data.scorecard),
    findings_detailed: preferReportArray(report.findings_detailed, data.findings_detailed),
    quick_wins_table: preferReportArray(report.quick_wins_table, data.quick_wins_table),
    roadmap: preferReportOrDoc(report.roadmap, data.roadmap),
    closing_note: preferReportOrDoc(report.closing_note, data.closing_note),
    competitor_analysis: preferReportOrDoc(report.competitor_analysis, data.competitor_analysis),
    narrative: preferReportOrDoc(report.narrative, data.narrative),
    overall_score: preferReportOrDoc(report.overall_score, data.overall_score),
    overall_health: preferReportOrDoc(report.overall_health, data.overall_health),
    overall_risk: preferReportOrDoc(report.overall_risk, data.overall_risk),
    status: preferReportOrDoc(report.status, data.status),
    progress: preferReportOrDoc(report.progress, data.progress),
    reportId:
      safeString(report.reportId || data.reportId || requestedId) ||
      safeString(data.rid) ||
      safeString(data.report_id),
    report_id:
      safeString(report.report_id || data.report_id || requestedId) ||
      safeString(data.reportId) ||
      safeString(data.rid),
    rid:
      safeString(report.rid || data.rid || requestedId) ||
      safeString(data.reportId) ||
      safeString(data.report_id),
    intake,
    product_name: safeString(report.product_name || intake.product_name),
    product_url: safeString(report.product_url || intake.product_url),
    product_type: safeString(report.product_type || intake.product_type),
    primary_platform: safeString(report.primary_platform || intake.primary_platform),
    known_problem: safeString(report.known_problem || intake.known_problem),
    competitors: safeString(report.competitors || intake.competitors),
    differentiation: safeString(report.differentiation || intake.differentiation),
    success_metric: safeString(report.success_metric || intake.success_metric),
    who_implements: safeString(report.who_implements || intake.who_implements),
  };
}

const reportLookupFields = [
  "reportId",
  "rid",
  "report_id",
  "report.reportId",
  "report.rid",
  "report.report_id",
] as const;

export async function resolveReportSnapshot(id: string) {
  const db = getAdminFirestore();
  const snap = await db.collection("ux_audits").doc(id).get();
  if (snap.exists) return snap;

  for (const field of reportLookupFields) {
    const querySnap = await db.collection("ux_audits").where(field, "==", id).limit(1).get();
    if (!querySnap.empty) {
      return querySnap.docs[0];
    }
  }

  return null;
}

export async function loadStoredReport(id: string) {
  const snap = await resolveReportSnapshot(id);
  if (!snap?.exists) return null;

  const data = snap.data() ?? {};
  const parsedReport = unwrapReportPayload((data as Record<string, unknown>).report);
  return {
    id: snap.id,
    data,
    report: await mergeReportWithDoc(
      data as Record<string, unknown>,
      asRecord(parsedReport) ?? parsedReport ?? (data as Record<string, unknown>).report,
      snap.id,
    ),
  };
}
