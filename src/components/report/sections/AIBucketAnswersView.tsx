import type { ReactNode } from "react";
import { AIBucketAnswersSection } from "./AIBucketAnswersSection";
import type { AnyRecord } from "@/lib/report-model";

export function AIBucketAnswersView({
  bucketAnswerSections,
  onAnswerChange,
  onResetAnswers,
  onBack,
  onSave,
  saveLabel = "Save Changes",
  saving = false,
  canSave = true,
  canReset = true,
  title = "AI Bucket Answers",
  subtitle = "Edit the question-level answers here, then save to update the report.",
  backLabel = "Back to report",
  extraActions,
}: {
  bucketAnswerSections: AnyRecord[];
  onAnswerChange?: (
    bucketName: string,
    questionId: string,
    selectedOption: number | string,
    userReason?: string,
    userEvidence?: string,
  ) => void;
  onResetAnswers?: () => void;
  onBack: () => void;
  onSave?: () => void | Promise<void>;
  saveLabel?: string;
  saving?: boolean;
  canSave?: boolean;
  canReset?: boolean;
  title?: string;
  subtitle?: string;
  backLabel?: string;
  extraActions?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[color:var(--background)] px-4 pb-32 pt-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div
              className="text-[24px] font-bold leading-normal text-[color:var(--ink)]"
              style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
            >
              {title}
            </div>
            <div className="mt-1 max-w-4xl text-sm text-[color:var(--ink-muted)]">
              {subtitle}
            </div>
          </div>
        </div>

        <div className="rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-white p-5 shadow-sm">
          <AIBucketAnswersSection
            bucketAnswerSections={bucketAnswerSections}
            onAnswerChange={onAnswerChange}
          />
        </div>
      </div>

      <div className="no-print fixed inset-x-4 bottom-4 z-30 mx-auto w-auto max-w-[calc(100%-2rem)] rounded-[var(--radius)] floatingBarShell p-4 shadow-lg shadow-black/10 backdrop-blur sm:inset-x-6 sm:bottom-6 sm:w-[min(1100px,calc(100%-3rem))] sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {extraActions}
            {onResetAnswers ? (
              <button
                type="button"
                className="floatingBarSecondary"
                onClick={onResetAnswers}
                disabled={!canReset}
                aria-disabled={!canReset}
                style={!canReset ? { opacity: 0.5, pointerEvents: "none" } : undefined}
              >
                Reset Answers
              </button>
            ) : null}
            {onSave ? (
              <button
                type="button"
                className="floatingBarPrimary"
                onClick={() => void onSave()}
                disabled={!canSave || saving}
                aria-disabled={!canSave || saving}
                style={!canSave || saving ? { opacity: 0.5, pointerEvents: "none" } : undefined}
              >
                {saving ? `${saveLabel}…` : saveLabel}
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="floatingBarSecondary"
              onClick={onBack}
            >
              {backLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
