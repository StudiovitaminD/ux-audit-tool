import { describe, expect, it } from "vitest";
import { criterionEvidencePacket } from "./audit-engine";
import { extensionCapturesToEvidence } from "./evidence-collector";
import { attachEvidenceDepth, buildEvidencePlan } from "./evidence-depth";
import { QUESTION_BANK } from "./question-bank";

describe("extension evidence reaches GPT", () => {
  it("places extension measurements and evidence IDs in the criterion prompt packet", () => {
    const selectedBuckets = ["Color & Contrast", "Performance"];
    const rawEvidence = extensionCapturesToEvidence({
      productUrl: "https://example.com",
      auditFlows: [],
      extensionCaptureJson: JSON.stringify([
        {
          url: "https://example.com",
          title: "Homepage",
          viewport: "desktop",
          headings: ["Example"],
          visibleText: "Example homepage",
          automatedChecks: {
            contrast: { testedCount: 20, lowContrastSamples: [{ text: "Muted link", ratio: 3.2 }] },
            performance: { domContentLoadedMs: 410, loadMs: 680, resourceCount: 24, transferBytes: 180000 },
            responsive: { horizontalOverflow: false, documentWidth: 1280, viewportWidth: 1280 },
          },
        },
      ]),
    });
    expect(rawEvidence).not.toBeNull();

    const evidence = attachEvidenceDepth(rawEvidence!, buildEvidencePlan(selectedBuckets));
    const contrastPacket = criterionEvidencePacket(
      evidence,
      "Color & Contrast",
      QUESTION_BANK["Color & Contrast"],
    );
    const performancePacket = criterionEvidencePacket(
      evidence,
      "Performance",
      QUESTION_BANK.Performance,
    );

    expect(contrastPacket).toContain("visible text samples checked");
    expect(contrastPacket).toContain("ev-");
    expect(contrastPacket).toContain("contrast | confirmed");
    expect(performancePacket).toContain("Navigation 410ms; load 680ms; 24 resources.");
    expect(performancePacket).toContain("performance | confirmed");
  });
});
