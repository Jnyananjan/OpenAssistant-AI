import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Activity, Brain, Cpu, GitBranch, ListChecks, Rocket } from "lucide-react";
import { dashboardOptions } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/overview", label: "Overview", icon: Activity },
  { to: "/setup", label: "Setup", icon: Rocket },
  { to: "/providers", label: "Providers", icon: Cpu },
  { to: "/routing", label: "Routing", icon: GitBranch },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/memory", label: "Memory", icon: Brain },
] as const;

function CoreStatus() {
  const query = useQuery(dashboardOptions);
  const ready = query.data?.status === "ready";
  return (
    <div className="mt-auto border-t p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">OpenAssistant AI Core</span>
        <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          v1.0.0
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "size-1.5 rounded-full",
            query.isPending && "animate-pulse bg-warning",
            ready && "animate-pulse bg-success",
            query.data?.status === "unavailable" && "bg-destructive",
          )}
        />
        {query.isPending
          ? "Connecting…"
          : ready
            ? "Active Engine · Ready"
            : "Setup service offline"}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <img
            src="/logo.png"
            alt="OpenAssistant Mascot Logo"
            className="size-7 rounded-lg object-contain shadow-sm"
          />
          <span className="text-sm font-semibold tracking-tight">OpenAssistant AI</span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">ops</span>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent !text-sidebar-accent-foreground" }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <CoreStatus />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
          <img
            src="/logo.png"
            alt="OpenAssistant Mascot Logo"
            className="size-6 shrink-0 rounded object-contain"
          />
          <div className="flex gap-1 overflow-x-auto">
            {nav.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className="whitespace-nowrap rounded px-2 py-1 text-xs text-muted-foreground"
                activeProps={{ className: "bg-accent !text-foreground" }}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
