/**
 * 用户数据导出/导入相关的API路由
 */
import { Router, Request, Response } from 'express';
import { ensureDatabaseInitialized } from '../services/database-init.js';
import { resolveAuthenticatedUserId } from '../middleware/auth.js';
import { CURRENT_DATABASE_VERSION } from '../services/database-migration.js';
import { sanitizeErrorMessage } from '../services/error-utils.js';
import type { ImportPayload } from '../services/json-database.js';

const router = Router();

function logRouteError(label: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(label, sanitizeErrorMessage(message));
}

router.get('/health', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await ensureDatabaseInitialized();
    const report = await db.getHealthReport(CURRENT_DATABASE_VERSION);
    res.json({ success: true, data: report });
  } catch (error) {
    logRouteError('Database health check failed:', error);
    res.status(503).json({ success: false, error: '数据库健康检查失败' });
  }
});

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
      logRouteError('获取用户配置失败:', getError);
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
          logRouteError(`清理${config.provider_name}模型数据失败:`, updateError);
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
    logRouteError('清理模型数据错误:', error);
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
    
    const includeCredentials = req.query['includeCredentials'] === 'true';
    const exportData = await db.exportUserData(userId, includeCredentials);

    // 设置下载头部
    const filename = `onmi-chatbox-backup-${exportData.user.username}-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.json({
      success: true,
      data: exportData
    });
  } catch (error) {
    logRouteError('Export data error:', error);
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
    const {
      data: importData,
      mergeMode = 'replace',
      confirmReplace = false,
      confirmCredentials = false
    } = req.body as {
      data?: ImportPayload;
      mergeMode?: 'replace' | 'merge';
      confirmReplace?: boolean;
      confirmCredentials?: boolean;
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

    if (mergeMode === 'replace' && confirmReplace !== true) {
      res.status(409).json({
        success: false,
        error: '覆盖导入需要明确确认',
        code: 'REPLACE_CONFIRMATION_REQUIRED'
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

    const importResult = await db.importUserData(userId, importData, mergeMode, {
      allowCredentials: confirmCredentials === true
    });
    if (importResult.error || !importResult.data) {
      const errorCode = importResult.error?.code;
      const status = errorCode === 'CREDENTIAL_CONFIRMATION_REQUIRED'
        ? 409
        : errorCode === 'NOT_FOUND'
          ? 404
          : ['INVALID_IMPORT', 'INVALID_PARAM'].includes(errorCode || '')
            ? 400
            : 500;
      res.status(status).json({
        success: false,
        error: importResult.error?.message || '导入数据失败',
        code: errorCode
      });
      return;
    }

    res.json({
      success: true,
      message: '数据导入完成',
      stats: importResult.data
    });
  } catch (error) {
    logRouteError('Import data error:', error);
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
    const { data: conversations, error: conversationsError } = await db.getConversationsByUserId(userId);
    const { data: aiProviders, error: providersError } = await db.getAIProvidersByUserId(userId);
    if (conversationsError || providersError) {
      res.status(500).json({ success: false, error: '获取预览信息失败' });
      return;
    }
    
    let totalMessages = 0;
    if (conversations) {
      for (const conv of conversations) {
        const { data: messages, error: messagesError } = await db.getMessagesByConversationId(conv.id);
        if (messagesError) {
          res.status(500).json({ success: false, error: '获取预览信息失败' });
          return;
        }
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
    logRouteError('Preview data error:', error);
    res.status(500).json({
      success: false,
      error: '获取预览信息失败'
    });
  }
});

export default router;
