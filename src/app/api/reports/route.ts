import { getAdminFirestore } from "@/lib/firebase-admin";
import { asRecord, mergeReportWithDoc, unwrapReportPayload } from "@/lib/report-record";

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value);
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function GET() {
  try {
    const db = getAdminFirestore();
    const snap = await db.collection("ux_audits").orderBy("createdAt", "desc").limit(50).get();

    const reports = await Promise.all(snap.docs.map(async (doc) => {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      const parsedReport = unwrapReportPayload(data.report);
      const merged = asRecord(
        await mergeReportWithDoc(data, asRecord(parsedReport) ?? parsedReport ?? data.report, doc.id),
      ) ?? {};
      const intake = asRecord(merged.intake) ?? {};

      return {
        id: doc.id,
        reportId: safeString(merged.reportId || doc.id),
        createdAt: safeString(data.createdAt),
        status: safeString(data.status) || "queued",
        productName: safeString(merged.product_name || intake.product_name) || "Untitled product",
        productUrl: safeString(merged.product_url || intake.product_url),
        productType: safeString(merged.product_type || intake.product_type),
        primaryPlatform: safeString(merged.primary_platform || intake.primary_platform),
        overallScore: safeNumber(merged.overall_score),
        overallHealth: safeString(merged.overall_health),
        overallRisk: safeString(merged.overall_risk),
      };
    }));

    return Response.json({ reports });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load reports";
    return Response.json({ error: message }, { status: 500 });
  }
}
