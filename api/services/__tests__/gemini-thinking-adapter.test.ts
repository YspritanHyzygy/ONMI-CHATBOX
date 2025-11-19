/**
 * Gemini思维链适配器测试
 */

import { describe, it, expect } from 'vitest';
import { GeminiThinkingAdapter } from '../gemini-thinking-adapter.js';
import { AIServiceConfig, ChatMessage } from '../types.js';

describe('GeminiThinkingAdapter', () => {
  const adapter = new GeminiThinkingAdapter();

  describe('supportsThinking', () => {
    it('should return true for gemini-2.0-flash-thinking models', () => {
      expect(adapter.supportsThinking('gemini-2.0-flash-thinking-exp')).toBe(true);
      expect(adapter.supportsThinking('gemini-2-flash-thinking')).toBe(true);
    });

    it('should return true for gemini-2.5 thinking models', () => {
      expect(adapter.supportsThinking('gemini-2.5-thinking')).toBe(true);
    });

    it('should return true for thinking-exp models', () => {
      expect(adapter.supportsThinking('thinking-exp')).toBe(true);
    });

    it('should return false for non-thinking models', () => {
      expect(adapter.supportsThinking('gemini-pro')).toBe(false);
      expect(adapter.supportsThinking('gemini-1.5-flash')).toBe(false);
    });
  });

  describe('buildThinkingRequest', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'How are you?' }
    ];

    it('should build basic request with contents', () => {
      const config: AIServiceConfig = {
        provider: 'gemini',
        model: 'gemini-2.0-flash-thinking-exp',
        apiKey: 'test-key'
      };

      const request = adapter.buildThinkingRequest(messages, config);

      expect(request).toHaveProperty('contents');
      expect(request.contents).toBeInstanceOf(Array);
      expect(request.contents).toHaveLength(3);
    });

    it('should convert assistant role to model', () => {
      const config: AIServiceConfig = {
        provider: 'gemini',
        model: 'gemini-2.0-flash-thinking-exp',
        apiKey: 'test-key'
      };

      const request = adapter.buildThinkingRequest(messages, config);

      expect(request.contents[1].role).toBe('model');
    });

    it('should add thinkingBudget parameter in thinkingConfig', () => {
      const config: AIServiceConfig = {
        provider: 'gemini',
        model: 'gemini-2.0-flash-thinking-exp',
        apiKey: 'test-key',
        thinkingBudget: 5000
      };

      const request = adapter.buildThinkingRequest(messages, config);

      expect(request.generationConfig.thinkingConfig).toBeDefined();
      expect(request.generationConfig.thinkingConfig.thinkingBudget).toBe(5000);
    });

    it('should add includeThoughts parameter in thinkingConfig', () => {
      const config: AIServiceConfig = {
        provider: 'gemini',
        model: 'gemini-2.0-flash-thinking-exp',
        apiKey: 'test-key',
        includeThoughts: true
      };

      const request = adapter.buildThinkingRequest(messages, config);

      expect(request.generationConfig.thinkingConfig).toBeDefined();
      expect(request.generationConfig.thinkingConfig.includeThoughts).toBe(true);
    });

    it('should add thoughtSignatures parameter', () => {
      const config: AIServiceConfig = {
        provider: 'gemini',
        model: 'gemini-2.0-flash-thinking-exp',
        apiKey: 'test-key',
        thoughtSignatures: 'test-signature-123'
      };

      const request = adapter.buildThinkingRequest(messages, config);

      expect(request.thoughtSignatures).toBe('test-signature-123');
    });

    it('should handle system messages', () => {
      const messagesWithSystem: ChatMessage[] = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' }
      ];

      const config: AIServiceConfig = {
        provider: 'gemini',
        model: 'gemini-2.0-flash-thinking-exp',
        apiKey: 'test-key'
      };

      const request = adapter.buildThinkingRequest(messagesWithSystem, config);

      // System message should be converted to user message
      expect(request.contents[0].role).toBe('user');
      expect(request.contents).toHaveLength(2);
    });
  });

  describe('extractThinking', () => {
    it('should extract thinking from candidates with thought parts', () => {
      const response = {
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: 'First thought' },
                { thought: true, text: 'Second thought' },
                { thought: false, text: 'Final answer' }
              ]
            }
          }
        ],
        thoughtSignatures: 'signature-abc',
        usageMetadata: {
          thoughtsTokenCount: 150
        }
      };

      const thinking = adapter.extractThinking(response);

      expect(thinking).not.toBeNull();
      expect(thinking?.content).toBe('First thought\nSecond thought');
      expect(thinking?.signature).toBe('signature-abc');
      expect(thinking?.tokens).toBe(150);
    });

    it('should return null if no thinking content', () => {
      const response = {
        candidates: [
          {
            content: {
              parts: [
                { text: 'Just a regular answer' }
              ]
            }
          }
        ]
      };

      const thinking = adapter.extractThinking(response);

      expect(thinking).toBeNull();
    });

    it('should handle missing candidates', () => {
      const response = {
        candidates: []
      };

      const thinking = adapter.extractThinking(response);

      expect(thinking).toBeNull();
    });
  });

  describe('extractStreamThinking', () => {
    it('should extract thinking and content from stream chunk', () => {
      const chunk = {
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: 'Thinking...' },
                { thought: false, text: 'Answer...' }
              ]
            },
            finishReason: null
          }
        ]
      };

      const result = adapter.extractStreamThinking(chunk);

      expect(result.thinking).toBe('Thinking...');
      expect(result.content).toBe('Answer...');
      expect(result.done).toBe(false);
    });

    it('should detect completion with STOP finish reason', () => {
      const chunk = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Final' }]
            },
            finishReason: 'STOP'
          }
        ]
      };

      const result = adapter.extractStreamThinking(chunk);

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
    it('should return messages without thinking content', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Question 1' },
        { role: 'assistant', content: 'Answer 1' }
      ];

      const result = adapter.prepareContextWithThinking(messages);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: 'Question 1' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Answer 1' });
    });
  });

  describe('validateThinkingConfig', () => {
    it('should pass validation for valid config', () => {
      const config: AIServiceConfig = {
        provider: 'gemini',
        model: 'gemini-2.0-flash-thinking-exp',
        apiKey: 'test-key',
        thinkingBudget: -1,
        includeThoughts: true
      };

      const result = adapter.validateThinkingConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn about invalid thinkingBudget', () => {
      const config: AIServiceConfig = {
        provider: 'gemini',
        model: 'gemini-2.0-flash-thinking-exp',
        apiKey: 'test-key',
        thinkingBudget: -5
      };

      const result = adapter.validateThinkingConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should warn when includeThoughts is false', () => {
      const config: AIServiceConfig = {
        provider: 'gemini',
        model: 'gemini-2.0-flash-thinking-exp',
        apiKey: 'test-key',
        includeThoughts: false
      };

      const result = adapter.validateThinkingConfig(config);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('includeThoughts');
    });
  });

  describe('getSuggestedThinkingBudget', () => {
    it('should return appropriate budget for task complexity', () => {
      expect(adapter.getSuggestedThinkingBudget('simple')).toBe(2000);
      expect(adapter.getSuggestedThinkingBudget('medium')).toBe(8000);
      expect(adapter.getSuggestedThinkingBudget('complex')).toBe(-1);
    });
  });
});
