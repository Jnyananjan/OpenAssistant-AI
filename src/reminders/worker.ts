// src/reminders/worker.ts
import { DatabaseRepository } from '../db/repository.js';
import {
  NotificationProvider,
  Clock,
  ClaimedReminder,
} from '../shared/types.js';
import { ReminderPolicy, DefaultReminderPolicy } from './policy.js';
import {
  createReminderNotificationMessage,
  createPausedReminderMessage,
} from '../bot/messages.js';
import { SystemClock } from '../shared/clock.js';

export interface ReminderWorkerConfig {
  db: DatabaseRepository;
  notification: NotificationProvider;
  policy?: ReminderPolicy;
  clock?: Clock;
  batchSize?: number;
  leaseSeconds?: number;
}

export interface WorkerRunResult {
  claimedCount: number;
  sentCount: number;
  pausedCount: number;
  failedCount: number;
  details: Array<{
    reminderId: string;
    outcome: 'sent' | 'paused' | 'failed';
    error?: string;
  }>;
}

export function isPermanentTelegramError(error?: string): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return (
    lower.includes('403') ||
    lower.includes('blocked') ||
    lower.includes('chat not found') ||
    lower.includes('deactivated') ||
    lower.includes("bot can't initiate")
  );
}

export class ReminderWorker {
  private readonly db: DatabaseRepository;
  private readonly notification: NotificationProvider;
  private readonly policy: ReminderPolicy;
  private readonly clock: Clock;
  private readonly batchSize: number;
  private readonly leaseSeconds: number;

  constructor(config: ReminderWorkerConfig) {
    this.db = config.db;
    this.notification = config.notification;
    this.policy = config.policy || new DefaultReminderPolicy();
    this.clock = config.clock || new SystemClock();
    this.batchSize = config.batchSize || 20;
    this.leaseSeconds = config.leaseSeconds || 60;
  }

  async runBatch(): Promise<WorkerRunResult> {
    const workerToken = crypto.randomUUID();
    const claimed = await this.db.claimDueReminders(
      this.batchSize,
      this.leaseSeconds,
      workerToken
    );

    const result: WorkerRunResult = {
      claimedCount: claimed.length,
      sentCount: 0,
      pausedCount: 0,
      failedCount: 0,
      details: [],
    };

    for (const reminder of claimed) {
      await this.processClaimedReminder(reminder, workerToken, result);
    }

    return result;
  }

  private async processClaimedReminder(
    reminder: ClaimedReminder,
    workerToken: string,
    result: WorkerRunResult
  ): Promise<void> {
    const now = this.clock.now();

    // Check if maximum follow-up limit has been reached
    if (this.policy.isMaxReached(reminder.follow_up_count, reminder.max_follow_ups)) {
      // Send final paused notification
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
      result.details.push({ reminderId: reminder.reminder_id, outcome: 'paused' });
      return;
    }

    // Prepare reminder notification with inline action buttons
    const message = createReminderNotificationMessage(
      reminder.telegram_chat_id,
      reminder.reminder_id,
      reminder.task_title,
      reminder.task_due_at,
      reminder.user_timezone,
      reminder.follow_up_count
    );

    // Send notification outside of DB transaction
    const sendResult = await this.notification.sendText(message);

    if (sendResult.ok) {
      // Calculate next follow-up delay
      const nextDelayMinutes = this.policy.getNextFollowUpDelayMinutes(
        reminder.follow_up_count
      );

      let nextFollowUpAt: string | null = null;
      if (nextDelayMinutes !== null) {
        nextFollowUpAt = new Date(
          now.getTime() + nextDelayMinutes * 60 * 1000
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
        result.details.push({ reminderId: reminder.reminder_id, outcome: 'sent' });
      } else {
        // Lease might have expired while sending
        result.failedCount++;
        result.details.push({
          reminderId: reminder.reminder_id,
          outcome: 'failed',
          error: 'Lease expired during send processing',
        });
      }
    } else {
      const isPermanent = isPermanentTelegramError(sendResult.error);
      const newFollowUpCount = reminder.follow_up_count + 1;
      const isMaxReached = this.policy.isMaxReached(
        newFollowUpCount,
        reminder.max_follow_ups
      );

      let retryAt: string | null = null;
      if (!isPermanent && !isMaxReached) {
        // Exponential backoff for transient errors: 2, 4, 8... min (capped at 60 min)
        const backoffMinutes = Math.min(
          60,
          2 * Math.pow(2, reminder.follow_up_count)
        );
        retryAt = new Date(
          now.getTime() + backoffMinutes * 60 * 1000
        ).toISOString();
      }

      await this.db.recordReminderFailure(
        reminder.reminder_id,
        workerToken,
        sendResult.error || 'Unknown Telegram send error',
        retryAt,
        newFollowUpCount
      );

      result.failedCount++;
      result.details.push({
        reminderId: reminder.reminder_id,
        outcome: 'failed',
        error: sendResult.error,
      });
    }
  }
}
