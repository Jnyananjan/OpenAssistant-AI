import type { MemoryCategory, TaskStatus } from "./store";
import type { Tone } from "@/components/ui-kit";

export const statusTone: Record<TaskStatus, Tone> = {
  scheduled: "info",
  sending: "warning",
  awaiting_ack: "warning",
  acknowledged: "success",
  paused: "muted",
};
export const catTone: Record<MemoryCategory, string> = {
  preference: "bg-chart-1",
  project: "bg-chart-2",
  goal: "bg-chart-3",
  relationship: "bg-chart-4",
  fact: "bg-chart-5",
};
export const categories: MemoryCategory[] = [
  "preference",
  "project",
  "goal",
  "relationship",
  "fact",
];

export function relTime(iso: string | null) {
  if (!iso || !Number.isFinite(new Date(iso).getTime())) return "—";
  const d = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  const a = Math.abs(d);
  const s = a < 60 ? `${a}m` : a < 1440 ? `${Math.round(a / 60)}h` : `${Math.round(a / 1440)}d`;
  return d >= 0 ? `in ${s}` : `${s} ago`;
}
