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

  it("routes targeted browser evidence to the exact bucket question", () => {
    const bundle = {
      pages: [{
        url: "https://example.com",
        title: "Home",
        h1: [], h2: [], h3: [], topNavLinks: [], textSnippet: "",
        targetedCheck: {
          tested: true,
          taskId: "Typography & Readability:TR08",
          kind: "zoom",
          method: "200_percent_layout_zoom",
          horizontalOverflow: false,
        },
      }],
      screenshotDataUrl: null,
      screenshots: [],
      warnings: [],
      visitedFlows: [],
    } as EvidenceBundle;
    const plan = buildEvidencePlan(["Typography & Readability"]);
    const result = attachEvidenceDepth(bundle, plan);
    const exact = result.evidenceRecords?.find((record) => record.questionId === "TR08" && record.kind === "zoom");
    expect(exact?.status).toBe("confirmed");
    expect(exact?.observation).toContain("200_percent_layout_zoom");
  });

  it("selects measured pages instead of ignoring evidence after early screenshot-only pages", () => {
    const basePage = { url: "https://example.com", title: "Home", h1: [], h2: [], h3: [], topNavLinks: [], textSnippet: "" };
    const bundle = {
      pages: [
        basePage,
        {
          ...basePage,
          url: "https://example.com/contact",
          deterministic: {
            contrast: { tested: true, samplesTested: 18, failures: 2 },
          },
        },
      ],
      screenshotDataUrl: null,
      screenshots: [],
      warnings: [],
      visitedFlows: [],
    } as EvidenceBundle;
    const result = attachEvidenceDepth(bundle, buildEvidencePlan(["Color & Contrast"]));
    const contrast = result.evidenceRecords?.find((record) => record.kind === "contrast");
    expect(contrast?.status).toBe("confirmed");
    expect(contrast?.pageUrl).toBe("https://example.com/contact");
    expect(contrast?.observation).toContain("18 visible text samples");
  });

  it("does not label ordinary DOM context as a deterministic measurement", () => {
    const bundle = {
      pages: [{ url: "https://example.com", title: "Home", h1: [], h2: [], h3: [], topNavLinks: [], textSnippet: "Home" }],
      screenshotDataUrl: null,
      screenshots: [],
      warnings: [],
      visitedFlows: [],
    } as EvidenceBundle;
    const result = attachEvidenceDepth(bundle, buildEvidencePlan(["Navigation & Findability"]));
    const dom = result.evidenceRecords?.find((record) => record.kind === "dom");
    expect(dom?.status).toBe("confirmed");
    expect(dom?.testMethod).toBe("captured_dom_context");
  });

  it("matches screenshots to their source page URL instead of array position", () => {
    const page = (url: string, title: string) => ({ url, title, h1: [], h2: [], h3: [], topNavLinks: [], textSnippet: title });
    const bundle = {
      pages: [page("https://example.com/a", "A"), page("https://example.com/b", "B")],
      screenshotDataUrl: null,
      screenshots: [
        { url: "https://cdn.example.com/b.png", pageUrl: "https://example.com/b", label: "B", isValidAuditEvidence: true },
        { url: "https://cdn.example.com/a.png", pageUrl: "https://example.com/a", label: "A", isValidAuditEvidence: true },
      ],
      warnings: [],
      visitedFlows: [],
    } as EvidenceBundle;
    const result = attachEvidenceDepth(bundle, buildEvidencePlan(["Brand Expression"]));
    const firstVisual = result.evidenceRecords?.find((record) => record.kind === "screenshot");
    expect(firstVisual?.pageUrl).toBe("https://example.com/a");
    expect(firstVisual?.screenshotUrl).toBe("https://cdn.example.com/a.png");
  });
});
