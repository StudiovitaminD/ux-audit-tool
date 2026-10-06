import { describe, expect, it, vi } from "vitest";
import { runWithBrowserProviderFallback } from "@/lib/browser-provider";

describe("browser provider fallback", () => {
  it("runs local capture after a remote provider error", async () => {
    const remote = vi.fn().mockRejectedValue(new Error("remote timeout"));
    const local = vi.fn().mockResolvedValue("captured locally");

    await expect(runWithBrowserProviderFallback(remote, local)).resolves.toBe("captured locally");
    expect(remote).toHaveBeenCalledOnce();
    expect(local).toHaveBeenCalledWith(expect.objectContaining({ message: "remote timeout" }));
  });

  it("preserves both provider errors when neither capture path works", async () => {
    await expect(runWithBrowserProviderFallback(
      async () => { throw new Error("remote timeout"); },
      async () => { throw new Error("Chromium unavailable"); },
    )).rejects.toThrow("Primary browser capture failed (remote timeout); local Playwright fallback failed (Chromium unavailable).");
  });
});
