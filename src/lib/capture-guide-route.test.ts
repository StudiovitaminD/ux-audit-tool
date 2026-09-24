import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ model: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/account-server", () => ({ getAccountSessionFromRequest: mocks.session }));
vi.mock("@/lib/firebase-admin", () => ({ getAdminFirestore: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ status: "awaiting_recapture", recaptureTasks: [{ id: "VF01", targetUrl: "https://example.com", kind: "interaction" }] }) }) }) }) }) }));
vi.mock("@/lib/report-record", () => ({ reportBelongsToSession: () => true }));
vi.mock("@/lib/audit-engine", () => ({ openRouterChat: mocks.model }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }), rateLimitResponse: vi.fn() }));
import { POST } from "../app/api/audit/[id]/capture-guide/route";

function request(url = "https://example.com") {
  return POST(new Request("https://audit.example/api", { method: "POST", body: JSON.stringify({ taskId: "VF01", snapshot: { url, controls: [] }, history: [] }) }), { params: Promise.resolve({ id: "report" }) });
}

describe("capture guide endpoint", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ id: "owner" }); });
  it("returns a valid decision when the provider includes a null optional target", async () => {
    mocks.model.mockResolvedValue(JSON.stringify({ action: "probe", kind: "interaction", target: null, reason: "Check feedback" }));
    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.json()).action).toBe("probe");
  });
  it("blocks malformed decisions without failing the whole run", async () => {
    mocks.model.mockResolvedValue("not JSON");
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ action: "blocked", code: "INVALID_GUIDE_DECISION" });
  });
  it("distinguishes provider timeouts from invalid decisions", async () => {
    mocks.model.mockRejectedValue(new Error("Provider request timed out"));
    const response = await request();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "GUIDE_TIMEOUT" });
  });
  it("rejects off-site observations before calling the provider", async () => {
    expect((await request("https://other.example")).status).toBe(400);
    expect(mocks.model).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect(mocks.model).not.toHaveBeenCalled();
  });
});
