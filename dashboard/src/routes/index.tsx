import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/overview" });
  },
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "OpenAssistant AI Ops" },
      { name: "description", content: "Developer operations cockpit for OpenAssistant AI." },
      { property: "og:title", content: "OpenAssistant AI Ops" },
      { property: "og:description", content: "Developer operations cockpit for OpenAssistant AI." },
    ],
  }),
});
