import { buildReportViewModel, type AnyRecord } from "@/lib/report-model";
import { buildReportPages } from "@/components/report/report-pages";

export function PrintReport({ report }: { report: unknown }) {
  const vm = buildReportViewModel(report);
  const competitors = Array.isArray(vm.competitorAnalysis.competitors)
    ? (vm.competitorAnalysis.competitors as AnyRecord[])
    : [];
  const pages = buildReportPages({
    vm,
    hydratedCompetitors: competitors,
    includeAiBucketAnswers: true,
  });

  return (
    <div
      className="print-report-root min-h-screen bg-[color:var(--background)] px-4 py-10 sm:px-6 lg:px-8"
      data-report-print-ready="true"
    >
      <div className="report-a4-stage mx-auto space-y-6">
        {pages.map((page, index) => (
          <section
            key={`${page.title}-${index}`}
            className="report-a4-page print-page"
          >
            <div className="report-a4-page-inner">
              <div className="mb-5 flex items-center justify-between gap-3 border-b border-[color:var(--cream-dark)] pb-4">
                <div className="text-sm text-[color:var(--ink-muted)]">
                  Page {index + 1} / {pages.length}
                </div>
                <div className="text-sm font-semibold">{page.title}</div>
              </div>
              <div className="report-a4-page-body">{page.body}</div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
