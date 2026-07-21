/**
 * 扩展思考支持判定 —— 参数面板（是否显示控件）与 useChat（发送前剥除
 * 不支持模型的思维参数）共用，避免 localStorage 里残留的 enableThinking
 * 在切到不支持的模型后仍被发给后端。
 */

/** 该模型是否支持"扩展思考"（Ollama 模型动态获取，恒返回 true 并由后端优雅回退） */
export function supportsThinking(provider?: string, model?: string): boolean {
  const m = (model || '').toLowerCase();
  switch (provider) {
    case 'claude':
      return /claude-(3-7|[a-z]+-[45])/.test(m);
    case 'gemini':
      return /gemini-(2\.5|3)/.test(m);
    case 'openai':
      return /^(o[134]|gpt-5)/.test(m);
    case 'xai':
      return /grok-(3-mini|4)/.test(m);
    case 'ollama':
      return true;
    default:
      return false;
  }
}

/** 思考控制形态：budget 滑杆（Claude）、effort 分档（OpenAI/Gemini 3/grok-3-mini）、仅开关（其余） */
export function thinkingControlKind(provider?: string, model?: string): 'budget' | 'effort' | 'toggle' {
  const m = (model || '').toLowerCase();
  if (provider === 'claude') return 'budget';
  if (provider === 'openai') return 'effort';
  if (provider === 'gemini' && /^gemini-3/.test(m)) return 'effort';
  if (provider === 'xai' && /grok-3-mini/.test(m)) return 'effort';
  return 'toggle';
}

/** 发送请求前的参数净化：目标模型不支持思考时剥除思维相关字段 */
export function sanitizeThinkingParams<T extends {
  enableThinking?: boolean;
  thinkingBudget?: number;
  reasoningEffort?: string;
}>(parameters: T, provider?: string, model?: string): T {
  if (supportsThinking(provider, model)) return parameters;
  const { enableThinking: _e, thinkingBudget: _b, reasoningEffort: _r, ...rest } = parameters;
  return rest as T;
}
