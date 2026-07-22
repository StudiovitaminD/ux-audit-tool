import { asString } from "@/lib/report-model";
import { formatDate, priorityRank, type SharedSectionProps } from "./shared";

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

  return (
    <div className="space-y-5">
      <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
        <div className="text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">
          {vm.auditType === "Limited Coverage Report" ? "Evidence Coverage Report Details" : "UX Audit Report Details"}
        </div>
        <div className="mt-2 font-display text-4xl font-semibold tracking-tight">
          {vm.productName}
        </div>
        <div className="mt-3 grid gap-2 text-sm text-[color:var(--muted)]">
          <div>Report type: {vm.auditType}</div>
          <div>Name: {vm.productName}</div>
          <div>URL: {vm.productUrl || "—"}</div>
          <div>Time: {formatDate(vm.generatedAt)}</div>
          <div>Reason: {vm.auditReason || "—"}</div>
        </div>
      </div>

      <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
        <div className="text-sm text-[color:var(--muted)]">Overall Score</div>
        <div className="mt-2 flex items-end gap-3">
          <div className="font-mono text-5xl font-bold tracking-tight">
            {vm.overallScore ?? "—"}
            <span className="text-xl text-[color:var(--muted)]">/100</span>
          </div>
          <div className="pb-1">
            <div className="text-sm">
              Health: <span className="font-semibold">{vm.overallHealth || "—"}</span>
            </div>
            <div className="text-sm text-[color:var(--muted)]">Risk: {vm.overallRisk || "—"}</div>
          </div>
        </div>
        {vm.isLimitedCoverage || vm.isScoringUnavailable ? (
          <div className="mt-4 rounded-xl border border-amber-200/70 bg-amber-50/70 p-4 text-sm text-amber-900 print-color-adjust">
            {vm.isLimitedCoverage
              ? "UX score was not calculated because the required product screens were not captured."
              : "UX score was not calculated because scoring could not be completed from the captured evidence."}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {Object.entries(vm.pillarScores).map(([name, p]) => (
          <div
            key={name}
            className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5"
          >
            <div className="text-sm text-[color:var(--muted)]">{name} Score</div>
            <div className="mt-2 font-mono text-3xl font-bold">
              {p.score ?? "—"}
              <span className="text-sm text-[color:var(--muted)]">/100</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
        <div className="text-sm font-semibold">Score Card</div>
        <div className="mt-4 overflow-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
              <tr>
                <th className="py-2 pr-4">Bucket</th>
                <th className="py-2 pr-4">Priority</th>
                <th className="py-2 pr-4">Score</th>
                <th className="py-2 pr-4">Health</th>
                <th className="py-2 pr-4">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--card-border)]/60">
              {scoreRows.map((row, index) => (
                <tr
                  key={`${asString(row.section || row.bucket_name || row.bucket || row.name)}-${index}`}
                >
                  <td className="py-3 pr-4 font-medium">
                    {asString(row.section || row.bucket_name || row.bucket || row.name)}
                  </td>
                  <td className="py-3 pr-4 font-semibold">{asString(row.priority) || "—"}</td>
                  <td className="py-3 pr-4 font-mono">{asString(row.score) || "Not scored"}</td>
                  <td className="py-3 pr-4">{asString(row.health) || "—"}</td>
                  <td className="py-3 pr-4">{asString(row.risk_level || row.risk) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
