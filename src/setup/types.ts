// src/setup/types.ts

export interface ToolCheckResult {
  installed: boolean;
  version?: string;
  path?: string;
  error?: string;
}

export interface PrerequisitesResult {
  node: ToolCheckResult;
  npm: ToolCheckResult;
  supabase: ToolCheckResult;
  allSatisfied: boolean;
  projectConfigured: boolean;
  currentProjectRef?: string;
}

export interface SetupConfig {
  supabaseProjectRef: string;
  supabaseAccessToken?: string;
  supabaseDbPassword?: string;
  telegramBotToken: string;
  telegramUserId: string;
  telegramWebhookSecret?: string;
  geminiApiKey: string;
  geminiModel?: string;
  defaultTimezone?: string;
  workerSecret?: string;
}

export interface TelegramValidationResult {
  valid: boolean;
  botId?: number;
  botUsername?: string;
  botName?: string;
  error?: string;
}

export interface GeminiValidationResult {
  valid: boolean;
  model?: string;
  error?: string;
}

export interface GeminiModelsResult {
  valid: boolean;
  models?: string[];
  error?: string;
}

export interface SupabaseValidationResult {
  valid: boolean;
  projectRef?: string;
  projectUrl?: string;
  error?: string;
}

export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface DeploymentStep {
  id: string;
  title: string;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  logs: string[];
  error?: string;
}

export interface DeploymentProgress {
  sessionId: string;
  inProgress: boolean;
  completed: boolean;
  success: boolean;
  startedAt?: string;
  completedAt?: string;
  steps: DeploymentStep[];
  currentStepIndex: number;
}
