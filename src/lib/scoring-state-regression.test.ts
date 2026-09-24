import { describe, expect, it } from "vitest";
import { parseBucketJson } from "./audit-engine";
import { normalizeQuestionAnswer } from "../../shared/ux-audit-scoring";
import { attachEvidenceDepth, buildEvidencePlan } from "./evidence-depth";
import { extensionCapturesToEvidence } from "./evidence-collector";

describe("accessibility scoring regressions", () => {
  it("preserves non-failure zero states and exact model citations", () => {
    for (const state of ["not_tested", "n_a", "fail"]) {
      const parsed = parseBucketJson(JSON.stringify({ questions: [{ id: "VF04", mark: 0, answer_state: state, evidence_ids: ["ev-vf04-form-state-p1"] }] }));
      const restored = normalizeQuestionAnswer(JSON.parse(JSON.stringify(parsed.questions[0])));
      expect(restored.answer_state).toBe(state);
      expect(parsed.questions[0].evidence_ids).toEqual(["ev-vf04-form-state-p1"]);
    }
  });
  it("does not confirm untested or denied forms and prefers real state evidence", () => {
    const bundle = extensionCapturesToEvidence({ productUrl: "https://example.com", auditFlows: [], extensionCaptureJson: JSON.stringify([
      { url: "https://example.com", automatedChecks: { forms: { formCount: 0, testedStates: [] } } },
      { url: "https://example.com/denied", automatedChecks: { forms: { formCount: 1, testedStates: [{ result: "user_denied" }] } } },
    ]) })!;
    const records = attachEvidenceDepth(bundle, buildEvidencePlan(["Visual Feedback"])).evidenceRecords!;
    expect(records.filter((record) => record.kind === "form_state").every((record) => record.status !== "confirmed")).toBe(true);
  });
});
