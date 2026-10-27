// tests/unit/providers.test.ts
import { describe, it, expect, vi } from 'vitest';
import { GeminiProvider } from '../../src/ai/gemini.js';
import { OpenAIProvider } from '../../src/ai/openai.js';
import { AnthropicProvider } from '../../src/ai/anthropic.js';
import { XAIProvider } from '../../src/ai/xai.js';
import { OpenRouterProvider } from '../../src/ai/openrouter.js';

describe('AI Provider Adapters', () => {
  describe('OpenAIProvider', () => {
    it('validates credentials against models endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 'gpt-4o' }] }),
      });
      const provider = new OpenAIProvider(mockFetch as unknown as typeof fetch);
      const result = await provider.validateCredentials({ apiKey: 'test-sk' });
      expect(result.valid).toBe(true);
    });

    it('returns error on invalid credentials', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Incorrect API key',
      });
      const provider = new OpenAIProvider(mockFetch as unknown as typeof fetch);
      const result = await provider.validateCredentials({ apiKey: 'invalid-sk' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('401');
    });

    it('generates chat completions and parses usage', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"intent":"chat","reply":"Hello world"}' } }],
          usage: { prompt_tokens: 15, completion_tokens: 8, total_tokens: 23 },
        }),
      });
      const provider = new OpenAIProvider(mockFetch as unknown as typeof fetch);
      const out = await provider.generate({
        credentials: { apiKey: 'test-sk' },
        modelId: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hi' }],
      });
      expect(out.text).toContain('Hello world');
      expect(out.usage?.totalTokens).toBe(23);
    });

    it('interprets message into AssistantIntent schema', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                intent: 'create_task',
                title: 'Buy Groceries',
                due_at_local: null,
                priority: 'normal',
                timezone: 'Asia/Kolkata',
              }),
            },
          }],
        }),
      });
      const provider = new OpenAIProvider(mockFetch as unknown as typeof fetch);
      const intent = await provider.interpretMessage(
        {
          userMessage: 'Buy groceries',
          userTimezone: 'Asia/Kolkata',
          referenceTime: new Date('2026-10-25T12:00:00Z'),
        },
        { apiKey: 'test-sk' }
      );
      expect(intent.intent).toBe('create_task');
      if (intent.intent === 'create_task') {
        expect(intent.title).toBe('Buy Groceries');
      }
    });
  });

  describe('AnthropicProvider', () => {
    it('generates messages with system prompt extraction and parses text', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: '{"intent":"chat","reply":"Greetings from Claude"}' }],
          usage: { input_tokens: 20, output_tokens: 10 },
        }),
      });
      const provider = new AnthropicProvider(mockFetch as unknown as typeof fetch);
      const out = await provider.generate({
        credentials: { apiKey: 'test-anthropic-key' },
        modelId: 'claude-3-5-haiku-latest',
        messages: [
          { role: 'system', content: 'You are an assistant' },
          { role: 'user', content: 'Hello' },
        ],
      });
      expect(out.text).toContain('Greetings from Claude');
      expect(out.usage?.totalTokens).toBe(30);
    });

    it('strips markdown codeblocks when parsing Anthropic JSON response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{
            type: 'text',
            text: '```json\n{"intent":"chat","reply":"Cleaned markdown"}\n```',
          }],
        }),
      });
      const provider = new AnthropicProvider(mockFetch as unknown as typeof fetch);
      const intent = await provider.interpretMessage(
        {
          userMessage: 'Hi',
          userTimezone: 'UTC',
          referenceTime: new Date('2026-10-25T12:00:00Z'),
        },
        { apiKey: 'test-key' }
      );
      expect(intent.intent).toBe('chat');
      if (intent.intent === 'chat') {
        expect(intent.reply).toBe('Cleaned markdown');
      }
    });
  });

  describe('XAIProvider & OpenRouterProvider', () => {
    it('XAIProvider configures default xAI base URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"intent":"chat","reply":"Grok responding"}' } }],
        }),
      });
      const xai = new XAIProvider(mockFetch as unknown as typeof fetch);
      const intent = await xai.interpretMessage(
        {
          userMessage: 'Tell a joke',
          userTimezone: 'UTC',
          referenceTime: new Date('2026-10-25T12:00:00Z'),
        },
        { apiKey: 'xai-key' }
      );
      expect(intent.intent).toBe('chat');
      expect(mockFetch.mock.calls[0][0]).toContain('https://api.x.ai/v1');
    });

    it('OpenRouterProvider targets OpenRouter endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"intent":"chat","reply":"Llama 3.3 responding"}' } }],
        }),
      });
      const openRouter = new OpenRouterProvider(mockFetch as unknown as typeof fetch);
      const intent = await openRouter.interpretMessage(
        {
          userMessage: 'Hello',
          userTimezone: 'UTC',
          referenceTime: new Date('2026-10-25T12:00:00Z'),
        },
        { apiKey: 'openrouter-key' }
      );
      expect(intent.intent).toBe('chat');
      expect(mockFetch.mock.calls[0][0]).toContain('https://openrouter.ai/api/v1');
    });
  });
});
