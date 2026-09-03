export type UXAuditPillar = "Accessibility" | "Impact" | "Delight";

export type UXAuditAnswerState = "pass" | "partial" | "fail" | "not_tested" | "n_a";

export type UXAuditBucketQuestion = {
  title: string;
  question: string;
};

export type UXAuditBucket = {
  pillar: UXAuditPillar;
  name: string;
  questions: UXAuditBucketQuestion[];
};

export const UX_AUDIT_BUCKETS: UXAuditBucket[] = [
  {
    pillar: "Accessibility",
    name: "Visual Feedback",
    questions: [
      { title: "Immediate feedback", question: "Does the interface provide immediate visible feedback after a user action?" },
      { title: "Loading states", question: "Are loading or processing states clearly communicated when users need to wait?" },
      { title: "Duplicate submission prevention", question: "Are users prevented from accidentally submitting the same action multiple times?" },
      { title: "Success confirmation", question: "Are successful actions clearly confirmed?" },
      { title: "Success explanation", question: "Do success states explain what happened and what users should do next?" },
      { title: "Progress indicators", question: "Are progress indicators provided for multi-step or long-running processes where needed?" },
      { title: "State distinction", question: "Can users clearly distinguish hover, focus, selected, active and disabled states?" },
      { title: "Active response", question: "Does every clickable or tappable element visibly respond when activated?" },
      { title: "Error identification", question: "Are errors clearly identified and explained near the relevant action or field?" },
      { title: "Error correction", question: "Do error messages tell users how to correct the problem?" },
    ],
  },
  {
    pillar: "Accessibility",
    name: "Color & Contrast",
    questions: [
      { title: "Normal text contrast", question: "Does normal text meet the minimum 4.5:1 contrast ratio?" },
      { title: "Large text contrast", question: "Does large text meet the minimum 3:1 contrast ratio?" },
      { title: "Component contrast", question: "Do meaningful interface components and controls meet the minimum 3:1 contrast ratio?" },
      { title: "Focus contrast", question: "Do keyboard focus indicators have sufficient contrast?" },
      { title: "State contrast", question: "Is sufficient contrast maintained across default, hover, selected, disabled and error states?" },
      { title: "Readable pairings", question: "Are foreground and background colour combinations comfortably readable?" },
      { title: "Colour-vision support", question: "Can important information still be understood by users with common colour-vision deficiencies?" },
      { title: "Error text or icons", question: "Are errors communicated using text or icons in addition to colour?" },
      { title: "Non-colour states", question: "Are success, selected and status states communicated using more than colour alone?" },
      { title: "Required field clarity", question: "Are required fields identifiable without relying only on colour?" },
    ],
  },
  {
    pillar: "Accessibility",
    name: "Typography & Readability",
    questions: [
      { title: "Desktop readability", question: "Is body text comfortably readable on desktop?" },
      { title: "Mobile readability", question: "Is body text comfortably readable on mobile?" },
      { title: "Line height", question: "Is line height sufficient for comfortable reading?" },
      { title: "Scan-friendly paragraphs", question: "Are paragraphs and long-form content easy to scan?" },
      { title: "Avoid long blocks", question: "Are excessively long blocks of text avoided?" },
      { title: "Clear hierarchy", question: "Is there a clear and consistent hierarchy between titles, headings, subheadings and body text?" },
      { title: "Key information prominence", question: "Can users quickly identify the most important information on the page?" },
      { title: "Text zoom", question: "Does text remain usable when users zoom to 200%?" },
      { title: "Spacing resilience", question: "Does increased text spacing avoid clipping, overlapping or hiding content?" },
      { title: "Simple language", question: "Is the language simple, concise and readable for the intended audience?" },
    ],
  },
  {
    pillar: "Accessibility",
    name: "Keyboard Navigation",
    questions: [
      { title: "Keyboard access", question: "Can users reach all essential interactive elements using only the keyboard?" },
      { title: "Tab order", question: "Does Tab move focus in a logical order?" },
      { title: "Reverse order", question: "Does Shift+Tab follow the correct reverse order?" },
      { title: "Focus visibility", question: "Is the currently focused element always visually identifiable?" },
      { title: "Visual-task sequence", question: "Does focus follow the visual and task sequence of the page?" },
      { title: "Component keyboard support", question: "Can menus, dropdowns, accordions and similar components be operated by keyboard?" },
      { title: "Modal keyboard flow", question: "Can users enter and exit modals or overlays using the keyboard?" },
      { title: "Focus management", question: "Does focus move appropriately when a modal opens and return correctly when it closes?" },
      { title: "No keyboard traps", question: "Is keyboard focus prevented from becoming trapped unexpectedly?" },
      { title: "Sticky overlap avoidance", question: "Is focused content prevented from being hidden behind sticky headers, overlays or other elements?" },
    ],
  },
  {
    pillar: "Accessibility",
    name: "Screen Reader Support",
    questions: [
      { title: "Semantic headings", question: "Are page headings implemented using an appropriate semantic hierarchy?" },
      { title: "Landmarks", question: "Are navigation areas and major page sections represented using appropriate semantic landmarks?" },
      { title: "Semantic controls", question: "Are buttons, links, lists, tables and form fields implemented with appropriate semantic elements?" },
      { title: "Reading order", question: "Does the screen-reader reading order match the visual reading order?" },
      { title: "Useful alt text", question: "Do meaningful images contain useful alternative text?" },
      { title: "Decorative hiding", question: "Are decorative images hidden appropriately from assistive technologies?" },
      { title: "Accessible names", question: "Do controls without visible text have understandable accessible names?" },
      { title: "Label accuracy", question: "Do accessible names accurately match visible labels?" },
      { title: "Error announcements", question: "Are required fields and validation errors communicated to screen readers?" },
      { title: "State announcements", question: "Are important loading, success, error and state changes programmatically announced when necessary?" },
    ],
  },
  {
    pillar: "Impact",
    name: "Navigation & Findability",
    questions: [
      { title: "Discoverable navigation", question: "Is the primary navigation easy to discover and understand?" },
      { title: "Grouped navigation", question: "Are navigation items grouped according to user expectations?" },
      { title: "Clear labels", question: "Are menu labels clear, distinct and based on user terminology?" },
      { title: "Primary task wayfinding", question: "Can users quickly identify where to go for the site's primary tasks?" },
      { title: "Information prediction", question: "Can users predict where important information is likely to be located?" },
      { title: "Limited nesting", question: "Is unnecessary hierarchy depth or excessive menu nesting avoided?" },
      { title: "Back navigation", question: "Can users easily return to previous or higher-level sections?" },
      { title: "Current location", question: "Can users clearly understand their current location within the website?" },
      { title: "Cross-device nav", question: "Does navigation work appropriately across desktop, tablet and mobile?" },
      { title: "Direct destinations", question: "Can users reach important destinations without unnecessary steps?" },
    ],
  },
  {
    pillar: "Impact",
    name: "Consistency & UI Patterns",
    questions: [
      { title: "Same-purpose consistency", question: "Are components with the same purpose visually consistent across the interface?" },
      { title: "Behavioral consistency", question: "Do repeated components behave consistently?" },
      { title: "Predictable actions", question: "Do similar actions produce predictable results across different pages?" },
      { title: "Button hierarchy", question: "Are button styles and hierarchy used consistently?" },
      { title: "Form patterns", question: "Are form controls and input patterns consistent?" },
      { title: "Navigation patterns", question: "Are navigation patterns consistent throughout the website?" },
      { title: "Feedback patterns", question: "Are confirmation, warning and error patterns consistent?" },
      { title: "Core actions", question: "Are common actions such as Back, Close, Save or Submit predictable?" },
      { title: "Avoid one-offs", question: "Are unnecessary one-off component variations avoided?" },
      { title: "System coherence", question: "Does the interface feel like one coherent system rather than a collection of unrelated screens?" },
    ],
  },
  {
    pillar: "Impact",
    name: "Content (Impact)",
    questions: [
      { title: "Purpose clarity", question: "Can users quickly understand the purpose of the page?" },
      { title: "Important first", question: "Is the most important information presented first?" },
      { title: "Primary action clarity", question: "Is the primary action easy to identify?" },
      { title: "Clear labels", question: "Are navigation and button labels clear and action-oriented?" },
      { title: "Accurate button labels", question: "Do buttons accurately describe what will happen after they are selected?" },
      { title: "Understandable instructions", question: "Are instructions understandable without additional explanation?" },
      { title: "Terminology consistency", question: "Is terminology used consistently across the experience?" },
      { title: "Plain language", question: "Is unnecessary technical or unfamiliar language avoided?" },
      { title: "Secondary supporting content", question: "Is supporting information visually secondary to primary information?" },
      { title: "Scanability", question: "Can users scan the page quickly and locate the information needed to complete their task?" },
    ],
  },
  {
    pillar: "Impact",
    name: "Performance",
    questions: [
      { title: "Timely content", question: "Does meaningful page content appear within a reasonable amount of time?" },
      { title: "Prompt response", question: "Does the interface respond promptly after clicks and taps?" },
      { title: "Asset optimization", question: "Are large images and media assets appropriately optimised?" },
      { title: "Lean dependencies", question: "Are unnecessary scripts or heavy dependencies avoided where detectable?" },
      { title: "Content prioritization", question: "Is important content prioritised before secondary content?" },
      { title: "Loading states", question: "Are loading states shown when users must wait for content or actions?" },
      { title: "Responsive navigation", question: "Does navigation feel responsive rather than delayed?" },
      { title: "Mobile performance", question: "Does the website perform appropriately on mobile devices?" },
      { title: "Layout stability", question: "Does the layout avoid clipping, overlap and unnecessary horizontal scrolling?" },
      { title: "No unexpected shift", question: "Does the interface remain stable while content loads rather than shifting unexpectedly?" },
    ],
  },
  {
    pillar: "Delight",
    name: "Visual Consistency",
    questions: [
      { title: "Colour palette", question: "Is the colour palette applied consistently across pages and components?" },
      { title: "Avoid colour variation", question: "Are unnecessary colour variations avoided?" },
      { title: "Consistent type usage", question: "Are font families, weights and sizes used consistently?" },
      { title: "Typography scale", question: "Does the interface follow a clear and consistent typography scale?" },
      { title: "Spacing values", question: "Are margins, padding and spacing values visually consistent?" },
      { title: "Grouped spacing", question: "Are related elements grouped with consistent spacing?" },
      { title: "Repeated component consistency", question: "Are repeated components consistent in size, shape and visual treatment?" },
      { title: "Alignment rhythm", question: "Are alignments and grid relationships visually consistent?" },
      { title: "Section hierarchy", question: "Are sections placed and ordered in a way that makes the page easy to understand and use?" },
      { title: "Goal-supporting layout", question: "Does the visual layout guide users toward the stated goal of the product or task?" },
      { title: "Scroll continuity", question: "Does scrolling work smoothly and preserve a clear sense of place without awkward gaps, traps, clipping or unnecessary horizontal movement?" },
      { title: "Content grouping", question: "Are related content and actions grouped together with enough separation from unrelated sections?" },
      { title: "State styling", question: "Are component states styled consistently?" },
      { title: "Coherent visual language", question: "Does the interface maintain a coherent visual language across the overall experience?" },
    ],
  },
  {
    pillar: "Delight",
    name: "Motion & Microinteractions",
    questions: [
      { title: "Purposeful motion", question: "Does animation or motion serve a clear purpose when it is used?" },
      { title: "State transitions", question: "Do transitions help users understand changes between states or screens?" },
      { title: "Smooth motion", question: "Are animations smooth and non-disruptive?" },
      { title: "Consistent durations", question: "Are transition durations reasonably consistent?" },
      { title: "Avoid decorative motion", question: "Is unnecessary decorative animation avoided?" },
      { title: "No task delay", question: "Does animation avoid delaying users from completing tasks?" },
      { title: "Brand personality", question: "Does motion support the overall visual personality of the product where appropriate?" },
      { title: "Micro-feedback", question: "Do interactive elements provide appropriate micro-feedback after actions?" },
      { title: "Registered interaction", question: "Can users understand whether an interaction has been registered without relying on unnecessary animation?" },
      { title: "Reduced motion", question: "Does the interface respect reduced-motion preferences where relevant?" },
    ],
  },
  {
    pillar: "Delight",
    name: "Content (Delight)",
    questions: [
      { title: "Tone consistency", question: "Is the tone of voice consistent throughout the experience?" },
      { title: "Brand personality", question: "Does the tone reflect the intended brand personality?" },
      { title: "Appropriate tone", question: "Is the tone appropriate for navigation, instructions and onboarding?" },
      { title: "Respectful messaging", question: "Are error and sensitive messages respectful and helpful?" },
      { title: "Remove unnecessary information", question: "Is unnecessary information removed?" },
      { title: "Chunk complex content", question: "Is complex information divided into understandable groups?" },
      { title: "Appropriate density", question: "Is information density appropriate rather than overwhelming?" },
      { title: "Whitespace use", question: "Is whitespace used effectively to improve comprehension?" },
      { title: "Progressive disclosure", question: "Is progressive disclosure used when displaying all information at once would overwhelm users?" },
      { title: "Approachable content", question: "Does the content experience feel approachable and pleasant rather than purely functional?" },
    ],
  },
  {
    pillar: "Delight",
    name: "Brand Expression",
    questions: [
      { title: "Brand personality", question: "Does the interface visibly express the intended brand personality?" },
      { title: "Non-generic design", question: "Does the visual design feel recognisable rather than generic?" },
      { title: "Language reflects brand", question: "Is the brand personality reflected consistently through language?" },
      { title: "Brand colours", question: "Are brand colours used appropriately and consistently?" },
      { title: "Brand typography", question: "Is brand typography used consistently?" },
      { title: "Aligned imagery", question: "Are imagery, illustration and graphic elements aligned with the brand?" },
      { title: "Trust building", question: "Does the overall experience build an appropriate level of trust?" },
      { title: "Intended emotion", question: "Does the interface create the intended emotional response, such as warmth, confidence, excitement or reassurance?" },
      { title: "Cross-journey consistency", question: "Is brand expression consistent across different pages and user journeys?" },
      { title: "Avoid conflicting brand treatments", question: "Are outdated or conflicting brand treatments avoided?" },
    ],
  },
  {
    pillar: "Delight",
    name: "Icons & Imagery",
    questions: [
      { title: "Icon style", question: "Do icons follow a consistent stroke, fill or outline style?" },
      { title: "Icon sizing", question: "Are icon size, alignment and proportions consistent?" },
      { title: "Coherent icon style", question: "Do icons follow a coherent visual style and corner treatment?" },
      { title: "Icon clarity", question: "Are potentially unclear icons supported by labels or sufficient context?" },
      { title: "Important icon meaning", question: "Can users reasonably understand what important icons mean?" },
      { title: "Illustration coherence", question: "Do illustrations follow a cohesive visual language?" },
      { title: "Relevant imagery", question: "Are photographs and illustrations relevant to the surrounding content?" },
      { title: "Asset quality", question: "Are image quality, cropping and scaling appropriate across the interface?" },
      { title: "Brand-aligned imagery", question: "Do imagery and illustrations align with the intended brand identity?" },
      { title: "Sharp rendering", question: "Do visual assets remain sharp, undistorted and appropriately rendered across different screen sizes?" },
    ],
  },
];

export const UX_AUDIT_BUCKET_IDS: Record<string, string> = {
  "Visual Feedback": "VF",
  "Color & Contrast": "CC",
  "Typography & Readability": "TR",
  "Keyboard Navigation": "KN",
  "Screen Reader Support": "SR",
  "Navigation & Findability": "NF",
  "Consistency & UI Patterns": "CP",
  "Content (Impact)": "CI",
  Performance: "PF",
  "Visual Consistency": "VC",
  "Motion & Microinteractions": "MM",
  "Content (Delight)": "CD",
  "Brand Expression": "BE",
  "Icons & Imagery": "II",
} as const;

export const UX_AUDIT_ANSWER_STATES: Array<{
  state: UXAuditAnswerState;
  label: string;
  score: number | null;
  countsTowardBucketScore: boolean;
  countsTowardConfidence: boolean;
}> = [
  {
    state: "pass",
    label: "Pass",
    score: 1,
    countsTowardBucketScore: true,
    countsTowardConfidence: true,
  },
  {
    state: "partial",
    label: "Partial",
    score: 0.5,
    countsTowardBucketScore: true,
    countsTowardConfidence: true,
  },
  {
    state: "fail",
    label: "Fail",
    score: 0,
    countsTowardBucketScore: true,
    countsTowardConfidence: true,
  },
  {
    state: "not_tested",
    label: "Not Tested",
    score: null,
    countsTowardBucketScore: false,
    countsTowardConfidence: true,
  },
  {
    state: "n_a",
    label: "N/A",
    score: null,
    countsTowardBucketScore: true,
    countsTowardConfidence: false,
  },
];

export function getAnswerStateRecord(state: UXAuditAnswerState) {
  return UX_AUDIT_ANSWER_STATES.find((item) => item.state === state) || null;
}

export function answerStateFromValue(value: unknown): UXAuditAnswerState | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
  if (!normalized) return null;
  if (["pass", "p"].includes(normalized)) return "pass";
  if (["partial", "partially", "partial_score"].includes(normalized)) return "partial";
  if (["fail", "failed", "no", "0"].includes(normalized)) return "fail";
  if (["not_tested", "nottested", "untested", "not_verified", "unverified"].includes(normalized)) {
    return "not_tested";
  }
  if (["n_a", "na", "n/a", "not_applicable", "notapplicable"].includes(normalized)) return "n_a";
  return null;
}

export function bucketTitleFromQuestion(question: string) {
  const trimmed = question.trim();
  if (!trimmed) return "Question";
  const short = trimmed.replace(/\?$/, "");
  return short.length > 72 ? `${short.slice(0, 69).trim()}…` : short;
}
