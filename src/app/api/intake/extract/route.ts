import { NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  transcript: z.string().min(1),
  current: z.unknown().optional(),
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
    "primaryUserGoal",
    "primaryUserIntent",
    "frequencyOfUse",
    "primaryBusinessObjective",
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
      "You are an expert UX researcher helping to fill a UX audit intake form from a meeting transcript.",
      "Return ONLY valid JSON. No markdown, no prose.",
      "If you are unsure about a field, omit it (do NOT guess).",
      "Never return undefined; omit keys instead.",
      "Prefer short strings. For arrays, include only items you are confident about.",
    ].join("\n");

    const user = `Extract as much as possible from this transcript into an intake PATCH object.

Transcript:
${parsedBody.transcript}

Current intake (may be empty; use as context, do not overwrite with blanks):
${JSON.stringify(parsedBody.current ?? {}, null, 2)}

Return JSON with this shape:
{
  "patch": {
    "productName": string,
    "productOneLiner": string,
    "productUrl": string,
    "product": { "type": "saas"|"ecommerce"|"marketing_website", "context": string[] },
    "primaryPlatform": string,
    "productStage": string,
    "auditGoals": string[],
    "auditFlows": string[],
    "selectedBuckets": string[],
    "primaryUser": string,
    "primaryUserGoal": string,
    "primaryUserIntent": string,
    "frequencyOfUse": string,
    "primaryBusinessObjective": string,
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

Important: Only include keys you can fill confidently from the transcript.`;

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

    return NextResponse.json({ patch }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
