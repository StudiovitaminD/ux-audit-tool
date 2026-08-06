import { asString, displayBucketName, calculateBusinessImpactMetrics, type AnyRecord } from "@/lib/report-model";
import { formatDate, priorityRank, type SharedSectionProps } from "./shared";

function clampPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreFromText(value: unknown) {
  const match = asString(value).match(/(\d+(?:\.\d+)?)/);
  return match ? clampPercent(Number(match[1])) : null;
}

function experienceLabelFromScore(value: unknown) {
  const score = typeof value === "number" ? value : scoreFromText(value);
  if (score === null || !Number.isFinite(score)) return "—";
  if (score >= 85) return "Exceptional";
  if (score >= 75) return "Good";
  if (score >= 50) return "Average";
  return "Needs Immediate Improvement";
}

function formatPriority(value: unknown) {
  const raw = asString(value).trim();
  if (!raw) return "—";
  const lower = raw.toLowerCase();
  return lower.startsWith("p") ? lower : `p${lower}`;
}

function normalizeKey(value: unknown) {
  return asString(value).trim().toLowerCase().replace(/\s+/g, " ");
}

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

function bucketPillarFromRow(row: AnyRecord) {
  const bucket = normalizeKey(bucketNameFromRow(row));
  for (const [pillar, buckets] of Object.entries(PILLAR_BUCKETS)) {
    if (buckets.map(normalizeKey).includes(bucket)) return pillar;
  }
  const raw = normalizeKey(row.pillar);
  if (raw.includes("access")) return "Accessibility";
  if (raw.includes("impact")) return "Impact";
  if (raw.includes("delight")) return "Delight";
  return "Unassigned";
}

function bucketNameFromRow(row: AnyRecord) {
  return asString(row.section || row.bucket_name || row.bucket || row.name);
}

function scoreFromRow(row: AnyRecord) {
  const match = asString(row.score).match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

export function OverviewSection({ vm }: SharedSectionProps) {
  const scoreRows = [...(vm.scorecard.length ? vm.scorecard : vm.bucketResults)].sort((left, right) => {
    const byPriority = priorityRank(left.priority) - priorityRank(right.priority);
    if (byPriority !== 0) return byPriority;

    const byScore =
      Number(asString(left.score).replace(/[^\d.]/g, "")) -
      Number(asString(right.score).replace(/[^\d.]/g, ""));
    if (!Number.isNaN(byScore) && byScore !== 0) return byScore;

    return asString(left.section || left.bucket_name || left.bucket || left.name).localeCompare(
      asString(right.section || right.bucket_name || right.bucket || right.name),
    );
  });
  const overallScore = clampPercent(vm.overallScore ?? null);
  const businessMetrics = calculateBusinessImpactMetrics(vm.pillarScores);
  const pillarOrder = ["Accessibility", "Impact", "Delight"];
  const groupedScoreRows = pillarOrder.map((pillar) => ({
    pillar,
    rows: scoreRows.filter((row) => bucketPillarFromRow(row) === pillar),
  }));

  return (
    <div className="space-y-5">
      <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-[color:var(--ink)]">Overall Score</div>
            <div className="mt-1 text-sm text-[color:var(--muted)]">
              Composite score across key UX audit buckets
            </div>
          </div>
          <div className="rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent-light)] px-4 py-2 text-sm font-medium text-[color:var(--accent)]">
            {vm.overallScore ?? "—"}/100{" "}
            <span className="ml-2 text-[color:var(--ink-soft)]">
              Experiences: {experienceLabelFromScore(vm.overallScore)}
            </span>
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {Object.entries(vm.pillarScores).map(([name, p]) => (
            <div
              key={name}
              className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5"
            >
              <div className="text-sm text-[color:var(--muted)]">{name} Score</div>
              <div className="mt-3 flex items-end gap-2">
                <div className="font-mono text-4xl font-bold">
                  {p.score ?? "—"}
                </div>
                <div className="pb-1 text-sm text-[color:var(--muted)]">/100</div>
              </div>
            </div>
          ))}
        </div>
        {vm.isLimitedCoverage || vm.isScoringUnavailable ? (
          <div className="mt-4 rounded-xl border border-amber-200/70 bg-amber-50/70 p-4 text-sm text-amber-900 print-color-adjust">
            {vm.isLimitedCoverage
              ? "UX score was not calculated because the required product screens were not captured."
              : "UX score was not calculated because scoring could not be completed from the captured evidence."}
          </div>
        ) : null}
      </div>

      <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
        <div className="text-lg font-semibold normal-case">Business Impact Index</div>
        <div className="mt-5 grid gap-5 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-[color:var(--card-border)]/60">
          {businessMetrics.map((metric) => (
            <div key={metric.label} className="space-y-3 lg:px-4 first:lg:pl-0 last:lg:pr-0">
              <div className="text-xs text-[color:var(--muted)] normal-case">
                {metric.label}
              </div>
              <div className="overflow-hidden rounded-full bg-black/[0.08]">
                <div
                  className="h-2 rounded-full bg-black/[0.14]"
                  style={{ width: `${metric.value}%` }}
                />
              </div>
              <div className="text-right text-xs font-mono text-[color:var(--muted)]">
                {metric.value === null ? "—" : `${metric.value}/100`}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
        <div className="text-lg font-semibold normal-case">Score Card</div>
        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[980px] rounded-2xl border border-[color:var(--card-border)]/60 overflow-hidden">
            <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[54px]" />
              <col className="w-[24%]" />
              <col className="w-[24%]" />
              <col className="w-[24%]" />
              <col className="w-[24%]" />
            </colgroup>
            <thead className="border-b border-[color:var(--card-border)]/60 text-xs uppercase tracking-wider text-[color:var(--muted)]">
              <tr>
                <th className="px-1 py-3 text-center">
                  <span className="sr-only">Pillar</span>
                </th>
                <th className="px-4 py-4 text-center">Bucket</th>
                <th className="px-4 py-4 text-center">Score</th>
                <th className="px-4 py-4 text-center">Experiences</th>
                <th className="px-4 py-4 text-center">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--card-border)]/60">
              {groupedScoreRows.flatMap(({ pillar, rows }) =>
                rows.length
                  ? rows.map((row, index) => {
                      const bucketName = displayBucketName(bucketNameFromRow(row)) || "Bucket";
                      const score = asString(row.score) || "Not scored";
                      const experience = experienceLabelFromScore(scoreFromText(row.score));
                      const priority = formatPriority(row.priority);

                      return (
                        <tr key={`${pillar}-${bucketName}-${index}`}>
                          {index === 0 ? (
                            <td
                              rowSpan={rows.length}
                              className="border-r border-[color:var(--card-border)]/60 align-middle px-2 py-0 text-center"
                            >
                              <div className="mx-auto [writing-mode:vertical-rl] rotate-180 text-[9px] font-semibold uppercase tracking-[0.12em] leading-none text-[color:var(--muted)]">
                                {pillar}
                              </div>
                            </td>
                          ) : null}
                          <td className="px-4 py-5 text-center font-medium text-[color:var(--ink)]">{bucketName}</td>
                          <td className="px-4 py-5 text-center font-mono text-[color:var(--ink)]">{score}</td>
                          <td className="px-4 py-5 text-center text-[color:var(--ink)]">{experience}</td>
                          <td className="px-4 py-5 text-center font-semibold text-[color:var(--ink)]">{priority}</td>
                        </tr>
                      );
                    })
                    : [
                      <tr key={pillar}>
                        <td className="border-r border-[color:var(--card-border)]/60 px-2 py-0 text-center">
                          <div className="mx-auto [writing-mode:vertical-rl] rotate-180 text-[9px] font-semibold uppercase tracking-[0.12em] leading-none text-[color:var(--muted)]">
                            {pillar}
                          </div>
                        </td>
                        <td colSpan={4} className="px-4 py-5 text-[color:var(--muted)]">
                          No buckets available for this pillar.
                        </td>
                      </tr>,
                    ],
              )}
                  </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
