"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  SESSION_CHANGE_EVENT,
  SESSION_STORAGE_KEY,
  fetchAppSession,
  getAppSessionRequestHeaders,
  readAppSession,
  type AppSession,
} from "@/lib/app-session";
import { buildReportViewModel, type AnyRecord } from "@/lib/report-model";
import { recalculateEditedReport, updateReportAnswer } from "@/lib/report-editing";
import { AIBucketAnswersView } from "@/components/report/sections/AIBucketAnswersView";
import { buildDemoBucketAnswerSections, DEMO } from "@/components/report/demo-report";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
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

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : String(value ?? "").trim();
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

function summarizeQuestion(question: AnyRecord | null | undefined) {
  if (!question) return "";
  const parts = [
    asString(question.selected_option_text),
    asString(question.observation),
    asString(question.recommendation),
    asString(question.evidence),
  ].filter(Boolean);
  if (parts.length) return parts[0];
  const mark = asString(question.selected_option || question.mark);
  return mark ? `Selected option ${mark}` : asString(question.question);
}

function collectChangedQuestions(baseReportValue: AnyRecord | null, nextReportValue: AnyRecord | null) {
  const baseBuckets = Array.isArray(baseReportValue?.bucket_results) ? baseReportValue?.bucket_results : [];
  const nextBuckets = Array.isArray(nextReportValue?.bucket_results) ? nextReportValue?.bucket_results : [];
  const baseBucketMap = new Map<string, AnyRecord>();

  for (const bucket of baseBuckets) {
    const rec = bucket && typeof bucket === "object" ? (bucket as AnyRecord) : null;
    const bucketName = asString(rec?.bucket_name);
    if (bucketName) baseBucketMap.set(bucketName, rec || {});
  }

  const changes: Array<{
    bucket: string;
    questionId: string;
    question: string;
    before: string;
    after: string;
  }> = [];

  for (const bucket of nextBuckets) {
    const nextBucket = bucket && typeof bucket === "object" ? (bucket as AnyRecord) : null;
    const bucketName = asString(nextBucket?.bucket_name);
    if (!bucketName) continue;
    const baseBucket = baseBucketMap.get(bucketName) ?? {};
    const baseQuestions = Array.isArray(baseBucket.questions) ? baseBucket.questions : [];
    const nextQuestions = Array.isArray(nextBucket?.questions) ? nextBucket?.questions : [];
    const baseQuestionMap = new Map<string, AnyRecord>();
    for (const question of baseQuestions) {
      const rec = question && typeof question === "object" ? (question as AnyRecord) : null;
      const questionId = asString(rec?.id);
      if (questionId) baseQuestionMap.set(questionId, rec || {});
    }

    for (const question of nextQuestions) {
      const nextQuestion = question && typeof question === "object" ? (question as AnyRecord) : null;
      const questionId = asString(nextQuestion?.id);
      if (!questionId) continue;
      const baseQuestion = baseQuestionMap.get(questionId) ?? {};
      const before = [
        baseQuestion.selected_option,
        baseQuestion.selected_option_text,
        baseQuestion.mark,
        baseQuestion.observation,
        baseQuestion.recommendation,
        baseQuestion.evidence,
        baseQuestion.user_reason,
        baseQuestion.user_evidence,
      ]
        .map((item) => JSON.stringify(item ?? null))
        .join("|");
      const after = [
        nextQuestion?.selected_option,
        nextQuestion?.selected_option_text,
        nextQuestion?.mark,
        nextQuestion?.observation,
        nextQuestion?.recommendation,
        nextQuestion?.evidence,
        nextQuestion?.user_reason,
        nextQuestion?.user_evidence,
      ]
        .map((item) => JSON.stringify(item ?? null))
        .join("|");
      if (before === after) continue;

      changes.push({
        bucket: bucketName,
        questionId,
        question: asString(nextQuestion?.question) || asString(baseQuestion.question),
        before: summarizeQuestion(baseQuestion),
        after: summarizeQuestion(nextQuestion),
      });
    }
  }

  return changes;
}

export function AIBucketAnswersRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rid = searchParams.get("rid");
  const demo = searchParams.get("demo");
  const isDemo = demo === "1";
  const sessionHeaders = useMemo(() => getAppSessionRequestHeaders(), []);
  const [accountSession, setAccountSession] = useState<AppSession>(() => readAppSession());
  const [accountReady, setAccountReady] = useState(isDemo);
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState<string | null>(null);
  const [baseReport, setBaseReport] = useState<AnyRecord | null>(null);
  const [editableReport, setEditableReport] = useState<AnyRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo) {
      setAccountReady(true);
      return;
    }

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
  }, [isDemo]);

  useEffect(() => {
    if (isDemo) return;
    if (!accountReady) return;
    if (accountSession.email === "guest@local.test") {
      const returnTo = `/report/ai-answers${rid ? `?rid=${encodeURIComponent(rid)}` : ""}`;
      router.replace(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [accountReady, accountSession.email, demo, isDemo, rid, router]);

  useEffect(() => {
    if (isDemo) return;
    if (!rid) {
      setLoading(false);
      setError("Missing report id.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaveMessage(null);

    fetch(`/api/report/${encodeURIComponent(rid)}`, {
      cache: "no-store",
      headers: sessionHeaders,
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as unknown;
        if (!res.ok) {
          const rec = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
          throw new Error(
            (rec && typeof rec.error === "string" && rec.error) || `Failed to load report (${res.status})`,
          );
        }
        const normalized = normalizedReportFromResponse(data, rid);
        if (!normalized) throw new Error("Unable to read report data.");
        if (cancelled) return;
        const initial = recalculateEditedReport(normalized);
        setBaseReport(initial);
        setEditableReport(initial);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load report");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isDemo, rid, sessionHeaders]);

  const vm = useMemo(() => {
    if (!editableReport) return null;
    return buildReportViewModel(editableReport);
  }, [editableReport]);

  const bucketAnswerSections = useMemo(() => {
    if (isDemo) return buildDemoBucketAnswerSections(DEMO.scorecard);
    return Array.isArray(vm?.bucketResults) ? vm.bucketResults : [];
  }, [isDemo, vm]);

  const isDirty = useMemo(
    () => Boolean(baseReport && editableReport && JSON.stringify(editableReport) !== JSON.stringify(baseReport)),
    [baseReport, editableReport],
  );
  const changedQuestions = useMemo(
    () => collectChangedQuestions(baseReport, editableReport),
    [baseReport, editableReport],
  );

  async function saveChanges() {
    if (isDemo || !rid || !editableReport) return;
    setSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch(`/api/report/${encodeURIComponent(rid)}/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders,
        },
        body: JSON.stringify({
          report: editableReport,
          updated_questions: changedQuestions,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; report?: unknown } | null;
      if (!res.ok) throw new Error(data?.error || `Save failed (${res.status})`);
      if (data?.report && typeof data.report === "object") {
        const refreshed = data.report as AnyRecord;
        setBaseReport(refreshed);
        setEditableReport(refreshed);
      } else {
        setBaseReport(editableReport);
      }
      setSaveMessage("Changes saved");
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  function resetAnswers() {
    if (isDemo || !baseReport) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Reset all edited answers back to the current saved report?")
    ) {
      return;
    }
    setEditableReport(baseReport);
    setSaveMessage(null);
  }

  if (!isDemo && !accountReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-6">
        <div className="text-sm text-[color:var(--ink-muted)]">Checking sign in…</div>
      </div>
    );
  }

  if (!isDemo && accountSession.email === "guest@local.test") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-6">
        <div className="text-sm text-[color:var(--ink-muted)]">Redirecting to sign in…</div>
      </div>
    );
  }

  if (!isDemo && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-6">
        <div className="text-sm text-[color:var(--ink-muted)]">Loading AI Bucket Answers…</div>
      </div>
    );
  }

  if (!isDemo && error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-6">
        <div className="max-w-xl rounded-[var(--radius)] border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--background)]">
      <AIBucketAnswersView
        bucketAnswerSections={bucketAnswerSections}
        onAnswerChange={
          isDemo
            ? undefined
            : (bucketName, questionId, selectedOption, userReason, userEvidence) =>
                setEditableReport((current) =>
                  updateReportAnswer(
                    current,
                    bucketName,
                    questionId,
                    selectedOption,
                    userReason,
                    userEvidence,
                  ),
                )
        }
        onResetAnswers={isDemo ? undefined : resetAnswers}
        onBack={() => router.push(isDemo ? "/report?demo=1" : `/report?rid=${encodeURIComponent(rid || "")}`)}
        onSave={isDemo ? undefined : saveChanges}
        saving={saving}
        canSave={isDemo ? true : isDirty}
        canReset={isDemo ? false : isDirty}
        backLabel={isDemo ? "Back to demo report" : "Back to report"}
        title="AI Bucket Answers"
        subtitle={
          isDemo
            ? "Review the question-level answers that power the demo report preview."
            : "Edit the question-level answers here, then save to update the report."
        }
      />
    </div>
  );
}
