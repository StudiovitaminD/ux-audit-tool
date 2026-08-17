import type { ReactNode } from "react";
import { asString, type AnyRecord } from "@/lib/report-model";
import type { ReportPage } from "./shared";
import { normalizeList, placeholderText } from "./shared";
import { SummaryBulletColumns } from "./NarrativeSummarySection";

type CompetitorAnalysisSectionProps = {
  competitor: AnyRecord | null;
  index: number;
  total: number;
};

function SectionBlock({
  title,
  items,
}: {
  title: ReactNode;
  items: readonly string[];
}) {
  return (
    <section className="rounded-xl bg-[color:var(--report-grey-bg)] p-4">
      <div className="text-[16px] font-semibold leading-tight text-[color:var(--report-grey-font)]">
        {title}
      </div>
      <div className="mt-3">
        <SummaryBulletColumns items={items} />
      </div>
    </section>
  );
}

export function CompetitorAnalysisSection({
  competitor,
  index,
  total,
}: CompetitorAnalysisSectionProps) {
  if (!competitor) {
    return (
      <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5 text-sm text-[color:var(--report-grey-font)]">
        Competitor analysis is not available for this report.
      </div>
    );
  }

  const brandName = asString(competitor.name) || `Competitor ${index + 1}`;
  const brandUrl = asString(competitor.url) || "URL not captured";
  const signals =
    competitor && typeof competitor.signals === "object" && competitor.signals
      ? (competitor.signals as Record<string, unknown>)
      : {};
  const positioning =
    asString(competitor.positioning) ||
    asString(signals.positioning) ||
    "Positioning not explicitly captured, but the competitor presents a clear market presence.";
  const strengths = normalizeList(competitor.strengths, 8).filter((item) => !placeholderText(item));
  const gaps = normalizeList(competitor.gaps, 8).filter((item) => !placeholderText(item));
  const stealThis = normalizeList(competitor.steal_this, 8).filter((item) => !placeholderText(item));

  return (
    <div className="space-y-4">
      <div className="text-[24px] font-bold leading-tight text-[color:var(--report-black)]">
        Competitor Analysis - {brandName}{" "}
        <span className="text-[16px] font-normal text-[color:var(--report-grey-font)]">({brandUrl})</span>
      </div>
      <div className="border-t border-[color:var(--card-border)]/60" />
      <div className="text-[14px] leading-[1.5] text-[color:var(--report-black)]">{positioning}</div>

      <div className="rounded-2xl bg-[color:var(--report-grey-bg)] p-4">
        <div className="relative overflow-hidden rounded-xl border border-[color:var(--card-border)] bg-[color:var(--report-white)]">
          <div className="h-[290px] w-full">
            {asString(competitor.screenshot) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asString(competitor.screenshot)}
                alt={`${brandName} screenshot`}
                className="h-full w-full object-cover object-top"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-[color:var(--report-grey-font)]">
                Screenshot unavailable
              </div>
            )}
          </div>
        </div>
      </div>

      <SectionBlock title="Strengths" items={strengths} />
      <SectionBlock title="Gaps" items={gaps} />
      <SectionBlock title="Steal this" items={stealThis} />

      <div className="text-xs text-[color:var(--report-grey-font)]">
        Competitor {index + 1} of {total}
      </div>
    </div>
  );
}

export function buildCompetitorAnalysisPages({
  competitors,
}: {
  competitors: AnyRecord[];
}): ReportPage[] {
  if (!competitors.length) {
    return [
      {
        key: "competitor_analysis",
        title: "Competitor Analysis",
        body: <CompetitorAnalysisSection competitor={null} index={0} total={0} />,
        variant: "standard",
      },
    ];
  }

  return competitors.map((competitor, index) => ({
    key: `competitor_analysis_${index + 1}`,
    title: `Competitor Analysis - ${asString(competitor.name) || `Competitor ${index + 1}`}`,
    body: <CompetitorAnalysisSection competitor={competitor} index={index} total={competitors.length} />,
    variant: "standard",
    showTitle: false,
  }));
}
