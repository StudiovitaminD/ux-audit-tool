import { getAdminFirestore } from "@/lib/firebase-admin";
import { getAccountSessionFromRequest } from "@/lib/account-server";
import { asRecord, mergeReportWithDoc, unwrapReportPayload } from "@/lib/report-record";

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value);
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

    const reports = await Promise.all(snapDocs.map(async (doc) => {
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
