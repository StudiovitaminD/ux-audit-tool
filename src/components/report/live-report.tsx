"use client";

import Link from "next/link";
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
  onDownloadPdf?: (reportOverride?: unknown) => void | Promise<void>;
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
  const [pageTurnDirection, setPageTurnDirection] = useState<"next" | "prev">("next");
  const [zoom, setZoom] = useState(0.82);
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
  const nextPage = pages[page + 1];
  const currentPageLocked = Boolean(current?.locked);

  function goToPage(nextPage: number) {
    const boundedPage = Math.max(0, Math.min(pages.length - 1, nextPage));
    if (boundedPage === page) return;
    setPageTurnDirection(boundedPage > page ? "next" : "prev");
    setPage(boundedPage);
  }

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
      <div className="no-print fixed left-16 top-24 z-30">
        <Link href="/report" className="btnSecondary">
          Back to reports
        </Link>
      </div>
      <ReportAccessPanel
        reportAccessLevel={reportAccessLevel}
        lockedSections={lockedSections}
      />

      <div
        className="mt-5 flex-1 min-h-0 overflow-x-auto"
        data-report-live-canvas
        data-current-page={page + 1}
        data-total-pages={pages.length}
      >
        <div
          className="report-page-stage mt-5"
          style={{ width: `${794 * zoom * (current.variant === "cover" || !nextPage ? 1 : 2)}px`, height: `${1123 * zoom}px` }}
        >
        <div
          key={page}
          className={`report-a4-page print-page print-report-root report-page-turn report-page-turn-${pageTurnDirection} ${
            current.variant === "cover"
              ? "report-a4-page-cover bg-[#fc6d27]"
              : current.title === "Overview"
                ? "report-a4-page-overview"
              : "bg-[color:var(--white)]"
          }`}
          style={{ ["--report-page-zoom" as string]: zoom } as React.CSSProperties}
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
                <div className="report-a4-page-footer mt-auto h-[30px] shrink-0 self-stretch border-t border-[rgba(252,109,39,0.20)] bg-[color:var(--report-orange)] text-[14px] leading-5 text-[color:var(--report-white)]">
                  <div className="report-a4-page-footer-inner flex h-full items-center justify-between px-8 py-1.5">
                    <div>Page {page + 1}</div>
                    <div>UX Audit Report</div>
                  </div>
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
        {current.variant !== "cover" && nextPage ? (
          <div
            className={`report-a4-page print-page print-report-root report-page-spread-next ${
              nextPage.title === "Overview" ? "report-a4-page-overview" : "bg-[color:var(--white)]"
            }`}
            style={{ transform: `scale(${zoom})`, left: `${794 * zoom}px` }}
            data-report-live-page
            data-report-page-title={nextPage.title}
          >
            <div className="report-a4-page-inner relative">
              <div className="flex h-full min-h-0 flex-col">
                <div className="report-a4-page-body">{nextPage.body}</div>
                <div className="report-a4-page-footer mt-auto h-[30px] shrink-0 self-stretch border-t border-[rgba(252,109,39,0.20)] bg-[color:var(--report-orange)] text-[14px] leading-5 text-[color:var(--report-white)]">
                  <div className="report-a4-page-footer-inner flex h-full items-center justify-between px-8 py-1.5">
                    <div>Page {page + 2}</div>
                    <div>UX Audit Report</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        </div>

        <div
          className="no-print fixed bottom-6 left-1/2 z-30 w-[794px] max-w-[calc(100%-3rem)] -translate-x-1/2 rounded-[var(--radius)] floatingBarShell p-5 shadow-lg shadow-black/10 backdrop-blur"
          data-report-pagination
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2" data-report-pagination-controls>
              <Link
                href={`/report/ai-answers${reportId ? `?rid=${encodeURIComponent(reportId)}` : ""}`}
                className="floatingBarSecondary"
              >
                AI Answers
              </Link>
              {onDownloadPdf ? (
                <button
                  type="button"
                  className="floatingBarSecondary"
                  onClick={() => void saveBeforeExport(onDownloadPdf)}
                  disabled={downloadingPdf || isPreviewReport || saving}
                >
                  {isPreviewReport ? "Upgrade for PDF" : downloadingPdf ? "Exporting PDF…" : "Export PDF"}
                </button>
              ) : null}
              {onDownloadPptx ? (
                <button
                  type="button"
                  className="floatingBarSecondary"
                  onClick={() => void saveBeforeExport(onDownloadPptx)}
                  disabled={downloadingPptx || isPreviewReport || saving}
                >
                  {isPreviewReport
                    ? "Upgrade for PPTX"
                    : downloadingPptx
                      ? "Exporting PPTX…"
                      : "Export PPTX"}
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="floatingBarSecondary"
                onClick={() => setZoom((value) => Math.max(0.6, Math.round((value - 0.1) * 100) / 100))}
                disabled={zoom <= 0.6}
                aria-label="Zoom out"
              >
                −
              </button>
              <span className="text-sm text-white/70" aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="floatingBarSecondary"
                onClick={() => setZoom((value) => Math.min(1.2, Math.round((value + 0.1) * 100) / 100))}
                disabled={zoom >= 1.2}
                aria-label="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                className="floatingBarSecondary"
                data-report-prev
                onClick={() => goToPage(page - 2)}
                disabled={page === 0}
                aria-disabled={page === 0}
                style={page === 0 ? { opacity: 0.5, pointerEvents: "none" } : undefined}
              >
                Prev
              </button>
              <div className="text-sm text-white/70" data-report-page-indicator>
                {page + 1} / {pages.length}
              </div>
              <button
                type="button"
                className="floatingBarPrimary"
                data-report-next
                onClick={() => goToPage(page + 2)}
                disabled={page === pages.length - 1}
                aria-disabled={page === pages.length - 1}
                style={
                  page === pages.length - 1 ? { opacity: 0.5, pointerEvents: "none" } : undefined
                }
              >
                Next
              </button>
            </div>
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
