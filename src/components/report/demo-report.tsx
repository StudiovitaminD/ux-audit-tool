"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { calculateBusinessImpactMetrics, displayBucketName } from "@/lib/report-model";
import { IntroPageSection } from "./sections/IntroPageSection";
import { OverviewSection } from "./sections/OverviewSection";
import { buildNarrativeSummaryPages } from "./sections/NarrativeSummarySection";
import { buildCompetitorAnalysisPages } from "./sections/CompetitorAnalysisSection";
import type { ReportPage } from "./sections/shared";

type ScorecardRow = {
  section: string;
  score: string;
  health: string;
  risk_level: string;
  priority: string;
  pillar: string;
};

type PillarScore = { score: number; evaluated: boolean };

type FindingDetailed = {
  rank: number;
  bucket: string;
  what_we_found: string;
  why_it_matters: string;
  recommendation: string;
  acceptance_criteria: string[];
  severity: string;
  effort: string;
  priority_tier: string;
};

type QuickWin = {
  finding: string;
  recommendation: string;
  effort: string;
  estimated_time: string;
};

type Roadmap = {
  week_1_2: string[];
  month_1: string[];
  quarter_1: string[];
};

type DemoCompetitor = {
  name: string;
  url: string;
  positioning: string;
  primary_cta: string;
  strengths: string[];
  gaps: string[];
  steal_this: string[];
  screenshot?: string;
};

function formatPriority(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const lower = raw.toLowerCase();
  return lower.startsWith("p") ? lower : `p${lower}`;
}

function experienceLabelFromScore(value: unknown) {
  const match = String(value ?? "").match(/(\d+(?:\.\d+)?)/);
  const score = match ? Number(match[1]) : Number.NaN;
  if (!Number.isFinite(score)) return "—";
  if (score >= 80) return "Good";
  if (score <= 50) return "Critical";
  return "Average";
}

function normalizeKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function bucketPillarFromName(bucketName: string, fallbackPillar = "") {
  const normalized = normalizeKey(bucketName);
  if (["visual feedback", "color & contrast", "typography & readability", "keyboard navigation", "screen reader support"].includes(normalized)) {
    return "Accessibility";
  }
  if (["navigation & findability", "consistency & ui patterns", "performance"].includes(normalized)) {
    return "Impact";
  }
  if (["visual consistency", "motion & microinteractions", "brand expression", "icons & imagery"].includes(normalized)) {
    return "Delight";
  }
  if (normalized === "content") {
    const rawFallback = normalizeKey(fallbackPillar);
    if (rawFallback.includes("delight")) return "Delight";
    return "Impact";
  }
  const fallback = normalizeKey(fallbackPillar);
  if (fallback.includes("access")) return "Accessibility";
  if (fallback.includes("impact")) return "Impact";
  if (fallback.includes("delight")) return "Delight";
  return "Impact";
}

const PILLAR_BUCKETS = {
  Accessibility: [
    "Visual Feedback",
    "Color & Contrast",
    "Typography & Readability",
    "Keyboard Navigation",
    "Screen Reader Support",
  ],
  Impact: ["Navigation & Findability", "Consistency & UI Patterns", "Content (Impact)", "Performance"],
  Delight: [
    "Visual Consistency",
    "Motion & Microinteractions",
    "Content (Delight)",
    "Brand Expression",
    "Icons & Imagery",
  ],
} as const;

const SUMMARY_BUCKET_DETAILS = {
  "Color & Contrast": {
    topProblems: [
      "Persistent labels are missing, so placeholder-only fields lose context while typing.",
      "Tap targets and icon controls need larger hit areas on mobile devices.",
      "Color-only error treatment makes validation harder to perceive for some users.",
    ],
    whatsWorking: [
      "Core form structure is still simple enough to scan quickly.",
      "The page hierarchy keeps the main actions visible and understandable.",
      "Basic content labels are present, which gives us a good foundation to improve from.",
    ],
  },
  "Keyboard Navigation": {
    topProblems: [
      "Forms need pre-submission format hints so users know what to enter before errors appear.",
      "Inline validation is missing, so users only discover mistakes after submitting.",
      "Submitted values are not preserved on error, forcing unnecessary re-entry.",
    ],
    whatsWorking: [
      "The form flow is straightforward and easy to follow from start to finish.",
      "The issue is clear enough that the fix path is well defined.",
      "This bucket has a strong opportunity for quick, high-confidence improvements.",
    ],
  },
  "Visual Feedback": {
    topProblems: [
      "Loading indicators are missing during transitions and submission states.",
      "Users do not get immediate confirmation that their action is being processed.",
      "The interface risks duplicate clicks when submit actions do not change state.",
    ],
    whatsWorking: [
      "The experience already has clear action points where feedback can be added.",
      "System states are easy to improve without reworking the full layout.",
      "There is a solid baseline for adding better confirmation and progress cues.",
    ],
  },
  "Navigation & Findability": {
    topProblems: [
      "Navigation labels need to stay concise and scannable for faster wayfinding.",
      "Key destinations should be easier to reach without extra browsing effort.",
      "Supporting labels should reduce the chance of users missing critical pages.",
    ],
    whatsWorking: [
      "The main navigation structure is already simple and familiar.",
      "Users can understand the primary site areas without a steep learning curve.",
      "This bucket benefits from a strong information architecture foundation.",
    ],
  },
  "Visual Consistency": {
    topProblems: [
      "Important content needs stronger emphasis so the eye knows where to go first.",
      "Spacing and grouping should guide scanning more clearly.",
      "Secondary content can compete too much when the visual rhythm is flat.",
    ],
    whatsWorking: [
      "The page already has a coherent structure that we can refine.",
      "The current layout gives us a clear base for hierarchy improvements.",
      "Typography and grouping can be tuned without changing the whole system.",
    ],
  },
  "Performance": {
    topProblems: [
      "Conversion-critical moments should remove friction and unnecessary steps.",
      "The path to action can be tightened to support faster completion.",
      "Some content and asset choices could reduce efficiency and load performance.",
    ],
    whatsWorking: [
      "The experience already has enough structure to support performance gains.",
      "This bucket is well suited to targeted optimisation work.",
      "There is a good base for turning clarity improvements into conversion lifts.",
    ],
  },
  Content: {
    topProblems: [
      "Copy should be clearer at key decision points so users feel more confident.",
      "Plain language is needed where jargon currently slows understanding.",
      "Microcopy should support actions instead of creating extra uncertainty.",
    ],
    whatsWorking: [
      "The site already has the right places to add better guidance.",
      "Core messaging can be sharpened without rewriting the full experience.",
      "This is a strong opportunity to improve trust through clearer language.",
    ],
  },
  "Consistency & UI Patterns": {
    topProblems: [
      "Repeated patterns should behave more predictably across the experience.",
      "Control states and interaction styles need to feel more uniform.",
      "Minor inconsistencies can still create hesitation during repeat tasks.",
    ],
    whatsWorking: [
      "The product already shows a fairly repeatable interface language.",
      "A consistent baseline is in place, so refinements will be visible quickly.",
      "This bucket has a stable foundation for tightening pattern consistency.",
    ],
  },
} as const;

function bucketPillarFromRow(row: ScorecardRow) {
  return bucketPillarFromName(String(row.section || ""), row.pillar);
}

function bucketNameFromRow(row: ScorecardRow) {
  return String(row.section || "").trim();
}

function isScoredRow(row: ScorecardRow) {
  return Boolean(String(row.score || "").trim() && String(row.score).toLowerCase() !== "not scored");
}

function dedupeScoreRows(rows: ScorecardRow[]) {
  const seen = new Map<string, ScorecardRow>();
  for (const row of rows) {
    const pillar = bucketPillarFromRow(row);
    const bucketName = displayBucketName(bucketNameFromRow(row) || "Bucket").toLowerCase();
    const key = `${pillar}::${bucketName}`;
    const existing = seen.get(key);
    if (!existing || (!isScoredRow(existing) && isScoredRow(row))) {
      seen.set(key, row);
    }
  }
  return Array.from(seen.values());
}

function summaryBucketDetails(bucketName: string) {
  const normalizedBucketName = displayBucketName(bucketName);
  return (
    SUMMARY_BUCKET_DETAILS[normalizedBucketName as keyof typeof SUMMARY_BUCKET_DETAILS] ||
    SUMMARY_BUCKET_DETAILS[bucketName as keyof typeof SUMMARY_BUCKET_DETAILS] || {
      topProblems: [
        "Top problems for this bucket were not captured in the demo data.",
        "Add bucket-specific scored rationale to populate this section.",
      ],
      whatsWorking: [
        "What’s working for this bucket was not captured in the demo data.",
        "Add bucket-specific scored rationale to populate this section.",
      ],
    }
  );
}

const DEMO = {
  product_name: "Vitamin D.in",
  product_url: "vitamin-d.in",
  generated_at: "2026-05-13T11:56:23.299Z",
  audit_reason: "Improve UX flow of the website",
  overall_score: 67,
  overall_health: "Average",
  overall_risk: "Moderate",
  pillar_scores: {
    Delight: { score: 77, evaluated: true },
    Impact: { score: 66, evaluated: true },
    Accessibility: { score: 50, evaluated: true },
  } satisfies Record<string, PillarScore>,
  scorecard: [
    {
      section: "Visual Feedback",
      score: "54/100",
      health: "Poor",
      risk_level: "High",
      priority: "P1",
      pillar: "Accessibility",
    },
    {
      section: "Color & Contrast",
      score: "50/100",
      health: "Poor",
      risk_level: "High",
      priority: "P1",
      pillar: "Accessibility",
    },
    {
      section: "Keyboard Navigation",
      score: "34/100",
      health: "Critical",
      risk_level: "Critical",
      priority: "P1",
      pillar: "Accessibility",
    },
    {
      section: "Screen Reader Support",
      score: "46/100",
      health: "Poor",
      risk_level: "High",
      priority: "P1",
      pillar: "Accessibility",
    },
    {
      section: "Navigation & Findability",
      score: "94/100",
      health: "Excellent",
      risk_level: "Optimised",
      priority: "P4",
      pillar: "Impact",
    },
    {
      section: "Consistency & UI Patterns",
      score: "86/100",
      health: "Excellent",
      risk_level: "Optimised",
      priority: "P4",
      pillar: "Impact",
    },
    {
      section: "Content (Impact)",
      score: "73/100",
      health: "Good",
      risk_level: "Low Risk",
      priority: "P3",
      pillar: "Impact",
    },
    {
      section: "Performance",
      score: "60/100",
      health: "Moderate",
      risk_level: "Moderate",
      priority: "P2",
      pillar: "Impact",
    },
    {
      section: "Visual Consistency",
      score: "90/100",
      health: "Excellent",
      risk_level: "Optimised",
      priority: "P4",
      pillar: "Delight",
    },
    {
      section: "Motion & Microinteractions",
      score: "71/100",
      health: "Good",
      risk_level: "Low Risk",
      priority: "P3",
      pillar: "Delight",
    },
    {
      section: "Content (Delight)",
      score: "64/100",
      health: "Moderate",
      risk_level: "Moderate",
      priority: "P2",
      pillar: "Delight",
    },
    {
      section: "Brand Expression",
      score: "78/100",
      health: "Good",
      risk_level: "Low Risk",
      priority: "P3",
      pillar: "Delight",
    },
    {
      section: "Icons & Imagery",
      score: "69/100",
      health: "Moderate",
      risk_level: "Moderate",
      priority: "P2",
      pillar: "Delight",
    },
  ] satisfies ScorecardRow[],
  executive_summary: {
    overall_score: 67,
    health_tier: "Moderate",
    one_line_verdict:
      "Critical failures in form input validation and feedback mechanisms on the contact form are the biggest conversion blockers.",
    what_works:
      "Navigation & Findability scores excellently at 94/100 with a clear, consistent top navigation bar and intuitive labels that surface all key pages in one click. Visual Consistency also performs strongly at 90/100, with clear hierarchy, consistent spacing, and responsive layouts across devices. Consistency & UI Patterns score 86/100, showing a cohesive visual style and predictable interactions throughout the site. These strengths provide a solid foundation for user orientation and visual clarity.",
    top_3_problems: [
      "Contact form lacks any pre-submission format hints or input constraints, causing user confusion and errors.",
      "No real-time or inline validation feedback on form fields; errors only appear after full submission with all fields cleared, forcing re-entry.",
      "No loading indicators or submit button state changes during form submission, risking multiple submissions and user uncertainty.",
    ],
    top_3_quick_wins: [
      "Add persistent visible labels above all contact form fields to replace disappearing placeholders.",
      "Implement inline error messages next to specific form fields to clarify what needs fixing.",
      "Disable submit button immediately on click to prevent double submissions.",
      "Add loading spinner or progress indicator during page transitions and form submissions.",
      "Increase tap targets on mobile navigation and icon buttons to at least 44x44 pixels.",
      "Add alt text descriptions to portfolio and service images for accessibility.",
      "Replace jargon and buzzwords in copy with clear, plain language.",
      "Add helper text or tooltips at key decision points on service pages and forms.",
    ],
    first_priority_recommendation:
      "Redesign the contact form input and validation experience to include pre-submission format hints, real-time inline validation, input preservation on errors, and immediate submit button state changes to prevent double submissions.",
  },
  section_narrative: {
    delight_narrative:
      "The site delivers a visually appealing experience with a strong visual hierarchy and consistent layout that guides users naturally from headlines through content to CTAs. The typography is clear and the spacing mostly consistent, creating a pleasant scanning experience. However, the lack of microcopy guidance at decision points and the presence of jargon and buzzwords reduce clarity and user confidence. Success messages are present but lack next step instructions or delight elements such as animations.",
    impact_narrative:
      "Navigation is a standout strength, with a clear, consistent top nav bar and intuitive labels that make key pages accessible within one click. Interaction patterns are predictable and consistent, supporting user confidence. However, critical issues in input handling and feedback severely impact conversion potential. The contact form provides no format hints, no inline validation, clears user input on errors, and allows multiple submissions, all of which create friction and user frustration. Additionally, the absence of loading indicators during page transitions leaves users uncertain about system status.",
    accessibility_narrative:
      "Accessibility is a major concern with a low score of 50/100. Key issues include contrast problems, tap targets below recommended sizes on mobile, and error indicators relying solely on color without icons or descriptive labels. Many images lack alt text, and animations do not respect reduced-motion preferences. Keyboard navigation is partially supported but some custom components are inaccessible or lack visible focus states. Contrast issues with light gray text on white backgrounds further reduce readability for users with visual impairments.",
  },
  findings_detailed: [
    {
      rank: 1,
      bucket: "Keyboard Navigation",
      what_we_found:
        "The contact form shows no format hints or constraints on any field before submission, no real-time or inline validation, and clears all user input on submission errors.",
      why_it_matters:
        "Users cannot know how to correctly fill fields, receive no immediate feedback on mistakes, and lose all entered data on errors, causing frustration and abandonment.",
      recommendation:
        "Add pre-submission format hints, implement inline validation triggered on field blur or input, and preserve user input on errors to avoid re-entry.",
      acceptance_criteria: [
        "Each form field displays format requirements or examples before user input.",
        "Validation messages appear inline next to fields as users type or leave fields.",
        "Form retains all user input after submission errors without clearing fields.",
      ],
      severity: "Critical",
      effort: "Medium",
      priority_tier: "High priority",
    },
    {
      rank: 2,
      bucket: "Visual Feedback",
      what_we_found:
        "No loading indicators or spinners appear during page transitions or form submissions; submit button remains active and clickable after submission.",
      why_it_matters:
        "Users lack feedback that actions are processing, risking confusion and multiple submissions that can cause errors or duplicate contacts.",
      recommendation:
        "Implement visible loading indicators during page loads and form submissions; disable submit button immediately on click and show a loading state.",
      acceptance_criteria: [
        "A spinner or progress bar is visible during all page transitions and form submissions.",
        "Submit button disables and visually changes state immediately after click until submission completes.",
      ],
      severity: "Critical",
      effort: "Small",
      priority_tier: "High priority",
    },
    {
      rank: 3,
      bucket: "Screen Reader Support",
      what_we_found:
        "Contact form fields rely solely on placeholder text that disappears on typing, with no persistent visible labels above fields.",
      why_it_matters:
        "Users with cognitive or visual impairments may lose context of what information is required, reducing form usability and accessibility compliance.",
      recommendation:
        "Add persistent visible labels above all form fields that remain visible during and after input.",
      acceptance_criteria: [
        "All form fields have visible labels positioned above the input area.",
        "Labels remain visible when users focus or type in the fields.",
      ],
      severity: "High",
      effort: "Small",
      priority_tier: "Quick win",
    },
    {
      rank: 4,
      bucket: "Color & Contrast",
      what_we_found:
        "Tap and click targets on mobile for navigation links and icon buttons are smaller than the recommended 44x44 pixels.",
      why_it_matters:
        "Small tap targets increase the risk of user errors and reduce accessibility for users with motor impairments or larger fingers.",
      recommendation:
        "Increase all tap and click targets in mobile navigation and icon buttons to at least 44x44 pixels.",
      acceptance_criteria: [
        "All interactive elements on mobile meet or exceed 44 pixels in height and width.",
        "No navigation or icon button is smaller than the recommended size.",
      ],
      severity: "High",
      effort: "Small",
      priority_tier: "Quick win",
    },
    {
      rank: 5,
      bucket: "Keyboard Navigation",
      what_we_found:
        "Form validation errors are communicated only through red text color without icons or descriptive labels.",
      why_it_matters:
        "Users with color blindness or visual impairments may miss error messages, leading to confusion and form submission failures.",
      recommendation:
        "Add icons and descriptive error labels alongside color changes to communicate validation errors through multiple channels.",
      acceptance_criteria: [
        "All error messages include an icon and text label in addition to color.",
        "Error indicators meet WCAG guidelines for multiple sensory channels.",
      ],
      severity: "High",
      effort: "Small",
      priority_tier: "Quick win",
    },
    {
      rank: 6,
      bucket: "Content (Delight)",
      what_we_found:
        "Microcopy is limited to placeholder text in form fields; service pages lack tooltips or helper text at key decision points.",
      why_it_matters:
        "Users receive minimal guidance during decision-making, increasing cognitive load and reducing confidence in choices.",
      recommendation:
        "Add inline helper text or tooltips at key decision points on service pages and within forms to guide users.",
      acceptance_criteria: [
        "Helper text or tooltips appear near complex or important form fields and service options.",
        "Microcopy clearly explains terms and expected inputs in plain language.",
      ],
      severity: "High",
      effort: "Medium",
      priority_tier: "High priority",
    },
    {
      rank: 7,
      bucket: "Content (Delight)",
      what_we_found:
        "Copy contains jargon and buzzwords such as 'synergy', 'cutting-edge', and 'revolutionary' on services and about pages.",
      why_it_matters:
        "Jargon reduces clarity and can alienate users unfamiliar with industry terms, lowering engagement and trust.",
      recommendation:
        "Rewrite copy to remove jargon and buzzwords, replacing them with clear, plain language that communicates value directly.",
      acceptance_criteria: [
        "All jargon and buzzwords are removed or explained in simple terms.",
        "Copy is tested for readability at a broad audience level.",
      ],
      severity: "Moderate",
      effort: "Medium",
      priority_tier: "High priority",
    },
    {
      rank: 8,
      bucket: "Performance",
      what_we_found:
        "Most large images are unoptimized JPEGs over 500KB with no use of modern formats like WebP or AVIF.",
      why_it_matters:
        "Large unoptimized images slow page load times, negatively impacting user experience and Core Web Vitals scores.",
      recommendation:
        "Convert images to modern formats with appropriate compression and implement responsive image techniques.",
      acceptance_criteria: [
        "All large images are compressed below 200KB where possible.",
        "Modern formats like WebP or AVIF are used for all images.",
        "Responsive images serve appropriate sizes per device.",
      ],
      severity: "High",
      effort: "Medium",
      priority_tier: "Strategic",
    },
  ] satisfies FindingDetailed[],
  quick_wins_table: [
    {
      finding: "Contact form fields lack persistent visible labels.",
      recommendation:
        "Add visible labels above each form field that remain visible during input.",
      effort: "Small",
      estimated_time: "1-2 days",
    },
    {
      finding:
        "Submit button remains active after form submission allowing multiple clicks.",
      recommendation:
        "Disable submit button immediately on click and show loading state until submission completes.",
      effort: "Small",
      estimated_time: "1 day",
    },
    {
      finding: "No loading indicators during page transitions or form submissions.",
      recommendation:
        "Add visible loading spinners or progress bars during all data loading or processing states.",
      effort: "Small",
      estimated_time: "1-2 days",
    },
    {
      finding: "Tap and click targets on mobile are smaller than 44x44 pixels.",
      recommendation:
        "Increase size of all mobile navigation links and icon buttons to meet minimum target size.",
      effort: "Small",
      estimated_time: "1-2 days",
    },
    {
      finding: "Form validation errors rely solely on red text color.",
      recommendation:
        "Add error icons and descriptive labels alongside color to communicate errors effectively.",
      effort: "Small",
      estimated_time: "1-2 days",
    },
    {
      finding: "Portfolio and service images lack descriptive alt text.",
      recommendation: "Add meaningful alt text to all images conveying content or function.",
      effort: "Small",
      estimated_time: "1-2 days",
    },
    {
      finding: "Microcopy missing at key decision points on service pages and forms.",
      recommendation:
        "Add inline helper text or tooltips to guide users at complex or important inputs.",
      effort: "Small",
      estimated_time: "2-3 days",
    },
    {
      finding: "Jargon and buzzwords present in copy reduce clarity.",
      recommendation: "Replace jargon with plain language to improve comprehension and trust.",
      effort: "Small",
      estimated_time: "2-3 days",
    },
  ] satisfies QuickWin[],
  roadmap: {
    week_1_2: [
      "Add persistent visible labels above all contact form fields.",
      "Disable submit button immediately on form submission and add loading state.",
      "Add inline validation messages next to form fields triggered on input or blur.",
      "Implement loading indicators during page transitions and form submissions.",
      "Increase mobile tap targets for navigation links and icon buttons to 44x44 pixels minimum.",
      "Add alt text descriptions to all portfolio and service images.",
    ],
    month_1: [
      "Add pre-submission format hints or examples for all contact form fields.",
      "Preserve user input on form submission errors to avoid data loss.",
      "Add helper text or tooltips at key decision points on service pages and forms.",
      "Rewrite copy to remove jargon and buzzwords, replacing with plain language.",
      "Improve error message design to include icons and descriptive labels alongside color.",
      "Test and fix keyboard navigation issues on custom dropdowns and interactive components.",
    ],
    quarter_1: [
      "Optimize all large images using modern formats (WebP/AVIF) and compression.",
      "Implement responsive image loading techniques for different device sizes.",
      "Audit and improve color contrast for all body text to meet WCAG 2.1 AA standards.",
      "Add reduced-motion support to animations respecting user preferences.",
    ],
  } satisfies Roadmap,
  competitor_analysis: [
    {
      name: "Thoughtbot",
      url: "https://thoughtbot.com",
      positioning:
        "Strong credibility-led agency positioning focused on product design, engineering quality, and measurable business outcomes.",
      primary_cta: "Let’s get started",
      strengths: [
        "Uses concrete outcome-led proof like release speed improvements and client quotes.",
        "Signals maturity and trust through case studies, vertical focus, and strong editorial content.",
      ],
      gaps: [
        "Homepage feels text-heavy and shows less visual depth of actual design work.",
        "Less premium visual storytelling than high-end brand-first creative studios.",
      ],
      steal_this: [
        "Add quantified client impact metrics directly into the hero and case study previews.",
        "Use stronger proof blocks tied to business outcomes, not only service capability.",
      ],
    },
    {
      name: "Clay",
      url: "https://clay.global",
      positioning:
        "High-end digital agency framing with strong visual polish, motion, and premium brand perception.",
      primary_cta: "Start a project",
      strengths: [
        "Very strong premium visual identity and portfolio-first presentation.",
        "Creates a high-perceived-value impression through motion, spacing, and art direction.",
      ],
      gaps: [
        "May communicate aesthetics more clearly than conversion process or delivery structure.",
        "Less immediate functional proof compared with outcome-driven competitors.",
      ],
      steal_this: [
        "Improve case study preview presentation with more premium visual storytelling.",
        "Use stronger art direction and layout polish in service and portfolio sections.",
      ],
    },
    {
      name: "Superside",
      url: "https://superside.com",
      positioning:
        "Creative-as-a-service positioning built around fast delivery, AI-enabled workflows, and global team scale.",
      primary_cta: "Book a demo",
      strengths: [
        "Communicates scale, service breadth, and speed very clearly.",
        "Uses enterprise trust markers and ROI framing effectively.",
      ],
      gaps: [
        "Feels more operational and sales-led than design-led in tone.",
        "Less boutique differentiation for clients seeking a highly tailored partner.",
      ],
      steal_this: [
        "Add clearer messaging around speed, AI workflows, and breadth of delivery.",
        "Use stronger enterprise trust markers such as brand proof, ROI, and delivery claims.",
      ],
    },
  ] satisfies DemoCompetitor[],
  closing_note:
    "You already have a strong foundation to build on — by tightening input validation, improving feedback, and refining accessibility and microcopy, the experience can become even more confident, inclusive, and conversion-friendly. The current navigation and visual design give you a solid base for the next round of improvements.",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[color:var(--cream-dark)] bg-[color:var(--cream)] px-2.5 py-1 text-xs text-[color:var(--ink-muted)]">
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold tracking-tight">{children}</div>;
}

function Subtle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-[color:var(--ink-muted)]">{children}</div>;
}

function FindingCard({ f }: { f: FindingDetailed }) {
  return (
    <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold">
          {f.rank}. {f.bucket}
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill>{f.severity}</Pill>
          <Pill>Effort: {f.effort}</Pill>
          <Pill>{f.priority_tier}</Pill>
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        <div>
          <SectionTitle>What we found</SectionTitle>
          <Subtle>{f.what_we_found}</Subtle>
        </div>
        <div>
          <SectionTitle>Why it matters</SectionTitle>
          <Subtle>{f.why_it_matters}</Subtle>
        </div>
        <div>
          <SectionTitle>Recommendation</SectionTitle>
          <Subtle>{f.recommendation}</Subtle>
        </div>
        <div>
          <SectionTitle>Acceptance criteria</SectionTitle>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[color:var(--muted)]">
            {f.acceptance_criteria.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function DemoReport() {
  const [hydratedCompetitors, setHydratedCompetitors] = useState<DemoCompetitor[]>(
    DEMO.competitor_analysis as DemoCompetitor[],
  );
  const [demoStopped, setDemoStopped] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const resolved = await Promise.all(
        (DEMO.competitor_analysis as DemoCompetitor[]).map(async (competitor) => {
          if (competitor.screenshot) return competitor;
          try {
            const res = await fetch("/api/competitor-screenshot", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: competitor.name,
                url: competitor.url,
              }),
            });
            if (!res.ok) return competitor;
            const data = (await res.json()) as { screenshot_url?: string; screenshot?: string };
            return {
              ...competitor,
              screenshot: data.screenshot_url || data.screenshot || "",
            };
          } catch {
            return competitor;
          }
        }),
      );

      if (!cancelled) setHydratedCompetitors(resolved);
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const coverVm = useMemo(
    () =>
      ({
        productName: DEMO.product_name,
        productUrl: DEMO.product_url,
        productType: "website",
        generatedAt: DEMO.generated_at,
        auditReason: DEMO.audit_reason,
        auditType: "Demo audit",
        isLimitedCoverage: false,
        isScoringUnavailable: false,
        hasPartialScoring: false,
        overallScore: DEMO.overall_score,
        overallHealth: DEMO.overall_health,
        overallRisk: DEMO.overall_risk,
        captureCoverage: {
          status: "complete",
          summary: "Demo preview",
          loginPageCaptured: true,
          authenticatedDashboardCaptured: true,
          navigationCaptured: true,
          internalProductScreensCaptured: 5,
          internalProductScreensTarget: 5,
          formsCaptured: true,
          tablesCaptured: true,
          dropdownCaptured: true,
          errorEmptyLoadingCaptured: true,
          browserSessionUsed: false,
          guidedStepsAttempted: 0,
          guidedStepsCompleted: 0,
          questionsScoreable: 0,
          questionsTotal: 0,
          scoreEligible: true,
          failedStepReasons: [],
          whatWasCaptured: [],
          whatWasMissing: [],
          suggestedNextSteps: [],
        },
        pillarScores: DEMO.pillar_scores,
        scorecard: DEMO.scorecard,
        bucketResults: [],
        executiveSummary: DEMO.executive_summary,
        sectionNarrative: DEMO.section_narrative,
        findingsDetailed: DEMO.findings_detailed,
        quickWinsTable: DEMO.quick_wins_table,
        roadmap: DEMO.roadmap,
        closingNote: DEMO.closing_note,
      }) as unknown,
    [],
  );

  const pages = useMemo<ReportPage[]>(() => {
    const scorecard = DEMO.scorecard;
    const pillars = DEMO.pillar_scores;
    const findings = DEMO.findings_detailed;
    const quickWins = DEMO.quick_wins_table;
    const roadmap = DEMO.roadmap;
    const competitors = hydratedCompetitors;
    const topFindings = findings.slice(0, 5);
    const overallScore = Math.max(0, Math.min(100, DEMO.overall_score));
    const pillarOrder = ["Accessibility", "Impact", "Delight"] as const;
  const scoreCardOrder = ["Accessibility", "Impact", "Delight"] as const;
  const groupedScoreRows = pillarOrder.map((pillar) => ({
    pillar,
    rows: dedupeScoreRows(scorecard).filter((row) => bucketPillarFromRow(row) === pillar),
  }));
  const businessMetrics = [...calculateBusinessImpactMetrics(pillars)];
  const summaryBucketData = {
    Accessibility: {
      "Visual Feedback": summaryBucketDetails("Visual Feedback"),
      "Color & Contrast": summaryBucketDetails("Color & Contrast"),
      "Typography & Readability": summaryBucketDetails("Typography & Readability"),
      "Keyboard Navigation": summaryBucketDetails("Keyboard Navigation"),
      "Screen Reader Support": summaryBucketDetails("Screen Reader Support"),
    },
    Impact: {
      "Navigation & Findability": summaryBucketDetails("Navigation & Findability"),
      "Consistency & UI Patterns": summaryBucketDetails("Consistency & UI Patterns"),
      "Content (Impact)": summaryBucketDetails("Content (Impact)"),
      Performance: summaryBucketDetails("Performance"),
    },
    Delight: {
      "Visual Consistency": summaryBucketDetails("Visual Consistency"),
      "Motion & Microinteractions": summaryBucketDetails("Motion & Microinteractions"),
      "Content (Delight)": summaryBucketDetails("Content (Delight)"),
      "Brand Expression": summaryBucketDetails("Brand Expression"),
      "Icons & Imagery": summaryBucketDetails("Icons & Imagery"),
    },
  } as const;

  return [
      {
        key: "intro",
        title: "Intro",
        body: <IntroPageSection vm={coverVm as never} />,
        variant: "cover",
      },
      {
        key: "overview",
        title: "Overview",
        body: <OverviewSection vm={coverVm as never} />,
        variant: "standard",
      },
      ...buildNarrativeSummaryPages({ vm: coverVm as never, pillar: "Accessibility", bucketData: summaryBucketData.Accessibility }),
      ...buildNarrativeSummaryPages({ vm: coverVm as never, pillar: "Impact", bucketData: summaryBucketData.Impact }),
      ...buildNarrativeSummaryPages({ vm: coverVm as never, pillar: "Delight", bucketData: summaryBucketData.Delight }),
      ...buildCompetitorAnalysisPages({ competitors }),
      {
        key: "critical_findings",
        title: "Critical Findings",
        body: (
          <div className="space-y-4">
            {topFindings.map((f) => (
              <FindingCard key={f.rank} f={f} />
            ))}
          </div>
        ),
        variant: "standard",
      },
      {
        key: "quick_wins_roadmap",
        title: "Quick Wins & Roadmap",
        body: (
          <div className="space-y-5">
            <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
              <div className="text-sm font-semibold">Quick wins table</div>
              <div className="mt-4 overflow-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
                    <tr>
                      <th className="py-2 pr-4">Finding</th>
                      <th className="py-2 pr-4">Recommendation</th>
                      <th className="py-2 pr-4">ETA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--card-border)]/60">
                    {quickWins.map((w) => (
                      <tr key={w.finding}>
                        <td className="py-3 pr-4 font-medium">{w.finding}</td>
                        <td className="py-3 pr-4 text-[color:var(--muted)]">{w.recommendation}</td>
                        <td className="py-3 pr-4 font-mono">{w.estimated_time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
                <div className="text-sm font-semibold">Week 1–2</div>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[color:var(--muted)]">
                  {roadmap.week_1_2.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
                <div className="text-sm font-semibold">Month 1</div>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[color:var(--muted)]">
                  {roadmap.month_1.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
                <div className="text-sm font-semibold">Quarter 1</div>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[color:var(--muted)]">
                  {roadmap.quarter_1.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
              <div className="text-sm font-semibold">Closing note</div>
              <div className="mt-3 text-sm text-[color:var(--muted)]">{DEMO.closing_note}</div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="btn btnGhost" href="/">
                Back to home <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        ),
        variant: "standard",
      },
    ];
  }, [coverVm, hydratedCompetitors]);
  const [page, setPage] = useState(0);
  const current = pages[page]!;

  function stopDemoReport() {
    setDemoStopped(true);
  }

  function resetDemoReport() {
    setDemoStopped(false);
    setPage(0);
  }

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [page]);

  return (
    <div className="flex min-h-screen flex-col p-6" data-report-live-root>
      <div className="no-print flex flex-wrap items-start justify-between gap-4" data-report-toolbar>
        <div>
          <div className="text-lg font-semibold">Sample report: {DEMO.product_name}</div>
          <div className="mt-1 text-sm text-[color:var(--ink-muted)]">
            Client‑deliverable preview (multi-page).
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            href="/audit"
          >
            Open audit form
          </Link>
        </div>
      </div>

      {demoStopped ? (
        <div className="mt-5 flex-1 min-h-0 rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-[color:var(--white)] p-8">
          <div className="max-w-2xl">
            <div className="text-lg font-semibold">Report stopped</div>
            <div className="mt-3 text-sm text-[color:var(--ink-muted)]">
              The sample report is paused so you can go back, adjust the form, and send it again.
              This only affects the demo preview.
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link className="btnPrimary" href="/audit">
                Edit audit form
              </Link>
              <button
                type="button"
                onClick={resetDemoReport}
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
              >
                View report again
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="mt-5 flex-1 min-h-0 overflow-x-auto"
          data-report-live-canvas
          data-current-page={page + 1}
          data-total-pages={pages.length}
        >
          <div
            className={`report-a4-page print-page mt-5 print-report-root ${
              current.variant === "cover"
                ? "report-a4-page-cover bg-[#fc6d27]"
                : current.title === "Overview"
                  ? "report-a4-page-overview"
                : "bg-[color:var(--white)]"
            }`}
            data-report-live-page
            data-report-page-title={current.title}
          >
            <div className={`report-a4-page-inner relative ${current.variant === "cover" ? "h-full" : ""}`}>
              {current.variant === "cover" ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="h-full">{current.body}</div>
                </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <div className="report-a4-page-body">
                  {current.showTitle !== false ? (
                    <div
                      className={`mb-5 flex flex-col items-start gap-1 self-stretch ${
                        current.title === "Overview"
                          ? "pb-0"
                          : "border-b border-[rgba(15,23,42,0.14)] pb-4"
                      }`}
                    >
                      <div
                        className="text-[24px] font-bold leading-normal text-[color:var(--report-black)]"
                        style={{ fontFamily: 'var(--font-roboto-condensed), "Roboto Condensed", sans-serif' }}
                      >
                        {current.title}
                      </div>
                    </div>
                  ) : null}
                  {current.body}
                </div>
                  <div className="mt-auto flex h-[30px] shrink-0 items-center justify-between self-stretch border-t border-[rgba(252,109,39,0.20)] bg-[color:var(--report-orange)] px-8 py-1.5 text-[14px] leading-5 text-[color:var(--report-black)]">
                    <div>Page {page + 1}</div>
                    <div>UX Audit Report</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="no-print sticky bottom-4 z-20 mt-5 rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-[color:var(--white)] p-5 shadow-lg shadow-black/5 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-[color:var(--ink-muted)]">
            {demoStopped ? "Demo paused" : `Page ${page + 1} / ${pages.length}`}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || demoStopped}
              style={page === 0 || demoStopped ? { opacity: 0.5, pointerEvents: "none" } : undefined}
            >
              ← Prev
            </button>
            <button
              type="button"
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-black hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
              onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
              disabled={page === pages.length - 1 || demoStopped}
              style={
                page === pages.length - 1 || demoStopped
                  ? { opacity: 0.5, pointerEvents: "none" }
                  : undefined
              }
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
