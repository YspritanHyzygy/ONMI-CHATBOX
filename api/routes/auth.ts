/**
 * 用户认证相关的API路由
 * 处理用户注册、登录等功能
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
    console.log('JSON Database initialized successfully');
  }
  return jsonDatabase;
}

/**
 * 用户注册
 * POST /api/auth/register
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, confirmPassword, displayName, email } = req.body as {
      username?: string;
      password?: string;
      confirmPassword?: string;
      displayName?: string;
      email?: string;
    };

    if (!username) {
      res.status(400).json({
        success: false,
        error: '用户名不能为空'
      });
      return;
    }

    if (!password) {
      res.status(400).json({
        success: false,
        error: '密码不能为空'
      });
      return;
    }

    // 密码强度验证
    if (password.length < 6) {
      res.status(400).json({
        success: false,
        error: '密码长度不能少于6个字符'
      });
      return;
    }

    // 确认密码验证
    if (confirmPassword && password !== confirmPassword) {
      res.status(400).json({
        success: false,
        error: '两次输入的密码不一致'
      });
      return;
    }

    // 验证用户名格式
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    if (!usernameRegex.test(username)) {
      res.status(400).json({
        success: false,
        error: '用户名必须是3-20个字符，只能包含字母、数字、下划线和破折号'
      });
      return;
    }

    const db = await ensureDatabaseInitialized();
    
    // 创建新用户
    const { data: user, error } = await db.createUser({
      username,
      password,
      displayName,
      email
    });

    if (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
      return;
    }

    res.json({
      success: true,
      user,
      message: '注册成功'
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

/**
 * 用户登录
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username) {
      res.status(400).json({
        success: false,
        error: '用户名不能为空'
      });
      return;
    }

    if (!password) {
      res.status(400).json({
        success: false,
        error: '密码不能为空'
      });
      return;
    }

    const db = await ensureDatabaseInitialized();
    
    // 验证密码
    const { data: isValid, error: validateError } = await db.validatePassword(username, password);
    
    if (validateError || !isValid) {
      res.status(401).json({
        success: false,
        error: '用户名或密码错误'
      });
      return;
    }

    // 获取用户信息
    const { data: user, error } = await db.findUserByUsername(username);

    if (error || !user) {
      res.status(404).json({
        success: false,
        error: '用户不存在'
      });
      return;
    }

    // 更新最后登录时间
    await db.updateLastLogin(user.id);

    res.json({
      success: true,
      user,
      message: '登录成功'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

/**
 * 获取用户信息
 * GET /api/auth/user/:userId
 */
router.get('/user/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const db = await ensureDatabaseInitialized();
    const { data: user, error } = await db.findUserById(userId);

    if (error || !user) {
      res.status(404).json({
        success: false,
        error: '用户不存在'
      });
      return;
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

/**
 * 检查用户名是否可用
 * GET /api/auth/check-username/:username
 */
router.get('/check-username/:username', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username } = req.params;

    const db = await ensureDatabaseInitialized();
    const { data: user } = await db.findUserByUsername(username);

    res.json({
      success: true,
      available: !user,
      message: user ? '用户名已被使用' : '用户名可用'
    });
  } catch (error) {
    console.error('Check username error:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

/**
 * 更改密码
 * POST /api/auth/change-password
 */
router.post('/change-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, currentPassword, newPassword, confirmPassword } = req.body as {
      userId?: string;
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    };

    if (!userId || !currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        error: '缺少必要参数'
      });
      return;
    }

    // 验证新密码强度
    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        error: '新密码长度不能少于6个字符'
      });
      return;
    }

    // 确认密码验证
    if (confirmPassword && newPassword !== confirmPassword) {
      res.status(400).json({
        success: false,
        error: '两次输入的新密码不一致'
      });
      return;
    }

    const db = await ensureDatabaseInitialized();
    
    // 更改密码
    const { data: user, error } = await db.changePassword(userId, currentPassword, newPassword);

    if (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
      return;
    }

    res.json({
      success: true,
      user,
      message: '密码修改成功'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

export default router;