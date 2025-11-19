/**
 * 思维链适配器注册中心
 * 统一管理所有思维链适配器的注册和获取
 */

import { thinkingAdapterFactory } from './thinking-adapter-base.js';
import { OpenAIThinkingAdapter } from './openai-thinking-adapter.js';
import { ClaudeThinkingAdapter } from './claude-thinking-adapter.js';
import { GeminiThinkingAdapter } from './gemini-thinking-adapter.js';
import { OllamaThinkingAdapter } from './ollama-thinking-adapter.js';
import { AIProvider } from './types.js';

/**
 * 初始化并注册所有思维链适配器
 */
export function registerThinkingAdapters(): void {
  // 注册OpenAI适配器
  const openaiAdapter = new OpenAIThinkingAdapter();
  thinkingAdapterFactory.register('openai', openaiAdapter);
  console.log('[ThinkingAdapters] Registered OpenAI thinking adapter');
  
  // 注册Claude适配器
  const claudeAdapter = new ClaudeThinkingAdapter();
  thinkingAdapterFactory.register('claude', claudeAdapter);
  console.log('[ThinkingAdapters] Registered Claude thinking adapter');
  
  // 注册Gemini适配器
  const geminiAdapter = new GeminiThinkingAdapter();
  thinkingAdapterFactory.register('gemini', geminiAdapter);
  console.log('[ThinkingAdapters] Registered Gemini thinking adapter');
  
  // 注册Ollama适配器
  const ollamaAdapter = new OllamaThinkingAdapter();
  thinkingAdapterFactory.register('ollama', ollamaAdapter);
  console.log('[ThinkingAdapters] Registered Ollama thinking adapter');
  
  // TODO: 注册其他适配器
  
  // const grokAdapter = new GrokThinkingAdapter();
  // thinkingAdapterFactory.register('xai', grokAdapter);
}

/**
 * 获取思维链适配器
 */
export function getThinkingAdapter(provider: AIProvider) {
  return thinkingAdapterFactory.get(provider);
}

/**
 * 检查提供商是否支持思维链
 */
export function hasThinkingSupport(provider: AIProvider): boolean {
  return thinkingAdapterFactory.has(provider);
}

/**
 * 获取所有支持思维链的提供商
 */
export function getSupportedThinkingProviders(): AIProvider[] {
  return thinkingAdapterFactory.getSupportedProviders();
}

// 自动注册所有适配器
registerThinkingAdapters();
