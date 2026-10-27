// src/ai/intent-schema.ts
import { z } from 'zod';

export const PrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

export const CreateTaskIntentSchema = z.object({
  intent: z.literal('create_task'),
  title: z.string().min(1).max(250),
  notes: z.string().max(1000).optional(),
  priority: PrioritySchema.default('normal'),
  due_at_local: z.string().nullable().optional(), // YYYY-MM-DDTHH:mm:ss
  timezone: z.string().default('Asia/Kolkata'),
});

export const CreateTaskWithReminderIntentSchema = z.object({
  intent: z.literal('create_task_with_reminder'),
  title: z.string().min(1).max(250),
  notes: z.string().max(1000).optional(),
  priority: PrioritySchema.default('normal'),
  due_at_local: z.string(), // YYYY-MM-DDTHH:mm:ss
  reminder_offset_minutes: z.number().int().min(0).max(10080).default(0), // 0 to 7 days
  timezone: z.string().default('Asia/Kolkata'),
  needs_clarification: z.boolean().default(false),
  clarification_question: z.string().optional(),
});

export const ListTasksIntentSchema = z.object({
  intent: z.literal('list_tasks'),
  filter: z.enum(['all', 'today', 'upcoming', 'completed']).default('all'),
});

export const CompleteTaskIntentSchema = z.object({
  intent: z.literal('complete_task'),
  task_id: z.string().uuid().optional(),
  task_title_query: z.string().optional(),
});

export const SnoozeReminderIntentSchema = z.object({
  intent: z.literal('snooze_reminder'),
  reminder_id: z.string().uuid().optional(),
  snooze_minutes: z.number().int().min(1).max(10080).default(10),
});

export const RescheduleTaskIntentSchema = z.object({
  intent: z.literal('reschedule_task'),
  task_id: z.string().uuid().optional(),
  task_title_query: z.string().optional(),
  new_due_at_local: z.string(),
  new_reminder_offset_minutes: z.number().int().min(0).max(10080).optional(),
  timezone: z.string().default('Asia/Kolkata'),
});

export const CancelReminderIntentSchema = z.object({
  intent: z.literal('cancel_reminder'),
  task_id: z.string().uuid().optional(),
  reminder_id: z.string().uuid().optional(),
  task_title_query: z.string().optional(),
});

export const AskClarificationIntentSchema = z.object({
  intent: z.literal('ask_clarification'),
  question: z.string().min(1).max(500),
  reason: z.enum(['ambiguous_time', 'ambiguous_task', 'past_time', 'unsupported_request']),
});

export const ChatIntentSchema = z.object({
  intent: z.literal('chat'),
  reply: z.string().min(1).max(1000),
});

export const SaveMemoryIntentSchema = z.object({
  intent: z.literal('save_memory'),
  category: z.enum(['preference', 'project', 'goal', 'relationship', 'fact']).default('fact'),
  content: z.string().min(1).max(1000),
  key: z.string().max(100).optional(),
});

export const SearchMemoryIntentSchema = z.object({
  intent: z.literal('search_memory'),
  query: z.string().min(1).max(500),
  category: z.enum(['preference', 'project', 'goal', 'relationship', 'fact', 'all']).default('all'),
});

export const DeleteMemoryIntentSchema = z.object({
  intent: z.literal('delete_memory'),
  query: z.string().min(1).max(500),
});

export const SwitchProviderModelIntentSchema = z.object({
  intent: z.literal('switch_provider_model'),
  provider: z.string().optional(),
  model: z.string().optional(),
  mode: z.enum(['quick_answer', 'deep_reasoning', 'coding', 'budget', 'best_available', 'manual']).optional(),
  reply: z.string().optional(),
});

export const AssistantIntentSchema = z.discriminatedUnion('intent', [
  CreateTaskIntentSchema,
  CreateTaskWithReminderIntentSchema,
  ListTasksIntentSchema,
  CompleteTaskIntentSchema,
  SnoozeReminderIntentSchema,
  RescheduleTaskIntentSchema,
  CancelReminderIntentSchema,
  AskClarificationIntentSchema,
  ChatIntentSchema,
  SaveMemoryIntentSchema,
  SearchMemoryIntentSchema,
  DeleteMemoryIntentSchema,
  SwitchProviderModelIntentSchema,
]);

export type AssistantIntent = z.infer<typeof AssistantIntentSchema>;
export type CreateTaskWithReminderIntent = z.infer<typeof CreateTaskWithReminderIntentSchema>;
export type SaveMemoryIntent = z.infer<typeof SaveMemoryIntentSchema>;
export type SearchMemoryIntent = z.infer<typeof SearchMemoryIntentSchema>;
export type DeleteMemoryIntent = z.infer<typeof DeleteMemoryIntentSchema>;
export type SwitchProviderModelIntent = z.infer<typeof SwitchProviderModelIntentSchema>;
