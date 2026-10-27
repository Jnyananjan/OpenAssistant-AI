import { useLocation } from "@tanstack/react-router";
import {
  Bot,
  Brain,
  Clock,
  Cpu,
  Database,
  GitBranch,
  KeyRound,
  Link2,
  ListChecks,
  Search,
  Send,
} from "lucide-react";
import { Btn, Input, PageHeader, Panel, PanelHeader, Pill } from "./ui-kit";

function UnavailableRows({ labels }: { labels: string[] }) {
  return (
    <dl className="divide-y">
      {labels.map((label) => (
        <div key={label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-mono text-muted-foreground">—</dd>
        </div>
      ))}
    </dl>
  );
}
function BlankRows() {
  return (
    <div aria-hidden="true" className="divide-y">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center gap-4 px-4 py-4">
          <span className="h-2 w-2 shrink-0 rounded-sm bg-muted" />
          <span className="h-2 flex-1 rounded bg-muted" />
          <span className="h-2 w-12 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** Presentation only. These placeholders are never records or query data. */
export function DashboardPlaceholders() {
  const { pathname } = useLocation();
  if (pathname === "/providers")
    return (
      <>
        <PageHeader title="AI providers" desc="Connection status unavailable." />
        <div className="grid gap-3 md:grid-cols-2">
          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm">
                <Cpu className="size-4" />
                Provider connection
              </span>
              <Pill>Status not verified</Pill>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <KeyRound className="size-3.5" />
              Credentials —
            </div>
            <div className="mt-5 border-t pt-3 text-xs text-muted-foreground">
              Supported models —
            </div>
            <div className="mt-3 text-xs text-muted-foreground">Accessible models —</div>
            <div className="mt-5 flex gap-2">
              <Btn disabled>Connect provider</Btn>
              <Btn disabled>Test</Btn>
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Connection details" />
            <UnavailableRows labels={["Verification", "Default model", "Latency"]} />
          </Panel>
        </div>
      </>
    );
  if (pathname === "/routing")
    return (
      <>
        <PageHeader title="Model routing" desc="Saved routing preferences unavailable." />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {["quick_answer", "deep_reasoning", "coding", "budget", "best_available", "manual"].map(
            (mode) => (
              <Panel key={mode} className="p-4">
                <GitBranch className="size-4 text-muted-foreground" />
                <div className="mt-3 font-mono text-sm">{mode}</div>
                <div className="mt-3 text-xs text-muted-foreground">—</div>
              </Panel>
            ),
          )}
        </div>
        <Panel className="mt-6">
          <PanelHeader title="Resolution chain" />
          <div className="p-4 text-sm text-muted-foreground">Status not verified · —</div>
          <div className="px-4 pb-4">
            <Btn disabled>Save routing</Btn>
          </div>
        </Panel>
      </>
    );
  if (pathname === "/tasks")
    return (
      <>
        <PageHeader title="Tasks & reminders" desc="Tasks and reminder status unavailable." />
        <div className="mb-3 flex flex-wrap gap-1">
          {["all", "scheduled", "sending", "awaiting_ack", "acknowledged", "paused"].map(
            (filter) => (
              <Btn key={filter} variant="ghost" disabled>
                {filter} —
              </Btn>
            ),
          )}
        </div>
        <Panel>
          <PanelHeader
            title="Tasks"
            icon={<ListChecks className="size-4" />}
            right={<span className="text-xs text-muted-foreground">—</span>}
          />
          <div className="grid grid-cols-3 gap-3 border-b px-4 py-3 text-xs text-muted-foreground">
            <span>Task / status</span>
            <span>Next reminder / deadline</span>
            <span>Follow-ups</span>
          </div>
          <BlankRows />
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            Tasks could not be loaded.
          </p>
        </Panel>
      </>
    );
  if (pathname === "/memory")
    return (
      <>
        <PageHeader title="Memory explorer" desc="Saved memories unavailable." />
        <div className="mb-3 flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <div className="w-64">
            <Input disabled placeholder="Search memories" aria-label="Search memories" />
          </div>
          <Btn disabled variant="ghost">
            all —
          </Btn>
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <Panel className="lg:col-span-3">
            <PanelHeader title="Saved memories" icon={<Brain className="size-4" />} />
            <BlankRows />
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">
              Memories could not be loaded.
            </p>
          </Panel>
          <Panel className="h-fit lg:col-span-2">
            <PanelHeader title="Relationships" icon={<Link2 className="size-4" />} />
            <UnavailableRows labels={["Category", "Created", "Confidence", "Linked memories"]} />
          </Panel>
        </div>
      </>
    );
  if (pathname === "/bot")
    return (
      <>
        <PageHeader title="Telegram bot" desc="Configuration and test dispatch unavailable." />
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <PanelHeader
              title="Webhook"
              icon={<Bot className="size-4" />}
              right={<Pill>Status not verified</Pill>}
            />
            <UnavailableRows
              labels={["Username", "Bot ID", "Webhook URL", "Pending updates", "Allowed updates"]}
            />
            <div className="border-t p-4">
              <Btn disabled>Enable updates</Btn>
            </div>
          </Panel>
          <Panel className="h-fit">
            <PanelHeader title="Test message" icon={<Send className="size-4" />} />
            <div className="flex gap-2 p-4">
              <Input disabled aria-label="Test message" placeholder="Message" />
              <Btn disabled>
                <Send className="size-3.5" />
                Send
              </Btn>
            </div>
            <p className="px-4 pb-4 text-xs text-muted-foreground">Delivery status —</p>
          </Panel>
        </div>
      </>
    );
  return (
    <>
      <PageHeader title="System cockpit" desc="System data unavailable." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Database", icon: Database },
          { label: "Telegram webhook", icon: Bot },
          { label: "AI Provider Hub", icon: Cpu },
          { label: "Scheduler health", icon: Clock },
        ].map(({ label, icon: Icon }) => (
          <Panel key={label} className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="size-3.5" />
              {label}
            </div>
            <div className="mt-3 font-mono text-lg text-muted-foreground">—</div>
            <div className="mt-1 text-xs text-muted-foreground">Status not verified</div>
          </Panel>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader
            title="Escalating reminders"
            icon={<ListChecks className="size-4" />}
            right={<span className="text-xs text-muted-foreground">— tasks</span>}
          />
          <BlankRows />
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            Reminder data unavailable.
          </p>
        </Panel>
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Memory bank"
            icon={<Brain className="size-4" />}
            right={<span className="text-xs text-muted-foreground">— items</span>}
          />
          <UnavailableRows labels={["Saved memories", "Categories", "Relationships"]} />
        </Panel>
      </div>
    </>
  );
}
