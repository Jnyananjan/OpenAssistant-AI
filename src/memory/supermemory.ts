// src/memory/supermemory.ts
import { MemoryRecord, MemoryCategory } from './types.js';

export interface SupermemoryConfig {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class SupermemoryClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(config: SupermemoryConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.supermemory.ai/v1';
    this.fetch = config.fetchFn || globalThis.fetch.bind(globalThis);
  }

  getUserContainerTag(userId: string): string {
    return `jana_user_${userId}`;
  }

  async validateKey(): Promise<{ valid: boolean; error?: string }> {
    try {
      const res = await this.fetch(`${this.baseUrl}/memories?limit=1`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) {
        return { valid: false, error: `Supermemory API error ${res.status}` };
      }
      return { valid: true };
    } catch (err: unknown) {
      return { valid: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async syncMemory(
    userId: string,
    memory: { content: string; category: MemoryCategory; key?: string }
  ): Promise<{ externalId?: string; error?: string }> {
    try {
      const containerTag = this.getUserContainerTag(userId);
      const res = await this.fetch(`${this.baseUrl}/memories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          content: memory.content,
          containerTags: [containerTag],
          metadata: {
            category: memory.category,
            key: memory.key || '',
            source: 'jana_ai',
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { error: `Failed to sync with Supermemory: ${res.status} ${text}` };
      }

      const data = await res.json() as { id?: string; memoryId?: string };
      return { externalId: data.id || data.memoryId };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  async searchMemories(userId: string, query: string, limit = 5): Promise<Array<{ content: string; score?: number }>> {
    try {
      const containerTag = this.getUserContainerTag(userId);
      const res = await this.fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          q: query,
          containerTags: [containerTag],
          limit,
        }),
      });

      if (!res.ok) return [];
      const data = await res.json() as { results?: Array<{ content?: string; text?: string; score?: number }> };
      return (data.results || []).map(r => ({
        content: r.content || r.text || '',
        score: r.score,
      }));
    } catch {
      return [];
    }
  }

  async deleteMemory(memoryId: string): Promise<boolean> {
    try {
      const res = await this.fetch(`${this.baseUrl}/memories/${memoryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
