import industryRulesData from "./knowledge/ui-ux-pro-max/ui-reasoning-data.js";
import uxGuidelinesData from "./knowledge/ui-ux-pro-max/ux-guidelines-data.js";

type UxGuideline = {
  No: string;
  Category: string;
  Issue: string;
  Platform: string;
  Description: string;
  Do: string;
  "Don't": string;
  "Code Example Good": string;
  "Code Example Bad": string;
  Severity: string;
};

type IndustryRule = {
  No: string;
  UI_Category: string;
  Recommended_Pattern: string;
  Style_Priority: string;
  Color_Mood: string;
  Typography_Mood: string;
  Key_Effects: string;
  Decision_Rules: string;
  Anti_Patterns: string;
  Severity: string;
  Reasoning: string;
  Confidence: string;
};

export type RecommendationGuidance = {
  guidelines: UxGuideline[];
  industryRules: IndustryRule[];
};

const UX_GUIDELINES = uxGuidelinesData as unknown as UxGuideline[];
const INDUSTRY_RULES = industryRulesData as unknown as IndustryRule[];

const BUCKET_TERMS: Record<string, string> = {
  "Visual Feedback": "feedback loading progress success error interaction state",
  "Color & Contrast": "color contrast readability accessibility focus error",
  "Typography & Readability": "typography text readability hierarchy spacing zoom",
  "Keyboard Navigation": "keyboard focus navigation modal tab accessibility",
  "Screen Reader Support": "screen reader semantic aria labels accessibility",
  "Navigation & Findability": "navigation menu search findability breadcrumbs information architecture",
  "Consistency & UI Patterns": "consistency components patterns buttons forms design system",
  "Content (Impact)": "content copy labels calls to action clarity conversion",
  Performance: "performance loading responsive assets layout shift",
  "Visual Consistency": "visual consistency color typography spacing layout components",
  "Motion & Microinteractions": "motion animation transitions microinteractions reduced motion",
  "Content (Delight)": "content tone voice whitespace progressive disclosure",
  "Brand Expression": "brand identity personality visual language differentiation",
  "Icons & Imagery": "icons imagery photography illustration alt text",
};

const PRODUCT_TERMS: Record<string, string> = {
  saas: "saas software dashboard platform b2b productivity",
  ecommerce: "e-commerce ecommerce retail store shopping marketplace product checkout",
  marketing_website: "marketing website landing page service agency portfolio lead generation",
};

function tokens(value: unknown) {
  return new Set(
    String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

function relevance(query: Set<string>, value: string) {
  const candidate = tokens(value);
  let score = 0;
  query.forEach((token) => {
    if (candidate.has(token)) score += 1;
  });
  return score;
}

export function retrieveRecommendationGuidance(args: {
  bucket: string;
  questionText?: string;
  productType?: string;
  productContext?: string;
  guidelineLimit?: number;
  industryLimit?: number;
}): RecommendationGuidance {
  const guidelineQuery = tokens(
    `${args.bucket} ${BUCKET_TERMS[args.bucket] || ""} ${args.questionText || ""}`,
  );
  const industryQuery = tokens(
    `${PRODUCT_TERMS[args.productType || ""] || args.productType || ""} ${args.productContext || ""}`,
  );

  const guidelines = UX_GUIDELINES
    .map((item) => ({
      item,
      score: relevance(
        guidelineQuery,
        `${item.Category} ${item.Issue} ${item.Description} ${item.Do} ${item["Don't"]}`,
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.item.No) - Number(b.item.No))
    .slice(0, args.guidelineLimit ?? 4)
    .map((entry) => entry.item);

  const industryRules = INDUSTRY_RULES
    .map((item) => ({
      item,
      score: relevance(
        industryQuery,
        `${item.UI_Category} ${item.Recommended_Pattern} ${item.Reasoning} ${item.Anti_Patterns}`,
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.item.No) - Number(b.item.No))
    .slice(0, args.industryLimit ?? 2)
    .map((entry) => entry.item);

  return { guidelines, industryRules };
}

export function buildRecommendationGuidanceContext(
  args: Parameters<typeof retrieveRecommendationGuidance>[0],
) {
  const guidance = retrieveRecommendationGuidance(args);
  if (!guidance.guidelines.length && !guidance.industryRules.length) return "No matching advisory guidance.";

  const guidelineLines = guidance.guidelines.map(
    (item) =>
      `[UX-${item.No}] ${item.Category} / ${item.Issue}: ${item.Description} Recommended: ${item.Do} Avoid: ${item["Don't"]}`,
  );
  const industryLines = guidance.industryRules.map(
    (item) =>
      `[IND-${item.No}] ${item.UI_Category}: pattern=${item.Recommended_Pattern}; anti-patterns=${item.Anti_Patterns}`,
  );
  return [...industryLines, ...guidelineLines].join("\n");
}
