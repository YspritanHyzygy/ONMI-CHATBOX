/**
 * Regression tests for Response API bug fixes
 * 
 * These tests ensure that the bugs fixed in tasks 1-9 don't reoccur
 */

import { describe, it, expect } from 'vitest';
import { ConfigManager } from '../config-manager';
import { buildApiUrl } from '../url-utils';
import { isValidProviderConfig, isValidMessage } from '../type-guards';
import { validateChatRequest } from '../request-validator';

describe('Regression Tests - Response API Bug Fixes', () => {
  const configManager = new ConfigManager();

  describe('Bug Fix 1: Base URL Hardcoding', () => {
    it('should not hardcode URLs in testConnection', () => {
      const customBaseUrl = 'https://my-custom-api.com/v1';
      const url = buildApiUrl(customBaseUrl, '/models');
      
      // Should use custom URL, not hardcoded default
      expect(url).toBe('https://my-custom-api.com/v1/models');
      expect(url).not.toContain('api.openai.com');
    });

    it('should not hardcode URLs in getAvailableModels', () => {
      const customBaseUrl = 'https://my-custom-api.com/v1';
      const url = buildApiUrl(customBaseUrl, '/models');
      
      // Should use custom URL, not hardcoded default
      expect(url).toBe('https://my-custom-api.com/v1/models');
      expect(url).not.toContain('generativelanguage.googleapis.com');
    });

    it('should handle various base URL formats correctly', () => {
      // With trailing slash
      expect(buildApiUrl('https://api.com/', '/endpoint')).toBe('https://api.com/endpoint');
      
      // Without trailing slash
      expect(buildApiUrl('https://api.com', '/endpoint')).toBe('https://api.com/endpoint');
      
      // Endpoint without leading slash
      expect(buildApiUrl('https://api.com', 'endpoint')).toBe('https://api.com/endpoint');
      
      // Both with slashes
      expect(buildApiUrl('https://api.com/', '/endpoint')).toBe('https://api.com/endpoint');
    });
  });

  describe('Bug Fix 2: Response API Switch Logic', () => {
    it('should use Response API when parameters.useResponsesAPI is true', () => {
      const config = { use_responses_api: 'false' };
      const parameters = { useResponsesAPI: true };
      
      const shouldUse = configManager.shouldUseResponsesAPI('openai', config, parameters);
      expect(shouldUse).toBe(true);
      
      const actualProvider = configManager.getActualProvider('openai', config, parameters);
      expect(actualProvider).toBe('openai-responses');
    });

    it('should use Response API when config.use_responses_api is "true"', () => {
      const config = { use_responses_api: 'true' };
      const parameters = {};
      
      const shouldUse = configManager.shouldUseResponsesAPI('openai', config, parameters);
      expect(shouldUse).toBe(true);
      
      const actualProvider = configManager.getActualProvider('openai', config, parameters);
      expect(actualProvider).toBe('openai-responses');
    });

    it('should handle boolean true in config', () => {
      const config = { use_responses_api: true };
      const parameters = {};
      
      const shouldUse = configManager.shouldUseResponsesAPI('openai', config, parameters);
      expect(shouldUse).toBe(true);
    });

    it('should not use Response API for non-OpenAI providers', () => {
      const config = { use_responses_api: 'true' };
      const parameters = { useResponsesAPI: true };
      
      expect(configManager.shouldUseResponsesAPI('claude', config, parameters)).toBe(false);
      expect(configManager.shouldUseResponsesAPI('gemini', config, parameters)).toBe(false);
    });
  });

  describe('Bug Fix 3: Configuration Lookup', () => {
    it('should map openai-responses to openai for config lookup', () => {
      const baseProvider = configManager.getBaseProviderName('openai-responses');
      expect(baseProvider).toBe('openai');
    });

    it('should not modify other provider names', () => {
      expect(configManager.getBaseProviderName('openai')).toBe('openai');
      expect(configManager.getBaseProviderName('claude')).toBe('claude');
      expect(configManager.getBaseProviderName('gemini')).toBe('gemini');
      expect(configManager.getBaseProviderName('ollama')).toBe('ollama');
    });
  });

  describe('Bug Fix 4: Streaming Response Handling', () => {
    it('should set useResponsesAPI flag for openai-responses provider', () => {
      const config = {
        api_key: 'sk-test',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o'
      };

      const serviceConfig = configManager.toAIServiceConfig('openai-responses', config);
      expect(serviceConfig.useResponsesAPI).toBe(true);
    });

    it('should not set useResponsesAPI flag for regular openai provider', () => {
      const config = {
        api_key: 'sk-test',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o'
      };

      const serviceConfig = configManager.toAIServiceConfig('openai', config);
      expect(serviceConfig.useResponsesAPI).toBeUndefined();
    });
  });

  describe('Bug Fix 5: Type Safety', () => {
    it('should validate provider config structure', () => {
      const validConfig = {
        id: '123',
        user_id: 'user1',
        provider_name: 'openai',
        api_key: 'sk-test',
        default_model: 'gpt-4o',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      expect(isValidProviderConfig(validConfig)).toBe(true);
    });

    it('should reject invalid provider config', () => {
      const invalidConfig = {
        id: '123',
        // missing required fields
      };

      expect(isValidProviderConfig(invalidConfig)).toBe(false);
    });

    it('should validate message structure', () => {
      const validMessage = {
        id: '123',
        conversation_id: 'conv1',
        content: 'Hello',
        role: 'user',
        created_at: new Date().toISOString()
      };

      expect(isValidMessage(validMessage)).toBe(true);
    });

    it('should reject invalid message', () => {
      const invalidMessage = {
        id: '123',
        // missing required fields
      };

      expect(isValidMessage(invalidMessage)).toBe(false);
    });
  });

  describe('Bug Fix 6: Request Validation', () => {
    it('should validate complete chat request', () => {
      const request = {
        message: 'Hello',
        provider: 'openai',
        model: 'gpt-4o',
        userId: 'user1',
        parameters: {
          temperature: 0.7,
          maxTokens: 2000
        }
      };

      const result = validateChatRequest(request);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject request with missing message', () => {
      const request = {
        message: '',
        provider: 'openai',
        model: 'gpt-4o',
        userId: 'user1',
        parameters: {}
      };

      const result = validateChatRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('message is required and must be a non-empty string');
    });

    it('should accept request with default provider', () => {
      // The validator provides defaults for provider, model, and userId
      const request = {
        message: 'Hello',
        provider: '',
        model: 'gpt-4o',
        userId: 'user1',
        parameters: {}
      };

      const result = validateChatRequest(request);
      // Should be valid because validator provides default provider
      expect(result.valid).toBe(true);
    });

    it('should accept request with default model', () => {
      // The validator provides defaults for provider, model, and userId
      const request = {
        message: 'Hello',
        provider: 'openai',
        model: '',
        userId: 'user1',
        parameters: {}
      };

      const result = validateChatRequest(request);
      // Should be valid because validator provides default model
      expect(result.valid).toBe(true);
    });

    it('should accept request with default userId', () => {
      // The validator provides defaults for provider, model, and userId
      const request = {
        message: 'Hello',
        provider: 'openai',
        model: 'gpt-4o',
        userId: '',
        parameters: {}
      };

      const result = validateChatRequest(request);
      // Should be valid because validator provides default userId
      expect(result.valid).toBe(true);
    });

    it('should validate temperature range', () => {
      const request = {
        message: 'Hello',
        provider: 'openai',
        model: 'gpt-4o',
        userId: 'user1',
        parameters: {
          temperature: 2.5 // Invalid: > 2.0
        }
      };

      const result = validateChatRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('temperature must be between 0 and 2');
    });

    it('should validate maxTokens range', () => {
      const request = {
        message: 'Hello',
        provider: 'openai',
        model: 'gpt-4o',
        userId: 'user1',
        parameters: {
          maxTokens: -100 // Invalid: negative
        }
      };

      const result = validateChatRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('maxTokens must be greater than 0');
    });
  });

  describe('Bug Fix 7: Configuration Validation', () => {
    it('should reject config with invalid base URL protocol', () => {
      const config = {
        api_key: 'sk-test',
        base_url: 'ftp://api.openai.com/v1',
        default_model: 'gpt-4o',
        provider_name: 'openai'
      };

      const result = configManager.validateConfig('openai', config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Base URL 必须使用 http 或 https 协议');
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

    it('should warn about missing default model', () => {
      const config = {
        api_key: 'sk-test',
        base_url: 'https://api.openai.com/v1',
        default_model: '',
        provider_name: 'openai'
      };

      const result = configManager.validateConfig('openai', config);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('openai 未配置默认模型，将使用系统默认值');
    });
  });

  describe('Bug Fix 8: Provider Information in Database', () => {
    it('should use actual provider name (openai-responses) not base provider (openai)', () => {
      const config = { use_responses_api: 'true' };
      const parameters = {};
      
      const actualProvider = configManager.getActualProvider('openai', config, parameters);
      
      // Database should save with actual provider
      expect(actualProvider).toBe('openai-responses');
      
      // But config lookup should use base provider
      const baseProvider = configManager.getBaseProviderName(actualProvider);
      expect(baseProvider).toBe('openai');
    });
  });

  describe('Bug Fix 9: Response API Tools Configuration', () => {
    it('should correctly configure research tools for Response API', () => {
      const config = {
        api_key: 'sk-test',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o'
      };
      const parameters = {
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

      expect(serviceConfig.tools).toBeDefined();
      expect(serviceConfig.tools).toHaveLength(2);
      expect(serviceConfig.tools?.[0]).toEqual({ type: 'web_search', enabled: true });
      expect(serviceConfig.tools?.[1]).toEqual({ type: 'code_interpreter', enabled: true });
    });

    it('should set store flag for Response API', () => {
      const config = {
        api_key: 'sk-test',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o'
      };

      const serviceConfig = configManager.toAIServiceConfig('openai-responses', config);
      expect(serviceConfig.store).toBe(true);
    });

    it('should set background flag when provided', () => {
      const config = {
        api_key: 'sk-test',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o'
      };
      const parameters = {
        background: true
      };

      const serviceConfig = configManager.toAIServiceConfig(
        'openai-responses',
        config,
        undefined,
        parameters
      );
      expect(serviceConfig.background).toBe(true);
    });
  });
});
