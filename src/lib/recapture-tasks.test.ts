import { describe, expect, it } from "vitest";
import { buildRecaptureTasks, recaptureAffectedBuckets } from "./recapture-tasks";

describe("targeted evidence recapture", () => {
  it("creates tasks only for unresolved questions and flags forms for permission", () => {
    const tasks = buildRecaptureTasks({
      productUrl: "https://example.com",
      bucketResults: [{
        bucket_name: "Visual Feedback",
        questions: [
          { id: "VF01", question: "Is feedback visible?", answer_state: "pass", answer_status: "answered" },
          { id: "VF02", question: "Do form errors explain how to recover?", answer_state: "not_tested", answer_status: "insufficient_evidence" },
        ],
      }],
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ questionId: "VF02", kind: "form", requiresPermission: true });
    expect(recaptureAffectedBuckets(tasks)).toEqual(["Visual Feedback"]);
  });

  it("distributes follow-up tasks across captured pages", () => {
    const tasks = buildRecaptureTasks({
      productUrl: "https://example.com",
      pageUrls: ["https://example.com/", "https://example.com/contact"],
      bucketResults: [{
        bucket_name: "Visual Feedback",
        questions: [
          { id: "VF01", question: "Is feedback visible?", answer_state: "not_tested" },
          { id: "VF02", question: "Are errors clear?", answer_state: "not_tested" },
        ],
      }],
    });
    expect(tasks.map((task) => task.targetUrl)).toEqual([
      "https://example.com/",
      "https://example.com/contact",
    ]);
  });

  it("creates specialized probes for evidence that screenshots cannot establish", () => {
    const tasks = buildRecaptureTasks({
      productUrl: "https://example.com",
      bucketResults: [{
        bucket_name: "Audit",
        questions: [
          { id: "T01", question: "Does text remain usable when users zoom to 200%?", answer_state: "not_tested" },
          { id: "T02", question: "Does increased text spacing avoid clipping?", answer_state: "not_tested" },
          { id: "P01", question: "Does meaningful page content load in reasonable time?", answer_state: "not_tested" },
          { id: "M01", question: "Are animations smooth and non-disruptive?", answer_state: "not_tested" },
        ],
      }],
    });
    expect(tasks.map((task) => task.kind)).toEqual(["zoom", "text_spacing", "performance", "motion"]);
  });
});
