// src/ai/gemini.ts
import {
  AIProvider,
  AIProviderAdapter,
  InterpretMessageInput,
  ProviderCredentials,
  ModelCatalogItem,
  ProviderGenerateInput,
  ProviderGenerateOutput,
} from './provider.js';
import { AssistantIntent, AssistantIntentSchema } from './intent-schema.js';
import { buildSystemPrompt } from './prompt.js';
import { DEFAULT_MODEL_CATALOG } from './catalog.js';

export interface GeminiConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class GeminiProvider implements AIProvider, AIProviderAdapter {
  readonly id = 'gemini' as const;
  readonly displayName = 'Google Gemini';

  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(config?: GeminiConfig) {
    this.apiKey = config?.apiKey || '';
    this.defaultModel = config?.model || 'gemini-3.5-flash-lite';
    this.baseUrl = config?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.fetch = config?.fetchFn || globalThis.fetch.bind(globalThis);
  }

  async validateCredentials(credentials: ProviderCredentials): Promise<{ valid: boolean; error?: string }> {
    const key = credentials.apiKey;
    const base = credentials.baseUrl || this.baseUrl;
    const url = `${base}/models?key=${key}`;

    try {
      const res = await this.fetch(url);
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return { valid: false, error: `Gemini API returned status ${res.status}: ${errorText}` };
      }
      return { valid: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { valid: false, error: `Connection failed: ${msg}` };
    }
  }

  async listModels(credentials: ProviderCredentials): Promise<ModelCatalogItem[]> {
    const baseModels = DEFAULT_MODEL_CATALOG.filter(m => m.provider === 'gemini');
    try {
      const key = credentials.apiKey;
      const base = credentials.baseUrl || this.baseUrl;
      const res = await this.fetch(`${base}/models?key=${key}`);
      if (!res.ok) return baseModels;
      const data = await res.json() as { models?: Array<{ name: string; displayName?: string; description?: string }> };
      if (!data.models) return baseModels;

      const dynamicList: ModelCatalogItem[] = data.models
        .filter(m => m.name.includes('gemini') && !m.name.includes('vision') && !m.name.includes('embedding'))
        .map(m => {
          const id = m.name.replace('models/', '');
          const existing = baseModels.find(bm => bm.id === id);
          return existing || {
            id,
            provider: 'gemini',
            displayName: m.displayName || id,
            capabilities: ['quick_answer', 'tools', 'structured_output'],
            costTier: 'low',
            isVerified: true,
          };
        });

      return dynamicList.length > 0 ? dynamicList : baseModels;
    } catch {
      return baseModels;
    }
  }

  async testModel(
    credentials: ProviderCredentials,
    modelId: string
  ): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const result = await this.generate({
        credentials,
        modelId,
        messages: [{ role: 'user', content: 'Ping' }],
        maxTokens: 5,
      });
      return {
        success: Boolean(result.text),
        latencyMs: Date.now() - start,
      };
    } catch (err: unknown) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async generate(input: ProviderGenerateInput): Promise<ProviderGenerateOutput> {
    const start = Date.now();
    const key = input.credentials.apiKey;
    const base = input.credentials.baseUrl || this.baseUrl;
    const endpoint = `${base}/models/${input.modelId}:generateContent?key=${key}`;

    const systemMessage = input.messages.find(m => m.role === 'system');
    const userAndAssistantMessages = input.messages.filter(m => m.role !== 'system');

    const contents = userAndAssistantMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: input.temperature ?? 0.1,
        ...(input.maxTokens ? { maxOutputTokens: input.maxTokens } : {}),
        ...(input.responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
      },
    };

    if (systemMessage) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    const res = await this.fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errText = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const json = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    };

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return {
      text,
      latencyMs: Date.now() - start,
      usage: {
        promptTokens: json.usageMetadata?.promptTokenCount,
        completionTokens: json.usageMetadata?.candidatesTokenCount,
        totalTokens: json.usageMetadata?.totalTokenCount,
      },
    };
  }

  // AIProvider interface implementation for backward compatibility
  async interpretMessage(
    input: InterpretMessageInput,
    credentials?: ProviderCredentials,
    modelId?: string
  ): Promise<AssistantIntent> {
    const creds: ProviderCredentials = credentials || { apiKey: this.apiKey };
    const model = modelId || this.defaultModel;
    const systemPrompt = buildSystemPrompt(input);

    let rawText = '';
    try {
      const result = await this.generate({
        credentials: creds,
        modelId: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `User message: "${input.userMessage}"` },
        ],
        temperature: 0.1,
        responseFormat: 'json',
      });
      rawText = result.text;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('Gemini API error')) {
        return {
          intent: 'ask_clarification',
          question: 'The AI assistant service encountered an error. You can also use /add or /tasks directly.',
          reason: 'unsupported_request',
        };
      }
      return {
        intent: 'ask_clarification',
        question: 'I had trouble connecting to the AI service. Could you please try again or use /add?',
        reason: 'unsupported_request',
      };
    }

    if (!rawText) {
      return {
        intent: 'ask_clarification',
        question: 'Could you rephrase your request? I received an empty response.',
        reason: 'unsupported_request',
      };
    }

    try {
      const parsedJson = JSON.parse(rawText);
      const validationResult = AssistantIntentSchema.safeParse(parsedJson);

      if (!validationResult.success) {
        return {
          intent: 'ask_clarification',
          question: 'I did not quite catch the task or time details. Could you specify the deadline clearly?',
          reason: 'ambiguous_time',
        };
      }

      return validationResult.data;
    } catch {
      return {
        intent: 'ask_clarification',
        question: 'I had difficulty parsing the date or task. Could you please clarify what you need done and when?',
        reason: 'ambiguous_time',
      };
    }
  }
}
