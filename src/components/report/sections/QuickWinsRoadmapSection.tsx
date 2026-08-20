import { asString } from "@/lib/report-model";
import type { SharedSectionProps } from "./shared";
import type { ReportPage } from "./shared";

type QuickWinRow = {
  finding?: unknown;
  recommendation?: unknown;
  estimated_time?: unknown;
};

const QUICK_WINS_PAGE_CONTENT_LIMIT = 940;
const QUICK_WINS_TABLE_BASE_HEIGHT = 120;
const QUICK_WINS_ROW_GAP = 0;
const QUICK_WINS_ROW_LINE_HEIGHT = 18;
const QUICK_WINS_ROW_CHARS_PER_LINE = 54;

function estimateTextHeight(text: string, charsPerLine: number, lineHeight: number) {
  const normalized = text.trim();
  if (!normalized) return 0;
  const lines = Math.max(1, Math.ceil(normalized.length / charsPerLine));
  return lines * lineHeight;
}

function estimateQuickWinRowHeight(row: QuickWinRow) {
  return (
    18 +
    Math.max(
      estimateTextHeight(asString(row.finding), QUICK_WINS_ROW_CHARS_PER_LINE, QUICK_WINS_ROW_LINE_HEIGHT),
      estimateTextHeight(asString(row.recommendation), QUICK_WINS_ROW_CHARS_PER_LINE, QUICK_WINS_ROW_LINE_HEIGHT),
      estimateTextHeight(asString(row.estimated_time), 10, QUICK_WINS_ROW_LINE_HEIGHT),
    )
  );
}

function splitQuickWinRows(rows: QuickWinRow[]) {
  const pages: QuickWinRow[][] = [];
  let currentPage: QuickWinRow[] = [];
  let currentHeight = QUICK_WINS_TABLE_BASE_HEIGHT;

  for (const row of rows) {
    const nextHeight = currentHeight + estimateQuickWinRowHeight(row) + (currentPage.length ? QUICK_WINS_ROW_GAP : 0);
    if (currentPage.length && nextHeight > QUICK_WINS_PAGE_CONTENT_LIMIT) {
      pages.push(currentPage);
      currentPage = [row];
      currentHeight = QUICK_WINS_TABLE_BASE_HEIGHT + estimateQuickWinRowHeight(row);
      continue;
    }

    currentPage.push(row);
    currentHeight = nextHeight;
  }

  if (currentPage.length) pages.push(currentPage);
  return pages;
}

function QuickWinsRoadmapBody({
  quickWins,
}: {
  quickWins: QuickWinRow[];
}) {
  if (!quickWins.length) return null;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
        <div className="mt-4 overflow-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
              <tr>
                <th className="py-2 pr-4">Finding</th>
                <th className="py-2 pr-4">Recommendation</th>
                <th className="py-2 pr-4">ETA</th>
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
                    <td className="py-3 pr-4 font-mono">{asString(item.estimated_time) || "—"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-3 pr-4 text-[color:var(--muted)]" colSpan={3}>
                    No quick wins captured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function QuickWinsRoadmapSection({ vm }: SharedSectionProps) {
  return (
    <QuickWinsRoadmapBody
      quickWins={vm.quickWinsTable.map((item) => ({
        finding: item.finding,
        recommendation: item.recommendation,
        estimated_time: item.estimated_time,
      }))}
    />
  );
}

export function buildQuickWinsRoadmapPages({ vm }: SharedSectionProps): ReportPage[] {
  const quickWins = vm.quickWinsTable.map((item) => ({
    finding: item.finding,
    recommendation: item.recommendation,
    estimated_time: item.estimated_time,
  }));
  const tablePages = splitQuickWinRows(quickWins);
  const pages: ReportPage[] = [];

  if (!quickWins.length) return pages;

  tablePages.forEach((pageRows, index) => {
    pages.push({
      key: `quick_wins_roadmap_table_${index + 1}`,
      title: "Quick Wins",
      body: (
        <QuickWinsRoadmapBody
          quickWins={pageRows}
        />
      ),
      variant: "standard",
      showTitle: index === 0,
    });
  });

  return pages;
}
