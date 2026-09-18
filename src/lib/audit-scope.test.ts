import { describe, expect, it } from "vitest";
import { AUDIT_SCOPE_VERSION, buildAuditScope } from "./audit-scope";
import { QUESTION_BANK_VERSION } from "./question-bank";

describe("buildAuditScope", () => {
  it("creates a canonical, immutable Phase 1 scope", () => {
    const scope = buildAuditScope({
      auditId: "audit-1",
      createdAt: "2026-09-18T12:00:00.000Z",
      productName: "Example",
      productUrl: "https://example.com",
      productType: "marketing_website",
      primaryPlatform: "Responsive web",
      selectedBuckets: ["Visual Feedback", "Visual Feedback", "Unknown bucket"],
      pagesAndFlows: ["Homepage", "Homepage", "Contact form"],
      objectives: ["Improve conversion"],
      accessMode: "internal_routes_only",
      internalRoutes: ["/contact"],
      guidedStepsCount: 2,
    });

    expect(scope.version).toBe(AUDIT_SCOPE_VERSION);
    expect(scope.question_bank_version).toBe(QUESTION_BANK_VERSION);
    expect(scope.selected_buckets).toEqual(["Visual Feedback"]);
    expect(scope.question_ids_by_bucket["Visual Feedback"]).toHaveLength(10);
    expect(scope.pages_and_flows).toEqual(["Homepage", "Contact form"]);
    expect(scope.capture_requirements.guided_steps_count).toBe(2);
    expect(Object.isFrozen(scope)).toBe(true);
  });
});
