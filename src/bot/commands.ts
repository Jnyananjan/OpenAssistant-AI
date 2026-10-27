// src/bot/commands.ts
import { DatabaseRepository } from '../db/repository.js';
import {
  NotificationProvider,
  TelegramMessage,
  AppUser,
} from '../shared/types.js';
import {
  createStartMessage,
  createHelpMessage,
  createAiSettingsMessage,
  createProvidersMenuMessage,
  createConnectLinkMessage,
  createMemoryListMessage,
} from './messages.js';
import { formatLocalDateTime } from '../shared/time.js';
import { randomBytes } from 'node:crypto';
import { ProviderId } from '../ai/provider.js';

import { EncryptionService } from '../security/encryption.js';
import { SmartModelRouter } from '../ai/router.js';

export interface CommandHandlerConfig {
  db: DatabaseRepository;
  notification: NotificationProvider;
  encryption?: EncryptionService;
  router?: SmartModelRouter;
}

export class CommandHandler {
  private readonly db: DatabaseRepository;
  private readonly notification: NotificationProvider;
  private readonly encryption: EncryptionService;
  private readonly router?: SmartModelRouter;

  constructor(config: CommandHandlerConfig) {
    this.db = config.db;
    this.notification = config.notification;
    this.encryption = config.encryption || new EncryptionService();
    this.router = config.router;
  }

  async handleCommand(message: TelegramMessage, user: AppUser): Promise<void> {
    const text = message.text?.trim() || '';
    const chatId = message.chat.id;
    const parts = text.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ').trim();

    switch (command) {
      case '/start':
        await this.notification.sendText(
          createStartMessage(chatId, user.display_name || undefined)
        );
        break;

      case '/help':
        await this.notification.sendText(createHelpMessage(chatId));
        break;

      case '/tasks':
        await this.handleListTasks(chatId, user, 'all');
        break;

      case '/today':
        await this.handleListTasks(chatId, user, 'today');
        break;

      case '/add':
        if (!args) {
          await this.notification.sendText({
            chat_id: chatId,
            text: `📝 *Add a Task*\n\nPlease specify the task title and optional deadline, for example:\n• "/add Finish report by tomorrow 5 PM"\n• Or just type: "Remind me to call John at 4 PM"`,
            parse_mode: 'Markdown',
          });
        } else {
          const task = await this.db.createTask(user.id, args, null, 'normal');
          await this.notification.sendText({
            chat_id: chatId,
            text: `✅ Task added: *${task.title}* (No reminder set. You can say: "Remind me about ${task.title} tomorrow at 9 AM")`,
            parse_mode: 'Markdown',
          });
        }
        break;

      case '/done':
        if (!args) {
          await this.notification.sendText({
            chat_id: chatId,
            text: `Please specify the task to mark done, e.g.:\n• "/done Python assignment"`,
            parse_mode: 'Markdown',
          });
        } else {
          const task = await this.db.findTaskByTitle(user.id, args);
          if (task) {
            await this.db.completeTask(user.id, task.id);
            await this.notification.sendText({
              chat_id: chatId,
              text: `🎉 Marked *${task.title}* as completed! All future reminders for this task are stopped.`,
              parse_mode: 'Markdown',
            });
          } else {
            await this.notification.sendText({
              chat_id: chatId,
              text: `Could not find an open task matching "${args}". Check /tasks for your list of open tasks.`,
            });
          }
        }
        break;

      case '/snooze': {
        const minutes = parseInt(args || '10', 10);
        // Find most recent awaiting_ack or scheduled reminder
        const tasks = await this.db.listTasks(user.id, 'all');
        if (tasks.length === 0) {
          await this.notification.sendText({
            chat_id: chatId,
            text: `No open tasks or active reminders to snooze.`,
          });
          break;
        }
        await this.notification.sendText({
          chat_id: chatId,
          text: `To snooze a reminder, use the 💤 *Snooze* button directly on the reminder message, or specify the task title.`,
          parse_mode: 'Markdown',
        });
        break;
      }

      case '/settings':
        if (args) {
          try {
            // Validate timezone by passing to Intl
            new Intl.DateTimeFormat('en-US', { timeZone: args }).format(new Date());
            const updated = await this.db.updateUserTimezone(user.id, args);
            await this.notification.sendText({
              chat_id: chatId,
              text: `⚙️ Timezone updated to *${updated.timezone}*.`,
              parse_mode: 'Markdown',
            });
          } catch {
            await this.notification.sendText({
              chat_id: chatId,
              text: `❌ Invalid IANA timezone "${args}". Examples: Asia/Kolkata, America/New_York, Europe/London, UTC.`,
            });
          }
        } else {
          await this.notification.sendText({
            chat_id: chatId,
            text: `⚙️ *Your OpenAssistant AI Settings*\n\n• *Timezone:* \`${user.timezone}\`\n• *Max Follow-ups:* 8\n\nTo update your timezone, type:\n\`/settings Asia/Kolkata\` (or your local timezone)`,
            parse_mode: 'Markdown',
          });
        }
        break;

      case '/ai': {
        const prefs = (await this.db.getUserModelPreferences(user.id)) || {
          defaultProvider: 'gemini',
          defaultModel: 'gemini-3.8-flash',
          routingMode: 'best_available',
          taskRules: {},
        };
        const creds = await this.db.getUserCredentials(user.id);
        await this.notification.sendText(
          createAiSettingsMessage(
            chatId,
            prefs,
            creds.map(c => ({ provider: c.provider, maskedKey: c.maskedKey }))
          )
        );
        break;
      }

      case '/providers': {
        const creds = await this.db.getUserCredentials(user.id);
        await this.notification.sendText(
          createProvidersMenuMessage(
            chatId,
            creds.map(c => ({ provider: c.provider, maskedKey: c.maskedKey }))
          )
        );
        break;
      }

      case '/models': {
        const prefs = (await this.db.getUserModelPreferences(user.id)) || {
          defaultProvider: 'gemini',
          defaultModel: 'gemini-3.8-flash',
          routingMode: 'best_available',
        };
        await this.notification.sendText({
          chat_id: chatId,
          text: `🤖 *Model Selection*\n\nCurrent model: \`${prefs.defaultModel}\` (${prefs.defaultProvider})\nRouting mode: \`${prefs.routingMode}\`\n\nTo change your model or routing mode, use /ai or select below.`,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '⚡ Quick Answer', callback_data: 'mode:quick_answer' },
                { text: '🧠 Deep Reasoning', callback_data: 'mode:deep_reasoning' },
              ],
              [
                { text: '💻 Coding Mode', callback_data: 'mode:coding' },
                { text: '💰 Budget Mode', callback_data: 'mode:budget' },
              ],
              [
                { text: '✨ Best Available', callback_data: 'mode:best_available' },
                { text: '⚙️ Manual Selection', callback_data: 'mode:manual' },
              ],
              [{ text: '🔙 Back to AI', callback_data: 'ai:home' }],
            ],
          },
        });
        break;
      }

      case '/connect': {
        const connectParts = args.split(/\s+/).filter(Boolean);
        const provider = (connectParts[0]?.toLowerCase() || 'openai') as ProviderId;
        const validProviders: ProviderId[] = ['gemini', 'openai', 'anthropic', 'xai', 'openrouter'];
        if (!validProviders.includes(provider)) {
          await this.notification.sendText({
            chat_id: chatId,
            text: `Please specify a valid provider: \`/connect <gemini|openai|anthropic|xai|openrouter>\``,
            parse_mode: 'Markdown',
          });
          break;
        }

        // Direct key fallback: /connect <provider> <apiKey> [baseUrl]
        if (connectParts.length >= 2) {
          const directApiKey = connectParts[1].trim();
          const optionalBaseUrl = connectParts[2]?.trim();

          // Auto-delete the user's message containing raw key immediately to avoid chat history exposure
          let deletedOriginal = false;
          if (this.notification.deleteMessage && message.message_id) {
            try {
              deletedOriginal = await this.notification.deleteMessage(chatId, message.message_id);
            } catch {
              deletedOriginal = false;
            }
          }

          const adapter = this.router?.getAdapter(provider);
          if (adapter) {
            const check = await adapter.validateCredentials({ apiKey: directApiKey, baseUrl: optionalBaseUrl });
            if (!check.valid) {
              await this.notification.sendText({
                chat_id: chatId,
                text: `❌ Could not connect to ${provider.toUpperCase()}: ${check.error || 'Invalid credentials'}.`,
              });
              break;
            }
          }

          const encrypted = this.encryption.encrypt(directApiKey);
          const masked = EncryptionService.maskKey(directApiKey);
          await this.db.saveUserCredential(user.id, provider, encrypted, masked, optionalBaseUrl);

          const securityNote = deletedOriginal
            ? `🛡️ *Security:* Your original message containing the raw key was *automatically deleted* from the chat.`
            : `⚠️ *Security Tip:* Please delete your message containing the raw API key to prevent it from persisting in chat history.`;

          await this.notification.sendText({
            chat_id: chatId,
            text: `🔒 Connected *${provider.toUpperCase()}* (Key: ||\`${masked}\`||).\n\n${securityNote}`,
            parse_mode: 'Markdown',
          });
          break;
        }

        const token = randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await this.db.createSetupSession(user.id, provider, token, expiresAt);

        const baseUrl = process.env.PUBLIC_DASHBOARD_URL || 'http://localhost:3000';
        const setupUrl = `${baseUrl}/connect-provider?token=${token}`;

        await this.notification.sendText(createConnectLinkMessage(chatId, provider, setupUrl));
        break;
      }

      case '/disconnect': {
        const provider = args.toLowerCase() as ProviderId;
        if (!provider) {
          const creds = await this.db.getUserCredentials(user.id);
          if (creds.length === 0) {
            await this.notification.sendText({
              chat_id: chatId,
              text: `You have no custom provider credentials connected.`,
            });
            break;
          }
          const buttons = creds.map(c => [
            { text: `Disconnect ${c.provider.toUpperCase()}`, callback_data: `provider:disconnect:${c.provider}` },
          ]);
          buttons.push([{ text: 'Cancel', callback_data: 'ai:home' }]);
          await this.notification.sendText({
            chat_id: chatId,
            text: `Select a provider to disconnect:`,
            reply_markup: { inline_keyboard: buttons },
          });
          break;
        }

        const success = await this.db.deleteUserCredential(user.id, provider);
        await this.notification.sendText({
          chat_id: chatId,
          text: success
            ? `🔌 Disconnected ${provider.toUpperCase()}. Removed stored credentials.`
            : `Could not find an active key for ${provider}.`,
        });
        break;
      }

      case '/usage': {
        const creds = await this.db.getUserCredentials(user.id);
        const prefs = await this.db.getUserModelPreferences(user.id);
        const text = `📊 *AI Usage & Quota Overview*

*Active Routing Mode:* \`${prefs?.routingMode || 'best_available'}\`
*Active Provider:* \`${prefs?.defaultProvider || 'gemini'}\`
*Connected Keys:* ${creds.length} active credential(s)

_Note: Usage limits and token consumption are tracked directly by your configured AI provider account._`;

        await this.notification.sendText({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        });
        break;
      }

      case '/memory': {
        const memories = await this.db.getMemoriesForUser(user.id);
        await this.notification.sendText(createMemoryListMessage(chatId, memories));
        break;
      }

      case '/cancel':

        if (args) {
          const task = await this.db.findTaskByTitle(user.id, args);
          if (task) {
            await this.db.cancelTask(user.id, task.id);
            await this.notification.sendText({
              chat_id: chatId,
              text: `🚫 Cancelled task: *${task.title}*.`,
              parse_mode: 'Markdown',
            });
          } else {
            await this.notification.sendText({
              chat_id: chatId,
              text: `Could not find an open task matching "${args}".`,
            });
          }
        } else {
          await this.notification.sendText({
            chat_id: chatId,
            text: `To cancel a task, specify its title:\n\`/cancel <task title>\``,
            parse_mode: 'Markdown',
          });
        }
        break;

      default:
        await this.notification.sendText({
          chat_id: chatId,
          text: `Unknown command "${command}". Type /help to see all available commands.`,
        });
        break;
    }
  }

  private async handleListTasks(
    chatId: number,
    user: AppUser,
    filter: 'all' | 'today'
  ): Promise<void> {
    const tasks = await this.db.listTasks(user.id, filter, user.timezone);

    if (tasks.length === 0) {
      const msg =
        filter === 'today'
          ? `📅 You have no tasks due today! 🎉 Enjoy your day or add one with /add.`
          : `📋 You have no open tasks. Create one anytime by typing what you need to do!`;
      await this.notification.sendText({ chat_id: chatId, text: msg });
      return;
    }

    const titleHeader = filter === 'today' ? `📅 *Today's Tasks:*` : `📋 *Your Open Tasks:*`;
    let response = `${titleHeader}\n\n`;

    tasks.forEach((task, idx) => {
      response += `${idx + 1}. *${task.title}*`;
      if (task.due_at) {
        response += ` — Due: ${formatLocalDateTime(task.due_at, user.timezone)}`;
      }
      response += `\n`;
    });

    response += `\nTo mark a task complete, type \`/done <task name>\`.`;

    await this.notification.sendText({
      chat_id: chatId,
      text: response,
      parse_mode: 'Markdown',
    });
  }
}
