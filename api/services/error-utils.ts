/**
 * 共享的错误处理工具
 * 提供错误消息净化等安全相关功能
 */

/**
 * 净化错误消息，移除可能包含的敏感信息（如 API key、token）
 */
export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/Bearer\s+[a-zA-Z0-9_.-]{20,}/gi, 'Bearer ***')
    .replace(
      /(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|password|token|secret)["']?\s*[:=]\s*["']?)(?:Bearer\s+)?([^"'\s,}&]+)/gi,
      '$1***'
    )
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-***')
    .replace(/key[=:]\s*["']?[a-zA-Z0-9_-]{20,}["']?/gi, 'key=***')
    .replace(/token[=:]\s*["']?[a-zA-Z0-9_-]{20,}["']?/gi, 'token=***')
    .replace(/AIza[a-zA-Z0-9_-]{30,}/g, 'AIza***');
}

/**
 * Convert an unknown failure into a single, sanitized log-safe line.
 *
 * Deliberately avoid serializing arbitrary error objects: SDK errors often
 * retain request headers, URLs, or response bodies that can contain provider
 * credentials and user content.
 */
export function getSafeErrorMessage(
  error: unknown,
  fallback = 'Unknown error'
): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : fallback;
  return sanitizeErrorMessage(message || fallback);
}
