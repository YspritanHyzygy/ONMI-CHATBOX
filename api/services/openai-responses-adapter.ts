/**
 * OpenAI Responses API 专用适配器
 * 支持 Research 模型和工具调用
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

export class OpenAIResponsesAdapter implements AIServiceAdapter {
  provider = 'openai-responses' as const;

  private createClient(config: AIServiceConfig): OpenAI {
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://api.openai.com/v1'
    });
  }

  /**
   * 判断是否为 Research 模型
   */
  private isResearchModel(model: string): boolean {
    const modelLower = model.toLowerCase();
    return modelLower.includes('research') || 
           modelLower.includes('o3-deep-research') || 
           modelLower.includes('o4-mini-deep-research');
  }



  async chat(messages: ChatMessage[], config: AIServiceConfig): Promise<AIResponse> {
    try {
      const client = this.createClient(config);
      
      console.log('[OpenAI Responses API] 开始对话，模型:', config.model);
      console.log('[OpenAI Responses API] Research 模型:', this.isResearchModel(config.model));

      // 使用 Responses API - 尝试标准聊天格式
      // Response API 使用 input 参数而不是 messages
      const requestParams: any = {
        model: config.model,
        input: messages.map(msg => ({
          role: msg.role as 'system' | 'user' | 'assistant',
          content: msg.content
        })),
        max_output_tokens: config.maxTokens || 100000 // Response API 使用 max_output_tokens
      };
      
      // 如果是 Research 模型，使用特殊的内容格式
      if (this.isResearchModel(config.model)) {
        requestParams.input = messages.map(msg => ({
          role: msg.role as 'system' | 'user' | 'assistant',
          content: [{
            type: 'input_text',
            text: msg.content
          }]
        }));
      }

      // 暂时禁用工具配置，因为 Responses API 的工具格式与标准 API 不同
      // const tools = this.buildToolsConfig(config);
      // if (tools) {
      //   requestParams.tools = tools;
      //   console.log('[OpenAI Responses API] 已配置工具:', tools.map(t => t.type).join(', '));
      // }

      // 添加 Response API 参数（适用于所有模型）
      requestParams.store = config.store !== false; // 默认存储响应数据
      
      // 后台模式说明：
      // - background: true 会立即返回，响应在后台生成，需要轮询获取结果
      // - background: false 会等待响应完成后返回
      // 目前我们不支持轮询，所以强制禁用后台模式
      requestParams.background = false;
      console.log('[DEBUG] 强制禁用后台模式，等待响应完成');

      // 添加链式对话参数
      if (config.previousResponseId) {
        requestParams.include = [{
          type: 'response',
          id: config.previousResponseId
        }];
        console.log('[OpenAI Responses API] 使用链式对话，前一响应ID:', config.previousResponseId);
      }

      // Responses API 通常不支持 temperature 参数，先尝试不添加
      // if (!this.isResearchModel(config.model)) {
      //   requestParams.temperature = config.temperature || 0.7;
      // }

      console.log('[DEBUG] config.maxTokens 值:', config.maxTokens);
      console.log('[DEBUG] Responses API 请求参数:', JSON.stringify(requestParams, null, 2));
      console.log('[DEBUG] 参数中是否包含 max_tokens:', 'max_tokens' in requestParams);
      console.log('[DEBUG] 参数中是否包含 max_completion_tokens:', 'max_completion_tokens' in requestParams);
      console.log('[DEBUG] requestParams 的所有键:', Object.keys(requestParams));
      
      let response;
      let usedStandardAPI = false;
      
      try {
        // 使用 Responses API 端点（适用于所有模型）
        console.log('[DEBUG] 使用 Responses API 端点，模型:', config.model);
        
        // 尝试使用原生 HTTP 请求而不是客户端库方法
        const baseURL = config.baseUrl || 'https://api.openai.com/v1';
        const url = `${baseURL}/responses`;
        
        const httpResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestParams)
        });
        
        if (!httpResponse.ok) {
          const errorText = await httpResponse.text();
          console.error('[DEBUG] HTTP 请求失败:', {
            status: httpResponse.status,
            statusText: httpResponse.statusText,
            body: errorText
          });
          
          // 创建一个包含 status 属性的错误对象
          const error: any = new Error(`HTTP ${httpResponse.status}: ${errorText}`);
          error.status = httpResponse.status;
          error.message = errorText;
          throw error;
        }
        
        response = await httpResponse.json();
        console.log('[DEBUG] API 调用成功，响应:', JSON.stringify(response, null, 2));
      } catch (error: any) {
        console.error('[DEBUG] API 调用失败:', {
          message: error.message,
          status: error.status,
          code: error.code,
          type: error.type,
          param: error.param
        });
        
        // 如果 Responses API 失败（端点不存在），尝试标准 API
        // 注意：不要对参数错误进行回退，因为标准 API 也有同样的参数要求
        const shouldFallback = !usedStandardAPI && 
                               error.status === 404 && 
                               (error.message?.includes('not found') || error.message?.includes('responses'));
        
        if (shouldFallback) {
          console.log('[DEBUG] Responses API 端点不存在，回退到标准 Chat Completions API');
          try {
            // 转换为标准 API 格式
            const standardParams: any = {
              model: config.model,
              messages: messages.map(msg => ({
                role: msg.role as 'system' | 'user' | 'assistant',
                content: msg.content
              })),
              max_completion_tokens: config.maxTokens || 4000, // 新版 API 使用 max_completion_tokens
              temperature: config.temperature || 0.7
            };
            response = await client.chat.completions.create(standardParams);
            usedStandardAPI = true;
            console.log('[DEBUG] 标准 API 调用成功');
          } catch (fallbackError: any) {
            console.error('[DEBUG] 标准 API 也失败了:', fallbackError.message);
            throw fallbackError;
          }
        } else if ((error.code === 'unsupported_value' || error.message?.includes('Unsupported parameter')) && 
                   (error.param === 'temperature' || error.message?.includes('temperature'))) {
          console.log(`[OpenAI Responses] 模型 ${config.model} 不支持自定义 temperature，使用默认值重试`);
          delete requestParams.temperature;
          console.log('[DEBUG] 重试请求参数:', JSON.stringify(requestParams, null, 2));
          response = await (client as any).responses.create(requestParams);
          console.log('[DEBUG] 重试后的响应:', JSON.stringify(response, null, 2));
        } else if (error.message?.includes('max_tokens') && error.message?.includes('max_completion_tokens')) {
          console.log(`[OpenAI Responses] 模型 ${config.model} 需要使用 max_completion_tokens 参数`);
          // 这个错误不应该发生，因为我们已经使用了 max_completion_tokens
          // 但如果发生了，说明可能有其他问题
          console.error('[DEBUG] 意外的 max_tokens 错误，当前参数:', JSON.stringify(requestParams, null, 2));
          throw error;
        } else {
          throw error;
        }
      }
      
      console.log('[OpenAI Responses API] 响应成功，ID:', response.id);
      console.log('[OpenAI Responses API] 模型类型:', this.isResearchModel(config.model) ? 'Research' : 'Standard');

      // 从 API 响应中提取内容
      let content = '';
      
      console.log('[DEBUG] ========== API 响应详情 ==========');
      console.log('[DEBUG] 使用的 API 类型:', usedStandardAPI ? '标准 Chat Completions API' : 'Responses API');
      console.log('[DEBUG] 响应状态:', response.status);
      console.log('[DEBUG] 后台模式:', response.background);
      console.log('[DEBUG] 响应的所有键:', Object.keys(response));
      console.log('[DEBUG] response.output 类型:', typeof response.output);
      if (response.output && Array.isArray(response.output)) {
        console.log('[DEBUG] response.output 长度:', response.output.length);
        if (response.output.length > 0) {
          console.log('[DEBUG] response.output[0] 的键:', Object.keys(response.output[0]));
          console.log('[DEBUG] response.output[0]:', JSON.stringify(response.output[0], null, 2));
        } else {
          console.log('[DEBUG] ⚠️ response.output 是空数组！');
        }
      }
      console.log('[DEBUG] response.text:', JSON.stringify(response.text, null, 2));
      console.log('[DEBUG] response.usage:', JSON.stringify(response.usage, null, 2));
      console.log('[DEBUG] 完整响应:', JSON.stringify(response, null, 2));
      console.log('[DEBUG] =====================================');
      
      if (usedStandardAPI) {
        // 标准 OpenAI Chat Completions API 格式
        if (response.choices && Array.isArray(response.choices) && response.choices.length > 0) {
          const firstChoice = response.choices[0];
          if (firstChoice.message && firstChoice.message.content) {
            content = firstChoice.message.content;
            console.log('[DEBUG] 使用标准 choices[0].message.content 格式');
          }
        }
      } else {
        // Responses API 格式
        // 首先检查响应状态
        if (response.status && response.status !== 'completed') {
          console.warn(`[DEBUG] Response API 状态: ${response.status}`);
          if (response.status === 'queued' || response.status === 'in_progress') {
            throw new AIServiceError(
              `Response API 响应还在处理中（状态: ${response.status}）。请禁用后台模式或实现轮询逻辑。`,
              'openai-responses'
            );
          } else if (response.status === 'failed') {
            const errorMsg = response.error?.message || '未知错误';
            throw new AIServiceError(`Response API 失败: ${errorMsg}`, 'openai-responses');
          }
        }
        
        if (response.output_text) {
          content = response.output_text;
          console.log('[DEBUG] 使用 output_text 字段');
        } else if (response.output && Array.isArray(response.output) && response.output.length > 0) {
          // 从 output 数组中提取，查找 type 为 "message" 的元素
          const messageOutput = response.output.find((item: any) => item.type === 'message');
          
          if (!messageOutput) {
            console.log('[DEBUG] 未找到 type="message" 的输出，检查第一个元素');
            console.log('[DEBUG] output[0]:', JSON.stringify(response.output[0], null, 2));
          }
          
          const outputToUse = messageOutput || response.output[0];
          console.log('[DEBUG] 使用的 output 元素:', JSON.stringify(outputToUse, null, 2));
          
          // 优先检查 content 字段（可能是字符串或数组）
          if (outputToUse.content) {
            if (typeof outputToUse.content === 'string') {
              content = outputToUse.content;
              console.log('[DEBUG] 使用 output.content 字符串');
            } else if (Array.isArray(outputToUse.content)) {
              // content 是数组，查找文本类型的元素
              const textContent = outputToUse.content.find((c: any) => 
                c && (c.type === 'output_text' || c.type === 'text')
              );
              if (textContent && textContent.text) {
                content = textContent.text;
                console.log('[DEBUG] 使用 output.content 数组中的 output_text.text');
              } else if (outputToUse.content.length > 0 && typeof outputToUse.content[0] === 'string') {
                content = outputToUse.content[0];
                console.log('[DEBUG] 使用 output.content[0] 字符串');
              }
            } else if (typeof outputToUse.content === 'object' && outputToUse.content.text) {
              content = outputToUse.content.text;
              console.log('[DEBUG] 使用 output.content.text');
            }
          }
          
          // 如果 content 字段没有找到，尝试其他字段
          if (!content && outputToUse.text) {
            content = outputToUse.text;
            console.log('[DEBUG] 使用 output.text');
          }
        }
      }
      
      // 通用回退逻辑
      if (!content) {
        console.log('[DEBUG] 尝试通用字段提取');
        if (response.choices && Array.isArray(response.choices) && response.choices.length > 0) {
          const firstChoice = response.choices[0];
          if (firstChoice.message && firstChoice.message.content) {
            content = firstChoice.message.content;
            console.log('[DEBUG] 回退：使用标准 choices[0].message.content 格式');
          }
        } else if (response.content && typeof response.content === 'string') {
          content = response.content;
          console.log('[DEBUG] 回退：使用直接 content 字段');
        }
        // 注意：不使用 response.text，因为它是配置对象，不是内容
      }
      
      // 确保 content 是字符串
      if (content && typeof content !== 'string') {
        console.warn('[DEBUG] content 不是字符串，尝试转换:', typeof content, content);
        if (typeof content === 'object') {
          // 如果是对象，尝试提取文本
          if ((content as any).text) {
            content = (content as any).text;
          } else if (Array.isArray(content)) {
            // 如果是数组，尝试提取第一个文本元素
            const textItem = (content as any[]).find((item: any) => item.type === 'text' || item.type === 'output_text');
            if (textItem && textItem.text) {
              content = textItem.text;
            } else {
              content = JSON.stringify(content);
            }
          } else {
            content = JSON.stringify(content);
          }
        } else {
          content = String(content);
        }
      }
      
      if (!content) {
        console.error('[OpenAI API] 无法提取文本内容');
        console.error('[DEBUG] 完整响应结构:', JSON.stringify(response, null, 2));
        console.error('[DEBUG] 响应的所有键:', Object.keys(response));
        
        // 最后尝试从响应中找到任何可能包含文本的字段
        const possibleTextFields = ['output_text', 'text', 'content', 'message', 'result', 'data'];
        for (const field of possibleTextFields) {
          if (response[field] && typeof response[field] === 'string') {
            content = response[field];
            console.log(`[DEBUG] 最后尝试：找到文本内容在字段: ${field}`);
            break;
          }
        }
        
        if (!content) {
          throw new AIServiceError(
            `OpenAI API 返回了空的响应内容。使用的API: ${usedStandardAPI ? '标准API' : 'Responses API'}，响应结构: ` + JSON.stringify(Object.keys(response)),
            'openai-responses'
          );
        }
      }

      // 最终确保 content 是字符串
      const finalContent = typeof content === 'string' ? content : String(content);
      
      return {
        content: finalContent,
        model: response.model || config.model,
        provider: 'openai-responses',
        responseId: response.id, // Responses API 特有的响应ID
        createdAt: response.created, // 响应创建时间
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens || 0,
          completionTokens: response.usage.completion_tokens || 0,
          totalTokens: response.usage.total_tokens || 0
        } : undefined
      };
    } catch (error: any) {
      console.error('[OpenAI Responses API] 错误:', {
        message: error.message,
        status: error.status,
        code: error.code
      });
      
      // 如果已经是 AIServiceError，直接抛出
      if (error instanceof AIServiceError) {
        throw error;
      }
      
      // 包装其他错误
      throw new AIServiceError(
        error.message || 'OpenAI Responses API 调用失败',
        'openai-responses',
        error.status,
        error
      );
    }
  }

  async *streamChat(_messages: ChatMessage[], _config: AIServiceConfig): AsyncGenerator<StreamResponse> {
    // Responses API 不支持流式响应，应该在路由层面处理
    console.error('[OpenAI Responses API] 错误：Responses API 不支持流式响应，不应该调用此方法');
    throw new AIServiceError(
      'OpenAI Responses API 不支持流式响应，请使用非流式模式',
      'openai-responses'
    );
  }

  async testConnection(config: AIServiceConfig): Promise<boolean> {
    try {
      const client = this.createClient(config);
      // 简单的连接测试
      await client.models.list();
      return true;
    } catch (error: any) {
      console.error('[OpenAI Responses API] 连接测试失败:', error.message);
      return false;
    }
  }

  async getAvailableModels(config: AIServiceConfig): Promise<{ id: string; name: string }[]> {
    try {
      const client = this.createClient(config);
      const response = await client.models.list();
      
      // 保留所有模型数据，但标记模型类型
      const models = response.data
        .map(model => {
          const modelId = model.id.toLowerCase();
          
          // 判断模型类型
          let modelType = 'other';
          let visibleInChat = false;
          
          console.log(`[DEBUG] 处理模型: ${model.id}, 小写: ${modelId}`);
          
          // 非聊天模型判断（这些模型不应在聊天界面显示）
          if (modelId.includes('whisper')) {
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
            if (modelId.includes('research')) {
              modelType = 'research';
              visibleInChat = true; // Research 模型应该在聊天界面可见
              console.log(`[DEBUG] 识别为 Research 模型: ${model.id}`);
            } else if (modelId.includes('davinci') || modelId.includes('curie') || modelId.includes('ada')) {
              modelType = 'completion';
              visibleInChat = true;
            } else {
              modelType = 'chat';
              visibleInChat = true;
            }
          }
          
          console.log(`[DEBUG] 模型 ${model.id} -> 类型: ${modelType}, 可见: ${visibleInChat}`);
          
          return {
            id: model.id,
            name: model.id,
            type: modelType,
            visibleInChat: visibleInChat,
            rawData: model
          };
        });
        
      // 根据内存规范，采用软隐藏策略：保留所有数据但仅返回聊天模型用于UI显示
      const chatModels = models.filter(model => model.visibleInChat);
      
      console.log(`[DEBUG] 过滤后的聊天模型数量: ${chatModels.length}`);
      console.log(`[DEBUG] 过滤后的聊天模型:`, chatModels.map(m => `${m.id} (${m.type}, visible: ${m.visibleInChat})`));
      
      // 检查 Research 模型是否在过滤后的结果中
      const researchInChat = chatModels.filter(model => {
        const modelId = model.id.toLowerCase();
        return model.type === 'research' || modelId.includes('research') || modelId.includes('o3-deep') || modelId.includes('o4-mini-deep');
      });
      console.log(`[DEBUG] 过滤后的 Research 模型:`, researchInChat.map(m => m.id));
      
      // 如果筛选后没有聊天模型，返回错误
      if (chatModels.length === 0) {
        throw new AIServiceError(
          'OpenAI Responses API未返回任何可用的聊天模型',
          'openai-responses',
          404
        );
      }
      
      // 一次性调试：检查是否有 Research 模型
      const researchModels = models.filter(model => {
        const modelId = model.id.toLowerCase();
        return model.type === 'research' || modelId.includes('research') || modelId.includes('o3-deep') || modelId.includes('o4-mini-deep');
      });
      if (researchModels.length > 0) {
        console.log(`[INFO] OpenAI Responses API 发现 ${researchModels.length} 个 Research 模型:`, researchModels.map(m => m.id));
      } else {
        console.log('[INFO] OpenAI Responses API 未发现 Research 模型');
      }
      
      // 只返回聊天模型，但保持原有的简单格式以符合接口定义
      return chatModels.map(model => ({
        id: model.id,
        name: model.name
      }));
    } catch (error: any) {
      console.error('[OpenAI Responses API] 获取模型列表失败:', error.message);
      throw new AIServiceError(
        '无法获取 OpenAI 模型列表',
        'openai-responses',
        error.status,
        error
      );
    }
  }
}