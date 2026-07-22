"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  compare_focus: string;
  positioning: string;
  primary_cta: string;
  strengths: string[];
  gaps: string[];
  steal_this: string[];
  screenshot?: string;
};

const DEMO = {
  product_name: "Vitamin D.in",
  product_url: "vitamin-d.in",
  generated_at: "2026-05-13T11:56:23.299Z",
  overall_score: 67,
  overall_health: "Moderate",
  overall_risk: "Moderate",
  pillar_scores: {
    Delight: { score: 77, evaluated: true },
    Impact: { score: 66, evaluated: true },
    Accessibility: { score: 50, evaluated: true },
  } satisfies Record<string, PillarScore>,
  scorecard: [
    {
      section: "Navigation & Findability",
      score: "94/100",
      health: "Excellent",
      risk_level: "Optimised",
      priority: "P4",
      pillar: "Impact",
    },
    {
      section: "Content & UX Writing",
      score: "64/100",
      health: "Moderate",
      risk_level: "Moderate",
      priority: "P2",
      pillar: "Delight",
    },
    {
      section: "Visual Hierarchy & Layout",
      score: "90/100",
      health: "Excellent",
      risk_level: "Optimised",
      priority: "P4",
      pillar: "Delight",
    },
    {
      section: "Accessibility & Inclusivity",
      score: "50/100",
      health: "Poor",
      risk_level: "High",
      priority: "P1",
      pillar: "Accessibility",
    },
    {
      section: "Input, Errors & Validation",
      score: "34/100",
      health: "Critical",
      risk_level: "Critical",
      priority: "P1",
      pillar: "Impact",
    },
    {
      section: "Feedback & System States",
      score: "54/100",
      health: "Poor",
      risk_level: "High",
      priority: "P1",
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
      section: "Product Optimisation",
      score: "60/100",
      health: "Moderate",
      risk_level: "Moderate",
      priority: "P2",
      pillar: "Impact",
    },
  ] satisfies ScorecardRow[],
  executive_summary: {
    overall_score: 67,
    health_tier: "Moderate",
    one_line_verdict:
      "Critical failures in form input validation and feedback mechanisms on the contact form are the biggest conversion blockers.",
    what_works:
      "Navigation & Findability scores excellently at 94/100 with a clear, consistent top navigation bar and intuitive labels that surface all key pages in one click. Visual Hierarchy & Layout also performs strongly at 90/100, with clear typographic hierarchy, consistent spacing, and responsive layouts across devices. Consistency & UI Patterns score 86/100, showing a cohesive visual style and predictable interactions throughout the site. These strengths provide a solid foundation for user orientation and visual clarity.",
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
      "Accessibility is a major concern with a low score of 50/100. Key issues include missing persistent visible labels on form fields, tap targets below recommended sizes on mobile, and error indicators relying solely on color without icons or descriptive labels. Many images lack alt text, and animations do not respect reduced-motion preferences. Keyboard navigation is partially supported but some custom components are inaccessible or lack visible focus states. Contrast issues with light gray text on white backgrounds further reduce readability for users with visual impairments.",
  },
  findings_detailed: [
    {
      rank: 1,
      bucket: "Input, Errors & Validation",
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
      bucket: "Feedback & System States",
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
      bucket: "Accessibility & Inclusivity",
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
      bucket: "Accessibility & Inclusivity",
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
      bucket: "Accessibility & Inclusivity",
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
      bucket: "Content & UX Writing",
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
      bucket: "Content & UX Writing",
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
      bucket: "Product Optimisation",
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
      compare_focus: "UX and product design quality",
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
      compare_focus: "Premium agency positioning and portfolio presentation",
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
      compare_focus: "Scale, speed, and service breadth",
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
    "Addressing critical input validation and feedback issues on the contact form will unlock immediate improvements in user confidence and conversion rates. Coupled with accessibility fixes and clearer microcopy, these changes will create a more inclusive and trustworthy experience. The strong foundation in navigation and visual design can then support strategic optimizations in performance and content clarity over the coming quarters.",
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
                compare_focus: competitor.compare_focus,
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

  const pages = useMemo(() => {
    const scorecard = DEMO.scorecard;
    const pillars = DEMO.pillar_scores;
    const findings = DEMO.findings_detailed;
    const quickWins = DEMO.quick_wins_table;
    const roadmap = DEMO.roadmap;
    const competitors = hydratedCompetitors;
    const topFindings = findings.slice(0, 5);

    return [
      {
        title: "Overview",
        body: (
          <div className="space-y-5">
            <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
              <div className="text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">
                UX Audit Report Details
              </div>
              <div className="mt-2 font-display text-4xl font-semibold tracking-tight">
                {DEMO.product_name}
              </div>
              <div className="mt-3 grid gap-2 text-sm text-[color:var(--muted)]">
                <div>Name: {DEMO.product_name}</div>
                <div>URL: {DEMO.product_url}</div>
                <div>Time: {formatDate(DEMO.generated_at)}</div>
                <div>Reason: {DEMO.executive_summary.one_line_verdict}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
              <div className="text-sm text-[color:var(--muted)]">Overall Score</div>
              <div className="mt-2 flex items-end gap-3">
                <div className="font-mono text-5xl font-bold tracking-tight">
                  {DEMO.overall_score}
                  <span className="text-xl text-[color:var(--muted)]">/100</span>
                </div>
                <div className="pb-1">
                  <div className="text-sm">
                    Health: <span className="font-semibold">{DEMO.overall_health}</span>
                  </div>
                  <div className="text-sm text-[color:var(--muted)]">Risk: {DEMO.overall_risk}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {Object.entries(pillars).map(([name, p]) => (
                <div
                  key={name}
                  className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5"
                >
                  <div className="text-sm text-[color:var(--muted)]">{name} Score</div>
                  <div className="mt-2 font-mono text-3xl font-bold">
                    {p.score}
                    <span className="text-sm text-[color:var(--muted)]">/100</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
              <div className="text-sm font-semibold">Score Card</div>
              <div className="mt-4 overflow-auto">
                <table className="w-full min-w-[780px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
                    <tr>
                      <th className="py-2 pr-4">Bucket</th>
                      <th className="py-2 pr-4">Score</th>
                      <th className="py-2 pr-4">Health</th>
                      <th className="py-2 pr-4">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--card-border)]/60">
                    {scorecard.map((r) => (
                      <tr key={r.section}>
                        <td className="py-3 pr-4 font-medium">{r.section}</td>
                        <td className="py-3 pr-4 font-mono">{r.score}</td>
                        <td className="py-3 pr-4">{r.health}</td>
                        <td className="py-3 pr-4">{r.risk_level}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ),
      },
      {
        title: "Executive Summary",
        body: (
          <div className="space-y-5">
            <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
              <div className="text-sm font-semibold">One line Verdict</div>
              <div className="mt-2 text-sm text-[color:var(--muted)]">
                {DEMO.executive_summary.one_line_verdict}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
                <div className="text-sm font-semibold">Top Problems</div>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[color:var(--muted)]">
                  {DEMO.executive_summary.top_3_problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
                <div className="text-sm font-semibold">First Priority</div>
                <div className="mt-2 text-sm text-[color:var(--muted)]">
                  {DEMO.executive_summary.first_priority_recommendation}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
                <div className="text-sm font-semibold">What&apos;s Working</div>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[color:var(--muted)]">
                  {DEMO.executive_summary.top_3_quick_wins.slice(0, 4).map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
                <div className="text-sm font-semibold">Quick Wins</div>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[color:var(--muted)]">
                  {quickWins.slice(0, 6).map((q) => (
                    <li key={q.finding}>{q.recommendation}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ),
      },
      {
        title: "Narrative Summary",
        body: (
          <div className="space-y-4">
            {[
              ["Delight", DEMO.section_narrative.delight_narrative],
              ["Impact", DEMO.section_narrative.impact_narrative],
              ["Accessibility", DEMO.section_narrative.accessibility_narrative],
            ].map(([title, text]) => (
              <div
                key={String(title)}
                className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5"
              >
                <div className="text-sm font-semibold">{String(title)}</div>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[color:var(--muted)]">
                  {String(text)
                    .split(/(?<=[.!?])\s+/)
                    .filter(Boolean)
                    .slice(0, 6)
                    .map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        ),
      },
      {
        title: "Competitor Analysis",
        body: (
          <div className="space-y-5">
            <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
              <div className="text-sm font-semibold">Competitor comparison snapshot</div>
              <div className="mt-4 overflow-auto">
                <table className="w-full min-w-[880px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
                    <tr>
                      <th className="py-2 pr-4">Competitor</th>
                      <th className="py-2 pr-4">Compare focus</th>
                      <th className="py-2 pr-4">Positioning</th>
                      <th className="py-2 pr-4">Primary CTA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--card-border)]/60">
                    {competitors.map((competitor) => (
                      <tr key={competitor.name}>
                        <td className="py-3 pr-4 font-medium">
                          <div>{competitor.name}</div>
                          <div className="mt-1 text-xs text-[color:var(--muted)]">{competitor.url}</div>
                        </td>
                        <td className="py-3 pr-4 text-[color:var(--muted)]">{competitor.compare_focus}</td>
                        <td className="py-3 pr-4 text-[color:var(--muted)]">{competitor.positioning}</td>
                        <td className="py-3 pr-4 font-medium">{competitor.primary_cta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {competitors.map((competitor) => (
                <div
                  key={competitor.name}
                  className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5"
                >
                  {competitor.screenshot ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={competitor.screenshot}
                      alt={`${competitor.name} screenshot`}
                      className="mb-4 h-40 w-full rounded-xl border border-[color:var(--card-border)] object-cover"
                    />
                  ) : (
                    <div className="mb-4 flex h-40 w-full items-center justify-center rounded-xl border border-[color:var(--card-border)] bg-white/5 text-sm text-[color:var(--muted)]">
                      Screenshot unavailable
                    </div>
                  )}
                  <div className="text-sm font-semibold">{competitor.name}</div>
                  <div className="mt-1 text-xs uppercase tracking-wider text-[color:var(--muted)]">
                    {competitor.compare_focus}
                  </div>

                  <div className="mt-4">
                    <SectionTitle>Strengths</SectionTitle>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[color:var(--muted)]">
                      {competitor.strengths.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-4">
                    <SectionTitle>Gaps</SectionTitle>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[color:var(--muted)]">
                      {competitor.gaps.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-4">
                    <SectionTitle>Steal this</SectionTitle>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[color:var(--muted)]">
                      {competitor.steal_this.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ),
      },
      {
        title: "Critical Findings",
        body: (
          <div className="space-y-4">
            {topFindings.map((f) => (
              <FindingCard key={f.rank} f={f} />
            ))}
          </div>
        ),
      },
      {
        title: "Quick Wins & Roadmap",
        body: (
          <div className="space-y-5">
            <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
              <div className="text-sm font-semibold">Quick wins table</div>
              <div className="mt-4 overflow-auto">
                <table className="w-full min-w-[880px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
                    <tr>
                      <th className="py-2 pr-4">Finding</th>
                      <th className="py-2 pr-4">Recommendation</th>
                      <th className="py-2 pr-4">Effort</th>
                      <th className="py-2 pr-4">ETA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--card-border)]/60">
                    {quickWins.map((w) => (
                      <tr key={w.finding}>
                        <td className="py-3 pr-4 font-medium">{w.finding}</td>
                        <td className="py-3 pr-4 text-[color:var(--muted)]">{w.recommendation}</td>
                        <td className="py-3 pr-4">{w.effort}</td>
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
      },
    ];
  }, [hydratedCompetitors]);
  const [page, setPage] = useState(0);
  const current = pages[page]!;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">
            Sample report: {DEMO.product_name}
          </div>
          <div className="mt-1 text-sm text-[color:var(--ink-muted)]">
            Client‑deliverable preview (multi‑page).
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-[color:var(--white)] p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-[color:var(--ink-muted)]">
            Page {page + 1} / {pages.length}
          </div>
          <div className="text-sm font-semibold">{current.title}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btnPrimary"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-disabled={page === 0}
              style={page === 0 ? { opacity: 0.5, pointerEvents: "none" } : undefined}
            >
              ← Prev
            </button>
            <button
              type="button"
              className="btnPrimary"
              onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
              disabled={page === pages.length - 1}
              aria-disabled={page === pages.length - 1}
              style={
                page === pages.length - 1
                  ? { opacity: 0.5, pointerEvents: "none" }
                  : undefined
              }
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-[color:var(--white)] p-8">
        {current.body}
      </div>
    </div>
  );
}
