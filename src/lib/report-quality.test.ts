import { describe, expect, it } from "vitest";
import { sanitizeAuditReport } from "./report-quality";

function reportWithFinding(observation: string, evidence: string, recommendation: string) {
  return {
    selected_buckets: ["Icons & Imagery"],
    intake: { selected_buckets: ["Icons & Imagery"] },
    bucket_results: [
      {
        bucket_name: "Icons & Imagery",
        pillar: "Delight",
        questions: [
          {
            id: "D41",
            question: "Do icons maintain a consistent style?",
            answer_state: "fail",
            answer_status: "answered",
            mark: 0,
            evidence_ids: ["icons-D41-p1"],
            evidence,
            observation,
            recommendation,
          },
        ],
        findings: [
          {
            question_id: "D41",
            observation,
            evidence,
            recommendation,
          },
        ],
      },
    ],
  };
}

describe("sanitizeAuditReport findings", () => {
  it("keeps evidence limitations out of critical findings", () => {
    const report = sanitizeAuditReport(
      reportWithFinding(
        "There is no available data to determine whether icons use a coherent visual style.",
        "No captured screenshots were available for icon review.",
        "Capture representative screens before evaluating icon consistency.",
      ),
    );

    expect(report.all_findings).toEqual([]);
    expect(report.testing_limitations).toHaveLength(0);
  });

  it("drops findings whose model output was cut mid-sentence", () => {
    const report = sanitizeAuditReport(
      reportWithFinding(
        "The contact action may cause uncertainty about the action's r",
        "The contact screen shows a generic Submit label.",
        "Rename the button to Send project enquiry so visitors know what happens next.",
      ),
    );

    expect(report.all_findings).toEqual([]);
  });

  it("keeps a complete evidence-backed finding", () => {
    const report = sanitizeAuditReport(
      reportWithFinding(
        "The contact form uses a generic Submit label, which makes the outcome unclear.",
        "The captured contact screen shows a button labelled Submit.",
        "Rename the button to Send project enquiry so visitors know what happens next.",
      ),
    );

    expect(report.all_findings).toHaveLength(1);
  });
});
