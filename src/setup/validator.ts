// src/setup/validator.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import {
  PrerequisitesResult,
  ToolCheckResult,
  TelegramValidationResult,
  GeminiValidationResult,
  SupabaseValidationResult,
} from './types.js';

const execFileAsync = promisify(execFile);

export class SetupValidator {
  private readonly projectRoot: string;
  private readonly fetchFn: typeof fetch;

  constructor(projectRoot: string = process.cwd(), fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.projectRoot = projectRoot;
    this.fetchFn = fetchFn;
  }

  async checkTool(cmd: string, args: string[] = ['--version']): Promise<ToolCheckResult> {
    try {
      const isBatch = process.platform === 'win32' && (cmd === 'npm' || cmd.endsWith('.cmd') || cmd.endsWith('.bat'));
      const { stdout, stderr } = await execFileAsync(cmd, args, {
        timeout: 8000,
        shell: isBatch,
      });
      const output = (stdout || stderr || '').trim();
      const firstLine = output.split('\n')[0].trim();
      return {
        installed: true,
        version: firstLine,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        installed: false,
        error: msg,
      };
    }
  }

  async checkPrerequisites(): Promise<PrerequisitesResult> {
    const [nodeCheck, npmCheck, supabaseCheck] = await Promise.all([
      this.checkTool('node', ['-v']),
      this.checkTool('npm', ['-v']),
      this.checkTool('supabase', ['-v']),
    ]);

    // Check existing supabase config
    let projectConfigured = false;
    let currentProjectRef: string | undefined;

    const configPath = path.join(this.projectRoot, 'supabase', 'config.toml');
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf8');
        const match = content.match(/project_id\s*=\s*"([^"]+)"/);
        if (match && match[1] && match[1] !== 'jana-ai') {
          projectConfigured = true;
          currentProjectRef = match[1];
        }
      } catch {
        // Ignore read errors
      }
    }

    const allSatisfied = nodeCheck.installed && npmCheck.installed && supabaseCheck.installed;

    return {
      node: nodeCheck,
      npm: npmCheck,
      supabase: supabaseCheck,
      allSatisfied,
      projectConfigured,
      currentProjectRef,
    };
  }

  async validateTelegramToken(botToken: string): Promise<TelegramValidationResult> {
    const trimmed = (botToken || '').trim();
    if (!trimmed || !trimmed.includes(':')) {
      return { valid: false, error: 'Telegram bot token must follow format 123456789:ABCdef...' };
    }

    try {
      const res = await this.fetchFn(`https://api.telegram.org/bot${trimmed}/getMe`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      const data = (await res.json()) as {
        ok: boolean;
        result?: { id: number; is_bot: boolean; first_name: string; username?: string };
        description?: string;
      };

      if (!res.ok || !data.ok || !data.result) {
        return {
          valid: false,
          error: data.description || `Telegram API returned status ${res.status}`,
        };
      }

      return {
        valid: true,
        botId: data.result.id,
        botUsername: data.result.username,
        botName: data.result.first_name,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { valid: false, error: `Failed to connect to Telegram API: ${msg}` };
    }
  }

  async validateGeminiApiKey(
    apiKey: string,
    model: string = 'gemini-3.8-flash'
  ): Promise<GeminiValidationResult> {
    const trimmed = (apiKey || '').trim();
    if (!trimmed) {
      return { valid: false, error: 'Gemini API key is required' };
    }

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${trimmed}`;
      const res = await this.fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'ping' }] }],
          generationConfig: { maxOutputTokens: 2 },
        }),
      });

      const data = (await res.json()) as { error?: { message: string } };

      if (!res.ok) {
        const errorMsg = data.error?.message || `HTTP status ${res.status}`;
        return { valid: false, error: `Gemini API validation failed: ${errorMsg}` };
      }

      return { valid: true, model };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { valid: false, error: `Could not reach Google Gemini API: ${msg}` };
    }
  }

  async fetchAvailableModels(apiKey: string): Promise<{ valid: boolean; models?: string[]; error?: string }> {
    const trimmed = (apiKey || '').trim();
    if (!trimmed) {
      return { valid: false, error: 'Gemini API key is required' };
    }

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmed}`;
      const res = await this.fetchFn(endpoint);
      const data = (await res.json()) as {
        models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
        error?: { message: string };
      };

      if (!res.ok || !data.models) {
        const errorMsg = data.error?.message || `HTTP ${res.status}`;
        return { valid: false, error: `Could not list models: ${errorMsg}` };
      }

      const contentModels = data.models
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''))
        .filter((name) => !name.includes('tts') && !name.includes('transcribe') && !name.includes('image'));

      return { valid: true, models: contentModels };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { valid: false, error: `Could not fetch models: ${msg}` };
    }
  }

  async validateSupabaseProject(
    projectRef: string,
    accessToken?: string
  ): Promise<SupabaseValidationResult> {
    const trimmedRef = (projectRef || '').trim();
    if (!trimmedRef) {
      return { valid: false, error: 'Supabase project reference is required' };
    }

    if (!/^[a-z0-9]{20}$/.test(trimmedRef)) {
      return {
        valid: false,
        error: `Project reference "${trimmedRef}" does not match standard 20-character lowercase alphanumeric format`,
      };
    }

    const projectUrl = `https://${trimmedRef}.supabase.co`;

    // If an access token is provided, verify against Supabase Management API
    if (accessToken && accessToken.trim()) {
      try {
        const res = await this.fetchFn(`https://api.supabase.com/v1/projects/${trimmedRef}`, {
          headers: {
            Authorization: `Bearer ${accessToken.trim()}`,
            Accept: 'application/json',
          },
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { message?: string };
          return {
            valid: false,
            error: data.message || `Supabase Management API returned status ${res.status}`,
          };
        }

        return { valid: true, projectRef: trimmedRef, projectUrl };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { valid: false, error: `Failed to verify with Supabase Management API: ${msg}` };
      }
    }

    // Otherwise test HTTPS reachability of the project endpoint
    try {
      const res = await this.fetchFn(`${projectUrl}/rest/v1/`, { method: 'GET' });
      // Supabase REST endpoint without apikey returns 401 Unauthorized or 400, confirming project exists and is reachable
      if (res.status === 401 || res.status === 400 || res.status === 200) {
        return { valid: true, projectRef: trimmedRef, projectUrl };
      }
      return {
        valid: false,
        error: `Supabase project endpoint returned unexpected status ${res.status}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { valid: false, error: `Could not reach ${projectUrl}: ${msg}` };
    }
  }
}
