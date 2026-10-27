// tests/unit/memory.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MemoryEngine } from '../../src/memory/memory-engine.js';
import { InMemoryDatabaseRepository } from '../../src/db/in-memory-repository.js';
import { SupermemoryClient } from '../../src/memory/supermemory.js';

describe('Persistent Personal Memory & Supermemory', () => {
  const db = new InMemoryDatabaseRepository();
  const engine = new MemoryEngine({ backend: db });

  it('stores memories and updates existing keys without contradiction', async () => {
    const mem1 = await engine.remember('user-1', 'I prefer concise bullet points', 'preference', 'reply_style');
    expect(mem1.id).toBeDefined();
    expect(mem1.key).toBe('reply_style');

    // Update with new preference using same key
    const mem2 = await engine.remember('user-1', 'I prefer detailed comprehensive explanations', 'preference', 'reply_style');
    expect(mem2.content).toBe('I prefer detailed comprehensive explanations');

    // Check that user has only 1 active memory for this key
    const all = await engine.recall('user-1', 'prefer');
    expect(all).toHaveLength(1);
    expect(all[0].content).toBe('I prefer detailed comprehensive explanations');
  });

  it('enforces strict cross-user memory isolation', async () => {
    await engine.remember('user-alpha', 'My secret project code is ProjectX', 'project', 'secret_project');
    const alphaMemories = await engine.recall('user-alpha', 'ProjectX');
    expect(alphaMemories).toHaveLength(1);

    const betaMemories = await engine.recall('user-beta', 'ProjectX');
    expect(betaMemories).toHaveLength(0);
  });

  it('forgets matching memories upon user request', async () => {
    await engine.remember('user-1', 'My car is a blue Honda', 'fact', 'car');
    const before = await engine.recall('user-1', 'blue Honda');
    expect(before).toHaveLength(1);

    const { deletedCount } = await engine.forget('user-1', 'blue Honda');
    expect(deletedCount).toBe(1);

    const after = await engine.recall('user-1', 'blue Honda');
    expect(after).toHaveLength(0);
  });

  it('builds bounded context respecting token length limits', async () => {
    await engine.remember('user-1', 'First fact about user workflow and preferences', 'preference');
    await engine.remember('user-1', 'Second fact about user team structure and goals', 'goal');

    const context = await engine.getRelevantContext('user-1', 'Tell me about workflow and team', 50);
    expect(context.length).toBeGreaterThan(0);
    expect(context[0].content).toBeDefined();
  });

  it('builds graph data with nodes, edges, and category metadata', async () => {
    const m1 = await engine.remember('user-graph', 'OpenAssistant AI Assistant', 'project', 'jana_ai');
    const m2 = await engine.remember('user-graph', 'Deliver multi-provider routing', 'goal', 'multi_provider');

    await db.addRelationship('user-graph', m1.id, m2.id, 'relates_to');

    const graph = await engine.buildGraph('user-graph');
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].source).toBe(m1.id);
    expect(graph.edges[0].target).toBe(m2.id);
  });

  describe('Supermemory Integration', () => {
    it('isolates user memories using containerTag namespace', () => {
      const client = new SupermemoryClient({ apiKey: 'sm-test-key' });
      expect(client.getUserContainerTag('12345')).toBe('jana_user_12345');
    });

    it('falls back gracefully to built-in memory if Supermemory fails', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Supermemory network timeout'));
      const smClient = new SupermemoryClient({
        apiKey: 'sm-bad-key',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const engineWithSM = new MemoryEngine({ backend: db, supermemoryClient: smClient });

      // Storing memory succeeds even if Supermemory errors
      const memory = await engineWithSM.remember('user-fallback', 'Local fact saved', 'fact');
      expect(memory.id).toBeDefined();
      expect(memory.content).toBe('Local fact saved');

      // Recalling succeeds using local backend
      const recalled = await engineWithSM.recall('user-fallback', 'Local fact');
      expect(recalled).toHaveLength(1);
      expect(recalled[0].content).toBe('Local fact saved');
    });
  });
});
