/**
 * 用户数据导出/导入相关的API路由
 */
import { Router, Request, Response } from 'express';
import { jsonDatabase } from '../services/json-database.js';

const router = Router();

// 初始化JSON数据库
let dbInitialized = false;

async function ensureDatabaseInitialized() {
  if (!dbInitialized) {
    await jsonDatabase.init();
    dbInitialized = true;
  }
  return jsonDatabase;
}

/**
 * 清除所有用户的动态获取模型数据
 * POST /api/data/clear-models
 */
router.post('/clear-models', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({
        success: false,
        error: '用户ID不能为空'
      });
      return;
    }

    const db = await ensureDatabaseInitialized();
    
    // 获取用户的所有AI服务提供商配置
    const { data: userConfigs, error: getError } = await db.getAIProvidersByUserId(userId);
    
    if (getError) {
      console.error('获取用户配置失败:', getError);
      res.status(500).json({
        success: false,
        error: '获取用户配置失败'
      });
      return;
    }

    let clearedCount = 0;
    
    // 清空所有提供商的available_models字段
    if (userConfigs && userConfigs.length > 0) {
      for (const config of userConfigs) {
        const { error: updateError } = await db.updateAIProviderConfig(userId, config.provider_name, {
          user_id: userId,
          provider_name: config.provider_name,
          api_key: config.api_key,
          base_url: config.base_url,
          available_models: [], // 清空获取的模型列表
          default_model: config.default_model,
          is_active: config.is_active
        });
        
        if (updateError) {
          console.error(`清理${config.provider_name}模型数据失败:`, updateError);
        } else {
          clearedCount++;
        }
      }
    }
    
    res.json({
      success: true,
      message: '模型数据清理成功',
      data: {
        clearedCount
      }
    });
    
  } catch (error) {
    console.error('清理模型数据错误:', error);
    res.status(500).json({
      success: false,
      error: '清理模型数据失败'
    });
  }
});

/**
 * 导出用户数据
 * GET /api/data/export/:userId
 */
router.get('/export/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({
        success: false,
        error: '用户ID不能为空'
      });
      return;
    }

    const db = await ensureDatabaseInitialized();
    
    // 获取用户信息
    const { data: user } = await db.findUserById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        error: '用户不存在'
      });
      return;
    }

    // 获取用户的所有数据
    const { data: conversations } = await db.getConversationsByUserId(userId);
    const { data: aiProviders } = await db.getAIProvidersByUserId(userId);
    
    // 获取所有相关的消息
    const allMessages = [];
    if (conversations) {
      for (const conv of conversations) {
        const { data: messages } = await db.getMessagesByConversationId(conv.id);
        if (messages) {
          allMessages.push(...messages);
        }
      }
    }

    // 构建导出数据
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        created_at: user.created_at
      },
      conversations: conversations || [],
      messages: allMessages,
      aiProviders: aiProviders || [],
      metadata: {
        totalConversations: conversations?.length || 0,
        totalMessages: allMessages.length,
        totalAIProviders: aiProviders?.length || 0
      }
    };

    // 设置下载头部
    const filename = `gemini-chat-backup-${user.username}-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.json({
      success: true,
      data: exportData
    });
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({
      success: false,
      error: '导出数据失败'
    });
  }
});

/**
 * 导入用户数据
 * POST /api/data/import/:userId
 */
router.post('/import/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { data: importData, mergeMode = 'replace' } = req.body as {
      data?: any;
      mergeMode?: 'replace' | 'merge';
    };

    if (!userId) {
      res.status(400).json({
        success: false,
        error: '用户ID不能为空'
      });
      return;
    }

    if (!importData || !importData.version) {
      res.status(400).json({
        success: false,
        error: '导入数据格式不正确'
      });
      return;
    }

    const db = await ensureDatabaseInitialized();
    
    // 验证用户存在
    const { data: user } = await db.findUserById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        error: '用户不存在'
      });
      return;
    }

    let importStats = {
      conversations: 0,
      messages: 0,
      aiProviders: 0,
      skipped: 0,
      errors: 0
    };

    // 如果是替换模式，先清除现有数据
    if (mergeMode === 'replace') {
      // 删除现有对话和消息
      const { data: existingConversations } = await db.getConversationsByUserId(userId);
      if (existingConversations) {
        for (const conv of existingConversations) {
          await db.from('conversations').delete().eq('id', conv.id);
        }
      }
      
      // 删除现有AI提供商配置
      const { data: existingProviders } = await db.getAIProvidersByUserId(userId);
      if (existingProviders) {
        for (const provider of existingProviders) {
          await db.from('ai_providers').delete().eq('id', provider.id);
        }
      }
    }

    // 导入对话
    if (importData.conversations) {
      for (const conv of importData.conversations) {
        try {
          const { error } = await db.from('conversations').insert({
            ...conv,
            user_id: userId, // 确保用户ID正确
            id: mergeMode === 'merge' ? undefined : conv.id // merge模式下生成新ID
          });
          
          if (!error) {
            importStats.conversations++;
          } else {
            importStats.errors++;
          }
        } catch (error) {
          importStats.errors++;
        }
      }
    }

    // 导入消息
    if (importData.messages) {
      for (const message of importData.messages) {
        try {
          const { error } = await db.from('messages').insert({
            ...message,
            id: mergeMode === 'merge' ? undefined : message.id // merge模式下生成新ID
          });
          
          if (!error) {
            importStats.messages++;
          } else {
            importStats.errors++;
          }
        } catch (error) {
          importStats.errors++;
        }
      }
    }

    // 导入AI提供商配置
    if (importData.aiProviders) {
      for (const provider of importData.aiProviders) {
        try {
          const { error } = await db.from('ai_providers').insert({
            ...provider,
            user_id: userId, // 确保用户ID正确
            id: mergeMode === 'merge' ? undefined : provider.id // merge模式下生成新ID
          });
          
          if (!error) {
            importStats.aiProviders++;
          } else {
            importStats.errors++;
          }
        } catch (error) {
          importStats.errors++;
        }
      }
    }

    res.json({
      success: true,
      message: '数据导入完成',
      stats: importStats
    });
  } catch (error) {
    console.error('Import data error:', error);
    res.status(500).json({
      success: false,
      error: '导入数据失败'
    });
  }
});

/**
 * 获取导出预览信息
 * GET /api/data/preview/:userId
 */
router.get('/preview/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const db = await ensureDatabaseInitialized();
    
    // 获取用户信息
    const { data: user } = await db.findUserById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        error: '用户不存在'
      });
      return;
    }

    // 获取统计信息
    const { data: conversations } = await db.getConversationsByUserId(userId);
    const { data: aiProviders } = await db.getAIProvidersByUserId(userId);
    
    let totalMessages = 0;
    if (conversations) {
      for (const conv of conversations) {
        const { data: messages } = await db.getMessagesByConversationId(conv.id);
        totalMessages += messages?.length || 0;
      }
    }

    res.json({
      success: true,
      data: {
        user: {
          username: user.username,
          displayName: user.displayName,
          created_at: user.created_at
        },
        stats: {
          conversations: conversations?.length || 0,
          messages: totalMessages,
          aiProviders: aiProviders?.length || 0
        }
      }
    });
  } catch (error) {
    console.error('Preview data error:', error);
    res.status(500).json({
      success: false,
      error: '获取预览信息失败'
    });
  }
});

export default router;