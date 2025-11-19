/**
 * Claude思维链适配器
 * 支持Claude扩展思维模式（Extended Thinking）
 */

import { BaseThinkingAdapter } from './thinking-adapter-base.js';
import {
  AIProvider,
  ChatMessage,
  AIServiceConfig,
  ThinkingResponse,
} from './types.js';
import {
  normalizeThinkingResponse,
  hasThinkingContent,
  safeExtract,
} from './thinking-utils.js';

export class ClaudeThinkingAdapter extends BaseThinkingAdapter {
  provider: AIProvider = 'claude';

  /**
   * 构建包含思维链参数的Claude请求
   */
  buildThinkingRequest(
    messages: ChatMessage[],
    config: AIServiceConfig
  ): any {
    // 使用基类的基础请求构建
    const request = super.buildThinkingRequest(messages, config);

    // Claude使用max_tokens而不是max_completion_tokens
    if (config.maxTokens) {
      request.max_tokens = config.maxTokens;
    } else {
      request.max_tokens = 4096; // Claude默认值
    }

    // 启用扩展思维模式
    if (config.enableThinking) {
      request.extended_thinking = true;
      this.log('Enabled extended thinking mode');

      // 设置思维预算（token限制）
      if (config.thinkingBudget !== undefined) {
        request.thinking_budget = config.thinkingBudget;
        this.log(`Set thinking budget: ${config.thinkingBudget}`);
      }
    }

    // Claude支持top_p参数
    if (config.topP !== undefined) {
      request.top_p = config.topP;
    }

    // Claude支持stop_sequences
    if (config.stop) {
      request.stop_sequences = Array.isArray(config.stop)
        ? config.stop
        : [config.stop];
    }

    return request;
  }

  /**
   * 从Claude响应中提取思维链
   */
  extractThinking(response: any): ThinkingResponse | null {
    if (!response || typeof response !== 'object') {
      return null;
    }

    // 检查是否有思维链内容
    if (!hasThinkingContent(response)) {
      return null;
    }

    // Claude返回content数组，包含thinking块和text块
    if (response.content && Array.isArray(response.content)) {
      this.log('Extracting thinking from content array');

      const thinkingBlock = response.content.find(
        (block: any) => block.type === 'thinking'
      );

      if (thinkingBlock) {
        // 提取thinking_tokens
        const tokens = safeExtract(
          response,
          ['usage', 'thinking_tokens']
        ) as number | undefined;

        // 提取thinking内容
        const thinkingContent = thinkingBlock.thinking || thinkingBlock.text || '';

        return normalizeThinkingResponse({
          content: thinkingContent,
          signature: thinkingBlock.signature,
          tokens: tokens,
          providerData: {
            type: 'extended_thinking',
            thinking_block: thinkingBlock,
          },
        });
      }
    }

    // 备用方式：直接检查thinking字段
    if (response.thinking) {
      this.log('Extracting thinking from direct thinking field');

      const tokens = safeExtract(
        response,
        ['usage', 'thinking_tokens']
      ) as number | undefined;

      return normalizeThinkingResponse({
        content: response.thinking,
        tokens: tokens,
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

    // Claude流式响应使用事件类型

    // 1. content_block_start - 开始一个新的内容块
    if (
      chunk.type === 'content_block_start' &&
      chunk.content_block?.type === 'thinking'
    ) {
      return {
        thinking: chunk.content_block.thinking || chunk.content_block.text || '',
        done: false,
      };
    }

    // 2. content_block_delta - 内容块的增量更新
    if (chunk.type === 'content_block_delta') {
      // thinking_delta - 思维链内容的增量
      if (chunk.delta?.type === 'thinking_delta') {
        return {
          thinking: chunk.delta.thinking || chunk.delta.text || '',
          done: false,
        };
      }

      // text_delta - 最终答案的增量
      if (chunk.delta?.type === 'text_delta') {
        return {
          content: chunk.delta.text || '',
          done: false,
        };
      }
    }

    // 3. message_stop - 消息结束
    if (chunk.type === 'message_stop') {
      return { done: true };
    }

    // 4. message_delta - 消息级别的更新（可能包含stop_reason）
    if (chunk.type === 'message_delta') {
      return {
        done: chunk.delta?.stop_reason !== undefined,
      };
    }

    return { done: false };
  }

  /**
   * 准备多轮对话的上下文
   * Claude: 保留thinking块在上下文中
   */
  prepareContextWithThinking(
    messages: ChatMessage[],
    _lastThinking?: ThinkingResponse
  ): ChatMessage[] {
    // Claude可以在上下文中保留thinking块
    // 直接返回原始消息
    return messages;
  }

  /**
   * 检查模型是否支持思维链
   */
  supportsThinking(modelId: string): boolean {
    const model = modelId.toLowerCase();

    // Claude 3.7和4系列支持扩展思维
    // Claude 3.5 Sonnet也支持
    if (
      model.includes('claude-3.7') ||
      model.includes('claude-4') ||
      model.includes('claude-3-5-sonnet') ||
      model.includes('claude-3.5-sonnet')
    ) {
      return true;
    }

    // Opus 4支持扩展思维
    if (model.includes('opus-4') || model.includes('claude-opus-4')) {
      return true;
    }

    return false;
  }

  /**
   * 获取扩展思维模式的推荐配置
   */
  getRecommendedConfig(modelId: string): Partial<AIServiceConfig> {
    if (!this.supportsThinking(modelId)) {
      return {};
    }

    // 扩展思维模式的推荐配置
    return {
      enableThinking: true,
      thinkingBudget: -1, // -1表示动态分配
      maxTokens: 8192, // Claude默认较大的token限制
      temperature: 0.7,
    };
  }

  /**
   * 验证扩展思维配置
   */
  validateThinkingConfig(config: AIServiceConfig): {
    valid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];

    if (!this.supportsThinking(config.model)) {
      return { valid: true, warnings };
    }

    // 检查thinkingBudget
    if (config.thinkingBudget !== undefined) {
      if (config.thinkingBudget !== -1 && config.thinkingBudget < 0) {
        warnings.push(
          `Invalid thinkingBudget: ${config.thinkingBudget}. Use -1 for dynamic allocation or a positive number.`
        );
      }

      if (config.thinkingBudget === 0) {
        warnings.push(
          'thinkingBudget is 0, which disables extended thinking. Set to -1 for dynamic allocation.'
        );
      }
    }

    // 检查maxTokens
    if (config.maxTokens && config.maxTokens > 200000) {
      warnings.push(
        `maxTokens ${config.maxTokens} exceeds Claude's maximum context window`
      );
    }

    // 检查temperature和top_p同时设置
    if (config.temperature !== undefined && config.topP !== undefined) {
      warnings.push(
        'Claude does not recommend setting both temperature and top_p. Consider using only one.'
      );
    }

    return {
      valid: true,
      warnings,
    };
  }

  /**
   * 获取思维预算的建议值
   */
  getSuggestedThinkingBudget(taskComplexity: 'simple' | 'medium' | 'complex'): number {
    switch (taskComplexity) {
      case 'simple':
        return 1000; // 简单任务
      case 'medium':
        return 5000; // 中等任务
      case 'complex':
        return -1; // 复杂任务使用动态分配
      default:
        return -1;
    }
  }
}
