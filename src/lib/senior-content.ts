export type ProductType = "ecommerce" | "marketing_website" | "saas" | string;

const genericLabels = new Set(["screen", "page", "interface", "website", "component", "experience"]);

export const INDUSTRY_WRITING_RULES: Record<string, string[]> = {
  ecommerce: [
    "Name the product-listing, product-detail, cart, checkout, or account context.",
    "Explain the effect on product discovery, purchase confidence, checkout completion, or trust.",
    "Do not claim conversion impact without behavioral or analytics evidence.",
  ],
  marketing_website: [
    "Name the homepage, service page, proof section, navigation, CTA, or lead form context.",
    "Explain the effect on proposition clarity, trust, service discovery, or lead completion.",
    "Do not claim lead or conversion loss without behavioral or analytics evidence.",
  ],
  saas: [
    "Name the onboarding, dashboard, navigation, workflow, form, status, or error-state context.",
    "Explain the effect on activation, task completion, recovery, or continued product use.",
    "Do not claim retention or revenue impact without behavioral or analytics evidence.",
  ],
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function industryWritingRules(productType: ProductType) {
  return INDUSTRY_WRITING_RULES[productType] || INDUSTRY_WRITING_RULES.marketing_website;
}

export function contextualLabel(record: Record<string, unknown>) {
  const explicit = text(record.context_label || record.contextLabel || record.component || record.screen);
  if (explicit && !genericLabels.has(explicit.toLowerCase())) return explicit.replace(/:$/, "");
  const combined = [record.evidence, record.observation, record.question].map(text).join(" ");
  const quoted = combined.match(/["'“”]([^"'“”]{2,40})["'“”]\s+(button|link|cta|field|control)/i);
  if (quoted) return `“${quoted[1].trim()}” ${quoted[2][0].toUpperCase()}${quoted[2].slice(1).toLowerCase()}`;
  const contexts = [
    ["checkout", "Checkout"], ["cart", "Cart"], ["contact", "Contact Form"],
    ["homepage", "Homepage"], ["home page", "Homepage"], ["dashboard", "Dashboard"],
    ["navigation", "Navigation"], ["menu", "Navigation Menu"], ["onboarding", "Onboarding"],
    ["error", "Error State"], ["search", "Search"], ["form", "Form"],
    ["button", "Button"], ["mobile", "Mobile View"], ["desktop", "Desktop View"],
  ] as const;
  return contexts.find(([needle]) => combined.toLowerCase().includes(needle))?.[1] || "Audited Interface";
}

export function structureFinding(record: Record<string, unknown>) {
  return {
    ...record,
    context_label: contextualLabel(record),
    observation: text(record.observation || record.what_we_found || record.finding || record.title || record.question),
    consequence: text(record.consequence || record.user_consequence || record.impact),
    recommendation: text(record.recommendation || record.action),
  };
}

export function contentOnlyBucketNotes(sourceBuckets: Array<Record<string, unknown>>, notes: Array<Record<string, unknown>>) {
  const noteByBucket = new Map(notes.map((note) => [text(note.bucket).toLowerCase(), note]));
  return sourceBuckets.map((bucket) => {
    const note = noteByBucket.get(text(bucket.bucket_name || bucket.bucket || bucket.section).toLowerCase());
    if (!note) return bucket;
    return {
      ...bucket,
      score_rationale: {
        ...(typeof bucket.score_rationale === "object" && bucket.score_rationale ? bucket.score_rationale : {}),
        writer_summary: text(note.summary),
        writer_biggest_risk: text(note.biggest_risk),
        writer_best_opportunity: text(note.best_opportunity),
      },
    };
  });
}
