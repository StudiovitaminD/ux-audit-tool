import { notFound } from "next/navigation";
import { PrintReport } from "@/components/report/print-report";
import { consumeReportExportOverride } from "@/lib/report-export-overrides";
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
    try {
      return consumeReportExportOverride(encoded);
    } catch {
      return null;
    }
  })();

  if (overrideReport) {
    return <PrintReport report={overrideReport} />;
  }

  const loaded = await loadStoredReport(params.id);
  if (!loaded) notFound();

  return <PrintReport report={loaded.report} />;
}
