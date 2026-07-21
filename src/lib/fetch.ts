/**
 * 带认证的 fetch 封装
 * 自动从 authStore 读取 token 并添加 Authorization header
 */
import useAuthStore from '../store/authStore';

// 整页导航/关闭时，浏览器会直接终止在途 fetch（reject 为 "Failed to fetch"），
// 但组件级 AbortController 不会触发。用该标志区分真实网络错误与页面拆除。
let pageTearingDown = false;
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', () => { pageTearingDown = true; });
  window.addEventListener('pageshow', () => { pageTearingDown = false; });
}

/**
 * 当前文档是否正在被卸载（整页导航、刷新、关闭）
 */
export function isPageTearingDown(): boolean {
  return pageTearingDown;
}

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
export async function fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...init, headers });

  if (response.status === 401 && token) {
    useAuthStore.getState().logout();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
  }

  return response;
}
