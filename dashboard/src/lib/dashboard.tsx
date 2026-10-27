import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { toast } from "sonner";
import { createContext, useContext, type ComponentType } from "react";
import { ApiError, apiBase, getDashboard, operation, type Dashboard } from "./api";
import { Btn, PageHeader, Panel } from "@/components/ui-kit";
import { DashboardPlaceholders } from "@/components/DashboardPlaceholders";
export type DashboardResult =
  { status: "ready"; data: Dashboard } | { status: "unavailable"; message: string };
export async function loadDashboard(signal?: AbortSignal): Promise<DashboardResult> {
  try {
    return { status: "ready", data: await getDashboard(signal) };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "CancelledError" ||
        error.name === "AbortError" ||
        error.message.includes("Cancelled") ||
        error.message.includes("aborted"))
    ) {
      return { status: "unavailable", message: "Connecting to setup service..." };
    }
    // Connection/configuration failures are expected UI states, not route crashes.
    if (error instanceof ApiError) return { status: "unavailable", message: error.message };
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "Unable to reach the local setup server.",
    };
  }
}
const DashboardContext = createContext<Dashboard | null>(null);
export const dashboardOptions = queryOptions({
  queryKey: ["local-dashboard", apiBase],
  queryFn: ({ signal }) => loadDashboard(signal),
  staleTime: 30000,
  retry: false,
});
export function useDashboard() {
  const data = useContext(DashboardContext);
  if (!data) throw new Error("Dashboard content must be inside its data boundary.");
  return data;
}
export function withDashboard(Content: ComponentType) {
  return function DashboardPage() {
    const query = useSuspenseQuery(dashboardOptions);
    const result = query.data;
    if (result.status === "unavailable")
      return (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/20 bg-warning/10 px-4 py-3">
            <p role="alert" className="text-sm text-muted-foreground">
              Data unavailable · {result.message}
            </p>
            <Btn disabled={query.isFetching} onClick={() => void query.refetch()}>
              {query.isFetching ? "Retrying…" : "Retry"}
            </Btn>
          </div>
          <DashboardPlaceholders />
        </>
      );
    return (
      <DashboardContext.Provider value={result.data}>
        <Content />
      </DashboardContext.Provider>
    );
  };
}
export function useOperation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => operation(path, body),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: dashboardOptions.queryKey });
      toast.success("Operation confirmed by setup server");
    },
    onError: (error) => toast.error(error.message),
  });
}
export function DataLoading() {
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-3">
      <div className="h-7 w-48 animate-pulse rounded bg-muted" />
      <div className="h-32 animate-pulse rounded-lg border bg-muted" />
      <span className="text-sm text-muted-foreground">Loading data…</span>
    </div>
  );
}
export function DataError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const client = useQueryClient();
  const isCancelled =
    error instanceof Error &&
    (error.name === "CancelledError" ||
      error.message.includes("Cancelled") ||
      error.name === "AbortError" ||
      error.message.includes("aborted"));

  return (
    <>
      <PageHeader title="Unable to load data" desc="Local setup server" />
      <Panel className="p-5">
        <p role="alert" className="text-sm text-muted-foreground">
          {isCancelled
            ? "Connecting to local setup service..."
            : error instanceof Error
              ? error.message
              : "Unable to load data. Please retry."}
        </p>
        <Btn
          className="mt-4"
          onClick={async () => {
            await client.resetQueries({ queryKey: dashboardOptions.queryKey });
            await router.invalidate();
            reset?.();
          }}
        >
          Retry
        </Btn>
      </Panel>
    </>
  );
}
export const dataRoute = {
  ssr: false as const,
  loader: async ({
    context,
  }: {
    context: { queryClient: import("@tanstack/react-query").QueryClient };
  }) => {
    try {
      return await context.queryClient.ensureQueryData(dashboardOptions);
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === "CancelledError" ||
          err.message.includes("Cancelled") ||
          err.name === "AbortError")
      ) {
        return (
          context.queryClient.getQueryData(dashboardOptions.queryKey) ?? {
            status: "unavailable" as const,
            message: "Connecting to setup service...",
          }
        );
      }
      throw err;
    }
  },
  pendingMs: 0,
  pendingComponent: DataLoading,
  errorComponent: DataError,
  notFoundComponent: () => <Panel className="p-5">No data found.</Panel>,
};
