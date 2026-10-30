// tests/integration/webhook.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookController } from '../../src/bot/webhook.js';
import { InMemoryDatabaseRepository } from '../../src/db/in-memory-repository.js';
import { UserAllowlist } from '../../src/bot/allowlist.js';
import {
  NotificationProvider,
  SendTextInput,
  SendTextResult,
  TelegramWebhookUpdate,
} from '../../src/shared/types.js';
import { AIProvider } from '../../src/ai/provider.js';
import { ControllableClock } from '../../src/shared/clock.js';

describe('WebhookController Integration', () => {
  let db: InMemoryDatabaseRepository;
  let sentMessages: SendTextInput[];
  let notification: NotificationProvider;
  let mockAiProvider: AIProvider;
  let clock: ControllableClock;
  let controller: WebhookController;

  const WEBHOOK_SECRET = 'super-secret-token-123';

  beforeEach(() => {
    clock = new ControllableClock('2026-10-25T12:00:00Z');
    db = new InMemoryDatabaseRepository(clock);
    sentMessages = [];

    notification = {
      sendText: vi.fn().mockImplementation(async (input: SendTextInput): Promise<SendTextResult> => {
        sentMessages.push(input);
        return { ok: true, message_id: 1 };
      }),
      answerCallbackQuery: vi.fn().mockResolvedValue(true),
    };

    mockAiProvider = {
      interpretMessage: vi.fn().mockResolvedValue({
        intent: 'create_task_with_reminder',
        title: 'Python assignment',
        due_at_local: '2026-10-26T18:00:00',
        reminder_offset_minutes: 5,
        timezone: 'Asia/Kolkata',
      }),
    };

    controller = new WebhookController({
      webhookSecret: WEBHOOK_SECRET,
      db,
      notification,
      aiProvider: mockAiProvider,
      allowlist: new UserAllowlist('123456'), // Only user 123456 is allowed
      clock,
    });
  });

  it('rejects requests with invalid or missing secret token header', async () => {
    const update: TelegramWebhookUpdate = {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 100, type: 'private' },
        date: 12345,
        text: '/start',
      },
    };

    const resMissing = await controller.handleRequest(null, update);
    expect(resMissing.statusCode).toBe(401);

    const resInvalid = await controller.handleRequest('wrong-secret', update);
    expect(resInvalid.statusCode).toBe(401);
  });

  it('deduplicates Telegram updates by update_id', async () => {
    const update: TelegramWebhookUpdate = {
      update_id: 200,
      message: {
        message_id: 1,
        from: { id: 123456, is_bot: false, first_name: 'Jana' },
        chat: { id: 123456, type: 'private' },
        date: 12345,
        text: '/start',
      },
    };

    // First delivery
    const res1 = await controller.handleRequest(WEBHOOK_SECRET, update);
    expect(res1.statusCode).toBe(200);
    expect(sentMessages.length).toBe(1);

    // Second delivery of same update_id
    const res2 = await controller.handleRequest(WEBHOOK_SECRET, update);
    expect(res2.statusCode).toBe(200);
    expect(res2.body.note).toBe('Duplicate update ignored');
    // Notification count does not increase
    expect(sentMessages.length).toBe(1);
  });

  it('rejects unauthorized users with access restricted message', async () => {
    const update: TelegramWebhookUpdate = {
      update_id: 300,
      message: {
        message_id: 1,
        from: { id: 999999, is_bot: false, first_name: 'Intruder' }, // Not in allowlist
        chat: { id: 999999, type: 'private' },
        date: 12345,
        text: '/start',
      },
    };

    const res = await controller.handleRequest(WEBHOOK_SECRET, update);
    expect(res.statusCode).toBe(200);
    expect(res.body.access).toBe('denied');
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].text).toContain('Access Restricted');
  });

  it('handles /start, registers user, and replies with helpful onboarding', async () => {
    const update: TelegramWebhookUpdate = {
      update_id: 400,
      message: {
        message_id: 1,
        from: { id: 123456, is_bot: false, first_name: 'Alice' },
        chat: { id: 123456, type: 'private' },
        date: 12345,
        text: '/start',
      },
    };

    const res = await controller.handleRequest(WEBHOOK_SECRET, update);
    expect(res.statusCode).toBe(200);
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].text).toContain('Hello Alice! I am OpenAssistant AI');

    const user = await db.getUserByTelegramId(123456);
    expect(user).not.toBeNull();
    expect(user?.display_name).toBe('Alice');
    expect(user?.timezone).toBe('Asia/Kolkata');
  });

  it('creates task and reminder from natural language input', async () => {
    const update: TelegramWebhookUpdate = {
      update_id: 500,
      message: {
        message_id: 1,
        from: { id: 123456, is_bot: false, first_name: 'Alice' },
        chat: { id: 123456, type: 'private' },
        date: 12345,
        text: 'Finish Python assignment tomorrow at 6 PM. Remind me 5 minutes before',
      },
    };

    const res = await controller.handleRequest(WEBHOOK_SECRET, update);
    expect(res.statusCode).toBe(200);

    const user = (await db.getUserByTelegramId(123456))!;
    const tasks = await db.listTasks(user.id);
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe('Python assignment');

    const reminders = Array.from(db.reminders.values()).filter((r) => r.user_id === user.id);
    expect(reminders.length).toBe(1);
    expect(reminders[0].status).toBe('scheduled');

    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].text).toContain('Task & Reminder Saved');
    expect(sentMessages[0].text).toContain('Python assignment');
    expect(sentMessages[0].text).toContain('5 min before');
  });

  it('updates user timezone via /settings', async () => {
    const update: TelegramWebhookUpdate = {
      update_id: 600,
      message: {
        message_id: 1,
        from: { id: 123456, is_bot: false, first_name: 'Alice' },
        chat: { id: 123456, type: 'private' },
        date: 12345,
        text: '/settings America/New_York',
      },
    };

    const res = await controller.handleRequest(WEBHOOK_SECRET, update);
    expect(res.statusCode).toBe(200);

    const user = await db.getUserByTelegramId(123456);
    expect(user?.timezone).toBe('America/New_York');
    expect(sentMessages[0].text).toContain('Timezone updated to *America/New_York*');
  });

  it('rejects updates without update_id with 400 Bad Request', async () => {
    // @ts-ignore
    const res = await controller.handleRequest(WEBHOOK_SECRET, {});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Missing update_id');
  });

  it('handles natural language reschedule for an open task', async () => {
    // Create an initial task
    const user = await db.getOrCreateUser(123456, 123456, 'Alice');
    await db.createTaskWithReminder(
      user.id,
      'Python assignment',
      '2026-10-26T12:30:00Z',
      '2026-10-26T12:25:00Z'
    );

    mockAiProvider.interpretMessage = vi.fn().mockResolvedValue({
      intent: 'reschedule_task',
      task_title_query: 'Python assignment',
      new_due_at_local: '2026-10-27T18:00:00',
      new_reminder_offset_minutes: 0,
      timezone: 'Asia/Kolkata',
    });

    const update: TelegramWebhookUpdate = {
      update_id: 700,
      message: {
        message_id: 2,
        from: { id: 123456, is_bot: false, first_name: 'Alice' },
        chat: { id: 123456, type: 'private' },
        date: 12345,
        text: 'Reschedule Python assignment to Oct 27 at 6 PM',
      },
    };

    const res = await controller.handleRequest(WEBHOOK_SECRET, update);
    expect(res.statusCode).toBe(200);

    const tasks = await db.listTasks(user.id);
    expect(tasks[0].due_at).toBe('2026-10-27T12:30:00.000Z');

    const reminder = Array.from(db.reminders.values())[0];
    expect(reminder.scheduled_at).toBe('2026-10-27T12:30:00.000Z');
    expect(sentMessages[sentMessages.length - 1].text).toContain('Rescheduled');
  });

  it('rejects rescheduling to a time in the past', async () => {
    const user = await db.getOrCreateUser(123456, 123456, 'Alice');
    await db.createTaskWithReminder(
      user.id,
      'Python assignment',
      '2026-10-26T12:30:00Z',
      '2026-10-26T12:25:00Z'
    );

    // Current clock is 2026-10-25 12:00:00 UTC (17:30 IST)
    // Try to reschedule to yesterday 2026-10-24 10:00 IST
    mockAiProvider.interpretMessage = vi.fn().mockResolvedValue({
      intent: 'reschedule_task',
      task_title_query: 'Python assignment',
      new_due_at_local: '2026-10-24T10:00:00',
      timezone: 'Asia/Kolkata',
    });

    const update: TelegramWebhookUpdate = {
      update_id: 800,
      message: {
        message_id: 3,
        from: { id: 123456, is_bot: false, first_name: 'Alice' },
        chat: { id: 123456, type: 'private' },
        date: 12345,
        text: 'Reschedule to yesterday',
      },
    };

    const res = await controller.handleRequest(WEBHOOK_SECRET, update);
    expect(res.statusCode).toBe(200);
    expect(sentMessages[sentMessages.length - 1].text).toContain('already in the past');
  });

  it('passes replied message and conversation history into AI interpreter', async () => {
    const user = await db.getOrCreateUser(123456, 123456, 'Alice');

    let capturedContext: string | undefined;
    mockAiProvider.interpretMessage = vi.fn().mockImplementation(async (input) => {
      capturedContext = input.conversationContext;
      return {
        intent: 'chat',
        reply: 'I understand the context!',
      };
    });

    // 1. Send first message
    await controller.handleRequest(WEBHOOK_SECRET, {
      update_id: 901,
      message: {
        message_id: 10,
        from: { id: 123456, is_bot: false, first_name: 'Alice' },
        chat: { id: 123456, type: 'private' },
        date: 12345,
        text: 'Remind me to call Mom',
      },
    });

    // 2. Send second message replying to a bot reminder
    await controller.handleRequest(WEBHOOK_SECRET, {
      update_id: 902,
      message: {
        message_id: 11,
        from: { id: 123456, is_bot: false, first_name: 'Alice' },
        chat: { id: 123456, type: 'private' },
        date: 12346,
        text: 'actually make it tomorrow at 6pm',
        reply_to_message: {
          message_id: 9,
          chat: { id: 123456, type: 'private' },
          date: 12344,
          text: 'Reminder: Call Mom at 4pm',
        },
      },
    });

    expect(capturedContext).toBeDefined();
    expect(capturedContext).toContain('Call Mom at 4pm');
    expect(capturedContext).toContain('Remind me to call Mom');
  });

  it('logs expenses and queries total spent by category', async () => {
    // 1. Log an expense
    mockAiProvider.interpretMessage = vi.fn().mockResolvedValue({
      intent: 'track_expense',
      amount: 25.5,
      currency: 'USD',
      category: 'groceries',
      description: 'Trader Joes',
    });

    await controller.handleRequest(WEBHOOK_SECRET, {
      update_id: 950,
      message: {
        message_id: 20,
        from: { id: 123456, is_bot: false, first_name: 'Alice' },
        chat: { id: 123456, type: 'private' },
        date: 12350,
        text: 'Spent $25.50 on groceries',
      },
    });

    const loggedMsg = sentMessages[sentMessages.length - 1];
    expect(loggedMsg.text).toContain('Expense Logged');
    expect(loggedMsg.text).toContain('USD 25.5');

    // 2. Query expenses
    mockAiProvider.interpretMessage = vi.fn().mockResolvedValue({
      intent: 'query_expenses',
      period: 'week',
    });

    await controller.handleRequest(WEBHOOK_SECRET, {
      update_id: 951,
      message: {
        message_id: 21,
        from: { id: 123456, is_bot: false, first_name: 'Alice' },
        chat: { id: 123456, type: 'private' },
        date: 12351,
        text: 'How much did I spend this week?',
      },
    });

    const queryMsg = sentMessages[sentMessages.length - 1];
    expect(queryMsg.text).toContain('Expenses for this week');
    expect(queryMsg.text).toContain('Groceries');
    expect(queryMsg.text).toContain('25.50');
  });

  it('captures forwarded message and passes it to intent parser', async () => {
    let receivedUserMessage = '';
    mockAiProvider.interpretMessage = vi.fn().mockImplementation(async (input) => {
      receivedUserMessage = input.userMessage;
      return {
        intent: 'chat',
        reply: 'I extracted the details.',
      };
    });

    await controller.handleRequest(WEBHOOK_SECRET, {
      update_id: 960,
      message: {
        message_id: 30,
        from: { id: 123456, is_bot: false, first_name: 'Alice' },
        chat: { id: 123456, type: 'private' },
        date: 12360,
        forward_date: 12300,
        text: 'Flight to NYC departs at 7 AM tomorrow',
      } as any,
    });

    expect(receivedUserMessage).toContain('[Forwarded message]:');
    expect(receivedUserMessage).toContain('Flight to NYC departs at 7 AM tomorrow');
  });
});
