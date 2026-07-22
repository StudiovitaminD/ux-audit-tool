"use client";

import { useEffect, useMemo, useState } from "react";
import { asString, buildReportViewModel, type AnyRecord } from "@/lib/report-model";
import { buildReportPages } from "@/components/report/report-pages";
import { recalculateEditedReport, updateReportAnswer } from "@/lib/report-editing";
import { ReportAccessPanel } from "@/components/account/access-panels";

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
        includeAiBucketAnswers: true,
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
    <div className="p-6" data-report-live-root>
      <ReportAccessPanel
        reportAccessLevel={reportAccessLevel}
        lockedSections={lockedSections}
      />

      <div className="no-print flex flex-wrap items-start justify-between gap-4" data-report-toolbar>
        <div>
          <div className="text-lg font-semibold">Generated report: {vm.productName}</div>
          <div className="mt-1 text-sm text-[color:var(--ink-muted)]">
            Client‑deliverable preview (multi‑page).
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
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
          {reportId ? (
            <button
              type="button"
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
              onClick={onReaudit}
            >
              Re-audit
            </button>
          ) : null}
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
          {onDownloadDocx ? (
            <button
              type="button"
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
              onClick={() => void saveBeforeExport(onDownloadDocx)}
              disabled={downloadingDocx || isPreviewReport || saving}
            >
              {isPreviewReport ? "Upgrade for Word" : downloadingDocx ? "Exporting Word…" : "Export Word"}
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
        </div>
      </div>

      <div
        className="mt-5"
        data-report-live-canvas
        data-current-page={page + 1}
        data-total-pages={pages.length}
      >
        <div
          className="no-print rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-[color:var(--white)] p-5"
          data-report-pagination
        >
          <div className="flex items-center justify-between gap-3">
            <div
              className="text-sm text-[color:var(--ink-muted)]"
              data-report-page-indicator
            >
              Page {page + 1} / {pages.length}
            </div>
            <div className="text-sm font-semibold">{current.title}</div>
            <div className="flex items-center gap-2" data-report-pagination-controls>
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
        <div
          className="mt-5 rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-[color:var(--white)] p-8 print-report-root"
          data-report-live-page
          data-report-page-title={current.title}
        >
          <div className="relative">
            <div className={currentPageLocked ? "pointer-events-none select-none blur-md opacity-60" : ""}>
              {current.body}
            </div>
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
      </div>

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
