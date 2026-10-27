// src/ai/openai.ts
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

export class OpenAIProvider implements AIProviderAdapter {
  readonly id = 'openai' as const;
  readonly displayName = 'OpenAI';
  private readonly defaultBaseUrl = 'https://api.openai.com/v1';
  private readonly defaultModel = 'gpt-4o-mini';
  private readonly fetch: typeof fetch;

  constructor(fetchFn?: typeof fetch) {
    this.fetch = fetchFn || globalThis.fetch.bind(globalThis);
  }

  async validateCredentials(credentials: ProviderCredentials): Promise<{ valid: boolean; error?: string }> {
    const base = credentials.baseUrl || this.defaultBaseUrl;
    try {
      const res = await this.fetch(`${base}/models`, {
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          ...(credentials.organizationId ? { 'OpenAI-Organization': credentials.organizationId } : {}),
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { valid: false, error: `OpenAI API returned status ${res.status}: ${text}` };
      }
      return { valid: true };
    } catch (err: unknown) {
      return { valid: false, error: `Connection failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  async listModels(credentials: ProviderCredentials): Promise<ModelCatalogItem[]> {
    const baseModels = DEFAULT_MODEL_CATALOG.filter(m => m.provider === 'openai');
    const base = credentials.baseUrl || this.defaultBaseUrl;
    try {
      const res = await this.fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${credentials.apiKey}` },
      });
      if (!res.ok) return baseModels;
      const data = await res.json() as { data?: Array<{ id: string }> };
      if (!data.data) return baseModels;

      const dynamicList: ModelCatalogItem[] = data.data
        .filter(m => (m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3')) && !m.id.includes('instruct') && !m.id.includes('realtime'))
        .map(m => {
          const existing = baseModels.find(bm => bm.id === m.id);
          return existing || {
            id: m.id,
            provider: 'openai',
            displayName: m.id,
            capabilities: ['quick_answer', 'tools', 'structured_output'],
            costTier: 'medium',
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

    const body: Record<string, unknown> = {
      model: input.modelId,
      messages: input.messages,
      temperature: input.temperature ?? 0.1,
      ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
      ...(input.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
    };

    const res = await this.fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.credentials.apiKey}`,
        ...(input.credentials.organizationId ? { 'OpenAI-Organization': input.credentials.organizationId } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    return {
      text: data.choices?.[0]?.message?.content || '',
      latencyMs: Date.now() - start,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
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
        responseFormat: 'json',
      });
      rawText = result.text;
    } catch {
      return {
        intent: 'ask_clarification',
        question: 'I had trouble connecting to the OpenAI service. Could you please try again?',
        reason: 'unsupported_request',
      };
    }

    if (!rawText) {
      return {
        intent: 'ask_clarification',
        question: 'Could you rephrase your request? I received an empty response from OpenAI.',
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
        question: 'I had difficulty parsing the response from OpenAI. Could you please clarify your request?',
        reason: 'ambiguous_time',
      };
    }
  }
}
