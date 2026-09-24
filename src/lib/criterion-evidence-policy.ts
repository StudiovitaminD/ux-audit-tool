import type { EvidenceKind } from "@/lib/evidence-depth";

const VISUAL_BUCKETS = new Set([
  "Content (Impact)",
  "Visual Consistency",
  "Brand Expression",
  "Icons & Imagery",
]);

// A screenshot can score a criterion only when the criterion is observable in
// one captured state. Interaction and runtime behavior still require a probe.
const SCREENSHOT_SCOREABLE_BY_BUCKET: Record<string, number[]> = {
  "Visual Feedback": [2, 4, 5, 6, 7, 9, 10],
  "Color & Contrast": [6, 7, 8, 9, 10],
  "Motion & Microinteractions": [1, 5, 7],
};

export function criterionEvidenceKinds(bucket: string, questionId: string, question: string): EvidenceKind[] {
  const number = Number(questionId.match(/\d+$/)?.[0] || 0);

  if (bucket === "Visual Feedback") {
    if ([3, 4, 5, 9, 10].includes(number)) return ["form_state", "interaction", "screenshot"];
    return ["interaction", "screenshot"];
  }
  if (bucket === "Color & Contrast") {
    if (number <= 7) return ["contrast", "screenshot"];
    if (number === 8) return ["form_state", "accessibility_tree", "screenshot"];
    return ["accessibility_tree", "screenshot"];
  }
  if (bucket === "Typography & Readability") {
    if (number === 8) return ["zoom", "responsive", "screenshot"];
    if (number === 9) return ["text_spacing", "responsive", "screenshot"];
    return ["content", "responsive", "screenshot"];
  }
  if (bucket === "Keyboard Navigation") return ["keyboard", "dom"];
  if (bucket === "Screen Reader Support") {
    return number >= 9
      ? ["accessibility_tree", "form_state", "dom"]
      : ["accessibility_tree", "dom"];
  }
  if (bucket === "Navigation & Findability") {
    if (number === 9) return ["responsive", "keyboard", "screenshot"];
    if ([7, 10].includes(number)) return ["interaction", "dom", "screenshot"];
    return ["content", "dom", "screenshot"];
  }
  if (bucket === "Consistency & UI Patterns") {
    if ([2, 3, 7, 8].includes(number)) return ["interaction", "form_state", "dom", "screenshot"];
    return ["content", "dom", "screenshot"];
  }
  if (bucket === "Content (Impact)") return ["content", "screenshot"];
  if (bucket === "Performance") {
    if ([2, 6, 7].includes(number)) return ["interaction", "performance", "screenshot"];
    if (number === 8) return ["performance", "responsive"];
    if (number === 9) return ["responsive", "screenshot"];
    return ["performance", "screenshot"];
  }
  if (bucket === "Visual Consistency") {
    if ([11, 13].includes(number)) return ["interaction", "responsive", "screenshot"];
    return ["content", "screenshot"];
  }
  if (bucket === "Motion & Microinteractions") {
    if ([2, 8, 9].includes(number)) return ["interaction", "reduced_motion", "screenshot"];
    return ["reduced_motion", "screenshot"];
  }
  if (bucket === "Content (Delight)") {
    if (number === 4) return ["form_state", "content", "screenshot"];
    if (number === 9) return ["interaction", "content", "screenshot"];
    return ["content", "screenshot"];
  }
  if (bucket === "Brand Expression") return ["content", "screenshot"];
  if (bucket === "Icons & Imagery") return ["content", "responsive", "screenshot"];

  // Unknown future criteria stay conservative instead of being scored from a keyword accident.
  return ["content", "screenshot"];
}

export function isScreenshotScorableCriterion(bucket: string, questionId: string) {
  const number = Number(questionId.match(/\d+$/)?.[0] || 0);
  if (VISUAL_BUCKETS.has(bucket)) {
    if (bucket === "Visual Consistency" && [11, 13].includes(number)) return false;
    return true;
  }
  if (bucket === "Typography & Readability") return ![8, 9].includes(number);
  if (bucket === "Navigation & Findability") return ![7, 9, 10].includes(number);
  if (bucket === "Consistency & UI Patterns") return ![2, 3, 7, 8].includes(number);
  if (SCREENSHOT_SCOREABLE_BY_BUCKET[bucket]?.includes(number)) return true;
  if (bucket === "Content (Delight)") return ![4, 9].includes(number);
  return false;
}

export function recaptureKindForCriterion(bucket: string, questionId: string, question: string) {
  const kinds = criterionEvidenceKinds(bucket, questionId, question);
  if (kinds.includes("text_spacing")) return "text_spacing" as const;
  if (kinds.includes("zoom")) return "zoom" as const;
  const number = Number(questionId.match(/\d+$/)?.[0] || 0);
  const formProbe = (bucket === "Visual Feedback" && [3, 4, 5, 9, 10].includes(number))
    || (bucket === "Color & Contrast" && number === 8)
    || (bucket === "Screen Reader Support" && [9, 10].includes(number))
    || (bucket === "Content (Delight)" && number === 4);
  if (formProbe && kinds.includes("form_state")) return "form" as const;
  if (kinds.includes("keyboard") || kinds.includes("accessibility_tree")) return "keyboard" as const;
  if (kinds.includes("interaction")) return "interaction" as const;
  if (kinds.includes("performance")) return "performance" as const;
  if (kinds.includes("reduced_motion")) return "motion" as const;
  if (kinds.includes("responsive")) return "responsive" as const;
  return "visual" as const;
}
