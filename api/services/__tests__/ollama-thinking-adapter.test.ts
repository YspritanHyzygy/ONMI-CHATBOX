/**
 * Ollama思维链适配器单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OllamaThinkingAdapter } from '../ollama-thinking-adapter.js';
import { AIServiceConfig, ChatMessage } from '../types.js';

describe('OllamaThinkingAdapter', () => {
  let adapter: OllamaThinkingAdapter;

  beforeEach(() => {
    adapter = new OllamaThinkingAdapter();
  });

  describe('provider', () => {
    it('should have correct provider name', () => {
      expect(adapter.provider).toBe('ollama');
    });
  });

  describe('buildThinkingRequest', () => {
    it('should build basic request with thinking enabled', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'What is 2+2?' },
      ];

      const config: AIServiceConfig = {
        provider: 'ollama',
        apiKey: 'test-key',
        model: 'deepseek-r1',
        enableThinking: true,
      };

      const request = adapter.buildThinkingRequest(messages, config);

      expect(request.model).toBe('deepseek-r1');
      expect(request.think).toBe(true);
      expect(request.messages).toHaveLength(1);
      expect(request.messages[0].content).toBe('What is 2+2?');
    });

    it('should convert maxTokens to num_predict', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Test' },
      ];

      const config: AIServiceConfig = {
        provider: 'ollama',
        apiKey: 'test-key',
        model: 'deepseek-r1',
        maxTokens: 4096,
      };

      const request = adapter.buildThinkingRequest(messages, config);

      expect(request.max_tokens).toBeUndefined();
      expect(request.options?.num_predict).toBe(4096);
    });

    it('should add numCtx parameter', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Test' },
      ];

      const config: AIServiceConfig = {
        provider: 'ollama',
        apiKey: 'test-key',
        model: 'deepseek-r1',
        numCtx: 32768,
      };

      const request = adapter.buildThinkingRequest(messages, config);

      expect(request.options?.num_ctx).toBe(32768);
    });

    it('should add repeatPenalty parameter', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Test' },
      ];

      const config: AIServiceConfig = {
        provider: 'ollama',
        apiKey: 'test-key',
        model: 'deepseek-r1',
        repeatPenalty: 1.1,
      };

      const request = adapter.buildThinkingRequest(messages, config);

      expect(request.options?.repeat_penalty).toBe(1.1);
    });

    it('should add hideThinking parameter', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Test' },
      ];

      const config: AIServiceConfig = {
        provider: 'ollama',
        apiKey: 'test-key',
        model: 'deepseek-r1',
        enableThinking: true,
        hideThinking: true,
      };

      const request = adapter.buildThinkingRequest(messages, config);

      expect(request.think).toBe(true);
      expect(request.hidethinking).toBe(true);
    });

    it('should include temperature parameter', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Test' },
      ];

      const config: AIServiceConfig = {
        provider: 'ollama',
        apiKey: 'test-key',
        model: 'deepseek-r1',
        temperature: 0.7,
      };

      const request = adapter.buildThinkingRequest(messages, config);

      expect(request.temperature).toBe(0.7);
    });
  });

  describe('extractThinking', () => {
    it('should extract thinking from message.reasoning_content (DeepSeek-R1 format)', () => {
      const response = {
        model: 'deepseek-r1',
        message: {
          role: 'assistant',
          content: 'The answer is 4.',
          reasoning_content: 'Let me think step by step:\n1. We have 2+2\n2. Adding them gives us 4',
        },
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          reasoning_tokens: 15,
          total_tokens: 30,
        },
      };

      const thinking = adapter.extractThinking(response);

      expect(thinking).not.toBeNull();
      expect(thinking?.content).toBe('Let me think step by step:\n1. We have 2+2\n2. Adding them gives us 4');
      expect(thinking?.tokens).toBe(15);
      expect(thinking?.providerData?.type).toBe('ollama_reasoning_content');
      expect(thinking?.providerData?.model).toBe('deepseek-r1');
    });

    it('should extract thinking from message.thinking format', () => {
      const response = {
        model: 'qwen-think',
        message: {
          role: 'assistant',
          content: 'The answer is 4.',
          thinking: 'Analyzing the problem: 2+2 equals 4',
        },
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          thinking_tokens: 12,
          total_tokens: 30,
        },
      };

      const thinking = adapter.extractThinking(response);

      expect(thinking).not.toBeNull();
      expect(thinking?.content).toBe('Analyzing the problem: 2+2 equals 4');
      expect(thinking?.tokens).toBe(12);
      expect(thinking?.providerData?.type).toBe('ollama_thinking');
    });

    it('should extract thinking from root reasoning_content', () => {
      const response = {
        model: 'deepseek-r1',
        reasoning_content: 'Root level reasoning content',
        message: {
          role: 'assistant',
          content: 'Answer',
        },
        usage: {
          reasoning_tokens: 10,
        },
      };

      const thinking = adapter.extractThinking(response);

      expect(thinking).not.toBeNull();
      expect(thinking?.content).toBe('Root level reasoning content');
      expect(thinking?.tokens).toBe(10);
    });

    it('should return null when no thinking content exists', () => {
      const response = {
        model: 'llama3',
        message: {
          role: 'assistant',
          content: 'Just a regular answer',
        },
      };

      const thinking = adapter.extractThinking(response);

      expect(thinking).toBeNull();
    });

    it('should return null for invalid response', () => {
      expect(adapter.extractThinking(null)).toBeNull();
      expect(adapter.extractThinking(undefined)).toBeNull();
      expect(adapter.extractThinking('invalid')).toBeNull();
    });
  });

  describe('extractStreamThinking', () => {
    it('should extract thinking from streaming message.reasoning_content', () => {
      const chunk = {
        model: 'deepseek-r1',
        message: {
          reasoning_content: 'Step 1: ',
        },
        done: false,
      };

      const result = adapter.extractStreamThinking(chunk);

      expect(result.thinking).toBe('Step 1: ');
      expect(result.content).toBeUndefined();
      expect(result.done).toBe(false);
    });

    it('should extract thinking from streaming message.thinking', () => {
      const chunk = {
        model: 'qwen-think',
        message: {
          thinking: 'Analyzing... ',
        },
        done: false,
      };

      const result = adapter.extractStreamThinking(chunk);

      expect(result.thinking).toBe('Analyzing... ');
      expect(result.content).toBeUndefined();
      expect(result.done).toBe(false);
    });

    it('should extract content from streaming message.content', () => {
      const chunk = {
        model: 'deepseek-r1',
        message: {
          content: 'The answer is ',
        },
        done: false,
      };

      const result = adapter.extractStreamThinking(chunk);

      expect(result.thinking).toBeUndefined();
      expect(result.content).toBe('The answer is ');
      expect(result.done).toBe(false);
    });

    it('should handle delta format for reasoning_content', () => {
      const chunk = {
        model: 'deepseek-r1',
        message: {
          delta: {
            reasoning_content: 'Delta reasoning ',
          },
        },
        done: false,
      };

      const result = adapter.extractStreamThinking(chunk);

      expect(result.thinking).toBe('Delta reasoning ');
      expect(result.done).toBe(false);
    });

    it('should handle delta format for thinking', () => {
      const chunk = {
        model: 'qwen-think',
        message: {
          delta: {
            thinking: 'Delta thinking ',
          },
        },
        done: false,
      };

      const result = adapter.extractStreamThinking(chunk);

      expect(result.thinking).toBe('Delta thinking ');
      expect(result.done).toBe(false);
    });

    it('should handle delta format for content', () => {
      const chunk = {
        model: 'deepseek-r1',
        message: {
          delta: {
            content: 'Delta content ',
          },
        },
        done: false,
      };

      const result = adapter.extractStreamThinking(chunk);

      expect(result.content).toBe('Delta content ');
      expect(result.done).toBe(false);
    });

    it('should handle done flag', () => {
      const chunk = {
        model: 'deepseek-r1',
        message: {
          content: 'Final answer.',
        },
        done: true,
      };

      const result = adapter.extractStreamThinking(chunk);

      expect(result.content).toBe('Final answer.');
      expect(result.done).toBe(true);
    });

    it('should handle chunk without message', () => {
      const chunk = {
        done: true,
      };

      const result = adapter.extractStreamThinking(chunk);

      expect(result.thinking).toBeUndefined();
      expect(result.content).toBeUndefined();
      expect(result.done).toBe(true);
    });

    it('should handle invalid chunk', () => {
      expect(adapter.extractStreamThinking(null).done).toBe(false);
      expect(adapter.extractStreamThinking(undefined).done).toBe(false);
    });
  });

  describe('prepareContextWithThinking', () => {
    it('should exclude reasoning_content from context messages', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Question 1' },
        { role: 'assistant', content: 'Answer 1' },
        { role: 'user', content: 'Question 2' },
      ];

      const result = adapter.prepareContextWithThinking(messages);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ role: 'user', content: 'Question 1' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Answer 1' });
      expect(result[2]).toEqual({ role: 'user', content: 'Question 2' });
    });

    it('should strip any additional fields from messages', () => {
      const messages: any[] = [
        { 
          role: 'user', 
          content: 'Question', 
          reasoning_content: 'Should be removed',
          thinking: 'Should be removed',
          extra: 'Should be removed'
        },
      ];

      const result = adapter.prepareContextWithThinking(messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ role: 'user', content: 'Question' });
      expect(result[0]).not.toHaveProperty('reasoning_content');
      expect(result[0]).not.toHaveProperty('thinking');
      expect(result[0]).not.toHaveProperty('extra');
    });
  });

  describe('supportsThinking', () => {
    it('should return true for DeepSeek-R1 models', () => {
      expect(adapter.supportsThinking('deepseek-r1')).toBe(true);
      expect(adapter.supportsThinking('deepseek-r1:latest')).toBe(true);
      expect(adapter.supportsThinking('deepseek-r1-distill-qwen-32b')).toBe(true);
      expect(adapter.supportsThinking('deepseek-reasoner')).toBe(true);
    });

    it('should return true for Qwen reasoning models', () => {
      expect(adapter.supportsThinking('qwen-think')).toBe(true);
      expect(adapter.supportsThinking('qwen-reasoning')).toBe(true);
      expect(adapter.supportsThinking('qwen2.5-think')).toBe(true);
    });

    it('should return true for Llama reasoning models', () => {
      expect(adapter.supportsThinking('llama-think')).toBe(true);
      expect(adapter.supportsThinking('llama-reasoning')).toBe(true);
      expect(adapter.supportsThinking('llama3-think')).toBe(true);
    });

    it('should return true for models with reasoning keywords', () => {
      expect(adapter.supportsThinking('custom-reasoning-model')).toBe(true);
      expect(adapter.supportsThinking('model-cot')).toBe(true);
      expect(adapter.supportsThinking('test-r1')).toBe(true);
    });

    it('should return false for non-reasoning models', () => {
      expect(adapter.supportsThinking('llama3')).toBe(false);
      expect(adapter.supportsThinking('qwen2.5')).toBe(false);
      expect(adapter.supportsThinking('mistral')).toBe(false);
      expect(adapter.supportsThinking('phi3')).toBe(false);
    });
  });

  describe('getRecommendedConfig', () => {
    it('should return DeepSeek-R1 recommended config', () => {
      const config = adapter.getRecommendedConfig('deepseek-r1');

      expect(config.enableThinking).toBe(true);
      expect(config.maxTokens).toBe(8192);
      expect(config.numCtx).toBe(32768);
      expect(config.temperature).toBe(0.7);
    });

    it('should return Qwen recommended config', () => {
      const config = adapter.getRecommendedConfig('qwen-think');

      expect(config.enableThinking).toBe(true);
      expect(config.maxTokens).toBe(4096);
      expect(config.numCtx).toBe(16384);
      expect(config.temperature).toBe(0.7);
    });

    it('should return generic config for other reasoning models', () => {
      const config = adapter.getRecommendedConfig('custom-reasoning');

      expect(config.enableThinking).toBe(true);
      expect(config.maxTokens).toBe(4096);
      expect(config.numCtx).toBe(8192);
      expect(config.temperature).toBe(0.7);
    });

    it('should return empty config for non-reasoning models', () => {
      const config = adapter.getRecommendedConfig('llama3');

      expect(config).toEqual({});
    });
  });

  describe('validateReasoningConfig', () => {
    it('should pass validation for correct config', () => {
      const config: AIServiceConfig = {
        provider: 'ollama',
        apiKey: 'test',
        model: 'deepseek-r1',
        enableThinking: true,
        maxTokens: 8192,
        numCtx: 32768,
      };

      const result = adapter.validateReasoningConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn when enableThinking is not set', () => {
      const config: AIServiceConfig = {
        provider: 'ollama',
        apiKey: 'test',
        model: 'deepseek-r1',
      };

      const result = adapter.validateReasoningConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'enableThinking is not set. Thinking chain will not be enabled.'
      );
    });

    it('should warn when no token limit is set', () => {
      const config: AIServiceConfig = {
        provider: 'ollama',
        apiKey: 'test',
        model: 'deepseek-r1',
        enableThinking: true,
      };

      const result = adapter.validateReasoningConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'No token limit set. Consider setting maxTokens or numPredict to control output length.'
      );
    });

    it('should warn when numCtx is too small', () => {
      const config: AIServiceConfig = {
        provider: 'ollama',
        apiKey: 'test',
        model: 'deepseek-r1',
        enableThinking: true,
        numCtx: 4096,
      };

      const result = adapter.validateReasoningConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'numCtx 4096 may be too small for reasoning models. Consider using at least 8192.'
      );
    });

    it('should warn when hideThinking is enabled', () => {
      const config: AIServiceConfig = {
        provider: 'ollama',
        apiKey: 'test',
        model: 'deepseek-r1',
        enableThinking: true,
        hideThinking: true,
      };

      const result = adapter.validateReasoningConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'hideThinking is enabled. Thinking content will be hidden from the response.'
      );
    });

    it('should not validate non-reasoning models', () => {
      const config: AIServiceConfig = {
        provider: 'ollama',
        apiKey: 'test',
        model: 'llama3',
      };

      const result = adapter.validateReasoningConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('shouldExcludeReasoningInContext', () => {
    it('should return true for DeepSeek-R1', () => {
      expect(adapter.shouldExcludeReasoningInContext('deepseek-r1')).toBe(true);
    });

    it('should return true by default for safety', () => {
      expect(adapter.shouldExcludeReasoningInContext('qwen-think')).toBe(true);
      expect(adapter.shouldExcludeReasoningInContext('llama-reasoning')).toBe(true);
    });
  });

  describe('getModelDescription', () => {
    it('should return DeepSeek-R1 description', () => {
      const desc = adapter.getModelDescription('deepseek-r1');
      expect(desc).toContain('DeepSeek-R1');
      expect(desc).toContain('reasoning_content');
    });

    it('should return Qwen description', () => {
      const desc = adapter.getModelDescription('qwen-think');
      expect(desc).toContain('Qwen');
    });

    it('should return Llama description', () => {
      const desc = adapter.getModelDescription('llama-reasoning');
      expect(desc).toContain('Llama');
    });

    it('should return generic description for unknown models', () => {
      const desc = adapter.getModelDescription('unknown-model');
      expect(desc).toContain('Ollama reasoning model');
    });
  });

  describe('getThinkingParameterDescription', () => {
    it('should return parameter descriptions', () => {
      const descriptions = adapter.getThinkingParameterDescription();

      expect(descriptions.think).toContain('thinking chain mode');
      expect(descriptions.hideThinking).toContain('Hide thinking content');
    });
  });
});
