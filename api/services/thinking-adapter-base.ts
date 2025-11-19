/**
 * 思维链适配器基础接口
 * 为不同AI提供商的思维链功能提供统一的接口
 */

import { 
  AIProvider, 
  ChatMessage, 
  AIServiceConfig,
  ThinkingResponse
} from './types.js';

/**
 * 思维链适配器接口
 * 每个AI提供商的适配器都应该实现这个接口
 */
export interface ThinkingAdapter {
  /**
   * 提供商名称
   */
  provider: AIProvider;
  
  /**
   * 构建包含思维链参数的请求
   * @param messages 对话消息列表
   * @param config AI服务配置
   * @returns 提供商特定的请求对象
   */
  buildThinkingRequest(
    messages: ChatMessage[],
    config: AIServiceConfig
  ): any;
  
  /**
   * 从响应中提取思维链
   * @param response 提供商的原始响应
   * @returns 标准化的思维链响应，如果没有思维链则返回null
   */
  extractThinking(response: any): ThinkingResponse | null;
  
  /**
   * 处理流式响应中的思维链
   * @param chunk 流式响应的一个块
   * @returns 包含思维链和内容的对象
   */
  extractStreamThinking(chunk: any): {
    thinking?: string;
    content?: string;
    done: boolean;
  };
  
  /**
   * 准备多轮对话的上下文
   * 某些提供商需要特殊处理思维链在多轮对话中的传递
   * @param messages 原始消息列表
   * @param lastThinking 上一轮的思维链响应
   * @returns 处理后的消息列表
   */
  prepareContextWithThinking(
    messages: ChatMessage[],
    lastThinking?: ThinkingResponse
  ): ChatMessage[];
  
  /**
   * 检查模型是否支持思维链
   * @param modelId 模型ID
   * @returns 是否支持思维链
   */
  supportsThinking(modelId: string): boolean;
}

/**
 * 思维链适配器基类
 * 提供一些通用的实现
 */
export abstract class BaseThinkingAdapter implements ThinkingAdapter {
  abstract provider: AIProvider;
  
  /**
   * 默认实现：构建请求
   * 子类应该覆盖这个方法以添加提供商特定的参数
   */
  buildThinkingRequest(
    messages: ChatMessage[],
    config: AIServiceConfig
  ): any {
    // 基础请求结构
    const request: any = {
      model: config.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    };
    
    // 添加通用参数
    if (config.temperature !== undefined) {
      request.temperature = config.temperature;
    }
    
    if (config.maxTokens !== undefined) {
      request.max_tokens = config.maxTokens;
    }
    
    return request;
  }
  
  /**
   * 默认实现：提取思维链
   * 子类必须覆盖这个方法
   */
  abstract extractThinking(response: any): ThinkingResponse | null;
  
  /**
   * 默认实现：提取流式思维链
   * 子类必须覆盖这个方法
   */
  abstract extractStreamThinking(chunk: any): {
    thinking?: string;
    content?: string;
    done: boolean;
  };
  
  /**
   * 默认实现：准备上下文
   * 大多数提供商不需要特殊处理，直接返回原始消息
   */
  prepareContextWithThinking(
    messages: ChatMessage[],
    _lastThinking?: ThinkingResponse
  ): ChatMessage[] {
    // 默认实现：不修改消息，只返回基本的role和content
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }
  
  /**
   * 默认实现：检查模型是否支持思维链
   * 子类应该覆盖这个方法以提供准确的判断
   */
  supportsThinking(_modelId: string): boolean {
    // 默认返回false，子类应该实现具体的判断逻辑
    return false;
  }
  
  /**
   * 辅助方法：安全地获取嵌套属性
   */
  protected safeGet(obj: any, path: string[], defaultValue: any = undefined): any {
    let current = obj;
    for (const key of path) {
      if (current === null || current === undefined) {
        return defaultValue;
      }
      current = current[key];
    }
    return current !== undefined ? current : defaultValue;
  }
  
  /**
   * 辅助方法：检查对象是否有指定属性
   */
  protected hasProperty(obj: any, property: string): boolean {
    return obj !== null && obj !== undefined && property in obj;
  }
  
  /**
   * 辅助方法：记录调试信息
   */
  protected log(message: string, data?: any): void {
    if (data) {
      console.log(`[${this.provider}ThinkingAdapter] ${message}`, data);
    } else {
      console.log(`[${this.provider}ThinkingAdapter] ${message}`);
    }
  }
  
  /**
   * 辅助方法：记录错误信息
   */
  protected logError(message: string, error?: any): void {
    if (error) {
      console.error(`[${this.provider}ThinkingAdapter] ${message}`, error);
    } else {
      console.error(`[${this.provider}ThinkingAdapter] ${message}`);
    }
  }
}

/**
 * 思维链适配器工厂
 * 用于创建和管理不同提供商的思维链适配器
 */
export class ThinkingAdapterFactory {
  private adapters: Map<AIProvider, ThinkingAdapter> = new Map();
  
  /**
   * 注册思维链适配器
   */
  register(provider: AIProvider, adapter: ThinkingAdapter): void {
    this.adapters.set(provider, adapter);
  }
  
  /**
   * 获取思维链适配器
   */
  get(provider: AIProvider): ThinkingAdapter | null {
    return this.adapters.get(provider) || null;
  }
  
  /**
   * 检查提供商是否有思维链适配器
   */
  has(provider: AIProvider): boolean {
    return this.adapters.has(provider);
  }
  
  /**
   * 获取所有支持思维链的提供商
   */
  getSupportedProviders(): AIProvider[] {
    return Array.from(this.adapters.keys());
  }
}

/**
 * 全局思维链适配器工厂实例
 */
export const thinkingAdapterFactory = new ThinkingAdapterFactory();
