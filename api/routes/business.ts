/**
 * 商业化功能服务 - 订阅管理、API限制等
 * 为未来的商业化版本预留接口
 */
import { Router, Request, Response } from 'express';
import { jsonDatabase } from '../services/json-database.js';

const router = Router();

// 商业化配置 - 在实际部署时通过环境变量配置
const BUSINESS_CONFIG = {
  enabled: process.env.BUSINESS_FEATURES === 'true',
  defaultPlan: 'free' as const,
  plans: {
    free: {
      apiLimits: {
        dailyRequests: 100,
        monthlyRequests: 1000,
        maxTokensPerRequest: 4000,
        concurrentRequests: 1
      },
      features: ['basic_chat', 'data_export']
    },
    pro: {
      apiLimits: {
        dailyRequests: 1000,
        monthlyRequests: 10000,
        maxTokensPerRequest: 65536,
        concurrentRequests: 5
      },
      features: ['basic_chat', 'data_export', 'data_import', 'advanced_models', 'priority_support']
    },
    enterprise: {
      apiLimits: {
        dailyRequests: -1, // 无限制
        monthlyRequests: -1,
        maxTokensPerRequest: 65536,
        concurrentRequests: 10
      },
      features: ['all']
    }
  }
};

// 初始化数据库
let dbInitialized = false;

async function ensureDatabaseInitialized() {
  if (!dbInitialized) {
    await jsonDatabase.init();
    dbInitialized = true;
  }
  return jsonDatabase;
}

/**
 * 获取用户订阅信息
 * GET /api/business/subscription/:userId
 */
router.get('/subscription/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!BUSINESS_CONFIG.enabled) {
      // 如果未启用商业化功能，返回免费计划
      res.json({
        success: true,
        data: {
          plan: 'free',
          status: 'active',
          limits: BUSINESS_CONFIG.plans.free.apiLimits,
          features: BUSINESS_CONFIG.plans.free.features
        }
      });
      return;
    }

    const db = await ensureDatabaseInitialized();
    
    // 检查用户是否存在
    const { data: user } = await db.findUserById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        error: '用户不存在'
      });
      return;
    }

    // TODO: 从数据库查询用户订阅信息
    // 当前返回默认免费计划
    res.json({
      success: true,
      data: {
        plan: BUSINESS_CONFIG.defaultPlan,
        status: 'active',
        limits: BUSINESS_CONFIG.plans[BUSINESS_CONFIG.defaultPlan].apiLimits,
        features: BUSINESS_CONFIG.plans[BUSINESS_CONFIG.defaultPlan].features
      }
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({
      success: false,
      error: '获取订阅信息失败'
    });
  }
});

/**
 * 获取API使用统计
 * GET /api/business/usage/:userId
 */
router.get('/usage/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { period: _period = 'daily' } = req.query as { period?: 'daily' | 'monthly' };

    const db = await ensureDatabaseInitialized();
    
    // 检查用户是否存在
    const { data: user } = await db.findUserById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        error: '用户不存在'
      });
      return;
    }

    // TODO: 实现实际的使用统计查询
    // 当前返回模拟数据
    
    const mockUsage = {
      current: {
        daily: 15,
        monthly: 234,
        tokens: 12500
      },
      limits: BUSINESS_CONFIG.plans.free.apiLimits,
      remaining: {
        daily: BUSINESS_CONFIG.plans.free.apiLimits.dailyRequests - 15,
        monthly: BUSINESS_CONFIG.plans.free.apiLimits.monthlyRequests - 234
      },
      resetDate: {
        daily: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        monthly: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString()
      }
    };

    res.json({
      success: true,
      data: mockUsage
    });
  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({
      success: false,
      error: '获取使用统计失败'
    });
  }
});

/**
 * 获取可用的订阅计划
 * GET /api/business/plans
 */
router.get('/plans', async (_req: Request, res: Response): Promise<void> => {
  try {
    const plans = [
      {
        id: 'free',
        name: '免费版',
        description: '个人用户基础功能',
        price: { monthly: 0, yearly: 0 },
        features: [
          '每日100次AI对话',
          '基础模型访问',
          '数据导出功能',
          '社区支持'
        ],
        limits: BUSINESS_CONFIG.plans.free.apiLimits
      },
      {
        id: 'pro',
        name: '专业版',
        description: '专业用户和团队',
        price: { monthly: 29, yearly: 290 },
        features: [
          '每日1000次AI对话',
          '所有模型访问',
          '数据导入/导出',
          '优先技术支持',
          '高级分析功能'
        ],
        limits: BUSINESS_CONFIG.plans.pro.apiLimits,
        recommended: true
      },
      {
        id: 'enterprise',
        name: '企业版',
        description: '大型团队和企业',
        price: { monthly: 99, yearly: 990 },
        features: [
          '无限AI对话',
          '企业级模型',
          '自定义部署',
          '专属客户成功经理',
          'API访问权限',
          '高级安全功能'
        ],
        limits: BUSINESS_CONFIG.plans.enterprise.apiLimits
      }
    ];

    res.json({
      success: true,
      data: plans
    });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({
      success: false,
      error: '获取订阅计划失败'
    });
  }
});

/**
 * 创建订阅会话（预留接口）
 * POST /api/business/subscribe
 */
router.post('/subscribe', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId: _userId, planId: _planId, paymentMethod: _paymentMethod } = req.body as {
      userId?: string;
      planId?: string;
      paymentMethod?: string;
    };

    if (!BUSINESS_CONFIG.enabled) {
      res.status(400).json({
        success: false,
        error: '商业化功能未启用'
      });
      return;
    }

    // TODO: 集成支付服务商（Stripe、PayPal等）
    // 当前返回模拟响应
    res.json({
      success: true,
      message: '订阅功能暂未开放，敬请期待',
      data: {
        subscriptionId: 'mock_subscription_id',
        paymentUrl: null,
        status: 'pending'
      }
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({
      success: false,
      error: '创建订阅失败'
    });
  }
});

/**
 * 生成API密钥（预留接口）
 * POST /api/business/api-keys
 */
router.post('/api-keys', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId: _userId, name: _name } = req.body as {
      userId?: string;
      name?: string;
    };

    if (!BUSINESS_CONFIG.enabled) {
      res.status(400).json({
        success: false,
        error: 'API密钥功能未启用'
      });
      return;
    }

    // TODO: 实现API密钥生成逻辑
    res.json({
      success: true,
      message: 'API密钥功能暂未开放',
      data: null
    });
  } catch (error) {
    console.error('Generate API key error:', error);
    res.status(500).json({
      success: false,
      error: '生成API密钥失败'
    });
  }
});

/**
 * 检查功能权限（中间件）
 */
export function checkFeaturePermission(_feature: string) {
  return async (req: Request, res: Response, next: any) => {
    try {
      const userId = req.body.userId || req.params.userId || req.query.userId;
      
      if (!userId) {
        res.status(401).json({
          success: false,
          error: '未提供用户ID'
        });
        return;
      }

      if (!BUSINESS_CONFIG.enabled) {
        // 如果未启用商业化功能，允许所有操作
        next();
        return;
      }

      // TODO: 检查用户订阅和权限
      // 当前允许所有操作
      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        error: '权限检查失败'
      });
    }
  };
}

/**
 * API使用量记录中间件
 */
export function recordApiUsage() {
  return async (req: Request, res: Response, next: any) => {
    // 记录API使用情况
    const startTime = Date.now();
    
    // 继续执行原始请求
    next();
    
    // 在响应完成后记录使用量（在实际项目中实现）
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      // TODO: 记录到数据库
      console.log(`API usage recorded: ${req.method} ${req.path} - ${duration}ms`);
    });
  };
}

export default router;