/**
 * 商业化扩展相关的类型定义
 * 为未来的订阅模式、API限制等功能预留接口
 */

// 订阅计划类型
export type SubscriptionPlan = 'free' | 'pro' | 'enterprise' | 'custom';

// 订阅状态
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'pending';

// 用户订阅信息
export interface UserSubscription {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startDate: string;
  endDate?: string;
  features: string[];
  apiLimits: {
    dailyRequests: number;
    monthlyRequests: number;
    maxTokensPerRequest: number;
    concurrentRequests: number;
  };
  created_at: string;
  updated_at: string;
}

// API使用统计
export interface ApiUsage {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  provider: string;
  model: string;
  requests: number;
  tokensUsed: number;
  cost?: number; // 成本（美元）
  created_at: string;
}

// 功能权限配置
export interface FeaturePermissions {
  // AI模型访问权限
  aiModels: {
    openai: string[]; // 可用的OpenAI模型列表
    gemini: string[]; // 可用的Gemini模型列表
    claude: string[]; // 可用的Claude模型列表
    custom: string[]; // 自定义模型
  };
  
  // API限制
  apiLimits: {
    dailyRequests: number;
    monthlyRequests: number;
    maxTokensPerRequest: number;
    concurrentRequests: number;
  };
  
  // 功能开关
  features: {
    dataExport: boolean;
    dataImport: boolean;
    advancedAnalytics: boolean;
    prioritySupport: boolean;
    customBranding: boolean;
    apiAccess: boolean;
  };
}

// 订阅计划配置
export interface PlanConfig {
  id: SubscriptionPlan;
  name: string;
  description: string;
  price: {
    monthly: number;
    yearly: number;
  };
  permissions: FeaturePermissions;
  features: string[];
  recommended?: boolean;
}

// 商业化配置
export interface BusinessConfig {
  // 是否启用商业化功能
  enabled: boolean;
  
  // 默认计划（免费用户）
  defaultPlan: SubscriptionPlan;
  
  // 可用的订阅计划
  availablePlans: PlanConfig[];
  
  // 支付相关配置
  payment: {
    provider: 'stripe' | 'paypal' | 'custom';
    webhookUrl?: string;
    returnUrl?: string;
    cancelUrl?: string;
  };
  
  // API密钥管理
  apiKeys: {
    enabled: boolean;
    maxKeysPerUser: number;
    keyPrefix: string;
  };
}

// API密钥
export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  key: string;
  lastUsed?: string;
  permissions: string[];
  expiresAt?: string;
  created_at: string;
  updated_at: string;
}

// 使用量统计响应
export interface UsageStatsResponse {
  current: {
    daily: number;
    monthly: number;
    tokens: number;
  };
  limits: {
    daily: number;
    monthly: number;
    maxTokens: number;
  };
  remaining: {
    daily: number;
    monthly: number;
  };
  resetDate: {
    daily: string;
    monthly: string;
  };
}