import { describe, expect, it } from "vitest";
import { extensionCapturesToEvidence } from "./evidence-collector";

describe("visible extension audit evidence", () => {
  it("maps deterministic browser checks into scoreable evidence fields", () => {
    const evidence = extensionCapturesToEvidence({
      productUrl: "https://example.com",
      auditFlows: [],
      extensionCaptureJson: JSON.stringify([
        {
          url: "https://example.com/contact",
          title: "Contact",
          viewport: "mobile",
          capturedAt: "2026-09-21T06:30:00.000Z",
          headings: ["Contact us"],
          visibleText: "Contact us about your project",
          screenshotUrl: "data:image/png;base64,AAAA",
          automatedChecks: {
            accessibility: {
              landmarks: 3,
              unlabeledControls: ["button#menu"],
              imagesWithoutAlt: ["hero.png"],
              headingSkips: 1,
            },
            keyboard: {
              testedCount: 4,
              samples: [
                { name: "Menu", focusable: true },
                { name: "Contact", focusable: true },
              ],
            },
            contrast: { testedCount: 12, lowContrastSamples: [{ text: "Muted", ratio: 3.1 }] },
            responsive: { horizontalOverflow: true, documentWidth: 420, viewportWidth: 390 },
            performance: { domContentLoadedMs: 420, loadMs: 700, resourceCount: 18, transferBytes: 120000 },
            forms: {
              formCount: 1,
              requiredFields: 2,
              unlabeledFields: 1,
              statusRegions: 1,
              testedStates: [{ result: "submitted", filledFields: ["Email", "Message"] }],
            },
            motion: { animationsDetected: 2, reducedMotionMatched: false },
            axe: { tested: true, violations: 2, critical: 0, serious: 1, passes: 14 },
          },
        },
      ]),
    });

    const page = evidence?.pages[0];
    expect(page?.viewport).toBe("mobile");
    expect(page?.deterministic?.semantics).toMatchObject({ tested: true, unlabeledControls: 1, imagesMissingAlt: 1 });
    expect(page?.deterministic?.keyboard).toMatchObject({ tested: true, focusableCount: 4, visibleFocusCount: 2 });
    expect(page?.deterministic?.contrast).toMatchObject({ tested: true, samplesTested: 12, failures: 1 });
    expect(page?.deterministic?.responsive).toMatchObject({ tested: true, horizontalOverflow: true, overflowPixels: 30 });
    expect(page?.deterministic?.performance).toMatchObject({ tested: true, domContentLoadedMs: 420, loadMs: 700 });
    expect(page?.deterministic?.forms?.testedStates).toEqual([
      { result: "submitted", filledFields: ["Email", "Message"] },
    ]);
    expect(page?.deterministic?.axe).toMatchObject({ tested: true, violations: 2, serious: 1 });
    expect(evidence?.screenshots[0]).toMatchObject({ viewport: "mobile", capturedAt: "2026-09-21T06:30:00.000Z" });
  });
});
