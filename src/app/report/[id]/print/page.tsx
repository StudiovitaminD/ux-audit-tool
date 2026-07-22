import { notFound } from "next/navigation";
import { PrintReport } from "@/components/report/print-report";
import { loadStoredReport } from "@/lib/report-record";

export default async function ReportPrintPage({
  params,
}: {
  params: { id: string };
}) {
  const loaded = await loadStoredReport(params.id);
  if (!loaded) notFound();

  return <PrintReport report={loaded.report} />;
}
