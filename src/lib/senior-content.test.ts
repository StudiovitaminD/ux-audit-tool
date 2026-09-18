import { describe, expect, it } from "vitest";
import { contentOnlyBucketNotes, contextualLabel, industryWritingRules, structureFinding } from "./senior-content";

describe("Phase 4 senior content contract", () => {
  it("uses the visible control name as context", () => {
    expect(contextualLabel({ evidence: "The contact page shows a \"Submit\" button." })).toBe("“Submit” Button");
  });

  it("separates finding fields without removing source data", () => {
    const finding = structureFinding({
      observation: "The checkout does not show field-level errors.",
      consequence: "Shoppers cannot identify what to fix.",
      recommendation: "Add an error beside each invalid field.",
      evidence: "The checkout capture shows red borders only.",
    });
    expect(finding.context_label).toBe("Checkout");
    expect(finding.consequence).toContain("cannot identify");
  });

  it("does not allow writer notes to change canonical scoring", () => {
    const [bucket] = contentOnlyBucketNotes(
      [{ bucket_name: "Visual Feedback", score: 50, questions: [{ id: "A01", mark: 0.5 }] }],
      [{ bucket: "Visual Feedback", score: 100, questions: [], summary: "Polished summary." }],
    );
    expect(bucket.score).toBe(50);
    expect(bucket.questions).toEqual([{ id: "A01", mark: 0.5 }]);
  });

  it("provides distinct product writing rules", () => {
    expect(industryWritingRules("saas").join(" ")).toContain("activation");
    expect(industryWritingRules("ecommerce").join(" ")).toContain("checkout");
  });
});
