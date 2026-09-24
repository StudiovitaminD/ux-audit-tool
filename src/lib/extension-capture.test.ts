import { describe, expect, it } from "vitest";
import { mergeExtensionCaptureJson } from "./extension-capture";

describe("extension capture import", () => {
  it("keeps deterministic audit measurements while removing screenshot data URLs", () => {
    const json = mergeExtensionCaptureJson("", [
      {
        url: "https://example.com/contact",
        viewport: "mobile",
        capturedAt: "2026-09-21T06:30:00.000Z",
        screenshotUrl: "data:image/png;base64,large-image",
        automatedChecks: {
          axe: { tested: true, violations: 2 },
          keyboard: { testedCount: 5, reachableCount: 5 },
          performance: { loadMs: 720 },
        },
      },
    ]);

    const [capture] = JSON.parse(json) as Array<Record<string, unknown>>;
    expect(capture.screenshotUrl).toBeUndefined();
    expect(capture.automatedChecks).toEqual({
      axe: { tested: true, violations: 2 },
      keyboard: { testedCount: 5, reachableCount: 5 },
      performance: { loadMs: 720 },
    });
  });

  it("does not duplicate a capture imported more than once", () => {
    const capture = {
      url: "https://example.com",
      viewport: "desktop",
      capturedAt: "2026-09-21T06:30:00.000Z",
      captureReason: "visible_runner_desktop",
    };
    const first = mergeExtensionCaptureJson("", [capture]);
    const second = mergeExtensionCaptureJson(first, [capture]);
    expect(JSON.parse(second)).toHaveLength(1);
  });

  it("keeps every targeted criterion captured from the same page and screenshot", () => {
    const sharedCapture = {
      url: "https://example.com/contact",
      viewport: "desktop",
      capturedAt: "2026-09-24T06:30:00.000Z",
      captureReason: "targeted_interaction",
    };
    const json = mergeExtensionCaptureJson("", [
      { ...sharedCapture, targetedCheck: { taskId: "Visual Feedback:VF01", tested: true } },
      { ...sharedCapture, targetedCheck: { taskId: "Visual Feedback:VF02", tested: true } },
    ]);
    expect(JSON.parse(json)).toHaveLength(2);
  });
});
