import { FieldValue } from "firebase-admin/firestore";
import { getAccountSessionFromRequest } from "@/lib/account-server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { mergeExtensionCaptureJson } from "@/lib/extension-capture";
import { loadStoredIntake, storeFullIntakeBlob } from "@/lib/intake-storage.server";
import { loadStoredReport, reportBelongsToSession, unwrapReportPayload } from "@/lib/report-record";

export const runtime = "nodejs";

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAccountSessionFromRequest(req);
  if (!session) return Response.json({ error: "Please sign in first." }, { status: 401 });
  const { id } = await params;
  const db = getAdminFirestore();
  const ref = db.collection("ux_audits").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Report not found." }, { status: 404 });
  const data = record(snap.data());
  if (!reportBelongsToSession(data, session)) {
    return Response.json({ error: "You do not have access to this report." }, { status: 403 });
  }
  if (data.status !== "awaiting_recapture") {
    return Response.json({ error: "This audit is not waiting for extension evidence." }, { status: 409 });
  }

  const body = record(await req.json());
  const captures = Array.isArray(body.captures) ? body.captures : [];
  const screenshots = Array.isArray(body.screenshots) ? body.screenshots : [];
  if (!captures.length && !screenshots.length) {
    return Response.json({ error: "No follow-up evidence was received." }, { status: 400 });
  }

  const intake = record(await loadStoredIntake(data));
  const artifacts = record(intake.artifacts);
  const existingScreenshots = Array.isArray(artifacts.screenshots) ? artifacts.screenshots : [];
  const nextIntake = {
    ...intake,
    artifacts: {
      ...artifacts,
      extensionCaptureJson: mergeExtensionCaptureJson(
        typeof artifacts.extensionCaptureJson === "string" ? artifacts.extensionCaptureJson : "",
        captures,
      ),
      screenshots: [...existingScreenshots, ...screenshots],
    },
  };
  const stored = await storeFullIntakeBlob(id, nextIntake);
  if (!stored.ok) {
    return Response.json({ error: "Could not store the follow-up evidence." }, { status: 500 });
  }

  const loadedReport = await loadStoredReport(id);
  const previousReport = record(loadedReport?.report ?? unwrapReportPayload(data.report));
  const previousBucketResults = Array.isArray(previousReport.bucket_results)
    ? previousReport.bucket_results
    : Array.isArray(data.bucketResults)
      ? data.bucketResults
      : [];

  await ref.set({
    intake_blob: stored.blob,
    status: "processing",
    error: null,
    lastError: null,
    failedAt: null,
    processingLeaseUntil: 0,
    recaptureRound: Number(data.recaptureRound || 0) + 1,
    recaptureSubmittedAt: new Date().toISOString(),
    evidence: FieldValue.delete(),
    evidence_blob: FieldValue.delete(),
    bucketResults: previousBucketResults,
    report: FieldValue.delete(),
    progress: {
      bucketIndex: 0,
      totalBuckets: previousBucketResults.length,
      retryCount: 0,
      attemptCount: 0,
      completedBuckets: 0,
      currentStage: "preparing_recaptured_evidence",
    },
  }, { merge: true });

  return Response.json({ status: "processing", received: captures.length, screenshots: screenshots.length });
}
