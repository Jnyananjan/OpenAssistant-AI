import { z } from "zod";
import { api, ApiError } from "./api";

export const setupStatusSchema = z.object({
  credentials: z.array(z.object({ name: z.string(), configured: z.boolean() })),
  settings: z.object({
    allowedUsers: z.array(z.string()),
    timezone: z.string(),
    maxFollowUps: z.number().int().nonnegative(),
  }),
  encryptionConfigured: z.boolean(),
  workerConfigured: z.boolean(),
  webhookUrl: z.string().nullable(),
  migrationsAvailable: z.boolean(),
});
export type SetupStatus = z.infer<typeof setupStatusSchema>;
export const setupStatusOptions = {
  queryKey: ["setup-status"],
  queryFn: async () => {
    try {
      const result = setupStatusSchema.safeParse(await api("GET", "/api/setup/status"));
      if (!result.success)
        throw new ApiError(502, "Setup returned incompatible configuration metadata.");
      return { status: "ready" as const, data: result.data };
    } catch (error) {
      return {
        status: "unavailable" as const,
        message: error instanceof Error ? error.message : "Setup is unavailable.",
      };
    }
  },
};
export const setupSources = [
  {
    name: "TELEGRAM_BOT_TOKEN",
    title: "Telegram bot",
    href: "https://t.me/BotFather",
    source: "BotFather",
    optional: false,
  },
  {
    name: "TELEGRAM_USER_ID",
    title: "Authorized Telegram user ID",
    href: "https://web.telegram.org/k/#@userinfobot",
    source: "@userinfobot",
    optional: false,
  },
  {
    name: "PROJECT_REF",
    title: "Database project reference (or URL)",
    href: "https://supabase.com/dashboard",
    source: "Project dashboard",
    optional: false,
  },
  {
    name: "SUPABASE_ACCESS_TOKEN",
    title: "Database access token",
    href: "https://supabase.com/dashboard/account/tokens",
    source: "Access tokens",
    optional: false,
  },
  {
    name: "GEMINI_API_KEY",
    title: "Google Gemini",
    href: "https://aistudio.google.com/app/apikey",
    source: "Google AI Studio",
    optional: false,
  },
  {
    name: "ANTHROPIC_API_KEY",
    title: "Anthropic Claude",
    href: "https://console.anthropic.com/settings/keys",
    source: "Anthropic Console",
    optional: true,
  },
  {
    name: "OPENAI_API_KEY",
    title: "OpenAI",
    href: "https://platform.openai.com/api-keys",
    source: "OpenAI API keys",
    optional: true,
  },
  {
    name: "GROQ_API_KEY",
    title: "Groq",
    href: "https://console.groq.com/keys",
    source: "Groq Console",
    optional: true,
  },
  {
    name: "OPENROUTER_API_KEY",
    title: "OpenRouter",
    href: "https://openrouter.ai/keys",
    source: "OpenRouter Keys",
    optional: true,
  },
  {
    name: "SUPERMEMORY_API_KEY",
    title: "Supermemory",
    href: "https://supermemory.ai/",
    source: "Supermemory Console",
    optional: true,
  },
];
