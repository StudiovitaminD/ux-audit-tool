"use client";

import { useEffect, useMemo, useState } from "react";
import { asString, buildReportViewModel, type AnyRecord } from "@/lib/report-model";
import { buildReportPages } from "@/components/report/report-pages";
import { recalculateEditedReport, updateReportAnswer } from "@/lib/report-editing";
import { ReportAccessPanel } from "@/components/account/access-panels";
import { AIBucketAnswersSection } from "@/components/report/sections/AIBucketAnswersSection";

export function LiveReport({
  report,
  reportId,
  onReaudit,
  onDownloadPdf,
  onDownloadDocx,
  onDownloadPptx,
  downloadingPdf,
  downloadingDocx,
  downloadingPptx,
  downloadError,
}: {
  report: unknown;
  reportId?: string | null;
  onReaudit?: () => void;
  onDownloadPdf?: () => void;
  onDownloadDocx?: () => void;
  onDownloadPptx?: (reportOverride?: unknown) => void | Promise<void>;
  downloadingPdf?: boolean;
  downloadingDocx?: boolean;
  downloadingPptx?: boolean;
  downloadError?: string | null;
}) {
  const [baseReport, setBaseReport] = useState(() => recalculateEditedReport(report));
  const [editableReport, setEditableReport] = useState(() => recalculateEditedReport(report));
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [aiAnswersOpen, setAiAnswersOpen] = useState(false);
  const vm = useMemo(() => buildReportViewModel(editableReport), [editableReport]);
  const [page, setPage] = useState(0);
  const [hydratedCompetitors, setHydratedCompetitors] = useState<AnyRecord[]>(
    Array.isArray(vm.competitorAnalysis.competitors) ? vm.competitorAnalysis.competitors : [],
  );
  const reportRecord =
    editableReport && typeof editableReport === "object" ? (editableReport as Record<string, unknown>) : {};
  const lockedSections = useMemo(
    () =>
      Array.isArray(reportRecord.locked_sections)
        ? reportRecord.locked_sections.map((item) => String(item))
        : [],
    [reportRecord.locked_sections],
  );
  const reportAccessLevel = asString(reportRecord.report_access_level) || "full";
  const isPreviewReport = reportAccessLevel === "free_preview";

  useEffect(() => {
    const next = recalculateEditedReport(report);
    setBaseReport(next);
    setEditableReport(next);
  }, [report]);

  useEffect(() => {
    setHydratedCompetitors(
      Array.isArray(vm.competitorAnalysis.competitors) ? vm.competitorAnalysis.competitors : [],
    );
  }, [vm.competitorAnalysis.competitors]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const missing = hydratedCompetitors.filter(
        (competitor) => !asString(competitor.screenshot) && asString(competitor.url),
      );
      if (!missing.length) return;

      const resolved = await Promise.all(
        hydratedCompetitors.map(async (competitor) => {
          if (asString(competitor.screenshot) || !asString(competitor.url)) return competitor;
          try {
            const res = await fetch("/api/competitor-screenshot", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: asString(competitor.name),
                url: asString(competitor.url),
                compare_focus: asString(competitor.compare_focus),
              }),
            });
            if (!res.ok) return competitor;
            const data = (await res.json()) as { screenshot_url?: string; screenshot?: string };
            return {
              ...competitor,
              screenshot:
                data.screenshot_url || data.screenshot || asString(competitor.screenshot),
            };
          } catch {
            return competitor;
          }
        }),
      );

      if (!cancelled) setHydratedCompetitors(resolved);
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [hydratedCompetitors]);

  const pages = useMemo(
    () =>
      buildReportPages({
        vm,
        hydratedCompetitors,
        lockedSections,
        includeAiBucketAnswers: false,
        onAnswerChange: (bucketName, questionId, selectedOption, userReason, userEvidence) =>
          setEditableReport((current) =>
            updateReportAnswer(
              current,
              bucketName,
              questionId,
              selectedOption,
              userReason,
              userEvidence,
            ),
          ),
        onResetAnswers: () => setEditableReport(recalculateEditedReport(report)),
      }),
    [hydratedCompetitors, lockedSections, report, vm],
  );

  const current = pages[page] ?? pages[0];
  const currentPageLocked = Boolean(current?.locked);

  useEffect(() => {
    setPage((currentPage) => Math.max(0, Math.min(currentPage, Math.max(0, pages.length - 1))));
  }, [pages.length]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [page]);

  const isDirty = useMemo(
    () => JSON.stringify(editableReport) !== JSON.stringify(baseReport),
    [editableReport, baseReport],
  );

  async function saveChanges(skipConfirm = false) {
    if (!reportId || !isDirty) return true;
    if (
      !skipConfirm &&
      typeof window !== "undefined" &&
      !window.confirm("Save these report changes?")
    ) {
      return false;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/report/${encodeURIComponent(reportId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: editableReport }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || `Save failed (${res.status})`);
      setBaseReport(editableReport);
      setSaveMessage("Changes saved");
      return true;
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Failed to save changes");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function resetAnswers() {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Reset all edited answers back to the current saved report?")
    ) {
      return;
    }
    setEditableReport(baseReport);
    setSaveMessage("Answers reset");
  }

  async function saveBeforeExport(run?: ((reportOverride?: unknown) => void | Promise<void>) | undefined) {
    if (!run) return;
    if (reportId && isDirty) {
      const saved = await saveChanges(true);
      if (!saved) return;
    }
    await run(editableReport);
  }

  // Expose programmatic page switching for PDF export mode
  useEffect(() => {
    const winAny = window as { __setReportExportPage?: (pageIndex: number) => void };
    winAny.__setReportExportPage = (pageIndex: number) => {
      const validIndex = Math.max(0, Math.min(pages.length - 1, pageIndex));
      setPage(validIndex);
    };

    return () => {
      const winAny = window as { __setReportExportPage?: (pageIndex: number) => void };
      delete winAny.__setReportExportPage;
    };
  }, [pages.length]);

  return (
    <div className="flex min-h-screen flex-col px-6 pt-6 pb-40" data-report-live-root>
      <ReportAccessPanel
        reportAccessLevel={reportAccessLevel}
        lockedSections={lockedSections}
      />

      <div className="no-print flex flex-wrap items-start justify-between gap-4" data-report-toolbar>
        <div>
          <div className="text-lg font-semibold">Generated report: {vm.productName}</div>
          <div className="mt-1 text-sm text-[color:var(--ink-muted)]">
            Client‑deliverable preview (multi-page).
          </div>
        </div>
      </div>

      <div
        className="mt-5 flex-1 min-h-0 overflow-x-auto"
        data-report-live-canvas
        data-current-page={page + 1}
        data-total-pages={pages.length}
      >
        <div
          className={`report-a4-page print-page mt-5 print-report-root ${
            current.variant === "cover"
              ? "report-a4-page-cover bg-[#fc6d27]"
              : current.title === "Overview"
                ? "report-a4-page-overview"
              : "bg-[color:var(--white)]"
          }`}
          data-report-live-page
          data-report-page-title={current.title}
        >
          <div className={`report-a4-page-inner relative ${current.variant === "cover" ? "h-full" : ""}`}>
            {current.variant === "cover" ? (
              <div className="flex h-full min-h-0 flex-col">
                <div
                  className={
                    currentPageLocked
                      ? "pointer-events-none select-none blur-md opacity-60 h-full"
                      : "h-full"
                  }
                >
                  {current.body}
                </div>
              </div>
            ) : (
              <div
                className={`flex h-full min-h-0 flex-col ${
                  currentPageLocked ? "pointer-events-none select-none blur-md opacity-60" : ""
                }`}
              >
                <div className="report-a4-page-body">
                  {current.showTitle !== false ? (
                    <div
                      className={`mb-5 flex flex-col items-start gap-1 self-stretch ${
                        current.title === "Overview"
                          ? "pb-0"
                          : "border-b border-[rgba(15,23,42,0.14)] pb-4"
                      }`}
                    >
                      <div
                        className="text-[24px] font-bold leading-normal text-[color:var(--report-black)]"
                        style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
                      >
                        {current.title}
                      </div>
                    </div>
                  ) : null}
                  {current.body}
                </div>
                <div className="mt-auto flex h-[30px] shrink-0 items-center justify-between self-stretch border-t border-[rgba(252,109,39,0.20)] bg-[color:var(--report-orange)] px-8 py-1.5 text-[14px] leading-5 text-[color:var(--report-white)]">
                  <div>Page {page + 1}</div>
                  <div>UX Audit Report</div>
                </div>
              </div>
            )}
            {currentPageLocked ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="max-w-md rounded-2xl border border-[color:var(--cream-dark)] bg-white/95 p-6 text-center shadow-lg">
                  <div className="text-lg font-semibold">Full report locked</div>
                  <div className="mt-2 text-sm text-[color:var(--ink-muted)]">
                    This page is part of the paid report. Upgrade or sign in with a paid account to unlock full analysis and exports.
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div
          className="no-print fixed inset-x-6 bottom-6 z-30 rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-[color:var(--white)] p-5 shadow-lg shadow-black/5 backdrop-blur"
          data-report-pagination
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-[color:var(--ink-muted)]" data-report-page-indicator>
              Page {page + 1} / {pages.length}
            </div>
            <div className="flex flex-wrap items-center gap-2" data-report-pagination-controls>
              {reportId ? (
              <button
                type="button"
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
                onClick={() => void saveChanges()}
                disabled={!isDirty || saving}
                style={!isDirty || saving ? { opacity: 0.5, pointerEvents: "none" } : undefined}
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
              ) : null}
              <button
                type="button"
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
                onClick={resetAnswers}
                disabled={saving || !isDirty}
                style={saving || !isDirty ? { opacity: 0.5, pointerEvents: "none" } : undefined}
              >
                Reset Answers
              </button>
              <button
                type="button"
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
                onClick={() => setAiAnswersOpen((open) => !open)}
              >
                {aiAnswersOpen ? "Close AI Answers" : "AI Answers"}
              </button>
              {onDownloadPdf ? (
                <button
                  type="button"
                  className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
                  onClick={() => void saveBeforeExport(onDownloadPdf)}
                  disabled={downloadingPdf || isPreviewReport || saving}
                >
                  {isPreviewReport ? "Upgrade for PDF" : downloadingPdf ? "Exporting PDF…" : "Export PDF"}
                </button>
              ) : null}
              {onDownloadPptx ? (
              <button
                type="button"
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
                onClick={() => void saveBeforeExport(onDownloadPptx)}
                disabled={downloadingPptx || isPreviewReport || saving}
              >
                {isPreviewReport ? "Upgrade for PPTX" : downloadingPptx ? "Exporting PPTX…" : "Export PPTX"}
              </button>
              ) : null}
              <button
                type="button"
                className="btnPrimary"
                data-report-prev
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                aria-disabled={page === 0}
                style={page === 0 ? { opacity: 0.5, pointerEvents: "none" } : undefined}
              >
                ← Prev
              </button>
              <button
                type="button"
                className="btnPrimary"
                data-report-next
                onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
                disabled={page === pages.length - 1}
                aria-disabled={page === pages.length - 1}
                style={
                  page === pages.length - 1 ? { opacity: 0.5, pointerEvents: "none" } : undefined
                }
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      </div>

      {aiAnswersOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setAiAnswersOpen(false)}
        >
          <div className="absolute inset-x-6 bottom-28 top-24 flex flex-col overflow-hidden rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-[color:var(--white)] shadow-2xl shadow-black/20">
            <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5">
              <div>
                <div className="text-lg font-semibold text-[color:var(--ink)]">AI Bucket Answers</div>
                <div className="mt-1 text-sm text-[color:var(--ink-muted)]">
                  Edit the question-level answers here, then save to update the report.
                </div>
              </div>
              <button
                type="button"
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
                onClick={() => setAiAnswersOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <AIBucketAnswersSection
                bucketAnswerSections={Array.isArray(vm.bucketResults) ? vm.bucketResults : []}
                onAnswerChange={(bucketName, questionId, selectedOption, userReason, userEvidence) =>
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
                onResetAnswers={resetAnswers}
              />
            </div>
          </div>
        </div>
      ) : null}

      {downloadError ? (
        <div className="mt-5 rounded-[var(--radius)] border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {downloadError}
        </div>
      ) : null}
      {saveMessage ? (
        <div
          className={`mt-5 rounded-[var(--radius)] border p-4 text-sm ${
            saveMessage === "Changes saved"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {saveMessage}
        </div>
      ) : null}
    </div>
  );
}
