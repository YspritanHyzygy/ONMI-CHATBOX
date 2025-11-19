/**
 * 配置管理器测试
 * 
 * 运行命令：npm run test:run config-manager.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigManager } from '../config-manager.js';

describe('ConfigManager', () => {
  let configManager: ConfigManager;

  beforeEach(() => {
    configManager = new ConfigManager();
    // 清除环境变量
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_DEFAULT_MODEL;
  });

  describe('getBaseProviderName', () => {
    it('should return openai for openai-responses', () => {
      const result = configManager.getBaseProviderName('openai-responses');
      expect(result).toBe('openai');
    });

    it('should return the same provider for non-responses providers', () => {
      expect(configManager.getBaseProviderName('openai')).toBe('openai');
      expect(configManager.getBaseProviderName('claude')).toBe('claude');
      expect(configManager.getBaseProviderName('gemini')).toBe('gemini');
    });
  });

  describe('validateConfig', () => {
    it('should validate a complete OpenAI config', () => {
      const config = {
        api_key: 'sk-test123',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o',
        provider_name: 'openai'
      };

      const result = configManager.validateConfig('openai', config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject config without API key', () => {
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

    it('should reject config with invalid Base URL', () => {
      const config = {
        api_key: 'sk-test123',
        base_url: 'not-a-url',
        default_model: 'gpt-4o',
        provider_name: 'openai'
      };

      const result = configManager.validateConfig('openai', config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Base URL 格式无效');
    });

    it('should reject config with non-http(s) protocol', () => {
      const config = {
        api_key: 'sk-test123',
        base_url: 'ftp://api.openai.com/v1',
        default_model: 'gpt-4o',
        provider_name: 'openai'
      };

      const result = configManager.validateConfig('openai', config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Base URL 必须使用 http 或 https 协议');
    });

    it('should warn about missing default model', () => {
      const config = {
        api_key: 'sk-test123',
        base_url: 'https://api.openai.com/v1',
        default_model: '',
        provider_name: 'openai'
      };

      const result = configManager.validateConfig('openai', config);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('openai 未配置默认模型，将使用系统默认值');
    });

    it('should allow Ollama without API key', () => {
      const config = {
        api_key: '',
        base_url: 'http://localhost:11434',
        default_model: 'llama3.3',
        provider_name: 'ollama'
      };

      const result = configManager.validateConfig('ollama', config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

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
  });

  describe('shouldUseResponsesAPI', () => {
    it('should return true when parameters.useResponsesAPI is true', () => {
      const config = { use_responses_api: 'false' };
      const parameters = { useResponsesAPI: true };
      
      const result = configManager.shouldUseResponsesAPI('openai', config, parameters);
      expect(result).toBe(true);
    });

    it('should return true when config.use_responses_api is "true"', () => {
      const config = { use_responses_api: 'true' };
      const parameters = {};
      
      const result = configManager.shouldUseResponsesAPI('openai', config, parameters);
      expect(result).toBe(true);
    });

    it('should return true when config.use_responses_api is boolean true', () => {
      const config = { use_responses_api: true };
      const parameters = {};
      
      const result = configManager.shouldUseResponsesAPI('openai', config, parameters);
      expect(result).toBe(true);
    });

    it('should return false for non-OpenAI providers', () => {
      const config = { use_responses_api: 'true' };
      const parameters = { useResponsesAPI: true };
      
      expect(configManager.shouldUseResponsesAPI('claude', config, parameters)).toBe(false);
      expect(configManager.shouldUseResponsesAPI('gemini', config, parameters)).toBe(false);
    });

    it('should return false when no flags are set', () => {
      const config = {};
      const parameters = {};
      
      const result = configManager.shouldUseResponsesAPI('openai', config, parameters);
      expect(result).toBe(false);
    });
  });

  describe('getActualProvider', () => {
    it('should return openai-responses when Response API is enabled', () => {
      const config = { use_responses_api: 'true' };
      const parameters = {};
      
      const result = configManager.getActualProvider('openai', config, parameters);
      expect(result).toBe('openai-responses');
    });

    it('should return original provider when Response API is disabled', () => {
      const config = { use_responses_api: 'false' };
      const parameters = {};
      
      const result = configManager.getActualProvider('openai', config, parameters);
      expect(result).toBe('openai');
    });

    it('should return original provider for non-OpenAI providers', () => {
      const config = { use_responses_api: 'true' };
      const parameters = {};
      
      expect(configManager.getActualProvider('claude', config, parameters)).toBe('claude');
      expect(configManager.getActualProvider('gemini', config, parameters)).toBe('gemini');
    });
  });

  describe('toAIServiceConfig', () => {
    it('should convert config to AIServiceConfig format', () => {
      const config = {
        api_key: 'sk-test123',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o'
      };
      const parameters = {
        temperature: 0.8,
        maxTokens: 2000,
        topP: 0.9
      };

      const result = configManager.toAIServiceConfig('openai', config, 'gpt-4o-mini', parameters);
      
      expect(result.provider).toBe('openai');
      expect(result.apiKey).toBe('sk-test123');
      expect(result.baseUrl).toBe('https://api.openai.com/v1');
      expect(result.model).toBe('gpt-4o-mini');
      expect(result.temperature).toBe(0.8);
      expect(result.maxTokens).toBe(2000);
      expect(result.topP).toBe(0.9);
    });

    it('should use default model when not specified', () => {
      const config = {
        api_key: 'sk-test123',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o'
      };

      const result = configManager.toAIServiceConfig('openai', config);
      expect(result.model).toBe('gpt-4o');
    });

    it('should add Response API specific parameters', () => {
      const config = {
        api_key: 'sk-test123',
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

      const result = configManager.toAIServiceConfig('openai-responses', config, undefined, parameters);
      
      expect(result.useResponsesAPI).toBe(true);
      expect(result.store).toBe(true);
      expect(result.background).toBe(true);
      expect(result.tools).toBeDefined();
      expect(result.tools).toHaveLength(2);
      expect(result.tools?.[0]).toEqual({ type: 'web_search', enabled: true });
      expect(result.tools?.[1]).toEqual({ type: 'code_interpreter', enabled: true });
    });

    it('should use default temperature when not specified', () => {
      const config = {
        api_key: 'sk-test123',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o'
      };

      const result = configManager.toAIServiceConfig('openai', config);
      expect(result.temperature).toBe(0.7);
    });
  });

  describe('getConfigErrorMessage', () => {
    it('should return custom error message when provided', () => {
      const lookupResult = {
        found: false,
        source: 'none' as const,
        error: 'Custom error message'
      };

      const result = configManager.getConfigErrorMessage('openai', lookupResult);
      expect(result).toBe('Custom error message');
    });

    it('should return default error message when not found', () => {
      const lookupResult = {
        found: false,
        source: 'none' as const
      };

      const result = configManager.getConfigErrorMessage('openai', lookupResult);
      expect(result).toContain('未找到 openai 的配置');
    });

    it('should handle openai-responses provider name', () => {
      const lookupResult = {
        found: false,
        source: 'none' as const
      };

      const result = configManager.getConfigErrorMessage('openai-responses', lookupResult);
      expect(result).toContain('未找到 openai 的配置');
    });
  });

  describe('getValidationErrorMessage', () => {
    it('should format validation errors', () => {
      const validationResult = {
        valid: false,
        errors: ['Error 1', 'Error 2'],
        warnings: []
      };

      const result = configManager.getValidationErrorMessage('openai', validationResult);
      expect(result).toContain('openai 配置验证失败');
      expect(result).toContain('• Error 1');
      expect(result).toContain('• Error 2');
    });

    it('should return empty string when no errors', () => {
      const validationResult = {
        valid: true,
        errors: [],
        warnings: []
      };

      const result = configManager.getValidationErrorMessage('openai', validationResult);
      expect(result).toBe('');
    });
  });
});
