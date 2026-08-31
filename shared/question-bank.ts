import {
  UX_AUDIT_ANSWER_STATES,
  UX_AUDIT_BUCKETS,
  UX_AUDIT_BUCKET_IDS,
  bucketTitleFromQuestion,
  type UXAuditAnswerState,
} from "./ux-audit-core";

export type BucketOption = {
  state: UXAuditAnswerState;
  label: string;
  score: number | null;
  mark: number | null;
  text: string;
};

export type BucketQuestion = {
  id: string;
  section?: string;
  question: string;
  navigate: string;
  options: BucketOption[];
  answer_states: UXAuditAnswerState[];
};

export function formatBucketOption(option: BucketOption) {
  return `${option.label} — ${option.text}`;
}

const QUESTION_OPTIONS: BucketOption[] = UX_AUDIT_ANSWER_STATES.map((option) => ({
  state: option.state,
  label: option.label,
  score: option.score,
  mark: option.score,
  text:
    option.state === "pass"
      ? "Criterion is clearly satisfied"
      : option.state === "partial"
        ? "Criterion is partly satisfied or has meaningful issues"
        : option.state === "fail"
          ? "Clear evidence shows the criterion is not satisfied"
          : option.state === "not_tested"
            ? "Not enough evidence to evaluate"
            : "Criterion does not apply",
}));

function bucketPrefix(bucketName: string) {
  return UX_AUDIT_BUCKET_IDS[bucketName] || "Q";
}

export const QUESTION_BANK: Record<string, BucketQuestion[]> = Object.fromEntries(
  UX_AUDIT_BUCKETS.map((bucket) => [
    bucket.name,
    bucket.questions.map((question, index) => ({
      id: `${bucketPrefix(bucket.name)}${String(index + 1).padStart(2, "0")}`,
      section: question.title,
      question: question.question,
      navigate: `Assess ${question.title.toLowerCase()} using the evidence captured for ${bucket.name}.`,
      options: QUESTION_OPTIONS,
      answer_states: UX_AUDIT_ANSWER_STATES.map((option) => option.state),
    })),
  ]),
) as Record<string, BucketQuestion[]>;

export const QUESTION_BANK_VERSION = "2026-08-31-standardized-core-v1";

export function normalizeBucketName(bucket: string) {
  return bucket in QUESTION_BANK ? bucket : bucket.trim();
}

export function getSelectedBucketQuestions(selectedBuckets: string[]) {
  return selectedBuckets
    .map((bucket) => normalizeBucketName(bucket))
    .filter((bucket, index, buckets) => buckets.indexOf(bucket) === index)
    .flatMap((bucket) => QUESTION_BANK[bucket] || []);
}

export function bucketQuestionTitle(bucketName: string, questionId: string) {
  const question = QUESTION_BANK[bucketName]?.find((item) => item.id === questionId);
  return question ? bucketTitleFromQuestion(question.question) : "Question";
}
