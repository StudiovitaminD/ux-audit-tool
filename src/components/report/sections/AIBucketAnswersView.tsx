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
    selectedOption: number,
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
    <div className="min-h-screen bg-[color:var(--background)] px-6 pb-10 pt-6">
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
          <div className="flex flex-wrap items-center gap-3">
            {extraActions}
            <button type="button" className="btnSecondary" onClick={onBack}>
              {backLabel}
            </button>
          </div>
        </div>

        <div className="rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-white p-5 shadow-sm">
          <AIBucketAnswersSection
            bucketAnswerSections={bucketAnswerSections}
            onAnswerChange={onAnswerChange}
          />
        </div>
      </div>
    </div>
  );
}
