/**
 * 动态数据管理器
 * 通过Gemini API实时获取模型参数信息
 * 注意：此功能在当前项目中实现但默认不启用，为独立项目做准备
 */

import type { 
  DataManager, 
  ModelParameterEntry, 
  ProviderIndex, 
  DataManagerConfig,
  GeminiModelInfo 
} from './types';
import { logger } from './utils';
import { StaticDataManager } from './static-manager';

export class DynamicDataManager implements DataManager {
  private cache = new Map<string, ModelParameterEntry>();
  private lastFetch = new Map<string, number>();
  private ready = false;
  private config: DataManagerConfig;
  private staticFallback: StaticDataManager;

  constructor(config: Partial<DataManagerConfig> = {}) {
    this.config = {
      mode: 'dynamic',
      enableCache: true,
      cacheTimeout: 3600000, // 1小时
      fallbackToStatic: true,
      ...config
    };
    
    // 创建静态管理器作为fallback
    this.staticFallback = new StaticDataManager();
  }

  async initialize(): Promise<void> {
    try {
      // 初始化静态fallback
      await this.staticFallback.initialize();
      this.ready = true;
      logger.info('动态数据管理器初始化完成');
    } catch (error) {
      logger.error('动态数据管理器初始化失败', error);
      throw error;
    }
  }

  async getModelParameters(provider: string, modelId: string): Promise<ModelParameterEntry | null> {
    if (!this.ready) {
      await this.initialize();
    }

    // 只有Gemini使用动态获取，其他provider使用静态配置
    if (provider !== 'gemini') {
      return this.staticFallback.getModelParameters(provider, modelId);
    }

    // 检查缓存
    const cacheKey = `${provider}:${modelId}`;
    if (this.config.enableCache && this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      // 尝试从Gemini API获取
      const entry = await this.fetchGeminiModelInfo(modelId);
      if (entry) {
        this.cache.set(cacheKey, entry);
        this.lastFetch.set(cacheKey, Date.now());
        return entry;
      }
    } catch (error) {
      logger.warn(`从Gemini API获取模型信息失败: ${modelId}`, error);
    }

    // Fallback到静态配置
    if (this.config.fallbackToStatic) {
      logger.info(`使用静态配置作为fallback: ${modelId}`);
      return this.staticFallback.getModelParameters(provider, modelId);
    }

    return null;
  }

  async getProviderModels(provider: string): Promise<ModelParameterEntry[]> {
    if (!this.ready) {
      await this.initialize();
    }

    // 只有Gemini使用动态获取
    if (provider !== 'gemini') {
      return this.staticFallback.getProviderModels(provider);
    }

    try {
      // 获取Gemini所有可用模型
      const models = await this.fetchGeminiModels();
      return models;
    } catch (error) {
      logger.warn('从Gemini API获取模型列表失败', error);
      
      // Fallback到静态配置
      if (this.config.fallbackToStatic) {
        return this.staticFallback.getProviderModels(provider);
      }
      
      return [];
    }
  }

  async getAllProviders(): Promise<ProviderIndex[]> {
    // 使用静态管理器的provider列表
    return this.staticFallback.getAllProviders();
  }

  isReady(): boolean {
    return this.ready;
  }

  private isCacheValid(cacheKey: string): boolean {
    if (!this.cache.has(cacheKey) || !this.lastFetch.has(cacheKey)) {
      return false;
    }
    
    const lastFetchTime = this.lastFetch.get(cacheKey)!;
    const now = Date.now();
    return (now - lastFetchTime) < this.config.cacheTimeout!;
  }

  private async fetchGeminiModelInfo(modelId: string): Promise<ModelParameterEntry | null> {
    // 检查环境变量
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY环境变量未设置');
    }

    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    const url = `${baseUrl}/models/${modelId}?key=${apiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const modelInfo: GeminiModelInfo = await response.json();
      return this.convertGeminiModelInfo(modelInfo);
      
    } catch (error) {
      logger.error(`获取Gemini模型信息失败: ${modelId}`, error);
      throw error;
    }
  }

  private async fetchGeminiModels(): Promise<ModelParameterEntry[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY环境变量未设置');
    }

    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    const url = `${baseUrl}/models?key=${apiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const models: ModelParameterEntry[] = [];

      for (const model of data.models || []) {
        // 只处理generateContent支持的模型
        if (model.supportedGenerationMethods?.includes('generateContent')) {
          const entry = this.convertGeminiModelInfo(model);
          if (entry) {
            models.push(entry);
          }
        }
      }

      return models;
      
    } catch (error) {
      logger.error('获取Gemini模型列表失败', error);
      throw error;
    }
  }

  private convertGeminiModelInfo(modelInfo: GeminiModelInfo): ModelParameterEntry | null {
    try {
      // 从模型名称提取modelId (去除models/前缀)
      const modelId = modelInfo.name.replace('models/', '');
      
      return {
        modelId,
        provider: 'gemini',
        displayName: modelInfo.displayName || modelId,
        description: modelInfo.description || `Google Gemini ${modelId}`,
        limits: {
          temperature: {
            min: 0,
            max: 2,
            default: modelInfo.temperature || 1,
            step: 0.1
          },
          maxTokens: {
            min: 1,
            max: modelInfo.outputTokenLimit || 8192,
            default: Math.min(1024, modelInfo.outputTokenLimit || 1024)
          },
          topP: {
            min: 0,
            max: 1,
            default: modelInfo.topP || 0.95,
            step: 0.01
          },
          topK: {
            min: 1,
            max: 40,
            default: modelInfo.topK || 40
          }
        },
        capabilities: {
          supportsStreaming: true,
          supportsImages: modelInfo.supportedGenerationMethods?.includes('generateContent') || false,
          supportsTools: true,
          supportsSystemPrompt: true,
          maxInputTokens: modelInfo.inputTokenLimit || 1000000,
          maxOutputTokens: modelInfo.outputTokenLimit || 8192
        },
        metadata: {
          version: '1.0.0',
          lastUpdated: new Date().toISOString(),
          source: 'dynamic',
          tags: ['gemini', 'google']
        }
      };
    } catch (error) {
      logger.error('转换Gemini模型信息失败', error);
      return null;
    }
  }

  // 手动刷新缓存
  async refreshCache(provider?: string, modelId?: string): Promise<void> {
    if (provider && modelId) {
      // 刷新特定模型
      const cacheKey = `${provider}:${modelId}`;
      this.cache.delete(cacheKey);
      this.lastFetch.delete(cacheKey);
      await this.getModelParameters(provider, modelId);
    } else if (provider === 'gemini') {
      // 刷新整个Gemini provider
      const keysToDelete = Array.from(this.cache.keys()).filter(key => key.startsWith('gemini:'));
      keysToDelete.forEach(key => {
        this.cache.delete(key);
        this.lastFetch.delete(key);
      });
      await this.getProviderModels('gemini');
    } else {
      // 刷新所有缓存
      this.cache.clear();
      this.lastFetch.clear();
    }
    
    logger.info('缓存已刷新');
  }

  // 获取缓存统计
  getCacheStats() {
    return {
      totalCached: this.cache.size,
      geminiCached: Array.from(this.cache.keys()).filter(key => key.startsWith('gemini:')).length,
      lastFetchTimes: Object.fromEntries(this.lastFetch.entries()),
      staticFallbackStats: this.staticFallback.getCacheStats()
    };
  }
}
