import { createFileRoute } from "@tanstack/react-router";
import { ProviderHub } from "@/components/ProviderHub";
import { dataRoute } from "@/lib/dashboard";
export const Route = createFileRoute("/providers")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "AI providers — OpenAssistant AI Ops" },
      {
        name: "description",
        content: "Manage Gemini, Claude, OpenAI, Groq, OpenRouter and custom endpoint credentials.",
      },
      { property: "og:title", content: "AI providers — OpenAssistant AI Ops" },
      { property: "og:description", content: "Credentials and status for every AI provider." },
    ],
  }),
  ...dataRoute,
  component: ProviderHub,
});
