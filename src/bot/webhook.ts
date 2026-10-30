// src/bot/webhook.ts
import { timingSafeEqual } from 'node:crypto';
import { DatabaseRepository } from '../db/repository.js';
import {
  NotificationProvider,
  TelegramWebhookUpdate,
  TelegramMessage,
  AppUser,
  Clock,
  SendTextInput,
  SendTextResult,
} from '../shared/types.js';
import { UserAllowlist } from './allowlist.js';
import { CommandHandler } from './commands.js';
import { CallbackHandler } from './callbacks.js';
import { AIProvider, ProviderId } from '../ai/provider.js';
import { SmartModelRouter } from '../ai/router.js';
import { MemoryEngine } from '../memory/memory-engine.js';
import { EncryptionService } from '../security/encryption.js';
import {
  createUnauthorizedMessage,
  createTaskCreatedMessage,
} from './messages.js';
import { parseLocalToUtc, formatLocalDateTime } from '../shared/time.js';
import { SystemClock } from '../shared/clock.js';
import { AssistantIntent } from '../ai/intent-schema.js';

export interface WebhookConfig {
  webhookSecret?: string;
  db: DatabaseRepository;
  notification: NotificationProvider;
  aiProvider: AIProvider;
  allowlist?: UserAllowlist;
  clock?: Clock;
  memoryEngine?: MemoryEngine;
  encryption?: EncryptionService;
}

export interface WebhookResult {
  statusCode: number;
  body: Record<string, unknown>;
}

export function safeCompareSecret(
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!provided || !expected) {
    return false;
  }
  const bufProvided = Buffer.from(provided, 'utf8');
  const bufExpected = Buffer.from(expected, 'utf8');
  if (bufProvided.length !== bufExpected.length) {
    // Perform constant-time dummy comparison to prevent timing leaks on length
    timingSafeEqual(bufExpected, bufExpected);
    return false;
  }
  return timingSafeEqual(bufProvided, bufExpected);
}

export class WebhookController {
  private readonly webhookSecret?: string;
  private readonly db: DatabaseRepository;
  private readonly notification: NotificationProvider;
  private readonly aiProvider: AIProvider;
  private readonly allowlist: UserAllowlist;
  private readonly clock: Clock;
  private readonly commandHandler: CommandHandler;
  private readonly callbackHandler: CallbackHandler;
  private readonly memoryEngine: MemoryEngine;
  private readonly encryption: EncryptionService;

  constructor(config: WebhookConfig) {
    this.webhookSecret = config.webhookSecret;
    this.db = config.db;
    this.notification = config.notification;
    this.aiProvider = config.aiProvider;
    this.allowlist = config.allowlist || new UserAllowlist();
    this.clock = config.clock || new SystemClock();
    this.memoryEngine = config.memoryEngine || new MemoryEngine({ backend: this.db });
    this.encryption = config.encryption || new EncryptionService();

    this.commandHandler = new CommandHandler({
      db: this.db,
      notification: this.notification,
      encryption: this.encryption,
      router: this.aiProvider instanceof SmartModelRouter ? this.aiProvider : undefined,
    });
    this.callbackHandler = new CallbackHandler({
      db: this.db,
      notification: this.notification,
      clock: this.clock,
    });
  }

  async handleRequest(
    secretTokenHeader: string | null | undefined,
    update: TelegramWebhookUpdate
  ): Promise<WebhookResult> {
    // 1. Verify Telegram webhook secret token
    if (!this.webhookSecret || !safeCompareSecret(secretTokenHeader, this.webhookSecret)) {
      return {
        statusCode: 401,
        body: { error: 'Unauthorized: Invalid webhook secret token' },
      };
    }

    if (!update || typeof update.update_id !== 'number') {
      return {
        statusCode: 400,
        body: { error: 'Bad Request: Missing update_id' },
      };
    }

    const senderUser = update.message?.from || update.callback_query?.from;
    const senderId = senderUser?.id;

    // 2. Deduplicate update
    const { isDuplicate } = await this.db.recordUpdate(update.update_id, senderId);
    if (isDuplicate) {
      return {
        statusCode: 200,
        body: { ok: true, note: 'Duplicate update ignored' },
      };
    }

    try {
      if (!senderUser || !senderId) {
        await this.db.markUpdateProcessed(update.update_id, 'ignored');
        return { statusCode: 200, body: { ok: true } };
      }

      const chatId = update.message?.chat.id || update.callback_query?.message?.chat.id;
      if (!chatId) {
        await this.db.markUpdateProcessed(update.update_id, 'ignored');
        return { statusCode: 200, body: { ok: true } };
      }

      // 3. Check authorization allowlist
      if (!this.allowlist.isAllowed(senderId)) {
        await this.notification.sendText(createUnauthorizedMessage(chatId));
        await this.db.markUpdateProcessed(
          update.update_id,
          'ignored',
          'Unauthorized sender'
        );
        return { statusCode: 200, body: { ok: true, access: 'denied' } };
      }

      // 4. Resolve application user
      const displayName = [senderUser.first_name, senderUser.last_name]
        .filter(Boolean)
        .join(' ');
      const user = await this.db.getOrCreateUser(senderId, chatId, displayName);

      // 5. Handle Callback Queries (inline buttons)
      if (update.callback_query) {
        await this.callbackHandler.handleCallback(update.callback_query, user);
        await this.db.markUpdateProcessed(update.update_id, 'processed');
        return { statusCode: 200, body: { ok: true } };
      }

      // 6. Handle Messages
      if (update.message && update.message.text) {
        const text = update.message.text.trim();

        // Check if message is a reply to an API key prompt (fill-in-the-box)
        if (update.message.reply_to_message?.text && !text.startsWith('/')) {
          const handled = await this.handleApiKeyReply(update.message, user);
          if (handled) {
            await this.db.markUpdateProcessed(update.update_id, 'processed');
            return { statusCode: 200, body: { ok: true } };
          }
        }

        if (text.startsWith('/')) {
          // Slash command
          await this.commandHandler.handleCommand(update.message, user);
        } else {
          // Check if message was forwarded from another user or channel
          const isForwarded = Boolean(
            (update.message as any).forward_date ||
            (update.message as any).forward_from ||
            (update.message as any).forward_origin
          );
          const processedText = isForwarded
            ? `[Forwarded message]:\n"${text}"\nExtract any task, deadline or action item from this forwarded message.`
            : text;

          // Natural language intent
          await this.handleNaturalLanguage(
            processedText,
            chatId,
            user,
            update.message.reply_to_message?.text
          );
        }

        await this.db.markUpdateProcessed(update.update_id, 'processed');
        return { statusCode: 200, body: { ok: true } };
      }

      await this.db.markUpdateProcessed(update.update_id, 'ignored');
      return { statusCode: 200, body: { ok: true } };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.db.markUpdateProcessed(update.update_id, 'failed', msg);
      return { statusCode: 200, body: { ok: true, error: 'Internal processing error' } };
    }
  }

  private async reply(
    chatId: number,
    userId: string,
    input: SendTextInput
  ): Promise<SendTextResult> {
    const res = await this.notification.sendText(input);
    if (res.ok && input.text) {
      await this.db.recordEvent(userId, 'chat_message', {
        role: 'assistant',
        text: input.text,
      });
    }
    return res;
  }

  private async handleNaturalLanguage(
    text: string,
    chatId: number,
    user: { id: string; timezone: string },
    replyToMessageText?: string
  ): Promise<void> {
    const referenceTime = this.clock.now();

    // 1. Fetch recent conversation history before recording the new message
    const recentHistory = await this.db.getRecentChatHistory(user.id, 6);

    // 2. Record incoming user message in chat history
    await this.db.recordEvent(user.id, 'chat_message', { role: 'user', text });

    // 3. Build rich conversation context for LLM
    let conversationContext = '';
    if (recentHistory.length > 0) {
      conversationContext += 'RECENT CONVERSATION (Chronological):\n' +
        recentHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: "${m.text}"`).join('\n') + '\n';
    }
    if (replyToMessageText) {
      conversationContext += `\nDIRECT REPLY: The user is explicitly replying to this message:\n"${replyToMessageText}"\n`;
    }

    // Retrieve memory context & open tasks
    const memories = await this.memoryEngine.getRelevantContext(user.id, text, 300);
    const existingTasks = await this.db.listTasks(user.id, 'all', user.timezone);

    let intent: AssistantIntent;

    const interpretInput = {
      userMessage: text,
      userTimezone: user.timezone,
      referenceTime,
      existingTasks: existingTasks.map(t => ({ id: t.id, title: t.title, due_at: t.due_at })),
      memories,
      conversationContext: conversationContext.trim() || undefined,
    };

    if (this.aiProvider instanceof SmartModelRouter) {
      const prefs = (await this.db.getUserModelPreferences(user.id)) || {
        defaultProvider: 'gemini',
        defaultModel: 'gemini-3.8-flash',
        routingMode: 'best_available',
        taskRules: {},
      };

      const storedCreds = await this.db.getUserCredentials(user.id);
      const decryptedCreds = storedCreds.map(c => ({
        provider: c.provider,
        isActive: c.isActive,
        credentials: {
          apiKey: this.encryption.decrypt({
            encrypted: c.encryptedKey,
            iv: c.iv,
            authTag: c.authTag,
          }),
          baseUrl: c.baseUrl,
        },
      }));

      intent = await this.aiProvider.routeAndInterpret(
        interpretInput,
        prefs,
        decryptedCreds
      );
    } else {
      intent = await this.aiProvider.interpretMessage(interpretInput);
    }

    switch (intent.intent) {
      case 'create_task_with_reminder': {
        try {
          const dueUtc = parseLocalToUtc(intent.due_at_local, intent.timezone || user.timezone);
          const offsetMinutes = intent.reminder_offset_minutes || 0;
          const reminderUtc = new Date(dueUtc.getTime() - offsetMinutes * 60 * 1000);

          if (reminderUtc.getTime() <= referenceTime.getTime()) {
            await this.reply(chatId, user.id, {
              chat_id: chatId,
              text: `⚠️ The calculated reminder time (${formatLocalDateTime(reminderUtc, user.timezone)}) is already in the past. When would you like to be reminded?`,
            });
            return;
          }

          const { task, reminder } = await this.db.createTaskWithReminder(
            user.id,
            intent.title,
            dueUtc.toISOString(),
            reminderUtc.toISOString(),
            intent.priority || 'normal'
          );

          await this.reply(
            chatId,
            user.id,
            createTaskCreatedMessage(
              chatId,
              task.title,
              dueUtc,
              reminderUtc,
              offsetMinutes,
              user.timezone,
              reminder.id
            )
          );
        } catch {
          await this.reply(chatId, user.id, {
            chat_id: chatId,
            text: `I had trouble interpreting the date/time for "${intent.title}". Could you specify the exact deadline (e.g. "Tomorrow at 6 PM")?`,
          });
        }
        break;
      }

      case 'create_task': {
        let dueIso: string | null = null;
        if (intent.due_at_local) {
          try {
            const dueUtc = parseLocalToUtc(intent.due_at_local, intent.timezone || user.timezone);
            dueIso = dueUtc.toISOString();
          } catch {
            // Ignore if invalid
          }
        }

        const task = await this.db.createTask(
          user.id,
          intent.title,
          dueIso,
          intent.priority || 'normal',
          intent.notes
        );

        let reply = `✅ Saved task: *${task.title}*`;
        if (dueIso) {
          reply += ` (Due: ${formatLocalDateTime(dueIso, user.timezone)})`;
        }
        reply += `\n(No reminder scheduled. You can say: "Remind me at 5 PM")`;

        await this.reply(chatId, user.id, {
          chat_id: chatId,
          text: reply,
          parse_mode: 'Markdown',
        });
        break;
      }

      case 'complete_task': {
        const query = intent.task_title_query || '';
        let task = intent.task_id ? await this.db.getTaskById(intent.task_id, user.id) : null;
        if (!task && query) {
          task = await this.db.findTaskByTitle(user.id, query);
        }

        if (task) {
          await this.db.completeTask(user.id, task.id);
          await this.reply(chatId, user.id, {
            chat_id: chatId,
            text: `🎉 Marked *${task.title}* as completed! Outstanding reminders are stopped.`,
            parse_mode: 'Markdown',
          });
        } else {
          await this.reply(chatId, user.id, {
            chat_id: chatId,
            text: `I couldn't find an open task matching "${query}". Check /tasks for your open tasks.`,
          });
        }
        break;
      }

      case 'reschedule_task': {
        const query = intent.task_title_query || '';
        let task = intent.task_id ? await this.db.getTaskById(intent.task_id, user.id) : null;
        if (!task && query) {
          task = await this.db.findTaskByTitle(user.id, query);
        }
        if (!task && !query) {
          const openTasks = await this.db.listTasks(user.id, 'all');
          if (openTasks.length === 1) {
            task = openTasks[0];
          }
        }

        if (task) {
          try {
            const newDueUtc = parseLocalToUtc(
              intent.new_due_at_local,
              intent.timezone || user.timezone
            );
            const offsetMinutes = intent.new_reminder_offset_minutes || 0;
            const newReminderUtc = new Date(newDueUtc.getTime() - offsetMinutes * 60 * 1000);

            if (newReminderUtc.getTime() <= referenceTime.getTime()) {
              await this.reply(chatId, user.id, {
                chat_id: chatId,
                text: `⚠️ The requested reschedule time (${formatLocalDateTime(newReminderUtc, user.timezone)}) is already in the past. Please specify a future time.`,
              });
              return;
            }

            await this.db.rescheduleTaskAndReminder(
              user.id,
              task.id,
              null,
              newDueUtc.toISOString(),
              newReminderUtc.toISOString()
            );

            await this.reply(chatId, user.id, {
              chat_id: chatId,
              text: `📅 Rescheduled *${task.title}* to ${formatLocalDateTime(newDueUtc, user.timezone)}. Next reminder: ${formatLocalDateTime(newReminderUtc, user.timezone)}.`,
              parse_mode: 'Markdown',
            });
          } catch {
            await this.reply(chatId, user.id, {
              chat_id: chatId,
              text: `Could not parse the new deadline. Please clarify the new date and time.`,
            });
          }
        } else {
          await this.reply(chatId, user.id, {
            chat_id: chatId,
            text: `Could not find an open task matching "${query}" to reschedule.`,
          });
        }
        break;
      }

      case 'list_tasks': {
        const filter = intent.filter === 'today' ? 'today' : 'all';
        const tasks = await this.db.listTasks(user.id, filter, user.timezone);
        if (tasks.length === 0) {
          await this.reply(chatId, user.id, {
            chat_id: chatId,
            text: `You have no tasks in this list.`,
          });
        } else {
          let msg = `📋 *Tasks:*\n\n`;
          tasks.forEach((t, i) => {
            msg += `${i + 1}. *${t.title}*`;
            if (t.due_at) {
              msg += ` — ${formatLocalDateTime(t.due_at, user.timezone)}`;
            }
            msg += `\n`;
          });

          const taskButtons = tasks.slice(0, 5).map((t) => [
            { text: `✅ Done: ${t.title.slice(0, 24)}`, callback_data: `task_done:${t.id}` },
          ]);

          await this.reply(chatId, user.id, {
            chat_id: chatId,
            text: msg,
            parse_mode: 'Markdown',
            reply_markup: taskButtons.length > 0 ? { inline_keyboard: taskButtons } : undefined,
          });
        }
        break;
      }

      case 'save_memory': {
        await this.memoryEngine.remember(user.id, intent.content, intent.category, intent.key);
        await this.reply(chatId, user.id, {
          chat_id: chatId,
          text: `🧠 *Saved to Memory*\n\n"${intent.content}"\n_Category: ${intent.category}_`,
          parse_mode: 'Markdown',
        });
        break;
      }

      case 'search_memory': {
        const results = await this.memoryEngine.recall(user.id, intent.query, intent.category);
        if (results.length === 0) {
          await this.reply(chatId, user.id, {
            chat_id: chatId,
            text: `I couldn't find any saved memories matching "${intent.query}".`,
          });
        } else {
          let msg = `🧠 *Recalled Memories:*\n\n`;
          results.forEach(m => {
            msg += `• \`[${m.category}]\` ${m.key ? `*${m.key}*: ` : ''}${m.content}\n`;
          });
          await this.reply(chatId, user.id, { chat_id: chatId, text: msg, parse_mode: 'Markdown' });
        }
        break;
      }

      case 'delete_memory': {
        const { deletedCount } = await this.memoryEngine.forget(user.id, intent.query);
        await this.reply(chatId, user.id, {
          chat_id: chatId,
          text: deletedCount > 0
            ? `🗑️ Removed ${deletedCount} memory item(s) matching "${intent.query}".`
            : `No memories found matching "${intent.query}".`,
        });
        break;
      }

      case 'switch_provider_model': {
        const updates: Partial<{ defaultProvider: any; defaultModel: any; routingMode: any }> = {};
        if (intent.provider) updates.defaultProvider = intent.provider;
        if (intent.model) updates.defaultModel = intent.model;
        if (intent.mode) updates.routingMode = intent.mode;
        
        await this.db.saveUserModelPreferences(user.id, updates);
        const reply = intent.reply || `AI settings updated: Provider=${updates.defaultProvider || 'current'}, Model=${updates.defaultModel || 'current'}, Mode=${updates.routingMode || 'current'}.`;
        await this.reply(chatId, user.id, {
          chat_id: chatId,
          text: `🤖 ${reply}`,
        });
        break;
      }

      case 'ask_clarification':
        await this.reply(chatId, user.id, {
          chat_id: chatId,
          text: `❓ ${intent.question}`,
        });
        break;

      case 'track_expense': {
        await this.db.recordEvent(user.id, 'expense', {
          amount: intent.amount,
          currency: intent.currency,
          category: intent.category,
          description: intent.description,
        });
        await this.reply(chatId, user.id, {
          chat_id: chatId,
          text: `💸 *Expense Logged!*\n\n• *Amount:* ${intent.currency} ${intent.amount}\n• *Category:* ${intent.category}\n• *Description:* ${intent.description}`,
          parse_mode: 'Markdown',
        });
        break;
      }

      case 'query_expenses': {
        const period = intent.period || 'week';
        let sinceIso: string | undefined;
        const now = this.clock.now();

        if (period === 'today') {
          const startOfToday = new Date(now);
          startOfToday.setUTCHours(0, 0, 0, 0);
          sinceIso = startOfToday.toISOString();
        } else if (period === 'week') {
          sinceIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (period === 'month') {
          sinceIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        }

        const expenses = await this.db.getExpenses(user.id, sinceIso);
        if (expenses.length === 0) {
          await this.reply(chatId, user.id, {
            chat_id: chatId,
            text: `You have no logged expenses for this ${period}.`,
          });
          break;
        }

        const totalsByCategory = new Map<string, number>();
        let grandTotal = 0;
        let currency = expenses[0].currency || 'INR';

        for (const exp of expenses) {
          const cat = exp.category || 'general';
          totalsByCategory.set(cat, (totalsByCategory.get(cat) || 0) + exp.amount);
          grandTotal += exp.amount;
        }

        let msg = `📊 *Expenses for this ${period}:*\n\n`;
        for (const [cat, sum] of totalsByCategory.entries()) {
          msg += `• *${cat.charAt(0).toUpperCase() + cat.slice(1)}:* ${currency} ${sum.toFixed(2)}\n`;
        }
        msg += `\n*Total:* ${currency} ${grandTotal.toFixed(2)}`;

        await this.reply(chatId, user.id, {
          chat_id: chatId,
          text: msg,
          parse_mode: 'Markdown',
        });
        break;
      }

      case 'chat':
        await this.reply(chatId, user.id, {
          chat_id: chatId,
          text: intent.reply,
        });
        break;

      default:
        await this.reply(chatId, user.id, {
          chat_id: chatId,
          text: `I'm not sure how to handle that request. Type /help to see what I can do.`,
        });
        break;
    }
  }

  private async handleApiKeyReply(
    message: TelegramMessage,
    user: AppUser
  ): Promise<boolean> {
    const replyText = message.reply_to_message?.text || '';
    const match = replyText.match(/(?:Connect AI Provider|Secure Credential Setup for)\s*:?\s*([A-Za-z0-9_-]+)/i);
    if (!match) return false;

    const providerStr = match[1].toLowerCase();
    const validProviders: ProviderId[] = ['gemini', 'openai', 'anthropic', 'xai', 'openrouter'];
    if (!validProviders.includes(providerStr as ProviderId)) return false;

    const provider = providerStr as ProviderId;
    const directApiKey = message.text?.trim() || '';
    const chatId = message.chat.id;

    // 1. Immediately delete the user's message containing raw key
    if (this.notification.deleteMessage && message.message_id) {
      await this.notification.deleteMessage(chatId, message.message_id).catch(() => {});
    }

    // 2. Also delete the prompt message to leave chat history clean
    if (this.notification.deleteMessage && message.reply_to_message?.message_id) {
      await this.notification.deleteMessage(chatId, message.reply_to_message.message_id).catch(() => {});
    }

    // 3. Validate credentials if router adapter available
    const router = this.aiProvider instanceof SmartModelRouter ? this.aiProvider : undefined;
    const adapter = router?.getAdapter(provider);
    if (adapter) {
      const check = await adapter.validateCredentials({ apiKey: directApiKey });
      if (!check.valid) {
        await this.notification.sendText({
          chat_id: chatId,
          text: `❌ Could not connect to ${provider.toUpperCase()}: ${check.error || 'Invalid credentials'}.\n(Your message containing the key was deleted for safety).`,
        });
        return true;
      }
    }

    // 4. Encrypt and save
    const encrypted = this.encryption.encrypt(directApiKey);
    const masked = EncryptionService.maskKey(directApiKey);
    await this.db.saveUserCredential(user.id, provider, encrypted, masked);

    // 5. Send confirmation with spoiler blur
    await this.notification.sendText({
      chat_id: chatId,
      text: `🔒 Connected *${provider.toUpperCase()}* (Key: ||\`${masked}\`||).\n\n🛡️ *Security:* Your original message containing the raw key was *automatically deleted* from the chat.`,
      parse_mode: 'Markdown',
    });

    return true;
  }
}
