/**
 * 聊天相关的API路由 - 已移除Supabase依赖，使用JSON文件存储
 * 处理对话创建、消息发送、历史记录等功能
 */
import { Router, Request, Response } from 'express';
import { jsonDatabase } from '../services/json-database.js';
import { aiServiceManager } from '../services/ai-service-manager.js';
import { AIProvider, ChatMessage } from '../services/types.js';
import {
  validateChatRequest,
  validateConversationRequest
} from '../services/request-validator.js';
import {
  isAIProvider,
  isMessageRole
} from '../services/type-guards.js';
import { configManager } from '../services/config-manager.js';

const router = Router();

// 初始化JSON数据库
let dbInitialized = false;

async function ensureDatabaseInitialized() {
  if (!dbInitialized) {
    await jsonDatabase.init();
    dbInitialized = true;
    console.log('JSON Database initialized successfully');
  }
  return jsonDatabase;
}

// Note: getDefaultProviderConfig is now handled by configManager

/**
 * 获取用户的对话列表
 * GET /api/chat/conversations
 */
router.get('/conversations', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.query['userId'] as string | undefined;

    if (!userId) {
      res.status(400).json({
        success: false,
        error: '缺少用户ID'
      });
      return;
    }

    const db = await ensureDatabaseInitialized();
    const { data, error } = await db.getConversationsByUserId(userId);

    if (error) {
      console.error('JSON database conversations query error:', error);
      res.json({
        success: true,
        data: []
      });
      return;
    }

    res.json({
      success: true,
      data: data || []
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('Chat conversations route error:', errorMessage);
    res.json({
      success: true,
      data: []
    });
  }
});

/**
 * 创建新对话
 * POST /api/chat/conversations
 */
router.post('/conversations', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const validation = validateConversationRequest(req.body);
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: validation.errors.join(', ')
      });
      return;
    }

    const { userId, title = '新对话' } = validation.data!;

    const db = await ensureDatabaseInitialized();
    const result = await db.from('conversations').insert({
      user_id: userId,
      title
    });

    if (result.error || !result.data) {
      const error = result.error as { message?: string } | null;
      const errorMsg = error?.message || '创建对话失败';
      res.status(500).json({
        success: false,
        error: errorMsg
      });
      return;
    }

    res.json({
      success: true,
      data: result.data
    });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

/**
 * 获取对话的消息列表
 * GET /api/chat/conversations/:conversationId/messages
 */
router.get('/conversations/:conversationId/messages', async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId } = req.params;

    const db = await ensureDatabaseInitialized();
    const { data, error } = await db.getMessagesByConversationId(conversationId);

    if (error) {
      res.status(500).json({
        success: false,
        error: '获取消息列表失败'
      });
      return;
    }

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

/**
 * 发送消息并获取AI回复
 * POST /api/chat/conversations/:conversationId/messages
 */
router.post('/conversations/:conversationId/messages', async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId } = req.params;
    const { content, provider = 'openai', model = 'gpt-3.5-turbo', stream = false, userId } = req.body as {
      content?: string;
      provider?: string;
      model?: string;
      stream?: boolean;
      userId?: string;
      // Thinking parameters
      enableThinking?: boolean;
      thinkingBudget?: number;
      reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
      includeThoughts?: boolean;
      thoughtSignatures?: string;
    };

    if (!content) {
      res.status(400).json({
        success: false,
        error: '消息内容不能为空'
      });
      return;
    }

    if (!userId) {
      res.status(400).json({
        success: false,
        error: '缺少用户ID'
      });
      return;
    }

    const db = await ensureDatabaseInitialized();

    // 使用配置管理器查找配置
    if (!isAIProvider(provider)) {
      res.status(400).json({
        success: false,
        error: `Invalid provider: ${provider}`
      });
      return;
    }

    const configLookup = await configManager.findUserConfig(userId, provider);

    if (!configLookup.found || !configLookup.config) {
      const errorMsg = configManager.getConfigErrorMessage(provider, configLookup);
      console.error(`[ConfigManager] ${errorMsg}`);
      res.status(400).json({
        success: false,
        error: errorMsg
      });
      return;
    }

    const providerConfig = configLookup.config;

    // 验证配置
    const configValidation = configManager.validateConfig(provider, providerConfig);
    if (!configValidation.valid) {
      const errorMsg = configManager.getValidationErrorMessage(provider, configValidation);
      console.error(`[ConfigManager] ${errorMsg}`);
      res.status(400).json({
        success: false,
        error: errorMsg
      });
      return;
    }

    interface FinalProviderConfig {
      api_key: string;
      base_url: string;
      default_model: string;
    }

    const finalProviderConfig: FinalProviderConfig = {
      api_key: providerConfig.api_key,
      base_url: providerConfig.base_url,
      default_model: providerConfig.default_model
    };

    // 检查对话是否存在
    const conversations = db.from('conversations').select().data;
    const conversation = conversations?.find((conv: any) => conv.id === conversationId);

    if (!conversation) {
      console.error('对话不存在:', conversationId);
      res.status(404).json({
        success: false,
        error: '对话不存在'
      });
      return;
    }

    // 保存用户消息
    const { data: userMessage, error: userMessageError } = await db.from('messages').insert({
      conversation_id: conversationId,
      content,
      role: 'user'
    });

    if (userMessageError) {
      console.error('保存用户消息失败:', userMessageError);
      res.status(500).json({
        success: false,
        error: `保存用户消息失败: ${(userMessageError as any)?.message || '未知错误'}`
      });
      return;
    }

    // 获取对话历史消息
    const { data: historyMessages, error: historyError } = await db.getMessagesByConversationId(conversationId);

    if (historyError) {
      res.status(500).json({
        success: false,
        error: '获取历史消息失败'
      });
      return;
    }

    const messages: ChatMessage[] = historyMessages.slice(-20).map((msg: any) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content
    }));

    try {
      const finalModel = model || finalProviderConfig.default_model;
      console.log(`[DEBUG] Final model being used: "${finalModel}"`);

      // Validate provider type
      if (!isAIProvider(provider)) {
        res.status(400).json({
          success: false,
          error: `Invalid provider: ${provider}`
        });
        return;
      }

      if (stream) {
        // 流式响应
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });

        let aiResponseContent = '';
        let aiThinkingContent = '';

        for await (const chunk of aiServiceManager.streamChat(
          provider,
          messages,
          {
            provider,
            apiKey: finalProviderConfig.api_key,
            baseUrl: finalProviderConfig.base_url,
            model: finalModel,
            temperature: 0.7,
            maxTokens: undefined,  // 让Gemini使用模型最大限制
            // Thinking parameters
            enableThinking: req.body.enableThinking,
            thinkingBudget: req.body.thinkingBudget,
            reasoningEffort: req.body.reasoningEffort,
            includeThoughts: req.body.includeThoughts,
            thoughtSignatures: req.body.thoughtSignatures
          }
        )) {
          aiResponseContent += chunk.content;
          if (chunk.thinking?.content) {
            aiThinkingContent += chunk.thinking.content;
          }
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);

          if (chunk.done) {
            break;
          }
        }

        // 保存完整的AI回复
        await db.from('messages').insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: aiResponseContent,
          provider,
          model,
          has_thinking: !!aiThinkingContent,
          thinking_content: aiThinkingContent
        });

        res.write(`data: [DONE]\n\n`);
        res.end();
      } else {
        // 普通响应
        const aiResponse = await aiServiceManager.chat(
          provider,
          messages,
          {
            provider,
            apiKey: finalProviderConfig.api_key,
            baseUrl: finalProviderConfig.base_url,
            model: finalModel,
            temperature: 0.7,
            maxTokens: undefined  // 让Gemini使用模型最大限制
          }
        );

        // 保存AI回复
        const result = await db.from('messages').insert({
          conversation_id: conversationId,
          content: aiResponse.content,
          role: 'assistant',
          provider,
          model,
          has_thinking: !!aiResponse.thinking,
          thinking_content: aiResponse.thinking?.content,
          thinking_tokens: aiResponse.thinking?.tokens,
          reasoning_effort: aiResponse.thinking?.effort,
          thought_signature: aiResponse.thinking?.signature
        });

        if (result.error || !result.data) {
          const error = result.error as { message?: string } | null;
          const errorMsg = error?.message || '保存AI回复失败';
          res.status(500).json({
            success: false,
            error: errorMsg
          });
          return;
        }

        // 更新对话的最后更新时间
        await db.from('conversations').update({
          updated_at: new Date().toISOString(),
          provider_used: provider,
          model_used: model
        }).eq('id', conversationId);

        res.json({
          success: true,
          data: {
            userMessage,
            aiMessage: result.data
          }
        });
      }
    } catch (aiError: unknown) {
      const errorMessage = aiError instanceof Error ? aiError.message : '未知错误';
      console.error('AI服务调用错误:', errorMessage);

      // 保存错误消息
      await db.from('messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: `抱歉，AI服务暂时不可用：${errorMessage}`,
        provider,
        model
      });

      if (stream) {
        res.write(`data: ${JSON.stringify({ error: errorMessage, done: true })}\n\n`);
        res.end();
      } else {
        res.status(500).json({
          success: false,
          error: `AI服务调用失败：${errorMessage}`
        });
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('Route error:', errorMessage);
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

/**
 * 删除对话
 * DELETE /api/chat/conversations/:conversationId
 */
router.delete('/conversations/:conversationId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId } = req.params;

    const db = await ensureDatabaseInitialized();
    const { error } = await db.from('conversations').delete().eq('id', conversationId);

    if (error) {
      res.status(500).json({
        success: false,
        error: '删除对话失败'
      });
      return;
    }

    res.json({
      success: true,
      message: '对话删除成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

/**
 * 清理所有对话数据 - 用于开发测试
 * DELETE /api/chat/conversations
 */
router.delete('/conversations', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await ensureDatabaseInitialized();
    await (db as any).clearAllConversations();

    res.json({
      success: true,
      message: '已清理所有对话数据'
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('清理对话数据失败:', errorMessage);
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

/**
 * 简化的聊天接口 - 兼容前端调用
 * POST /api/chat
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const stream = req.query.stream === 'true';

    // Validate request body with type safety
    const requestValidation = validateChatRequest(req.body);
    if (!requestValidation.valid) {
      res.status(400).json({
        success: false,
        error: requestValidation.errors.join(', ')
      });
      return;
    }

    const { message, provider, model, conversationId, userId, parameters } = requestValidation.data!;

    // 检查是否使用 Responses API - 统一逻辑
    const useResponsesAPI = parameters?.useResponsesAPI === true;
    let actualProvider = provider;

    // 如果启用了 Responses API，使用 openai-responses 提供商
    if (useResponsesAPI && provider === 'openai') {
      actualProvider = 'openai-responses';
      console.log('[DEBUG] 启用 Responses API，使用 openai-responses 提供商');
    }

    const db = await ensureDatabaseInitialized();
    let targetConversationId: string | undefined = conversationId;

    // 如果没有提供conversationId，创建新对话
    if (!targetConversationId) {
      const demoUserId = 'demo-user-001';

      console.log(`[DEBUG] 使用演示用户ID: ${demoUserId} 代替前端用户ID: ${userId}`);

      const { data: newConversation, error: createError } = await db.from('conversations').insert({
        user_id: demoUserId,
        title: message.slice(0, 30) + (message.length > 30 ? '...' : '')
      });

      if (createError) {
        console.error('创建对话失败:', createError);
        res.status(500).json({
          success: false,
          error: `创建对话失败: ${(createError as any)?.message || '未知错误'}`
        });
        return;
      }

      targetConversationId = newConversation.id;
    }

    // 确保targetConversationId不为undefined
    if (!targetConversationId) {
      res.status(500).json({
        success: false,
        error: '无法获取对话ID'
      });
      return;
    }

    // 使用配置管理器查找配置
    const actualUserId = targetConversationId ? userId : 'demo-user-001';

    console.log(`[DEBUG] Provider from frontend: "${provider}"`);
    console.log(`[DEBUG] Model from frontend: "${model}"`);
    console.log(`[DEBUG] Use Responses API: ${useResponsesAPI}`);

    // Validate provider type
    if (!isAIProvider(provider)) {
      res.status(400).json({
        success: false,
        error: `Invalid provider: ${provider}`
      });
      return;
    }

    // 查找用户配置
    const configLookup = await configManager.findUserConfig(actualUserId, provider);

    if (!configLookup.found || !configLookup.config) {
      const errorMsg = configManager.getConfigErrorMessage(provider, configLookup);
      console.error(`[ConfigManager] ${errorMsg}`);
      res.status(400).json({
        success: false,
        error: errorMsg
      });
      return;
    }

    const providerConfig = configLookup.config;

    // 验证配置
    const configValidation = configManager.validateConfig(provider, providerConfig);
    if (!configValidation.valid) {
      const errorMsg = configManager.getValidationErrorMessage(provider, configValidation);
      console.error(`[ConfigManager] ${errorMsg}`);
      res.status(400).json({
        success: false,
        error: errorMsg
      });
      return;
    }

    // 输出警告（如果有）
    if (configValidation.warnings.length > 0) {
      configValidation.warnings.forEach((warning: string) => {
        console.warn(`[ConfigManager] ${warning}`);
      });
    }

    // 确定实际使用的提供商（可能切换到 Response API）
    actualProvider = configManager.getActualProvider(provider, providerConfig, parameters);

    console.log(`[DEBUG] Actual provider to use: "${actualProvider}"`);
    console.log(`[DEBUG] Config source: ${configLookup.source}`);

    // 保存用户消息
    const { data: userMessage, error: userMessageError } = await db.from('messages').insert({
      conversation_id: targetConversationId,
      content: message,
      role: 'user',
      provider: actualProvider,  // 使用实际的provider（可能是openai-responses）
      model: model
    });

    if (userMessageError) {
      console.error('保存用户消息失败:', userMessageError);
      res.status(500).json({
        success: false,
        error: `保存用户消息失败: ${(userMessageError as any)?.message || '未知错误'}`
      });
      return;
    }

    // 获取对话历史消息
    const { data: historyMessages, error: historyError } = await db.getMessagesByConversationId(targetConversationId);

    if (historyError) {
      res.status(500).json({
        success: false,
        error: '获取历史消息失败'
      });
      return;
    }

    // Type-safe message mapping with validation
    const messages: ChatMessage[] = historyMessages.slice(-20)
      .filter((msg: unknown) => {
        if (typeof msg !== 'object' || msg === null) return false;
        const m = msg as Record<string, unknown>;
        return isMessageRole(m.role) && typeof m.content === 'string';
      })
      .map((msg: unknown) => {
        const m = msg as { role: 'user' | 'assistant' | 'system'; content: string };
        return {
          role: m.role,
          content: m.content
        };
      });

    try {
      const finalModel = model || providerConfig.default_model;
      console.log(`[DEBUG] Final model being used: "${finalModel}"`);
      console.log(`[DEBUG] Parameters received:`, JSON.stringify(parameters, null, 2));

      // 使用配置管理器构建 AI 服务配置
      const aiConfig = configManager.toAIServiceConfig(
        actualProvider as AIProvider,
        providerConfig,
        finalModel,
        parameters
      );

      console.log(`[DEBUG] AI配置:`, JSON.stringify(aiConfig, null, 2));
      console.log(`[DEBUG] 使用的提供商: ${actualProvider}`);
      console.log(`[DEBUG] 原始提供商: ${provider}`);
      console.log(`[DEBUG] 消息数量: ${messages.length}`);

      // Response API 不支持流式响应，强制使用非流式模式
      const forceNonStream = actualProvider === 'openai-responses';
      const useStream = stream && !forceNonStream;

      if (forceNonStream && stream) {
        console.log('[DEBUG] Response API 不支持流式响应，自动切换到非流式模式');
      }

      if (useStream) {
        // 流式响应
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });

        let aiResponseContent = '';
        let aiThinkingContent = '';

        try {
          for await (const chunk of aiServiceManager.streamChat(
            actualProvider as AIProvider,
            messages,
            aiConfig
          )) {
            aiResponseContent += chunk.content;
            if (chunk.thinking?.content) {
              aiThinkingContent += chunk.thinking.content;
            }
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);

            if (chunk.done) {
              break;
            }
          }

          // 保存完整的AI回复
          await db.from('messages').insert({
            conversation_id: targetConversationId,
            content: aiResponseContent,
            role: 'assistant',
            provider: actualProvider,  // 使用实际的provider（可能是openai-responses）
            model,
            has_thinking: !!aiThinkingContent,
            thinking_content: aiThinkingContent
          });

          // 更新对话的最后更新时间
          await db.from('conversations').update({
            updated_at: new Date().toISOString(),
            provider_used: actualProvider,
            model_used: model
          }).eq('id', targetConversationId);

          res.write(`data: [DONE]\n\n`);
          res.end();
          return;
        } catch (streamError: any) {
          console.error('流式响应错误:', streamError);

          // 发送错误信息到前端
          res.write(`data: ${JSON.stringify({
            error: streamError.message,
            content: '',
            done: true
          })}\n\n`);

          // 保存错误消息到数据库
          await db.from('messages').insert({
            conversation_id: targetConversationId,
            role: 'assistant',
            content: `抱歉，AI服务暂时不可用：${streamError.message}`,
            provider: actualProvider,
            model
          });

          res.end();
          return;
        }
      } else {
        // 普通响应（兼容性）或 Response API 强制非流式
        const aiResponse = await aiServiceManager.chat(
          actualProvider as AIProvider,
          messages,
          aiConfig
        );

        // 保存AI回复
        const { data: aiMessage, error: aiMessageError } = await db.from('messages').insert({
          conversation_id: targetConversationId,
          content: aiResponse.content,
          role: 'assistant',
          provider: actualProvider,  // 使用实际的provider（可能是openai-responses）
          model,
          has_thinking: !!aiResponse.thinking,
          thinking_content: aiResponse.thinking?.content,
          thinking_tokens: aiResponse.thinking?.tokens,
          reasoning_effort: aiResponse.thinking?.effort,
          thought_signature: aiResponse.thinking?.signature
        });

        if (aiMessageError) {
          res.status(500).json({
            success: false,
            error: '保存AI回复失败'
          });
          return;
        }

        // 更新对话的最后更新时间
        await db.from('conversations').update({
          updated_at: new Date().toISOString(),
          provider_used: actualProvider,
          model_used: model
        }).eq('id', targetConversationId);

        // 如果前端期望流式响应但我们使用了非流式（Response API），模拟流式响应
        if (forceNonStream && stream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
          });

          // 模拟流式响应：将完整响应分块发送
          const words = aiResponse.content.split(' ');
          for (let i = 0; i < words.length; i++) {
            const word = words[i];
            res.write(`data: ${JSON.stringify({
              content: word + (i < words.length - 1 ? ' ' : ''),
              done: false,
              model: aiResponse.model,
              provider: actualProvider
            })}\n\n`);

            // 添加小延迟以模拟真实的流式效果
            await new Promise(resolve => setTimeout(resolve, 30));
          }

          // 发送完成信号
          res.write(`data: ${JSON.stringify({
            content: '',
            done: true,
            model: aiResponse.model,
            provider: actualProvider
          })}\n\n`);

          res.write(`data: [DONE]\n\n`);
          res.end();
        } else {
          // 标准非流式响应
          res.json({
            success: true,
            response: aiResponse.content,
            conversationId: targetConversationId,
            data: {
              userMessage,
              aiMessage
            }
          });
        }
      }
    } catch (aiError: unknown) {
      // Type-safe error handling
      const errorMessage = aiError instanceof Error ? aiError.message : '未知错误';
      console.error('AI服务调用错误:', errorMessage);

      // 保存错误消息
      try {
        await db.from('messages').insert({
          conversation_id: targetConversationId,
          role: 'assistant',
          content: `抱歉，AI服务暂时不可用：${errorMessage}`,
          provider: actualProvider,
          model
        });
      } catch (dbError) {
        const dbErrorMsg = dbError instanceof Error ? dbError.message : '未知数据库错误';
        console.error('保存错误消息失败:', dbErrorMsg);
      }

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: `AI服务调用失败：${errorMessage}`
        });
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('聊天接口错误:', errorMessage);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }
  }
});

export default router;