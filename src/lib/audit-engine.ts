import pLimit from "p-limit";
import { z } from "zod";
import { QUESTION_BANK, type BucketQuestion } from "@/lib/question-bank";
import {
  collectEvidence,
  type EvidenceBundle,
  validateExplorationCoverage,
} from "@/lib/evidence-collector";
import { getErrorMessage } from "@/lib/error-utils";
import { buildAuditFrameworkBrief, buildBucketFrameworkBrief } from "../../shared/audit-framework";

const DEFAULT_OPENROUTER_MODEL = "openrouter/owl-alpha";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function modelSupportsStructuredOutput(model: string) {
  const normalized = normalizeModelName(model).toLowerCase();
  if (!normalized) return false;
  if (normalized === "openrouter/owl-alpha") return false;
  if (normalized.includes(":free")) return false;
  if (normalized.includes("nvidia/nemotron")) return false;
  if (normalized.includes("gpt-oss")) return false;
  return true;
}

function capModelMaxTokens(model: string, requestedMaxTokens: number) {
  const normalized = normalizeModelName(model).toLowerCase();
  const safeRequested = Number.isFinite(requestedMaxTokens)
    ? Math.max(300, requestedMaxTokens)
    : 1200;

  if (normalized.includes(":free")) return Math.min(safeRequested, 900);
  if (normalized.includes("nvidia/nemotron")) return Math.min(safeRequested, 900);
  return safeRequested;
}

function buildOpenRouterReasoningConfig(model: string) {
  const normalized = normalizeModelName(model).toLowerCase();
  if (
    normalized.includes(":free") ||
    normalized.includes("nvidia/nemotron") ||
    normalized.includes("gpt-oss")
  ) {
    return {
      include_reasoning: false,
      reasoning: {
        exclude: true,
        effort: "none",
      },
      reasoning_effort: "none",
    };
  }
  return {};
}

function normalizeModelName(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function toSnakeEnum(value: unknown) {
  if (typeof value !== "string") return value;
  const v = value.trim().toLowerCase();
  if (!v) return value;
  if (v === "saas" || v === "saas / platform" || v === "platform") return "saas";
  if (v === "e-commerce" || v === "ecommerce" || v === "e commerce") return "ecommerce";
  if (
    v === "marketing website" ||
    v === "marketing_website" ||
    v === "website" ||
    v === "marketing"
  )
    return "marketing_website";
  return value;
}

function toStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((x) => String(x)).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[\n,]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return value;
}

export const IntakeSchema = z.preprocess(
  (v) => (Array.isArray(v) ? v[0] : v),
  z
    .object({
    product_name: z.string().min(1),
    product_url: z.string().min(1),
    product_type: z.preprocess(
      toSnakeEnum,
      z.enum(["saas", "ecommerce", "marketing_website"]),
    ),
    primary_platform: z.string().min(1),
    audit_goal: z.preprocess(toStringArray, z.array(z.string()).min(1)),
    audit_flows: z.preprocess(toStringArray, z.array(z.string()).min(1)),
    audit_flow_instructions: z.string().optional(),
    guided_capture_steps: z.array(z.record(z.string(), z.unknown())).optional(),
    internal_routes: z.preprocess(toStringArray, z.array(z.string())).optional(),
    access_mode: z
      .enum([
        "auto_login",
        "manual_browser_login",
        "use_saved_session",
        "internal_routes_only",
        "screenshot_upload_only",
        "browser_extension_capture",
      ])
      .optional(),
    selected_buckets: z.preprocess(toStringArray, z.array(z.string()).min(1)),
    // optional extras (pass-through)
    product_stage: z.string().optional(),
    store_status: z.string().optional(),
    site_situation: z.string().optional(),
    // ADDED: user + business context (used by n8n + report)
    primary_user: z.string().optional(),
    primary_user_goal: z.string().optional(),
    primary_user_intent: z.string().optional(),
    frequency_of_use: z.string().optional(),
    competitors: z.string().optional(),
    differentiation: z.string().optional(),
    constraints: z.string().optional(),
    known_problem: z.string().optional(),
    login_required: z.boolean().optional(),
    login_email: z.string().optional(),
    login_password: z.string().optional(),
    who_implements: z.string().optional(),
    success_metric: z.string().optional(),
    user_age: z.string().optional(),
    user_gender: z.string().optional(),
    user_geography: z.string().optional(),
    user_language: z.string().optional(),
    user_persona: z.string().optional(),
      artifacts: z.any().optional(),
  })
    // ADDED: keep unknown keys so we don't silently drop future form fields
    .passthrough(),
);

export type Intake = z.infer<typeof IntakeSchema>;

const PILLAR_MAP: Record<string, string> = {
  "Visual Feedback": "Accessibility",
  "Color & Contrast": "Accessibility",
  "Typography & Readability": "Accessibility",
  "Keyboard Navigation": "Accessibility",
  "Screen Reader Support": "Accessibility",
  "Navigation & Findability": "Impact",
  "Consistency & UI Patterns": "Impact",
  "Content (Impact)": "Impact",
  "Performance": "Impact",
  "Visual Consistency": "Delight",
  "Motion & Microinteractions": "Delight",
  "Content (Delight)": "Delight",
  "Brand Expression": "Delight",
  "Icons & Imagery": "Delight",
};

const BUCKET_ALIASES: Record<string, string> = {
  "Feedback & System States": "Visual Feedback",
  "Accessibility & Inclusivity": "Color & Contrast",
  "Input, Errors & Validation": "Keyboard Navigation",
  "Visual Hierarchy & Layout": "Typography & Readability",
  "Content & UX Writing": "Content (Impact)",
  "code optimisation": "Performance",
};

function normalizeBucketName(bucket: string) {
  return BUCKET_ALIASES[bucket] || bucket;
}

function getHealth(score: number) {
  if (score >= 80) return { label: "Good", risk: "Low Risk", priority: "P3" };
  if (score <= 50) return { label: "Critical", risk: "Critical", priority: "P1" };
  return { label: "Average", risk: "Moderate", priority: "P2" };
}

function productTypeLabel(type: Intake["product_type"]) {
  if (type === "saas") return "SaaS";
  if (type === "ecommerce") return "E-commerce";
  return "Website";
}

function productTypeInstructions(type: Intake["product_type"]) {
  if (type === "saas")
    return [
      "This is a SaaS product.",
      "Focus on onboarding, logged-in experience, dashboard clarity, discoverability, and core workflows.",
      "Do NOT apply e-commerce heuristics (product cards, cart, checkout) unless explicitly present in evidence.",
    ].join(" ");
  if (type === "ecommerce")
    return [
      "This is an e-commerce store.",
      "Focus on product discovery, product pages, trust signals, cart, checkout, and purchase journey friction.",
      "Do NOT apply SaaS heuristics (onboarding, dashboards, feature discoverability) unless explicitly present in evidence.",
    ].join(" ");
  return [
    "This is a marketing website.",
    "Focus on messaging clarity, value proposition, CTA clarity, trust signals, credibility proof, lead capture, and conversion flow.",
    "Assume most visitors are first-time; prioritize clarity, persuasion, and navigation to proof and contact.",
    "Do NOT apply SaaS or checkout heuristics unless explicitly present in evidence.",
  ].join(" ");
}

function bucketSpecificGuidance(bucket: string) {
  bucket = normalizeBucketName(bucket);
  const map: Record<string, string[]> = {
    "Visual Feedback": [
      "Prefer evidence from hover states, button clicks, loading states, success states, and error feedback.",
    ],
    "Color & Contrast": [
      "Prefer evidence from contrast, color reliance, readable text, and zoomed layouts.",
    ],
    "Keyboard Navigation": [
      "Prefer evidence from tab order, focus visibility, keyboard-only flow, and shortcut availability.",
    ],
    "Screen Reader Support": [
      "Prefer evidence from semantic HTML, ARIA labels, form labels, alt text, and announcement clarity.",
      "If dedicated screen-reader evidence is missing, still give a best-effort score from the visible structure instead of blocking the bucket.",
    ],
    "Navigation & Findability": [
      "Prefer evidence from navigation labels, tabs, repeated section names, page titles, and wayfinding cues.",
      "When clear navigation labels are visible, do not default to mark 3.",
    ],
    "Consistency & UI Patterns": [
      "Prefer evidence from repeated buttons, repeated labels, repeated tabs, and terminology consistency across pages.",
    ],
    "Content (Impact)": ["Prefer evidence from headings, CTA labels, helper text, alerts, empty states, and repeated terminology."],
    "Content (Delight)": ["Prefer evidence from tone, personality, microcopy, and emotionally resonant writing."],
    "Typography & Readability": ["Prefer evidence from readable type scale, paragraph spacing, hierarchy, and text clarity."],
    "Visual Consistency": ["Use visible styling, spacing, and component rhythm from capture to judge consistency."],
    "Motion & Microinteractions": ["Prefer evidence from transitions, hover feedback, motion restraint, and interaction flourishes."],
    "Brand Expression": ["Use visual personality, tone of voice, and distinct identity cues from capture."],
    "Icons & Imagery": ["Prefer evidence from icon clarity, illustration quality, and image support."],
    "Performance": [
      "Use structural evidence for runtime and efficiency judgments and reserve mark 3 for metrics that are not directly measurable from capture.",
      "If dedicated mobile timing evidence is missing, still give a best-effort score from the captured UI instead of blocking the bucket.",
    ],
  };
  return (map[bucket] || []).join(" ");
}

function trimText(value: string | null | undefined, max = 280) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > max ? text.slice(0, max) : text;
}

function extractOpenRouterTextContent(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return null;

  const parts = value
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      const rec = item as Record<string, unknown>;
      if (typeof rec.text === "string") return rec.text;
      if (typeof rec.content === "string") return rec.content;
      return "";
    })
    .filter(Boolean);

  return parts.length ? parts.join("\n").trim() : null;
}

function isGeminiModel(model: string) {
  return /^gemini-/i.test(model.trim());
}

function extractGeminiTextContent(data: unknown): string {
  const rec = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const candidates = Array.isArray(rec?.candidates) ? rec?.candidates : [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content =
      (candidate as Record<string, unknown>).content &&
      typeof (candidate as Record<string, unknown>).content === "object"
        ? ((candidate as Record<string, unknown>).content as Record<string, unknown>)
        : null;
    const parts = Array.isArray(content?.parts) ? content?.parts : [];
    const text = parts
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const value = (part as Record<string, unknown>).text;
        return typeof value === "string" ? value : "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text;
  }

  return JSON.stringify(data);
}

function takeTop(values: string[] | undefined, max = 4) {
  if (!Array.isArray(values) || values.length === 0) return [];
  return values
    .map((value) => trimText(value, 80))
    .filter(Boolean)
    .slice(0, max);
}

function safeLength(values: unknown) {
  return Array.isArray(values) ? values.length : 0;
}

function chunkArray<T>(items: T[], size: number) {
  const chunkSize = Math.max(1, size);
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function compactIntakeForModel(intake: Intake) {
  return {
    product_name: intake.product_name,
    product_url: intake.product_url,
    product_type: productTypeLabel(intake.product_type),
    primary_platform: intake.primary_platform,
    audit_goal: intake.audit_goal.filter(Boolean).slice(0, 6),
    audit_flows: intake.audit_flows.filter(Boolean).slice(0, 6),
    selected_buckets: intake.selected_buckets.filter(Boolean).slice(0, 8),
    primary_user: trimText(intake.primary_user, 220),
    primary_user_goal: trimText(intake.primary_user_goal, 220),
    primary_user_intent: trimText(intake.primary_user_intent, 220),
    known_problem: trimText(intake.known_problem, 320),
    differentiation: trimText(intake.differentiation, 240),
    constraints: trimText(intake.constraints, 320),
    success_metric: trimText(intake.success_metric, 180),
    competitors: trimText(intake.competitors, 240),
    audit_flow_instructions: trimText(intake.audit_flow_instructions, 700),
  };
}

function summarizeEvidenceForBucket(evidence: EvidenceBundle | null, bucket: string) {
  bucket = normalizeBucketName(bucket);
  if (!evidence?.pages?.length) return "No evidence pages were captured.";
  return evidence.pages
    .slice(0, 3)
    .map((page, index) => {
      const parts = [
        `Page ${index + 1}${page.label ? ` (${page.label})` : ""}: ${page.url}`,
        page.title ? `Title: ${page.title}` : "",
        safeLength(page.h1) ? `H1: ${takeTop(page.h1, 3).join(" | ")}` : "",
        safeLength(page.h2) ? `H2: ${takeTop(page.h2, 3).join(" | ")}` : "",
      ];

      if (bucket === "Navigation & Findability") {
        if (safeLength(page.topNavLinks)) {
          parts.push(
            `Nav labels: ${page.topNavLinks
              .slice(0, 5)
              .map((link) => trimText(link.text, 50))
              .join(" | ")}`,
          );
        }
        if (page.tabs?.length) parts.push(`Tabs: ${takeTop(page.tabs, 5).join(" | ")}`);
      }

      if (
        bucket === "Content (Impact)" ||
        bucket === "Content (Delight)" ||
        bucket === "Typography & Readability" ||
        bucket === "Visual Consistency" ||
        bucket === "Brand Expression" ||
        bucket === "Icons & Imagery"
      ) {
        if (page.primaryCtas?.length) {
          parts.push(
            `Primary CTAs: ${page.primaryCtas
              .slice(0, 4)
              .map((cta) => trimText(cta.text, 50))
              .join(" | ")}`,
          );
        }
        if (page.buttons?.length) parts.push(`Buttons: ${takeTop(page.buttons, 5).join(" | ")}`);
      }

      if (bucket === "Visual Feedback" || bucket === "Keyboard Navigation" || bucket === "Screen Reader Support") {
        if (page.formLabels?.length) parts.push(`Form labels: ${takeTop(page.formLabels, 5).join(" | ")}`);
        if (page.placeholders?.length) parts.push(`Placeholders: ${takeTop(page.placeholders, 4).join(" | ")}`);
      }

      if (bucket === "Visual Feedback") {
        if (page.alerts?.length) parts.push(`Alerts / status text: ${takeTop(page.alerts, 4).join(" | ")}`);
        if (page.emptyStateHints?.length) parts.push(`Empty-state text: ${takeTop(page.emptyStateHints, 4).join(" | ")}`);
      }

      if (bucket === "Consistency & UI Patterns" || bucket === "Performance") {
        if (page.tableHeaders?.length) parts.push(`Table headers: ${takeTop(page.tableHeaders, 5).join(" | ")}`);
        if (page.buttons?.length) parts.push(`Buttons: ${takeTop(page.buttons, 4).join(" | ")}`);
      }

      parts.push(`Snippet: ${trimText(page.textSnippet, 260)}`);
      return parts.filter(Boolean).join("\n");
    })
    .join("\n\n---\n\n");
}

function bucketPrompt(intake: Intake, bucket: string, questions: BucketQuestion[]) {
  const intakeSummary = compactIntakeForModel(intake);
  const frameworkBrief = buildAuditFrameworkBrief();
  const bucketBrief = buildBucketFrameworkBrief(bucket);
  const selectedBucketQuestions = questions
    .map((q) => {
      const opts = q.options.map((o) => `${o.mark}: ${trimText(o.text, 90)}`).join("\n");
      const sectionLine = q.section ? `Section: ${q.section}\n` : "";
      return `ID: ${q.id}\n${sectionLine}Question: ${q.question}\nHow to evaluate: ${q.navigate}\nOptions:\n${opts}`;
    })
    .join("\n\n---\n\n");

  return `You are a principal UX auditor producing a client-ready evaluation.\n\nAudit framework:\n${frameworkBrief}\n\nBucket reference:\n${bucketBrief}\n\nBucket: ${bucket}\nPillar: ${PILLAR_MAP[bucket] || "Impact"}\n\nCompact product context:\n${JSON.stringify(intakeSummary, null, 2)}\n\nContext instructions:\n${productTypeInstructions(intake.product_type)}\n\nBucket-specific guidance:\n${bucketSpecificGuidance(bucket)}\n\nScoring rubric:\n- 5 = best-in-class and clearly supported by evidence.\n- 4 = strong with minor gaps.\n- 3 = mixed but still scoreable from the captured evidence.\n- 2 = clear friction.\n- 1 = severe blocker.\n\nHard rules:\n- Use only captured evidence.\n- Cite visible details from the capture for every answer.\n- Do not invent screens, features, or problems.\n- If the evidence is missing for a question, do not guess and do not force a low score.\n- For insufficient evidence, return mark as null and explain what was missing.\n- \"what_is_working\" must describe genuine strengths, stable patterns, or helpful UX behavior; do not restate problems or recommendations there.\n- Return ONLY valid JSON.\n\nReturn ONLY valid JSON in this shape:\n{\n  \"bucket\": \"${bucket}\",\n  \"pillar\": \"${PILLAR_MAP[bucket] || "Impact"}\",\n  \"score_rationale\": {\n    \"summary\": \"1-2 sentences\",\n    \"what_is_working\": [\"...\"],\n    \"what_is_risky\": [\"...\"],\n    \"why_now\": \"...\"\n  },\n  \"questions\": [\n    {\n      \"id\": \"N01\",\n      \"question\": \"...\",\n      \"mark\": 3,\n      \"evidence\": \"...\",\n      \"observation\": \"...\",\n      \"recommendation\": \"...\",\n      \"effort\": \"S|M|L\",\n      \"impact\": \"Low|Med|High\",\n      \"confidence\": 0.0\n    }\n  ]\n}\n\nQuestions:\n${selectedBucketQuestions}\n`;
}

function narrativeEvidenceSummary(evidence: EvidenceBundle | null) {
  if (!evidence?.pages?.length) return "No evidence pages were captured.";
  return evidence.pages
    .slice(0, 3)
    .map((page, index) => {
      const lines = [
        `Page ${index + 1}${page.label ? ` (${trimText(page.label, 40)})` : ""}`,
        `URL: ${trimText(page.url, 120)}`,
        page.title ? `Title: ${trimText(page.title, 90)}` : "",
        safeLength(page.h1) ? `Headings: ${takeTop(page.h1, 2).join(" | ")}` : "",
        safeLength(page.topNavLinks)
          ? `Nav labels: ${page.topNavLinks
              .slice(0, 4)
              .map((item) => trimText(item.text, 40))
              .join(" | ")}`
          : "",
        page.primaryCtas?.length ? `CTAs: ${page.primaryCtas.slice(0, 3).map((item) => trimText(item.text, 40)).join(" | ")}` : "",
        page.tableHeaders?.length ? `Table headers: ${takeTop(page.tableHeaders, 4).join(" | ")}` : "",
        page.formLabels?.length ? `Form labels: ${takeTop(page.formLabels, 4).join(" | ")}` : "",
        `Snippet: ${trimText(page.textSnippet, 200)}`,
      ];
      return lines.filter(Boolean).join("\n");
    })
    .join("\n\n---\n\n");
}

async function openRouterChat(
  prompt: string,
  opts?: { modelOverride?: string },
) {
  const model = normalizeModelName(
    opts?.modelOverride || process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
  );
  const requestedMaxTokens = Number(process.env.OPENROUTER_MAX_TOKENS || 2200);
  const initialMaxTokens = capModelMaxTokens(
    model,
    Number.isFinite(requestedMaxTokens)
      ? Math.max(600, Math.min(2600, requestedMaxTokens))
      : 2200,
  );
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const useGeminiDirect = isGeminiModel(model);
  if (useGeminiDirect && !geminiApiKey) {
    throw new Error("Missing GEMINI_API_KEY env var");
  }
  if (!useGeminiDirect && !openRouterApiKey) {
    throw new Error("Missing OPENROUTER_API_KEY env var");
  }
  const timeoutMsRaw = Number(process.env.OPENROUTER_TIMEOUT_MS || 75000);
  const timeoutMs = Number.isFinite(timeoutMsRaw)
    ? Math.max(15000, Math.min(120000, timeoutMsRaw))
    : 75000;
  const retryAttemptsRaw = Number(process.env.OPENROUTER_RETRY_ATTEMPTS || 3);
  const retryAttempts = Number.isFinite(retryAttemptsRaw)
    ? Math.max(1, Math.min(5, retryAttemptsRaw))
    : 3;
  const supportsStructuredOutput = modelSupportsStructuredOutput(model);

  let lastError: Error | null = null;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const parseRetryAfterSeconds = (message: string) => {
    const directMatch = message.match(/retry_after_seconds"?\s*:\s*(\d+)/i);
    if (directMatch) return Number(directMatch[1]);
    const textMatch = message.match(/retry after\s+(\d+)\s*seconds?/i);
    if (textMatch) return Number(textMatch[1]);
    return null;
  };
  const parseAffordableTokens = (message: string) => {
    const directMatch = message.match(/can only afford\s+(\d+)\s+tokens?/i);
    if (directMatch) return Number(directMatch[1]);
    const fallbackMatch = message.match(/fewer max_tokens.*?afford\s+(\d+)/i);
    if (fallbackMatch) return Number(fallbackMatch[1]);
    return null;
  };

  let maxTokens = initialMaxTokens;
  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("openrouter-timeout"), timeoutMs);

    try {
        const res = useGeminiDirect
          ? await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-goog-api-key": String(geminiApiKey),
                },
                body: JSON.stringify({
                  systemInstruction: {
                    parts: [{ text: "You are a meticulous UX auditor." }],
                  },
                  generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: maxTokens,
                    responseMimeType: "application/json",
                  },
                  contents: [
                    {
                      role: "user",
                      parts: [{ text: prompt }],
                    },
                  ],
                }),
                signal: controller.signal,
              },
            )
          : await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openRouterApiKey}`,
            "Content-Type": "application/json",
            "X-Title": "UX Audit Tool - Audit Scoring",
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: maxTokens,
            messages: [
              { role: "system", content: "You are a meticulous UX auditor." },
              { role: "user", content: prompt },
            ],
            ...(supportsStructuredOutput ? { response_format: { type: "json_object" } } : {}),
            ...buildOpenRouterReasoningConfig(model),
          }),
          signal: controller.signal,
        });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `${useGeminiDirect ? "Gemini" : "OpenRouter"} error (${res.status}) [model=${model}]: ${text}`,
        );
      }

      const rawBody = await res.text();
      if (!rawBody.trim()) throw new Error(`OpenRouter returned empty response body [model=${model}]`);

      let data: unknown;
      try {
        data = JSON.parse(rawBody) as unknown;
      } catch {
        throw new Error(
          `${useGeminiDirect ? "Gemini" : "OpenRouter"} returned non-JSON response [model=${model}]: ${rawBody.slice(0, 300)}`,
        );
      }

      const content = useGeminiDirect
        ? extractGeminiTextContent(data)
        : (() => {
            const rec = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
            const choices = rec?.choices;
            const firstChoice =
              Array.isArray(choices) && choices[0] && typeof choices[0] === "object"
                ? (choices[0] as Record<string, unknown>)
                : null;
            const message =
              firstChoice?.message && typeof firstChoice.message === "object"
                ? (firstChoice.message as Record<string, unknown>)
                : null;
            return (
              extractOpenRouterTextContent(message?.content) ??
              (typeof firstChoice?.text === "string" ? firstChoice.text : null) ??
              JSON.stringify(data)
            );
          })();
      return String(content);
    } catch (error) {
      console.error("Audit bucket scoring failed:", error);
      const message = getErrorMessage(error);
      const aborted =
        controller.signal.aborted ||
        message === "terminated" ||
        message.toLowerCase().includes("abort");
      const retryAfterSeconds = parseRetryAfterSeconds(message);
      lastError = new Error(
        aborted ? `OpenRouter request timed out after ${timeoutMs}ms [model=${model}]` : message,
      );

      const affordableTokens = parseAffordableTokens(message);
      if (
        message.includes("402") &&
        affordableTokens &&
        Number.isFinite(affordableTokens) &&
        affordableTokens > 0 &&
        affordableTokens < maxTokens
      ) {
        maxTokens = Math.max(64, affordableTokens);
      }

      const retryable =
        aborted ||
        message.includes("402") ||
        message.includes("429") ||
        message.toLowerCase().includes("rate-limit") ||
        message.toLowerCase().includes("temporarily rate-limited") ||
        message.toLowerCase().includes("provider returned error") ||
        message.includes("empty response body") ||
        message.toLowerCase().includes("fetch failed") ||
        message.toLowerCase().includes("socket") ||
        message.toLowerCase().includes("econnreset") ||
        message.toLowerCase().includes("etimedout") ||
        message.includes("500") ||
        message.includes("502") ||
        message.includes("503") ||
        message.includes("504");

      if (!retryable || attempt === retryAttempts) {
        throw lastError;
      }

      const backoffMs =
        retryAfterSeconds && Number.isFinite(retryAfterSeconds)
          ? Math.max(1000, Math.min(30000, retryAfterSeconds * 1000))
          : message.includes("402")
            ? 250
            : Math.min(15000, 1500 * attempt);
      await sleep(backoffMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("OpenRouter request failed");
}

async function completeMissingQuestions(args: {
  intake: Intake;
  bucket: string;
  expectedQuestions: BucketQuestion[];
  existingQuestions: Array<Record<string, unknown>>;
  evidence: EvidenceBundle | null;
  editContext?: string;
  modelOverride?: string;
}) {
  const existingById = new Map(
    args.existingQuestions
      .map((question) => {
        const id = typeof question.id === "string" ? question.id : "";
        return id ? [id, question] : null;
      })
      .filter(Boolean) as Array<[string, Record<string, unknown>]>,
  );
  const missingQuestions = args.expectedQuestions.filter((question) => !existingById.has(question.id));
  if (!missingQuestions.length) return args.existingQuestions;

  const parsedById = new Map<string, Record<string, unknown>>();
  const missingQuestionChunks = chunkArray(missingQuestions, 2);

  for (const questionChunk of missingQuestionChunks) {
    const missingPrompt = `You are completing missing UX audit answers for one bucket.\n\nBucket: ${args.bucket}\nProduct type: ${productTypeLabel(args.intake.product_type)}\nContext instructions: ${productTypeInstructions(args.intake.product_type)}\nBucket guidance: ${bucketSpecificGuidance(args.bucket)}\n\nRules:\n- Answer every missing question below.\n- Use only the provided evidence.\n- Return ONLY valid JSON.\n- If a question truly cannot be scored, set mark to null and answer_status to "insufficient_evidence".\n- Do not omit any question.\n- Do not abbreviate any quoted evidence, observation, or recommendation with ellipses; use complete sentences.\n\nReturn ONLY this JSON shape:\n{\n  "bucket":"${args.bucket}",\n  "questions":[\n    {\n      "id":"N01",\n      "question":"...",\n      "mark":3,\n      "answer_status":"answered",\n      "evidence":"...",\n      "observation":"...",\n      "recommendation":"...",\n      "effort":"S|M|L",\n      "impact":"Low|Med|High",\n      "confidence":0.0\n    }\n  ]\n}\n\nMissing questions:\n${questionChunk
      .map((question) => {
        const options = question.options.map((option) => `${option.mark}: ${trimText(option.text, 90)}`).join("\n");
        return `ID: ${question.id}\nQuestion: ${question.question}\nOptions:\n${options}`;
      })
      .join("\n\n---\n\n")}\n\nEvidence summary:\n${summarizeEvidenceForBucket(args.evidence, args.bucket)}\n`;

    try {
      const raw = await openRouterChat(missingPrompt, { modelOverride: args.modelOverride });
      const parsed = parseBucketJson(raw);
      const parsedQuestionInputs = Array.isArray(parsed.questions) ? parsed.questions : [];
      const parsedQuestionRecords = parsedQuestionInputs
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item));
      for (const question of parsedQuestionRecords) {
        const id = typeof question.id === "string" ? question.id : "";
        if (id) parsedById.set(id, question);
      }
    } catch {}
  }

  return args.expectedQuestions.map((question) => {
    return existingById.get(question.id) || parsedById.get(question.id) || {
      id: question.id,
      question: question.question,
      mark: null,
      selected_option: null,
      answer_status: "scoring_unavailable",
      evidence: "The model did not return a usable answer for this question.",
      observation: "This question could not be scored because the audit model failed before producing a usable answer.",
      missing_evidence: [],
      recommendation: "",
      effort: "",
      impact: "",
      confidence: 0,
    };
  });
}

function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {}
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return null;
}

async function repairToJson(raw: string, schemaHint: string, modelOverride?: string) {
  const prompt = `Fix the following into valid JSON only.\n\nRules:\n- Output ONLY JSON.\n- Do not add commentary.\n- Preserve as much content as possible.\n\nTarget schema:\n${schemaHint}\n\nInput:\n${raw}\n`;
  const fixed = await openRouterChat(prompt, { modelOverride });
  return safeJsonParse(fixed);
}

type NarrativeReport = {
  executive_summary:
    | string
    | {
        one_line_verdict?: string;
        strongest_area?: string;
        main_issue?: string;
        top_problems?: string[];
        whats_working?: string[];
        first_priority?: string[];
        top_3_quick_wins?: string[];
        first_priority_recommendation?: string;
      };
  overall_assessment: string;
  top_risks: string[];
  quick_wins: Array<{ title: string; why: string; effort?: string; impact?: string }>;
  recommendations: Array<{
    title: string;
    details: string;
    priority: "P1" | "P2" | "P3" | "P4";
    effort?: "S" | "M" | "L";
    impact?: "Low" | "Med" | "High";
  }>;
  strategic_insights: string[];
  per_bucket_notes: Array<{
    bucket: string;
    summary: string;
    biggest_risk: string;
    best_opportunity: string;
  }>;
  section_narrative?: {
    delight_narrative?: string[];
    impact_narrative?: string[];
    accessibility_narrative?: string[];
  };
  competitor_analysis?: {
    competitors?: Array<{
      name: string;
      url?: string;
      compare_focus?: string;
      positioning?: string;
      primary_cta?: string;
      strengths?: string[];
      gaps?: string[];
      steal_this?: string[];
    }>;
  };
};

function normalizeRoadmapEffort(value: unknown) {
  const effort = String(value || "")
    .trim()
    .toLowerCase();
  if (!effort) return "";
  if (["s", "small", "low"].includes(effort)) return "Small";
  if (["m", "medium", "med"].includes(effort)) return "Medium";
  if (["l", "large", "high"].includes(effort)) return "Large";
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

function isPlaceholderText(value: unknown) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text) return true;
  return /cannot be answered reliably|could not be scored|required screen or interaction was not captured|required evidence was not captured|not available|not captured/i.test(
    text,
  );
}

function estimatedTimeForEffort(effort: string) {
  const normalized = normalizeRoadmapEffort(effort);
  if (normalized === "Small") return "1–3 days";
  if (normalized === "Medium") return "1–2 weeks";
  if (normalized === "Large") return "2–6 weeks";
  return "TBD";
}

function buildQuickWinsTableFromImprovements(improvements: unknown[]) {
  return improvements
    .map((item) => {
      const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const effort = normalizeRoadmapEffort(rec.effort);
      const finding = [
        rec.question,
        rec.observation,
        rec.evidence,
        rec.title,
        rec.bucket,
      ]
        .map((value) => String(value || "").trim())
        .find((value) => value && !isPlaceholderText(value)) || "";
      const recommendation = [
        rec.recommendation,
        rec.action,
        rec.title,
        rec.observation,
        finding,
      ]
        .map((value) => String(value || "").trim())
        .find((value) => value && !isPlaceholderText(value)) || "";
      if (!finding && !recommendation) return null;
      return {
        finding: finding || recommendation || "Recommendation",
        recommendation: recommendation || finding || "Recommendation",
        effort: effort || "Medium",
        estimated_time:
          String(rec.estimated_time || rec.time_estimate || "").trim() ||
          estimatedTimeForEffort(effort || "Medium"),
        bucket: String(rec.bucket || "").trim(),
        impact: String(rec.impact || "").trim(),
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
}

function uniqueRoadmapActions(actions: string[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = action.trim().toLowerCase();
    if (!key || isPlaceholderText(action) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildRoadmapFromQuickWins(quickWinsTable: Array<Record<string, unknown>>) {
  const week_1_2 = uniqueRoadmapActions(
    quickWinsTable
      .filter((item) => normalizeRoadmapEffort(item.effort) === "Small")
      .map((item) => String(item.recommendation || item.finding || "").trim())
      .filter(Boolean),
  ).slice(0, 6);
  const month_1 = uniqueRoadmapActions(
    quickWinsTable
      .filter((item) => normalizeRoadmapEffort(item.effort) === "Medium")
      .map((item) => String(item.recommendation || item.finding || "").trim())
      .filter(Boolean),
  ).slice(0, 6);
  const quarter_1 = uniqueRoadmapActions(
    quickWinsTable
      .filter((item) => normalizeRoadmapEffort(item.effort) === "Large")
      .map((item) => String(item.recommendation || item.finding || "").trim())
      .filter(Boolean),
  ).slice(0, 6);

  const overflow = quickWinsTable
    .map((item) => String(item.recommendation || item.finding || "").trim())
    .filter((action) => action && !isPlaceholderText(action))
    .filter(
      (action) =>
        !week_1_2.includes(action) && !month_1.includes(action) && !quarter_1.includes(action),
    );

  while (week_1_2.length < 3 && overflow.length) week_1_2.push(overflow.shift() as string);
  while (month_1.length < 3 && overflow.length) month_1.push(overflow.shift() as string);
  while (quarter_1.length < 3 && overflow.length) quarter_1.push(overflow.shift() as string);

  return { week_1_2, month_1, quarter_1 };
}

function parseCompetitorsFromIntakeText(value: string | undefined) {
  const text = String(value || "").trim();
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const urlMatch = line.match(/https?:\/\/[^\s)]+/i);
      const url = urlMatch?.[0] ?? "";
      const compareMatch = line.match(/\(Compare:\s*([^)]+)\)/i);
      const compare_focus = compareMatch?.[1]?.trim() ?? "";
      const namePart = url
        ? line.slice(0, line.indexOf(url)).replace(/[—–-]\s*$/, "").trim()
        : line;
      const name = namePart.replace(/^[•*-]\s*/, "").trim();
      return {
        id: url ? `url:${url}` : `name:${name || index + 1}`,
        name,
        url,
        compare_focus,
      };
    });
}

function semanticKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(ppg asian paints|the site|the website|users?)\b/g, "")
    .replace(/\b(scored?|score|risk|health|priority|bucket)\b/g, "")
    .replace(/\d+\/100/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueSemanticList(items: string[], limit = 999) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const text = String(item || "").trim();
    if (!text) continue;
    const key = semanticKey(text) || text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function bucketLeadInsight(bucket: BucketResult) {
  const finding =
    Array.isArray(bucket.findings) && bucket.findings[0] && typeof bucket.findings[0] === "object"
      ? (bucket.findings[0] as Record<string, unknown>)
      : null;
  const improvement =
    Array.isArray(bucket.improvements) && bucket.improvements[0] && typeof bucket.improvements[0] === "object"
      ? (bucket.improvements[0] as Record<string, unknown>)
      : null;

  const insight =
    [
      finding?.observation,
      finding?.what_we_found,
      finding?.question,
      improvement?.observation,
    ]
      .map((value) => String(value || "").trim())
      .find((value) => value && !isPlaceholderText(value)) || "";
  const action =
    [
      improvement?.recommendation,
      improvement?.observation,
      improvement?.question,
    ]
      .map((value) => String(value || "").trim())
      .find((value) => value && !isPlaceholderText(value)) || "";

  return {
    insight,
    action,
  };
}

function bucketStrengthStatement(bucket: BucketResult) {
  const safeBucket = bucket ?? ({} as BucketResult);
  const bucketName = String(safeBucket.bucket_name || "This area").trim();
  const score = Number.isFinite(Number(safeBucket.score)) ? Number(safeBucket.score) : null;
  const health = String(safeBucket.health || "").trim().toLowerCase();
  const finding =
    Array.isArray(safeBucket.findings) && safeBucket.findings[0] && typeof safeBucket.findings[0] === "object"
      ? (safeBucket.findings[0] as Record<string, unknown>)
      : null;
  const improvement =
    Array.isArray(safeBucket.improvements) && safeBucket.improvements[0] && typeof safeBucket.improvements[0] === "object"
      ? (safeBucket.improvements[0] as Record<string, unknown>)
      : null;

  const explicitStrength =
    [
      finding?.strength,
      finding?.what_is_working,
      finding?.positive_observation,
      improvement?.strength,
      improvement?.benefit,
    ]
      .map((value) => String(value || "").trim())
      .find((value) => value && !isPlaceholderText(value)) || "";
  if (explicitStrength) {
    return explicitStrength;
  }

  if (score !== null) {
    if (score >= 80) {
      return `shows a strong foundation with ${health || "solid"} UX signals`;
    }
    if (score >= 65) {
      return `is working reasonably well and gives users a functional experience`;
    }
    if (score >= 50) {
      return `has a usable baseline that supports the core journey`;
    }
  }

  return health ? `has stable patterns that support ${health} performance` : "shows a usable baseline for the core journey";
}

function competitorInsightSeed(name: string, compareFocus: string) {
  const identity = `${name} ${compareFocus}`.toLowerCase();
  if (identity.includes("manyavar")) {
    return {
      positioning: "Manyavar feels occasion-led, with stronger cues around weddings and festive buying.",
      primary_cta: "Shop wedding / festive collections CTA",
      strengths: [
        "Manyavar gives a quick read on occasion-focused shopping intent.",
        "Manyavar makes the celebration-first offer easy to spot.",
      ],
      gaps: [
        "Manyavar could make the route from inspiration to purchase clearer.",
        "Manyavar may still need tighter segmentation if multiple occasion journeys compete at once.",
      ],
      steal_this: [
        "Borrow Manyavar's celebration-first framing on key landing sections.",
        "Use stronger occasion-based pathways to shorten the route to relevant collections.",
      ],
    };
  }
  if (identity.includes("tasva")) {
    return {
      positioning: "Tasva feels more curated and product-led, with a modern ethnicwear angle that supports browsing by collection.",
      primary_cta: "Explore collections / discover looks CTA",
      strengths: [
        "Tasva makes collection-led browsing feel intuitive.",
        "Tasva supports discovery through clear product groupings.",
      ],
      gaps: [
        "Tasva could make its differentiator more explicit at first glance.",
        "Tasva may still need a sharper next step when several collection paths compete.",
      ],
      steal_this: [
        "Borrow Tasva's collection-led discovery pattern.",
        "Use Tasva's style-first browsing cues to help visitors compare options faster.",
      ],
    };
  }
  if (identity.includes("fabindia")) {
    return {
      positioning: "Fabindia reads as heritage-led and trust-rich, with a broader lifestyle and artisanal story.",
      primary_cta: "Shop categories / browse collections CTA",
      strengths: [
        "Fabindia communicates a familiar heritage and lifestyle proposition.",
        "Fabindia makes its artisanal story feel more explicit.",
      ],
      gaps: [
        "Fabindia could connect its story more directly to the shopping path.",
        "Fabindia may still need a sharper route from brand story to purchase intent.",
      ],
      steal_this: [
        "Borrow Fabindia's trust-led story while keeping the CTA path sharper.",
        "Tie artisanal proof more directly to customer outcomes and product relevance.",
      ],
    };
  }

  const focus = compareFocus.toLowerCase();
  const strengths: string[] = [];
  const gaps: string[] = [];
  const stealThis: string[] = [];
  let positioning = "";
  let primaryCta = "";

  if (/brand|story|message|position/.test(focus)) {
    positioning ||= "Brand-led positioning with clearer narrative and credibility cues.";
    strengths.push(`${name} appears to communicate a more explicit brand story and market stance.`);
    gaps.push(`${name} may still need tighter prioritization if several messages compete at once.`);
    stealThis.push(`Borrow ${name}'s clearer headline-to-value framing on key landing sections.`);
  }
  if (/portfolio|product|solution|discovery|structure|catalog/.test(focus)) {
    positioning ||= "Solution-led positioning that helps visitors explore offers more directly.";
    strengths.push(`${name} likely gives visitors clearer product or solution pathways.`);
    gaps.push(`${name} may still need stronger prioritization if discovery paths are too broad.`);
    stealThis.push(`Adopt ${name}'s strongest product grouping and discovery-path patterns.`);
  }
  if (/lead|cta|journey|conversion|contact|engagement/.test(focus)) {
    primaryCta ||= "Contact, enquiry, or solution-discovery CTA";
    strengths.push(`${name} appears more deliberate about guiding visitors toward a primary action.`);
    gaps.push(`${name} may still lose momentum if different audience journeys are not segmented.`);
    stealThis.push(`Use ${name}'s clearest CTA pattern to shorten the path from interest to action.`);
  }
  if (/sustainability|innovation|proof|trust|credibility/.test(focus)) {
    positioning ||= "Credibility-led positioning anchored in trust, proof, and differentiation.";
    strengths.push(`${name} likely supports its message with clearer proof, innovation, or trust signals.`);
    gaps.push(`${name} may still need to connect proof points more directly to customer outcomes.`);
    stealThis.push(`Add proof blocks that tie innovation or trust signals to buyer relevance.`);
  }
  if (/industrial|b2b|business/.test(focus)) {
    positioning ||= "B2B positioning oriented around industrial relevance and solution fit.";
  }

  return {
    positioning,
    primary_cta: primaryCta,
    strengths: uniqueSemanticList(strengths, 3),
    gaps: uniqueSemanticList(gaps, 3),
    steal_this: uniqueSemanticList(stealThis, 3),
  };
}

function isGenericCompetitorText(value: unknown) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return true;
  return /brand-led positioning with clearer narrative and credibility cues|solution-led positioning that helps visitors explore offers more directly|credibility-led positioning anchored in trust, proof, and differentiation|b2b positioning oriented around industrial relevance and solution fit|contact, enquiry, or solution-discovery CTA|positioning not explicitly captured|appears to communicate a more explicit brand story|likely gives visitors clearer product or solution pathways|appears more deliberate about guiding visitors toward a primary action|likely supports its message with clearer proof|may still need tighter prioritization|may still lose momentum|may still need stronger prioritization/i.test(
    text,
  );
}

function executiveSummaryLooksWeak(summary: Record<string, unknown> | null) {
  if (!summary) return true;
  const strongest = String(summary.strongest_area || "").trim();
  const mainIssue = String(summary.main_issue || "").trim();
  const topProblems = Array.isArray(summary.top_problems) ? summary.top_problems.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const whatsWorking = Array.isArray(summary.whats_working) ? summary.whats_working.map((item) => String(item || "").trim()).filter(Boolean) : [];

  if (!strongest || /^not scored$/i.test(strongest)) return true;
  if (!mainIssue || /^scoring unavailable$/i.test(mainIssue)) return true;
  if (topProblems.length < 3 || whatsWorking.length < 2) return true;
  if (uniqueSemanticList(topProblems, 5).length < Math.min(3, topProblems.length)) return true;
  return false;
}

function sectionNarrativeLooksWeak(items: string[]) {
  const cleaned = uniqueSemanticList(items.filter(Boolean), 10);
  if (cleaned.length < 2) return true;
  return cleaned.every(
    (item) =>
      /\bnot scored\b|\bscoring unavailable\b|\d+\/100/i.test(item) ||
      item.length < 50,
  );
}

function deriveSectionNarrativeFromBuckets(bucketResults: BucketResult[]) {
  const byPillar = (pillar: string) =>
    bucketResults.filter((bucket) => String(bucket.pillar || "").toLowerCase() === pillar.toLowerCase());

  const formatPillar = (pillar: string) =>
    byPillar(pillar)
      .flatMap((bucket) => {
        const safeBucket = bucket ?? ({} as BucketResult);
        const bucketName = String(safeBucket.bucket_name || "Bucket").trim();
        const { insight, action } = bucketLeadInsight(bucket);
        const score = Number.isFinite(Number(safeBucket.score)) ? Number(safeBucket.score) : null;
        const health = String(safeBucket.health || "").trim().toLowerCase();

        return uniqueSemanticList(
          [
            insight
              ? `${bucketName} is underperforming because ${insight.charAt(0).toLowerCase()}${insight.slice(1)}`
              : "",
            action
              ? `To improve ${bucketName}, ${action.charAt(0).toLowerCase()}${action.slice(1)}`
              : "",
            score !== null && health
              ? `${bucketName} currently sits at ${score}/100, which points to ${health} UX quality in this area.`
              : "",
          ].filter(Boolean),
          3,
        );
      })
      .filter(Boolean)
      .slice(0, 6);

  return {
    delight_narrative: uniqueSemanticList(formatPillar("Delight"), 4),
    impact_narrative: uniqueSemanticList(formatPillar("Impact"), 5),
    accessibility_narrative: uniqueSemanticList(formatPillar("Accessibility"), 3),
  };
}

function deriveExecutiveSummaryFromBuckets(args: {
  bucketResults: BucketResult[];
  allFindings: Array<Record<string, unknown>>;
  quickWins: Array<Record<string, unknown>>;
  scoreEligible: boolean;
  overallScore: number | null;
  productName: string;
}) {
  const scoredBuckets = args.bucketResults.filter((bucket) => bucket.bucket_status === "scored");
  const strongest = [...scoredBuckets].sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0];
  const weakest = [...scoredBuckets].sort((a, b) => Number(a.score || 0) - Number(b.score || 0))[0];
  const strongestFinding =
    strongest && Array.isArray(strongest.findings) && strongest.findings.length
      ? (asRecord(strongest.findings[0]) ?? null)
      : undefined;
  const weakestFinding =
    weakest && Array.isArray(weakest.findings) && weakest.findings.length
      ? (asRecord(weakest.findings[0]) ?? null)
      : undefined;
  const normalizedFindings = args.allFindings
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
  const normalizedQuickWins = args.quickWins
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
  const topProblems = normalizedFindings
    .slice(0, 5)
    .map((item) => {
      const rec = asRecord(item) ?? {};
      return String(rec.observation || rec.question || rec.evidence || "").trim();
    })
    .filter((item) => Boolean(item) && !isPlaceholderText(item));
  const quickWinTexts = normalizedQuickWins
    .slice(0, 5)
    .map((item) => String(item.recommendation || item.observation || item.question || "").trim())
    .filter((item) => Boolean(item) && !isPlaceholderText(item));
  const whatsWorking = [...scoredBuckets]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 4)
    .map((bucket) => {
      const bucketName = String(bucket.bucket_name || "Bucket").trim();
      return `${bucketName}: ${bucketStrengthStatement(bucket)}`;
    })
    .filter((item) => Boolean(item) && !isPlaceholderText(item));
  const uniqueTopProblems = uniqueSemanticList(topProblems, 5);
  const uniqueQuickWins = uniqueSemanticList(quickWinTexts, 5);
  const uniqueWhatsWorking = uniqueSemanticList(whatsWorking, 4);
  const fallbackWhatsWorking = uniqueSemanticList(
    [...scoredBuckets]
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
      .slice(0, 4)
      .map((bucket) => `${String(bucket.bucket_name || "Bucket").trim()}: ${bucketStrengthStatement(bucket)}`),
    4,
  );
  const strengthsList = uniqueWhatsWorking.length ? uniqueWhatsWorking : fallbackWhatsWorking;
  const firstPriorityItems = quickWinTexts.slice(0, 3).length
    ? uniqueQuickWins.slice(0, 3)
    : uniqueTopProblems.slice(0, 3);
  const strongestArea =
    strongest && strongestFinding
      ? `${strongest.bucket_name} — ${String(
          strongestFinding?.observation || strongestFinding?.question || strongest.health || "",
        ).trim()}`
      : strongest
        ? `${strongest.bucket_name}`
        : "Not scored";
  const mainIssue =
    weakest && weakestFinding
      ? `${weakest.bucket_name} — ${String(
          weakestFinding?.observation || weakestFinding?.question || weakest.risk || "",
        ).trim()}`
      : weakest
        ? `${weakest.bucket_name}`
        : "Scoring unavailable";
  const verdict = args.scoreEligible
    ? weakest && strongest
      ? `${args.productName} has usable evidence and the biggest UX drag sits in ${weakest.bucket_name}, while ${strongest.bucket_name} provides the clearest base to build on.`
      : `${args.productName} shows meaningful UX opportunities, with the clearest next moves already visible from the captured evidence.`
    : "This report contains useful bucket-level evidence, but some areas could not be fully scored from the captured audit data.";

  return {
    one_line_verdict: verdict,
    strongest_area: strongestArea,
    main_issue: mainIssue,
    top_problems: uniqueTopProblems,
    top_3_problems: uniqueTopProblems.slice(0, 3),
    first_priority: firstPriorityItems,
    quick_wins: uniqueQuickWins,
    top_3_quick_wins: uniqueQuickWins.slice(0, 3),
    whats_working: strengthsList,
    what_works: strengthsList.join(" "),
    first_priority_recommendation: firstPriorityItems[0] || "",
  };
}

function cleanNarrativeStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => !/scored\s+\d+\/100|\bnot scored\b|\bscoring unavailable\b/i.test(item));
}

function mergeCompetitorNarrative(
  narrativeCompetitors: unknown,
  existingCompetitors: unknown,
) {
  const byKey = new Map<string, Record<string, unknown>>();
  const add = (value: unknown, source: "existing" | "narrative") => {
    if (!value || typeof value !== "object") return;
    const rec = value as Record<string, unknown>;
    const name = String(rec.name || "").trim();
    const url = String(rec.url || "").trim();
    const key = (url || name).toLowerCase();
    if (!key) return;
    const current = byKey.get(key) || {};
    byKey.set(key, source === "existing" ? { ...rec, ...current } : { ...current, ...rec });
  };

  if (Array.isArray(existingCompetitors)) existingCompetitors.forEach((item) => add(item, "existing"));
  if (Array.isArray(narrativeCompetitors)) narrativeCompetitors.forEach((item) => add(item, "narrative"));
  return Array.from(byKey.values());
}

function strengthenCompetitors(competitors: unknown) {
  if (!Array.isArray(competitors)) return [];
  return competitors
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const rec = item as Record<string, unknown>;
      const name = String(rec.name || "").trim() || String(rec.url || "").trim() || "Competitor";
      const compareFocus = String(rec.compare_focus || "").trim();
      const fallback = competitorInsightSeed(name, compareFocus);

      const existingStrengths = Array.isArray(rec.strengths)
        ? rec.strengths.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [];
      const existingGaps = Array.isArray(rec.gaps)
        ? rec.gaps.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [];
      const existingStealThis = Array.isArray(rec.steal_this)
        ? rec.steal_this.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [];
      const strengths = uniqueSemanticList(
        existingStrengths.length && !existingStrengths.every(isGenericCompetitorText)
          ? [fallback.strengths[0], ...existingStrengths]
          : fallback.strengths,
        3,
      );
      const gaps = uniqueSemanticList(
        existingGaps.length && !existingGaps.every(isGenericCompetitorText)
          ? [fallback.gaps[0], ...existingGaps]
          : fallback.gaps,
        3,
      );
      const stealThis = uniqueSemanticList(
        existingStealThis.length && !existingStealThis.every(isGenericCompetitorText)
          ? [fallback.steal_this[0], ...existingStealThis]
          : fallback.steal_this,
        3,
      );
      const positioning = isGenericCompetitorText(rec.positioning) ? fallback.positioning : String(rec.positioning || "").trim();
      const primaryCta = isGenericCompetitorText(rec.primary_cta) ? fallback.primary_cta : String(rec.primary_cta || "").trim();

      return {
        ...rec,
        positioning: positioning || fallback.positioning,
        primary_cta: primaryCta || fallback.primary_cta,
        strengths,
        gaps,
        steal_this: stealThis,
      };
    });
}

async function writeNarrative(args: {
  intake: Intake;
  evidence: EvidenceBundle | null;
  bucket_results: BucketResult[];
  overall_score: number;
  editContext?: string;
  modelOverride?: string;
}) {
  const compactBuckets = args.bucket_results.map((b) => ({
    bucket: b.bucket_name,
    score: b.score,
    health: b.health,
    risk: b.risk,
    priority: b.priority,
    findings: (b.findings || []).slice(0, 6),
    improvements: (b.improvements || []).slice(0, 6),
  }));
  const compactIntake = compactIntakeForModel(args.intake);
  const compactEvidence = narrativeEvidenceSummary(args.evidence);
  const competitorSeeds = parseCompetitorsFromIntakeText(args.intake.competitors);

  const prompt = `You are a principal UX strategist writing a client-ready audit report.\n\nUse ONLY:\n1) intake context\n2) evidence capture text (headings/nav/text snippets)\n3) scored bucket findings/improvements\n4) competitor seeds\n${args.editContext ? "5) edited question changes from the report editor\\n" : ""}\nHard rules:\n- Do not invent screens or features not supported by evidence.\n- Do not write filler or score-only narrative like "Bucket scored 43/100" unless it directly supports a decision.\n- Executive summary must be specific, action-led, and useful for a client stakeholder.\n- Section narratives must explain what is happening and what to do next in bullet-ready sentences.\n- Competitor analysis must return real per-competitor positioning, CTA, strengths, gaps, and steal_this ideas based on compare_focus and available context. If truly unknown, return empty strings/arrays instead of generic placeholders.\n- Do not abbreviate any quoted evidence, observation, or recommendation with ellipses; use complete sentences.\n- Return ONLY valid JSON.\n\nReturn ONLY valid JSON matching this schema:\n{\n  \"executive_summary\": {\n    \"one_line_verdict\": \"...\",\n    \"strongest_area\": \"...\",\n    \"main_issue\": \"...\",\n    \"top_problems\": [\"...\"],\n    \"whats_working\": [\"...\"],\n    \"first_priority\": [\"...\"],\n    \"top_3_quick_wins\": [\"...\"],\n    \"first_priority_recommendation\": \"...\"\n  },\n  \"overall_assessment\": \"...\",\n  \"top_risks\": [\"...\"],\n  \"quick_wins\": [{\"title\":\"...\",\"why\":\"...\",\"effort\":\"S|M|L\",\"impact\":\"Low|Med|High\"}],\n  \"recommendations\": [{\"title\":\"...\",\"details\":\"...\",\"priority\":\"P1|P2|P3|P4\",\"effort\":\"S|M|L\",\"impact\":\"Low|Med|High\"}],\n  \"strategic_insights\": [\"...\"],\n  \"per_bucket_notes\": [{\"bucket\":\"...\",\"summary\":\"...\",\"biggest_risk\":\"...\",\"best_opportunity\":\"...\"}],\n  \"section_narrative\": {\n    \"delight_narrative\": [\"...\"],\n    \"impact_narrative\": [\"...\"],\n    \"accessibility_narrative\": [\"...\"]\n  },\n  \"competitor_analysis\": {\n    \"competitors\": [{\"name\":\"...\",\"url\":\"...\",\"compare_focus\":\"...\",\"positioning\":\"...\",\"primary_cta\":\"...\",\"strengths\":[\"...\"],\"gaps\":[\"...\"],\"steal_this\":[\"...\"]}]\n  }\n}\n\nIntake:\n${JSON.stringify(compactIntake, null, 2)}\n\nCompetitor seeds:\n${JSON.stringify(competitorSeeds, null, 2)}\n\n${args.editContext ? `Edited question changes:\n${args.editContext}\n` : ""}Evidence:\n${compactEvidence}\n\nScored buckets:\n${JSON.stringify(compactBuckets, null, 2)}\n\nOverall score: ${args.overall_score}\n`;

  const schemaHint =
    '{ "executive_summary": {"one_line_verdict":"...","strongest_area":"...","main_issue":"...","top_problems":["..."],"whats_working":["..."],"first_priority":["..."],"top_3_quick_wins":["..."],"first_priority_recommendation":"..."}, "overall_assessment": "...", "top_risks": ["..."], "quick_wins": [{"title":"...","why":"...","effort":"S|M|L","impact":"Low|Med|High"}], "recommendations": [{"title":"...","details":"...","priority":"P1|P2|P3|P4","effort":"S|M|L","impact":"Low|Med|High"}], "strategic_insights": ["..."], "per_bucket_notes": [{"bucket":"...","summary":"...","biggest_risk":"...","best_opportunity":"..."}], "section_narrative": {"delight_narrative":["..."],"impact_narrative":["..."],"accessibility_narrative":["..."]}, "competitor_analysis": {"competitors":[{"name":"...","url":"...","compare_focus":"...","positioning":"...","primary_cta":"...","strengths":["..."],"gaps":["..."],"steal_this":["..."]}] } }';

  try {
    const raw = await openRouterChat(prompt, { modelOverride: args.modelOverride });
    const parsed = safeJsonParse(raw);
    if (parsed && typeof parsed === "object") return parsed as NarrativeReport;

    const repaired = await repairToJson(raw, schemaHint, args.modelOverride);
    if (repaired && typeof repaired === "object") return repaired as NarrativeReport;
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (
      message.includes("Prompt tokens limit exceeded") ||
      message.toLowerCase().includes("context length") ||
      message.toLowerCase().includes("maximum context")
    ) {
      const compactPrompt = `You are a senior UX lead writing a client-ready audit report.\nReturn ONLY valid JSON matching this schema:\n${schemaHint}\n\nIntake:\n${JSON.stringify(compactIntake, null, 2)}\n\n${args.editContext ? `Edited question changes:\n${trimText(args.editContext, 1200)}\n\n` : ""}Evidence:\n${trimText(compactEvidence, 1400)}\n\nScored buckets:\n${JSON.stringify(compactBuckets, null, 2)}\n\nOverall score: ${args.overall_score}\n`;
      const raw = await openRouterChat(compactPrompt, { modelOverride: args.modelOverride });
      const parsed = safeJsonParse(raw);
      if (parsed && typeof parsed === "object") return parsed as NarrativeReport;
      const repaired = await repairToJson(raw, schemaHint, args.modelOverride);
      if (repaired && typeof repaired === "object") return repaired as NarrativeReport;
      return null;
    }
    if (message.includes("429") || message.toLowerCase().includes("rate-limit")) {
      const raw = await openRouterChat(prompt, { modelOverride: args.modelOverride });
      const parsed = safeJsonParse(raw);
      if (parsed && typeof parsed === "object") return parsed as NarrativeReport;
      const repaired = await repairToJson(raw, schemaHint, args.modelOverride);
      if (repaired && typeof repaired === "object") return repaired as NarrativeReport;
      return null;
    }
    return null;
  }
}

function parseBucketJson(raw: string) {
  const attempts = new Set<string>();
  const tryParse = (candidate: string) => {
    const normalized = candidate.trim();
    if (!normalized || attempts.has(normalized)) return null;
    attempts.add(normalized);
    try {
      return JSON.parse(normalized);
    } catch {
      return null;
    }
  };

  const stripCodeFence = (value: string) =>
    value
      .replace(/^\s*```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

  const sanitizeJson = (value: string) =>
    value
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/,\s*([}\]])/g, "$1")
      .trim();

  const extractFirstJsonObject = (value: string) => {
    const start = value.indexOf("{");
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < value.length; index += 1) {
      const char = value[index];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return value.slice(start, index + 1);
        }
      }
    }
    return null;
  };

  const rawTrimmed = raw.trim();
  const fenced = stripCodeFence(rawTrimmed);
  const parsedCandidates = [
    tryParse(rawTrimmed),
    fenced !== rawTrimmed ? tryParse(fenced) : null,
    tryParse(sanitizeJson(fenced)),
    (() => {
      const extracted = extractFirstJsonObject(fenced);
      return extracted ? tryParse(extracted) : null;
    })(),
    (() => {
      const extracted = extractFirstJsonObject(fenced);
      return extracted ? tryParse(sanitizeJson(extracted)) : null;
    })(),
    (() => {
      const qMatch = fenced.match(/"questions"\s*:\s*(\[[\s\S]*\])/);
      if (!qMatch) return null;
      const questionArray = tryParse(sanitizeJson(qMatch[1]));
      return Array.isArray(questionArray) ? { questions: questionArray } : null;
    })(),
  ];

  const parsed = parsedCandidates.find(Boolean) ?? null;

  const rec =
    parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  const qList = Array.isArray(rec?.questions)
    ? rec.questions
    : Array.isArray(rec?.bucket_questions)
      ? rec.bucket_questions
      : [];
  if (!rec || !Array.isArray(qList) || qList.length === 0) {
    throw new Error("Parse failed");
  }

  const questions = qList.map((q) => {
    const qRec = q && typeof q === "object" ? (q as Record<string, unknown>) : {};
    const answerStatus =
      qRec.answer_status === "insufficient_evidence" ||
      qRec.answerStatus === "insufficient_evidence"
        ? "insufficient_evidence"
        : qRec.answer_status === "scoring_unavailable" ||
            qRec.answerStatus === "scoring_unavailable"
          ? "scoring_unavailable"
          : "answered";
    const rawMark =
      qRec.mark === null || qRec.mark === undefined || qRec.mark === ""
        ? null
        : Number(qRec.mark);
    const rawSelectedOption =
      qRec.selected_option === null ||
      qRec.selected_option === undefined ||
      qRec.selected_option === ""
        ? null
        : Number(qRec.selected_option);
    const camelSelectedOption =
      qRec.selectedOption === null ||
      qRec.selectedOption === undefined ||
      qRec.selectedOption === ""
        ? null
        : Number(qRec.selectedOption);
    const numericSelectedOption =
      Number.isFinite(rawSelectedOption) ? rawSelectedOption : camelSelectedOption;
    const explicitSelectedOption =
      answerStatus === "insufficient_evidence" || answerStatus === "scoring_unavailable"
        ? null
        : numericSelectedOption;
    const numericMark =
      Number.isFinite(rawMark)
        ? rawMark
        : Number.isFinite(explicitSelectedOption)
          ? explicitSelectedOption
          : null;
    const mark =
      answerStatus === "insufficient_evidence" ||
      answerStatus === "scoring_unavailable" ||
      numericMark === null
        ? null
        : Math.min(5, Math.max(1, numericMark));
    const missingEvidenceValue = qRec.missing_evidence ?? qRec.missingEvidence;
    const confidenceValue =
      typeof qRec.confidence === "number"
        ? qRec.confidence
        : typeof qRec.confidence === "string"
          ? Number(qRec.confidence)
          : 0;
    return {
      id: String(qRec.id || "Q"),
      question: String(qRec.question || ""),
      mark,
      selected_option: explicitSelectedOption ?? mark,
      evidence: String(qRec.evidence || ""),
      observation: String(qRec.observation || ""),
      answer_status: answerStatus,
      missing_evidence: Array.isArray(missingEvidenceValue)
        ? missingEvidenceValue.map((item) => String(item))
        : [],
      recommendation: String(qRec.recommendation || ""),
      effort: String(qRec.effort || ""),
      impact: String(qRec.impact || ""),
      confidence: Number.isFinite(confidenceValue) ? confidenceValue : 0,
    };
  });

  const scoreRationale =
    rec.score_rationale && typeof rec.score_rationale === "object"
      ? (rec.score_rationale as Record<string, unknown>)
      : null;

  return {
    bucket: String(rec.bucket || ""),
    pillar: String(rec.pillar || ""),
    score_rationale: scoreRationale,
    questions,
  };
}

function hasRichEvidence(evidence: EvidenceBundle | null) {
  if (!evidence?.pages?.length) return false;
  return evidence.pages.some(
    (page) =>
      safeLength(page.topNavLinks) >= 3 ||
      (page.buttons?.length || 0) >= 2 ||
      (page.formLabels?.length || 0) >= 2 ||
      (page.tabs?.length || 0) >= 2 ||
      (page.alerts?.length || 0) >= 1,
  );
}

function parseOptionalMark(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(5, Math.max(1, numeric));
}

export type BucketResult = {
  bucket_name: string;
  pillar: string;
  total_marks: number | null;
  max_marks: number | null;
  score: number | null;
  bucket_status?: "scored" | "insufficient_evidence" | "scoring_unavailable";
  health: string;
  risk: string;
  priority: string;
  questions: Array<{
    id: string;
    question: string;
    mark: number | null;
    selected_option?: number | null;
    evidence: string;
    observation: string;
    answer_status?: "answered" | "insufficient_evidence" | "scoring_unavailable";
    missing_evidence?: string[];
  }>;
  findings: Array<Record<string, unknown>>;
  improvements: Array<Record<string, unknown>>;
};

function buildInsufficientQuestions(
  bucket: string,
  reason: string,
  answerStatus: "insufficient_evidence" | "scoring_unavailable" = "insufficient_evidence",
): BucketResult["questions"] {
  const qs = QUESTION_BANK[bucket] ?? [];
  return qs.map((q) => ({
    id: q.id,
    question: q.question,
    mark: null,
    selected_option: null,
    evidence: reason,
    observation:
      answerStatus === "scoring_unavailable"
        ? "This question could not be scored because the audit model failed before producing a usable answer."
        : "This question cannot be answered reliably because the required screen or interaction was not captured.",
    answer_status: answerStatus,
    missing_evidence: [],
  }));
}

export function getSelectedBuckets(intake: Intake) {
  const selectedBuckets = intake.selected_buckets
    .filter(Boolean)
    .map((bucket) => normalizeBucketName(bucket))
    .filter((bucket, index, buckets) => buckets.indexOf(bucket) === index);
  return selectedBuckets.filter((b) => QUESTION_BANK[b]?.length);
}

function normalizeGuidedSteps(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((step) => step && typeof step === "object")
    .map((step) => step as Record<string, unknown>)
    .map((step) => ({
      stepName: typeof step.stepName === "string" ? step.stepName : "",
      actionType: typeof step.actionType === "string" ? step.actionType : "",
      targetText: typeof step.targetText === "string" ? step.targetText : "",
      targetSelector: typeof step.targetSelector === "string" ? step.targetSelector : "",
      thenClickText: typeof step.thenClickText === "string" ? step.thenClickText : "",
      expectedUrlContains:
        typeof step.expectedUrlContains === "string" ? step.expectedUrlContains : "",
      expectedText: typeof step.expectedText === "string" ? step.expectedText : "",
      expectedHeading: typeof step.expectedHeading === "string" ? step.expectedHeading : "",
      expectedEvidence:
        typeof step.expectedEvidence === "string"
          ? step.expectedEvidence
          : Array.isArray(step.expectedEvidence)
            ? step.expectedEvidence.map((item) => String(item)).join(", ")
            : "",
      screenshotType: typeof step.screenshotType === "string" ? step.screenshotType : "",
      required: step.required !== false,
    }));
}

function parseAuditFlowInstructionLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.replace(/^\s*(?:\d+[\).\-\s]+|[-*•]\s*)/, "").trim())
    .filter(Boolean);
}

function inferScreenshotTypeFromLine(line: string) {
  const text = line.toLowerCase();
  if (/login/.test(text)) return "login";
  if (/dashboard|home/.test(text)) return "dashboard";
  if (/nav|context selector|dropdown/.test(text)) return "navigation";
  if (/table|grid|items|list/.test(text)) return "data_grid";
  if (/form|input|edit/.test(text)) return "form";
  if (/error|validation/.test(text)) return "error_state";
  if (/empty/.test(text)) return "empty_state";
  if (/loading/.test(text)) return "loading_state";
  if (/report|output|analysis|recommendation/.test(text)) return "report";
  if (/setting/.test(text)) return "settings";
  if (/mobile/.test(text)) return "mobile";
  return "other";
}

function cleanQuotedTarget(line: string) {
  return line
    .replace(/^(?:click|open|select|choose|go to|goto|capture|wait until|wait for)\s+/i, "")
    .replace(/\s+(?:screen|page|view|dropdown|menu|section|option)$/i, "")
    .replace(/^the\s+/i, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function inferGuidedStepsFromAuditFlowText(value: string) {
  const lines = parseAuditFlowInstructionLines(value);
  const steps: Array<{
    stepName: string;
    actionType: string;
    targetText: string;
    targetSelector: string;
    thenClickText: string;
    expectedUrlContains: string;
    expectedText: string;
    expectedHeading: string;
    expectedEvidence: string;
    screenshotType: string;
    required: boolean;
  }> = [];

  for (const line of lines) {
    const routeMatch = line.match(/(^|[\s:(])((?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+)+)/);
    if (routeMatch?.[2]) {
      steps.push({
        stepName: line,
        actionType: "goto",
        targetText: "",
        targetSelector: routeMatch[2],
        thenClickText: "",
        expectedUrlContains: routeMatch[2],
        expectedText: "",
        expectedHeading: "",
        expectedEvidence: "",
        screenshotType: inferScreenshotTypeFromLine(line),
        required: true,
      });
      continue;
    }

    const nestedClickMatch = line.match(
      /click on\s+(.+?)\s+under\s+(.+?)(?:\.|$)/i,
    );
    if (nestedClickMatch) {
      steps.push({
        stepName: line,
        actionType: "click",
        targetText: cleanQuotedTarget(nestedClickMatch[2] || ""),
        targetSelector: "",
        thenClickText: cleanQuotedTarget(nestedClickMatch[1] || ""),
        expectedUrlContains: "",
        expectedText: "",
        expectedHeading: cleanQuotedTarget(nestedClickMatch[1] || ""),
        expectedEvidence: "",
        screenshotType: inferScreenshotTypeFromLine(line),
        required: true,
      });
      continue;
    }

    const selectMatch = line.match(
      /select\s+(.+?)\s+from\s+(.+?)(?:\.|$)/i,
    );
    if (selectMatch) {
      steps.push({
        stepName: line,
        actionType: "select",
        targetText: cleanQuotedTarget(selectMatch[2] || ""),
        targetSelector: "",
        thenClickText: cleanQuotedTarget(selectMatch[1] || ""),
        expectedUrlContains: "",
        expectedText: cleanQuotedTarget(selectMatch[1] || ""),
        expectedHeading: "",
        expectedEvidence: "",
        screenshotType: inferScreenshotTypeFromLine(line),
        required: true,
      });
      continue;
    }

    const clickMatch = line.match(/(?:click on|open)\s+(.+?)(?:\.|$)/i);
    if (clickMatch) {
      const target = cleanQuotedTarget(clickMatch[1] || "");
      steps.push({
        stepName: line,
        actionType: "click",
        targetText: target,
        targetSelector: "",
        thenClickText: "",
        expectedUrlContains: "",
        expectedText: "",
        expectedHeading: target,
        expectedEvidence: "",
        screenshotType: inferScreenshotTypeFromLine(line),
        required: true,
      });
      continue;
    }

    const waitMatch = line.match(/wait until\s+(.+?)(?:\.|$)/i) || line.match(/wait for\s+(.+?)(?:\.|$)/i);
    if (waitMatch) {
      const expected = cleanQuotedTarget(waitMatch[1] || "");
      steps.push({
        stepName: line,
        actionType: "wait",
        targetText: "",
        targetSelector: "",
        thenClickText: "",
        expectedUrlContains: "",
        expectedText: expected,
        expectedHeading: expected,
        expectedEvidence: "",
        screenshotType: inferScreenshotTypeFromLine(line),
        required: true,
      });
      continue;
    }

    if (/capture|screenshot|test|check/.test(line.toLowerCase())) {
      steps.push({
        stepName: line,
        actionType: "wait",
        targetText: "",
        targetSelector: "",
        thenClickText: "",
        expectedUrlContains: "",
        expectedText: "",
        expectedHeading: "",
        expectedEvidence: "",
        screenshotType: inferScreenshotTypeFromLine(line),
        required: true,
      });
    }
  }

  return steps;
}

function mergeGuidedSteps(intake: Intake) {
  const explicitSteps = normalizeGuidedSteps(intake.guided_capture_steps);
  const inferredSteps = inferGuidedStepsFromAuditFlowText(
    typeof intake.audit_flow_instructions === "string" ? intake.audit_flow_instructions : "",
  );

  if (!explicitSteps.length) return inferredSteps;
  if (!inferredSteps.length) return explicitSteps;

  const seen = new Set<string>();
  return [...explicitSteps, ...inferredSteps].filter((step) => {
    const key = [
      step.actionType,
      step.stepName,
      step.targetText,
      step.targetSelector,
      step.thenClickText,
      step.expectedUrlContains,
      step.screenshotType,
    ]
      .map((part) => String(part || "").trim().toLowerCase())
      .join("|");
    if (!key.replace(/\|/g, "")) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeInternalRoutes(intake: Intake) {
  const explicitRoutes = Array.isArray(intake.internal_routes) ? intake.internal_routes : [];
  const inferredRoutes = parseAuditFlowInstructionLines(
    typeof intake.audit_flow_instructions === "string" ? intake.audit_flow_instructions : "",
  ).flatMap((line) => {
    const matches = line.match(/(?:^|[\s:(])((?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+)+)/g) || [];
    return matches
      .map((part) => {
        const route = part.trim().replace(/^[\s:(]+/, "");
        return route.startsWith("/") ? route : "";
      })
      .filter(Boolean);
  });

  return Array.from(new Set([...explicitRoutes, ...inferredRoutes]));
}

function inferEvidenceCoverage(evidence: EvidenceBundle | null) {
  const pages = evidence?.pages ?? [];
  const screenshots = evidence?.screenshots ?? [];
  const normalizedShotType = (shot: { screenType?: string }) =>
    String(shot.screenType || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const uploadByType = (...types: string[]) =>
    screenshots.some(
      (shot) =>
        shot.source === "upload" &&
        types.some(
          (type) =>
            normalizedShotType(shot) ===
            String(type)
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, ""),
        ),
    );
  return {
    homepage:
      pages.some((page) => /homepage|home/i.test([page.label || "", page.title].join(" "))) ||
      uploadByType("homepage"),
    dashboard:
      pages.some((page) => /dashboard|home|overview/i.test([page.label || "", page.title].join(" "))) ||
      uploadByType("dashboard"),
    expanded_navigation: screenshots.some(
      (shot) =>
        uploadByType("expanded_navigation", "context_selector", "navigation") ||
        shot.hasSidebar === true ||
        /nav|navigation|menu|sidebar|context|selector/i.test(
          [shot.label || "", shot.screenName || "", shot.screenType || "", shot.title || ""].join(" "),
        ),
    ),
    internal_product_screen:
      pages.filter(
        (page) =>
          page.url !== evidence?.pages?.[0]?.url ||
          Boolean(page.tableHeaders?.length || page.formLabels?.length),
      ).length >= 3 ||
      screenshots.filter(
        (shot) =>
          shot.source === "upload" &&
          ["dashboard", "data_grid", "form", "report", "settings", "other"].includes(
            normalizedShotType(shot),
          ),
      ).length >= 3,
    context_selector: screenshots.some(
      (shot) =>
        uploadByType("context_selector", "navigation") ||
        shot.hasDropdownOpen === true,
    ),
    form_screen:
      pages.some((page) => (page.formLabels?.length ?? 0) > 1) || uploadByType("form"),
    data_grid:
      pages.some((page) => (page.tableHeaders?.length ?? 0) > 0) || uploadByType("data_grid", "report"),
    error_state: pages.some(
      (page) =>
        (page.alerts?.length ?? 0) > 0 ||
        (page.emptyStateHints?.length ?? 0) > 0 ||
        /error|warning|invalid|empty|no data/i.test(page.textSnippet),
    ) || uploadByType("error_state", "empty_state", "loading_state"),
    keyboard_test: screenshots.some((shot) => normalizedShotType(shot) === "keyboard"),
    mobile_test: screenshots.some((shot) => ["mobile_test", "mobile"].includes(normalizedShotType(shot))),
    zoom_test: screenshots.some((shot) => normalizedShotType(shot) === "zoom_test"),
    semantic_capture: pages.some(
      (page) =>
        safeLength(page.h1) > 0 ||
        safeLength(page.h2) > 0 ||
        safeLength(page.topNavLinks) > 0 ||
        Boolean(page.primaryCtas?.length) ||
        Boolean(page.buttons?.length),
    ),
    marketing_page:
      pages.filter((page) =>
        /pricing|features|about|contact|demo|subscribe|get started|trust|testimonial|case study/i.test(
          [
            page.title,
            page.metaDescription || "",
            ...(Array.isArray(page.h1) ? page.h1 : []),
            ...(Array.isArray(page.h2) ? page.h2 : []),
            ...(Array.isArray(page.h3) ? page.h3 : []),
            page.textSnippet,
          ].join(" "),
        ),
      ).length >= 2 ||
      screenshots.filter((shot) =>
        ["homepage", "landing", "navigation", "form", "report", "other"].includes(normalizedShotType(shot)),
      ).length >= 2,
    listing_page:
      pages.some((page) =>
        /category|collection|products|shop|browse/i.test(`${page.url} ${page.title} ${page.textSnippet}`),
      ) || uploadByType("listing_page", "category", "collection"),
    product_page:
      pages.some((page) => /add to cart|buy now|price|product details/i.test(`${page.title} ${page.textSnippet}`)) ||
      uploadByType("product_page", "product_detail"),
    cart_or_checkout:
      pages.some((page) => /cart|checkout|basket|order summary/i.test(`${page.title} ${page.textSnippet}`)) ||
      uploadByType("cart", "checkout"),
  };
}

function missingEvidenceForQuestion(
  bucket: string,
  questionId: string,
  evidence: EvidenceBundle | null,
  productType: "saas" | "ecommerce" | "marketing_website" = "saas",
) {
  bucket = normalizeBucketName(bucket);
  const coverageStatus = evidence?.coverage?.status || "";
  const coverageSummary = (evidence?.coverage?.evidenceSummary || {}) as Record<string, unknown>;
  const pages = Array.isArray(evidence?.pages) ? evidence.pages : [];
  const screenshots = Array.isArray(evidence?.screenshots) ? evidence.screenshots : [];
  const flags = inferEvidenceCoverage(evidence);
  const internalScreensCaptured = Number(coverageSummary.internalScreensCaptured || 0);
  const dashboardCaptured = coverageSummary.dashboardCaptured === true;
  const navigationCaptured = coverageSummary.navigationCaptured === true;
  const formCaptured = coverageSummary.formCaptured === true;
  const tableCaptured = coverageSummary.tableOrGridCaptured === true;
  const errorCaptured =
    pages.some((page) => (page.alerts?.length ?? 0) > 0 || (page.emptyStateHints?.length ?? 0) > 0) ||
    screenshots.some((shot) => shot.hasErrorState || shot.hasEmptyState);
  const productDepthStrong =
    coverageStatus === "full_coverage" || coverageStatus === "usable_coverage";

  if (productDepthStrong) {
    const minimalMissing = new Set<string>();

    if (bucket === "Navigation & Findability") {
      if (!navigationCaptured) minimalMissing.add("expanded_navigation");
      if (productType === "saas") {
        if (!dashboardCaptured && internalScreensCaptured <= 0) {
          minimalMissing.add("dashboard");
        }
      } else if (productType === "marketing_website") {
        if (!flags.homepage && !flags.marketing_page) minimalMissing.add("homepage");
      } else if (!flags.homepage && !flags.listing_page && !flags.product_page) {
        minimalMissing.add("homepage");
      }
      return Array.from(minimalMissing);
    }

    if (
      bucket === "Content (Impact)" ||
      bucket === "Content (Delight)" ||
      bucket === "Typography & Readability" ||
      bucket === "Visual Consistency" ||
      bucket === "Brand Expression" ||
      bucket === "Icons & Imagery"
    ) {
      if (productType === "saas") {
        if (!dashboardCaptured && internalScreensCaptured <= 0) return ["dashboard"];
      } else if (productType === "marketing_website") {
        if (!flags.homepage && !flags.marketing_page) return ["homepage"];
      } else if (!flags.homepage && !flags.product_page) {
        return ["homepage"];
      }
      return [];
    }

    if (bucket === "Consistency & UI Patterns") {
      if (!navigationCaptured) return ["expanded_navigation"];
      return [];
    }

    if (bucket === "Visual Feedback") {
      if (productType === "saas") {
        if (internalScreensCaptured <= 0 && !dashboardCaptured) return ["internal_product_screen"];
      } else if (productType === "marketing_website") {
        if (!flags.homepage && !flags.marketing_page) return ["marketing_page"];
      } else if (!flags.product_page && !flags.listing_page && !flags.homepage) {
        return ["product_page"];
      }
      return [];
    }

    if (bucket === "Keyboard Navigation") {
      const missing = new Set<string>();
      const hasPublicSurface =
        productType === "marketing_website"
          ? flags.homepage || flags.marketing_page || flags.semantic_capture
          : productType === "ecommerce"
            ? flags.homepage || flags.product_page || flags.listing_page || flags.semantic_capture
            : false;
      if (productType === "saas") {
        if (!formCaptured && !tableCaptured) missing.add("keyboard_test");
      } else {
        if (!formCaptured && !tableCaptured && !hasPublicSurface) missing.add("keyboard_test");
      }
      return Array.from(missing);
    }

    if (bucket === "Color & Contrast" || bucket === "Typography & Readability") {
      const missing = new Set<string>();
      if (productType === "saas") {
        if (internalScreensCaptured <= 0 && !dashboardCaptured) {
          missing.add("internal_product_screen");
        }
      } else if (productType === "marketing_website") {
        if (!flags.homepage && !flags.marketing_page) missing.add("marketing_page");
      } else if (!flags.homepage && !flags.product_page && !flags.listing_page) {
        missing.add("product_page");
      }
      if (bucket === "Typography & Readability") missing.add("zoom_test");
      return Array.from(missing);
    }

    if (bucket === "Screen Reader Support") {
      const missing = new Set<string>();
      if (productType === "saas") {
        if (internalScreensCaptured <= 0 && !dashboardCaptured) {
          missing.add("internal_product_screen");
        }
      } else if (productType === "marketing_website") {
        if (!flags.homepage && !flags.marketing_page) missing.add("marketing_page");
      } else if (!flags.homepage && !flags.product_page && !flags.listing_page) {
        missing.add("product_page");
      }
      return Array.from(missing);
    }

    if (bucket === "Performance") {
      const missing = new Set<string>();
      if (productType === "marketing_website" && !flags.homepage && !flags.marketing_page) {
        missing.add("marketing_page");
      }
      if (productType === "ecommerce" && !flags.homepage && !flags.product_page && !flags.listing_page) {
        missing.add("product_page");
      }
      return Array.from(missing);
    }
  }

  const required = new Set<string>();

  if (productType === "marketing_website") {
    if (bucket === "Navigation & Findability") {
      required.add("homepage");
      required.add("expanded_navigation");
      required.add("marketing_page");
    } else if (
      bucket === "Content (Impact)" ||
      bucket === "Content (Delight)" ||
      bucket === "Typography & Readability" ||
      bucket === "Visual Consistency" ||
      bucket === "Brand Expression" ||
      bucket === "Icons & Imagery"
    ) {
      required.add("homepage");
      required.add("marketing_page");
    } else if (
      bucket === "Color & Contrast" ||
      bucket === "Typography & Readability" ||
      bucket === "Keyboard Navigation" ||
      bucket === "Visual Feedback" ||
      bucket === "Screen Reader Support"
    ) {
      required.add("marketing_page");
      if (bucket === "Keyboard Navigation") required.add("keyboard_test");
      if (bucket === "Typography & Readability") required.add("zoom_test");
    } else if (bucket === "Consistency & UI Patterns") {
      required.add("marketing_page");
      required.add("expanded_navigation");
    } else if (bucket === "Performance") {
      required.add("marketing_page");
    }
  } else if (productType === "ecommerce") {
    if (bucket === "Navigation & Findability") {
      required.add("homepage");
      required.add("expanded_navigation");
      required.add("listing_page");
    } else if (
      bucket === "Content (Impact)" ||
      bucket === "Content (Delight)" ||
      bucket === "Typography & Readability" ||
      bucket === "Visual Consistency" ||
      bucket === "Brand Expression" ||
      bucket === "Icons & Imagery"
    ) {
      required.add("homepage");
      required.add("product_page");
    } else if (
      bucket === "Color & Contrast" ||
      bucket === "Typography & Readability" ||
      bucket === "Keyboard Navigation" ||
      bucket === "Visual Feedback" ||
      bucket === "Screen Reader Support"
    ) {
      required.add("product_page");
      if (bucket === "Keyboard Navigation") required.add("keyboard_test");
      if (bucket === "Typography & Readability") required.add("zoom_test");
    } else if (bucket === "Consistency & UI Patterns") {
      required.add("listing_page");
      required.add("expanded_navigation");
    } else if (bucket === "Performance") {
      required.add("homepage");
      required.add("product_page");
    }
  } else {
    if (bucket === "Navigation & Findability") {
      required.add("dashboard");
      required.add("expanded_navigation");
      required.add("internal_product_screen");
    } else if (
      bucket === "Content (Impact)" ||
      bucket === "Content (Delight)" ||
      bucket === "Typography & Readability" ||
      bucket === "Visual Consistency" ||
      bucket === "Brand Expression" ||
      bucket === "Icons & Imagery"
    ) {
      required.add("dashboard");
      required.add("internal_product_screen");
    } else if (
      bucket === "Color & Contrast" ||
      bucket === "Typography & Readability" ||
      bucket === "Keyboard Navigation" ||
      bucket === "Visual Feedback" ||
      bucket === "Screen Reader Support"
    ) {
      required.add("internal_product_screen");
      if (bucket === "Keyboard Navigation") required.add("keyboard_test");
      if (bucket === "Typography & Readability") required.add("zoom_test");
    } else if (bucket === "Consistency & UI Patterns") {
      required.add("internal_product_screen");
      required.add("expanded_navigation");
    } else if (bucket === "Performance") {
      required.add("internal_product_screen");
    }
  }

  return Array.from(required).filter((key) => !flags[key as keyof typeof flags]);
}

export async function prepareEvidence(intake: Intake) {
  const mergedGuidedSteps = mergeGuidedSteps(intake);
  const mergedInternalRoutes = mergeInternalRoutes(intake);
  let evidence: EvidenceBundle | null = null;
  try {
    evidence = await collectEvidence({
      productUrl: intake.product_url,
      auditFlows: intake.audit_flows,
      productType: intake.product_type,
      accessMode: intake.access_mode,
      loginRequired: intake.login_required,
      loginEmail: intake.login_email,
      loginPassword: intake.login_password,
      uploadedScreenshots: Array.isArray(intake.artifacts?.screenshots)
        ? intake.artifacts.screenshots
        : [],
      uploadedVideo: intake.artifacts?.criticalFlowVideo
        ? {
            name: intake.artifacts.criticalFlowVideo.name,
            url: intake.artifacts.criticalFlowVideo.url,
            type: intake.artifacts.criticalFlowVideo.type,
            size: intake.artifacts.criticalFlowVideo.size,
            publicId: intake.artifacts.criticalFlowVideo.publicId,
            format: intake.artifacts.criticalFlowVideo.format,
            resourceType: intake.artifacts.criticalFlowVideo.resourceType,
          }
        : undefined,
      criticalFlowNotes: intake.artifacts?.notes || "",
      extensionCaptureJson: intake.artifacts?.extensionCaptureJson || "",
      guidedCaptureSteps: mergedGuidedSteps,
      internalRoutes: mergedInternalRoutes,
    });
  } catch {
    evidence = null;
  }

  if (!evidence) return null;

  const normalizedPages = Array.isArray(evidence.pages)
    ? evidence.pages.map((page) => ({
        ...page,
        label: typeof page.label === "string" ? page.label : "",
        url: typeof page.url === "string" ? page.url : "",
        title: typeof page.title === "string" ? page.title : "",
        metaDescription: typeof page.metaDescription === "string" ? page.metaDescription : "",
        h1: Array.isArray(page.h1) ? page.h1 : [],
        h2: Array.isArray(page.h2) ? page.h2 : [],
        h3: Array.isArray(page.h3) ? page.h3 : [],
        topNavLinks: Array.isArray(page.topNavLinks) ? page.topNavLinks : [],
        primaryCtas: Array.isArray(page.primaryCtas) ? page.primaryCtas : [],
        buttons: Array.isArray(page.buttons) ? page.buttons : [],
        formLabels: Array.isArray(page.formLabels) ? page.formLabels : [],
        placeholders: Array.isArray(page.placeholders) ? page.placeholders : [],
        tabs: Array.isArray(page.tabs) ? page.tabs : [],
        alerts: Array.isArray(page.alerts) ? page.alerts : [],
        tableHeaders: Array.isArray(page.tableHeaders) ? page.tableHeaders : [],
        emptyStateHints: Array.isArray(page.emptyStateHints) ? page.emptyStateHints : [],
        textSnippet: typeof page.textSnippet === "string" ? page.textSnippet : "",
      }))
    : [];

  const coverage = validateExplorationCoverage(
    {
      productUrl: intake.product_url,
      auditFlows: intake.audit_flows,
      productType: intake.product_type,
      accessMode: intake.access_mode,
      loginRequired: intake.login_required,
      loginEmail: intake.login_email,
      loginPassword: intake.login_password,
      uploadedScreenshots: Array.isArray(intake.artifacts?.screenshots)
        ? intake.artifacts.screenshots
        : [],
      uploadedVideo: intake.artifacts?.criticalFlowVideo
        ? {
            name: intake.artifacts.criticalFlowVideo.name,
            url: intake.artifacts.criticalFlowVideo.url,
            type: intake.artifacts.criticalFlowVideo.type,
            size: intake.artifacts.criticalFlowVideo.size,
            publicId: intake.artifacts.criticalFlowVideo.publicId,
            format: intake.artifacts.criticalFlowVideo.format,
            resourceType: intake.artifacts.criticalFlowVideo.resourceType,
          }
        : undefined,
      criticalFlowNotes: intake.artifacts?.notes || "",
      extensionCaptureJson: intake.artifacts?.extensionCaptureJson || "",
      guidedCaptureSteps: mergedGuidedSteps,
      internalRoutes: mergedInternalRoutes,
    },
    evidence,
  );

  const normalizedEvidence = {
    ...evidence,
    coverage,
    screenshotDataUrl: null,
    pages: normalizedPages,
    screenshots: Array.isArray(evidence.screenshots)
      ? evidence.screenshots.map((shot) => ({
          label: shot.label,
          url: "",
        }))
      : [],
    auth: evidence.auth
      ? {
          required: Boolean(evidence.auth.required),
          attempted: Boolean(evidence.auth.attempted),
          success: Boolean(evidence.auth.success),
          message: typeof evidence.auth.message === "string" ? evidence.auth.message : "",
        }
      : undefined,
  };

  return normalizedEvidence;
}

export async function auditOneBucket(args: {
  intake: Intake;
  bucket: string;
  evidence: EvidenceBundle | null;
  modelOverride?: string;
}) {
  const { intake, bucket, evidence } = args;
  const qs = QUESTION_BANK[bucket] ?? [];
  const pageCount = Array.isArray(evidence?.pages) ? evidence.pages.length : 0;
  const screenshotCount = Array.isArray(evidence?.screenshots) ? evidence.screenshots.length : 0;

  // If we have no usable evidence, do not ask the model to guess.
  if (!evidence || (pageCount === 0 && screenshotCount === 0)) {
    const questions = qs.map((q) => ({
      id: q.id,
      question: q.question,
      mark: null,
      selected_option: null,
      evidence: "Authenticated product evidence was not captured reliably.",
      observation: "This question cannot be answered reliably because the required screen or interaction was not captured.",
      answer_status: "insufficient_evidence" as const,
      missing_evidence: missingEvidenceForQuestion(bucket, q.id, evidence, intake.product_type),
      recommendation: "",
      effort: "",
      impact: "",
      confidence: 0,
    }));
    const bucketResult: BucketResult = {
      bucket_name: bucket,
      pillar: PILLAR_MAP[bucket] || "Impact",
      total_marks: null,
      max_marks: null,
      score: null,
      bucket_status: "insufficient_evidence",
      health: "Not scored",
      risk: "Evidence missing",
      priority: "P0",
      questions,
      findings: [],
      improvements: [],
    };
    return bucketResult;
  }

  const bucketEvidenceSummary = summarizeEvidenceForBucket(evidence, bucket);
  let parsed: {
    bucket: string;
    pillar?: string;
    score_rationale?: Record<string, unknown> | null;
    questions: Array<Record<string, unknown>>;
  };
  const parsedQuestionsById = new Map<string, Record<string, unknown>>();
  let parsedPillar = PILLAR_MAP[bucket] || "Impact";
  let parsedScoreRationale: Record<string, unknown> | null = null;
  const questionChunks = chunkArray(qs, 2);

  for (const questionChunk of questionChunks) {
    const prompt = `${bucketPrompt(intake, bucket, questionChunk)}\n\nBucket-focused evidence summary:\n${bucketEvidenceSummary}\n`;
    let raw: string;
    try {
      raw = await openRouterChat(prompt, { modelOverride: args.modelOverride });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("Prompt tokens limit exceeded") ||
        message.toLowerCase().includes("context length") ||
        message.toLowerCase().includes("maximum context")
      ) {
        raw = await openRouterChat(
          `${bucketPrompt(intake, bucket, questionChunk)}\n\nCompressed evidence:\n${trimText(bucketEvidenceSummary, 1800)}\n`,
          { modelOverride: args.modelOverride },
        );
      } else {
        continue;
      }
    }

    try {
      const chunkParsed = parseBucketJson(raw);
      if (chunkParsed.pillar) parsedPillar = chunkParsed.pillar;
      if (chunkParsed.score_rationale && !parsedScoreRationale) {
        parsedScoreRationale = chunkParsed.score_rationale;
      }
      for (const question of chunkParsed.questions) {
        const id = typeof question.id === "string" ? question.id : "";
        if (id) parsedQuestionsById.set(id, question);
      }
    } catch {
      const schemaHint =
        '{ "bucket":"...", "pillar":"...", "score_rationale": {"summary":"...","what_is_working":["..."],"what_is_risky":["..."],"why_now":"..."}, "questions":[{"id":"N01","question":"...","mark":3,"evidence":"...","observation":"...","recommendation":"...","effort":"S|M|L","impact":"Low|Med|High","confidence":0.0}] }';
      const repaired = await repairToJson(raw, schemaHint, args.modelOverride);
      if (repaired && typeof repaired === "object") {
        try {
          const repairedParsed = parseBucketJson(JSON.stringify(repaired));
          if (repairedParsed.pillar) parsedPillar = repairedParsed.pillar;
          if (repairedParsed.score_rationale && !parsedScoreRationale) {
            parsedScoreRationale = repairedParsed.score_rationale;
          }
          for (const question of repairedParsed.questions) {
            const id = typeof question.id === "string" ? question.id : "";
            if (id) parsedQuestionsById.set(id, question);
          }
        } catch {}
      }
    }
  }

  parsed = {
    bucket,
    pillar: parsedPillar,
    score_rationale: parsedScoreRationale,
    questions: qs
      .map((question) => parsedQuestionsById.get(question.id))
      .filter(Boolean) as Array<Record<string, unknown>>,
  };

  if (parsed.questions.length === 0) {
    const fallback: BucketResult = {
      bucket_name: bucket,
      pillar: PILLAR_MAP[bucket] || "Impact",
      total_marks: null,
      max_marks: null,
      score: null,
      bucket_status: "scoring_unavailable",
      health: "Not scored",
      risk: "Scoring unavailable",
      priority: "P0",
      questions: buildInsufficientQuestions(
        bucket,
        "The model response could not be parsed into a usable bucket evaluation.",
        "scoring_unavailable",
      ),
      findings: [],
      improvements: [],
    };
    return fallback;
  }
  if (parsed.questions.length < qs.length) {
    try {
      parsed = {
        ...parsed,
        questions: await completeMissingQuestions({
          intake,
          bucket,
          expectedQuestions: qs,
          existingQuestions: parsed.questions,
          evidence,
          modelOverride: args.modelOverride,
        }),
      };
    } catch {
      parsed = {
        ...parsed,
        questions: qs.map((question) => {
          const existing = parsed.questions.find((item) => String(item.id ?? "") === question.id);
          return (
            existing || {
              id: question.id,
              question: question.question,
              mark: null,
              selected_option: null,
              answer_status: "scoring_unavailable",
              evidence: "The model response ended before this question could be evaluated.",
              observation: "This question could not be scored because the audit model returned an incomplete bucket response.",
              missing_evidence: [],
              recommendation: "",
              effort: "",
              impact: "",
              confidence: 0,
            }
          );
        }),
      };
    }
  }

  const parsedQuestionInputs = Array.isArray(parsed.questions) ? parsed.questions : [];
  const questions: Array<BucketResult["questions"][number] & {
    recommendation?: string;
    effort?: string;
    impact?: string;
    confidence?: number;
  }> = parsedQuestionInputs
    .map((q) => asRecord(q))
    .filter((q): q is Record<string, unknown> => Boolean(q))
    .map((q) => ({
      id: String(q.id ?? "Q"),
      question: String(q.question ?? ""),
      mark:
        q.answer_status === "insufficient_evidence" ||
        q.answer_status === "scoring_unavailable"
          ? null
          : parseOptionalMark(q.mark),
      selected_option:
        q.answer_status === "insufficient_evidence" ||
        q.answer_status === "scoring_unavailable"
          ? null
          : parseOptionalMark(q.selected_option ?? q.mark),
      evidence: String(q.evidence ?? ""),
      observation: String(q.observation ?? ""),
      answer_status:
        q.answer_status === "insufficient_evidence"
          ? ("insufficient_evidence" as const)
          : q.answer_status === "scoring_unavailable"
            ? ("scoring_unavailable" as const)
            : ("answered" as const),
      missing_evidence: Array.isArray(q.missing_evidence)
        ? q.missing_evidence.map((item) => String(item))
        : ([] as string[]),
      recommendation: String(q.recommendation ?? ""),
      effort: String(q.effort ?? ""),
      impact: String(q.impact ?? ""),
      confidence: Number(q.confidence) || 0,
    }));

  if (
    questions.length > 0 &&
    questions.every((question) => question.mark === 3) &&
    hasRichEvidence(evidence)
  ) {
    const retryPrompt = `${prompt}\nImportant correction: your previous pass returned mark 3 for every question.\nRe-evaluate using the full 1-5 scale.\nIf visible evidence is clearly positive, use 4 or 5.\nIf visible evidence is clearly negative, use 1 or 2.\nUse 3 only where evidence is genuinely mixed or missing.\nReturn the same JSON schema only.`;
    const retryRaw = await openRouterChat(retryPrompt, { modelOverride: args.modelOverride });
    try {
      const retryParsed = parseBucketJson(retryRaw);
      const retryQuestionInputs = Array.isArray(retryParsed.questions) ? retryParsed.questions : [];
      const retryQuestions = retryQuestionInputs
        .map((q) => asRecord(q))
        .filter((q): q is Record<string, unknown> => Boolean(q))
        .map((q) => ({
          id: String(q.id ?? "Q"),
          question: String(q.question ?? ""),
          mark:
            q.answer_status === "insufficient_evidence" ||
            q.answer_status === "scoring_unavailable"
              ? null
              : parseOptionalMark(q.mark),
          selected_option:
            q.answer_status === "insufficient_evidence" ||
            q.answer_status === "scoring_unavailable"
              ? null
              : parseOptionalMark(q.selected_option ?? q.mark),
          evidence: String(q.evidence ?? ""),
          observation: String(q.observation ?? ""),
          answer_status:
            q.answer_status === "insufficient_evidence"
              ? ("insufficient_evidence" as const)
              : q.answer_status === "scoring_unavailable"
                ? ("scoring_unavailable" as const)
                : ("answered" as const),
          missing_evidence: Array.isArray(q.missing_evidence)
            ? q.missing_evidence.map((item) => String(item))
            : ([] as string[]),
          recommendation: String(q.recommendation ?? ""),
          effort: String(q.effort ?? ""),
          impact: String(q.impact ?? ""),
          confidence: Number(q.confidence) || 0,
        })) as Array<BucketResult["questions"][number] & {
          recommendation?: string;
          effort?: string;
          impact?: string;
          confidence?: number;
        }>;
      if (retryQuestions.some((question) => question.mark !== 3)) {
        questions.splice(0, questions.length, ...retryQuestions);
      }
    } catch {}
  }
  for (const question of questions) {
    const missingEvidence = missingEvidenceForQuestion(bucket, question.id, evidence, intake.product_type);
    if (missingEvidence.length > 0) {
      question.mark = null;
      question.selected_option = null;
      question.answer_status = "insufficient_evidence";
      question.missing_evidence = missingEvidence;
      question.observation =
        "This question cannot be answered reliably because the required screen or interaction was not captured.";
      question.evidence = question.evidence || "Required evidence was not captured during exploration.";
      question.recommendation = "";
      question.effort = "";
      question.impact = "";
      question.confidence = 0;
    }
  }
  const answeredQuestions = questions.filter((q) => q.answer_status === "answered");
  const scoredQuestions = answeredQuestions.filter((q) => typeof q.mark === "number");
  const hasScoringUnavailableAnswers = questions.some(
    (q) => q.answer_status === "scoring_unavailable",
  );
  if (answeredQuestions.length > 0 && scoredQuestions.length === 0) {
    return makeFailedBucketResult({
      intake,
      bucket,
      reason: "The model returned question answers without usable numeric marks.",
    });
  }
  const enoughEvidence = scoredQuestions.length > 0;
  const totalMarks = enoughEvidence
    ? scoredQuestions.reduce((sum, q) => sum + Number(q.mark || 0), 0)
    : 0;
  const maxMarks = enoughEvidence ? scoredQuestions.length * 5 : 0;
  const score = enoughEvidence && maxMarks > 0 ? Math.round((totalMarks / maxMarks) * 100) : null;
  const health = score === null ? null : getHealth(score);

  const findings = enoughEvidence
    ? questions
    .filter((q) => typeof q.mark === "number" && q.mark <= 2)
    .map((q) => ({
      bucket,
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
    }))
    : [];

  const improvements = enoughEvidence
    ? questions
    .filter((q) => q.answer_status !== "insufficient_evidence" && q.mark === 3)
    .map((q) => ({
      bucket,
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
    }))
    : [];

  const bucketResult: BucketResult = {
    bucket_name: bucket,
    pillar: parsed.pillar || PILLAR_MAP[bucket] || "Impact",
    total_marks: enoughEvidence ? totalMarks : null,
    max_marks: enoughEvidence ? maxMarks : null,
    score: enoughEvidence ? score : null,
    bucket_status: enoughEvidence
      ? "scored"
      : hasScoringUnavailableAnswers
        ? "scoring_unavailable"
        : "insufficient_evidence",
    health: enoughEvidence && health ? health.label : "Not scored",
    risk: enoughEvidence && health ? health.risk : hasScoringUnavailableAnswers ? "Scoring unavailable" : "Evidence missing",
    priority: enoughEvidence && health ? health.priority : "P0",
    questions,
    findings,
    improvements,
  };

  return bucketResult;
}

// ADDED: Ensure the pipeline can finish even when a provider is unstable.
export function makeFailedBucketResult(args: {
  intake: Intake;
  bucket: string;
  reason: string;
}) {
  const questions = buildInsufficientQuestions(
    args.bucket,
    `Unable to evaluate due to processing error: ${args.reason}`,
    "scoring_unavailable",
  ).map((q) => ({
    ...q,
    recommendation: "",
    effort: "",
    impact: "",
    confidence: 0,
  }));
  return {
    bucket_name: args.bucket,
    pillar: PILLAR_MAP[args.bucket] || "Impact",
    total_marks: null,
    max_marks: null,
    score: null,
    bucket_status: "scoring_unavailable",
    health: "Not scored",
    risk: "Scoring unavailable",
    priority: "P0",
    questions,
    findings: [],
    improvements: [],
  } satisfies BucketResult;
}

export async function finalizeAudit(args: {
  intake: Intake;
  evidence: EvidenceBundle | null;
  bucket_results: BucketResult[];
  editContext?: string;
  modelOverride?: string;
}) {
  try {
  const onlyResults = args.bucket_results;
  const scoredBuckets = onlyResults.filter((bucket) => bucket.bucket_status === "scored");
  const coverageStatus = args.evidence?.coverage?.status || null;
  const totalQuestions = onlyResults.reduce((sum, bucket) => sum + bucket.questions.length, 0);
  const scoreableQuestions = onlyResults.reduce(
    (sum, bucket) =>
      sum +
      bucket.questions.filter((question) => question.answer_status === "answered").length,
    0,
  );
  const hasScoringFailure = onlyResults.some((bucket) => bucket.bucket_status === "scoring_unavailable");
  const hasCoverageShortfall = ["failed_login", "insufficient_coverage", "limited_coverage"].includes(
    coverageStatus || "",
  );
  const provisionalCoverage = coverageStatus === "usable_coverage";
  const scoreEligible =
    !hasCoverageShortfall &&
    !hasScoringFailure &&
    scoreableQuestions > 0 &&
    scoredBuckets.length > 0;
  const rawOverallScore = scoredBuckets.length
    ? Math.round(scoredBuckets.reduce((sum, b) => sum + Number(b.score || 0), 0) / scoredBuckets.length)
    : 0;
  const overallScore = scoreEligible ? rawOverallScore : null;
  const overall = overallScore === null ? null : getHealth(overallScore);

  const scorecard = onlyResults.map((b) => ({
    section: b.bucket_name,
    score: b.score,
    health: b.health,
    risk: b.risk,
    priority: b.priority,
    pillar: b.pillar,
  }));

  const allFindings = onlyResults.flatMap((b) => b.findings);
  const quickWins = onlyResults.flatMap((b) => b.improvements);
  const quickWinsTable = buildQuickWinsTableFromImprovements(quickWins);
  const derivedRoadmap = buildRoadmapFromQuickWins(quickWinsTable);
  const sectionNarrativeFallback = deriveSectionNarrativeFromBuckets(onlyResults);
  const competitors = parseCompetitorsFromIntakeText(args.intake.competitors);

  const byPriority = (p: string) =>
    onlyResults.filter((b) => b.priority === p).map((b) => b.bucket_name);

  const report = {
    overall_score: overallScore,
    overall_health: overall
      ? overall.label
      : hasCoverageShortfall
        ? "Not scored"
        : hasScoringFailure
          ? "Scoring unavailable"
        : "Scoring unavailable",
    overall_risk: overall
      ? overall.risk
      : hasCoverageShortfall
        ? "Capture coverage insufficient"
        : hasScoringFailure
          ? "Scoring unavailable"
        : "Scoring unavailable",
    scorecard,
    p1_buckets: byPriority("P1"),
    p2_buckets: byPriority("P2"),
    p3_buckets: byPriority("P3"),
    p4_buckets: byPriority("P4"),
    findings_detailed: allFindings,
    all_findings: allFindings,
    all_improvements: quickWins,
    quick_wins_table: quickWinsTable,
    quick_wins: quickWins.map((w: unknown) =>
      w && typeof w === "object"
        ? String(
            (w as Record<string, unknown>).recommendation ??
              (w as Record<string, unknown>).observation ??
              (w as Record<string, unknown>).question ??
              "",
          )
        : "",
    ).filter(Boolean),
    bucket_results: onlyResults,
    audit_mode: hasCoverageShortfall
      ? "Limited Coverage Report"
      : hasScoringFailure
        ? "Provisional UX Audit"
      : provisionalCoverage
        ? "Provisional UX Audit"
        : "Full UX Audit",
    coverage_status: coverageStatus,
    ux_score_eligible: scoreEligible,
    questions_scoreable: scoreableQuestions,
    questions_total: totalQuestions,
    capture_coverage:
      coverageStatus === "full_coverage"
        ? "High"
        : coverageStatus === "usable_coverage"
          ? "Medium"
          : "Low",
    intake: args.intake,
    evidence: args.evidence,
    roadmap: derivedRoadmap,
    closing_note:
      scoreEligible && (derivedRoadmap.week_1_2.length || derivedRoadmap.month_1.length || derivedRoadmap.quarter_1.length)
        ? "You have a clear path forward — start with the Week 1–2 actions to remove the sharpest UX friction, then use Month 1 for system-level cleanup and Quarter 1 for the larger structural improvements."
        : hasScoringFailure
          ? "The report still gives you a strong starting point, and once the model has a clean pass the roadmap can be sharpened further."
          : "You’ve already captured a useful set of findings — use them to sequence the next round of UX improvements with confidence.",
    competitor_analysis: {
      competitors_count: competitors.length,
      competitors,
      matrix: {
        columns: competitors.map((item) => item.name || item.url),
        rows: [
          {
            key: "compare_focus",
            label: "Compare focus",
            values: Object.fromEntries(
              competitors.map((item) => [item.name || item.url, item.compare_focus || "—"]),
            ),
          },
        ],
      },
    },
  };

  const derivedExecutiveSummary = deriveExecutiveSummaryFromBuckets({
    bucketResults: onlyResults,
    allFindings,
    quickWins,
    scoreEligible,
    overallScore,
    productName: args.intake.product_name,
  });

  const narrative = await writeNarrative({
    intake: args.intake,
    evidence: args.evidence,
    bucket_results: onlyResults,
    overall_score: overallScore ?? rawOverallScore,
    editContext: args.editContext,
    modelOverride: args.modelOverride,
  }).catch(() => null);

  const executiveSummaryFromNarrative =
    narrative && typeof narrative === "object"
      ? {
          one_line_verdict:
            (typeof narrative.executive_summary === "object" &&
            narrative.executive_summary &&
            "one_line_verdict" in narrative.executive_summary
              ? String((narrative.executive_summary as Record<string, unknown>).one_line_verdict || "").trim()
              : typeof narrative.executive_summary === "string"
                ? narrative.executive_summary
                : "") || "",
          strongest_area:
            typeof narrative.executive_summary === "object" && narrative.executive_summary
              ? String((narrative.executive_summary as Record<string, unknown>).strongest_area || "").trim()
              : "",
          main_issue:
            typeof narrative.executive_summary === "object" && narrative.executive_summary
              ? String((narrative.executive_summary as Record<string, unknown>).main_issue || "").trim()
              : "",
          whats_working:
            typeof narrative.executive_summary === "object" && narrative.executive_summary
              ? Array.isArray((narrative.executive_summary as Record<string, unknown>).whats_working)
                ? ((narrative.executive_summary as Record<string, unknown>).whats_working as unknown[])
                    .map((item) => String(item || "").trim())
                    .filter(Boolean)
                : []
              : [],
          first_priority:
            typeof narrative.executive_summary === "object" && narrative.executive_summary
              ? Array.isArray((narrative.executive_summary as Record<string, unknown>).first_priority)
                ? ((narrative.executive_summary as Record<string, unknown>).first_priority as unknown[])
                    .map((item) => String(item || "").trim())
                    .filter(Boolean)
                : []
              : [],
          top_problems:
            typeof narrative.executive_summary === "object" && narrative.executive_summary
              ? Array.isArray((narrative.executive_summary as Record<string, unknown>).top_problems)
                ? ((narrative.executive_summary as Record<string, unknown>).top_problems as unknown[])
                    .map((item) => String(item || "").trim())
                    .filter(Boolean)
                : Array.isArray(narrative.top_risks)
                  ? narrative.top_risks.map((item) => String(item || "").trim()).filter(Boolean)
                  : []
              : Array.isArray(narrative.top_risks)
                ? narrative.top_risks.map((item) => String(item || "").trim()).filter(Boolean)
                : [],
          top_3_problems:
            typeof narrative.executive_summary === "object" && narrative.executive_summary
              ? Array.isArray((narrative.executive_summary as Record<string, unknown>).top_3_problems)
                ? ((narrative.executive_summary as Record<string, unknown>).top_3_problems as unknown[])
                    .map((item) => String(item || "").trim())
                    .filter(Boolean)
                : Array.isArray((narrative.executive_summary as Record<string, unknown>).top_problems)
                  ? ((narrative.executive_summary as Record<string, unknown>).top_problems as unknown[])
                      .map((item) => String(item || "").trim())
                      .filter(Boolean)
                      .slice(0, 3)
                  : Array.isArray(narrative.top_risks)
                    ? narrative.top_risks.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
                    : []
              : Array.isArray(narrative.top_risks)
                ? narrative.top_risks.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
                : [],
          quick_wins: Array.isArray(narrative.quick_wins)
            ? narrative.quick_wins.map((item) =>
                typeof item === "object" && item
                  ? String((item as Record<string, unknown>).why || (item as Record<string, unknown>).title || "").trim()
                  : "",
              ).filter(Boolean)
            : [],
          top_3_quick_wins: Array.isArray(narrative.quick_wins)
            ? narrative.quick_wins.map((item) =>
                typeof item === "object" && item
                  ? String((item as Record<string, unknown>).why || (item as Record<string, unknown>).title || "").trim()
                  : "",
              ).filter(Boolean).slice(0, 3)
            : [],
          first_priority_recommendation:
            typeof narrative.executive_summary === "object" && narrative.executive_summary
              ? String((narrative.executive_summary as Record<string, unknown>).first_priority_recommendation || "").trim()
              : "",
        }
      : null;

  const narrativeQuickWinsTable = Array.isArray(narrative?.quick_wins)
    ? buildQuickWinsTableFromImprovements(narrative.quick_wins)
    : [];
  const mergedQuickWinsTable = narrativeQuickWinsTable.length ? narrativeQuickWinsTable : quickWinsTable;
  const mergedRoadmap = buildRoadmapFromQuickWins(mergedQuickWinsTable);

  const sectionNarrativeFromNarrative =
    narrative && typeof narrative === "object"
      ? {
          delight_narrative:
            cleanNarrativeStrings(narrative.section_narrative?.delight_narrative).length
              ? cleanNarrativeStrings(narrative.section_narrative?.delight_narrative)
              : Array.isArray(narrative.per_bucket_notes)
            ? narrative.per_bucket_notes
                .filter((item) => item && typeof item === "object")
                .filter((item) => ["Content (Delight)", "Visual Consistency", "Motion & Microinteractions", "Brand Expression", "Icons & Imagery"].includes(String((item as Record<string, unknown>).bucket || "")))
                .map((item) => String((item as Record<string, unknown>).summary || "").trim())
                .filter(Boolean)
            : sectionNarrativeFallback.delight_narrative,
          impact_narrative:
            cleanNarrativeStrings(narrative.section_narrative?.impact_narrative).length
              ? cleanNarrativeStrings(narrative.section_narrative?.impact_narrative)
              : Array.isArray(narrative.per_bucket_notes)
            ? narrative.per_bucket_notes
                .filter((item) => item && typeof item === "object")
                .filter((item) => !["Content (Impact)", "Content (Delight)", "Typography & Readability", "Visual Consistency", "Brand Expression", "Icons & Imagery", "Color & Contrast", "Keyboard Navigation", "Visual Feedback", "Screen Reader Support"].includes(String((item as Record<string, unknown>).bucket || "")))
                .map((item) => String((item as Record<string, unknown>).summary || "").trim())
                .filter(Boolean)
            : sectionNarrativeFallback.impact_narrative,
          accessibility_narrative:
            cleanNarrativeStrings(narrative.section_narrative?.accessibility_narrative).length
              ? cleanNarrativeStrings(narrative.section_narrative?.accessibility_narrative)
              : Array.isArray(narrative.per_bucket_notes)
            ? narrative.per_bucket_notes
                .filter((item) => item && typeof item === "object")
                .filter((item) => ["Visual Feedback", "Color & Contrast", "Typography & Readability", "Keyboard Navigation", "Screen Reader Support"].includes(String((item as Record<string, unknown>).bucket || "")))
                .map((item) => String((item as Record<string, unknown>).summary || "").trim())
                .filter(Boolean)
            : sectionNarrativeFallback.accessibility_narrative,
        }
      : sectionNarrativeFallback;

  const sectionNarrative = {
    delight_narrative: sectionNarrativeLooksWeak(sectionNarrativeFromNarrative.delight_narrative)
      ? sectionNarrativeFallback.delight_narrative
      : uniqueSemanticList(sectionNarrativeFromNarrative.delight_narrative, 4),
    impact_narrative: sectionNarrativeLooksWeak(sectionNarrativeFromNarrative.impact_narrative)
      ? sectionNarrativeFallback.impact_narrative
      : uniqueSemanticList(sectionNarrativeFromNarrative.impact_narrative, 5),
    accessibility_narrative: sectionNarrativeLooksWeak(sectionNarrativeFromNarrative.accessibility_narrative)
      ? sectionNarrativeFallback.accessibility_narrative
      : uniqueSemanticList(sectionNarrativeFromNarrative.accessibility_narrative, 3),
  };

  const narrativeCompetitorAnalysis =
    narrative && typeof narrative === "object" && narrative.competitor_analysis
      ? narrative.competitor_analysis
      : null;
  const existingCompetitorAnalysis =
    report.competitor_analysis && typeof report.competitor_analysis === "object"
      ? (report.competitor_analysis as Record<string, unknown>)
      : null;

  const mergedCompetitors = strengthenCompetitors(
    narrativeCompetitorAnalysis && Array.isArray(narrativeCompetitorAnalysis.competitors)
      ? mergeCompetitorNarrative(
          narrativeCompetitorAnalysis.competitors,
          existingCompetitorAnalysis?.competitors,
        )
      : existingCompetitorAnalysis?.competitors,
  );

  return {
    ...report,
    narrative,
    competitor_analysis:
      mergedCompetitors.length
        ? {
            competitors_count: mergedCompetitors.length,
            competitors: mergedCompetitors,
            matrix:
              existingCompetitorAnalysis?.matrix ||
              existingCompetitorAnalysis?.competitor_matrix ||
              undefined,
          }
        : report.competitor_analysis,
    quick_wins_table: mergedQuickWinsTable,
    roadmap:
      mergedRoadmap.week_1_2.length || mergedRoadmap.month_1.length || mergedRoadmap.quarter_1.length
        ? mergedRoadmap
        : derivedRoadmap,
    executive_summary:
      executiveSummaryLooksWeak(executiveSummaryFromNarrative)
        ? derivedExecutiveSummary
        : {
            ...derivedExecutiveSummary,
            ...executiveSummaryFromNarrative,
            top_problems: uniqueSemanticList(
              [
                ...((executiveSummaryFromNarrative?.top_problems as string[]) || []),
                ...derivedExecutiveSummary.top_problems,
              ],
              5,
            ),
            top_3_problems: uniqueSemanticList(
              [
                ...((executiveSummaryFromNarrative?.top_3_problems as string[]) || []),
                ...derivedExecutiveSummary.top_3_problems,
              ],
              3,
            ),
            whats_working: uniqueSemanticList(
              [
                ...((executiveSummaryFromNarrative?.whats_working as string[]) || []),
                ...derivedExecutiveSummary.whats_working,
              ],
              4,
            ),
            first_priority: uniqueSemanticList(
              [
                ...((executiveSummaryFromNarrative?.first_priority as string[]) || []),
                ...derivedExecutiveSummary.first_priority,
              ],
              4,
            ),
            top_3_quick_wins: uniqueSemanticList(
              [
                ...((executiveSummaryFromNarrative?.top_3_quick_wins as string[]) || []),
                ...derivedExecutiveSummary.top_3_quick_wins,
              ],
              3,
            ),
          },
    section_narrative: sectionNarrative,
    closing_note:
      (narrative && typeof narrative === "object" && typeof narrative.overall_assessment === "string"
        ? narrative.overall_assessment.trim()
        : "") || report.closing_note,
  };

  return report;
  } catch (error) {
    const message = getErrorMessage(error) || "Finalize failed";
    const onlyResults = args.bucket_results ?? [];
    const safeBucketResults = onlyResults.map((bucket) => {
      const safeBucket = bucket ?? ({} as BucketResult);
      return {
      bucket_name: safeBucket.bucket_name,
      pillar: safeBucket.pillar,
      total_marks: safeBucket.total_marks ?? null,
      max_marks: safeBucket.max_marks ?? null,
      score: safeBucket.score ?? null,
      bucket_status: safeBucket.bucket_status ?? "scoring_unavailable",
      health: safeBucket.health ?? "Not scored",
      risk: safeBucket.risk ?? "Scoring unavailable",
      priority: safeBucket.priority ?? "P0",
      questions: Array.isArray(safeBucket.questions)
        ? safeBucket.questions
            .map((question) => asRecord(question) ?? null)
            .filter((question): question is Record<string, unknown> => Boolean(question))
        : [],
      findings: Array.isArray(safeBucket.findings)
        ? safeBucket.findings.map((item) => asRecord(item) ?? null).filter(Boolean) as Array<Record<string, unknown>>
        : [],
      improvements: Array.isArray(safeBucket.improvements)
        ? safeBucket.improvements.map((item) => asRecord(item) ?? null).filter(Boolean) as Array<Record<string, unknown>>
        : [],
    }}) as BucketResult[];
    const scorecard = safeBucketResults.map((bucket) => ({
      section: bucket.bucket_name,
      score: bucket.score,
      health: bucket.health,
      risk: bucket.risk,
      priority: bucket.priority,
      pillar: bucket.pillar,
    }));
    const quickWins = safeBucketResults.flatMap((bucket) => bucket.improvements || []);
    const allFindings = safeBucketResults.flatMap((bucket) => bucket.findings || []);
    const fallbackExecutiveSummary = deriveExecutiveSummaryFromBuckets({
      bucketResults: safeBucketResults,
      allFindings,
      quickWins,
      scoreEligible: false,
      overallScore: null,
      productName: args.intake.product_name,
    });
    return {
      overall_score: null,
      overall_health: "Scoring unavailable",
      overall_risk: message,
      scorecard,
      p1_buckets: safeBucketResults.filter((bucket) => bucket.priority === "P1").map((bucket) => bucket.bucket_name),
      p2_buckets: safeBucketResults.filter((bucket) => bucket.priority === "P2").map((bucket) => bucket.bucket_name),
      p3_buckets: safeBucketResults.filter((bucket) => bucket.priority === "P3").map((bucket) => bucket.bucket_name),
      p4_buckets: safeBucketResults.filter((bucket) => bucket.priority === "P4").map((bucket) => bucket.bucket_name),
      findings_detailed: allFindings,
      all_findings: allFindings,
      all_improvements: quickWins,
      quick_wins_table: buildQuickWinsTableFromImprovements(quickWins),
      quick_wins: quickWins
        .map((item) => {
          const rec = asRecord(item) ?? {};
          return String(rec.recommendation || rec.observation || rec.question || "").trim();
        })
        .filter(Boolean),
      bucket_results: safeBucketResults,
      audit_mode: "Provisional UX Audit",
      coverage_status: args.evidence?.coverage?.status || "unknown",
      ux_score_eligible: false,
      questions_scoreable: safeBucketResults.reduce(
        (sum, bucket) => sum + bucket.questions.filter((question) => question.answer_status === "answered").length,
        0,
      ),
      questions_total: safeBucketResults.reduce((sum, bucket) => sum + bucket.questions.length, 0),
      capture_coverage: "Low",
      intake: args.intake,
      evidence: args.evidence,
      roadmap: buildRoadmapFromQuickWins(buildQuickWinsTableFromImprovements(quickWins)),
      closing_note:
        "The report hit a finalization issue while assembling the narrative. The underlying bucket results were preserved, and the report can be refreshed once the missing data is normalized.",
      competitor_analysis: {
        competitors_count: 0,
        competitors: [],
        matrix: { columns: [], rows: [] },
      },
      executive_summary: fallbackExecutiveSummary,
      section_narrative: deriveSectionNarrativeFromBuckets(safeBucketResults),
    };
  }
}

export async function runAudit(rawBody: unknown) {
  const parsedBody = (rawBody && typeof rawBody === "object" ? rawBody : {}) as Record<string, unknown>;
  const intake = IntakeSchema.parse(rawBody);

  // Collect evidence once per audit (sync, limited)
  const evidence = await prepareEvidence(intake);
  const modelOverride = typeof parsedBody.modelOverride === "string" && parsedBody.modelOverride.trim()
    ? parsedBody.modelOverride.trim()
    : undefined;

  const buckets = getSelectedBuckets(intake);
  if (!buckets.length) throw new Error("No valid buckets selected.");

  const concurrency = Number(process.env.AUDIT_CONCURRENCY || 3);
  const limit = pLimit(
    Number.isFinite(concurrency) ? Math.max(1, Math.min(5, concurrency)) : 3,
  );

  const bucketResults = await Promise.all(
    buckets.map((bucket) =>
      limit(async () => {
        try {
          const bucketResult = await auditOneBucket({ intake, bucket, evidence, modelOverride });
          return { bucketResult, rawPreview: "ok" };
        } catch (error) {
          return {
            bucketResult: makeFailedBucketResult({
              intake,
              bucket,
              reason: getErrorMessage(error) || "Unexpected bucket scoring failure",
            }),
            rawPreview: "failed",
          };
        }
      }),
    ),
  );

  const onlyResults = bucketResults.map((b) => b.bucketResult);
  const report = await finalizeAudit({
    intake,
    evidence,
    bucket_results: onlyResults,
    modelOverride,
  });
  return { intake, report };
}
