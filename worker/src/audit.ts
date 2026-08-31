import type { EvidenceBundle, Intake, BucketResult } from "./types.js";
import type { WorkerEnv } from "./env.js";
import { QUESTION_BANK } from "./question-bank.js";
import { openRouterChat } from "./openrouter.js";
import { buildAuditFrameworkBrief, buildBucketFrameworkBrief } from "../../shared/audit-framework";
import { normalizeAnswerState, normalizeQuestionAnswer, scoreQuestions } from "../../shared/ux-audit-scoring";

const PILLAR_MAP: Record<string, string> = {
  "Visual Feedback": "Accessibility",
  "Color & Contrast": "Accessibility",
  "Typography & Readability": "Accessibility",
  "Keyboard Navigation": "Accessibility",
  "Screen Reader Support": "Accessibility",
  "Navigation & Findability": "Impact",
  "Consistency & UI Patterns": "Impact",
  "Content (Impact)": "Impact",
  Performance: "Impact",
  "Visual Consistency": "Delight",
  "Motion & Microinteractions": "Delight",
  "Content (Delight)": "Delight",
  "Brand Expression": "Delight",
  "Icons & Imagery": "Delight",
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
  const warns = evidence.warnings.length ? `\n\nWarnings:\n- ${evidence.warnings.slice(0, 5).join("\n- ")}` : "";
  return `Evidence bundle (rendered + screenshots):\n${pages}${warns}`;
}

function normalizeType(type: Intake["product_type"]) {
  const v = String(type).toLowerCase().trim();
  if (v === "saas" || v === "saas / platform") return "saas";
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
  const frameworkBrief = buildAuditFrameworkBrief();
  const bucketBrief = buildBucketFrameworkBrief(bucket);
  const selectedBucketQuestions = qs
    .map((q) => {
      const opts = q.options.map((o) => `${o.label} (${o.score === null ? "excluded from score" : o.score}) - ${o.text}`).join("\n");
      const sectionLine = q.section ? `Section: ${q.section}\n` : "";
      return `ID: ${q.id}\n${sectionLine}Question: ${q.question}\nHow to evaluate: ${q.navigate}\nOptions:\n${opts}`;
    })
    .join("\n\n---\n\n");

  return `You are a senior UX auditor. Evaluate ONLY using the evidence provided below (do not claim you browsed the site).\n\nAudit framework:\n${frameworkBrief}\n\nBucket reference:\n${bucketBrief}\n\nProduct:\n- Name: ${intake.product_name}\n- URL: ${intake.product_url}\n- Type: ${String(intake.product_type)}\n- Platform: ${intake.primary_platform}\n- Goals: ${goals}\n- Key flows: ${flows}\n\nBucket: ${bucket}\nPillar: ${PILLAR_MAP[bucket] || "Impact"}\n\nContext instructions:\n${productTypeInstructions(intake.product_type)}\n\nHard rules:\n- Use answer_state = \"pass\", \"partial\" or \"fail\" when the evidence is sufficient to judge the criterion.\n- Use answer_state = \"not_tested\" when evidence is missing and you cannot verify the criterion.\n- Use answer_state = \"n_a\" when the criterion does not apply to this product.\n- Do not abbreviate any quoted evidence, observation, or recommendation with ellipses; use complete sentences.\n- Output ONLY valid JSON.\n\nReturn JSON:\n{ \"bucket\": \"${bucket}\", \"questions\": [ {\"id\":\"N01\",\"question\":\"...\",\"answer_state\":\"pass|partial|fail|not_tested|n_a\",\"mark\":1,\"evidence\":\"...\",\"observation\":\"...\",\"recommendation\":\"...\"} ] }\n\nQuestions:\n${selectedBucketQuestions}\n\n${evidenceBlock(evidence)}\n`;
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

function inferAnswerState(raw: any) {
  const explicit = normalizeAnswerState(raw.answer_state ?? raw.answerState);
  if (explicit) return explicit;
  const mark = raw.mark === null || raw.mark === undefined || raw.mark === "" ? null : Number(raw.mark);
  if (mark === 1) return "pass";
  if (mark === 0.5) return "partial";
  if (mark === 0) return "fail";
  const selected = normalizeAnswerState(raw.selected_option_state ?? raw.selectedOptionState);
  if (selected) return selected;
  return null;
}

function makeFallbackBucket(intake: Intake, bucket: string, reason: string): BucketResult {
  const qs = QUESTION_BANK[bucket] || [];
  const questions = qs.map((q) => ({
    id: q.id,
    question: q.question,
    mark: null,
    selected_option: null,
    selected_option_state: "not_tested",
    evidence: `Not verifiable due to processing error: ${reason}`,
    observation: "",
    recommendation: "",
    effort: "",
    impact: "",
    confidence: 0,
    answer_state: "not_tested",
    answer_status: "scoring_unavailable",
  }));
  return {
    bucket_name: bucket,
    pillar: PILLAR_MAP[bucket] || "Impact",
    total_marks: null,
    max_marks: null,
    score: null,
    bucket_status: "scoring_unavailable",
    audit_confidence: 0,
    health: "Not tested",
    risk: "Scoring unavailable",
    priority: "P0",
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
    const answerState = inferAnswerState(q);
    const normalized = normalizeQuestionAnswer({
      id: String(q.id || "Q"),
      question: String(q.question || ""),
      answer_status: "answered",
      answer_state: answerState,
      mark: q.mark === null || q.mark === undefined || q.mark === "" ? null : Number(q.mark),
      selected_option:
        q.selected_option === null || q.selected_option === undefined || q.selected_option === ""
          ? null
          : Number(q.selected_option),
      selected_option_state: answerState,
      evidence: String(q.evidence || ""),
      observation: String(q.observation || ""),
      recommendation: String(q.recommendation || ""),
      effort: String(q.effort || ""),
      impact: String(q.impact || ""),
      confidence: Number(q.confidence) || 0,
    });
    return {
      ...normalized,
      answer_state: answerState ?? normalized.answer_state,
      answer_status: "answered",
    };
  });

  const scored = scoreQuestions(questions);
  const health = scored.score === null ? null : getHealth(scored.score);
  const findings = questions
    .filter((q: any) => q.answer_state === "fail" || q.answer_state === "partial")
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
      severity: q.answer_state === "fail" ? "Critical" : "High",
    }));
  const improvements = questions
    .filter((q: any) => q.answer_state === "not_tested" || q.answer_state === "n_a")
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
    total_marks: scored.total_marks,
    max_marks: scored.max_marks,
    score: scored.score,
    bucket_status: scored.status === "scored" ? "scored" : "not_tested",
    audit_confidence: scored.confidence,
    health: scored.score === null ? "Not tested" : health!.label,
    risk: scored.score === null ? "Evidence missing" : health!.risk,
    priority: scored.score === null ? "P0" : health!.priority,
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
  const validBuckets = bucketResults.filter((bucket) => typeof bucket.score === "number");
  const totalScore =
    validBuckets.length > 0
      ? Math.round(validBuckets.reduce((sum, b) => sum + Number(b.score || 0), 0) / validBuckets.length)
      : null;
  const overall = totalScore === null ? null : getHealth(totalScore);

  const pillars: Record<string, number[]> = { Delight: [], Impact: [], Accessibility: [] };
  for (const b of bucketResults) {
    if (pillars[b.pillar] && typeof b.score === "number") pillars[b.pillar]!.push(b.score);
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

  const quick_wins = all_improvements;
  const p1Buckets = bucketResults.filter((b) => b.priority === "P1").sort((a, b) => Number(a.score || 0) - Number(b.score || 0));
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
    score: b.score === null ? "Not Tested" : `${b.score}/100`,
    health: b.score === null ? "Not Tested" : b.health,
    risk_level: b.score === null ? "Evidence missing" : b.risk,
    priority: b.priority,
    pillar: b.pillar,
  }));

  return {
    ...scored.meta,
    overall_score: totalScore,
    overall_health: overall ? overall.label : "Not Tested",
    overall_risk: overall ? overall.risk : "Evidence missing",
    audit_confidence:
      bucketResults.length > 0
        ? Math.round(
            (bucketResults.reduce((sum, bucket) => sum + Number(bucket.audit_confidence || 0), 0) /
              bucketResults.length) *
              100,
          ) / 100
        : null,
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

export async function writeNarrative(env: WorkerEnv, scored: any, modelOverride?: string) {
  const systemPrompt =
    "You are a senior UX lead writing a client-ready audit report. Be specific and actionable. Output ONLY valid JSON.";

  const prompt = `${systemPrompt}\n\nReturn JSON with keys: executive_summary, section_narrative, findings_detailed, quick_wins_table, roadmap, closing_note.\n\nInput JSON:\n${JSON.stringify(scored).slice(0, 28000)}\n`;
  const raw = await openRouterChat(env, { prompt, model: modelOverride });
  const parsed = safeJsonParse(raw);
  return parsed && typeof parsed === "object" ? parsed : {};
}
