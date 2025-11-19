/**
 * Ollama思维链适配器
 * 支持多种推理模型：DeepSeek-R1、Qwen、Llama等
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

export class OllamaThinkingAdapter extends BaseThinkingAdapter {
  provider: AIProvider = 'ollama';

  /**
   * 构建包含思维链参数的Ollama请求
   */
  buildThinkingRequest(
    messages: ChatMessage[],
    config: AIServiceConfig
  ): any {
    // 使用基类的基础请求构建
    const request = super.buildThinkingRequest(messages, config);

    // Ollama使用num_predict参数而不是max_tokens
    if (config.maxTokens) {
      delete request.max_tokens;
      request.options = request.options || {};
      request.options.num_predict = config.maxTokens;
    }

    // 添加num_ctx参数（上下文窗口大小）
    if (config.numCtx) {
      request.options = request.options || {};
      request.options.num_ctx = config.numCtx;
    }

    // 添加repeat_penalty参数
    if (config.repeatPenalty) {
      request.options = request.options || {};
      request.options.repeat_penalty = config.repeatPenalty;
    }

    // 启用思维链（think参数）
    if (config.enableThinking) {
      request.think = true;
      this.log(`Enabled thinking mode with think=true`);
    }

    // 隐藏思维过程（仅记录不展示）
    if (config.hideThinking) {
      request.hidethinking = true;
      this.log(`Enabled hideThinking mode`);
    }

    return request;
  }

  /**
   * 从Ollama响应中提取思维链
   */
  extractThinking(response: any): ThinkingResponse | null {
    if (!response || typeof response !== 'object') {
      return null;
    }

    // 方式1: DeepSeek-R1等模型使用reasoning_content格式
    const reasoningContent = response.message?.reasoning_content;
    
    if (reasoningContent) {
      this.log('Extracting thinking from message.reasoning_content (DeepSeek-R1 format)');

      // 提取reasoning tokens
      const tokens = safeExtract(
        response,
        ['usage', 'reasoning_tokens']
      ) as number | undefined;

      return normalizeThinkingResponse({
        content: reasoningContent as string,
        tokens: tokens,
        providerData: {
          type: 'ollama_reasoning_content',
          model: response.model,
        },
      });
    }

    // 方式2: 其他Ollama推理模型可能使用thinking格式
    const thinkingContent = response.message?.thinking;
    
    if (thinkingContent) {
      this.log('Extracting thinking from message.thinking');

      const tokens = safeExtract(
        response,
        ['usage', 'thinking_tokens']
      ) as number | undefined;

      return normalizeThinkingResponse({
        content: thinkingContent as string,
        tokens: tokens,
        providerData: {
          type: 'ollama_thinking',
          model: response.model,
        },
      });
    }

    // 方式3: 检查根级别的reasoning_content
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

    // 方式4: 使用通用检查（兼容其他可能的格式）
    if (hasThinkingContent(response)) {
      this.log('Extracting thinking using generic hasThinkingContent check');
      
      const tokens = safeExtract(
        response,
        ['usage', 'reasoning_tokens']
      ) as number | undefined || safeExtract(
        response,
        ['usage', 'thinking_tokens']
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

    // Ollama流式响应格式
    const message = chunk.message;
    
    if (!message) {
      return { done: chunk.done || false };
    }

    // 提取思维链内容（reasoning_content - DeepSeek-R1格式）
    if (message.reasoning_content) {
      return {
        thinking: message.reasoning_content,
        done: false,
      };
    }

    // 提取思维链内容（thinking格式）
    if (message.thinking) {
      return {
        thinking: message.thinking,
        done: false,
      };
    }

    // 检查delta格式（某些Ollama版本可能使用delta）
    const delta = message.delta;
    if (delta) {
      if (delta.reasoning_content) {
        return {
          thinking: delta.reasoning_content,
          done: false,
        };
      }

      if (delta.thinking) {
        return {
          thinking: delta.thinking,
          done: false,
        };
      }

      if (delta.content) {
        return {
          content: delta.content,
          done: chunk.done || false,
        };
      }
    }

    // 提取最终答案内容
    if (message.content) {
      return {
        content: message.content,
        done: chunk.done || false,
      };
    }

    return { done: chunk.done || false };
  }

  /**
   * 准备多轮对话的上下文
   * Ollama: 某些模型（如DeepSeek-R1）多轮对话时必须排除reasoning_content
   */
  prepareContextWithThinking(
    messages: ChatMessage[],
    _lastThinking?: ThinkingResponse
  ): ChatMessage[] {
    // 对于推理模型，在多轮对话时不应包含reasoning_content
    // 这可以避免上下文污染和400错误
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

    // DeepSeek-R1系列推理模型
    if (
      model.includes('deepseek-r1') ||
      model.includes('deepseek-reasoner')
    ) {
      return true;
    }

    // Qwen推理模型
    if (
      model.includes('qwen') && 
      (model.includes('think') || model.includes('reasoning'))
    ) {
      return true;
    }

    // Llama推理模型
    if (
      model.includes('llama') && 
      (model.includes('think') || model.includes('reasoning'))
    ) {
      return true;
    }

    // 通用推理模型检测（包含关键字）
    if (
      model.includes('reasoning') ||
      model.includes('think') ||
      model.includes('cot') || // Chain of Thought
      model.includes('r1') // 推理模型常用命名
    ) {
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

    // DeepSeek-R1的推荐配置
    if (model.includes('deepseek-r1')) {
      return {
        enableThinking: true,
        maxTokens: 8192,
        numCtx: 32768, // 较大的上下文窗口
        temperature: 0.7,
      };
    }

    // Qwen推理模型的推荐配置
    if (model.includes('qwen')) {
      return {
        enableThinking: true,
        maxTokens: 4096,
        numCtx: 16384,
        temperature: 0.7,
      };
    }

    // 通用推理模型的推荐配置
    return {
      enableThinking: true,
      maxTokens: 4096,
      numCtx: 8192,
      temperature: 0.7,
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

    // 检查enableThinking
    if (!config.enableThinking) {
      warnings.push(
        'enableThinking is not set. Thinking chain will not be enabled.'
      );
    }

    // 检查maxTokens/num_predict
    if (!config.maxTokens && !config.numPredict) {
      warnings.push(
        'No token limit set. Consider setting maxTokens or numPredict to control output length.'
      );
    }

    // 检查上下文窗口
    if (config.numCtx && config.numCtx < 8192) {
      warnings.push(
        `numCtx ${config.numCtx} may be too small for reasoning models. Consider using at least 8192.`
      );
    }

    // 检查hideThinking
    if (config.hideThinking) {
      warnings.push(
        'hideThinking is enabled. Thinking content will be hidden from the response.'
      );
    }

    return {
      valid: true,
      warnings,
    };
  }

  /**
   * 获取模型特定的说明
   */
  getModelDescription(modelId: string): string {
    const model = modelId.toLowerCase();

    if (model.includes('deepseek-r1')) {
      return 'DeepSeek-R1: Advanced reasoning model with chain-of-thought capabilities. Excludes reasoning_content in multi-turn conversations.';
    }

    if (model.includes('qwen')) {
      return 'Qwen: Efficient reasoning model with thinking chain support.';
    }

    if (model.includes('llama')) {
      return 'Llama: Open-source reasoning model with CoT capabilities.';
    }

    return 'Ollama reasoning model with thinking chain support.';
  }

  /**
   * 检查模型是否需要在多轮对话中排除reasoning_content
   */
  shouldExcludeReasoningInContext(modelId: string): boolean {
    const model = modelId.toLowerCase();

    // DeepSeek-R1必须排除reasoning_content以避免400错误
    if (model.includes('deepseek-r1')) {
      return true;
    }

    // 其他模型可能也需要，根据实际情况调整
    // 默认为true以保持安全
    return true;
  }

  /**
   * 获取思维链参数的说明
   */
  getThinkingParameterDescription(): {
    think: string;
    hideThinking: string;
  } {
    return {
      think: 'Enable thinking chain mode. When true, the model will generate reasoning steps before the final answer.',
      hideThinking: 'Hide thinking content from the response. When true, thinking is recorded but not displayed to the user.',
    };
  }
}
