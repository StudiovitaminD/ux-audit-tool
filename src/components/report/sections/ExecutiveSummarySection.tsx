import { asString, stringifyValue } from "@/lib/report-model";
import { BulletList, normalizeList, type SharedSectionProps } from "./shared";

function isNeutralSummaryText(value: unknown) {
  const text = asString(value).toLowerCase().trim();
  if (!text) return true;

  return (
    text.includes("product/marketing page") ||
    text.includes("it is marketing page") ||
    text.includes("pages audited") ||
    text.includes("do not show forms or submission actions") ||
    text.includes("did not capture any success states or confirmation feedback") ||
    text.includes("did not find any visible success messages or explanations after user actions") ||
    text.includes("simple navigation without visible multi-step processes requiring progress indicators") ||
    text.includes("no clear indication when the system is processing") ||
    text.includes("clickable elements result in immediate visual changes") ||
    text.includes("visual states are consistently applied and easily distinguishable") ||
    text.includes("all tested clickable elements provide immediate visible feedback")
  );
}

export function ExecutiveSummarySection({ vm }: SharedSectionProps) {
  if (vm.isLimitedCoverage && !vm.hasPartialScoring) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-5 print-color-adjust">
          <div className="text-[16px] font-semibold leading-normal">Limited Coverage Report</div>
          <div className="mt-2 text-sm text-amber-900">
            UX score was not calculated because the required product screens were not captured.
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
            <div className="text-[16px] font-semibold leading-normal">What was captured</div>
            <BulletList items={vm.captureCoverage.whatWasCaptured} emptyLabel="No reliable evidence was captured." />
          </div>
          <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
            <div className="text-[16px] font-semibold leading-normal">What was missing</div>
            <BulletList items={vm.captureCoverage.whatWasMissing} emptyLabel="No missing coverage details available." />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
            <div className="text-[16px] font-semibold leading-normal">Why scoring was skipped</div>
            <div className="mt-2 text-sm text-[color:var(--muted)]">
              {vm.captureCoverage.summary || "Insufficient post-login evidence was captured to answer the selected question bank reliably."}
            </div>
          </div>
          <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
            <div className="text-[16px] font-semibold leading-normal">Suggested next steps</div>
            <BulletList items={vm.captureCoverage.suggestedNextSteps} emptyLabel="Add more authenticated evidence and re-run the audit." />
          </div>
        </div>
      </div>
    );
  }

  const summary = vm.executiveSummary;
  const topProblemsSource = normalizeList(summary.top_problems).length
    ? normalizeList(summary.top_problems)
    : normalizeList(summary.top_3_problems);
  const topProblems = normalizeList(
    topProblemsSource.filter((item) => !isNeutralSummaryText(item)),
    10,
  );
  const whatWorksSource = normalizeList(summary.whats_working).length
    ? normalizeList(summary.whats_working)
    : normalizeList(summary.top_3_quick_wins).length
      ? normalizeList(summary.top_3_quick_wins)
      : normalizeList(summary.what_works);
  const whatWorks = normalizeList(
    whatWorksSource.filter((item) => !isNeutralSummaryText(item)),
    10,
  );
  const firstPriority =
    asString(summary.first_priority_recommendation || summary.primary_recommendation) ||
    stringifyValue(normalizeList(summary.first_priority, 10)[0]) ||
    stringifyValue(topProblems[0]) ||
    "Primary recommendation not available.";
  const firstPriorityItems = normalizeList(summary.first_priority, 10);
  const summaryQuickWins = normalizeList(
    normalizeList(summary.quick_wins).length ? summary.quick_wins : summary.top_3_quick_wins,
    10,
  );
  const quickWins = vm.quickWinsTable;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
          <div className="text-[16px] font-semibold leading-normal">Top Problems</div>
          <BulletList items={topProblems} emptyLabel="No major problems captured." />
        </div>
        <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
          <div className="text-[16px] font-semibold leading-normal">First Priority</div>
          {firstPriorityItems.length ? (
            <BulletList items={firstPriorityItems} emptyLabel="Primary recommendation not available." />
          ) : (
            <div className="mt-2 text-sm text-[color:var(--muted)]">{firstPriority}</div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
          <div className="text-[16px] font-semibold leading-normal">What&apos;s Working</div>
          <BulletList items={whatWorks} emptyLabel="No strengths captured." />
        </div>
        <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
          <div className="text-[16px] font-semibold leading-normal">Quick Wins</div>
          <BulletList
            items={
              summaryQuickWins.length
                ? summaryQuickWins
                : quickWins.map((item) => item.recommendation || item.finding)
            }
            emptyLabel="No quick wins captured."
          />
        </div>
      </div>
    </div>
  );
}
