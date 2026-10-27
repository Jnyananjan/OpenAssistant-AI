// tests/setup/server.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SetupServer } from '../../src/setup/server.js';
import { SetupValidator } from '../../src/setup/validator.js';

describe('SetupServer', () => {
  let server: SetupServer;
  let serverUrl: string;
  let csrfToken: string;
  const TEST_PORT = 41739;

  beforeAll(async () => {
    const mockValidator = {
      checkPrerequisites: vi.fn().mockResolvedValue({
        node: { installed: true, version: 'v24.0.0' },
        npm: { installed: true, version: '11.0.0' },
        supabase: { installed: true, version: '2.75.0' },
        allSatisfied: true,
      }),
      validateTelegramToken: vi.fn().mockResolvedValue({
        valid: true,
        botUsername: 'jana_test_bot',
      }),
      validateGeminiApiKey: vi.fn().mockResolvedValue({ valid: true, model: 'gemini-3.8-flash' }),
      fetchAvailableModels: vi.fn().mockResolvedValue({ valid: true, models: ['gemini-3.5-flash-lite', 'gemini-2.5-pro'] }),
      validateSupabaseProject: vi.fn().mockResolvedValue({ valid: true, projectUrl: 'https://mockprojectref123456.supabase.co' }),
    } as unknown as SetupValidator;

    server = new SetupServer({
      port: TEST_PORT,
      validator: mockValidator,
    });

    const info = await server.start();
    serverUrl = `http://127.0.0.1:${TEST_PORT}`;
    csrfToken = server.getCsrfToken();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('serves the setup dashboard HTML on GET /setup', async () => {
    const res = await fetch(`${serverUrl}/setup`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('OpenAssistant AI');
    expect(html).toContain('Deployment Wizard');
    expect(html).toContain(csrfToken);
  });

  it('serves prerequisites on GET /api/prerequisites', async () => {
    const res = await fetch(`${serverUrl}/api/prerequisites`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allSatisfied).toBe(true);
    expect(data.node.installed).toBe(true);
  });

  it('blocks POST requests without valid CSRF token with 403 Forbidden', async () => {
    const res = await fetch(`${serverUrl}/api/validate/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'test' }),
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('CSRF');
  });

  it('blocks POST requests from disallowed origins with 403 Forbidden', async () => {
    const res = await fetch(`${serverUrl}/api/validate/telegram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        'Origin': 'https://malicious-website.com',
      },
      body: JSON.stringify({ token: 'test' }),
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Origin');
  });

  it('processes valid POST requests with CSRF token', async () => {
    const res = await fetch(`${serverUrl}/api/validate/telegram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ token: '12345:valid' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(true);
  });

  it('rejects /api/deploy with missing required fields with 400 Bad Request', async () => {
    const res = await fetch(`${serverUrl}/api/deploy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Missing required');
  });
});
