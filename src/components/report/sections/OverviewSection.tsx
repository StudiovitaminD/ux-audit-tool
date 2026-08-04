import { asString, type AnyRecord } from "@/lib/report-model";
import { formatDate, normalizeList, priorityRank, type SharedSectionProps } from "./shared";

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

function scoreValueFromRow(rows: AnyRecord[], sectionNeedles: string[]) {
  const match = rows.find((row) => {
    const label = asString(row.section || row.bucket_name || row.bucket || row.name).toLowerCase();
    return sectionNeedles.some((needle) => label.includes(needle.toLowerCase()));
  });
  if (!match) return null;
  const score = Number(asString(match.score).replace(/[^\d.]/g, ""));
  return Number.isFinite(score) ? clampPercent(score) : null;
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
    "Accessibility & Inclusivity",
    "Input, Errors & Validation",
    "Feedback & System States",
  ],
  Impact: ["Navigation & Findability", "Visual Hierarchy & Layout", "code optimisation"],
  Delight: ["Content & UX Writing", "Consistency & UI Patterns"],
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

function isPlaceholderText(value: unknown) {
  const text = asString(value).trim().toLowerCase();
  if (!text) return true;
  return /^(—|not scored|capture coverage insufficient|scoring unavailable|insufficient evidence|evidence missing|not available|n\/a|na)$/.test(
    text,
  );
}

function bucketNarrativeFromRow(row: AnyRecord) {
  const bucketName = bucketNameFromRow(row);
  const scoreRationale = row.score_rationale && typeof row.score_rationale === "object" ? (row.score_rationale as AnyRecord) : {};
  const finding = Array.isArray(row.findings)
    ? row.findings.find((item) => item && typeof item === "object") as AnyRecord | undefined
    : undefined;
  const improvement = Array.isArray(row.improvements)
    ? row.improvements.find((item) => item && typeof item === "object") as AnyRecord | undefined
    : undefined;

  const details = [
    asString(scoreRationale.summary),
    asString(scoreRationale.what_is_working),
    asString(scoreRationale.what_is_risky),
    asString(finding?.observation || finding?.what_we_found || finding?.question),
    asString(improvement?.recommendation || improvement?.observation || improvement?.question),
    asString(row.summary),
    asString(row.note),
    asString(row.health),
  ].find((item) => !isPlaceholderText(item));

  return {
    name: bucketName,
    details: details || "",
    score: scoreFromRow(row),
    scored: Number.isFinite(scoreFromRow(row) ?? NaN),
  };
}

export function OverviewSection({ vm }: SharedSectionProps) {
  const executiveSummary = vm.executiveSummary;
  const productName = vm.productName || "This product";
  const bucketNarratives = vm.bucketResults
    .map((row) => bucketNarrativeFromRow(row))
    .filter((item) => item.name && !isPlaceholderText(item.name));
  const positiveSignals = bucketNarratives
    .filter((item) => !isPlaceholderText(item.details))
    .sort((left, right) => (right.score ?? -1) - (left.score ?? -1));
  const strongestSignal =
    positiveSignals.find((item) => item.details && !/capture coverage insufficient|scoring unavailable/i.test(item.details)) ||
    positiveSignals[0] ||
    bucketNarratives[0];
  const weakestSignal =
    [...bucketNarratives]
      .filter((item) => item.details)
      .sort((left, right) => (left.score ?? 101) - (right.score ?? 101))[0] ||
    bucketNarratives.find((item) => item.details);

  const topStrengths = normalizeList(
    normalizeList(executiveSummary.whats_working).length
      ? executiveSummary.whats_working
      : executiveSummary.what_works,
    6,
  ).filter((item) => !isPlaceholderText(item));
  const topRisks = normalizeList(
    normalizeList(executiveSummary.top_problems).length
      ? executiveSummary.top_problems
      : executiveSummary.top_3_problems,
    6,
  ).filter((item) => !isPlaceholderText(item));
  const firstPriorityItems = normalizeList(
    normalizeList(executiveSummary.first_priority).length
      ? executiveSummary.first_priority
      : executiveSummary.first_priority_recommendation,
    6,
  ).filter((item) => !isPlaceholderText(item));
  const summaryQuickWins = normalizeList(
    normalizeList(executiveSummary.quick_wins).length
      ? executiveSummary.quick_wins
      : executiveSummary.top_3_quick_wins,
    6,
  ).filter((item) => !isPlaceholderText(item));
  const summaryPoints = [
    asString(executiveSummary.strongest_area) ? `Strongest area: ${asString(executiveSummary.strongest_area)}` : "",
    asString(executiveSummary.main_issue) ? `Main issue: ${asString(executiveSummary.main_issue)}` : "",
    asString(executiveSummary.first_priority_recommendation || executiveSummary.primary_recommendation)
      ? `Priority action: ${asString(
          executiveSummary.first_priority_recommendation || executiveSummary.primary_recommendation,
        )}`
      : "",
  ].filter(Boolean);

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
  const delightScore = clampPercent(vm.pillarScores.Delight?.score ?? overallScore);
  const impactScore = clampPercent(vm.pillarScores.Impact?.score ?? overallScore);
  const accessibilityScore = clampPercent(vm.pillarScores.Accessibility?.score ?? overallScore);
  const taskCompletionScore =
    scoreValueFromRow(scoreRows, ["navigation", "content", "layout"]) ?? accessibilityScore;
  const conversionRateScore = scoreValueFromRow(scoreRows, ["impact"]) ?? impactScore;
  const dropOffRateScore = overallScore > 0 ? clampPercent(100 - overallScore) : clampPercent(100 - impactScore);
  const customerSatisfactionScore = scoreValueFromRow(scoreRows, ["delight"]) ?? delightScore;
  const pillarOrder = ["Accessibility", "Impact", "Delight"];
  const groupedScoreRows = pillarOrder.map((pillar) => ({
    pillar,
    rows: scoreRows.filter((row) => bucketPillarFromRow(row) === pillar),
  }));
  const businessMetrics = [
    { label: "Conversion Rate", value: conversionRateScore },
    { label: "Drop-off Rate", value: dropOffRateScore },
    { label: "Task Completion Rate", value: taskCompletionScore },
    { label: "Customer Satisfaction", value: customerSatisfactionScore },
  ];
  const strongestLabel =
    (strongestSignal && !isPlaceholderText(strongestSignal.name) ? strongestSignal.name : "") ||
    asString(executiveSummary.strongest_area) ||
    (topStrengths.length ? topStrengths[0] : "");
  const weakestLabel =
    (weakestSignal && !isPlaceholderText(weakestSignal.name) ? weakestSignal.name : "") ||
    asString(executiveSummary.main_issue) ||
    (topRisks.length ? topRisks[0] : "");
  const actionSentence =
    asString(executiveSummary.first_priority_recommendation || executiveSummary.primary_recommendation) ||
    (firstPriorityItems.length ? firstPriorityItems[0] : "") ||
    (summaryQuickWins.length ? summaryQuickWins[0] : "");
  const summaryParts = [
    strongestLabel
      ? `${productName} shows its strongest signals in ${strongestLabel}${
          strongestSignal?.details ? `, where ${strongestSignal.details.replace(/[.]+$/, "")}` : ""
        }.`
      : "",
    weakestLabel
      ? `${productName} has the most room to improve in ${weakestLabel}${
          weakestSignal?.details ? `, where ${weakestSignal.details.replace(/[.]+$/, "")}` : ""
        }.`
      : "",
    actionSentence ? `Priority action: ${actionSentence.replace(/[.]+$/, "")}.` : "",
  ].filter(Boolean);
  const summaryParagraph =
    summaryParts.join(" ") ||
    (vm.captureCoverage.summary && !isPlaceholderText(vm.captureCoverage.summary)
      ? vm.captureCoverage.summary
      : topStrengths.length || topRisks.length
        ? [
            topStrengths.length ? `Strong signals: ${topStrengths.join(" • ")}.` : "",
            topRisks.length ? `Needs attention: ${topRisks.join(" • ")}.` : "",
            actionSentence ? `Priority action: ${actionSentence.replace(/[.]+$/, "")}.` : "",
          ]
            .filter(Boolean)
            .join(" ")
        : "The available evidence supports a directional UX summary, but the report needs a few more concrete signals before it can be fully specific.");

  return (
    <div className="space-y-5">
      <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-6">
        <div className="text-lg font-semibold text-[color:var(--ink)]">Overall Report Summary</div>
        <div className="mt-3 text-sm leading-7 text-[color:var(--muted)]">
          {summaryParagraph}
        </div>
      </div>

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
        <div className="text-lg font-semibold normal-case">Business Metrics</div>
        <div className="mt-5 grid gap-5 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-[color:var(--card-border)]/60">
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
                {metric.value}/100
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
                      const bucketName = bucketNameFromRow(row) || "Bucket";
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
