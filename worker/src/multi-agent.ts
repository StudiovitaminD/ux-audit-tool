import type { WorkerEnv } from "./env.js";
import { openRouterChat } from "./openrouter.js";

type Pillar = "Accessibility" | "Impact" | "Delight";

export type SpecialistFinding = {
  bucket: string;
  pillar: Pillar;
  title: string;
  evidence: string[];
  recommendation: string;
  confidence: number;
  severity: "critical" | "high" | "medium" | "low";
};

export type SpecialistReview = {
  status: "complete" | "partial" | "failed";
  agents: Record<string, { status: "complete" | "failed"; error?: string; findings: SpecialistFinding[] }>;
  reviewer: { status: "complete" | "failed"; error?: string };
  reviewedFindings: SpecialistFinding[];
};

const ROLES: Record<string, { pillar: Pillar; instructions: string }> = {
  accessibility: {
    pillar: "Accessibility",
    instructions: "Review keyboard access, focus, semantics, contrast, readable text, forms, errors, and screen-reader support.",
  },
  impact: {
    pillar: "Impact",
    instructions: "Review load performance, runtime responsiveness, failed requests, loading states, timeouts, error recovery, and mobile performance only.",
  },
  delight: {
    pillar: "Delight",
    instructions: "Review visual consistency, brand expression, content clarity, feedback, motion, and microinteractions.",
  },
};

function parseObject(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
      } catch {}
    }
  }
  return {};
}

function normalizeFindings(value: unknown, pillar: Pillar, buckets: string[]): SpecialistFinding[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const finding = item as Record<string, unknown>;
      const bucket = String(finding.bucket || "").trim();
      const severity = String(finding.severity || "medium").toLowerCase();
      return {
        bucket,
        pillar,
        title: String(finding.title || "").trim(),
        evidence: Array.isArray(finding.evidence) ? finding.evidence.map(String).filter(Boolean).slice(0, 5) : [],
        recommendation: String(finding.recommendation || "").trim(),
        confidence: Math.max(0, Math.min(1, Number(finding.confidence) || 0)),
        severity: (["critical", "high", "medium", "low"].includes(severity) ? severity : "medium") as SpecialistFinding["severity"],
      };
    })
    .filter((finding) => buckets.includes(finding.bucket) && finding.title && finding.evidence.length > 0)
    .slice(0, 12);
}

export async function runSpecialistReview(
  env: WorkerEnv,
  input: { intake: unknown; evidence: unknown; bucketResults: Array<Record<string, unknown>>; model?: string },
): Promise<SpecialistReview> {
  const buckets = input.bucketResults.map((bucket) => String(bucket.bucket_name || "")).filter(Boolean);
  const context = JSON.stringify(input).slice(0, 28000);
  const outputs = await Promise.all(Object.entries(ROLES).map(async ([name, role]) => {
    try {
      const raw = await openRouterChat(env, {
        model: input.model,
        prompt: `You are the ${name} specialist in a UX audit team. ${role.instructions}\nUse only verified evidence. Missing or untested evidence is not a product defect. Return findings only for confirmed problems. Use clear everyday language. bucket must exactly match one of: ${buckets.join(", ")}. Return JSON only: {"findings":[{"bucket":"...","title":"...","severity":"critical|high|medium|low","evidence":["..."],"confidence":0.0,"recommendation":"..."}]}\nContext:\n${context}`,
      });
      const parsed = parseObject(raw);
      return [name, { status: "complete" as const, findings: normalizeFindings(parsed.findings, role.pillar, buckets) }] as const;
    } catch (error) {
      return [name, { status: "failed" as const, error: error instanceof Error ? error.message : String(error), findings: [] }] as const;
    }
  }));
  const agents = Object.fromEntries(outputs);
  const candidates = outputs.flatMap(([, result]) => result.findings);
  let reviewer: SpecialistReview["reviewer"] = { status: "complete" };
  let reviewedFindings = candidates;

  if (candidates.length) {
    try {
      const raw = await openRouterChat(env, {
        model: input.model,
        prompt: `You are the senior UX audit reviewer. Remove duplicates and reject unsupported claims. Preserve bucket and pillar. Use clear everyday language. Return JSON only: {"findings":[{"bucket":"...","pillar":"Accessibility|Impact|Delight","title":"...","severity":"critical|high|medium|low","evidence":["..."],"confidence":0.0,"recommendation":"..."}]}\nCandidates:\n${JSON.stringify(candidates).slice(0, 18000)}`,
      });
      const parsed = parseObject(raw);
      const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
      reviewedFindings = rawFindings.flatMap((item) => {
        const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const pillar = ["Accessibility", "Impact", "Delight"].includes(String(record.pillar))
          ? String(record.pillar) as Pillar
          : candidates.find((candidate) => candidate.title.toLowerCase() === String(record.title || "").toLowerCase())?.pillar || "Impact";
        return normalizeFindings([record], pillar, buckets);
      });
      if (!reviewedFindings.length) reviewedFindings = candidates;
    } catch (error) {
      reviewer = { status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
  } else {
    const failures = outputs.filter(([, result]) => result.status === "failed").length;
    reviewer = failures
      ? { status: "failed", error: "No verified specialist findings were available to review." }
      : { status: "complete" };
  }

  const failures = outputs.filter(([, result]) => result.status === "failed").length;
  return {
    status: failures === outputs.length ? "failed" : failures || reviewer.status === "failed" ? "partial" : "complete",
    agents,
    reviewer,
    reviewedFindings,
  };
}
