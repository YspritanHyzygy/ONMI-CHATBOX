/**
 * 用户数据导出/导入相关的API路由
 */
import { Router, Request, Response } from 'express';
import { ensureDatabaseInitialized } from '../services/database-init.js';
import { resolveAuthenticatedUserId } from '../middleware/auth.js';

const router = Router();

/**
 * 清除所有用户的动态获取模型数据
 * POST /api/data/clear-models
 */
router.post('/clear-models', async (req: Request, res: Response): Promise<void> => {
  try {
    const scopedUser = resolveAuthenticatedUserId(req, req.body.userId);
    if (!scopedUser.ok) {
      res.status(scopedUser.status).json({
        success: false,
        error: scopedUser.error
      });
      return;
    }
    const userId = scopedUser.userId;

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
    const scopedUser = resolveAuthenticatedUserId(req, req.params.userId);
    if (!scopedUser.ok) {
      res.status(scopedUser.status).json({
        success: false,
        error: scopedUser.error
      });
      return;
    }
    const userId = scopedUser.userId;

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
    const scopedUser = resolveAuthenticatedUserId(req, req.params.userId);
    const { data: importData, mergeMode = 'replace' } = req.body as {
      data?: any;
      mergeMode?: 'replace' | 'merge';
    };

    if (!scopedUser.ok) {
      res.status(scopedUser.status).json({
        success: false,
        error: scopedUser.error
      });
      return;
    }
    const userId = scopedUser.userId;

    if (!importData || !importData.version || !['merge', 'replace'].includes(mergeMode)) {
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

    const importResult = await db.importUserData(userId, importData, mergeMode);
    if (importResult.error || !importResult.data) {
      res.status(400).json({
        success: false,
        error: importResult.error?.message || '导入数据失败'
      });
      return;
    }

    res.json({
      success: true,
      message: '数据导入完成',
      stats: importResult.data
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
    const scopedUser = resolveAuthenticatedUserId(req, req.params.userId);
    if (!scopedUser.ok) {
      res.status(scopedUser.status).json({
        success: false,
        error: scopedUser.error
      });
      return;
    }
    const userId = scopedUser.userId;

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
