// tests/unit/gemini.test.ts
import { describe, it, expect, vi } from 'vitest';
import { GeminiProvider } from '../../src/ai/gemini.js';

describe('GeminiProvider', () => {
  it('parses structured task with reminder intent from model response', async () => {
    const mockResponseJson = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  intent: 'create_task_with_reminder',
                  title: 'Python assignment',
                  due_at_local: '2026-10-26T18:00:00',
                  reminder_offset_minutes: 5,
                  timezone: 'Asia/Kolkata',
                  needs_clarification: false,
                }),
              },
            ],
          },
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponseJson,
    } as unknown as Response);

    const provider = new GeminiProvider({
      apiKey: 'test-key',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const intent = await provider.interpretMessage({
      userMessage: 'Finish Python assignment tomorrow at 6 PM. Remind me 5 minutes before',
      userTimezone: 'Asia/Kolkata',
      referenceTime: new Date('2026-10-25T12:00:00Z'),
    });

    expect(intent.intent).toBe('create_task_with_reminder');
    if (intent.intent === 'create_task_with_reminder') {
      expect(intent.title).toBe('Python assignment');
      expect(intent.due_at_local).toBe('2026-10-26T18:00:00');
      expect(intent.reminder_offset_minutes).toBe(5);
    }
  });

  it('safely rejects malicious or unsupported intents by falling back to clarification', async () => {
    const maliciousPayloads = [
      { intent: 'drop_database', sql: 'DROP DATABASE postgres;' },
      { intent: 'execute_shell', command: 'rm -rf /' },
      { intent: 'create_task', title: '' }, // Empty title violation
      { intent: 'create_task_with_reminder', title: 'Task', reminder_offset_minutes: -10 }, // Negative offset violation
    ];

    for (const payload of maliciousPayloads) {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
        }),
      } as unknown as Response);

      const provider = new GeminiProvider({
        apiKey: 'test-key',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const intent = await provider.interpretMessage({
        userMessage: 'harmful instruction',
        userTimezone: 'Asia/Kolkata',
        referenceTime: new Date('2026-10-25T12:00:00Z'),
      });

      expect(intent.intent).toBe('ask_clarification');
    }
  });

  it('safely falls back to ask_clarification on invalid JSON from provider', async () => {
    const mockResponseJson = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'Not a JSON output at all',
              },
            ],
          },
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponseJson,
    } as unknown as Response);

    const provider = new GeminiProvider({
      apiKey: 'test-key',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const intent = await provider.interpretMessage({
      userMessage: 'blah blah',
      userTimezone: 'Asia/Kolkata',
      referenceTime: new Date('2026-10-25T12:00:00Z'),
    });

    expect(intent.intent).toBe('ask_clarification');
  });

  it('safely falls back to ask_clarification on HTTP 429 rate limit or 500 error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Resource exhausted' }),
    } as unknown as Response);

    const provider = new GeminiProvider({
      apiKey: 'test-key',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const intent = await provider.interpretMessage({
      userMessage: 'Test rate limit',
      userTimezone: 'Asia/Kolkata',
      referenceTime: new Date('2026-10-25T12:00:00Z'),
    });

    expect(intent.intent).toBe('ask_clarification');
    if (intent.intent === 'ask_clarification') {
      expect(intent.question).toContain('encountered an error');
    }
  });

  it('safely falls back to ask_clarification on network error without throwing', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Connection timed out'));

    const provider = new GeminiProvider({
      apiKey: 'test-key',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const intent = await provider.interpretMessage({
      userMessage: 'Test task',
      userTimezone: 'Asia/Kolkata',
      referenceTime: new Date('2026-10-25T12:00:00Z'),
    });

    expect(intent.intent).toBe('ask_clarification');
    if (intent.intent === 'ask_clarification') {
      expect(intent.question).toContain('trouble connecting');
    }
  });
});
