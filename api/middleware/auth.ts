import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { ensureDatabaseInitialized } from '../services/database-init.js';
import type { JSONDatabase } from '../services/json-database.js';
import { sanitizeErrorMessage } from '../services/error-utils.js';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      sessionId?: string;
    }
  }
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function createSession(
  userId: string,
  database?: JSONDatabase,
  ttlMs = SESSION_TTL_MS
): Promise<string> {
  const db = database || await ensureDatabaseInitialized();
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await db.createPersistentSession(userId, hashSessionToken(token), expiresAt);
  return token;
}

export async function destroySession(
  token: string,
  database?: JSONDatabase
): Promise<boolean> {
  const db = database || await ensureDatabaseInitialized();
  return db.deleteSessionByTokenHash(hashSessionToken(token));
}

export async function destroySessionById(
  sessionId: string,
  database?: JSONDatabase
): Promise<boolean> {
  const db = database || await ensureDatabaseInitialized();
  return db.deleteSessionById(sessionId);
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  return token || null;
}

/** Validate a persisted session and scope the request to its owning user. */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: '未提供认证令牌' });
    return;
  }

  try {
    const db = await ensureDatabaseInitialized();
    const session = await db.findValidSessionByTokenHash(hashSessionToken(token));
    if (!session) {
      res.status(401).json({ success: false, error: '认证令牌无效或已过期' });
      return;
    }

    req.userId = session.user_id;
    req.sessionId = session.id;
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Session validation failed:', sanitizeErrorMessage(message));
    res.status(503).json({ success: false, error: '认证服务暂时不可用' });
  }
}

export function resolveAuthenticatedUserId(req: Request, requestedUserId?: unknown) {
  const authenticatedUserId = req.userId;

  if (!authenticatedUserId) {
    return {
      ok: false as const,
      status: 401,
      error: '未认证用户'
    };
  }

  if (
    typeof requestedUserId === 'string' &&
    requestedUserId.trim() &&
    requestedUserId !== authenticatedUserId
  ) {
    return {
      ok: false as const,
      status: 403,
      error: '无权访问其他用户的数据'
    };
  }

  return {
    ok: true as const,
    userId: authenticatedUserId
  };
}
