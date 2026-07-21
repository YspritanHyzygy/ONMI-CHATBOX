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
import { sanitizeErrorMessage } from './error-utils.js';

type AbortableConfig = AIServiceConfig & { signal?: AbortSignal };

export class GeminiAdapter implements AIServiceAdapter {
  provider = 'gemini' as const;

  private createClient(config: AIServiceConfig): GoogleGenerativeAI {
    return new GoogleGenerativeAI(config.apiKey);
  }

  /**
   * 让 chat/stream 与模型列表一致地尊重用户自定义 baseUrl（代理/中转场景）。
   * SDK 会自行追加 /v1beta 版本路径，所以这里归一化为服务器根地址；
   * 官方默认地址返回 undefined，走 SDK 内置端点。
   */
  private buildRequestOptions(config: AIServiceConfig): { baseUrl: string } | undefined {
    const raw = config.baseUrl?.trim();
    if (!raw) return undefined;
    const normalized = raw.replace(/\/+$/, '').replace(/\/v1(beta)?$/i, '');
    if (!normalized || normalized === 'https://generativelanguage.googleapis.com') return undefined;
    return { baseUrl: normalized };
  }

  /**
   * 思维链配置。Gemini 3+ 用 thinkingLevel（与 thinkingBudget 互斥），
   * 2.5 系列用 thinkingBudget（-1 动态 / 0 关闭 / 正整数上限）。
   * 旧版 SDK 未给 thinkingConfig 定义类型，但会把 generationConfig 原样
   * 序列化进 REST 请求，因此可以直接附加。
   */
  private applyThinkingConfig(generationConfig: any, config: AIServiceConfig): void {
    if (!config.enableThinking) return;
    const thinkingConfig: any = { includeThoughts: config.includeThoughts !== false };
    if (/^gemini-3/.test(config.model)) {
      const effort = config.reasoningEffort;
      // pro 型号只接受 low/high；minimal 统一降为 low，medium 在 pro 上提为 high
      const isPro = config.model.includes('pro');
      let level: string = effort || 'high';
      if (level === 'minimal') level = isPro ? 'low' : 'minimal';
      if (level === 'medium' && isPro) level = 'high';
      thinkingConfig.thinkingLevel = level;
    } else {
      thinkingConfig.thinkingBudget = config.thinkingBudget !== undefined ? config.thinkingBudget : -1;
    }
    generationConfig.thinkingConfig = thinkingConfig;
  }

  /** 将响应的 parts 按 thought 标志拆分为（思维，正文）两段文本 */
  private splitParts(parts: any[] | undefined): { thought: string; text: string } {
    let thought = '';
    let text = '';
    for (const part of parts || []) {
      if (typeof part?.text !== 'string' || !part.text) continue;
      if (part.thought === true) {
        thought += part.text;
      } else {
        text += part.text;
      }
    }
    return { thought, text };
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
        temperature: config.temperature ?? 0.7
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

      this.applyThinkingConfig(generationConfig, config);

      const model = client.getGenerativeModel({
        model: config.model,
        systemInstruction: systemInstruction || undefined,
        generationConfig
      }, this.buildRequestOptions(config));

      let response: any;
      if (history.length > 1) {
        // 如果有历史记录，使用聊天会话
        const chat = model.startChat({
          history: history.slice(0, -1) // 除了最后一条消息
        });
        const result = await chat.sendMessage(lastUserMessage.content, {
          signal: (config as AbortableConfig).signal
        });
        response = await result.response;
      } else {
        // 单次对话
        const result = await model.generateContent(lastUserMessage.content, {
          signal: (config as AbortableConfig).signal
        });
        response = await result.response;
      }

      // 开启思维链时正文与思维混在 parts 里，需要拆分；未开启时沿用 text()
      const { thought, text } = config.enableThinking
        ? this.splitParts(response.candidates?.[0]?.content?.parts)
        : { thought: '', text: response.text() };
      const thoughtTokens = response.usageMetadata?.thoughtsTokenCount;

      return {
        content: text,
        model: config.model,
        provider: 'gemini',
        thinking: thought ? { content: thought, tokens: thoughtTokens } : undefined,
        usage: response.usageMetadata ? {
          promptTokens: response.usageMetadata.promptTokenCount || 0,
          completionTokens: response.usageMetadata.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata.totalTokenCount || 0,
          reasoningTokens: thoughtTokens
        } : undefined
      };
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

      console.log('[Gemini] 历史消息数量:', history.length);

      const generationConfig: any = {
        temperature: config.temperature ?? 0.7
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

      this.applyThinkingConfig(generationConfig, config);

      const model = client.getGenerativeModel({
        model: config.model,
        systemInstruction: systemInstruction || undefined,
        generationConfig
      }, this.buildRequestOptions(config));

      console.log('[Gemini] 开始调用API...');
      let result;
      if (history.length > 1) {
        console.log('[Gemini] 使用聊天模式，历史消息:', history.length - 1);
        const chat = model.startChat({
          history: history.slice(0, -1)
        });
        result = await chat.sendMessageStream(lastUserMessage.content, {
          signal: (config as AbortableConfig).signal
        });
      } else {
        console.log('[Gemini] 使用单次生成模式');
        result = await model.generateContentStream(lastUserMessage.content, {
          signal: (config as AbortableConfig).signal
        });
      }

      console.log('[Gemini] API调用成功，开始处理流式响应...');
      let chunkCount = 0;
      let totalContent = '';
      let sawThought = false;
      let latestThoughtTokens: number | undefined;

      for await (const chunk of result.stream) {
        try {
          chunkCount++;
          // 完整的 thoughtsTokenCount 通常在最后一个（纯正文）chunk 的
          // usageMetadata 里，因此每个 chunk 都要采集
          const chunkThoughtTokens = (chunk as any).usageMetadata?.thoughtsTokenCount;
          if (typeof chunkThoughtTokens === 'number') latestThoughtTokens = chunkThoughtTokens;

          if (config.enableThinking) {
            // 思维与正文混在 parts 中，逐块拆分并分别下发
            const { thought, text } = this.splitParts((chunk as any).candidates?.[0]?.content?.parts);
            if (thought) {
              sawThought = true;
              yield {
                content: '',
                done: false,
                model: config.model,
                provider: 'gemini',
                thinking: { content: thought, done: false, tokens: latestThoughtTokens }
              };
            }
            if (text) {
              totalContent += text;
              yield {
                content: text,
                done: false,
                model: config.model,
                provider: 'gemini'
              };
            }
            continue;
          }

          const chunkText = chunk.text();
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
          console.error('[Gemini] 处理chunk时出错:', sanitizeErrorMessage(chunkError.message || 'Unknown chunk error'));
          // A missing/corrupt chunk makes the reply incomplete. Propagate the
          // failure so the chat route never persists partial assistant text.
          throw chunkError;
        }
      }
      
      console.log(`[Gemini] 流式响应完成，总共${chunkCount}个chunk，总长度:${totalContent.length}`);

      yield {
        content: '',
        done: true,
        model: config.model,
        provider: 'gemini',
        ...(sawThought ? { thinking: { content: '', done: true, tokens: latestThoughtTokens } } : {})
      };
    } catch (error: any) {
      console.error('[Gemini] 流式聊天出错:', {
        message: sanitizeErrorMessage(error.message || 'Unknown error'),
        status: error.status,
        code: error.code
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
