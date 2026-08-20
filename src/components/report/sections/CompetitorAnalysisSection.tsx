import type { ReactNode } from "react";
import { asString, type AnyRecord } from "@/lib/report-model";
import type { ReportPage } from "./shared";
import { normalizeList, placeholderText } from "./shared";
import { SummaryBulletColumns } from "./NarrativeSummarySection";

type CompetitorAnalysisSectionProps = {
  competitor: AnyRecord | null;
  index: number;
  total: number;
};

type CompetitorSectionKey = "strengths" | "gaps" | "stealThis";

type CompetitorSectionBlock = {
  title: string;
  items: readonly string[];
  key: CompetitorSectionKey;
  estimatedHeight: number;
  continued?: boolean;
};

type CompetitorPageBlock = {
  competitor: AnyRecord;
  index: number;
  total: number;
  showIntro: boolean;
  showTitle: boolean;
  showPositioning: boolean;
  sections: CompetitorSectionBlock[];
  estimatedHeight: number;
  continued?: boolean;
};

const COMPETITOR_PAGE_CONTENT_LIMIT = 1120;
const COMPETITOR_PAGE_GAP = 16;
const COMPETITOR_TITLE_HEIGHT = 52;
const COMPETITOR_POSITIONING_HEIGHT = 56;
const COMPETITOR_SCREENSHOT_HEIGHT = 312;
const COMPETITOR_SECTION_OVERHEAD = 64;
const COMPETITOR_BULLET_LINE_HEIGHT = 22;
const COMPETITOR_BULLET_ITEM_GAP = 14;
const COMPETITOR_CHARS_PER_LINE = 58;

function splitIntoColumns(items: readonly string[], columns = 2) {
  const safeColumns = Math.max(1, columns);
  const rowsPerColumn = Math.ceil(items.length / safeColumns);
  return Array.from({ length: safeColumns }, (_, index) =>
    items.slice(index * rowsPerColumn, index * rowsPerColumn + rowsPerColumn),
  ).filter((column) => column.length > 0);
}

function estimateParagraphHeight(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;
  const lines = Math.max(1, Math.ceil(normalized.length / COMPETITOR_CHARS_PER_LINE));
  return lines * 18;
}

function estimateBulletItemHeight(text: string) {
  const normalized = text.replace(/^\s*•\s*/, "").trim();
  if (!normalized) return COMPETITOR_BULLET_LINE_HEIGHT;
  const lineCount = Math.max(1, Math.ceil(normalized.length / COMPETITOR_CHARS_PER_LINE));
  return lineCount * COMPETITOR_BULLET_LINE_HEIGHT;
}

function estimateBulletColumnHeight(items: readonly string[]) {
  return items.reduce((total, item, index) => {
    const itemHeight = estimateBulletItemHeight(item);
    return index === 0 ? total + itemHeight : total + COMPETITOR_BULLET_ITEM_GAP + itemHeight;
  }, 0);
}

function estimateBulletSectionHeight(items: readonly string[]) {
  if (!items.length) return 0;
  const columns = splitIntoColumns(items, 2);
  const columnHeights = columns.map((column) => estimateBulletColumnHeight(column));
  const contentHeight = columnHeights.length ? Math.max(...columnHeights) : 0;
  return 24 + 14 + contentHeight;
}

function estimateSectionBlockHeight(items: readonly string[]) {
  return COMPETITOR_SECTION_OVERHEAD + estimateBulletSectionHeight(items);
}

function splitItemsToFitSection(items: readonly string[]) {
  const chunks: string[][] = [];
  let current: string[] = [];

  for (const item of items) {
    const next = current.concat(item);
    if (current.length && estimateSectionBlockHeight(next) > COMPETITOR_PAGE_CONTENT_LIMIT) {
      chunks.push(current);
      current = [item];
      continue;
    }
    current = next;
  }

  if (current.length) chunks.push(current);
  return chunks;
}

function buildCompetitorPageBlocks({
  competitor,
  index,
  total,
}: {
  competitor: AnyRecord;
  index: number;
  total: number;
}) {
  const blocks: CompetitorPageBlock[] = [];
  const brandName = asString(competitor.name) || `Competitor ${index + 1}`;
  const brandUrl = asString(competitor.url) || "URL not captured";
  const signals =
    competitor && typeof competitor.signals === "object" && competitor.signals
      ? (competitor.signals as Record<string, unknown>)
      : {};
  const positioning =
    asString(competitor.positioning) ||
    asString(signals.positioning) ||
    "Positioning not explicitly captured, but the competitor presents a clear market presence.";
  const strengths = normalizeList(competitor.strengths, 8).filter((item) => !placeholderText(item));
  const gaps = normalizeList(competitor.gaps, 8).filter((item) => !placeholderText(item));
  const stealThis = normalizeList(competitor.steal_this, 8).filter((item) => !placeholderText(item));

  const sectionBlocks: CompetitorSectionBlock[] = [];

  const sectionSources: Array<[CompetitorSectionKey, string, readonly string[]]> = [
    ["strengths", "Strengths", strengths],
    ["gaps", "Gaps", gaps],
    ["stealThis", "Steal this", stealThis],
  ];

  for (const [key, title, items] of sectionSources) {
    const chunks = items.length ? splitItemsToFitSection(items) : [];
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      sectionBlocks.push({
        key,
        title,
        items: chunk,
        estimatedHeight: estimateSectionBlockHeight(chunk),
        continued: chunkIndex > 0,
      });
    }
  }

  const introHeight =
    COMPETITOR_TITLE_HEIGHT +
    16 +
    estimateParagraphHeight(positioning) +
    16 +
    COMPETITOR_SCREENSHOT_HEIGHT;

  let currentPage: CompetitorSectionBlock[] = [];
  let currentHeight = introHeight;

  for (const section of sectionBlocks) {
    const sectionGap = currentPage.length ? COMPETITOR_PAGE_GAP : 0;
    const nextHeight = currentHeight + sectionGap + section.estimatedHeight;

    if (currentPage.length && nextHeight > COMPETITOR_PAGE_CONTENT_LIMIT) {
      blocks.push({
        competitor,
        index,
        total,
        showIntro: blocks.length === 0,
        showTitle: true,
        showPositioning: true,
        sections: currentPage,
        estimatedHeight: currentHeight,
        continued: blocks.length > 0,
      });
      currentPage = [section];
      currentHeight = section.estimatedHeight;
      continue;
    }

    currentPage.push(section);
    currentHeight = nextHeight;
  }

  if (!blocks.length) {
    blocks.push({
      competitor,
      index,
      total,
      showIntro: true,
      showTitle: true,
      showPositioning: true,
      sections: currentPage,
      estimatedHeight: currentHeight,
    });
  } else if (currentPage.length) {
    blocks.push({
      competitor,
      index,
      total,
      showIntro: false,
      showTitle: true,
      showPositioning: false,
      sections: currentPage,
      estimatedHeight: currentHeight,
      continued: true,
    });
  }

  return {
    brandName,
    brandUrl,
    positioning,
    strengths,
    gaps,
    stealThis,
    blocks,
  };
}

function SectionBlock({
  title,
  items,
}: {
  title: ReactNode;
  items: readonly string[];
}) {
  return (
    <section className="rounded-xl bg-[color:var(--report-grey-bg)] p-4">
      <div className="text-[16px] font-semibold leading-tight text-[color:var(--report-grey-font)]">
        {title}
      </div>
      <div className="mt-3">
        <SummaryBulletColumns items={items} />
      </div>
    </section>
  );
}

function CompetitorAnalysisPageBody({
  brandName,
  brandUrl,
  positioning,
  block,
  showIntro,
}: {
  brandName: string;
  brandUrl: string;
  positioning: string;
  block: CompetitorPageBlock;
  showIntro: boolean;
}) {
  const competitor = block.competitor;
  const sections = block.sections;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="text-[24px] font-bold leading-tight text-[color:var(--report-black)]">
          Competitor Analysis - {brandName}{" "}
          <span className="text-[16px] font-normal text-[color:var(--report-grey-font)]">
            ({brandUrl})
          </span>
        </div>
        {block.continued ? (
          <div className="text-[12px] font-medium text-[color:var(--report-grey-font)]">
            continued
          </div>
        ) : null}
      </div>
      <div className="border-t border-[color:var(--card-border)]/60" />
      {showIntro ? (
        <>
          <div className="text-[14px] leading-[1.5] text-[color:var(--report-black)]">{positioning}</div>

          <div className="rounded-2xl bg-[color:var(--report-grey-bg)] p-4">
            <div className="relative overflow-hidden rounded-xl bg-[color:var(--report-white)]">
              <div className="h-[290px] w-full">
                {asString(competitor.screenshot) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asString(competitor.screenshot)}
                    alt={`${brandName} screenshot`}
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-[color:var(--report-grey-font)]">
                    Screenshot unavailable
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}

      <div className="space-y-4">
        {sections.map((section) => (
          <SectionBlock
            key={`${section.key}-${section.title}-${section.items[0] || "empty"}`}
            title={
              <span className="flex items-center gap-2">
                <span>{section.title}</span>
                {section.continued ? (
                  <span className="text-[12px] font-medium text-[color:var(--report-grey-font)]">
                    continued
                  </span>
                ) : null}
              </span>
            }
            items={section.items}
          />
        ))}
      </div>

      <div className="text-xs text-[color:var(--report-grey-font)]">
        Competitor {block.index + 1} of {block.total}
      </div>
    </div>
  );
}

export function CompetitorAnalysisSection({
  competitor,
  index,
  total,
}: CompetitorAnalysisSectionProps) {
  if (!competitor) {
    return (
      <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5 text-sm text-[color:var(--report-grey-font)]">
        Competitor analysis is not available for this report.
      </div>
    );
  }

  const pageData = buildCompetitorPageBlocks({ competitor, index, total });

  return (
    <CompetitorAnalysisPageBody
      brandName={pageData.brandName}
      brandUrl={pageData.brandUrl}
      positioning={pageData.positioning}
      block={{
        competitor,
        index,
        total,
        showIntro: true,
        showTitle: true,
        showPositioning: true,
        sections: pageData.blocks.flatMap((pageBlock, pageIndex) =>
          pageIndex === 0 ? pageBlock.sections : [],
        ),
        estimatedHeight: 0,
      }}
      showIntro={true}
    />
  );
}

export function buildCompetitorAnalysisPages({
  competitors,
}: {
  competitors: AnyRecord[];
}): ReportPage[] {
  if (!competitors.length) {
    return [
      {
        key: "competitor_analysis",
        title: "Competitor Analysis",
        body: <CompetitorAnalysisSection competitor={null} index={0} total={0} />,
        variant: "standard",
      },
    ];
  }

  const pages: ReportPage[] = [];

  competitors.forEach((competitor, index) => {
    const pageData = buildCompetitorPageBlocks({ competitor, index, total: competitors.length });
    pageData.blocks.forEach((block, blockIndex) => {
      pages.push({
        key: `competitor_analysis_${index + 1}_${blockIndex + 1}`,
        title: `Competitor Analysis - ${pageData.brandName}`,
        body: (
          <CompetitorAnalysisPageBody
            brandName={pageData.brandName}
            brandUrl={pageData.brandUrl}
            positioning={pageData.positioning}
            block={block}
            showIntro={block.showIntro}
          />
        ),
        variant: "standard",
        showTitle: false,
      });
    });
  });

  return pages;
}
