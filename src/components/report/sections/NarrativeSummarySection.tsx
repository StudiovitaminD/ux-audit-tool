import type { SharedSectionProps } from "./shared";
import { BulletList, normalizeList, placeholderText } from "./shared";
import { asArray, asRecord, asString, displayBucketName } from "@/lib/report-model";
import { QUESTION_BANK } from "../../../../worker/src/question-bank";

const PILLAR_BUCKETS = {
  Accessibility: [
    "Visual Feedback",
    "Color & Contrast",
    "Typography & Readability",
    "Keyboard Navigation",
    "Screen Reader Support",
  ],
  Impact: ["Navigation & Findability", "Consistency & UI Patterns", "Content (Impact)", "Performance"],
  Delight: [
    "Visual Consistency",
    "Motion & Microinteractions",
    "Content (Delight)",
    "Brand Expression",
    "Icons & Imagery",
  ],
} as const;

function bucketName(bucket: Record<string, unknown>) {
  return (
    asString(bucket.bucket_name) ||
    asString(bucket.section) ||
    asString(bucket.bucket) ||
    "Bucket"
  );
}

function bucketRationaleItems(
  bucket: Record<string, unknown>,
  key: "what_is_risky" | "what_is_working",
) {
  const rationale = asRecord(bucket.score_rationale) ?? {};
  const directItems = normalizeList(rationale[key], 8).filter((item) => !placeholderText(item));
  if (directItems.length) return directItems;

  const summaryItems = normalizeList(rationale.summary, 4).filter((item) => !placeholderText(item));
  if (summaryItems.length) return summaryItems;

  const findings = asArray(bucket.findings)
    .map((item) => asRecord(item) ?? {})
    .map((item) =>
      key === "what_is_risky"
        ? asString(item.observation || item.what_we_found || item.question || item.evidence)
        : asString(item.recommendation || item.observation || item.question || item.what_we_found),
    )
    .filter((item) => item && !placeholderText(item));
  if (findings.length) return normalizeList(findings, 4);

  const improvements = asArray(bucket.improvements)
    .map((item) => asRecord(item) ?? {})
    .map((item) =>
      key === "what_is_risky"
        ? asString(item.observation || item.question || item.evidence)
        : asString(item.recommendation || item.observation || item.question),
    )
    .filter((item) => item && !placeholderText(item));
  if (improvements.length) return normalizeList(improvements, 4);

  const questionItems = asArray(bucket.questions)
    .map((item) => asRecord(item) ?? {})
    .map((item) =>
      key === "what_is_risky"
        ? synthesizeQuestionTakeaway(bucketLabel(bucket), item, "risk")
        : synthesizeQuestionTakeaway(bucketLabel(bucket), item, "working"),
    )
    .filter((item) => item && !placeholderText(item));
  if (questionItems.length) return normalizeList(questionItems, 4);

  return normalizeList(bucket.summary || bucket.note || bucket.rationale || bucket.health || "", 4);
}

function bucketLabel(bucket: Record<string, unknown>) {
  return (
    asString(bucket.bucket_name) ||
    asString(bucket.section) ||
    asString(bucket.bucket) ||
    "Bucket"
  );
}

function lookupQuestionOptions(bucketNameValue: string, questionId: string) {
  const direct = QUESTION_BANK[bucketNameValue] || [];
  const exact = direct.find((item) => item.id === questionId);
  if (exact?.options?.length) return exact.options;

  for (const questions of Object.values(QUESTION_BANK)) {
    const found = questions.find((item) => item.id === questionId);
    if (found?.options?.length) return found.options;
  }

  return [];
}

function synthesizeQuestionTakeaway(
  bucketNameValue: string,
  question: Record<string, unknown>,
  mode: "risk" | "working",
) {
  const questionId = asString(question.id);
  const selected = asString(question.selected_option_text).replace(/^\s*\d+\.\s*/, "").trim();
  if (selected && !placeholderText(selected)) return selected;

  const selectedMark = Number(asString(question.selected_option || question.mark));
  const option = lookupQuestionOptions(bucketNameValue, questionId).find((item) => Number(item.mark) === selectedMark);
  if (option?.text) return option.text.trim();

  const observation = asString(question.observation);
  if (observation && !placeholderText(observation)) return observation;

  const questionText = asString(question.question).replace(/\?$/, "").trim();
  if (!questionText) return "";

  return mode === "risk"
    ? `Needs follow-up: ${questionText}.`
    : `Current evidence suggests this should be verified further: ${questionText}.`;
}

export function NarrativeSummarySection({ vm }: SharedSectionProps) {
  const bucketsByPillar = new Map<string, Array<Record<string, unknown>>>();
  const pillarBucketsOrder = Object.entries(PILLAR_BUCKETS) as Array<
    [keyof typeof PILLAR_BUCKETS, readonly string[]]
  >;

  for (const bucket of vm.bucketResults) {
    const pillar = asString(bucket.pillar) || "Unassigned";
    if (!bucketsByPillar.has(pillar)) bucketsByPillar.set(pillar, []);
    bucketsByPillar.get(pillar)?.push(bucket);
  }

  return (
    <div className="space-y-4">
      {pillarBucketsOrder.map(([pillar, bucketNames]) => {
        const pillarBuckets = (bucketsByPillar.get(pillar) || []).filter((bucket) =>
          bucketNames.includes(bucketName(bucket)),
        );

        return (
          <div
            key={pillar}
            className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5"
          >
            <div className="text-sm font-semibold">
              {pillar}{" "}
              <span className="font-normal text-[color:var(--muted)]">
                ({bucketNames.map(displayBucketName).join(", ")})
              </span>
            </div>
            <div className="my-4 border-t border-[color:var(--card-border)]/60" />

            <div className="space-y-5">
              {pillarBuckets.length ? (
                pillarBuckets.map((bucket, index) => {
                  const currentBucketName = bucketName(bucket);
                  return (
                    <div
                      key={`${pillar}-${currentBucketName}-${index}`}
                      className={index === 0 ? "" : "border-t border-[color:var(--card-border)]/60 pt-5"}
                    >
                      <div className="text-sm font-medium text-[color:var(--ink)]">
                        {displayBucketName(currentBucketName)}
                      </div>

                      <div className="mt-4 space-y-5">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                            Top Problems
                          </div>
                          <BulletList
                            items={bucketRationaleItems(bucket, "what_is_risky")}
                            emptyLabel="Top problems not available."
                          />
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                            What&apos;s Working
                          </div>
                          <BulletList
                            items={bucketRationaleItems(bucket, "what_is_working")}
                            emptyLabel="Working points not available."
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <BulletList
                  items={
                    pillar === "Delight"
                      ? vm.sectionNarrative.delight_narrative
                      : pillar === "Impact"
                        ? vm.sectionNarrative.impact_narrative
                        : vm.sectionNarrative.accessibility_narrative
                  }
                  emptyLabel="Narrative not available."
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
