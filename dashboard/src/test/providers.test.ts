import { describe, expect, it, vi, afterEach } from "vitest";
import {
  connectedCount,
  canSaveProvider,
  providerDraftSchema,
  testProvider,
} from "@/lib/providers";
import type { Dashboard } from "@/lib/api";

const provider: Dashboard["providers"][number] = {
  id: "gemini",
  name: "Google Gemini",
  configured: true,
  status: "connected",
  verifiedAt: "2026-10-25T19:00:00Z",
  models: [],
  accessibleModels: [],
  defaultModel: null,
  latencyMs: null,
};
afterEach(() => vi.unstubAllGlobals());
describe("provider management rules", () => {
  it("counts only configured, verified connected providers", () => {
    expect(
      connectedCount([
        provider,
        { ...provider, id: "anthropic", verifiedAt: null },
        { ...provider, id: "openai", configured: false },
        { ...provider, id: "groq", status: "error" },
      ]),
    ).toBe(1);
  });
  it("requires explicit encrypted-save support instead of a local store", () => {
    expect(canSaveProvider(undefined)).toBe(false);
    expect(canSaveProvider(["provider_test"])).toBe(false);
    expect(canSaveProvider(["provider_save_encrypted"])).toBe(true);
  });
  it("trims surrounding API key whitespace", () => {
    const value = providerDraftSchema.parse({
      provider: "gemini",
      apiKey: "  unit-test-fixture  ",
      baseUrl: "",
      defaultModel: null,
    });
    expect(value.apiKey === "unit-test-fixture").toBe(true);
  });
  it("allows local OpenAI-compatible URLs but rejects embedded URL credentials", () => {
    const draft = { provider: "custom", apiKey: "", defaultModel: null };
    expect(
      providerDraftSchema.safeParse({ ...draft, baseUrl: "http://localhost:11434/v1" }).success,
    ).toBe(true);
    expect(
      providerDraftSchema.safeParse({ ...draft, baseUrl: "https://user:password@example.com" })
        .success,
    ).toBe(false);
  });
  it("uses server-verified latency instead of fabricated timing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, latencyMs: 182 }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    expect((await testProvider({ provider: "gemini" })).latencyMs).toBe(182);
  });
  it("rejects success without a measured latency", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(testProvider({ provider: "gemini" })).rejects.toThrow("verified latency");
  });
});
