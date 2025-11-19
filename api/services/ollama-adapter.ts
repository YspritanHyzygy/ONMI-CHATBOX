/**
 * Ollama服务适配器
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
import { buildServiceUrl } from './url-utils.js';

export class OllamaAdapter implements AIServiceAdapter {
  provider = 'ollama' as const;

  private createClient(config: AIServiceConfig): OpenAI {
    // Ollama的OpenAI兼容API在 /v1 路径下
    const baseUrl = config.baseUrl || 'http://localhost:11434';
    // 确保使用 /v1 路径，但先尝试不同的可能路径
    const openaiCompatibleUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
    
    console.log(`[DEBUG] Ollama createClient - baseUrl: ${baseUrl}, final URL: ${openaiCompatibleUrl}`);
    
    return new OpenAI({
      apiKey: config.apiKey || 'ollama', // Ollama通常不需要API key
      baseURL: openaiCompatibleUrl
    });
  }

  async chat(messages: ChatMessage[], config: AIServiceConfig): Promise<AIResponse> {
    try {
      // 先尝试使用Ollama原生API而不是OpenAI兼容API
      const chatUrl = buildServiceUrl('ollama', 'chat', config.baseUrl);
      
      console.log(`[DEBUG] Ollama chat request for model: ${config.model}`);
      
      const requestBody = {
        model: config.model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        stream: false,
        options: {
          temperature: config.temperature || 0.7,
          num_predict: config.maxTokens || 2000
        }
      };

      console.log(`[DEBUG] Ollama native API request:`, requestBody);
      console.log(`[DEBUG] Ollama API URL: ${chatUrl}`);
      
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new AIServiceError(
          `Ollama API调用失败: HTTP ${response.status}`,
          'ollama',
          response.status
        );
      }

      const data = await response.json();
      console.log(`[DEBUG] Ollama native API response:`, data);

      if (!data.message?.content) {
        throw new AIServiceError('Ollama返回空响应内容', 'ollama');
      }

      return {
        content: data.message.content,
        model: data.model || config.model,
        provider: 'ollama',
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens || 0,
          completionTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0
        } : undefined
      };
    } catch (error: any) {
      console.error(`[DEBUG] Ollama chat error:`, error);
      throw new AIServiceError(
        error.message || 'Ollama API调用失败',
        'ollama',
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
            provider: 'ollama'
          };
        }
        
        if (choice?.finish_reason) {
          yield {
            content: '',
            done: true,
            model: chunk.model,
            provider: 'ollama'
          };
          break;
        }
      }
    } catch (error: any) {
      throw new AIServiceError(
        error.message || 'Ollama流式API调用失败',
        'ollama',
        error.status,
        error
      );
    }
  }

  async testConnection(config: AIServiceConfig): Promise<boolean> {
    try {
      // 通过检查Ollama服务状态来测试连接，而不是发送聊天消息
      // 这样可以避免依赖具体的模型配置
      const url = buildServiceUrl('ollama', 'models', config.baseUrl);
      const response = await fetch(url);
      
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async getAvailableModels(config: AIServiceConfig): Promise<{ id: string; name: string }[]> {
    try {
      const url = buildServiceUrl('ollama', 'models', config.baseUrl);
      console.log(`[DEBUG] Ollama getAvailableModels - fetching from: ${url}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new AIServiceError(
          `Failed to fetch Ollama models: HTTP ${response.status}`,
          'ollama',
          response.status
        );
      }
      
      const data = await response.json();
      console.log(`[DEBUG] Ollama models response:`, JSON.stringify(data, null, 2));
      
      const models = data.models?.map((model: any) => ({
        id: model.name,
        name: model.name
      })) || [];
      
      console.log(`[DEBUG] Ollama parsed models:`, JSON.stringify(models, null, 2));
      
      // If no models are installed, return empty array instead of throwing error
      if (models.length === 0) {
        console.log(`[DEBUG] No Ollama models found, but service is running`);
        return [];
      }
      
      return models;
    } catch (error: any) {
      console.error('Ollama获取模型列表失败:', error);
      
      // 如果是网络错误，抛出错误；如果只是没有模型，返回空数组
      if (error instanceof AIServiceError) {
        throw error;
      }
      
      throw new AIServiceError(
        `Ollama服务连接失败: ${error.message}`,
        'ollama',
        404
      );
    }
  }

  // Ollama特有的方法：拉取模型
  async pullModel(modelName: string, config: AIServiceConfig): Promise<boolean> {
    try {
      const pullUrl = buildServiceUrl('ollama', 'pull', config.baseUrl);
      const response = await fetch(pullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: modelName })
      });
      
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}