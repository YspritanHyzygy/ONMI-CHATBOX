/**
 * 共享的错误处理工具
 * 提供错误消息净化等安全相关功能
 */

/**
 * 净化错误消息，移除可能包含的敏感信息（如 API key、token）
 */
export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-***')
    .replace(/key[=:]\s*["']?[a-zA-Z0-9_-]{20,}["']?/gi, 'key=***')
    .replace(/token[=:]\s*["']?[a-zA-Z0-9_-]{20,}["']?/gi, 'token=***')
    .replace(/AIza[a-zA-Z0-9_-]{30,}/g, 'AIza***')
    .replace(/Bearer\s+[a-zA-Z0-9_.-]{20,}/gi, 'Bearer ***');
}
