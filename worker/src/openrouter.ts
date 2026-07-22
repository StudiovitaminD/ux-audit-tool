import type { WorkerEnv } from "./env.js";

const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4.1-mini";

export async function openRouterChat(env: WorkerEnv, args: { prompt: string; model?: string }) {
  const model = args.model || env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
  const requestedMaxTokens = Number(process.env.OPENROUTER_MAX_TOKENS || 1200);
  const maxTokens = Number.isFinite(requestedMaxTokens)
    ? Math.max(300, Math.min(1200, requestedMaxTokens))
    : 1200;
  const retryAttemptsRaw = Number(process.env.OPENROUTER_RETRY_ATTEMPTS || 3);
  const retryAttempts = Number.isFinite(retryAttemptsRaw)
    ? Math.max(1, Math.min(5, retryAttemptsRaw))
    : 3;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const parseRetryAfterSeconds = (message: string) => {
    const directMatch = message.match(/retry_after_seconds"?\s*:\s*(\d+)/i);
    if (directMatch) return Number(directMatch[1]);
    const textMatch = message.match(/retry after\s+(\d+)\s*seconds?/i);
    if (textMatch) return Number(textMatch[1]);
    return null;
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ux-audit-tool-alpha.vercel.app/",
        "X-Title": "UX Audit Tool",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are an expert UX auditor. Follow instructions strictly and output only valid JSON.",
          },
          { role: "user", content: args.prompt },
        ],
      }),
    });

    if (res.ok) {
      const raw = await res.text();
      if (!raw.trim()) throw new Error("OpenRouter returned empty response body");
      const data = JSON.parse(raw) as any;
      return String(data?.choices?.[0]?.message?.content ?? raw);
    }

    const text = await res.text().catch(() => "");
    lastError = new Error(`OpenRouter error (${res.status}): ${text}`);
    const message = lastError.message.toLowerCase();
    const retryAfterSeconds = parseRetryAfterSeconds(lastError.message);
    const retryable =
      res.status === 429 ||
      res.status === 500 ||
      res.status === 502 ||
      res.status === 503 ||
      res.status === 504 ||
      message.includes("rate-limit") ||
      message.includes("temporarily rate-limited");

    if (!retryable || attempt === retryAttempts) {
      throw lastError;
    }

    const backoffMs =
      retryAfterSeconds && Number.isFinite(retryAfterSeconds)
        ? Math.max(1000, Math.min(30000, retryAfterSeconds * 1000))
        : Math.min(15000, 1500 * attempt);
    await sleep(backoffMs);
  }

  throw lastError || new Error("OpenRouter request failed");
}
