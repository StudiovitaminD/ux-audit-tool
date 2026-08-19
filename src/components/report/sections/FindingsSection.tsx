import { asString, type AnyRecord } from "@/lib/report-model";
import type { ReportPage } from "./shared";
import { FindingCard } from "./shared";

<<<<<<< HEAD
const FINDINGS_PAGE_CONTENT_LIMIT = 860;
const FINDINGS_PAGE_ROW_GAP = 24;
const FINDINGS_CARD_BASE_HEIGHT = 92;
const FINDINGS_TEXT_CHARS_PER_LINE = 44;
const FINDINGS_TEXT_LINE_HEIGHT = 20;
const FINDINGS_SECTION_LABEL_HEIGHT = 18;
const FINDINGS_SECTION_GAP = 14;
const FINDINGS_CRITERIA_ITEM_GAP = 8;
const FINDINGS_CRITERIA_LINE_HEIGHT = 18;

function estimateTextHeight(text: string) {
  const normalized = text.trim();
  if (!normalized) return FINDINGS_TEXT_LINE_HEIGHT;
  const lineCount = Math.max(1, Math.ceil(normalized.length / FINDINGS_TEXT_CHARS_PER_LINE));
  return lineCount * FINDINGS_TEXT_LINE_HEIGHT;
}

function estimateCriteriaHeight(items: readonly string[]) {
  if (!items.length) return 0;
  return items.reduce((total, item, index) => {
    const itemHeight = estimateTextHeight(item) || FINDINGS_CRITERIA_LINE_HEIGHT;
    return index === 0 ? total + itemHeight : total + FINDINGS_CRITERIA_ITEM_GAP + itemHeight;
  }, 0);
}

function estimateFindingCardHeight(finding: Record<string, unknown>) {
=======
const FINDINGS_PAGE_CONTENT_LIMIT = 980;
const FINDING_ROW_GAP = 24;
const FINDING_CARD_BASE_HEIGHT = 140;
const FINDING_CHARS_PER_LINE = 56;
const FINDING_LINE_HEIGHT = 18;

function estimateTextHeight(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;
  const lines = Math.max(1, Math.ceil(normalized.length / FINDING_CHARS_PER_LINE));
  return lines * FINDING_LINE_HEIGHT;
}

function estimateFindingCardHeight(finding: AnyRecord) {
  const what = asString(finding.what_we_found);
  const why = asString(finding.why_it_matters);
  const recommendation = asString(finding.recommendation);
>>>>>>> bf0192f (fix pdf report rendering)
  const criteria = Array.isArray(finding.acceptance_criteria)
    ? finding.acceptance_criteria.map((item) => asString(item)).filter(Boolean)
    : [];

<<<<<<< HEAD
  const sections = [
    asString(finding.what_we_found),
    asString(finding.why_it_matters),
    asString(finding.recommendation),
  ].map((text) => estimateTextHeight(text));

  const sectionHeight = sections.reduce(
    (total, value, index) => total + (index > 0 ? FINDINGS_SECTION_GAP : 0) + FINDINGS_SECTION_LABEL_HEIGHT + value,
    0,
  );
  const criteriaHeight = criteria.length
    ? FINDINGS_SECTION_LABEL_HEIGHT + FINDINGS_SECTION_GAP + estimateCriteriaHeight(criteria)
    : 0;

  return FINDINGS_CARD_BASE_HEIGHT + sectionHeight + criteriaHeight;
}

function chunkFindingsIntoRows(findings: readonly AnyRecord[]) {
  const rows: { findings: AnyRecord[]; estimatedHeight: number }[] = [];
  for (let index = 0; index < findings.length; index += 2) {
    const rowFindings = findings.slice(index, index + 2);
    rows.push({
      findings: rowFindings,
      estimatedHeight: Math.max(...rowFindings.map((finding) => estimateFindingCardHeight(finding))),
    });
=======
  return (
    FINDING_CARD_BASE_HEIGHT +
    estimateTextHeight(what) +
    estimateTextHeight(why) +
    estimateTextHeight(recommendation) +
    criteria.reduce((sum, item) => sum + estimateTextHeight(item) + 2, 0)
  );
}

function splitFindingsByRow(findings: AnyRecord[]) {
  const rows: AnyRecord[][] = [];
  for (let index = 0; index < findings.length; index += 2) {
    rows.push(findings.slice(index, index + 2));
>>>>>>> bf0192f (fix pdf report rendering)
  }
  return rows;
}

<<<<<<< HEAD
function paginateFindingRows(rows: readonly { findings: AnyRecord[]; estimatedHeight: number }[]) {
  const pages: AnyRecord[][] = [];
  let currentPage: AnyRecord[] = [];
  let currentHeight = 0;

  for (const row of rows) {
    const gap = currentPage.length ? FINDINGS_PAGE_ROW_GAP : 0;
    const nextHeight = currentHeight + gap + row.estimatedHeight;

    if (currentPage.length && nextHeight > FINDINGS_PAGE_CONTENT_LIMIT) {
      pages.push(currentPage);
      currentPage = [...row.findings];
      currentHeight = row.estimatedHeight;
      continue;
    }

    currentPage.push(...row.findings);
    currentHeight = nextHeight;
  }

  if (currentPage.length) pages.push(currentPage);
=======
function paginateFindings(findings: AnyRecord[]) {
  const rows = splitFindingsByRow(findings);
  const pages: AnyRecord[][] = [];
  let currentPage: AnyRecord[][] = [];
  let currentHeight = 0;

  for (const row of rows) {
    const rowHeight = Math.max(...row.map((finding) => estimateFindingCardHeight(finding)), 0);
    const nextHeight = currentPage.length ? currentHeight + FINDING_ROW_GAP + rowHeight : rowHeight;

    if (currentPage.length && nextHeight > FINDINGS_PAGE_CONTENT_LIMIT) {
      pages.push(currentPage.flat());
      currentPage = [row];
      currentHeight = rowHeight;
      continue;
    }

    currentPage.push(row);
    currentHeight = nextHeight;
  }

  if (currentPage.length) pages.push(currentPage.flat());
>>>>>>> bf0192f (fix pdf report rendering)
  return pages;
}

export function FindingsSection({ findings }: { findings: AnyRecord[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {findings.length ? (
        findings.map((finding, index) => (
          <FindingCard key={`${asString(finding.what_we_found)}-${index}`} finding={finding} />
        ))
      ) : (
        <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5 text-sm text-[color:var(--muted)]">
          No critical findings were captured.
        </div>
      )}
    </div>
  );
}

<<<<<<< HEAD
export function buildCriticalFindingPages({ findings }: { findings: AnyRecord[] }): ReportPage[] {
  const rows = chunkFindingsIntoRows(findings);
  const pagesFindings = rows.length ? paginateFindingRows(rows) : [[]];

  return pagesFindings.map((pageFindings, index) => ({
=======
export function buildCriticalFindingsPages({ findings }: { findings: AnyRecord[] }): ReportPage[] {
  const pages = paginateFindings(findings);
  if (!pages.length) {
    return [
      {
        key: "critical_findings",
        title: "Critical Findings",
        body: <FindingsSection findings={[]} />,
        variant: "standard",
      },
    ];
  }

  return pages.map((pageFindings, index) => ({
>>>>>>> bf0192f (fix pdf report rendering)
    key: `critical_findings_${index + 1}`,
    title: "Critical Findings",
    body: <FindingsSection findings={pageFindings} />,
    variant: "standard",
<<<<<<< HEAD
    showTitle: true,
=======
    showTitle: index === 0,
>>>>>>> bf0192f (fix pdf report rendering)
  }));
}
