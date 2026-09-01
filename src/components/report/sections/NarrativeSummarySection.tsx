import type { ReportPage, SharedSectionProps } from "./shared";
import { normalizeList, placeholderText } from "./shared";
import { asArray, asNumber, asRecord, asString, displayBucketName } from "@/lib/report-model";
import { QUESTION_BANK, formatBucketOption } from "../../../../worker/src/question-bank";

const SUMMARY_PILLARS = {
  Accessibility: [
    { name: "Visual Feedback", aliases: ["Feedback & System States"] },
    { name: "Color & Contrast", aliases: ["Accessibility & Inclusivity"] },
    { name: "Typography & Readability", aliases: ["Visual Hierarchy & Layout"] },
    { name: "Keyboard Navigation", aliases: ["Input, Errors & Validation"] },
    { name: "Screen Reader Support", aliases: ["Accessibility & Inclusivity"] },
  ],
  Impact: [
    { name: "Navigation & Findability", aliases: ["Navigation & Findability"] },
    { name: "Consistency & UI Patterns", aliases: ["Consistency & UI Patterns"] },
    { name: "Content (Impact)", aliases: ["Content & UX Writing"] },
    { name: "Performance", aliases: ["code optimisation"] },
  ],
  Delight: [
    { name: "Visual Consistency", aliases: ["Visual Hierarchy & Layout"] },
    { name: "Motion & Microinteractions", aliases: ["Feedback & System States"] },
    { name: "Content (Delight)", aliases: ["Content & UX Writing"] },
    { name: "Brand Expression", aliases: ["Visual Hierarchy & Layout"] },
    { name: "Icons & Imagery", aliases: ["Accessibility & Inclusivity"] },
  ],
} as const;

type SummaryBucketSpec = {
  name: string;
  aliases: readonly string[];
};

type SummaryPillar = keyof typeof SUMMARY_PILLARS;
type SummaryBucketData = {
  topProblems: readonly string[];
  whatsWorking: readonly string[];
};

type NarrativeSummarySectionProps = SharedSectionProps & {
  pillar?: SummaryPillar;
  bucketData?: Partial<Record<string, SummaryBucketData>>;
  bucketNames?: readonly string[];
};

function bucketName(bucket: Record<string, unknown>) {
  return (
    asString(bucket.bucket_name) ||
    asString(bucket.section) ||
    asString(bucket.bucket) ||
    "Bucket"
  );
}

function looksLikeRecommendation(text: unknown) {
  const normalized = normalizeKey(text);
  if (!normalized) return false;

  return (
    /^(implement|add|ensure|introduce|improve|remove|update|create|test|run|conduct|document|rework|fix|make|provide|use)\b/.test(
      normalized,
    ) ||
    /\b(should|need to|needs to|to improve|to guide users|to prevent|so users|to help|verify further)\b/.test(
      normalized,
    )
  );
}

function looksLikeWeakStatus(text: unknown) {
  const normalized = normalizeKey(text);
  if (!normalized) return false;

  return (
    /^(pass|partial|fail|not tested|n\/a|na|average|critical|good|excellent|poor|moderate|fair|partially met|mostly meets|fully meets|meets|does not meet|not met|major issues|missing or severe issues|minor gaps remain|usable but inconsistent|insufficient evidence|scoring unavailable|not scored|needs follow-up)$/i.test(
      normalized,
    ) ||
    /\b(pass|partial|fail|not tested|n\/a|na|partially met|mostly meets|fully meets|meets|major issues|missing or severe issues|minor gaps remain|usable but inconsistent|insufficient evidence|scoring unavailable|not scored|needs follow-up)\b/.test(
      normalized,
    )
  );
}

function isNeutralSummaryText(text: unknown) {
  const normalized = normalizeKey(text);
  if (!normalized) return true;

  return (
    /^(the )?audit did not /i.test(normalized) ||
    /^(the )?site primarily presents /i.test(normalized) ||
    /^(the )?pages audited /i.test(normalized) ||
    normalized.includes("product/marketing page") ||
    normalized.includes("it is marketing page") ||
    normalized.includes("page does not have any form") ||
    normalized.includes("do not show forms or submission actions") ||
    normalized.includes("did not capture any success states or confirmation feedback") ||
    normalized.includes("did not find any visible success messages or explanations after user actions") ||
    normalized.includes("simple navigation without visible multi-step processes requiring progress indicators") ||
    normalized.includes("no clear indication when the system is processing") ||
    normalized.includes("clickable elements result in immediate visual changes") ||
    normalized.includes("visual states are consistently applied and easily distinguishable") ||
    normalized.includes("all tested clickable elements provide immediate visible feedback") ||
    normalized.includes("immediate visual changes, confirming the action was registered")
  );
}

function isWorkingStrengthText(text: unknown) {
  return (
    Boolean(text) &&
    !placeholderText(text) &&
    !looksLikeRecommendation(text) &&
    !looksLikeWeakStatus(text) &&
    !/^\s*(no|not|without|lack|lacks|missing|fails|cannot|can't|won't|does not|do not|may not|might not)\b/i.test(
      normalizeKey(text),
    )
  );
}

function synthesizeBucketStrengthFallback(bucket: Record<string, unknown>) {
  const bucketName = bucketLabel(bucket);
  const score = asNumber(bucket.score);
  const health = normalizeKey(asString(bucket.health));

  if (score !== null) {
    if (score >= 80 || /\b(excellent|good|optimized|optimised)\b/.test(health)) {
      return [`${bucketName} is functioning well and gives us a solid base to build on.`];
    }

    if (score >= 50 || /\b(average|moderate|fair)\b/.test(health)) {
      return [
        `${bucketName} is mostly usable, with only minor gaps in some UI states that were not fully captured in evidence.`,
      ];
    }

    return [`${bucketName} has a baseline in place, but it still needs refinement to feel consistently reliable.`];
  }

  const healthText = asString(bucket.health).trim();
  if (healthText && !looksLikeWeakStatus(healthText) && !looksLikeRecommendation(healthText)) {
    return [healthText];
  }

  return [];
}

function bucketRationaleItems(
  bucket: Record<string, unknown>,
  key: "what_is_risky" | "what_is_working",
) {
  const rationale = asRecord(bucket.score_rationale) ?? {};
  const directItems = normalizeList(rationale[key], 8).map(cleanNarrativeText).filter(
    (item) =>
      !placeholderText(item) &&
      !looksEllipsizedText(item) &&
      !isNeutralSummaryText(item) &&
      (key === "what_is_risky" || isWorkingStrengthText(item)),
  );
  if (directItems.length) return directItems;

  const summaryItems = normalizeList(rationale.summary, 4).map(cleanNarrativeText).filter(
    (item) =>
      !placeholderText(item) &&
      !looksEllipsizedText(item) &&
      !isNeutralSummaryText(item) &&
      (key === "what_is_risky" || isWorkingStrengthText(item)),
  );
  if (summaryItems.length) return summaryItems;

  if (key === "what_is_working") {
    const questionItems = asArray(bucket.questions)
      .map((item) => asRecord(item) ?? {})
      .map((item) => cleanNarrativeText(synthesizeWorkingQuestionTakeaway(bucketLabel(bucket), item)))
      .filter(
        (item) =>
          item &&
          !placeholderText(item) &&
          !looksEllipsizedText(item) &&
          !isNeutralSummaryText(item) &&
          isWorkingStrengthText(item),
      );
    if (questionItems.length) return normalizeList(questionItems, 4);

    return [];
  }

  const findings = asArray(bucket.findings)
    .map((item) => asRecord(item) ?? {})
    .map((item) => cleanNarrativeText(item.observation || item.what_we_found || item.question || item.evidence))
    .filter(
      (item) =>
        item &&
        !placeholderText(item) &&
        !looksEllipsizedText(item) &&
        !isNeutralSummaryText(item) &&
        !looksLikeWeakStatus(item),
    );
  if (findings.length) return normalizeList(findings, 4);

  const improvements = asArray(bucket.improvements)
    .map((item) => asRecord(item) ?? {})
    .map((item) => cleanNarrativeText(item.observation || item.question || item.evidence))
    .filter(
      (item) =>
        item &&
        !placeholderText(item) &&
        !looksEllipsizedText(item) &&
        !isNeutralSummaryText(item) &&
        !looksLikeWeakStatus(item),
    );
  if (improvements.length) return normalizeList(improvements, 4);

  const questionItems = asArray(bucket.questions)
    .map((item) => asRecord(item) ?? {})
    .map((item) => cleanNarrativeText(synthesizeQuestionTakeaway(bucketLabel(bucket), item, "risk")))
    .filter((item) => item && !placeholderText(item) && !looksEllipsizedText(item) && !isNeutralSummaryText(item));
  if (questionItems.length) return normalizeList(questionItems, 4);

  return normalizeList(bucket.summary || bucket.note || bucket.rationale || "", 4).filter(
    (item) => !placeholderText(item) && !looksEllipsizedText(item) && !isNeutralSummaryText(item),
  );
}

function bucketLabel(bucket: Record<string, unknown>) {
  return (
    asString(bucket.bucket_name) ||
    asString(bucket.section) ||
    asString(bucket.bucket) ||
    "Bucket"
  );
}

function normalizeKey(value: unknown) {
  return asString(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function looksEllipsizedText(value: unknown) {
  return /\.\.\.|…/.test(asString(value));
}

function cleanNarrativeText(value: unknown) {
  return asString(value).replace(/\s*(?:\.{3,}|…)\s*$/, "").trim();
}

function matchesBucket(bucket: Record<string, unknown>, spec: SummaryBucketSpec) {
  const actualName = normalizeKey(bucketName(bucket));
  const pillarBucketName = normalizeKey(spec.name);
  if (actualName === pillarBucketName) return true;
  return spec.aliases.some((alias) => actualName === normalizeKey(alias));
}

function splitIntoColumns(items: readonly string[], columns = 2) {
  const safeColumns = Math.max(1, columns);
  const rowsPerColumn = Math.ceil(items.length / safeColumns);
  return Array.from({ length: safeColumns }, (_, index) =>
    items.slice(index * rowsPerColumn, index * rowsPerColumn + rowsPerColumn),
  ).filter((column) => column.length > 0);
}

function lookupQuestionOptions(bucketNameValue: string, questionId: string) {
  const direct = QUESTION_BANK[bucketNameValue] || [];
  const exact = direct.find((item) => item.id === questionId);
  if (exact?.options?.length) return exact.options;

  for (const questions of Object.values(QUESTION_BANK)) {
    const found = questions.find((item) => item.id === questionId);
    if (found?.options?.length) return found.options;
  }

  return [];
}

function synthesizeQuestionTakeaway(
  bucketNameValue: string,
  question: Record<string, unknown>,
  mode: "risk" | "working",
) {
  const questionId = asString(question.id);
  const selectedState = cleanNarrativeText(asString(question.selected_option_state || question.answer_state));
  const selectedMark = Number(asString(question.selected_option || question.mark));
  const isPassLike = selectedState === "pass" || (Number.isFinite(selectedMark) && selectedMark >= 1);

  if (mode === "risk" && (isPassLike || selectedState === "partial" || selectedState === "fail")) return "";

  const selected = cleanNarrativeText(asString(question.selected_option_text).replace(/^\s*\d+\.\s*/, ""));
  if (selected && !placeholderText(selected)) {
    if (mode === "risk" && (looksLikeWeakStatus(selected) || looksLikeRecommendation(selected))) {
      // Continue searching for a real issue statement.
    } else {
      return selected;
    }
  }

  const option = lookupQuestionOptions(bucketNameValue, questionId).find(
    (item) => item.state === selectedState || Number(item.mark) === selectedMark,
  );
  if (option) {
    const optionText = cleanNarrativeText(formatBucketOption(option));
    if (optionText && !looksEllipsizedText(optionText)) {
      if (mode === "risk" && (looksLikeWeakStatus(optionText) || looksLikeRecommendation(optionText))) {
        // Continue searching for a real issue statement.
      } else {
        return optionText;
      }
    }
  }

  if (mode === "working") return "";

  if (selectedState === "not_tested" || selectedState === "n_a") return "";

  const observation = cleanNarrativeText(question.observation);
  if (observation && !placeholderText(observation) && !looksEllipsizedText(observation)) return observation;

  const questionText = asString(question.question).replace(/\?$/, "").trim();
  if (!questionText) return "";

  return mode === "risk"
    ? `Needs follow-up: ${questionText}.`
    : "";
}

function synthesizeWorkingQuestionTakeaway(bucketNameValue: string, question: Record<string, unknown>) {
  const selectedState = cleanNarrativeText(asString(question.selected_option_state || question.answer_state));
  const selectedMark = Number(asString(question.selected_option || question.mark));
  if (selectedState === "fail" || selectedState === "partial") return "";
  if (Number.isFinite(selectedMark) && selectedMark < 1) return "";

  const observation = cleanNarrativeText(asString(question.observation).replace(/^\s*\d+\.\s*/, ""));
  if (observation && !placeholderText(observation) && !looksLikeRecommendation(observation) && !looksLikeWeakStatus(observation)) {
    return observation;
  }

  const evidence = cleanNarrativeText(asString(question.evidence).replace(/^\s*\d+\.\s*/, ""));
  if (evidence && !placeholderText(evidence) && !looksLikeRecommendation(evidence) && !looksLikeWeakStatus(evidence)) {
    return evidence;
  }

  const selected = cleanNarrativeText(asString(question.selected_option_text).replace(/^\s*\d+\.\s*/, ""));
  if (selected && !placeholderText(selected) && !looksLikeRecommendation(selected) && !looksLikeWeakStatus(selected)) {
    return selected;
  }

  const selectedOption = lookupQuestionOptions(bucketNameValue, asString(question.id)).find(
    (item) => item.state === selectedState || Number(item.mark) === selectedMark,
  );
  const optionText = cleanNarrativeText(selectedOption ? formatBucketOption(selectedOption) : "");
  if (optionText && !looksLikeRecommendation(optionText) && !looksLikeWeakStatus(optionText)) {
    return optionText;
  }

  return "";
}

function renderBucketContent(
  bucket: Record<string, unknown> | null,
  bucketData?: SummaryBucketData,
) {
  const sanitizeProblemItems = (items?: readonly string[]) =>
    normalizeList(items ?? [], 8).map(cleanNarrativeText).filter(
      (item) => Boolean(item && !placeholderText(item) && !looksEllipsizedText(item) && !isNeutralSummaryText(item)),
    );
  const sanitizeWorkingItems = (items?: readonly string[]) =>
    normalizeList(items ?? [], 8).map(cleanNarrativeText).filter(
      (item) =>
        Boolean(item && !placeholderText(item) && !looksEllipsizedText(item) && !isNeutralSummaryText(item) && isWorkingStrengthText(item)),
    );
  const dataTopProblems = sanitizeProblemItems(bucketData?.topProblems);
  const dataWhatsWorking = sanitizeWorkingItems(bucketData?.whatsWorking);
  const topProblems =
    dataTopProblems.length
      ? dataTopProblems
      : bucket
        ? bucketRationaleItems(bucket, "what_is_risky")
        : [];
  const topProblemKeys = new Set(topProblems.map((item) => normalizeKey(cleanNarrativeText(item))));
  const whatsWorkingFromBucket = bucket ? bucketRationaleItems(bucket, "what_is_working") : [];
  const whatsWorking =
    dataWhatsWorking.length
      ? dataWhatsWorking.filter((item) => !topProblemKeys.has(normalizeKey(cleanNarrativeText(item))))
      : whatsWorkingFromBucket.length
        ? whatsWorkingFromBucket.filter(
            (item) => !topProblemKeys.has(normalizeKey(cleanNarrativeText(item))),
          )
        : [];
  return { topProblems, whatsWorking };
}

type SummaryBucketEntry = {
  spec: SummaryBucketSpec;
  bucket: Record<string, unknown> | null;
  bucketData?: SummaryBucketData;
  topProblems: readonly string[];
  whatsWorking: readonly string[];
  estimatedHeight: number;
};

type SummarySectionKey = "topProblems" | "whatsWorking";

type SummaryPageBlock = {
  spec: SummaryBucketSpec;
  bucket: Record<string, unknown> | null;
  bucketData?: SummaryBucketData;
  renderMode: "combined" | SummarySectionKey;
  topProblems: readonly string[];
  whatsWorking: readonly string[];
  estimatedHeight: number;
  continued?: boolean;
};

const SUMMARY_PAGE_CARD_GAP = 20;
const SUMMARY_PAGE_CONTENT_LIMIT = 1065;
const SUMMARY_BULLET_LINE_HEIGHT = 22;
const SUMMARY_BULLET_ITEM_GAP = 12;
const SUMMARY_CHARS_PER_LINE = 44;
const SUMMARY_CARD_FIXED_OVERHEAD = 76;

function estimateBulletItemHeight(text: string) {
  const normalized = text.replace(/^\s*•\s*/, "").trim();
  if (!normalized) return SUMMARY_BULLET_LINE_HEIGHT;
  const lineCount = Math.max(1, Math.ceil(normalized.length / SUMMARY_CHARS_PER_LINE));
  return lineCount * SUMMARY_BULLET_LINE_HEIGHT;
}

function estimateBulletColumnHeight(items: readonly string[]) {
  return items.reduce((total, item, index) => {
    const next = total + estimateBulletItemHeight(item);
    return index === 0 ? next : next + SUMMARY_BULLET_ITEM_GAP;
  }, 0);
}

function estimateBulletSectionHeight(items: readonly string[]) {
  if (!items.length) return 0;
  const columns = splitIntoColumns(items, 2);
  const columnHeights = columns.map((column) => estimateBulletColumnHeight(column));
  const contentHeight = columnHeights.length ? Math.max(...columnHeights) : 0;
  return 24 + 14 + contentHeight;
}

function estimateSummaryBlockHeight(block: {
  renderMode: "combined" | SummarySectionKey;
  topProblems: readonly string[];
  whatsWorking: readonly string[];
}) {
  if (block.renderMode === "combined") {
    const sectionHeights = [
      estimateBulletSectionHeight(block.topProblems),
      estimateBulletSectionHeight(block.whatsWorking),
    ].filter((value) => value > 0);

    if (!sectionHeights.length) return 0;

    const gapBetweenSections = sectionHeights.length > 1 ? 36 : 0;
    return SUMMARY_CARD_FIXED_OVERHEAD + sectionHeights.reduce((sum, value) => sum + value, 0) + gapBetweenSections;
  }

  const items = block.renderMode === "topProblems" ? block.topProblems : block.whatsWorking;
  const sectionHeight = estimateBulletSectionHeight(items);
  if (!sectionHeight) return 0;
  return SUMMARY_CARD_FIXED_OVERHEAD + sectionHeight;
}

function estimateBucketCardHeight(resolved: {
  topProblems: readonly string[];
  whatsWorking: readonly string[];
}) {
  return estimateSummaryBlockHeight({
    renderMode: "combined",
    topProblems: resolved.topProblems,
    whatsWorking: resolved.whatsWorking,
  });
}

function splitItemsToFitSection(items: readonly string[]) {
  const chunks: string[][] = [];
  let current: string[] = [];

  for (const item of items) {
    const next = current.concat(item);
    const candidateHeight = SUMMARY_CARD_FIXED_OVERHEAD + estimateBulletSectionHeight(next);

    if (current.length && candidateHeight > SUMMARY_PAGE_CONTENT_LIMIT) {
      chunks.push(current);
      current = [item];
      continue;
    }

    current = next;
  }

  if (current.length) chunks.push(current);
  return chunks;
}

function buildSummaryBlocks(entries: readonly SummaryBucketEntry[]) {
  const blocks: SummaryPageBlock[] = [];

  for (const entry of entries) {
    if (entry.estimatedHeight <= SUMMARY_PAGE_CONTENT_LIMIT) {
      blocks.push({
        spec: entry.spec,
        bucket: entry.bucket,
        bucketData: entry.bucketData,
        renderMode: "combined",
        topProblems: entry.topProblems,
        whatsWorking: entry.whatsWorking,
        estimatedHeight: entry.estimatedHeight,
      });
      continue;
    }

    const topProblemChunks = splitItemsToFitSection(entry.topProblems);
    const whatsWorkingChunks = splitItemsToFitSection(entry.whatsWorking);

    if (topProblemChunks.length) {
      topProblemChunks.forEach((chunk, index) => {
        blocks.push({
          spec: entry.spec,
          bucket: entry.bucket,
          bucketData: entry.bucketData,
          renderMode: "topProblems",
          topProblems: chunk,
          whatsWorking: [],
          estimatedHeight: estimateSummaryBlockHeight({
            renderMode: "topProblems",
            topProblems: chunk,
            whatsWorking: [],
          }),
          continued: index > 0,
        });
      });
    }

    if (whatsWorkingChunks.length) {
      whatsWorkingChunks.forEach((chunk, index) => {
        blocks.push({
          spec: entry.spec,
          bucket: entry.bucket,
          bucketData: entry.bucketData,
          renderMode: "whatsWorking",
          topProblems: [],
          whatsWorking: chunk,
          estimatedHeight: estimateSummaryBlockHeight({
            renderMode: "whatsWorking",
            topProblems: [],
            whatsWorking: chunk,
          }),
          continued: index > 0,
        });
      });
    }
  }

  return blocks;
}

function resolveSummaryBucketEntries({
  vm,
  pillar,
  bucketData,
  bucketNames,
}: {
  vm: SharedSectionProps["vm"];
  pillar: SummaryPillar;
  bucketData?: Partial<Record<string, SummaryBucketData>>;
  bucketNames?: readonly string[];
}): SummaryBucketEntry[] {
  const bucketsByPillar = new Map<string, Array<Record<string, unknown>>>();
  for (const bucket of vm.bucketResults) {
    const resolvedPillar = asString(bucket.pillar) || "Unassigned";
    if (!bucketsByPillar.has(resolvedPillar)) bucketsByPillar.set(resolvedPillar, []);
    bucketsByPillar.get(resolvedPillar)?.push(bucket);
  }

  const specs = (bucketNames?.length
    ? SUMMARY_PILLARS[pillar].filter((spec) => bucketNames.includes(spec.name))
    : SUMMARY_PILLARS[pillar]) as readonly SummaryBucketSpec[];

  return specs
    .map((spec) => {
      const matched = (bucketsByPillar.get(pillar) || []).find((bucket) => matchesBucket(bucket, spec));
      const directBucketData = bucketData?.[spec.name];
      const resolved = renderBucketContent(matched ?? null, directBucketData);
      if (!resolved.topProblems.length && !resolved.whatsWorking.length) return null;
      return {
        spec,
        bucket: matched ?? null,
        bucketData: directBucketData,
        topProblems: resolved.topProblems,
        whatsWorking: resolved.whatsWorking,
        estimatedHeight: estimateBucketCardHeight(resolved),
      };
    })
    .filter(Boolean) as SummaryBucketEntry[];
}

function paginateSummaryBucketEntries(entries: readonly SummaryBucketEntry[]) {
  const pages: SummaryBucketEntry[][] = [];
  let currentPage: SummaryBucketEntry[] = [];
  let currentHeight = 0;

  for (const entry of entries) {
    const gap = currentPage.length ? SUMMARY_PAGE_CARD_GAP : 0;
    const entryHeight = entry.estimatedHeight;

    if (currentPage.length && currentHeight + gap + entryHeight > SUMMARY_PAGE_CONTENT_LIMIT) {
      pages.push(currentPage);
      currentPage = [entry];
      currentHeight = entryHeight;
      continue;
    }

    currentPage.push(entry);
    currentHeight += gap + entryHeight;
  }

  if (currentPage.length) pages.push(currentPage);
  return pages;
}

function paginateSummaryBlocks(blocks: readonly SummaryPageBlock[]) {
  const pages: SummaryPageBlock[][] = [];
  let currentPage: SummaryPageBlock[] = [];
  let currentHeight = 0;

  for (const block of blocks) {
    const gap = currentPage.length ? SUMMARY_PAGE_CARD_GAP : 0;
    const nextHeight = currentHeight + gap + block.estimatedHeight;

    if (currentPage.length && nextHeight > SUMMARY_PAGE_CONTENT_LIMIT) {
      pages.push(currentPage);
      currentPage = [block];
      currentHeight = block.estimatedHeight;
      continue;
    }

    currentPage.push(block);
    currentHeight = nextHeight;
  }

  if (currentPage.length) pages.push(currentPage);
  return pages;
}

export function SummaryBulletColumns({ items }: { items: readonly string[] }) {
  const columns = splitIntoColumns(items, 2);
  if (!columns.length) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {columns.map((column, index) => (
        <ul
          key={`${index}-${column[0] || "empty"}`}
          className="min-w-0 list-disc space-y-4 pl-5 text-[14px] leading-[1.5] text-[color:var(--report-black)]"
        >
          {column.map((item) => (
            <li key={item} className="break-words">
              {item}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function SummaryBucketCard({
  spec,
  bucket,
  bucketData,
  renderMode = "combined",
  continued = false,
}: {
  spec: SummaryBucketSpec;
  bucket: Record<string, unknown> | null;
  bucketData?: SummaryBucketData;
  renderMode?: "combined" | SummarySectionKey;
  continued?: boolean;
}) {
  const currentBucketLabel = displayBucketName(spec.name);
  const resolved = renderBucketContent(bucket, bucketData);
  const showTopProblems = (renderMode === "combined" || renderMode === "topProblems") && resolved.topProblems.length > 0;
  const showWhatsWorking = (renderMode === "combined" || renderMode === "whatsWorking") && resolved.whatsWorking.length > 0;

  if (!showTopProblems && !showWhatsWorking) return null;

  return (
    <div className="print-avoid-break rounded-[12px] border border-transparent bg-[color:var(--report-grey-bg)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-[16px] font-semibold leading-tight text-[color:var(--report-black)]">
        <span>{currentBucketLabel}</span>
        {continued ? (
          <span className="text-[12px] font-medium text-[color:var(--report-grey-font)]">
            continued
          </span>
        ) : null}
      </div>
      <div className="mt-4 border-t border-[color:var(--card-border)]/60" />
      <div className="mt-4 space-y-8">
        {showTopProblems ? (
          <div className="min-w-0">
            <div className="text-[14px] font-semibold leading-tight text-[color:var(--report-grey-font)]">
              Top Problems:
            </div>
            <div className="mt-3">
              <SummaryBulletColumns items={resolved.topProblems} />
            </div>
          </div>
        ) : null}
        {showWhatsWorking ? (
          <div className="min-w-0">
            <div className="text-[14px] font-semibold leading-tight text-[color:var(--report-grey-font)]">
              What&apos;s Working
            </div>
            <div className="mt-3">
              <SummaryBulletColumns items={resolved.whatsWorking} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function NarrativeSummarySection({
  vm,
  pillar,
  bucketData,
  bucketNames: selectedBucketNames,
  blocks,
}: NarrativeSummarySectionProps & { blocks?: SummaryPageBlock[] }) {
  const pillarBucketsOrder = (
    pillar
      ? ([[pillar, SUMMARY_PILLARS[pillar]]] as Array<[SummaryPillar, readonly SummaryBucketSpec[]]>)
      : (Object.entries(SUMMARY_PILLARS) as Array<[SummaryPillar, readonly SummaryBucketSpec[]]>)
  ) as Array<[SummaryPillar, readonly SummaryBucketSpec[]]>;

  if (blocks?.length) {
    return (
      <div className="space-y-5">
        {blocks.map((block, index) => (
          <SummaryBucketCard
            key={`${block.spec.name}-${block.renderMode}-${index}`}
            spec={block.spec}
            bucket={block.bucket}
            bucketData={block.bucketData}
            renderMode={block.renderMode}
            continued={block.continued}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {pillarBucketsOrder.map(([currentPillar, pillarSpecs]) => {
        const visibleSpecs = selectedBucketNames
          ? pillarSpecs.filter((spec) => selectedBucketNames.includes(spec.name))
          : pillarSpecs;
        const pillarBuckets = resolveSummaryBucketEntries({
          vm,
          pillar: currentPillar,
          bucketData,
          bucketNames: visibleSpecs.map((spec) => spec.name),
        });

        return (
          <section key={currentPillar} className="space-y-4">
            <div className="space-y-4">
              {pillarBuckets.map(({ spec, bucket, bucketData: directBucketData }, index) => (
                <SummaryBucketCard
                  key={`${currentPillar}-${spec.name}-${index}`}
                  spec={spec}
                  bucket={bucket}
                  bucketData={directBucketData}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function buildNarrativeSummaryPages({
  vm,
  pillar,
  bucketData,
}: {
  vm: SharedSectionProps["vm"];
  pillar: SummaryPillar;
  bucketData?: Partial<Record<string, SummaryBucketData>>;
}): ReportPage[] {
  const entries = resolveSummaryBucketEntries({ vm, pillar, bucketData });
  const blocks = buildSummaryBlocks(entries);
  const chunks = paginateSummaryBlocks(blocks);
  if (!chunks.length) {
    return [
      {
        key: `narrative_summary_${pillar.toLowerCase()}`,
        title: `Summary - ${pillar}`,
        body: <NarrativeSummarySection vm={vm} pillar={pillar} bucketData={bucketData} />,
        variant: "standard",
      },
    ];
  }

  return chunks.map((chunk, index) => ({
    key: `narrative_summary_${pillar.toLowerCase()}_${index + 1}`,
    title: `Summary - ${pillar}`,
    body: (
      <NarrativeSummarySection
        vm={vm}
        pillar={pillar}
        bucketData={bucketData}
        blocks={chunk}
      />
    ),
    variant: "standard",
  }));
}
