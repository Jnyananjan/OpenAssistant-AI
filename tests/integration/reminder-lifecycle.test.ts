// tests/integration/reminder-lifecycle.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReminderWorker } from '../../src/reminders/worker.js';
import { CallbackHandler } from '../../src/bot/callbacks.js';
import { InMemoryDatabaseRepository } from '../../src/db/in-memory-repository.js';
import { DefaultReminderPolicy } from '../../src/reminders/policy.js';
import { ControllableClock } from '../../src/shared/clock.js';
import {
  NotificationProvider,
  SendTextInput,
  SendTextResult,
  TelegramCallbackQuery,
  TelegramInlineKeyboardMarkup,
} from '../../src/shared/types.js';

describe('Reminder Lifecycle & Escalation Integration', () => {
  let db: InMemoryDatabaseRepository;
  let clock: ControllableClock;
  let sentMessages: SendTextInput[];
  let notification: NotificationProvider;
  let worker: ReminderWorker;
  let callbackHandler: CallbackHandler;

  beforeEach(() => {
    // Current time: 2026-10-25 10:00:00 UTC
    clock = new ControllableClock('2026-10-25T10:00:00Z');
    db = new InMemoryDatabaseRepository(clock);
    sentMessages = [];

    notification = {
      sendText: vi.fn().mockImplementation(async (input: SendTextInput): Promise<SendTextResult> => {
        sentMessages.push(input);
        return { ok: true, message_id: 1 };
      }),
      answerCallbackQuery: vi.fn().mockResolvedValue(true),
    };

    worker = new ReminderWorker({
      db,
      notification,
      policy: new DefaultReminderPolicy(8),
      clock,
      batchSize: 10,
      leaseSeconds: 60,
    });

    callbackHandler = new CallbackHandler({
      db,
      notification,
      clock,
    });
  });

  it('claims due reminder, sends notification, and sets 10-minute follow-up', async () => {
    const user = await db.getOrCreateUser(111, 111, 'Bob');
    // Task due at 10:30 UTC, reminder at 10:00 UTC
    const { reminder } = await db.createTaskWithReminder(
      user.id,
      'Submit taxes',
      '2026-10-25T10:30:00Z',
      '2026-10-25T10:00:00Z'
    );

    const runResult = await worker.runBatch();
    expect(runResult.claimedCount).toBe(1);
    expect(runResult.sentCount).toBe(1);
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].text).toContain('Submit taxes');
    expect((sentMessages[0].reply_markup as TelegramInlineKeyboardMarkup)?.inline_keyboard[0][0].text).toBe('✅ Done');

    const updated = (await db.getReminder(reminder.id))!;
    expect(updated.status).toBe('awaiting_ack');
    expect(updated.follow_up_count).toBe(1);
    // Next follow-up is 10 minutes later -> 10:10:00 UTC
    expect(updated.next_follow_up_at).toBe('2026-10-25T10:10:00.000Z');
  });

  it('sends 1st follow-up after 10 min and schedules 2nd follow-up after 30 min', async () => {
    const user = await db.getOrCreateUser(111, 111, 'Bob');
    const { reminder } = await db.createTaskWithReminder(
      user.id,
      'Submit taxes',
      '2026-10-25T10:30:00Z',
      '2026-10-25T10:00:00Z'
    );

    // Initial send
    await worker.runBatch();

    // Advance 5 minutes (not yet due for follow-up)
    clock.advanceMinutes(5);
    const earlyBatch = await worker.runBatch();
    expect(earlyBatch.claimedCount).toBe(0);

    // Advance another 5 minutes (10 minutes total -> now due)
    clock.advanceMinutes(5);
    const followUp1Batch = await worker.runBatch();
    expect(followUp1Batch.claimedCount).toBe(1);
    expect(followUp1Batch.sentCount).toBe(1);

    const remAfterFollowUp1 = (await db.getReminder(reminder.id))!;
    expect(remAfterFollowUp1.follow_up_count).toBe(2);
    // 30 minutes after 10:10 -> 10:40:00 UTC
    expect(remAfterFollowUp1.next_follow_up_at).toBe('2026-10-25T10:40:00.000Z');

    expect(sentMessages.length).toBe(2);
    expect(sentMessages[1].text).toContain('Follow-up #1');
  });

  it('Done button click stops all future follow-ups and marks task complete', async () => {
    const user = await db.getOrCreateUser(111, 111, 'Bob');
    const { task, reminder } = await db.createTaskWithReminder(
      user.id,
      'Submit taxes',
      '2026-10-25T10:30:00Z',
      '2026-10-25T10:00:00Z'
    );

    await worker.runBatch();
    expect(sentMessages.length).toBe(1);

    // User clicks "Done"
    const query: TelegramCallbackQuery = {
      id: 'query-1',
      from: { id: 111, is_bot: false, first_name: 'Bob' },
      message: {
        message_id: 10,
        chat: { id: 111, type: 'private' },
        date: 12345,
      },
      data: `done:${reminder.id}`,
    };

    await callbackHandler.handleCallback(query, user);

    const completedTask = (await db.getTaskById(task.id, user.id))!;
    expect(completedTask.status).toBe('completed');

    const acknowledgedReminder = (await db.getReminder(reminder.id))!;
    expect(acknowledgedReminder.status).toBe('acknowledged');
    expect(acknowledgedReminder.next_follow_up_at).toBeNull();

    // Advance time by 2 hours and run worker again
    clock.advanceMinutes(120);
    const subsequentBatch = await worker.runBatch();
    expect(subsequentBatch.claimedCount).toBe(0);
    // No additional reminder message was sent
    expect(sentMessages.filter((m) => m.text.includes('Reminder')).length).toBe(1);
  });

  it('Snooze button delays reminder by requested minutes without altering task deadline', async () => {
    const user = await db.getOrCreateUser(111, 111, 'Bob');
    const { task, reminder } = await db.createTaskWithReminder(
      user.id,
      'Submit taxes',
      '2026-10-25T10:30:00Z',
      '2026-10-25T10:00:00Z'
    );

    await worker.runBatch();

    // Click Snooze 10m
    const query: TelegramCallbackQuery = {
      id: 'query-2',
      from: { id: 111, is_bot: false, first_name: 'Bob' },
      message: {
        message_id: 10,
        chat: { id: 111, type: 'private' },
        date: 12345,
      },
      data: `snooze:${reminder.id}:10`,
    };

    await callbackHandler.handleCallback(query, user);

    const snoozed = (await db.getReminder(reminder.id))!;
    expect(snoozed.status).toBe('scheduled');
    expect(snoozed.scheduled_at).toBe('2026-10-25T10:10:00.000Z');

    // Task deadline is still unchanged at 10:30
    const currentTask = (await db.getTaskById(task.id, user.id))!;
    expect(currentTask.due_at).toBe('2026-10-25T10:30:00Z');
  });

  it('enforces maximum 8 follow-ups, pauses escalation, and notifies user', async () => {
    const user = await db.getOrCreateUser(111, 111, 'Bob');
    const { reminder } = await db.createTaskWithReminder(
      user.id,
      'Submit taxes',
      '2026-10-25T10:30:00Z',
      '2026-10-25T10:00:00Z'
    );

    // Initial send (follow_up_count becomes 1)
    await worker.runBatch();

    // Simulate 7 more follow-ups to reach max limit (8 total)
    for (let i = 1; i < 8; i++) {
      clock.advanceMinutes(60);
      await worker.runBatch();
    }

    const currentRem = (await db.getReminder(reminder.id))!;
    expect(currentRem.follow_up_count).toBe(8);

    // 9th invocation should hit limit and pause
    clock.advanceMinutes(60);
    const pauseBatch = await worker.runBatch();
    expect(pauseBatch.pausedCount).toBe(1);

    const pausedRem = (await db.getReminder(reminder.id))!;
    expect(pausedRem.status).toBe('paused');
    expect(pausedRem.next_follow_up_at).toBeNull();

    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('Reminder Escalation Paused');
    expect(lastMsg.text).toContain('followed up 8 times');
  });

  it('recovers expired leases from crashed or timed-out workers', async () => {
    const user = await db.getOrCreateUser(111, 111, 'Bob');
    const { reminder } = await db.createTaskWithReminder(
      user.id,
      'Submit taxes',
      '2026-10-25T10:30:00Z',
      '2026-10-25T10:00:00Z'
    );

    // Simulate an abandoned claim in 'sending' status with expired lease
    const rem = (await db.getReminder(reminder.id))!;
    rem.status = 'sending';
    rem.lease_token = 'old-crashed-worker';
    rem.lease_until = '2026-10-25T09:59:00Z'; // Expired

    // Run worker: should recover the expired lease and process it
    const recoveryBatch = await worker.runBatch();
    expect(recoveryBatch.claimedCount).toBe(1);
    expect(recoveryBatch.sentCount).toBe(1);

    const recovered = (await db.getReminder(reminder.id))!;
    expect(recovered.status).toBe('awaiting_ack');
  });

  it('prevents concurrent workers from claiming the same active lease', async () => {
    const user = await db.getOrCreateUser(111, 111, 'Bob');
    await db.createTaskWithReminder(
      user.id,
      'Task 1',
      '2026-10-25T10:30:00Z',
      '2026-10-25T10:00:00Z'
    );

    // First worker claims
    const token1 = 'worker-1';
    const claimed1 = await db.claimDueReminders(10, 60, token1);
    expect(claimed1.length).toBe(1);

    // Second worker attempts claim before lease expires -> should claim 0
    const token2 = 'worker-2';
    const claimed2 = await db.claimDueReminders(10, 60, token2);
    expect(claimed2.length).toBe(0);
  });

  it('records Telegram failure and schedules retry in 2 minutes', async () => {
    const user = await db.getOrCreateUser(111, 111, 'Bob');
    const { reminder } = await db.createTaskWithReminder(
      user.id,
      'Flaky task',
      '2026-10-25T10:30:00Z',
      '2026-10-25T10:00:00Z'
    );

    // Force Telegram failure
    notification.sendText = vi.fn().mockResolvedValue({
      ok: false,
      error: 'Telegram API 502 Bad Gateway',
    });

    const runResult = await worker.runBatch();
    expect(runResult.failedCount).toBe(1);

    const failedRem = (await db.getReminder(reminder.id))!;
    expect(failedRem.status).toBe('scheduled');
    expect(failedRem.last_error).toContain('Telegram API 502');
    // Retried at 10:02:00 UTC (2 minutes later)
    expect(failedRem.scheduled_at).toBe('2026-10-25T10:02:00.000Z');
    expect(failedRem.follow_up_count).toBe(1);
  });

  it('marks reminder failed immediately on permanent Telegram errors (e.g. 403 bot blocked)', async () => {
    const user = await db.getOrCreateUser(111, 111, 'Bob');
    const { reminder } = await db.createTaskWithReminder(
      user.id,
      'Blocked task',
      '2026-10-25T10:30:00Z',
      '2026-10-25T10:00:00Z'
    );

    // Simulate Telegram 403 Forbidden: bot was blocked by the user
    notification.sendText = vi.fn().mockResolvedValue({
      ok: false,
      error: '403 Forbidden: bot was blocked by the user',
    });

    const runResult = await worker.runBatch();
    expect(runResult.failedCount).toBe(1);

    const failedRem = (await db.getReminder(reminder.id))!;
    expect(failedRem.status).toBe('failed');
    expect(failedRem.last_error).toContain('bot was blocked');
  });

  it('rejects callback queries from unauthorized users', async () => {
    const user = await db.getOrCreateUser(111, 111, 'Bob');
    const otherUser = await db.getOrCreateUser(222, 222, 'Mallory');

    const { reminder } = await db.createTaskWithReminder(
      user.id,
      'Secret Task',
      '2026-10-25T10:30:00Z',
      '2026-10-25T10:00:00Z'
    );

    // Mallory tries to click done on Bob's reminder
    const maliciousQuery: TelegramCallbackQuery = {
      id: 'query-hack',
      from: { id: 222, is_bot: false, first_name: 'Mallory' },
      data: `done:${reminder.id}`,
    };

    await callbackHandler.handleCallback(maliciousQuery, otherUser);

    expect(notification.answerCallbackQuery).toHaveBeenCalledWith(
      'query-hack',
      'Unauthorized action'
    );

    // Reminder remains unacknowledged
    const unchangedRem = (await db.getReminder(reminder.id))!;
    expect(unchangedRem.status).toBe('scheduled');
  });

  it('rejects stale callback clicks on cancelled or rescheduled reminders', async () => {
    const user = await db.getOrCreateUser(111, 111, 'Bob');
    const { reminder } = await db.createTaskWithReminder(
      user.id,
      'Trip planning',
      '2026-10-25T10:30:00Z',
      '2026-10-25T10:00:00Z'
    );

    // Manually cancel reminder
    const rem = (await db.getReminder(reminder.id))!;
    rem.status = 'cancelled';

    const staleQuery: TelegramCallbackQuery = {
      id: 'stale-1',
      from: { id: 111, is_bot: false, first_name: 'Bob' },
      data: `done:${reminder.id}`,
    };

    await callbackHandler.handleCallback(staleQuery, user);
    expect(notification.answerCallbackQuery).toHaveBeenCalledWith(
      'stale-1',
      'This reminder is no longer active (rescheduled or cancelled).'
    );
  });

  it('handles repeat clicks on already acknowledged reminder idempotently', async () => {
    const user = await db.getOrCreateUser(111, 111, 'Bob');
    const { reminder } = await db.createTaskWithReminder(
      user.id,
      'Pay bills',
      '2026-10-25T10:30:00Z',
      '2026-10-25T10:00:00Z'
    );

    await worker.runBatch();

    const query: TelegramCallbackQuery = {
      id: 'click-1',
      from: { id: 111, is_bot: false, first_name: 'Bob' },
      data: `done:${reminder.id}`,
    };

    // First click: completes
    await callbackHandler.handleCallback(query, user);
    expect(notification.answerCallbackQuery).toHaveBeenCalledWith(
      'click-1',
      'Marked as completed! 🎉'
    );

    // Second click: recognized as already acknowledged
    const queryRepeat: TelegramCallbackQuery = {
      id: 'click-2',
      from: { id: 111, is_bot: false, first_name: 'Bob' },
      data: `done:${reminder.id}`,
    };
    await callbackHandler.handleCallback(queryRepeat, user);
    expect(notification.answerCallbackQuery).toHaveBeenCalledWith(
      'click-2',
      'Already marked as completed! ✅'
    );
  });

  it('cancelling a task cascades to cancel all pending reminders', async () => {
    const user = await db.getOrCreateUser(111, 111, 'Bob');
    const { task, reminder } = await db.createTaskWithReminder(
      user.id,
      'Old project',
      '2026-10-25T10:30:00Z',
      '2026-10-25T10:00:00Z'
    );

    // Cancel task
    await db.cancelTask(user.id, task.id);

    const rem = (await db.getReminder(reminder.id))!;
    expect(rem.status).toBe('cancelled');

    // Worker run should not claim the cancelled reminder
    const runResult = await worker.runBatch();
    expect(runResult.claimedCount).toBe(0);
  });

  it('rejects state update if worker lease token does not match', async () => {
    const user = await db.getOrCreateUser(111, 111, 'Bob');
    const { reminder } = await db.createTaskWithReminder(
      user.id,
      'Race condition task',
      '2026-10-25T10:30:00Z',
      '2026-10-25T10:00:00Z'
    );

    // Worker 1 claims
    await db.claimDueReminders(10, 60, 'worker-1-token');

    // Worker 2 attempts to record sent using wrong token
    const recorded = await db.recordReminderSent(
      reminder.id,
      'stale-worker-token',
      '2026-10-25T10:10:00Z',
      1
    );

    expect(recorded).toBe(false);
  });

  it('correctly filters "today" tasks in user timezone (Asia/Kolkata)', async () => {
    // Current time: 2026-10-30 02:00:00 IST (2026-10-29 20:30:00 UTC)
    const tzClock = new ControllableClock('2026-10-29T20:30:00Z');
    const tzDb = new InMemoryDatabaseRepository(tzClock);
    const user = await tzDb.getOrCreateUser(111, 111, 'Bob');

    // Task 1: Due Oct 30 at 03:00 IST (Oct 29 21:30:00 UTC) - is TODAY in Asia/Kolkata
    await tzDb.createTask(user.id, 'Early morning task', '2026-10-29T21:30:00Z');

    // Task 2: Due Oct 31 at 02:00 IST (Oct 30 20:30:00 UTC) - is TOMORROW in Asia/Kolkata
    await tzDb.createTask(user.id, 'Tomorrow task', '2026-10-30T20:30:00Z');

    const todayTasks = await tzDb.listTasks(user.id, 'today', 'Asia/Kolkata');
    expect(todayTasks).toHaveLength(1);
    expect(todayTasks[0].title).toBe('Early morning task');
  });
});

