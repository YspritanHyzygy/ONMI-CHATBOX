/**
 * 聊天相关的API路由 - 已移除Supabase依赖，使用JSON文件存储
 * 处理对话创建、消息发送、历史记录等功能
 */
import { Router, Request, Response } from 'express';
import { jsonDatabase } from '../services/json-database.js';
import { aiServiceManager } from '../services/ai-service-manager.js';
import { AIProvider, ChatMessage } from '../services/types.js';

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

// 获取默认AI服务配置的辅助函数
function getDefaultProviderConfig(provider: string) {
  const envConfigs: Record<string, any> = {
    'openai': {
      api_key: process.env.OPENAI_API_KEY,
      base_url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      default_model: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o'
    },
    'gemini': {
      api_key: process.env.GEMINI_API_KEY,
      base_url: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
      default_model: process.env.GEMINI_DEFAULT_MODEL || 'gemini-2.5-pro'
    },
    'claude': {
      api_key: process.env.CLAUDE_API_KEY,
      base_url: process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com',
      default_model: process.env.CLAUDE_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022'
    }
  };

  const config = envConfigs[provider];
  if (config && config.api_key) {
    return config;
  }
  return null;
}

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
  } catch (error) {
    console.error('Chat conversations route error:', error);
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
    const { userId, title = '新对话' } = req.body as { userId?: string; title?: string };
    
    if (!userId) {
      res.status(400).json({
        success: false,
        error: '缺少用户ID'
      });
      return;
    }

    const db = await ensureDatabaseInitialized();
    const { data, error } = await db.from('conversations').insert({
      user_id: userId,
      title
    });

    if (error) {
      res.status(500).json({
        success: false,
        error: '创建对话失败'
      });
      return;
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
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

    // 获取用户的AI服务配置
    const { data: providerConfig, error: configError } = await db.getAIProviderConfig(userId, provider);

    let finalProviderConfig;
    if (configError || !providerConfig) {
      // 如果用户没有配置，尝试使用环境变量中的默认配置
      const defaultConfig = getDefaultProviderConfig(provider);
      if (!defaultConfig) {
        res.status(400).json({
          success: false,
          error: `请先在设置页面配置${provider}服务的API Key`
        });
        return;
      }
      finalProviderConfig = {
        api_key: defaultConfig.api_key,
        base_url: defaultConfig.base_url,
        default_model: defaultConfig.default_model
      };
    } else {
      finalProviderConfig = providerConfig;
    }

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
      
      if (stream) {
        // 流式响应
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });

        let aiResponseContent = '';
        
        for await (const chunk of aiServiceManager.streamChat(
          provider as AIProvider,
          messages,
          {
            provider: provider as AIProvider,
            apiKey: finalProviderConfig.api_key,
            baseUrl: finalProviderConfig.base_url,
            model: finalModel,
            temperature: 0.7,
            maxTokens: 2000
          }
        )) {
          aiResponseContent += chunk.content;
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
          model
        });

        res.write(`data: [DONE]\n\n`);
        res.end();
      } else {
        // 普通响应
        const aiResponse = await aiServiceManager.chat(
          provider as AIProvider,
          messages,
          {
            provider: provider as AIProvider,
            apiKey: finalProviderConfig.api_key,
            baseUrl: finalProviderConfig.base_url,
            model: finalModel,
            temperature: 0.7,
            maxTokens: 2000
          }
        );

        // 保存AI回复
        const { data: aiMessage, error: aiMessageError } = await db.from('messages').insert({
          conversation_id: conversationId,
          content: aiResponse.content,
          role: 'assistant',
          provider,
          model
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
          provider_used: provider,
          model_used: model
        }).eq('id', conversationId);

        res.json({
          success: true,
          data: {
            userMessage,
            aiMessage
          }
        });
      }
    } catch (aiError: any) {
      console.error('AI服务调用错误:', aiError);
      
      // 保存错误消息
      await db.from('messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: `抱歉，AI服务暂时不可用：${aiError.message}`,
        provider,
        model
      });

      if (stream) {
        res.write(`data: ${JSON.stringify({ error: aiError.message, done: true })}\n\n`);
        res.end();
      } else {
        res.status(500).json({
          success: false,
          error: `AI服务调用失败：${aiError.message}`
        });
      }
    }
  } catch (error) {
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
 * 简化的聊天接口 - 兼容前端调用
 * POST /api/chat
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const stream = req.query.stream === 'true';
    const { message, provider = 'openai', model = 'gpt-3.5-turbo', conversationId, userId = 'demo-user-001', parameters } = req.body as {
      message?: string;
      provider?: string;
      model?: string;
      conversationId?: string;
      userId?: string;
      parameters?: {
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        useResponsesAPI?: boolean;
        researchTools?: {
          webSearch?: boolean;
          codeInterpreter?: boolean;
          fileSearch?: boolean;
        };
        background?: boolean;
      };
    };
    
    if (!message) {
      res.status(400).json({
        success: false,
        error: '消息内容不能为空'
      });
      return;
    }

    const db = await ensureDatabaseInitialized();
    let targetConversationId = conversationId;
    
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

    // 检查是否使用 Responses API - 统一逻辑（必须在查找配置之前）
    const useResponsesAPI = parameters?.useResponsesAPI === true;
    let actualProvider = provider;
    
    // 如果启用了 Responses API，使用 openai-responses 提供商
    if (useResponsesAPI && provider === 'openai') {
      actualProvider = 'openai-responses';
      console.log('[DEBUG] 启用 Responses API，使用 openai-responses 提供商');
    }

    // 获取用户的AI服务配置，如果没有配置则使用默认配置
    let providerConfig;
    const actualUserId = targetConversationId ? userId : 'demo-user-001';
    const { data: userConfigs, error: configError } = await db.getAIProvidersByUserId(actualUserId);

    console.log(`[DEBUG] Provider from frontend: "${provider}"`);
    console.log(`[DEBUG] Actual provider to use: "${actualProvider}"`);
    console.log(`[DEBUG] Model from frontend: "${model}"`);
    console.log(`[DEBUG] Use Responses API: ${useResponsesAPI}`);
    console.log('[DEBUG] All active configs found in DB for user:', JSON.stringify(userConfigs, null, 2));

    // 在代码中进行过滤，而不是在数据库查询中
    // 对于 Responses API，我们查找 openai 的配置
    const configProviderName = actualProvider === 'openai-responses' ? 'openai' : actualProvider;
    const userConfig = userConfigs ? userConfigs.find((config: { provider_name: string }) => config.provider_name === configProviderName) : null;
    
    // 检查用户配置中的 use_responses_api 设置，如果启用则强制使用 Response API
    if (provider === 'openai' && userConfig && (userConfig as any).use_responses_api === 'true') {
      actualProvider = 'openai-responses';
      console.log('[DEBUG] 用户配置启用 Responses API，强制使用 openai-responses 提供商');
    }
    
    if (configError || !userConfig) {
      // 如果用户没有配置，尝试使用环境变量中的默认配置
      const defaultConfig = getDefaultProviderConfig(configProviderName);
      if (!defaultConfig) {
        res.status(400).json({
          success: false,
          error: `请先在设置页面配置${configProviderName}服务的API Key`
        });
        return;
      }
      providerConfig = {
        api_key: defaultConfig.api_key,
        base_url: defaultConfig.base_url,
        default_model: defaultConfig.default_model
      };
    } else {
      providerConfig = userConfig;
    }

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
    const { data: historyMessages, error: historyError } = await db.getMessagesByConversationId(targetConversationId!);

    if (!targetConversationId) {
      res.status(500).json({
        success: false,
        error: '对话 ID 为空'
      });
      return;
    }

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
      const finalModel = model || providerConfig.default_model;
      console.log(`[DEBUG] Final model being used: "${finalModel}"`);
      
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
        
        for await (const chunk of aiServiceManager.streamChat(
          actualProvider as AIProvider,
          messages,
          {
            provider: actualProvider as AIProvider,
            apiKey: providerConfig.api_key,
            baseUrl: providerConfig.base_url,
            model: finalModel,
            temperature: parameters?.temperature ?? 0.7,
            maxTokens: parameters?.maxTokens ?? 2000,
            topP: parameters?.topP ?? 1.0
          }
        )) {
          aiResponseContent += chunk.content;
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
          model
        });

        // 更新对话的最后更新时间
        await db.from('conversations').update({ 
          updated_at: new Date().toISOString(),
          provider_used: actualProvider,  // 使用实际的provider（可能是openai-responses）
          model_used: model
        }).eq('id', targetConversationId);

        res.end();
        return;
      } else {
        // 普通响应（兼容性）或 Response API 强制非流式
        const aiResponse = await aiServiceManager.chat(
          actualProvider as AIProvider,
          messages,
          {
            provider: actualProvider as AIProvider,
            apiKey: providerConfig.api_key,
            baseUrl: providerConfig.base_url,
            model: finalModel,
            temperature: parameters?.temperature ?? 0.7,
            maxTokens: parameters?.maxTokens ?? 2000,
            topP: parameters?.topP ?? 1.0
          }
        );

        // 保存AI回复
        const { data: aiMessage, error: aiMessageError } = await db.from('messages').insert({
          conversation_id: targetConversationId,
          content: aiResponse.content,
          role: 'assistant',
          provider: actualProvider,  // 使用实际的provider（可能是openai-responses）
          model
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
          provider_used: actualProvider,  // 使用实际的provider（可能是openai-responses）
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
    } catch (aiError: any) {
      console.error('AI服务调用错误:', aiError);
      
      // 保存错误消息
      try {
        await db.from('messages').insert({
          conversation_id: targetConversationId,
          role: 'assistant',
          content: `抱歉，AI服务暂时不可用：${aiError.message}`,
          provider: actualProvider,
          model
        });
      } catch (dbError) {
        console.error('保存错误消息失败:', dbError);
      }

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: `AI服务调用失败：${aiError.message}`
        });
      }
    }
  } catch (error) {
    console.error('聊天接口错误:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }
  }
});

export default router;