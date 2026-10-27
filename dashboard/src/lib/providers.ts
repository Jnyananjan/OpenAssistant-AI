import { z } from "zod";
import { ApiError, operation, type Dashboard } from "./api";

export const providerCatalog = [
  {
    id: "gemini",
    name: "Google Gemini",
    tag: "Free Tier Available · Recommended",
    href: "https://aistudio.google.com/app/apikey",
    symbol: "G",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    tag: "Coding & Deep Reasoning",
    href: "https://console.anthropic.com/settings/keys",
    symbol: "A",
  },
  {
    id: "openai",
    name: "OpenAI",
    tag: "GPT-5 & mini",
    href: "https://platform.openai.com/api-keys",
    symbol: "O",
  },
  {
    id: "groq",
    name: "Groq",
    tag: "Ultra-fast Llama & Mixtral",
    href: "https://console.groq.com/keys",
    symbol: "q",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    tag: "Llama, DeepSeek & 100+ Models",
    href: "https://openrouter.ai/keys",
    symbol: "↗",
  },
  {
    id: "custom",
    name: "Custom / Local",
    tag: "Ollama / vLLM / OpenAI-compatible",
    href: null,
    symbol: "⌘",
  },
] as const;
export type ProviderId = (typeof providerCatalog)[number]["id"];
export const providerDraftSchema = z.object({
  provider: z.enum(["gemini", "anthropic", "openai", "groq", "openrouter", "custom"]),
  apiKey: z.string().trim().max(24576),
  baseUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
      } catch {
        return false;
      }
    }, "Enter an HTTP or HTTPS URL without embedded credentials."),
  defaultModel: z.string().trim().max(200).nullable(),
});
export function connectedCount(providers: Dashboard["providers"]) {
  return providers.filter((p) => p.configured && p.status === "connected" && p.verifiedAt).length;
}
export function canSaveProvider(capabilities: Dashboard["capabilities"] | undefined) {
  return capabilities?.includes("provider_save_encrypted") ?? false;
}
export async function testProvider(body: unknown) {
  const result = await operation("/api/test/ai", body);
  const timing = z.object({ latencyMs: z.number().finite().nonnegative() }).safeParse(result);
  if (!timing.success)
    throw new ApiError(
      502,
      "The server confirmed the test but did not provide a verified latency.",
    );
  return timing.data;
}
