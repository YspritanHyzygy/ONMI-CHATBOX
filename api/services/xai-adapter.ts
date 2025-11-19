/**
 * xAI Grok服务适配器
 */
import OpenAI from 'openai';
import { 
  AIServiceAdapter, 
  AIServiceConfig, 
  ChatMessage, 
  AIResponse, 
  StreamResponse, 
  AIServiceError 
} from './types.js';

export class XAIAdapter implements AIServiceAdapter {
  provider = 'xai' as const;

  private createClient(config: AIServiceConfig): OpenAI {
    // xAI使用OpenAI兼容的API
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://api.x.ai/v1'
    });
  }

  async chat(messages: ChatMessage[], config: AIServiceConfig): Promise<AIResponse> {
    try {
      const client = this.createClient(config);
      
      const requestParams: any = {
        model: config.model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 2000
      };

      // 添加其他支持的参数
      if (config.topP !== undefined) {
        requestParams.top_p = config.topP;
      }
      if (config.frequencyPenalty !== undefined) {
        requestParams.frequency_penalty = config.frequencyPenalty;
      }
      if (config.presencePenalty !== undefined) {
        requestParams.presence_penalty = config.presencePenalty;
      }
      if (config.stop) {
        requestParams.stop = config.stop;
      }

      const response = await client.chat.completions.create(requestParams);

      const choice = response.choices[0];
      if (!choice?.message?.content) {
        throw new AIServiceError('No response content', 'xai');
      }

      return {
        content: choice.message.content,
        model: response.model,
        provider: 'xai',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens
        } : undefined
      };
    } catch (error: any) {
      throw new AIServiceError(
        error.message || 'xAI API调用失败',
        'xai',
        error.status,
        error
      );
    }
  }

  async *streamChat(messages: ChatMessage[], config: AIServiceConfig): AsyncGenerator<StreamResponse> {
    try {
      const client = this.createClient(config);
      
      const streamParams: any = {
        model: config.model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 2000,
        stream: true
      };

      // 添加其他支持的参数
      if (config.topP !== undefined) {
        streamParams.top_p = config.topP;
      }
      if (config.frequencyPenalty !== undefined) {
        streamParams.frequency_penalty = config.frequencyPenalty;
      }
      if (config.presencePenalty !== undefined) {
        streamParams.presence_penalty = config.presencePenalty;
      }
      if (config.stop) {
        streamParams.stop = config.stop;
      }

      const stream = await client.chat.completions.create(streamParams);

      for await (const chunk of stream as any) {
        const choice = chunk.choices[0];
        if (choice?.delta?.content) {
          yield {
            content: choice.delta.content,
            done: false,
            model: chunk.model,
            provider: 'xai'
          };
        }
        
        if (choice?.finish_reason) {
          yield {
            content: '',
            done: true,
            model: chunk.model,
            provider: 'xai'
          };
          break;
        }
      }
    } catch (error: any) {
      throw new AIServiceError(
        error.message || 'xAI流式API调用失败',
        'xai',
        error.status,
        error
      );
    }
  }

  async testConnection(config: AIServiceConfig): Promise<boolean> {
    try {
      const client = this.createClient(config);
      
      // 通过获取模型列表来测试连接，而不是发送聊天消息
      // 这样可以避免依赖具体的模型配置
      await client.models.list();
      
      return true;
    } catch (error) {
      return false;
    }
  }

  async getAvailableModels(config: AIServiceConfig): Promise<{ id: string; name: string }[]> {
    try {
      const client = this.createClient(config);
      const response = await client.models.list();
      
      const models = response.data
        .map(model => ({
          id: model.id,
          name: model.id
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
      
      // If API returns empty list, this indicates a problem - don't return defaults
      if (models.length === 0) {
        throw new AIServiceError(
          'xAI API返回空模型列表，可能API Key无效或服务不可用',
          'xai',
          404
        );
      }
      
      return models;
    } catch (error: any) {
      // Wrap error in AIServiceError and throw it
      throw new AIServiceError(
        `Failed to get xAI models: ${error.message || 'Unknown error'}`,
        'xai',
        error.status,
        error
      );
    }
  }
}