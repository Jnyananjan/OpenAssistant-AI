import { createFileRoute, Link } from "@tanstack/react-router";
import { Brain, Code2, Coins, Sparkles, Zap, SlidersHorizontal, Plus, Cpu } from "lucide-react";
import { Btn, PageHeader, Panel, Pill } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { RoutingMode } from "@/lib/store";
import { dataRoute, useDashboard, useOperation, withDashboard } from "@/lib/dashboard";
import { WorkloadAdvisor } from "@/components/WorkloadAdvisor";
import { buildCandidates } from "@/lib/advisor";
export const Route = createFileRoute("/routing")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Model routing — OpenAssistant AI Ops" },
      { name: "description", content: "Choose how OpenAssistant AI routes each request to a model." },
      { property: "og:title", content: "Model routing — OpenAssistant AI Ops" },
      { property: "og:description", content: "Smart routing modes for OpenAssistant AI." },
    ],
  }),
  ...dataRoute,
  component: withDashboard(Routing),
});

const modes = [
  { id: "quick_answer", icon: Zap, desc: "Lowest latency for short replies" },
  { id: "deep_reasoning", icon: Brain, desc: "Multi-step thinking, long context" },
  { id: "coding", icon: Code2, desc: "Code generation and review" },
  { id: "budget", icon: Coins, desc: "Cheapest capable model" },
  { id: "best_available", icon: Sparkles, desc: "Best verified provider" },
  { id: "manual", icon: SlidersHorizontal, desc: "Use a pinned model" },
] as const;
function Routing() {
  const d = useDashboard();
  const action = useOperation();
  const all = [
    ...new Set(
      d.providers.filter((p) => p.status === "connected").flatMap((p) => p.accessibleModels),
    ),
  ];
  const save = (mode: RoutingMode, manualModel = d.routing?.manualModel ?? null) =>
    action.mutate({ path: "/api/routing/save", body: { mode, manualModel } });
  const allowed = d.capabilities.includes("routing_save");
  return (
    <>
      <PageHeader
        title="Model routing"
        desc={d.routing ? "Saved routing preferences." : "No routing preference configured."}
      />
      <WorkloadAdvisor
        candidates={buildCandidates(d.providers)}
        canSave={allowed}
        saving={action.isPending}
        onUseModel={(model: string) => save("manual", model)}
      />
      {!all.length && (
        <Panel className="mt-6 flex flex-wrap items-center gap-4 p-5">
          <Cpu className="size-5 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Add a model first</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Routing needs at least one connected provider with accessible models. Connect one to
              enable the modes below.
            </p>
          </div>
          <Link to="/providers">
            <Btn variant="primary">
              <Plus className="size-3.5" />
              Add model first
            </Btn>
          </Link>
        </Panel>
      )}
      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {modes.map((m) => (
          <div
            key={m.id}
            className={cn(
              "relative rounded-lg border bg-card p-4",
              d.routing?.mode === m.id && "border-primary/60 ring-1 ring-primary/40",
            )}
          >
            <button
              type="button"
              disabled={!allowed || action.isPending || (m.id === "manual" && !all.length)}
              onClick={() => save(m.id, m.id === "manual" ? (all[0] ?? null) : null)}
              className="block w-full text-left disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <m.icon className="size-4 text-muted-foreground" />
              <span className="mt-3 block font-mono text-sm">{m.id}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{m.desc}</span>
            </button>
            <Btn
              variant="ghost"
              aria-label={`Assign a model to ${m.id}`}
              title={`Assign a model to ${m.id}`}
              disabled={!allowed || action.isPending || !all.length}
              onClick={() => save(m.id, m.id === "manual" ? (all[0] ?? null) : null)}
              className="absolute right-2 top-2 size-7 px-0"
            >
              <Plus className="size-4" />
            </Btn>
          </div>
        ))}
      </div>
      <Panel className="mt-6 p-4">
        <div className="text-sm font-medium">Resolution chain</div>
        {d.routing?.mode === "manual" && (
          <select
            aria-label="Pinned model"
            disabled={!allowed || action.isPending}
            value={d.routing.manualModel ?? ""}
            onChange={(e) => save("manual", e.target.value)}
            className="mt-3 h-8 max-w-full rounded-md border bg-background px-2 font-mono text-xs"
          >
            <option value="">Select model</option>
            {all.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {d.routing?.chain.map((m) => (
            <Pill key={m} tone={all.includes(m) ? "success" : "muted"}>
              {m}
            </Pill>
          ))}
        </div>
        {!d.routing?.chain.length && (
          <p className="mt-3 text-xs text-muted-foreground">No active chain configured.</p>
        )}
        {!allowed && (
          <p className="mt-3 text-xs text-muted-foreground">
            Routing changes are not supported by the setup server.
          </p>
        )}
      </Panel>
    </>
  );
}
