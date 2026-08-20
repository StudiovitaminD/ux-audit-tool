import { asString, type AnyRecord, type ReportViewModel } from "@/lib/report-model";
import { OverviewSection } from "./sections/OverviewSection";
import { buildNarrativeSummaryPages } from "./sections/NarrativeSummarySection";
import { buildCompetitorAnalysisPages } from "./sections/CompetitorAnalysisSection";
import { AIBucketAnswersSection } from "./sections/AIBucketAnswersSection";
import { buildCriticalFindingsPages } from "./sections/FindingsSection";
import { buildQuickWinsRoadmapPages } from "./sections/QuickWinsRoadmapSection";
import { IntroPageSection } from "./sections/IntroPageSection";
import { ThankYouPageSection } from "./sections/ThankYouPageSection";
import type { ReportPage } from "./sections/shared";

export type BuildReportPagesOptions = {
  vm: ReportViewModel;
  hydratedCompetitors: AnyRecord[];
  lockedSections?: string[];
  includeAiBucketAnswers?: boolean;
  onAnswerChange?: (
    bucketName: string,
    questionId: string,
    selectedOption: number,
    userReason?: string,
    userEvidence?: string,
  ) => void;
  onResetAnswers?: () => void;
};

export function buildReportPages({
  vm,
  hydratedCompetitors,
  lockedSections = [],
  includeAiBucketAnswers = true,
  onAnswerChange,
  onResetAnswers,
}: BuildReportPagesOptions): ReportPage[] {
  const isLocked = (key: string) => lockedSections.includes(key);
  const findings = vm.findingsDetailed.filter((finding) => {
    const severity = asString(finding.severity).toLowerCase();
    return severity === "critical" || severity === "high";
  });
  const displayedFindings = findings.length ? findings : vm.findingsDetailed.slice(0, 8);
  const bucketAnswerSections = vm.bucketResults.filter(
    (bucket) => Boolean(bucket) && Array.isArray(bucket.questions) && bucket.questions.length,
  );
  const competitors = hydratedCompetitors;

  const pages: ReportPage[] = [
    {
      key: "intro",
      title: "Intro",
      body: <IntroPageSection vm={vm} />,
      locked: isLocked("intro"),
      variant: "cover",
    },
    {
      key: "overview",
      title: "Overview",
      body: <OverviewSection vm={vm} />,
      locked: isLocked("overview"),
      variant: "standard",
    },
  ];

  pages.push(
    ...buildNarrativeSummaryPages({ vm, pillar: "Accessibility" }).map((page) => ({
      ...page,
      locked: isLocked("narrative_summary"),
    })),
    ...buildNarrativeSummaryPages({ vm, pillar: "Impact" }).map((page) => ({
      ...page,
      locked: isLocked("narrative_summary"),
    })),
    ...buildNarrativeSummaryPages({ vm, pillar: "Delight" }).map((page) => ({
      ...page,
      locked: isLocked("narrative_summary"),
    })),
  );

  pages.push(
    ...buildCompetitorAnalysisPages({ competitors }).map((page) => ({
      ...page,
      locked: isLocked("competitor_analysis"),
    })),
  );

  if (includeAiBucketAnswers) {
    pages.push({
      key: "ai_bucket_answers",
      title: "AI Bucket Answers",
      body: (
        <AIBucketAnswersSection
          bucketAnswerSections={bucketAnswerSections}
          onAnswerChange={onAnswerChange}
          onResetAnswers={onResetAnswers}
        />
      ),
      locked: isLocked("ai_bucket_answers"),
      variant: "standard",
    });
  }

  pages.push(
    ...buildCriticalFindingsPages({ findings: displayedFindings }).map((page) => ({
      ...page,
      locked: isLocked("critical_findings"),
    })),
    ...buildQuickWinsRoadmapPages({ vm }).map((page) => ({
      ...page,
      locked: isLocked("quick_wins_roadmap"),
    })),
  );

  pages.push({
    key: "thank_you",
    title: "Thank You",
    body: <ThankYouPageSection vm={vm} />,
    locked: isLocked("thank_you"),
    variant: "cover",
  });

  return pages;
}
