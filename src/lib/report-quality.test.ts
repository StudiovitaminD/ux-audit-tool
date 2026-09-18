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

  it("drops no-evidence statements phrased as captured evidence", () => {
    const report = sanitizeAuditReport(
      reportWithFinding(
        "No evidence was captured to determine if animation or motion serves a clear purpose.",
        "No animation evidence was captured.",
        "Capture an interaction before assessing its motion behavior.",
      ),
    );

    expect(report.all_findings).toEqual([]);
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

  it("keeps only one signal when findings describe the same problem", () => {
    const report = reportWithFinding(
      "Button hierarchy is inconsistent across pages, making primary actions unclear.",
      "The captured home and contact screens use competing button treatments.",
      "Standardize the primary button treatment across pages.",
    );
    const bucket = report.bucket_results[0];
    bucket.questions.push({
      id: "D42",
      question: "Are primary actions visually consistent?",
      answer_state: "fail",
      answer_status: "answered",
      mark: 0,
      evidence_ids: ["icons-D42-p2"],
      evidence: "The captured pages show different styles for equivalent primary actions.",
      observation: "Inconsistent button hierarchy across pages makes primary actions difficult to identify.",
      recommendation: "Use one primary button style throughout the product.",
    });
    bucket.findings.push({
      question_id: "D42",
      observation: "Inconsistent button hierarchy across pages makes primary actions difficult to identify.",
      evidence: "The captured pages show different styles for equivalent primary actions.",
      recommendation: "Use one primary button style throughout the product.",
    });

    const sanitized = sanitizeAuditReport(report);

    expect(sanitized.all_findings).toHaveLength(1);
  });
});
