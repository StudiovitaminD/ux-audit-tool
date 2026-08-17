export type AuditCriterion = {
  title: string;
  question: string;
};

export type AuditBucket = {
  name: string;
  criteria: AuditCriterion[];
};

type AuditPillar = {
  name: "Accessibility" | "Impact" | "Delight";
  summary: string;
  bucketCount: number;
  criterionCount: number;
  buckets: Array<AuditBucket & { name: string }>;
};

export const AUDIT_FRAMEWORK = {
  purpose:
    "Use this framework to audit digital products consistently, record evidence, score individual criteria, and identify improvement priorities across the three UX pillars.",
  scoringScale:
    "Score 0 when the requirement is missing or creates a critical failure; 1 for major issues; 2 when partially met with noticeable gaps; 3 when it meets with minor issues; 4 when it fully meets the requirement.",
  auditNote:
    "Accessibility should combine automated checks with manual keyboard and screen-reader testing. Performance should be measured under realistic device and network conditions. If Screen Reader Support or Performance are selected, capture at least one semantic/ARIA inspection and one mobile/responsive pass so the model has enough evidence to give a best-effort score.",
  pillars: [
    {
      name: "Accessibility",
      summary: "Can everyone perceive, understand and operate the experience?",
      bucketCount: 5,
      criterionCount: 23,
      buckets: [
        {
          name: "Visual Feedback",
          criteria: [
            { title: "Loading states", question: "Is feedback shown immediately after an action starts? Does it clearly indicate that the system is working, prevent duplicate actions and communicate loading status to assistive technologies?" },
            { title: "Empty states", question: "Does every empty state explain why no content is available and provide a relevant next action instead of showing a blank screen?" },
            { title: "Success states", question: "After completing an action, does the interface clearly confirm what was completed and whether any further action is required? Is the confirmation announced to screen-reader users?" },
            { title: "Progress indicators", question: "For multi-step or long-running tasks, can users understand their current position, completed steps and remaining work? Is progress available visually and programmatically?" },
            { title: "Hover states", question: "Do interactive elements provide a noticeable hover state without relying on hover as the only way to discover functionality? Is hover-triggered content also available through keyboard focus?" },
            { title: "Selected states", question: "Can users clearly distinguish selected and unselected items without relying only on colour? Is the selected state communicated programmatically through attributes such as aria-selected or aria-checked?" },
            { title: "Active states", question: "Does an interactive element visibly respond while being clicked, tapped or pressed? Can users distinguish the active state from hover, focus, selected and disabled states?" },
            { title: "Error states", question: "Does the interface identify the exact error, explain why it occurred and tell users how to correct it? Is the error shown using text or an icon in addition to colour and announced to screen readers?" },
          ],
        },
        {
          name: "Color & Contrast",
          criteria: [
            { title: "Contrast ratio", question: "Does normal text achieve at least 4.5:1 contrast, large text at least 3:1, and meaningful interface components and focus indicators at least 3:1 against adjacent colours?" },
            { title: "Color accessibility", question: "Can important content and controls be distinguished under common colour-vision-deficiency simulations? Are foreground and background combinations readable across light, dark, hover, selected, disabled, and error states?" },
          ],
        },
        {
          name: "Typography & Readability",
          criteria: [
            { title: "Font size", question: "Is body text comfortably readable at the default size across desktop and mobile? Can users zoom text to 200% without content becoming hidden, clipped, or unusable?" },
            { title: "Line height", question: "Is there sufficient vertical spacing for comfortable reading? Does the interface remain usable when users increase line, paragraph, letter, and word spacing?" },
            { title: "Readability", question: "Are sentences concise, language familiar, and paragraphs scannable? Are unnecessary jargon, long blocks of text, all-caps paragraphs, and difficult sentence structures avoided?" },
            { title: "Hierarchy", question: "Can users immediately distinguish page titles, headings, subheadings, body text, labels, and supporting text? Does the visual hierarchy match the semantic heading structure?" },
          ],
        },
        {
          name: "Keyboard Navigation",
          criteria: [
            { title: "Tab order", question: "When navigating with Tab and Shift+Tab, does focus move in a logical order that follows the visual and task sequence? Does focus move appropriately when dialogs, menus, or new content open?" },
            { title: "Focus visibility", question: "Is the currently focused control always clearly visible and not hidden behind sticky headers, overlays, or other content? Does the focus indicator have sufficient contrast?" },
            { title: "Keyboard shortcuts", question: "Can all essential functions be completed using standard keyboard controls? Are custom shortcuts documented, non-conflicting, and avoidable or remappable where necessary?" },
          ],
        },
        {
          name: "Screen Reader Support",
          criteria: [
            { title: "Semantic structure", question: "Are headings, landmarks, lists, tables, buttons, links, and form controls implemented according to their actual purpose? Does the screen-reader reading order match the visual order?" },
            { title: "Alt text", question: "Do informative images have concise and meaningful alternative text? Are decorative images ignored, and are complex visuals supported by longer descriptions or equivalent data?" },
            { title: "ARIA labels", question: "Do controls without visible text have accurate accessible names? Do accessible names match visible labels, and is ARIA used only where native semantic elements are insufficient?" },
            { title: "Accessible forms", question: "Does every field have a persistent, programmatically associated label? Are required fields, formats, instructions, and errors communicated before or during input, and does focus move appropriately after submission errors?" },
          ],
        },
      ],
    },
    {
      name: "Impact",
      summary: "Does the experience help users complete tasks and support business goals?",
      bucketCount: 4,
      criterionCount: 16,
      buckets: [
        {
          name: "Navigation & Findability",
          criteria: [
            { title: "Information Architecture", question: "Are content and functions grouped according to users' expectations? During tree testing or task testing, can users correctly identify where they would go to complete primary tasks?" },
            { title: "Navigation", question: "Can users reach all key destinations without unnecessary steps? Is navigation consistent across pages, and can users clearly identify their current location?" },
            { title: "Menu", question: "Are menu labels clear, distinct, and task-oriented? Are important destinations discoverable without excessive nesting, and does the menu work across screen sizes and input methods?" },
            { title: "Search", question: "Does search return relevant results for common terms, alternate terms, and minor spelling errors? Can users filter or sort results, recover from zero-result searches, and understand why results were returned?" },
            { title: "Breadcrumbs", question: "Do breadcrumbs accurately represent the site hierarchy? Are parent levels clickable, labels understandable, and the current page clearly identified?" },
          ],
        },
        {
          name: "Consistency & UI Patterns",
          criteria: [
            { title: "Reusable components", question: "Are components with the same purpose implemented using the same approved design and behaviour? What percentage of audited screens use reusable components instead of one-off variations?" },
            { title: "Consistent interaction patterns", question: "Do similar actions behave consistently across the product? For example, do save, delete, filter, close, back, and confirmation actions work predictably everywhere?" },
            { title: "Design-system adherence", question: "What percentage of colours, typography styles, spacing values, icons, and components follow approved design-system tokens and guidelines? Are deviations documented and justified?" },
          ],
        },
        {
          name: "Content",
          criteria: [
            { title: "Information correctness", question: "Is displayed information accurate, current, and consistent with the organisation's approved source of truth? Are contradictory values, outdated details, and broken references absent?" },
            { title: "UX writing", question: "Are labels, buttons, instructions, errors, and confirmations clear, concise, and action-oriented? Does each label accurately describe what will happen after interaction?" },
            { title: "Content clarity", question: "Can representative users understand the content without explanation? Are unfamiliar terms defined, instructions specific, and important limitations communicated before commitment?" },
            { title: "Content hierarchy", question: "Is the most important information shown first? Can users identify the page purpose, primary action, and essential supporting information within a quick scan?" },
          ],
        },
        {
          name: "Performance",
          criteria: [
            { title: "Code performance", question: "Are unnecessary scripts, large assets, third-party dependencies, console errors, or repeated requests slowing the experience? Do lower-powered devices complete key tasks without freezing or crashing?" },
            { title: "Load speed", question: "Does the main content load quickly under realistic network conditions? For websites, does the 75th-percentile Largest Contentful Paint remain at or below 2.5 seconds?" },
            { title: "Responsiveness", question: "Does the interface respond promptly to clicks, typing, and navigation? For websites, is the 75th-percentile Interaction to Next Paint at or below 200 milliseconds?" },
            { title: "Responsive layout", question: "Does the experience work without clipping, overlapping, unreadable text, or unnecessary horizontal scrolling across supported mobile, tablet, and desktop widths?" },
          ],
        },
      ],
    },
    {
      name: "Delight",
      summary: "Does the experience feel polished, distinctive and emotionally satisfying?",
      bucketCount: 5,
      criterionCount: 16,
      buckets: [
        {
          name: "Visual Consistency",
          criteria: [
            { title: "Colours", question: "Is the approved colour palette applied consistently across pages, components, and states? Do colours maintain the same meaning throughout the product?" },
            { title: "Typography", question: "Are font families, weights, sizes, and styles drawn from a consistent type scale? Are equivalent content types styled consistently?" },
            { title: "Spacing", question: "Does the interface use a defined spacing system? Are margins, padding, gaps, and alignments consistent across similar sections and components?" },
            { title: "Components", question: "Do repeated components maintain consistent shape, sizing, styling, and behaviour? Are unnecessary visual variations avoided?" },
          ],
        },
        {
          name: "Motion & Microinteractions",
          criteria: [
            { title: "Animations", question: "Does each animation communicate status, hierarchy, causality, or personality rather than existing only as decoration? Is animation smooth, non-disruptive, and compatible with reduced-motion preferences?" },
            { title: "Transitions", question: "Do transitions help users understand movement between states, screens, or content? Are durations and easing consistent, and do transitions avoid delaying task completion?" },
            { title: "Interaction feedback", question: "Does every user action receive immediate and proportionate feedback? Can users confidently tell whether an action was registered, completed, failed, or can be undone?" },
          ],
        },
        {
          name: "Content",
          criteria: [
            { title: "Tone of voice", question: "Is the product's tone consistent across navigation, onboarding, forms, errors, and success messages? Does it adapt appropriately to serious, sensitive, celebratory, and error situations?" },
            { title: "Information density", question: "Is enough information shown to support decisions without overwhelming users? Are grouping, whitespace, progressive disclosure, and summaries used for complex content?" },
          ],
        },
        {
          name: "Brand Expression",
          criteria: [
            { title: "Brand personality", question: "Does the interface consistently express the intended brand traits through language, visual design, imagery, and interaction? Can users distinguish the experience from a generic competitor product?" },
            { title: "Emotional connection", question: "Does the experience create the intended feelings, such as trust, confidence, warmth, or excitement? Do user interviews or satisfaction surveys confirm this emotional response?" },
            { title: "Visual identity", question: "Are logos, colours, typography, imagery, and graphic elements applied according to brand guidelines? Are outdated or inconsistent brand treatments absent?" },
          ],
        },
        {
          name: "Icons & Imagery",
          criteria: [
            { title: "Icon consistency", question: "Do icons follow the same stroke weight, fill style, size, corner treatment, and visual perspective? Are icons understandable, aligned, and supported with labels where meaning may be unclear?" },
            { title: "Illustration style", question: "Do illustrations follow a cohesive visual language and support the content or task? Are decorative illustrations prevented from distracting from important information?" },
            { title: "Photography", question: "Is photography relevant, high quality, and appropriate to the intended audience and brand? Are crops, subjects, lighting, and representation consistent across the experience?" },
            { title: "Visual quality", question: "Are all visual assets sharp, correctly scaled, and free from distortion, poor cropping, visible compression, or inconsistent backgrounds? Do visuals maintain quality across screen sizes and high-density displays?" },
          ],
        },
      ],
    },
  ] satisfies AuditPillar[],
  checklist: [
    "Screen, page, flow, or component audited",
    "Device, browser, viewport, and assistive technology used",
    "Observed behaviour and the expected behaviour",
    "Screenshot, recording, technical output, or test result",
    "Severity, affected user group, and business consequence",
    "Recommended action and responsible owner",
  ],
} as const;

export function buildAuditFrameworkBrief() {
  const lines: string[] = [];
  lines.push(AUDIT_FRAMEWORK.purpose);
  lines.push(AUDIT_FRAMEWORK.scoringScale);
  lines.push(AUDIT_FRAMEWORK.auditNote);
  lines.push("");
  lines.push("Framework structure:");
  for (const pillar of AUDIT_FRAMEWORK.pillars) {
    lines.push(`- ${pillar.name}: ${pillar.summary} (${pillar.bucketCount} buckets, ${pillar.criterionCount} criteria)`);
  }
  lines.push("");
  lines.push("Audit evidence checklist:");
  for (const item of AUDIT_FRAMEWORK.checklist) lines.push(`- ${item}`);
  return lines.join("\n");
}

export function buildBucketFrameworkBrief(bucketName: string) {
  for (const pillar of AUDIT_FRAMEWORK.pillars) {
    const bucket = pillar.buckets.find((item) => item.name === bucketName);
    if (!bucket) continue;
    const lines = [
      `Framework focus for ${bucketName} under ${pillar.name}.`,
      `Pillar intent: ${pillar.summary}`,
      "How to audit:",
      ...bucket.criteria.map((criterion) => `- ${criterion.title}: ${criterion.question}`),
    ];
    return lines.join("\n");
  }
  return buildAuditFrameworkBrief();
}
