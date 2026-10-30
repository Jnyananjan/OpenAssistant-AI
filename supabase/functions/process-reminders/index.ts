// src/shared/clock.ts
var SystemClock = class {
  now() {
    return /* @__PURE__ */ new Date();
  }
};

// src/shared/time.ts
function formatLocalDateTime(dateOrIso, timeZone = "Asia/Kolkata") {
  const date = typeof dateOrIso === "string" ? new Date(dateOrIso) : dateOrIso;
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
      timeZone
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
      timeZone: "UTC"
    }).format(date);
  }
}
function parseLocalToUtc(localIsoString, timeZone = "Asia/Kolkata") {
  if (localIsoString.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(localIsoString)) {
    return new Date(localIsoString);
  }
  const parts = localIsoString.split(/[-T:.]/);
  if (parts.length < 5) {
    throw new Error(`Invalid local ISO string format: ${localIsoString}`);
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const hour = parseInt(parts[3], 10);
  const minute = parseInt(parts[4], 10);
  const second = parts[5] ? parseInt(parts[5], 10) : 0;
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false
  });
  const getOffsetMs = (date) => {
    const formattedParts = formatter.formatToParts(date);
    const partMap = {};
    for (const part of formattedParts) {
      if (part.type !== "literal") {
        partMap[part.type] = parseInt(part.value, 10);
      }
    }
    const tzHour = partMap.hour === 24 ? 0 : partMap.hour;
    const targetTimeInTz = Date.UTC(
      partMap.year,
      partMap.month - 1,
      partMap.day,
      tzHour,
      partMap.minute,
      partMap.second
    );
    return targetTimeInTz - date.getTime();
  };
  const offset1 = getOffsetMs(utcGuess);
  const firstResult = new Date(utcGuess.getTime() - offset1);
  const offset2 = getOffsetMs(firstResult);
  return offset1 === offset2 ? firstResult : new Date(utcGuess.getTime() - offset2);
}

// src/ai/intent-schema.ts
import { z } from "npm:zod@3";
var PrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
var CreateTaskIntentSchema = z.object({
  intent: z.literal("create_task"),
  title: z.string().min(1).max(250),
  notes: z.string().max(1e3).optional(),
  priority: PrioritySchema.default("normal"),
  due_at_local: z.string().nullable().optional(),
  // YYYY-MM-DDTHH:mm:ss
  timezone: z.string().default("Asia/Kolkata")
});
var CreateTaskWithReminderIntentSchema = z.object({
  intent: z.literal("create_task_with_reminder"),
  title: z.string().min(1).max(250),
  notes: z.string().max(1e3).optional(),
  priority: PrioritySchema.default("normal"),
  due_at_local: z.string(),
  // YYYY-MM-DDTHH:mm:ss
  reminder_offset_minutes: z.number().int().min(0).max(10080).default(0),
  // 0 to 7 days
  timezone: z.string().default("Asia/Kolkata"),
  needs_clarification: z.boolean().default(false),
  clarification_question: z.string().optional()
});
var ListTasksIntentSchema = z.object({
  intent: z.literal("list_tasks"),
  filter: z.enum(["all", "today", "upcoming", "completed"]).default("all")
});
var CompleteTaskIntentSchema = z.object({
  intent: z.literal("complete_task"),
  task_id: z.string().uuid().optional(),
  task_title_query: z.string().optional()
});
var SnoozeReminderIntentSchema = z.object({
  intent: z.literal("snooze_reminder"),
  reminder_id: z.string().uuid().optional(),
  snooze_minutes: z.number().int().min(1).max(10080).default(10)
});
var RescheduleTaskIntentSchema = z.object({
  intent: z.literal("reschedule_task"),
  task_id: z.string().uuid().optional(),
  task_title_query: z.string().optional(),
  new_due_at_local: z.string(),
  new_reminder_offset_minutes: z.number().int().min(0).max(10080).optional(),
  timezone: z.string().default("Asia/Kolkata")
});
var CancelReminderIntentSchema = z.object({
  intent: z.literal("cancel_reminder"),
  task_id: z.string().uuid().optional(),
  reminder_id: z.string().uuid().optional(),
  task_title_query: z.string().optional()
});
var AskClarificationIntentSchema = z.object({
  intent: z.literal("ask_clarification"),
  question: z.string().min(1).max(500),
  reason: z.enum(["ambiguous_time", "ambiguous_task", "past_time", "unsupported_request"])
});
var ChatIntentSchema = z.object({
  intent: z.literal("chat"),
  reply: z.string().min(1).max(1e3)
});
var SaveMemoryIntentSchema = z.object({
  intent: z.literal("save_memory"),
  category: z.enum(["preference", "project", "goal", "relationship", "fact"]).default("fact"),
  content: z.string().min(1).max(1e3),
  key: z.string().max(100).optional()
});
var SearchMemoryIntentSchema = z.object({
  intent: z.literal("search_memory"),
  query: z.string().min(1).max(500),
  category: z.enum(["preference", "project", "goal", "relationship", "fact", "all"]).default("all")
});
var DeleteMemoryIntentSchema = z.object({
  intent: z.literal("delete_memory"),
  query: z.string().min(1).max(500)
});
var SwitchProviderModelIntentSchema = z.object({
  intent: z.literal("switch_provider_model"),
  provider: z.string().optional(),
  model: z.string().optional(),
  mode: z.enum(["quick_answer", "deep_reasoning", "coding", "budget", "best_available", "manual"]).optional(),
  reply: z.string().optional()
});
var AssistantIntentSchema = z.discriminatedUnion("intent", [
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
  SwitchProviderModelIntentSchema
]);

// src/bot/messages.ts
function createReminderNotificationMessage(chatId, reminderId, taskTitle, dueAt, timeZone, followUpCount) {
  const isFollowUp = followUpCount > 0;
  const header = isFollowUp ? `\u23F0 *OpenAssistant AI Reminder (Follow-up #${followUpCount})*` : `\u23F0 *OpenAssistant AI Reminder*`;
  let body = `${header}

*Task:* ${escapeMarkdown(taskTitle)}
`;
  if (dueAt) {
    body += `*Deadline:* ${formatLocalDateTime(dueAt, timeZone)}
`;
  }
  body += `
Have you completed this task?`;
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "\u2705 Done", callback_data: `done:${reminderId}` },
        { text: "\u{1F4A4} Snooze 10m", callback_data: `snooze:${reminderId}:10` }
      ],
      [
        { text: "\u{1F4C5} Reschedule", callback_data: `resched:${reminderId}` }
      ]
    ]
  };
  return {
    chat_id: chatId,
    text: body,
    parse_mode: "Markdown",
    reply_markup: replyMarkup
  };
}
function createPausedReminderMessage(chatId, taskTitle, followUpCount) {
  return {
    chat_id: chatId,
    text: `\u23F8\uFE0F *Reminder Escalation Paused*

*Task:* ${escapeMarkdown(taskTitle)}

I have followed up ${followUpCount} times without acknowledgement. To protect your peace, further reminders for this task are paused.

You can still mark it done with /done or reschedule it anytime.`,
    parse_mode: "Markdown"
  };
}
function escapeMarkdown(text) {
  return text.replace(/[_*`[]/g, "\\$&");
}

// src/bot/telegram-client.ts
var TelegramClient = class {
  botToken;
  baseUrl;
  fetch;
  constructor(config) {
    this.botToken = config.botToken;
    this.baseUrl = config.baseUrl || "https://api.telegram.org";
    this.fetch = config.fetchFn || globalThis.fetch.bind(globalThis);
  }
  async sendText(input) {
    const url = `${this.baseUrl}/bot${this.botToken}/sendMessage`;
    const body = {
      chat_id: input.chat_id,
      text: input.text
    };
    if (input.parse_mode) {
      body.parse_mode = input.parse_mode;
    }
    if (input.reply_markup) {
      body.reply_markup = input.reply_markup;
    }
    try {
      const response = await this.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        return {
          ok: false,
          error: data.description || `HTTP status ${response.status}`
        };
      }
      return {
        ok: true,
        message_id: data.result?.message_id
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Network failure: ${msg}`
      };
    }
  }
  async answerCallbackQuery(callback_query_id, text) {
    const url = `${this.baseUrl}/bot${this.botToken}/answerCallbackQuery`;
    try {
      const response = await this.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id,
          text
        })
      });
      const data = await response.json();
      return response.ok && Boolean(data.ok);
    } catch {
      return false;
    }
  }
  async deleteMessage(chat_id, message_id) {
    const url = `${this.baseUrl}/bot${this.botToken}/deleteMessage`;
    try {
      const response = await this.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          message_id
        })
      });
      const data = await response.json();
      return response.ok && Boolean(data.ok);
    } catch {
      return false;
    }
  }
};

// src/bot/commands.ts
import { randomBytes as randomBytes2 } from "node:crypto";

// src/security/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

// src/bot/callbacks.ts
import { randomBytes as randomBytes3 } from "node:crypto";

// src/db/supabase-repository.ts
import { createClient } from "npm:@supabase/supabase-js@2";
var SupabaseDatabaseRepository = class {
  client;
  constructor(config, client) {
    this.client = client || createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false }
    });
  }
  async getOrCreateUser(telegramUserId, telegramChatId, displayName) {
    const { data: existing, error: selectErr } = await this.client.from("app_users").select("*").eq("telegram_user_id", telegramUserId).maybeSingle();
    if (selectErr) {
      throw new Error(`Failed to fetch user: ${selectErr.message}`);
    }
    if (existing) {
      if (existing.telegram_chat_id !== telegramChatId || displayName && existing.display_name !== displayName) {
        const { data: updated } = await this.client.from("app_users").update({
          telegram_chat_id: telegramChatId,
          display_name: displayName || existing.display_name,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }).eq("id", existing.id).select("*").single();
        if (updated) return updated;
      }
      return existing;
    }
    const { data: created, error: insertErr } = await this.client.from("app_users").insert({
      telegram_user_id: telegramUserId,
      telegram_chat_id: telegramChatId,
      display_name: displayName || null,
      timezone: "Asia/Kolkata"
    }).select("*").single();
    if (insertErr || !created) {
      throw new Error(`Failed to create user: ${insertErr?.message}`);
    }
    return created;
  }
  async getUserByTelegramId(telegramUserId) {
    const { data } = await this.client.from("app_users").select("*").eq("telegram_user_id", telegramUserId).maybeSingle();
    return data || null;
  }
  async updateUserTimezone(userId, timezone) {
    const { data, error } = await this.client.from("app_users").update({ timezone, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", userId).select("*").single();
    if (error || !data) {
      throw new Error(`Failed to update timezone: ${error?.message}`);
    }
    return data;
  }
  async recordUpdate(updateId, telegramUserId) {
    const { error } = await this.client.from("telegram_updates").insert({
      update_id: updateId,
      telegram_user_id: telegramUserId || null,
      status: "received"
    });
    if (error) {
      if (error.code === "23505" || error.message.includes("duplicate")) {
        return { isDuplicate: true };
      }
      throw new Error(`Failed to record update: ${error.message}`);
    }
    return { isDuplicate: false };
  }
  async markUpdateProcessed(updateId, status, errorMessage) {
    await this.client.from("telegram_updates").update({
      status,
      processed_at: (/* @__PURE__ */ new Date()).toISOString(),
      error_message: errorMessage || null
    }).eq("update_id", updateId);
  }
  async createTask(userId, title, dueAt, priority = "normal", notes) {
    const { data, error } = await this.client.from("tasks").insert({
      user_id: userId,
      title,
      notes: notes || null,
      due_at: dueAt,
      priority,
      status: "open"
    }).select("*").single();
    if (error || !data) {
      throw new Error(`Failed to create task: ${error?.message}`);
    }
    return data;
  }
  async listTasks(userId, filter = "all", userTimezone = "Asia/Kolkata") {
    let query = this.client.from("tasks").select("*").eq("user_id", userId).order("due_at", { ascending: true, nullsFirst: false });
    if (filter === "completed") {
      query = query.eq("status", "completed");
    } else {
      query = query.eq("status", "open");
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to list tasks: ${error.message}`);
    }
    const tasks = data || [];
    if (filter === "today") {
      const now = /* @__PURE__ */ new Date();
      const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: userTimezone }).format(now);
      const startOfDay = parseLocalToUtc(`${localDate}T00:00:00`, userTimezone).getTime();
      const nextDayDate = new Date(startOfDay + 26 * 60 * 60 * 1e3);
      const nextLocalDate = new Intl.DateTimeFormat("en-CA", { timeZone: userTimezone }).format(nextDayDate);
      const endOfDay = parseLocalToUtc(`${nextLocalDate}T00:00:00`, userTimezone).getTime();
      return tasks.filter((t) => {
        if (!t.due_at) return false;
        const due = new Date(t.due_at).getTime();
        return due >= startOfDay && due < endOfDay;
      });
    }
    if (filter === "upcoming") {
      const nowTime = Date.now();
      return tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() >= nowTime);
    }
    return tasks;
  }
  async getTaskById(taskId, userId) {
    const { data } = await this.client.from("tasks").select("*").eq("id", taskId).eq("user_id", userId).maybeSingle();
    return data || null;
  }
  async completeTask(userId, taskId) {
    const { data, error } = await this.client.from("tasks").update({ status: "completed", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", taskId).eq("user_id", userId).select("*").maybeSingle();
    if (error || !data) return null;
    await this.cancelRemindersForTask(taskId, userId);
    return data;
  }
  async cancelTask(userId, taskId) {
    const { data, error } = await this.client.from("tasks").update({ status: "cancelled", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", taskId).eq("user_id", userId).select("*").maybeSingle();
    if (error || !data) return null;
    await this.cancelRemindersForTask(taskId, userId);
    return data;
  }
  async findTaskByTitle(userId, titleQuery) {
    const query = titleQuery.trim();
    const { data } = await this.client.from("tasks").select("*").eq("user_id", userId).eq("status", "open").ilike("title", `%${query}%`).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data || null;
  }
  async createReminder(userId, taskId, scheduledAt, maxFollowUps = 8) {
    const { data, error } = await this.client.from("reminders").insert({
      user_id: userId,
      task_id: taskId,
      scheduled_at: scheduledAt,
      status: "scheduled",
      max_follow_ups: maxFollowUps
    }).select("*").single();
    if (error || !data) {
      throw new Error(`Failed to create reminder: ${error?.message}`);
    }
    return data;
  }
  async createTaskWithReminder(userId, title, dueAt, reminderAt, priority = "normal", maxFollowUps = 8) {
    const task = await this.createTask(userId, title, dueAt, priority);
    const reminder = await this.createReminder(userId, task.id, reminderAt, maxFollowUps);
    await this.recordEvent(
      userId,
      "reminder_created",
      { taskTitle: title, dueAt, scheduledAt: reminderAt },
      reminder.id,
      task.id
    );
    return { task, reminder };
  }
  async getReminder(reminderId) {
    const { data } = await this.client.from("reminders").select("*").eq("id", reminderId).maybeSingle();
    return data || null;
  }
  async acknowledgeReminder(reminderId, userId) {
    const existing = await this.getReminder(reminderId);
    if (!existing || existing.user_id !== userId) return null;
    if (existing.status === "cancelled" || existing.status === "rescheduled") {
      return null;
    }
    if (existing.status === "acknowledged") {
      return existing;
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const { data: updated } = await this.client.from("reminders").update({
      status: "acknowledged",
      acknowledged_at: now,
      next_follow_up_at: null,
      lease_token: null,
      lease_until: null,
      updated_at: now
    }).eq("id", reminderId).select("*").maybeSingle();
    if (updated) {
      await this.client.from("tasks").update({ status: "completed", updated_at: now }).eq("id", existing.task_id).eq("status", "open");
      await this.recordEvent(
        userId,
        "reminder_acknowledged",
        {},
        reminderId,
        existing.task_id
      );
      return updated;
    }
    return null;
  }
  async snoozeReminder(reminderId, userId, newScheduledAt) {
    const existing = await this.getReminder(reminderId);
    if (!existing || existing.user_id !== userId) return null;
    if (existing.status === "cancelled" || existing.status === "acknowledged" || existing.status === "rescheduled") {
      return null;
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const { data: updated } = await this.client.from("reminders").update({
      status: "scheduled",
      scheduled_at: newScheduledAt,
      next_follow_up_at: null,
      lease_token: null,
      lease_until: null,
      updated_at: now
    }).eq("id", reminderId).select("*").maybeSingle();
    if (updated) {
      await this.recordEvent(
        userId,
        "reminder_snoozed",
        { newScheduledAt },
        reminderId,
        existing.task_id
      );
      return updated;
    }
    return null;
  }
  async rescheduleTaskAndReminder(userId, taskId, reminderId, newDueAt, newReminderAt) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const { data: task, error: taskErr } = await this.client.from("tasks").update({ due_at: newDueAt, status: "open", updated_at: now }).eq("id", taskId).eq("user_id", userId).select("*").single();
    if (taskErr || !task) throw new Error("Task not found");
    let targetReminderId = reminderId;
    if (!targetReminderId) {
      const { data: existingReminders } = await this.client.from("reminders").select("id").eq("task_id", taskId).eq("user_id", userId).order("created_at", { ascending: false }).limit(1);
      if (existingReminders && existingReminders.length > 0) {
        targetReminderId = existingReminders[0].id;
      }
    }
    let reminder;
    if (targetReminderId) {
      const { data: updatedRem } = await this.client.from("reminders").update({
        status: "scheduled",
        scheduled_at: newReminderAt,
        next_follow_up_at: null,
        follow_up_count: 0,
        lease_token: null,
        lease_until: null,
        updated_at: now
      }).eq("id", targetReminderId).select("*").single();
      reminder = updatedRem;
    } else {
      reminder = await this.createReminder(userId, taskId, newReminderAt);
    }
    await this.recordEvent(
      userId,
      "task_rescheduled",
      { newDueAt, newReminderAt },
      reminder.id,
      taskId
    );
    return { task, reminder };
  }
  async cancelRemindersForTask(taskId, userId) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await this.client.from("reminders").update({
      status: "cancelled",
      next_follow_up_at: null,
      lease_token: null,
      lease_until: null,
      updated_at: now
    }).eq("task_id", taskId).eq("user_id", userId).neq("status", "cancelled").neq("status", "acknowledged");
  }
  async claimDueReminders(batchSize, leaseSeconds, workerToken) {
    const { data, error } = await this.client.rpc("claim_due_reminders", {
      p_batch_size: batchSize,
      p_lease_seconds: leaseSeconds,
      p_worker_token: workerToken
    });
    if (error) {
      throw new Error(`Failed to claim reminders: ${error.message}`);
    }
    return data || [];
  }
  async recordReminderSent(reminderId, workerToken, nextFollowUpAt, followUpCount) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const { data } = await this.client.from("reminders").update({
      status: "awaiting_ack",
      last_sent_at: now,
      next_follow_up_at: nextFollowUpAt,
      follow_up_count: followUpCount,
      lease_token: null,
      lease_until: null,
      updated_at: now
    }).eq("id", reminderId).eq("lease_token", workerToken).select("id, user_id, task_id").maybeSingle();
    if (data) {
      await this.recordEvent(
        data.user_id,
        "reminder_sent",
        { followUpCount, nextFollowUpAt },
        reminderId,
        data.task_id
      );
      return true;
    }
    return false;
  }
  async recordReminderPaused(reminderId, workerToken, followUpCount) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const { data } = await this.client.from("reminders").update({
      status: "paused",
      next_follow_up_at: null,
      follow_up_count: followUpCount,
      lease_token: null,
      lease_until: null,
      updated_at: now
    }).eq("id", reminderId).eq("lease_token", workerToken).select("id, user_id, task_id").maybeSingle();
    if (data) {
      await this.recordEvent(
        data.user_id,
        "reminder_paused",
        { followUpCount },
        reminderId,
        data.task_id
      );
      return true;
    }
    return false;
  }
  async recordReminderFailure(reminderId, workerToken, error, retryAt, newFollowUpCount) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updatePayload = {
      status: retryAt ? "scheduled" : "failed",
      last_error: error,
      lease_token: null,
      lease_until: null,
      updated_at: now
    };
    if (retryAt) {
      updatePayload.scheduled_at = retryAt;
    }
    if (newFollowUpCount !== void 0) {
      updatePayload.follow_up_count = newFollowUpCount;
    }
    const { data } = await this.client.from("reminders").update(updatePayload).eq("id", reminderId).eq("lease_token", workerToken).select("id, user_id, task_id").maybeSingle();
    if (data) {
      await this.recordEvent(
        data.user_id,
        "reminder_send_failed",
        { error, retryAt, status: updatePayload.status },
        reminderId,
        data.task_id
      );
      return true;
    }
    return false;
  }
  async recordEvent(userId, eventType, metadata, reminderId, taskId) {
    await this.client.from("reminder_events").insert({
      user_id: userId,
      event_type: eventType,
      metadata,
      reminder_id: reminderId || null,
      task_id: taskId || null
    });
  }
  // AI Provider Credentials
  async saveUserCredential(userId, provider, encrypted, maskedKey, baseUrl) {
    const { error } = await this.client.from("user_ai_credentials").upsert(
      {
        user_id: userId,
        provider,
        encrypted_key: encrypted.encrypted,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        masked_key: maskedKey,
        base_url: baseUrl || null,
        is_active: true,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      { onConflict: "user_id,provider" }
    );
    if (error) throw new Error(`Failed to save credential: ${error.message}`);
  }
  async getUserCredentials(userId) {
    const { data, error } = await this.client.from("user_ai_credentials").select("*").eq("user_id", userId).eq("is_active", true);
    if (error) throw new Error(`Failed to get credentials: ${error.message}`);
    return (data || []).map((row) => ({
      id: row.id,
      provider: row.provider,
      encryptedKey: row.encrypted_key,
      iv: row.iv,
      authTag: row.auth_tag,
      maskedKey: row.masked_key,
      baseUrl: row.base_url || void 0,
      isActive: row.is_active
    }));
  }
  async deleteUserCredential(userId, provider) {
    const { error } = await this.client.from("user_ai_credentials").delete().eq("user_id", userId).eq("provider", provider);
    return !error;
  }
  // Model Routing Preferences
  async getUserModelPreferences(userId) {
    const { data, error } = await this.client.from("user_model_preferences").select("*").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(`Failed to fetch model preferences: ${error.message}`);
    if (!data) return null;
    return {
      defaultProvider: data.default_provider,
      defaultModel: data.default_model,
      routingMode: data.routing_mode,
      taskRules: data.task_rules || {}
    };
  }
  async saveUserModelPreferences(userId, prefs) {
    const existing = await this.getUserModelPreferences(userId);
    const updated = {
      defaultProvider: prefs.defaultProvider || existing?.defaultProvider || "gemini",
      defaultModel: prefs.defaultModel || existing?.defaultModel || "gemini-3.8-flash",
      routingMode: prefs.routingMode || existing?.routingMode || "best_available",
      taskRules: prefs.taskRules !== void 0 ? prefs.taskRules : existing?.taskRules || {}
    };
    const { error } = await this.client.from("user_model_preferences").upsert(
      {
        user_id: userId,
        default_provider: updated.defaultProvider,
        default_model: updated.defaultModel,
        routing_mode: updated.routingMode,
        task_rules: updated.taskRules,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      { onConflict: "user_id" }
    );
    if (error) throw new Error(`Failed to save model preferences: ${error.message}`);
    return updated;
  }
  // Memory Operations
  async saveMemory(record) {
    const { data, error } = await this.client.from("user_memories").insert({
      user_id: record.userId,
      category: record.category,
      content: record.content,
      key: record.key || null,
      confidence: record.confidence,
      is_active: record.isActive,
      source: record.source,
      external_id: record.externalId || null
    }).select("*").single();
    if (error || !data) throw new Error(`Failed to save memory: ${error?.message}`);
    return {
      id: data.id,
      userId: data.user_id,
      category: data.category,
      content: data.content,
      key: data.key || void 0,
      confidence: data.confidence,
      isActive: data.is_active,
      source: data.source,
      externalId: data.external_id || void 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }
  async updateMemory(id, updates) {
    const updatePayload = {
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (updates.content !== void 0) updatePayload.content = updates.content;
    if (updates.category !== void 0) updatePayload.category = updates.category;
    if (updates.key !== void 0) updatePayload.key = updates.key;
    if (updates.confidence !== void 0) updatePayload.confidence = updates.confidence;
    if (updates.isActive !== void 0) updatePayload.is_active = updates.isActive;
    const { data, error } = await this.client.from("user_memories").update(updatePayload).eq("id", id).select("*").maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      userId: data.user_id,
      category: data.category,
      content: data.content,
      key: data.key || void 0,
      confidence: data.confidence,
      isActive: data.is_active,
      source: data.source,
      externalId: data.external_id || void 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }
  async deleteMemory(id, userId) {
    const { error } = await this.client.from("user_memories").update({ is_active: false, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("user_id", userId);
    return !error;
  }
  async getMemoriesForUser(userId, category) {
    let query = this.client.from("user_memories").select("*").eq("user_id", userId).eq("is_active", true).order("updated_at", { ascending: false });
    if (category) {
      query = query.eq("category", category);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Failed to list memories: ${error.message}`);
    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      category: row.category,
      content: row.content,
      key: row.key || void 0,
      confidence: row.confidence,
      isActive: row.is_active,
      source: row.source,
      externalId: row.external_id || void 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  async searchMemories(userId, queryText, category) {
    let query = this.client.from("user_memories").select("*").eq("user_id", userId).eq("is_active", true);
    if (category && category !== "all") {
      query = query.eq("category", category);
    }
    if (queryText && queryText.trim()) {
      query = query.or(`content.ilike.%${queryText.trim()}%,key.ilike.%${queryText.trim()}%`);
    }
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(20);
    if (error) throw new Error(`Failed to search memories: ${error.message}`);
    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      category: row.category,
      content: row.content,
      key: row.key || void 0,
      confidence: row.confidence,
      isActive: row.is_active,
      source: row.source,
      externalId: row.external_id || void 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  async getRelationships(userId) {
    const { data, error } = await this.client.from("memory_relationships").select("*").eq("user_id", userId);
    if (error) throw new Error(`Failed to fetch relationships: ${error.message}`);
    return (data || []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      sourceId: r.source_id,
      targetId: r.target_id,
      relationType: r.relation_type,
      createdAt: r.created_at
    }));
  }
  async addRelationship(userId, sourceId, targetId, type) {
    const { data, error } = await this.client.from("memory_relationships").insert({
      user_id: userId,
      source_id: sourceId,
      target_id: targetId,
      relation_type: type
    }).select("*").single();
    if (error || !data) throw new Error(`Failed to create relationship: ${error?.message}`);
    return {
      id: data.id,
      userId: data.user_id,
      sourceId: data.source_id,
      targetId: data.target_id,
      relationType: data.relation_type,
      createdAt: data.created_at
    };
  }
  async deleteRelationship(id, userId) {
    const { error } = await this.client.from("memory_relationships").delete().eq("id", id).eq("user_id", userId);
    return !error;
  }
  // Setup Sessions
  async createSetupSession(userId, provider, token, expiresAt) {
    const { error } = await this.client.from("setup_sessions").insert({
      user_id: userId,
      provider,
      token,
      expires_at: expiresAt
    });
    if (error) throw new Error(`Failed to create setup session: ${error.message}`);
  }
  async getSetupSession(token) {
    const { data, error } = await this.client.from("setup_sessions").select("*").eq("token", token).maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      userId: data.user_id,
      provider: data.provider,
      token: data.token,
      expiresAt: data.expires_at,
      usedAt: data.used_at
    };
  }
  async markSetupSessionUsed(token) {
    await this.client.from("setup_sessions").update({ used_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("token", token);
  }
  // External Integrations
  async getUserIntegration(userId, provider) {
    const { data, error } = await this.client.from("user_external_integrations").select("*").eq("user_id", userId).eq("provider", provider).maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      provider: data.provider,
      config: data.config || {},
      isActive: data.is_active
    };
  }
  async saveUserIntegration(userId, provider, config, isActive = true) {
    const { error } = await this.client.from("user_external_integrations").upsert(
      {
        user_id: userId,
        provider,
        config,
        is_active: isActive,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      { onConflict: "user_id,provider" }
    );
    if (error) throw new Error(`Failed to save integration: ${error.message}`);
  }
  async deleteUserIntegration(userId, provider) {
    const { error } = await this.client.from("user_external_integrations").delete().eq("user_id", userId).eq("provider", provider);
    return !error;
  }
};

// src/reminders/policy.ts
var DefaultReminderPolicy = class {
  maxFollowUps;
  constructor(maxFollowUps = 8) {
    this.maxFollowUps = maxFollowUps;
  }
  /**
   * Returns follow-up delay in minutes based on how many follow-ups have been sent.
   * followUpCount = 0 (about to send 1st follow-up) -> 10 minutes
   * followUpCount = 1 (about to send 2nd follow-up) -> 30 minutes
   * followUpCount >= 2 -> 60 minutes
   * If max reached -> null
   */
  getNextFollowUpDelayMinutes(followUpCount) {
    if (followUpCount >= this.maxFollowUps) {
      return null;
    }
    if (followUpCount === 0) {
      return 10;
    }
    if (followUpCount === 1) {
      return 30;
    }
    return 60;
  }
  getMaxFollowUps() {
    return this.maxFollowUps;
  }
  isMaxReached(followUpCount, maxFollowUps) {
    const limit = maxFollowUps ?? this.maxFollowUps;
    return followUpCount >= limit;
  }
};

// src/reminders/worker.ts
function isPermanentTelegramError(error) {
  if (!error) return false;
  const lower = error.toLowerCase();
  return lower.includes("403") || lower.includes("blocked") || lower.includes("chat not found") || lower.includes("deactivated") || lower.includes("bot can't initiate");
}
var ReminderWorker = class {
  db;
  notification;
  policy;
  clock;
  batchSize;
  leaseSeconds;
  constructor(config) {
    this.db = config.db;
    this.notification = config.notification;
    this.policy = config.policy || new DefaultReminderPolicy();
    this.clock = config.clock || new SystemClock();
    this.batchSize = config.batchSize || 20;
    this.leaseSeconds = config.leaseSeconds || 60;
  }
  async runBatch() {
    const workerToken = crypto.randomUUID();
    const claimed = await this.db.claimDueReminders(
      this.batchSize,
      this.leaseSeconds,
      workerToken
    );
    const result = {
      claimedCount: claimed.length,
      sentCount: 0,
      pausedCount: 0,
      failedCount: 0,
      details: []
    };
    for (const reminder of claimed) {
      await this.processClaimedReminder(reminder, workerToken, result);
    }
    return result;
  }
  async processClaimedReminder(reminder, workerToken, result) {
    const now = this.clock.now();
    if (this.policy.isMaxReached(reminder.follow_up_count, reminder.max_follow_ups)) {
      const pausedMsg = createPausedReminderMessage(
        reminder.telegram_chat_id,
        reminder.task_title,
        reminder.follow_up_count
      );
      await this.notification.sendText(pausedMsg);
      await this.db.recordReminderPaused(
        reminder.reminder_id,
        workerToken,
        reminder.follow_up_count
      );
      result.pausedCount++;
      result.details.push({ reminderId: reminder.reminder_id, outcome: "paused" });
      return;
    }
    const message = createReminderNotificationMessage(
      reminder.telegram_chat_id,
      reminder.reminder_id,
      reminder.task_title,
      reminder.task_due_at,
      reminder.user_timezone,
      reminder.follow_up_count
    );
    const sendResult = await this.notification.sendText(message);
    if (sendResult.ok) {
      const nextDelayMinutes = this.policy.getNextFollowUpDelayMinutes(
        reminder.follow_up_count
      );
      let nextFollowUpAt = null;
      if (nextDelayMinutes !== null) {
        nextFollowUpAt = new Date(
          now.getTime() + nextDelayMinutes * 60 * 1e3
        ).toISOString();
      }
      const newFollowUpCount = reminder.follow_up_count + 1;
      const recorded = await this.db.recordReminderSent(
        reminder.reminder_id,
        workerToken,
        nextFollowUpAt,
        newFollowUpCount
      );
      if (recorded) {
        result.sentCount++;
        result.details.push({ reminderId: reminder.reminder_id, outcome: "sent" });
      } else {
        result.failedCount++;
        result.details.push({
          reminderId: reminder.reminder_id,
          outcome: "failed",
          error: "Lease expired during send processing"
        });
      }
    } else {
      const isPermanent = isPermanentTelegramError(sendResult.error);
      const newFollowUpCount = reminder.follow_up_count + 1;
      const isMaxReached = this.policy.isMaxReached(
        newFollowUpCount,
        reminder.max_follow_ups
      );
      let retryAt = null;
      if (!isPermanent && !isMaxReached) {
        const backoffMinutes = Math.min(
          60,
          2 * Math.pow(2, reminder.follow_up_count)
        );
        retryAt = new Date(
          now.getTime() + backoffMinutes * 60 * 1e3
        ).toISOString();
      }
      await this.db.recordReminderFailure(
        reminder.reminder_id,
        workerToken,
        sendResult.error || "Unknown Telegram send error",
        retryAt,
        newFollowUpCount
      );
      result.failedCount++;
      result.details.push({
        reminderId: reminder.reminder_id,
        outcome: "failed",
        error: sendResult.error
      });
    }
  }
};

// supabase/functions/process-reminders/main.ts
async function handleProcessReminders(req) {
  const getEnv = (key) => {
    if (typeof Deno !== "undefined" && Deno.env) {
      return Deno.env.get(key) || "";
    }
    if (typeof process !== "undefined" && process.env) {
      return process.env[key] || "";
    }
    return "";
  };
  const botToken = getEnv("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const workerSecret = getEnv("WORKER_SECRET");
  const maxFollowUps = parseInt(getEnv("MAX_FOLLOW_UPS") || "8", 10);
  if (workerSecret) {
    const authHeader = req.headers.get("Authorization") || "";
    const secretHeader = req.headers.get("x-worker-secret") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token !== workerSecret && secretHeader !== workerSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized worker invocation" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
  if (!botToken || !supabaseUrl || !supabaseServiceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Server configuration error: missing required environment variables" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  const db = new SupabaseDatabaseRepository({
    supabaseUrl,
    supabaseServiceRoleKey
  });
  const notification = new TelegramClient({
    botToken
  });
  const policy = new DefaultReminderPolicy(maxFollowUps);
  const worker = new ReminderWorker({
    db,
    notification,
    policy
  });
  try {
    const runResult = await worker.runBatch();
    return new Response(JSON.stringify({ ok: true, result: runResult }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
if (typeof Deno !== "undefined" && "serve" in Deno) {
  Deno.serve(handleProcessReminders);
}
export {
  handleProcessReminders
};
