/**
 * 模型参数仓库核心类型定义
 * 支持静态和动态两种数据管理模式
 */

// 基础模型参数条目
export interface ModelParameterEntry {
  modelId: string;
  provider: string;
  displayName: string;
  description: string;
  limits: ModelLimits;
  capabilities: ModelCapabilities;
  metadata: ModelMetadata;
}

// 模型参数限制
export interface ModelLimits {
  // 通用参数
  temperature?: {
    min: number;
    max: number;
    default: number;
    step?: number;
  };
  maxTokens?: {
    min: number;
    max: number;
    default: number;
  };
  topP?: {
    min: number;
    max: number;
    default: number;
    step?: number;
  };
  topK?: {
    min: number;
    max: number;
    default: number;
  };
  
  // Ollama特有参数
  numPredict?: {
    min: number;
    max: number;
    default: number;
  };
  numCtx?: {
    min: number;
    max: number;
    default: number;
  };
  repeatPenalty?: {
    min: number;
    max: number;
    default: number;
    step?: number;
  };
  
  // 其他provider特有参数
  [key: string]: any;
}

// 模型能力
export interface ModelCapabilities {
  supportsStreaming?: boolean;
  supportsImages?: boolean;
  supportsTools?: boolean;
  supportsSystemPrompt?: boolean;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  supportedLanguages?: string[];
}

// 模型元数据
export interface ModelMetadata {
  version: string;
  lastUpdated: string;
  source: 'static' | 'dynamic' | 'api';
  deprecated?: boolean;
  releaseDate?: string;
  tags?: string[];
}

// Provider索引
export interface ProviderIndex {
  provider: string;
  displayName: string;
  description: string;
  models: string[];
  lastUpdated: string;
  apiEndpoint?: string;
}

// 数据管理器接口
export interface DataManager {
  initialize(): Promise<void>;
  getModelParameters(provider: string, modelId: string): Promise<ModelParameterEntry | null>;
  getProviderModels(provider: string): Promise<ModelParameterEntry[]>;
  getAllProviders(): Promise<ProviderIndex[]>;
  isReady(): boolean;
}

// 数据管理器配置
export interface DataManagerConfig {
  mode: 'static' | 'dynamic' | 'hybrid';
  staticConfigPath?: string;
  enableCache?: boolean;
  cacheTimeout?: number;
  fallbackToStatic?: boolean;
}

// Gemini API响应类型
export interface GeminiModelInfo {
  name: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedGenerationMethods: string[];
  temperature?: number;
  topP?: number;
  topK?: number;
}

// 搜索查询
export interface ModelSearchQuery {
  provider?: string;
  capabilities?: Partial<ModelCapabilities>;
  tags?: string[];
  deprecated?: boolean;
}

// 现有系统的ProviderLimits映射
export interface ProviderLimits {
  temperature: { min: number; max: number; default: number; step?: number };
  maxTokens: { min: number; max: number; default: number };
  topP: { min: number; max: number; default: number; step?: number };
  topK?: { min: number; max: number; default: number };
  // Ollama特有
  numPredict?: { min: number; max: number; default: number };
  numCtx?: { min: number; max: number; default: number };
  repeatPenalty?: { min: number; max: number; default: number; step?: number };
}
