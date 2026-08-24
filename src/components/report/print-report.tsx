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
    includeAiBucketAnswers: false,
  });

  return (
    <div
      className="print-report-root min-h-screen bg-[color:var(--background)] p-0"
      data-report-print-ready="true"
    >
      <div className="report-a4-stage mx-auto space-y-6">
        {pages.map((page, index) => (
          <section
            key={`${page.title}-${index}`}
            className={`report-a4-page print-page overflow-hidden ${
              page.variant === "cover"
                ? "report-a4-page-cover bg-[#fc6d27]"
                : page.title === "Overview"
                  ? "report-a4-page-overview"
                : "bg-[color:var(--white)]"
            }`}
          >
            {page.variant === "cover" ? (
              <div className="report-a4-page-inner report-a4-page-inner-cover h-full">
                {page.body}
              </div>
            ) : (
              <div className="report-a4-page-inner flex h-full min-h-0 flex-col">
                <div className="report-a4-page-body">
                  {page.showTitle !== false ? (
                    <div
                      className={`mb-5 flex shrink-0 flex-col items-start gap-1 self-stretch ${
                        page.title === "Overview"
                          ? "pb-0"
                          : "border-b border-[rgba(15,23,42,0.14)] pb-4"
                      }`}
                    >
                      <div
                        className="text-[24px] font-bold leading-normal text-[color:var(--report-black)]"
                        style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
                      >
                        {page.title}
                      </div>
                    </div>
                  ) : null}
                  {page.body}
                </div>
                <div className="mt-auto flex h-[30px] shrink-0 items-center justify-between self-stretch border-t border-[rgba(252,109,39,0.20)] bg-[color:var(--report-orange)] px-8 py-1.5 text-[14px] leading-5 text-[color:var(--report-white)]">
                  <div>Page {index + 1}</div>
                  <div>UX Audit Report</div>
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
