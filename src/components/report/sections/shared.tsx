import type { ReactNode } from "react";
import { QUESTION_BANK } from "../../../../worker/src/question-bank";
import { asString, displayBucketName, stringifyValue, type AnyRecord } from "@/lib/report-model";

export function normalizeList(value: unknown, limit = 8) {
  const cleanItem = (item: unknown) =>
    stringifyValue(item)
      .replace(/^\s*[-•]\s*/g, "")
      .replace(/\s*\n\s*/g, " ")
      .replace(/\s*(?:\.{3,}|…)\s*$/, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  if (Array.isArray(value)) return value.map(cleanItem).filter(Boolean).slice(0, limit);
  return String(value ?? "")
    .split(/\n|\r|\u2022|\u2023|\u25E6|\u2027/)
    .map((item) => cleanItem(item))
    .filter(Boolean)
    .slice(0, limit);
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[color:var(--cream-dark)] bg-[color:var(--cream)] px-2.5 py-1 text-xs text-[color:var(--ink-muted)] print-color-adjust">
      {children}
    </span>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="text-sm font-semibold tracking-tight">{children}</div>;
}

export function Subtle({ children }: { children: ReactNode }) {
  return <div className="text-sm text-[color:var(--ink-muted)]">{children}</div>;
}

type CalloutTone = "issue" | "effect" | "solution";

export function Callout({
  children,
  tone = "issue",
}: {
  children: ReactNode;
  tone?: CalloutTone;
}) {
  return (
    <div className="text-sm font-medium leading-7 text-[color:var(--ink)]">
      {children}
    </div>
  );
}

export function BulletList({ items, emptyLabel }: { items: unknown; emptyLabel: string }) {
  const values = normalizeList(items, 8);
  if (!values.length) {
    return <div className="text-sm text-[color:var(--ink-muted)]">{emptyLabel}</div>;
  }

  return (
    <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-[color:var(--muted)]">
      {values.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function placeholderText(value: unknown) {
  const text = asString(value).trim().toLowerCase();
  if (!text) return true;
  return /cannot be answered reliably|could not be scored|required screen or interaction was not captured|required evidence was not captured|not available|not captured/i.test(
    text,
  );
}

function promptLikeText(value: unknown, questionText: unknown) {
  const candidate = asString(value).trim().toLowerCase();
  const prompt = asString(questionText).trim().toLowerCase();
  if (!candidate || !prompt) return false;
  return candidate === prompt || candidate === prompt.replace(/\?$/, "");
}

function selectedOptionTextForQuestion(bucketName: string, question: Record<string, unknown>) {
  const questionId = asString(question.id);
  const questionLabel = asString(question.question);
  const selectedText = asString(question.selected_option_text).replace(/^\s*\d+\.\s*/, "").trim();
  if (selectedText && !placeholderText(selectedText)) return selectedText;

  const selectedMark = Number(asString(question.selected_option || question.mark));
  const options = lookupQuestionOptions(bucketName, questionId);
  const matched = options.find((option) => Number(option.mark) === selectedMark);
  if (matched?.text) return matched.text.trim();
  const observation = asString(question.observation);
  if (observation && !placeholderText(observation) && !promptLikeText(observation, questionLabel)) {
    return observation.trim();
  }
  const evidence = asString(question.evidence);
  if (evidence && !placeholderText(evidence) && !promptLikeText(evidence, questionLabel)) {
    return evidence.trim();
  }
  return "";
}

function fallbackQuestionConclusion(question: Record<string, unknown>, answerStatus: string) {
  const questionText = asString(question.question).toLowerCase();
  const selectedOptionText = selectedOptionTextForQuestion(asString(question.bucket_name) || "", question);
  const missingEvidence = normalizeList(question.missing_evidence, 4);
  const baseObservation = asString(question.observation);
  const selectedLabel = selectedOptionText.replace(/^\s*\d+\.\s*/, "").trim();
  if (selectedLabel && !placeholderText(selectedLabel)) {
    const followUpHint = missingEvidence.length
      ? ` Missing evidence: ${missingEvidence.join(" • ")}.`
      : "";
    return `${selectedLabel}.${followUpHint}`;
  }
  if (!placeholderText(baseObservation)) return baseObservation;

  const followUpHint = missingEvidence.length
    ? ` Missing evidence: ${missingEvidence.join(" • ")}.`
    : "";

  if (questionText.includes("keyboard-only") || questionText.includes("without a mouse")) {
    return `The current capture does not prove keyboard-only completion yet, so treat this as a follow-up verification item rather than a confirmed blocker.${followUpHint}`;
  }
  if (questionText.includes("focus states")) {
    return `Visible focus states still need to be confirmed with a keyboard pass, because this capture does not show the full tabbing experience.${followUpHint}`;
  }
  if (questionText.includes("persistent visible labels") || questionText.includes("labels")) {
    return `The available screens suggest labels should stay visible, but the form behavior should still be checked after input to confirm the label pattern holds.${followUpHint}`;
  }
  if (questionText.includes("inline") || questionText.includes("validation") || questionText.includes("errors")) {
    return `The form-related evidence points to a likely validation or feedback opportunity, but the exact error-state behavior should be verified in a real submission pass.${followUpHint}`;
  }
  if (questionText.includes("preserved") || questionText.includes("retain")) {
    return `The capture does not prove input preservation yet, so the safest conclusion is to verify whether values remain intact after an error state.${followUpHint}`;
  }
  if (questionText.includes("loading") || questionText.includes("success") || questionText.includes("empty")) {
    return `The available evidence is not enough to confirm all system states, so this should be treated as a likely clarity gap until the missing states are captured.${followUpHint}`;
  }

  const questionLabel = asString(question.question);
  if (questionLabel) {
    return `This capture only supports a directional answer for “${questionLabel.replace(/\?$/, "")}”, so a follow-up pass should confirm the detail.${followUpHint}`;
  }

  return `The available evidence is limited here, so the safest conclusion is to confirm this interaction in a follow-up pass.${followUpHint}`;
}

export function ScorePill({ value }: { value: unknown }) {
  const score = stringifyValue(value);
  if (!score) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-[color:var(--card-border)] bg-white/5 px-2 py-0.5 text-xs text-[color:var(--ink-muted)] print-color-adjust">
      Score: {score}
    </span>
  );
}

export function priorityRank(value: unknown) {
  const priority = asString(value).toUpperCase();
  if (priority === "P1") return 1;
  if (priority === "P2") return 2;
  if (priority === "P3") return 3;
  if (priority === "P4") return 4;
  return 99;
}

function lookupQuestionOptions(bucketName: string, questionId: string) {
  const byBucket = QUESTION_BANK[bucketName] || [];
  const exact = byBucket.find((item) => item.id === questionId);
  if (exact?.options?.length) return exact.options;

  for (const questions of Object.values(QUESTION_BANK)) {
    const found = questions.find((item) => item.id === questionId);
    if (found?.options?.length) return found.options;
  }

  return [];
}

export function BucketAnswersCard({
  bucket,
  onAnswerChange,
}: {
  bucket: Record<string, unknown>;
  onAnswerChange?: (
    bucketName: string,
    questionId: string,
    selectedOption: number,
    userReason?: string,
    userEvidence?: string,
  ) => void;
}) {
  const bucketName =
    asString(bucket?.bucket_name) || asString(bucket?.section) || asString(bucket?.bucket) || "Bucket";
  const questions = bucket && Array.isArray(bucket.questions)
    ? bucket.questions
        .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
        .filter(Boolean) as Array<Record<string, unknown>>
    : [];
  return (
    <div
      className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5"
      data-report-section
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold">{displayBucketName(bucketName)}</div>
          <div className="mt-1 text-sm text-[color:var(--ink-muted)]">
            AI question-by-question reasoning for this bucket
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {asString(bucket?.pillar) ? <Pill>{asString(bucket?.pillar)}</Pill> : null}
          {asString(bucket?.priority) ? <Pill>{asString(bucket?.priority)}</Pill> : null}
          <Pill>{asString(bucket?.score) ? `${asString(bucket?.score)}/100` : "Not scored"}</Pill>
        </div>
      </div>

      {questions.length ? (
        <div className="mt-4 space-y-4">
          {questions.map((question, index) => {
            const questionId = asString(question.id);
            const bucketName =
              asString(bucket?.bucket_name) || asString(bucket?.section) || asString(bucket?.bucket) || "Bucket";
            const answerStatus = asString(question.answer_status);
            const selectedOption = asString(question.selected_option);
            const selectedMark = asString(question.mark || question.selected_option);
            const options = lookupQuestionOptions(bucketName, questionId);
            const selectedOptionText =
              selectedOptionTextForQuestion(bucketName, question) ||
              fallbackQuestionConclusion(question, answerStatus);
            const isInsufficient = answerStatus === "insufficient_evidence";
            const isScoringUnavailable = answerStatus === "scoring_unavailable";
            const isNotScored = isInsufficient || isScoringUnavailable;
            const scoreLabel = isInsufficient
              ? "No score"
              : isScoringUnavailable
                ? "Scoring unavailable"
                : asString(question.mark || question.selected_option)
                  ? `${asString(question.mark || question.selected_option)}/100`
                  : "Not scored";

            return (
              <div
                key={`${bucketName}-${questionId || index}`}
                className="print-avoid-break rounded-xl border border-[color:var(--card-border)] bg-white/5 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="text-sm font-semibold text-[color:var(--ink)]">
                    {index + 1}. {asString(question.question) || "Question"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isInsufficient ? <Pill>Status: No score</Pill> : null}
                    {isScoringUnavailable ? <Pill>Status: Scoring unavailable</Pill> : null}
                    {selectedOptionText ? (
                      <span className="inline-flex items-center rounded-full border border-[color:var(--card-border)] bg-white/5 px-2 py-0.5 text-xs text-[color:var(--ink-muted)] print-color-adjust">
                        Answer: {selectedOptionText}
                      </span>
                    ) : null}
                    {isNotScored ? <Pill>Score: {scoreLabel}</Pill> : null}
                  </div>
                </div>

                {options.length ? (
                  <div className="mt-3">
                    {onAnswerChange && questionId ? (
                      <label className="mb-4 block text-sm">
                        <div className="mb-1 font-medium text-[color:var(--ink-muted)]">
                          {isNotScored ? "Select answer" : "Change answer"}
                        </div>
                        <select
                          className="w-full rounded-lg border-2 border-emerald-600 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 shadow-[0_0_0_2px_rgba(16,185,129,0.08)]"
                          value={selectedMark || selectedOption || ""}
                          onChange={(event) =>
                            event.target.value
                              ? onAnswerChange(
                                  bucketName,
                                  questionId,
                                  Number(event.target.value),
                                  asString(question.user_reason) || asString(question.observation),
                                  asString(question.user_evidence) || asString(question.evidence),
                                )
                              : undefined
                          }
                        >
                          <option value="" disabled>
                            Select an answer
                          </option>
                          {options.map((option) => (
                            <option key={`${questionId}-select-${option.mark}`} value={option.mark}>
                              {option.mark}. {option.text}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : !isNotScored ? (
                      <div className="rounded-lg border-2 border-emerald-600 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 shadow-[0_0_0_2px_rgba(16,185,129,0.08)]">
                        {(() => {
                          const active = options.find(
                            (option) =>
                              String(option.mark) === selectedOption ||
                              String(option.mark) === selectedMark,
                          );
                          return active ? `${active.mark}. ${active.text}` : "No selected option";
                        })()}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {isNotScored ? (
                  <div className="mt-4 rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-4 text-sm text-amber-900 print-color-adjust">
                    <div className="font-medium">Best available conclusion</div>
                    <div className="mt-1">
                      {fallbackQuestionConclusion(question, answerStatus) ||
                        (isScoringUnavailable
                          ? "This question could not be scored because the audit model failed before producing a usable answer."
                          : "The available evidence is limited here, so the safest next step is a follow-up verification pass.")}
                    </div>
                  </div>
                ) : null}

                {!isNotScored ? (
                  <div className="mt-5">
                    <div className="text-sm font-semibold tracking-tight text-[color:var(--ink)]">
                      Evidence
                    </div>
                    {onAnswerChange && questionId ? (
                      <textarea
                        className="mt-2 min-h-[92px] w-full rounded-lg border border-[color:var(--card-border)] bg-white px-[5px] py-[5px] text-sm text-[color:var(--ink)]"
                        defaultValue={asString(question.user_evidence) || asString(question.evidence)}
                        placeholder="Add or edit evidence..."
                        onBlur={(event) => {
                          const activeSelection = Number(selectedMark || selectedOption || "");
                          if (Number.isFinite(activeSelection) && activeSelection > 0) {
                            onAnswerChange(
                              bucketName,
                              questionId,
                              activeSelection,
                              asString(question.user_reason) || asString(question.observation),
                              event.currentTarget.value,
                            );
                          }
                        }}
                      />
                    ) : (
                      <div className="mt-2 rounded-lg border border-[color:var(--card-border)] bg-white px-[5px] py-[5px] text-sm text-[color:var(--ink)]">
                        {(() => {
                          const evidence =
                            asString(question.user_evidence) ||
                            asString(question.evidence) ||
                            fallbackQuestionConclusion(question, answerStatus);
                          return promptLikeText(evidence, question.question) ? "—" : evidence || "—";
                        })()}
                      </div>
                    )}
                  </div>
                ) : null}

                {!isNotScored ? (
                  <div className="mt-5">
                    <div className="text-sm font-semibold tracking-tight text-[color:var(--ink)]">
                      Reason
                    </div>
                    {onAnswerChange && questionId ? (
                      <textarea
                        className="mt-2 min-h-[92px] w-full rounded-lg border border-[color:var(--card-border)] bg-white px-[5px] py-[5px] text-sm text-[color:var(--ink)]"
                        defaultValue={asString(question.user_reason) || asString(question.observation)}
                        placeholder="Add or edit reason..."
                        onBlur={(event) => {
                          const activeSelection = Number(selectedMark || selectedOption || "");
                          if (Number.isFinite(activeSelection) && activeSelection > 0) {
                            onAnswerChange(
                              bucketName,
                              questionId,
                              activeSelection,
                              event.currentTarget.value,
                              asString(question.user_evidence) || asString(question.evidence),
                            );
                          }
                        }}
                      />
                    ) : (
                      <div className="mt-2 rounded-lg border border-[color:var(--card-border)] bg-white px-[5px] py-[5px] text-sm text-[color:var(--ink)]">
                        {(() => {
                          const reason =
                            asString(question.user_reason) ||
                            asString(question.observation) ||
                            fallbackQuestionConclusion(question, answerStatus);
                          return promptLikeText(reason, question.question) ? "—" : reason || "—";
                        })()}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 text-sm text-[color:var(--ink-muted)]">
          No question-level AI answers were captured for this bucket.
        </div>
      )}
    </div>
  );
}

export function FindingCard({ finding }: { finding: Record<string, unknown> }) {
  return (
    <div
      className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-4"
      data-report-section
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold">
          {asString(finding.rank) || "—"}. {asString(finding.bucket) || "Finding"}
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        <div>
          <SectionTitle>Issue</SectionTitle>
          <div className="mt-1">
            <Callout tone="issue">{asString(finding.what_we_found) || "—"}</Callout>
          </div>
        </div>
        <div>
          <SectionTitle>Effect of this issue</SectionTitle>
          <div className="mt-1">
            <Callout tone="effect">{asString(finding.why_it_matters) || "—"}</Callout>
          </div>
        </div>
        <div>
          <SectionTitle>Solution for this issue</SectionTitle>
          <div className="mt-1">
            <Callout tone="solution">{asString(finding.recommendation) || "—"}</Callout>
          </div>
        </div>
      </div>
    </div>
  );
}

export type ReportPage = {
  key: string;
  title: string;
  body: ReactNode;
  locked?: boolean;
  variant?: "cover" | "standard";
  showTitle?: boolean;
};

export type SharedSectionProps = {
  vm: {
    productName: string;
    productUrl: string;
    productType: string;
    generatedAt: string;
    auditReason: string;
    auditType: string;
    isLimitedCoverage: boolean;
    isScoringUnavailable: boolean;
    hasPartialScoring: boolean;
    overallScore: number | null;
    overallHealth: string;
    overallRisk: string;
    captureCoverage: {
      status: string;
      summary: string;
      loginPageCaptured: boolean;
      authenticatedDashboardCaptured: boolean;
      navigationCaptured: boolean;
      internalProductScreensCaptured: number;
      internalProductScreensTarget: number;
      formsCaptured: boolean;
      tablesCaptured: boolean;
      dropdownCaptured: boolean;
      errorEmptyLoadingCaptured: boolean;
      browserSessionUsed: boolean;
      guidedStepsAttempted: number;
      guidedStepsCompleted: number;
      questionsScoreable: number;
      questionsTotal: number;
      scoreEligible: boolean;
      failedStepReasons: string[];
      whatWasCaptured: string[];
      whatWasMissing: string[];
      suggestedNextSteps: string[];
    };
    pillarScores: Record<string, { score: number | null; evaluated: boolean }>;
    scorecard: AnyRecord[];
    bucketResults: AnyRecord[];
    executiveSummary: AnyRecord;
    sectionNarrative: {
      delight_narrative: string;
      impact_narrative: string;
      accessibility_narrative: string;
    };
    findingsDetailed: AnyRecord[];
    quickWinsTable: AnyRecord[];
    roadmap: {
      week_1_2: string[];
      month_1: string[];
      quarter_1: string[];
    };
    closingNote: string;
  };
};
