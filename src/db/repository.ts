// src/db/repository.ts
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

export interface StoredCredential {
  id: string;
  provider: ProviderId;
  encryptedKey: string;
  iv: string;
  authTag: string;
  maskedKey: string;
  baseUrl?: string;
  isActive: boolean;
}

export interface SetupSessionRecord {
  id: string;
  userId: string;
  provider: string;
  token: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface DatabaseRepository {
  // User
  getOrCreateUser(
    telegramUserId: number,
    telegramChatId: number,
    displayName?: string
  ): Promise<AppUser>;
  getUserByTelegramId(telegramUserId: number): Promise<AppUser | null>;
  getActiveUsers(): Promise<AppUser[]>;
  updateUserTimezone(userId: string, timezone: string): Promise<AppUser>;

  // Telegram Update Deduplication
  recordUpdate(
    updateId: number,
    telegramUserId?: number
  ): Promise<{ isDuplicate: boolean }>;
  markUpdateProcessed(
    updateId: number,
    status: 'processed' | 'failed' | 'ignored',
    errorMessage?: string
  ): Promise<void>;

  // Tasks
  createTask(
    userId: string,
    title: string,
    dueAt: string | null,
    priority?: TaskPriority,
    notes?: string
  ): Promise<Task>;
  listTasks(
    userId: string,
    filter?: 'all' | 'today' | 'upcoming' | 'completed',
    userTimezone?: string
  ): Promise<Task[]>;
  getTaskById(taskId: string, userId: string): Promise<Task | null>;
  completeTask(userId: string, taskId: string): Promise<Task | null>;
  cancelTask(userId: string, taskId: string): Promise<Task | null>;
  findTaskByTitle(userId: string, titleQuery: string): Promise<Task | null>;

  // Reminders
  createReminder(
    userId: string,
    taskId: string,
    scheduledAt: string,
    maxFollowUps?: number
  ): Promise<Reminder>;
  createTaskWithReminder(
    userId: string,
    title: string,
    dueAt: string,
    reminderAt: string,
    priority?: TaskPriority,
    maxFollowUps?: number
  ): Promise<{ task: Task; reminder: Reminder }>;
  getReminder(reminderId: string): Promise<Reminder | null>;
  acknowledgeReminder(reminderId: string, userId: string): Promise<Reminder | null>;
  snoozeReminder(
    reminderId: string,
    userId: string,
    newScheduledAt: string
  ): Promise<Reminder | null>;
  rescheduleTaskAndReminder(
    userId: string,
    taskId: string,
    reminderId: string | null,
    newDueAt: string,
    newReminderAt: string
  ): Promise<{ task: Task; reminder: Reminder }>;
  cancelRemindersForTask(taskId: string, userId: string): Promise<void>;

  // Worker Claim & State Transitions
  claimDueReminders(
    batchSize: number,
    leaseSeconds: number,
    workerToken: string
  ): Promise<ClaimedReminder[]>;
  recordReminderSent(
    reminderId: string,
    workerToken: string,
    nextFollowUpAt: string | null,
    followUpCount: number
  ): Promise<boolean>;
  recordReminderPaused(
    reminderId: string,
    workerToken: string,
    followUpCount: number
  ): Promise<boolean>;
  recordReminderFailure(
    reminderId: string,
    workerToken: string,
    error: string,
    retryAt: string
  ): Promise<boolean>;

  // Audit Events
  recordEvent(
    userId: string,
    eventType: string,
    metadata: Record<string, unknown>,
    reminderId?: string,
    taskId?: string
  ): Promise<void>;
  hasEventOccurred(userId: string, eventType: string, dateKey: string): Promise<boolean>;
  getExpenses(userId: string, sinceIso?: string): Promise<Array<{ amount: number; currency: string; category: string; description: string; createdAt: string }>>;
  getRecentChatHistory(
    userId: string,
    limit?: number
  ): Promise<Array<{ role: 'user' | 'assistant'; text: string; createdAt: string }>>;

  // AI Provider Credentials
  saveUserCredential(
    userId: string,
    provider: ProviderId,
    encrypted: { encrypted: string; iv: string; authTag: string },
    maskedKey: string,
    baseUrl?: string
  ): Promise<void>;
  getUserCredentials(userId: string): Promise<StoredCredential[]>;
  deleteUserCredential(userId: string, provider: ProviderId): Promise<boolean>;

  // Model Preferences
  getUserModelPreferences(userId: string): Promise<UserRoutingPreferences | null>;
  saveUserModelPreferences(
    userId: string,
    prefs: Partial<UserRoutingPreferences>
  ): Promise<UserRoutingPreferences>;

  // Memory Operations
  saveMemory(record: Omit<MemoryRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryRecord>;
  updateMemory(id: string, updates: Partial<MemoryRecord>): Promise<MemoryRecord | null>;
  deleteMemory(id: string, userId: string): Promise<boolean>;
  getMemoriesForUser(userId: string, category?: MemoryCategory): Promise<MemoryRecord[]>;
  searchMemories(userId: string, query: string, category?: string): Promise<MemoryRecord[]>;
  getRelationships(userId: string): Promise<MemoryRelationship[]>;
  addRelationship(
    userId: string,
    sourceId: string,
    targetId: string,
    type: MemoryRelationship['relationType']
  ): Promise<MemoryRelationship>;
  deleteRelationship(id: string, userId: string): Promise<boolean>;

  // Setup Sessions
  createSetupSession(
    userId: string,
    provider: string,
    token: string,
    expiresAt: string
  ): Promise<void>;
  getSetupSession(token: string): Promise<SetupSessionRecord | null>;
  markSetupSessionUsed(token: string): Promise<void>;

  // External Integrations (e.g. Supermemory)
  getUserIntegration(
    userId: string,
    provider: string
  ): Promise<{ id: string; provider: string; config: Record<string, unknown>; isActive: boolean } | null>;
  saveUserIntegration(
    userId: string,
    provider: string,
    config: Record<string, unknown>,
    isActive?: boolean
  ): Promise<void>;
  deleteUserIntegration(userId: string, provider: string): Promise<boolean>;
}
