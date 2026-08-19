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
  if (score >= 80) return "Good";
  if (score <= 50) return "Critical";
  return "Average";
}

function scoreToneFromValue(value: unknown) {
  const score = typeof value === "number" ? value : scoreFromText(value);
  if (score === null || !Number.isFinite(score)) return "neutral";
  if (score <= 50) return "critical";
  if (score < 80) return "warning";
  return "good";
}

function scoreToneClasses(value: unknown) {
  const tone = scoreToneFromValue(value);
  if (tone === "critical") {
    return {
      card: "border-[color:var(--report-red)] bg-[color:var(--report-red)]",
      title: "text-[color:var(--report-white)]",
      score: "text-[color:var(--report-white)]",
      suffix: "text-[color:var(--report-white)]",
    };
  }
  if (tone === "warning") {
    return {
      card: "border-[color:var(--report-orange)] bg-[color:var(--report-orange)]",
      title: "text-[color:var(--report-white)]",
      score: "text-[color:var(--report-white)]",
      suffix: "text-[color:var(--report-white)]",
    };
  }
  return {
    card: "border-[color:var(--report-green-font)] bg-[color:var(--report-green-font)]",
    title: "text-[color:var(--report-white)]",
    score: "text-[color:var(--report-white)]",
    suffix: "text-[color:var(--report-white)]",
  };
}

function metricToneClass(value: number | null | undefined) {
  const tone = scoreToneFromValue(value);
  if (tone === "critical") return "text-[color:var(--report-red)]";
  if (tone === "warning") return "text-[color:var(--report-orange)]";
  return "text-[color:var(--report-green-font)]";
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

function bucketPillarFromName(bucketName: string, fallbackPillar = "") {
  const normalized = normalizeKey(bucketName);
  if (["visual feedback", "color & contrast", "typography & readability", "keyboard navigation", "screen reader support"].includes(normalized)) {
    return "Accessibility";
  }
  if (["navigation & findability", "consistency & ui patterns", "performance"].includes(normalized)) {
    return "Impact";
  }
  if (["visual consistency", "motion & microinteractions", "brand expression", "icons & imagery"].includes(normalized)) {
    return "Delight";
  }
  if (normalized === "content (impact)" || normalized === "content") {
    const rawFallback = normalizeKey(fallbackPillar);
    if (rawFallback.includes("delight")) return "Delight";
    return "Impact";
  }
  if (normalized === "content (delight)") {
    return "Delight";
  }
  const fallback = normalizeKey(fallbackPillar);
  if (fallback.includes("access")) return "Accessibility";
  if (fallback.includes("impact")) return "Impact";
  if (fallback.includes("delight")) return "Delight";
  return "Impact";
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
  const bucket = bucketNameFromRow(row);
  return bucketPillarFromName(bucket, asString(row.pillar));
}

function bucketNameFromRow(row: AnyRecord) {
  return asString(row.section || row.bucket_name || row.bucket || row.name);
}

function isScoredRow(row: AnyRecord) {
  return scoreFromRow(row) !== null && asString(row.score).toLowerCase() !== "not scored";
}

function dedupeScoreRows(rows: AnyRecord[]) {
  const seen = new Map<string, AnyRecord>();
  for (const row of rows) {
    const pillar = bucketPillarFromRow(row);
    const bucketName = displayBucketName(bucketNameFromRow(row) || "Bucket").toLowerCase();
    const key = `${pillar}::${bucketName}`;
    const existing = seen.get(key);

    if (!existing || (!isScoredRow(existing) && isScoredRow(row))) {
      seen.set(key, row);
    }
  }
  return Array.from(seen.values());
}

function scoreFromRow(row: AnyRecord) {
  const match = asString(row.score).match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

export function OverviewSection({ vm }: SharedSectionProps) {
  const overallTone = scoreToneClasses(vm.overallScore);
  const scoreRows = dedupeScoreRows([
    ...(vm.scorecard.length ? vm.scorecard : vm.bucketResults),
  ]).sort((left, right) => {
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
  const pillarScores = vm.pillarScores ?? { Accessibility: null, Impact: null, Delight: null };
  const businessMetrics = calculateBusinessImpactMetrics(pillarScores);
  const pillarOrder = ["Accessibility", "Impact", "Delight"];
  const scoreCardOrder = ["Accessibility", "Impact", "Delight"];
  const scoreRowLookup = new Map<string, AnyRecord>();
  for (const row of scoreRows) {
    const pillar = bucketPillarFromRow(row);
    const bucketName = displayBucketName(bucketNameFromRow(row)) || "Bucket";
    const key = `${pillar}::${normalizeKey(bucketName)}`;
    if (!scoreRowLookup.has(key)) {
      scoreRowLookup.set(key, row);
    }
  }
  const groupedScoreRows = pillarOrder.map((pillar) => ({
    pillar,
    rows: PILLAR_BUCKETS[pillar as keyof typeof PILLAR_BUCKETS].map((bucketName) => ({
      bucketName,
      row: scoreRowLookup.get(`${pillar}::${normalizeKey(bucketName)}`) ?? null,
    })),
  }));

  return (
    <div className="flex w-full flex-col items-start bg-[color:var(--report-white)]">
      <div className="flex w-full min-w-0 flex-col items-start self-stretch bg-[color:var(--report-white)]">
        <div className="print-avoid-break flex w-full flex-col items-start self-stretch border-b border-[rgba(15,23,42,0.14)] pb-4">
          <div
            className="max-w-[980px] text-[12px] leading-[18px] text-[color:var(--report-grey-font)]"
            style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
          >
            This report is based on an expert review using a structured UX Audit Framework. It provides an
            indicative assessment of the user experience with an estimated 70% accuracy level and is intended
            to guide design decisions.
          </div>
        </div>
        <div className="print-avoid-break mt-4 flex flex-none w-full min-w-0 flex-col items-start gap-3 self-stretch overflow-hidden rounded-2xl bg-[color:var(--report-grey-bg)] p-3">
          <div className="flex w-full min-w-0 flex-col items-start gap-2 self-stretch">
            <div
              className="text-[16px] font-bold leading-none text-[color:var(--report-black)]"
              style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
            >
              Overall Score
            </div>
            <div className="flex items-end gap-2">
              <span
                className={`text-[16px] font-bold leading-none ${
                  scoreToneFromValue(vm.overallScore) === "critical"
                    ? "text-[color:var(--report-red)]"
                    : "text-[#FC6D27]"
                }`}
                style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
              >
                {vm.overallScore ?? "—"}/100
              </span>
              <span
                aria-hidden="true"
                className={`text-[16px] font-normal leading-none ${
                  scoreToneFromValue(vm.overallScore) === "critical"
                    ? "text-[color:var(--report-red)]"
                    : "text-[#BDBDBD]"
                }`}
                style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
              >
                |
              </span>
              <span
                className={`text-[16px] font-bold leading-none ${
                  scoreToneFromValue(vm.overallScore) === "critical"
                    ? "text-[color:var(--report-red)]"
                    : "text-[#FC6D27]"
                }`}
                style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
              >
                {experienceLabelFromScore(vm.overallScore)}
              </span>
            </div>
            <div
            className="mt-1 text-[14px] font-medium leading-[20px] text-[color:var(--report-grey-font)]"
            style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
          >
            Composite score across key UX audit buckets
          </div>
          </div>

          <div className="flex w-full min-w-0 flex-col items-start space-y-4 self-stretch">
            <div className="flex w-full min-w-0 items-start gap-3 self-stretch">
              {scoreCardOrder.map((name) => {
                const p = pillarScores[name] ?? { score: null };
                const tone = scoreToneClasses(p.score);
                return (
                  <div
                    key={name}
                    className={`flex min-w-0 flex-1 basis-0 flex-col items-start gap-1 overflow-hidden rounded-2xl border p-3 ${tone.card}`}
                  >
                    <div
                      className={`text-[12px] font-semibold leading-normal ${tone.title}`}
                      style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
                    >
                      {name}
                    </div>
                    <div className="flex min-w-0 items-end gap-1">
                    <div
                        className={`text-[24px] font-bold leading-none ${tone.score}`}
                        style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
                      >
                        {p.score ?? "—"}
                      </div>
                      <div
                        className={`text-[16px] font-bold leading-none ${tone.suffix}`}
                        style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
                      >
                        /100
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {vm.isLimitedCoverage || vm.isScoringUnavailable ? (
              <div className="rounded-xl border border-amber-200/70 bg-amber-50/70 p-4 text-sm text-amber-900 print-color-adjust">
                {vm.isLimitedCoverage
                  ? "UX score was not calculated because the required product screens were not captured."
                  : "UX score was not calculated because scoring could not be completed from the captured evidence."}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="h-3 shrink-0" aria-hidden="true" />

      <div className="print-avoid-break flex-none w-full min-w-0 self-stretch overflow-hidden rounded-2xl bg-[color:var(--report-grey-bg)] p-3">
          <div className="flex flex-col gap-3">
          <div
            className="text-[16px] font-bold leading-none text-[color:var(--report-black)]"
            style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
          >
            Business Impact Index
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {businessMetrics.map((metric, index) => {
              const isFirst = index === 0;
              const betterLabel = metric.label === "Drop-off Rate" ? "Lower is better" : "Higher is better";
              return (
                <div
                  key={metric.label}
                  className="flex h-fit flex-col gap-1 rounded-2xl border border-transparent bg-[color:var(--report-white)] p-4"
                >
                  <div className="space-y-1">
                    <div
                      className="text-[14px] font-semibold leading-normal text-[color:var(--report-grey-font)]"
                      style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
                    >
                      {metric.label}
                    </div>
                    <div
                      className="text-[12px] font-medium leading-normal text-[color:var(--report-grey-font)]"
                      style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
                    >
                      {betterLabel}
                    </div>
                  </div>
                  <div className="mt-1 flex items-end gap-0.5">
                    <div
                      className={`text-[24px] font-bold leading-none ${metricToneClass(metric.value)}`}
                      style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
                    >
                      {metric.value === null ? "—" : metric.value}
                    </div>
                    <div
                      className={`text-[16px] font-bold leading-none ${metricToneClass(metric.value)}`}
                      style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
                    >
                      {metric.value === null ? "" : "%"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="h-3 shrink-0" aria-hidden="true" />

      <div className="flex-none w-full min-w-0 self-stretch rounded-2xl bg-[color:var(--report-white)] p-3">
        <div className="mb-3 text-[16px] font-bold leading-normal text-[color:var(--report-black)]">Score Card</div>
        <div className="max-w-full overflow-hidden rounded-xl border border-[color:var(--report-table-border)] bg-[color:var(--report-white)]">
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col style={{ width: "32px" }} />
              <col style={{ width: "200px" }} />
              <col />
              <col style={{ width: "200px" }} />
              <col />
            </colgroup>
            <thead className="bg-[color:var(--report-black)] text-[12px] uppercase tracking-wider text-[color:var(--report-white)]">
              <tr>
                <th className="px-1 py-2 text-center">
                  <span className="sr-only">Pillar</span>
                </th>
                <th className="px-[12px] py-[4px] text-center">Bucket</th>
                <th className="px-[12px] py-[4px] text-center">Score</th>
                <th className="px-[12px] py-[4px] text-center">Health</th>
                <th className="px-[12px] py-[4px] text-center">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--report-table-border)]">
              {groupedScoreRows.flatMap(({ pillar, rows }) => {
                if (!rows.length) {
                  return [
                    <tr key={pillar}>
                      <td className="relative w-[32px] min-w-[32px] border-r border-[color:var(--report-table-border)] px-0 py-0 text-center align-middle">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-fit whitespace-nowrap text-center [writing-mode:vertical-rl] rotate-180 text-[10px] font-medium normal-case tracking-normal leading-none text-[color:var(--report-grey-font)]">
                            {pillar}
                          </div>
                        </div>
                      </td>
                      <td colSpan={4} className="px-4 py-4 text-[color:var(--report-grey-font)]">
                        No buckets available for this pillar.
                      </td>
                    </tr>,
                  ];
                }

                return rows.map(({ bucketName: displayName, row }, index) => {
                  const bucketName = displayBucketName(displayName) || "Bucket";
                  const rawScore = row ? asString(row.score) : "";
                  const score = rawScore.toLowerCase() === "insufficient evidence" ? "No score" : rawScore || "No score";
                  const experience = row ? experienceLabelFromScore(scoreFromText(row.score)) : "—";
                  const priority = row ? formatPriority(row.priority) : "—";
                  const healthColors =
                    experience === "Good"
                      ? "border-[color:var(--report-green-font)] bg-[color:var(--report-green-bg)] text-[color:var(--report-green-font)]"
                      : experience === "Average"
                        ? "border-[color:var(--report-orange)] bg-[color:var(--report-orange-bg)] text-[color:var(--report-orange)]"
                        : "border-[color:var(--report-red)] bg-[color:var(--report-red-bg)] text-[color:var(--report-red)]";

                  return (
                    <tr
                      key={`${pillar}-${bucketName}-${index}`}
                      className={`align-middle ${
                        index % 2 === 0 ? "bg-[color:var(--report-white)]" : "bg-[color:var(--report-grey-bg)]"
                      } [&>td]:py-[4px]`}
                    >
                      {index === 0 ? (
                        <td
                          rowSpan={rows.length}
                          className="relative w-[32px] min-w-[32px] border-r border-[color:var(--report-table-border)] px-0 text-center"
                        >
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-fit whitespace-nowrap text-center [writing-mode:vertical-rl] rotate-180 text-[10px] font-medium normal-case tracking-normal leading-none text-[color:var(--report-grey-font)]">
                              {pillar}
                            </div>
                          </div>
                        </td>
                      ) : null}
                      <td className="w-[200px] max-w-[200px] whitespace-nowrap px-[12px] text-left font-medium leading-tight text-[color:var(--report-black)] align-middle">
                        {bucketName}
                      </td>
                      <td className="whitespace-nowrap px-[12px] text-center font-mono font-semibold leading-tight text-[color:var(--report-black)] align-middle">{score}</td>
                      <td className="w-[200px] max-w-[200px] px-[12px] text-center align-middle">
                        <span
                          className={`inline-flex w-[200px] max-w-[200px] items-center justify-center rounded-full border px-[4px] py-[4px] text-[11px] font-semibold leading-tight ${healthColors}`}
                        >
                          {experience}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-[12px] text-center font-semibold leading-tight text-[color:var(--report-black)] align-middle">
                        <span className="inline-flex">{priority.toUpperCase()}</span>
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
