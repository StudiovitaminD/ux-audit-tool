import { notFound } from "next/navigation";
import { inflateSync } from "node:zlib";
import { PrintReport } from "@/components/report/print-report";
import { loadStoredReport } from "@/lib/report-record";

export default async function ReportPrintPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const overrideReport = (() => {
    const raw = searchParams?.report;
    const encoded = Array.isArray(raw) ? raw[0]?.trim() : raw?.trim();
    if (!encoded) return null;
    try {
      const json = inflateSync(Buffer.from(encoded, "base64url")).toString("utf8");
      return JSON.parse(json) as unknown;
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
