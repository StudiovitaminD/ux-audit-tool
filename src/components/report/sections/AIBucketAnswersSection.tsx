import { asString, type AnyRecord } from "@/lib/report-model";
import { BucketAnswersCard } from "./shared";

export function AIBucketAnswersSection({
  bucketAnswerSections,
  onAnswerChange,
  onResetAnswers,
}: {
  bucketAnswerSections: AnyRecord[];
  onAnswerChange?: (
    bucketName: string,
    questionId: string,
    selectedOption: number,
    userReason?: string,
    userEvidence?: string,
  ) => void;
  onResetAnswers?: () => void;
}) {
  const handleResetAnswers = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Reset all edited answers back to the original audit results?")
    ) {
      return;
    }
    onResetAnswers?.();
  };

  return (
    <div className="space-y-5">
      <div
        className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5"
        data-report-section
      >
        <div className="text-sm font-semibold">How the AI answered each audit bucket</div>
        <div className="mt-2 text-sm text-[color:var(--ink-muted)]">
          This editor shows the question-by-question answers, evidence, and observations generated
          during the audit.
        </div>
        {onAnswerChange ? (
          <div className="mt-2 text-sm text-[color:var(--ink-muted)]">
            You can change any answer below and the bucket scores, findings, pillar scores, and
            overall report score will update automatically.
          </div>
        ) : null}
        {onResetAnswers ? (
          <div className="mt-4">
            <button
              type="button"
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
              onClick={handleResetAnswers}
            >
              Reset Answers
            </button>
          </div>
        ) : null}
      </div>

      {bucketAnswerSections.length ? (
        <div className="space-y-5">
          {bucketAnswerSections.map((bucket, index) => (
            <BucketAnswersCard
              key={`${asString(bucket.bucket_name || bucket.section || bucket.bucket)}-${index}`}
              bucket={bucket}
              onAnswerChange={onAnswerChange}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5 text-sm text-[color:var(--ink-muted)]">
          No question-level AI answers were captured.
        </div>
      )}
    </div>
  );
}
