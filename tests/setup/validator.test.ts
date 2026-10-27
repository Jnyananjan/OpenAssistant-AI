// tests/setup/validator.test.ts
import { describe, it, expect, vi } from 'vitest';
import { SetupValidator } from '../../src/setup/validator.js';

describe('SetupValidator', () => {
  it('validates Telegram bot token successfully on valid getMe response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          id: 123456789,
          is_bot: true,
          first_name: 'Jana Bot',
          username: 'jana_ai_bot',
        },
      }),
    } as unknown as Response);

    const validator = new SetupValidator(process.cwd(), mockFetch as unknown as typeof fetch);
    const result = await validator.validateTelegramToken('123456789:ABCdefGhIJK');

    expect(result.valid).toBe(true);
    expect(result.botUsername).toBe('jana_ai_bot');
    expect(result.botName).toBe('Jana Bot');
  });

  it('rejects invalid Telegram bot token format or API error', async () => {
    const validator = new SetupValidator();
    const badFormat = await validator.validateTelegramToken('invalid-token');
    expect(badFormat.valid).toBe(false);
    expect(badFormat.error).toContain('format');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ ok: false, description: 'Not Found' }),
    } as unknown as Response);

    const apiValidator = new SetupValidator(process.cwd(), mockFetch as unknown as typeof fetch);
    const apiError = await apiValidator.validateTelegramToken('123456789:bad_token');
    expect(apiError.valid).toBe(false);
    expect(apiError.error).toContain('Not Found');
  });

  it('validates Gemini API key with ping prompt', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'pong' }] } }],
      }),
    } as unknown as Response);

    const validator = new SetupValidator(process.cwd(), mockFetch as unknown as typeof fetch);
    const result = await validator.validateGeminiApiKey('AIzaSyValidKey', 'gemini-3.8-flash');

    expect(result.valid).toBe(true);
    expect(result.model).toBe('gemini-3.8-flash');
  });

  it('rejects invalid Gemini API key', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'API key not valid. Please pass a valid API key.' },
      }),
    } as unknown as Response);

    const validator = new SetupValidator(process.cwd(), mockFetch as unknown as typeof fetch);
    const result = await validator.validateGeminiApiKey('AIzaSyBadKey');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('API key not valid');
  });

  it('fetches available models supporting generateContent', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
        ],
      }),
    } as unknown as Response);

    const validator = new SetupValidator(process.cwd(), mockFetch as unknown as typeof fetch);
    const result = await validator.fetchAvailableModels('AIzaSyValidKey');

    expect(result.valid).toBe(true);
    expect(result.models).toContain('gemini-3.5-flash-lite');
    expect(result.models).toContain('gemini-2.5-pro');
    expect(result.models).not.toContain('gemini-3.8-flash-tts');
  });

  it('validates Supabase project reference format', async () => {
    const validator = new SetupValidator();

    // Invalid length
    const invalidShort = await validator.validateSupabaseProject('short');
    expect(invalidShort.valid).toBe(false);
    expect(invalidShort.error).toContain('20-character');

    // Valid format with reachable check
    const mockFetch = vi.fn().mockResolvedValue({
      status: 401, // 401 Unauthorized means Supabase gateway is live and listening
    } as unknown as Response);

    const fetchValidator = new SetupValidator(process.cwd(), mockFetch as unknown as typeof fetch);
    const valid = await fetchValidator.validateSupabaseProject('mockprojectref123456');
    expect(valid.valid).toBe(true);
    expect(valid.projectRef).toBe('mockprojectref123456');
  });
});
