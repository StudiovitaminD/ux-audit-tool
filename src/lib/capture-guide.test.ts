import { describe, expect, it } from "vitest";
import { parseCaptureDecision, validateCaptureDecision } from "./capture-guide";

describe("capture guide safety", () => {
  const probe = { action: "probe", kind: "motion", reason: "Inspect animation timings" };
  it("accepts fenced JSON and a null optional target", () => {
    expect(parseCaptureDecision(`\u0060\u0060\u0060json\n${JSON.stringify({ ...probe, target: null })}\n\u0060\u0060\u0060`, [], [])).toEqual(probe);
  });
  it("accepts terminal decisions without a probe kind", () => {
    expect(parseCaptureDecision(JSON.stringify({ action: "blocked", reason: "No form found", target: null }), [], []).action).toBe("blocked");
  });
  it("never repairs a missing executable target or unknown action", () => {
    expect(() => parseCaptureDecision(JSON.stringify({ ...probe, action: "focus", target: null }), [{}], [])).toThrow();
    expect(() => parseCaptureDecision(JSON.stringify({ ...probe, action: "submit" }), [], [])).toThrow();
    expect(() => parseCaptureDecision("Incomplete JSON {", [], [])).toThrow();
  });
  it("accepts supported probes", () => {
    expect(validateCaptureDecision(probe, [], [])).toEqual(probe);
  });
  it("blocks repeated actions", () => {
    expect(validateCaptureDecision(probe, [], [{ action: probe }]).action).toBe("blocked");
  });
  it("rejects invented controls", () => {
    expect(() => validateCaptureDecision({ ...probe, action: "focus", target: 2 }, [{}], [])).toThrow();
  });
  it("rejects arbitrary code and submit actions", () => {
    for (const action of ["execute", "submit", "navigate"]) {
      expect(() => validateCaptureDecision({ ...probe, action }, [], [])).toThrow();
    }
  });
  it("allows explicit blocked and completed outcomes", () => {
    for (const action of ["blocked", "complete"]) {
      expect(validateCaptureDecision({ ...probe, action }, [], []).action).toBe(action);
    }
  });
});
