export type PillarAgent = "accessibility" | "impact" | "delight";

export type MultiAgentFinding = {
  pillar: PillarAgent;
  bucket: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  page: string;
  state: string;
  evidence: string[];
  testedActions: string[];
  confidence: number;
  recommendation: string;
};

export type TestedState = {
  page: string;
  state: string;
  status: "tested" | "not_tested";
  evidence: string[];
};

export type MultiAgentResult = {
  status: "complete" | "partial" | "failed";
  agents: Record<PillarAgent, {
    status: "complete" | "failed";
    error?: string;
    findings: MultiAgentFinding[];
    summary: string;
    testedStates: TestedState[];
  }>;
  reviewer: { status: "complete" | "failed"; error?: string };
  reviewedFindings: MultiAgentFinding[];
};

const ROLE_PROMPTS: Record<PillarAgent, string> = {
  accessibility: "Audit WCAG-oriented accessibility: keyboard access, focus, semantics, contrast, typography, forms, errors, and screen-reader support. Check default, hover, focus, keyboard-focused, active, disabled, loading, success, error, validation, empty, expanded, collapsed, open-menu, modal, mobile, 200% zoom, and reduced-motion states where applicable.",
  impact: "Audit the Impact pillar only: page-load performance, DOM load readiness, resource and asset loading, runtime responsiveness, interaction latency, loading states, slow-network behavior, timeout behavior, error recovery, and mobile performance. Use measurable browser evidence such as navigation timing, DOMContentLoaded, load event, first content visibility when available, long tasks, failed requests, layout shifts, and interaction response time. Do not evaluate business goals, conversion, navigation findability, content quality, UI consistency, or the separate Business Impact Matrix formula.",
  delight: "Audit experience quality: visual consistency, brand expression, content clarity, feedback, motion, and microinteractions. Check default, hover, focus, active, disabled, loading, success, error, empty, expanded, collapsed, open-menu, modal, mobile, and reduced-motion states where applicable.",
};

function parseJson(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw) as Record<string, unknown>; } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>; } catch {}
  }
  return {};
}

function normalizeTestedStates(value: unknown): TestedState[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object").slice(0, 40).map((item) => {
    const rec = item as Record<string, unknown>;
    const status: TestedState["status"] = rec.status === "tested" ? "tested" : "not_tested";
    return {
      page: String(rec.page || "").slice(0, 160),
      state: String(rec.state || "").slice(0, 100),
      status,
      evidence: Array.isArray(rec.evidence) ? rec.evidence.map(String).slice(0, 5) : [],
    };
  }).filter((state) => state.page && state.state);
}

function normalizeFindings(value: unknown, pillar: PillarAgent): MultiAgentFinding[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object").slice(0, 12).map((item) => {
    const rec = item as Record<string, unknown>;
    const severity = String(rec.severity || "medium").toLowerCase();
    return {
      pillar,
      bucket: String(rec.bucket || "").slice(0, 160),
      title: String(rec.title || "Untitled finding").slice(0, 240),
      severity: (["critical", "high", "medium", "low"].includes(severity) ? severity : "medium") as MultiAgentFinding["severity"],
      page: String(rec.page || "").slice(0, 160),
      state: String(rec.state || "").slice(0, 100),
      evidence: Array.isArray(rec.evidence) ? rec.evidence.map(String).slice(0, 5) : [],
      testedActions: Array.isArray(rec.tested_actions) ? rec.tested_actions.map(String).slice(0, 12) : [],
      confidence: Math.max(0, Math.min(1, Number(rec.confidence) || 0)),
      recommendation: String(rec.recommendation || "").slice(0, 600),
    };
  }).filter((finding) => finding.title && finding.evidence.length > 0);
}

export async function runMultiAgentAudit(args: {
  chat: (prompt: string) => Promise<string>;
  intake: unknown;
  evidence: unknown;
  bucketResults: unknown;
}): Promise<MultiAgentResult> {
  const context = JSON.stringify({ intake: args.intake, evidence: args.evidence, bucketResults: args.bucketResults }).slice(0, 28000);
  const selectedBuckets = Array.isArray(args.bucketResults)
    ? args.bucketResults
        .map((item) => item && typeof item === "object" ? String((item as Record<string, unknown>).bucket_name || "") : "")
        .filter(Boolean)
    : [];
  const outputs = await Promise.all(Object.entries(ROLE_PROMPTS).map(async ([pillar, role]) => {
    const key = pillar as PillarAgent;
    const prompt = `You are the ${pillar} specialist in a UX audit team. ${role}
Use the supplied full-page screenshots as the primary evidence for everything visibly rendered: layout, typography, contrast, content, visible labels, visual hierarchy, consistency, and visible loading, success, error, or empty states. Use Playwright evidence only when the question requires interaction, keyboard behavior, DOM semantics, screen-reader-related structure, navigation timing, network behavior, or runtime performance. Analyze the supplied screenshots, DOM observations, URLs, and action traces together without requiring Playwright for screenshot-verifiable answers.
Rules:
- Use only verified evidence. Never invent screens, interactions, measurements, or WCAG failures.
- A visibly verifiable state may be scored from a clear screenshot when the state is identified in the evidence.
- An interaction, DOM, or performance state may be scored only when Playwright reached or measured it successfully.
- If the required evidence for a state is missing, mark it not_tested and do not reduce the score.
- Distinguish confirmed failures from recommendations for further testing.
- Every finding must include the exact matching bucket name, page, component/state, evidence references, tested actions, and confidence.
- bucket must be one of: ${selectedBuckets.join(", ") || "none"}. If no bucket matches, do not return the finding.
Return JSON only: {"summary":"...","tested_states":[{"page":"...","state":"...","status":"tested|not_tested","evidence":["..."]}],"findings":[{"bucket":"...","title":"...","severity":"critical|high|medium|low","page":"...","state":"...","evidence":["..."],"tested_actions":["..."],"confidence":0.0,"recommendation":"..."}]}
Evidence and context:
${context}`;
    try {
      const parsed = parseJson(await args.chat(prompt));
      return [key, {
        status: "complete" as const,
        summary: String(parsed.summary || ""),
        findings: normalizeFindings(parsed.findings, key).filter((finding) => selectedBuckets.includes(finding.bucket)),
        testedStates: normalizeTestedStates(parsed.tested_states),
      }] as const;
    } catch (error) {
      return [key, {
        status: "failed" as const,
        error: error instanceof Error ? error.message : String(error),
        summary: "",
        findings: [],
        testedStates: [],
      }] as const;
    }
  }));
  const agents = Object.fromEntries(outputs) as MultiAgentResult["agents"];
  const findings = outputs.flatMap(([, output]) => output.findings);
  if (!findings.length) {
    const failedCount = outputs.filter(([, output]) => output.status === "failed").length;
    return {
      status: failedCount === outputs.length ? "failed" : failedCount ? "partial" : "complete",
      agents,
      reviewer: failedCount
        ? { status: "failed", error: "No verified specialist findings were available to review." }
        : { status: "complete" },
      reviewedFindings: [],
    };
  }

  let review: Record<string, unknown> = {};
  let reviewer: MultiAgentResult["reviewer"] = { status: "complete" };
  try {
    review = parseJson(await args.chat(`You are the senior UX audit reviewer. Deduplicate overlapping findings, reject findings without evidence, and keep the strongest evidence-backed version. Preserve the original bucket, pillar, page, state, and tested actions. bucket must remain one of: ${selectedBuckets.join(", ")}. Return JSON only: {"findings":[{"bucket":"...","pillar":"accessibility|impact|delight","title":"...","severity":"critical|high|medium|low","page":"...","state":"...","evidence":["..."],"tested_actions":["..."],"confidence":0.0,"recommendation":"..."}]}\nCandidate findings:\n${JSON.stringify(findings).slice(0, 18000)}`));
  } catch (error) {
    reviewer = { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
  const reviewedFindings = normalizeFindings(review.findings, "impact").map((finding, index) => {
    const original = findings.find((item) => item.title.toLowerCase() === finding.title.toLowerCase());
    const reviewed = (Array.isArray(review.findings) ? review.findings[index] : null) as Record<string, unknown> | null;
    const reviewedPillar = reviewed?.pillar;
    const pillar = reviewedPillar === "accessibility" || reviewedPillar === "impact" || reviewedPillar === "delight"
      ? reviewedPillar
      : original?.pillar || finding.pillar;
    const bucket = selectedBuckets.includes(finding.bucket) ? finding.bucket : original?.bucket || "";
    return original ? { ...original, ...finding, pillar, bucket } : { ...finding, pillar, bucket };
  }).filter((finding) => selectedBuckets.includes(finding.bucket));
  const failedCount = outputs.filter(([, output]) => output.status === "failed").length;
  return {
    status: failedCount === 0 && reviewer.status === "complete" ? "complete" : "partial",
    agents,
    reviewer,
    reviewedFindings: reviewedFindings.length ? reviewedFindings : findings,
  };
}
