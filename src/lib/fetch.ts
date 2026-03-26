/**
 * 带认证的 fetch 封装
 * 自动从 authStore 读取 token 并添加 Authorization header
 */
import useAuthStore from '../store/authStore';

/**
 * 获取当前认证 token（可在非 React 上下文中使用）
 */
export function getAuthToken(): string | null {
  return useAuthStore.getState().token;
}

/**
 * 构建带认证的请求头
 */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * 带认证的 fetch — 自动注入 Authorization header
 */
export function fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, { ...init, headers });
}
