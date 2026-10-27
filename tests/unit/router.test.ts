// tests/unit/router.test.ts
import { describe, it, expect } from 'vitest';
import { SmartModelRouter, UserRoutingPreferences, UserCredentialRecord } from '../../src/ai/router.js';

describe('SmartModelRouter', () => {
  const router = new SmartModelRouter();

  const mockCreds: UserCredentialRecord[] = [
    {
      provider: 'openai',
      isActive: true,
      credentials: { apiKey: 'sk-mock-openai' },
    },
    {
      provider: 'gemini',
      isActive: true,
      credentials: { apiKey: 'mock-gemini-key' },
    },
    {
      provider: 'anthropic',
      isActive: false, // inactive
      credentials: { apiKey: 'mock-anthropic-key' },
    },
  ];

  it('selects quick_answer low-latency model in quick_answer mode', () => {
    const prefs: UserRoutingPreferences = {
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o',
      routingMode: 'quick_answer',
    };

    const route = router.selectRoute('Quick question', prefs, mockCreds);
    expect(route.provider).toBeDefined();
    // In our catalog, gemini-3.8-flash or gpt-4o-mini have quick_answer capability
    expect(['gemini-3.8-flash', 'gpt-4o-mini']).toContain(route.model);
  });

  it('selects deep_reasoning model in deep_reasoning mode', () => {
    const prefs: UserRoutingPreferences = {
      defaultProvider: 'gemini',
      defaultModel: 'gemini-3.8-flash',
      routingMode: 'deep_reasoning',
    };

    const route = router.selectRoute('Help me design a database schema', prefs, mockCreds);
    expect(['gemini-3.8-pro', 'gpt-4o', 'o3-mini']).toContain(route.model);
  });

  it('routes to custom coding rule when coding keywords are detected', () => {
    const prefs: UserRoutingPreferences = {
      defaultProvider: 'gemini',
      defaultModel: 'gemini-3.8-flash',
      routingMode: 'best_available',
      taskRules: {
        coding: {
          provider: 'openai',
          model: 'gpt-4o',
        },
      },
    };

    const route = router.selectRoute('Fix this typescript function bug in my code', prefs, mockCreds);
    expect(route.provider).toBe('openai');
    expect(route.model).toBe('gpt-4o');
  });

  it('strictly adheres to manual mode settings', () => {
    const prefs: UserRoutingPreferences = {
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o-mini',
      routingMode: 'manual',
    };

    const route = router.selectRoute('Complex strategic plan', prefs, mockCreds);
    expect(route.provider).toBe('openai');
    expect(route.model).toBe('gpt-4o-mini');
  });

  it('rejects routing if user has no active credentials', () => {
    const prefs: UserRoutingPreferences = {
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o',
      routingMode: 'best_available',
    };

    expect(() => router.selectRoute('Test', prefs, [])).toThrow(/No active AI providers/);
  });
});
