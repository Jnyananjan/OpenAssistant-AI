// tests/unit/callbacks.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallbackHandler } from '../../src/bot/callbacks.js';
import { InMemoryDatabaseRepository } from '../../src/db/in-memory-repository.js';
import {
  NotificationProvider,
  SendTextInput,
  SendTextResult,
  EditMessageInput,
  AppUser,
} from '../../src/shared/types.js';

describe('CallbackHandler AI & Settings Callbacks', () => {
  let db: InMemoryDatabaseRepository;
  let sentMessages: SendTextInput[];
  let editedMessages: EditMessageInput[];
  let answeredQueries: Array<{ id: string; text?: string }>;
  let notification: NotificationProvider;
  let handler: CallbackHandler;
  let user: AppUser;

  beforeEach(async () => {
    db = new InMemoryDatabaseRepository();
    sentMessages = [];
    editedMessages = [];
    answeredQueries = [];

    notification = {
      sendText: vi.fn().mockImplementation(async (msg: SendTextInput): Promise<SendTextResult> => {
        sentMessages.push(msg);
        return { ok: true, message_id: 100 };
      }),
      editMessageText: vi.fn().mockImplementation(async (msg: EditMessageInput): Promise<boolean> => {
        editedMessages.push(msg);
        return true;
      }),
      answerCallbackQuery: vi.fn().mockImplementation(async (id: string, text?: string): Promise<boolean> => {
        answeredQueries.push({ id, text });
        return true;
      }),
    };

    handler = new CallbackHandler({ db, notification });
    user = await db.getOrCreateUser(12345, 12345, 'Alice');
  });

  it('renders routing mode selection when ai:mode is clicked', async () => {
    await handler.handleCallback(
      {
        id: 'cb1',
        from: { id: 12345, is_bot: false, first_name: 'Alice' },
        message: { message_id: 50, date: 1, chat: { id: 12345, type: 'private' } },
        data: 'ai:mode',
      },
      user
    );

    expect(editedMessages.length).toBe(1);
    expect(editedMessages[0].text).toContain('Choose Your AI Routing Mode');
    expect(editedMessages[0].text).toContain('Current Active Strategy');
    expect(answeredQueries[0].text).toBe('Routing Mode');
  });

  it('renders model selection when ai:models is clicked', async () => {
    await handler.handleCallback(
      {
        id: 'cb2',
        from: { id: 12345, is_bot: false, first_name: 'Alice' },
        message: { message_id: 50, date: 1, chat: { id: 12345, type: 'private' } },
        data: 'ai:models',
      },
      user
    );

    expect(editedMessages.length).toBe(1);
    expect(editedMessages[0].text).toContain('Select Your Primary AI Model');
    expect(editedMessages[0].text).toContain('Active Model');
    expect(answeredQueries[0].text).toBe('Select Model');
  });

  it('updates model preferences and re-renders when set_model is clicked', async () => {
    await handler.handleCallback(
      {
        id: 'cb3',
        from: { id: 12345, is_bot: false, first_name: 'Alice' },
        message: { message_id: 50, date: 1, chat: { id: 12345, type: 'private' } },
        data: 'set_model:claude-3-5-sonnet-latest:anthropic',
      },
      user
    );

    expect(answeredQueries[0].text).toContain('claude-3-5-sonnet-latest');
    const prefs = await db.getUserModelPreferences(user.id);
    expect(prefs?.defaultModel).toBe('claude-3-5-sonnet-latest');
    expect(prefs?.defaultProvider).toBe('anthropic');
    expect(editedMessages[0].text).toContain('claude-3-5-sonnet-latest');
  });

  it('updates routing mode and re-renders when mode is selected', async () => {
    await handler.handleCallback(
      {
        id: 'cb4',
        from: { id: 12345, is_bot: false, first_name: 'Alice' },
        message: { message_id: 50, date: 1, chat: { id: 12345, type: 'private' } },
        data: 'mode:coding',
      },
      user
    );

    expect(answeredQueries[0].text).toBe('Mode set to: coding');
    const prefs = await db.getUserModelPreferences(user.id);
    expect(prefs?.routingMode).toBe('coding');
    expect(editedMessages[0].text).toContain('coding');
  });

  it('renders provider manage options and handles disconnect', async () => {
    await db.saveUserCredential(
      user.id,
      'gemini',
      { encrypted: 'enc', iv: 'iv', authTag: 'tag' },
      'AIzaSy...1234'
    );

    // 1. Manage provider
    await handler.handleCallback(
      {
        id: 'cb5',
        from: { id: 12345, is_bot: false, first_name: 'Alice' },
        message: { message_id: 50, date: 1, chat: { id: 12345, type: 'private' } },
        data: 'provider:manage:gemini',
      },
      user
    );

    expect(editedMessages[0].text).toContain('Manage Provider: GEMINI');
    expect(editedMessages[0].text).toContain('AIzaSy...1234');

    // 2. Disconnect provider
    await handler.handleCallback(
      {
        id: 'cb6',
        from: { id: 12345, is_bot: false, first_name: 'Alice' },
        message: { message_id: 50, date: 1, chat: { id: 12345, type: 'private' } },
        data: 'provider:disconnect:gemini',
      },
      user
    );

    const creds = await db.getUserCredentials(user.id);
    expect(creds.find(c => c.provider === 'gemini')).toBeUndefined();
    expect(editedMessages[1].text).toContain('AI Provider Management');
  });
});

