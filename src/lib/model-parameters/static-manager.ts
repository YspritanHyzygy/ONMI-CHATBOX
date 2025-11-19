/**
 * 静态数据管理器
 * 从预构建的JSON配置文件加载模型参数
 */

import type { 
  DataManager, 
  ModelParameterEntry, 
  ProviderIndex, 
  DataManagerConfig 
} from './types';
import { validateModelParameterEntry, createDefaultModelEntry, fuzzyMatchModelId, logger } from './utils';

export class StaticDataManager implements DataManager {
  private cache = new Map<string, ModelParameterEntry>();
  private providerCache = new Map<string, Record<string, ModelParameterEntry>>();
  private ready = false;

  constructor(_config: Partial<DataManagerConfig> = {}) {
    // 静态管理器不需要额外配置，保留参数以保持接口一致性
  }

  async initialize(): Promise<void> {
    try {
      await this.loadAllConfigs();
      this.ready = true;
      logger.info('静态数据管理器初始化完成');
    } catch (error) {
      logger.error('静态数据管理器初始化失败', error);
      throw error;
    }
  }

  private async loadAllConfigs(): Promise<void> {
    const providers = ['openai', 'claude', 'gemini', 'ollama', 'xai'];
    
    for (const provider of providers) {
      try {
        await this.loadProviderConfig(provider);
      } catch (error) {
        logger.warn(`加载${provider}配置失败`, error);
        // 继续加载其他provider
      }
    }
  }

  private async loadProviderConfig(provider: string): Promise<void> {
    try {
      // 动态导入配置文件
      const configModule = await import(`./data/${provider}.json`);
      const config = configModule.default;
      
      // 验证和处理配置数据
      const validatedEntries: Record<string, ModelParameterEntry> = {};
      
      for (const [modelId, entry] of Object.entries(config)) {
        if (validateModelParameterEntry(entry)) {
          validatedEntries[modelId] = entry as ModelParameterEntry;
          // 添加到全局缓存
          this.cache.set(`${provider}:${modelId}`, entry as ModelParameterEntry);
        } else {
          logger.warn(`无效的模型配置: ${provider}:${modelId}`);
        }
      }
      
      this.providerCache.set(provider, validatedEntries);
      logger.info(`已加载${provider}配置，包含${Object.keys(validatedEntries).length}个模型`);
      
    } catch (error) {
      logger.error(`加载${provider}配置失败`, error);
      throw error;
    }
  }

  async getModelParameters(provider: string, modelId: string): Promise<ModelParameterEntry | null> {
    if (!this.ready) {
      await this.initialize();
    }

    // 尝试精确匹配
    const cacheKey = `${provider}:${modelId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // 尝试模糊匹配
    const providerConfig = this.providerCache.get(provider);
    if (providerConfig) {
      const availableIds = Object.keys(providerConfig);
      const matchedId = fuzzyMatchModelId(modelId, availableIds);
      
      if (matchedId && providerConfig[matchedId]) {
        logger.info(`模糊匹配成功: ${modelId} -> ${matchedId}`);
        return providerConfig[matchedId];
      }
    }

    // 返回默认配置
    logger.warn(`未找到模型配置: ${provider}:${modelId}，使用默认配置`);
    return createDefaultModelEntry(provider, modelId);
  }

  async getProviderModels(provider: string): Promise<ModelParameterEntry[]> {
    if (!this.ready) {
      await this.initialize();
    }

    const providerConfig = this.providerCache.get(provider);
    if (!providerConfig) {
      logger.warn(`未找到provider配置: ${provider}`);
      return [];
    }

    return Object.values(providerConfig);
  }

  async getAllProviders(): Promise<ProviderIndex[]> {
    if (!this.ready) {
      await this.initialize();
    }

    const providers: ProviderIndex[] = [];
    
    for (const [provider, models] of this.providerCache.entries()) {
      providers.push({
        provider,
        displayName: this.getProviderDisplayName(provider),
        description: this.getProviderDescription(provider),
        models: Object.keys(models),
        lastUpdated: new Date().toISOString()
      });
    }

    return providers;
  }

  isReady(): boolean {
    return this.ready;
  }

  // 获取缓存统计
  getCacheStats() {
    return {
      totalModels: this.cache.size,
      providers: Array.from(this.providerCache.keys()),
      providerCounts: Object.fromEntries(
        Array.from(this.providerCache.entries()).map(([provider, models]) => [
          provider,
          Object.keys(models).length
        ])
      )
    };
  }

  // 清除缓存
  clearCache(): void {
    this.cache.clear();
    this.providerCache.clear();
    this.ready = false;
    logger.info('缓存已清除');
  }

  // 重新加载配置
  async reload(): Promise<void> {
    this.clearCache();
    await this.initialize();
    logger.info('配置已重新加载');
  }

  private getProviderDisplayName(provider: string): string {
    const names: Record<string, string> = {
      openai: 'OpenAI',
      claude: 'Anthropic Claude',
      gemini: 'Google Gemini',
      ollama: 'Ollama',
      xai: 'xAI'
    };
    return names[provider] || provider;
  }

  private getProviderDescription(provider: string): string {
    const descriptions: Record<string, string> = {
      openai: 'OpenAI GPT models',
      claude: 'Anthropic Claude models',
      gemini: 'Google Gemini models',
      ollama: 'Local Ollama models',
      xai: 'xAI Grok models'
    };
    return descriptions[provider] || `${provider} models`;
  }
}
