import { notFound } from "next/navigation";
import { PrintReport } from "@/components/report/print-report";
import { captureCompetitorSnapshot } from "@/lib/competitor-snapshot";
import { loadReportExportOverride } from "@/lib/report-export-overrides";
import { buildReportViewModel, type AnyRecord } from "@/lib/report-model";

async function hydrateCompetitorsForPrint(report: unknown): Promise<AnyRecord[]> {
  const vm = buildReportViewModel(report);
  const competitors = Array.isArray(vm.competitorAnalysis.competitors)
    ? (vm.competitorAnalysis.competitors as AnyRecord[])
    : [];

  return Promise.all(
    competitors.map(async (competitor) => {
      const screenshot = typeof competitor.screenshot === "string" ? competitor.screenshot.trim() : "";
      const url = typeof competitor.url === "string" ? competitor.url.trim() : "";
      if (screenshot || !url) return competitor;
      try {
        const snapshot = await captureCompetitorSnapshot({
          name: typeof competitor.name === "string" ? competitor.name : "",
          url,
          compare_focus: typeof competitor.compare_focus === "string" ? competitor.compare_focus : "",
        });
        return {
          ...competitor,
          screenshot: snapshot.screenshot_url || snapshot.screenshot || "",
        };
      } catch {
        return competitor;
      }
    }),
  );
}

export default async function ReportPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const overrideReport = (() => {
    const raw = resolvedSearchParams?.token;
    const encoded = Array.isArray(raw) ? raw[0]?.trim() : raw?.trim();
    if (!encoded) return null;
    return encoded;
  })();

  if (overrideReport) {
    const report = await loadReportExportOverride(overrideReport);
    if (report) {
      const hydratedCompetitors = await hydrateCompetitorsForPrint(report);
      return <PrintReport report={report} hydratedCompetitors={hydratedCompetitors} />;
    }
  }

  await params;
  notFound();
}
