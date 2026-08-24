import { notFound } from "next/navigation";
import { PrintReport } from "@/components/report/print-report";
import { loadReportExportOverride } from "@/lib/report-export-overrides";
import { loadStoredReport } from "@/lib/report-record";

export default async function ReportPrintPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const overrideReport = (() => {
    const raw = searchParams?.token;
    const encoded = Array.isArray(raw) ? raw[0]?.trim() : raw?.trim();
    if (!encoded) return null;
    return encoded;
  })();

  if (overrideReport) {
    const report = await loadReportExportOverride(overrideReport);
    if (report) {
      return <PrintReport report={report} />;
    }
  }

  const loaded = await loadStoredReport(params.id);
  if (!loaded) notFound();

  return <PrintReport report={loaded.report} />;
}
