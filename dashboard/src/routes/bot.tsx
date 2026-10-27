import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Send } from "lucide-react";
import { Btn, Input, PageHeader, Panel, PanelHeader, Pill } from "@/components/ui-kit";
import { dataRoute, useDashboard, useOperation, withDashboard } from "@/lib/dashboard";
export const Route = createFileRoute("/bot")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Telegram bot — OpenAssistant AI Ops" },
      { name: "description", content: "Manage the Telegram bot webhook and send test messages." },
      { property: "og:title", content: "Telegram bot — OpenAssistant AI Ops" },
      { property: "og:description", content: "Webhook status and test dispatch for OpenAssistant AI." },
    ],
  }),
  ...dataRoute,
  component: withDashboard(BotPage),
});

function BotPage() {
  const d = useDashboard();
  const action = useOperation();
  const [text, setText] = useState("");
  const b = d.bot;
  const rows = [
    ["Username", b?.username ? `@${b.username}` : "—"],
    ["Bot ID", b?.id?.toString() ?? "—"],
    ["Webhook URL", b?.webhookUrl || "—"],
    ["Pending updates", b?.pendingUpdates?.toString() ?? "—"],
    ["Allowed updates", b?.allowedUpdates?.join(", ") ?? "—"],
  ];
  return (
    <>
      <PageHeader title="Telegram bot" desc="Verified configuration and test dispatch." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Webhook"
            icon={<Bot className="size-4" />}
            right={
              <Pill tone={b?.enabled ? "success" : "muted"}>
                {b ? (b.enabled ? "active" : "disabled") : "Status not verified"}
              </Pill>
            }
          />
          <div className="flex items-center justify-between border-b px-4 py-3 text-sm">
            <span>Receive updates</span>
            <Btn
              disabled={!b || !d.capabilities.includes("webhook_toggle") || action.isPending}
              onClick={() =>
                action.mutate({ path: "/api/bot/webhook", body: { enabled: !b?.enabled } })
              }
            >
              {b?.enabled ? "Disable" : "Enable"}
            </Btn>
          </div>
          <dl className="divide-y text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="max-w-full break-all font-mono text-xs">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel>
          <PanelHeader title="Test message" icon={<Send className="size-4" />} />
          <div className="space-y-3 p-4">
            <div className="flex gap-2">
              <Input
                aria-label="Test message"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <Btn
                variant="primary"
                disabled={!text.trim() || !d.capabilities.includes("bot_send") || action.isPending}
                onClick={() => action.mutate({ path: "/api/bot/test-message", body: { text } })}
              >
                <Send className="size-3.5" />
                Send
              </Btn>
            </div>
            {!d.capabilities.includes("bot_send") && (
              <p className="text-xs text-muted-foreground">
                Test dispatch is not configured on the setup server.
              </p>
            )}
            <p className="text-xs text-muted-foreground">No message history source available.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}
