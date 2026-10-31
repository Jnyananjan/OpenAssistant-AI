// src/bot/callbacks.ts
import { DatabaseRepository } from '../db/repository.js';
import {
  NotificationProvider,
  TelegramCallbackQuery,
  AppUser,
  Clock,
  SendTextInput,
  TelegramInlineKeyboardMarkup,
} from '../shared/types.js';
import { formatLocalDateTime } from '../shared/time.js';
import { SystemClock } from '../shared/clock.js';
import {
  createAiSettingsMessage,
  createProvidersMenuMessage,
  createConnectLinkMessage,
  createMemoryListMessage,
  createSettingsMessage,
  createTimezoneSelectMessage,
  createRoutingModeSelectMessage,
  createModelSelectMessage,
  createProviderManageMessage,
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
    let data = query.data || '';
    const chatId = query.message?.chat.id || user.telegram_chat_id;

    const sendOrEdit = async (msg: SendTextInput) => {
      if (query.message?.message_id && this.notification.editMessageText) {
        const ok = await this.notification.editMessageText({
          chat_id: chatId,
          message_id: query.message.message_id,
          text: msg.text,
          parse_mode: msg.parse_mode,
          reply_markup: msg.reply_markup as TelegramInlineKeyboardMarkup,
        });
        if (ok) return;
      }
      await this.notification.sendText(msg);
    };

    // 1. Settings & Navigation Callbacks
    if (data.startsWith('tz:')) {
      const newTz = data.slice(3);
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: newTz }).format(new Date());
        const updated = await this.db.updateUserTimezone(user.id, newTz);
        user.timezone = updated.timezone;
        await this.notification.answerCallbackQuery(query.id, `Timezone set to ${newTz}`);
      } catch {
        await this.notification.answerCallbackQuery(query.id, 'Invalid timezone');
      }
      const prefs = (await this.db.getUserModelPreferences(user.id)) || {
        defaultProvider: 'gemini',
        defaultModel: 'gemini-3.8-flash',
        routingMode: 'best_available',
      };
      await sendOrEdit(createSettingsMessage(chatId, user, prefs));
      return;
    }

    if (data === 'settings:timezone') {
      await this.notification.answerCallbackQuery(query.id, 'Select Timezone');
      await sendOrEdit(createTimezoneSelectMessage(chatId, user.timezone));
      return;
    }

    if (data === 'settings:home') {
      await this.notification.answerCallbackQuery(query.id, 'Settings');
      const prefs = (await this.db.getUserModelPreferences(user.id)) || {
        defaultProvider: 'gemini',
        defaultModel: 'gemini-3.8-flash',
        routingMode: 'best_available',
      };
      await sendOrEdit(createSettingsMessage(chatId, user, prefs));
      return;
    }

    if (data === 'briefing:run') {
      await this.notification.answerCallbackQuery(query.id, 'Generating briefing...');
      const todayTasks = await this.db.listTasks(user.id, 'today', user.timezone);
      const openTasks = await this.db.listTasks(user.id, 'all', user.timezone);
      const nowStr = formatLocalDateTime(new Date().toISOString(), user.timezone);
      let text = `☀️ *Executive Briefing — ${nowStr}*\n\n`;
      if (todayTasks.length === 0) {
        text += `🎯 *Today's Focus:* Clear schedule! No tasks due today.\n`;
      } else {
        text += `🎯 *Today's Focus (${todayTasks.length} tasks):*\n`;
        todayTasks.forEach((t, i) => {
          text += `${i + 1}. *${t.title}*${t.due_at ? ` (Due: ${formatLocalDateTime(t.due_at, user.timezone)})` : ''}\n`;
        });
      }
      text += `\n📋 *Total Active Tasks:* ${openTasks.length}\n`;
      text += `\nHave a productive day! Reply with any task or expense anytime.`;
      await this.notification.sendText({ chat_id: chatId, text, parse_mode: 'Markdown' });
      return;
    }

    if (data === 'expenses:summary') {
      await this.notification.answerCallbackQuery(query.id, 'Fetching expenses...');
      const memories = await this.db.getMemoriesForUser(user.id);
      const expenseMemories = memories.filter(
        m =>
          m.key?.toLowerCase().includes('expense') ||
          m.content?.toLowerCase().includes('expense') ||
          m.content?.toLowerCase().includes('spent') ||
          (m.category as string) === 'finance'
      );
      if (expenseMemories.length === 0) {
        await this.notification.sendText({
          chat_id: chatId,
          text: `💰 *Expense Tracker*\n\nNo expenses logged yet.\n\nTell me naturally anytime:\n• "Spent 450 on lunch with team"\n• "Paid $60 for groceries"`,
          parse_mode: 'Markdown',
        });
      } else {
        let text = `💰 *Recent Logged Expenses:*\n\n`;
        expenseMemories.slice(-5).forEach(m => {
          text += `• ${m.content}\n`;
        });
        await this.notification.sendText({ chat_id: chatId, text, parse_mode: 'Markdown' });
      }
      return;
    }

    // 2. AI Navigation Callbacks
    if (data === 'ai:home') {
      await this.notification.answerCallbackQuery(query.id, 'AI Settings');
      const prefs = (await this.db.getUserModelPreferences(user.id)) || {
        defaultProvider: 'gemini',
        defaultModel: 'gemini-3.8-flash',
        routingMode: 'best_available',
      };
      const creds = await this.db.getUserCredentials(user.id);
      await sendOrEdit(
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
      await sendOrEdit(
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
      await sendOrEdit(createMemoryListMessage(chatId, memories));
      return;
    }

    if (data === 'ai:mode') {
      const prefs = (await this.db.getUserModelPreferences(user.id)) || {
        defaultProvider: 'gemini',
        defaultModel: 'gemini-3.8-flash',
        routingMode: 'best_available',
      };
      await this.notification.answerCallbackQuery(query.id, 'Routing Mode');
      await sendOrEdit(createRoutingModeSelectMessage(chatId, prefs.routingMode));
      return;
    }

    if (data === 'ai:models') {
      const prefs = (await this.db.getUserModelPreferences(user.id)) || {
        defaultProvider: 'gemini',
        defaultModel: 'gemini-3.8-flash',
        routingMode: 'best_available',
      };
      await this.notification.answerCallbackQuery(query.id, 'Select Model');
      await sendOrEdit(createModelSelectMessage(chatId, prefs.defaultModel, prefs.defaultProvider));
      return;
    }

    if (data.startsWith('set_model:')) {
      const [, modelId, providerId] = data.split(':');
      await this.db.saveUserModelPreferences(user.id, {
        defaultModel: modelId,
        defaultProvider: providerId as ProviderId,
      });
      await this.notification.answerCallbackQuery(query.id, `Model set to ${modelId}`);
      await sendOrEdit(createModelSelectMessage(chatId, modelId, providerId));
      return;
    }

    // 2. Mode selection callback
    if (data.startsWith('mode:')) {
      const mode = data.replace('mode:', '') as RoutingMode;
      await this.db.saveUserModelPreferences(user.id, { routingMode: mode });
      await this.notification.answerCallbackQuery(query.id, `Mode set to: ${mode}`);
      await sendOrEdit(createRoutingModeSelectMessage(chatId, mode));
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

    // Provider Manage callback
    if (data.startsWith('provider:manage:')) {
      const provider = data.replace('provider:manage:', '') as ProviderId;
      const creds = await this.db.getUserCredentials(user.id);
      const cred = creds.find(c => c.provider === provider);
      const maskedKey = cred?.maskedKey || 'Configured via environment';
      await this.notification.answerCallbackQuery(query.id, `Managing ${provider.toUpperCase()}`);
      await sendOrEdit(createProviderManageMessage(chatId, provider, maskedKey));
      return;
    }

    // 4. Provider Disconnect callback
    if (data.startsWith('provider:disconnect:')) {
      const provider = data.replace('provider:disconnect:', '') as ProviderId;
      await this.db.deleteUserCredential(user.id, provider);
      await this.notification.answerCallbackQuery(query.id, `Disconnected ${provider}`);
      const creds = await this.db.getUserCredentials(user.id);
      await sendOrEdit(
        createProvidersMenuMessage(
          chatId,
          creds.map(c => ({ provider: c.provider, maskedKey: c.maskedKey }))
        )
      );
      return;
    }

    // 5. Memory clear callback
    if (data === 'memory:clear_confirm') {
      const memories = await this.db.getMemoriesForUser(user.id);
      for (const m of memories) {
        await this.db.deleteMemory(m.id, user.id);
      }
      await this.notification.answerCallbackQuery(query.id, 'Memories cleared');
      await sendOrEdit(createMemoryListMessage(chatId, []));
      return;
    }

    // 6. Direct task completion callback
    if (data.startsWith('task_done:')) {
      const taskId = data.replace('task_done:', '');
      const task = await this.db.getTaskById(taskId, user.id);
      if (task) {
        await this.db.completeTask(user.id, taskId);
        await this.notification.answerCallbackQuery(query.id, 'Task completed! ✅');
        await this.notification.sendText({
          chat_id: chatId,
          text: `🎉 *Task Completed!*\n\n"${task.title}" has been marked as done.`,
          parse_mode: 'Markdown',
        });
      } else {
        await this.notification.answerCallbackQuery(query.id, 'Task not found');
      }
      return;
    }

    // 7. Nightly task rollover callback
    if (data.startsWith('rollover:')) {
      const taskId = data.replace('rollover:', '');
      const task = await this.db.getTaskById(taskId, user.id);
      if (task) {
        const tomorrow = new Date(this.clock.now().getTime() + 24 * 60 * 60 * 1000);
        const tomorrowDate = new Intl.DateTimeFormat('en-CA', { timeZone: user.timezone || 'Asia/Kolkata' }).format(tomorrow);
        const nextDueUtc = new Date(this.clock.now().getTime() + 24 * 60 * 60 * 1000);

        await this.db.rescheduleTaskAndReminder(
          user.id,
          task.id,
          null,
          nextDueUtc.toISOString(),
          nextDueUtc.toISOString()
        );

        await this.notification.answerCallbackQuery(query.id, 'Rolled over to tomorrow 9 AM! 📅');
        await this.notification.sendText({
          chat_id: chatId,
          text: `📅 *Rolled Over:* "${task.title}"\nNew deadline: Tomorrow morning.`,
          parse_mode: 'Markdown',
        });
      } else {
        await this.notification.answerCallbackQuery(query.id, 'Task not found');
      }
      return;
    }

    // 8. Reminder callbacks (done, snooze, resched)
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
