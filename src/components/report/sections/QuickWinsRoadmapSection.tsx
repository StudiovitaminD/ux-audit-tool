<<<<<<< HEAD
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
=======
import { asString } from "@/lib/report-model";
import { BulletList, type SharedSectionProps } from "./shared";
import type { ReportPage } from "./shared";

type QuickWinRow = {
  finding?: unknown;
  recommendation?: unknown;
  estimated_time?: unknown;
};

type RoadmapBlock = {
  title: string;
  items: string[];
  continued?: boolean;
};

const QUICK_WINS_PAGE_CONTENT_LIMIT = 940;
const QUICK_WINS_TABLE_BASE_HEIGHT = 120;
const QUICK_WINS_ROW_GAP = 0;
const QUICK_WINS_ROW_LINE_HEIGHT = 18;
const QUICK_WINS_ROW_CHARS_PER_LINE = 54;
const QUICK_WINS_ROADMAP_CARD_BASE_HEIGHT = 74;
const QUICK_WINS_ROADMAP_ITEM_GAP = 8;
const QUICK_WINS_ROADMAP_CHARS_PER_LINE = 56;

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
>>>>>>> bf0192f (fix pdf report rendering)
      continue;
    }

    currentPage.push(row);
    currentHeight = nextHeight;
  }

  if (currentPage.length) pages.push(currentPage);
  return pages;
}

<<<<<<< HEAD
export function buildQuickWinsRoadmapPages({ vm }: SharedSectionProps): ReportPage[] {
  const quickWinsRows = vm.quickWinsTable;
  if (!quickWinsRows.length) return [];
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
=======
function QuickWinsRoadmapBody({
  quickWins,
  roadmapBlocks,
  closingNote,
  isLimitedCoverage,
  suggestedNextSteps,
}: {
  quickWins: QuickWinRow[];
  roadmapBlocks: RoadmapBlock[];
  closingNote: string;
  isLimitedCoverage: boolean;
  suggestedNextSteps: string[];
}) {
  if (isLimitedCoverage) {
>>>>>>> bf0192f (fix pdf report rendering)
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
            <BulletList items={suggestedNextSteps} emptyLabel="Add more evidence and re-run the audit." />
          </div>
        </div>

<<<<<<< HEAD
=======
        {closingNote ? (
          <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
            <div className="text-sm font-semibold">Closing note</div>
            <div className="mt-3 text-sm text-[color:var(--muted)]">{closingNote}</div>
          </div>
        ) : null}
>>>>>>> bf0192f (fix pdf report rendering)
      </div>
    );
  }

<<<<<<< HEAD
  const quickWins = quickWinsRows;

=======
>>>>>>> bf0192f (fix pdf report rendering)
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
        {continued ? <div className="text-right text-xs text-[color:var(--ink-muted)]">continued</div> : null}
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

<<<<<<< HEAD
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
=======
      <div className="grid gap-4">
        {roadmapBlocks.map((block) => (
          <div key={block.title} className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
            <div className="text-sm font-semibold">
              {block.title} {block.continued ? <span className="text-xs font-medium text-[color:var(--muted)]">continued</span> : null}
            </div>
            <BulletList items={block.items} emptyLabel="No actions listed." />
          </div>
        ))}
      </div>

      {closingNote ? (
        <div className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
          <div className="text-sm font-semibold">Closing note</div>
          <div className="mt-3 text-sm text-[color:var(--muted)]">{closingNote}</div>
>>>>>>> bf0192f (fix pdf report rendering)
        </div>
      ) : null}

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
      roadmapBlocks={[
        { title: "Week 1–2", items: vm.roadmap.week_1_2 },
        { title: "Month 1", items: vm.roadmap.month_1 },
        { title: "Quarter 1", items: vm.roadmap.quarter_1 },
      ]}
      closingNote={vm.closingNote}
      isLimitedCoverage={vm.isLimitedCoverage}
      suggestedNextSteps={vm.captureCoverage.suggestedNextSteps}
    />
  );
}

export function buildQuickWinsRoadmapPages({ vm }: SharedSectionProps): ReportPage[] {
  if (vm.isLimitedCoverage) {
    return [
      {
        key: "quick_wins_roadmap",
        title: "Quick Wins & Roadmap",
        body: (
          <QuickWinsRoadmapBody
            quickWins={[]}
            roadmapBlocks={[]}
            closingNote={vm.closingNote}
            isLimitedCoverage={true}
            suggestedNextSteps={vm.captureCoverage.suggestedNextSteps}
          />
        ),
        variant: "standard",
      },
    ];
  }

  const quickWins = vm.quickWinsTable.map((item) => ({
    finding: item.finding,
    recommendation: item.recommendation,
    estimated_time: item.estimated_time,
  }));
  const tablePages = splitQuickWinRows(quickWins);
  const roadmapBlocks: RoadmapBlock[] = [
    { title: "Week 1–2", items: vm.roadmap.week_1_2 },
    { title: "Month 1", items: vm.roadmap.month_1 },
    { title: "Quarter 1", items: vm.roadmap.quarter_1 },
  ];
  const pages: ReportPage[] = [];

  tablePages.forEach((pageRows, index) => {
    pages.push({
      key: `quick_wins_roadmap_table_${index + 1}`,
      title: "Quick Wins & Roadmap",
      body: (
        <QuickWinsRoadmapBody
          quickWins={pageRows}
          roadmapBlocks={[]}
          closingNote=""
          isLimitedCoverage={false}
          suggestedNextSteps={[]}
        />
      ),
      variant: "standard",
      showTitle: index === 0,
    });
  });

  pages.push({
    key: "quick_wins_roadmap_roadmap",
    title: "Quick Wins & Roadmap",
    body: (
      <QuickWinsRoadmapBody
        quickWins={[]}
        roadmapBlocks={roadmapBlocks}
        closingNote={vm.closingNote}
        isLimitedCoverage={false}
        suggestedNextSteps={[]}
      />
    ),
    variant: "standard",
    showTitle: false,
  });

  if (!pages.length) {
    pages.push({
      key: "quick_wins_roadmap",
      title: "Quick Wins & Roadmap",
      body: (
        <QuickWinsRoadmapBody
          quickWins={[]}
          roadmapBlocks={[]}
          closingNote={vm.closingNote}
          isLimitedCoverage={false}
          suggestedNextSteps={[]}
        />
      ),
      variant: "standard",
    });
  }

  return pages;
}
