/**
 * The bundled baseline model-parameter data must load and validate for every
 * provider. (These files were silently missing for months because .gitignore's
 * bare "data/" pattern swallowed them.)
 */
import { describe, it, expect } from 'vitest';
import { StaticDataManager } from '../static-manager';

describe('StaticDataManager baseline data', () => {
  it('loads bundled config for all five providers', async () => {
    const manager = new StaticDataManager();
    await manager.initialize();

    const stats = manager.getCacheStats();
    for (const provider of ['openai', 'claude', 'gemini', 'ollama', 'xai']) {
      expect(stats.providers, `provider ${provider} should be loaded`).toContain(provider);
      expect(stats.providerCounts[provider], `provider ${provider} should have models`).toBeGreaterThan(0);
    }
  });

  it('returns real limits for the default models instead of generic fallbacks', async () => {
    const manager = new StaticDataManager();
    await manager.initialize();

    const sonnet = await manager.getModelParameters('claude', 'claude-sonnet-5');
    expect(sonnet?.limits.maxTokens?.max).toBe(64000);

    const flash = await manager.getModelParameters('gemini', 'gemini-3.5-flash');
    expect(flash?.limits.maxTokens?.max).toBe(65536);
  });
});
