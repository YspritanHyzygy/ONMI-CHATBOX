/**
 * 模型参数管理系统入口
 * 统一导出所有模块，提供简单的使用接口
 */

export * from './types';
export * from './utils';
export * from './static-manager';
export * from './dynamic-manager';

import { StaticDataManager } from './static-manager';
import { DynamicDataManager } from './dynamic-manager';
import type { DataManager, DataManagerConfig, ProviderLimits } from './types';
import { mapToProviderLimits, getDefaultProviderLimits, logger } from './utils';

/**
 * 模型参数管理器工厂
 * 根据配置创建合适的数据管理器
 */
export class ModelParameterManagerFactory {
  private static instance: DataManager | null = null;
  
  static create(config: Partial<DataManagerConfig> = {}): DataManager {
    const mode = config.mode || 'static';
    
    switch (mode) {
      case 'static':
        return new StaticDataManager(config);
      case 'dynamic':
        return new DynamicDataManager(config);
      case 'hybrid':
        // 混合模式：优先动态，fallback到静态
        return new DynamicDataManager({ ...config, fallbackToStatic: true });
      default:
        logger.warn(`未知的数据管理器模式: ${mode}，使用静态模式`);
        return new StaticDataManager(config);
    }
  }
  
  static getInstance(config?: Partial<DataManagerConfig>): DataManager {
    if (!this.instance) {
      this.instance = this.create(config);
    }
    return this.instance;
  }
  
  static reset(): void {
    this.instance = null;
  }
}

/**
 * 便捷的模型参数获取接口
 * 为现有系统提供简单的集成方式
 */
export class ModelParameterService {
  private manager: DataManager;
  
  constructor(config: Partial<DataManagerConfig> = {}) {
    // 当前项目默认使用静态模式
    const defaultConfig: Partial<DataManagerConfig> = {
      mode: 'static',
      enableCache: true,
      fallbackToStatic: true,
      ...config
    };
    
    this.manager = ModelParameterManagerFactory.create(defaultConfig);
  }
  
  async initialize(): Promise<void> {
    await this.manager.initialize();
  }
  
  /**
   * 获取模型参数限制（映射到现有系统格式）
   */
  async getModelLimits(provider: string, modelId: string): Promise<ProviderLimits> {
    try {
      const entry = await this.manager.getModelParameters(provider, modelId);
      if (entry) {
        return mapToProviderLimits(entry);
      }
    } catch (error) {
      logger.warn(`获取模型参数失败: ${provider}:${modelId}`, error);
    }
    
    // 返回默认限制
    return getDefaultProviderLimits(provider);
  }
  
  /**
   * 检查模型是否支持特定功能
   */
  async getModelCapabilities(provider: string, modelId: string) {
    try {
      const entry = await this.manager.getModelParameters(provider, modelId);
      return entry?.capabilities || {};
    } catch (error) {
      logger.warn(`获取模型能力失败: ${provider}:${modelId}`, error);
      return {};
    }
  }
  
  /**
   * 获取provider的所有可用模型
   */
  async getAvailableModels(provider: string) {
    try {
      const models = await this.manager.getProviderModels(provider);
      return models.map(model => ({
        id: model.modelId,
        name: model.displayName,
        description: model.description,
        capabilities: model.capabilities
      }));
    } catch (error) {
      logger.warn(`获取可用模型失败: ${provider}`, error);
      return [];
    }
  }
  
  /**
   * 获取所有支持的provider
   */
  async getSupportedProviders() {
    try {
      return await this.manager.getAllProviders();
    } catch (error) {
      logger.warn('获取支持的provider失败', error);
      return [];
    }
  }
  
  isReady(): boolean {
    return this.manager.isReady();
  }
}

// 导出单例实例供全局使用
export const modelParameterService = new ModelParameterService();

// 开发模式下的额外功能
if (process.env.NODE_ENV === 'development') {
  // 暴露到全局对象，方便调试
  (globalThis as any).__modelParameterService = modelParameterService;
  (globalThis as any).__ModelParameterManagerFactory = ModelParameterManagerFactory;
}
