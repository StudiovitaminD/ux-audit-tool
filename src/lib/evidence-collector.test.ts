import { describe, expect, it } from "vitest";
import { requiresLiveMeasurementCapture } from "@/lib/evidence-collector";

describe("live measurement capture selection", () => {
  it("starts browser capture when any runtime-dependent bucket is selected", () => {
    for (const bucket of [
      "Visual Feedback",
      "Color & Contrast",
      "Performance",
      "Motion & Microinteractions",
    ]) {
      expect(requiresLiveMeasurementCapture([bucket])).toBe(true);
    }
  });

  it("does not require the extra live probe plan for static-only buckets", () => {
    expect(requiresLiveMeasurementCapture(["Typography & Readability", "Brand Expression"])).toBe(false);
    expect(requiresLiveMeasurementCapture([])).toBe(false);
  });
});
