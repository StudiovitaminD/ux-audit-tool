import { describe, expect, it } from "vitest";
import { QUESTION_BANK } from "./question-bank";
import {
  isBlockingCoverageStatus,
  sanitizeAuditReport,
  validateReportQuality,
} from "./report-quality";
import { scoreQuestions } from "../../shared/ux-audit-scoring";

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
    expect((report.all_findings as Array<Record<string, unknown>>)[0].context_label).toBe("Contact Form");
    expect((report.all_findings as Array<Record<string, unknown>>)[0]).toHaveProperty("consequence");
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

describe("Phase 1 report contracts", () => {
  it("publishes limited capture coverage as provisional instead of blocking it", () => {
    expect(isBlockingCoverageStatus("limited_coverage")).toBe(false);
    expect(isBlockingCoverageStatus("usable_coverage")).toBe(false);
    expect(isBlockingCoverageStatus("insufficient_coverage")).toBe(true);
    expect(isBlockingCoverageStatus("failed_login")).toBe(true);
    expect(isBlockingCoverageStatus("criteria_coverage_insufficient")).toBe(true);
  });

  it("allows a provisional report when at least 40 percent of selected criteria are tested", () => {
    const questions = QUESTION_BANK["Icons & Imagery"].map((question, index) => ({
      id: question.id,
      question: question.question,
      answer_state: index < 5 ? "pass" : "not_tested",
      answer_status: index < 5 ? "answered" : "insufficient_evidence",
      mark: index < 5 ? 1 : 0,
      evidence_ids: index < 5 ? [`ev-${question.id}`] : [],
      evidence: index < 5 ? "Captured browser evidence supports this criterion." : "The required state was not captured.",
      observation: index < 5 ? "The inspected component satisfies the criterion." : "The criterion could not be evaluated.",
      recommendation: "",
    }));
    const scoring = scoreQuestions(questions);
    const quality = validateReportQuality({
      selected_buckets: ["Icons & Imagery"],
      bucket_results: [{
        bucket_name: "Icons & Imagery",
        score: scoring.score === null ? null : Math.round(scoring.score),
        questions,
        findings: [],
      }],
    });

    expect(quality.errors.some((issue) => issue.code === "INSUFFICIENT_REPORT_COVERAGE")).toBe(false);
  });

  it("allows the 88 of 114 coverage level shown by the extension follow-up", () => {
    const questions = Array.from({ length: 114 }, (_, index) => ({
      id: `Q${index + 1}`,
      answer_state: index < 88 ? "pass" : "not_tested",
      answer_status: index < 88 ? "answered" : "insufficient_evidence",
      mark: index < 88 ? 1 : 0,
      evidence_ids: index < 88 ? [`ev-${index + 1}`] : [],
      evidence: index < 88 ? "Verified extension evidence." : "The required state was not captured.",
      observation: index < 88 ? "The criterion was verified." : "The criterion could not be evaluated.",
      recommendation: "",
    }));
    const quality = validateReportQuality({
      selected_buckets: ["Visual Feedback"],
      bucket_results: [{ bucket_name: "Visual Feedback", questions, findings: [] }],
    });

    expect(quality.errors.some((issue) => issue.code === "INSUFFICIENT_REPORT_COVERAGE")).toBe(false);
  });

  it("rejects reports that test less than half of a selected bucket", () => {
    const incompleteReport = reportWithFinding(
      "The contact form uses a generic Submit label, which makes the outcome unclear.",
      "The captured contact screen shows a button labelled Submit.",
      "Rename the button to Send project enquiry so visitors know what happens next.",
    );
    incompleteReport.bucket_results[0].questions.push(
      ...QUESTION_BANK["Icons & Imagery"]
        .filter((question) => question.id !== "D41")
        .map((question) => ({
          id: question.id,
          question: question.question,
          answer_state: "not_tested",
          answer_status: "insufficient_evidence",
          mark: 0,
          evidence_ids: [],
          evidence: "The required screen or state was not captured.",
          observation: "The criterion could not be evaluated from the available evidence.",
          recommendation: "",
        })),
    );

    const report = sanitizeAuditReport(incompleteReport);
    const quality = report.report_quality as ReturnType<typeof validateReportQuality>;
    expect(quality.warnings.some((issue) => issue.code === "INSUFFICIENT_BUCKET_COVERAGE")).toBe(true);
    expect(quality.errors.some((issue) => issue.code === "INSUFFICIENT_REPORT_COVERAGE")).toBe(true);
  });

  it("rejects duplicate buckets and unknown questions", () => {
    const bucket = {
      bucket_name: "Visual Feedback",
      questions: [{ id: "MADE_UP", answer_state: "fail", mark: 0, evidence: "Captured evidence.", evidence_ids: ["ev-1"] }],
      findings: [],
    };
    const quality = validateReportQuality({
      selected_buckets: ["Visual Feedback"],
      bucket_results: [bucket, bucket],
    });

    expect(quality.errors.some((issue) => issue.code === "DUPLICATE_BUCKET")).toBe(true);
    expect(quality.errors.some((issue) => issue.code === "UNKNOWN_QUESTION")).toBe(true);
  });

  it("rejects an evidence ID registered to another question", () => {
    const report: Record<string, unknown> = reportWithFinding(
      "The contact form uses a generic Submit label, which makes the outcome unclear.",
      "The captured contact screen shows a button labelled Submit.",
      "Rename the button to Send project enquiry so visitors know what happens next.",
    );
    report.evidence_registry = [
      {
        evidenceId: "icons-D41-p1",
        bucketId: "Icons & Imagery",
        questionId: "D42",
        status: "confirmed",
      },
    ];

    const quality = validateReportQuality(report);
    expect(quality.errors.some((issue) => issue.code === "MISMATCHED_EVIDENCE_REFERENCE")).toBe(true);
  });
});
