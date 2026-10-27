import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDashboard } from "@/lib/dashboard";

afterEach(() => vi.unstubAllGlobals());
describe("dashboard connection state", () => {
  it("resolves a failed connection as unavailable without fake records or a rejected route loader", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await loadDashboard();
    expect(result.status).toBe("unavailable");
    expect(result).not.toHaveProperty("data");
  });
  it("recovers with actual returned records after the server becomes available", async () => {
    const data = {
      tasks: [],
      memories: [],
      providers: [],
      categories: [],
      routing: null,
      bot: null,
      capabilities: [],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError("offline"))
        .mockResolvedValueOnce(
          new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }),
        ),
    );
    expect((await loadDashboard()).status).toBe("unavailable");
    expect(await loadDashboard()).toEqual({ status: "ready", data });
  });
});
