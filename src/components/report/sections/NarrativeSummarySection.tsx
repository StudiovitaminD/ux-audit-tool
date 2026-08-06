import type { SharedSectionProps } from "./shared";
import { BulletList, normalizeList, placeholderText } from "./shared";
import { asArray, asRecord, asString, displayBucketName } from "@/lib/report-model";
import { QUESTION_BANK } from "../../../../worker/src/question-bank";

const SUMMARY_PILLARS = {
  Accessibility: [
    { name: "Visual Feedback", aliases: ["Feedback & System States"] },
    { name: "Color & Contrast", aliases: ["Accessibility & Inclusivity"] },
    { name: "Typography & Readability", aliases: ["Visual Hierarchy & Layout"] },
    { name: "Keyboard Navigation", aliases: ["Input, Errors & Validation"] },
    { name: "Screen Reader Support", aliases: ["Accessibility & Inclusivity"] },
  ],
  Impact: [
    { name: "Navigation & Findability", aliases: ["Navigation & Findability"] },
    { name: "Consistency & UI Patterns", aliases: ["Consistency & UI Patterns"] },
    { name: "Content (Impact)", aliases: ["Content & UX Writing"] },
    { name: "Performance", aliases: ["code optimisation"] },
  ],
  Delight: [
    { name: "Visual Consistency", aliases: ["Visual Hierarchy & Layout"] },
    { name: "Motion & Microinteractions", aliases: ["Feedback & System States"] },
    { name: "Content (Delight)", aliases: ["Content & UX Writing"] },
    { name: "Brand Expression", aliases: ["Visual Hierarchy & Layout"] },
    { name: "Icons & Imagery", aliases: ["Accessibility & Inclusivity"] },
  ],
} as const;

type SummaryBucketSpec = {
  name: string;
  aliases: readonly string[];
};

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

function normalizeKey(value: unknown) {
  return asString(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function matchesBucket(bucket: Record<string, unknown>, spec: SummaryBucketSpec) {
  const actualName = normalizeKey(bucketName(bucket));
  const pillarBucketName = normalizeKey(spec.name);
  if (actualName === pillarBucketName) return true;
  return spec.aliases.some((alias) => actualName === normalizeKey(alias));
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
  const pillarBucketsOrder = Object.entries(SUMMARY_PILLARS) as Array<
    [keyof typeof SUMMARY_PILLARS, readonly SummaryBucketSpec[]]
  >;

  for (const bucket of vm.bucketResults) {
    const pillar = asString(bucket.pillar) || "Unassigned";
    if (!bucketsByPillar.has(pillar)) bucketsByPillar.set(pillar, []);
    bucketsByPillar.get(pillar)?.push(bucket);
  }

  return (
    <div className="space-y-4">
      {pillarBucketsOrder.map(([pillar, bucketNames]) => {
        const pillarBuckets = bucketNames.map((spec) => {
          const matched = (bucketsByPillar.get(pillar) || []).find((bucket) => matchesBucket(bucket, spec));
          return matched ? { spec, bucket: matched } : { spec, bucket: null };
        });

        return (
          <div
            key={pillar}
            className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5"
          >
            <div className="text-sm font-semibold">
              {pillar}{" "}
              <span className="font-normal text-[color:var(--muted)]">
                ({bucketNames.map((bucket) => displayBucketName(bucket.name)).join(", ")})
              </span>
            </div>
            <div className="my-4 border-t border-[color:var(--card-border)]/60" />

            <div className="space-y-5">
              {pillarBuckets.map(({ spec, bucket }, index) => {
                const currentBucketName = bucket ? bucketName(bucket) : spec.name;
                const currentBucketLabel = displayBucketName(currentBucketName);
                return (
                  <div
                    key={`${pillar}-${currentBucketName}-${index}`}
                    className={index === 0 ? "" : "border-t border-[color:var(--card-border)]/60 pt-5"}
                  >
                    <div className="text-sm font-medium text-[color:var(--ink)]">
                      {currentBucketLabel}
                    </div>

                    <div className="mt-4 space-y-5">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                          Top Problems
                        </div>
                        <BulletList
                          items={bucket ? bucketRationaleItems(bucket, "what_is_risky") : []}
                          emptyLabel="Bucket-level data not available yet."
                        />
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                          What&apos;s Working
                        </div>
                        <BulletList
                          items={bucket ? bucketRationaleItems(bucket, "what_is_working") : []}
                          emptyLabel="Bucket-level data not available yet."
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
