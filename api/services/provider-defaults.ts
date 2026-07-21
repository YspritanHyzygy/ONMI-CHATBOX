/**
 * 各提供商默认模型与默认 Base URL 的单一事实源。
 * config-manager、ai-service-manager、providers 路由都从这里取值，
 * 避免多处硬编码随时间漂移（历史上曾同时存在三套互相矛盾的默认值）。
 *
 * 模型 ID 核对时间：2026-07（gpt-5.5 / claude-sonnet-5 / gemini-3.5-flash /
 * grok-4.5 均为当时各家现役稳定型号；更早的 gpt-4o、claude-3-5-sonnet、
 * gemini-2.0-flash-exp、grok-2-1212 已退役或即将退役）。
 */

export const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-5.5',
  claude: 'claude-sonnet-5',
  gemini: 'gemini-3.5-flash',
  xai: 'grok-4.5',
  ollama: 'qwen3'
};

export const DEFAULT_BASE_URL_BY_PROVIDER: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com',
  xai: 'https://api.x.ai/v1',
  ollama: 'http://localhost:11434'
};

/** 环境变量优先，其次落到内置默认模型 */
export function resolveDefaultModel(provider: string, envValue?: string): string {
  const trimmed = envValue?.trim();
  if (trimmed) return trimmed;
  return DEFAULT_MODEL_BY_PROVIDER[provider] || '';
}
