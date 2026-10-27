import { z } from "zod";

/** Local deployment configuration, not persistent application state. */
export const apiBase = (import.meta.env["VITE_SETUP_API_BASE"] || "http://localhost:4000").replace(
  /\/$/,
  "",
);
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T = unknown>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(cancel, path === "/api/setup/webhook" ? 120000 : 15000);
  try {
    const response = await fetch(apiBase + path, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? null : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok)
      throw new ApiError(
        response.status,
        response.status === 404
          ? "This operation is not supported by the setup server."
          : `Setup server request failed (HTTP ${response.status}).`,
      );
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new ApiError(502, "The setup server returned an invalid response.");
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, "Unable to reach the local setup server. Check its address and retry.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
const timestamp = z.string().datetime({ offset: true });
const nonnegative = z.number().finite().nonnegative();
export const dashboardSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string(),
      status: z.enum(["scheduled", "sending", "awaiting_ack", "acknowledged", "paused"]),
      followUps: nonnegative.int(),
      maxFollowUps: nonnegative.int(),
      nextAt: timestamp.nullable(),
      dueAt: timestamp.nullable(),
      intervalMin: nonnegative,
      chat: z.string().nullable(),
    }),
  ),
  memories: z.array(
    z.object({
      id: z.string().min(1),
      category: z.string(),
      content: z.string(),
      confidence: z.number().min(0).max(1).nullable(),
      related: z.array(z.string()),
      createdAt: timestamp,
    }),
  ),
  categories: z.array(z.string()),
  providers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      configured: z.boolean(),
      status: z.enum(["connected", "error", "unset", "unverified"]),
      verifiedAt: timestamp.nullable(),
      models: z.array(z.string()),
      accessibleModels: z.array(z.string()),
      defaultModel: z.string().nullable(),
      latencyMs: nonnegative.nullable(),
      baseUrl: z.string().url().nullable().optional(),
    }),
  ),
  routing: z
    .object({
      mode: z.enum([
        "quick_answer",
        "deep_reasoning",
        "coding",
        "budget",
        "best_available",
        "manual",
      ]),
      manualModel: z.string().nullable(),
      chain: z.array(z.string()),
    })
    .nullable(),
  bot: z
    .object({
      username: z.string().nullable(),
      id: z.number().int().nullable(),
      verifiedAt: timestamp,
      webhookUrl: z.string().nullable(),
      enabled: z.boolean(),
      pendingUpdates: nonnegative.int().nullable(),
      allowedUpdates: z.array(z.string()).nullable(),
    })
    .nullable(),
  capabilities: z.array(
    z.enum([
      "task_ack",
      "task_snooze",
      "task_pause",
      "task_trigger",
      "task_delete",
      "routing_save",
      "provider_test",
      "provider_save_encrypted",
      "provider_remove",
      "provider_model_save",
      "provider_draft_test",
      "webhook_toggle",
      "bot_send",
    ]),
  ),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
export function validateDashboard(input: unknown): Dashboard {
  const result = dashboardSchema.safeParse(input);
  if (!result.success)
    throw new ApiError(
      502,
      "The setup server dashboard response is incompatible. No data has been substituted.",
    );
  return {
    ...result.data,
    providers: result.data.providers.map((p) => ({
      ...p,
      status:
        p.status === "connected" && (!p.configured || !p.verifiedAt)
          ? ("unverified" as const)
          : p.status,
    })),
  };
}
export async function getDashboard(signal?: AbortSignal) {
  return validateDashboard(await api("GET", "/api/dashboard", undefined, signal));
}
/** Require an application-level acknowledgment, not only HTTP 200. */
export async function operation(path: string, body?: unknown) {
  const result = z
    .object({ ok: z.literal(true) })
    .passthrough()
    .safeParse(await api("POST", path, body));
  if (!result.success) throw new ApiError(502, "The setup server did not confirm this operation.");
  return result.data;
}
