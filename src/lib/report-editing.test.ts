import { describe, expect, it } from "vitest";
import { updateReportAnswer } from "./report-editing";

function reportWithQuestion() {
  return {
    selected_buckets: ["Visual Feedback"],
    bucket_results: [
      {
        bucket_name: "Visual Feedback",
        pillar: "Accessibility",
        questions: [
          {
            id: "VF01",
            question: "Does the interface provide immediate visible feedback after a user action?",
            answer_status: "insufficient_evidence",
            answer_state: "fail",
            selected_option_state: "fail",
            selected_option: null,
            mark: null,
            selected_option_text: "Fail — Clear evidence shows the criterion is not satisfied",
            observation: "This question cannot be answered because the interaction was not captured.",
            evidence: "The interaction was not captured.",
          },
        ],
      },
    ],
  };
}

function firstQuestion(report: Record<string, unknown>) {
  const buckets = report.bucket_results as Array<{ questions: Array<Record<string, unknown>> }>;
  return buckets[0].questions[0];
}

describe("updateReportAnswer", () => {
  it("stores a manual string selection with its numeric score and matching description", () => {
    const report = updateReportAnswer(reportWithQuestion(), "Visual Feedback", "VF01", "partial");
    const question = firstQuestion(report);

    expect(question.answer_status).toBe("answered");
    expect(question.answer_state).toBe("partial");
    expect(question.selected_option_state).toBe("partial");
    expect(question.selected_option).toBe(0.5);
    expect(question.mark).toBe(0.5);
    expect(question.selected_option_text).toContain("Partial");
    expect(question.observation).not.toContain("cannot be answered");
  });

  it("keeps a manual fail answer as a valid zero score", () => {
    const report = updateReportAnswer(reportWithQuestion(), "Visual Feedback", "VF01", "fail");
    const question = firstQuestion(report);

    expect(question.answer_status).toBe("answered");
    expect(question.answer_state).toBe("fail");
    expect(question.selected_option).toBe(0);
    expect(question.mark).toBe(0);
  });

  it("keeps Not Tested internally consistent", () => {
    const report = updateReportAnswer(reportWithQuestion(), "Visual Feedback", "VF01", "not_tested");
    const question = firstQuestion(report);

    expect(question.answer_status).toBe("insufficient_evidence");
    expect(question.answer_state).toBe("not_tested");
    expect(question.selected_option_state).toBe("not_tested");
    expect(question.selected_option).toBeNull();
    expect(question.mark).toBeNull();
    expect(question.selected_option_text).toContain("Not Tested");
  });
});
