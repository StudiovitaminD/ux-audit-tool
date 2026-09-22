import { describe, expect, it } from "vitest";
import { buildReportViewModel } from "./report-model";

describe("report scorecard normalization", () => {
  it("keeps a tested zero score instead of relabeling it as Not Tested", () => {
    const report = buildReportViewModel({
      product_name: "Example",
      selected_buckets: ["Color & Contrast"],
      intake: { selected_buckets: ["Color & Contrast"] },
      bucket_results: [
        {
          bucket_name: "Color & Contrast",
          pillar: "Accessibility",
          bucket_status: "scored",
          score: 0,
          health: "Critical",
          risk: "High",
          priority: "P1",
          questions: [
            {
              id: "CC01",
              question: "Does body text meet contrast requirements?",
              answer_state: "fail",
              answer_status: "answered",
              mark: 0,
              evidence_ids: ["cc-01"],
              evidence: "The measured contrast ratio is below the threshold.",
              observation: "Body text does not meet the required contrast ratio.",
              recommendation: "Increase the body-text contrast ratio to at least 4.5:1.",
            },
          ],
          findings: [],
        },
      ],
    });

    expect(report.scorecard).toHaveLength(1);
    expect(report.scorecard[0].score).toBe(0);
    expect(report.scorecard[0].bucket_status).toBe("scored");
    expect(report.scorecard[0].health).not.toBe("Not tested");
  });
});
