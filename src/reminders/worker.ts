// src/reminders/worker.ts
import { DatabaseRepository } from '../db/repository.js';
import {
  NotificationProvider,
  Clock,
  ClaimedReminder,
  AppUser,
} from '../shared/types.js';
import { ReminderPolicy, DefaultReminderPolicy } from './policy.js';
import {
  createReminderNotificationMessage,
  createPausedReminderMessage,
} from '../bot/messages.js';
import { SystemClock } from '../shared/clock.js';
import { formatLocalDateTime } from '../shared/time.js';

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
      // Definite send failure: retry in 2 minutes
      const retryAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString();
      await this.db.recordReminderFailure(
        reminder.reminder_id,
        workerToken,
        sendResult.error || 'Unknown Telegram send error',
        retryAt
      );

      result.failedCount++;
      result.details.push({
        reminderId: reminder.reminder_id,
        outcome: 'failed',
        error: sendResult.error,
      });
    }
  }

  async checkScheduledBriefings(): Promise<{ morningCount: number; eveningCount: number }> {
    const users = await this.db.getActiveUsers();
    const now = this.clock.now();
    let morningCount = 0;
    let eveningCount = 0;

    for (const user of users) {
      if (!user.telegram_chat_id) continue;
      const tz = user.timezone || 'UTC';

      let hour: number;
      let minute: number;
      let dateKey: string;

      try {
        const localStr = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: 'numeric',
          minute: 'numeric',
          hour12: false,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(now);

        const [datePart, timePart] = localStr.split(', ');
        const [month, day, year] = datePart.split('/');
        dateKey = `${year}-${month}-${day}`;
        const [hourStr, minuteStr] = (timePart || '0:0').split(':');
        hour = parseInt(hourStr, 10);
        minute = parseInt(minuteStr, 10);
      } catch {
        continue;
      }

      // Feature 2: Daily 8:00 AM Morning Executive Briefing (8:00 - 8:59 AM local time)
      if (hour === 8) {
        const alreadySent = await this.db.hasEventOccurred(user.id, 'morning_briefing', dateKey);
        if (!alreadySent) {
          await this.sendMorningBriefing(user, tz, dateKey);
          morningCount++;
        }
      }

      // Feature 5: Nightly Review & Rollover (9:30 PM - 10:30 PM local time)
      if ((hour === 21 && minute >= 30) || (hour === 22 && minute < 30)) {
        const alreadySent = await this.db.hasEventOccurred(user.id, 'evening_review', dateKey);
        if (!alreadySent) {
          await this.sendEveningReview(user, tz, dateKey);
          eveningCount++;
        }
      }
    }

    return { morningCount, eveningCount };
  }

  private async sendMorningBriefing(user: AppUser, timezone: string, dateKey: string): Promise<void> {
    const todayTasks = await this.db.listTasks(user.id, 'today', timezone);

    let msg = `☀️ *Good morning! Here is your day:*\n`;
    if (todayTasks.length === 0) {
      msg += `• No tasks scheduled for today.\n`;
    } else {
      todayTasks.forEach(t => {
        const timeStr = t.due_at ? formatLocalDateTime(t.due_at, timezone) : 'Anytime';
        msg += `• ${timeStr}: ${t.title}\n`;
      });
    }

    await this.notification.sendText({
      chat_id: user.telegram_chat_id,
      text: msg.trim(),
      parse_mode: 'Markdown',
    });

    await this.db.recordEvent(user.id, 'morning_briefing', {
      date: dateKey,
      taskCount: todayTasks.length,
    });
  }

  private async sendEveningReview(user: AppUser, timezone: string, dateKey: string): Promise<void> {
    const allTasks = await this.db.listTasks(user.id, 'all', timezone);
    const openTasks = allTasks.filter(t => t.status === 'open');
    const completedToday = allTasks.filter(t => t.status === 'completed');

    let msg = `🌙 *Evening Check-in:*\n`;
    msg += `You completed ${completedToday.length} task${completedToday.length === 1 ? '' : 's'} today.\n`;

    if (openTasks.length === 0) {
      msg += `All tasks completed today! 🎉`;
      await this.notification.sendText({
        chat_id: user.telegram_chat_id,
        text: msg,
        parse_mode: 'Markdown',
      });
    } else {
      const topIncomplete = openTasks[0];
      msg += `Incomplete: "${topIncomplete.title}"`;
      if (openTasks.length > 1) {
        msg += ` (+${openTasks.length - 1} more)`;
      }

      await this.notification.sendText({
        chat_id: user.telegram_chat_id,
        text: msg,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '➡️ Roll over to Tomorrow 9 AM', callback_data: `rollover:${topIncomplete.id}` },
              { text: '✅ Mark Done', callback_data: `task_done:${topIncomplete.id}` },
            ],
          ],
        },
      });
    }

    await this.db.recordEvent(user.id, 'evening_review', {
      date: dateKey,
      openCount: openTasks.length,
    });
  }
}
