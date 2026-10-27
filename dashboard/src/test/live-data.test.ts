import { afterEach, describe, expect, it, vi } from "vitest";
import { api, getDashboard, operation, validateDashboard } from "@/lib/api";
import { QueryClient } from "@tanstack/react-query";

const empty = () => ({
  tasks: [],
  memories: [],
  providers: [],
  categories: [],
  routing: null,
  bot: null,
  capabilities: [],
});
afterEach(() => vi.unstubAllGlobals());
const respond = (data: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(data), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      ),
  );

describe("live-only dashboard data", () => {
  it("keeps an empty backend response empty without demo defaults", async () => {
    respond(empty());
    expect(await getDashboard()).toEqual(empty());
  });
  it("reports unavailable backend without fabricating successful data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(getDashboard()).rejects.toThrow("Unable to reach");
  });
  it("reports missing backend capabilities", async () => {
    respond({}, 404);
    await expect(operation("/api/bot/test-message")).rejects.toThrow("not supported");
  });
  it("rejects application failure inside HTTP 200 instead of showing success", async () => {
    respond({ ok: false });
    await expect(operation("/api/bot/test-message", { text: "test" })).rejects.toThrow(
      "did not confirm",
    );
  });
  it("does not turn an arbitrary HTTP 200 into a delivery acknowledgment", async () => {
    respond({});
    await expect(operation("/api/bot/test-message")).rejects.toThrow("did not confirm");
  });
  it("rejects malformed dashboard responses rather than supplying missing arrays", () => {
    expect(() => validateDashboard({ tasks: [] })).toThrow("incompatible");
  });
  it("does not label a configured provider connected without real verification metadata", () => {
    const input = {
      ...empty(),
      providers: [
        {
          id: "test-provider",
          name: "Test",
          configured: true,
          status: "connected",
          verifiedAt: null,
          models: [],
          accessibleModels: [],
          defaultModel: null,
          latencyMs: null,
        },
      ],
    };
    expect(validateDashboard(input).providers[0]?.status).toBe("unverified");
  });
  it("strips credential fields from validated display records", () => {
    expect(validateDashboard({ ...empty(), secret: "test-only" })).not.toHaveProperty("secret");
  });
  it("preserves separate deadlines and reminder delivery timestamps from backend records", async () => {
    const task = {
      id: "test-task",
      title: "test-only",
      status: "scheduled",
      followUps: 0,
      maxFollowUps: 3,
      nextAt: "2026-11-01T10:00:00Z",
      dueAt: "2026-11-02T10:00:00Z",
      intervalMin: 30,
      chat: null,
    };
    respond({ ...empty(), tasks: [task] });
    expect((await getDashboard()).tasks).toEqual([task]);
  });
  it("uses real backend acknowledgment for operations", async () => {
    respond({ ok: true });
    expect(await operation("/api/routing/save", { mode: "budget", manualModel: null })).toEqual({
      ok: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/routing/save"),
      expect.objectContaining({ body: JSON.stringify({ mode: "budget", manualModel: null }) }),
    );
  });
  it("does not share data between independently created request caches", () => {
    const first = new QueryClient();
    const second = new QueryClient();
    first.setQueryData(["local-dashboard"], empty());
    expect(second.getQueryData(["local-dashboard"])).toBeUndefined();
  });
  it("rejects non-JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("not data", { headers: { "Content-Type": "text/plain" } })),
    );
    await expect(api("GET", "/api/dashboard")).rejects.toThrow("invalid response");
  });
});
