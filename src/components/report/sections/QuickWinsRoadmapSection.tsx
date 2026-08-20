import { asString, type AnyRecord } from "@/lib/report-model";
import { BulletList, type ReportPage, type SharedSectionProps } from "./shared";

const QUICK_WINS_PAGE_CONTENT_LIMIT = 880;
const QUICK_WINS_PAGE_HEADER_HEIGHT = 122;
const QUICK_WINS_PAGE_ROW_GAP = 14;
const QUICK_WINS_TEXT_CHARS_PER_LINE = 54;
const QUICK_WINS_TEXT_LINE_HEIGHT = 18;
const QUICK_WINS_ROW_PADDING = 26;
const QUICK_WINS_ROADMAP_PAGE_HEIGHT = 330;

function estimateQuickWinRowHeight(item: AnyRecord) {
  const finding = asString(item.finding) || asString(item.question) || asString(item.observation) || "—";
  const recommendation =
    asString(item.recommendation) || asString(item.action) || asString(item.observation) || finding;
  const findingLines = Math.max(1, Math.ceil(finding.length / QUICK_WINS_TEXT_CHARS_PER_LINE));
  const recommendationLines = Math.max(1, Math.ceil(recommendation.length / QUICK_WINS_TEXT_CHARS_PER_LINE));
  const lineCount = Math.max(findingLines, recommendationLines);
  return QUICK_WINS_ROW_PADDING + lineCount * QUICK_WINS_TEXT_LINE_HEIGHT;
}

function paginateQuickWinRows(rows: readonly AnyRecord[]) {
  const pages: AnyRecord[][] = [];
  let currentPage: AnyRecord[] = [];
  let currentHeight = QUICK_WINS_PAGE_HEADER_HEIGHT;

  for (const row of rows) {
    const rowHeight = estimateQuickWinRowHeight(row);
    const gap = currentPage.length ? QUICK_WINS_PAGE_ROW_GAP : 0;
    const nextHeight = currentHeight + gap + rowHeight;

    if (currentPage.length && nextHeight > QUICK_WINS_PAGE_CONTENT_LIMIT) {
      pages.push(currentPage);
      currentPage = [row];
      currentHeight = QUICK_WINS_PAGE_HEADER_HEIGHT + rowHeight;
      continue;
    }

    currentPage.push(row);
    currentHeight = nextHeight;
  }

  if (currentPage.length) pages.push(currentPage);
  return pages;
}

export function buildQuickWinsRoadmapPages({ vm }: SharedSectionProps): ReportPage[] {
  const quickWinsRows = vm.quickWinsTable;
  const rowPages = paginateQuickWinRows(quickWinsRows);
  const pages = rowPages.length ? rowPages : [[]];

  return [
    ...pages.map((pageRows, index) => ({
      key: `quick_wins_roadmap_${index + 1}`,
      title: "Quick Wins & Roadmap",
      body: <QuickWinsRoadmapSection vm={vm} quickWinsRows={pageRows} continued={index > 0} showRoadmap={false} />,
      variant: "standard" as const,
      showTitle: true,
    })),
    {
      key: "quick_wins_roadmap_plan",
      title: "Quick Wins & Roadmap",
      body: <QuickWinsRoadmapSection vm={vm} quickWinsRows={[]} continued={pages.length > 0} showRoadmap />,
      variant: "standard" as const,
      showTitle: true,
    },
  ];
}

export function QuickWinsRoadmapSection({
  vm,
  quickWinsRows = vm.quickWinsTable,
  showRoadmap = true,
  continued = false,
}: SharedSectionProps & {
  quickWinsRows?: AnyRecord[];
  showRoadmap?: boolean;
  continued?: boolean;
}) {
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

  const quickWins = quickWinsRows;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-semibold">Quick wins table</div>
          {continued ? <div className="text-xs text-[color:var(--ink-muted)]">continued</div> : null}
        </div>
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

      {showRoadmap ? (
        <div className="space-y-4">
          <div className="text-sm font-semibold">Roadmap</div>
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
      ) : null}

    </div>
  );
}
