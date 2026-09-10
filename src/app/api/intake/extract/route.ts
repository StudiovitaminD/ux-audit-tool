import { NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  transcript: z.string().optional(),
  websiteUrl: z.string().url().optional(),
  current: z.unknown().optional(),
}).refine((body) => Boolean(body.transcript?.trim() || body.websiteUrl), {
  message: "Provide a transcript or website URL",
});

function safeJsonParse<T>(raw: string): T | null {
  const txt = String(raw || "").trim();
  if (!txt) return null;
  try {
    return JSON.parse(txt) as T;
  } catch {}
  const unfenced = txt
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  if (unfenced !== txt) {
    try {
      return JSON.parse(unfenced) as T;
    } catch {}
  }
  try {
    const start = txt.indexOf("{");
    const end = txt.lastIndexOf("}");
    const match = start >= 0 && end > start ? txt.slice(start, end + 1) : "";
    if (match) return JSON.parse(match) as T;
  } catch {}
  try {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    const match = start >= 0 && end > start ? unfenced.slice(start, end + 1) : "";
    if (match) return JSON.parse(match) as T;
  } catch {}
  return null;
}

function normalizePatchCandidate(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  if (rec.patch && typeof rec.patch === "object" && !Array.isArray(rec.patch)) {
    return rec.patch as Record<string, unknown>;
  }
  const directKeys = [
    "productName",
    "productOneLiner",
    "productUrl",
    "product",
    "primaryPlatform",
    "productStage",
    "auditGoals",
    "auditFlows",
    "selectedBuckets",
    "primaryUser",
    "userAge",
    "userGender",
    "userLanguage",
    "userGeography",
    "primaryUserGoal",
    "primaryUserIntent",
    "frequencyOfUse",
    "primaryBusinessObjective",
    "businessFutureGoals",
    "businessCompetitors",
    "competitors",
    "differentiation",
    "knownProblem",
    "constraints",
    "whoImplements",
    "successMetric",
    "auth",
    "artifacts",
  ];
  if (directKeys.some((key) => key in rec)) return rec;
  return null;
}

function normalizeIntakePatch(patch: Record<string, unknown>) {
  const normalized = { ...patch };
  const productTypeAliases: Record<string, string> = {
    saas: "saas",
    "software as a service": "saas",
    ecommerce: "ecommerce",
    "e-commerce": "ecommerce",
    marketing: "marketing_website",
    website: "marketing_website",
    marketing_website: "marketing_website",
    "marketing website": "marketing_website",
  };
  const platformAliases: Record<string, string> = {
    desktop: "desktop",
    web: "desktop",
    website: "desktop",
    mobile: "mobile_web",
    mobile_web: "mobile_web",
    "mobile web": "mobile_web",
    both: "desktop_and_mobile_web",
    desktop_and_mobile_web: "desktop_and_mobile_web",
    "desktop and mobile": "desktop_and_mobile_web",
    "desktop + mobile": "desktop_and_mobile_web",
  };
  if (typeof normalized.primaryPlatform === "string") {
    const platform = platformAliases[normalized.primaryPlatform.trim().toLowerCase()];
    if (platform) normalized.primaryPlatform = platform;
    else delete normalized.primaryPlatform;
  }
  if (normalized.product && typeof normalized.product === "object" && !Array.isArray(normalized.product)) {
    const product = { ...(normalized.product as Record<string, unknown>) };
    if (typeof product.type === "string") {
      const type = productTypeAliases[product.type.trim().toLowerCase()];
      if (type) product.type = type;
      else delete product.type;
    }
    normalized.product = product;
  }
  const genderAliases: Record<string, string> = {
    women: "women",
    woman: "women",
    female: "women",
    men: "men",
    man: "men",
    male: "men",
    both: "both",
    all: "both",
    "all genders": "both",
  };
  if (typeof normalized.userGender === "string") {
    const gender = genderAliases[normalized.userGender.trim().toLowerCase()];
    if (gender) normalized.userGender = gender;
    else delete normalized.userGender;
  }
  const personaPlatformAliases: Record<string, string> = {
    desktop: "desktop",
    web: "desktop",
    mobile: "mobile",
    mobile_web: "mobile",
    both: "both",
    desktop_and_mobile_web: "both",
    "desktop and mobile": "both",
  };
  if (typeof normalized.primaryUserIntent === "string") {
    const platform = personaPlatformAliases[normalized.primaryUserIntent.trim().toLowerCase()];
    if (platform) normalized.primaryUserIntent = platform;
    else delete normalized.primaryUserIntent;
  }
  const competitorSource = Array.isArray(normalized.businessCompetitors)
    ? normalized.businessCompetitors
    : Array.isArray(normalized.competitors)
      ? normalized.competitors
      : null;
  if (competitorSource) {
    const businessCompetitors = competitorSource
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const competitor = item as Record<string, unknown>;
        return {
          name: typeof competitor.name === "string" ? competitor.name.trim() : "",
          url: typeof competitor.url === "string" ? competitor.url.trim() : "",
          compareFocus:
            typeof competitor.compareFocus === "string"
              ? competitor.compareFocus.trim()
              : typeof competitor.compare_focus === "string"
                ? competitor.compare_focus.trim()
                : "",
        };
      })
      .filter((item): item is { name: string; url: string; compareFocus: string } => Boolean(item?.name || item?.url));
    if (businessCompetitors.length) normalized.businessCompetitors = businessCompetitors;
  }
  return normalized;
}

function extractOpenRouterContent(raw: string): string {
  const parsed = safeJsonParse<Record<string, unknown>>(raw);
  if (!parsed || typeof parsed !== "object") return raw;
  const choices = parsed.choices;
  const first =
    Array.isArray(choices) && choices[0] && typeof choices[0] === "object"
      ? (choices[0] as Record<string, unknown>)
      : null;
  const message =
    first?.message && typeof first.message === "object"
      ? (first.message as Record<string, unknown>)
      : null;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        const rec = item as Record<string, unknown>;
        if (typeof rec.text === "string") return rec.text;
        if (typeof rec.content === "string") return rec.content;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text;
  }
  if (typeof first?.text === "string") return first.text;
  return raw;
}

export async function POST(req: Request) {
  try {
    const parsedBody = BodySchema.parse(await req.json());
    let sourceText = parsedBody.transcript?.trim() || "";
    if (!sourceText && parsedBody.websiteUrl) {
      const page = await fetch(parsedBody.websiteUrl, {
        headers: { "User-Agent": "UX Audit Tool intake reader" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!page.ok) throw new Error(`Could not read website (${page.status})`);
      const html = await page.text();
      sourceText = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 30_000);
    }
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENROUTER_API_KEY env var" },
        { status: 500 },
      );
    }

    const model =
      process.env.OPENROUTER_INTAKE_MODEL ||
      process.env.OPENROUTER_MODEL ||
      "openrouter/owl-alpha";
    const normalizedModel = model.trim().toLowerCase();
    const supportsStructuredOutput =
      normalizedModel !== "openrouter/owl-alpha" &&
      !normalizedModel.includes(":free") &&
      !normalizedModel.includes("nvidia/nemotron") &&
      !normalizedModel.includes("gpt-oss");

    const system = [
      "You are an expert UX researcher helping to fill a UX audit intake form from a transcript or product website.",
      "Return ONLY valid JSON. No markdown, no prose.",
      "Infer every required intake field from the source when it is not stated explicitly. Do not leave required product, business, persona, or competitor fields blank.",
      "Never return undefined; omit keys instead.",
      "Prefer short strings. For arrays, include only items you are confident about.",
    ].join("\n");

    const user = `Extract as much as possible from this source into an intake PATCH object.

Source:
${sourceText}

Current intake (may be empty; use as context, do not overwrite with blanks):
${JSON.stringify(parsedBody.current ?? {}, null, 2)}

Return JSON with this shape:
{
  "patch": {
    "productName": string,
    "productOneLiner": string,
    "productUrl": string,
    "product": { "type": "saas"|"ecommerce"|"marketing_website", "context": string[] },
    "primaryPlatform": "desktop"|"mobile_web"|"desktop_and_mobile_web",
    "productStage": string,
    "auditGoals": string[],
    "auditFlows": string[],
    "selectedBuckets": string[],
    "primaryUser": string,
    "userAge": string,
    "userGender": "women"|"men"|"both",
    "userLanguage": string,
    "userGeography": string,
    "primaryUserGoal": string,
    "primaryUserIntent": "desktop"|"mobile"|"both",
    "frequencyOfUse": string,
    "primaryBusinessObjective": string,
    "businessFutureGoals": string,
    "businessCompetitors": [{ "name": string, "url": string, "compareFocus": string }],
    "competitors": [{ "name": string, "url": string }],
    "differentiation": string,
    "knownProblem": string,
    "constraints": string,
    "whoImplements": string,
    "successMetric": string,
    "auth": { "requiresLogin": boolean, "usernameOrEmail": string, "password": string },
    "artifacts": { "notes": string }
  }
}

Important:
- Always fill productName, productOneLiner, product.type, primaryPlatform, auditGoals, and knownProblem. Use only desktop, mobile_web, or desktop_and_mobile_web for primaryPlatform.
- Always select relevant selectedBuckets values using only these exact names: Visual Feedback, Color & Contrast, Typography & Readability, Keyboard Navigation, Screen Reader Support, Navigation & Findability, Consistency & UI Patterns, Content (Impact), Performance, Visual Consistency, Motion & Microinteractions, Content (Delight), Brand Expression, Icons & Imagery. Never return an empty selectedBuckets array.
- The knownProblem field is displayed as "About the product". Write 1 to 3 plain, neutral sentences describing what the product offers, who it serves, and its main value. Do not write a UX problem, criticism, recommendation, vague challenge, or phrase beginning with "Complexity in".
- productOneLiner must be one concise factual sentence describing the product, not an audit finding.
- Always fill all Business Details fields: differentiation with the product's clear USPs, primaryBusinessObjective with the main measurable business objective, and businessFutureGoals with sensible next-stage goals. Replace meaningless existing values such as one-word fragments. Keep inferred goals concise and do not present them as confirmed plans.
- Always suggest 2 to 3 relevant direct competitors for businessCompetitors, even when the source does not name them. Infer them from the product name, category, audience, and offering. Use each competitor's real public homepage URL, not a guessed internal page. Add a short compareFocus explaining what the user should compare, such as navigation, content, trust, features, or visual design.
- Always fill the primary user persona fields: primaryUser, userAge, userGender, userLanguage, userGeography, primaryUserGoal, and primaryUserIntent. Infer a reasonable primary audience from the website content when it is not explicitly stated. Use only women, men, or both for userGender. Use only desktop, mobile, or both for primaryUserIntent.
- Do not invent login credentials or private information. For optional fields not covered above, omit values you cannot support.`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "UX Audit Tool - Intake Extract",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 1500,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(supportsStructuredOutput ? { response_format: { type: "json_object" } } : {}),
        ...(normalizedModel.includes(":free") ||
        normalizedModel.includes("nvidia/nemotron") ||
        normalizedModel.includes("gpt-oss")
          ? {
              include_reasoning: false,
              reasoning: {
                exclude: true,
                effort: "none",
              },
              reasoning_effort: "none",
            }
          : {}),
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: `OpenRouter error (${res.status})`, detail: raw.slice(0, 2000) },
        { status: 502 },
      );
    }
    if (!raw.trim()) {
      return NextResponse.json(
        { error: "OpenRouter returned empty response body" },
        { status: 502 },
      );
    }

    const content = extractOpenRouterContent(raw);
    const parsed = safeJsonParse<unknown>(content) ?? safeJsonParse<unknown>(raw);
    const patch = normalizePatchCandidate(parsed) ?? normalizePatchCandidate(safeJsonParse<unknown>(content));

    if (!patch) {
      return NextResponse.json(
        { error: "Could not parse model response", raw: raw.slice(0, 2000) },
        { status: 502 },
      );
    }

    return NextResponse.json({ patch: normalizeIntakePatch(patch) }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
