import { getAdminFirestore } from "@/lib/firebase-admin";
import { getAccountSessionFromRequest } from "@/lib/account-server";
import {
  reportBelongsToSession,
  resolveReportSnapshot,
  loadStoredReport,
  unwrapReportPayload,
} from "@/lib/report-record";
import { finalizeAudit, type BucketResult, type Intake } from "@/lib/audit-engine";
import type { EvidenceBundle } from "@/lib/evidence-collector";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeStoredBucketResults(results: unknown[]): BucketResult[] {
  return results
    .map((bucket) => {
      const bucketRec = asRecord(bucket) ?? {};
      const normalizeQuestion = (item: unknown) => {
        const rec = asRecord(item);
        if (!rec) return null;
        return {
          ...rec,
          id: typeof rec.id === "string" ? rec.id : String(rec.id ?? ""),
          question: typeof rec.question === "string" ? rec.question : String(rec.question ?? ""),
          mark:
            typeof rec.mark === "number" || rec.mark === null || rec.mark === undefined
              ? rec.mark ?? null
              : Number(rec.mark) || null,
          selected_option:
            typeof rec.selected_option === "number" || rec.selected_option === null || rec.selected_option === undefined
              ? rec.selected_option ?? null
              : Number(rec.selected_option) || null,
          evidence: typeof rec.evidence === "string" ? rec.evidence : String(rec.evidence ?? ""),
          observation:
            typeof rec.observation === "string" ? rec.observation : String(rec.observation ?? ""),
          recommendation:
            typeof rec.recommendation === "string"
              ? rec.recommendation
              : String(rec.recommendation ?? ""),
          effort: typeof rec.effort === "string" ? rec.effort : String(rec.effort ?? ""),
          impact: typeof rec.impact === "string" ? rec.impact : String(rec.impact ?? ""),
          answer_status:
            rec.answer_status === "insufficient_evidence" ||
            rec.answer_status === "scoring_unavailable"
              ? rec.answer_status
              : "answered",
          missing_evidence: Array.isArray(rec.missing_evidence) ? rec.missing_evidence : [],
          confidence:
            typeof rec.confidence === "number" && Number.isFinite(rec.confidence) ? rec.confidence : 0,
        };
      };

      return {
        ...bucketRec,
        bucket_name:
          typeof bucketRec.bucket_name === "string"
            ? bucketRec.bucket_name
            : String(bucketRec.bucket_name ?? ""),
        pillar:
          typeof bucketRec.pillar === "string" ? bucketRec.pillar : String(bucketRec.pillar ?? "Impact"),
        total_marks:
          typeof bucketRec.total_marks === "number" || bucketRec.total_marks === null
            ? bucketRec.total_marks
            : null,
        max_marks:
          typeof bucketRec.max_marks === "number" || bucketRec.max_marks === null
            ? bucketRec.max_marks
            : null,
        score: typeof bucketRec.score === "number" || bucketRec.score === null ? bucketRec.score : null,
        bucket_status:
          typeof bucketRec.bucket_status === "string"
            ? bucketRec.bucket_status
            : "insufficient_evidence",
        health: typeof bucketRec.health === "string" ? bucketRec.health : "Not scored",
        risk: typeof bucketRec.risk === "string" ? bucketRec.risk : "Evidence missing",
        priority: typeof bucketRec.priority === "string" ? bucketRec.priority : "P0",
        questions: Array.isArray(bucketRec.questions)
          ? bucketRec.questions.map(normalizeQuestion).filter(Boolean)
          : [],
        findings: Array.isArray(bucketRec.findings)
          ? bucketRec.findings.map((item) => asRecord(item)).filter(Boolean)
          : [],
        improvements: Array.isArray(bucketRec.improvements)
          ? bucketRec.improvements.map((item) => asRecord(item)).filter(Boolean)
          : [],
      } as unknown as BucketResult;
    })
    .filter((bucket) => Boolean(bucket.bucket_name));
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
    const loadedStoredReport = storedReport ? null : await loadStoredReport(id);
    const sourceReport = requestReport ?? storedReport ?? loadedStoredReport?.report ?? null;

    if (!sourceReport) {
      return Response.json({ error: "Missing report payload" }, { status: 400 });
    }

    const sanitizedReport = stripInlineAssets(sourceReport) as Record<string, unknown>;
    const intake = asRecord(sanitizedReport.intake);
    const evidence = asRecord(sanitizedReport.evidence);
    const bucketResults = Array.isArray(sanitizedReport.bucket_results)
      ? normalizeStoredBucketResults(sanitizedReport.bucket_results)
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
