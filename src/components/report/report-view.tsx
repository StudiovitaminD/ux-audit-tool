"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  SESSION_CHANGE_EVENT,
  SESSION_STORAGE_KEY,
  fetchAppSession,
  readAppSession,
  type AppSession,
} from "@/lib/app-session";
import { readStoredIntake } from "@/lib/intake-storage";
import { getAppSessionRequestHeaders } from "@/lib/app-session";
import { loadLastReport } from "@/lib/report-store";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DemoReport } from "@/components/report/demo-report";
import { LiveReport } from "@/components/report/live-report";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
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

function tryParseJsonString(value: unknown): unknown {
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

function unwrapReportPayload(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  const parsed = tryParseJsonString(value);
  const rec = asRecord(parsed);
  if (!rec) return parsed;
  if ("overall_score" in rec || "product_name" in rec || "intake" in rec || "scorecard" in rec) {
    return rec;
  }
  if ("report" in rec) return unwrapReportPayload(rec.report, depth + 1);
  if ("value" in rec) return unwrapReportPayload(rec.value, depth + 1);
  return rec;
}

function hasFinalizedReportPayload(value: unknown) {
  const report = asRecord(unwrapReportPayload(value));
  if (!report) return false;

  const auditMode =
    typeof report.audit_mode === "string" && report.audit_mode.trim()
      ? report.audit_mode
      : null;
  const coverageStatus =
    typeof report.coverage_status === "string" && report.coverage_status.trim()
      ? report.coverage_status
      : null;
  const scoreEligible =
    typeof report.ux_score_eligible === "boolean" ? report.ux_score_eligible : null;
  const questionsTotal = asNumber(report.questions_total);
  const questionsScoreable = asNumber(report.questions_scoreable);

  return Boolean(
    auditMode &&
      coverageStatus &&
      scoreEligible !== null &&
      questionsTotal !== null &&
      questionsScoreable !== null &&
      (
        (Array.isArray(report.bucket_results) && report.bucket_results.length > 0) ||
        (Array.isArray(report.scorecard) && report.scorecard.length > 0) ||
        asNumber(report.overall_score) !== null
      ),
  );
}

function normalizedReportFromResponse(value: unknown, fallbackId: string | null) {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!rec) return null;

  const nested =
    rec.report && typeof rec.report === "object" ? (rec.report as Record<string, unknown>) : null;
  const candidate = nested && hasFinalizedReportPayload(nested) ? nested : rec;
  const unwrapped = unwrapReportPayload(candidate);
  const reportRec = asRecord(unwrapped);
  if (!reportRec) return null;
  return {
    ...reportRec,
    reportId:
      (typeof reportRec.reportId === "string" && reportRec.reportId) ||
      (typeof rec.reportId === "string" && rec.reportId) ||
      (typeof rec.id === "string" && rec.id) ||
      fallbackId ||
      "",
  };
}

function isProgressFinished(rec: Record<string, unknown>) {
  const bucketIndex = asNumber(readProgressValue(rec, "bucketIndex"));
  const totalBuckets = asNumber(readProgressValue(rec, "totalBuckets"));
  if (bucketIndex === null || totalBuckets === null) return false;
  return totalBuckets >= 0 && bucketIndex >= totalBuckets;
}

function reportNameFrom(report: unknown) {
  const rec = asRecord(report);
  const intake = rec ? readStoredIntake(rec) : null;
  const name =
    (typeof rec?.product_name === "string" && rec.product_name.trim()
      ? rec.product_name
      : null) ||
    intake?.product_name;
  return typeof name === "string" && name.trim() ? `${name.trim()} — UX Report` : "UX Report";
}

function toDisplayStage(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readProgressValue(
  rec: Record<string, unknown>,
  key:
    | "completedBuckets"
    | "currentBucketNumber"
    | "currentBucketName"
    | "currentStage"
    | "currentBucketStartedAt"
    | "bucketIndex"
    | "totalBuckets"
    | "retryCount"
    | "attemptCount"
    | "startedAt",
) {
  const progress = asRecord(rec.progress);
  if (progress && key in progress) return progress[key];
  return rec[key];
}

function asDisplayString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return "—";
}

function asDisplayBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function DebugRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-black/5 py-2 last:border-b-0 dark:border-white/5">
      <div className="text-[color:var(--ink-muted)]">{label}</div>
      <div className="text-right font-medium text-[color:var(--ink)]">{asDisplayString(value)}</div>
    </div>
  );
}

function DebugSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-white p-4">
      <div className="font-semibold">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function DebugList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <div>
      <div className="font-medium text-[color:var(--ink)]">{title}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] leading-5 text-[color:var(--ink-muted)]">
        {(items.length ? items : [emptyLabel]).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function CapturePipelineDebug({
  debug,
}: {
  debug: Record<string, unknown>;
}) {
  const browserReplayUrl =
    (typeof debug.browserbaseSessionReplayUrl === "string" && debug.browserbaseSessionReplayUrl) ||
    (typeof debug.sessionReplayUrl === "string" && debug.sessionReplayUrl) ||
    "";
  const uploadedErrors = Array.isArray(debug.uploadedScreenshotErrors)
    ? debug.uploadedScreenshotErrors
        .map((item) => (typeof item === "string" && item.trim() ? item : ""))
        .filter(Boolean)
    : [];
  const warnings = Array.isArray(debug.warnings)
    ? debug.warnings
        .map((item) => (typeof item === "string" && item.trim() ? item : ""))
        .filter(Boolean)
    : [];
  const phase = typeof debug.phase === "string" && debug.phase ? debug.phase : "unknown";
  const selectedBuckets = Array.isArray(debug.selectedBuckets)
    ? debug.selectedBuckets
        .map((item) => (typeof item === "string" && item.trim() ? item : ""))
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <div className="mt-5 space-y-4 rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-[color:var(--cream)]/35 p-4 text-xs">
      <div>
        <div className="font-semibold">Capture Pipeline Debug</div>
        <div className="mt-1 text-[11px] text-[color:var(--ink-muted)]">
          Phase: {toDisplayStage(phase) || phase}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DebugSection title="Payload">
          <DebugRow label="Selected buckets" value={selectedBuckets || debug.selectedBucketCount} />
          <DebugRow label="Access mode" value={debug.accessMode} />
          <DebugRow label="Guided steps received" value={debug.guidedStepsReceived ?? debug.guidedCaptureStepsCount} />
          <DebugRow label="Internal routes received" value={debug.internalRoutesReceived ?? debug.internalRoutesCount} />
          <DebugRow label="Uploaded screenshots received" value={debug.uploadedScreenshotsReceived ?? debug.uploadedScreenshotsCount} />
        </DebugSection>

        <DebugSection title="Browser Provider">
          <DebugRow label="Requested provider" value={debug.requestedBrowserProvider} />
          <DebugRow label="Actual provider" value={debug.actualBrowserProvider ?? debug.provider} />
          <DebugRow label="Browserbase enabled env" value={asDisplayBoolean(debug.browserbaseEnabledEnv)} />
          <DebugRow label="Browserbase API key present" value={asDisplayBoolean(debug.browserbaseApiKeyPresent)} />
          <DebugRow label="Browserbase project ID present" value={asDisplayBoolean(debug.browserbaseProjectIdPresent)} />
          <DebugRow label="Fallback reason" value={debug.browserProviderFallbackReason} />
        </DebugSection>

        <DebugSection title="Session & Login">
          <DebugRow label="Browserbase session created" value={asDisplayBoolean(debug.browserbaseSessionCreated)} />
          <DebugRow label="Session ID" value={debug.browserbaseSessionId ?? debug.browserSessionId} />
          <DebugRow label="Replay URL" value={browserReplayUrl} />
          <DebugRow label="Context loaded" value={asDisplayBoolean(debug.browserbaseContextLoaded)} />
          <DebugRow label="Context saved" value={asDisplayBoolean(debug.browserbaseContextSaved)} />
          <DebugRow label="Login attempted" value={asDisplayBoolean(debug.loginAttempted)} />
          <DebugRow label="Final URL" value={debug.finalUrl} />
        </DebugSection>

        <DebugSection title="Evidence Execution">
          <DebugRow label="Guided steps attempted" value={debug.guidedStepsAttempted} />
          <DebugRow label="Guided steps completed" value={debug.guidedStepsCompleted} />
          <DebugRow label="Guided steps skipped reason" value={debug.guidedStepsSkippedReason} />
          <DebugRow label="Internal routes attempted" value={debug.internalRoutesAttempted} />
          <DebugRow label="Internal routes completed" value={debug.internalRoutesCompleted} />
          <DebugRow label="Uploaded screenshots stored" value={debug.uploadedScreenshotsStored} />
          <DebugRow label="Uploads converted to evidence" value={debug.uploadedScreenshotsConvertedToEvidence} />
          <DebugRow label="Uploads used for questions" value={debug.uploadedScreenshotsUsedForQuestions} />
          <DebugRow label="Evidence items count" value={debug.evidenceItemsCount} />
        </DebugSection>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DebugSection title="Warnings">
          <DebugList title="Collector warnings" items={warnings} emptyLabel="No warnings captured." />
        </DebugSection>
        <DebugSection title="Upload Errors">
          <DebugList title="Uploaded screenshot errors" items={uploadedErrors} emptyLabel="No upload conversion errors captured." />
        </DebugSection>
      </div>

      <details className="rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-white p-4">
        <summary className="cursor-pointer font-medium">Raw debug JSON</summary>
        <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-[color:var(--ink-muted)]">
          {JSON.stringify(debug, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function ReportView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rid = searchParams.get("rid");
  const demo = searchParams.get("demo");
  const [accountSession, setAccountSession] = useState<AppSession>(() => readAppSession());
  const [accountReady, setAccountReady] = useState(false);
  const [remoteReport, setRemoteReport] = useState<{ reportId: string; report: unknown } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [debugDetails, setDebugDetails] = useState<Record<string, unknown> | null>(null);
  const [processDelayMs, setProcessDelayMs] = useState(1800);
  const [processKickCount, setProcessKickCount] = useState(0);
  const [lastProcessKickAt, setLastProcessKickAt] = useState<string | null>(null);
  const [lastProcessKickReason, setLastProcessKickReason] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingPptx, setDownloadingPptx] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [retryingReport, setRetryingReport] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [reportHistory, setReportHistory] = useState<
    Array<{
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
    }>
  >([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const report = useMemo(() => loadLastReport<unknown>(), []);
  const filteredReportHistory = useMemo(() => {
    const query = reportSearch.trim().toLowerCase();
    if (!query) return reportHistory;
    return reportHistory.filter((item) => item.productName.toLowerCase().includes(query));
  }, [reportHistory, reportSearch]);
  const processInFlightRef = useRef(false);
  const lastProcessKickMsRef = useRef(0);
  const sessionHeaders = useMemo(() => getAppSessionRequestHeaders(), []);
  const showAdminDashboardCta = accountReady && accountSession.role === "admin";

  useEffect(() => {
    const storageSnapshot = window.localStorage.getItem(SESSION_STORAGE_KEY);
    setAccountSession(readAppSession());
    void fetchAppSession({ expectedStorageValue: storageSnapshot })
      .then((next) => {
        if (window.localStorage.getItem(SESSION_STORAGE_KEY) === storageSnapshot) {
          setAccountSession(next);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        setAccountReady(true);
      });

    const syncSession = () => {
      setAccountSession(readAppSession());
      setAccountReady(true);
    };

    window.addEventListener("storage", syncSession);
    window.addEventListener(SESSION_CHANGE_EVENT, syncSession);
    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener(SESSION_CHANGE_EVENT, syncSession);
    };
  }, []);

  useEffect(() => {
    if (!accountReady || demo === "1") return;
    if (accountSession.email === "guest@local.test") {
      router.replace("/sign-in?returnTo=/report");
    }
  }, [accountReady, accountSession.email, demo, router]);

  useEffect(() => {
    if (!rid) return;
    setRemoteReport(null);
    setStatus(null);
    setJobError(null);
    setLastError(null);
    setDebugDetails(null);
    setDownloadError(null);
    setProcessKickCount(0);
    setLastProcessKickAt(null);
    setLastProcessKickReason(null);
    processInFlightRef.current = false;
    lastProcessKickMsRef.current = 0;
  }, [rid]);

  const kickProcess = useCallback(async (reason: string, minIntervalMs = 0) => {
    if (!rid) return;
    if (status === "complete" || status === "error" || status === "cancelled") return;

    const now = Date.now();
    if (processInFlightRef.current) return;
    if (minIntervalMs > 0 && now - lastProcessKickMsRef.current < minIntervalMs) return;

    processInFlightRef.current = true;
    lastProcessKickMsRef.current = now;
    setLastProcessKickAt(new Date(now).toISOString());
    setLastProcessKickReason(reason);
    setProcessKickCount((count) => count + 1);

    try {
      const res = await fetch("/api/audit/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders,
        },
        body: JSON.stringify({ reportId: rid }),
      });
      const responseBody = (await res.json().catch(() => null)) as
        | {
            error?: string;
            message?: string;
            status?: string;
          }
        | null;
      if (res.status === 202 || res.status === 429) {
        setProcessDelayMs(6000);
      } else if (!res.ok) {
        setProcessDelayMs(3500);
        const errorMessage =
          responseBody?.error ||
          responseBody?.message ||
          `Failed to continue report processing (${res.status})`;
        setLastError(errorMessage);
        if (
          responseBody?.status === "error" ||
          res.status >= 500 ||
          res.status === 400
        ) {
          setJobError(errorMessage);
          setStatus("error");
        }
      } else {
        setProcessDelayMs(1800);
        if (responseBody?.status === "complete") {
          setStatus("complete");
        }
      }
    } catch {
      setProcessDelayMs(3500);
    } finally {
      processInFlightRef.current = false;
    }
  }, [rid, status]);

  async function retryReportGeneration() {
    if (!reportId || retryingReport) return;

    setRetryingReport(true);
    setJobError(null);
    setLastError(null);

    try {
      const res = await fetch(`/api/report/${encodeURIComponent(reportId)}/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders,
        },
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || `Failed to retry report generation (${res.status})`);
      window.location.assign(`/report?rid=${encodeURIComponent(reportId)}`);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Failed to retry report generation");
    } finally {
      setRetryingReport(false);
    }
  }

  async function deleteReport(id: string) {
    if (!window.confirm("Delete this report? This cannot be undone.")) return;

    setDeleteError(null);
    setDeletingReportId(id);

    try {
      const res = await fetch(`/api/report/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: sessionHeaders,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error || `Failed to delete report (${res.status})`);
      }
      setReportHistory((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete report");
    } finally {
      setDeletingReportId(null);
    }
  }

  useEffect(() => {
    if (rid || demo || !accountReady || accountSession.email === "guest@local.test") return;
    let cancelled = false;
    setLoadingHistory(true);
    setHistoryError(null);

    fetch("/api/reports", { cache: "no-store", headers: sessionHeaders })
      .then(async (res) => {
        const data = (await res.json()) as
          | { reports?: typeof reportHistory; error?: string }
          | null;
        if (!res.ok) throw new Error(data?.error || `Failed to load reports (${res.status})`);
        if (!cancelled) setReportHistory(Array.isArray(data?.reports) ? data.reports : []);
      })
      .catch((error) => {
        if (!cancelled) {
          setHistoryError(error instanceof Error ? error.message : "Failed to load reports");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [rid, demo, accountReady, accountSession.email]);

  useEffect(() => {
    if (!rid) return;
    const id = rid;
    let cancelled = false;
    let timer: number | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/report/${encodeURIComponent(id)}`, {
          cache: "no-store",
          headers: sessionHeaders,
        });
        const data = (await res.json()) as unknown;
        if (!res.ok) {
          const errRec =
            data && typeof data === "object" ? (data as Record<string, unknown>) : null;
          if (cancelled) return;
          setStatus("error");
          setJobError(
            errRec && typeof errRec.error === "string"
              ? errRec.error
              : `Failed to load report (${res.status})`,
          );
          return;
        }
        if (cancelled) return;
        const rec =
          data && typeof data === "object" ? (data as Record<string, unknown>) : null;
        const captureDebug =
          rec && typeof rec.captureDebug === "object" && rec.captureDebug
            ? (rec.captureDebug as Record<string, unknown>)
            : null;
        const hasCompletedAt = rec && typeof rec.completedAt === "string" && Boolean(rec.completedAt);
        const capturePhase =
          captureDebug && typeof captureDebug.phase === "string" ? captureDebug.phase : null;
        const normalizedReport = normalizedReportFromResponse(rec, rid);
        const hasReportPayload = Boolean(normalizedReport && hasFinalizedReportPayload(normalizedReport));
        const progressFinished = Boolean(rec && isProgressFinished(rec));
        const nextStatus =
          rec && typeof rec.status === "string"
            ? rec.status === "complete" ||
              hasCompletedAt ||
              capturePhase === "report_complete" ||
              (hasReportPayload && progressFinished)
              ? "complete"
              : rec.status
            : null;
        const nextError = rec && typeof rec.error === "string" ? rec.error : null;
        const nextLastError =
          rec && typeof rec.lastError === "string" ? rec.lastError : null;
        const evidenceDebug =
          rec &&
          typeof rec.evidence === "object" &&
          rec.evidence &&
          typeof (rec.evidence as Record<string, unknown>).debug === "object" &&
          (rec.evidence as Record<string, unknown>).debug
            ? ((rec.evidence as Record<string, unknown>).debug as Record<string, unknown>)
            : null;
        setStatus(nextStatus);
        setJobError(nextError);
        setLastError(nextLastError);
        setDebugDetails(
          rec
            ? {
                ...(captureDebug || {}),
                ...(evidenceDebug || {}),
                completedBuckets:
                  readProgressValue(rec, "completedBuckets") ??
                  readProgressValue(rec, "bucketIndex") ??
                  null,
                currentBucketNumber: readProgressValue(rec, "currentBucketNumber") ?? null,
                currentBucketName:
                  (typeof readProgressValue(rec, "currentBucketName") === "string" &&
                  readProgressValue(rec, "currentBucketName"))
                    ? (readProgressValue(rec, "currentBucketName") as string)
                    : null,
                currentStage:
                  (typeof readProgressValue(rec, "currentStage") === "string" &&
                  readProgressValue(rec, "currentStage"))
                    ? (readProgressValue(rec, "currentStage") as string)
                    : null,
                currentBucketStartedAt:
                  typeof readProgressValue(rec, "currentBucketStartedAt") === "string"
                    ? (readProgressValue(rec, "currentBucketStartedAt") as string)
                    : null,
                reportId:
                  (typeof rec.reportId === "string" && rec.reportId) ||
                  (typeof rec.id === "string" && rec.id) ||
                  rid,
                status: nextStatus,
                bucketIndex: readProgressValue(rec, "bucketIndex") ?? null,
                totalBuckets: readProgressValue(rec, "totalBuckets") ?? null,
                retryCount: readProgressValue(rec, "retryCount") ?? null,
                attemptCount: readProgressValue(rec, "attemptCount") ?? null,
                startedAt:
                  typeof rec.startedAt === "string"
                    ? rec.startedAt
                    : typeof readProgressValue(rec, "startedAt") === "string"
                      ? (readProgressValue(rec, "startedAt") as string)
                      : null,
                completedAt: typeof rec.completedAt === "string" ? rec.completedAt : null,
                failedAt: typeof rec.failedAt === "string" ? rec.failedAt : null,
                lastError: nextLastError,
                lastErrorAt: typeof rec.lastErrorAt === "string" ? rec.lastErrorAt : null,
                lastErrorPhase:
                  typeof rec.lastErrorPhase === "string" ? rec.lastErrorPhase : null,
                lastErrorStack:
                  typeof rec.lastErrorStack === "string" ? rec.lastErrorStack : null,
                error: nextError,
                processKickCount,
                lastProcessKickAt,
                lastProcessKickReason,
              }
            : null,
        );

        const currentStage =
          rec && typeof readProgressValue(rec, "currentStage") === "string"
            ? (readProgressValue(rec, "currentStage") as string)
            : null;
        const shouldKickImmediately =
          nextStatus === "processing" &&
          (currentStage === "queued_next_bucket" ||
            currentStage === "finalizing" ||
            currentStage === "retrying_primary_model" ||
            currentStage === "fallback_scoring");
        if (shouldKickImmediately) {
          void kickProcess(`poll:${currentStage}`, 250);
        }

        if (nextStatus === "complete" && normalizedReport) {
          setRemoteReport({ reportId: id, report: normalizedReport });
        }
      } catch (error) {
        if (cancelled) return;
        setLastError(error instanceof Error ? error.message : "Failed to load report");
      }
    }

    tick();
    timer = window.setInterval(() => {
      if (cancelled) return;
      // keep polling until job completes or errors
      if (status === "complete" || status === "error" || status === "cancelled") return;
      tick();
    }, 2000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [rid, status, processKickCount, lastProcessKickAt, lastProcessKickReason, kickProcess]);

  // Keep nudging the backend while the report is still processing.
  // This heartbeat is intentionally stage-aware so `queued_next_bucket`
  // and `finalizing` continue even if the browser misses a prior trigger.
  useEffect(() => {
    if (!rid) return;
    if (status === "complete" || status === "error" || status === "cancelled") return;

    const currentStage =
      debugDetails && typeof debugDetails.currentStage === "string"
        ? debugDetails.currentStage
        : null;
    const isUrgentStage =
      currentStage === "queued_next_bucket" ||
      currentStage === "finalizing" ||
      currentStage === "retrying_primary_model" ||
      currentStage === "fallback_scoring";

    void kickProcess(isUrgentStage ? `heartbeat:${currentStage}` : "heartbeat:processing", 250);

    const interval = window.setInterval(() => {
      void kickProcess(
        isUrgentStage ? `interval:${currentStage}` : "interval:processing",
        isUrgentStage ? 750 : 1500,
      );
    }, isUrgentStage ? 1800 : Math.max(2200, processDelayMs));

    return () => {
      window.clearInterval(interval);
    };
  }, [rid, status, debugDetails, processDelayMs, kickProcess]);

  const effectiveReport = rid
    ? remoteReport?.reportId === rid
      ? remoteReport.report
      : null
    : report;

  if (demo === "1") {
    return <DemoReport />;
  }

  if (!accountReady) {
    return (
      <div className="m-0 flex min-h-screen w-full items-center justify-center bg-[color:var(--background)] p-6">
        <div className="flex items-center gap-3 text-sm text-[color:var(--ink-muted)]">
          <LoadingSpinner />
          Checking sign in…
        </div>
      </div>
    );
  }

  if (accountSession.email === "guest@local.test" && !demo) {
    return (
      <div className="m-0 flex min-h-screen w-full items-center justify-center bg-[color:var(--background)] p-6">
        <div className="flex items-center gap-3 text-sm text-[color:var(--ink-muted)]">
          <LoadingSpinner />
          Redirecting to sign in…
        </div>
      </div>
    );
  }

  if (!rid) {
    return (
      <div className="m-0 w-full max-w-none px-6 pb-6 pt-10">
        <div className="mb-8 flex flex-nowrap items-center justify-between gap-4">
          <div className="min-w-0 shrink-0">
            <h2
              className="font-display font-semibold tracking-tight"
              style={{ fontSize: "24px", lineHeight: "1.15", color: "var(--ink)" }}
            >
              Reports
            </h2>
          </div>
          <div className="flex flex-nowrap items-center gap-3">
            <input
              type="search"
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
              placeholder="Search reports"
              aria-label="Search reports"
              className="h-10 w-[300px] max-w-[24vw] shrink-0 rounded-full border border-[color:var(--cream-dark)] bg-white px-4 text-sm text-[color:var(--ink)] outline-none transition placeholder:text-[color:var(--ink-faint)] focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent)]/10"
            />
            {showAdminDashboardCta ? (
              <Link
                className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-[#ff7a1a] bg-white px-4 py-2 text-sm font-medium text-[#ff7a1a] transition hover:bg-[#fff7f0]"
                href="/admin"
              >
                Dashboard
              </Link>
            ) : null}
            <Link
              className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-[#ff7a1a] bg-white px-4 py-2 text-sm font-medium text-[#ff7a1a] transition hover:bg-[#fff7f0]"
              href="/report?demo=1"
              >
                View sample report
              </Link>
            {reportHistory.length > 0 ? (
              <Link className="btnPrimary shrink-0" href="/audit">
                Start Audit
              </Link>
            ) : null}
          </div>
        </div>

        {loadingHistory ? (
          <div className="rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-white p-6">
            <div className="flex items-center gap-3 text-sm text-[color:var(--ink-muted)]">
              <LoadingSpinner />
              Loading reports…
            </div>
          </div>
        ) : historyError ? (
          <div className="rounded-[var(--radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {historyError}
          </div>
        ) : reportHistory.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-white p-8 text-center">
            <div className="text-lg font-semibold">No reports yet</div>
            <div className="mt-2 text-sm text-[color:var(--ink-muted)]">
              Run your first audit and it will appear here.
            </div>
            <div className="mt-5">
              <Link className="btnPrimary" href="/audit">
                Start Audit
              </Link>
            </div>
          </div>
        ) : filteredReportHistory.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-white p-8 text-center">
            <div className="text-lg font-semibold">No matching reports</div>
            <div className="mt-2 text-sm text-[color:var(--ink-muted)]">
              Try a different report name or clear the search.
            </div>
            <div className="mt-5">
              <button type="button" onClick={() => setReportSearch("")} className="btnPrimary">
                Clear search
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {deleteError ? (
              <div className="rounded-[var(--radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {deleteError}
              </div>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredReportHistory.map((item) => {
                const statusLabel = item.status
                  ? `${item.status.charAt(0).toUpperCase()}${item.status.slice(1)}`
                  : "Status unknown";

                return (
                  <div
                    key={item.id}
                    role="link"
                    tabIndex={0}
                    onClick={(event) => {
                      const target = event.target as HTMLElement | null;
                      if (target?.closest("[data-no-card-nav]")) return;
                      router.push(`/report?rid=${encodeURIComponent(item.id)}`);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      const target = event.target as HTMLElement | null;
                      if (target?.closest("[data-no-card-nav]")) return;
                      event.preventDefault();
                      router.push(`/report?rid=${encodeURIComponent(item.id)}`);
                    }}
                    className="cursor-pointer rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-white p-5 transition hover:bg-black/[0.015] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/10"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold">{item.productName}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[color:var(--ink-muted)]">
                          <span>{item.productType || "Type unknown"}</span>
                          <span aria-hidden="true">|</span>
                          <span>{item.primaryPlatform || "Platform unknown"}</span>
                          {item.createdAt ? (
                            <>
                              <span aria-hidden="true">|</span>
                              <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                            </>
                          ) : null}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          {item.overallScore !== null ? (
                            <div className="rounded-[14px] border border-[color:var(--cream-dark)] bg-white px-4 py-2 text-sm font-medium">
                              {item.overallScore}/100
                            </div>
                          ) : null}
                          <div className="rounded-[14px] border border-[color:var(--cream-dark)] bg-white px-4 py-2 text-sm font-medium">
                            {statusLabel}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <Link
                          data-no-card-nav
                          className="btnSecondary"
                          href={`/audit?sourceReport=${encodeURIComponent(item.id)}`}
                        >
                          Re-audit
                        </Link>
                        <button
                          type="button"
                          data-no-card-nav
                          onClick={() => deleteReport(item.id)}
                          disabled={deletingReportId === item.id}
                          className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-red-200 bg-white text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={deletingReportId === item.id ? "Deleting report" : "Delete report"}
                        >
                          {deletingReportId === item.id ? (
                            <span className="text-xs font-medium">…</span>
                          ) : (
                            <img
                              src="/delete.png"
                              alt=""
                              aria-hidden="true"
                              className="h-5 w-5 object-contain"
                              draggable={false}
                            />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  const reportId = rid && rid.trim() ? rid : null;
  const name = effectiveReport ? reportNameFrom(effectiveReport) : "UX Report";

  async function download(kind: "docx" | "pdf" | "pptx", reportOverride?: unknown) {
    if (!reportId) return;
    setDownloadError(null);
    if (kind === "docx") setDownloading(true);
    else if (kind === "pdf") setDownloadingPdf(true);
    else setDownloadingPptx(true);
    try {
      if (kind === "pdf") {
        const res = await fetch(`/api/report/${encodeURIComponent(reportId)}/pdf`, reportOverride !== undefined
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ report: reportOverride }),
            }
          : undefined);
        if (!res.ok) {
          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const json = (await res.json().catch(() => null)) as
              | { error?: string; phase?: string; stack?: string }
              | null;
            const details = [
              json?.error || `Download failed (${res.status})`,
              json?.phase ? `Phase: ${json.phase}` : "",
              json?.stack ? `Stack: ${json.stack.split("\n")[0]}` : "",
            ]
              .filter(Boolean)
              .join(" | ");
            throw new Error(details);
          }
          const text = await res.text().catch(() => "");
          throw new Error(text || `Download failed (${res.status})`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${name.replace(/[^\w\- ]+/g, "").slice(0, 60) || "ux-report"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      const isPptxWithOverride = kind === "pptx" && reportOverride !== undefined;
      const res = await fetch(`/api/report/${encodeURIComponent(reportId)}/${kind}`, isPptxWithOverride
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ report: reportOverride }),
          }
        : undefined);
      if (!res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const json = (await res.json().catch(() => null)) as
            | { error?: string; phase?: string; stack?: string }
            | null;
          const details = [
            json?.error || `Download failed (${res.status})`,
            json?.phase ? `Phase: ${json.phase}` : "",
            json?.stack ? `Stack: ${json.stack.split("\n")[0]}` : "",
          ]
            .filter(Boolean)
            .join(" | ");
          throw new Error(details);
        }
        const text = await res.text().catch(() => "");
        throw new Error(text || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[^\w\- ]+/g, "").slice(0, 60) || "ux-report"}.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Download failed");
    } finally {
      if (kind === "docx") setDownloading(false);
      else if (kind === "pdf") setDownloadingPdf(false);
      else setDownloadingPptx(false);
    }
  }

  if (reportId && status === "error") {
    const failureMessage =
      jobError || lastError || "The automation returned an error, so report creation has stopped.";
    const isCapturePipelineFailure = /capture could not run because no evidence source was executed|capture_pipeline_not_executed/i.test(
      failureMessage,
    );
    const isLoginFailure = /login automation|login failed|authenticated state could not be confirmed|username|password|account access/i.test(
      failureMessage,
    );
    const isCoverageFailure = /exploration coverage missing|internal product screens were not captured|navigation \/ context selectors were not captured/i.test(
      failureMessage,
    );
    return (
      <div className="p-6">
        <div className="text-lg font-semibold">
          {isCapturePipelineFailure
            ? "Capture pipeline did not run"
            : isLoginFailure
            ? "Login failed — audit not started"
            : isCoverageFailure
              ? "Exploration incomplete — audit stopped"
              : "Report generation failed"}
        </div>
        <div className="mt-3 text-sm text-[color:var(--muted)]">
          {isCapturePipelineFailure
            ? "The audit stopped before scoring because no evidence source actually executed."
            : isLoginFailure
            ? "We could not access the product with the provided credentials, so the audit was stopped before scoring."
            : isCoverageFailure
              ? "Login appears to have worked, but the explorer did not capture enough internal product screens to run a reliable audit."
              : "The automation returned an error, so report creation has stopped."}
        </div>
        {jobError ? (
          <div className="mt-3 text-sm text-red-600 dark:text-red-400">{jobError}</div>
        ) : null}
        {!jobError && lastError ? (
          <div className="mt-3 text-sm text-red-600 dark:text-red-400">{lastError}</div>
        ) : null}
        {(debugDetails?.lastErrorPhase || debugDetails?.lastErrorStack) ? (
          <div className="mt-3 rounded-[var(--radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            <div className="font-semibold">Failure details</div>
            <div className="mt-1">
              {typeof debugDetails.lastErrorPhase === "string" && debugDetails.lastErrorPhase
                ? `The report failed during ${toDisplayStage(debugDetails.lastErrorPhase) || debugDetails.lastErrorPhase}.`
                : "The report failed before a phase label could be recorded."}
            </div>
            {typeof debugDetails.lastErrorStack === "string" && debugDetails.lastErrorStack ? (
              <div className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-red-700/90 dark:text-red-200/90">
                {debugDetails.lastErrorStack}
              </div>
            ) : null}
          </div>
        ) : null}
        {debugDetails ? (
          <CapturePipelineDebug debug={debugDetails} />
        ) : null}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() =>
              window.location.assign(
                reportId ? `/audit?sourceReport=${encodeURIComponent(reportId)}` : "/audit",
              )
            }
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
          >
            {isLoginFailure ? "Fix credentials" : "Review audit setup"}
          </button>
          <button
            type="button"
            onClick={() => void retryReportGeneration()}
            disabled={retryingReport}
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
          >
            {retryingReport ? "Retrying…" : "Try again"}
          </button>
        </div>
      </div>
    );
  }

  if (reportId && status === "cancelled") {
    return (
      <div className="p-6">
        <div className="text-lg font-semibold">Report stopped</div>
        <div className="mt-3 text-sm text-[color:var(--muted)]">
          The current report run was cancelled.
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void retryReportGeneration()}
            disabled={retryingReport}
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
          >
            {retryingReport ? "Retrying…" : "Refresh status"}
          </button>
        </div>
      </div>
    );
  }

  if (reportId && status !== "complete") {
    const completedBuckets =
      debugDetails && typeof debugDetails.completedBuckets === "number"
        ? debugDetails.completedBuckets
        : debugDetails && typeof debugDetails.bucketIndex === "number"
          ? debugDetails.bucketIndex
          : null;
    const currentBucketNumber =
      debugDetails && typeof debugDetails.currentBucketNumber === "number"
        ? debugDetails.currentBucketNumber
        : debugDetails &&
            typeof debugDetails.bucketIndex === "number" &&
            typeof debugDetails.totalBuckets === "number" &&
            debugDetails.bucketIndex < debugDetails.totalBuckets
          ? debugDetails.bucketIndex + 1
          : null;
    const currentBucketName =
      debugDetails && typeof debugDetails.currentBucketName === "string"
        ? debugDetails.currentBucketName
        : null;
    const currentStage = toDisplayStage(debugDetails?.currentStage);
    const totalBuckets =
      debugDetails && typeof debugDetails.totalBuckets === "number"
        ? debugDetails.totalBuckets
        : null;
    return (
      <div className="px-6 pb-6 pt-10">
        <div className="text-lg font-semibold">Creating your report…</div>
        <div className="mt-3 flex items-center gap-3 text-sm text-[color:var(--muted)]">
          <LoadingSpinner />
          <div>
            Keep this tab open. This can take a minute.
          </div>
        </div>
        {debugDetails ? (
          <div className="mt-4 rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-white p-4 text-sm">
            <div className="font-semibold">Progress</div>
            <div className="mt-3 grid gap-2 text-[color:var(--ink-muted)] sm:grid-cols-2">
              <div>
                Completed buckets:{" "}
                <span className="font-medium text-[color:var(--ink)]">
                  {completedBuckets ?? "—"}{totalBuckets !== null ? ` / ${totalBuckets}` : ""}
                </span>
              </div>
              <div>
                Current bucket:{" "}
                <span className="font-medium text-[color:var(--ink)]">
                  {currentBucketNumber ?? "—"}
                  {currentBucketName ? ` — ${currentBucketName}` : ""}
                </span>
              </div>
              <div>
                Current stage:{" "}
                <span className="font-medium text-[color:var(--ink)]">{currentStage || "Waiting"}</span>
              </div>
              <div>
                Retry / attempt:{" "}
                <span className="font-medium text-[color:var(--ink)]">
                  {typeof debugDetails.retryCount === "number" ? debugDetails.retryCount : 0}
                  {" / "}
                  {typeof debugDetails.attemptCount === "number" ? debugDetails.attemptCount : 0}
                </span>
              </div>
            </div>
          </div>
        ) : null}
        {jobError ? (
          <div className="mt-3 text-xs text-red-600 dark:text-red-400">{jobError}</div>
        ) : null}
        {!jobError && lastError ? (
          <div className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            Retrying: {lastError}
          </div>
        ) : null}
        {debugDetails ? (
          <CapturePipelineDebug debug={debugDetails} />
        ) : null}
      </div>
    );
  }

  if (!effectiveReport) {
    return (
      <div className="p-6">
        <div className="text-lg font-semibold">Preparing your report…</div>
        <div className="mt-3 flex items-center gap-3 text-sm text-[color:var(--muted)]">
          <LoadingSpinner />
          <div>Hang tight while the live report finishes loading.</div>
        </div>
      </div>
    );
  }

  return (
    <LiveReport
      report={effectiveReport}
      reportId={reportId}
      onReaudit={() => router.push(`/audit?sourceReport=${encodeURIComponent(reportId || "")}`)}
      onDownloadPdf={reportId ? (reportOverride) => download("pdf", reportOverride) : undefined}
      onDownloadDocx={reportId ? () => download("docx") : undefined}
      onDownloadPptx={reportId ? (reportOverride) => download("pptx", reportOverride) : undefined}
      downloadingPdf={downloadingPdf}
      downloadingDocx={downloading}
      downloadingPptx={downloadingPptx}
      downloadError={downloadError}
    />
  );
}
