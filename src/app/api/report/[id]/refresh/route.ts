import { getAdminFirestore } from "@/lib/firebase-admin";
import { getAccountSessionFromRequest } from "@/lib/account-server";
import {
  reportBelongsToSession,
  resolveReportSnapshot,
  unwrapReportPayload,
} from "@/lib/report-record";
import { finalizeAudit, type BucketResult, type Intake } from "@/lib/audit-engine";
import type { EvidenceBundle } from "@/lib/evidence-collector";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
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

export async function POST(
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

    const snap = await resolveReportSnapshot(id);
    if (!snap?.exists) return Response.json({ error: "Not found" }, { status: 404 });

    const storedData = (snap.data() ?? {}) as Record<string, unknown>;
    if (!reportBelongsToSession(storedData, accountSession)) {
      return Response.json({ error: "You do not have access to edit this report." }, { status: 403 });
    }

    const raw = (await req.json().catch(() => null)) as { report?: unknown } | null;
    const requestReport = asRecord(raw?.report);
    const storedReport = asRecord(unwrapReportPayload(storedData.report));
    const sourceReport = requestReport ?? storedReport;

    if (!sourceReport) {
      return Response.json({ error: "Missing report payload" }, { status: 400 });
    }

    const sanitizedReport = stripInlineAssets(sourceReport) as Record<string, unknown>;
    const intake = asRecord(sanitizedReport.intake);
    const evidence = asRecord(sanitizedReport.evidence);
    const bucketResults = Array.isArray(sanitizedReport.bucket_results)
      ? (sanitizedReport.bucket_results as BucketResult[])
      : null;

    if (!intake) {
      return Response.json({ error: "Missing intake context" }, { status: 400 });
    }
    if (!bucketResults || !bucketResults.length) {
      return Response.json({ error: "Missing bucket results" }, { status: 400 });
    }

    const refreshed = await finalizeAudit({
      intake: intake as Intake,
      evidence: (evidence as EvidenceBundle | null) ?? null,
      bucket_results: bucketResults,
      modelOverride: asString(sanitizedReport.modelOverride) || undefined,
    });

    const mergedReport = {
      ...sanitizedReport,
      ...refreshed,
    };

    const db = getAdminFirestore();
    const ref = db.collection("ux_audits").doc(id);
    const refreshedAt = new Date().toISOString();
    await ref.set(
      {
        report: mergedReport,
        editedAt: refreshedAt,
        report_refreshed_at: refreshedAt,
        user_edited: true,
      },
      { merge: true },
    );

    return Response.json({ ok: true, report: mergedReport });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to refresh report";
    return Response.json({ error: message }, { status: 500 });
  }
}
