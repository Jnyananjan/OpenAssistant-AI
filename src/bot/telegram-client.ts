// src/bot/telegram-client.ts
import {
  NotificationProvider,
  SendTextInput,
  SendTextResult,
} from '../shared/types.js';

export interface TelegramClientConfig {
  botToken: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class TelegramClient implements NotificationProvider {
  private readonly botToken: string;
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(config: TelegramClientConfig) {
    this.botToken = config.botToken;
    this.baseUrl = config.baseUrl || 'https://api.telegram.org';
    this.fetch = config.fetchFn || globalThis.fetch.bind(globalThis);
  }

  async sendText(input: SendTextInput): Promise<SendTextResult> {
    const url = `${this.baseUrl}/bot${this.botToken}/sendMessage`;

    const body: Record<string, unknown> = {
      chat_id: input.chat_id,
      text: input.text,
    };
    if (input.parse_mode) {
      body.parse_mode = input.parse_mode;
    }
    if (input.reply_markup) {
      body.reply_markup = input.reply_markup;
    }

    try {
      const response = await this.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as {
        ok: boolean;
        result?: { message_id: number };
        description?: string;
      };

      if (!response.ok || !data.ok) {
        return {
          ok: false,
          error: data.description || `HTTP status ${response.status}`,
        };
      }

      return {
        ok: true,
        message_id: data.result?.message_id,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Network failure: ${msg}`,
      };
    }
  }

  async answerCallbackQuery(callback_query_id: string, text?: string): Promise<boolean> {
    const url = `${this.baseUrl}/bot${this.botToken}/answerCallbackQuery`;

    try {
      const response = await this.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id,
          text,
        }),
      });

      const data = (await response.json()) as { ok: boolean };
      return response.ok && Boolean(data.ok);
    } catch {
      return false;
    }
  }

  async deleteMessage(chat_id: number, message_id: number): Promise<boolean> {
    const url = `${this.baseUrl}/bot${this.botToken}/deleteMessage`;

    try {
      const response = await this.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id,
          message_id,
        }),
      });

      const data = (await response.json()) as { ok: boolean };
      return response.ok && Boolean(data.ok);
    } catch {
      return false;
    }
  }
}
