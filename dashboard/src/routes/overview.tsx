import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Database, Bot, Cpu, Clock, RefreshCw, Brain, ListChecks } from "lucide-react";
import { dashboardOptions } from "@/lib/dashboard";
import { relTime, statusTone } from "@/lib/format";
import { Btn, PageHeader, Panel, PanelHeader, Pill } from "@/components/ui-kit";
import { dataRoute, useDashboard, withDashboard } from "@/lib/dashboard";
export const Route = createFileRoute("/overview")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Overview — OpenAssistant AI Ops" },
      {
        name: "description",
        content: "Live health of OpenAssistant AI's database, Telegram bot, AI providers and cron worker.",
      },
      { property: "og:title", content: "Overview — OpenAssistant AI Ops" },
      {
        property: "og:description",
        content: "Live health of OpenAssistant AI's database, bot, AI and cron worker.",
      },
    ],
  }),
  ...dataRoute,
  component: withDashboard(Overview),
});

function Overview() {
  const d = useDashboard();
  const client = useQueryClient();
  const active = d.tasks.filter((t) => t.status !== "acknowledged");
  const connected = d.providers.filter((p) => p.status === "connected");
  const cards = [
    {
      icon: Database,
      label: "Database records",
      value: `${d.tasks.length} tasks`,
      sub: `${d.memories.length} memories`,
    },
    {
      icon: Bot,
      label: "Telegram webhook",
      value: d.bot?.username ? `@${d.bot.username}` : "—",
      sub: d.bot ? (d.bot.enabled ? "active" : "disabled") : "Status not verified",
    },
    {
      icon: Cpu,
      label: "AI Provider Hub",
      value: d.routing?.manualModel ?? d.routing?.chain[0] ?? "—",
      sub: `${connected.length} verified providers`,
    },
    {
      icon: Clock,
      label: "Scheduler health",
      value: "—",
      sub: "No scheduler health source available",
    },
  ];
  return (
    <>
      <PageHeader
        title="System cockpit"
        desc="Current records from the local setup server."
        right={
          <Btn onClick={() => client.invalidateQueries({ queryKey: dashboardOptions.queryKey })}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Btn>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Panel key={c.label} className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <c.icon className="size-3.5" />
              {c.label}
            </div>
            <div className="mt-3 truncate font-mono text-lg">{c.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{c.sub}</div>
          </Panel>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader
            title="Escalating reminders"
            icon={<ListChecks className="size-4" />}
            right={
              <Link
                to="/tasks"
                search={{ filter: "all" }}
                className="text-xs text-muted-foreground"
              >
                View all
              </Link>
            }
          />
          <ul className="divide-y">
            {active.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <Pill tone={statusTone[t.status]}>{t.status}</Pill>
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="font-mono text-xs">
                  {t.followUps}/{t.maxFollowUps}
                </span>
                <span className="text-xs text-muted-foreground">{relTime(t.nextAt)}</span>
              </li>
            ))}
            {!active.length && (
              <li className="p-5 text-sm text-muted-foreground">You're all caught up.</li>
            )}
          </ul>
        </Panel>
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Memory bank"
            icon={<Brain className="size-4" />}
            right={<span className="text-xs">{d.memories.length} items</span>}
          />
          <div className="space-y-3 p-4">
            {d.categories.map((c) => (
              <div key={c} className="flex justify-between text-sm">
                <span>{c}</span>
                <span>{d.memories.filter((m) => m.category === c).length}</span>
              </div>
            ))}
            {!d.memories.length && (
              <p className="text-sm text-muted-foreground">No saved memories yet.</p>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
