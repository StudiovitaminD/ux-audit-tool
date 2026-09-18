import { describe, expect, it } from "vitest";
import { attachEvidenceDepth, buildEvidencePlan, evidenceConfidence } from "./evidence-depth";
import type { EvidenceBundle } from "./evidence-collector";

describe("Phase 2 evidence depth", () => {
  it("registers a valid uploaded screenshot as confirmed visual evidence", () => {
    const bundle = {
      pages: [],
      screenshotDataUrl: null,
      screenshots: [
        {
          url: "https://cdn.example.com/home.png",
          label: "Homepage",
          isValidAuditEvidence: true,
          capturedAt: "2026-09-18T12:00:00.000Z",
          visibleTextSummary: "Hero heading and primary call to action are visible.",
        },
      ],
      warnings: [],
      visitedFlows: [],
    } as EvidenceBundle;
    const plan = buildEvidencePlan(["Visual Feedback"]);
    const result = attachEvidenceDepth(bundle, plan);
    const screenshotRecord = result.evidenceRecords?.find((record) => record.kind === "screenshot");

    expect(screenshotRecord?.status).toBe("confirmed");
    expect(screenshotRecord?.testMethod).toBe("visual_capture");
    expect(evidenceConfidence([screenshotRecord!])).toBe(0.75);
  });
});
