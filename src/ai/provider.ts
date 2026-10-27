// src/ai/provider.ts
import { AssistantIntent } from './intent-schema.js';

export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'xai' | 'openrouter';

export interface ProviderCredentials {
  apiKey: string;
  baseUrl?: string;
  organizationId?: string;
}

export type ModelCapability = 
  | 'quick_answer'
  | 'deep_reasoning'
  | 'coding'
  | 'budget'
  | 'tools'
  | 'structured_output'
  | 'streaming';

export interface ModelCatalogItem {
  id: string;
  provider: ProviderId;
  displayName: string;
  capabilities: ModelCapability[];
  contextWindow?: number;
  costTier: 'free' | 'low' | 'medium' | 'high';
  pricing?: {
    promptPer1k?: number;
    completionPer1k?: number;
  };
  isVerified?: boolean;
}

export interface ProviderGenerateInput {
  credentials: ProviderCredentials;
  modelId: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export interface ProviderGenerateOutput {
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  latencyMs: number;
}

export interface InterpretMessageInput {
  userMessage: string;
  userTimezone: string;
  referenceTime: Date;
  existingTasks?: Array<{ id: string; title: string; due_at: string | null }>;
  memories?: Array<{ category: string; content: string; key?: string }>;
  conversationContext?: string;
}

export interface AIProviderAdapter {
  readonly id: ProviderId;
  readonly displayName: string;
  validateCredentials(credentials: ProviderCredentials): Promise<{ valid: boolean; error?: string }>;
  listModels(credentials: ProviderCredentials): Promise<ModelCatalogItem[]>;
  testModel(credentials: ProviderCredentials, modelId: string): Promise<{ success: boolean; latencyMs: number; error?: string }>;
  generate(input: ProviderGenerateInput): Promise<ProviderGenerateOutput>;
  interpretMessage(
    input: InterpretMessageInput,
    credentials: ProviderCredentials,
    modelId?: string
  ): Promise<AssistantIntent>;
}

export interface AIProvider {
  interpretMessage(input: InterpretMessageInput): Promise<AssistantIntent>;
}
