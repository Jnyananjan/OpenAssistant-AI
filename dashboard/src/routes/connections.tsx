import { createFileRoute } from "@tanstack/react-router";
import { ConnectionsHub } from "@/components/ConnectionsHub";
import { dataRoute, withDashboard } from "@/lib/dashboard";

export const Route = createFileRoute("/connections")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Connections & Integrations — OpenAssistant AI Ops" },
      {
        name: "description",
        content: "Manage external communication channels, Telegram bot, and database infrastructure.",
      },
      { property: "og:title", content: "Connections & Integrations — OpenAssistant AI Ops" },
      { property: "og:description", content: "Channels and integrations for OpenAssistant AI." },
    ],
  }),
  ...dataRoute,
  component: withDashboard(ConnectionsHub),
});

