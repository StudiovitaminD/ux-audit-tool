import { describe, expect, it } from "vitest";
import { validateCaptureDecision } from "./capture-guide";

describe("capture guide safety", () => {
  const probe = { action: "probe", kind: "motion", reason: "Inspect animation timings" };
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
