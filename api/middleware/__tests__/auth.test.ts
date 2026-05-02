import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { resolveAuthenticatedUserId } from '../auth';

function requestWithUser(userId?: string) {
  return { userId } as Request;
}

describe('resolveAuthenticatedUserId', () => {
  it('uses the authenticated user when no client user id is supplied', () => {
    const result = resolveAuthenticatedUserId(requestWithUser('user-1'));
    expect(result).toEqual({ ok: true, userId: 'user-1' });
  });

  it('rejects cross-user client ids with 403', () => {
    const result = resolveAuthenticatedUserId(requestWithUser('user-1'), 'user-2');
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: '无权访问其他用户的数据'
    });
  });

  it('rejects missing authentication with 401', () => {
    const result = resolveAuthenticatedUserId(requestWithUser(), 'user-1');
    expect(result).toEqual({
      ok: false,
      status: 401,
      error: '未认证用户'
    });
  });
});
