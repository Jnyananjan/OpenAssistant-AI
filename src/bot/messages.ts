// src/bot/messages.ts
import {
  TelegramInlineKeyboardMarkup,
  SendTextInput,
} from '../shared/types.js';
import { formatLocalDateTime } from '../shared/time.js';

export function createStartMessage(chatId: number, displayName?: string): SendTextInput {
  const nameGreeting = displayName ? ` ${displayName}` : '';
  const text = `👋 *Hello${nameGreeting}! I am OpenAssistant AI.*

I am your personal productivity assistant on Telegram. I help you capture tasks and make sure you never forget a deadline through smart, persistent follow-ups.

✨ *What you can say to me:*
• "I need to finish my Python assignment tomorrow at 6 PM. Remind me 5 minutes before."
• "Submit the expense report by Friday 3 PM"
• "Call Mom at 8 PM tonight"

📌 *Available Commands:*
• /today — View today's tasks & upcoming reminders
• /tasks — List all open tasks
• /add — Create a new task step-by-step
• /done — Complete a task
• /snooze — Snooze active reminder
• /briefing — Morning executive briefing on demand
• /expenses — View spending breakdown & summary
• /memory — Facts & preferences remembered
• /ai — Multi-provider AI model settings
• /models — Change AI routing mode (Quick, Deep, Coding, Budget)
• /providers — Connect API keys (Gemini, OpenAI, Claude, Groq)
• /settings — Timezone & preferences
• /help — Full commands & guide

Just send me a message to get started!`;

  return {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
  };
}

export function createHelpMessage(chatId: number): SendTextInput {
  const text = `ℹ️ *OpenAssistant AI — Help & Commands*

*Available Commands:*
• /today — View today's tasks and reminders
• /tasks — List your open tasks
• /add — Create a new task
• /done — Mark a task complete
• /snooze — Snooze the latest active reminder
• /briefing — Morning executive briefing on demand
• /expenses — View spending breakdown & summary
• /memory — Facts & preferences remembered
• /ai — Multi-provider AI model settings
• /models — Change AI routing mode
• /providers — Connect personal API keys
• /settings — Timezone & preferences
• /cancel — Cancel an active flow or task

🛡️ *Privacy & Security:*
• Your tasks are stored securely in dedicated tables.
• We never execute arbitrary code or sell your data.
• Timestamps are stored in UTC and displayed in your local timezone.`;

  return {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
  };
}

export function createUnauthorizedMessage(chatId: number): SendTextInput {
  return {
    chat_id: chatId,
    text: `⛔ *Access Restricted*\n\nThis OpenAssistant AI instance is currently in private preview. Your Telegram account is not on the authorized user allowlist.`,
    parse_mode: 'Markdown',
  };
}

export function createTaskCreatedMessage(
  chatId: number,
  taskTitle: string,
  dueAt: Date | string | null,
  reminderAt: Date | string | null,
  offsetMinutes: number,
  timeZone: string,
  reminderId?: string
): SendTextInput {
  let details = `✅ *Task & Reminder Saved*\n\n*Task:* ${escapeMarkdown(taskTitle)}\n`;

  if (dueAt) {
    details += `*Deadline:* ${formatLocalDateTime(dueAt, timeZone)}\n`;
  }
  if (reminderAt) {
    details += `*Reminder:* ${formatLocalDateTime(reminderAt, timeZone)}`;
    if (offsetMinutes > 0) {
      details += ` (${offsetMinutes} min before)\n`;
    } else {
      details += ` (at deadline)\n`;
    }
  }
  details += `*Timezone:* ${timeZone}`;

  const message: SendTextInput = {
    chat_id: chatId,
    text: details,
    parse_mode: 'Markdown',
  };

  if (reminderId) {
    message.reply_markup = {
      inline_keyboard: [
        [
          { text: '💤 Snooze 1h', callback_data: `snooze:${reminderId}:60` },
          { text: '✅ Mark Done', callback_data: `done:${reminderId}` },
        ],
      ],
    };
  }

  return message;
}

export function createReminderNotificationMessage(
  chatId: number,
  reminderId: string,
  taskTitle: string,
  dueAt: Date | string | null,
  timeZone: string,
  followUpCount: number
): SendTextInput {
  const isFollowUp = followUpCount > 0;
  const header = isFollowUp
    ? `⏰ *OpenAssistant AI Reminder (Follow-up #${followUpCount})*`
    : `⏰ *OpenAssistant AI Reminder*`;

  let body = `${header}\n\n*Task:* ${escapeMarkdown(taskTitle)}\n`;
  if (dueAt) {
    body += `*Deadline:* ${formatLocalDateTime(dueAt, timeZone)}\n`;
  }
  body += `\nHave you completed this task?`;

  const replyMarkup: TelegramInlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: '✅ Done', callback_data: `done:${reminderId}` },
        { text: '💤 Snooze 10m', callback_data: `snooze:${reminderId}:10` },
      ],
      [
        { text: '📅 Reschedule', callback_data: `resched:${reminderId}` },
      ],
    ],
  };

  return {
    chat_id: chatId,
    text: body,
    parse_mode: 'Markdown',
    reply_markup: replyMarkup,
  };
}

export function createPausedReminderMessage(
  chatId: number,
  taskTitle: string,
  followUpCount: number
): SendTextInput {
  return {
    chat_id: chatId,
    text: `⏸️ *Reminder Escalation Paused*\n\n*Task:* ${escapeMarkdown(taskTitle)}\n\nI have followed up ${followUpCount} times without acknowledgement. To protect your peace, further reminders for this task are paused.\n\nYou can still mark it done with /done or reschedule it anytime.`,
    parse_mode: 'Markdown',
  };
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*`[]/g, '\\$&');
}

export function createAiSettingsMessage(
  chatId: number,
  preferences: { defaultProvider: string; defaultModel: string; routingMode: string },
  connectedProviders: Array<{ provider: string; maskedKey: string }>
): SendTextInput {
  const providerList = connectedProviders.length > 0
    ? connectedProviders.map(p => `• *${p.provider.toUpperCase()}*: \`${p.maskedKey}\``).join('\n')
    : '_No custom provider keys connected (using default Gemini)_';

  const text = `🤖 *OpenAssistant AI — Multi-Provider Settings*

*Active Routing Mode:* \`${preferences.routingMode}\`
*Default Provider:* \`${preferences.defaultProvider}\`
*Default Model:* \`${preferences.defaultModel}\`

🔌 *Connected Providers:*
${providerList}

Select an action below to manage your AI experience:`;

  const replyMarkup: TelegramInlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: '🔀 Routing Mode', callback_data: 'ai:mode' },
        { text: '🤖 Select Model', callback_data: 'ai:models' },
      ],
      [
        { text: '🔌 Manage Providers', callback_data: 'ai:providers' },
        { text: '🧠 Memory', callback_data: 'ai:memory' },
      ],
    ],
  };

  return {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: replyMarkup,
  };
}

export function createProvidersMenuMessage(
  chatId: number,
  connected: Array<{ provider: string; maskedKey: string }>
): SendTextInput {
  const connectedSet = new Set(connected.map(c => c.provider));
  const text = `🔌 *AI Provider Management*

Manage your personal API keys securely. Keys are encrypted with AES-256-GCM.
Never share or paste raw keys in public channels.`;

  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

  const allProviders = [
    { id: 'gemini', name: 'Google Gemini' },
    { id: 'openai', name: 'OpenAI' },
    { id: 'anthropic', name: 'Anthropic Claude' },
    { id: 'xai', name: 'xAI (Grok)' },
    { id: 'openrouter', name: 'OpenRouter' },
  ];

  for (const p of allProviders) {
    const isConn = connectedSet.has(p.id);
    buttons.push([
      {
        text: isConn ? `🟢 ${p.name} (Connected)` : `⚪ Connect ${p.name}`,
        callback_data: isConn ? `provider:manage:${p.id}` : `provider:connect:${p.id}`,
      },
    ]);
  }

  buttons.push([{ text: '🔙 Back to AI Settings', callback_data: 'ai:home' }]);

  return {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons },
  };
}

export function createConnectLinkMessage(
  chatId: number,
  provider: string,
  setupUrl: string
): SendTextInput {
  const text = `🔑 *Connect AI Provider: ${provider.toUpperCase()}*
(Secure Credential Setup for ${provider.toUpperCase()})

Please paste your API key directly in the reply box below.

🛡️ *Privacy:* Your message containing the key will be *automatically deleted* immediately, and stored encrypted with AES-256-GCM.

👉 Prefer browser? [Open Secure Web Form](${setupUrl})`;

  return {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: {
      force_reply: true,
      input_field_placeholder: `Paste ${provider.toUpperCase()} API key here...`,
    },
  };
}

export function createMemoryListMessage(
  chatId: number,
  memories: Array<{ id: string; category: string; content: string; key?: string }>
): SendTextInput {
  let text = `🧠 *OpenAssistant AI — Long-term Personal Memory*\n\n`;

  if (memories.length === 0) {
    text += `_No memories saved yet._\n\nYou can say things like:\n• "Remember that I prefer concise answers"\n• "Keep in mind my project is called OpenAssistant AI"`;
  } else {
    text += `Here are facts and preferences I remember across conversations:\n\n`;
    for (const m of memories.slice(0, 10)) {
      const prefix = m.key ? `*${escapeMarkdown(m.key)}*: ` : '';
      text += `• \`[${m.category}]\` ${prefix}${escapeMarkdown(m.content)}\n`;
    }
    if (memories.length > 10) {
      text += `\n_...and ${memories.length - 10} more memories._`;
    }
  }

  return {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🗑️ Forget All', callback_data: 'memory:clear_confirm' }],
        [{ text: '🔙 Back to AI Settings', callback_data: 'ai:home' }],
      ],
    },
  };
}

export function createSettingsMessage(
  chatId: number,
  user: { timezone: string },
  prefs: { defaultProvider: string; defaultModel: string; routingMode: string }
): SendTextInput {
  const nowStr = formatLocalDateTime(new Date().toISOString(), user.timezone);
  const text = `⚙️ *OpenAssistant AI — System Settings*

👤 *Profile & Local Time:*
• *Timezone:* \`${user.timezone}\`
• *Current Local Time:* ${nowStr}

⏰ *Automated Briefings:*
• ☀️ *Morning Briefing:* 8:00 AM (Priority tasks & schedule summary)
• 🌙 *Nightly Rollover:* 9:30 PM (Rolls overdue tasks to tomorrow)
• 🔁 *Max Follow-ups:* 8 attempts

🤖 *AI Engine & Routing:*
• *Routing Mode:* \`${prefs.routingMode}\`
• *Default Model:* \`${prefs.defaultModel}\` (\`${prefs.defaultProvider}\`)

To update your timezone directly, tap below or type:
\`/settings Asia/Kolkata\``;

  return {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🌐 Change Timezone', callback_data: 'settings:timezone' },
          { text: '🤖 AI Settings', callback_data: 'ai:home' },
        ],
        [
          { text: '☀️ Trigger Briefing Now', callback_data: 'briefing:run' },
          { text: '📊 Expense Summary', callback_data: 'expenses:summary' },
        ],
      ],
    },
  };
}

export function createTimezoneSelectMessage(chatId: number, currentTimezone: string): SendTextInput {
  return {
    chat_id: chatId,
    text: `🌐 *Select Your Timezone*

Current timezone: \`${currentTimezone}\`

Tap a quick preset below or type \`/settings <Timezone>\` (e.g. \`/settings Asia/Dubai\`):`,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🇮🇳 India (IST)', callback_data: 'tz:Asia/Kolkata' },
          { text: '🇺🇸 US Eastern (EST)', callback_data: 'tz:America/New_York' },
        ],
        [
          { text: '🇺🇸 US Pacific (PST)', callback_data: 'tz:America/Los_Angeles' },
          { text: '🇬🇧 London (GMT)', callback_data: 'tz:Europe/London' },
        ],
        [
          { text: '🌐 UTC', callback_data: 'tz:UTC' },
          { text: '🇦🇪 Dubai (GST)', callback_data: 'tz:Asia/Dubai' },
        ],
        [{ text: '🔙 Back to Settings', callback_data: 'settings:home' }],
      ],
    },
  };
}

export function createRoutingModeSelectMessage(
  chatId: number,
  currentMode: string
): SendTextInput {
  const modes: Array<{ id: string; label: string; desc: string }> = [
    { id: 'best_available', label: '✨ Best Available', desc: 'Balances speed, quality & cost automatically' },
    { id: 'quick_answer', label: '⚡ Quick Answer', desc: 'Low-latency flash models' },
    { id: 'deep_reasoning', label: '🧠 Deep Reasoning', desc: 'Advanced reasoning models' },
    { id: 'coding', label: '💻 Coding Mode', desc: 'Technical & code execution' },
    { id: 'budget', label: '💰 Budget / Free', desc: 'Free-tier & low cost' },
    { id: 'manual', label: '⚙️ Manual Selection', desc: 'Strictly uses your selected default model' },
  ];

  const buttons = modes.map(m => [
    {
      text: m.id === currentMode ? `🟢 ${m.label} (Active)` : `⚪ ${m.label}`,
      callback_data: `mode:${m.id}`,
    },
  ]);

  buttons.push([{ text: '🔙 Back to AI Settings', callback_data: 'ai:home' }]);

  const currentDesc = modes.find(m => m.id === currentMode)?.desc || 'Custom strategy';

  return {
    chat_id: chatId,
    text: `🔀 *Choose Your AI Routing Mode*

*Current Active Strategy:* \`${currentMode}\`
_${currentDesc}_

Select an automated strategy below for answering questions and extracting tasks:`,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons },
  };
}

export function createModelSelectMessage(
  chatId: number,
  currentModel: string,
  currentProvider: string
): SendTextInput {
  const models = [
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Fast & Capable)', provider: 'gemini' },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite (Free & Quick)', provider: 'gemini' },
    { id: 'gemini-3.8-pro', name: 'Gemini 3.8 Pro (Deep Reasoning)', provider: 'gemini' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (OpenAI Fast)', provider: 'openai' },
    { id: 'gpt-4o', name: 'GPT-4o (OpenAI Flagship)', provider: 'openai' },
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet (Anthropic)', provider: 'anthropic' },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku (Fast)', provider: 'anthropic' },
  ];

  const buttons = models.map(m => [
    {
      text: m.id === currentModel ? `🟢 ${m.name} (Active)` : `⚪ ${m.name}`,
      callback_data: `set_model:${m.id}:${m.provider}`,
    },
  ]);

  buttons.push([{ text: '🔙 Back to AI Settings', callback_data: 'ai:home' }]);

  return {
    chat_id: chatId,
    text: `🤖 *Select Your Primary AI Model*

*Active Model:* \`${currentModel}\` (\`${currentProvider}\`)

Tap any model below to set it as your primary engine:`,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons },
  };
}

export function createProviderManageMessage(
  chatId: number,
  provider: string,
  maskedKey: string
): SendTextInput {
  return {
    chat_id: chatId,
    text: `🔌 *Manage Provider: ${provider.toUpperCase()}*

Status: 🟢 *Connected & Active*
Masked Key: \`${maskedKey}\`
Encryption: *AES-256-GCM*

What would you like to do?`,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Replace API Key', callback_data: `provider:connect:${provider}` }],
        [{ text: '❌ Disconnect & Remove Key', callback_data: `provider:disconnect:${provider}` }],
        [{ text: '🔙 Back to Providers', callback_data: 'ai:providers' }],
      ],
    },
  };
}
