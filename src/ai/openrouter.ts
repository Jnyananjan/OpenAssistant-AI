// src/ai/openrouter.ts
import { OpenAIProvider } from './openai.js';
import {
  AIProviderAdapter,
  InterpretMessageInput,
  ProviderCredentials,
  ModelCatalogItem,
  ProviderGenerateInput,
  ProviderGenerateOutput,
} from './provider.js';
import { AssistantIntent } from './intent-schema.js';
import { DEFAULT_MODEL_CATALOG } from './catalog.js';

export class OpenRouterProvider implements AIProviderAdapter {
  readonly id = 'openrouter' as const;
  readonly displayName = 'OpenRouter';
  private readonly defaultBaseUrl = 'https://openrouter.ai/api/v1';
  private readonly defaultModel = 'meta-llama/llama-3.3-70b-instruct:free';
  private readonly client: OpenAIProvider;

  constructor(fetchFn?: typeof fetch) {
    this.client = new OpenAIProvider(fetchFn);
  }

  async validateCredentials(credentials: ProviderCredentials): Promise<{ valid: boolean; error?: string }> {
    return this.client.validateCredentials({
      ...credentials,
      baseUrl: credentials.baseUrl || this.defaultBaseUrl,
    });
  }

  async listModels(credentials: ProviderCredentials): Promise<ModelCatalogItem[]> {
    const baseModels = DEFAULT_MODEL_CATALOG.filter(m => m.provider === 'openrouter');
    try {
      const res = await (globalThis.fetch || fetch)(`${credentials.baseUrl || this.defaultBaseUrl}/models`, {
        headers: { Authorization: `Bearer ${credentials.apiKey}` },
      });
      if (!res.ok) return baseModels;
      const data = await res.json() as { data?: Array<{ id: string; name?: string; context_length?: number }> };
      if (!data.data) return baseModels;

      const dynamicList: ModelCatalogItem[] = data.data.slice(0, 30).map(m => {
        const existing = baseModels.find(bm => bm.id === m.id);
        return existing || {
          id: m.id,
          provider: 'openrouter' as const,
          displayName: m.name || m.id,
          capabilities: ['quick_answer', 'coding', 'budget'],
          contextWindow: m.context_length,
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
    return this.client.testModel(
      { ...credentials, baseUrl: credentials.baseUrl || this.defaultBaseUrl },
      modelId || this.defaultModel
    );
  }

  async generate(input: ProviderGenerateInput): Promise<ProviderGenerateOutput> {
    return this.client.generate({
      ...input,
      credentials: {
        ...input.credentials,
        baseUrl: input.credentials.baseUrl || this.defaultBaseUrl,
      },
    });
  }

  async interpretMessage(
    input: InterpretMessageInput,
    credentials: ProviderCredentials,
    modelId?: string
  ): Promise<AssistantIntent> {
    return this.client.interpretMessage(
      input,
      { ...credentials, baseUrl: credentials.baseUrl || this.defaultBaseUrl },
      modelId || this.defaultModel
    );
  }
}
