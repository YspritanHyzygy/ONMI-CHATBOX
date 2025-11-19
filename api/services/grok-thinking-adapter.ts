/**
 * Grok思维链适配器
 * 支持xAI Grok的Think模式（Chain of Thought推理）
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

export class GrokThinkingAdapter extends BaseThinkingAdapter {
  provider: AIProvider = 'xai';

  /**
   * 构建包含思维链参数的Grok请求
   */
  buildThinkingRequest(
    messages: ChatMessage[],
    config: AIServiceConfig
  ): any {
    // 使用基类的基础请求构建
    const request = super.buildThinkingRequest(messages, config);

    // Grok使用max_tokens参数
    if (config.maxTokens) {
      request.max_tokens = config.maxTokens;
    }

    // 添加reasoning_effort参数（如果配置了）
    if (config.reasoningEffort) {
      request.reasoning_effort = config.reasoningEffort;
      this.log(`Added reasoning_effort: ${config.reasoningEffort}`);
    }

    // 添加reasoning_mode参数（如果配置了）
    if (config.reasoningMode) {
      request.reasoning_mode = config.reasoningMode;
      this.log(`Added reasoning_mode: ${config.reasoningMode}`);
    }

    return request;
  }

  /**
   * 从Grok响应中提取思维链
   */
  extractThinking(response: any): ThinkingResponse | null {
    if (!response || typeof response !== 'object') {
      return null;
    }

    // 方式1: 从choices中的message.reasoning_content提取
    const reasoningContent = response.choices?.[0]?.message?.reasoning_content;

    if (reasoningContent) {
      this.log('Extracting thinking from choices[0].message.reasoning_content');

      // 提取reasoning tokens
      const tokens = safeExtract(
        response,
        ['usage', 'reasoning_tokens']
      ) as number | undefined;

      // 提取reasoning_effort
      const effort = response.choices?.[0]?.message?.reasoning_effort as string | undefined;

      return normalizeThinkingResponse({
        content: reasoningContent as string,
        tokens: tokens,
        effort: effort as any,
        providerData: {
          type: 'grok_think_mode',
          reasoning_mode: response.reasoning_mode,
        },
      });
    }

    // 方式2: 直接从响应根级别提取reasoning_content
    if (response.reasoning_content) {
      this.log('Extracting thinking from root reasoning_content');

      const tokens = safeExtract(
        response,
        ['usage', 'reasoning_tokens']
      ) as number | undefined;

      return normalizeThinkingResponse({
        content: response.reasoning_content,
        tokens: tokens,
      });
    }

    // 方式3: 使用通用检查（兼容其他可能的格式）
    if (hasThinkingContent(response)) {
      this.log('Extracting thinking using generic hasThinkingContent check');
      
      const tokens = safeExtract(
        response,
        ['usage', 'reasoning_tokens']
      ) as number | undefined;
      
      return normalizeThinkingResponse({
        content: response.thinking || response.thought || response.reasoning || '',
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

    const choice = chunk.choices?.[0];
    if (!choice) {
      return { done: false };
    }

    const delta = choice.delta;
    if (!delta) {
      return {
        done: choice.finish_reason === 'stop' || choice.finish_reason === 'length',
      };
    }

    // 提取思维链内容（reasoning_content）
    if (delta.reasoning_content) {
      return {
        thinking: delta.reasoning_content,
        done: false,
      };
    }

    // 提取最终答案内容
    if (delta.content) {
      return {
        content: delta.content,
        done: choice.finish_reason === 'stop' || choice.finish_reason === 'length',
      };
    }

    return {
      done: choice.finish_reason === 'stop' || choice.finish_reason === 'length',
    };
  }

  /**
   * 准备多轮对话的上下文
   * Grok: 类似OpenAI，多轮对话时不应包含reasoning_content
   */
  prepareContextWithThinking(
    messages: ChatMessage[],
    _lastThinking?: ThinkingResponse
  ): ChatMessage[] {
    // Grok的推理模型在多轮对话时不需要传递reasoning_content
    // 只传递基本的role和content
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * 检查模型是否支持思维链
   */
  supportsThinking(modelId: string): boolean {
    const model = modelId.toLowerCase();

    // Grok 3及以上版本支持Think模式
    if (
      model.includes('grok-3') ||
      model.includes('grok-4') ||
      model.includes('grok-5')
    ) {
      return true;
    }

    // Grok 3 mini也支持
    if (model.includes('grok-3-mini')) {
      return true;
    }

    // 未来的Grok版本可能也支持
    // 检查是否包含"think"关键字
    if (model.includes('think')) {
      return true;
    }

    return false;
  }

  /**
   * 获取推理模型的推荐配置
   */
  getRecommendedConfig(modelId: string): Partial<AIServiceConfig> {
    if (!this.supportsThinking(modelId)) {
      return {};
    }

    const model = modelId.toLowerCase();

    // Grok 3 mini的推荐配置（低成本）
    if (model.includes('grok-3-mini')) {
      return {
        reasoningEffort: 'low',
        reasoningMode: 'auto',
        maxTokens: 16000,
      };
    }

    // Grok 3/4/5的推荐配置
    return {
      reasoningEffort: 'medium',
      reasoningMode: 'enabled',
      maxTokens: 32000,
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

    // 检查reasoning_effort
    if (config.reasoningEffort) {
      const validEfforts = ['minimal', 'low', 'medium', 'high'];
      if (!validEfforts.includes(config.reasoningEffort)) {
        warnings.push(
          `Invalid reasoning_effort: ${config.reasoningEffort}. Valid values: ${validEfforts.join(', ')}`
        );
      }
    }

    // 检查reasoning_mode
    if (config.reasoningMode) {
      const validModes = ['enabled', 'auto', 'disabled'];
      if (!validModes.includes(config.reasoningMode)) {
        warnings.push(
          `Invalid reasoning_mode: ${config.reasoningMode}. Valid values: ${validModes.join(', ')}`
        );
      }
    }

    // 检查maxTokens
    if (config.maxTokens && config.maxTokens > 131072) {
      warnings.push(
        `maxTokens ${config.maxTokens} exceeds Grok's maximum context window of 131072`
      );
    }

    // 如果reasoning_mode为disabled，提醒用户
    if (config.reasoningMode === 'disabled') {
      warnings.push(
        'reasoning_mode is set to "disabled", which will turn off thinking chain functionality'
      );
    }

    return {
      valid: true,
      warnings,
    };
  }

  /**
   * 获取推理模式的说明
   */
  getReasoningModeDescription(mode: string): string {
    switch (mode) {
      case 'enabled':
        return 'Always use thinking chain for all responses';
      case 'auto':
        return 'Automatically decide when to use thinking chain based on query complexity';
      case 'disabled':
        return 'Disable thinking chain functionality';
      default:
        return 'Unknown reasoning mode';
    }
  }

  /**
   * 获取推理努力程度的说明
   */
  getReasoningEffortDescription(effort: string): string {
    switch (effort) {
      case 'minimal':
        return 'Minimal reasoning effort - fastest, lowest cost';
      case 'low':
        return 'Low reasoning effort - balanced speed and quality';
      case 'medium':
        return 'Medium reasoning effort - recommended for most tasks';
      case 'high':
        return 'High reasoning effort - most thorough, highest cost';
      default:
        return 'Unknown reasoning effort level';
    }
  }
}
