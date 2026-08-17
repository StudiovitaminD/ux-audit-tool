import { getAdminFirestore } from "@/lib/firebase-admin";
import { readStoredIntake } from "@/lib/intake-storage";
import { loadStoredIntake } from "@/lib/intake-storage.server";
import {
  IntakeSchema,
  auditOneBucket,
  finalizeAudit,
  getSelectedBuckets,
  makeFailedBucketResult,
  prepareEvidence,
  type BucketResult,
  type Intake,
} from "@/lib/audit-engine";
import type { EvidenceBundle } from "@/lib/evidence-collector";
import { getErrorMessage } from "@/lib/error-utils";
import { unwrapReportPayload } from "@/lib/report-record";
import { getAuditModelForTier, PAID_AUDIT_MODEL } from "@/lib/access-control";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_OPENROUTER_MODEL = PAID_AUDIT_MODEL;
const MAX_PROCESS_RETRIES = 3;

function isTransientModelError(message: string) {
  const value = message.toLowerCase();
  return (
    message === "terminated" ||
    value.includes("rate-limit") ||
    value.includes("429") ||
    value.includes("timeout") ||
    value.includes("timed out") ||
    value.includes("empty response body") ||
    value.includes("unexpected end of json input") ||
    value.includes("fetch failed") ||
    value.includes("socket") ||
    value.includes("econnreset") ||
    value.includes("etimedout") ||
    value.includes("abort")
  );
}

function shouldConvertBucketFailureToPlaceholder(message: string) {
  const value = message.toLowerCase();
  return (
    value.includes("parse failed") ||
    value.includes("json") ||
    value.includes("schema") ||
    value.includes("structured output") ||
    value.includes("no endpoints found") ||
    value.includes("not a valid model id") ||
    value.includes("provider returned error") ||
    value.includes("prompt tokens limit exceeded") ||
    value.includes("context length") ||
    value.includes("maximum context") ||
    value.includes("cannot read properties of undefined (reading 'observation')") ||
    value.includes("cannot read properties of null (reading 'observation')") ||
    value.includes("reading 'observation'")
  );
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") return null;
  return v as Record<string, unknown>;
}

function isCancelledDoc(doc: Record<string, unknown>) {
  const status = typeof doc.status === "string" ? doc.status : "";
  return (
    status === "cancelled" ||
    Boolean(doc.cancelledAt) ||
    (typeof doc.progress === "object" &&
      doc.progress !== null &&
      !Array.isArray(doc.progress) &&
      (doc.progress as Record<string, unknown>).currentStage === "cancelled")
  );
}

function extractStoredBucketResults(doc: Record<string, unknown>): BucketResult[] {
  if (Array.isArray(doc.bucketResults)) {
    return doc.bucketResults as BucketResult[];
  }

  const parsedReport = unwrapReportPayload(doc.report);
  const reportRecord = asRecord(parsedReport);
  if (reportRecord && Array.isArray(reportRecord.bucket_results)) {
    return reportRecord.bucket_results as BucketResult[];
  }

  return [];
}

function normalizeStoredBucketResults(results: BucketResult[]): BucketResult[] {
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

function truncateStorageString(value: unknown, max = 240) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function compactEvidenceForStorage(evidence: EvidenceBundle | null) {
  if (!evidence) return null;
  const rec = evidence as Record<string, unknown>;
  const pages = Array.isArray(rec.pages)
    ? rec.pages.slice(0, 4).map((page) => {
        const pageRec = asRecord(page) ?? {};
        return {
          label: pageRec.label,
          url: pageRec.url,
          title: pageRec.title,
          textSnippet: truncateStorageString(pageRec.textSnippet, 400),
          h1: Array.isArray(pageRec.h1) ? pageRec.h1.slice(0, 4).map((item) => truncateStorageString(item, 80)) : [],
          topNavLinks: Array.isArray(pageRec.topNavLinks)
            ? pageRec.topNavLinks.slice(0, 4).map((item) => {
                const link = asRecord(item) ?? {};
                return {
                  text: truncateStorageString(link.text, 80),
                  href: truncateStorageString(link.href, 120),
                };
              })
            : [],
          primaryCtas: Array.isArray(pageRec.primaryCtas)
            ? pageRec.primaryCtas.slice(0, 3).map((item) => {
                const cta = asRecord(item) ?? {};
                return {
                  text: truncateStorageString(cta.text, 80),
                  href: truncateStorageString(cta.href, 120),
                };
              })
            : [],
          tableHeaders: Array.isArray(pageRec.tableHeaders)
            ? pageRec.tableHeaders.slice(0, 6).map((item) => truncateStorageString(item, 80))
            : [],
          formLabels: Array.isArray(pageRec.formLabels)
            ? pageRec.formLabels.slice(0, 6).map((item) => truncateStorageString(item, 80))
            : [],
        };
      })
    : [];

  const screenshots = Array.isArray(rec.screenshots)
    ? rec.screenshots.slice(0, 0)
    : [];
  const warnings = Array.isArray(rec.warnings)
    ? rec.warnings.slice(0, 20).map((item) => truncateStorageString(item, 240))
    : [];
  const coverage = asRecord(rec.coverage) ?? {};
  const evidenceSummary = asRecord(coverage.evidenceSummary) ?? {};
  const debug = asRecord(rec.debug) ?? {};

  return {
    pages,
    screenshots,
    warnings,
    coverage: {
      ...coverage,
      evidenceSummary,
    },
    auth: asRecord(rec.auth) ?? null,
    debug: {
      provider: debug.provider,
      actualProvider: debug.actualProvider,
      requestedProvider: debug.requestedProvider,
      guidedStepsCount: debug.guidedStepsCount,
      guidedStepsAttempted: debug.guidedStepsAttempted,
      guidedStepsCompleted: debug.guidedStepsCompleted,
      internalRoutesCount: debug.internalRoutesCount,
      internalRoutesAttempted: debug.internalRoutesAttempted,
      internalRoutesCompleted: debug.internalRoutesCompleted,
      uploadedScreenshotsCount: debug.uploadedScreenshotsCount,
      uploadedScreenshotsStored: debug.uploadedScreenshotsStored,
      selectedBuckets: Array.isArray(debug.selectedBuckets) ? debug.selectedBuckets.slice(0, 12) : [],
      guidedStepResults: Array.isArray(debug.guidedStepResults)
        ? debug.guidedStepResults.slice(0, 20).map((item) => {
            const step = asRecord(item) ?? {};
            return {
              stepName: truncateStorageString(step.stepName, 120),
              success: step.success,
              reason: truncateStorageString(step.reason, 200),
            };
          })
        : [],
      internalRouteResults: Array.isArray(debug.internalRouteResults)
        ? debug.internalRouteResults.slice(0, 20).map((item) => {
            const route = asRecord(item) ?? {};
            return {
              stepName: truncateStorageString(route.stepName, 120),
              success: route.success,
              reason: truncateStorageString(route.reason, 200),
            };
          })
        : [],
    },
  };
}

function compactBucketResultForStorage(bucket: BucketResult) {
  return {
    bucket_name: bucket.bucket_name,
    pillar: bucket.pillar,
    total_marks: bucket.total_marks,
    max_marks: bucket.max_marks,
    bucket_status: bucket.bucket_status,
    score: bucket.score,
    health: bucket.health,
    risk: bucket.risk,
    priority: bucket.priority,
    questions: Array.isArray(bucket.questions)
      ? bucket.questions.slice(0, 4).map((question) => {
          const q = asRecord(question) ?? {};
          return {
            id: q.id,
            question: truncateStorageString(q.question, 120),
            answer_status: q.answer_status,
            selected_option: q.selected_option,
            mark: q.mark,
            evidence: truncateStorageString(q.evidence, 180),
            observation: truncateStorageString(q.observation, 180),
          };
        })
      : [],
  };
}

function buildProgressState(args: {
  bucketIndex: number;
  totalBuckets: number;
  retryCount: number;
  attemptCount: number;
  currentBucketName?: string | null;
  currentStage?: string | null;
  currentBucketStartedAt?: string | null;
}) {
  return {
    bucketIndex: args.bucketIndex,
    totalBuckets: args.totalBuckets,
    retryCount: args.retryCount,
    attemptCount: args.attemptCount,
    completedBuckets: args.bucketIndex,
    currentBucketNumber:
      args.bucketIndex < args.totalBuckets ? args.bucketIndex + 1 : null,
    currentBucketName: args.currentBucketName || null,
    currentStage: args.currentStage || null,
    currentBucketStartedAt: args.currentBucketStartedAt || null,
  };
}

function capturePipelineDebug(intake: Intake) {
  return {
    selectedBuckets: getSelectedBuckets(intake),
    selectedBucketCount: getSelectedBuckets(intake).length,
    guidedCaptureStepsCount: Array.isArray(intake.guided_capture_steps)
      ? intake.guided_capture_steps.length
      : 0,
    internalRoutesCount: Array.isArray(intake.internal_routes)
      ? intake.internal_routes.length
      : 0,
    uploadedScreenshotsCount: Array.isArray(intake.artifacts?.screenshots)
      ? intake.artifacts.screenshots.length
      : 0,
    accessMode: intake.access_mode || "auto_login",
    browserbaseEnabledEnv: process.env.BROWSERBASE_ENABLED === "true",
    browserbaseApiKeyPresent: Boolean(process.env.BROWSERBASE_API_KEY),
    browserbaseProjectIdPresent: Boolean(process.env.BROWSERBASE_PROJECT_ID),
  };
}

function getEvidenceDebug(evidence: EvidenceBundle | null) {
  const debug =
    evidence && typeof evidence === "object" && evidence.debug && typeof evidence.debug === "object"
      ? (evidence.debug as Record<string, unknown>)
      : {};
  return debug;
}

function readNumberDebug(debug: Record<string, unknown>, key: string) {
  return typeof debug[key] === "number" ? (debug[key] as number) : 0;
}

function readStringDebug(debug: Record<string, unknown>, key: string) {
  return typeof debug[key] === "string" ? (debug[key] as string) : "";
}

function didExecuteCapturePipeline(evidence: EvidenceBundle | null) {
  const debug = getEvidenceDebug(evidence);
  const pagesCount = Array.isArray(evidence?.pages) ? evidence!.pages.length : 0;
  const screenshotsCount = Array.isArray(evidence?.screenshots) ? evidence!.screenshots.length : 0;
  const evidenceItemsCount =
    typeof debug.evidenceItemsCount === "number"
      ? debug.evidenceItemsCount
      : pagesCount + screenshotsCount;
  const guidedStepsAttempted =
    typeof debug.guidedStepsAttempted === "number" ? debug.guidedStepsAttempted : 0;
  const internalRoutesAttempted =
    typeof debug.internalRoutesAttempted === "number" ? debug.internalRoutesAttempted : 0;
  const uploadedScreenshotsConvertedToEvidence =
    typeof debug.uploadedScreenshotsConvertedToEvidence === "number"
      ? debug.uploadedScreenshotsConvertedToEvidence
      : 0;
  const loginAttempted = debug.loginAttempted === true;
  const browserProviderUsed =
    typeof debug.actualBrowserProvider === "string" && debug.actualBrowserProvider !== "none";

  return (
    browserProviderUsed ||
    loginAttempted ||
    guidedStepsAttempted > 0 ||
    internalRoutesAttempted > 0 ||
    uploadedScreenshotsConvertedToEvidence > 0 ||
    evidenceItemsCount > 0
  );
}

function hasEnoughExtensionEvidence(intake: Intake, evidence: EvidenceBundle | null) {
  if (intake.access_mode !== "browser_extension_capture") return true;
  if (intake.product_type === "marketing_website" || intake.product_type === "ecommerce") {
    return true;
  }

  const evidenceCount = (Array.isArray(evidence?.pages) ? evidence.pages.length : 0) +
    (Array.isArray(evidence?.screenshots) ? evidence.screenshots.length : 0);
  const uploadedScreenshotCount = Array.isArray(intake.artifacts?.screenshots)
    ? intake.artifacts.screenshots.length
    : 0;
  const hasVideo = Boolean(intake.artifacts?.criticalFlowVideo?.url);
  const extensionCaptureJson = typeof intake.artifacts?.extensionCaptureJson === "string"
    ? intake.artifacts.extensionCaptureJson.trim()
    : "";
  let parsedCaptures = 0;
  if (extensionCaptureJson) {
    try {
      const parsed = JSON.parse(extensionCaptureJson) as unknown;
      parsedCaptures = Array.isArray(parsed) ? parsed.length : parsed ? 1 : 0;
    } catch {
      parsedCaptures = 0;
    }
  }

  return evidenceCount > 0 || uploadedScreenshotCount > 0 || hasVideo || parsedCaptures > 0;
}

function buildCapturePipelineFailureMessage(
  intake: Intake,
  evidence: EvidenceBundle | null,
) {
  const debug = getEvidenceDebug(evidence);
  const parts: string[] = [];
  const accessMode = intake.access_mode || "auto_login";
  const actualBrowserProvider = readStringDebug(debug, "actualBrowserProvider") || "none";
  const uploadedScreenshotsConvertedToEvidence = readNumberDebug(
    debug,
    "uploadedScreenshotsConvertedToEvidence",
  );
  const uploadedScreenshotsReceived = readNumberDebug(debug, "uploadedScreenshotsReceived");
  const extensionCapturesReceived = readNumberDebug(debug, "extensionCapturesReceived");
  const extensionCaptureEvidencePages = readNumberDebug(debug, "extensionCaptureEvidencePages");
  const guidedStepsReceived = readNumberDebug(debug, "guidedStepsReceived");
  const guidedStepsAttempted = readNumberDebug(debug, "guidedStepsAttempted");
  const internalRoutesReceived = readNumberDebug(debug, "internalRoutesReceived");
  const internalRoutesAttempted = readNumberDebug(debug, "internalRoutesAttempted");
  const browserFallbackAttempted = debug.browserFallbackAttempted === true;
  const browserFallbackEligible = debug.browserFallbackEligible === true;
  const internalRoutesMissingFallback = debug.internalRoutesMissingFallback === true;
  const accessModeResolved = readStringDebug(debug, "accessModeResolved");
  const guidedStepsSkippedReason = readStringDebug(debug, "guidedStepsSkippedReason");
  const pagesCount = Array.isArray(evidence?.pages) ? evidence.pages.length : 0;
  const screenshotsCount = Array.isArray(evidence?.screenshots) ? evidence.screenshots.length : 0;
  const isPublicAudit =
    intake.product_type === "marketing_website" || intake.product_type === "ecommerce";

  if (accessMode === "browser_extension_capture") {
    if (extensionCapturesReceived === 0 && uploadedScreenshotsReceived === 0) {
      parts.push("No extension captures or uploaded screenshots were provided.");
    } else {
      if (extensionCapturesReceived > 0 && extensionCaptureEvidencePages === 0) {
        parts.push("Extension JSON was received but did not convert into usable evidence pages.");
      }
      if (uploadedScreenshotsReceived > 0 && uploadedScreenshotsConvertedToEvidence === 0) {
        parts.push("Uploaded screenshots were received but none converted into usable audit evidence.");
      }
    }

    if (!browserFallbackAttempted) {
      if (browserFallbackEligible) {
        parts.push("Browser fallback was eligible but did not run.");
      } else {
        parts.push(
          "Browser fallback was not eligible for this run because no login session, guided steps, internal routes, or public-site fallback path was available.",
        );
      }
    }

    if (extensionCapturesReceived > 0 || uploadedScreenshotsReceived > 0) {
      parts.push(
        "Manual extension/upload evidence was present, but it did not satisfy the downstream scoring requirements for the selected audit.",
      );
    }
  }

  if (guidedStepsReceived > 0 && guidedStepsAttempted === 0) {
    parts.push(
      guidedStepsSkippedReason || "Guided steps were received but none were attempted by the capture pipeline.",
    );
  }

  if (internalRoutesReceived > 0 && internalRoutesAttempted === 0) {
    parts.push("Internal routes were provided but none were attempted by the capture pipeline.");
  }

  if (internalRoutesMissingFallback) {
    parts.push(
      "Internal-routes-only mode was selected without any internal routes, so the audit fell back to public-page fetch instead of browser session capture.",
    );
  }

  if (actualBrowserProvider === "none" && pagesCount === 0 && screenshotsCount === 0) {
    parts.push(
      isPublicAudit
        ? accessModeResolved === "public_fetch_fallback"
          ? "No public-page evidence was collected after internal-routes-only mode was downgraded to public-page fetch because no internal routes were provided."
          : "No public-page evidence was collected from fetch, extension capture, or uploaded screenshots."
        : "No browser session, fetched pages, or screenshots were converted into final evidence.",
    );
  }

  if (parts.length === 0) {
    parts.push("Evidence capture finished without producing any usable evidence items for scoring.");
  }

  return parts.join(" ");
}

export async function POST(req: Request) {
  const parsedBody = (await req.json().catch(() => ({}))) as unknown;
  const body = asRecord(parsedBody) ?? {};
  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  const debug = body.debug === true || body.debug === "true";
  const requestedModelTier = typeof body.modelTier === "string" ? body.modelTier : null;
  const requestedActiveModel = getAuditModelForTier(requestedModelTier);

  if (debug) {
    const requestedMaxTokens = Number(process.env.OPENROUTER_MAX_TOKENS || 2200);
    const effectiveMaxTokens = Number.isFinite(requestedMaxTokens)
      ? Math.max(600, Math.min(2600, requestedMaxTokens))
      : 2200;

    return Response.json({
      status: "debug",
      reportId,
      activeModel: requestedActiveModel,
      fallbackModel: null,
      openRouterTitle: "UX Audit Tool - Audit Scoring",
      rawEnvMaxTokens: process.env.OPENROUTER_MAX_TOKENS || null,
      effectiveMaxTokens,
      timestamp: new Date().toISOString(),
    });
  }

  if (!reportId) return Response.json({ error: "Missing reportId" }, { status: 400 });

  const db = getAdminFirestore();
  const ref = db.collection("ux_audits").doc(reportId);

  // Values populated as we load the job. Kept in outer scope for error handling.
  let intake: Intake | null = null;
  let buckets: string[] = [];
  let bucketIndex = 0;
  let retryCount = 0;
  let attemptCount = 0; // ADDED
  let evidenceBundle: EvidenceBundle | null = null;
  let existingResults: BucketResult[] = [];
  let currentPhase = "starting";

  const recordProcessError = async (phase: string, error: unknown) => {
    const message = getErrorMessage(error) || "Processing failed";
    const stack = error instanceof Error ? error.stack || "" : "";
    await ref.set(
      {
        status: "error",
        error: message,
        lastError: message,
        lastErrorAt: new Date().toISOString(),
        lastErrorPhase: phase,
        lastErrorStack: truncateStorageString(stack, 4000),
        failedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    console.error(`Audit processing failed during ${phase}:`, error);
  };

  try {
    currentPhase = "load_document";
    const snap = await ref.get();
    if (!snap.exists) return Response.json({ error: "Not found" }, { status: 404 });

    const doc = snap.data() ?? {};
    const status = typeof doc.status === "string" ? doc.status : "queued";
    if (status === "complete") return Response.json({ status: "complete" });
    if (status === "error")
      return Response.json({ status: "error", error: String(doc.error || "Failed") });
    if (isCancelledDoc(doc)) return Response.json({ status: "cancelled" });

    const intakeRaw = (await loadStoredIntake(doc)) ?? readStoredIntake(doc);
    intake = IntakeSchema.parse(intakeRaw);
    if (!intake) throw new Error("Missing intake");
    const intakeObj = intake;
    const modelTier = typeof doc.model_tier === "string" ? doc.model_tier : "free_limited";
    const activeModel = getAuditModelForTier(modelTier);
    buckets = getSelectedBuckets(intakeObj);
    const payloadDebug = capturePipelineDebug(intakeObj);
    const progressRec = asRecord(doc.progress) ?? {};
    bucketIndex = Number(progressRec.bucketIndex || 0);
    retryCount = Number(progressRec.retryCount || 0);
    attemptCount = Number(progressRec.attemptCount || 0); // ADDED

    // Ensure evidence exists (text-only; no screenshot data persisted)
    let evidence = doc.evidence as unknown;
    if (!evidence) {
      await ref.set(
        {
          status: "processing",
          captureDebug: {
            phase: "payload_received",
            ...payloadDebug,
          },
          startedAt: new Date().toISOString(),
          progress: buildProgressState({
            bucketIndex,
            totalBuckets: buckets.length,
            retryCount,
            attemptCount,
            currentBucketName: buckets[bucketIndex] || null,
            currentStage: "preparing_evidence",
            currentBucketStartedAt: new Date().toISOString(),
          }),
        },
        { merge: true },
      );
      evidence = await prepareEvidence(intakeObj);
      const latestAfterPrepare = await ref.get();
      if (isCancelledDoc(latestAfterPrepare.data() ?? {})) {
        return Response.json({ status: "cancelled" });
      }
      await ref.set(
        {
          evidence: compactEvidenceForStorage(
            evidence && typeof evidence === "object" ? (evidence as EvidenceBundle) : null,
          ),
          captureDebug: {
            phase: "evidence_prepared",
            ...payloadDebug,
            ...(getEvidenceDebug(
              evidence && typeof evidence === "object" ? (evidence as EvidenceBundle) : null,
            ) || {}),
          },
        },
        { merge: true },
      );
    }

    evidenceBundle =
      evidence && typeof evidence === "object" ? (evidence as EvidenceBundle) : null;
    const evidenceDebug = getEvidenceDebug(evidenceBundle);

    if (!didExecuteCapturePipeline(evidenceBundle)) {
      currentPhase = "capture_pipeline";
      const captureError = buildCapturePipelineFailureMessage(
        intakeObj,
        evidenceBundle,
      );
      const captureDebug = {
        phase: "capture_pipeline_not_executed",
        ...payloadDebug,
        ...evidenceDebug,
        status: "capture_pipeline_not_executed",
        message: captureError,
      };
      await ref.set(
        {
          status: "error",
          error: captureError,
          lastError: captureError,
          lastErrorAt: new Date().toISOString(),
          failedAt: new Date().toISOString(),
          captureStatus: "capture_pipeline_not_executed",
          captureDebug,
        },
        { merge: true },
      );
      return Response.json(
        {
          status: "capture_pipeline_not_executed",
          message: captureError,
          debug: captureDebug,
        },
        { status: 400 },
      );
    }

    if (!hasEnoughExtensionEvidence(intakeObj, evidenceBundle)) {
      currentPhase = "extension_evidence_validation";
      const captureError =
        "Extension capture mode requires at least one captured page, screenshot, or video evidence before scoring.";
      await ref.set(
        {
          status: "error",
          error: captureError,
          lastError: captureError,
          lastErrorAt: new Date().toISOString(),
          failedAt: new Date().toISOString(),
          captureDebug: {
            phase: "extension_evidence_missing",
            ...payloadDebug,
            modelTier: typeof doc.model_tier === "string" ? doc.model_tier : "free_limited",
            activeModel,
            ...evidenceDebug,
          },
        },
        { merge: true },
      );
      return Response.json({ status: "error", error: captureError }, { status: 400 });
    }

    const authRecord =
      evidenceBundle && typeof evidenceBundle === "object" && evidenceBundle.auth
        ? evidenceBundle.auth
        : null;
    if (
      intakeObj.login_required &&
      authRecord?.required &&
      authRecord.attempted &&
      !authRecord.success
    ) {
      const authError =
        authRecord.message?.trim() ||
        "Login failed. Please verify the username, password, and account access before running the audit.";
      await ref.set(
        {
          status: "error",
          error: authError,
          lastError: authError,
          lastErrorAt: new Date().toISOString(),
          failedAt: new Date().toISOString(),
          captureDebug: {
            phase: "login_failed",
            ...payloadDebug,
            modelTier: typeof doc.model_tier === "string" ? doc.model_tier : "free_limited",
            activeModel,
            ...evidenceDebug,
          },
        },
        { merge: true },
      );
      return Response.json({ status: "error", error: authError }, { status: 400 });
    }

    const coverageRecord =
      evidenceBundle && typeof evidenceBundle === "object" && evidenceBundle.coverage
        ? evidenceBundle.coverage
        : null;
    if (coverageRecord?.status === "failed_login") {
      const coverageError = coverageRecord.summary;
      await ref.set(
        {
          status: "error",
          error: coverageError,
          lastError: coverageError,
          lastErrorAt: new Date().toISOString(),
          failedAt: new Date().toISOString(),
          captureDebug: {
            phase: "coverage_failed",
            ...payloadDebug,
            modelTier: typeof doc.model_tier === "string" ? doc.model_tier : "free_limited",
            activeModel,
            ...evidenceDebug,
          },
        },
        { merge: true },
      );
      return Response.json({ status: "error", error: coverageError }, { status: 400 });
    }

    currentPhase = "load_existing_results";
    existingResults = normalizeStoredBucketResults(extractStoredBucketResults(doc));

    const finalizeStoredReport = async (finalBucketIndex: number, results: BucketResult[]) => {
      const safeResults = normalizeStoredBucketResults(results);
      currentPhase = "finalizing_progress";
      const latest = await ref.get();
      if (latest.exists && isCancelledDoc(latest.data() ?? {})) {
        return false;
      }

      await ref.set(
        {
          progress: buildProgressState({
            bucketIndex: finalBucketIndex,
            totalBuckets: buckets.length,
            retryCount: 0,
            attemptCount: 0,
            currentBucketName: null,
            currentStage: "finalizing",
            currentBucketStartedAt: null,
          }),
        },
        { merge: true },
      );

      const afterProgressUpdate = await ref.get();
      if (afterProgressUpdate.exists && isCancelledDoc(afterProgressUpdate.data() ?? {})) {
        return false;
      }

      let report;
      try {
        currentPhase = "finalize_audit";
        report = await finalizeAudit({
          intake: intakeObj,
          evidence: evidenceBundle,
          bucket_results: safeResults,
          modelOverride: activeModel,
        });
      } catch (error) {
        await recordProcessError("finalize_audit", error);
        return false;
      }

      currentPhase = "finalize_pre_write";
      const beforeFinalWrite = await ref.get();
      if (beforeFinalWrite.exists && isCancelledDoc(beforeFinalWrite.data() ?? {})) {
        return false;
      }

      try {
        currentPhase = "finalize_write";
        await ref.set(
          {
            status: "complete",
            completedAt:
              typeof doc.completedAt === "string" && doc.completedAt
                ? doc.completedAt
                : new Date().toISOString(),
            progress: buildProgressState({
              bucketIndex: finalBucketIndex,
              totalBuckets: buckets.length,
              retryCount: 0,
              attemptCount: 0,
              currentBucketName: null,
              currentStage: "report_complete",
              currentBucketStartedAt: null,
            }),
            report,
            bucketResults: safeResults.map(compactBucketResultForStorage),
            evidence: compactEvidenceForStorage(evidenceBundle),
            overall_score: report.overall_score ?? null,
            overall_health: report.overall_health ?? null,
            overall_risk: report.overall_risk ?? null,
            audit_mode: report.audit_mode ?? null,
            coverage_status: report.coverage_status ?? null,
            ux_score_eligible: report.ux_score_eligible ?? null,
            questions_scoreable: report.questions_scoreable ?? null,
            questions_total: report.questions_total ?? null,
            scorecard: Array.isArray(report.scorecard) ? report.scorecard : [],
            captureDebug: {
              phase: "report_complete",
              ...payloadDebug,
              modelTier: typeof doc.model_tier === "string" ? doc.model_tier : "free_limited",
              activeModel,
            },
          },
          { merge: true },
        );
      } catch (error) {
        await recordProcessError("finalize_write", error);
        return false;
      }
      return true;
    };

    const scoreBucketWithRecovery = async (index: number) => {
      const bucket = buckets[index]!;
      let localRetryCount = 0;
      let localAttemptCount = 0;

      while (localAttemptCount <= MAX_PROCESS_RETRIES) {
        const startedAt = new Date().toISOString();
        await ref.set(
          {
            status: "processing",
            progress: buildProgressState({
              bucketIndex: index,
              totalBuckets: buckets.length,
              retryCount: localRetryCount,
              attemptCount: localAttemptCount,
              currentBucketName: bucket,
              currentStage:
                localAttemptCount > 0 ? "retrying_primary_model" : "scoring",
              currentBucketStartedAt: startedAt,
            }),
          },
          { merge: true },
        );

        try {
          return await auditOneBucket({
            intake: intakeObj,
            bucket,
            evidence: evidenceBundle,
            modelOverride: activeModel,
          });
        } catch (error) {
          const message = getErrorMessage(error) || "Processing failed";
          if (!isTransientModelError(message)) {
            if (shouldConvertBucketFailureToPlaceholder(message)) {
              return makeFailedBucketResult({
                intake: intakeObj,
                bucket,
                reason: message,
              });
            }
            throw error;
          }

          localRetryCount += 1;
          localAttemptCount += 1;
          if (localAttemptCount <= MAX_PROCESS_RETRIES) {
            await ref.set(
              {
                lastError: `Transient model failure on bucket ${index + 1}/${buckets.length}: ${message}. Retrying automatically (${localAttemptCount}/${MAX_PROCESS_RETRIES}).`,
                lastErrorAt: new Date().toISOString(),
              },
              { merge: true },
            );
            continue;
          }

          return makeFailedBucketResult({
            intake: intakeObj,
            bucket,
            reason: `The configured audit model failed repeatedly with "${message}". No fallback model is configured for audit scoring.`,
          });
        }
      }

      return makeFailedBucketResult({
        intake: intakeObj,
        bucket,
        reason: "Bucket scoring exited unexpectedly before producing a result.",
      });
    };

    if (bucketIndex >= buckets.length) {
      const finalized = await finalizeStoredReport(bucketIndex, existingResults);
      return Response.json({ status: finalized ? "complete" : "cancelled" });
    }

    while (bucketIndex < buckets.length) {
      const latestBeforeBucket = await ref.get();
      if (isCancelledDoc(latestBeforeBucket.data() ?? {})) {
        return Response.json({ status: "cancelled" });
      }

      const bucketResult = await scoreBucketWithRecovery(bucketIndex);
      const latestAfterBucket = await ref.get();
      if (isCancelledDoc(latestAfterBucket.data() ?? {})) {
        return Response.json({ status: "cancelled" });
      }

      existingResults = [...existingResults, bucketResult];
      bucketIndex += 1;

      await ref.set(
        {
          status: "processing",
          progress: buildProgressState({
            bucketIndex,
            totalBuckets: buckets.length,
            retryCount: 0,
            attemptCount: 0,
            currentBucketName: buckets[bucketIndex] || null,
            currentStage: bucketIndex >= buckets.length ? "finalizing" : "queued_next_bucket",
            currentBucketStartedAt: null,
          }),
          bucketResults: existingResults.map(compactBucketResultForStorage),
        },
        { merge: true },
      );
    }

    const finalized = await finalizeStoredReport(bucketIndex, existingResults);
    return Response.json({ status: finalized ? "complete" : "cancelled" });
  } catch (err) {
    console.error(`Audit processing failed during ${currentPhase}:`, err);
    const message = getErrorMessage(err) || "Processing failed";
    const now = new Date().toISOString();
    if (!intake) {
      await ref.set(
        { status: "error", error: message || "Missing intake", failedAt: now },
        { merge: true },
      );
      return Response.json({ status: "error", error: message }, { status: 500 });
    }

    await ref.set(
      {
        status: "error",
        error: message,
        lastError: message,
        lastErrorAt: now,
        lastErrorPhase: currentPhase,
        lastErrorStack: err instanceof Error ? truncateStorageString(err.stack || "", 4000) : null,
        failedAt: now,
      },
      { merge: true },
    );
    return Response.json({ status: "error", error: message }, { status: 500 });
  }
}
