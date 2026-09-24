import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("@/lib/firebase-admin", () => ({ getAdminFirestore: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ isMongoConfigured: () => false }));
vi.mock("firebase-admin/storage", () => ({
  getStorage: () => ({
    bucket: () => ({
      file: (path: string) => ({
        save: async (payload: string) => { storage.set(path, payload); },
        download: async () => [Buffer.from(storage.get(path)!)],
      }),
    }),
  }),
}));

import { loadFullReportBlob, storeFullReportBlob } from "./report-storage.server";

describe("complete evidence checkpoint", () => {
  beforeEach(() => storage.clear());

  it("preserves every question, state and evidence reference across bucket checkpoints", async () => {
    const bucketResults = [{ bucket_name: "Visual Feedback", questions: Array.from({ length: 14 }, (_, index) => ({
      id: `VF${index}`, answer_state: index === 0 ? "not_tested" : "partial", mark: index === 0 ? 0 : 0.5,
      evidence_ids: [`ev-${index}`], recommendation: "A complete recommendation. ".repeat(30),
    })) }];
    const saved = await storeFullReportBlob("audit-buckets", { bucketResults });
    if (!saved.ok) throw new Error(saved.error);
    expect((await loadFullReportBlob({ report_blob: saved.blob }))?.bucketResults).toEqual(bucketResults);
  });

  it("preserves late-bucket evidence and targeted captures across request boundaries", async () => {
    const evidence = {
      pages: Array.from({ length: 48 }, (_, index) => ({
        url: `https://example.com/page-${index}`,
        targetedCheck: { taskId: `Brand Expression:BE${index}`, tested: true, kind: "visual" },
      })),
      screenshots: Array.from({ length: 48 }, (_, index) => ({ url: `https://example.com/${index}.png` })),
      evidenceRecords: Array.from({ length: 800 }, (_, index) => ({
        evidenceId: `ev-${index}`,
        bucketId: index >= 700 ? "Icons & Imagery" : "Visual Feedback",
        observation: "Complete observation. ".repeat(50),
      })),
    };
    const saved = await storeFullReportBlob("audit-evidence", { evidence });
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error(saved.error);
    const loaded = await loadFullReportBlob({ report_blob: saved.blob });
    expect(loaded?.evidence).toEqual(evidence);
    // An evidence checkpoint must not replace the final report blob.
    await storeFullReportBlob("audit", { overall_score: 75 });
    expect((await loadFullReportBlob({ report_blob: saved.blob }))?.evidence).toEqual(evidence);
  });
});
