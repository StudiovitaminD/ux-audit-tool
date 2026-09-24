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

  it("treats confirmed captures as scoreable for visual Delight criteria only", () => {
    const evidence = attachEvidenceDepth({
      pages: [{
        url: "https://example.com",
        title: "Homepage",
        h1: ["Example"], h2: [], h3: [], topNavLinks: [], textSnippet: "Distinctive brand copy",
      }],
      screenshotDataUrl: "https://cdn.example.com/home.png",
      screenshots: [{
        url: "https://cdn.example.com/home.png",
        label: "Homepage",
        isValidAuditEvidence: true,
      }],
      warnings: [],
      visitedFlows: [],
    }, buildEvidencePlan(["Brand Expression", "Content (Delight)"]));
    const brandQuestion = QUESTION_BANK["Brand Expression"][0];
    const errorQuestion = QUESTION_BANK["Content (Delight)"].find((question) => /error and sensitive/i.test(question.question))!;

    expect(criterionEvidencePacket(evidence, "Brand Expression", [brandQuestion]))
      .toContain("VISUALLY_SCOREABLE");
    expect(criterionEvidencePacket(evidence, "Content (Delight)", [errorQuestion]))
      .not.toContain("VISUALLY_SCOREABLE");
  });

  it("does not overclaim a generic measurement for a different criterion", () => {
    const rawEvidence = extensionCapturesToEvidence({
      productUrl: "https://example.com",
      auditFlows: [],
      extensionCaptureJson: JSON.stringify([{
        url: "https://example.com",
        title: "Homepage",
        screenshotUrl: "data:image/png;base64,AAAA",
        automatedChecks: {
          contrast: { testedCount: 12, lowContrastSamples: [] },
        },
      }]),
    })!;
    const evidence = attachEvidenceDepth(rawEvidence, buildEvidencePlan(["Color & Contrast"]));
    const normalText = QUESTION_BANK["Color & Contrast"].find((question) => question.id === "CC01")!;
    const focusContrast = QUESTION_BANK["Color & Contrast"].find((question) => question.id === "CC04")!;

    expect(criterionEvidencePacket(evidence, "Color & Contrast", [normalText]))
      .toContain("DETERMINISTICALLY_SCOREABLE");
    expect(criterionEvidencePacket(evidence, "Color & Contrast", [focusContrast]))
      .not.toContain("DETERMINISTICALLY_SCOREABLE");
  });

  it("marks visible feedback, brand, icon, and observable motion criteria as screenshot scoreable", () => {
    const rawEvidence = extensionCapturesToEvidence({
      productUrl: "https://example.com",
      auditFlows: [],
      extensionCaptureJson: JSON.stringify([{
        url: "https://example.com",
        title: "Homepage",
        screenshotUrl: "data:image/png;base64,AAAA",
      }]),
    })!;
    const evidence = attachEvidenceDepth(rawEvidence, buildEvidencePlan([
      "Visual Feedback",
      "Brand Expression",
      "Icons & Imagery",
      "Motion & Microinteractions",
    ]));
    const visibleFeedback = QUESTION_BANK["Visual Feedback"].find((question) => question.id === "VF04")!;
    const duplicatePrevention = QUESTION_BANK["Visual Feedback"].find((question) => question.id === "VF03")!;
    const brand = QUESTION_BANK["Brand Expression"][0];
    const icons = QUESTION_BANK["Icons & Imagery"][0];
    const motion = QUESTION_BANK["Motion & Microinteractions"].find((question) => question.id === "MM05")!;

    expect(criterionEvidencePacket(evidence, "Visual Feedback", [visibleFeedback]))
      .toContain("VISUALLY_SCOREABLE");
    expect(criterionEvidencePacket(evidence, "Visual Feedback", [duplicatePrevention]))
      .not.toContain("VISUALLY_SCOREABLE");
    expect(criterionEvidencePacket(evidence, "Brand Expression", [brand]))
      .toContain("VISUALLY_SCOREABLE");
    expect(criterionEvidencePacket(evidence, "Icons & Imagery", [icons]))
      .toContain("VISUALLY_SCOREABLE");
    expect(criterionEvidencePacket(evidence, "Motion & Microinteractions", [motion]))
      .toContain("VISUALLY_SCOREABLE");
  });
});
