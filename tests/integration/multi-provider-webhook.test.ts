// tests/integration/multi-provider-webhook.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookController } from '../../src/bot/webhook.js';
import { InMemoryDatabaseRepository } from '../../src/db/in-memory-repository.js';
import { SmartModelRouter } from '../../src/ai/router.js';
import { EncryptionService } from '../../src/security/encryption.js';
import { MemoryEngine } from '../../src/memory/memory-engine.js';
import {
  NotificationProvider,
  SendTextInput,
  SendTextResult,
  TelegramWebhookUpdate,
  TelegramInlineKeyboardMarkup,
} from '../../src/shared/types.js';
import { AIProvider } from '../../src/ai/provider.js';

class MockNotificationProvider implements NotificationProvider {
  public sentMessages: SendTextInput[] = [];
  public answeredCallbacks: Array<{ id: string; text?: string }> = [];
  public deletedMessages: Array<{ chat_id: number; message_id: number }> = [];

  async sendText(input: SendTextInput): Promise<SendTextResult> {
    this.sentMessages.push(input);
    return { ok: true, message_id: this.sentMessages.length };
  }

  async answerCallbackQuery(id: string, text?: string): Promise<boolean> {
    this.answeredCallbacks.push({ id, text });
    return true;
  }

  async deleteMessage(chat_id: number, message_id: number): Promise<boolean> {
    this.deletedMessages.push({ chat_id, message_id });
    return true;
  }
}

describe('Multi-Provider AI & Graph Memory Webhook Integration', () => {
  let db: InMemoryDatabaseRepository;
  let notification: MockNotificationProvider;
  let router: SmartModelRouter;
  let encryption: EncryptionService;
  let memoryEngine: MemoryEngine;
  let controller: WebhookController;

  const mockAiProvider: AIProvider = {
    interpretMessage: vi.fn(),
  };

  beforeEach(() => {
    db = new InMemoryDatabaseRepository();
    notification = new MockNotificationProvider();
    encryption = new EncryptionService('integration-test-secret-key-32b!');
    memoryEngine = new MemoryEngine({ backend: db });
    router = new SmartModelRouter({ defaultFallbackProvider: mockAiProvider });

    controller = new WebhookController({
      db,
      notification,
      aiProvider: router,
      encryption,
      memoryEngine,
      webhookSecret: 'test-secret',
    });
  });

  it('handles /ai command showing routing mode and connected providers', async () => {
    const update: TelegramWebhookUpdate = {
      update_id: 1001,
      message: {
        message_id: 1,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Alex' },
        date: Math.floor(Date.now() / 1000),
        text: '/ai',
      },
    };

    const res = await controller.handleRequest('test-secret', update);
    expect(res.statusCode).toBe(200);
    expect(notification.sentMessages).toHaveLength(1);
    expect(notification.sentMessages[0].text).toContain('Multi-Provider Settings');
    expect((notification.sentMessages[0].reply_markup as TelegramInlineKeyboardMarkup)?.inline_keyboard).toBeDefined();
  });

  it('handles /providers and lists provider options', async () => {
    const update: TelegramWebhookUpdate = {
      update_id: 1002,
      message: {
        message_id: 2,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Alex' },
        date: Math.floor(Date.now() / 1000),
        text: '/providers',
      },
    };

    const res = await controller.handleRequest('test-secret', update);
    expect(res.statusCode).toBe(200);
    expect(notification.sentMessages[0].text).toContain('AI Provider Management');
    expect((notification.sentMessages[0].reply_markup as TelegramInlineKeyboardMarkup)?.inline_keyboard.length).toBeGreaterThan(0);
  });

  it('generates a short-lived single-use setup session link via /connect', async () => {
    const update: TelegramWebhookUpdate = {
      update_id: 1003,
      message: {
        message_id: 3,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Alex' },
        date: Math.floor(Date.now() / 1000),
        text: '/connect openai',
      },
    };

    const res = await controller.handleRequest('test-secret', update);
    expect(res.statusCode).toBe(200);
    expect(notification.sentMessages[0].text).toContain('Secure Credential Setup for OPENAI');
    expect(notification.sentMessages[0].text).toContain('connect-provider?token=');
  });

  it('auto-deletes user message with raw key and blurs masked key with Telegram spoiler syntax', async () => {
    const openaiAdapter = router.getAdapter('openai');
    if (openaiAdapter) {
      vi.spyOn(openaiAdapter, 'validateCredentials').mockResolvedValueOnce({ valid: true });
    }

    const update: TelegramWebhookUpdate = {
      update_id: 10031,
      message: {
        message_id: 99,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Alex' },
        date: Math.floor(Date.now() / 1000),
        text: '/connect openai sk-proj-1234567890abcdef1234',
      },
    };

    const res = await controller.handleRequest('test-secret', update);
    expect(res.statusCode).toBe(200);

    // Verify incoming message was deleted
    expect(notification.deletedMessages).toContainEqual({ chat_id: 12345, message_id: 99 });

    // Verify sent confirmation contains blurred spoiler format
    const reply = notification.sentMessages[0].text;
    expect(reply).toContain('||`sk-...1234`||');
    expect(reply).toContain('automatically deleted');
  });

  it('handles fill-in-the-box ForceReply API key prompt and auto-deletes prompt and secret reply', async () => {
    const openaiAdapter = router.getAdapter('openai');
    if (openaiAdapter) {
      vi.spyOn(openaiAdapter, 'validateCredentials').mockResolvedValueOnce({ valid: true });
    }

    const update: TelegramWebhookUpdate = {
      update_id: 10032,
      message: {
        message_id: 101,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Alex' },
        date: Math.floor(Date.now() / 1000),
        text: 'sk-proj-9876543210zyxwvuts5678',
        reply_to_message: {
          message_id: 100,
          chat: { id: 12345, type: 'private' },
          date: Math.floor(Date.now() / 1000) - 10,
          text: '🔑 Connect AI Provider: OPENAI\nPlease paste your API key in the reply box below.',
        },
      },
    };

    const res = await controller.handleRequest('test-secret', update);
    expect(res.statusCode).toBe(200);

    // Verify both the user's secret key message AND the prompt message were deleted
    expect(notification.deletedMessages).toContainEqual({ chat_id: 12345, message_id: 101 });
    expect(notification.deletedMessages).toContainEqual({ chat_id: 12345, message_id: 100 });

    // Verify confirmation sent with blurred spoiler key
    const reply = notification.sentMessages[0].text;
    expect(reply).toContain('||`sk-...5678`||');
    expect(reply).toContain('automatically deleted');
  });

  it('handles save_memory intent from natural language message', async () => {
    vi.mocked(mockAiProvider.interpretMessage).mockResolvedValueOnce({
      intent: 'save_memory',
      category: 'preference',
      content: 'I prefer dark mode and concise summaries',
      key: 'pref_summary',
    });

    const update: TelegramWebhookUpdate = {
      update_id: 1004,
      message: {
        message_id: 4,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Alex' },
        date: Math.floor(Date.now() / 1000),
        text: 'Remember that I prefer dark mode and concise summaries',
      },
    };

    const res = await controller.handleRequest('test-secret', update);
    expect(res.statusCode).toBe(200);
    expect(notification.sentMessages[0].text).toContain('Saved to Memory');

    const user = await db.getUserByTelegramId(12345);
    const memories = await memoryEngine.recall(user!.id, 'concise');
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toContain('concise summaries');
  });

  it('handles search_memory and delete_memory intents', async () => {
    const user = await db.getOrCreateUser(12345, 12345, 'Alex');
    await memoryEngine.remember(user.id, 'My project is called OpenAssistant AI', 'project', 'project_name');

    // 1. Search Memory
    vi.mocked(mockAiProvider.interpretMessage).mockResolvedValueOnce({
      intent: 'search_memory',
      query: 'project',
      category: 'all',
    });

    const searchUpdate: TelegramWebhookUpdate = {
      update_id: 1005,
      message: {
        message_id: 5,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Alex' },
        date: Math.floor(Date.now() / 1000),
        text: 'What is my project name?',
      },
    };

    await controller.handleRequest('test-secret', searchUpdate);
    expect(notification.sentMessages[0].text).toContain('Recalled Memories');
    expect(notification.sentMessages[0].text).toContain('OpenAssistant AI');

    // 2. Delete Memory
    vi.mocked(mockAiProvider.interpretMessage).mockResolvedValueOnce({
      intent: 'delete_memory',
      query: 'OpenAssistant AI',
    });

    const deleteUpdate: TelegramWebhookUpdate = {
      update_id: 1006,
      message: {
        message_id: 6,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Alex' },
        date: Math.floor(Date.now() / 1000),
        text: 'Forget my project name',
      },
    };

    await controller.handleRequest('test-secret', deleteUpdate);
    expect(notification.sentMessages[1].text).toContain('Removed 1 memory item');
  });

  it('handles natural language switch_provider_model intent', async () => {
    vi.mocked(mockAiProvider.interpretMessage).mockResolvedValueOnce({
      intent: 'switch_provider_model',
      provider: 'openai',
      model: 'gpt-4o',
      mode: 'coding',
      reply: 'Switched to OpenAI GPT-4o for coding tasks.',
    });

    const update: TelegramWebhookUpdate = {
      update_id: 1007,
      message: {
        message_id: 7,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Alex' },
        date: Math.floor(Date.now() / 1000),
        text: 'Use OpenAI GPT-4o for coding',
      },
    };

    await controller.handleRequest('test-secret', update);
    expect(notification.sentMessages[0].text).toContain('Switched to OpenAI GPT-4o for coding tasks.');

    const user = await db.getUserByTelegramId(12345);
    const prefs = await db.getUserModelPreferences(user!.id);
    expect(prefs?.defaultProvider).toBe('openai');
    expect(prefs?.defaultModel).toBe('gpt-4o');
    expect(prefs?.routingMode).toBe('coding');
  });

  it('preserves existing task creation with reminder scheduling', async () => {
    vi.mocked(mockAiProvider.interpretMessage).mockResolvedValueOnce({
      intent: 'create_task_with_reminder',
      title: 'Submit quarterly budget',
      due_at_local: '2026-10-30T15:00:00',
      reminder_offset_minutes: 15,
      timezone: 'Asia/Kolkata',
      priority: 'normal',
      needs_clarification: false,
    });

    const update: TelegramWebhookUpdate = {
      update_id: 1008,
      message: {
        message_id: 8,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Alex' },
        date: Math.floor(Date.now() / 1000),
        text: 'Submit quarterly budget on Oct 30 at 3 PM, remind me 15m before',
      },
    };

    const res = await controller.handleRequest('test-secret', update);
    expect(res.statusCode).toBe(200);
    expect(notification.sentMessages[0].text).toContain('Task & Reminder Saved');
    expect(notification.sentMessages[0].text).toContain('Submit quarterly budget');
  });
});
