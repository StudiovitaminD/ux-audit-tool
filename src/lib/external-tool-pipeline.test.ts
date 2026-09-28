import { describe, expect, it } from "vitest";
import { attachExternalToolPipeline } from "@/lib/external-tool-pipeline";
import type { EvidenceBundle } from "@/lib/evidence-collector";

describe("external tool pipeline", () => {
  it("records Playwright, axe, screenshot, and optional Lighthouse provenance", () => {
    const bundle: EvidenceBundle = {
      pages: [
        {
          url: "https://example.com",
          title: "Example",
          h1: [],
          h2: [],
          h3: [],
          topNavLinks: [],
          textSnippet: "Example",
          deterministic: {
            axe: { tested: true, violations: 1, critical: 0, serious: 1, passes: 4 },
          },
        },
      ],
      screenshotDataUrl: null,
      screenshots: [{ label: "Homepage", url: "https://cdn.example/screenshot.png", isValidAuditEvidence: true }],
      warnings: [],
      visitedFlows: [],
      evidenceRecords: [],
    };

    const result = attachExternalToolPipeline(bundle);
    const pipeline = result.debug?.externalToolPipeline as { providers: Array<{ name: string; status: string }> };

    expect(pipeline.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "playwright", status: "ready" }),
      expect.objectContaining({ name: "axe", status: "ready" }),
      expect.objectContaining({ name: "screenshot_diff", status: "ready" }),
      expect.objectContaining({ name: "lighthouse", status: "not_configured" }),
    ]));
  });
});
