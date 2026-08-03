import type { SharedSectionProps } from "./shared";
import { BulletList, normalizeList } from "./shared";
import { asRecord, asString } from "@/lib/report-model";

const PILLAR_BUCKETS = {
  Delight: ["Content & UX Writing", "Consistency & UI Patterns"],
  Impact: ["Navigation & Findability", "Visual Hierarchy & Layout", "code optimisation"],
  Accessibility: [
    "Accessibility & Inclusivity",
    "Input, Errors & Validation",
    "Feedback & System States",
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
  const directItems = normalizeList(rationale[key], 8);
  if (directItems.length) return directItems;

  const summaryItems = normalizeList(rationale.summary, 4);
  if (summaryItems.length) return summaryItems;

  return normalizeList(bucket.summary || bucket.note || bucket.rationale || "", 4);
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
                ({bucketNames.join(", ")})
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
                        {currentBucketName}
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
