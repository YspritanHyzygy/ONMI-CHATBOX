/**
 * Google Gemini服务适配器
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  AIServiceAdapter, 
  AIServiceConfig, 
  ChatMessage, 
  AIResponse, 
  StreamResponse, 
  AIServiceError 
} from './types.js';
import { buildServiceUrl } from './url-utils.js';

export class GeminiAdapter implements AIServiceAdapter {
  provider = 'gemini' as const;

  private createClient(config: AIServiceConfig): GoogleGenerativeAI {
    return new GoogleGenerativeAI(config.apiKey);
  }

  private convertMessages(messages: ChatMessage[]): { history: any[], systemInstruction?: string } {
    // Gemini使用不同的消息格式
    const history = [];
    let systemInstruction = '';
    
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      if (message.role === 'system') {
        systemInstruction = message.content;
      } else if (message.role === 'user') {
        history.push({
          role: 'user',
          parts: [{ text: message.content }]
        });
      } else if (message.role === 'assistant') {
        history.push({
          role: 'model',
          parts: [{ text: message.content }]
        });
      }
    }
    
    return { history, systemInstruction: systemInstruction || undefined };
  }

  async chat(messages: ChatMessage[], config: AIServiceConfig): Promise<AIResponse> {
    try {
      const client = this.createClient(config);
      const { history, systemInstruction } = this.convertMessages(messages);
      
      // 获取最后一条用户消息
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      if (!lastUserMessage) {
        throw new AIServiceError('No user message found', 'gemini');
      }

      const generationConfig: any = {
        temperature: config.temperature || 0.7
      };

      // 只有当用户明确设置maxTokens时才限制输出长度，否则让模型自动判断
      if (config.maxTokens) {
        generationConfig.maxOutputTokens = config.maxTokens;
      }

      // Gemini 支持 topP 参数
      if (config.topP !== undefined) {
        generationConfig.topP = config.topP;
      }

      // Gemini 支持 stop 参数
      if (config.stop) {
        generationConfig.stopSequences = Array.isArray(config.stop) ? config.stop : [config.stop];
      }

      const model = client.getGenerativeModel({ 
        model: config.model,
        systemInstruction: systemInstruction || undefined,
        generationConfig
      });

      // 如果有历史记录，使用聊天会话
      if (history.length > 1) {
        const chat = model.startChat({
          history: history.slice(0, -1) // 除了最后一条消息
        });
        
        const result = await chat.sendMessage(lastUserMessage.content);
        const response = await result.response;
        
        return {
          content: response.text(),
          model: config.model,
          provider: 'gemini',
          usage: response.usageMetadata ? {
            promptTokens: response.usageMetadata.promptTokenCount || 0,
            completionTokens: response.usageMetadata.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata.totalTokenCount || 0
          } : undefined
        };
      } else {
        // 单次对话
        const result = await model.generateContent(lastUserMessage.content);
        const response = await result.response;
        
        return {
          content: response.text(),
          model: config.model,
          provider: 'gemini',
          usage: response.usageMetadata ? {
            promptTokens: response.usageMetadata.promptTokenCount || 0,
            completionTokens: response.usageMetadata.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata.totalTokenCount || 0
          } : undefined
        };
      }
    } catch (error: any) {
      throw new AIServiceError(
        error.message || 'Gemini API调用失败',
        'gemini',
        error.status,
        error
      );
    }
  }

  async *streamChat(messages: ChatMessage[], config: AIServiceConfig): AsyncGenerator<StreamResponse> {
    try {
      console.log('[Gemini] 开始流式聊天，配置:', {
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        messagesCount: messages.length
      });
      
      const client = this.createClient(config);
      const { history, systemInstruction } = this.convertMessages(messages);
      
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      if (!lastUserMessage) {
        throw new AIServiceError('No user message found', 'gemini');
      }

      console.log('[Gemini] 用户消息:', lastUserMessage.content.substring(0, 100) + '...');
      console.log('[Gemini] 历史消息数量:', history.length);

      const generationConfig: any = {
        temperature: config.temperature || 0.7
      };

      // 只有当用户明确设置maxTokens时才限制输出长度，否则让模型自动判断
      if (config.maxTokens) {
        generationConfig.maxOutputTokens = config.maxTokens;
      }

      // Gemini 支持 topP 参数
      if (config.topP !== undefined) {
        generationConfig.topP = config.topP;
      }

      // Gemini 支持 stop 参数
      if (config.stop) {
        generationConfig.stopSequences = Array.isArray(config.stop) ? config.stop : [config.stop];
      }

      console.log('[Gemini] 生成配置:', generationConfig);

      const model = client.getGenerativeModel({ 
        model: config.model,
        systemInstruction: systemInstruction || undefined,
        generationConfig
      });

      console.log('[Gemini] 开始调用API...');
      let result;
      if (history.length > 1) {
        console.log('[Gemini] 使用聊天模式，历史消息:', history.length - 1);
        const chat = model.startChat({
          history: history.slice(0, -1)
        });
        result = await chat.sendMessageStream(lastUserMessage.content);
      } else {
        console.log('[Gemini] 使用单次生成模式');
        result = await model.generateContentStream(lastUserMessage.content);
      }

      console.log('[Gemini] API调用成功，开始处理流式响应...');
      let chunkCount = 0;
      let totalContent = '';
      
      for await (const chunk of result.stream) {
        try {
          const chunkText = chunk.text();
          chunkCount++;
          
          if (chunkText) {
            totalContent += chunkText;
            console.log(`[Gemini] 收到第${chunkCount}个chunk，长度:${chunkText.length}`);
            
            yield {
              content: chunkText,
              done: false,
              model: config.model,
              provider: 'gemini'
            };
          } else {
            console.log(`[Gemini] 第${chunkCount}个chunk为空`);
          }
        } catch (chunkError: any) {
          console.error('[Gemini] 处理chunk时出错:', chunkError);
          // 继续处理下一个chunk
        }
      }
      
      console.log(`[Gemini] 流式响应完成，总共${chunkCount}个chunk，总长度:${totalContent.length}`);
      
      yield {
        content: '',
        done: true,
        model: config.model,
        provider: 'gemini'
      };
    } catch (error: any) {
      console.error('[Gemini] 流式聊天出错:', {
        message: error.message,
        status: error.status,
        code: error.code,
        details: error.details,
        stack: error.stack
      });
      
      throw new AIServiceError(
        error.message || 'Gemini流式API调用失败',
        'gemini',
        error.status,
        error
      );
    }
  }

  async testConnection(config: AIServiceConfig): Promise<boolean> {
    try {
      // 通过获取模型列表来测试连接，而不是发送聊天消息
      // 这样可以避免依赖具体的模型配置
      const url = buildServiceUrl('gemini', 'models', config.baseUrl, { key: config.apiKey });
      const response = await fetch(url, {
        method: 'GET',
        headers: {
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
      // Call Google Gemini API to get available models
      const url = buildServiceUrl('gemini', 'models', config.baseUrl, { key: config.apiKey });
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new AIServiceError(
          `Failed to fetch Gemini models: HTTP ${response.status}`,
          'gemini',
          response.status
        );
      }

      const data = await response.json();
      
      // Transform API response to our format
      if (data.models && Array.isArray(data.models)) {
        const models = data.models
          .filter((model: any) => model.name && model.name.includes('models/gemini'))
          .map((model: any) => {
            const modelId = model.name.replace('models/', '');
            return {
              id: modelId,
              name: model.displayName || modelId
            };
          });
        
        // If API returns empty list, this indicates a problem with API key or service
        if (models.length === 0) {
          throw new AIServiceError(
            'Gemini API返回空模型列表，请检查API Key是否有效',
            'gemini',
            403
          );
        }
        
        return models;
      }
      
      // If API response format is unexpected, throw error instead of returning defaults
      throw new AIServiceError(
        'Gemini API响应格式异常，无法解析模型列表',
        'gemini',
        500
      );
    } catch (error: any) {
      // If it's already an AIServiceError, re-throw it
      if (error instanceof AIServiceError) {
        throw error;
      }
      
      // For other errors, wrap them in AIServiceError
      throw new AIServiceError(
        `Failed to get Gemini models: ${error.message || 'Unknown error'}`,
        'gemini',
        error.status,
        error
      );
    }
  }
}