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

export class ClaudeAdapter implements AIServiceAdapter {
  provider = 'claude' as const;

  private createClient(config: AIServiceConfig): Anthropic {
    return new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://api.anthropic.com'
    });
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
        max_tokens: config.maxTokens || 2000,
        temperature: config.temperature || 0.7
      };

      // Claude 支持 top_p 参数
      if (config.topP !== undefined) {
        requestParams.top_p = config.topP;
      }

      // Claude 支持 stop 参数
      if (config.stop) {
        requestParams.stop_sequences = Array.isArray(config.stop) ? config.stop : [config.stop];
      }

      const response = await client.messages.create(requestParams);

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new AIServiceError('Unexpected response type', 'claude');
      }

      return {
        content: content.text,
        model: response.model,
        provider: 'claude',
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
        max_tokens: config.maxTokens || 2000,
        temperature: config.temperature || 0.7,
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

      const stream = await client.messages.create(streamParams);

      for await (const chunk of stream as any) {
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
      console.error('Failed to get Claude models:', error);
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