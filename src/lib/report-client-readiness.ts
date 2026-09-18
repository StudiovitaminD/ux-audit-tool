import { validateReportQuality, type ReportQualityResult } from "@/lib/report-quality";

type AnyRecord = Record<string, unknown>;

function record(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export type EvidenceAppendixItem = {
  evidenceId: string;
  bucket: string;
  questionId: string;
  question: string;
  evidence: string;
  observation: string;
  confidence: number;
  sourceUrl: string;
  viewport: string;
  testMethod: string;
  status: string;
  observedAt: string;
  screenshotUrl: string;
  measuredValues: Record<string, number | string | boolean>;
};

export function buildEvidenceAppendix(reportValue: unknown): EvidenceAppendixItem[] {
  const report = record(reportValue);
  const items: EvidenceAppendixItem[] = [];
  const nestedEvidence = record(report.evidence);
  const registryRecords = array(report.evidence_registry).length
    ? array(report.evidence_registry)
    : array(nestedEvidence.evidenceRecords);
  const registry = new Map(
    registryRecords
      .map(record)
      .map((item) => [text(item.evidenceId || item.evidence_id), item] as const)
      .filter(([id]) => Boolean(id)),
  );
  for (const bucketValue of array(report.bucket_results)) {
    const bucket = record(bucketValue);
    const bucketName = text(bucket.bucket_name || bucket.section || bucket.bucket);
    for (const questionValue of array(bucket.questions)) {
      const question = record(questionValue);
      const state = text(question.answer_state || question.selected_option_state);
      if (!["pass", "partial", "fail"].includes(state)) continue;
      const evidenceIds = array(question.evidence_ids).map(text).filter(Boolean);
      for (const evidenceId of evidenceIds) {
        const source = registry.get(evidenceId) || {};
        items.push({
          evidenceId,
          bucket: bucketName,
          questionId: text(question.id),
          question: text(question.question),
          evidence: text(question.evidence),
          observation: text(source.observation) || text(question.observation),
          confidence: Number(question.confidence) || 0,
          sourceUrl: text(source.pageUrl || source.page_url),
          viewport: text(source.viewport),
          testMethod: text(source.testMethod || source.test_method) || "captured_evidence",
          status: text(source.status) || "confirmed",
          observedAt: text(source.observedAt || source.observed_at),
          screenshotUrl: text(source.screenshotUrl || source.screenshot_url),
          measuredValues: record(source.measuredValues || source.measured_values) as Record<string, number | string | boolean>,
        });
      }
    }
  }
  return items
    .filter(
      (item, index) =>
        items.findIndex((candidate) => candidate.evidenceId === item.evidenceId) === index,
    )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 60);
}

export function buildMethodology(reportValue: unknown) {
  const report = record(reportValue);
  const intake = record(report.intake);
  const coverage = record(report.capture_coverage || report.captureCoverage);
  const evidenceCoverage = record(report.evidence_coverage);
  return {
    framework: "Selected UX audit criteria are evaluated from captured browser, DOM, interaction, screenshot, and timing evidence. Criteria without sufficient evidence are marked Not Tested, score 0 under the selected scoring policy, and are listed separately as testing limitations rather than product defects.",
    selectedBuckets: array(report.selected_buckets || intake.selected_buckets).map(text).filter(Boolean),
    productUrl: text(report.product_url || intake.product_url),
    captureStatus: text(report.coverage_status || coverage.status) || "Unknown",
    testedPages: array(coverage.whatWasCaptured || coverage.what_was_captured).map(text).filter(Boolean),
    missingCoverage: array(coverage.whatWasMissing || coverage.what_was_missing).map(text).filter(Boolean),
    questionsTotal: Number(report.questions_total) || 0,
    questionsScoreable: Number(report.questions_scoreable) || 0,
    generatedAt: text(report.generated_at) || new Date().toISOString(),
    evidenceTotal: Number(evidenceCoverage.total) || 0,
    evidenceConfirmed: Number(evidenceCoverage.confirmed) || 0,
    evidenceCoveragePercent: Number(evidenceCoverage.percent) || 0,
  };
}

export function buildClientReadiness(reportValue: unknown) {
  const report = record(reportValue);
  const quality = validateReportQuality(report);
  const appendix = buildEvidenceAppendix(report);
  const review = record(report.review);
  const status = text(review.status) || "pending";
  const scoredQuestions = array(report.bucket_results).flatMap((bucket) => array(record(bucket).questions))
    .map(record)
    .filter((question) => ["pass", "partial", "fail"].includes(text(question.answer_state)));
  const questionsWithoutEvidenceIds = scoredQuestions.filter((question) => array(question.evidence_ids).length === 0).length;
  const qa: ReportQualityResult & { questionsWithoutEvidenceIds: number; evidenceItems: number } = {
    ...quality,
    questionsWithoutEvidenceIds,
    evidenceItems: appendix.length,
  };
  return {
    methodology: buildMethodology(report),
    evidenceAppendix: appendix,
    review: {
      status,
      reviewer: text(review.reviewer),
      reviewedAt: text(review.reviewedAt || review.reviewed_at),
      note: text(review.note),
    },
    qa,
    exportReady: quality.valid && questionsWithoutEvidenceIds === 0 && status === "approved",
  };
}
