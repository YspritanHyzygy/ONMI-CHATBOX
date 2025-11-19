/**
 * URL构建辅助工具
 * 用于统一处理各种AI服务的URL构建逻辑
 */

export interface ServiceEndpoints {
  models: string;
  chat?: string;
  test?: string;
  pull?: string;
}

export interface ServiceUrlConfig {
  baseUrl: string;
  apiVersion?: string;
  endpoints: ServiceEndpoints;
}

/**
 * 构建完整的API URL
 * @param baseUrl 基础URL
 * @param endpoint 端点路径
 * @param params 查询参数
 * @returns 完整的URL
 */
export function buildApiUrl(baseUrl: string, endpoint: string, params?: Record<string, string>): string {
  // 确保baseUrl不以斜杠结尾
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  
  // 确保endpoint以斜杠开头
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // 构建基础URL
  let url = `${cleanBaseUrl}${cleanEndpoint}`;
  
  // 添加查询参数
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }
  
  return url;
}

/**
 * 获取各服务的默认URL配置
 */
export const DEFAULT_SERVICE_CONFIGS: Record<string, ServiceUrlConfig> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    endpoints: {
      models: '/models',
      chat: '/chat/completions'
    }
  },
  claude: {
    baseUrl: 'https://api.anthropic.com',
    apiVersion: '2023-06-01',
    endpoints: {
      models: '/v1/models',
      chat: '/v1/messages'
    }
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiVersion: 'v1beta',
    endpoints: {
      models: '/v1beta/models',
      chat: '/v1beta/models'
    }
  },
  xai: {
    baseUrl: 'https://api.x.ai/v1',
    endpoints: {
      models: '/models',
      chat: '/chat/completions'
    }
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    endpoints: {
      models: '/api/tags',
      chat: '/api/chat',
      pull: '/api/pull'
    }
  }
};

/**
 * 为特定服务构建URL
 * @param provider 服务提供商
 * @param endpoint 端点类型
 * @param customBaseUrl 自定义基础URL
 * @param params 查询参数
 * @returns 完整的URL
 */
export function buildServiceUrl(
  provider: string, 
  endpoint: keyof ServiceEndpoints, 
  customBaseUrl?: string, 
  params?: Record<string, string>
): string {
  const config = DEFAULT_SERVICE_CONFIGS[provider];
  if (!config) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  
  const baseUrl = customBaseUrl || config.baseUrl;
  const endpointPath = config.endpoints[endpoint];
  
  if (!endpointPath) {
    throw new Error(`Endpoint '${endpoint}' not supported for provider '${provider}'`);
  }
  
  return buildApiUrl(baseUrl, endpointPath, params);
}

/**
 * 验证URL格式
 * @param url URL字符串
 * @returns 是否为有效URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 标准化baseUrl格式
 * @param baseUrl 原始baseUrl
 * @returns 标准化后的baseUrl
 */
export function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl) {
    return baseUrl;
  }
  
  // 移除末尾的斜杠
  return baseUrl.replace(/\/$/, '');
}