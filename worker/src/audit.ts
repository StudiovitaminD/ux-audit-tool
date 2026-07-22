import type { EvidenceBundle, Intake, BucketResult } from "./types.js";
import type { WorkerEnv } from "./env.js";
import { QUESTION_BANK } from "./question-bank.js";
import { openRouterChat } from "./openrouter.js";

const PILLAR_MAP: Record<string, string> = {
  "Navigation & Findability": "Impact",
  "Content & UX Writing": "Delight",
  "Visual Hierarchy & Layout": "Delight",
  "Accessibility & Inclusivity": "Accessibility",
  "Input, Errors & Validation": "Impact",
  "Feedback & System States": "Impact",
  "Consistency & UI Patterns": "Impact",
  "Product Optimisation": "Impact",
};

function getHealth(score: number) {
  if (score >= 85) return { label: "Excellent", risk: "Optimised", priority: "P4" };
  if (score >= 70) return { label: "Good", risk: "Low Risk", priority: "P3" };
  if (score >= 55) return { label: "Moderate", risk: "Moderate", priority: "P2" };
  if (score >= 40) return { label: "Poor", risk: "High", priority: "P1" };
  return { label: "Critical", risk: "Critical", priority: "P1" };
}

function evidenceBlock(evidence: EvidenceBundle | null) {
  if (!evidence) return "Evidence capture: (not available)";
  const pages = evidence.pages.slice(0, 6).map((p, idx) => {
    const nav = p.topNavLinks.slice(0, 10).map((l) => `${l.text}: ${l.href}`).join(" | ");
    const ctas = (p.primaryCtas || []).slice(0, 10).map((l) => `${l.text}: ${l.href}`).join(" | ");
    const shots = p.screenshots ? `\nScreenshots: desktop=${p.screenshots.desktop} mobile=${p.screenshots.mobile}` : "";
    const meta = p.metaDescription ? `\nMeta: ${p.metaDescription}` : "";
    const ctaLine = ctas ? `\nPrimary CTAs: ${ctas}` : "";
    return `Page ${idx + 1}: ${p.url}\nTitle: ${p.title}${meta}\nH1: ${p.h1.join(" | ")}\nH2: ${p.h2.slice(0, 8).join(" | ")}\nNav: ${nav}${ctaLine}${shots}\nText snippet: ${p.textSnippet}`;
  }).join("\n\n---\n\n");
  const warns = evidence.warnings.length ? `\n\nWarnings:\n- ${evidence.warnings.slice(0,5).join("\n- ")}` : "";
  return `Evidence bundle (rendered + screenshots):\n${pages}${warns}`;
}

function normalizeType(type: Intake["product_type"]) {
  const v = String(type).toLowerCase().trim();
  if (v === "saas" || v === "saas / platform" || v === "saas") return "saas";
  if (v === "e-commerce" || v === "ecommerce") return "ecommerce";
  if (v === "website" || v === "marketing website" || v === "marketing_website") return "marketing_website";
  return "marketing_website";
}

function productTypeInstructions(type: Intake["product_type"]) {
  const t = normalizeType(type);
  if (t === "saas")
    return "SaaS product: focus on onboarding, logged-in flows, dashboard clarity, permissions, and core feature workflows.";
  if (t === "ecommerce")
    return "E-commerce: focus on product discovery, product pages, trust signals, cart, checkout, and purchase friction.";
  return "Marketing website: focus on messaging clarity, value proposition, credibility proof, CTA clarity, and lead conversion.";
}

function buildBucketPrompt(intake: Intake, bucket: string, evidence: EvidenceBundle | null) {
  const qs = QUESTION_BANK[bucket] || [];
  const flows = (intake.audit_flows || []).join(", ");
  const goals = (intake.audit_goal || []).join(", ");
  const selectedBucketQuestions = qs
    .map((q) => {
      const opts = q.options.map((o) => `${o.mark}: ${o.text}`).join("\n");
      return `ID: ${q.id}\nQuestion: ${q.question}\nHow to evaluate: ${q.navigate}\nOptions:\n${opts}`;
    })
    .join("\n\n---\n\n");

  return `You are a senior UX auditor. Evaluate ONLY using the evidence provided below (do not claim you browsed the site).\n\nProduct:\n- Name: ${intake.product_name}\n- URL: ${intake.product_url}\n- Type: ${String(intake.product_type)}\n- Platform: ${intake.primary_platform}\n- Goals: ${goals}\n- Key flows: ${flows}\n\nBucket: ${bucket}\nPillar: ${PILLAR_MAP[bucket] || "Impact"}\n\nContext instructions:\n${productTypeInstructions(intake.product_type)}\n\nHard rules:\n- If evidence is insufficient to verify, you MUST use mark 3 and say \"Not verifiable from evidence\".\n- Do NOT assign 1 or 2 unless you quote specific evidence from the bundle.\n- Output ONLY valid JSON.\n\nReturn JSON:\n{ \"bucket\": \"${bucket}\", \"questions\": [ {\"id\":\"N01\",\"question\":\"...\",\"mark\":3,\"evidence\":\"...\",\"observation\":\"...\",\"recommendation\":\"...\"} ] }\n\nQuestions:\n${selectedBucketQuestions}\n\n${evidenceBlock(evidence)}\n`;
}

function safeJsonParse(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {}
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch {}
  return null;
}

function validateBucket(parsed: any, expectedCount: number) {
  if (!parsed || typeof parsed !== "object") return false;
  if (!Array.isArray(parsed.questions)) return false;
  if (parsed.questions.length !== expectedCount) return false;
  return true;
}

function makeFallbackBucket(intake: Intake, bucket: string, reason: string): BucketResult {
  const qs = QUESTION_BANK[bucket] || [];
  const questions = qs.map((q) => ({
    id: q.id,
    question: q.question,
    mark: 3,
    evidence: `Not verifiable due to processing error: ${reason}`,
    observation: "",
    recommendation: "",
    effort: "",
    impact: "",
    confidence: 0,
  }));
  const totalMarks = questions.reduce((sum, q) => sum + q.mark, 0);
  const maxMarks = questions.length * 5;
  const score = maxMarks > 0 ? Math.round((totalMarks / maxMarks) * 100) : 60;
  const h = getHealth(score);
  return {
    bucket_name: bucket,
    pillar: PILLAR_MAP[bucket] || "Impact",
    total_marks: totalMarks,
    max_marks: maxMarks,
    score,
    health: h.label,
    risk: h.risk,
    priority: h.priority,
    questions,
    findings: [],
    improvements: [],
  };
}

export async function auditOneBucket(env: WorkerEnv, args: { intake: Intake; bucket: string; evidence: EvidenceBundle | null }) {
  const qs = QUESTION_BANK[args.bucket] || [];
  const prompt = buildBucketPrompt(args.intake, args.bucket, args.evidence);
  const raw = await openRouterChat(env, { prompt });
  const parsed = safeJsonParse(raw);
  if (!validateBucket(parsed, qs.length)) {
    return makeFallbackBucket(args.intake, args.bucket, "Invalid JSON or incomplete questions");
  }
  const questions = parsed.questions.map((q: any) => {
    const mark = Math.min(5, Math.max(1, Number(q.mark) || Number(q.selected_option) || 3));
    return {
      id: String(q.id || "Q"),
      question: String(q.question || ""),
      mark,
      evidence: String(q.evidence || ""),
      observation: String(q.observation || ""),
      recommendation: String(q.recommendation || ""),
      effort: String(q.effort || ""),
      impact: String(q.impact || ""),
      confidence: Number(q.confidence) || 0,
    };
  });
  const totalMarks = questions.reduce((sum: number, q: any) => sum + q.mark, 0);
  const maxMarks = questions.length * 5;
  const score = maxMarks > 0 ? Math.round((totalMarks / maxMarks) * 100) : 60;
  const h = getHealth(score);
  const findings = questions
    .filter((q: any) => q.mark <= 2)
    .map((q: any) => ({
      bucket: args.bucket,
      question_id: q.id,
      question: q.question,
      mark: q.mark,
      evidence: q.evidence,
      observation: q.observation,
      recommendation: q.recommendation,
      effort: q.effort,
      impact: q.impact,
      confidence: q.confidence,
      severity: q.mark === 1 ? "Critical" : "High",
    }));
  const improvements = questions
    .filter((q: any) => q.mark === 3)
    .map((q: any) => ({
      bucket: args.bucket,
      question_id: q.id,
      question: q.question,
      mark: q.mark,
      evidence: q.evidence,
      observation: q.observation,
      recommendation: q.recommendation,
      effort: q.effort,
      impact: q.impact,
      confidence: q.confidence,
      severity: "Moderate",
    }));
  return {
    bucket_name: args.bucket,
    pillar: PILLAR_MAP[args.bucket] || "Impact",
    total_marks: totalMarks,
    max_marks: maxMarks,
    score,
    health: h.label,
    risk: h.risk,
    priority: h.priority,
    questions,
    findings,
    improvements,
  } satisfies BucketResult;
}

export function aggregateScores(scored: {
  meta: Record<string, any>;
  bucketResults: BucketResult[];
}) {
  const bucketResults = scored.bucketResults;
  const totalScore = Math.round(
    bucketResults.reduce((sum, b) => sum + b.score, 0) / Math.max(1, bucketResults.length),
  );
  const overall = getHealth(totalScore);

  const pillars: Record<string, number[]> = { Delight: [], Impact: [], Accessibility: [] };
  for (const b of bucketResults) {
    if (pillars[b.pillar]) pillars[b.pillar]!.push(b.score);
  }
  const pillar_scores: Record<string, any> = {};
  for (const p of Object.keys(pillars)) {
    const scores = pillars[p]!;
    pillar_scores[p] = scores.length
      ? { score: Math.round(scores.reduce((a, c) => a + c, 0) / scores.length), evaluated: true }
      : { score: null, evaluated: false };
  }

  const all_findings = bucketResults.flatMap((b) => (b.findings || []) as any[]);
  all_findings.sort((a, b) => Number(a.mark) - Number(b.mark));
  const all_improvements = bucketResults.flatMap((b) => (b.improvements || []) as any[]);
  const top_5_findings = all_findings.slice(0, 5);

  const smallEffortBuckets = ["Content & UX Writing", "Feedback & System States"];
  const quick_wins = all_findings.filter((f) => smallEffortBuckets.includes(String(f.bucket)));

  const p1Buckets = bucketResults.filter((b) => b.priority === "P1").sort((a, b) => a.score - b.score);
  const p2Buckets = bucketResults.filter((b) => b.priority === "P2");
  const p3Buckets = bucketResults.filter((b) => b.priority === "P3");
  const p4Buckets = bucketResults.filter((b) => b.priority === "P4");

  const roadmap = {
    week_1_2: p1Buckets.flatMap((b) => (b.findings || []).slice(0, 2).map((f: any) => `${f.question_id}: ${f.observation}`)),
    month_1: p2Buckets.flatMap((b) => (b.findings || []).map((f: any) => `${f.question_id}: ${f.observation}`)),
    quarter_1: p3Buckets.flatMap((b) => (b.improvements || []).map((f: any) => `${f.question_id}: ${f.observation}`)),
  };

  const scorecard = bucketResults.map((b) => ({
    section: b.bucket_name,
    score: `${b.score}/100`,
    health: b.health,
    risk_level: b.risk,
    priority: b.priority,
    pillar: b.pillar,
  }));

  return {
    ...scored.meta,
    overall_score: totalScore,
    overall_health: overall.label,
    overall_risk: overall.risk,
    pillar_scores,
    scorecard,
    bucket_results: bucketResults,
    top_5_findings,
    all_findings,
    all_improvements,
    quick_wins,
    roadmap,
    p1_buckets: p1Buckets.map((b) => b.bucket_name),
    p2_buckets: p2Buckets.map((b) => b.bucket_name),
    p3_buckets: p3Buckets.map((b) => b.bucket_name),
    p4_buckets: p4Buckets.map((b) => b.bucket_name),
  };
}

export async function writeNarrative(env: WorkerEnv, scored: any) {
  // Keep it lightweight (mini only). Uses the same shape you used in n8n, but without forcing hallucinated "browsing".
  const systemPrompt =
    "You are a senior UX lead writing a client-ready audit report. Be specific and actionable. Output ONLY valid JSON.";

  const prompt = `${systemPrompt}\n\nReturn JSON with keys: executive_summary, section_narrative, findings_detailed, quick_wins_table, roadmap, closing_note.\n\nInput JSON:\n${JSON.stringify(scored).slice(0, 28000)}\n`;
  const raw = await openRouterChat(env, { prompt });
  const parsed = safeJsonParse(raw);
  return parsed && typeof parsed === "object" ? parsed : {};
}

