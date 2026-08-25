import { asString, type AnyRecord } from "@/lib/report-model";
import type { ReportPage } from "./shared";
import { FindingCard } from "./shared";

const FINDINGS_PAGE_CONTENT_LIMIT = 780;
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
  const criteria = Array.isArray(finding.acceptance_criteria)
    ? finding.acceptance_criteria.map((item) => asString(item)).filter(Boolean)
    : [];

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
  }
  return rows;
}

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
    key: `critical_findings_${index + 1}`,
    title: "Critical Findings",
    body: <FindingsSection findings={pageFindings} />,
    variant: "standard",
    showTitle: index === 0,
  }));
}
