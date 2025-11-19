/**
 * End-to-End Integration Tests for Chat Flow
 * 
 * Tests the complete chat flow from request to response
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigManager } from '../config-manager';
import { validateChatRequest } from '../request-validator';
import { validateChatResponse } from '../response-validator';
import { buildApiUrl } from '../url-utils';

describe('E2E Chat Flow Integration Tests', () => {
  let configManager: ConfigManager;

  beforeEach(() => {
    configManager = new ConfigManager();
  });

  describe('Complete Chat Flow - Regular OpenAI', () => {
    it('should process a complete chat request with regular OpenAI API', () => {
      // Step 1: Validate incoming request
      const request = {
        message: 'Hello, how are you?',
        provider: 'openai',
        model: 'gpt-4o',
        userId: 'user123',
        parameters: {
          temperature: 0.7,
          maxTokens: 2000,
          topP: 0.9
        }
      };

      const requestValidation = validateChatRequest(request);
      expect(requestValidation.valid).toBe(true);

      // Step 2: Get configuration
      const config = {
        api_key: 'sk-test123',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o',
        use_responses_api: 'false'
      };

      const configValidation = configManager.validateConfig('openai', config);
      expect(configValidation.valid).toBe(true);

      // Step 3: Determine actual provider
      const actualProvider = configManager.getActualProvider(
        request.provider as any,
        config,
        request.parameters
      );
      expect(actualProvider).toBe('openai');

      // Step 4: Build API URL
      const apiUrl = buildApiUrl(config.base_url!, '/chat/completions');
      expect(apiUrl).toBe('https://api.openai.com/v1/chat/completions');

      // Step 5: Convert to service config
      const serviceConfig = configManager.toAIServiceConfig(
        actualProvider,
        config,
        request.model,
        request.parameters
      );

      expect(serviceConfig.provider).toBe('openai');
      expect(serviceConfig.apiKey).toBe('sk-test123');
      expect(serviceConfig.model).toBe('gpt-4o');
      expect(serviceConfig.temperature).toBe(0.7);
      expect(serviceConfig.useResponsesAPI).toBeUndefined();

      // Step 6: Validate response structure
      const mockResponse = {
        success: true,
        response: 'I am doing well, thank you!',
        conversationId: 'conv123',
        data: {
          userMessage: {
            id: 'msg1',
            conversation_id: 'conv123',
            content: request.message,
            role: 'user',
            provider: actualProvider,
            model: request.model,
            created_at: new Date().toISOString()
          },
          aiMessage: {
            id: 'msg2',
            conversation_id: 'conv123',
            content: 'I am doing well, thank you!',
            role: 'assistant',
            provider: actualProvider,
            model: request.model,
            created_at: new Date().toISOString()
          }
        }
      };

      const responseValidation = validateChatResponse(mockResponse);
      expect(responseValidation.valid).toBe(true);
    });
  });

  describe('Complete Chat Flow - Response API', () => {
    it('should process a complete chat request with Response API', () => {
      // Step 1: Validate incoming request
      const request = {
        message: 'Research the latest AI trends',
        provider: 'openai',
        model: 'gpt-4o',
        userId: 'user123',
        parameters: {
          temperature: 0.7,
          maxTokens: 4000,
          useResponsesAPI: true,
          background: true,
          researchTools: {
            webSearch: true,
            codeInterpreter: false,
            fileSearch: false
          }
        }
      };

      const requestValidation = validateChatRequest(request);
      expect(requestValidation.valid).toBe(true);

      // Step 2: Get configuration
      const config = {
        api_key: 'sk-test123',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o',
        use_responses_api: 'false' // Will be overridden by parameter
      };

      const configValidation = configManager.validateConfig('openai', config);
      expect(configValidation.valid).toBe(true);

      // Step 3: Determine actual provider (should use Response API)
      const actualProvider = configManager.getActualProvider(
        request.provider as any,
        config,
        request.parameters
      );
      expect(actualProvider).toBe('openai-responses');

      // Step 4: Verify Response API is enabled
      const shouldUseResponsesAPI = configManager.shouldUseResponsesAPI(
        request.provider as any,
        config,
        request.parameters
      );
      expect(shouldUseResponsesAPI).toBe(true);

      // Step 5: Build API URL (should still use openai base URL)
      const baseProvider = configManager.getBaseProviderName(actualProvider);
      expect(baseProvider).toBe('openai');
      
      const apiUrl = buildApiUrl(config.base_url!, '/responses');
      expect(apiUrl).toBe('https://api.openai.com/v1/responses');

      // Step 6: Convert to service config with Response API parameters
      const serviceConfig = configManager.toAIServiceConfig(
        actualProvider,
        config,
        request.model,
        request.parameters
      );

      expect(serviceConfig.provider).toBe('openai-responses');
      expect(serviceConfig.apiKey).toBe('sk-test123');
      expect(serviceConfig.model).toBe('gpt-4o');
      expect(serviceConfig.temperature).toBe(0.7);
      expect(serviceConfig.useResponsesAPI).toBe(true);
      expect(serviceConfig.store).toBe(true);
      expect(serviceConfig.background).toBe(true);
      expect(serviceConfig.tools).toBeDefined();
      expect(serviceConfig.tools).toHaveLength(1);
      expect(serviceConfig.tools?.[0]).toEqual({ type: 'web_search', enabled: true });

      // Step 7: Validate response structure
      const mockResponse = {
        success: true,
        response: 'Based on my research...',
        conversationId: 'conv123',
        data: {
          userMessage: {
            id: 'msg1',
            conversation_id: 'conv123',
            content: request.message,
            role: 'user',
            provider: actualProvider, // Should be openai-responses
            model: request.model,
            created_at: new Date().toISOString()
          },
          aiMessage: {
            id: 'msg2',
            conversation_id: 'conv123',
            content: 'Based on my research...',
            role: 'assistant',
            provider: actualProvider, // Should be openai-responses
            model: request.model,
            created_at: new Date().toISOString(),
            metadata: {
              responseId: 'resp_123',
              tools_used: ['web_search']
            }
          }
        }
      };

      const responseValidation = validateChatResponse(mockResponse);
      expect(responseValidation.valid).toBe(true);

      // Verify provider is saved correctly
      expect(mockResponse.data.userMessage.provider).toBe('openai-responses');
      expect(mockResponse.data.aiMessage.provider).toBe('openai-responses');
    });
  });

  describe('Complete Chat Flow - Custom Base URL', () => {
    it('should handle custom base URL throughout the flow', () => {
      const customBaseUrl = 'https://my-proxy.com/openai/v1';

      // Step 1: Validate request
      const request = {
        message: 'Hello',
        provider: 'openai',
        model: 'gpt-4o',
        userId: 'user123',
        parameters: {
          temperature: 0.7
        }
      };

      const requestValidation = validateChatRequest(request);
      expect(requestValidation.valid).toBe(true);

      // Step 2: Get configuration with custom base URL
      const config = {
        api_key: 'sk-test123',
        base_url: customBaseUrl,
        default_model: 'gpt-4o',
        use_responses_api: 'false'
      };

      const configValidation = configManager.validateConfig('openai', config);
      expect(configValidation.valid).toBe(true);

      // Step 3: Build API URL with custom base
      const apiUrl = buildApiUrl(config.base_url!, '/chat/completions');
      expect(apiUrl).toBe('https://my-proxy.com/openai/v1/chat/completions');
      expect(apiUrl).not.toContain('api.openai.com'); // Should not use hardcoded URL

      // Step 4: Convert to service config
      const serviceConfig = configManager.toAIServiceConfig(
        request.provider as any,
        config,
        request.model,
        request.parameters
      );

      expect(serviceConfig.baseUrl).toBe(customBaseUrl);
    });
  });

  describe('Error Handling in Chat Flow', () => {
    it('should handle invalid request gracefully', () => {
      const invalidRequest = {
        message: '', // Empty message
        provider: 'openai',
        model: 'gpt-4o',
        userId: 'user123',
        parameters: {}
      };

      const validation = validateChatRequest(invalidRequest);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('message is required and must be a non-empty string');
    });

    it('should handle invalid configuration gracefully', () => {
      const invalidConfig = {
        api_key: '', // Empty API key
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o',
        provider_name: 'openai'
      };

      const validation = configManager.validateConfig('openai', invalidConfig);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('openai 需要配置 API Key');
    });

    it('should handle invalid response gracefully', () => {
      const invalidResponse = {
        success: false,
        error: 'API rate limit exceeded'
      };

      const validation = validateChatResponse(invalidResponse);
      // Error responses with error field are actually valid
      expect(validation.valid).toBe(true);
    });

    it('should reject response without required fields', () => {
      const invalidResponse = {
        success: true
        // Missing response and conversationId
      };

      const validation = validateChatResponse(invalidResponse);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Provider Switching', () => {
    it('should correctly switch between regular and Response API', () => {
      const config = {
        api_key: 'sk-test123',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o',
        use_responses_api: 'false'
      };

      // First request: Regular API
      const regularProvider = configManager.getActualProvider(
        'openai',
        config,
        { useResponsesAPI: false }
      );
      expect(regularProvider).toBe('openai');

      // Second request: Response API
      const responsesProvider = configManager.getActualProvider(
        'openai',
        config,
        { useResponsesAPI: true }
      );
      expect(responsesProvider).toBe('openai-responses');

      // Both should use same base config
      const baseProvider1 = configManager.getBaseProviderName(regularProvider);
      const baseProvider2 = configManager.getBaseProviderName(responsesProvider);
      expect(baseProvider1).toBe('openai');
      expect(baseProvider2).toBe('openai');
    });
  });

  describe('Multi-Provider Support', () => {
    it('should handle different providers correctly', () => {
      const providers = ['openai', 'claude', 'gemini', 'ollama'];

      providers.forEach(provider => {
        const config = {
          api_key: provider === 'ollama' ? '' : 'test-key',
          base_url: `https://${provider}.api.com/v1`,
          default_model: 'test-model',
          provider_name: provider
        };

        const validation = configManager.validateConfig(provider as any, config);
        expect(validation.valid).toBe(true);

        const baseProvider = configManager.getBaseProviderName(provider as any);
        expect(baseProvider).toBe(provider);
      });
    });

    it('should only enable Response API for OpenAI', () => {
      const providers = ['openai', 'claude', 'gemini', 'ollama'];
      const config = { use_responses_api: 'true' };
      const parameters = { useResponsesAPI: true };

      providers.forEach(provider => {
        const shouldUse = configManager.shouldUseResponsesAPI(provider as any, config, parameters);
        
        if (provider === 'openai') {
          expect(shouldUse).toBe(true);
        } else {
          expect(shouldUse).toBe(false);
        }
      });
    });
  });
});
