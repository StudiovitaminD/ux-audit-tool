import industryRulesData from "./knowledge/ui-ux-pro-max/ui-reasoning-data.js";
import uxGuidelinesData from "./knowledge/ui-ux-pro-max/ux-guidelines-data.js";
const UX_GUIDELINES = uxGuidelinesData;
const INDUSTRY_RULES = industryRulesData;
const BUCKET_TERMS = {
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
const PRODUCT_TERMS = {
    saas: "saas software dashboard platform b2b productivity",
    ecommerce: "e-commerce ecommerce retail store shopping marketplace product checkout",
    marketing_website: "marketing website landing page service agency portfolio lead generation",
};
function tokens(value) {
    return new Set(String(value ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 2));
}
function relevance(query, value) {
    const candidate = tokens(value);
    let score = 0;
    query.forEach((token) => {
        if (candidate.has(token))
            score += 1;
    });
    return score;
}
export function retrieveRecommendationGuidance(args) {
    const guidelineQuery = tokens(`${args.bucket} ${BUCKET_TERMS[args.bucket] || ""} ${args.questionText || ""}`);
    const industryQuery = tokens(`${PRODUCT_TERMS[args.productType || ""] || args.productType || ""} ${args.productContext || ""}`);
    const guidelines = UX_GUIDELINES
        .map((item) => ({
        item,
        score: relevance(guidelineQuery, `${item.Category} ${item.Issue} ${item.Description} ${item.Do} ${item["Don't"]}`),
    }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || Number(a.item.No) - Number(b.item.No))
        .slice(0, args.guidelineLimit ?? 4)
        .map((entry) => entry.item);
    const industryRules = INDUSTRY_RULES
        .map((item) => ({
        item,
        score: relevance(industryQuery, `${item.UI_Category} ${item.Recommended_Pattern} ${item.Reasoning} ${item.Anti_Patterns}`),
    }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || Number(a.item.No) - Number(b.item.No))
        .slice(0, args.industryLimit ?? 2)
        .map((entry) => entry.item);
    return { guidelines, industryRules };
}
export function buildRecommendationGuidanceContext(args) {
    const guidance = retrieveRecommendationGuidance(args);
    if (!guidance.guidelines.length && !guidance.industryRules.length)
        return "No matching advisory guidance.";
    const guidelineLines = guidance.guidelines.map((item) => `[UX-${item.No}] ${item.Category} / ${item.Issue}: ${item.Description} Recommended: ${item.Do} Avoid: ${item["Don't"]}`);
    const industryLines = guidance.industryRules.map((item) => `[IND-${item.No}] ${item.UI_Category}: pattern=${item.Recommended_Pattern}; anti-patterns=${item.Anti_Patterns}`);
    return [...industryLines, ...guidelineLines].join("\n");
}
