/** DTOs only: persisted runtime state belongs to the setup server, never this module. */
export type TaskStatus = "scheduled" | "sending" | "awaiting_ack" | "acknowledged" | "paused";
export type MemoryCategory = string;
export type RoutingMode =
  "quick_answer" | "deep_reasoning" | "coding" | "budget" | "best_available" | "manual";
export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  followUps: number;
  maxFollowUps: number;
  nextAt: string | null;
  dueAt: string | null;
  intervalMin: number;
  chat: string | null;
}
export interface Memory {
  id: string;
  category: string;
  content: string;
  confidence: number | null;
  related: string[];
  createdAt: string;
}
export interface Provider {
  id: string;
  name: string;
  configured: boolean;
  status: "connected" | "error" | "unset" | "unverified";
  verifiedAt: string | null;
  models: string[];
  accessibleModels: string[];
  defaultModel: string | null;
  latencyMs: number | null;
}
