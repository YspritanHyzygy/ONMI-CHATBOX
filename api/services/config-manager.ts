/**
 * 配置管理服务
 * 统一处理AI服务配置的查找、验证和应用逻辑
 */
import { AIProvider, AIServiceConfig } from './types.js';
import { jsonDatabase } from './json-database.js';

/**
 * 配置验证结果
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 配置查找结果
 */
export interface ConfigLookupResult {
  found: boolean;
  config?: any;
  source: 'user' | 'environment' | 'default' | 'none';
  error?: string;
}

/**
 * 配置管理器类
 */
export class ConfigManager {
  /**
   * 获取提供商的基础名称
   * 例如：openai-responses -> openai
   */
  getBaseProviderName(provider: AIProvider): string {
    // Response API 使用 openai 的配置
    if (provider === 'openai-responses') {
      return 'openai';
    }
    return provider;
  }

  /**
   * 查找用户配置
   * 优先级：用户配置 > 环境变量 > 默认配置
   */
  async findUserConfig(
    userId: string,
    provider: AIProvider
  ): Promise<ConfigLookupResult> {
    try {
      // 获取基础提供商名称（用于配置查找）
      const baseProvider = this.getBaseProviderName(provider);

      // 1. 尝试从数据库获取用户配置
      const { data: userConfigs, error } = await jsonDatabase.getAIProvidersByUserId(userId);

      if (error) {
        console.error(`[ConfigManager] 获取用户配置失败:`, error);
        return {
          found: false,
          source: 'none',
          error: `获取用户配置失败: ${error}`
        };
      }

      // 查找匹配的配置（使用基础提供商名称）
      const userConfig = userConfigs?.find(
        (config: any) => config.provider_name === baseProvider && config.is_active
      );

      if (userConfig) {
        console.log(`[ConfigManager] 找到用户配置: ${baseProvider}`);
        return {
          found: true,
          config: userConfig,
          source: 'user'
        };
      }

      // 2. 尝试从环境变量获取配置
      const envConfig = this.getEnvironmentConfig(baseProvider);
      if (envConfig) {
        console.log(`[ConfigManager] 使用环境变量配置: ${baseProvider}`);
        return {
          found: true,
          config: envConfig,
          source: 'environment'
        };
      }

      // 3. 使用默认配置
      const defaultConfig = this.getDefaultConfig(baseProvider);
      if (defaultConfig) {
        console.log(`[ConfigManager] 使用默认配置: ${baseProvider}`);
        return {
          found: true,
          config: defaultConfig,
          source: 'default'
        };
      }

      return {
        found: false,
        source: 'none',
        error: `未找到 ${baseProvider} 的配置，请在设置页面配置 API Key`
      };
    } catch (error: any) {
      console.error(`[ConfigManager] 查找配置时发生错误:`, error);
      return {
        found: false,
        source: 'none',
        error: `查找配置失败: ${error.message}`
      };
    }
  }

  /**
   * 从环境变量获取配置
   */
  private getEnvironmentConfig(provider: string): any | null {
    const envConfigs: Record<string, any> = {
      'openai': process.env.OPENAI_API_KEY ? {
        api_key: process.env.OPENAI_API_KEY,
        base_url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        default_model: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o',
        provider_name: 'openai'
      } : null,
      'gemini': process.env.GEMINI_API_KEY ? {
        api_key: process.env.GEMINI_API_KEY,
        base_url: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
        default_model: process.env.GEMINI_DEFAULT_MODEL || 'gemini-2.0-flash-exp',
        provider_name: 'gemini'
      } : null,
      'claude': process.env.CLAUDE_API_KEY ? {
        api_key: process.env.CLAUDE_API_KEY,
        base_url: process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com',
        default_model: process.env.CLAUDE_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
        provider_name: 'claude'
      } : null,
      'xai': process.env.XAI_API_KEY ? {
        api_key: process.env.XAI_API_KEY,
        base_url: process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
        default_model: process.env.XAI_DEFAULT_MODEL || 'grok-2-1212',
        provider_name: 'xai'
      } : null,
      'ollama': {
        api_key: '',
        base_url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        default_model: process.env.OLLAMA_DEFAULT_MODEL || 'llama3.3',
        provider_name: 'ollama'
      }
    };

    return envConfigs[provider] || null;
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(provider: string): any | null {
    const defaultConfigs: Record<string, any> = {
      'openai': {
        api_key: '',
        base_url: 'https://api.openai.com/v1',
        default_model: 'gpt-4o',
        provider_name: 'openai'
      },
      'claude': {
        api_key: '',
        base_url: 'https://api.anthropic.com',
        default_model: 'claude-3-5-sonnet-20241022',
        provider_name: 'claude'
      },
      'gemini': {
        api_key: '',
        base_url: 'https://generativelanguage.googleapis.com',
        default_model: 'gemini-2.0-flash-exp',
        provider_name: 'gemini'
      },
      'xai': {
        api_key: '',
        base_url: 'https://api.x.ai/v1',
        default_model: 'grok-2-1212',
        provider_name: 'xai'
      },
      'ollama': {
        api_key: '',
        base_url: 'http://localhost:11434',
        default_model: 'llama3.3',
        provider_name: 'ollama'
      }
    };

    return defaultConfigs[provider] || null;
  }

  /**
   * 验证配置完整性
   */
  validateConfig(provider: AIProvider, config: any): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 获取基础提供商名称
    const baseProvider = this.getBaseProviderName(provider);

    // 基础验证
    if (!config) {
      errors.push('配置对象不能为空');
      return { valid: false, errors, warnings };
    }

    // API Key 验证（Ollama 除外）
    if (baseProvider !== 'ollama') {
      if (!config.api_key || config.api_key.trim() === '') {
        errors.push(`${baseProvider} 需要配置 API Key`);
      } else if (config.api_key === 'undefined' || config.api_key === 'null') {
        errors.push(`${baseProvider} 的 API Key 无效`);
      }
    }

    // Base URL 验证
    if (!config.base_url || config.base_url.trim() === '') {
      errors.push(`${baseProvider} 需要配置 Base URL`);
    } else {
      try {
        const url = new URL(config.base_url);
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push('Base URL 必须使用 http 或 https 协议');
        }
      } catch (urlError) {
        errors.push('Base URL 格式无效');
      }
    }

    // 模型验证
    if (!config.default_model || config.default_model.trim() === '') {
      warnings.push(`${baseProvider} 未配置默认模型，将使用系统默认值`);
    }

    // Response API 特殊验证
    if (provider === 'openai-responses') {
      if (config.use_responses_api !== 'true' && config.use_responses_api !== true) {
        warnings.push('使用 Response API 但未在配置中启用 use_responses_api 标志');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 转换配置为 AI 服务配置格式
   */
  toAIServiceConfig(
    provider: AIProvider,
    config: any,
    model?: string,
    parameters?: any
  ): AIServiceConfig {
    const baseProvider = this.getBaseProviderName(provider);

    const aiConfig: AIServiceConfig = {
      provider: provider,
      apiKey: config.api_key || '',
      baseUrl: config.base_url || this.getDefaultConfig(baseProvider)?.base_url || '',
      model: model || config.default_model || this.getDefaultConfig(baseProvider)?.default_model || '',
      temperature: parameters?.temperature ?? 0.7,
      maxTokens: parameters?.maxTokens,
      topP: parameters?.topP ?? 1.0,

      // Thinking parameters
      enableThinking: parameters?.enableThinking,
      thinkingBudget: parameters?.thinkingBudget,
      reasoningEffort: parameters?.reasoningEffort,
      includeThoughts: parameters?.includeThoughts,
      thoughtSignatures: parameters?.thoughtSignatures
    };

    // Response API 特殊参数
    if (provider === 'openai-responses') {
      aiConfig.useResponsesAPI = true;
      aiConfig.store = true;
      aiConfig.background = parameters?.background ?? false;

      // 构建工具配置
      if (parameters?.researchTools) {
        const tools: any[] = [];
        if (parameters.researchTools.webSearch) {
          tools.push({ type: 'web_search', enabled: true });
        }
        if (parameters.researchTools.codeInterpreter) {
          tools.push({ type: 'code_interpreter', enabled: true });
        }
        if (parameters.researchTools.fileSearch) {
          tools.push({ type: 'file_search', enabled: true });
        }
        if (tools.length > 0) {
          aiConfig.tools = tools;
        }
      }
    }

    return aiConfig;
  }

  /**
   * 检查是否应该使用 Response API
   */
  shouldUseResponsesAPI(provider: AIProvider, config: any, parameters?: any): boolean {
    // 只有 OpenAI 支持 Response API
    if (provider !== 'openai' && provider !== 'openai-responses') {
      return false;
    }

    // 检查参数中的标志
    if (parameters?.useResponsesAPI === true) {
      return true;
    }

    // 检查用户配置中的标志
    if (config?.use_responses_api === 'true' || config?.use_responses_api === true) {
      return true;
    }

    return false;
  }

  /**
   * 获取实际使用的提供商名称
   */
  getActualProvider(provider: AIProvider, config: any, parameters?: any): AIProvider {
    if (this.shouldUseResponsesAPI(provider, config, parameters)) {
      return 'openai-responses';
    }
    return provider;
  }

  /**
   * 生成配置错误提示
   */
  getConfigErrorMessage(provider: AIProvider, lookupResult: ConfigLookupResult): string {
    const baseProvider = this.getBaseProviderName(provider);

    if (lookupResult.error) {
      return lookupResult.error;
    }

    if (!lookupResult.found) {
      return `未找到 ${baseProvider} 的配置。请在设置页面配置 API Key 和其他必要参数。`;
    }

    return `${baseProvider} 配置无效，请检查配置信息。`;
  }

  /**
   * 生成配置验证错误提示
   */
  getValidationErrorMessage(
    provider: AIProvider,
    validationResult: ConfigValidationResult
  ): string {
    const baseProvider = this.getBaseProviderName(provider);

    if (validationResult.errors.length === 0) {
      return '';
    }

    const errorList = validationResult.errors.map(err => `• ${err}`).join('\n');
    return `${baseProvider} 配置验证失败:\n${errorList}`;
  }
}

// 导出单例
export const configManager = new ConfigManager();
