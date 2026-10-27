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
  Clock,
} from '../shared/types.js';
import { SystemClock } from '../shared/clock.js';
import { ProviderId } from '../ai/provider.js';
import { UserRoutingPreferences } from '../ai/router.js';
import {
  MemoryRecord,
  MemoryCategory,
  MemoryRelationship,
} from '../memory/types.js';

export class InMemoryDatabaseRepository implements DatabaseRepository {
  public users: Map<string, AppUser> = new Map();
  public userByTelegramId: Map<number, string> = new Map();
  public updates: Map<number, { status: string; error_message?: string }> = new Map();
  public tasks: Map<string, Task> = new Map();
  public reminders: Map<string, Reminder> = new Map();
  public credentials: Map<string, StoredCredential> = new Map(); // key: `${userId}:${provider}`
  public preferences: Map<string, UserRoutingPreferences> = new Map(); // key: userId
  public memories: Map<string, MemoryRecord> = new Map(); // key: memoryId
  public relationships: Map<string, MemoryRelationship> = new Map(); // key: relationshipId
  public setupSessions: Map<string, SetupSessionRecord> = new Map(); // key: token
  public integrations: Map<string, { id: string; userId: string; provider: string; config: Record<string, unknown>; isActive: boolean }> = new Map();
  public events: Array<{
    id: string;
    userId: string;
    reminderId?: string;
    taskId?: string;
    eventType: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }> = [];

  private clock: Clock;

  constructor(clock?: Clock) {
    this.clock = clock || new SystemClock();
  }

  setClock(clock: Clock): void {
    this.clock = clock;
  }

  async getOrCreateUser(
    telegramUserId: number,
    telegramChatId: number,
    displayName?: string
  ): Promise<AppUser> {
    const existingId = this.userByTelegramId.get(telegramUserId);
    const now = this.clock.now().toISOString();

    if (existingId) {
      const user = this.users.get(existingId)!;
      if (user.telegram_chat_id !== telegramChatId || (displayName && user.display_name !== displayName)) {
        user.telegram_chat_id = telegramChatId;
        user.display_name = displayName || user.display_name;
        user.updated_at = now;
      }
      return user;
    }

    const newUser: AppUser = {
      id: crypto.randomUUID(),
      telegram_user_id: telegramUserId,
      telegram_chat_id: telegramChatId,
      display_name: displayName || null,
      timezone: 'Asia/Kolkata',
      settings: {},
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    this.users.set(newUser.id, newUser);
    this.userByTelegramId.set(telegramUserId, newUser.id);
    return newUser;
  }

  async getUserByTelegramId(telegramUserId: number): Promise<AppUser | null> {
    const userId = this.userByTelegramId.get(telegramUserId);
    if (!userId) return null;
    return this.users.get(userId) || null;
  }

  async updateUserTimezone(userId: string, timezone: string): Promise<AppUser> {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    user.timezone = timezone;
    user.updated_at = this.clock.now().toISOString();
    return user;
  }

  async recordUpdate(
    updateId: number,
    _telegramUserId?: number
  ): Promise<{ isDuplicate: boolean }> {
    if (this.updates.has(updateId)) {
      return { isDuplicate: true };
    }
    this.updates.set(updateId, { status: 'received' });
    return { isDuplicate: false };
  }

  async markUpdateProcessed(
    updateId: number,
    status: 'processed' | 'failed' | 'ignored',
    errorMessage?: string
  ): Promise<void> {
    const update = this.updates.get(updateId);
    if (update) {
      update.status = status;
      update.error_message = errorMessage;
    }
  }

  async createTask(
    userId: string,
    title: string,
    dueAt: string | null,
    priority: TaskPriority = 'normal',
    notes?: string
  ): Promise<Task> {
    const now = this.clock.now().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      user_id: userId,
      title,
      notes: notes || null,
      due_at: dueAt,
      priority,
      status: 'open',
      source: 'telegram',
      created_at: now,
      updated_at: now,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  async listTasks(
    userId: string,
    filter: 'all' | 'today' | 'upcoming' | 'completed' = 'all'
  ): Promise<Task[]> {
    const userTasks = Array.from(this.tasks.values()).filter((t) => t.user_id === userId);

    if (filter === 'completed') {
      return userTasks.filter((t) => t.status === 'completed');
    }

    const openTasks = userTasks.filter((t) => t.status === 'open');

    if (filter === 'today') {
      const now = this.clock.now();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

      return openTasks.filter((t) => {
        if (!t.due_at) return false;
        const dueTime = new Date(t.due_at).getTime();
        return dueTime >= startOfDay && dueTime < endOfDay;
      });
    }

    if (filter === 'upcoming') {
      const nowTime = this.clock.now().getTime();
      return openTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() >= nowTime);
    }

    return openTasks;
  }

  async getTaskById(taskId: string, userId: string): Promise<Task | null> {
    const task = this.tasks.get(taskId);
    if (!task || task.user_id !== userId) return null;
    return task;
  }

  async completeTask(userId: string, taskId: string): Promise<Task | null> {
    const task = await this.getTaskById(taskId, userId);
    if (!task) return null;

    task.status = 'completed';
    task.updated_at = this.clock.now().toISOString();

    // Cancel all open/active reminders for this task
    await this.cancelRemindersForTask(taskId, userId);
    return task;
  }

  async cancelTask(userId: string, taskId: string): Promise<Task | null> {
    const task = await this.getTaskById(taskId, userId);
    if (!task) return null;

    task.status = 'cancelled';
    task.updated_at = this.clock.now().toISOString();

    await this.cancelRemindersForTask(taskId, userId);
    return task;
  }

  async findTaskByTitle(userId: string, titleQuery: string): Promise<Task | null> {
    const query = titleQuery.toLowerCase().trim();
    const tasks = Array.from(this.tasks.values()).filter(
      (t) => t.user_id === userId && t.status === 'open'
    );

    // Exact match first
    const exact = tasks.find((t) => t.title.toLowerCase() === query);
    if (exact) return exact;

    // Partial substring match
    return tasks.find((t) => t.title.toLowerCase().includes(query)) || null;
  }

  async createReminder(
    userId: string,
    taskId: string,
    scheduledAt: string,
    maxFollowUps: number = 8
  ): Promise<Reminder> {
    const now = this.clock.now().toISOString();
    const reminder: Reminder = {
      id: crypto.randomUUID(),
      user_id: userId,
      task_id: taskId,
      scheduled_at: scheduledAt,
      status: 'scheduled',
      follow_up_count: 0,
      max_follow_ups: maxFollowUps,
      last_sent_at: null,
      next_follow_up_at: null,
      acknowledged_at: null,
      lease_until: null,
      lease_token: null,
      last_error: null,
      created_at: now,
      updated_at: now,
    };
    this.reminders.set(reminder.id, reminder);
    return reminder;
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
    return this.reminders.get(reminderId) || null;
  }

  async acknowledgeReminder(reminderId: string, userId: string): Promise<Reminder | null> {
    const reminder = this.reminders.get(reminderId);
    if (!reminder || reminder.user_id !== userId) return null;

    if (reminder.status === 'cancelled' || reminder.status === 'rescheduled') {
      return null;
    }

    if (reminder.status === 'acknowledged') {
      return reminder; // Idempotent
    }

    const now = this.clock.now().toISOString();
    reminder.status = 'acknowledged';
    reminder.acknowledged_at = now;
    reminder.next_follow_up_at = null;
    reminder.lease_token = null;
    reminder.lease_until = null;
    reminder.updated_at = now;

    // Complete the task as well
    const task = this.tasks.get(reminder.task_id);
    if (task && task.status === 'open') {
      task.status = 'completed';
      task.updated_at = now;
    }

    await this.recordEvent(userId, 'reminder_acknowledged', {}, reminderId, reminder.task_id);
    return reminder;
  }

  async snoozeReminder(
    reminderId: string,
    userId: string,
    newScheduledAt: string
  ): Promise<Reminder | null> {
    const reminder = this.reminders.get(reminderId);
    if (!reminder || reminder.user_id !== userId) return null;

    if (
      reminder.status === 'cancelled' ||
      reminder.status === 'acknowledged' ||
      reminder.status === 'rescheduled'
    ) {
      return null; // Cannot snooze finished or stale reminder
    }

    const now = this.clock.now().toISOString();
    reminder.status = 'scheduled';
    reminder.scheduled_at = newScheduledAt;
    reminder.next_follow_up_at = null;
    reminder.lease_token = null;
    reminder.lease_until = null;
    reminder.updated_at = now;

    await this.recordEvent(
      userId,
      'reminder_snoozed',
      { newScheduledAt },
      reminderId,
      reminder.task_id
    );
    return reminder;
  }

  async rescheduleTaskAndReminder(
    userId: string,
    taskId: string,
    reminderId: string | null,
    newDueAt: string,
    newReminderAt: string
  ): Promise<{ task: Task; reminder: Reminder }> {
    const task = await this.getTaskById(taskId, userId);
    if (!task) throw new Error('Task not found');

    const now = this.clock.now().toISOString();
    task.due_at = newDueAt;
    task.status = 'open';
    task.updated_at = now;

    let reminder: Reminder | undefined;
    if (reminderId) {
      reminder = this.reminders.get(reminderId);
    }
    if (!reminder) {
      // Find an active reminder for this task or create a new one
      reminder = Array.from(this.reminders.values()).find(
        (r) => r.task_id === taskId && r.user_id === userId
      );
    }

    if (reminder) {
      reminder.status = 'scheduled';
      reminder.scheduled_at = newReminderAt;
      reminder.next_follow_up_at = null;
      reminder.follow_up_count = 0;
      reminder.lease_token = null;
      reminder.lease_until = null;
      reminder.updated_at = now;
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
    return { task, reminder };
  }

  async cancelRemindersForTask(taskId: string, userId: string): Promise<void> {
    const now = this.clock.now().toISOString();
    for (const reminder of this.reminders.values()) {
      if (
        reminder.task_id === taskId &&
        reminder.user_id === userId &&
        reminder.status !== 'cancelled' &&
        reminder.status !== 'acknowledged'
      ) {
        reminder.status = 'cancelled';
        reminder.next_follow_up_at = null;
        reminder.lease_token = null;
        reminder.lease_until = null;
        reminder.updated_at = now;
        await this.recordEvent(userId, 'reminder_cancelled', {}, reminder.id, taskId);
      }
    }
  }

  async claimDueReminders(
    batchSize: number,
    leaseSeconds: number,
    workerToken: string
  ): Promise<ClaimedReminder[]> {
    const now = this.clock.now();
    const nowIso = now.toISOString();
    const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000).toISOString();

    const claimed: ClaimedReminder[] = [];

    for (const reminder of this.reminders.values()) {
      if (claimed.length >= batchSize) break;

      const user = this.users.get(reminder.user_id);
      const task = this.tasks.get(reminder.task_id);

      if (!user || !user.is_active || !task || task.status !== 'open') {
        continue;
      }

      const isLeaseExpired = !reminder.lease_until || new Date(reminder.lease_until).getTime() < now.getTime();

      let eligible = false;
      if (reminder.status === 'scheduled') {
        if (new Date(reminder.scheduled_at).getTime() <= now.getTime() && isLeaseExpired) {
          eligible = true;
        }
      } else if (reminder.status === 'awaiting_ack') {
        if (
          reminder.next_follow_up_at &&
          new Date(reminder.next_follow_up_at).getTime() <= now.getTime() &&
          isLeaseExpired
        ) {
          eligible = true;
        }
      } else if (reminder.status === 'sending') {
        if (reminder.lease_until && new Date(reminder.lease_until).getTime() < now.getTime()) {
          eligible = true; // Recover expired lease!
        }
      }

      if (eligible) {
        reminder.status = 'sending';
        reminder.lease_token = workerToken;
        reminder.lease_until = leaseUntil;
        reminder.updated_at = nowIso;

        claimed.push({
          reminder_id: reminder.id,
          user_id: user.id,
          task_id: task.id,
          task_title: task.title,
          task_due_at: task.due_at,
          telegram_chat_id: user.telegram_chat_id,
          user_timezone: user.timezone,
          scheduled_at: reminder.scheduled_at,
          status: reminder.status,
          follow_up_count: reminder.follow_up_count,
          max_follow_ups: reminder.max_follow_ups,
        });
      }
    }

    return claimed;
  }

  async recordReminderSent(
    reminderId: string,
    workerToken: string,
    nextFollowUpAt: string | null,
    followUpCount: number
  ): Promise<boolean> {
    const reminder = this.reminders.get(reminderId);
    if (!reminder || reminder.lease_token !== workerToken) {
      return false; // Stale worker token rejection
    }

    const now = this.clock.now().toISOString();
    reminder.status = 'awaiting_ack';
    reminder.last_sent_at = now;
    reminder.next_follow_up_at = nextFollowUpAt;
    reminder.follow_up_count = followUpCount;
    reminder.lease_token = null;
    reminder.lease_until = null;
    reminder.updated_at = now;

    await this.recordEvent(
      reminder.user_id,
      'reminder_sent',
      { followUpCount, nextFollowUpAt },
      reminderId,
      reminder.task_id
    );
    return true;
  }

  async recordReminderPaused(
    reminderId: string,
    workerToken: string,
    followUpCount: number
  ): Promise<boolean> {
    const reminder = this.reminders.get(reminderId);
    if (!reminder || reminder.lease_token !== workerToken) {
      return false;
    }

    const now = this.clock.now().toISOString();
    reminder.status = 'paused';
    reminder.next_follow_up_at = null;
    reminder.follow_up_count = followUpCount;
    reminder.lease_token = null;
    reminder.lease_until = null;
    reminder.updated_at = now;

    await this.recordEvent(
      reminder.user_id,
      'reminder_paused',
      { followUpCount },
      reminderId,
      reminder.task_id
    );
    return true;
  }

  async recordReminderFailure(
    reminderId: string,
    workerToken: string,
    error: string,
    retryAt: string
  ): Promise<boolean> {
    const reminder = this.reminders.get(reminderId);
    if (!reminder || reminder.lease_token !== workerToken) {
      return false;
    }

    const now = this.clock.now().toISOString();
    reminder.status = 'scheduled'; // Schedule for retry
    reminder.scheduled_at = retryAt;
    reminder.last_error = error;
    reminder.lease_token = null;
    reminder.lease_until = null;
    reminder.updated_at = now;

    await this.recordEvent(
      reminder.user_id,
      'reminder_send_failed',
      { error, retryAt },
      reminderId,
      reminder.task_id
    );
    return true;
  }

  async recordEvent(
    userId: string,
    eventType: string,
    metadata: Record<string, unknown>,
    reminderId?: string,
    taskId?: string
  ): Promise<void> {
    this.events.push({
      id: crypto.randomUUID(),
      userId,
      reminderId,
      taskId,
      eventType,
      metadata,
      createdAt: this.clock.now().toISOString(),
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
    const key = `${userId}:${provider}`;
    this.credentials.set(key, {
      id: crypto.randomUUID(),
      provider,
      encryptedKey: encrypted.encrypted,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      maskedKey,
      baseUrl,
      isActive: true,
    });
  }

  async getUserCredentials(userId: string): Promise<StoredCredential[]> {
    const list: StoredCredential[] = [];
    for (const [key, cred] of this.credentials.entries()) {
      if (key.startsWith(`${userId}:`) && cred.isActive) {
        list.push(cred);
      }
    }
    return list;
  }

  async deleteUserCredential(userId: string, provider: ProviderId): Promise<boolean> {
    const key = `${userId}:${provider}`;
    return this.credentials.delete(key);
  }

  // Model Routing Preferences
  async getUserModelPreferences(userId: string): Promise<UserRoutingPreferences | null> {
    return this.preferences.get(userId) || null;
  }

  async saveUserModelPreferences(
    userId: string,
    prefs: Partial<UserRoutingPreferences>
  ): Promise<UserRoutingPreferences> {
    const existing = this.preferences.get(userId);
    const updated: UserRoutingPreferences = {
      defaultProvider: prefs.defaultProvider || existing?.defaultProvider || 'gemini',
      defaultModel: prefs.defaultModel || existing?.defaultModel || 'gemini-3.8-flash',
      routingMode: prefs.routingMode || existing?.routingMode || 'best_available',
      taskRules: prefs.taskRules !== undefined ? prefs.taskRules : existing?.taskRules || {},
    };
    this.preferences.set(userId, updated);
    return updated;
  }

  // Memory Operations
  async saveMemory(record: Omit<MemoryRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryRecord> {
    const now = this.clock.now().toISOString();
    const mem: MemoryRecord = {
      id: crypto.randomUUID(),
      ...record,
      createdAt: now,
      updatedAt: now,
    };
    this.memories.set(mem.id, mem);
    return mem;
  }

  async updateMemory(id: string, updates: Partial<MemoryRecord>): Promise<MemoryRecord | null> {
    const mem = this.memories.get(id);
    if (!mem) return null;
    const updated: MemoryRecord = {
      ...mem,
      ...updates,
      updatedAt: this.clock.now().toISOString(),
    };
    this.memories.set(id, updated);
    return updated;
  }

  async deleteMemory(id: string, userId: string): Promise<boolean> {
    const mem = this.memories.get(id);
    if (!mem || mem.userId !== userId) return false;
    mem.isActive = false;
    mem.updatedAt = this.clock.now().toISOString();
    return true;
  }

  async getMemoriesForUser(userId: string, category?: MemoryCategory): Promise<MemoryRecord[]> {
    const list: MemoryRecord[] = [];
    for (const mem of this.memories.values()) {
      if (mem.userId === userId && mem.isActive) {
        if (!category || mem.category === category) {
          list.push(mem);
        }
      }
    }
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async searchMemories(userId: string, query: string, category?: string): Promise<MemoryRecord[]> {
    const list = await this.getMemoriesForUser(userId, category === 'all' ? undefined : (category as MemoryCategory));
    if (!query || !query.trim()) return list;
    const lower = query.toLowerCase().trim();
    const queryWords = lower.split(/\s+/).filter(w => w.length > 2);
    return list.filter(m => {
      const content = m.content.toLowerCase();
      const key = (m.key || '').toLowerCase();
      if (content.includes(lower) || key.includes(lower)) return true;
      return queryWords.length > 0 && queryWords.some(w => content.includes(w) || key.includes(w));
    });
  }

  async getRelationships(userId: string): Promise<MemoryRelationship[]> {
    const list: MemoryRelationship[] = [];
    for (const rel of this.relationships.values()) {
      if (rel.userId === userId) {
        list.push(rel);
      }
    }
    return list;
  }

  async addRelationship(
    userId: string,
    sourceId: string,
    targetId: string,
    type: MemoryRelationship['relationType']
  ): Promise<MemoryRelationship> {
    const rel: MemoryRelationship = {
      id: crypto.randomUUID(),
      userId,
      sourceId,
      targetId,
      relationType: type,
      createdAt: this.clock.now().toISOString(),
    };
    this.relationships.set(rel.id, rel);
    return rel;
  }

  async deleteRelationship(id: string, userId: string): Promise<boolean> {
    const rel = this.relationships.get(id);
    if (!rel || rel.userId !== userId) return false;
    return this.relationships.delete(id);
  }

  // Setup Sessions
  async createSetupSession(
    userId: string,
    provider: string,
    token: string,
    expiresAt: string
  ): Promise<void> {
    this.setupSessions.set(token, {
      id: crypto.randomUUID(),
      userId,
      provider,
      token,
      expiresAt,
      usedAt: null,
    });
  }

  async getSetupSession(token: string): Promise<SetupSessionRecord | null> {
    return this.setupSessions.get(token) || null;
  }

  async markSetupSessionUsed(token: string): Promise<void> {
    const s = this.setupSessions.get(token);
    if (s) {
      s.usedAt = this.clock.now().toISOString();
    }
  }

  // External Integrations
  async getUserIntegration(
    userId: string,
    provider: string
  ): Promise<{ id: string; provider: string; config: Record<string, unknown>; isActive: boolean } | null> {
    for (const item of this.integrations.values()) {
      if (item.userId === userId && item.provider === provider && item.isActive) {
        return {
          id: item.id,
          provider: item.provider,
          config: item.config,
          isActive: item.isActive,
        };
      }
    }
    return null;
  }

  async saveUserIntegration(
    userId: string,
    provider: string,
    config: Record<string, unknown>,
    isActive = true
  ): Promise<void> {
    const id = crypto.randomUUID();
    this.integrations.set(`${userId}:${provider}`, {
      id,
      userId,
      provider,
      config,
      isActive,
    });
  }

  async deleteUserIntegration(userId: string, provider: string): Promise<boolean> {
    return this.integrations.delete(`${userId}:${provider}`);
  }
}

