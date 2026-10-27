// src/ai/xai.ts
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

export class XAIProvider implements AIProviderAdapter {
  readonly id = 'xai' as const;
  readonly displayName = 'xAI (Grok)';
  private readonly defaultBaseUrl = 'https://api.x.ai/v1';
  private readonly defaultModel = 'grok-2-mini';
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
    const baseModels = DEFAULT_MODEL_CATALOG.filter(m => m.provider === 'xai');
    try {
      const remote = await this.client.listModels({
        ...credentials,
        baseUrl: credentials.baseUrl || this.defaultBaseUrl,
      });
      return remote.map(m => ({ ...m, provider: 'xai' as const }));
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
