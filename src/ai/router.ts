// src/ai/router.ts
import {
  AIProvider,
  AIProviderAdapter,
  InterpretMessageInput,
  ProviderCredentials,
  ProviderId,
  ModelCatalogItem,
} from './provider.js';
import { AssistantIntent } from './intent-schema.js';
import { GeminiProvider } from './gemini.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { XAIProvider } from './xai.js';
import { OpenRouterProvider } from './openrouter.js';
import { DEFAULT_MODEL_CATALOG, getModelById } from './catalog.js';

export type RoutingMode =
  | 'quick_answer'
  | 'deep_reasoning'
  | 'coding'
  | 'budget'
  | 'best_available'
  | 'manual';

export interface UserRoutingPreferences {
  defaultProvider: ProviderId;
  defaultModel: string;
  routingMode: RoutingMode;
  taskRules?: Record<string, { provider: ProviderId; model: string }>;
}

export interface UserCredentialRecord {
  provider: ProviderId;
  credentials: ProviderCredentials;
  isActive: boolean;
}

export interface RouterConfig {
  defaultFallbackProvider?: AIProvider;
  fetchFn?: typeof fetch;
}

export class SmartModelRouter implements AIProvider {
  private readonly adapters: Map<ProviderId, AIProviderAdapter> = new Map();
  private readonly defaultFallbackProvider?: AIProvider;

  constructor(config?: RouterConfig) {
    this.defaultFallbackProvider = config?.defaultFallbackProvider;
    const fetchFn = config?.fetchFn;

    this.registerAdapter(new GeminiProvider({ apiKey: '', fetchFn }));
    this.registerAdapter(new OpenAIProvider(fetchFn));
    this.registerAdapter(new AnthropicProvider(fetchFn));
    this.registerAdapter(new XAIProvider(fetchFn));
    this.registerAdapter(new OpenRouterProvider(fetchFn));
  }

  registerAdapter(adapter: AIProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(provider: ProviderId): AIProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  getAllAdapters(): AIProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  selectRoute(
    userMessage: string,
    preferences: UserRoutingPreferences,
    availableCredentials: UserCredentialRecord[]
  ): { provider: ProviderId; model: string; adapter: AIProviderAdapter; credentials: ProviderCredentials } {
    const activeCreds = availableCredentials.filter(c => c.isActive);

    if (activeCreds.length === 0) {
      throw new Error('No active AI providers configured. Please connect a provider using /ai or /connect.');
    }

    const lowerMessage = userMessage.toLowerCase();
    const mode = preferences.routingMode || 'best_available';

    // 1. Check custom task rules (e.g. coding, reasoning, fast)
    if (preferences.taskRules) {
      const isCoding = /\b(code|function|debug|script|python|sql|javascript|typescript|bug|error|stack)\b/i.test(lowerMessage);
      const isUrgent = /\b(urgent|quick|fast|asap|now)\b/i.test(lowerMessage);
      const isPlanning = /\b(plan|architecture|design|roadmap|strategy)\b/i.test(lowerMessage);

      if (isCoding && preferences.taskRules.coding) {
        const rule = preferences.taskRules.coding;
        const cred = activeCreds.find(c => c.provider === rule.provider);
        if (cred) {
          const adapter = this.adapters.get(rule.provider)!;
          return { provider: rule.provider, model: rule.model, adapter, credentials: cred.credentials };
        }
      }

      if (isUrgent && preferences.taskRules.urgent) {
        const rule = preferences.taskRules.urgent;
        const cred = activeCreds.find(c => c.provider === rule.provider);
        if (cred) {
          const adapter = this.adapters.get(rule.provider)!;
          return { provider: rule.provider, model: rule.model, adapter, credentials: cred.credentials };
        }
      }

      if (isPlanning && preferences.taskRules.planning) {
        const rule = preferences.taskRules.planning;
        const cred = activeCreds.find(c => c.provider === rule.provider);
        if (cred) {
          const adapter = this.adapters.get(rule.provider)!;
          return { provider: rule.provider, model: rule.model, adapter, credentials: cred.credentials };
        }
      }
    }

    // 2. Manual mode: strictly respect defaultProvider & defaultModel
    if (mode === 'manual') {
      const cred = activeCreds.find(c => c.provider === preferences.defaultProvider);
      if (cred) {
        const adapter = this.adapters.get(preferences.defaultProvider)!;
        return {
          provider: preferences.defaultProvider,
          model: preferences.defaultModel,
          adapter,
          credentials: cred.credentials,
        };
      }
    }

    // 3. Mode-based matching against available models
    const configuredProviderIds = new Set(activeCreds.map(c => c.provider));
    const eligibleModels = DEFAULT_MODEL_CATALOG.filter(m => configuredProviderIds.has(m.provider));

    let targetModel: ModelCatalogItem | undefined;

    if (mode === 'quick_answer') {
      targetModel = eligibleModels.find(m => m.capabilities.includes('quick_answer'));
    } else if (mode === 'deep_reasoning') {
      targetModel = eligibleModels.find(m => m.capabilities.includes('deep_reasoning'));
    } else if (mode === 'coding') {
      targetModel = eligibleModels.find(m => m.capabilities.includes('coding'));
    } else if (mode === 'budget') {
      targetModel = eligibleModels.find(m => m.costTier === 'free') || eligibleModels.find(m => m.costTier === 'low');
    }

    if (targetModel) {
      const cred = activeCreds.find(c => c.provider === targetModel!.provider)!;
      const adapter = this.adapters.get(targetModel.provider)!;
      return {
        provider: targetModel.provider,
        model: targetModel.id,
        adapter,
        credentials: cred.credentials,
      };
    }

    // 4. Default: User's preferred provider/model if active, else first available active provider
    const preferredCred = activeCreds.find(c => c.provider === preferences.defaultProvider);
    if (preferredCred) {
      const adapter = this.adapters.get(preferences.defaultProvider)!;
      return {
        provider: preferences.defaultProvider,
        model: preferences.defaultModel || 'default',
        adapter,
        credentials: preferredCred.credentials,
      };
    }

    const fallbackCred = activeCreds[0];
    const adapter = this.adapters.get(fallbackCred.provider)!;
    const defaultForProvider = DEFAULT_MODEL_CATALOG.find(m => m.provider === fallbackCred.provider)?.id || 'default';
    return {
      provider: fallbackCred.provider,
      model: defaultForProvider,
      adapter,
      credentials: fallbackCred.credentials,
    };
  }

  async routeAndInterpret(
    input: InterpretMessageInput,
    preferences: UserRoutingPreferences,
    availableCredentials: UserCredentialRecord[]
  ): Promise<AssistantIntent> {
    try {
      const route = this.selectRoute(input.userMessage, preferences, availableCredentials);
      return await route.adapter.interpretMessage(input, route.credentials, route.model);
    } catch (err: unknown) {
      // Fallback to system provider if user has no provider configured or routing failed
      if (this.defaultFallbackProvider) {
        return this.defaultFallbackProvider.interpretMessage(input);
      }
      return {
        intent: 'ask_clarification',
        question: `AI Provider Notice: ${err instanceof Error ? err.message : 'No active AI provider ready. Please connect one using /connect.'}`,
        reason: 'unsupported_request',
      };
    }
  }

  // AIProvider compatibility
  async interpretMessage(input: InterpretMessageInput): Promise<AssistantIntent> {
    if (this.defaultFallbackProvider) {
      return this.defaultFallbackProvider.interpretMessage(input);
    }
    return {
      intent: 'ask_clarification',
      question: 'No AI model provider is configured yet. Please configure your provider key using /connect.',
      reason: 'unsupported_request',
    };
  }
}
