import type { z } from "zod";
export interface Preferences {
  allowedUsers: string[];
  timezone: string;
  maxFollowUps: number;
}
export interface LocalConfig {
  credentials: Record<string, string>;
  encryptionSecret: string;
  workerSecret: string;
  settings: Preferences;
  webhookUrl: string | null;
}
export const settingsSchema: z.ZodType<Preferences>;
export const webhookSchema: z.ZodType<{ url: string; handlerReady: true }>;
export const fields: string[];
export function initialConfig(
  credentials: Record<string, string>,
  settings: Preferences,
): LocalConfig;
export function updateConfig(
  current: LocalConfig,
  credentials: Record<string, string>,
  settings: Preferences,
): LocalConfig;
export function seal(config: LocalConfig, passphrase: string): string;
export function unseal(envelope: string, passphrase: string): LocalConfig;
export function readConfig(directory: string, passphrase: string): Promise<LocalConfig>;
export function writeConfig(
  directory: string,
  config: LocalConfig,
  passphrase: string,
): Promise<void>;
export function publicConfig(config: LocalConfig): {
  credentials: { name: string; configured: boolean }[];
  settings: Preferences;
  encryptionConfigured: boolean;
  workerConfigured: boolean;
  webhookUrl: string | null;
};
export function permittedRequest(
  host: string | undefined,
  origin: string | undefined,
  origins: string[],
  port: number,
): boolean;
export function telegram(config: LocalConfig, method: string, body?: unknown): Promise<unknown>;
export function management(config: LocalConfig, path: string, body?: unknown): Promise<unknown>;
export function inspectDatabase(
  config: LocalConfig,
): Promise<{ tables: string[]; extensions: string[] }>;
