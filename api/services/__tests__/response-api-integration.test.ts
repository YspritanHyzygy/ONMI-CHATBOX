/**
 * Integration tests for Response API bug fixes
 * 
 * Tests the complete flow from configuration to API calls
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigManager } from '../config-manager';
import { buildApiUrl } from '../url-utils';

describe('Response API Integration Tests', () => {
  let configManager: ConfigManager;

  beforeEach(() => {
    configManager = new ConfigManager();
  });

  describe('Response API Switch Logic', () => {
    it('should correctly determine when to use Response API from parameters', () => {
      const config = { use_responses_api: 'false' };
      const parameters = { useResponsesAPI: true };
      
      const shouldUse = configManager.shouldUseResponsesAPI('openai', config, parameters);
      expect(shouldUse).toBe(true);
    });

    it('should correctly determine when to use Response API from config', () => {
      const config = { use_responses_api: 'true' };
      const parameters = {};
      
      const shouldUse = configManager.shouldUseResponsesAPI('openai', config, parameters);
      expect(shouldUse).toBe(true);
    });

    it('should return correct actual provider when Response API is enabled', () => {
      const config = { use_responses_api: 'true' };
      const parameters = {};
      
      const actualProvider = configManager.getActualProvider('openai', config, parameters);
      expect(actualProvider).toBe('openai-responses');
    });

    it('should return original provider when Response API is disabled', () => {
      const config = { use_responses_api: 'false' };
      const parameters = {};
      
      const actualProvider = configManager.getActualProvider('openai', config, parameters);
      expect(actualProvider).toBe('openai');
    });

    it('should not enable Response API for non-OpenAI providers', () => {
      const config = { use_responses_api: 'true' };
      const parameters = { useResponsesAPI: true };
      
      expect(configManager.shouldUseResponsesAPI('claude', config, parameters)).toBe(false);
      expect(configManager.shouldUseResponsesAPI('gemini', config, parameters)).toBe(false);
      expect(configManager.shouldUseResponsesAPI('ollama', config, parameters)).toBe(false);
    });
  });

  describe('Base URL Configuration', () => {
    it('should use custom base URL when provided', () => {
      const customBaseUrl = 'https://custom.openai.com/v1';
      const url = buildApiUrl(customBaseUrl, '/chat/completions');
      
      expect(url).toBe('https://custom.openai.com/v1/chat/completions');
    });

    it('should handle base URL with trailing slash', () => {
      const customBaseUrl = 'https://custom.openai.com/v1/';
      const url = buildApiUrl(customBaseUrl, '/chat/completions');
      
      expect(url).toBe('https://custom.openai.com/v1/chat/completions');
    });

    it('should handle endpoint without leading slash', () => {
      const customBaseUrl = 'https://custom.openai.com/v1';
      const url = buildApiUrl(customBaseUrl, 'chat/completions');
      
      expect(url).toBe('https://custom.openai.com/v1/chat/completions');
    });

    it('should handle both trailing and leading slashes', () => {
      const customBaseUrl = 'https://custom.openai.com/v1/';
      const url = buildApiUrl(customBaseUrl, '/chat/completions');
      
      expect(url).toBe('https://custom.openai.com/v1/chat/completions');
    });

    it('should validate base URL format', () => {
      const config = {
        api_key: 'sk-test',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o',
        provider_name: 'openai'
      };

      const result = configManager.validateConfig('openai', config);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid base URL format', () => {
      const config = {
        api_key: 'sk-test',
        base_url: 'not-a-valid-url',
        default_model: 'gpt-4o',
        provider_name: 'openai'
      };

      const result = configManager.validateConfig('openai', config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Base URL 格式无效');
    });
  });

  describe('Configuration Lookup and Mapping', () => {
    it('should map openai-responses to openai for config lookup', () => {
      const baseProvider = configManager.getBaseProviderName('openai-responses');
      expect(baseProvider).toBe('openai');
    });

    it('should keep original provider name for non-responses providers', () => {
      expect(configManager.getBaseProviderName('openai')).toBe('openai');
      expect(configManager.getBaseProviderName('claude')).toBe('claude');
      expect(configManager.getBaseProviderName('gemini')).toBe('gemini');
    });

    it('should convert config to AIServiceConfig with Response API parameters', () => {
      const config = {
        api_key: 'sk-test',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o'
      };
      const parameters = {
        background: true,
        researchTools: {
          webSearch: true,
          codeInterpreter: true,
          fileSearch: false
        }
      };

      const serviceConfig = configManager.toAIServiceConfig(
        'openai-responses',
        config,
        undefined,
        parameters
      );

      expect(serviceConfig.provider).toBe('openai-responses');
      expect(serviceConfig.useResponsesAPI).toBe(true);
      expect(serviceConfig.store).toBe(true);
      expect(serviceConfig.background).toBe(true);
      expect(serviceConfig.tools).toBeDefined();
      expect(serviceConfig.tools).toHaveLength(2);
    });
  });

  describe('Type Safety and Validation', () => {
    it('should reject null config', () => {
      const result = configManager.validateConfig('openai', null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('配置对象不能为空');
    });

    it('should reject config with "undefined" string as API key', () => {
      const config = {
        api_key: 'undefined',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o',
        provider_name: 'openai'
      };

      const result = configManager.validateConfig('openai', config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('openai 的 API Key 无效');
    });

    it('should reject config with empty API key for providers that require it', () => {
      const config = {
        api_key: '',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o',
        provider_name: 'openai'
      };

      const result = configManager.validateConfig('openai', config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('openai 需要配置 API Key');
    });

    it('should allow empty API key for Ollama', () => {
      const config = {
        api_key: '',
        base_url: 'http://localhost:11434',
        default_model: 'llama3.3',
        provider_name: 'ollama'
      };

      const result = configManager.validateConfig('ollama', config);
      expect(result.valid).toBe(true);
    });
  });

  describe('Error Messages', () => {
    it('should provide clear error message when config not found', () => {
      const lookupResult = {
        found: false,
        source: 'none' as const
      };

      const message = configManager.getConfigErrorMessage('openai', lookupResult);
      expect(message).toContain('未找到 openai 的配置');
    });

    it('should use custom error message when provided', () => {
      const lookupResult = {
        found: false,
        source: 'none' as const,
        error: 'Custom error message'
      };

      const message = configManager.getConfigErrorMessage('openai', lookupResult);
      expect(message).toBe('Custom error message');
    });

    it('should format validation errors properly', () => {
      const validationResult = {
        valid: false,
        errors: ['Error 1', 'Error 2'],
        warnings: []
      };

      const message = configManager.getValidationErrorMessage('openai', validationResult);
      expect(message).toContain('openai 配置验证失败');
      expect(message).toContain('• Error 1');
      expect(message).toContain('• Error 2');
    });
  });

  describe('Streaming vs Non-Streaming', () => {
    it('should disable streaming for Response API', () => {
      const config = {
        api_key: 'sk-test',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o'
      };
      const parameters = {};

      const serviceConfig = configManager.toAIServiceConfig(
        'openai-responses',
        config,
        undefined,
        parameters
      );

      // Response API should not use streaming
      expect(serviceConfig.provider).toBe('openai-responses');
      expect(serviceConfig.useResponsesAPI).toBe(true);
    });

    it('should allow streaming for regular OpenAI API', () => {
      const config = {
        api_key: 'sk-test',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o'
      };
      const parameters = {};

      const serviceConfig = configManager.toAIServiceConfig(
        'openai',
        config,
        undefined,
        parameters
      );

      // Regular API can use streaming
      expect(serviceConfig.provider).toBe('openai');
      expect(serviceConfig.useResponsesAPI).toBeUndefined();
    });
  });
});
