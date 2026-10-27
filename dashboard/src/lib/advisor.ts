import { z } from "zod";
import type { Dashboard } from "./api";

/** A verified, connected provider with the models the user can actually call. */
export interface AdvisorCandidate {
  provider: string;
  providerName: string;
  models: string[];
}

/** Only providers confirmed by the setup server may be recommended. */
export function buildCandidates(providers: Dashboard["providers"]): AdvisorCandidate[] {
  return providers
    .filter(
      (p) =>
        p.configured && p.status === "connected" && p.verifiedAt && p.accessibleModels.length > 0,
    )
    .map((p) => ({ provider: p.id, providerName: p.name, models: p.accessibleModels }));
}

export const advisorRequestSchema = z.object({
  description: z.string().trim().min(10).max(2000),
  candidates: z
    .array(
      z.object({
        provider: z.string().min(1).max(100),
        providerName: z.string().min(1).max(100),
        models: z.array(z.string().min(1).max(200)).min(1).max(100),
      }),
    )
    .min(1)
    .max(20),
});
export type AdvisorRequest = z.infer<typeof advisorRequestSchema>;

/** Strict-compatible shape: every property required, optional values nullable. */
export const recommendationSchema = z.object({
  provider: z.string(),
  model: z.string(),
  reason: z.string(),
  fallback: z
    .object({
      provider: z.string(),
      model: z.string(),
      reason: z.string(),
    })
    .nullable(),
});
export type Recommendation = z.infer<typeof recommendationSchema>;

function isCandidate(provider: string, model: string, candidates: AdvisorCandidate[]) {
  return candidates.some((c) => c.provider === provider && c.models.includes(model));
}

/** A recommendation is only valid if every pick is a verified connected model. */
export function recommendationMatchesCandidates(
  recommendation: Recommendation,
  candidates: AdvisorCandidate[],
): boolean {
  if (!isCandidate(recommendation.provider, recommendation.model, candidates)) return false;
  const fallback = recommendation.fallback;
  if (fallback && !isCandidate(fallback.provider, fallback.model, candidates)) return false;
  return true;
}
