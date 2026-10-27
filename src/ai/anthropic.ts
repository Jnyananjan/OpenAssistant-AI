// src/ai/anthropic.ts
import {
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

export class AnthropicProvider implements AIProviderAdapter {
  readonly id = 'anthropic' as const;
  readonly displayName = 'Anthropic Claude';
  private readonly defaultBaseUrl = 'https://api.anthropic.com/v1';
  private readonly defaultModel = 'claude-3-5-haiku-latest';
  private readonly fetch: typeof fetch;

  constructor(fetchFn?: typeof fetch) {
    this.fetch = fetchFn || globalThis.fetch.bind(globalThis);
  }

  async validateCredentials(credentials: ProviderCredentials): Promise<{ valid: boolean; error?: string }> {
    const testResult = await this.testModel(credentials, this.defaultModel);
    if (!testResult.success) {
      return { valid: false, error: testResult.error || 'Anthropic API key validation failed' };
    }
    return { valid: true };
  }

  async listModels(_credentials: ProviderCredentials): Promise<ModelCatalogItem[]> {
    return DEFAULT_MODEL_CATALOG.filter(m => m.provider === 'anthropic');
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
      return { success: Boolean(result.text), latencyMs: Date.now() - start };
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
    const base = input.credentials.baseUrl || this.defaultBaseUrl;

    const systemMsg = input.messages.find(m => m.role === 'system')?.content;
    const userAndAssistant = input.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: input.modelId,
      max_tokens: input.maxTokens || 1024,
      messages: userAndAssistant,
      temperature: input.temperature ?? 0.1,
      ...(systemMsg ? { system: systemMsg } : {}),
    };

    const res = await this.fetch(`${base}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': input.credentials.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = await res.json() as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = data.content?.[0]?.text || '';
    return {
      text,
      latencyMs: Date.now() - start,
      usage: {
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };
  }

  async interpretMessage(
    input: InterpretMessageInput,
    credentials: ProviderCredentials,
    modelId?: string
  ): Promise<AssistantIntent> {
    const model = modelId || this.defaultModel;
    const systemPrompt = buildSystemPrompt(input);

    let rawText = '';
    try {
      const result = await this.generate({
        credentials,
        modelId: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `User message: "${input.userMessage}"` },
        ],
        temperature: 0.1,
      });
      rawText = result.text;
    } catch {
      return {
        intent: 'ask_clarification',
        question: 'I had trouble connecting to the Anthropic service. Could you please try again?',
        reason: 'unsupported_request',
      };
    }

    if (!rawText) {
      return {
        intent: 'ask_clarification',
        question: 'Could you rephrase your request? I received an empty response from Anthropic.',
        reason: 'unsupported_request',
      };
    }

    try {
      // Claude might include ```json ``` wrapper, strip if present
      const cleanedText = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
      const parsedJson = JSON.parse(cleanedText);
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
        question: 'I had difficulty parsing the response from Anthropic. Could you please clarify your request?',
        reason: 'ambiguous_time',
      };
    }
  }
}
