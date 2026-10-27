// src/bot/callbacks.ts
import { DatabaseRepository } from '../db/repository.js';
import {
  NotificationProvider,
  TelegramCallbackQuery,
  AppUser,
  Clock,
} from '../shared/types.js';
import { formatLocalDateTime } from '../shared/time.js';
import { SystemClock } from '../shared/clock.js';
import {
  createAiSettingsMessage,
  createProvidersMenuMessage,
  createConnectLinkMessage,
  createMemoryListMessage,
} from './messages.js';
import { randomBytes } from 'node:crypto';
import { RoutingMode } from '../ai/router.js';
import { ProviderId } from '../ai/provider.js';

export interface CallbackHandlerConfig {
  db: DatabaseRepository;
  notification: NotificationProvider;
  clock?: Clock;
}

export class CallbackHandler {
  private readonly db: DatabaseRepository;
  private readonly notification: NotificationProvider;
  private readonly clock: Clock;

  constructor(config: CallbackHandlerConfig) {
    this.db = config.db;
    this.notification = config.notification;
    this.clock = config.clock || new SystemClock();
  }

  async handleCallback(
    query: TelegramCallbackQuery,
    user: AppUser
  ): Promise<void> {
    const data = query.data || '';
    const chatId = query.message?.chat.id || user.telegram_chat_id;

    // 1. AI Navigation Callbacks
    if (data === 'ai:home') {
      await this.notification.answerCallbackQuery(query.id, 'AI Settings');
      const prefs = (await this.db.getUserModelPreferences(user.id)) || {
        defaultProvider: 'gemini',
        defaultModel: 'gemini-3.8-flash',
        routingMode: 'best_available',
      };
      const creds = await this.db.getUserCredentials(user.id);
      await this.notification.sendText(
        createAiSettingsMessage(
          chatId,
          prefs,
          creds.map(c => ({ provider: c.provider, maskedKey: c.maskedKey }))
        )
      );
      return;
    }

    if (data === 'ai:providers') {
      await this.notification.answerCallbackQuery(query.id, 'Providers');
      const creds = await this.db.getUserCredentials(user.id);
      await this.notification.sendText(
        createProvidersMenuMessage(
          chatId,
          creds.map(c => ({ provider: c.provider, maskedKey: c.maskedKey }))
        )
      );
      return;
    }

    if (data === 'ai:memory') {
      await this.notification.answerCallbackQuery(query.id, 'Memory');
      const memories = await this.db.getMemoriesForUser(user.id);
      await this.notification.sendText(createMemoryListMessage(chatId, memories));
      return;
    }

    if (data === 'ai:mode' || data === 'ai:models') {
      await this.notification.answerCallbackQuery(query.id, 'Select Mode');
      await this.notification.sendText({
        chat_id: chatId,
        text: `🔀 *Choose Your AI Routing Mode:*

• *⚡ Quick Answer*: Low-latency flash models for rapid responses.
• *🧠 Deep Reasoning*: High-intelligence models for complex questions.
• *💻 Coding*: Optimized for programming and code review.
• *💰 Budget*: Cost-efficient / free tier models.
• *✨ Best Available*: Automatically balances latency, capability & cost.
• *⚙️ Manual*: Strictly use your manually selected provider & model.`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '⚡ Quick Answer', callback_data: 'mode:quick_answer' },
              { text: '🧠 Deep Reasoning', callback_data: 'mode:deep_reasoning' },
            ],
            [
              { text: '💻 Coding', callback_data: 'mode:coding' },
              { text: '💰 Budget', callback_data: 'mode:budget' },
            ],
            [
              { text: '✨ Best Available', callback_data: 'mode:best_available' },
              { text: '⚙️ Manual', callback_data: 'mode:manual' },
            ],
            [{ text: '🔙 Back to AI Settings', callback_data: 'ai:home' }],
          ],
        },
      });
      return;
    }

    // 2. Mode selection callback
    if (data.startsWith('mode:')) {
      const mode = data.replace('mode:', '') as RoutingMode;
      await this.db.saveUserModelPreferences(user.id, { routingMode: mode });
      await this.notification.answerCallbackQuery(query.id, `Mode set to: ${mode}`);
      await this.notification.sendText({
        chat_id: chatId,
        text: `✅ Routing mode updated to *${mode}*. Future tasks and questions will route accordingly.`,
        parse_mode: 'Markdown',
      });
      return;
    }

    // 3. Provider Connect callback
    if (data.startsWith('provider:connect:')) {
      const provider = data.replace('provider:connect:', '') as ProviderId;
      const token = randomBytes(16).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await this.db.createSetupSession(user.id, provider, token, expiresAt);

      const baseUrl = process.env.PUBLIC_DASHBOARD_URL || 'http://localhost:3000';
      const setupUrl = `${baseUrl}/connect-provider?token=${token}`;

      await this.notification.answerCallbackQuery(query.id, `Setting up ${provider}`);
      await this.notification.sendText(createConnectLinkMessage(chatId, provider, setupUrl));
      return;
    }

    // 4. Provider Disconnect callback
    if (data.startsWith('provider:disconnect:')) {
      const provider = data.replace('provider:disconnect:', '') as ProviderId;
      await this.db.deleteUserCredential(user.id, provider);
      await this.notification.answerCallbackQuery(query.id, `Disconnected ${provider}`);
      await this.notification.sendText({
        chat_id: chatId,
        text: `🔌 Disconnected ${provider.toUpperCase()}. API key removed.`,
      });
      return;
    }

    // 5. Memory clear callback
    if (data === 'memory:clear_confirm') {
      const memories = await this.db.getMemoriesForUser(user.id);
      for (const m of memories) {
        await this.db.deleteMemory(m.id, user.id);
      }
      await this.notification.answerCallbackQuery(query.id, 'Memories cleared');
      await this.notification.sendText({
        chat_id: chatId,
        text: `🗑️ Cleared all stored personal memories.`,
      });
      return;
    }

    // 6. Reminder callbacks (done, snooze, resched)
    const parts = data.split(':');
    const action = parts[0];
    const reminderId = parts[1];

    if (!reminderId) {
      await this.notification.answerCallbackQuery(query.id, 'Invalid action');
      return;
    }

    const reminder = await this.db.getReminder(reminderId);
    if (!reminder) {
      await this.notification.answerCallbackQuery(query.id, 'Reminder not found');
      return;
    }

    // Security check: verify sender ownership
    if (reminder.user_id !== user.id) {
      await this.notification.answerCallbackQuery(query.id, 'Unauthorized action');
      return;
    }

    // Stale callback verification
    if (reminder.status === 'cancelled' || reminder.status === 'rescheduled') {
      await this.notification.answerCallbackQuery(
        query.id,
        'This reminder is no longer active (rescheduled or cancelled).'
      );
      return;
    }

    if (action === 'done') {
      if (reminder.status === 'acknowledged') {
        await this.notification.answerCallbackQuery(
          query.id,
          'Already marked as completed! ✅'
        );
        return;
      }

      const updated = await this.db.acknowledgeReminder(reminderId, user.id);
      await this.notification.answerCallbackQuery(query.id, 'Marked as completed! 🎉');

      if (updated) {
        const task = await this.db.getTaskById(reminder.task_id, user.id);
        const title = task?.title || 'Task';
        await this.notification.sendText({
          chat_id: chatId,
          text: `🎉 *Task Completed!*\n\n"${title}" has been marked as done. No further follow-ups will be sent.`,
          parse_mode: 'Markdown',
        });
      }
    } else if (action === 'snooze') {
      if (reminder.status === 'acknowledged') {
        await this.notification.answerCallbackQuery(
          query.id,
          'This task is already completed! ✅'
        );
        return;
      }

      const minutes = parseInt(parts[2] || '10', 10);
      const snoozeUntil = new Date(
        this.clock.now().getTime() + minutes * 60 * 1000
      ).toISOString();

      const updated = await this.db.snoozeReminder(reminderId, user.id, snoozeUntil);

      if (updated) {
        await this.notification.answerCallbackQuery(query.id, `Snoozed for ${minutes} min 💤`);
        const formatted = formatLocalDateTime(snoozeUntil, user.timezone);
        await this.notification.sendText({
          chat_id: chatId,
          text: `💤 *Snoozed!*\n\nI will remind you again on ${formatted}.`,
          parse_mode: 'Markdown',
        });
      } else {
        await this.notification.answerCallbackQuery(
          query.id,
          'Could not snooze (reminder may already be completed or cancelled)'
        );
      }
    } else if (action === 'resched') {
      if (reminder.status === 'acknowledged') {
        await this.notification.answerCallbackQuery(
          query.id,
          'This task is already completed! ✅'
        );
        return;
      }

      await this.notification.answerCallbackQuery(query.id, 'Rescheduling...');
      const task = await this.db.getTaskById(reminder.task_id, user.id);
      const title = task?.title || 'your task';

      await this.notification.sendText({
        chat_id: chatId,
        text: `📅 *Reschedule "${title}"*\n\nWhen would you like to move this task to?\nJust reply with the new time, e.g.:\n"Reschedule to tomorrow 4 PM" or "Move to Friday at noon".`,
        parse_mode: 'Markdown',
      });
    } else {
      await this.notification.answerCallbackQuery(query.id, 'Unknown action');
    }
  }
}
