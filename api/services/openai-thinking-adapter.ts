/**
 * OpenAI思维链适配器
 * 支持o1/o3/o4系列推理模型的思维链功能
 */

import { BaseThinkingAdapter } from './thinking-adapter-base.js';
import { 
  AIProvider, 
  ChatMessage, 
  AIServiceConfig,
  ThinkingResponse
} from './types.js';
import { 
  normalizeThinkingResponse,
  hasThinkingContent,
  safeExtract
} from './thinking-utils.js';

export class OpenAIThinkingAdapter extends BaseThinkingAdapter {
  provider: AIProvider = 'openai';
  
  /**
   * 构建包含思维链参数的OpenAI请求
   */
  buildThinkingRequest(
    messages: ChatMessage[],
    config: AIServiceConfig
  ): any {
    // 使用基类的基础请求构建
    const request = super.buildThinkingRequest(messages, config);
    
    // OpenAI特定：使用max_completion_tokens而不是max_tokens
    if (config.maxTokens) {
      delete request.max_tokens;
      request.max_completion_tokens = config.maxTokens;
    }
    
    // 添加reasoning.effort参数（如果配置了）
    if (config.reasoningEffort) {
      request.reasoning = {
        effort: config.reasoningEffort
      };
      this.log(`Added reasoning.effort: ${config.reasoningEffort}`);
    }
    
    // 对于推理模型，temperature参数可能不支持
    // 如果模型是o1/o3/o4系列，移除temperature
    if (this.isReasoningModel(config.model)) {
      delete request.temperature;
      this.log(`Removed temperature for reasoning model: ${config.model}`);
    }
    
    return request;
  }
  
  /**
   * 从OpenAI响应中提取思维链
   */
  extractThinking(response: any): ThinkingResponse | null {
    if (!response || typeof response !== 'object') {
      return null;
    }
    
    // 检查是否有思维链内容
    if (!hasThinkingContent(response)) {
      return null;
    }
    
    // 方式1: 旧版Chat API - reasoning_content字段
    if (response.reasoning_content) {
      this.log('Extracting thinking from reasoning_content (Chat API)');
      
      const tokens = safeExtract(
        response,
        ['usage', 'output_tokens_details', 'reasoning_tokens']
      ) as number | undefined;
      
      return normalizeThinkingResponse({
        content: response.reasoning_content,
        tokens: tokens
      });
    }
    
    // 方式2: 新版Responses API - output数组中的reasoning项
    if (response.output && Array.isArray(response.output)) {
      this.log('Extracting thinking from output array (Responses API)');
      
      const reasoningItem = response.output.find(
        (item: any) => item.type === 'reasoning'
      );
      
      if (reasoningItem) {
        const tokens = safeExtract(
          response,
          ['usage', 'output_tokens_details', 'reasoning_tokens']
        ) as number | undefined;
        
        // summary可能是数组，需要合并
        let summary: string | undefined;
        if (reasoningItem.summary) {
          if (Array.isArray(reasoningItem.summary)) {
            summary = reasoningItem.summary.join('\n');
          } else {
            summary = String(reasoningItem.summary);
          }
        }
        
        return normalizeThinkingResponse({
          content: reasoningItem.content || '',
          summary: summary,
          tokens: tokens,
          effort: reasoningItem.effort as any,
          providerData: {
            type: 'responses_api',
            reasoning_item: reasoningItem
          }
        });
      }
    }
    
    // 方式3: 检查choices中的message.reasoning_content
    const reasoningContent = response.choices?.[0]?.message?.reasoning_content;
    
    if (reasoningContent) {
      this.log('Extracting thinking from choices[0].message.reasoning_content');
      
      const tokens = safeExtract(
        response,
        ['usage', 'output_tokens_details', 'reasoning_tokens']
      ) as number | undefined;
      
      return normalizeThinkingResponse({
        content: reasoningContent as string,
        tokens: tokens
      });
    }
    
    return null;
  }
  
  /**
   * 从流式响应中提取思维链
   */
  extractStreamThinking(chunk: any): {
    thinking?: string;
    content?: string;
    done: boolean;
  } {
    if (!chunk || typeof chunk !== 'object') {
      return { done: false };
    }
    
    const choice = chunk.choices?.[0];
    if (!choice) {
      return { done: false };
    }
    
    const delta = choice.delta;
    if (!delta) {
      return { 
        done: choice.finish_reason === 'stop' || choice.finish_reason === 'length'
      };
    }
    
    // 提取思维链内容
    if (delta.reasoning_content) {
      return {
        thinking: delta.reasoning_content,
        done: false
      };
    }
    
    // 提取最终答案内容
    if (delta.content) {
      return {
        content: delta.content,
        done: choice.finish_reason === 'stop' || choice.finish_reason === 'length'
      };
    }
    
    return { 
      done: choice.finish_reason === 'stop' || choice.finish_reason === 'length'
    };
  }
  
  /**
   * 准备多轮对话的上下文
   * OpenAI: 多轮对话时不应包含reasoning_content
   */
  prepareContextWithThinking(
    messages: ChatMessage[],
    _lastThinking?: ThinkingResponse
  ): ChatMessage[] {
    // OpenAI的推理模型在多轮对话时不需要传递reasoning_content
    // 只传递基本的role和content
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }
  
  /**
   * 检查模型是否支持思维链
   */
  supportsThinking(modelId: string): boolean {
    const model = modelId.toLowerCase();
    
    // o1系列推理模型
    if (model.includes('o1-preview') || 
        model.includes('o1-mini') ||
        model.startsWith('o1')) {
      return true;
    }
    
    // o3系列推理模型
    if (model.includes('o3-mini') || 
        model.startsWith('o3')) {
      return true;
    }
    
    // o4系列推理模型
    if (model.includes('o4-mini') || 
        model.startsWith('o4')) {
      return true;
    }
    
    // GPT-5系列推理模型（新）
    if (model.includes('gpt-5') || 
        model.includes('gpt-5-mini') ||
        model.includes('gpt-5-nano')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 辅助方法：检查是否是推理模型
   */
  private isReasoningModel(modelId: string): boolean {
    return this.supportsThinking(modelId);
  }
  
  /**
   * 获取推理模型的推荐配置
   */
  getRecommendedConfig(modelId: string): Partial<AIServiceConfig> {
    if (!this.supportsThinking(modelId)) {
      return {};
    }
    
    const model = modelId.toLowerCase();
    
    // GPT-5系列的推荐配置
    if (model.includes('gpt-5')) {
      return {
        reasoningEffort: 'medium',
        maxTokens: 25000, // OpenAI推荐至少预留25000 tokens
      };
    }
    
    // o系列的推荐配置
    return {
      reasoningEffort: 'medium',
      maxTokens: 100000,
    };
  }
  
  /**
   * 验证推理模型的配置
   */
  validateReasoningConfig(config: AIServiceConfig): {
    valid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    
    if (!this.supportsThinking(config.model)) {
      return { valid: true, warnings };
    }
    
    // 检查temperature
    if (config.temperature !== undefined) {
      warnings.push(
        `Model ${config.model} does not support temperature parameter. It will be ignored.`
      );
    }
    
    // 检查reasoning_effort
    if (config.reasoningEffort) {
      const validEfforts = ['minimal', 'low', 'medium', 'high'];
      if (!validEfforts.includes(config.reasoningEffort)) {
        warnings.push(
          `Invalid reasoning_effort: ${config.reasoningEffort}. Valid values: ${validEfforts.join(', ')}`
        );
      }
    }
    
    // 检查maxTokens
    if (config.maxTokens && config.maxTokens > 100000) {
      warnings.push(
        `maxTokens ${config.maxTokens} exceeds recommended limit of 100000 for reasoning models`
      );
    }
    
    return {
      valid: true,
      warnings
    };
  }
}
