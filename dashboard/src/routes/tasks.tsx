import { createFileRoute } from "@tanstack/react-router";
import { BellRing, Check, Pause, Play, AlarmClock, Trash2 } from "lucide-react";
import { relTime, statusTone } from "@/lib/format";
import { Btn, PageHeader, Panel, Pill } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/lib/store";
import { dataRoute, useDashboard, useOperation, withDashboard } from "@/lib/dashboard";
export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Tasks & reminders — OpenAssistant AI Ops" },
      {
        name: "description",
        content: "Escalating reminders with acknowledge and snooze controls.",
      },
      { property: "og:title", content: "Tasks & reminders — OpenAssistant AI Ops" },
      { property: "og:description", content: "Escalating reminder loop for OpenAssistant AI." },
    ],
  }),
  validateSearch: (s: { filter?: string }) => ({
    filter: filters.includes(s.filter as TaskStatus)
      ? (s.filter as (typeof filters)[number])
      : ("all" as const),
  }),
  ...dataRoute,
  component: withDashboard(Tasks),
});

const filters = ["all", "scheduled", "sending", "awaiting_ack", "acknowledged", "paused"] as const;
function Tasks() {
  const d = useDashboard();
  const action = useOperation();
  const { filter } = Route.useSearch();
  const navigate = Route.useNavigate();
  const list = filter === "all" ? d.tasks : d.tasks.filter((t) => t.status === filter);
  const run = (id: string, type: string, minutes?: number) =>
    action.mutate({
      path: `/api/tasks/${encodeURIComponent(id)}/${type}`,
      body: minutes ? { minutes } : undefined,
    });
  return (
    <>
      <PageHeader title="Tasks & reminders" desc="Persisted tasks and recorded reminder status." />
      <div className="mb-3 flex flex-wrap gap-1">
        {filters.map((f) => (
          <Btn
            key={f}
            variant="ghost"
            onClick={() => navigate({ search: { filter: f } })}
            className={cn("font-mono text-xs", filter === f && "bg-accent")}
          >
            {f}{" "}
            <span className="opacity-60">
              {f === "all" ? d.tasks.length : d.tasks.filter((t) => t.status === f).length}
            </span>
          </Btn>
        ))}
      </div>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Task</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Follow-ups</th>
              <th className="px-4 py-2.5 font-medium">Interval</th>
              <th className="px-4 py-2.5 font-medium">Next run</th>
              <th className="px-4 py-2.5 font-medium">Deadline</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {list.map((t) => (
              <tr key={t.id}>
                <td className="max-w-56 truncate px-4 py-3">{t.title}</td>
                <td className="px-4 py-3">
                  <Pill tone={statusTone[t.status]}>{t.status}</Pill>
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {t.followUps}/{t.maxFollowUps}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{t.intervalMin}m</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{relTime(t.nextAt)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {t.dueAt ? new Date(t.dueAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    <Btn
                      title="Trigger now"
                      aria-label="Trigger reminder"
                      disabled={
                        action.isPending ||
                        t.status === "acknowledged" ||
                        t.status === "paused" ||
                        !d.capabilities.includes("task_trigger")
                      }
                      onClick={() => run(t.id, "trigger")}
                    >
                      <BellRing className="size-3.5" />
                    </Btn>
                    <Btn
                      disabled={
                        action.isPending ||
                        t.status === "acknowledged" ||
                        !d.capabilities.includes("task_snooze")
                      }
                      onClick={() => run(t.id, "snooze", 60)}
                    >
                      <AlarmClock className="size-3.5" />
                      Snooze 1h
                    </Btn>
                    <Btn
                      aria-label={t.status === "paused" ? "Resume task" : "Pause task"}
                      disabled={
                        action.isPending ||
                        t.status === "acknowledged" ||
                        !d.capabilities.includes("task_pause")
                      }
                      onClick={() => run(t.id, "pause")}
                    >
                      {t.status === "paused" ? (
                        <Play className="size-3.5" />
                      ) : (
                        <Pause className="size-3.5" />
                      )}
                    </Btn>
                    <Btn
                      variant="primary"
                      disabled={
                        action.isPending ||
                        t.status === "acknowledged" ||
                        !d.capabilities.includes("task_ack")
                      }
                      onClick={() => run(t.id, "ack")}
                    >
                      <Check className="size-3.5" />
                      Ack
                    </Btn>
                    <Btn
                      variant="danger"
                      title="Delete task"
                      aria-label="Delete task"
                      disabled={
                        action.isPending ||
                        !d.capabilities.includes("task_delete")
                      }
                      onClick={() => {
                        if (window.confirm(`Delete task "${t.title}"?`)) {
                          run(t.id, "delete");
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Btn>
                  </div>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {d.tasks.length ? "No tasks in this state." : "No tasks scheduled yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
