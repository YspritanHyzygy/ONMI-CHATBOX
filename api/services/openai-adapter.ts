/**
 * OpenAI服务适配器
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

export class OpenAIAdapter implements AIServiceAdapter {
  provider = 'openai' as const;

  private createClient(config: AIServiceConfig): OpenAI {
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://api.openai.com/v1'
    });
  }

  async chat(messages: ChatMessage[], config: AIServiceConfig): Promise<AIResponse> {
    try {
      const client = this.createClient(config);
      
      console.log('[OpenAI] 使用传统 Chat Completions API 进行对话');
      // 使用传统的 Chat Completions API
      const requestParams: any = {
        model: config.model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        max_completion_tokens: config.maxTokens || 2000
      };

      // 默认添加 temperature 参数
      requestParams.temperature = config.temperature || 0.7;

      let response;
      try {
        response = await client.chat.completions.create(requestParams);
      } catch (error: any) {
        // 如果是 temperature 不支持的错误，重试不带 temperature 参数
        if (error.code === 'unsupported_value' && error.param === 'temperature') {
          console.log(`[OpenAI] 模型 ${config.model} 不支持自定义 temperature，使用默认值重试`);
          delete requestParams.temperature;
          response = await client.chat.completions.create(requestParams);
        } else {
          throw error;
        }
      }

      const choice = response.choices[0];
      if (!choice?.message?.content) {
        throw new AIServiceError('No response content', 'openai');
      }

      return {
        content: choice.message.content,
        model: response.model,
        provider: 'openai',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens
        } : undefined
      };
    } catch (error: any) {
      throw new AIServiceError(
        error.message || 'OpenAI API调用失败',
        'openai',
        error.status,
        error
      );
    }
  }

  async *streamChat(messages: ChatMessage[], config: AIServiceConfig): AsyncGenerator<StreamResponse> {
    try {
      const client = this.createClient(config);
      
      // Responses API 暂不支持流式响应，使用传统 API
      const streamParams: any = {
        model: config.model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        max_completion_tokens: config.maxTokens || 2000,
        stream: true
      };

      // 默认添加 temperature 参数
      streamParams.temperature = config.temperature || 0.7;

      let stream;
      try {
        stream = await client.chat.completions.create(streamParams);
      } catch (error: any) {
        // 如果是 temperature 不支持的错误，重试不带 temperature 参数
        if (error.code === 'unsupported_value' && error.param === 'temperature') {
          console.log(`[OpenAI] 模型 ${config.model} 不支持自定义 temperature，使用默认值重试`);
          delete streamParams.temperature;
          stream = await client.chat.completions.create(streamParams);
        } else {
          throw error;
        }
      }

      for await (const chunk of stream as any) {
        const choice = chunk.choices[0];
        if (choice?.delta?.content) {
          yield {
            content: choice.delta.content,
            done: false,
            model: chunk.model,
            provider: 'openai'
          };
        }
        
        if (choice?.finish_reason) {
          yield {
            content: '',
            done: true,
            model: chunk.model,
            provider: 'openai'
          };
          break;
        }
      }
    } catch (error: any) {
      throw new AIServiceError(
        error.message || 'OpenAI流式API调用失败',
        'openai',
        error.status,
        error
      );
    }
  }

  async testConnection(config: AIServiceConfig): Promise<boolean> {
    try {
      console.log(`[DEBUG] OpenAI testConnection - Creating client with baseURL: ${config.baseUrl || 'https://api.openai.com/v1'}`);
      const client = this.createClient(config);
      
      // 通过获取模型列表来测试连接，而不是发送聊天消息
      // 这样可以避免依赖具体的模型配置
      console.log('[DEBUG] OpenAI testConnection - Calling models.list()');
      const response = await client.models.list();
      console.log(`[DEBUG] OpenAI testConnection - Success, found ${response.data.length} models`);
      
      return true;
    } catch (error: any) {
      console.error('[DEBUG] OpenAI testConnection - Error:', {
        message: error.message,
        status: error.status,
        code: error.code,
        type: error.type
      });
      return false;
    }
  }

  async getAvailableModels(config: AIServiceConfig): Promise<{ id: string; name: string }[]> {
    try {
      const client = this.createClient(config);
      const response = await client.models.list();
      
      const models = response.data
        // 保留所有模型数据，但标记模型类型
        .map(model => {
          const modelId = model.id.toLowerCase();
          
          // 判断模型类型
          let modelType = 'other';
          let visibleInChat = false;
          
          // 优先判断 Research 模型（避免被其他规则误分类）
          if (modelId.includes('research') || modelId.includes('-research') || modelId.endsWith('research')) {
            modelType = 'research';
            visibleInChat = true; // Research 模型应该在聊天界面可见
          // 非聊天模型判断（这些模型不应在聊天界面显示）
          } else if (modelId.includes('whisper')) {
            modelType = 'speech-to-text';
          } else if (modelId.includes('omni')) {
            modelType = 'multimodal';
          } else if (modelId.includes('tts') || modelId.endsWith('-tts')) {
            modelType = 'text-to-speech';
          } else if (modelId.includes('realtime') || modelId.endsWith('-realtime') || modelId.includes('-realtime-')) {
            modelType = 'realtime';
          } else if (modelId.includes('audio') || modelId.endsWith('-audio') || modelId.includes('-audio-')) {
            modelType = 'audio';
          } else if (modelId.includes('transcribe') || modelId.endsWith('-transcribe') || modelId.includes('-transcribe-')) {
            modelType = 'transcription';
          } else if (modelId.includes('search') || modelId.endsWith('-search') || modelId.includes('-search-')) {
            modelType = 'search';
          } else if (modelId.includes('dall-e') || modelId.startsWith('dall-e')) {
            modelType = 'image-generation';
          } else if (modelId.includes('babbage') || modelId.startsWith('babbage')) {
            modelType = 'completion-legacy';
          } else if (modelId.includes('codex') || modelId.startsWith('codex')) {
            modelType = 'code-completion';
          } else if (modelId.includes('gpt-image') || modelId.startsWith('gpt-image')) {
            modelType = 'image-generation';
          } else if (modelId.includes('instruct') || modelId.endsWith('-instruct') || modelId.includes('-instruct-')) {
            modelType = 'instruction-following';
          } else if (modelId === 'davinci-002') {
            modelType = 'completion-legacy';
          } else if (modelId.includes('embedding')) {
            modelType = 'embedding';
          } else {
            // 默认将其他所有模型视为聊天模型（黑名单模式：只排除上面明确的非聊天模型）
            if (modelId.includes('davinci') || modelId.includes('curie') || modelId.includes('ada')) {
              modelType = 'completion';
              visibleInChat = true;
            } else {
              modelType = 'chat';
              visibleInChat = true;
            }
          }
          
          return {
            id: model.id,
            name: model.id,
            type: modelType,
            visibleInChat: visibleInChat,
            rawData: model // 保留原始API数据
          };
        })
        .sort((a, b) => a.id.localeCompare(b.id));
      
      // 如果API返回空列表，说明API Key可能无效或无权限访问模型
      if (models.length === 0) {
        throw new AIServiceError(
          'OpenAI API返回空模型列表，请检查API Key权限',
          'openai',
          403
        );
      }
      
      // 一次性调试：检查是否有 Research 模型
      const researchModels = models.filter(model => {
        const modelId = model.id.toLowerCase();
        return modelId.includes('research') || modelId.includes('o3-deep') || modelId.includes('o4-mini-deep');
      });
      if (researchModels.length > 0) {
        console.log(`[INFO] OpenAI API 发现 ${researchModels.length} 个 Research 模型:`, researchModels.map(m => m.id));
      } else {
        console.log('[INFO] OpenAI API 未发现 Research 模型，这是正常的（可能需要特殊权限）');
      }
      
      // 根据内存规范，采用软隐藏策略：保留所有数据但仅返回聊天模型用于UI显示
      const chatModels = models.filter(model => model.visibleInChat);
      
      // 如果筛选后没有聊天模型，返回错误
      if (chatModels.length === 0) {
        throw new AIServiceError(
          'OpenAI API未返回任何可用的聊天模型',
          'openai',
          404
        );
      }
      
      // 只返回聊天模型，但保持原有的简单格式以符合接口定义
      return chatModels.map(model => ({
        id: model.id,
        name: model.name
      }));
    } catch (error: any) {
      console.error('OpenAI获取模型列表失败:', error);
      
      // API调用失败时抛出错误，不返回默认模型
      throw new AIServiceError(
        error.message || 'OpenAI API调用失败，无法获取模型列表',
        'openai',
        error.status,
        error
      );
    }
  }



  /**
   * 检索之前的响应
   */
  async retrieveResponse(responseId: string, config: AIServiceConfig): Promise<AIResponse> {
    try {
      const client = this.createClient(config);
      const response = await (client as any).responses.retrieve(responseId);
      
      // 解析响应内容
      if (!response.output || response.output.length === 0) {
        throw new AIServiceError('No response output', 'openai');
      }

      const firstOutput = response.output[0];
      let content = '';
      
      if (firstOutput.content && firstOutput.content.length > 0) {
        const textContent = firstOutput.content.find((c: any) => c.type === 'text');
        if (textContent) {
          content = textContent.text;
        }
      }

      return {
        content,
        model: response.model,
        provider: 'openai',
        responseId: response.id,
        createdAt: response.created_at
      };
    } catch (error: any) {
      throw new AIServiceError(
        error.message || 'OpenAI响应检索失败',
        'openai',
        error.status,
        error
      );
    }
  }

  /**
   * 删除响应
   */
  async deleteResponse(responseId: string, config: AIServiceConfig): Promise<boolean> {
    try {
      const client = this.createClient(config);
      await (client as any).responses.delete(responseId);
      return true;
    } catch (error: any) {
      console.error('OpenAI删除响应失败:', error);
      return false;
    }
  }
}