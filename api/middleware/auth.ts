/**
 * 认证中间件 — 基于内存 session token 的简单认证
 *
 * 登录/注册时由 auth 路由生成 token 并存入 sessionStore，
 * 后续请求通过 Authorization: Bearer <token> 头携带 token。
 */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// ── Session Store ──────────────────────────────────────────────

interface Session {
  userId: string;
  createdAt: number;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

/** token → session */
const sessionStore = new Map<string, Session>();

/** 生成 token 并关联 userId */
export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  sessionStore.set(token, { userId, createdAt: Date.now() });
  return token;
}

/** 销毁 session（用于 logout） */
export function destroySession(token: string): void {
  sessionStore.delete(token);
}

// 定期清理过期 session（每小时）
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessionStore) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessionStore.delete(token);
    }
  }
}, 60 * 60 * 1000);

// ── Express 类型扩展 ──────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      /** 经过认证中间件验证后的用户 ID */
      userId?: string;
    }
  }
}

// ── 中间件 ────────────────────────────────────────────────────

/**
 * 认证中间件：验证 Bearer token 并将 userId 挂到 req 上。
 * 放在需要认证的路由前面使用。
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: '未提供认证令牌' });
    return;
  }

  const token = authHeader.slice(7);
  const session = sessionStore.get(token);

  if (!session) {
    res.status(401).json({ success: false, error: '认证令牌无效或已过期' });
    return;
  }

  // 检查过期
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessionStore.delete(token);
    res.status(401).json({ success: false, error: '认证令牌已过期，请重新登录' });
    return;
  }

  req.userId = session.userId;
  next();
}
