import {
  answerStateFromValue,
  getAnswerStateRecord,
  type UXAuditAnswerState,
  type UXAuditPillar,
} from "./ux-audit-core";

export type ScoredAuditQuestion = {
  id: string;
  question?: string;
  answer_status?: string | null;
  answer_state?: UXAuditAnswerState | string | null;
  mark?: number | null;
  selected_option?: number | string | null;
  selected_option_state?: UXAuditAnswerState | string | null;
  evidence?: string;
  observation?: string;
  recommendation?: string;
  effort?: string;
  impact?: string;
  confidence?: number | null;
};

export type ScoredAuditBucket = {
  bucket_name: string;
  pillar: UXAuditPillar | string;
  questions: ScoredAuditQuestion[];
};

export function normalizeAnswerState(value: unknown): UXAuditAnswerState | null {
  return answerStateFromValue(value);
}

export function answerStateToScore(state: UXAuditAnswerState | null | undefined): number | null {
  if (!state) return null;
  return getAnswerStateRecord(state)?.score ?? null;
}

export function isScoreableAnswerState(state: UXAuditAnswerState | null | undefined) {
  return state === "pass" || state === "partial" || state === "fail";
}

export function isApplicableAnswerState(state: UXAuditAnswerState | null | undefined) {
  return state !== null && state !== undefined && state !== "n_a";
}

export function isTestedAnswerState(state: UXAuditAnswerState | null | undefined) {
  return state === "pass" || state === "partial" || state === "fail" || state === "not_tested";
}

export function normalizeQuestionAnswer(question: ScoredAuditQuestion) {
  const answerState =
    normalizeAnswerState(question.answer_state) ||
    normalizeAnswerState(question.selected_option_state) ||
    normalizeAnswerState(question.answer_status) ||
    normalizeAnswerState(question.selected_option) ||
    (question.mark === 1 ? "pass" : question.mark === 0.5 ? "partial" : question.mark === 0 ? "fail" : null);

  const score = answerStateToScore(answerState);
  const selectedOption = score === null ? null : score;
  const answerStatus =
    question.answer_status === "insufficient_evidence" || question.answer_status === "scoring_unavailable"
      ? question.answer_status
      : "answered";

  return {
    ...question,
    answer_status: answerStatus,
    answer_state: answerState,
    selected_option_state: answerState,
    selected_option: selectedOption,
    mark: score,
  };
}

export function scoreQuestions(questions: Array<ScoredAuditQuestion | null | undefined>) {
  const normalized = questions
    .filter(Boolean)
    .map((question) => normalizeQuestionAnswer(question as ScoredAuditQuestion));
  const applicable = normalized.filter((question) => isApplicableAnswerState(question.answer_state as UXAuditAnswerState | null));
  const scoreable = normalized.filter((question) =>
    isScoreableAnswerState(question.answer_state as UXAuditAnswerState | null),
  );
  const scoredCount = scoreable.length;
  const applicableCount = applicable.length;
  if (!scoredCount) {
    return {
      score: null as number | null,
      total_marks: 0,
      max_marks: 0,
      scoredCount,
      applicableCount,
      confidence: applicableCount > 0 ? 0 : null,
      status: "not_tested" as const,
    };
  }

  const totalMarks = scoreable.reduce((sum, question) => sum + (question.mark ?? 0), 0);
  const maxMarks = scoreable.length;
  const score = Math.round((totalMarks / maxMarks) * 100);
  const confidence = applicableCount > 0 ? Math.round((scoredCount / applicableCount) * 100) : null;

  return {
    score,
    total_marks: totalMarks,
    max_marks: maxMarks,
    scoredCount,
    applicableCount,
    confidence,
    status: "scored" as const,
  };
}

export function scoreBuckets(
  buckets: Array<ScoredAuditBucket & { bucket_status?: string | null }>,
) {
  const scoredBuckets = buckets
    .map((bucket) => {
      const questionScore = scoreQuestions(bucket.questions);
      return {
        ...bucket,
        ...questionScore,
        bucket_status:
          questionScore.status === "scored"
            ? "scored"
            : bucket.bucket_status === "scoring_unavailable"
              ? "scoring_unavailable"
              : "not_tested",
      };
    });

  const validBuckets = scoredBuckets.filter((bucket) => bucket.score !== null);
  const overall_score =
    validBuckets.length > 0
      ? Math.round(validBuckets.reduce((sum, bucket) => sum + (bucket.score ?? 0), 0) / validBuckets.length)
      : null;

  const pillarScores = ["Accessibility", "Impact", "Delight"].reduce<Record<string, { score: number | null; evaluated: boolean }>>(
    (acc, pillar) => {
      const relevant = scoredBuckets.filter((bucket) => bucket.pillar === pillar && bucket.score !== null);
      acc[pillar] = relevant.length
        ? {
            score: Math.round(relevant.reduce((sum, bucket) => sum + (bucket.score ?? 0), 0) / relevant.length),
            evaluated: true,
          }
        : { score: null, evaluated: false };
      return acc;
    },
    {},
  );

  const audit_confidence =
    buckets.length > 0
      ? Math.round(
          (scoredBuckets.reduce((sum, bucket) => sum + (bucket.confidence ?? 0), 0) / buckets.length) *
            100,
        ) / 100
      : null;

  return {
    bucketResults: scoredBuckets,
    overall_score,
    pillar_scores: pillarScores,
    audit_confidence,
  };
}
