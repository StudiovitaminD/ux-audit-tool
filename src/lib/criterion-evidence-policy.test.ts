import { describe, expect, it } from "vitest";
import { QUESTION_BANK } from "@/lib/question-bank";
import {
  criterionEvidenceKinds,
  isScreenshotScorableCriterion,
  recaptureKindForCriterion,
} from "@/lib/criterion-evidence-policy";

describe("canonical criterion evidence policy", () => {
  it("defines evidence and a follow-up probe for every canonical criterion", () => {
    const questions = Object.entries(QUESTION_BANK).flatMap(([bucket, items]) =>
      items.map((question) => ({ bucket, question })),
    );

    expect(questions).toHaveLength(144);
    for (const { bucket, question } of questions) {
      expect(criterionEvidenceKinds(bucket, question.id, question.question).length).toBeGreaterThan(0);
      expect(recaptureKindForCriterion(bucket, question.id, question.question)).toMatch(
        /^(form|keyboard|responsive|zoom|text_spacing|performance|interaction|motion|visual)$/,
      );
    }
  });

  it("scores static visual criteria without pretending interaction tests are visual", () => {
    expect(isScreenshotScorableCriterion("Brand Expression", "BE01")).toBe(true);
    expect(isScreenshotScorableCriterion("Icons & Imagery", "II10")).toBe(true);
    expect(isScreenshotScorableCriterion("Navigation & Findability", "NF01")).toBe(true);
    expect(isScreenshotScorableCriterion("Visual Feedback", "VF01")).toBe(false);
    expect(isScreenshotScorableCriterion("Typography & Readability", "TR08")).toBe(false);
    expect(isScreenshotScorableCriterion("Content (Delight)", "CD04")).toBe(false);
  });

  it("routes frequently confused criteria to the correct probes", () => {
    expect(criterionEvidenceKinds("Visual Feedback", "VF02", "Loading states")).toContain("interaction");
    expect(criterionEvidenceKinds("Visual Feedback", "VF02", "Loading states")).not.toContain("performance");
    expect(criterionEvidenceKinds("Performance", "PF10", "Layout shift")).toContain("performance");
    expect(criterionEvidenceKinds("Screen Reader Support", "SR09", "Error announcements")).toContain("form_state");
    expect(criterionEvidenceKinds("Navigation & Findability", "NF01", "Primary navigation")).not.toContain("keyboard");
  });
});
