/**
 * AI服务管理器 - 统一管理所有AI服务适配器
 */
import { OpenAIAdapter } from './openai-adapter.js';
import { OpenAIResponsesAdapter } from './openai-responses-adapter.js';
import { ClaudeAdapter } from './claude-adapter.js';
import { GeminiAdapter } from './gemini-adapter.js';
import { XAIAdapter } from './xai-adapter.js';
import { OllamaAdapter } from './ollama-adapter.js';
import { 
  AIProvider, 
  AIServiceAdapter, 
  AIServiceConfig, 
  ChatMessage, 
  AIResponse, 
  StreamResponse, 
  AIServiceError 
} from './types.js';
import { modelParameterService } from '../../src/lib/model-parameters/index.js';
import type { ProviderLimits } from '../../src/lib/model-parameters/types.js';

export class AIServiceManager {
  private adapters: Map<AIProvider, AIServiceAdapter> = new Map();
  private parameterServiceReady = false;

  constructor() {
    // 注册所有AI服务适配器
    this.adapters.set('openai', new OpenAIAdapter());
    this.adapters.set('claude', new ClaudeAdapter());
    this.adapters.set('gemini', new GeminiAdapter());
    this.adapters.set('xai', new XAIAdapter());
    this.adapters.set('ollama', new OllamaAdapter());
    
    // 内部注册 openai-responses 适配器，但不暴露给用户配置
    this.adapters.set('openai-responses', new OpenAIResponsesAdapter());
    
    // 初始化模型参数服务
    this.initializeParameterService();
  }
  
  private async initializeParameterService(): Promise<void> {
    try {
      await modelParameterService.initialize();
      this.parameterServiceReady = true;
      console.log('[AIServiceManager] 模型参数服务初始化完成');
    } catch (error) {
      console.warn('[AIServiceManager] 模型参数服务初始化失败，使用默认配置', error);
      this.parameterServiceReady = false;
    }
  }

  /**
   * 获取指定提供商的适配器
   */
  getAdapter(provider: AIProvider): AIServiceAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new AIServiceError(`不支持的AI服务提供商: ${provider}`, provider);
    }
    return adapter;
  }

  /**
   * 获取所有支持的提供商列表（不包括内部适配器）
   */
  getSupportedProviders(): AIProvider[] {
    const allProviders = Array.from(this.adapters.keys());
    // 过滤掉内部使用的 openai-responses 适配器
    return allProviders.filter(provider => provider !== 'openai-responses');
  }

  /**
   * 发送聊天消息
   */
  async chat(
    provider: AIProvider, 
    messages: ChatMessage[], 
    config: AIServiceConfig
  ): Promise<AIResponse> {
    const adapter = this.getAdapter(provider);
    return adapter.chat(messages, config);
  }

  /**
   * 发送流式聊天消息
   */
  async *streamChat(
    provider: AIProvider, 
    messages: ChatMessage[], 
    config: AIServiceConfig
  ): AsyncGenerator<StreamResponse> {
    const adapter = this.getAdapter(provider);
    if (adapter.streamChat) {
      yield* adapter.streamChat(messages, config);
    } else {
      throw new AIServiceError(`${provider} does not support streaming`, provider);
    }
  }

  /**
   * 测试连接
   */
  async testConnection(provider: AIProvider, config: AIServiceConfig): Promise<boolean> {
    try {
      const adapter = this.getAdapter(provider);
      return await adapter.testConnection(config);
    } catch (_error) {
      return false;
    }
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(provider: AIProvider, config: AIServiceConfig): Promise<{ id: string; name: string }[]> {
    const adapter = this.getAdapter(provider);
    return adapter.getAvailableModels(config);
  }

  /**
   * 测试指定模型是否可用
   */
  async testSpecificModel(provider: AIProvider, config: AIServiceConfig): Promise<boolean> {
    try {
      const adapter = this.getAdapter(provider);
      
      // 发送一个简单的测试消息来验证模型是否真的可用
      const testMessages: ChatMessage[] = [
        { role: 'user', content: 'Test' }
      ];
      
      console.log(`[DEBUG] Testing model ${config.model} for provider ${provider}`);
      const response = await adapter.chat(testMessages, config);
      
      const isValid = !!(response && response.content && response.content.trim().length > 0);
      console.log(`[DEBUG] Model test result for ${config.model}:`, isValid, response?.content?.substring(0, 50));
      
      return isValid;
    } catch (error: any) {
      console.error(`[DEBUG] testSpecificModel failed for ${provider}:${config.model}:`, {
        message: error.message,
        status: error.status || error.statusCode,
        code: error.code
      });
      
      // 检查是否是模型不存在的错误
      if (error.message && (
        error.message.includes('model') && error.message.includes('not found') ||
        error.message.includes('model') && error.message.includes('does not exist') ||
        error.message.includes('Invalid model') ||
        error.status === 404 ||
        error.statusCode === 404
      )) {
        console.log(`[DEBUG] Model ${config.model} appears to not exist`);
      }
      
      return false;
    }
  }

  /**
   * 获取提供商的默认配置（集成模型参数管理系统）
   */
  getDefaultConfig(provider: AIProvider): Partial<AIServiceConfig> {
    // 静态默认配置作为fallback
    const staticDefaults: Record<AIProvider, Partial<AIServiceConfig>> = {
      openai: {
        model: 'gpt-4o',
        baseUrl: 'https://api.openai.com/v1',
        temperature: 0.7,
        maxTokens: 4000,
        topP: 1.0
      },
      claude: {
        model: 'claude-3-5-sonnet-20241022',
        baseUrl: 'https://api.anthropic.com',
        temperature: 0.7,
        maxTokens: 4000,
        topP: undefined
      },
      gemini: {
        model: 'gemini-2.0-flash-exp',
        baseUrl: 'https://generativelanguage.googleapis.com',
        temperature: 0.7,
        topP: 0.95
      },
      xai: {
        model: 'grok-2-1212',
        baseUrl: 'https://api.x.ai/v1',
        temperature: 0.7,
        maxTokens: 4000,
        topP: 1.0
      },
      ollama: {
        model: 'llama3.3',
        baseUrl: 'http://localhost:11434',
        temperature: 0.7,
        maxTokens: 4000,
        topP: 1.0
      },
      // 内部使用的默认配置，不暴露给用户
      'openai-responses': {
        model: 'gpt-4o', // 使用标准模型作为默认，避免使用可能不存在的研究模型
        baseUrl: 'https://api.openai.com/v1',
        temperature: 0.7,
        maxTokens: 100000,
        topP: 1.0,
        useResponsesAPI: true,
        background: true,
        tools: [
          { type: 'web_search', enabled: true },
          { type: 'code_interpreter', enabled: true },
          { type: 'file_search', enabled: true }
        ]
      }
    };

    return staticDefaults[provider] || {};
  }
  
  /**
   * 获取模型参数限制（新增方法）
   */
  async getModelLimits(provider: AIProvider, modelId?: string): Promise<ProviderLimits> {
    if (!this.parameterServiceReady) {
      await this.initializeParameterService();
    }
    
    try {
      // 使用提供的modelId或默认模型
      const targetModel = modelId || this.getDefaultConfig(provider).model || '';
      return await modelParameterService.getModelLimits(provider, targetModel);
    } catch (error) {
      console.warn(`[AIServiceManager] 获取模型限制失败: ${provider}:${modelId}`, error);
      // 返回基础默认限制
      return {
        temperature: { min: 0, max: 2, default: 1, step: 0.1 },
        maxTokens: { min: 1, max: 4096, default: 1024 },
        topP: { min: 0, max: 1, default: 1, step: 0.01 }
      };
    }
  }
  
  /**
   * 获取模型能力信息（新增方法）
   */
  async getModelCapabilities(provider: AIProvider, modelId?: string) {
    if (!this.parameterServiceReady) {
      await this.initializeParameterService();
    }
    
    try {
      const targetModel = modelId || this.getDefaultConfig(provider).model || '';
      return await modelParameterService.getModelCapabilities(provider, targetModel);
    } catch (error) {
      console.warn(`[AIServiceManager] 获取模型能力失败: ${provider}:${modelId}`, error);
      return {};
    }
  }

  /**
   * 验证配置是否完整（使用模型参数管理系统进行动态验证）
   */
  async validateConfig(provider: AIProvider, config: AIServiceConfig): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // 通用验证
    if (!config.model) {
      errors.push('模型名称不能为空');
    }

    // API Key验证
    if (provider !== 'ollama' && !config.apiKey) {
      errors.push('API Key不能为空');
    }
    
    if (provider === 'ollama' && !config.baseUrl) {
      errors.push('Base URL不能为空');
    }

    // 使用模型参数管理系统进行参数范围验证
    try {
      const limits = await this.getModelLimits(provider, config.model);
      
      // Temperature验证
      if (config.temperature !== undefined) {
        const tempLimit = limits.temperature;
        if (config.temperature < tempLimit.min || config.temperature > tempLimit.max) {
          errors.push(`${provider} temperature值必须在${tempLimit.min}-${tempLimit.max}之间`);
        }
      }
      
      // MaxTokens验证
      if (config.maxTokens !== undefined) {
        const tokenLimit = limits.maxTokens;
        if (config.maxTokens <= 0 || config.maxTokens > tokenLimit.max) {
          errors.push(`${provider} maxTokens必须在1-${tokenLimit.max}之间`);
        }
      }
      
      // TopP验证
      if (config.topP !== undefined && limits.topP) {
        const topPLimit = limits.topP;
        if (config.topP < topPLimit.min || config.topP > topPLimit.max) {
          errors.push(`${provider} topP值必须在${topPLimit.min}-${topPLimit.max}之间`);
        }
      }
      
      // TopK验证（如果支持）
      if (config.topK !== undefined && limits.topK) {
        const topKLimit = limits.topK;
        if (config.topK < topKLimit.min || config.topK > topKLimit.max) {
          errors.push(`${provider} topK值必须在${topKLimit.min}-${topKLimit.max}之间`);
        }
      }
      
      // Ollama特有参数验证
      if (provider === 'ollama') {
        if (config.numPredict !== undefined && limits.numPredict) {
          const numPredictLimit = limits.numPredict;
          if (config.numPredict < numPredictLimit.min || config.numPredict > numPredictLimit.max) {
            errors.push(`Ollama numPredict值必须在${numPredictLimit.min}-${numPredictLimit.max}之间`);
          }
        }
        
        if (config.numCtx !== undefined && limits.numCtx) {
          const numCtxLimit = limits.numCtx;
          if (config.numCtx < numCtxLimit.min || config.numCtx > numCtxLimit.max) {
            errors.push(`Ollama numCtx值必须在${numCtxLimit.min}-${numCtxLimit.max}之间`);
          }
        }
        
        if (config.repeatPenalty !== undefined && limits.repeatPenalty) {
          const repeatPenaltyLimit = limits.repeatPenalty;
          if (config.repeatPenalty < repeatPenaltyLimit.min || config.repeatPenalty > repeatPenaltyLimit.max) {
            errors.push(`Ollama repeatPenalty值必须在${repeatPenaltyLimit.min}-${repeatPenaltyLimit.max}之间`);
          }
        }
      }
      
      // Claude特殊规则：不建议同时设置temperature和topP
      if (provider === 'claude' && config.temperature !== undefined && config.topP !== undefined) {
        errors.push('Claude不建议同时设置temperature和topP参数，请选择一个使用');
      }
      
    } catch (error) {
      console.warn(`[AIServiceManager] 参数验证失败，使用基础验证: ${provider}`, error);
      // Fallback到基础验证逻辑
      this.basicValidateConfig(provider, config, errors);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * 基础参数验证（fallback方法）
   */
  private basicValidateConfig(provider: AIProvider, config: AIServiceConfig, errors: string[]): void {
    // 基础的硬编码验证逻辑
    switch (provider) {
      case 'openai':
        if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
          errors.push('OpenAI temperature值必须在0.0-2.0之间');
        }
        break;
      case 'claude':
        if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 1)) {
          errors.push('Claude temperature值必须在0.0-1.0之间');
        }
        break;
      // 其他provider的基础验证...
    }
  }
}

// 导出单例实例
export const aiServiceManager = new AIServiceManager();

// 确保模型参数服务在应用启动时初始化
aiServiceManager.getModelLimits('openai', 'gpt-4o').catch(() => {
  // 静默处理初始化错误
});