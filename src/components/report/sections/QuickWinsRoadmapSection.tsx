import { asString } from "@/lib/report-model";
import { BulletList, type SharedSectionProps } from "./shared";

export function QuickWinsRoadmapSection({ vm }: SharedSectionProps) {
  if (vm.isLimitedCoverage) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
          <div className="text-sm font-semibold">Scoring skipped</div>
          <div className="mt-3 text-sm text-[color:var(--muted)]">
            Quick wins and roadmap were not generated because the report did not capture enough authenticated product evidence to support reliable prioritization.
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5 lg:col-span-3">
            <div className="text-sm font-semibold">Suggested next steps</div>
            <BulletList items={vm.captureCoverage.suggestedNextSteps} emptyLabel="Add more evidence and re-run the audit." />
          </div>
        </div>

      </div>
    );
  }

  const quickWins = vm.quickWinsTable;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
        <div className="mt-4 overflow-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
              <tr>
                <th className="py-2 pr-4">Finding</th>
                <th className="py-2 pr-4">Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--card-border)]/60">
              {quickWins.length ? (
                quickWins.map((item, index) => (
                  <tr key={`${asString(item.finding)}-${index}`}>
                    <td className="py-3 pr-4 font-medium">{asString(item.finding) || "—"}</td>
                    <td className="py-3 pr-4 text-[color:var(--muted)]">
                      {asString(item.recommendation) || "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-3 pr-4 text-[color:var(--muted)]" colSpan={2}>
                    No quick wins captured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
          <div className="text-sm font-semibold">Week 1–2</div>
          <BulletList items={vm.roadmap.week_1_2} emptyLabel="No actions listed." />
        </div>
        <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
          <div className="text-sm font-semibold">Month 1</div>
          <BulletList items={vm.roadmap.month_1} emptyLabel="No actions listed." />
        </div>
        <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
          <div className="text-sm font-semibold">Quarter 1</div>
          <BulletList items={vm.roadmap.quarter_1} emptyLabel="No actions listed." />
        </div>
      </div>

    </div>
  );
}
