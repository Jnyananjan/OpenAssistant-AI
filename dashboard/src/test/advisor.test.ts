import { describe, expect, it } from "vitest";
import {
  advisorRequestSchema,
  buildCandidates,
  recommendationMatchesCandidates,
  recommendationSchema,
  type Recommendation,
} from "@/lib/advisor";
import type { Dashboard } from "@/lib/api";

const provider = (over: Partial<Dashboard["providers"][number]>): Dashboard["providers"][number] => ({
  id: "gemini",
  name: "Google Gemini",
  configured: true,
  status: "connected",
  verifiedAt: "2026-10-26T10:00:00Z",
  models: ["gemini-3-pro", "gemini-3-flash"],
  accessibleModels: ["gemini-3-pro", "gemini-3-flash"],
  defaultModel: "gemini-3-flash",
  latencyMs: 210,
  ...over,
});

describe("buildCandidates", () => {
  it("includes only verified connected providers with accessible models", () => {
    const candidates = buildCandidates([
      provider({}),
      provider({ id: "openai", status: "unverified" }),
      provider({ id: "groq", verifiedAt: null }),
      provider({ id: "custom", configured: false, status: "unset" }),
      provider({ id: "openrouter", accessibleModels: [] }),
    ]);
    expect(candidates).toEqual([
      { provider: "gemini", providerName: "Google Gemini", models: ["gemini-3-pro", "gemini-3-flash"] },
    ]);
  });

  it("returns an empty list when nothing is connected", () => {
    expect(buildCandidates([])).toEqual([]);
  });
});

describe("advisorRequestSchema", () => {
  const candidates = [
    { provider: "gemini", providerName: "Google Gemini", models: ["gemini-3-flash"] },
  ];

  it("rejects a too-short description", () => {
    expect(advisorRequestSchema.safeParse({ description: "fast", candidates }).success).toBe(false);
  });

  it("rejects an empty candidate list", () => {
    expect(
      advisorRequestSchema.safeParse({ description: "summarize long PDFs cheaply", candidates: [] })
        .success,
    ).toBe(false);
  });

  it("accepts a valid request", () => {
    expect(
      advisorRequestSchema.safeParse({ description: "summarize long PDFs cheaply", candidates })
        .success,
    ).toBe(true);
  });
});

describe("recommendationSchema", () => {
  it("rejects malformed answers", () => {
    expect(recommendationSchema.safeParse({ provider: "gemini" }).success).toBe(false);
    expect(
      recommendationSchema.safeParse({ provider: "gemini", model: "m", reason: "r" }).success,
    ).toBe(false); // fallback is required-but-nullable
  });

  it("accepts a null fallback", () => {
    expect(
      recommendationSchema.safeParse({ provider: "gemini", model: "m", reason: "r", fallback: null })
        .success,
    ).toBe(true);
  });
});

describe("recommendationMatchesCandidates", () => {
  const candidates = buildCandidates([provider({})]);
  const rec = (over: Partial<Recommendation>): Recommendation => ({
    provider: "gemini",
    model: "gemini-3-flash",
    reason: "Cheap and fast.",
    fallback: null,
    ...over,
  });

  it("accepts a pick from the connected catalog", () => {
    expect(recommendationMatchesCandidates(rec({}), candidates)).toBe(true);
  });

  it("rejects a model the user cannot access", () => {
    expect(recommendationMatchesCandidates(rec({ model: "gemini-ultra" }), candidates)).toBe(false);
  });

  it("rejects a provider that is not connected", () => {
    expect(recommendationMatchesCandidates(rec({ provider: "openai" }), candidates)).toBe(false);
  });

  it("rejects a fallback outside the catalog", () => {
    expect(
      recommendationMatchesCandidates(
        rec({ fallback: { provider: "gemini", model: "gemini-ultra", reason: "r" } }),
        candidates,
      ),
    ).toBe(false);
  });

  it("accepts a valid fallback", () => {
    expect(
      recommendationMatchesCandidates(
        rec({ fallback: { provider: "gemini", model: "gemini-3-pro", reason: "r" } }),
        candidates,
      ),
    ).toBe(true);
  });
});
