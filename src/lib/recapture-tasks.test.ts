import { describe, expect, it } from "vitest";
import { buildRecaptureTasks, recaptureAffectedBuckets } from "./recapture-tasks";

describe("targeted evidence recapture", () => {
  it("targets an existing contact page rather than the homepage for a form question", () => {
    const tasks = buildRecaptureTasks({ productUrl: "https://example.com", pageUrls: ["https://example.com/", "https://example.com/contact"],
      bucketResults: [{ bucket_name: "Visual Feedback", questions: [{ id: "VF03", question: "Duplicate submissions?", answer_state: "not_tested" }] }],
    });
    expect(tasks[0].targetUrl).toBe("https://example.com/contact");
    expect(tasks[0].requiresPermission).toBe(true);
  });
  it("creates tasks only for unresolved questions and flags forms for permission", () => {
    const tasks = buildRecaptureTasks({
      productUrl: "https://example.com",
      bucketResults: [{
        bucket_name: "Visual Feedback",
        questions: [
          { id: "VF01", question: "Is feedback visible?", answer_state: "pass", answer_status: "answered" },
          { id: "VF09", question: "Are errors clearly identified near the relevant field?", answer_state: "not_tested", answer_status: "insufficient_evidence" },
        ],
      }],
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ questionId: "VF09", kind: "form", requiresPermission: true });
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
      bucketResults: [
        {
          bucket_name: "Typography & Readability",
          questions: [
            { id: "TR08", question: "Does text remain usable when users zoom to 200%?", answer_state: "not_tested" },
            { id: "TR09", question: "Does increased text spacing avoid clipping?", answer_state: "not_tested" },
          ],
        },
        {
          bucket_name: "Performance",
          questions: [{ id: "PF01", question: "Does meaningful page content load in reasonable time?", answer_state: "not_tested" }],
        },
        {
          bucket_name: "Motion & Microinteractions",
          questions: [{ id: "MM03", question: "Are animations smooth and non-disruptive?", answer_state: "not_tested" }],
        },
      ],
    });
    expect(tasks.map((task) => task.kind)).toEqual(["zoom", "text_spacing", "performance", "motion"]);
  });
});
