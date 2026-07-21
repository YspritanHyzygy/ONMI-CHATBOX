/**
 * Anthropic Claude服务适配器
 */
import Anthropic from '@anthropic-ai/sdk';
import { 
  AIServiceAdapter, 
  AIServiceConfig, 
  ChatMessage, 
  AIResponse, 
  StreamResponse, 
  AIServiceError 
} from './types.js';
import { buildServiceUrl } from './url-utils.js';
import { getSafeErrorMessage } from './error-utils.js';

type AbortableConfig = AIServiceConfig & { signal?: AbortSignal };

export class ClaudeAdapter implements AIServiceAdapter {
  provider = 'claude' as const;

  private createClient(config: AIServiceConfig): Anthropic {
    return new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://api.anthropic.com'
    });
  }

  /**
   * 启用扩展思考时应用 Anthropic API 的硬性约束：
   * - thinking.budget_tokens 最小 1024
   * - 不允许同时传 temperature / top_p
   * - max_tokens 必须大于 budget_tokens
   */
  private applyThinkingParams(requestParams: any, config: AIServiceConfig): void {
    if (!config.enableThinking) return;
    const budget = Math.max(
      1024,
      config.thinkingBudget && config.thinkingBudget > 0 ? config.thinkingBudget : 8192
    );
    requestParams.thinking = { type: 'enabled', budget_tokens: budget };
    delete requestParams.temperature;
    delete requestParams.top_p;
    requestParams.max_tokens = Math.max(requestParams.max_tokens ?? 0, budget + 1024);
  }

  private convertMessages(messages: ChatMessage[]): { messages: any[], system?: string } {
    const systemMessages = messages.filter(msg => msg.role === 'system');
    const userMessages = messages.filter(msg => msg.role !== 'system');
    
    const system = systemMessages.length > 0 ? systemMessages[0].content : undefined;
    
    return { messages: userMessages, system };
  }

  async chat(messages: ChatMessage[], config: AIServiceConfig): Promise<AIResponse> {
    try {
      const client = this.createClient(config);
      const { messages: convertedMessages, system } = this.convertMessages(messages);
      
      const requestParams: any = {
        model: config.model,
        messages: convertedMessages,
        system: system || undefined,
        // Anthropic API 强制要求 max_tokens；未设置时用 4096（所有在售 Claude 模型均支持）
        max_tokens: config.maxTokens ?? 4096,
        temperature: config.temperature ?? 0.7
      };

      // Claude 支持 top_p 参数
      if (config.topP !== undefined) {
        requestParams.top_p = config.topP;
      }

      // Claude 支持 stop 参数
      if (config.stop) {
        requestParams.stop_sequences = Array.isArray(config.stop) ? config.stop : [config.stop];
      }

      this.applyThinkingParams(requestParams, config);

      const response = await client.messages.create(requestParams, {
        signal: (config as AbortableConfig).signal
      });

      // content 数组可能为空，或以非 text 块开头（如 thinking 块）——找第一个 text 块
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );
      if (!textBlock) {
        throw new AIServiceError('Claude returned no text content', 'claude');
      }

      const thinkingBlock = response.content.find(
        (block): block is Anthropic.ThinkingBlock => block.type === 'thinking'
      );

      return {
        content: textBlock.text,
        model: response.model,
        provider: 'claude',
        thinking: thinkingBlock ? {
          content: thinkingBlock.thinking,
          signature: thinkingBlock.signature
        } : undefined,
        usage: response.usage ? {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens
        } : undefined
      };
    } catch (error: any) {
      throw new AIServiceError(
        error.message || 'Claude API调用失败',
        'claude',
        error.status,
        error
      );
    }
  }

  async *streamChat(messages: ChatMessage[], config: AIServiceConfig): AsyncGenerator<StreamResponse> {
    try {
      const client = this.createClient(config);
      const { messages: convertedMessages, system } = this.convertMessages(messages);
      
      const streamParams: any = {
        model: config.model,
        messages: convertedMessages,
        system: system || undefined,
        max_tokens: config.maxTokens ?? 4096,
        temperature: config.temperature ?? 0.7,
        stream: true
      };

      // Claude 支持 top_p 参数
      if (config.topP !== undefined) {
        streamParams.top_p = config.topP;
      }

      // Claude 支持 stop 参数
      if (config.stop) {
        streamParams.stop_sequences = Array.isArray(config.stop) ? config.stop : [config.stop];
      }

      this.applyThinkingParams(streamParams, config);

      const stream = await client.messages.create(streamParams, {
        signal: (config as AbortableConfig).signal
      });

      for await (const chunk of stream as any) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'thinking_delta') {
          yield {
            content: '',
            done: false,
            model: config.model,
            provider: 'claude',
            thinking: { content: chunk.delta.thinking || '', done: false }
          };
        }

        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'signature_delta') {
          yield {
            content: '',
            done: false,
            model: config.model,
            provider: 'claude',
            thinking: { content: '', done: true, signature: chunk.delta.signature }
          };
        }

        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          yield {
            content: chunk.delta.text,
            done: false,
            model: config.model,
            provider: 'claude'
          };
        }

        if (chunk.type === 'message_stop') {
          yield {
            content: '',
            done: true,
            model: config.model,
            provider: 'claude'
          };
          break;
        }
      }
    } catch (error: any) {
      throw new AIServiceError(
        error.message || 'Claude流式API调用失败',
        'claude',
        error.status,
        error
      );
    }
  }

  async testConnection(config: AIServiceConfig): Promise<boolean> {
    try {
      // 通过获取模型列表来测试连接，而不是发送聊天消息
      // 这样可以避免依赖具体的模型配置
      const url = buildServiceUrl('claude', 'models', config.baseUrl);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      });
      
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async getAvailableModels(config: AIServiceConfig): Promise<{ id: string; name: string }[]> {
    try {
      // Call Anthropic API to get available models
      const url = buildServiceUrl('claude', 'models', config.baseUrl);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Transform API response to our format
      if (data.data && Array.isArray(data.data)) {
        const models = data.data.map((model: any) => ({
          id: model.id,
          name: model.display_name || model.id
        }));
        
        // 如果API返回空列表，说明API Key可能无效或无权限
        if (models.length === 0) {
          throw new AIServiceError(
            'Claude API返回空模型列表，请检查API Key权限',
            'claude',
            403
          );
        }
        
        return models;
      }
      
      // API响应格式异常时抛出错误，不返回默认模型
      throw new AIServiceError(
        'Claude API响应格式异常，无法解析模型列表',
        'claude',
        500
      );
    } catch (error: any) {
      console.error('Failed to get Claude models:', getSafeErrorMessage(error));
      // API调用失败时抛出错误，不返回默认模型
      throw new AIServiceError(
        error.message || 'Claude API调用失败，无法获取模型列表',
        'claude',
        error.status,
        error
      );
    }
  }
}
