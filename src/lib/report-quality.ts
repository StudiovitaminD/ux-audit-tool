import { QUESTION_BANK } from "@/lib/question-bank";
import {
  normalizeQuestionAnswer,
  scoreQuestions,
  validateAnswerSemantics,
  type ScoredAuditQuestion,
} from "../../shared/ux-audit-scoring";

export type ReportQualityIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  bucket?: string;
  questionId?: string;
};

export type ReportQualityResult = {
  valid: boolean;
  errors: ReportQualityIssue[];
  warnings: ReportQualityIssue[];
  checkedAt: string;
};

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: unknown) {
  return asString(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const canonicalBuckets = Object.keys(QUESTION_BANK);
const canonicalBucketByKey = new Map(canonicalBuckets.map((bucket) => [normalizeKey(bucket), bucket]));

function canonicalBucket(value: unknown) {
  const raw = asString(value);
  if (!raw) return "";
  return canonicalBucketByKey.get(normalizeKey(raw)) || raw;
}

function selectedBucketList(report: AnyRecord) {
  const intake = asRecord(report.intake) ?? {};
  const source = asArray(intake.selected_buckets).length
    ? asArray(intake.selected_buckets)
    : asArray(intake.selectedBuckets).length
      ? asArray(intake.selectedBuckets)
      : asArray(report.selected_buckets).length
        ? asArray(report.selected_buckets)
        : asArray(report.selectedBuckets);
  const selected = source.map(canonicalBucket).filter(Boolean);
  return Array.from(new Set(selected));
}

function questionState(question: AnyRecord) {
  const normalized = normalizeQuestionAnswer(question as ScoredAuditQuestion);
  return asString(normalized.answer_state);
}

function isCoverageLimitation(value: unknown) {
  return /\b(not tested|not observed|not captured|insufficient evidence|without (?:visible |direct )?evidence|unable to (?:assess|evaluate|verify|determine)|cannot (?:assess|evaluate|verify|determine)|could not (?:assess|evaluate|verify|determine)|no evidence|evidence (?:is|was) missing|scoring unavailable)\b/i.test(
    asString(value),
  );
}

function hasEvidence(question: AnyRecord) {
  const evidence = asString(question.evidence);
  return Boolean(evidence && !isCoverageLimitation(evidence));
}

function uniqueRecords(records: AnyRecord[], key: (record: AnyRecord) => string) {
  const seen = new Set<string>();
  return records.filter((record) => {
    const recordKey = key(record);
    if (!recordKey || seen.has(recordKey)) return false;
    seen.add(recordKey);
    return true;
  });
}

function healthForScore(score: number | null) {
  if (score === null) return { health: "Not tested", risk: "Evidence missing", priority: "P0" };
  if (score < 50) return { health: "Critical", risk: "High", priority: "P1" };
  if (score < 80) return { health: "Average", risk: "Medium", priority: "P2" };
  return { health: "Good", risk: "Low", priority: "P3" };
}

function sanitizeQuestion(questionValue: unknown): AnyRecord {
  const question = asRecord(questionValue) ?? {};
  const normalized = validateAnswerSemantics(
    normalizeQuestionAnswer(question as ScoredAuditQuestion),
  ) as AnyRecord;
  const state = questionState(normalized);
  const untested =
    state === "not_tested" ||
    state === "n_a" ||
    asString(normalized.answer_status) === "insufficient_evidence" ||
    asString(normalized.answer_status) === "scoring_unavailable" ||
    isCoverageLimitation(`${asString(normalized.evidence)} ${asString(normalized.observation)}`) ||
    !hasEvidence(normalized);

  if (untested) {
    return {
      ...normalized,
      answer_state: state === "n_a" ? "n_a" : "not_tested",
      selected_option_state: state === "n_a" ? "n_a" : "not_tested",
      answer_status:
        asString(normalized.answer_status) === "scoring_unavailable"
          ? "scoring_unavailable"
          : "insufficient_evidence",
      mark: null,
      selected_option: null,
      confidence: 0,
    };
  }

  return {
    ...normalized,
    answer_status: "answered",
  };
}

function findingText(finding: AnyRecord) {
  return (
    asString(finding.what_we_found) ||
    asString(finding.observation) ||
    asString(finding.finding) ||
    asString(finding.title) ||
    asString(finding.question)
  );
}

function findingEvidence(finding: AnyRecord) {
  const evidence = Array.isArray(finding.evidence)
    ? finding.evidence.map(asString).filter(Boolean).join(" ")
    : asString(finding.evidence);
  return evidence;
}

function sanitizeBucket(bucketValue: unknown, selected: Set<string>): AnyRecord | null {
  const bucket = asRecord(bucketValue) ?? {};
  const bucketName = canonicalBucket(
    bucket.bucket_name || bucket.section || bucket.bucket || bucket.name,
  );
  if (!bucketName || (selected.size && !selected.has(normalizeKey(bucketName)))) return null;

  const questions = asArray(bucket.questions).map(sanitizeQuestion);
  const scoring = scoreQuestions(questions as ScoredAuditQuestion[]);
  const score = scoring.score === null ? null : Math.round(scoring.score);
  const status = score === null ? "not_tested" : "scored";
  const health = healthForScore(score);
  const questionById = new Map(
    questions.map((question) => [asString(question.id), question]),
  );

  const findings = uniqueRecords(
    asArray(bucket.findings)
      .map((item) => asRecord(item) ?? {})
      .filter((finding) => {
        const questionId = asString(finding.question_id || finding.questionId);
        const question = questionById.get(questionId);
        const state = question ? questionState(question) : "";
        const evidence = findingEvidence(finding) || (question ? asString(question.evidence) : "");
        const confirmedQuestion = state === "fail" || state === "partial";
        const verifiedSpecialist =
          questionId === "specialist_review" &&
          asString(finding.source).startsWith("specialist_") &&
          Number(finding.confidence || 0) > 0;
        return (
          Boolean(findingText(finding)) &&
          Boolean(evidence) &&
          !isCoverageLimitation(`${findingText(finding)} ${evidence}`) &&
          (confirmedQuestion || verifiedSpecialist)
        );
      })
      .map((finding) => ({ ...finding, bucket: bucketName })),
    (finding) =>
      `${normalizeKey(finding.question_id || finding.questionId)}:${normalizeKey(findingText(finding))}`,
  );

  const improvements = uniqueRecords(
    asArray(bucket.improvements)
      .map((item) => asRecord(item) ?? {})
      .filter((improvement) => {
        const question = questionById.get(asString(improvement.question_id || improvement.questionId));
        return Boolean(question && questionState(question) === "partial" && hasEvidence(question));
      })
      .map((improvement) => ({ ...improvement, bucket: bucketName })),
    (improvement) =>
      `${normalizeKey(improvement.question_id || improvement.questionId)}:${normalizeKey(
        improvement.recommendation || improvement.observation,
      )}`,
  );

  const limitations = questions
    .filter((question) => {
      const state = questionState(question);
      return state === "not_tested" || asString(question.answer_status) === "scoring_unavailable";
    })
    .map((question) => ({
      bucket: bucketName,
      question_id: asString(question.id),
      question: asString(question.question),
      reason:
        asString(question.observation) ||
        asString(question.evidence) ||
        "The required evidence was not captured.",
      missing_evidence: asArray(question.missing_evidence).map(asString).filter(Boolean),
    }));

  const strengthItems = questions
    .filter((question) => questionState(question) === "pass")
    .map((question) => asString(question.observation) || asString(question.evidence))
    .filter(Boolean);
  const problemItems = findings.map(findingText).filter(Boolean);

  return {
    ...bucket,
    bucket_name: bucketName,
    section: bucketName,
    score,
    total_marks: scoring.total_marks,
    max_marks: scoring.max_marks,
    bucket_status: status,
    audit_confidence: scoring.confidence,
    health: health.health,
    risk: health.risk,
    priority: health.priority,
    questions,
    findings,
    improvements,
    testing_limitations: limitations,
    score_rationale: {
      ...(asRecord(bucket.score_rationale) ?? {}),
      what_is_working: Array.from(new Set(strengthItems)).slice(0, 4),
      what_is_risky: Array.from(new Set(problemItems)).slice(0, 4),
    },
  };
}

export function validateReportQuality(reportValue: unknown): ReportQualityResult {
  const report = asRecord(reportValue) ?? {};
  const errors: ReportQualityIssue[] = [];
  const warnings: ReportQualityIssue[] = [];
  const selected = new Set(selectedBucketList(report).map(normalizeKey));
  const buckets = asArray(report.bucket_results).map((item) => asRecord(item) ?? {});

  for (const bucket of buckets) {
    const bucketName = canonicalBucket(bucket.bucket_name || bucket.section || bucket.bucket);
    if (selected.size && !selected.has(normalizeKey(bucketName))) {
      errors.push({ code: "UNSELECTED_BUCKET", severity: "error", bucket: bucketName, message: `${bucketName} was not selected for this audit.` });
    }
    const scoring = scoreQuestions(asArray(bucket.questions) as ScoredAuditQuestion[]);
    const displayedScore = typeof bucket.score === "number" ? bucket.score : null;
    const expectedScore = scoring.score === null ? null : Math.round(scoring.score);
    if (displayedScore !== expectedScore) {
      errors.push({ code: "SCORE_MISMATCH", severity: "error", bucket: bucketName, message: `${bucketName} score does not match its tested questions.` });
    }
    for (const findingValue of asArray(bucket.findings)) {
      const finding = asRecord(findingValue) ?? {};
      if (isCoverageLimitation(`${findingText(finding)} ${findingEvidence(finding)}`)) {
        errors.push({ code: "LIMITATION_AS_FINDING", severity: "error", bucket: bucketName, message: `${bucketName} contains a testing limitation as a finding.` });
      }
      if (!findingEvidence(finding)) {
        errors.push({ code: "FINDING_WITHOUT_EVIDENCE", severity: "error", bucket: bucketName, message: `${bucketName} contains a finding without evidence.` });
      }
    }
    for (const questionValue of asArray(bucket.questions)) {
      const question = asRecord(questionValue) ?? {};
      const state = questionState(question);
      if (
        (state === "pass" || state === "partial" || state === "fail") &&
        asArray(question.evidence_ids).map(asString).filter(Boolean).length === 0
      ) {
        errors.push({
          code: "SCORED_QUESTION_WITHOUT_EVIDENCE_ID",
          severity: "error",
          bucket: bucketName,
          questionId: asString(question.id),
          message: `${bucketName} contains a scored question without a traceable evidence ID.`,
        });
      }
    }
    if (expectedScore !== null && (scoring.confidence ?? 0) < 50) {
      warnings.push({ code: "LOW_COVERAGE_SCORE", severity: "warning", bucket: bucketName, message: `${bucketName} has a score with less than 50% question coverage.` });
    }
  }

  const competitorContainer = asRecord(report.competitor_analysis) ?? {};
  for (const competitorValue of asArray(competitorContainer.competitors || report.competitors)) {
    const competitor = asRecord(competitorValue) ?? {};
    const name = asString(competitor.name) || asString(competitor.url) || "Competitor";
    if (!asString(competitor.url || competitor.source_url)) {
      warnings.push({ code: "COMPETITOR_WITHOUT_SOURCE", severity: "warning", message: `${name} has no source URL.` });
    }
    if (!asString(competitor.captured_at)) {
      warnings.push({ code: "COMPETITOR_FRESHNESS_UNKNOWN", severity: "warning", message: `${name} has no evidence capture timestamp.` });
    }
    if (asString(competitor.warning) || asString(competitor.evidence_status) === "unavailable") {
      warnings.push({ code: "COMPETITOR_CAPTURE_INCOMPLETE", severity: "warning", message: `${name} could not be fully verified from a live capture.` });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}

export function sanitizeAuditReport(reportValue: unknown): AnyRecord {
  const report = asRecord(reportValue) ?? {};
  const requestedBuckets = selectedBucketList(report);
  const selectedNames = requestedBuckets.length
    ? requestedBuckets
    : asArray(report.bucket_results)
        .map((bucket) => {
          const record = asRecord(bucket) ?? {};
          return canonicalBucket(record.bucket_name || record.section || record.bucket);
        })
        .filter(Boolean);
  const selected = new Set(selectedNames.map(normalizeKey));
  const buckets = asArray(report.bucket_results)
    .map((bucket) => sanitizeBucket(bucket, selected))
    .filter((bucket): bucket is AnyRecord => Boolean(bucket));
  const scoredBuckets = buckets.filter((bucket) => typeof bucket.score === "number");
  const overallScore = scoredBuckets.length
    ? Math.round(
        scoredBuckets.reduce((sum, bucket) => sum + Number(bucket.score), 0) /
          scoredBuckets.length,
      )
    : null;
  const confidence = buckets.length
    ? Math.round(
        buckets.reduce((sum, bucket) => sum + Number(bucket.audit_confidence || 0), 0) /
          buckets.length,
      )
    : null;
  const findings = buckets.flatMap((bucket) => asArray(bucket.findings));
  const limitations = buckets.flatMap((bucket) => asArray(bucket.testing_limitations));
  const scorecard = buckets.map((bucket) => ({
    section: bucket.bucket_name,
    bucket_name: bucket.bucket_name,
    pillar: bucket.pillar,
    score: bucket.score,
    health: bucket.health,
    risk: bucket.risk,
    priority: bucket.priority,
  }));

  const sanitized = {
    ...report,
    selected_buckets: selectedNames,
    selectedBuckets: selectedNames,
    bucket_results: buckets,
    scorecard,
    findings_detailed: findings,
    all_findings: findings,
    testing_limitations: limitations,
    overall_score: overallScore,
    audit_confidence: confidence,
    questions_scoreable: buckets.reduce(
      (sum, bucket) =>
        sum +
        asArray(bucket.questions).filter((question) => {
          const state = questionState(asRecord(question) ?? {});
          return state === "pass" || state === "partial" || state === "fail";
        }).length,
      0,
    ),
    questions_total: buckets.reduce((sum, bucket) => sum + asArray(bucket.questions).length, 0),
  };
  return { ...sanitized, report_quality: validateReportQuality(sanitized) };
}

export function exportReadinessResponse(reportValue: unknown) {
  const report = sanitizeAuditReport(reportValue);
  const quality = report.report_quality as ReportQualityResult;
  const review = asRecord(report.review) ?? {};
  const reviewStatus = asString(review.status) || "pending";
  return {
    report,
    quality,
    reviewStatus,
    exportReady: quality.valid && reviewStatus === "approved",
  };
}
