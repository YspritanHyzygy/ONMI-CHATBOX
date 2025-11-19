/**
 * 模型参数仓库工具函数
 */

import type { ModelParameterEntry, ProviderLimits } from './types';

/**
 * 将ModelParameterEntry转换为现有系统的ProviderLimits格式
 */
export function mapToProviderLimits(entry: ModelParameterEntry): ProviderLimits {
  const limits = entry.limits;
  
  const result: ProviderLimits = {
    temperature: limits.temperature || { min: 0, max: 2, default: 1, step: 0.1 },
    maxTokens: limits.maxTokens || { min: 1, max: 4096, default: 1024 },
    topP: limits.topP || { min: 0, max: 1, default: 1, step: 0.01 }
  };

  // 添加可选参数
  if (limits.topK) {
    result.topK = limits.topK;
  }

  // Ollama特有参数
  if (entry.provider === 'ollama') {
    if (limits.numPredict) result.numPredict = limits.numPredict;
    if (limits.numCtx) result.numCtx = limits.numCtx;
    if (limits.repeatPenalty) result.repeatPenalty = limits.repeatPenalty;
  }

  return result;
}

/**
 * 获取默认的Provider限制
 */
export function getDefaultProviderLimits(provider: string): ProviderLimits {
  const baseDefaults: ProviderLimits = {
    temperature: { min: 0, max: 2, default: 1, step: 0.1 },
    maxTokens: { min: 1, max: 4096, default: 1024 },
    topP: { min: 0, max: 1, default: 1, step: 0.01 }
  };

  switch (provider) {
    case 'openai':
      return baseDefaults;
    
    case 'claude':
      return {
        ...baseDefaults,
        temperature: { min: 0, max: 1, default: 1, step: 0.1 },
        maxTokens: { min: 1, max: 8192, default: 1024 },
        topK: { min: 1, max: 500, default: 5 }
      };
    
    case 'gemini':
      return {
        ...baseDefaults,
        topP: { min: 0, max: 1, default: 0.95, step: 0.01 },
        topK: { min: 1, max: 40, default: 40 }
      };
    
    case 'ollama':
      return {
        ...baseDefaults,
        temperature: { min: 0, max: 2, default: 0.8, step: 0.1 },
        topP: { min: 0, max: 1, default: 0.9, step: 0.01 },
        topK: { min: 1, max: 100, default: 40 },
        numPredict: { min: -1, max: 4096, default: 128 },
        numCtx: { min: 1, max: 32768, default: 2048 },
        repeatPenalty: { min: 0.5, max: 2, default: 1.1, step: 0.01 }
      };
    
    case 'xai':
      return baseDefaults;
    
    default:
      return baseDefaults;
  }
}

/**
 * 验证模型参数条目的有效性
 */
export function validateModelParameterEntry(entry: any): entry is ModelParameterEntry {
  if (!entry || typeof entry !== 'object') return false;
  
  const required = ['modelId', 'provider', 'displayName', 'description', 'limits', 'capabilities', 'metadata'];
  return required.every(field => field in entry);
}

/**
 * 创建默认的模型参数条目
 */
export function createDefaultModelEntry(provider: string, modelId: string): ModelParameterEntry {
  const limits = getDefaultProviderLimits(provider);
  
  return {
    modelId,
    provider,
    displayName: modelId,
    description: `${provider} ${modelId} model`,
    limits: {
      temperature: limits.temperature,
      maxTokens: limits.maxTokens,
      topP: limits.topP,
      ...(limits.topK && { topK: limits.topK }),
      ...(limits.numPredict && { numPredict: limits.numPredict }),
      ...(limits.numCtx && { numCtx: limits.numCtx }),
      ...(limits.repeatPenalty && { repeatPenalty: limits.repeatPenalty })
    },
    capabilities: {
      supportsStreaming: true,
      supportsImages: false,
      supportsTools: false,
      supportsSystemPrompt: true,
      maxInputTokens: 4096,
      maxOutputTokens: limits.maxTokens.max
    },
    metadata: {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      source: 'static'
    }
  };
}

/**
 * 模糊匹配模型ID
 */
export function fuzzyMatchModelId(targetId: string, availableIds: string[]): string | null {
  // 精确匹配
  if (availableIds.includes(targetId)) {
    return targetId;
  }
  
  // 去除版本号匹配
  const baseId = targetId.replace(/-\d{8}$/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
  const match = availableIds.find(id => id.startsWith(baseId));
  if (match) {
    return match;
  }
  
  // 部分匹配
  const partialMatch = availableIds.find(id => 
    id.toLowerCase().includes(targetId.toLowerCase()) ||
    targetId.toLowerCase().includes(id.toLowerCase())
  );
  
  return partialMatch || null;
}

/**
 * 获取配置文件路径
 */
export function getConfigPath(provider: string): string {
  return `/src/config/model-parameters/${provider}.json`;
}

/**
 * 日志工具
 */
export const logger = {
  info: (message: string, data?: any) => {
    console.log(`[ModelParameters] ${message}`, data || '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[ModelParameters] ${message}`, data || '');
  },
  error: (message: string, error?: any) => {
    console.error(`[ModelParameters] ${message}`, error || '');
  }
};
