import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  DatabaseRepository,
  StoredCredential,
  SetupSessionRecord,
} from './repository.js';
import {
  AppUser,
  Task,
  Reminder,
  ClaimedReminder,
  TaskPriority,
} from '../shared/types.js';
import { ProviderId } from '../ai/provider.js';
import { UserRoutingPreferences } from '../ai/router.js';
import {
  MemoryRecord,
  MemoryCategory,
  MemoryRelationship,
} from '../memory/types.js';
import { parseLocalToUtc } from '../shared/time.js';

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

export class SupabaseDatabaseRepository implements DatabaseRepository {
  private client: SupabaseClient;

  constructor(config: SupabaseConfig, client?: SupabaseClient) {
    this.client =
      client ||
      createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
        auth: { persistSession: false },
      });
  }

  async getOrCreateUser(
    telegramUserId: number,
    telegramChatId: number,
    displayName?: string
  ): Promise<AppUser> {
    const { data: existing, error: selectErr } = await this.client
      .from('app_users')
      .select('*')
      .eq('telegram_user_id', telegramUserId)
      .maybeSingle();

    if (selectErr) {
      throw new Error(`Failed to fetch user: ${selectErr.message}`);
    }

    if (existing) {
      if (
        existing.telegram_chat_id !== telegramChatId ||
        (displayName && existing.display_name !== displayName)
      ) {
        const { data: updated } = await this.client
          .from('app_users')
          .update({
            telegram_chat_id: telegramChatId,
            display_name: displayName || existing.display_name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select('*')
          .single();
        if (updated) return updated as AppUser;
      }
      return existing as AppUser;
    }

    const { data: created, error: insertErr } = await this.client
      .from('app_users')
      .insert({
        telegram_user_id: telegramUserId,
        telegram_chat_id: telegramChatId,
        display_name: displayName || null,
        timezone: 'Asia/Kolkata',
      })
      .select('*')
      .single();

    if (insertErr || !created) {
      throw new Error(`Failed to create user: ${insertErr?.message}`);
    }

    return created as AppUser;
  }

  async getUserByTelegramId(telegramUserId: number): Promise<AppUser | null> {
    const { data } = await this.client
      .from('app_users')
      .select('*')
      .eq('telegram_user_id', telegramUserId)
      .maybeSingle();

    return (data as AppUser) || null;
  }

  async updateUserTimezone(userId: string, timezone: string): Promise<AppUser> {
    const { data, error } = await this.client
      .from('app_users')
      .update({ timezone, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to update timezone: ${error?.message}`);
    }
    return data as AppUser;
  }

  async recordUpdate(
    updateId: number,
    telegramUserId?: number
  ): Promise<{ isDuplicate: boolean }> {
    const { error } = await this.client.from('telegram_updates').insert({
      update_id: updateId,
      telegram_user_id: telegramUserId || null,
      status: 'received',
    });

    if (error) {
      // 23505 is unique_violation in Postgres
      if (error.code === '23505' || error.message.includes('duplicate')) {
        return { isDuplicate: true };
      }
      throw new Error(`Failed to record update: ${error.message}`);
    }

    return { isDuplicate: false };
  }

  async markUpdateProcessed(
    updateId: number,
    status: 'processed' | 'failed' | 'ignored',
    errorMessage?: string
  ): Promise<void> {
    await this.client
      .from('telegram_updates')
      .update({
        status,
        processed_at: new Date().toISOString(),
        error_message: errorMessage || null,
      })
      .eq('update_id', updateId);
  }

  async createTask(
    userId: string,
    title: string,
    dueAt: string | null,
    priority: TaskPriority = 'normal',
    notes?: string
  ): Promise<Task> {
    const { data, error } = await this.client
      .from('tasks')
      .insert({
        user_id: userId,
        title,
        notes: notes || null,
        due_at: dueAt,
        priority,
        status: 'open',
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create task: ${error?.message}`);
    }
    return data as Task;
  }

  async listTasks(
    userId: string,
    filter: 'all' | 'today' | 'upcoming' | 'completed' = 'all',
    userTimezone: string = 'Asia/Kolkata'
  ): Promise<Task[]> {
    let query = this.client
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('due_at', { ascending: true, nullsFirst: false });

    if (filter === 'completed') {
      query = query.eq('status', 'completed');
    } else {
      query = query.eq('status', 'open');
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to list tasks: ${error.message}`);
    }

    const tasks = (data || []) as Task[];

    if (filter === 'today') {
      const now = new Date();
      const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: userTimezone }).format(now);
      const startOfDay = parseLocalToUtc(`${localDate}T00:00:00`, userTimezone).getTime();
      const nextDayDate = new Date(startOfDay + 26 * 60 * 60 * 1000);
      const nextLocalDate = new Intl.DateTimeFormat('en-CA', { timeZone: userTimezone }).format(nextDayDate);
      const endOfDay = parseLocalToUtc(`${nextLocalDate}T00:00:00`, userTimezone).getTime();

      return tasks.filter((t) => {
        if (!t.due_at) return false;
        const due = new Date(t.due_at).getTime();
        return due >= startOfDay && due < endOfDay;
      });
    }

    if (filter === 'upcoming') {
      const nowTime = Date.now();
      return tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() >= nowTime);
    }

    return tasks;
  }

  async getTaskById(taskId: string, userId: string): Promise<Task | null> {
    const { data } = await this.client
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('user_id', userId)
      .maybeSingle();

    return (data as Task) || null;
  }

  async completeTask(userId: string, taskId: string): Promise<Task | null> {
    const { data, error } = await this.client
      .from('tasks')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', taskId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();

    if (error || !data) return null;

    await this.cancelRemindersForTask(taskId, userId);
    return data as Task;
  }

  async cancelTask(userId: string, taskId: string): Promise<Task | null> {
    const { data, error } = await this.client
      .from('tasks')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', taskId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();

    if (error || !data) return null;

    await this.cancelRemindersForTask(taskId, userId);
    return data as Task;
  }

  async findTaskByTitle(userId: string, titleQuery: string): Promise<Task | null> {
    const query = titleQuery.trim();
    // Try exact or ilike
    const { data } = await this.client
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open')
      .ilike('title', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return (data as Task) || null;
  }

  async createReminder(
    userId: string,
    taskId: string,
    scheduledAt: string,
    maxFollowUps: number = 8
  ): Promise<Reminder> {
    const { data, error } = await this.client
      .from('reminders')
      .insert({
        user_id: userId,
        task_id: taskId,
        scheduled_at: scheduledAt,
        status: 'scheduled',
        max_follow_ups: maxFollowUps,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create reminder: ${error?.message}`);
    }
    return data as Reminder;
  }

  async createTaskWithReminder(
    userId: string,
    title: string,
    dueAt: string,
    reminderAt: string,
    priority: TaskPriority = 'normal',
    maxFollowUps: number = 8
  ): Promise<{ task: Task; reminder: Reminder }> {
    const task = await this.createTask(userId, title, dueAt, priority);
    const reminder = await this.createReminder(userId, task.id, reminderAt, maxFollowUps);
    await this.recordEvent(
      userId,
      'reminder_created',
      { taskTitle: title, dueAt, scheduledAt: reminderAt },
      reminder.id,
      task.id
    );
    return { task, reminder };
  }

  async getReminder(reminderId: string): Promise<Reminder | null> {
    const { data } = await this.client
      .from('reminders')
      .select('*')
      .eq('id', reminderId)
      .maybeSingle();

    return (data as Reminder) || null;
  }

  async acknowledgeReminder(reminderId: string, userId: string): Promise<Reminder | null> {
    const existing = await this.getReminder(reminderId);
    if (!existing || existing.user_id !== userId) return null;

    if (existing.status === 'cancelled' || existing.status === 'rescheduled') {
      return null;
    }

    if (existing.status === 'acknowledged') {
      return existing;
    }

    const now = new Date().toISOString();
    const { data: updated } = await this.client
      .from('reminders')
      .update({
        status: 'acknowledged',
        acknowledged_at: now,
        next_follow_up_at: null,
        lease_token: null,
        lease_until: null,
        updated_at: now,
      })
      .eq('id', reminderId)
      .select('*')
      .maybeSingle();

    if (updated) {
      await this.client
        .from('tasks')
        .update({ status: 'completed', updated_at: now })
        .eq('id', existing.task_id)
        .eq('status', 'open');

      await this.recordEvent(
        userId,
        'reminder_acknowledged',
        {},
        reminderId,
        existing.task_id
      );
      return updated as Reminder;
    }

    return null;
  }

  async snoozeReminder(
    reminderId: string,
    userId: string,
    newScheduledAt: string
  ): Promise<Reminder | null> {
    const existing = await this.getReminder(reminderId);
    if (!existing || existing.user_id !== userId) return null;

    if (
      existing.status === 'cancelled' ||
      existing.status === 'acknowledged' ||
      existing.status === 'rescheduled'
    ) {
      return null;
    }

    const now = new Date().toISOString();
    const { data: updated } = await this.client
      .from('reminders')
      .update({
        status: 'scheduled',
        scheduled_at: newScheduledAt,
        next_follow_up_at: null,
        lease_token: null,
        lease_until: null,
        updated_at: now,
      })
      .eq('id', reminderId)
      .select('*')
      .maybeSingle();

    if (updated) {
      await this.recordEvent(
        userId,
        'reminder_snoozed',
        { newScheduledAt },
        reminderId,
        existing.task_id
      );
      return updated as Reminder;
    }

    return null;
  }

  async rescheduleTaskAndReminder(
    userId: string,
    taskId: string,
    reminderId: string | null,
    newDueAt: string,
    newReminderAt: string
  ): Promise<{ task: Task; reminder: Reminder }> {
    const now = new Date().toISOString();

    const { data: task, error: taskErr } = await this.client
      .from('tasks')
      .update({ due_at: newDueAt, status: 'open', updated_at: now })
      .eq('id', taskId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (taskErr || !task) throw new Error('Task not found');

    let targetReminderId = reminderId;
    if (!targetReminderId) {
      const { data: existingReminders } = await this.client
        .from('reminders')
        .select('id')
        .eq('task_id', taskId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingReminders && existingReminders.length > 0) {
        targetReminderId = existingReminders[0].id;
      }
    }

    let reminder: Reminder;
    if (targetReminderId) {
      const { data: updatedRem } = await this.client
        .from('reminders')
        .update({
          status: 'scheduled',
          scheduled_at: newReminderAt,
          next_follow_up_at: null,
          follow_up_count: 0,
          lease_token: null,
          lease_until: null,
          updated_at: now,
        })
        .eq('id', targetReminderId)
        .select('*')
        .single();
      reminder = updatedRem as Reminder;
    } else {
      reminder = await this.createReminder(userId, taskId, newReminderAt);
    }

    await this.recordEvent(
      userId,
      'task_rescheduled',
      { newDueAt, newReminderAt },
      reminder.id,
      taskId
    );

    return { task: task as Task, reminder };
  }

  async cancelRemindersForTask(taskId: string, userId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.client
      .from('reminders')
      .update({
        status: 'cancelled',
        next_follow_up_at: null,
        lease_token: null,
        lease_until: null,
        updated_at: now,
      })
      .eq('task_id', taskId)
      .eq('user_id', userId)
      .neq('status', 'cancelled')
      .neq('status', 'acknowledged');
  }

  async claimDueReminders(
    batchSize: number,
    leaseSeconds: number,
    workerToken: string
  ): Promise<ClaimedReminder[]> {
    const { data, error } = await this.client.rpc('claim_due_reminders', {
      p_batch_size: batchSize,
      p_lease_seconds: leaseSeconds,
      p_worker_token: workerToken,
    });

    if (error) {
      throw new Error(`Failed to claim reminders: ${error.message}`);
    }

    return (data || []) as ClaimedReminder[];
  }

  async recordReminderSent(
    reminderId: string,
    workerToken: string,
    nextFollowUpAt: string | null,
    followUpCount: number
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const { data } = await this.client
      .from('reminders')
      .update({
        status: 'awaiting_ack',
        last_sent_at: now,
        next_follow_up_at: nextFollowUpAt,
        follow_up_count: followUpCount,
        lease_token: null,
        lease_until: null,
        updated_at: now,
      })
      .eq('id', reminderId)
      .eq('lease_token', workerToken)
      .select('id, user_id, task_id')
      .maybeSingle();

    if (data) {
      await this.recordEvent(
        data.user_id,
        'reminder_sent',
        { followUpCount, nextFollowUpAt },
        reminderId,
        data.task_id
      );
      return true;
    }
    return false;
  }

  async recordReminderPaused(
    reminderId: string,
    workerToken: string,
    followUpCount: number
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const { data } = await this.client
      .from('reminders')
      .update({
        status: 'paused',
        next_follow_up_at: null,
        follow_up_count: followUpCount,
        lease_token: null,
        lease_until: null,
        updated_at: now,
      })
      .eq('id', reminderId)
      .eq('lease_token', workerToken)
      .select('id, user_id, task_id')
      .maybeSingle();

    if (data) {
      await this.recordEvent(
        data.user_id,
        'reminder_paused',
        { followUpCount },
        reminderId,
        data.task_id
      );
      return true;
    }
    return false;
  }

  async recordReminderFailure(
    reminderId: string,
    workerToken: string,
    error: string,
    retryAt: string | null,
    newFollowUpCount?: number
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      status: retryAt ? 'scheduled' : 'failed',
      last_error: error,
      lease_token: null,
      lease_until: null,
      updated_at: now,
    };
    if (retryAt) {
      updatePayload.scheduled_at = retryAt;
    }
    if (newFollowUpCount !== undefined) {
      updatePayload.follow_up_count = newFollowUpCount;
    }

    const { data } = await this.client
      .from('reminders')
      .update(updatePayload)
      .eq('id', reminderId)
      .eq('lease_token', workerToken)
      .select('id, user_id, task_id')
      .maybeSingle();

    if (data) {
      await this.recordEvent(
        data.user_id,
        'reminder_send_failed',
        { error, retryAt, status: updatePayload.status },
        reminderId,
        data.task_id
      );
      return true;
    }
    return false;
  }

  async recordEvent(
    userId: string,
    eventType: string,
    metadata: Record<string, unknown>,
    reminderId?: string,
    taskId?: string
  ): Promise<void> {
    await this.client.from('reminder_events').insert({
      user_id: userId,
      event_type: eventType,
      metadata,
      reminder_id: reminderId || null,
      task_id: taskId || null,
    });
  }

  // AI Provider Credentials
  async saveUserCredential(
    userId: string,
    provider: ProviderId,
    encrypted: { encrypted: string; iv: string; authTag: string },
    maskedKey: string,
    baseUrl?: string
  ): Promise<void> {
    const { error } = await this.client.from('user_ai_credentials').upsert(
      {
        user_id: userId,
        provider,
        encrypted_key: encrypted.encrypted,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        masked_key: maskedKey,
        base_url: baseUrl || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    );
    if (error) throw new Error(`Failed to save credential: ${error.message}`);
  }

  async getUserCredentials(userId: string): Promise<StoredCredential[]> {
    const { data, error } = await this.client
      .from('user_ai_credentials')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw new Error(`Failed to get credentials: ${error.message}`);
    return (data || []).map(row => ({
      id: row.id,
      provider: row.provider as ProviderId,
      encryptedKey: row.encrypted_key,
      iv: row.iv,
      authTag: row.auth_tag,
      maskedKey: row.masked_key,
      baseUrl: row.base_url || undefined,
      isActive: row.is_active,
    }));
  }

  async deleteUserCredential(userId: string, provider: ProviderId): Promise<boolean> {
    const { error } = await this.client
      .from('user_ai_credentials')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider);

    return !error;
  }

  // Model Routing Preferences
  async getUserModelPreferences(userId: string): Promise<UserRoutingPreferences | null> {
    const { data, error } = await this.client
      .from('user_model_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch model preferences: ${error.message}`);
    if (!data) return null;

    return {
      defaultProvider: data.default_provider as ProviderId,
      defaultModel: data.default_model,
      routingMode: data.routing_mode,
      taskRules: data.task_rules || {},
    };
  }

  async saveUserModelPreferences(
    userId: string,
    prefs: Partial<UserRoutingPreferences>
  ): Promise<UserRoutingPreferences> {
    const existing = await this.getUserModelPreferences(userId);
    const updated: UserRoutingPreferences = {
      defaultProvider: prefs.defaultProvider || existing?.defaultProvider || 'gemini',
      defaultModel: prefs.defaultModel || existing?.defaultModel || 'gemini-3.8-flash',
      routingMode: prefs.routingMode || existing?.routingMode || 'best_available',
      taskRules: prefs.taskRules !== undefined ? prefs.taskRules : existing?.taskRules || {},
    };

    const { error } = await this.client.from('user_model_preferences').upsert(
      {
        user_id: userId,
        default_provider: updated.defaultProvider,
        default_model: updated.defaultModel,
        routing_mode: updated.routingMode,
        task_rules: updated.taskRules,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) throw new Error(`Failed to save model preferences: ${error.message}`);
    return updated;
  }

  // Memory Operations
  async saveMemory(record: Omit<MemoryRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryRecord> {
    const { data, error } = await this.client
      .from('user_memories')
      .insert({
        user_id: record.userId,
        category: record.category,
        content: record.content,
        key: record.key || null,
        confidence: record.confidence,
        is_active: record.isActive,
        source: record.source,
        external_id: record.externalId || null,
      })
      .select('*')
      .single();

    if (error || !data) throw new Error(`Failed to save memory: ${error?.message}`);
    return {
      id: data.id,
      userId: data.user_id,
      category: data.category,
      content: data.content,
      key: data.key || undefined,
      confidence: data.confidence,
      isActive: data.is_active,
      source: data.source,
      externalId: data.external_id || undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async updateMemory(id: string, updates: Partial<MemoryRecord>): Promise<MemoryRecord | null> {
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.content !== undefined) updatePayload.content = updates.content;
    if (updates.category !== undefined) updatePayload.category = updates.category;
    if (updates.key !== undefined) updatePayload.key = updates.key;
    if (updates.confidence !== undefined) updatePayload.confidence = updates.confidence;
    if (updates.isActive !== undefined) updatePayload.is_active = updates.isActive;

    const { data, error } = await this.client
      .from('user_memories')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error || !data) return null;
    return {
      id: data.id,
      userId: data.user_id,
      category: data.category,
      content: data.content,
      key: data.key || undefined,
      confidence: data.confidence,
      isActive: data.is_active,
      source: data.source,
      externalId: data.external_id || undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async deleteMemory(id: string, userId: string): Promise<boolean> {
    const { error } = await this.client
      .from('user_memories')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);

    return !error;
  }

  async getMemoriesForUser(userId: string, category?: MemoryCategory): Promise<MemoryRecord[]> {
    let query = this.client
      .from('user_memories')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list memories: ${error.message}`);

    return (data || []).map(row => ({
      id: row.id,
      userId: row.user_id,
      category: row.category,
      content: row.content,
      key: row.key || undefined,
      confidence: row.confidence,
      isActive: row.is_active,
      source: row.source,
      externalId: row.external_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async searchMemories(userId: string, queryText: string, category?: string): Promise<MemoryRecord[]> {
    let query = this.client
      .from('user_memories')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    if (queryText && queryText.trim()) {
      query = query.or(`content.ilike.%${queryText.trim()}%,key.ilike.%${queryText.trim()}%`);
    }

    const { data, error } = await query.order('updated_at', { ascending: false }).limit(20);
    if (error) throw new Error(`Failed to search memories: ${error.message}`);

    return (data || []).map(row => ({
      id: row.id,
      userId: row.user_id,
      category: row.category,
      content: row.content,
      key: row.key || undefined,
      confidence: row.confidence,
      isActive: row.is_active,
      source: row.source,
      externalId: row.external_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async getRelationships(userId: string): Promise<MemoryRelationship[]> {
    const { data, error } = await this.client
      .from('memory_relationships')
      .select('*')
      .eq('user_id', userId);

    if (error) throw new Error(`Failed to fetch relationships: ${error.message}`);
    return (data || []).map(r => ({
      id: r.id,
      userId: r.user_id,
      sourceId: r.source_id,
      targetId: r.target_id,
      relationType: r.relation_type,
      createdAt: r.created_at,
    }));
  }

  async addRelationship(
    userId: string,
    sourceId: string,
    targetId: string,
    type: MemoryRelationship['relationType']
  ): Promise<MemoryRelationship> {
    const { data, error } = await this.client
      .from('memory_relationships')
      .insert({
        user_id: userId,
        source_id: sourceId,
        target_id: targetId,
        relation_type: type,
      })
      .select('*')
      .single();

    if (error || !data) throw new Error(`Failed to create relationship: ${error?.message}`);
    return {
      id: data.id,
      userId: data.user_id,
      sourceId: data.source_id,
      targetId: data.target_id,
      relationType: data.relation_type,
      createdAt: data.created_at,
    };
  }

  async deleteRelationship(id: string, userId: string): Promise<boolean> {
    const { error } = await this.client
      .from('memory_relationships')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    return !error;
  }

  // Setup Sessions
  async createSetupSession(
    userId: string,
    provider: string,
    token: string,
    expiresAt: string
  ): Promise<void> {
    const { error } = await this.client.from('setup_sessions').insert({
      user_id: userId,
      provider,
      token,
      expires_at: expiresAt,
    });
    if (error) throw new Error(`Failed to create setup session: ${error.message}`);
  }

  async getSetupSession(token: string): Promise<SetupSessionRecord | null> {
    const { data, error } = await this.client
      .from('setup_sessions')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (error || !data) return null;
    return {
      id: data.id,
      userId: data.user_id,
      provider: data.provider,
      token: data.token,
      expiresAt: data.expires_at,
      usedAt: data.used_at,
    };
  }

  async markSetupSessionUsed(token: string): Promise<void> {
    await this.client
      .from('setup_sessions')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token);
  }

  // External Integrations
  async getUserIntegration(
    userId: string,
    provider: string
  ): Promise<{ id: string; provider: string; config: Record<string, unknown>; isActive: boolean } | null> {
    const { data, error } = await this.client
      .from('user_external_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle();

    if (error || !data) return null;
    return {
      id: data.id,
      provider: data.provider,
      config: data.config || {},
      isActive: data.is_active,
    };
  }

  async saveUserIntegration(
    userId: string,
    provider: string,
    config: Record<string, unknown>,
    isActive = true
  ): Promise<void> {
    const { error } = await this.client.from('user_external_integrations').upsert(
      {
        user_id: userId,
        provider,
        config,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    );
    if (error) throw new Error(`Failed to save integration: ${error.message}`);
  }

  async deleteUserIntegration(userId: string, provider: string): Promise<boolean> {
    const { error } = await this.client
      .from('user_external_integrations')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider);

    return !error;
  }
}

