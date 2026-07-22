import { asString, type AnyRecord, type ReportViewModel } from "@/lib/report-model";
import { OverviewSection } from "./sections/OverviewSection";
import { ExecutiveSummarySection } from "./sections/ExecutiveSummarySection";
import { NarrativeSummarySection } from "./sections/NarrativeSummarySection";
import { CompetitorAnalysisSection } from "./sections/CompetitorAnalysisSection";
import { AIBucketAnswersSection } from "./sections/AIBucketAnswersSection";
import { FindingsSection } from "./sections/FindingsSection";
import { QuickWinsRoadmapSection } from "./sections/QuickWinsRoadmapSection";
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
    (bucket) => Array.isArray(bucket.questions) && bucket.questions.length,
  );
  const competitors = hydratedCompetitors;

  const pages: ReportPage[] = [
    {
      key: "overview",
      title: "Overview",
      body: <OverviewSection vm={vm} />,
      locked: isLocked("overview"),
    },
    {
      key: "executive_summary",
      title: "Executive Summary",
      body: <ExecutiveSummarySection vm={vm} />,
      locked: isLocked("executive_summary"),
    },
    {
      key: "narrative_summary",
      title: "Narrative Summary",
      body: <NarrativeSummarySection vm={vm} />,
      locked: isLocked("narrative_summary"),
    },
    {
      key: "competitor_analysis",
      title: "Competitor Analysis",
      body: <CompetitorAnalysisSection competitors={competitors} />,
      locked: isLocked("competitor_analysis"),
    },
  ];

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
    });
  }

  pages.push(
    {
      key: "critical_findings",
      title: "Critical Findings",
      body: <FindingsSection findings={displayedFindings} />,
      locked: isLocked("critical_findings"),
    },
    {
      key: "quick_wins_roadmap",
      title: "Quick Wins & Roadmap",
      body: <QuickWinsRoadmapSection vm={vm} />,
      locked: isLocked("quick_wins_roadmap"),
    },
  );

  return pages;
}
