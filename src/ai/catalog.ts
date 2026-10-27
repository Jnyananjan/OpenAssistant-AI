// src/ai/catalog.ts
import { ModelCatalogItem, ProviderId, ModelCapability } from './provider.js';

export const DEFAULT_MODEL_CATALOG: ModelCatalogItem[] = [
  // Google Gemini
  {
    id: 'gemini-3.8-flash',
    provider: 'gemini',
    displayName: 'Gemini 3.8 Flash',
    capabilities: ['quick_answer', 'coding', 'budget', 'tools', 'structured_output', 'streaming'],
    contextWindow: 1048576,
    costTier: 'low',
    isVerified: true,
  },
  {
    id: 'gemini-3.5-flash-lite',
    provider: 'gemini',
    displayName: 'Gemini 3.5 Flash Lite',
    capabilities: ['quick_answer', 'budget', 'tools', 'structured_output'],
    contextWindow: 524288,
    costTier: 'free',
    isVerified: true,
  },
  {
    id: 'gemini-3.8-pro',
    provider: 'gemini',
    displayName: 'Gemini 3.8 Pro',
    capabilities: ['deep_reasoning', 'coding', 'tools', 'structured_output', 'streaming'],
    contextWindow: 2097152,
    costTier: 'medium',
    isVerified: true,
  },

  // OpenAI
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o Mini',
    capabilities: ['quick_answer', 'coding', 'budget', 'tools', 'structured_output', 'streaming'],
    contextWindow: 128000,
    costTier: 'low',
    isVerified: true,
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    capabilities: ['deep_reasoning', 'coding', 'tools', 'structured_output', 'streaming'],
    contextWindow: 128000,
    costTier: 'high',
    isVerified: true,
  },
  {
    id: 'o3-mini',
    provider: 'openai',
    displayName: 'o3-mini (Reasoning)',
    capabilities: ['deep_reasoning', 'coding', 'structured_output'],
    contextWindow: 200000,
    costTier: 'medium',
    isVerified: true,
  },

  // Anthropic
  {
    id: 'claude-3-5-haiku-latest',
    provider: 'anthropic',
    displayName: 'Claude 3.5 Haiku',
    capabilities: ['quick_answer', 'coding', 'budget', 'tools', 'streaming'],
    contextWindow: 200000,
    costTier: 'low',
    isVerified: true,
  },
  {
    id: 'claude-3-5-sonnet-latest',
    provider: 'anthropic',
    displayName: 'Claude 3.5 Sonnet',
    capabilities: ['deep_reasoning', 'coding', 'tools', 'streaming'],
    contextWindow: 200000,
    costTier: 'high',
    isVerified: true,
  },

  // xAI (Grok)
  {
    id: 'grok-2-mini',
    provider: 'xai',
    displayName: 'Grok 2 Mini',
    capabilities: ['quick_answer', 'budget', 'streaming'],
    contextWindow: 131072,
    costTier: 'low',
    isVerified: true,
  },
  {
    id: 'grok-2-1212',
    provider: 'xai',
    displayName: 'Grok 2',
    capabilities: ['deep_reasoning', 'coding', 'streaming'],
    contextWindow: 131072,
    costTier: 'medium',
    isVerified: true,
  },

  // OpenRouter
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    provider: 'openrouter',
    displayName: 'Llama 3.3 70B (Free)',
    capabilities: ['quick_answer', 'budget', 'coding'],
    contextWindow: 131072,
    costTier: 'free',
    isVerified: true,
  },
  {
    id: 'deepseek/deepseek-r1',
    provider: 'openrouter',
    displayName: 'DeepSeek R1',
    capabilities: ['deep_reasoning', 'coding', 'budget'],
    contextWindow: 65536,
    costTier: 'low',
    isVerified: true,
  },
];

export function getModelsForProvider(provider: ProviderId): ModelCatalogItem[] {
  return DEFAULT_MODEL_CATALOG.filter(m => m.provider === provider);
}

export function getModelById(provider: ProviderId, modelId: string): ModelCatalogItem | undefined {
  return DEFAULT_MODEL_CATALOG.find(m => m.provider === provider && m.id === modelId);
}

export function findModelsByCapability(capability: ModelCapability): ModelCatalogItem[] {
  return DEFAULT_MODEL_CATALOG.filter(m => m.capabilities.includes(capability));
}
