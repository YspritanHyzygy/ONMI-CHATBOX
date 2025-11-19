/**
 * Grok思维链适配器测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GrokThinkingAdapter } from '../grok-thinking-adapter.js';
import { AIServiceConfig } from '../types.js';

describe('GrokThinkingAdapter', () => {
  let adapter: GrokThinkingAdapter;
  let mockConfig: AIServiceConfig;

  beforeEach(() => {
    adapter = new GrokThinkingAdapter();
    mockConfig = {
      provider: 'xai',
      apiKey: 'test-key',
      model: 'grok-3',
      temperature: 0.7,
      maxTokens: 2000,
    };
  });

  describe('buildThinkingRequest', () => {
    it('should build basic request with reasoning_effort', () => {
      const messages = [
        { role: 'user' as const, content: 'Test message' },
      ];

      const config = {
        ...mockConfig,
        reasoningEffort: 'medium' as const,
      };

      const request = adapter.buildThinkingRequest(messages, config);

      expect(request).toHaveProperty('model', 'grok-3');
      expect(request).toHaveProperty('messages');
      expect(request).toHaveProperty('reasoning_effort', 'medium');
      expect(request).toHaveProperty('max_tokens', 2000);
    });

    it('should build request with reasoning_mode', () => {
      const messages = [
        { role: 'user' as const, content: 'Test message' },
      ];

      const config = {
        ...mockConfig,
        reasoningMode: 'enabled' as const,
      };

      const request = adapter.buildThinkingRequest(messages, config);

      expect(request).toHaveProperty('reasoning_mode', 'enabled');
    });

    it('should build request with both reasoning_effort and reasoning_mode', () => {
      const messages = [
        { role: 'user' as const, content: 'Test message' },
      ];

      const config = {
        ...mockConfig,
        reasoningEffort: 'high' as const,
        reasoningMode: 'enabled' as const,
      };

      const request = adapter.buildThinkingRequest(messages, config);

      expect(request).toHaveProperty('reasoning_effort', 'high');
      expect(request).toHaveProperty('reasoning_mode', 'enabled');
    });

    it('should not include reasoning parameters if not configured', () => {
      const messages = [
        { role: 'user' as const, content: 'Test message' },
      ];

      const request = adapter.buildThinkingRequest(messages, mockConfig);

      expect(request).not.toHaveProperty('reasoning_effort');
      expect(request).not.toHaveProperty('reasoning_mode');
    });
  });

  describe('extractThinking', () => {
    it('should extract thinking from choices[0].message.reasoning_content', () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Final answer',
              reasoning_content: 'Let me think about this...',
              reasoning_effort: 'medium',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          reasoning_tokens: 15,
          total_tokens: 45,
        },
      };

      const thinking = adapter.extractThinking(mockResponse);

      expect(thinking).not.toBeNull();
      expect(thinking?.content).toBe('Let me think about this...');
      expect(thinking?.tokens).toBe(15);
      expect(thinking?.effort).toBe('medium');
    });

    it('should extract thinking from root reasoning_content', () => {
      const mockResponse = {
        reasoning_content: 'Root level thinking content',
        usage: {
          reasoning_tokens: 25,
        },
      };

      const thinking = adapter.extractThinking(mockResponse);

      expect(thinking).not.toBeNull();
      expect(thinking?.content).toBe('Root level thinking content');
      expect(thinking?.tokens).toBe(25);
    });

    it('should return null if no thinking content', () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Final answer',
            },
            finish_reason: 'stop',
          },
        ],
      };

      const thinking = adapter.extractThinking(mockResponse);

      expect(thinking).toBeNull();
    });

    it('should handle missing usage data', () => {
      const mockResponse = {
        choices: [
          {
            message: {
              reasoning_content: 'Thinking without usage data',
            },
          },
        ],
      };

      const thinking = adapter.extractThinking(mockResponse);

      expect(thinking).not.toBeNull();
      expect(thinking?.content).toBe('Thinking without usage data');
      expect(thinking?.tokens).toBeUndefined();
    });
  });

  describe('extractStreamThinking', () => {
    it('should extract thinking from stream delta', () => {
      const mockChunk = {
        choices: [
          {
            delta: {
              reasoning_content: 'Streaming thinking...',
            },
            finish_reason: null,
          },
        ],
      };

      const result = adapter.extractStreamThinking(mockChunk);

      expect(result.thinking).toBe('Streaming thinking...');
      expect(result.done).toBe(false);
    });

    it('should extract content from stream delta', () => {
      const mockChunk = {
        choices: [
          {
            delta: {
              content: 'Streaming content...',
            },
            finish_reason: null,
          },
        ],
      };

      const result = adapter.extractStreamThinking(mockChunk);

      expect(result.content).toBe('Streaming content...');
      expect(result.done).toBe(false);
    });

    it('should detect stream completion', () => {
      const mockChunk = {
        choices: [
          {
            delta: {},
            finish_reason: 'stop',
          },
        ],
      };

      const result = adapter.extractStreamThinking(mockChunk);

      expect(result.done).toBe(true);
    });

    it('should handle empty chunk', () => {
      const result = adapter.extractStreamThinking({});

      expect(result.done).toBe(false);
      expect(result.thinking).toBeUndefined();
      expect(result.content).toBeUndefined();
    });
  });

  describe('prepareContextWithThinking', () => {
    it('should strip reasoning_content from messages', () => {
      const messages = [
        { role: 'user' as const, content: 'Question' },
        { role: 'assistant' as const, content: 'Answer' },
      ];

      const result = adapter.prepareContextWithThinking(messages);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: 'Question' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Answer' });
    });
  });

  describe('supportsThinking', () => {
    it('should return true for Grok 3', () => {
      expect(adapter.supportsThinking('grok-3')).toBe(true);
      expect(adapter.supportsThinking('Grok-3')).toBe(true);
    });

    it('should return true for Grok 3 mini', () => {
      expect(adapter.supportsThinking('grok-3-mini')).toBe(true);
    });

    it('should return true for Grok 4', () => {
      expect(adapter.supportsThinking('grok-4')).toBe(true);
    });

    it('should return true for Grok 5', () => {
      expect(adapter.supportsThinking('grok-5')).toBe(true);
    });

    it('should return true for models with "think" keyword', () => {
      expect(adapter.supportsThinking('grok-think-v1')).toBe(true);
    });

    it('should return false for Grok 2', () => {
      expect(adapter.supportsThinking('grok-2')).toBe(false);
      expect(adapter.supportsThinking('grok-2-1212')).toBe(false);
    });

    it('should return false for non-Grok models', () => {
      expect(adapter.supportsThinking('gpt-4')).toBe(false);
    });
  });

  describe('getRecommendedConfig', () => {
    it('should return config for Grok 3 mini', () => {
      const config = adapter.getRecommendedConfig('grok-3-mini');

      expect(config.reasoningEffort).toBe('low');
      expect(config.reasoningMode).toBe('auto');
      expect(config.maxTokens).toBe(16000);
    });

    it('should return config for Grok 3', () => {
      const config = adapter.getRecommendedConfig('grok-3');

      expect(config.reasoningEffort).toBe('medium');
      expect(config.reasoningMode).toBe('enabled');
      expect(config.maxTokens).toBe(32000);
    });

    it('should return empty config for non-thinking models', () => {
      const config = adapter.getRecommendedConfig('grok-2');

      expect(Object.keys(config)).toHaveLength(0);
    });
  });

  describe('validateReasoningConfig', () => {
    it('should validate correct reasoning_effort', () => {
      const config = {
        ...mockConfig,
        model: 'grok-3',
        reasoningEffort: 'medium' as const,
      };

      const result = adapter.validateReasoningConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn about invalid reasoning_effort', () => {
      const config = {
        ...mockConfig,
        model: 'grok-3',
        reasoningEffort: 'invalid' as any,
      };

      const result = adapter.validateReasoningConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Invalid reasoning_effort');
    });

    it('should warn about invalid reasoning_mode', () => {
      const config = {
        ...mockConfig,
        model: 'grok-3',
        reasoningMode: 'invalid' as any,
      };

      const result = adapter.validateReasoningConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Invalid reasoning_mode');
    });

    it('should warn about excessive maxTokens', () => {
      const config = {
        ...mockConfig,
        model: 'grok-3',
        maxTokens: 200000,
      };

      const result = adapter.validateReasoningConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('exceeds');
    });

    it('should warn when reasoning_mode is disabled', () => {
      const config = {
        ...mockConfig,
        model: 'grok-3',
        reasoningMode: 'disabled' as const,
      };

      const result = adapter.validateReasoningConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('disabled');
    });

    it('should not validate non-thinking models', () => {
      const config = {
        ...mockConfig,
        model: 'grok-2',
        reasoningEffort: 'invalid' as any,
      };

      const result = adapter.validateReasoningConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('getReasoningModeDescription', () => {
    it('should return description for enabled mode', () => {
      const desc = adapter.getReasoningModeDescription('enabled');
      expect(desc).toContain('Always use');
    });

    it('should return description for auto mode', () => {
      const desc = adapter.getReasoningModeDescription('auto');
      expect(desc).toContain('Automatically decide');
    });

    it('should return description for disabled mode', () => {
      const desc = adapter.getReasoningModeDescription('disabled');
      expect(desc).toContain('Disable');
    });

    it('should return unknown for invalid mode', () => {
      const desc = adapter.getReasoningModeDescription('invalid');
      expect(desc).toContain('Unknown');
    });
  });

  describe('getReasoningEffortDescription', () => {
    it('should return description for all effort levels', () => {
      expect(adapter.getReasoningEffortDescription('minimal')).toContain('Minimal');
      expect(adapter.getReasoningEffortDescription('low')).toContain('Low');
      expect(adapter.getReasoningEffortDescription('medium')).toContain('Medium');
      expect(adapter.getReasoningEffortDescription('high')).toContain('High');
    });

    it('should return unknown for invalid effort', () => {
      const desc = adapter.getReasoningEffortDescription('invalid');
      expect(desc).toContain('Unknown');
    });
  });
});
