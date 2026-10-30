import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Bot,
  Database,
  ExternalLink,
} from "lucide-react";
import { dashboardOptions } from "@/lib/dashboard";
import { PageHeader, Panel, Pill } from "./ui-kit";

export function ConnectionsHub() {
  const query = useSuspenseQuery(dashboardOptions);
  const data = query.data.status === "ready" ? query.data.data : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connections & Channels"
        desc="Manage communication channels, active bot webhooks, and database infrastructure."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {/* 1. Telegram Bot Card */}
        <Panel className="flex flex-col justify-between p-5">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border bg-sky-500/10 text-sky-500 font-bold">
                  <Bot className="size-5" />
                </span>
                <div>
                  <h4 className="text-sm font-semibold">Telegram Bot</h4>
                  <p className="text-xs text-muted-foreground">Conversational AI & smart notifications</p>
                </div>
              </div>
              <Pill tone={data?.bot?.enabled ? "success" : "muted"} dot>
                {data?.bot?.username ? `@${data.bot.username}` : data?.bot?.enabled ? "Connected" : "Standby"}
              </Pill>
            </div>
            <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
              Primary interface for capturing tasks, managing reminders with interactive buttons, logging expenses, and morning briefings.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between border-t pt-4">
            <span className="text-xs text-muted-foreground">
              Webhook: {data?.bot?.webhookUrl ? "Active" : "Polling"}
            </span>
            <a
              href={data?.bot?.username ? `https://t.me/${data.bot.username}` : "https://t.me/BotFather"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Open in Telegram <ExternalLink className="size-3" />
            </a>
          </div>
        </Panel>

        {/* 2. Database Backend Card */}
        <Panel className="flex flex-col justify-between p-5">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border bg-emerald-500/10 text-emerald-500 font-bold">
                  <Database className="size-5" />
                </span>
                <div>
                  <h4 className="text-sm font-semibold">Supabase Postgres</h4>
                  <p className="text-xs text-muted-foreground">Encrypted state & pg_cron worker</p>
                </div>
              </div>
              <Pill tone="success" dot>Connected</Pill>
            </div>
            <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
              Provides row-level secure database storage, AES-256 credential encryption, and minute-precision scheduled cron evaluation.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between border-t pt-4">
            <span className="text-xs text-muted-foreground">RLS & Definer Hardened</span>
            <span className="font-mono text-xs text-muted-foreground">PostgreSQL 15</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
