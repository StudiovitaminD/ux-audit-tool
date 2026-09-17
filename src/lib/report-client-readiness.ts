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
};

export function buildEvidenceAppendix(reportValue: unknown): EvidenceAppendixItem[] {
  const report = record(reportValue);
  const items: EvidenceAppendixItem[] = [];
  for (const bucketValue of array(report.bucket_results)) {
    const bucket = record(bucketValue);
    const bucketName = text(bucket.bucket_name || bucket.section || bucket.bucket);
    for (const questionValue of array(bucket.questions)) {
      const question = record(questionValue);
      for (const evidenceIdValue of array(question.evidence_ids)) {
        const evidenceId = text(evidenceIdValue);
        if (!evidenceId) continue;
        items.push({
          evidenceId,
          bucket: bucketName,
          questionId: text(question.id),
          question: text(question.question),
          evidence: text(question.evidence),
          observation: text(question.observation),
          confidence: Number(question.confidence) || 0,
        });
      }
    }
  }
  return items.filter((item, index) => items.findIndex((candidate) => candidate.evidenceId === item.evidenceId) === index);
}

export function buildMethodology(reportValue: unknown) {
  const report = record(reportValue);
  const intake = record(report.intake);
  const coverage = record(report.capture_coverage || report.captureCoverage);
  return {
    framework: "Selected UX audit criteria are evaluated from captured browser, DOM, interaction, screenshot, and timing evidence. Unsupported criteria are excluded from scoring.",
    selectedBuckets: array(report.selected_buckets || intake.selected_buckets).map(text).filter(Boolean),
    productUrl: text(report.product_url || intake.product_url),
    captureStatus: text(report.coverage_status || coverage.status) || "Unknown",
    testedPages: array(coverage.whatWasCaptured || coverage.what_was_captured).map(text).filter(Boolean),
    missingCoverage: array(coverage.whatWasMissing || coverage.what_was_missing).map(text).filter(Boolean),
    questionsTotal: Number(report.questions_total) || 0,
    questionsScoreable: Number(report.questions_scoreable) || 0,
    generatedAt: text(report.generated_at) || new Date().toISOString(),
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
