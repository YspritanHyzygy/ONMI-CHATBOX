/**
 * Gemini思维链适配器
 * 支持Gemini思维模式（Thinking Mode）
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
  safeExtract,
} from './thinking-utils.js';

export class GeminiThinkingAdapter extends BaseThinkingAdapter {
  provider: AIProvider = 'gemini';

  /**
   * 构建包含思维链参数的Gemini请求
   */
  buildThinkingRequest(
    messages: ChatMessage[],
    config: AIServiceConfig
  ): any {
    // 转换消息格式为Gemini的contents格式
    const contents = this.convertMessages(messages);

    const request: any = {
      contents: contents,
      generationConfig: {},
    };

    // 添加temperature参数
    if (config.temperature !== undefined) {
      request.generationConfig.temperature = config.temperature;
    }

    // 添加maxOutputTokens参数
    if (config.maxTokens !== undefined) {
      request.generationConfig.maxOutputTokens = config.maxTokens;
    }

    // 添加topP参数
    if (config.topP !== undefined) {
      request.generationConfig.topP = config.topP;
    }

    // 添加topK参数
    if (config.topK !== undefined) {
      request.generationConfig.topK = config.topK;
    }

    // 设置思维配置（thinkingConfig）
    // 根据官方文档，thinkingBudget和includeThoughts应该在thinkingConfig对象中
    const hasThinkingConfig = 
      config.thinkingBudget !== undefined || 
      config.includeThoughts !== undefined;

    if (hasThinkingConfig) {
      request.generationConfig.thinkingConfig = {};

      // 设置思维预算（thinkingBudget）
      if (config.thinkingBudget !== undefined) {
        request.generationConfig.thinkingConfig.thinkingBudget = config.thinkingBudget;
        this.log(`Set thinkingBudget: ${config.thinkingBudget}`);
      }

      // 是否包含思维内容（includeThoughts）
      if (config.includeThoughts !== undefined) {
        request.generationConfig.thinkingConfig.includeThoughts = config.includeThoughts;
        this.log(`Set includeThoughts: ${config.includeThoughts}`);
      }
    }

    // 传递上一轮的thought_signatures（多轮对话）
    // 注意：根据官方文档，只有在使用函数调用时才会返回和使用签名
    if (config.thoughtSignatures) {
      request.thoughtSignatures = config.thoughtSignatures;
      this.log('Added thought_signatures for multi-turn conversation');
    }

    return request;
  }

  /**
   * 从Gemini响应中提取思维链
   */
  extractThinking(response: any): ThinkingResponse | null {
    if (!response || typeof response !== 'object') {
      return null;
    }

    // Gemini返回candidates数组
    if (response.candidates && Array.isArray(response.candidates)) {
      const candidate = response.candidates[0];

      if (!candidate) {
        return null;
      }

      this.log('Extracting thinking from candidates[0]');

      // 提取思维内容（从content.parts中找到thought类型的部分）
      // 根据官方文档：part.thought是布尔值，part.text包含实际内容
      const thinkingParts: string[] = [];

      if (candidate.content?.parts && Array.isArray(candidate.content.parts)) {
        for (const part of candidate.content.parts) {
          // part.thought为true表示这是思维内容，实际文本在part.text中
          if (part.thought === true && part.text) {
            thinkingParts.push(part.text);
          }
        }
      }

      // 如果没有找到思维内容，返回null
      if (thinkingParts.length === 0) {
        return null;
      }

      // 合并所有思维内容
      const thinkingContent = thinkingParts.join('\n');

      // 提取thought_signatures
      const thoughtSignatures = safeExtract(
        response,
        ['thoughtSignatures']
      ) as string | undefined;

      // 提取思维token数量
      const tokens = safeExtract(
        response,
        ['usageMetadata', 'thoughtsTokenCount']
      ) as number | undefined;

      return normalizeThinkingResponse({
        content: thinkingContent,
        signature: thoughtSignatures,
        tokens: tokens,
        providerData: {
          type: 'gemini_thinking',
          candidate: candidate,
        },
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

    // Gemini流式响应也使用candidates结构
    const candidate = chunk.candidates?.[0];

    if (!candidate) {
      return { done: false };
    }

    // 检查是否完成
    const isDone =
      candidate.finishReason === 'STOP' ||
      candidate.finishReason === 'MAX_TOKENS' ||
      candidate.finishReason === 'SAFETY';

    // 提取内容
    if (candidate.content?.parts && Array.isArray(candidate.content.parts)) {
      let thinkingContent = '';
      let textContent = '';

      for (const part of candidate.content.parts) {
        // 根据官方文档：part.thought是布尔值，part.text包含实际内容
        if (part.thought === true && part.text) {
          // 这是思维内容
          thinkingContent += part.text;
        } else if (part.thought !== true && part.text) {
          // 这是普通文本内容
          textContent += part.text;
        }
      }

      return {
        thinking: thinkingContent || undefined,
        content: textContent || undefined,
        done: isDone,
      };
    }

    return { done: isDone };
  }

  /**
   * 准备多轮对话的上下文
   * Gemini: 必须传递thought_signatures，但不需要在messages中包含思维内容
   */
  prepareContextWithThinking(
    messages: ChatMessage[],
    lastThinking?: ThinkingResponse
  ): ChatMessage[] {
    // Gemini在多轮对话时不需要在消息中包含思维内容
    // 但需要通过thoughtSignatures参数传递上一轮的签名
    // 这里只返回基本的消息，签名会在buildThinkingRequest中处理

    // 注意：如果有lastThinking且包含signature，调用者应该将其设置到config.thoughtSignatures中
    if (lastThinking?.signature) {
      this.log('Last thinking has signature, should be passed via config.thoughtSignatures');
    }

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

    // Gemini 2.0 Flash Thinking模型
    if (
      model.includes('gemini-2.0-flash-thinking') ||
      model.includes('gemini-2-flash-thinking')
    ) {
      return true;
    }

    // Gemini 2.5系列的thinking模型
    if (
      model.includes('gemini-2.5') &&
      model.includes('thinking')
    ) {
      return true;
    }

    // 其他可能的thinking模型
    if (model.includes('thinking-exp')) {
      return true;
    }

    return false;
  }

  /**
   * 转换消息格式为Gemini的contents格式
   */
  private convertMessages(messages: ChatMessage[]): any[] {
    const contents: any[] = [];

    for (const message of messages) {
      // Gemini使用'user'和'model'角色，而不是'assistant'
      let role: string = message.role;
      if (role === 'assistant') {
        role = 'model';
      }

      // system消息需要特殊处理，可以作为第一条user消息的前缀
      if (role === 'system') {
        // 如果是第一条消息，将其作为user消息
        // 否则跳过（Gemini不直接支持system角色）
        if (contents.length === 0) {
          contents.push({
            role: 'user',
            parts: [{ text: message.content }],
          });
        }
        continue;
      }

      contents.push({
        role: role,
        parts: [{ text: message.content }],
      });
    }

    return contents;
  }

  /**
   * 获取思维模式的推荐配置
   */
  getRecommendedConfig(modelId: string): Partial<AIServiceConfig> {
    if (!this.supportsThinking(modelId)) {
      return {};
    }

    // 思维模式的推荐配置
    return {
      thinkingBudget: -1, // -1表示动态分配
      includeThoughts: true, // 包含思维内容
      maxTokens: 8192,
      temperature: 0.7,
    };
  }

  /**
   * 验证思维模式配置
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
          'thinkingBudget is 0, which may disable thinking. Set to -1 for dynamic allocation.'
        );
      }
    }

    // 检查includeThoughts
    if (config.includeThoughts === false) {
      warnings.push(
        'includeThoughts is false, thinking content will not be returned in the response.'
      );
    }

    // 检查maxTokens
    if (config.maxTokens && config.maxTokens > 1000000) {
      warnings.push(
        `maxTokens ${config.maxTokens} exceeds Gemini's typical maximum context window`
      );
    }

    // 检查thoughtSignatures
    if (config.thoughtSignatures && typeof config.thoughtSignatures !== 'string') {
      warnings.push(
        'thoughtSignatures should be a string value from the previous response'
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
  getSuggestedThinkingBudget(
    taskComplexity: 'simple' | 'medium' | 'complex'
  ): number {
    switch (taskComplexity) {
      case 'simple':
        return 2000; // 简单任务
      case 'medium':
        return 8000; // 中等任务
      case 'complex':
        return -1; // 复杂任务使用动态分配
      default:
        return -1;
    }
  }

  /**
   * 从响应中提取thought_signatures用于下一轮对话
   */
  extractThoughtSignatures(response: any): string | null {
    if (!response || typeof response !== 'object') {
      return null;
    }

    const signatures = safeExtract(response, ['thoughtSignatures']) as
      | string
      | undefined;

    if (signatures) {
      this.log('Extracted thought_signatures for next turn');
      return signatures;
    }

    return null;
  }
}
