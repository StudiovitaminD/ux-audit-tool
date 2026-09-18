import { describe, expect, it } from "vitest";
import { buildEvidenceAppendix } from "./report-client-readiness";
import { exportReadinessResponse } from "./report-quality";

describe("Phase 3 client-ready reporting", () => {
  const report = {
    selected_buckets: ["Visual Feedback"],
    bucket_results: [
      {
        bucket_name: "Visual Feedback",
        questions: [
          {
            id: "VF01",
            question: "Does the interface provide immediate visible feedback after a user action?",
            answer_state: "pass",
            mark: 1,
            evidence: "The action displays a visible confirmation.",
            observation: "Confirmation appears after activation.",
            confidence: 0.9,
            evidence_ids: ["ev-vf01-dom-p1", "ev-vf01-screenshot-p1"],
          },
        ],
        findings: [],
      },
    ],
    evidence_registry: [
      {
        evidenceId: "ev-vf01-dom-p1",
        bucketId: "Visual Feedback",
        questionId: "VF01",
        pageUrl: "https://example.com",
        viewport: "desktop",
        testMethod: "deterministic_browser_measurement",
        observedAt: "2026-09-18T12:00:00.000Z",
        status: "confirmed",
        observation: "A status region was found.",
        measuredValues: { statusRegions: 1 },
      },
      {
        evidenceId: "ev-vf01-screenshot-p1",
        bucketId: "Visual Feedback",
        questionId: "VF01",
        pageUrl: "https://example.com",
        viewport: "desktop",
        testMethod: "visual_capture",
        observedAt: "2026-09-18T12:00:00.000Z",
        status: "confirmed",
        observation: "The confirmation is visible in the captured state.",
      },
    ],
  };

  it("keeps every cited evidence item with provenance", () => {
    const appendix = buildEvidenceAppendix(report);
    expect(appendix).toHaveLength(2);
    expect(appendix[0].sourceUrl).toBe("https://example.com");
    expect(appendix.some((item) => item.measuredValues.statusRegions === 1)).toBe(true);
  });

  it("allows export while recording the QA state", () => {
    const readiness = exportReadinessResponse(report);
    const manifest = readiness.report.export_manifest as Record<string, unknown>;
    expect(readiness.exportReady).toBe(true);
    expect(manifest.pipeline_phase).toBe(5);
    expect(["passed", "exported_with_issues"]).toContain(manifest.qa_status);
  });
});
