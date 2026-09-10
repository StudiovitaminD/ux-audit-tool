export type PillarAgent = "accessibility" | "impact" | "delight";

export type MultiAgentFinding = {
  pillar: PillarAgent;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  evidence: string[];
  confidence: number;
  recommendation: string;
};

export type MultiAgentResult = {
  agents: Record<PillarAgent, { findings: MultiAgentFinding[]; summary: string }>;
  reviewedFindings: MultiAgentFinding[];
};

const ROLE_PROMPTS: Record<PillarAgent, string> = {
  accessibility: "Audit WCAG-oriented accessibility: keyboard access, focus, semantics, contrast, typography, forms, errors, and screen-reader support.",
  impact: "Audit business and task impact: user goals, task completion, conversion friction, findability, drop-off risks, and measurable business consequences.",
  delight: "Audit experience quality: visual consistency, brand expression, content clarity, feedback, motion, microinteractions, and perceived polish.",
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

function normalizeFindings(value: unknown, pillar: PillarAgent): MultiAgentFinding[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object").slice(0, 12).map((item) => {
    const rec = item as Record<string, unknown>;
    const severity = String(rec.severity || "medium").toLowerCase();
    return {
      pillar,
      title: String(rec.title || "Untitled finding").slice(0, 240),
      severity: (["critical", "high", "medium", "low"].includes(severity) ? severity : "medium") as MultiAgentFinding["severity"],
      evidence: Array.isArray(rec.evidence) ? rec.evidence.map(String).slice(0, 5) : [],
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
  const outputs = await Promise.all(Object.entries(ROLE_PROMPTS).map(async ([pillar, role]) => {
    const prompt = `You are the ${pillar} specialist in a UX audit team. ${role}\nUse only the supplied evidence. Never invent screens, interactions, or measurements. Return JSON only: {"summary":"...","findings":[{"title":"...","severity":"critical|high|medium|low","evidence":["..."],"confidence":0.0,"recommendation":"..."}]}\nEvidence and context:\n${context}`;
    const parsed = parseJson(await args.chat(prompt));
    const key = pillar as PillarAgent;
    return [key, { summary: String(parsed.summary || ""), findings: normalizeFindings(parsed.findings, key) }] as const;
  }));
  const agents = Object.fromEntries(outputs) as MultiAgentResult["agents"];
  const findings = outputs.flatMap(([, output]) => output.findings);
  const review = parseJson(await args.chat(`You are the senior UX audit reviewer. Deduplicate overlapping findings, reject findings without evidence, and keep the strongest evidence-backed version. Return JSON only: {"findings":[{"pillar":"accessibility|impact|delight","title":"...","severity":"critical|high|medium|low","evidence":["..."],"confidence":0.0,"recommendation":"..."}]}\nCandidate findings:\n${JSON.stringify(findings).slice(0, 18000)}`));
  const reviewedFindings = normalizeFindings(review.findings, "impact").map((finding) => {
    const original = findings.find((item) => item.title.toLowerCase() === finding.title.toLowerCase());
    return original ? { ...finding, pillar: original.pillar } : finding;
  });
  return { agents, reviewedFindings: reviewedFindings.length ? reviewedFindings : findings };
}
