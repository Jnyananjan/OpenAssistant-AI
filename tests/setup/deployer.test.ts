// tests/setup/deployer.test.ts
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { SetupDeployer } from '../../src/setup/deployer.js';
import { SetupValidator } from '../../src/setup/validator.js';
import { SetupConfig } from '../../src/setup/types.js';

describe('SetupDeployer', () => {
  it('strictly redacts secrets and tokens from text and error messages', () => {
    const deployer = new SetupDeployer();
    const secrets = [
      '123456789:ABCdef123456',
      'AIzaSySuperSecretGeminiKey',
      'db-pass-secret-999',
    ];

    const rawLog = 'Error connecting with bot123456789:ABCdef123456 using key=AIzaSySuperSecretGeminiKey and pass db-pass-secret-999';
    const redacted = deployer.redactSecrets(rawLog, secrets);

    expect(redacted).not.toContain('123456789:ABCdef123456');
    expect(redacted).not.toContain('AIzaSySuperSecretGeminiKey');
    expect(redacted).not.toContain('db-pass-secret-999');
    expect(redacted).toContain('***REDACTED***');
  });

  it('runs deployment pipeline and tracks step progress', async () => {
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const mockValidator = {
      checkPrerequisites: vi.fn().mockResolvedValue({
        node: { installed: true, version: 'v24.0.0' },
        npm: { installed: true, version: '11.0.0' },
        supabase: { installed: true, version: '2.75.0' },
        allSatisfied: true,
      }),
      validateTelegramToken: vi.fn().mockResolvedValue({
        valid: true,
        botId: 100,
        botUsername: 'jana_test_bot',
        botName: 'Jana Test',
      }),
      validateGeminiApiKey: vi.fn().mockResolvedValue({
        valid: true,
        model: 'gemini-3.8-flash',
      }),
      validateSupabaseProject: vi.fn().mockResolvedValue({
        valid: true,
        projectRef: 'mockprojectref123456',
        projectUrl: 'https://mockprojectref123456.supabase.co',
      }),
    } as unknown as SetupValidator;

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('setWebhook')) {
        return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
      }
      if (url.includes('getWebhookInfo')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: { url: 'https://mockprojectref123456.supabase.co/functions/v1/telegram-webhook', pending_update_count: 0 },
          }),
        } as unknown as Response;
      }
      return { ok: true, status: 200, statusText: 'OK' } as unknown as Response;
    });

    const deployer = new SetupDeployer(process.cwd(), mockValidator, mockFetch as unknown as typeof fetch);

    // Mock runSafeCommand to simulate successful supabase CLI execution
    deployer.runSafeCommand = vi.fn().mockResolvedValue({
      stdout: 'Command executed successfully',
      stderr: '',
    });

    const config: SetupConfig = {
      supabaseProjectRef: 'mockprojectref123456',
      telegramBotToken: '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ',
      telegramUserId: '123456789',
      geminiApiKey: 'AIzaSyTestKey123',
    };

    const progress = await deployer.executeDeployment(config);

    expect(progress.completed).toBe(true);
    expect(progress.success).toBe(true);
    expect(progress.steps.length).toBe(11);
    expect(progress.steps.every((s) => s.status === 'success')).toBe(true);
  });

  it('safely stops and marks failure if a step fails without crashing', async () => {
    const mockValidator = {
      checkPrerequisites: vi.fn().mockResolvedValue({
        node: { installed: true },
        npm: { installed: true },
        supabase: { installed: true },
        allSatisfied: true,
      }),
      validateTelegramToken: vi.fn().mockResolvedValue({
        valid: false,
        error: 'Invalid Telegram bot token',
      }),
      validateGeminiApiKey: vi.fn(),
      validateSupabaseProject: vi.fn(),
    } as unknown as SetupValidator;

    const deployer = new SetupDeployer(process.cwd(), mockValidator);

    const config: SetupConfig = {
      supabaseProjectRef: 'mockprojectref123456',
      telegramBotToken: 'invalid_token',
      telegramUserId: '123456',
      geminiApiKey: 'any_key',
    };

    const progress = await deployer.executeDeployment(config);

    expect(progress.completed).toBe(true);
    expect(progress.success).toBe(false);
    expect(progress.steps[1].status).toBe('failed');
    expect(progress.steps[1].error).toContain('Telegram Bot validation failed');
    // Subsequent steps should remain pending
    expect(progress.steps[2].status).toBe('pending');
  });
});
