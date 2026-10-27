import { createFileRoute } from "@tanstack/react-router";
import { SetupCockpit } from "@/components/SetupCockpit";
export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Setup wizard — OpenAssistant AI Ops" },
      {
        name: "description",
        content:
          "Check prerequisites, test credentials, deploy migrations and register the Telegram webhook.",
      },
      { property: "og:title", content: "Setup wizard — OpenAssistant AI Ops" },
      { property: "og:description", content: "Step-by-step deployment for OpenAssistant AI." },
    ],
  }),
  component: SetupCockpit,
});
