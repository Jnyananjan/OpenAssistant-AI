// src/memory/memory-engine.ts
import {
  MemoryRecord,
  MemoryCategory,
  MemoryRelationship,
  MemoryGraphData,
  MemoryGraphNode,
  MemoryGraphEdge,
} from './types.js';
import { SupermemoryClient } from './supermemory.js';

export interface MemoryStorageBackend {
  saveMemory(record: Omit<MemoryRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryRecord>;
  updateMemory(id: string, updates: Partial<MemoryRecord>): Promise<MemoryRecord | null>;
  deleteMemory(id: string, userId: string): Promise<boolean>;
  getMemoriesForUser(userId: string, category?: MemoryCategory): Promise<MemoryRecord[]>;
  searchMemories(userId: string, query: string, category?: string): Promise<MemoryRecord[]>;
  getRelationships(userId: string): Promise<MemoryRelationship[]>;
  addRelationship(userId: string, sourceId: string, targetId: string, type: MemoryRelationship['relationType']): Promise<MemoryRelationship>;
  deleteRelationship(id: string, userId: string): Promise<boolean>;
}

export interface MemoryEngineConfig {
  backend: MemoryStorageBackend;
  supermemoryClient?: SupermemoryClient;
}

export class MemoryEngine {
  private readonly backend: MemoryStorageBackend;
  private readonly supermemory?: SupermemoryClient;

  constructor(config: MemoryEngineConfig) {
    this.backend = config.backend;
    this.supermemory = config.supermemoryClient;
  }

  async remember(
    userId: string,
    content: string,
    category: MemoryCategory = 'fact',
    key?: string
  ): Promise<MemoryRecord> {
    const existing = await this.backend.getMemoriesForUser(userId, category);
    
    // Check if there is an existing memory with the exact same key or very similar content
    if (key) {
      const match = existing.find(m => m.isActive && m.key?.toLowerCase() === key.toLowerCase());
      if (match) {
        // Update/supersede existing memory
        const updated = await this.backend.updateMemory(match.id, {
          content,
          updatedAt: new Date().toISOString(),
        });
        if (updated) return updated;
      }
    }

    let externalId: string | undefined;
    if (this.supermemory) {
      const syncResult = await this.supermemory.syncMemory(userId, { content, category, key });
      externalId = syncResult.externalId;
    }

    return this.backend.saveMemory({
      userId,
      category,
      content,
      key,
      confidence: 1.0,
      isActive: true,
      source: 'user',
      externalId,
    });
  }

  async recall(userId: string, query: string, category?: string, limit = 5): Promise<MemoryRecord[]> {
    const localMatches = await this.backend.searchMemories(userId, query, category);
    
    // If Supermemory is configured, fetch external results as well
    if (this.supermemory && localMatches.length < limit) {
      try {
        const externalResults = await this.supermemory.searchMemories(userId, query, limit);
        for (const ext of externalResults) {
          if (!localMatches.some(m => m.content.toLowerCase().includes(ext.content.toLowerCase()))) {
            localMatches.push({
              id: 'supermemory-remote',
              userId,
              category: (category as MemoryCategory) || 'fact',
              content: ext.content,
              confidence: ext.score || 0.8,
              isActive: true,
              source: 'supermemory',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        }
      } catch {
        // Supermemory failed, fallback purely to local without failing
      }
    }

    return localMatches.slice(0, limit);
  }

  async forget(userId: string, query: string): Promise<{ deletedCount: number }> {
    const matches = await this.backend.searchMemories(userId, query);
    let deletedCount = 0;

    for (const match of matches) {
      const success = await this.backend.deleteMemory(match.id, userId);
      if (success) {
        deletedCount++;
        if (match.externalId && this.supermemory) {
          await this.supermemory.deleteMemory(match.externalId).catch(() => {});
        }
      }
    }

    return { deletedCount };
  }

  async getRelevantContext(userId: string, userMessage: string, maxTokens = 500): Promise<Array<{ category: string; content: string; key?: string }>> {
    // Extract keywords from user message
    const words = userMessage.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    const query = words.slice(0, 5).join(' ');

    const memories = await this.recall(userId, query || userMessage, undefined, 5);

    // Limit context length
    let currentLength = 0;
    const bounded: Array<{ category: string; content: string; key?: string }> = [];

    for (const mem of memories) {
      const entryLength = mem.content.length;
      if (currentLength + entryLength > maxTokens * 4) break; // Approximate 4 chars per token
      bounded.push({
        category: mem.category,
        content: mem.content,
        key: mem.key,
      });
      currentLength += entryLength;
    }

    return bounded;
  }

  async buildGraph(userId: string): Promise<MemoryGraphData> {
    const memories = await this.backend.getMemoriesForUser(userId);
    const activeMemories = memories.filter(m => m.isActive);
    const relationships = await this.backend.getRelationships(userId);

    const nodes: MemoryGraphNode[] = activeMemories.map(m => ({
      id: m.id,
      label: m.key || (m.content.length > 25 ? m.content.slice(0, 22) + '...' : m.content),
      category: m.category,
      content: m.content,
      confidence: m.confidence,
      source: m.source,
      updatedAt: m.updatedAt,
    }));

    const edges: MemoryGraphEdge[] = relationships.map(r => ({
      id: r.id,
      source: r.sourceId,
      target: r.targetId,
      relationType: r.relationType,
    }));

    return { nodes, edges };
  }
}
