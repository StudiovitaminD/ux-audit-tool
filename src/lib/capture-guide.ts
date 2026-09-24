import { z } from "zod";

export const CaptureDecision = z.object({
  action: z.enum(["probe", "focus", "scroll", "complete", "blocked"]),
  kind: z.enum(["visual", "keyboard", "responsive", "zoom", "text_spacing", "performance", "motion", "interaction", "form"]),
  target: z.number().int().min(0).max(39).optional(),
  reason: z.string().min(1).max(500),
});

export function validateCaptureDecision(value: unknown, controls: unknown[], history: Array<{ action?: unknown }>) {
  const decision = CaptureDecision.parse(value);
  if (["focus", "scroll"].includes(decision.action) && (decision.target === undefined || decision.target >= controls.length)) {
    throw new Error("The guide selected a control that is not present.");
  }
  const key = JSON.stringify([decision.action, decision.kind, decision.target ?? null]);
  if (history.some((entry) => {
    const previous = CaptureDecision.safeParse(entry.action);
    return previous.success && JSON.stringify([previous.data.action, previous.data.kind, previous.data.target ?? null]) === key;
  }) && !["complete", "blocked"].includes(decision.action)) {
    return { ...decision, action: "blocked" as const, reason: "Stopped because the guide repeated an action without resolving the question." };
  }
  return decision;
}
